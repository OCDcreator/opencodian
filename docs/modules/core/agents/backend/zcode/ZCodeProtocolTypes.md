# ZCodeProtocolTypes

> 2026-09-24（续做）：`redactZCodeDiagnosticText` 对任意不可信远端错误只返回固定安全分类；短 token、提示词、路径、附件内容和嵌套异常都不会因截断阈值而漏进诊断面。

> 源码: src/core/agents/backend/zcode/ZCodeProtocolTypes.ts

## 职责

ZCode Protocol 消息封装类型与边界校验（唯一的解析边界）。入站帧四种合法形态：response（`{id, result}`）、error（`{id, error:{code, message, data?}}`）、notification（`{method, params?}`）、server-request（`{id, method, params?}`）；其余归为 `invalid` 并给出判别原因，绝不抛异常。

出站序列化（`serializeZCodeRequest` / `serializeZCodeServerRequestReply`）保证不含 `jsonrpc` 字段。未知字段容忍（附加式协议漂移不破坏流）；`parseZCodeRuntimeCapabilities` 对已知能力标志缺失时保留 `null`（unavailable），原始字段留存于 `raw` 供漂移分析，绝不臆造。

错误码常量 `ZCodeProtocolErrorCode`（-32600/-32601/-32602/-32603）供按码分支。

## 验证

tests/unit/core/agents/backend/ZCodeProtocolTypes.test.ts：合法帧解析、数字 id 归一、未知方法/字段容忍、畸形 JSON、非对象、无判别字段封装、缺 result+error、错误形状非法、非法 id 类型、出站无 jsonrpc、能力解析的诚实缺省。
