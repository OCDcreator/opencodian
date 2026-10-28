# settings-opencode2

源码：`src/style/components/settings-opencode2.css`。

OpenCode 2 八页设置工作区的局部样式，模拟 shadcn Card、Field、Badge、Alert、Separator 和 ScrollArea 的结构，使用原生 Obsidian DOM 和宿主主题变量，无 React/Tailwind 依赖。

- 工作区规则以 `.opencodian-opencode2-*` 限定；子标签栏直接复用 `settings-layout-contract.css` 的公共样式，与其他后端保持一致。根节点和编辑器字段的局部选择器显式覆盖共享 section/row-card 样式，保持外层透明、内层字段平铺。
- 顶部标题/自动同步状态、覆盖范围说明、内容分组和底部草稿操作复用 `--opencodian-settings-space-*` 的 12px/24px 节奏；卡片与控件圆角复用共享 form-row/inline token。
- 普通字段为标签/描述与控件双列；JSONC 文本域独占整行。列表/编辑器只保留一层外框，内部字段不再嵌套卡片。
- 720px 以下表单单列，480px 以下列表与编辑器上下排列；长目录和规则允许换行与局部滚动。
- 使用 `--background-*`、`--text-*`、`--interactive-accent` 支持明暗主题，保留原生控件焦点与禁用状态。
