# Phase B 验证策略报告

**版本**：v1.1  
**日期**：2026-04-27  
**文档名**：`docs/phaseb_valstrategyrepo.md`

---

## 1. 文档目的

随着项目进入 **Phase B 业务能力接入阶段**，原先仅依赖网页播放动画链的验证方式，已经不足以覆盖当前系统的真实验证需求。

原因很明确：

- 过去的验证对象主要是 **动画资源 + 播放器链路**
- 现在的验证对象已经变成 **动画 × 状态机 × 业务事件 × 外部服务** 的组合系统

这意味着：

- 不能再只靠“单网页播放链条”完成全部验证
- 也不能等 DeepSeek / Notion / CSV / SQLite 全部真实接入后，才开始验证行为链路

因此，本报告的目标是：

1. 明确后续验证体系为什么必须升级
2. 定义适用于 Phase B 的分层验证方法
3. 给出针对 talking / eating / reminder / hungry 等场景的落地验证策略
4. 为后续业务接入提供统一的验证口径与工装方向

---

## 2. 当前问题的本质

### 2.1 过去的验证模式是什么

在 Phase A 期间，验证的重点是：

- spritesheet 是否正确
- 帧序列是否正确
- 状态切换是否闪烁
- 过渡链路是否符合预期
- roaming / targeted_move / goodbye / wake 等动画行为是否自然

因此，当时使用的验证方式是合理的：

- HTML 验证页
- 单链路验证脚本
- 通过按钮或定时器触发固定状态链

这套方式适合验证：

> **纯表现层 / 纯动画链路**

---

### 2.2 为什么现在不够了

进入 Phase B 之后，越来越多的行为不再是“单纯切状态就能看”的，而是依赖真实输入或业务返回：

- `talking` 依赖 DeepSeek 或后续对话业务返回文本
- `eating` 依赖 CSV 拖拽与 `WorkoutService.importCSV()` 结果
- `reminding` 依赖 Notion timed todo 或提醒调度
- `hungry` 依赖 `lastCsvImportDate` 与饥饿判定逻辑
- 晨间仪式依赖 Notion + Workout + DeepSeek 的联合上下文

这说明后续验证对象已经从“纯动画链”变成：

> **状态触发是否正确 + 表现是否正确 + 业务依赖是否正确**

如果仍然只保留旧验证方式，就会出现两个问题：

1. **很多状态没法测**：因为真实依赖还没接完
2. **问题定位会混在一起**：不知道是动画错、状态机错，还是 API/CSV/Notion 错

---

## 3. 核心结论

Phase B 不应废弃原有网页验证，而应当把验证体系升级为 **三层并行验证结构**。

### 3.1 三层验证结构

#### 第一层：纯表现层验证（Presentation Validation）

用于验证：

- 动画资源
- 帧序列
- 默认节奏
- 切换观感
- overlay 表现
- 气泡位置 / UI 样式 / 遮挡问题

这一层仍然继续使用网页验证页，是原有 Phase A 验证方式的延续。

---

#### 第二层：业务触发 mock 验证（Mocked Interaction Validation）

用于验证：

- 当业务事件发生时，状态机是否按预期切换
- 动画是否正确响应
- UI 是否正确响应
- 不依赖真实外部服务时，链路本身是否闭合

核心原则：

> **先造事件，不等真实服务**

---

#### 第三层：真实集成验证（Real Integration Validation）

用于验证：

- 真实 CSV 是否能解析
- 真实 Notion 是否能读写
- 真实 DeepSeek 是否能正常返回
- 服务层与状态机/UI 的整链是否闭合

这一层是最终验收层，不应该承担最底层动画/状态机问题的发现职责。

---

## 4. 为什么不能只靠真实功能验证

### 4.1 `talking` 不是“必须等 API 才能验证”的状态

当前接口口径下，`talking` 在 Phase A 仍然只有 `loop`，没有 `exit intent`，正常退出机制明确留到 Phase B 接入业务时一并闭合。

这意味着：

- 当前 `talking` 的**表现层**可以独立验证
- 当前 `talking` 的**真实业务闭环**尚未完成

因此 talking 至少应拆成两部分：

1. **表现层验证**
   - 进入 talking 后动画是否正常
   - 气泡是否正常显示
   - 不同文案长度是否影响布局
2. **业务层验证**
   - 文本从哪里来
   - 什么时候退出
   - 退出后回到什么状态

结论：

> `talking` 不能被定义为“必须连上 DeepSeek 才能验证”的状态。

---

### 4.2 `eating` 也不应只依赖真实 CSV

项目定义里，CSV 投喂流程实际包含两层：

1. **状态/表现链**：拖拽触发 → `eating` → `happy` → `idle.awake`
2. **业务结果链**：CSV 解析 → 去重 → 入库 → 产出导入结果

如果只保留“真实拖一个 CSV 看看”的验证方式，那么只要 CSV 解析层没写完，连最基本的 eating 表现链都没法独立确认。

结论：

> `eating` 必须支持 mock 结果注入验证，而不是只允许真实 CSV 整链验证。

---

## 5. 推荐的验证体系重构

## 5.1 保留 `validation/` 目录，但角色升级

原有 `validation/` 目录不应废弃，而应从“单链路动画页”升级为：

# **Scenario Harness（场景驱动验证页）**

含义是：

- 页面不再只负责播放固定动画链
- 页面同时负责**注入事件**与**注入 mock 返回**
- 验证对象从“动画页”升级为“场景验证壳”

后续所有依赖业务的行为验证，都应该优先在这类验证壳中完成第一轮联调。

---

## 5.2 把“真实依赖”拆成“可替身依赖”

这是 Phase B 验证策略的核心。

原则是：

> **状态触发要与外部依赖是否真的存在解耦。**

也就是说：

- 先验证“当某个事件来到时，系统怎么反应”
- 再验证“真实外部世界如何产生这个事件”

---

## 6. 分场景验证策略

---

### 6.1 Talking 场景

#### 目标

验证：

- 进入 `talking` 后动画是否正常
- 气泡显示是否正常
- 文案长度变化是否影响布局
- 被打断时是否符合当前接口表现

#### 第一阶段：Mock 验证

验证页提供如下控制项：

- `Enter Talking (Mock Text A)`
- `Enter Talking (Mock Text B)`
- `Enter Talking (Long Text)`
- `Close Talking / Interrupt Talking`（注：`Close` 为验证工装行为，不代表当前接口已新增 `dialog.close` 事件）

触发方式：

- 不调用真实 DeepSeek
- 直接向 UI 注入 mock 文本
- 同时派发进入 talking 的状态事件

#### 这一阶段验证的不是

- token
- prompt
- 网络
- DeepSeek 输出质量

#### 这一阶段验证的是

- 动画
- 布局
- 状态切换
- 气泡渲染

#### 第二阶段：真实集成验证

待 DeepSeek 接入后，再验证：

- 真实文本到达 Talking 的路径
- talking 的关闭/退出逻辑
- 长文本与异常文本情况

---

### 6.2 Eating / Feed 场景

#### 目标

验证：

- 投喂触发后是否进入 `eating`
- `eating -> happy -> idle.awake` 是否顺畅
- 成功 / 失败 / 空导入 / 重复导入的 UI 反馈是否正确

#### 第一阶段：Mock 验证

验证页提供如下控制项：

- `Feed Success (3 sessions added)`
- `Feed Duplicate (0 added, 5 skipped)`
- `Feed Empty`
- `Feed Parse Fail`

实现方式：

- 不依赖真实 CSV 拖拽
- 不依赖真实解析器
- 直接 mock `ImportResult`
- 或 mock `WorkoutService.importCSV()` 的返回值 / 抛错

#### 第二阶段：真实集成验证

待 CSV 解析与 SQLite 写入完成后，再验证：

- 真实拖拽
- 编码问题
- 去重策略
- 异常 CSV
- 大文件输入

---

### 6.3 Reminder / Targeted Move 场景

#### 目标

验证：

- reminder 触发后是否正确进入 `targeted_move`
- 窗口真实位移与朝向是否正确
- 到达后是否切 `reminding`
- dismiss 后是否回 `idle.awake`

#### 第一阶段：Mock 验证

验证页提供：

- `Trigger Reminder @ front`
- `Trigger Reminder @ left`
- `Trigger Reminder @ right`
- `Force movement.arrive`
- `Dismiss Reminder`

这一层本质上已经非常接近当前系统设计，因为 reminder 本来就是事件驱动型行为。

#### 第二阶段：真实集成验证

待 Notion / Scheduler 接入后，再验证：

- timed todo 查询
- due 事件派发
- 多提醒冲突
- reminder 关闭后的状态恢复

---

### 6.4 Hungry 场景

#### 目标

验证：

- `isHungry=true` 时 overlay 是否出现
- enter / loop / exit 是否正确
- 与 idle / talking / reminding 是否正交叠加

#### 第一阶段：Mock 验证

验证页提供：

- `Set Hungry On`
- `Set Hungry Off`
- `Toggle Hungry`

说明：上述控件统一通过状态机事件入口 `dispatch({ type: 'hungry.set', value })` 驱动。

此阶段只验证 overlay 表现层与叠加逻辑。

#### 第二阶段：真实集成验证

待 CSV 导入日期与饥饿判定逻辑接入后，再验证：

- `lastCsvImportDate`
- 阈值判断
- 自动切换 hungry flag
- 投喂后自动退出 hungry

---

## 7. 推荐新增的两类验证工装

---

### 7.1 Mock Service Demo

这是 Phase B 的本地联调主力工装。

#### 特征

- 不连真实网络
- 不连真实 Notion
- 可不依赖真实 CSV
- 结构与真实服务一致
- 依赖注入 fake implementation

#### 示例

```ts
FakeDeepSeekService.chat() => 100ms 后返回固定文本
FakeWorkoutService.importCSV() => 返回伪造 ImportResult
FakeNotionService.getTodayTimedTodos() => 返回伪造 reminder 列表
```

#### 价值

它可以让你在**不依赖外部世界是否准备好**的前提下，把：

- 服务层
- 状态机
- UI 层
- 动画层

之间的整条链先跑通。

---

### 7.2 Real Integration Demo

这是接入真实业务后的最终验收壳。

#### 特征

- 真 DeepSeek
- 真 Notion
- 真 CSV
- 真 SQLite

#### 它主要负责发现的问题

- token / 认证 / 配置问题
- 网络失败
- API schema 变化
- Notion 字段对不上
- CSV 编码与导入异常
- 真文本长度与 UI 的耦合问题

#### 注意

它不应该承担最底层动画与状态机问题的发现职责。

也就是说：

> **Real Integration Demo 是最终验收层，不是基础行为验证层。**

---

## 8. 推荐的目录/标签拆分方式

建议后续把验证体系明确拆成四类。

### 8.1 `validation/presentation`

只测表现，不测业务。

适合内容：

- awake / drowsy / napping
- wake / goodbye
- hungry enter/loop/exit
- talking loop + bubble layout
- reminding 动画节奏

---

### 8.2 `validation/state-machine`

只测事件驱动，不接真实服务。

适合内容：

- `user.pat`
- `user.feed`
- `reminder.due`
- `user.exit`
- `movement.arrive`
- drowsy soft interrupt
- napping hard interrupt

---

### 8.3 `validation/mock-integration`

接 fake service，不接真实外部依赖。

适合内容：

- mock DeepSeek -> talking
- mock importCSV -> eating/happy
- mock timed todo -> reminder.due
- mock hunger decision -> hungry overlay

---

### 8.4 `validation/real-integration`

接真服务做最终验收。

适合内容：

- 真 CSV 拖拽
- 真 WorkoutService 导入
- 真 Notion timed todo
- 真 DeepSeek 文案
- 真晨间仪式整链

---

## 9. 当前阶段最推荐的做法

对于当前项目状态，最优方案不是废弃旧网页验证，而是：

## **把网页验证升级成“事件注入 + mock 结果注入”的场景验证页。**

建议第一批直接加入如下控制项：

- `Enter Talking (mock text)`
- `Feed Success (mock result)`
- `Feed Fail (mock error)`
- `Set Hungry On/Off`（经 `dispatch({ type: 'hungry.set', value })`）
- `Trigger Reminder`
- `Force movement.arrive`
- `Dismiss Reminder`
- `Pat`
- `Exit`

这样即使：

- DeepSeek 还没完全接上
- CSV 导入还没完全接完
- Notion Service 还没联通

你仍然可以稳定验证：

- 状态机行为
- 动画链路
- overlay 叠加
- 气泡 UI
- movement 闭环
- 打断逻辑

---

## 10. 最终结论

Phase B 的验证工作，不应沿用“只有单网页动画链验证”这一种方式，也不应直接跳到“全部真实集成后再看效果”。

正确的方法是建立一个 **分层验证体系**：

1. **表现层验证**：继续保留网页验证页
2. **Mock 触发验证**：用事件和伪返回验证状态机与 UI
3. **真实集成验证**：最终接真实服务做整链验收

对于当前项目最关键的一句话总结是：

> **把“状态触发如何反应”从“外部依赖是否真的已经实现”中解耦出来。**

这会直接带来两个收益：

- 不会因为某个外部依赖还没接完，导致整个行为系统无法验证
- 后续一旦出问题，能够明确判断到底是动画问题、状态机问题、UI 问题，还是服务接入问题

因此，建议从本轮开始，将验证页正式升级为：

# **Scenario Harness / Mock Integration Harness**

作为 Phase B 期间的主验证入口。

---

## 11. 后续建议（可直接执行）

### P0

- 新建一套场景驱动验证页模板
- 支持事件注入与 mock 结果注入
- 首批覆盖 talking / eating / hungry / reminder 四类场景

### P1

- 建立 fake service 层
- 为 DeepSeek / Workout / Notion 提供最小 mock 实现
- 接入现有状态机与 UI

### P2

- 等真实服务落地后，再补 real integration demo
- 将真实集成问题与基础行为问题彻底分离

---

## 12. 一句话归纳

**Phase A 的验证页是在验证“动画能不能跑”；Phase B 的验证页必须升级成验证“业务事件来了以后，系统会不会正确反应”。**

---

## 13. 从 Phase A 提炼的验证基线

以下基线来自 Phase A 已验证有效的方法，直接作为 Phase B harness 设计输入：

1. 分层定位基线：表现层问题、状态机问题、外部服务问题必须拆层定位，禁止混层诊断。
2. 触发优先基线：先验证事件触发链（输入 -> dispatch -> 状态变更 -> 表现响应），再验证真实依赖。
3. 逐层推进基线：动画验证 -> 状态机验证 -> mock 集成验证 -> 真实集成验证，按层通过后再上下一层。
4. 通用模式复用基线：Phase A 中已证明有效的通用模式（资源管线分层、事件驱动链路验证、软/硬打断分类）可直接复用为 Phase B 场景壳默认模板。
5. 壳层隔离基线：验证壳（demo/unit/harness）故障与内核逻辑故障分开判断，避免把壳层问题误判为架构问题。


## 14. 审计对齐补充（2026-04-27）
- 本文已与 `docs/phaseb_execution_plan.md`、`docs/readme_devpanel.md`、`docs/talking_interaction_schema.md` 对齐。
- 当前推荐验证路径：presentation -> state-machine/mock -> real-integration，避免混层定位。

