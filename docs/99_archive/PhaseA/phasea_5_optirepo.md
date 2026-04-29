# phasea_5_optirepo

**版本**：v1.0  
**日期**：2026-04-22  
**定位**：Phase A 正式完成后的行为调优 / 参数冻结 / 体验收口文档  
**文档名**：`phasea_5_optirepo.md`

---

## 1. 文档目的

本文件用于承接 **Phase A 已完成、i酱已可在真实桌面环境稳定驻留** 之后的下一阶段工作。

这一阶段不再以“功能是否跑通”为核心，而以如下三项目标为核心：

1. **行为手感收口**：让 i酱从“能动”变成“耐看、耐放、耐共处”
2. **参数体系冻结**：把零散写死在代码中的时间、位移、速度、气泡偏移、阈值等抽成统一配置
3. **为 Phase B 降低噪声**：在接入 Notion / DeepSeek / CSV / 晨间仪式之前，先把桌面宠物本体的行为稳定住

换言之，PhaseA.5 不是一个“新功能阶段”，而是一个 **体验工程阶段**。

---

## 2. 通读文档后的阶段判断

基于当前项目文档、资源文档、接口文档、验证文档以及两份开发/修复报告，可以作出如下判断：

### 2.1 已经完成的部分

#### A. 架构与语义层已经闭合
- 三层正交状态机（`lifecycle × major × movement (+ hungry overlay)`）已经定稿
- 播放器与状态机的接口契约已经锁定
- hungry 已从“纯 CSS 假效果”收口为真正的 overlay 动画层
- roaming / targeted_move 已补齐到“动画 + 窗口真实位移”的实现口径

#### B. 验证层已经基本完成
- Stage2 RoundA 全链路已通过
- Stage2 RoundB / RoundC 的主链路已完成，剩余问题以参数、气泡位置、少量节奏瑕疵为主
- 旧的 `backgroundImage URL` 冷切换方案已被放弃，SpriteSheet + background-position 已成为唯一正确方向

#### C. 运行层已经具备真实桌面驻留条件
- 透明窗口大框问题已显著收敛
- 穿透切换已修复为稳定可切换
- 动画卡顿、时钟不一致、原地踏步等关键体验问题已完成修复

### 2.2 尚未彻底冻结的部分

当前仍未冻结的不是“架构正确性”，而是 **行为参数**：

- 多久从 `idle.awake` 进入 `idle.drowsy`
- `idle.drowsy` 驻留多久后进入 `idle.napping`
- roaming 的触发频率、距离、速度、停顿时长
- targeted_move 的速度、到达阈值、边界回退
- goodbye、wake、talking、reminding 等状态的主观节奏
- 对话气泡与提醒气泡的最终位置
- 刚被用户交互后，多久内不应再次触发困倦或漫游

因此，**Phase A 可以判定为“功能闭环完成”，但尚未完成“体验冻结”（阶段初判/历史）；该体验已冻结（当前）**。

---

## 3. PhaseA.5 的阶段定义

## 3.1 阶段名称

**Phase A.5：行为调优与参数冻结阶段**

## 3.2 阶段边界

### 本阶段应做
- 参数抽离
- 节奏校准
- 位移手感收口
- UI 偏移与遮挡修正
- 体验向回归测试
- 配置文件冻结

### 本阶段不应做
- 不新增主状态
- 不新增新交互语义
- 不引入 Phase B 业务逻辑
- 不改动三层状态机的根语义
- 不为“看起来更炫”而推翻当前已通过的播放器/状态机契约

## 3.3 阶段产出物

PhaseA.5 结束时，建议至少交付以下内容：

1. `pet_behavior_config.ts` 或 `pet_behavior_config.json`
2. 一份参数说明文档（可并入本文件后续版本）
3. 一轮行为回归记录
4. 一份 Phase A 冻结结论

---

## 4. 当前基线（作为优化起点）

### 4.1 不应再动的“硬基线”

以下内容建议视为 Phase A 的稳定基线，不再轻易改动：

- **SpriteSheet + background-position** 播放方案
- **token 化播放器** 与 `interrupt(token)` 打断路径
- **StateMachine → AnimationPlayer** 的单向依赖
- **hungry 作为 overlay/flag，而不是独立 MajorState**
- **movement 与动画播放解耦**
- **targeted_move 到达后通过 `movement.arrive` 闭环**
- **drowsy 三段式口径**：进入段 / 驻留段 / 短退出段

### 4.2 本阶段主要优化对象

本阶段重点优化对象可归为五类：

1. **待机节奏**：awake / drowsy / napping 的时间分配
2. **移动手感**：roaming / targeted_move 的位移表现
3. **主观观感**：动画帧时长、停顿、呼吸感、退出感
4. **侵扰控制**：触发冷却、最近交互抑制、提醒前后台切换手感
5. **界面细节**：气泡、状态 toast、边界、窗口包围感

---

## 5. PhaseA.5 的核心判断标准

PhaseA.5 的目标不是“参数看起来合理”，而是让 i酱满足下面这三个判断：

### 5.1 像活物，而不是像循环播放控件
表现为：
- 有停顿
- 有轻重缓急
- 不会每隔很短时间机械重复同一行为
- 不会动不动就困，也不会一直乱跑

### 5.2 挂在桌面上不烦人
表现为：
- 不抢注意力
- 不频繁打断视线
- 不因为 roaming 过于频繁而像悬浮广告
- 不因为 drowsy / napping 过于积极而显得“负面陪伴”

### 5.3 进入 Phase B 后，问题来源可分离
表现为：
- 若 Phase B 出现问题，能明确判断是业务逻辑问题，而不是宠物本体参数问题
- 行为层参数尽量不再随业务接入频繁改动

---

## 6. 优化原则

## 6.1 原则一：保守调参，不重写逻辑

本阶段优先级应是：

**参数 > 偏移 > 配置抽离 > 轻量规则补丁 > 架构改动**

只要不是明显破坏体验的逻辑缺陷，就先不要动状态机语义。

## 6.2 原则二：一轮只调一个维度

建议不要一口气同时改：
- awake 超时
- roaming 速度
- talking 帧时长
- bubble 位置

正确方式是一次只改一类，然后做半天到一天的主观观察。

## 6.3 原则三：优先压低“侵扰感”

桌面宠物长期挂在桌面上的首要风险不是“不够活”，而是“太活了”。

所以 PhaseA.5 应默认采用：
- 更长的静止间隔
- 更低的漫游频率
- 更明显的用户交互后冷却
- 更少的无意义高频动作

## 6.4 原则四：视觉播放节奏和窗口位移必须分开调

`walk.roaming` / `walk.targeted` 的帧动画速度，与窗口坐标位移速度不是一回事。

必须同时看：
- **动画是不是像在走**
- **窗口是不是像在漂/冲**

否则很容易出现：
- 原地空踏
- 被窗口拖着滑行
- 位移到位但动作不对拍

## 6.5 原则五：所有建议值都应以“建议初值”理解

本文件中的具体数值，并非“文档定真值”，而是 **基于现有资源语义、验证结论和桌面驻留目标给出的建议初值/推荐区间**。

最终值以你实际挂桌观察后的手感为准。

---

## 7. 参数系统拆分建议

建议将参数统一拆成 6 组。

### 7.1 Idle 节奏参数组

#### 目标
控制 i酱在“清醒—犯困—小睡”之间的整体生活节奏。

#### 建议抽出的参数

| 参数名 | 含义 | 建议初值 | 建议范围 | 备注 |
|---|---|---:|---:|---|
| `awakeToDrowsyMs` | 从 `idle.awake` 进入 `idle.drowsy` 的无交互时长 | 360000 | 240000 ~ 480000 | 建议先从 6 分钟起步 |
| `drowsyMinHoldMs` | `idle.drowsy` 最短驻留时长 | 45000 | 30000 ~ 60000 | 太短会像刚哈欠完就趴下 |
| `drowsyMaxHoldMs` | `idle.drowsy` 最长驻留时长 | 90000 | 60000 ~ 120000 | 建议做随机区间而非固定值 |
| `recentInteractionNoDrowsyMs` | 用户最近交互后，禁止进入 drowsy 的保护时长 | 120000 | 60000 ~ 180000 | 很关键，能显著减少“刚摸完就困” |
| `blinkMinGapMs` | awake 下两次 blink 的最小间隔 | 7000 | 5000 ~ 9000 | 避免眨眼过密 |
| `blinkMaxGapMs` | awake 下两次 blink 的最大间隔 | 14000 | 10000 ~ 18000 | 建议随机 |

#### 建议判断
- 当前项目文档里 `awake -> drowsy` 的基准语义是“无交互一段时间后进入”，但作为真实桌面挂件，默认 3 分钟会偏积极，建议适度拉长。
- `drowsy` 不应只是 napping 的前奏，而应成为一个 **可被看见、但不过分频繁出现** 的中间状态。

---

### 7.2 Napping 与唤醒参数组

#### 目标
控制“打盹”是否可爱而不拖沓、唤醒是否干净而不突兀。

| 参数名 | 含义 | 建议初值 | 建议范围 | 备注 |
|---|---|---:|---:|---|
| `nappingBreathCycleMs` | `idle.napping` 一轮呼吸循环时长 | 3000 | 2600 ~ 3400 | 资源文档给出的建议区间本就偏温和 |
| `wakeFromNapSpeedScale` | `wake.from_nap` 整体播放倍率 | 1.0 | 0.9 ~ 1.15 | 过快会像弹起，过慢会拖 |
| `napInterruptGuardMs` | 刚进入 napping 后的最短稳定窗口 | 1200 | 800 ~ 1800 | 防止刚趴下就被内部事件扰动 |

#### 建议判断
- `napping` 应明显慢于 `awake` 和 `drowsy`，但不能慢到让人误以为卡住。
- `wake.from_nap` 建议短促、干净、一次呵成，不建议拖成长过渡。

---

### 7.3 Roaming 参数组

#### 目标
控制“泡在桌面上”的感觉，而不是“在桌面上巡逻”。

#### 当前问题来源
项目文档中的 roaming 更偏“具备移动能力”的工程默认值；PhaseA.5 需要把它调整成“低侵扰桌面陪伴值”。

| 参数名 | 含义 | 建议初值 | 建议范围 | 备注 |
|---|---|---:|---:|---|
| `roamingTickMinMs` | roaming 触发最小间隔 | 12000 | 8000 ~ 16000 | 建议明显高于验证期 |
| `roamingTickMaxMs` | roaming 触发最大间隔 | 22000 | 16000 ~ 30000 | 建议随机 |
| `roamingBurstDurationMs` | 单次 roaming 持续时间 | 1400 | 900 ~ 1800 | 过长会像在执行任务 |
| `roamingStepPxPerSec` | roaming 位移速度 | 70 | 50 ~ 110 | 建议慢速漂移 |
| `roamingTravelMinPx` | 单次 roaming 最小位移 | 36 | 24 ~ 60 | 太小会像抖动 |
| `roamingTravelMaxPx` | 单次 roaming 最大位移 | 96 | 72 ~ 140 | 太大易扰人 |
| `recentInteractionNoRoamingMs` | 用户交互后 roaming 冷却 | 10000 | 6000 ~ 15000 | 防止刚互动完就飘走 |
| `workAreaPaddingX` | 工作区左右安全边距 | 28 | 20 ~ 40 | 防止贴边难看 |
| `workAreaPaddingY` | 工作区上下安全边距 | 20 | 16 ~ 32 | 同上 |

#### 建议判断
- Phase A 验证期里 roaming 的任务是“证明能动”；PhaseA.5 的任务是“证明动得自然”。
- 桌面宠物通常更适合 **短距离、低频率、带停顿** 的移动模型。

---

### 7.4 Targeted Move 参数组

#### 目标
控制提醒时“冲到前台”的目的性与可信度。

| 参数名 | 含义 | 建议初值 | 建议范围 | 备注 |
|---|---|---:|---:|---|
| `targetedMovePxPerSec` | targeted_move 位移速度 | 520 | 420 ~ 720 | 应明显快于 roaming |
| `targetedArriveThresholdPx` | 到达阈值 | 16 | 12 ~ 24 | 防止来回抖动 |
| `targetedMaxDurationMs` | 单次 targeted_move 最大时长 | 2200 | 1600 ~ 2800 | 超时应兜底 |
| `targetedFrontOffsetX` | 提醒目标点的水平偏移 | 0 | -40 ~ 40 | 用于修正“弹道偏右” |
| `targetedFrontOffsetY` | 提醒目标点的垂直偏移 | -12 | -24 ~ 0 | 让提醒更贴近可视中心 |
| `postArriveStillHoldMs` | 到达后切 reminding 前的极短稳定停顿 | 80 | 0 ~ 150 | 可选，防止生硬断切 |

#### 建议判断
- targeted_move 的核心不是“更快”，而是“明确有目的”。
- 它应当让人感觉到 **收到任务后快速靠近你**，而不是“速度更高的 roaming”。

---

### 7.5 主动画播放参数组

#### 目标
统一所有状态的主观节奏，解决“慢、拖、卡、过急”这四类问题。

建议以 **倍率** 优先，而不是到处散改 frame_ms 常量。

| 参数名 | 含义 | 建议初值 | 建议范围 | 备注 |
|---|---|---:|---:|---|
| `awakePlaybackScale` | awake 播放倍率 | 1.0 | 0.95 ~ 1.1 | 只微调 |
| `drowsyEnterScale` | drowsy 进入段倍率 | 1.0 | 0.9 ~ 1.1 | 太快会不自然 |
| `talkingPlaybackScale` | talking 循环倍率 | 1.0 | 0.9 ~ 1.15 | 受文本气泡观感影响大 |
| `remindingPlaybackScale` | reminding 循环倍率 | 1.0 | 0.95 ~ 1.1 | 不宜太快，容易焦躁 |
| `farewellPlaybackScale` | goodbye 整体倍率 | 0.95 | 0.9 ~ 1.05 | 略慢往往更有情绪 |
| `hungryOverlayScale` | hungry overlay 循环倍率 | 1.0 | 0.95 ~ 1.1 | 不宜抢镜 |

#### 专项建议

##### goodbye
资源文档中 goodbye 采用 `start -> wave*4 -> fade -> end` 的一次性方案。建议额外抽出：

| 参数名 | 建议初值 | 说明 |
|---|---:|---|
| `farewellFadeHoldMs` | 160 | `goodbye_fade_01` 的停顿 |
| `farewellEndHoldMs` | 280 | `goodbye_end_01` 的停顿 |

这样更容易修复“退出帧稍显卡顿 / 时长略短”的主观问题，而不必改资源顺序。

##### talking
由于 `talking` 当前在 Phase A 仍是纯 loop，建议只做节奏微调，不处理语义收口。真正的 `dialog.close / talking.finish` 应继续放在 Phase B。

---

### 7.6 UI 与提示层参数组

#### 目标
消除“被遮挡、偏位、边界感、提示抢眼”这几类问题。

| 参数名 | 含义 | 建议初值 | 建议范围 | 备注 |
|---|---|---:|---:|---|
| `talkBubbleOffsetX` | talking 气泡水平偏移 | 18 | 8 ~ 32 | 修 RbC2 |
| `talkBubbleOffsetY` | talking 气泡垂直偏移 | -30 | -48 ~ -18 | 建议位于头顶右上 |
| `remindingBubbleOffsetX` | reminding 气泡水平偏移 | 22 | 12 ~ 40 | 修 RbC3 |
| `remindingBubbleOffsetY` | reminding 气泡垂直偏移 | -38 | -56 ~ -20 | 需避开角色主体 |
| `statusToastDurationMs` | 状态 toast 存续时长 | 1200 | 800 ~ 1600 | 过长会破坏桌面隐身感 |
| `toastOpacity` | toast 透明度 | 0.88 | 0.75 ~ 0.95 | 轻提示即可 |

#### 建议判断
- 这类参数不要长期散落在 CSS 常量里，最好和行为参数同处一个 config。
- talking / reminding 的气泡都应做 **viewport clamp**，而不是只靠固定偏移。

---

## 8. 优先级建议（实施顺序）

### P0：必须先做

1. **统一参数出口**
   - 把时间、位移、偏移、阈值统一抽到一份配置中
2. **Idle 节奏收口**
   - 先调 `awake -> drowsy -> napping`，这是长期挂桌的核心
3. **Roaming 侵扰度收口**
   - 先把 roaming 调到“不烦人”
4. **Targeted_move 手感收口**
   - 保证提醒时移动像“主动靠近”而不是“突然位移”

### P1：建议随后完成

1. talking / reminding 气泡位置修正
2. goodbye 停顿与退出观感收口
3. wake/day_start 与 wake/from_nap 的速度微调
4. hungry overlay 的存在感压低到“不抢主状态”

### P2：可延后，但建议留记录

1. 不同屏幕分辨率 / 缩放比例下的位移手感差异
2. 多显示器工作区边界表现
3. 穿透状态下的主观交互感
4. 不同负载下的掉帧感受

---

## 9. 建议的配置文件结构

建议新建：`src/config/petBehaviorConfig.ts`

```ts
export const petBehaviorConfig = {
  idle: {
    awakeToDrowsyMs: 360000,
    drowsyMinHoldMs: 45000,
    drowsyMaxHoldMs: 90000,
    recentInteractionNoDrowsyMs: 120000,
    blinkMinGapMs: 7000,
    blinkMaxGapMs: 14000,
  },
  napping: {
    breathCycleMs: 3000,
    wakeFromNapSpeedScale: 1.0,
    napInterruptGuardMs: 1200,
  },
  roaming: {
    tickMinMs: 12000,
    tickMaxMs: 22000,
    burstDurationMs: 1400,
    stepPxPerSec: 70,
    travelMinPx: 36,
    travelMaxPx: 96,
    recentInteractionNoRoamingMs: 10000,
    workAreaPaddingX: 28,
    workAreaPaddingY: 20,
  },
  targetedMove: {
    pxPerSec: 520,
    arriveThresholdPx: 16,
    maxDurationMs: 2200,
    frontOffsetX: 0,
    frontOffsetY: -12,
    postArriveStillHoldMs: 80,
  },
  playback: {
    awakeScale: 1.0,
    drowsyEnterScale: 1.0,
    talkingScale: 1.0,
    remindingScale: 1.0,
    farewellScale: 0.95,
    hungryOverlayScale: 1.0,
    farewellFadeHoldMs: 160,
    farewellEndHoldMs: 280,
  },
  ui: {
    talkBubbleOffsetX: 18,
    talkBubbleOffsetY: -30,
    remindingBubbleOffsetX: 22,
    remindingBubbleOffsetY: -38,
    statusToastDurationMs: 1200,
    toastOpacity: 0.88,
  },
} as const;
```

如果后续需要做本地调参面板，这一层可以再被 UI 消费；但在 PhaseA.5，先抽成静态配置即可。

---

## 10. 建议的执行流程

### 第 1 步：参数抽离

目标：不改行为，只改参数承载方式。

验收标准：
- 所有核心时序与位移阈值不再散落在 `App.tsx / StateMachine.ts / sequences.ts / CSS` 多处硬编码
- 能只改 config 而不改逻辑代码

### 第 2 步：调 Idle 节奏

目标：解决“过早犯困 / 过快入睡 / 缺少被互动后的清醒保护”。

建议观察指标：
- 连续办公 1 小时内，drowsy 出现频率是否让人感觉自然
- 刚摸头、刚拖动、刚点过之后，是否还会很快困下去

### 第 3 步：调 Roaming

目标：从“会动”变成“轻轻地活着”。

建议观察指标：
- 是否会频繁吸走余光
- 是否经常贴边、卡边、突然反向
- 是否有“在桌面上巡逻”的感觉

### 第 4 步：调 Targeted Move

目标：提醒动作像“主动靠近”而不是“位移脚本”。

建议观察指标：
- 左右朝向是否总与运动方向一致
- 到达是否稳定
- 到达后切 reminding 是否生硬

### 第 5 步：收口 UI 细节

目标：修 talking / reminding 气泡、toast 提示和 goodbye 退出观感。

### 第 6 步：做一轮冻结回归

建议最少回归以下 8 项：

1. `idle.awake -> idle.drowsy -> idle.napping`
2. `napping -> wake.from_nap -> idle.awake`
3. `idle.awake + roaming`
4. `idle.awake + roaming -> reminding + targeted_move`
5. `targeted_move -> movement.arrive -> reminding`
6. `idle.awake -> talking`
7. `idle.awake -> goodbye`
8. hungry enter / loop / exit

---

## 11. 回归与验收建议

## 11.1 主观验收口径

PhaseA.5 完成后，建议你按真实使用角度判断以下问题：

- 这玩意儿能不能在我桌面上挂一下午，而不让我烦
- 它困不困、飘不飘、提醒不提醒，节奏像不像一个小东西，而不是状态机 demo
- 我会不会在 30 分钟内就想把 roaming 关掉
- goodbye、wake、talking 这些动作是否已经像“产品行为”，而不只是“资源播放”

## 11.2 技术验收口径

建议至少满足：

- 30 次以上状态切换无 stuck frame
- 20 次 targeted_move 无明显 overshoot / 原地抖动 / 到达失败
- 长时间挂桌无明显时钟漂移导致的卡顿回归
- 穿透切换后不破坏拖拽与交互恢复

---

## 12. TODO（当前不在 PhaseA.5 闭合范围内）

### TODO 1：talking 正常退出机制

当前 `talking` 在接口层仍只有 `loop`，没有 `exit intent`，也没有 `dialog.close / talking.finish` 事件。

这不是 PhaseA.5 的参数问题，而是 **Phase B 的接口闭合问题**。

建议维持现状：
- PhaseA.5 只调 talking 的节奏与气泡位置
- talking 的语义收口继续放到 Phase B 接入对话能力时处理

### TODO 2：`idle.drowsy exit` 文案口径继续统一

历史文档中曾残留“4 帧 / 5 帧”的表述差异。

建议在下一轮文档同步时统一成：
- **实现口径**：4 个源状态帧 + 下一目标态首帧自然衔接
- 若某处继续写“5 帧”，应显式说明第 5 帧是目标态首帧，而不是 drowsy 自有资源帧

### TODO 3：多显示器 / 高 DPI / 非 100% 缩放环境

当前文档体系已明确单显示器工作区边界语义，但 PhaseA.5 如要更稳，还应在真实设备上观察：
- 多显示器边界
- Windows 缩放比
- 任务栏位置变化

这项可记录，不强求在本阶段彻底闭合。

---

## 13. PhaseA.5 结束条件

当以下条件同时满足时，可以认为 PhaseA.5 完成：

1. 参数已统一抽离成单一配置源
2. awake / drowsy / napping 节奏已稳定，不再频繁返工
  - 备注：经过后续方案验证，节奏稳定
3. roaming / targeted_move 手感已稳定，不再被主观抱怨“乱跑 / 原地踏步 / 方向不对”
  - 备注：经过后续验证，手感很不错
  - 经参数调整，观感已自然
4. talking / reminding 气泡位置已收口
  - 备注：气泡对话需要与PhaseB阶段UI设计一起处理
5. goodbye / wake 等少数过渡状态的观感已无明显瑕疵
  - 备注：过渡自然
6. 代码层面对 Phase B 的接入已具备稳定基线

满足以上条件后，建议正式宣布：

> **Phase A 完成冻结，项目进入 Phase B 业务能力接入阶段。**

---

## 14. 结论

当前项目已经跨过“验证样机”阶段，进入“真实桌面驻留体”阶段。  
因此，接下来的关键问题不再是 **能不能播放、能不能切状态、能不能移动**，而是：

- 节奏对不对
- 侵扰感高不高
- 桌面陪伴感是否成立
- Phase B 接入前，是否已经具备足够稳定的宠物本体基线

所以，PhaseA.5 的本质不是小修小补，而是一次 **产品层面的体验冻结**。

在这个阶段做得越扎实，Phase B 接入 Notion / DeepSeek / CSV / 晨间仪式时，后续迭代就越不会陷入“业务问题和宠物行为问题混在一起”的混乱。


---
 落地补录（2026-04-22）

本节用于补录本轮已完成改动，保持 PhaseA.5 主线边界不变：
- 不调整 PhaseA.5 参数建议
- 不改 AnimationPlayer 内部实现
- 不启动 Phase B 真实业务接入
- 不新增 `interface_v1_2` 之外的新接口事件（本轮仅消费既有 `hungry.set`）

### 15.1 本轮改动范围（代码与文档）

新增文件：
- src/components/DevPanel/DevPanel.tsx
- src/components/DevPanel/dev-panel.css
- docs/readme_devpanel.md

修改文件：
- src/App.tsx
- src-tauri/capabilities/default.json

说明：DevPanel 仅在 DEV 运行时挂载，生产构建不暴露该能力。

### 15.2 DevPanel 能力落地（四组）

#### A. 状态强制（State Force）
- Force idle.drowsy：派发 idle.timeout
- Force idle.napping：先确保进入 drowsy，再触发 timer.drowsyToNap
- Force wake.from_nap path：先确保进入 napping，再走既有事件链触发唤醒路径
- Roaming Pulse：派发 timer.roaming.tick
- Reset idle.awake：复用现有 machine.start 复位链路

#### B. 事件注入（Event Inject）
- user.pat
- user.feed（注入最小 dummy CSV 文件）
- reminder.due（复用现有目标点推导）
- user.exit
- movement.arrive（自动读取当前 movement.requestId，无 request 时禁用或提示）

#### C. Flag / Overlay
- Toggle isHungry：统一通过 `dispatch({ type: 'hungry.set', value })` 入口
- Toggle click-through：复用 App.tsx 既有 setClickThrough 入口

#### D. 实时只读状态
- PetFullState
- Playback（currentAnimationToken / queuedEventCount）
- Movement（含 requestId）
- Timers（DEV timer backend 镜像 + remainingMs）

### 15.3 App.tsx 关键依赖稳定性修复

根因方向：DevPanel 高频重渲染下，关键引用漂移会放大主链路回调重建风险，进而影响动画初始化与事件生效稳定性。

修复动作：
1. 固定窗口对象引用
- 从渲染期直接调用 getCurrentWindow 改为 appWindowRef 单例持有，保证窗口引用稳定。

2. 复核并收敛依赖数组
- queueWindowPosition：空依赖
- refreshWindowMovementBounds：依赖 queueWindowPosition
- handlePlayerReady：依赖 syncWindowMovementFromState
- close handler effect：依赖 dispatch

3. 稳定性结论
- handlePlayerReady 不再被 DevPanel 刷新牵引重建
- PetCanvas onReady 链路稳定，不再出现重复初始化风险
- DevPanel 显隐不再影响主动画循环

### 15.4 单窗口“小改动优先”方案（遮挡优化）

按小改动优先执行单窗口方案，不新增 Tauri 子窗口。

实现要点：
- DevPanel 固定右侧停靠（dev-panel-host 右对齐）
- 面板打开时主容器增加右侧留白（paddingRight = dockWidth + gap）
- 同步扩窗：打开面板扩大窗口宽度，关闭恢复基础宽度
- 常量：
  - DEV_PANEL_DOCK_WIDTH_PX = 360
  - DEV_PANEL_DOCK_GAP_PX = 16
- resize 失败提示：DevPanel dock resize failed

权限补充：
- src-tauri/capabilities/default.json 新增 core:window:allow-set-size，用于 appWindow.setSize

### 15.5 快捷键与生命周期约束

- Ctrl+Alt+P：仅 click-through
- Ctrl+Alt+D：仅 DevPanel 显隐
- 两者解耦，共用同一套 shortcut 生命周期（register/unregisterAll、debounce、disposed 保护）

### 15.6 本轮验收结论

- DEV 可正常打开和关闭 DevPanel
- 面板按钮事件可达状态机（不绕过既有入口）
- 打开 DevPanel 后主动画不再复现“整体卡死”
- 面板遮挡通过“右停靠 + 留白 + 扩窗”得到缓解
- Ctrl+Alt+P 保持可用，未与 Ctrl+Alt+D 冲突

### 15.7 已知边界与妥协

- 本轮未引入双窗口架构（按小改动优先）
- timer 展示采用 DEV backend 镜像，未新增 StateMachine public debug API
- wake.from_nap 按合法事件链路验证，不直调 AnimationPlayer 内部播放


