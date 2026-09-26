# zcode/index

> 源码: src/core/agents/backend/zcode/index.ts

## 职责

ZCode 后端包的导出边界：官方 ZCode 运行时 `app-server --stdio` 结构化协议的独立 adapter/transport 边界。运行时状态不进入通用聊天视图；包内子模块为 ZCodeAdapter（AgentService 门面）、ZCodeAppServerTransport（进程所有权+协议管道）、ZCodeProtocolTypes（边界校验）、ZCodeRuntimeResolver（运行时发现）、ZCodeProviderConfigDiscovery（provider 配置只读发现）、ZCodeDesktopTaskIndex（加载官方桌面 TaskIndexRepo 软删除路径）、ZCodeAuxQuerySession（专属临时存储、原生空工具读回与图片回合）与 ZCodeInlineCompletionSession（无 native 会话的 text-only `workspace/generateText` 补全）。

## 验证

经由各子模块的聚焦测试（tests/unit/core/agents/backend/ZCode*.test.ts）与接线契约测试 ZCodeAdapterWiring.test.ts。
