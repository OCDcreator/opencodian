# OpenCodeTraceReportBuilder

> **源码**: `src/core/opencode/diagnostics/OpenCodeTraceReportBuilder.ts`
> **状态**: [REVIEW]

从 structural、关联 deep 与 runtime segment 生成最大 1 MiB 的智能可粘贴报告。合并时 deep 事件替代对应 structural 占位事件，按时间/单调序号排序；报告汇总运行段、provider/model、connection、凭据 HMAC 指纹、历史/未读严重度与脱敏计数。Settings 的 automatic 选择按最高未读严重度排序；聊天使用 `current-session` 选择，缺少 trace 时生成明确空报告，绝不借用其他会话。报告正文（包括 actual/expected/reproduction 用户上下文）在返回剪贴板调用方前逐行经过 `OpenCodeTraceRedactor` 的已知秘密清除与 macOS/Windows 原始及 URI 编码路径归一，再运行通用诊断文本脱敏器作为第二道防线。逐行处理避免把整份报告误当作单个 64 KiB 正文字段；最终仍按 UTF-8 字符边界限制为 1 MiB。
