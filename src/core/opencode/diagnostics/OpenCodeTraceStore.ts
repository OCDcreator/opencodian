// Compatibility wrapper. Implementation lives in src/shared/diagnostics/TraceStore.ts.
import { resolveDefaultTraceDirectory, TraceStore } from '../../../shared/diagnostics';
import type { OpenCodeTraceEventV1 } from './types';

export function resolveDefaultOpenCodeTraceDirectory(): string {
  return resolveDefaultTraceDirectory('opencode');
}

export class OpenCodeTraceStore extends TraceStore<OpenCodeTraceEventV1> {
  constructor(customDirectory?: string, fallbackDirectory = resolveDefaultOpenCodeTraceDirectory()) {
    super(customDirectory, fallbackDirectory, { bundlePrefix: 'opencode-trace' });
  }
}
