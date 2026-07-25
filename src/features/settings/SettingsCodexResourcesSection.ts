/* eslint-disable max-lines -- P1 resource CRUD, history, and editor ownership remains co-located for auditable scope/revision handling. */

/**
 * Codex resource settings surface.
 *
 * Project and global targets use the same secure scoped facades. The global
 * scope is explicit in the create modal; it is not inferred from a previous
 * selection or silently redirected to the project. Chat continues to consume
 * its existing flat runtime catalog.
 */

import { MarkdownRenderer, Modal, Notice, setIcon, Setting } from 'obsidian';
import * as os from 'os';
import * as path from 'path';

import type { AppServerSkillGroup } from '../../core/agents/backend/CodexAppServerClientTypes';
import {
  catalogCodexAgentResourceHistory,
  type CodexAgentResourceInfo,
  createCodexAgentResource,
  deleteCodexAgentResource,
  discoverCodexAgentResources,
  readCodexAgentResourceContent,
  restoreCodexAgentResourceHistoryEntry,
  updateCodexAgentResource,
  validateCodexAgentContent,
} from '../../core/agents/backend/CodexProjectResourceDiscovery';
import {
  catalogCodexSkillResourceHistory,
  type CodexSkillResourceInfo,
  createCodexSkillResource,
  deleteCodexSkillResource,
  discoverCodexSkillResources,
  readCodexSkillResourceContent,
  restoreCodexSkillResourceHistoryEntry,
  updateCodexSkillResource,
  validateCodexSkillContent,
} from '../../core/agents/backend/CodexProjectResourceDiscovery';
import type { ArchiveHistoryCatalogOutcome, ArchiveHistoryEntryIdentity, ArchiveHistoryTarget } from '../../core/agents/backend/ConfigurationArchiveService';
import type { FileRevision } from '../../core/agents/backend/ProjectResourceSecureWrite';
import { t, type TranslationKey } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { getVaultBasePath } from '../../shared';

export type CodexResourceKind = 'skill' | 'agent';
export type CodexResourceScope = 'project' | 'global';
export type CodexResourceEditorMode = { edit: boolean; preview: boolean; format: 'markdown' | 'toml' };

type CodexResourceItem =
  | (Omit<CodexSkillResourceInfo, 'readonly' | 'scope'> & { readonly: boolean; scope: CodexResourceScope })
  | (Omit<CodexAgentResourceInfo, 'readonly' | 'scope'> & { readonly: boolean; scope: CodexResourceScope });

type CodexResourceContext = {
  kind: CodexResourceKind;
  vaultPath: string | null;
  homePath: string;
  onReload: () => void;
};

export interface SettingsCodexResourcesSectionOptions {
  plugin: OpenCodianPlugin;
  createSectionHeading: (containerEl: HTMLElement, title: string, tooltip?: string) => HTMLHeadingElement;
  onAfterMutation?: () => void;
}

export function getCodexResourceEditorMode(kind: CodexResourceKind): CodexResourceEditorMode {
  return kind === 'agent'
    ? { edit: true, preview: false, format: 'toml' }
    : { edit: true, preview: true, format: 'markdown' };
}

// eslint-disable-next-line max-params -- The helper mirrors the two explicit roots and the selected scope for deterministic UI tests.
export function getCodexResourceTargetPath(
  kind: CodexResourceKind,
  scope: CodexResourceScope,
  vaultPath: string | null,
  homePath: string,
  name = 'example',
): string | null {
  const basePath = scope === 'project' ? vaultPath : homePath;
  if (!basePath) return null;
  const root = kind === 'skill' ? path.join('.agents', 'skills', name) : path.join('.codex', 'agents');
  const filename = kind === 'skill' ? 'SKILL.md' : `${name}.toml`;
  return path.join(basePath, root, filename);
}

export class SettingsCodexResourcesSection {
  private readonly mutationInFlight = new Set<string>();

  constructor(private readonly options: SettingsCodexResourcesSectionOptions) {}

  private mutationKey(action: 'create' | 'delete' | 'restore', context: CodexResourceContext, target: string): string {
    return `${action}:${context.kind}:${target}`;
  }

  render(bodyEl: HTMLElement): void {
    // The SettingsCodexSection caller gives this owner an exclusive,
    // borderless host. Clear it before every mutation reload so headings,
    // groups, runtime readback, and boundary copy stay single-instance.
    // Rows refill asynchronously (discovery), so remember the user's scroll
    // position and re-apply it as the new content arrives.
    const restoreScroll = this.captureScrollAnchor(bodyEl);
    bodyEl.empty();
    const vaultPath = getVaultBasePath(this.options.plugin.app);
    const contextFor = (kind: CodexResourceKind): CodexResourceContext => ({
      kind,
      vaultPath,
      homePath: os.homedir(),
      onReload: () => this.render(bodyEl),
    });
    this.options.createSectionHeading(
      bodyEl,
      t('settings.codex.resources.title'),
      t('settings.codex.resources.description'),
    );
    this.renderResourceGroup(bodyEl, 'skill', contextFor('skill'), restoreScroll);
    this.renderResourceGroup(bodyEl, 'agent', contextFor('agent'), restoreScroll);
    this.renderRuntimeSkillGroups(bodyEl);
    const noteEl = bodyEl.createDiv({ cls: 'opencodian-codex-resource-boundary-note' });
    noteEl.createSpan({
      cls: 'opencodian-codex-resource-boundary-note-title',
      text: t('settings.codex.resources.agentReloadBoundary.name'),
    });
    noteEl.createSpan({
      cls: 'opencodian-codex-resource-boundary-note-desc',
      text: t('settings.codex.resources.agentReloadBoundary.desc'),
    });
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

  /** Settings-only grouped readback; chat still uses its existing flat list. */
  renderRuntimeSkillGroups(bodyEl: HTMLElement): void {
    const shell = bodyEl.createDiv({
      cls: 'opencodian-codex-runtime-skill-groups',
      attr: { 'data-codex-runtime-readback': 'skills-list' },
    });
    shell.createEl('h4', {
      cls: 'opencodian-codex-runtime-skill-groups-title',
      text: t('settings.codex.resources.runtimeSkills.title'),
    });
    const adapter = this.options.plugin.agentServiceRegistry?.get('codex') as {
      getRuntimeSkillGroups?: () => Promise<AppServerSkillGroup[] | null>;
    } | undefined;
    if (typeof adapter?.getRuntimeSkillGroups !== 'function') {
      shell.createDiv({ cls: 'opencodian-settings-inline-empty', text: t('settings.codex.resources.runtimeSkills.unavailable') });
      return;
    }
    const statusEl = shell.createDiv({ cls: 'opencodian-codex-runtime-skill-groups-status' });
    void adapter.getRuntimeSkillGroups().then((groups) => {
      if (groups === null) {
        statusEl.setText(t('settings.codex.resources.runtimeSkills.unavailable'));
        return;
      }
      if (groups.length === 0) {
        statusEl.setText(t('settings.codex.resources.runtimeSkills.empty'));
        return;
      }
      statusEl.remove();
      for (const group of groups) this.renderRuntimeSkillGroup(shell, group);
    }).catch(() => {
      statusEl.setText(t('settings.codex.resources.runtimeSkills.unavailable'));
    });
  }

  private renderRuntimeSkillGroup(parentEl: HTMLElement, group: AppServerSkillGroup): void {
    const groupEl = parentEl.createDiv({ cls: 'opencodian-codex-runtime-skill-group' });
    groupEl.createDiv({
      cls: 'opencodian-codex-runtime-skill-group-cwd',
      text: t('settings.codex.resources.runtimeSkills.cwd', { value: group.cwd ?? t('settings.codex.resources.runtimeSkills.unknownCwd') }),
    });
    if (group.skills.length === 0) {
      groupEl.createDiv({ cls: 'opencodian-settings-inline-empty', text: t('settings.codex.resources.runtimeSkills.emptyGroup') });
    } else {
      for (const skill of group.skills) {
        const row = groupEl.createDiv({ cls: 'opencodian-codex-runtime-skill-row' });
        row.createSpan({ cls: 'opencodian-codex-runtime-skill-name', text: skill.name });
        row.createSpan({
          cls: 'opencodian-codex-runtime-skill-source',
          text: skill.source ?? skill.scope ?? t('settings.codex.resources.runtimeSkills.unknownSource'),
        });
      }
    }
    for (const error of group.errors) {
      groupEl.createDiv({
        cls: 'opencodian-codex-runtime-skill-error',
        text: `${error.path ?? group.cwd ?? ''}: ${error.message}`,
      });
    }
  }

  private renderResourceGroup(bodyEl: HTMLElement, kind: CodexResourceKind, context: CodexResourceContext, onContentRendered?: () => void): void {
    const labelKey: TranslationKey = kind === 'skill'
      ? 'settings.codex.resources.skills'
      : 'settings.codex.resources.agents';
    const label = t(labelKey);
    const groupEl = bodyEl.createDiv({
      cls: 'opencodian-codex-resource-group opencodian-resource-group-card',
      attr: { 'data-codex-resource-group': kind },
    });
    const headerEl = groupEl.createDiv({ cls: 'opencodian-codex-resource-group-header' });
    headerEl.createEl('h4', { cls: 'opencodian-codex-resource-group-title', text: label });
    const actionsEl = headerEl.createDiv({ cls: 'opencodian-codex-resource-group-actions' });
    const historyButton = actionsEl.createEl('button', {
      cls: 'opencodian-codex-resource-history',
      text: t('settings.codex.resources.history'),
      attr: { type: 'button' },
    });
    historyButton.addEventListener('click', () => void this.openHistory(context));
    const createButton = actionsEl.createEl('button', {
      cls: 'opencodian-codex-resource-create',
      text: t('settings.codex.resources.create'),
      attr: { type: 'button' },
    });
    createButton.addEventListener('click', () => this.promptCreate(context));
    const summaryEl = groupEl.createDiv({ cls: 'opencodian-codex-resource-group-summary' });
    const scrollEl = groupEl.createDiv({ cls: 'opencodian-settings-scrollarea opencodian-codex-resource-scroll' });
    const viewportEl = scrollEl.createDiv({ cls: 'opencodian-settings-scrollarea-viewport' });
    const listEl = viewportEl.createDiv({
      cls: 'opencodian-settings-scrollarea-content opencodian-codex-resource-list',
    });
    void this.discoverAllScopes(context).then((items) => {
      const projectCount = items.filter((item) => item.scope === 'project').length;
      summaryEl.setText(t('settings.codex.resources.groupSummary', {
        project: String(projectCount),
        global: String(items.length - projectCount),
      }));
      if (items.length === 0) {
        listEl.createDiv({ cls: 'opencodian-settings-inline-empty', text: t('settings.codex.resources.empty') });
      } else {
        for (const item of items) this.renderResourceRow(listEl, item, context);
      }
      onContentRendered?.();
    });
  }

  private async discoverAllScopes(context: CodexResourceContext): Promise<CodexResourceItem[]> {
    const scopes: Array<{ scope: CodexResourceScope; basePath: string | null }> = [
      { scope: 'project', basePath: context.vaultPath },
      { scope: 'global', basePath: context.homePath },
    ];
    const results: CodexResourceItem[] = [];
    for (const selected of scopes) {
      if (!selected.basePath) continue;
      const discovered = context.kind === 'skill'
        ? await discoverCodexSkillResources({ scope: selected.scope, basePath: selected.basePath })
        : await discoverCodexAgentResources({ scope: selected.scope, basePath: selected.basePath });
      results.push(...discovered.map((item) => ({
        ...item,
        scope: selected.scope,
      })) as CodexResourceItem[]);
    }
    return results;
  }

  private renderResourceRow(listEl: HTMLElement, item: CodexResourceItem, context: CodexResourceContext): void {
    const rowEl = listEl.createDiv({
      cls: 'opencodian-codex-resource-row',
      attr: {
        'data-resource-scope': item.scope,
        'data-resource-readonly': String(item.readonly),
        'data-resource-revision': item.revision.sha256,
      },
    });
    const headerEl = rowEl.createDiv({ cls: 'opencodian-codex-resource-row-header' });
    headerEl.createSpan({ cls: 'opencodian-codex-resource-row-name', text: item.name });
    headerEl.createSpan({
      cls: item.scope === 'global' ? 'opencodian-codex-resource-scope is-global' : 'opencodian-codex-resource-scope is-project',
      text: item.scope === 'global'
        ? t('settings.codex.resources.scopeGlobalEditable')
        : t('settings.codex.resources.scopeProject'),
    });
    const actionsEl = headerEl.createDiv({ cls: 'opencodian-codex-resource-row-actions' });
    const editButton = actionsEl.createEl('button', {
      cls: 'opencodian-codex-resource-edit',
      text: t('settings.codex.resources.edit'),
      attr: { type: 'button' },
    });
    editButton.addEventListener('click', () => this.openEditor(item, context, 'edit'));
    if (context.kind === 'skill') {
      const previewButton = actionsEl.createEl('button', {
        cls: 'opencodian-codex-resource-preview',
        text: t('settings.codex.resources.preview'),
        attr: { type: 'button' },
      });
      previewButton.addEventListener('click', () => this.openEditor(item, context, 'preview'));
    }
    const deleteButton = actionsEl.createEl('button', {
      cls: 'opencodian-codex-resource-delete',
      attr: { type: 'button', 'aria-label': t('settings.codex.resources.delete'), title: t('settings.codex.resources.delete') },
    });
    setIcon(deleteButton, 'trash');
    deleteButton.addEventListener('click', () => void this.confirmDelete(item, context, deleteButton));
    rowEl.createDiv({ cls: 'opencodian-codex-resource-row-desc', text: item.description || t('settings.codex.resources.noDescription') });
    rowEl.createDiv({ cls: 'opencodian-codex-resource-path', text: item.revision.canonicalPath });
    rowEl.createDiv({
      cls: 'opencodian-codex-resource-revision',
      text: t('settings.codex.resources.revision', { value: item.revision.sha256.slice(0, 12) }),
    });
  }

  private promptCreate(context: CodexResourceContext): void {
    const modal = new Modal(this.options.plugin.app);
    modal.contentEl.addClass('opencodian-codex-resource-modal');
    modal.titleEl.setText(t('settings.codex.resources.createTitle'));
    let scope: CodexResourceScope = 'project';
    let name = '';
    const targetEl = modal.contentEl.createDiv({ cls: 'opencodian-codex-resource-target' });
    const updateTarget = () => {
      targetEl.setText(getCodexResourceTargetPath(context.kind, scope, context.vaultPath, context.homePath, name || 'example') ?? t('settings.codex.resources.noTarget'));
    };
    new Setting(modal.contentEl)
      .setName(t('settings.codex.resources.scopeField'))
      .addDropdown((dropdown) => {
        dropdown.addOption('project', t('settings.codex.resources.scopeProject'));
        dropdown.addOption('global', t('settings.codex.resources.scopeGlobalEditable'));
        dropdown.setValue('project');
        dropdown.onChange((value) => {
          scope = value === 'global' ? 'global' : 'project';
          updateTarget();
        });
      });
    new Setting(modal.contentEl)
      .setName(t('settings.codex.resources.nameField'))
      .addText((text) => text.onChange((value) => { name = value; updateTarget(); }));
    updateTarget();
    const actionsEl = modal.contentEl.createDiv({ cls: 'opencodian-codex-resource-modal-actions' });
    const createButton = actionsEl.createEl('button', { cls: 'mod-cta', text: t('settings.codex.resources.create'), attr: { type: 'button' } });
    createButton.addEventListener('click', async () => {
      const target = getCodexResourceTargetPath(context.kind, scope, context.vaultPath, context.homePath, name || 'example') ?? `${scope}:${name}`;
      const mutationKey = this.mutationKey('create', context, target);
      if (this.mutationInFlight.has(mutationKey)) return;
      const basePath = scope === 'project' ? context.vaultPath : context.homePath;
      if (!basePath) {
        new Notice(t('settings.codex.resources.error.empty-vault'));
        return;
      }
      this.mutationInFlight.add(mutationKey);
      const defaultLabel = t('settings.codex.resources.create');
      createButton.disabled = true;
      createButton.setText(t('settings.codex.resources.creating'));
      try {
        const result = context.kind === 'skill'
          ? await createCodexSkillResource({ scope, basePath, name, expectedRevision: null })
          : await createCodexAgentResource({ scope, basePath, name, expectedRevision: null });
        if (result.status === 'success') {
          this.options.onAfterMutation?.();
          modal.close();
          context.onReload();
        } else {
          new Notice(this.describeMutationResult(result.status));
        }
      } catch {
        new Notice(t('settings.codex.resources.error.write-failed'));
      } finally {
        this.mutationInFlight.delete(mutationKey);
        createButton.disabled = false;
        createButton.setText(defaultLabel);
      }
    });
    modal.open();
  }

  private openEditor(item: CodexResourceItem, context: CodexResourceContext, mode: 'edit' | 'preview'): void {
    const modal = new Modal(this.options.plugin.app);
    modal.contentEl.addClass('opencodian-codex-resource-modal');
    modal.titleEl.setText(t(mode === 'preview' ? 'settings.codex.resources.previewTitle' : 'settings.codex.resources.editTitle', { name: item.name }));
    const metadataEl = modal.contentEl.createDiv({ cls: 'opencodian-resource-editor-metadata' });
    metadataEl.createSpan({ text: t('settings.codex.resources.scopeValue', { value: item.scope }) });
    metadataEl.createSpan({ text: t('settings.codex.resources.pathValue', { value: item.revision.canonicalPath }) });
    const revisionEl = metadataEl.createSpan({ text: t('settings.codex.resources.revision', { value: item.revision.sha256.slice(0, 12) }) });
    let expectedRevision = item.revision;
    let content = '';
    const textarea = modal.contentEl.createEl('textarea', {
      cls: 'opencodian-codex-resource-editor',
      attr: { 'aria-label': modal.titleEl.textContent ?? '', spellcheck: 'false' },
    });
    const markdownPreview = context.kind === 'skill' && mode === 'preview';
    const preview = markdownPreview
      ? modal.contentEl.createDiv({ cls: 'opencodian-codex-resource-preview-pane markdown-rendered' })
      : null;
    textarea.hidden = markdownPreview;
    if (preview) preview.hidden = false;
    let saveButton: HTMLButtonElement | null = null;
    if (mode === 'edit') {
      const actionsEl = modal.contentEl.createDiv({ cls: 'opencodian-codex-resource-modal-actions' });
      saveButton = actionsEl.createEl('button', { cls: 'mod-cta', text: t('settings.codex.resources.save'), attr: { type: 'button' } });
      saveButton.disabled = true;
      saveButton.addEventListener('click', async () => {
        const validationError = context.kind === 'skill' ? validateCodexSkillContent(content) : validateCodexAgentContent(content);
        if (validationError) {
          new Notice(validationError);
          return;
        }
        const basePath = item.scope === 'project' ? context.vaultPath : context.homePath;
        if (!basePath) {
          new Notice(t('settings.codex.resources.error.empty-vault'));
          return;
        }
        // Disable while the secure write is in flight so a double-click cannot
        // race a second mutation against the just-advanced revision.
        if (saveButton) saveButton.disabled = true;
        try {
          const result = context.kind === 'skill'
            ? await updateCodexSkillResource({ scope: item.scope, basePath, name: item.name, content, expectedRevision })
            : await updateCodexAgentResource({ scope: item.scope, basePath, name: item.name, content, expectedRevision });
          if (result.status === 'success') {
            new Notice(t('settings.codex.resources.saved'));
            this.options.onAfterMutation?.();
            modal.close();
            context.onReload();
          } else {
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
        ? t('settings.codex.resources.conflictDraftRetained')
        : status === 'invalid-path'
          ? t('settings.codex.resources.error.invalid-path')
          : t('settings.codex.resources.error.read-failed');
      errorEl.setText(message);
      content = '';
      textarea.value = '';
      textarea.disabled = true;
      if (saveButton) saveButton.disabled = true;
      preview?.empty();
    };
    const renderPreview = (markdown: string): void => {
      if (!markdownPreview || !preview) return;
      preview.empty();
      void MarkdownRenderer.renderMarkdown(markdown, preview, '', this.options.plugin);
    };
    const basePath = item.scope === 'project' ? context.vaultPath : context.homePath;
    if (!basePath) {
      showReadFailure('invalid-path');
    } else {
      const loadContent = context.kind === 'skill'
        ? readCodexSkillResourceContent({ scope: item.scope, basePath, name: item.name, expectedRevision: item.revision })
        : readCodexAgentResourceContent({ scope: item.scope, basePath, name: item.name, expectedRevision: item.revision });
      void loadContent.then((result) => {
        if (result.status !== 'success') {
          showReadFailure(result.status);
          return;
        }
        content = result.content;
        expectedRevision = result.revision;
        revisionEl.setText(t('settings.codex.resources.revision', { value: expectedRevision.sha256.slice(0, 12) }));
        textarea.value = content;
        textarea.disabled = false;
        if (saveButton) saveButton.disabled = false;
        renderPreview(content);
      }).catch(() => showReadFailure('read-failed'));
    }
    textarea.addEventListener('input', () => { content = textarea.value; });
    modal.open();
  }

  private async confirmDelete(item: CodexResourceItem, context: CodexResourceContext, button: HTMLButtonElement | null = null): Promise<void> {
    const basePath = item.scope === 'project' ? context.vaultPath : context.homePath;
    if (!basePath) {
      new Notice(t('settings.codex.resources.error.empty-vault'));
      return;
    }
    const mutationKey = this.mutationKey('delete', context, item.revision.canonicalPath);
    if (this.mutationInFlight.has(mutationKey)) return;
    this.mutationInFlight.add(mutationKey);
    if (button) {
      button.disabled = true;
      button.setText(t('settings.codex.resources.deleting'));
    }
    try {
      let confirmed = false;
      try {
        confirmed = typeof window.confirm === 'function'
          && window.confirm(t('settings.codex.resources.deleteConfirm', { name: item.name })) === true;
      } catch {
        confirmed = false;
      }
      if (!confirmed) return;
      const result = context.kind === 'skill'
        ? await deleteCodexSkillResource({ scope: item.scope, basePath, name: item.name, expectedRevision: item.revision })
        : await deleteCodexAgentResource({ scope: item.scope, basePath, name: item.name, expectedRevision: item.revision });
      if (result.status === 'success') {
        new Notice(t('settings.codex.resources.deleted'));
        this.options.onAfterMutation?.();
        context.onReload();
      } else {
        new Notice(this.describeMutationResult(result.status));
      }
    } catch {
      new Notice(t('settings.codex.resources.error.write-failed'));
    } finally {
      this.mutationInFlight.delete(mutationKey);
      if (button) {
        button.disabled = false;
        setIcon(button, 'trash');
      }
    }
  }

  private async openHistory(context: CodexResourceContext): Promise<void> {
    const modal = new Modal(this.options.plugin.app);
    modal.contentEl.addClass('opencodian-codex-resource-history-modal');
    modal.titleEl.setText(t('settings.codex.resources.historyTitle'));
    const bodyEl = modal.contentEl.createDiv({ cls: 'opencodian-resource-history-list' });
    const scopes: Array<{ scope: CodexResourceScope; basePath: string }> = [
      ...(context.vaultPath ? [{ scope: 'project' as const, basePath: context.vaultPath }] : []),
      { scope: 'global', basePath: context.homePath },
    ];
    const catalogs: Array<{ scope: CodexResourceScope; basePath: string; outcome: ArchiveHistoryCatalogOutcome }> = [];
    for (const selected of scopes) {
      const outcome = context.kind === 'skill'
        ? await catalogCodexSkillResourceHistory(selected)
        : await catalogCodexAgentResourceHistory(selected);
      catalogs.push({ scope: selected.scope, basePath: selected.basePath, outcome });
    }
    const failedCatalogs = catalogs.filter((catalog) => catalog.outcome.status !== 'success');
    const targets = catalogs.flatMap((catalog) => {
      if (catalog.outcome.status !== 'success') return [];
      return catalog.outcome.targets
        .filter((target): target is ArchiveHistoryTarget & { scope: CodexResourceScope } => target.scope === 'project' || target.scope === 'global')
        .map((target) => ({
          ...target,
          scope: target.scope,
          basePath: target.scope === 'project' ? (context.vaultPath ?? catalog.basePath) : context.homePath,
        }));
    });
    const targetsWithRevision: Array<ArchiveHistoryTarget & { scope: CodexResourceScope; basePath: string; expectedRevision: FileRevision | null }> = [];
    for (const target of targets) {
      const name = context.kind === 'skill'
        ? path.basename(path.dirname(target.canonicalTarget))
        : path.basename(target.canonicalTarget, '.toml');
      let expectedRevision: FileRevision | null = null;
      if (name) {
        const discovered = context.kind === 'skill'
          ? await discoverCodexSkillResources({ scope: target.scope, basePath: target.basePath })
          : await discoverCodexAgentResources({ scope: target.scope, basePath: target.basePath });
        expectedRevision = discovered.find((item) => item.name === name)?.revision ?? null;
      }
      targetsWithRevision.push({ ...target, expectedRevision });
    }
    if (failedCatalogs.length > 0) {
      bodyEl.createDiv({ cls: 'opencodian-resource-history-error', text: t('settings.codex.resources.historyArchiveFailed') });
    } else if (targetsWithRevision.length === 0) {
      bodyEl.createDiv({ cls: 'opencodian-settings-inline-empty', text: t('settings.codex.resources.historyEmpty') });
    }
    for (const target of targetsWithRevision) {
      const targetEl = bodyEl.createDiv({ cls: 'opencodian-resource-history-target' });
      targetEl.createDiv({ cls: 'opencodian-resource-history-target-path', text: target.canonicalTarget });
      for (const entry of target.entries) {
        const entryEl = targetEl.createDiv({ cls: 'opencodian-resource-history-entry' });
        entryEl.createSpan({ text: t('settings.codex.resources.historyEntry', { kind: entry.archiveKind, date: new Date(entry.timestamp).toLocaleString(), size: String(entry.size) }) });
        const restoreButton = entryEl.createEl('button', { cls: 'opencodian-resource-history-restore', text: t('settings.codex.resources.restore'), attr: { type: 'button' } });
        restoreButton.addEventListener('click', () => void this.restoreHistoryEntry(modal, context, target, entry.identity, restoreButton));
      }
    }
    modal.open();
  }

  // eslint-disable-next-line max-params -- Restore needs the modal, selected resource context/target, archive identity, and loading button.
  private async restoreHistoryEntry(
    modal: Modal,
    context: CodexResourceContext,
    target: ArchiveHistoryTarget & { scope: CodexResourceScope; basePath: string; expectedRevision: FileRevision | null },
    entryIdentity: ArchiveHistoryEntryIdentity,
    button: HTMLButtonElement | null = null,
  ): Promise<void> {
    const name = context.kind === 'skill'
      ? path.basename(path.dirname(target.canonicalTarget))
      : path.basename(target.canonicalTarget, '.toml');
    const mutationKey = this.mutationKey('restore', context, target.canonicalTarget);
    if (this.mutationInFlight.has(mutationKey)) return;
    this.mutationInFlight.add(mutationKey);
    if (button) {
      button.disabled = true;
      button.setText(t('settings.codex.resources.restoring'));
    }
    try {
      let confirmed = false;
      try {
        confirmed = typeof window.confirm === 'function'
          && window.confirm(t('settings.codex.resources.restoreConfirm', { name })) === true;
      } catch {
        confirmed = false;
      }
      if (!confirmed) return;
      const result = context.kind === 'skill'
        ? await restoreCodexSkillResourceHistoryEntry({ scope: target.scope, basePath: target.basePath, name, entryIdentity, expectedRevision: target.expectedRevision })
        : await restoreCodexAgentResourceHistoryEntry({ scope: target.scope, basePath: target.basePath, name, entryIdentity, expectedRevision: target.expectedRevision });
      if (result.status === 'success') {
        new Notice(t('settings.codex.resources.restored'));
        modal.close();
        this.options.onAfterMutation?.();
        context.onReload();
      } else {
        new Notice(this.describeMutationResult(result.status));
        this.showConflict(modal.contentEl, result.status, 'settings.codex.resources.restoreConflict');
      }
    } catch {
      new Notice(t('settings.codex.resources.error.write-failed'));
    } finally {
      this.mutationInFlight.delete(mutationKey);
      if (button) {
        button.disabled = false;
        button.setText(t('settings.codex.resources.restore'));
      }
    }
  }

  private showConflict(modalContent: HTMLElement, status: string, messageKey: TranslationKey = 'settings.codex.resources.conflictDraftRetained'): void {
    if (status !== 'conflict') return;
    let conflict = modalContent.querySelector<HTMLElement>('.opencodian-resource-conflict');
    if (!conflict) conflict = modalContent.createDiv({ cls: 'opencodian-resource-conflict', attr: { role: 'alert' } });
    conflict.setText(t(messageKey));
  }

  private describeMutationResult(status: string): string {
    const key = `settings.codex.resources.error.${status}` as TranslationKey;
    return t(key) || t('settings.codex.resources.error.write-failed');
  }
}
