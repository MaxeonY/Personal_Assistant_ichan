# B3-14 退出机制 — 实施级任务卡 v1.0（draft）

> **日期**: 2026-05-01
> **基于**: `B3-14_architecture_v0.2.md`（已锁定）+ `B3-14_field_research_report.md`
> **策划者**：MiMoV2.5
> **状态**: 草案，待项目负责人审阅

---

## §0 前置依赖

| 依赖项 | 状态 | 影响 |
|--------|------|------|
| **L5 快捷键配置化** | 未完成 | `exitShortcut` 落点不存在。若 L5 未完成即开始 B3-14，exit 快捷键会被迫硬编码到 `App.tsx`，制造新债 `[D1]` |
| L2 destroy 合同补齐 | 未完成 | 解耦，可并行 |
| D3 编号纠正 | 未完成 | 解耦，可并行 |

---

## §1 改动清单

### 1. `src/components/Pet/types.ts`

| 区域 | 行号区间 | 改动性质 | 说明 |
|------|----------|---------|------|
| `StateMachineInitOptions` 接口 | L168-171 | **修改** | 新增 `onExitRequest?: () => void` 可选字段 `[D2]` |

改动后形态：
```ts
export interface StateMachineInitOptions {
  now?: () => TimestampMs;
  onExitRequest?: () => void;
}
```

---

### 2. `src/state/StateMachine.ts`

| 区域 | 行号区间 | 改动性质 | 说明 |
|------|----------|---------|------|
| 类字段声明 | ~L69-83 | **新增** | 新增 `private onExitRequest: (() => void) | null = null` 私有字段 |
| `init()` 方法 | L97-101 | **修改** | 在 `this.player = player;` 后保存 `options.onExitRequest ?? null` 到类字段 |
| `handleEvent()` 入口 | L202-203 | **新增** | 在 `switch (event.type)` 之前插入 farewell 事件守卫 `[D7]` |
| `enterFarewell()` | L753-787 | **修改** | 两处改动：(a) 在 `this.commitState({ lifecycle: 'farewell', ... })` 后同步调用 `this.onExitRequest?.()` 对应的持久化写入（见下方详解）；(b) 在 `onComplete` 回调的 `this.emitStateChanged()` 后追加 `this.onExitRequest?.()` 调用 `[D2][D3]` |

**handleEvent farewell 守卫** `[D7]`：
```ts
private handleEvent(event: PetEvent): void {
  // 新增：farewell 期间拒绝所有外部事件
  if (this.state.lifecycle === 'farewell') {
    return;
  }
  switch (event.type) { // 原有
    ...
```

**enterFarewell 改动详解** `[D2][D3]`：

当前代码 `enterFarewell()`:
```
commitState({ lifecycle: 'farewell', ... })
playAnimation({ state: 'farewell', onComplete: {
    commitState({ lifecycle: 'deep_sleep', ... })
    emitStateChanged()
    // ← 到此终止，无 exit 通知
}})
```

改动后：
```
commitState({ lifecycle: 'farewell', ... })
// D3: fire-and-forget 标记 clean exit（由外部注入的回调负责，不 await）
this.onExitRequest?.('markClean')   // ← 新增：通知 App 层标脏写 true
playAnimation({ state: 'farewell', onComplete: {
    commitState({ lifecycle: 'deep_sleep', ... })
    emitStateChanged()
    this.onExitRequest?.('exit')    // ← 新增：通知 App 层执行 app_quit
}})
```

> **实施细节备注**（给 Codex）：`onExitRequest` 的签名为 `() => void`，不区分参数。但实现上 App.tsx 注入的回调需要区分"farewell 开始时标脏"和"farewell 完成后退出"两种时机。推荐方案：注入两个独立回调 `onFarewellStart` + `onExitRequest`，或在 `enterFarewell` 内部直接调用外部传入的单一 `onExitRequest` 但由 App 层在注入时用闭包捕获正确时机。Codex 可自行选择实现方式，只要满足：farewell 启动时写 `lastExitClean=true`（fire-and-forget），farewell 完成后触发进程退出。

---

### 3. `src/services/PetContextService.ts`

| 区域 | 行号区间 | 改动性质 | 说明 |
|------|----------|---------|------|
| 常量区 | L15 后 | **新增** | 新增 `KEY_LAST_EXIT_CLEAN = "petcontext.lastExitClean"` 和 `KEY_LAST_SEEN_DATE = "petcontext.lastSeenDate"` 两个键名常量 `[D5]` |
| 导出对象 | L17-42 | **新增方法** | 新增 6 个方法，详见下方 `[D4][D5][D6]` |

新增方法签名：

```ts
export const PetContextService = {
  // === 既有（保留不动）===
  async getLastCsvImportDate(): Promise<string | null> { ... },
  async setLastCsvImportDate(date: string): Promise<void> { ... },
  async migrateFromConfigTable(): Promise<void> { /* placeholder */ },

  // === 新增：内部辅助 ===
  async getLastExitClean(): Promise<boolean | null> {
    // invoke("config_get_value", { key: KEY_LAST_EXIT_CLEAN })
    // "true" → true, "false" → false, null → null
  },
  async setLastExitClean(value: boolean): Promise<void> {
    // invoke("config_set_value", { key: KEY_LAST_EXIT_CLEAN, value: String(value) })
  },
  async getLastSeenDate(): Promise<string | null> {
    // invoke("config_get_value", { key: KEY_LAST_SEEN_DATE })
  },
  async setLastSeenDate(date: string): Promise<void> {
    // invoke("config_set_value", { key: KEY_LAST_SEEN_DATE, value: date })
  },

  // === 新增：组合入口（App.tsx 唯一调用点）===
  async loadSessionBootstrap(): Promise<SessionBootstrap> {
    // 1. loadAll: 读 lastExitClean / lastSeenDate
    // 2. 计算 isNewDay = formatLocalDate(now) !== storedLastSeenDate
    // 3. lastExitClean = storedLastExitClean ?? false  // 首次视为 unclean
    // 4. await setLastExitClean(false)  // 立即标脏（dirty-bit）
    // 5. await setLastSeenDate(today)   // 顺手更新
    // 6. return { isNewDay, lastExitClean }
  },
  async markCleanExit(): Promise<void> {
    // invoke("config_set_value", { key: KEY_LAST_EXIT_CLEAN, value: "true" })
  },
};
```

**注**: `loadSessionBootstrap` 需要 `SessionBootstrap` 类型导入。当前 `PetContextService.ts` 无此导入，需新增：
```ts
import type { SessionBootstrap } from "../components/Pet/types";
```

---

### 4. `src/App.tsx`

| 区域 | 行号区间 | 改动性质 | 说明 |
|------|----------|---------|------|
| import 区 | L44 后 | **新增导入** | 从 `petBehaviorConfig` 读取 `exitShortcut` |
| 常量区 | ~L80-81 | **新增** | `const EXIT_SHORTCUT = petBehaviorConfig.app.exitShortcut;` `[D1]` |
| `machine.init()` 调用 | 约 L1100 区域 | **修改** | 在 `machine.init(player)` 时传入 `onExitRequest` 选项 `[D2]` |
| `machine.start()` 调用 | L1198-1202 | **修改** | 删除 `// TODO(Phase B)` 注释，改为 `await PetContextService.loadSessionBootstrap()` 拿真实值 `[D4][D6]` |
| 快捷键注册 useEffect | 约 L1669-1743 | **新增** | 在现有快捷键注册块中追加 `EXIT_SHORTCUT` 的注册和清理 `[D1]` |
| 现有 `deep_sleep` listener | L1175-1178 | **保留** | 不改动，保留为兜底语义 `[D2]` |

**machine.init 改动详解**：

当前 `App.tsx` 调用 `machine.init(player)` 时无选项（约 L1100 区域）。改动：
```ts
machine.init(player, {
  onExitRequest: () => {
    void invoke("app_quit");   // 新增 Rust command
  },
});
```

> **实施细节备注**（给 Codex）：需要同时处理 `markCleanExit` 的 fire-and-forget 调用。如 `enterFarewell` 内部不直接调用 `markCleanExit`，则可在 `onExitRequest` 注入时的闭包内区分时机——在 `dispatch({ type: 'user.exit' })` 调用前先 `PetContextService.markCleanExit()`。具体实现方式由 Codex 选择，只要满足 `[D3]` 的时序要求。

**启动逻辑改造详解** `[D4][D6]`：

当前代码 `App.tsx:1198-1202`:
```ts
// TODO(Phase B): Load real values from SQLite PetContext.
machine.start({
  isNewDay: false,
  lastExitClean: true,
});
```

改动为：
```ts
const sessionBootstrap = await PetContextService.loadSessionBootstrap();
if (IS_DEV_BUILD) {
  console.log("[bootstrap] isNewDay=%s lastExitClean=%s", sessionBootstrap.isNewDay, sessionBootstrap.lastExitClean);
}
machine.start(sessionBootstrap);
```

同时需同步修改 `handleDevForceDialogOpen` (L1475-1478) 和 `handleDevResetIdleAwake` (L1508-1511) 中的硬编码 `start({ isNewDay: false, lastExitClean: true })`——dev 重置场景仍用硬编码合理（不触发 dirty-bit），但应加注释说明这是 dev shortcut，不走持久化。

**Ctrl+Alt+Q 注册详解** `[D1]`：

在现有快捷键注册 useEffect（约 L1669-1743）中追加：
```ts
// 注册退出快捷键
await register(EXIT_SHORTCUT, () => {
  dispatch({ type: "user.exit" });
});
```

在清理函数中追加对应的 `unregister(EXIT_SHORTCUT)`。

---

### 5. `src-tauri/src/lib.rs`

| 区域 | 行号区间 | 改动性质 | 说明 |
|------|----------|---------|------|
| 新增 command | L148 后（现有 commands 之后） | **新增** | 新增 `app_quit` Tauri command `[D9]` |
| invoke_handler | L207-226 | **修改** | 在 `generate_handler!` 宏中追加 `app_quit` |

新增 command：
```rust
#[tauri::command]
fn app_quit(app: tauri::AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}
```

**注**：`app.exit(0)` 不返回，`Ok(())` 实际上不可达，但 Tauri command 要求返回 `Result`，保留签名规范。`lib.rs:56` 已有 `app.exit(0)` 先例可参考。

---

### 6. `src-tauri/capabilities/default.json`

| 区域 | 行号区间 | 改动性质 | 说明 |
|------|----------|---------|------|
| permissions 数组 | L7-43 | **可能需要新增** | 若 `app.exit(0)` 需要声明权限则追加 `"process:allow-exit"` 或 `"core:app:allow-exit"` `[D9]` |

> **待实测确认**：`app.exit(0)` 是 Rust 侧直接调用 Tauri SDK，与 `tauri-plugin-process` 的 JS `exit()` 不同。当前代码 `lib.rs:56` 和 `lib.rs:199` 已在用 `app.exit(0)` 且 capabilities 中无额外权限声明，说明 Rust 侧 `AppHandle::exit()` 可能不需要额外权限。Codex 应先实测：不加权限时 `invoke("app_quit")` 是否正常工作，如正常则不加。

---

### 7. `src/config/petBehaviorConfig.ts`

| 区域 | 行号区间 | 改动性质 | 说明 |
|------|----------|---------|------|
| `app` 对象 | L2-6 | **修改** | 新增 `exitShortcut: "Ctrl+Alt+Q"` 字段 `[D1]` |

改动后：
```ts
app: {
  clickThroughShortcut: "Ctrl+Alt+P",
  shortcutDebounceMs: 180,
  statusHideMs: 1800,
  exitShortcut: "Ctrl+Alt+Q",  // 新增
},
```

---

### 8. `docs/01_contracts/interface_v1_2.md`

| 区域 | 行号区间 | 改动性质 | 说明 |
|------|----------|---------|------|
| §4.3 `StateMachineInitOptions` | 约 L385 区域 | **修改** | 新增 `onExitRequest?: () => void` 字段说明 `[D2]` |
| §5 场景5 `handleUserExit` | L618-637 | **修改** | 在 `onComplete` 回调末尾追加 `this.options.onExitRequest?.()` 示意代码 `[D2]` |

---

### 9. `docs/ichan_project_doc.md`

| 区域 | 行号区间 | 改动性质 | 说明 |
|------|----------|---------|------|
| §5.3 程序退出流程 | L777 | **修改** | 将"保存 PetContext 到 SQLite（lastExitClean = true）"的位置说明改为"farewell 动画派发同步 fire-and-forget" `[D3]` |

---

## §2 新增文件清单

**无新增文件**。所有改动在现有文件上进行。

---

## §3 DoD 清单（决策验收项）

| 决策 | 验收项 | 验证方法 |
|------|--------|---------|
| `[D1]` 退出入口 | 1. `Ctrl+Alt+Q` 全局快捷键注册成功，按下后触发 farewell 动画并退出程序；2. DevPanel `user.exit` 按钮行为不变；3. `onCloseRequested` 链路（Alt+F4）行为不变 | 手动验证三条路径各自走 farewell → deep_sleep → 退出 |
| `[D2]` onExitRequest 回调 | `StateMachine.init(player, { onExitRequest })` 接受可选回调；farewell onComplete 后调用一次 | 单元测试：传入 mock 回调，dispatch user.exit，farewell onComplete 后 mock 被调用 |
| `[D3]` fire-and-forget | farewell 派发时不 await 任何持久化操作；farewell 动画播放不受写入延迟影响 | 代码审查：`enterFarewell` 中无 `await`；SQLite 写入为 `void` 返回 |
| `[D4]` dirty-bit 时序 | 启动时先读 `lastExitClean` 再写 `false`；顺序不可颠倒 | 单元测试：mock 两次 config_get_value（先返回 "false" 再返回 "true"），验证 loadSessionBootstrap 返回的 lastExitClean 是读到的值而非刚写的值 |
| `[D5]` 持久化层不迁移 | 无新增 `CREATE TABLE`；新增键走 `config` 表 | 代码审查：PetContextService 无独立 schema SQL |
| `[D6]` 双胞胎接通 | `loadSessionBootstrap()` 同时返回真实的 `isNewDay` 和 `lastExitClean`；App.tsx `machine.start()` 不再硬编码 | 手动验证：首次启动 `isNewDay=true`；同天重启 `isNewDay=false` |
| `[D7]` farewell 事件守卫 | farewell 期间 dispatch 任何外部 PetEvent（如迟到 timer）不改变状态 | 单元测试：进入 farewell → dispatch idle.timeout → 状态仍为 farewell/deep_sleep |
| `[D8]` unclean 台词归 B3-5 | B3-14 不触碰 `petCopy.ts` 的 WAKE_COPY 分支选择逻辑；B3-14 仅保证 `SessionBootstrap.lastExitClean` 是真实值 | 代码审查：`petCopy.ts` 无改动 |
| `[D9]` app_quit command | `invoke("app_quit")` 可正常退出程序 | 手动验证：DevPanel 中添加临时按钮调用 `invoke("app_quit")`，确认进程退出 |
| `[D10]` Rust侧 on_window_event | 不在 B3-14 内补；`lib.rs` 无新增 pet window 事件监听 | 代码审查 |

---

## §4 自测清单

参照 `interface_v1_2.md §6` 格式：

### PetContextService

- [ ] `getLastExitClean()`：config 表有 `petcontext.lastExitClean` → 返回对应 boolean
- [ ] `getLastExitClean()`：config 表无此键 → 返回 `null`
- [ ] `setLastExitClean(true)`：写入后 `config_get_value` 返回 `"true"`
- [ ] `setLastExitClean(false)`：写入后 `config_get_value` 返回 `"false"`
- [ ] `getLastSeenDate()` / `setLastSeenDate(date)`：读写 roundtrip 一致
- [ ] `loadSessionBootstrap()` 首次启动（无任何 PetContext 数据）：`lastExitClean = false`，`isNewDay = true`
- [ ] `loadSessionBootstrap()` 同天重启（上次 lastSeenDate = 今天）：`isNewDay = false`
- [ ] `loadSessionBootstrap()` 跨天重启（上次 lastSeenDate = 昨天）：`isNewDay = true`
- [ ] `loadSessionBootstrap()` 异常退出后（上次 lastExitClean = false）：返回 `lastExitClean = false`
- [ ] `loadSessionBootstrap()` 正常退出后（上次 lastExitClean = true）：返回 `lastExitClean = true`
- [ ] `loadSessionBootstrap()` 调用后立即查 config 表，确认 `petcontext.lastExitClean` 已被写为 `"false"`（dirty-bit 生效）
- [ ] `markCleanExit()`：调用后 config 表 `petcontext.lastExitClean` = `"true"`

### StateMachine

- [ ] `init(player, { onExitRequest: fn })` 后，farewell onComplete 调用 `fn`
- [ ] `init(player)` 无选项时，farewell onComplete 不报错（`onExitRequest` 默认 null）
- [ ] `handleEvent` 守卫：lifecycle=farewell 时 dispatch `idle.timeout` → 状态不变
- [ ] `handleEvent` 守卫：lifecycle=farewell 时 dispatch `user.pat` → 状态不变
- [ ] `handleEvent` 守卫：lifecycle=farewell 时 dispatch `dialog.open` → 状态不变
- [ ] `handleEvent` 守卫：lifecycle=alive 时 dispatch `idle.timeout` → 正常响应（不被守卫阻断）
- [ ] `enterFarewell` 调用后 lifecycle 变为 `farewell`
- [ ] `enterFarewell` onComplete 后 lifecycle 变为 `deep_sleep`
- [ ] `enterFarewell` onComplete 后 `onExitRequest` 恰好被调用 1 次

### App.tsx 集成

- [ ] 启动后检查 console 日志，`[bootstrap] isNewDay=... lastExitClean=...` 输出非硬编码值
- [ ] `Ctrl+Alt+Q` 快捷键按下 → farewell 动画 → 程序退出
- [ ] DevPanel `user.exit` 按钮 → farewell 动画 → 程序退出
- [ ] `Ctrl+C` 或任务管理器杀进程后重启 → `lastExitClean = false` 传入状态机
- [ ] 正常 `Ctrl+Alt+Q` 退出后重启 → `lastExitClean = true` 传入状态机
- [ ] `Ctrl+Alt+Q` 注册不与 `Ctrl+Alt+P` / `Ctrl+Alt+T` / `Ctrl+Alt+D` 冲突
- [ ] DevPanel 重置/Force Dialog 开发快捷键仍用 `lastExitClean: true` 硬编码（注释说明）

---

## §5 回归风险点

| 风险区域 | 风险等级 | 说明 | 验证方式 |
|----------|---------|------|---------|
| **窗口关闭流程** (`onCloseRequested` 链路) | 低 | 改动不触碰 `onCloseRequested` handler 本身；但新增 `onExitRequest` 回调与现有 deep_sleep listener 形成双层，需确认不冲突 `[D2]` | Alt+F4 触发 → 走 farewell → onExitRequest 先触发退出 → deep_sleep listener 可能再触发 `appWindow.close()`（此时进程已退出，无副作用） |
| **DevPanel exit 按钮** | 低 | 派发路径 `dispatch({ type: 'user.exit' })` 不变；新增的 onExitRequest 回调自动接管退出，行为从"deep_sleep listener 关窗"变为"onExitRequest app_quit" | DevPanel 按钮点击 → farewell → 退出 |
| **wizard 退出路径** | 无 | `lib.rs:56` 和 `lib.rs:199` 的 `app.exit(0)` 不受影响；`app_quit` 是独立 command，不修改既有退出逻辑 | wizard 关闭行为不变 |
| **hungry 自动判定** | 低 | `lastCsvImportDate` 与新增字段共用 `config` 表，但键名不同，无 schema 冲突 `[D5]`。`loadSessionBootstrap()` 中新增的 `setLastExitClean`/`setLastSeenDate` 写入不影响 `petcontext.lastCsvImportDate` 键 | 启动后 hungry 评估仍正常：`[hungry] decided: isHungry=...` 日志输出正确 |
| **StateMachine destroy()** | 无 | `destroy()` (L153-164) 不涉及 farewell/onExitRequest；farewell 守卫在 `handleEvent` 入口，`destroy()` 直接清 listeners 不走 `handleEvent` | 代码审查确认 |
| **Dev 快捷键（Force Dialog / Reset）** | 低 | `ensureAliveIdleForForceDialogOpen` (L1475) 和 `handleDevResetIdleAwake` (L1508) 中的 `start()` 仍用硬编码 `lastExitClean: true`——这是 dev shortcut 不走持久化，符合预期。需加注释避免后续 Codex 误解 | 代码审查确认注释到位 |

---

## §6 实施顺序建议

```
Step 1 (基础设施层)
  ├─ 1a. petBehaviorConfig.ts   新增 exitShortcut            [D1]
  ├─ 1b. lib.rs                 新增 app_quit command        [D9]
  ├─ 1c. capabilities/default.json  确认权限（可能无需改动） [D9]
  └─ (1a/1b/1c 无依赖，可并行)

Step 2 (持久化层)
  └─ 2a. PetContextService.ts   新增 6 个方法                [D4][D5][D6]
         （无外部依赖，但 1b 完成后才可端到端验证）

Step 3 (状态机层)
  ├─ 3a. types.ts               StateMachineInitOptions 扩展 [D2]
  └─ 3b. StateMachine.ts        handleEvent 守卫 + enterFarewell 改造 [D2][D7]
         （依赖 3a，但可与 Step 2 并行）

Step 4 (集成层)
  └─ 4a. App.tsx                启动改造 + onExitRequest 注入 + 快捷键注册 [D1][D2][D4]
         （依赖 Step 1-3 全部完成）

Step 5 (文档同步)
  ├─ 5a. interface_v1_2.md      §4.3 + §5 场景5 修订         [D2]
  └─ 5b. ichan_project_doc.md   §5.3 修订                     [D3]
         （与代码改动无依赖，但应在 Codex 验证前完成）

Step 6 (验证)
  └─ 6a. 全链路验证：启动 dirty-bit → Ctrl+Alt+Q 退出 → 重启 → 检查 lastExitClean
```

**关键路径**: Step 1 → Step 2 → Step 3 → Step 4（串行）

**可并行项**:
- Step 1 内部 (1a / 1b / 1c)
- Step 2 与 Step 3
- Step 5 与 Step 4

---

## §7 测试策略

### 可在单元测试覆盖（vitest + mock）

| 测试对象 | 覆盖项 | 测试文件 |
|----------|--------|---------|
| `PetContextService.loadSessionBootstrap` | 首次启动 / 同天重启 / 跨天重启 / 异常退出后 / 正常退出后 / dirty-bit 顺序 | `src/services/__tests__/PetContextService.test.ts`（新增）|
| `PetContextService.markCleanExit` | 写入后 config 表值正确 | 同上 |
| `PetContextService` getter/setter roundtrip | `getLastExitClean` / `setLastExitClean` / `getLastSeenDate` / `setLastSeenDate` | 同上 |
| `StateMachine` farewell 事件守卫 | farewell 期间 event 被忽略 | `src/state/StateMachine.farewell.test.ts`（新增）或追加到 `StateMachine.dialog.test.ts` |
| `StateMachine` onExitRequest 回调 | 传入/未传入时的 farewell onComplete 行为 | 同上 |

**注**: `PetContextService` 单测需要 mock Tauri `invoke`。参考 `src/services/__tests__/HungryDecisionService.test.ts` 的纯函数测试模式，或 mock `@tauri-apps/api/core` 的 `invoke`。

### 必须集成测试 / 手动验证

| 场景 | 原因 |
|------|------|
| `Ctrl+Alt+Q` → farewell → 程序退出 | 涉及全局快捷键注册 + Tauri window close + app.exit 全链路 |
| 正常退出后重启 → `lastExitClean = true` | 涉及 SQLite 实际写入 + 重启后读取 |
| `Ctrl+C` 后重启 → `lastExitClean = false` | dirty-bit 验证，需模拟异常退出 |
| `invoke("app_quit")` 进程退出 | Rust command + 权限验证 |
| hungry 评估不受影响 | 与 PetContextService 共表回归 |

---

## 待架构层补充

以下为任务卡细化过程中发现的、架构决议未覆盖的实施细节，需项目负责人或架构师决定：

### Q1: `onExitRequest` 回调签名与 `markCleanExit` 调用时机

架构决议 `[D3]` 要求"farewell 动画派发同步 fire-and-forget 写 lastExitClean=true"，`[D2]` 要求"farewell onComplete 调用 onExitRequest"。

**问题**: `onExitRequest` 单一回调如何同时覆盖两个时机（farewell 开始时的 `markCleanExit` 和 onComplete 后的 `app_quit`）？

**备选方案**:
- **A**: 拆为两个回调 `onFarewellStart?: () => void` + `onExitRequest?: () => void`
- **B**: 保持单一 `onExitRequest`，但由 `enterFarewell` 内部在 `commitState` 后同步调用一次（标脏），在 onComplete 后再调用一次（退出），由 App.tsx 注入的闭包内部通过参数或闭包变量区分
- **C**: `markCleanExit` 不由 onExitRequest 覆盖，而是在 App.tsx 的 `dispatch({ type: 'user.exit' })` 调用点前直接 `await PetContextService.markCleanExit()`（fire-and-forget）。onExitRequest 仅负责退出

**建议**: 方案 C 最简单，`markCleanExit` 在 `dispatch` 前调用，onExitRequest 保持单一退出职责。但需确认 `dispatch('user.exit')` 有三个调用点（Ctrl+Alt+Q / DevPanel / onCloseRequested），每个都需要加一行 `markCleanExit`。

### Q2: `loadSessionBootstrap` 的错误处理策略

**问题**: `loadSessionBootstrap` 内部调用 4 次 `invoke`（2 次读 + 2 次写）。若 SQLite 读取失败（首次安装、数据库损坏），应如何降级？

**备选方案**:
- **A**: 读失败 → 默认 `lastExitClean = false`, `lastSeenDate = ""`（首次启动语义），继续执行
- **B**: 读失败 → 抛异常，阻止 `machine.start()`，显示错误 UI

**建议**: 方案 A（降级到首次启动语义），与 `[D4]` 中"首次启动视为 unclean"一致。需在任务卡中明确此降级策略。

### Q3: `Ctrl+Alt+Q` 与 L5 的实施顺序

架构决议 `[D1]` 前置依赖 L5，但 L5 当前未完成。

**问题**: 若 L5 在 B3-14 之前未完成，exitShortcut 是 (a) 先硬编码到 App.tsx，L5 完成后再迁移；还是 (b) 阻塞 B3-14 等 L5？

**建议**: 若 L5 范围较小（仅将 dialogShortcut / devPanelShortcut / exitShortcut 集中到 petBehaviorConfig.ts），可将 L5 作为 B3-14 的 Step 0 合并实施。

### Q4: farewell 期间 `onExitRequest('markClean')` 的 fire-and-forget 与进程退出的竞争

`[D3]` 说 SQLite 写入毫秒级，远短于 farewell 动画 ~1.5s。但若 SQLite 卡住（磁盘 I/O 阻塞），`markCleanExit` 的 Promise 在 `app.exit(0)` 时可能还未 resolve。

**问题**: 这是否会导致 `lastExitClean` 写入不完整（事务部分写入）？

**结论**: rusqlite 默认 `PRAGMA journal_mode=DELETE`，单行 UPSERT 是原子的；即使进程在写入期间被杀，SQLite WAL/rollback 机制保证数据一致性。**无风险**。此条不需要架构层补充，仅作为实施备注。

---

*任务卡草案完。等待项目负责人审阅后定稿。*