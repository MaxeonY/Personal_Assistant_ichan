# first_run_wizard_schema.md

> 来源：`UI_Design_Draft.png` 的标注参数 + `FirstRunWizard_UI.png` 的最终视觉效果。  
> 坐标基准：**1024 × 768，4:3，1x 逻辑像素**。当前两张 PNG 为约 2x 导出图，若从截图量像素，需约除以 2 后再落到本 schema。
> 版本：v1.1 - 2026-04-27（审计+落地对齐修订，B1-7 已落地）。

---

## 1. 设计目标

首次启动配置向导用于采集并验证以下本地配置：

1. `notionToken`
2. `todoDbId`
3. `researchDbId`
4. `deepseekApiKey`

视觉目标：

- 毛玻璃卡片式窗口；
- 暖橙色主色；
- 像素宠物头像作为品牌识别；
- 表单为主，减少非必要装饰；
- 所有配置项均显示验证状态；
- 底部提供说明提示栏、测试连接按钮、完成按钮。

---

## 2. 画布与缩放基准

```ts
export const FIRST_RUN_CANVAS = {
  width: 1024,
  height: 768,
  aspectRatio: '4:3',
  coordinateUnit: 'logical-px',
  exportScale: 2,
};
```

### 2.1 响应式缩放规则

若运行窗口不是 1024 × 768，建议使用等比缩放：

```ts
const scale = Math.min(viewportWidth / 1024, viewportHeight / 768);
const rootWidth = 1024 * scale;
const rootHeight = 768 * scale;
const offsetX = (viewportWidth - rootWidth) / 2;
const offsetY = (viewportHeight - rootHeight) / 2;
```

除非后续单独做响应式布局，否则所有尺寸、间距、圆角、阴影均按 `scale` 等比缩放。

---

## 3. Design Tokens

### 3.1 色彩规范

| Token | 用途 | Hex |
|---|---|---:|
| `--color-primary` | 主色 / 当前步骤 / 主按钮起始色 | `#FF8C42` |
| `--color-primary-dark` | 主按钮 hover / 渐变结束色 | `#FF6B1A` |
| `--color-success` | 验证成功图标与文字 | `#22C55E` |
| `--color-text-primary` | 标题 / 主文本 | `#2B1A12` |
| `--color-text-secondary` | 次级文本 | `#6B5A4E` |
| `--color-text-tertiary` | 弱文本 / 控件弱态 | `#8A7F75` |
| `--color-border` | 卡片、输入框、分割线 | `#E6E2DE` |
| `--color-bg` | 主卡片背景 | `#FFFFFF` |
| `--color-bg-light` | 提示栏浅橙背景 | `#FFF7EE` |
| `--color-page-bg` | 页面底色 | `#FDF9F6` |
| `--color-hint-border` | 提示栏边框 | `#FEEAD6` |
| `--color-secondary-button-border` | 次要按钮边框 | `#FFE0CC` |
| `--color-success-bg` | 成功图标浅底 | `#E8F9EE` |

### 3.2 字体规范

字体族：`Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`

| Token | 用途 | 字号 | 字重 |
|---|---|---:|---:|
| `--font-title` | 标题 | `20px` | `600` |
| `--font-subtitle` | 副标题 | `13px` | `400` |
| `--font-label` | 表单主标签 | `13px` | `500` |
| `--font-body` | 正文 / 输入框 | `13px` | `400` |
| `--font-helper` | 辅助说明 | `11px` | `400` |
| `--font-button` | 按钮文字 | `15px` | `600` |
| `--font-step` | 步骤数字 | `12px` | `500` |

### 3.3 圆角规范

| Token | 用途 | 值 |
|---|---|---:|
| `--radius-window` | 主窗口大圆角 | `16px` |
| `--radius-card` | 表单卡片 / 提示栏 | `12px` |
| `--radius-button` | 按钮 | `10px` |
| `--radius-input` | 输入框 | `8px` |
| `--radius-step` | 步骤圆点 | `999px` |

### 3.4 间距规范

基础单位：`8px`

| Token | 值 |
|---|---:|
| `--space-xs` | `4px` |
| `--space-sm` | `8px` |
| `--space-md` | `12px` |
| `--space-lg` | `16px` |
| `--space-xl` | `20px` |
| `--space-2xl` | `24px` |
| `--space-3xl` | `32px` |
| `--space-4xl` | `40px` |

### 3.5 阴影规范

| Token | 用途 | CSS |
|---|---|---|
| `--shadow-card` | 表单卡片 / 提示栏 | `0 8px 24px rgba(16, 24, 40, 0.08)` |
| `--shadow-button` | 主按钮 | `0 4px 12px rgba(16, 24, 40, 0.12)` |
| `--shadow-floating` | 宠物头像 / 悬浮元素 | `0 8px 20px rgba(16, 24, 40, 0.15)` |

---

## 4. 页面结构

```text
FirstRunWizardRoot
├── PageBackground
└── WizardWindow
    ├── WindowControls
    ├── HeaderArea
    │   ├── PetMascot
    │   └── TitleBlock
    ├── Stepper
    ├── ConfigFormCard
    │   ├── ConfigRow: Notion Integration Token
    │   ├── ConfigRow: Todo / Daily Plan 数据库 ID
    │   ├── ConfigRow: Research 数据库 ID
    │   └── ConfigRow: Deepseek API Key
    ├── HintBar
    │   ├── HintText
    │   └── SecondaryButton: 测试连接
    └── PrimaryActionButton: 完成，进入 i酱！
```

---

## 5. 全局布局坐标

下表以 `1024 × 768` 逻辑坐标描述。坐标为实现推荐值，允许 ±2px 视觉微调。

| 区块 | x | y | w | h | 说明 |
|---|---:|---:|---:|---:|---|
| `PageBackground` | `0` | `0` | `1024` | `768` | 全屏底色与模糊光斑 |
| `WizardWindow` | `46` | `34` | `932` | `700` | 主毛玻璃窗口 |
| `WindowControls` | `846` | `57` | `86` | `24` | 最小化 / 最大化 / 关闭 |
| `HeaderArea` | `154` | `82` | `560` | `110` | 宠物 + 标题文案 |
| `Stepper` | `350` | `181` | `470` | `64` | 三步骤进度条 |
| `ConfigFormCard` | `94` | `260` | `834` | `306` | 主表单卡片 |
| `HintBar` | `94` | `588` | `834` | `64` | 底部说明提示栏；与表单同宽 |
| `PrimaryActionButton` | `694` | `668` | `168` | `48` | 底部主按钮；靠右对齐 |

### 5.1 关键相对关系

| 关系 | 值 |
|---|---:|
| `WizardWindow` 距画布左边 | `46px` |
| `WizardWindow` 距画布上边 | `34px` |
| `ConfigFormCard` 距 `WizardWindow` 左边 | `48px` |
| `ConfigFormCard` 距 `WizardWindow` 右边 | `50px` |
| `HintBar` 与 `ConfigFormCard` 左右对齐 | `x = 94px, w = 834px` |
| `HintBar` 与 `ConfigFormCard` 垂直间距 | `22px` 推荐；可收敛到 `16px` |
| `PrimaryActionButton` 与 `HintBar` 垂直间距 | `16px` |
| `PrimaryActionButton` 右边距相对表单卡片 | `66px`；视觉上靠右但不贴边 |

---

## 6. 背景与主窗口

### 6.1 PageBackground

```css
.first-run-page {
  width: 1024px;
  height: 768px;
  background:
    radial-gradient(circle at 12% 8%, rgba(255, 140, 66, 0.18), transparent 26%),
    radial-gradient(circle at 90% 12%, rgba(255, 198, 120, 0.22), transparent 30%),
    radial-gradient(circle at 14% 88%, rgba(130, 170, 210, 0.16), transparent 28%),
    var(--color-page-bg);
}
```

### 6.2 WizardWindow

| 参数 | 值 |
|---|---:|
| 位置 | `left: 46px; top: 34px` |
| 尺寸 | `932 × 700px` |
| 背景 | `rgba(255, 255, 255, 0.72)` |
| backdrop filter | `blur(24px) saturate(1.2)` |
| 圆角 | `16px` |
| 边框 | `1px solid rgba(255,255,255,0.72)` |
| 阴影 | `0 20px 60px rgba(16,24,40,0.12)` |
| overflow | `hidden` 或 `visible`；若宠物阴影被裁切则用 `visible` |

---

## 7. 标题区 HeaderArea

### 7.1 PetMascot

| 参数 | 值 |
|---|---:|
| 推荐位置 | `x: 156px; y: 84px` |
| 推荐尺寸 | `108 × 108px` |
| 渲染方式 | `image-rendering: pixelated` |
| 阴影 | `--shadow-floating` |
| 素材 | 使用现有 i酱像素小人素材；不需要额外星形 / 爱心装饰素材 |

```css
.pet-mascot {
  width: 108px;
  height: 108px;
  object-fit: contain;
  image-rendering: pixelated;
  filter: drop-shadow(0 8px 20px rgba(16, 24, 40, 0.15));
}
```

### 7.2 TitleBlock

| 元素 | x | y | w | h | 字体 |
|---|---:|---:|---:|---:|---|
| `Title` | `328` | `105` | `260` | `30` | `20px / 600` |
| `Subtitle` | `328` | `149` | `420` | `22` | `13px / 400` |

文案：

```text
欢迎使用 i酱！
让我们一起完成首次配置，开启高效陪伴之旅吧！
```

---

## 8. 窗口控制按钮 WindowControls

| 元素 | 尺寸 | 间距 | 颜色 | 说明 |
|---|---:|---:|---|---|
| 最小化 | `16 × 16px` | `20px` | `#6B7280` | 横线图标 |
| 最大化 | `16 × 16px` | `20px` | `#6B7280` | 方框图标 |
| 关闭 | `16 × 16px` | - | `#6B7280` | X 图标 |

推荐以 CSS/SVG 绘制，不需要图片素材。

---

## 9. 步骤条 Stepper

### 9.1 Stepper 总体

| 参数 | 值 |
|---|---:|
| 区块位置 | `x: 350px; y: 181px` |
| 区块尺寸 | `470 × 64px` |
| 步骤圆点尺寸 | `24 × 24px` |
| 步骤圆点字号 | `12px / 500` |
| 步骤标签字号 | `13px / 500` |
| 连接线高度 | `1px` |
| 单段连接线推荐长度 | `156px` |
| 圆点与标签间距 | `8px` |
| 当前步骤圆点背景 | `#FF8C42` |
| 当前步骤文字 | `#FFFFFF` |
| 未完成步骤背景 | `#F5F5F5` |
| 未完成步骤边框 | `1px solid #E6E2DE` |
| 未完成步骤文字 | `#8A7F75` |

### 9.2 Step 坐标

| Step | 圆心 x | 圆心 y | 圆点 box | 标签 | 状态 |
|---|---:|---:|---|---|---|
| 1 | `374` | `201` | `362,189,24,24` | `配置集成` | active |
| 2 | `584` | `201` | `572,189,24,24` | `功能测试` | inactive |
| 3 | `794` | `201` | `782,189,24,24` | `完成` | inactive |

### 9.3 连接线

| 线段 | x | y | w | h | 样式 |
|---|---:|---:|---:|---:|---|
| Step1 → Step2 | `398` | `201` | `150` | `1` | `border-top: 1px dashed #C9C9C9` |
| Step2 → Step3 | `608` | `201` | `150` | `1` | `border-top: 1px dashed #C9C9C9` |

---

## 10. 表单卡片 ConfigFormCard

### 10.1 卡片参数

| 参数 | 值 |
|---|---:|
| 位置 | `x: 94px; y: 260px` |
| 尺寸 | `834 × 306px` |
| 背景 | `rgba(255,255,255,0.82)` |
| 毛玻璃 | `backdrop-filter: blur(16px)` |
| 圆角 | `12px` |
| 阴影 | `--shadow-card` |
| 内边距 | `24px 32px` |
| 行数 | `4` |
| 行高 | `64px` 内容区 + 分割线 |
| 分割线 | `1px solid #E6E2DE`，最后一行不显示 |

### 10.2 表单列布局

| 列 | x | w | 说明 |
|---|---:|---:|---|
| LabelColumn | `132` | `230` | 主标签 + 辅助标签 |
| InputColumn | `352` | `430` | 输入框 |
| StatusColumn | `826` | `66` | 成功图标 + “有效” |

相对卡片坐标：

```ts
const form = { x: 94, y: 260, w: 834, h: 306 };
const columns = {
  label: { x: form.x + 38, w: 230 },
  input: { x: form.x + 258, w: 430 },
  status: { x: form.x + 732, w: 66 },
};
```

### 10.3 行布局

| Row | y | h | Label 主文本 | Label 辅助文本 | Input y | Status y |
|---|---:|---:|---|---|---:|---:|
| 1 | `284` | `64` | `Notion Integration Token` | `（未四位明文）` | `286` | `300` |
| 2 | `360` | `64` | `Todo / Daily Plan 数据库 ID` | `数据库ID` | `362` | `376` |
| 3 | `436` | `64` | `Research 数据库 ID` | `数据库ID` | `438` | `452` |
| 4 | `512` | `64` | `Deepseek API Key` | 空 | `514` | `528` |

分割线：

| 分割线 | x | y | w | h |
|---|---:|---:|---:|---:|
| Line 1 | `124` | `348` | `774` | `1` |
| Line 2 | `124` | `424` | `774` | `1` |
| Line 3 | `124` | `500` | `774` | `1` |

### 10.4 输入框 InputField

| 参数 | 值 |
|---|---:|
| 尺寸 | `430 × 40px` |
| 内边距 | `12px 16px` |
| 圆角 | `8px` |
| 边框 | `1px solid #E6E2DE` |
| 背景 | `rgba(255,255,255,0.82)` |
| 文本字体 | `13px / 400` |
| 文本颜色 | `#2B1A12` |
| placeholder | `#8A7F75` |
| 密码掩码字符 | `•` |
| 右侧 eye icon | `16 × 16px`，颜色 `#8A7F75` |

敏感字段显示规则：

```ts
const maskValue = (value: string, visibleTail = 4) => {
  if (!value) return '';
  return '•'.repeat(Math.max(8, value.length - visibleTail)) + value.slice(-visibleTail);
};
```

### 10.5 状态图标 StatusBadge

| 参数 | 值 |
|---|---:|
| 图标尺寸 | `16 × 16px` |
| 图标颜色 | `#22C55E` |
| 图标浅底 | `#E8F9EE` |
| 图标内白色 check | `2px` stroke |
| 状态文字 | `有效` |
| 状态文字字体 | `13px / 500` |
| 状态文字颜色 | `#22C55E` |
| 图标与文字间距 | `8px` |

建议用 inline SVG，不需要图片素材。

---

## 11. 提示栏 HintBar

提示栏是本稿中需要重点锁定的元素：**与表单卡片同宽、左边缘对齐、位于表单卡片下方，右侧包含测试连接按钮**。

### 11.1 HintBar 参数

| 参数 | 值 |
|---|---:|
| 位置 | `x: 94px; y: 588px` |
| 尺寸 | `834 × 64px` |
| 与表单卡片关系 | `x` 与 `w` 完全一致 |
| 与表单卡片间距 | `22px`；实现可取 `16px` 或 `24px`，建议视觉锁定 `22px` |
| 背景 | `#FFF7EE` |
| 边框 | `1px solid #FEEAD6` |
| 圆角 | `12px` |
| 阴影 | `--shadow-card` |
| 内边距 | `16px 20px` |

### 11.2 HintText

| 参数 | 值 |
|---|---:|
| 位置 | `x: 132px; y: 604px` |
| 推荐文本宽度 | `560–640px` |
| 行高 | `20px` |
| 字体 | `13px / 400` |
| 颜色 | `#2B1A12` |

文案：

```text
点击“测试连接”将验证以上配置是否正确。
所有信息将安全保存，仅用于 i酱 的功能服务。
```

### 11.3 SecondaryButton：测试连接

| 参数 | 值 |
|---|---:|
| 推荐位置 | `x: 746px; y: 600px` |
| 标注尺寸 | `108 × 40px` |
| 视觉允许宽度 | `108–132px`，若中文字体较宽可扩到 `132px` |
| 垂直对齐 | 在 HintBar 内居中 |
| 内边距 | `0 16px` |
| 圆角 | `10px` |
| 背景 | `#FFFFFF` |
| 边框 | `1px solid #FFE0CC` |
| 文本 | `测试连接` |
| 文本字体 | `15px / 600` |
| 文本颜色 | `#FF8C42` |
| hover 背景 | `#FFF7EE` |
| active transform | `translateY(1px)` |

---

## 12. 主按钮 PrimaryActionButton

| 参数 | 值 |
|---|---:|
| 推荐位置 | `x: 694px; y: 668px` |
| 标注尺寸 | `168 × 48px` |
| 视觉允许宽度 | `168–216px`，取决于最终文案与字体渲染 |
| 内边距 | `0 20px` |
| 圆角 | `10px` |
| 背景 | `linear-gradient(180deg, #FF8C42 0%, #FF6B1A 100%)` |
| hover 背景 | `linear-gradient(180deg, #FF9A55 0%, #FF6B1A 100%)` |
| 阴影 | `--shadow-button` |
| 文本 | `完成，进入 i酱！` |
| 文本颜色 | `#FFFFFF` |
| 文本字体 | `15px / 600` |
| 禁用态背景 | `#E6E2DE` |
| 禁用态文字 | `#8A7F75` |

---

## 13. 状态与交互规则

### 13.1 Stepper 状态

```ts
type FirstRunStep = 'config' | 'test' | 'done';

const steps = [
  { id: 'config', index: 1, label: '配置集成' },
  { id: 'test', index: 2, label: '功能测试' },
  { id: 'done', index: 3, label: '完成' },
] as const;
```

当前设计图对应：

```ts
currentStep = 'config';
```

### 13.2 配置验证状态

```ts
type FieldValidationState = 'empty' | 'pending' | 'valid' | 'invalid';

interface FirstRunWizardFormState {
  notionToken: string;
  todoDbId: string;
  researchDbId: string;
  deepseekApiKey: string;
  validation: Record<
    'notionToken' | 'todoDbId' | 'researchDbId' | 'deepseekApiKey',
    FieldValidationState
  >;
}
```

状态显示规则：

| 状态 | 图标 | 文字 | 颜色 |
|---|---|---|---|
| `empty` | 无 | 无 | - |
| `pending` | spinner | `验证中` | `#8A7F75` |
| `valid` | check circle | `有效` | `#22C55E` |
| `invalid` | warning / x circle | `无效` | `#EF4444` |

### 13.3 按钮可用性

| 按钮 | enabled 条件 |
|---|---|
| `测试连接` | 四个字段均非空 |
| `完成，进入 i酱！` | 四个字段均为 `valid` |

### 13.4 密钥显示规则

- `notionToken`、`deepseekApiKey` 默认掩码；
- `todoDbId`、`researchDbId` 可明文；
- DeepSeek API Key 输入框右侧保留 eye icon；
- 点击 eye icon 仅切换本地显示，不改变保存值；
- 截图、日志、错误信息中不得输出完整 token / api key。

---

## 14. React / CSS 实现建议

### 14.1 组件拆分

```text
实际实现路径：src/wizard/components/FirstRunWizard/
（注：原设计建议为 src/components/FirstRunWizard/，
  实施时因独立窗口入口结构调整至 src/wizard/ 子目录）
├── FirstRunWizard.tsx
├── FirstRunWizard.css
├── WizardStepper.tsx
├── ConfigFormCard.tsx
├── ConfigRow.tsx
├── HintBar.tsx
└── tokens.ts
```

### 14.2 CSS Token 样例

```css
:root {
  --color-primary: #FF8C42;
  --color-primary-dark: #FF6B1A;
  --color-success: #22C55E;
  --color-text-primary: #2B1A12;
  --color-text-secondary: #6B5A4E;
  --color-text-tertiary: #8A7F75;
  --color-border: #E6E2DE;
  --color-bg: #FFFFFF;
  --color-bg-light: #FFF7EE;
  --color-page-bg: #FDF9F6;
  --color-hint-border: #FEEAD6;
  --font-family-base: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --radius-window: 16px;
  --radius-card: 12px;
  --radius-button: 10px;
  --radius-input: 8px;
  --shadow-card: 0 8px 24px rgba(16, 24, 40, 0.08);
  --shadow-button: 0 4px 12px rgba(16, 24, 40, 0.12);
  --shadow-floating: 0 8px 20px rgba(16, 24, 40, 0.15);
}
```

### 14.3 主布局 CSS 样例

```css
.first-run-root {
  position: relative;
  width: 1024px;
  height: 768px;
  overflow: hidden;
  font-family: var(--font-family-base);
  color: var(--color-text-primary);
}

.first-run-window {
  position: absolute;
  left: 46px;
  top: 34px;
  width: 932px;
  height: 700px;
  border-radius: var(--radius-window);
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.72);
  box-shadow: 0 20px 60px rgba(16, 24, 40, 0.12);
  backdrop-filter: blur(24px) saturate(1.2);
}

.config-form-card {
  position: absolute;
  left: 94px;
  top: 260px;
  width: 834px;
  height: 306px;
  border-radius: var(--radius-card);
  background: rgba(255, 255, 255, 0.82);
  box-shadow: var(--shadow-card);
  backdrop-filter: blur(16px);
}

.hint-bar {
  position: absolute;
  left: 94px;
  top: 588px;
  width: 834px;
  height: 64px;
  padding: 16px 20px;
  border-radius: var(--radius-card);
  background: var(--color-bg-light);
  border: 1px solid var(--color-hint-border);
  box-shadow: var(--shadow-card);
  box-sizing: border-box;
}
```

---

## 15. 资源需求

| 资源 | 是否需要独立素材 | 实现方式 |
|---|---|---|
| i酱像素小人 | 需要；已有素材可复用 | PNG / spritesheet，`image-rendering: pixelated` |
| 成功 check 图标 | 不需要图片素材 | SVG / CSS |
| eye 图标 | 不需要图片素材 | SVG / icon component |
| 窗口控制图标 | 不需要图片素材 | CSS / SVG |
| 星形、爱心等装饰 | 不需要 | 当前简洁版不使用 |
| 背景光斑 | 不需要图片素材 | CSS radial-gradient |
| 毛玻璃效果 | 不需要图片素材 | CSS `backdrop-filter` + 半透明背景 |

---

## 16. 验收清单

- [ ] 画布比例为 `4:3`，设计基准为 `1024 × 768`。
- [ ] 主窗口位置、尺寸接近 `46,34,932,700`。
- [ ] 表单卡片与提示栏完全同宽且左对齐：`x=94, w=834`。
- [ ] 提示栏高度为 `64px`，背景为 `#FFF7EE`，边框为 `#FEEAD6`。
- [ ] 表单包含 4 行，输入框高度 `40px`，圆角 `8px`。
- [ ] 成功状态图标为绿色 check，文字为 `有效`。
- [ ] `测试连接` 按钮位于提示栏右侧并垂直居中。
- [ ] 主按钮位于底部靠右，尺寸至少 `168 × 48px`。
- [ ] 不出现爱心、星形、信号标识等非必要装饰。
- [ ] Token / API Key 不明文泄露；默认仅显示尾部 4 位或全掩码。
- [ ] 字体层级符合 `20/13/11/15px` 规范。
- [ ] 毛玻璃窗口、卡片阴影、按钮阴影均可见但不过重。

---

## 17. 可直接使用的 TypeScript Schema

```ts
export const firstRunWizardSchema = {
  canvas: { width: 1024, height: 768, aspectRatio: '4:3' },
  colors: {
    primary: '#FF8C42',
    primaryDark: '#FF6B1A',
    success: '#22C55E',
    textPrimary: '#2B1A12',
    textSecondary: '#6B5A4E',
    textTertiary: '#8A7F75',
    border: '#E6E2DE',
    background: '#FFFFFF',
    bgLight: '#FFF7EE',
    pageBg: '#FDF9F6',
    hintBorder: '#FEEAD6',
    secondaryButtonBorder: '#FFE0CC',
  },
  radii: {
    window: 16,
    card: 12,
    button: 10,
    input: 8,
  },
  shadows: {
    card: '0 8px 24px rgba(16, 24, 40, 0.08)',
    button: '0 4px 12px rgba(16, 24, 40, 0.12)',
    floating: '0 8px 20px rgba(16, 24, 40, 0.15)',
  },
  layout: {
    window: { x: 46, y: 34, w: 932, h: 700 },
    header: { x: 154, y: 82, w: 560, h: 110 },
    mascot: { x: 156, y: 84, w: 108, h: 108 },
    title: { x: 328, y: 105, w: 260, h: 30 },
    subtitle: { x: 328, y: 149, w: 420, h: 22 },
    stepper: { x: 350, y: 181, w: 470, h: 64 },
    formCard: { x: 94, y: 260, w: 834, h: 306 },
    hintBar: { x: 94, y: 588, w: 834, h: 64 },
    secondaryButton: { x: 746, y: 600, w: 108, h: 40 },
    primaryButton: { x: 694, y: 668, w: 168, h: 48 },
  },
  form: {
    rowHeight: 76,
    input: { w: 430, h: 40, paddingX: 16, paddingY: 12 },
    rows: [
      { key: 'notionToken', label: 'Notion Integration Token', helper: '（未四位明文）' },
      { key: 'todoDbId', label: 'Todo / Daily Plan 数据库 ID', helper: '数据库ID' },
      { key: 'researchDbId', label: 'Research 数据库 ID', helper: '数据库ID' },
      { key: 'deepseekApiKey', label: 'Deepseek API Key', helper: '' },
    ],
  },
} as const;
```

---

## 15. 毛玻璃 CSS 方案（B1-7 视觉落地修正）

> 来源：`fix_summary.md` P2 修复。以下规则已在 `src/wizard/wizard.css` 落地。

### 15.1 `.first-run-page` 半透明背景

```css
.first-run-page {
  background: rgba(18, 22, 30, 0.75);        /* 原 1.0 → 0.75，增加通透感 */
  backdrop-filter: blur(40px) saturate(1.3);
  -webkit-backdrop-filter: blur(40px) saturate(1.3);
}
```

### 15.2 shimmer-drift 动画光晕层

```css
.first-run-page::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse 120% 80% at 50% 0%,
    rgba(255, 165, 60, 0.06),
    transparent 60%
  );
  animation: shimmer-drift 12s ease-in-out infinite;
  pointer-events: none;
}

@keyframes shimmer-drift {
  0%, 100% { opacity: 0.4; }
  50%      { opacity: 1; }
}
```

### 15.3 `.first-run-window` 通透毛玻璃

```css
.first-run-window {
  background: rgba(24, 28, 38, 0.55);         /* 原 0.72 → 0.55，更通透 */
  backdrop-filter: blur(32px);                 /* 原 24px → 32px */
  -webkit-backdrop-filter: blur(32px);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06),   /* 内发光边缘 */
              0 8px 32px rgba(0, 0, 0, 0.3);
}
```

### 15.4 设计意图

- **半透明背景 + backdrop-filter**：营造磨砂玻璃（frosted glass）质感，让底层桌面/窗口隐约可见
- **shimmer-drift 动画**：柔和的光晕呼吸效果，增添视觉深度而不喧宾夺主
- **inset box-shadow**：卡片内发光边缘，增强玻璃容器的边界感知

这些属于 B1-7 视觉落地后的有效修正，已纳入本 Schema 作为 CSS 长期规范。
