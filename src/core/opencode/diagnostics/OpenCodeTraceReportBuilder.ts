// Compatibility wrapper. Implementation lives in src/shared/diagnostics/TraceReportBuilder.ts.
import type { TraceRedactor } from '../../../shared/diagnostics';
import { TraceReportBuilder } from '../../../shared/diagnostics';
import type { OpenCodeTraceStore } from './OpenCodeTraceStore';
import type { OpenCodeTraceEventV1 } from './types';

export class OpenCodeTraceReportBuilder extends TraceReportBuilder<OpenCodeTraceEventV1> {
  constructor(store: OpenCodeTraceStore, buildIdentity: () => string, redactor: TraceRedactor) {
    super(store, buildIdentity, redactor, {
      title: 'OpenCodian OpenCode Session Trace',
      extractMetadata: extractOpenCodeTraceMetadata,
    });
  }
}

// Metadata extraction deliberately accepts heterogeneous versioned trace
// payloads and skips unknown shapes without risking report generation.
// eslint-disable-next-line complexity
function extractOpenCodeTraceMetadata(events: OpenCodeTraceEventV1[]): string[] {
  const runStarted = events.filter((event) => event.name === 'run.started');
  const providers = new Set<string>();
  const models = new Set<string>();
  const credentialFingerprints = new Set<string>();
  const connections = new Set<string>();
  let redactedSecrets = 0;
  let normalizedPaths = 0;
  let truncatedValues = 0;
  for (const event of events) {
    redactedSecrets += event.metrics?.redactedSecrets ?? 0;
    normalizedPaths += event.metrics?.normalizedPaths ?? 0;
    truncatedValues += event.metrics?.truncatedValues ?? 0;
    if (event.payload && typeof event.payload === 'object') {
      const payload = event.payload as Record<string, unknown>;
      if (event.name === 'run.started') {
        if (typeof payload.provider === 'string') providers.add(payload.provider);
        if (typeof payload.model === 'string') models.add(payload.model);
      }
      if (event.name === 'credential.identity' && Array.isArray(payload.fingerprints)) {
        for (const value of payload.fingerprints) {
          if (typeof value === 'string') credentialFingerprints.add(value);
        }
      }
      if (event.name === 'runtime.started') {
        const mode = typeof payload.serverMode === 'string' ? payload.serverMode : 'unknown';
        const baseUrl = typeof payload.baseUrl === 'string' ? payload.baseUrl : 'unknown';
        connections.add(`${mode}:${baseUrl}`);
      }
    }
  }
  return [
    `Runtime segments: ${new Set(events.map((event) => event.runtimeSegmentId)).size}`,
    `Runs observed: ${runStarted.length}`,
    `Providers: ${[...providers].join(', ') || '(unknown)'}`,
    `Models: ${[...models].join(', ') || '(unknown)'}`,
    `Connections: ${[...connections].join(', ') || '(unknown)'}`,
    `Credential HMAC fingerprints: ${[...credentialFingerprints].join(', ') || '(none)'}`,
    `Redaction stats: secrets=${redactedSecrets}, paths=${normalizedPaths}, truncated=${truncatedValues}`,
  ];
}
