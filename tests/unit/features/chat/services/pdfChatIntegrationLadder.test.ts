import type { App, WorkspaceLeaf } from 'obsidian';

import type { PdfChatIntegrationPorts } from '../../../../../src/features/chat/services/PdfChatIntegration';
import { PdfChatIntegration } from '../../../../../src/features/chat/services/PdfChatIntegration';

/**
 * R-C4 live-acceptance repairs (D1/D2):
 *
 * D1 — Obsidian builds a pdf view's internals AFTER the leaf appears, so the
 * very first probe lands on an empty viewer and used to cache a wrong "C"
 * verdict forever (`syncLeaves` only mounted bridges for unbridged leaves).
 * These tests pin: first probe C → viewer becomes ready → a later re-probe
 * UPGRADES the bridge to A (button mounted), via both the bounded readiness
 * backoff and the next workspace sync; a viewer that never becomes ready
 * stays honestly at C; a proven higher rung is never silently downgraded.
 *
 * D2 — `unmountBridge` used to throw on a bridge with no toolbar button
 * ("Cannot read properties of undefined (reading 'toolbarButton')" in the
 * field), aborting `syncLeaves`' cleanup sweep. These tests pin a no-button /
 * partial / missing bridge tearing down cleanly and the sweep surviving one
 * broken bridge.
 */

interface FakeChild {
  pdfViewer?: unknown;
  toolbar?: { toolbarLeftEl?: HTMLElement; toolbarRightEl?: HTMLElement };
  getTextSelectionRangeStr?: (ctx: unknown) => unknown;
  highlightText?: (page: number, rangeStr: string) => unknown;
}

interface FakeView {
  containerEl: HTMLElement;
  file: { path: string };
  viewer?: { child?: FakeChild };
}

function makePdfLeaf(): { leaf: WorkspaceLeaf; view: FakeView; toolbarRightEl: HTMLElement } {
  const view: FakeView = {
    containerEl: document.createElement('div'),
    file: { path: 'docs/paper.pdf' },
  };
  return {
    leaf: { view } as unknown as WorkspaceLeaf,
    view,
    toolbarRightEl: document.createElement('div'),
  };
}

/** Simulate the viewer becoming fully loaded (the ~6s-later reality). */
function loadViewerInternals(view: FakeView, toolbarRightEl: HTMLElement): void {
  view.viewer = {
    child: {
      pdfViewer: {},
      toolbar: { toolbarRightEl },
      getTextSelectionRangeStr: () => '0,1,2,3',
      highlightText: () => undefined,
    },
  };
}

function makeApp(pdfLeaves: WorkspaceLeaf[]): { app: App; fireWorkspaceSync(): void } {
  const listeners: Array<() => void> = [];
  const workspace = {
    getLeavesOfType: (type: string) => (type === 'pdf' ? pdfLeaves : []),
    on: (_type: string, cb: () => void) => {
      listeners.push(cb);
      return { id: listeners.length };
    },
    offref: () => undefined,
    activeLeaf: pdfLeaves[0] ?? null,
  };
  return {
    app: { workspace } as unknown as App,
    fireWorkspaceSync: () => {
      for (const cb of [...listeners]) {
        cb();
      }
    },
  };
}

function makePorts(): PdfChatIntegrationPorts {
  return {
    attachContextItemToActiveChat: async () => undefined,
    openChat: async () => undefined,
    getActiveConversation: () => null,
    getEditRevert: () => null,
    buildPdfSelectionItem: () => null,
  };
}

type BridgeMap = Map<WorkspaceLeaf, unknown>;
const bridgesOf = (integration: PdfChatIntegration): BridgeMap =>
  (integration as unknown as { bridges: BridgeMap }).bridges;
const timersOf = (integration: PdfChatIntegration): number =>
  (integration as unknown as { readyRetryTimers: Map<WorkspaceLeaf, unknown> }).readyRetryTimers.size;

async function waitFor(condition: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor timed out');
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('PdfChatIntegration ladder re-probe (D1: first probe is never final)', () => {
  it('upgrades C → A through the bounded readiness backoff when the viewer finishes loading', async () => {
    const { leaf, view, toolbarRightEl } = makePdfLeaf();
    const { app } = makeApp([leaf]);
    const integration = new PdfChatIntegration(app, makePorts(), {
      viewerReadyRetryDelaysMs: [5, 5, 5, 5, 5],
    });

    integration.attach();
    // The leaf just appeared: the viewer internals do not exist yet, so the
    // honest verdict at this instant is C.
    expect(integration.getLadderReport()?.level).toBe('C');
    expect(integration.getLadderReport()?.reasons).toContain('pdfViewer missing');
    expect(integration.getLadderReport()?.reasons).toContain('toolbar containers missing');

    // The viewer finishes loading with no workspace event in between —
    // exactly the normal open path.
    loadViewerInternals(view, toolbarRightEl);
    await waitFor(() => integration.getLadderReport()?.level === 'A');

    expect(integration.getLadderReport()?.reasons).toEqual([]);
    // The upgrade mounted the real toolbar button (evidence, not a guess).
    expect(toolbarRightEl.querySelectorAll('.clickable-icon')).toHaveLength(1);
    integration.detach();
  });

  it('upgrades C → A on the next workspace sync without waiting for the backoff', () => {
    const { leaf, view, toolbarRightEl } = makePdfLeaf();
    const { app, fireWorkspaceSync } = makeApp([leaf]);
    const integration = new PdfChatIntegration(app, makePorts(), {
      viewerReadyRetryDelaysMs: [60_000], // long enough that the backoff cannot fire
    });

    integration.attach();
    expect(integration.getLadderReport()?.level).toBe('C');

    loadViewerInternals(view, toolbarRightEl);
    fireWorkspaceSync();

    expect(integration.getLadderReport()?.level).toBe('A');
    expect(integration.getLadderReport()?.reasons).toEqual([]);
    expect(toolbarRightEl.querySelectorAll('.clickable-icon')).toHaveLength(1);
    integration.detach();
  });

  it('stays honestly at C with reasons when the viewer never becomes ready', async () => {
    const { leaf, view } = makePdfLeaf();
    const { app } = makeApp([leaf]);
    const integration = new PdfChatIntegration(app, makePorts(), {
      viewerReadyRetryDelaysMs: [5, 5, 5],
    });

    integration.attach();
    await waitFor(() => timersOf(integration) === 0); // budget exhausted

    expect(integration.getLadderReport()?.level).toBe('C');
    expect(integration.getLadderReport()?.reasons).toContain('pdfViewer missing');
    expect(bridgesOf(integration).has(leaf)).toBe(true); // still bridged at C
    expect(view.containerEl.querySelectorAll('.clickable-icon')).toHaveLength(0);
    integration.detach();
  });

  it('never silently downgrades an already-proven higher rung', () => {
    const { leaf, view, toolbarRightEl } = makePdfLeaf();
    const { app, fireWorkspaceSync } = makeApp([leaf]);
    const integration = new PdfChatIntegration(app, makePorts(), {
      viewerReadyRetryDelaysMs: [60_000],
    });

    integration.attach();
    loadViewerInternals(view, toolbarRightEl);
    fireWorkspaceSync();
    expect(integration.getLadderReport()?.level).toBe('A');

    // The internals disappear (viewer torn down beneath the bridge): the
    // proven A bridge stays active; the command path re-checks at call time.
    view.viewer = undefined;
    fireWorkspaceSync();
    expect(integration.getLadderReport()?.level).toBe('A');
    integration.detach();
  });

  it('cancels the pending readiness re-probe when the leaf leaves the workspace', async () => {
    const { leaf, view, toolbarRightEl } = makePdfLeaf();
    const pdfLeaves: WorkspaceLeaf[] = [leaf];
    const { app, fireWorkspaceSync } = makeApp(pdfLeaves);
    const integration = new PdfChatIntegration(app, makePorts(), {
      viewerReadyRetryDelaysMs: [5, 5, 5],
    });

    integration.attach();
    expect(bridgesOf(integration).has(leaf)).toBe(true);

    pdfLeaves.length = 0;
    fireWorkspaceSync();
    expect(bridgesOf(integration).has(leaf)).toBe(false);
    expect(timersOf(integration)).toBe(0);

    loadViewerInternals(view, toolbarRightEl);
    await new Promise((resolve) => setTimeout(resolve, 30));
    // No orphan timer resurrected a bridge for a leaf that is gone.
    expect(bridgesOf(integration).size).toBe(0);
    integration.detach();
  });
});

describe('PdfChatIntegration teardown resilience (D2: a bad bridge must not abort the sweep)', () => {
  it('detaches a level-C bridge (no toolbar button) without throwing', () => {
    const { leaf } = makePdfLeaf();
    const { app } = makeApp([leaf]);
    const integration = new PdfChatIntegration(app, makePorts(), {
      viewerReadyRetryDelaysMs: [60_000],
    });

    integration.attach(); // no viewer internals → level-C bridge, no button
    expect(integration.getLadderReport()?.level).toBe('C');
    expect(() => integration.detach()).not.toThrow();
    expect(bridgesOf(integration).size).toBe(0);
  });

  it('cleans up cleanly when the bridge is missing or malformed, and the sweep still releases the others', () => {
    const leafA = makePdfLeaf();
    const leafB = makePdfLeaf();
    const pdfLeaves: WorkspaceLeaf[] = [leafA.leaf, leafB.leaf];
    const { app, fireWorkspaceSync } = makeApp(pdfLeaves);
    const integration = new PdfChatIntegration(app, makePorts(), {
      viewerReadyRetryDelaysMs: [60_000],
    });

    integration.attach();
    expect(bridgesOf(integration).size).toBe(2);

    // The field failure shape: a failed mount leaves a Map entry without a
    // bridge object. The old teardown threw
    // "Cannot read properties of undefined (reading 'toolbarButton')" here
    // and aborted the whole cleanup loop.
    bridgesOf(integration).set(leafA.leaf, undefined);
    // A partially-formed bridge whose callback throws must not leak either.
    bridgesOf(integration).set(leafB.leaf, {
      leaf: leafB.leaf,
      decision: { level: 'C', reasons: ['injected'] },
      toolbarButton: null,
      onSelectionReleased: () => {
        throw new Error('injected teardown failure');
      },
    });

    pdfLeaves.length = 0;
    expect(() => fireWorkspaceSync()).not.toThrow();
    expect(bridgesOf(integration).size).toBe(0);

    // And a full detach afterwards stays clean.
    expect(() => integration.detach()).not.toThrow();
  });
});
