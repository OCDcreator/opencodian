# InlineEditContextUi

> **源码**: `src/features/inline-edit/InlineEditContextUi.ts`
> **状态**: [REVIEW]

## 概述

行内编辑悬浮条的**附加上下文界面**：页脚的"添加上下文"入口与已附加笔记 chip（`syncAttachChip` / `renderContextChips`：已附加项渲染在**独立的上一行** `context-row`，无附件时整行隐藏，避免与附加/模型/强度挤同一行），以及选择器主体（`renderContextPickerInto` / `openContextPicker`：置顶搜索框 + 可滚动候选列表 + 过滤规则 + 键盘行走）。两块都围绕同一件事，抽出来是为了让 `InlineEditInputOverlay` 保持"悬浮条骨架"的体量（`max-lines` 按非注释代码行计，overlay 曾逼近上限）。

overlay 仍持有选择器的**容器、定位与 Escape 顺序**（它就是一个 menu，与模型/努力下拉同类）。候选来自 `InlineEditHost.listContextFiles()`，本模块不接触 vault。

## 职责

- `syncAttachChip(attach, supported, busy)`：host 无候选时整块隐藏入口；busy（生成中）禁用
- `renderContextChips(row, chips, onToggle)`：清空并重建 `context-row`（列表至多 5 项、不持焦点/光标状态，故整块重建而非 diff）；空列表把整行 `display: none`；chip 本身即移除按钮，`title` 说明移除对象
- `PICKER_MAX_ROWS` / `filterContextFiles(files, query)`：路径大小写不敏感子串过滤 + 行数上限（纯函数，有单测）
- `renderContextPickerInto(container, { files, onToggle })`：渲染搜索框 + 列表，返回 `(attachedPaths) => void` 刷新回调——选择器在附加/取消时保持打开，回调带**当前**附加集合刷新 ✓ 标记，不重建容器（否则会丢查询与焦点）
- `openContextPicker(panel, { files, attachedPaths, onToggle, view })`：创建容器（`left: 0` + CSS `width: 100%`，让选择器左右边框与卡片边框对齐）、渲染主体、延后聚焦搜索框；返回菜单元素与刷新回调
- 行内键盘：ArrowUp/Down 循环移动高亮（`is-highlighted`），Enter 切换高亮项，输入即过滤；Escape 冒泡给 overlay 的文档捕获处理器（先关菜单再考虑取消编辑）

## 依赖

- `obsidian`（`setIcon`）、`../../i18n`、`./InlineEditTypes`（`InlineEditContextFile`）

> 2026-09-18 (R-A7)：picker 行与上下文 chip 按 `kind` 渲染图标（文件夹 → folder glyph），目录条目显示完整路径（文件仅父目录后缀）；新增 `installInlineEditContextDrop`——vault 拖放 glue：只信任宿主经 `getAbstractFileByPath` + instanceof 解析成功的 `text/plain` 负载，解析失败不 preventDefault（编辑器文本拖拽保持默认行为）。

## 维护约束

- 选择器**不能改用 modal**：modal 会把焦点移出面板，`focusout` 到面板外即取消整次行内编辑（见 overlay 的取消契约）。它必须留在面板 DOM 内
- 刷新回调必须接收当前附加集合，不要在模块内缓存一份——缓存会让 ✓ 标记停在打开选择器那一刻的状态
- 候选列表的文件夹后缀按**最后一个 `/`** 切分；chip/行的 label 是去扩展名的 basename，不能用它反推路径长度
- 搜索框是宿主主题的目标（`input[type=text]`），其盒属性必须继续用 `!important` 钉死，与字段框体同一理由
- 该模块只渲染与过渡，不读 vault、不发请求；候选的获取属于 host
