/**
 * SettingsCodexPluginsSection — Codex plugin browser surface.
 *
 * Renders the `plugins` secondary tab of the Codex settings panel: the
 * `plugin/list` marketplace catalog, the `plugin/installed` list, and
 * install / uninstall / reconcile actions that delegate to the active Codex
 * backend adapter.
 *
 * Honesty rules (mirror SettingsCodexResourcesSection):
 *   - When the Codex backend is not active, the adapter lacks the plugin
 *     methods, or a route returns null, the surface renders an explicit
 *     unavailable state — never a fake empty list.
 *   - Install/uninstall always confirm first, then reconcile, then reload.
 *     `appsNeedingAuth` surfaces a notice; no OAuth flow is implemented here.
 *   - Read-mostly: this surface never writes Codex config files.
 */

import { Notice } from 'obsidian';

import type {
  AppServerMarketplaceLoadErrorInfo,
  AppServerPluginInstallResult,
  AppServerPluginListResult,
  AppServerPluginMarketplaceEntry,
  AppServerPluginReconcileResult,
  AppServerPluginSummary,
} from '../../core/agents/backend/CodexAppServerClientTypes';
import { t, type TranslationKey } from '../../i18n';
import type OpenCodianPlugin from '../../main';

/**
 * Minimal seam for the plugin-management methods `CodexAdapter` exposes.
 * Every method is optional so this surface degrades to the unavailable state
 * when the backend is inactive or the adapter predates the plugin routes.
 */
type CodexPluginsAdapter = {
  listCodexPlugins?: () => Promise<AppServerPluginListResult | null>;
  listInstalledCodexPlugins?: () => Promise<AppServerPluginListResult | null>;
  installCodexPlugin?: (
    pluginName: string,
    options?: { marketplacePath?: string; remoteMarketplaceName?: string },
  ) => Promise<AppServerPluginInstallResult | null>;
  uninstallCodexPlugin?: (pluginId: string) => Promise<boolean>;
  reconcileCodexPlugins?: () => Promise<AppServerPluginReconcileResult | null>;
};

type CodexPluginsGroupKind = 'marketplace' | 'installed';

interface PluginsLoadContext {
  rootEl: HTMLElement;
  statusEl: HTMLElement;
  generation: number;
  adapter: CodexPluginsAdapter;
  reload: () => void;
}

export interface SettingsCodexPluginsSectionOptions {
  plugin: OpenCodianPlugin;
  createSectionHeading: (containerEl: HTMLElement, title: string, tooltip?: string) => HTMLHeadingElement;
  onAfterMutation?: () => void;
}

export class SettingsCodexPluginsSection {
  private readonly mutationInFlight = new Set<string>();
  private loadGeneration = 0;

  constructor(private readonly options: SettingsCodexPluginsSectionOptions) {}

  render(bodyEl: HTMLElement): void {
    const generation = ++this.loadGeneration;
    bodyEl.empty();
    this.options.createSectionHeading(
      bodyEl,
      t('settings.codex.plugins.title'),
      t('settings.codex.plugins.description'),
    );

    const rootEl = bodyEl.createDiv({
      cls: 'opencodian-codex-plugins',
      attr: { 'data-codex-plugins': 'true', 'data-codex-plugins-state': 'loading' },
    });
    const actionsEl = rootEl.createDiv({ cls: 'opencodian-codex-plugins-actions' });
    const reload = () => this.render(bodyEl);

    const refreshButtonEl = actionsEl.createEl('button', {
      cls: 'opencodian-codex-plugins-refresh',
      text: t('settings.codex.plugins.refresh'),
      attr: { type: 'button' },
    });
    refreshButtonEl.addEventListener('click', reload);

    const reconcileTooltip = t('settings.codex.plugins.reconcileTooltip');
    const reconcileButtonEl = actionsEl.createEl('button', {
      cls: 'opencodian-codex-plugins-reconcile',
      text: t('settings.codex.plugins.reconcile'),
      attr: { type: 'button', title: reconcileTooltip, 'aria-label': reconcileTooltip },
    });
    reconcileButtonEl.addEventListener('click', () => void this.reconcileAndReload(bodyEl, reconcileButtonEl));

    const statusEl = rootEl.createDiv({
      cls: 'opencodian-codex-plugins-status',
      attr: { role: 'status', 'aria-live': 'polite' },
    });
    statusEl.setText(t('settings.codex.plugins.loading'));

    const adapter = this.getAdapter();
    if (typeof adapter?.listCodexPlugins !== 'function'
      || typeof adapter?.listInstalledCodexPlugins !== 'function') {
      this.renderUnavailable(rootEl, statusEl);
      return;
    }

    void this.loadAndRender({ rootEl, statusEl, generation, adapter, reload });
  }

  // ─── Loading & grouping ─────────────────────────────────────────

  private async loadAndRender(context: PluginsLoadContext): Promise<void> {
    const { rootEl, statusEl, generation, adapter, reload } = context;
    let marketplaceResult: AppServerPluginListResult | null;
    let installedResult: AppServerPluginListResult | null;
    try {
      [marketplaceResult, installedResult] = await Promise.all([
        adapter.listCodexPlugins!(),
        adapter.listInstalledCodexPlugins!(),
      ]);
    } catch {
      if (generation === this.loadGeneration) {
        this.renderUnavailable(rootEl, statusEl);
      }
      return;
    }
    if (generation !== this.loadGeneration) {
      return;
    }
    // null means the route is unavailable / failed — show the unavailable
    // state instead of pretending the catalog is empty.
    if (marketplaceResult === null || installedResult === null) {
      this.renderUnavailable(rootEl, statusEl);
      return;
    }

    rootEl.setAttribute('data-codex-plugins-state', 'data');
    statusEl.remove();
    const listHostEl = rootEl.createDiv({ cls: 'opencodian-codex-plugins-groups' });
    this.renderGroup({
      listHostEl,
      kind: 'marketplace',
      title: t('settings.codex.plugins.marketplace.title'),
      result: marketplaceResult,
      reload,
    });
    this.renderGroup({
      listHostEl,
      kind: 'installed',
      title: t('settings.codex.plugins.installed.title'),
      result: installedResult,
      reload,
    });
    this.renderMarketplaceErrors(listHostEl, [
      ...marketplaceResult.marketplaceLoadErrors,
      ...installedResult.marketplaceLoadErrors,
    ]);
  }

  private renderUnavailable(rootEl: HTMLElement, statusEl: HTMLElement): void {
    rootEl.setAttribute('data-codex-plugins-state', 'unavailable');
    statusEl.setAttribute('data-codex-plugins-state', 'unavailable');
    statusEl.setText(t('settings.codex.plugins.unavailable'));
  }

  private renderGroup(context: {
    listHostEl: HTMLElement;
    kind: CodexPluginsGroupKind;
    title: string;
    result: AppServerPluginListResult;
    reload: () => void;
  }): void {
    const { listHostEl, kind, title, result, reload } = context;
    const groupEl = listHostEl.createDiv({
      cls: 'opencodian-codex-resource-group opencodian-resource-group-card',
      attr: { 'data-codex-plugins-group': kind },
    });
    groupEl.createEl('h4', { cls: 'opencodian-codex-resource-group-title', text: title });
    const scrollEl = groupEl.createDiv({ cls: 'opencodian-settings-scrollarea opencodian-codex-resource-scroll' });
    const viewportEl = scrollEl.createDiv({ cls: 'opencodian-settings-scrollarea-viewport' });
    const listEl = viewportEl.createDiv({
      cls: 'opencodian-settings-scrollarea-content opencodian-codex-resource-list',
    });

    const entries = result.marketplaces.flatMap((marketplace) =>
      marketplace.plugins.map((plugin) => ({ marketplace, plugin })),
    );
    if (entries.length === 0) {
      listEl.createDiv({ cls: 'opencodian-settings-inline-empty', text: t('settings.codex.plugins.empty') });
      return;
    }
    for (const entry of entries) {
      this.renderPluginRow({ listEl, plugin: entry.plugin, marketplace: entry.marketplace, kind, reload });
    }
  }

  private renderPluginRow(context: {
    listEl: HTMLElement;
    plugin: AppServerPluginSummary;
    marketplace: AppServerPluginMarketplaceEntry | null;
    kind: CodexPluginsGroupKind;
    reload: () => void;
  }): void {
    const { listEl, plugin, marketplace, kind, reload } = context;
    const rowEl = listEl.createDiv({
      cls: 'opencodian-codex-resource-row',
      attr: {
        'data-plugin-id': plugin.id,
        'data-plugin-name': plugin.name,
        'data-plugin-installed': String(plugin.installed),
        'data-plugin-enabled': String(plugin.enabled),
      },
    });
    const headerEl = rowEl.createDiv({ cls: 'opencodian-codex-resource-row-header' });
    headerEl.createSpan({ cls: 'opencodian-codex-resource-row-name', text: plugin.name });
    if (plugin.version) {
      headerEl.createSpan({ cls: 'opencodian-codex-plugin-version', text: `v${plugin.version}` });
    }
    headerEl.createSpan({
      cls: 'opencodian-codex-plugin-policy',
      attr: { 'data-install-policy': plugin.installPolicy },
      text: this.describeInstallPolicy(plugin.installPolicy),
    });

    const metaParts: string[] = [];
    if (plugin.availability) {
      metaParts.push(plugin.availability);
    }
    if (plugin.disabledReason) {
      metaParts.push(plugin.disabledReason);
    }
    if (metaParts.length > 0) {
      rowEl.createDiv({ cls: 'opencodian-codex-resource-row-desc', text: metaParts.join(' · ') });
    }

    const actionsEl = headerEl.createDiv({ cls: 'opencodian-codex-resource-row-actions' });
    if (kind === 'marketplace') {
      if (plugin.installed) {
        actionsEl.createSpan({
          cls: 'opencodian-codex-plugin-installed-badge',
          text: t('settings.codex.plugins.installedBadge'),
        });
      } else if (plugin.installPolicy !== 'NOT_AVAILABLE') {
        const installButton = actionsEl.createEl('button', {
          cls: 'opencodian-codex-plugin-install',
          text: t('settings.codex.plugins.install'),
          attr: { type: 'button' },
        });
        installButton.addEventListener('click', () => {
          void this.installPlugin(plugin, marketplace, installButton, reload);
        });
      }
      return;
    }
    actionsEl.createSpan({
      cls: 'opencodian-codex-plugin-enabled-badge',
      attr: { 'data-enabled': String(plugin.enabled) },
      text: plugin.enabled
        ? t('settings.codex.plugins.enabledBadge')
        : t('settings.codex.plugins.disabledBadge'),
    });
    if (plugin.installed) {
      const uninstallButton = actionsEl.createEl('button', {
        cls: 'opencodian-codex-plugin-uninstall',
        text: t('settings.codex.plugins.uninstall'),
        attr: { type: 'button' },
      });
      uninstallButton.addEventListener('click', () => {
        void this.uninstallPlugin(plugin, uninstallButton, reload);
      });
    }
  }

  private renderMarketplaceErrors(
    listHostEl: HTMLElement,
    errors: AppServerMarketplaceLoadErrorInfo[],
  ): void {
    if (errors.length === 0) {
      return;
    }
    const errorsEl = listHostEl.createDiv({
      cls: 'opencodian-codex-plugins-marketplace-errors',
      attr: { 'data-codex-plugins-marketplace-errors': 'true' },
    });
    for (const error of errors) {
      errorsEl.createDiv({
        cls: 'opencodian-codex-plugins-marketplace-error',
        text: t('settings.codex.plugins.marketplaceError', {
          path: error.marketplacePath,
          message: error.message,
        }),
      });
    }
  }

  // ─── Mutations (confirm → act → reconcile → reload) ─────────────

  private async installPlugin(
    plugin: AppServerPluginSummary,
    marketplace: AppServerPluginMarketplaceEntry | null,
    button: HTMLButtonElement,
    reload: () => void,
  ): Promise<void> {
    const mutationKey = `install:${plugin.name}`;
    if (this.mutationInFlight.has(mutationKey)) {
      return;
    }
    if (!this.confirm('settings.codex.plugins.installConfirm', plugin.name)) {
      return;
    }
    const adapter = this.getAdapter();
    if (typeof adapter?.installCodexPlugin !== 'function') {
      new Notice(t('settings.codex.plugins.installFailed'));
      return;
    }
    this.mutationInFlight.add(mutationKey);
    const defaultLabel = t('settings.codex.plugins.install');
    button.disabled = true;
    button.setText(t('settings.codex.plugins.installing'));
    try {
      const result = await adapter.installCodexPlugin(plugin.name, this.installOptionsFor(marketplace));
      if (result === null) {
        new Notice(t('settings.codex.plugins.installFailed'));
        return;
      }
      const appsNeedingAuth = Array.isArray(result.appsNeedingAuth) ? result.appsNeedingAuth : [];
      if (appsNeedingAuth.length > 0) {
        new Notice(t('settings.codex.plugins.authRequired', {
          name: plugin.name,
          apps: appsNeedingAuth.map((app) => app.name).join(', '),
        }));
      } else {
        new Notice(t('settings.codex.plugins.installSuccess', { name: plugin.name }));
      }
      await adapter.reconcileCodexPlugins?.();
      this.options.onAfterMutation?.();
      reload();
    } catch {
      new Notice(t('settings.codex.plugins.installFailed'));
    } finally {
      this.mutationInFlight.delete(mutationKey);
      button.disabled = false;
      button.setText(defaultLabel);
    }
  }

  private async uninstallPlugin(
    plugin: AppServerPluginSummary,
    button: HTMLButtonElement,
    reload: () => void,
  ): Promise<void> {
    const mutationKey = `uninstall:${plugin.id}`;
    if (this.mutationInFlight.has(mutationKey)) {
      return;
    }
    if (!this.confirm('settings.codex.plugins.uninstallConfirm', plugin.name)) {
      return;
    }
    const adapter = this.getAdapter();
    if (typeof adapter?.uninstallCodexPlugin !== 'function') {
      new Notice(t('settings.codex.plugins.uninstallFailed'));
      return;
    }
    this.mutationInFlight.add(mutationKey);
    const defaultLabel = t('settings.codex.plugins.uninstall');
    button.disabled = true;
    button.setText(t('settings.codex.plugins.uninstalling'));
    try {
      const uninstalled = await adapter.uninstallCodexPlugin(plugin.id);
      if (!uninstalled) {
        new Notice(t('settings.codex.plugins.uninstallFailed'));
        return;
      }
      new Notice(t('settings.codex.plugins.uninstallSuccess', { name: plugin.name }));
      await adapter.reconcileCodexPlugins?.();
      this.options.onAfterMutation?.();
      reload();
    } catch {
      new Notice(t('settings.codex.plugins.uninstallFailed'));
    } finally {
      this.mutationInFlight.delete(mutationKey);
      button.disabled = false;
      button.setText(defaultLabel);
    }
  }

  private async reconcileAndReload(bodyEl: HTMLElement, button: HTMLButtonElement): Promise<void> {
    if (this.mutationInFlight.has('reconcile')) {
      return;
    }
    const adapter = this.getAdapter();
    if (typeof adapter?.reconcileCodexPlugins !== 'function') {
      new Notice(t('settings.codex.plugins.reconcileFailed'));
      return;
    }
    this.mutationInFlight.add('reconcile');
    button.disabled = true;
    try {
      const result = await adapter.reconcileCodexPlugins();
      if (result === null) {
        new Notice(t('settings.codex.plugins.reconcileFailed'));
        return;
      }
      const failed = result.failedRemotePluginIds.length + result.failedMaterializationRemotePluginIds.length;
      new Notice(t('settings.codex.plugins.reconcileDone', {
        changed: String(result.changedPlugins.length),
        failed: String(failed),
      }));
    } catch {
      new Notice(t('settings.codex.plugins.reconcileFailed'));
    } finally {
      this.mutationInFlight.delete('reconcile');
      button.disabled = false;
    }
    this.options.onAfterMutation?.();
    this.render(bodyEl);
  }

  // ─── Helpers ────────────────────────────────────────────────────

  private getAdapter(): CodexPluginsAdapter | null {
    return (this.options.plugin.agentServiceRegistry?.get('codex') as CodexPluginsAdapter | null) ?? null;
  }

  private confirm(key: TranslationKey, name: string): boolean {
    try {
      return typeof window.confirm === 'function' && window.confirm(t(key, { name })) === true;
    } catch {
      return false;
    }
  }

  /**
   * Local repo/directory marketplaces carry a `path`; the default remote
   * catalog does not, so address it by marketplace name instead.
   */
  private installOptionsFor(
    marketplace: AppServerPluginMarketplaceEntry | null,
  ): { marketplacePath?: string; remoteMarketplaceName?: string } | undefined {
    if (!marketplace) {
      return undefined;
    }
    if (marketplace.path) {
      return { marketplacePath: marketplace.path };
    }
    if (marketplace.name) {
      return { remoteMarketplaceName: marketplace.name };
    }
    return undefined;
  }

  private describeInstallPolicy(policy: AppServerPluginSummary['installPolicy']): string {
    if (policy === 'NOT_AVAILABLE') {
      return t('settings.codex.plugins.policyNotAvailable');
    }
    if (policy === 'INSTALLED_BY_DEFAULT') {
      return t('settings.codex.plugins.policyInstalledByDefault');
    }
    return t('settings.codex.plugins.policyAvailable');
  }
}
