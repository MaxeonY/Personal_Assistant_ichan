// ==================== 基础类型 ====================

export type Unsubscribe = () => void;
export type TimestampMs = number;
export type PlayToken = number;
export type MovementRequestId = number;

export interface Coord {
  x: number;
  y: number;
}

export type FacingDirection = 'left' | 'right';

// ==================== 播放器类型 ====================

/**
 * 播放器可感知的 CSS 微效果。
 * Phase A v1.1 仅保留 drowsy-breath。
 */
export type CSSEffect = 'drowsy-breath';

/**
 * Overlay 动画类型。
 * hungry 从 CSSEffect 中拆分，走 playOverlay/stopOverlay 入口。
 */
export type OverlayAnimation = 'hungry';
export type OverlayIntent = 'enter' | 'loop' | 'exit';

/**
 * 公共状态名。
 * 必须与 ICHAN DOC §4.4 + ani_resources.md §3 一致。
 */
export type PetState =
  | 'idle.awake'
  | 'idle.drowsy'
  | 'idle.napping'
  | 'talking'
  | 'eating'
  | 'happy'
  | 'reminding'
  | 'wake.day_start'
  | 'wake.from_nap'
  | 'farewell'
  | 'walk.roaming'
  | 'walk.targeted';

export type Intent = 'enter' | 'loop' | 'exit' | 'oneshot';

/**
 * 合法 state → intent 映射（v1.0 锁定）。
 *
 * 架构决策记录：
 * - 'talking' 仅暴露 'loop'；talking exit 未在 Phase A 开放（Q1 决议）
 * - 'idle.napping' 仅暴露 'enter' + 'loop'；摸头微反应未在 Phase A 开放（Q2 决议）
 * - 未来扩展需经架构审批并同步 animation_resources.md
 */
export interface SupportedIntentMap {
  'idle.awake': 'loop';
  'idle.drowsy': 'enter' | 'loop' | 'exit';
  'idle.napping': 'enter' | 'loop';
  'talking': 'loop';
  'eating': 'oneshot';
  'happy': 'oneshot';
  'reminding': 'loop';
  'wake.day_start': 'oneshot';
  'wake.from_nap': 'oneshot';
  'farewell': 'oneshot';
  'walk.roaming': 'loop';
  'walk.targeted': 'loop';
}

export type SupportedIntent<S extends PetState> = SupportedIntentMap[S];

/**
 * 视觉变体。
 * walk.* 状态支持 left/right；其余状态固定为 default。
 */
export type PlaybackVariant = 'default' | 'left' | 'right';

export type SupportedVariant<S extends PetState> =
  S extends 'walk.roaming' | 'walk.targeted' ? PlaybackVariant : 'default';

export interface FrameInfo {
  frameIdx: number;
  frameName: string;
  elapsedMs: number;
}

export interface SpriteSheetDefinition {
  key: string;
  basePath: string;
  image: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  frames: Readonly<Record<string, number>>;
}

// ==================== 状态机类型 ====================

export type LifecycleState =
  | 'deep_sleep'
  | 'waking_up'
  | 'alive'
  | 'farewell';

export type MajorState =
  | 'idle'
  | 'talking'
  | 'eating'
  | 'happy'
  | 'reminding';

export type IdleSubState = 'awake' | 'drowsy' | 'napping';

export type MovementState = 'still' | 'roaming' | 'targeted_move';

export interface PetFlags {
  isHungry: boolean;
}

export interface MovementRuntime {
  state: MovementState;
  direction: FacingDirection | null;
  target: Coord | null;
  requestId: MovementRequestId | null;
}

export interface PetFullState {
  lifecycle: LifecycleState;
  major: MajorState;
  idleSub?: IdleSubState;
  movement: MovementRuntime;
  flags: PetFlags;
}

export interface SessionBootstrap {
  isNewDay: boolean;
  lastExitClean: boolean;
}

export type DialogOpenSource = 'shortcut' | 'doubleClick' | 'morningRitual';
export type DialogCloseReason = 'user' | 'timeout' | 'service_done' | 'error';

/**
 * Phase A 公共事件。
 *
 * 外部事件：由用户、提醒调度、movement utility 等外部来源 dispatch
 * 内部事件：由状态机内部定时器到期后自派发
 */
export type PetEvent =
  | { type: 'morningRitual.complete' }
  | { type: 'user.exit' }
  | { type: 'user.pat' }
  | { type: 'user.doubleClick' } // B2-9: notification-only；状态转换由 dialog.open 触发
  | { type: 'user.feed'; csv: File }
  | { type: 'reminder.due'; target: Coord }
  | { type: 'reminder.dismiss' }
  | { type: 'idle.timeout' }
  | { type: 'timer.drowsyToNap' }
  | { type: 'timer.roaming.tick' }
  | { type: 'movement.arrive'; requestId: MovementRequestId; position: Coord }
  | { type: 'dialog.open'; source: DialogOpenSource }
  | { type: 'dialog.close'; reason: DialogCloseReason }
  | { type: 'hungry.set'; value: boolean };

export interface StateMachineInitOptions {
  /** 可注入时钟，方便测试 */
  now?: () => TimestampMs;
}

export interface StateMachineSnapshot {
  state: Readonly<PetFullState>;
  currentAnimationToken: PlayToken | null;
  queuedEventCount: number;
}

export type StateListener = (
  nextState: Readonly<PetFullState>,
  snapshot: Readonly<StateMachineSnapshot>,
) => void;
