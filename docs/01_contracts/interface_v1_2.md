# ICHAN Phase A 接口定稿 v1.3

**文件路径**: `docs/01_contracts/interface_v1_2.md`
**范围**: Phase A 任务 2（动画播放器） / 任务 3（三层状态机最小可运行版）
**状态**: 审定版（2026-04-27 审计对齐复核）
**审定**: Claude（架构）| 起草 GPT（基于 Claude 给定骨架扩展）
---

## 0. 审定变更摘要（相比 v0.1）
| # | 项 | v0.1 状态 | v1.0 决议 |
|---|---|---|---|
| 1 | `TODO(architect)` 1（val_reports 见第 6 节） | 开启 | 移除。第 6 节已完整，无影响 |
| 2 | `TODO(architect)` 2（napping + microReact）| 开启 | **不实现**，Phase A 不暴露 microReact intent |
| 3 | `TODO(architect)` 3（talking + exit）| 开启 | **不实现**，`SupportedIntentMap['talking']` 锁定为 `'loop'` |
| 4 | `TODO(architect)` 4（movement.arrive requestId）| 开启 | 采纳，保留 `requestId` 防陈旧机制 |
| 5 | `timer.roaming.start/stop` 事件 | 作为外部事件 | **修正**为内部 tick，见第 4.2 节 |
| 6 | 其余所有接口定义 | 通过 | 原样保留 |

### v1.1 变更摘要（相比 v1.0）
- 本次 v1.1 调整由 **Phase A 联调反馈** 驱动：将 hungry 从 `CSSEffect` 拆分为独立 overlay 播放入口，减少语义混淆并保持与素材形态一致。
- §2 共享类型：`CSSEffect` 移除 `'hungry-overlay'`，新增 `OverlayAnimation = 'hungry'` 及 `OverlayIntent = 'enter' | 'loop' | 'exit'`。
- §3.3 AnimationPlayer：新增 `playOverlay(overlay, intent)` / `stopOverlay(overlay)`，与 `attach/detachCSSEffect` 并列。
- §3.4 合法组合：新增 overlay 合法组合子表。

### v1.2 变更摘要（相比 v1.1）
- §4.2 `PetEvent` 新增 `{ type: 'hungry.set'; value: boolean }`，hungry 真假翻转统一为 `dispatch(...)` 单入口。
- §4.4 `StateMachine` 公共接口澄清：不引入 `setHungry(...)` 等绕过事件入口的 public 方法。
- §3.4 `idle.drowsy exit` 口径统一：`4` 个源状态帧 + 目标态首帧自然衔接；若提及“第 5 帧”，仅指目标态首帧。

### v1.3 变更摘要（相比 v1.2）
- §4.2 `PetEvent` 新增 `dialog.open` / `dialog.close`，作为 talking 开关的正式意图事件。
- 新增 `DialogOpenSource` / `DialogCloseReason` 类型定义。
- `user.doubleClick` 降级为通知性事件，不再直接触发状态转换。
- §3.4 `talking` 继续仅支持 `loop`，不开放 talking exit intent。

---

## 1. 设计总则（硬约束，实现不得违反）

1. **单向依赖**：StateMachine 依赖 AnimationPlayer，播放器不得反向持有状态机引用
2. **语义分层**：播放器只认 `state + intent + variant`，不理解"软硬打断""摸头反应"等语义
3. **token 代际**：`play()` 返回新 token；打断的**唯一合法路径**是 `interrupt(token)`，禁止绕过
4. **CSS 与 Overlay 分层**：`drowsy-breath` 通过 `attach/detachCSSEffect` 管理；hungry 通过 `playOverlay/stopOverlay` 管理，不由主帧动画驱动
5. **运动解耦**：`walk.roaming` / `walk.targeted` 的帧动画 无 窗口坐标位移；位移由 movement utility 独立处理

---

## 2. 共享类型定义（锁定）

```ts
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
 * - 未来扩展需经架构审批并同步 ani_resources.md
 */
export interface SupportedIntentMap {
  'idle.awake':       'loop';
  'idle.drowsy':      'enter' | 'loop' | 'exit';
  'idle.napping':     'enter' | 'loop';
  'talking':          'loop';
  'eating':           'oneshot';
  'happy':            'oneshot';
  'reminding':        'loop';
  'wake.day_start':   'oneshot';
  'wake.from_nap':    'oneshot';
  'farewell':         'oneshot';
  'walk.roaming':     'loop';
  'walk.targeted':    'loop';
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
```

---

## 3. AnimationPlayer 接口（锁定）

### 3.1 职责边界

**负责**:
- 启动时预加载所有 spritesheet 并保持模块级引用（防冷解码）
- 按 `state + intent + variant` 播放帧序列（序列定义源自 `ani_resources.md §3`）
- 管理 token 代际
- 挂载/卸载 CSS 微效果
- 播放/停止 overlay 动画（如 hungry）

**不负责**:
- 决定何时从 drowsy 切到 napping
- 决定摸头是否打断某状态
- 决定 movement.arrive 之后下一跳是什么
- 决定 hungry flag 是 true/false

### 3.2 Play 参数

```ts
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
   * 注：walk.targeted 的 'left' 推荐由播放器内部实现：
   *     'right' spritesheet + CSS scaleX(-1) 镜像（参考 v4 验证页）。
   */
  variant?: SupportedVariant<S>;

  /** 起始时刻；未传则使用当前时钟 */
  startAtMs?: TimestampMs;

  /** 
   * 帧时长覆盖。
   * 未传则使用 ani_resources.md 该序列的默认节奏。
   */
  frameDurationOverrideMs?: number;

  /** 
   * 非 loop intent 完成时触发。
   * 回调内必须做 token 代际校验（`if (tok !== myToken) return;`）。
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
```

### 3.3 接口

```ts
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
   * 查询是否在播放：
   * - 不传 token：是否有任何活动播放
   * - 传 token：该 token 是否仍是当前 token
   */
  isPlaying(token?: PlayToken): boolean;

  /** 获取只读快照 */
  getSnapshot(): Readonly<AnimationPlayerSnapshot>;
}
```

### 3.4 state + intent 合法组合表（实现自测用）

| PetState | 合法 intent | 说明 |
|---|---|---|
| `idle.awake` | `loop` | float ping-pong + blink 低频插入（blink 为内部机制，不暴露 intent） |
| `idle.drowsy` | `enter` / `loop` / `exit` | 三段式：9 帧进入 / end_01+CSS 呼吸 loop / 4 源帧短退出 + 目标态首帧自然衔接 |
| `idle.napping` | `enter` / `loop` | `enter` 只播 `fall_01`，随后 `loop` 为呼吸 ping-pong |
| `talking` | `loop` | v1.0 仅 loop；exit 暂不开放 |
| `eating` | `oneshot` | 整段一次性 |
| `happy` | `oneshot` | 一次性反应 |
| `reminding` | `loop` | 持续提醒直到 `reminder.dismiss` |
| `wake.day_start` | `oneshot` | 新一天启动苏醒 |
| `wake.from_nap` | `oneshot` | napping 硬打断后的唤醒过程 |
| `farewell` | `oneshot` | 生命周期退出动画 |
| `walk.roaming` | `loop` | 方向由 `variant` 指定 |
| `walk.targeted` | `loop` | 方向由 `variant` 指定；left 走 CSS 镜像 |

#### overlay 合法组合

| OverlayAnimation | 合法 intent | 说明 |
|---|---|---|
| `hungry` | `enter` / `loop` / `exit` | `enter` 进入并衔接 `loop`，`exit` 播放退出并停止 |

---

## 4. StateMachine 接口（锁定）

### 4.1 状态类型

```ts
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
  idleSub?: IdleSubState;  // 仅当 major === 'idle' 时有效。
  movement: MovementRuntime;
  flags: PetFlags;
}

export interface SessionBootstrap {
  isNewDay: boolean;
  lastExitClean: boolean;
}
```

### 4.2 事件（v1.0 修正版）

```ts
export type DialogOpenSource = 'shortcut' | 'doubleClick' | 'morningRitual';
export type DialogCloseReason = 'user' | 'timeout' | 'service_done' | 'error';

/** 
 * Phase A 公共事件。
 * 
 * 外部事件：由用户、提醒调度、movement utility 等外部来源 dispatch
 * 内部事件：由状态机内部定时器到期后自派发
 * 
 * v1.0 修正：
 * - 将 'timer.roaming.start/stop' 改为统一 'timer.roaming.tick'
 *   状态机内部判断是该开始还是停止 roaming，不从外部声明
 */
export type PetEvent =
  // 生命周期
  | { type: 'morningRitual.complete' }
  | { type: 'user.exit' }

  // 软打断（用户主动互动）
  | { type: 'user.pat' }
  | { type: 'user.doubleClick' } // B2-9: notification-only；状态转换由 dialog.open 触发

  // 硬打断
  | { type: 'user.feed'; csv: File }
  | { type: 'hungry.set'; value: boolean }
  | { type: 'reminder.due'; target: Coord }
  | { type: 'reminder.dismiss' }

  // 内部定时器（由状态机自派发）
  | { type: 'idle.timeout' }
  | { type: 'timer.drowsyToNap' }
  | { type: 'timer.roaming.tick' }  // 见 v1.0 修正

  // 位移契约
  | { type: 'movement.arrive'; requestId: MovementRequestId; position: Coord }

  // B2-9: 对话开关意图
  | { type: 'dialog.open'; source: DialogOpenSource }
  | { type: 'dialog.close'; reason: DialogCloseReason };
```

### 4.3 其他定义

```ts
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
  snapshot: Readonly<StateMachineSnapshot>
) => void;
```

### 4.4 接口

```ts
export interface StateMachine {
  /** 
   * 注入 AnimationPlayer 依赖。
   * 
   * 架构约束：单向依赖，player 不得反向持有 this 引用。
   */
  init(player: AnimationPlayer, options?: StateMachineInitOptions): void;

  /** 
   * 启动状态机。
   * 
   * - isNewDay === true：deep_sleep -> waking_up（晨间仪式流程）
   * - isNewDay === false：deep_sleep -> alive + idle.awake（直接进入日常）
   */
  start(session: SessionBootstrap): void;

  /** 
   * 派发事件。
   * 
   * 约束：
   * - 所有状态变更只能通过 dispatch 进入规则。
   * - `flags.isHungry` 也必须通过 `dispatch({ type: 'hungry.set', value })` 进入规则。
   * - 任何涉及播放器切换的打断，必须先 interrupt(oldToken) 后 play(newParams)
   */
  dispatch(event: PetEvent): void;

  getState(): Readonly<PetFullState>;

  getSnapshot(): Readonly<StateMachineSnapshot>;

  subscribe(listener: StateListener): Unsubscribe;

  /** 
   * 销毁并清理资源。
   * 
   * 必须：
   * - 清除所有内部定时器
   * - 作废当前 token（让迟到的播放器回调自动失效）
   * 
   * 不负责：
   * - 进程退出本身（由应用壳处理）
   */
  destroy(): void;
}
```

---

## 5. 对接契约（5 个典型场景）

### 场景 1：idle.awake -> idle.drowsy -> idle.napping 无打断自动流程
```ts
class IdleFlowExample {
  private player!: AnimationPlayer;
  private currentToken: PlayToken | null = null;

  // 由 idle.timeout 事件触发
  private transitionToDrowsy(): void {
    const token = this.player.play({
      state: 'idle.drowsy',
      intent: 'enter',
      onComplete: (tok) => {
        if (tok !== token) return;
        this.player.attachCSSEffect('drowsy-breath');
        this.currentToken = this.player.play({
          state: 'idle.drowsy',
          intent: 'loop',
        });
      },
    });
    this.currentToken = token;
  }

  // 由 timer.drowsyToNap 事件触发
  private transitionDrowsyToNapping(): void {
    if (this.currentToken !== null) {
      this.player.interrupt(this.currentToken);
    }
    this.player.detachCSSEffect('drowsy-breath');

    const enterToken = this.player.play({
      state: 'idle.napping',
      intent: 'enter',
      onComplete: (tok) => {
        if (tok !== enterToken) return;
        this.currentToken = this.player.play({
          state: 'idle.napping',
          intent: 'loop',
        });
      },
    });
    this.currentToken = enterToken;
  }
}
```

### 场景 2：idle.drowsy 被摸头（软打断）-> drowsy exit -> happy -> idle.awake

```ts
private handlePatDuringDrowsy(): void {
  if (this.currentToken !== null) {
    this.player.interrupt(this.currentToken);
  }
  this.player.detachCSSEffect('drowsy-breath');

  const exitToken = this.player.play({
    state: 'idle.drowsy',
    intent: 'exit',
    onComplete: (tok) => {
      if (tok !== exitToken) return;

      const happyToken = this.player.play({
        state: 'happy',
        intent: 'oneshot',
        onComplete: (ht) => {
          if (ht !== happyToken) return;
          this.currentToken = this.player.play({
            state: 'idle.awake',
            intent: 'loop',
          });
        },
      });
      this.currentToken = happyToken;
    },
  });
  this.currentToken = exitToken;
}
```

### 场景 3：idle.napping 被 reminder.due（硬打断）-> wake.from_nap -> reminding -> idle.awake

```ts
private handleReminderDuringNapping(target: Coord): void {
  if (this.currentToken !== null) {
    this.player.interrupt(this.currentToken);
  }
  this.player.clearCSSEffects();

  const wakeToken = this.player.play({
    state: 'wake.from_nap',
    intent: 'oneshot',
    onComplete: (tok) => {
      if (tok !== wakeToken) return;
      this.currentToken = this.player.play({
        state: 'reminding',
        intent: 'loop',
      });
    },
  });
  this.currentToken = wakeToken;
}

// 由 reminder.dismiss 事件触发
private dismissReminder(): void {
  if (this.currentToken !== null) {
    this.player.interrupt(this.currentToken);
  }
  this.currentToken = this.player.play({
    state: 'idle.awake',
    intent: 'loop',
  });
}
```

### 场景 4：idle.awake + roaming 遇 reminder.due -> targeted_move -> 到达 -> reminding

```ts
private currentMoveRequestId: MovementRequestId | null = null;

private startTargetedReminder(target: Coord, direction: FacingDirection): void {
  if (this.currentToken !== null) {
    this.player.interrupt(this.currentToken);
  }

  const requestId = Date.now() + Math.floor(Math.random() * 1000);
  this.currentMoveRequestId = requestId;

  // 状态机内部更新 movement runtime
  this.movementRuntime = {
    state: 'targeted_move',
    direction,
    target,
    requestId,
  };

  // 播放器只管播 walk.targeted 帧动画；实际位移由 movement utility 读 movementRuntime 执行
  this.currentToken = this.player.play({
    state: 'walk.targeted',
    intent: 'loop',
    variant: direction,
  });
}

// 由 movement.arrive 事件触发
private handleMovementArrive(ev: { requestId: MovementRequestId; position: Coord }): void {
  // 防陈旧：如果 requestId 对不上，说明是被打断后迟到的事件，丢弃。
  if (ev.requestId !== this.currentMoveRequestId) return;

  if (this.currentToken !== null) {
    this.player.interrupt(this.currentToken);
  }

  this.movementRuntime = { state: 'still', direction: null, target: null, requestId: null };

  this.currentToken = this.player.play({
    state: 'reminding',
    intent: 'loop',
  });
}
```

### 场景 5：alive -> farewell -> deep_sleep

```ts
private handleUserExit(): void {
  if (this.currentToken !== null) {
    this.player.interrupt(this.currentToken);
  }
  this.player.clearCSSEffects();

  const farewellToken = this.player.play({
    state: 'farewell',
    intent: 'oneshot',
    onComplete: (tok) => {
      if (tok !== farewellToken) return;
      // 状态机层将 lifecycle 切换至 deep_sleep
      // 进程实际关闭由应用壳（Tauri commands）处理。
      this.notifyApplicationShellToExit();
    },
  });
  this.currentToken = farewellToken;
}
```

---

## 6. 实现者自测清单（GPT 写任务 2/3 前必读）

### 任务 2（AnimationPlayer）自测清单
- [ ] `preloadAll()` 完成后，所有 13 个 spritesheet 的 `Image` 对象挂在模块作用域，**不能**是局部变量
- [ ] `play()` 每次调用都递增 token；返回的 token 唯一
- [ ] `interrupt(token)` 调用后，该 token 对应的任何 `onComplete` / `onFrame` 都不再触发
- [ ] 帧切换只改 `background-position`，**不改 `backgroundImage`**
- [ ] 显示尺寸按 spritesheet metadata 动态计算，不硬编码 `displayFrameW`
- [ ] `walk.targeted` + `variant: 'left'` 内部实现用 `right` spritesheet + CSS `scaleX(-1)`
- [ ] `attachCSSEffect('drowsy-breath')` 挂载的 CSS class 在 `detachCSSEffect('drowsy-breath')` 时能彻底移除（测试时连续执行 10 次不应造成残留）
- [ ] 传入非法 `state + intent` 组合时 TypeScript 编译期就应报错（依赖 `SupportedIntentMap`）

### 任务 3（StateMachine）自测清单
- [ ] 所有状态变更 **只能**通过 `dispatch(event)` 触发；没有任何 public 方法能直接写 state
- [ ] `flags.isHungry` 仅能通过 `dispatch({ type: 'hungry.set', value })` 变更；不存在 `setHungry(...)` public 方法
- [ ] 任何打断路径都是先 `player.interrupt(oldToken)` 后 `player.play(newParams)`；禁止只 play 不 interrupt
- [ ] `idle.timeout` 至 drowsy、`timer.drowsyToNap` 至 napping 的内部计时器在任何事件触发状态切换时都能被清理
- [ ] 从 napping 被 **硬打断** 时，必先播 `wake.from_nap oneshot`，再进入目标状态
- [ ] 从 drowsy 被 **软打断** 时，先播 `idle.drowsy exit` 再进目标状态
- [ ] `movement.arrive` 事件必须校验 `requestId === currentMoveRequestId`，否则丢弃
- [ ] `user.pat` 对 `idle.napping` **无响应**（Phase A 决策：不做微反应）
- [ ] `user.pat` 对 `eating` / `reminding` **无响应**（v0.4 摸头反应表）
- [ ] `destroy()` 后，任何残留定时器都不应再触发 `dispatch`

---

## 7. Phase A 任务分发

待 v1.0 审定稿通过后，进入并行实现阶段：
| 任务 | 范围 | 执行 | 审核 |
|---|---|---|---|
| 任务 2 | 实现 `AnimationPlayer`（按第 3 节） | GPT / Codex | GPT 副审，关键架构交 Claude 终审 |
| 任务 3 | 实现 `StateMachine`（按第 4 节） | GPT / Codex | GPT 副审，关键架构交 Claude 终审 |

**两任务可完全并行**，仅在集成时需要：
- 任务 2 先单独跑通 13 个 state+intent 组合的 demo 页（复用 Stage2 验证架构）
- 任务 3 先用 mock AnimationPlayer 跑通 5 个场景的事件流单元测试
- 两者各自通过后，再做集成 demo

---

## 8. 为未来版本的预留扩展点

这些不在 Phase A 范围内，但接口设计时已预留，未来扩展不会破坏当前契约。
- `talking + exit` intent（若有需要）
- `idle.napping + microReact` intent（若要做翻身反应）
- 更多 `CSSEffect` 枚举值（如 `focus-glow`、`sadness-tear` 等）
- 额外的 `MajorState`（如 Phase 2 的“穿越窗口”相关状态）
- `PlaybackVariant` 扩展更多方向（如 `up` / `down` 若将来有垂直位移）

扩展时的硬约束：**不允许破坏已锁定的 `SupportedIntentMap`**，只能追加新 key 或为现有 key 扩展 intent union。
