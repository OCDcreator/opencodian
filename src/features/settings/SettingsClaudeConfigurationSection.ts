/**
 * Claude settings configuration workbench assembly owner.
 *
 * This class deliberately owns only source selection, one exact raw draft,
 * inventory/read lifecycle, and composition. Common fields, hook editing, and
 * destructive mutations each have a durable adjacent owner.
 */
import { type ClaudeSettingsSourceCandidate, ClaudeSettingsSourceService } from '../../core/agents/backend/ClaudeSettingsSourceService';
import { applyJsoncPathEdits, type FileRevision, type JsoncPathEdit } from '../../core/agents/backend/ProjectResourceSecureWrite';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { getVaultBasePath } from '../../shared';
import { ClaudeSettingsCommonFieldsPresenter } from './ClaudeSettingsCommonFieldsPresenter';
import { ClaudeSettingsHooksBuilder } from './ClaudeSettingsHooksBuilder';
import {
  type ClaudeConfigurationScope,
  type ClaudeSettingsMutationContext,
  ClaudeSettingsMutationController,
  type ClaudeSettingsServiceBoundary,
  type ClaudeSettingsStatusLevel,
  formatClaudeSettingsEvidence,
  sameClaudeSettingsRevision,
} from './ClaudeSettingsMutationController';

export type { ClaudeConfigurationScope, ClaudeSettingsServiceBoundary } from './ClaudeSettingsMutationController';

export interface SettingsClaudeConfigurationSectionOptions {
  plugin: OpenCodianPlugin;
  /** Injectable test/system boundary; production constructs the real service. */
  sourceService?: ClaudeSettingsServiceBoundary;
  /** Invoked after a successful mutation so runtime/slash catalogs can refresh. */
  onAfterMutation?: () => void;
}

export function resolveConfigurationScopeSelection(explicit?: string | null): ClaudeConfigurationScope {
  if (explicit === 'global' || explicit === 'local') return explicit;
  return 'project';
}

export function isConfigurationSourceSelectable(source: { scope: string; editable: boolean }): boolean {
  return source.editable && source.scope !== 'managed';
}

function clearChildren(element: HTMLElement): void {
  while (element.firstChild) element.removeChild(element.firstChild);
}

function appendText(parent: HTMLElement, className: string, text: string, attr?: { name: string; value: string }): HTMLElement {
  const node = document.createElement('span');
  node.className = className;
  node.textContent = text;
  if (attr) node.setAttribute(attr.name, attr.value);
  parent.appendChild(node);
  return node;
}

const SCOPE_TARGET: Record<ClaudeConfigurationScope, (service: ClaudeSettingsServiceBoundary) => string> = {
  project: (service) => service.getDefaultProjectSettingsPath(),
  local: (service) => service.getDefaultProjectSettingsPath().replace(/settings\.json$/, 'settings.local.json'),
  global: (service) => service.getDefaultGlobalSettingsPath(),
};

export class SettingsClaudeConfigurationSection {
  private selectedScope: ClaudeConfigurationScope = 'project';
  private renderToken = 0;
  private readToken = 0;
  private selectionToken = 0;
  private draft = '';
  private draftValid = true;
  private expectedRevision: FileRevision | null = null;
  private sourceReadOnly = false;
  private candidates: readonly ClaudeSettingsSourceCandidate[] = [];
  private targetPathEl: HTMLElement | null = null;
  private sourceListEl: HTMLElement | null = null;
  private textareaEl: HTMLTextAreaElement | null = null;
  private diagnosticEl: HTMLElement | null = null;
  private saveBtnEl: HTMLButtonElement | null = null;
  private reloadBtnEl: HTMLButtonElement | null = null;
  private compareBtnEl: HTMLButtonElement | null = null;
  private deleteBtnEl: HTMLButtonElement | null = null;
  private statusEl: HTMLElement | null = null;
  private refreshInventory: (() => Promise<void>) | null = null;
  private readonly commonFields: ClaudeSettingsCommonFieldsPresenter;
  private readonly hooksBuilder: ClaudeSettingsHooksBuilder;
  private readonly mutations: ClaudeSettingsMutationController;

  constructor(private readonly options: SettingsClaudeConfigurationSectionOptions) {
    this.commonFields = new ClaudeSettingsCommonFieldsPresenter({
      getDraft: () => this.draft,
      isReadOnly: () => this.sourceReadOnly,
      applyDraftEdit: (edit) => this.applyDraftEdit(edit),
      setInlineDiagnostic: (message) => this.setInlineDiagnostic(message),
    });
    this.hooksBuilder = new ClaudeSettingsHooksBuilder({
      getDraft: () => this.draft,
      isDraftValid: () => this.draftValid,
      isReadOnly: () => this.sourceReadOnly,
      applyDraftEdit: (edit) => this.applyDraftEdit(edit),
      setInlineDiagnostic: (message) => this.setInlineDiagnostic(message),
    });
    this.mutations = new ClaudeSettingsMutationController({
      getVaultPath: () => getVaultBasePath(this.options.plugin.app),
      resolveService: (vaultPath) => this.resolveService(vaultPath),
      captureMutationContext: () => this.captureMutationContext(),
      isMutationContextCurrent: (context, requireRevision) => this.isMutationContextCurrent(context, requireRevision),
      getDraft: () => this.draft,
      setExpectedRevision: (revision) => {
        this.expectedRevision = revision;
      },
      setStatus: (message, level) => this.setStatus(message, level),
      refreshInventory: async () => {
        await this.refreshInventory?.();
      },
      refreshSaveControl: () => this.refreshSaveEnabled(),
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
    this.renderToken++;
    this.selectionToken++;
    const service = this.resolveService(vaultPath);
    const workbench = document.createElement('div');
    workbench.className = 'opencodian-claude-configuration';
    bodyEl.appendChild(workbench);
    this.renderScopeControl(workbench, service);
    this.renderSourceList(workbench);
    this.renderEditor(workbench, service, vaultPath);
  }

  private renderScopeControl(workbench: HTMLElement, service: ClaudeSettingsServiceBoundary): void {
    const row = document.createElement('div');
    row.className = 'opencodian-claude-configuration-scope-row';
    workbench.appendChild(row);
    const label = document.createElement('label');
    label.className = 'opencodian-claude-configuration-scope-label';
    label.htmlFor = 'claude-configuration-scope';
    label.textContent = t('settings.claudeCode.configuration.scope.name');
    row.appendChild(label);
    const select = document.createElement('select');
    select.id = 'claude-configuration-scope';
    select.setAttribute('data-claude-config-scope', 'true');
    select.setAttribute('aria-label', t('settings.claudeCode.configuration.scope.name'));
    for (const value of ['project', 'local', 'global'] as const) {
      select.add(new Option(t(`settings.claudeCode.configuration.scope.${value}`), value));
    }
    select.value = this.selectedScope;
    select.addEventListener('change', () => {
      this.selectedScope = resolveConfigurationScopeSelection(select.value);
      select.value = this.selectedScope;
      this.resetSelectionForReload();
      void this.readSelected(this.resolveTargetPath(service));
    });
    row.appendChild(select);
    const target = document.createElement('code');
    target.className = 'opencodian-claude-configuration-target-path';
    target.setAttribute('data-claude-config-target', 'true');
    this.targetPathEl = target;
    row.appendChild(target);
    this.renderTargetPath();
  }

  private renderSourceList(workbench: HTMLElement): void {
    const list = document.createElement('div');
    list.className = 'opencodian-claude-configuration-sources';
    list.setAttribute('data-claude-config-sources', 'true');
    this.sourceListEl = list;
    workbench.appendChild(list);
  }

  private renderEditor(workbench: HTMLElement, service: ClaudeSettingsServiceBoundary, vaultPath: string): void {
    const editor = document.createElement('div');
    editor.className = 'opencodian-claude-configuration-editor';
    editor.setAttribute('data-claude-config-editor', 'true');
    workbench.appendChild(editor);
    this.renderCommonForm(editor);
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
    this.renderHistory(editor);
    this.renderHooks(editor);
    this.refreshInventory = () => this.renderSourceSummary(vaultPath);
    void this.refreshInventory();
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
    const title = document.createElement('h4');
    title.setAttribute('data-claude-config-advanced-title', 'true');
    title.textContent = t('settings.claudeCode.configuration.advancedTitle');
    editor.appendChild(title);
    appendText(editor, 'opencodian-claude-configuration-section-description', t('settings.claudeCode.configuration.advancedDesc'));
    const diagnostic = document.createElement('div');
    diagnostic.className = 'opencodian-claude-configuration-diagnostic';
    diagnostic.hidden = true;
    diagnostic.setAttribute('data-claude-config-diagnostic', 'true');
    this.diagnosticEl = diagnostic;
    editor.appendChild(diagnostic);
    const textarea = document.createElement('textarea');
    textarea.className = 'opencodian-claude-configuration-draft';
    textarea.setAttribute('data-claude-config-draft', 'true');
    textarea.setAttribute('aria-label', t('settings.claudeCode.configuration.draftA11y'));
    textarea.value = this.draft;
    textarea.addEventListener('input', () => {
      this.draft = textarea.value;
      this.draftValid = this.validateDraft(this.draft);
      this.refreshDraftProjections();
      this.refreshSaveEnabled();
    });
    this.textareaEl = textarea;
    editor.appendChild(textarea);
    return textarea;
  }

  private renderActionControls(actions: HTMLElement, editor: HTMLElement): void {
    const save = this.createAction(t('settings.claudeCode.configuration.save'), 'opencodian-claude-configuration-save', 'data-claude-config-save');
    this.saveBtnEl = save;
    save.addEventListener(
      'click',
      () =>
        void this.mutations.save({
          saveButton: save,
          reloadButton: this.reloadBtnEl!,
          compareButton: this.compareBtnEl!,
        }),
    );
    actions.appendChild(save);
    const reload = this.createAction(t('settings.claudeCode.configuration.reload'), 'opencodian-claude-configuration-reload', 'data-claude-config-reload');
    reload.hidden = true;
    this.reloadBtnEl = reload;
    reload.addEventListener('click', () => {
      this.resetSelectionForReload();
      const vaultPath = getVaultBasePath(this.options.plugin.app);
      if (vaultPath) void this.readSelected(this.resolveTargetPath(this.resolveService(vaultPath)));
    });
    actions.appendChild(reload);
    const compare = this.createAction(t('settings.claudeCode.configuration.compare'), 'opencodian-claude-configuration-compare', 'data-claude-config-compare');
    compare.hidden = true;
    this.compareBtnEl = compare;
    compare.addEventListener('click', () => void this.mutations.compare({ editor }));
    actions.appendChild(compare);
    const remove = this.createAction(t('settings.claudeCode.configuration.delete'), 'opencodian-claude-configuration-delete', 'data-claude-config-delete');
    this.deleteBtnEl = remove;
    remove.addEventListener('click', () => this.mutations.requestDelete({ container: editor, trigger: remove }));
    actions.appendChild(remove);
    const history = this.createAction(
      t('settings.claudeCode.configuration.history'),
      'opencodian-claude-configuration-history-toggle',
      'data-claude-config-history-toggle',
    );
    actions.appendChild(history);
  }

  private renderHistory(editor: HTMLElement): void {
    const history = document.createElement('div');
    history.className = 'opencodian-claude-configuration-history';
    history.hidden = true;
    history.setAttribute('data-claude-config-history', 'true');
    editor.appendChild(history);
    const toggle = editor.querySelector('[data-claude-config-history-toggle]') as HTMLButtonElement;
    toggle.addEventListener('click', () => void this.mutations.toggleHistory(history));
  }

  private renderHooks(editor: HTMLElement): void {
    const hooks = document.createElement('section');
    hooks.className = 'opencodian-claude-configuration-hooks';
    hooks.setAttribute('data-claude-config-hooks', 'true');
    editor.appendChild(hooks);
    this.hooksBuilder.render(hooks);
  }

  private createAction(text: string, className: string, dataName: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = text;
    button.title = text;
    button.setAttribute('aria-label', text);
    button.setAttribute(dataName, 'true');
    return button;
  }

  private resetSelectionForReload(): void {
    this.selectionToken++;
    this.draft = '';
    this.expectedRevision = null;
    this.sourceReadOnly = true;
    if (this.textareaEl) this.textareaEl.value = '';
    if (this.reloadBtnEl) this.reloadBtnEl.hidden = true;
    if (this.compareBtnEl) this.compareBtnEl.hidden = true;
    this.clearMutationConfirmations();
    this.renderTargetPath();
    this.refreshDraftProjections();
    this.refreshSaveEnabled();
  }

  private clearMutationConfirmations(): void {
    this.statusEl?.parentElement?.querySelector('[data-claude-config-delete-confirm]')?.remove();
    this.statusEl?.parentElement?.querySelectorAll('[data-claude-config-restore-confirm]').forEach((node) => node.remove());
    this.statusEl?.parentElement?.querySelector('[data-claude-config-compare-output]')?.remove();
    const history = this.statusEl?.parentElement?.querySelector('[data-claude-config-history]') as HTMLElement | null;
    if (history) {
      history.hidden = true;
      clearChildren(history);
    }
  }

  private resolveService(vaultPath: string): ClaudeSettingsServiceBoundary {
    return this.options.sourceService ?? new ClaudeSettingsSourceService(vaultPath);
  }

  private resolveTargetPath(service: ClaudeSettingsServiceBoundary): string {
    const candidate = this.candidates.find((source) => source.scope === this.selectedScope);
    return candidate?.path ?? SCOPE_TARGET[this.selectedScope](service);
  }

  private renderTargetPath(): void {
    const vaultPath = getVaultBasePath(this.options.plugin.app);
    if (!vaultPath || !this.targetPathEl) return;
    this.targetPathEl.textContent = this.resolveTargetPath(this.resolveService(vaultPath));
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
    return (
      current.selectionToken === context.selectionToken &&
      current.scope === context.scope &&
      current.targetPath === context.targetPath &&
      (!requireRevision || sameClaudeSettingsRevision(current.expectedRevision, context.expectedRevision))
    );
  }

  private async readSelected(targetPath: string): Promise<void> {
    const textarea = this.textareaEl;
    const reload = this.reloadBtnEl;
    if (!textarea || !reload) return;
    const token = ++this.readToken;
    const vaultPath = getVaultBasePath(this.options.plugin.app);
    if (!vaultPath) return;
    let result;
    try {
      result = await this.resolveService(vaultPath).read(targetPath);
    } catch {
      if (token === this.readToken) this.setStatus(t('settings.claudeCode.configuration.readFailed'), 'error');
      return;
    }
    if (token !== this.readToken) return;
    reload.hidden = true;
    if (result.status === 'invalid-target') {
      this.setStatus(t('settings.claudeCode.configuration.invalidTarget'), 'error');
      return;
    }
    this.expectedRevision = result.source.revision;
    this.clearMutationConfirmations();
    this.sourceReadOnly = !isConfigurationSourceSelectable(result.source) || result.source.format !== 'json';
    if (this.deleteBtnEl) this.deleteBtnEl.disabled = this.sourceReadOnly || result.source.revision === null;
    if (result.source.editable && result.source.format === 'json') {
      this.draft = result.source.exists ? (typeof result.content === 'string' ? result.content : '{}') : '{}';
      if (!result.source.exists) this.expectedRevision = null;
      textarea.value = this.draft;
      this.draftValid = this.validateDraft(this.draft);
      this.setStatus('', '');
    } else {
      this.draft = '';
      textarea.value = '';
      this.setStatus(t('settings.claudeCode.configuration.notEditable'), 'warn');
    }
    this.refreshDraftProjections();
    this.refreshSaveEnabled();
  }

  private validateDraft(content: string): boolean {
    const diagnostic = this.diagnosticEl;
    if (!diagnostic) return false;
    if (content.trim() === '') {
      diagnostic.hidden = true;
      diagnostic.textContent = '';
      return true;
    }
    try {
      const parsed: unknown = JSON.parse(content);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        this.setInlineDiagnostic(t('settings.claudeCode.configuration.objectRequired'));
        return false;
      }
      diagnostic.hidden = true;
      diagnostic.textContent = '';
      return true;
    } catch (error) {
      this.setInlineDiagnostic(error instanceof Error ? error.message : String(error));
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
    if (!this.saveBtnEl) return;
    this.saveBtnEl.disabled = this.mutations.isSaveInFlight() || this.sourceReadOnly || this.draft.length === 0 || !this.draftValid;
  }

  private setInlineDiagnostic(message: string): void {
    if (!this.diagnosticEl) return;
    this.diagnosticEl.hidden = false;
    this.diagnosticEl.textContent = message;
  }

  private setStatus(message: string, level: ClaudeSettingsStatusLevel): void {
    if (!this.statusEl) return;
    this.statusEl.textContent = message;
    this.statusEl.setAttribute('data-claude-config-status-level', level);
  }

  private async renderSourceSummary(vaultPath: string): Promise<void> {
    const container = this.sourceListEl;
    if (!container) return;
    const token = this.renderToken;
    const service = this.resolveService(vaultPath);
    let sources: readonly ClaudeSettingsSourceCandidate[];
    try {
      sources = await service.inventory();
    } catch {
      if (token === this.renderToken && container.isConnected) {
        appendText(container, 'opencodian-claude-configuration-error', t('settings.claudeCode.configuration.inventoryFailed'), {
          name: 'data-claude-config-error',
          value: 'true',
        });
      }
      return;
    }
    if (token !== this.renderToken || !container.isConnected) return;
    this.candidates = sources;
    clearChildren(container);
    for (const source of sources) this.appendSourceRow(container, source);
    this.renderTargetPath();
    this.sourceReadOnly = false;
    if (this.deleteBtnEl) this.deleteBtnEl.disabled = false;
    if (this.compareBtnEl) this.compareBtnEl.hidden = true;
    await this.readSelected(this.resolveTargetPath(service));
  }

  private appendSourceRow(container: HTMLElement, source: ClaudeSettingsSourceCandidate): void {
    const row = document.createElement('div');
    row.className = 'opencodian-claude-configuration-source-row';
    appendText(row, 'opencodian-claude-configuration-source-meta', `${source.scope} · ${source.origin} · ${source.priority}`);
    appendText(row, 'opencodian-claude-configuration-source-path', source.path, { name: 'data-claude-config-source-path', value: source.scope });
    appendText(
      row,
      'opencodian-claude-configuration-source-revision',
      source.revision === null
        ? 'absent'
        : `${source.revision.canonicalPath} · ${source.revision.mtimeMs} · ${source.revision.size} · ${source.revision.sha256}`,
      { name: 'data-claude-config-revision', value: source.scope },
    );
    appendText(row, 'opencodian-claude-configuration-evidence', formatClaudeSettingsEvidence(source.evidence), {
      name: 'data-claude-config-evidence',
      value: source.scope,
    });
    if (!isConfigurationSourceSelectable(source)) {
      appendText(row, 'opencodian-claude-configuration-readonly', t('settings.claudeCode.configuration.readonly'), {
        name: 'data-claude-config-readonly',
        value: source.scope,
      });
    }
    container.appendChild(row);
  }
}
