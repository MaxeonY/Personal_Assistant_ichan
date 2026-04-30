# B2-9 架构设计稿（talking 正常退出机制闭合）

> **版本**: v0.2 - 2026-04-29  
> **作者**: Claude（架构）  
> **状态**: 草案，待 DeepSeek 细化 → GPT 审核 → Codex 落地  
> **任务**: B2-9（任务 9），Batch 2 第二棒  
> **依赖**: B1-4 DeepSeekService ✅、B1-10 对话 UI ✅、B1-10A anchor 过渡 ✅、B0-11 chat_messages ✅  
> **本稿目的**: 锁定架构方向与边界，特别是 PetEvent 公共契约升级；不锁实现细节

> **v0.1 → v0.2 修订摘要**：
> - 修正 K6：`user.doubleClick` 与 `dialog.open` 是因果关系而非替换关系，事件类型完整保留
> - 修正术语：`dialog.close` 不属于"打断"，归类为 talking 正常退出事件；既有 feed/reminder 才是打断
> - 升级 K7-2：drowsy/napping 收到 dialog.open **不再防御式忽略**，复用既有 drowsy_exit / wake.from_nap 素材实现串行苏醒后进 talking
> - K8 确认：独立模块 `dialogStateBridge.ts`

---

## 1. 任务定位与边界

### 1.1 范围（本卡做什么）

- **升级 `interface_v1_2.md` 公共契约**：`dialog.open` / `dialog.close` 从 §2.0 候选提案区正式纳入 §4.2 `PetEvent`。
- **StateMachine 实现**：新增 `dialog.open` / `dialog.close` 转换规则，覆盖 `idle.awake` / `idle.drowsy` / `idle.napping` 三种入口。
- **集成层路由**：`user.doubleClick` / `Ctrl+Alt+T` 物理事件 → 集成层判断 → 派发 `dialog.open`。
- **B1-10 关闭路径升级**：Esc / X / onClose 在执行 UI 关闭动画的**同时**派发 `dialog.close`。
- **drowsy/napping 苏醒接线**：复用既有 `drowsy_exit` / `wake.from_nap` 素材，串行播放后进 talking，再启动 dialog UI 打开动画。
- **MovementState 联动**：talking 期间锁定 `still`。
- **DevPanel 接线**：新增 `Force dialog.open` / `Force dialog.close` 按钮组。

### 1.2 非范围（本卡不做什么）

- ❌ **不开放 talking exit intent**（K2）：interface_v1_2 §3.4 维持 `talking | loop`。
- ❌ **不实现 inactivity timeout**（K3）：`'timeout'` 枚举值类型保留但无路径派发。
- ❌ **不实现 doneHint 链路**（K4）：`'service_done'` 枚举值类型保留但无路径派发；`DeepSeekService.chat()` 维持现 `string` 返回。
- ❌ **不修改 MajorState** 五态。
- ❌ **不修改 chat_messages / ChatHistoryStore / ChatMemoryStore / DeepSeekService**。
- ❌ **不修改 dialog 关闭动画时序**（B1-10A phase 状态机不动）。
- ❌ **不引入新 spritesheet**（drowsy/napping 苏醒复用既有素材）。
- ❌ **不实现 `morningRitual.complete`**（候选提案保留，归 B3-5）。

### 1.3 与上游任务的关系

| 上游 | 关系 | 影响 |
|---|---|---|
| B1-4 | 不变 | `chat()` 返回 `string` 不动 |
| B1-10 | 升级开关路径 | Esc/X/onClose 改为"派发事件 + UI 关闭"双轨；双击/快捷键改为"物理事件 + 路由派发 dialog.open" |
| B1-10A | 不变 | 关闭动画 phase 状态机不动 |
| B2-13 | 不变 | sessionId 透传链路保持 |

---

## 2. 架构关键决策

### 2.1 决策 K1：dialog.open / dialog.close 同时纳入正式契约（已 approved）

```ts
export type PetEvent =
  // ...既有事件全部保留不变...
  
  // Phase B 新增（B2-9）
  | { type: 'dialog.open'; source: DialogOpenSource }
  | { type: 'dialog.close'; reason: DialogCloseReason };

export type DialogOpenSource = 'shortcut' | 'doubleClick' | 'morningRitual';
export type DialogCloseReason = 'user' | 'timeout' | 'service_done' | 'error';
```

- `'timeout'` / `'service_done'` 类型保留但本卡无路径派发
- §2.0 候选提案区 `dialog.open` / `dialog.close` 改标"已落地（B2-9）"
- §2.0 中 `morningRitual.complete` 保留为候选提案

### 2.2 决策 K2：talking 退出不开放 exit intent（已 approved）

interface_v1_2 §3.4 维持现状。视觉过渡完全依赖 dialog 关闭动画的 416ms 掩盖 talking → idle.awake 的状态切换，不需要 talking exit spritesheet。

### 2.3 决策 K3：inactivity timeout 不实现（已 approved）

`'timeout'` 枚举类型保留，无运行时路径派发。

### 2.4 决策 K4：doneHint 链路不实现（已 approved）

`'service_done'` 枚举类型保留，无运行时路径派发。`DeepSeekService.chat()` 维持现状。

### 2.5 决策 K5：dialog.close 双轨派发（已 approved）

UI 关闭动画与状态机派发**并行**，互不等待。`dialog.close` 是事后通知。

```
用户按 Esc / X / onClose
    │
    ├── (并行) StateMachine.dispatch({ type: 'dialog.close', reason: 'user' })
    │       └── talking → idle.awake（瞬时）
    │
    └── (并行) UI 关闭动画启动（416ms）
```

### 2.6 决策 K6（v0.2 修正）：user.doubleClick 与 dialog.open 是因果关系

**v0.1 误解修正**：`user.doubleClick` 与 `dialog.open` 不在同一语义层：

- `user.doubleClick` = 输入层事件（"用户做了双击这个物理动作"）
- `dialog.open` = 视图层意图（"请打开对话视图"）

它们的关系是**因果**而非**替换**：

```
[用户双击宠物]
    │
    ▼
[App.tsx 物理事件捕获]
    │
    ├── (并行) StateMachine.dispatch({ type: 'user.doubleClick' })
    │       └── 状态机收到通知性事件，不直接做状态转换（见 K7）
    │
    └── (并行) [集成层路由]
            判断当前状态是否允许打开 dialog
            │
            ├── major === 'idle' (任意子态) && !dialogOpen → dispatch({ type: 'dialog.open', source: 'doubleClick' })
            ├── dialog 已开 → 忽略
            └── major !== 'idle' → 忽略（被打断状态期间不响应双击）
```

**关键约束**：
- `user.doubleClick` 事件**完整保留并继续派发**，不删除
- StateMachine 中 `case 'user.doubleClick'` 分支保留，但**改为通知性处理**：不再触发 idle.awake → talking 转换，仅作为输入层事实陈述
- `idle.awake → talking` 的状态转换**只由 `dialog.open` 触发**

**为什么把 user.doubleClick 拆出来不做状态转换**：
- 单一职责：状态转换由意图事件（dialog.open）触发，物理事件（user.doubleClick）只做事实通知
- 未来扩展性：若后续需要"双击触发非 dialog 行为"（如双击切换某种模式），事件保留可直接接入
- 与 user.pat 形成对称：user.pat 也是物理事件 + 集成层路由（见 §4.4.2 摸头反应表）

### 2.7 决策 K7（v0.2 修正）：StateMachine 转换规则

#### 2.7.1 术语正本清源

**v0.1 表述失误修正**：本卡引入的 `dialog.close` **不属于"打断"**。术语口径：

| 术语 | 含义 | 涉及事件 |
|---|---|---|
| **正常退出** | talking 自然终结，对话本身完成或用户主动关闭 | `dialog.close` |
| **打断（既有）** | 高优先级事件强制中断 talking | `user.feed` / `reminder.due` / `hungry.set` 等 |

打断走既有路径，**与 dialog.close 解耦**——打断时不派发 dialog.close（见 §2.8）。

#### 2.7.2 dialog.open 转换矩阵

| 当前状态 | dialog.open 处理 |
|---|---|
| `idle.awake` | 直接转 `talking`，AnimationPlayer 切换到 `talking.loop`，dialog UI 立即打开 |
| `idle.drowsy` | 串行苏醒：先播 `drowsy_exit`（4 源帧 + 目标态首帧），完成后转 `talking`，**再**启动 dialog UI 打开动画 |
| `idle.napping` | 串行苏醒：先播 `wake.from_nap`（7 帧 oneshot），完成后转 `talking`，**再**启动 dialog UI 打开动画 |
| `talking` | 忽略（重复打开请求） |
| `eating` / `happy` / `reminding` | 忽略（被打断状态不响应；集成层先 gate） |

#### 2.7.3 dialog.close 转换矩阵

| 当前状态 | dialog.close 处理 |
|---|---|
| `talking` | 转 `idle.awake`（movement 保持 still 直到 dialog 关闭动画完成后由现有 timer.roaming.tick 自然恢复） |
| 其他所有状态 | 防御式忽略（不应发生；若发生说明集成层有 bug，记 warning log） |

#### 2.7.4 movement.state 联动

- `dialog.open` 进入 talking 时：如果当前 `movement.state === 'roaming'`，强制切到 `still`（派发 `timer.roaming.tick` 让状态机内部判定停下）
- `dialog.close` 退出 talking 时：不主动恢复 movement，由既有 `timer.roaming.tick` 周期性触发自然恢复

#### 2.7.5 flags.isHungry

dialog.open / dialog.close 不影响 `flags.isHungry`。

### 2.8 决策 K7-2（v0.2 升级）：drowsy/napping 苏醒接线

**v0.1 缺口修正**：v0.1 写的"drowsy/napping 收到 dialog.open 防御式忽略"是产品体感的 bug——用户已表达"想交互"的意愿，忽略 = 无响应 = 失败体感。

**采纳方案 A（串行苏醒，已 approved）**：

#### 2.8.1 drowsy 路径

```
[用户双击 / Ctrl+Alt+T，当前 idle.drowsy]
    │
    ├── 集成层派发 dialog.open
    │
    ▼
[StateMachine: idle.drowsy + dialog.open]
    │
    ├── 立即记录 pendingDialogOpen = true
    │   （内部标记，不进 PetFullState）
    │
    ├── AnimationPlayer 切换到 idle.drowsy + intent='exit'
    │   └── 播放 4 源帧 + 目标态首帧自然衔接（既有素材，~320ms）
    │
    ▼
[drowsy_exit 播放完成]
    │
    ├── StateMachine: idle.drowsy → talking
    │   AnimationPlayer 切换到 talking.loop
    │
    ├── 触发集成层 onTalkingEntered 回调（pendingDialogOpen 被消费）
    │
    └── 集成层启动 dialog UI 打开动画（B1-10A 既有路径，320ms）
```

总等待 ~640ms（drowsy_exit 320ms 串行 + dialog opening 320ms）。

#### 2.8.2 napping 路径

```
[用户双击 / Ctrl+Alt+T，当前 idle.napping]
    │
    ├── 集成层派发 dialog.open
    │
    ▼
[StateMachine: idle.napping + dialog.open]
    │
    ├── 立即记录 pendingDialogOpen = true
    │
    ├── AnimationPlayer 切换到 wake.from_nap + intent='oneshot'
    │   └── 播放 7 帧（既有素材，~560ms）
    │
    ▼
[wake.from_nap 播放完成]
    │
    ├── StateMachine: idle.napping → talking
    │   AnimationPlayer 切换到 talking.loop
    │
    ├── 触发 onTalkingEntered 回调
    │
    └── 集成层启动 dialog UI 打开动画
```

总等待 ~880ms（wake.from_nap 560ms 串行 + dialog opening 320ms）。

#### 2.8.3 苏醒中断处理

苏醒动画播放期间（drowsy_exit 或 wake.from_nap）若收到：

- 第二次 `dialog.open` → 忽略（已在苏醒中）
- `dialog.close` → 防御式忽略（pendingDialogOpen 路径中不应收到 close，因为 dialog UI 还没开）
- 既有打断事件（feed / reminder.due 等）→ 走既有打断路径，pendingDialogOpen 被丢弃，不进 talking 也不开 dialog

### 2.9 决策 K8（已 approved）：watchTalkingExitForDialogSync 独立模块

```
src/integration/dialogStateBridge.ts （新增）
```

职责：订阅 StateMachine，当检测到 `major !== 'talking' && dialogOpen` 时触发 dialog UI 关闭动画但**不派发 dialog.close**（避免与既有打断事件路径重复）。

### 2.10 决策 K9（新增）：DevPanel Force 按钮的语义

DevPanel 的 `Force dialog.open` / `Force dialog.close` 按钮**只 dispatch 事件，不触发 UI 动画**，用于隔离测试状态机层。

后果：
- "Force dialog.close" 时状态机切到 idle.awake，但 dialog UI 仍开
- 此时 `dialogStateBridge` 会检测到 `major !== 'talking' && dialogOpen` 触发 UI 自动关闭
- 实质效果是：DevPanel Force = 事件层主动 + bridge 兜底 = 状态机和 UI 最终同步

这条让 DevPanel 同时具备"纯事件层测试"与"端到端同步验证"两个用途。

---

## 3. 数据流图

### 3.1 双击打开流（idle.awake 入口）

```
[用户双击宠物]
    │
    ▼
[App.tsx 双击捕获]
    │
    ├── (并行 1) StateMachine.dispatch({ type: 'user.doubleClick' })
    │       └── 状态机记录通知性事件，不转换状态
    │
    └── (并行 2) [集成层路由 dialogRouter]
            judge: major === 'idle.awake' && !dialogOpen
            │
            └── StateMachine.dispatch({ type: 'dialog.open', source: 'doubleClick' })
                  │
                  ├── idle.awake → talking
                  ├── movement: roaming → still (如适用)
                  ├── AnimationPlayer: talking.loop
                  │
                  └── 触发 onTalkingEntered 回调
                        │
                        └── 集成层启动 B1-10A dialog UI 打开动画 (320ms)
```

### 3.2 双击打开流（drowsy 入口，串行苏醒）

```
[用户双击宠物，当前 idle.drowsy]
    │
    ▼
[App.tsx 双击捕获]
    │
    ├── (并行 1) StateMachine.dispatch({ type: 'user.doubleClick' })
    │
    └── (并行 2) StateMachine.dispatch({ type: 'dialog.open', source: 'doubleClick' })
          │
          ├── idle.drowsy + dialog.open
          ├── 内部标记 pendingDialogOpen = true
          ├── AnimationPlayer: idle.drowsy.exit (4 帧, ~320ms)
          │
          ▼
   [drowsy_exit 完成]
          │
          ├── idle.drowsy → talking
          ├── AnimationPlayer: talking.loop
          │
          └── onTalkingEntered (pendingDialogOpen 消费)
                │
                └── B1-10A dialog UI 打开动画 (320ms)
```

### 3.3 关闭流

```
[用户按 Esc / X]
    │
    ▼
[TalkingInteraction.onClose('user')]
    │
    └── App.tsx handleDialogClose('user')
          │
          ├── (并行 1) StateMachine.dispatch({ type: 'dialog.close', reason: 'user' })
          │       └── talking → idle.awake (瞬时)
          │
          └── (并行 2) useDialogAnchorTransition 启动关闭动画
                  └── closing.messages → closing.shell → closing.window → compact (416ms)
```

### 3.4 既有打断流（与 dialog.close 解耦）

```
[talking 期间发生 user.feed / reminder.due]
    │
    ▼
[StateMachine 既有逻辑]
    │
    └── talking → eating / reminding (既有路径)
          │
          ▼
[dialogStateBridge 订阅检测]
    │
    └── major !== 'talking' && dialogOpen
          │
          └── 触发 dialog UI 关闭动画 (不派发 dialog.close)
```

---

## 4. 接口契约（最终形态）

### 4.1 interface_v1_2.md §4.2 升级

```ts
export type PetEvent =
  // 生命周期
  | { type: 'morningRitual.complete' }   // 候选提案保留，B3-5 落地
  | { type: 'user.exit' }

  // 软打断
  | { type: 'user.pat' }
  | { type: 'user.doubleClick' }         // 物理事件，本卡降级为通知性（不再触发状态转换）

  // 打断（硬）
  | { type: 'user.feed'; csv: File }
  | { type: 'hungry.set'; value: boolean }
  | { type: 'reminder.due'; target: Coord }
  | { type: 'reminder.dismiss' }

  // 内部定时器
  | { type: 'idle.timeout' }
  | { type: 'timer.drowsyToNap' }
  | { type: 'timer.roaming.tick' }

  // 位移契约
  | { type: 'movement.arrive'; requestId: MovementRequestId; position: Coord }

  // === Phase B 新增（B2-9）===
  | { type: 'dialog.open'; source: DialogOpenSource }
  | { type: 'dialog.close'; reason: DialogCloseReason };

export type DialogOpenSource = 'shortcut' | 'doubleClick' | 'morningRitual';
export type DialogCloseReason = 'user' | 'timeout' | 'service_done' | 'error';
```

### 4.2 interface_v1_2.md §3.4 备注更新

```
| `talking` | `loop` | v1.0 仅 loop；exit 暂不开放（B2-9 决策 K2 维持） |
```

### 4.3 interface_v1_2.md §2.0 候选提案区调整

```ts
// 候选 PetEvent 扩展（Phase B 提案）
type PhaseBPetEventProposal =
  | { type: 'morningRitual.complete' };   // 仅保留，归 B3-5

// dialog.open / dialog.close 已正式纳入 §4.2 PetEvent（B2-9 落地）
```

### 4.4 集成层接口（不进 interface_v1_2）

```ts
// src/integration/dialogStateBridge.ts （新增）
export function watchTalkingExitForDialogSync(
  machine: StateMachine,
  isDialogOpen: () => boolean,
  triggerDialogUiClose: () => void,
): () => void;

// src/integration/dialogRouter.ts （新增）
/**
 * 根据当前 PetFullState 判断是否应该派发 dialog.open。
 * 输入是物理事件（双击 / 快捷键），输出是是否派发意图事件。
 */
export function routePhysicalEventToDialogOpen(
  state: Readonly<PetFullState>,
  isDialogOpen: () => boolean,
  source: DialogOpenSource,
): { shouldDispatch: boolean; event?: PetEvent };
```

### 4.5 TalkingInteraction props 升级

```ts
interface TalkingInteractionProps {
  // ...既有...
  onClose: (reason: DialogCloseReason) => void;
  // ↑ reason 参数从隐式 'user' 改为显式枚举
}
```

集成层（App.tsx）：
```ts
const handleDialogClose = (reason: DialogCloseReason) => {
  machine.dispatch({ type: 'dialog.close', reason });
  // UI 关闭动画由 useDialogAnchorTransition 内部触发
};
```

### 4.6 StateMachine 内部新增能力

```ts
// 内部状态（不暴露 public API）
interface StateMachinePrivate {
  pendingDialogOpen: { source: DialogOpenSource } | null;
  // 苏醒动画完成后消费此标记并进 talking
}

// 现有 onAnimationComplete 钩子（或类似回调）扩展：
// 当 drowsy_exit / wake.from_nap 完成且 pendingDialogOpen 非空时，
// 转 talking 并触发 onTalkingEntered。
```

---

## 5. 留给 DeepSeek 细化的待补条目

1. **StateMachine `pendingDialogOpen` 内部状态实现**：
   - 放在 StateMachine 实例字段还是 PetFullState？（推荐前者，不污染 public state）
   - 苏醒动画完成的回调钩子复用现有哪个机制？
   - 苏醒中断时的清理路径

2. **dialogRouter 实现位置与签名细化**：
   - 是否单独成模块还是 inline 进 App.tsx？（推荐独立 `src/integration/dialogRouter.ts`）
   - 与 `dialogStateBridge.ts` 的边界（一个管打开路由，一个管关闭兜底）

3. **drowsy/napping 苏醒动画完成检测**：
   - AnimationPlayer 现有 onTokenComplete 回调能否复用？
   - 如果苏醒动画被打断（如硬打断），pendingDialogOpen 如何清理？

4. **DevPanel 按钮组**：
   - "Force dialog.open" 是否需要 source 选择？（推荐：固定 'doubleClick'）
   - "Force dialog.close" 是否需要 reason 选择？（推荐：固定 'user'）
   - 是否新增"Force from drowsy"/"Force from napping"按钮验证苏醒路径？

5. **测试用例集**：
   - StateMachine 单测覆盖 8 个状态 × dialog.open/close 的合法/非法组合矩阵
   - drowsy/napping 苏醒路径的端到端单测（含中断场景）
   - 集成测：talking 期间 user.feed → bridge 触发 UI 关闭
   - 集成测：DevPanel Force dialog.close → bridge 兜底关闭 UI

6. **interface_v1_2 文档同步**：
   - §2.0 提案区如何标注"已落地"
   - §4.2 注释标注"Phase B 新增"
   - §3.4 talking 行备注改写
   - 版本号 bump：v1.2 → v1.3

7. **`user.doubleClick` 状态机分支处理**：
   - 现有 StateMachine 中 `case 'user.doubleClick'` 分支具体内容（需要看代码确认）
   - 改为通知性处理后，原有逻辑（如有的话）是否需要拆到 dialogRouter？

8. **Ctrl+Alt+T 快捷键**：
   - B1-10 现状直接调 UI 函数，需升级为先派发 dialog.open
   - 派发逻辑应通过 dialogRouter 而非直接 dispatch

9. **错误处理**：
   - dialogRouter 路由失败时的 log 策略
   - dialogStateBridge 检测到不一致状态的 log 策略

10. **param_audit.md 同步**：
    - 本卡新增 PetEvent 不算参数，但 interface_v1_2.md 版本 bump 需登记

---

## 6. 边界与非范围（再次重申）

- ✅ 修改 `interface_v1_2.md §2.0 / §3.4 备注 / §4.2`
- ✅ 修改 `StateMachine.ts`（dialog.open/close 转换 + pendingDialogOpen 内部状态）
- ✅ 修改 `App.tsx`（双击/快捷键路由派发；onClose 派发 dialog.close）
- ✅ 修改 `TalkingInteraction.tsx`（onClose reason 显式化）
- ✅ 修改 `DevPanel.tsx`（新增 Force 按钮组）
- ✅ 新增 `src/integration/dialogStateBridge.ts`
- ✅ 新增 `src/integration/dialogRouter.ts`
- ❌ 不修改 `MajorState`
- ❌ 不修改 `chat_messages` / `ChatHistoryStore` / `ChatMemoryStore`
- ❌ 不修改 `DeepSeekService`
- ❌ 不修改 `useDialogAnchorTransition.ts`
- ❌ 不引入 spritesheet（drowsy_exit / wake.from_nap 复用既有素材）
- ❌ 不实现 inactivity timer / doneHint / morningRitual.complete

---

## 7. 验收策略

### 7.1 StateMachine 单元测试

- `dialog.open from idle.awake → talking immediately`
- `dialog.open from idle.drowsy → drowsy_exit playing, pendingDialogOpen=true; on completion → talking`
- `dialog.open from idle.napping → wake.from_nap playing, pendingDialogOpen=true; on completion → talking`
- `dialog.open from talking is ignored`
- `dialog.open from eating/happy/reminding is ignored`
- `dialog.close from talking → idle.awake`
- `dialog.close from non-talking states ignored with warning log`
- `dialog.open all sources valid; dialog.close all reasons valid`
- `pendingDialogOpen cleared on hard interrupt during wake animation`
- `user.doubleClick is notification-only, does not transition state`

### 7.2 集成测试

- `Esc → dialog.close({reason:'user'}) + UI 关闭动画 416ms`
- `X → 同上`
- `talking + user.feed → eating + dialogStateBridge triggers UI close (no dialog.close dispatched)`
- `talking + reminder.due → reminding + bridge triggers UI close`
- `dialog.close 派发后 100ms 内派发 dialog.open → B1-10A 已有逻辑吸收`
- `dialogRouter from idle.awake double-click → dialog.open dispatched`
- `dialogRouter from eating double-click → no dispatch (gated)`

### 7.3 项目负责人手测

1. 双击 idle.awake 宠物 → 立即开 dialog，DevPanel 观察 major: idle → talking
2. 等宠物进 drowsy（60s 不交互），双击 → 看到 drowsy_exit 动画 ~320ms 后 dialog 弹出
3. 等宠物进 napping（drowsy + 30s），双击 → 看到 wake.from_nap 动画 ~560ms 后 dialog 弹出
4. Esc / X 关闭 → DevPanel 观察 major: talking → idle.awake，UI 416ms 关闭动画
5. talking 期间拖入 CSV → dialog 自动关闭，状态切到 eating，bridge 工作正确
6. Ctrl+Alt+T 打开 → DevPanel 观察 dialog.open({source:'shortcut'})
7. DevPanel "Force dialog.open" → 状态机切 talking，bridge 反向触发 UI 同步打开（或直接观察事件层）
8. DevPanel "Force dialog.close" → 状态机切 idle.awake，bridge 触发 UI 自动关闭

---

## 8. 后续动作

| # | 动作 | 责任方 | 输入 |
|---|---|---|---|
| 1 | DeepSeek 基于 v0.2 细化（§5 待补 10 项） | DeepSeek | 本文档 + interface_v1_2.md + B1-10/B1-10A 实施报告 + StateMachine 当前实现 |
| 2 | GPT 审核 DeepSeek 细化稿（按通用 GPT 审核 prompt 流程） | GPT | DeepSeek 细化稿 + 本文档 |
| 3 | Codex 落地实现，产出 B2-9 实施报告 | Codex | GPT 审定的任务卡 |
| 4 | Claude 终审 + 同步 interface_v1_2.md（v1.2 → v1.3） + 更新 phaseb_execution_plan.md §3.2.3 + 更新 ichan_project_doc.md §9.3 | Claude | Codex 实施报告 |

---

## 9. 版本

- v0.1 - 2026-04-29 - 初稿
- v0.2 - 2026-04-29 - 修正 K6（user.doubleClick 与 dialog.open 因果关系而非替换）；正本清源 dialog.close 不属于打断的术语；K7-2 升级 drowsy/napping 串行苏醒接线（采纳方案 A）；新增 K9 DevPanel 语义
