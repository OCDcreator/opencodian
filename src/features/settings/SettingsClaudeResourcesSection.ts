/* eslint-disable max-lines -- P1 resource CRUD, history, and editor ownership remains co-located for auditable scope/revision handling. */

/**
 * Claude resource settings surface.
 *
 * This owner deliberately keeps the existing per-kind row cards and flat chat
 * catalog untouched, while routing every settings mutation through the P1
 * scoped resource facades. A scope is part of the row identity: a project and
 * global resource with the same name never share a mutation call or revision.
 */

import { MarkdownRenderer, Modal, Notice, setIcon, Setting } from 'obsidian';
import * as os from 'os';
import * as path from 'path';

import {
  catalogClaudeAgentResourceHistory,
  type ClaudeAgentResourceInfo,
  createClaudeAgentResource,
  deleteClaudeAgentResource,
  discoverClaudeAgentResources,
  readClaudeAgentResourceContent,
  restoreClaudeAgentResourceHistoryEntry,
  updateClaudeAgentResource,
  validateClaudeAgentContent,
} from '../../core/agents/backend/ClaudeProjectAgentDiscovery';
import {
  catalogClaudeCommandResourceHistory,
  type ClaudeCommandResourceInfo,
  createClaudeCommandResource,
  deleteClaudeCommandResource,
  discoverClaudeCommandResources,
  readClaudeCommandResourceContent,
  restoreClaudeCommandResourceHistoryEntry,
  updateClaudeCommandResource,
  validateClaudeCommandContent,
} from '../../core/agents/backend/ClaudeProjectCommandDiscovery';
import {
  catalogClaudeSkillResourceHistory,
  type ClaudeSkillResourceInfo,
  createClaudeSkillResource,
  deleteClaudeSkillResource,
  discoverClaudeSkillResources,
  readClaudeSkillResourceContent,
  restoreClaudeSkillResourceHistoryEntry,
  updateClaudeSkillResource,
  validateClaudeSkillContent,
} from '../../core/agents/backend/ClaudeProjectSkillDiscovery';
import type { ArchiveHistoryCatalogOutcome, ArchiveHistoryEntryIdentity, ArchiveHistoryTarget } from '../../core/agents/backend/ConfigurationArchiveService';
import type { FileRevision } from '../../core/agents/backend/ProjectResourceSecureWrite';
import { t, type TranslationKey } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { getVaultBasePath } from '../../shared';

export type ClaudeResourceKind = 'command' | 'skill' | 'agent';
export type ClaudeResourceScope = 'project' | 'global';
export type ClaudeResourceEditorMode = { edit: boolean; preview: boolean; format: 'markdown' };

type ClaudeResourceItem =
  | (Omit<ClaudeCommandResourceInfo, 'readonly' | 'scope'> & { readonly: boolean; scope: ClaudeResourceScope })
  | (Omit<ClaudeSkillResourceInfo, 'readonly' | 'scope'> & { readonly: boolean; scope: ClaudeResourceScope })
  | (Omit<ClaudeAgentResourceInfo, 'readonly' | 'scope'> & { readonly: boolean; scope: ClaudeResourceScope });

type ClaudeResourceContext = {
  kind: ClaudeResourceKind;
  vaultPath: string | null;
  homePath: string;
  onReload: () => void;
  userSourceEnabled: boolean;
};

export interface SettingsClaudeResourcesSectionOptions {
  plugin: OpenCodianPlugin;
  /** Invoked after a successful mutation so runtime/slash catalogs can refresh. */
  onAfterMutation?: () => void;
  /** Restricts this instance to focused resource tabs while preserving CRUD. */
  kinds?: readonly ClaudeResourceKind[];
}

export interface ClaudeResourceScopeStatus {
  label: string;
  cls: string;
}

/**
 * Resolve the status badge without inferring scope from readonly. The legacy
 * tests pass only `{readonly}`; P1 rows pass the explicit scope so global
 * resources remain editable while still showing the Claude user-source state.
 */
export function resolveClaudeResourceScopeStatus(
  item: { readonly: boolean; scope?: ClaudeResourceScope },
  userSourceEnabled: boolean,
): ClaudeResourceScopeStatus {
  const isGlobal = item.scope === 'global' || (item.scope === undefined && item.readonly);
  if (!isGlobal) {
    return {
      label: t('settings.claudeCode.resources.scopeProject'),
      cls: 'opencodian-claude-resource-scope is-project',
    };
  }
  return userSourceEnabled
    ? {
      label: t('settings.claudeCode.resources.scopeGlobalEnabled'),
      cls: 'opencodian-claude-resource-scope is-global',
    }
    : {
      label: t('settings.claudeCode.resources.scopeGlobalDiscovered'),
      cls: 'opencodian-claude-resource-scope is-global-disabled',
    };
}

export function getClaudeResourceEditorMode(kind: ClaudeResourceKind): ClaudeResourceEditorMode {
  // Claude command, skill, and agent files are Markdown source. Preview uses
  // Obsidian's MarkdownRenderer for Markdown-only rendering; it is not an
  // arbitrary HTML editor or runtime proof.
  void kind;
  return { edit: true, preview: true, format: 'markdown' };
}

// eslint-disable-next-line max-params -- The helper mirrors the two explicit roots and the selected scope for deterministic UI tests.
export function getClaudeResourceTargetPath(
  kind: ClaudeResourceKind,
  scope: ClaudeResourceScope,
  vaultPath: string | null,
  homePath: string,
  name = 'example',
): string | null {
  const basePath = scope === 'project' ? vaultPath : homePath;
  if (!basePath) return null;
  const root = kind === 'command'
    ? path.join('.claude', 'commands')
    : kind === 'skill'
      ? path.join('.claude', 'skills', name)
      : path.join('.claude', 'agents');
  const filename = kind === 'skill' ? 'SKILL.md' : `${name}.md`;
  return path.join(basePath, root, kind === 'skill' ? filename : filename);
}

export class SettingsClaudeResourcesSection {
  private readonly mutationInFlight = new Set<string>();

  constructor(private readonly options: SettingsClaudeResourcesSectionOptions) {}

  private mutationKey(action: 'create' | 'delete' | 'restore', context: ClaudeResourceContext, target: string): string {
    return `${action}:${context.kind}:${target}`;
  }

  private isUserSourceEnabled(): boolean {
    const sources = this.options.plugin.settings.backendSettings?.claudeCode?.settingSources;
    return Array.isArray(sources) && sources.includes('user');
  }

  render(bodyEl: HTMLElement): void {
    // The SettingsClaudeCodeSection caller gives this owner an exclusive,
    // borderless host. Clear it before every mutation reload so old groups
    // cannot remain alongside the fresh discovery result.
    // Rows refill asynchronously (discovery), so remember the user's scroll
    // position and re-apply it as the new content arrives.
    const restoreScroll = this.captureScrollAnchor(bodyEl);
    bodyEl.empty();
    const vaultPath = getVaultBasePath(this.options.plugin.app);
    const homePath = os.homedir();
    const userSourceEnabled = this.isUserSourceEnabled();
    if (!userSourceEnabled) {
      const noticeEl = bodyEl.createDiv({ cls: 'opencodian-claude-resource-source-notice' });
      noticeEl.createSpan({
        cls: 'opencodian-claude-resource-source-notice-title',
        text: t('settings.claudeCode.resources.userSourceDisabled.name'),
      });
      noticeEl.createSpan({
        cls: 'opencodian-claude-resource-source-notice-desc',
        text: t('settings.claudeCode.resources.userSourceDisabled.desc'),
      });
    }

    const kinds = this.options.kinds ?? ['command', 'skill', 'agent'];
    for (const kind of kinds) {
      this.renderResourceGroup(bodyEl, kind, {
        kind,
        vaultPath,
        homePath,
        onReload: () => this.render(bodyEl),
        userSourceEnabled,
      }, restoreScroll);
    }
    restoreScroll();
  }

  /**
   * Remember the nearest scrollable ancestor's position so an
   * empty()+async-refill reload does not throw the user back to the top.
   * The returned function is safe to call repeatedly and after detachment.
   */
  private captureScrollAnchor(bodyEl: HTMLElement): () => void {
    let scrollContainer: HTMLElement | null = bodyEl.parentElement;
    while (scrollContainer) {
      const overflowY = window.getComputedStyle(scrollContainer).overflowY;
      if (overflowY === 'auto' || overflowY === 'scroll') break;
      scrollContainer = scrollContainer.parentElement;
    }
    const container = scrollContainer;
    const scrollTop = container?.scrollTop ?? 0;
    return () => {
      if (container?.isConnected && scrollTop > 0) container.scrollTop = scrollTop;
    };
  }

  private renderResourceGroup(bodyEl: HTMLElement, kind: ClaudeResourceKind, context: ClaudeResourceContext, onContentRendered?: () => void): void {
    const labelKey: TranslationKey = kind === 'command'
      ? 'settings.claudeCode.resources.commands'
      : kind === 'skill'
        ? 'settings.claudeCode.resources.skills'
        : 'settings.claudeCode.resources.agents';
    const label = t(labelKey);
    const groupEl = bodyEl.createDiv({
      cls: 'opencodian-claude-resource-group opencodian-resource-group-card',
      attr: { 'data-claude-resource-group': kind },
    });
    const headerEl = groupEl.createDiv({ cls: 'opencodian-claude-resource-group-header' });
    headerEl.createEl('h4', { cls: 'opencodian-claude-resource-group-title', text: label });
    const actionsEl = headerEl.createDiv({ cls: 'opencodian-claude-resource-group-actions' });
    const historyButton = actionsEl.createEl('button', {
      cls: 'opencodian-claude-resource-history',
      text: t('settings.claudeCode.resources.history'),
      attr: { type: 'button' },
    });
    historyButton.addEventListener('click', () => void this.openHistory(context));
    const createButton = actionsEl.createEl('button', {
      cls: 'opencodian-claude-resource-create',
      text: t('settings.claudeCode.resources.create'),
      attr: { type: 'button' },
    });
    createButton.addEventListener('click', () => this.promptCreate(context));

    const summaryEl = groupEl.createDiv({ cls: 'opencodian-claude-resource-group-summary' });
    const scrollEl = groupEl.createDiv({ cls: 'opencodian-settings-scrollarea opencodian-claude-resource-scroll' });
    const viewportEl = scrollEl.createDiv({ cls: 'opencodian-settings-scrollarea-viewport' });
    const listEl = viewportEl.createDiv({
      cls: 'opencodian-settings-scrollarea-content opencodian-claude-resource-list',
    });
    this.syncAgentScrollAreaHeight(bodyEl, scrollEl, viewportEl);

    void this.discoverAllScopes(context).then((items) => {
      const projectCount = items.filter((item) => item.scope === 'project').length;
      summaryEl.setText(t('settings.claudeCode.resources.groupSummary', {
        project: String(projectCount),
        global: String(items.length - projectCount),
      }));
      if (items.length === 0) {
        listEl.createDiv({ cls: 'opencodian-settings-inline-empty', text: t('settings.claudeCode.resources.empty') });
      } else {
        for (const item of items) this.renderResourceRow(listEl, item, context);
      }
      this.syncAgentScrollAreaHeight(bodyEl, scrollEl, viewportEl);
      onContentRendered?.();
    });
  }

  private async discoverAllScopes(context: ClaudeResourceContext): Promise<ClaudeResourceItem[]> {
    const scopes: Array<{ scope: ClaudeResourceScope; basePath: string | null }> = [
      { scope: 'project', basePath: context.vaultPath },
      { scope: 'global', basePath: context.homePath },
    ];
    const results: ClaudeResourceItem[] = [];
    for (const selected of scopes) {
      if (!selected.basePath) continue;
      const discovered = context.kind === 'command'
        ? await discoverClaudeCommandResources({ scope: selected.scope, basePath: selected.basePath })
        : context.kind === 'skill'
          ? await discoverClaudeSkillResources({ scope: selected.scope, basePath: selected.basePath })
          : await discoverClaudeAgentResources({ scope: selected.scope, basePath: selected.basePath });
      results.push(...discovered.map((item) => ({
        ...item,
        scope: selected.scope,
      })) as ClaudeResourceItem[]);
    }
    return results;
  }

  private syncAgentScrollAreaHeight(bodyEl: HTMLElement, scrollEl: HTMLElement, viewportEl: HTMLElement): void {
    if (bodyEl.dataset.claudeCodeSection !== 'agents') return;
    window.requestAnimationFrame(() => {
      if (!scrollEl.isConnected || !viewportEl.isConnected) return;
      const viewportTop = viewportEl.getBoundingClientRect().top;
      const availableHeight = Math.max(280, Math.floor(window.innerHeight - viewportTop - 24));
      scrollEl.style.setProperty('--opencodian-settings-scrollarea-available-height', `${availableHeight}px`);
      // A second frame accounts for async scope readback and settings-pane
      // reflow without changing the scroll owner or stealing user scroll.
      window.requestAnimationFrame(() => {
        if (!scrollEl.isConnected || !viewportEl.isConnected) return;
        const nextViewportTop = viewportEl.getBoundingClientRect().top;
        const nextHeight = Math.max(280, Math.floor(window.innerHeight - nextViewportTop - 24));
        scrollEl.style.setProperty('--opencodian-settings-scrollarea-available-height', `${nextHeight}px`);
      });
    });
  }

  private renderResourceRow(listEl: HTMLElement, item: ClaudeResourceItem, context: ClaudeResourceContext): void {
    const scopeStatus = resolveClaudeResourceScopeStatus(item, context.userSourceEnabled);
    const rowEl = listEl.createDiv({
      cls: 'opencodian-claude-resource-row',
      attr: {
        'data-resource-scope': item.scope,
        'data-resource-readonly': String(item.readonly),
        'data-resource-revision': item.revision.sha256,
      },
    });
    const headerEl = rowEl.createDiv({ cls: 'opencodian-claude-resource-row-header' });
    headerEl.createSpan({ cls: 'opencodian-claude-resource-row-name', text: item.name });
    headerEl.createSpan({ cls: scopeStatus.cls, text: scopeStatus.label });
    const actionsEl = headerEl.createDiv({ cls: 'opencodian-claude-resource-row-actions' });
    const editButton = actionsEl.createEl('button', {
      cls: 'opencodian-claude-resource-edit',
      text: t('settings.claudeCode.resources.edit'),
      attr: { type: 'button' },
    });
    editButton.addEventListener('click', () => this.openEditor(item, context, 'edit'));
    const previewButton = actionsEl.createEl('button', {
      cls: 'opencodian-claude-resource-preview',
      text: t('settings.claudeCode.resources.preview'),
      attr: { type: 'button' },
    });
    previewButton.addEventListener('click', () => this.openEditor(item, context, 'preview'));
    const deleteButton = actionsEl.createEl('button', {
      cls: 'opencodian-claude-resource-delete',
      attr: {
        type: 'button',
        'aria-label': t('settings.claudeCode.resources.delete'),
        title: t('settings.claudeCode.resources.delete'),
      },
    });
    setIcon(deleteButton, 'trash');
    deleteButton.addEventListener('click', () => void this.confirmDelete(item, context, deleteButton));
    rowEl.createDiv({
      cls: 'opencodian-claude-resource-row-desc',
      text: item.description || t('settings.claudeCode.resources.noDescription'),
    });
    rowEl.createDiv({ cls: 'opencodian-claude-resource-path', text: item.revision.canonicalPath });
    rowEl.createDiv({
      cls: 'opencodian-claude-resource-revision',
      text: t('settings.claudeCode.resources.revision', { value: item.revision.sha256.slice(0, 12) }),
    });
  }

  private promptCreate(context: ClaudeResourceContext): void {
    const modal = new Modal(this.options.plugin.app);
    modal.contentEl.addClass('opencodian-claude-resource-modal');
    modal.titleEl.setText(t('settings.claudeCode.resources.createTitle'));
    let name = '';
    let scope: ClaudeResourceScope = 'project';
    const targetEl = modal.contentEl.createDiv({ cls: 'opencodian-claude-resource-target' });
    const updateTarget = () => {
      targetEl.setText(getClaudeResourceTargetPath(context.kind, scope, context.vaultPath, context.homePath, name || 'example') ?? t('settings.claudeCode.resources.noTarget'));
    };
    new Setting(modal.contentEl)
      .setName(t('settings.claudeCode.resources.scopeField'))
      .addDropdown((dropdown) => {
        dropdown.addOption('project', t('settings.claudeCode.resources.scopeProject'));
        dropdown.addOption('global', t('settings.claudeCode.resources.scopeGlobalEditable'));
        dropdown.setValue('project');
        dropdown.onChange((value) => {
          scope = value === 'global' ? 'global' : 'project';
          updateTarget();
        });
      });
    new Setting(modal.contentEl)
      .setName(t('settings.claudeCode.resources.nameField'))
      .addText((text) => {
        text.onChange((value) => { name = value; updateTarget(); });
      });
    updateTarget();
    const actionsEl = modal.contentEl.createDiv({ cls: 'opencodian-claude-resource-modal-actions' });
    const createButton = actionsEl.createEl('button', {
      cls: 'mod-cta',
      text: t('settings.claudeCode.resources.create'),
      attr: { type: 'button' },
    });
    createButton.addEventListener('click', async () => {
      const target = getClaudeResourceTargetPath(context.kind, scope, context.vaultPath, context.homePath, name || 'example') ?? `${scope}:${name}`;
      const mutationKey = this.mutationKey('create', context, target);
      if (this.mutationInFlight.has(mutationKey)) return;
      const basePath = scope === 'project' ? context.vaultPath : context.homePath;
      if (!basePath) {
        new Notice(t('settings.claudeCode.resources.error.empty-vault'));
        return;
      }
      this.mutationInFlight.add(mutationKey);
      const defaultLabel = t('settings.claudeCode.resources.create');
      createButton.disabled = true;
      createButton.setText(t('settings.claudeCode.resources.creating'));
      try {
        const result = context.kind === 'command'
          ? await createClaudeCommandResource({ scope, basePath, name, expectedRevision: null })
          : context.kind === 'skill'
            ? await createClaudeSkillResource({ scope, basePath, name, expectedRevision: null })
            : await createClaudeAgentResource({ scope, basePath, name, expectedRevision: null });
        if (result.status === 'success') {
          this.options.onAfterMutation?.();
          modal.close();
          context.onReload();
        } else {
          new Notice(this.describeMutationResult(result.status));
        }
      } catch {
        new Notice(t('settings.claudeCode.resources.error.write-failed'));
      } finally {
        this.mutationInFlight.delete(mutationKey);
        createButton.disabled = false;
        createButton.setText(defaultLabel);
      }
    });
    modal.open();
  }

  private openEditor(item: ClaudeResourceItem, context: ClaudeResourceContext, mode: 'edit' | 'preview'): void {
    const modal = new Modal(this.options.plugin.app);
    modal.contentEl.addClass('opencodian-claude-resource-modal');
    modal.titleEl.setText(t(mode === 'preview' ? 'settings.claudeCode.resources.previewTitle' : 'settings.claudeCode.resources.editTitle', { name: item.name }));
    const metadataEl = modal.contentEl.createDiv({ cls: 'opencodian-resource-editor-metadata' });
    metadataEl.createSpan({ text: t('settings.claudeCode.resources.scopeValue', { value: item.scope }) });
    metadataEl.createSpan({ text: t('settings.claudeCode.resources.pathValue', { value: item.revision.canonicalPath }) });
    const revisionEl = metadataEl.createSpan({ text: t('settings.claudeCode.resources.revision', { value: item.revision.sha256.slice(0, 12) }) });
    let expectedRevision = item.revision;
    let content = '';
    const textarea = modal.contentEl.createEl('textarea', {
      cls: 'opencodian-claude-resource-editor',
      attr: { 'aria-label': modal.titleEl.textContent ?? '', spellcheck: 'false' },
    });
    const preview = modal.contentEl.createDiv({
      cls: 'opencodian-claude-resource-preview-pane markdown-rendered',
    });
    preview.hidden = mode !== 'preview';
    textarea.hidden = mode === 'preview';
    let saveButton: HTMLButtonElement | null = null;
    if (mode === 'edit') {
      const actionsEl = modal.contentEl.createDiv({ cls: 'opencodian-claude-resource-modal-actions' });
      saveButton = actionsEl.createEl('button', {
        cls: 'mod-cta',
        text: t('settings.claudeCode.resources.save'),
        attr: { type: 'button' },
      });
      saveButton.disabled = true;
      saveButton.addEventListener('click', async () => {
        const validationError = context.kind === 'command'
          ? validateClaudeCommandContent(content)
          : context.kind === 'skill'
            ? validateClaudeSkillContent(content)
            : validateClaudeAgentContent(content);
        if (validationError) {
          new Notice(validationError);
          return;
        }
        const basePath = item.scope === 'project' ? context.vaultPath : context.homePath;
        if (!basePath) {
          new Notice(t('settings.claudeCode.resources.error.empty-vault'));
          return;
        }
        // Disable while the secure write is in flight so a double-click cannot
        // race a second mutation against the just-advanced revision.
        if (saveButton) saveButton.disabled = true;
        try {
          const result = context.kind === 'command'
            ? await updateClaudeCommandResource({ scope: item.scope, basePath, name: item.name, content, expectedRevision })
            : context.kind === 'skill'
              ? await updateClaudeSkillResource({ scope: item.scope, basePath, name: item.name, content, expectedRevision })
              : await updateClaudeAgentResource({ scope: item.scope, basePath, name: item.name, content, expectedRevision });
          if (result.status === 'success') {
            new Notice(t('settings.claudeCode.resources.saved'));
            this.options.onAfterMutation?.();
            modal.close();
            context.onReload();
          } else {
            // Keep the modal and the caller's draft intact on conflict.
            new Notice(this.describeMutationResult(result.status));
            this.showConflict(modal.contentEl, result.status);
          }
        } finally {
          if (saveButton) saveButton.disabled = false;
        }
      });
    }
    const showReadFailure = (status: 'conflict' | 'invalid-path' | 'read-failed'): void => {
      let errorEl = modal.contentEl.querySelector<HTMLElement>('.opencodian-resource-read-error');
      if (!errorEl) errorEl = modal.contentEl.createDiv({ cls: 'opencodian-resource-read-error' });
      const message = status === 'conflict'
        ? t('settings.claudeCode.resources.conflictDraftRetained')
        : status === 'invalid-path'
          ? t('settings.claudeCode.resources.error.invalid-path')
          : t('settings.claudeCode.resources.error.read-failed');
      errorEl.setText(message);
      content = '';
      textarea.value = '';
      textarea.disabled = true;
      if (saveButton) saveButton.disabled = true;
      preview.empty();
    };
    const renderPreview = (markdown: string): void => {
      if (mode !== 'preview') return;
      preview.empty();
      void MarkdownRenderer.renderMarkdown(markdown, preview, '', this.options.plugin);
    };
    const basePath = item.scope === 'project' ? context.vaultPath : context.homePath;
    if (!basePath) {
      showReadFailure('invalid-path');
    } else {
      const loadContent = context.kind === 'command'
        ? readClaudeCommandResourceContent({ scope: item.scope, basePath, name: item.name, expectedRevision: item.revision })
        : context.kind === 'skill'
          ? readClaudeSkillResourceContent({ scope: item.scope, basePath, name: item.name, expectedRevision: item.revision })
          : readClaudeAgentResourceContent({ scope: item.scope, basePath, name: item.name, expectedRevision: item.revision });
      void loadContent.then((result) => {
        if (result.status !== 'success') {
          showReadFailure(result.status);
          return;
        }
        content = result.content;
        expectedRevision = result.revision;
        revisionEl.setText(t('settings.claudeCode.resources.revision', { value: expectedRevision.sha256.slice(0, 12) }));
        textarea.value = content;
        textarea.disabled = false;
        if (saveButton) saveButton.disabled = false;
        renderPreview(content);
      }).catch(() => showReadFailure('read-failed'));
    }
    textarea.addEventListener('input', () => { content = textarea.value; });
    modal.open();
  }

  private async confirmDelete(item: ClaudeResourceItem, context: ClaudeResourceContext, button: HTMLButtonElement | null = null): Promise<void> {
    const basePath = item.scope === 'project' ? context.vaultPath : context.homePath;
    if (!basePath) {
      new Notice(t('settings.claudeCode.resources.error.empty-vault'));
      return;
    }
    const mutationKey = this.mutationKey('delete', context, item.revision.canonicalPath);
    if (this.mutationInFlight.has(mutationKey)) return;
    this.mutationInFlight.add(mutationKey);
    if (button) {
      button.disabled = true;
      button.setText(t('settings.claudeCode.resources.deleting'));
    }
    try {
      let confirmed = false;
      try {
        confirmed = typeof window.confirm === 'function'
          && window.confirm(t('settings.claudeCode.resources.deleteConfirm', { name: item.name })) === true;
      } catch {
        confirmed = false;
      }
      if (!confirmed) return;
      const result = context.kind === 'command'
        ? await deleteClaudeCommandResource({ scope: item.scope, basePath, name: item.name, expectedRevision: item.revision })
        : context.kind === 'skill'
          ? await deleteClaudeSkillResource({ scope: item.scope, basePath, name: item.name, expectedRevision: item.revision })
          : await deleteClaudeAgentResource({ scope: item.scope, basePath, name: item.name, expectedRevision: item.revision });
      if (result.status === 'success') {
        new Notice(t('settings.claudeCode.resources.deleted'));
        this.options.onAfterMutation?.();
        context.onReload();
      } else {
        new Notice(this.describeMutationResult(result.status));
      }
    } catch {
      new Notice(t('settings.claudeCode.resources.error.write-failed'));
    } finally {
      this.mutationInFlight.delete(mutationKey);
      if (button) {
        button.disabled = false;
        setIcon(button, 'trash');
      }
    }
  }

  private async openHistory(context: ClaudeResourceContext): Promise<void> {
    const modal = new Modal(this.options.plugin.app);
    modal.contentEl.addClass('opencodian-claude-resource-history-modal');
    modal.titleEl.setText(t('settings.claudeCode.resources.historyTitle'));
    const bodyEl = modal.contentEl.createDiv({ cls: 'opencodian-resource-history-list' });
    const scopes: Array<{ scope: ClaudeResourceScope; basePath: string }> = [
      ...(context.vaultPath ? [{ scope: 'project' as const, basePath: context.vaultPath }] : []),
      { scope: 'global', basePath: context.homePath },
    ];
    const catalogs: Array<{ scope: ClaudeResourceScope; basePath: string; outcome: ArchiveHistoryCatalogOutcome }> = [];
    for (const selected of scopes) {
      const outcome = context.kind === 'command'
        ? await catalogClaudeCommandResourceHistory(selected)
        : context.kind === 'skill'
          ? await catalogClaudeSkillResourceHistory(selected)
          : await catalogClaudeAgentResourceHistory(selected);
      catalogs.push({ scope: selected.scope, basePath: selected.basePath, outcome });
    }
    const failedCatalogs = catalogs.filter((catalog) => catalog.outcome.status !== 'success');
    const targets = catalogs.flatMap((catalog) => {
      if (catalog.outcome.status !== 'success') return [];
      return catalog.outcome.targets
        .filter((target): target is ArchiveHistoryTarget & { scope: ClaudeResourceScope } => target.scope === 'project' || target.scope === 'global')
        .map((target) => ({
          ...target,
          scope: target.scope,
          basePath: target.scope === 'project' ? (context.vaultPath ?? catalog.basePath) : context.homePath,
        }));
    });
    const targetsWithRevision: Array<ArchiveHistoryTarget & { scope: ClaudeResourceScope; basePath: string; expectedRevision: FileRevision | null }> = [];
    for (const target of targets) {
      const name = this.resourceNameFromTarget(context.kind, target.canonicalTarget);
      let expectedRevision: FileRevision | null = null;
      if (name) {
        const discovered = context.kind === 'command'
          ? await discoverClaudeCommandResources({ scope: target.scope, basePath: target.basePath })
          : context.kind === 'skill'
            ? await discoverClaudeSkillResources({ scope: target.scope, basePath: target.basePath })
            : await discoverClaudeAgentResources({ scope: target.scope, basePath: target.basePath });
        expectedRevision = discovered.find((item) => item.name === name)?.revision ?? null;
      }
      targetsWithRevision.push({ ...target, expectedRevision });
    }
    if (failedCatalogs.length > 0) {
      bodyEl.createDiv({
        cls: 'opencodian-resource-history-error',
        text: t('settings.claudeCode.resources.historyArchiveFailed'),
      });
    } else if (targetsWithRevision.length === 0) {
      bodyEl.createDiv({ cls: 'opencodian-settings-inline-empty', text: t('settings.claudeCode.resources.historyEmpty') });
    }
    for (const target of targetsWithRevision) {
      const targetEl = bodyEl.createDiv({ cls: 'opencodian-resource-history-target' });
      targetEl.createDiv({ cls: 'opencodian-resource-history-target-path', text: target.canonicalTarget });
      for (const entry of target.entries) {
        const entryEl = targetEl.createDiv({ cls: 'opencodian-resource-history-entry' });
        entryEl.createSpan({ text: t('settings.claudeCode.resources.historyEntry', {
          kind: entry.archiveKind,
          date: new Date(entry.timestamp).toLocaleString(),
          size: String(entry.size),
        }) });
        const restoreButton = entryEl.createEl('button', {
          cls: 'opencodian-resource-history-restore',
          text: t('settings.claudeCode.resources.restore'),
          attr: { type: 'button' },
        });
        restoreButton.addEventListener('click', () => void this.restoreHistoryEntry(modal, context, target, entry.identity, restoreButton));
      }
    }
    modal.open();
  }

  // eslint-disable-next-line max-params -- Restore needs the modal, selected resource context/target, archive identity, and loading button.
  private async restoreHistoryEntry(
    modal: Modal,
    context: ClaudeResourceContext,
    target: ArchiveHistoryTarget & { scope: ClaudeResourceScope; basePath: string; expectedRevision: FileRevision | null },
    entryIdentity: ArchiveHistoryEntryIdentity,
    button: HTMLButtonElement | null = null,
  ): Promise<void> {
    const name = this.resourceNameFromTarget(context.kind, target.canonicalTarget);
    if (!name) {
      new Notice(t('settings.claudeCode.resources.error.invalid-path'));
      return;
    }
    const mutationKey = this.mutationKey('restore', context, target.canonicalTarget);
    if (this.mutationInFlight.has(mutationKey)) return;
    this.mutationInFlight.add(mutationKey);
    const defaultLabel = t('settings.claudeCode.resources.restore');
    if (button) {
      button.disabled = true;
      button.setText(t('settings.claudeCode.resources.restoring'));
    }
    try {
      let confirmed = false;
      try {
        confirmed = typeof window.confirm === 'function'
          && window.confirm(t('settings.claudeCode.resources.restoreConfirm', { name })) === true;
      } catch {
        confirmed = false;
      }
      if (!confirmed) return;
      const result = context.kind === 'command'
        ? await restoreClaudeCommandResourceHistoryEntry({ scope: target.scope, basePath: target.basePath, name, entryIdentity, expectedRevision: target.expectedRevision })
        : context.kind === 'skill'
          ? await restoreClaudeSkillResourceHistoryEntry({ scope: target.scope, basePath: target.basePath, name, entryIdentity, expectedRevision: target.expectedRevision })
          : await restoreClaudeAgentResourceHistoryEntry({ scope: target.scope, basePath: target.basePath, name, entryIdentity, expectedRevision: target.expectedRevision });
      if (result.status === 'success') {
        new Notice(t('settings.claudeCode.resources.restored'));
        modal.close();
        this.options.onAfterMutation?.();
        context.onReload();
      } else {
        new Notice(this.describeMutationResult(result.status));
        this.showConflict(modal.contentEl, result.status, 'settings.claudeCode.resources.restoreConflict');
      }
    } catch {
      new Notice(t('settings.claudeCode.resources.error.write-failed'));
    } finally {
      this.mutationInFlight.delete(mutationKey);
      if (button) {
        button.disabled = false;
        button.setText(defaultLabel);
      }
    }
  }

  private resourceNameFromTarget(kind: ClaudeResourceKind, canonicalTarget: string): string | null {
    const basename = path.basename(canonicalTarget);
    if (kind === 'skill') {
      return basename === 'SKILL.md' ? path.basename(path.dirname(canonicalTarget)) : null;
    }
    return basename.endsWith('.md') ? basename.slice(0, -3) : null;
  }

  private showConflict(modalContent: HTMLElement, status: string, messageKey: TranslationKey = 'settings.claudeCode.resources.conflictDraftRetained'): void {
    if (status !== 'conflict') return;
    let conflict = modalContent.querySelector<HTMLElement>('.opencodian-resource-conflict');
    if (!conflict) conflict = modalContent.createDiv({ cls: 'opencodian-resource-conflict', attr: { role: 'alert' } });
    conflict.setText(t(messageKey));
  }

  private describeMutationResult(status: string): string {
    const key = `settings.claudeCode.resources.error.${status}` as TranslationKey;
    return t(key) || t('settings.claudeCode.resources.error.write-failed');
  }
}
