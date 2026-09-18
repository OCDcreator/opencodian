/**
 * BatchOrganizeModal — template picker, parameter form, real preview and
 * confirm gate for R-B5 batch note organizing.
 *
 * Stage flow: configure → preview (file count + concrete list computed by the
 * coordinator from live vault state) → running → result. The confirmed
 * preview's signature accompanies the execute call, so any vault drift
 * between preview and confirm is rejected by the coordinator with zero
 * writes. Closing the modal (Esc) at any point before confirming performs no
 * write at all; while a batch is running the close is a no-op until the
 * result stage is shown.
 *
 * All template names, field labels and status lines come from the zh/en
 * locales (`batchOrganize.*`) — templates are a product asset, not string
 * literals in code.
 */

import type { App } from 'obsidian';
import { Modal, Notice } from 'obsidian';

import type { EditRevertActionResult } from '../../core/types';
import { t,type TranslationKey } from '../../i18n';
import {
  BATCH_ORGANIZE_TEMPLATE_IDS,
  type BatchOrganizeTemplateId,
  type BatchPropertyCondition,
  type BatchPropertyOperation,
  type BatchPropertyValue,
  type BatchScope,
  type BatchTemplateParams,
  parseBatchPropertyValue,
  validateTargetFolder,
} from '../../shared';
import type { BatchExecuteOutcome, BatchOrganizeCoordinator, BatchPreview } from './BatchOrganizeCoordinator';

/** Maximum operations rendered in the preview list before a "+N more" line. */
const PREVIEW_LIST_CAP = 200;

type Stage = 'configure' | 'preview' | 'running' | 'result';

interface ScopeFields {
  kind: HTMLSelectElement;
  tag: HTMLInputElement;
  propertyName: HTMLInputElement;
  propertyValue: HTMLInputElement;
  keyword: HTMLInputElement;
}

export class BatchOrganizeModal extends Modal {
  private stage: Stage = 'configure';
  private templateId: BatchOrganizeTemplateId = 'move-notes';
  private confirmedPreview: BatchPreview | null = null;
  private confirmedTemplate: BatchTemplateParams | null = null;
  private outcome: BatchExecuteOutcome | null = null;
  private revertDone = false;

  // scope form
  private scopeFields!: ScopeFields;
  // template-specific form
  private folderInput!: HTMLInputElement;
  private opKind!: HTMLSelectElement;
  private opName!: HTMLInputElement;
  private opType!: HTMLSelectElement;
  private opValue!: HTMLInputElement;
  private conditionName!: HTMLInputElement;
  private conditionValue!: HTMLInputElement;
  private findInput!: HTMLInputElement;
  private replaceInput!: HTMLInputElement;
  private regexToggle!: HTMLInputElement;

  constructor(
    app: App,
    private readonly coordinator: BatchOrganizeCoordinator,
  ) {
    super(app);
  }

  onOpen(): void {
    this.render();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  /** Closing while a batch runs would orphan the result UI; hold until done. */
  close(): void {
    if (this.stage === 'running') {
      return;
    }
    super.close();
  }

  private render(): void {
    this.contentEl.empty();
    switch (this.stage) {
      case 'configure':
        this.renderConfigure();
        break;
      case 'preview':
        this.renderPreview();
        break;
      case 'running':
        this.renderRunning();
        break;
      case 'result':
        this.renderResult();
        break;
    }
  }

  // --- configure ------------------------------------------------------------------

  private renderConfigure(): void {
    this.contentEl.createEl('h3', { text: t('batchOrganize.title') });
    this.contentEl.createEl('p', {
      cls: 'opencodian-batch-organize-hint',
      text: t('batchOrganize.configureHint'),
    });

    const templateSelect = this.contentEl.createDiv({ cls: 'opencodian-batch-organize-row' }).createEl('select');
    for (const id of BATCH_ORGANIZE_TEMPLATE_IDS) {
      templateSelect.createEl('option', { value: id, text: t(`batchOrganize.template.${id}` as TranslationKey) });
    }
    templateSelect.value = this.templateId;
    templateSelect.addEventListener('change', () => {
      this.templateId = templateSelect.value as BatchOrganizeTemplateId;
      this.render();
    });

    this.renderScopeForm();
    switch (this.templateId) {
      case 'move-notes':
        this.renderMoveForm();
        break;
      case 'edit-properties':
        this.renderPropertyForm();
        break;
      case 'rename-by-rule':
        this.renderRenameForm();
        break;
    }

    const errorEl = this.contentEl.createDiv({ cls: 'opencodian-batch-organize-error' });
    const previewButton = createButton(this.contentEl, t('batchOrganize.preview'), 'mod-cta');
    previewButton.addEventListener('click', () => {
      void this.handlePreview(errorEl);
    });
  }

  private renderScopeForm(): void {
    const row = this.contentEl.createDiv({ cls: 'opencodian-batch-organize-row' });
    row.createEl('label', { text: t('batchOrganize.scope.label') });
    const kind = row.createEl('select');
    for (const [value, key] of [
      ['tag', 'batchOrganize.scope.tag'],
      ['property', 'batchOrganize.scope.property'],
      ['keyword', 'batchOrganize.scope.keyword'],
    ] as const) {
      kind.createEl('option', { value, text: t(key) });
    }
    const tag = this.createTextInput(t('batchOrganize.scope.tagPlaceholder'));
    const propertyName = this.createTextInput(t('batchOrganize.scope.propertyNamePlaceholder'));
    const propertyValue = this.createTextInput(t('batchOrganize.scope.propertyValuePlaceholder'));
    const keyword = this.createTextInput(t('batchOrganize.scope.keywordPlaceholder'));
    this.scopeFields = { kind, tag, propertyName, propertyValue, keyword };
    const fieldRow = this.contentEl.createDiv({ cls: 'opencodian-batch-organize-row' });
    for (const el of [tag, propertyName, propertyValue, keyword]) {
      fieldRow.appendChild(el);
    }
    const sync = (): void => {
      tag.style.display = kind.value === 'tag' ? '' : 'none';
      propertyName.style.display = kind.value === 'property' ? '' : 'none';
      propertyValue.style.display = kind.value === 'property' ? '' : 'none';
      keyword.style.display = kind.value === 'keyword' ? '' : 'none';
    };
    kind.addEventListener('change', sync);
    sync();
  }

  private createTextInput(placeholder: string): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = placeholder;
    input.addClass('opencodian-batch-organize-input');
    return input;
  }

  private renderMoveForm(): void {
    const row = this.contentEl.createDiv({ cls: 'opencodian-batch-organize-row' });
    row.createEl('label', { text: t('batchOrganize.targetFolder') });
    this.folderInput = this.createTextInput(t('batchOrganize.targetFolderPlaceholder'));
    row.appendChild(this.folderInput);
  }

  private renderPropertyForm(): void {
    const opRow = this.contentEl.createDiv({ cls: 'opencodian-batch-organize-row' });
    opRow.createEl('label', { text: t('batchOrganize.operation') });
    this.opKind = opRow.createEl('select');
    for (const [value, key] of [
      ['set', 'batchOrganize.op.set'],
      ['remove', 'batchOrganize.op.remove'],
      ['set-if', 'batchOrganize.op.setIf'],
    ] as const) {
      this.opKind.createEl('option', { value, text: t(key) });
    }
    this.opName = this.createTextInput(t('batchOrganize.propertyName'));
    opRow.appendChild(this.opName);

    const typeRow = this.contentEl.createDiv({ cls: 'opencodian-batch-organize-row' });
    typeRow.createEl('label', { text: t('batchOrganize.valueType') });
    this.opType = typeRow.createEl('select');
    for (const value of ['text', 'number', 'boolean', 'list'] as const) {
      this.opType.createEl('option', { value, text: t(`batchOrganize.valueType.${value}` as TranslationKey) });
    }
    this.opValue = this.createTextInput(t('batchOrganize.valuePlaceholder'));
    typeRow.appendChild(this.opValue);

    const conditionRow = this.contentEl.createDiv({ cls: 'opencodian-batch-organize-row' });
    conditionRow.createEl('label', { text: t('batchOrganize.condition') });
    this.conditionName = this.createTextInput(t('batchOrganize.conditionNamePlaceholder'));
    this.conditionValue = this.createTextInput(t('batchOrganize.conditionValuePlaceholder'));
    conditionRow.appendChild(this.conditionName);
    conditionRow.appendChild(this.conditionValue);

    const sync = (): void => {
      const conditional = this.opKind.value === 'set-if';
      const removal = this.opKind.value === 'remove';
      this.conditionName.style.display = conditional ? '' : 'none';
      this.conditionValue.style.display = conditional ? '' : 'none';
      this.opType.style.display = removal ? 'none' : '';
      this.opValue.style.display = removal ? 'none' : '';
    };
    this.opKind.addEventListener('change', sync);
    sync();
  }

  private renderRenameForm(): void {
    const findRow = this.contentEl.createDiv({ cls: 'opencodian-batch-organize-row' });
    findRow.createEl('label', { text: t('batchOrganize.find') });
    this.findInput = this.createTextInput(t('batchOrganize.findPlaceholder'));
    findRow.appendChild(this.findInput);

    const replaceRow = this.contentEl.createDiv({ cls: 'opencodian-batch-organize-row' });
    replaceRow.createEl('label', { text: t('batchOrganize.replaceWith') });
    this.replaceInput = this.createTextInput(t('batchOrganize.replaceWithPlaceholder'));
    replaceRow.appendChild(this.replaceInput);

    const regexRow = this.contentEl.createDiv({ cls: 'opencodian-batch-organize-row' });
    this.regexToggle = regexRow.createEl('input', { attr: { type: 'checkbox' } });
    regexRow.createEl('label', { text: t('batchOrganize.useRegex') });
  }

  // --- preview --------------------------------------------------------------------

  private async handlePreview(errorEl: HTMLElement): Promise<void> {
    const gathered = this.gatherTemplateParams();
    if (!gathered.ok) {
      errorEl.setText(t(gathered.error as TranslationKey));
      return;
    }
    const outcome = await this.coordinator.buildPreview(gathered.params);
    if (outcome.status === 'invalid') {
      errorEl.setText(t(`batchOrganize.error.${outcome.code}` as TranslationKey));
      return;
    }
    this.confirmedPreview = outcome.preview;
    this.confirmedTemplate = gathered.params;
    this.stage = 'preview';
    this.render();
  }

  private renderPreview(): void {
    if (!this.confirmedPreview) {
      this.stage = 'configure';
      this.render();
      return;
    }
    const { result } = this.confirmedPreview;
    this.contentEl.createEl('h3', { text: t('batchOrganize.preview.title', { count: result.plan.operations.length }) });
    this.contentEl.createEl('p', {
      cls: 'opencodian-batch-organize-hint',
      text: t('batchOrganize.preview.hint'),
    });

    const listEl = this.contentEl.createDiv({ cls: 'opencodian-batch-organize-list' });
    const operations = result.plan.operations;
    for (const operation of operations.slice(0, PREVIEW_LIST_CAP)) {
      const row = listEl.createDiv({ cls: 'opencodian-batch-organize-item' });
      if (operation.kind === 'edit-properties') {
        row.setText(operation.path);
      } else {
        row.setText(`${operation.from} → ${operation.to}`);
      }
    }
    if (operations.length > PREVIEW_LIST_CAP) {
      listEl.createDiv({
        cls: 'opencodian-batch-organize-hint',
        text: t('batchOrganize.preview.more', { count: operations.length - PREVIEW_LIST_CAP }),
      });
    }
    // Honest disclosure: folders that do not exist yet will be created.
    if (this.confirmedPreview.foldersToCreate.length > 0) {
      listEl.createDiv({
        cls: 'opencodian-batch-organize-hint',
        text: t('batchOrganize.preview.newFolders', {
          folders: this.confirmedPreview.foldersToCreate.join(', '),
        }),
      });
    }
    for (const conflict of result.conflicts) {
      const row = listEl.createDiv({ cls: 'opencodian-batch-organize-conflict' });
      row.setText(
        t('batchOrganize.conflict.entry', {
          from: conflict.from,
          to: conflict.to,
          reason: t(`batchOrganize.conflict.${conflict.reason}` as TranslationKey),
        }),
      );
    }

    const buttons = this.contentEl.createDiv({ cls: 'opencodian-batch-organize-buttons' });
    const confirmButton = createButton(
      buttons,
      t('batchOrganize.confirm', { count: operations.length }),
      'mod-cta',
    );
    confirmButton.disabled = operations.length === 0;
    confirmButton.addEventListener('click', () => {
      void this.handleExecute();
    });
    const backButton = createButton(buttons, t('batchOrganize.back'));
    backButton.addEventListener('click', () => {
      this.stage = 'configure';
      this.render();
    });
  }

  // --- execute / result -------------------------------------------------------------

  private renderRunning(): void {
    this.contentEl.createEl('h3', { text: t('batchOrganize.title') });
    this.contentEl.createEl('p', { cls: 'opencodian-batch-organize-hint', text: t('batchOrganize.running') });
  }

  private async handleExecute(): Promise<void> {
    if (!this.confirmedPreview || !this.confirmedTemplate) {
      return;
    }
    this.stage = 'running';
    this.render();
    const outcome = await this.coordinator.execute(this.confirmedTemplate, this.confirmedPreview.signature);
    this.outcome = outcome;
    if (outcome.status === 'stale-plan') {
      new Notice(t('batchOrganize.error.stalePlan'));
      this.stage = 'configure';
    } else if (outcome.status === 'snapshot-unavailable') {
      new Notice(t('batchOrganize.error.snapshotUnavailable'));
      this.stage = 'configure';
    } else if (outcome.status === 'empty') {
      new Notice(t('batchOrganize.notice.nothingToDo'));
      this.stage = 'configure';
    } else if (outcome.status === 'folder-unavailable') {
      new Notice(t('batchOrganize.error.folderUnavailable', { folder: outcome.folder }));
      this.stage = 'configure';
    } else {
      this.revertDone = false;
      this.stage = 'result';
    }
    this.render();
  }

  private renderResult(): void {
    const outcome = this.outcome;
    if (!outcome || outcome.status !== 'ok') {
      this.stage = 'configure';
      this.render();
      return;
    }
    this.contentEl.createEl('h3', { text: t('batchOrganize.result.title') });
    this.contentEl.createEl('p', {
      text: t('batchOrganize.result.changed', { count: outcome.changed }),
    });
    if (outcome.createdFolders.length > 0) {
      this.contentEl.createEl('p', {
        cls: 'opencodian-batch-organize-hint',
        text: t('batchOrganize.result.createdFolders', { folders: outcome.createdFolders.join(', ') }),
      });
    }
    if (outcome.failures.length > 0) {
      const failEl = this.contentEl.createDiv({ cls: 'opencodian-batch-organize-conflict' });
      failEl.setText(t('batchOrganize.result.skipped', { count: outcome.failures.length }));
      const listEl = failEl.createDiv({ cls: 'opencodian-batch-organize-list' });
      for (const path of outcome.failures.slice(0, PREVIEW_LIST_CAP)) {
        listEl.createDiv({ cls: 'opencodian-batch-organize-item', text: path });
      }
    }

    const buttons = this.contentEl.createDiv({ cls: 'opencodian-batch-organize-buttons' });
    const revertButton = createButton(buttons, t('batchOrganize.result.revertAll'));
    revertButton.disabled = this.revertDone || outcome.changed === 0;
    revertButton.addEventListener('click', () => {
      void this.handleRevert(revertButton);
    });
    const closeButton = createButton(buttons, t('batchOrganize.close'));
    closeButton.addEventListener('click', () => super.close());
  }

  private async handleRevert(button: HTMLButtonElement): Promise<void> {
    this.revertDone = true;
    button.disabled = true;
    await revertLastBatchAndNotify(this.coordinator);
  }

  // --- form → template params ---------------------------------------------------------

  private gatherTemplateParams(): { ok: true; params: BatchTemplateParams } | { ok: false; error: string } {
    const scope = this.gatherScope();
    if (!scope) {
      return { ok: false, error: 'batchOrganize.error.emptyScope' };
    }
    switch (this.templateId) {
      case 'move-notes': {
        const folder = validateTargetFolder(this.folderInput.value);
        if (folder === null) {
          return { ok: false, error: 'batchOrganize.error.invalid-folder' };
        }
        return { ok: true, params: { templateId: 'move-notes', params: { scope, targetFolder: folder } } };
      }
      case 'edit-properties': {
        const operation = this.gatherPropertyOperation();
        if (!operation) {
          return { ok: false, error: 'batchOrganize.error.invalidValue' };
        }
        return { ok: true, params: { templateId: 'edit-properties', params: { scope, operation } } };
      }
      case 'rename-by-rule': {
        if (!this.findInput.value.trim()) {
          return { ok: false, error: 'batchOrganize.error.invalid-rename-rule' };
        }
        return {
          ok: true,
          params: {
            templateId: 'rename-by-rule',
            params: {
              scope,
              find: this.findInput.value,
              replaceWith: this.replaceInput.value,
              useRegex: this.regexToggle.checked,
            },
          },
        };
      }
    }
  }

  private gatherScope(): BatchScope | null {
    switch (this.scopeFields.kind.value) {
      case 'tag': {
        const tag = this.scopeFields.tag.value.trim();
        return tag ? { kind: 'tag', tag } : null;
      }
      case 'property': {
        const name = this.scopeFields.propertyName.value.trim();
        if (!name) {
          return null;
        }
        const rawValue = this.scopeFields.propertyValue.value.trim();
        return { kind: 'property', name, value: rawValue === '' ? null : rawValue };
      }
      case 'keyword': {
        const text = this.scopeFields.keyword.value.trim();
        return text ? { kind: 'keyword', text } : null;
      }
      default:
        return null;
    }
  }

  private gatherPropertyOperation(): BatchPropertyOperation | null {
    const name = this.opName.value.trim();
    if (!name) {
      return null;
    }
    if (this.opKind.value === 'remove') {
      return { op: 'remove', name };
    }
    const value = this.parseValueInput();
    if (!value) {
      return null;
    }
    if (this.opKind.value === 'set') {
      return { op: 'set', name, value };
    }
    const conditionName = this.conditionName.value.trim();
    if (!conditionName) {
      return null;
    }
    const conditionValue = this.conditionValue.value.trim();
    const condition: BatchPropertyCondition = conditionValue === ''
      ? { kind: 'exists', name: conditionName }
      : { kind: 'equals', name: conditionName, value: conditionValue };
    return { op: 'set-if', name, value, condition };
  }

  private parseValueInput(): BatchPropertyValue | null {
    const type = this.opType.value as BatchPropertyValue['type'];
    const parsed = parseBatchPropertyValue(this.opValue.value, type);
    if (parsed) {
      return parsed;
    }
    // Tolerate uppercase boolean spellings ("TRUE"/"True").
    if (type === 'boolean') {
      return parseBatchPropertyValue(this.opValue.value.trim().toLowerCase(), type);
    }
    return null;
  }
}

/**
 * Confirmation gate for the "revert last batch" command. Dismissal counts as
 * cancel (fail closed): a revert only ever happens from an explicit click.
 */
export class BatchRevertConfirmModal extends Modal {
  constructor(
    app: App,
    private readonly coordinator: BatchOrganizeCoordinator,
  ) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.createEl('h3', { text: t('batchOrganize.revertConfirm.title') });
    this.contentEl.createEl('p', { text: t('batchOrganize.revertConfirm.desc') });

    const buttons = this.contentEl.createDiv({ cls: 'opencodian-batch-organize-buttons' });
    const revertButton = createButton(buttons, t('batchOrganize.result.revertAll'), 'mod-cta');
    revertButton.addEventListener('click', () => {
      void this.handleRevert();
    });
    const cancelButton = createButton(buttons, t('batchOrganize.revertConfirm.cancel'));
    cancelButton.addEventListener('click', () => this.close());
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async handleRevert(): Promise<void> {
    this.close();
    await revertLastBatchAndNotify(this.coordinator);
  }
}

function createButton(parent: HTMLElement, label: string, cls?: string): HTMLButtonElement {
  return parent.createEl('button', { text: label, attr: { type: 'button' }, ...(cls ? { cls } : {}) });
}

/** Shared revert outcome reporting for the result stage and the confirm dialog. */
async function revertLastBatchAndNotify(coordinator: BatchOrganizeCoordinator): Promise<boolean> {
  const result: EditRevertActionResult | null = await coordinator.revertLastBatch();
  if (!result) {
    new Notice(t('batchOrganize.error.revertUnavailable'));
    return false;
  }
  if (result.ok) {
    new Notice(t('editRevert.notice.revertAll', { count: result.changed, skippedDetail: '' }));
  } else {
    new Notice(t('editRevert.notice.failed', { error: result.error ?? 'unknown' }));
  }
  return result.ok;
}
