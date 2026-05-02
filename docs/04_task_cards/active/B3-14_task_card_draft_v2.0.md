# B3-14 退出机制 — 实施级任务卡 v2.1

> **日期**: 2026-05-02
> **基于**: `B3-14_architecture_v0.3.md`（已锁定）+ `B3-14_field_research_report.md`
> **状态**: 草案，待项目负责人审阅
> **起草人**：DeepSeek V4-Pro

---

## §0 前置依赖

| 依赖项 | 状态 | 处理方式 |
|--------|------|---------|
| **L5 快捷键配置化** | 未完成 | **[D1]** 内联为 B3-14 Step 0，`petBehaviorConfig.ts` 的 `app` 组新增 `dialogShortcut` / `devPanelShortcut` / `exitShortcut` 三个字段 |
| L2 destroy 合同补齐 | 未完成 | 解耦，可并行 |
| D3 编号纠正 | 未完成 | 解耦，可并行 |

---

## §1 改动清单

### 1. `src/components/Pet/types.ts`

| 区域 | 行号区间 | 改动性质 | 说明 |
|------|----------|---------|------|
| `StateMachineInitOptions` 接口 | L168-171 | **修改** | 新增 `onExitRequest?: () => void` 可选字段 **[D2]** |

```ts
export interface StateMachineInitOptions {
  now?: () => TimestampMs;
  onExitRequest?: () => void;   // [D2] 单一退出职责：farewell onComplete 后通知壳进程退出
}
```

---

### 2. `src/state/StateMachine.ts`

| 区域 | 行号区间 | 改动性质 | 说明 |
|------|----------|---------|------|
| 类字段声明 | ~L69-83 | **新增** | `private onExitRequest: (() => void) \| null = null` |
| `init()` 方法 | L97-101 | **修改** | `this.onExitRequest = options.onExitRequest ?? null` |
| `handleEvent()` 入口 | L202-203 | **新增** | farewell 事件守卫 **[D7]** |
| `enterFarewell()` | L753-787 | **修改** | onComplete 中 `this.emitStateChanged()` 后追加 `this.onExitRequest?.()` **[D2]** |

**handleEvent farewell 守卫** **[D7]**

```ts
private handleEvent(event: PetEvent): void {
  if (this.state.lifecycle === 'farewell') {
    return;   // [D7] 拒绝所有外部 PetEvent（含迟到 timer）
  }
  switch (event.type) {
    // ... 原有不变
  }
}
```

**enterFarewell 改动详解** **[D2]**

当前 `onComplete` 终止于 `this.emitStateChanged()`。改动后追加一行：

```ts
onComplete: (tok) => {
  if (tok !== farewellToken || tok !== this.currentAnimationToken) return;
  this.currentAnimationToken = null;
  this.timers.clearAll();
  this.commitState({ lifecycle: 'deep_sleep', ... });
  this.emitStateChanged();
  this.onExitRequest?.();   // [D2] 新增：通知 App 层退出进程
},
```

**严格不允许**：
- ❌ `enterFarewell` 内调用任何 `markCleanExit` / PetContextService 方法（[D2] 明确：持久化是 App.tsx 关切）
- ❌ `onExitRequest` 承担 markCleanExit 职责（[D2] 明确：单一退出职责）

---

### 3. `src/services/PetContextService.ts`

| 区域 | 行号区间 | 改动性质 | 说明 |
|------|----------|---------|------|
| import 区 | L1 | **新增** | `import type { SessionBootstrap } from "../components/Pet/types"` |
| 常量区 | L15 后 | **新增** | `KEY_LAST_EXIT_CLEAN` / `KEY_LAST_SEEN_DATE` **[D5]** |
| 已有 getter/setter | L17-33 | **保留** | `getLastCsvImportDate` / `setLastCsvImportDate` 不动 |
| 导出对象 | L17-42 | **新增 8 个方法** | 见下方 **[D4][D5][D6]** |

新增方法签名：

```ts
// === 内部辅助 ===
const KEY_LAST_EXIT_CLEAN = "petcontext.lastExitClean";
const KEY_LAST_SEEN_DATE = "petcontext.lastSeenDate";

export const PetContextService = {
  // ... 既有方法保留 ...

  async getLastExitClean(): Promise<boolean | null> {
    const v = await invoke<string | null>("config_get_value", { key: KEY_LAST_EXIT_CLEAN });
    if (v === null) return null;
    return v === "true";
  },

  async setLastExitClean(value: boolean): Promise<void> {
    await invoke("config_set_value", { key: KEY_LAST_EXIT_CLEAN, value: String(value) });
  },

  async getLastSeenDate(): Promise<string | null> {
    return await invoke<string | null>("config_get_value", { key: KEY_LAST_SEEN_DATE });
  },

  async setLastSeenDate(date: string): Promise<void> {
    await invoke("config_set_value", { key: KEY_LAST_SEEN_DATE, value: date });
  },

  // === 组合入口（App.tsx 启动时唯一调用点）===

  async loadSessionBootstrap(): Promise<SessionBootstrap> {
    // [D4] 完整错误处理骨架，不允许抛异常阻塞 machine.start()
    let lastExitClean = false;         // 默认：首次 / 读失败均视为 unclean
    let lastSeenDate: string | null = null;

    // 阶段 1：读取，失败降级
    try {
      lastExitClean = (await this.getLastExitClean()) ?? false;
      lastSeenDate = await this.getLastSeenDate();
    } catch (e) {
      console.error("[PetContext] loadSessionBootstrap read failed, defaulting to unclean:", e);
    }

    const today = formatLocalDate(new Date());
    const isNewDay = lastSeenDate !== today;

    // 阶段 2：写入 dirty-bit + lastSeenDate，失败仅日志
    try {
      await this.setLastExitClean(false);
      await this.setLastSeenDate(today);
    } catch (e) {
      console.error("[PetContext] dirty-bit write failed; this session will not be detectable next launch:", e);
    }

    return { isNewDay, lastExitClean };
  },

  async markCleanExit(): Promise<void> {
    // [D3] fire-and-forget：farewell 派发同步调用，不 await
    await invoke("config_set_value", { key: KEY_LAST_EXIT_CLEAN, value: "true" });
  },
};
```

**D4 降级语义表**（实现需严格遵守）：

| 场景 | getLastExitClean() 返回 | lastExitClean 取值 | 语义 |
|------|------------------------|-------------------|------|
| 首次安装（key 不存在） | `null` | `false`（`??`默认） | 视作 unclean |
| 正常退出后启动 | `true` | `true` | clean |
| 异常退出后启动 | `false` | `false` | unclean |
| SQLite 读失败 | 抛异常 | `false`（catch 默认） | 视作 unclean（保守） |

**注**: `formatLocalDate` 来自 `src/App.tsx` 已有工具函数。若 `PetContextService.ts` 未导入，需新增导入或在 service 内部自行实现一个同功能函数。

---

### 4. `src/App.tsx`

| 区域 | 行号区间 | 改动性质 | 说明 |
|------|----------|---------|------|
| import 区 | L44 后 | **新增** | `import { petBehaviorConfig } from "./config/petBehaviorConfig"` 追加 `exitShortcut` 读取 |
| 常量区替换 | L76-81 | **修改** | **[Step 0]** `CLICK_THROUGH_SHORTCUT` → 来自 config；`DIALOG_SHORTCUT` → `petBehaviorConfig.app.dialogShortcut`；`DEV_PANEL_SHORTCUT` → `petBehaviorConfig.app.devPanelShortcut`；新增 `EXIT_SHORTCUT` = `petBehaviorConfig.app.exitShortcut` |
| `requestExit()` helper | 约 L1550 区域 | **新增** | 见下方 **[D2][D3]** |
| 三个退出入口 | L1562-1563 (DevPanel) + L1877-1878 (onCloseRequested) + 新增(Ctrl+Alt+Q) | **修改** | 改为调用 `requestExit()` 而非直接 `dispatch` |
| `machine.init()` 调用 | 约 L1100 区域 | **修改** | 传入 `onExitRequest` 选项 **[D2]** |
| `machine.start()` 调用 | L1198-1202 | **修改** | `await loadSessionBootstrap()` 拿真实值 **[D4][D6]** |
| 快捷键注册 useEffect | 约 L1669-1743 | **修改** | 追加 `EXIT_SHORTCUT` 注册 **[D1]** |
| `deep_sleep` listener | L1175-1178 | **保留** | 兜底语义，无改动 **[D2]** |

**requestExit() helper** **[D2][D3]**（新增，建议位置在 `handleDevInjectExit` 附近）

```ts
function requestExit(): void {
  void PetContextService.markCleanExit().catch((e) =>
    console.error("[PetContext] markCleanExit failed:", e)
  );
  dispatch({ type: "user.exit" });
}
```

**三个退出入口改造**：

| 入口 | 原代码 | 改动后 |
|------|--------|--------|
| `handleDevInjectExit` (L1562) | `dispatch({ type: "user.exit" })` | `requestExit()` |
| `onCloseRequested` handler (L1878) | `dispatch({ type: "user.exit" })` | `requestExit()` |
| Ctrl+Alt+Q 快捷键回调（新增） | - | `requestExit()` |

**machine.init 改动详解**：

```ts
machine.init(player, {
  onExitRequest: () => {
    void invoke("app_quit");   // [D2] 单一职责：通知壳进程退出
  },
});
```

**启动逻辑改造详解** **[D4][D6]**：

原 L1198-1202:
```ts
// TODO(Phase B): Load real values from SQLite PetContext.
machine.start({ isNewDay: false, lastExitClean: true });
```

改动为：
```ts
const sessionBootstrap = await PetContextService.loadSessionBootstrap();
if (IS_DEV_BUILD) {
  console.log("[bootstrap] isNewDay=%s lastExitClean=%s",
    sessionBootstrap.isNewDay, sessionBootstrap.lastExitClean);
}
machine.start(sessionBootstrap);
```

**Dev 重置场景**（`handleDevForceDialogOpen` L1475 / `handleDevResetIdleAwake` L1508）保留硬编码：
```ts
// dev shortcut: bypass persistence, force isNewDay=false lastExitClean=true
machineRef.current.start({ isNewDay: false, lastExitClean: true });
```

**快捷键注册** **[D1]**：在现有 useEffect（约 L1669-1743）中追加注册 `EXIT_SHORTCUT`，在清理函数中追加 `unregister(EXIT_SHORTCUT)`。

---

### 5. `src-tauri/src/lib.rs`

| 区域 | 行号区间 | 改动性质 | 说明 |
|------|----------|---------|------|
| 新增 command | L148 后 | **新增** | `app_quit` Tauri command **[D9]** |
| `invoke_handler` | L207-226 | **修改** | `generate_handler!` 宏追加 `app_quit` |

```rust
#[tauri::command]
fn app_quit(app: tauri::AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}
```

---

### 6. `src-tauri/capabilities/default.json`

| 区域 | 行号区间 | 改动性质 | 说明 |
|------|----------|---------|------|
| permissions 数组 | L7-43 | **可能需要新增** | 若 `app.exit(0)` 需声明权限则追加 **[D9]** |

**待实测确认**: `lib.rs:56` / `lib.rs:199` 已在用 `app.exit(0)` 且无额外权限声明，说明 Rust 侧 `AppHandle::exit()` 可能不需额外权限。Codex 先不加权限实测 `invoke("app_quit")`，如报错再加 `"core:app:allow-exit"`。

---

### 7. `src/config/petBehaviorConfig.ts`

| 区域 | 行号区间 | 改动性质 | 说明 |
|------|----------|---------|------|
| `app` 对象 | 原 L2-6 | **修改** | **[Step 0]** 新增 `dialogShortcut` / `devPanelShortcut` / `exitShortcut` 三个字段 |

```ts
app: {
  clickThroughShortcut: "Ctrl+Alt+P",
  shortcutDebounceMs: 180,
  statusHideMs: 1800,
  dialogShortcut: "Ctrl+Alt+T",      // [Step 0] 从 App.tsx:80 迁移
  devPanelShortcut: "Ctrl+Alt+D",    // [Step 0] 从 App.tsx:81 迁移
  exitShortcut: "Ctrl+Alt+Q",        // [D1] 新增
},
```

**Step 0 验收**：App.tsx 内不存在 `"Ctrl+Alt+T"` / `"Ctrl+Alt+D"` / `"Ctrl+Alt+Q"` 字面量。全部从 `petBehaviorConfig` 读取。

---

### 8. `docs/01_contracts/interface_v1_2.md`

| 区域 | 行号区间 | 改动性质 | 说明 |
|------|----------|---------|------|
| §4.3 `StateMachineInitOptions` | 约 L385 | **修改** | 新增 `onExitRequest?: () => void` **[D2]** |
| §5 场景5 `handleUserExit` | L618-637 | **修改** | onComplete 末尾追加 `this.options.onExitRequest?.()` 示意代码 **[D2]** |

---

### 9. `docs/ichan_project_doc.md`

| 区域 | 行号区间 | 改动性质 | 说明 |
|------|----------|---------|------|
| §5.3 程序退出流程 | L777 | **修改** | "保存 PetContext 到 SQLite"位置改为"farewell 派发同步 fire-and-forget" **[D3]** |

---

## §2 新增文件清单

**无新增文件**。所有改动在现有文件上进行。

---

## §3 DoD 清单（决策验收项）

| 决策 | 验收项 | 验证方法 |
|------|--------|---------|
| **[Step 0]** L5 内联 | 1. `petBehaviorConfig.ts` 的 `app` 包含 `dialogShortcut` / `devPanelShortcut` / `exitShortcut`；2. `App.tsx` 无硬编码快捷键字符串 | 代码审查：grep `"Ctrl+Alt+T"` / `"Ctrl+Alt+D"` / `"Ctrl+Alt+Q"` 在 `App.tsx` 中零匹配 |
| **[D1]** 退出入口 | 1. `Ctrl+Alt+Q` 按下后走 `requestExit()` → farewell → 退出；2. DevPanel `user.exit` 按钮走 `requestExit()`；3. `onCloseRequested` 链路走 `requestExit()` | 手动验证三条路径各自 farewell → deep_sleep → 退出 |
| **[D2]** onExitRequest 单一退出职责 | 1. `StateMachine.init(player, { onExitRequest })` 接受回调；2. onExitRequest 仅做 `invoke('app_quit')`；3. farewell onComplete 后调用 1 次；4. `enterFarewell` 及 `handleEvent` 中无 `PetContextService` / `markCleanExit` 调用 | 单元测试：mock 回调，dispatch user.exit，onComplete 后 mock 被调用 1 次；代码审查：grep `markCleanExit` 在 `StateMachine.ts` 中零匹配 |
| **[D3]** fire-and-forget | 1. `requestExit()` 中 `markCleanExit()` 为 `void` 调用（无 `await`）；2. farewell 动画播放不被 markCleanExit 阻塞 | 代码审查：`requestExit` 中 `void ...markCleanExit().catch(...)` 无 await |
| **[D4]** dirty-bit 时序 + 错误处理 | 1. `loadSessionBootstrap` 先读后写；2. 读失败降级为 `lastExitClean=false, isNewDay=true`；3. 写失败仅日志不抛异常；4. 返回 SessionBootstrap 不抛异常 | 单元测试：mock invoke 抛异常 → 验证返回 `{ isNewDay: true, lastExitClean: false }` 而非 throw |
| **[D5]** 持久化层不迁移 | 无新增 `CREATE TABLE`；新增键走 `config` 表 | 代码审查：无独立 schema SQL |
| **[D6]** 双胞胎接通 | `loadSessionBootstrap()` 返回真实的 `isNewDay` 和 `lastExitClean`；`App.tsx` 的 `machine.start()` 不再硬编码 | 手动验证：首次启动 `isNewDay=true`；同天重启 `isNewDay=false` |
| **[D7]** farewell 事件守卫 | farewell 期间 dispatch 任何外部 PetEvent 不改变状态 | 单元测试：进入 farewell → dispatch idle.timeout → 状态仍为 farewell/deep_sleep |
| **[D8]** unclean 台词归 B3-5 | `petCopy.ts` 无改动；B3-14 仅保证 `SessionBootstrap.lastExitClean` 是真实值 | 代码审查 |
| **[D9]** app_quit command | 1. `lib.rs` 新增 `app_quit` 命令并注册；2. `invoke("app_quit")` 正常退出程序 | 手动验证：`invoke("app_quit")` 进程退出 |
| **[D10]** Rust 侧 on_window_event | `lib.rs` 无新增 pet window 事件监听 | 代码审查 |

---

## §4 自测清单

### PetContextService

- [ ] `getLastExitClean()`：config 表有 `"true"` → 返回 `true`
- [ ] `getLastExitClean()`：config 表有 `"false"` → 返回 `false`
- [ ] `getLastExitClean()`：config 表无此键 → 返回 `null`
- [ ] `setLastExitClean(true)`：写入后 `config_get_value` 返回 `"true"`
- [ ] `getLastSeenDate()` / `setLastSeenDate(date)`：读写 roundtrip 一致
- [ ] `loadSessionBootstrap()` 首次启动（无任何 PetContext 数据）：返回 `{ isNewDay: true, lastExitClean: false }`
- [ ] `loadSessionBootstrap()` 同天重启：`isNewDay = false`
- [ ] `loadSessionBootstrap()` 跨天重启：`isNewDay = true`
- [ ] `loadSessionBootstrap()` 正常退出后重启：`lastExitClean = true`
- [ ] `loadSessionBootstrap()` 异常退出后重启：`lastExitClean = false`
- [ ] `loadSessionBootstrap()` 调用后查 config 表：`petcontext.lastExitClean` = `"false"`（dirty-bit 生效）
- [ ] `loadSessionBootstrap()` SQLite 读抛异常：返回 `{ isNewDay: true, lastExitClean: false }`，不 throw **[D4]**
- [ ] `loadSessionBootstrap()` SQLite 写抛异常：仍返回正常 SessionBootstrap，不 throw，仅 console.error **[D4]**
- [ ] `markCleanExit()`：调用后 config 表 `petcontext.lastExitClean` = `"true"`

### StateMachine

- [ ] `init(player, { onExitRequest: fn })` 后，farewell onComplete 调用 `fn`
- [ ] `init(player)` 无选项时，farewell onComplete 不报错（`onExitRequest` 默认 null）
- [ ] `handleEvent` 守卫：lifecycle=farewell 时 dispatch `idle.timeout` → 状态不变 **[D7]**
- [ ] `handleEvent` 守卫：lifecycle=farewell 时 dispatch `user.pat` → 状态不变
- [ ] `handleEvent` 守卫：lifecycle=farewell 时 dispatch `dialog.open` → 状态不变
- [ ] `handleEvent` 守卫：lifecycle=alive 时 dispatch `idle.timeout` → 正常响应（不被误阻断）
- [ ] `enterFarewell` 调用后 lifecycle 变为 `farewell`
- [ ] `enterFarewell` onComplete 后 lifecycle 变为 `deep_sleep`
- [ ] `enterFarewell` onComplete 后 `onExitRequest` 恰好被调用 1 次
- [ ] `enterFarewell` 及 `handleEvent` 内无 `PetContextService` 字面量（`markCleanExit` 零引用）**[D2]**

### App.tsx 集成

- [ ] `requestExit()` 中 `markCleanExit` 为 `void` 调用（无 `await`）**[D3]**
- [ ] `requestExit()` 中 `markCleanExit` 失败（Promise reject）不阻断 `dispatch({ type: "user.exit" })` **[D3]**
- [ ] 三个退出入口（DevPanel / onCloseRequested / Ctrl+Alt+Q）均调用 `requestExit()` 而非直接 `dispatch` **[D2]**
- [ ] `machine.init(player, { onExitRequest: () => invoke("app_quit") })` 正确注入
- [ ] 启动后 console 日志：`[bootstrap] isNewDay=... lastExitClean=...` 输出非硬编码值
- [ ] `Ctrl+Alt+Q` 按下 → farewell 动画 → 程序退出
- [ ] DevPanel `user.exit` 按钮 → farewell 动画 → 程序退出
- [ ] `Ctrl+Alt+Q` 注册不与 `Ctrl+Alt+P` / `Ctrl+Alt+T` / `Ctrl+Alt+D` 冲突
- [ ] `App.tsx` 内无 `"Ctrl+Alt+T"` / `"Ctrl+Alt+D"` / `"Ctrl+Alt+Q"` 硬编码字面量 **[Step 0]**
- [ ] Dev 重置 / Force Dialog 仍用硬编码 `{ isNewDay: false, lastExitClean: true }`，含注释说明

---

## §5 回归风险点

| 风险区域 | 风险等级 | 说明 | 验证方式 |
|----------|---------|------|---------|
| **窗口关闭流程** | 低 | `onCloseRequested` 改为调用 `requestExit()`（含 markCleanExit fire-and-forget + dispatch）；新增 `onExitRequest` 与现有 deep_sleep listener 双层引退，不冲突 **[D2]** | Alt+F4 → farewell → 退出 |
| **DevPanel exit 按钮** | 低 | `handleDevInjectExit` 改为 `requestExit()`，语义等价 | DevPanel 按钮 → farewell → 退出 |
| **wizard 退出路径** | 无 | `lib.rs:56` / `lib.rs:199` 的 `app.exit(0)` 不受影响 | wizard 关闭行为不变 |
| **hungry 自动判定** | 低 | `lastCsvImportDate` 与新增字段共用 `config` 表，键名不同无冲突 **[D5]** | 启动后 `[hungry] decided: isHungry=...` 日志正常 |
| **StateMachine destroy()** | 无 | `destroy()` 不涉及 farewell/onExitRequest | 代码审查 |
| **Dev 快捷键** | 低 | `handleDevResetIdleAwake` / `ensureAliveIdleForForceDialogOpen` 保留硬编码，含注释 | 代码审查注释到位 |
| **快捷键冲突** | 低 | 新增 `Ctrl+Alt+Q` 不与现有 `P`/`T`/`D` 冲突 | 手动逐一按四个快捷键确认各自触发 |

---

## §6 实施顺序建议

```
Step 0 (L5 内联)  ← 必须先于 Step 1-4
  ├─ 0a. petBehaviorConfig.ts    新增 dialogShortcut/devPanelShortcut/exitShortcut
  ├─ 0b. App.tsx                 常量替换为读配置 + 新增 EXIT_SHORTCUT 读出
  └─ 0c. (可选) behavior_config.md / param_audit.md 同步

Step 1 (基础设施层)
  ├─ 1a. types.ts                StateMachineInitOptions.onExitRequest     [D2]
  ├─ 1b. lib.rs                  app_quit command + 注册                    [D9]
  └─ 1c. capabilities/default.json  确认权限（可能无需改动）                 [D9]
      (1a/1b/1c 可并行)

Step 2 (持久化层)
  └─ 2a. PetContextService.ts    新增 8 个方法（含 D4 错误处理骨架）       [D4][D5][D6]
      (无外部依赖，但 1b 完成后才可端到端验证 app_quit)

Step 3 (状态机层)
  └─ 3a. StateMachine.ts         handleEvent 守卫 + enterFarewell 改造    [D2][D7]
      (依赖 1a，但可与 Step 2 并行)

Step 4 (集成层)  ← 依赖 Step 1-3 全部完成
  ├─ 4a. App.tsx                 抽 requestExit() helper                   [D2][D3]
  ├─ 4b. App.tsx                 三个退出入口改为调用 requestExit()
  ├─ 4c. App.tsx                 注入 onExitRequest = () => invoke('app_quit')
  ├─ 4d. App.tsx                 启动改造：await loadSessionBootstrap()     [D4][D6]
  └─ 4e. App.tsx                 快捷键注册追加 EXIT_SHORTCUT               [D1]

Step 5 (文档同步)  ← 可与 Step 4 并行
  ├─ 5a. interface_v1_2.md       §4.3 + §5 场景5 修订                      [D2]
  └─ 5b. ichan_project_doc.md    §5.3 修订                                   [D3]

Step 6 (验证)
  ├─ 6a. 单元测试：PetContextService + StateMachine farewell
  ├─ 6b. 手动验证：Ctrl+Alt+Q → farewell → 退出 → 重启 → lastExitClean
  └─ 6c. 手动验证：farewell 期间 kill 进程 → 重启 → lastExitClean=false
```

---

## §7 测试策略

### 可在单元测试覆盖（vitest + mock invoke）

| 测试对象 | 覆盖项 | 测试文件 |
|----------|--------|---------|
| `PetContextService.loadSessionBootstrap` | 首次启动 / 同天重启 / 跨天重启 / 异常退出后 / 正常退出后 / dirty-bit 顺序 / D4 SQLite读失败降级 / D4 SQLite写失败降级 | `src/services/__tests__/PetContextService.test.ts`（新增）|
| `PetContextService.markCleanExit` | 写入后 config 表值正确 | 同上 |
| `StateMachine` farewell 事件守卫 | farewell 期间 idle.timeout / user.pat / dialog.open 被忽略 **[D7]** | `src/state/StateMachine.farewell.test.ts`（新增）|
| `StateMachine` onExitRequest 回调 | 传入/未传入时 farewell onComplete 各调用次数 | 同上 |

### 必须集成测试 / 手动验证

| 场景 | 原因 |
|------|------|
| `Ctrl+Alt+Q` → farewell → 程序退出 | 全局快捷键 + onExitRequest + app_quit 全链路 |
| 正常退出后重启 → `lastExitClean = true` | SQLite 实际写入 + 重启后读取 |
| `Ctrl+C` 后重启 → `lastExitClean = false` | dirty-bit 验证 |
| **farewell 期间 kill 进程** → 重启 → `lastExitClean = false` | 竞态验证：启动 → Ctrl+Alt+Q → farewell 动画约1.5s 窗口内任务管理器 kill → 重启验证 |
| SQLite 数据库完整性 | 上一步后用 sqlite3 CLI: `SELECT * FROM config WHERE key LIKE 'petcontext.%'` 确认表结构完整 |

---

## §8 待架构层补充

以下问题已在 v0.3 中裁决，仅列实施备注：

| 编号 | 问题 | v0.3 裁决 | 备注 |
|------|------|----------|------|
| Q1 | `onExitRequest` 签名与 `markCleanExit` 调用时机 | **方案 C**：`markCleanExit` 由 `App.tsx` 的 `requestExit()` helper 在 `dispatch` 前 fire-and-forget；`onExitRequest` 单一退出职责 | 已写入 §1.4 / §1.2 |
| Q2 | `loadSessionBootstrap` 错误处理 | **[D4]** 完整 try/catch 骨架，读失败降级为首次启动语义 | 已写入 §1.3 |
| Q3 | L5 顺序 | **内联为 B3-14 Step 0**，`petBehaviorConfig.ts` 一次性加 3 个快捷字段 | 已写入 §1.7 / §6 |
| Q4 | fire-and-forget 与进程退出竞争 | rusqlite 默认 journal_mode=DELETE，单行 UPSERT 原子，无数据一致风险 | 无需额外处理 |

---

*任务卡 v2.1 完。等待项目负责人审阅后定稿。*

## v2.1 变更记录（2026-05-02）

- 已完成任务卡对应实现：`App.tsx`、`StateMachine.ts`、`PetContextService.ts`、`petBehaviorConfig.ts`。
- 已补齐退出权限映射：`src-tauri/permissions/app-commands/default.toml` 增加 `allow-app-quit`。
- 已完成测试补充：`PetContextService.test.ts`、`StateMachine.farewell.test.ts`。
- 已执行 `cargo check --manifest-path src-tauri/Cargo.toml` 并通过。
