import { Setting } from 'obsidian';

import { type BackendConfigRecoveryStore,backendRecoveryIdentity, createBackendConfigRecoveryStore } from '../../../../core/agents/backend/configuration/BackendConfigRecoveryStore';
import { DSH_NATIVE_CONFIGURATION_GROUPS, dshNativeConfigurationRevision, normalizeDshNativeConfiguration } from '../../../../core/agents/backend/configuration/DshNativeConfiguration';
import type { DshNativeConfigurationReadback, DshNativeControlCapabilities, DshNativeControlUpdate, DshNativeCredentialReadback, DshNativeExtensionInput, DshNativeExtensionMutation, DshNativeExtensionReadback, DshNativeExtensionSettingsMutation, DshNativeExtensionSettingsReadback } from '../../../../core/agents/backend/dsh/DshNativeControls';
import type { DshJsonObject, DshNativeConfiguration, DshNativeConfigurationGroupDescriptor, DshNativeConfigurationNamespace } from '../../../../core/types/dshConfiguration';
import type { DshBackendSettings } from '../../../../core/types/settings';
import { t } from '../../../../i18n';
import { SettingsDshExtensionSettings } from './SettingsDshExtensionSettings';
import { SettingsDshExtensionsWorkspace } from './SettingsDshExtensionsWorkspace';
import { dshNativeObject, dshNativeText as text, renderDshNativeCredentialRow, SettingsDshNativeFields } from './SettingsDshNativeFields';
import { type DshNativeHistoryRestore, SettingsDshNativeHistory } from './SettingsDshNativeHistory';

/** Optional methods keep older/ACP clients honest; the shell intersects this
 * narrow port with its existing connection port, without widening the MCP host. */
export interface DshNativeSettingsPort {
  readonly status: 'disconnected' | 'connecting' | 'connected' | 'error';
  getNativeControlCapabilities?(): DshNativeControlCapabilities | Promise<DshNativeControlCapabilities>;
  getNativeConfiguration?(namespaces?: string[]): Promise<DshNativeConfigurationReadback>;
  getNativeCredentialDescriptors?(refs?: string[]): Promise<DshNativeCredentialReadback>;
  setNativeCredential?(ref: string, value: string): Promise<DshNativeCredentialReadback>;
  unsetNativeCredential?(ref: string): Promise<DshNativeCredentialReadback>;
  reconnectNativeConfiguration?(): Promise<unknown>;
  listNativeExtensions?(): Promise<DshNativeExtensionReadback>;
  inspectNativeExtension?(input: DshNativeExtensionInput): Promise<DshNativeExtensionReadback>;
  getNativeExtensionVersions?(input: DshNativeExtensionInput): Promise<DshNativeExtensionReadback>;
  mutateNativeExtension?(input: DshNativeExtensionMutation): Promise<DshNativeExtensionReadback>;
  mutateNativeExtensionSettings?(input: DshNativeExtensionSettingsMutation): Promise<DshNativeExtensionSettingsReadback>;
  subscribeToNativeControlUpdates?(listener: (event: DshNativeControlUpdate) => void): { dispose(): void };
  readSessionConfiguration?(sessionId?: string): Promise<{
    sessionId: string; images: boolean;
    controls: Array<{ id: string; name: string; value: string; choices: Array<{ value: string; name: string }> }>;
  }>;
}
export interface DshNativeSettingsHost {
  getSettings(): DshBackendSettings;
  getAdapter(): DshNativeSettingsPort | undefined;
  saveSettings(): Promise<void>;
  vaultPath?: string;
  recoveryBaseDir?: string;
  draftOwner?: object;
  navigateTask?(task: 'model' | 'configuration'): void;
}
export type DshNativeSettingsTask = 'model' | 'permissions' | 'context' | 'tools' | 'configuration' | 'advanced';
const TASK_GROUPS: Record<DshNativeSettingsTask, readonly DshNativeConfigurationNamespace[]> = {
  model: ['agent-default-model', 'llm-deepseek', 'llm-pi-ai'],
  permissions: ['permission', 'sandbox-policy', 'approval'],
  context: ['compaction-basic', 'skill-filesystem'],
  tools: ['tool-web', 'web', 'tool-fs'],
  configuration: [],
  advanced: ['subagent', 'tool-todo', 'tool-jobs', 'jobs', 'shell-env', 'fs-observation-policy', 'timeout-policy', 'llm-retry', 'image-offload'],
};
type NativeEvidence = DshNativeConfigurationReadback & {
  observations?: Array<{ ns: string; status: string; valueSource: string; value?: unknown }>;
};
interface GroupDraft { value: DshJsonObject; baseRevision: string; dirty: boolean; busy: boolean; raw?: string; message?: string }
interface WorkspaceState { groups: Map<DshNativeConfigurationNamespace, GroupDraft>; queue: Promise<void> }
const DRAFTS = new WeakMap<object, WorkspaceState>();
/** Select sentinel for a saved route the loaded catalog cannot confirm. It
 * never collides with opaque catalog values, which are JSON tuples and
 * therefore always start with '['. */
const SAVED_ROUTE_OPTION = '__saved__';

/** Native and ACP catalogs encode a model route as the opaque JSON tuple
 * JSON.stringify([providerId, modelId]) (see DshAdapter). Decode strictly and
 * fail closed: only exactly two nonempty strings may become a persisted route,
 * and the opaque value is never split on '/', since ids may contain slashes. */
function decodeDshModelRoute(value: string): { provider: string; model: string } | undefined {
  if (!value.startsWith('[')) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length !== 2) return undefined;
    const [provider, model] = parsed as unknown[];
    return typeof provider === 'string' && provider.length > 0 && typeof model === 'string' && model.length > 0
      ? { provider, model } : undefined;
  } catch { return undefined; }
}

/** Persistence and task navigation for the reviewed native override schema.
 * Each group owns its draft, revision, rollback and non-secret local recovery. */
export class SettingsDshNativeWorkspace {
  private readonly state: WorkspaceState;
  private readonly recovery: BackendConfigRecoveryStore;
  private readonly history: SettingsDshNativeHistory;
  private readback?: NativeEvidence;
  private capabilities?: DshNativeControlCapabilities;
  private readState: 'unread' | 'loading' | 'ready' | 'failed' = 'unread';
  private catalogState: 'pending' | 'ready' | 'failed' = 'pending';
  private models: Array<{ value: string; name: string }> = [];
  private readonly extensions: SettingsDshExtensionsWorkspace;
  private readonly extensionSettings: SettingsDshExtensionSettings;
  private generation = 0;
  private mount?: { container: HTMLElement; task: DshNativeSettingsTask };
  private subscription?: { dispose(): void };

  constructor(private readonly host: DshNativeSettingsHost) {
    const owner = host.draftOwner ?? host.getSettings();
    this.state = DRAFTS.get(owner) ?? { groups: new Map(), queue: Promise.resolve() };
    DRAFTS.set(owner, this.state);
    this.recovery = createBackendConfigRecoveryStore({ baseDir: host.recoveryBaseDir });
    this.history = new SettingsDshNativeHistory({ vaultPath: host.vaultPath, recovery: this.recovery,
      saved: () => this.saved(), draft: namespace => this.state.groups.get(namespace) ?? this.draft(namespace),
      save: (namespace, restore) => this.saveGroup(namespace, restore), redraw: () => this.redraw(),
    });
    this.extensions = new SettingsDshExtensionsWorkspace(host);
    this.extensionSettings = new SettingsDshExtensionSettings(host);
  }

  render(container: HTMLElement, task: DshNativeSettingsTask): void {
    this.mount = { container, task };
    this.generation += 1;
    this.subscription?.dispose();
    this.subscription = undefined;
    this.extensions.dispose();
    container.empty();
    container.addClass('opencodian-dsh-native-workspace');
    container.createEl('h4', { cls: 'opencodian-settings-subsection-heading', text: text(`task.${task}`) });
    container.createEl('p', { cls: 'opencodian-dsh-section-description', text: text(`task.${task}.desc`) });
    this.renderEvidence(container);
    if (task === 'permissions') this.renderPlanDefault(container);
    for (const namespace of TASK_GROUPS[task]) {
      const descriptor = DSH_NATIVE_CONFIGURATION_GROUPS.find(group => group.namespace === namespace);
      if (descriptor) this.renderGroup(container, descriptor);
    }
    if (task === 'configuration') {
      this.renderReadback(container);
      this.renderSessionDefaults(container);
      this.extensions.render(container);
    }
    if (task === 'advanced') this.renderAdvancedLinks(container);
    const generation = this.generation;
    this.subscription = this.host.getAdapter()?.subscribeToNativeControlUpdates?.(event => {
      if (generation !== this.generation) return;
      if (event.kind === 'invalidated') { this.readback = undefined; this.capabilities = undefined; this.readState = 'unread'; }
      if (event.kind === 'configuration') { this.readback = event.readback; this.readState = 'ready'; }
      // Do not redraw fields on notifications: focus and an in-progress secret
      // input belong to the current task. Refresh is explicit and local.
    });
  }

  dispose(): void {
    this.generation += 1;
    this.subscription?.dispose();
    this.extensions.dispose();
  }

  /** Content-sized cross-task links for the advanced page. Navigation stays in
   * the existing tab shell: the host swaps the mounted secondary tab, so drafts
   * (keyed by the shared draft owner) survive the switch. Rendered only when a
   * tabbed host wired `navigateTask`; the stacked section surface has no tab
   * bar and therefore renders no dead links. Provider request reliability and
   * per-provider image budgets stay in the single provider editor on the model
   * task; optional official terminal bundles install from the configuration
   * task's extension manager. */
  private renderAdvancedLinks(container: HTMLElement): void {
    const navigate = this.host.navigateTask;
    if (!navigate) return;
    const note = container.createEl('p', { cls: 'opencodian-dsh-section-description', attr: { 'data-native-task-links': 'advanced' } });
    for (const target of ['model', 'configuration'] as const) {
      const anchor = note.createEl('a', { text: text(`taskLinks.${target}`), attr: { href: '#' } });
      anchor.addEventListener('click', event => { event.preventDefault(); navigate(target); });
    }
  }

  private saved(): DshNativeConfiguration {
    return normalizeDshNativeConfiguration(this.host.getSettings().nativeConfig);
  }

  private groupRevision(namespace: DshNativeConfigurationNamespace, value: unknown): string {
    return dshNativeConfigurationRevision(normalizeDshNativeConfiguration({ version: 1, overrides: value === undefined ? {} : { [namespace]: value } }));
  }

  private draft(namespace: DshNativeConfigurationNamespace): GroupDraft {
    const saved = this.saved().overrides[namespace];
    const revision = this.groupRevision(namespace, saved);
    let draft = this.state.groups.get(namespace);
    if (!draft || (!draft.dirty && !draft.busy && draft.baseRevision !== revision)) {
      draft = { value: JSON.parse(JSON.stringify(saved ?? {})) as DshJsonObject, baseRevision: revision, dirty: false, busy: false };
      this.state.groups.set(namespace, draft);
    }
    return draft;
  }

  private redraw(): void {
    if (this.mount) this.render(this.mount.container, this.mount.task);
  }

  private renderPlanDefault(container: HTMLElement): void {
    const acp = this.host.getSettings().transport === 'acp';
    const generation = this.generation;
    const row = new Setting(container).setName(text('planDefault.title')).setDesc(text(acp ? 'planDefault.acp' : 'planDefault.desc'));
    row.settingEl.addClass('opencodian-dsh-form-row'); row.settingEl.dataset.nativePlanDefault = 'true';
    const select = row.controlEl.createEl('select', { cls: 'dropdown', attr: { 'aria-label': text('planDefault.title') } });
    for (const value of ['', 'true', 'false']) select.createEl('option', { attr: { value }, text: text(value === '' ? 'planDefault.inherit' : value === 'true' ? 'planDefault.on' : 'planDefault.off') });
    const selected = (): string => this.host.getSettings().defaultPlanMode === undefined ? '' : String(this.host.getSettings().defaultPlanMode);
    select.value = selected(); select.disabled = acp;
    const feedback = row.infoEl.createDiv({ cls: 'opencodian-dsh-field-feedback', attr: { role: 'status', 'aria-live': 'polite' } });
    select.addEventListener('change', () => {
      if (select.disabled || this.host.getSettings().transport === 'acp') { select.value = selected(); return; }
      const expected = this.host.getSettings().defaultPlanMode;
      const next = select.value === '' ? undefined : select.value === 'true';
      select.disabled = true;
      const operation = async (): Promise<void> => {
        const settings = this.host.getSettings();
        let message = 'planDefault.saved';
        if (settings.defaultPlanMode !== expected || settings.transport === 'acp') message = 'planDefault.conflict';
        else {
          if (next === undefined) delete settings.defaultPlanMode; else settings.defaultPlanMode = next;
          try { await this.host.saveSettings(); }
          catch { if (settings.defaultPlanMode === next) { if (expected === undefined) delete settings.defaultPlanMode; else settings.defaultPlanMode = expected; } message = 'planDefault.failed'; }
        }
        if (generation !== this.generation) return;
        select.value = selected(); select.disabled = this.host.getSettings().transport === 'acp'; feedback.setText(text(message));
      };
      this.state.queue = this.state.queue.then(operation, operation);
    });
  }

  private renderEvidence(container: HTMLElement): void {
    const acp = this.host.getSettings().transport === 'acp';
    const row = new Setting(container).setName(text('application')).setDesc(text(acp ? 'application.acp' : 'application.native'));
    row.settingEl.addClass('opencodian-dsh-form-row', 'opencodian-dsh-native-evidence');
    const status = row.infoEl.createDiv({ cls: 'opencodian-dsh-field-feedback', attr: { role: 'status', 'aria-live': 'polite' } });
    const revision = dshNativeConfigurationRevision(this.saved());
    const applied = this.readback?.appliedRevision;
    status.setText(text(acp ? 'readback.acp' : this.readState === 'failed' ? 'readback.failed' : applied === revision ? 'readback.applied' : applied ? 'readback.pending' : 'readback.unavailable'));
    // Native-only RPCs stay disabled on ACP and re-check the live transport and
    // render generation in the callback, so a transport change or a disposed
    // page never turns a stale click into an RPC or a false failure. Buttons
    // re-enable only while this render is still mounted and native.
    const generation = this.generation;
    const nativeOnly = (): boolean => this.host.getSettings().transport !== 'native';
    const stale = (): boolean => generation !== this.generation || nativeOnly();
    row.addButton(button => button.setButtonText(text('refresh')).setDisabled(acp).onClick(async () => {
      if (stale()) return;
      button.setDisabled(true); status.setText(text('loading'));
      try { await this.refresh(); }
      finally { if (generation === this.generation && !nativeOnly()) button.setDisabled(false); }
    }));
    row.addButton(button => button.setButtonText(text('reconnect')).setDisabled(acp || !this.host.getAdapter()?.reconnectNativeConfiguration).onClick(async () => {
      if (stale()) return;
      button.setDisabled(true); status.setText(text('reconnecting'));
      try {
        await this.host.getAdapter()?.reconnectNativeConfiguration?.();
        if (nativeOnly()) { this.readback = undefined; status.setText(text('readback.acp')); return; }
        if (generation === this.generation) await this.refresh();
      } catch { if (generation === this.generation && !nativeOnly()) status.setText(text('reconnectFailed')); }
      finally { if (generation === this.generation && !nativeOnly()) button.setDisabled(false); }
    }));
  }

  private async refresh(): Promise<void> {
    const generation = this.generation;
    const adapter = this.host.getAdapter();
    this.readState = 'loading';
    try {
      if (!adapter?.getNativeConfiguration || this.host.getSettings().transport === 'acp') throw new Error('unavailable');
      const readback = await adapter.getNativeConfiguration();
      const capabilities = await adapter.getNativeControlCapabilities?.();
      if (generation !== this.generation) return;
      this.readback = readback; this.capabilities = capabilities; this.readState = 'ready';
      try {
        const catalog = await adapter.readSessionConfiguration?.();
        if (generation !== this.generation) return;
        this.models = catalog?.controls.find(control => control.id === 'model')?.choices ?? [];
        this.catalogState = catalog ? 'ready' : 'failed';
      } catch { this.catalogState = 'failed'; }
    } catch { if (generation === this.generation) this.readState = 'failed'; }
    if (generation === this.generation) this.redraw();
  }

  private renderGroup(container: HTMLElement, descriptor: DshNativeConfigurationGroupDescriptor): void {
    const namespace = descriptor.namespace;
    const group = container.createDiv({ cls: 'opencodian-dsh-native-group', attr: { 'data-native-namespace': namespace } });
    group.createEl('h5', { text: text(`group.${namespace}`) });
    if (descriptor.configuration === 'none') {
      group.createEl('p', { cls: 'setting-item-description', text: text('noFields') });
      return;
    }
    const draft = this.draft(namespace);
    const native = this.readback?.forms.find(form => form.ns === namespace);
    const base = dshNativeObject(native?.base) ?? {};
    const feedback = group.createDiv({ cls: 'opencodian-dsh-field-feedback', attr: { role: 'status', 'aria-live': 'polite' } });
    feedback.setText(text(draft.message ?? (draft.dirty ? 'draft' : 'groupScope')));
    const observation = this.readback?.observations?.find(item => item.ns === namespace);
    if (observation) {
      const match = observation.status === 'verified' ? this.matchesObserved(this.saved().overrides[namespace], observation.value) : undefined;
      group.createEl('p', { cls: 'setting-item-description', text: text(observation.status !== 'verified' ? 'observation.unavailable'
        : match === true ? 'observation.match' : match === false ? 'observation.mismatch' : 'observation.verified') });
    }
    const rawNotice = group.createDiv({ cls: 'opencodian-dsh-field-feedback', attr: { role: 'status', 'aria-live': 'polite' } });
    const fields = group.createDiv({ cls: 'opencodian-dsh-native-fields' });
    const update = (transaction: boolean): void => {
      // Captured controls from an earlier rendering must never replace a raw
      // draft. The JSON remains authoritative until explicit save or discard.
      if (draft.raw !== undefined || draft.busy) return;
      const wasDirty = draft.dirty;
      draft.dirty = true; draft.message = 'draft';
      feedback.setText(text('draft'));
      if (!transaction && !wasDirty) {
        fields.setAttribute('inert', '');
        void this.saveGroup(namespace).then(() => this.redraw());
      }
    };
    if (namespace === 'agent-default-model') this.renderDefaultModel(fields, draft, update);
    else new SettingsDshNativeFields({ fields: descriptor.fields, value: draft.value, base, change: update,
      credential: (holder, ref, header) => this.renderCredential(holder, ref, header),
    }).render(fields);
    const actions = group.createDiv({ cls: 'opencodian-dsh-native-actions' });
    const save = actions.createEl('button', { text: text('saveGroup'), attr: { type: 'button' } });
    save.disabled = draft.busy;
    save.addEventListener('click', () => { void this.saveGroup(namespace).then(() => this.redraw()); });
    const discard = actions.createEl('button', { text: text('discard'), attr: { type: 'button' } });
    discard.disabled = draft.busy;
    discard.addEventListener('click', () => { this.state.groups.delete(namespace); this.redraw(); });
    const reset = actions.createEl('button', { text: text('resetGroup'), attr: { type: 'button' } });
    reset.disabled = draft.busy;
    reset.addEventListener('click', () => {
      if (draft.raw !== undefined || draft.busy) return;
      draft.value = {}; draft.dirty = true;
      void this.saveGroup(namespace).then(() => this.redraw());
    });
    const history = group.createDiv();
    const generation = this.generation;
    this.history.render(history, namespace, () => generation === this.generation);
    const refreshRawLock = this.guardRawDraft(draft, { fields, history, reset, notice: rawNotice });
    const raw = group.createDiv();
    group.insertBefore(raw, history);
    this.renderRaw(raw, draft, refreshRawLock);
    refreshRawLock();
  }

  private guardRawDraft(draft: GroupDraft, controls: { fields: HTMLElement; history: HTMLElement; reset: HTMLButtonElement; notice: HTMLElement }): () => void {
    for (const container of [controls.fields, controls.history]) {
      for (const event of ['input', 'change', 'click']) container.addEventListener(event, e => {
        if (draft.raw === undefined && !draft.busy) return;
        e.preventDefault();
        e.stopImmediatePropagation();
      }, true);
    }
    return () => {
      const locked = draft.raw !== undefined;
      controls.notice.setText(locked ? text('raw.locked') : '');
      controls.reset.disabled = locked || draft.busy;
      if (!locked && !draft.busy) return;
      for (const container of [controls.fields, controls.history]) {
        container.setAttribute('inert', '');
        container.setAttribute('aria-disabled', 'true');
        for (const control of container.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement>('input,select,textarea,button')) control.disabled = true;
      }
    };
  }

  private renderDefaultModel(container: HTMLElement, draft: GroupDraft, change: (transaction: boolean) => void): void {
    const provider = typeof draft.value.provider === 'string' ? draft.value.provider : '';
    const model = typeof draft.value.model === 'string' ? draft.value.model : '';
    const saved = provider && model ? { provider, model } : undefined;
    // Catalog option values stay opaque. The saved route is matched by decoded
    // tuple identity — never by label and never by splitting on '/', since
    // provider and model ids may themselves contain slashes.
    const matched = saved ? this.models
      .map(choice => ({ choice, route: decodeDshModelRoute(choice.value) }))
      .find(entry => entry.route?.provider === saved.provider && entry.route?.model === saved.model)
      : undefined;
    const selected = matched ? matched.choice.value : saved ? SAVED_ROUTE_OPTION : '';
    const row = new Setting(container).setName(text('defaultModel')).setDesc(text(this.catalogState === 'pending' ? 'modelsPending' : this.catalogState === 'failed' ? 'modelsFailed' : 'defaultModel.desc'));
    const select = row.controlEl.createEl('select', { cls: 'dropdown', attr: { 'aria-label': text('defaultModel') } });
    select.createEl('option', { attr: { value: '' }, text: text('inherit') });
    for (const choice of this.models) select.createEl('option', { attr: { value: choice.value }, text: choice.name });
    if (selected === SAVED_ROUTE_OPTION) select.createEl('option', { attr: { value: SAVED_ROUTE_OPTION }, text: text(this.catalogState === 'ready' ? 'savedUnknown' : 'savedPending', { value: `${provider}/${model}` }) });
    select.createEl('option', { attr: { value: '__custom__' }, text: text('customModel') });
    select.value = selected;
    const custom = container.createDiv({ cls: 'opencodian-dsh-native-model-custom' });
    const initialCustomHidden = Boolean(selected) || (!provider && !model);
    custom.hidden = initialCustomHidden;
    const fields = DSH_NATIVE_CONFIGURATION_GROUPS.find(group => group.namespace === 'agent-default-model')!.fields;
    new SettingsDshNativeFields({ fields: fields.filter(field => field.path !== 'reasoningEffort'), value: draft.value, base: {}, transaction: true,
      change: () => change(true), credential: () => {}, }).render(custom);
    select.addEventListener('change', () => {
      custom.hidden = select.value !== '__custom__';
      if (select.value === '__custom__') return;
      if (!select.value) { delete draft.value.provider; delete draft.value.model; }
      else {
        // The unknown-saved sentinel and unusable catalog values stay
        // display-only: fall back to the persisted selection instead of
        // persisting a malformed route.
        const route = select.value === SAVED_ROUTE_OPTION ? undefined : decodeDshModelRoute(select.value);
        if (!route) { select.value = selected; custom.hidden = initialCustomHidden; return; }
        draft.value.provider = route.provider; draft.value.model = route.model;
      }
      change(false);
    });
    new SettingsDshNativeFields({ fields: fields.filter(field => field.path === 'reasoningEffort').map(field => ({ ...field,
      type: 'enum' as const, enumValues: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
    })), value: draft.value, base: {}, change, credential: () => {} }).render(container);
  }

  /** Queue all writes sharing a host. CAS is group-local, so another task can
   * save without invalidating an unrelated draft. Rollback never drops its edit. */
  async saveGroup(namespace: DshNativeConfigurationNamespace, restore?: DshNativeHistoryRestore): Promise<boolean> {
    const draft = this.draft(namespace);
    if (draft.busy) return false;
    draft.busy = true;
    let success = false;
    const operation = async (): Promise<void> => {
      try {
        if (restore && !restore.current()) { draft.message = 'history.conflict'; return; }
        const current = this.saved();
        if (this.groupRevision(namespace, current.overrides[namespace]) !== (restore?.expectedRevision ?? draft.baseRevision)) { draft.message = 'conflict'; return; }
        const proposed: unknown = restore ? restore.value : draft.raw === undefined ? draft.value : JSON.parse(draft.raw);
        const value = dshNativeObject(proposed);
        if (!value) { draft.message = 'invalid'; return; }
        const overrides = { ...current.overrides };
        if (!Object.keys(value).length) delete overrides[namespace];
        else Object.assign(overrides, { [namespace]: value });
        const next = normalizeDshNativeConfiguration({ version: 1, overrides });
        const settings = this.host.getSettings();
        const previous = settings.nativeConfig;
        settings.nativeConfig = next;
        try { await this.host.saveSettings(); }
        catch {
          if (settings.nativeConfig === next) settings.nativeConfig = previous;
          draft.message = 'saveFailed'; return;
        }
        let message = 'saved';
        const identity = backendRecoveryIdentity(this.host.vaultPath, `dsh:native:${namespace}`);
        if (identity) {
          try { this.recovery.archive(identity, `dsh-native-${namespace}`, JSON.stringify({ version: 1, overrides: current.overrides[namespace] === undefined ? {} : { [namespace]: current.overrides[namespace] } })); }
          catch { message = 'historyFailed'; }
        }
        draft.value = JSON.parse(JSON.stringify(next.overrides[namespace] ?? {})) as DshJsonObject;
        draft.baseRevision = this.groupRevision(namespace, next.overrides[namespace]);
        draft.dirty = false; draft.raw = undefined; draft.message = message; success = true;
      } catch { draft.message = 'invalid'; }
      finally { draft.busy = false; }
    };
    this.state.queue = this.state.queue.then(operation, operation);
    await this.state.queue;
    return success;
  }

  private renderRaw(container: HTMLElement, draft: GroupDraft, onDraftChange: () => void): void {
    const details = container.createEl('details', { cls: 'opencodian-dsh-native-details' });
    details.createEl('summary', { text: text('raw') });
    const body = details.createDiv({ cls: 'opencodian-dsh-disclosure-body' });
    body.createEl('p', { cls: 'setting-item-description', text: text('raw.desc') });
    const input = body.createEl('textarea', { cls: 'opencodian-dsh-native-json', attr: { 'aria-label': text('raw'), spellcheck: 'false' } });
    input.rows = 8;
    input.value = draft.raw ?? JSON.stringify(draft.value, null, 2);
    input.disabled = draft.busy;
    input.addEventListener('input', () => {
      if (draft.busy) return;
      draft.raw = input.value; draft.dirty = true; draft.message = 'draft';
      onDraftChange();
    });
  }

  /** The guided-fields owner renders the credential row; this port binds it to
   * the current render's generation and transport so late callbacks from a
   * disposed page or a switched transport can never reach the adapter. */
  private renderCredential(container: HTMLElement, ref: string, header: boolean): void {
    const generation = this.generation;
    const transport = this.host.getSettings().transport;
    const adapter = (): DshNativeSettingsPort | undefined => this.host.getAdapter();
    renderDshNativeCredentialRow(container, ref, header, {
      available: () => this.host.getSettings().transport !== 'acp' && Boolean(adapter()?.getNativeCredentialDescriptors),
      stale: () => generation !== this.generation || this.host.getSettings().transport !== transport,
      describe: async () => {
        const result = await adapter()?.getNativeCredentialDescriptors?.([ref]);
        if (!result) throw new Error('native credential service unavailable');
        return result;
      },
      set: async (credentialRef, value) => {
        const result = await adapter()?.setNativeCredential?.(credentialRef, value);
        if (!result) throw new Error('native credential service unavailable');
        return result;
      },
      unset: async credentialRef => {
        const result = await adapter()?.unsetNativeCredential?.(credentialRef);
        if (!result) throw new Error('native credential service unavailable');
        return result;
      },
    });
  }

  private renderSessionDefaults(container: HTMLElement): void {
    const result = container.createDiv();
    new Setting(container).setName(t('settings.agent.dsh.configuration')).setDesc(t('settings.agent.dsh.configuration.desc'))
      .addButton(button => button.setButtonText(t('settings.agent.dsh.configuration.read')).onClick(async () => {
        const generation = this.generation;
        button.setDisabled(true);
        try {
          const configuration = await this.host.getAdapter()?.readSessionConfiguration?.();
          if (generation !== this.generation || !configuration) return;
          result.empty(); result.setAttribute('aria-live', 'polite');
          for (const control of configuration.controls) {
            const name = control.id === 'model' ? t('settings.agent.dsh.model')
              : control.id === 'reasoning_effort' ? t('settings.agent.dsh.effort') : control.name;
            const selected = control.choices.find(choice => choice.value === control.value)?.name ?? control.value;
            const separator = selected.indexOf(': ');
            const label = separator > 0 && selected.slice(0, separator) === selected.slice(separator + 2) ? selected.slice(separator + 2) : selected;
            new Setting(result).setName(name).setDesc(label);
          }
        } catch { result.setText(text('readback.failed')); }
        finally { button.setDisabled(false); }
      }));
  }

  private matchesObserved(saved: unknown, effective: unknown): boolean | undefined {
    if (saved === undefined || effective === undefined) return undefined;
    const object = dshNativeObject(saved);
    if (!object) return JSON.stringify(saved) === JSON.stringify(effective);
    const observed = dshNativeObject(effective);
    if (!observed) return undefined;
    const outcomes = Object.entries(object).filter(([key]) => key !== 'headerCredentialRefs' && key !== 'apiKeyEnv')
      .map(([key, value]) => this.matchesObserved(value, observed[key]));
    if (outcomes.some(value => value === false)) return false;
    return outcomes.length && outcomes.every(value => value === true) ? true : undefined;
  }

  private renderReadback(container: HTMLElement): void {
    if (!this.readback) { container.createEl('p', { cls: 'setting-item-description', text: text('readback.empty') }); return; }
    for (const observation of this.readback.observations ?? []) {
      const details = container.createEl('details', { cls: 'opencodian-dsh-native-details' });
      details.createEl('summary', { text: text(`group.${observation.ns}`) });
      const body = details.createDiv({ cls: 'opencodian-dsh-disclosure-body' });
      body.createEl('p', { cls: 'setting-item-description', text: text(observation.status === 'verified' ? 'observation.verified' : 'observation.unavailable') });
      if (observation.value !== undefined) body.createEl('pre', { cls: 'opencodian-dsh-native-readback', text: JSON.stringify(observation.value, null, 2) });
    }
    for (const form of this.readback.forms) {
      const ns = typeof form.ns === 'string' ? form.ns : '';
      const known = DSH_NATIVE_CONFIGURATION_GROUPS.find(group => group.namespace === ns);
      const details = container.createEl('details', { cls: 'opencodian-dsh-native-details' });
      details.createEl('summary', { text: known ? text(`group.${known.namespace}`) : ns });
      const body = details.createDiv({ cls: 'opencodian-dsh-disclosure-body' });
      body.createEl('p', { cls: 'setting-item-description', text: text('readback.sources') });
      if (!known) this.extensionSettings.render(body, form, this.capabilities?.configuration.extensionSettings?.mutate === true, () => this.refresh());
      body.createEl('pre', { cls: 'opencodian-dsh-native-readback', text: JSON.stringify({ effective: form.value, inherited: form.base, schema: form.schema, valueSource: form.valueSource, baseSource: form.baseSource }, null, 2) });
    }
  }
}
