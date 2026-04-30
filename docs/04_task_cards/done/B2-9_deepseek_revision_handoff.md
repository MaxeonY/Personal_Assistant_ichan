# DeepSeek 修订交接包：B2-9 细化稿 v0.1 → v0.2

> **触发**: GPT 审核反馈两条（Type A + Type C）→ Claude 裁定 → 架构稿 v0.3 patch  
> **形式**: 增量修订，DeepSeek 据此产出 `B2-9_implementation_details_v0.2.md`  
> **不需要**: 重新做完整的 10 项细化（v0.1 大部分内容保留，仅修订涉及的章节）

---

## 一、修订背景

GPT 审核你提交的 v0.1 细化稿后发现两处与 Claude 锁定决策（K1-K9）冲突的实施判断：

### Type A 架构问题（已 Claude 裁定）

> `dialogRouter.shouldOpenDialog()` 允许 `happy` 状态返回 `true`，且细化稿将
> `happy + dialog.open` 视为"不是 bug"；这与 Claude K6/K7 已锁定的"仅 idle 可路由
> 打开、`eating/happy/reminding` 忽略"冲突。Claude 架构稿明确写了 `major !== idle`
> 忽略，以及 `eating / happy / reminding` 对 `dialog.open` 忽略；DeepSeek 稿却
> 在 router 中对 `happy` 返回 true。
>
> 修订方向：`dialogRouter` 只允许 `state.lifecycle === 'alive' && state.major === 'idle'
> && !isDialogOpen`；`happy` 不进入 router true 分支。StateMachine 防御层可对
> `happy` ignore + warning，但不应把 happy 当成可打开入口。

**Claude 裁定**：维持 K6 原约束。Router 层严格判定（仅 idle）/ StateMachine 层宽容
防御（非 idle 一律 ignore + warning）—— **两层责任分离**。

你的"happy + dialog.open 不是 bug"那句辩护本身不错（指 StateMachine 层的容错性），
但你把这个性质 carry over 到了 Router 层，把"不崩"误读为"可放行"。这是越权。

### Type C 待定问题（已 Claude 裁定）

> DevPanel `Force dialog.open` 的 UI 同步责任不清。Claude K8 把 `dialogStateBridge`
> 定位为关闭兜底，但 K9 又说 Force 按钮只 dispatch、由 bridge 兜底同步；架构手测项
> 还写到 Force open 后 bridge 反向触发 UI 同步。DeepSeek 稿只明确了 Force close 时
> bridge 关闭 UI，没有闭合 Force open 的 UI 同步语义。
>
> 待 Claude 明确：`dialogStateBridge` 是否需要双向同步，还是 `Force dialog.open`
> 仅验证状态机层、不保证 UI 打开。

**Claude 裁定**：dialogStateBridge **单向兜底**，仅处理关闭路径。`Force dialog.open`
仅验证状态机层，UI 不自动打开是**预期行为**。

---

## 二、修订动作清单

请基于 v0.1 细化稿做以下增量修订，产出 `B2-9_implementation_details_v0.2.md`：

### 修订 1：§3 dialogRouter 实现位置与签名细化

**修改点**：

1. `shouldOpenDialog()` 实现严格化：

```ts
export function shouldOpenDialog(
  state: Readonly<PetFullState>,
  isDialogOpen: () => boolean,
): boolean {
  // 严格判定：仅当 lifecycle alive + major === 'idle' + dialog 未开
  return (
    state.lifecycle === 'alive' &&
    state.major === 'idle' &&
    !isDialogOpen()
  );
}
```

2. 删除原 v0.1 中"happy + dialog.open 不是 bug"的扩展性论述。

3. 在注释中明确两层责任分离：

```ts
/**
 * Router 层（严格判定，产品意图）：
 *   仅放行 idle 状态。happy / eating / reminding / talking 等一律返回 false。
 *
 * StateMachine 层（宽容防御，工程稳健性）：
 *   任何非合法状态收到 dialog.open 都 ignore + warning log，不崩溃。
 *
 * 两层职责互补但语义独立——router 不应主动放行非 idle 状态，
 * 即使 StateMachine 层"能容忍"也不行。
 */
```

### 修订 2：§4 DevPanel 按钮组的同步语义

**修改点**：

1. 补充 `Force dialog.open` 的 UI 同步行为说明：

```
Force dialog.open 行为：
  · StateMachine.dispatch({ type: 'dialog.open', source: 'doubleClick' })
  · UI 不会打开（这是预期行为，dialogStateBridge 不参与打开路径）
  · 用途：隔离验证状态机层转换 + AnimationPlayer 切换
```

2. 保留 `Force dialog.close` 现有说明（v0.1 已正确）：

```
Force dialog.close 行为：
  · StateMachine.dispatch({ type: 'dialog.close', reason: 'user' })
  · dialogStateBridge 检测到状态切走，触发 UI 关闭动画
  · 用途：验证 bridge 兜底机制
```

3. 说明两个按钮的不对称用途：Force open 用于状态机/动画层诊断；
   Force close 用于集成层 bridge 验证。

### 修订 3：§2 dialogStateBridge 责任边界（如 v0.1 涉及）

**修改点**（如 v0.1 中 §2 dialogStateBridge 实现位置部分有提及双向同步）：

1. 明确 bridge **只处理关闭路径**，不参与打开：

```ts
// 仅订阅 talking → 非 talking 的状态变化
// 不订阅 非 talking → talking 的反向变化
machine.subscribe((newState, prevState) => {
  if (
    prevState.major === 'talking' &&
    newState.major !== 'talking' &&
    isDialogOpen()
  ) {
    triggerDialogUiClose();
  }
  // 不处理 prev !== talking → new === talking（不主动开 UI）
});
```

2. 在文档说明中加一段"为什么不做双向同步"，要点：
   - 保持开关对称性（K5 同源原则：UI 不被状态机反向控制）
   - 保留 DevPanel Force 的隔离测试价值
   - 打开路径的 fan-out 由物理事件层完成，不需要兜底

### 修订 4：§5 测试用例集补充

**新增测试用例**：

```
StateMachine 单测补充：
- `dialog.open from happy is ignored with warning log`
- `dialog.open from eating is ignored with warning log`
- `dialog.open from reminding is ignored with warning log`
- 这三条覆盖 router 层应该 gate 但万一漏掉时 StateMachine 防御层的兜底

dialogRouter 单测：
- `shouldOpenDialog from idle.awake returns true`
- `shouldOpenDialog from idle.drowsy returns true`
- `shouldOpenDialog from idle.napping returns true`
- `shouldOpenDialog from happy returns false`
- `shouldOpenDialog from eating returns false`
- `shouldOpenDialog from reminding returns false`
- `shouldOpenDialog from talking returns false`
- `shouldOpenDialog when dialogOpen returns false (regardless of major)`
- `shouldOpenDialog when lifecycle !== 'alive' returns false`

dialogStateBridge 单测：
- `bridge triggers UI close when talking → eating`
- `bridge triggers UI close when talking → reminding`
- `bridge triggers UI close when talking → idle (via dialog.close)`
- `bridge does NOT trigger UI open when idle → talking`  ← 新增
- `bridge does NOT react when major change does not involve talking`

集成测补充：
- `DevPanel Force dialog.open from idle.awake → state changes to talking, dialog UI stays closed`
- `DevPanel Force dialog.close from talking with dialog open → state changes to idle.awake, bridge triggers UI close`
```

### 修订 5：§7 既有 user.doubleClick 处理（如涉及）

**检查点**：v0.1 §7 中如有"happy + user.doubleClick 路由打开 dialog"类描述，
按 router 严格判定原则修订——physical event 仍可派发 `user.doubleClick`，但
router 不放行 happy/eating/reminding 调用 `dialog.open`。

---

## 三、不需要修改的部分

v0.1 细化稿中以下章节**保留不动**：

- §1 概览（除非涉及上述修订点）
- §6 苏醒动画完成检测细化（pendingDialogOpen 机制）
- §8 Ctrl+Alt+T 快捷键升级
- §9 错误处理
- §10 param_audit 同步
- §11 给 GPT 起任务卡的关键提示（除非涉及 router 判定）

---

## 四、产出格式

文件名：`B2-9_implementation_details_v0.2.md`

结构：保持 v0.1 章节框架，仅在受影响章节做增量修订。

文件头加修订摘要：

```markdown
> 版本：v0.2 - 2026-04-29
> 基于：v0.1 + GPT 审核反馈 + Claude v0.3 patch
> 修订章节：§3 (dialogRouter)、§4 (DevPanel 语义)、§2 (bridge 边界)、§5 (测试用例)
> 未修订章节：§1, §6, §7, §8, §9, §10, §11（保留 v0.1 内容）
```

---

## 五、附件

- `B2-9_architecture_v0.2.md`（v0.2 主稿，已读）
- `B2-9_architecture_v0.3_patch.md`（v0.3 增量补丁，本次修订依据）
- `B2-9_implementation_details_v0.1.md`（你自己的 v0.1 细化稿）
- 上方 GPT 审核意见原文

---

## 六、产出后流向

你的 v0.2 细化稿 → Claude 复核（确认 GPT 反馈两条已闭合）→ GPT 终审起任务卡 →
Codex 落地实现。

预计 Claude 复核工作量很小，因为修订点都是表述/严格化层面，不涉及新的架构判断。
