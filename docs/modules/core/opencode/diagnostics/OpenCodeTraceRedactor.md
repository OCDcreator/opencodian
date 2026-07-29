# OpenCodeTraceRedactor

> **源码**: `src/core/opencode/diagnostics/OpenCodeTraceRedactor.ts`
> **状态**: [REVIEW]

在任何 OpenCode 诊断值进入控制台、队列、磁盘或剪贴板前执行结构化脱敏。覆盖认证字段、Cookie、URL userinfo/敏感查询参数、env/environment 值、PEM、已知动态秘密、本地路径、循环对象、hostile getter/proxy、超长字段、base64 及二进制摘要。路径归一同时识别 macOS/Windows 前缀的原始斜杠、反斜杠和大小写混合的 URI 编码形式，只替换诊断副本中的已知前缀，不解码或重编码整条 URL。普通正文、stack 和 service output 分别按 64/32/16 KiB 在 Unicode 字符边界截断，preview 的 UTF-8 bytes 不超过上限。顶层异常返回安全占位符，不把原值或异常传播给会话路径。
