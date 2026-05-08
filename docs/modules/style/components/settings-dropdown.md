# Settings Dropdown Styles

> **源码**: `src/style/components/settings-dropdown.css`
> **状态**: [REVIEW]

## 职责

定义设置界面自绘下拉控件的通用样式。它配合 `src/features/settings/SettingsDropdownControl.ts` 使用，把原生 `<select>` 视觉隐藏，并渲染跨 macOS / Windows 一致的 trigger + 下方 listbox 菜单。

## 关键类名

- `.opencodian-settings-native-select`: 隐藏原生 select 的视觉与指针交互，但保留 DOM 状态和 change 事件。
- `.opencodian-settings-dropdown`: 控件本地定位容器。
- `.opencodian-settings-dropdown-trigger`: 始终可见的触发按钮，宽度跟随原表单控件。
- `.opencodian-settings-dropdown-menu`: 菜单面板。基础规则使用 `position: absolute`（非 portal 时的 fallback）。
- `.opencodian-settings-dropdown-menu.is-portal`: 打开时 JS Portal 到 `document.body` 后激活此 class，切换为 `position: fixed`（z-index 2001，高于 Obsidian modal 的 1000），`box-sizing: border-box` 确保 inline width 精确匹配 trigger。
- `.opencodian-settings-dropdown-option`: 菜单选项，支持 hover、键盘高亮、disabled 与 selected checkmark 状态。

## 设计约束

- 使用 Obsidian 主题变量与 restrained product UI 风格，不引入独立色彩体系。
- 菜单默认从触发器下方展开，空间不足时自动翻转到上方；极端小视窗下可能自动关闭。
- `.is-portal` 的 `z-index: 2001` 是为了高于 Obsidian modal 容器的 `z-index: 1000`，修改时需注意不要降回 1000 或更低。
- 旧的 model picker / builtin icon picker 原生 select chevron 会在 select 被增强后隐藏，避免双 chevron。
- 控件尺寸保持紧凑，适配主设置页、modal 表单和顶部筛选条。

## 修改注意点

- 修改后运行 `npm run build:css` 或完整 `npm run build`，刷新根目录 `styles.css`。
- 菜单打开时 Portal 到 `document.body`（`.is-portal`），关闭时回到控件内。`position: fixed` + 内联坐标由 JS 控制，CSS 仅提供 class 级别的覆盖。
