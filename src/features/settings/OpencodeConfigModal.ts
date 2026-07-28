/* eslint-disable max-lines -- The modal owns source selection, raw-byte editing, archive history, and evidence display. */
/**
 * OpenCode configuration source editor.
 *
 * P1-B deliberately edits the bytes returned by OpencodeConfigManager's
 * source API. It never parses and reserializes a whole JSON/JSONC document,
 * so comments, ordering, and unknown keys remain in the user's draft.
 */
import { App, Modal, Notice } from 'obsidian';

import type {
  ArchiveHistoryEntryIdentity,
  ArchiveHistoryTarget,
  ConfigurationEvidence,
  FileRevision,
} from '../../core/agents/backend/ProjectResourceSecureWrite';
import {
  OpencodeConfigManager,
} from '../../core/config';
import type {
  OpencodeConfigSourceCandidate,
  OpencodeConfigSourceMutationOutcome,
  OpencodeConfigSourceReadResult,
  OpencodeConfigSourceScope,
} from '../../core/config/OpencodeConfigSourceService';
import { t } from '../../i18n';
import { createLogger } from '../../shared';
import {
  enhanceSettingsSelect,
  type SettingsDropdownControlHandle,
} from './SettingsDropdownControl';
import { TextareaSizeMemory } from './TextareaSizeMemory';

const logger = createLogger('OpencodeConfigModal');
const DEFAULT_JSONC_TEMPLATE = '{\n  "$schema": "https://opencode.ai/config.json"\n}\n';

export interface OpencodeConfigModalOptions {
  /** Optional initial target; omission intentionally leaves source unselected. */
  readonly targetPath?: string;
  /** SettingsSecuritySection supplies this so stale backend callbacks fail closed. */
  readonly isMutationAllowed?: () => boolean;
}

type ReadState = 'unselected' | 'ready' | 'failed';

function isConflict(outcome: OpencodeConfigSourceMutationOutcome): boolean {
  return outcome.result.status === 'conflict';
}

function isSuccess(
  outcome: OpencodeConfigSourceMutationOutcome,
): outcome is OpencodeConfigSourceMutationOutcome & { result: { status: 'success'; revision: FileRevision } } {
  return outcome.result.status === 'success';
}

function pathBasename(filePath: string): string {
  const segments = filePath.split(/[\\/]/).filter((segment) => segment.length > 0);
  return segments.length > 0 ? segments[segments.length - 1] : filePath;
}

export class OpencodeConfigModal extends Modal {
  private readonly configManager: OpencodeConfigManager;
  private readonly options: OpencodeConfigModalOptions;
  private candidates: OpencodeConfigSourceCandidate[] = [];
  private selectedSource: OpencodeConfigSourceCandidate | null = null;
  private selectedPath: string | null = null;
  private selectionRequestToken = 0;
  private capturedRevision: FileRevision | null = null;
  private draft = '';
  private readState: ReadState = 'unselected';
  private editorEl: HTMLTextAreaElement | null = null;
  private editorSizeMemory: TextareaSizeMemory | null = null;
  private sourceSelectEl: HTMLSelectElement | null = null;
  private sourceSelectDropdownHandle: SettingsDropdownControlHandle | null = null;
  private metadataEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private actionsEl: HTMLElement | null = null;
  private historyEl: HTMLElement | null = null;
  private saveButtonEl: HTMLButtonElement | null = null;
  private deleteButtonEl: HTMLButtonElement | null = null;
  private saveInFlight = false;
  private deleteInFlight = false;
  private restoreInFlight = false;

  constructor(app: App, configManager: OpencodeConfigManager, options: OpencodeConfigModalOptions = {}) {
    super(app);
    this.configManager = configManager;
    this.options = options;
  }

  async onOpen(): Promise<void> {
    this.sourceSelectDropdownHandle?.destroy();
    this.sourceSelectDropdownHandle = null;
    this.contentEl.empty();
    this.selectedSource = null;
    this.selectedPath = null;
    this.capturedRevision = null;
    this.draft = '';
    this.readState = 'unselected';
    this.saveInFlight = false;
    this.deleteInFlight = false;
    this.restoreInFlight = false;
    this.editorSizeMemory?.destroy();
    this.editorSizeMemory = null;

    this.titleEl.setText(t('configEditor.title'));
    const shell = this.contentEl.createDiv({ cls: 'opencodian-modal-shell opencodian-config-source-modal' });
    const sourceSection = shell.createDiv({ cls: 'opencodian-modal-section opencodian-config-source-section' });
    sourceSection.createEl('h3', { text: t('configEditor.source.title') });
    sourceSection.createEl('p', { text: t('configEditor.source.description') });
    this.sourceSelectEl = sourceSection.createEl('select', {
      cls: 'opencodian-config-source-select',
      attr: { 'data-config-source-select': 'true', 'aria-label': t('configEditor.source.title') },
    });
    this.sourceSelectEl.addEventListener('change', () => {
      const selectedPath = this.sourceSelectEl?.value || null;
      void this.selectSource(selectedPath);
    });
    this.sourceSelectDropdownHandle = enhanceSettingsSelect(this.sourceSelectEl);
    this.renderSelectorPlaceholder();

    this.metadataEl = sourceSection.createDiv({ cls: 'opencodian-config-source-metadata' });
    this.statusEl = sourceSection.createDiv({ cls: 'opencodian-config-source-status' });
    this.statusEl.setAttribute('role', 'status');
    this.statusEl.setAttribute('aria-live', 'polite');
    this.statusEl.setText(t('configEditor.source.selectPrompt'));

    const editorSection = shell.createDiv({ cls: 'opencodian-modal-section opencodian-config-editor-section' });
    editorSection.createEl('h3', { text: t('configEditor.editor.title') });
    this.editorEl = editorSection.createEl('textarea', {
      cls: 'opencodian-config-editor',
      attr: {
        'data-config-editor': 'true',
        'aria-label': t('configEditor.editor.title'),
        spellcheck: 'false',
        placeholder: t('configEditor.editor.placeholder'),
      },
    });
    this.editorEl.disabled = true;
    this.editorEl.addEventListener('input', () => {
      this.draft = this.editorEl?.value ?? '';
    });
    this.editorSizeMemory = TextareaSizeMemory.attach(this.editorEl, 'opencode-config-editor');
    this.actionsEl = shell.createDiv({ cls: 'opencodian-config-buttons opencodian-modal-actions' });
    this.historyEl = shell.createDiv({ cls: 'opencodian-config-history' });
    this.renderSourceActions();
    this.renderHelpContent(shell);

    try {
      this.candidates = await this.configManager.inventoryConfigurationSources();
      this.renderSelectorOptions();
      const initialPath = this.options.targetPath && this.candidates.some((candidate) => candidate.path === this.options.targetPath)
        ? this.options.targetPath
        : null;
      if (initialPath) {
        if (this.sourceSelectEl) {
          this.sourceSelectEl.value = initialPath;
          this.sourceSelectDropdownHandle?.refresh();
        }
        await this.selectSource(initialPath);
      }
    } catch (error) {
      logger.error('Failed to inventory OpenCode configuration sources:', error);
      this.setStatus(t('configEditor.source.inventoryFailed'));
    }
  }

  onClose(): void {
    this.sourceSelectDropdownHandle?.destroy();
    this.sourceSelectDropdownHandle = null;
    this.editorSizeMemory?.destroy();
    this.editorSizeMemory = null;
    this.contentEl.empty();
  }

  private renderSelectorPlaceholder(): void {
    if (!this.sourceSelectEl) return;
    this.sourceSelectEl.empty();
    this.sourceSelectEl.createEl('option', {
      text: t('configEditor.source.selectPrompt'),
      attr: { value: '' },
    });
    this.sourceSelectEl.value = '';
    this.sourceSelectDropdownHandle?.refresh();
  }

  private renderSelectorOptions(): void {
    if (!this.sourceSelectEl) return;
    this.renderSelectorPlaceholder();
    for (const candidate of this.candidates) {
      const option = this.sourceSelectEl.createEl('option', {
        text: `${this.formatScopeLabel(candidate.scope)} · ${candidate.source} · ${pathBasename(candidate.path)}`,
      });
      option.value = candidate.path;
      // The full exact path stays one hover away; the metadata block below
      // always shows it in monospace next to the decision controls.
      option.title = candidate.path;
      option.setAttribute('data-config-source-option', candidate.source);
    }
    this.sourceSelectDropdownHandle?.refresh();
  }

  private async selectSource(targetPath: string | null): Promise<void> {
    const requestToken = ++this.selectionRequestToken;
    const isCurrentSelection = (): boolean => (
      requestToken === this.selectionRequestToken && this.selectedPath === targetPath
    );
    this.historyEl?.empty();
    if (!targetPath) {
      this.selectedSource = null;
      this.selectedPath = null;
      this.capturedRevision = null;
      this.draft = '';
      this.readState = 'unselected';
      if (this.editorEl) {
        this.editorEl.value = '';
        this.editorEl.disabled = true;
      }
      this.renderMetadata(null);
      this.setStatus(t('configEditor.source.selectPrompt'));
      this.renderSourceActions();
      return;
    }

    const candidate = this.candidates.find((entry) => entry.path === targetPath);
    if (!candidate) {
      this.setStatus(t('configEditor.source.invalidTarget'));
      return;
    }

    this.selectedPath = candidate.path;
    this.selectedSource = candidate;
    this.capturedRevision = candidate.revision;
    this.readState = 'failed';
    if (this.editorEl) {
      this.editorEl.value = '';
      this.editorEl.disabled = true;
    }
    this.renderMetadata(candidate);
    this.setStatus(t('configEditor.source.reading'));
    this.renderSourceActions();

    let readResult: OpencodeConfigSourceReadResult;
    try {
      readResult = await this.configManager.readConfigurationSource(candidate.path);
    } catch (error) {
      if (!isCurrentSelection()) return;
      logger.error('Failed to read OpenCode configuration source:', error);
      this.showReadFailure(t('configEditor.source.readFailure'));
      return;
    }
    if (!isCurrentSelection()) return;
    if (readResult.status !== 'success') {
      this.showReadFailure(t('configEditor.source.invalidTarget'));
      return;
    }

    this.selectedSource = readResult.source;
    this.capturedRevision = readResult.source.revision;
    this.renderMetadata(readResult.source);

    // A parse error with a real revision is repairable raw JSONC. Only a
    // failed-evidence read with no revision is unsafe and must not receive a
    // creation template.
    const unsafeRead = readResult.source.revision === null
      && readResult.source.evidence.persistence === 'failed';
    if (unsafeRead) {
      this.showReadFailure(readResult.source.parseError ?? t('configEditor.source.readFailure'));
      return;
    }

    this.readState = 'ready';
    this.draft = readResult.source.exists
      ? readResult.content
      : readResult.source.editable
        ? DEFAULT_JSONC_TEMPLATE
        : '';
    if (this.editorEl) {
      this.editorEl.value = this.draft;
      this.editorEl.disabled = !readResult.source.editable;
    }
    this.setStatus(readResult.source.editable
      ? readResult.source.exists
        ? t('configEditor.source.editableReady')
        : t('configEditor.source.newFileReady')
      : t('configEditor.source.managedReadonly'));
    this.renderSourceActions();
  }

  private renderMetadata(candidate: OpencodeConfigSourceCandidate | null): void {
    if (!this.metadataEl) return;
    this.metadataEl.empty();
    if (!candidate) return;
    this.appendMetadata('data-config-scope', t('configEditor.metadata.scope', { value: this.formatScopeLabel(candidate.scope) }));
    this.appendMetadata('data-config-source', t('configEditor.metadata.source', { value: candidate.source }));
    this.appendMetadata('data-config-path', t('configEditor.metadata.path', { value: candidate.path }));
    this.appendMetadata('data-config-exists', t('configEditor.metadata.exists', { value: this.formatBooleanLabel(candidate.exists) }));
    this.appendMetadata('data-config-editable', t('configEditor.metadata.editable', { value: this.formatBooleanLabel(candidate.editable) }));
    this.appendMetadata('data-config-revision', t('configEditor.metadata.revision', {
      value: candidate.revision ? candidate.revision.sha256.slice(0, 12) : t('configEditor.metadata.value.none'),
    }));
    if (candidate.parseError) {
      this.appendMetadata('data-config-parse-error', t('configEditor.metadata.parseError', { value: candidate.parseError }));
    }
    this.appendMetadata('data-config-evidence', this.formatEvidence(candidate.evidence));
  }

  private appendMetadata(attribute: string, text: string): void {
    if (!this.metadataEl) return;
    const row = this.metadataEl.createDiv({ cls: 'opencodian-config-source-metadata-row', text });
    row.setAttribute(attribute, 'true');
  }

  private formatScopeLabel(scope: OpencodeConfigSourceScope): string {
    return t(`configEditor.scope.${scope}`);
  }

  private formatBooleanLabel(value: boolean): string {
    return t(value ? 'configEditor.metadata.value.yes' : 'configEditor.metadata.value.no');
  }

  private formatEvidence(evidence: ConfigurationEvidence): string {
    return `${t('configEditor.metadata.evidence')}: ${t('configEditor.metadata.persistence', { value: this.formatEvidenceStatus(evidence.persistence) })}; ${t('configEditor.metadata.application', { value: this.formatEvidenceStatus(evidence.application) })}; ${t('configEditor.metadata.runtime', { value: this.formatEvidenceStatus(evidence.runtime) })}${evidence.detail ? ` · ${this.formatEvidenceDetail(evidence.detail)}` : ''}`;
  }

  private formatEvidenceStatus(status: ConfigurationEvidence['persistence']): string {
    return t(`configEditor.metadata.status.${status}`);
  }

  /** Localize the known backend detail strings; unknown text passes through verbatim. */
  private formatEvidenceDetail(detail: string): string {
    const readParsePrefix = 'Source could not be safely read or parsed: ';
    if (detail.startsWith(readParsePrefix)) {
      return t('configEditor.evidenceDetail.readParseFailed', { cause: detail.slice(readParsePrefix.length) });
    }
    const incompleteMatch = /^Persistence did not complete \((.+)\); no application\/runtime claim was made\.$/.exec(detail);
    if (incompleteMatch) {
      return t('configEditor.evidenceDetail.persistenceIncomplete', { status: incompleteMatch[1] });
    }
    switch (detail) {
      case 'Source bytes and revision were read from disk; backend application/runtime were not probed.':
        return t('configEditor.evidenceDetail.diskReadOnly');
      case 'Candidate does not exist; backend application/runtime were not probed.':
        return t('configEditor.evidenceDetail.candidateMissing');
      case 'Filesystem mutation and revision were verified. OpenCode must reload the source; no runtime readback was captured.':
        return t('configEditor.evidenceDetail.mutationVerified');
      default:
        return detail;
    }
  }

  private setStatus(text: string): void {
    this.statusEl?.setText(text);
  }

  private showReadFailure(message: string): void {
    this.readState = 'failed';
    this.draft = '';
    if (this.editorEl) {
      this.editorEl.value = '';
      this.editorEl.disabled = true;
    }
    this.setStatus(message);
    this.renderSourceActions();
  }

  private renderSourceActions(): void {
    if (!this.actionsEl) return;
    this.actionsEl.empty();
    this.saveButtonEl = null;
    this.deleteButtonEl = null;
    const source = this.selectedSource;

    if (source && this.readState === 'ready' && source.editable) {
      const save = this.actionsEl.createEl('button', {
        cls: 'mod-cta',
        text: t('configEditor.save'),
        attr: { type: 'button', 'data-config-save': 'true' },
      });
      save.addEventListener('click', () => void this.saveSource());
      this.saveButtonEl = save;

      if (source.exists) {
        const deleteButton = this.actionsEl.createEl('button', {
          text: t('configEditor.delete'),
          attr: { type: 'button', 'data-config-delete': 'true' },
        });
        deleteButton.addEventListener('click', () => void this.deleteSource(deleteButton));
        this.deleteButtonEl = deleteButton;
      }

      const history = this.actionsEl.createEl('button', {
        text: t('configEditor.history'),
        attr: { type: 'button', 'data-config-history': 'true' },
      });
      history.addEventListener('click', () => void this.renderHistory());
    }

    // Close is always available — including managed read-only and failed
    // reads, where no mutation action is offered.
    const close = this.actionsEl.createEl('button', {
      text: t('configEditor.close'),
      attr: { type: 'button', 'data-config-close': 'true' },
    });
    close.addEventListener('click', () => this.close());
  }

  private ensureMutationAllowed(): boolean {
    if (this.options.isMutationAllowed && !this.options.isMutationAllowed()) {
      new Notice(t('settings.security.notice.openCodeOnly'));
      return false;
    }
    return true;
  }

  private async saveSource(): Promise<void> {
    const source = this.selectedSource;
    if (!source || this.readState !== 'ready' || !source.editable || !this.selectedPath || this.saveInFlight || !this.ensureMutationAllowed()) return;
    const saveButton = this.saveButtonEl;
    this.saveInFlight = true;
    if (saveButton) {
      saveButton.disabled = true;
      saveButton.setText(t('configEditor.notice.saving'));
    }
    try {
      const requestToken = this.selectionRequestToken;
      const targetPath = this.selectedPath;
      this.draft = this.editorEl?.value ?? this.draft;
      let outcome: OpencodeConfigSourceMutationOutcome;
      try {
        outcome = await this.configManager.writeConfigurationSource({
          targetPath,
          content: this.draft,
          expectedRevision: this.capturedRevision,
        });
      } catch (error) {
        logger.error('Failed to save OpenCode configuration source:', error);
        this.setStatus(t('configEditor.notice.saveError'));
        return;
      }
      if (requestToken !== this.selectionRequestToken || this.selectedPath !== targetPath) return;

      if (isSuccess(outcome)) {
        this.capturedRevision = outcome.result.revision;
        this.selectedSource = {
          ...source,
          exists: true,
          revision: outcome.result.revision,
          evidence: outcome.evidence,
        };
        this.renderMetadata(this.selectedSource);
        this.setStatus(t('configEditor.notice.persistenceVerified'));
        new Notice(t('configEditor.notice.persistenceVerified'));
        this.close();
        return;
      }

      this.describeMutation(outcome);
      if (isConflict(outcome)) {
        // Keep both textarea and modal open; never replace the user's draft with
        // the externally changed bytes or force an overwrite.
        this.setStatus(t('configEditor.notice.conflictDraftRetained'));
      }
    } finally {
      this.saveInFlight = false;
      if (saveButton) {
        saveButton.disabled = false;
        saveButton.setText(t('configEditor.save'));
      }
    }
  }

  private async deleteSource(button: HTMLButtonElement | null = this.deleteButtonEl): Promise<void> {
    const source = this.selectedSource;
    if (!source || !source.exists || !source.editable || !this.selectedPath || this.deleteInFlight || !this.ensureMutationAllowed()) return;
    this.deleteInFlight = true;
    if (button) {
      button.disabled = true;
      button.setText(t('configEditor.notice.deleting'));
    }
    const requestToken = this.selectionRequestToken;
    const targetPath = this.selectedPath;
    try {
      let confirmed = false;
      try {
        confirmed = typeof window.confirm === 'function'
          && window.confirm(t('configEditor.notice.deleteConfirm')) === true;
      } catch {
        confirmed = false;
      }
      if (!confirmed) return;
      let outcome: OpencodeConfigSourceMutationOutcome;
      try {
        outcome = await this.configManager.deleteConfigurationSource({
          targetPath,
          expectedRevision: this.capturedRevision,
        });
      } catch (error) {
        logger.error('Failed to delete OpenCode configuration source:', error);
        this.setStatus(t('configEditor.notice.saveError'));
        return;
      }
      if (requestToken !== this.selectionRequestToken || this.selectedPath !== targetPath) return;
      if (isSuccess(outcome)) {
        new Notice(t('configEditor.notice.deleteSuccess'));
        await this.refreshSelectedSource();
        return;
      }
      this.describeMutation(outcome);
      if (isConflict(outcome)) this.setStatus(t('configEditor.notice.conflictDraftRetained'));
    } catch (error) {
      logger.error('Unexpected OpenCode configuration delete failure:', error);
      this.setStatus(t('configEditor.notice.saveError'));
    } finally {
      this.deleteInFlight = false;
      if (button) {
        button.disabled = false;
        button.setText(t('configEditor.delete'));
      }
    }
  }

  private async refreshSelectedSource(): Promise<void> {
    const selectedPath = this.selectedPath;
    this.candidates = await this.configManager.inventoryConfigurationSources();
    this.renderSelectorOptions();
    if (selectedPath && this.sourceSelectEl) this.sourceSelectEl.value = selectedPath;
    await this.selectSource(selectedPath);
  }

  private async renderHistory(): Promise<void> {
    if (!this.historyEl || !this.selectedSource || this.selectedSource.scope === 'managed') return;
    const requestToken = this.selectionRequestToken;
    const selectedPath = this.selectedPath;
    if (!selectedPath) return;
    this.historyEl.empty();
    this.historyEl.createEl('h4', { text: t('configEditor.historyTitle') });
    const outcome = await this.configManager.listConfigurationHistory(selectedPath);
    if (requestToken !== this.selectionRequestToken || this.selectedPath !== selectedPath) return;
    if (outcome.status !== 'success') {
      const cause = 'cause' in outcome ? outcome.cause : outcome.status;
      this.historyEl.createDiv({ cls: 'opencodian-config-history-error', text: t('configEditor.historyArchiveFailed', { cause }) });
      return;
    }
    if (outcome.targets.length === 0) {
      this.historyEl.createDiv({ cls: 'opencodian-config-history-empty', text: t('configEditor.historyEmpty') });
      return;
    }
    for (const target of outcome.targets) this.renderHistoryTarget(target);
  }

  private renderHistoryTarget(target: ArchiveHistoryTarget): void {
    if (!this.historyEl) return;
    const targetEl = this.historyEl.createDiv({ cls: 'opencodian-config-history-target' });
    targetEl.createDiv({ cls: 'opencodian-config-history-target-path', text: target.canonicalTarget });
    for (const entry of target.entries) {
      const row = targetEl.createDiv({ cls: 'opencodian-config-history-entry' });
      row.createSpan({ text: `${entry.archiveKind} · ${new Date(entry.timestamp).toLocaleString()} · ${entry.size}` });
      const restore = row.createEl('button', {
        text: t('configEditor.restore'),
        attr: { type: 'button', 'data-config-restore': 'true' },
      });
      restore.addEventListener('click', () => void this.restoreHistoryEntry(target, entry.identity, restore));
    }
  }

  private async restoreHistoryEntry(
    target: ArchiveHistoryTarget,
    entryIdentity: ArchiveHistoryEntryIdentity,
    button: HTMLButtonElement | null = null,
  ): Promise<void> {
    if (this.restoreInFlight || !this.ensureMutationAllowed()) return;
    this.restoreInFlight = true;
    if (button) {
      button.disabled = true;
      button.setText(t('configEditor.notice.restoring'));
    }
    const requestToken = this.selectionRequestToken;
    const selectedPath = this.selectedPath;
    try {
      let confirmed = false;
      try {
        confirmed = typeof window.confirm === 'function'
          && window.confirm(t('configEditor.notice.restoreConfirm')) === true;
      } catch {
        confirmed = false;
      }
      if (!confirmed) return;
      const current = this.resolveHistoryTargetCandidate(target);
      if (!current || !current.editable || current.path !== selectedPath) {
        this.setStatus(t('configEditor.source.invalidTarget'));
        return;
      }
      // Restore is guarded by the revision captured when this source was
      // selected. Re-inventorying here could bind a stale draft to a newer
      // revision and silently bypass the conflict the user needs to see.
      let outcome: OpencodeConfigSourceMutationOutcome;
      try {
        outcome = await this.configManager.restoreConfigurationHistory({
          entryIdentity,
          expectedRevision: this.capturedRevision,
        });
      } catch (error) {
        logger.error('Failed to restore OpenCode configuration history:', error);
        this.setStatus(t('configEditor.notice.saveError'));
        return;
      }
      if (requestToken !== this.selectionRequestToken || this.selectedPath !== selectedPath) return;
      if (!isSuccess(outcome)) {
        this.describeMutation(outcome);
        if (isConflict(outcome)) {
          const message = t('configEditor.notice.restoreConflict');
          new Notice(message);
          this.setStatus(message);
        }
        return;
      }
      new Notice(t('configEditor.restoreSuccess'));
      await this.refreshSelectedSource();
    } catch (error) {
      logger.error('Unexpected OpenCode configuration restore failure:', error);
      this.setStatus(t('configEditor.notice.saveError'));
    } finally {
      this.restoreInFlight = false;
      if (button) {
        button.disabled = false;
        button.setText(t('configEditor.restore'));
      }
    }
  }

  private resolveHistoryTargetCandidate(target: ArchiveHistoryTarget): OpencodeConfigSourceCandidate | null {
    const direct = this.candidates.find((candidate) => (
      candidate.path === target.canonicalTarget
      || candidate.revision?.canonicalPath === target.canonicalTarget
    ));
    if (direct) return direct;
    // A deleted target has no live canonical path to resolve. When the current
    // selection is the sole missing candidate in the archived scope, preserve
    // its lexical path and the revision captured at selection time.
    if (
      this.selectedSource
      && this.selectedSource.scope === target.scope
      && !this.selectedSource.exists
    ) {
      return this.selectedSource;
    }
    return null;
  }

  private describeMutation(outcome: OpencodeConfigSourceMutationOutcome): void {
    const status = outcome.result.status;
    const message = status === 'conflict'
      ? t('configEditor.notice.conflictDraftRetained')
      : status === 'archive-failed'
        ? t('configEditor.notice.archiveFailed')
        : status === 'invalid-content'
          ? t('configEditor.notice.invalidContent')
          : status === 'read-only'
            ? t('configEditor.notice.managedReadonly')
            : t('configEditor.notice.saveError');
    new Notice(message);
    this.setStatus(message);
  }

  private renderHelpContent(parent: HTMLElement): void {
    const helpShell = parent.createDiv({ cls: 'opencodian-help-modal-shell' });
    helpShell.createEl('h4', { text: t('configEditor.help.title') });
    const intro = helpShell.createDiv({ cls: 'opencodian-help-modal-section' });
    intro.createEl('p', { text: t('configEditor.help.intro') });
    const modes = [
      ['configEditor.help.mode1.title', 'configEditor.help.mode1.desc'],
      ['configEditor.help.mode2.title', 'configEditor.help.mode2.desc'],
      ['configEditor.help.mode3.title', 'configEditor.help.mode3.desc'],
    ] as const;
    for (const [titleKey, descKey] of modes) {
      const card = intro.createDiv({ cls: 'opencodian-help-modal-card' });
      card.createEl('strong', { text: t(titleKey) });
      card.createEl('p', { text: t(descKey) });
    }
    const tips = helpShell.createDiv({ cls: 'opencodian-help-modal-section' });
    tips.createEl('h5', { text: t('configEditor.help.tips.title') });
    const tipsList = tips.createEl('ul', { cls: 'opencodian-help-modal-list' });
    for (const key of ['configEditor.help.tips.tip1', 'configEditor.help.tips.tip2', 'configEditor.help.tips.tip3'] as const) {
      tipsList.createEl('li', { text: t(key) });
    }
    helpShell.createDiv({ cls: 'opencodian-help-modal-actions', text: t('configEditor.help.actions') });
  }
}
