import type {
  ClaudeSessionTraceService,
  ClaudeSessionTraceSettings,
  CodexSessionTraceService,
  CodexSessionTraceSettings,
} from '../../../core/agents/backend/diagnostics';
import type {
  OpenCodeSessionTraceService,
  OpenCodeSessionTraceSettings,
  OpenCodeTraceStoreStatus,
  OpenCodeTraceSummary,
} from '../../../core/opencode/diagnostics';
import type { t } from '../../../i18n';
import type { ClaudeCodeDebugChannelId, DebugModuleKey } from '../../../shared/debugModules';
import type { TraceStoreStatus, TraceSummary } from '../../../shared/diagnostics';

export interface DebugModuleGroupConfig {
  moduleKeys: readonly DebugModuleKey[];
  titleKey: Parameters<typeof t>[0];
  descriptionKey: Parameters<typeof t>[0];
  includeIntro: boolean;
}

export interface OpenCodeDebugSettingsPort {
  backendSettings: {
    opencode?: {
      sessionTrace: OpenCodeSessionTraceSettings;
    };
  };
}

export interface OpenCodeTraceDiagnosticsPort {
  getStatus: () => OpenCodeTraceStoreStatus;
  listSummaries: (limit?: number) => OpenCodeTraceSummary[];
  buildSmartReport: (
    traceId?: string,
    userContext?: { actual?: string; expected?: string; reproduction?: string },
  ) => Promise<string>;
  flush: () => Promise<void>;
  exportTraceBundle: (traceId: string, targetDirectory: string) => Promise<string>;
  clear: () => Promise<void>;
  deleteTrace: (traceId: string) => Promise<void>;
}

/** Adapts the app-owned trace service at a settings composition boundary. */
export function createOpenCodeTraceDiagnosticsPort(
  service: OpenCodeSessionTraceService | undefined,
): OpenCodeTraceDiagnosticsPort | undefined {
  if (!service) return undefined;
  return {
    getStatus: () => service.store.getStatus(),
    listSummaries: (limit) => service.store.listSummaries(limit),
    buildSmartReport: (traceId, userContext) => service.reportBuilder.buildSmartReport(traceId, userContext),
    flush: () => service.store.flush(),
    exportTraceBundle: (traceId, targetDirectory) => service.store.exportTraceBundle(traceId, targetDirectory),
    clear: () => service.store.clear(),
    deleteTrace: (traceId) => service.store.deleteTrace(traceId),
  };
}

export interface OpenCodeDebugPanelOptions {
  settings: OpenCodeDebugSettingsPort;
  getDiagnostics: () => OpenCodeTraceDiagnosticsPort | undefined;
  saveSettings: () => Promise<void>;
  pickDirectory: (defaultPath?: string) => Promise<string | null>;
  addActionButton: (
    containerEl: HTMLElement,
    label: string,
    onClick: () => void | Promise<void>,
    cta?: boolean,
  ) => HTMLButtonElement;
  renderDebugModules: (containerEl: HTMLElement, config: DebugModuleGroupConfig) => void;
}

export interface CodexDebugSettingsPort {
  backendSettings: {
    codex?: {
      sessionTrace?: CodexSessionTraceSettings;
    };
  };
}

export interface CodexTraceDiagnosticsPort {
  getStatus: () => TraceStoreStatus;
  listSummaries: (limit?: number) => TraceSummary[];
  buildSmartReport: (
    traceId?: string,
    userContext?: { actual?: string; expected?: string; reproduction?: string },
  ) => Promise<string>;
  flush: () => Promise<void>;
  exportTraceBundle: (traceId: string, targetDirectory: string) => Promise<string>;
  clear: () => Promise<void>;
  deleteTrace: (traceId: string) => Promise<void>;
}

/** Adapts the app-owned Codex trace service at a settings composition boundary. */
export function createCodexTraceDiagnosticsPort(
  service: CodexSessionTraceService | undefined,
): CodexTraceDiagnosticsPort | undefined {
  if (!service) return undefined;
  return {
    getStatus: () => service.store.getStatus(),
    listSummaries: (limit) => service.store.listSummaries(limit),
    buildSmartReport: (traceId, userContext) => service.reportBuilder.buildSmartReport(traceId, userContext),
    flush: () => service.store.flush(),
    exportTraceBundle: (traceId, targetDirectory) => service.store.exportTraceBundle(traceId, targetDirectory),
    clear: () => service.store.clear(),
    deleteTrace: (traceId) => service.store.deleteTrace(traceId),
  };
}

export interface CodexDebugPanelOptions {
  settings: CodexDebugSettingsPort;
  getDiagnostics: () => CodexTraceDiagnosticsPort | undefined;
  saveSettings: () => Promise<void>;
  pickDirectory: (defaultPath?: string) => Promise<string | null>;
  addActionButton: (
    containerEl: HTMLElement,
    label: string,
    onClick: () => void | Promise<void>,
    cta?: boolean,
  ) => HTMLButtonElement;
}

export interface ClaudeCodeDebugSettingsPort {
  activeBackend?: string;
  enableDebugLogging: boolean;
  debugModuleSettings: {
    claudeCode?: boolean;
  };
  backendSettings: {
    claudeCode: {
      debugChannels: Partial<Record<ClaudeCodeDebugChannelId, boolean>>;
      sessionTrace?: ClaudeSessionTraceSettings;
    };
  };
}

export interface ClaudeTraceDiagnosticsPort {
  getStorageStatus: () => TraceStoreStatus;
  listRecentTraces: (limit?: number) => TraceSummary[];
  buildSmartReport: (traceId?: string) => Promise<string>;
  exportTrace: (traceId: string, targetDirectory: string) => Promise<string | undefined>;
  clearAll: () => Promise<void>;
  deleteTrace: (traceId: string) => Promise<void>;
}

/** Adapts the app-owned Claude trace service at a settings composition boundary. */
export function createClaudeTraceDiagnosticsPort(
  service: ClaudeSessionTraceService | undefined,
): ClaudeTraceDiagnosticsPort | undefined {
  if (!service) return undefined;
  return {
    getStorageStatus: () => service.getStorageStatus(),
    listRecentTraces: (limit) => service.listRecentTraces(limit),
    buildSmartReport: (traceId) => service.buildSmartReport(traceId),
    exportTrace: (traceId, targetDirectory) => service.exportTrace(traceId, targetDirectory),
    clearAll: () => service.clearAll(),
    deleteTrace: (traceId) => service.store.deleteTrace(traceId),
  };
}

export interface ClaudeCodeDebugPanelOptions {
  settings: ClaudeCodeDebugSettingsPort;
  getDiagnostics: () => ClaudeTraceDiagnosticsPort | undefined;
  saveSettings: () => Promise<void>;
  pickDirectory: (defaultPath?: string) => Promise<string | null>;
  getValidatedExportDirectory: () => string | null;
  addActionButton: (
    containerEl: HTMLElement,
    label: string,
    onClick: () => void | Promise<void>,
    cta?: boolean,
  ) => HTMLButtonElement;
  renderDebugModules: (containerEl: HTMLElement, config: DebugModuleGroupConfig) => void;
  getVisibleLogEntryCount: () => number;
  getVisibleLogText: () => string;
  buildDiagnosticReport: () => string;
  clearVisibleLogs: () => void;
  reportVisibleLogCopyFailure: (error: unknown) => void;
  reportDiagnosticCopyFailure: (error: unknown) => void;
}
