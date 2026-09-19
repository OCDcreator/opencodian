/**
 * InlineEditOverlayDismissal — the document-level dismissal wiring behind
 * the floating instruction bar (Escape, outside pointerdown, focusout),
 * extracted from `InlineEditInputOverlay` so the overlay stays within its
 * max-lines budget and only binds the returned handlers.
 *
 * The scoping rule itself is the pure `resolveDismissOwner`
 * (InlineEditOverlayPrimitives). This module gathers each event's anchor —
 * once per event, before any bar can tear down — builds the candidate
 * snapshot for the editor's open bars and applies the single resulting
 * verdict per bar. Listener order and mid-event teardown therefore cannot
 * flip a sibling's decision: tearing a bar down blurs its field to body,
 * so re-reading `activeElement` after a sibling acted is exactly the
 * order-dependent defect that let one Escape reject every open bar (A1).
 *
 * Content guard (A3): the passive paths (outside pointerdown, focus-out)
 * only dismiss pristine bars. A bar holding typed input, generating, or
 * showing generated output survives them — losing that state to a stray
 * click is not acceptable, and with parallel edits the mouse path (click
 * into the text to open the next edit) must not discard the first bar.
 */

import {
  type InlineEditDismissAction,
  type InlineEditDismissKind,
  resolveDismissOwner,
} from './InlineEditOverlayPrimitives';

/** Everything the dismissal wiring needs to know about one open bar. */
export interface InlineEditDismissalHost {
  /** Stable bar identity (the edit id); keys the per-bar verdicts. */
  readonly editId: string;
  /** The bar's panel, or null once torn down. */
  panel(): HTMLElement | null;
  /** The bar's open dropdown menu element, or null. */
  menu(): HTMLElement | null;
  /** True when the bar is pristine (nothing to lose). */
  pristine(): boolean;
  closeMenu(): void;
  reject(): void;
}

/** The three document/view-level handlers the overlay must bind and unbind. */
export interface InlineEditDismissalHandlers {
  readonly onDocKeydown: (event: KeyboardEvent) => void;
  readonly onDocPointerDown: (event: PointerEvent | MouseEvent) => void;
  readonly onFocusOut: (event: FocusEvent) => void;
}

/** Every bar carries this class; it is how an event's anchor bar is found. */
const OVERLAY_SELECTOR = '.opencodian-inline-edit-overlay';

/**
 * Per-event Escape anchor: the first handler of a keydown records which
 * bar panel held `activeElement`; later handlers of the SAME event reuse
 * that snapshot instead of re-reading a DOM that a sibling's teardown has
 * already mutated.
 */
const escapeAnchors = new WeakMap<KeyboardEvent, HTMLElement | null>();

function anchoredPanel(node: EventTarget | null): HTMLElement | null {
  return node instanceof Element ? node.closest<HTMLElement>(OVERLAY_SELECTOR) : null;
}

/** Resolve this host's own verdict from the shared candidate snapshot. */
function verdictFor(
  host: InlineEditDismissalHost,
  bars: readonly InlineEditDismissalHost[],
  kind: InlineEditDismissKind,
  anchor: { readonly panel: HTMLElement | null; readonly withinSomeBar: boolean },
): InlineEditDismissAction {
  return resolveDismissOwner({
    kind,
    anchorWithinSomeBar: anchor.withinSomeBar,
    candidates: bars.map((bar) => ({
      id: bar.editId,
      isAnchor: bar.panel() != null && bar.panel() === anchor.panel,
      hasMenu: bar.menu() != null,
      pristine: bar.pristine(),
    })),
  }).get(host.editId) ?? 'none';
}

/**
 * Build the dismissal handlers for one bar (`host`) among `bars()` — every
 * open bar of the same editor, mount order, including the host itself.
 */
export function bindInlineEditOverlayDismissal(
  doc: Document,
  host: InlineEditDismissalHost,
  bars: () => readonly InlineEditDismissalHost[],
): InlineEditDismissalHandlers {
  const onDocKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || event.isComposing) return;
    let anchor = escapeAnchors.get(event);
    if (!escapeAnchors.has(event)) {
      anchor = anchoredPanel(doc.activeElement);
      escapeAnchors.set(event, anchor);
    }
    const action = verdictFor(host, bars(), 'escape', { panel: anchor ?? null, withinSomeBar: anchor != null });
    if (action === 'none') return;
    event.preventDefault();
    if (action === 'close-menu') host.closeMenu();
    else host.reject();
  };
  const onDocPointerDown = (event: PointerEvent | MouseEvent): void => {
    const anchor = anchoredPanel(event.target);
    const action = verdictFor(host, bars(), 'pointerdown', { panel: anchor, withinSomeBar: anchor != null });
    if (action === 'reject') {
      host.reject();
      return;
    }
    if (action === 'close-menu') {
      host.closeMenu();
      return;
    }
    // Inside the panel but outside the open menu: close just the menu.
    const target = event.target;
    const menu = host.menu();
    if (menu && target instanceof Node && !menu.contains(target) && host.panel()?.contains(target)) {
      host.closeMenu();
    }
  };
  const onFocusOut = (event: FocusEvent): void => {
    // Window deactivation (relatedTarget null) keeps the edit alive.
    const next = event.relatedTarget;
    if (!next) return;
    const action = verdictFor(host, bars(), 'focusout', {
      panel: anchoredPanel(event.target),
      withinSomeBar: anchoredPanel(next) != null,
    });
    if (action === 'reject') host.reject();
  };
  return { onDocKeydown, onDocPointerDown, onFocusOut };
}
