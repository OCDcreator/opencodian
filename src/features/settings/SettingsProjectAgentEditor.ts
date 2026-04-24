/* eslint-disable max-lines */
import { Notice, Setting } from 'obsidian';

import type {
  OpencodeAgentConfig,
  OpencodeAgentConfigRecord,
} from '../../core/types';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { createLogger } from '../../shared';
import {
  buildProjectAgentOptionsPatch,
  buildProjectAgentPermissionPatch,
  cloneOptions,
  clonePermission,
  normalizeProjectAgentEditorMode,
  optionalTrimmedText,
  parseOptionalNumber,
  stringifyConfigNumber,
  stringifyConfigText,
  stringifyOptions,
  stringifyTaskAllowlist,
} from './projectAgentEditorConfig';

const logger = createLogger('SettingsProjectAgentEditor');

interface ProjectAgentEditorState {
  agentId: string;
  color: string;
  description: string;
  disabled: boolean;
  mode: NonNullable<OpencodeAgentConfig['mode']>;
  model: string;
  options: OpencodeAgentConfig['options'];
  optionsDirty: boolean;
  optionsJson: string;
  permission: OpencodeAgentConfig['permission'];
  prompt: string;
  steps: string;
  taskAllowlist: string;
  taskAllowlistDirty: boolean;
  temperature: string;
  topP: string;
}

interface TextLikeControl {
  setValue(value: string): unknown;
}

interface DisableableControl {
  setDisabled(value: boolean): unknown;
}

interface SettingsProjectAgentEditorRenderOptions {
  containerEl: HTMLElement;
  onConfigChanged: () => Promise<void>;
  projectAgents: OpencodeAgentConfigRecord;
}

interface EditorGroupOptions {
  description: string;
  key: 'advanced' | 'behavior' | 'identity' | 'model';
  title: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
}

export class SettingsProjectAgentEditor {
  constructor(
    private readonly configManager: NonNullable<OpenCodianPlugin['opencodeConfigManager']>,
  ) {}

  // eslint-disable-next-line max-lines-per-function
  render(options: SettingsProjectAgentEditorRenderOptions): void {
    const {
      containerEl,
      onConfigChanged,
      projectAgents,
    } = options;

    containerEl.replaceChildren();
    const layoutEl = containerEl.createDiv({ cls: 'opencodian-agent-editor-layout' });
    const {
      advancedBodyEl,
      behaviorBodyEl,
      identityBodyEl,
      modelBodyEl,
    } = this.createEditorGroups(layoutEl);
    const projectAgentIds = Object.keys(projectAgents).sort((left, right) => left.localeCompare(right));
    const state = this.createProjectAgentEditorState('', undefined);
    let selectedProjectAgentId = '';
    let idControl: (TextLikeControl & Partial<DisableableControl>) | null = null;
    let modeDropdown: { setValue(value: string): unknown } | null = null;
    let disableControl: { setValue(value: boolean): unknown } | null = null;
    let descriptionControl: TextLikeControl | null = null;
    let promptControl: TextLikeControl | null = null;
    let modelControl: TextLikeControl | null = null;
    let temperatureControl: TextLikeControl | null = null;
    let topPControl: TextLikeControl | null = null;
    let stepsControl: TextLikeControl | null = null;
    let colorControl: TextLikeControl | null = null;
    let taskAllowlistControl: TextLikeControl | null = null;
    let optionsControl: TextLikeControl | null = null;
    let deleteButton: DisableableControl | null = null;

    const canDeleteSelectedProjectAgent = (): boolean =>
      Boolean(selectedProjectAgentId && projectAgents[selectedProjectAgentId]);

    const syncDeleteButton = (): void => {
      deleteButton?.setDisabled(!canDeleteSelectedProjectAgent());
    };

    const syncEditorControls = (): void => {
      idControl?.setValue(state.agentId);
      idControl?.setDisabled?.(Boolean(selectedProjectAgentId));
      modeDropdown?.setValue(state.mode);
      disableControl?.setValue(state.disabled);
      descriptionControl?.setValue(state.description);
      promptControl?.setValue(state.prompt);
      modelControl?.setValue(state.model);
      temperatureControl?.setValue(state.temperature);
      topPControl?.setValue(state.topP);
      stepsControl?.setValue(state.steps);
      colorControl?.setValue(state.color);
      taskAllowlistControl?.setValue(state.taskAllowlist);
      optionsControl?.setValue(state.optionsJson);
      syncDeleteButton();
    };

    new Setting(identityBodyEl)
      .setName(t('settings.agents.editor.select.name'))
      .setDesc(t('settings.agents.editor.select.desc'))
      .addDropdown((dropdown) => {
        dropdown.addOption('', t('settings.agents.editor.select.newAgent'));
        for (const agentId of projectAgentIds) {
          dropdown.addOption(agentId, agentId);
        }
        dropdown.setValue('');
        dropdown.onChange((value) => {
          selectedProjectAgentId = value;
          Object.assign(state, this.createProjectAgentEditorState(value, projectAgents[value]));
          syncEditorControls();
        });
      });

    new Setting(identityBodyEl)
      .setName(t('settings.agents.editor.id.name'))
      .setDesc(t('settings.agents.editor.id.desc'))
      .addText((text) => {
        idControl = text;
        text
          .setPlaceholder(t('settings.agents.editor.id.placeholder'))
          .setValue(state.agentId)
          .onChange((value) => {
            state.agentId = value;
          });
      });

    new Setting(identityBodyEl)
      .setName(t('settings.agents.editor.mode.name'))
      .setDesc(t('settings.agents.editor.mode.desc'))
      .addDropdown((dropdown) => {
        modeDropdown = dropdown;
        dropdown
          .addOption('primary', t('settings.agents.catalog.mode.primary'))
          .addOption('all', t('settings.agents.catalog.mode.all'))
          .addOption('subagent', t('settings.agents.catalog.mode.subagent'))
          .setValue(state.mode)
          .onChange((value) => {
            state.mode = normalizeProjectAgentEditorMode(value) ?? 'primary';
          });
      });

    new Setting(identityBodyEl)
      .setName(t('settings.agents.editor.disable.name'))
      .setDesc(t('settings.agents.editor.disable.desc'))
      .addToggle((toggle) => {
        disableControl = toggle;
        toggle
          .setValue(state.disabled)
          .onChange((value) => {
            state.disabled = value;
          });
      });

    new Setting(identityBodyEl)
      .setName(t('settings.agents.editor.description.name'))
      .setDesc(t('settings.agents.editor.description.desc'))
      .addText((text) => {
        descriptionControl = text;
        text
          .setPlaceholder(t('settings.agents.editor.description.placeholder'))
          .setValue(state.description)
          .onChange((value) => {
            state.description = value;
          });
      });

    new Setting(behaviorBodyEl)
      .setName(t('settings.agents.editor.prompt.name'))
      .setDesc(t('settings.agents.editor.prompt.desc'))
      .addTextArea((text) => {
        promptControl = text;
        text
          .setPlaceholder(t('settings.agents.editor.prompt.placeholder'))
          .setValue(state.prompt)
          .onChange((value) => {
            state.prompt = value;
          });
      });

    new Setting(modelBodyEl)
      .setName(t('settings.agents.editor.model.name'))
      .setDesc(t('settings.agents.editor.model.desc'))
      .addText((text) => {
        modelControl = text;
        text
          .setPlaceholder(t('settings.agents.editor.model.placeholder'))
          .setValue(state.model)
          .onChange((value) => {
            state.model = value;
          });
      });

    new Setting(modelBodyEl)
      .setName(t('settings.agents.editor.temperature.name'))
      .setDesc(t('settings.agents.editor.temperature.desc'))
      .addText((text) => {
        temperatureControl = text;
        text
          .setPlaceholder('0.2')
          .setValue(state.temperature)
          .onChange((value) => {
            state.temperature = value;
          });
      });

    new Setting(modelBodyEl)
      .setName(t('settings.agents.editor.topP.name'))
      .setDesc(t('settings.agents.editor.topP.desc'))
      .addText((text) => {
        topPControl = text;
        text
          .setPlaceholder('0.85')
          .setValue(state.topP)
          .onChange((value) => {
            state.topP = value;
          });
      });

    new Setting(modelBodyEl)
      .setName(t('settings.agents.editor.steps.name'))
      .setDesc(t('settings.agents.editor.steps.desc'))
      .addText((text) => {
        stepsControl = text;
        text
          .setPlaceholder('6')
          .setValue(state.steps)
          .onChange((value) => {
            state.steps = value;
          });
      });

    new Setting(advancedBodyEl)
      .setName(t('settings.agents.editor.color.name'))
      .setDesc(t('settings.agents.editor.color.desc'))
      .addText((text) => {
        colorControl = text;
        text
          .setPlaceholder(t('settings.agents.editor.color.placeholder'))
          .setValue(state.color)
          .onChange((value) => {
            state.color = value;
          });
      });

    this.renderTaskAllowlistSetting(advancedBodyEl, state, (control) => {
      taskAllowlistControl = control;
    });
    this.renderOptionsSetting(advancedBodyEl, state, (control) => {
      optionsControl = control;
    });

    this.renderActionsSetting({
      containerEl: layoutEl,
      state,
      onConfigChanged,
      projectAgents,
      getSelectedProjectAgentId: () => selectedProjectAgentId,
      canDeleteSelectedProjectAgent,
      setDeleteButton: (button) => {
        deleteButton = button;
      },
    });
  }

  private createProjectAgentEditorState(
    agentId: string,
    agent: OpencodeAgentConfig | undefined,
  ): ProjectAgentEditorState {
    return {
      agentId,
      color: stringifyConfigText(agent?.color),
      description: stringifyConfigText(agent?.description),
      disabled: agent?.disable === true,
      mode: normalizeProjectAgentEditorMode(agent?.mode) ?? 'primary',
      model: stringifyConfigText(agent?.model),
      options: cloneOptions(agent?.options),
      optionsDirty: false,
      optionsJson: stringifyOptions(agent?.options),
      permission: clonePermission(agent?.permission),
      prompt: stringifyConfigText(agent?.prompt),
      steps: stringifyConfigNumber(agent?.steps),
      taskAllowlist: stringifyTaskAllowlist(agent?.permission),
      taskAllowlistDirty: false,
      temperature: stringifyConfigNumber(agent?.temperature),
      topP: stringifyConfigNumber(agent?.top_p),
    };
  }

  private createEditorGroups(containerEl: HTMLElement): {
    advancedBodyEl: HTMLElement;
    behaviorBodyEl: HTMLElement;
    identityBodyEl: HTMLElement;
    modelBodyEl: HTMLElement;
  } {
    return {
      identityBodyEl: this.createEditorGroup(containerEl, {
        key: 'identity',
        title: t('settings.agents.editor.group.identity.title'),
        description: t('settings.agents.editor.group.identity.desc'),
      }),
      behaviorBodyEl: this.createEditorGroup(containerEl, {
        key: 'behavior',
        title: t('settings.agents.editor.group.behavior.title'),
        description: t('settings.agents.editor.group.behavior.desc'),
      }),
      modelBodyEl: this.createEditorGroup(containerEl, {
        key: 'model',
        title: t('settings.agents.editor.group.model.title'),
        description: t('settings.agents.editor.group.model.desc'),
      }),
      advancedBodyEl: this.createEditorGroup(containerEl, {
        key: 'advanced',
        title: t('settings.agents.editor.group.advanced.title'),
        description: t('settings.agents.editor.group.advanced.desc'),
        collapsible: true,
        defaultOpen: false,
      }),
    };
  }

  private createEditorGroup(containerEl: HTMLElement, options: EditorGroupOptions): HTMLElement {
    const {
      collapsible = false,
      defaultOpen = true,
      description,
      key,
      title,
    } = options;

    if (!collapsible) {
      const groupEl = containerEl.createDiv({
        cls: 'opencodian-agent-editor-group',
        attr: { 'data-group': key },
      });
      const headerEl = groupEl.createDiv({ cls: 'opencodian-agent-editor-group-header' });
      headerEl.createDiv({
        cls: 'opencodian-agent-editor-group-title',
        text: title,
      });
      headerEl.createDiv({
        cls: 'opencodian-agent-editor-group-description',
        text: description,
      });
      return groupEl.createDiv({ cls: 'opencodian-agent-editor-group-body' });
    }
    const detailsEl = containerEl.createEl('details', {
      cls: 'opencodian-agent-editor-group opencodian-agent-editor-group-collapsible',
      attr: { 'data-group': key },
    });
    detailsEl.open = defaultOpen;
    const summaryEl = detailsEl.createEl('summary', {
      cls: 'opencodian-agent-editor-group-summary',
    });
    const copyEl = summaryEl.createDiv({ cls: 'opencodian-agent-editor-group-summary-copy' });
    copyEl.createDiv({
      cls: 'opencodian-agent-editor-group-title',
      text: title,
    });
    copyEl.createDiv({
      cls: 'opencodian-agent-editor-group-description',
      text: description,
    });
    return detailsEl.createDiv({ cls: 'opencodian-agent-editor-group-body' });
  }

  private async saveProjectAgentFromEditor(
    state: ProjectAgentEditorState,
    onConfigChanged: () => Promise<void>,
  ): Promise<void> {
    const agentId = state.agentId.trim();
    if (!agentId) {
      new Notice(t('settings.agents.editor.notice.idRequired'));
      return;
    }

    try {
      await this.configManager.upsertAgentConfig(agentId, this.buildProjectAgentPatch(state));
      new Notice(t('settings.agents.editor.notice.saved', { id: agentId }));
      await onConfigChanged();
    } catch (error) {
      logger.error('Failed to save project agent:', error);
      const message = error instanceof Error ? error.message : String(error);
      new Notice(t('settings.agents.editor.notice.saveFailed', { message }));
    }
  }

  private async deleteSelectedProjectAgent(
    agentId: string,
    projectAgents: OpencodeAgentConfigRecord,
    onConfigChanged: () => Promise<void>,
  ): Promise<void> {
    const normalizedAgentId = agentId.trim();
    if (!normalizedAgentId || !projectAgents[normalizedAgentId]) {
      new Notice(t('settings.agents.editor.notice.deleteUnavailable'));
      return;
    }

    try {
      await this.configManager.removeAgentConfig(normalizedAgentId);
      new Notice(t('settings.agents.editor.notice.deleted', { id: normalizedAgentId }));
      await onConfigChanged();
    } catch (error) {
      logger.error('Failed to delete project agent:', error);
      const message = error instanceof Error ? error.message : String(error);
      new Notice(t('settings.agents.editor.notice.deleteFailed', { message }));
    }
  }

  private buildProjectAgentPatch(state: ProjectAgentEditorState): OpencodeAgentConfig {
    return {
      mode: state.mode,
      description: optionalTrimmedText(state.description),
      prompt: optionalTrimmedText(state.prompt),
      model: optionalTrimmedText(state.model),
      temperature: parseOptionalNumber(
        state.temperature,
        t('settings.agents.editor.notice.invalidNumber', {
          field: t('settings.agents.editor.temperature.name'),
        }),
      ),
      top_p: parseOptionalNumber(
        state.topP,
        t('settings.agents.editor.notice.invalidNumber', {
          field: t('settings.agents.editor.topP.name'),
        }),
      ),
      steps: parseOptionalNumber(
        state.steps,
        t('settings.agents.editor.notice.invalidNumber', {
          field: t('settings.agents.editor.steps.name'),
        }),
      ),
      color: optionalTrimmedText(state.color),
      disable: state.disabled ? true : undefined,
      ...buildProjectAgentPermissionPatch(state),
      ...buildProjectAgentOptionsPatch(state, {
        invalidJsonMessage: (message) => t('settings.agents.editor.notice.invalidJson', {
          field: t('settings.agents.editor.options.name'),
          message,
        }),
        objectRequiredMessage: t('settings.agents.editor.notice.objectRequired', {
          field: t('settings.agents.editor.options.name'),
        }),
      }),
    };
  }

  private renderTaskAllowlistSetting(
    containerEl: HTMLElement,
    state: ProjectAgentEditorState,
    setTaskAllowlistControl: (control: TextLikeControl) => void,
  ): void {
    new Setting(containerEl)
      .setName(t('settings.agents.editor.taskAllowlist.name'))
      .setDesc(t('settings.agents.editor.taskAllowlist.desc'))
      .addTextArea((text) => {
        setTaskAllowlistControl(text);
        text
          .setPlaceholder(t('settings.agents.editor.taskAllowlist.placeholder'))
          .setValue(state.taskAllowlist)
          .onChange((value) => {
            state.taskAllowlist = value;
            state.taskAllowlistDirty = true;
          });
      });
  }

  private renderActionsSetting(options: {
    containerEl: HTMLElement;
    state: ProjectAgentEditorState;
    onConfigChanged: () => Promise<void>;
    projectAgents: OpencodeAgentConfigRecord;
    getSelectedProjectAgentId: () => string;
    canDeleteSelectedProjectAgent: () => boolean;
    setDeleteButton: (button: DisableableControl) => void;
  }): void {
    const {
      containerEl,
      state,
      onConfigChanged,
      projectAgents,
      getSelectedProjectAgentId,
      canDeleteSelectedProjectAgent,
      setDeleteButton,
    } = options;

    new Setting(containerEl)
      .setName(t('settings.agents.editor.actions.name'))
      .setDesc(t('settings.agents.editor.actions.desc'))
      .addButton((button) => {
        button
          .setButtonText(t('settings.agents.editor.actions.save'))
          .onClick(async () => {
            await this.saveProjectAgentFromEditor(state, onConfigChanged);
          });
      })
      .addButton((button) => {
        setDeleteButton(button);
        button
          .setButtonText(t('settings.agents.editor.actions.delete'))
          .setDisabled(!canDeleteSelectedProjectAgent())
          .onClick(async () => {
            await this.deleteSelectedProjectAgent(
              getSelectedProjectAgentId(),
              projectAgents,
              onConfigChanged,
            );
          });
      });
  }

  private renderOptionsSetting(
    containerEl: HTMLElement,
    state: ProjectAgentEditorState,
    setOptionsControl: (control: TextLikeControl) => void,
  ): void {
    new Setting(containerEl)
      .setName(t('settings.agents.editor.options.name'))
      .setDesc(t('settings.agents.editor.options.desc'))
      .addTextArea((text) => {
        setOptionsControl(text);
        text
          .setPlaceholder(t('settings.agents.editor.options.placeholder'))
          .setValue(state.optionsJson)
          .onChange((value) => {
            state.optionsJson = value;
            state.optionsDirty = true;
          });
      });
  }

}
