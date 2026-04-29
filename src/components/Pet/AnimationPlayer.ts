import {
  getPinnedSheet,
  getPinnedSheetUrl,
  getSpriteSheetDefinition,
  preloadAllSheets,
  type SpriteSheetKey,
} from './spritesheetLoader';
import { resolveSequenceDefinition, type ResolvedSequenceDefinition } from './sequences';
import type {
  CSSEffect,
  FrameInfo,
  Intent,
  OverlayAnimation,
  OverlayIntent,
  PetState,
  PlaybackVariant,
  PlayToken,
  SupportedIntent,
  SupportedVariant,
  TimestampMs,
} from './types';

/**
 * 播放的入参对象。
 */
export interface PlayParams<S extends PetState = PetState> {
  /** 播放的公共状态名 */
  state: S;

  /** 该状态下允许的 intent */
  intent: SupportedIntent<S>;

  /**
   * 视觉变体。
   * 非 walk.* 状态必须为 'default' 或省略；
   * walk.roaming / walk.targeted 使用 'left' / 'right'。
   *
   * 注：walk.targeted 的 'left' 推荐由播放器内部实现为
   *     'right' spritesheet + CSS scaleX(-1) 镜像（参考 v4 验证页）。
   */
  variant?: SupportedVariant<S>;

  /** 起始时刻；未传则使用当前时钟 */
  startAtMs?: TimestampMs;

  /**
   * 帧时长覆盖。
   * 未传则使用 animation_resources.md 该序列的默认节奏。
   */
  frameDurationOverrideMs?: number;

  /**
   * 非 loop intent 完成时触发。
   * 回调内必须做 token 代际校验。
   */
  onComplete?: (token: PlayToken) => void;

  /** 每帧触发；仅供观察，禁止在此修改状态机 */
  onFrame?: (frame: FrameInfo, token: PlayToken) => void;
}

export interface AnimationPlayerSnapshot {
  currentToken: PlayToken;
  isPlaying: boolean;
  currentState: PetState | null;
  currentIntent: Intent | null;
  currentVariant: PlaybackVariant | null;
  currentFrameName: string | null;
  attachedEffects: readonly CSSEffect[];
}

/**
 * AnimationPlayer 对外契约。
 */
export interface AnimationPlayer {
  /** 启动时一次性加载并 pin 全部 spritesheet */
  preloadAll(): Promise<void>;

  /**
   * 播放新序列并返回新代 token。
   * 调用即视为进入新一代：旧 token 的所有 pending 回调必须失效。
   */
  play<S extends PetState>(params: PlayParams<S>): PlayToken;

  /** 显式作废 token（打断的唯一合法路径） */
  interrupt(token: PlayToken): void;

  /** 挂载 CSS 微效果；允许多个并存 */
  attachCSSEffect(effect: CSSEffect): void;

  /** 卸载指定 CSS 微效果 */
  detachCSSEffect(effect: CSSEffect): void;

  /** 播放指定 overlay（enter/loop/exit） */
  playOverlay(overlay: OverlayAnimation, intent: OverlayIntent): void;

  /** 停止指定 overlay（语义上等价于触发其退出） */
  stopOverlay(overlay: OverlayAnimation): void;

  /** 一次性清空全部 CSS 微效果 */
  clearCSSEffects(): void;

  /** 获取当前活动 token */
  getCurrentToken(): PlayToken;

  /**
   * 查询是否在播放。
   * - 不传 token：是否有任何活动播放
   * - 传 token：该 token 是否仍是当前代
   */
  isPlaying(token?: PlayToken): boolean;

  /** 获取只读快照 */
  getSnapshot(): Readonly<AnimationPlayerSnapshot>;
}

export interface AnimationPlayerOptions {
  /** 用于挂载播放器的根元素；CSS 效果 class 也挂在此元素上 */
  rootElement: HTMLElement;

  /** spritesheet 根目录。默认使用相对路径 `assets` */
  assetRoot?: string;

  /** 目标显示高度；未传则按 metadata 原始高度渲染 */
  targetDisplayHeightPx?: number;

  /** 可注入时钟，方便 demo 或测试 */
  now?: () => number;

  /** 可注入 requestAnimationFrame，方便测试 */
  requestAnimationFrameImpl?: (callback: FrameRequestCallback) => number;

  /** 可注入 cancelAnimationFrame，方便测试 */
  cancelAnimationFrameImpl?: (handle: number) => void;
}

type CommonPlaybackState = {
  readonly token: PlayToken;
  readonly state: PetState;
  readonly intent: Intent;
  readonly variant: PlaybackVariant;
  readonly definition: ResolvedSequenceDefinition;
  readonly frameDurationMs: number;
  readonly startedAtMs: number;
  readonly onComplete?: (token: PlayToken) => void;
  readonly onFrame?: (frame: FrameInfo, token: PlayToken) => void;
  nextFrameAtMs: number;
};

type SimplePlaybackState = CommonPlaybackState & {
  kind: 'simple';
  frameCursor: number;
};

type AwakeLoopPlaybackState = CommonPlaybackState & {
  kind: 'awakeLoop';
  floatCursor: number;
  blinkCursor: number;
  isBlinking: boolean;
  nextBlinkAtMs: number;
};

type ActivePlaybackState = SimplePlaybackState | AwakeLoopPlaybackState;

type HungryOverlayPlaybackState = {
  readonly phase: OverlayIntent;
  readonly startedAtMs: number;
  readonly frameDurationMs: number;
  nextFrameAtMs: number;
  frameCursor: number;
};

const ROOT_CLASS = 'ichan-pet-root';
const MOTION_LAYER_CLASS = 'ichan-pet-motion-layer';
const SPRITE_LAYER_CLASS = 'ichan-pet-sprite';
const HUNGRY_OVERLAY_LAYER_CLASS = 'ichan-pet-hungry-overlay';
const MIRRORED_CLASS = 'is-mirrored';

const HUNGRY_OVERLAY_ENTER_FRAMES = ['hungry_overlay_base_01', 'hungry_overlay_base_02'] as const;
const HUNGRY_OVERLAY_LOOP_FRAMES = [
  'hungry_overlay_base_02',
  'hungry_overlay_shake_01',
  'hungry_overlay_shake_02',
  'hungry_overlay_weak_01',
  'hungry_overlay_shake_02',
  'hungry_overlay_shake_01',
  'hungry_overlay_base_02',
] as const;
const HUNGRY_OVERLAY_EXIT_FRAMES = ['hungry_overlay_recover_01'] as const;
// Engine constant, do not tune
const MAX_FRAME_ADVANCE_PER_TICK = 4;
// Engine constant, do not tune
const MAX_ALLOWED_START_AHEAD_MS = 250;

/**
 * 基于 spritesheet + background-position 的正式播放器实现。
 *
 * 设计要点：
 * - 播放器核心逻辑不依赖 React
 * - spritesheet 预加载在模块作用域 pin 引用
 * - 切帧仅修改 background-position
 * - drowsy-breath 仍是纯 CSS 效果
 * - hungry-overlay 升级为“使用现有 hungry 素材的独立 overlay 层”
 */
export class SpriteAnimationPlayer implements AnimationPlayer {
  private readonly rootElement: HTMLElement;
  private readonly motionLayer: HTMLDivElement;
  private readonly spriteLayer: HTMLDivElement;
  private readonly hungryOverlayLayer: HTMLDivElement;
  private readonly assetRoot: string;
  private readonly targetDisplayHeightPx?: number;
  private readonly now: () => number;
  private readonly requestAnimationFrameImpl: (callback: FrameRequestCallback) => number;
  private readonly cancelAnimationFrameImpl: (handle: number) => void;

  private currentToken: PlayToken = 0;
  private issuedToken: PlayToken = 0;
  private activePlayback: ActivePlaybackState | null = null;
  private hungryOverlayPlayback: HungryOverlayPlaybackState | null = null;
  private currentFrameName: string | null = null;
  private currentState: PetState | null = null;
  private currentIntent: Intent | null = null;
  private currentVariant: PlaybackVariant | null = null;
  private currentSheetKey: string | null = null;
  private rafHandle: number | null = null;
  private preloaded = false;
  private readonly attachedEffects = new Set<CSSEffect>();
  private readonly activeOverlays = new Set<OverlayAnimation>();

  constructor(options: AnimationPlayerOptions) {
    this.rootElement = options.rootElement;
    this.assetRoot = options.assetRoot ?? 'assets';
    this.targetDisplayHeightPx = options.targetDisplayHeightPx;
    this.now = options.now ?? (() => performance.now());
    this.requestAnimationFrameImpl =
      options.requestAnimationFrameImpl ??
      ((callback: FrameRequestCallback) => window.requestAnimationFrame(callback));
    this.cancelAnimationFrameImpl =
      options.cancelAnimationFrameImpl ??
      ((handle: number) => window.cancelAnimationFrame(handle));

    this.rootElement.classList.add(ROOT_CLASS);

    const existingMotionLayer = this.rootElement.querySelector<HTMLDivElement>(`.${MOTION_LAYER_CLASS}`);
    const existingSpriteLayer = this.rootElement.querySelector<HTMLDivElement>(`.${SPRITE_LAYER_CLASS}`);
    const existingHungryOverlayLayer = this.rootElement.querySelector<HTMLDivElement>(`.${HUNGRY_OVERLAY_LAYER_CLASS}`);

    if (existingMotionLayer && existingSpriteLayer) {
      this.motionLayer = existingMotionLayer;
      this.spriteLayer = existingSpriteLayer;
      this.hungryOverlayLayer = existingHungryOverlayLayer ?? document.createElement('div');
    } else {
      this.motionLayer = document.createElement('div');
      this.motionLayer.className = MOTION_LAYER_CLASS;

      this.spriteLayer = document.createElement('div');
      this.spriteLayer.className = SPRITE_LAYER_CLASS;
      this.motionLayer.appendChild(this.spriteLayer);

      this.hungryOverlayLayer = document.createElement('div');
      this.motionLayer.appendChild(this.hungryOverlayLayer);

      this.rootElement.appendChild(this.motionLayer);
    }

    this.hungryOverlayLayer.className = HUNGRY_OVERLAY_LAYER_CLASS;
    if (!this.hungryOverlayLayer.parentElement) {
      this.motionLayer.appendChild(this.hungryOverlayLayer);
    }

    this.spriteLayer.style.backgroundRepeat = 'no-repeat';
    this.spriteLayer.style.backgroundPosition = '0px 0px';
    this.spriteLayer.style.imageRendering = 'pixelated';
    this.spriteLayer.style.willChange = 'background-position';

    this.hungryOverlayLayer.style.backgroundRepeat = 'no-repeat';
    this.hungryOverlayLayer.style.backgroundPosition = '0px 0px';
    this.hungryOverlayLayer.style.imageRendering = 'pixelated';
    this.hungryOverlayLayer.style.willChange = 'background-position, opacity';
    this.hungryOverlayLayer.style.opacity = '0';
  }

  /**
   * 启动时一次性加载并 pin 全部 spritesheet。
   */
  public async preloadAll(): Promise<void> {
    await preloadAllSheets({ assetRoot: this.assetRoot });
    this.preloaded = true;
  }

  /**
   * 播放新序列并返回新代 token。
   */
  public play<S extends PetState>(params: PlayParams<S>): PlayToken {
    const variant = (params.variant ?? 'default') as PlaybackVariant;
    const definition = resolveSequenceDefinition(params.state, params.intent, variant);
    const token = ++this.issuedToken;
    const now = this.now();
    const startAtMs = this.normalizeStartAtMs(params.startAtMs, now);

    this.stopActivePlayback();

    this.currentToken = token;
    this.currentState = params.state;
    this.currentIntent = params.intent;
    this.currentVariant = variant;

    this.applySheet(definition.sheetKey);
    this.applyMirror(Boolean(definition.mirrorX));
    this.syncHungryOverlayMetrics();

    const commonState = {
      token,
      state: params.state,
      intent: params.intent,
      variant,
      definition,
      frameDurationMs: params.frameDurationOverrideMs ?? definition.defaultFrameDurationMs,
      startedAtMs: startAtMs,
      onComplete: params.onComplete,
      onFrame: params.onFrame,
      nextFrameAtMs: startAtMs,
    } satisfies CommonPlaybackState;

    if (definition.runtimeMode === 'awakeLoop') {
      this.activePlayback = {
        ...commonState,
        kind: 'awakeLoop',
        floatCursor: 0,
        blinkCursor: 0,
        isBlinking: false,
        nextBlinkAtMs: this.nextBlinkDeadline(startAtMs, definition),
      };
    } else {
      this.activePlayback = {
        ...commonState,
        kind: 'simple',
        frameCursor: 0,
      };
    }

    this.ensureTicking();
    return token;
  }

  /**
   * 显式作废 token（打断的唯一合法路径）。
   */
  public interrupt(token: PlayToken): void {
    if (!this.activePlayback) {
      return;
    }
    if (token !== this.currentToken) {
      return;
    }
    this.stopActivePlayback();
  }

  /**
   * 挂载 CSS 微效果。
   */
  public attachCSSEffect(effect: CSSEffect): void {
    if (this.attachedEffects.has(effect)) {
      return;
    }
    this.attachedEffects.add(effect);
    this.rootElement.classList.add(this.effectClassName(effect));
  }

  /**
   * 卸载指定 CSS 微效果。
   */
  public detachCSSEffect(effect: CSSEffect): void {
    if (!this.attachedEffects.has(effect)) {
      return;
    }
    this.attachedEffects.delete(effect);
    this.rootElement.classList.remove(this.effectClassName(effect));
  }

  public playOverlay(overlay: OverlayAnimation, intent: OverlayIntent): void {
    if (overlay !== 'hungry') {
      return;
    }

    if (intent === 'exit') {
      if (!this.activeOverlays.has(overlay)) {
        return;
      }
      this.activeOverlays.delete(overlay);
      this.rootElement.classList.remove(this.effectClassName('hungry-overlay'));
      this.startHungryOverlayExit();
      return;
    }

    if (this.activeOverlays.has(overlay)) {
      return;
    }
    this.activeOverlays.add(overlay);
    this.rootElement.classList.add(this.effectClassName('hungry-overlay'));
    this.startHungryOverlay();
  }

  public stopOverlay(overlay: OverlayAnimation): void {
    if (overlay !== 'hungry') {
      return;
    }
    if (!this.activeOverlays.has(overlay)) {
      return;
    }
    this.activeOverlays.delete(overlay);
    this.rootElement.classList.remove(this.effectClassName('hungry-overlay'));
    this.startHungryOverlayExit();
  }

  /**
   * 一次性清空全部 CSS 微效果。
   */
  public clearCSSEffects(): void {
    for (const effect of this.attachedEffects) {
      this.rootElement.classList.remove(this.effectClassName(effect));
    }
    this.attachedEffects.clear();
    this.rootElement.classList.remove(this.effectClassName('hungry-overlay'));
    this.activeOverlays.clear();
    this.stopHungryOverlay(true);
  }

  /**
   * 获取当前活动 token。
   */
  public getCurrentToken(): PlayToken {
    return this.currentToken;
  }

  /**
   * 查询是否在播放。
   */
  public isPlaying(token?: PlayToken): boolean {
    if (token == null) {
      return this.activePlayback !== null;
    }
    return this.activePlayback !== null && token === this.currentToken;
  }

  /**
   * 获取只读快照。
   */
  public getSnapshot(): Readonly<AnimationPlayerSnapshot> {
    return Object.freeze({
      currentToken: this.currentToken,
      isPlaying: this.activePlayback !== null,
      currentState: this.currentState,
      currentIntent: this.currentIntent,
      currentVariant: this.currentVariant,
      currentFrameName: this.currentFrameName,
      attachedEffects: Object.freeze([...this.attachedEffects]),
    });
  }

  /**
   * 供外部在不再需要播放器时调用，用于释放挂起的 rAF。
   */
  public dispose(): void {
    this.stopActivePlayback();
    this.clearCSSEffects();
    this.stopHungryOverlay(true);
    this.stopTickingIfIdle();
  }

  private effectClassName(effect: CSSEffect | 'hungry-overlay'): string {
    return `effect-${effect}`;
  }

  private stopActivePlayback(): void {
    this.activePlayback = null;
    this.stopTickingIfIdle();
  }

  private shouldTick(): boolean {
    return this.activePlayback !== null || this.hungryOverlayPlayback !== null;
  }

  private stopTickingIfIdle(): void {
    if (this.shouldTick()) {
      return;
    }
    if (this.rafHandle !== null) {
      this.cancelAnimationFrameImpl(this.rafHandle);
      this.rafHandle = null;
    }
  }

  private ensureTicking(): void {
    if (!this.shouldTick()) {
      return;
    }
    if (this.rafHandle !== null) {
      return;
    }
    this.rafHandle = this.requestAnimationFrameImpl(this.tick);
  }

  private readonly tick = () => {
    this.rafHandle = null;
    const now = this.now();

    if (this.activePlayback) {
      if (this.activePlayback.kind === 'awakeLoop') {
        this.advanceAwakeLoop(this.activePlayback, now);
      } else {
        this.advanceSimplePlayback(this.activePlayback, now);
      }
    }

    if (this.hungryOverlayPlayback) {
      this.advanceHungryOverlay(now);
    }

    if (this.shouldTick()) {
      this.ensureTicking();
    }
  };

  private advanceSimplePlayback(playback: SimplePlaybackState, now: number): void {
    let advancedFrames = 0;

    while (
      this.activePlayback === playback &&
      now >= playback.nextFrameAtMs &&
      advancedFrames < MAX_FRAME_ADVANCE_PER_TICK
    ) {
      if (playback.frameCursor >= playback.definition.frames.length) {
        if (playback.definition.loop) {
          playback.frameCursor = 0;
        } else {
          this.activePlayback = null;
          playback.onComplete?.(playback.token);
          this.stopTickingIfIdle();
          return;
        }
      }

      const frameName = playback.definition.frames[playback.frameCursor];
      const frameInfo = this.applyFrame(playback.definition.sheetKey, frameName, playback.startedAtMs, now);
      playback.onFrame?.(frameInfo, playback.token);

      playback.frameCursor += 1;
      playback.nextFrameAtMs += playback.frameDurationMs;
      advancedFrames += 1;
    }

    if (this.activePlayback === playback && now >= playback.nextFrameAtMs) {
      playback.nextFrameAtMs = now + playback.frameDurationMs;
    }
  }

  private advanceAwakeLoop(playback: AwakeLoopPlaybackState, now: number): void {
    let advancedFrames = 0;

    while (
      this.activePlayback === playback &&
      now >= playback.nextFrameAtMs &&
      advancedFrames < MAX_FRAME_ADVANCE_PER_TICK
    ) {
      const blinkFrames = playback.definition.blinkFrames ?? [];

      if (!playback.isBlinking && now >= playback.nextBlinkAtMs && blinkFrames.length > 0) {
        playback.isBlinking = true;
        playback.blinkCursor = 0;
      }

      if (playback.isBlinking) {
        if (playback.blinkCursor >= blinkFrames.length) {
          playback.isBlinking = false;
          playback.blinkCursor = 0;
          playback.nextBlinkAtMs = this.nextBlinkDeadline(now, playback.definition);
          continue;
        }

        const frameName = blinkFrames[playback.blinkCursor];
        const frameInfo = this.applyFrame(playback.definition.sheetKey, frameName, playback.startedAtMs, now);
        playback.onFrame?.(frameInfo, playback.token);
        playback.blinkCursor += 1;
        playback.nextFrameAtMs += playback.definition.blinkFrameDurationMs ?? playback.frameDurationMs;
        advancedFrames += 1;
        continue;
      }

      const frameName = playback.definition.frames[playback.floatCursor];
      const frameInfo = this.applyFrame(playback.definition.sheetKey, frameName, playback.startedAtMs, now);
      playback.onFrame?.(frameInfo, playback.token);
      playback.floatCursor = (playback.floatCursor + 1) % playback.definition.frames.length;
      playback.nextFrameAtMs += playback.frameDurationMs;
      advancedFrames += 1;
    }

    if (this.activePlayback === playback && now >= playback.nextFrameAtMs) {
      const fallbackFrameDurationMs = playback.isBlinking
        ? (playback.definition.blinkFrameDurationMs ?? playback.frameDurationMs)
        : playback.frameDurationMs;
      playback.nextFrameAtMs = now + fallbackFrameDurationMs;
    }
  }

  private applySheet(sheetKey: ResolvedSequenceDefinition['sheetKey']): void {
    const definition = getSpriteSheetDefinition(sheetKey);
    const imageUrl = getPinnedSheetUrl(sheetKey, this.assetRoot);
    const pinnedImage = getPinnedSheet(sheetKey, this.assetRoot);

    const displayHeight = this.targetDisplayHeightPx ?? definition.frameHeight;
    const displayWidth = Math.round((displayHeight * definition.frameWidth) / definition.frameHeight);

    if (this.currentSheetKey !== sheetKey) {
      this.spriteLayer.style.backgroundImage = `url('${imageUrl}')`;
      this.currentSheetKey = sheetKey;
    }

    this.motionLayer.style.width = `${displayWidth}px`;
    this.motionLayer.style.height = `${displayHeight}px`;
    this.spriteLayer.style.width = `${displayWidth}px`;
    this.spriteLayer.style.height = `${displayHeight}px`;
    this.spriteLayer.style.backgroundSize = `${definition.frameCount * displayWidth}px ${displayHeight}px`;

    if (!this.preloaded && !pinnedImage) {
      // 调用方未先 preloadAll() 时，播放依然尽力工作；但这会失去冷解码保护。
      // 按接口契约，正式接入应在启动阶段先调用 preloadAll()。
    }
  }

  private syncHungryOverlayMetrics(): void {
    const definition = getSpriteSheetDefinition('hungry_overlay');
    const displayHeight = this.targetDisplayHeightPx ?? definition.frameHeight;
    const displayWidth = Math.round((displayHeight * definition.frameWidth) / definition.frameHeight);
    const imageUrl = getPinnedSheetUrl('hungry_overlay', this.assetRoot);

    this.hungryOverlayLayer.style.width = `${displayWidth}px`;
    this.hungryOverlayLayer.style.height = `${displayHeight}px`;
    this.hungryOverlayLayer.style.backgroundSize = `${definition.frameCount * displayWidth}px ${displayHeight}px`;
    this.hungryOverlayLayer.style.backgroundImage = `url('${imageUrl}')`;
  }

  private applyMirror(mirrorX: boolean): void {
    this.spriteLayer.classList.toggle(MIRRORED_CLASS, mirrorX);
    this.spriteLayer.style.transform = mirrorX ? 'scaleX(-1)' : 'scaleX(1)';
    this.spriteLayer.style.transformOrigin = 'center center';
  }

  private applyFrame(
    sheetKey: ResolvedSequenceDefinition['sheetKey'],
    frameName: string,
    startedAtMs: number,
    now: number,
  ): FrameInfo {
    const definition = getSpriteSheetDefinition(sheetKey);
    const displayHeight = this.targetDisplayHeightPx ?? definition.frameHeight;
    const displayWidth = Math.round((displayHeight * definition.frameWidth) / definition.frameHeight);
    const frameIdx = definition.frames[frameName];

    if (typeof frameIdx !== 'number') {
      throw new Error(`Frame ${frameName} is missing from spritesheet ${sheetKey}.`);
    }

    this.spriteLayer.style.backgroundPosition = `${-frameIdx * displayWidth}px 0px`;
    this.currentFrameName = frameName;

    return {
      frameIdx,
      frameName,
      elapsedMs: Math.max(0, now - startedAtMs),
    };
  }

  private startHungryOverlay(): void {
    const now = this.now();
    this.syncHungryOverlayMetrics();
    this.hungryOverlayLayer.style.opacity = '1';
    this.hungryOverlayPlayback = {
      phase: 'enter',
      frameCursor: 0,
      nextFrameAtMs: now,
      startedAtMs: now,
      frameDurationMs: 220,
    };
    this.ensureTicking();
  }

  private startHungryOverlayExit(): void {
    if (!this.hungryOverlayPlayback) {
      this.stopHungryOverlay(true);
      return;
    }

    const now = this.now();
    this.hungryOverlayPlayback = {
      phase: 'exit',
      frameCursor: 0,
      nextFrameAtMs: now,
      startedAtMs: now,
      frameDurationMs: 180,
    };
    this.ensureTicking();
  }

  private stopHungryOverlay(immediate: boolean): void {
    this.hungryOverlayPlayback = null;
    if (immediate) {
      this.hungryOverlayLayer.style.opacity = '0';
      this.hungryOverlayLayer.style.backgroundPosition = '0px 0px';
    }
    this.stopTickingIfIdle();
  }

  private advanceHungryOverlay(now: number): void {
    const playback = this.hungryOverlayPlayback;
    if (!playback) {
      return;
    }

    let advancedFrames = 0;

    while (
      this.hungryOverlayPlayback === playback &&
      now >= playback.nextFrameAtMs &&
      advancedFrames < MAX_FRAME_ADVANCE_PER_TICK
    ) {
      const frames = this.resolveHungryOverlayFrames(playback.phase);

      if (playback.frameCursor >= frames.length) {
        if (playback.phase === 'enter') {
          this.hungryOverlayPlayback = {
            phase: 'loop',
            frameCursor: 0,
            nextFrameAtMs: now,
            startedAtMs: now,
            frameDurationMs: 190,
          };
          return this.advanceHungryOverlay(now);
        }

        if (playback.phase === 'loop') {
          playback.frameCursor = 0;
        } else {
          this.stopHungryOverlay(true);
          return;
        }
      }

      const frameName = frames[playback.frameCursor];
      this.applyEffectFrame('hungry_overlay', this.hungryOverlayLayer, frameName);
      playback.frameCursor += 1;
      playback.nextFrameAtMs += playback.frameDurationMs;
      advancedFrames += 1;
    }

    if (this.hungryOverlayPlayback === playback && now >= playback.nextFrameAtMs) {
      playback.nextFrameAtMs = now + playback.frameDurationMs;
    }
  }

  private resolveHungryOverlayFrames(phase: OverlayIntent): readonly string[] {
    switch (phase) {
      case 'enter':
        return HUNGRY_OVERLAY_ENTER_FRAMES;
      case 'exit':
        return HUNGRY_OVERLAY_EXIT_FRAMES;
      case 'loop':
      default:
        return HUNGRY_OVERLAY_LOOP_FRAMES;
    }
  }

  private applyEffectFrame(sheetKey: SpriteSheetKey, target: HTMLDivElement, frameName: string): void {
    const definition = getSpriteSheetDefinition(sheetKey);
    const displayHeight = this.targetDisplayHeightPx ?? definition.frameHeight;
    const displayWidth = Math.round((displayHeight * definition.frameWidth) / definition.frameHeight);
    const frameIdx = definition.frames[frameName];

    if (typeof frameIdx !== 'number') {
      throw new Error(`Frame ${frameName} is missing from spritesheet ${sheetKey}.`);
    }

    target.style.backgroundPosition = `${-frameIdx * displayWidth}px 0px`;
  }

  private nextBlinkDeadline(now: number, definition: ResolvedSequenceDefinition): number {
    const minMs = definition.blinkMinIntervalMs ?? 3000;
    const maxMs = definition.blinkMaxIntervalMs ?? 8000;
    return now + minMs + Math.random() * Math.max(0, maxMs - minMs);
  }

  private normalizeStartAtMs(startAtMs: number | undefined, now: number): number {
    if (typeof startAtMs !== 'number' || !Number.isFinite(startAtMs)) {
      return now;
    }

    // Guard against cross-clock inputs (Date.now vs performance.now) that freeze frame advancement.
    if (startAtMs > now + MAX_ALLOWED_START_AHEAD_MS) {
      return now;
    }

    return startAtMs;
  }
}

export {
  ROOT_CLASS as PET_CANVAS_ROOT_CLASS,
  MOTION_LAYER_CLASS as PET_CANVAS_MOTION_LAYER_CLASS,
  SPRITE_LAYER_CLASS as PET_CANVAS_SPRITE_LAYER_CLASS,
  HUNGRY_OVERLAY_LAYER_CLASS as PET_CANVAS_HUNGRY_OVERLAY_LAYER_CLASS,
};
