/**
 * InlineCompletionTrigger — the Alt-solo gesture decision for R-C3.
 *
 * FlowText's completion is triggered by pressing Alt alone at the cursor. A
 * bare modifier key cannot be matched by a CM6 keymap (it produces no
 * insertable text and no command key), so the ghost extension feeds raw
 * `keydown`/`keyup` records through this pure predicate instead.
 *
 * Gesture: a keydown of Alt, no other key pressed in between, then a keyup of
 * Alt — all outside IME composition, within a 1000 ms window (design §3.4).
 * Alt+A and any other chord therefore never trigger; holding Alt past the
 * window expires the gesture.
 *
 * The pure predicate judges the recorded sequence; `AltSoloGestureTracker`
 * owns the buffer, expiry, and reset rules and is the only stateful piece.
 */

/** One recorded key event, stripped to what the judgement needs. */
export interface AltGestureEvent {
  readonly key: string;
  readonly type: 'keydown' | 'keyup';
  /** True while an IME composition is in progress (never triggers). */
  readonly isComposing: boolean;
  /**
   * Epoch milliseconds when the event was observed. Optional for the pure
   * predicate; the tracker always supplies it so the 1000 ms window is
   * enforceable.
   */
  readonly at?: number;
}

/** The gesture window in milliseconds (design §3.4). */
export const ALT_SOLO_GESTURE_WINDOW_MS = 1000;

export type AltSoloGestureResult = 'pending' | 'trigger' | 'none';

/**
 * Decide whether a recorded key sequence is an Alt-solo gesture.
 *
 * Valid: exactly `[keydown Alt, …no other keydown…, keyup Alt]`, every event
 * outside IME composition, and — when timestamps are present — the keydown →
 * keyup gap within `ALT_SOLO_GESTURE_WINDOW_MS`. A leading keyup, an
 * intervening keydown, a second Alt, or any composing event voids the
 * sequence.
 */
export function isAltSoloGesture(events: readonly AltGestureEvent[]): AltSoloGestureResult {
  const down = events.find((event) => event.type === 'keydown');
  if (!down || down.key !== 'Alt') return 'none';
  const downIndex = events.indexOf(down);
  const up = events.find(
    (event, index) => index > downIndex && event.type === 'keyup',
  );
  if (!up) {
    // Any recorded event after the keydown that is not the Alt keyup voids it.
    const after = events.slice(downIndex + 1);
    return after.every((event) => event.key === 'Alt' && !event.isComposing) && !down.isComposing
      ? 'pending'
      : 'none';
  }
  if (up.key !== 'Alt') return 'none';
  if (down.isComposing || up.isComposing) return 'none';
  for (const event of events.slice(downIndex + 1, events.indexOf(up))) {
    // Any key — pressed or released — between the Alt press and its release
    // voids the solo gesture (Alt+A chords included).
    if (event.isComposing || event.key !== 'Alt') return 'none';
  }
  if (down.at !== undefined && up.at !== undefined) {
    if (up.at - down.at > ALT_SOLO_GESTURE_WINDOW_MS) return 'none';
  }
  return 'trigger';
}

/**
 * Stateful per-editor buffer feeding `isAltSoloGesture`.
 *
 * Events older than the window are dropped on every push, any non-Alt key
 * resets the buffer, and a decided gesture clears it — so the next Alt press
 * starts a fresh gesture rather than chaining onto stale records.
 */
export class AltSoloGestureTracker {
  private readonly events: AltGestureEvent[] = [];

  constructor(private readonly now: () => number = Date.now) {}

  reset(): void {
    this.events.length = 0;
  }

  /**
   * Record one key event and return the gesture verdict.
   *
   * - `'trigger'` — a complete Alt-solo gesture: fire the completion.
   * - `'pending'` — Alt is down; wait for the keyup.
   * - `'none'` — the sequence is void (or merely unrelated typing).
   */
  push(event: { key: string; type: 'keydown' | 'keyup'; isComposing: boolean }): AltSoloGestureResult {
    const at = this.now();
    if (event.key !== 'Alt') {
      // Any other key breaks the solo gesture; plain typing keeps the buffer
      // empty so the state stays trivially small.
      this.events.length = 0;
      return 'none';
    }
    const last = this.events[this.events.length - 1];
    if (event.type === 'keydown' && last?.type === 'keydown') {
      // OS key repeat: holding Alt fires keydown again. The event is ignored
      // entirely — the ORIGINAL press stays the gesture start, so a long
      // hold can never refresh its own window into validity.
      return isAltSoloGesture(this.events);
    }
    this.expire(at);
    this.events.push({ key: event.key, type: event.type, isComposing: event.isComposing, at });
    const verdict = isAltSoloGesture(this.events);
    // A decided gesture (triggered or voided) clears the buffer; only a
    // still-held Alt keeps it for the keyup.
    if (verdict !== 'pending') this.events.length = 0;
    return verdict;
  }

  /** Drop events that fell out of the gesture window. */
  private expire(at: number): void {
    while (this.events.length > 0) {
      const first = this.events[0];
      if (first?.at !== undefined && at - first.at > ALT_SOLO_GESTURE_WINDOW_MS) {
        this.events.shift();
        continue;
      }
      break;
    }
  }
}
