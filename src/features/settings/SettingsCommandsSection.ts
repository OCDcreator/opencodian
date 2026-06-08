import { Setting } from 'obsidian';

import {
  mergeSlashCommandCatalog,
  type SlashCommandCatalogEntry,
} from '../../core/config/slashCommandCatalog';
import {
  normalizeSlashCommandSkillMode,
  type OpencodeCommandConfigRecord,
  type SlashCommandSkillMode,
} from '../../core/types';
import {
  appendSyntheticBuiltinCommands,
  SYNTHETIC_BUILTIN_COMMAND_IDS,
} from '../../features/chat/services/SlashCommandMenuCatalogCache';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { createLogger } from '../../shared';
import {
  SettingsProjectCommandEditor,
} from './SettingsProjectCommandEditor';
import {
  SlashCommandCatalogRenderer,
} from './SlashCommandCatalogRenderer';

const logger = createLogger('SettingsCommandsSection');

interface SettingsCommandsSectionOptions {
  plugin: OpenCodianPlugin;
  createSectionHeading: (
    containerEl: HTMLElement,
    title: string,
    tooltip?: string,
  ) => HTMLHeadingElement;
}

interface CommandCatalogRenderContext {
  catalogBodyEl: HTMLElement;
  configManager: NonNullable<OpenCodianPlugin['opencodeConfigManager']>;
  currentRunId: number;
  editorBodyEl: HTMLElement;
  mergedCommands: SlashCommandCatalogEntry[];
  editorCommands: SlashCommandCatalogEntry[];
  projectCommands: OpencodeCommandConfigRecord;
}

function buildNextHiddenSlashCommands(
  currentHiddenSlashCommands: string[],
  commandId: string,
  visible: boolean,
): string[] {
  const nextHiddenSlashCommands = new Set(
    currentHiddenSlashCommands
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  );

  if (visible) {
    nextHiddenSlashCommands.delete(commandId);
  } else {
    nextHiddenSlashCommands.add(commandId);
  }

  return Array.from(nextHiddenSlashCommands).sort((left, right) => left.localeCompare(right));
}

export class SettingsCommandsSection {
  private readonly plugin: OpenCodianPlugin;
  private readonly createSectionHeading: (
    containerEl: HTMLElement,
    title: string,
    tooltip?: string,
  ) => HTMLHeadingElement;
  private projectCommandEditor: SettingsProjectCommandEditor | null = null;
  private refreshRunId = 0;
  private readonly catalogRenderer = new SlashCommandCatalogRenderer();

  constructor(options: SettingsCommandsSectionOptions) {
    this.plugin = options.plugin;
    this.createSectionHeading = options.createSectionHeading;
  }

  dispose(): void {
    this.refreshRunId += 1;
    this.projectCommandEditor?.dispose();
  }

  attach(containerEl: HTMLElement): HTMLHeadingElement {
    this.dispose();
    const currentRunId = this.refreshRunId;
    const headingEl = this.createSectionHeading(
      containerEl,
      t('settings.commands.title'),
      t('settings.quickNav.commandsDesc'),
    );

    const configManager = this.plugin.opencodeConfigManager;
    this.createSkillModeSetting(containerEl);
    if (!configManager) {
      new Setting(containerEl)
        .setName(t('settings.commands.unavailable.name'))
        .setDesc(t('settings.commands.unavailable.desc'));
      return headingEl;
    }

    this.projectCommandEditor ??= new SettingsProjectCommandEditor(configManager);

    const editorBodyEl = this.createProjectCommandEditorBlock(containerEl);
    const catalogBodyEl = this.createCatalogBlock(containerEl);
    void this.refreshCatalog({
      catalogBodyEl,
      configManager,
      currentRunId,
      editorBodyEl,
    });

    return headingEl;
  }

  attachTabbed(containerEl: HTMLElement, secondaryTabId: string): void {
    this.dispose();
    const currentRunId = this.refreshRunId;

    const modeBlockEl = containerEl.createDiv({ attr: { 'data-section-block': 'mode' } });
    this.createSkillModeSetting(modeBlockEl);

    const configManager = this.plugin.opencodeConfigManager;
    if (!configManager) {
      new Setting(modeBlockEl)
        .setName(t('settings.commands.unavailable.name'))
        .setDesc(t('settings.commands.unavailable.desc'));
      this.showActiveBlock(containerEl, secondaryTabId);
      return;
    }

    this.projectCommandEditor ??= new SettingsProjectCommandEditor(configManager);

    const editorBlockEl = containerEl.createDiv({ attr: { 'data-section-block': 'editor' } });
    const editorBodyEl = this.createProjectCommandEditorBlock(editorBlockEl);

    const catalogBlockEl = containerEl.createDiv({ attr: { 'data-section-block': 'catalog' } });
    const catalogBodyEl = this.createCatalogBlock(catalogBlockEl);

    this.showActiveBlock(containerEl, secondaryTabId);

    void this.refreshCatalog({
      catalogBodyEl,
      configManager,
      currentRunId,
      editorBodyEl,
    });
  }

  private createSkillModeSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.commands.skillMode.name'))
      .setDesc(t('settings.commands.skillMode.desc'))
      .addDropdown((dropdown) => {
        dropdown
          .addOption('direct', t('settings.commands.skillMode.option.direct'))
          .addOption('skills-command', t('settings.commands.skillMode.option.skillsCommand'))
          .setValue(normalizeSlashCommandSkillMode(this.plugin.settings.slashCommandSkillMode))
          .onChange(async (value) => {
            this.plugin.settings.slashCommandSkillMode = normalizeSlashCommandSkillMode(value);
            await this.plugin.saveSettings({
              syncConfig: false,
              reloadModels: false,
              applyUi: false,
            });
          });
      });
  }

  private createProjectCommandEditorBlock(containerEl: HTMLElement): HTMLElement {
    const blockEl = containerEl.createDiv({ cls: 'opencodian-plugin-block' });
    blockEl.createEl('h4', {
      text: t('settings.commands.editor.title'),
      cls: 'opencodian-settings-subsection-heading',
    });
    blockEl.createDiv({
      cls: 'opencodian-plugin-block-desc',
      text: t('settings.commands.editor.desc'),
    });
    return blockEl.createDiv({ cls: 'opencodian-plugin-block-body' });
  }

  private createCatalogBlock(containerEl: HTMLElement): HTMLElement {
    const blockEl = containerEl.createDiv({ cls: 'opencodian-plugin-block' });
    blockEl.createEl('h4', {
      text: t('settings.commands.catalog.title'),
      cls: 'opencodian-settings-subsection-heading',
    });
    blockEl.createDiv({
      cls: 'opencodian-plugin-block-desc',
      text: t('settings.commands.catalog.desc'),
    });
    return blockEl.createDiv({ cls: 'opencodian-plugin-block-body' });
  }

  private async refreshCatalog(options: {
    catalogBodyEl: HTMLElement;
    configManager: NonNullable<OpenCodianPlugin['opencodeConfigManager']>;
    currentRunId: number;
    editorBodyEl: HTMLElement;
  }): Promise<void> {
    const { catalogBodyEl, configManager, currentRunId, editorBodyEl } = options;

    try {
      const [runtimeCommandsResult, projectCommands, projectAgents] = await Promise.all([
        this.plugin.openCodeService.sdk.command.list(),
        configManager.getCommandConfig(),
        configManager.getAgentConfig(),
      ]);

      if (currentRunId !== this.refreshRunId) return;

      const runtimeCommands = Array.isArray(runtimeCommandsResult) ? runtimeCommandsResult : [];
      const hiddenCommandIds = new Set(this.plugin.settings.hiddenSlashCommands);
      const baseMergedCommands = mergeSlashCommandCatalog({
        runtimeCommands,
        runtimeSkillSources: new Map(),
        projectCommands,
        projectAgents,
        hiddenCommandIds,
      });
      const mergedCommands = appendSyntheticBuiltinCommands(baseMergedCommands, hiddenCommandIds);
      const syntheticIds = new Set<string>(SYNTHETIC_BUILTIN_COMMAND_IDS);
      const editorCommands = baseMergedCommands.filter((c) => !syntheticIds.has(c.id));
      this.renderCatalog({
        catalogBodyEl,
        configManager,
        currentRunId,
        editorBodyEl,
        mergedCommands,
        editorCommands,
        projectCommands,
      });
    } catch (error) {
      if (currentRunId !== this.refreshRunId) return;
      logger.error('Failed to load command catalog:', error);
      editorBodyEl.replaceChildren();
      this.renderCatalogLoadFailure(catalogBodyEl, error);
    }
  }

  private renderCatalog(context: CommandCatalogRenderContext): void {
    const {
      catalogBodyEl, configManager, currentRunId, editorBodyEl,
      mergedCommands, editorCommands, projectCommands,
    } = context;

    this.projectCommandEditor?.render({
      commands: editorCommands,
      containerEl: editorBodyEl,
      onConfigChanged: async () => {
        await this.refreshCatalog({ catalogBodyEl, configManager, currentRunId, editorBodyEl });
      },
      projectCommands,
      skillMode: this.getSkillMode(),
    });

    this.catalogRenderer.render(catalogBodyEl, mergedCommands, {
      getDisplayId: (cmd) => this.getCommandDisplayId(cmd),
      updateVisibility: (id, visible) => this.updateCommandVisibility(id, visible),
      refreshCatalog: () => { void this.refreshCatalog({ catalogBodyEl, configManager, currentRunId, editorBodyEl }); },
      refreshCatalogPreservingSearch: () => { void this.refreshCatalog({ catalogBodyEl, configManager, currentRunId, editorBodyEl }); },
    });
  }

  private renderCatalogLoadFailure(catalogBodyEl: HTMLElement, error: unknown): void {
    catalogBodyEl.replaceChildren();
    const message = error instanceof Error ? error.message : String(error);
    new Setting(catalogBodyEl)
      .setName(t('settings.commands.loadFailed.name'))
      .setDesc(t('settings.commands.loadFailed.desc', { message }));
  }

  private getCommandDisplayId(command: SlashCommandCatalogEntry): string {
    return this.isSkillsCommandSkill(command) ? `skills ${command.id}` : command.id;
  }

  private isSkillsCommandSkill(command: SlashCommandCatalogEntry): boolean {
    return command.source === 'skill' && this.getSkillMode() === 'skills-command';
  }

  private getSkillMode(): SlashCommandSkillMode {
    return normalizeSlashCommandSkillMode(this.plugin.settings.slashCommandSkillMode);
  }

  private async updateCommandVisibility(commandId: string, visible: boolean): Promise<void> {
    this.plugin.settings.hiddenSlashCommands = buildNextHiddenSlashCommands(
      this.plugin.settings.hiddenSlashCommands, commandId, visible,
    );
    await this.plugin.saveSettings({ syncConfig: false, reloadModels: false, applyUi: false });
  }

  private showActiveBlock(containerEl: HTMLElement, activeTabId: string): void {
    containerEl.querySelectorAll('[data-section-block]').forEach((el) => {
      const blockEl = el as HTMLElement;
      blockEl.style.display = blockEl.dataset.sectionBlock === activeTabId ? '' : 'none';
    });
  }
}
