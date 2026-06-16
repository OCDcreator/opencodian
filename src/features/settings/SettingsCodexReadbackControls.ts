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

import { Notice, Setting } from 'obsidian';

import type { AgentBackendKind } from '../../core/types/chat';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { BackendSessionBrowserModal } from '../chat/ui/BackendSessionBrowserModal';
import { CodexMcpServerDetailModal, createCodexMcpServerDetailHost } from './CodexMcpServerDetailModal';
import { CodexReadbackModal } from './CodexReadbackModal';

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
