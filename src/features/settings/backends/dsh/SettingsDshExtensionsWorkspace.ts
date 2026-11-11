import { randomUUID } from 'node:crypto';

import { Setting } from 'obsidian';

import type { DshNativeControlCapabilities, DshNativeExtensionMutation, DshNativeExtensionReadback } from '../../../../core/agents/backend/dsh/DshNativeControls';
import type { DshJsonObject } from '../../../../core/types/dshConfiguration';
import { dshNativeObject, dshNativeText as text } from './SettingsDshNativeFields';
import type { DshNativeSettingsHost } from './SettingsDshNativeWorkspace';

type ExtensionApplication = 'applied' | 'restart-required' | 'overridden' | 'failed' | 'cancelled';
interface ExtensionChange { application: ExtensionApplication; changed: boolean }
interface ExtensionOutcome { message: string; accepted: boolean }
interface ExtensionOperation { id: string; action: string; settled: boolean; completion: Promise<ExtensionOutcome> }
const OPERATIONS = new WeakMap<object, ExtensionOperation>();

/** High-risk native package operations stay separate from ordinary vault
 * settings. Only the backend's owned-profile proof can enable write controls. */
export class SettingsDshExtensionsWorkspace {
  private capabilities?: DshNativeControlCapabilities;
  private catalog?: DshNativeExtensionReadback;
  private subscription?: { dispose(): void };
  private generation = 0;
  private catalogRequest = 0;
  private catalogFresh = false;
  private outcome?: ExtensionOutcome;
  private get activeOperation(): ExtensionOperation | undefined { return OPERATIONS.get(this.host.draftOwner ?? this.host.getSettings()); }
  private set activeOperation(value: ExtensionOperation | undefined) {
    const owner = this.host.draftOwner ?? this.host.getSettings();
    if (value) OPERATIONS.set(owner, value); else OPERATIONS.delete(owner);
  }
  private riskAccepted = false;
  private feedback?: HTMLElement;
  private container?: HTMLElement;
  private spec = '';
  private registry = '';
  private packageVersion = '';
  private runtimeVersion = '';
  private inspected?: DshNativeExtensionReadback;
  private approvedBuilds = '';

  constructor(private readonly host: DshNativeSettingsHost) {}

  dispose(): void { this.generation += 1; this.subscription?.dispose(); }

  render(container: HTMLElement): void {
    this.dispose();
    this.container = container.createDiv({ cls: 'opencodian-dsh-extensions-workspace' });
    const generation = this.generation;
    this.subscription = this.host.getAdapter()?.subscribeToNativeControlUpdates?.(event => {
      if (generation !== this.generation || event.kind !== 'extension' || event.update.operationId !== this.activeOperation?.id || this.activeOperation?.settled) return;
      this.feedback?.setText(text(`extensions.progress.${event.update.event}`));
    });
    this.paint();
    if (this.activeOperation) void this.resumeOperation(this.activeOperation, generation);
  }

  private paint(): void {
    const container = this.container;
    if (!container) return;
    container.empty();
    container.createEl('h5', { text: text('extensions.title') });
    container.createEl('p', { cls: 'setting-item-description', text: text('extensions.desc') });
    this.feedback = container.createDiv({ cls: 'opencodian-dsh-extension-progress', attr: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' } });
    if (this.outcome) this.feedback.setText([text(`extensions.result.${this.outcome.message}`), ...this.catalogFresh ? [] : [text('extensions.result.catalogUnconfirmed')]].join(' '));
    const row = new Setting(container).setName(text('extensions.catalog')).setDesc(text(this.catalogFresh ? 'extensions.catalogLoaded' : 'extensions.unread'));
    row.addButton(button => button.setButtonText(text('refresh')).setDisabled(this.host.getSettings().transport === 'acp').onClick(async () => {
      button.setDisabled(true); this.feedback?.setText(text('loading'));
      await this.load();
    }));
    if (this.host.getSettings().transport === 'acp') {
      this.feedback.setText(text('extensions.acp')); return;
    }
    const writable = this.catalogFresh && this.capabilities?.configuration.extensions.managedProfile === true && this.catalog?.managed === true;
    container.createEl('p', { cls: 'setting-item-description', text: text(writable ? 'extensions.managed' : 'extensions.readOnly') });
    const risk = new Setting(container).setName(text('extensions.acceptRisk')).setDesc(text('extensions.risk'));
    risk.addToggle(toggle => toggle.setValue(this.riskAccepted).setDisabled(!writable || Boolean(this.activeOperation)).onChange(value => { this.riskAccepted = value; }));
    if (this.activeOperation) {
      const action = this.activeOperation;
      const cancel = new Setting(container).setName(text('extensions.running', { action: action.action }));
      cancel.addButton(button => button.setButtonText(text('extensions.cancel')).setDisabled(action.settled || !this.capabilities?.configuration.extensions.cancel || !['install', 'update'].includes(action.action)).onClick(async () => {
        const generation = this.generation;
        button.setDisabled(true);
        await this.cancelOperation(action, generation);
        if (generation === this.generation && this.activeOperation === action && !action.settled) button.setDisabled(false);
      }));
    }
    this.renderCatalog(container, writable);
    this.renderInstall(container, writable);
    this.renderExemption(container, writable);
    if (this.inspected) {
      const details = container.createEl('details', { cls: 'opencodian-dsh-native-details' });
      details.open = true;
      details.createEl('summary', { text: text('extensions.inspection') });
      details.createEl('pre', { cls: 'opencodian-dsh-native-readback', text: JSON.stringify(this.inspected, null, 2) });
    }
  }

  private async load(): Promise<boolean> {
    const generation = this.generation;
    const request = ++this.catalogRequest;
    try {
      const adapter = this.host.getAdapter();
      if (!adapter?.listNativeExtensions || !adapter.getNativeControlCapabilities) throw new Error('unavailable');
      const catalog = await adapter.listNativeExtensions();
      const capabilities = await adapter.getNativeControlCapabilities();
      if (generation !== this.generation || request !== this.catalogRequest) return false;
      this.catalog = catalog; this.capabilities = capabilities; this.catalogFresh = true; this.paint();
      return true;
    } catch {
      if (generation === this.generation && request === this.catalogRequest) {
        this.catalogFresh = false; this.paint();
        if (!this.outcome) this.feedback?.setText(text('extensions.result.catalogUnconfirmed'));
      }
      return false;
    }
  }

  private records(key: string): DshJsonObject[] {
    const entries = this.catalog?.[key];
    return Array.isArray(entries) ? entries.map(dshNativeObject).filter((entry): entry is DshJsonObject => Boolean(entry)) : [];
  }

  /** Catalog rows keep profile selection, the runtime's actual phase or
   * availability, and protection as separate localized parts. Absent public
   * fields render as unknown states; raw diagnostics never reach the UI. */
  private catalogState(record: DshJsonObject, runtime: string[]): string {
    const parts = [text(record.enabled === true ? 'extensions.enabled' : 'extensions.disabled'), ...runtime];
    if (typeof record.readOnlyReason === 'string' && record.readOnlyReason) parts.push(text('extensions.protected'));
    return parts.join(' · ');
  }

  /** The public Loader fiber phase; null means no live root fiber, and an
   * absent or unrecognized value stays explicitly unknown, never inferred. */
  private pluginPhase(fiberPhase: unknown): string {
    const phases: Record<string, string> = {
      pending: 'extensions.catalogState.pending', loading: 'extensions.catalogState.loading',
      active: 'extensions.catalogState.active', failed: 'extensions.catalogState.failed',
      unloading: 'extensions.catalogState.unloading',
    };
    const localized = typeof fiberPhase === 'string' ? phases[fiberPhase] : undefined;
    return localized ? text(localized) : fiberPhase === null ? text('extensions.catalogState.notLoaded') : text('extensions.catalogState.unknown');
  }

  private bundleAvailability(availability: unknown): string {
    const localized: Record<string, string> = {
      installation: 'extensions.catalogState.installation', profile: 'extensions.catalogState.profile',
      missing: 'extensions.catalogState.missing',
    };
    const state = typeof availability === 'string' ? localized[availability] : undefined;
    return state ? text(state) : text('extensions.catalogState.availabilityUnknown');
  }

  private renderCatalog(container: HTMLElement, writable: boolean): void {
    const list = container.createDiv({ cls: 'opencodian-dsh-extension-list' });
    const flags = this.capabilities?.configuration.extensions;
    for (const plugin of this.records('plugins')) {
      const id = typeof plugin.entryId === 'string' ? plugin.entryId : '';
      const name = typeof plugin.moduleName === 'string' ? plugin.moduleName : id;
      const row = new Setting(list).setName(name).setDesc(this.catalogState(plugin, [this.pluginPhase(plugin.fiberPhase)]));
      row.addToggle(toggle => toggle.setValue(plugin.enabled === true).setDisabled(!id || !writable || !flags?.enablePlugin || Boolean(plugin.readOnlyReason) || Boolean(this.activeOperation)).onChange(async enabled => {
        const generation = this.generation;
        const accepted = await this.mutate({ action: 'enable-plugin', id, enabled });
        if (!accepted && generation === this.generation) toggle.setValue(plugin.enabled === true);
      }));
    }
    for (const bundle of this.records('bundles')) {
      const name = typeof bundle.name === 'string' ? bundle.name : '';
      const runtime = [this.bundleAvailability(bundle.availability)];
      // A management error is shown as a generic localized state: its layer may
      // have been skipped, but the raw error and diagnostic never render.
      if (bundle.error !== undefined) runtime.push(text('extensions.catalogState.bundleError'));
      const row = new Setting(list).setName(name)
        .setDesc([typeof bundle.version === 'string' ? bundle.version : '', this.catalogState(bundle, runtime)].filter(Boolean).join(' · '));
      row.addToggle(toggle => toggle.setValue(bundle.enabled === true).setDisabled(!writable || !flags?.enableBundle || Boolean(bundle.readOnlyReason) || Boolean(this.activeOperation)).onChange(async enabled => {
        const generation = this.generation;
        const accepted = await this.mutate({ action: 'enable-bundle', name, enabled });
        if (!accepted && generation === this.generation) toggle.setValue(bundle.enabled === true);
      }));
      row.addButton(button => button.setButtonText(text('extensions.inspect')).setDisabled(!flags?.inspect).onClick(() => { void this.inspect(name); }));
      row.addButton(button => button.setButtonText(text('extensions.versions')).setDisabled(!flags?.versions).onClick(() => { void this.versions(name); }));
      const update = row.controlEl.createEl('input', { type: 'text', attr: { 'aria-label': text('extensions.targetVersion', { name }), placeholder: text('extensions.version') } });
      update.disabled = !writable || !flags?.update || bundle.updatable === false || Boolean(bundle.readOnlyReason) || Boolean(this.activeOperation);
      row.addButton(button => button.setButtonText(text('extensions.update')).setDisabled(update.disabled).onClick(() => {
        if (!update.value.trim()) { this.feedback?.setText(text('extensions.versionRequired')); return; }
        void this.mutate({ action: 'update', name, version: update.value.trim(), ...this.registryInput() });
      }));
      row.addButton(button => button.setButtonText(text('extensions.remove')).setDisabled(!writable || !flags?.remove || bundle.removable === false || Boolean(bundle.readOnlyReason) || Boolean(this.activeOperation)).onClick(() => { void this.mutate({ action: 'remove', name }); }));
    }
    if (this.catalog && !this.records('plugins').length && !this.records('bundles').length) list.createEl('p', { cls: 'setting-item-description', text: text('extensions.empty') });
  }

  private renderInstall(container: HTMLElement, writable: boolean): void {
    const details = container.createEl('details', { cls: 'opencodian-dsh-native-details' });
    details.createEl('summary', { text: text('extensions.installTitle') });
    const body = details.createDiv({ cls: 'opencodian-dsh-disclosure-body' });
    body.createEl('p', { cls: 'setting-item-description', text: text('extensions.optionalBundles') });
    new Setting(body).setName(text('extensions.spec')).addText(input => {
      input.setValue(this.spec).setPlaceholder('@scope/package@version').onChange(value => { this.spec = value; });
      input.inputEl.setAttribute('aria-label', text('extensions.spec'));
    });
    new Setting(body).setName(text('extensions.registry')).setDesc(text('extensions.registry.desc')).addText(input => {
      input.setValue(this.registry).onChange(value => { this.registry = value; });
      input.inputEl.setAttribute('aria-label', text('extensions.registry'));
    });
    new Setting(body).setName(text('extensions.approvedBuilds')).setDesc(text('extensions.approvedBuilds.desc')).addTextArea(input => {
      input.setValue(this.approvedBuilds).onChange(value => { this.approvedBuilds = value; });
      input.inputEl.setAttribute('aria-label', text('extensions.approvedBuilds')); input.inputEl.rows = 2;
    });
    const actions = new Setting(body).setName(text('extensions.packageActions'));
    actions.addButton(button => button.setButtonText(text('extensions.inspect')).setDisabled(!this.capabilities?.configuration.extensions.inspect).onClick(() => { void this.inspect(this.spec.trim()); }));
    actions.addButton(button => button.setButtonText(text('extensions.install')).setDisabled(!writable || !this.capabilities?.configuration.extensions.install || Boolean(this.activeOperation)).onClick(() => {
      if (!this.spec.trim()) { this.feedback?.setText(text('extensions.specRequired')); return; }
      void this.mutate({ action: 'install', spec: this.spec.trim(), saveExact: true, enabled: true,
        approvedBuilds: this.approvedBuilds.split('\n').map(value => value.trim()).filter(Boolean), ...this.registryInput() });
    }));
  }

  private renderExemption(container: HTMLElement, writable: boolean): void {
    const details = container.createEl('details', { cls: 'opencodian-dsh-native-details' });
    details.createEl('summary', { text: text('extensions.exemption') });
    const body = details.createDiv({ cls: 'opencodian-dsh-disclosure-body' });
    body.createEl('p', { cls: 'setting-item-description', text: text('extensions.exemption.desc') });
    new Setting(body).setName(text('extensions.packageVersion')).addText(input => {
      input.setValue(this.packageVersion).onChange(value => { this.packageVersion = value; });
      input.inputEl.setAttribute('aria-label', text('extensions.packageVersion'));
    });
    new Setting(body).setName(text('extensions.runtimeVersion')).addText(input => {
      input.setValue(this.runtimeVersion).onChange(value => { this.runtimeVersion = value; });
      input.inputEl.setAttribute('aria-label', text('extensions.runtimeVersion'));
    });
    const actions = new Setting(body).setName(text('extensions.exemption'));
    for (const enabled of [true, false]) actions.addButton(button => button.setButtonText(text(enabled ? 'extensions.exempt' : 'extensions.clearExemption')).setDisabled(!writable || !this.capabilities?.configuration.extensions.exempt || Boolean(this.activeOperation)).onClick(() => {
      if (!this.packageVersion.trim() || !this.runtimeVersion.trim()) { this.feedback?.setText(text('extensions.versionRequired')); return; }
      void this.mutate({ action: 'exempt', packageVersion: this.packageVersion.trim(), runtimeVersion: this.runtimeVersion.trim(), enabled, acceptRisk: true });
    }));
  }

  private registryInput(): DshJsonObject { return this.registry.trim() ? { registry: this.registry.trim() } : {}; }

  private async inspect(spec: string): Promise<void> {
    if (!spec) { this.feedback?.setText(text('extensions.specRequired')); return; }
    const generation = this.generation;
    try {
      const result = await this.host.getAdapter()?.inspectNativeExtension?.({ spec, ...this.registryInput() });
      if (generation === this.generation && result) { this.inspected = result; this.paint(); }
    } catch { if (generation === this.generation) this.feedback?.setText(text('extensions.failed')); }
  }

  private async versions(name: string): Promise<void> {
    const generation = this.generation;
    try {
      const result = await this.host.getAdapter()?.getNativeExtensionVersions?.({ name, ...this.registryInput() });
      if (generation === this.generation && result) { this.inspected = result; this.paint(); }
    } catch { if (generation === this.generation) this.feedback?.setText(text('extensions.failed')); }
  }

  /** True means native accepted the requested change (possibly for next start),
   * not that the running extension was verified. Visible toggles use list readback. */
  private async mutate(input: DshNativeExtensionMutation): Promise<boolean> {
    if (!this.riskAccepted) { this.feedback?.setText(text('extensions.riskRequired')); return false; }
    if (this.activeOperation) return false;
    const adapter = this.host.getAdapter();
    if (!adapter?.mutateNativeExtension || !this.catalogFresh || !this.capabilities?.configuration.extensions.managedProfile || this.catalog?.managed !== true) return false;
    const operationId = randomUUID();
    const generation = this.generation;
    let finish!: (outcome: ExtensionOutcome) => void;
    const operation: ExtensionOperation = { id: operationId, action: input.action, settled: false, completion: new Promise(resolve => { finish = resolve; }) };
    let outcome: ExtensionOutcome = { message: 'unconfirmed', accepted: false };
    this.activeOperation = operation;
    this.outcome = undefined; this.catalogFresh = false; this.catalogRequest += 1;
    this.riskAccepted = false; this.paint(); this.feedback?.setText(text('extensions.progress.started'));
    try {
      try { outcome = this.mutationOutcome(await adapter.mutateNativeExtension({ ...input, operationId }), operation); }
      catch { /* A rejected RPC cannot confirm whether the native change persisted. */ }
      operation.settled = true;
      if (generation !== this.generation) return outcome.accepted;
      await this.load();
      if (generation !== this.generation) return outcome.accepted;
      if (this.activeOperation === operation) this.activeOperation = undefined;
      this.outcome = outcome; this.paint();
      return outcome.accepted;
    } finally {
      if (this.activeOperation === operation) this.activeOperation = undefined;
      finish(outcome);
    }
  }

  /** A remounted workspace observes completion with its own generation fence. */
  private async resumeOperation(operation: ExtensionOperation, generation: number): Promise<void> {
    const outcome = await operation.completion;
    if (generation !== this.generation || this.activeOperation) return;
    await this.load();
    if (generation !== this.generation || this.activeOperation) return;
    this.outcome = outcome; this.paint();
  }

  private async cancelOperation(operation: ExtensionOperation, generation: number): Promise<void> {
    if (operation.settled || this.activeOperation !== operation) return;
    let message = 'extensions.result.cancelUnconfirmed';
    try {
      const response = await this.host.getAdapter()?.mutateNativeExtension?.({ action: 'cancel', operationId: operation.id });
      if (response?.operationId === operation.id && response.status === 'cancelled') message = 'extensions.cancelRequested';
    } catch { /* Cancellation errors contain no evidence about the main outcome. */ }
    if (generation === this.generation && this.activeOperation === operation && !operation.settled) this.feedback?.setText(text(message));
  }

  private nativeChange(value: unknown): ExtensionChange | undefined {
    const change = dshNativeObject(value);
    if (!change || typeof change.changed !== 'boolean' || typeof change.application !== 'string'
      || !['applied', 'restart-required', 'overridden', 'failed', 'cancelled'].includes(change.application)
      || typeof change.stage !== 'string' || !['install', 'enable', 'remove'].includes(change.stage)
      || typeof change.target !== 'string' || !change.target.trim()) return undefined;
    return { application: change.application as ExtensionApplication, changed: change.changed };
  }

  private changeOutcome(change?: ExtensionChange): ExtensionOutcome {
    if (!change) return { message: 'unknown', accepted: false };
    if (change.application === 'applied') return { message: change.changed ? 'applied' : 'unchanged', accepted: true };
    if (change.application === 'restart-required') return { message: 'restartRequired', accepted: true };
    return { message: change.application, accepted: false };
  }

  private mutationOutcome(response: unknown, operation: ExtensionOperation): ExtensionOutcome {
    const envelope = dshNativeObject(response);
    if (envelope?.operationId !== operation.id) return this.changeOutcome();
    if (operation.action === 'update') return this.updateOutcome(envelope.result);
    return this.changeOutcome(this.nativeChange(envelope.result));
  }

  private updateOutcome(value: unknown): ExtensionOutcome {
    const update = dshNativeObject(value);
    if (!update || typeof update.from !== 'string' || typeof update.to !== 'string'
      || typeof update.step !== 'string' || !['check', 'remove', 'install'].includes(update.step)) return this.changeOutcome();
    const change = this.nativeChange(update.result);
    if (!change) return this.changeOutcome();
    if (change.application === 'failed' || change.application === 'cancelled') {
      if (update.step === 'install' || update.restore !== undefined) return this.restoreOutcome(change.application, update.restore);
      return this.changeOutcome(change);
    }
    // A successful removal or restoration does not prove the requested update.
    if (update.step !== 'install' || update.restore !== undefined) return this.changeOutcome();
    return this.changeOutcome(change);
  }

  private restoreOutcome(application: 'failed' | 'cancelled', value: unknown): ExtensionOutcome {
    const restore = this.nativeChange(value);
    const prefix = application === 'failed' ? 'updateFailed' : 'updateCancelled';
    const suffix = restore?.application === 'applied' ? 'Restored'
      : restore?.application === 'restart-required' ? 'RestoreRestartRequired' : 'RestoreUnconfirmed';
    return { message: `${prefix}${suffix}`, accepted: false };
  }
}
