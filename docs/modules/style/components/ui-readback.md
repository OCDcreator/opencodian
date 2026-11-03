# UI Readback Styles

> 源码：`src/style/components/ui-readback.css`

统一插件状态、辅助说明、只读摘要和技术元数据的排版，补齐有语义 class 但没有样式的展示路径。复用已有 DOM 与主题变量，不改变后端、设置存储、内容或交互行为。

- 插件设置页与带 `opencodian-` 标记的 modal 使用 13px 界面字体基线；状态和说明 12px，紧凑元数据 11px，行高 1.5。聊天正文与笔记渲染的字号继续由各自 owner 控制。
- 复用既有 `opencodian-modal-shell` / `opencodian-help-modal-shell` 与 Pi workbench 内容根，覆盖没有 modal 根 class 但已有组件 shell 的弹窗；Pi dialog 与远程控制确认／令牌弹窗显式标记根，避免使用全局 `.modal` 选择器影响 Obsidian 或其他插件。
- 设置 live region 只提供字号、行高、宽度和长文本换行，不向所有子节点强制下发布局、等宽字体或状态色。空 live region 保留挂载但退出布局，避免形成空白间距。
- ZCode 连接及管理的状态行采用对齐的 label/detail 两列；420px 以下按设置容器宽度折成上下两行，路径完整可选择并安全换行。
- Pi 逐行原生状态保留换行；Codex 配置／插件／资源反馈、能力实验室反馈、模型配置只读摘要共用 metadata 层级。
- 补齐上下文选择器说明、实验操作弹窗、后台操作完成提示、整篇行内编辑确认说明、回退预览元数据和 task 工具展开详情；代码／路径／精确数值才使用等宽字体。
- Codex 插件列表复用现有 resource row，只补齐工具栏、反馈间距和低强调 badge，不另建嵌套卡片。
- 真实错误、警告、成功仍使用语义色；普通说明不伪装成告警。无全局 `p`、`div` 或 `.setting-item` 重置。

通过 `src/style/index.css` 在各设置 owner 样式后载入；既有专用选择器保持优先。使用 `npm run build` 生成根 `styles.css`，并验证 light/dark、窄／宽设置容器、长路径和空状态。
