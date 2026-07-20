# Settings Dropdown Styles

> **源码**: `src/style/components/settings-dropdown.css`
> **状态**: [REVIEW]

## 职责

定义设置界面自绘下拉控件的通用样式。它配合 `src/features/settings/SettingsDropdownControl.ts` 使用，把原生 `<select>` 视觉隐藏，并渲染跨 macOS / Windows 一致的 trigger + 下方 listbox 菜单。

## 关键类名

- `.opencodian-settings-native-select`: 将原生 select 固定在视口左上角的 1px 隐藏区域，避免其静态位置撑大设置页滚动范围，同时保留 DOM 状态和 change 事件。
- `.opencodian-settings-dropdown`: 控件本地定位容器。
- `.opencodian-settings-dropdown-trigger`: 始终可见的触发按钮，宽度跟随原表单控件。
- `.opencodian-settings-dropdown-menu`: 菜单面板。基础规则使用 `position: absolute`（非 portal 时的 fallback）。
- `.opencodian-settings-dropdown-menu.is-portal`: 打开时 JS Portal 到 `document.body` 后激活此 class，切换为 `position: fixed`（z-index 2001，高于 Obsidian modal 的 1000），`box-sizing: border-box` 确保 inline width 与 JS 计算宽度一致。
- `.opencodian-settings-dropdown-option`: 菜单选项，支持 hover、键盘高亮、disabled 与 selected checkmark 状态。

## 设计约束

- 使用 Obsidian 主题变量与 restrained product UI 风格，不引入独立色彩体系。
- 菜单默认从触发器下方展开，空间不足时自动翻转到上方；极端小视窗下可能自动关闭。
- 打开菜单可以比触发器更宽，并允许选项文本换行完整显示；触发器仍保持单行省略，避免设置行本身被长文案撑开。
- 菜单内部使用 grid stack，选项行 `width: 100%` 且 `justify-self: stretch`，确保 hover / selected 背景铺满菜单内容轨道，不在右侧留下空白。
- 短菜单不预留纵向滚动槽；只有 `.is-scrollable` 状态才启用 `overflow-y: auto`，避免三四个选项的菜单右侧出现空白 gutter。
- `.is-portal` 的 `z-index: 2001` 是为了高于 Obsidian modal 容器的 `z-index: 1000`，修改时需注意不要降回 1000 或更低。
- 旧的 model picker / builtin icon picker 原生 select chevron 会在 select 被增强后隐藏，避免双 chevron。
- 隐藏原生 select 必须使用固定坐标并脱离滚动几何；不要退回无坐标的 `position: absolute`，否则长列表中的 select 会在卡片结束后制造大段空白滚动区域。
- 控件尺寸保持紧凑，适配主设置页、modal 表单和顶部筛选条。

## 修改注意点

- 修改后运行 `npm run build:css` 或完整 `npm run build`，刷新根目录 `styles.css`。
- 菜单打开时 Portal 到 `document.body`（`.is-portal`），关闭时回到控件内。`position: fixed` + 内联坐标由 JS 控制，CSS 仅提供 class 级别的覆盖。
