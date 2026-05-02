# B3-14 架构决议文档 v0.4

> **日期**: 2026-05-02
> **架构师**: Claude
> **状态**: 锁定，作为B3-14任务卡细化阶段的输入
> **基于**: `B3-14_field_research_report.md`（DeepSeek 实地调研）

---

## §0 版本变更记录

| 版本 | 日期 | 变更摘要 |
|------|------|---------|
| v0.1 | 2026-05-02 | 初版架构决议 |
| v0.2 | 2026-05-02 | 项目负责人拍板后修订：D1 退出入口收敛为单一快捷键路径（删除右键菜单提案；任务栏图标改归 MVP 后）；D8 锁定 unclean 台词消费归 B3-5；§5 排除项新增"系统托盘 / 任务栏图标" |
| v0.4 | 2026-05-02 | DeepSeek 任务卡细化阶段反馈 4 个待补充点的裁定合并入主文档：D2 修订（onExitRequest 单一退出职责，markCleanExit 由 App.tsx 在 dispatch 前 fire-and-forget 触发）；D4 补强错误处理；§5 必做项调整（L5 内联为 Step 0，必做项 10→11） |

---

## §1 调研报告改变了什么

DeepSeek 调研挖出三件影响架构的关键事实：

1. **窗口关闭按钮的 farewell 链路存在，但实际不可达**——`onCloseRequested` 已经接好（拦截关闭、派发 `user.exit`、走 farewell、监听 `deep_sleep` 关窗）。但 pet 窗口是无边框透明悬浮窗，**没有用户可点的 X 按钮**。该链路只在 Alt+F4、程序内 `appWindow.close()` 调用、某些系统级关闭信号时触发。这是项目负责人每天必须 Ctrl+C 退出的根因——不是 UX 不直觉，是路径**根本不可达**。

2. **PetContext 持久化层已建立**——走 `app.sqlite` 的 `config` key-value 表，通过 Rust `notion/mod.rs` 的 `config_get_value`/`config_set_value` command 暴露给 TS，TS 侧封装在 `PetContextService`。`lastCsvImportDate` 已是活字段。**B3-14 不需要新建持久化层**，只在现有通道里追加键即可。

3. **`lastExitClean` 与 `isNewDay` 是双胞胎死字段**——两者都硬编码、两者的真实数据都需要从 `lastSeenDate` 派生。一并实施才能避免 B3-5 启动时再触一次 PetContext 改动。

---

## §2 整体架构（文字版总览）

```
[启动]
  App.tsx useEffect
    → PetContextService.loadSessionBootstrap()  [新增]
       internally (按顺序):
         1. loadAll() 读 lastExitClean / lastSeenDate
         2. lastExitClean = stored_value ?? false  // 首次启动视为 unclean
         3. isNewDay = formatLocalDate(now) !== lastSeenDate
         4. await setLastExitClean(false)         // 立即标脏
         5. await setLastSeenDate(today)          // 顺手更新
         6. return { isNewDay, lastExitClean }
    → machine.start(sessionBootstrap)  [接通真实值，不再硬编码]

[正常退出]
  入口（覆盖全部用户场景）:
    - Ctrl+Alt+Q 全局快捷键（新增 / 主入口）
    - DevPanel exit 按钮（已有 / 开发期辅助）
    - onCloseRequested 链路（系统级兜底：Alt+F4 / 程序调用 close / 系统关机等）
    全部统一调用 App.tsx 的 requestExit() helper:
      function requestExit() {
        void PetContextService.markCleanExit().catch(e => console.error(...));  // fire-and-forget
        dispatchPetEvent({ type: 'user.exit' });
      }

  StateMachine.enterFarewell():
    - 播放 farewell oneshot
    - （状态机内部不再调用 markCleanExit；持久化是 App.tsx 关切）

  farewell onComplete:
    - commitState({ lifecycle: 'deep_sleep' })
    - emitStateChanged()
    - onExitRequest()  // 新增 init 选项注入的回调，单一退出职责

  App.tsx 注入的 onExitRequest:
    - invoke('app_quit')  // 唯一职责：通知壳进程退出
关键改动：把 markCleanExit 从 enterFarewell 块移到 App.tsx 的 requestExit() helper 块，状态机层彻底不再涉及持久化。

[异常退出（任务管理器/崩溃/Ctrl+C/Tauri 2 在 Windows 平台无可监听的 hook）]
  进程消失，lastExitClean 留在启动时写的 false
  ↓
  下次启动 loadSessionBootstrap() 读到 false
  ↓
  SessionBootstrap.lastExitClean = false 传入状态机
  ↓
  B3-5 晨间仪式按此分支选 uncleanExit 台词（B3-14 不实施此消费）

[farewell 期间事件保护（修复调研盲点 3）]
  StateMachine.handleEvent():
    if (state.lifecycle === 'farewell') {
      // 拒绝所有外部 PetEvent（含迟到 timer）
      // 仅允许 farewell 自己 onComplete 内部触发的 commit
      return
    }
```

---

## §3 决策记录

### D1：退出入口选型（v0.2 修订）

**MVP 必备入口**：
- `Ctrl+Alt+Q` 全局快捷键（**新增 / 主入口**）
- DevPanel exit 按钮（已有，保留）
- `onCloseRequested` 链路保留（系统级兜底，触发频率极低但不能砍）

**不做**：
- ❌ 宠物右键菜单（v0.1 提案，v0.2 移除——单一快捷键已完全覆盖正常退出需求）
- ❌ 系统托盘 / 任务栏图标（归 MVP 后批次，理由见 §5 排除项）

**理由**：调研报告 §1.1 暴露了"X 按钮路径不可达"的事实后，正常退出实际只缺一个入口；快捷键最简单、最易记，且复用现有 globalShortcut 基础设施；右键菜单和托盘对核心痛点是冗余覆盖，徒增 MVP 工程量。

### D2：onExitRequest 单一退出职责（v0.4 修订）

`StateMachineInitOptions` 新增 `onExitRequest?: () => void`，唯一职责是 farewell `onComplete` 切换到 `deep_sleep` 后通知壳进程退出。唯一调用方是 App.tsx：`onExitRequest = () => invoke('app_quit')`。
持久化标脏（markCleanExit）不走此回调，由 App.tsx 在 `dispatch({ type: 'user.exit' })` 调用点之前 fire-and-forget 触发：
```ts
function requestExit(): void {
  void PetContextService.markCleanExit().catch((e) =>
    console.error('[PetContext] markCleanExit failed:', e)
  );
  dispatchPetEvent({ type: 'user.exit' });
}
```
三个退出入口（Ctrl+Alt+Q / DevPanel / onCloseRequested）统一调用 `requestExit()`，不直接 `dispatch`。
保留而非移除 App.tsx 现有 `lifecycle === 'deep_sleep'` 监听，作为兜底语义：
- 主路径：requestExit → farewell → onExitRequest → invoke('app_quit')
- 兜底：onExitRequest 因故未注入或未触发时，lifecycle deep_sleep listener 仍走旧路径关窗

理由：

- 持久化是 App.tsx 的关切，不是状态机的关切。状态机应保持纯净的"事件 / 转移"语义，不被 IO 副作用污染。把 markCleanExit 接进 onExitRequest 会让状态机层多承担一份它本不该有的职责。
- B2-9 修复 dialog 时已经验证过"主入口 + 单向兜底"的双层防护模式（dialogStateBridge）很有效。退出链路同款处理。

严格不允许的实现写法：

- ❌ await markCleanExit() 然后 dispatch（违反 fire-and-forget 决策 [D3]）
- ❌ 将 markCleanExit 作为 onExitRequest 回调副作用执行（违反层次分离）
- ❌ 在状态机内部任何位置调用 markCleanExit
 
### D3：lastExitClean 持久化时机 = farewell 派发时 fire-and-forget

**不**按 `ichan_project_doc.md §5.3` 描述的"farewell 动画之前保存"。改为：farewell 动画**派发同步**调用 `markCleanExit()`，不 await，不阻塞动画播放；onComplete 时直接 onExitRequest，不等持久化结果。

**理由**：
- SQLite 单字段写入实测毫秒级，远短于 farewell 动画时长（~1.5s）
- "之前 await 保存"在 SQLite 卡住时会让用户看到点击后无反应，体验差
- "fire-and-forget"在 SQLite 失败的罕见场景下，下次启动会被 dirty-bit 检测为 unclean，本质上没失去任何数据完整性
- `ichan_project_doc.md §5.3` 是早期描述性流程图，不构成硬契约（合同真值源是 `interface_v1_2.md`）；本决策需要回写到 §5.3 修正描述

### D4：dirty-bit 时序 = 启动时先读后写，原子化封装

`loadSessionBootstrap()` 内部按顺序：
1. `loadAll()` 读取 `lastExitClean` / `lastSeenDate`
2. 计算 `isNewDay` / 解读 `lastExitClean`
3. `setLastExitClean(false)` + `setLastSeenDate(today)` 双写
4. 返回 SessionBootstrap
错误处理策略（v0.4 补强）：
实现必须按以下结构降级，不允许抛异常阻塞 machine.start()：
```ts
async function loadSessionBootstrap(): Promise<SessionBootstrap> {
  let lastExitClean = false;        // 默认值：首次启动 / 读失败均视为 unclean
  let lastSeenDate: string | null = null;

  // 阶段 1：读取，失败降级
  try {
    lastExitClean = (await getLastExitClean()) ?? false;
    lastSeenDate = await getLastSeenDate();
  } catch (e) {
    console.error('[PetContext] loadSessionBootstrap read failed, defaulting to unclean:', e);
  }

  const today = formatLocalDate(new Date());
  const isNewDay = lastSeenDate !== today;

  // 阶段 2：写入 dirty-bit + lastSeenDate，失败仅日志
  try {
    await setLastExitClean(false);
    await setLastSeenDate(today);
  } catch (e) {
    console.error('[PetContext] dirty-bit write failed; this session will not be detectable next launch:', e);
  }

  return { isNewDay, lastExitClean };
}
```
降级语义表：
场景, getLastExitClean() 返回, lastExitClean 取值, 语义
首次安装（key 不存在）, null, false（??默认）, 视作 unclean
正常退出后启动, true, true, clean
异常退出后启动, false, false, unclean
SQLite 读失败, 抛异常, false（catch 默认）, 视作 unclean（保守）

null-key（首次）和 read-error 走相同降级路径，无需区分。写失败只记日志、不阻塞——最坏情况是本次会话退出状态下次无法检测，但 lastExitClean 已经是 false 状态，不会变得更糟。

读必须先于写，否则会读到刚写的 false。封装在 PetContextService 里，App.tsx 只 `await` 一次拿结果，不暴露顺序细节。

### D5：PetContext 持久化层维持现状（不迁移到独立表）

`PetContextService` 文件头注释列出的迁移触发条件（字段≥5且跨领域 / 频率>1次/分钟 / 需事务批量）目前没一条满足。B3-14 只在现有 `config` key-value 表里追加键：

```
petcontext.lastExitClean        boolean → "true"/"false"
petcontext.lastSeenDate         string  → "YYYY-MM-DD"
petcontext.lastInteractionAt    number  → unix ms（B3-14 不接通，留契约位）
petcontext.lastMorningRitualDate string → 留给 B3-5
```

**理由**：合同字段≠持久化字段。B3-14 只接通退出/启动需要的字段，剩余 2 个保留契约定义、推迟到使用方任务（B3-5 接 lastMorningRitualDate；lastInteractionAt 暂无消费方）。

### D6：双胞胎实施——lastExitClean 和 isNewDay 一并接通

调研报告 §6 盲点 5 指出 `isNewDay` 同样硬编码 `false`。本任务一并实施：B3-14 完成后，`SessionBootstrap` 两个字段都从 SQLite 真实派生。

**理由**：两者读写时机和路径完全一致，分两次实施徒增工程开销且会在 B3-5 启动时再触一次 PetContext 改动，违反"一次性把启动 bootstrap 接通"的整洁度。

### D7：farewell 期间事件保护

修复调研报告 §6 盲点 3：`StateMachine.handleEvent()` 入口处加守卫——`lifecycle === 'farewell'` 时拒绝所有外部 PetEvent（含迟到 timer）。仅允许 farewell 自己的 onComplete 内部 commit。

**理由**：farewell 是单调终态过渡，不应再被任何事件改变。当前代码无此保护，是潜在隐患。借 B3-14 修复成本极小。

### D8：unclean exit 台词分支接入 = 归 B3-5（v0.2 锁定）

调研报告 §7 待确认 2 提到 `WAKE_COPY.uncleanExit` 文本已存在但分支选择逻辑未确认。

- **B3-14 范围**：保证 SessionBootstrap.lastExitClean 是真实值
- **B3-5 范围**：在晨间仪式 / waking_up 流程中根据该字段选台词

**理由**：B3-14 是基础设施任务（数据接通），台词分支是业务任务（数据消费），分层清晰。B3-5 是晨间仪式集成任务，台词分支天然在其内聚领域内，且可与 B3-5 既有的晨间仪式测试套件合并。

**预期副作用**：B3-14 完成到 B3-5 完成的窗口期，异常退出后晨间仪式仍走普通台词分支。这段时间数据是真实的，只是消费方未接入——这种"基础设施先于业务接通"的中间态是正常的工程节奏，不构成 bug。B3-5 任务卡需明确包含此项。

### D9：app_quit Rust command = 新增，用 `app.exit(0)` 而非 `window.close()`

新增 Tauri command `app_quit`，内容为 `app_handle.exit(0)`。`capabilities/default.json` 追加 `core:app:allow-exit` 权限（如必要）或在 `default.json` 不需要权限时直接注册自定义 command。

**理由**：
- `appWindow.close()` 只关单窗，不杀进程；多窗口扩展（未来如果 wizard 重开）会泄露进程
- `app.exit(0)` 表达"退出程序"语义明确，与未来托盘"退出"按钮直接对齐
- 代价：~5 行 Rust + 1 行权限声明

**实施细节备注**：DeepSeek 在细化阶段可视情形选择 (a) 自定义 command（本决议默认）或 (b) 引入 `tauri-plugin-process` 调用其 `exit()`。两者效果等价，选 (a) 不引入新 Cargo 依赖，更克制。

### D10：盲点 1（pet 窗口 Rust 侧无 on_window_event）= MVP 后处理

不在 B3-14 范围内补。

**理由**：dirty-bit 已经是 backstop——TS 层即使彻底失效，下次启动 lastExitClean=false 仍会被检测为 unclean，不丢任何状态语义。Rust 侧拦截器是"防御性深度防御"，工程上不紧迫。记入 `ichan_project_doc.md §8` 待决事项。

---

## §4 接口契约变更

### `interface_v1_2.md` §4.3 修订

```ts
export interface StateMachineInitOptions {
  now?: () => TimestampMs;
  onExitRequest?: () => void;   // 新增
}
```

### `interface_v1_2.md` §4.4 修订

destroy() 文档同步审计 L2 项（destroy 必须列表补三项）。**注**：L2 已是独立任务卡，不在 B3-14 实施范围内，但合同文档修订时机需协调，避免冲突。

### `interface_v1_2.md` §5 场景 5 修订

farewell `onComplete` 示意代码末尾追加 `this.options.onExitRequest?.()` 调用。

### `petBehaviorConfig.ts` 新增

```ts
app: {
  // ... 既有
  exitShortcut: "Ctrl+Alt+Q",  // 新增
}
```

L5 实施安排：原审计 L5 项（dialogShortcut / devPanelShortcut 集中化）合并为 B3-14 的 Step 0，与 exitShortcut 一同落地。详见 §5 必做项第 0 条。

### `ichan_project_doc.md` §5.3 修订

将"保存 PetContext 到 SQLite（lastExitClean = true）"的位置从"播放 farewell 动画"之前改为"farewell 动画派发的同时（fire-and-forget）"。

### `PetContextService` 新增方法
实现细则见 §3 D4 错误处理代码骨架。

```ts
loadSessionBootstrap(): Promise<SessionBootstrap>  // 含 dirty-bit 写
markCleanExit(): Promise<void>                     // farewell 时 fire-and-forget
// 内部辅助
getLastExitClean(): Promise<boolean | null>
setLastExitClean(value: boolean): Promise<void>
getLastSeenDate(): Promise<string | null>
setLastSeenDate(date: string): Promise<void>
```

### Rust 侧新增 command

```rust
#[tauri::command]
async fn app_quit(app: tauri::AppHandle) {
  app.exit(0);
}
```

需在 `lib.rs` 的 `.invoke_handler(tauri::generate_handler![..., app_quit])` 中注册。

---

## §5 实施范围与排除项

### 必做（B3-14 完整范围 / 10 项）

0. Step 0（吸收原审计 L5 项）：`petBehaviorConfig.ts` 的 `app` 组新增 `dialogShortcut` / `devPanelShortcut` / `exitShortcut` 三个字段；`App.tsx:80-81` 两处常量替换为读配置 + 新增 `EXIT_SHORTCUT` 同样读配置；同步 `behavior_config.md §2.6` 与 `param_audit.md`。Step 0 必须在 Step 1 之前完成，验收标准为 App.tsx 内不存在 `"Ctrl+Alt+T"` / `"Ctrl+Alt+D"` / `"Ctrl+Alt+Q"` 字面量。
1. `StateMachineInitOptions.onExitRequest` 接口扩展 + farewell onComplete 内调用（单一退出职责，见 D2）
2. App.tsx 抽 `requestExit()` helper（含 fire-and-forget markCleanExit + dispatch user.exit）；三个退出入口统一调用此 helper
3. App.tsx 注入 onExitRequest = () => invoke('app_quit')；现有 lifecycle deep_sleep listener 保留为兜底（无代码改动）
4. `Ctrl+Alt+Q` 全局快捷键注册（依赖 Step 0 完成）
5. `app_quit` Tauri command 新增 + 权限声明（如必要）
6. `PetContextService` 新方法：loadSessionBootstrap / markCleanExit + 4 个 getter/setter，实现见 D4 错误处理骨架
7. `App.tsx` 启动逻辑改造：machine.start 前 `await loadSessionBootstrap()`
8. StateMachine.handleEvent 加 farewell 期间事件守卫
9. `interface_v1_2.md` §4.3 / §5 场景 5 同步
10. `ichan_project_doc.md` §5.3 同步

### 明确排除（不在 B3-14 内）

- ❌ 系统托盘 / 任务栏图标 → 归 MVP 后批次（与 L1 walk.roaming 镜像、Rust 侧 on_window_event backstop、lastInteractionAt 接通等一并处理）
- ❌ 宠物右键菜单 → 不做（单一快捷键已覆盖痛点）
- ❌ pet 窗口 Rust 侧 on_window_event 拦截 → MVP 后，记入 ichan_project_doc.md §8 待决
- ❌ WAKE_COPY.uncleanExit 台词分支选择逻辑 → 归 B3-5
- ❌ lastInteractionAt 字段读写接通 → 无消费方，推迟
- ❌ lastMorningRitualDate 字段读写接通 → 归 B3-5

### 前置依赖

- **L5 快捷键配置化**：内联为 B3-14 Step 0，不再单独列任务卡
- **L2 destroy 合同补齐**：独立任务卡，可在 B3-14 落地周期内任意时间作为并行 PR 处理
- **D3 编号纠正**：独立任务卡，同上

### 测试策略

自动化覆盖：
- PetContextService 的 loadSessionBootstrap / markCleanExit 走单元测试，含 mock invoke 抛异常的降级路径
- StateMachine.handleEvent 在 lifecycle === 'farewell' 时拒绝外部事件，走单元测试
- requestExit helper 的 fire-and-forget 行为走集成测试

人工验证（无法自动化，Codex 在 PR 描述中说明已手动测试）：
1. farewell 期间 kill 进程的 dirty-bit 行为：启动 → Ctrl+Alt+Q → 在 farewell 动画约 1.5s 窗口内任务管理器 kill → 重启验证 SessionBootstrap.lastExitClean === false
2. SQLite 数据库完整性：上一步重启后用 sqlite3 CLI 打开 app.sqlite，`SELECT * FROM config WHERE key LIKE 'petcontext.%'`，确认表结构完整、值可读、无损坏标记

### 后续衔接

- B3-14 完成后，B3-5 启动；B3-5 任务卡需新增"消费 lastExitClean 选择 uncleanExit 台词"和"消费 lastMorningRitualDate"两项

---