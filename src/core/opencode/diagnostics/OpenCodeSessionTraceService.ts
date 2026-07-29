/* eslint-disable max-lines, max-params -- This owner intentionally keeps trace lifecycle, correlation, console routing, and degradation state auditable in one service. */
import { createHash, createHmac, randomUUID } from 'crypto';

import { createLogger } from '../../../shared/logger';
import { inspectOpenCodeIngressEvent } from './OpenCodeTraceEventInspector';
import { OpenCodeTraceRedactor } from './OpenCodeTraceRedactor';
import { OpenCodeTraceReportBuilder } from './OpenCodeTraceReportBuilder';
import { OpenCodeTraceStore } from './OpenCodeTraceStore';
import {
  OPEN_CODE_TRACE_SCHEMA_VERSION,
  type OpenCodeBootstrapContext,
  type OpenCodeDiagnosticRunToken,
  type OpenCodeTraceChannelId,
  type OpenCodeTraceContext,
  type OpenCodeTraceEventLink,
  type OpenCodeTraceEventV1,
  type OpenCodeTracePort,
  type OpenCodeTraceSeverity,
  type OpenCodeTraceTerminalState,
} from './types';

const logger = createLogger('OpenCodeTrace');
const ARM_TTL_MS = 30 * 60 * 1000;
const DEEP_CAPTURE_TTL_MS = 30 * 60 * 1000;
const FOREGROUND_WARNING_MS = 60 * 1000;
const FOREGROUND_CRITICAL_MS = 180 * 1000;
const BACKGROUND_WARNING_MS = 5 * 60 * 1000;
const MAX_CHILD_DEPTH = 5;
const MAX_CHILDREN = 20;

export interface OpenCodeSessionTraceSettings {
  enabled: boolean;
  consolePreset: 'standard' | 'full';
  consoleChannels: Record<OpenCodeTraceChannelId, boolean>;
  storageDirectory: string;
}

export interface OpenCodeSessionTraceServiceOptions {
  settings: () => OpenCodeSessionTraceSettings;
  vaultPath?: string;
  buildIdentity?: () => string;
  knownSecrets?: () => readonly string[];
  runtimeMetadata?: () => Record<string, unknown>;
}

interface ArmedCapture {
  token: OpenCodeDiagnosticRunToken;
  sessionId?: string;
}

interface ActiveRunState {
  context: OpenCodeTraceContext;
  lastProgressAt: number;
  warningTimer: ReturnType<typeof setTimeout>;
  criticalTimer: ReturnType<typeof setTimeout>;
  paused: boolean;
  deepTimer?: ReturnType<typeof setTimeout>;
}

export class OpenCodeSessionTraceService implements OpenCodeTracePort {
  readonly runtimeSegmentId = randomUUID();
  readonly store: OpenCodeTraceStore;
  readonly reportBuilder: OpenCodeTraceReportBuilder;
  private readonly redactor: OpenCodeTraceRedactor;
  private sequence = 0;
  private armedByTab = new Map<string, ArmedCapture>();
  private claimedByTab = new Map<string, OpenCodeDiagnosticRunToken>();
  private activeRunsByRunId = new Map<string, ActiveRunState>();
  private sessionContextById = new Map<string, OpenCodeTraceContext>();
  private linkedChildIdsByTree = new Map<string, Set<string>>();
  private childCounts = new Map<string, number>();
  private runChildCounts = new Map<string, number>();
  private lastIngressSequenceBySession = new Map<string, number>();
  private finishedRunIds = new Set<string>();
  private backgroundTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly options: OpenCodeSessionTraceServiceOptions) {
    this.store = new OpenCodeTraceStore(options.settings().storageDirectory);
    this.redactor = new OpenCodeTraceRedactor({
      vaultPath: options.vaultPath,
      diagnosticsPath: this.store.rootDirectory,
      knownSecrets: options.knownSecrets?.(),
    });
    this.reportBuilder = new OpenCodeTraceReportBuilder(
      this.store,
      options.buildIdentity ?? (() => 'Build: unknown'),
      this.redactor,
    );
    this.store.onDegraded((error, template) => this.emitStorageDegraded(error, template));
    this.emit(this.context(this.runtimeSegmentId), 'lifecycle', 'plugin', 'info', 'runtime.started', {
      runtimeSegmentId: this.runtimeSegmentId,
      platform: process.platform,
      storageDirectory: this.store.rootDirectory,
      ...options.runtimeMetadata?.(),
    });
    void this.recordCredentialIdentity();
  }

  beginBootstrap(payload?: unknown): OpenCodeBootstrapContext {
    const context: OpenCodeBootstrapContext = {
      ...this.context(this.runtimeSegmentId),
      bootstrapId: randomUUID(),
    };
    this.emit(context, 'lifecycle', 'plugin', 'info', 'session.bootstrap.started', payload);
    return context;
  }

  bindSession(context: OpenCodeBootstrapContext, sessionId: string): OpenCodeTraceContext {
    const previousTraceId = this.store.resolveTraceId(sessionId);
    const bound = {
      ...context,
      traceId: previousTraceId ?? this.stableTraceId(sessionId),
      rootSessionId: sessionId,
      sessionId,
    };
    this.store.bindSession(sessionId, bound.traceId);
    this.sessionContextById.set(sessionId, bound);
    this.emit(bound, 'persistence-recovery', 'plugin', 'info', previousTraceId ? 'session.resumed' : 'session.bound', {
      bootstrapId: context.bootstrapId,
      transition: previousTraceId ? 'interrupted -> reloaded -> resumed' : 'bootstrap -> bound',
    });
    return bound;
  }

  beginRun(input: {
    sessionId: string;
    model?: string;
    provider?: string;
    messageId?: string;
    prompt?: string;
    diagnosticRunToken?: OpenCodeDiagnosticRunToken;
  }): OpenCodeTraceContext {
    const token = input.diagnosticRunToken;
    if (token && this.claimedByTab.get(token.tabId)?.runId === token.runId) {
      this.claimedByTab.delete(token.tabId);
    }
    const traceId = this.store.resolveTraceId(input.sessionId) ?? this.stableTraceId(input.sessionId);
    this.store.bindSession(input.sessionId, traceId);
    const context: OpenCodeTraceContext = {
      ...this.context(traceId),
      runId: token?.runId ?? randomUUID(),
      rootSessionId: input.sessionId,
      sessionId: input.sessionId,
      deepCapture: Boolean(token),
      tabId: token?.tabId,
    };
    this.sessionContextById.set(input.sessionId, context);
    this.emit(context, 'lifecycle', 'plugin', 'info', 'run.started', {
      model: input.model,
      provider: input.provider,
      messageId: input.messageId,
      prompt: token ? input.prompt : undefined,
      deepCapture: Boolean(token),
    }, token !== undefined);
    this.startRunTimers(context);
    return context;
  }

  recordIngress(
    context: OpenCodeTraceContext,
    name: string,
    payload?: unknown,
    link?: OpenCodeTraceEventLink,
  ): void {
    this.noteProgress(context);
    this.emit(
      context,
      'stream-sync',
      'sse',
      'debug',
      name,
      context.deepCapture ? payload : this.summarize(payload),
      context.deepCapture === true,
      {
        ...link,
        metrics: { payloadBytes: this.measurePayloadBytes(payload), ...link?.metrics },
      },
    );
  }

  recordNormalized(
    context: OpenCodeTraceContext,
    name: string,
    payload?: unknown,
    link?: OpenCodeTraceEventLink,
  ): void {
    this.noteProgress(context);
    this.emit(
      context,
      'stream-sync',
      'plugin',
      'debug',
      name,
      context.deepCapture ? payload : this.summarize(payload),
      context.deepCapture === true,
      {
        ...link,
        metrics: { payloadBytes: this.measurePayloadBytes(payload), ...link?.metrics },
      },
    );
  }

  linkChildSession(
    context: OpenCodeTraceContext,
    childSessionId: string,
    payload: { depth?: number; relation?: string } = {},
  ): OpenCodeTraceContext {
    const treeKey = this.childTreeKey(context);
    const linkedChildIds = this.linkedChildIdsByTree.get(treeKey) ?? new Set<string>();
    const existing = this.sessionContextById.get(childSessionId);
    if (linkedChildIds.has(childSessionId)) {
      if (existing?.traceId === context.traceId) return existing;
      const restored = {
        ...context,
        parentSessionId: context.sessionId,
        sessionId: childSessionId,
        childDepth: payload.depth ?? (context.childDepth ?? 0) + 1,
      };
      this.store.bindSession(childSessionId, context.traceId);
      this.sessionContextById.set(childSessionId, restored);
      return restored;
    }
    const depth = payload.depth ?? (context.childDepth ?? 0) + 1;
    const count = (this.childCounts.get(treeKey) ?? 0) + 1;
    if (depth > MAX_CHILD_DEPTH || count > MAX_CHILDREN) {
      this.markAnomaly(context, 'child_session.truncated', 'warning', { childSessionId, depth, count });
      return context;
    }
    linkedChildIds.add(childSessionId);
    this.linkedChildIdsByTree.set(treeKey, linkedChildIds);
    this.childCounts.set(treeKey, count);
    if (context.runId) {
      this.runChildCounts.set(context.runId, (this.runChildCounts.get(context.runId) ?? 0) + 1);
    }
    const child = {
      ...context,
      parentSessionId: context.sessionId,
      sessionId: childSessionId,
      childDepth: depth,
    };
    this.store.bindSession(childSessionId, context.traceId);
    this.sessionContextById.set(childSessionId, child);
    this.emit(child, 'tool-interaction', 'plugin', 'info', 'child_session.linked', {
      ...payload,
      depth,
      count,
      rootSessionId: context.rootSessionId,
    }, context.deepCapture === true);
    return child;
  }

  finishRun(context: OpenCodeTraceContext, state: OpenCodeTraceTerminalState, payload?: unknown): void {
    if (context.runId && this.finishedRunIds.has(context.runId)) return;
    if (context.runId) this.finishedRunIds.add(context.runId);
    const activeState = this.findRunState(context);
    const descendantCount = context.runId ? this.runChildCounts.get(context.runId) ?? 0 : 0;
    const associationIncomplete = context.deepCapture
      && state === 'completed'
      && (activeState?.paused === true || descendantCount > 0);
    if (associationIncomplete) {
      this.emit(
        context,
        'persistence-recovery',
        'plugin',
        'warning',
        'capture.association_incomplete',
        {
          reason: activeState?.paused ? 'interaction_pending' : 'descendant_stability_unavailable',
          descendantCount,
        },
        true,
      );
    }
    this.stopRunTimers(context);
    if (context.runId) {
      this.runChildCounts.delete(context.runId);
      this.childCounts.delete(this.childTreeKey(context));
      this.linkedChildIdsByTree.delete(this.childTreeKey(context));
    }
    if (context.runId) {
      for (const [sessionId, mapped] of this.sessionContextById) {
        if (mapped.runId !== context.runId) continue;
        this.sessionContextById.set(sessionId, {
          traceId: mapped.traceId,
          runtimeSegmentId: mapped.runtimeSegmentId,
          rootSessionId: mapped.rootSessionId,
          parentSessionId: mapped.parentSessionId,
          sessionId: mapped.sessionId,
          childDepth: mapped.childDepth,
        });
      }
    }
    this.emit(
      context,
      'lifecycle',
      'plugin',
      state === 'error' || state === 'incomplete' || associationIncomplete ? 'error' : 'info',
      'run.finished',
      { state: associationIncomplete ? 'incomplete' : state, payload },
      context.deepCapture === true,
    );
  }

  markAnomaly(
    context: OpenCodeTraceContext,
    name: string,
    severity: 'warning' | 'critical' | 'error',
    payload?: unknown,
  ): void {
    this.emit(context, 'stream-sync', 'plugin', severity, `anomaly.${name}`, payload, context.deepCapture === true);
  }

  recordSdkCall(input: {
    context?: OpenCodeTraceContext;
    path: string;
    args: unknown[];
    durationMs: number;
    result?: unknown;
    error?: unknown;
  }): void {
    const sessionId = this.inferSessionId(input.args);
    const context = input.context ?? (sessionId
      ? this.findLatestSessionState(sessionId)?.context ?? this.contextForSession(sessionId)
      : this.context(randomUUID()));
    const channel = /^(?:question|permission|tool)\.|^session\.(?:children|shell|command)$/.test(input.path)
      ? 'tool-interaction'
      : 'transport';
    this.emit(
      context,
      channel,
      'sdk',
      input.error ? 'error' : 'debug',
      'sdk.call',
      {
        path: input.path,
        durationMs: input.durationMs,
        args: context.deepCapture ? input.args : this.summarize(input.args),
        result: context.deepCapture ? input.result : this.summarize(input.result),
        error: input.error,
      },
      context.deepCapture === true,
      { metrics: { durationMs: input.durationMs } },
    );
  }

  recordTransport(input: {
    context?: OpenCodeTraceContext;
    method: string;
    url: string;
    status?: number;
    durationMs: number;
    requestId?: string;
    error?: unknown;
  }): void {
    const sessionId = /\/session\/([^/?]+)/.exec(input.url)?.[1];
    const context = input.context ?? (sessionId
      ? this.findLatestSessionState(sessionId)?.context ?? this.contextForSession(sessionId)
      : this.context(randomUUID()));
    this.emit(
      context,
      'transport',
      'http',
      input.error || (input.status ?? 0) >= 400 ? 'error' : 'debug',
      'http.request',
      input,
      false,
      {
        requestId: input.requestId,
        metrics: { durationMs: input.durationMs },
      },
    );
  }

  recordRuntime(input: {
    channel: OpenCodeTraceChannelId;
    source: OpenCodeTraceEventV1['source'];
    severity: OpenCodeTraceSeverity;
    name: string;
    payload?: unknown;
  }): void {
    this.emit(this.context(this.runtimeSegmentId), input.channel, input.source, input.severity, input.name, input.payload);
  }

  recordServiceOutput(input: { stream: 'stdout' | 'stderr'; text: string; pid?: number }): void {
    const deepRuns = [...this.activeRunsByRunId.values()].filter((state) => state.context.deepCapture);
    if (deepRuns.length === 0) {
      this.emit(
        this.context(this.runtimeSegmentId),
        'service-output',
        'server',
        input.stream === 'stderr' ? 'warning' : 'debug',
        'service.output',
        {
          stream: input.stream,
          pid: input.pid,
          bytes: Buffer.byteLength(input.text),
          lines: input.text.split(/\r?\n/).filter(Boolean).length,
          contentOmitted: true,
        },
      );
      return;
    }
    for (const run of deepRuns) {
      this.emit(
        run.context,
        'service-output',
        'server',
        input.stream === 'stderr' ? 'warning' : 'debug',
        'service.output',
        { ...input, association: 'runtime-window' },
        true,
      );
    }
  }

  recordReconnect(input: {
    context?: OpenCodeTraceContext;
    name: string;
    severity: OpenCodeTraceSeverity;
    payload?: unknown;
  }): void {
    const context = input.context ?? this.context(this.runtimeSegmentId);
    this.emit(
      context,
      'stream-sync',
      'sdk',
      input.severity,
      input.name,
      input.context
        ? input.payload
        : { association: 'runtime-window', correlation: 'unresolved', detail: input.payload },
      context.deepCapture === true,
    );
  }

  recordSessionIngress(
    sessionId: string,
    name: string,
    payload?: unknown,
    explicitContext?: OpenCodeTraceContext,
    link?: OpenCodeTraceEventLink,
  ): void {
    const context = explicitContext
      ?? this.findLatestSessionState(sessionId)?.context
      ?? this.contextForSession(sessionId);
    const inspection = inspectOpenCodeIngressEvent(
      sessionId,
      payload,
      this.lastIngressSequenceBySession.get(sessionId),
    );
    if (inspection.nextSequence !== undefined) {
      this.lastIngressSequenceBySession.set(sessionId, inspection.nextSequence);
    }
    for (const anomaly of inspection.anomalies) {
      this.markAnomaly(context, anomaly.name, anomaly.severity, anomaly.payload);
    }
    if (inspection.backgroundState === 'start') {
      const existing = this.backgroundTimers.get(sessionId);
      if (existing) clearTimeout(existing);
      this.backgroundTimers.set(sessionId, setTimeout(() => {
        this.markAnomaly(context, 'background_stalled', 'warning', {
          thresholdMs: BACKGROUND_WARNING_MS,
          eventType: inspection.eventType,
        });
      }, BACKGROUND_WARNING_MS));
    } else if (inspection.backgroundState === 'finish') {
      const timer = this.backgroundTimers.get(sessionId);
      if (timer) clearTimeout(timer);
      this.backgroundTimers.delete(sessionId);
    }
    if (inspection.interactionState === 'pause') {
      this.pauseRunTimers(context);
    } else if (inspection.interactionState === 'resume') {
      this.resumeRunTimers(context);
    }
    const childSessionId = this.extractChildSessionId(payload, sessionId);
    if (childSessionId) this.linkChildSession(context, childSessionId, { relation: inspection.eventType });
    if (inspection.isInteraction) {
      this.noteProgress(context);
      this.emit(
        context,
        'tool-interaction',
        'sse',
        'debug',
        name,
        context.deepCapture ? payload : this.summarize(payload),
        context.deepCapture === true,
        link,
      );
      return;
    }
    this.recordIngress(context, name, payload, link);
  }

  recordSessionNormalized(
    sessionId: string,
    name: string,
    payload?: unknown,
    explicitContext?: OpenCodeTraceContext,
    link?: OpenCodeTraceEventLink,
  ): void {
    const context = explicitContext
      ?? this.findLatestSessionState(sessionId)?.context
      ?? this.contextForSession(sessionId);
    this.recordNormalized(context, name, payload, link);
  }

  finishActiveSessionRun(sessionId: string, state: OpenCodeTraceTerminalState, payload?: unknown): void {
    for (const active of this.findSessionStates(sessionId)) {
      this.finishRun(active.context, state, payload);
    }
  }

  armDeepCapture(tabId: string, sessionId?: string): OpenCodeDiagnosticRunToken {
    this.pruneArmedCaptures();
    const token = {
      runId: randomUUID(),
      tabId,
      armedAt: Date.now(),
      expiresAt: Date.now() + ARM_TTL_MS,
    };
    this.armedByTab.set(tabId, { token, sessionId });
    return token;
  }

  cancelDeepCapture(tabId: string): boolean {
    return this.armedByTab.delete(tabId);
  }

  claimDeepCapture(tabId: string, sessionId?: string): OpenCodeDiagnosticRunToken | undefined {
    this.pruneArmedCaptures();
    const armed = this.armedByTab.get(tabId);
    if (!armed || (armed.sessionId && armed.sessionId !== sessionId)) return undefined;
    this.armedByTab.delete(tabId);
    this.claimedByTab.set(tabId, armed.token);
    return armed.token;
  }

  getCaptureState(tabId: string): 'off' | 'armed' | 'capturing' {
    this.pruneArmedCaptures();
    const armed = this.armedByTab.get(tabId);
    if (armed) return 'armed';
    if (this.claimedByTab.has(tabId)) return 'capturing';
    return [...this.activeRunsByRunId.values()].some((state) =>
      state.context.deepCapture
      && state.context.tabId === tabId
      && Date.now() - state.lastProgressAt < DEEP_CAPTURE_TTL_MS)
      ? 'capturing'
      : 'off';
  }

  async dispose(): Promise<void> {
    for (const state of this.activeRunsByRunId.values()) {
      clearTimeout(state.warningTimer);
      clearTimeout(state.criticalTimer);
      if (state.deepTimer) clearTimeout(state.deepTimer);
    }
    this.activeRunsByRunId.clear();
    this.sessionContextById.clear();
    this.linkedChildIdsByTree.clear();
    this.childCounts.clear();
    this.runChildCounts.clear();
    for (const timer of this.backgroundTimers.values()) clearTimeout(timer);
    this.backgroundTimers.clear();
    this.armedByTab.clear();
    this.claimedByTab.clear();
    this.emit(this.context(this.runtimeSegmentId), 'lifecycle', 'plugin', 'info', 'runtime.stopped');
    await this.store.dispose();
  }

  private context(traceId: string): OpenCodeTraceContext {
    return { traceId, runtimeSegmentId: this.runtimeSegmentId };
  }

  private contextForSession(sessionId: string): OpenCodeTraceContext {
    const mapped = this.sessionContextById.get(sessionId);
    if (mapped) return mapped;
    const traceId = this.store.resolveTraceId(sessionId) ?? this.stableTraceId(sessionId);
    this.store.bindSession(sessionId, traceId);
    return { ...this.context(traceId), rootSessionId: sessionId, sessionId };
  }

  private emit(
    context: OpenCodeTraceContext,
    channel: OpenCodeTraceChannelId,
    source: OpenCodeTraceEventV1['source'],
    severity: OpenCodeTraceSeverity,
    name: string,
    payload?: unknown,
    deep = false,
    link: OpenCodeTraceEventLink = {},
  ): void {
    try {
      if (!this.options.settings().enabled) return;
      const redacted = this.redactor.redact(
        payload,
        channel === 'service-output' ? 'service-output' : 'ordinary',
      );
      const inferred = this.extractEventLink(redacted.value);
      const event: OpenCodeTraceEventV1 = {
        schemaVersion: OPEN_CODE_TRACE_SCHEMA_VERSION,
        timestamp: new Date().toISOString(),
        monotonicSequence: ++this.sequence,
        traceId: context.traceId,
        runtimeSegmentId: context.runtimeSegmentId,
        runId: context.runId,
        rootSessionId: context.rootSessionId,
        parentSessionId: context.parentSessionId,
        sessionId: context.sessionId,
        messageId: link.messageId ?? inferred.messageId,
        partId: link.partId ?? inferred.partId,
        callId: link.callId ?? inferred.callId,
        requestId: link.requestId ?? inferred.requestId,
        sourceEventId: link.sourceEventId,
        channel,
        source,
        severity,
        name,
        metrics: {
          ...link.metrics,
          redactedSecrets: redacted.stats.secretsRemoved,
          normalizedPaths: redacted.stats.pathsNormalized,
          truncatedValues: redacted.stats.valuesTruncated,
          omittedBinaryValues: redacted.stats.binaryValuesOmitted,
        },
        payload: redacted.value,
        payloadRef: { kind: deep ? 'deep' : 'inline', runId: deep ? context.runId : undefined },
      };
      this.store.append(event, deep);
      this.emitConsole(event, deep);
    } catch {
      // Diagnostics must never affect the OpenCode request or stream path.
    }
  }

  private emitConsole(event: OpenCodeTraceEventV1, deep: boolean): void {
    try {
      const settings = this.options.settings();
      const shouldConsole = event.severity === 'warning'
        || event.severity === 'critical'
        || event.severity === 'error'
        || (settings.consoleChannels[event.channel]
          && (settings.consolePreset === 'full' || event.severity !== 'debug'))
        || deep;
      if (!shouldConsole) return;
      const args = ['[OpenCodian][OpenCodeTrace]', event.name, event];
      if (event.severity === 'error' || event.severity === 'critical') logger.error(...args);
      else if (event.severity === 'warning') logger.warn(...args);
      else if (deep) logger.always(...args);
      else logger.info(...args);
    } catch {
      // Console failure is diagnostics-only.
    }
  }

  private emitStorageDegraded(error: unknown, template?: OpenCodeTraceEventV1): void {
    const context: OpenCodeTraceContext = template
      ? {
        traceId: template.traceId,
        runtimeSegmentId: template.runtimeSegmentId,
        runId: template.runId,
        rootSessionId: template.rootSessionId,
        parentSessionId: template.parentSessionId,
        sessionId: template.sessionId,
      }
      : this.context(this.runtimeSegmentId);
    this.emit(
      context,
      'persistence-recovery',
      'storage',
      'error',
      'trace.storage_degraded',
      {
        error,
        fallback: 'memory-ring',
      },
    );
  }

  private extractEventLink(payload: unknown): OpenCodeTraceEventLink {
    if (!payload || typeof payload !== 'object') return {};
    try {
      const record = payload as Record<string, unknown>;
      const properties = record.properties && typeof record.properties === 'object'
        ? record.properties as Record<string, unknown>
        : record;
      const part = properties.part && typeof properties.part === 'object'
        ? properties.part as Record<string, unknown>
        : undefined;
      return {
        messageId: this.firstString(properties.messageID, properties.messageId, part?.messageID, part?.messageId),
        partId: this.firstString(properties.partID, properties.partId, part?.id),
        callId: this.firstString(properties.callID, properties.callId, properties.toolCallID),
        requestId: this.firstString(properties.requestID, properties.requestId),
      };
    } catch {
      return {};
    }
  }

  private firstString(...values: unknown[]): string | undefined {
    return values.find((value): value is string => typeof value === 'string' && value.length > 0);
  }

  private measurePayloadBytes(payload: unknown): number {
    try {
      return Buffer.byteLength(JSON.stringify(payload));
    } catch {
      return 0;
    }
  }

  private startRunTimers(context: OpenCodeTraceContext): void {
    if (!context.sessionId || !context.runId) return;
    const state: ActiveRunState = {
      context,
      lastProgressAt: Date.now(),
      warningTimer: setTimeout(() => {
        this.markAnomaly(context, 'foreground_stalled', 'warning', { thresholdMs: FOREGROUND_WARNING_MS });
      }, FOREGROUND_WARNING_MS),
      criticalTimer: setTimeout(() => {
        this.markAnomaly(context, 'foreground_stalled', 'critical', { thresholdMs: FOREGROUND_CRITICAL_MS });
      }, FOREGROUND_CRITICAL_MS),
      paused: false,
      deepTimer: context.deepCapture
        ? setTimeout(() => {
          this.finishRun(context, 'incomplete', { reason: 'deep_capture_timeout', thresholdMs: DEEP_CAPTURE_TTL_MS });
        }, DEEP_CAPTURE_TTL_MS)
        : undefined,
    };
    this.activeRunsByRunId.set(context.runId, state);
  }

  private noteProgress(context: OpenCodeTraceContext): void {
    const state = this.findRunState(context);
    if (!state) return;
    state.lastProgressAt = Date.now();
    if (!state.paused) this.resetRunTimers(state);
  }

  private pauseRunTimers(context: OpenCodeTraceContext): void {
    for (const state of this.resolveTimerStates(context)) {
      if (state.paused) continue;
      state.paused = true;
      clearTimeout(state.warningTimer);
      clearTimeout(state.criticalTimer);
    }
  }

  private resumeRunTimers(context: OpenCodeTraceContext): void {
    for (const state of this.resolveTimerStates(context)) {
      if (!state.paused) continue;
      state.paused = false;
      state.lastProgressAt = Date.now();
      this.resetRunTimers(state);
    }
  }

  private resetRunTimers(state: ActiveRunState): void {
    clearTimeout(state.warningTimer);
    clearTimeout(state.criticalTimer);
    state.warningTimer = setTimeout(() => {
      this.markAnomaly(state.context, 'foreground_stalled', 'warning', { thresholdMs: FOREGROUND_WARNING_MS });
    }, FOREGROUND_WARNING_MS);
    state.criticalTimer = setTimeout(() => {
      this.markAnomaly(state.context, 'foreground_stalled', 'critical', { thresholdMs: FOREGROUND_CRITICAL_MS });
    }, FOREGROUND_CRITICAL_MS);
  }

  private stopRunTimers(context: OpenCodeTraceContext): void {
    const state = this.findRunState(context);
    if (!state) return;
    clearTimeout(state.warningTimer);
    clearTimeout(state.criticalTimer);
    if (state.deepTimer) clearTimeout(state.deepTimer);
    if (state.context.runId) this.activeRunsByRunId.delete(state.context.runId);
  }

  private findRunState(context: OpenCodeTraceContext): ActiveRunState | undefined {
    return context.runId ? this.activeRunsByRunId.get(context.runId) : undefined;
  }

  private findSessionStates(sessionId: string): ActiveRunState[] {
    return [...this.activeRunsByRunId.values()]
      .filter((state) => state.context.sessionId === sessionId);
  }

  private findLatestSessionState(sessionId: string): ActiveRunState | undefined {
    return this.findSessionStates(sessionId)
      .sort((left, right) => right.lastProgressAt - left.lastProgressAt)[0];
  }

  private resolveTimerStates(context: OpenCodeTraceContext): ActiveRunState[] {
    const exact = this.findRunState(context);
    if (exact) return [exact];
    return context.sessionId ? this.findSessionStates(context.sessionId) : [];
  }

  private pruneArmedCaptures(): void {
    const now = Date.now();
    for (const [tabId, armed] of this.armedByTab) {
      if (armed.token.expiresAt <= now) this.armedByTab.delete(tabId);
    }
    for (const [tabId, token] of this.claimedByTab) {
      if (token.expiresAt <= now) this.claimedByTab.delete(tabId);
    }
  }

  private inferSessionId(args: unknown[]): string | undefined {
    for (const arg of args) {
      if (!arg || typeof arg !== 'object') continue;
      const record = arg as Record<string, unknown>;
      const value = record.sessionID ?? record.sessionId ?? record.id;
      if (typeof value === 'string' && value.startsWith('ses_')) return value;
    }
    return undefined;
  }

  private extractChildSessionId(payload: unknown, parentSessionId: string): string | undefined {
    if (!payload || typeof payload !== 'object') return undefined;
    try {
      const record = payload as Record<string, unknown>;
      const properties = record.properties && typeof record.properties === 'object'
        ? record.properties as Record<string, unknown>
        : record;
      const candidate = this.firstString(
        properties.childSessionID,
        properties.childSessionId,
        properties.childID,
        properties.childId,
        properties.taskSessionID,
        properties.taskSessionId,
      );
      return candidate && candidate !== parentSessionId ? candidate : undefined;
    } catch {
      return undefined;
    }
  }

  private stableTraceId(sessionId: string): string {
    return `trace-${createHash('sha256').update(sessionId).digest('hex').slice(0, 32)}`;
  }

  private childTreeKey(context: OpenCodeTraceContext): string {
    return context.runId ?? `trace:${context.traceId}`;
  }

  private summarize(value: unknown): unknown {
    if (Array.isArray(value)) return { type: 'array', length: value.length };
    if (value && typeof value === 'object') return { type: 'object', keys: Object.keys(value).slice(0, 20) };
    if (typeof value === 'string') return { type: 'string', length: value.length };
    return value;
  }

  private async recordCredentialIdentity(): Promise<void> {
    const secrets = (this.options.knownSecrets?.() ?? []).filter((secret) => secret.length > 0);
    if (secrets.length === 0) return;
    const salt = await this.store.getOrCreateLocalSalt();
    const fingerprints = secrets.map((secret) =>
      createHmac('sha256', salt).update(secret).digest('hex').slice(0, 16));
    this.emit(
      this.context(this.runtimeSegmentId),
      'lifecycle',
      'plugin',
      'info',
      'credential.identity',
      { fingerprints },
    );
  }
}
