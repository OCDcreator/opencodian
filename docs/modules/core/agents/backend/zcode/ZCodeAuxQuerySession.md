# ZCodeAuxQuerySession

> 源码: `src/core/agents/backend/zcode/ZCodeAuxQuerySession.ts`

## 职责

为 ZCode 辅助查询建立独立的 `app-server --stdio` 进程与专属
`ZCODE_STORAGE_DIR`。provider builtin/personal 配置只通过官方环境变量引用，
不复制、不改写用户配置；会话工作区仍是调用方传入的 vault 路径，只开放原生
空工具集，因此模型只能处理调用方已经传入的文字和图片。

创建请求关闭 MCP、动态工作流和后台工具，并把 `toolAllowlist` 设为空、
`toolDenylist` 覆盖写入/壳/子代理类工具。每一回合在继续读取事件前轮询
`session/messages`，要求最新用户消息的 `info.tools` 是原生读回的空对象；任意
缺失、未知、工具事件或非零 `toolCallCount` 都 fail closed。图片使用官方
`{kind, filename, mimeType, sizeBytes, dataBase64}` 附件形状，不降级为文字。

`dispose()` 先停止回合、等待自有 transport 的进程退出，再校验本轮创建的
marker、realpath、父目录直系关系和保留前缀，仅删除这个专属临时根；未确认退出
时保留根以避免与存活进程竞态。辅助会话从不使用主 adapter transport，也不进入
主会话列表。

## 验证

`tests/unit/core/agents/backend/ZCodeAuxQuerySession.test.ts` 覆盖空工具原生读回、
官方图片形状、工具读回扩大、工具事件违规、取消、超时与专属临时根清理。
2026-09-24 的真实 Test Vault/`krill/gpt-6-sol` 审计已以 32×32 红色 PNG
完成：原生当前回合读回 `info.tools:{}`、`turn.completed.toolCallCount=0`、
模型回复 `RED`；普通会话列表数、personal provider-config 哈希及 OS 临时根
列表均前后一致。后续两回合验证要求每轮新 user-message identity 不同且各自
读回 `info.tools:{}`；取消发送原生 `session/stop` 并读回 cancelled。恶意写提示
只指向当轮新生成的、原本不存在的 Vault 测试路径：该路径未产生，排除
`.obsidian` 的 1,950 条内容清单及每文件 SHA-256 前后一致。脱敏记录位于
`.visual-evidence/zcode-continued/zcode-aux-native-audit-2026-09-24.md`。
