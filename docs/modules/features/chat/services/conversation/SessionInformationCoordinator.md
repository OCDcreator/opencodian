# SessionInformationCoordinator

> 源码：`src/features/chat/services/conversation/SessionInformationCoordinator.ts`
> Owner：feature.chat-services

## 职责与边界

会话信息的独立读回 owner。以 backend + 原生 session ID 缓存额度、MCP、子智能体及后端资源；UI 身份另包含 conversation/tab。每个读取检查原服务实例、会话身份和返回 sessionId，迟到结果不能写入已复用的标签。并发请求合并；信息最多每十秒刷新，子会话最多每三秒刷新，常规轮询只在面板可见时运行。关闭/销毁后不应用异步结果。

`project` 从已发送消息的附件、稳定引用和会话引用提取来源；草稿资源只供工具页使用。轮次是用户消息数，消息和工具数来自当前会话记录。上下文复用 ContextUsageDisplayService 的当前窗口口径；原生累计 session usage 独立保留。

智能体来自原生列表或明确的工具 metadata 子会话 ID；普通后台任务、shell、模糊工具名不能生成智能体。终态与未知状态保留区别。子会话使用 readChildSessionMessages(parentId, childId) 读取实际消息，不发送模型请求，不切换或重建主会话。返回删除子视图，保留主会话的草稿和聊天 DOM；面板自行恢复滚动与折叠。

## 集成与验证

SessionWorkbenchCoordinator 组装和转发此 owner；OpenCodianView 仅提供当前 tab 的上下文快照。单测：SessionInformationCoordinator.test.ts、SessionWorkbenchCoordinator.test.ts。需要类型、lint、模块文档、架构、图刷新和真实 Test Vault 验证。

优先投影后端显式 context；只对已有可证明当前窗口口径的 Pi/DSH 使用严格 sessionId 匹配的 Tab 测量。OpenCode 2、Codex 和 Claude 的累计/探针数据不回填为当前上下文；ZCode 当前窗口口径待运行时证明。后端服务实例替换后，旧实例账户数据立即不可见。
