# shared/diagnostics/TraceStore

> **源码**: `src/shared/diagnostics/TraceStore.ts`
> **状态**: [REVIEW]

## 概述

后端无关的泛化 trace 持久化 store：`TraceStore<TEvent extends TraceEventBase = TraceEventBase>`。由 `OpenCodeTraceStore` 原样下沉泛化而来，私有逻辑（批量队列、retention、degrade、rebuildIndex、salt、exportTraceBundle）只依赖 `TraceEventBase` 已有字段。相对原实现仅三处变化：事件类型参数化、构造签名追加 `options?: { bundlePrefix?: string }`（默认 `'trace'`）、`exportTraceBundle` 的目录前缀改为 `` `${bundlePrefix}-` ``；`fallbackDirectory` 缺省为 generic 兜底 `~/.config/obsidian/OpenCodian/diagnostics`（正常调用方总会显式传入）。

异步批量写入 v1 JSONL，分别保存 structural、deep 与 runtime 数据。队列同时计算 structural/deep bytes，跨 flush 强制 deep run 10 MiB 上限；过载记录 coalesced/dropped，并在不突破 4096 条/4 MiB 队列界限的前提下持久化压力通知。索引分别保存历史最高严重度与最高未读严重度，并提供 structural JSONL 重建、旧索引兼容、会话绑定、崩溃尾行恢复、7 天/24 小时轮转、原子索引、导出二次文本脱敏、自定义目录回退、POSIX 0700/0600 best-effort 权限和 5000 条内存降级环。memory mode 的 structural/runtime 读取会与降级前磁盘数据稳定去重合并，deep 读取仍只认磁盘文件。首次降级先切换 memory mode，再把原始错误和关联模板交给 listener；无 listener 的 standalone store 只保留固定安全错误文案和隔离 runtime id，不复制原始路径或秘密。

## 导入关系

```text
上游: shared/diagnosticSecretSanitizer, ./types
下游: core/opencode/diagnostics/OpenCodeTraceStore（薄子类包装）, 后续 Codex 后端 store
```

## 核心类型 / 接口

```typescript
export class TraceStore<TEvent extends TraceEventBase = TraceEventBase> {
  constructor(customDirectory?: string, fallbackDirectory?: string, options?: { bundlePrefix?: string });
  rootDirectory: string;
  append(event: TEvent, deep?: boolean): void;
  flush(): Promise<void>;
  dispose(): Promise<void>;
  resolveTraceId(sessionId: string): string | undefined;
  bindSession(sessionId: string, traceId: string): void;
  onDegraded(listener: (error: unknown, template?: TEvent) => void): void;
  getStatus(): TraceStoreStatus;
  listSummaries(limit?: number): TraceSummary[];
  markTraceRead(traceId: string): Promise<void>;
  getOrCreateLocalSalt(): Promise<Buffer>;
  readTrace(traceId: string): Promise<TEvent[]>;
  readDeepRun(runId: string): Promise<TEvent[]>;
  readRuntimeSegment(runtimeSegmentId: string): Promise<TEvent[]>;
  deleteTrace(traceId: string): Promise<void>;
  clear(): Promise<void>;
  exportTraceBundle(traceId: string, targetDirectory: string): Promise<string>;
}
```

## 注意事项

- 后端包装类（如 `OpenCodeTraceStore`）通过 `bundlePrefix`（如 `'opencode-trace'`）保持各自导出目录命名，不要让调用方自行拼接前缀。
- 单元测试见 `tests/unit/shared/diagnostics/TraceStore.test.ts`；OpenCode 侧回归见 `OpenCodeDiagnostics.test.ts` 与 `OpenCodeTraceStoreHardening.test.ts`。
