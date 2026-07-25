/* eslint-disable @typescript-eslint/no-explicit-any, max-lines, max-lines-per-function -- The contract suite keeps the cross-backend P1 surface scenarios together. */

import { MarkdownRenderer, Modal, Setting } from 'obsidian';

import {
  getClaudeResourceEditorMode,
  getClaudeResourceTargetPath,
  resolveClaudeResourceScopeStatus,
  SettingsClaudeResourcesSection,
} from '../../../../src/features/settings/SettingsClaudeResourcesSection';
import { getCodexResourceEditorMode, getCodexResourceTargetPath } from '../../../../src/features/settings/SettingsCodexResourcesSection';
import { SettingsCodexResourcesSection } from '../../../../src/features/settings/SettingsCodexResourcesSection';
import { SettingsCodexSection } from '../../../../src/features/settings/SettingsCodexSection';

jest.mock('../../../../src/core/agents/backend/ClaudeProjectCommandDiscovery', () => ({
  discoverClaudeCommandResources: jest.fn().mockResolvedValue([]),
  createClaudeCommandResource: jest.fn(),
  updateClaudeCommandResource: jest.fn(),
  deleteClaudeCommandResource: jest.fn(),
  catalogClaudeCommandResourceHistory: jest.fn(),
  listClaudeCommandResourceHistory: jest.fn(),
  restoreClaudeCommandResourceHistoryEntry: jest.fn(),
  readClaudeCommandContent: jest.fn().mockResolvedValue('# command\n'),
  readClaudeCommandResourceContent: jest.fn().mockResolvedValue({ status: 'success', content: '# command\n', revision: { canonicalPath: '/vault/.claude/commands/review.md', mtimeMs: 1, size: 10, sha256: 'a'.repeat(64) }, scope: 'project', targetPath: '/vault/.claude/commands/review.md' }),
  defaultClaudeCommandContent: jest.fn().mockReturnValue('# command\n'),
  validateClaudeCommandContent: jest.fn().mockReturnValue(null),
}));

jest.mock('../../../../src/core/agents/backend/ClaudeProjectSkillDiscovery', () => ({
  discoverClaudeSkillResources: jest.fn().mockResolvedValue([]),
  createClaudeSkillResource: jest.fn(),
  updateClaudeSkillResource: jest.fn(),
  deleteClaudeSkillResource: jest.fn(),
  catalogClaudeSkillResourceHistory: jest.fn(),
  listClaudeSkillResourceHistory: jest.fn(),
  restoreClaudeSkillResourceHistoryEntry: jest.fn(),
  readClaudeSkillContent: jest.fn().mockResolvedValue('# skill\n'),
  readClaudeSkillResourceContent: jest.fn().mockResolvedValue({ status: 'success', content: '# skill\n', revision: { canonicalPath: '/vault/.claude/skills/skill/SKILL.md', mtimeMs: 1, size: 8, sha256: 'a'.repeat(64) }, scope: 'project', targetPath: '/vault/.claude/skills/skill/SKILL.md' }),
  defaultClaudeSkillContent: jest.fn().mockReturnValue('# skill\n'),
  validateClaudeSkillContent: jest.fn().mockReturnValue(null),
}));

jest.mock('../../../../src/core/agents/backend/ClaudeProjectAgentDiscovery', () => ({
  discoverClaudeAgentResources: jest.fn().mockResolvedValue([]),
  createClaudeAgentResource: jest.fn(),
  updateClaudeAgentResource: jest.fn(),
  deleteClaudeAgentResource: jest.fn(),
  catalogClaudeAgentResourceHistory: jest.fn(),
  listClaudeAgentResourceHistory: jest.fn(),
  restoreClaudeAgentResourceHistoryEntry: jest.fn(),
  readClaudeAgentContent: jest.fn().mockResolvedValue('# agent\n'),
  readClaudeAgentResourceContent: jest.fn().mockResolvedValue({ status: 'success', content: '# agent\n', revision: { canonicalPath: '/vault/.claude/agents/agent.md', mtimeMs: 1, size: 8, sha256: 'a'.repeat(64) }, scope: 'project', targetPath: '/vault/.claude/agents/agent.md' }),
  defaultClaudeAgentContent: jest.fn().mockReturnValue('# agent\n'),
  validateClaudeAgentContent: jest.fn().mockReturnValue(null),
}));

jest.mock('../../../../src/core/agents/backend/CodexProjectResourceDiscovery', () => ({
  discoverCodexSkillResources: jest.fn().mockResolvedValue([]),
  createCodexSkillResource: jest.fn(),
  updateCodexSkillResource: jest.fn(),
  deleteCodexSkillResource: jest.fn(),
  catalogCodexSkillResourceHistory: jest.fn(),
  listCodexSkillResourceHistory: jest.fn(),
  restoreCodexSkillResourceHistoryEntry: jest.fn(),
  discoverCodexAgentResources: jest.fn().mockResolvedValue([]),
  createCodexAgentResource: jest.fn(),
  updateCodexAgentResource: jest.fn(),
  deleteCodexAgentResource: jest.fn(),
  catalogCodexAgentResourceHistory: jest.fn(),
  listCodexAgentResourceHistory: jest.fn(),
  restoreCodexAgentResourceHistoryEntry: jest.fn(),
  readCodexSkillContent: jest.fn().mockResolvedValue('# skill\n'),
  readCodexSkillResourceContent: jest.fn().mockResolvedValue({ status: 'success', content: '# skill\n', revision: { canonicalPath: '/vault/.agents/skills/skill/SKILL.md', mtimeMs: 1, size: 8, sha256: 'a'.repeat(64) }, scope: 'project', targetPath: '/vault/.agents/skills/skill/SKILL.md' }),
  readCodexAgentContent: jest.fn().mockResolvedValue('name = "agent"\ndescription = "agent"\n'),
  readCodexAgentResourceContent: jest.fn().mockResolvedValue({ status: 'success', content: 'name = "agent"\ndescription = "agent"\n', revision: { canonicalPath: '/vault/.codex/agents/agent.toml', mtimeMs: 1, size: 37, sha256: 'a'.repeat(64) }, scope: 'project', targetPath: '/vault/.codex/agents/agent.toml' }),
  defaultCodexSkillContent: jest.fn().mockReturnValue('# skill\n'),
  defaultCodexAgentContent: jest.fn().mockReturnValue('name = "agent"\ndescription = "agent"\n'),
  validateCodexSkillContent: jest.fn().mockReturnValue(null),
  validateCodexAgentContent: jest.fn().mockReturnValue(null),
}));

function makePlugin(): any {
  return {
    app: { vault: { adapter: { basePath: '/vault' } } },
    settings: { backendSettings: { claudeCode: { settingSources: ['project'] }, codex: {} } },
    invalidateSlashCommandCatalog: jest.fn(),
    agentServiceRegistry: { get: jest.fn() },
  };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('P1 resource settings surface', () => {
  beforeEach(() => {
    // Destructive paths are fail-closed in production; every positive test
    // explicitly opts in so jsdom's confirm stub cannot shape safety policy.
    jest.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('defaults create targets to Project and requires explicit Global selection', () => {
    expect(getClaudeResourceTargetPath('command', 'project', '/vault', '/Users/test')).toBe('/vault/.claude/commands/example.md');
    expect(getClaudeResourceTargetPath('command', 'global', '/vault', '/Users/test')).toBe('/Users/test/.claude/commands/example.md');
    expect(getCodexResourceTargetPath('skill', 'project', '/vault', '/Users/test')).toBe('/vault/.agents/skills/example/SKILL.md');
    expect(getCodexResourceTargetPath('skill', 'global', '/vault', '/Users/test')).toBe('/Users/test/.agents/skills/example/SKILL.md');

    expect(resolveClaudeResourceScopeStatus({ readonly: false, scope: 'project' }, false).label).toContain('Project');
    expect(resolveClaudeResourceScopeStatus({ readonly: false, scope: 'global' }, false).label).toContain('Global');
  });

  it('states that Global Claude resources remain editable/persisted while user source is off', async () => {
    const container = document.createElement('div');
    new SettingsClaudeResourcesSection({ plugin: makePlugin(), kinds: ['command'] }).render(container);
    await flush();
    expect(container.textContent).toMatch(/remain editable|仍可编辑/);
    expect(container.textContent).toMatch(/persisted|持久化/);
    expect(container.textContent).toMatch(/runtime|运行时/);
    expect(container.textContent).not.toMatch(/listed read-only|只读列出/);
  });

  it('keeps editor mode rules explicit for the four P1 resource surfaces', () => {
    expect(getClaudeResourceEditorMode('command')).toEqual({ edit: true, preview: true, format: 'markdown' });
    expect(getClaudeResourceEditorMode('skill')).toEqual({ edit: true, preview: true, format: 'markdown' });
    expect(getClaudeResourceEditorMode('agent')).toEqual({ edit: true, preview: true, format: 'markdown' });
    expect(getCodexResourceEditorMode('skill')).toEqual({ edit: true, preview: true, format: 'markdown' });
    expect(getCodexResourceEditorMode('agent')).toEqual({ edit: true, preview: false, format: 'toml' });
  });

  it('renders scope, target path, and revision metadata from scoped discovery', async () => {
    const command = await import('../../../../src/core/agents/backend/ClaudeProjectCommandDiscovery');
    (command.discoverClaudeCommandResources as jest.Mock).mockResolvedValueOnce([{
      name: 'review', description: 'Review', filePath: '/vault/.claude/commands/review.md', relativePath: '.claude/commands/review.md',
      readonly: false, scope: 'project', revision: { canonicalPath: '/vault/.claude/commands/review.md', mtimeMs: 1, size: 4, sha256: 'a'.repeat(64) },
    }]);
    (command.discoverClaudeCommandResources as jest.Mock).mockResolvedValueOnce([{
      name: 'global-review', description: 'Global review', filePath: '/home/lexical/.claude/commands/global-review.md', relativePath: '.claude/commands/global-review.md',
      readonly: false, scope: 'global', revision: { canonicalPath: '/Users/test/.claude/commands/global-review.md', mtimeMs: 2, size: 5, sha256: 'b'.repeat(64) },
    }]);

    const container = document.createElement('div');
    new SettingsClaudeResourcesSection({ plugin: makePlugin(), kinds: ['command'] }).render(container);
    await flush();
    const rows = container.querySelectorAll('.opencodian-claude-resource-row');
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(container.textContent).toContain('/vault/.claude/commands/review.md');
    expect(container.textContent).toContain('/Users/test/.claude/commands/global-review.md');
    expect(container.textContent).toMatch(/revision/i);
    expect(container.querySelector('[data-resource-scope="global"]')?.getAttribute('data-resource-readonly')).toBe('false');
  });

  it('retains the editor modal and draft when the expected revision conflicts', async () => {
    const command = await import('../../../../src/core/agents/backend/ClaudeProjectCommandDiscovery');
    (command.discoverClaudeCommandResources as jest.Mock).mockResolvedValue([{
      name: 'review', description: 'Review', filePath: '/vault/.claude/commands/review.md', relativePath: '.claude/commands/review.md',
      readonly: false, scope: 'project', revision: { canonicalPath: '/vault/.claude/commands/review.md', mtimeMs: 1, size: 4, sha256: 'a'.repeat(64) },
    }]);
    (command.updateClaudeCommandResource as jest.Mock).mockResolvedValue({ status: 'conflict', expected: null, current: null });
    const openSpy = jest.spyOn(Modal.prototype, 'open').mockImplementation(() => undefined);
    const closeSpy = jest.spyOn(Modal.prototype, 'close').mockImplementation(() => undefined);
    const container = document.createElement('div');
    new SettingsClaudeResourcesSection({ plugin: makePlugin(), kinds: ['command'] }).render(container);
    await flush();
    (container.querySelector('.opencodian-claude-resource-edit') as HTMLButtonElement)?.click();
    await flush();
    const modal = (openSpy.mock.instances.at(-1) as Modal | undefined);
    const editor = modal?.contentEl.querySelector('textarea') as HTMLTextAreaElement | null;
    expect(editor).not.toBeNull();
    if (!editor || !modal) throw new Error('editor modal was not opened');
    editor.value = 'draft survives conflict';
    editor.dispatchEvent(new Event('input'));
    (modal.contentEl.querySelector('.mod-cta') as HTMLButtonElement)?.click();
    await Promise.resolve();
    expect(closeSpy).not.toHaveBeenCalled();
    expect(editor.value).toBe('draft survives conflict');
  });

  it('uses the scoped safe reader and keeps the modal open without exposing bytes on read conflict', async () => {
    const command = await import('../../../../src/core/agents/backend/ClaudeProjectCommandDiscovery');
    const revision = { canonicalPath: '/vault/.claude/commands/review.md', mtimeMs: 1, size: 4, sha256: 'a'.repeat(64) };
    (command.discoverClaudeCommandResources as jest.Mock).mockResolvedValue([{
      name: 'review', description: 'Review', filePath: '/vault/.claude/commands/review.md', relativePath: '.claude/commands/review.md',
      readonly: false, scope: 'project', revision,
    }]);
    (command.readClaudeCommandContent as jest.Mock).mockResolvedValueOnce('legacy bytes must not surface');
    (command.readClaudeCommandResourceContent as jest.Mock).mockResolvedValueOnce({
      status: 'conflict', expected: revision, current: null, scope: 'project', targetPath: revision.canonicalPath,
    });
    const openSpy = jest.spyOn(Modal.prototype, 'open').mockImplementation(() => undefined);
    const container = document.createElement('div');
    new SettingsClaudeResourcesSection({ plugin: makePlugin(), kinds: ['command'] }).render(container);
    await flush();
    (container.querySelector('.opencodian-claude-resource-edit') as HTMLButtonElement).click();
    await flush();
    const modal = openSpy.mock.instances.at(-1) as Modal;
    const editor = modal.contentEl.querySelector('textarea') as HTMLTextAreaElement;
    const save = modal.contentEl.querySelector('.mod-cta') as HTMLButtonElement;
    expect(command.readClaudeCommandContent).not.toHaveBeenCalled();
    expect(editor.value).toBe('');
    expect(editor.disabled).toBe(true);
    expect(save.disabled).toBe(true);
    expect(modal.contentEl.textContent).toMatch(/changed|draft|外部修改/i);
    expect(modal.contentEl.textContent).not.toContain('legacy bytes must not surface');
  });

  it('renders typed invalid-path read failure and never falls back to an existing resource template', async () => {
    const command = await import('../../../../src/core/agents/backend/ClaudeProjectCommandDiscovery');
    const revision = { canonicalPath: '/vault/.claude/commands/symlinked.md', mtimeMs: 1, size: 4, sha256: 'b'.repeat(64) };
    (command.discoverClaudeCommandResources as jest.Mock).mockResolvedValue([{
      name: 'symlinked', description: 'Symlinked', filePath: '/vault/.claude/commands/symlinked.md', relativePath: '.claude/commands/symlinked.md',
      readonly: false, scope: 'project', revision,
    }]);
    (command.readClaudeCommandContent as jest.Mock).mockResolvedValueOnce('symlink target bytes must not surface');
    (command.readClaudeCommandResourceContent as jest.Mock).mockResolvedValueOnce({
      status: 'invalid-path', scope: 'project', targetPath: revision.canonicalPath,
    });
    const openSpy = jest.spyOn(Modal.prototype, 'open').mockImplementation(() => undefined);
    const container = document.createElement('div');
    new SettingsClaudeResourcesSection({ plugin: makePlugin(), kinds: ['command'] }).render(container);
    await flush();
    (container.querySelector('.opencodian-claude-resource-edit') as HTMLButtonElement).click();
    await flush();
    const modal = openSpy.mock.instances.at(-1) as Modal;
    expect(modal.contentEl.textContent).toMatch(/allowed resource root|资源根目录/i);
    expect(modal.contentEl.textContent).not.toContain('symlink target bytes must not surface');
    expect((modal.contentEl.querySelector('textarea') as HTMLTextAreaElement).value).toBe('');
    expect((modal.contentEl.querySelector('.mod-cta') as HTMLButtonElement).disabled).toBe(true);
  });

  it.each([
    ['Claude', 'claude'] as const,
    ['Codex', 'codex'] as const,
  ])('fails closed when %s delete confirmation is undefined', async (_label, backend) => {
    const revision = { canonicalPath: backend === 'claude' ? '/vault/.claude/commands/review.md' : '/vault/.agents/skills/review/SKILL.md', mtimeMs: 1, size: 4, sha256: 'a'.repeat(64) };
    if (backend === 'claude') {
      const command = await import('../../../../src/core/agents/backend/ClaudeProjectCommandDiscovery');
      (command.discoverClaudeCommandResources as jest.Mock).mockResolvedValue([{ name: 'review', description: 'Review', filePath: revision.canonicalPath, relativePath: '.claude/commands/review.md', readonly: false, scope: 'project', revision }]);
    } else {
      const codex = await import('../../../../src/core/agents/backend/CodexProjectResourceDiscovery');
      (codex.discoverCodexSkillResources as jest.Mock).mockResolvedValue([{ name: 'review', description: 'Review', skillMdPath: revision.canonicalPath, relativePath: '.agents/skills/review', readonly: false, scope: 'project', revision }]);
    }
    (window.confirm as jest.Mock).mockReturnValue(undefined);
    const container = document.createElement('div');
    if (backend === 'claude') {
      new SettingsClaudeResourcesSection({ plugin: makePlugin(), kinds: ['command'] }).render(container);
    } else {
      new SettingsCodexResourcesSection({ plugin: makePlugin(), createSectionHeading: (host, title) => host.createEl('h3', { text: title }) }).render(container);
    }
    await flush();
    (container.querySelector(backend === 'claude' ? '.opencodian-claude-resource-delete' : '.opencodian-codex-resource-delete') as HTMLButtonElement).click();
    await flush();
    const deleteMock = backend === 'claude'
      ? (await import('../../../../src/core/agents/backend/ClaudeProjectCommandDiscovery')).deleteClaudeCommandResource as jest.Mock
      : (await import('../../../../src/core/agents/backend/CodexProjectResourceDiscovery')).deleteCodexSkillResource as jest.Mock;
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('calls MarkdownRenderer only for markdown Preview and uses a div preview container', async () => {
    const command = await import('../../../../src/core/agents/backend/ClaudeProjectCommandDiscovery');
    const revision = { canonicalPath: '/vault/.claude/commands/review.md', mtimeMs: 1, size: 4, sha256: 'c'.repeat(64) };
    (command.discoverClaudeCommandResources as jest.Mock).mockResolvedValue([{
      name: 'review', description: 'Review', filePath: revision.canonicalPath, relativePath: '.claude/commands/review.md',
      readonly: false, scope: 'project', revision,
    }]);
    (command.readClaudeCommandResourceContent as jest.Mock).mockResolvedValue({
      status: 'success', content: '# Rendered command\n', revision, scope: 'project', targetPath: revision.canonicalPath,
    });
    const renderMarkdown = jest.spyOn(MarkdownRenderer, 'renderMarkdown').mockResolvedValue(undefined);
    const openSpy = jest.spyOn(Modal.prototype, 'open').mockImplementation(() => undefined);
    const container = document.createElement('div');
    new SettingsClaudeResourcesSection({ plugin: makePlugin(), kinds: ['command'] }).render(container);
    await flush();
    (container.querySelector('.opencodian-claude-resource-preview') as HTMLButtonElement).click();
    await flush();
    const previewModal = openSpy.mock.instances.at(-1) as Modal;
    expect(previewModal.contentEl.querySelector('.opencodian-claude-resource-preview-pane')?.tagName).toBe('DIV');
    expect(renderMarkdown).toHaveBeenCalledWith('# Rendered command\n', expect.any(HTMLElement), '', expect.anything());
    renderMarkdown.mockClear();
    (container.querySelector('.opencodian-claude-resource-edit') as HTMLButtonElement).click();
    await flush();
    expect(renderMarkdown).not.toHaveBeenCalled();
  });

  it('routes Codex Skill and Agent editor loads through their scoped safe readers', async () => {
    const codex = await import('../../../../src/core/agents/backend/CodexProjectResourceDiscovery');
    const skillRevision = { canonicalPath: '/vault/.agents/skills/review/SKILL.md', mtimeMs: 1, size: 4, sha256: 'd'.repeat(64) };
    const agentRevision = { canonicalPath: '/vault/.codex/agents/reviewer.toml', mtimeMs: 2, size: 5, sha256: 'e'.repeat(64) };
    (codex.discoverCodexSkillResources as jest.Mock).mockResolvedValue([{
      name: 'review', description: 'Review', skillMdPath: skillRevision.canonicalPath, relativePath: '.agents/skills/review',
      readonly: false, scope: 'project', revision: skillRevision,
    }]);
    (codex.discoverCodexAgentResources as jest.Mock).mockResolvedValue([{
      name: 'reviewer', description: 'Reviewer', agentTomlPath: agentRevision.canonicalPath, relativePath: '.codex/agents/reviewer.toml',
      readonly: false, scope: 'project', revision: agentRevision,
    }]);
    (codex.readCodexSkillResourceContent as jest.Mock).mockResolvedValue({ status: 'success', content: '# secure skill\n', revision: skillRevision, scope: 'project', targetPath: skillRevision.canonicalPath });
    (codex.readCodexAgentResourceContent as jest.Mock).mockResolvedValue({ status: 'success', content: 'name = "reviewer"\n', revision: agentRevision, scope: 'project', targetPath: agentRevision.canonicalPath });
    const openSpy = jest.spyOn(Modal.prototype, 'open').mockImplementation(() => undefined);
    const container = document.createElement('div');
    new SettingsCodexResourcesSection({ plugin: makePlugin(), createSectionHeading: (host, title) => host.createEl('h3', { text: title }) }).render(container);
    await flush();
    (container.querySelector('[data-codex-resource-group="skill"] .opencodian-codex-resource-edit') as HTMLButtonElement).click();
    await flush();
    expect(codex.readCodexSkillResourceContent).toHaveBeenCalledWith(expect.objectContaining({ scope: 'project', basePath: '/vault', name: 'review', expectedRevision: skillRevision }));
    expect(codex.readCodexSkillContent).not.toHaveBeenCalled();
    (container.querySelector('[data-codex-resource-group="agent"] .opencodian-codex-resource-edit') as HTMLButtonElement).click();
    await flush();
    expect(codex.readCodexAgentResourceContent).toHaveBeenCalledWith(expect.objectContaining({ scope: 'project', basePath: '/vault', name: 'reviewer', expectedRevision: agentRevision }));
    expect(codex.readCodexAgentContent).not.toHaveBeenCalled();
    expect(openSpy).toHaveBeenCalledTimes(2);
  });

  it('uses the revision returned by the scoped reader when saving a Claude draft', async () => {
    const command = await import('../../../../src/core/agents/backend/ClaudeProjectCommandDiscovery');
    const listedRevision = { canonicalPath: '/vault/.claude/commands/review.md', mtimeMs: 1, size: 4, sha256: 'a'.repeat(64) };
    const loadedRevision = { canonicalPath: '/vault/.claude/commands/review.md', mtimeMs: 2, size: 18, sha256: 'b'.repeat(64) };
    (command.discoverClaudeCommandResources as jest.Mock).mockResolvedValue([{
      name: 'review', description: 'Review', filePath: listedRevision.canonicalPath, relativePath: '.claude/commands/review.md',
      readonly: false, scope: 'project', revision: listedRevision,
    }]);
    (command.readClaudeCommandResourceContent as jest.Mock).mockResolvedValue({
      status: 'success', content: '# Loaded command\n', revision: loadedRevision, scope: 'project', targetPath: loadedRevision.canonicalPath,
    });
    (command.updateClaudeCommandResource as jest.Mock).mockResolvedValue({ status: 'success' });
    const openSpy = jest.spyOn(Modal.prototype, 'open').mockImplementation(() => undefined);
    jest.spyOn(Modal.prototype, 'close').mockImplementation(() => undefined);
    const container = document.createElement('div');
    new SettingsClaudeResourcesSection({ plugin: makePlugin(), kinds: ['command'] }).render(container);
    await flush();
    (container.querySelector('.opencodian-claude-resource-edit') as HTMLButtonElement).click();
    await flush();
    const modal = openSpy.mock.instances.at(-1) as Modal;
    const editor = modal.contentEl.querySelector('textarea') as HTMLTextAreaElement;
    editor.value = '# Draft command\n';
    editor.dispatchEvent(new Event('input'));
    (modal.contentEl.querySelector('.mod-cta') as HTMLButtonElement).click();
    await flush();
    expect(command.updateClaudeCommandResource).toHaveBeenCalledWith(expect.objectContaining({
      expectedRevision: loadedRevision,
      content: '# Draft command\n',
    }));
  });

  it('uses the revision returned by the scoped reader when saving a Codex draft', async () => {
    const codex = await import('../../../../src/core/agents/backend/CodexProjectResourceDiscovery');
    const listedRevision = { canonicalPath: '/vault/.agents/skills/review/SKILL.md', mtimeMs: 1, size: 4, sha256: 'c'.repeat(64) };
    const loadedRevision = { canonicalPath: '/vault/.agents/skills/review/SKILL.md', mtimeMs: 2, size: 18, sha256: 'd'.repeat(64) };
    (codex.discoverCodexSkillResources as jest.Mock).mockResolvedValue([{
      name: 'review', description: 'Review', skillMdPath: listedRevision.canonicalPath, relativePath: '.agents/skills/review',
      readonly: false, scope: 'project', revision: listedRevision,
    }]);
    (codex.readCodexSkillResourceContent as jest.Mock).mockResolvedValue({
      status: 'success', content: '# Loaded skill\n', revision: loadedRevision, scope: 'project', targetPath: loadedRevision.canonicalPath,
    });
    (codex.updateCodexSkillResource as jest.Mock).mockResolvedValue({ status: 'success' });
    const openSpy = jest.spyOn(Modal.prototype, 'open').mockImplementation(() => undefined);
    jest.spyOn(Modal.prototype, 'close').mockImplementation(() => undefined);
    const container = document.createElement('div');
    new SettingsCodexResourcesSection({ plugin: makePlugin(), createSectionHeading: (host, title) => host.createEl('h3', { text: title }) }).render(container);
    await flush();
    (container.querySelector('[data-codex-resource-group="skill"] .opencodian-codex-resource-edit') as HTMLButtonElement).click();
    await flush();
    const modal = openSpy.mock.instances.at(-1) as Modal;
    const editor = modal.contentEl.querySelector('textarea') as HTMLTextAreaElement;
    editor.value = '# Draft skill\n';
    editor.dispatchEvent(new Event('input'));
    (modal.contentEl.querySelector('.mod-cta') as HTMLButtonElement).click();
    await flush();
    expect(codex.updateCodexSkillResource).toHaveBeenCalledWith(expect.objectContaining({
      expectedRevision: loadedRevision,
      content: '# Draft skill\n',
    }));
  });

  it('shows grouped Codex skills/list readback and distinguishes unavailable from empty', async () => {
    const plugin = makePlugin();
    plugin.agentServiceRegistry.get.mockReturnValue({
      getRuntimeSkillGroups: jest.fn().mockResolvedValue([{
        cwd: '/vault', skills: [{ name: 'review', source: 'project', scope: 'project' }], errors: [{ path: '/vault/broken', message: 'invalid' }],
      }]),
    });
    const container = document.createElement('div');
    new SettingsCodexSection({ plugin, createSectionHeading: (host, title) => host.createEl('h3', { text: title }) }).attachTabbed(container, 'resources');
    await Promise.resolve();
    expect(container.textContent).toContain('/vault');
    expect(container.textContent).toContain('project');
    expect(container.textContent).toContain('invalid');
  });

  it('renders unavailable and successful-empty grouped skills/list states distinctly', async () => {
    const plugin = makePlugin();
    const getRuntimeSkillGroups = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce([]);
    plugin.agentServiceRegistry.get.mockReturnValue({ getRuntimeSkillGroups });
    const unavailable = document.createElement('div');
    new SettingsCodexSection({ plugin, createSectionHeading: (host, title) => host.createEl('h3', { text: title }) }).attachTabbed(unavailable, 'resources');
    await flush();
    expect(unavailable.textContent).toContain('unavailable');

    const empty = document.createElement('div');
    new SettingsCodexSection({ plugin, createSectionHeading: (host, title) => host.createEl('h3', { text: title }) }).attachTabbed(empty, 'resources');
    await flush();
    expect(empty.textContent).toContain('returned no cwd groups');
  });

  it('keeps create scope project-first while the global option is explicit', () => {
    const dropdownValues: string[] = [];
    const selectedValues: string[] = [];
    jest.spyOn(Setting.prototype, 'addDropdown').mockImplementation(function (this: Setting, callback: any) {
      const control = {
        addOption: jest.fn((value: string) => { dropdownValues.push(value); return control; }),
        setValue: jest.fn((value: string) => { selectedValues.push(value); return control; }),
        onChange: jest.fn().mockReturnThis(),
      };
      callback(control);
      return this;
    });
    jest.spyOn(Modal.prototype, 'open').mockImplementation(() => undefined);
    const container = document.createElement('div');
    new SettingsClaudeResourcesSection({ plugin: makePlugin(), kinds: ['command'] }).render(container);
    void container.querySelector<HTMLButtonElement>('.opencodian-claude-resource-create')?.click();
    expect(selectedValues).toContain('project');
    expect(dropdownValues).toEqual(expect.arrayContaining(['project', 'global']));
  });

  it('shows history at group level so a deleted target can be restored with null expected revision', async () => {
    const command = await import('../../../../src/core/agents/backend/ClaudeProjectCommandDiscovery');
    const identity = 'opaque-history-id' as any;
    (command.catalogClaudeCommandResourceHistory as jest.Mock).mockResolvedValue({
      status: 'success',
      targets: [{
        canonicalTarget: '/Users/test/.claude/commands/deleted.md', backend: 'claude', scope: 'global', kind: 'command', format: 'markdown',
        entries: [{ identity, archiveKind: 'delete', timestamp: 1, size: 10 }],
      }],
    });
    (command.discoverClaudeCommandResources as jest.Mock).mockResolvedValue([]);
    (command.restoreClaudeCommandResourceHistoryEntry as jest.Mock).mockResolvedValue({ status: 'success' });
    const closeSpy = jest.spyOn(Modal.prototype, 'close').mockImplementation(() => undefined);
    const openSpy = jest.spyOn(Modal.prototype, 'open').mockImplementation(() => undefined);
    const container = document.createElement('div');
    new SettingsClaudeResourcesSection({ plugin: makePlugin(), kinds: ['command'] }).render(container);
    await flush();
    (container.querySelector('.opencodian-claude-resource-history') as HTMLButtonElement).click();
    await flush();
    const modal = openSpy.mock.instances.at(-1) as Modal;
    (modal.contentEl.querySelector('.opencodian-resource-history-restore') as HTMLButtonElement).click();
    await flush();
    expect(command.restoreClaudeCommandResourceHistoryEntry).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'global', basePath: expect.any(String), name: 'deleted', expectedRevision: null, entryIdentity: identity,
    }));
    expect(closeSpy).toHaveBeenCalled();
  });

  it('keeps the Claude history modal and selected restore entry on revision conflict', async () => {
    const command = await import('../../../../src/core/agents/backend/ClaudeProjectCommandDiscovery');
    const identity = 'conflicting-history-entry' as any;
    (command.catalogClaudeCommandResourceHistory as jest.Mock).mockResolvedValue({
      status: 'success',
      targets: [{
        canonicalTarget: '/Users/test/.claude/commands/review.md', backend: 'claude', scope: 'global', kind: 'command', format: 'markdown',
        entries: [{ identity, archiveKind: 'overwrite', timestamp: 1, size: 10 }],
      }],
    });
    (command.discoverClaudeCommandResources as jest.Mock).mockResolvedValue([{
      name: 'review', description: 'Review', filePath: '/Users/test/.claude/commands/review.md', relativePath: '.claude/commands/review.md',
      readonly: false, scope: 'global', revision: { canonicalPath: '/Users/test/.claude/commands/review.md', mtimeMs: 2, size: 11, sha256: 'f'.repeat(64) },
    }]);
    (command.restoreClaudeCommandResourceHistoryEntry as jest.Mock).mockResolvedValue({ status: 'conflict', expected: null, current: null });
    const openSpy = jest.spyOn(Modal.prototype, 'open').mockImplementation(() => undefined);
    const closeSpy = jest.spyOn(Modal.prototype, 'close').mockImplementation(() => undefined);
    const container = document.createElement('div');
    new SettingsClaudeResourcesSection({ plugin: makePlugin(), kinds: ['command'] }).render(container);
    await flush();
    (container.querySelector('.opencodian-claude-resource-history') as HTMLButtonElement).click();
    await flush();
    const modal = openSpy.mock.instances.at(-1) as Modal;
    const restoreButton = modal.contentEl.querySelector('.opencodian-resource-history-restore') as HTMLButtonElement;
    expect(restoreButton).not.toBeNull();
    restoreButton.click();
    await flush();
    expect(closeSpy).not.toHaveBeenCalled();
    expect(modal.contentEl.querySelector('.opencodian-resource-history-restore')).toBe(restoreButton);
    expect(modal.contentEl.querySelector('.opencodian-resource-conflict')?.textContent)
      .toBe('The target was modified externally; no overwrite was performed.');
  });

  it('passes the Claude revision captured when History opened, not a later discovery', async () => {
    const command = await import('../../../../src/core/agents/backend/ClaudeProjectCommandDiscovery');
    const openedRevision = { canonicalPath: '/vault/.claude/commands/review.md', mtimeMs: 1, size: 10, sha256: 'a'.repeat(64) };
    const laterRevision = { canonicalPath: '/vault/.claude/commands/review.md', mtimeMs: 2, size: 11, sha256: 'b'.repeat(64) };
    let historyOpened = false;
    (command.catalogClaudeCommandResourceHistory as jest.Mock).mockImplementation(async ({ scope }: { scope: string }) => scope === 'project'
      ? { status: 'success', targets: [{ canonicalTarget: openedRevision.canonicalPath, backend: 'claude', scope: 'project', kind: 'command', format: 'markdown', entries: [{ identity: 'history-a', archiveKind: 'overwrite', timestamp: 1, size: 10 }] }] }
      : { status: 'success', targets: [] });
    (command.discoverClaudeCommandResources as jest.Mock).mockImplementation(async () => [{
      name: 'review', description: 'Review', filePath: openedRevision.canonicalPath, relativePath: '.claude/commands/review.md',
      readonly: false, scope: 'project', revision: historyOpened ? laterRevision : openedRevision,
    }]);
    (command.restoreClaudeCommandResourceHistoryEntry as jest.Mock).mockResolvedValue({ status: 'conflict', expected: openedRevision, current: laterRevision });
    const openSpy = jest.spyOn(Modal.prototype, 'open').mockImplementation(() => undefined);
    const closeSpy = jest.spyOn(Modal.prototype, 'close').mockImplementation(() => undefined);
    const container = document.createElement('div');
    new SettingsClaudeResourcesSection({ plugin: makePlugin(), kinds: ['command'] }).render(container);
    await flush();
    (container.querySelector('.opencodian-claude-resource-history') as HTMLButtonElement).click();
    await flush();
    historyOpened = true;
    const modal = openSpy.mock.instances.at(-1) as Modal;
    (modal.contentEl.querySelector('.opencodian-resource-history-restore') as HTMLButtonElement).click();
    await flush();
    expect(command.restoreClaudeCommandResourceHistoryEntry).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: openedRevision }));
    expect(command.restoreClaudeCommandResourceHistoryEntry).not.toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: laterRevision }));
    expect(closeSpy).not.toHaveBeenCalled();
    expect(modal.contentEl.querySelector('.opencodian-resource-history-restore')).not.toBeNull();
  });

  it('passes the Codex revision captured when History opened, not a later discovery', async () => {
    const codex = await import('../../../../src/core/agents/backend/CodexProjectResourceDiscovery');
    const openedRevision = { canonicalPath: '/vault/.agents/skills/review/SKILL.md', mtimeMs: 1, size: 10, sha256: 'c'.repeat(64) };
    const laterRevision = { canonicalPath: '/vault/.agents/skills/review/SKILL.md', mtimeMs: 2, size: 11, sha256: 'd'.repeat(64) };
    let historyOpened = false;
    (codex.catalogCodexSkillResourceHistory as jest.Mock).mockImplementation(async ({ scope }: { scope: string }) => scope === 'project'
      ? { status: 'success', targets: [{ canonicalTarget: openedRevision.canonicalPath, backend: 'codex', scope: 'project', kind: 'skill', format: 'markdown', entries: [{ identity: 'history-c', archiveKind: 'overwrite', timestamp: 1, size: 10 }] }] }
      : { status: 'success', targets: [] });
    (codex.discoverCodexSkillResources as jest.Mock).mockImplementation(async () => [{
      name: 'review', description: 'Review', skillMdPath: openedRevision.canonicalPath, relativePath: '.agents/skills/review',
      readonly: false, scope: 'project', revision: historyOpened ? laterRevision : openedRevision,
    }]);
    (codex.restoreCodexSkillResourceHistoryEntry as jest.Mock).mockResolvedValue({ status: 'conflict', expected: openedRevision, current: laterRevision });
    const openSpy = jest.spyOn(Modal.prototype, 'open').mockImplementation(() => undefined);
    const closeSpy = jest.spyOn(Modal.prototype, 'close').mockImplementation(() => undefined);
    const container = document.createElement('div');
    new SettingsCodexResourcesSection({ plugin: makePlugin(), createSectionHeading: (host, title) => host.createEl('h3', { text: title }) }).render(container);
    await flush();
    (container.querySelector('[data-codex-resource-group="skill"] .opencodian-codex-resource-history') as HTMLButtonElement).click();
    await flush();
    historyOpened = true;
    const modal = openSpy.mock.instances.at(-1) as Modal;
    (modal.contentEl.querySelector('.opencodian-resource-history-restore') as HTMLButtonElement).click();
    await flush();
    expect(codex.restoreCodexSkillResourceHistoryEntry).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: openedRevision }));
    expect(codex.restoreCodexSkillResourceHistoryEntry).not.toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: laterRevision }));
    expect(closeSpy).not.toHaveBeenCalled();
    expect(modal.contentEl.querySelector('.opencodian-resource-history-restore')).not.toBeNull();
    expect(modal.contentEl.querySelector('.opencodian-resource-conflict')?.textContent)
      .toBe('The target was modified externally; no overwrite was performed.');
  });

  it('does not present an archive failure as an empty history list', async () => {
    const command = await import('../../../../src/core/agents/backend/ClaudeProjectCommandDiscovery');
    (command.catalogClaudeCommandResourceHistory as jest.Mock).mockResolvedValue({ status: 'archive-failed', cause: 'manifest invalid' });
    const openSpy = jest.spyOn(Modal.prototype, 'open').mockImplementation(() => undefined);
    const container = document.createElement('div');
    new SettingsClaudeResourcesSection({ plugin: makePlugin(), kinds: ['command'] }).render(container);
    await flush();
    (container.querySelector('.opencodian-claude-resource-history') as HTMLButtonElement).click();
    await flush();
    const modal = openSpy.mock.instances.at(-1) as Modal;
    expect(modal.contentEl.textContent).toMatch(/archive|unavailable|failed/i);
    expect(modal.contentEl.textContent).not.toContain('No archived Claude resources are available');
  });

  it('keeps markdown Preview available while Codex Agent remains TOML source-only', async () => {
    const codex = await import('../../../../src/core/agents/backend/CodexProjectResourceDiscovery');
    const revision = { canonicalPath: '/vault/x', mtimeMs: 1, size: 1, sha256: 'a'.repeat(64) };
    (codex.discoverCodexSkillResources as jest.Mock).mockResolvedValue([{ name: 'skill', description: '', skillMdPath: '/vault/.agents/skills/skill/SKILL.md', relativePath: '', readonly: false, scope: 'project', revision }]);
    (codex.discoverCodexAgentResources as jest.Mock).mockResolvedValue([{ name: 'agent', description: '', agentTomlPath: '/vault/.codex/agents/agent.toml', relativePath: '', readonly: false, scope: 'project', revision }]);
    const container = document.createElement('div');
    new SettingsCodexResourcesSection({ plugin: makePlugin(), createSectionHeading: (host, title) => host.createEl('h3', { text: title }) }).render(container);
    await flush();
    expect(container.querySelectorAll('[data-codex-resource-group="skill"] .opencodian-codex-resource-preview').length).toBeGreaterThan(0);
    expect(container.querySelector('[data-codex-resource-group="agent"] .opencodian-codex-resource-preview')).toBeNull();
  });

  it('does not mount a Markdown preview pane in the Codex Agent TOML editor', async () => {
    const codex = await import('../../../../src/core/agents/backend/CodexProjectResourceDiscovery');
    const revision = { canonicalPath: '/vault/.codex/agents/agent.toml', mtimeMs: 1, size: 1, sha256: 'a'.repeat(64) };
    (codex.discoverCodexAgentResources as jest.Mock).mockResolvedValue([{
      name: 'agent', description: '', agentTomlPath: revision.canonicalPath, relativePath: '.codex/agents/agent.toml',
      readonly: false, scope: 'project', revision,
    }]);
    (codex.readCodexAgentResourceContent as jest.Mock).mockResolvedValue({
      status: 'success', content: 'name = "agent"\ndescription = "Review"\n', revision, scope: 'project', targetPath: revision.canonicalPath,
    });
    const openSpy = jest.spyOn(Modal.prototype, 'open').mockImplementation(() => undefined);
    const container = document.createElement('div');
    new SettingsCodexResourcesSection({ plugin: makePlugin(), createSectionHeading: (host, title) => host.createEl('h3', { text: title }) }).render(container);
    await flush();
    (container.querySelector('[data-codex-resource-group="agent"] .opencodian-codex-resource-edit') as HTMLButtonElement).click();
    await flush();
    const modal = openSpy.mock.instances.at(-1) as Modal;
    expect(modal.contentEl.querySelector('.opencodian-codex-resource-preview-pane')).toBeNull();
    expect((modal.contentEl.querySelector('textarea') as HTMLTextAreaElement).hidden).toBe(false);
  });

  it('replaces the Claude resource host after create/update/delete reloads', async () => {
    const command = await import('../../../../src/core/agents/backend/ClaudeProjectCommandDiscovery');
    const revisions = {
      initial: { canonicalPath: '/vault/.claude/commands/review.md', mtimeMs: 1, size: 8, sha256: 'a'.repeat(64) },
      created: { canonicalPath: '/vault/.claude/commands/review.md', mtimeMs: 2, size: 9, sha256: 'b'.repeat(64) },
      updated: { canonicalPath: '/vault/.claude/commands/review.md', mtimeMs: 3, size: 10, sha256: 'c'.repeat(64) },
    };
    let phase: 'initial' | 'created' | 'updated' | 'deleted' = 'initial';
    const currentRevision = () => revisions[phase === 'deleted' ? 'updated' : phase];
    (command.discoverClaudeCommandResources as jest.Mock).mockImplementation(async ({ scope }: { scope: string }) => (
      scope === 'project' && phase !== 'deleted'
        ? [{
          name: 'review', description: `phase-${phase}`, filePath: currentRevision().canonicalPath, relativePath: '.claude/commands/review.md',
          readonly: false, scope: 'project', revision: currentRevision(),
        }]
        : []
    ));
    (command.createClaudeCommandResource as jest.Mock).mockImplementation(async () => {
      phase = 'created';
      return { status: 'success', targetPath: revisions.created.canonicalPath, revision: revisions.created };
    });
    (command.readClaudeCommandResourceContent as jest.Mock).mockImplementation(async () => ({
      status: 'success', content: `# ${phase}\n`, revision: currentRevision(), scope: 'project', targetPath: currentRevision().canonicalPath,
    }));
    (command.updateClaudeCommandResource as jest.Mock).mockImplementation(async () => {
      phase = 'updated';
      return { status: 'success', targetPath: revisions.updated.canonicalPath, revision: revisions.updated };
    });
    (command.deleteClaudeCommandResource as jest.Mock).mockImplementation(async () => {
      phase = 'deleted';
      return { status: 'success', targetPath: revisions.updated.canonicalPath };
    });

    const textSetters: Array<(value: string) => void> = [];
    const modals: Modal[] = [];
    jest.spyOn(Setting.prototype, 'addText').mockImplementation(function (this: Setting, callback: any) {
      const control = { onChange(setter: (value: string) => void) { textSetters.push(setter); return control; } };
      callback(control);
      return this;
    });
    jest.spyOn(Modal.prototype, 'open').mockImplementation(function (this: Modal) { modals.push(this); });
    const container = document.createElement('div');
    new SettingsClaudeResourcesSection({ plugin: makePlugin(), kinds: ['command', 'skill', 'agent'] }).render(container);

    const expectDom = (revision: string | null): void => {
      expect(container.querySelectorAll('[data-claude-resource-group]')).toHaveLength(3);
      expect(container.querySelectorAll('[data-claude-resource-group="command"]')).toHaveLength(1);
      expect(container.querySelectorAll('[data-claude-resource-group="skill"]')).toHaveLength(1);
      expect(container.querySelectorAll('[data-claude-resource-group="agent"]')).toHaveLength(1);
      const rows = container.querySelectorAll('[data-claude-resource-group="command"] .opencodian-claude-resource-row');
      expect(rows).toHaveLength(revision ? 1 : 0);
      expect(rows[0]?.getAttribute('data-resource-revision') ?? null).toBe(revision);
    };
    await flush();
    expectDom(revisions.initial.sha256);

    (container.querySelector('.opencodian-claude-resource-create') as HTMLButtonElement).click();
    textSetters.splice(0).forEach((setter) => setter('review'));
    (modals.at(-1)?.contentEl.querySelector('.mod-cta') as HTMLButtonElement).click();
    await flush();
    expectDom(revisions.created.sha256);

    (container.querySelector('.opencodian-claude-resource-edit') as HTMLButtonElement).click();
    await flush();
    const editModal = modals.at(-1) as Modal;
    const editor = editModal.contentEl.querySelector('textarea') as HTMLTextAreaElement;
    editor.value = '# updated\n';
    editor.dispatchEvent(new Event('input'));
    (editModal.contentEl.querySelector('.mod-cta') as HTMLButtonElement).click();
    await flush();
    expectDom(revisions.updated.sha256);

    (container.querySelector('.opencodian-claude-resource-delete') as HTMLButtonElement).click();
    await flush();
    expectDom(null);
  });
});
