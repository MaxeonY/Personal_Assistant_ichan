# B2-6 Implemented Audit Report

> **日期**: 2026-05-01
> **范围**: 落地内容与文档一致性核查（B2-6 待办提醒功能实施前审计）
> **审计员**: DeepSeek
> **状态**: 待讨论 / 待决策

---

## 0. 审计说明

本次审计为 B2-6（待办提醒）实施前，对全项目文档与代码的一致性核查。已完成修复的条目不在本报告中（见其他已修改文档）。本报告仅保留 **待进一步讨论** 与 **需进一步解决的问题**，作为 Phase B 中期决策记录。

---

## 1. M4: `farewell` → `deep_sleep` 生命周期闭环未实现

### 1.1 现象

| 对比项 | 接口合同 (`interface_v1_2.md` §5 场景5) | 代码实现 (`StateMachine.ts`) |
|--------|----------------------------------------|------------------------------|
| farewell 动画 | `play({ state: 'farewell', intent: 'oneshot' })` | `playAnimation({ state: 'farewell', intent: 'oneshot' })` （一致） |
| onComplete 行为 | `lifecycle → deep_sleep` → **`notifyApplicationShellToExit()`** | `lifecycle → deep_sleep` → `clearTimers` → `emitStateChanged` → **终止** |

### 1.2 问题详解

合同场景 5（第 618-637 行）定义了完整的 farewell → deep_sleep → 通知壳进程退出的链。但 `StateMachine.ts:765-787` 在 farewell 的 `onComplete` 中仅将 lifecycle 切换到 `deep_sleep` 并 emit，**未调用任何生命周期出口钩子**。

当前的实际退出流程依赖于外部监听者：
- 外部（`App.tsx`）在 `subscribe` 回调中检测到 `lifecycle === 'deep_sleep'`
- 由外部自主决定是否关闭窗口 / 调用 Tauri command

### 1.3 合同与实现的不一致点

```
合同:  StateMachine.destroy() 不负责进程退出本身（由应用壳处理）
       → 但 farewall onComplete 中应调用 notifyApplicationShellToExit()
       → 此回调是一个"信号通知"，而非进程退出

代码:  farewall onComplete 中无任何 exit 通知
       → 仅发出 stateChanged 事件，依赖外部监听
```

### 1.4 影响评估

| 维度 | 评级 | 说明 |
|------|------|------|
| 功能正确性 | 低风险 | 目前通过 App.tsx 的 listener 实现退出功能正常 |
| 架构合规性 | 中风险 | 违反了合同定义的回调链——合同明确设计了 `notifyApplicationShellToExit()` 作为 farewell 链路的最后一步 |
| 可测试性 | 低风险 | 单元测试中难以验证 farewell 链路的完整性 |

### 1.5 建议方案

**方案 A（推荐）**: 在 `StateMachine` 构造函数或 `init()` 中接受可选的 `onExitRequest?: () => void` 回调，在 farewell > deep_sleep 转换时调用。不耦合 Tauri 依赖。

```ts
interface StateMachineInitOptions {
  now?: () => TimestampMs;
  onExitRequest?: () => void;  // 新增
}
```

**方案 B**: 保持现状，更新接口合同删除 `notifyApplicationShellToExit()` 引用，承认此职责完全由外部监听处理。

---

## 2. L1: `walk.roaming` 向左方向未采用 CSS 镜像方案

### 2.1 现象

| 方向 | 文档建议 (`ani_resources.md §3.1.10`) | 代码实现 (`sequences.ts`) | walk.targeted 对比 |
|------|---------------------------------------|--------------------------|---------------------|
| `walk.roaming` + left | "向左可完全通过CSS `scaleX(-1)`镜像" | 使用独立 `walk_roaming_left_01~05` 帧，`mirrorX` 未启用 | — |
| `walk.targeted` + left | "向左循环采用CSS `scaleX(-1)` 水平镜像" | 复用 `walk_targeted_right_01~03`，`mirrorX: true` | ✓ 已按文档实现 |

### 2.2 问题详解

`ani_resources.md:433` 明确标注 roaming 左向可使用 CSS 镜像。但当前实现中：
- `spritesheetLoader.ts` 的 `roaming` spritesheet 包含 **10 帧**（左右各 5 帧）
- `sequences.ts` 的 `walk.roaming` + left 使用独立的左向帧名列表，`mirrorX` 字段未设置（undefined/false）

**对比**：`walk.targeted` + left（`sequences.ts:319-333`）正确采用了 `mirrorX: true`，并复用右向帧。这是文档建议做法的正确范例。

### 2.3 影响评估

| 维度 | 评级 | 说明 |
|------|------|------|
| 功能正确性 | 无影响 | 左右双套帧功能上正确运行 |
| 性能 / 资源 | 低影响 | roaming spritesheet 多占 ~40px 宽度（5 个额外帧 × 840px ÷ frameCount） |
| 维护性 | 中影响 | 若 roaming 素材更新，需同步修改左右两套帧映射；若采用镜像则只维护一套 |
| 一致性 | 中影响 | roaming 和 targeted 同为 walk.* 但采用了不同的左向策略 |

### 2.4 建议方案

- 与 `walk.targeted` 统一：`walk.roaming` + left 序列改用右向帧 + `mirrorX: true`
- 同步修改 `spritesheetLoader.ts` 中 roaming spritesheet 的 `frameCount`（从 10 降至 5）和帧映射
- 文档中删除左向独立帧的"功能定义"与"方案"，或标注为"已废弃/仅存档"

---

## 3. L2: `StateMachine.destroy()` 实际行为超出合同约定

### 3.1 现象

| 行为 | 合同要求 (`interface_v1_2.md §4.4`) | 代码实现 (`StateMachine.ts:153-164`) |
|------|--------------------------------------|--------------------------------------|
| 清除内部定时器 | ✓ 必须 | `this.timers.clearAll()` ✓ |
| 作废当前 token | ✓ 必须 | `this.interruptCurrentAnimation()` ✓ |
| 清除 drowsy-breath CSS 效果 | **未要求** | `this.player.detachCSSEffect('drowsy-breath')` |
| 清除所有 CSS 效果 | **未要求** | `this.player.clearCSSEffects()` |
| 清空 listeners | **未要求** | `this.listeners.clear()` |

### 3.2 问题详解

`destroy()` 的合同定义相对精简，而代码实现执行了这些**额外的清理步骤**。这些步骤在功能上是正确的（destroy 应彻底清理），但存在以下不一致：

1. `detachCSSEffect('drowsy-breath')` 与 `clearCSSEffects()` 有冗余——`clearCSSEffects()` 内部已遍历全部 attached effects 并移除
2. `listeners.clear()` 合同未提到——销毁后 listener 被清空是合理行为，但合同未约定

### 3.3 影响评估

| 维度 | 评级 | 说明 |
|------|------|------|
| 功能正确性 | 无影响 | 这些清理行为是良性补充 |
| 合同合规 | 低影响 | 合同覆盖不足，但接口语义未被破坏 |

### 3.4 建议方案

**方案 A（推荐）**: 更新接口合同中对 `destroy()` 的描述，补充以下项：
- 应移除所有已附加的 CSS 效果
- 应停止所有活跃的 overlay 播放
- 应清除所有订阅者
- `clearCSSEffects()` 内部已包含 `detachCSSEffect('drowsy-breath')`，代码中的显式调用是冗余的，可考虑移除

---

## 4. L5: 快捷键定义散落在 `App.tsx` 而非统一配置

### 4.1 现象

| 快捷键 | 用途 | 定义位置 | 是否在 `petBehaviorConfig.ts` | 是否在 `behavior_config.md` |
|--------|------|---------|-------------------------------|-----------------------------|
| `Ctrl+Alt+P` | 穿透切换 | `petBehaviorConfig.ts:3` | ✓ | ✓ (`app.clickThroughShortcut`) |
| `Ctrl+Alt+T` | 打开对话 | `App.tsx:80` | ✗ | ✗ |
| `Ctrl+Alt+D` | DEV 面板 | `App.tsx:81` | ✗ | ✗ |

### 4.2 问题详解

`behavior_config.md` 作为行为参数的唯一真值源，当前仅记录了穿透切换快捷键。对话和 DEV 面板快捷键作为 `const` 硬编码在 `App.tsx` 中，未纳入配置系统，参数审计文档中也无对应条目。

### 4.3 影响评估

| 维度 | 评级 | 说明 |
|------|------|------|
| 功能正确性 | 无影响 | 快捷键正常运行 |
| 可维护性 | 低影响 | 调参入口不统一，后续如要集中管理快捷键（如避免系统冲突），需跨文件搜索 |
| 文档一致性 | 低影响 | behavior_config.md 的 app 组中应添加对应参数 |

### 4.4 建议方案

1. 在 `petBehaviorConfig.ts` 的 `app` 组中添加：
   - `dialogShortcut: "Ctrl+Alt+T"`
   - `devPanelShortcut: "Ctrl+Alt+D"`（DEV 环境下启用）
2. 同步回流到 `behavior_config.md` §2.6 参数表
3. `App.tsx` 改为从 `petBehaviorConfig` 读取

---


## 5. 决策矩阵

| 编号 | 主题 | 决策方向 | 建议优先级 | 建议分配 Phase |
|------|------|---------|-----------|---------------|
| M4 | farewell exit 回调缺失 | 需架构决策（方案A/B） | P2 | B2-9+ 或 MVP 后 |
| L1 | walk.roaming 左向未镜像 | 统一为镜像方案 | P3 | MVP 后 |
| L2 | destroy() 合同补充 | 更新合同文档 | P3 | MVP 后 |
| L5 | 快捷键配置化 | 集中到配置系统 | P3 | MVP 后 |
| D3 | B1-10 编号纠正 | 修正为 B2-9 | P3 | 随时可改 |

---

## 6. 附录：无需决策的已验证项（摘要）

以下为上轮核查中已确认无问题或已修复的条目（不纳入决策范围）：

- H1: `05_audit/` 审计报告缺失 — 已删除过时引用 ✓
- H2: `idleTimeoutMs` 值合理 — MVP 后调参 ✓
- M1: spritesheet 尺寸文档 — 已添加备注说明 ✓
- M2: `docs_index.md` active/ 文档列表 — 已添加备注 ✓
- M3: `types.ts` 注释引用 `animation_resources.md` 拼写 — 已修正 ✓
- L3: `ani_resources.md` 子目录统计说明 — 已添加备注 ✓
- L4: 对话 UI Schema 与落地文件名差异 — 已标注 ✓
- L6: reminding 帧尺寸细小差异 — 不影响开发 ✓
- D1: `docs_index.md` 审计报告引用 — 已删除 ✓
- D2: `interface_v1_2.md` 自引路径 — 已修正 ✓
- D4: `talking_interaction_schema.md` §15.2 措辞 — 已修正 ✓
