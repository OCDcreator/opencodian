/**
 * Mutation and history controller for the Claude settings workbench.
 *
 * This owner keeps destructive confirmations, CAS revisions, generation
 * fencing, compare, and archive history together. Presentation state stays in
 * the workbench host while this controller owns all asynchronous transitions.
 */
import type {
  ClaudeSettingsDeleteParams,
  ClaudeSettingsDeleteResult,
  ClaudeSettingsHistoryResult,
  ClaudeSettingsPathEditsParams,
  ClaudeSettingsReadResult,
  ClaudeSettingsRestoreParams,
  ClaudeSettingsRestoreResult,
  ClaudeSettingsSourceCandidate,
  ClaudeSettingsWriteParams,
  ClaudeSettingsWriteResult,
} from '../../core/agents/backend/ClaudeSettingsSourceService';
import type { ArchiveHistoryEntryIdentity } from '../../core/agents/backend/ConfigurationArchiveService';
import type { FileRevision } from '../../core/agents/backend/ProjectResourceSecureWrite';
import { getLocale, t, type TranslationKey } from '../../i18n';
import { appendText, formatClaudeSettingsEvidenceHuman } from './ClaudeSettingsContextSourcesPresenter';

export type ClaudeConfigurationScope = 'project' | 'local' | 'global';
export type ClaudeSettingsStatusLevel = '' | 'error' | 'warn' | 'ok';

/** Injectable source-service boundary shared by the workbench and DOM tests. */
export interface ClaudeSettingsServiceBoundary {
  inventory(): Promise<readonly ClaudeSettingsSourceCandidate[]>;
  read(targetPath: string): Promise<ClaudeSettingsReadResult>;
  write(params: ClaudeSettingsWriteParams): Promise<ClaudeSettingsWriteResult>;
  applyPathEdits(params: ClaudeSettingsPathEditsParams): Promise<ClaudeSettingsWriteResult>;
  delete(params: ClaudeSettingsDeleteParams): Promise<ClaudeSettingsDeleteResult>;
  listHistory(targetPath: string): Promise<ClaudeSettingsHistoryResult>;
  restore(params: ClaudeSettingsRestoreParams): Promise<ClaudeSettingsRestoreResult>;
  getDefaultProjectSettingsPath(): string;
  getDefaultGlobalSettingsPath(): string;
}

export interface ClaudeSettingsMutationContext {
  selectionToken: number;
  scope: ClaudeConfigurationScope;
  targetPath: string;
  expectedRevision: FileRevision | null;
  sourceReadOnly: boolean;
}

export interface ClaudeSettingsMutationHost {
  getVaultPath(): string | null;
  resolveService(vaultPath: string): ClaudeSettingsServiceBoundary;
  captureMutationContext(): ClaudeSettingsMutationContext;
  isMutationContextCurrent(context: ClaudeSettingsMutationContext, requireRevision: boolean): boolean;
  getDraft(): string;
  setExpectedRevision(revision: FileRevision | null): void;
  /** Marks one submitted snapshot as the saved baseline for dirty tracking. */
  markDraftSaved(submittedDraft: string): void;
  setStatus(message: string, level: ClaudeSettingsStatusLevel): void;
  refreshInventory(): Promise<void>;
  refreshSaveControl(): void;
  /** Returns focus to a stable workbench control after a destructive mutation. */
  focusEditorAnchor(): void;
  onAfterMutation?(): void;
}

export interface ClaudeSettingsSaveControls {
  saveButton: HTMLButtonElement;
  reloadButton: HTMLButtonElement;
  compareButton: HTMLButtonElement;
}

/** Exact canonical draft snapshot accepted by the successful write request. */
export interface ClaudeSettingsSaveOutcome {
  readonly submittedDraft: string;
}

export interface ClaudeSettingsDeleteControls {
  container: HTMLElement;
  trigger: HTMLButtonElement;
}

export interface ClaudeSettingsCompareControls {
  editor: HTMLElement;
}

interface RestoreConfirmation {
  row: HTMLElement;
  entryIdentity: ArchiveHistoryEntryIdentity;
  context: ClaudeSettingsMutationContext;
  trigger: HTMLButtonElement;
}

/** Localized scope label for confirmation copy (e.g. "Project" / "项目"). */
function claudeSettingsScopeLabel(scope: ClaudeConfigurationScope): string {
  return t(`settings.claudeCode.configuration.scopeLabel.${scope}` as TranslationKey);
}

/** True only when revision identities represent the same exact file snapshot. */
export function sameClaudeSettingsRevision(left: FileRevision | null, right: FileRevision | null): boolean {
  return left === right || (left !== null && right !== null
    && left.canonicalPath === right.canonicalPath
    && left.mtimeMs === right.mtimeMs
    && left.size === right.size
    && left.sha256 === right.sha256);
}

const HISTORY_KIND_KEYS: Readonly<Record<string, TranslationKey>> = {
  overwrite: 'settings.claudeCode.configuration.history.kind.overwrite',
  delete: 'settings.claudeCode.configuration.history.kind.delete',
};

function claudeSettingsLocaleTag(): string {
  return getLocale() === 'zh' ? 'zh-CN' : 'en-US';
}

function formatClaudeSettingsHistoryKind(kind: string): string {
  const key = HISTORY_KIND_KEYS[kind];
  return key
    ? t(key)
    : t('settings.claudeCode.configuration.history.kind.unknown', { kind });
}

function formatClaudeSettingsHistoryTime(timestamp: number): string {
  return new Intl.DateTimeFormat(claudeSettingsLocaleTag(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp));
}

function formatClaudeSettingsHistorySize(bytes: number): string {
  const safeBytes = Math.max(0, bytes);
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unitIndex = 0;
  let value = safeBytes;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  const formatted = new Intl.NumberFormat(claudeSettingsLocaleTag(), {
    maximumFractionDigits: value < 10 && unitIndex > 0 ? 1 : 0,
  }).format(value);
  return t('settings.claudeCode.configuration.history.size', { value: formatted, unit: units[unitIndex] });
}

export class ClaudeSettingsMutationController {
  private saveInFlight = false;
  private deleteInFlight = false;
  private restoreInFlight = false;
  private compareInFlight = false;
  /** Invalidates a history response whenever its disclosure is closed or reopened. */
  private historyRequestToken = 0;

  constructor(private readonly host: ClaudeSettingsMutationHost) {}

  isSaveInFlight(): boolean {
    return this.saveInFlight;
  }

  /** Removes visible delete/restore confirmations, compare output, and history rows under the editor. */
  clearConfirmations(editor: HTMLElement | null | undefined): void {
    if (!editor) return;
    editor.querySelector('[data-claude-config-delete-confirm]')?.remove();
    editor.querySelectorAll('[data-claude-config-restore-confirm]').forEach((node) => node.remove());
    editor.querySelector('[data-claude-config-compare-output]')?.remove();
    const history = editor.querySelector('[data-claude-config-history]') as HTMLElement | null;
    if (history) {
      this.historyRequestToken++;
      history.hidden = true;
      history.setAttribute('aria-busy', 'false');
      this.clearChildren(history);
      const toggle = editor.querySelector('[data-claude-config-history-toggle]') as HTMLButtonElement | null;
      toggle?.setAttribute('aria-expanded', 'false');
    }
  }

  /**
   * Save the exact draft snapshot under the current selection/revision CAS.
   * Returns the exact submitted snapshot only after a verified success, so
   * gated flows (e.g. Save & Switch) can compare it with the live draft.
   */
  async save(controls: ClaudeSettingsSaveControls): Promise<ClaudeSettingsSaveOutcome | null> {
    if (this.saveInFlight) return null;
    const context = this.host.captureMutationContext();
    const vaultPath = this.host.getVaultPath();
    if (!vaultPath || context.sourceReadOnly) return null;
    // Capture before the first await. This is the sole snapshot that this save
    // may mark as persisted even if the user continues editing while it runs.
    const submittedDraft = this.host.getDraft();
    const service = this.host.resolveService(vaultPath);
    this.saveInFlight = true;
    this.host.refreshSaveControl();
    try {
      const result = await service.write({
        targetPath: context.targetPath,
        content: submittedDraft,
        expectedRevision: context.expectedRevision,
      });
      if (!this.host.isMutationContextCurrent(context, false)) return null;
      if (result.result.status === 'success') {
        this.host.setExpectedRevision((result.result as { revision?: FileRevision }).revision ?? context.expectedRevision);
        this.host.markDraftSaved(submittedDraft);
        controls.reloadButton.hidden = true;
        controls.compareButton.hidden = true;
        this.host.onAfterMutation?.();
        await this.host.refreshInventory();
        if (this.host.isMutationContextCurrent(context, false)) {
          const newerDraftExists = this.host.getDraft() !== submittedDraft;
          const suffix = newerDraftExists
            ? t('settings.claudeCode.configuration.savedNewerDraft')
            : formatClaudeSettingsEvidenceHuman(result.evidence);
          this.host.setStatus(`${t('settings.claudeCode.configuration.saved')} ${suffix}`, newerDraftExists ? 'warn' : 'ok');
        }
        return { submittedDraft };
      }
      if (result.result.status === 'conflict') {
        controls.reloadButton.hidden = false;
        controls.compareButton.hidden = false;
        this.host.setStatus(t('settings.claudeCode.configuration.conflict'), 'error');
      } else {
        this.host.setStatus(t('settings.claudeCode.configuration.saveFailed'), 'error');
      }
      return null;
    } catch {
      if (this.host.isMutationContextCurrent(context, false)) {
        this.host.setStatus(t('settings.claudeCode.configuration.saveFailed'), 'error');
      }
      return null;
    } finally {
      this.saveInFlight = false;
      this.host.refreshSaveControl();
    }
  }

  /** Read disk-only content into an inline comparison without changing the draft. */
  async compare(controls: ClaudeSettingsCompareControls): Promise<void> {
    if (this.compareInFlight) return;
    const context = this.host.captureMutationContext();
    const vaultPath = this.host.getVaultPath();
    if (!vaultPath) return;
    const draft = this.host.getDraft();
    this.compareInFlight = true;
    try {
      const result = await this.host.resolveService(vaultPath).read(context.targetPath);
      if (!this.host.isMutationContextCurrent(context, false)) return;
      controls.editor.querySelector('[data-claude-config-compare-output]')?.remove();
      const output = document.createElement('pre');
      output.className = 'opencodian-claude-configuration-compare-output';
      output.setAttribute('data-claude-config-compare-output', 'true');
      const disk = result.status === 'success' ? result.content ?? '' : t('settings.claudeCode.configuration.invalidTarget');
      output.textContent = `${t('settings.claudeCode.configuration.compareDraftLabel')}:\n${draft}\n\n${t('settings.claudeCode.configuration.compareDiskLabel')}:\n${disk}`;
      controls.editor.appendChild(output);
      this.host.setStatus(t('settings.claudeCode.configuration.compareNotice'), 'warn');
    } catch {
      if (this.host.isMutationContextCurrent(context, false)) {
        this.host.setStatus(t('settings.claudeCode.configuration.readFailed'), 'error');
      }
    } finally {
      this.compareInFlight = false;
    }
  }

  /** Show an inline, revision-bound confirmation before deleting the source. */
  requestDelete(controls: ClaudeSettingsDeleteControls): void {
    const context = this.host.captureMutationContext();
    if (this.deleteInFlight || context.sourceReadOnly || context.expectedRevision === null) return;
    const previous = controls.container.querySelector('[data-claude-config-delete-confirm]');
    if (previous) {
      previous.remove();
      return;
    }
    const confirm = document.createElement('div');
    confirm.setAttribute('data-claude-config-delete-confirm', 'true');
    appendText(
      confirm,
      'opencodian-claude-configuration-confirm-text',
      t('settings.claudeCode.configuration.deleteConfirm', {
        scope: claudeSettingsScopeLabel(context.scope),
        path: context.targetPath,
      }),
    );
    const accept = this.createButton(t('settings.claudeCode.configuration.confirm'), 'data-claude-config-delete-accept');
    const cancel = this.createButton(t('settings.claudeCode.configuration.cancel'), 'data-claude-config-delete-cancel');
    cancel.addEventListener('click', () => {
      confirm.remove();
      controls.trigger.focus();
    });
    accept.addEventListener('click', () => {
      void this.deleteConfirmed({ context, confirm, accept, trigger: controls.trigger });
    });
    confirm.append(accept, cancel);
    controls.container.appendChild(confirm);
  }

  /** Read history without materializing a missing root, then render exact-target entries. */
  async toggleHistory(container: HTMLElement, onVisibilityChange?: (expanded: boolean) => void): Promise<void> {
    if (!container.hidden) {
      this.historyRequestToken++;
      container.hidden = true;
      container.setAttribute('aria-busy', 'false');
      this.clearChildren(container);
      onVisibilityChange?.(false);
      return;
    }
    const requestToken = ++this.historyRequestToken;
    const context = this.host.captureMutationContext();
    const vaultPath = this.host.getVaultPath();
    if (!vaultPath) return;
    container.hidden = false;
    container.setAttribute('aria-busy', 'true');
    onVisibilityChange?.(true);
    this.clearChildren(container);
    appendText(container, 'opencodian-claude-configuration-history-loading', t('settings.claudeCode.configuration.historyLoading'));
    const service = this.host.resolveService(vaultPath);
    try {
      const result = await service.listHistory(context.targetPath);
      if (!this.isVisibleCurrentHistory(container, context, requestToken)) return;
      container.setAttribute('aria-busy', 'false');
      this.clearChildren(container);
      if (result.status !== 'success') {
        const error = appendText(container, 'opencodian-claude-configuration-history-error', t('settings.claudeCode.configuration.historyFailed'));
        error.setAttribute('role', 'alert');
        error.setAttribute('aria-live', 'assertive');
        this.host.setStatus(t('settings.claudeCode.configuration.historyFailed'), 'error');
        return;
      }
      const target = result.targets.length === 1 ? result.targets[0] : undefined;
      if (!target || target.entries.length === 0) {
        appendText(container, 'opencodian-claude-configuration-history-empty', t('settings.claudeCode.configuration.historyEmpty'));
        return;
      }
      for (const entry of target.entries) this.renderHistoryEntry(container, entry, context);
    } catch {
      if (this.isVisibleCurrentHistory(container, context, requestToken)) {
        container.setAttribute('aria-busy', 'false');
        this.clearChildren(container);
        const error = appendText(container, 'opencodian-claude-configuration-history-error', t('settings.claudeCode.configuration.historyFailed'));
        error.setAttribute('role', 'alert');
        error.setAttribute('aria-live', 'assertive');
        this.host.setStatus(t('settings.claudeCode.configuration.historyFailed'), 'error');
      }
    }
  }

  private async deleteConfirmed(args: {
    context: ClaudeSettingsMutationContext;
    confirm: HTMLElement;
    accept: HTMLButtonElement;
    trigger: HTMLButtonElement;
  }): Promise<void> {
    const { context, confirm, accept, trigger } = args;
    const vaultPath = this.host.getVaultPath();
    if (!vaultPath || this.deleteInFlight) return;
    if (!this.host.isMutationContextCurrent(context, true)) {
      confirm.remove();
      this.host.setStatus(t('settings.claudeCode.configuration.confirmationStale'), 'warn');
      return;
    }
    this.deleteInFlight = true;
    accept.disabled = true;
    trigger.disabled = true;
    try {
      const result = await this.host.resolveService(vaultPath).delete({
        targetPath: context.targetPath,
        expectedRevision: context.expectedRevision!,
      });
      if (!this.host.isMutationContextCurrent(context, false)) return;
      if (result.result.status === 'success') {
        confirm.remove();
        this.host.onAfterMutation?.();
        await this.host.refreshInventory();
        if (this.host.isMutationContextCurrent(context, false)) {
          this.host.setStatus(`${t('settings.claudeCode.configuration.deleted')} ${formatClaudeSettingsEvidenceHuman(result.evidence)}`, 'ok');
          this.host.focusEditorAnchor();
        }
      } else if (result.result.status === 'conflict') {
        this.host.setStatus(t('settings.claudeCode.configuration.conflict'), 'error');
      } else {
        this.host.setStatus(t('settings.claudeCode.configuration.deleteFailed'), 'error');
      }
    } catch {
      if (this.host.isMutationContextCurrent(context, false)) {
        this.host.setStatus(t('settings.claudeCode.configuration.deleteFailed'), 'error');
      }
    } finally {
      this.deleteInFlight = false;
      if (this.host.isMutationContextCurrent(context, false)) {
        const current = this.host.captureMutationContext();
        trigger.disabled = current.sourceReadOnly || current.expectedRevision === null;
      }
    }
  }

  private renderHistoryEntry(
    container: HTMLElement,
    entry: { identity: ArchiveHistoryEntryIdentity; archiveKind: string; timestamp: number; size: number },
    context: ClaudeSettingsMutationContext,
  ): void {
    const row = document.createElement('div');
    row.className = 'opencodian-claude-configuration-history-row';
    row.setAttribute('data-claude-config-history-entry', String(entry.timestamp));
    appendText(
      row,
      'opencodian-claude-configuration-history-meta',
      `${formatClaudeSettingsHistoryKind(entry.archiveKind)} · ${formatClaudeSettingsHistoryTime(entry.timestamp)} · ${formatClaudeSettingsHistorySize(entry.size)}`,
    );
    const restore = this.createButton(t('settings.claudeCode.configuration.restore'), 'data-claude-config-history-restore');
    restore.disabled = context.sourceReadOnly;
    restore.addEventListener('click', () => this.requestRestore({ row, entryIdentity: entry.identity, context, trigger: restore }));
    row.appendChild(restore);
    container.appendChild(row);
  }

  private requestRestore(confirmation: RestoreConfirmation): void {
    if (confirmation.row.querySelector('[data-claude-config-restore-confirm]')) return;
    const root = document.createElement('div');
    root.setAttribute('data-claude-config-restore-confirm', 'true');
    appendText(
      root,
      'opencodian-claude-configuration-confirm-text',
      t('settings.claudeCode.configuration.restoreConfirm', {
        scope: claudeSettingsScopeLabel(confirmation.context.scope),
        path: confirmation.context.targetPath,
      }),
    );
    const accept = this.createButton(t('settings.claudeCode.configuration.confirm'), 'data-claude-config-restore-accept');
    const cancel = this.createButton(t('settings.claudeCode.configuration.cancel'), 'data-claude-config-restore-cancel');
    cancel.addEventListener('click', () => {
      root.remove();
      confirmation.trigger.focus();
    });
    accept.addEventListener('click', () => void this.restoreConfirmed({ ...confirmation, confirm: root, accept }));
    root.append(accept, cancel);
    confirmation.row.appendChild(root);
  }

  private async restoreConfirmed(args: RestoreConfirmation & { confirm: HTMLElement; accept: HTMLButtonElement }): Promise<void> {
    const { context, entryIdentity, confirm, accept } = args;
    const vaultPath = this.host.getVaultPath();
    if (!vaultPath || this.restoreInFlight) return;
    if (!this.host.isMutationContextCurrent(context, true)) {
      confirm.remove();
      this.host.setStatus(t('settings.claudeCode.configuration.confirmationStale'), 'warn');
      return;
    }
    this.restoreInFlight = true;
    accept.disabled = true;
    try {
      const result = await this.host.resolveService(vaultPath).restore({
        entryIdentity,
        expectedRevision: context.expectedRevision,
      });
      if (!this.host.isMutationContextCurrent(context, false)) return;
      if (result.result.status === 'success') {
        this.host.setExpectedRevision((result.result as { revision?: FileRevision }).revision ?? context.expectedRevision);
        confirm.remove();
        this.host.onAfterMutation?.();
        await this.host.refreshInventory();
        if (this.host.isMutationContextCurrent(context, false)) {
          this.host.setStatus(`${t('settings.claudeCode.configuration.restored')} ${formatClaudeSettingsEvidenceHuman(result.evidence)}`, 'ok');
          this.host.focusEditorAnchor();
        }
      } else if (result.result.status === 'conflict') {
        this.host.setStatus(t('settings.claudeCode.configuration.conflict'), 'error');
      } else {
        this.host.setStatus(t('settings.claudeCode.configuration.restoreFailed'), 'error');
      }
    } catch {
      if (this.host.isMutationContextCurrent(context, false)) {
        this.host.setStatus(t('settings.claudeCode.configuration.restoreFailed'), 'error');
      }
    } finally {
      this.restoreInFlight = false;
      if (this.host.isMutationContextCurrent(context, false)) accept.disabled = false;
    }
  }

  private isVisibleCurrentHistory(
    container: HTMLElement,
    context: ClaudeSettingsMutationContext,
    requestToken: number,
  ): boolean {
    return requestToken === this.historyRequestToken
      && !container.hidden
      && this.host.isMutationContextCurrent(context, true);
  }

  private createButton(text: string, dataName: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.title = text;
    button.setAttribute('aria-label', text);
    button.setAttribute(dataName, 'true');
    return button;
  }

  private clearChildren(element: HTMLElement): void {
    while (element.firstChild) element.removeChild(element.firstChild);
  }
}
