# dialog_transition_schema.md

> **来源**：B1-10A anchor 过渡重构实施成果（`phaseb_execution_plan.md` §5.8）  
> **真值源代码**：`src/components/Dialog/dialog-transition.ts`、`src/components/Dialog/useDialogAnchorTransition.ts`、`src/components/Dialog/dialog-types.ts`、`src/components/Dialog/dialog-tokens.ts`  
> **版本**：v1.0 - 2026-04-27（B1-10A 完成，长期动效规则抽取）

---

## 1. 文档定位

本文件是 B1-10A 动效实现的**长期真值源**，记录对话窗口的 anchor-box 过渡模型的几何常量、相位定义、时序规格、CSS 方案和复用规则。

**区分**：对话**静态 UI**（气泡布局、输入区、配色 Token、交互规则）属于 `talking_interaction_schema.md`，本文件**仅覆盖窗口展开/收束动效**。

---

## 2. Anchor-box 模型

### 2.1 核心理念

对话窗口以 i酱的锚点位置为原点进行圆形展开/收束（clip-path），所有 UI 元素（header、气泡、输入区）从锚点方向飞入（fly-in）。

### 2.2 几何常量

源文件：`src/components/Dialog/dialog-transition.ts`

| 常量 | 值 | 说明 |
|------|-----|------|
| `COMPACT_WINDOW` | `{ w: 380, h: 290 }` | compact（收起）窗口尺寸 |
| `COMPACT_PET_DISPLAY` | `{ w: 291, h: 180 }` | compact 模式下 PetCanvas 显示尺寸 |
| `COMPACT_PET_ANCHOR_IN_WINDOW` | `{ x: 44.5, y: 110, width: 291, height: 180 }` | compact 窗口内宠物锚点盒位置 |
| `DIALOG_WINDOW` | `{ w: 560, h: 360 }` | dialog（展开）窗口尺寸 |
| `DIALOG_PET_DISPLAY` | `{ w: 150, h: 136 }` | dialog 模式下 PetCanvas 显示尺寸 |
| `DIALOG_PET_ANCHOR_IN_WINDOW` | `{ x: 54, y: 128, width: 150, height: 136 }` | dialog 窗口内宠物锚点盒位置 |

### 2.3 idle.awake 显示盒锚点原则

- **compact 锚点中心**：`(44.5 + 145.5, 110 + 90)` = `(190, 200)` —— i酱在 compact 窗口内的视觉中心
- **dialog 锚点中心**：`(54 + 75, 128 + 68)` = `(129, 196)` —— i酱在 dialog 窗口内的视觉中心
- **偏移量**：`(+61, +4)` —— 窗口从 compact 展开到 dialog 时，锚点在屏幕坐标上的固定偏移
- **比例不相似**：compact 291×180（比例 1.617） vs dialog 150×136（比例 1.103），因此**全程不使用 CSS scale** 对 PetCanvas 做变换，仅通过 `displayHeightPx` 改变渲染尺寸

---

## 3. window geometry：setSize + setPosition 联动

- **打开**：`newX = compactCenterX + 61`, `newY = compactCenterY + 4`，同时 `setSize(560, 360)`
- **关闭**：`compactX = dialogCenterX - 61`, `compactY = dialogCenterY - 4`，同时 `setSize(380, 290)`
- **并行执行**：打开时 `setSize` + `setPosition` + 恢复 `ignoreCursorEvents` 并行调用，失败时降级为串行
- **关闭守卫**：关闭期间（416ms 内）通过 `requestDialogOpen` 吸收重复请求，不产生窗口闪退

---

## 4. data-dialog-phase 枚举

源文件：`src/components/Dialog/dialog-types.ts`

```ts
type DialogTransitionPhase =
  | "measuring"          // 挂载但隐藏，读取 DOM 测量
  | "compact"            // 完全收起：clip-path(0), pointer-events:none
  | "opening"            // 圆形展开动画进行中
  | "open"               // 完全展开的稳态
  | "closing.messages"   // 消息气泡淡出
  | "closing.shell"      // shell 收束回 anchor
  | "closing.window"     // 窗口级动画 + snap 回 compact
```

---

## 5. 阶段说明

### 5.1 measuring

- **状态**：dialog-shell `visibility: hidden`，不参与 pointer events
- **内容**：给所有 `[data-reveal-item="true"]` 元素设 `data-reveal-measuring="true"`（强制 `transform: none !important`），通过 rAF #1 读取每个元素的 `getBoundingClientRect()`，计算 `--reveal-from-x/y`（相对锚点中心的偏移量）
- **半径计算**：同时计算 `--dialog-reveal-radius` = `max(各角落到锚点距离) + 24px`
- **退出条件**：rAF #2 移除 `data-reveal-measuring`，注入 CSS variable，phase → `compact`（若 `pendingOpenRef=true` 则直接 → `opening`）
- **重测**：消息列表变更时，仅对宽高变化 >0.5px 的 item 单独重测，稳定 item 不受影响

### 5.2 compact

- **CSS**：`clip-path: circle(0 at var(--dialog-anchor-x) var(--dialog-anchor-y))`，`pointer-events: none`
- reveal-item：`translate(--reveal-from-x, --reveal-from-y) scale(0.72)`，`opacity: 0`
- 这是 dialog 挂载但不可见时的稳态

### 5.3 opening

- **时长**：320ms（`DIALOG_TRANSITION.openingMs`）
- **缓动**：`cubic-bezier(0.32, 0.72, 0, 1)`（Apple 风格 ease-out）
- **clip-path**：`circle(0)` → `circle(var(--dialog-reveal-radius))`
- **reveal-item**：从偏移位置 fly-in 到自然位置，`scale(0.72)` → `scale(1)`，`opacity: 0` → `opacity: 1`
- **PetCanvas**：opening 启动瞬间从 291×180 snap 到 150×136，无 CSS scale
- **计时器**：320ms 后 phase → `open`

### 5.4 open

- 视觉效果与 opening 终态相同（全展开 + 全飞入）
- `pointer-events: auto`
- 此阶段无计时器，等待用户交互触发关闭

### 5.5 closing.messages

- **时长**：180ms（`DIALOG_TRANSITION.closingMessagesMs`）
- **效果**：消息气泡（`.message-bubble`）`opacity: 1` → `opacity: 0`
- shell 和其他 reveal-item 保持完全可见
- 计时器结束后 phase → `closing.shell`

### 5.6 closing.shell

- **时长**：220ms（`DIALOG_TRANSITION.closingShellMs`）
- **clip-path**：`circle(var(--dialog-reveal-radius))` → `circle(0)`
- **reveal-item**：从自然位置回到偏移位置，`scale(1) → scale(0.72)`，`opacity: 1` → `opacity: 0`
- **CSS 适配**：此阶段使用独立 `transition` 时长 `--dialog-closing-shell-ms`（220ms），不与 opening 的 320ms 共用，否则动画到 68% 即被截断
- 计时器结束后 phase → `closing.window`

### 5.7 closing.window

- 触发 `onClosingWindowPhase()` 回调（由 App.tsx 注入），执行窗口级回缩动画（setSize + setPosition）
- 回调完成后等待 16ms（`DIALOG_TRANSITION.windowSnapFrameMs`，1 帧）
- 恢复 `ignoreCursorEvents` 快照值
- phase → `compact`，可接受下一次打开请求

---

## 6. 打开动画时序

```
T0: phase=measuring, visibility:hidden
  → rAF#1 测量所有 reveal-item（getBoundingClientRect）
  → 注入 --reveal-from-x/y CSS variables
  → rAF#2 移除 data-reveal-measuring, phase=compact
  → openDialog() 触发
    → setSize(560,360) + setPosition(newPos) + setIgnoreCursorEvents(false)
    → PetCanvas snap 291×180→150×136
    → phase=opening (timer: 320ms)
      → clip-path 圆形展开
      → reveal-item fly-in
    → phase=open
```

---

## 7. 关闭动画时序

```
T0: phase=closing.messages (timer: 180ms)
  → 消息气泡 opacity 淡出
T180ms: phase=closing.shell (timer: 220ms)
  → clip-path 收束
  → reveal-item 飞回 anchor + scale 缩小 + opacity 淡出
T400ms: phase=closing.window
  → onClosingWindowPhase(): setSize(380,290) + setPosition(compactPos)
  → 恢复 ignoreCursorEvents 快照
  → timer: 16ms
T416ms: phase=compact
  → 可接受下一次打开
```

**关闭总时长**：180 + 220 + 16 ≈ **416ms**（不含用户窗口动画时间）

---

## 8. fallback CSS baseline

### 8.1 主方案（clip-path）

```css
.dialog-shell {
  clip-path: circle(0 at var(--dialog-anchor-x) var(--dialog-anchor-y));
  transition: clip-path var(--dialog-transition-ms) var(--dialog-easing);
}

[data-dialog-phase='opening'] .dialog-shell,
[data-dialog-phase='open'] .dialog-shell,
[data-dialog-phase='closing.messages'] .dialog-shell {
  clip-path: circle(var(--dialog-reveal-radius) at var(--dialog-anchor-x) var(--dialog-anchor-y));
}

[data-dialog-phase='closing.shell'] .dialog-shell {
  clip-path: circle(0 at var(--dialog-anchor-x) var(--dialog-anchor-y));
  transition-duration: var(--dialog-closing-shell-ms);
}
```

### 8.2 降级方案（scale+opacity，无 clip-path 支持时）

```css
@supports not (clip-path: circle(10px at 10px 10px)) {
  .dialog-shell {
    clip-path: none;
    opacity: 0;
    transform: scale(0.72);
    transform-origin: var(--dialog-anchor-x) var(--dialog-anchor-y);
    transition: transform var(--dialog-transition-ms) var(--dialog-easing),
                opacity var(--dialog-transition-ms) ease-out;
  }

  [data-dialog-phase='compact'] .dialog-shell,
  [data-dialog-phase='measuring'] .dialog-shell,
  [data-dialog-phase='closing.shell'] .dialog-shell,
  [data-dialog-phase='closing.window'] .dialog-shell {
    opacity: 0;
    transform: scale(0.72);
  }

  [data-dialog-phase='opening'] .dialog-shell,
  [data-dialog-phase='open'] .dialog-shell,
  [data-dialog-phase='closing.messages'] .dialog-shell {
    opacity: 1;
    transform: scale(1);
  }
}
```

**受影响的阶段**：
- **compact / measuring / closing.shell / closing.window**：`opacity: 0` + `scale(0.72)`（隐藏态）
- **opening / open / closing.messages**：`opacity: 1` + `scale(1)`（显示态）
- transform-origin 固定为 anchor 中心，缩放从宠物位置辐射

### 8.3 backdrop-filter 降级

```css
@supports not (backdrop-filter: blur(1px)) {
  .dialog-shell { background: rgba(30, 30, 40, 0.92); }
}
```

---

## 9. PetCanvas 复用规则

- **单实例**：整个 App 中只有一个 `<PetCanvas>` 实例，位于 `.pet-hitbox` 内，同时是 `TalkingInteraction` 的兄弟节点
- **mode 切换**：`dialogMounted` 为 `true` 时 `mode="dialog"`，否则 `mode="default"`
- **尺寸切换**：`displayHeightPx` 从 `COMPACT_PET_DISPLAY.h`（180）切换到 `DIALOG_PET_DISPLAY.h`（136）
- **无 CSS scale**：对 PetCanvas 不施加任何 CSS scale transform，避免像素艺术被拉伸变形
- **player 持久**：`AnimationPlayer` 在 mode 切换时**不重新创建**，动画连续播放，提供无缝视觉过渡

---

## 10. activeSessionId 规则

- **生成时机**：每次 dialog 从非 open 状态变为 open 时（`useEffect` 依赖 `open` 从 false→true）
- **格式**：`dialog-YYYY-MM-DD-xxxxxx`
  - `YYYY`：4 位年份
  - `MM`：2 位月份（01-12）
  - `DD`：2 位日期（01-31）
  - `xxxxxx`：6 位随机字母数字（base-36，`Math.random().toString(36).slice(2, 8).padEnd(6, '0').slice(0, 6)`）
- **示例**：`dialog-2026-04-27-a3bf2z`
- **用途**：关联该次对话的所有 chat message（通过 `chatHistoryStore.append(sessionId, ...)` 写入 SQLite）

---

## 11. measuring / anchor / clip-path 注意事项

1. **measuring 帧方案是必要条件**：如果跳过 measuring 直接 opening，reveal-item 的起始坐标无法确定（依赖 DOM 渲染后的实际 layout），fly-in 动画将失效
2. **callback ref 模式**：所有外部回调（`onAfterOpen`、`onAfterClose`、`onClosingWindowPhase`、`onPhaseChange`）通过 `useRef` 存储并在 render body 中同步更新，不参与 `useCallback` / `useEffect` 依赖数组，确保内部函数引用全局稳定，避免无限重渲染导致的 measuring 卡死
3. **closing.shell 独立 CSS transition**：必须用单独规则覆盖 `transition-duration` 为 220ms，与 opening 的 320ms 分离，否则收束动画会被截断
4. **runtime assert**：DEV 模式下通过 `assertCompactDialogGeometry()` 验证几何常量一致性（与 `petBehaviorConfig.ui.petDisplayHeightPx` 交叉校验）
5. **measureSignal**：消息列表变化时由 `TalkingInteraction` 驱动重测，仅对新增/变化的 bubble 注入 measuring 标记，历史消息不受影响

---

## 12. 验收清单

1. 双击宠物 → dialog-shell 从 i酱位置圆形展开，header / 气泡 / 输入区从 anchor 方向飞入
2. DevPanel "Open Dialog Mock" → 四个消息注入按钮（Append Ichan/User, Long Text, History Review）均生效
3. X / Esc 关闭 → 消息先淡出（180ms）→ shell 收束（220ms）→ 窗口回 compact（16ms），三段动画依次完成
4. 关闭后立即（<416ms）再次双击 → 不重新 opening / 不闪退 / 不 phase 卡死
5. 关闭完成后再次双击 → 正常重新打开
6. 打开时窗口位置偏移 `(+61, +4)`，关闭时 `(-61, -4)`
7. PetCanvas 在 dialog 模式下无 CSS scale transform，仅尺寸从 291×180 snap 至 150×136

---

## 13. 非范围

- 不新增 `MajorState`
- 不修改 `StateMachine` public API（`init/start/dispatch/getState/getSnapshot/subscribe/destroy`）
- 不提前落地 B2-9 的 `dialog.close` 状态机闭环
- 不新增 talking exit spritesheet
- 不对 `PetCanvas` 或 i酱本体施加任何 CSS `scale` transform
- 不修改 `src/state/**`、`src-tauri/**`、`src/services/**`
- 不改变 `interface_v1_2.md` 既有契约
