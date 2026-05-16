import type { OpencodeLspStatus } from '../../../core/types';
import type { LspStatusSummary } from '../ui/LspStatusIndicator';

type LspStatusCallback = (status: LspStatusSummary) => void;

export class LspStatusRefreshCoordinator {
  private intervalId: number | null = null;
  private focusListener: (() => void) | null = null;
  private isRefreshing = false;

  constructor(
    private readonly getStatus: () => Promise<unknown>,
    private readonly callback: LspStatusCallback,
  ) {}

  start(intervalMs = 30000): void {
    this.stop();
    void this.refresh();
    this.intervalId = window.setInterval(() => {
      void this.refresh();
    }, intervalMs);
    this.focusListener = () => {
      void this.refresh();
    };
    window.addEventListener('focus', this.focusListener);
  }

  async refresh(): Promise<void> {
    if (this.isRefreshing) {
      return;
    }

    this.isRefreshing = true;
    try {
      const status = this.toSummary(await this.getStatus());
      this.callback(status);
    } catch {
      this.callback({ total: 0, connected: 0, errored: 0, servers: [] });
    } finally {
      this.isRefreshing = false;
    }
  }

  stop(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.focusListener) {
      window.removeEventListener('focus', this.focusListener);
      this.focusListener = null;
    }

    this.isRefreshing = false;
  }

  private toSummary(input: unknown): LspStatusSummary {
    const items = Array.isArray(input) ? input : [];
    const servers = items.reduce<LspStatusSummary['servers']>((result, item) => {
      const status = this.normalizeStatusItem(item);
      if (status) {
        result.push(status);
      }
      return result;
    }, []);

    return {
      total: servers.length,
      connected: servers.filter((server) => server.status === 'connected').length,
      errored: servers.filter((server) => server.status === 'error').length,
      servers,
    };
  }

  private normalizeStatusItem(item: unknown): LspStatusSummary['servers'][number] | null {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const status = item as OpencodeLspStatus & { name?: unknown };
    if (typeof status.id !== 'string' || typeof status.status !== 'string') {
      return null;
    }

    return {
      id: status.id,
      name: typeof status.name === 'string' && status.name.trim()
        ? status.name
        : status.id,
      status: status.status,
    };
  }
}
