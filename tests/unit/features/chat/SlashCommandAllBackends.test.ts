import { WorkspaceLeaf } from 'obsidian';

import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';
import { createSlashCommandExecutionHost } from '../../../../src/features/chat/services/commands/SlashCommandExecutionHostFactory';
import { SlashCommandExecutionService } from '../../../../src/features/chat/services/commands/SlashCommandExecutionService';
import { SlashCommandMenuCatalogCache } from '../../../../src/features/chat/services/commands/SlashCommandMenuCatalogCache';
import { SlashCommandMenuCoordinator } from '../../../../src/features/chat/services/commands/SlashCommandMenuCoordinator';
import { filterSlashCommandMenuItems } from '../../../../src/features/chat/services/commands/slashCommandMenuFilter';

describe('native composer command and skill catalogs', () => {
  it.each([
    ['opencode2', 'design', '/design '], ['claude-code', 'design', '/design '],
    ['codex', 'design', '$design '], ['pi', 'skill:design', '/skill:design '],
    ['zcode', 'design', '/design '], ['dsh', 'design', '/design '],
  ])('%s uses / for commands plus skills and $ exclusively for skills with native serialization', async (backend, id, insertText) => {
    const skill = { id, description: 'Design', source: backend === 'codex' ? 'codex-skill' as const : 'skill' as const,
      nativeSkill: true, insertText, hasProjectOverride: false, runtimeAvailable: true, subtask: false, isBuiltin: false };
    const commandId = backend === 'codex' ? 'new' : 'review';
    const command = { ...skill, id: commandId, source: 'command' as const, insertText: `/${commandId} ` };
    const items = [command, skill];
    for (const trigger of ['/', '$'] as const) {
      const textarea = document.createElement('textarea');
      textarea.value = trigger;
      textarea.setSelectionRange(1, 1);
      const coordinator = new SlashCommandMenuCoordinator({
        getTextarea: () => textarea, getMenuElement: () => null,
        getCatalogItems: () => items, setCatalogItems: () => {}, loadItems: async () => items,
        getSkillMode: () => 'skills-command', isCodexSkillMode: () => backend === 'codex',
        onMenuLoadFailed: () => {}, onCatalogStateChanged: () => {}, onMenuItemApplied: () => {}, scheduleLayoutSync: () => {},
      });
      await coordinator.refresh();
      const selected = filterSlashCommandMenuItems(items, '', {
        trigger, skillMode: 'skills-command', skillsCommandDescription: 'Skills',
      });
      expect(selected.map((item) => item.source)).toEqual(trigger === '/' ? ['command', skill.source] : [skill.source]);
      const key = { key: 'Tab', preventDefault: jest.fn() } as unknown as KeyboardEvent;
      expect(coordinator.tryHandleKeydown(key)).toBe(true);
      expect(textarea.value).toBe(trigger === '/' ? `/${commandId} ` : insertText);
    }
  });
  it('does not select a previous backend skill while the new catalog is loading', async () => {
    const item = (id: string) => ({ id, description: '', source: 'skill' as const, nativeSkill: true,
      insertText: `/${id} `, hasProjectOverride: false, runtimeAvailable: true, subtask: false, isBuiltin: false });
    let catalog = [item('previous-backend')];
    let finish!: (items: typeof catalog) => void;
    const pending = new Promise<typeof catalog>((resolve) => { finish = resolve; });
    const textarea = document.createElement('textarea');
    textarea.value = '/'; textarea.setSelectionRange(1, 1);
    const coordinator = new SlashCommandMenuCoordinator({
      getTextarea: () => textarea, getMenuElement: () => null,
      getCatalogItems: () => catalog, setCatalogItems: (items) => { catalog = items ?? []; },
      loadItems: () => pending, getSkillMode: () => 'direct',
      onMenuLoadFailed: () => {}, onCatalogStateChanged: () => {}, onMenuItemApplied: () => {}, scheduleLayoutSync: () => {},
    });
    const loading = coordinator.refresh();
    const tab = () => ({ key: 'Tab', preventDefault: jest.fn() }) as unknown as KeyboardEvent;
    expect(coordinator.tryHandleKeydown(tab())).toBe(false);
    expect(textarea.value).toBe('/');
    finish([item('current-backend')]);
    await loading;
    expect(coordinator.tryHandleKeydown(tab())).toBe(true);
    expect(textarea.value).toBe('/current-backend ');
  });
  it('uses OpenCode 2 native API for a draft before a conversation exists', async () => {
    const listSkills = jest.fn(async () => [{ name: 'design' }]);
    const legacy = jest.fn();
    const host = createSlashCommandExecutionHost({
      getCurrentConversation: () => null, getActiveBackend: () => 'opencode2',
      getOpenCode2Adapter: () => ({ listSkills }),
      openCodeServiceSdk: { app: { skills: legacy } },
    } as never);
    await expect(host.getRuntimeSkills()).resolves.toEqual([{ name: 'design' }]);
    expect(legacy).not.toHaveBeenCalled();
  });
  it('keeps Claude builtin precedence while exposing unmarked runtime skills', async () => {
    const cache = new SlashCommandMenuCatalogCache({
      getBackendKey: () => 'claude-code', getHiddenCommandIds: () => [], getVaultPath: () => null,
      loadClaudeRuntimeCommands: async () => [
        { name: 'review', description: 'Custom skill' },
        { name: 'review', description: 'Native command', builtin: true },
        { name: 'design', description: 'Native skill' },
      ],
    } as never);
    const items = await cache.load();
    expect(items.filter((item) => item.id === 'review')).toEqual([
      expect.objectContaining({ source: 'claude-runtime', description: 'Native command' }),
    ]);
    expect(items).toContainEqual(expect.objectContaining({ id: 'design', source: 'skill', insertText: '/design ' }));
  });
  it.each(['claude-code', 'codex', 'pi', 'zcode', 'dsh'] as const)('%s draft commands never query the legacy runtime', async (backend) => {
    const getRuntimeSkills = jest.fn();
    const service = new SlashCommandExecutionService({
      getCurrentConversation: () => null, getActiveBackend: () => backend, getRuntimeSkills,
    } as never);
    await expect(service.tryRunSlashCommand('/review file.ts')).resolves.toBe(false);
    expect(getRuntimeSkills).not.toHaveBeenCalled();
  });
  it.each(['opencode2', 'claude-code', 'codex', 'pi', 'zcode', 'dsh'])('%s reaches its own catalog without OpenCode 1', async (backend) => {
    const registry = {
      opencode2: { listCommands: async () => [{ name: 'review' }], listSkills: async () => [], listAgents: async () => [] },
      'claude-code': { getRuntimeCatalog: async () => ({ commands: [{ name: 'review', builtin: true }], agents: [] }) },
      codex: { getRuntimeSkills: async () => [{ name: 'review', enabled: true }] },
      pi: { getRuntimeCommands: async () => [{ name: 'review', source: 'extension' }] },
      zcode: { getSlashCommands: () => [{ name: 'review', description: '', source: 'builtin' }], getRuntimeSkills: async () => [] },
      dsh: { getRuntimeCommands: async () => [{ name: 'review' }] },
    };
    const view = new OpenCodianView(new WorkspaceLeaf(), {
      settings: { ...DEFAULT_SETTINGS, activeBackend: backend, enabledBackends: [backend] },
      openCodeService: {}, storage: {},
      agentServiceRegistry: { get: (key: keyof typeof registry) => registry[key] },
    } as never);
    const items = await (view as unknown as { loadSlashCommandMenuItems(): ReturnType<SlashCommandMenuCatalogCache['load']> }).loadSlashCommandMenuItems();
    expect(items).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'review' })]));
    const cache = (view as unknown as { slashCommandMenuCatalogCache: { host: { getBackendKey(): string } } }).slashCommandMenuCatalogCache;
    expect(cache.host.getBackendKey()).toBe(backend);
  });

  it.each([
    ['opencode2', 'design', '/design '],
    ['pi', 'skill:design', '/skill:design '],
    ['zcode', 'design', '/design '],
    ['dsh', 'design', '/design '],
    ['claude-code', 'design', '/design '],
  ])('%s retains native skill identity and invocation in /skills', async (backend, name, insertText) => {
    const legacy = jest.fn(async () => []);
    const cache = new SlashCommandMenuCatalogCache({
      getBackendKey: () => backend, getHiddenCommandIds: () => [], getVaultPath: () => '/vault',
      loadRuntimeCommands: legacy, loadRuntimeSkills: legacy,
      loadProjectCommands: async () => ({}), loadProjectAgents: async () => ({}),
      loadOpenCode2Commands: async () => [], loadOpenCode2Skills: async () => [{ name }],
      loadPiRuntimeCommands: async () => [{ name, source: 'skill' }],
      loadZCodeRuntimeCommands: async () => [], loadZCodeRuntimeSkills: async () => [{ name }],
      loadDshRuntimeCommands: async () => [{ name, source: 'skill' }],
      loadClaudeRuntimeCommands: async () => [{ name, builtin: false }],
    } as never);
    const items = await cache.load();
    const visible = filterSlashCommandMenuItems(items, 'skills design', {
      skillMode: 'skills-command', skillsCommandDescription: 'Skills',
    });
    expect(visible).toEqual([expect.objectContaining({ id: name, source: 'skill', insertText })]);
    expect(filterSlashCommandMenuItems(items, 'design', {
      skillMode: 'direct', skillsCommandDescription: 'Skills', isMidText: true,
    })).toEqual(expect.arrayContaining([expect.objectContaining({ source: 'skill' })]));
    expect(legacy).not.toHaveBeenCalled();
  });

  it.each(['opencode2', 'pi', 'zcode', 'dsh'])('%s respects hidden commands and skills', async (backend) => {
    const commands = async () => [{ name: 'hidden', source: 'skill' }, { name: 'visible' }];
    const cache = new SlashCommandMenuCatalogCache({
      getBackendKey: () => backend, getHiddenCommandIds: () => ['hidden'],
      loadOpenCode2Commands: commands, loadOpenCode2Skills: async () => [],
      loadPiRuntimeCommands: commands, loadZCodeRuntimeCommands: commands, loadDshRuntimeCommands: commands,
    } as never);
    expect((await cache.load()).some((item) => item.id === 'hidden')).toBe(false);
  });
});
