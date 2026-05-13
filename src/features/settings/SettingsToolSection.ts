import { Setting } from 'obsidian';

import { t } from '../../i18n';
import type { OpenCodianPlugin } from '../../main';
import { getToolIdentity, isBuiltinToolName } from '../../shared/toolIdentity';

type ToolPermissionAction = 'allow' | 'deny' | 'ask';
type ToolPermissionMap = Record<string, string>;

interface ToolCatalogStoreLike {
  classifyToolIds(toolIds: string[]): { builtin: string[]; custom: string[] };
  getToolCatalogSnapshot(): { registryToolIds: string[] };
}

const TOOL_GROUPS: Array<{ labelKey: string; descKey: string; toolNames: string[] }> = [
  {
    labelKey: 'settings.tools.group.fileOps',
    descKey: 'settings.tools.group.fileOps.desc',
    toolNames: ['read', 'write', 'edit', 'multiedit', 'apply_patch', 'patch'],
  },
  {
    labelKey: 'settings.tools.group.search',
    descKey: 'settings.tools.group.search.desc',
    toolNames: ['glob', 'grep', 'list', 'codesearch'],
  },
  {
    labelKey: 'settings.tools.group.execution',
    descKey: 'settings.tools.group.execution.desc',
    toolNames: ['bash', 'task'],
  },
  {
    labelKey: 'settings.tools.group.network',
    descKey: 'settings.tools.group.network.desc',
    toolNames: ['web_fetch', 'web_search'],
  },
  {
    labelKey: 'settings.tools.group.intelligence',
    descKey: 'settings.tools.group.intelligence.desc',
    toolNames: ['lsp'],
  },
  {
    labelKey: 'settings.tools.group.meta',
    descKey: 'settings.tools.group.meta.desc',
    toolNames: ['skill', 'todowrite', 'todoread', 'question'],
  },
  {
    labelKey: 'settings.tools.group.plan',
    descKey: 'settings.tools.group.plan.desc',
    toolNames: ['plan_enter', 'plan_exit'],
  },
];

export class SettingsToolSection {
  constructor(
    private readonly containerEl: HTMLElement,
    private readonly plugin: OpenCodianPlugin,
    private readonly mode: 'builtin' | 'custom',
  ) {}

  async render(): Promise<void> {
    this.containerEl.empty();

    if (this.mode === 'builtin') {
      await this.renderBuiltinTools();
      return;
    }

    await this.renderCustomTools();
  }

  private async renderBuiltinTools(): Promise<void> {
    const currentPermissions = await this.readCurrentPermissions();

    for (const group of TOOL_GROUPS) {
      const groupEl = this.containerEl.createDiv({ cls: 'opencodian-tool-group-panel' });
      const headerEl = groupEl.createDiv({ cls: 'opencodian-tool-group-header' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      headerEl.createEl('h3', { text: t(group.labelKey as any) });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      headerEl.createDiv({ cls: 'opencodian-tool-group-desc', text: t(group.descKey as any) });
      const rowsEl = groupEl.createDiv({ cls: 'opencodian-tool-group-rows' });

      for (const toolName of group.toolNames) {
        if (!isBuiltinToolName(toolName)) {
          continue;
        }

        const identity = getToolIdentity(toolName);
        const currentPermission = this.getPermissionForTool(currentPermissions, identity.normalizedName);
        this.renderToolRow(rowsEl, identity.normalizedName, identity.displayName, currentPermission);
      }
    }
  }

  private async renderCustomTools(): Promise<void> {
    const catalogStore = this.getCatalogStore();
    if (!catalogStore) {
      this.renderEmptyState();
      return;
    }

    const allToolIds = catalogStore.getToolCatalogSnapshot().registryToolIds;
    const { custom } = catalogStore.classifyToolIds(allToolIds);
    if (custom.length === 0) {
      this.renderEmptyState();
      return;
    }

    const currentPermissions = await this.readCurrentPermissions();
    const identityContext = { registryTools: allToolIds };
    const panelEl = this.containerEl.createDiv({ cls: 'opencodian-tool-group-panel opencodian-tool-custom-panel' });
    const headerEl = panelEl.createDiv({ cls: 'opencodian-tool-group-header' });
    headerEl.createEl('h3', { text: t('settings.tools.tab.custom') });
    headerEl.createDiv({
      cls: 'opencodian-tool-group-desc',
      text: t('settings.tools.custom.desc').replace('{count}', String(custom.length)),
    });
    const rowsEl = panelEl.createDiv({ cls: 'opencodian-tool-group-rows' });

    for (const toolId of custom.sort((left, right) => left.localeCompare(right))) {
      const identity = getToolIdentity(toolId, identityContext);
      const currentPermission = this.getPermissionForTool(currentPermissions, toolId);
      this.renderToolRow(rowsEl, toolId, identity.displayName, currentPermission);
    }
  }

  private renderToolRow(containerEl: HTMLElement, toolId: string, displayName: string, currentPermission: string): void {
    const permission = this.normalizePermissionAction(currentPermission);
    const rowEl = containerEl.createDiv({
      cls: 'opencodian-tool-permission-row',
      attr: {
        'data-tool-id': toolId,
        'data-tool-permission': permission,
      },
    });

    new Setting(rowEl)
      .setName(displayName)
      .setDesc(toolId)
      .addDropdown((dropdown) => {
        dropdown
          .addOption('allow', t('settings.tools.permission.allow'))
          .addOption('ask', t('settings.tools.permission.ask'))
          .addOption('deny', t('settings.tools.permission.deny'))
          .setValue(permission)
          .onChange(async (value) => {
            await this.setToolPermission(toolId, this.normalizePermissionAction(value));
          });
      });
  }

  private renderEmptyState(): void {
    this.containerEl.createDiv({
      cls: 'opencodian-settings-inline-empty opencodian-tool-empty',
      text: t('settings.tools.empty'),
    });
  }

  private async setToolPermission(toolId: string, action: ToolPermissionAction): Promise<void> {
    const configManager = this.plugin.opencodeConfigManager;
    if (!configManager) {
      return;
    }

    await configManager.setToolPermission(toolId, action);
    await this.plugin.saveSettings({
      syncConfig: false,
      reloadModels: false,
      applyUi: false,
    });
  }

  private async readCurrentPermissions(): Promise<ToolPermissionMap> {
    try {
      const configManager = this.plugin.opencodeConfigManager;
      if (!configManager) {
        return {};
      }

      const config = await configManager.read();
      const permission = config.permission;
      if (typeof permission === 'string') {
        return { '*': permission };
      }

      if (permission && typeof permission === 'object') {
        return permission as ToolPermissionMap;
      }
    } catch {
      return {};
    }

    return {};
  }

  private getPermissionForTool(permissions: ToolPermissionMap, toolId: string): string {
    return permissions[toolId] ?? permissions['*'] ?? 'allow';
  }

  private normalizePermissionAction(value: string): ToolPermissionAction {
    if (value === 'deny' || value === 'ask') {
      return value;
    }

    return 'allow';
  }

  private getCatalogStore(): ToolCatalogStoreLike | null {
    const pluginWithCatalogStore = this.plugin as OpenCodianPlugin & {
      openCodeCatalogStateStore?: ToolCatalogStoreLike | null;
    };
    return pluginWithCatalogStore.openCodeCatalogStateStore ?? null;
  }
}
