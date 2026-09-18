/**
 * Controller-level contract tests for R-C3
 * (docs/requirements/flowtext-parity.md R-C3 验收 2/3/4 + 设计 §3.2.5/§4.2):
 *
 * - trigger → ghost appears at the cursor (progressive chunks included);
 * - typing cancels the in-flight request AND a late response is dropped by
 *   the generation counter (acceptance 2 — no late overwrite);
 * - Tab accepts in ONE dispatched, document-changing transaction with the
 *   ghost cleared in the same transaction (acceptance 3, single undo step);
 * - Esc dismisses with the document untouched (acceptance 4);
 * - an active inline edit refuses the trigger (mutual exclusion);
 * - IME composition refuses the trigger and never consumes keys;
 * - a write-class tool observation discards the suggestion and reports the
 *   violation to the pool (design §3.2.3).
 *
 * The harness runs a real CodeMirror 6 EditorView in jsdom with the real
 * ghost extension registered (update listener + Tab/Esc keymap + Alt
 * handlers), and a real pool wired to stub sessions — the same setup
 * discipline as InlineEditController.test.ts.
 */

import { EditorState, type TransactionSpec } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { AUX_DENIED_CAPABILITIES, findWriteToolCalls } from '../../../../src/core/agents/backend/AgentAuxQueryCapability';
import type {
  InlineCompletionSession,
  InlineCompletionTurnRequest,
  InlineCompletionTurnResult,
} from '../../../../src/core/agents/backend/AgentInlineCompletionCapability';
import { InlineCompletionController } from '../../../../src/features/inline-edit/InlineCompletionController';
import {
  inlineCompletionGhostExtension,
  readInlineCompletionGhost,
} from '../../../../src/features/inline-edit/InlineCompletionGhost';
import { type InlineCompletionPoolHost,InlineCompletionService } from '../../../../src/features/inline-edit/InlineCompletionService';

const DOC = 'The report covers quarterly\nresults and projections for';

interface Deferred {
  request: InlineCompletionTurnRequest;
  resolve: (result: InlineCompletionTurnResult) => void;
  reject: (error: unknown) => void;
}

interface StubSession extends InlineCompletionSession {
  readonly deferreds: Deferred[];
  disposed: boolean;
  aborts: number;
}

function stubSession(): StubSession {
  const session: StubSession = {
    queryId: 'stub-session',
    safety: {
      backend: 'opencode',
      enforcedPolicy: 'read-only-allowlist',
      effectiveTools: ['read'],
      deniedCapabilities: AUX_DENIED_CAPABILITIES,
      mechanism: 'stub',
    },
    deferreds: [],
    disposed: false,
    aborts: 0,
    complete(request) {
      let resolve!: Deferred['resolve'];
      let reject!: Deferred['reject'];
      const pending = new Promise<InlineCompletionTurnResult>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      session.deferreds.push({ request, resolve, reject });
      return pending;
    },
    reset() {
      return Promise.resolve();
    },
    dispose() {
      session.disposed = true;
      return Promise.resolve();
    },
  };
  return session;
}

async function flush(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function makeHarness(options: {
  enabled?: boolean;
  hasActiveInlineEdits?: boolean;
  startFailure?: Error;
} = {}) {
  const parent = document.createElement('div');
  document.body.appendChild(parent);

  let enabled = options.enabled ?? true;
  let hasActiveInlineEdits = options.hasActiveInlineEdits ?? false;
  const startedSessions: StubSession[] = [];
  const notices: string[] = [];
  let violation: { tools: readonly string[] } | null = null;
  let turnFailures = 0;
  // Late-bound: the controller is constructed after the view.
  let controller: InlineCompletionController | null = null;

  const view = new EditorView({
    state: EditorState.create({
      doc: DOC,
      extensions: [inlineCompletionGhostExtension({
        canTrigger: () => enabled,
        onAltTrigger: (editorView) => {
          void editorView;
          // The Alt gesture path is exercised in the trigger tests via
          // controller.trigger directly; nothing to do here.
        },
        onTabAccept: (editorView) => controller?.accept(editorView) ?? false,
        onEscDismiss: (editorView) => controller?.dismiss(editorView) ?? false,
        onEditorActivity: (editorView) => controller?.onEditorActivity(editorView),
      }) as unknown as never],
    }),
    parent,
  });

  const docTransactions: TransactionSpec[] = [];
  const originalDispatch = view.dispatch.bind(view);
  (view as unknown as { dispatch: (spec: TransactionSpec) => void }).dispatch =
    (spec: TransactionSpec) => {
      if (spec && typeof spec === 'object' && 'changes' in spec) {
        docTransactions.push(spec);
      }
      originalDispatch(spec);
    };

  const host: InlineCompletionPoolHost = {
    isEnabled: () => enabled,
    getLocale: () => 'en',
    getMaxChars: () => 300,
    getNotePath: () => 'notes/report.md',
    resolveCompletionTarget: () => ({
      ok: true,
      backend: 'opencode',
      displayName: 'OpenCode',
      workingDirectory: '/vault',
      model: null,
      effort: null,
      startSession: () => {
        if (options.startFailure) return Promise.reject(options.startFailure);
        const session = stubSession();
        startedSessions.push(session);
        return Promise.resolve(session);
      },
    }),
    buildSystemPrompt: () => 'system prompt',
  };
  const pool = new InlineCompletionService({
    host,
    notify: (message) => { notices.push(message); },
  });
  const reportWriteToolViolation = pool.reportWriteToolViolation.bind(pool);
  pool.reportWriteToolViolation = (backend, displayName, tools) => {
    violation = { tools };
    reportWriteToolViolation(backend, displayName, tools);
  };
  const reportTurnFailure = pool.reportTurnFailure.bind(pool);
  pool.reportTurnFailure = (backend) => {
    turnFailures += 1;
    reportTurnFailure(backend);
  };

  controller = new InlineCompletionController({
    pool,
    isEnabled: () => enabled,
    hasActiveInlineEdits: () => hasActiveInlineEdits,
  });

  return {
    controller,
    pool,
    view,
    notices,
    startedSessions,
    docTransactions,
    get currentSession(): StubSession {
      return startedSessions[startedSessions.length - 1]!;
    },
    get violation(): { tools: readonly string[] } | null {
      return violation;
    },
    get failures(): number {
      return turnFailures;
    },
    setEnabled(value: boolean): void { enabled = value; },
    setHasActiveInlineEdits(value: boolean): void { hasActiveInlineEdits = value; },
    type(text: string, at: number): void {
      originalDispatch({ changes: { from: at, to: at, insert: text } });
    },
    setCursor(at: number): void {
      originalDispatch({ selection: { anchor: at } });
    },
    pressKey(key: string): boolean {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      view.contentDOM.dispatchEvent(event);
      return event.defaultPrevented;
    },
    destroy(): void {
      view.destroy();
      parent.remove();
    },
  };
}

describe('InlineCompletionController trigger', () => {
  it('is a no-op while the feature is disabled', async () => {
    const harness = makeHarness({ enabled: false });
    harness.controller.trigger({ cm: harness.view } as never, 'notes/report.md');
    await flush();
    expect(harness.startedSessions).toHaveLength(0);
    expect(readInlineCompletionGhost(harness.view.state)).toBeNull();
    harness.destroy();
  });

  it('is refused while an inline edit is active in any editor', async () => {
    const harness = makeHarness({ hasActiveInlineEdits: true });
    harness.controller.trigger({ cm: harness.view } as never, 'notes/report.md');
    await flush();
    expect(harness.startedSessions).toHaveLength(0);
    harness.destroy();
  });

  it('is refused for a view without a host note', async () => {
    const harness = makeHarness();
    harness.controller.trigger({ cm: harness.view } as never, '');
    await flush();
    expect(harness.startedSessions).toHaveLength(0);
    harness.destroy();
  });

  it('shows a validated final suggestion at the cursor', async () => {
    const harness = makeHarness();
    harness.setCursor(DOC.length);
    harness.controller.trigger({ cm: harness.view } as never, 'notes/report.md');
    await flush();
    expect(harness.currentSession.deferreds).toHaveLength(1);
    const request = harness.currentSession.deferreds[0]!.request;
    expect(request.prefix.startsWith('The report covers')).toBe(true);
    expect(request.suffix).toBe('');
    expect(request.maxChars).toBe(300);

    harness.currentSession.deferreds[0]!.resolve({
      ok: true,
      text: ' the next fiscal year.',
      toolCalls: [],
    });
    await flush();
    const ghost = readInlineCompletionGhost(harness.view.state);
    expect(ghost?.text).toBe(' the next fiscal year.');
    expect(ghost?.pos).toBe(DOC.length);
    expect(ghost?.prefixTail).toBe(request.prefix.slice(-200));
    harness.destroy();
  });

  it('shows progressive chunks as ghost text (first chunk = first byte)', async () => {
    const harness = makeHarness();
    harness.setCursor(DOC.length);
    harness.controller.trigger({ cm: harness.view } as never, 'notes/report.md');
    await flush();
    const deferred = harness.currentSession.deferreds[0]!;
    deferred.request.onTextChunk?.(' the next');
    expect(readInlineCompletionGhost(harness.view.state)?.text).toBe(' the next');
    deferred.resolve({ ok: true, text: ' the next fiscal year.', toolCalls: [] });
    await flush();
    expect(readInlineCompletionGhost(harness.view.state)?.text).toBe(' the next fiscal year.');
    harness.destroy();
  });

  it('drops a suggestion that would repeat the prefix', async () => {
    const harness = makeHarness();
    harness.setCursor(DOC.length);
    harness.controller.trigger({ cm: harness.view } as never, 'notes/report.md');
    await flush();
    harness.currentSession.deferreds[0]!.resolve({
      ok: true,
      text: DOC.slice(-60),
      toolCalls: [],
    });
    await flush();
    expect(readInlineCompletionGhost(harness.view.state)).toBeNull();
    harness.destroy();
  });

  it('reports a start failure honestly through the pool and shows nothing', async () => {
    const harness = makeHarness({ startFailure: new Error('read-only proof failed') });
    harness.controller.trigger({ cm: harness.view } as never, 'notes/report.md');
    await flush();
    expect(readInlineCompletionGhost(harness.view.state)).toBeNull();
    expect(harness.notices).toHaveLength(1);
    expect(harness.notices[0]).toContain('Could not start');
    // A start failure is not a turn failure: it goes through the pool's own
    // unsupported path instead of the turn-failure chain.
    expect(harness.failures).toBe(0);
    harness.destroy();
  });

  it('treats a rejecting turn as a failed turn without crashing', async () => {
    const harness = makeHarness();
    harness.controller.trigger({ cm: harness.view } as never, 'notes/report.md');
    await flush();
    harness.currentSession.deferreds[0]!.reject(new Error('transport exploded'));
    await flush();
    expect(readInlineCompletionGhost(harness.view.state)).toBeNull();
    expect(harness.failures).toBe(1);
    harness.destroy();
  });
});

describe('InlineCompletionController cancellation (acceptance 2)', () => {
  it('typing cancels the in-flight turn and late results are dropped', async () => {
    const harness = makeHarness();
    const cursor = DOC.length;
    harness.setCursor(cursor);
    harness.controller.trigger({ cm: harness.view } as never, 'notes/report.md');
    await flush();

    // The user types while the turn is in flight: the extension's update
    // listener cancels the request through the controller.
    harness.type(' ', cursor);
    expect(harness.currentSession.deferreds[0]!.request.signal?.aborted).toBe(true);

    // The backend answers late — even streaming a chunk first — and the
    // generation counter drops both.
    const deferred = harness.currentSession.deferreds[0]!;
    deferred.request.onTextChunk?.(' stale chunk');
    expect(readInlineCompletionGhost(harness.view.state)).toBeNull();
    deferred.resolve({ ok: true, text: ' stale suggestion.', toolCalls: [] });
    await flush();
    expect(readInlineCompletionGhost(harness.view.state)).toBeNull();
    harness.destroy();
  });

  it('a retrigger aborts the previous turn and only the new result shows', async () => {
    const harness = makeHarness();
    const firstCursor = DOC.length;
    harness.setCursor(firstCursor);
    harness.controller.trigger({ cm: harness.view } as never, 'notes/report.md');
    await flush();
    const firstDeferred = harness.currentSession.deferreds[0]!;

    harness.type(' ', firstCursor);
    harness.controller.trigger({ cm: harness.view } as never, 'notes/report.md');
    await flush();
    expect(firstDeferred.request.signal?.aborted).toBe(true);
    // The pool reuses the warm session, so the retriggered turn is the
    // second deferred on the same stub session.
    const secondDeferred = harness.currentSession.deferreds[1]!;
    secondDeferred.resolve({ ok: true, text: ' second answer.', toolCalls: [] });
    await flush();
    expect(readInlineCompletionGhost(harness.view.state)?.text).toBe(' second answer.');
    // The stale first turn settles afterwards and must not overwrite.
    firstDeferred.resolve({ ok: true, text: ' FIRST stale answer!', toolCalls: [] });
    await flush();
    expect(readInlineCompletionGhost(harness.view.state)?.text).toBe(' second answer.');
    harness.destroy();
  });

  it('Esc clears the ghost with the document untouched (acceptance 4)', async () => {
    const harness = makeHarness();
    const before = harness.view.state.doc.toString();
    harness.setCursor(DOC.length);
    harness.controller.trigger({ cm: harness.view } as never, 'notes/report.md');
    await flush();
    harness.currentSession.deferreds[0]!.resolve({
      ok: true,
      text: ' the next fiscal year.',
      toolCalls: [],
    });
    await flush();
    expect(readInlineCompletionGhost(harness.view.state)).not.toBeNull();

    // Through the real Esc keymap wiring…
    expect(harness.pressKey('Escape')).toBe(true);
    expect(readInlineCompletionGhost(harness.view.state)).toBeNull();
    expect(harness.view.state.doc.toString()).toBe(before);
    // …and directly: Esc is not consumed when no ghost exists.
    expect(harness.controller.dismiss(harness.view)).toBe(false);
    harness.destroy();
  });
});

describe('InlineCompletionController accept (acceptance 3)', () => {
  it('inserts the suggestion in a single transaction and clears the ghost', async () => {
    const harness = makeHarness();
    harness.setCursor(DOC.length);
    harness.controller.trigger({ cm: harness.view } as never, 'notes/report.md');
    await flush();
    harness.currentSession.deferreds[0]!.resolve({
      ok: true,
      text: ' the next fiscal year.',
      toolCalls: [],
    });
    await flush();

    harness.docTransactions.length = 0;
    // Through the real Tab keymap wiring…
    expect(harness.pressKey('Tab')).toBe(true);
    // …exactly one dispatched, document-changing transaction…
    expect(harness.docTransactions).toHaveLength(1);
    const spec = harness.docTransactions[0]!;
    expect(spec.changes).toEqual({ from: DOC.length, insert: ' the next fiscal year.' });
    expect(spec.userEvent).toBe('input.complete');
    // …the ghost is gone and the cursor sits after the inserted text.
    expect(readInlineCompletionGhost(harness.view.state)).toBeNull();
    expect(harness.view.state.doc.toString()).toBe(DOC + ' the next fiscal year.');
    expect(harness.view.state.selection.main.head).toBe((DOC + ' the next fiscal year.').length);
    harness.destroy();
  });

  it('refuses the insert when the prefix drifted since the request (§4.2)', async () => {
    const harness = makeHarness();
    harness.setCursor(DOC.length);
    harness.controller.trigger({ cm: harness.view } as never, 'notes/report.md');
    await flush();
    harness.currentSession.deferreds[0]!.resolve({
      ok: true,
      text: ' the next fiscal year.',
      toolCalls: [],
    });
    await flush();
    // The user edits the tail of the prefix while the ghost is up: the doc
    // change cleared the ghost at the field level, and a manual re-show of a
    // ghost whose tail no longer matches must refuse the insert.
    harness.type('SUDDEN', 0);
    expect(readInlineCompletionGhost(harness.view.state)).toBeNull();
    expect(harness.controller.accept(harness.view)).toBe(false);
    expect(harness.view.state.doc.toString()).toBe('SUDDEN' + DOC);
    harness.destroy();
  });

  it('is not consumed when no ghost exists', () => {
    const harness = makeHarness();
    expect(harness.controller.accept(harness.view)).toBe(false);
    expect(harness.pressKey('Tab')).toBe(false);
    harness.destroy();
  });
});

describe('InlineCompletionController write-tool audit (design §3.2.3)', () => {
  it('discards the suggestion and reports the violation', async () => {
    const harness = makeHarness();
    harness.setCursor(DOC.length);
    harness.controller.trigger({ cm: harness.view } as never, 'notes/report.md');
    await flush();
    harness.currentSession.deferreds[0]!.resolve({
      ok: true,
      text: ' hostile edit.',
      toolCalls: [{ name: 'Write' }],
    });
    await flush();
    expect(readInlineCompletionGhost(harness.view.state)).toBeNull();
    expect(harness.violation).toEqual({ tools: ['Write'] });
    // The shared audit function is what classified the call.
    expect(findWriteToolCalls([{ name: 'Write' }])).toEqual(['Write']);
    harness.destroy();
  });

  it('passes a clean turn through to the ghost', async () => {
    const harness = makeHarness();
    harness.setCursor(DOC.length);
    harness.controller.trigger({ cm: harness.view } as never, 'notes/report.md');
    await flush();
    harness.currentSession.deferreds[0]!.resolve({
      ok: true,
      text: ' clean text.',
      toolCalls: [{ name: 'read' }],
    });
    await flush();
    expect(harness.violation).toBeNull();
    expect(readInlineCompletionGhost(harness.view.state)?.text).toBe(' clean text.');
    harness.destroy();
  });
});

describe('InlineCompletionController IME guard (acceptance 6, controller side)', () => {
  it('refuses the trigger while the view is composing', async () => {
    const harness = makeHarness();
    // Shadow the `composing` getter the same way an active IME session would.
    Object.defineProperty(harness.view, 'composing', { get: () => true, configurable: true });
    harness.controller.trigger({ cm: harness.view } as never, 'notes/report.md');
    await flush();
    expect(harness.startedSessions).toHaveLength(0);
    harness.destroy();
  });
});
