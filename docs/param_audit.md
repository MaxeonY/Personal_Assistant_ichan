# param_audit.md

> **版本**: v1.1 - 2026-05-02  
> **范围**: 全仓库已实施脚本的参数汇总（代码中的常量、Token、阈值、超时、限幅、尺寸）  
> **真值源**: 以实际代码为准，参数变更应同步更新本文档

---

## 1. 全局应用 & 窗口设定

| 参数 | 值 | 位置 | 说明 |
|------|-----|------|------|
| `productName` | `"desktop-pet"` | `src-tauri/tauri.conf.json` | 应用产品名 |
| `version` | `"0.1.0"` | `src-tauri/tauri.conf.json` | 应用版本 |
| `identifier` | `"com.root.desktop-pet"` | `src-tauri/tauri.conf.json` | 应用包标识 |
| `clickThroughShortcut` | `"Ctrl+Alt+P"` | `src/config/petBehaviorConfig.ts` | 全局快捷键：穿透点击 |
| `dialogShortcut` | `"Ctrl+Alt+T"` | `src/config/petBehaviorConfig.ts` | Global shortcut: open/focus dialog |
| `devPanelShortcut` | `"Ctrl+Alt+D"` | `src/config/petBehaviorConfig.ts` | Global shortcut: toggle DevPanel (DEV only) |
| `exitShortcut` | `"Ctrl+Alt+Q"` | `src/config/petBehaviorConfig.ts` | Global shortcut: trigger farewell then exit app || `devPanelShortcut` | `"Ctrl+Alt+D"` | `src/config/petBehaviorConfig.ts` | 全局快捷键：切换 DevPanel（仅 DEV） |
| `shortcutDebounceMs` | `180` | `src/config/petBehaviorConfig.ts` | 快捷键去抖间隔 (ms) |
| `statusHideMs` | `1800` | `src/config/petBehaviorConfig.ts` | 状态提示自动隐藏 (ms) |

### 1.1 窗口尺寸

| 窗口 | 宽度 | 高度 | 透明 | 无装饰 | 置顶 | 隐藏任务栏 |
|------|------|------|------|--------|------|-----------|
| `pet` (compact) | 380 | 290 | ✅ | ✅ | ✅ | ✅ |
| `pet` (dialog) | 560 | 360 | — | — | — | — |
| `wizard` | 1024 | 768 | ✅ | ❌ | ❌ | ❌ |

---

## 2. 宠物行为与时序参数

**源文件**: `src/config/petBehaviorConfig.ts`

### 2.1 窗口移动

| 参数 | 值 | 说明 |
|------|-----|------|
| `edgePaddingPx` | `8` | 窗口边距 (px) |
| `roamingSpeedPxPerSec` | `52` | 漫游移动速度 (px/s) |
| `targetedSpeedPxPerSec` | `180` | 定向移动速度 (px/s) |
| `targetedArrivalThresholdPx` | `8` | 定向移动到达判定阈值 (px) |
| `targetedDefaultWorkareaX` | `0.82` | 定向移动默认 X 比例 (工作区) |

### 2.2 状态计时器

| 参数 | 值 | 说明 |
|------|-----|------|
| `idleTimeoutMs` | `60000` (1 min) | idle.awake → idle.drowsy 超时 |
| `drowsyToNapMs` | `30000` (30 s) | drowsy → napping 过渡延迟 |
| `roamingMinMs` | `3000` (3 s) | 漫游状态最短时长 |
| `roamingMaxMs` | `6000` (6 s) | 漫游状态最长时长 |

### 2.3 饥饿判定

| 参数 | 值 | 说明 |
|------|-----|------|
| `HUNGRY_COPY.enterCooldownMs` | `21600000` (6 h) | 饥饿提示最小间隔 | 
| `CSV_FEED_TOAST_MS` | `2400` ms | CSV 投喂 toast 显示时长（`src/hooks/useDragDropFeed.ts`） |

### 2.4 提醒调度参数（B2-6）

| 参数 | 值 | 说明 |
|------|-----|------|
| `reminder.pollIntervalMs` | `1800000` (30 min) | Notion timed todo 轮询周期 |
| `reminder.evaluateIntervalMs` | `60000` (60 s) | 到点检测周期 |
| `reminder.maxQueueSize` | `3` | 内存队列上限 |
| `reminder.dialogGateRetryMs` | `500` ms | dialog 活跃重试间隔 |
| `reminder.dialogGateMaxRetries` | `60` | dialog 活跃最大重试次数（约 30s） |
| `reminder.bubbleTitleMaxChars` | `20` | ReminderBubble 标题截断长度 |

---

## 3. 对话 / UI 布局参数

**源文件**: `src/components/Dialog/dialog-tokens.ts`, `src/components/Dialog/dialog-transition.ts`, `src/components/Dialog/useDialogAnchorTransition.ts`

### 3.1 对话窗口几何

| 参数 | 值 | 说明 |
|------|-----|------|
| `COMPACT_WINDOW` | `380 × 290` | compact 窗口尺寸 |
| `COMPACT_PET_DISPLAY` | `291 × 180` | compact 下宠物显示尺寸 |
| `COMPACT_PET_ANCHOR_IN_WINDOW` | `(44.5, 110)` → `291 × 180` | compact 锚点盒 |
| `DIALOG_WINDOW` | `560 × 360` | dialog 窗口尺寸 |
| `DIALOG_PET_DISPLAY` | `150 × 136` | dialog 下宠物显示尺寸 |
| `DIALOG_PET_ANCHOR_IN_WINDOW` | `(54, 128)` → `150 × 136` | dialog 锚点盒 |
| 锚点偏移 (compact→dialog) | `(+61, +4)` | 窗口位置偏移量 |

### 3.2 对话过渡时序

| 参数 | 值 | 说明 |
|------|-----|------|
| `openingMs` | `320` | 打开动画时长 (ms) |
| `closingMessagesMs` | `180` | 关闭-消息淡出阶段 (ms) |
| `closingShellMs` | `220` | 关闭-shell 收束阶段 (ms) |
| `windowSnapFrameMs` | `16` | 关闭-窗口回 snap (1帧) |
| **关闭总时长** | **416** | 180 + 220 + 16 (ms) |
| `DIALOG_EASING` | `cubic-bezier(0.32, 0.72, 0, 1)` | Apple 风格缓动 |

### 3.3 对话舞台布局

| 参数 | 值 | 说明 |
|------|-----|------|
| `DIALOG_STAGE_LAYOUT.left` | `198` | 舞台左偏移 (px) |
| `DIALOG_STAGE_LAYOUT.top` | `62` | 舞台上偏移 (px) |
| `DIALOG_STAGE_LAYOUT.width` | `322` | 舞台宽度 (px) |
| `DIALOG_STAGE_LAYOUT.maxHeight` | `220` | 舞台最大高度 (px) |
| `DIALOG_STAGE_LAYOUT.bubbleMaxWidth` | `260` | 气泡最大宽度 (px) |
| `DIALOG_STAGE_LAYOUT.bubbleMinWidth` | `120` | 气泡最小宽度 (px) |
| `DIALOG_STAGE_LAYOUT.bubbleMaxHeight` | `132` | 气泡最大高度 (px) |

### 3.4 对话消息 & 历史

| 参数 | 值 | 说明 |
|------|-----|------|
| `ACTIVE_MESSAGE_FADE.delayMs` | `4500` | 消息淡出延迟 (ms) |
| `ACTIVE_MESSAGE_FADE.durationMs` | `220` | 消息淡出时长 (ms) |
| `ACTIVE_MESSAGE_FADE.preserveLatestCount` | `1` | 保留最新消息数 |
| `HISTORY_REVIEW.pageSize` | `30` | 历史回看每页条数 |
| `HISTORY_REVIEW.fallbackThreshold` | `5` | 历史回看降级阈值 |

### 3.5 动画锚点参数

| 参数 | 值 | 说明 |
|------|-----|------|
| `DEFAULT_REVEAL_RADIUS` | `680` | 默认圆形展开半径 (px) |
| `REVEAL_SCALE_FROM` | `0.72` | reveal-item 起始缩放比例 |
| `DIALOG_ANIMATION.scaleFrom` | `0.72` | 打开动画起始缩放 |

### 3.6 UI 杂项

| 参数 | 值 | 说明 |
|------|-----|------|
| `petDisplayHeightPx` | `180` | 宠物显示盒高度 (px) |

---

## 4. API 集成参数

### 4.1 DeepSeek API

**源文件**: `src/services/DeepSeekService.ts`, `src-tauri/src/lib.rs`

| 参数 | 值 | 说明 |
|------|-----|------|
| `DEEPSEEK_API_URL` | `https://api.deepseek.com/chat/completions` | API 端点 |
| `DEEPSEEK_MODEL` | `"deepseek-chat"` | 模型标识 |
| `TIMEOUT_MS` | `6000` | API 请求超时 (ms) |
| `MAX_OUTPUT_TOKENS` | `300` | 单次最大输出 token |
| `ABSOLUTE_CHAR_LIMIT` | `200` | 绝对字符上限（安全帽） |

**各模式温度 & 字符限制**:

| 模式 | Temperature | Char Limit |
|------|------------|------------|
| `morning_review` | `0.7` | `120` |
| `workout_reminder` | `0.5` | `50` |
| `chat` | `0.7` | `150` |
| `feed_highlight` | `0.5` | `60` |

### 4.2 Notion API

**源文件**: `src/services/notion-service.ts`, `src-tauri/src/lib.rs`

| 参数 | 值 | 说明 |
|------|-----|------|
| `NOTION_API_BASE_URL` | `https://api.notion.com/v1` | API 基地址 |
| `NOTION_VERSION` | `"2022-06-28"` | API 版本头 |
| `MAX_429_RETRIES` | `3` | 429 速率限制最大重试 |
| 退避基数 | `300 × 2^retryCount` ms | 指数退避 |
| 退避抖动 | `0-150` ms | 随机抖动 |
| `chunkSize` (PATCH) | `100` | 单次请求最大 block 数 |
| `page_size` (Query) | `100` | 单次查询返回条数 |
| 校验超时 | `6000` ms | Notion token/DB 校验超时 |

### 4.3 对话历史上下文

**源文件**: `src/services/ChatContextBuilder.ts`, `src/services/ChatMemoryStore.ts`, `src/services/chat-history-store.ts`, `src-tauri/src/chat/memory.rs`

| 参数 | 值 | 说明 |
|------|-----|------|
| `RECENT_TURNS_DEFAULT` | `6` | recentWindow 最近轮数（最终折算 12 条） |
| `RECALL_TOP_K_DEFAULT` | `3` | FTS5 召回条数 |
| `RECALL_TIME_WINDOW_DAYS` | `90` | 召回时间窗（仅近 90 天） |
| `MIN_TOKEN_LENGTH` | `2` | 分词最小 token 长度 |
| `MAX_MATCH_TOKENS` | `5` | MATCH 关键词上限 |
| `BUILD_INDEX_BATCH_SIZE` | `500` | buildIndex 重建批大小 |
| `CHAT_MEMORY_INDEX_VERSION` | `"1"` | chat memory 索引版本（SQLite `config`） |
| `listBySession` 默认 limit | `20` | 按 session 查询默认页大小 |

---

## 5. 首次启动向导 & 配置验证

**源文件**: `src/services/FirstRunWizardService.ts`, `src/wizard/components/FirstRunWizard/tokens.ts`

| 参数 | 值 | 说明 |
|------|-----|------|
| `REQUIRED_KEYS` | `["notionToken", "todoDbId", "researchDbId", "deepseekApiKey"]` | 必需的配置键 |
| `CONFIG_VERSION` | `"1.0"` | 配置 schema 版本 |
| `hasValidSecretShape` min length | `16` | 最小 token/key 长度 |
| `maskValue` visibleTail | `4` | 掩码时显示尾部字符数 |
| 向导步骤 | `config → test → done` | 3 步流程 |

---

## 6. 动画播放参数

**源文件**: `src/config/petBehaviorConfig.ts`, `src/components/Pet/AnimationPlayer.ts`

### 6.1 各动画帧时长 (ms)

| 动画 | 帧时长 | 说明 |
|------|--------|------|
| `idleAwakeMs` | `125` | idle.awake 循环 |
| `idleDrowsyEnterMs` | `150` | drowsy 进入段 |
| `idleDrowsyLoopMs` | `760` | drowsy 驻留循环 |
| `idleDrowsyExitMs` | `120` | drowsy 退出段 |
| `idleNappingEnterMs` | `420` | napping 进入段 |
| `idleNappingLoopMs` | `260` | napping 循环 |
| `talkingMs` | `130` | talking 循环 |
| `eatingMs` | `120` | eating 动画 |
| `happyMs` | `110` | happy 动画 |
| `remindingMs` | `110` | reminding 循环 |
| `wakeDayStartMs` | `180` | wake day_start |
| `wakeFromNapMs` | `120` | wake from_nap |
| `farewellMs` | `150` | farewell 动画 |
| `walkRoamingMs` | `170` | walk roaming |
| `walkTargetedMs` | `90` | walk targeted |

### 6.2 播放器引擎参数

| 参数 | 值 | 说明 |
|------|-----|------|
| `MAX_FRAME_ADVANCE_PER_TICK` | `4` | 每 tick 最大前进帧数 |
| `MAX_ALLOWED_START_AHEAD_MS` | `250` | 起始时钟超前容限 (ms) |
| `hungryOverlayEnter` | `220` ms | 饥饿 overlay 进入帧时长 |
| `hungryOverlayLoop` | `190` ms | 饥饿 overlay 循环帧时长 |
| `hungryOverlayExit` | `180` ms | 饥饿 overlay 退出帧时长 |
| `DEFAULT_ASSET_ROOT` | `"assets"` | 精灵图资源根目录 |

### 6.3 眨眼参数

**源文件**: `src/components/Pet/sequences.ts`

| 参数 | 值 | 说明 |
|------|-----|------|
| `blinkFrameDurationMs` | `70` | 眨眼帧时长 |
| `blinkMinIntervalMs` | `3000` | 眨眼最小间隔 |
| `blinkMaxIntervalMs` | `8000` | 眨眼最大间隔 |

---

## 7. CSS 效果参数

**源文件**: `effects.css`, `src/components/Dialog/TalkingInteraction.css`

### 7.1 宠物效果

| 效果 | 参数 | 值 |
|------|------|-----|
| `drowsy-breath` | duration | `3.5s` ease-in-out infinite |
| `drowsy-breath` | peak transform | `translateY(-3px)` |
| `hungry-mask-pulse` | duration | `2.2s` ease-in-out infinite |
| `hungry-aura-pulse` | duration | `2.4s` ease-in-out infinite |
| `hungry-tear` | duration | `1.8s` ease-in-out infinite |
| 饥饿 CSS filter | saturate / brightness / contrast | `0.58 / 0.82 / 0.93` |
| 饥饿 scale | transform | `0.952` |
| 泪滴尺寸 | width × height | `12px × 18px` |
| 泪滴定位 | right / top | `23% / 31%` |

### 7.2 运动层过渡

| 参数 | 值 | 说明 |
|------|-----|------|
| 运动平滑过渡 | `180ms ease` | 所有位移平滑过渡 |

### 7.3 对话 CSS

| 参数 | 值 | 说明 |
|------|-----|------|
| `dialog-animation-ms` | `320` | 对话动画时长 (ms) |
| `dialog-closing-shell-ms` | `220` | closing.shell CSS transition 覆盖 |
| compact shell opacity | `0` | compact/measuring 阶段初始 opacity |
| compact shell transform | `scale(0.72)` | compact 初始缩放 |

---

## 8. 存储 & 数据库参数

**源文件**: `src-tauri/src/notion/mod.rs`, `src-tauri/src/workout/mod.rs`, `src-tauri/src/chat/mod.rs`

### 8.1 数据库文件

| 数据库 | 路径 | 说明 |
|--------|------|------|
| Config | `app_data_dir/app.sqlite` | 键值对配置 (API keys, DB IDs) |
| Workout + Chat | `app_data_dir/workout.sqlite` | 健身记录 + 对话历史 |

### 8.2 对话历史查询

| 参数 | 值 | 说明 |
|------|-----|------|
| `DEFAULT_LIMIT` (list by session) | `20` | 单页默认条数 |
| `MAX_LIMIT` (list) | `200` | 单次查询最大条数 |

### 8.3 健身数据去重

| 策略 | 规则 |
|------|------|
| 去重键 | `UNIQUE(start_time, title)` |
| 索引 | 4 个 (session_id, start_time, title, exercise_title) |

---

## 9. 构建 & 工具链参数

### 9.1 TypeScript

**源文件**: `tsconfig.json`

| 参数 | 值 |
|------|-----|
| `target` | `ES2020` |
| `module` | `ESNext` |
| `moduleResolution` | `bundler` |
| `jsx` | `react-jsx` |
| `strict` | `true` |

### 9.2 Vite

**源文件**: `vite.config.ts`

| 参数 | 值 |
|------|-----|
| 开发服务器端口 | `1420` |
| HMR 端口 | `1421` |
| 严格端口 | `true` |
| 多入口 | `pet: index.html`, `wizard: src/wizard/index.html` |

### 9.3 Rust 关键依赖版本

**源文件**: `src-tauri/Cargo.toml`

| 库 | 版本 |
|---|------|
| `tauri` | `2` |
| `reqwest` | `0.13.2` |
| `rusqlite` | `0.32` |
| `csv` | `1.3` |
| `chrono` | `0.4` |
| `encoding_rs` | `0.8` |
| `jieba-rs` | `0.7` |

### 9.4 Node 关键依赖版本

**源文件**: `package.json`

| 包 | 版本 |
|-----|------|
| `react` | `^19.1.0` |
| `vite` | `^7.0.4` |
| `typescript` | `~5.8.3` |
| `@tauri-apps/api` | `^2` |

---

## 10. 快速索引

| 需求 | 参数文件 |
|------|---------|
| 改状态超时/速度 | `src/config/petBehaviorConfig.ts` |
| 改对话动画时序 | `src/components/Dialog/dialog-tokens.ts` |
| 改对话窗口几何 | `src/components/Dialog/dialog-transition.ts` |
| 改 DeepSeek 调用限制 | `src/services/DeepSeekService.ts` |
| 改 Notion 重试策略 | `src/services/notion-service.ts` |
| 改动效 CSS 时长 | `effects.css`, `src/components/Dialog/TalkingInteraction.css` |
| 改对话上下文窗口 | `src/services/ChatContextBuilder.ts` |
| 改向导验证规则 | `src/services/FirstRunWizardService.ts` |
| 改应用/窗口元数据 | `src-tauri/tauri.conf.json` |
| 改动画帧时长 | `src/config/petBehaviorConfig.ts` |
| 改数据库查询限制 | `src-tauri/src/chat/mod.rs` |

---

## 11. B2-9 (2026-04-29)

- `interface_v1_2.md` 版本升级：`v1.2 -> v1.3`
- `PetEvent` 新增：
  - `{ type: 'dialog.open'; source: DialogOpenSource }`
  - `{ type: 'dialog.close'; reason: DialogCloseReason }`
- `DialogOpenSource = 'shortcut' | 'doubleClick' | 'morningRitual'`
- `DialogCloseReason = 'user' | 'timeout' | 'service_done' | 'error'`
- `user.doubleClick` 降级为通知性事件，状态转换由 `dialog.open` 驱动
- 新增集成模块：
  - `src/integration/dialogRouter.ts`
  - `src/integration/dialogStateBridge.ts`
- DevPanel 新增 B2-9 Force PetEvent 按钮组（4个）
