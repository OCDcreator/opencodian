import { AgentCapability } from '../../../../../src/core/agents/AgentCapability';
import { AUX_DENIED_CAPABILITIES } from '../../../../../src/core/agents/backend/AgentAuxQueryCapability';
import type { AgentBackendKind, Conversation } from '../../../../../src/core/types/chat';
import { DEFAULT_SETTINGS } from '../../../../../src/core/types/settings';
import { TitleGenerationService } from '../../../../../src/features/chat/services/title/TitleGenerationService';

const backends = ['opencode2', 'claude-code', 'codex', 'pi', 'zcode', 'dsh'] as const;
const options = { officialPollAttempts: 1, officialPollIntervalMs: 0, lateOfficialPollAttempts: 0 };

function harness(backend: AgentBackendKind = 'pi') {
  const conversation: Conversation = {
    id: 'conversation', backend, backendSessionId: 'native-session', title: 'New conversation',
    createdAt: 1, updatedAt: 1, messages: [],
  };
  const session = {
    queryId: 'title-query',
    safety: { backend, enforcedPolicy: 'none', effectiveTools: [] as string[], deniedCapabilities: [...AUX_DENIED_CAPABILITIES] },
    query: jest.fn().mockResolvedValue({ success: true, text: '{"title":"Auxiliary title"}', toolCalls: [] }),
    cancel: jest.fn(), dispose: jest.fn().mockResolvedValue(undefined),
  };
  const adapter = {
    kind: backend,
    hasCapability: (cap: AgentCapability) => cap === AgentCapability.Sessions || cap === AgentCapability.AuxQuery,
    getSession: jest.fn().mockResolvedValue(null), updateSessionTitle: jest.fn().mockResolvedValue(undefined),
    startAuxQuerySession: jest.fn().mockResolvedValue(session), generateTitle: jest.fn().mockResolvedValue('Auxiliary title'),
    getModelSelectorProviders: jest.fn().mockResolvedValue([{ id: 'provider-a', models: [{ id: 'haiku-small' }] }]),
    supportedModels: jest.fn().mockResolvedValue([{ id: 'haiku-small' }]),
    getModelList: jest.fn().mockResolvedValue([{ slug: 'haiku-small' }]),
  };
  const plugin = {
    settings: { ...DEFAULT_SETTINGS, aiTitleModel: '', locale: 'en' },
    agentServiceRegistry: { get: jest.fn((kind: AgentBackendKind) => kind === backend ? adapter : undefined) },
    modelConfigService: { getCatalogs: jest.fn() },
    openCodeService: { createSession: jest.fn(), requestAssistantResponse: jest.fn(), deleteSession: jest.fn() },
    getConversationById: jest.fn().mockImplementation(async () => conversation),
    saveConversation: jest.fn().mockResolvedValue(undefined),
    generateDefaultTitle: (message: string) => message.slice(0, 50),
  };
  const service = new TitleGenerationService(plugin as never, '/test/vault');
  const callback = jest.fn().mockResolvedValue(undefined);
  const generate = (extra = {}) => service.generateTitle(conversation.id, 'First prompt', { provider: 'provider-a', model: 'large-chat' }, callback, { ...options, ...extra });
  return { service, conversation, plugin, adapter, session, callback, generate };
}

describe('six-backend title execution', () => {
  it.each(backends)('prefers a native %s title without an auxiliary request or legacy session', async (backend) => {
    const h = harness(backend);
    h.adapter.getSession.mockResolvedValue(backend === 'claude-code' ? { summary: 'Native title' } : { title: 'Native title' });
    await h.generate();
    expect(h.callback).toHaveBeenCalledWith('conversation', { success: true, title: 'Native title', source: 'native' });
    expect(h.adapter.startAuxQuerySession).not.toHaveBeenCalled();
    expect(h.adapter.generateTitle).not.toHaveBeenCalled();
    expect(h.plugin.openCodeService.createSession).not.toHaveBeenCalled();
  });

  it.each(backends)('uses the owning %s backend and a same-provider lightweight model', async (backend) => {
    const h = harness(backend);
    await h.generate();
    expect(h.callback).toHaveBeenCalledWith('conversation', {
      success: true, title: 'Auxiliary title', source: 'ai',
      model: { provider: 'provider-a', model: 'haiku-small' }, modelSource: 'lightweight',
    });
    expect(h.adapter.generateTitle).toHaveBeenCalledTimes(backend === 'opencode2' ? 1 : 0);
    expect(h.adapter.startAuxQuerySession).toHaveBeenCalledTimes(backend === 'opencode2' ? 0 : 1);
    const requested = backend === 'opencode2'
      ? { kind: backend, provider: h.adapter.generateTitle.mock.calls[0][1], model: h.adapter.generateTitle.mock.calls[0][2] }
      : h.adapter.startAuxQuerySession.mock.calls[0][0].model;
    expect(requested).toEqual(expect.objectContaining({ kind: backend, model: 'haiku-small' }));
    expect(h.session.dispose).toHaveBeenCalledTimes(backend === 'opencode2' ? 0 : 1);
    expect(h.plugin.openCodeService.createSession).not.toHaveBeenCalled();
  });

  it.each(['新对话', 'New Pi chat', 'New session - 2026-01-01T00:00:00.000Z', 'First prompt'])('rejects placeholder/first-input readback %s', async (title) => {
    const h = harness('claude-code');
    h.adapter.getSession.mockResolvedValue({ summary: title });
    await h.generate();
    expect(h.adapter.startAuxQuerySession).toHaveBeenCalled();
    expect(h.callback).toHaveBeenCalledWith('conversation', expect.objectContaining({ source: 'ai' }));
  });

  it('consumes and validates OpenCode 2 dedicated title models against its own catalog', async () => {
    const h = harness('opencode2');
    h.plugin.settings.aiTitleModel = 'provider-a/haiku-small';
    await h.generate();
    expect(h.adapter.generateTitle).toHaveBeenCalledWith(expect.any(String), 'provider-a', 'haiku-small', expect.any(AbortSignal));
    expect(h.plugin.modelConfigService.getCatalogs).not.toHaveBeenCalled();
    expect(h.callback).toHaveBeenCalledWith('conversation', expect.objectContaining({ modelSource: 'configured' }));
  });

  it('fails an unavailable explicit model without switching providers or invoking a model', async () => {
    const h = harness('opencode2');
    h.plugin.settings.aiTitleModel = 'provider-b/missing';
    await h.generate();
    expect(h.callback).toHaveBeenCalledWith('conversation', { success: false, error: 'Configured AI title model is unavailable' });
    expect(h.adapter.generateTitle).not.toHaveBeenCalled();
  });

  it.each(['capability', 'proof', 'tools', 'empty', 'failure'] as const)('keeps failures honest for %s', async (failure) => {
    const h = harness();
    if (failure === 'capability') h.adapter.hasCapability = (cap) => cap === AgentCapability.Sessions;
    if (failure === 'proof') h.session.safety.deniedCapabilities = [];
    if (failure === 'tools') h.session.query.mockResolvedValue({ success: true, text: 'Unsafe', toolCalls: [{ name: 'bash' }] });
    if (failure === 'empty') h.session.query.mockResolvedValue({ success: true, text: '', toolCalls: [] });
    if (failure === 'failure') h.session.query.mockResolvedValue({ success: false, error: 'provider offline' });
    await h.generate();
    expect(h.callback).toHaveBeenCalledWith('conversation', expect.objectContaining({ success: false }));
    expect(h.conversation.title).toBe('New conversation');
    expect(h.session.dispose).toHaveBeenCalledTimes(failure === 'capability' ? 0 : 1);
  });

  it('accepts a native title that arrives during auxiliary generation', async () => {
    const h = harness('zcode');
    h.adapter.getSession.mockResolvedValueOnce({ title: 'First prompt', titleSource: 'first_input' })
      .mockResolvedValue({ title: 'Late native title', titleSource: 'generated' });
    await h.generate();
    expect(h.callback).toHaveBeenCalledWith('conversation', { success: true, title: 'Late native title', source: 'native' });
  });

  it('allows a slow native title to replace the rule after an auxiliary failure', async () => {
    const h = harness('zcode');
    h.session.query.mockResolvedValue({ success: false, error: 'offline' });
    h.adapter.getSession.mockResolvedValueOnce(null).mockResolvedValue({ title: 'Delayed native title' });
    await h.generate({ lateOfficialPollAttempts: 1 });
    expect(h.callback.mock.calls.map((call) => call[1])).toEqual([
      { success: false, error: 'offline' }, { success: true, title: 'Delayed native title', source: 'native' },
    ]);
  });
});

describe('title concurrency and persistence', () => {
  afterEach(() => jest.useRealTimers());

  it('times out, cancels and disposes an unresponsive auxiliary session', async () => {
    jest.useFakeTimers();
    const h = harness();
    h.session.query.mockImplementation(() => new Promise(() => undefined));
    const pending = h.generate({ aiTimeoutMs: 25 });
    await jest.advanceTimersByTimeAsync(30);
    await pending;
    expect(h.callback).toHaveBeenCalledWith('conversation', { success: false, error: 'Title generation timed out' });
    expect(h.session.cancel).toHaveBeenCalled();
    expect(h.session.dispose).toHaveBeenCalled();
  });

  it('keeps replacement generations cancellable after the old task finishes', async () => {
    jest.useFakeTimers();
    const h = harness();
    h.session.query.mockImplementation(() => new Promise(() => undefined));
    const first = h.generate();
    await jest.advanceTimersByTimeAsync(1);
    const second = h.generate();
    await jest.advanceTimersByTimeAsync(1);
    await first;
    h.service.cancelConversation('conversation');
    await second;
    expect(h.callback).not.toHaveBeenCalled();
    expect(h.session.query.mock.calls.every(([request]) => request.signal.aborted)).toBe(true);
  });

  it('disposes a session whose startup finishes after the deadline', async () => {
    jest.useFakeTimers();
    const h = harness();
    let finishStartup!: (session: typeof h.session) => void;
    h.adapter.startAuxQuerySession.mockImplementation(() => new Promise((resolve) => { finishStartup = resolve; }));
    const pending = h.generate({ aiTimeoutMs: 20 });
    await jest.advanceTimersByTimeAsync(25);
    await pending;
    finishStartup(h.session);
    await jest.advanceTimersByTimeAsync(1);
    expect(h.session.query).not.toHaveBeenCalled();
    expect(h.session.dispose).toHaveBeenCalled();
  });

  it('writes rule titles locally, accepts native metadata, and never renames native sessions for either', async () => {
    const h = harness();
    const rule = h.service.createFallbackUpdate(h.conversation, 'Rule title')!;
    await h.service.persistUpdate('conversation', rule, false);
    expect(h.conversation.titleState).toEqual({ source: 'rule', revision: 1 });
    const native = h.service.createGeneratedUpdate(h.conversation, 1, { success: true, title: 'Native title', source: 'native' })!;
    await h.service.persistUpdate('conversation', native, false);
    expect(h.plugin.saveConversation).toHaveBeenCalledTimes(2);
    expect(h.adapter.updateSessionTitle).not.toHaveBeenCalled();
  });

  it('protects manual titles, even when identical to the previous rule title', async () => {
    const h = harness();
    await h.service.persistUpdate('conversation', h.service.createFallbackUpdate(h.conversation, 'Same title')!, false);
    const stale = h.service.createGeneratedUpdate(h.conversation, 1, { success: true, title: 'AI title', source: 'ai' })!;
    await h.service.persistUpdate('conversation', { title: 'Same title' }, true);
    await h.service.persistUpdate('conversation', stale, false);
    expect(h.conversation.title).toBe('Same title');
    expect(h.conversation.titleState).toEqual({ source: 'manual', revision: 2 });
    expect(h.adapter.updateSessionTitle).toHaveBeenCalledWith('native-session', 'Same title');
    expect(h.service.createGeneratedUpdate(h.conversation, 1, { success: true, title: 'Late', source: 'native' })).toBeNull();
  });

  it('retains the rule title and failure status, and creates a new revision on explicit retry', async () => {
    const h = harness();
    await h.service.persistUpdate('conversation', h.service.createFallbackUpdate(h.conversation, 'Rule title')!, false);
    await h.service.persistUpdate('conversation', h.service.createGeneratedUpdate(h.conversation, 1, { success: false, error: 'offline' })!, false);
    expect(h.conversation).toEqual(expect.objectContaining({ title: 'Rule title', titleGenerationStatus: 'failed', titleState: { source: 'rule', revision: 1, error: 'offline' } }));
    await h.service.persistUpdate('conversation', h.service.createRetryUpdate(h.conversation)!, false);
    expect(h.conversation.titleState).toEqual({ source: 'rule', revision: 2 });
    expect(h.conversation.titleGenerationStatus).toBe('pending');
  });

  it('serializes a slow AI rename before the newer manual rename', async () => {
    jest.useFakeTimers();
    const h = harness();
    await h.service.persistUpdate('conversation', h.service.createFallbackUpdate(h.conversation, 'Rule')!, false);
    let finishAiRename!: () => void;
    h.adapter.updateSessionTitle.mockImplementationOnce(() => new Promise<void>((resolve) => { finishAiRename = resolve; }));
    const ai = h.service.persistUpdate('conversation', h.service.createGeneratedUpdate(h.conversation, 1, { success: true, title: 'AI title', source: 'ai' })!, false);
    await jest.advanceTimersByTimeAsync(1);
    const manual = h.service.persistUpdate('conversation', { title: 'Manual title' }, true);
    await jest.advanceTimersByTimeAsync(1);
    finishAiRename();
    await Promise.all([ai, manual]);
    await jest.advanceTimersByTimeAsync(1);
    expect(h.adapter.updateSessionTitle.mock.calls).toEqual([['native-session', 'AI title'], ['native-session', 'Manual title']]);
    expect(h.conversation.title).toBe('Manual title');
  });

  it('serializes local persistence so an older delayed AI save cannot overwrite a manual title', async () => {
    jest.useFakeTimers();
    const h = harness();
    await h.service.persistUpdate('conversation', h.service.createFallbackUpdate(h.conversation, 'Rule')!, false);
    let finishOldSave!: () => void;
    const savedTitles: string[] = [];
    h.plugin.saveConversation.mockImplementationOnce(async (conversation: Conversation) => {
      savedTitles.push(conversation.title);
      await new Promise<void>((resolve) => { finishOldSave = resolve; });
    }).mockImplementation(async (conversation: Conversation) => { savedTitles.push(conversation.title); });
    const ai = h.service.persistUpdate('conversation', h.service.createGeneratedUpdate(h.conversation, 1, { success: true, title: 'AI', source: 'ai' })!, false);
    await jest.advanceTimersByTimeAsync(1);
    const manual = h.service.persistUpdate('conversation', { title: 'Manual' }, true);
    await jest.advanceTimersByTimeAsync(1);
    expect(savedTitles).toEqual(['AI']);
    finishOldSave();
    await Promise.all([ai, manual]);
    expect(savedTitles).toEqual(['AI', 'Manual']);
    expect(h.conversation.titleState?.source).toBe('manual');
  });

  it('preserves imported titles and manual provenance on bootstrap', () => {
    const h = harness();
    h.conversation.title = 'Imported native title';
    expect(h.service.createFallbackUpdate(h.conversation, 'First local message')).toEqual({ titleState: { source: 'native', revision: 1 }, titleGenerationStatus: undefined });
    h.conversation.titleState = { source: 'manual', revision: 4 };
    expect(h.service.createFallbackUpdate(h.conversation, 'First local message')).toBeNull();
  });

  it('recovers an interrupted reload without repeating a paid model call', async () => {
    const h = harness();
    h.conversation.title = 'Rule';
    h.conversation.titleState = { source: 'rule', revision: 2 };
    h.conversation.titleGenerationStatus = 'pending';
    await h.service.recoverPending(h.conversation);
    expect(h.conversation.titleGenerationStatus).toBe('failed');
    expect(h.conversation.title).toBe('Rule');
    expect(h.adapter.startAuxQuerySession).not.toHaveBeenCalled();
  });

  it('reads a late native title after a turn settles and preserves rule mode', async () => {
    const h = harness('codex');
    h.conversation.title = 'Rule';
    h.conversation.titleState = { source: 'rule', revision: 4 };
    h.adapter.getSession.mockResolvedValue({ title: 'Renamed native thread', titleSource: 'native' });
    await expect(h.service.readNativeTitleUpdate('conversation')).resolves.toBeNull();
    h.conversation.titleGenerationStatus = 'failed';
    const update = await h.service.readNativeTitleUpdate('conversation');
    await h.service.persistUpdate('conversation', update!, false);
    expect(h.conversation.title).toBe('Renamed native thread');
    expect(h.conversation.titleState).toEqual({ source: 'native', revision: 5 });
    expect(h.adapter.startAuxQuerySession).not.toHaveBeenCalled();
  });
});
