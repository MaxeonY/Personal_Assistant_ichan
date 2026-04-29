# talking_interaction_schema.md

> 来源：`Talking_UI_Draft_v3.png` 的标注参数与状态示例。  
> 参照格式：`first_run_wizard_schema.md`。  
> 坐标基准：**1024 × 682.5，约 3:2，1x 逻辑像素**。当前 PNG 为 **2048 × 1365** 约 2x 导出图，若从截图量像素，需约除以 2 后再落到本 schema。  
> 核心实现对象：`interactive_box` / 对话交互框。  
> 版本：v2.1 schema - 2026-04-26（B1-10 实现基准）。

---

## 1. 设计目标

`interactive_box` 是 i酱进入 `talking` 对话状态后的主交互界面，用于承载以下功能：

1. 展示 i酱当前对话动画；
2. 展示 i酱消息气泡 `ichan_message`；
3. 展示用户消息气泡 `my_message`；
4. 提供文本输入区 `message_box`；
5. 提供发送按钮 `send`；
6. 支持等待、输入、发送成功、回复中、长文本换行、对话完成等状态；
7. 与项目内 First Run Wizard 保持相近的毛玻璃、暖橙主色、柔和阴影与圆角语言。

视觉目标：

- 整体为悬浮式毛玻璃窗口；
- 背景具有透明 / 半透明 / 液态玻璃质感；
- 对话气泡具有轻微悬浮感；
- 宠物角色保持像素风，使用 `idle.awake` 或 `talk` 动画资源；
- 信息层级清晰，避免星形、心形、信号标识等额外装饰；
- 输入区与发送按钮保持高可识别性；
- 与 `FirstRunWizard_UI.png` 的圆角、橙色主色、卡片质感统一。

---

## 2. 画布与缩放基准

```ts
export const TALKING_INTERACTION_CANVAS = {
  width: 1024,
  height: 682.5,
  aspectRatio: 'approx-3:2',
  coordinateUnit: 'logical-px',
  exportScale: 2,
};
```

### 2.1 运行窗口基准

设计图中实际业务窗口为 `interactive_box`，尺寸固定为：

```ts
export const INTERACTIVE_BOX_BASE = {
  width: 560,
  height: 360,
  radius: 16,
  paddingX: 20,
  paddingY: 20,
};
```

### 2.2 响应式缩放规则

若运行窗口不是 560 × 360，建议先采用等比缩放，不做复杂响应式重排：

```ts
const scale = Math.min(viewportWidth / 560, viewportHeight / 360);
const rootWidth = 560 * scale;
const rootHeight = 360 * scale;
const offsetX = (viewportWidth - rootWidth) / 2;
const offsetY = (viewportHeight - rootHeight) / 2;
```

除非后续单独设计窄屏 / 宽屏变体，否则所有尺寸、间距、圆角、阴影、模糊半径均按 `scale` 等比缩放。

---

## 3. Design Tokens

### 3.1 色彩规范

| Token | 用途 | 值 |
|---|---|---:|
| `--color-primary` | 主色 / i 标识 / 发送按钮 | `#FF8A00` |
| `--color-primary-hover` | 发送按钮 hover | `#FF9A1A` |
| `--color-primary-active` | 发送按钮 active | `#F07800` |
| `--color-user-bubble-bg` | 用户气泡背景 | `rgba(255,244,232,0.8)` |
| `--color-ichan-bubble-bg` | i酱气泡背景 | `rgba(255,255,255,0.6)` |
| `--color-input-bg` | 输入区背景 | `rgba(255,255,255,0.4)` |
| `--color-window-bg` | 对话窗口背景 | `rgba(255,255,255,0.35)` |
| `--color-border-glass` | 毛玻璃边框 | `rgba(255,255,255,0.35)` |
| `--color-bubble-border` | i酱气泡边框 | `rgba(255,255,255,0.5)` |
| `--color-user-border` | 用户气泡边框 | `rgba(255,184,115,0.35)` |
| `--color-text-primary` | 正文主文本 | `#1E1E1E` |
| `--color-text-secondary` | 次级文本 / 名称 | `#6B7280` |
| `--color-text-placeholder` | 输入提示文本 | `#9CA3AF` |
| `--color-send-disabled` | 发送按钮禁用背景 | `#BFBFBF` |
| `--color-white` | 图标 / 按钮文字 | `#FFFFFF` |

### 3.2 字体规范

字体族：

```css
font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

| Token | 用途 | 字号 | 字重 | 行高 |
|---|---|---:|---:|---:|
| `--font-title` | 设计稿标题 / 文档展示标题 | `20px` | `700` | `28px` |
| `--font-section-title` | 标注区小标题 | `13px` | `700` | `20px` |
| `--font-bubble-name` | 气泡内角色名 | `11px` | `600` | `16px` |
| `--font-bubble-time` | 气泡内时间 | `11px` | `400` | `16px` |
| `--font-bubble-body` | 气泡正文 | `13px` | `500` | `20px` |
| `--font-input` | 输入框文本 | `13px` | `400` | `20px` |
| `--font-state-caption` | 状态示例说明 | `12px` | `500` | `18px` |

### 3.3 圆角规范

| Token | 用途 | 值 |
|---|---|---:|
| `--radius-window` | 整体容器 | `16px` |
| `--radius-bubble` | 普通气泡 | `12px` |
| `--radius-input` | 输入区 | `12px` |
| `--radius-send` | 发送按钮 | `8px` |
| `--radius-icon-button` | 表情按钮 | `999px` |
| `--radius-state-card` | 状态示例卡片 | `8px` |

### 3.4 间距规范

基础单位：`4px` 与 `8px` 混用，其中主布局优先使用 `8px`。

| Token | 值 |
|---|---:|
| `--space-2xs` | `2px` |
| `--space-xs` | `4px` |
| `--space-sm` | `8px` |
| `--space-md` | `12px` |
| `--space-lg` | `16px` |
| `--space-xl` | `20px` |
| `--space-2xl` | `24px` |
| `--space-3xl` | `32px` |

### 3.5 阴影与毛玻璃规范

| Token | 用途 | CSS |
|---|---|---|
| `--blur-window` | 整体窗口毛玻璃 | `blur(20px) saturate(1.15)` |
| `--blur-bubble` | 气泡毛玻璃 | `blur(10px) saturate(1.1)` |
| `--shadow-window` | 整体窗口阴影 | `0 18px 48px rgba(0,0,0,0.12)` |
| `--shadow-bubble` | 气泡悬浮阴影 | `0 8px 24px rgba(0,0,0,0.08)` |
| `--shadow-user-bubble` | 用户气泡橙色柔光 | `0 8px 24px rgba(255,138,0,0.15)` |
| `--shadow-pet` | 宠物投影 | `0 10px 18px rgba(0,0,0,0.18)` |
| `--shadow-send` | 发送按钮阴影 | `0 4px 12px rgba(255,138,0,0.28)` |

---

## 4. 页面结构

```text
TalkingInteractionRoot
├── LiquidGlassBackground
└── InteractiveBox
    ├── WindowHeader
    │   ├── BrandMark: i
    │   ├── Title: i酱
    │   └── WindowControls
    │       ├── MinimizeButton
    │       └── CloseButton
    ├── DialogStage
    │   ├── PetAvatar / PetAnimation
    │   ├── IchanMessageBubble[]
    │   └── UserMessageBubble[]
    └── InputBar
        ├── MessageInput
        ├── EmojiButton
        └── SendButton
```

---

## 5. 全局布局坐标

下表以 `interactive_box = 560 × 360` 逻辑坐标描述。坐标为实现推荐值，允许 ±2px 视觉微调。

| 区块 | x | y | w | h | 说明 |
|---|---:|---:|---:|---:|---|
| `InteractiveBox` | `0` | `0` | `560` | `360` | 主毛玻璃窗口 |
| `WindowHeader` | `20` | `20` | `520` | `28` | 品牌、标题、窗口控制 |
| `DialogStage` | `20` | `58` | `520` | `244` | 宠物与对话气泡区域 |
| `PetAvatar` | `54` | `128` | `150` | `136` | 主宠物展示区，像素风渲染 |
| `IchanMessageBubble.top` | `198` | `62` | `206` | `60` | 第一条 i酱消息 |
| `UserMessageBubble` | `288` | `142` | `236` | `68` | 用户消息，右对齐 |
| `IchanMessageBubble.bottom` | `198` | `230` | `230` | `60` | 第二条 i酱消息 |
| `InputBar` | `20` | `304` | `520` | `48` | 输入区 + 表情 + 发送 |
| `MessageInput` | `32` | `316` | `368` | `24` | 输入文本区域 |
| `EmojiButton` | `420` | `312` | `32` | `32` | 表情按钮 |
| `SendButton` | `464` | `310` | `48` | `40` | 发送按钮 |

### 5.1 主容器边距锁定

| 关系 | 值 |
|---|---:|
| `InteractiveBox` 内边距 | `20px 20px` |
| `WindowHeader` 顶部边距 | `20px` |
| `InputBar` 左右边距 | `20px` |
| `InputBar` 底部边距 | `8px` |
| `PetAvatar` 与左边距 | `54px` |
| 气泡列起始 x | `198px` |
| 用户气泡右边距 | `36px` |
| `InputBar` 与 `DialogStage` 间距 | `2px–8px`，以不压迫底部气泡为准 |

---

## 6. 背景与整体容器

### 6.1 LiquidGlassBackground

背景不属于业务窗口本体，但用于营造悬浮液态玻璃观感。实现时可置于 Tauri 透明窗口内层。

```css
.talking-bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 18% 28%, rgba(255, 138, 0, 0.14), transparent 28%),
    radial-gradient(circle at 78% 22%, rgba(255, 198, 120, 0.16), transparent 32%),
    radial-gradient(circle at 20% 88%, rgba(90, 120, 140, 0.14), transparent 30%),
    linear-gradient(135deg, rgba(245,248,252,0.4), rgba(255,246,238,0.35));
  backdrop-filter: blur(12px);
}
```

### 6.2 InteractiveBox

| 参数 | 值 |
|---|---:|
| 尺寸 | `560 × 360px` |
| 圆角 | `16px` |
| 背景 | `rgba(255,255,255,0.35)` |
| 毛玻璃 | `backdrop-filter: blur(20px) saturate(1.15)` |
| 边框 | `1px solid rgba(255,255,255,0.35)` |
| 阴影 | `0 18px 48px rgba(0,0,0,0.12)` |
| 内边距 | `20px 20px` |
| overflow | `hidden` |

```css
.interactive-box {
  position: relative;
  width: 560px;
  height: 360px;
  border-radius: var(--radius-window);
  background: rgba(255,255,255,0.35);
  border: 1px solid rgba(255,255,255,0.35);
  box-shadow: var(--shadow-window);
  backdrop-filter: blur(20px) saturate(1.15);
  -webkit-backdrop-filter: blur(20px) saturate(1.15);
  overflow: hidden;
}
```

---

## 7. Header 区域

### 7.1 WindowHeader

| 参数 | 值 |
|---|---:|
| 位置 | `x: 20px; y: 20px` |
| 尺寸 | `520 × 28px` |
| 布局 | flex row，垂直居中 |
| drag region | 建议 header 空白区启用 `data-tauri-drag-region` |

### 7.2 BrandMark

| 参数 | 值 |
|---|---:|
| 内容 | `i` 图形标识 |
| 推荐位置 | `x: 22px; y: 20px` |
| 尺寸 | `16 × 24px` |
| 颜色 | `#FF8A00` |
| 说明 | 可用 SVG 或文本绘制；需保持与宠物头顶 i 标识一致 |

### 7.3 Title

| 参数 | 值 |
|---|---:|
| 内容 | `i酱` |
| 推荐位置 | `x: 44px; y: 22px` |
| 字体 | `16px / 600` |
| 颜色 | `#1E1E1E` |

### 7.4 WindowControls

本设计稿仅保留最小化与关闭按钮，不显示最大化按钮。

| 元素 | 推荐位置 | 尺寸 | 颜色 | 说明 |
|---|---:|---:|---|---|
| `MinimizeButton` | `x: 494px; y: 20px` | `20 × 20px` | `#333333` | 横线图标 |
| `CloseButton` | `x: 524px; y: 20px` | `20 × 20px` | `#333333` | X 图标 |

交互规则：

| 操作 | 行为 |
|---|---|
| 点击最小化 | 隐藏 / 收起 `interactive_box`，但不退出应用 |
| 点击关闭 | 关闭对话 UI，后续接入 talking 正常退出机制后派发 `dialog.close` |
| 拖拽 Header 空白处 | 移动窗口 |

---

## 8. 宠物展示区 PetAvatar

### 8.1 PetAvatar 参数

| 参数 | 值 |
|---|---:|
| 推荐位置 | `x: 54px; y: 128px` |
| 推荐显示尺寸 | `150 × 136px` |
| 图像渲染 | `image-rendering: pixelated` |
| 投影 | `drop-shadow(0 10px 18px rgba(0,0,0,0.18))` |
| 资源状态 | 等待 / 倾听时可用 `idle.awake`；回复时可用 `talk` |

### 8.2 动画资源映射

| UI 状态 | 推荐动画 | 说明 |
|---|---|---|
| `waiting` | `idle.awake` loop | i酱等待用户输入 |
| `user_typing` | `idle.awake` loop | 维持清醒待机；可略微降低浮动幅度 |
| `sending` | `talk` loop 或 `idle.awake` | 用户刚发送时的短暂停顿 |
| `ichan_replying` | `talk` loop | i酱生成 / 回复中 |
| `conversation_done` | `idle.awake` loop | 对话准备结束 |

### 8.3 实现约束

- 宠物图片必须使用最近邻渲染，避免像素边缘被插值模糊；
- 宠物本体不作为输入区的一部分，不遮挡气泡；
- 宠物阴影为椭圆地面阴影，可作为 CSS pseudo-element 实现；
- `talking` 当前在状态机侧仅为 loop 状态，UI 不应假设已有完整 exit 动画。

```css
.pet-avatar {
  position: absolute;
  left: 54px;
  top: 128px;
  width: 150px;
  height: 136px;
  object-fit: contain;
  image-rendering: pixelated;
  filter: drop-shadow(0 10px 18px rgba(0,0,0,0.18));
}
```

---

## 9. 消息气泡规范

### 9.1 气泡共通结构

```text
MessageBubble
├── BubbleHeader
│   ├── SpeakerMark / Name
│   └── Time
└── BubbleContent
```

### 9.2 i酱气泡 `ichan_message`

| 参数 | 值 |
|---|---:|
| 背景 | `rgba(255,255,255,0.6)` |
| 毛玻璃 | `blur(10px)` |
| 圆角 | `12px` |
| 边框 | `1px solid rgba(255,255,255,0.5)` |
| 阴影 | `0 8px 24px rgba(0,0,0,0.08)` |
| 内边距 | `12px 16px` |
| 正文字体 | `13px / 500` |
| 正文颜色 | `#1E1E1E` |
| 时间字体 | `11px / 400` |
| 时间颜色 | `#9CA3AF` |
| 气泡尾巴 | 左下角，指向 i酱 |

推荐尺寸：

| 变体 | x | y | w | h | 示例文案 |
|---|---:|---:|---:|---:|---|
| `ichan_message.top` | `198` | `62` | `206` | `60` | `早上好！昨晚休息得怎么样？` |
| `ichan_message.bottom` | `198` | `230` | `230` | `60` | `太好了！精神满满的一天要开始啦！` |
| `ichan_message.long` | `198` | `186` | `260` | `96–132` | 长文本自动换行 |

```css
.ichan-message {
  position: absolute;
  min-width: 180px;
  max-width: 260px;
  padding: 12px 16px;
  border-radius: 12px;
  background: rgba(255,255,255,0.6);
  border: 1px solid rgba(255,255,255,0.5);
  box-shadow: 0 8px 24px rgba(0,0,0,0.08);
  backdrop-filter: blur(10px);
}

.ichan-message::after {
  content: '';
  position: absolute;
  left: 0;
  bottom: 8px;
  width: 14px;
  height: 14px;
  background: inherit;
  border-left: inherit;
  border-bottom: inherit;
  transform: translateX(-5px) rotate(45deg);
}
```

### 9.3 用户气泡 `my_message`

| 参数 | 值 |
|---|---:|
| 背景 | `rgba(255,244,232,0.8)` |
| 毛玻璃 | `blur(10px)` |
| 圆角 | `12px` |
| 边框 | `1px solid rgba(255,184,115,0.35)` |
| 阴影 | `0 8px 24px rgba(255,138,0,0.15)` |
| 内边距 | `12px 16px` |
| 正文字体 | `13px / 500` |
| 正文颜色 | `#1E1E1E` |
| 时间字体 | `11px / 400` |
| 时间颜色 | `#9CA3AF` |
| 已读标识 | `#FF8A00`，右对齐 |
| 气泡尾巴 | 右下角，指向用户侧 |

推荐尺寸：

| 变体 | x | y | w | h | 示例文案 |
|---|---:|---:|---:|---:|---|
| `my_message.normal` | `288` | `142` | `236` | `68` | `睡得还不错，做了个好梦~` |
| `my_message.short` | `336` | `142` | `160` | `54` | `明明，知道了` |
| `my_message.long` | `258` | `140` | `266` | `96–132` | 长文本自动换行 |

```css
.my-message {
  position: absolute;
  min-width: 140px;
  max-width: 266px;
  padding: 12px 16px;
  border-radius: 12px;
  background: rgba(255,244,232,0.8);
  border: 1px solid rgba(255,184,115,0.35);
  box-shadow: 0 8px 24px rgba(255,138,0,0.15);
  backdrop-filter: blur(10px);
}

.my-message::after {
  content: '';
  position: absolute;
  right: 0;
  bottom: 8px;
  width: 14px;
  height: 14px;
  background: inherit;
  border-right: inherit;
  border-bottom: inherit;
  transform: translateX(5px) rotate(-45deg);
}
```

### 9.4 气泡文字规范

| 元素 | 内容示例 | 字体 | 颜色 | 说明 |
|---|---|---|---|---|
| i酱名称 | `i酱` | `11px / 600` | `#6B7280` | 左侧含橙色 i 标识 |
| 用户名称 | `我` | `11px / 600` | `#FF8A00` | 用户消息内左上角 |
| 时间 | `10:30` | `11px / 400` | `#9CA3AF` | 与名称同行 |
| 正文 | `文本内容...` | `13px / 500` | `#1E1E1E` | 自动换行 |
| 已读 | `已读` | `11px / 500` | `#FF8A00` | 用户气泡可选，右下角 |

### 9.5 气泡堆叠规则

```ts
export interface BubbleLayoutRule {
  maxVisibleMessages: 3;
  fadeOutAfterMs: 4500;
  verticalGap: 18;
  ichanAlign: 'left-of-dialog-column';
  userAlign: 'right';
  longTextMaxHeight: 132;
  longTextOverflow: 'auto' | 'expand-upward';
}
```

规则：

1. 活跃态最多同时显示 3 条气泡；
2. 新消息出现时，旧消息向上或向下错位，避免遮挡宠物主体；
3. i酱消息默认靠中左，用户消息默认靠右；
4. 长文本优先增加气泡高度，不超过 `132px`；
5. 超出高度时启用内部滚动或进入回看模式；
6. 活跃消息数秒后淡出，滚轮触发历史回看模式。

---

## 10. 输入区 `message_box + send`

### 10.1 InputBar 参数

| 参数 | 值 |
|---|---:|
| 位置 | `x: 20px; y: 304px` |
| 尺寸 | `520 × 48px` |
| 背景 | `rgba(255,255,255,0.4)` |
| 毛玻璃 | `blur(10px)` |
| 圆角 | `12px` |
| 边框 | `1px solid rgba(255,255,255,0.5)` |
| 内边距 | `12px 16px` |

```css
.input-bar {
  position: absolute;
  left: 20px;
  bottom: 8px;
  width: 520px;
  height: 48px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 10px 0 16px;
  border-radius: 12px;
  background: rgba(255,255,255,0.4);
  border: 1px solid rgba(255,255,255,0.5);
  backdrop-filter: blur(10px);
}
```

### 10.2 MessageInput

| 参数 | 值 |
|---|---:|
| 推荐位置 | `x: 32px; y: 316px` |
| 推荐尺寸 | `368 × 24px` |
| 背景 | transparent |
| 边框 | none |
| 字体 | `13px / 400` |
| 正文颜色 | `#1E1E1E` |
| placeholder | `输入消息...` |
| placeholder 颜色 | `#9CA3AF` |
| 单行 / 多行 | v2.1 默认单行，后续可扩展 textarea |

### 10.3 EmojiButton

| 参数 | 值 |
|---|---:|
| 位置 | `x: 420px; y: 312px` |
| 尺寸 | `32 × 32px` |
| 背景 | `rgba(255,255,255,0.7)` |
| 图标 | smile，线宽 2px |
| 图标颜色 | `#333333` |
| 圆角 | `999px` |
| hover 背景 | `rgba(255,255,255,0.9)` |

### 10.4 SendButton

| 参数 | 默认态 | 悬停态 | 禁用态 |
|---|---:|---:|---:|
| 尺寸 | `48 × 40px` | `48 × 40px` | `48 × 40px` |
| 圆角 | `8px` | `8px` | `8px` |
| 背景 | `#FF8A00` | `#FF9A1A` | `#BFBFBF` |
| 图标 | 白色箭头 | 白色箭头 | 白色箭头，opacity 0.7 |
| 阴影 | `0 4px 12px rgba(255,138,0,0.28)` | 更强 | none |
| transform | none | `translateY(-1px)` | none |

```css
.send-button {
  width: 48px;
  height: 40px;
  border: 0;
  border-radius: 8px;
  background: #FF8A00;
  color: #FFFFFF;
  box-shadow: 0 4px 12px rgba(255,138,0,0.28);
  display: grid;
  place-items: center;
  cursor: pointer;
}

.send-button:disabled {
  background: #BFBFBF;
  box-shadow: none;
  cursor: not-allowed;
}
```

---

## 11. 发送按钮状态

| 状态 | 触发条件 | 表现 | 是否可点击 |
|---|---|---|---|
| `default` | 输入框非空，未发送中 | 橙色背景，白色箭头 | 是 |
| `hover` | 鼠标悬停 | 背景略亮，轻微上浮 | 是 |
| `active` | 鼠标按下 | 背景略深，轻微下沉 | 是 |
| `disabled` | 输入为空 / 服务忙 / 对话不可发送 | 灰色背景 | 否 |
| `sending` | 用户已点击发送，等待本地写入或服务响应 | 可显示 loading 或保持禁用 | 否 |

推荐 TypeScript：

```ts
export type SendButtonState = 'default' | 'hover' | 'active' | 'disabled' | 'sending';

export function getSendButtonState(input: string, busy: boolean): SendButtonState {
  if (busy) return 'sending';
  if (!input.trim()) return 'disabled';
  return 'default';
}
```

---

## 12. 对话状态示例

设计稿底部状态示例共 7 类，建议作为 UI 验收用例。

| 编号 | 状态 | UI 表现 | 说明 |
|---:|---|---|---|
| 1 | `waiting_ichan_typing` | i酱气泡显示“正在思考中...”，下方显示橙色省略点 | 等待 i酱生成回复 |
| 2 | `user_typing` | 输入框内有文字，发送按钮可用 | 用户正在输入 |
| 3 | `message_sent` | 用户气泡出现，输入框清空 | 消息发送成功 |
| 4 | `ichan_replying` | i酱气泡出现，可能显示回复文本或省略点 | i酱正在回复 |
| 5 | `long_text_wrap` | i酱长文本气泡自动增高并换行 | 长文本展示 |
| 6 | `ichan_typing` | i酱短气泡显示 `i酱...`，可叠加 loading dots | 回复生成中 |
| 7 | `conversation_done` | i酱给出结束语，准备结束会话 | 对话完成 |

### 12.1 DialogUiState

```ts
export type DialogUiState =
  | 'idle'
  | 'waiting_ichan_typing'
  | 'user_typing'
  | 'message_sent'
  | 'ichan_replying'
  | 'long_text_wrap'
  | 'ichan_typing'
  | 'conversation_done'
  | 'history_review';
```

### 12.2 状态机与 UI 状态的关系

```ts
export interface TalkingInteractionState {
  isOpen: boolean;
  dialogState: DialogUiState;
  inputValue: string;
  busy: boolean;
  messages: ChatBubbleViewModel[];
  activeSessionId: string;
}
```

说明：

- `DialogUiState` 是 UI 层状态，不直接等同于项目三层状态机中的 `MajorState`；
- 当 `interactive_box` 打开时，项目状态机中的主行为应进入或维持 `talking`；
- 当 UI 关闭时，后续接入 Phase B talking 正常退出机制后，应由集成层派发候选 `dialog.close` 事件；
- 当前文档不修改 `MajorState` 定义。

---

## 13. 数据结构

### 13.1 消息模型

```ts
export type ChatRole = 'ichan' | 'user' | 'system';

export interface ChatBubbleViewModel {
  id: string;
  role: Exclude<ChatRole, 'system'>;
  content: string;
  createdAtIso: string;
  displayTime: string;      // HH:mm
  status?: 'pending' | 'sent' | 'read' | 'failed';
  ephemeral?: boolean;      // 是否数秒后淡出
}
```

### 13.2 输入动作

```ts
export type InteractiveBoxAction =
  | { type: 'send'; text: string }
  | { type: 'close'; reason: 'user' | 'timeout' | 'service_done' | 'error' }
  | { type: 'scroll_review'; direction: 'up' | 'down' }
  | { type: 'emoji.open' };
```

### 13.3 打开入口

```ts
export interface InteractiveBoxOpenInput {
  source: 'shortcut' | 'doubleClick' | 'morningRitual';
  windowExpandedSize: { width: 560; height: 360 };
}
```

---

## 14. 交互规则

### 14.1 打开规则

| 入口 | 行为 |
|---|---|
| `Ctrl+Alt+T` | 打开 / 聚焦 `interactive_box` |
| 双击宠物 | 打开 `interactive_box`，进入 talking loop |
| 晨间仪式 | 自动打开，作为晨间对话承载容器 |

### 14.2 发送规则

1. 输入为空时，发送按钮禁用；
2. 用户按 Enter 发送；
3. Shift + Enter 暂不启用，v2.1 默认单行输入；
4. 发送后立即生成用户气泡；
5. 输入框清空；
6. 写入本地 `chat_messages`；
7. 调用 DeepSeekService；
8. 返回结果后生成 i酱气泡；
9. 若服务失败，显示错误气泡，不让窗口崩溃。

### 14.3 淡出与回看规则

```ts
export const ACTIVE_MESSAGE_FADE = {
  enabled: true,
  delayMs: 4500,
  durationMs: 220,
  preserveLatestCount: 1,
};
```

规则：

- 普通活跃消息在 `4500ms` 后降低透明度或淡出；
- 最新一条 i酱回复默认保留；
- 用户滚轮向上时进入 `history_review`；
- 回看模式从 SQLite `chat_messages` 读取历史；
- 用户发送新消息时退出回看模式，回到活跃对话态。

### 14.4 关闭规则

| 关闭来源 | 结果 |
|---|---|
| 用户点击 X | 关闭 UI，后续派发 `dialog.close: user` |
| Esc | 关闭 UI，后续派发 `dialog.close: user` |
| 服务返回 `conversation_done` | 延迟 1200–1800ms 后关闭或等待用户确认 |
| 错误 | 不自动关闭，显示错误气泡 |

---

## 15. 与项目状态机的对接边界

### 15.1 现有约束

- `talking` 当前只开放 `loop`；
- 当前阶段不假设 talking 已存在自然退出动画；
- UI 层不直接修改状态机内部字段；
- 所有状态变化应通过集成层统一派发事件。

### 15.2 建议接入事件

当前文档不强制修改接口，但为 Phase B 集成保留以下候选事件：

```ts
export type DialogPetEventProposal =
  | { type: 'dialog.open'; source: 'shortcut' | 'doubleClick' | 'morningRitual' }
  | { type: 'dialog.close'; reason: 'user' | 'timeout' | 'service_done' | 'error' };
```

### 15.3 状态对照表

| UI 行为 | StateMachine 期望状态 | 动画 |
|---|---|---|
| 打开对话框 | `major = talking` | `talking.loop` |
| 等待用户输入 | `major = talking` | `idle.awake` 或 `talking.loop`，由 UI 表现策略决定 |
| i酱回复中 | `major = talking` | `talking.loop` |
| 用户关闭对话 | 后续回 `idle.awake` | 当前需 Phase B talking exit 机制闭合 |
| 投喂 / 提醒打断 | 按现有高优先级事件切出 | eating / reminding |

---

## 16. React / CSS 实现建议

### 16.1 组件拆分

```text
src/components/Dialog/
├── TalkingInteraction.tsx
├── TalkingInteraction.css
├── InteractiveBox.tsx
├── DialogStage.tsx
├── MessageBubble.tsx
├── InputBar.tsx
├── SendButton.tsx
├── dialog-types.ts
└── dialog-tokens.ts
```

### 16.2 CSS Token 样例

```css
:root {
  --color-primary: #FF8A00;
  --color-primary-hover: #FF9A1A;
  --color-primary-active: #F07800;
  --color-user-bubble-bg: rgba(255,244,232,0.8);
  --color-ichan-bubble-bg: rgba(255,255,255,0.6);
  --color-input-bg: rgba(255,255,255,0.4);
  --color-window-bg: rgba(255,255,255,0.35);
  --color-border-glass: rgba(255,255,255,0.35);
  --color-text-primary: #1E1E1E;
  --color-text-secondary: #6B7280;
  --color-text-placeholder: #9CA3AF;
  --radius-window: 16px;
  --radius-bubble: 12px;
  --radius-input: 12px;
  --radius-send: 8px;
  --font-family-base: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --shadow-window: 0 18px 48px rgba(0,0,0,0.12);
  --shadow-bubble: 0 8px 24px rgba(0,0,0,0.08);
  --shadow-user-bubble: 0 8px 24px rgba(255,138,0,0.15);
}
```

### 16.3 主组件骨架

```tsx
export function TalkingInteraction(props: TalkingInteractionProps) {
  const {
    messages,
    inputValue,
    busy,
    onInputChange,
    onSend,
    onClose,
  } = props;

  const canSend = inputValue.trim().length > 0 && !busy;

  return (
    <div className="interactive-box">
      <header className="window-header" data-tauri-drag-region>
        <div className="brand-mark">i</div>
        <div className="window-title">i酱</div>
        <div className="window-controls">
          <button className="window-minimize" aria-label="minimize" />
          <button className="window-close" aria-label="close" onClick={onClose} />
        </div>
      </header>

      <DialogStage messages={messages} busy={busy} />

      <InputBar
        value={inputValue}
        disabled={busy}
        canSend={canSend}
        onChange={onInputChange}
        onSend={() => onSend(inputValue)}
      />
    </div>
  );
}
```

---

## 17. 验收标准

### 17.1 视觉验收

| 项 | 标准 |
|---|---|
| 主容器 | 尺寸为 `560 × 360px`，圆角 `16px`，毛玻璃质感明确 |
| 气泡 | i酱气泡白色半透明，用户气泡浅橙半透明 |
| 输入区 | 宽度与主窗口内边距对齐，发送按钮为 `48 × 40px` |
| 宠物 | 像素边缘清晰，无模糊插值 |
| 层级 | 宠物、气泡、输入区不互相遮挡 |
| 装饰 | 不出现星星、爱心、信号标识等非必要装饰 |
| 窗口控制 | 仅保留最小化与关闭，不显示最大化方框 |

### 17.2 交互验收

| 项 | 标准 |
|---|---|
| 输入为空 | 发送按钮禁用 |
| 输入非空 | 发送按钮可点击 |
| 点击发送 | 用户气泡立即出现，输入框清空 |
| i酱回复中 | 出现 thinking / typing 状态 |
| 回复完成 | i酱气泡出现，文本正常换行 |
| 长文本 | 气泡自动增高，不突破窗口底部输入区 |
| 关闭 | UI 可关闭，状态机接入阶段应回到 idle |
| 回看 | 滚轮触发历史读取，不影响发送新消息 |

### 17.3 工程验收

| 项 | 标准 |
|---|---|
| 类型 | `DialogUiState`、`ChatBubbleViewModel`、`InteractiveBoxAction` 有明确类型定义 |
| 存储 | 消息写入 `chat_messages`，支持按 session 读取 |
| 服务 | DeepSeek 返回失败时 UI 显示错误气泡 |
| 状态机 | UI 不直接改内部状态，只通过事件桥接 |
| 样式 | token 化，不散落魔法颜色和尺寸 |

---

## 18. 当前版本锁定项

v2.1 设计稿中锁定以下内容：

1. `interactive_box` 尺寸：`560 × 360px`；
2. 主容器圆角：`16px`；
3. 主容器背景：`rgba(255,255,255,0.35)`；
4. 主容器毛玻璃：`20px`；
5. 主容器边框：`1px rgba(255,255,255,0.35)`；
6. 主容器内边距：`20px 20px`；
7. i酱气泡背景：`rgba(255,255,255,0.6)`；
8. 用户气泡背景：`rgba(255,244,232,0.8)`；
9. 气泡圆角：`12px`；
10. 气泡内边距：`12px 16px`；
11. 输入区背景：`rgba(255,255,255,0.4)`；
12. 输入区圆角：`12px`；
13. 发送按钮尺寸：`48 × 40px`；
14. 发送按钮默认背景：`#FF8A00`；
15. 文本主色：`#1E1E1E`；
16. 时间文本色：`#9CA3AF`；
17. 字体：`Inter / Medium`；
18. 正文字号：`13px`；
19. 时间字号：`11px`。

---

## 19. 后续待确认项

| 项 | 当前建议 | 是否阻塞实现 |
|---|---|---|
| talking 正常退出机制 | Phase B 任务 9 闭合 | 不阻塞 UI 静态实现，阻塞完整状态闭环 |
| 历史回看交互 | 滚轮进入，发送退出 | 不阻塞基础对话 |
| emoji 面板 | 先保留按钮，不实现面板 | 不阻塞 |
| 多行输入 | v2.1 先单行，后续扩展 textarea | 不阻塞 |
| 气泡自动布局算法 | 先使用固定三槽位，后续再做流式布局 | 不阻塞 |
| 窗口尺寸是否可拖拽 | v2.1 固定 560 × 360 | 不阻塞 |

---

## 20. 最小落地清单

若按最小可运行版本实现，建议优先落地以下文件：

```text
src/components/Dialog/TalkingInteraction.tsx
src/components/Dialog/TalkingInteraction.css
src/components/Dialog/MessageBubble.tsx
src/components/Dialog/InputBar.tsx
src/components/Dialog/dialog-types.ts
src/components/Dialog/dialog-tokens.ts
```

最小功能：

1. 固定显示 `560 × 360` 毛玻璃窗口；
2. 显示 i酱像素角色；
3. 支持 i酱气泡与用户气泡；
4. 支持输入与发送按钮状态；
5. 支持发送后追加本地消息；
6. 预留 DeepSeekService 与 ChatHistoryStore 接口；
7. 预留 `dialog.close` 事件桥接口。


## 21. 审计对齐补充（2026-04-27）
- B1-10 对话 UI 已落地，本文继续作为布局与交互 Schema 真值源。
- `dialog.close` 仍属于 B2-9 阶段候选事件，不作为当前已冻结公共接口。

