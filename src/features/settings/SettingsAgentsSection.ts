/* eslint-disable max-lines */
import { type DropdownComponent, normalizePath, Notice, Setting } from 'obsidian';

import {
  AgentCatalogService,
  type MarkdownAgentFs,
  MarkdownAgentWorkspaceService,
  type SurfaceAgent,
  type SurfaceAgentFile,
  type SurfaceAgentSource,
  SystemAgentGuardService,
} from '../../core/agents';
import type { OpencodeAgentConfig, OpencodeAgentConfigRecord, OpencodeAgentMode } from '../../core/types';
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

interface AgentCatalogRenderContext {
  catalogBodyEl: HTMLElement;
  configManager: NonNullable<OpenCodianPlugin['opencodeConfigManager']>;
  currentRunId: number;
  defaultAgentDropdown: DropdownComponent;
  editorBodyEl: HTMLElement;
  mergedAgents: SurfaceAgent[];
  projectAgents: OpencodeAgentConfigRecord;
  workspaceBodyEl?: HTMLElement;
}

export class SettingsAgentsSection {
  private readonly agentCatalogService = new AgentCatalogService();
  private readonly plugin: OpenCodianPlugin;
  private readonly createSectionHeading: (
    containerEl: HTMLElement,
    title: string,
    tooltip?: string,
  ) => HTMLHeadingElement;
  private projectAgentEditor: SettingsProjectAgentEditor | null = null;
  private markdownWorkspaceService: MarkdownAgentWorkspaceService | null = null;
  private refreshRunId = 0;
  private systemAgentGuard: SystemAgentGuardService | null = null;

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
    this.ensureProjectAgentEditor(configManager);

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
    const workspaceBodyEl = this.createWorkspaceBlock(containerEl);
    const catalogBodyEl = this.createCatalogBlock(containerEl);

    this.renderExpertModeToggle(containerEl, {
      configManager,
      currentRunId,
      defaultAgentDropdown,
      editorBodyEl,
      catalogBodyEl,
      workspaceBodyEl,
    });

    if (defaultAgentDropdown) {
      void this.refreshCatalog({
        catalogBodyEl,
        configManager,
        currentRunId,
        defaultAgentDropdown,
        editorBodyEl,
        workspaceBodyEl,
      });
    }

    return headingEl;
  }

  attachTabbed(containerEl: HTMLElement, secondaryTabId: string): void {
    this.dispose();
    const currentRunId = this.refreshRunId;

    const configManager = this.plugin.opencodeConfigManager;
    if (!configManager) {
      const defaultBlockEl = containerEl.createDiv({ attr: { 'data-section-block': 'default' } });
      new Setting(defaultBlockEl)
        .setName(t('settings.agents.unavailable.name'))
        .setDesc(t('settings.agents.unavailable.desc'));
      this.showActiveBlock(containerEl, secondaryTabId);
      return;
    }
    this.ensureProjectAgentEditor(configManager);

    const defaultBlockEl = containerEl.createDiv({ attr: { 'data-section-block': 'default' } });
    let defaultAgentDropdown: DropdownComponent | null = null;
    new Setting(defaultBlockEl)
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

    const editorBlockEl = containerEl.createDiv({ attr: { 'data-section-block': 'editor' } });
    const editorBodyEl = this.createProjectAgentEditorBlock(editorBlockEl);

    const catalogBlockEl = containerEl.createDiv({ attr: { 'data-section-block': 'catalog' } });
    const catalogBodyEl = this.createCatalogBlock(catalogBlockEl);

    const workspaceBlockEl = containerEl.createDiv({ attr: { 'data-section-block': 'workspace' } });
    const workspaceBodyEl = this.createWorkspaceBlock(workspaceBlockEl);
    this.renderExpertModeToggle(defaultBlockEl, {
      configManager,
      currentRunId,
      defaultAgentDropdown,
      editorBodyEl,
      catalogBodyEl,
      workspaceBodyEl,
    });

    this.showActiveBlock(containerEl, secondaryTabId);

    if (defaultAgentDropdown) {
      void this.refreshCatalog({
        catalogBodyEl,
        configManager,
        currentRunId,
        defaultAgentDropdown,
        editorBodyEl,
        workspaceBodyEl,
      });
    }
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
    return blockEl.createDiv({
      cls: 'opencodian-plugin-block-body opencodian-settings-catalog-scroll opencodian-agent-catalog-scroll',
    });
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

  private createWorkspaceBlock(containerEl: HTMLElement): HTMLElement {
    const blockEl = containerEl.createDiv({ cls: 'opencodian-plugin-block' });
    blockEl.createEl('h4', {
      text: t('settings.agents.workspace.title'),
      cls: 'opencodian-settings-subsection-heading',
    });
    blockEl.createDiv({
      cls: 'opencodian-plugin-block-desc',
      text: t('settings.agents.workspace.desc'),
    });
    return blockEl.createDiv({ cls: 'opencodian-plugin-block-body' });
  }

  private renderExpertModeToggle(
    containerEl: HTMLElement,
    context: {
      configManager: NonNullable<OpenCodianPlugin['opencodeConfigManager']>;
      currentRunId: number;
      defaultAgentDropdown: DropdownComponent | null;
      editorBodyEl: HTMLElement | null;
      catalogBodyEl: HTMLElement | null;
      workspaceBodyEl: HTMLElement | null;
    },
  ): void {
    new Setting(containerEl)
      .setName(t('settings.agents.expert.name'))
      .setDesc(t('settings.agents.expert.desc'))
      .addToggle((toggle) => {
        toggle
          .setValue(this.getSystemAgentGuard().expertMode)
          .onChange(async (value) => {
            this.getSystemAgentGuard().setExpertMode(value);
            if (!context.defaultAgentDropdown || !context.editorBodyEl || !context.catalogBodyEl) {
              return;
            }
            await this.refreshCatalog({
              catalogBodyEl: context.catalogBodyEl,
              configManager: context.configManager,
              currentRunId: context.currentRunId,
              defaultAgentDropdown: context.defaultAgentDropdown,
              editorBodyEl: context.editorBodyEl,
              workspaceBodyEl: context.workspaceBodyEl ?? undefined,
            });
          });
      });
  }

  private async refreshCatalog(options: {
    catalogBodyEl: HTMLElement;
    configManager: NonNullable<OpenCodianPlugin['opencodeConfigManager']>;
    currentRunId: number;
    defaultAgentDropdown: DropdownComponent;
    editorBodyEl: HTMLElement;
    workspaceBodyEl?: HTMLElement;
  }): Promise<void> {
    const {
      catalogBodyEl,
      configManager,
      currentRunId,
      defaultAgentDropdown,
      editorBodyEl,
      workspaceBodyEl,
    } = options;

    try {
      const [runtimeAgentsResult, projectAgents, defaultAgent, fileScan] = await Promise.all([
        this.plugin.openCodeService.sdk.app.agents(),
        configManager.getAgentConfig(),
        configManager.getDefaultAgent(),
        this.getMarkdownWorkspaceService().scan(),
      ]);

      if (currentRunId !== this.refreshRunId) {
        return;
      }
      const runtimeAgents = Array.isArray(runtimeAgentsResult) ? runtimeAgentsResult : [];
      const runtimeAgentIds = new Set(runtimeAgents.map((agent) => agent.name));
      const fileAgents = this.getMarkdownWorkspaceService().markRuntimeSeen(fileScan.files, runtimeAgentIds);
      const mergedAgents = this.sortAgents(this.agentCatalogService.aggregate({
        runtimeAgents,
        configAgents: projectAgents,
        fileAgents,
      }));
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
            workspaceBodyEl,
          });
        },
        projectAgents,
        mergedAgents,
      });
      this.renderCatalog({
        catalogBodyEl,
        configManager,
        defaultAgentDropdown,
        editorBodyEl,
        mergedAgents,
        projectAgents,
        currentRunId,
        workspaceBodyEl,
      });
      if (workspaceBodyEl) {
        this.renderMarkdownWorkspaceBlock(workspaceBodyEl, {
          catalogBodyEl,
          configManager,
          currentRunId,
          defaultAgentDropdown,
          editorBodyEl,
          fileAgents,
        });
      }
    } catch (error) {
      if (currentRunId !== this.refreshRunId) {
        return;
      }

      logger.error('Failed to load agent catalog:', error);
      this.renderDefaultAgentDropdown(defaultAgentDropdown, [], undefined);
      editorBodyEl.replaceChildren();
      this.renderCatalogLoadFailure(catalogBodyEl, error);
      workspaceBodyEl?.replaceChildren();
    }
  }

  private renderDefaultAgentDropdown(
    dropdown: DropdownComponent,
    mergedAgents: SurfaceAgent[],
    defaultAgent: string | undefined,
  ): void {
    dropdown.selectEl.replaceChildren();
    dropdown.addOption('', t('settings.agents.default.followOpenCode'));

    const defaultEligibleIds = new Set<string>();
    for (const agent of mergedAgents) {
      if (agent.defaultEligible) {
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
      workspaceBodyEl,
    } = context;

    this.renderWithPreservedScroll(catalogBodyEl, () => {
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
                await this.invalidateAgentAutocompleteCatalog();
                await this.refreshCatalog({
                  catalogBodyEl,
                  configManager,
                  currentRunId,
                  defaultAgentDropdown,
                  editorBodyEl,
                  workspaceBodyEl,
                });
              });
          });
        }
      }
    });
  }

  private renderCatalogLoadFailure(catalogBodyEl: HTMLElement, error: unknown): void {
    this.renderWithPreservedScroll(catalogBodyEl, () => {
      catalogBodyEl.replaceChildren();
      const message = error instanceof Error ? error.message : String(error);
      new Setting(catalogBodyEl)
        .setName(t('settings.agents.loadFailed.name'))
        .setDesc(t('settings.agents.loadFailed.desc', { message }));
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

  private buildAgentDescription(agent: SurfaceAgent): string {
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

  private getSourceLabel(agent: SurfaceAgent): string {
    const riskLabelKind = this.getSystemAgentGuard().getRiskLabelKind(agent.id);
    if (riskLabelKind === 'expert-override-allowed') {
      return t('settings.agents.guard.expertOverrideAllowed');
    }
    if (riskLabelKind === 'read-only') {
      return t('settings.agents.guard.readOnly');
    }

    const sources = new Set<SurfaceAgentSource>(agent.sources);
    if (sources.has('file') && sources.has('config')) {
      return t('settings.agents.catalog.source.markdownOverride');
    }

    if (sources.has('file')) {
      return t('settings.agents.catalog.source.markdown');
    }

    if (agent.builtin && sources.has('config')) {
      return t('settings.agents.catalog.source.builtinOverride');
    }

    if (agent.builtin) {
      return t('settings.agents.catalog.source.builtin');
    }

    if (sources.has('runtime') && sources.has('config')) {
      return t('settings.agents.catalog.source.project');
    }

    if (sources.has('runtime')) {
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

  private ensureProjectAgentEditor(
    configManager: NonNullable<OpenCodianPlugin['opencodeConfigManager']>,
  ): void {
    this.projectAgentEditor ??= new SettingsProjectAgentEditor(
      this.createGuardedConfigManager(configManager),
    );
  }

  private createGuardedConfigManager(
    configManager: NonNullable<OpenCodianPlugin['opencodeConfigManager']>,
  ): NonNullable<OpenCodianPlugin['opencodeConfigManager']> {
    const guarded = Object.create(configManager) as NonNullable<OpenCodianPlugin['opencodeConfigManager']>;
    const originalUpsert = configManager.upsertAgentConfig.bind(configManager);
    const originalRemove = configManager.removeAgentConfig.bind(configManager);
    guarded.upsertAgentConfig = async (agentId: string, patch: OpencodeAgentConfig) => {
      const guardResult = this.getSystemAgentGuard().checkWriteAllowed(agentId);
      if (!guardResult.allowed) {
        new Notice(t('settings.agents.expert.blocked'));
        return;
      }
      await originalUpsert(agentId, patch);
      await this.invalidateAgentAutocompleteCatalog();
    };
    guarded.removeAgentConfig = async (agentId: string) => {
      const guardResult = this.getSystemAgentGuard().checkWriteAllowed(agentId);
      if (!guardResult.allowed) {
        new Notice(t('settings.agents.expert.blocked'));
        return;
      }
      await originalRemove(agentId);
      await this.invalidateAgentAutocompleteCatalog();
    };
    return guarded;
  }

  private async invalidateAgentAutocompleteCatalog(): Promise<void> {
    await this.plugin.saveSettings({
      syncService: false,
      reloadModels: false,
      syncConfig: false,
      applyUi: false,
    });
  }

  private getMarkdownWorkspaceService(): MarkdownAgentWorkspaceService {
    this.markdownWorkspaceService ??= new MarkdownAgentWorkspaceService(this.createMarkdownAgentFs());
    return this.markdownWorkspaceService;
  }

  private getSystemAgentGuard(): SystemAgentGuardService {
    this.systemAgentGuard ??= new SystemAgentGuardService();
    return this.systemAgentGuard;
  }

  private createMarkdownAgentFs(): MarkdownAgentFs {
    const adapter = this.plugin.app.vault.adapter;
    const walk = async (dirPath: string): Promise<string[]> => {
      const normalizedDirPath = normalizePath(dirPath);
      const listing = await adapter.list(normalizedDirPath);
      const childFiles = listing.files.filter((filePath) => filePath.endsWith('.md'));
      const childResults = await Promise.all(listing.folders.map((folderPath) => walk(folderPath)));
      return [...childFiles, ...childResults.flat()];
    };

    const ensureParentDir = async (filePath: string): Promise<void> => {
      const segments = normalizePath(filePath).split('/');
      segments.pop();
      if (segments.length === 0) {
        return;
      }
      let currentPath = '';
      for (const segment of segments) {
        currentPath = currentPath ? `${currentPath}/${segment}` : segment;
        if (!(await adapter.exists(currentPath))) {
          await adapter.mkdir(currentPath);
        }
      }
    };

    return {
      listFiles: async (dirPath) => {
        if (!(await adapter.exists(normalizePath(dirPath)))) {
          return [];
        }
        return walk(dirPath);
      },
      read: async (path) => adapter.read(normalizePath(path)),
      write: async (path, content) => {
        const normalizedPath = normalizePath(path);
        await ensureParentDir(normalizedPath);
        await adapter.write(normalizedPath, content);
      },
      delete: async (path) => adapter.remove(normalizePath(path)),
      getModifiedTime: async (path) => {
        const stat = await adapter.stat(normalizePath(path));
        return stat?.mtime;
      },
    };
  }

  private renderMarkdownWorkspaceBlock(
    containerEl: HTMLElement,
    options: {
      catalogBodyEl: HTMLElement;
      configManager: NonNullable<OpenCodianPlugin['opencodeConfigManager']>;
      currentRunId: number;
      defaultAgentDropdown: DropdownComponent;
      editorBodyEl: HTMLElement;
      fileAgents: readonly SurfaceAgentFile[];
    },
  ): void {
    const {
      catalogBodyEl,
      configManager,
      currentRunId,
      defaultAgentDropdown,
      editorBodyEl,
      fileAgents,
    } = options;

    containerEl.replaceChildren();
    new Setting(containerEl)
      .setName(t('settings.agents.workspace.actions.create'))
      .setDesc(t('settings.agents.workspace.actions.createDesc'))
      .addButton((button) => {
        button
          .setButtonText(t('settings.agents.workspace.actions.create'))
          .onClick(async () => {
            const agentId = this.nextMarkdownAgentId(fileAgents);
            const createdPath = await this.getMarkdownWorkspaceService().create({
              agentId,
              root: '.opencode/agents',
              frontmatter: { mode: 'primary' },
              promptBody: '',
            });
            new Notice(t('settings.agents.workspace.notice.created', { path: createdPath }));
            await this.refreshCatalog({
              catalogBodyEl,
              configManager,
              currentRunId,
              defaultAgentDropdown,
              editorBodyEl,
              workspaceBodyEl: containerEl,
            });
          });
      });

    const bodyEl = containerEl.createDiv();
    if (fileAgents.length === 0) {
      bodyEl.createDiv({ text: t('settings.agents.workspace.empty') });
      return;
    }

    for (const file of fileAgents) {
      new Setting(bodyEl)
        .setName(file.agentId)
        .setDesc([
          t(`settings.agents.workspace.scope.${file.scope}`),
          this.getFileStatusLabel(file.parseStatus),
          file.runtimeSeen
            ? t('settings.agents.workspace.status.runtimeSeen')
            : t('settings.agents.workspace.status.runtimePending'),
          file.path,
        ].join(' · '))
        .addButton((button) => {
          button
            .setButtonText(t('settings.agents.workspace.actions.edit'))
            .onClick(() => {
              this.toggleMarkdownFileEditor(bodyEl, file, {
                catalogBodyEl,
                configManager,
                currentRunId,
                defaultAgentDropdown,
                editorBodyEl,
                workspaceBodyEl: containerEl,
              });
            });
        })
        .addButton((button) => {
          button
            .setButtonText(t('settings.agents.workspace.actions.delete'))
            .onClick(async () => {
              await this.getMarkdownWorkspaceService().deleteFile(file.path);
              new Notice(t('settings.agents.workspace.notice.deleted', { path: file.path }));
              await this.refreshCatalog({
                catalogBodyEl,
                configManager,
                currentRunId,
                defaultAgentDropdown,
                editorBodyEl,
                workspaceBodyEl: containerEl,
              });
            });
        });
    }
  }

  private getFileStatusLabel(
    status: SurfaceAgentFile['parseStatus'],
  ): string {
    switch (status) {
      case 'ok': return t('settings.agents.workspace.status.ok');
      case 'parse-error': return t('settings.agents.workspace.status.parseError');
      case 'duplicate-id': return t('settings.agents.workspace.status.duplicateId');
      case 'conflict': return t('settings.agents.workspace.status.ok');
      default: return t('settings.agents.workspace.status.ok');
    }
  }

  private toggleMarkdownFileEditor(
    containerEl: HTMLElement,
    file: SurfaceAgentFile,
    refreshContext: {
      catalogBodyEl: HTMLElement;
      configManager: NonNullable<OpenCodianPlugin['opencodeConfigManager']>;
      currentRunId: number;
      defaultAgentDropdown: DropdownComponent;
      editorBodyEl: HTMLElement;
      workspaceBodyEl: HTMLElement;
    },
  ): void {
    const editorId = `markdown-agent-editor-${file.agentId}`;
    const existing = containerEl.querySelector(`[data-markdown-editor="${editorId}"]`);
    if (existing) {
      existing.remove();
      return;
    }

    const editorEl = containerEl.createDiv({
      cls: 'opencodian-plugin-block opencodian-markdown-agent-editor',
      attr: { 'data-markdown-editor': editorId },
    });

    let frontmatterText = '';
    for (const [key, value] of Object.entries(file.frontmatter)) {
      if (value !== undefined) {
        frontmatterText += `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}\n`;
      }
    }
    if (frontmatterText.endsWith('\n')) {
      frontmatterText = frontmatterText.slice(0, -1);
    }

    let currentFrontmatter = frontmatterText;
    let currentPromptBody = file.promptBody;

    new Setting(editorEl)
      .setName(t('settings.agents.workspace.edit.frontmatter'))
      .addTextArea((text) => {
        text
          .setValue(frontmatterText)
          .onChange((value) => { currentFrontmatter = value; });
      });

    new Setting(editorEl)
      .setName(t('settings.agents.workspace.edit.promptBody'))
      .addTextArea((text) => {
        text
          .setValue(file.promptBody)
          .onChange((value) => { currentPromptBody = value; });
      });

    new Setting(editorEl)
      .addButton((btn) => {
        btn
          .setButtonText(t('settings.agents.workspace.actions.save'))
          .onClick(async () => {
            try {
              const frontmatter = this.parseSimpleFrontmatter(currentFrontmatter);
              await this.getMarkdownWorkspaceService().update(file.path, {
                agentId: file.agentId,
                frontmatter,
                promptBody: currentPromptBody,
              });
              new Notice(t('settings.agents.workspace.notice.updated', { path: file.path }));
              editorEl.remove();
              await this.refreshCatalog(refreshContext);
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              new Notice(t('settings.agents.workspace.notice.updateFailed', { message }));
            }
          });
      })
      .addButton((btn) => {
        btn
          .setButtonText(t('settings.agents.workspace.actions.cancel'))
          .onClick(() => { editorEl.remove(); });
      });
  }

  private parseSimpleFrontmatter(text: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
      if (!match) continue;
      const key = match[1]!;
      let value: unknown = match[2]!.trim();
      if (value === '' || value === 'null' || value === '~') {
        value = undefined;
      } else if (value === 'true') {
        value = true;
      } else if (value === 'false') {
        value = false;
      } else {
        const num = Number(value);
        if (!Number.isNaN(num) && value !== '') value = num;
      }
      if (value !== undefined) result[key] = value;
    }
    return result;
  }

  private nextMarkdownAgentId(fileAgents: readonly SurfaceAgentFile[]): string {
    const existingIds = new Set(fileAgents.map((file) => file.agentId));
    if (!existingIds.has('new-agent')) {
      return 'new-agent';
    }

    let index = 2;
    while (existingIds.has(`new-agent-${index}`)) {
      index += 1;
    }

    return `new-agent-${index}`;
  }

  private sortAgents(agents: readonly SurfaceAgent[]): SurfaceAgent[] {
    return [...agents].sort((left, right) => {
      const leftOrder = left.mode ? AGENT_MODE_SORT_ORDER[left.mode] : Number.MAX_SAFE_INTEGER;
      const rightOrder = right.mode ? AGENT_MODE_SORT_ORDER[right.mode] : Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      const leftBuiltin = left.system || left.builtin === true;
      const rightBuiltin = right.system || right.builtin === true;
      if (leftBuiltin !== rightBuiltin) {
        return leftBuiltin ? -1 : 1;
      }

      return left.id.localeCompare(right.id);
    });
  }

  private showActiveBlock(containerEl: HTMLElement, activeTabId: string): void {
    containerEl.querySelectorAll('[data-section-block]').forEach((el) => {
      const blockEl = el as HTMLElement;
      blockEl.style.display = blockEl.dataset.sectionBlock === activeTabId ? '' : 'none';
    });
  }

}
