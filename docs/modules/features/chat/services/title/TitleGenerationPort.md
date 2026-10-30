# TitleGenerationPort

> **源码**: `src/features/chat/services/title/TitleGenerationPort.ts`
> **状态**: [REVIEW]

标题服务的 consumer-owned 端口；没有运行时状态或 UI 依赖。

- settings 仅含 aiTitleModel、aiTitleModelOverrides、disabledModelRefs、locale、modelSourceMode。
- registry 用 conversation backend 解析所属后端，不能使用当前激活后端代替。
- getConversationById / saveConversation 提供标题来源、revision 与完整 conversation 保存；StorageService 保持原有完整消息防覆盖策略。
- generateDefaultTitle 提供本地确定性规则。
- modelConfigService 仅供旧 OpenCode 会话兼容；六个可选后端的模型目录从自身适配器读取。
- openCodeService 仅暴露旧 OpenCode 临时 session 的创建、请求、删除。其他后端不调用它。
- 构造服务时单独注入 workingDirectory，沿用 vault 作用域而不让服务依赖 App 或 main.ts。

生命周期、限时、安全检查、更新代次与原生写入由 TitleGenerationService 拥有；端口本身不缓存、转发或调度。
