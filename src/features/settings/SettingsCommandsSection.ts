import type { Command as RuntimeCommand } from '@opencode-ai/sdk/v2/client';
import { Setting } from 'obsidian';

import type { OpencodeCommandConfig, OpencodeCommandConfigRecord } from '../../core/types';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { createLogger } from '../../shared';

const logger = createLogger('SettingsCommandsSection');

interface SettingsCommandsSectionOptions {
  plugin: OpenCodianPlugin;
  createSectionHeading: (
    containerEl: HTMLElement,
    title: string,
    tooltip?: string,
  ) => HTMLHeadingElement;
}

interface CommandCatalogEntry {
  id: string;
  description: string;
  agent: string;
  model: string;
  hasProjectOverride: boolean;
  hidden: boolean;
  runtimeAvailable: boolean;
  subtask: boolean;
}

interface CommandCatalogRenderContext {
  catalogBodyEl: HTMLElement;
  configManager: NonNullable<OpenCodianPlugin['opencodeConfigManager']>;
  currentRunId: number;
  mergedCommands: CommandCatalogEntry[];
}

function isCatalogRuntimeCommand(command: RuntimeCommand): boolean {
  return command.source !== 'mcp' && command.source !== 'skill';
}

function normalizeCommandTextField(
  runtimeValue: string | undefined,
  projectValue: string | undefined,
): string {
  const normalizedProjectValue = typeof projectValue === 'string' ? projectValue.trim() : '';
  if (normalizedProjectValue) {
    return normalizedProjectValue;
  }

  return typeof runtimeValue === 'string' ? runtimeValue.trim() : '';
}

function normalizeCommandDescription(
  runtimeCommand: RuntimeCommand | undefined,
  projectCommand: OpencodeCommandConfig | undefined,
): string {
  return normalizeCommandTextField(runtimeCommand?.description, projectCommand?.description);
}

function normalizeCommandSubtask(
  runtimeCommand: RuntimeCommand | undefined,
  projectCommand: OpencodeCommandConfig | undefined,
): boolean {
  if (typeof projectCommand?.subtask === 'boolean') {
    return projectCommand.subtask;
  }

  return runtimeCommand?.subtask === true;
}

function mergeCommandCatalog(
  runtimeCommands: RuntimeCommand[],
  projectCommands: OpencodeCommandConfigRecord,
  hiddenCommandIds: Set<string>,
): CommandCatalogEntry[] {
  const mergedEntries = new Map<string, CommandCatalogEntry>();

  for (const runtimeCommand of runtimeCommands) {
    if (!isCatalogRuntimeCommand(runtimeCommand)) {
      continue;
    }

    const projectCommand = projectCommands[runtimeCommand.name];
    mergedEntries.set(runtimeCommand.name, {
      id: runtimeCommand.name,
      description: normalizeCommandDescription(runtimeCommand, projectCommand),
      agent: normalizeCommandTextField(runtimeCommand.agent, projectCommand?.agent),
      model: normalizeCommandTextField(runtimeCommand.model, projectCommand?.model),
      hasProjectOverride: projectCommand !== undefined,
      hidden: hiddenCommandIds.has(runtimeCommand.name),
      runtimeAvailable: true,
      subtask: normalizeCommandSubtask(runtimeCommand, projectCommand),
    });
  }

  for (const [commandId, projectCommand] of Object.entries(projectCommands)) {
    if (mergedEntries.has(commandId)) {
      continue;
    }

    mergedEntries.set(commandId, {
      id: commandId,
      description: normalizeCommandDescription(undefined, projectCommand),
      agent: normalizeCommandTextField(undefined, projectCommand.agent),
      model: normalizeCommandTextField(undefined, projectCommand.model),
      hasProjectOverride: true,
      hidden: hiddenCommandIds.has(commandId),
      runtimeAvailable: false,
      subtask: normalizeCommandSubtask(undefined, projectCommand),
    });
  }

  return Array.from(mergedEntries.values()).sort((left, right) => {
    if (left.runtimeAvailable !== right.runtimeAvailable) {
      return left.runtimeAvailable ? -1 : 1;
    }

    if (left.hasProjectOverride !== right.hasProjectOverride) {
      return left.hasProjectOverride ? 1 : -1;
    }

    return left.id.localeCompare(right.id);
  });
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
    if (!configManager) {
      new Setting(containerEl)
        .setName(t('settings.commands.unavailable.name'))
        .setDesc(t('settings.commands.unavailable.desc'));
      return headingEl;
    }

    const catalogBodyEl = this.createCatalogBlock(containerEl);
    void this.refreshCatalog({
      catalogBodyEl,
      configManager,
      currentRunId,
    });

    return headingEl;
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
  }): Promise<void> {
    const {
      catalogBodyEl,
      configManager,
      currentRunId,
    } = options;

    try {
      const [runtimeCommandsResult, projectCommands] = await Promise.all([
        this.plugin.openCodeService.sdk.command.list(),
        configManager.getCommandConfig(),
      ]);

      if (currentRunId !== this.refreshRunId) {
        return;
      }

      const runtimeCommands = Array.isArray(runtimeCommandsResult) ? runtimeCommandsResult : [];
      const hiddenCommandIds = new Set(this.plugin.settings.hiddenSlashCommands);
      const mergedCommands = mergeCommandCatalog(runtimeCommands, projectCommands, hiddenCommandIds);
      this.renderCatalog({
        catalogBodyEl,
        configManager,
        currentRunId,
        mergedCommands,
      });
    } catch (error) {
      if (currentRunId !== this.refreshRunId) {
        return;
      }

      logger.error('Failed to load command catalog:', error);
      this.renderCatalogLoadFailure(catalogBodyEl, error);
    }
  }

  private renderCatalog(context: CommandCatalogRenderContext): void {
    const {
      catalogBodyEl,
      configManager,
      currentRunId,
      mergedCommands,
    } = context;

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

  private buildCommandDescription(command: CommandCatalogEntry): string {
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

  private getSourceLabel(command: CommandCatalogEntry): string {
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
