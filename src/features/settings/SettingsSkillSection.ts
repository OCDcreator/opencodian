/**
 * Skill settings section for OpenCode skill discovery and permission control.
 */

import { Notice, requestUrl, Setting } from 'obsidian';

import { getServerBaseUrl } from '../../core/types/settings';
import { t, type TranslationKey } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { createLogger } from '../../shared';
import type { SkillInfo, SkillSourceGroups } from '../chat/services/SkillCatalogService';

const logger = createLogger('SettingsSkillSection');

const SOURCE_LABEL_KEYS: Record<keyof SkillSourceGroups, TranslationKey> = {
  project: 'settings.skills.source.project',
  global: 'settings.skills.source.global',
  builtin: 'settings.skills.source.builtin',
  claude: 'settings.skills.source.claude',
  agents: 'settings.skills.source.agents',
};

interface SettingsSkillSectionOptions {
  plugin: OpenCodianPlugin;
  createSectionHeading: (
    containerEl: HTMLElement,
    title: string,
    tooltip?: string,
  ) => HTMLHeadingElement;
}

export class SettingsSkillSection {
  private readonly plugin: OpenCodianPlugin;
  private readonly createSectionHeading: SettingsSkillSectionOptions['createSectionHeading'];
  private bodyEl: HTMLElement | null = null;

  constructor(options: SettingsSkillSectionOptions) {
    this.plugin = options.plugin;
    this.createSectionHeading = options.createSectionHeading;
  }

  attach(containerEl: HTMLElement): HTMLHeadingElement {
    const heading = this.createSectionHeading(containerEl, t('settings.skills.title'));
    this.render(containerEl);
    return heading;
  }

  attachTabbed(containerEl: HTMLElement, _secondaryTabId: string): void {
    this.render(containerEl);
  }

  private render(containerEl: HTMLElement): void {
    const blockEl = containerEl.createDiv({ cls: 'opencodian-settings-block' });
    this.bodyEl = blockEl.createDiv({ cls: 'opencodian-settings-block-body' });
    this.renderPermissionControl(this.bodyEl);
    this.renderRefreshButton(this.bodyEl);
    void this.renderSkillList(this.bodyEl);
  }

  private renderPermissionControl(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.skills.permission.label'))
      .addDropdown((dropdown) => {
        dropdown
          .addOption('allow', t('settings.skills.permission.allow'))
          .addOption('ask', t('settings.skills.permission.ask'))
          .addOption('deny', t('settings.skills.permission.deny'))
          .setValue('allow')
          .onChange(async (value) => {
            const configManager = this.plugin.opencodeConfigManager;
            if (!configManager) {
              return;
            }

            await configManager.setToolPermission('skill', value as 'allow' | 'deny' | 'ask');
          });

        void this.getCurrentSkillPermission().then((permission) => {
          dropdown.setValue(permission);
        });
      });
  }

  private renderRefreshButton(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .addButton((button) => {
        button
          .setButtonText(t('settings.skills.refresh'))
          .onClick(() => {
            if (!this.bodyEl) {
              return;
            }

            this.bodyEl.empty();
            this.renderPermissionControl(this.bodyEl);
            this.renderRefreshButton(this.bodyEl);
            void this.renderSkillList(this.bodyEl, true);
          });
      });
  }

  private async renderSkillList(containerEl: HTMLElement, forceRefresh = false): Promise<void> {
    const listEl = containerEl.createDiv({ cls: 'opencodian-skill-list' });

    try {
      const skills = await this.fetchSkills(forceRefresh);
      const groups = this.groupBySource(skills);
      const allEmpty = Object.values(groups).every((group) => group.length === 0);
      if (allEmpty) {
        listEl.createEl('p', { text: t('settings.skills.empty') });
        return;
      }

      for (const source of Object.keys(SOURCE_LABEL_KEYS) as Array<keyof SkillSourceGroups>) {
        const sourceSkills = groups[source];
        if (sourceSkills.length === 0) {
          continue;
        }

        listEl.createEl('h3', { text: t(SOURCE_LABEL_KEYS[source]) });
        for (const skill of sourceSkills) {
          this.renderSkillCard(listEl, skill);
        }
      }
    } catch (error) {
      logger.error('Failed to render skills:', error);
      listEl.createEl('p', { text: t('settings.skills.empty') });
      if (forceRefresh) {
        new Notice(t('settings.skills.empty'));
      }
    }
  }

  private renderSkillCard(containerEl: HTMLElement, skill: SkillInfo): void {
    const cardEl = containerEl.createDiv({ cls: 'opencodian-skill-card' });
    const headerEl = cardEl.createDiv({ cls: 'opencodian-skill-card-header' });
    headerEl.createEl('strong', { text: skill.name });
    if (skill.description) {
      headerEl.createSpan({ text: ` — ${skill.description}` });
    }
    cardEl.createEl('small', { text: skill.location, cls: 'opencodian-skill-source' });

    const contentEl = cardEl.createDiv({ cls: 'opencodian-skill-content' });
    if (skill.content) {
      const preview = skill.content.length > 500
        ? `${skill.content.slice(0, 500)}...`
        : skill.content;
      contentEl.createEl('pre', { text: preview });
    } else {
      contentEl.createEl('p', { text: t('settings.skills.content.unavailable') });
    }
  }

  private async getCurrentSkillPermission(): Promise<'allow' | 'deny' | 'ask'> {
    try {
      const configManager = this.plugin.opencodeConfigManager;
      if (!configManager) {
        return 'allow';
      }

      const config = await configManager.read();
      const permission = config.permission;
      if (permission === 'allow' || permission === 'deny' || permission === 'ask') {
        return permission;
      }

      if (permission && typeof permission === 'object') {
        const skillPermission = (permission as Record<string, unknown>).skill;
        if (skillPermission === 'allow' || skillPermission === 'deny' || skillPermission === 'ask') {
          return skillPermission;
        }
      }
    } catch (error) {
      logger.warn('Failed to read skill permission:', error);
    }

    return 'allow';
  }

  private async fetchSkills(_forceRefresh: boolean): Promise<SkillInfo[]> {
    const response = await requestUrl({
      url: `${getServerBaseUrl(this.plugin.settings.server)}/skill`,
      method: 'GET',
      headers: this.getRequestHeaders(),
    });

    if (response.status >= 400) {
      throw new Error(`HTTP ${response.status} from /skill`);
    }

    const payload = typeof response.json === 'object' && response.json !== null
      ? response.json
      : JSON.parse(response.text);
    return this.normalizeSkillsPayload(payload);
  }

  private normalizeSkillsPayload(payload: unknown): SkillInfo[] {
    const rawSkills = Array.isArray(payload)
      ? payload
      : payload && typeof payload === 'object' && Array.isArray((payload as { skills?: unknown }).skills)
        ? (payload as { skills: unknown[] }).skills
        : [];

    return rawSkills
      .filter((skill): skill is Record<string, unknown> => Boolean(skill) && typeof skill === 'object')
      .map((skill) => ({
        name: typeof skill.name === 'string' ? skill.name : '',
        description: typeof skill.description === 'string' ? skill.description : undefined,
        location: typeof skill.location === 'string' ? skill.location : 'builtin',
        content: typeof skill.content === 'string' ? skill.content : '',
      }))
      .filter((skill) => skill.name.trim().length > 0);
  }

  private groupBySource(skills: SkillInfo[]): SkillSourceGroups {
    const groups: SkillSourceGroups = {
      project: [],
      global: [],
      builtin: [],
      claude: [],
      agents: [],
    };

    for (const skill of skills) {
      groups[this.classifySource(skill.location)].push(skill);
    }

    return groups;
  }

  private classifySource(location: string): keyof SkillSourceGroups {
    if (location === 'builtin') {
      return 'builtin';
    }

    if (location.includes('.config/opencode/skills')) {
      return 'global';
    }

    if (location.includes('.claude/skills')) {
      return 'claude';
    }

    if (location.includes('.agents/skills')) {
      return 'agents';
    }

    return 'project';
  }

  private getRequestHeaders(): Record<string, string> {
    const { auth } = this.plugin.settings.server;
    if (auth.type === 'basic') {
      return { Authorization: `Basic ${btoa(`${auth.username}:${auth.password}`)}` };
    }

    if (auth.type === 'bearer' && auth.token.trim()) {
      return { Authorization: `Bearer ${auth.token.trim()}` };
    }

    return {};
  }
}
