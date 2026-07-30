// Compatibility re-exports. Implementation lives in src/shared/diagnostics/TraceRedactor.ts.
export type {
  TraceRedactionResult as OpenCodeRedactionResult,
  TraceRedactionStats as OpenCodeRedactionStats,
  TraceRedactorOptions as OpenCodeTraceRedactorOptions,
} from '../../../shared/diagnostics/TraceRedactor';
export {
  TraceRedactor as OpenCodeTraceRedactor,
  resolveDefaultTraceDirectory,
} from '../../../shared/diagnostics/TraceRedactor';
