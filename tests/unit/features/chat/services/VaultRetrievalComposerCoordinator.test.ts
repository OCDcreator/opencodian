import type { VaultRetrievalSnippet } from '../../../../../src/core/memory';
import type { PromptContextItem } from '../../../../../src/core/types';
import {
  VaultRetrievalComposerCoordinator,
} from '../../../../../src/features/chat/services/VaultRetrievalComposerCoordinator';

function snippet(overrides: Partial<VaultRetrievalSnippet> & { path: string }): VaultRetrievalSnippet {
  return {
    startLine: 1,
    endLine: 4,
    score: 5,
    verbatim: false,
    text: 'snippet body',
    truncated: false,
    ...overrides,
  };
}

interface Harness {
  coordinator: VaultRetrievalComposerCoordinator;
  /** Retrieval-managed draft items (what the coordinator owns). */
  draft: PromptContextItem[];
  /** Manually attached draft items (what the user owns). */
  manual: PromptContextItem[];
  selectCalls: string[];
  setEnabled(enabled: boolean): void;
  setSnippets(snippets: readonly VaultRetrievalSnippet[]): void;
}

function createHarness(overrides: { enabled?: boolean } = {}): Harness {
  const draft: PromptContextItem[] = [];
  const manual: PromptContextItem[] = [];
  const selectCalls: string[] = [];
  let snippets: readonly VaultRetrievalSnippet[] = [];
  let enabled = overrides.enabled ?? true;

  const coordinator = new VaultRetrievalComposerCoordinator({
    facade: {
      getDraftContextItems(): PromptContextItem[] {
        return [...manual, ...draft];
      },
      mergeVaultRetrievalDraftItems(items: PromptContextItem[]): void {
        draft.length = 0;
        draft.push(...items);
      },
    },
    retrieval: {
      select: async (query: string) => {
        selectCalls.push(query);
        return snippets;
      },
    },
    getSettings: () => ({
      vaultRetrievalEnabled: enabled,
      vaultRetrievalTopK: 6,
      vaultRetrievalMaxCharsPerNote: 4000,
      vaultRetrievalExcludedPaths: [],
    }),
    getActiveTabId: () => 'tab-1',
  });

  return {
    coordinator,
    draft,
    manual,
    selectCalls,
    setEnabled(next: boolean) {
      enabled = next;
    },
    setSnippets(next: readonly VaultRetrievalSnippet[]) {
      snippets = next;
    },
  };
}

async function settle(ms = 700): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

describe('VaultRetrievalComposerCoordinator', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('is inert while the feature is off: no select calls, no draft mutations', async () => {
    const harness = createHarness({ enabled: false });
    harness.coordinator.onComposerInputChanged('find the deploy guide');
    await settle();
    expect(harness.selectCalls).toEqual([]);
    expect(harness.draft).toEqual([]);
    harness.coordinator.dispose();
  });

  it('clears stale managed chips when the feature is switched off', async () => {
    const harness = createHarness({ enabled: true });
    harness.setSnippets([snippet({ path: 'a.md' })]);
    harness.coordinator.onComposerInputChanged('deploy');
    await settle();
    expect(harness.draft.length).toBe(1);
    harness.setEnabled(false);
    harness.coordinator.onComposerInputChanged('deploy again');
    await settle();
    expect(harness.draft).toEqual([]);
    harness.coordinator.dispose();
  });

  it('injects retrieval chips with path, line range, snapshot and origin', async () => {
    const harness = createHarness();
    harness.setSnippets([
      snippet({ path: 'notes/deploy.md', startLine: 3, endLine: 9, text: 'deploy steps' }),
    ]);
    harness.coordinator.onComposerInputChanged('how do I deploy');
    await settle();
    expect(harness.draft.length).toBe(1);
    const item = harness.draft[0];
    expect(item.kind).toBe('selection');
    expect(item.path).toBe('notes/deploy.md');
    expect(item.lineRange).toEqual({ startLine: 3, endLine: 9 });
    expect(item.textSnapshot).toBe('deploy steps');
    expect(item.origin).toBe('vault-retrieval');
    expect(item.label).toBe('deploy.md:3-9');
    harness.coordinator.dispose();
  });

  it('debounces retrieval so a typing burst issues one select', async () => {
    const harness = createHarness();
    harness.setSnippets([]);
    harness.coordinator.onComposerInputChanged('d');
    await new Promise((resolve) => setTimeout(resolve, 30));
    harness.coordinator.onComposerInputChanged('de');
    await new Promise((resolve) => setTimeout(resolve, 30));
    harness.coordinator.onComposerInputChanged('deploy');
    await settle();
    expect(harness.selectCalls).toEqual(['deploy']);
    harness.coordinator.dispose();
  });

  it('drops candidates the user removed for the rest of the draft cycle', async () => {
    const harness = createHarness();
    harness.setSnippets([
      snippet({ path: 'keep.md' }),
      snippet({ path: 'removed.md' }),
    ]);
    harness.coordinator.onComposerInputChanged('query one');
    await settle();
    expect(harness.draft.length).toBe(2);

    // User removes exactly the "removed.md" chip; keep.md stays attached.
    const remaining = harness.draft.filter((item) => item.path !== 'removed.md');
    harness.draft.length = 0;
    harness.draft.push(...remaining);

    // A new refresh must not re-add the removed chip.
    harness.setSnippets([
      snippet({ path: 'keep.md' }),
      snippet({ path: 'removed.md' }),
      snippet({ path: 'fresh.md' }),
    ]);
    harness.coordinator.onComposerInputChanged('query one continues');
    await settle();
    expect(harness.draft.map((item) => item.path)).toEqual(['keep.md', 'fresh.md']);
    harness.coordinator.dispose();
  });

  it('resets cancellations at the submit boundary (new turn, fresh decision)', async () => {
    const harness = createHarness();
    harness.setSnippets([snippet({ path: 'a.md' })]);
    harness.coordinator.onComposerInputChanged('turn one');
    await settle();
    // Pipeline cleared the draft chips after the send; submit boundary resets.
    harness.coordinator.onComposerSubmitted();
    harness.draft.length = 0;
    harness.coordinator.onComposerInputChanged('turn two');
    await settle();
    expect(harness.draft.map((item) => item.path)).toEqual(['a.md']);
    harness.coordinator.dispose();
  });

  it('keeps existing chips when retrieval fails (fail-soft, nothing new injects)', async () => {
    const draft: PromptContextItem[] = [];
    let shouldThrow = false;
    const coordinator = new VaultRetrievalComposerCoordinator({
      facade: {
        getDraftContextItems: () => [...draft],
        mergeVaultRetrievalDraftItems: (items) => {
          draft.length = 0;
          draft.push(...items);
        },
      },
      retrieval: {
        select: async () => {
          if (shouldThrow) {
            throw new Error('index unavailable');
          }
          return [snippet({ path: 'ok.md' })];
        },
      },
      getSettings: () => ({
        vaultRetrievalEnabled: true,
        vaultRetrievalTopK: 6,
        vaultRetrievalMaxCharsPerNote: 4000,
        vaultRetrievalExcludedPaths: [],
      }),
      getActiveTabId: () => 'tab-1',
    });
    coordinator.onComposerInputChanged('first');
    await settle();
    expect(draft.length).toBe(1);
    shouldThrow = true;
    coordinator.onComposerInputChanged('second');
    await settle();
    expect(draft.length).toBe(1);
    expect(draft[0].path).toBe('ok.md');
    coordinator.dispose();
  });

  it('caps injected items at the configured top-K before chips are built', async () => {
    const draft: PromptContextItem[] = [];
    const coordinator = new VaultRetrievalComposerCoordinator({
      facade: {
        getDraftContextItems: () => [...draft],
        mergeVaultRetrievalDraftItems: (items) => {
          draft.length = 0;
          draft.push(...items);
        },
      },
      retrieval: {
        select: async () => Array.from({ length: 10 }, (_, i) => snippet({ path: `n${i}.md` })),
      },
      getSettings: () => ({
        vaultRetrievalEnabled: true,
        vaultRetrievalTopK: 6,
        vaultRetrievalMaxCharsPerNote: 4000,
        vaultRetrievalExcludedPaths: [],
      }),
      getActiveTabId: () => 'tab-1',
    });
    // The service enforces topK; the coordinator caps whatever it gets anyway.
    coordinator.onComposerInputChanged('query');
    await settle();
    expect(draft.length).toBeLessThanOrEqual(6);
    coordinator.dispose();
  });
});
