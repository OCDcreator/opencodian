import { loadClaudeCodeSdk } from '../../../../../src/core/agents/backend';

describe('ClaudeCodeSdkLoader', () => {
  it('loads an SDK query facade through the injectable importer', async () => {
    const query = jest.fn();
    const importer = jest.fn(async () => ({ query }));
    const sdk = await loadClaudeCodeSdk({ importer });

    expect(typeof sdk.query).toBe('function');
    sdk.query({ prompt: 'hello', options: { cwd: '/vault', includePartialMessages: true, settingSources: [] } });
    expect(importer).toHaveBeenCalledWith();
    expect(query).toHaveBeenCalledWith({
      prompt: 'hello',
      options: { cwd: '/vault', includePartialMessages: true, settingSources: [] },
    });
  });
});
