import { SlashCommandExecutionService } from '../../../../src/features/chat/services/commands/SlashCommandExecutionService';
import { SlashCommandMenuCatalogCache } from '../../../../src/features/chat/services/commands/SlashCommandMenuCatalogCache';

describe('DSH command isolation', () => {
  it('does not load retired OpenCode command, skill, or agent catalogs', async () => {
    const load = jest.fn(async () => { throw new Error('legacy catalog must not be called'); });
    const host = {
      getBackendKey: () => 'dsh', getHiddenCommandIds: () => [],
      loadRuntimeCommands: load, loadRuntimeSkills: load, loadRuntimeAgents: load,
    } as unknown as ConstructorParameters<typeof SlashCommandMenuCatalogCache>[0];
    await expect(new SlashCommandMenuCatalogCache(host).load()).resolves.toEqual([]);
    expect(load).not.toHaveBeenCalled();
  });

  it('keeps unsupported slash text on the DSH chat path without resolving legacy commands', async () => {
    const load = jest.fn(async () => { throw new Error('legacy runtime must not be called'); });
    const host = {
      getCurrentConversation: () => ({ id: 'owned', backend: 'dsh', backendSessionId: 'native-dsh' }),
      getRuntimeSkills: load, getProjectCommands: load, ensureServerReady: load,
    } as unknown as ConstructorParameters<typeof SlashCommandExecutionService>[0];
    await expect(new SlashCommandExecutionService(host).tryRunSlashCommand('/native-unsupported')).resolves.toBe(false);
    expect(load).not.toHaveBeenCalled();
  });
});
