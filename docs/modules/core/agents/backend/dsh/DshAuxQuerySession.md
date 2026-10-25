# DshAuxQuerySession

源码：`src/core/agents/backend/dsh/DshAuxQuerySession.ts`

拥有 DSH 原生 LLM 辅助查询的插件侧句柄、累计文本订阅、取消、超时和幂等释放。`query` 重置上下文，`followUp` 保留该辅助句柄的内存上下文；不复用聊天 Agent。

创建必须从原生扩展回读空 effectiveTools、无 persistence、无 toolDispatcher，以及与请求一致的系统提示词 SHA-256。每次结果再次校验工具选择为 none 和同一运行时边界；缺少证明即失败。安全性来自不创建 Agent/工具调度器的 LLM 通道，不来自提示词承诺。`assets/dsh/auxiliary.mjs` 为官方 DeepSeek 适配器提供内存图片 store，不写会话或图片文件；其他 provider 仅在其可证明的范围内开放。

模型引用保留 dsh/provider/model 身份并校验不透明模型值；不借用 OpenCode 目录。图片不支持时拒绝该回合。取消和释放通过原生 aux/cancel、aux/close 等待运行回合结束；订阅不能在释放后继续向编辑器发送结果。

测试：`DshAuxQuerySession.test.ts`。安全验收：`node scripts/audit/run-aux-query-audit.mjs dsh`，需要显式模型和已有凭据；真实普通写入阳性对照、诱导写入、图片、取消、释放、会话身份及文件字节分别记账。
