# shared/diagnostics/TraceReportBuilder

> **源码**: `src/shared/diagnostics/TraceReportBuilder.ts`
> **状态**: [REVIEW]

## 概述

后端无关的泛化智能报告生成器：`TraceReportBuilder<TEvent extends TraceEventBase = TraceEventBase>`。由 `OpenCodeTraceReportBuilder` 原样下沉泛化而来，从 structural、关联 deep 与 runtime segment 生成最大 1 MiB 的可粘贴报告；合并时 deep 事件替代对应 structural 占位事件，按时间/单调序号排序，超量时保留首尾及异常事件窗口。相对原实现仅三处变化：事件类型参数化（`OpenCodeTraceSummary` → `TraceSummary`、store/redactor 改为共享基类）、构造追加第 4 参数 `options: { title: string; extractMetadata?: (events: TEvent[]) => string[] }`、报告头与元信息行改为注入（`# ${options.title}` 与 `extractMetadata?.(events) ?? []`）；`eventLine`、`chooseSummary`、`selectEventWindows`、`mergeEvents`、`capAndSanitize` 与 1 MiB 上限原样保留。`automatic` 选择按最高未读严重度排序，`current-session` 缺 trace 时生成明确空报告；报告正文逐行经过 `TraceRedactor` 与通用诊断文本脱敏器两道脱敏，最终按 UTF-8 字符边界截断为 1 MiB。

## 导入关系

```text
上游: shared/diagnosticSecretSanitizer, ./TraceRedactor, ./TraceStore, ./types
下游: core/opencode/diagnostics/OpenCodeTraceReportBuilder（薄子类包装）, 后续 Codex 后端 report builder
```

## 核心类型 / 接口

```typescript
export class TraceReportBuilder<TEvent extends TraceEventBase = TraceEventBase> {
  constructor(
    store: TraceStore<TEvent>,
    buildIdentity: () => string,
    redactor: TraceRedactor,
    options: { title: string; extractMetadata?: (events: TEvent[]) => string[] },
  );
  buildSmartReport(
    traceId?: string,
    userContext?: { actual?: string; expected?: string; reproduction?: string },
    options?: { selection?: 'automatic' | 'current-session' },
  ): Promise<string>;
}
```

## 注意事项

- 后端包装类（如 `OpenCodeTraceReportBuilder`）通过注入 `title` 与 `extractMetadata` 保持各自报告头与元信息行，共享层不含任何 OpenCode/Codex 专属字段名。
- 单元测试见 `tests/unit/shared/diagnostics/TraceReportBuilder.test.ts`；OpenCode 侧回归见 `OpenCodeDiagnostics.test.ts` 与 `SettingsDebugSection.test.ts`。
