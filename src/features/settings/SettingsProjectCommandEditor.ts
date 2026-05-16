import { Notice, Setting } from 'obsidian';

import type { SlashCommandCatalogSource } from '../../core/config/slashCommandCatalog';
import type {
  OpencodeCommandConfig,
  OpencodeCommandConfigRecord,
  SlashCommandSkillMode,
} from '../../core/types';
import { t, type TranslationKey } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { createLogger } from '../../shared';
import {
  optionalTrimmedText,
  parseOptionalNumber,
  stringifyConfigNumber,
  stringifyConfigText,
} from './projectAgentEditorConfig';

const logger = createLogger('SettingsProjectCommandEditor');

const OPEN_CODIAN_COMMAND_PLACEHOLDERS: ReadonlyArray<{
  descriptionKey: TranslationKey;
  token: string;
}> = [
  {
    token: '{{vault_path}}',
    descriptionKey: 'settings.commands.editor.placeholders.vaultPath',
  },
  {
    token: '{{current_note_path}}',
    descriptionKey: 'settings.commands.editor.placeholders.currentNotePath',
  },
  {
    token: '{{current_selection}}',
    descriptionKey: 'settings.commands.editor.placeholders.currentSelection',
  },
  {
    token: '{{external_context_paths}}',
    descriptionKey: 'settings.commands.editor.placeholders.externalContextPaths',
  },
  {
    token: '{{conversation_title}}',
    descriptionKey: 'settings.commands.editor.placeholders.conversationTitle',
  },
];

export interface ProjectCommandEditorSource {
  id: string;
  template: string;
  description: string;
  agent: string;
  model: string;
  temperature?: number;
  topP?: number;
  hasProjectOverride: boolean;
  runtimeAvailable: boolean;
  source: SlashCommandCatalogSource;
  subtask: boolean;
}

interface ProjectCommandEditorState {
  agent: string;
  commandId: string;
  description: string;
  model: string;
  subtask: boolean;
  template: string;
  temperature: string;
  topP: string;
}

interface TextLikeControl {
  setPlaceholder(value: string): unknown;
  setValue(value: string): unknown;
}

interface DisableableControl {
  setDisabled(value: boolean): unknown;
}

interface SettingsProjectCommandEditorRenderOptions {
  commands: ProjectCommandEditorSource[];
  containerEl: HTMLElement;
  onConfigChanged: () => Promise<void>;
  projectCommands: OpencodeCommandConfigRecord;
  skillMode?: SlashCommandSkillMode;
}

export class SettingsProjectCommandEditor {
  constructor(
    private readonly configManager: NonNullable<OpenCodianPlugin['opencodeConfigManager']>,
  ) {}

  // eslint-disable-next-line max-lines-per-function -- Project command editing keeps field wiring, validation, and stable local refresh in one stateful form.
  render(options: SettingsProjectCommandEditorRenderOptions): void {
    const {
      commands,
      containerEl,
      onConfigChanged,
      projectCommands,
      skillMode = 'direct',
    } = options;

    const restoreContainer = this.preserveContainerBeforeRender(containerEl);
    containerEl.replaceChildren();

    const sortedCommands = [...commands].sort((left, right) => left.id.localeCompare(right.id));
    const commandsById = new Map(sortedCommands.map((command) => [command.id, command]));
    const state = this.createProjectCommandEditorState('', undefined);
    let selectedCommandId = '';
    let idControl: (TextLikeControl & Partial<DisableableControl>) | null = null;
    let templateControl: TextLikeControl | null = null;
    let descriptionControl: TextLikeControl | null = null;
    let agentControl: TextLikeControl | null = null;
    let modelControl: TextLikeControl | null = null;
    let temperatureControl: TextLikeControl | null = null;
    let topPControl: TextLikeControl | null = null;
    let deleteButton: DisableableControl | null = null;
    let selectControl: { setValue(value: string): unknown } | null = null;
    let subtaskControl: { setValue(value: boolean): unknown } | null = null;

    const canDeleteSelectedProjectCommand = (): boolean =>
      Boolean(selectedCommandId && projectCommands[selectedCommandId]);

    const syncDeleteButton = (): void => {
      deleteButton?.setDisabled(!canDeleteSelectedProjectCommand());
    };

    const syncEditorControls = (): void => {
      selectControl?.setValue(selectedCommandId);
      idControl?.setValue(state.commandId);
      idControl?.setDisabled?.(Boolean(selectedCommandId));
      templateControl?.setValue(state.template);
      descriptionControl?.setValue(state.description);
      agentControl?.setValue(state.agent);
      modelControl?.setValue(state.model);
      temperatureControl?.setValue(state.temperature);
      topPControl?.setValue(state.topP);
      subtaskControl?.setValue(state.subtask);
      syncDeleteButton();

      if (state.agent || state.model || state.temperature || state.topP) {
        advancedSectionEl.open = true;
      }
    };

    new Setting(containerEl)
      .setName(t('settings.commands.editor.select.name'))
      .setDesc(t('settings.commands.editor.select.desc'))
      .addDropdown((dropdown) => {
        selectControl = dropdown;
        dropdown.addOption('', t('settings.commands.editor.select.newCommand'));
        for (const command of sortedCommands) {
          const sourceTag = command.runtimeAvailable
            ? (command.hasProjectOverride ? '⟳' : '●')
            : '○';
          dropdown.addOption(
            command.id,
            `${sourceTag} ${this.buildCommandSelectionLabel(command, skillMode)}`,
          );
        }
        dropdown.setValue('');
        dropdown.onChange((value) => {
          selectedCommandId = value;
          Object.assign(
            state,
            this.createProjectCommandEditorState(value, commandsById.get(value)),
          );
          syncEditorControls();
        });
      });

    new Setting(containerEl)
      .setName(t('settings.commands.editor.id.name'))
      .setDesc(t('settings.commands.editor.id.desc'))
      .addText((text) => {
        idControl = text;
        text
          .setPlaceholder(t('settings.commands.editor.id.placeholder'))
          .setValue(state.commandId)
          .onChange((value) => {
            state.commandId = value;
          });
      });

    new Setting(containerEl)
      .setName(t('settings.commands.editor.template.name'))
      .setDesc(t('settings.commands.editor.template.desc'))
      .addTextArea((text) => {
        templateControl = text;
        text
          .setPlaceholder(t('settings.commands.editor.template.placeholder'))
          .setValue(state.template)
          .onChange((value) => {
            state.template = value;
          });
      });

    this.renderPlaceholderReference(containerEl);

    new Setting(containerEl)
      .setName(t('settings.commands.editor.description.name'))
      .setDesc(t('settings.commands.editor.description.desc'))
      .addText((text) => {
        descriptionControl = text;
        text
          .setPlaceholder(t('settings.commands.editor.description.placeholder'))
          .setValue(state.description)
          .onChange((value) => {
            state.description = value;
          });
      });

    new Setting(containerEl)
      .setName(t('settings.commands.editor.subtask.name'))
      .setDesc(t('settings.commands.editor.subtask.desc'))
      .addToggle((toggle) => {
        subtaskControl = toggle;
        toggle
          .setValue(state.subtask)
          .onChange((value) => {
            state.subtask = value;
          });
      });

    const advancedSectionEl = containerEl.createEl('details', {
      cls: 'opencodian-command-editor-advanced',
    });
    advancedSectionEl.createEl('summary', {
      text: t('settings.commands.editor.advanced.title'),
    });
    const advancedBodyEl = advancedSectionEl.createDiv({
      cls: 'opencodian-command-editor-advanced-body',
    });

    new Setting(advancedBodyEl)
      .setName(t('settings.commands.editor.agent.name'))
      .setDesc(t('settings.commands.editor.agent.desc'))
      .addText((text) => {
        agentControl = text;
        text
          .setPlaceholder(t('settings.commands.editor.agent.placeholder'))
          .setValue(state.agent)
          .onChange((value) => {
            state.agent = value;
          });
      });

    new Setting(advancedBodyEl)
      .setName(t('settings.commands.editor.model.name'))
      .setDesc(t('settings.commands.editor.model.desc'))
      .addText((text) => {
        modelControl = text;
        text
          .setPlaceholder(t('settings.commands.editor.model.placeholder'))
          .setValue(state.model)
          .onChange((value) => {
            state.model = value;
          });
      });

    new Setting(advancedBodyEl)
      .setName(t('settings.commands.editor.temperature.name'))
      .setDesc(t('settings.commands.editor.temperature.desc'))
      .addText((text) => {
        temperatureControl = text;
        text
          .setPlaceholder('0.2')
          .setValue(state.temperature)
          .onChange((value) => {
            state.temperature = value;
          });
      });

    new Setting(advancedBodyEl)
      .setName(t('settings.commands.editor.topP.name'))
      .setDesc(t('settings.commands.editor.topP.desc'))
      .addText((text) => {
        topPControl = text;
        text
          .setPlaceholder('0.85')
          .setValue(state.topP)
          .onChange((value) => {
            state.topP = value;
          });
      });

    new Setting(containerEl)
      .setName(t('settings.commands.editor.actions.name'))
      .setDesc(t('settings.commands.editor.actions.desc'))
      .addButton((button) => {
        button
          .setButtonText(t('settings.commands.editor.actions.save'))
          .onClick(async () => {
            await this.saveProjectCommandFromEditor(state, onConfigChanged);
          });
      })
      .addButton((button) => {
        deleteButton = button;
        button
          .setButtonText(t('settings.commands.editor.actions.delete'))
          .setDisabled(!canDeleteSelectedProjectCommand())
          .onClick(async () => {
            await this.deleteSelectedProjectCommand(
              selectedCommandId,
              projectCommands,
              onConfigChanged,
            );
          });
      });

    syncEditorControls();
    restoreContainer();
  }

  private preserveContainerBeforeRender(containerEl: HTMLElement): () => void {
    const previousScrollTop = containerEl.scrollTop;
    const previousMinHeight = containerEl.style.minHeight;
    const measuredHeight = containerEl.offsetHeight;
    if (measuredHeight > 0) {
      containerEl.style.minHeight = `${measuredHeight}px`;
    }

    return () => {
      if (previousScrollTop > 0) {
        containerEl.scrollTop = previousScrollTop;
      }
      window.requestAnimationFrame(() => {
        if (!containerEl.isConnected) {
          return;
        }
        if (previousScrollTop > 0) {
          containerEl.scrollTop = previousScrollTop;
        }
        containerEl.style.minHeight = previousMinHeight;
      });
    };
  }

  private renderPlaceholderReference(containerEl: HTMLElement): void {
    const referenceEl = containerEl.createDiv({
      cls: 'opencodian-command-placeholder-reference',
    });

    referenceEl.createEl('h5', {
      text: t('settings.commands.editor.placeholders.title'),
      cls: 'opencodian-settings-subsection-heading',
    });
    referenceEl.createDiv({
      cls: 'opencodian-plugin-block-desc',
      text: t('settings.commands.editor.placeholders.desc'),
    });

    const listEl = referenceEl.createEl('ul', {
      cls: 'opencodian-command-placeholder-list',
    });

    for (const placeholder of OPEN_CODIAN_COMMAND_PLACEHOLDERS) {
      const itemEl = listEl.createEl('li');
      itemEl.createEl('code', { text: placeholder.token });
      itemEl.appendText(` — ${t(placeholder.descriptionKey)}`);
    }
  }

  private createProjectCommandEditorState(
    commandId: string,
    command: ProjectCommandEditorSource | undefined,
  ): ProjectCommandEditorState {
    return {
      commandId,
      template: stringifyConfigText(command?.template),
      description: stringifyConfigText(command?.description),
      agent: stringifyConfigText(command?.agent),
      model: stringifyConfigText(command?.model),
      subtask: command?.subtask === true,
      temperature: stringifyConfigNumber(command?.temperature),
      topP: stringifyConfigNumber(command?.topP),
    };
  }

  private buildCommandSelectionLabel(
    command: ProjectCommandEditorSource,
    skillMode: SlashCommandSkillMode,
  ): string {
    if (command.source === 'skill' && skillMode === 'skills-command') {
      return `/skills ${command.id}`;
    }

    return `/${command.id}`;
  }

  private buildProjectCommandPatch(state: ProjectCommandEditorState): OpencodeCommandConfig {
    const template = optionalTrimmedText(state.template);
    if (!template) {
      throw new Error(t('settings.commands.editor.notice.templateRequired'));
    }

    return {
      template,
      description: optionalTrimmedText(state.description),
      agent: optionalTrimmedText(state.agent),
      model: optionalTrimmedText(state.model),
      temperature: parseOptionalNumber(
        state.temperature,
        t('settings.commands.editor.notice.invalidNumber', {
          field: t('settings.commands.editor.temperature.name'),
        }),
      ),
      top_p: parseOptionalNumber(
        state.topP,
        t('settings.commands.editor.notice.invalidNumber', {
          field: t('settings.commands.editor.topP.name'),
        }),
      ),
      subtask: state.subtask,
    };
  }

  private async saveProjectCommandFromEditor(
    state: ProjectCommandEditorState,
    onConfigChanged: () => Promise<void>,
  ): Promise<void> {
    const commandId = state.commandId.trim();
    if (!commandId) {
      new Notice(t('settings.commands.editor.notice.idRequired'));
      return;
    }

    const slugError = this.validateCommandSlug(commandId);
    if (slugError) {
      new Notice(slugError);
      return;
    }

    let commandPatch: OpencodeCommandConfig;
    try {
      commandPatch = this.buildProjectCommandPatch(state);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(message);
      return;
    }

    try {
      await this.configManager.upsertCommandConfig(commandId, commandPatch);
      new Notice(t('settings.commands.editor.notice.saved', { id: commandId }));
      await onConfigChanged();
    } catch (error) {
      logger.error('Failed to save project command:', error);
      const message = error instanceof Error ? error.message : String(error);
      new Notice(t('settings.commands.editor.notice.saveFailed', { message }));
    }
  }

  private async deleteSelectedProjectCommand(
    commandId: string,
    projectCommands: OpencodeCommandConfigRecord,
    onConfigChanged: () => Promise<void>,
  ): Promise<void> {
    const normalizedCommandId = commandId.trim();
    if (!normalizedCommandId || !projectCommands[normalizedCommandId]) {
      new Notice(t('settings.commands.editor.notice.deleteUnavailable'));
      return;
    }

    try {
      await this.configManager.removeCommandConfig(normalizedCommandId);
      new Notice(t('settings.commands.editor.notice.deleted', { id: normalizedCommandId }));
      await onConfigChanged();
    } catch (error) {
      logger.error('Failed to delete project command:', error);
      const message = error instanceof Error ? error.message : String(error);
      new Notice(t('settings.commands.editor.notice.deleteFailed', { message }));
    }
  }

  private validateCommandSlug(commandId: string): string | null {
    if (commandId.length > 64) {
      return t('settings.commands.editor.notice.slugTooLong');
    }

    if (!/^[a-z0-9-]+$/.test(commandId)) {
      return t('settings.commands.editor.notice.slugInvalid');
    }

    return null;
  }
}
