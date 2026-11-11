import { Notice, Setting } from 'obsidian';

import type { PiAdapter } from '../../../../core/agents/backend/pi/PiAdapter';
import type { PiConfigurationSnapshot, PiSettingField } from '../../../../core/agents/backend/pi/PiProtocol';
import { type PiRecord, piRecord } from '../../../../core/agents/backend/pi/PiRpcClient';
import { getLocale, t } from '../../../../i18n';
import { addBackendChoiceSetting, type BackendSettingRisk, type BackendSettingScope, describeBackendSetting } from '../../controls/BackendSettingsControls';

const valueAt = (value: Record<string, unknown>, key: string): unknown => key.split('.').reduce<unknown>((parent, part) => (parent as Record<string, unknown> | undefined)?.[part], value);

/** Native execution groups run tools, extensions, and commands; treat them as high risk. */
const HIGH_RISK_GROUPS = new Set(['execution', 'advanced']);

/**
 * One-sentence consequence per native field, keyed by the SDK path from the
 * bundled `SETTINGS_FIELDS` table (assets/pi/configuration.mjs, mirrored in
 * docs/research/backend-refresh/backend-fields-pi.md section G). No defaults
 * or ranges are invented here beyond that table. Fields missing from the map
 * fall back to their group sentence, and truly unknown fields get the honest
 * "advanced native field" fallback instead of pretending coverage.
 */
const PI_FIELD_CONSEQUENCE_KEYS: Record<string, string> = {
  defaultProvider: 'settings.pi.consequence.defaultProvider',
  defaultModel: 'settings.pi.consequence.defaultModel',
  defaultThinkingLevel: 'settings.pi.consequence.defaultThinkingLevel',
  enabledModels: 'settings.pi.consequence.enabledModels',
  'thinkingBudgets.minimal': 'settings.pi.consequence.thinkingBudgets.minimal',
  'thinkingBudgets.low': 'settings.pi.consequence.thinkingBudgets.low',
  'thinkingBudgets.medium': 'settings.pi.consequence.thinkingBudgets.medium',
  'thinkingBudgets.high': 'settings.pi.consequence.thinkingBudgets.high',
  transport: 'settings.pi.consequence.transport',
  steeringMode: 'settings.pi.consequence.steeringMode',
  followUpMode: 'settings.pi.consequence.followUpMode',
  'compaction.enabled': 'settings.pi.consequence.compaction.enabled',
  'compaction.reserveTokens': 'settings.pi.consequence.compaction.reserveTokens',
  'compaction.keepRecentTokens': 'settings.pi.consequence.compaction.keepRecentTokens',
  'branchSummary.reserveTokens': 'settings.pi.consequence.branchSummary.reserveTokens',
  'branchSummary.skipPrompt': 'settings.pi.consequence.branchSummary.skipPrompt',
  'retry.enabled': 'settings.pi.consequence.retry.enabled',
  'retry.maxRetries': 'settings.pi.consequence.retry.maxRetries',
  'retry.baseDelayMs': 'settings.pi.consequence.retry.baseDelayMs',
  'retry.provider.timeoutMs': 'settings.pi.consequence.retry.provider.timeoutMs',
  'retry.provider.maxRetries': 'settings.pi.consequence.retry.provider.maxRetries',
  'retry.provider.maxRetryDelayMs': 'settings.pi.consequence.retry.provider.maxRetryDelayMs',
  shellPath: 'settings.pi.consequence.shellPath',
  shellCommandPrefix: 'settings.pi.consequence.shellCommandPrefix',
  npmCommand: 'settings.pi.consequence.npmCommand',
  'images.autoResize': 'settings.pi.consequence.images.autoResize',
  'images.blockImages': 'settings.pi.consequence.images.blockImages',
  packages: 'settings.pi.consequence.packages',
  extensions: 'settings.pi.consequence.extensions',
  skills: 'settings.pi.consequence.skills',
  prompts: 'settings.pi.consequence.prompts',
  themes: 'settings.pi.consequence.themes',
  enableSkillCommands: 'settings.pi.consequence.enableSkillCommands',
  sessionDir: 'settings.pi.consequence.sessionDir',
  theme: 'settings.pi.consequence.theme',
  quietStartup: 'settings.pi.consequence.quietStartup',
  collapseChangelog: 'settings.pi.consequence.collapseChangelog',
  enableInstallTelemetry: 'settings.pi.consequence.enableInstallTelemetry',
  'terminal.showImages': 'settings.pi.consequence.terminal.showImages',
  'terminal.imageWidthCells': 'settings.pi.consequence.terminal.imageWidthCells',
  'terminal.clearOnShrink': 'settings.pi.consequence.terminal.clearOnShrink',
  'terminal.showTerminalProgress': 'settings.pi.consequence.terminal.showTerminalProgress',
  doubleEscapeAction: 'settings.pi.consequence.doubleEscapeAction',
  treeFilterMode: 'settings.pi.consequence.treeFilterMode',
  editorPaddingX: 'settings.pi.consequence.editorPaddingX',
  autocompleteMaxVisible: 'settings.pi.consequence.autocompleteMaxVisible',
  showHardwareCursor: 'settings.pi.consequence.showHardwareCursor',
  'markdown.codeBlockIndent': 'settings.pi.consequence.markdown.codeBlockIndent',
  'warnings.anthropicExtraUsage': 'settings.pi.consequence.warnings.anthropicExtraUsage',
  lastChangelogVersion: 'settings.pi.consequence.lastChangelogVersion',
};
/**
 * Locale-aware human labels for the 51 known fields, so names never render as
 * raw identifiers in either locale. Falls back to the SDK-provided label for
 * unmapped fields and to the path only as a last resort (the unknown-field
 * description already marks it unclaimed).
 */
const PI_FIELD_LABEL_KEYS: Record<string, string> = {
  defaultProvider: 'settings.pi.label.defaultProvider',
  defaultModel: 'settings.pi.label.defaultModel',
  defaultThinkingLevel: 'settings.pi.label.defaultThinkingLevel',
  enabledModels: 'settings.pi.label.enabledModels',
  'thinkingBudgets.minimal': 'settings.pi.label.thinkingBudgets.minimal',
  'thinkingBudgets.low': 'settings.pi.label.thinkingBudgets.low',
  'thinkingBudgets.medium': 'settings.pi.label.thinkingBudgets.medium',
  'thinkingBudgets.high': 'settings.pi.label.thinkingBudgets.high',
  transport: 'settings.pi.label.transport',
  steeringMode: 'settings.pi.label.steeringMode',
  followUpMode: 'settings.pi.label.followUpMode',
  'compaction.enabled': 'settings.pi.label.compaction.enabled',
  'compaction.reserveTokens': 'settings.pi.label.compaction.reserveTokens',
  'compaction.keepRecentTokens': 'settings.pi.label.compaction.keepRecentTokens',
  'branchSummary.reserveTokens': 'settings.pi.label.branchSummary.reserveTokens',
  'branchSummary.skipPrompt': 'settings.pi.label.branchSummary.skipPrompt',
  'retry.enabled': 'settings.pi.label.retry.enabled',
  'retry.maxRetries': 'settings.pi.label.retry.maxRetries',
  'retry.baseDelayMs': 'settings.pi.label.retry.baseDelayMs',
  'retry.provider.timeoutMs': 'settings.pi.label.retry.provider.timeoutMs',
  'retry.provider.maxRetries': 'settings.pi.label.retry.provider.maxRetries',
  'retry.provider.maxRetryDelayMs': 'settings.pi.label.retry.provider.maxRetryDelayMs',
  shellPath: 'settings.pi.label.shellPath',
  shellCommandPrefix: 'settings.pi.label.shellCommandPrefix',
  npmCommand: 'settings.pi.label.npmCommand',
  'images.autoResize': 'settings.pi.label.images.autoResize',
  'images.blockImages': 'settings.pi.label.images.blockImages',
  packages: 'settings.pi.label.packages',
  extensions: 'settings.pi.label.extensions',
  skills: 'settings.pi.label.skills',
  prompts: 'settings.pi.label.prompts',
  themes: 'settings.pi.label.themes',
  enableSkillCommands: 'settings.pi.label.enableSkillCommands',
  sessionDir: 'settings.pi.label.sessionDir',
  theme: 'settings.pi.label.theme',
  quietStartup: 'settings.pi.label.quietStartup',
  collapseChangelog: 'settings.pi.label.collapseChangelog',
  enableInstallTelemetry: 'settings.pi.label.enableInstallTelemetry',
  'terminal.showImages': 'settings.pi.label.terminal.showImages',
  'terminal.imageWidthCells': 'settings.pi.label.terminal.imageWidthCells',
  'terminal.clearOnShrink': 'settings.pi.label.terminal.clearOnShrink',
  'terminal.showTerminalProgress': 'settings.pi.label.terminal.showTerminalProgress',
  doubleEscapeAction: 'settings.pi.label.doubleEscapeAction',
  treeFilterMode: 'settings.pi.label.treeFilterMode',
  editorPaddingX: 'settings.pi.label.editorPaddingX',
  autocompleteMaxVisible: 'settings.pi.label.autocompleteMaxVisible',
  showHardwareCursor: 'settings.pi.label.showHardwareCursor',
  'markdown.codeBlockIndent': 'settings.pi.label.markdown.codeBlockIndent',
  'warnings.anthropicExtraUsage': 'settings.pi.label.warnings.anthropicExtraUsage',
  lastChangelogVersion: 'settings.pi.label.lastChangelogVersion',
};

function fieldConsequence(field: PiSettingField): string {
  // Known fields get their own sentence; anything else is honestly unclaimed
  // instead of pretending group-level coverage.
  const specific = PI_FIELD_CONSEQUENCE_KEYS[field.path];
  if (specific) return t(specific as Parameters<typeof t>[0]);
  return t('settings.pi.consequence.unknown', { path: field.path });
}

function fieldLabel(field: PiSettingField): string {
  const mapped = PI_FIELD_LABEL_KEYS[field.path];
  if (mapped) return t(mapped as Parameters<typeof t>[0]);
  return getLocale() === 'zh' ? field.label.zh : field.label.en;
}

/** Optional native archive contract on PiAdapter (core-owned). */
interface PiHistoryBackend {
  supportsConfigurationHistory(): Promise<boolean>;
  getConfigurationHistory(): Promise<PiRecord>;
  restoreConfiguration(input: PiRecord): Promise<PiRecord>;
}
interface PiArchiveEntry { index: number; savedAt: number; revision: string; bytes?: number }
interface PiDocumentVersion { savedAt: number; revision: string; value: Record<string, unknown> }
const PI_SETTINGS_HISTORY_LIMIT = 5;
/**
 * Session-scoped undo for the native settings.json editors. Memory only:
 * never persisted, never written to the vault, lost on plugin reload. Used
 * only while the adapter lacks the native archive contract.
 */
const settingsHistory = new WeakMap<PiAdapter, Record<'global' | 'project', PiDocumentVersion[]>>();

const piSettingsTarget = (settings: PiRecord, scope: 'global' | 'project'): { entries?: unknown } => {
  const container = typeof settings[scope] === 'object' && settings[scope] !== null ? settings[scope] as PiRecord : {};
  return { entries: container.entries };
};

/**
 * Native global/project settings forms; file persistence stays inside the Pi
 * service. One instance can render several field groups in order (for example
 * the execution page renders the `execution` group and then hosts the
 * advanced high-risk disclosure from {@link attachAdvanced}).
 */
export class SettingsPiConfigurationSection {
  private scope: 'global' | 'project' = 'project';
  private snapshot?: PiConfigurationSnapshot;
  private historyEpoch = 0;
  private readonly drafts = { global: new Map<string, string>(), project: new Map<string, string>() };
  constructor(private readonly adapter: PiAdapter, private readonly onSaved: (keys: string[]) => Promise<void>, private readonly reconnect: () => Promise<void>) {}

  attach(container: HTMLElement, groups: string | readonly string[]): void {
    const requested = typeof groups === 'string' ? [groups] : [...groups];
    const status = container.createDiv({ cls: 'opencodian-pi-config-status', text: t('settings.pi.loading'), attr: { role: 'status' } });
    const body = container.createDiv();
    const load = async (): Promise<void> => {
      try {
        this.snapshot = await this.adapter.command(undefined, 'get_configuration') as unknown as PiConfigurationSnapshot;
        status.setText(''); this.render(body, requested);
      } catch (error) { status.setText(String(error)); }
    };
    new Setting(container).setName(t('settings.pi.refresh')).addButton(button => button.setButtonText(t('settings.pi.refresh')).onClick(() => { void load(); }));
    void load();
  }

  /**
   * The advanced native editor (raw settings.json plus its field group) as a
   * separate high-risk disclosure, so execution settings never blur into the
   * ordinary model page.
   */
  attachAdvanced(container: HTMLElement): void {
    const advanced = container.createEl('details', { cls: 'opencodian-pi-config-advanced opencodian-backend-high-risk', attr: { 'data-pi-section': 'advanced', 'data-backend-risk': 'high' } });
    advanced.createEl('summary', { text: t('settings.pi.advanced.title') });
    const body = advanced.createDiv({ cls: 'opencodian-zcode-disclosure-body' });
    body.createEl('p', { text: t('settings.pi.advanced.warning'), cls: 'setting-item-description', attr: { 'data-pi-advanced-warning': '' } });
    const status = body.createDiv({ cls: 'opencodian-pi-config-status', text: t('settings.pi.loading'), attr: { role: 'status' } });
    const inner = body.createDiv();
    const load = async (): Promise<void> => {
      try {
        this.snapshot = await this.adapter.command(undefined, 'get_configuration') as unknown as PiConfigurationSnapshot;
        status.setText(''); this.render(inner, ['advanced']);
      } catch (error) { status.setText(String(error)); }
    };
    void load();
    advanced.addEventListener('toggle', () => { if (advanced.open && !inner.childElementCount) void load(); });
  }

  private render(body: HTMLElement, groups: readonly string[]): void {
    if (!this.snapshot) return;
    body.empty();
    body.addClass('opencodian-settings-form-stack');
    const document = this.snapshot.scopes[this.scope];
    new Setting(body).setName(t('settings.pi.scope')).setDesc(document.path).addDropdown(dropdown => {
      dropdown.addOption('project', t('settings.pi.scope.project')).addOption('global', t('settings.pi.scope.global')).setValue(this.scope)
        .onChange(value => { this.scope = value as 'global' | 'project'; this.render(body, groups); });
    });
    body.createEl('p', { cls: 'setting-item-description', text: t('settings.pi.scope.help') });
    const fields = this.snapshot.fields.filter(field => groups.includes(field.group));
    if (!fields.length) {
      body.createEl('p', { text: t('settings.pi.fieldsUnavailable'), cls: 'setting-item-description' });
    }
    let currentGroup = '';
    for (const field of fields) {
      if (groups.length > 1 && field.group !== currentGroup) {
        currentGroup = field.group;
        body.createEl('h4', { text: t(`settings.pi.tab.${currentGroup}` as Parameters<typeof t>[0]) });
      }
      this.renderField(body, field);
    }
    const status = body.createDiv({ cls: 'opencodian-pi-config-status', attr: { role: 'status', 'aria-live': 'polite' } });
    new Setting(body).setName(t('settings.pi.saveSettings')).setDesc(t('settings.pi.applyBoundary')).addButton(button => {
      button.setButtonText(t('settings.pi.save')).setCta().onClick(async () => {
        button.setDisabled(true);
        try {
          const changes = this.collectChanges(fields);
          if (!Object.keys(changes).length) { status.setText(t('settings.pi.noChanges')); return; }
          this.pushSettingsMemoryHistory(this.scope, document);
          this.snapshot = await this.adapter.command(undefined, 'save_configuration', { scope: this.scope, revision: document.revision, changes }) as unknown as PiConfigurationSnapshot;
          this.drafts[this.scope].clear(); await this.onSaved(Object.keys(changes));
          this.render(body, groups); body.querySelector('.opencodian-pi-config-status')?.setText(t('settings.pi.saved'));
        } catch (error) { status.setText(String(error)); }
        finally { button.setDisabled(false); }
      });
    }).addButton(button => button.setButtonText(t('settings.pi.reconnect')).onClick(async () => {
      button.setDisabled(true);
      try { await this.reconnect(); status.setText(t('settings.pi.connected')); }
      catch (error) { status.setText(String(error)); }
      finally { button.setDisabled(false); }
    }));
    if (groups.includes('advanced')) {
      this.renderRawEditor(body);
      this.renderSettingsHistory(body, document, async () => {
        this.snapshot = await this.adapter.command(undefined, 'get_configuration') as unknown as PiConfigurationSnapshot;
        this.render(body, groups);
      });
    }
  }

  private get historyBackend(): PiHistoryBackend | undefined {
    const candidate = this.adapter as unknown as Partial<PiHistoryBackend>;
    return typeof candidate.supportsConfigurationHistory === 'function'
      && typeof candidate.getConfigurationHistory === 'function'
      && typeof candidate.restoreConfiguration === 'function' ? candidate as PiHistoryBackend : undefined;
  }

  private pushSettingsMemoryHistory(scope: 'global' | 'project', document: PiConfigurationSnapshot['scopes']['global']): void {
    if (this.historyBackend) return;
    const store = settingsHistory.get(this.adapter) ?? { global: [], project: [] };
    const entries = store[scope];
    entries.unshift({ savedAt: Date.now(), revision: document.revision, value: document.value });
    store[scope] = entries.slice(0, PI_SETTINGS_HISTORY_LIMIT);
    settingsHistory.set(this.adapter, store);
  }

  /**
   * Version history for the native settings.json editors (advanced context).
   * Persistent native archive when the adapter exposes it; honest memory-only
   * session undo otherwise. Restore ≤3 clicks and always revision-guarded.
   */
  private renderSettingsHistory(
    body: HTMLElement,
    document: PiConfigurationSnapshot['scopes']['global'],
    refresh: () => Promise<void>,
  ): void {
    const native = this.historyBackend;
    const details = body.createEl('details', { cls: 'opencodian-pi-config-advanced opencodian-pi-config-history', attr: { 'data-pi-settings-history': '', 'data-backend-risk': 'medium' } });
    details.createEl('summary', { text: t('settings.pi.history.title') });
    const help = details.createDiv({ cls: 'opencodian-zcode-disclosure-body' }).createEl('p', { cls: 'setting-item-description' });
    const list = details.querySelector('.opencodian-zcode-disclosure-body')!.createDiv({ cls: 'opencodian-settings-form-stack', attr: { 'data-pi-settings-history-list': '' } });
    const scopeLabel = (): string => t(this.scope === 'global' ? 'settings.pi.scope.global' : 'settings.pi.scope.project');
    details.addEventListener('toggle', () => {
      if (!details.open) return;
      const epoch = ++this.historyEpoch;
      list.empty();
      if (native) {
        help.setText(t('settings.pi.history.nativeHelp'));
        void (async () => {
          list.setText(t('settings.pi.history.loading'));
          let entries: PiArchiveEntry[] = [];
          try {
            const snapshot = await native.getConfigurationHistory();
            const scopeEntry = piSettingsTarget(piRecord(snapshot.settings), this.scope);
            entries = Array.isArray(scopeEntry.entries) ? scopeEntry.entries as PiArchiveEntry[] : [];
          } catch {
            if (epoch === this.historyEpoch && list.isConnected) list.setText(t('settings.pi.history.failed'));
            return;
          }
          if (epoch !== this.historyEpoch || !list.isConnected) return;
          list.empty();
          if (!entries.length) { list.createEl('p', { text: t('settings.pi.history.nativeEmpty'), cls: 'setting-item-description' }); return; }
          for (const entry of entries) {
            const row = new Setting(list)
              .setName(t('settings.pi.history.nativeEntry', { index: String(entry.index), time: new Date(entry.savedAt).toLocaleString() }))
              .setDesc(t('settings.pi.history.settingsDetail', { scope: scopeLabel(), revision: String(entry.revision).slice(0, 12) }));
            describeBackendSetting(row, {
              key: `pi-settings-history-native-${entry.index}`,
              scope: this.scope,
              effect: 'immediate',
              source: t('settings.pi.history.nativeSource'),
            });
            row.addButton(button => button.setButtonText(t('settings.pi.history.restore')).onClick(() => {
              this.confirmRestore(list, row.settingEl, epoch, {
                confirmText: t('settings.pi.history.confirmHelp'),
                run: async () => {
                  await native.restoreConfiguration({
                    target: 'settings', scope: this.scope, index: entry.index, archivedRevision: entry.revision, revision: document.revision,
                  });
                },
                refresh,
              });
            }));
          }
        })();
        return;
      }
      help.setText(t('settings.pi.history.help'));
      const store = settingsHistory.get(this.adapter);
      const entries = store?.[this.scope] ?? [];
      if (!entries.length) { list.createEl('p', { text: t('settings.pi.history.empty'), cls: 'setting-item-description' }); return; }
      for (const entry of entries) {
        const row = new Setting(list)
          .setName(t('settings.pi.history.entry', { time: new Date(entry.savedAt).toLocaleString() }))
          .setDesc(t('settings.pi.history.settingsDetail', { scope: scopeLabel(), revision: entry.revision }));
        describeBackendSetting(row, {
          key: 'pi-settings-history-memory-entry',
          scope: this.scope,
          effect: 'immediate',
          source: t('settings.pi.history.memorySource'),
        });
        row.addButton(button => button.setButtonText(t('settings.pi.history.restore')).onClick(() => {
          this.confirmRestore(list, row.settingEl, epoch, {
            confirmText: t('settings.pi.history.confirmHelp'),
            run: async () => {
              await this.adapter.command(undefined, 'save_configuration', { scope: this.scope, revision: document.revision, value: entry.value });
            },
            refresh,
          });
        }));
      }
    });
  }

  /** Shared three-click restore shell: open disclosure -> Restore -> Confirm. */
  private confirmRestore(
    list: HTMLElement,
    row: HTMLElement,
    epoch: number,
    action: { confirmText: string; run: () => Promise<void>; refresh: () => Promise<void> },
  ): void {
    const { confirmText, run, refresh } = action;
    const confirmHost = list.createDiv({ cls: 'opencodian-pi-config-history-confirm', attr: { 'data-pi-settings-history-confirm': '' } });
    confirmHost.createEl('p', { text: confirmText, cls: 'setting-item-description' });
    const confirm = confirmHost.createEl('button', { text: t('settings.pi.history.confirm'), attr: { type: 'button' } });
    const cancel = confirmHost.createEl('button', { text: t('settings.pi.cancel'), attr: { type: 'button' } });
    cancel.addEventListener('click', () => { confirmHost.empty(); row.querySelector<HTMLButtonElement>('button')?.focus(); });
    confirm.addEventListener('click', () => {
      confirm.disabled = true; cancel.disabled = true;
      void (async () => {
        await run();
        if (epoch !== this.historyEpoch || !list.isConnected) return;
        new Notice(t('settings.pi.history.restored'));
        await refresh();
      })().catch(() => {
        if (!confirmHost.isConnected) return;
        // A stale view never overwrites; offer refresh instead of raw errors.
        confirmHost.empty();
        const stale = confirmHost.createEl('p', { text: t('settings.pi.history.stale'), cls: 'setting-item-description', attr: { role: 'alert' } });
        const reload = stale.createEl('button', { text: t('settings.pi.history.refresh'), attr: { type: 'button' } });
        reload.addEventListener('click', () => { reload.disabled = true; this.historyEpoch += 1; void refresh(); });
      })
        .finally(() => { if (confirmHost.isConnected) { confirm.disabled = false; cancel.disabled = false; } });
    });
    confirm.focus();
  }

  private renderField(container: HTMLElement, field: PiSettingField): void {
    const snapshot = this.snapshot as PiConfigurationSnapshot;
    const current = valueAt(snapshot.scopes[this.scope].value, field.path);
    const inherited = this.scope === 'project' ? valueAt(snapshot.scopes.global.value, field.path) : undefined;
    const label = fieldLabel(field);
    const fieldScope = field.scope ? t(`settings.pi.fieldScope.${field.scope}`) : t('settings.pi.fieldScope.sdk');
    const risk: BackendSettingRisk | undefined = HIGH_RISK_GROUPS.has(field.group) ? 'high' : undefined;
    const presentation = {
      key: `pi-native-${field.path}`,
      scope: this.scope as BackendSettingScope,
      effect: 'new-session' as const,
      ...(risk ? { risk } : {}),
      ...(inherited === undefined ? {} : { defaultLabel: `${t('settings.pi.inherited')}: ${typeof inherited === 'string' ? inherited : JSON.stringify(inherited)}` }),
      source: fieldScope,
    };
    let text = current === undefined ? '' : String(current);
    if (field.kind === 'list') text = Array.isArray(current) ? current.join('\n') : '';
    if (field.kind === 'json') text = current === undefined ? '' : JSON.stringify(current, null, 2);
    text = this.drafts[this.scope].get(field.path) ?? text;
    const update = (value: string): void => { this.drafts[this.scope].set(field.path, value); };
    const markNativeField = (setting: Setting): void => { setting.settingEl.dataset.piSetting = field.path; };
    // Human consequence sentence first; the raw field key stays as a muted
    // secondary marker, never as the whole description.
    const appendSecondaryKey = (setting: Setting): void => {
      const descEl = setting.settingEl.querySelector<HTMLElement>('.setting-item-description');
      const keyEl = setting.settingEl.ownerDocument.createElement('span');
      keyEl.className = 'opencodian-pi-field-key';
      keyEl.textContent = field.path;
      (descEl ?? setting.settingEl).appendChild(keyEl);
    };
    const consequence = fieldConsequence(field);
    // Boolean and choice fields render as native radios (the shared helper
    // applies the same presentation badges). An unset field is an explicit,
    // selectable "Use Pi default" choice; saving it writes null through the
    // revision-guarded mutation and clears the override. Unknown non-empty
    // saved values stay as the checked disabled unlisted option — never
    // auto-written or clamped.
    if (field.kind === 'boolean') {
      const choice = addBackendChoiceSetting(container, {
        key: `pi-native-${field.path}`,
        name: label,
        description: consequence,
        value: text,
        options: [
          { value: '', label: t('settings.pi.inherit') },
          { value: 'true', label: t('settings.pi.enabled') },
          { value: 'false', label: t('settings.pi.disabled') },
        ],
        onChange: update,
        presentation,
        disabled: field.readOnly === true,
      });
      markNativeField(choice);
      appendSecondaryKey(choice);
      return;
    }
    if (field.options?.length) {
      const choice = addBackendChoiceSetting(container, {
        key: `pi-native-${field.path}`,
        name: label,
        description: consequence,
        value: text,
        options: [
          { value: '', label: t('settings.pi.inherit') },
          ...field.options.map(option => ({ value: option, label: option })),
        ],
        onChange: update,
        presentation,
        disabled: field.readOnly === true,
      });
      markNativeField(choice);
      appendSecondaryKey(choice);
      return;
    }
    const setting = new Setting(container).setName(label).setDesc(consequence);
    describeBackendSetting(setting, presentation);
    markNativeField(setting);
    appendSecondaryKey(setting);
    if (field.kind === 'list' || field.kind === 'json') {
      setting.settingEl.addClass('opencodian-pi-config-multiline');
      setting.addTextArea(input => { input.inputEl.rows = field.kind === 'json' ? 6 : 3; input.inputEl.setAttribute('aria-label', label); input.setValue(text).setPlaceholder(t('settings.pi.inherit')).onChange(update); });
    } else setting.addText(input => {
      input.inputEl.setAttribute('aria-label', label);
      if (field.kind === 'number') { input.inputEl.type = 'number'; input.inputEl.min = String(field.min ?? 0); if (field.max !== undefined) input.inputEl.max = String(field.max); }
      input.setValue(text).setPlaceholder(t('settings.pi.inherit')).setDisabled(field.readOnly === true).onChange(update);
    });
  }

  private collectChanges(fields: PiSettingField[]): Record<string, unknown> {
    const changes: Record<string, unknown> = {};
    for (const field of fields) {
      const value = this.drafts[this.scope].get(field.path); if (value === undefined) continue;
      if (value === '') { changes[field.path] = null; continue; }
      switch (field.kind) {
        case 'boolean': changes[field.path] = value === 'true'; break;
        case 'number': {
          const number = Number(value);
          if (!Number.isInteger(number) || number < (field.min ?? 0) || (field.max !== undefined && number > field.max)) throw new Error(`${field.path}: ${t('settings.pi.invalidNumber')}`);
          changes[field.path] = number; break;
        }
        case 'json': changes[field.path] = JSON.parse(value); break;
        case 'list': changes[field.path] = value.split('\n').map(line => line.trim()).filter(Boolean); break;
        default: changes[field.path] = value;
      }
    }
    return changes;
  }

  private renderRawEditor(container: HTMLElement): void {
    const details = container.createEl('details', { cls: 'opencodian-pi-config-advanced' });
    details.createEl('summary', { text: t('settings.pi.nativeSettings') });
    details.createEl('p', { text: t('settings.pi.nativeSettings.help'), cls: 'setting-item-description' });
    let document = (this.snapshot as PiConfigurationSnapshot).scopes[this.scope];
    const input = details.createEl('textarea', { cls: 'opencodian-pi-json-editor', attr: { 'aria-label': 'settings.json', spellcheck: 'false' } });
    input.rows = 16; input.value = JSON.stringify(document.value, null, 2);
    const status = details.createDiv({ attr: { role: 'status' } });
    new Setting(details).addButton(button => button.setButtonText(t('settings.pi.save')).onClick(async () => {
      button.setDisabled(true);
      try {
        this.pushSettingsMemoryHistory(this.scope, document);
        this.snapshot = await this.adapter.command(undefined, 'save_configuration', { scope: this.scope, revision: document.revision, value: JSON.parse(input.value) }) as unknown as PiConfigurationSnapshot;
        document = this.snapshot.scopes[this.scope];
        await this.onSaved(['defaultProvider', 'defaultModel', 'defaultThinkingLevel']); status.setText(t('settings.pi.saved'));
      } catch (error) { status.setText(String(error)); }
      finally { button.setDisabled(false); }
    }));
  }
}
