# Codex 后端会话调试日志系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Codex 后端建立会话全生命周期调试日志系统（双层捕获、轻量常驻 + armed 深度捕获、ring buffer 回溯、traceId 锚定 threadId、双导出入口、卡死看门狗），并将 OpenCode 诊断基础设施泛化为后端无关共享件。

**Architecture:** 混合式。`OpenCodeTraceStore` / `OpenCodeTraceRedactor` / `OpenCodeTraceReportBuilder` 泛化下沉到 `src/shared/diagnostics/`（类型级泛化，零行为变更），OpenCode 侧保留薄兼容包装使现有代码与测试一行不改；`src/core/agents/backend/diagnostics/` 新建 Codex 独立 trace service、事件 schema、thread/turn 生命周期模型与 wire 插桩桥。

**Tech Stack:** TypeScript, Jest 30 (`node scripts/run-jest.js`), Obsidian plugin API, esbuild.

## Global Constraints

- 每个任务结束后运行 `node scripts/run-jest.js <本任务相关测试>`；提交前该任务测试必须全绿。
- 提交信息用 Conventional Commits 英文短句，scope 参考：`feat(codex-trace): ...`、`refactor(diagnostics): ...`。
- lint 必须 0 errors / 0 warnings（`npm run lint`）。
- OpenCode 侧行为零变更：`tests/unit/core/opencode/OpenCodeDiagnostics.test.ts`、`OpenCodeTraceStoreHardening.test.ts`、`OpenCodeService.traceSnapshot.test.ts`、`LocalSidecarLauncher.trace.test.ts`、`tests/unit/core/types/openCodeTraceSettings.test.ts`、`tests/unit/features/settings/SettingsDebugSection.test.ts` 在 Task 1-3 后必须原样通过（不修改这些测试文件）。
- 修改既有函数前按 AGENTS.md 执行 codegraph `callers`/`impact`（有限 depth），报告调用方与 blast radius；若跨出本计划范围，先停下来报告。
- 每个新增/修改的 src 模块必须同步 `docs/modules/**` 对应页面（见 Task 12）；新增目录需同步其父 `index.md` 与 `docs/modules/README.md`。
- 任何 `src/` 变更后在收尾任务运行 `npm run graphify:update:src`。
- 阈值常量（已定稿，不得另起数值）：armed/deep capture TTL 30 分钟；看门狗 60s warning / 180s critical；ring buffer 5 MiB/thread、20 MiB 全局；存储容量沿用共享 store 的既有保留策略（structural 7 天 / 50 MiB、deep 24h / 10 MiB per run），`captureContent` 默认 `true`。
- traceId 规则：`trace-` + sha256(threadId) 前 32 hex 字符（与 OpenCode 侧 stableTraceId 同构）。

---
### Task 1: 共享诊断基础类型 + TraceRedactor 下沉

**Files:**
- Create: `src/shared/diagnostics/types.ts`
- Create: `src/shared/diagnostics/TraceRedactor.ts`（由 `src/core/opencode/diagnostics/OpenCodeTraceRedactor.ts` 机械移动改名）
- Create: `src/shared/diagnostics/index.ts`
- Modify: `src/core/opencode/diagnostics/OpenCodeTraceRedactor.ts`（变为兼容再导出）
- Modify: `src/core/opencode/diagnostics/types.ts`（基于共享基类型重定义，导出名单不变）
- Test: `tests/unit/shared/diagnostics/TraceRedactor.test.ts`

**Interfaces:**
- Consumes: 无（首个任务）。
- Produces（后续所有任务依赖）:
  - `TraceEventBase` — 共享 store/report 实际使用的全部字段。
  - `TraceRedactor`（构造 `TraceRedactorOptions`，方法 `redact<T>(value: T, kind?: 'ordinary' | 'stack' | 'service-output'): TraceRedactionResult<T>`）。
  - `resolveDefaultTraceDirectory(backend: string): string`。

- [ ] **Step 1: 写失败测试**

`tests/unit/shared/diagnostics/TraceRedactor.test.ts`：

```ts
import { TraceRedactor, resolveDefaultTraceDirectory } from '../../../../src/shared/diagnostics';

describe('TraceRedactor (shared)', () => {
  it('redacts known secrets and vault paths', () => {
    const redactor = new TraceRedactor({ vaultPath: '/vaults/main', knownSecrets: ['sk-test-secret-1234'] });
    const { value, stats } = redactor.redact({ message: 'token sk-test-secret-1234 in /vaults/main/note.md' });
    expect(JSON.stringify(value)).not.toContain('sk-test-secret-1234');
    expect(JSON.stringify(value)).toContain('$VAULT');
    expect(stats.secretsRemoved).toBeGreaterThan(0);
  });

  it('redacts sensitive object keys', () => {
    const redactor = new TraceRedactor();
    const { value } = redactor.redact({ authorization: 'Bearer abc', nested: { api_key: 'xyz' } });
    expect((value as { authorization: string }).authorization).toBe('[REDACTED]');
    expect((value as { nested: { api_key: string } }).nested.api_key).toBe('[REDACTED]');
  });
});

describe('resolveDefaultTraceDirectory', () => {
  it('appends the backend segment under OpenCodian/diagnostics', () => {
    expect(resolveDefaultTraceDirectory('codex')).toMatch(/OpenCodian[/\\]diagnostics[/\\]codex$/);
    expect(resolveDefaultTraceDirectory('opencode')).toMatch(/OpenCodian[/\\]diagnostics[/\\]opencode$/);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node scripts/run-jest.js tests/unit/shared/diagnostics/TraceRedactor.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现共享类型与 redactor**

`src/shared/diagnostics/types.ts`（完整内容）：

```ts
export type TraceSeverity = 'debug' | 'info' | 'warning' | 'critical' | 'error';
export type TraceTerminalState = 'completed' | 'cancelled' | 'error' | 'incomplete';

export interface TracePayloadRef {
  kind: 'inline' | 'deep';
  runId?: string;
}

/** Fields the shared store/report builder rely on. Backends extend this with typed channel/source and their own id fields. */
export interface TraceEventBase {
  schemaVersion: number;
  timestamp: string;
  monotonicSequence: number;
  traceId: string;
  runtimeSegmentId: string;
  runId?: string;
  rootSessionId?: string;
  parentSessionId?: string;
  /** Generic conversation anchor. OpenCode: sessionId. Codex: threadId. */
  sessionId?: string;
  sourceEventId?: string;
  channel: string;
  source: string;
  severity: TraceSeverity;
  name: string;
  metrics?: Record<string, number>;
  payload?: unknown;
  payloadRef?: TracePayloadRef;
}

export interface TraceSummary {
  traceId: string;
  sessionId?: string;
  lastUpdatedAt: string;
  eventCount: number;
  runCount: number;
  highestSeverity: TraceSeverity;
  highestUnreadSeverity?: TraceSeverity;
  unreadAnomalyCount: number;
  deepCaptureCount: number;
}

export interface TraceStoreStatus {
  mode: 'disk' | 'memory';
  rootDirectory: string;
  queuedEvents: number;
  approximateBytes: number;
  lastError?: string;
  droppedEvents: number;
}
```

`src/shared/diagnostics/TraceRedactor.ts`：机械移动 `src/core/opencode/diagnostics/OpenCodeTraceRedactor.ts` 的全部实现，仅做以下重命名（逻辑一行不改）：

- `OpenCodeTraceRedactorOptions` → `TraceRedactorOptions`
- `OpenCodeRedactionStats` → `TraceRedactionStats`
- `OpenCodeRedactionResult` → `TraceRedactionResult`
- `class OpenCodeTraceRedactor` → `class TraceRedactor`

文件末尾追加：

```ts
import * as os from 'os';
import * as path from 'path';

/** Shared default diagnostics root: <userData>/OpenCodian/diagnostics/<backend>. */
export function resolveDefaultTraceDirectory(backend: string): string {
  let userData: string | undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const remote = require('@electron/remote') as { app?: { getPath(name: string): string } } | undefined;
    userData = remote?.app?.getPath('userData');
  } catch {
    userData = undefined;
  }
  const base = userData ?? path.join(os.homedir(), '.config', 'obsidian');
  return path.join(base, 'OpenCodian', 'diagnostics', backend);
}
```

注意：原 `OpenCodeTraceStore.ts` 内的私有 `defaultUserDataDirectory()` 在 Task 2 删除并改用此函数；本步先让两个实现并存。

`src/shared/diagnostics/index.ts`：

```ts
export * from './types';
export * from './TraceRedactor';
```

把 `src/core/opencode/diagnostics/OpenCodeTraceRedactor.ts` 整个替换为兼容层（完整内容）：

```ts
// Compatibility re-exports. Implementation lives in src/shared/diagnostics/TraceRedactor.ts.
export {
  TraceRedactor as OpenCodeTraceRedactor,
  resolveDefaultTraceDirectory,
} from '../../../shared/diagnostics/TraceRedactor';
export type {
  TraceRedactorOptions as OpenCodeTraceRedactorOptions,
  TraceRedactionStats as OpenCodeRedactionStats,
  TraceRedactionResult as OpenCodeRedactionResult,
} from '../../../shared/diagnostics/TraceRedactor';
```

把 `src/core/opencode/diagnostics/types.ts` 中的事件/摘要/状态类型改为基于共享基类型（保持全部既有导出名与字段不变）。完整替换策略：

- 保留文件头两个 const（`OPEN_CODE_TRACE_SCHEMA_VERSION`、`OPEN_CODE_TRACE_CHANNEL_IDS`）与 `OpenCodeTraceChannelId`、`OpenCodeTraceSource`、`OpenCodeTraceTerminalState`、`OpenCodeTraceSeverity` 定义原样（`OpenCodeTraceSeverity` 可 `= TraceSeverity`，`OpenCodeTraceTerminalState` 可 `= TraceTerminalState`）。
- `OpenCodeTraceEventV1` 改为：

```ts
import type { TraceEventBase, TraceSummary, TraceStoreStatus, TraceSeverity, TraceTerminalState } from '../../../shared/diagnostics/types';

export interface OpenCodeTraceEventV1 extends TraceEventBase {
  schemaVersion: typeof OPEN_CODE_TRACE_SCHEMA_VERSION;
  channel: OpenCodeTraceChannelId;
  source: OpenCodeTraceSource;
  messageId?: string;
  partId?: string;
  callId?: string;
  requestId?: string;
}
```

- `OpenCodeTraceSummary`、`OpenCodeTraceStoreStatus` 改为别名：`export type OpenCodeTraceSummary = TraceSummary;`、`export type OpenCodeTraceStoreStatus = TraceStoreStatus;`
- 其余接口（`OpenCodeDiagnosticRunToken`、`OpenCodeTraceContext`、`OpenCodeTraceEventLink`、`OpenCodeBootstrapContext`、`OpenCodeTracePort`）原样保留。

- [ ] **Step 4: 运行新测试 + OpenCode 回归测试**

Run: `node scripts/run-jest.js tests/unit/shared/diagnostics/TraceRedactor.test.ts tests/unit/core/opencode/OpenCodeDiagnostics.test.ts tests/unit/core/types/openCodeTraceSettings.test.ts`
Expected: 全部 PASS（兼容层保证旧测试零改动通过）。

- [ ] **Step 5: Commit**

```bash
git add src/shared/diagnostics src/core/opencode/diagnostics/OpenCodeTraceRedactor.ts src/core/opencode/diagnostics/types.ts tests/unit/shared/diagnostics/TraceRedactor.test.ts
git commit -m "refactor(diagnostics): sink trace redactor and base event types into shared diagnostics"
```

---

### Task 2: TraceStore 泛化（类型参数 + bundlePrefix 选项）

**Files:**
- Create: `src/shared/diagnostics/TraceStore.ts`（由 `OpenCodeTraceStore.ts` 移动泛化）
- Modify: `src/shared/diagnostics/index.ts`（追加导出）
- Modify: `src/core/opencode/diagnostics/OpenCodeTraceStore.ts`（变为薄子类包装）
- Test: `tests/unit/shared/diagnostics/TraceStore.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `TraceEventBase` / `TraceSummary` / `TraceStoreStatus` / `resolveDefaultTraceDirectory`。
- Produces:
  - `class TraceStore<TEvent extends TraceEventBase = TraceEventBase>`，public API 与原 `OpenCodeTraceStore` 完全一致（`rootDirectory`、`append(event: TEvent, deep?: boolean)`、`flush()`、`dispose()`、`resolveTraceId(sessionId)`、`bindSession(sessionId, traceId)`、`onDegraded(listener: (error: unknown, template?: TEvent) => void)`、`getStatus()`、`listSummaries(limit?)`、`markTraceRead(traceId)`、`getOrCreateLocalSalt()`、`readTrace(traceId): Promise<TEvent[]>`、`readDeepRun(runId): Promise<TEvent[]>`、`readRuntimeSegment(id): Promise<TEvent[]>`、`deleteTrace(traceId)`、`clear()`、`exportTraceBundle(traceId, targetDirectory): Promise<string>`）。
  - 构造签名：`constructor(customDirectory?: string, fallbackDirectory?: string, options?: { bundlePrefix?: string })`；`bundlePrefix` 默认 `'trace'`。
  - `OpenCodeTraceStore extends TraceStore<OpenCodeTraceEventV1>`，保持旧构造签名 `(customDirectory?, fallbackDirectory = resolveDefaultOpenCodeTraceDirectory())`。

- [ ] **Step 1: 写失败测试**

`tests/unit/shared/diagnostics/TraceStore.test.ts`：

```ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TraceStore } from '../../../../src/shared/diagnostics';
import type { TraceEventBase } from '../../../../src/shared/diagnostics';

function event(overrides: Partial<TraceEventBase> = {}): TraceEventBase {
  return {
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    monotonicSequence: 1,
    traceId: 'trace-x',
    runtimeSegmentId: 'seg-x',
    channel: 'transport',
    source: 'app-server',
    severity: 'info',
    name: 'test.event',
    ...overrides,
  };
}

describe('TraceStore (shared)', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencodian-shared-store-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('writes structural events per traceId and reads them back', async () => {
    const store = new TraceStore(undefined, dir);
    store.append(event({ sessionId: 'thread-1', traceId: 'trace-a' }));
    await store.flush();
    const events = await store.readTrace('trace-a');
    expect(events).toHaveLength(1);
    expect(events[0].sessionId).toBe('thread-1');
    await store.dispose();
  });

  it('resolves bound session ids to trace ids', () => {
    const store = new TraceStore(undefined, dir);
    store.bindSession('thread-9', 'trace-9');
    expect(store.resolveTraceId('thread-9')).toBe('trace-9');
  });

  it('uses the bundlePrefix for exported bundle directories', async () => {
    const store = new TraceStore(undefined, dir, { bundlePrefix: 'codex-trace' });
    store.append(event({ sessionId: 'thread-1', traceId: 'trace-b' }));
    await store.flush();
    const target = fs.mkdtempSync(path.join(os.tmpdir(), 'opencodian-export-'));
    const bundlePath = await store.exportTraceBundle('trace-b', target);
    expect(path.basename(bundlePath)).toMatch(/^codex-trace-trace-b-/);
    fs.rmSync(target, { recursive: true, force: true });
    await store.dispose();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node scripts/run-jest.js tests/unit/shared/diagnostics/TraceStore.test.ts`
Expected: FAIL（`TraceStore` 未导出）。

- [ ] **Step 3: 实现泛化 store**

将 `src/core/opencode/diagnostics/OpenCodeTraceStore.ts` 的实现移动到 `src/shared/diagnostics/TraceStore.ts`，做且仅做以下改动：

1. 类声明：`export class TraceStore<TEvent extends TraceEventBase = TraceEventBase>`；所有 `OpenCodeTraceEventV1` 引用替换为 `TEvent`，`OpenCodeTraceSummary` → `TraceSummary`，`OpenCodeTraceStoreStatus` → `TraceStoreStatus`（import 自 `./types`）。
2. 构造签名改为 `constructor(customDirectory?: string, fallbackDirectory?: string, options?: { bundlePrefix?: string })`；`fallbackDirectory` 缺省为 `path.join(os.homedir(), '.config', 'obsidian', 'OpenCodian', 'diagnostics')`（generic 兜底，正常调用方总会显式传入）；`this.bundlePrefix = options?.bundlePrefix ?? 'trace'`。
3. `exportTraceBundle` 中的 `'opencode-trace-'` 前缀替换为 `` `${this.bundlePrefix}-` ``。
4. 删除模块级 `resolveDefaultOpenCodeTraceDirectory()` 与私有 `defaultUserDataDirectory()`；fallback 逻辑直接内联上面的 generic 兜底。
5. `QueuedRecord`、`PersistedTraceIndex`、`isRuntimeEvent`、queue/retention/degrade/rebuildIndex 等全部私有逻辑原样保留（它们只依赖 `TraceEventBase` 已有字段：`sessionId`、`traceId`、`runtimeSegmentId`、`runId`、`monotonicSequence`、`timestamp`、`severity`、`name`、`sourceEventId`、`payloadRef`）。

`src/shared/diagnostics/index.ts` 追加 `export * from './TraceStore';`。

`src/core/opencode/diagnostics/OpenCodeTraceStore.ts` 整个替换为（完整内容）：

```ts
// Compatibility wrapper. Implementation lives in src/shared/diagnostics/TraceStore.ts.
import { TraceStore, resolveDefaultTraceDirectory } from '../../../shared/diagnostics';
import type { OpenCodeTraceEventV1 } from './types';

export function resolveDefaultOpenCodeTraceDirectory(): string {
  return resolveDefaultTraceDirectory('opencode');
}

export class OpenCodeTraceStore extends TraceStore<OpenCodeTraceEventV1> {
  constructor(customDirectory?: string, fallbackDirectory = resolveDefaultOpenCodeTraceDirectory()) {
    super(customDirectory, fallbackDirectory, { bundlePrefix: 'opencode-trace' });
  }
}
```

- [ ] **Step 4: 运行新测试 + 全部 store 相关回归**

Run: `node scripts/run-jest.js tests/unit/shared/diagnostics tests/unit/core/opencode/OpenCodeDiagnostics.test.ts tests/unit/core/opencode/OpenCodeTraceStoreHardening.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/shared/diagnostics src/core/opencode/diagnostics/OpenCodeTraceStore.ts tests/unit/shared/diagnostics/TraceStore.test.ts
git commit -m "refactor(diagnostics): generalize trace store over event type and bundle prefix"
```

---
### Task 3: TraceReportBuilder 泛化（标题 + 元信息提取器注入）

**Files:**
- Create: `src/shared/diagnostics/TraceReportBuilder.ts`（由 `OpenCodeTraceReportBuilder.ts` 移动泛化）
- Modify: `src/shared/diagnostics/index.ts`（追加导出）
- Modify: `src/core/opencode/diagnostics/OpenCodeTraceReportBuilder.ts`（变为薄子类包装）
- Test: `tests/unit/shared/diagnostics/TraceReportBuilder.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `TraceStore<TEvent>`、Task 1 的 `TraceRedactor`。
- Produces:
  - `class TraceReportBuilder<TEvent extends TraceEventBase = TraceEventBase>`，构造：`constructor(store: TraceStore<TEvent>, buildIdentity: () => string, redactor: TraceRedactor, options: { title: string; extractMetadata?: (events: TEvent[]) => string[] })`。
  - 方法签名不变：`buildSmartReport(traceId?: string, userContext?: { actual?: string; expected?: string; reproduction?: string }, options?: { selection?: 'automatic' | 'current-session' }): Promise<string>`。

- [ ] **Step 1: 写失败测试**

`tests/unit/shared/diagnostics/TraceReportBuilder.test.ts`：

```ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TraceStore, TraceRedactor, TraceReportBuilder } from '../../../../src/shared/diagnostics';
import type { TraceEventBase } from '../../../../src/shared/diagnostics';

function event(overrides: Partial<TraceEventBase> = {}): TraceEventBase {
  return {
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    monotonicSequence: 1,
    traceId: 'trace-r',
    runtimeSegmentId: 'seg-r',
    sessionId: 'thread-1',
    channel: 'lifecycle',
    source: 'plugin',
    severity: 'info',
    name: 'turn.started',
    ...overrides,
  };
}

describe('TraceReportBuilder (shared)', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencodian-shared-report-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('renders the injected title and metadata lines', async () => {
    const store = new TraceStore(undefined, dir);
    store.append(event());
    await store.flush();
    const builder = new TraceReportBuilder(store, () => 'Build: test', new TraceRedactor(), {
      title: 'OpenCodian Codex Session Trace',
      extractMetadata: () => ['Threads: 1', 'Turns: 3'],
    });
    const report = await builder.buildSmartReport('trace-r');
    expect(report).toContain('# OpenCodian Codex Session Trace');
    expect(report).toContain('Threads: 1');
    expect(report).toContain('## Trace events');
    await store.dispose();
  });

  it('redacts secrets in rendered reports', async () => {
    const store = new TraceStore(undefined, dir);
    store.append(event({ payload: { note: 'sk-live-secret-9999' } }));
    await store.flush();
    const builder = new TraceReportBuilder(store, () => 'Build: test', new TraceRedactor({ knownSecrets: ['sk-live-secret-9999'] }), {
      title: 'T',
    });
    const report = await builder.buildSmartReport('trace-r');
    expect(report).not.toContain('sk-live-secret-9999');
    await store.dispose();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node scripts/run-jest.js tests/unit/shared/diagnostics/TraceReportBuilder.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现泛化 report builder**

将 `src/core/opencode/diagnostics/OpenCodeTraceReportBuilder.ts` 移动到 `src/shared/diagnostics/TraceReportBuilder.ts`，改动：

1. 类声明泛化：`export class TraceReportBuilder<TEvent extends TraceEventBase = TraceEventBase>`；`OpenCodeTraceEventV1` → `TEvent`；store 类型 `TraceStore<TEvent>`；redactor 类型 `TraceRedactor`。
2. 构造增加第 4 参数 `options: { title: string; extractMetadata?: (events: TEvent[]) => string[] }`。
3. 报告头 `'# OpenCodian OpenCode Session Trace'` → `` `# ${this.options.title}` ``。
4. 私有 `buildMetadataLines(events)` 改为：`return this.options.extractMetadata?.(events) ?? [];`（OpenCode 专属的 `run.started` / `credential.identity` / `runtime.started` 提取逻辑移出）。
5. `eventLine`、`chooseSummary`、`selectEventWindows`、`mergeEvents`、`capAndSanitize`、`MAX_REPORT_BYTES`、`WINDOW_SIZE` 原样保留。

`src/shared/diagnostics/index.ts` 追加 `export * from './TraceReportBuilder';`。

`src/core/opencode/diagnostics/OpenCodeTraceReportBuilder.ts` 整个替换为兼容包装（完整内容）：

```ts
// Compatibility wrapper. Implementation lives in src/shared/diagnostics/TraceReportBuilder.ts.
import { TraceReportBuilder } from '../../../shared/diagnostics';
import type { TraceRedactor } from '../../../shared/diagnostics';
import type { OpenCodeTraceEventV1 } from './types';
import type { OpenCodeTraceStore } from './OpenCodeTraceStore';

export class OpenCodeTraceReportBuilder extends TraceReportBuilder<OpenCodeTraceEventV1> {
  constructor(store: OpenCodeTraceStore, buildIdentity: () => string, redactor: TraceRedactor) {
    super(store, buildIdentity, redactor, {
      title: 'OpenCodian OpenCode Session Trace',
      extractMetadata: extractOpenCodeTraceMetadata,
    });
  }
}

function extractOpenCodeTraceMetadata(events: OpenCodeTraceEventV1[]): string[] {
  // 从原 OpenCodeTraceReportBuilder.buildMetadataLines 原样迁入：
  // runtime segment 计数、run.started 的 providers/models、runtime.started 的
  // serverMode/baseUrl connections、credential.identity 的 HMAC 指纹、
  // metrics.redactedSecrets/normalizedPaths/truncatedValues 汇总。
  // （机械移动，不改逻辑。）
  /* …原 buildMetadataLines 实现… */
}
```

实现时把原 `buildMetadataLines` 的方法体逐字搬进 `extractOpenCodeTraceMetadata`（`this.` 引用改为局部逻辑），不得改写其计算逻辑。

- [ ] **Step 4: 运行新测试 + 回归**

Run: `node scripts/run-jest.js tests/unit/shared/diagnostics tests/unit/core/opencode/OpenCodeDiagnostics.test.ts tests/unit/core/opencode/OpenCodeTraceStoreHardening.test.ts tests/unit/features/settings/SettingsDebugSection.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/shared/diagnostics src/core/opencode/diagnostics/OpenCodeTraceReportBuilder.ts tests/unit/shared/diagnostics/TraceReportBuilder.test.ts
git commit -m "refactor(diagnostics): generalize trace report builder with injectable title and metadata"
```

---

### Task 4: Codex 诊断类型 + 设置 schema/默认值/归一化

**Files:**
- Create: `src/core/agents/backend/diagnostics/types.ts`
- Create: `src/core/agents/backend/diagnostics/index.ts`（暂只导出 types）
- Modify: `src/core/types/settings.ts`（`CodexBackendSettings` 增加 `sessionTrace`、默认值、归一化）
- Test: `tests/unit/core/types/codexTraceSettings.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `TraceEventBase` / `TraceTerminalState`。
- Produces（Task 5/7/8/9/10/11 依赖）:

```ts
export const CODEX_TRACE_SCHEMA_VERSION = 1 as const;
export const CODEX_TRACE_CHANNEL_IDS = ['lifecycle', 'transport', 'stream-sync', 'tool-interaction', 'service-output'] as const;
export type CodexTraceChannelId = typeof CODEX_TRACE_CHANNEL_IDS[number];
export type CodexTraceSource = 'plugin' | 'app-server' | 'cli' | 'storage';
export interface CodexTraceEventV1 extends TraceEventBase {
  schemaVersion: typeof CODEX_TRACE_SCHEMA_VERSION;
  channel: CodexTraceChannelId;
  source: CodexTraceSource;
  turnId?: string;
  itemId?: string;
}
export interface CodexTraceContext {
  traceId: string;
  runtimeSegmentId: string;
  runId?: string;
  threadId?: string;
  turnId?: string;
  conversationId?: string;
  tabId?: string;
  deepCapture?: boolean;
}
export interface CodexDiagnosticRunToken { runId: string; tabId: string; armedAt: number; expiresAt: number; }
export interface CodexSessionTraceSettings {
  enabled: boolean;
  consolePreset: 'standard' | 'full';
  consoleChannels: Record<CodexTraceChannelId, boolean>;
  storageDirectory: string;
  captureContent: boolean;
}
export interface CodexWireRecord {
  direction: 'out' | 'in';
  kind: 'request' | 'response' | 'notification' | 'server-request' | 'server-reply' | 'connection';
  method?: string;
  requestId?: number | string;
  threadId?: string;
  ok?: boolean;
  durationMs?: number;
  bytes: number;
  payload?: unknown;
}
export interface CodexTracePort {
  bindThread(input: { threadId: string; provisionalId?: string; conversationId?: string; tabId?: string; resumed: boolean; via: 'app-server' | 'sdk'; payload?: unknown }): CodexTraceContext;
  beginTurn(input: { threadId: string; turnId?: string; conversationId?: string; tabId?: string; model?: string; diagnosticRunToken?: CodexDiagnosticRunToken; payload?: unknown }): CodexTraceContext;
  recordTurnNotification(context: CodexTraceContext, method: string, payload?: unknown): void;
  recordStreamSync(context: CodexTraceContext | undefined, name: string, severity: 'debug' | 'info' | 'warning', payload?: unknown): void;
  recordToolInteraction(context: CodexTraceContext | undefined, name: string, payload?: unknown): void;
  recordLifecycle(name: string, payload?: unknown): void;
  recordWireEvent(record: CodexWireRecord): void;
  recordServiceOutput(stream: 'stdout' | 'stderr', text: string): void;
  finishTurn(context: CodexTraceContext, state: TraceTerminalState, payload?: unknown): void;
  markAnomaly(context: CodexTraceContext | undefined, name: string, severity: 'warning' | 'critical' | 'error', payload?: unknown): void;
  armDeepCapture(tabId: string, threadId?: string): CodexDiagnosticRunToken;
  cancelDeepCapture(tabId: string): boolean;
  claimDeepCapture(tabId: string, threadId?: string): CodexDiagnosticRunToken | undefined;
  getCaptureState(tabId: string): 'off' | 'armed' | 'capturing';
}
```

- [ ] **Step 1: 写失败测试**

`tests/unit/core/types/codexTraceSettings.test.ts`：

```ts
import { getDefaultBackendSettings, normalizeBackendSettings } from '../../../src/core/types/settings';
import { CODEX_TRACE_CHANNEL_IDS } from '../../../src/core/agents/backend/diagnostics/types';

describe('codex sessionTrace settings', () => {
  it('provides defaults mirroring the opencode trace defaults plus captureContent', () => {
    const defaults = getDefaultBackendSettings();
    const trace = defaults.codex.sessionTrace;
    expect(trace.enabled).toBe(true);
    expect(trace.consolePreset).toBe('standard');
    expect(trace.storageDirectory).toBe('');
    expect(trace.captureContent).toBe(true);
    for (const channel of CODEX_TRACE_CHANNEL_IDS) {
      expect(trace.consoleChannels[channel]).toBe(true);
    }
  });

  it('normalizes missing/partial persisted values', () => {
    const normalized = normalizeBackendSettings({ codex: { sessionTrace: { enabled: false, consolePreset: 'full', consoleChannels: { transport: false }, storageDirectory: '  /tmp/x  ', captureContent: false } } } as never);
    const trace = normalized.codex.sessionTrace;
    expect(trace.enabled).toBe(false);
    expect(trace.consolePreset).toBe('full');
    expect(trace.consoleChannels.transport).toBe(false);
    expect(trace.consoleChannels.lifecycle).toBe(true);
    expect(trace.storageDirectory).toBe('/tmp/x');
    expect(trace.captureContent).toBe(false);
  });

  it('defaults captureContent to true unless explicitly false', () => {
    const normalized = normalizeBackendSettings({ codex: {} } as never);
    expect(normalized.codex.sessionTrace.captureContent).toBe(true);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node scripts/run-jest.js tests/unit/core/types/codexTraceSettings.test.ts`
Expected: FAIL（`sessionTrace` 不存在）。

- [ ] **Step 3: 实现**

1. `src/core/agents/backend/diagnostics/types.ts`：按上面 Produces 块逐字创建（import `TraceEventBase` / `TraceTerminalState` / `TraceSeverity` 自 `../../../../../shared/diagnostics`）。
2. `src/core/agents/backend/diagnostics/index.ts`：`export * from './types';`
3. `src/core/types/settings.ts`：
   - import：`import type { CodexSessionTraceSettings } from '../agents/backend/diagnostics/types';` 及 `import { CODEX_TRACE_CHANNEL_IDS } from '../agents/backend/diagnostics/types';`（参照现有 `OPEN_CODE_TRACE_CHANNEL_IDS` 的 import 方式，settings.ts:18-21 附近）。
   - `CodexBackendSettings` 接口（现有 `normalizeCodexBackendSettings` 所在的 codex 设置接口）追加字段 `sessionTrace: CodexSessionTraceSettings;`。
   - 新增 `getDefaultCodexSessionTraceSettings(): CodexSessionTraceSettings`，返回 `{ enabled: true, consolePreset: 'standard', consoleChannels: Object.fromEntries(CODEX_TRACE_CHANNEL_IDS.map((id) => [id, true])) as Record<CodexTraceChannelId, boolean>, storageDirectory: '', captureContent: true }`。
   - 在 codex 默认值 getter（`getDefaultCodexBackendSettings`）中挂 `sessionTrace: getDefaultCodexSessionTraceSettings()`。
   - 在 `normalizeCodexBackendSettings`（settings.ts:910 附近）中追加归一化，逐字段镜像 opencode 块（settings.ts:885-907）的模式：`enabled !== false`、`consolePreset === 'full' ? 'full' : 'standard'`、按 `CODEX_TRACE_CHANNEL_IDS` 重建 channel map（`raw?.[id] === false ? false : true`）、`storageDirectory` trim、`captureContent !== false`。

- [ ] **Step 4: 运行测试 + 类型检查**

Run: `node scripts/run-jest.js tests/unit/core/types/codexTraceSettings.test.ts tests/unit/core/types/openCodeTraceSettings.test.ts`
Expected: PASS。再跑 `npx tsc --noEmit`（或 `npm run typecheck`）确认无类型错误。

- [ ] **Step 5: Commit**

```bash
git add src/core/agents/backend/diagnostics src/core/types/settings.ts tests/unit/core/types/codexTraceSettings.test.ts
git commit -m "feat(codex-trace): add codex trace event types and settings schema"
```

---
### Task 5: CodexSessionTraceService 核心（绑定/发射/深度捕获/生命周期）

**Files:**
- Create: `src/core/agents/backend/diagnostics/CodexSessionTraceService.ts`
- Create: `src/core/agents/backend/diagnostics/CodexTraceRingBuffer.ts`
- Create: `src/core/agents/backend/diagnostics/CodexWireTraceBridge.ts`
- Modify: `src/core/agents/backend/diagnostics/index.ts`（追加导出）
- Test: `tests/unit/core/agents/backend/diagnostics/CodexSessionTraceService.test.ts`
- Test: `tests/unit/core/agents/backend/diagnostics/CodexTraceRingBuffer.test.ts`

**Interfaces:**
- Consumes: Task 1-3 共享件（`TraceStore` / `TraceRedactor` / `TraceReportBuilder` / `resolveDefaultTraceDirectory`），Task 4 类型。
- Produces:
  - `class CodexSessionTraceService implements CodexTracePort`；public 字段 `readonly runtimeSegmentId: string`、`readonly store: TraceStore<CodexTraceEventV1>`、`readonly reportBuilder: TraceReportBuilder<CodexTraceEventV1>`、`readonly wireBridge: CodexWireTraceBridge`；方法 `dispose(): Promise<void>`、`flushRingBuffer(threadId: string | undefined, reason: string): void`。
  - 构造：`constructor(options: { settings: () => CodexSessionTraceSettings; vaultPath?: string; buildIdentity?: () => string; knownSecrets?: () => readonly string[]; runtimeMetadata?: () => Record<string, unknown> })`。
  - `class CodexTraceRingBuffer`：`constructor(options?: { perThreadBytes?: number; totalBytes?: number })`；`record(threadId: string | undefined, entry: { recordedAt: number; record: CodexWireRecord }): void`；`drain(threadId?: string): Array<{ recordedAt: number; record: CodexWireRecord }>`（返回该 thread + 共享 lane(undefined) 的条目并清除）；`sizeBytes(): number`。
  - `class CodexWireTraceBridge`：`constructor(service: CodexSessionTraceService)`；实现 `CodexAppServerWireObserver`（Task 7 定义，本任务先定义桥的方法名为 `onRequest/onResponse/onNotification/onServerRequest/onServerReply/onConnection`，签名与 Task 7 接口块一致）。

- [ ] **Step 1: 写失败测试（service）**

`tests/unit/core/agents/backend/diagnostics/CodexSessionTraceService.test.ts`（模式对齐 `tests/unit/core/opencode/OpenCodeDiagnostics.test.ts`：真实 fs 临时目录、console channels 全 false）：

```ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CodexSessionTraceService } from '../../../../../../src/core/agents/backend/diagnostics/CodexSessionTraceService';
import type { CodexSessionTraceSettings } from '../../../../../../src/core/agents/backend/diagnostics/types';
import { CODEX_TRACE_CHANNEL_IDS } from '../../../../../../src/core/agents/backend/diagnostics/types';

function traceSettings(storageDirectory: string): CodexSessionTraceSettings {
  return {
    enabled: true,
    consolePreset: 'standard',
    consoleChannels: Object.fromEntries(CODEX_TRACE_CHANNEL_IDS.map((id) => [id, false])) as CodexSessionTraceSettings['consoleChannels'],
    storageDirectory,
    captureContent: true,
  };
}

describe('CodexSessionTraceService', () => {
  let dir: string;
  let service: CodexSessionTraceService;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencodian-codex-trace-'));
    service = new CodexSessionTraceService({ settings: () => traceSettings(dir) });
  });
  afterEach(async () => {
    await service.dispose();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('binds a thread to a stable trace id and resumes it across service instances', async () => {
    const first = service.bindThread({ threadId: 'thread-abc', resumed: false, via: 'app-server' });
    expect(first.traceId).toMatch(/^trace-[0-9a-f]{32}$/);
    await service.store.flush();
    const second = service.bindThread({ threadId: 'thread-abc', resumed: true, via: 'app-server' });
    expect(second.traceId).toBe(first.traceId);
    const names = (await service.store.readTrace(first.traceId)).map((event) => event.name);
    expect(names).toContain('thread.bound');
    expect(names).toContain('thread.resumed');
  });

  it('records a turn lifecycle and finishes with terminal state', async () => {
    const bound = service.bindThread({ threadId: 'thread-t1', resumed: false, via: 'app-server' });
    const turn = service.beginTurn({ threadId: 'thread-t1', turnId: 'turn-1' });
    expect(turn.traceId).toBe(bound.traceId);
    service.recordTurnNotification(turn, 'item/agentMessage/delta', { threadId: 'thread-t1' });
    service.finishTurn(turn, 'completed');
    await service.store.flush();
    const names = (await service.store.readTrace(bound.traceId)).map((event) => event.name);
    expect(names).toEqual(expect.arrayContaining(['turn.started', 'turn.notification', 'turn.finished']));
  });

  it('writes deep payloads only for claimed deep-capture runs', async () => {
    service.bindThread({ threadId: 'thread-d1', resumed: false, via: 'app-server' });
    service.armDeepCapture('tab-1', 'thread-d1');
    const token = service.claimDeepCapture('tab-1', 'thread-d1');
    const turn = service.beginTurn({ threadId: 'thread-d1', turnId: 'turn-9', diagnosticRunToken: token });
    service.recordWireEvent({ direction: 'in', kind: 'notification', method: 'item/agentMessage/delta', threadId: 'thread-d1', bytes: 42, payload: { delta: 'secret body' } });
    service.finishTurn(turn, 'completed');
    await service.store.flush();
    const structural = await service.store.readTrace(turn.traceId);
    const wireEvent = structural.find((event) => event.name === 'wire.notification');
    expect(wireEvent?.payloadRef?.kind).toBe('deep');
    const deep = await service.store.readDeepRun(turn.runId as string);
    expect(JSON.stringify(deep)).toContain('secret body');
  });

  it('keeps wire payloads as shape summaries when not deep-capturing', async () => {
    service.bindThread({ threadId: 'thread-s1', resumed: false, via: 'app-server' });
    service.recordWireEvent({ direction: 'in', kind: 'notification', method: 'item/agentMessage/delta', threadId: 'thread-s1', bytes: 42, payload: { delta: 'should not persist' } });
    await service.store.flush();
    const events = await service.store.readTrace(service.store.resolveTraceId('thread-s1') as string);
    const wire = events.find((event) => event.name === 'wire.notification');
    expect(JSON.stringify(wire?.payload)).not.toContain('should not persist');
  });

  it('respects captureContent=false during deep capture', async () => {
    await service.dispose();
    service = new CodexSessionTraceService({ settings: () => ({ ...traceSettings(dir), captureContent: false }) });
    service.bindThread({ threadId: 'thread-c1', resumed: false, via: 'app-server' });
    service.armDeepCapture('tab-1', 'thread-c1');
    const token = service.claimDeepCapture('tab-1', 'thread-c1');
    const turn = service.beginTurn({ threadId: 'thread-c1', diagnosticRunToken: token });
    service.recordWireEvent({ direction: 'in', kind: 'notification', method: 'item/agentMessage/delta', threadId: 'thread-c1', bytes: 10, payload: { delta: 'hidden body' } });
    service.finishTurn(turn, 'completed');
    await service.store.flush();
    const deep = await service.store.readDeepRun(turn.runId as string);
    expect(JSON.stringify(deep)).not.toContain('hidden body');
  });

  it('does nothing when disabled', async () => {
    await service.dispose();
    service = new CodexSessionTraceService({ settings: () => ({ ...traceSettings(dir), enabled: false }) });
    const bound = service.bindThread({ threadId: 'thread-off', resumed: false, via: 'app-server' });
    service.finishTurn(service.beginTurn({ threadId: 'thread-off' }), 'completed');
    await service.store.flush();
    const events = await service.store.readTrace(bound.traceId);
    expect(events.filter((event) => event.name !== 'runtime.started')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 写失败测试（ring buffer）**

`tests/unit/core/agents/backend/diagnostics/CodexTraceRingBuffer.test.ts`：

```ts
import { CodexTraceRingBuffer } from '../../../../../../src/core/agents/backend/diagnostics/CodexTraceRingBuffer';
import type { CodexWireRecord } from '../../../../../../src/core/agents/backend/diagnostics/types';

function record(bytes: number): CodexWireRecord {
  return { direction: 'in', kind: 'notification', method: 'm', bytes };
}

describe('CodexTraceRingBuffer', () => {
  it('drains per-thread entries together with the shared lane', () => {
    const buffer = new CodexTraceRingBuffer();
    buffer.record('t1', { recordedAt: 1, record: record(10) });
    buffer.record(undefined, { recordedAt: 2, record: record(10) });
    buffer.record('t2', { recordedAt: 3, record: record(10) });
    const drained = buffer.drain('t1');
    expect(drained.map((entry) => entry.recordedAt)).toEqual([1, 2]);
    expect(buffer.sizeBytes()).toBe(10);
  });

  it('evicts oldest entries of a thread beyond the per-thread byte cap', () => {
    const buffer = new CodexTraceRingBuffer({ perThreadBytes: 25, totalBytes: 1000 });
    buffer.record('t1', { recordedAt: 1, record: record(10) });
    buffer.record('t1', { recordedAt: 2, record: record(10) });
    buffer.record('t1', { recordedAt: 3, record: record(10) });
    expect(buffer.drain('t1').map((entry) => entry.recordedAt)).toEqual([2, 3]);
  });

  it('evicts globally oldest entries beyond the total byte cap', () => {
    const buffer = new CodexTraceRingBuffer({ perThreadBytes: 1000, totalBytes: 25 });
    buffer.record('t1', { recordedAt: 1, record: record(10) });
    buffer.record('t2', { recordedAt: 2, record: record(10) });
    buffer.record('t3', { recordedAt: 3, record: record(10) });
    expect(buffer.sizeBytes()).toBe(20);
    expect(buffer.drain('t1')).toHaveLength(0);
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `node scripts/run-jest.js tests/unit/core/agents/backend/diagnostics`
Expected: FAIL（模块不存在）。

- [ ] **Step 4: 实现三个新模块**

`src/core/agents/backend/diagnostics/CodexTraceRingBuffer.ts`（完整实现）：

```ts
import type { CodexWireRecord } from './types';

export interface CodexTraceRingBufferEntry {
  recordedAt: number;
  record: CodexWireRecord;
}

const DEFAULT_PER_THREAD_BYTES = 5 * 1024 * 1024;
const DEFAULT_TOTAL_BYTES = 20 * 1024 * 1024;
const SHARED_LANE = '';

export class CodexTraceRingBuffer {
  private readonly perThreadBytes: number;
  private readonly totalBytes: number;
  private readonly lanes = new Map<string, CodexTraceRingBufferEntry[]>();
  private readonly laneBytes = new Map<string, number>();
  private total = 0;

  constructor(options?: { perThreadBytes?: number; totalBytes?: number }) {
    this.perThreadBytes = options?.perThreadBytes ?? DEFAULT_PER_THREAD_BYTES;
    this.totalBytes = options?.totalBytes ?? DEFAULT_TOTAL_BYTES;
  }

  record(threadId: string | undefined, entry: CodexTraceRingBufferEntry): void {
    const lane = threadId ?? SHARED_LANE;
    const entries = this.lanes.get(lane) ?? [];
    entries.push(entry);
    this.lanes.set(lane, entries);
    this.laneBytes.set(lane, (this.laneBytes.get(lane) ?? 0) + entry.record.bytes);
    this.total += entry.record.bytes;
    this.evictLane(lane);
    this.evictGlobal();
  }

  drain(threadId?: string): CodexTraceRingBufferEntry[] {
    const lanes = threadId === undefined ? [...this.lanes.keys()] : [threadId, SHARED_LANE];
    const drained: CodexTraceRingBufferEntry[] = [];
    for (const lane of lanes) {
      const entries = this.lanes.get(lane) ?? [];
      drained.push(...entries);
      this.lanes.delete(lane);
      this.laneBytes.delete(lane);
    }
    this.total = [...this.laneBytes.values()].reduce((sum, bytes) => sum + bytes, 0);
    return drained.sort((left, right) => left.recordedAt - right.recordedAt);
  }

  sizeBytes(): number {
    return this.total;
  }

  private evictLane(lane: string): void {
    const entries = this.lanes.get(lane);
    if (!entries) return;
    let bytes = this.laneBytes.get(lane) ?? 0;
    while (bytes > this.perThreadBytes && entries.length > 0) {
      const removed = entries.shift() as CodexTraceRingBufferEntry;
      bytes -= removed.record.bytes;
      this.total -= removed.record.bytes;
    }
    this.laneBytes.set(lane, bytes);
  }

  private evictGlobal(): void {
    while (this.total > this.totalBytes) {
      let oldestLane: string | undefined;
      let oldestAt = Number.POSITIVE_INFINITY;
      for (const [lane, entries] of this.lanes) {
        const first = entries[0];
        if (first && first.recordedAt < oldestAt) {
          oldestAt = first.recordedAt;
          oldestLane = lane;
        }
      }
      if (oldestLane === undefined) return;
      const removed = (this.lanes.get(oldestLane) as CodexTraceRingBufferEntry[]).shift() as CodexTraceRingBufferEntry;
      this.laneBytes.set(oldestLane, (this.laneBytes.get(oldestLane) ?? 0) - removed.record.bytes);
      this.total -= removed.record.bytes;
    }
  }
}
```

`src/core/agents/backend/diagnostics/CodexWireTraceBridge.ts`（完整实现）：

```ts
import type { CodexAppServerWireObserver } from '../CodexAppServerClientTypes';
import type { CodexWireRecord } from './types';
import type { CodexSessionTraceService } from './CodexSessionTraceService';

function byteSize(value: unknown): number {
  if (value === undefined) return 0;
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}

function threadIdOf(params: unknown): string | undefined {
  if (params && typeof params === 'object' && typeof (params as { threadId?: unknown }).threadId === 'string') {
    return (params as { threadId: string }).threadId;
  }
  return undefined;
}

/** Feeds raw wire traffic into the trace service (envelope) and the retroactive ring buffer (raw). */
export class CodexWireTraceBridge implements CodexAppServerWireObserver {
  constructor(private readonly service: CodexSessionTraceService) {}

  onRequest(input: { id: number; method: string; params: unknown; timeoutMs?: number }): void {
    this.emit({ direction: 'out', kind: 'request', method: input.method, requestId: input.id, threadId: threadIdOf(input.params), bytes: byteSize(input.params), payload: input.params });
  }

  onResponse(input: { id: number; ok: boolean; durationMs: number; error?: string }): void {
    this.emit({ direction: 'in', kind: 'response', requestId: input.id, ok: input.ok, durationMs: input.durationMs, bytes: byteSize(input.error), payload: input.error ? { error: input.error } : undefined });
  }

  onNotification(input: { method: string; params: unknown }): void {
    this.emit({ direction: 'in', kind: 'notification', method: input.method, threadId: threadIdOf(input.params), bytes: byteSize(input.params), payload: input.params });
  }

  onServerRequest(input: { id: number | string; method: string; params: unknown }): void {
    this.emit({ direction: 'in', kind: 'server-request', method: input.method, requestId: input.id, threadId: threadIdOf(input.params), bytes: byteSize(input.params), payload: input.params });
  }

  onServerReply(input: { id: number | string; ok: boolean }): void {
    this.emit({ direction: 'out', kind: 'server-reply', requestId: input.id, ok: input.ok, bytes: 0 });
  }

  onConnection(input: { state: 'starting' | 'ws-url' | 'connected' | 'initialized' | 'closed' | 'error' | 'stopped'; detail?: unknown }): void {
    this.emit({ direction: 'in', kind: 'connection', method: input.state, bytes: byteSize(input.detail), payload: input.detail });
  }

  private emit(record: CodexWireRecord): void {
    this.service.recordWireEvent(record);
  }
}
```

`src/core/agents/backend/diagnostics/CodexSessionTraceService.ts`（完整实现；模式对齐 `OpenCodeSessionTraceService` 但按 thread/turn 模型重写）：

```ts
import { createHash, randomUUID } from 'crypto';

import { createLogger } from '../../../../shared';
import {
  TraceRedactor,
  TraceReportBuilder,
  TraceStore,
  resolveDefaultTraceDirectory,
  type TraceSeverity,
  type TraceTerminalState,
} from '../../../../shared/diagnostics';
import { CodexTraceRingBuffer } from './CodexTraceRingBuffer';
import { CodexWireTraceBridge } from './CodexWireTraceBridge';
import {
  CODEX_TRACE_SCHEMA_VERSION,
  type CodexDiagnosticRunToken,
  type CodexSessionTraceSettings,
  type CodexTraceChannelId,
  type CodexTraceContext,
  type CodexTraceEventV1,
  type CodexTracePort,
  type CodexTraceSource,
  type CodexWireRecord,
} from './types';

const logger = createLogger('CodexTrace');
const ARM_TTL_MS = 30 * 60 * 1000;
const TURN_WARNING_MS = 60 * 1000;
const TURN_CRITICAL_MS = 180 * 1000;

export interface CodexSessionTraceServiceOptions {
  settings: () => CodexSessionTraceSettings;
  vaultPath?: string;
  buildIdentity?: () => string;
  knownSecrets?: () => readonly string[];
  runtimeMetadata?: () => Record<string, unknown>;
}

interface ArmedCapture {
  token: CodexDiagnosticRunToken;
  threadId?: string;
}

interface ActiveTurnState {
  context: CodexTraceContext;
  warningTimer: ReturnType<typeof setTimeout>;
  criticalTimer: ReturnType<typeof setTimeout>;
  flushedAtWarning: boolean;
  finished: boolean;
}

export class CodexSessionTraceService implements CodexTracePort {
  readonly runtimeSegmentId = randomUUID();
  readonly store: TraceStore<CodexTraceEventV1>;
  readonly reportBuilder: TraceReportBuilder<CodexTraceEventV1>;
  readonly wireBridge: CodexWireTraceBridge;
  private readonly redactor: TraceRedactor;
  private readonly ringBuffer = new CodexTraceRingBuffer();
  private sequence = 0;
  private readonly armedByTab = new Map<string, ArmedCapture>();
  private readonly claimedByTab = new Map<string, CodexDiagnosticRunToken>();
  private readonly threadContextById = new Map<string, CodexTraceContext>();
  private readonly activeTurnsByThread = new Map<string, ActiveTurnState>();

  constructor(private readonly options: CodexSessionTraceServiceOptions) {
    const storageDirectory = options.settings().storageDirectory.trim();
    this.store = new TraceStore<CodexTraceEventV1>(
      storageDirectory || undefined,
      resolveDefaultTraceDirectory('codex'),
      { bundlePrefix: 'codex-trace' },
    );
    this.redactor = new TraceRedactor({
      vaultPath: options.vaultPath,
      diagnosticsPath: this.store.rootDirectory,
      knownSecrets: options.knownSecrets?.(),
    });
    this.reportBuilder = new TraceReportBuilder<CodexTraceEventV1>(
      this.store,
      options.buildIdentity ?? (() => 'Build: unknown'),
      this.redactor,
      { title: 'OpenCodian Codex Session Trace', extractMetadata: extractCodexTraceMetadata },
    );
    this.wireBridge = new CodexWireTraceBridge(this);
    this.store.onDegraded((error) => {
      this.emit(this.runtimeContext(), 'lifecycle', 'storage', 'critical', 'trace.storage_degraded', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
    this.emit(this.runtimeContext(), 'lifecycle', 'plugin', 'info', 'runtime.started', {
      runtimeSegmentId: this.runtimeSegmentId,
      platform: process.platform,
      storageDirectory: this.store.rootDirectory,
      ...options.runtimeMetadata?.(),
    });
  }

  // ---- CodexTracePort ----

  bindThread(input: { threadId: string; provisionalId?: string; conversationId?: string; tabId?: string; resumed: boolean; via: 'app-server' | 'sdk'; payload?: unknown }): CodexTraceContext {
    const previousTraceId = this.store.resolveTraceId(input.threadId);
    const context: CodexTraceContext = {
      traceId: previousTraceId ?? this.stableTraceId(input.threadId),
      runtimeSegmentId: this.runtimeSegmentId,
      threadId: input.threadId,
      conversationId: input.conversationId,
      tabId: input.tabId,
    };
    this.store.bindSession(input.threadId, context.traceId);
    this.threadContextById.set(input.threadId, context);
    this.emit(context, 'lifecycle', 'plugin', 'info', input.resumed || previousTraceId ? 'thread.resumed' : 'thread.bound', {
      provisionalId: input.provisionalId,
      via: input.via,
      ...((input.payload as Record<string, unknown> | undefined) ?? {}),
    });
    return context;
  }

  beginTurn(input: { threadId: string; turnId?: string; conversationId?: string; tabId?: string; model?: string; diagnosticRunToken?: CodexDiagnosticRunToken; payload?: unknown }): CodexTraceContext {
    const bound = this.threadContextById.get(input.threadId) ?? this.bindThread({ threadId: input.threadId, resumed: true, via: 'app-server' });
    const token = input.diagnosticRunToken;
    const deepCapture = Boolean(token && token.expiresAt > Date.now());
    const context: CodexTraceContext = {
      ...bound,
      conversationId: input.conversationId ?? bound.conversationId,
      tabId: input.tabId ?? bound.tabId,
      turnId: input.turnId,
      runId: deepCapture ? token?.runId : undefined,
      deepCapture,
    };
    this.emit(context, 'lifecycle', 'plugin', 'info', 'turn.started', { model: input.model, deepCapture, ...(input.payload as Record<string, unknown> | undefined) });
    this.armTurnWatchdog(context);
    return context;
  }

  recordTurnNotification(context: CodexTraceContext, method: string, payload?: unknown): void {
    this.resetTurnWatchdog(context.threadId);
    const turn = this.activeTurnsByThread.get(context.threadId ?? '');
    this.emit(context, 'stream-sync', 'app-server', 'debug', 'turn.notification', this.summarize(payload), { metrics: { bytes: byteLength(payload) } });
    if (method === 'turn/completed' && turn && !turn.finished) {
      const errorText = readTurnError(payload);
      this.finishTurn(context, errorText ? 'error' : 'completed', errorText ? { error: errorText } : undefined);
    }
  }

  recordStreamSync(context: CodexTraceContext | undefined, name: string, severity: 'debug' | 'info' | 'warning', payload?: unknown): void {
    this.emit(context ?? this.runtimeContext(), 'stream-sync', 'plugin', severity, name, this.summarize(payload));
  }

  recordToolInteraction(context: CodexTraceContext | undefined, name: string, payload?: unknown): void {
    this.emit(context ?? this.runtimeContext(), 'tool-interaction', 'plugin', 'info', name, payload);
  }

  recordLifecycle(name: string, payload?: unknown): void {
    this.emit(this.runtimeContext(), 'lifecycle', 'plugin', 'info', name, payload);
  }

  recordServiceOutput(stream: 'stdout' | 'stderr', text: string): void {
    const redacted = this.redactor.redact(text, 'service-output');
    this.emit(this.runtimeContext(), 'service-output', 'cli', stream === 'stderr' ? 'warning' : 'debug', 'service.output', redacted.value, { metrics: this.redactionMetrics(redacted.stats) });
  }

  recordWireEvent(record: CodexWireRecord): void {
    this.ringBuffer.record(record.threadId, { recordedAt: Date.now(), record });
    if (record.kind === 'notification') this.resetTurnWatchdog(record.threadId);
    if (record.kind === 'connection' && (record.method === 'closed' || record.method === 'error')) {
      this.failActiveTurns(record.method === 'closed' ? 'transport.closed' : 'transport.error');
    }
    if (record.kind === 'response' && record.ok === false) {
      this.markAnomaly(this.contextForWire(record), 'wire.response_error', 'error', { requestId: record.requestId, error: record.payload });
      this.flushRingBuffer(record.threadId, 'response-error');
    }
    const context = this.contextForWire(record);
    const deep = Boolean(context.deepCapture);
    const name = `wire.${record.kind}`;
    const envelope: Record<string, unknown> = {
      direction: record.direction,
      method: record.method,
      requestId: record.requestId,
      ok: record.ok,
      bytes: record.bytes,
    };
    const deepPayload = deep && this.options.settings().captureContent ? record.payload : undefined;
    this.emit(context, 'transport', 'app-server', record.ok === false ? 'warning' : 'debug', name, deep ? deepPayload ?? this.summarize(record.payload) : envelope, {
      metrics: { bytes: record.bytes, ...(record.durationMs !== undefined ? { durationMs: record.durationMs } : {}) },
      forceDeep: deep,
    });
  }

  finishTurn(context: CodexTraceContext, state: TraceTerminalState, payload?: unknown): void {
    const turn = this.activeTurnsByThread.get(context.threadId ?? '');
    if (turn) {
      turn.finished = true;
      this.clearTurnWatchdog(turn);
      this.activeTurnsByThread.delete(context.threadId ?? '');
    }
    this.emit(context, 'lifecycle', 'plugin', state === 'completed' ? 'info' : state === 'cancelled' ? 'info' : 'warning', 'turn.finished', { state, ...(payload as Record<string, unknown> | undefined) });
    if (state === 'error' || state === 'incomplete') {
      this.flushRingBuffer(context.threadId, `turn-${state}`);
    }
  }

  markAnomaly(context: CodexTraceContext | undefined, name: string, severity: 'warning' | 'critical' | 'error', payload?: unknown): void {
    this.emit(context ?? this.runtimeContext(), 'lifecycle', 'plugin', severity, name, payload);
  }

  armDeepCapture(tabId: string, threadId?: string): CodexDiagnosticRunToken {
    const token: CodexDiagnosticRunToken = { runId: randomUUID(), tabId, armedAt: Date.now(), expiresAt: Date.now() + ARM_TTL_MS };
    this.armedByTab.set(tabId, { token, threadId });
    this.emit(this.runtimeContext(), 'lifecycle', 'plugin', 'info', 'capture.armed', { tabId, threadId, expiresAt: new Date(token.expiresAt).toISOString() });
    return token;
  }

  cancelDeepCapture(tabId: string): boolean {
    const existed = this.armedByTab.delete(tabId) || this.claimedByTab.delete(tabId);
    if (existed) this.emit(this.runtimeContext(), 'lifecycle', 'plugin', 'info', 'capture.cancelled', { tabId });
    return existed;
  }

  claimDeepCapture(tabId: string, threadId?: string): CodexDiagnosticRunToken | undefined {
    const armed = this.armedByTab.get(tabId);
    if (!armed || armed.token.expiresAt <= Date.now()) return undefined;
    if (armed.threadId && threadId && armed.threadId !== threadId) return undefined;
    this.armedByTab.delete(tabId);
    this.claimedByTab.set(tabId, armed.token);
    this.emit(this.runtimeContext(), 'lifecycle', 'plugin', 'info', 'capture.claimed', { tabId, threadId, runId: armed.token.runId });
    return armed.token;
  }

  getCaptureState(tabId: string): 'off' | 'armed' | 'capturing' {
    if (this.claimedByTab.has(tabId)) return 'capturing';
    const armed = this.armedByTab.get(tabId);
    return armed && armed.token.expiresAt > Date.now() ? 'armed' : 'off';
  }

  flushRingBuffer(threadId: string | undefined, reason: string): void {
    const entries = this.ringBuffer.drain(threadId);
    if (entries.length === 0) return;
    const retroRunId = `retro-${randomUUID()}`;
    const captureContent = this.options.settings().captureContent;
    const context = this.contextForThreadId(threadId);
    for (const entry of entries) {
      const payload = captureContent ? entry.record.payload : this.summarize(entry.record.payload);
      this.emit({ ...context, runId: retroRunId }, 'transport', 'app-server', 'info', 'wire.retroactive', { reason, recordedAt: new Date(entry.recordedAt).toISOString(), envelope: { direction: entry.record.direction, kind: entry.record.kind, method: entry.record.method, requestId: entry.record.requestId, bytes: entry.record.bytes }, payload }, { forceDeep: true, runId: retroRunId });
    }
  }

  async dispose(): Promise<void> {
    for (const turn of this.activeTurnsByThread.values()) this.clearTurnWatchdog(turn);
    this.activeTurnsByThread.clear();
    this.emit(this.runtimeContext(), 'lifecycle', 'plugin', 'info', 'runtime.stopped', { runtimeSegmentId: this.runtimeSegmentId });
    await this.store.dispose();
  }

  // ---- internals ----

  private runtimeContext(): CodexTraceContext {
    return { traceId: this.runtimeSegmentId, runtimeSegmentId: this.runtimeSegmentId };
  }

  private contextForThreadId(threadId: string | undefined): CodexTraceContext {
    if (!threadId) return this.runtimeContext();
    return this.threadContextById.get(threadId) ?? { ...this.runtimeContext(), traceId: this.stableTraceId(threadId), threadId };
  }

  private contextForWire(record: CodexWireRecord): CodexTraceContext {
    const threadContext = this.contextForThreadId(record.threadId);
    const turn = record.threadId ? this.activeTurnsByThread.get(record.threadId) : undefined;
    return turn ? turn.context : threadContext;
  }

  private stableTraceId(threadId: string): string {
    return `trace-${createHash('sha256').update(threadId).digest('hex').slice(0, 32)}`;
  }

  private armTurnWatchdog(context: CodexTraceContext): void {
    const threadId = context.threadId ?? '';
    const existing = this.activeTurnsByThread.get(threadId);
    if (existing) this.clearTurnWatchdog(existing);
    const state: ActiveTurnState = {
      context,
      flushedAtWarning: false,
      finished: false,
      warningTimer: setTimeout(() => this.onTurnSilent(threadId, 'warning'), TURN_WARNING_MS),
      criticalTimer: setTimeout(() => this.onTurnSilent(threadId, 'critical'), TURN_CRITICAL_MS),
    };
    this.activeTurnsByThread.set(threadId, state);
  }

  private resetTurnWatchdog(threadId: string | undefined): void {
    if (!threadId) return;
    const turn = this.activeTurnsByThread.get(threadId);
    if (!turn || turn.finished) return;
    clearTimeout(turn.warningTimer);
    clearTimeout(turn.criticalTimer);
    turn.warningTimer = setTimeout(() => this.onTurnSilent(threadId, 'warning'), TURN_WARNING_MS);
    turn.criticalTimer = setTimeout(() => this.onTurnSilent(threadId, 'critical'), TURN_CRITICAL_MS);
  }

  private clearTurnWatchdog(turn: ActiveTurnState): void {
    clearTimeout(turn.warningTimer);
    clearTimeout(turn.criticalTimer);
  }

  private onTurnSilent(threadId: string, level: 'warning' | 'critical'): void {
    const turn = this.activeTurnsByThread.get(threadId);
    if (!turn || turn.finished) return;
    const silentMs = level === 'warning' ? TURN_WARNING_MS : TURN_CRITICAL_MS;
    this.markAnomaly(turn.context, 'turn.stalled', level, { threadId, silentMs });
    if (level === 'warning' && !turn.flushedAtWarning) {
      turn.flushedAtWarning = true;
      this.flushRingBuffer(threadId, 'watchdog-warning');
    }
    if (level === 'critical') {
      this.finishTurn(turn.context, 'incomplete', { reason: 'watchdog-critical', silentMs });
    }
  }

  private failActiveTurns(reason: string): void {
    for (const [threadId, turn] of [...this.activeTurnsByThread]) {
      this.markAnomaly(turn.context, reason, 'error', { threadId });
      this.finishTurn(turn.context, 'error', { reason });
    }
  }

  private summarize(payload: unknown): unknown {
    if (payload === undefined || payload === null) return undefined;
    if (Array.isArray(payload)) return { type: 'array', length: payload.length };
    if (typeof payload === 'object') return { type: 'object', keys: Object.keys(payload as Record<string, unknown>).slice(0, 40) };
    if (typeof payload === 'string') return { type: 'string', length: payload.length };
    return { type: typeof payload };
  }

  private redactionMetrics(stats: { secretsRemoved: number; pathsNormalized: number; valuesTruncated: number }): Record<string, number> {
    return { redactedSecrets: stats.secretsRemoved, normalizedPaths: stats.pathsNormalized, truncatedValues: stats.valuesTruncated };
  }

  private emit(
    context: CodexTraceContext,
    channel: CodexTraceChannelId,
    source: CodexTraceSource,
    severity: TraceSeverity,
    name: string,
    payload?: unknown,
    options?: { metrics?: Record<string, number>; forceDeep?: boolean; runId?: string },
  ): void {
    if (!this.options.settings().enabled) return;
    const redacted = payload === undefined ? undefined : this.redactor.redact(payload, channel === 'service-output' ? 'service-output' : 'ordinary');
    const deep = Boolean(options?.forceDeep ?? context.deepCapture);
    const event: CodexTraceEventV1 = {
      schemaVersion: CODEX_TRACE_SCHEMA_VERSION,
      timestamp: new Date().toISOString(),
      monotonicSequence: ++this.sequence,
      traceId: context.traceId,
      runtimeSegmentId: context.runtimeSegmentId,
      runId: options?.runId ?? context.runId,
      sessionId: context.threadId,
      turnId: context.turnId,
      channel,
      source,
      severity,
      name,
      metrics: { ...(redacted ? this.redactionMetrics(redacted.stats) : {}), ...options?.metrics },
      payload: redacted?.value,
      payloadRef: { kind: deep ? 'deep' : 'inline', runId: options?.runId ?? context.runId },
    };
    this.store.append(event, deep);
    this.mirrorToConsole(event);
  }

  private mirrorToConsole(event: CodexTraceEventV1): void {
    const settings = this.options.settings();
    const always = event.severity === 'warning' || event.severity === 'critical' || event.severity === 'error';
    if (!always && settings.consolePreset !== 'full') return;
    if (!always && !settings.consoleChannels[event.channel]) return;
    const line = `[codex-trace] ${event.severity} ${event.channel}/${event.name}`;
    if (always) logger.warn(line, event.payload ?? '');
    else logger.debug(line, event.payload ?? '');
  }
}

function byteLength(value: unknown): number {
  if (value === undefined) return 0;
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}

function readTurnError(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const params = payload as { turn?: { error?: unknown }; error?: unknown };
  const candidate = params.turn?.error ?? params.error;
  if (!candidate) return undefined;
  if (typeof candidate === 'string') return candidate;
  if (typeof candidate === 'object' && typeof (candidate as { message?: unknown }).message === 'string') {
    return (candidate as { message: string }).message;
  }
  return 'unknown turn error';
}

function extractCodexTraceMetadata(events: CodexTraceEventV1[]): string[] {
  const threads = new Set(events.map((event) => event.sessionId).filter(Boolean));
  const turns = new Set(events.map((event) => event.turnId).filter(Boolean));
  const retro = events.filter((event) => event.name === 'wire.retroactive').length;
  const stalls = events.filter((event) => event.name === 'turn.stalled').length;
  const redactedSecrets = events.reduce((sum, event) => sum + (event.metrics?.redactedSecrets ?? 0), 0);
  return [
    `Threads: ${threads.size}`,
    `Turns: ${turns.size}`,
    `Retroactive wire events: ${retro}`,
    `Stall anomalies: ${stalls}`,
    `Redacted secrets: ${redactedSecrets}`,
  ];
}
```

`src/core/agents/backend/diagnostics/index.ts` 追加：

```ts
export * from './CodexSessionTraceService';
export * from './CodexTraceRingBuffer';
export * from './CodexWireTraceBridge';
```

- [ ] **Step 5: 运行测试**

Run: `node scripts/run-jest.js tests/unit/core/agents/backend/diagnostics tests/unit/core/types/codexTraceSettings.test.ts`
Expected: 全部 PASS（看门狗测试在 Task 6 补；本任务不测定时器路径）。

- [ ] **Step 6: Commit**

```bash
git add src/core/agents/backend/diagnostics tests/unit/core/agents/backend/diagnostics
git commit -m "feat(codex-trace): add codex session trace service, ring buffer, and wire bridge"
```

---

### Task 6: 看门狗与自动落盘触发测试（行为固化）

**Files:**
- Modify: `src/core/agents/backend/diagnostics/CodexSessionTraceService.ts`（仅当测试暴露问题时修）
- Test: `tests/unit/core/agents/backend/diagnostics/CodexSessionTraceService.watchdog.test.ts`

**Interfaces:**
- Consumes: Task 5 全部。
- Produces: 无新接口（固化既有行为）。

- [ ] **Step 1: 写失败/固化测试（jest fake timers）**

```ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CodexSessionTraceService } from '../../../../../../src/core/agents/backend/diagnostics/CodexSessionTraceService';
import { CODEX_TRACE_CHANNEL_IDS, type CodexSessionTraceSettings } from '../../../../../../src/core/agents/backend/diagnostics/types';

function traceSettings(storageDirectory: string): CodexSessionTraceSettings {
  return {
    enabled: true,
    consolePreset: 'standard',
    consoleChannels: Object.fromEntries(CODEX_TRACE_CHANNEL_IDS.map((id) => [id, false])) as CodexSessionTraceSettings['consoleChannels'],
    storageDirectory,
    captureContent: true,
  };
}

describe('CodexSessionTraceService watchdog', () => {
  let dir: string;
  let service: CodexSessionTraceService;
  beforeEach(() => {
    jest.useFakeTimers();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencodian-codex-watchdog-'));
    service = new CodexSessionTraceService({ settings: () => traceSettings(dir) });
  });
  afterEach(async () => {
    await service.dispose();
    jest.useRealTimers();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('warns at 60s of silence and flushes the ring buffer retroactively', async () => {
    const turn = service.beginTurn({ threadId: 'thread-w1', turnId: 'turn-w1' });
    service.recordWireEvent({ direction: 'in', kind: 'notification', method: 'item/agentMessage/delta', threadId: 'thread-w1', bytes: 10, payload: { delta: 'x' } });
    jest.advanceTimersByTime(60_000);
    await service.store.flush();
    const events = await service.store.readTrace(turn.traceId);
    expect(events.some((event) => event.name === 'turn.stalled' && event.severity === 'warning')).toBe(true);
    expect(events.some((event) => event.name === 'wire.retroactive')).toBe(true);
  });

  it('marks the turn incomplete at 180s of silence', async () => {
    const turn = service.beginTurn({ threadId: 'thread-w2', turnId: 'turn-w2' });
    jest.advanceTimersByTime(180_000);
    await service.store.flush();
    const events = await service.store.readTrace(turn.traceId);
    const finish = events.find((event) => event.name === 'turn.finished');
    expect((finish?.payload as { state?: string } | undefined)?.state).toBe('incomplete');
  });

  it('resets the watchdog on each notification', async () => {
    const turn = service.beginTurn({ threadId: 'thread-w3', turnId: 'turn-w3' });
    jest.advanceTimersByTime(50_000);
    service.recordWireEvent({ direction: 'in', kind: 'notification', method: 'item/agentMessage/delta', threadId: 'thread-w3', bytes: 5 });
    jest.advanceTimersByTime(50_000);
    await service.store.flush();
    const events = await service.store.readTrace(turn.traceId);
    expect(events.some((event) => event.name === 'turn.stalled')).toBe(false);
    service.finishTurn(turn, 'completed');
  });

  it('fails active turns when the transport closes', async () => {
    const turn = service.beginTurn({ threadId: 'thread-w4', turnId: 'turn-w4' });
    service.recordWireEvent({ direction: 'in', kind: 'connection', method: 'closed', bytes: 0 });
    await service.store.flush();
    const events = await service.store.readTrace(turn.traceId);
    expect(events.some((event) => event.name === 'transport.closed' && event.severity === 'error')).toBe(true);
    const finish = events.find((event) => event.name === 'turn.finished');
    expect((finish?.payload as { state?: string } | undefined)?.state).toBe('error');
  });
});
```

- [ ] **Step 2: 运行测试；若失败则修实现**

Run: `node scripts/run-jest.js tests/unit/core/agents/backend/diagnostics`
Expected: PASS。常见失败点：fake timers 下 `setTimeout` 在构造函数 `runtime.started` 之前注册——无碍；`recordWireEvent` 的 `resetTurnWatchdog` 必须在 `connection closed` 触发 `failActiveTurns` 之后才不再复活定时器（`failActiveTurns` 内 `finishTurn` 已清表）。若 `turn.stalled` 未出现，检查 `armTurnWatchdog` 是否在 `beginTurn` 中注册、`resetTurnWatchdog` 是否因 `threadId` undefined 早退。

- [ ] **Step 3: Commit**

```bash
git add src/core/agents/backend/diagnostics tests/unit/core/agents/backend/diagnostics
git commit -m "test(codex-trace): pin watchdog and retroactive flush behavior"
```

---
### Task 7: CodexAppServerTransport wire 插桩（observer 注入口）

**Files:**
- Modify: `src/core/agents/backend/CodexAppServerClientTypes.ts`（新增 `CodexAppServerWireObserver`）
- Modify: `src/core/agents/backend/CodexAppServerTransport.ts`（构造选项 + 6 个插桩点）
- Test: `tests/unit/core/agents/backend/CodexAppServerTransport.wireObserver.test.ts`

**Interfaces:**
- Consumes: 无。
- Produces:

```ts
// CodexAppServerClientTypes.ts 追加：
export interface CodexAppServerWireObserver {
  onRequest?(input: { id: number; method: string; params: unknown; timeoutMs?: number }): void;
  onResponse?(input: { id: number; ok: boolean; durationMs: number; error?: string }): void;
  onNotification?(input: { method: string; params: unknown }): void;
  onServerRequest?(input: { id: number | string; method: string; params: unknown }): void;
  onServerReply?(input: { id: number | string; ok: boolean }): void;
  onConnection?(input: { state: 'starting' | 'ws-url' | 'connected' | 'initialized' | 'closed' | 'error' | 'stopped'; detail?: unknown }): void;
}
```

- `CodexAppServerTransport` 构造选项变为 `{ codexPathOverride?: string; workingDirectory?: string; wireObserver?: CodexAppServerWireObserver }`（后向兼容，既有两字段不变）。`CodexAppServerClient` 构造透传同一选项对象，无需改签名。

实施前必须执行 codegraph 门禁：对 `CodexAppServerTransport` 的 `request`、`handleMessage`、`doStart`、`stop`、`sendServerRequestReply` 运行 callers/impact（depth 2），确认无计划外调用方依赖其现有私有行为。

- [ ] **Step 1: 写失败测试**

`tests/unit/core/agents/backend/CodexAppServerTransport.wireObserver.test.ts`（mock 模式逐字复用 `CodexAppServerClient.threadLifecycle.test.ts:10-55` 的 `jest.mock('node:child_process')` + `jest.mock('ws')` + `emitWsUrl`/`simulateResponse` 套路）：

```ts
import { EventEmitter } from 'events';

const mockWsInstance = {
  send: jest.fn(),
  close: jest.fn(),
  readyState: 1,
  onopen: null as null | (() => void),
  onmessage: null as null | ((event: { data: string }) => void),
  onerror: null as null | ((error: unknown) => void),
  onclose: null as null | (() => void),
};
const mockSpawn = jest.fn();

jest.mock('node:child_process', () => ({ spawn: (...args: unknown[]) => mockSpawn(...args) }));
jest.mock('ws', () => ({ __esModule: true, default: jest.fn(() => mockWsInstance), WebSocket: jest.fn(() => mockWsInstance) }));

import { CodexAppServerClient } from '../../../../../src/core/agents/backend/CodexAppServerClient';
import type { CodexAppServerWireObserver } from '../../../../../src/core/agents/backend/CodexAppServerClientTypes';

function makeProcess(): { proc: EventEmitter & { kill: jest.Mock }; stdout: EventEmitter; stderr: EventEmitter } {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const proc = Object.assign(new EventEmitter(), { stdout, stderr, kill: jest.fn() });
  return { proc: proc as EventEmitter & { kill: jest.Mock }, stdout, stderr };
}

describe('CodexAppServerTransport wire observer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWsInstance.readyState = 1;
  });

  async function startClient(observer: CodexAppServerWireObserver): Promise<CodexAppServerClient> {
    const { proc, stdout } = makeProcess();
    mockSpawn.mockReturnValue(proc);
    const client = new CodexAppServerClient({ wireObserver: observer });
    const started = client.start();
    stdout.emit('data', Buffer.from('listening on ws://127.0.0.1:12345\n'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    mockWsInstance.onopen?.();
    // initialize handshake
    const initCall = mockWsInstance.send.mock.calls.map((call) => JSON.parse(call[0] as string)).find((msg) => msg.method === 'initialize');
    mockWsInstance.onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', id: initCall.id, result: {} }) });
    await started;
    return client;
  }

  it('reports connection lifecycle states', async () => {
    const states: string[] = [];
    await startClient({ onConnection: ({ state }) => states.push(state) });
    expect(states).toEqual(expect.arrayContaining(['starting', 'ws-url', 'connected', 'initialized']));
  });

  it('reports outbound requests and inbound responses with duration', async () => {
    const seen: Array<{ kind: string; method?: string; ok?: boolean; durationMs?: number }> = [];
    const client = await startClient({
      onRequest: ({ method }) => seen.push({ kind: 'request', method }),
      onResponse: ({ ok, durationMs }) => seen.push({ kind: 'response', ok, durationMs }),
    });
    const pending = client.listThreads();
    const sent = mockWsInstance.send.mock.calls.map((call) => JSON.parse(call[0] as string)).find((msg) => msg.method === 'thread/list');
    mockWsInstance.onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', id: sent.id, result: { threads: [] } }) });
    await pending;
    expect(seen).toContainEqual({ kind: 'request', method: 'thread/list' });
    const response = seen.find((entry) => entry.kind === 'response');
    expect(response?.ok).toBe(true);
    expect(typeof response?.durationMs).toBe('number');
  });

  it('reports notifications and server requests', async () => {
    const seen: string[] = [];
    await startClient({
      onNotification: ({ method }) => seen.push(`n:${method}`),
      onServerRequest: ({ method }) => seen.push(`s:${method}`),
      onServerReply: ({ ok }) => seen.push(`reply:${ok}`),
    });
    mockWsInstance.onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', method: 'warning', params: { threadId: 't1' } }) });
    mockWsInstance.onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'execCommandApproval', params: {} }) });
    expect(seen).toContain('n:warning');
    expect(seen).toContain('s:execCommandApproval');
    expect(seen).toContain('reply:true');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node scripts/run-jest.js tests/unit/core/agents/backend/CodexAppServerTransport.wireObserver.test.ts`
Expected: FAIL（`wireObserver` 选项被忽略 / 类型不存在）。

- [ ] **Step 3: 实现插桩**

`CodexAppServerClientTypes.ts` 追加上面 Produces 块的 `CodexAppServerWireObserver`。

`CodexAppServerTransport.ts` 精确改动：

1. 类选项类型（文件内联或 types 文件）扩展 `wireObserver?: CodexAppServerWireObserver`；构造函数（transport:72）存 `protected readonly wireObserver = options?.wireObserver;`。
2. `pending` Map 的值类型（transport:60 附近）从 `{ resolve; reject }` 扩展为 `{ resolve; reject; method: string; sentAt: number }`。
3. `doStart`（transport:89）：spawn 前 `this.wireObserver?.onConnection?.({ state: 'starting' })`；`waitForWsUrl` 成功后 `onConnection({ state: 'ws-url', detail: wsUrl })`（wsUrl 会被 redactor 处理，无需预脱敏）；ws open 后 `onConnection({ state: 'connected' })`；`initialized = true` 之后 `onConnection({ state: 'initialized' })`。
4. `ws.onclose`（transport:127）：追加 `this.wireObserver?.onConnection?.({ state: 'closed' })`；`ws.onerror`（transport:132）：追加 `onConnection({ state: 'error', detail: ... })`。
5. `request()`（transport:313）：分配 id 后、`ws.send` 前调用 `this.wireObserver?.onRequest?.({ id, method, params, timeoutMs })`；`pending.set(id, { resolve, reject, method, sentAt: Date.now() })`。
6. `handleMessage`（transport:220）三个分支：
   - response 分支（id only）：`const entry = this.pending.get(id)` 处，resolve/reject 前调用 `this.wireObserver?.onResponse?.({ id, ok: !msg.error, durationMs: Date.now() - entry.sentAt, error: msg.error ? \`JSON-RPC error ${msg.error.code}: ${msg.error.message}\` : undefined })`。
   - server request 分支（id + method）：`handleServerRequest` 入口调用 `onServerRequest({ id, method, params })`。
   - notification 分支（method only）：调用 `onNotification({ method, params })`。
7. `sendServerRequestReply`（transport:302 附近）：发送后调用 `onServerReply({ id, ok: !error })`。
8. `stop()`（transport:193）：末尾调用 `onConnection({ state: 'stopped' })`。

所有 observer 调用包 try/catch（observer 异常不得影响 RPC 主路径）：

```ts
private notifyObserver(notify: () => void): void {
  try {
    notify();
  } catch (error) {
    logger.warn('wire observer threw', { error: error instanceof Error ? error.message : String(error) });
  }
}
```

- [ ] **Step 4: 运行新测试 + transport/client 全部回归**

Run: `node scripts/run-jest.js tests/unit/core/agents/backend/CodexAppServerTransport.wireObserver.test.ts tests/unit/core/agents/backend/CodexAppServerTransport.cwd.test.ts tests/unit/core/agents/backend/CodexAppServerClient.threadLifecycle.test.ts tests/unit/core/agents/backend/CodexAppServerClient.notifications.test.ts tests/unit/core/agents/backend/CodexAppServerClient.serverRequests.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/core/agents/backend/CodexAppServerClientTypes.ts src/core/agents/backend/CodexAppServerTransport.ts tests/unit/core/agents/backend/CodexAppServerTransport.wireObserver.test.ts
git commit -m "feat(codex-trace): add wire observer instrumentation to app-server transport"
```

---

### Task 8: CodexAdapter 生命周期插桩

**Files:**
- Modify: `src/core/agents/backend/CodexAdapter.ts`（options 增加 `tracePort`；7 个插桩点）
- Test: `tests/unit/core/agents/backend/CodexAdapter.trace.test.ts`

**Interfaces:**
- Consumes: Task 4 `CodexTracePort`，Task 5 `CodexSessionTraceService`/`CodexWireTraceBridge`。
- Produces:
  - `CodexAdapterOptions` 追加 `tracePort?: CodexTracePort`（含 `wireBridge: CodexWireTraceBridge` 可 duck-typing 为 `CodexAppServerWireObserver`）。为解耦，adapter 只依赖 `CodexTracePort` 与 `CodexAppServerWireObserver`：实际传入 `CodexSessionTraceService` 时通过 `tracePort.wireBridge` 取 observer——因此 `CodexTracePort`（Task 4 types.ts）需追加 `readonly wireBridge?: CodexAppServerWireObserver;`。
  - `AgentChatSendRequest`（`src/core/agents/backend/AgentService.ts` 内定义）追加可选字段 `diagnosticRunToken?: { runId: string; tabId: string; armedAt: number; expiresAt: number }`。

实施前 codegraph 门禁：对 `CodexAdapter` 的 `aliasSession`、`createSession`、`sendMessageViaAppServer`、`cancelStream`、`handleApproval`、`setStatus` 运行 callers/impact（depth 2）。

- [ ] **Step 1: 写失败测试**

`tests/unit/core/agents/backend/CodexAdapter.trace.test.ts`（mock 模式复用 `CodexAdapter.appServerChat.test.ts:13-46`：mock `CodexAppServerClient` 类 + `createCodex` DI；notification 经捕获的 handler 注入）：

```ts
import { CodexAdapter } from '../../../../../src/core/agents/backend/CodexAdapter';
import type { CodexTracePort, CodexTraceContext } from '../../../../../src/core/agents/backend/diagnostics/types';

let notificationHandler: ((event: { method: string; params: unknown }) => void) | null = null;
const mockClient = {
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn(),
  startThread: jest.fn().mockResolvedValue({ id: 'thread-1', turns: [] }),
  resumeThread: jest.fn().mockResolvedValue({ id: 'thread-1', turns: [] }),
  startTurn: jest.fn().mockResolvedValue({ id: 'turn-1', items: [] }),
  interruptTurn: jest.fn().mockResolvedValue(true),
  subscribeToThreadNotifications: jest.fn((_id: string, handler: typeof notificationHandler) => {
    notificationHandler = handler;
    return { dispose: jest.fn() };
  }),
  getThreadEffectiveSettings: jest.fn().mockReturnValue(null),
  registerServerRequestHandler: jest.fn(),
};

jest.mock('../../../../../src/core/agents/backend/CodexAppServerClient', () => {
  const actual = jest.requireActual('../../../../../src/core/agents/backend/CodexAppServerClient');
  return { ...actual, CodexAppServerClient: jest.fn(() => mockClient) };
});

function createFakeTracePort(): jest.Mocked<CodexTracePort> {
  const context: CodexTraceContext = { traceId: 'trace-x', runtimeSegmentId: 'seg-x', threadId: 'thread-1' };
  return {
    bindThread: jest.fn(() => context),
    beginTurn: jest.fn(() => context),
    recordTurnNotification: jest.fn(),
    recordStreamSync: jest.fn(),
    recordToolInteraction: jest.fn(),
    recordLifecycle: jest.fn(),
    recordWireEvent: jest.fn(),
    recordServiceOutput: jest.fn(),
    finishTurn: jest.fn(),
    markAnomaly: jest.fn(),
    armDeepCapture: jest.fn(),
    cancelDeepCapture: jest.fn(),
    claimDeepCapture: jest.fn(),
    getCaptureState: jest.fn(() => 'off'),
  } as unknown as jest.Mocked<CodexTracePort>;
}

describe('CodexAdapter trace instrumentation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    notificationHandler = null;
  });

  it('binds the thread and records turn lifecycle over an app-server send', async () => {
    const tracePort = createFakeTracePort();
    const adapter = new CodexAdapter({ tracePort, approvalPolicy: 'never', createCodex: jest.fn().mockResolvedValue({}) });
    await adapter.start();
    const sessionId = await adapter.createSession();
    const chunks: unknown[] = [];
    const consume = (async () => { for await (const chunk of adapter.sendMessage({ sessionId, content: 'hi' })) chunks.push(chunk); })();
    await new Promise((resolve) => setTimeout(resolve, 0));
    notificationHandler?.({ method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', items: [] } } });
    await consume;
    expect(tracePort.bindThread).toHaveBeenCalledWith(expect.objectContaining({ threadId: 'thread-1', via: 'app-server' }));
    expect(tracePort.beginTurn).toHaveBeenCalledWith(expect.objectContaining({ threadId: 'thread-1', turnId: 'turn-1' }));
    expect(tracePort.recordTurnNotification).toHaveBeenCalledWith(expect.anything(), 'turn/completed', expect.anything());
    expect(tracePort.finishTurn).toHaveBeenCalledWith(expect.anything(), 'completed', undefined);
  });

  it('finishes the turn as error when turn/completed carries an error', async () => {
    const tracePort = createFakeTracePort();
    const adapter = new CodexAdapter({ tracePort, approvalPolicy: 'never', createCodex: jest.fn().mockResolvedValue({}) });
    await adapter.start();
    const sessionId = await adapter.createSession();
    const consume = (async () => { for await (const _ of adapter.sendMessage({ sessionId, content: 'hi' })) { /* drain */ } })();
    await new Promise((resolve) => setTimeout(resolve, 0));
    notificationHandler?.({ method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', items: [], error: { message: 'boom' } } } });
    await consume;
    expect(tracePort.finishTurn).toHaveBeenCalledWith(expect.anything(), 'error', expect.objectContaining({ error: 'boom' }));
  });

  it('works without a tracePort (no-op path unchanged)', async () => {
    const adapter = new CodexAdapter({ approvalPolicy: 'never', createCodex: jest.fn().mockResolvedValue({}) });
    await adapter.start();
    const sessionId = await adapter.createSession();
    const consume = (async () => { for await (const _ of adapter.sendMessage({ sessionId, content: 'hi' })) { /* drain */ } })();
    await new Promise((resolve) => setTimeout(resolve, 0));
    notificationHandler?.({ method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', items: [] } } });
    await expect(consume).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node scripts/run-jest.js tests/unit/core/agents/backend/CodexAdapter.trace.test.ts`
Expected: FAIL（`tracePort` option 不存在）。

- [ ] **Step 3: 实现插桩（7 个点，全部 try/catch 防御）**

`CodexAdapter.ts` 改动（行号以当前 main 为准）：

1. `CodexAdapterOptions`（adapter:112）追加 `tracePort?: CodexTracePort;`；import 类型自 `./diagnostics/types`。私有字段 `private readonly tracePort = options.tracePort;`（构造函数内赋值处 adapter:431 附近）。
2. `start()`（adapter:479）默认 client 构造：`new CodexAppServerClient({ codexPathOverride: ..., workingDirectory: ..., wireObserver: this.tracePort?.wireBridge })`。
3. `createSession`（adapter:2269）：provisionalId 生成后调用 `this.tracePort?.recordLifecycle('session.created', { provisionalId })`。
4. `aliasSession`（adapter:2553）：签名扩展为 `private aliasSession(provisionalId: string, threadId: string, meta?: { resumed?: boolean; via?: 'app-server' | 'sdk' })`；末尾调用 `this.tracePort?.bindThread({ threadId, provisionalId, resumed: meta?.resumed ?? false, via: meta?.via ?? 'app-server' })`。两个调用点同步：app-server 路径（adapter:1592 附近，`resolveOrStartAppServerThread` 内）传 `{ resumed: usedResume, via: 'app-server' }`（`usedResume` = 是否走了 `resumeThread` 分支）；SDK 路径 `thread.started`（adapter:1499）传 `{ resumed: false, via: 'sdk' }`。
5. `sendMessageViaAppServer`（adapter:1526）：
   - `client.startTurn(...)` 成功（adapter:1638-1651）后：`const turnContext = this.tracePort?.beginTurn({ threadId: thread.id, turnId: startedTurnId, model: request.options?.model ?? undefined, diagnosticRunToken: request.diagnosticRunToken });` 存入局部变量供回调用。
   - 订阅回调（adapter:1595 附近）：处理每条事件前调用 `this.tracePort?.recordTurnNotification(turnContext ?? fallbackContext, event.method, event.params)`；映射后若 `result.chunks.length === 0` 且 method 不在已知静默集合（`thread/tokenUsage/updated` 有 snapshot 豁免）则 `recordStreamSync(context, 'notification.no_chunks', 'debug', { method: event.method })`；未知 method（不在 `CodexAppServerClient.subscribeToThreadNotifications` 注册的 11 个方法内）不会到达此回调，无需处理。
   - `completeCurrentTurn`（adapter:1565）内 `turn/completed` 已由 `recordTurnNotification` 触发 service 自动 finish；为保险，错误证据路径 `readAppServerTurnError` 非空时额外 `markAnomaly(context, 'turn.error_evidence', 'error', { error })`。
   - 捕获错误的 catch（adapter:1685）：`this.tracePort?.finishTurn(turnContext, 'error', { error: message })` + `markAnomaly(context, 'turn.send_failed', 'error', { error: message })`。
6. `cancelStream`（adapter:1883）：`interruptTurn` 调用前 `this.tracePort?.finishTurn(activeContext, 'cancelled', { reason: 'user_cancel' })`（context 从 `activeAppServerTurns` 的 threadId 经 service 内部解析；adapter 侧保存最近一次 `beginTurn` 返回的 context——在 `sendMessageViaAppServer` 存入 `private lastTurnContextBySession = new Map<string, CodexTraceContext>()`，`cancelStream`/`deleteSession` 读取并清理）。
7. `handleApproval`（adapter:1299）：入口 `recordToolInteraction(context, 'approval.request', { kind, params summary })`；决策后 `recordToolInteraction(context, 'approval.decision', { kind, decision })`（context 用 `params.threadId` 经 `threadContextById` 不可得——adapter 不持有 service 内部 map，故传 `undefined` context，service 落 runtime 段；若需要 thread 归属，把 `recordToolInteraction` 的 context 参数改为允许 `{ threadId }` 最小对象，service 端 `contextForThreadId` 解析——实现时采用后者：传 `{ traceId: '', runtimeSegmentId: '', threadId: params.threadId } as CodexTraceContext` 不可取；正确做法是给 `CodexTracePort.recordToolInteraction` 加第二签名重载 `(threadId: string, name, payload)`。**采用：Task 4 types.ts 中 `recordToolInteraction(context: CodexTraceContext | undefined, ...)` 保持，adapter 调用处传 `undefined`，payload 内带 `{ threadId }`**。）
8. `setStatus`（adapter:2561）：`this.tracePort?.recordLifecycle('adapter.status', { status })`。

所有调用点包防御：`try { ... } catch { /* trace must never break chat */ }`——统一用私有助手：

```ts
private trace<T>(run: (port: CodexTracePort) => T): T | undefined {
  if (!this.tracePort) return undefined;
  try {
    return run(this.tracePort);
  } catch (error) {
    logger.warn('codex trace hook failed', { error: error instanceof Error ? error.message : String(error) });
    return undefined;
  }
}
```

`AgentService.ts` 的 `AgentChatSendRequest` 追加 `diagnosticRunToken?: { runId: string; tabId: string; armedAt: number; expiresAt: number };`（结构对齐 `CodexDiagnosticRunToken`，避免 core 类型反向依赖 diagnostics 包）。

- [ ] **Step 4: 运行新测试 + adapter 全部回归**

Run: `node scripts/run-jest.js tests/unit/core/agents/backend/CodexAdapter.trace.test.ts tests/unit/core/agents/backend/CodexAdapter.test.ts tests/unit/core/agents/backend/CodexAdapter.appServerChat.test.ts tests/unit/core/agents/backend/CodexAdapter.threadLifecycle.test.ts tests/unit/core/agents/backend/CodexAdapter.approvalBridge.test.ts`
Expected: 全部 PASS。随后跑全量 `node scripts/run-jest.js tests/unit/core/agents/backend` 确认无其他回归。

- [ ] **Step 5: Commit**

```bash
git add src/core/agents/backend/CodexAdapter.ts src/core/agents/backend/AgentService.ts src/core/agents/backend/diagnostics/types.ts tests/unit/core/agents/backend/CodexAdapter.trace.test.ts
git commit -m "feat(codex-trace): instrument codex adapter session and turn lifecycle"
```

---
### Task 9: 插件接线（main.ts 构造 + AgentAdapterWiring 注入）

**Files:**
- Modify: `src/main.ts`（字段、构造、注入、dispose）
- Modify: `src/core/agents/backend/AgentAdapterWiring.ts`（`WireHiddenAdaptersOptions` + CodexAdapter 构造）
- Test: `tests/unit/core/agents/backend/CodexHiddenWiring.test.ts`（扩展既有文件）

**Interfaces:**
- Consumes: Task 5 `CodexSessionTraceService`、Task 8 `CodexAdapterOptions.tracePort`。
- Produces:
  - `WireHiddenAdaptersOptions` 追加 `codexTracePort?: CodexTracePort`。
  - 插件公共字段 `OpenCodianPlugin.codexTraceService: CodexSessionTraceService`（Task 10/11 依赖）。

- [ ] **Step 1: 扩展失败测试**

在 `tests/unit/core/agents/backend/CodexHiddenWiring.test.ts` 追加用例（沿用该文件既有 fake registry/settings 模式）：

```ts
it('passes the codex trace port into the CodexAdapter options', () => {
  const tracePort = { wireBridge: undefined } as unknown as CodexTracePort;
  const registry = createRegistry(); // 沿用文件既有 helper
  wireHiddenAdapters(makeOptions({ codexTracePort: tracePort })); // 沿用文件既有 makeOptions
  const adapter = registry.get('codex') as CodexAdapter;
  expect((adapter as unknown as { options: { tracePort?: unknown } }).options.tracePort ?? (adapter as unknown as { tracePort?: unknown }).tracePort).toBe(tracePort);
});
```

若既有测试无法直接读 adapter 私有 options，则改为断言行为：构造时不抛错且 `registry.get('codex')` 非空，另在 Task 8 测试已覆盖 tracePort 行为——本用例可降级为编译期类型检查 + 构造冒烟。优先尝试读取私有字段（ts-jest 下可用 `as unknown as` 绕过）。

- [ ] **Step 2: 运行确认失败**

Run: `node scripts/run-jest.js tests/unit/core/agents/backend/CodexHiddenWiring.test.ts`
Expected: FAIL（`codexTracePort` 不在 options 类型中）。

- [ ] **Step 3: 实现接线**

`AgentAdapterWiring.ts`：

1. import `type { CodexTracePort } from './diagnostics/types';`
2. `WireHiddenAdaptersOptions` 追加 `codexTracePort?: CodexTracePort;`
3. `new CodexAdapter({...})`（wiring:51）options 对象追加 `tracePort: options.codexTracePort,`。

`src/main.ts`：

1. 顶部 import 追加 `import { CodexSessionTraceService } from './core/agents/backend/diagnostics';`
2. 字段声明（main.ts:98 附近，`openCodeTraceService` 旁）追加 `codexTraceService!: CodexSessionTraceService;`
3. 在 `openCodeTraceService` 构造块（main.ts:233-247）之后追加：

```ts
this.codexTraceService = new CodexSessionTraceService({
  settings: () => this.settings.backendSettings.codex.sessionTrace,
  vaultPath: getVaultBasePath(this.app) ?? undefined,
  buildIdentity: () => this.getDebugBuildIdentityText(),
  knownSecrets: () => [
    this.settings.server.auth.password,
    this.settings.server.auth.token,
  ].filter(Boolean),
  runtimeMetadata: () => ({
    serverMode: this.settings.server.mode,
    modelSourceMode: this.settings.modelSourceMode,
    pluginIsolationMode: this.settings.pluginIsolationMode,
  }),
});
```

4. `wireHiddenAdapters(...)` 调用（main.ts:301）options 追加 `codexTracePort: this.codexTraceService,`。
5. `onunload` dispose（main.ts:550 附近）追加 `void this.codexTraceService?.dispose();`。

- [ ] **Step 4: 运行测试 + 类型检查 + lint**

Run: `node scripts/run-jest.js tests/unit/core/agents/backend/CodexHiddenWiring.test.ts && npx tsc --noEmit && npm run lint`
Expected: 全绿。

- [ ] **Step 5: Commit**

```bash
git add src/main.ts src/core/agents/backend/AgentAdapterWiring.ts tests/unit/core/agents/backend/CodexHiddenWiring.test.ts
git commit -m "feat(codex-trace): wire codex trace service through plugin startup"
```

---

### Task 10: 设置 UI（SettingsDebugSection Codex 区块）+ 双语 locale

**Files:**
- Modify: `src/features/settings/SettingsDebugSection.ts`（新增 codex 区块 + tabbed 注册）
- Modify: `src/i18n/locales/en.ts`、`src/i18n/locales/zh.ts`
- Test: `tests/unit/features/settings/SettingsDebugSection.codex.test.ts`

**Interfaces:**
- Consumes: Task 9 `plugin.codexTraceService`、Task 4 `CodexSessionTraceSettings`。
- Produces: locale key 前缀 `settings.debug.codex.*`（完整 key 清单见 Step 3）。

- [ ] **Step 1: 写失败测试**

`tests/unit/features/settings/SettingsDebugSection.codex.test.ts`（逐字复用 `SettingsDebugSection.test.ts` 的 mock 套路：`MockToggleControl`/`MockTextControl`/`MockButtonControl`、`Pick<OpenCodianPlugin, ...>` fake、`DEFAULT_SETTINGS`、`setLocale`）：

```ts
// 骨架（mock 工具从 SettingsDebugSection.test.ts 复制）：
describe('SettingsDebugSection codex block', () => {
  it('renders codex trace toggles bound to backendSettings.codex.sessionTrace', () => {
    const plugin = makeFakePlugin(); // 复用既有 helper 模式，settings = DEFAULT_SETTINGS 深拷贝
    renderSection(plugin);
    const enabledToggle = toggles.get(labelFor('settings.debug.codex.enabled.name'));
    expect(enabledToggle.value).toBe(true);
    enabledToggle.change(false);
    expect(plugin.settings.backendSettings.codex.sessionTrace.enabled).toBe(false);
    expect(plugin.saveSettings).toHaveBeenCalled();
  });

  it('renders a captureContent toggle defaulting to true', () => {
    const plugin = makeFakePlugin();
    renderSection(plugin);
    const toggle = toggles.get(labelFor('settings.debug.codex.captureContent.name'));
    expect(toggle.value).toBe(true);
    toggle.change(false);
    expect(plugin.settings.backendSettings.codex.sessionTrace.captureContent).toBe(false);
  });

  it('shows codex trace storage status from the shared store', () => {
    const plugin = makeFakePlugin({
      codexTraceService: {
        store: {
          getStatus: () => ({ mode: 'disk', rootDirectory: '/tmp/x', queuedEvents: 0, approximateBytes: 2048, droppedEvents: 0 }),
          listSummaries: () => [],
        },
      },
    });
    renderSection(plugin);
    expect(textContent()).toContain('disk');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node scripts/run-jest.js tests/unit/features/settings/SettingsDebugSection.codex.test.ts`
Expected: FAIL（codex 区块不存在）。

- [ ] **Step 3: 实现**

`SettingsDebugSection.ts`（逐点镜像 opencode 区块的实现 `addOpenCodeDebugSettings`，workbench div `data-debug-workbench="codex"`）：

1. `attachTabbed` 的 block 列表 `'plugin' | 'opencode' | 'claude-code' | 'export'` 扩展加入 `'codex'`（同时检查 `settingsLayoutRegistry.ts` 中 debug tab 的注册表是否需要同步加 entry）。
2. 新增私有方法 `addCodexDebugSettings(containerEl)`，子结构与 opencode 完全同构：
   - `addCodexTraceStatus`：读 `plugin.codexTraceService?.store.getStatus()` + `listSummaries(100).length`。
   - `addCodexTraceControls`：`enabled` toggle、`consolePreset` dropdown、`storageDirectory` 文本 + Choose（placeholder 用 `resolveDefaultTraceDirectory('codex')`，从 `src/shared/diagnostics` import）、5 个 channel toggle（遍历 `CODEX_TRACE_CHANNEL_IDS`）、`captureContent` toggle。settings accessor `getCodexTraceSettings()` 返回 `plugin.settings.backendSettings.codex.sessionTrace`，缺省时用 `getDefaultBackendSettings().codex.sessionTrace` 懒填充。
   - `addCodexTraceActions`：Copy smart report / Flush / Export / Clear 四按钮，调用 `plugin.codexTraceService.reportBuilder.buildSmartReport(...)` / `store.flush()` / `store.exportTraceBundle(...)` / `store.clear()`。
   - `addCodexTraceCatalog`：`listSummaries(20)` 列表 + copy/delete 行按钮。
3. locale keys（en.ts / zh.ts 同步追加，锚定现有 `settings.debug.opencode.*` 块附近，两文件 key 集合严格一致）：

```
settings.debug.codex.title / settings.debug.codex.status.* / settings.debug.codex.enabled.name|desc
settings.debug.codex.consolePreset.name / settings.debug.codex.storageDir.name|desc|restartNotice
settings.debug.codex.channels.name / settings.debug.codex.channels.<lifecycle|transport|stream-sync|tool-interaction|service-output>
settings.debug.codex.captureContent.name|desc
settings.debug.codex.actions.copyReport|flush|export|clear / settings.debug.codex.actions.exportSuccess（含 {{path}}）
settings.debug.codex.recent.title / settings.debug.codex.recent.anomaliesOnly / settings.debug.codex.recent.copy|delete
```

en 文案逐字翻译 opencode 对应条目（把 OpenCode 换成 Codex）；zh 同理。`captureContent` 文案——en: name `Record message content in deep capture`, desc `When off, deep capture and retroactive dumps store payload shapes instead of full message content.`；zh: name `深度捕获中记录消息正文`, desc `关闭后，深度捕获与回溯落盘只保存 payload 形状摘要，不保存消息正文。`

- [ ] **Step 4: 运行测试 + 设置页回归**

Run: `node scripts/run-jest.js tests/unit/features/settings`
Expected: 全部 PASS（含既有 `SettingsDebugSection.test.ts`）。

- [ ] **Step 5: Commit**

```bash
git add src/features/settings/SettingsDebugSection.ts src/i18n/locales/en.ts src/i18n/locales/zh.ts tests/unit/features/settings/SettingsDebugSection.codex.test.ts
git commit -m "feat(codex-trace): add codex trace controls to debug settings"
```

---

### Task 11: 聊天视图入口（诊断菜单 + 发送时 claim + 导出当前会话）

**Files:**
- Modify: `src/features/chat/OpenCodianView.ts`（diagnostics state/menu codex 版、claim token、导出方法）
- Modify: `src/features/chat/services/ChatHeaderPresenter.ts`（host 回调 + codex 菜单路由）
- Modify: `src/features/chat/runtime/SendPipelineRuntime.ts`（codex claim 透传）
- Test: `tests/unit/features/chat/CodexDiagnosticsHost.test.ts`

**Interfaces:**
- Consumes: Task 9 `plugin.codexTraceService`；`getConversationBackendSessionId(conversation)`（`src/core/types/chat.ts:582`）；既有 opencode 模式锚点：`OpenCodianView.ts:715-780`（`getOpenCodeDiagnosticsState`/`showOpenCodianDiagnostics`）、`OpenCodianView.ts:3227/3258/3262`、`SendPipelineRuntime.ts:288-306`。
- Produces（ChatHeaderPresenter host 接口追加）:
  - `getCodexDiagnosticsState(tabId: string): 'disabled' | 'degraded' | 'armed' | 'capturing' | 'normal' | 'warning' | 'critical'`
  - `showCodexDiagnostics(event: MouseEvent, tabId: string): void`
  - `claimCodexDiagnosticRunToken(tabId: string, sessionId?: string): CodexDiagnosticRunToken | undefined`

实施前 codegraph 门禁：`ChatHeaderPresenter` 中 opencode 诊断菜单的调用点、`SendPipelineRuntime.sendMessage`、`OpenCodianView` 三个锚点方法各跑 callers/impact（depth 2）。

- [ ] **Step 1: 写失败测试**

`tests/unit/features/chat/CodexDiagnosticsHost.test.ts`（模式参考 `ChatHeaderPresenter.test.ts` 与 `SendPipelineRuntime.transport.test.ts` 的 host-fake 套路）：

```ts
describe('codex diagnostics host wiring', () => {
  it('reports capture state from the codex trace service', () => {
    // fake plugin.codexTraceService: getCaptureState('tab-1') => 'armed'
    // 调用 view.getCodexDiagnosticsState('tab-1') => 'armed'
  });

  it('claims a codex diagnostic token during send preparation for codex conversations', () => {
    // fake claimDeepCapture => token;构造 codex conversation（backendSessionId 非 opencode）
    // 走 SendPipelineRuntime 发送准备路径，断言传入 sendStreamMessage 的 options 含 diagnosticRunToken
  });

  it('resolves the current conversation trace id via backendSessionId for export', () => {
    // conversation.backendSessionId = 'thread-1'；store.resolveTraceId('thread-1') => 'trace-x'
    // 调用导出方法，断言 buildSmartReport 以 ('trace-x', userContext, { selection: 'current-session' }) 调用
  });
});
```

三个用例的 fake 结构逐字对齐既有文件中的 host/plugin fake（复制后改 codex 字段）。

- [ ] **Step 2: 运行确认失败**

Run: `node scripts/run-jest.js tests/unit/features/chat/CodexDiagnosticsHost.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

`OpenCodianView.ts`（镜像 opencode 实现，逐函数对照改写）：

1. `getCodexDiagnosticsState(tabId)`（对照 715-735）：读 `settings.backendSettings.codex.sessionTrace.enabled`；`plugin.codexTraceService.store.getStatus()`；`getCaptureState(tabId)`；`store.resolveTraceId(backendSessionId)` 找 summary 定 warning/critical。backendSessionId 取 `getConversationBackendSessionId(activeConversation)`。
2. `showCodexDiagnostics(event, tabId)`（对照 736-780）：menu 三项——cancel capture → `cancelDeepCapture(tabId)`；capture next → `armDeepCapture(tabId, backendSessionId)`；copy session diagnostics → `exportCodexConversationDiagnostics(conversation)`。
3. 新方法：

```ts
private async exportCodexConversationDiagnostics(conversation: Conversation): Promise<void> {
  const service = this.plugin.codexTraceService;
  const threadId = getConversationBackendSessionId(conversation);
  if (!service || !threadId) {
    new Notice(t('settings.debug.codex.exportUnavailable'));
    return;
  }
  service.flushRingBuffer(threadId, 'manual-export');
  await service.store.flush();
  const traceId = service.store.resolveTraceId(threadId);
  const userContext = await this.promptDiagnosticsUserContext(); // 复用 opencode 导出时的 actual/expected/reproduction 提示实现（736-780 内既有逻辑抽用，不重复造）
  const report = await service.reportBuilder.buildSmartReport(traceId, userContext, { selection: 'current-session' });
  await navigator.clipboard.writeText(report);
  new Notice(t('settings.debug.codex.actions.copyReportSuccess'));
}
```

4. `ConversationTabLifecycleRecoveryHost`（对照 3227）：追加 `cancelCodexDiagnosticCapture` 调用 `plugin.codexTraceService?.cancelDeepCapture(tabId)`。
5. `SendPipelineHostDependencies`（对照 3258）：追加 `claimCodexDiagnosticRunToken(tabId, sessionId)` → `plugin.codexTraceService?.claimDeepCapture(tabId, sessionId)`。

`SendPipelineRuntime.ts`（288-306 发送路径）：在调用 `host.sendStreamMessage` 前，若 `getConversationChatBackendKind(conversation) === 'codex'`（routing helper 参照 `AgentBackendRouting.ts`），调用 `host.claimCodexDiagnosticRunToken?.(tabId, sessionId)` 并把返回 token 放入 send options `diagnosticRunToken`（字段已在 Task 8 加入 `AgentChatSendRequest`）。opencode 路径既有行为不动。

`ChatHeaderPresenter.ts`：

1. host 接口追加上面 Produces 的三个回调（可选字段）。
2. 诊断徽章/菜单构建处（现调 `host.getOpenCodianDiagnosticsState`/`showOpenCodeDiagnostics` 的位置）：按当前 conversation 后端路由——codex 会话调 codex 回调，opencode 会话保持原调用；无 codex 回调时隐藏徽章。

- [ ] **Step 4: 运行测试 + 聊天域回归**

Run: `node scripts/run-jest.js tests/unit/features/chat`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/features/chat/OpenCodianView.ts src/features/chat/services/ChatHeaderPresenter.ts src/features/chat/runtime/SendPipelineRuntime.ts tests/unit/features/chat/CodexDiagnosticsHost.test.ts
git commit -m "feat(codex-trace): add chat-side diagnostics capture and export entry points"
```

---

### Task 12: 文档门禁 + graphify + 全量验证 + devlog

**Files:**
- Create: `docs/modules/shared/diagnostics/{index.md,types.md,TraceRedactor.md,TraceStore.md,TraceReportBuilder.md}`
- Create: `docs/modules/core/agents/backend/diagnostics/{index.md,types.md,CodexSessionTraceService.md,CodexTraceRingBuffer.md,CodexWireTraceBridge.md}`
- Modify（对应模块文档同步）: `docs/modules/core/opencode/diagnostics/{OpenCodeTraceStore.md,OpenCodeTraceRedactor.md,OpenCodeTraceReportBuilder.md,types.md}`、`docs/modules/core/agents/backend/{CodexAppServerTransport.md,CodexAdapter.md,CodexAppServerClientTypes.md,AgentAdapterWiring.md,AgentService.md}`、`docs/modules/core/types/settings.md`、`docs/modules/entry-point/main.md`、`docs/modules/features/settings/SettingsDebugSection.md`、`docs/modules/features/chat/{OpenCodianView.md,services/ChatHeaderPresenter.md,runtime/SendPipelineRuntime.md}`（以 `npm run check:module-docs` 实际报错清单为准）
- Modify: `docs/modules/README.md`（新增目录条目）
- Modify: `devlog.md`

- [ ] **Step 1: 补模块文档**

新页面格式（无 frontmatter，示例 `docs/modules/core/opencode/diagnostics/OpenCodeSessionTraceService.md`）：

```markdown
# CodexSessionTraceService

> **源码**: `src/core/agents/backend/diagnostics/CodexSessionTraceService.ts`
> **状态**: [REVIEW]

<一段中文说明：职责、生命周期、不变量、失败模式>
```

每个被修改模块的既有页面更新其行为描述（如 OpenCodeTraceStore.md 说明其实现已下沉 `src/shared/diagnostics/TraceStore.ts`、本文件为兼容子类）。新增两个目录的 `index.md` 列出成员；`docs/modules/README.md` 按既有格式追加两个目录条目。

- [ ] **Step 2: 跑文档门禁并补齐遗漏**

Run: `npm run check:module-docs`
Expected: PASS；若报缺失，按报错清单补齐。

- [ ] **Step 3: 刷新 graphify**

Run: `npm run graphify:update:src`，然后 `npm run check:graphify`
Expected: PASS。单独提交：`chore(graph): refresh source graph`。

- [ ] **Step 4: devlog**

在 `devlog.md` 第一个 dated `## YYYY-MM-DD` 标题前插入当日条目（概述：共享诊断件下沉 + Codex 会话 trace 系统，列出关键设计点），然后 `npm run check:devlog-order`。

- [ ] **Step 5: 全量验证**

Run: `npm run verify`
Expected: 全绿（owner-guard / module-docs / graphify / devlog-order / lint / typecheck / test / build）。

- [ ] **Step 6: Commit**

```bash
git add docs devlog.md
git commit -m "docs(codex-trace): document codex session trace modules and update devlog"
```

---

## 自检记录（写计划时已完成）

- **规格覆盖**：Q1 混合架构 → Task 1-3（共享下沉）+ Task 4-5（Codex 独立 service/schema/生命周期）；Q2 双层捕获 → Task 5（语义 channel）+ Task 7/8（transport wire channel）；Q3 摘要+armed 深度 → Task 5（deep payloadRef、30min TTL）；Q4 轻量常驻+总开关+容量池 → Task 4（默认 enabled）+ 共享 store 既有 retention/LRU；Q5 ring buffer → Task 5/6；Q6 存储布局 → Task 5（`resolveDefaultTraceDirectory('codex')`）；Q7 内容策略 → Task 4（captureContent）+ Task 5；Q8 traceId 锚定 threadId → Task 5（stableTraceId + bindSession）+ Task 8（aliasSession 插桩）；Q9 双入口 → Task 10（设置页）+ Task 11（聊天视图）；Q10 看门狗 → Task 5/6（60s/180s）。
- **已知留白**：Task 10/11 的测试骨架需要执行者复制既有测试文件的 mock 工具（仓库已有完整先例，非设计留白）；fork 的 `parentTraceId` 链接依赖 adapter 的 `forkSession` 路径——v1 由 `bindThread` 的 `thread.resumed` 事件覆盖，parent 链接字段已在共享 schema（`parentSessionId`）预留，后续迭代接线。
