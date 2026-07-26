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
import { t } from '../../i18n';

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
  setStatus(message: string, level: ClaudeSettingsStatusLevel): void;
  refreshInventory(): Promise<void>;
  refreshSaveControl(): void;
  onAfterMutation?(): void;
}

export interface ClaudeSettingsSaveControls {
  saveButton: HTMLButtonElement;
  reloadButton: HTMLButtonElement;
  compareButton: HTMLButtonElement;
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
}

/** True only when revision identities represent the same exact file snapshot. */
export function sameClaudeSettingsRevision(left: FileRevision | null, right: FileRevision | null): boolean {
  return left === right || (left !== null && right !== null
    && left.canonicalPath === right.canonicalPath
    && left.mtimeMs === right.mtimeMs
    && left.size === right.size
    && left.sha256 === right.sha256);
}

/** Formats evidence without ever inferring or promoting a verification axis. */
export function formatClaudeSettingsEvidence(evidence: { persistence: string; application: string; runtime: string }): string {
  return `persistence=${evidence.persistence}; application=${evidence.application}; runtime=${evidence.runtime}`;
}

export class ClaudeSettingsMutationController {
  private saveInFlight = false;
  private deleteInFlight = false;
  private restoreInFlight = false;
  private compareInFlight = false;

  constructor(private readonly host: ClaudeSettingsMutationHost) {}

  isSaveInFlight(): boolean {
    return this.saveInFlight;
  }

  /** Save the exact draft snapshot under the current selection/revision CAS. */
  async save(controls: ClaudeSettingsSaveControls): Promise<void> {
    if (this.saveInFlight) return;
    const context = this.host.captureMutationContext();
    const vaultPath = this.host.getVaultPath();
    if (!vaultPath || context.sourceReadOnly) return;
    const draft = this.host.getDraft();
    const service = this.host.resolveService(vaultPath);
    this.saveInFlight = true;
    this.host.refreshSaveControl();
    try {
      const result = await service.write({
        targetPath: context.targetPath,
        content: draft,
        expectedRevision: context.expectedRevision,
      });
      if (!this.host.isMutationContextCurrent(context, false)) return;
      if (result.result.status === 'success') {
        this.host.setExpectedRevision((result.result as { revision?: FileRevision }).revision ?? context.expectedRevision);
        controls.reloadButton.hidden = true;
        controls.compareButton.hidden = true;
        this.host.onAfterMutation?.();
        await this.host.refreshInventory();
        if (this.host.isMutationContextCurrent(context, false)) {
          this.host.setStatus(`${t('settings.claudeCode.configuration.saved')} ${formatClaudeSettingsEvidence(result.evidence)}`, 'ok');
        }
      } else if (result.result.status === 'conflict') {
        controls.reloadButton.hidden = false;
        controls.compareButton.hidden = false;
        this.host.setStatus(t('settings.claudeCode.configuration.conflict'), 'error');
      } else {
        this.host.setStatus(t('settings.claudeCode.configuration.saveFailed'), 'error');
      }
    } catch {
      if (this.host.isMutationContextCurrent(context, false)) {
        this.host.setStatus(t('settings.claudeCode.configuration.saveFailed'), 'error');
      }
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
    this.appendText(confirm, 'opencodian-claude-configuration-confirm-text', t('settings.claudeCode.configuration.deleteConfirm'));
    const accept = this.createButton(t('settings.claudeCode.configuration.confirm'), 'data-claude-config-delete-accept');
    const cancel = this.createButton(t('settings.claudeCode.configuration.cancel'), 'data-claude-config-delete-cancel');
    cancel.addEventListener('click', () => confirm.remove());
    accept.addEventListener('click', () => {
      void this.deleteConfirmed({ context, confirm, accept, trigger: controls.trigger });
    });
    confirm.append(accept, cancel);
    controls.container.appendChild(confirm);
  }

  /** Read history without materializing a missing root, then render exact-target entries. */
  async toggleHistory(container: HTMLElement): Promise<void> {
    if (!container.hidden) {
      container.hidden = true;
      this.clearChildren(container);
      return;
    }
    const context = this.host.captureMutationContext();
    const vaultPath = this.host.getVaultPath();
    if (!vaultPath) return;
    container.hidden = false;
    this.clearChildren(container);
    this.appendText(container, 'opencodian-claude-configuration-history-loading', t('settings.claudeCode.configuration.historyLoading'));
    const service = this.host.resolveService(vaultPath);
    try {
      const result = await service.listHistory(context.targetPath);
      if (!this.isVisibleCurrentHistory(container, context)) return;
      this.clearChildren(container);
      if (result.status !== 'success') {
        this.appendText(container, 'opencodian-claude-configuration-history-error', t('settings.claudeCode.configuration.historyFailed'));
        return;
      }
      const target = result.targets.length === 1 ? result.targets[0] : undefined;
      if (!target || target.entries.length === 0) {
        this.appendText(container, 'opencodian-claude-configuration-history-empty', t('settings.claudeCode.configuration.historyEmpty'));
        return;
      }
      for (const entry of target.entries) this.renderHistoryEntry(container, entry, context);
    } catch {
      if (this.isVisibleCurrentHistory(container, context)) {
        this.clearChildren(container);
        this.appendText(container, 'opencodian-claude-configuration-history-error', t('settings.claudeCode.configuration.historyFailed'));
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
          this.host.setStatus(`${t('settings.claudeCode.configuration.deleted')} ${formatClaudeSettingsEvidence(result.evidence)}`, 'ok');
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
    this.appendText(row, 'opencodian-claude-configuration-history-meta', `${entry.archiveKind} · ${new Date(entry.timestamp).toLocaleString()} · ${entry.size}`);
    const restore = this.createButton(t('settings.claudeCode.configuration.restore'), 'data-claude-config-history-restore');
    restore.disabled = context.sourceReadOnly;
    restore.addEventListener('click', () => this.requestRestore({ row, entryIdentity: entry.identity, context }));
    row.appendChild(restore);
    container.appendChild(row);
  }

  private requestRestore(confirmation: RestoreConfirmation): void {
    if (confirmation.row.querySelector('[data-claude-config-restore-confirm]')) return;
    const root = document.createElement('div');
    root.setAttribute('data-claude-config-restore-confirm', 'true');
    this.appendText(root, 'opencodian-claude-configuration-confirm-text', t('settings.claudeCode.configuration.restoreConfirm'));
    const accept = this.createButton(t('settings.claudeCode.configuration.confirm'), 'data-claude-config-restore-accept');
    const cancel = this.createButton(t('settings.claudeCode.configuration.cancel'), 'data-claude-config-restore-cancel');
    cancel.addEventListener('click', () => root.remove());
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
          this.host.setStatus(`${t('settings.claudeCode.configuration.restored')} ${formatClaudeSettingsEvidence(result.evidence)}`, 'ok');
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

  private isVisibleCurrentHistory(container: HTMLElement, context: ClaudeSettingsMutationContext): boolean {
    return !container.hidden && this.host.isMutationContextCurrent(context, true);
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

  private appendText(parent: HTMLElement, className: string, text: string): HTMLElement {
    const node = document.createElement('span');
    node.className = className;
    node.textContent = text;
    parent.appendChild(node);
    return node;
  }

  private clearChildren(element: HTMLElement): void {
    while (element.firstChild) element.removeChild(element.firstChild);
  }
}
