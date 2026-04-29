# README: Dev Overlay Panel (PhaseA.5+)

> **版本**: v1.2 - 2026-04-27（审计+落地对齐修订，补录 B1-10 新增能力）

## 1. How To Open

- This panel is mounted only when `import.meta.env.DEV === true`.
- Run `pnpm tauri dev`, then use `Ctrl+Alt+D` to open/close the panel.
- `Ctrl+Alt+P` is still reserved for click-through toggle and stays independent.

## 2. Capability Groups

### 2.1 State Force

- `Force idle.drowsy`
- `Force idle.napping`
- `Force wake.from_nap path`
- `Roaming Pulse`
- `Reset idle.awake`

All of these use existing state machine entries (`dispatch(...)` or `start(...)`) and do not mutate internals directly.

### 2.2 Event Injection

- `user.pat`
- `user.feed` (injects a minimal dummy CSV `File`)
- `reminder.due`
- `user.exit`
- `movement.arrive` (auto-uses current `movement.requestId`; disabled if none)

### 2.3 Dialog Mock Verification (B1-10 新增)

- `Open Dialog`：通过状态机路径打开对话 UI，等效于双击宠物触发 `user.doubleClick`。
- `Close Dialog`：关闭当前对话 UI 并恢复宠物窗口几何。
- 说明：此按钮组用于在不依赖鼠标双击的情况下验证对话 UI 的打开/关闭链路，避免因双击防抖干扰导致无法复现问题。

### 2.4 Flag / Overlay

- `Toggle isHungry`: computes next boolean and dispatches `dispatch({ type: 'hungry.set', value })`.
- `Toggle click-through`: reuses existing `setClickThrough(...)` path in `App.tsx`.

### 2.5 Realtime Read-Only State

- `PetFullState`
- `Playback` (`currentAnimationToken`, `queuedEventCount`)
- `Movement` (including `requestId`)
- `Timers` (DEV timer-backend mirror with remaining time)

## 3. Hard Constraints

- No `interface_v1_2` changes.
- No new `PetEvent` beyond the `interface_v1_2` baseline (`hungry.set` is consumed here, not introduced here).
- No new `StateMachine` / `AnimationPlayer` public API.
- Not a fake service layer.
- Not Phase B real business integration.
- Not for production usage.

## 4. Boundary Statement

- This panel is a PhaseA.5 on-desktop observation tool and a minimal seed for future Phase B harness work.
- This is not a formal integration testing framework.
- This does not replace real CSV / Notion / DeepSeek validation.

## 5. B2-9 Force PetEvent (2026-04-29)

- `Force dialog.open`: 仅 `dispatch({ type: 'dialog.open', source: 'doubleClick' })`，不设置物理路径 pending flag，因此不会自动打开 UI。
- `Force dialog.close`: 仅 `dispatch({ type: 'dialog.close', reason: 'user' })`；若 UI 仍打开，由 `dialogStateBridge` 单向兜底关闭。
- `Force dialog.open from drowsy`: 依次派发 `idle.timeout` -> `dialog.open`，用于验证 drowsy_exit 串行到 talking。
- `Force dialog.open from napping`: 依次派发 `idle.timeout` -> `timer.drowsyToNap` -> `dialog.open`，用于验证 wake.from_nap 串行到 talking。

