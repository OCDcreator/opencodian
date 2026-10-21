import { disposeCollapsiblesWithin } from '../../../../src/features/chat/rendering/collapsible';
import { resolveToolExecutionStatus } from '../../../../src/shared';
import { StreamController } from '../../../../src/utils/streaming/StreamController';
import { ToolCallRenderer } from '../../../../src/utils/streaming/ToolCallRenderer';
import type { ToolRendererOptions } from '../../../../src/utils/streaming/types';

describe('ToolCallRenderer lifecycle', () => {
  it('releases tool header listeners before a cleared card is rebuilt', () => {
    const parentEl = document.createElement('div');
    const onCollapsibleToggle = jest.fn();
    const renderer = new ToolCallRenderer({ onCollapsibleToggle });
    const toolCall = {
      id: 'tool-rebuild-1',
      name: 'read',
      input: { file_path: 'docs/spec.md' },
      status: 'completed' as const,
      result: 'done',
    };

    const firstToolEl = renderer.render(parentEl, toolCall);
    const firstHeader = firstToolEl.querySelector<HTMLElement>('.streaming-tool-header');
    renderer.cleanup(firstToolEl);
    firstHeader?.click();
    expect(onCollapsibleToggle).not.toHaveBeenCalled();

    parentEl.replaceChildren();
    const secondToolEl = renderer.render(parentEl, { ...toolCall, id: 'tool-rebuild-2' });
    secondToolEl.querySelector<HTMLElement>('.streaming-tool-header')?.click();
    expect(onCollapsibleToggle).toHaveBeenCalledTimes(1);

    disposeCollapsiblesWithin(parentEl);
    secondToolEl.querySelector<HTMLElement>('.streaming-tool-header')?.click();
    expect(onCollapsibleToggle).toHaveBeenCalledTimes(1);
  });
});

describe('interrupted tool-result boundaries', () => {
  it('keeps the local unknown outcome until an authoritative native terminal result is available', () => {
    expect(resolveToolExecutionStatus({ storedStatus: 'interrupted' })).toBe('interrupted');
    expect(resolveToolExecutionStatus({ storedStatus: 'interrupted', state: { status: 'completed', output: 'ok' } })).toBe('completed');
    expect(resolveToolExecutionStatus({ storedStatus: 'interrupted', state: { status: 'error', error: 'native cancelled' } })).toBe('error');
  });

  it('renders interrupted local history without a running spinner or invented tool result', () => {
    const parent = document.body.createDiv();
    const renderer = new ToolCallRenderer();
    renderer.render(parent, { id: 'owned-tool', name: 'Bash', input: { command: 'sleep 90' }, status: 'interrupted' });

    expect(parent.querySelector('.status-interrupted')).not.toBeNull();
    expect(parent.querySelector('.status-running')).toBeNull();
    expect(parent.textContent).toContain('Native tool outcome is unknown');
    expect(parent.textContent).not.toContain('Waiting for result');
  });
});

function cancellationFixture(toolOptions: Partial<ToolRendererOptions> = {}) {
  const containerEl = document.body.createDiv();
  const contentEl = containerEl.createDiv();
  let release!: () => void;
  let entered!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const callbacks = {
    onThinkingStart: jest.fn(), onThinkingEnd: jest.fn(), onTextAppend: jest.fn(),
    onToolCallStart: jest.fn(), onToolCallEnd: jest.fn(), onError: jest.fn(), onDone: jest.fn(),
  };
  const scrollToBottom = jest.fn();
  const onStreamComplete = jest.fn();
  const controller = new StreamController({
    containerEl, markdownService: { render: async (el: HTMLElement, text: string) => {
      entered(); await held; el.textContent = text;
    } } as never, scrollToBottom, onStreamComplete,
  }, toolOptions, { showTimer: false });
  controller.setCallbacks(callbacks);
  controller.startStream(contentEl);
  const counts = () => [...Object.values(callbacks).map((mock) => mock.mock.calls.length),
    scrollToBottom.mock.calls.length, onStreamComplete.mock.calls.length];
  const snapshot = () => JSON.parse(JSON.stringify(controller.getContentBlocks()));
  return { controller, containerEl, contentEl, callbacks, onStreamComplete, release, started, counts, snapshot };
}

const boundaryTool = {
  type: 'tool_use' as const, id: 'boundary-tool', name: 'Bash', kind: 'builtin' as const,
  input: { command: 'owned-control', timeout: 120000, description: 'Owned tool' },
  toolMetadata: { assistantMessageId: 'native-owned' }, resultVisibility: 'visible' as const,
};
const asyncBoundaryCases = (['tool_use', 'thinking', 'error', 'done'] as const).flatMap((handler) =>
  (['flush', 'finalize'] as const).flatMap((boundary) =>
    (['cancel-only', 'same', 'separate'] as const).map((relation) =>
      [`CB-A/${handler}/${boundary}/${relation}`, handler, boundary, relation] as const)));

describe('StreamController fixed cancellation matrix A', () => {
  it.each(asyncBoundaryCases)('%s', async (_id, handler, boundary, relation) => {
    const f = cancellationFixture();
    if (handler === 'done') await f.controller.handleChunk(boundaryTool);
    await f.controller.handleChunk({ type: 'text', content: 'Before boundary' });
    if (boundary === 'finalize') {
      f.release();
      await f.controller.handleChunk({ type: 'thinking', content: '' });
    }
    const finalizeOwner = f.controller as unknown as { finalizeCurrentTextRender(): Promise<void> };
    const finalizeSpy = jest.spyOn(finalizeOwner, 'finalizeCurrentTextRender');
    const chunk = handler === 'tool_use' ? boundaryTool
      : handler === 'thinking' ? { type: 'thinking' as const, content: 'Uncommitted old thought', partId: 'old-part' }
        : handler === 'error' ? { type: 'error' as const, content: 'Old error' } : { type: 'done' as const };
    const pending = f.controller.handleChunk(chunk);
    if (boundary === 'flush') await f.started; else await Promise.resolve();
    expect(finalizeSpy.mock.calls.length > 0).toBe(boundary === 'finalize');
    finalizeSpy.mockRestore();
    f.controller.cancelStream();
    const atCancel = f.snapshot();
    let next = f.controller;
    let nextEl = f.contentEl;
    if (relation === 'same') { nextEl = f.containerEl.createDiv(); next.startStream(nextEl); }
    if (relation === 'separate') {
      const replacement = cancellationFixture(); replacement.release();
      next = replacement.controller; nextEl = replacement.contentEl;
    }
    if (relation !== 'cancel-only') await next.handleChunk({ type: 'text', content: 'Replacement' });
    const beforeReleaseCounts = f.counts();
    const oldCards = f.contentEl.querySelectorAll('.streaming-tool-call, .streaming-thinking-block, .streaming-error-block').length;
    f.release(); await pending;
    expect(f.counts()).toEqual(beforeReleaseCounts);
    expect(f.contentEl.querySelectorAll('.streaming-tool-call, .streaming-thinking-block, .streaming-error-block')).toHaveLength(oldCards);
    expect(f.callbacks.onDone).not.toHaveBeenCalled();
    expect(f.onStreamComplete).not.toHaveBeenCalled();
    expect(next.isStreaming()).toBe(relation !== 'cancel-only');
    expect(atCancel.some((block: { type: string }) => block.type === 'tool_call')).toBe(handler === 'tool_use' || handler === 'done');
    if (relation === 'cancel-only') {
      f.controller.cancelStream();
    } else {
      await next.handleChunk({ type: 'done' });
    }
    const expectedBlocks = relation === 'cancel-only'
      ? atCancel
      : [{ type: 'text', content: 'Replacement' }];
    const replacementCard = relation === 'cancel-only'
      ? null
      : nextEl.querySelector('.streaming-tool-call, .streaming-thinking-block, .streaming-error-block');
    expect(replacementCard).toBeNull();
    const observedController = relation === 'separate' ? next : f.controller;
    expect(observedController.getContentBlocks()).toEqual(expectedBlocks);
  });
});

describe('StreamController fixed cancellation matrix B/C/D', () => {
  it.each(['text', 'thinking', 'tool_use', 'tool_result', 'error', 'done'] as const)('CB-B/%s', async (kind) => {
    const f = cancellationFixture(); f.release();
    await f.controller.handleChunk(boundaryTool); f.controller.cancelStream();
    const atCancel = f.snapshot(); const counts = f.counts(); const dom = f.contentEl.innerHTML;
    const chunk = kind === 'tool_use' ? { ...boundaryTool, id: 'late-new-tool' }
      : kind === 'tool_result' ? { type: kind, id: boundaryTool.id, content: 'Late result' }
        : kind === 'done' ? { type: kind } : { type: kind, content: 'Late content' };
    await f.controller.handleChunk(chunk);
    expect(f.snapshot()).toEqual(atCancel); expect(f.counts()).toEqual(counts);
    expect(f.contentEl.innerHTML).toBe(dom);
  });

  it.each(['empty', 'running', 'confirmed-success', 'confirmed-error'] as const)('CB-C/%s', async (kind) => {
    const f = cancellationFixture(); f.release();
    if (kind !== 'empty') await f.controller.handleChunk(boundaryTool);
    if (kind === 'confirmed-success' || kind === 'confirmed-error') {
      await f.controller.handleChunk({ type: 'tool_result', id: boundaryTool.id, content: 'Confirmed', isError: kind === 'confirmed-error' });
    }
    f.controller.cancelStream();
    const atCancel = f.snapshot(); const counts = f.counts(); const dom = f.contentEl.innerHTML;
    f.controller.cancelStream(); f.controller.cancelStream();
    expect(f.snapshot()).toEqual(atCancel); expect(f.counts()).toEqual(counts);
    expect(f.contentEl.innerHTML).toBe(dom); expect(f.controller.isStreaming()).toBe(false);
  });

  it('CB-D/renderer-one-cancel', async () => {
    let triggered = false; let entryStreaming: boolean | undefined;
    const f = cancellationFixture({ getToolName: (name) => {
      if (!triggered) { triggered = true; entryStreaming = f.controller.isStreaming(); f.controller.cancelStream(); }
      return name;
    } });
    await f.controller.handleChunk({ type: 'text', content: 'Before boundary' });
    const pending = f.controller.handleChunk(boundaryTool); await f.started;
    f.controller.cancelStream(); const atCancel = f.snapshot(); const counts = f.counts();
    f.release(); await pending;
    const state = (f.controller as unknown as { state: { toolCalls: Map<string, unknown>; toolCallElements: Map<string, unknown> } }).state;
    expect(entryStreaming).toBe(false);
    expect(f.contentEl.querySelectorAll('.streaming-tool-call')).toHaveLength(1);
    expect(f.contentEl.querySelector('.status-interrupted')).not.toBeNull();
    expect(state.toolCalls.size).toBe(0); expect(state.toolCallElements.size).toBe(0);
    expect(f.snapshot()).toEqual(atCancel); expect(f.counts()).toEqual(counts);
    expect(atCancel).toContainEqual({ type: 'tool_call', toolCall: expect.objectContaining({
      id: boundaryTool.id, input: boundaryTool.input, status: 'interrupted',
    }) });
  });
});

const terminalBoundaryCases = (['success', 'error'] as const).flatMap((status) =>
  (['waiting', 'card'] as const).flatMap((phase) =>
    (['cancel', 'continue'] as const).map((ending) =>
      [`CB-E/${status}/${phase}/${ending}`, status, phase, ending] as const)));

describe('StreamController fixed cancellation matrix E/F', () => {
  it.each(terminalBoundaryCases)('%s', async (_id, status, phase, ending) => {
    const f = cancellationFixture();
    if (phase === 'card') f.release();
    await f.controller.handleChunk({ type: 'text', content: 'Before boundary' });
    const pending = f.controller.handleChunk(boundaryTool);
    if (phase === 'card') await pending; else await f.started;
    await f.controller.handleChunk({ type: 'tool_result', id: boundaryTool.id, content: status + ' actual result', isError: status === 'error' });
    if (ending === 'cancel') f.controller.cancelStream();
    const atCancel = ending === 'cancel' ? f.snapshot() : null;
    f.release(); await pending;
    if (ending === 'continue') await f.controller.handleChunk({ type: 'done' });
    else await f.controller.handleChunk({ type: 'tool_result', id: boundaryTool.id, content: 'Late invalid result' });
    expect(f.controller.getContentBlocks()).toEqual([
      { type: 'text', content: 'Before boundary' },
      { type: 'tool_call', toolCall: expect.objectContaining({
        id: boundaryTool.id, input: boundaryTool.input, kind: boundaryTool.kind,
        toolMetadata: boundaryTool.toolMetadata, resultVisibility: boundaryTool.resultVisibility,
        status: status === 'success' ? 'completed' : 'error', result: status + ' actual result',
      }) },
    ]);
    expect(f.snapshot()).toEqual(atCancel ?? f.snapshot());
    expect(f.contentEl.querySelectorAll('.streaming-tool-call')).toHaveLength(1);
    expect(f.callbacks.onToolCallStart).toHaveBeenCalledTimes(1); expect(f.callbacks.onToolCallEnd).toHaveBeenCalledTimes(1);
    expect(f.callbacks.onToolCallStart.mock.invocationCallOrder[0]).toBeLessThan(f.callbacks.onToolCallEnd.mock.invocationCallOrder[0]);
    expect(f.onStreamComplete).toHaveBeenCalledTimes(ending === 'cancel' ? 0 : 1);
  });

  it('CB-F/merged-input', async () => {
    const f = cancellationFixture();
    await f.controller.handleChunk({ type: 'text', content: 'Before boundary' });
    const first = f.controller.handleChunk(boundaryTool); await f.started;
    const update = f.controller.handleChunk({
      ...boundaryTool, input: { extra: 'Merged' }, toolMetadata: { sessionId: 'child-owned' },
    });
    f.controller.cancelStream(); const atCancel = f.snapshot(); const counts = f.counts();
    f.release(); await Promise.all([first, update]);
    expect(f.snapshot()).toEqual(atCancel); expect(f.counts()).toEqual(counts);
    expect(f.contentEl.querySelectorAll('.streaming-tool-call')).toHaveLength(1);
    expect(atCancel).toContainEqual({ type: 'tool_call', toolCall: expect.objectContaining({
      id: boundaryTool.id, kind: boundaryTool.kind, resultVisibility: boundaryTool.resultVisibility,
      input: { ...boundaryTool.input, extra: 'Merged' },
      toolMetadata: { ...boundaryTool.toolMetadata, sessionId: 'child-owned' }, status: 'interrupted',
    }) });
    expect(f.callbacks.onToolCallStart).toHaveBeenCalledTimes(1);
  });

  it('keeps already appended thinking when cancelled and refuses new thinking after cancel', async () => {
    const f = cancellationFixture(); f.release();
    await f.controller.handleChunk({ type: 'thinking', content: 'Accepted thought', partId: 'accepted' });
    f.controller.cancelStream(); const atCancel = f.snapshot();
    await f.controller.handleChunk({ type: 'thinking', content: 'After cancel' }); f.controller.cancelStream();
    expect(atCancel).toEqual([expect.objectContaining({ type: 'thinking', content: 'Accepted thought', partId: 'accepted' })]);
    expect(f.snapshot()).toEqual(atCancel);
  });
});
