import { Notice, Setting } from 'obsidian';

import {
  type BackendConfigRecoveryStore,
  backendRecoveryIdentity,
  createBackendConfigRecoveryStore,
  recoveryRevision,
} from '../../../../core/agents/backend/configuration/BackendConfigRecoveryStore';
import type { DshBackendSettings, DshMcpServer } from '../../../../core/types/settings';
import { t, type TranslationKey } from '../../../../i18n';
import { addBackendChoiceSetting } from '../../controls/BackendSettingsControls';
import { type DshMcpPairRow, renderDshMcpAdvanced, renderDshMcpPairRows, renderDshMcpStatus } from './SettingsDshMcpServerControls';

export type { DshMcpPairRow } from './SettingsDshMcpServerControls';

/** Connection surface the MCP workspace may observe; the section extends it. */
export interface DshMcpWorkspaceConnectionPort {
  readonly status: 'disconnected' | 'connecting' | 'connected' | 'error';
  start(): Promise<void>;
  applyMcpConfiguration?(): Promise<number>;
  getSessionMcpStatus?(sessionId?: string): Promise<{
    servers: Array<{ name: string; status?: string; state?: string; connected?: boolean | null; toolCount?: number }>;
  }>;
  readSessionConfiguration(sessionId?: string): Promise<{
    sessionId: string; images: boolean;
    controls: Array<{ id: string; name: string; value: string; choices: Array<{ value: string; name: string }> }>;
  }>;
}

/** Narrow host for the MCP workspace; DshSettingsHost extends this. */
export interface DshMcpWorkspaceHost {
  getSettings(): DshBackendSettings;
  getAdapter(): DshMcpWorkspaceConnectionPort | undefined;
  validateMcpServers(value: unknown): DshMcpServer[];
  saveSettings(): Promise<void>;
  /** Stable absolute vault base path; scopes recovery snapshots per vault. */
  vaultPath?: string;
  /** Test/fixture seam: redirects the machine-local recovery store. */
  recoveryBaseDir?: string;
}

interface DshMcpDraftState {
  draft: string;
  selected: number;
}
const DSH_MCP_DRAFTS = new WeakMap<DshMcpWorkspaceHost, DshMcpDraftState>();

const DSH_MCP_RECOVERY_KEY = 'dsh-mcp-servers';

function serializeMcpDraft(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function asServerRecord(entry: unknown): Record<string, unknown> | undefined {
  return entry && typeof entry === 'object' && !Array.isArray(entry)
    ? entry as Record<string, unknown>
    : undefined;
}

function stringField(entry: Record<string, unknown>, key: string): string {
  return typeof entry[key] === 'string' ? entry[key] as string : '';
}

function pairRows(value: unknown): DshMcpPairRow[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const record = asServerRecord(entry);
    return { name: record ? stringField(record, 'name') : '', value: record ? stringField(record, 'value') : '' };
  });
}

/**
 * DSH MCP workspace: guided server list, raw JSON authority, validated save
 * with durable machine-local recovery. Secret-bearing declarations and their
 * snapshot I/O are isolated in this owner; the tab shell never touches them.
 */
export class SettingsDshMcpWorkspace {
  private readonly recovery: BackendConfigRecoveryStore;
  private currentGroup!: HTMLElement;
  private state: DshMcpDraftState = { draft: '[]', selected: 0 };
  private rerender: () => void = () => {};
  private refreshFeedback: () => void = () => {};

  constructor(private readonly host: DshMcpWorkspaceHost) {
    this.recovery = createBackendConfigRecoveryStore({ baseDir: host.recoveryBaseDir });
  }

  /** Per-vault, per-target identity; null (recovery unavailable) without a
   *  stable vault path, so vaults never share a synthetic snapshot namespace. */
  private mcpRecoveryIdentity(): string | null {
    return backendRecoveryIdentity(this.host.vaultPath, 'dsh:mcpServers');
  }

  render(group: HTMLElement): void {
    this.currentGroup = group;
    this.rerender = () => this.render(group);
    this.renderMcp(group);
  }

  private renderMcp(group: HTMLElement): void {
    group.empty();
    group.createEl('h4', { cls: 'opencodian-settings-subsection-heading', text: t('settings.agent.dsh.mcp') });
    group.createEl('p', { cls: 'setting-item-description', text: t('settings.agent.dsh.mcp.desc') });
    this.renderMcpWorkspace(group);
    group.createEl('p', { cls: 'setting-item-description', text: t('settings.agent.dsh.limits') });
  }

  private mcpDraftState(): DshMcpDraftState {
    const savedDraft = serializeMcpDraft(this.host.getSettings().mcpServers ?? []);
    const existing = DSH_MCP_DRAFTS.get(this.host);
    if (!existing) {
      const fresh: DshMcpDraftState = { draft: savedDraft, selected: 0 };
      DSH_MCP_DRAFTS.set(this.host, fresh);
      return fresh;
    }
    if (existing.draft !== savedDraft && !this.mcpDirty(existing)) {
      // The saved declarations changed elsewhere and the draft carries no
      // unsaved edits, so adopt the saved state instead of fighting it.
      existing.draft = savedDraft;
    }
    return existing;
  }

  /** Semantic comparison through the shared validator, raw text as fallback. */
  private mcpDirty(state: DshMcpDraftState): boolean {
    const saved = this.host.getSettings().mcpServers ?? [];
    try {
      return JSON.stringify(this.host.validateMcpServers(JSON.parse(state.draft)))
        !== JSON.stringify(this.host.validateMcpServers(saved));
    } catch {
      return state.draft !== serializeMcpDraft(saved);
    }
  }

  private mcpRawServers(state: DshMcpDraftState): Array<Record<string, unknown>> | undefined {
    try {
      const parsed: unknown = JSON.parse(state.draft);
      if (!Array.isArray(parsed)) return undefined;
      return parsed.map((entry) => asServerRecord(entry)).filter(
        (entry): entry is Record<string, unknown> => entry !== undefined,
      );
    } catch {
      return undefined;
    }
  }

  private renderMcpWorkspace(group: HTMLElement): void {
    const state = this.mcpDraftState();
    this.state = state;
    const feedback = group.createDiv({ cls: 'setting-item-description', attr: { role: 'status', 'aria-live': 'polite' } });
    this.refreshFeedback = (): void => {
      const message = this.mcpDirty(state) ? t('settings.agent.dsh.mcp.unsaved') : '';
      if (feedback.textContent !== message) feedback.setText(message);
    };
    const servers = this.mcpRawServers(state);
    this.rerender = (): void => this.render(group);
    const writeServers = (next: Array<Record<string, unknown>>): void => {
      state.draft = serializeMcpDraft(next);
      this.refreshFeedback();
    };

    if (!servers) {
      // The raw draft no longer parses; keep save/apply reachable so the
      // validator error and the recovery path stay one click away.
      feedback.setText(t('settings.agent.dsh.mcp.unsaved'));
    }

    // Guided server list. An empty list is the honest default: new sessions
    // simply start without extra tools.
    if (servers?.length === 0) {
      group.createEl('p', { cls: 'setting-item-description', text: t('settings.agent.dsh.mcp.empty') });
      group.createEl('p', { cls: 'setting-item-description', text: t('settings.agent.dsh.mcp.emptyDesc') });
    }
    state.selected = servers ? Math.min(Math.max(state.selected, 0), Math.max(servers.length - 1, 0)) : 0;
    servers?.forEach((entry, index) => {
      const name = stringField(entry, 'name');
      const kind = entry.type === 'http' ? t('settings.agent.dsh.mcp.kind.http') : t('settings.agent.dsh.mcp.kind.stdio');
      const row = new Setting(group)
        .setName(name || `${t('settings.agent.dsh.mcp.name')} ${index + 1}`)
        .setDesc(kind)
        .addButton((button) => button
          .setButtonText(t('settings.agent.dsh.mcp.edit'))
          .onClick(() => { state.selected = index; this.rerender(); }))
        .addButton((button) => button
          .setButtonText(t('settings.agent.dsh.mcp.remove'))
          .onClick(() => {
            const next = this.mcpRawServers(state);
            if (!next) return;
            next.splice(index, 1);
            state.selected = 0;
            writeServers(next);
            this.rerender();
          }));
      row.settingEl.setAttribute('data-dsh-mcp-server', String(index));
      row.settingEl.setAttribute('data-dsh-mcp-selected', String(state.selected === index));
    });

    const selected = servers?.[state.selected];
    if (selected) this.renderMcpServerEditor(group, selected);
    renderDshMcpStatus(group, {
      adapter: this.host.getAdapter(),
      native: this.host.getSettings().transport !== 'acp',
      isCurrent: () => this.currentGroup === group,
    });
    // The add-server entry is always reachable — including on the empty
    // no-tools default and while a raw draft is temporarily invalid.
    this.renderMcpAddServer(group);

    const actions = new Setting(group).setName(t('settings.agent.dsh.mcp.declarations'));
    actions.addButton((button) => button.setButtonText(t('settings.agent.dsh.mcp.revert'))
      .onClick(() => {
        state.draft = serializeMcpDraft(this.host.getSettings().mcpServers ?? []);
        state.selected = 0;
        this.rerender();
      }));
    actions.addButton((button) => button.setButtonText(t('settings.agent.dsh.save')).onClick(async () => {
      button.setDisabled(true);
      feedback.empty();
      let validated: DshMcpServer[];
      try {
        validated = this.host.validateMcpServers(JSON.parse(state.draft) as unknown);
      } catch {
        // Validation copy stays actionable and local; raw parser text never
        // reaches the DOM because it can echo declaration content.
        feedback.setText(t('settings.agent.dsh.mcp.validationFailed' as TranslationKey));
        button.setDisabled(false);
        return;
      }
      try {
        const historyUnavailable = await this.persistMcp(validated);
        const saved = t(this.host.getSettings().transport === 'acp' ? 'settings.dsh.mcpAdvanced.acpSaved' : 'settings.agent.dsh.mcp.saved');
        feedback.setText(saved + (historyUnavailable ? ` ${t('settings.backend.recovery.historyUnavailable' as TranslationKey)}` : ''));
        new Notice(saved);
      } catch {
        feedback.setText(t('settings.backend.recovery.failed'));
      } finally { button.setDisabled(false); }
    }));
    this.renderMcpRecovery(group);

    new Setting(group).setName(t('settings.agent.dsh.mcp.apply')).setDesc(t(this.host.getSettings().transport === 'acp'
      ? 'settings.dsh.mcpAdvanced.acpApplyDesc' : 'settings.agent.dsh.mcp.apply.desc'))
      .addButton((button) => button.setButtonText(t('settings.agent.dsh.mcp.apply')).onClick(async () => {
        button.setDisabled(true);
        try {
          const adapter = this.host.getAdapter();
          if (!adapter?.applyMcpConfiguration) throw new Error(t('settings.agent.dsh.status.unavailable'));
          const acp = this.host.getSettings().transport === 'acp';
          const count = await adapter.applyMcpConfiguration();
          const unsaved = this.mcpDirty(state);
          feedback.setText(t(acp ? 'settings.dsh.mcpAdvanced.acpApplied' : 'settings.agent.dsh.mcp.applied', { count })
            + (unsaved ? ` ${t('settings.agent.dsh.mcp.draftNotApplied')}` : ''));
        } catch { feedback.setText(t('settings.agent.dsh.status.unavailable')); }
        finally { button.setDisabled(false); }
      }));

    this.renderMcpRawEditor(group);
    this.refreshFeedback();
  }

  /** Validated save that archives the previous SAVED declarations for durable
   *  machine-local recovery. A failed save reverts and archives nothing. An
   *  archive failure never rolls the already-saved state back — it is reported
   *  as "saved, but history unavailable this time". */
  private async persistMcp(validated: DshMcpServer[]): Promise<boolean> {
    const settings = this.host.getSettings();
    const previousRaw = serializeMcpDraft(settings.mcpServers ?? []);
    const nextRaw = serializeMcpDraft(validated);
    const previous = settings.mcpServers;
    settings.mcpServers = validated;
    try {
      await this.host.saveSettings();
    } catch (error) {
      settings.mcpServers = previous;
      throw error;
    }
    const identity = this.mcpRecoveryIdentity();
    if (previousRaw === nextRaw || !identity) return false;
    try {
      this.recovery.archive(identity, DSH_MCP_RECOVERY_KEY, previousRaw);
      return false;
    } catch {
      // The saved state on disk is authoritative; history is best-effort.
      return true;
    }
  }

  /** Durable recovery disclosure: metadata-only list, three actions to restore
   *  (open -> Restore -> Confirm), CAS-guarded so a stale list never writes. */
  private renderMcpRecovery(group: HTMLElement): void {
    const disclosure = group.createEl('details', { cls: 'opencodian-dsh-mcp-recovery' });
    disclosure.createEl('summary', { text: t('settings.agent.dsh.mcp.recovery' as TranslationKey) });
    const body = disclosure.createDiv({ cls: 'opencodian-dsh-mcp-recovery-body' });
    body.createEl('p', { cls: 'setting-item-description', text: t('settings.agent.dsh.mcp.recovery.desc' as TranslationKey) });
    const listHost = body.createDiv({ cls: 'opencodian-dsh-mcp-recovery-list' });
    const feedback = body.createDiv({ cls: 'setting-item-description', attr: { role: 'status', 'aria-live': 'polite' } });
    const renderList = (): void => {
      listHost.empty();
      const identity = this.mcpRecoveryIdentity();
      if (!identity) {
        listHost.createEl('p', { cls: 'setting-item-description', text: t('settings.agent.dsh.mcp.recovery.empty' as TranslationKey) });
        return;
      }
      // An unreadable history directory (missing, unsafe, not private) must
      // only degrade the list, never the whole MCP page; no raw error surfaces.
      let entries;
      try { entries = this.recovery.list(identity, DSH_MCP_RECOVERY_KEY); }
      catch {
        feedback.setText(t('settings.backend.recovery.unavailable' as TranslationKey));
        return;
      }
      if (!entries.length) {
        listHost.createEl('p', { cls: 'setting-item-description', text: t('settings.agent.dsh.mcp.recovery.empty' as TranslationKey) });
        return;
      }
      // CAS snapshot: the saved declarations must not change while this list is open.
      const listedCurrentRevision = recoveryRevision(serializeMcpDraft(this.host.getSettings().mcpServers ?? []));
      for (const entry of entries) {
        const row = new Setting(listHost)
          .setName(t('settings.agent.dsh.mcp.recovery.entry' as TranslationKey, { date: new Date(entry.savedAt).toLocaleString() }))
          .setDesc(t('settings.agent.dsh.mcp.recovery.entryDetail' as TranslationKey, { bytes: entry.bytes }));
        row.addButton((button) => button.setButtonText(t('settings.agent.dsh.mcp.recovery.restore' as TranslationKey)).onClick(() => {
          this.confirmMcpRecovery({ identity, listHost, entry, listedCurrentRevision, feedback, renderList });
        }));
      }
    };
    renderList();
    disclosure.addEventListener('toggle', () => {
      // Reopening re-reads the list but keeps stale/unavailable feedback.
      if (disclosure.open) renderList();
    });
  }

  /** Inline confirm (third action) with fresh CAS re-check before any write.
   *  The rerender replaces the whole tab; the announcement lands on the fresh
   *  status node so the restored message survives the redraw. */
  private confirmMcpRecovery(context: {
    identity: string;
    listHost: HTMLElement;
    entry: { index: number; revision: string };
    listedCurrentRevision: string;
    feedback: HTMLElement;
    renderList: () => void;
  }): void {
    const { identity, listHost, entry, listedCurrentRevision, feedback, renderList } = context;
    const confirmHost = listHost.createDiv({ cls: 'opencodian-dsh-mcp-recovery-confirm' });
    confirmHost.createEl('p', { cls: 'setting-item-description', text: t('settings.agent.dsh.mcp.recovery.confirmHelp' as TranslationKey) });
    const confirm = confirmHost.createEl('button', { text: t('settings.agent.dsh.mcp.recovery.confirm' as TranslationKey), attr: { type: 'button' } });
    const cancel = confirmHost.createEl('button', { text: t('settings.agent.dsh.mcp.recovery.cancel' as TranslationKey), attr: { type: 'button' } });
    cancel.addEventListener('click', () => confirmHost.remove());
    confirm.addEventListener('click', () => {
      confirm.disabled = true;
      cancel.disabled = true;
      void (async () => {
        const currentRaw = serializeMcpDraft(this.host.getSettings().mcpServers ?? []);
        if (recoveryRevision(currentRaw) !== listedCurrentRevision) {
          feedback.setText(t('settings.backend.recovery.stale' as TranslationKey));
          renderList();
          return;
        }
        const snapshot = this.recovery.read(identity, DSH_MCP_RECOVERY_KEY, entry.index);
        if (!snapshot || snapshot.revision !== entry.revision) {
          feedback.setText(t('settings.backend.recovery.stale' as TranslationKey));
          renderList();
          return;
        }
        let validated: DshMcpServer[];
        try {
          validated = this.host.validateMcpServers(JSON.parse(snapshot.raw) as unknown);
        } catch {
          feedback.setText(t('settings.agent.dsh.mcp.validationFailed' as TranslationKey));
          return;
        }
        const historyUnavailable = await this.persistMcp(validated);
        const message = t('settings.agent.dsh.mcp.recovery.restored' as TranslationKey)
          + (historyUnavailable ? ` ${t('settings.backend.recovery.historyUnavailable' as TranslationKey)}` : '');
        new Notice(t('settings.agent.dsh.mcp.recovery.restored' as TranslationKey));
        this.rerender();
        this.currentGroup.querySelector<HTMLElement>('[role="status"]')?.setText(message);
      })().catch(() => {
        feedback.setText(t('settings.backend.recovery.failed'));
        confirm.disabled = false;
        cancel.disabled = false;
      });
    });
    confirm.focus();
  }

  /** Add-server entry: kind buttons append a stub to the raw draft and select it. */
  private renderMcpAddServer(group: HTMLElement): void {
    const mutate = (change: (servers: Array<Record<string, unknown>>) => void): void => {
      const servers = this.mcpRawServers(this.state);
      if (!servers) return;
      change(servers);
      this.state.draft = serializeMcpDraft(servers);
      this.refreshFeedback();
    };
    const addServer = (kind: 'stdio' | 'http'): void => {
      mutate((servers) => {
        const existingNames = new Set(servers.map((server) => stringField(server, 'name')));
        let suffix = servers.length + 1;
        while (existingNames.has(`server-${suffix}`)) suffix += 1;
        servers.push(kind === 'http'
          ? { type: 'http', name: `server-${suffix}`, url: '', headers: [] }
          : { name: `server-${suffix}`, command: '', args: [], env: [] });
        this.state.selected = servers.length - 1;
      });
      this.rerender();
    };
    const addRow = new Setting(group).setName(t('settings.agent.dsh.mcp.add'))
      .setDesc(t('settings.agent.dsh.mcp.kind.stdioDesc'));
    addRow.addButton((button) => button
      .setButtonText(t('settings.agent.dsh.mcp.kind.stdio'))
      .onClick(() => addServer('stdio')));
    addRow.addButton((button) => button
      .setButtonText(t('settings.agent.dsh.mcp.kind.http'))
      .onClick(() => addServer('http')));
  }

  /** Guided per-server fields, all mutating the raw draft. */
  private renderMcpServerEditor(group: HTMLElement, entry: Record<string, unknown>): void {
    const state = this.state;
    const mutate = (change: (servers: Array<Record<string, unknown>>) => void): void => {
      const servers = this.mcpRawServers(state);
      if (!servers) return;
      change(servers);
      this.state.draft = serializeMcpDraft(servers);
      this.refreshFeedback();
    };
    const patchSelected = (patch: Record<string, unknown>): void => mutate((servers) => {
      const target = asServerRecord(servers[state.selected]);
      if (target) Object.assign(target, patch);
    });

    const editor = group.createDiv({ cls: 'opencodian-dsh-mcp-editor' });
    new Setting(editor).setName(t('settings.agent.dsh.mcp.name'))
      .setDesc(t('settings.agent.dsh.mcp.name.desc'))
      .addText((input) => {
        input.setPlaceholder(t('settings.agent.dsh.mcp.name.placeholder')).setValue(stringField(entry, 'name')).onChange((value) => {
          patchSelected({ name: value.trim() });
        });
        input.inputEl.setAttribute('aria-label', t('settings.agent.dsh.mcp.name'));
      });
    const kind = entry.type === 'http' ? 'http' : 'stdio';
    addBackendChoiceSetting(editor, {
      key: 'mcp-server-kind',
      name: t('settings.agent.dsh.mcp.kind'),
      value: kind,
      options: [
        {
          value: 'stdio',
          label: t('settings.agent.dsh.mcp.kind.stdio'),
          description: t('settings.agent.dsh.mcp.kind.stdioDesc'),
          recommended: true,
        },
        {
          value: 'http',
          label: t('settings.agent.dsh.mcp.kind.http'),
          description: t('settings.agent.dsh.mcp.kind.httpDesc'),
        },
      ],
      onChange: async (value) => {
        if (value === kind) return;
        mutate((servers) => {
          const current = asServerRecord(servers[state.selected]);
          if (!current) return;
          const name = stringField(current, 'name');
          servers[state.selected] = value === 'http'
            ? { type: 'http', name, url: '', headers: [] }
            : { name, command: '', args: [], env: [] };
        });
        this.rerender();
      },
      presentation: { key: 'mcpServers', scope: 'vault', effect: 'new-session', risk: 'high' },
    });

    if (kind === 'http') {
      new Setting(editor).setName(t('settings.agent.dsh.mcp.url'))
        .setDesc(t('settings.agent.dsh.mcp.url.desc'))
        .addText((input) => {
          input.setPlaceholder('https://').setValue(stringField(entry, 'url')).onChange((value) => {
            patchSelected({ url: value.trim() });
          });
          input.inputEl.setAttribute('aria-label', t('settings.agent.dsh.mcp.url'));
        });
      renderDshMcpPairRows({
        container: editor,
        label: t('settings.agent.dsh.mcp.headers'),
        description: t('settings.agent.dsh.mcp.headers.desc'),
        initial: pairRows(entry.headers),
        onChange: (rows) => patchSelected({ headers: rows.filter((row) => row.name || row.value) }),
      });
    } else {
      new Setting(editor).setName(t('settings.agent.dsh.mcp.command'))
        .setDesc(t('settings.agent.dsh.mcp.command.desc'))
        .addText((input) => {
          input.setPlaceholder('/usr/local/bin/example').setValue(stringField(entry, 'command')).onChange((value) => {
            patchSelected({ command: value.trim() });
          });
          input.inputEl.setAttribute('aria-label', t('settings.agent.dsh.mcp.command'));
        });
      new Setting(editor).setName(t('settings.agent.dsh.mcp.args'))
        .setDesc(t('settings.agent.dsh.mcp.args.desc'))
        .setClass('opencodian-wide-text-setting')
        .addTextArea((input) => {
          const args = Array.isArray(entry.args) ? entry.args.filter((arg): arg is string => typeof arg === 'string') : [];
          input.setValue(args.join('\n')).onChange((value) => {
            patchSelected({ args: value.split('\n').map((line) => line.trim()).filter(Boolean) });
          });
          input.inputEl.rows = 3;
          input.inputEl.setAttribute('aria-label', t('settings.agent.dsh.mcp.args'));
        });
      renderDshMcpPairRows({
        container: editor,
        label: t('settings.agent.dsh.mcp.env'),
        description: t('settings.agent.dsh.mcp.env.desc'),
        initial: pairRows(entry.env),
        onChange: (rows) => patchSelected({ env: rows.filter((row) => row.name || row.value) }),
      });
    }
    renderDshMcpAdvanced(editor, entry, (key, value) => mutate((servers) => {
      const target = asServerRecord(servers[state.selected]);
      if (!target) return;
      if (value === undefined) delete target[key];
      else target[key] = value;
    }), () => this.host.getSettings().transport !== 'acp');
  }

  /** Raw JSON stays available behind an advanced disclosure as the authority. */
  private renderMcpRawEditor(group: HTMLElement): void {
    const disclosure = group.createEl('details', { cls: 'opencodian-dsh-mcp-raw' });
    disclosure.createEl('summary', { text: t('settings.agent.dsh.mcp.raw') });
    const body = disclosure.createDiv({ cls: 'opencodian-dsh-disclosure-body' });
    if (this.host.getSettings().transport === 'acp') body.createEl('p', { cls: 'setting-item-description', text: t('settings.dsh.mcpAdvanced.acpUnavailable') });
    const row = new Setting(body).setName(t('settings.agent.dsh.mcp.declarations'))
      .setDesc(t('settings.agent.dsh.mcp.desc')).setClass('opencodian-wide-text-setting');
    row.settingEl.addClass('opencodian-dsh-json-setting');
    row.addTextArea((input) => {
      input.setValue(this.state.draft).setPlaceholder('[]').onChange((value) => {
        // Keep the raw text as the single source of truth without stealing
        // focus; the guided views catch up on the next re-render.
        this.state.draft = value;
        this.refreshFeedback();
      });
      input.inputEl.rows = 8;
      input.inputEl.setAttribute('aria-label', t('settings.agent.dsh.mcp.declarations'));
      input.inputEl.addClass('opencodian-config-editor');
    });
  }
}
