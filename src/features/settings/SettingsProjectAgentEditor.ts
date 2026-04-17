import { Notice, Setting } from 'obsidian';

import { isRecord } from '../../core/config/modelConfig';
import type {
  OpencodeAgentConfig,
  OpencodeAgentConfigRecord,
  OpencodeAgentMode,
  PermissionAction,
  PermissionConfig,
} from '../../core/types';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { createLogger } from '../../shared';

const logger = createLogger('SettingsProjectAgentEditor');

interface ProjectAgentEditorState {
  agentId: string;
  color: string;
  description: string;
  disabled: boolean;
  mode: OpencodeAgentMode;
  model: string;
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

export class SettingsProjectAgentEditor {
  constructor(
    private readonly configManager: NonNullable<OpenCodianPlugin['opencodeConfigManager']>,
  ) {}

  render(options: SettingsProjectAgentEditorRenderOptions): void {
    const {
      containerEl,
      onConfigChanged,
      projectAgents,
    } = options;

    containerEl.replaceChildren();

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
      syncDeleteButton();
    };

    new Setting(containerEl)
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

    new Setting(containerEl)
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

    new Setting(containerEl)
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
            state.mode = this.normalizeEditorMode(value) ?? 'primary';
          });
      });

    new Setting(containerEl)
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

    new Setting(containerEl)
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

    new Setting(containerEl)
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

    new Setting(containerEl)
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

    new Setting(containerEl)
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

    new Setting(containerEl)
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

    new Setting(containerEl)
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

    new Setting(containerEl)
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

    this.renderTaskAllowlistSetting(containerEl, state, (control) => {
      taskAllowlistControl = control;
    });

    this.renderActionsSetting({
      containerEl,
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
      color: this.stringifyConfigText(agent?.color),
      description: this.stringifyConfigText(agent?.description),
      disabled: agent?.disable === true,
      mode: this.normalizeEditorMode(agent?.mode) ?? 'primary',
      model: this.stringifyConfigText(agent?.model),
      permission: this.clonePermission(agent?.permission),
      prompt: this.stringifyConfigText(agent?.prompt),
      steps: this.stringifyConfigNumber(agent?.steps),
      taskAllowlist: this.stringifyTaskAllowlist(agent?.permission),
      taskAllowlistDirty: false,
      temperature: this.stringifyConfigNumber(agent?.temperature),
      topP: this.stringifyConfigNumber(agent?.top_p),
    };
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
      description: this.optionalTrimmedText(state.description),
      prompt: this.optionalTrimmedText(state.prompt),
      model: this.optionalTrimmedText(state.model),
      temperature: this.parseOptionalNumber(state.temperature, t('settings.agents.editor.temperature.name')),
      top_p: this.parseOptionalNumber(state.topP, t('settings.agents.editor.topP.name')),
      steps: this.parseOptionalNumber(state.steps, t('settings.agents.editor.steps.name')),
      color: this.optionalTrimmedText(state.color),
      disable: state.disabled ? true : undefined,
      ...this.buildPermissionPatch(state),
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

  private buildPermissionPatch(
    state: ProjectAgentEditorState,
  ): Pick<OpencodeAgentConfig, 'permission'> | Record<string, never> {
    if (!state.taskAllowlistDirty) {
      return {};
    }

    const taskPermission = this.buildTaskAllowlistPermission(state.taskAllowlist);
    const basePermission = state.permission;

    if (typeof basePermission === 'string') {
      if (!taskPermission) {
        return {};
      }
      const permission: PermissionConfig = {
        '*': basePermission,
        task: taskPermission,
      };
      return {
        permission,
      };
    }

    if (!isRecord(basePermission)) {
      if (!taskPermission) {
        return {};
      }
      const permission: PermissionConfig = {
        task: taskPermission,
      };
      return {
        permission,
      };
    }

    if (!taskPermission) {
      const permissionPatch = this.hasPermissionKeysOtherThanTask(basePermission)
        ? ({ task: undefined } as PermissionConfig)
        : undefined;
      return {
        permission: permissionPatch,
      };
    }

    const permission: PermissionConfig = {
      task: taskPermission,
    };
    return {
      permission,
    };
  }

  private normalizeEditorMode(value: unknown): OpencodeAgentMode | undefined {
    return value === 'primary' || value === 'all' || value === 'subagent'
      ? value
      : undefined;
  }

  private optionalTrimmedText(value: string): string | undefined {
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  private parseOptionalNumber(value: string, fieldName: string): number | undefined {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      throw new Error(t('settings.agents.editor.notice.invalidNumber', { field: fieldName }));
    }
    return parsed;
  }

  private stringifyConfigText(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private stringifyConfigNumber(value: unknown): string {
    return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
  }

  private stringifyTaskAllowlist(permission: OpencodeAgentConfig['permission']): string {
    if (!isRecord(permission)) {
      return '';
    }

    const taskPermission = permission.task;
    if (!isRecord(taskPermission)) {
      return '';
    }

    return Object.entries(taskPermission)
      .filter(([pattern, action]) => pattern !== '*' && action === 'allow')
      .map(([pattern]) => pattern)
      .join('\n');
  }

  private buildTaskAllowlistPermission(
    value: string,
  ): Record<string, PermissionAction> | undefined {
    const patterns = this.parseTaskAllowlistPatterns(value);
    if (patterns.length === 0) {
      return undefined;
    }

    const taskPermission: Record<string, PermissionAction> = {
      '*': 'deny',
    };
    for (const pattern of patterns) {
      taskPermission[pattern] = 'allow';
    }
    return taskPermission;
  }

  private parseTaskAllowlistPatterns(value: string): string[] {
    const seen = new Set<string>();
    const patterns: string[] = [];
    for (const line of value.split(/\r?\n/u)) {
      const pattern = line.trim();
      if (!pattern || seen.has(pattern)) {
        continue;
      }
      seen.add(pattern);
      patterns.push(pattern);
    }
    return patterns;
  }

  private hasPermissionKeysOtherThanTask(permission: Record<string, unknown>): boolean {
    return Object.keys(permission).some((key) => key !== 'task');
  }

  private clonePermission(
    permission: OpencodeAgentConfig['permission'],
  ): OpencodeAgentConfig['permission'] {
    if (typeof permission === 'string') {
      return permission;
    }

    if (!isRecord(permission)) {
      return undefined;
    }

    return JSON.parse(JSON.stringify(permission)) as PermissionConfig;
  }
}
