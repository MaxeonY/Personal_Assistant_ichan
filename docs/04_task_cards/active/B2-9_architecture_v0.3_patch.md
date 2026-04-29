# B2-9 架构稿 v0.2 → v0.3 增量补丁

> **版本**: v0.3 patch - 2026-04-29  
> **作者**: Claude（架构）  
> **触发**: GPT 审核反馈两条（Type A: dialogRouter happy 放行；Type C: DevPanel Force open UI 同步）  
> **形式**: 增量 patch，不重发整稿。配合 v0.2 主稿一并使用。  
> **覆盖范围**: §2.9（K8）/ §2.10（K9）/ §4.4（dialogRouter 接口）/ §7.3（手测项）

---

## Patch 1：§2.9 决策 K8 升级（dialogStateBridge 责任边界）

**原 v0.2 §2.9 内容**：

> ### 2.9 决策 K8（已 approved）：watchTalkingExitForDialogSync 独立模块
>
> ```
> src/integration/dialogStateBridge.ts （新增）
> ```
>
> 职责：订阅 StateMachine，当检测到 `major !== 'talking' && dialogOpen` 时触发 dialog UI 关闭动画但**不派发 dialog.close**（避免与既有打断事件路径重复）。

**v0.3 替换为**：

### 2.9 决策 K8（v0.3 边界明确化）：dialogStateBridge 单向兜底

**模块位置**：`src/integration/dialogStateBridge.ts` （新增）

**核心定位**：**单向兜底，仅处理关闭路径**。bridge 不参与打开路径的 UI 同步。

#### 2.9.1 责任矩阵

| 触发源 | 状态机层动作 | UI 层动作 | bridge 介入？ |
|---|---|---|---|
| 用户双击/快捷键 | 派发 `dialog.open` | 集成层并行触发打开动画 | ❌ 否（fan-out 在物理事件层完成） |
| 用户 Esc / X | 派发 `dialog.close` | 集成层并行触发关闭动画 | ❌ 否（fan-out 在 onClose 回调层完成） |
| 既有打断（feed / reminder.due 等） | 状态机切走 talking，**不派发 dialog.close** | 无既有路径触发 UI 关闭 | ✅ **是**（bridge 检测 `major !== 'talking' && dialogOpen` 触发 UI 关闭） |
| DevPanel Force dialog.open | 派发 `dialog.open` | **UI 不打开**（预期行为） | ❌ 否 |
| DevPanel Force dialog.close | 派发 `dialog.close` | UI 自动关闭 | ✅ **是**（bridge 兜底） |

#### 2.9.2 不做双向同步的理由

bridge 不实现"状态机进入 talking 时反向触发 UI 自动打开"的副作用通道，原因：

1. **保持开关对称性**：与 K5 "UI 关闭动画不应被状态机反向控制"的设计原则保持一致——打开与关闭都"事后通知 / 各管一头"，不引入反向控制通道。
2. **保留 DevPanel 隔离测试价值**：DevPanel Force 的核心用途是"绕过集成层路由直接戳状态机"，如果 bridge 双向同步会让 Force open 自动开 UI，DevPanel 失去诊断价值（变成"主路径的额外触发入口"）。
3. **打开路径有正常 fan-out**：用户视角的打开走"物理事件 → router → dialog.open + 同步触发 UI 打开"两条并行链路，已自洽，不需要 bridge 兜底。

#### 2.9.3 模块接口（v0.3 锁定）

```ts
// src/integration/dialogStateBridge.ts

/**
 * 订阅 StateMachine，单向兜底关闭路径：
 * 当 major !== 'talking' 但 dialog UI 仍开时，触发 UI 关闭动画。
 * 不参与打开路径同步。
 */
export function watchTalkingExitForDialogSync(
  machine: StateMachine,
  isDialogOpen: () => boolean,
  triggerDialogUiClose: () => void,
): () => void; // returns unsubscribe
```

---

## Patch 2：§2.10 决策 K9 改写（DevPanel 语义）

**原 v0.2 §2.10 内容**：

> ### 2.10 决策 K9（新增）：DevPanel Force 按钮的语义
>
> DevPanel 的 `Force dialog.open` / `Force dialog.close` 按钮**只 dispatch 事件，不触发 UI 动画**，用于隔离测试状态机层。
>
> 后果：
> - "Force dialog.close" 时状态机切到 idle.awake，但 dialog UI 仍开
> - 此时 `dialogStateBridge` 会检测到 `major !== 'talking' && dialogOpen` 触发 UI 自动关闭
> - 实质效果是：DevPanel Force = 事件层主动 + bridge 兜底 = 状态机和 UI 最终同步
>
> 这条让 DevPanel 同时具备"纯事件层测试"与"端到端同步验证"两个用途。

**v0.3 替换为**：

### 2.10 决策 K9（v0.3 修订）：DevPanel Force 按钮的语义

DevPanel 的 `Force dialog.open` / `Force dialog.close` 按钮**只 dispatch 事件，不触发 UI 动画**，用于隔离测试状态机层。

#### 2.10.1 行为矩阵

| 按钮 | StateMachine 行为 | dialogStateBridge 行为 | UI 最终状态 | 用途 |
|---|---|---|---|---|
| `Force dialog.open` (当前 idle.awake) | idle.awake → talking | 不介入（K8 单向兜底，不处理打开） | **dialog UI 不打开** | 隔离验证状态机层转换 + AnimationPlayer 切换 |
| `Force dialog.open` (当前 idle.drowsy/napping) | 触发苏醒动画 + pendingDialogOpen 标记，完成后进 talking | 不介入 | **dialog UI 不打开** | 隔离验证苏醒路径 |
| `Force dialog.close` (当前 talking, dialog 开) | talking → idle.awake | 检测到 `major !== 'talking' && dialogOpen`，触发 UI 关闭 | dialog UI 自动关闭 | 验证 bridge 兜底机制 + 端到端关闭 |

#### 2.10.2 设计意图

- **Force open = 纯隔离测试**：观察状态机层独立行为，UI 不打开是**预期行为**，不是 bug。如果开发者需要测试完整打开链路，应使用真实双击 / Ctrl+Alt+T。
- **Force close = 兜底机制验证**：测试 bridge 在"状态机层主动切走 talking"场景下能否正确关闭 UI（这正好覆盖了"既有打断事件不派发 dialog.close"的场景类型）。

两个按钮形成不对称用途：Force open 用于状态机/动画层诊断，Force close 用于集成层 bridge 验证。

---

## Patch 3：§4.4 dialogRouter 接口锁定

**原 v0.2 §4.4 内容**（dialogRouter 部分）：

> ```ts
> // src/integration/dialogRouter.ts （新增）
> /**
>  * 根据当前 PetFullState 判断是否应该派发 dialog.open。
>  * 输入是物理事件（双击 / 快捷键），输出是是否派发意图事件。
>  */
> export function routePhysicalEventToDialogOpen(
>   state: Readonly<PetFullState>,
>   isDialogOpen: () => boolean,
>   source: DialogOpenSource,
> ): { shouldDispatch: boolean; event?: PetEvent };
> ```

**v0.3 替换为**：

```ts
// src/integration/dialogRouter.ts （新增）

/**
 * 根据当前 PetFullState 判断是否应该派发 dialog.open。
 * 输入是物理事件（双击 / 快捷键），输出是是否派发意图事件。
 *
 * === Router 层严格判定（产品意图）===
 * 仅当满足全部条件时返回 shouldDispatch=true：
 *   1. state.lifecycle === 'alive'
 *   2. state.major === 'idle'（任意子态：awake / drowsy / napping）
 *   3. !isDialogOpen()
 *
 * 其他状态（happy / eating / reminding / talking / morningRoutine 等）
 * 一律返回 shouldDispatch=false。
 *
 * === 与 StateMachine 防御层的关系 ===
 * Router 层做严格判定（不放行非 idle 状态），是产品意图层。
 * StateMachine 层做宽容防御（任何非合法状态收到 dialog.open 都 ignore + warning，
 * 不崩溃），是工程稳健性层。
 *
 * 两层职责互补但语义独立——router 不应主动放行非 idle 状态，
 * 即使 StateMachine 层"能容忍"也不行。
 */
export function routePhysicalEventToDialogOpen(
  state: Readonly<PetFullState>,
  isDialogOpen: () => boolean,
  source: DialogOpenSource,
): { shouldDispatch: boolean; event?: PetEvent };
```

---

## Patch 4：§7.3 手测项第 7 条改写

**原 v0.2 §7.3 第 7 条**：

> 7. DevPanel "Force dialog.open" → 状态机切 talking，bridge 反向触发 UI 同步打开（或直接观察事件层）

**v0.3 替换为**：

> 7. DevPanel "Force dialog.open" → 验证状态机切到 talking + AnimationPlayer 切换到 talking.loop。**dialog UI 不会打开**（这是预期行为，DevPanel 用于隔离测试状态机层；如需测试完整打开链路请使用真实双击 / Ctrl+Alt+T）。

---

## v0.3 修订摘要

| 章节 | 修订动作 | 触发原因 |
|---|---|---|
| §2.9 (K8) | 责任边界明确为"单向兜底" + 责任矩阵表 | GPT Type C |
| §2.10 (K9) | 行为矩阵 + 设计意图重写 | GPT Type C |
| §4.4 dialogRouter | 接口注释锁定"严格判定" + 与 StateMachine 防御层职责分离 | GPT Type A |
| §7.3 手测项 7 | 删除"或直接观察事件层"模糊措辞 | GPT Type C |

K1-K9 决策本身不变，仅文档表述与接口注释收紧，消除 GPT 抓到的两处口径不一致。

---

## 9. 版本

- v0.1 - 2026-04-29 - 初稿
- v0.2 - 2026-04-29 - 修正 K6 / 术语清理 / K7-2 升级 / 新增 K9
- v0.3 patch - 2026-04-29 - GPT 审核反馈修订（K8 单向兜底 + K9 行为矩阵 + dialogRouter 严格判定 + §7.3 手测）
