/**
 * The `#` preset menu inside the floating input bar (R-A2) — the DOM-level
 * half: opening on a typed `#`, filtering, Enter filling without submitting,
 * Escape closing without rejecting, the `#标签` tag-compat rule and IME
 * composition. Row rendering and the pure mechanics live in
 * `InlineEditPresetMenu.test.ts`; this file pins the ownership contracts the
 * requirement calls out (Enter/Esc must not reach the submit/reject paths).
 */

import type { EditorView } from '@codemirror/view';

import {
  InlineEditInputOverlay,
  type InlineEditOverlayCallbacks,
  type InlineEditOverlayState,
} from '../../../../src/features/inline-edit/InlineEditInputOverlay';
import { INLINE_EDIT_BUILTIN_PRESET_IDS } from '../../../../src/features/inline-edit/InlineEditPresets';
import { setLocale } from '../../../../src/i18n';

const BUILTIN_PRESETS = INLINE_EDIT_BUILTIN_PRESET_IDS.map((id) => ({
  id,
  label: `label-${id}`,
  prompt: `prompt-${id}`,
}));

const USER_PRESETS = [
  { id: 'mine', label: 'Mine', prompt: 'Do the thing.' },
];

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
    presets: BUILTIN_PRESETS,
    image: null,
    imageSupported: false,
    mode: 'selection',
    modeOptions: ['selection', 'cursor-inline', 'document'],
    modeSwitchable: true,
    ...overrides,
  };
}

interface Harness {
  overlay: InlineEditInputOverlay;
  dom: HTMLElement;
  field: HTMLTextAreaElement;
  callbacks: {
    onSubmit: jest.Mock;
    onReject: jest.Mock;
    onPickModel: jest.Mock;
    onPickEffort: jest.Mock;
  };
}

function makeHarness(state: InlineEditOverlayState = baseState()): Harness {
  const dom = document.createElement('div');
  document.body.appendChild(dom);
  const view = {
    dom,
    scrollDOM: document.createElement('div'),
    coordsAtPos: () => null,
    state: { readOnly: false },
  } as unknown as EditorView;
  const callbacks: InlineEditOverlayCallbacks = {
    onSubmit: jest.fn(),
    onReject: jest.fn(),
    onPickModel: jest.fn(),
    onPickEffort: jest.fn(),
  };
  const overlay = new InlineEditInputOverlay(view, callbacks);
  overlay.show(0);
  overlay.update(state);
  const field = dom.querySelector<HTMLTextAreaElement>('textarea');
  if (!field) throw new Error('input field missing');
  return { overlay, dom, field, callbacks };
}

/** Simulate the user typing so the whole pipeline (value + input event) runs. */
function type(field: HTMLTextAreaElement, value: string): void {
  field.value = value;
  field.setSelectionRange(value.length, value.length);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

function keydown(field: HTMLTextAreaElement, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  field.dispatchEvent(event);
  return event;
}

describe('InlineEditInputOverlay preset menu', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
    // Positioning never runs in these tests: the frame is scheduled but the
    // callback is dropped, so coordsAtPos stays uncalled.
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('opens the menu with the builtin presets when # is typed into an empty input', () => {
    const { dom, field } = makeHarness();
    type(field, '#');
    const rows = [...dom.querySelectorAll('.opencodian-inline-edit-menu-item')];
    expect(dom.querySelector('.opencodian-inline-edit-preset-menu')).not.toBeNull();
    expect(rows).toHaveLength(BUILTIN_PRESETS.length);
  });

  it('shows the builtin rows even when the user preset list is empty', () => {
    const { dom, field } = makeHarness(baseState({ presets: BUILTIN_PRESETS }));
    type(field, '#');
    expect(dom.querySelectorAll('.opencodian-inline-edit-menu-item'))
      .toHaveLength(BUILTIN_PRESETS.length);
  });

  it('appends user presets after the builtins', () => {
    const { dom, field } = makeHarness(baseState({
      presets: [...BUILTIN_PRESETS, ...USER_PRESETS],
    }));
    type(field, '#');
    const labels = [...dom.querySelectorAll('.opencodian-inline-edit-menu-item-label')]
      .map((el) => el.textContent);
    expect(labels).toEqual([
      ...BUILTIN_PRESETS.map((preset) => `label-${preset.id}`),
      'Mine',
    ]);
  });

  it('filters the menu while typing (#label-expand keeps only the expand row)', () => {
    const { dom, field } = makeHarness();
    type(field, '#');
    type(field, '#label-expand');
    const labels = [...dom.querySelectorAll('.opencodian-inline-edit-menu-item-label')]
      .map((el) => el.textContent);
    expect(labels).toEqual(['label-expand']);
  });

  it('shows the empty state when the filter matches nothing', () => {
    const { dom, field } = makeHarness();
    type(field, '#');
    type(field, '#zzz-no-match');
    expect(dom.querySelector('.opencodian-inline-edit-picker-empty')).not.toBeNull();
    expect(dom.querySelectorAll('.opencodian-inline-edit-menu-item')).toHaveLength(0);
  });

  it('Enter fills the preset body into the input and never submits', () => {
    const { dom, field, callbacks } = makeHarness();
    type(field, '#');
    const event = keydown(field, 'Enter');
    expect(event.defaultPrevented).toBe(true);
    expect(field.value).toBe('prompt-expand');
    expect(callbacks.onSubmit).not.toHaveBeenCalled();
    expect(dom.querySelector('.opencodian-inline-edit-preset-menu')).toBeNull();
  });

  it('ArrowDown walks the rows and Enter fills the highlighted preset', () => {
    const { field, callbacks } = makeHarness();
    type(field, '#');
    keydown(field, 'ArrowDown');
    keydown(field, 'ArrowDown');
    keydown(field, 'Enter');
    expect(field.value).toBe('prompt-translate');
    expect(callbacks.onSubmit).not.toHaveBeenCalled();
  });

  it('Escape closes the menu, leaves the input untouched and never rejects', () => {
    const { dom, field, callbacks } = makeHarness();
    type(field, '#');
    type(field, '#label');
    keydown(field, 'Escape');
    expect(dom.querySelector('.opencodian-inline-edit-preset-menu')).toBeNull();
    expect(field.value).toBe('#label');
    expect(callbacks.onReject).not.toHaveBeenCalled();
  });

  it('Escape with the menu closed still rejects the edit (existing path intact)', () => {
    const { field, callbacks } = makeHarness();
    type(field, 'plain instruction');
    keydown(field, 'Escape');
    expect(callbacks.onReject).toHaveBeenCalledTimes(1);
  });

  it('does not reopen for a #tag-style token once the menu was closed', () => {
    const { dom, field } = makeHarness();
    type(field, '#');
    expect(dom.querySelector('.opencodian-inline-edit-preset-menu')).not.toBeNull();
    keydown(field, 'Escape');
    // Type tag text behind the closed menu: no trigger while text follows #.
    type(field, '#标签');
    expect(dom.querySelector('.opencodian-inline-edit-preset-menu')).toBeNull();
    type(field, '#标签x');
    expect(dom.querySelector('.opencodian-inline-edit-preset-menu')).toBeNull();
  });

  it('does not open at all when # lands in front of existing text (#标签 stays a tag)', () => {
    const { dom, field } = makeHarness();
    // Simulate the caret sitting at offset 0 of "标签" and typing # there:
    // the value becomes "#标签" with the caret right after the #.
    field.value = '#标签';
    field.setSelectionRange(1, 1);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    expect(dom.querySelector('.opencodian-inline-edit-preset-menu')).toBeNull();
  });

  it('closes the menu when the token breaks (whitespace after the query)', () => {
    const { dom, field } = makeHarness();
    type(field, '#');
    type(field, '#lab');
    expect(dom.querySelector('.opencodian-inline-edit-preset-menu')).not.toBeNull();
    type(field, '#lab ');
    expect(dom.querySelector('.opencodian-inline-edit-preset-menu')).toBeNull();
  });

  it('never opens or walks while an IME composition is active', () => {
    const { dom, field } = makeHarness();
    field.dispatchEvent(new Event('compositionstart'));
    type(field, '#');
    expect(dom.querySelector('.opencodian-inline-edit-preset-menu')).toBeNull();
    field.dispatchEvent(new Event('compositionend'));
    expect(dom.querySelector('.opencodian-inline-edit-preset-menu')).toBeNull();
  });

  it('fills a picked preset by mouse click without submitting', () => {
    const { dom, field, callbacks } = makeHarness();
    type(field, '#');
    const rows = [...dom.querySelectorAll<HTMLElement>('.opencodian-inline-edit-menu-item')];
    rows[1].click();
    expect(field.value).toBe('prompt-condense');
    expect(callbacks.onSubmit).not.toHaveBeenCalled();
  });

  it('closes the menu when the preset row area loses the token via backspace', () => {
    const { dom, field } = makeHarness();
    type(field, '#');
    expect(dom.querySelector('.opencodian-inline-edit-preset-menu')).not.toBeNull();
    type(field, '');
    expect(dom.querySelector('.opencodian-inline-edit-preset-menu')).toBeNull();
  });
});
