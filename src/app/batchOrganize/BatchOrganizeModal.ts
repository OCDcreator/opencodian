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
 *
 * Presentation contract (DESIGN.md §5 Modal Layout): every stage renders one
 * `.opencodian-modal-shell` inside `.modal-content`; spacing comes from the
 * shared `--opencodian-modal-*` tokens, form rows are label + control columns
 * (`.opencodian-batch-organize-row`), and action rows are
 * `.opencodian-modal-actions` (right-aligned behind a top separator). Styles:
 * `src/style/modals/batch-organize-modal.css`.
 */

import type { App } from 'obsidian';
import { Modal, Notice } from 'obsidian';

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
import type {
  BatchExecuteOutcome,
  BatchOrganizeCoordinator,
  BatchPreview,
  BatchRevertResult,
} from './BatchOrganizeCoordinator';

/** Maximum operations rendered in the preview list before a "+N more" line. */
const PREVIEW_LIST_CAP = 200;

/** Shared DOM id for the "use regex" checkbox ↔ label association. */
const USE_REGEX_CHECKBOX_ID = 'opencodian-batch-organize-use-regex';

type Stage = 'configure' | 'preview' | 'running' | 'result';

interface ScopeFields {
  kind: HTMLSelectElement;
  tag: HTMLInputElement;
  propertyName: HTMLInputElement;
  propertyValue: HTMLInputElement;
  keyword: HTMLInputElement;
}

interface FormRow {
  row: HTMLDivElement;
  label: HTMLLabelElement;
  control: HTMLDivElement;
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
    this.modalEl.addClass('opencodian-batch-organize-modal');
    this.render();
  }

  onClose(): void {
    this.modalEl.removeClass('opencodian-batch-organize-modal');
    this.contentEl.empty();
  }

  /** Closing while a batch runs would orphan the result UI; hold until done. */
  close(): void {
    if (this.stage === 'running') {
      return;
    }
    super.close();
  }

  // --- shell helpers -----------------------------------------------------------------

  private createShell(): HTMLDivElement {
    return this.contentEl.createDiv({ cls: 'opencodian-modal-shell' });
  }

  private createHeader(shell: HTMLElement, title: string, hintKey?: TranslationKey): HTMLDivElement {
    const header = shell.createDiv({ cls: 'opencodian-modal-section opencodian-batch-organize-header' });
    header.createEl('h3', { text: title });
    if (hintKey) {
      header.createEl('p', { cls: 'opencodian-batch-organize-hint', text: t(hintKey) });
    }
    return header;
  }

  /** One label + control form row on the documented modal form anatomy. */
  private createFormRow(grid: HTMLElement, labelText: string): FormRow {
    const row = grid.createDiv({ cls: 'opencodian-batch-organize-row' });
    const label = row.createEl('label', { text: labelText });
    const control = row.createDiv({ cls: 'opencodian-batch-organize-control' });
    return { row, label, control };
  }

  private createTextInput(placeholder: string): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = placeholder;
    input.addClass('opencodian-batch-organize-input');
    return input;
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
    const shell = this.createShell();
    this.createHeader(shell, t('batchOrganize.title'), 'batchOrganize.configureHint');

    const grid = shell.createDiv({ cls: 'opencodian-modal-form-grid opencodian-batch-organize-form' });

    const templateRow = this.createFormRow(grid, t('batchOrganize.template.label'));
    const templateSelect = templateRow.control.createEl('select');
    for (const id of BATCH_ORGANIZE_TEMPLATE_IDS) {
      templateSelect.createEl('option', { value: id, text: t(`batchOrganize.template.${id}` as TranslationKey) });
    }
    templateSelect.value = this.templateId;
    templateSelect.addEventListener('change', () => {
      this.templateId = templateSelect.value as BatchOrganizeTemplateId;
      this.render();
    });

    this.renderScopeForm(grid);
    switch (this.templateId) {
      case 'move-notes':
        this.renderMoveForm(grid);
        break;
      case 'edit-properties':
        this.renderPropertyForm(grid);
        break;
      case 'rename-by-rule':
        this.renderRenameForm(grid);
        break;
    }

    const errorEl = shell.createDiv({ cls: 'opencodian-batch-organize-error' });

    const actions = shell.createDiv({ cls: 'opencodian-modal-actions' });
    const previewButton = createButton(actions, t('batchOrganize.preview'), 'mod-cta');
    previewButton.addEventListener('click', () => {
      void this.handlePreview(errorEl);
    });
  }

  private renderScopeForm(grid: HTMLElement): void {
    const kindRow = this.createFormRow(grid, t('batchOrganize.scope.label'));
    const kind = kindRow.control.createEl('select');
    for (const [value, key] of [
      ['tag', 'batchOrganize.scope.tag'],
      ['property', 'batchOrganize.scope.property'],
      ['keyword', 'batchOrganize.scope.keyword'],
    ] as const) {
      kind.createEl('option', { value, text: t(key) });
    }

    const tagRow = this.createFormRow(grid, t('batchOrganize.scope.tag'));
    const tag = this.createTextInput(t('batchOrganize.scope.tagPlaceholder'));
    tagRow.control.appendChild(tag);

    const propertyNameRow = this.createFormRow(grid, t('batchOrganize.propertyName'));
    const propertyName = this.createTextInput(t('batchOrganize.scope.propertyNamePlaceholder'));
    propertyNameRow.control.appendChild(propertyName);

    const propertyValueRow = this.createFormRow(grid, t('batchOrganize.value.label'));
    const propertyValue = this.createTextInput(t('batchOrganize.scope.propertyValuePlaceholder'));
    propertyValueRow.control.appendChild(propertyValue);

    const keywordRow = this.createFormRow(grid, t('batchOrganize.scope.keyword'));
    const keyword = this.createTextInput(t('batchOrganize.scope.keywordPlaceholder'));
    keywordRow.control.appendChild(keyword);

    this.scopeFields = { kind, tag, propertyName, propertyValue, keyword };
    const sync = (): void => {
      tagRow.row.hidden = kind.value !== 'tag';
      propertyNameRow.row.hidden = kind.value !== 'property';
      propertyValueRow.row.hidden = kind.value !== 'property';
      keywordRow.row.hidden = kind.value !== 'keyword';
    };
    kind.addEventListener('change', sync);
    sync();
  }

  private renderMoveForm(grid: HTMLElement): void {
    const row = this.createFormRow(grid, t('batchOrganize.targetFolder'));
    this.folderInput = this.createTextInput(t('batchOrganize.targetFolderPlaceholder'));
    row.control.appendChild(this.folderInput);
  }

  private renderPropertyForm(grid: HTMLElement): void {
    const opKindRow = this.createFormRow(grid, t('batchOrganize.operation'));
    this.opKind = opKindRow.control.createEl('select');
    for (const [value, key] of [
      ['set', 'batchOrganize.op.set'],
      ['remove', 'batchOrganize.op.remove'],
      ['set-if', 'batchOrganize.op.setIf'],
    ] as const) {
      this.opKind.createEl('option', { value, text: t(key) });
    }

    const opNameRow = this.createFormRow(grid, t('batchOrganize.propertyName'));
    this.opName = this.createTextInput(t('batchOrganize.propertyName'));
    opNameRow.control.appendChild(this.opName);

    const typeRow = this.createFormRow(grid, t('batchOrganize.valueType'));
    this.opType = typeRow.control.createEl('select');
    for (const value of ['text', 'number', 'boolean', 'list'] as const) {
      this.opType.createEl('option', { value, text: t(`batchOrganize.valueType.${value}` as TranslationKey) });
    }

    const valueRow = this.createFormRow(grid, t('batchOrganize.value.label'));
    this.opValue = this.createTextInput(t('batchOrganize.valuePlaceholder'));
    valueRow.control.appendChild(this.opValue);

    const conditionRow = this.createFormRow(grid, t('batchOrganize.condition'));
    const conditionStack = conditionRow.control.createDiv({ cls: 'opencodian-batch-organize-control-stack' });
    this.conditionName = this.createTextInput(t('batchOrganize.conditionNamePlaceholder'));
    this.conditionValue = this.createTextInput(t('batchOrganize.conditionValuePlaceholder'));
    conditionStack.appendChild(this.conditionName);
    conditionStack.appendChild(this.conditionValue);

    const sync = (): void => {
      const conditional = this.opKind.value === 'set-if';
      const removal = this.opKind.value === 'remove';
      conditionRow.row.hidden = !conditional;
      typeRow.row.hidden = removal;
      valueRow.row.hidden = removal;
    };
    this.opKind.addEventListener('change', sync);
    sync();
  }

  private renderRenameForm(grid: HTMLElement): void {
    const findRow = this.createFormRow(grid, t('batchOrganize.find'));
    this.findInput = this.createTextInput(t('batchOrganize.findPlaceholder'));
    findRow.control.appendChild(this.findInput);

    const replaceRow = this.createFormRow(grid, t('batchOrganize.replaceWith'));
    this.replaceInput = this.createTextInput(t('batchOrganize.replaceWithPlaceholder'));
    replaceRow.control.appendChild(this.replaceInput);

    const regexRow = this.createFormRow(grid, t('batchOrganize.useRegex'));
    regexRow.label.setAttribute('for', USE_REGEX_CHECKBOX_ID);
    this.regexToggle = regexRow.control.createEl('input', {
      attr: { type: 'checkbox', id: USE_REGEX_CHECKBOX_ID },
    });
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
    const shell = this.createShell();
    this.createHeader(
      shell,
      t('batchOrganize.preview.title', { count: result.plan.operations.length }),
      'batchOrganize.preview.hint',
    );

    const section = shell.createDiv({ cls: 'opencodian-modal-section' });
    const listEl = section.createDiv({ cls: 'opencodian-batch-organize-list' });
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
      const row = listEl.createDiv({ cls: 'opencodian-batch-organize-item opencodian-batch-organize-conflict' });
      row.setText(
        t('batchOrganize.conflict.entry', {
          from: conflict.from,
          to: conflict.to,
          reason: t(`batchOrganize.conflict.${conflict.reason}` as TranslationKey),
        }),
      );
    }

    const actions = shell.createDiv({ cls: 'opencodian-modal-actions' });
    const backButton = createButton(actions, t('batchOrganize.back'));
    backButton.addEventListener('click', () => {
      this.stage = 'configure';
      this.render();
    });
    const confirmButton = createButton(
      actions,
      t('batchOrganize.confirm', { count: operations.length }),
      'mod-cta',
    );
    confirmButton.disabled = operations.length === 0;
    confirmButton.addEventListener('click', () => {
      void this.handleExecute();
    });
  }

  // --- execute / result -------------------------------------------------------------

  private renderRunning(): void {
    const shell = this.createShell();
    this.createHeader(shell, t('batchOrganize.title'));

    const running = shell.createDiv({ cls: 'opencodian-batch-organize-running' });
    running.createDiv({ cls: 'opencodian-batch-organize-spinner' });
    running.createEl('p', { cls: 'opencodian-batch-organize-hint', text: t('batchOrganize.running') });
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
      notifyLeftoverFolders(outcome.leftoverFolders);
      this.stage = 'configure';
    } else {
      notifyLeftoverFolders(outcome.leftoverFolders);
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
    const shell = this.createShell();
    this.createHeader(shell, t('batchOrganize.result.title'));

    shell.createEl('p', {
      cls: 'opencodian-batch-organize-body',
      text: t('batchOrganize.result.changed', { count: outcome.changed }),
    });
    if (outcome.createdFolders.length > 0) {
      shell.createEl('p', {
        cls: 'opencodian-batch-organize-hint',
        text: t('batchOrganize.result.createdFolders', { folders: outcome.createdFolders.join(', ') }),
      });
    }
    if (outcome.failures.length > 0) {
      shell.createEl('p', {
        cls: 'opencodian-batch-organize-conflict-summary',
        text: t('batchOrganize.result.skipped', { count: outcome.failures.length }),
      });
      const listEl = shell.createDiv({ cls: 'opencodian-batch-organize-list' });
      for (const path of outcome.failures.slice(0, PREVIEW_LIST_CAP)) {
        listEl.createDiv({
          cls: 'opencodian-batch-organize-item opencodian-batch-organize-conflict',
          text: path,
        });
      }
    }

    const actions = shell.createDiv({ cls: 'opencodian-modal-actions' });
    const revertButton = createButton(actions, t('batchOrganize.result.revertAll'));
    revertButton.disabled = this.revertDone || outcome.changed === 0;
    revertButton.addEventListener('click', () => {
      void this.handleRevert(revertButton);
    });
    const closeButton = createButton(actions, t('batchOrganize.close'));
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
    this.modalEl.addClass('opencodian-batch-organize-modal');
    const shell = this.contentEl.createDiv({ cls: 'opencodian-modal-shell' });
    const header = shell.createDiv({ cls: 'opencodian-modal-section opencodian-batch-organize-header' });
    header.createEl('h3', { text: t('batchOrganize.revertConfirm.title') });
    header.createEl('p', { cls: 'opencodian-batch-organize-hint', text: t('batchOrganize.revertConfirm.desc') });

    const actions = shell.createDiv({ cls: 'opencodian-modal-actions' });
    const cancelButton = createButton(actions, t('batchOrganize.revertConfirm.cancel'));
    cancelButton.addEventListener('click', () => this.close());
    // Destructive path: the shared rose signal (native .mod-warning), not the
    // accent primary — the revert rewrites files and must read as risk.
    const revertButton = createButton(actions, t('batchOrganize.result.revertAll'), 'mod-warning');
    revertButton.addEventListener('click', () => {
      void this.handleRevert();
    });
  }

  onClose(): void {
    this.modalEl.removeClass('opencodian-batch-organize-modal');
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
  const outcome: BatchRevertResult | null = await coordinator.revertLastBatch();
  if (!outcome) {
    new Notice(t('batchOrganize.error.revertUnavailable'));
    return false;
  }
  if (outcome.result.ok) {
    new Notice(t('editRevert.notice.revertAll', { count: outcome.result.changed, skippedDetail: '' }));
  } else {
    new Notice(t('editRevert.notice.failed', { error: outcome.result.error ?? 'unknown' }));
  }
  notifyLeftoverFolders(outcome.leftoverFolders);
  return outcome.result.ok;
}

/**
 * R-B5-D2: a folder the batch created that cleanup could not take down
 * (kept because it is no longer empty, or the removal failed) is reported
 * instead of being swallowed — the revert promise is "pre-batch shape".
 */
function notifyLeftoverFolders(folders: readonly string[]): void {
  if (folders.length > 0) {
    new Notice(t('batchOrganize.notice.revertLeftoverFolders', { folders: folders.join(', ') }));
  }
}
