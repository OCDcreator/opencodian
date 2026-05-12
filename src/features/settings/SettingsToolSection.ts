import { Setting } from 'obsidian';
import type { OpenCodianPlugin } from '../../main';
import { t } from '../../i18n';
import { getToolIdentity, isBuiltinToolName } from '../../shared/toolIdentity';

type ToolPermissionAction = 'allow' | 'deny' | 'ask';
type ToolPermissionMap = Record<string, string>;

interface ToolCatalogStoreLike {
  classifyToolIds(toolIds: string[]): { builtin: string[]; custom: string[] };
  getToolCatalogSnapshot(): { registryToolIds: string[] };
}

const TOOL_GROUPS: Record<string, string[]> = {
  'settings.tools.group.fileOps': ['read', 'write', 'edit', 'multiedit', 'apply_patch', 'patch'],
  'settings.tools.group.search': ['glob', 'grep', 'list', 'codesearch'],
  'settings.tools.group.execution': ['bash', 'task'],
  'settings.tools.group.network': ['web_fetch', 'web_search'],
  'settings.tools.group.intelligence': ['lsp'],
  'settings.tools.group.meta': ['skill', 'todowrite', 'todoread', 'question'],
  'settings.tools.group.plan': ['plan_enter', 'plan_exit'],
};

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

    for (const [groupLabelKey, toolNames] of Object.entries(TOOL_GROUPS)) {
      this.containerEl.createEl('h3', { text: t(groupLabelKey as any) });

      for (const toolName of toolNames) {
        if (!isBuiltinToolName(toolName)) {
          continue;
        }

        const identity = getToolIdentity(toolName);
        const currentPermission = this.getPermissionForTool(currentPermissions, identity.normalizedName);
        this.renderToolRow(identity.normalizedName, identity.displayName, currentPermission);
      }
    }
  }

  private async renderCustomTools(): Promise<void> {
    const catalogStore = this.getCatalogStore();
    if (!catalogStore) {
      this.containerEl.createEl('p', { text: t('settings.tools.empty') });
      return;
    }

    const allToolIds = catalogStore.getToolCatalogSnapshot().registryToolIds;
    const { custom } = catalogStore.classifyToolIds(allToolIds);
    if (custom.length === 0) {
      this.containerEl.createEl('p', { text: t('settings.tools.empty') });
      return;
    }

    const currentPermissions = await this.readCurrentPermissions();
    const identityContext = { registryTools: allToolIds };

    for (const toolId of custom.sort((left, right) => left.localeCompare(right))) {
      const identity = getToolIdentity(toolId, identityContext);
      const currentPermission = this.getPermissionForTool(currentPermissions, toolId);
      this.renderToolRow(toolId, identity.displayName, currentPermission);
    }
  }

  private renderToolRow(toolId: string, displayName: string, currentPermission: string): void {
    new Setting(this.containerEl)
      .setName(displayName)
      .setDesc(toolId)
      .addDropdown((dropdown) => {
        dropdown
          .addOption('allow', t('settings.tools.permission.allow'))
          .addOption('ask', t('settings.tools.permission.ask'))
          .addOption('deny', t('settings.tools.permission.deny'))
          .setValue(this.normalizePermissionAction(currentPermission))
          .onChange(async (value) => {
            await this.setToolPermission(toolId, this.normalizePermissionAction(value));
          });
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
