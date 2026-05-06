# SettingsDropdownControl

> **源码**: `src/features/settings/SettingsDropdownControl.ts`
> **状态**: [REVIEW]

## 概述

`SettingsDropdownControl.ts` 为设置界面接管原生 `<select>` / Obsidian `DropdownComponent` 的视觉层。它保留底层 select 作为状态和 change 事件来源，同时在旁边渲染跨平台一致的自绘 trigger + listbox，避免 macOS 原生 popup menu 半覆盖原控件、Windows 与 macOS 表现不一致的问题。

## 导入关系

```text
上游: obsidian.DropdownComponent, obsidian.Setting, obsidian.setIcon
下游: OpenCodianSettings.ts, ModelConfigModal.ts, ModelPickerModal.ts, McpServerEditorModal.ts, ProviderBuiltinIconPickerModal.ts
```

## 核心类型 / 接口

| 导出 | 说明 |
|------|------|
| `SettingsDropdownControlHandle` | 单个 select 的增强句柄，提供 `refresh()`、`close()`、`destroy()` |
| `SettingsDropdownsEnhancerHandle` | 容器级增强句柄，负责扫描容器中的 select 并统一销毁 |
| `enhanceSettingsSelect()` | 接管一个现有 `HTMLSelectElement` |
| `enhanceSettingsDropdowns()` | 扫描容器内全部 select，并在新增 select 时补增强 |
| `enhanceSettingsDropdownComponent()` | 接管 Obsidian `DropdownComponent` 并 patch `addOption()` / `setValue()` 后刷新视觉层 |
| `addSettingsDropdown()` | 面向新代码的薄 helper，保留 `Setting` 链式写法 |

## 核心逻辑

### 原生 select 保留

增强后原 select 会添加 `.opencodian-settings-native-select` 并移出可交互视觉层，但仍保留 value、options、disabled 状态和 `change` 事件。自绘选项点击或键盘确认后，会先写回 `selectEl.value`，再派发 bubbling `change`，因此旧设置保存逻辑无需重写。

### 自绘 listbox

控件渲染一个持久 trigger 和一个下方展开的 `role="listbox"` 菜单。菜单项来自当前 `select.options`，保留 disabled option 语义，当前值显示 check icon。支持点击外部关闭、Esc、ArrowUp / ArrowDown、Enter / Space，并在选择后把焦点还给 trigger。

### 动态刷新

单个控件用 `MutationObserver` 监听 select 的 option / disabled 变化。容器级增强只在真实新增 select 节点时重新扫描，避免自绘 label 更新造成 observer 循环。

## 与其他模块的交互

- `OpenCodianSettings.ts`: 主设置页每次 display 后扫描整个 settings tab，并在 hide / redisplay 时销毁旧增强。
- `ModelConfigModal.ts`: provider 工作区 modal 每次 rerender 后扫描当前 content。
- `ModelPickerModal.ts` 和 `ProviderBuiltinIconPickerModal.ts`: 接管顶部筛选下拉。
- `McpServerEditorModal.ts`: 接管 add/edit 表单里的 type / OAuth 下拉。

## 注意事项

- 聊天区 model / agent / permission selector 已经是专门的自绘控件，不通过本模块接管。
- 不要把菜单挂到 `document.body`，当前设计依赖控件本地定位和 Obsidian 设置布局宽度。
- 如果未来新增设置 modal 并直接创建 `<select>`，需要在 modal render 后调用 `enhanceSettingsDropdowns(contentEl)` 或直接使用 `enhanceSettingsSelect()`。
