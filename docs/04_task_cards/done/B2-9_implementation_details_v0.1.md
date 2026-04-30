# B2-9 实现细节细化稿

> 版本：v0.1 - 2026-04-29
> 基于：B2-9_architecture_v0.2.md §5（留给 DeepSeek 细化的待补条目）
> 流向：Claude 合规审核 → GPT 起任务卡 → Codex 落地

## §1 概览

本轮细化覆盖 10 个待补条目，核心决策取向：
- `pendingDialogOpen` 放在 `PetStateMachine` 实例字段，不进 `PetFullState`；AnimationPlayer 的 `onComplete` 回调（带 token 代际校验）作为苏醒完成检测机制（复用现有 `idle.drowsy.exit` / `wake.from_nap.oneshot` 的 onComplete 模式）
- `dialogRouter` 独立模块（`src/integration/dialogRouter.ts`），与 `dialogStateBridge` 分治打开/关闭路由
- `user.doubleClick` 降级为纯通知性分支，原有 `idle.drowsy → talking` / `idle.awake → talking` 逻辑迁移到 `dialog.open` 分支
- DevPanel 追加 Force dialog.open / Force dialog.close 按钮（固定 source/reason），新增 drowsy/napping 苏醒路径验证按钮
- 所有日志策略统一为 `console.warn`（非预期路径）+ `console.error`（bridge 检测到状态不一致）

---

## §2 条目 1：StateMachine `pendingDialogOpen` 内部状态实现

### 2.1 决策结论

`pendingDialogOpen` 作为 `PetStateMachine` 的 `private` 实例字段，类型 `{ source: DialogOpenSource } | null`。不进 `PetFullState`。清除时机：进入 `talking` 时消费，硬打断时丢弃，`start()`/`destroy()` 时重置。

### 2.2 决策理由

**采选方案**：实例字段（非 PetFullState 成员）

**备选方案（被否）**：
- 放入 `PetFullState.flags` 或新增 `PetFullState.pending`：会污染公共状态，且外部订阅者不需要感知这个短暂标记
- 用闭包变量在 `handleDialogOpen*` 方法内部持有：无法跨方法清理（硬打断路径在其他 handler 中）

实例字段满足 K7-2 的"内部标记，不进 PetFullState"要求，且在同一类内可写可读。

### 2.3 落地代码/SQL/配置示例

**类型定义** (`src/components/Pet/types.ts`，新增)：
```ts
export type DialogOpenSource = 'shortcut' | 'doubleClick' | 'morningRitual';
export type DialogCloseReason = 'user' | 'timeout' | 'service_done' | 'error';
```

**StateMachine 实例字段** (`src/state/StateMachine.ts`，`PetStateMachine` 类内)：
```ts
private pendingDialogOpen: { source: DialogOpenSource } | null = null;
```

**Set 时机** — 在 `handleDialogOpen*` 方法内，位于 `playAnimation(...)` 之后（`playAnimation` 内部会调 `interruptCurrentAnimation`，之后设置避免被误清）：
```ts
private handleDialogOpenDuringDrowsy(source: DialogOpenSource): void {
    this.timers.clearAll();
    this.player!.detachCSSEffect('drowsy-breath');

    const exitToken = this.playAnimation({
        state: 'idle.drowsy',
        intent: 'exit',
        onComplete: (tok) => {
            if (tok !== exitToken || tok !== this.currentAnimationToken) { return; }
            this.enterTalkingLoop();
        },
    });
    this.currentAnimationToken = exitToken;
    this.pendingDialogOpen = { source };  // set AFTER playAnimation (playAnimation calls interruptCurrentAnimation)
    this.emitStateChanged();
}
```

**Consume 时机** — `enterTalkingLoop()` 开头：
```ts
private enterTalkingLoop(): void {
    this.pendingDialogOpen = null;
    // ... 既有代码不变 ...
}
```

**Discard 时机** — 硬打断 handler 入口：
```ts
// 在 handleUserFeed() 中，lifecycle gate 之后、任何动画播放之前：
private handleUserFeed(): void {
    if (this.state.lifecycle !== 'alive') { return; }
    this.pendingDialogOpen = null;
    // ... 既有代码不变 ...
}

// 同理 handleReminderDue():
private handleReminderDue(target: Coord): void {
    if (this.state.lifecycle !== 'alive') { return; }
    this.pendingDialogOpen = null;
    // ... 既有代码不变 ...
}
```

**Reset 时机** — `start()` 和 `destroy()`：
```ts
// 在 start() 中，this.destroyed = false 之后：
this.pendingDialogOpen = null;

// 在 destroy() 中，清理逻辑开头：
this.pendingDialogOpen = null;
```

### 2.4 注意事项与风险

- **set 顺序敏感**：`pendingDialogOpen` 必须在 `playAnimation()` 调用 **之后** 赋值。若在之前赋值，则 `playAnimation` 内部 `interruptCurrentAnimation` 行为（虽然此时没有活动 token 不会有实质副作用）不构成问题 — 真正危险的是未来如果有代码在 `interruptCurrentAnimation` 中统一清理 `pendingDialogOpen`。当前方案不在此处清理，故前后顺序实际上无影响。但为代码清晰，推荐 set after playAnimation。
- **token invalidation 保障**：苏醒动画的 `onComplete` 依赖 token 代际校验 `tok !== captureToken || tok !== this.currentAnimationToken`。如果动画被 `interruptCurrentAnimation()` 打断，`this.currentAnimationToken` 被置为 `null`，校验失败，回调不执行。此机制已有 `handleDrowsySoftInterruptToTalking` 和 `transitionFromNappingWithWake` 作为先例，可直接复用该模式。
- **napping 路径额外注意**：`wake.from_nap` 的 `onComplete` 中需要额外 `this.currentAnimationToken = null;` 再调用 `this.enterTalkingLoop()`，因 `enterTalkingLoop` 内部 `playAnimation` 也会走 token 管理。参考现有 `transitionFromNappingWithWake` 的实现（`StateMachine.ts:565-579`）。

---

## §3 条目 2：dialogRouter 实现位置与签名细化

### 3.1 决策结论

`dialogRouter.ts` 独立模块，位于 `src/integration/dialogRouter.ts`。与 `dialogStateBridge.ts` 分治：router 管物理事件→意图事件的打开路由判断，bridge 管状态机退出 talking 时 UI 关闭兜底。

### 3.2 决策理由

**采选方案**：独立模块

**备选方案（被否）**：
- inline 进 `App.tsx`：App.tsx 已 1581 行，职责过重；独立模块可单测、可复用
- 并入 `dialogStateBridge.ts`：两端虽然都有"判断+动作"的结构，但一个是"用户动作→事件派发"（主动），一个是"状态变化→UI 同步"（被动），语义和触发条件完全不同，合并会造成模块职责模糊

### 3.3 落地代码/SQL/配置示例

```ts
// src/integration/dialogRouter.ts
import type { DialogOpenSource, PetFullState } from '../components/Pet/types';

export function shouldOpenDialog(
  state: Readonly<PetFullState>,
  isDialogOpen: boolean,
): boolean {
  if (isDialogOpen) {
    return false;
  }

  if (state.lifecycle !== 'alive') {
    return false;
  }

  if (state.major === 'talking' || state.major === 'eating' || state.major === 'reminding') {
    return false;
  }

  if (state.major === 'idle') {
    return true;
  }

  if (state.major === 'happy') {
    return true;
  }

  return false;
}
```

**集成层调用端** (`App.tsx`)：
```ts
import { shouldOpenDialog } from '../integration/dialogRouter';

// 在 handleDoubleClick 中替换原有逻辑：
const handleDoubleClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
  event.preventDefault();
  if (dialogModeActiveRef.current) { return; }
  if (suppressPatClickRef.current) {
    suppressPatClickRef.current = false;
    return;
  }
  if (clickTimerRef.current !== null) {
    window.clearTimeout(clickTimerRef.current);
    clickTimerRef.current = null;
  }
  ignorePatUntilMsRef.current = performance.now()
    + Math.max(DOUBLE_CLICK_PAT_GUARD_MS, PAT_CLICK_DELAY_MS + 120);

  // 保留 user.doubleClick 物理事件通知
  dispatch({ type: 'user.doubleClick' });

  // dialogRouter 判断 → 派发意图事件
  const snapshot = machineRef.current.getSnapshot().state;
  if (shouldOpenDialog(snapshot, dialogModeActiveRef.current)) {
    dispatch({ type: 'dialog.open', source: 'doubleClick' });
  }
}, [dispatch]);
```

**Ctrl+Alt+T 快捷键**（新增全局快捷注册，放在 `useEffect` 的 `register` 调用块内）：
```ts
// 与 CLICK_THROUGH_SHORTCUT / DEV_PANEL_SHORTCUT 并列注册
const DIALOG_SHORTCUT = "Ctrl+Alt+T";

await register(DIALOG_SHORTCUT, (event) => {
  if (disposed) { return; }
  const keyState = String(event.state ?? "").toLowerCase();
  if (keyState !== "pressed") { return; }

  const now = performance.now();
  // 复用现有 debounce 常量
  if (now - lastShortcutAtRef.current < SHORTCUT_DEBOUNCE_MS) { return; }
  lastShortcutAtRef.current = now;

  const snapshot = machineRef.current.getSnapshot().state;
  if (shouldOpenDialog(snapshot, dialogModeActiveRef.current)) {
    dispatch({ type: 'dialog.open', source: 'shortcut' });
  }
});
```

### 3.4 注意事项与风险

- `dialogRouter` 的 `isDialogOpen` 参数来自 `dialogModeActiveRef.current`（非 React state，避免闭包旧值）。注意 `dialogModeActiveRef` 在 `runDialogOpenTransition` 和 `finalizeDialogClose` 中更新，调用 router 时需确保已经在 `dispatch` 之前读取了最新值。
- `happy` 状态下允许打开 dialog：`happy` 是 oneshot 动画播放过程中（~640ms），若在此期间双击，`dialog.open` 会打断 happy 进 talking（与现有 `user.pat` 从 talking→happy→idle 的打断逻辑对称）。如果产品认为 happy 期间不应开 dialog，在 router 中移除 `happy` 的 true 返回即可。

---

## §4 条目 3：drowsy/napping 苏醒动画完成检测

### 4.1 决策结论

直接复用 `AnimationPlayer.play()` 的 `onComplete` 回调机制。`SleepAnimationPlayer` 中 `advanceSimplePlayback` 在 `frames.length` 耗尽且 `loop === false` 时触发 `playback.onComplete?.(playback.token)`（`AnimationPlayer.ts:537-539`）。StateMachine 通过 token 代际校验保证仅最新一代的回调生效。

### 4.2 决策理由

**采选方案**：`PlayParams.onComplete`（连同等额的 token 代际校验 `tok === captureToken && tok === this.currentAnimationToken`）

**备选方案（被否）**：
- 新增 `onTokenComplete` 之类的独立回调机制：不需要，现有 `onComplete` 已经覆盖了 `oneshot` 和 `exit` intent 完成时机
- 在 `subscribe` listener 中检测 `currentAnimationToken` 变化：subscribe 每次 `emitStateChanged` 都触发，无法可靠区分"动画完成"与"动画被中断后新动画开始"；且 subscribe 的 snapshot 暴露 `currentAnimationToken` 但无"上一代"信息

**查实结论**（针对特别提醒 3）：
- `AnimationPlayer.ts` 中**没有**名为 `onTokenComplete` 的钩子
- 完成通知机制是 `PlayParams.onComplete(token)`，在 `advanceSimplePlayback` 函数（`AnimationPlayer.ts:525-556`）中调用，触发条件：非 loop 播放 + `frameCursor >= definition.frames.length`
- token 代际校验由 StateMachine 侧通过闭包捕获 token + 检查 `this.currentAnimationToken` 实现（详见 §2.3 示例）

`drowsy.exit` 的帧数：sequences.ts 定义 4 帧（`idle_drowsy_end_01 / idle_drowsy_fade_01 / idle_drowsy_heavy_01 / idle_drowsy_start_01`），`defaultFrameDurationMs` 来自 `petBehaviorConfig.playback.idleDrowsyExitMs`。
`wake.from_nap` 的帧数：sequences.ts 定义 6 帧（`wake_from_nap_start_01 / _rise_01 / _rise_02 / _settle_01 / _awake_01 / _end_01`），`defaultFrameDurationMs` 来自 `petBehaviorConfig.playback.wakeFromNapMs`。

注意：架构稿中 `wake.from_nap` 写为"7 帧"，实际素材为 6 帧。以 sequences.ts 为准。

### 4.3 落地代码/SQL/配置示例

已在 §2.3 中包含 `handleDialogOpenDuringDrowsy` 和 napping 路径（见下文 StateMachine 完整 `handleDialogOpen`），此处不再重复。

**苏醒中断清理**（在 `handleUserFeed` / `handleReminderDue` 中已覆盖，见 §2.3）。额外边界：`handleReminderDue` 中的 napping 路径已经是 `transitionFromNappingWithWake` → 新的 wake.from_nap → `enterRemindingLoopStill`，丢弃原有 pendingDialogOpen。但硬打断还有一条"直接路径"（非 napping 的 reminder.due → `enterTargetedReminder`），该路径不需要额外清理：

```ts
private handleReminderDue(target: Coord): void {
    if (this.state.lifecycle !== 'alive') { return; }
    this.pendingDialogOpen = null;  // 统一在 gate 之后立即丢弃

    if (isIdleNapping(this.state)) {
        this.transitionFromNappingWithWake(() => {
            this.enterRemindingLoopStill();
        });
        return;
    }
    this.player!.clearCSSEffects();
    this.enterTargetedReminder(target);
}
```

### 4.4 注意事项与风险

- `wake.from_nap` 的 onComplete 回调中必须先 `this.currentAnimationToken = null` 再调 `this.enterTalkingLoop()`。这是因为 `enterTalkingLoop` 内部会 `playAnimation(talking.loop)` 触发 `interruptCurrentAnimation`，后者检查 `this.currentAnimationToken !== null` 时会 interpol。若在 onComplete 时不先置 null，会导致对旧 token 做无效 `interrupt` 调用（虽然 AnimationPlayer.interrupt 会因 token 不匹配而 no-op，但语义不洁）。此模式已在现有 `transitionFromNappingWithWake`（`StateMachine.ts:569-571`）和 `enterEatingThenHappy`（`StateMachine.ts:612-613`）中确立。

- **硬打断窗口期**：从 `dispatch({type:'dialog.open'})` 到 `drowsy.exit` 第 1 帧播放之间，存在事件队列处理窗口。在此期间若有 `user.feed` 入队，`handleUserFeed` 会在同一次 `processQueuedEvents` 循环中处理。此时 `isIdleDrowsy(this.state)` 仍为 true（因为 `drowsy.exit` 的 `onComplete` 还没走，state 未变），`handleUserFeed` 会跳过 napping 分支走 `enterEatingThenHappy` 直接路径。`pendingDialogOpen` 被 `handleUserFeed` 中 `this.pendingDialogOpen = null` 正确丢弃。`drowsy.exit` 的 onComplete 因 token 被 `playAnimation(eating)` 内部的 `interruptCurrentAnimation` 作废而 bail out。唯一残留：emitStateChanged 会触发一次"drowsy.exit 开始"的 emit（在 `handleDialogOpenDuringDrowsy` 末尾），但 subscribe 端对此不做 UI 联动，无副作用。

---

## §5 条目 4：DevPanel 按钮组

### 5.1 决策结论

新增两个基础按钮（`Force dialog.open` / `Force dialog.close`），再加两个苏醒路径验证按钮（`Force dialog.open from drowsy` / `Force dialog.open from napping`）。source/reason 固定值。

### 5.2 决策理由

**采选方案**：固定 source='doubleClick' / reason='user'

**备选方案（被否）**：
- 下拉选择 source/reason：对于开发自测没有实际价值（这些枚举尚未有差异化路径），下拉选择引入不必要的 UI 复杂度
- 不新增苏醒路径按钮：手测需要手动等 90s（60s idle.timeout + 30s drowsyToNap），开发体验差

按钮行为严格遵循 K9：`Force dialog.open` / `Force dialog.close` 只 dispatch PetEvent，不直接操作 UI。`dialogStateBridge` 负责 UI 同步兜底。

### 5.3 落地代码/SQL/配置示例

**DevPanel props 扩展** (`src/components/DevPanel/DevPanel.tsx`)：
```ts
export interface DevPanelProps {
  // ...现有 props 保持不变...

  // B2-9 新增
  onForceDialogOpen: () => void;
  onForceDialogClose: () => void;
  onForceDialogOpenFromDrowsy: () => void;
  onForceDialogOpenFromNapping: () => void;
}
```

**DevPanel UI 新增 section**（放在 "Dialog Mock" section 之后）：
```tsx
<section className="dev-panel__group">
  <h3 className="dev-panel__group-title">Force PetEvent (B2-9)</h3>
  <div className="dev-panel__actions">
    <button className="dev-panel__button" onClick={onForceDialogOpen} type="button">
      Force dialog.open
    </button>
    <button className="dev-panel__button" onClick={onForceDialogClose} type="button">
      Force dialog.close
    </button>
    <button className="dev-panel__button" onClick={onForceDialogOpenFromDrowsy} type="button">
      Force dialog.open from drowsy
    </button>
    <button className="dev-panel__button" onClick={onForceDialogOpenFromNapping} type="button">
      Force dialog.open from napping
    </button>
  </div>
</section>
```

**App.tsx handler**：
```ts
const handleDevForceDialogOpen = useCallback(() => {
  dispatch({ type: 'dialog.open', source: 'doubleClick' });
}, [dispatch]);

const handleDevForceDialogClose = useCallback(() => {
  dispatch({ type: 'dialog.close', reason: 'user' });
}, [dispatch]);

const handleDevForceDialogOpenFromDrowsy = useCallback(() => {
  // 先强制进入 drowsy，再派发 dialog.open
  dispatch({ type: 'idle.timeout' });
  dispatch({ type: 'dialog.open', source: 'doubleClick' });
}, [dispatch]);

const handleDevForceDialogOpenFromNapping = useCallback(() => {
  // 先强制进入 napping，再派发 dialog.open
  const state = machineRef.current.getSnapshot().state;
  if (!(state.lifecycle === 'alive' && state.major === 'idle' && state.idleSub === 'drowsy')) {
    dispatch({ type: 'idle.timeout' });
  }
  dispatch({ type: 'timer.drowsyToNap' });
  dispatch({ type: 'dialog.open', source: 'doubleClick' });
}, [dispatch]);
```

### 5.4 注意事项与风险

- `Force dialog.open from drowsy`: 通过 `idle.timeout` 强制进 drowsy 后立即 dispatch `dialog.open`。由于事件队列串行处理，先处理 `idle.timeout`（进入 `idle.drowsy.enter` 动画），再处理 `dialog.open`（但此时 state 已变为 drowsy but 动画可能还在 enter 阶段）。如果在 `idle.drowsy enter` 动画播放期间收到 `dialog.open`，`isIdleDrowsy(this.state)` 为 true，会触发 `handleDialogOpenDuringDrowsy`，进而 interrupt 当前 enter 动画换播 exit。这是预期行为——强制跳过 enter 动画直接 exit。
- `Force dialog.open from napping` 同理，会跳过 `idle.drowsy enter` + `idle.drowsy loop` + `timer.drowsyToNap` 的自然流转，直接 force 到达目标状态。
- K9 约束：DevPanel Force 按钮不触发 UI 动画。如果 Force dialog.close 时 dialog UI 仍打开，`dialogStateBridge` 的下一次 subscribe 触发会检测 `major !== 'talking' && dialogOpen` 并关闭 UI。

---

## §6 条目 5：测试用例集

### 6.1 决策结论

测试文件结构：
- `src/state/StateMachine.dialog.test.ts` — StateMachine 单元测试
- 集成测试逻辑验证在 B2-9 实施报告中以"验证者 checklist"形式提供，不强制要求自动化集成测试框架

### 6.2 决策理由

项目尚无集成测试基础设施（Jest/Vitest + jsdom 应对 Tauri API mock 成本高，之前 B1-* / B2-* 均采用手测 checklist 作为集成验收手段）。StateMachine 是纯逻辑，可直接单测。

### 6.3 测试用例清单

**StateMachine 单元测试**（`StateMachine.dialog.test.ts`）：

```
1. dialog.open from idle.awake → talking immediately, still movement
2. dialog.open from idle.drowsy:
   2a. 状态机内部: pendingDialogOpen 设为 { source: 'doubleClick' }
   2b. AnimationPlayer 收到 idle.drowsy.exit 播放请求
   2c. onComplete 触发 → 状态转为 talking
   2d. getState() 返回 major: 'talking'
3. dialog.open from idle.napping:
   3a. pendingDialogOpen 设为 { source: 'doubleClick' }
   3b. AnimationPlayer 收到 wake.from_nap.oneshot 播放请求
   3c. onComplete 触发 → 状态转为 talking
   3d. getState() 返回 major: 'talking'
4. dialog.open from talking → ignored（getState() 不变）
5. dialog.open from eating → ignored（getState() 不变）
6. dialog.open from happy → ignored（getState() 不变）
7. dialog.open from reminding → ignored（getState() 不变）
8. dialog.close from talking → idle.awake（still movement）
9. dialog.close from idle.awake → ignored with warning
10. dialog.close from idle.drowsy → ignored with warning
11. dialog.close from eating → ignored with warning
12. dialog.close from happy → ignored with warning
13. dialog.close from reminding → ignored with warning
14. user.doubleClick 不再触发状态转换（dispatch 后 getState().major 不变）
15. pendingDialogOpen 在硬打断（user.feed during napping wake）后被清除
16. pendingDialogOpen 在硬打断（reminder.due during drowsy exit）后被清除
17. dialog.open + roaming → movement 强制切 still
18. dialog.close → movement 保持 still，不主动恢复 roaming
19. dialog.open 二次派发（during waking）→ 忽略，pendingDialogOpen 不变
```

### 6.4 注意事项与风险

- 测试中使用 mock AnimationPlayer：`play()` 返回递增 token；`interrupt()` 做 token 失配检测；`onComplete` 回调需要测试框架手动调用（模拟动画完成）以验证异步苏醒路径。
- `console.warn` 的日志验证：使用 `jest.spyOn(console, 'warn')` 验证非合法路径的 warning 输出。
- 测试 helper：项目已有 `src/state/StateMachine.test-helpers.ts`，可扩展示例 mock。

---

## §7 条目 6：interface_v1_2 文档同步

### 7.1 决策结论

版本 bump：v1.2 → v1.3。变更集中在 §2.0（候选提案区标注）、§3.4（talking 备注）、§4.2（PetEvent 新增类型）。

### 7.2 决策理由

不涉及接口破坏性变更，纯追加。按语义化版本，次版本号 +1 即可。

### 7.3 文档变更清单

#### 变更点 1：标题及版本号
```
# ICHAN Phase A 接口定稿 v1.3
```

新增变更摘要段（在 v1.2 摘要之后）：
```
### v1.3 变更摘要（相比 v1.2）
- §2.0 候选提案区：dialog.open / dialog.close 移出候选区，标注"已落地（B2-9）"；
  morningRitual.complete 保留为唯一候选提案，归 B3-5
- §4.2 PetEvent：新增 dialog.open / dialog.close 事件类型
- §3.4 talking 行：备注追加 "B2-9 决策 K2 维持"
- 版本号 bump：v1.2 → v1.3
```

#### 变更点 2：§2.0 候选提案区

当前状态（文档末尾 §8 之后，interface_v1_2.md 没有显式的 §2.0 候选提案段 — 需要新增）：

在 §8 之前新增：
```markdown
## 2.0. 候选提案区

以下为 Phase B 提案的 PetEvent 扩展，尚未落地。落地后移入 §4.2。

```ts
// 候选 PetEvent 扩展（Phase B 提案）
type PhaseBPetEventProposal =
  | { type: 'morningRitual.complete' };   // 归 B3-5

// dialog.open / dialog.close 已落地，见 §4.2（B2-9）
```
```

实际上，`morningRitual.complete` 已经在 §4.2 的 PetEvent 联合类型中（当前 `types.ts` 也有），所以分类归属需要核实。架构稿 §4.1 的最终形态显示 `morningRitual.complete` 留在 PetEvent 中但标注"候选提案保留"。待 GPT 审定任务卡时由 Claude 决定是移除 §2.0 提案区（所有提案均已落地或保留在 PetEvent 中）还是保留提案区为空。

实际执行建议：不新增 §2.0 提案区，而是在 §4.2 中标注：
```
// 生命周期
| { type: 'morningRitual.complete' }   // B3-5 落地
```

#### 变更点 3：§4.2 PetEvent 升级

```ts
export type PetEvent =
  // 生命周期
  | { type: 'morningRitual.complete' }   // B3-5 落地
  | { type: 'user.exit' }

  // 软打断（用户主动互动）
  | { type: 'user.pat' }
  | { type: 'user.doubleClick' }         // v1.3: 降级为通知性，不触发状态转换

  // 硬打断
  | { type: 'user.feed'; csv: File }
  | { type: 'hungry.set'; value: boolean }
  | { type: 'reminder.due'; target: Coord }
  | { type: 'reminder.dismiss' }

  // 内部定时器（由状态机自派发）
  | { type: 'idle.timeout' }
  | { type: 'timer.drowsyToNap' }
  | { type: 'timer.roaming.tick' }

  // 位移契约
  | { type: 'movement.arrive'; requestId: MovementRequestId; position: Coord }

  // === Phase B (B2-9) ===
  | { type: 'dialog.open'; source: DialogOpenSource }
  | { type: 'dialog.close'; reason: DialogCloseReason };

export type DialogOpenSource = 'shortcut' | 'doubleClick' | 'morningRitual';
export type DialogCloseReason = 'user' | 'timeout' | 'service_done' | 'error';
```

#### 变更点 4：§3.4 talking 行备注

```markdown
| `talking` | `loop` | v1.0 仅 loop；exit 暂不开放（B2-9 决策 K2 维持） |
```

（当前显示为 `v1.0 仅 loop；exit 暂不开放`，追加决策引用即可。）

#### 变更点 5：§6 实现者自测清单（新增 B2-9 条目）

在任务 3 自测清单末尾追加：
```
- [ ] `dialog.open` 三种 source 均合法派发；`dialog.close` 四种 reason 均合法派发
- [ ] `user.doubleClick` 降级为通知性，不触发状态转换
- [ ] `dialog.open from idle.awake` 直接进 talking
- [ ] `dialog.open from idle.drowsy` 先播 `idle.drowsy exit` 再进 talking
- [ ] `dialog.open from idle.napping` 先播 `wake.from_nap oneshot` 再进 talking
- [ ] `dialog.close from talking` 转 `idle.awake`；非 talking 状态下 ignore + warning log
```

### 7.4 注意事项与风险

- `types.ts` 与 `interface_v1_2.md` 需要同步更新。`types.ts` 是运行时真值源，修改后所有编译引用自动生效；`interface_v1_2.md` 是文档契约，二者内容必须一致。
- `DialogOpenSource` 中 `'morningRitual'` 保留但本卡不实现（归 B3-5）。这与 `DialogCloseReason` 中的 `'timeout'` / `'service_done'` 保留不实现的模式一致。

---

## §8 条目 7：`user.doubleClick` 状态机分支处理

### 8.1 决策结论

`case 'user.doubleClick'` 降级为通知性空操作，原有 `idle.drowsy → talking` / `idle.awake → talking` 逻辑迁移到新增的 `case 'dialog.open'` 分支。

### 8.2 决策理由

K6 已锁定：`user.doubleClick`（物理事件）与 `dialog.open`（意图事件）语义分层。物理事件仅陈述"用户做了双击"，状态转换由意图事件驱动。保留 `user.doubleClick` 事件类型用于 future use，不移除联合类型成员。

### 8.3 落地代码/SQL/配置示例

**StateMachine `handleEvent` switch 增量**：

```ts
private handleEvent(event: PetEvent): void {
    switch (event.type) {
      // ... 既有 case 保持不变 ...

      case 'user.doubleClick':
        // B2-9 K6: notification-only. State transitions moved to 'dialog.open'.
        // Input-layer fact: user performed a double-click on the pet.
        return;

      case 'dialog.open':
        this.handleDialogOpen(event.source);
        return;

      case 'dialog.close':
        this.handleDialogClose(event.reason);
        return;

      // ... 其余 case ...
    }
}
```

**handleDialogOpen 完整实现**：
```ts
private handleDialogOpen(source: DialogOpenSource): void {
    if (this.state.lifecycle !== 'alive') {
        console.warn('[StateMachine] dialog.open ignored: lifecycle=%s', this.state.lifecycle);
        return;
    }

    // Gate: non-idle majors ignore (集成层 dialogRouter 已做一层 gate，此处防御重复)
    if (isTalking(this.state)) {
        return;
    }
    if (isEating(this.state) || isReminding(this.state)) {
        console.warn('[StateMachine] dialog.open ignored: major=%s', this.state.major);
        return;
    }

    if (isIdleAwake(this.state)) {
        // enterTalkingLoop() internally creates still movement via createStillMovement().
        // No need to dispatch timer.roaming.tick in advance — committing talking state
        // triggers emitStateChanged, and the subscriber's syncWindowMovementFromState
        // sees movement.state === 'still' and calls stopWindowMovementLoop().
        this.enterTalkingLoop();
        return;
    }

    if (isIdleDrowsy(this.state)) {
        this.timers.clearAll();
        this.player!.detachCSSEffect('drowsy-breath');

        const exitToken = this.playAnimation({
            state: 'idle.drowsy',
            intent: 'exit',
            onComplete: (tok) => {
                if (tok !== exitToken || tok !== this.currentAnimationToken) { return; }
                this.enterTalkingLoop();
            },
        });
        this.currentAnimationToken = exitToken;
        this.pendingDialogOpen = { source };
        this.emitStateChanged();
        return;
    }

    if (isIdleNapping(this.state)) {
        this.timers.clearAll();
        this.player!.clearCSSEffects();

        const wakeToken = this.playAnimation({
            state: 'wake.from_nap',
            intent: 'oneshot',
            onComplete: (tok) => {
                if (tok !== wakeToken || tok !== this.currentAnimationToken) { return; }
                this.currentAnimationToken = null;
                this.enterTalkingLoop();
            },
        });
        this.currentAnimationToken = wakeToken;
        this.pendingDialogOpen = { source };
        this.emitStateChanged();
        return;
    }
}
```

**handleDialogClose 完整实现**：
```ts
private handleDialogClose(reason: DialogCloseReason): void {
    if (!isTalking(this.state)) {
        console.warn('[StateMachine] dialog.close ignored: major=%s idleSub=%s',
            this.state.major, this.state.idleSub ?? 'N/A');
        return;
    }
    this.enterIdleAwakeStill();
}
```

### 8.4 注意事项与风险

- 现有的 `handleDrowsySoftInterruptToTalking()` 方法（`StateMachine.ts:542-559`）：此方法是专供 `user.doubleClick` 使用的内部接口。`dialog.open` 的 drowsy 路径逻辑与之几乎相同（都播 `idle.drowsy.exit` 后进 `talking`），但二选一处理：
  1. `dialog.open` 复用 `handleDrowsySoftInterruptToTalking`：若选择此路径，需要在其中注入 `pendingDialogOpen` 设置逻辑，会让该方法的意图变模糊（原意为"软打断到 talking"，现需要承载"dialog.open 的 pending 标记"）— **不推荐**
  2. `dialog.open` 独立实现（如上代码）：代码有重复（~15行），但语义清晰，且 `pendingDialogOpen` 只在 `dialog.open` 路径使用 — **推荐**

  选方案 2。重复量在可接受范围内（~15 行），未来若需要统一抽象再行重构。

- `handleDrowsySoftInterruptToTalking()` 在 `user.doubleClick` 降级后变为死代码。不得删除（K6 规定保留分支），但将不再被任何事件路径调用。可以保留在类中供 future use，或标注 `@deprecated` 注释。

- `happy` 状态不在 dialog.open 处理范围内 — 因为 happy 是 oneshot 过渡状态（`happy → idle.awake` 自动完成），且集成层 `dialogRouter.shouldOpenDialog` 在当前实现中返回 true for happy。若 `dialog.open` 在 happy 期间到达，`handleDialogOpen` 中的 gate 判断 `isEating || isReminding` 不包括 happy，`isIdleAwake/isIdleDrowsy/isIdleNapping` 也不包括 happy（happy 的 major 是 'happy'）。这意味着会落入 switch 末尾（什么都不做）。**这不是 bug**——happy 动画完成后自动 `enterIdleAwakeStill` → emitStateChanged → subscriber 检测到 talking 进入会开 dialog。但在本卡 B2-9 范围内，`happy + dialog.open` 不立即切 talking 是已知的行为特性；若产品认为这是缺陷，应在 B3-x 改正。

---

## §9 条目 8：Ctrl+Alt+T 快捷键

### 9.1 决策结论

注册 `Ctrl+Alt+T` 全局快捷键，经 `dialogRouter.shouldOpenDialog` 判断后派发 `dialog.open({ source: 'shortcut' })`。

### 9.2 决策理由

B1-10 现状：`openDialogByStateOrFallback()` 直接派发 `user.doubleClick`（再通过状态机过渡到 talking）。B2-9 后 `user.doubleClick` 降级为通知性，须改为派发 `dialog.open`，且通过 `dialogRouter` 做 gate。

### 9.3 落地代码/SQL/配置示例

已在上方 §3.3 的 Ctrl+Alt+T 部分给出完整代码。

### 9.4 注意事项与风险

- 快捷键注册需在 `unregisterAll()` 之后，与 `CLICK_THROUGH_SHORTCUT`/`DEV_PANEL_SHORTCUT` 并列。dispose 时 `unregisterAll()` 自动清理（`@tauri-apps/plugin-global-shortcut` 的 `unregisterAll` 清理所有已注册快捷键）。
- Debounce：与现有 click-through 共用 `SHORTCUT_DEBOUNCE_MS`，避免连续按键导致多次 dispatch。
- 快捷键触发时不再需要 `openDialogByStateOrFallback` 的 3 次 probe 递进逻辑（原来是为了兜底状态机未响应 `user.doubleClick` 的情况）。B2-9 后 `dialog.open` 直接触发状态转换，probe 逻辑可以移除。
- B1-10 的 `openDialogByStateOrFallback` 中还有一个 `setTimeout` 200ms 后的 `stabilizeDialogMovementVisual` 兜底调用。B2-9 后不再需要此逻辑（Ctrl+Alt+T 通过 dialogRouter + dialog.open 直接触发）。但 `openDialogByStateOrFallback` 仍被 DevPanel 的 "Open Dialog Mock" 按钮引用，该按钮也应改为走 dialogRouter 路径。

---

## §10 条目 9：错误处理

### 10.1 决策结论

统一使用 `console.warn`（非预期但可恢复路径）和 `console.error`（bridge 检测到不一致状态）。不引入独立的 logger 模块。

### 10.2 决策理由

项目规模当前不需要结构化日志。`console.warn` / `console.error` 在 DevPanel 中不可见（DevPanel 仅显示状态快照），但在浏览器控制台（Tauri WebView 调试模式）可查看。

### 10.3 日志点位清单

| 位置 | 级别 | 触发条件 | 格式 |
|---|---|---|---|
| `handleDialogOpen` | `console.warn` | `lifecycle !== 'alive'` | `[StateMachine] dialog.open ignored: lifecycle=%s` |
| `handleDialogOpen` | `console.warn` | `major === 'eating' \|\| 'reminding'` | `[StateMachine] dialog.open ignored: major=%s` |
| `handleDialogClose` | `console.warn` | `major !== 'talking'` | `[StateMachine] dialog.close ignored: major=%s idleSub=%s` |
| `dialogStateBridge` | `console.error` | `major !== 'talking' && dialogOpen` | `[dialogStateBridge] state/UI mismatch: major=%s dialogOpen, triggering UI close` |

`handleDialogOpen` 中 `talking` 忽略不记日志（正常重复打开请求，K7-2 规定忽略且不抛错）。

### 10.4 注意事项与风险

- `dialog.close` 中 `'timeout'` / `'service_done'` / `'error'` 三种 reason 目前无路径派发。如果 Codex 在实施中提前为这些 reason 留了派发路径（如 timer 到期派发 `{type:'dialog.close', reason:'timeout'}`），`handleDialogClose` 的 `console.warn` 会捕获非 talking 状态下的不合理派发。这是预期行为，有助早期发现 bug。

---

## §11 条目 10：param_audit.md 同步

### 11.1 决策结论

`param_audit.md` 登记 interface_v1_2.md 版本 bump（v1.2 → v1.3）及变更摘要。PetEvent 新增成员不视为"参数变更"（事件类型是联合类型扩展，不改变接口方法签名），但为完整性仍需登记。

### 11.2 落地内容

在 `param_audit.md` 末追加：
```markdown
## B2-9 (2026-04-29)

- **interface_v1_2.md** version: v1.2 → v1.3
  - §4.2 PetEvent: 新增 `dialog.open` / `dialog.close` 事件类型
  - §3.4 talking 行: 备注 "B2-9 决策 K2 维持"
  - 新增 `DialogOpenSource` / `DialogCloseReason` 类型（与 PetEvent 共置）
- 无方法签名变更（PetEvent 是联合类型扩展，不影响 StateMachine.dispatch / subscribe 契约）
```

---

## §12 补充：StateMachine 中现有方法复用与重构指引

### 12.1 可复用的现有方法

| 方法 | 用途 | B2-9 使用 |
|---|---|---|
| `enterTalkingLoop()` | 进入 talking 状态 | `dialog.open` (idle.awake) / drowsy exit onComplete / napping wake onComplete |
| `enterIdleAwakeStill()` | 退出 talking，进 idle.awake still | `dialog.close` |
| `interruptCurrentAnimation()` | 打断当前动画 | 每次 `playAnimation()` 隐式调用 |
| `playAnimation(params)` | 播放动画序列 | 苏醒动画播放入口 |

### 12.2 变为死代码的方法

| 方法 | 说明 |
|---|---|
| `handleDrowsySoftInterruptToTalking()` | 仅供 `user.doubleClick` 使用，降级后不再被调用。保留但不删除（K6 要求）。 |

### 12.3 需新增的方法

| 方法 | 说明 |
|---|---|
| `handleDialogOpen(source)` | 新增 `dialog.open` 事件处理 |
| `handleDialogClose(reason)` | 新增 `dialog.close` 事件处理 |

---

## §13 给 GPT 起任务卡时的关键提示

1. **Ctrl+Alt+T 快捷键注册**容易遗漏：GPT 起卡时需在 App.tsx 修改清单中明确列出"注册 Ctrl+Alt+T 全局快捷键"项，并与现有 `CLICK_THROUGH_SHORTCUT` 的注册逻辑并列。
2. **`pendingDialogOpen` 的 set 时序**：必须在 `playAnimation()` 之后赋值（见 §2.4），GPT 的任务卡应注明此约束，否则 Codex 容易直接把 set 写在 `playAnimation` 之前。
3. **wake.from_nap 的 onComplete 中 `this.currentAnimationToken = null`**：见 §4.4，GPT 需在苏醒相关的 onComplete 代码骨架中显式写出这行，Codex 可能忽略此细节。
4. **interface_v1_2.md 与 types.ts 双重同步**：GPT 确认任务卡包含两个文件修改——`types.ts`（运行时）和 `interface_v1_2.md`（文档契约），避免只改一个。
5. **DevPanel 新增 4 个 handler**需在 App.tsx 和 DevPanel.tsx 两端同步（props 定义 + 按钮渲染 + handler 实现）。
6. **`requestDialogClose` 中的 `user.pat` hack**需要替换为 `dialog.close` dispatch（App.tsx:772）。
7. **`finalizeDialogClose` 中的 B2-9 TODO**需要实现 bridge 集成（App.tsx:603）。
8. **`dialogStateBridge.ts`** 的实现规范见架构稿 §4.4，任务卡应包含该文件的完整创建条目。

---

## §14 架构层疑问

无。所有架构决策在本轮细化中均可执行，未发现与技术事实冲突或条目间矛盾。

- `wake.from_nap` 帧数（6 帧 vs 架构稿的 7 帧）属轻微偏差，不影响设计逻辑，以 sequences.ts 实际素材为准。

