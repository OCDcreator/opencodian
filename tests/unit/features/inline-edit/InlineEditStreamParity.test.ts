/**
 * Streaming preview growth contract (docs/requirements/flowtext-parity.md
 * R-A3 acceptance 1), driven through the real controller in jsdom:
 *
 * - partial chunks inside an open tag render a growing preview (≥3 distinct
 *   partial states across the chunk sequence) with accept/reject disabled
 *   throughout and Enter a no-op while the turn is still streaming;
 * - once the closing tag arrives the state is the normal complete preview
 *   with enabled actions, and accepting writes the strictly-parsed text;
 * - the two protocol-violation paths (multiple tags, unclosed at end) clear
 *   the partial preview and report, with no write;
 * - a chunk that arrives before any tag renders nothing actionable (busy
 *   panel + reply channel only).
 *
 * The preview is render-only by construction: the streaming pipeline
 * (InlineEditStreamPreview) feeds the widget, while the strict
 * `parseInlineEditResponse()` stays the only authority for what gets applied
 * — these tests pin that the partial state cannot reach the write path.
 */

import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { Editor } from 'obsidian';

import type { AgentAuxQueryCapability } from '../../../../src/core/agents/backend/AgentAuxQueryCapability';
import { InlineEditController } from '../../../../src/features/inline-edit/InlineEditController';
import type { InlineEditHost } from '../../../../src/features/inline-edit/InlineEditHost';
import type { InlineEditRequest } from '../../../../src/features/inline-edit/InlineEditPrompt';
import type { InlineEditHostAdapter, InlineEditOutcome } from '../../../../src/features/inline-edit/InlineEditTypes';
import { t } from '../../../../src/i18n';

const DOC = 'alpha beta gamma delta epsilon zeta eta theta';

interface HarnessOptions {
  /** Overrides the first turn's outcome (defaults to a replacement preview). */
  readonly firstTurnOutcome?: InlineEditOutcome;
  /**
   * Timed accumulated-text steps: each step waits `awaitMs` (real timers) and
   * then feeds the accumulated text, mirroring how a streaming backend paces
   * `onTextChunk`. A repeated final step keeps the turn generating one more
   * window so the last partial's frame reaches the DOM before the settle.
   */
  readonly firstTurnChunkSteps?: readonly { readonly awaitMs: number; readonly accumulated: string }[];
}

interface Harness {
  controller: InlineEditController;
  view: EditorView;
  editor: Editor;
  writes: { text: string; from: number; to: number }[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function flush(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function makeHarness(options: HarnessOptions = {}): Harness {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({ state: EditorState.create({ doc: DOC }), parent });
  const writes: { text: string; from: number; to: number }[] = [];

  const capability = {} as AgentAuxQueryCapability;
  const adapter: InlineEditHostAdapter = {
    kind: 'opencode',
    displayName: 'OpenCode',
    getAuxQuery: () => capability,
    resolveModel: () => ({ ok: true, model: null }),
    describeModelSelection: () => ({ label: '', source: 'default' }),
    getEffort: () => null,
  };
  const host: InlineEditHost = {
    getWorkingDirectory: () => '/vault',
    getLocale: () => 'en',
    resolveAdapter: () => adapter,
  };

  const editor = {
    cm: view,
    offsetToPos: (offset: number) => {
      const line = view.state.doc.lineAt(offset);
      return { line: line.number - 1, ch: offset - line.from };
    },
    posToOffset: (pos: { line: number; ch: number }) => view.state.doc.line(pos.line + 1).from + pos.ch,
    replaceRange: (text: string, start: { line: number; ch: number }, end: { line: number; ch: number }) => {
      const from = view.state.doc.line(start.line + 1).from + start.ch;
      const to = view.state.doc.line(end.line + 1).from + end.ch;
      writes.push({ text, from, to });
      view.dispatch({ changes: { from, to, insert: text } });
    },
  } as unknown as Editor;

  const controller = new InlineEditController({
    host,
    notify: () => { /* errors surface in the panel, not notices, in these tests */ },
    createService: () => ({
      get hasSession() { return false; },
      submit(request: InlineEditRequest, turnOptions?: { onTextChunk?: (accumulated: string) => void }) {
        void request;
        const settle: Promise<InlineEditOutcome> = options.firstTurnOutcome
          ? Promise.resolve(options.firstTurnOutcome)
          : Promise.resolve({ status: 'preview', mode: 'replacement', text: 'RESULT' });
        return (async () => {
          for (const step of options.firstTurnChunkSteps ?? []) {
            await sleep(step.awaitMs);
            turnOptions?.onTextChunk?.(step.accumulated);
          }
          return settle;
        })();
      },
      clarify: () => Promise.resolve({ status: 'error', reason: 'turn-failed' }),
      cancel() { /* no-op */ },
      dispose() { return Promise.resolve(); },
    }) as never,
  });

  return { controller, view, editor, writes };
}

/** Open a selection edit and submit without waiting for the turn to settle. */
async function submitStreaming(h: Harness): Promise<void> {
  h.view.dispatch({ selection: { anchor: 0, head: 5 } });
  expect(h.controller.open(h.editor, { file: { path: 'note.md' } })).toBe(true);
  await flush(2);
  const bar = h.view.dom.querySelector<HTMLElement>(':scope > .opencodian-inline-edit-overlay');
  const field = bar!.querySelector<HTMLTextAreaElement>('.opencodian-inline-edit-field');
  if (!field) throw new Error('overlay field missing');
  field.value = 'rewrite';
  field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await flush(2);
}

function previewEls(view: EditorView): HTMLElement[] {
  return [...view.dom.querySelectorAll<HTMLElement>('.opencodian-inline-edit-preview')];
}

/** Insert-side text the preview widget currently shows (the growing body). */
function previewInsertText(preview: HTMLElement): string {
  return [...preview.querySelectorAll<HTMLElement>('.opencodian-inline-edit-insert')]
    .map((node) => node.textContent ?? '')
    .join('');
}

function actionButtons(preview: HTMLElement): { accept: HTMLButtonElement; reject: HTMLButtonElement } {
  const accept = preview.querySelector<HTMLButtonElement>('.opencodian-inline-edit-action.is-accept');
  const reject = preview.querySelector<HTMLButtonElement>('.opencodian-inline-edit-action.is-reject');
  if (!accept || !reject) throw new Error('preview action buttons missing');
  return { accept, reject };
}

/** Wait for the edit to leave the generating phase (bounded). */
async function awaitSettled(h: Harness): Promise<void> {
  for (let i = 0; i < 300 && h.controller.phase === 'generating'; i += 1) {
    await sleep(15);
  }
  await flush();
}

function pressKey(key: string): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

describe('InlineEditController streaming preview growth (R-A3)', () => {
  it('grows the preview across partial chunks and keeps accept/reject disabled until the turn settles', async () => {
    const h = makeHarness({
      firstTurnChunkSteps: [
        { awaitMs: 80, accumulated: '<replacement>first sentence,' },
        { awaitMs: 80, accumulated: '<replacement>first sentence, second sentence,' },
        { awaitMs: 80, accumulated: '<replacement>first sentence, second sentence, third sentence,' },
        // Repeat: keeps the turn generating so the third partial's frame is
        // rendered before the settle replaces the partial preview.
        { awaitMs: 90, accumulated: '<replacement>first sentence, second sentence, third sentence,' },
      ],
    });
    await submitStreaming(h);

    // Sample while generating: the preview body must be visible, growing,
    // and never actionable.
    const frames: string[] = [];
    const disabledSamples: boolean[] = [];
    for (let i = 0; i < 300 && h.controller.phase === 'generating'; i += 1) {
      const preview = previewEls(h.view)[0];
      if (preview) {
        const text = previewInsertText(preview);
        if (text && frames[frames.length - 1] !== text) frames.push(text);
        const { accept, reject } = actionButtons(preview);
        disabledSamples.push(accept.disabled && reject.disabled);
      }
      await sleep(15);
    }
    await flush();

    // At least three distinct partial states: the preview grows with the
    // stream instead of jumping from busy to complete.
    expect(frames.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < frames.length; i += 1) {
      expect(frames[i]!.startsWith(frames[i - 1]!)).toBe(true);
    }
    // Accept/reject stayed disabled on every sampled partial frame.
    expect(disabledSamples.length).toBeGreaterThan(0);
    expect(disabledSamples.every(Boolean)).toBe(true);
    // No write can have happened: accept was never available.
    expect(h.writes).toEqual([]);

    // Settled: the normal complete preview with enabled actions, using the
    // strictly-parsed outcome text (not the streamed body).
    expect(h.controller.phase).toBe('preview');
    const settled = previewEls(h.view)[0]!;
    const { accept, reject } = actionButtons(settled);
    expect(accept.disabled).toBe(false);
    expect(reject.disabled).toBe(false);
    expect(previewInsertText(settled)).toContain('RESULT');
  });

  it('does not accept a partial preview on Enter while the turn is still streaming', async () => {
    const h = makeHarness({
      firstTurnChunkSteps: [
        { awaitMs: 60, accumulated: '<replacement>partial one' },
        { awaitMs: 150, accumulated: '<replacement>partial one and two' },
      ],
    });
    await submitStreaming(h);
    // Mid-stream: the partial preview is up, Enter must be a no-op.
    await sleep(100);
    expect(h.controller.phase).toBe('generating');
    expect(previewEls(h.view)).toHaveLength(1);
    pressKey('Enter');
    await flush(4);
    expect(h.controller.phase).toBe('generating');
    expect(h.writes).toEqual([]);

    await awaitSettled(h);
    expect(h.controller.phase).toBe('preview');
  });

  it('finishes into the normal enabled preview once the closing tag arrives', async () => {
    const h = makeHarness({
      firstTurnChunkSteps: [
        { awaitMs: 40, accumulated: '<replacement>streamed body' },
        { awaitMs: 40, accumulated: '<replacement>streamed body</replacement>' },
        { awaitMs: 40, accumulated: '<replacement>streamed body</replacement>' },
      ],
    });
    await submitStreaming(h);
    await awaitSettled(h);

    expect(h.controller.phase).toBe('preview');
    const preview = previewEls(h.view)[0]!;
    const { accept, reject } = actionButtons(preview);
    expect(accept.disabled).toBe(false);
    expect(reject.disabled).toBe(false);
    // The final payload is the strict parse's text — byte-identical to the
    // non-streaming path — and accepting writes exactly it.
    expect(previewInsertText(preview)).toContain('RESULT');
    const acceptButton = actionButtons(preview).accept;
    acceptButton.click();
    await flush(12);
    expect(h.writes).toEqual([{ text: 'RESULT', from: 0, to: 5 }]);
    expect(h.controller.hasActiveEdits()).toBe(false);
  });

  it('clears the streaming preview and reports multiple protocol tags', async () => {
    const h = makeHarness({
      firstTurnChunkSteps: [
        { awaitMs: 40, accumulated: '<replacement>first result</replacement>' },
        { awaitMs: 40, accumulated: '<replacement>first result</replacement><replacement>second' },
        { awaitMs: 60, accumulated: '<replacement>first result</replacement><replacement>second' },
      ],
      firstTurnOutcome: { status: 'error', reason: 'multiple-tags' },
    });
    await submitStreaming(h);

    // The first complete tag rendered mid-turn (a frozen last-good frame once
    // the violation arrived) — then the strict parse clears it.
    let sawMidTurnPreview = false;
    for (let i = 0; i < 300 && h.controller.phase === 'generating'; i += 1) {
      if (previewEls(h.view).length > 0) sawMidTurnPreview = true;
      await sleep(15);
    }
    await flush();

    expect(sawMidTurnPreview).toBe(true);
    expect(previewEls(h.view)).toHaveLength(0);
    // The error is reported in the panel's error channel; no write happened.
    const errorText = h.view.dom
      .querySelector<HTMLElement>('.opencodian-inline-edit-error')
      ?.textContent ?? '';
    expect(errorText).toContain(t('inlineEdit.error.multipleTags'));
    expect(h.writes).toEqual([]);
    expect(h.controller.phase).toBe('input');
  });

  it('clears the streaming preview and reports an unclosed tag with no write', async () => {
    const h = makeHarness({
      firstTurnChunkSteps: [
        { awaitMs: 40, accumulated: '<replacement>half a result' },
        { awaitMs: 60, accumulated: '<replacement>half a result' },
      ],
      firstTurnOutcome: { status: 'error', reason: 'unclosed-tag' },
    });
    await submitStreaming(h);
    await awaitSettled(h);

    expect(previewEls(h.view)).toHaveLength(0);
    const errorText = h.view.dom
      .querySelector<HTMLElement>('.opencodian-inline-edit-error')
      ?.textContent ?? '';
    expect(errorText).toContain(t('inlineEdit.error.unclosedTag'));
    expect(h.writes).toEqual([]);
    expect(h.controller.phase).toBe('input');
  });

  it('renders pre-tag chunks only in the reply channel — no preview, nothing actionable', async () => {
    const h = makeHarness({
      firstTurnChunkSteps: [
        { awaitMs: 40, accumulated: 'let me think about the rewrite' },
        { awaitMs: 80, accumulated: 'let me think about the rewrite some more' },
        { awaitMs: 100, accumulated: 'let me think about the rewrite some more' },
      ],
    });
    await submitStreaming(h);

    // Sample the whole generating window: pre-tag text goes to the reply
    // channel above the input, and nothing actionable ever renders.
    const replies: string[] = [];
    for (let i = 0; i < 300 && h.controller.phase === 'generating'; i += 1) {
      expect(previewEls(h.view)).toHaveLength(0);
      expect(h.view.dom.querySelectorAll('.opencodian-inline-edit-action')).toHaveLength(0);
      const bar = h.view.dom.querySelector<HTMLElement>(':scope > .opencodian-inline-edit-overlay')!;
      expect(bar.classList.contains('opencodian-inline-edit-busy')).toBe(true);
      const replyText = bar.querySelector<HTMLElement>('.opencodian-inline-edit-reply')?.textContent ?? '';
      if (replyText && replies[replies.length - 1] !== replyText) replies.push(replyText);
      await sleep(15);
    }
    await flush();

    // The streamed pre-tag prose is visible in the reply channel…
    expect(replies.some((text) => text.includes('let me think about the rewrite some more'))).toBe(true);
    // …and it is plain prose: no protocol markup, no preview element, no
    // action button ever existed (asserted on every sample above).
    expect(replies.every((text) => !text.includes('<'))).toBe(true);
    expect(h.writes).toEqual([]);
    expect(h.controller.phase).toBe('preview');
    expect(previewEls(h.view)).toHaveLength(1);
  });
});
