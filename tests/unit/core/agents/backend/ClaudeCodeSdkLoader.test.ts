import { loadClaudeCodeSdk } from '../../../../../src/core/agents/backend';

describe('ClaudeCodeSdkLoader', () => {
  it('loads an SDK query facade through the injectable importer', async () => {
    const query = jest.fn();
    const listSessions = jest.fn();
    const getSessionInfo = jest.fn();
    const forkSession = jest.fn();
    const renameSession = jest.fn();
    const importer = jest.fn(async () => ({
      query,
      listSessions,
      getSessionInfo,
      forkSession,
      renameSession,
    }));
    const sdk = await loadClaudeCodeSdk({ importer });

    expect(typeof sdk.query).toBe('function');
    sdk.query({ prompt: 'hello', options: { cwd: '/vault', includePartialMessages: true, settingSources: [] } });
    expect(importer).toHaveBeenCalledWith();
    expect(query).toHaveBeenCalledWith({
      prompt: 'hello',
      options: { cwd: '/vault', includePartialMessages: true, settingSources: [] },
    });
    expect(sdk.listSessions).toBe(listSessions);
    expect(sdk.getSessionInfo).toBe(getSessionInfo);
    expect(sdk.forkSession).toBe(forkSession);
    expect(sdk.renameSession).toBe(renameSession);
  });
});
