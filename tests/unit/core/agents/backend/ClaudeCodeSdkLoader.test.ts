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

describe('ClaudeCodeSdkLoader deleteSession forwarding', () => {
  it('forwards the official native deleteSession when the SDK module exposes it', async () => {
    const query = jest.fn();
    const deleteSession = jest.fn(async () => undefined);
    const importer = jest.fn(async () => ({ query, deleteSession }));
    const sdk = await loadClaudeCodeSdk({ importer });

    expect(sdk.deleteSession).toBe(deleteSession);
    await sdk.deleteSession?.('sdk-session-1', { dir: '/vault' });
    expect(deleteSession).toHaveBeenCalledWith('sdk-session-1', { dir: '/vault' });
  });

  it('omits deleteSession when the SDK module does not declare it', async () => {
    const importer = jest.fn(async () => ({ query: jest.fn() }));
    const sdk = await loadClaudeCodeSdk({ importer });

    expect(sdk.deleteSession).toBeUndefined();
  });
});
