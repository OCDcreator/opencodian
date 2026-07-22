import type {
  OpenCodeEventListener,
  OpenCodeEventUnsubscribe,
  OpenCodePluginEvidenceObserver,
  PluginEvidenceSnapshot,
} from '../../core/opencode/OpenCodeEventSubscriptionCoordinator';
import { OpenCodeSdkFacade } from '../../core/opencode/OpenCodeSdkFacade';
import type { OpenCodeService } from '../../core/opencode/OpenCodeService';
import type { OpenCodianSettings } from '../../core/types/settings';
import { getServerBaseUrl } from '../../core/types/settings';
import { normalizeContextPath } from '../../shared/contextPath';

export interface SettingsPluginEvidenceCoordinatorOptions {
  openCodeService: OpenCodeService | null | undefined;
  getSettings: () => OpenCodianSettings;
  vaultPath: string | undefined;
}

interface CachedFacade {
  facade: OpenCodeSdkFacade;
  key: string;
}

export class SettingsPluginEvidenceCoordinator {
  private readonly openCodeService: OpenCodeService | null | undefined;
  private readonly getSettings: () => OpenCodianSettings;
  private readonly vaultPath: string | undefined;
  private cachedFacade: CachedFacade | null = null;
  private unsubscribe: OpenCodeEventUnsubscribe | null = null;

  constructor(options: SettingsPluginEvidenceCoordinatorOptions) {
    this.openCodeService = options.openCodeService;
    this.getSettings = options.getSettings;
    this.vaultPath = options.vaultPath;
  }

  subscribe(onEvidence: (snapshot: PluginEvidenceSnapshot) => void): void {
    if (this.unsubscribe || !this.openCodeService) {
      return;
    }

    const observer: OpenCodePluginEvidenceObserver = {
      onPluginEvidence: onEvidence,
      getConnectionSignature: () => this.getFacade().getConnectionSignature(),
      fetchPluginConfig: async () => this.getFacade().config.get(),
    };

    this.unsubscribe = this.openCodeService.subscribeToOpenCodeEvents(
      observer as unknown as OpenCodeEventListener,
    );
  }

  async refresh(): Promise<PluginEvidenceSnapshot | null> {
    if (!this.unsubscribe) {
      return null;
    }
    return (await this.unsubscribe.refreshPluginConfigEvidence?.()) ?? null;
  }

  getSnapshot(): PluginEvidenceSnapshot | null {
    if (!this.unsubscribe) {
      return null;
    }
    return this.unsubscribe.getPluginEvidenceSnapshot?.() ?? null;
  }

  dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.cachedFacade = null;
  }

  private getFacade(): OpenCodeSdkFacade {
    const key = this.buildIdentityKey();
    if (this.cachedFacade?.key === key) {
      return this.cachedFacade.facade;
    }

    const facade = new OpenCodeSdkFacade(() => ({
      baseUrl: getServerBaseUrl(this.getSettings().server),
      authHeaders: this.buildAuthHeaders(),
      directory: this.getScopedDirectoryPath(),
    }));

    this.cachedFacade = { facade, key };
    return facade;
  }

  private buildIdentityKey(): string {
    const settings = this.getSettings();
    const auth = settings.server.auth;
    const authKey = auth.type === 'basic'
      ? `basic:${auth.username}:${auth.password}`
      : auth.type === 'bearer'
        ? `bearer:${auth.token}`
        : 'none';
    return `${getServerBaseUrl(settings.server)}|${authKey}|${this.getScopedDirectoryPath() ?? ''}`;
  }

  private getScopedDirectoryPath(): string | undefined {
    if (!this.vaultPath) {
      return undefined;
    }
    return normalizeContextPath(this.vaultPath);
  }

  private buildAuthHeaders(): Record<string, string> {
    const { auth } = this.getSettings().server;

    if (auth.type === 'basic') {
      const credentials = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
      return {
        Authorization: `Basic ${credentials}`,
      };
    }

    if (auth.type === 'bearer' && auth.token.trim()) {
      return {
        Authorization: `Bearer ${auth.token.trim()}`,
      };
    }

    return {};
  }
}
