/**
 * SettingsCodexReadbackControls — diagnostic readback buttons for the Codex backend settings panel.
 *
 * Each readback is a button-triggered dump sourced from either the CLI
 * (`codex debug models`) or the local Codex app-server
 * (`model/list`, `permissionProfile/list`, `mcpServerStatus/list`).
 *
 * The four account/capability surfaces (`account/read`, `account/usage/read`,
 * `account/rateLimits/read`, `modelProvider/capabilities/read`) were elevated
 * to product-grade cards and now live in `SettingsCodexAccountSurface`.
 */

import { Modal, Notice, Setting } from 'obsidian';

import type {
  AppServerHookGroup,
  AppServerHookMetadata,
  AppServerHooksReadbackResult,
} from '../../core/agents/backend/CodexAppServerClientTypes';
import type { AgentBackendKind } from '../../core/types/chat';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { BackendSessionBrowserModal } from '../chat/ui/BackendSessionBrowserModal';
import { CodexMcpServerDetailModal, createCodexMcpServerDetailHost } from './CodexMcpServerDetailModal';
import { CodexReadbackModal } from './CodexReadbackModal';

type CodexHooksReadbackAdapter = {
  getHooksReadback?: () => Promise<AppServerHooksReadbackResult>;
};

export interface SettingsCodexHooksReadbackModalOptions {
  app: OpenCodianPlugin['app'];
  adapter: CodexHooksReadbackAdapter | null;
}

const hookStatuses = ['available', 'empty', 'unavailable', 'failed', 'malformed'] as const;
type HookReadbackStatus = typeof hookStatuses[number];

function isHookReadbackStatus(value: unknown): value is HookReadbackStatus {
  return typeof value === 'string' && hookStatuses.includes(value as HookReadbackStatus);
}

function hookValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return t('settings.codex.hooks.unknown');
  if (typeof value === 'boolean') {
    return value ? t('settings.codex.hooks.booleanEnabled') : t('settings.codex.hooks.booleanDisabled');
  }
  return String(value);
}

/** Structured, read-only hooks/list inspection. No write actions or raw JSON are exposed. */
export class SettingsCodexHooksReadbackModal extends Modal {
  private readonly options: SettingsCodexHooksReadbackModalOptions;
  private statusEl: HTMLElement | null = null;
  private contentAreaEl: HTMLElement | null = null;

  constructor(options: SettingsCodexHooksReadbackModalOptions) {
    super(options.app);
    this.options = options;
  }

  onOpen(): void {
    this.titleEl.setText(t('settings.codex.hooks.modalTitle'));
    this.titleEl.id = 'opencodian-codex-hooks-readback-title';
    this.modalEl.addClass('opencodian-codex-readback-modal');
    this.modalEl.setAttribute('role', 'dialog');
    this.modalEl.setAttribute('aria-labelledby', this.titleEl.id);
    this.contentEl.empty();
    const shellEl = this.contentEl.createDiv({ cls: 'opencodian-modal-shell opencodian-inspection-panel' });
    shellEl.createEl('p', {
      cls: 'opencodian-codex-readback-intro opencodian-inspection-summary-intro',
      text: t('settings.codex.hooks.intro'),
    });
    this.statusEl = shellEl.createEl('span', {
      cls: 'opencodian-codex-readback-status-value opencodian-inspection-badge',
      text: t('settings.codex.hooks.statusLoading'),
      attr: {
        'data-hooks-readback-status': 'loading',
        role: 'status',
        'aria-live': 'polite',
        'aria-busy': 'true',
      },
    });
    shellEl.createEl('p', {
      cls: 'opencodian-codex-readback-note opencodian-codex-readback-note--readonly',
      text: t('settings.codex.hooks.readonlyNote'),
    });
    this.contentAreaEl = shellEl.createDiv({ cls: 'opencodian-codex-readback-content opencodian-inspection-content' });
    void this.load();
  }

  private async load(): Promise<void> {
    if (typeof this.options.adapter?.getHooksReadback !== 'function') {
      this.renderState('unavailable');
      return;
    }
    try {
      const result = await this.options.adapter.getHooksReadback();
      this.renderResult(result);
    } catch {
      this.renderState('failed');
    }
  }

  private renderResult(result: AppServerHooksReadbackResult | null | undefined): void {
    if (!result || !isHookReadbackStatus(result.status) || !Array.isArray(result.groups)) {
      this.renderState('malformed');
      return;
    }
    this.renderState(result.status, result.groups);
  }

  private renderState(status: HookReadbackStatus, groups: AppServerHookGroup[] = []): void {
    if (!this.statusEl || !this.contentAreaEl) return;
    this.statusEl.setAttribute('data-hooks-readback-status', status);
    this.statusEl.setAttribute('aria-busy', 'false');
    this.statusEl.setText(t(`settings.codex.hooks.status${status[0].toUpperCase()}${status.slice(1)}` as 'settings.codex.hooks.statusAvailable'));
    this.contentAreaEl.empty();
    if (status === 'available') {
      groups.forEach((group) => this.renderGroup(group));
      return;
    }
    this.contentAreaEl.createEl('p', {
      cls: 'opencodian-codex-readback-state-message opencodian-inspection-state',
      text: t(`settings.codex.hooks.message${status[0].toUpperCase()}${status.slice(1)}` as 'settings.codex.hooks.messageAvailable'),
    });
  }

  private renderGroup(group: AppServerHookGroup): void {
    const groupEl = this.contentAreaEl!.createDiv({ cls: 'opencodian-codex-hooks-group', attr: { 'data-codex-hooks-group': 'true' } });
    const cwdEl = groupEl.createEl('p', {
      cls: 'opencodian-codex-hooks-group-cwd',
      text: `${t('settings.codex.hooks.cwd')}: ${group.cwd}`,
      attr: { 'data-hooks-group-cwd': group.cwd, title: group.cwd },
    });
    cwdEl.setAttribute('aria-label', `${t('settings.codex.hooks.cwd')}: ${group.cwd}`);
    group.warnings.forEach((warning) => groupEl.createEl('p', {
      cls: 'opencodian-codex-hooks-diagnostic opencodian-codex-hooks-warning',
      text: `${t('settings.codex.hooks.warning')}: ${warning}`,
      attr: { 'data-hooks-warning': 'true' },
    }));
    group.errors.forEach((error) => groupEl.createEl('p', {
      cls: 'opencodian-codex-hooks-diagnostic opencodian-codex-hooks-error',
      text: `${t('settings.codex.hooks.error')}: ${error.path} — ${error.message}`,
      attr: { 'data-hooks-error': 'true' },
    }));
    group.hooks.forEach((hook) => this.renderHook(groupEl, hook));
  }

  private renderHook(groupEl: HTMLElement, hook: AppServerHookMetadata): void {
    const rowEl = groupEl.createDiv({ cls: 'opencodian-codex-hooks-entry', attr: { 'data-codex-hook-entry': 'true' } });
    const fields: Array<[keyof AppServerHookMetadata, string, unknown]> = [
      ['key', t('settings.codex.hooks.fieldKey'), hook.key],
      ['eventName', t('settings.codex.hooks.fieldEvent'), hook.eventName],
      ['handlerType', t('settings.codex.hooks.fieldHandler'), hook.handlerType],
      ['matcher', t('settings.codex.hooks.fieldMatcher'), hook.matcher],
      ['command', t('settings.codex.hooks.fieldCommand'), hook.command],
      ['timeoutSec', t('settings.codex.hooks.fieldTimeout'), hook.timeoutSec],
      ['statusMessage', t('settings.codex.hooks.fieldStatus'), hook.statusMessage],
      ['sourcePath', t('settings.codex.hooks.fieldSourcePath'), hook.sourcePath],
      ['source', t('settings.codex.hooks.fieldSource'), hook.source],
      ['pluginId', t('settings.codex.hooks.fieldPlugin'), hook.pluginId],
      ['displayOrder', t('settings.codex.hooks.fieldDisplayOrder'), hook.displayOrder],
      ['enabled', t('settings.codex.hooks.fieldEnabled'), hook.enabled],
      ['isManaged', t('settings.codex.hooks.fieldManaged'), hook.isManaged],
      ['currentHash', t('settings.codex.hooks.fieldHash'), hook.currentHash],
      ['trustStatus', t('settings.codex.hooks.fieldTrust'), hook.trustStatus],
    ];
    fields.forEach(([field, label, value]) => {
      const text = hookValue(value);
      rowEl.createEl('p', {
        cls: 'opencodian-codex-hooks-field',
        text: `${label}: ${text}`,
        attr: { 'data-hook-field': field, title: text },
      });
    });
  }
}

export interface SettingsCodexReadbackControlsOptions {
  plugin: OpenCodianPlugin;
}

export class SettingsCodexReadbackControls {
  private readonly plugin: OpenCodianPlugin;

  constructor(options: SettingsCodexReadbackControlsOptions) {
    this.plugin = options.plugin;
  }

  renderBackendSessionBrowserInfo(containerEl: HTMLElement): void {
    const infoEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice opencodian-settings-codex-readback',
      attr: { 'data-codex-session-browser-info': 'true' },
    });
    infoEl.createSpan({ text: t('settings.codex.sessionBrowser.info') });

    new Setting(containerEl)
      .setName(t('settings.codex.sessionBrowser.launchName'))
      .setDesc(t('settings.codex.sessionBrowser.launchDesc'))
      .addButton((button) => {
        button
          .setButtonText(t('settings.codex.sessionBrowser.launchButton'))
          .onClick(() => {
            const host = {
              getAgentServiceRegistry: () => this.plugin.agentServiceRegistry ?? null,
              createConversationFromBackendSession: async (
                sessionId: string,
                title: string,
                initialMessages?: Array<{ id: string; role: 'user' | 'assistant'; content: string; timestamp: number }>,
                backend?: string,
              ) => this.plugin.createConversationFromBackendSession(sessionId, title, initialMessages, backend as AgentBackendKind),
              loadConversation: async (conversationId: string) => this.plugin.loadBackendSessionConversation(conversationId),
              getActiveBackendKind: () => this.plugin.settings.activeBackend ?? null,
              showNotice: (msg: string) => { new Notice(msg); },
              isStreaming: () => false,
              supportsResume: () => true,
              forcedBackendKind: 'codex' as const,
            };
            new BackendSessionBrowserModal(this.plugin.app, host).open();
          });
      });

    const inMemoryEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice opencodian-settings-codex-readback',
      attr: { 'data-codex-session-browser-in-memory': 'true' },
    });
    inMemoryEl.createSpan({ text: t('settings.codex.sessionBrowser.inMemoryNotice') });
  }

  renderModelListReadbackControls(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.codex.modelList.name'))
      .setDesc(t('settings.codex.modelList.desc'))
      .addButton((button) => {
        button
          .setButtonText(t('settings.codex.modelList.inspectButton'))
          .onClick(() => {
            this.openModelListReadbackModal();
          });
      });
  }

  private openModelListReadbackModal(): void {
    const adapter = this.plugin.agentServiceRegistry?.get('codex') as {
      getModelList?: () => Promise<unknown[] | null>;
    } | null;

    new CodexReadbackModal<unknown>({
      app: this.plugin.app,
      title: t('settings.codex.modelList.modalTitle'),
      intro: t('settings.codex.modelList.intro'),
      readonlyNote: t('settings.codex.modelList.readonlyNote'),
      refreshNote: t('settings.codex.modelList.refreshNote'),
      loadingText: t('settings.codex.modelList.loading'),
      unavailableText: t('settings.codex.modelList.unavailable'),
      failedText: t('settings.codex.modelList.failed'),
      emptyText: t('settings.codex.modelList.empty'),
      fetchItems: async (): Promise<unknown[] | null> => {
        if (typeof adapter?.getModelList !== 'function') {
          return null;
        }
        try {
          return await adapter.getModelList();
        } catch {
          throw new Error('fetch failed');
        }
      },
      renderItems: (listEl: HTMLElement, models: unknown[]): void => {
        for (const model of models) {
          const entry = model as Record<string, unknown>;
          const slug = String(entry.slug ?? 'unknown');
          const displayName = String(entry.display_name ?? slug);
          const description = entry.description as string | null | undefined;

          const rowEl = listEl.createDiv({
            cls: 'opencodian-codex-readback-row opencodian-inspection-row opencodian-codex-model-list-entry',
            attr: {
              'data-model-slug': slug,
              'data-model-visibility': String(entry.visibility ?? ''),
              'data-proof-state': 'readback',
            },
          });

          const mainEl = rowEl.createDiv({ cls: 'opencodian-inspection-row-main' });
          mainEl.createEl('p', {
            cls: 'opencodian-codex-readback-row-name opencodian-inspection-row-title opencodian-codex-model-list-entry-name',
            text: displayName,
          });
          if (description) {
            mainEl.createEl('p', {
              cls: 'opencodian-inspection-row-subtitle opencodian-codex-model-list-entry-desc',
              text: description,
            });
          }
          mainEl.createEl('p', {
            cls: 'opencodian-codex-readback-row-meta opencodian-inspection-row-meta opencodian-codex-model-list-entry-slug',
            text: slug,
          });

          const sideEl = rowEl.createDiv({ cls: 'opencodian-inspection-row-side' });
          const badges: string[] = [];
          if (entry.visibility) badges.push(String(entry.visibility));
          if (entry.default_reasoning_level) badges.push(String(entry.default_reasoning_level));
          if (entry.supported_in_api === true) badges.push('API');
          for (const badge of badges) {
            sideEl.createEl('span', {
              cls: 'opencodian-inspection-badge',
              text: badge,
            });
          }
        }
      },
    }).open();
  }

  renderPermissionProfilesReadbackControls(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.codex.permissionProfiles.name'))
      .setDesc(t('settings.codex.permissionProfiles.desc'))
      .addButton((button) => {
        button
          .setButtonText(t('settings.codex.permissionProfiles.inspectButton'))
          .onClick(() => {
            this.openPermissionProfilesReadbackModal();
          });
      });
  }

  private openPermissionProfilesReadbackModal(): void {
    const adapter = this.plugin.agentServiceRegistry?.get('codex') as {
      getPermissionProfiles?: () => Promise<unknown[] | null>;
    } | null;

    new CodexReadbackModal<unknown>({
      app: this.plugin.app,
      title: t('settings.codex.permissionProfiles.modalTitle'),
      intro: t('settings.codex.permissionProfiles.intro'),
      readonlyNote: t('settings.codex.permissionProfiles.readonlyNote'),
      refreshNote: t('settings.codex.permissionProfiles.refreshNote'),
      loadingText: t('settings.codex.permissionProfiles.loading'),
      unavailableText: t('settings.codex.permissionProfiles.unavailable'),
      failedText: t('settings.codex.permissionProfiles.failed'),
      emptyText: t('settings.codex.permissionProfiles.empty'),
      fetchItems: async (): Promise<unknown[] | null> => {
        if (typeof adapter?.getPermissionProfiles !== 'function') {
          return null;
        }
        try {
          return await adapter.getPermissionProfiles();
        } catch {
          throw new Error('fetch failed');
        }
      },
      renderItems: (listEl: HTMLElement, profiles: unknown[]): void => {
        for (const profile of profiles) {
          const entry = profile as Record<string, unknown>;
          const id = String(entry.id ?? 'unknown');
          const description = entry.description as string | null | undefined;

          const rowEl = listEl.createDiv({
            cls: 'opencodian-codex-readback-row opencodian-inspection-row opencodian-codex-permission-profile-entry',
            attr: {
              'data-profile-id': id,
              'data-proof-state': 'readback',
            },
          });

          const mainEl = rowEl.createDiv({ cls: 'opencodian-inspection-row-main' });
          mainEl.createEl('p', {
            cls: 'opencodian-codex-readback-row-name opencodian-inspection-row-title opencodian-codex-permission-profile-entry-id',
            text: id,
          });
          if (description) {
            mainEl.createEl('p', {
              cls: 'opencodian-inspection-row-subtitle opencodian-codex-permission-profile-entry-desc',
              text: description,
            });
          }

          const sideEl = rowEl.createDiv({ cls: 'opencodian-inspection-row-side' });
          sideEl.createEl('span', {
            cls: 'opencodian-inspection-badge',
            text: t('settings.codex.permissionProfiles.profileBadge'),
          });
        }
      },
    }).open();
  }

  renderMcpServerStatusReadbackControls(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.codex.mcpServers.name'))
      .setDesc(t('settings.codex.mcpServers.desc'))
      .addButton((button) => {
        button
          .setButtonText(t('settings.codex.mcpServers.inspectButton'))
          .onClick(() => {
            this.openMcpServerDetailModal();
          });
      })
      .addButton((button) => {
        button
          .setButtonText(t('settings.codex.mcpServers.reloadButton'))
          .onClick(async () => {
            await this.reloadCodexMcpServers();
          });
      });
  }

  private openMcpServerDetailModal(): void {
    const adapter = this.plugin.agentServiceRegistry?.get('codex') as {
      getMcpServerStatus?: () => Promise<unknown[] | null>;
      reloadMcpServers?: () => Promise<boolean>;
      triggerMcpServerOAuth?: (name: string, options?: { scopes?: string[]; timeoutSecs?: number; onAuthorizationUrl?: (url: string) => void }) => Promise<import('../../core/agents/backend/CodexAppServerClient').McpOauthLoginResult | null>;
      readMcpServerResource?: (server: string, uri: string) => Promise<unknown>;
    } | null;
    if (!adapter) {
      new Notice(t('settings.codex.mcpServers.unavailable'));
      return;
    }
    new CodexMcpServerDetailModal(this.plugin.app, createCodexMcpServerDetailHost(adapter)).open();
  }

  private async reloadCodexMcpServers(): Promise<void> {
    const adapter = this.plugin.agentServiceRegistry?.get('codex') as {
      reloadMcpServers?: () => Promise<boolean>;
    } | null;
    if (typeof adapter?.reloadMcpServers !== 'function') {
      new Notice(t('settings.codex.mcpServers.unavailable'));
      return;
    }

    let ok: boolean;
    try {
      ok = await adapter.reloadMcpServers();
    } catch {
      ok = false;
    }

    new Notice(ok
      ? t('settings.codex.mcpServers.reloadSucceeded')
      : t('settings.codex.mcpServers.reloadFailed'));
  }

  renderLoadedThreadsReadbackControls(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.codex.loadedThreads.name'))
      .setDesc(t('settings.codex.loadedThreads.desc'))
      .addButton((button) => {
        button
          .setButtonText(t('settings.codex.loadedThreads.inspectButton'))
          .onClick(() => {
            this.openLoadedThreadsReadbackModal();
          });
      });
  }

  renderHooksReadbackControls(containerEl: HTMLElement): void {
    const cardEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice opencodian-settings-codex-readback',
      attr: { 'data-codex-hooks-readback': 'true' },
    });
    cardEl.createEl('p', {
      cls: 'opencodian-codex-hooks-readback-title',
      text: t('settings.codex.hooks.name'),
    });
    cardEl.createEl('p', {
      cls: 'opencodian-codex-hooks-readback-desc',
      text: t('settings.codex.hooks.desc'),
    });
    const label = t('settings.codex.hooks.inspectButton');
    const buttonEl = cardEl.createEl('button', {
      cls: 'opencodian-codex-hooks-readback-button',
      text: label,
      attr: { type: 'button', 'aria-label': label, title: label, 'data-codex-hooks-readback-button': 'true' },
    });
    buttonEl.addEventListener('click', () => this.openHooksReadbackModal());
  }

  private openHooksReadbackModal(): void {
    const adapter = this.plugin.agentServiceRegistry?.get('codex') as CodexHooksReadbackAdapter | null;
    new SettingsCodexHooksReadbackModal({ app: this.plugin.app, adapter }).open();
  }

  private openLoadedThreadsReadbackModal(): void {
    const adapter = this.plugin.agentServiceRegistry?.get('codex') as {
      listLoadedThreads?: () => Promise<Array<{ id: string }>>;
    } | null;

    new CodexReadbackModal<{ id: string }>({
      app: this.plugin.app,
      title: t('settings.codex.loadedThreads.modalTitle'),
      intro: t('settings.codex.loadedThreads.intro'),
      readonlyNote: t('settings.codex.loadedThreads.readonlyNote'),
      refreshNote: t('settings.codex.loadedThreads.refreshNote'),
      loadingText: t('settings.codex.loadedThreads.loading'),
      unavailableText: t('settings.codex.loadedThreads.unavailable'),
      failedText: t('settings.codex.loadedThreads.failed'),
      emptyText: t('settings.codex.loadedThreads.empty'),
      fetchItems: async (): Promise<Array<{ id: string }> | null> => {
        if (typeof adapter?.listLoadedThreads !== 'function') {
          return null;
        }
        try {
          return await adapter.listLoadedThreads();
        } catch {
          throw new Error('fetch failed');
        }
      },
      renderItems: (listEl: HTMLElement, threads: Array<{ id: string }>): void => {
        for (const thread of threads) {
          const rowEl = listEl.createDiv({
            cls: 'opencodian-codex-readback-row opencodian-inspection-row opencodian-codex-loaded-thread-entry',
            attr: { 'data-thread-id': thread.id },
          });

          const mainEl = rowEl.createDiv({ cls: 'opencodian-inspection-row-main' });
          mainEl.createEl('p', {
            cls: 'opencodian-codex-readback-row-name opencodian-inspection-row-title opencodian-codex-loaded-thread-entry-id',
            text: thread.id,
          });

          const sideEl = rowEl.createDiv({ cls: 'opencodian-inspection-row-side' });
          const toggleEl = sideEl.createEl('button', {
            cls: 'opencodian-inspection-detail-toggle',
            text: t('settings.codex.loadedThreads.showRaw'),
          });

          const detailEl = rowEl.createDiv({ cls: 'opencodian-inspection-detail is-hidden' });
          detailEl.createEl('pre', {
            cls: 'opencodian-codex-readback-code opencodian-inspection-code',
            text: JSON.stringify(thread, null, 2),
          });

          toggleEl.addEventListener('click', () => {
            const visible = !detailEl.hasClass('is-hidden');
            detailEl.toggleClass('is-hidden', visible);
            toggleEl.textContent = visible
              ? t('settings.codex.loadedThreads.showRaw')
              : t('settings.codex.loadedThreads.hideRaw');
          });
        }
      },
    }).open();
  }
}
