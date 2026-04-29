# FirstRunWizard 修复报告

## P0 ✅ 素材修正 — 使用正确的 `assets/idle/awake` 角色图

**问题**：`src/assets/idle/awake/idle_awake_float_01.png` 是一个 3KB 的占位图（简笔画风格），而非正确的像素风角色素材。

**修复**：将 `assets/idle/awake/idle_awake_float_01.png`（290KB 像素风角色）复制覆盖到 `src/assets/idle/awake/` 目录。

````carousel
**修复前（3KB 占位图）**

![修复前](file:///d:/ProjectCollection/personal_assistant_ichan/assets/idle/awake/idle_awake_float_01.png)
<!-- slide -->
**修复后（290KB 正确素材）**

![修复后](file:///d:/ProjectCollection/personal_assistant_ichan/src/assets/idle/awake/idle_awake_float_01.png)
````

---

## P1 ✅ 窗口控制按钮生效

**问题**：最小化 (—)、最大化 (□)、关闭 (×) 按钮点击无效果。

**根因**：前端通过 `invoke("window_minimize")` 调用自定义 Tauri 命令，但 Tauri v2 对窗口操作推荐使用原生 `Window` API。

**修复**：

| 文件 | 变更 |
|------|------|
| [FirstRunWizard.tsx](file:///d:/ProjectCollection/personal_assistant_ichan/src/wizard/components/FirstRunWizard/FirstRunWizard.tsx) | 导入 `getCurrentWindow()`，`handleMinimize` / `handleToggleMaximize` 改用 `.minimize()` / `.toggleMaximize()` |
| [default.json](file:///d:/ProjectCollection/personal_assistant_ichan/src-tauri/capabilities/default.json) | 添加 `core:window:allow-minimize`、`core:window:allow-toggle-maximize` 等 9 项权限 |

---

## P2 ✅ 毛玻璃 / 半透明背景效果

**问题**：背景几乎不透明，缺少设计稿中的磨砂玻璃质感。

**修复**（[wizard.css](file:///d:/ProjectCollection/personal_assistant_ichan/src/wizard/wizard.css)）：

- **`.first-run-page`**：背景色透明度从 1.0 → 0.75，添加 `backdrop-filter: blur(40px) saturate(1.3)`，增加更多柔和渐变层
- **`.first-run-page::before`**：新增动画光晕层 (`shimmer-drift`)，12s 缓动呼吸动画增添视觉深度
- **`.first-run-window`**：
  - 背景透明度 0.72 → 0.55，更通透
  - `backdrop-filter` 模糊半径 24px → 32px
  - 新增 `inset box-shadow` 内发光边缘
