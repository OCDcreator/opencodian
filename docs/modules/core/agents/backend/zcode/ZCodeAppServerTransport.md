# ZCodeAppServerTransport

> 2026-09-24（续做）：`normalizeZCodeHandshakeFailure` 收束传输与远端握手错误的分类。用户诊断字段由 adapter 固定安全文案管理，不回显远端 payload。

> 源码: src/core/agents/backend/zcode/ZCodeAppServerTransport.ts

## 职责

一个 OpenCodian 自有的 `app-server --stdio` 子进程的进程所有权与 ZCode Protocol 管道。协议为 NDJSON 帧，消息封装**不含 `jsonrpc` 字段**（官方运行时会以 "Invalid ZCode Protocol message" 拒绝带该字段的出站消息）。

负责：spawn/reap 唯一自有子进程（绝不触碰 ZCode 桌面进程）；请求/响应关联（字符串 id、超时后移除关联槽，迟到响应只计数不复活）；通知分发（未知事件容忍并上报，诚实降级）；服务端发起请求的 fail-closed 应答（未注册处理器一律回 method-not-found，绝不静默批准）；边界校验（单帧超 8MB 立即判流损坏关闭；畸形帧计数超预算后关闭）；dispose 仅 SIGTERM→SIGKILL 自有进程并拒绝所有挂起请求，幂等。

远端错误以 `ZCodeRemoteRequestError`（结构化 code）暴露，传输故障以 `ZCodeTransportError`（reason 判别）暴露；调用方按结构字段分支，不匹配错误文本。stderr 只排空不落日志（可能含凭据/提示词，遵守诊断脱敏契约）。

## 验证

tests/unit/core/agents/backend/ZCodeAppServerTransport.test.ts：覆盖 spawn 形态、请求关联、超时+迟到响应、远端错误码、未知通知容忍、畸形帧预算、超大帧、进程早退、dispose 杀进程与 SIGKILL 升级、fail-closed 服务端请求应答、handler 异常不破坏流。
