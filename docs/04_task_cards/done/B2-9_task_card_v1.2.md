# B2-9 任务卡 · talking 正常退出机制闭合

**版本**: v1.2（Codex 可执行版，吸收 DeepSeek v0.2 + Claude v0.3 patch 裁定）
**日期**: 2026-04-29

**执行**: Codex
**对应任务**: B2-9 / 任务 9（talking 正常退出机制闭合）
**依赖**: B1-4 DeepSeekService ✅、B1-10 对话 UI ✅、B1-10A anchor 过渡 ✅、B0-11 chat_messages ✅

---

## 行号引用约定

本卡引用的所有行号均为**参考定位**，基于当前文档与代码快照。Codex 必须先用 `rg -n "<关键字>"` / `rg -n "<函数名>"` 确认实际位置后再编辑。行号偏差不视为任务卡错误。

---

## 0. 任务定位

本卡闭合 i酱 `talking` 状态的正式打开/关闭机制：

1. 将 `dialog.open` / `dialog.close` 纳入正式 `PetEvent` 契约。
2. 将 `user.doubleClick` 降级为**通知性物理事件**，不再直接驱动状态转换。
3. 由集成层 `dialogRouter` 将双击 / `Ctrl+Alt+T` 物理输入转换为 `dialog.open` 意图事件。
4. 由 StateMachine 处理：

   * `idle.awake + dialog.open` → 直接进入 `talking`
   * `idle.drowsy + dialog.open` → 先播 `idle.drowsy exit`，完成后进 `talking`
   * `idle.napping + dialog.open` → 先播 `wake.from_nap oneshot`，完成后进 `talking`
   * `talking + dialog.close` → 回 `idle.awake`
5. 由 `dialogStateBridge` 处理 talking 被硬打断后的 UI 关闭兜底。
6. Esc / X / onClose 走“状态机关闭事件 + UI 关闭动画”双轨并行。

核心原则：

```text
user.doubleClick = 输入层事实
dialog.open      = 对话打开意图
dialog.close     = talking 正常退出事件
feed/reminder    = talking 硬打断；不派发 dialog.close
```

---

## 1. 范围

### 1.1 范围内

* 修改 `src/components/Pet/types.ts`

  * 新增 `DialogOpenSource`
  * 新增 `DialogCloseReason`
  * `PetEvent` 新增 `dialog.open` / `dialog.close`
  * `user.doubleClick` 保留，但注释为通知性事件

* 修改 `src/state/StateMachine.ts`

  * 新增 `pendingDialogOpen` private 字段
  * 新增 `handleDialogOpen(source)`
  * 新增 `handleDialogClose(reason)`
  * `user.doubleClick` 分支降级为空操作
  * `dialog.open` 覆盖 `idle.awake / idle.drowsy / idle.napping`
  * 非法状态收到 `dialog.open` / `dialog.close` 时 ignore + warning
  * talking 期间 movement 锁为 `still`
  * `dialog.close` 不主动恢复 roaming

* 新增 `src/integration/dialogRouter.ts`

  * 严格 idle-only gate
  * 只允许 `lifecycle === 'alive' && major === 'idle' && !dialogOpen`
  * `happy/eating/reminding/talking` 全部返回 false

* 新增 `src/integration/dialogStateBridge.ts`

  * 单向关闭兜底
  * 只处理 `talking → non-talking` 且 dialog UI 仍打开的情况
  * 不处理 `idle → talking`
  * 不自动打开 UI

* 修改 `src/App.tsx`

  * 双击宠物：先派发 `user.doubleClick`，再经 router 派发 `dialog.open`
  * 注册 `Ctrl+Alt+T` 快捷键，走同一 router 路径
  * Esc / X / onClose：派发 `dialog.close({ reason: 'user' })`，并并行执行 UI 关闭动画
  * talking 被 feed/reminder 打断时，由 bridge 关闭 UI，但不派发 `dialog.close`
  * DevPanel Force open 不打开 UI；Force close 可通过 bridge 关闭 UI

* 修改 `src/components/DevPanel/DevPanel.tsx`

  * 新增 4 个 B2-9 Force PetEvent 按钮

* 新增测试

  * `src/state/StateMachine.dialog.test.ts`
  * `src/integration/dialogRouter.test.ts`
  * `src/integration/dialogStateBridge.test.ts`

* 文档同步

  * `docs/01_contracts/interface_v1_2.md`
  * `docs/readme_devpanel.md`
  * `docs/param_audit.md`
  * `docs/docs_index.md`
  * `docs/03_execution/phaseb_execution_plan.md`
  * `docs/ichan_project_doc.md`
  * `docs/02_ui_schema/talking_interaction_schema.md`

### 1.2 范围外

* **不**开放 `talking exit` intent。
* **不**新增 talking exit spritesheet。
* **不**实现 inactivity timeout。
* **不**实现 `doneHint` 链路。
* **不**改 `DeepSeekService.chat()` 返回类型。
* **不**修改 `MajorState` 五态。
* **不**修改 `chat_messages / ChatHistoryStore / ChatMemoryStore`。
* **不**改变 B1-10A 已落地的 dialog 关闭动画时序。
* **不**实现 `morningRitual.complete`。
* **不**新增 StateMachine public API。
* **不**把 `pendingDialogOpen` 暴露进 `PetFullState`。

---

## 2. 已决议项

| #    | 决议                                               | 本卡落地方式                                             |
| ---- | ------------------------------------------------ | -------------------------------------------------- |
| K1   | `dialog.open` / `dialog.close` 同时纳入正式 `PetEvent` | 修改 `types.ts` + `interface_v1_2.md`                |
| K2   | talking exit intent 不开放                          | `talking` 仍仅支持 `loop`                              |
| K3   | inactivity timeout 不实现                           | `timeout` 仅保留枚举，无运行时派发                             |
| K4   | doneHint 链路不实现                                   | `service_done` 仅保留枚举，无运行时派发                        |
| K5   | UI 关闭动画与 `dialog.close` 并行派发                     | `requestDialogClose({ dispatchStateEvent: true })` |
| K6   | `user.doubleClick` 完整保留，但状态转换只由 `dialog.open` 触发 | StateMachine 分支空操作；App 层 router fan-out            |
| K7   | `dialog.close` 是 talking 正常退出；feed/reminder 是打断  | 打断时 bridge 关 UI，但不派发 `dialog.close`                |
| K7-2 | drowsy/napping 收到 `dialog.open` 后串行苏醒            | `pendingDialogOpen` + animation `onComplete`       |
| K8   | `dialogStateBridge` 独立模块，单向关闭兜底                  | 不处理打开路径                                            |
| K9   | DevPanel Force 按钮只 dispatch，不直接触发 UI             | Force open 不开 UI；Force close 可验证 bridge            |

---

## 3. 接口契约

### 3.1 `DialogOpenSource`

```ts
export type DialogOpenSource = 'shortcut' | 'doubleClick' | 'morningRitual';
```

说明：

* `'shortcut'`: `Ctrl+Alt+T`
* `'doubleClick'`: 双击宠物
* `'morningRitual'`: 类型保留，本卡不实现，归 B3-5

### 3.2 `DialogCloseReason`

```ts
export type DialogCloseReason = 'user' | 'timeout' | 'service_done' | 'error';
```

说明：

* `'user'`: Esc / X / 显式关闭
* `'timeout'`: 类型保留，本卡不实现
* `'service_done'`: 类型保留，本卡不实现
* `'error'`: 类型保留，本卡不实现

### 3.3 `PetEvent` 增量

```ts
export type PetEvent =
  // ...既有事件保持不变...

  | { type: 'user.doubleClick' } // B2-9: notification-only，不触发状态转换

  // === Phase B 新增（B2-9）===
  | { type: 'dialog.open'; source: DialogOpenSource }
  | { type: 'dialog.close'; reason: DialogCloseReason };
```

---

## 4. 运行时语义

### 4.1 打开路径

```text
用户双击 / Ctrl+Alt+T
    │
    ├── dispatch({ type: 'user.doubleClick' })   // 仅双击时派发；快捷键不派发
    │
    └── dialogRouter
          │
          ├── alive + idle + dialog 未打开 → dispatch({ type: 'dialog.open', source })
          └── 其他状态 → 忽略
```

### 4.2 UI 打开时机

* `idle.awake`：`dialog.open` 后 StateMachine 同步进入 `talking`，UI 可立即打开。
* `idle.drowsy`：先播 `idle.drowsy exit`，StateMachine 进入 `talking` 后再打开 UI。
* `idle.napping`：先播 `wake.from_nap oneshot`，StateMachine 进入 `talking` 后再打开 UI。

实现方式：

```text
App 物理输入路径设置 pendingDialogUiOpenRef = true
dispatch(dialog.open)
StateMachine 进入 talking 后 emitStateChanged
App 订阅检测 pendingDialogUiOpenRef && major === 'talking'
触发 requestDialogOpen()
pendingDialogUiOpenRef = false
```

注意：这个 pending UI open 只由真实双击 / 快捷键路径设置。DevPanel Force dialog.open 不设置，因此 UI 不自动打开。

### 4.3 关闭路径

```text
用户按 Esc / X / onClose
    │
    ├── dispatch({ type: 'dialog.close', reason: 'user' })
    │       └── talking → idle.awake
    │
    └── UI 关闭动画
            closing.messages → closing.shell → closing.window → compact
```

### 4.4 硬打断路径

```text
talking 期间发生 user.feed / reminder.due
    │
    └── StateMachine 走既有硬打断路径
            talking → eating / reminding
            不派发 dialog.close
    │
    └── dialogStateBridge 检测：
            prevMajor === 'talking'
            nextMajor !== 'talking'
            dialog UI 仍打开
            当前不是 UI 主动 closing
        → 触发 UI 关闭动画
        → 不派发 dialog.close
```

### 4.5 DevPanel Force 按钮语义

| 按钮                               | 状态机动作                                                | UI 动作               | 预期              |
| -------------------------------- | ---------------------------------------------------- | ------------------- | --------------- |
| `Force dialog.open`              | dispatch `dialog.open`                               | 不打开 UI              | 只验证状态机/动画层      |
| `Force dialog.close`             | dispatch `dialog.close`                              | 若 UI 正开，由 bridge 关闭 | 验证 bridge 关闭兜底  |
| `Force dialog.open from drowsy`  | `idle.timeout` + `dialog.open`                       | 不打开 UI              | 验证 drowsy 苏醒路径  |
| `Force dialog.open from napping` | `idle.timeout` + `timer.drowsyToNap` + `dialog.open` | 不打开 UI              | 验证 napping 苏醒路径 |

---

## 5. 实施步骤（按 commit 拆分）

---

### Commit 0 — `feat:` upgrade dialog PetEvent contract

**目标**：升级运行时类型与接口文档契约。

#### 前置检查

```bash
rg -n "export type PetEvent|type PetEvent" src docs
rg -n "user.doubleClick|morningRitual.complete|hungry.set" src/components/Pet/types.ts docs/01_contracts/interface_v1_2.md
rg -n "talking.*loop|SupportedIntentMap|interface_v1_2" docs/01_contracts/interface_v1_2.md src/components/Pet/types.ts
rg -n "dialog.open|dialog.close|DialogOpenSource|DialogCloseReason" src docs
```

#### 改动清单

**A. `src/components/Pet/types.ts`**

在 `PetEvent` 附近新增：

```ts
export type DialogOpenSource = 'shortcut' | 'doubleClick' | 'morningRitual';
export type DialogCloseReason = 'user' | 'timeout' | 'service_done' | 'error';
```

在 `PetEvent` 联合类型中加入：

```ts
  | { type: 'dialog.open'; source: DialogOpenSource }
  | { type: 'dialog.close'; reason: DialogCloseReason };
```

将 `user.doubleClick` 注释改为：

```ts
  | { type: 'user.doubleClick' } // B2-9: notification-only；状态转换由 dialog.open 触发
```

**B. `docs/01_contracts/interface_v1_2.md`**

版本号：

```markdown
# ICHAN Phase A 接口定稿 v1.3
```

新增 v1.3 变更摘要：

```markdown
### v1.3 变更摘要（相比 v1.2）
- §4.2 `PetEvent` 新增 `dialog.open` / `dialog.close`。
- 新增 `DialogOpenSource` / `DialogCloseReason` 类型。
- `user.doubleClick` 保留，但降级为通知性事件，不再直接触发状态转换。
- §3.4 `talking` 继续仅支持 `loop`，B2-9 不开放 talking exit intent。
```

在 §4.2 `PetEvent` 中加入：

```ts
export type DialogOpenSource = 'shortcut' | 'doubleClick' | 'morningRitual';
export type DialogCloseReason = 'user' | 'timeout' | 'service_done' | 'error';
```

并把 `dialog.open` / `dialog.close` 加入正式 `PetEvent`。

**C. 不新增含糊的 §2.0 候选区**

若当前文档已有候选提案区，只做如下调整：

```ts
// dialog.open / dialog.close 已正式纳入 §4.2 PetEvent（B2-9）
// morningRitual.complete 保留现状，本卡不处理，归 B3-5
```

不得写“待 GPT/Claude 决定”。

#### Commit 0 验收

```bash
pnpm exec tsc --noEmit
rg -n "DialogOpenSource|DialogCloseReason|dialog.open|dialog.close" src/components/Pet/types.ts docs/01_contracts/interface_v1_2.md
rg -n "notification-only|通知性" src/components/Pet/types.ts docs/01_contracts/interface_v1_2.md
```

---

### Commit 1 — `feat:` implement dialog open/close in StateMachine

**目标**：让状态机正式消费 `dialog.open` / `dialog.close`，并将 `user.doubleClick` 降级为空操作。

#### 前置检查

```bash
rg -n "case 'user.doubleClick'|user.doubleClick" src/state src/components
rg -n "enterTalkingLoop|enterIdleAwakeStill|handleDrowsySoftInterruptToTalking" src/state/StateMachine.ts
rg -n "isIdleAwake|isIdleDrowsy|isIdleNapping|isTalking|handleEvent" src/state/StateMachine.ts
rg -n "currentAnimationToken|playAnimation|interruptCurrentAnimation" src/state/StateMachine.ts
```

#### 改动清单

**A. `src/state/StateMachine.ts` import 类型**

确保可用：

```ts
import type {
  DialogOpenSource,
  DialogCloseReason,
  PetFullState,
  PetEvent,
} from '../components/Pet/types';
```

具体路径以现有 import 为准。

**B. 新增 private 字段**

在 `PetStateMachine` 类内新增：

```ts
private pendingDialogOpen: { source: DialogOpenSource } | null = null;
```

在 `start()` 中 `this.destroyed = false` 之后加入：

```ts
this.pendingDialogOpen = null;
```

在 `destroy()` 清理逻辑开头加入：

```ts
this.pendingDialogOpen = null;
```

**C. 修改硬打断清理**

在 `handleUserFeed()` lifecycle gate 之后、任何动画播放之前加入：

```ts
this.pendingDialogOpen = null;
```

在 `handleReminderDue()` lifecycle gate 之后、任何动画播放之前加入：

```ts
this.pendingDialogOpen = null;
```

**D. 修改 `handleEvent`**

```ts
case 'user.doubleClick':
  // B2-9 K6: notification-only. State transitions moved to dialog.open.
  return;

case 'dialog.open':
  this.handleDialogOpen(event.source);
  return;

case 'dialog.close':
  this.handleDialogClose(event.reason);
  return;
```

**E. 新增 helper**

```ts
private isIdle(state: Readonly<PetFullState>): boolean {
  return state.major === 'idle';
}
```

如果已有等价 helper，复用现有实现，不重复新增。

**F. 新增 `handleDialogOpen`**

```ts
private handleDialogOpen(source: DialogOpenSource): void {
  if (this.state.lifecycle !== 'alive') {
    console.warn('[StateMachine] dialog.open ignored: lifecycle=%s', this.state.lifecycle);
    return;
  }

  // repeated open request: expected no-op
  if (isTalking(this.state)) {
    return;
  }

  // Router 层负责严格产品 gate；StateMachine 层只做宽容防御。
  // eating / happy / reminding 等非法入口统一 ignore + warning。
  if (!this.isIdle(this.state)) {
    console.warn('[StateMachine] dialog.open ignored: major=%s', this.state.major);
    return;
  }

  if (isIdleAwake(this.state)) {
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
        if (tok !== exitToken || tok !== this.currentAnimationToken) {
          return;
        }
        this.enterTalkingLoop();
      },
    });

    this.currentAnimationToken = exitToken;
    this.pendingDialogOpen = { source }; // 必须在 playAnimation() 之后赋值
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
        if (tok !== wakeToken || tok !== this.currentAnimationToken) {
          return;
        }
        this.currentAnimationToken = null;
        this.enterTalkingLoop();
      },
    });

    this.currentAnimationToken = wakeToken;
    this.pendingDialogOpen = { source }; // 必须在 playAnimation() 之后赋值
    this.emitStateChanged();
    return;
  }
}
```

**G. 修改 `enterTalkingLoop()`**

在方法开头加入：

```ts
this.pendingDialogOpen = null;
```

并确认进入 talking 时 movement 被强制为 `still`。若已有实现，则不得重复派发 roaming 恢复逻辑。

**H. 新增 `handleDialogClose`**

```ts
private handleDialogClose(reason: DialogCloseReason): void {
  if (!isTalking(this.state)) {
    console.warn(
      '[StateMachine] dialog.close ignored: major=%s idleSub=%s',
      this.state.major,
      this.state.idleSub ?? 'N/A',
    );
    return;
  }

  this.enterIdleAwakeStill();
}
```

`reason` 当前不分支处理，但必须保留参数。

**I. 保留 `handleDrowsySoftInterruptToTalking()`**

该方法因 `user.doubleClick` 降级可能变成死代码，但本卡不删除。不得扩大重构范围。

#### Commit 1 验收

```bash
pnpm exec tsc --noEmit
rg -n "pendingDialogOpen|handleDialogOpen|handleDialogClose" src/state/StateMachine.ts
rg -n "case 'user.doubleClick'|case 'dialog.open'|case 'dialog.close'" src/state/StateMachine.ts
rg -n "dialog.open ignored|dialog.close ignored" src/state/StateMachine.ts
```

---

### Commit 2 — `feat:` add dialogRouter and wire open path

**目标**：将双击 / `Ctrl+Alt+T` 的打开逻辑改为“物理事件 → router → `dialog.open`”，并处理 drowsy/napping 串行苏醒后的 UI 打开。

#### 前置检查

```bash
rg -n "handleDoubleClick|onDoubleClick|user.doubleClick" src/App.tsx src/components
rg -n "Ctrl\\+Alt\\+T|CLICK_THROUGH_SHORTCUT|DEV_PANEL_SHORTCUT|register\\(" src/App.tsx src/config
rg -n "openDialogByStateOrFallback|requestDialogOpen|runDialogOpenTransition|dialogModeActiveRef" src/App.tsx
rg -n "subscribe\\(|emitStateChanged|handlePlayerReady" src/App.tsx src/state/StateMachine.ts
```

#### 改动清单

**A. 新增 `src/integration/dialogRouter.ts`**

```ts
import type {
  DialogOpenSource,
  PetEvent,
  PetFullState,
} from '../components/Pet/types';

/**
 * Router 层：严格产品 gate。
 *
 * 只在 alive + idle + dialog 未打开时放行 dialog.open。
 * happy / eating / reminding / talking 全部返回 shouldDispatch=false。
 *
 * StateMachine 层另做宽容防御：非法 dialog.open ignore + warning。
 * 两层职责分离，不因 StateMachine 能容忍而扩大 router 放行范围。
 */
export function routePhysicalEventToDialogOpen(
  state: Readonly<PetFullState>,
  isDialogOpen: () => boolean,
  source: DialogOpenSource,
): { shouldDispatch: boolean; event?: PetEvent } {
  const canOpen =
    state.lifecycle === 'alive' &&
    state.major === 'idle' &&
    !isDialogOpen();

  if (!canOpen) {
    return { shouldDispatch: false };
  }

  return {
    shouldDispatch: true,
    event: { type: 'dialog.open', source },
  };
}
```

**B. `src/App.tsx` import**

```ts
import { routePhysicalEventToDialogOpen } from './integration/dialogRouter';
```

实际相对路径按当前文件位置调整。

**C. 新增 pending UI open ref**

在 App component 内新增：

```ts
const pendingDialogUiOpenRef = useRef(false);
```

**D. 新增真实打开请求 helper**

```ts
const requestDialogOpenFromPhysicalEvent = useCallback((source: DialogOpenSource) => {
  const snapshot = machineRef.current.getSnapshot().state;

  const route = routePhysicalEventToDialogOpen(
    snapshot,
    () => dialogModeActiveRef.current,
    source,
  );

  if (!route.shouldDispatch || !route.event) {
    return;
  }

  // 只由真实物理打开路径设置。DevPanel Force dialog.open 不设置。
  pendingDialogUiOpenRef.current = true;
  dispatch(route.event);
}, [dispatch]);
```

**E. 在 StateMachine subscribe 中消费 pending UI open**

在现有 `machine.subscribe(...)` 或 `handlePlayerReady` 内的订阅逻辑中加入：

```ts
if (
  pendingDialogUiOpenRef.current &&
  nextState.lifecycle === 'alive' &&
  nextState.major === 'talking' &&
  !dialogModeActiveRef.current
) {
  pendingDialogUiOpenRef.current = false;
  requestDialogOpen();
}
```

注意：

* `requestDialogOpen()` 指现有 B1-10A 打开 UI 的函数。
* 不得把这段逻辑写进 `dialogStateBridge.ts`。
* 这不是“状态机进入 talking 自动开 UI”的全局 bridge；它只消费真实物理打开路径预先设置的 pending flag。
* DevPanel Force dialog.open 不设置 `pendingDialogUiOpenRef`，因此 UI 不会打开。

若现有订阅函数无法直接访问 `requestDialogOpen()`，可新建 App 内部 callback ref，但不要新增 StateMachine public API。

**F. 修改双击处理**

将原先双击直接触发 talking / UI open 的逻辑替换为：

```ts
const handleDoubleClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
  event.preventDefault();

  if (dialogModeActiveRef.current) {
    return;
  }

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

  dispatch({ type: 'user.doubleClick' });
  requestDialogOpenFromPhysicalEvent('doubleClick');
}, [dispatch, requestDialogOpenFromPhysicalEvent]);
```

变量名按现有代码实际情况调整。

**G. 注册 `Ctrl+Alt+T`**

在全局快捷键注册处新增：

```ts
const DIALOG_SHORTCUT = 'Ctrl+Alt+T';
```

在 `register` 块中加入：

```ts
await register(DIALOG_SHORTCUT, (event) => {
  if (disposed) {
    return;
  }

  const keyState = String(event.state ?? '').toLowerCase();
  if (keyState !== 'pressed') {
    return;
  }

  const now = performance.now();
  if (now - lastShortcutAtRef.current < SHORTCUT_DEBOUNCE_MS) {
    return;
  }

  lastShortcutAtRef.current = now;
  requestDialogOpenFromPhysicalEvent('shortcut');
});
```

**H. 修改 DevPanel 原 Dialog Mock Open**

如果现有 `Open Dialog` mock 使用 `openDialogByStateOrFallback()` 或直接 `user.doubleClick`，改为：

```ts
requestDialogOpenFromPhysicalEvent('doubleClick');
```

该按钮仍然是“完整 UI 打开链路验证”，区别于 B2-9 的 `Force dialog.open`。

**I. 移除旧 probe fallback**

删除或停止使用 `openDialogByStateOrFallback()` 中“多次 probe user.doubleClick / 200ms fallback stabilize”的旧逻辑。B2-9 后打开路径应由 `dialogRouter + dialog.open + pendingDialogUiOpenRef` 负责。

#### Commit 2 验收

```bash
pnpm exec tsc --noEmit
rg -n "routePhysicalEventToDialogOpen" src/App.tsx src/integration/dialogRouter.ts
rg -n "pendingDialogUiOpenRef|requestDialogOpenFromPhysicalEvent" src/App.tsx
rg -n "Ctrl\\+Alt\\+T|DIALOG_SHORTCUT" src/App.tsx
rg -n "openDialogByStateOrFallback" src/App.tsx
```

手动 DEV 验收：

```text
1. idle.awake 双击 → 状态机进入 talking，dialog UI 打开。
2. drowsy 双击 → 先 drowsy_exit，再进入 talking，再打开 dialog UI。
3. napping 双击 → 先 wake.from_nap，再进入 talking，再打开 dialog UI。
4. happy/eating/reminding/talking 双击 → user.doubleClick 可派发，但 dialog.open 不派发，UI 不打开。
5. Ctrl+Alt+T 在 idle 下可打开；非 idle 下不打开。
```

---

### Commit 3 — `feat:` wire dialog close path and one-way bridge

**目标**：实现 Esc / X / onClose 的 `dialog.close` 双轨派发，并新增单向关闭兜底 bridge。

#### 前置检查

```bash
rg -n "requestDialogClose|handleDialogClose|onClose|Escape|Esc" src/App.tsx src/components/Dialog
rg -n "finalizeDialogClose|closing.messages|closing.shell|closing.window|dialogModeActiveRef" src/App.tsx src/components/Dialog
rg -n "user.pat|dialog.close|B2-9 TODO|TODO" src/App.tsx
rg -n "subscribe\\(|machine.subscribe|handlePlayerReady" src/App.tsx src/state/StateMachine.ts
```

#### 改动清单

**A. 新增 `src/integration/dialogStateBridge.ts`**

```ts
import type { PetFullState, Unsubscribe } from '../components/Pet/types';

interface DialogSyncStateMachine {
  getState(): Readonly<PetFullState>;
  subscribe(listener: (state: Readonly<PetFullState>) => void): Unsubscribe;
}

/**
 * 单向关闭兜底：
 * - 只处理 talking -> non-talking 且 dialog UI 仍打开的情况；
 * - 不处理 non-talking -> talking；
 * - 不自动打开 UI；
 * - 不派发 dialog.close。
 */
export function watchTalkingExitForDialogSync(
  machine: DialogSyncStateMachine,
  shouldBridgeCloseDialog: () => boolean,
  triggerDialogUiClose: () => void,
): Unsubscribe {
  let prevMajor = machine.getState().major;

  return machine.subscribe((nextState) => {
    if (
      prevMajor === 'talking' &&
      nextState.major !== 'talking' &&
      shouldBridgeCloseDialog()
    ) {
      console.error(
        '[dialogStateBridge] state/UI mismatch: talking→%s but dialog still open, triggering UI close',
        nextState.major,
      );
      triggerDialogUiClose();
    }

    // 严禁处理 idle -> talking：bridge 不参与打开路径。
    prevMajor = nextState.major;
  });
}
```

**B. App 新增 closing guard ref**

```ts
const dialogClosingInProgressRef = useRef(false);
const dialogBridgeUnsubscribeRef = useRef<Unsubscribe | null>(null);
```

实际 `Unsubscribe` 类型按现有项目导入。

**C. 改造 `requestDialogClose`**

将现有 close helper 改造成可选择是否派发状态机事件：

```ts
type RequestDialogCloseOptions = {
  reason?: DialogCloseReason;
  dispatchStateEvent?: boolean;
  source?: 'user' | 'bridge';
};

const requestDialogClose = useCallback((options: RequestDialogCloseOptions = {}) => {
  const {
    reason = 'user',
    dispatchStateEvent = true,
    source = 'user',
  } = options;

  if (!dialogModeActiveRef.current) {
    return;
  }

  if (dialogClosingInProgressRef.current) {
    return;
  }

  dialogClosingInProgressRef.current = true;

  if (dispatchStateEvent) {
    dispatch({ type: 'dialog.close', reason });
  }

  // 复用现有 B1-10A UI 关闭动画入口。
  // 不改变 closing.messages -> closing.shell -> closing.window -> compact 时序。
  runDialogCloseTransition();
}, [dispatch, runDialogCloseTransition]);
```

若当前代码没有 `runDialogCloseTransition()` 这个名字，以现有触发关闭动画的函数为准。关键约束：

```text
用户关闭：dispatchStateEvent = true
bridge 兜底：dispatchStateEvent = false
```

**D. 在 `finalizeDialogClose` 末尾重置 guard**

```ts
dialogClosingInProgressRef.current = false;
```

若 `finalizeDialogClose` 有 early return，也必须确保 closing guard 最终释放。

**E. 替换 `requestDialogClose` 中的 `user.pat` hack**

如果现有代码在关闭时用 `dispatch({ type: 'user.pat' })` 或类似 hack 让状态机离开 talking，必须改为：

```ts
dispatch({ type: 'dialog.close', reason: 'user' });
```

**F. 接入 `dialogStateBridge`**

在 `handlePlayerReady` 或 StateMachine 初始化完成后注册：

```ts
dialogBridgeUnsubscribeRef.current?.();

dialogBridgeUnsubscribeRef.current = watchTalkingExitForDialogSync(
  machineRef.current,
  () => dialogModeActiveRef.current && !dialogClosingInProgressRef.current,
  () => {
    requestDialogClose({
      reason: 'user',
      dispatchStateEvent: false,
      source: 'bridge',
    });
  },
);
```

注意：

* bridge 触发 UI 关闭时不得派发 `dialog.close`。
* Esc/X 正常关闭时，因为 `dialogClosingInProgressRef.current === true`，bridge 不应二次触发。
* feed/reminder 打断时，因为未处于 UI closing，bridge 应触发 UI 关闭。

**G. cleanup**

在 App unmount / player destroy / machine destroy 相关 cleanup 中加入：

```ts
dialogBridgeUnsubscribeRef.current?.();
dialogBridgeUnsubscribeRef.current = null;
```

#### Commit 3 验收

```bash
pnpm exec tsc --noEmit
rg -n "watchTalkingExitForDialogSync|dialogStateBridge" src/App.tsx src/integration/dialogStateBridge.ts
rg -n "dialogClosingInProgressRef|dispatchStateEvent|source: 'bridge'" src/App.tsx
rg -n "dialog.close|user.pat" src/App.tsx src/state/StateMachine.ts
```

手动 DEV 验收：

```text
1. 打开 dialog 后按 Esc → dispatch dialog.close + UI 关闭动画；bridge 不重复触发。
2. 打开 dialog 后点 X → 同上。
3. talking 中拖入 CSV / 触发 user.feed → 状态机切 eating；不派发 dialog.close；bridge 关闭 UI。
4. talking 中触发 reminder.due → 状态机切 reminding；不派发 dialog.close；bridge 关闭 UI。
5. DevPanel Force dialog.close 且 UI 正打开 → 状态机切 idle.awake；bridge 关闭 UI。
6. DevPanel Force dialog.open 且 UI 未打开 → 状态机可进 talking；UI 不打开。
```

---

### Commit 4 — `feat:` add B2-9 DevPanel force buttons

**目标**：新增 B2-9 事件注入按钮，并明确 Force open / Force close 的不对称语义。

#### 前置检查

```bash
rg -n "Dialog Mock|Force|DevPanelProps|dev-panel__group" src/components/DevPanel/DevPanel.tsx
rg -n "handleDev|onForce|DevPanel" src/App.tsx src/components/DevPanel/DevPanel.tsx
rg -n "idle.timeout|timer.drowsyToNap|dialog.open|dialog.close" src/App.tsx src/state/StateMachine.ts
```

#### 改动清单

**A. `src/components/DevPanel/DevPanel.tsx` props 新增**

```ts
onForceDialogOpen: () => void;
onForceDialogClose: () => void;
onForceDialogOpenFromDrowsy: () => void;
onForceDialogOpenFromNapping: () => void;
```

**B. 在 “Dialog Mock” section 后新增**

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
  <p className="dev-panel__hint">
    Force open only dispatches PetEvent and does not open Dialog UI. This is expected.
    Force close can verify one-way dialogStateBridge close fallback.
  </p>
</section>
```

若没有 `dev-panel__hint` 样式，可复用现有说明文本 class，不新增视觉体系。

**C. `src/App.tsx` 新增 handler**

```ts
const handleDevForceDialogOpen = useCallback(() => {
  dispatch({ type: 'dialog.open', source: 'doubleClick' });
}, [dispatch]);

const handleDevForceDialogClose = useCallback(() => {
  dispatch({ type: 'dialog.close', reason: 'user' });
}, [dispatch]);

const handleDevForceDialogOpenFromDrowsy = useCallback(() => {
  dispatch({ type: 'idle.timeout' });
  dispatch({ type: 'dialog.open', source: 'doubleClick' });
}, [dispatch]);

const handleDevForceDialogOpenFromNapping = useCallback(() => {
  const state = machineRef.current.getSnapshot().state;

  if (!(state.lifecycle === 'alive' && state.major === 'idle' && state.idleSub === 'drowsy')) {
    dispatch({ type: 'idle.timeout' });
  }

  dispatch({ type: 'timer.drowsyToNap' });
  dispatch({ type: 'dialog.open', source: 'doubleClick' });
}, [dispatch]);
```

**D. 传入 DevPanel**

```tsx
<DevPanel
  ...
  onForceDialogOpen={handleDevForceDialogOpen}
  onForceDialogClose={handleDevForceDialogClose}
  onForceDialogOpenFromDrowsy={handleDevForceDialogOpenFromDrowsy}
  onForceDialogOpenFromNapping={handleDevForceDialogOpenFromNapping}
/>
```

#### Commit 4 验收

```bash
pnpm exec tsc --noEmit
rg -n "Force PetEvent|Force dialog.open|Force dialog.close" src/components/DevPanel/DevPanel.tsx
rg -n "handleDevForceDialogOpen|handleDevForceDialogClose|handleDevForceDialogOpenFromDrowsy|handleDevForceDialogOpenFromNapping" src/App.tsx
```

手动 DEV 验收：

```text
1. Force dialog.open from idle.awake → major 变 talking，UI 不打开。
2. Force dialog.open from drowsy → 播 idle.drowsy exit，完成后 major 变 talking，UI 不打开。
3. Force dialog.open from napping → 播 wake.from_nap，完成后 major 变 talking，UI 不打开。
4. UI 已打开且 major=talking 时 Force dialog.close → major 变 idle.awake，bridge 关闭 UI。
```

---

### Commit 5 — `test/docs:` add tests and close documentation loop

**目标**：补齐 StateMachine / Router / Bridge 单测，并完成文档闭环。

#### 前置检查

```bash
rg -n "StateMachine.*test|test-helpers|describe\\(" src/state src/integration
rg -n "dialog.open|dialog.close|readme_devpanel|param_audit|docs_index" docs src
rg -n "B2-9|talking 正常退出|任务9|任务 9" docs
rg -n "dialog.close.*候选|B2-9 阶段候选|Force dialog" docs
```

#### 改动清单

**A. 新增 `src/integration/dialogRouter.test.ts`**

覆盖：

```text
1. idle.awake → shouldDispatch=true
2. idle.drowsy → shouldDispatch=true
3. idle.napping → shouldDispatch=true
4. happy → false
5. eating → false
6. reminding → false
7. talking → false
8. dialogOpen=true → false
9. lifecycle !== alive → false
10. true 时 event = { type:'dialog.open', source }
```

**B. 新增 `src/integration/dialogStateBridge.test.ts`**

覆盖：

```text
1. talking → eating 且 dialog open → trigger close
2. talking → reminding 且 dialog open → trigger close
3. talking → idle 且 dialog open → trigger close
4. talking → idle 但 shouldBridgeCloseDialog=false → 不触发
5. idle → talking → 不触发打开
6. happy → idle → 不触发
7. unsubscribe 后不再触发
```

测试可用最小 fake machine：

```ts
class FakeMachine {
  private state: PetFullState;
  private listeners = new Set<(state: PetFullState) => void>();

  getState() {
    return this.state;
  }

  subscribe(listener: (state: PetFullState) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  push(next: PetFullState) {
    this.state = next;
    for (const listener of this.listeners) {
      listener(next);
    }
  }
}
```

按项目现有测试风格调整。

**C. 新增 / 扩展 `src/state/StateMachine.dialog.test.ts`**

覆盖：

```text
1. dialog.open from idle.awake → talking immediately, movement still
2. dialog.open from idle.drowsy:
   - 播 idle.drowsy exit
   - 手动触发 onComplete
   - 进入 talking
3. dialog.open from idle.napping:
   - 播 wake.from_nap oneshot
   - onComplete 中 currentAnimationToken 置 null
   - 进入 talking
4. dialog.open from talking → ignored，不 warn
5. dialog.open from eating → ignored + warn
6. dialog.open from happy → ignored + warn
7. dialog.open from reminding → ignored + warn
8. dialog.close from talking → idle.awake
9. dialog.close from idle.awake / idle.drowsy / eating / happy / reminding → ignored + warn
10. user.doubleClick 不触发状态转换
11. user.feed during drowsy exit → pendingDialogOpen 清理，旧 onComplete 失效
12. reminder.due during napping wake → pendingDialogOpen 清理，旧 onComplete 失效
13. dialog.open + roaming → movement still
14. dialog.close → movement still，不主动恢复 roaming
```

测试说明：

* mock AnimationPlayer 的 `play()` 返回递增 token。
* 捕获 `onComplete`，由测试手动调用。
* `console.warn` 用 spy 验证，测试后 restore。
* 若需检查 private `pendingDialogOpen`，允许在测试中 `(machine as any).pendingDialogOpen`，但不得新增 public getter。

**D. 文档：`docs/readme_devpanel.md`**

更新能力列表：

```markdown
### B2-9 Force PetEvent

- `Force dialog.open`: 只 dispatch `dialog.open`，验证 StateMachine / AnimationPlayer；Dialog UI 不自动打开，这是预期行为。
- `Force dialog.close`: dispatch `dialog.close`；若 Dialog UI 正打开，`dialogStateBridge` 可触发关闭兜底。
- `Force dialog.open from drowsy`: 注入 drowsy → dialog.open 苏醒路径。
- `Force dialog.open from napping`: 注入 napping → dialog.open 苏醒路径。
```

更新 Hard Constraints：

```markdown
- B2-9 起，`dialog.open` / `dialog.close` 已纳入 `interface_v1_2` 正式 PetEvent。
- DevPanel Force open 不触发 UI 打开。
- `dialogStateBridge` 是单向关闭兜底，不负责 UI 打开同步。
```

删除或改写“无新增 PetEvent beyond baseline”的旧表述。

**E. 文档：`docs/param_audit.md`**

末尾追加：

```markdown
## B2-9 (2026-04-29)

- **interface_v1_2.md** version: v1.2 → v1.3
  - §4.2 PetEvent: 新增 `dialog.open` / `dialog.close`
  - 新增 `DialogOpenSource = 'shortcut' | 'doubleClick' | 'morningRitual'`
  - 新增 `DialogCloseReason = 'user' | 'timeout' | 'service_done' | 'error'`
  - `user.doubleClick` 降级为 notification-only
  - `talking` intent 仍仅为 `loop`
- 新增集成层模块：
  - `src/integration/dialogRouter.ts`
  - `src/integration/dialogStateBridge.ts`
- DevPanel 新增 B2-9 Force PetEvent 按钮组。
```

**F. 文档：`docs/02_ui_schema/talking_interaction_schema.md`**

将旧的：

```markdown
`dialog.close` 仍属于 B2-9 阶段候选事件
```

改为：

```markdown
B2-9 起，`dialog.close` 已纳入正式 `PetEvent`；TalkingInteraction 的 Esc / X / onClose 应通过 App 层并行触发 `dialog.close` 与 UI 关闭动画。
```

**G. 文档：`docs/03_execution/phaseb_execution_plan.md`**

在 Batch 2 / B2-9 对应位置补实施报告占位：

```markdown
### 5.x B2-9

执行范围与对应任务：

- 执行批次：Batch 2
- 对应任务：任务9（talking 正常退出机制闭合）
- 当前状态：已实施 / 待验收

#### 5.x.1 实施方法

- `dialog.open` / `dialog.close` 正式纳入 PetEvent。
- `user.doubleClick` 降级为通知性事件。
- 新增 `dialogRouter` 负责物理事件到打开意图的严格 idle-only 路由。
- 新增 `dialogStateBridge` 负责 talking 被硬打断后的 UI 关闭兜底。
- drowsy/napping 打开路径复用既有苏醒素材，进入 talking 后再打开 UI。

#### 5.x.2 测试执行与结果

- `pnpm exec tsc --noEmit`
- `pnpm test`
- `pnpm tauri build --debug`

#### 5.x.3 项目负责人验收方法

见 B2-9_task_card_v1.2.md §7。
```

**H. 文档：`docs/ichan_project_doc.md`**

任务看板中将 B2-9 从待开始 / 进行中移到 Done，或标记为“已实施，待项目负责人验收”。

**I. 文档：`docs/docs_index.md`**

若当前 done 列表枚举任务卡文件，则加入：

```text
B2-9_task_card_v1.2.md
```

并确认任务卡生命周期：

```text
active/B2-9_task_card_v1.2.md → done/B2-9_task_card_v1.2.md
```

#### Commit 5 验收

```bash
pnpm exec tsc --noEmit
pnpm test
pnpm tauri build --debug

rg -n "dialogRouter|dialogStateBridge|routePhysicalEventToDialogOpen|watchTalkingExitForDialogSync" src
rg -n "dialog.open|dialog.close|DialogOpenSource|DialogCloseReason" src docs
rg -n "Force dialog.open|Force dialog.close|单向关闭兜底|UI 不自动打开" docs src
rg -n "B2-9" docs/param_audit.md docs/readme_devpanel.md docs/03_execution/phaseb_execution_plan.md docs/ichan_project_doc.md docs/docs_index.md
```

---

## 6. 日志策略

| 位置                  | 级别              | 触发条件                                      | 格式                                                                                             |
| ------------------- | --------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `handleDialogOpen`  | `console.warn`  | `lifecycle !== 'alive'`                   | `[StateMachine] dialog.open ignored: lifecycle=%s`                                             |
| `handleDialogOpen`  | `console.warn`  | `major !== 'idle' && major !== 'talking'` | `[StateMachine] dialog.open ignored: major=%s`                                                 |
| `handleDialogClose` | `console.warn`  | `major !== 'talking'`                     | `[StateMachine] dialog.close ignored: major=%s idleSub=%s`                                     |
| `dialogStateBridge` | `console.error` | `talking → non-talking` 且 UI 未关闭          | `[dialogStateBridge] state/UI mismatch: talking→%s but dialog still open, triggering UI close` |

说明：

* `talking + dialog.open` 是重复打开请求，静默 ignore，不记 warning。
* `'timeout' / 'service_done' / 'error'` reason 仅保留类型，本卡无路径派发。

---

## 7. 验收清单

### 7.1 自动化

* [ ] `pnpm exec tsc --noEmit` 通过
* [ ] `pnpm test` 通过
* [ ] `pnpm tauri build --debug` 通过
* [ ] `dialogRouter.test.ts` 覆盖 idle-only gate
* [ ] `dialogStateBridge.test.ts` 覆盖单向关闭兜底，不打开 UI
* [ ] `StateMachine.dialog.test.ts` 覆盖 dialog open/close 状态转换和 warning

### 7.2 手动验收

* [ ] 双击 `idle.awake` 宠物 → dialog 打开，DevPanel 观察 `major: idle → talking`
* [ ] 等宠物进 `idle.drowsy`，双击 → 先看到 drowsy_exit，随后 dialog 打开
* [ ] 等宠物进 `idle.napping`，双击 → 先看到 wake.from_nap，随后 dialog 打开
* [ ] `Ctrl+Alt+T` 在 idle 下可打开 dialog
* [ ] `happy / eating / reminding / talking` 下双击或 `Ctrl+Alt+T` 不打开 dialog
* [ ] Esc 关闭 → `dialog.close({ reason: 'user' })` 派发，UI 416ms 关闭
* [ ] X 关闭 → 同 Esc
* [ ] talking 期间拖入 CSV → 状态切到 eating，UI 自动关闭，不派发 `dialog.close`
* [ ] talking 期间触发 reminder → 状态切到 reminding，UI 自动关闭，不派发 `dialog.close`
* [ ] DevPanel `Force dialog.open` → 状态机可进 talking，UI 不打开
* [ ] DevPanel `Force dialog.close` 且 UI 正打开 → 状态机回 idle.awake，bridge 关闭 UI
* [ ] DevPanel `Force dialog.open from drowsy` → 播 drowsy_exit 后进 talking，UI 不打开
* [ ] DevPanel `Force dialog.open from napping` → 播 wake.from_nap 后进 talking，UI 不打开
* [ ] 关闭过程中 416ms 内再次双击 → 不闪退、不二次 opening、不 phase 卡死
* [ ] 关闭完成后再次双击 → 可正常重新打开

### 7.3 文档闭环

* [ ] `interface_v1_2.md` 更新到 v1.3
* [ ] `types.ts` 与 `interface_v1_2.md` 的 PetEvent 内容一致
* [ ] `readme_devpanel.md` 记录 B2-9 Force PetEvent 按钮语义
* [ ] `param_audit.md` 记录 B2-9 类型 / 事件 / DevPanel 变更
* [ ] `talking_interaction_schema.md` 删除 `dialog.close` 候选表述
* [ ] `phaseb_execution_plan.md` 新增 B2-9 实施报告
* [ ] `ichan_project_doc.md` 任务看板同步 B2-9 状态
* [ ] `docs_index.md` 同步任务卡归档路径
* [ ] 任务完成后移动：`docs/04_task_cards/active/B2-9_task_card_v1.2.md` → `docs/04_task_cards/done/B2-9_task_card_v1.2.md`

---

## 8. 禁止项

* 禁止新增 `MajorState`
* 禁止新增 StateMachine public API
* 禁止把 `pendingDialogOpen` 放入 `PetFullState`
* 禁止让 `dialogStateBridge` 监听 `idle → talking` 并自动打开 UI
* 禁止让 DevPanel `Force dialog.open` 自动打开 UI
* 禁止在 feed/reminder 打断 talking 时派发 `dialog.close`
* 禁止实现 `'timeout'` / `'service_done'` 运行时派发路径
* 禁止修改 `DeepSeekService.chat()` 返回类型
* 禁止开放 `talking exit` intent
* 禁止新增 talking exit spritesheet
* 禁止改变 B1-10A 已落地关闭动画时序
* 禁止把 router 放行范围扩大到 `happy`

---

## 9. 最终交付位置

```text
docs/04_task_cards/active/B2-9_task_card_v1.2.md
```

完成并通过验收后移动到：

```text
docs/04_task_cards/done/B2-9_task_card_v1.2.md
```
