import { Setting } from 'obsidian';

import {
  mergeSlashCommandCatalog,
  type SlashCommandCatalogEntry,
} from '../../core/config/slashCommandCatalog';
import {
  normalizeSlashCommandSkillMode,
  type OpencodeCommandConfigRecord,
} from '../../core/types';
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
      const mergedCommands = mergeSlashCommandCatalog(
        runtimeCommands,
        projectCommands,
        projectAgents,
        hiddenCommandIds,
      );
      this.renderCatalog({
        catalogBodyEl,
        configManager,
        currentRunId,
        editorBodyEl,
        mergedCommands,
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
      projectCommands,
    } = context;

    this.projectCommandEditor?.render({
      commands: mergedCommands,
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
    });

    catalogBodyEl.replaceChildren();

    if (mergedCommands.length === 0) {
      catalogBodyEl.createDiv({ text: t('settings.commands.catalog.empty') });
      return;
    }

    for (const command of mergedCommands) {
      const setting = new Setting(catalogBodyEl)
        .setName(`/${command.id}`)
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
  }

  private renderCatalogLoadFailure(catalogBodyEl: HTMLElement, error: unknown): void {
    catalogBodyEl.replaceChildren();
    const message = error instanceof Error ? error.message : String(error);
    new Setting(catalogBodyEl)
      .setName(t('settings.commands.loadFailed.name'))
      .setDesc(t('settings.commands.loadFailed.desc', { message }));
  }

  private buildCommandDescription(command: SlashCommandCatalogEntry): string {
    const parts = [
      this.getSourceLabel(command),
      command.hidden
        ? t('settings.commands.catalog.visibility.hidden')
        : t('settings.commands.catalog.visibility.visible'),
    ];

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
}
