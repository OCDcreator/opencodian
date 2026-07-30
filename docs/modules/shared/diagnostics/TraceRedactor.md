# shared/diagnostics/TraceRedactor

> **源码**: `src/shared/diagnostics/TraceRedactor.ts`
> **状态**: [REVIEW]

## 概述

后端无关的 trace 事件递归脱敏器。在事件落盘或导出前，对任意 payload 做受限深度/长度的遍历：按 key 模式（authorization/cookie/token/secret/password/api-key 等）打标 `[REDACTED]`，对字符串执行 PEM、Basic/Bearer、URL 内嵌凭证、查询串敏感参数、Cookie 头、长 base64 块的正则净化，并把 vault/diagnostics/tmp/home 路径前缀归一化为 `$VAULT` / `$DIAGNOSTICS` / `$TMP` / `$HOME`。默认 `compatibility` 模式完整保持原 OpenCode 的 payload shape：对象/环境变量键、`Error.name` 与 symbol/function 等非对象字符串化值不再额外脱敏；值本身仍按原规则脱敏。显式 `hardened` 模式会额外净化这些标识符，并用 `#1`、`#2` 后缀解决脱敏 key collision；Codex diagnostics 显式使用此模式，避免密钥或绝对 vault 路径从任何键名/字符串化值进入落盘或导出。Buffer/Uint8Array/ArrayBuffer 与长 base64 以 `{ omitted, bytes, sha256 }` 形式省略，循环引用、超深、超长分别返回占位符或 `{ truncated, sha256, preview }`。环境变量对象整体逐键打标。`knownSecrets` 可传静态数组，也可传每次 redact 时读取最新凭据的 getter，避免 credential rotation 后继续使用旧快照。脱敏失败时整值回退为 `[REDACTION_FAILED]`，并返回 `{ value, stats }` 统计（secretsRemoved/pathsNormalized/valuesTruncated/binaryValuesOmitted/circularValuesOmitted）。

同时提供 `resolveDefaultTraceDirectory(backend: string)`：解析 `<userData>/OpenCodian/diagnostics/<backend>`，Electron userData 不可用时兜底 `~/.config/obsidian`。

## 导入关系

```text
上游: node:crypto, node:os, node:path
下游: core/opencode/diagnostics（OpenCodeSessionTraceService 等）, shared/diagnostics/index barrel, 后续 Codex 后端
```

## 核心类型 / 接口

```typescript
export interface TraceRedactorOptions { vaultPath?: string; diagnosticsPath?: string; temporaryPath?: string; knownSecrets?: readonly string[] | (() => readonly string[]); redactionMode?: 'compatibility' | 'hardened'; maxStringBytes?: number; maxStackBytes?: number; maxServiceOutputBytes?: number; maxArrayLength?: number; maxDepth?: number }
export interface TraceRedactionStats { secretsRemoved: number; pathsNormalized: number; valuesTruncated: number; binaryValuesOmitted: number; circularValuesOmitted: number }
export interface TraceRedactionResult<T = unknown> { value: T; stats: TraceRedactionStats }
export class TraceRedactor {
  constructor(options?: TraceRedactorOptions);
  redact<T>(value: T, kind?: 'ordinary' | 'stack' | 'service-output'): TraceRedactionResult<T>;
}
export function resolveDefaultTraceDirectory(backend: string): string;
```

## 注意事项

- 这是尽力而为的脱敏器，导出物仍需人工复查；新增敏感模式时应同步扩展 `tests/unit/shared/diagnostics/TraceRedactor.test.ts`。
- 长度限制区分 `ordinary` / `stack` / `service-output` 三档，调用方按内容来源选择 kind。
