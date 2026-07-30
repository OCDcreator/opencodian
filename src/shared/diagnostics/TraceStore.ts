/* eslint-disable max-lines -- The trace store is one persistence owner; splitting queue, recovery, and retention would hide its failure-mode invariants. */

import { randomBytes, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';

import { sanitizeDiagnosticReport } from '../diagnosticSecretSanitizer';
import type {
  TraceEventBase,
  TraceStoreStatus,
  TraceSummary,
} from './types';

const FLUSH_INTERVAL_MS = 250;
const FLUSH_BYTES = 64 * 1024;
const MAX_QUEUE_EVENTS = 4096;
const MAX_QUEUE_BYTES = 4 * 1024 * 1024;
const MAX_MEMORY_EVENTS = 5000;
const STRUCTURAL_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const DEEP_RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_STRUCTURAL_BYTES = 50 * 1024 * 1024;
const MAX_DEEP_RUN_BYTES = 10 * 1024 * 1024;
const DEFAULT_SHARED_TRACE_DIRECTORY = path.join(
  os.homedir(), '.config', 'obsidian', 'OpenCodian', 'diagnostics',
);

interface QueuedRecord<TEvent extends TraceEventBase> {
  event: TEvent;
  deep: boolean;
  json: string;
  deepJson?: string;
  bytes: number;
}

interface PersistedTraceIndex {
  sessions: Record<string, string>;
  summaries: Record<string, TraceSummary>;
}

export class TraceStore<TEvent extends TraceEventBase = TraceEventBase> {
  rootDirectory: string;
  private readonly requestedDirectory: string;
  private readonly bundlePrefix: string;
  private queue: QueuedRecord<TEvent>[] = [];
  private queueBytes = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushing: Promise<void> | null = null;
  private memoryEvents: TEvent[] = [];
  private mode: 'disk' | 'memory' = 'disk';
  private lastError: string | undefined;
  private approximateBytes = 0;
  private droppedEvents = 0;
  private droppedSinceNotice = 0;
  private coalescedSinceNotice = 0;
  private pressureNoticeTemplate: TEvent | undefined;
  private degradedListener: ((
    error: unknown,
    template?: TEvent,
  ) => void) | undefined;
  private index: PersistedTraceIndex = { sessions: {}, summaries: {} };
  private initialized: Promise<void>;

  constructor(
    customDirectory?: string,
    private readonly fallbackDirectory = DEFAULT_SHARED_TRACE_DIRECTORY,
    options?: { bundlePrefix?: string },
  ) {
    this.bundlePrefix = options?.bundlePrefix ?? 'trace';
    this.requestedDirectory = customDirectory?.trim() || this.fallbackDirectory;
    this.rootDirectory = this.requestedDirectory;
    this.initialized = this.initialize();
  }

  append(event: TEvent, deep = false): void {
    let structuralEvent: TEvent;
    let json: string;
    let deepJson: string | undefined;
    try {
      structuralEvent = deep
        ? {
          ...event,
          payload: {
            deepPayloadOmitted: true,
            payloadType: Array.isArray(event.payload) ? 'array' : typeof event.payload,
          },
        }
        : event;
      json = `${JSON.stringify(structuralEvent)}\n`;
      deepJson = deep ? `${JSON.stringify(event)}\n` : undefined;
    } catch {
      this.droppedEvents += 1;
      this.droppedSinceNotice += 1;
      this.pressureNoticeTemplate = event;
      return;
    }
    const bytes = Buffer.byteLength(json) + Buffer.byteLength(deepJson ?? '');
    if (
      this.queue.length >= MAX_QUEUE_EVENTS
      || this.queueBytes + bytes > MAX_QUEUE_BYTES
    ) {
      if (this.canCoalesce(event)) {
        this.coalescedSinceNotice += 1;
        this.pressureNoticeTemplate = event;
        return;
      }
      this.droppedEvents += 1;
      this.droppedSinceNotice += 1;
      this.pressureNoticeTemplate = event;
      return;
    }
    this.queue.push({ event: structuralEvent, deep, json, deepJson, bytes });
    this.queueBytes += bytes;
    if (!this.isRuntimeEvent(event)) this.updateSummary(event, deep);
    if (this.queueBytes >= FLUSH_BYTES) {
      void this.flush();
      return;
    }
    this.timer ??= setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, FLUSH_INTERVAL_MS);
  }

  private materializePressureNotices(): void {
    const event = this.pressureNoticeTemplate;
    if (!event) return;
    if (this.coalescedSinceNotice > 0
      && this.enqueueNotice(event, 'trace.coalesced', this.coalescedSinceNotice)) {
      this.coalescedSinceNotice = 0;
    }
    if (this.droppedSinceNotice > 0
      && this.enqueueNotice(event, 'trace.dropped', this.droppedSinceNotice)) {
      this.droppedSinceNotice = 0;
    }
    if (this.coalescedSinceNotice === 0 && this.droppedSinceNotice === 0) {
      this.pressureNoticeTemplate = undefined;
    }
  }

  private enqueueNotice(event: TEvent, name: string, count: number): boolean {
    const notice: TEvent = {
      ...event,
      severity: 'warning',
      name,
      payload: { count },
      payloadRef: { kind: 'inline' },
    };
    const json = `${JSON.stringify(notice)}\n`;
    const bytes = Buffer.byteLength(json);
    if (this.queue.length >= MAX_QUEUE_EVENTS || this.queueBytes + bytes > MAX_QUEUE_BYTES) {
      return false;
    }
    this.queue.push({ event: notice, deep: false, json, bytes });
    this.queueBytes += bytes;
    if (!this.isRuntimeEvent(notice)) this.updateSummary(notice, false);
    return true;
  }

  private canCoalesce(event: TEvent): boolean {
    const previous = this.queue[this.queue.length - 1]?.event;
    return Boolean(
      previous
      && previous.traceId === event.traceId
      && previous.runId === event.runId
      && previous.name === event.name
      && /(?:delta|text)/i.test(event.name),
    );
  }

  async flush(): Promise<void> {
    await this.initialized;
    if (this.flushing) {
      await this.flushing;
      if (this.queue.length > 0 || this.pressureNoticeTemplate) await this.flush();
      return;
    }
    while (this.queue.length > 0 || this.pressureNoticeTemplate) {
      const batch = this.queue.splice(0);
      this.queueBytes = 0;
      if (batch.length > 0) {
        this.flushing = this.writeBatch(batch).finally(() => {
          this.flushing = null;
        });
        await this.flushing;
      }
      this.materializePressureNotices();
    }
  }

  async dispose(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.flush();
  }

  resolveTraceId(sessionId: string): string | undefined {
    return this.index.sessions[sessionId];
  }

  bindSession(sessionId: string, traceId: string): void {
    this.index.sessions[sessionId] = traceId;
  }

  onDegraded(listener: (error: unknown, template?: TEvent) => void): void {
    this.degradedListener = listener;
  }

  getStatus(): TraceStoreStatus {
    return {
      mode: this.mode,
      rootDirectory: this.rootDirectory,
      queuedEvents: this.queue.length,
      approximateBytes: this.approximateBytes,
      lastError: this.lastError,
      droppedEvents: this.droppedEvents,
    };
  }

  listSummaries(limit = 20): TraceSummary[] {
    return Object.values(this.index.summaries)
      .sort((left, right) => right.lastUpdatedAt.localeCompare(left.lastUpdatedAt))
      .slice(0, limit);
  }

  async markTraceRead(traceId: string): Promise<void> {
    const summary = this.index.summaries[traceId];
    if (!summary || (summary.unreadAnomalyCount === 0 && !summary.highestUnreadSeverity)) return;
    summary.unreadAnomalyCount = 0;
    summary.highestUnreadSeverity = undefined;
    await this.initialized;
    await this.persistIndex();
  }

  async getOrCreateLocalSalt(): Promise<Buffer> {
    await this.initialized;
    if (this.mode === 'memory') return randomBytes(32);
    const saltPath = path.join(this.rootDirectory, 'v1', '.salt');
    try {
      return Buffer.from(await fs.readFile(saltPath, 'utf8'), 'base64');
    } catch {
      const salt = randomBytes(32);
      await fs.writeFile(saltPath, salt.toString('base64'), { encoding: 'utf8', mode: 0o600 });
      return salt;
    }
  }

  async readTrace(traceId: string): Promise<TEvent[]> {
    await this.flush();
    const file = path.join(this.rootDirectory, 'v1', 'structural', `${traceId}.jsonl`);
    const diskEvents = await this.readJsonl(file).catch(() => []);
    const memoryEvents = this.memoryEvents.filter((event) =>
      event.traceId === traceId && !this.isRuntimeEvent(event));
    return this.mergeEventCopies(diskEvents, memoryEvents);
  }

  async readDeepRun(runId: string): Promise<TEvent[]> {
    await this.flush();
    return this.readJsonl(path.join(this.rootDirectory, 'v1', 'deep', `${runId}.jsonl`))
      .catch(() => []);
  }

  async readRuntimeSegment(runtimeSegmentId: string): Promise<TEvent[]> {
    await this.flush();
    const diskEvents = await this.readJsonl(
      path.join(this.rootDirectory, 'v1', 'runtime', `${runtimeSegmentId}.jsonl`),
    ).catch(() => []);
    const memoryEvents = this.memoryEvents.filter((event) =>
      event.runtimeSegmentId === runtimeSegmentId && this.isRuntimeEvent(event));
    return this.mergeEventCopies(diskEvents, memoryEvents);
  }

  async deleteTrace(traceId: string): Promise<void> {
    await this.flush();
    const persistedEvents = await this.readTrace(traceId);
    const runIds = new Set(
      [...persistedEvents, ...this.memoryEvents]
        .filter((event) => event.traceId === traceId && event.runId)
        .map((event) => event.runId as string),
    );
    if (this.mode === 'disk') {
      await fs.rm(path.join(this.rootDirectory, 'v1', 'structural', `${traceId}.jsonl`), { force: true });
      await Promise.all([...runIds].map((runId) =>
        fs.rm(path.join(this.rootDirectory, 'v1', 'deep', `${runId}.jsonl`), { force: true })));
    }
    delete this.index.summaries[traceId];
    for (const [sessionId, mappedTraceId] of Object.entries(this.index.sessions)) {
      if (mappedTraceId === traceId) delete this.index.sessions[sessionId];
    }
    this.memoryEvents = this.memoryEvents.filter((event) => event.traceId !== traceId);
    if (this.mode === 'disk') await this.persistIndex();
    await this.refreshApproximateBytes();
  }

  async clear(): Promise<void> {
    await this.flush();
    this.index = { sessions: {}, summaries: {} };
    this.memoryEvents = [];
    this.approximateBytes = 0;
    if (this.mode === 'memory') return;
    await fs.rm(path.join(this.rootDirectory, 'v1'), { recursive: true, force: true });
    this.initialized = this.initialize();
    await this.initialized;
  }

  async exportTraceBundle(traceId: string, targetDirectory: string): Promise<string> {
    await this.flush();
    const events = await this.readTrace(traceId);
    const safeTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const bundleDirectory = path.join(targetDirectory, `${this.bundlePrefix}-${traceId}-${safeTimestamp}`);
    await fs.mkdir(bundleDirectory, { recursive: true, mode: 0o700 });
    await fs.chmod(bundleDirectory, 0o700).catch(() => undefined);
    const structuralSource = path.join(this.rootDirectory, 'v1', 'structural', `${traceId}.jsonl`);
    await this.exportSanitizedFile(structuralSource, path.join(bundleDirectory, 'structural.jsonl'));
    const runIds = [...new Set(events.filter((event) => event.runId).map((event) => event.runId as string))];
    for (const runId of runIds) {
      try {
        await this.exportSanitizedFile(
          path.join(this.rootDirectory, 'v1', 'deep', `${runId}.jsonl`),
          path.join(bundleDirectory, `deep-${runId}.jsonl`),
        );
      } catch {
        // A run without deep capture intentionally has no deep file.
      }
    }
    const runtimeSegmentIds = [...new Set(events.map((event) => event.runtimeSegmentId))];
    for (const runtimeSegmentId of runtimeSegmentIds) {
      try {
        await this.exportSanitizedFile(
          path.join(this.rootDirectory, 'v1', 'runtime', `${runtimeSegmentId}.jsonl`),
          path.join(bundleDirectory, `runtime-${runtimeSegmentId}.jsonl`),
        );
      } catch {
        // Older traces may not have a persisted runtime segment.
      }
    }
    await fs.writeFile(path.join(bundleDirectory, 'manifest.json'), JSON.stringify({
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      traceId,
      runIds,
      runtimeSegmentIds,
      note: 'Review these redacted diagnostic files before sharing.',
    }, null, 2), { encoding: 'utf8', mode: 0o600 });
    return bundleDirectory;
  }

  private async exportSanitizedFile(source: string, target: string): Promise<void> {
    const content = await fs.readFile(source, 'utf8');
    await fs.writeFile(target, sanitizeDiagnosticReport(content), {
      encoding: 'utf8',
      mode: 0o600,
    });
    await fs.chmod(target, 0o600).catch(() => undefined);
  }

  private async initialize(): Promise<void> {
    try {
      await this.initializeDirectory();
    } catch (error) {
      const fallback = this.fallbackDirectory;
      if (this.requestedDirectory !== fallback) {
        try {
          this.rootDirectory = fallback;
          await this.initializeDirectory();
          this.lastError = `Custom trace directory unavailable; using default: ${error instanceof Error ? error.message : String(error)}`;
          return;
        } catch (fallbackError) {
          this.degrade(fallbackError, this.queue[this.queue.length - 1]?.event);
          return;
        }
      }
      this.degrade(error, this.queue[this.queue.length - 1]?.event);
    }
  }

  private async initializeDirectory(): Promise<void> {
    await fs.mkdir(path.join(this.rootDirectory, 'v1', 'structural'), { recursive: true, mode: 0o700 });
    await fs.mkdir(path.join(this.rootDirectory, 'v1', 'deep'), { recursive: true, mode: 0o700 });
    await fs.mkdir(path.join(this.rootDirectory, 'v1', 'runtime'), { recursive: true, mode: 0o700 });
    await fs.chmod(path.join(this.rootDirectory, 'v1'), 0o700).catch(() => undefined);
    await fs.chmod(path.join(this.rootDirectory, 'v1', 'structural'), 0o700).catch(() => undefined);
    await fs.chmod(path.join(this.rootDirectory, 'v1', 'deep'), 0o700).catch(() => undefined);
    await fs.chmod(path.join(this.rootDirectory, 'v1', 'runtime'), 0o700).catch(() => undefined);
    const pendingIndex = this.index;
    try {
      const persisted = JSON.parse(await fs.readFile(this.indexPath(), 'utf8')) as PersistedTraceIndex;
      this.index = this.mergeIndexes(persisted, pendingIndex);
    } catch {
      this.index = this.mergeIndexes(await this.rebuildIndex(), pendingIndex);
    }
    await this.prune();
    const persistedIndex = this.index;
    this.index = this.mergeIndexes(await this.rebuildIndex(), pendingIndex);
    for (const [traceId, summary] of Object.entries(this.index.summaries)) {
      const persistedSummary = persistedIndex.summaries[traceId];
      if (persistedSummary) {
        summary.unreadAnomalyCount = persistedSummary.unreadAnomalyCount;
        summary.highestUnreadSeverity = persistedSummary.unreadAnomalyCount > 0
          ? persistedSummary.highestUnreadSeverity ?? summary.highestUnreadSeverity
          : undefined;
      }
    }
    await this.persistIndex();
    await this.refreshApproximateBytes();
    this.mode = 'disk';
  }

  private mergeIndexes(
    persisted: PersistedTraceIndex,
    pending: PersistedTraceIndex,
  ): PersistedTraceIndex {
    const severityOrder = ['debug', 'info', 'warning', 'critical', 'error'];
    const summaries = { ...persisted.summaries };
    for (const [traceId, current] of Object.entries(pending.summaries)) {
      const previous = summaries[traceId];
      summaries[traceId] = previous
        ? {
          ...current,
          sessionId: current.sessionId ?? previous.sessionId,
          lastUpdatedAt: current.lastUpdatedAt > previous.lastUpdatedAt
            ? current.lastUpdatedAt
            : previous.lastUpdatedAt,
          eventCount: previous.eventCount + current.eventCount,
          runCount: previous.runCount + current.runCount,
          highestSeverity: severityOrder.indexOf(current.highestSeverity)
            > severityOrder.indexOf(previous.highestSeverity)
            ? current.highestSeverity
            : previous.highestSeverity,
          highestUnreadSeverity: this.higherSeverity(
            current.highestUnreadSeverity,
            previous.highestUnreadSeverity,
          ),
          unreadAnomalyCount: previous.unreadAnomalyCount + current.unreadAnomalyCount,
          deepCaptureCount: previous.deepCaptureCount + current.deepCaptureCount,
        }
        : current;
    }
    return {
      sessions: { ...persisted.sessions, ...pending.sessions },
      summaries,
    };
  }

  // Recovery tolerates partial/corrupt JSONL and reconstructs every optional
  // index field conservatively from versioned structural events.
  // eslint-disable-next-line complexity
  private async rebuildIndex(): Promise<PersistedTraceIndex> {
    const rebuilt: PersistedTraceIndex = { sessions: {}, summaries: {} };
    const directory = path.join(this.rootDirectory, 'v1', 'structural');
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
      const events = await this.readJsonl(path.join(directory, entry.name)).catch(() => []);
      for (const event of events) {
        if (event.sessionId) rebuilt.sessions[event.sessionId] = event.traceId;
        const previous = rebuilt.summaries[event.traceId];
        const severityOrder = ['debug', 'info', 'warning', 'critical', 'error'];
        const isAnomaly = event.severity === 'warning'
          || event.severity === 'critical'
          || event.severity === 'error';
        rebuilt.summaries[event.traceId] = {
          traceId: event.traceId,
          sessionId: event.sessionId ?? previous?.sessionId,
          lastUpdatedAt: previous && previous.lastUpdatedAt > event.timestamp
            ? previous.lastUpdatedAt
            : event.timestamp,
          eventCount: (previous?.eventCount ?? 0) + 1,
          runCount: (previous?.runCount ?? 0) + (event.name === 'run.started' ? 1 : 0),
          highestSeverity: !previous
            || severityOrder.indexOf(event.severity) > severityOrder.indexOf(previous.highestSeverity)
            ? event.severity
            : previous.highestSeverity,
          highestUnreadSeverity: isAnomaly
            ? this.higherSeverity(event.severity, previous?.highestUnreadSeverity)
            : previous?.highestUnreadSeverity,
          unreadAnomalyCount: (previous?.unreadAnomalyCount ?? 0) + (isAnomaly ? 1 : 0),
          deepCaptureCount: (previous?.deepCaptureCount ?? 0)
            + (event.payloadRef?.kind === 'deep' && event.name === 'run.started' ? 1 : 0),
        };
      }
    }
    return rebuilt;
  }

  private async writeBatch(batch: QueuedRecord<TEvent>[]): Promise<void> {
    if (this.mode === 'memory') {
      this.appendMemory(batch);
      return;
    }
    try {
      const grouped = new Map<string, string[]>();
      const deepBytesByPath = new Map<string, number>();
      const cappedRuns = new Set<string>();
      for (const record of batch) {
        const structuralPath = this.isRuntimeEvent(record.event)
          ? path.join(this.rootDirectory, 'v1', 'runtime', `${record.event.runtimeSegmentId}.jsonl`)
          : path.join(this.rootDirectory, 'v1', 'structural', `${record.event.traceId}.jsonl`);
        grouped.set(structuralPath, [...(grouped.get(structuralPath) ?? []), record.json]);
        if (record.deep && record.event.runId) {
          const deepPath = path.join(this.rootDirectory, 'v1', 'deep', `${record.event.runId}.jsonl`);
          const existing = grouped.get(deepPath) ?? [];
          let bytes = deepBytesByPath.get(deepPath);
          if (bytes === undefined) {
            bytes = await fs.stat(deepPath).then((stat) => stat.size).catch(() => 0);
          }
          const deepJson = record.deepJson ?? record.json;
          const nextBytes = bytes + Buffer.byteLength(deepJson);
          if (nextBytes <= MAX_DEEP_RUN_BYTES) {
            grouped.set(deepPath, [...existing, deepJson]);
            deepBytesByPath.set(deepPath, nextBytes);
          } else if (!cappedRuns.has(record.event.runId)) {
            cappedRuns.add(record.event.runId);
            const cappedEvent: TEvent = {
              ...record.event,
              severity: 'warning',
              name: 'trace.deep_truncated',
              payload: { maxBytes: MAX_DEEP_RUN_BYTES },
              payloadRef: { kind: 'inline' },
            };
            const cappedJson = `${JSON.stringify(cappedEvent)}\n`;
            grouped.set(structuralPath, [...(grouped.get(structuralPath) ?? []), cappedJson]);
            if (!this.isRuntimeEvent(cappedEvent)) this.updateSummary(cappedEvent, false);
          }
        }
      }
      for (const [file, records] of grouped) {
        await fs.appendFile(file, records.join(''), { encoding: 'utf8', mode: 0o600 });
        await fs.chmod(file, 0o600).catch(() => undefined);
        this.approximateBytes += Buffer.byteLength(records.join(''));
      }
      await this.persistIndex();
      this.appendMemory(batch);
    } catch (error) {
      this.degrade(error, batch[batch.length - 1]?.event);
      this.appendMemory(batch);
    }
  }

  private appendMemory(batch: QueuedRecord<TEvent>[]): void {
    for (const record of batch) this.memoryEvents.push(record.event);
    if (this.memoryEvents.length > MAX_MEMORY_EVENTS) {
      this.memoryEvents.splice(0, this.memoryEvents.length - MAX_MEMORY_EVENTS);
    }
    if (this.mode === 'memory') {
      try {
        this.approximateBytes = Buffer.byteLength(JSON.stringify(this.memoryEvents));
      } catch {
        this.approximateBytes = 0;
      }
    }
  }

  private updateSummary(event: TEvent, deep: boolean): void {
    const previous = this.index.summaries[event.traceId];
    const severityOrder = ['debug', 'info', 'warning', 'critical', 'error'];
    const isAnomaly = event.severity === 'warning' || event.severity === 'critical' || event.severity === 'error';
    this.index.summaries[event.traceId] = {
      traceId: event.traceId,
      sessionId: event.sessionId ?? previous?.sessionId,
      lastUpdatedAt: event.timestamp,
      eventCount: (previous?.eventCount ?? 0) + 1,
      runCount: (previous?.runCount ?? 0) + (event.name === 'run.started' ? 1 : 0),
      highestSeverity: !previous || severityOrder.indexOf(event.severity) > severityOrder.indexOf(previous.highestSeverity)
        ? event.severity
        : previous.highestSeverity,
      highestUnreadSeverity: isAnomaly
        ? this.higherSeverity(event.severity, previous?.highestUnreadSeverity)
        : previous?.highestUnreadSeverity,
      unreadAnomalyCount: (previous?.unreadAnomalyCount ?? 0) + (isAnomaly ? 1 : 0),
      deepCaptureCount: (previous?.deepCaptureCount ?? 0) + (deep && event.name === 'run.started' ? 1 : 0),
    };
  }

  private async readJsonl(file: string): Promise<TEvent[]> {
    const content = await fs.readFile(file, 'utf8');
    const events: TEvent[] = [];
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        events.push(JSON.parse(line) as TEvent);
      } catch {
        // A crash may leave only the final JSONL record incomplete.
      }
    }
    return events;
  }

  private async persistIndex(): Promise<void> {
    if (this.mode === 'memory') return;
    const target = this.indexPath();
    const temporary = `${target}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(this.index), { encoding: 'utf8', mode: 0o600 });
    await fs.rename(temporary, target);
    await fs.chmod(target, 0o600).catch(() => undefined);
  }

  private indexPath(): string {
    return path.join(this.rootDirectory, 'v1', 'index.json');
  }

  private async prune(): Promise<void> {
    const now = Date.now();
    const pruneDirectory = async (directory: string, retentionMs: number, maxBytes?: number) => {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      const files = (await Promise.all(entries.filter((entry) => entry.isFile()).map(async (entry) => {
        const file = path.join(directory, entry.name);
        const stat = await fs.stat(file);
        return { file, mtimeMs: stat.mtimeMs, size: stat.size };
      }))).sort((left, right) => left.mtimeMs - right.mtimeMs);
      let total = files.reduce((sum, file) => sum + file.size, 0);
      for (const file of files) {
        if (now - file.mtimeMs > retentionMs || (maxBytes !== undefined && total > maxBytes)) {
          await fs.rm(file.file, { force: true });
          total -= file.size;
        }
      }
      this.approximateBytes += total;
    };
    await pruneDirectory(path.join(this.rootDirectory, 'v1', 'structural'), STRUCTURAL_RETENTION_MS, MAX_STRUCTURAL_BYTES);
    await pruneDirectory(path.join(this.rootDirectory, 'v1', 'deep'), DEEP_RETENTION_MS);
    await pruneDirectory(path.join(this.rootDirectory, 'v1', 'runtime'), STRUCTURAL_RETENTION_MS);
  }

  private async refreshApproximateBytes(): Promise<void> {
    if (this.mode === 'memory') {
      this.approximateBytes = Buffer.byteLength(JSON.stringify(this.memoryEvents));
      return;
    }
    const root = path.join(this.rootDirectory, 'v1');
    const totalDirectory = async (directory: string): Promise<number> => {
      const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
      let total = 0;
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        total += await fs.stat(path.join(directory, entry.name))
          .then((stat) => stat.size)
          .catch(() => 0);
      }
      return total;
    };
    this.approximateBytes = await totalDirectory(path.join(root, 'structural'))
      + await totalDirectory(path.join(root, 'deep'))
      + await totalDirectory(path.join(root, 'runtime'));
  }

  private degrade(error: unknown, template?: TEvent): void {
    if (this.mode === 'memory') return;
    this.mode = 'memory';
    this.lastError = 'Trace storage unavailable; diagnostics are using the memory ring.';
    if (this.degradedListener) {
      try {
        this.degradedListener(error, template);
        return;
      } catch {
        // Fall through to a content-free standalone event.
      }
    }
    const isolatedRuntimeSegmentId = `storage-degraded-${randomUUID()}`;
    const event = {
      schemaVersion: 1,
      timestamp: new Date().toISOString(),
      monotonicSequence: 1,
      traceId: 'storage-degraded',
      runtimeSegmentId: isolatedRuntimeSegmentId,
      channel: 'persistence-recovery',
      source: 'storage',
      severity: 'error',
      name: 'trace.storage_degraded',
      payload: {
        error: this.lastError,
        fallback: 'memory-ring',
      },
      payloadRef: { kind: 'inline' },
    } as TEvent;
    this.appendMemory([{ event, deep: false, json: '', bytes: 0 }]);
    this.updateSummary(event, false);
  }

  private isRuntimeEvent(event: TEvent): boolean {
    return !event.sessionId && event.traceId === event.runtimeSegmentId;
  }

  private higherSeverity(
    left: TraceSummary['highestUnreadSeverity'],
    right: TraceSummary['highestUnreadSeverity'],
  ): TraceSummary['highestUnreadSeverity'] {
    const severityOrder = ['debug', 'info', 'warning', 'critical', 'error'];
    if (!left) return right;
    if (!right) return left;
    return severityOrder.indexOf(left) > severityOrder.indexOf(right) ? left : right;
  }

  private mergeEventCopies(
    diskEvents: TEvent[],
    memoryEvents: TEvent[],
  ): TEvent[] {
    const events = new Map<string, TEvent>();
    for (const event of [...diskEvents, ...memoryEvents]) {
      const key = [
        event.runtimeSegmentId,
        event.traceId,
        event.runId ?? '',
        event.monotonicSequence,
        event.name,
        event.sourceEventId ?? '',
      ].join(':');
      events.set(key, event);
    }
    return [...events.values()].sort((left, right) =>
      left.timestamp.localeCompare(right.timestamp)
      || left.monotonicSequence - right.monotonicSequence);
  }
}
