# Behavior_Config

> **版本**: v1.3 - 2026-04-28（审计+落地对齐修订）

> 文档定位：本文件为 `src/config/petBehaviorConfig.ts` 的参数说明文档。
> 职责：解释参数分组、参数语义、当前冻结基线、后续调参边界。
> 非职责：不记录阶段复盘、日报、过程性争论。

## 1. 使用前说明

- 当前冻结值以 `src/config/petBehaviorConfig.ts` 为准，本文件用于解释与调参协作。
- 推荐调节范围为工程建议区间，用于 Phase B 隔离问题，不代表接口契约变更。
- 所有调参默认不违背 `interface_v1_2.md` 口径，不新增 public API。

## 2. 参数分组

### 2.1 Idle 节奏参数

| 参数名 | 含义 | 当前冻结值 | 推荐调节范围 | 调参风险提示 |
|---|---|---:|---:|---|
| `stateTimers.idleTimeoutMs` | `idle.awake -> idle.drowsy` 的无交互阈值 | `60000 ms` | `45000 ~ 120000 ms` | 过小会“太快犯困”；过大可能让待机节奏过于僵硬。 |
| `stateTimers.drowsyToNapMs` | `idle.drowsy -> idle.napping` 的停留阈值 | `30000 ms` | `20000 ~ 60000 ms` | 过小会变成“刚困就睡”；过大可能导致 drowsy 驻留拖沓。 |
| `playback.idleAwakeMs` | `idle.awake` 循环帧时长 | `125 ms` | `100 ~ 150 ms` | 过小会显得躁动；过大看起来像掉帧。 |
| `playback.idleDrowsyEnterMs` | `idle.drowsy` 进入段帧时长 | `150 ms` | `130 ~ 190 ms` | 与退出段不匹配时，过渡会显得生硬。 |
| `playback.idleDrowsyLoopMs` | `idle.drowsy` 驻留段节奏 | `760 ms` | `600 ~ 1000 ms` | 过快会“急促”，过慢会“发呆”。 |
| `playback.idleDrowsyExitMs` | `idle.drowsy` 短退出段帧时长 | `120 ms` | `100 ~ 150 ms` | 易破坏“4 源帧 + 目标态首帧自然衔接”的观感。 |

### 2.2 Napping / Wake 参数

| 参数名 | 含义 | 当前冻结值 | 推荐调节范围 | 调参风险提示 |
|---|---|---:|---:|---|
| `playback.idleNappingEnterMs` | `idle.napping` 进入段帧时长 | `420 ms` | `350 ~ 520 ms` | 过快像硬切，过慢像卡停。 |
| `playback.idleNappingLoopMs` | `idle.napping` 呼吸循环帧时长 | `260 ms` | `220 ~ 320 ms` | 过快会“喘促”，过慢会“冻结感”。 |
| `playback.wakeDayStartMs` | `wake.day_start` 帧时长 | `180 ms` | `150 ~ 220 ms` | 过慢会拉长晨间唤醒时延。 |
| `playback.wakeFromNapMs` | `wake.from_nap` 帧时长 | `120 ms` | `100 ~ 150 ms` | 过快会丢失苏醒细节，过慢影响打断响应。 |
| `playback.farewellMs` | `farewell` 告别段帧时长 | `150 ms` | `120 ~ 190 ms` | 过快会情绪不足，过慢会影响退出干净度。 |

### 2.3 Roaming 参数

| 参数名 | 含义 | 当前冻结值 | 推荐调节范围 | 调参风险提示 |
|---|---|---:|---:|---|
| `stateTimers.roamingMinMs` | roaming 单次最短持续时长 | `3000 ms` | `2500 ~ 6000 ms` | 与 `roamingMaxMs` 距离过近会导致节奏单一。 |
| `stateTimers.roamingMaxMs` | roaming 单次最长持续时长 | `6000 ms` | `4500 ~ 10000 ms` | 过大可能造成“长时间巡逻感”。 |
| `windowMovement.roamingSpeedPxPerSec` | roaming 窗口位移速度 | `52 px/s` | `40 ~ 80 px/s` | 过快侵扰感高；过慢会出现“有步态没位移感”。 |
| `windowMovement.edgePaddingPx` | 工作区边界安全留白 | `8 px` | `4 ~ 20 px` | 过小易贴边；过大可用范围变窄。 |
| `playback.walkRoamingMs` | roaming 步态动画帧时长 | `170 ms` | `140 ~ 220 ms` | 若只改步态不改位移，会出现“漂移/空踏不同步”。 |

### 2.4 Targeted Move 参数

| 参数名 | 含义 | 当前冻结值 | 推荐调节范围 | 调参风险提示 |
|---|---|---:|---:|---|
| `windowMovement.targetedSpeedPxPerSec` | targeted_move 窗口位移速度 | `180 px/s` | `140 ~ 260 px/s` | 过快会突兀；过慢会削弱“有目的靠近”。 |
| `windowMovement.targetedArrivalThresholdPx` | 到达判定阈值 | `8 px` | `6 ~ 16 px` | 过小易抖动回摆；过大易提前判定到达。 |
| `windowMovement.targetedDefaultWorkareaX` | 默认目标点横向比例（工作区 0~1） | `0.82` | `0.70 ~ 0.90` | 过右可能遮挡/贴边，过左会偏离前台提醒预期。 |
| `playback.walkTargetedMs` | targeted_move 步态动画帧时长 | `90 ms` | `70 ~ 130 ms` | 与位移速度失配会出现“滑步感”。 |

### 2.5 Playback 参数

| 参数名 | 含义 | 当前冻结值 | 推荐调节范围 | 调参风险提示 |
|---|---|---:|---:|---|
| `playback.talkingMs` | `talking(loop)` 帧时长 | `130 ms` | `110 ~ 170 ms` | 过快会焦躁，过慢会显得“卡嘴”。 |
| `playback.eatingMs` | `eating` 帧时长 | `120 ms` | `100 ~ 160 ms` | 过慢影响事件反馈感。 |
| `playback.happyMs` | `happy` 帧时长 | `110 ms` | `90 ~ 150 ms` | 过快会跳，过慢会钝。 |
| `playback.remindingMs` | `reminding` 帧时长 | `110 ms` | `90 ~ 150 ms` | 过快侵扰，过慢提醒存在感不足。 |

### 2.6 UI / Bubble / Toast 参数

| 参数名 | 含义 | 当前冻结值 | 推荐调节范围 | 调参风险提示 |
|---|---|---:|---:|---|
| `app.clickThroughShortcut` | 穿透切换快捷键 | `Ctrl+Alt+P` | 保持单组合键（必要时换为不冲突组合） | 随意改键位会引入系统冲突与学习成本。 |
| `app.shortcutDebounceMs` | 快捷键去抖窗口 | `180 ms` | `120 ~ 260 ms` | 过小可能重复触发，过大手感发黏。 |
| `app.statusHideMs` | 状态 Toast 自动隐藏时间 | `1800 ms` | `1200 ~ 2600 ms` | 过短读不完，过长会侵扰。 |
| `ui.petDisplayHeightPx` | 宠物显示高度 | `180 px` | `160 ~ 220 px` | 变更会影响命中区域、窗口占比、气泡相对位置。 |

补充说明（Bubble / Dialog）：

- 当前配置中尚未建立 bubble 独立参数组，涉及 bubble 偏移时应优先新增/调整 config 项，不建议散落在 CSS 常量中硬改。
- B1-10 对话 UI 的布局、动画、尺寸参数已在 `src/components/Dialog/dialog-tokens.ts` 中定义，包括：
  - `DIALOG_BOX_WIDTH`（560px）/ `DIALOG_BOX_HEIGHT`（360px）
  - `DIALOG_TRANSITION.openingMs`（320ms）对话打开动画
  - `DIALOG_PET_DISPLAY_HEIGHT`（136px）对话场景宠物显示高度
- 后续若需调参，应优先修改 `dialog-tokens.ts` 并同步回流本文档。

### 2.7 Hungry 判定参数

| 参数名 | 含义 | 当前冻结值 | 推荐调节范围 | 调参风险提示 |
|---|---|---|---|---|
| `hungry.thresholdDays` | 距上次 CSV 投喂多少天后判定为 hungry | `3 天` | `2 ~ 7 天` | 过小会让用户高频被催投喂；过大会让 hungry overlay 几乎不出现，弱化健身追踪激励作用 |
| `hungry.evaluateOnStartup` | 启动时是否执行一次判定 | `true` | 仅 DEV 调试时可置为 `false` | 关闭后 hungry 状态需手动通过 DevPanel 翻转，正式版本必须保持 `true` |

> **注**：现有 `HUNGRY_COPY.enterCooldownMs`（`petCopy.ts`，饥饿提示再次播报的最小间隔，6h）与本卡新增的 `hungry.thresholdDays`（首次进入 hungry 的天数门槛）**语义不同**。前者控制"已经 hungry 后多久可以再弹一次提示"，后者控制"多少天没喂才判定为 hungry"。本卡**不修改** `HUNGRY_COPY` 命名空间。
## 3. 不应再动的硬基线（Phase B 接入期）

以下为架构与契约基线，不作为常规调参对象。

1. SpriteSheet + `background-position` 播放方案。
2. token 化播放器与 `interrupt(token)` 打断路径。
3. `StateMachine -> AnimationPlayer` 单向依赖。
4. hungry 走 overlay/flag，不入 `MajorState`。
5. movement 与动画播放解耦。
6. `targeted_move` 通过 `movement.arrive` 闭环。
7. drowsy 三段式口径（短退出为“4 源帧 + 目标态首帧自然衔接”）。
8. `talking` 当前仅开放 `loop`（正常退出机制不在本阶段通过调参解决）。
9. hungry 翻转必须通过 `dispatch({ type: 'hungry.set', value })`，不存在 `setHungry(...)` 公共方法；自动判定结果写入也走 dispatch 单入口。

## 4. 使用规则

1. 调参优先改 config，不改逻辑。
2. 一轮只调一个维度（或一组强耦合参数）。
3. 默认优先降低侵扰感，而非增加“活跃度”。
4. 动画节奏与窗口位移必须分开调。
5. 本文档只承载长期有效参数知识，不承载日报/复盘。

## 5. 调参回归最小清单（8 项）

1. `idle.awake -> idle.drowsy -> idle.napping` 自动流转是否自然？
2. `napping -> wake.from_nap -> idle.awake` 硬打断恢复是否干净？
3. roaming 下是否“动画与位移同拍”，无原地踏步感？
4. `targeted_move` 是否稳定到达并正确触发 `movement.arrive`？
5. drowsy 软打断是否仍符合“短退出 + 自然衔接”口径？
6. `talking/eating/happy/reminding` 的反馈节奏是否过快/过慢？
7. `Ctrl+Alt+P` 去抖后是否仍稳定可用（不重复触发）？
8. Toast 显示与隐藏时长是否可读且不打扰主工作流？

