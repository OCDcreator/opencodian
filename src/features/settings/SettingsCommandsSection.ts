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

  constructor(options: SettingsCommandsSectionOptions) {
    this.plugin = options.plugin;
    this.createSectionHeading = options.createSectionHeading;
  }

  dispose(): void {
    this.refreshRunId += 1;
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
    return blockEl.createDiv({
      cls: 'opencodian-plugin-block-body opencodian-settings-catalog-scroll opencodian-command-catalog-scroll',
    });
  }

  private async refreshCatalog(options: {
    catalogBodyEl: HTMLElement;
    configManager: NonNullable<OpenCodianPlugin['opencodeConfigManager']>;
    currentRunId: number;
    editorBodyEl: HTMLElement;
  }): Promise<void> {
    const {
      catalogBodyEl,
      configManager,
      currentRunId,
      editorBodyEl,
    } = options;

    try {
      const [runtimeCommandsResult, projectCommands, projectAgents] = await Promise.all([
        this.plugin.openCodeService.sdk.command.list(),
        configManager.getCommandConfig(),
        configManager.getAgentConfig(),
      ]);

      if (currentRunId !== this.refreshRunId) {
        return;
      }

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
      if (currentRunId !== this.refreshRunId) {
        return;
      }

      logger.error('Failed to load command catalog:', error);
      editorBodyEl.replaceChildren();
      this.renderCatalogLoadFailure(catalogBodyEl, error);
    }
  }

  private renderCatalog(context: CommandCatalogRenderContext): void {
    const {
      catalogBodyEl,
      configManager,
      currentRunId,
      editorBodyEl,
      mergedCommands,
      editorCommands,
      projectCommands,
    } = context;

    this.projectCommandEditor?.render({
      commands: editorCommands,
      containerEl: editorBodyEl,
      onConfigChanged: async () => {
        await this.refreshCatalog({
          catalogBodyEl,
          configManager,
          currentRunId,
          editorBodyEl,
        });
      },
      projectCommands,
      skillMode: this.getSkillMode(),
    });

    this.renderWithPreservedScroll(catalogBodyEl, () => {
      catalogBodyEl.replaceChildren();

      if (mergedCommands.length === 0) {
        catalogBodyEl.createDiv({ text: t('settings.commands.catalog.empty') });
        return;
      }

      for (const command of mergedCommands) {
        const setting = new Setting(catalogBodyEl)
          .setName(this.buildCommandSettingName(command))
          .setDesc(this.buildCommandDescription(command));

        setting.addToggle((toggle) => {
          toggle
            .setValue(!command.hidden)
            .onChange(async (value) => {
              await this.updateCommandVisibility(command.id, value);
              await this.refreshCatalog({
                catalogBodyEl,
                configManager,
                currentRunId,
                editorBodyEl,
              });
            });
        });
      }
    });
  }

  private renderCatalogLoadFailure(catalogBodyEl: HTMLElement, error: unknown): void {
    this.renderWithPreservedScroll(catalogBodyEl, () => {
      catalogBodyEl.replaceChildren();
      const message = error instanceof Error ? error.message : String(error);
      new Setting(catalogBodyEl)
        .setName(t('settings.commands.loadFailed.name'))
        .setDesc(t('settings.commands.loadFailed.desc', { message }));
    });
  }

  private renderWithPreservedScroll(containerEl: HTMLElement, render: () => void): void {
    const previousScrollTop = containerEl.scrollTop;
    render();
    this.restoreScrollTopAfterRender(containerEl, previousScrollTop);
  }

  private restoreScrollTopAfterRender(containerEl: HTMLElement, scrollTop: number): void {
    if (scrollTop <= 0) {
      return;
    }

    window.requestAnimationFrame(() => {
      if (!containerEl.isConnected) {
        return;
      }

      containerEl.scrollTop = scrollTop;
    });
  }

  private buildCommandDescription(command: SlashCommandCatalogEntry): string {
    const parts = [
      this.getSourceLabel(command),
      this.getVisibilityLabel(command),
    ];

    if (this.isSkillsCommandSkill(command)) {
      parts.push(t('settings.commands.catalog.status.skillRunsViaSkillsCommand', {
        command: command.id,
      }));
    }

    if (!command.runtimeAvailable) {
      parts.push(t('settings.commands.catalog.status.runtimeUnavailable'));
    }

    if (command.subtask) {
      parts.push(t('settings.commands.catalog.status.subtask'));
    }

    if (command.agent) {
      parts.push(t('settings.commands.catalog.agent', { agent: command.agent }));
    }

    if (command.model) {
      parts.push(t('settings.commands.catalog.model', { model: command.model }));
    }

    if (command.description) {
      parts.push(command.description);
    }

    return parts.join(' · ');
  }

  private buildCommandSettingName(command: SlashCommandCatalogEntry): string {
    return `/${this.getCommandDisplayId(command)}`;
  }

  private getCommandDisplayId(command: SlashCommandCatalogEntry): string {
    return this.isSkillsCommandSkill(command)
      ? `skills ${command.id}`
      : command.id;
  }

  private getVisibilityLabel(command: SlashCommandCatalogEntry): string {
    if (this.isSkillsCommandSkill(command)) {
      return command.hidden
        ? t('settings.commands.catalog.visibility.skillHiddenViaSkillsCommand')
        : t('settings.commands.catalog.visibility.skillVisibleViaSkillsCommand');
    }

    return command.hidden
      ? t('settings.commands.catalog.visibility.hidden')
      : t('settings.commands.catalog.visibility.visible');
  }

  private getSourceLabel(command: SlashCommandCatalogEntry): string {
    if (command.source === 'skill') {
      return t('settings.commands.catalog.source.skill');
    }

    if (command.runtimeAvailable && command.hasProjectOverride) {
      return t('settings.commands.catalog.source.runtimeOverride');
    }

    if (command.runtimeAvailable) {
      return t('settings.commands.catalog.source.runtime');
    }

    return t('settings.commands.catalog.source.projectOnly');
  }

  private isSkillsCommandSkill(command: SlashCommandCatalogEntry): boolean {
    return command.source === 'skill' && this.getSkillMode() === 'skills-command';
  }

  private getSkillMode(): SlashCommandSkillMode {
    return normalizeSlashCommandSkillMode(this.plugin.settings.slashCommandSkillMode);
  }

  private async updateCommandVisibility(commandId: string, visible: boolean): Promise<void> {
    const nextHiddenSlashCommands = buildNextHiddenSlashCommands(
      this.plugin.settings.hiddenSlashCommands,
      commandId,
      visible,
    );

    this.plugin.settings.hiddenSlashCommands = nextHiddenSlashCommands;
    await this.plugin.saveSettings({
      syncConfig: false,
      reloadModels: false,
      applyUi: false,
    });
  }

  private showActiveBlock(containerEl: HTMLElement, activeTabId: string): void {
    containerEl.querySelectorAll('[data-section-block]').forEach((el) => {
      const blockEl = el as HTMLElement;
      blockEl.style.display = blockEl.dataset.sectionBlock === activeTabId ? '' : 'none';
    });
  }

}
