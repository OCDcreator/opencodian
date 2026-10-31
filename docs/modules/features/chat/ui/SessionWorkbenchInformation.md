# SessionWorkbenchInformation

> 源码：`src/features/chat/ui/SessionWorkbenchInformation.ts`
> Owner：feature.chat-ui

## 职责与边界

会话信息渲染和共用面板 DTO 的 owner。定义 SessionWorkbenchState、WorkbenchSession actions/resources/tasks/page 类型并由 SessionWorkbench 兼容导出，避免信息渲染器反向导入容器而形成类型循环。

渲染独立可折叠的套餐额度、会话统计、已发送/后端加载来源、MCP 及实际智能体列表。额度显示原生百分比和重置时间；上下文窗口占用不与累计令牌/费用相加。null 是后端未报告，不显示成零。MCP 说明会话级或工作区目录作用域；空目录与不可用不同。

智能体按运行、待运行、完成、失败/停止、未知状态排列。只有 readable 原生链接提供打开操作。子视图显示返回主会话入口、实际消息以及工具输入/输出，用 Obsidian MarkdownRenderer 和 Component 生命周期管理渲染；不写入主会话、不执行子会话中的工具。

## 验证

SessionWorkbench.test.ts 覆盖无 Goal、独立折叠、不可用额度和主/子面板滚动恢复；会话身份和读取竞态由 SessionInformationCoordinator.test.ts 验证。窄屏、长标题、键盘和实际运行时数据需要 Test Vault DOM/截图验收。

原生加载来源的 navigable=false，文件路径只作说明和 tooltip，避免将 Vault 外的记忆路径当成可创建的 Obsidian 链接。累计统计采用原生 totalTokens，不盲目加输入/输出漏掉缓存。
