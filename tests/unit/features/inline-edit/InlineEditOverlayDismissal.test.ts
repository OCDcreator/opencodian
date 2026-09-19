/**
 * Dismissal ownership for the floating instruction bar (R-A5, defects A1-A3).
 *
 * The pure half pins `resolveDismissOwner`: exactly the bar anchoring an
 * event may answer it, passive paths (outside pointerdown, focus-out) only
 * dismiss pristine bars, and focus moving between bars keeps both alive.
 *
 * The wiring half drives the REAL overlay listeners (document capture
 * keydown/pointerdown, view-level focusout) with two parallel bars whose
 * `onReject` tears the bar down like the controller does — that is what
 * reproduces the A1 ordering hazard: the first overlay's teardown moves
 * focus to body before the second overlay's handler runs, so any handler
 * that re-reads live `activeElement` rejects its own bar too.
 *
 * Single-bar legacy semantics (the paths that were not intentionally
 * changed) are asserted at the end: focus-nowhere Escape still rejects the
 * lone bar (the busy-phase Esc cancel), window switches never cancel, and
 * ✕ always rejects.
 */

import type { EditorView } from '@codemirror/view';

import {
  InlineEditInputOverlay,
  type InlineEditOverlayCallbacks,
  type InlineEditOverlayState,
} from '../../../../src/features/inline-edit/InlineEditInputOverlay';
import {
  type InlineEditDismissCandidate,
  resolveDismissOwner,
} from '../../../../src/features/inline-edit/InlineEditOverlayPrimitives';
import { INLINE_EDIT_BUILTIN_PRESET_IDS } from '../../../../src/features/inline-edit/InlineEditPresets';

// ---------------------------------------------------------------------------
// Pure resolveDismissOwner
// ---------------------------------------------------------------------------

function candidate(overrides: Partial<InlineEditDismissCandidate>): InlineEditDismissCandidate {
  return { id: 'bar', isAnchor: false, hasMenu: false, pristine: true, ...overrides };
}

describe('resolveDismissOwner', () => {
  it('gives Escape to the bar that held focus and nobody else', () => {
    const verdicts = resolveDismissOwner({
      kind: 'escape',
      anchorWithinSomeBar: true,
      candidates: [
        candidate({ id: 'A', isAnchor: true }),
        candidate({ id: 'B' }),
      ],
    });
    expect(verdicts.get('A')).toBe('reject');
    expect(verdicts.get('B')).toBe('none');
  });

  it('closes the anchor menu on Escape instead of rejecting', () => {
    const verdicts = resolveDismissOwner({
      kind: 'escape',
      anchorWithinSomeBar: true,
      candidates: [candidate({ id: 'A', isAnchor: true, hasMenu: true })],
    });
    expect(verdicts.get('A')).toBe('close-menu');
  });

  it('acts on no bar when Escape finds focus outside every bar of several', () => {
    const verdicts = resolveDismissOwner({
      kind: 'escape',
      anchorWithinSomeBar: false,
      candidates: [candidate({ id: 'A' }), candidate({ id: 'B' })],
    });
    expect(verdicts.get('A')).toBe('none');
    expect(verdicts.get('B')).toBe('none');
  });

  it('keeps the lone-bar Escape answer when focus is in no bar (busy-phase cancel)', () => {
    const verdicts = resolveDismissOwner({
      kind: 'escape',
      anchorWithinSomeBar: false,
      candidates: [candidate({ id: 'A' })],
    });
    expect(verdicts.get('A')).toBe('reject');
  });

  it('never lets a pointerdown inside a bar dismiss any bar', () => {
    const verdicts = resolveDismissOwner({
      kind: 'pointerdown',
      anchorWithinSomeBar: true,
      candidates: [candidate({ id: 'A', isAnchor: true }), candidate({ id: 'B' })],
    });
    expect(verdicts.get('A')).toBe('none');
    expect(verdicts.get('B')).toBe('none');
  });

  it('outside pointerdown dismisses pristine bars and lets survivors close menus', () => {
    const verdicts = resolveDismissOwner({
      kind: 'pointerdown',
      anchorWithinSomeBar: false,
      candidates: [
        candidate({ id: 'A', pristine: false }),
        candidate({ id: 'B', pristine: false, hasMenu: true }),
        candidate({ id: 'C' }),
      ],
    });
    expect(verdicts.get('A')).toBe('none');
    expect(verdicts.get('B')).toBe('close-menu');
    expect(verdicts.get('C')).toBe('reject');
  });

  it('focusout only lets the source panel act, and only when pristine', () => {
    const verdicts = resolveDismissOwner({
      kind: 'focusout',
      anchorWithinSomeBar: false,
      candidates: [
        candidate({ id: 'A', isAnchor: true }),
        candidate({ id: 'B', isAnchor: true, pristine: false }),
        candidate({ id: 'C' }),
      ],
    });
    expect(verdicts.get('A')).toBe('reject');
    expect(verdicts.get('B')).toBe('none');
    expect(verdicts.get('C')).toBe('none');
  });

  it('focusout keeps a bar with content and a bar whose focus moved to another bar', () => {
    const landed = resolveDismissOwner({
      kind: 'focusout',
      anchorWithinSomeBar: false,
      candidates: [candidate({ id: 'A', isAnchor: true, pristine: false })],
    });
    expect(landed.get('A')).toBe('none');
    const toBar = resolveDismissOwner({
      kind: 'focusout',
      anchorWithinSomeBar: true,
      candidates: [candidate({ id: 'A', isAnchor: true })],
    });
    expect(toBar.get('A')).toBe('none');
  });
});

// ---------------------------------------------------------------------------
// Real overlay listeners, two parallel bars (R-A5)
// ---------------------------------------------------------------------------

const PRESETS = INLINE_EDIT_BUILTIN_PRESET_IDS.map((id) => ({
  id,
  label: `label-${id}`,
  prompt: `prompt-${id}`,
}));

function baseState(overrides: Partial<InlineEditOverlayState> = {}): InlineEditOverlayState {
  return {
    reply: '',
    error: '',
    busy: false,
    value: '',
    placeholder: 'placeholder',
    model: null,
    effort: null,
    context: [],
    contextSupported: false,
    presets: PRESETS,
    image: null,
    imageSupported: false,
    mode: 'selection',
    modeOptions: ['selection', 'cursor-inline', 'document'],
    modeSwitchable: true,
    imageGen: null,
    ...overrides,
  };
}

interface Bar {
  overlay: InlineEditInputOverlay;
  callbacks: InlineEditOverlayCallbacks & { onReject: jest.Mock; onSubmit: jest.Mock };
  panel: HTMLElement;
  field: HTMLTextAreaElement;
}

interface Harness {
  dom: HTMLElement;
  bars: readonly Bar[];
}

/**
 * Two overlays on one fake editor view. `onReject` really tears the bar
 * down (`hide()`), mirroring the controller contract — that is what makes
 * the ordering hazard real: the first bar's teardown happens between the
 * two document-capture handlers of the same event.
 */
function makePairHarness(): Harness {
  const dom = document.createElement('div');
  document.body.appendChild(dom);
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  const view = {
    dom,
    scrollDOM: document.createElement('div'),
    coordsAtPos: () => null,
    state: { readOnly: false },
  } as unknown as EditorView;

  const bars: Bar[] = [];
  for (const editId of ['A', 'B']) {
    const callbacks = {
      editId,
      onSubmit: jest.fn(),
      onReject: jest.fn(),
      onPickModel: jest.fn(),
      onPickEffort: jest.fn(),
    } as Bar['callbacks'];
    const overlay = new InlineEditInputOverlay(view, callbacks);
    overlay.show(0);
    const panel = dom.querySelectorAll<HTMLElement>('.opencodian-inline-edit-overlay')[bars.length];
    const field = panel.querySelector<HTMLTextAreaElement>('textarea');
    if (!field) throw new Error('input field missing');
    // The controller rejects -> hide(); reproduce it so mid-event teardown
    // (and the focus drop to body it causes) is part of the test.
    callbacks.onReject.mockImplementation(() => { overlay.hide(); });
    bars.push({ overlay, callbacks, panel, field });
  }
  return { dom, bars };
}

function escapeKey(target: HTMLElement): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

function pointerDown(target: HTMLElement): void {
  target.dispatchEvent(new Event('pointerdown', { bubbles: true }));
}

function focusOut(field: HTMLTextAreaElement, relatedTarget: Node | null): void {
  field.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget }));
}

describe('InlineEditInputOverlay dismissal scoping (R-A5)', () => {
  let harness: Harness;

  beforeEach(() => {
    harness = makePairHarness();
  });

  afterEach(() => {
    for (const bar of harness.bars) bar.overlay.hide();
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  it('Escape with focus in A rejects only A; B survives with its typed content', () => {
    const [a, b] = harness.bars;
    a.field.value = 'A 的内容';
    b.field.value = 'B 的内容';
    a.field.focus();
    expect(document.activeElement).toBe(a.field);

    const event = escapeKey(a.field);

    expect(event.defaultPrevented).toBe(true);
    expect(a.callbacks.onReject).toHaveBeenCalledTimes(1);
    expect(b.callbacks.onReject).not.toHaveBeenCalled();
    // A is really gone; B is still mounted and still holds its text — the
    // decision for B was made from the per-event focus snapshot, before (and
    // despite) A's teardown dropping focus to body.
    expect(a.panel.isConnected).toBe(false);
    expect(b.panel.isConnected).toBe(true);
    expect(document.activeElement).not.toBe(b.field);
    expect(b.field.value).toBe('B 的内容');
  });

  it('Escape with no bar focused rejects nothing and passes through untouched', () => {
    const [a, b] = harness.bars;
    a.field.value = 'A 的内容';
    b.field.value = 'B 的内容';

    const event = escapeKey(document.body);

    expect(event.defaultPrevented).toBe(false);
    expect(a.callbacks.onReject).not.toHaveBeenCalled();
    expect(b.callbacks.onReject).not.toHaveBeenCalled();
    expect(a.panel.isConnected).toBe(true);
    expect(b.panel.isConnected).toBe(true);
  });

  it('a pointerdown inside bar A dismisses nothing at all', () => {
    const [a, b] = harness.bars;
    a.field.value = 'A 的内容';
    b.field.value = 'B 的内容';

    pointerDown(a.field);

    expect(a.callbacks.onReject).not.toHaveBeenCalled();
    expect(b.callbacks.onReject).not.toHaveBeenCalled();
    expect(a.panel.isConnected).toBe(true);
    expect(b.panel.isConnected).toBe(true);
  });

  it('a pointerdown outside every bar dismisses only the pristine bar', () => {
    const [a, b] = harness.bars;
    a.field.value = 'A 的内容';

    pointerDown(harness.dom);

    // B is pristine (empty instruction, input phase): accidental invocations
    // still clean themselves up. A typed content, so it survives.
    expect(a.callbacks.onReject).not.toHaveBeenCalled();
    expect(b.callbacks.onReject).toHaveBeenCalledTimes(1);
    expect(a.panel.isConnected).toBe(true);
    expect(b.panel.isConnected).toBe(false);
  });

  it('a pointerdown outside every bar closes a surviving bar’s open menu', () => {
    const [a] = harness.bars;
    a.overlay.update(baseState());
    a.field.value = '#';
    a.field.dispatchEvent(new Event('input', { bubbles: true }));
    expect(a.panel.querySelector('.opencodian-inline-edit-preset-menu')).not.toBeNull();

    pointerDown(harness.dom);

    expect(a.callbacks.onReject).not.toHaveBeenCalled();
    expect(a.panel.querySelector('.opencodian-inline-edit-preset-menu')).toBeNull();
  });

  it('focusout from A to B keeps both bars alive', () => {
    const [a, b] = harness.bars;
    a.field.value = 'A 的内容';
    b.field.value = 'B 的内容';

    focusOut(a.field, b.field);

    expect(a.callbacks.onReject).not.toHaveBeenCalled();
    expect(b.callbacks.onReject).not.toHaveBeenCalled();
    expect(a.panel.isConnected).toBe(true);
    expect(b.panel.isConnected).toBe(true);
  });

  it('focusout to the editor keeps a non-empty bar and dismisses a pristine one', () => {
    const [a, b] = harness.bars;
    a.field.value = 'A 的内容';

    focusOut(a.field, harness.dom);
    expect(a.callbacks.onReject).not.toHaveBeenCalled();
    expect(a.panel.isConnected).toBe(true);

    focusOut(b.field, harness.dom);
    expect(b.callbacks.onReject).toHaveBeenCalledTimes(1);
    expect(b.panel.isConnected).toBe(false);
  });

  it('a generating bar survives focus-out and outside pointerdown', () => {
    const [a] = harness.bars;
    a.overlay.update(baseState({ busy: true, value: 'A 的内容' }));
    a.field.value = 'A 的内容';

    focusOut(a.field, harness.dom);
    pointerDown(harness.dom);

    expect(a.callbacks.onReject).not.toHaveBeenCalled();
    expect(a.panel.isConnected).toBe(true);
  });
});

describe('InlineEditInputOverlay single-bar legacy dismissal paths', () => {
  let harness: Harness;

  beforeEach(() => {
    harness = makePairHarness();
    // Simulate a lone bar: remove B from the active set without touching A.
    harness.bars[1].overlay.hide();
  });

  afterEach(() => {
    for (const bar of harness.bars) bar.overlay.hide();
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  it('Escape with focus nowhere still rejects the lone bar (busy-phase cancel)', () => {
    const [a] = harness.bars;
    const event = escapeKey(document.body);
    expect(event.defaultPrevented).toBe(true);
    expect(a.callbacks.onReject).toHaveBeenCalledTimes(1);
  });

  it('Escape with an open menu closes the menu and never rejects (focus nowhere)', () => {
    const [a] = harness.bars;
    a.overlay.update(baseState());
    a.field.value = '#';
    a.field.dispatchEvent(new Event('input', { bubbles: true }));
    expect(a.panel.querySelector('.opencodian-inline-edit-preset-menu')).not.toBeNull();

    const event = escapeKey(document.body);

    expect(event.defaultPrevented).toBe(true);
    expect(a.callbacks.onReject).not.toHaveBeenCalled();
    expect(a.panel.querySelector('.opencodian-inline-edit-preset-menu')).toBeNull();
  });

  it('a pointerdown outside dismisses a pristine lone bar (accidental invocation)', () => {
    const [a] = harness.bars;
    pointerDown(harness.dom);
    expect(a.callbacks.onReject).toHaveBeenCalledTimes(1);
  });

  it('a window switch (focusout with no relatedTarget) never cancels', () => {
    const [a] = harness.bars;
    a.field.focus();
    focusOut(a.field, null);
    expect(a.callbacks.onReject).not.toHaveBeenCalled();
  });

  it('the ✕ button always rejects, pristine or not', () => {
    const [a] = harness.bars;
    a.field.value = 'keep me honest';
    const close = a.panel.querySelector<HTMLElement>('.opencodian-inline-edit-overlay-close');
    if (!close) throw new Error('close button missing');
    close.click();
    expect(a.callbacks.onReject).toHaveBeenCalledTimes(1);
  });
});

describe('InlineEditInputOverlay IME composition guard', () => {
  let harness: Harness;

  beforeEach(() => {
    harness = makePairHarness();
  });

  afterEach(() => {
    for (const bar of harness.bars) bar.overlay.hide();
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  it('Escape during composition neither rejects nor consumes the keydown', () => {
    const [a] = harness.bars;
    a.field.focus();
    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
      isComposing: true,
    });
    a.field.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(a.callbacks.onReject).not.toHaveBeenCalled();
  });

  it('Enter during composition never submits', () => {
    const [a] = harness.bars;
    a.field.focus();
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
      isComposing: true,
    });
    a.field.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(a.callbacks.onSubmit).not.toHaveBeenCalled();
  });
});
