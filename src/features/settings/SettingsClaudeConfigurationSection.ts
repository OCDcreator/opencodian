/**
 * Claude settings configuration workbench assembly owner.
 *
 * This class deliberately owns only source selection, one exact raw draft,
 * dirty tracking, read/save lifecycle, and composition. The context/sources
 * header, common fields, hook editing, and destructive mutations each have a
 * durable adjacent owner.
 */
import { type ClaudeSettingsSourceCandidate, ClaudeSettingsSourceService } from '../../core/agents/backend/ClaudeSettingsSourceService';
import { applyJsoncPathEdits, type ConfigurationEvidence, type FileRevision, type JsoncPathEdit } from '../../core/agents/backend/ProjectResourceSecureWrite';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { getVaultBasePath } from '../../shared';
import { ClaudeSettingsCommonFieldsPresenter } from './ClaudeSettingsCommonFieldsPresenter';
import { appendText, bindDisclosure, ClaudeSettingsContextSourcesPresenter, type ClaudeSettingsSwitchDecision, clearChildren, createActionButton, createDisclosureToggle, isConfigurationSourceSelectable } from './ClaudeSettingsContextSourcesPresenter';
import { ClaudeSettingsHooksBuilder } from './ClaudeSettingsHooksBuilder';
import { type ClaudeConfigurationScope, type ClaudeSettingsMutationContext, ClaudeSettingsMutationController, type ClaudeSettingsServiceBoundary, type ClaudeSettingsStatusLevel, sameClaudeSettingsRevision } from './ClaudeSettingsMutationController';

export { isConfigurationSourceSelectable, resolveConfigurationScopeSelection } from './ClaudeSettingsContextSourcesPresenter';
export type { ClaudeConfigurationScope, ClaudeSettingsServiceBoundary } from './ClaudeSettingsMutationController';

export interface SettingsClaudeConfigurationSectionOptions {
  plugin: OpenCodianPlugin;
  /** Injectable test/system boundary; production constructs the real service. */
  sourceService?: ClaudeSettingsServiceBoundary;
  /** Invoked after a successful mutation so runtime/slash catalogs can refresh. */
  onAfterMutation?: () => void;
}

const SCOPE_TARGET: Record<ClaudeConfigurationScope, (service: ClaudeSettingsServiceBoundary) => string> = { project: (service) => service.getDefaultProjectSettingsPath(), local: (service) => service.getDefaultProjectSettingsPath().replace(/settings\.json$/, 'settings.local.json'), global: (service) => service.getDefaultGlobalSettingsPath() };

type ClaudeSettingsReadResult = Awaited<ReturnType<ClaudeSettingsServiceBoundary['read']>>;
type ClaudeSettingsReadableResult = Exclude<ClaudeSettingsReadResult, { status: 'invalid-target' }>;

let nextClaudeConfigurationInstanceId = 0;

export class SettingsClaudeConfigurationSection {
  private selectedScope: ClaudeConfigurationScope = 'project';
  private readToken = 0;
  private selectionToken = 0;
  /** Identifies the currently actionable unsaved-draft scope-switch decision. */
  private switchDecisionGeneration = 0;
  private draftVersion = 0;
  private draft = '';
  private savedDraft = '';
  private draftValid = true;
  private expectedRevision: FileRevision | null = null;
  private sourceReadOnly = false;
  private inventoryErrorActive = false;
  private selectedSourceExists = false;
  private selectedEvidence: ConfigurationEvidence | null = null;
  private candidates: readonly ClaudeSettingsSourceCandidate[] = [];
  private readonly instanceId = ++nextClaudeConfigurationInstanceId;
  private textareaEl: HTMLTextAreaElement | null = null;
  private diagnosticEl: HTMLElement | null = null;
  private saveBtnEl: HTMLButtonElement | null = null;
  private reloadBtnEl: HTMLButtonElement | null = null;
  private compareBtnEl: HTMLButtonElement | null = null;
  private deleteBtnEl: HTMLButtonElement | null = null;
  private statusEl: HTMLElement | null = null;
  private livePoliteEl: HTMLElement | null = null;
  private liveAlertEl: HTMLElement | null = null;
  private readonly contextSources: ClaudeSettingsContextSourcesPresenter;
  private readonly commonFields: ClaudeSettingsCommonFieldsPresenter;
  private readonly hooksBuilder: ClaudeSettingsHooksBuilder;
  private readonly mutations: ClaudeSettingsMutationController;

  constructor(private readonly options: SettingsClaudeConfigurationSectionOptions) {
    this.contextSources = new ClaudeSettingsContextSourcesPresenter({
        getSelectedScope: () => this.selectedScope,
        onScopeSelected: (next) => this.handleScopeSelected(next),
        onSwitchDecision: (decision, next) => this.handleSwitchDecision(decision, next),
        getTargetPath: () => this.resolveTargetPathForCurrentVault(),
        isDirty: () => this.isDirty(),
        canSaveDraft: () => this.draftValid && !this.sourceReadOnly,
        selectedSourceExists: () => this.selectedSourceExists,
        isReadOnly: () => this.sourceReadOnly,
        getSelectedEvidence: () => this.selectedEvidence,
        setStatus: (message, level) => this.setStatus(message, level),
        loadSources: () => this.resolveServiceForCurrentVault().inventory(),
        onSourcesLoaded: (sources) => this.handleSourcesLoaded(sources),
        onSourcesLoadFailed: () => this.handleSourcesLoadFailed(),
      }, this.instanceId);
    this.commonFields = new ClaudeSettingsCommonFieldsPresenter({
      getDraft: () => this.draft,
      isReadOnly: () => this.sourceReadOnly,
      applyDraftEdit: (edit) => this.applyDraftEdit(edit),
      setInlineDiagnostic: (message) => this.setInlineDiagnostic(message),
      diagnosticId: () => this.diagnosticEl?.id ?? '',
    });
    this.hooksBuilder = new ClaudeSettingsHooksBuilder({
      getDraft: () => this.draft,
      isDraftValid: () => this.draftValid,
      isReadOnly: () => this.sourceReadOnly,
      applyDraftEdit: (edit) => this.applyDraftEdit(edit),
      setInlineDiagnostic: (message) => this.setInlineDiagnostic(message),
      diagnosticId: () => this.diagnosticEl?.id ?? '',
    });
    this.mutations = new ClaudeSettingsMutationController({
      getVaultPath: () => getVaultBasePath(this.options.plugin.app),
      resolveService: (vaultPath) => this.resolveService(vaultPath),
      captureMutationContext: () => this.captureMutationContext(),
      isMutationContextCurrent: (context, requireRevision) => this.isMutationContextCurrent(context, requireRevision),
      getDraft: () => this.draft,
      setExpectedRevision: (revision) => (this.expectedRevision = revision),
      markDraftSaved: (submittedDraft) => (this.savedDraft = submittedDraft),
      setStatus: (message, level) => this.setStatus(message, level),
      refreshInventory: () => this.contextSources.refreshInventory(),
      refreshSaveControl: () => this.refreshSaveEnabled(),
      focusEditorAnchor: () => this.contextSources.focusScopeControl(),
      onAfterMutation: this.options.onAfterMutation,
    });
  }

  render(bodyEl: HTMLElement): void {
    clearChildren(bodyEl);
    const vaultPath = getVaultBasePath(this.options.plugin.app);
    if (!vaultPath) {
      const note = document.createElement('p');
      note.textContent = t('settings.claudeCode.configuration.unavailable');
      bodyEl.appendChild(note);
      return;
    }
    this.selectionToken++;
    const service = this.resolveService(vaultPath);
    const workbench = document.createElement('div');
    workbench.className = 'opencodian-claude-configuration';
    bodyEl.appendChild(workbench);
    this.contextSources.render(workbench);
    this.renderEditor(workbench, service);
  }

  private handleScopeSelected(nextScope: ClaudeConfigurationScope): void {
    if (nextScope === this.selectedScope) {
      this.contextSources.syncScopeSelect();
      return;
    }
    if (this.isDirty()) {
      // Never silently drop an unsaved draft: revert the control and ask.
      this.contextSources.syncScopeSelect();
      this.switchDecisionGeneration++;
      this.contextSources.showSwitchDecision(nextScope);
      return;
    }
    this.switchDecisionGeneration++;
    this.performScopeSwitch(nextScope);
  }

  private handleSwitchDecision(decision: ClaudeSettingsSwitchDecision, nextScope: ClaudeConfigurationScope): void {
    const decisionGeneration = this.switchDecisionGeneration;
    if (decision === 'cancel') {
      this.switchDecisionGeneration++;
      this.contextSources.removeSwitchDecision();
      this.contextSources.focusScopeControl();
      return;
    }
    if (decision === 'discard') {
      this.switchDecisionGeneration++;
      this.performScopeSwitch(nextScope);
      return;
    }
    void this.saveAndSwitch(nextScope, decisionGeneration);
  }

  private performScopeSwitch(nextScope: ClaudeConfigurationScope): void {
    this.selectedScope = nextScope;
    this.contextSources.syncScopeSelect();
    this.resetSelectionForReload();
    void this.readSelected(this.resolveTargetPathForCurrentVault());
  }

  /** Saves the current target first; the switch happens only after a verified success. */
  private async saveAndSwitch(nextScope: ClaudeConfigurationScope, decisionGeneration: number): Promise<void> {
    if (!this.saveBtnEl || !this.reloadBtnEl || !this.compareBtnEl) return;
    const saved = await this.mutations.save({
      saveButton: this.saveBtnEl,
      reloadButton: this.reloadBtnEl,
      compareButton: this.compareBtnEl,
    });
    if (!saved) return;
    if (decisionGeneration !== this.switchDecisionGeneration) return;
    if (this.draft !== saved.submittedDraft) {
      this.switchDecisionGeneration++;
      this.contextSources.removeSwitchDecision();
      this.setStatus(t('settings.claudeCode.configuration.saveAndSwitchDraftChanged'), 'warn');
      this.refreshSaveEnabled();
      return;
    }
    this.switchDecisionGeneration++;
    this.performScopeSwitch(nextScope);
  }

  private async handleSourcesLoaded(sources: readonly ClaudeSettingsSourceCandidate[]): Promise<void> {
    this.inventoryErrorActive = false;
    this.candidates = sources;
    this.contextSources.renderTargetPath();
    this.sourceReadOnly = false;
    if (this.deleteBtnEl) this.deleteBtnEl.disabled = false;
    if (this.compareBtnEl) this.compareBtnEl.hidden = true;
    // Inventory refresh is part of the save transaction. It may update
    // revision/evidence, but it must not race a just-submitted snapshot (or a
    // newer edit made while the write was pending) back to stale disk text.
    await this.readSelected(this.resolveTargetPathForCurrentVault(), this.mutations.isSaveInFlight() ? 'metadata-only' : 'if-clean');
  }

  private handleSourcesLoadFailed(): void {
    this.inventoryErrorActive = true;
    this.setStatus(t('settings.claudeCode.configuration.inventoryFailed'), 'error');
  }

  private renderEditor(workbench: HTMLElement, service: ClaudeSettingsServiceBoundary): void {
    const editor = document.createElement('div');
    editor.className = 'opencodian-claude-configuration-editor';
    editor.setAttribute('data-claude-config-editor', 'true');
    workbench.appendChild(editor);
    this.renderCommonForm(editor);
    this.renderInlineDiagnostic(editor);
    const textarea = this.renderAdvancedEditor(editor);
    const actions = document.createElement('div');
    actions.className = 'opencodian-claude-configuration-actions';
    editor.appendChild(actions);
    this.renderActionControls(actions, editor);
    const status = document.createElement('div');
    status.className = 'opencodian-claude-configuration-status';
    status.setAttribute('data-claude-config-status', 'true');
    this.statusEl = status;
    editor.appendChild(status);
    this.renderLiveRegions(editor);
    this.renderHistory(editor);
    this.renderHooks(editor);
    void this.contextSources.refreshInventory();
    void this.readSelected(this.resolveTargetPath(service));
    textarea.value = this.draft;
  }

  private renderCommonForm(editor: HTMLElement): void {
    const title = document.createElement('h4');
    title.setAttribute('data-claude-config-common-title', 'true');
    title.textContent = t('settings.claudeCode.configuration.commonTitle');
    editor.appendChild(title);
    appendText(editor, 'opencodian-claude-configuration-section-description', t('settings.claudeCode.configuration.commonDesc'));
    const form = document.createElement('div');
    form.className = 'opencodian-claude-configuration-form';
    form.setAttribute('data-claude-config-form', 'true');
    editor.appendChild(form);
    this.commonFields.render(form);
  }

  private renderAdvancedEditor(editor: HTMLElement): HTMLTextAreaElement {
    const regionId = `claude-config-advanced-${this.instanceId}`;
    const toggle = createDisclosureToggle(t('settings.claudeCode.configuration.advancedTitle'), 'opencodian-claude-configuration-advanced-toggle', 'data-claude-config-advanced-toggle', regionId);
    editor.appendChild(toggle);
    const region = document.createElement('div');
    region.className = 'opencodian-claude-configuration-advanced-region';
    region.id = regionId;
    region.hidden = true;
    region.setAttribute('data-claude-config-advanced-region', 'true');
    editor.appendChild(region);
    bindDisclosure(toggle, region);
    appendText(region, 'opencodian-claude-configuration-section-description', t('settings.claudeCode.configuration.advancedDesc'));
    const textarea = document.createElement('textarea');
    textarea.className = 'opencodian-claude-configuration-draft';
    textarea.setAttribute('data-claude-config-draft', 'true');
    textarea.setAttribute('aria-label', t('settings.claudeCode.configuration.draftA11y'));
    textarea.value = this.draft;
    textarea.addEventListener('input', () => {
      this.draft = textarea.value;
      this.draftVersion++;
      this.draftValid = this.validateDraft(this.draft);
      this.refreshDraftProjections();
      this.refreshSaveEnabled();
    });
    this.textareaEl = textarea;
    region.appendChild(textarea);
    return textarea;
  }

  /** Shared validation output remains visible even while Advanced JSON is collapsed. */
  private renderInlineDiagnostic(editor: HTMLElement): void {
    const diagnostic = document.createElement('div');
    diagnostic.className = 'opencodian-claude-configuration-diagnostic';
    diagnostic.id = `claude-config-diagnostic-${this.instanceId}`;
    diagnostic.hidden = true;
    diagnostic.setAttribute('data-claude-config-diagnostic', 'true');
    diagnostic.setAttribute('role', 'alert');
    diagnostic.setAttribute('aria-live', 'assertive');
    diagnostic.setAttribute('aria-atomic', 'true');
    this.diagnosticEl = diagnostic;
    editor.appendChild(diagnostic);
  }

  private renderActionControls(actions: HTMLElement, editor: HTMLElement): void {
    const save = createActionButton(t('settings.claudeCode.configuration.save'), 'opencodian-claude-configuration-save mod-cta', 'data-claude-config-save');
    this.saveBtnEl = save;
    save.addEventListener('click', () =>
      void this.mutations.save({ saveButton: save, reloadButton: this.reloadBtnEl!, compareButton: this.compareBtnEl! }),
    );
    actions.appendChild(save);
    const history = createActionButton(t('settings.claudeCode.configuration.history'), 'opencodian-claude-configuration-history-toggle', 'data-claude-config-history-toggle');
    actions.appendChild(history);
    const compare = createActionButton(t('settings.claudeCode.configuration.compare'), 'opencodian-claude-configuration-compare', 'data-claude-config-compare');
    compare.hidden = true;
    this.compareBtnEl = compare;
    compare.addEventListener('click', () => void this.mutations.compare({ editor }));
    actions.appendChild(compare);
    const reload = createActionButton(t('settings.claudeCode.configuration.reload'), 'opencodian-claude-configuration-reload', 'data-claude-config-reload');
    reload.hidden = true;
    this.reloadBtnEl = reload;
    reload.addEventListener('click', () => {
      this.resetSelectionForReload();
      void this.readSelected(this.resolveTargetPathForCurrentVault());
    });
    actions.appendChild(reload);
    const remove = createActionButton(t('settings.claudeCode.configuration.delete'), 'opencodian-claude-configuration-delete mod-warning', 'data-claude-config-delete');
    this.deleteBtnEl = remove;
    remove.addEventListener('click', () => this.mutations.requestDelete({ container: editor, trigger: remove }));
    actions.appendChild(remove);
  }

  private renderHistory(editor: HTMLElement): void {
    const regionId = `claude-config-history-${this.instanceId}`;
    const history = document.createElement('div');
    history.className = 'opencodian-claude-configuration-history';
    history.id = regionId;
    history.hidden = true;
    history.setAttribute('data-claude-config-history', 'true');
    editor.appendChild(history);
    const toggle = editor.querySelector('[data-claude-config-history-toggle]') as HTMLButtonElement;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', regionId);
    toggle.addEventListener('click', () => void this.mutations.toggleHistory(history, (expanded) => toggle.setAttribute('aria-expanded', String(expanded))));
  }

  private renderHooks(editor: HTMLElement): void {
    const regionId = `claude-config-hooks-${this.instanceId}`;
    const toggle = createDisclosureToggle(t('settings.claudeCode.configuration.hooks'), 'opencodian-claude-configuration-hooks-toggle', 'data-claude-config-hooks-toggle', regionId);
    editor.appendChild(toggle);
    const hooks = document.createElement('section');
    hooks.className = 'opencodian-claude-configuration-hooks';
    hooks.id = regionId;
    hooks.hidden = true;
    hooks.setAttribute('data-claude-config-hooks', 'true');
    editor.appendChild(hooks);
    bindDisclosure(toggle, hooks);
    this.hooksBuilder.render(hooks);
  }

  private renderLiveRegions(editor: HTMLElement): void {
    for (const [dataName, role] of [['data-claude-config-live-polite', 'status'], ['data-claude-config-live-alert', 'alert']] as const) {
      const region = document.createElement('div');
      region.className = 'opencodian-claude-configuration-live-region';
      region.setAttribute(dataName, 'true');
      region.setAttribute('role', role);
      region.setAttribute('aria-atomic', 'true');
      if (role === 'status') {
        region.setAttribute('aria-live', 'polite');
        this.livePoliteEl = region;
      } else {
        this.liveAlertEl = region;
      }
      editor.appendChild(region);
    }
  }

  private isDirty(): boolean {
    return this.draft !== this.savedDraft;
  }

  private resetSelectionForReload(): void {
    this.selectionToken++;
    this.draftVersion++;
    this.draft = '';
    this.savedDraft = '';
    this.selectedSourceExists = false;
    this.selectedEvidence = null;
    this.expectedRevision = null;
    this.sourceReadOnly = true;
    if (this.textareaEl) this.textareaEl.value = '';
    if (this.reloadBtnEl) this.reloadBtnEl.hidden = true;
    if (this.compareBtnEl) this.compareBtnEl.hidden = true;
    this.mutations.clearConfirmations(this.statusEl?.parentElement);
    this.contextSources.removeSwitchDecision();
    this.contextSources.renderTargetPath();
    this.refreshDraftProjections();
    this.refreshSaveEnabled();
  }

  private resolveService(vaultPath: string): ClaudeSettingsServiceBoundary {
    return this.options.sourceService ?? new ClaudeSettingsSourceService(vaultPath);
  }

  private resolveServiceForCurrentVault(): ClaudeSettingsServiceBoundary {
    return this.resolveService(getVaultBasePath(this.options.plugin.app) ?? '');
  }

  private resolveTargetPath(service: ClaudeSettingsServiceBoundary): string {
    const candidate = this.candidates.find((source) => source.scope === this.selectedScope);
    return candidate?.path ?? SCOPE_TARGET[this.selectedScope](service);
  }

  private resolveTargetPathForCurrentVault(): string {
    const vaultPath = getVaultBasePath(this.options.plugin.app);
    return vaultPath ? this.resolveTargetPath(this.resolveService(vaultPath)) : '';
  }

  private captureMutationContext(): ClaudeSettingsMutationContext {
    const vaultPath = getVaultBasePath(this.options.plugin.app);
    const service = vaultPath ? this.resolveService(vaultPath) : null;
    return {
      selectionToken: this.selectionToken,
      scope: this.selectedScope,
      targetPath: service ? this.resolveTargetPath(service) : '',
      expectedRevision: this.expectedRevision,
      sourceReadOnly: this.sourceReadOnly,
    };
  }

  private isMutationContextCurrent(context: ClaudeSettingsMutationContext, requireRevision: boolean): boolean {
    const current = this.captureMutationContext();
    return current.selectionToken === context.selectionToken && current.scope === context.scope && current.targetPath === context.targetPath && (!requireRevision || sameClaudeSettingsRevision(current.expectedRevision, context.expectedRevision));
  }

  /**
   * Reads the selected target. `always` replaces the draft (explicit loads);
   * `if-clean` refreshes revision/evidence only and keeps an unsaved user draft.
   */
  private async readSelected(targetPath: string, mode: 'always' | 'if-clean' | 'metadata-only' = 'always'): Promise<void> {
    const textarea = this.textareaEl;
    const reload = this.reloadBtnEl;
    if (!textarea || !reload) return;
    const token = ++this.readToken;
    const draftVersionAtRequest = this.draftVersion;
    const result = await this.readTarget(targetPath, token);
    if (!result || token !== this.readToken) return;
    reload.hidden = true;
    if (result.status === 'invalid-target') {
      this.setStatus(t('settings.claudeCode.configuration.invalidTarget'), 'error');
      return;
    }
    this.projectSelectedRead(result, textarea, mode, draftVersionAtRequest);
  }

  private async readTarget(targetPath: string, token: number): Promise<ClaudeSettingsReadResult | null> {
    const vaultPath = getVaultBasePath(this.options.plugin.app);
    if (!vaultPath) return null;
    try {
      return await this.resolveService(vaultPath).read(targetPath);
    } catch {
      if (token === this.readToken) this.setStatus(t('settings.claudeCode.configuration.readFailed'), 'error');
      return null;
    }
  }

  /** Updates source metadata first; a draft is replaced only when its request fence remains valid. */
  private projectSelectedRead(result: ClaudeSettingsReadableResult, textarea: HTMLTextAreaElement, mode: 'always' | 'if-clean' | 'metadata-only', draftVersionAtRequest: number): void {
    // An explicit load may replace a stable draft, but never one typed after
    // this request began. In particular, inventory/readback work triggered by
    // a save cannot overwrite edits made while that save was in flight.
    const replaceDraft = mode !== 'metadata-only'
      && draftVersionAtRequest === this.draftVersion
      && (mode === 'always' || !this.isDirty());
    this.expectedRevision = result.source.revision;
    this.selectedSourceExists = result.source.exists;
    this.selectedEvidence = result.source.evidence;
    this.mutations.clearConfirmations(this.statusEl?.parentElement);
    this.sourceReadOnly = !isConfigurationSourceSelectable(result.source) || result.source.format !== 'json';
    if (this.deleteBtnEl) this.deleteBtnEl.disabled = this.sourceReadOnly || result.source.revision === null;
    if (!replaceDraft) {
      this.refreshDraftProjections();
      this.refreshSaveEnabled();
      return;
    }
    this.replaceDraftFromSelectedSource(result, textarea);
    this.refreshDraftProjections();
    this.refreshSaveEnabled();
  }

  private replaceDraftFromSelectedSource(result: ClaudeSettingsReadableResult, textarea: HTMLTextAreaElement): void {
    if (result.source.editable && result.source.format === 'json') {
      this.draft = result.source.exists ? (typeof result.content === 'string' ? result.content : '{}') : '{}';
      if (!result.source.exists) this.expectedRevision = null;
      textarea.value = this.draft;
      this.savedDraft = this.draft;
      this.draftValid = this.validateDraft(this.draft);
      if (!this.inventoryErrorActive) this.setStatus('', '');
    } else {
      this.draft = '';
      textarea.value = '';
      this.savedDraft = '';
      this.setStatus(t('settings.claudeCode.configuration.notEditable'), 'warn');
    }
  }

  private validateDraft(content: string): boolean {
    const diagnostic = this.diagnosticEl;
    if (!diagnostic) return false;
    try {
      const parsed: unknown = content.trim() === '' ? {} : JSON.parse(content);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        this.setInlineDiagnostic(t('settings.claudeCode.configuration.objectRequired'));
        return false;
      }
      diagnostic.hidden = true;
      diagnostic.textContent = '';
      this.textareaEl?.removeAttribute('aria-invalid');
      this.textareaEl?.removeAttribute('aria-describedby');
      return true;
    } catch (error) {
      // Localized primary message; the raw parser error stays as technical detail.
      const detail = error instanceof Error ? error.message : String(error);
      this.setInlineDiagnostic(`${t('settings.claudeCode.configuration.invalidJson')} ${detail}`);
      return false;
    }
  }

  /** Applies a one-path edit to the exact raw draft and refreshes all projections. */
  private applyDraftEdit(edit: JsoncPathEdit): boolean {
    if (!this.textareaEl || !this.diagnosticEl) return false;
    if (this.draft.trim() === '') this.draft = '{}';
    const applied = applyJsoncPathEdits(this.draft, [edit]);
    if (!applied.ok) return false;
    this.draft = applied.result;
    this.draftVersion++;
    this.textareaEl.value = this.draft;
    this.draftValid = this.validateDraft(this.draft);
    this.refreshDraftProjections();
    this.refreshSaveEnabled();
    return this.draftValid;
  }

  private refreshDraftProjections(): void {
    this.commonFields.refresh();
    this.hooksBuilder.refresh();
  }

  private refreshSaveEnabled(): void {
    if (this.saveBtnEl) {
      this.saveBtnEl.disabled = this.mutations.isSaveInFlight() || this.sourceReadOnly || this.draft.length === 0 || !this.draftValid;
    }
    this.contextSources.refreshSummary();
  }

  private setInlineDiagnostic(message: string): void {
    if (!this.diagnosticEl) return;
    this.diagnosticEl.hidden = false;
    this.diagnosticEl.textContent = message;
    this.textareaEl?.setAttribute('aria-invalid', 'true');
    this.textareaEl?.setAttribute('aria-describedby', this.diagnosticEl.id);
  }

  private setStatus(message: string, level: ClaudeSettingsStatusLevel): void {
    if (this.statusEl) {
      this.statusEl.textContent = message;
      this.statusEl.setAttribute('data-claude-config-status-level', level);
    }
    // Blocking errors/conflicts announce assertively; everything else politely.
    const blocking = level === 'error';
    if (this.livePoliteEl) this.livePoliteEl.textContent = blocking ? '' : message;
    if (this.liveAlertEl) this.liveAlertEl.textContent = blocking ? message : '';
  }
}
