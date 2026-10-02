import { PiAdapter } from '../../../../../../src/core/agents/backend/pi/PiAdapter';
import { normalizePiBackendSettings } from '../../../../../../src/core/types/settings';

function adapter() { return new PiAdapter({ workingDirectory: 'C:/offline-fixture' }); }
afterEach(() => jest.restoreAllMocks());
it('preserves max through plugin Pi settings normalization', () => {
  expect(normalizePiBackendSettings({ thinkingLevel: ' max ', provider: 'fixture', model: 'fixture' }).thinkingLevel).toBe('max');
  expect(normalizePiBackendSettings({ thinkingLevel: 'unknown' }).thinkingLevel).toBe('');
});
it('reads dynamic levels through the existing command and retains max/new SDK strings', async () => {
  const pi = adapter(); const command = jest.spyOn(pi, 'command').mockResolvedValue({ levels: ['off', 'max', 'future-level'] });
  expect(await pi.getAvailableThinkingLevels('pi-local')).toEqual({ levels: ['off', 'max', 'future-level'] });
  expect(command).toHaveBeenCalledWith('pi-local', 'get_available_thinking_levels');
});
it('preserves native IDs, leaf and opaque entry fields with an explicit since', async () => {
  const pi = adapter(); const result = { entries: [{ id: 'native-next', parentId: 'native-before', type: 'custom', opaque: { future: true } }], leafId: 'native-next' };
  const command = jest.spyOn(pi, 'command').mockResolvedValue(result);
  expect(await pi.getSessionEntries('pi-local', 'native-before')).toBe(result);
  expect(command).toHaveBeenCalledWith('pi-local', 'get_entries', { since: 'native-before' });
});
it('omits absent since and preserves an empty native history with null leaf', async () => {
  const pi = adapter(); const command = jest.spyOn(pi, 'command').mockResolvedValue({ entries: [], leafId: null });
  expect(await pi.getSessionEntries('pi-local')).toEqual({ entries: [], leafId: null });
  expect(command).toHaveBeenCalledWith('pi-local', 'get_entries', {});
});
it.each(['levels', 'entries'])('does not translate unavailable %s into guessed data', async read => {
  const pi = adapter(); const unavailable = { command: read === 'levels' ? 'get_available_thinking_levels' : 'get_entries', status: 'unavailable', reason: 'Installed SDK lacks this method' };
  jest.spyOn(pi, 'command').mockResolvedValue(unavailable);
  expect(await (read === 'levels' ? pi.getAvailableThinkingLevels('pi-local') : pi.getSessionEntries('pi-local'))).toEqual(unavailable);
});
it.each(['levels', 'entries'])('propagates command failure for %s', async read => {
  const pi = adapter(); jest.spyOn(pi, 'command').mockRejectedValue(new Error('No session or request failure'));
  await expect(read === 'levels' ? pi.getAvailableThinkingLevels('missing') : pi.getSessionEntries('missing')).rejects.toThrow('No session');
});
it.each([{ levels: [1] }, { levels: null }])('rejects malformed levels %p', async response => {
  const pi = adapter(); jest.spyOn(pi, 'command').mockResolvedValue(response);
  await expect(pi.getAvailableThinkingLevels()).rejects.toThrow('Invalid Pi thinking');
});
it.each([{ entries: [], leafId: 42 }, { entries: null, leafId: null }])('rejects malformed entries %p', async response => {
  const pi = adapter(); jest.spyOn(pi, 'command').mockResolvedValue(response);
  await expect(pi.getSessionEntries('pi-local')).rejects.toThrow('Invalid Pi entries');
});

it('rejects missing local session handles before issuing entries RPC', async () => {
  const pi = adapter(); const command = jest.spyOn(pi, 'command');
  await expect(pi.getSessionEntries('')).rejects.toThrow('session is required');
  expect(command).not.toHaveBeenCalled();
});
it('rejects entries without native identity rather than inventing IDs', async () => {
  const pi = adapter(); jest.spyOn(pi, 'command').mockResolvedValue({ entries: [{ content: 'missing ID' }], leafId: null });
  await expect(pi.getSessionEntries('pi-local')).rejects.toThrow('Invalid Pi entries');
});
