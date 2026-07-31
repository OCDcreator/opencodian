import type {
  OpenCodeSessionTraceService,
  OpenCodeSessionTraceSettings,
  OpenCodeTraceStoreStatus,
  OpenCodeTraceSummary,
} from '../../../core/opencode/diagnostics';
import type { t } from '../../../i18n';
import type { DebugModuleKey } from '../../../shared/debugModules';

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
