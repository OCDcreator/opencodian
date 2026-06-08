import { loadClaudeCodeSdk } from '../../../../../src/core/agents/backend';

describe('ClaudeCodeSdkLoader', () => {
  it('loads an SDK query facade through the injectable importer', async () => {
    const query = jest.fn();
    const listSessions = jest.fn();
    const getSessionInfo = jest.fn();
    const getSessionMessages = jest.fn();
    const listSubagents = jest.fn();
    const getSubagentMessages = jest.fn();
    const importSessionToStore = jest.fn();
    const forkSession = jest.fn();
    const renameSession = jest.fn();
    const importer = jest.fn(async () => ({
      query,
      listSessions,
      getSessionInfo,
      getSessionMessages,
      listSubagents,
      getSubagentMessages,
      importSessionToStore,
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
    expect(sdk.getSessionMessages).toBe(getSessionMessages);
    expect(sdk.listSubagents).toBe(listSubagents);
    expect(sdk.getSubagentMessages).toBe(getSubagentMessages);
    expect(sdk.importSessionToStore).toBe(importSessionToStore);
    expect(sdk.forkSession).toBe(forkSession);
    expect(sdk.renameSession).toBe(renameSession);
  });
});
