# Settings Dropdown Styles

> **源码**: `src/style/components/settings-dropdown.css`
> **状态**: [REVIEW]

## 职责

定义设置界面自绘下拉控件的通用样式。它配合 `src/features/settings/SettingsDropdownControl.ts` 使用，把原生 `<select>` 视觉隐藏，并渲染跨 macOS / Windows 一致的 trigger + 下方 listbox 菜单。

## 关键类名

- `.opencodian-settings-native-select`: 隐藏原生 select 的视觉与指针交互，但保留 DOM 状态和 change 事件。
- `.opencodian-settings-dropdown`: 控件本地定位容器。
- `.opencodian-settings-dropdown-trigger`: 始终可见的触发按钮，宽度跟随原表单控件。
- `.opencodian-settings-dropdown-menu`: 下方展开菜单，使用本地 absolute 定位，不挂到 body。
- `.opencodian-settings-dropdown-option`: 菜单选项，支持 hover、键盘高亮、disabled 与 selected checkmark 状态。

## 设计约束

- 使用 Obsidian 主题变量与 restrained product UI 风格，不引入独立色彩体系。
- 菜单必须从触发器下方展开，触发器本身不被弹层覆盖。
- 旧的 model picker / builtin icon picker 原生 select chevron 会在 select 被增强后隐藏，避免双 chevron。
- 控件尺寸保持紧凑，适配主设置页、modal 表单和顶部筛选条。

## 修改注意点

- 修改后运行 `npm run build:css` 或完整 `npm run build`，刷新根目录 `styles.css`。
- 不要把菜单改为 body-level overlay；当前行为依赖本地定位和 settings/modal 的现有宽度约束。
