/**
 * Unit tests for the R-C3 Alt-solo gesture predicate and its stateful
 * tracker (docs/requirements/flowtext-c3-design.md §3.4, §5 case 1):
 *
 * - pure Alt press/release triggers;
 * - chords (Alt+A), composing events, and window expiry do not;
 * - the tracker: OS key-repeat keeps the original gesture start, any other
 *   key resets, and a decided gesture clears the buffer.
 */

import { describe, expect, it } from '@jest/globals';

import {
  ALT_SOLO_GESTURE_WINDOW_MS,
  type AltGestureEvent,
  AltSoloGestureTracker,
  isAltSoloGesture,
} from '../../../../src/features/inline-edit/InlineCompletionTrigger';

function down(key = 'Alt', at?: number, isComposing = false): AltGestureEvent {
  return { key, type: 'keydown', isComposing, ...(at !== undefined ? { at } : {}) };
}

function up(key = 'Alt', at?: number, isComposing = false): AltGestureEvent {
  return { key, type: 'keyup', isComposing, ...(at !== undefined ? { at } : {}) };
}

describe('isAltSoloGesture', () => {
  it('triggers on a clean Alt down/up pair', () => {
    expect(isAltSoloGesture([down(), up()])).toBe('trigger');
  });

  it('stays pending while Alt is still held', () => {
    expect(isAltSoloGesture([down()])).toBe('pending');
  });

  it('stays pending through OS key repeat of Alt', () => {
    expect(isAltSoloGesture([down(), down(), down()])).toBe('pending');
  });

  it('returns none for an empty or unrelated sequence', () => {
    expect(isAltSoloGesture([])).toBe('none');
    expect(isAltSoloGesture([up()])).toBe('none');
    expect(isAltSoloGesture([down('a'), up('a')])).toBe('none');
  });

  it('is voided by an intervening keydown (Alt+A chord)', () => {
    expect(isAltSoloGesture([down(), down('a'), up()])).toBe('none');
  });

  it('is voided by a non-Alt keyup between the Alt events', () => {
    expect(isAltSoloGesture([down(), up('a'), up()])).toBe('none');
  });

  it('is voided by IME composition on either event', () => {
    expect(isAltSoloGesture([down(undefined, undefined, true), up()])).toBe('none');
    expect(isAltSoloGesture([down(), up(undefined, undefined, true)])).toBe('none');
  });

  it('rejects a hold longer than the gesture window', () => {
    expect(isAltSoloGesture([
      down('Alt', 0),
      up('Alt', ALT_SOLO_GESTURE_WINDOW_MS + 1),
    ])).toBe('none');
  });

  it('accepts a release inside the gesture window', () => {
    expect(isAltSoloGesture([
      down('Alt', 0),
      up('Alt', ALT_SOLO_GESTURE_WINDOW_MS - 1),
    ])).toBe('trigger');
  });

  it('ignores timestamps when either event lacks one', () => {
    expect(isAltSoloGesture([down('Alt', 0), up()])).toBe('trigger');
  });
});

describe('AltSoloGestureTracker', () => {
  it('drives keydown → keyup to a trigger and clears afterwards', () => {
    const tracker = new AltSoloGestureTracker();
    expect(tracker.push({ key: 'Alt', type: 'keydown', isComposing: false })).toBe('pending');
    expect(tracker.push({ key: 'Alt', type: 'keyup', isComposing: false })).toBe('trigger');
    // The next Alt press starts a fresh gesture, not a chain on stale events.
    expect(tracker.push({ key: 'Alt', type: 'keyup', isComposing: false })).toBe('none');
  });

  it('resets when any other key is pressed', () => {
    const tracker = new AltSoloGestureTracker();
    tracker.push({ key: 'Alt', type: 'keydown', isComposing: false });
    expect(tracker.push({ key: 'a', type: 'keydown', isComposing: false })).toBe('none');
    // The stale Alt keydown is gone: the lone keyup cannot complete a gesture.
    expect(tracker.push({ key: 'Alt', type: 'keyup', isComposing: false })).toBe('none');
  });

  it('keeps the original press as the gesture start across key repeat', () => {
    let now = 0;
    const tracker = new AltSoloGestureTracker(() => now);
    expect(tracker.push({ key: 'Alt', type: 'keydown', isComposing: false })).toBe('pending');
    // A long hold fires repeats; they neither refresh the window nor reset.
    now = ALT_SOLO_GESTURE_WINDOW_MS + 500;
    expect(tracker.push({ key: 'Alt', type: 'keydown', isComposing: false })).toBe('pending');
    // The release is measured against the ORIGINAL press: a hold longer than
    // the window can never complete, repeats or not.
    now += 100;
    expect(tracker.push({ key: 'Alt', type: 'keyup', isComposing: false })).toBe('none');
  });

  it('expires a press older than the window instead of completing it', () => {
    let now = 0;
    const tracker = new AltSoloGestureTracker(() => now);
    tracker.push({ key: 'Alt', type: 'keydown', isComposing: false });
    now = ALT_SOLO_GESTURE_WINDOW_MS + 100;
    expect(tracker.push({ key: 'Alt', type: 'keyup', isComposing: false })).toBe('none');
  });

  it('reset() clears a pending gesture', () => {
    const tracker = new AltSoloGestureTracker();
    tracker.push({ key: 'Alt', type: 'keydown', isComposing: false });
    tracker.reset();
    expect(tracker.push({ key: 'Alt', type: 'keyup', isComposing: false })).toBe('none');
  });
});
