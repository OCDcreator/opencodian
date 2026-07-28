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
| `enhanceSettingsSelect()` | 接管一个现有 `HTMLSelectElement`；可选接收 Obsidian `Keymap` 以管理打开态 Scope |
| `enhanceSettingsDropdowns()` | 扫描容器内全部 select，并在新增 select 时补增强；可选透传 `Keymap` |
| `enhanceSettingsDropdownComponent()` | 接管 Obsidian `DropdownComponent` 并 patch `addOption()` / `setValue()` 后刷新视觉层，可选透传 `Keymap` |
| `addSettingsDropdown()` | 面向新代码的薄 helper，保留 `Setting` 链式写法 |

## 核心逻辑

### 原生 select 保留

增强后原 select 会添加 `.opencodian-settings-native-select` 并移出可交互视觉层，但仍保留 value、options、disabled 状态和 `change` 事件。自绘选项点击或键盘确认后，会先写回 `selectEl.value`，再派发 bubbling `change`，因此旧设置保存逻辑无需重写。

由于原生 select 会被设为 `aria-hidden="true"`、`tabindex=-1`，焦点实际落在自绘 trigger 上。增强器会把 select 的 `aria-labelledby` 或 `aria-label` 同步到 trigger；两者同时存在时优先保留 `aria-labelledby`，并在属性变化后通过现有 `MutationObserver` 刷新，确保屏幕阅读器不会只读出当前选项值。

### 自绘 listbox（Portal 模式）

控件渲染一个持久 trigger 和一个 `role="listbox"` 菜单。trigger 使用 `role="combobox"`、`aria-expanded`、`aria-controls` 和打开态 `aria-activedescendant` 指向当前高亮 option；option 按钮保持 `tabindex=-1`，因此焦点不会在 portal 前后产生额外 Tab 停靠点。**打开时，菜单通过 Portal 挂载到 `document.body`**，避免被祖先容器（如 `.opencodian-settings-block` 的 `overflow: hidden`）裁剪。关闭时菜单回到 `rootEl` 内。

菜单项来自当前 `select.options`，保留 disabled option 语义（`aria-disabled` + disabled button），当前值显示 check icon。支持点击外部关闭、Esc、ArrowUp / ArrowDown、Home / End、Enter / Space；打开态按 Tab 会先关闭菜单再让浏览器把焦点移出控件，并在选择后把焦点还给 trigger。

Trigger 已消费的 ArrowUp / ArrowDown、Enter / Space 会同时 `preventDefault()` 和 `stopPropagation()`，避免宿主 Settings 把这些 dropdown 操作误判成全局键盘动作。主设置页增强器接收 Obsidian `Keymap`，每个 dropdown 仅在菜单打开时 push 自己的 `Scope`，关闭或销毁时 pop；Scope 只对 `isOpen` 且事件目标为 trigger 的 Escape 处理并返回 `false`，从而优先于宿主 Settings scope 关闭动作。Tab 与关闭状态的 Escape 不会被 dropdown scope 吞掉，也不会泄漏重复 scope。

#### 定位逻辑

打开时 JS 同步计算 `triggerEl.getBoundingClientRect()` 并设置 `position: fixed` 内联坐标：

- 默认向下展开（`top = triggerRect.bottom + MENU_GAP`）
- 下方空间不足时自动翻转到上方（`bottom` 定位 + `.is-flipped` class）
- 上下都不足时选空间较大侧，限制 `maxHeight`
- 水平方向限制在视窗内（`VIEWPORT_MARGIN` 边距）
- 菜单宽度取 trigger 宽度、最小菜单宽度和选项文本估算宽度的较大值，再限制在视窗内，避免窄设置行把 “允许 / 询问 / 拒绝” 或较长选项截成省略号
- 菜单可以比 trigger 更宽；展开后每个 option 行必须铺满菜单内部轨道，避免出现右侧空白
- 短菜单默认不启用纵向滚动槽；只有实际内容高度超过定位阶段算出的 `maxHeight` 时才添加 `.is-scrollable` 并启用内部滚动
- 极端小视窗下空间低于 `MIN_MENU_HEIGHT` 时自动关闭

滚动和 resize 时通过 capture-phase `document scroll` + `window resize` 监听器（RAF 节流）重新定位；trigger 滚出视窗时自动关闭。

#### 关键常量

| 常量 | 值 | 用途 |
|------|----|------|
| `MENU_GAP` | 5px | trigger 与菜单间距 |
| `VIEWPORT_MARGIN` | 8px | 视窗边距 |
| `MIN_MENU_HEIGHT` | 40px | 最小可用菜单高度，不足则关闭 |
| `MIN_MENU_WIDTH` | 128px | 菜单最小可读宽度 |
| `MAX_MENU_WIDTH` | 520px | 菜单按文本扩宽时的上限 |

### 动态刷新

单个控件用 `MutationObserver` 监听 select 的 option / disabled 变化。容器级增强只在真实新增 select 节点时重新扫描，避免自绘 label 更新造成 observer 循环。

## 与其他模块的交互

- `OpenCodianSettings.ts`: 主设置页每次 display 后扫描整个 settings tab，并在 hide / redisplay 时销毁旧增强。
- `ModelConfigModal.ts`: provider 工作区 modal 每次 rerender 后扫描当前 content。
- `ModelPickerModal.ts` 和 `ProviderBuiltinIconPickerModal.ts`: 接管顶部筛选下拉。
- `McpServerEditorModal.ts`: 接管 add/edit 表单里的 type / OAuth 下拉。

## 注意事项

- 聊天区 model / agent / permission selector 已经是专门的自绘控件，不通过本模块接管。
- 菜单打开时 Portal 到 `document.body`（`.is-portal` class），关闭时回到 `rootEl`。不要移除 Portal 逻辑，否则会复现卡片底部裁剪问题。
- `close()` 是幂等的：重复调用安全。
- `destroy()` 会先清理 portal listeners 再移除 DOM，即使菜单处于打开状态也能安全清理。
- 如果未来新增设置 modal 并直接创建 `<select>`，需要在 modal render 后调用 `enhanceSettingsDropdowns(contentEl)` 或直接使用 `enhanceSettingsSelect()`。
