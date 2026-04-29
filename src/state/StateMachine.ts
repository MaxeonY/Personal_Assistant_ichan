import type {
  AnimationPlayer,
  PlayParams,
} from '../components/Pet/AnimationPlayer';
import type {
  Coord,
  DialogCloseReason,
  DialogOpenSource,
  FacingDirection,
  MovementRequestId,
  PetEvent,
  PetFullState,
  PlayToken,
  SessionBootstrap,
  StateListener,
  StateMachineInitOptions,
  StateMachineSnapshot,
  TimestampMs,
  Unsubscribe,
} from '../components/Pet/types';
import {
  canShowHungryOverlay,
  cloneState,
  createInitialPetState,
  createStillMovement,
  isEating,
  isIdleAwake,
  isIdleDrowsy,
  isIdleNapping,
  isReminding,
  isTalking,
  resolveFallbackFacingDirection,
} from './transitions';
import {
  DEFAULT_STATE_MACHINE_TIMER_CONFIG,
  StateMachineTimers,
  type StateMachineTimerConfig,
  type TimerBackend,
} from './timers';

export interface StateMachine {
  init(player: AnimationPlayer, options?: StateMachineInitOptions): void;
  start(session: SessionBootstrap): void;
  dispatch(event: PetEvent): void;
  getState(): Readonly<PetFullState>;
  getSnapshot(): Readonly<StateMachineSnapshot>;
  subscribe(listener: StateListener): Unsubscribe;
  destroy(): void;
}

export interface PetStateMachineConfig extends Partial<StateMachineTimerConfig> {
  random?: () => number;
  timerBackend?: TimerBackend;
}

const DEFAULT_TIMER_BACKEND: TimerBackend = {
  setTimeout: (handler, timeoutMs) => window.setTimeout(handler, timeoutMs),
  clearTimeout: (handle) => window.clearTimeout(handle),
};

function createMonotonicNow(): () => TimestampMs {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return () => performance.now();
  }
  return () => Date.now();
}

export class PetStateMachine implements StateMachine {
  private player: AnimationPlayer | null = null;
  private now: () => TimestampMs = createMonotonicNow();
  private readonly random: () => number;
  private readonly timerBackend: TimerBackend;
  private readonly timerConfig: StateMachineTimerConfig;

  private readonly listeners = new Set<StateListener>();
  private readonly queuedEvents: PetEvent[] = [];
  private processingQueue = false;
  private currentAnimationToken: PlayToken | null = null;
  private pendingDialogOpen: { source: DialogOpenSource } | null = null;
  private state: PetFullState = createInitialPetState();
  private timers: StateMachineTimers;
  private nextMovementRequestId: MovementRequestId = 1;
  private destroyed = false;

  constructor(config: PetStateMachineConfig = {}) {
    this.random = config.random ?? Math.random;
    this.timerBackend = config.timerBackend ?? DEFAULT_TIMER_BACKEND;
    this.timerConfig = {
      idleTimeoutMs: config.idleTimeoutMs ?? DEFAULT_STATE_MACHINE_TIMER_CONFIG.idleTimeoutMs,
      drowsyToNapMs: config.drowsyToNapMs ?? DEFAULT_STATE_MACHINE_TIMER_CONFIG.drowsyToNapMs,
      roamingMinMs: config.roamingMinMs ?? DEFAULT_STATE_MACHINE_TIMER_CONFIG.roamingMinMs,
      roamingMaxMs: config.roamingMaxMs ?? DEFAULT_STATE_MACHINE_TIMER_CONFIG.roamingMaxMs,
    };
    this.timers = new StateMachineTimers(this.timerConfig, this.timerBackend, this.random);
  }

  public init(player: AnimationPlayer, options: StateMachineInitOptions = {}): void {
    this.player = player;
    this.now = options.now ?? createMonotonicNow();
    this.destroyed = false;
  }

  public start(session: SessionBootstrap): void {
    this.assertPlayer();
    this.destroyed = false;
    this.queuedEvents.length = 0;
    this.processingQueue = false;
    this.pendingDialogOpen = null;
    this.timers.clearAll();
    this.interruptCurrentAnimation();
    this.player!.clearCSSEffects();

    const next = createInitialPetState();
    next.flags.isHungry = this.state.flags.isHungry;
    this.commitState(next);

    if (session.isNewDay) {
      this.enterWakingUp();
      return;
    }

    this.enterIdleAwakeStill();
  }

  public dispatch(event: PetEvent): void {
    if (this.destroyed) {
      return;
    }

    this.queuedEvents.push(event);
    this.processQueuedEvents();
  }

  public getState(): Readonly<PetFullState> {
    return Object.freeze(cloneState(this.state));
  }

  public getSnapshot(): Readonly<StateMachineSnapshot> {
    return Object.freeze({
      state: this.getState(),
      currentAnimationToken: this.currentAnimationToken,
      queuedEventCount: this.queuedEvents.length,
    });
  }

  public subscribe(listener: StateListener): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public destroy(): void {
    this.destroyed = true;
    this.pendingDialogOpen = null;
    this.timers.clearAll();
    this.queuedEvents.length = 0;
    if (this.player) {
      this.player.detachCSSEffect('drowsy-breath');
      this.player.clearCSSEffects();
    }
    this.interruptCurrentAnimation();
    this.listeners.clear();
  }

  /**
   * 任务卡允许的正交 flag 更新入口。
   * 不修改主行为状态，仅同步 hungry overlay 的可见性。
   */
  private applyHungryFlag(isHungry: boolean): void {
    this.state = {
      ...this.state,
      flags: {
        ...this.state.flags,
        isHungry,
      },
    };
    this.syncHungryEffect();
    this.emitStateChanged();
  }

  public getTimerConfig(): Readonly<StateMachineTimerConfig> {
    return this.timers.getConfig();
  }

  private processQueuedEvents(): void {
    if (this.processingQueue) {
      return;
    }

    this.processingQueue = true;
    try {
      while (this.queuedEvents.length > 0 && !this.destroyed) {
        const event = this.queuedEvents.shift()!;
        this.handleEvent(event);
      }
    } finally {
      this.processingQueue = false;
    }
  }

  private handleEvent(event: PetEvent): void {
    switch (event.type) {
      case 'morningRitual.complete':
        if (this.state.lifecycle === 'waking_up') {
          this.enterIdleAwakeStill();
        }
        return;

      case 'idle.timeout':
        if (isIdleAwake(this.state)) {
          this.enterIdleDrowsy();
        }
        return;

      case 'timer.drowsyToNap':
        if (isIdleDrowsy(this.state)) {
          this.enterIdleNapping();
        }
        return;

      case 'timer.roaming.tick':
        this.handleRoamingTick();
        return;

      case 'user.pat':
        this.handleUserPat();
        return;

      case 'user.doubleClick':
        // B2-9 K6: notification-only. State transitions moved to dialog.open.
        return;

      case 'dialog.open':
        this.handleDialogOpen(event.source);
        return;

      case 'dialog.close':
        this.handleDialogClose(event.reason);
        return;

      case 'user.feed':
        this.handleUserFeed();
        return;

      case 'reminder.due':
        this.handleReminderDue(event.target);
        return;

      case 'reminder.dismiss':
        if (isReminding(this.state)) {
          this.enterIdleAwakeStill();
        }
        return;

      case 'movement.arrive':
        this.handleMovementArrive(event.requestId);
        return;

      case 'hungry.set':
        this.applyHungryFlag(event.value);
        return;

      case 'user.exit':
        if (this.state.lifecycle === 'alive' || this.state.lifecycle === 'waking_up') {
          this.enterFarewell();
        }
        return;

      default:
        return;
    }
  }

  private handleRoamingTick(): void {
    if (!isIdleAwake(this.state)) {
      return;
    }

    if (this.state.movement.state === 'targeted_move') {
      return;
    }

    if (this.state.movement.state === 'still') {
      const direction: FacingDirection = this.random() < 0.5 ? 'left' : 'right';
      this.enterIdleAwakeRoaming(direction);
      return;
    }

    if (this.state.movement.state === 'roaming') {
      this.enterIdleAwakeStill();
    }
  }

  private handleUserPat(): void {
    if (this.state.lifecycle !== 'alive') {
      return;
    }

    if (isEating(this.state) || isReminding(this.state)) {
      return;
    }

    if (isIdleNapping(this.state)) {
      return;
    }

    if (isIdleDrowsy(this.state)) {
      this.handleDrowsySoftInterruptToHappy();
      return;
    }

    if (isTalking(this.state)) {
      this.enterHappyThenIdleAwake();
      return;
    }

    if (isIdleAwake(this.state)) {
      this.enterHappyThenIdleAwake();
    }
  }

  private handleDialogOpen(source: DialogOpenSource): void {
    void source;

    if (this.state.lifecycle !== 'alive') {
      console.warn('[StateMachine] dialog.open ignored: lifecycle=%s', this.state.lifecycle);
      return;
    }

    if (isTalking(this.state)) {
      // talking + dialog.open: duplicate-open request, ignore silently.
      return;
    }

    if (isIdleDrowsy(this.state)) {
      this.pendingDialogOpen = { source };
      this.handleDrowsySoftInterruptToTalking();
      return;
    }

    if (isIdleNapping(this.state)) {
      this.pendingDialogOpen = { source };
      this.transitionFromNappingWithWake(() => {
        if (!this.pendingDialogOpen) {
          return;
        }
        this.pendingDialogOpen = null;
        this.enterTalkingLoop();
      });
      return;
    }

    if (isIdleAwake(this.state)) {
      this.pendingDialogOpen = null;
      this.enterTalkingLoop();
      return;
    }

    console.warn('[StateMachine] dialog.open ignored: major=%s', this.state.major);
  }

  private handleDialogClose(reason: DialogCloseReason): void {
    void reason;

    if (isTalking(this.state)) {
      this.pendingDialogOpen = null;
      this.enterIdleAwakeStill();
      return;
    }

    console.warn(
      '[StateMachine] dialog.close ignored: major=%s idleSub=%s',
      this.state.major,
      this.state.idleSub ?? 'none',
    );
  }

  private handleUserFeed(): void {
    if (this.state.lifecycle !== 'alive') {
      return;
    }

    this.pendingDialogOpen = null;
    this.applyHungryFlag(false);

    if (isIdleNapping(this.state)) {
      this.transitionFromNappingWithWake(() => {
        this.enterEatingThenHappy();
      });
      return;
    }

    this.player!.clearCSSEffects();
    this.enterEatingThenHappy();
  }

  private handleReminderDue(target: Coord): void {
    if (this.state.lifecycle !== 'alive') {
      return;
    }

    this.pendingDialogOpen = null;
    if (isIdleNapping(this.state)) {
      this.transitionFromNappingWithWake(() => {
        this.enterRemindingLoopStill();
      });
      return;
    }

    this.player!.clearCSSEffects();
    this.enterTargetedReminder(target);
  }

  private handleMovementArrive(requestId: MovementRequestId): void {
    if (this.state.movement.state !== 'targeted_move') {
      return;
    }

    if (requestId !== this.state.movement.requestId) {
      return;
    }

    this.enterRemindingLoopStill();
  }

  private enterWakingUp(): void {
    this.timers.clearAll();
    this.player!.detachCSSEffect('drowsy-breath');

    this.commitState({
      lifecycle: 'waking_up',
      major: 'idle',
      idleSub: 'awake',
      movement: createStillMovement(),
      flags: { ...this.state.flags },
    });

    const token = this.playAnimation({
      state: 'wake.day_start',
      intent: 'oneshot',
      onComplete: (tok) => {
        if (tok !== token || tok !== this.currentAnimationToken) {
          return;
        }
        this.currentAnimationToken = null;
        this.dispatch({ type: 'morningRitual.complete' });
      },
    });

    this.currentAnimationToken = token;
    this.emitStateChanged();
  }

  private enterIdleAwakeStill(): void {
    this.player!.detachCSSEffect('drowsy-breath');
    this.commitState({
      lifecycle: 'alive',
      major: 'idle',
      idleSub: 'awake',
      movement: createStillMovement(),
      flags: { ...this.state.flags },
    });

    const token = this.playAnimation({
      state: 'idle.awake',
      intent: 'loop',
    });
    this.currentAnimationToken = token;

    this.timers.clearAll();
    this.timers.restartIdleTimeout(() => this.dispatch({ type: 'idle.timeout' }));
    this.timers.restartRoamingTick(() => this.dispatch({ type: 'timer.roaming.tick' }));
    this.emitStateChanged();
  }

  private enterIdleAwakeRoaming(direction: FacingDirection): void {
    this.player!.detachCSSEffect('drowsy-breath');
    this.commitState({
      lifecycle: 'alive',
      major: 'idle',
      idleSub: 'awake',
      movement: {
        state: 'roaming',
        direction,
        target: null,
        requestId: null,
      },
      flags: { ...this.state.flags },
    });

    const token = this.playAnimation({
      state: 'walk.roaming',
      intent: 'loop',
      variant: direction,
    });
    this.currentAnimationToken = token;

    this.timers.clearDrowsyToNap();
    this.timers.restartIdleTimeout(() => this.dispatch({ type: 'idle.timeout' }));
    this.timers.restartRoamingTick(() => this.dispatch({ type: 'timer.roaming.tick' }));
    this.emitStateChanged();
  }

  private enterIdleDrowsy(): void {
    this.timers.clearAll();
    this.player!.detachCSSEffect('drowsy-breath');

    this.commitState({
      lifecycle: 'alive',
      major: 'idle',
      idleSub: 'drowsy',
      movement: createStillMovement(),
      flags: { ...this.state.flags },
    });

    const token = this.playAnimation({
      state: 'idle.drowsy',
      intent: 'enter',
      onComplete: (tok) => {
        if (tok !== token || tok !== this.currentAnimationToken) {
          return;
        }
        this.player!.attachCSSEffect('drowsy-breath');
        const loopToken = this.playAnimation({
          state: 'idle.drowsy',
          intent: 'loop',
        });
        this.currentAnimationToken = loopToken;
        this.timers.restartDrowsyToNap(() => this.dispatch({ type: 'timer.drowsyToNap' }));
        this.emitStateChanged();
      },
    });

    this.currentAnimationToken = token;
    this.emitStateChanged();
  }

  private enterIdleNapping(): void {
    this.timers.clearAll();
    this.player!.detachCSSEffect('drowsy-breath');

    this.commitState({
      lifecycle: 'alive',
      major: 'idle',
      idleSub: 'napping',
      movement: createStillMovement(),
      flags: { ...this.state.flags },
    });

    const enterToken = this.playAnimation({
      state: 'idle.napping',
      intent: 'enter',
      onComplete: (tok) => {
        if (tok !== enterToken || tok !== this.currentAnimationToken) {
          return;
        }
        const loopToken = this.playAnimation({
          state: 'idle.napping',
          intent: 'loop',
        });
        this.currentAnimationToken = loopToken;
        this.emitStateChanged();
      },
    });

    this.currentAnimationToken = enterToken;
    this.emitStateChanged();
  }

  private handleDrowsySoftInterruptToHappy(): void {
    this.timers.clearAll();
    this.player!.detachCSSEffect('drowsy-breath');

    const exitToken = this.playAnimation({
      state: 'idle.drowsy',
      intent: 'exit',
      onComplete: (tok) => {
        if (tok !== exitToken || tok !== this.currentAnimationToken) {
          return;
        }
        this.enterHappyThenIdleAwake();
      },
    });

    this.currentAnimationToken = exitToken;
    this.emitStateChanged();
  }

  private handleDrowsySoftInterruptToTalking(): void {
    this.timers.clearAll();
    this.player!.detachCSSEffect('drowsy-breath');

    const exitToken = this.playAnimation({
      state: 'idle.drowsy',
      intent: 'exit',
      onComplete: (tok) => {
        if (tok !== exitToken || tok !== this.currentAnimationToken) {
          return;
        }
        if (!this.pendingDialogOpen) {
          return;
        }
        this.pendingDialogOpen = null;
        this.enterTalkingLoop();
      },
    });

    this.currentAnimationToken = exitToken;
    this.emitStateChanged();
  }

  private transitionFromNappingWithWake(onAwake: () => void): void {
    this.timers.clearAll();
    this.player!.clearCSSEffects();

    const wakeToken = this.playAnimation({
      state: 'wake.from_nap',
      intent: 'oneshot',
      onComplete: (tok) => {
        if (tok !== wakeToken || tok !== this.currentAnimationToken) {
          return;
        }
        this.currentAnimationToken = null;
        onAwake();
      },
    });

    this.currentAnimationToken = wakeToken;
    this.emitStateChanged();
  }

  private enterTalkingLoop(): void {
    this.timers.clearAll();
    this.player!.detachCSSEffect('drowsy-breath');

    this.commitState({
      lifecycle: 'alive',
      major: 'talking',
      movement: createStillMovement(),
      flags: { ...this.state.flags },
    });

    const token = this.playAnimation({
      state: 'talking',
      intent: 'loop',
    });
    this.currentAnimationToken = token;
    this.emitStateChanged();
  }

  private enterEatingThenHappy(): void {
    this.timers.clearAll();
    this.player!.detachCSSEffect('drowsy-breath');

    this.commitState({
      lifecycle: 'alive',
      major: 'eating',
      movement: createStillMovement(),
      flags: { ...this.state.flags },
    });

    const eatToken = this.playAnimation({
      state: 'eating',
      intent: 'oneshot',
      onComplete: (tok) => {
        if (tok !== eatToken || tok !== this.currentAnimationToken) {
          return;
        }
        this.enterHappyThenIdleAwake();
      },
    });

    this.currentAnimationToken = eatToken;
    this.emitStateChanged();
  }

  private enterHappyThenIdleAwake(): void {
    this.timers.clearAll();
    this.player!.detachCSSEffect('drowsy-breath');

    this.commitState({
      lifecycle: 'alive',
      major: 'happy',
      movement: createStillMovement(),
      flags: { ...this.state.flags },
    });

    const happyToken = this.playAnimation({
      state: 'happy',
      intent: 'oneshot',
      onComplete: (tok) => {
        if (tok !== happyToken || tok !== this.currentAnimationToken) {
          return;
        }
        this.enterIdleAwakeStill();
      },
    });

    this.currentAnimationToken = happyToken;
    this.emitStateChanged();
  }

  private enterTargetedReminder(target: Coord): void {
    this.timers.clearAll();
    this.player!.detachCSSEffect('drowsy-breath');

    // TODO(architect): 当前状态机接口未携带“当前位置”，定向位移朝向只能用 target.x 的符号做退化推断；
    // 集成 movement utility 时建议补充当前位置输入，避免默认方向长期偏右。
    const direction = this.resolveTargetedDirection(target);
    const requestId = this.nextMovementRequestId++;

    this.commitState({
      lifecycle: 'alive',
      major: 'reminding',
      movement: {
        state: 'targeted_move',
        direction,
        target: { ...target },
        requestId,
      },
      flags: { ...this.state.flags },
    });

    const token = this.playAnimation({
      state: 'walk.targeted',
      intent: 'loop',
      variant: direction,
    });
    this.currentAnimationToken = token;
    this.emitStateChanged();
  }

  private enterRemindingLoopStill(): void {
    this.timers.clearAll();
    this.player!.detachCSSEffect('drowsy-breath');

    this.commitState({
      lifecycle: 'alive',
      major: 'reminding',
      movement: createStillMovement(),
      flags: { ...this.state.flags },
    });

    const token = this.playAnimation({
      state: 'reminding',
      intent: 'loop',
    });
    this.currentAnimationToken = token;
    this.emitStateChanged();
  }

  private enterFarewell(): void {
    this.timers.clearAll();
    this.player!.clearCSSEffects();

    this.commitState({
      lifecycle: 'farewell',
      major: 'idle',
      idleSub: 'awake',
      movement: createStillMovement(),
      flags: { ...this.state.flags },
    });

    const farewellToken = this.playAnimation({
      state: 'farewell',
      intent: 'oneshot',
      onComplete: (tok) => {
        if (tok !== farewellToken || tok !== this.currentAnimationToken) {
          return;
        }
        this.currentAnimationToken = null;
        this.timers.clearAll();
        this.commitState({
          lifecycle: 'deep_sleep',
          major: 'idle',
          idleSub: 'awake',
          movement: createStillMovement(),
          flags: { ...this.state.flags },
        });
        this.emitStateChanged();
      },
    });

    this.currentAnimationToken = farewellToken;
    this.emitStateChanged();
  }

  private resolveTargetedDirection(target: Coord): FacingDirection {
    if (target.x < 0) {
      return 'left';
    }
    if (target.x > 0) {
      return 'right';
    }
    if (this.state.movement.direction) {
      return this.state.movement.direction;
    }
    return resolveFallbackFacingDirection(target.x);
  }

  private playAnimation<S extends PlayParams['state']>(params: PlayParams<S>): PlayToken {
    this.assertPlayer();
    this.interruptCurrentAnimation();
    const nextParams: PlayParams<S> = {
      ...params,
      startAtMs: params.startAtMs ?? this.now(),
    };
    return this.player!.play(nextParams);
  }

  private interruptCurrentAnimation(): void {
    if (!this.player) {
      this.currentAnimationToken = null;
      return;
    }

    if (this.currentAnimationToken !== null) {
      this.player.interrupt(this.currentAnimationToken);
      this.currentAnimationToken = null;
    }
  }

  private commitState(nextState: PetFullState): void {
    this.state = cloneState(nextState);
    this.syncHungryEffect();
    if (this.state.lifecycle !== 'alive' || this.state.major !== 'idle') {
      this.player?.detachCSSEffect('drowsy-breath');
    }
  }

  private syncHungryEffect(): void {
    if (!this.player) {
      return;
    }

    if (canShowHungryOverlay(this.state)) {
      this.player.playOverlay('hungry', 'loop');
      return;
    }

    this.player.playOverlay('hungry', 'exit');
  }

  private emitStateChanged(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot.state, snapshot);
    }
  }

  private assertPlayer(): void {
    if (!this.player) {
      throw new Error('StateMachine.init(player) must be called before start() or dispatch().');
    }
  }
}
