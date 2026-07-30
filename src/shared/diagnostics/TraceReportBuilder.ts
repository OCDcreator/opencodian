import { sanitizeDiagnosticReport } from '../diagnosticSecretSanitizer';
import { TraceRedactor } from './TraceRedactor';
import { TraceStore } from './TraceStore';
import type { TraceEventBase, TraceSummary } from './types';

const MAX_REPORT_BYTES = 1024 * 1024;
const WINDOW_SIZE = 50;

function eventLine(event: TraceEventBase): string {
  return JSON.stringify(event);
}

export class TraceReportBuilder<TEvent extends TraceEventBase = TraceEventBase> {
  constructor(
    private readonly store: TraceStore<TEvent>,
    private readonly buildIdentity: () => string,
    private readonly redactor: TraceRedactor,
    private readonly options: {
      title: string;
      extractMetadata?: (events: TEvent[]) => string[];
    },
  ) {}

  async buildSmartReport(
    traceId?: string,
    userContext?: { actual?: string; expected?: string; reproduction?: string },
    options: { selection?: 'automatic' | 'current-session' } = {},
  ): Promise<string> {
    const summary = options.selection === 'current-session'
      ? traceId
        ? this.store.listSummaries(100).find((item) => item.traceId === traceId)
        : undefined
      : traceId
        ? this.store.listSummaries(100).find((item) => item.traceId === traceId)
        : this.chooseSummary(this.store.listSummaries(20));
    const structuralEvents = summary ? await this.store.readTrace(summary.traceId) : [];
    const deepRunIds = [...new Set(structuralEvents
      .filter((event) => event.payloadRef?.kind === 'deep' && event.runId)
      .map((event) => event.runId as string))];
    const deepEvents = (await Promise.all(deepRunIds.map((runId) => this.store.readDeepRun(runId)))).flat();
    const runtimeSegmentIds = [...new Set(structuralEvents.map((event) => event.runtimeSegmentId))];
    const runtimeEvents = (await Promise.all(
      runtimeSegmentIds.map((runtimeSegmentId) => this.store.readRuntimeSegment(runtimeSegmentId)),
    )).flat();
    const events = this.mergeEvents([...runtimeEvents, ...structuralEvents, ...deepEvents]);
    const selectedEvents = this.selectEventWindows(events);
    const omitted = events.length - selectedEvents.length;
    const lines = [
      `# ${this.options.title}`,
      '',
      `Generated: ${new Date().toISOString()}`,
      this.buildIdentity(),
      `Report scope: ${options.selection ?? 'automatic'}`,
      `Current session trace unavailable: ${options.selection === 'current-session' && !summary}`,
      `Storage mode: ${this.store.getStatus().mode}`,
      `Trace: ${summary?.traceId ?? '(none)'}`,
      `Session: ${summary?.sessionId ?? '(none)'}`,
      `Structural events: ${structuralEvents.length}`,
      `Deep events: ${deepEvents.length}`,
      `Runtime events: ${runtimeEvents.length}`,
      `Highest severity: ${summary?.highestSeverity ?? 'info'}`,
      `Highest unread severity: ${summary?.highestUnreadSeverity ?? 'none'}`,
      ...this.buildMetadataLines(events),
      '',
      '## User context',
      `Actual: ${userContext?.actual?.trim() || '(not provided)'}`,
      `Expected: ${userContext?.expected?.trim() || '(not provided)'}`,
      `Reproduction: ${userContext?.reproduction?.trim() || '(not provided)'}`,
      '',
      '## Trace events',
      ...selectedEvents.map(eventLine),
      ...(omitted > 0 ? [`{"name":"report.events_omitted","count":${omitted}}`] : []),
      '',
      'Review this report before sharing. Secrets and local paths are redacted on a best-effort basis.',
    ];
    const report = this.capAndSanitize(lines.join('\n'));
    if (summary) await this.store.markTraceRead(summary.traceId);
    return report;
  }

  private chooseSummary(summaries: TraceSummary[]): TraceSummary | undefined {
    const severityOrder = ['debug', 'info', 'warning', 'critical', 'error'];
    return [...summaries].sort((left, right) => {
      const anomalyDifference = Number(right.unreadAnomalyCount > 0) - Number(left.unreadAnomalyCount > 0);
      if (anomalyDifference !== 0) return anomalyDifference;
      const severityDifference = severityOrder.indexOf(right.highestUnreadSeverity ?? 'debug')
        - severityOrder.indexOf(left.highestUnreadSeverity ?? 'debug');
      return severityDifference || right.lastUpdatedAt.localeCompare(left.lastUpdatedAt);
    })[0];
  }

  private selectEventWindows(events: TEvent[]): TEvent[] {
    if (Buffer.byteLength(events.map(eventLine).join('\n')) < MAX_REPORT_BYTES * 0.8) return events;
    const indices = new Set<number>();
    const addWindow = (center: number) => {
      for (let index = Math.max(0, center - WINDOW_SIZE); index <= Math.min(events.length - 1, center + WINDOW_SIZE); index += 1) {
        indices.add(index);
      }
    };
    for (let index = 0; index < Math.min(WINDOW_SIZE, events.length); index += 1) indices.add(index);
    for (let index = Math.max(0, events.length - WINDOW_SIZE); index < events.length; index += 1) indices.add(index);
    events.forEach((event, index) => {
      if (event.severity === 'warning' || event.severity === 'critical' || event.severity === 'error') addWindow(index);
    });
    return [...indices].sort((left, right) => left - right).map((index) => events[index]);
  }

  private mergeEvents(events: TEvent[]): TEvent[] {
    const deduplicated = new Map<string, TEvent>();
    for (const event of events) {
      const key = [
        event.runtimeSegmentId,
        event.monotonicSequence,
        event.runId ?? '',
        event.name,
        event.sourceEventId ?? '',
      ].join(':');
      const previous = deduplicated.get(key);
      if (!previous || (previous.payloadRef?.kind !== 'deep' && event.payloadRef?.kind === 'deep')) {
        deduplicated.set(key, event);
      }
    }
    return [...deduplicated.values()].sort((left, right) =>
      left.timestamp.localeCompare(right.timestamp)
      || left.monotonicSequence - right.monotonicSequence);
  }

  private buildMetadataLines(events: TEvent[]): string[] {
    return this.options.extractMetadata?.(events) ?? [];
  }

  private capAndSanitize(report: string): string {
    const pathAndSecretRedacted = report
      .split('\n')
      .map((line) => {
        const redacted = this.redactor.redact(line).value;
        return typeof redacted === 'string' ? redacted : JSON.stringify(redacted);
      })
      .join('\n');
    const sanitized = sanitizeDiagnosticReport(pathAndSecretRedacted);
    if (Buffer.byteLength(sanitized) <= MAX_REPORT_BYTES) return sanitized;
    const suffix = '\n\n[Report truncated at 1 MiB; export the trace files for full detail.]';
    const limit = MAX_REPORT_BYTES - Buffer.byteLength(suffix);
    let prefix = '';
    let prefixBytes = 0;
    for (const character of sanitized) {
      const characterBytes = Buffer.byteLength(character);
      if (prefixBytes + characterBytes > limit) break;
      prefix += character;
      prefixBytes += characterBytes;
    }
    return `${prefix}${suffix}`;
  }
}
