import { createHash } from 'node:crypto';

import type { DshJsonObject } from '../../../../../src/core/agents/backend/dsh/DshAcpClient';
import { DshAuxQuerySession } from '../../../../../src/core/agents/backend/dsh/DshAuxQuerySession';

const config = { systemPrompt: 'Rewrite only.', workingDirectory: '/vault' };
const proof = { effectiveTools: [], persistence: false, toolDispatcher: false, toolChoice: 'none',
  systemPromptSha256: createHash('sha256').update(config.systemPrompt).digest('hex') };

function fixture(readback: DshJsonObject = {}) {
  const listeners = new Map<string, (text: string) => void>();
  const request = jest.fn(async (method: string, _params: DshJsonObject): Promise<DshJsonObject> => {
    if (method === 'aux/new') return { queryId: 'native-aux', supportsImages: true, ...proof, ...readback };
    if (method === 'aux/query') {
      listeners.get('native-aux')?.('part');
      return { text: 'answer', toolCalls: [], nativeProof: proof };
    }
    return {};
  });
  const subscribe = (id: string, handler: (text: string) => void) => { listeners.set(id, handler); return () => listeners.delete(id); };
  return { request, subscribe, listeners };
}

describe('DshAuxQuerySession', () => {
  it.each([{ effectiveTools: ['write'] }, { persistence: true }, { toolDispatcher: true }, { queryId: '' }])(
    'rejects an unsafe native proof %j', async (readback) => {
      const f = fixture(readback);
      await expect(DshAuxQuerySession.create(config, f.request, f.subscribe)).rejects.toThrow('prove');
    });

  it('preserves native model identity, streams, and separates a new query from follow-up', async () => {
    const f = fixture();
    const session = await DshAuxQuerySession.create({ ...config, model: { kind: 'dsh', provider: 'deepseek-official',
      model: '["deepseek-official","deepseek-flash"]' } }, f.request, f.subscribe);
    expect(f.request).toHaveBeenCalledWith('aux/new', expect.objectContaining({ model: { provider: 'deepseek-official', model: 'deepseek-flash' } }));
    expect(session.safety.effectiveTools).toEqual([]);
    const onTextChunk = jest.fn();
    await expect(session.query({ prompt: 'first', onTextChunk })).resolves.toEqual({ success: true, text: 'answer', toolCalls: [] });
    expect(onTextChunk).toHaveBeenCalledWith('part');
    await session.followUp('second');
    expect(f.request.mock.calls.filter(([method]) => method === 'aux/query').map(([, params]) => params.resetContext)).toEqual([true, false]);
    expect(f.listeners.size).toBe(0);
    await session.dispose(); await session.dispose();
    expect(f.request.mock.calls.filter(([method]) => method === 'aux/close')).toHaveLength(1);
    await expect(session.query({ prompt: 'late' })).resolves.toMatchObject({ success: false });
  });

  it('transports images and rejects absent per-turn enforcement readback', async () => {
    const f = fixture();
    const session = await DshAuxQuerySession.create(config, f.request, f.subscribe);
    const image = { mediaType: 'image/png' as const, data: 'AAAA' };
    await session.query({ prompt: 'image', images: [image] });
    expect(f.request).toHaveBeenCalledWith('aux/query', expect.objectContaining({ images: [image] }), expect.any(Number));
    f.request.mockImplementation(async (method) => method === 'aux/query' ? { text: 'unproven', toolCalls: [] } : {});
    await expect(session.query({ prompt: 'unsafe' })).resolves.toMatchObject({ success: false, error: expect.stringContaining('unsafe') });
    await session.dispose();
  });

  it('cancels an in-flight native query and removes the listener', async () => {
    const f = fixture();
    let fail!: (error: Error) => void;
    f.request.mockImplementation(async (method) => method === 'aux/new' ? { queryId: 'native-aux', ...proof }
      : method === 'aux/query' ? new Promise((_, reject) => { fail = reject; })
        : (fail?.(new Error('native aborted')), {}));
    const session = await DshAuxQuerySession.create(config, f.request, f.subscribe);
    const controller = new AbortController();
    const running = session.query({ prompt: 'cancel', signal: controller.signal });
    controller.abort();
    await expect(running).resolves.toMatchObject({ success: false, cancelled: true });
    expect(f.listeners.size).toBe(0); await session.dispose();
  });
});
