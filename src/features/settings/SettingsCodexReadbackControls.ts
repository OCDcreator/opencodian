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
      cls: 'opencodian-settings-inline-notice',
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
      cls: 'opencodian-settings-inline-notice',
      attr: { 'data-codex-session-browser-in-memory': 'true' },
    });
    inMemoryEl.createSpan({ text: t('settings.codex.sessionBrowser.inMemoryNotice') });
  }

  renderModelListReadbackControls(containerEl: HTMLElement): void {
    const outputEl = this.lazyReadbackOutputEl(
      containerEl,
      'opencodian-codex-model-list-readback',
      'data-codex-model-list-readback',
    );

    new Setting(containerEl)
      .setName(t('settings.codex.modelList.name'))
      .setDesc(t('settings.codex.modelList.desc'))
      .addButton((button) => {
        button
          .setButtonText(t('settings.codex.modelList.inspectButton'))
          .onClick(async () => {
            await this.renderModelListReadback(outputEl());
          });
      });
  }

  private async renderModelListReadback(outputEl: HTMLElement): Promise<void> {
    outputEl.empty();
    outputEl.setText(t('settings.codex.modelList.loading'));
    const adapter = this.plugin.agentServiceRegistry?.get('codex') as {
      getModelList?: () => Promise<unknown[] | null>;
    } | null;
    if (typeof adapter?.getModelList !== 'function') {
      outputEl.setText(t('settings.codex.modelList.unavailable'));
      return;
    }

    let models: unknown[] | null;
    try {
      models = await adapter.getModelList();
    } catch {
      outputEl.setText(t('settings.codex.modelList.failed'));
      return;
    }

    if (models === null || !Array.isArray(models) || models.length === 0) {
      outputEl.setText(t('settings.codex.modelList.unavailable'));
      return;
    }

    outputEl.empty();
    outputEl.createEl('p', {
      text: t('settings.codex.modelList.summary'),
    });

    for (const model of models) {
      const entry = model as Record<string, unknown>;
      const name = String(entry.display_name ?? entry.slug ?? 'unknown');
      const desc = entry.description as string | null | undefined;
      const label = desc
        ? t('settings.codex.modelList.modelEntry', { name, description: desc })
        : t('settings.codex.modelList.modelEntryNoDesc', { name });

      const rowEl = outputEl.createDiv({
        cls: 'opencodian-codex-model-list-entry',
        attr: {
          'data-model-slug': String(entry.slug ?? ''),
          'data-model-visibility': String(entry.visibility ?? ''),
          'data-proof-state': 'readback',
        },
      });

      rowEl.createEl('p', {
        cls: 'opencodian-codex-model-list-entry-name',
        text: label,
      });

      const metaParts: string[] = [];
      if (entry.default_reasoning_level) {
        metaParts.push(`reasoning: ${entry.default_reasoning_level}`);
      }
      if (entry.supported_in_api === true) {
        metaParts.push('API: yes');
      }
      if (metaParts.length > 0) {
        rowEl.createEl('p', {
          cls: 'opencodian-codex-model-list-entry-meta',
          text: metaParts.join(' | '),
        });
      }
    }
  }

  renderPermissionProfilesReadbackControls(containerEl: HTMLElement): void {
    const outputEl = this.lazyReadbackOutputEl(
      containerEl,
      'opencodian-codex-permission-profiles-readback',
      'data-codex-permission-profiles-readback',
    );

    new Setting(containerEl)
      .setName(t('settings.codex.permissionProfiles.name'))
      .setDesc(t('settings.codex.permissionProfiles.desc'))
      .addButton((button) => {
        button
          .setButtonText(t('settings.codex.permissionProfiles.inspectButton'))
          .onClick(async () => {
            await this.renderPermissionProfilesReadback(outputEl());
          });
      });
  }

  private async renderPermissionProfilesReadback(outputEl: HTMLElement): Promise<void> {
    outputEl.empty();
    outputEl.setText(t('settings.codex.permissionProfiles.loading'));
    const adapter = this.plugin.agentServiceRegistry?.get('codex') as {
      getPermissionProfiles?: () => Promise<unknown[] | null>;
    } | null;
    if (typeof adapter?.getPermissionProfiles !== 'function') {
      outputEl.setText(t('settings.codex.permissionProfiles.unavailable'));
      return;
    }

    let profiles: unknown[] | null;
    try {
      profiles = await adapter.getPermissionProfiles();
    } catch {
      outputEl.setText(t('settings.codex.permissionProfiles.failed'));
      return;
    }

    if (profiles === null || !Array.isArray(profiles) || profiles.length === 0) {
      outputEl.setText(t('settings.codex.permissionProfiles.unavailable'));
      return;
    }

    outputEl.empty();
    outputEl.createEl('p', {
      text: t('settings.codex.permissionProfiles.summary'),
    });

    for (const profile of profiles) {
      const entry = profile as Record<string, unknown>;
      const id = String(entry.id ?? 'unknown');
      const desc = entry.description as string | null | undefined;
      const label = desc
        ? t('settings.codex.permissionProfiles.profileEntry', { id, description: desc })
        : t('settings.codex.permissionProfiles.profileEntryNoDesc', { id });

      const rowEl = outputEl.createDiv({
        cls: 'opencodian-codex-permission-profile-entry',
        attr: {
          'data-profile-id': id,
          'data-proof-state': 'readback',
        },
      });

      rowEl.createEl('p', {
        cls: 'opencodian-codex-permission-profile-entry-name',
        text: label,
      });
    }
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
    const outputEl = this.lazyReadbackOutputEl(
      containerEl,
      'opencodian-codex-loaded-threads-readback',
      'data-codex-loaded-threads-readback',
    );

    new Setting(containerEl)
      .setName(t('settings.codex.loadedThreads.name'))
      .setDesc(t('settings.codex.loadedThreads.desc'))
      .addButton((button) => {
        button
          .setButtonText(t('settings.codex.loadedThreads.inspectButton'))
          .onClick(async () => {
            const el = outputEl();
            el.empty();
            el.setText(t('settings.codex.loadedThreads.loading'));
            const adapter = this.plugin.agentServiceRegistry?.get('codex') as {
              listLoadedThreads?: () => Promise<Array<{ id: string }>>;
            } | null;
            if (typeof adapter?.listLoadedThreads !== 'function') {
              el.setText(t('settings.codex.loadedThreads.unavailable'));
              return;
            }
            let threads: Array<{ id: string }>;
            try { threads = await adapter.listLoadedThreads(); }
            catch { el.setText(t('settings.codex.loadedThreads.failed')); return; }
            el.empty();
            el.createEl('p', { text: t('settings.codex.loadedThreads.summary', { count: threads.length }) });
            if (threads.length > 0) el.createEl('pre', { text: JSON.stringify(threads, null, 2) });
          });
      });
  }

  private lazyReadbackOutputEl(
    containerEl: HTMLElement,
    cls: string,
    attrName: string,
  ): () => HTMLElement {
    let outputEl: HTMLElement | null = null;
    return (): HTMLElement => {
      outputEl ??= containerEl.createDiv({
        cls: `opencodian-settings-inline-notice ${cls}`,
        attr: {
          [attrName]: 'true',
          'data-proof-state': 'readback',
        },
      });
      return outputEl;
    };
  }
}
