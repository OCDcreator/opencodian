import type { Agent as RuntimeAgent } from '@opencode-ai/sdk/v2/client';
import { type DropdownComponent, Setting } from 'obsidian';

import type {
  OpencodeAgentConfig,
  OpencodeAgentConfigRecord,
  OpencodeAgentMode,
} from '../../core/types';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { createLogger } from '../../shared';
import { SettingsProjectAgentEditor } from './SettingsProjectAgentEditor';

const logger = createLogger('SettingsAgentsSection');

const AGENT_MODE_SORT_ORDER: Record<OpencodeAgentMode, number> = {
  primary: 0,
  all: 1,
  subagent: 2,
};

interface SettingsAgentsSectionOptions {
  plugin: OpenCodianPlugin;
  createSectionHeading: (
    containerEl: HTMLElement,
    title: string,
    tooltip?: string,
  ) => HTMLHeadingElement;
}

interface AgentCatalogEntry {
  id: string;
  description: string;
  mode: OpencodeAgentMode | null;
  builtIn: boolean;
  disabled: boolean;
  hasProjectOverride: boolean;
  hidden: boolean;
  runtimeAvailable: boolean;
}

interface AgentCatalogRenderContext {
  catalogBodyEl: HTMLElement;
  configManager: NonNullable<OpenCodianPlugin['opencodeConfigManager']>;
  currentRunId: number;
  defaultAgentDropdown: DropdownComponent;
  editorBodyEl: HTMLElement;
  mergedAgents: AgentCatalogEntry[];
  projectAgents: OpencodeAgentConfigRecord;
}

function isRuntimeBuiltInAgent(agent: RuntimeAgent): boolean {
  const legacyBuiltIn = (agent as RuntimeAgent & { builtIn?: unknown }).builtIn;
  if (typeof legacyBuiltIn === 'boolean') {
    return legacyBuiltIn;
  }

  return agent.native === true;
}

function normalizeAgentDescription(
  runtimeAgent: RuntimeAgent | undefined,
  projectAgent: OpencodeAgentConfig | undefined,
): string {
  const projectDescription = typeof projectAgent?.description === 'string'
    ? projectAgent.description.trim()
    : '';
  if (projectDescription) {
    return projectDescription;
  }

  const runtimeDescription = typeof runtimeAgent?.description === 'string'
    ? runtimeAgent.description.trim()
    : '';
  return runtimeDescription;
}

function normalizeAgentMode(
  runtimeAgent: RuntimeAgent | undefined,
  projectAgent: OpencodeAgentConfig | undefined,
): OpencodeAgentMode | null {
  if (projectAgent?.mode === 'primary' || projectAgent?.mode === 'all' || projectAgent?.mode === 'subagent') {
    return projectAgent.mode;
  }

  if (runtimeAgent?.mode === 'primary' || runtimeAgent?.mode === 'all' || runtimeAgent?.mode === 'subagent') {
    return runtimeAgent.mode;
  }

  return null;
}

function resolveAgentHidden(
  runtimeAgent: RuntimeAgent | undefined,
  projectAgent: OpencodeAgentConfig | undefined,
): boolean {
  if (projectAgent?.hidden === true) {
    return true;
  }

  if (projectAgent?.hidden === false) {
    return false;
  }

  return runtimeAgent?.hidden === true;
}

function mergeAgentCatalog(
  runtimeAgents: RuntimeAgent[],
  projectAgents: OpencodeAgentConfigRecord,
): AgentCatalogEntry[] {
  const mergedEntries = new Map<string, AgentCatalogEntry>();

  for (const runtimeAgent of runtimeAgents) {
    const projectAgent = projectAgents[runtimeAgent.name];
    mergedEntries.set(runtimeAgent.name, {
      id: runtimeAgent.name,
      description: normalizeAgentDescription(runtimeAgent, projectAgent),
      mode: normalizeAgentMode(runtimeAgent, projectAgent),
      builtIn: isRuntimeBuiltInAgent(runtimeAgent),
      disabled: projectAgent?.disable === true,
      hasProjectOverride: projectAgent !== undefined,
      hidden: resolveAgentHidden(runtimeAgent, projectAgent),
      runtimeAvailable: true,
    });
  }

  for (const [agentId, projectAgent] of Object.entries(projectAgents)) {
    if (mergedEntries.has(agentId)) {
      continue;
    }

    mergedEntries.set(agentId, {
      id: agentId,
      description: normalizeAgentDescription(undefined, projectAgent),
      mode: normalizeAgentMode(undefined, projectAgent),
      builtIn: false,
      disabled: projectAgent.disable === true,
      hasProjectOverride: true,
      hidden: resolveAgentHidden(undefined, projectAgent),
      runtimeAvailable: false,
    });
  }

  return Array.from(mergedEntries.values()).sort((left, right) => {
    const leftOrder = left.mode ? AGENT_MODE_SORT_ORDER[left.mode] : Number.MAX_SAFE_INTEGER;
    const rightOrder = right.mode ? AGENT_MODE_SORT_ORDER[right.mode] : Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    if (left.builtIn !== right.builtIn) {
      return left.builtIn ? -1 : 1;
    }

    return left.id.localeCompare(right.id);
  });
}

export class SettingsAgentsSection {
  private readonly plugin: OpenCodianPlugin;
  private readonly createSectionHeading: (
    containerEl: HTMLElement,
    title: string,
    tooltip?: string,
  ) => HTMLHeadingElement;
  private projectAgentEditor: SettingsProjectAgentEditor | null = null;
  private refreshRunId = 0;

  constructor(options: SettingsAgentsSectionOptions) {
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
      t('settings.agents.title'),
      t('settings.quickNav.agentsDesc'),
    );

    const configManager = this.plugin.opencodeConfigManager;
    if (!configManager) {
      new Setting(containerEl)
        .setName(t('settings.agents.unavailable.name'))
        .setDesc(t('settings.agents.unavailable.desc'));
      return headingEl;
    }
    this.projectAgentEditor ??= new SettingsProjectAgentEditor(configManager);

    let defaultAgentDropdown: DropdownComponent | null = null;
    new Setting(containerEl)
      .setName(t('settings.agents.default.name'))
      .setDesc(t('settings.agents.default.desc'))
      .addDropdown((dropdown) => {
        defaultAgentDropdown = dropdown;
        dropdown
          .addOption('', t('settings.agents.default.followOpenCode'))
          .setValue('')
          .onChange(async (value) => {
            await configManager.updateDefaultAgent(value || undefined);
          });
      });

    const editorBodyEl = this.createProjectAgentEditorBlock(containerEl);
    const catalogBodyEl = this.createCatalogBlock(containerEl);

    if (defaultAgentDropdown) {
      void this.refreshCatalog({
        catalogBodyEl,
        configManager,
        currentRunId,
        defaultAgentDropdown,
        editorBodyEl,
      });
    }

    return headingEl;
  }

  private createCatalogBlock(containerEl: HTMLElement): HTMLElement {
    const blockEl = containerEl.createDiv({ cls: 'opencodian-plugin-block' });
    blockEl.createEl('h4', {
      text: t('settings.agents.catalog.title'),
      cls: 'opencodian-settings-subsection-heading',
    });
    blockEl.createDiv({
      cls: 'opencodian-plugin-block-desc',
      text: t('settings.agents.catalog.desc'),
    });
    return blockEl.createDiv({ cls: 'opencodian-plugin-block-body opencodian-agent-catalog-scroll' });
  }

  private createProjectAgentEditorBlock(containerEl: HTMLElement): HTMLElement {
    const blockEl = containerEl.createDiv({ cls: 'opencodian-plugin-block' });
    blockEl.createEl('h4', {
      text: t('settings.agents.editor.title'),
      cls: 'opencodian-settings-subsection-heading',
    });
    blockEl.createDiv({
      cls: 'opencodian-plugin-block-desc',
      text: t('settings.agents.editor.desc'),
    });
    return blockEl.createDiv({ cls: 'opencodian-plugin-block-body' });
  }

  private async refreshCatalog(options: {
    catalogBodyEl: HTMLElement;
    configManager: NonNullable<OpenCodianPlugin['opencodeConfigManager']>;
    currentRunId: number;
    defaultAgentDropdown: DropdownComponent;
    editorBodyEl: HTMLElement;
  }): Promise<void> {
    const {
      catalogBodyEl,
      configManager,
      currentRunId,
      defaultAgentDropdown,
      editorBodyEl,
    } = options;

    try {
      const [runtimeAgentsResult, projectAgents, defaultAgent] = await Promise.all([
        this.plugin.openCodeService.sdk.app.agents(),
        configManager.getAgentConfig(),
        configManager.getDefaultAgent(),
      ]);

      if (currentRunId !== this.refreshRunId) {
        return;
      }
      const runtimeAgents = Array.isArray(runtimeAgentsResult) ? runtimeAgentsResult : [];
      const mergedAgents = mergeAgentCatalog(runtimeAgents, projectAgents);
      this.renderDefaultAgentDropdown(defaultAgentDropdown, mergedAgents, defaultAgent);
      this.projectAgentEditor?.render({
        containerEl: editorBodyEl,
        onConfigChanged: async () => {
          await this.refreshCatalog({
            catalogBodyEl,
            configManager,
            currentRunId,
            defaultAgentDropdown,
            editorBodyEl,
          });
        },
        projectAgents,
      });
      this.renderCatalog({
        catalogBodyEl,
        configManager,
        defaultAgentDropdown,
        editorBodyEl,
        mergedAgents,
        projectAgents,
        currentRunId,
      });
    } catch (error) {
      if (currentRunId !== this.refreshRunId) {
        return;
      }

      logger.error('Failed to load agent catalog:', error);
      this.renderDefaultAgentDropdown(defaultAgentDropdown, [], undefined);
      editorBodyEl.replaceChildren();
      this.renderCatalogLoadFailure(catalogBodyEl, error);
    }
  }

  private renderDefaultAgentDropdown(
    dropdown: DropdownComponent,
    mergedAgents: AgentCatalogEntry[],
    defaultAgent: string | undefined,
  ): void {
    dropdown.selectEl.replaceChildren();
    dropdown.addOption('', t('settings.agents.default.followOpenCode'));

    const defaultEligibleIds = new Set<string>();
    for (const agent of mergedAgents) {
      if ((agent.mode === 'primary' || agent.mode === 'all') && !agent.disabled) {
        defaultEligibleIds.add(agent.id);
        dropdown.addOption(agent.id, agent.id);
      }
    }

    const normalizedDefaultAgent = typeof defaultAgent === 'string' ? defaultAgent.trim() : '';
    if (normalizedDefaultAgent && !defaultEligibleIds.has(normalizedDefaultAgent)) {
      dropdown.addOption(
        normalizedDefaultAgent,
        t('settings.agents.default.unavailable', { id: normalizedDefaultAgent }),
      );
    }

    dropdown.setValue(normalizedDefaultAgent);
  }

  private renderCatalog(context: AgentCatalogRenderContext): void {
    const {
      catalogBodyEl,
      configManager,
      currentRunId,
      defaultAgentDropdown,
      editorBodyEl,
      mergedAgents,
      projectAgents,
    } = context;

    catalogBodyEl.replaceChildren();

    if (mergedAgents.length === 0) {
      catalogBodyEl.createDiv({ text: t('settings.agents.catalog.empty') });
      return;
    }

    for (const agent of mergedAgents) {
      const setting = new Setting(catalogBodyEl)
        .setName(agent.id)
        .setDesc(this.buildAgentDescription(agent));

      if (agent.mode === 'subagent' && !agent.disabled) {
        setting.addToggle((toggle) => {
          toggle
            .setValue(!agent.hidden)
            .onChange(async (value) => {
              await this.updateAgentVisibility(agent.id, !value, projectAgents);
              await this.refreshCatalog({
                catalogBodyEl,
                configManager,
                currentRunId,
                defaultAgentDropdown,
                editorBodyEl,
              });
            });
        });
      }
    }
  }

  private renderCatalogLoadFailure(catalogBodyEl: HTMLElement, error: unknown): void {
    catalogBodyEl.replaceChildren();
    const message = error instanceof Error ? error.message : String(error);
    new Setting(catalogBodyEl)
      .setName(t('settings.agents.loadFailed.name'))
      .setDesc(t('settings.agents.loadFailed.desc', { message }));
  }

  private buildAgentDescription(agent: AgentCatalogEntry): string {
    const parts = [
      this.getSourceLabel(agent),
      this.getModeLabel(agent.mode),
    ];

    if (!agent.runtimeAvailable) {
      parts.push(t('settings.agents.catalog.status.runtimeUnavailable'));
    }

    if (agent.disabled) {
      parts.push(t('settings.agents.catalog.status.disabled'));
    } else if (agent.mode === 'subagent') {
      parts.push(
        agent.hidden
          ? t('settings.agents.catalog.visibility.hidden')
          : t('settings.agents.catalog.visibility.visible'),
      );
    }

    if (agent.description) {
      parts.push(agent.description);
    }

    return parts.join(' · ');
  }

  private getSourceLabel(agent: AgentCatalogEntry): string {
    if (agent.builtIn && agent.hasProjectOverride) {
      return t('settings.agents.catalog.source.builtinOverride');
    }

    if (agent.builtIn) {
      return t('settings.agents.catalog.source.builtin');
    }

    if (agent.runtimeAvailable) {
      return t('settings.agents.catalog.source.project');
    }

    return t('settings.agents.catalog.source.projectOnly');
  }

  private getModeLabel(mode: OpencodeAgentMode | null): string {
    switch (mode) {
      case 'primary':
        return t('settings.agents.catalog.mode.primary');
      case 'all':
        return t('settings.agents.catalog.mode.all');
      case 'subagent':
        return t('settings.agents.catalog.mode.subagent');
      default:
        return t('settings.agents.catalog.mode.unknown');
    }
  }

  private async updateAgentVisibility(
    agentId: string,
    hidden: boolean,
    projectAgents: OpencodeAgentConfigRecord,
  ): Promise<void> {
    const configManager = this.plugin.opencodeConfigManager;
    if (!configManager) {
      return;
    }

    if (hidden) {
      await configManager.upsertAgentConfig(agentId, { hidden: true });
      return;
    }

    const existingProjectAgent = projectAgents[agentId];
    if (!existingProjectAgent) {
      await configManager.upsertAgentConfig(agentId, { hidden: false });
      return;
    }

    const nextProjectAgent = { ...existingProjectAgent };
    delete nextProjectAgent.hidden;

    if (Object.keys(nextProjectAgent).length === 0) {
      await configManager.removeAgentConfig(agentId);
      return;
    }

    await configManager.upsertAgentConfig(agentId, nextProjectAgent);
  }
}
