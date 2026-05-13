/* eslint-disable max-lines */
/**
 * Skill settings section for OpenCode skill discovery and permission control.
 */

import { MarkdownRenderer, Modal, normalizePath, Notice, requestUrl, Setting } from 'obsidian';

import { getServerBaseUrl } from '../../core/types/settings';
import { t, type TranslationKey } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { createLogger } from '../../shared';
import type { SkillInfo, SkillSourceGroups } from '../chat/services/SkillCatalogService';

const logger = createLogger('SettingsSkillSection');
const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SKILL_NAME_MAX_LENGTH = 64;
const SKILL_DESCRIPTION_MAX_LENGTH = 1024;
const SKILL_COMPATIBILITY_MAX_LENGTH = 500;
const ALLOWED_SKILL_FRONTMATTER_KEYS = new Set([
  'allowed-tools',
  'compatibility',
  'description',
  'license',
  'metadata',
  'name',
]);

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
    this.renderToolbar(this.bodyEl);
    void this.renderSkillList(this.bodyEl);
  }

  private renderToolbar(containerEl: HTMLElement): void {
    const toolbarEl = containerEl.createDiv({ cls: 'opencodian-skill-toolbar' });
    this.renderPermissionControl(toolbarEl);
    this.renderCreateSkillControl(toolbarEl);
    this.renderRefreshButton(toolbarEl);
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

  private renderCreateSkillControl(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.skills.create.label'))
      .setDesc(t('settings.skills.create.desc'))
      .addButton((button) => {
        button
          .setButtonText(t('settings.skills.create.button'))
          .onClick(() => {
            this.openSkillModal({
              name: this.nextSkillName(),
              description: '',
              location: '.opencode/skills/new-skill/SKILL.md',
              content: this.createSkillTemplate('new-skill'),
            }, { mode: 'create' });
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
            this.renderToolbar(this.bodyEl);
            void this.renderSkillList(this.bodyEl, true);
          });
      });
  }

  private async renderSkillList(containerEl: HTMLElement, forceRefresh = false): Promise<void> {
    const listEl = containerEl.createDiv({ cls: 'opencodian-skill-list' });
    listEl.createDiv({
      cls: 'opencodian-settings-inline-empty opencodian-skill-loading',
      text: t('settings.skills.loading'),
    });

    try {
      const skills = await this.fetchSkills(forceRefresh);
      listEl.empty();
      const groups = this.groupBySource(skills);
      const allEmpty = Object.values(groups).every((group) => group.length === 0);
      if (allEmpty) {
        listEl.createDiv({ cls: 'opencodian-settings-inline-empty', text: t('settings.skills.empty') });
        return;
      }

      for (const source of Object.keys(SOURCE_LABEL_KEYS) as Array<keyof SkillSourceGroups>) {
        const sourceSkills = groups[source];
        if (sourceSkills.length === 0) {
          continue;
        }

        const sectionEl = listEl.createDiv({
          cls: 'opencodian-skill-source-section',
          attr: { 'data-skill-source': source },
        });
        const headerEl = sectionEl.createDiv({ cls: 'opencodian-skill-source-header' });
        headerEl.createEl('h3', { text: t(SOURCE_LABEL_KEYS[source]) });
        headerEl.createSpan({
          cls: 'opencodian-skill-count',
          text: t('settings.skills.count').replace('{count}', String(sourceSkills.length)),
        });
        for (const skill of sourceSkills) {
          this.renderSkillCard(sectionEl, skill);
        }
      }
    } catch (error) {
      listEl.empty();
      logger.error('Failed to render skills:', error);
      listEl.createDiv({ cls: 'opencodian-settings-inline-empty', text: t('settings.skills.empty') });
      if (forceRefresh) {
        new Notice(t('settings.skills.empty'));
      }
    }
  }

  private renderSkillCard(containerEl: HTMLElement, skill: SkillInfo): void {
    const cardEl = containerEl.createDiv({ cls: 'opencodian-skill-card opencodian-skill-row' });
    const contentEl = cardEl.createDiv({ cls: 'opencodian-skill-card-content' });
    const headerEl = contentEl.createDiv({ cls: 'opencodian-skill-card-header' });
    const titleEl = headerEl.createDiv({ cls: 'opencodian-skill-title-row' });
    titleEl.createEl('strong', { text: skill.name });
    titleEl.createEl('small', { text: this.formatSkillSourceLabel(skill.location), cls: 'opencodian-skill-source-chip' });
    if (skill.description) {
      headerEl.createDiv({ text: skill.description, cls: 'opencodian-skill-description' });
    }

    contentEl.createEl('small', { text: skill.location, cls: 'opencodian-skill-source' });
    const actionsEl = cardEl.createDiv({ cls: 'opencodian-skill-row-actions' });
    this.renderSkillPermissionDropdown(actionsEl, skill.name);
    new Setting(actionsEl)
      .setClass('opencodian-skill-row-action')
      .addButton((button) => {
        button
          .setButtonText(t('settings.skills.open'))
          .onClick(() => {
            this.openSkillModal(skill, { mode: this.resolveVaultRelativeSkillPath(skill.location) ? 'edit' : 'view' });
          });
      });
  }

  private renderSkillPermissionDropdown(containerEl: HTMLElement, skillName: string): void {
    new Setting(containerEl)
      .setClass('opencodian-skill-row-action')
      .setName(t('settings.skills.itemPermission.label'))
      .addDropdown((dropdown) => {
        dropdown
          .addOption('allow', t('settings.skills.permission.allow'))
          .addOption('ask', t('settings.skills.permission.ask'))
          .addOption('deny', t('settings.skills.permission.deny'))
          .setValue('ask')
          .onChange(async (value) => {
            const configManager = this.plugin.opencodeConfigManager;
            if (!configManager) {
              return;
            }
            await configManager.setSkillPermissionPattern(skillName, value as 'allow' | 'ask' | 'deny');
          });

        void this.getCurrentSkillPatternPermission(skillName).then((permission) => {
          dropdown.setValue(permission);
        });
      });
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

  private async getCurrentSkillPatternPermission(skillName: string): Promise<'allow' | 'deny' | 'ask'> {
    try {
      const configManager = this.plugin.opencodeConfigManager;
      if (!configManager) {
        return 'ask';
      }
      const permission = (await configManager.read()).permission;
      if (permission && typeof permission === 'object') {
        const skillPermission = (permission as Record<string, unknown>).skill;
        if (skillPermission && typeof skillPermission === 'object') {
          const exactPermission = (skillPermission as Record<string, unknown>)[skillName];
          if (exactPermission === 'allow' || exactPermission === 'deny' || exactPermission === 'ask') {
            return exactPermission;
          }
          const defaultPermission = (skillPermission as Record<string, unknown>)['*'];
          if (defaultPermission === 'allow' || defaultPermission === 'deny' || defaultPermission === 'ask') {
            return defaultPermission;
          }
        }
        if (skillPermission === 'allow' || skillPermission === 'deny' || skillPermission === 'ask') {
          return skillPermission;
        }
      }
    } catch (error) {
      logger.warn('Failed to read skill pattern permission:', error);
    }

    return 'ask';
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

  private openSkillModal(skill: SkillInfo, options: { mode: 'create' | 'edit' | 'view' }): void {
    new SkillDetailModal({
      mode: options.mode,
      plugin: this.plugin,
      skill,
      onSaved: async () => {
        if (!this.bodyEl) {
          return;
        }
        this.bodyEl.empty();
        this.renderToolbar(this.bodyEl);
        await this.renderSkillList(this.bodyEl, true);
      },
    }).open();
  }

  private nextSkillName(): string {
    return 'new-skill';
  }

  private createSkillTemplate(skillName: string): string {
    return `---\nname: ${skillName}\ndescription: Describe when this skill should be used.\n---\n\n# ${skillName}\n\nWrite the workflow, constraints, and examples for this skill.\n`;
  }

  private formatSkillSourceLabel(location: string): string {
    return this.classifySource(location);
  }

  private resolveVaultRelativeSkillPath(location: string): string | null {
    const normalizedLocation = normalizePath(location);
    const adapter = this.plugin.app.vault.adapter as { basePath?: string };
    const basePath = typeof adapter.basePath === 'string' ? normalizePath(adapter.basePath) : '';
    const relativePath = basePath && normalizedLocation.startsWith(`${basePath}/`)
      ? normalizedLocation.slice(basePath.length + 1)
      : normalizedLocation;
    const normalizedRelativePath = normalizePath(relativePath).replace(/^\/+/, '');
    if (
      normalizedRelativePath.startsWith('.opencode/skills/')
      || normalizedRelativePath.startsWith('.claude/skills/')
      || normalizedRelativePath.startsWith('.agents/skills/')
    ) {
      return normalizedRelativePath;
    }
    return null;
  }
}

interface SkillDetailModalOptions {
  mode: 'create' | 'edit' | 'view';
  plugin: OpenCodianPlugin;
  skill: SkillInfo;
  onSaved: () => Promise<void>;
}

class SkillDetailModal extends Modal {
  private readonly mode: SkillDetailModalOptions['mode'];
  private readonly plugin: OpenCodianPlugin;
  private readonly skill: SkillInfo;
  private readonly onSaved: SkillDetailModalOptions['onSaved'];
  private content = '';
  private name = '';
  private validationEl: HTMLElement | null = null;
  private previewEl: HTMLElement | null = null;
  private sourceTextArea: HTMLTextAreaElement | null = null;

  constructor(options: SkillDetailModalOptions) {
    super(options.plugin.app);
    this.mode = options.mode;
    this.plugin = options.plugin;
    this.skill = options.skill;
    this.onSaved = options.onSaved;
    this.content = this.normalizeSkillContent(options.skill);
    this.name = options.skill.name;
  }

  onOpen(): void {
    this.titleEl.setText(this.getTitle());
    this.contentEl.empty();
    this.modalEl.addClass('opencodian-skill-detail-modal');

    this.validationEl = this.contentEl.createDiv({ cls: 'opencodian-skill-validation' });
    const layoutEl = this.contentEl.createDiv({ cls: 'opencodian-skill-detail-layout' });
    const editorEl = layoutEl.createDiv({ cls: 'opencodian-skill-detail-editor' });
    const previewPanelEl = layoutEl.createDiv({ cls: 'opencodian-skill-detail-preview' });

    editorEl.createDiv({ cls: 'opencodian-skill-preview-label', text: t('settings.skills.modal.source') });
    this.sourceTextArea = editorEl.createEl('textarea', {
      cls: 'opencodian-skill-editor-textarea',
      attr: { spellcheck: 'false', wrap: 'soft' },
    }) as HTMLTextAreaElement;
    this.sourceTextArea.value = this.content;
    this.sourceTextArea.disabled = this.mode === 'view';
    this.sourceTextArea.addEventListener('input', () => {
      this.content = this.sourceTextArea?.value ?? '';
      this.renderValidation();
      void this.renderPreview();
    });

    previewPanelEl.createDiv({ cls: 'opencodian-skill-preview-label', text: t('settings.skills.modal.preview') });
    this.previewEl = previewPanelEl.createDiv({ cls: 'opencodian-skill-preview-content markdown-rendered' });
    this.renderValidation();
    void this.renderPreview();

    const actionsEl = this.contentEl.createDiv({ cls: 'opencodian-skill-detail-actions' });
    if (this.mode !== 'view') {
      new Setting(actionsEl)
        .addButton((button) => {
          button
            .setButtonText(t('settings.skills.modal.save'))
            .setCta()
            .onClick(async () => {
              await this.save();
            });
        });
    }
    if (this.mode === 'edit' && this.resolveVaultRelativeSkillPath(this.skill.location)) {
      new Setting(actionsEl)
        .addButton((button) => {
          button
            .setButtonText(t('settings.skills.delete'))
            .onClick(async () => {
              await this.delete();
            });
        });
    }
    new Setting(actionsEl)
      .addButton((button) => {
        button
          .setButtonText(t('settings.skills.modal.close'))
          .onClick(() => {
            this.close();
          });
      });
  }

  private getTitle(): string {
    if (this.mode === 'create') {
      return t('settings.skills.modal.createTitle');
    }
    return t('settings.skills.modal.title', { name: this.skill.name });
  }

  private renderValidation(): void {
    if (!this.validationEl) {
      return;
    }
    this.validationEl.empty();
    const result = validateSkillMarkdown(this.content, this.getExpectedSkillDirectoryName());
    this.validationEl.toggleClass('is-valid', result.valid);
    this.validationEl.toggleClass('is-invalid', !result.valid);
    this.validationEl.createDiv({
      cls: 'opencodian-skill-validation-title',
      text: result.valid ? t('settings.skills.validation.valid') : t('settings.skills.validation.invalid'),
    });
    for (const message of result.messages) {
      this.validationEl.createDiv({ cls: 'opencodian-skill-validation-message', text: message });
    }
    if (result.name) {
      this.name = result.name;
    }
  }

  private async renderPreview(): Promise<void> {
    if (!this.previewEl) {
      return;
    }
    this.previewEl.empty();
    await MarkdownRenderer.renderMarkdown(this.content, this.previewEl, '', this.plugin);
  }

  private async save(): Promise<void> {
    const validation = validateSkillMarkdown(this.content, this.getExpectedSkillDirectoryName());
    if (!validation.valid || !validation.name) {
      new Notice(t('settings.skills.validation.invalid'));
      this.renderValidation();
      return;
    }

    const path = this.mode === 'create'
      ? `.opencode/skills/${validation.name}/SKILL.md`
      : this.resolveVaultRelativeSkillPath(this.skill.location);
    if (!path) {
      new Notice(t('settings.skills.notice.readOnly'));
      return;
    }

    await this.ensureParentDir(path);
    await this.plugin.app.vault.adapter.write(path, this.content);
    new Notice(t('settings.skills.notice.saved', { path }));
    await this.onSaved();
    this.close();
  }

  private async delete(): Promise<void> {
    const path = this.resolveVaultRelativeSkillPath(this.skill.location);
    if (!path) {
      new Notice(t('settings.skills.notice.readOnly'));
      return;
    }
    await this.plugin.app.vault.adapter.remove(path);
    new Notice(t('settings.skills.notice.deleted', { path }));
    await this.onSaved();
    this.close();
  }

  private async ensureParentDir(path: string): Promise<void> {
    const segments = normalizePath(path).split('/');
    segments.pop();
    let currentPath = '';
    for (const segment of segments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      if (!(await this.plugin.app.vault.adapter.exists(currentPath))) {
        await this.plugin.app.vault.adapter.mkdir(currentPath);
      }
    }
  }

  private resolveVaultRelativeSkillPath(location: string): string | null {
    const normalizedLocation = normalizePath(location);
    const adapter = this.plugin.app.vault.adapter as { basePath?: string };
    const basePath = typeof adapter.basePath === 'string' ? normalizePath(adapter.basePath) : '';
    const relativePath = basePath && normalizedLocation.startsWith(`${basePath}/`)
      ? normalizedLocation.slice(basePath.length + 1)
      : normalizedLocation;
    const normalizedRelativePath = normalizePath(relativePath).replace(/^\/+/, '');
    if (
      normalizedRelativePath.startsWith('.opencode/skills/')
      || normalizedRelativePath.startsWith('.claude/skills/')
      || normalizedRelativePath.startsWith('.agents/skills/')
    ) {
      return normalizedRelativePath;
    }
    return null;
  }

  private getExpectedSkillDirectoryName(): string | undefined {
    if (this.mode === 'create') {
      return undefined;
    }
    const path = this.resolveVaultRelativeSkillPath(this.skill.location);
    if (!path) {
      return undefined;
    }
    const segments = normalizePath(path).split('/');
    return segments[segments.length - 2];
  }

  private normalizeSkillContent(skill: SkillInfo): string {
    if (skill.content?.trim().startsWith('---')) {
      return skill.content;
    }
    if (skill.content?.trim()) {
      return this.createFallbackContent(skill, skill.content);
    }
    return this.createFallbackContent(skill);
  }

  private createFallbackContent(skill: SkillInfo, body = `# ${skill.name}\n`): string {
    return `---\nname: ${skill.name}\ndescription: ${skill.description ?? ''}\n---\n\n${body}`;
  }
}

interface SkillValidationResult {
  valid: boolean;
  messages: string[];
  name?: string;
}

function validateSkillMarkdown(content: string, expectedDirectoryName?: string): SkillValidationResult {
  const messages: string[] = [];
  const frontmatterMatch = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/u.exec(content);
  if (!frontmatterMatch) {
    return {
      valid: false,
      messages: [t('settings.skills.validation.frontmatter')],
    };
  }

  const frontmatter = parseSimpleFrontmatter(frontmatterMatch[1] ?? '');
  for (const key of Object.keys(frontmatter)) {
    if (!ALLOWED_SKILL_FRONTMATTER_KEYS.has(key)) {
      messages.push(t('settings.skills.validation.frontmatterKey', { key }));
    }
  }
  const name = typeof frontmatter.name === 'string' ? frontmatter.name.trim() : '';
  const description = typeof frontmatter.description === 'string' ? frontmatter.description.trim() : '';
  const compatibility = typeof frontmatter.compatibility === 'string'
    ? frontmatter.compatibility.trim()
    : frontmatter.compatibility;
  const body = (frontmatterMatch[2] ?? '').trim();

  messages.push(...validateSkillName(name, expectedDirectoryName));
  messages.push(...validateSkillDescription(description));
  messages.push(...validateSkillCompatibility(compatibility));
  if (!body) {
    messages.push(t('settings.skills.validation.bodyRequired'));
  }

  return {
    valid: messages.length === 0,
    messages: messages.length > 0 ? messages : [t('settings.skills.validation.ready')],
    name,
  };
}

function validateSkillName(name: string, expectedDirectoryName?: string): string[] {
  if (!name) {
    return [t('settings.skills.validation.nameRequired')];
  }
  if (!SKILL_NAME_PATTERN.test(name) || name.length > SKILL_NAME_MAX_LENGTH) {
    return [t('settings.skills.validation.namePattern')];
  }
  if (expectedDirectoryName && name !== expectedDirectoryName) {
    return [t('settings.skills.validation.nameDirectoryMatch')];
  }
  return [];
}

function validateSkillDescription(description: string): string[] {
  if (!description) {
    return [t('settings.skills.validation.descriptionRequired')];
  }
  if (description.includes('<') || description.includes('>')) {
    return [t('settings.skills.validation.descriptionNoAngles')];
  }
  if (description.length > SKILL_DESCRIPTION_MAX_LENGTH) {
    return [t('settings.skills.validation.descriptionLength')];
  }
  return [];
}

function validateSkillCompatibility(compatibility: unknown): string[] {
  if (!compatibility) {
    return [];
  }
  if (typeof compatibility !== 'string' || compatibility.length > SKILL_COMPATIBILITY_MAX_LENGTH) {
    return [t('settings.skills.validation.compatibilityLength')];
  }
  return [];
}

function parseSimpleFrontmatter(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const line of text.split(/\r?\n/u)) {
    if (/^\s/u.test(line)) {
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const match = /^([a-zA-Z_][a-zA-Z0-9_-]*)\s*:\s*(.*)$/u.exec(trimmed);
    if (!match) {
      continue;
    }
    result[match[1]!] = match[2]!.replace(/^["']|["']$/gu, '').trim();
  }
  return result;
}
