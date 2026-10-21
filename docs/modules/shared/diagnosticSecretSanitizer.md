# Diagnostic Secret Sanitizer

> **源码**: `src/shared/diagnosticSecretSanitizer.ts`
> **状态**: [REVIEW]

## 概述

诊断报告导出前的密钥/令牌/密码净化工具。在剪贴板复制或文件写入之前，对诊断报告全文执行基于正则表达式的模式匹配，将常见的敏感值替换为 `[REDACTED]`。

这是一个尽力而为（best-effort）的文本净化器，不能保证移除所有可能的敏感值。用户在分享导出的诊断报告之前仍应自行检查。

## 导入关系

```text
上游: 无（独立工具，不依赖 Obsidian 或其他项目模块）
下游: main.ts (buildDiagnosticReport), features/settings/SettingsDebugSection.ts (buildClaudeCodeDiagnosticReport)
```

## 核心类型 / 接口

```typescript
export const DIAGNOSTIC_REDACTION_PATTERNS: readonly RegExp[];
export function sanitizeDiagnosticReport(text: string): string;
```

## 核心逻辑

### 模式匹配净化

`sanitizeDiagnosticReport()` 按顺序应用 `DIAGNOSTIC_REDACTION_PATTERNS` 中的所有正则表达式模式，对全文进行多轮替换。

### 覆盖的敏感值模式

| 模式类别 | 示例 |
|----------|------|
| Bearer / Authorization 令牌 | `Authorization: Bearer tok_...` |
| API key / token / secret / password 赋值 | `api_key: sk-...`, `token=abc...` |
| CLI 标志 | `--token xxx`, `--api-key xxx` |
| URL 内嵌密码 | `https://user:pass@host` |
| 查询字符串敏感参数 | `?token=xxx`, `?api_key=xxx` |
| 环境变量风格 | `API_KEY=sk-ant-...`, `MY_TOKEN=xxx` |
| Anthropic API key 前缀 | `sk-ant-api03-...` |
| 通用长令牌 | `key=<20+chars>` |
| PEM 私钥块 | `-----BEGIN PRIVATE KEY-----...-----END PRIVATE KEY-----` |

### 替换策略

- 对于前缀+值的模式：保留前缀，仅替换值为 `[REDACTED]`
- 对于 PEM 私钥块：整个块替换为 `[REDACTED]`

## 关键方法

| 方法 | 说明 |
|------|------|
| `sanitizeDiagnosticReport(text)` | 对诊断报告文本执行密钥净化，返回净化后的文本 |
| `DIAGNOSTIC_REDACTION_PATTERNS` | 导出的正则表达式模式列表，供测试直接访问 |

## 数据流

```text
buildDiagnosticReport() → raw text → sanitizeDiagnosticReport() → sanitized text → clipboard/file
buildClaudeCodeDiagnosticReport() → raw text → sanitizeDiagnosticReport() → sanitized text → clipboard
```

## 与其他模块的交互

- 被 `main.ts` 的 `buildDiagnosticReport()` 调用
- 被 `SettingsDebugSection.ts` 的 `buildClaudeCodeDiagnosticReport()` 调用
- 通过 `src/shared/index.ts` barrel 导出

## 注意事项

- 这是一个尽力而为的净化器，不能替代安全审查
- 新增敏感值模式时应在 `tests/unit/shared/diagnosticSecretSanitizer.test.ts` 中同步添加覆盖
- 该模块不依赖任何 Obsidian API 或其他项目模块，便于独立测试

## 2026-10-13 有限 flag 与显式 URL 输出策略

`sanitizeDiagnosticReport(text, options?)` 接收 `DiagnosticSanitizerOptions`，`urlPolicy: 'strict'` 隐藏 URL 的完整 userinfo 与完整 fragment；host/path 和安全 query 保留，敏感 query 值仍替换为 `[REDACTED]`。默认调用继续保留普通 URL 用户名和 fragment，保留既有调用者契约。严格 URL 文本扫描以空白、引号、JSON 转义及常见诊断标点为词法边界，测试覆盖多个 URL 和重复凭据。

有限敏感 flag 名单为 token、api-key/api_key、client-secret/client_secret、password、secret、credentials、authorization；支持单/双短横线、独立/等号值及大小写，保留后续 `--port 4096`。Authorization raw 值不会再吞掉下一个 CLI flag。净化仍为有限文本模式，不能保证任意未标记自由文本凭据消失。

通用 `buildDiagnosticReport` 与 Pi `mcpStatus` 显式选择严格策略；TraceReportBuilder、TraceStore、Claude 诊断 caller 保持默认调用。回归位于既有 shared、main 和 settings 测试；mock 输入和 JSDOM 输出不证明 native RPC、真实 UI/剪贴板/文件导出或完整 S08。
