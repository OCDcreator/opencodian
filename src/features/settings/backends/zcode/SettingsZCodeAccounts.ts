/** Account UX and shared native provider form. Secrets stay in the backend;
 * an existing API key is represented only by a presence flag. */
import { Setting } from 'obsidian';

import type { ArchiveHistoryEntrySummary } from '../../../../core/agents/backend/configuration/ProjectResourceSecureWrite';
import type { ZCodeAccountFamily,ZCodeAccountService } from '../../../../core/agents/backend/zcode/ZCodeAccountService';
import type { ZCodePersonalConfigService, ZCodePersonalConfigSnapshot, ZCodePersonalProvider, ZCodeProviderDraft } from '../../../../core/agents/backend/zcode/ZCodePersonalConfigService';
import { t } from '../../../../i18n';
import { describeBackendSetting } from '../../controls/BackendSettingsControls';

export interface ZCodeAccountsBackend {
  accounts: Pick<ZCodeAccountService, 'read' | 'login' | 'logout' | 'cancelLogin' | 'openDesktop'>;
  /** History/restore are feature-detected on the service (present when the adapter ships the archive contract). */
  getPersonalConfigService(): Pick<ZCodePersonalConfigService, 'read' | 'save' | 'remove' | 'listPersonalConfigHistory' | 'restorePersonalConfigEntry'>;
  refreshConfiguration(): Promise<{ needsReconnect: boolean }>;
}

export function zcodeSettingsError(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  const key = `settings.zcode.ui.error.${code}` as Parameters<typeof t>[0];
  const translated = t(key);
  return translated === key ? t('settings.zcode.ui.operationFailed') : translated;
}

/**
 * Account sign-in (machine-local official login) and the shared personal API
 * configuration editor. `attach` renders both inside one disclosure for the
 * stacked layout; the tabbed layout mounts `attachAccount` and
 * `attachProviders` on separate high-risk task tabs.
 */
export class SettingsZCodeAccounts {
  private root!: HTMLDetailsElement;
  private account!: HTMLElement;
  private accountFeedback!: HTMLElement;
  private providerList!: HTMLElement;
  private editor!: HTMLElement;
  private historyList: HTMLElement | null = null;
  private snapshot: ZCodePersonalConfigSnapshot | null = null;
  private loadEpoch = 0;
  private historyEpoch = 0;

  constructor(private readonly backend: ZCodeAccountsBackend | undefined, private readonly onChanged: () => Promise<void>) {}

  /** Stacked layout: one disclosure holding account and model services. */
  attach(container: HTMLElement): void {
    this.root = container.createEl('details', { cls: 'opencodian-zcode-disclosure', attr: { 'data-zcode-group': 'accounts-models' } });
    this.root.createEl('summary', { text: t('settings.zcode.ui.manage') });
    const content = this.root.createDiv({ cls: 'opencodian-zcode-disclosure-body' });
    content.createEl('p', { cls: 'setting-item-description', text: t('settings.zcode.ui.manageHelp') });
    this.attachAccount(content);
    this.attachProviders(content);
  }

  reveal(): void { this.root.open = true; }

  /** Official login tab. Scope is per machine (ADR-0003): one login shared by every OpenCodian vault. */
  attachAccount(container: HTMLElement): void {
    const accountGroup = container.createDiv({ cls: 'opencodian-zcode-group', attr: { 'data-zcode-group': 'official-accounts' } });
    accountGroup.createEl('h4', { text: t('settings.zcode.ui.account') });
    accountGroup.createEl('p', { cls: 'setting-item-description', text: t('settings.zcode.ui.accountHelp') });
    const scopeNote = accountGroup.createEl('p', { cls: 'setting-item-description opencodian-zcode-supporting', attr: { 'data-zcode-group': 'account-scope' } });
    scopeNote.setText(t('settings.zcode.ui.accountScope'));
    this.account = accountGroup.createDiv();
    this.accountFeedback = accountGroup.createDiv({ cls: 'opencodian-zcode-feedback', attr: { role: 'status' } });
    const external = new Setting(accountGroup).setName(t('settings.zcode.ui.desktop')).setDesc(t('settings.zcode.ui.desktopHelp'));
    describeBackendSetting(external, {
      key: 'zcode-desktop-open',
      scope: 'global',
      effect: 'immediate',
      risk: 'medium',
      source: t('settings.zcode.ui.accountSource'),
    });
    external.addButton((button) => button.setButtonText(t('settings.zcode.ui.desktop')).setDisabled(!this.backend).onClick(async () => {
      button.setDisabled(true);
      try { await this.backend?.accounts.openDesktop(); this.accountFeedback.setText(t('settings.zcode.ui.desktopOpened')); }
      catch (error) { this.accountFeedback.setText(zcodeSettingsError(error)); }
      finally { button.setDisabled(!this.backend); }
    }));
    void this.loadAccounts();
  }

  /** Shared personal API configuration tab; edits affect OpenCodian AND ZCode desktop. */
  attachProviders(container: HTMLElement): void {
    const providers = container.createDiv({ cls: 'opencodian-zcode-group', attr: { 'data-zcode-group': 'api-services' } });
    providers.createEl('h4', { text: t('settings.zcode.ui.providers') });
    providers.createEl('p', { cls: 'setting-item-description', text: t('settings.zcode.ui.providerHelp') });
    const sharedNote = providers.createEl('p', { cls: 'setting-item-description opencodian-zcode-supporting', attr: { 'data-zcode-group': 'providers-scope' } });
    sharedNote.setText(t('settings.zcode.ui.providersScope'));
    const actions = providers.createDiv({ cls: 'opencodian-zcode-actions' });
    const add = actions.createEl('button', { text: t('settings.zcode.ui.addProvider'), attr: { type: 'button' } });
    add.disabled = !this.backend;
    add.dataset.zcodeAction = 'add';
    add.addEventListener('click', () => this.renderEditor(undefined, add));
    const reload = actions.createEl('button', { text: t('settings.zcode.ui.reloadProviders'), attr: { type: 'button' } });
    reload.disabled = !this.backend;
    reload.addEventListener('click', () => { void this.loadProviders(); });
    this.providerList = providers.createDiv({ cls: 'opencodian-zcode-provider-list' });
    this.editor = providers.createDiv({ cls: 'opencodian-zcode-editor-host' });
    this.attachHistory(providers);
    void this.loadProviders();
  }

  /** The tabbed providers tab mounts outside attach(); the section triggers the first load. */
  loadProvidersForExternalCaller(): Promise<boolean> {
    return this.loadProviders();
  }

  /**
   * Archive-backed version history for the shared configuration file. The
   * archive lives beside the native config (never in the vault); restore is
   * revision-guarded and reachable in three clicks: open -> pick -> confirm.
   * Hidden entirely when the adapter does not expose the history contract.
   */
  private attachHistory(container: HTMLElement): void {
    const service = this.backend?.getPersonalConfigService();
    if (!service?.listPersonalConfigHistory || !service.restorePersonalConfigEntry) return;
    const history = container.createEl('details', { cls: 'opencodian-zcode-disclosure', attr: { 'data-zcode-group': 'providers-history' } });
    history.createEl('summary', { text: t('settings.zcode.ui.history.title') });
    const body = history.createDiv({ cls: 'opencodian-zcode-disclosure-body' });
    body.createEl('p', { cls: 'setting-item-description', text: t('settings.zcode.ui.history.help') });
    this.historyList = body.createDiv({ cls: 'opencodian-zcode-provider-list', attr: { 'data-zcode-group': 'providers-history-list' } });
    history.addEventListener('toggle', () => {
      if (history.open && this.historyList && !this.historyList.childElementCount) void this.loadHistory();
    });
  }

  private async loadHistory(): Promise<void> {
    const list = this.historyList;
    const service = this.backend?.getPersonalConfigService();
    if (!list || !service?.listPersonalConfigHistory) return;
    const epoch = ++this.historyEpoch;
    list.setText(t('settings.zcode.ui.history.loading'));
    try {
      const entries = await service.listPersonalConfigHistory();
      if (epoch !== this.historyEpoch || !list.isConnected) return;
      list.empty();
      if (!entries?.length) {
        list.createEl('p', { cls: 'setting-item-description', text: t('settings.zcode.ui.history.empty') });
        return;
      }
      for (const entry of entries) this.historyRow(entry);
    } catch {
      if (epoch === this.historyEpoch && list.isConnected) list.setText(t('settings.zcode.ui.history.failed'));
    }
  }

  private historyRow(entry: ArchiveHistoryEntrySummary): void {
    const list = this.historyList as HTMLElement;
    const row = new Setting(list)
      .setName(t('settings.zcode.ui.history.entryName', { date: new Date(entry.timestamp).toLocaleString() }))
      .setDesc(t('settings.zcode.ui.history.entryDetail', { size: String(entry.size) }));
    row.addButton((button) => {
      button.setButtonText(t('settings.zcode.ui.history.restore')).onClick(() => {
        this.confirmHistoryRestore(entry, button.buttonEl);
      });
    });
  }

  /** Three clicks total: disclosure open, Restore, Confirm restore. */
  private confirmHistoryRestore(entry: ArchiveHistoryEntrySummary, trigger: HTMLButtonElement): void {
    const list = this.historyList;
    if (!list || !this.backend?.getPersonalConfigService().restorePersonalConfigEntry) return;
    const confirmHost = list.createDiv({ cls: 'opencodian-zcode-editor-host', attr: { 'data-zcode-group': 'providers-history-confirm' } });
    confirmHost.createEl('p', { cls: 'setting-item-description', text: t('settings.zcode.ui.history.confirmHelp') });
    const actions = confirmHost.createDiv({ cls: 'opencodian-zcode-actions' });
    const confirm = actions.createEl('button', { cls: 'mod-cta', text: t('settings.zcode.ui.history.confirmRestore'), attr: { type: 'button' } });
    const cancel = actions.createEl('button', { text: t('settings.zcode.ui.cancel'), attr: { type: 'button' } });
    cancel.addEventListener('click', () => { confirmHost.empty(); trigger.focus(); });
    confirm.addEventListener('click', () => {
      confirm.disabled = true; cancel.disabled = true;
      void this.restoreHistoryEntry(entry, confirmHost).finally(() => {
        if (confirmHost.isConnected) { confirm.disabled = false; cancel.disabled = false; }
      });
    });
    confirm.focus();
  }

  private async restoreHistoryEntry(entry: ArchiveHistoryEntrySummary, confirmHost: HTMLElement): Promise<void> {
    const service = this.backend?.getPersonalConfigService();
    if (!service?.restorePersonalConfigEntry) return;
    const expected = this.snapshot?.revision ?? null;
    try {
      const result = await service.restorePersonalConfigEntry(entry.identity, expected);
      if (!confirmHost.isConnected) return;
      if (result.status !== 'success') {
        const message = confirmHost.createEl('p', { text: result.status === 'conflict' ? t('settings.zcode.ui.conflict') : t('settings.zcode.ui.history.failed'), attr: { role: 'alert' } });
        if (result.status === 'conflict') {
          const reload = message.createEl('button', { text: t('settings.zcode.ui.history.reloadAndRetry'), attr: { type: 'button' } });
          reload.addEventListener('click', () => {
            reload.disabled = true;
            void this.loadProviders().then(() => this.loadHistory());
          });
        }
        return;
      }
      confirmHost.createEl('p', { cls: 'setting-item-description', text: t('settings.zcode.ui.history.restored'), attr: { role: 'status' } });
      const outcome = await this.applyChanges();
      if (confirmHost.isConnected && outcome !== 'applied') confirmHost.createEl('p', { cls: 'setting-item-description', text: t('settings.zcode.ui.reconnectNeeded') });
      await this.loadProviders();
      await this.loadHistory();
    } catch (error) {
      if (confirmHost.isConnected) confirmHost.createEl('p', { text: zcodeSettingsError(error), attr: { role: 'alert' } });
    }
  }

  private async loadAccounts(): Promise<void> {
    if (!this.account?.isConnected) return;
    if (!this.backend) { this.account.setText(t('settings.zcode.ui.connectionIdle')); return; }
    const snapshot = await this.backend.accounts.read();
    if (!this.account.isConnected) return;
    const signingKey = snapshot.state === 'signing-in' ? snapshot.authorizeUrl ?? 'waiting' : '';
    if (signingKey && this.account.dataset.signingKey === signingKey) {
      setTimeout(() => { if (this.account.isConnected) void this.loadAccounts(); }, 250);
      return;
    }
    this.account.dataset.signingKey = signingKey;
    this.account.empty();
    if (snapshot.state === 'signing-in') {
      this.account.createEl('p', { cls: 'setting-item-description', text: t('settings.zcode.ui.signingIn'), attr: { role: 'status' } });
      const cancel = this.account.createEl('button', { text: t('settings.zcode.ui.cancelLogin'), attr: { type: 'button' } });
      cancel.addEventListener('click', () => { cancel.disabled = true; this.backend?.accounts.cancelLogin(); });
      if (snapshot.authorizeUrl) this.account.createEl('a', { text: t('settings.zcode.ui.openAuthorization'), href: snapshot.authorizeUrl, attr: { target: '_blank', rel: 'noopener noreferrer' } });
      setTimeout(() => { if (this.account.isConnected) void this.loadAccounts(); }, 250);
      return;
    }
    this.account.createEl('p', { cls: 'setting-item-description', text: snapshot.state === 'unreadable' ? t('settings.zcode.ui.accountUnreadable')
      : snapshot.accounts.length ? snapshot.accounts.map((item) => `${item.family === 'bigmodel' ? '智谱 / BigModel' : 'Z.AI'} · ${item.name}`).join(' · ')
        : t('settings.zcode.ui.signedOut') });
    const actions = this.account.createDiv({ cls: 'opencodian-zcode-actions' });
    for (const family of ['bigmodel', 'zai'] as const) {
      const login = actions.createEl('button', { text: t(`settings.zcode.ui.login.${family}`), attr: { type: 'button' } });
      login.addEventListener('click', () => { void this.login(family); });
    }
    if (snapshot.accounts.length) {
      const logout = actions.createEl('button', { text: t('settings.zcode.ui.logout'), attr: { type: 'button' } });
      logout.addEventListener('click', () => this.confirmLogout(actions));
    }
  }

  private async login(family: ZCodeAccountFamily): Promise<void> {
    if (!this.backend) return;
    this.account.empty(); this.accountFeedback.setText('');
    this.account.createEl('p', { cls: 'setting-item-description', text: t('settings.zcode.ui.signingIn'), attr: { role: 'status' } });
    const actions = this.account.createDiv({ cls: 'opencodian-zcode-actions' });
    const cancel = actions.createEl('button', { text: t('settings.zcode.ui.cancelLogin'), attr: { type: 'button' } });
    cancel.addEventListener('click', () => { cancel.disabled = true; this.backend?.accounts.cancelLogin(); });
    let url = '';
    try {
      await this.backend.accounts.login(family, ({ authorizeUrl }) => {
        if (url === authorizeUrl || !this.account.isConnected) return;
        url = authorizeUrl;
        const open = actions.createEl('a', { text: t('settings.zcode.ui.openAuthorization'), href: url, attr: { target: '_blank', rel: 'noopener noreferrer' } });
        open.addClass('opencodian-zcode-action-link');
        const copy = actions.createEl('button', { text: t('settings.zcode.ui.copyAuthorization'), attr: { type: 'button' } });
        copy.addEventListener('click', () => { void this.account.ownerDocument.defaultView?.navigator.clipboard.writeText(url).then(() => this.accountFeedback.setText(t('settings.zcode.ui.copied'))).catch(() => this.accountFeedback.setText(t('settings.zcode.ui.operationFailed'))); });
        this.account.ownerDocument.defaultView?.open(url, '_blank', 'noopener,noreferrer');
      });
      const outcome = await this.applyChanges();
      if (this.account.isConnected) this.accountFeedback.setText(t(outcome === 'applied' ? 'settings.zcode.ui.loggedIn' : outcome === 'reconnect' ? 'settings.zcode.ui.loginReconnectNeeded' : 'settings.zcode.ui.loginReadbackFailed'));
    } catch (error) { if (this.account.isConnected) this.accountFeedback.setText(zcodeSettingsError(error)); }
    finally {
      if (this.account.isConnected) { await this.loadAccounts(); this.account.querySelector<HTMLButtonElement>('button')?.focus(); }
    }
  }

  private confirmLogout(actions: HTMLElement): void {
    actions.empty();
    actions.createEl('p', { cls: 'setting-item-description', text: t('settings.zcode.ui.logoutHelp') });
    const confirm = actions.createEl('button', { text: t('settings.zcode.ui.confirmLogout'), attr: { type: 'button' } });
    const cancel = actions.createEl('button', { text: t('settings.zcode.ui.cancel'), attr: { type: 'button' } });
    cancel.addEventListener('click', () => { void this.loadAccounts().then(() => this.account.querySelector<HTMLButtonElement>('button:last-child')?.focus()); });
    confirm.focus();
    confirm.addEventListener('click', () => {
      confirm.disabled = true; cancel.disabled = true;
      void this.backend?.accounts.logout().then(async () => {
        const outcome = await this.applyChanges();
        if (this.account.isConnected) this.accountFeedback.setText(t(outcome === 'applied' ? 'settings.zcode.ui.loggedOut' : 'settings.zcode.ui.logoutPending'));
      }).catch((error: unknown) => { if (this.account.isConnected) this.accountFeedback.setText(zcodeSettingsError(error)); })
        .finally(async () => {
          if (this.account.isConnected) {
            await this.loadAccounts();
            this.account.querySelector<HTMLButtonElement>('button')?.focus();
          }
        });
    });
  }

  private async loadProviders(): Promise<boolean> {
    if (!this.providerList?.isConnected) return false;
    const epoch = ++this.loadEpoch;
    this.providerList.setText(t('settings.zcode.ui.providerLoading'));
    try {
      if (!this.backend) throw new Error('zcode-login-runtime-unavailable');
      const snapshot = await this.backend.getPersonalConfigService().read();
      if (epoch !== this.loadEpoch || !this.providerList.isConnected) return false;
      this.snapshot = snapshot;
      this.providerList.empty();
      if (!snapshot.providers.length) this.providerList.createEl('p', { cls: 'setting-item-description', text: t('settings.zcode.ui.noProviders') });
      for (const provider of snapshot.providers) this.providerRow(provider);
      return true;
    } catch (error) {
      if (epoch === this.loadEpoch && this.providerList.isConnected) this.providerList.setText(zcodeSettingsError(error));
      return false;
    }
  }

  private providerRow(provider: ZCodePersonalProvider): void {
    const row = new Setting(this.providerList).setName(provider.name)
      .setDesc(provider.editable ? t('settings.zcode.ui.providerModelCount', { baseUrl: provider.baseUrl, count: provider.models.length }) : t('settings.zcode.ui.providerReadonly'));
    describeBackendSetting(row, {
      key: `zcode-provider-${provider.id}`,
      scope: 'shared',
      effect: 'new-session',
      risk: 'high',
      source: t('settings.zcode.ui.providerSource'),
    });
    if (!provider.editable) return;
    const description = row.settingEl.querySelector<HTMLElement>('.setting-item-description');
    if (provider.models.length && description) {
      const label = t('settings.zcode.ui.namedProviderModels', { name: provider.name });
      const models = description.createEl('details', { cls: 'opencodian-zcode-disclosure opencodian-zcode-provider-models' });
      models.createEl('summary', { text: t('settings.zcode.ui.viewProviderModels'), attr: { 'aria-label': label } });
      const scroll = models.createDiv({ cls: 'opencodian-settings-scrollarea opencodian-zcode-provider-models-scrollarea' });
      const viewport = scroll.createDiv({ cls: 'opencodian-settings-scrollarea-viewport', attr: { tabindex: '0', 'aria-label': label } });
      const list = viewport.createEl('ul', { cls: 'opencodian-settings-scrollarea-content' });
      for (const model of provider.models) list.createEl('li', { text: model });
    }
    row.addButton((button) => {
      button.buttonEl.setAttribute('aria-label', t('settings.zcode.ui.editNamedProvider', { name: provider.name }));
      button.setButtonText(t('settings.zcode.ui.editProvider')).onClick(() => this.renderEditor(provider, button.buttonEl));
    });
    row.addButton((button) => {
      button.buttonEl.setAttribute('aria-label', t('settings.zcode.ui.removeNamedProvider', { name: provider.name }));
      button.setButtonText(t('settings.zcode.ui.removeProvider')).onClick(() => {
      const expected = this.snapshot?.revision ?? null;
      this.editor.empty();
      this.editor.createEl('p', { cls: 'setting-item-description', text: `${provider.name} — ${t('settings.zcode.ui.removeHelp')}` });
      const confirm = this.editor.createEl('button', { text: t('settings.zcode.ui.confirmRemove'), attr: { type: 'button' } });
      const cancel = this.editor.createEl('button', { text: t('settings.zcode.ui.cancel'), attr: { type: 'button' } });
      cancel.addEventListener('click', () => { this.editor.empty(); button.buttonEl.focus(); });
      confirm.addEventListener('click', () => {
        confirm.disabled = true; cancel.disabled = true;
        void this.removeProvider(provider.id, expected).finally(() => { confirm.disabled = false; cancel.disabled = false; });
      });
      confirm.focus();
      });
    });
  }

  private async removeProvider(id: string, expected: ZCodePersonalConfigSnapshot['revision']): Promise<void> {
    if (!this.backend || !this.snapshot) return;
    try {
      const result = await this.backend.getPersonalConfigService().remove(id, expected);
      if (result.status !== 'success') {
        this.editor.createEl('p', { text: t(result.status === 'conflict' ? 'settings.zcode.ui.conflict' : 'settings.zcode.ui.operationFailed'), attr: { role: 'alert' } });
        if (result.status === 'conflict') {
          const reload = this.editor.createEl('button', { text: t('settings.zcode.ui.reloadBeforeRemove'), attr: { type: 'button' } });
          reload.addEventListener('click', () => { void this.loadProviders().then((loaded) => { if (loaded) { this.editor.empty(); this.root?.querySelector<HTMLButtonElement>('[data-zcode-action=add]')?.focus(); } }); });
        }
        return;
      }
      this.editor.empty();
      await this.loadProviders();
      await this.applyChanges();
      this.root?.querySelector<HTMLButtonElement>('[data-zcode-action=add]')?.focus();
    } catch (error) { if (this.editor.isConnected) this.editor.createEl('p', { text: zcodeSettingsError(error), attr: { role: 'alert' } }); }
  }

  private renderEditor(provider?: ZCodePersonalProvider, trigger?: HTMLButtonElement): void {
    this.editor.empty();
    const form = this.editor.createDiv({ cls: 'opencodian-zcode-provider-form', attr: { 'data-zcode-group': 'api-editor' } });
    form.createEl('h5', { text: provider ? `${t('settings.zcode.ui.editProvider')} · ${provider.name}` : t('settings.zcode.ui.addProvider') });
    form.createEl('p', { cls: 'setting-item-description', text: t('settings.zcode.ui.providerHelp') });
    form.createEl('p', { cls: 'setting-item-description opencodian-zcode-supporting', text: t('settings.zcode.ui.providersScope') });
    let name = provider?.name ?? '', protocol = (provider?.protocol ?? 'openai-chat-completions') as ZCodeProviderDraft['protocol'];
    let baseUrl = provider?.baseUrl ?? '', key = '', models = provider?.models.join('\n') ?? '';
    const initialRevision = this.snapshot?.revision ?? null;
    const text = (label: Parameters<typeof t>[0], value: string, changed: (value: string) => void, password = false) => {
      new Setting(form).setName(t(label)).addText((control) => {
        control.setValue(value).onChange(changed);
        control.inputEl.setAttribute('aria-label', t(label));
        control.inputEl.dataset.zcodeConfigField = label.split('.').pop();
        if (password) { control.inputEl.type = 'password'; control.inputEl.autocomplete = 'new-password'; control.setPlaceholder(t(provider?.hasApiKey ? 'settings.zcode.ui.keyKeep' : 'settings.zcode.ui.keyRequired')); }
      });
    };
    text('settings.zcode.ui.providerName', name, (value) => { name = value; });
    new Setting(form).setName(t('settings.zcode.ui.protocol')).addDropdown((control) => {
      for (const [value, label] of [['openai-chat-completions', 'OpenAI Chat Completions'], ['openai-responses', 'OpenAI Responses'], ['anthropic-messages', 'Anthropic Messages']]) control.addOption(value, label);
      control.selectEl.setAttribute('aria-label', t('settings.zcode.ui.protocol'));
      control.selectEl.dataset.zcodeConfigField = 'protocol';
      control.setValue(protocol).onChange((value) => { protocol = value as ZCodeProviderDraft['protocol']; });
    });
    text('settings.zcode.ui.address', baseUrl, (value) => { baseUrl = value; });
    text('settings.zcode.ui.key', key, (value) => { key = value; }, true);
    new Setting(form).setName(t('settings.zcode.ui.models')).setDesc(t('settings.zcode.ui.modelsHelp'))
      .setClass('opencodian-wide-text-setting').addTextArea((control) => {
        control.setValue(models).onChange((value) => { models = value; });
        control.inputEl.setAttribute('aria-label', t('settings.zcode.ui.models'));
        control.inputEl.dataset.zcodeConfigField = 'models';
        control.inputEl.rows = 3;
      });
    const feedback = form.createDiv({ cls: 'opencodian-zcode-feedback', attr: { role: 'alert', id: `zcode-form-feedback-${crypto.randomUUID()}` } });
    const actions = form.createDiv({ cls: 'opencodian-zcode-actions' });
    const save = actions.createEl('button', { cls: 'mod-cta', text: t('settings.zcode.ui.saveShared'), attr: { type: 'button' } });
    const cancel = actions.createEl('button', { text: t('settings.zcode.ui.cancel'), attr: { type: 'button' } });
    cancel.addEventListener('click', () => { this.editor.empty(); (trigger?.isConnected ? trigger : this.root?.querySelector<HTMLButtonElement>('[data-zcode-action=add]'))?.focus(); });
    const submit = async (expected: ZCodePersonalConfigSnapshot['revision']) => {
      const draft: ZCodeProviderDraft = { id: provider?.id, name, protocol, baseUrl, models: models.split('\n'), ...(key || !provider?.hasApiKey ? { apiKey: key } : {}) };
      const controls = Array.from(form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement>('input, select, textarea, button'));
      controls.forEach((control) => { control.disabled = true; });
      await this.saveProvider(draft, feedback, expected, submit).then((saved) => {
        controls.forEach((control) => { control.disabled = saved; });
        cancel.disabled = false;
        if (saved) {
          save.setText(t('settings.zcode.ui.savedFile'));
          const secret = form.querySelector<HTMLInputElement>('input[type="password"]');
          if (secret) secret.value = '';
          cancel.setText(t('settings.zcode.ui.closeEditor'));
          cancel.focus();
        }
      });
    };
    save.addEventListener('click', () => { void submit(initialRevision); });
    form.querySelector<HTMLInputElement>('input')?.focus();
  }

  private async saveProvider(draft: ZCodeProviderDraft, feedback: HTMLElement, expected: ZCodePersonalConfigSnapshot['revision'], submit: (revision: ZCodePersonalConfigSnapshot['revision']) => Promise<void>): Promise<boolean> {
    if (!this.backend) return false;
    try {
      feedback.parentElement?.querySelectorAll('[aria-invalid]').forEach((field) => { field.removeAttribute('aria-invalid'); field.removeAttribute('aria-describedby'); });
      feedback.parentElement?.querySelectorAll('.opencodian-zcode-field-error').forEach((field) => field.remove());
      const result = await this.backend.getPersonalConfigService().save(draft, expected);
      if (!feedback.isConnected) return result.status === 'success';
      if (result.status !== 'success') {
        feedback.setText(t(result.status === 'conflict' ? 'settings.zcode.ui.conflict' : 'settings.zcode.ui.operationFailed'));
        if (result.status === 'conflict') {
          const reload = feedback.createEl('button', { text: t('settings.zcode.ui.reloadKeepDraft'), attr: { type: 'button' } });
          reload.addEventListener('click', () => {
            reload.disabled = true;
            void this.backend!.getPersonalConfigService().read().then((latest) => {
              if (!feedback.isConnected) return;
              feedback.setText(t('settings.zcode.ui.reloadedKeepDraft'));
              const current = latest.providers.find((provider) => provider.id === draft.id);
              const list = feedback.createEl('ul');
              if (current) for (const [field, currentValue, draftValue] of [
                ['providerName', current.name, draft.name], ['protocol', current.protocol, draft.protocol],
                ['address', current.baseUrl, draft.baseUrl], ['models', current.models.join(', '), draft.models.join(', ')],
              ]) if (currentValue !== draftValue) list.createEl('li', { text: t('settings.zcode.ui.externalField', { field: t(`settings.zcode.ui.${field}` as Parameters<typeof t>[0]), value: currentValue }) });
              if (!list.childElementCount) list.remove();
              const confirm = feedback.createEl('button', { text: t('settings.zcode.ui.confirmDraftOverwrite'), attr: { type: 'button' } });
              confirm.addEventListener('click', () => { void submit(latest.revision); });
              confirm.focus();
            }).catch((error: unknown) => { feedback.setText(zcodeSettingsError(error)); });
          });
        }
        return false;
      }
      const outcome = await this.applyChanges();
      if (feedback.isConnected) feedback.setText(t(outcome === 'applied' ? 'settings.zcode.ui.sharedSaved' : outcome === 'reconnect' ? 'settings.zcode.ui.reconnectNeeded' : 'settings.zcode.ui.savedReadbackFailed'));
      await this.loadProviders();
      return true;
    } catch (error) {
      if (feedback.isConnected) {
        feedback.setText(zcodeSettingsError(error));
        const code = error instanceof Error ? error.message : '';
        const fieldName = ({ 'zcode-provider-url-invalid': 'address', 'zcode-provider-fields-required': 'providerName', 'zcode-provider-model-required': 'models', 'zcode-provider-key-required': 'key' } as Record<string, string>)[code];
        const field = fieldName ? feedback.parentElement?.querySelector<HTMLInputElement>(`[data-zcode-config-field="${fieldName}"]`) : null;
        if (field) {
          feedback.setText('');
          const message = field.parentElement!.createDiv({ cls: 'opencodian-zcode-field-error', text: zcodeSettingsError(error), attr: { id: `${feedback.id}-field`, role: 'alert' } });
          field.setAttribute('aria-invalid', 'true'); field.setAttribute('aria-describedby', message.id);
          queueMicrotask(() => { field.disabled = false; field.focus(); });
        }
      }
      return false;
    }
  }

  private async applyChanges(): Promise<'applied' | 'reconnect' | 'failed'> {
    try {
      const result = await this.backend?.refreshConfiguration();
      if (result?.needsReconnect) return 'reconnect';
      await this.onChanged();
      return 'applied';
    } catch { await this.onChanged(); return 'failed'; }
  }
}
