# B3-14 退出机制 - 实地调研报告

> **日期**: 2026-05-01 | **范围**: 退出路径、PetContext持久化、Tauri退出去能力、异常退出检测、审计耦合
> **状态**: 调研完成，提交架构层

---

## §1 当前退出路径的实际状态

### 1.1 退出触发入口核查

| 入口类型 | 状态 | 文件路径+行号 | 备注 |
|----------|------|---------------|------|
| Tauri托盘菜单 | **不存在** | - | 无 `TrayIconBuilder` 调用，`tauri.conf.json` 无 `tray` 配置，`Cargo.toml` 无 `tauri-plugin-tray-icon` 依赖 |
| 窗口关闭按钮 | **已存在（半程）** | `src/App.tsx:1871-1878` | pet窗口 `closable: true` (tauri.conf.json:28)，通过 `onCloseRequested` 拦截，并非直接关闭 |
| 宠物右键菜单 | **不存在** | - | 全局搜索 `contextMenu`/`rightClick` 零结果 |
| 退出去快捷键 | **不存在** | `src/App.tsx:80-81` | 现有3个快捷键: `Ctrl+Alt+P`(穿透), `Ctrl+Alt+T`(对话), `Ctrl+Alt+D`(DevPanel)，无退出快捷键 |
| DevPanel退出按钮 | **已存在** | `src/components/DevPanel/DevPanel.tsx:155`, `src/App.tsx:1562-1564` | `handleDevInjectExit` → `dispatch({ type: "user.exit" })` |

#### 关键代码引用 - 窗口关闭拦截器

`src/App.tsx:1866-1898`:
```ts
const registerCloseHandler = async () => {
  const unlisten = await appWindow.onCloseRequested((event) => {
    if (allowWindowCloseRef.current || !machineReadyRef.current) {
      return;                         // 允许直接关窗
    }
    event.preventDefault();           // 阻止默认关闭
    pendingExitRef.current = true;
    dispatch({ type: "user.exit" });  // 走farewell路径
  });
};
```

#### 关键代码引用 - DevPanel Exit按钮

`src/App.tsx:1562-1564`:
```ts
const handleDevInjectExit = useCallback(() => {
  dispatch({ type: "user.exit" });
}, [dispatch]);
```

### 1.2 `lifecycle === 'deep_sleep'` 监听订阅

**已存在**。`src/App.tsx:1175-1178`:
```ts
if (pendingExitRef.current && nextState.lifecycle === "deep_sleep") {
  allowWindowCloseRef.current = true;
  void appWindow.close();           // farewell动画播完后关闭窗口
}
```

这是当前退出链条的末端触发点——外部listener检测到状态机进入 `deep_sleep` 后，解除关闭拦截并close窗口。

### 1.3 StateMachine.ts 中 `farewell` 的 `onComplete` 实际行为

`src/state/StateMachine.ts:753-787`:
```ts
private enterFarewell(): void {
  this.timers.clearAll();
  this.player!.clearCSSEffects();
  this.commitState({ lifecycle: 'farewell', ... });

  const farewellToken = this.playAnimation({
    state: 'farewell',
    intent: 'oneshot',
    onComplete: (tok) => {
      if (tok !== farewellToken || tok !== this.currentAnimationToken) return;
      this.currentAnimationToken = null;
      this.timers.clearAll();                   // 清理定时器
      this.commitState({ lifecycle: 'deep_sleep', ... });  // 切换到deep_sleep
      this.emitStateChanged();                  // 发射状态变更事件
      // ⚠️ 无任何 exit 回调
    },
  });
}
```

**结论**: farewell `onComplete` 仅做了三件事：清定时器 → 状态切换到 `deep_sleep` → emit事件。**未调用任何退出通知回调**。外部listener（App.tsx:1175）通过订阅状态变更来接管退出动作。

### 1.4 `PetEvent` 中 `user.exit` 的派发方

全仓搜索 `dispatch.*user\.exit|type.*user\.exit` 结果：

| 位置 | 文件:行号 | 触发条件 |
|------|----------|---------|
| 窗口关闭拦截 | `src/App.tsx:1878` | 用户点击X按钮 → `onCloseRequested` 拦截 |
| DevPanel按钮 | `src/App.tsx:1563` | 开发面板 `user.exit` 按钮 |

**结论**: `user.exit` 事件仅由上述两处派发，无其他派发源。无托盘、快捷键、右键菜单等入口。

---

## §2 PetContext SQLite 持久化层现状

### 2.1 PetContext 接口 vs SQLite schema 对照

| PetContext字段 | 合同定义 | SQLite schema | 读写实现 |
|---------------|---------|---------------|---------|
| `lastInteractionAt` | `ichan_project_doc.md:608` | **无** | **未实现** |
| `lastSeenDate` | `ichan_project_doc.md:609` | **无** | **未实现** |
| `lastMorningRitualDate` | `ichan_project_doc.md:610` | **无** | **未实现** |
| `lastExitClean` | `ichan_project_doc.md:611` | **无**（key未注册） | **硬编码 `true`**（见§2.4） |
| `lastCsvImportDate` | `ichan_project_doc.md:612` | `config`表 key-value (`petcontext.lastCsvImportDate`) | **已实现** |

当前无独立 `pet_context` 表，所有已持久化的PetContext字段通过 Rust侧 `app.sqlite` 的 `config` 表（key-value结构）读写。

`src-tauri/src/notion/mod.rs:7-12`:
```rust
const CONFIG_SCHEMA_SQL: &str = "
  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT
  );
";
```

### 2.2 PetContextService 模块形态

**已存在**。`src/services/PetContextService.ts:1-42`:

```ts
const KEY_LAST_CSV_IMPORT = "petcontext.lastCsvImportDate";

export const PetContextService = {
  async getLastCsvImportDate(): Promise<string | null> {
    return await invoke<string | null>("config_get_value", { key: KEY_LAST_CSV_IMPORT });
  },
  async setLastCsvImportDate(date: string): Promise<void> {
    await invoke("config_set_value", { key: KEY_LAST_CSV_IMPORT, value: date });
  },
  async migrateFromConfigTable(): Promise<void> { /* placeholder */ },
};
```

文件头部注释标明了迁移触发条件（字段数>=5且跨领域 / 读写频率>1次/分钟 / 需事务性批量更新），`migrateFromConfigTable` 仅有函数体骨架（`// Placeholder`）。

**注意**: 模块命名为 `PetContextService` 而非 `PetContextStore`，无 "Store" 后缀命名。

### 2.3 `lastCsvImportDate` 完整读写链路（关键的持久化证据）

**写路径**:
1. `src/hooks/useDragDropFeed.ts:69` → `PetContextService.setLastCsvImportDate(formatLocalDate(new Date()))`
2. → TS `invoke("config_set_value", { key: "petcontext.lastCsvImportDate", value })`
3. → Rust `notion/mod.rs:19-22` → `config_set_value_internal()` → UPSERT INTO `config` 表 (`app.sqlite`)

**读路径**:
1. `src/App.tsx:1213` → `PetContextService.getLastCsvImportDate()`
2. → TS `invoke("config_get_value", { key: "petcontext.lastCsvImportDate" })`
3. → Rust `notion/mod.rs:14-17` → `config_get_value_internal()` → SELECT FROM `config` 表

**结论**: 持久化层已建立——走的是 SQLite（`app.sqlite` 的 `config` 表），通过 Rust `rusqlite` 操作，TS通过 `invoke` 调用。不是localStorage/文件/内存。

### 2.4 SessionBootstrap.lastExitClean 的当前值来源

全仓搜索 `lastExitClean:` 赋值：

| 位置 | 文件:行号 | 值 | 场景 |
|------|----------|-----|------|
| 初始启动 | `src/App.tsx:1201` | `true` (hardcoded) | `machine.start({ isNewDay: false, lastExitClean: true })` |
| Dev Force Dialog | `src/App.tsx:1477` | `true` (hardcoded) | `machineRef.current.start({ isNewDay: false, lastExitClean: true })` |
| Dev Reset | `src/App.tsx:1510` | `true` (hardcoded) | `machineRef.current.start({ isNewDay: false, lastExitClean: true })` |
| 测试 | `src/state/StateMachine.dialog.test.ts:20` | `true` (hardcoded) | 测试fixture |

源码注释证据 - `src/App.tsx:1198`:
```ts
// TODO(Phase B): Load real values from SQLite PetContext.
machine.start({
  isNewDay: false,
  lastExitClean: true,   // ← 硬编码
});
```

**结论**: `lastExitClean` 始终硬编码为 `true`，从未从SQLite读取，从未在退出时写入。`interface_v1_2.md §4.1` 的契约字段虽定义为 `boolean`，但实际是死数据。

---

## §3 Tauri 2.x 退出能力的实际状态

### 3.1 权限声明清单

`src-tauri/capabilities/default.json` 已声明的权限（仅列与退出/菜单/托盘相关者）:

| 权限 | 状态 |
|------|------|
| `core:tray:*` | **未声明** |
| `core:app:allow-exit` / `process:allow-exit` | **未声明** |
| `core:menu:*` | **未声明** |
| `core:window:allow-close` | **已声明** (line 39) |
| `global-shortcut:allow-register` | **已声明** (line 10) |
| `global-shortcut:allow-unregister` | **已声明** (line 11) |

### 3.2 Rust侧退出相关代码

| 用途 | 文件:行号 | 代码 |
|------|----------|------|
| Wizard未完成setup时强制退出 | `lib.rs:56` | `app.exit(0)` |
| Wizard窗口关闭拦截（setup未完成） | `lib.rs:199` | `close_app_handle.exit(0)` |

**无** `app_quit`/`app_exit` 自定义Tauri command。无 `tauri-plugin-process` 插件注册。

### 3.3 当前已注册的全局快捷键

| 快捷键 | 定义位置 | 用途 |
|--------|---------|------|
| `Ctrl+Alt+P` | `petBehaviorConfig.ts:3` (`clickThroughShortcut`) | 穿透切换 |
| `Ctrl+Alt+T` | `App.tsx:80` (`DIALOG_SHORTCUT`) | 打开对话 |
| `Ctrl+Alt+D` | `App.tsx:81` (`DEV_PANEL_SHORTCUT`) | DEV面板（dev build only） |

注册代码位于 `src/App.tsx:1669-1743`，先 `unregisterAll()` 再逐个 `register`。

---

## §4 异常退出检测的可行路径

### 4.1 Tauri 2.x Windows平台上进程被杀时的hook能力

**实地查证结果**（查阅 Tauri 2 官方文档 v2.tauri.app）：

- `onCloseRequested` — 仅在"正常关闭请求"（点击X按钮、右键任务栏关闭、调用 `window.close()`）时触发，**进程被任务管理器 kill 时不会触发**
- `app.exit(0)` — 立即退出进程，**不触发任何事件**
- Tauri 2 无 `onExit`/`onTerminate`/`onProcessKill` 等生命周期钩子
- `tauri-plugin-process` 仅提供 `exit()` 和 `restart()` 函数，无监听能力
- Rust侧 `tauri::RunEvent::Exit` 仅在 Tauri 正常退出循环时触发，被 kill 时不触发

**Windows OS层面**: `TerminateProcess` (任务管理器所用) 不发送 `WM_CLOSE`/`WM_QUIT`，不给应用程序任何清理机会。

**结论**: Tauri 2 在 Windows 上**没有**任何方式可以 hook 进程被外部 kill。dirty-bit 模式（启动时立即写 `lastExitClean = false`，正常退出时写 `true`）是唯一可行路径。

### 4.2 dirty-bit 的插入位置分析

当前启动流程（`src/App.tsx` 首个 `useEffect`）:

```
动画加载 → dialog状态机器初始化 → machine.subscribe(listener)
→ machine.start({ isNewDay: false, lastExitClean: true })  ← 当前
→ hungry评估 → ReminderScheduler启动
```

若采用 dirty-bit，需要在 `machine.start()` 之前：

```ts
// 1. 立即写 lastExitClean = false
await PetContextService.setLastExitClean(false);  // 需新增此方法

// 2. 然后加载 PetContext → 构造 SessionBootstrap
const ctx = await PetContextService.loadAll();
const lastExitClean = ctx.lastExitClean;  // 上次退出时的值

// 3. machine.start({ isNewDay: ..., lastExitClean })
```

**是否与现有启动流程冲突**：
- 需在 `machine.start()` 之前新增一次 `invoke("config_set_value")`，约增加 1-5ms
- 目前 `start()` 调用就是 `async` (line 1210-1211)，在此前插入 `await` 不破坏任何同步假设
- 需新增 `PetContextService` 方法（`setLastExitClean`/`loadAll`），但 `PetContextService` 已有 `invoke` 通道
- **不冲突**

---

## §5 与现有审计条目的耦合

### 5.1 与审计报告 M4 的关系

审计报告 `docs/05_audit/B2-6_Implemented_Audit_Repo.md:16-64` 申报的 **M4** 项：

> M4: `farewell` → `deep_sleep` 生命周期闭环未实现
> - 合同 `interface_v1_2.md §5 场景5:632` 设计了 `notifyApplicationShellToExit()` 回调
> - 代码 `StateMachine.ts:765-787` 在 farewell onComplete 中未调用任何退出回调
> - 当前依赖外部 listener (App.tsx:1175) 检测 `deep_sleep` 来关窗

**B3-14b 等价于 M4 的实施**。实施时（添加 farewell onComplete → exit callback 链）：

- **触碰范围**: `StateMachine.ts` (`enterFarewell`、`StateMachineInitOptions`)、`App.tsx` (回调注册)
- **不会触碰**其他被标记"已偏离合同"的代码段（L1 walk.roaming镜像、L2 destroy合同补充、L5 快捷键配置、D3编号纠正均与 farewell 链无关）
- `StateMachine.destroy()`（审计L2范围，`StateMachine.ts:153-164`）与 farewell 链是解耦的: `destroy()` 是"强制清理资源"，farewell 链是"优雅退出"。实施M4不会触及 `destroy()` 的代码。

### 5.2 退出快捷键与 L5 审计项的顺序

审计 L5 (`docs/05_audit/B2-6_Implemented_Audit_Repo.md:137-177`) 指出 `DialogShortcut` 和 `DevPanelShortcut` 应纳入 `petBehaviorConfig.ts` 统一管理。

若 B3-14 需要新增退出快捷键：

- **先做 L5 更合适**：将快捷键集中到 `petBehaviorConfig.ts` 的 `app` 组，再新增退出快捷键条目
- 反之可以先在 `App.tsx` 加一行 `const EXIT_SHORTCUT = "Ctrl+Alt+Q"`, 后续L5执行时迁移
- **无硬性顺序依赖**，仅影响代码整洁度

---

## §6 隐患与盲点

1. **pet窗口 Rust侧无 `on_window_event` 监听**：wizard窗口有（`lib.rs:189`），pet窗口无。当前仅靠TS侧 `onCloseRequested` 拦截，TS层出错时窗口将直接关闭跳过 farewell。

2. **`allowWindowCloseRef` 安全网不完整**：`App.tsx:1872` 的 `if (allowWindowCloseRef.current || !machineReadyRef.current) return;` 允许机器未就绪时直接关窗，此时 `lastExitClean` 不会被写为 `true`——这是一个合理的异常退出路径，但当前无人感知。

3. **farewell动画被interrupt的风险**：`enterFarewell()` 调用 `playAnimation()` 前会 `interruptCurrentAnimation()`，但如果在 farewell 播放过程中又有新的 `dispatch`（例如迟到timer事件），当前代码没有保护——`handleEvent` 中 `case 'user.exit'` 仍可被触发。

4. **`lastExitClean` dummy值的隐蔽性**：由于总是硬编码 `true`，异常退出检测链路从未验证过。实施 dirty-bit 后，首次启动即会暴露真实的 `false` 路径——`petCopy.ts:54` 的 `uncleanExit` 台词（"咦，昨天怎么突然不见了……你没事吧？"）会首次被触发，需确认此台词在 `WAKE_COPY` 分支选择逻辑中已被正确接入。

5. **`isNewDay` 同样未实现**：合同定义 `today !== lastSeenDate`（`ichan_project_doc.md:616`），但 `lastSeenDate` 也未持久化，当前 `isNewDay` 同样硬编码为 `false`（`App.tsx:1200`）。

---

## §7 未能确认的事项

1. **farewell动画结束后写入 `lastExitClean = true` 的时机**：合同 §5.3 要求"保存 PetContext 到 SQLite（lastExitClean = true）"在"播放 farewell 动画"之前（`ichan_project_doc.md:777 → 780`），但 `interface_v1_2.md §5 场景5` 未明确此顺序。需要在架构决策阶段确认写入时机。

2. **`WAKE_COPY.uncleanExit` 的分支选择逻辑**：`petCopy.ts:54-55` 仅定义了台词文本和注释，未确认在 `StateMachine.enterWakingUp()` 或 morningRitual 流程中是否已有条件分支代码。该分支可能同样待实施。

3. **`core:window:allow-close` 权限对 `window.close()` 的影响**：若未声明此权限，TS侧的 `appWindow.close()` 是否会静默失败，需实测确认。当前已声明（capabilities/default.json:39），无风险。

---

*报告完。本文不包含架构建议、任务卡和代码patch。*