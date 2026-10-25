import type { StreamChunk } from '../../../../../../src/core/types';
import { PermissionInlineCardRenderer } from '../../../../../../src/features/chat/runtime/rendering/PermissionInlineCardRenderer';
import type { StreamingInlineCardRenderer } from '../../../../../../src/features/chat/runtime/rendering/StreamingInlineCardRenderer';

type PermissionChunk = Extract<StreamChunk, { type: 'permission_request' }>;
type PermissionReply = Parameters<Parameters<PermissionInlineCardRenderer['collectAndRespond']>[2]>[1];

function request(id: string, permission = 'shell'): PermissionChunk {
  return { type: 'permission_request', id, sessionID: 'session-1', permission, patterns: [], metadata: {}, always: [] };
}

function rendererWithCardLog(): { renderer: PermissionInlineCardRenderer; cards: HTMLElement[] } {
  const cards: HTMLElement[] = [];
  const host = {
    createStreamingInlineCard: () => {
      const card = document.createElement('div');
      document.body.appendChild(card);
      cards.push(card);
      return card;
    },
  } as unknown as StreamingInlineCardRenderer;
  return { renderer: new PermissionInlineCardRenderer(host), cards };
}

function detachCards(): void {
  for (const card of Array.from(document.body.children)) card.remove();
}

async function clickAction(action: string): Promise<void> {
  const button = document.querySelector(`[data-permission-action="${action}"]`) as HTMLButtonElement | null;
  if (!button) throw new Error(`permission button "${action}" was not rendered`);
  button.click();
  await Promise.resolve();
}

describe('permission card session memory', () => {
  afterEach(() => { detachCards(); });

  it('auto-approves repeated requests for the rest of the session after an "always" click', async () => {
    const { renderer, cards } = rendererWithCardLog();
    const respond = jest.fn(async () => {});
    const first = renderer.collectAndRespond(request('p1'), null, respond as unknown as (id: string, reply: PermissionReply) => Promise<void>);
    await clickAction('always');
    await first;
    expect(respond).toHaveBeenCalledWith('p1', 'always');
    expect(cards).toHaveLength(1);

    respond.mockClear();
    await renderer.collectAndRespond(request('p2'), null, respond as unknown as (id: string, reply: PermissionReply) => Promise<void>);
    // No second card: the session tracker answers an identical tool directly.
    expect(cards).toHaveLength(1);
    expect(respond).toHaveBeenCalledWith('p2', 'always');
  });

  it('keeps the same memory for "session" clicks but does not memorize "once"', async () => {
    const { renderer, cards } = rendererWithCardLog();
    const respond = jest.fn(async () => {});
    const sessionTurn = renderer.collectAndRespond(request('p1'), null, respond as unknown as (id: string, reply: PermissionReply) => Promise<void>);
    await clickAction('session');
    await sessionTurn;
    respond.mockClear();
    await renderer.collectAndRespond(request('p2'), null, respond as unknown as (id: string, reply: PermissionReply) => Promise<void>);
    expect(cards).toHaveLength(1);
    expect(respond).toHaveBeenCalledWith('p2', 'always');

    // A different tool approved "once" must still prompt on its next request.
    respond.mockClear();
    const onceTurn = renderer.collectAndRespond(request('p3', 'edit'), null, respond as unknown as (id: string, reply: PermissionReply) => Promise<void>);
    await clickAction('once');
    await onceTurn;
    expect(respond).toHaveBeenCalledWith('p3', 'once');
    respond.mockClear();
    const repeat = renderer.collectAndRespond(request('p4', 'edit'), null, respond as unknown as (id: string, reply: PermissionReply) => Promise<void>);
    await Promise.resolve();
    // p1's card, p3's card, and now a fresh prompt for the un-memorized tool.
    expect(cards).toHaveLength(3);
    expect(respond).not.toHaveBeenCalled();
    await clickAction('reject');
    await repeat;
    expect(respond).toHaveBeenCalledWith('p4', 'reject');
  });

  it('does not memorize an approval whose backend reply failed', async () => {
    const { renderer, cards } = rendererWithCardLog();
    const failing = jest.fn(async () => { throw new Error('native reply failed'); });
    const failedTurn = renderer.collectAndRespond(request('p1'), null, failing as unknown as (id: string, reply: PermissionReply) => Promise<void>);
    await clickAction('always');
    await expect(failedTurn).rejects.toThrow('native reply failed');

    // The approval was never accepted, so the identical next request prompts again.
    const respond = jest.fn(async () => {});
    const retry = renderer.collectAndRespond(request('p2'), null, respond as unknown as (id: string, reply: PermissionReply) => Promise<void>);
    await clickAction('reject');
    await retry;
    expect(cards).toHaveLength(2);
    expect(respond).toHaveBeenCalledWith('p2', 'reject');
    expect(respond).not.toHaveBeenCalledWith('p2', 'always');
  });
});
