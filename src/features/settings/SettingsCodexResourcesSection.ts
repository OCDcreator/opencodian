/**
 * SettingsCodexResourcesSection — Codex resource management panel.
 *
 * Surfaces Codex skills (.agents/skills/&lt;name&gt;/SKILL.md) and agents
 * (.codex/agents/&lt;name&gt;.toml) for both project (editable) and global
 * (read-only) scopes. Project resources support create / edit / delete through
 * validated, atomic writes; global resources (~/.agents, ~/.codex) are strictly
 * read-only — OpenCodian never writes to global Codex directories.
 *
 * The rendering is a thin layer over the tested discovery/CRUD functions in
 * `CodexProjectResourceDiscovery`; no write logic lives here.
 */

import { Modal, Notice, setIcon,Setting } from 'obsidian';
import * as os from 'os';

import {
  type CodexAgentInfo,
  type CodexResourceWriteError,
  type CodexResourceWriteResult,
  type CodexSkillInfo,
  createCodexProjectAgent,
  createCodexProjectSkill,
  defaultCodexAgentContent,
  defaultCodexSkillContent,
  deleteCodexProjectAgent,
  deleteCodexProjectSkill,
  discoverCodexGlobalAgents,
  discoverCodexGlobalSkills,
  discoverCodexProjectAgents,
  discoverCodexProjectSkills,
  readCodexAgentContent,
  readCodexSkillContent,
  updateCodexProjectAgent,
  updateCodexProjectSkill,
  validateCodexAgentContent,
  validateCodexSkillContent,
} from '../../core/agents/backend';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { getVaultBasePath } from '../../shared';

export interface SettingsCodexResourcesSectionOptions {
  plugin: OpenCodianPlugin;
  createSectionHeading: (containerEl: HTMLElement, title: string, tooltip?: string) => HTMLHeadingElement;
  /**
   * Invoked after a successful project mutation (create/update/delete) to
   * invalidate the runtime / slash-command menu catalog so the next `/` open
   * reflects the change immediately (not via skills/changed or the 120s TTL).
   */
  onAfterMutation?: () => void;
}

export class SettingsCodexResourcesSection {
  constructor(private readonly options: SettingsCodexResourcesSectionOptions) {}

  render(bodyEl: HTMLElement): void {
    const { plugin } = this.options;
    const vaultPath = getVaultBasePath(plugin.app);
    const homePath = os.homedir();

    this.options.createSectionHeading(
      bodyEl,
      t('settings.codex.resources.title'),
      t('settings.codex.resources.description'),
    );

    this.renderResourceGroup(
      bodyEl,
      t('settings.codex.resources.skills'),
      async () => [
        ...(await discoverCodexProjectSkills(vaultPath)),
        ...(await discoverCodexGlobalSkills(homePath)),
      ],
      {
        kind: 'skill',
        vaultPath,
        onReload: () => this.render(bodyEl),
      },
    );

    this.renderResourceGroup(
      bodyEl,
      t('settings.codex.resources.agents'),
      async () => [
        ...(await discoverCodexProjectAgents(vaultPath)),
        ...(await discoverCodexGlobalAgents(homePath)),
      ],
      {
        kind: 'agent',
        vaultPath,
        onReload: () => this.render(bodyEl),
      },
    );

    // Honest reload-boundary note for Codex agents (flat muted note, not a row-card).
    const noteEl = bodyEl.createDiv({ cls: 'opencodian-codex-resource-boundary-note' });
    noteEl.createSpan({
      cls: 'opencodian-codex-resource-boundary-note-title',
      text: t('settings.codex.resources.agentReloadBoundary.name'),
    });
    noteEl.createSpan({
      cls: 'opencodian-codex-resource-boundary-note-desc',
      text: t('settings.codex.resources.agentReloadBoundary.desc'),
    });
  }

  private renderResourceGroup(
    bodyEl: HTMLElement,
    label: string,
    discover: () => Promise<Array<CodexSkillInfo | CodexAgentInfo>>,
    context: { kind: 'skill' | 'agent'; vaultPath: string | null; onReload: () => void },
  ): void {
    const groupEl = bodyEl.createDiv({
      cls: 'opencodian-codex-resource-group opencodian-resource-group-card',
      attr: { 'data-codex-resource-group': context.kind },
    });

    const headerEl = groupEl.createDiv({ cls: 'opencodian-codex-resource-group-header' });
    headerEl.createEl('h4', {
      cls: 'opencodian-codex-resource-group-title',
      text: label,
    });
    const createButtonEl = headerEl.createEl('button', {
      cls: 'opencodian-codex-resource-create',
      text: t('settings.codex.resources.create'),
      attr: { type: 'button' },
    });
    createButtonEl.addEventListener('click', () => this.promptCreate(context));

    const summaryEl = groupEl.createDiv({ cls: 'opencodian-codex-resource-group-summary' });

    const scrollEl = groupEl.createDiv({
      cls: 'opencodian-settings-scrollarea opencodian-codex-resource-scroll',
    });
    const viewportEl = scrollEl.createDiv({ cls: 'opencodian-settings-scrollarea-viewport' });
    const listEl = viewportEl.createDiv({
      cls: 'opencodian-settings-scrollarea-content opencodian-codex-resource-list',
    });

    if (!context.vaultPath) {
      summaryEl.remove();
      listEl.createDiv({
        cls: 'opencodian-settings-inline-empty',
        text: t('settings.codex.resources.noVault'),
      });
      return;
    }

    void discover().then((items) => {
      const projectCount = items.filter((item) => !item.readonly).length;
      summaryEl.setText(t('settings.codex.resources.groupSummary', {
        project: String(projectCount),
        global: String(items.length - projectCount),
      }));
      if (items.length === 0) {
        listEl.createDiv({
          cls: 'opencodian-settings-inline-empty',
          text: t('settings.codex.resources.empty'),
        });
        return;
      }
      for (const item of items) {
        this.renderResourceRow(listEl, item, context);
      }
    });
  }

  private renderResourceRow(
    listEl: HTMLElement,
    item: CodexSkillInfo | CodexAgentInfo,
    context: { kind: 'skill' | 'agent'; vaultPath: string | null; onReload: () => void },
  ): void {
    const filePath = context.kind === 'skill'
      ? (item as CodexSkillInfo).skillMdPath
      : (item as CodexAgentInfo).agentTomlPath;

    const rowEl = listEl.createDiv({ cls: 'opencodian-codex-resource-row' });

    const headerEl = rowEl.createDiv({ cls: 'opencodian-codex-resource-row-header' });
    headerEl.createSpan({
      cls: 'opencodian-codex-resource-row-name',
      text: item.name,
    });
    headerEl.createSpan({
      cls: item.readonly
        ? 'opencodian-codex-resource-scope is-global'
        : 'opencodian-codex-resource-scope is-project',
      text: item.readonly
        ? t('settings.codex.resources.scopeGlobal')
        : t('settings.codex.resources.scopeProject'),
    });

    const actionsEl = headerEl.createDiv({ cls: 'opencodian-codex-resource-row-actions' });
    if (!item.readonly) {
      const editButtonEl = actionsEl.createEl('button', {
        cls: 'opencodian-codex-resource-edit',
        text: t('settings.codex.resources.edit'),
        attr: { type: 'button' },
      });
      editButtonEl.addEventListener('click', () => this.openEditor(item, context, false));
      const deleteButtonEl = actionsEl.createEl('button', {
        cls: 'opencodian-codex-resource-delete',
        attr: {
          type: 'button',
          'aria-label': t('settings.codex.resources.delete'),
          title: t('settings.codex.resources.delete'),
        },
      });
      setIcon(deleteButtonEl, 'trash');
      deleteButtonEl.addEventListener('click', () => {
        void this.confirmDelete(item.name, context);
      });
    } else {
      const viewButtonEl = actionsEl.createEl('button', {
        cls: 'opencodian-codex-resource-view',
        text: t('settings.codex.resources.view'),
        attr: { type: 'button' },
      });
      viewButtonEl.addEventListener('click', () => this.openEditor(item, context, true));
    }

    rowEl.createDiv({
      cls: 'opencodian-codex-resource-row-desc',
      text: item.description || t('settings.codex.resources.noDescription'),
    });
    rowEl.createDiv({
      cls: 'opencodian-codex-resource-path',
      text: filePath,
    });
  }

  private promptCreate(context: { kind: 'skill' | 'agent'; vaultPath: string | null; onReload: () => void }): void {
    const modal = new Modal(this.options.plugin.app);
    modal.contentEl.addClass('opencodian-codex-resource-modal');
    modal.titleEl.setText(t('settings.codex.resources.createTitle'));
    let name = '';
    new Setting(modal.contentEl)
      .setName(t('settings.codex.resources.nameField'))
      .addText((text) => {
        text.onChange((value) => { name = value; });
      });
    const actionsEl = modal.contentEl.createDiv({ cls: 'opencodian-codex-resource-modal-actions' });
    const createButtonEl = actionsEl.createEl('button', {
      cls: 'mod-cta',
      text: t('settings.codex.resources.create'),
      attr: { type: 'button' },
    });
    createButtonEl.addEventListener('click', async () => {
      const result = context.kind === 'skill'
        ? await createCodexProjectSkill(context.vaultPath!, name)
        : await createCodexProjectAgent(context.vaultPath!, name);
      if (result.ok) {
        this.options.onAfterMutation?.();
        modal.close();
        context.onReload();
      } else {
        new Notice(this.describeWriteError((result as { reason: CodexResourceWriteError }).reason));
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
    item: CodexSkillInfo | CodexAgentInfo,
    context: { kind: 'skill' | 'agent'; vaultPath: string | null; onReload: () => void },
    readonly: boolean,
  ): void {
    const name = item.name;
    const modal = new Modal(this.options.plugin.app);
    modal.contentEl.addClass('opencodian-codex-resource-modal');
    modal.titleEl.setText(
      readonly
        ? t('settings.codex.resources.viewTitle', { name })
        : t('settings.codex.resources.editTitle', { name }),
    );
    let content = '';
    const exactPath = context.kind === 'skill'
      ? (item as CodexSkillInfo).skillMdPath
      : (item as CodexAgentInfo).agentTomlPath;
    const loadContent = async (): Promise<string> => {
      const loaded = context.kind === 'skill'
        ? await readCodexSkillContent(exactPath)
        : await readCodexAgentContent(exactPath);
      return loaded ?? (context.kind === 'skill'
        ? defaultCodexSkillContent(name)
        : defaultCodexAgentContent(name));
    };

    const textareaEl = modal.contentEl.createEl('textarea', {
      cls: 'opencodian-codex-resource-editor',
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
      const actionsEl = modal.contentEl.createDiv({ cls: 'opencodian-codex-resource-modal-actions' });
      const saveButtonEl = actionsEl.createEl('button', {
        cls: 'mod-cta',
        text: t('settings.codex.resources.save'),
        attr: { type: 'button' },
      });
      saveButtonEl.addEventListener('click', async () => {
        const validationError = context.kind === 'skill'
          ? validateCodexSkillContent(content)
          : validateCodexAgentContent(content);
        if (validationError) {
          new Notice(validationError);
          return;
        }
        const result: CodexResourceWriteResult = context.kind === 'skill'
          ? await updateCodexProjectSkill(context.vaultPath!, name, content)
          : await updateCodexProjectAgent(context.vaultPath!, name, content);
        if (result.ok) {
          new Notice(t('settings.codex.resources.saved'));
          this.options.onAfterMutation?.();
          modal.close();
          context.onReload();
        } else {
          new Notice(this.describeWriteError((result as { reason: CodexResourceWriteError }).reason));
        }
      });
    }
    modal.open();
  }

  private async confirmDelete(
    name: string,
    context: { kind: 'skill' | 'agent'; vaultPath: string | null; onReload: () => void },
  ): Promise<void> {
    const result = context.kind === 'skill'
      ? await deleteCodexProjectSkill(context.vaultPath!, name)
      : await deleteCodexProjectAgent(context.vaultPath!, name);
    if (result.ok) {
      new Notice(t('settings.codex.resources.deleted'));
      this.options.onAfterMutation?.();
      context.onReload();
    } else {
      new Notice(this.describeWriteError((result as { reason: CodexResourceWriteError }).reason));
    }
  }

  private describeWriteError(reason: CodexResourceWriteError): string {
    return t(`settings.codex.resources.error.${reason}`) ?? t('settings.codex.resources.error.write-failed');
  }
}
