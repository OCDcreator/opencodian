/**
 * SettingsClaudeResourcesSection — Claude resource management panel.
 *
 * Surfaces Claude commands (.claude/commands/<name>.md), skills
 * (.claude/skills/<name>/SKILL.md), and agents (.claude/agents/<name>.md) for
 * both project (editable) and global (read-only) scopes. Project resources
 * support create / edit / delete through validated, atomic writes; global
 * resources (~/.claude) are strictly read-only — OpenCodian never writes to
 * global Claude directories.
 *
 * The rendering is a thin layer over the tested discovery/CRUD functions; no
 * write logic lives here. After a successful project mutation the host may
 * pass `onAfterMutation` to invalidate the Claude runtime / slash-command menu
 * catalog so the next `/` open reflects the change (runtime
 * supportedCommands()/supportedAgents() remains the final menu truth).
 */

import { Modal, Notice, setIcon,Setting } from 'obsidian';
import * as os from 'os';

import {
  type ClaudeProjectAgentInfo,
  type ClaudeProjectCommandInfo,
  type ClaudeProjectSkillInfo,
  createClaudeProjectAgent,
  createClaudeProjectCommand,
  createClaudeProjectSkill,
  defaultClaudeAgentContent,
  defaultClaudeCommandContent,
  defaultClaudeSkillContent,
  deleteClaudeProjectAgent,
  deleteClaudeProjectCommand,
  deleteClaudeProjectSkill,
  discoverClaudeGlobalAgents,
  discoverClaudeGlobalCommands,
  discoverClaudeGlobalSkills,
  discoverClaudeProjectAgents,
  discoverClaudeProjectCommands,
  discoverClaudeProjectSkills,
  type ProjectResourceWriteError,
  readClaudeAgentContent,
  readClaudeCommandContent,
  readClaudeSkillContent,
  updateClaudeProjectAgent,
  updateClaudeProjectCommand,
  updateClaudeProjectSkill,
  validateClaudeAgentContent,
  validateClaudeCommandContent,
  validateClaudeSkillContent,
} from '../../core/agents/backend';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { getVaultBasePath } from '../../shared';

export type ClaudeResourceKind = 'command' | 'skill' | 'agent';

export interface SettingsClaudeResourcesSectionOptions {
  plugin: OpenCodianPlugin;
  /** Invoked after a successful project mutation to invalidate the runtime/menu catalog. */
  onAfterMutation?: () => void;
  /** Restricts this instance to focused resource tabs while preserving shared CRUD behavior. */
  kinds?: readonly ClaudeResourceKind[];
}

export interface ClaudeResourceScopeStatus {
  label: string;
  cls: string;
}

/**
 * Pure resolution of the scope status badge for a Claude resource. Extracted so
 * the user-source-enabled logic is independently testable without DOM.
 *
 * - Project resources are always "Project" (never the global/disabled status).
 * - Global resources are read-only; when the `user` setting source is enabled
 *   they show "Global · enabled", otherwise "Global · discovered, not enabled".
 *
 * Does NOT change the source toggle's runtime semantics.
 */
export function resolveClaudeResourceScopeStatus(
  item: { readonly: boolean },
  userSourceEnabled: boolean,
): ClaudeResourceScopeStatus {
  if (!item.readonly) {
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

export class SettingsClaudeResourcesSection {
  constructor(private readonly options: SettingsClaudeResourcesSectionOptions) {}

  /**
   * Whether the `user` Claude setting source is enabled. Global resources
   * (~/.claude) are only consulted by the Claude runtime when `user` is in
   * `settingSources`; otherwise they are discovered-but-not-enabled. This does
   * NOT change the source toggle's runtime semantics — it only drives the
   * status badge shown next to global resources.
   */
  private isUserSourceEnabled(): boolean {
    const sources = this.options.plugin.settings.backendSettings?.claudeCode?.settingSources;
    return Array.isArray(sources) ? sources.includes('user') : false;
  }

  render(bodyEl: HTMLElement): void {
    const { plugin } = this.options;
    const vaultPath = getVaultBasePath(plugin.app);
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

    const ctx = { vaultPath, onReload: () => this.render(bodyEl), userSourceEnabled };

    const kinds = this.options.kinds ?? ['command', 'skill', 'agent'];
    if (kinds.includes('command')) {
      this.renderResourceGroup(bodyEl, t('settings.claudeCode.resources.commands'), {
        kind: 'command',
        discover: async () => [
          ...(await discoverClaudeProjectCommands(vaultPath)),
          ...(await discoverClaudeGlobalCommands(homePath)),
        ],
        ...ctx,
      });
    }
    if (kinds.includes('skill')) {
      this.renderResourceGroup(bodyEl, t('settings.claudeCode.resources.skills'), {
        kind: 'skill',
        discover: async () => [
          ...(await discoverClaudeProjectSkills(vaultPath)),
          ...(await discoverClaudeGlobalSkills(homePath)),
        ],
        ...ctx,
      });
    }
    if (kinds.includes('agent')) {
      this.renderResourceGroup(bodyEl, t('settings.claudeCode.resources.agents'), {
        kind: 'agent',
        discover: async () => [
          ...(await discoverClaudeProjectAgents(vaultPath)),
          ...(await discoverClaudeGlobalAgents(homePath)),
        ],
        ...ctx,
      });
    }
  }

  private renderResourceGroup(
    bodyEl: HTMLElement,
    label: string,
    context: {
      kind: ClaudeResourceKind;
      discover: () => Promise<Array<ClaudeProjectCommandInfo | ClaudeProjectSkillInfo | ClaudeProjectAgentInfo>>;
      vaultPath: string | null;
      onReload: () => void;
      userSourceEnabled: boolean;
    },
  ): void {
    const groupEl = bodyEl.createDiv({
      cls: 'opencodian-claude-resource-group opencodian-resource-group-card',
      attr: { 'data-claude-resource-group': context.kind },
    });

    const headerEl = groupEl.createDiv({ cls: 'opencodian-claude-resource-group-header' });
    headerEl.createEl('h4', {
      cls: 'opencodian-claude-resource-group-title',
      text: label,
    });
    const createButtonEl = headerEl.createEl('button', {
      cls: 'opencodian-claude-resource-create',
      text: t('settings.claudeCode.resources.create'),
      attr: { type: 'button' },
    });
    createButtonEl.addEventListener('click', () => this.promptCreate(context));

    const summaryEl = groupEl.createDiv({ cls: 'opencodian-claude-resource-group-summary' });

    const scrollEl = groupEl.createDiv({
      cls: 'opencodian-settings-scrollarea opencodian-claude-resource-scroll',
    });
    const viewportEl = scrollEl.createDiv({ cls: 'opencodian-settings-scrollarea-viewport' });
    const listEl = viewportEl.createDiv({
      cls: 'opencodian-settings-scrollarea-content opencodian-claude-resource-list',
    });
    this.syncAgentScrollAreaHeight(bodyEl, scrollEl, viewportEl);

    if (!context.vaultPath) {
      summaryEl.remove();
      listEl.createDiv({
        cls: 'opencodian-settings-inline-empty',
        text: t('settings.claudeCode.resources.noVault'),
      });
      return;
    }

    void context.discover().then((items) => {
      const projectCount = items.filter((item) => !item.readonly).length;
      summaryEl.setText(t('settings.claudeCode.resources.groupSummary', {
        project: String(projectCount),
        global: String(items.length - projectCount),
      }));
      if (items.length === 0) {
        listEl.createDiv({
          cls: 'opencodian-settings-inline-empty',
          text: t('settings.claudeCode.resources.empty'),
        });
      } else {
        for (const item of items) {
          this.renderResourceRow(listEl, item, context);
        }
      }
      this.syncAgentScrollAreaHeight(bodyEl, scrollEl, viewportEl);
    });
  }

  /**
   * The standalone Agents tab has one resource group, so its ScrollArea can
   * safely take the remaining settings-window height. Skills & Commands keeps
   * its per-group cap to prevent either list from monopolizing the panel.
   */
  private syncAgentScrollAreaHeight(bodyEl: HTMLElement, scrollEl: HTMLElement, viewportEl: HTMLElement): void {
    if (bodyEl.dataset.claudeCodeSection !== 'agents') {
      return;
    }

    window.requestAnimationFrame(() => {
      if (!scrollEl.isConnected || !viewportEl.isConnected) {
        return;
      }

      const viewportTop = viewportEl.getBoundingClientRect().top;
      const availableHeight = Math.max(280, Math.floor(window.innerHeight - viewportTop - 24));
      scrollEl.style.setProperty('--opencodian-settings-scrollarea-available-height', `${availableHeight}px`);
    });
  }

  private filePathOf(item: ClaudeProjectCommandInfo | ClaudeProjectSkillInfo | ClaudeProjectAgentInfo): string {
    return 'skillMdPath' in item ? item.skillMdPath : item.filePath;
  }

  private renderResourceRow(
    listEl: HTMLElement,
    item: ClaudeProjectCommandInfo | ClaudeProjectSkillInfo | ClaudeProjectAgentInfo,
    context: { kind: ClaudeResourceKind; vaultPath: string | null; onReload: () => void; userSourceEnabled: boolean },
  ): void {
    const filePath = this.filePathOf(item);
    const scopeStatus = resolveClaudeResourceScopeStatus(item, context.userSourceEnabled);

    const rowEl = listEl.createDiv({ cls: 'opencodian-claude-resource-row' });

    const headerEl = rowEl.createDiv({ cls: 'opencodian-claude-resource-row-header' });
    headerEl.createSpan({
      cls: 'opencodian-claude-resource-row-name',
      text: item.name,
    });
    headerEl.createSpan({
      cls: scopeStatus.cls,
      text: scopeStatus.label,
    });

    const actionsEl = headerEl.createDiv({ cls: 'opencodian-claude-resource-row-actions' });
    if (!item.readonly) {
      const editButtonEl = actionsEl.createEl('button', {
        cls: 'opencodian-claude-resource-edit',
        text: t('settings.claudeCode.resources.edit'),
        attr: { type: 'button' },
      });
      editButtonEl.addEventListener('click', () => this.openEditor(item, context, false));
      const deleteButtonEl = actionsEl.createEl('button', {
        cls: 'opencodian-claude-resource-delete',
        attr: {
          type: 'button',
          'aria-label': t('settings.claudeCode.resources.delete'),
          title: t('settings.claudeCode.resources.delete'),
        },
      });
      setIcon(deleteButtonEl, 'trash');
      deleteButtonEl.addEventListener('click', () => void this.confirmDelete(item.name, context));
    } else {
      const viewButtonEl = actionsEl.createEl('button', {
        cls: 'opencodian-claude-resource-view',
        text: t('settings.claudeCode.resources.view'),
        attr: { type: 'button' },
      });
      viewButtonEl.addEventListener('click', () => this.openEditor(item, context, true));
    }

    rowEl.createDiv({
      cls: 'opencodian-claude-resource-row-desc',
      text: item.description || t('settings.claudeCode.resources.noDescription'),
    });
    rowEl.createDiv({
      cls: 'opencodian-claude-resource-path',
      text: filePath,
    });
  }

  private async runCreate(
    context: { kind: ClaudeResourceKind; vaultPath: string | null },
    name: string,
  ): Promise<boolean> {
    if (!context.vaultPath) {
      new Notice(t('settings.claudeCode.resources.error.empty-vault'));
      return false;
    }
    let ok = false;
    if (context.kind === 'command') {
      const p = await createClaudeProjectCommand(context.vaultPath, name);
      ok = p !== null;
    } else if (context.kind === 'skill') {
      const p = await createClaudeProjectSkill(context.vaultPath, name);
      ok = p !== null;
    } else {
      const p = await createClaudeProjectAgent(context.vaultPath, name);
      ok = p !== null;
    }
    if (ok) {
      this.options.onAfterMutation?.();
      return true;
    }
    new Notice(t('settings.claudeCode.resources.error.write-failed'));
    return false;
  }

  private promptCreate(context: { kind: ClaudeResourceKind; vaultPath: string | null; onReload: () => void }): void {
    const modal = new Modal(this.options.plugin.app);
    modal.contentEl.addClass('opencodian-claude-resource-modal');
    modal.titleEl.setText(t('settings.claudeCode.resources.createTitle'));
    let name = '';
    new Setting(modal.contentEl)
      .setName(t('settings.claudeCode.resources.nameField'))
      .addText((text) => {
        text.onChange((value) => { name = value; });
      });
    const actionsEl = modal.contentEl.createDiv({ cls: 'opencodian-claude-resource-modal-actions' });
    const createButtonEl = actionsEl.createEl('button', {
      cls: 'mod-cta',
      text: t('settings.claudeCode.resources.create'),
      attr: { type: 'button' },
    });
    createButtonEl.addEventListener('click', async () => {
      const ok = await this.runCreate(context, name);
      if (ok) {
        modal.close();
        context.onReload();
      }
    });
    modal.open();
  }

  /**
   * Open a viewer/editor for a specific resource. Loads content by the item's
   * EXACT path (not by name lookup), so a global readonly item always shows its
   * own global content even when a project resource shares the same name.
   * Write/save is only offered for project (non-readonly) items.
   */
  private openEditor(
    item: ClaudeProjectCommandInfo | ClaudeProjectSkillInfo | ClaudeProjectAgentInfo,
    context: { kind: ClaudeResourceKind; vaultPath: string | null; onReload: () => void },
    readonly: boolean,
  ): void {
    const name = item.name;
    const exactPath = this.filePathOf(item);
    const modal = new Modal(this.options.plugin.app);
    modal.contentEl.addClass('opencodian-claude-resource-modal');
    modal.titleEl.setText(
      readonly
        ? t('settings.claudeCode.resources.viewTitle', { name })
        : t('settings.claudeCode.resources.editTitle', { name }),
    );
    let content = '';
    const loadContent = async (): Promise<string> => {
      const loaded = context.kind === 'command'
        ? await readClaudeCommandContent(exactPath)
        : context.kind === 'skill'
          ? await readClaudeSkillContent(exactPath)
          : await readClaudeAgentContent(exactPath);
      return loaded ?? (context.kind === 'command'
        ? defaultClaudeCommandContent(name)
        : context.kind === 'skill'
          ? defaultClaudeSkillContent(name)
          : defaultClaudeAgentContent(name));
    };

    const textareaEl = modal.contentEl.createEl('textarea', {
      cls: 'opencodian-claude-resource-editor',
      attr: { 'aria-label': modal.titleEl.getText(), spellcheck: 'false' },
    });
    if (readonly) {
      textareaEl.readOnly = true;
    }
    void loadContent().then((loaded) => {
      content = loaded;
      textareaEl.value = content;
    });
    textareaEl.addEventListener('input', () => {
      content = textareaEl.value;
    });

    if (!readonly) {
      const actionsEl = modal.contentEl.createDiv({ cls: 'opencodian-claude-resource-modal-actions' });
      const saveButtonEl = actionsEl.createEl('button', {
        cls: 'mod-cta',
        text: t('settings.claudeCode.resources.save'),
        attr: { type: 'button' },
      });
      saveButtonEl.addEventListener('click', async () => {
        if (!context.vaultPath) {
          new Notice(t('settings.claudeCode.resources.error.empty-vault'));
          return;
        }
        const validationError = context.kind === 'command'
          ? validateClaudeCommandContent(content)
          : context.kind === 'skill'
            ? validateClaudeSkillContent(content)
            : validateClaudeAgentContent(content);
        if (validationError) {
          new Notice(validationError);
          return;
        }
        const result = context.kind === 'command'
          ? await updateClaudeProjectCommand(context.vaultPath, name, content)
          : context.kind === 'skill'
            ? await updateClaudeProjectSkill(context.vaultPath, name, content)
            : await updateClaudeProjectAgent(context.vaultPath, name, content);
        if (result.ok) {
          new Notice(t('settings.claudeCode.resources.saved'));
          this.options.onAfterMutation?.();
          modal.close();
          context.onReload();
        } else {
          new Notice(this.describeWriteError((result as { reason: ProjectResourceWriteError }).reason));
        }
      });
    }
    modal.open();
  }

  private async confirmDelete(
    name: string,
    context: { kind: ClaudeResourceKind; vaultPath: string | null; onReload: () => void },
  ): Promise<void> {
    if (!context.vaultPath) {
      return;
    }
    const result = context.kind === 'command'
      ? await deleteClaudeProjectCommand(context.vaultPath, name)
      : context.kind === 'skill'
        ? await deleteClaudeProjectSkill(context.vaultPath, name)
        : await deleteClaudeProjectAgent(context.vaultPath, name);
    if (result.ok) {
      new Notice(t('settings.claudeCode.resources.deleted'));
      this.options.onAfterMutation?.();
      context.onReload();
    } else {
      new Notice(this.describeWriteError((result as { reason: ProjectResourceWriteError }).reason));
    }
  }

  private describeWriteError(reason: ProjectResourceWriteError): string {
    const key = `settings.claudeCode.resources.error.${reason}` as const;
    return t(key) ?? t('settings.claudeCode.resources.error.write-failed');
  }
}
