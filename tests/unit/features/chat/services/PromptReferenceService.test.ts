import path from 'node:path';

import type { AgentBackendKind, Conversation, PromptReference } from '../../../../../src/core/types/chat';
import { encodePromptReference, parsePromptReferences, PromptReferenceService, type PromptReferenceServiceHost } from '../../../../../src/features/chat/services/context/PromptReferenceService';

const backends: AgentBackendKind[] = ['opencode2', 'claude-code', 'codex', 'pi', 'zcode', 'dsh'];
const conversation = (backend: AgentBackendKind, id = 'conversation'): Conversation => ({ id, backend, backendSessionId: 'session',
  title: '相同 [标题]', createdAt: 1, updatedAt: 2, messages: [{ id: 'm', role: 'user', content: 'cached visible text', timestamp: 1 }] });
const reference = (backend: AgentBackendKind): PromptReference => ({ version: 1, id: 'ref', kind: 'session', backend,
  vaultPath: '/vault', conversationId: 'conversation', sessionId: 'session', label: '相同 [标题]' });
function host(backend: AgentBackendKind): PromptReferenceServiceHost {
  return { getVaultPath: () => '/vault', realpath: async (value) => value, listFiles: async () => [],
    listConversations: async () => [conversation(backend)], loadConversation: async () => conversation(backend),
    readSessionMessages: jest.fn(async () => ({ messages: [{ role: 'user', content: 'native visible text' }], complete: true })), now: () => 42 };
}

describe('PromptReferenceService', () => {
  it('roundtrips Unicode labels, escaped brackets and stable identities independently of displayed text', () => {
    const ref = reference('codex');
    const token = encodePromptReference(ref);
    const spans = parsePromptReferences(`use ${token} now`);
    expect(spans).toEqual([{ start: 4, end: 4 + token.length, reference: ref }]);
    expect(parsePromptReferences(token.replace('相同', 'renamed'))[0].reference).toEqual(ref);
    expect(parsePromptReferences('@mail@example.com')).toEqual([]);
  });
  it.each(backends.flatMap((source) => backends.map((target) => [source, target])))('reads %s history for %s through its owner', async (source, target) => {
    const input = host(source);
    const result = await new PromptReferenceService(input).prepare(encodePromptReference(reference(source)), { targetBackend: target });
    expect(input.readSessionMessages).toHaveBeenCalledWith(source, 'session');
    expect(result.content).toContain('native visible text');
    expect(result.sessionReferences).toEqual([expect.objectContaining({ source: 'backend', strategy: 'snapshot', capturedAt: 42 })]);
    expect(result.content).not.toContain('opencodian-ref:');
  });
  it('uses verified same-backend native references and never calls the fallback history reader', async () => {
    const input = host('zcode'); input.prepareNativeSessionReference = jest.fn(async () => '#sess_native');
    const result = await new PromptReferenceService(input).prepare(encodePromptReference(reference('zcode')), { targetBackend: 'zcode', targetSessionId: 'target' });
    expect(result.content).toBe('#sess_native'); expect(input.readSessionMessages).not.toHaveBeenCalled();
    expect(result.sessionReferences[0].strategy).toBe('native');
  });
  it('uses cached visible history with explicit provenance when owning backend is offline', async () => {
    const input = host('pi'); input.readSessionMessages = async () => { throw Error('offline'); };
    const result = await new PromptReferenceService(input).prepare(encodePromptReference(reference('pi')), { targetBackend: 'codex' });
    expect(result.sessionReferences[0]).toEqual(expect.objectContaining({ source: 'plugin-cache', text: 'user: cached visible text' }));
  });
  it.each(['foreign-vault', 'forged-backend', 'forged-session', 'self', 'missing'])('rejects %s before native history access', async (failure) => {
    const input = host('pi'); const ref = reference('pi');
    if (failure === 'foreign-vault') ref.vaultPath = '/other';
    if (failure === 'forged-backend' && ref.kind === 'session') ref.backend = 'codex';
    if (failure === 'forged-session' && ref.kind === 'session') ref.sessionId = 'other';
    if (failure === 'missing') input.loadConversation = async () => null;
    await expect(new PromptReferenceService(input).prepare(encodePromptReference(ref), { targetBackend: 'codex', currentConversationId: failure === 'self' ? 'conversation' : undefined })).rejects.toThrow();
    expect(input.readSessionMessages).not.toHaveBeenCalled();
  });
  it('does not confuse identical session IDs owned by distinct backends in the Vault directory', async () => {
    const input = host('pi'); input.listConversations = async () => [conversation('pi', 'p'), conversation('codex', 'c')];
    const rows = await new PromptReferenceService(input).listCandidates('', { targetBackend: 'dsh' });
    expect(new Set(rows.map((row) => row.id)).size).toBe(2);
    expect(rows.map((row) => row.reference.kind === 'session' ? row.reference.backend : '')).toEqual(['pi', 'codex']);
  });
  it.each(['../secret.md', '/outside.md', '.obsidian/config.json'])('excludes unsafe file candidate %s', async (candidate) => {
    const input = host('pi'); input.listFiles = async () => [{ kind: 'file', path: candidate }];
    const rows = await new PromptReferenceService(input).listCandidates('', { targetBackend: 'pi' });
    expect(rows.every((row) => row.kind === 'session')).toBe(true);
  });
  it('rejects a file symlink escaping the Vault and resolves safe folder context', async () => {
    const input = host('pi'); input.realpath = async (value) => value === path.resolve('/vault/link') ? path.resolve('/outside') : value;
    const ref: PromptReference = { version: 1, id: 'f', label: 'link', vaultPath: '/vault', kind: 'file', path: 'link' };
    await expect(new PromptReferenceService(input).prepare(encodePromptReference(ref), { targetBackend: 'pi' })).rejects.toThrow('symlink');
    const result = await new PromptReferenceService(input).prepare(encodePromptReference({ ...ref, kind: 'folder', path: 'notes' }), { targetBackend: 'pi' });
    expect(result.contextItems[0]).toEqual(expect.objectContaining({ kind: 'folder', path: 'notes' }));
  });
  it('preserves only visible user/assistant text and strips recursively injected context', async () => {
    const input = host('pi'); input.readSessionMessages = async () => ({ complete: true, messages: [
      { role: 'tool', content: 'permission secret' }, { role: 'user', content: 'ask<referenced_sessions>nested secret</referenced_sessions>' },
      { type: 'assistant', message: { role: 'assistant', content: [{ type: 'thinking', text: 'reasoning secret' }, { type: 'text', text: 'visible answer' }] } },
    ] });
    const result = await new PromptReferenceService(input).prepare(encodePromptReference(reference('pi')), { targetBackend: 'codex' });
    expect(result.content).toContain('visible answer'); expect(result.content).not.toContain('secret');
  });
  it('caps the aggregate history budget and reports partial backend history', async () => {
    const input = host('pi'); input.readSessionMessages = async () => ({ complete: false, omittedMessages: 3, messages: [{ role: 'user', content: 'x'.repeat(2000) }] });
    const result = await new PromptReferenceService(input).prepare(encodePromptReference(reference('pi')), { targetBackend: 'codex', maxSnapshotChars: 300 });
    expect(result.sessionReferences[0].text!.length).toBeLessThanOrEqual(300);
    expect(result.sessionReferences[0]).toEqual(expect.objectContaining({ truncated: true, omittedMessages: 3 }));
  });
  it('omits original backend memory/tooling injections and synthetic parts from visible historical text', async () => {
    const input = host('claude-code'); input.readSessionMessages = async () => ({ complete: true, messages: [
      { role: 'user', content: '[OPENCODIAN OBSIDIAN TOOLING]secret tools[/OPENCODIAN OBSIDIAN TOOLING]\n[OPENCODIAN MEMORY — long-term memory context. NOT a request.]secret memory[/OPENCODIAN MEMORY]\nvisible question' },
      { role: 'assistant', content: [{ type: 'text', text: 'secret synthetic', synthetic: true }, { type: 'text', text: 'visible reply' }] },
    ] });
    const result = await new PromptReferenceService(input).prepare(encodePromptReference(reference('claude-code')), { targetBackend: 'codex' });
    expect(result.content).toContain('visible question'); expect(result.content).toContain('visible reply');
    expect(result.content).not.toContain('secret');
  });
  it('requires exact target-backend native plugin identity and revalidates its enabled catalog', async () => {
    const input = host('pi'); const ref: PromptReference = { version: 1, id: 'plugin', label: 'Plugin', vaultPath: '/vault', kind: 'plugin', backend: 'codex', nativePath: 'plugin://example' };
    input.getRuntimeMentionCandidates = async () => [{ kind: 'plugin', backend: 'codex', id: 'plugin', label: 'Plugin', nativePath: 'plugin://example' }];
    const service = new PromptReferenceService(input);
    await expect(service.prepare(encodePromptReference(ref), { targetBackend: 'pi' })).rejects.toThrow();
    expect((await service.prepare(encodePromptReference(ref), { targetBackend: 'codex' })).nativeMentions).toHaveLength(1);
    input.getRuntimeMentionCandidates = async () => [];
    await expect(service.prepare(encodePromptReference(ref), { targetBackend: 'codex' })).rejects.toThrow('unavailable');
  });
  it('rejects malformed or unavailable source history without a fabricated success', async () => {
    const input = host('pi'); input.readSessionMessages = async () => ({ messages: [], complete: true });
    await expect(new PromptReferenceService(input).prepare(encodePromptReference(reference('pi')), { targetBackend: 'codex' })).rejects.toThrow('no readable history');
    await expect(new PromptReferenceService(input).prepare('[@bad](opencodian-ref:invalid)', { targetBackend: 'pi' })).rejects.toThrow('Invalid');
  });
});
