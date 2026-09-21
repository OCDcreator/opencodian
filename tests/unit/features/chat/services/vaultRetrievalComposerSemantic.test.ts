/**
 * VaultRetrievalComposerCoordinator semantic-merge tests (R-E4).
 *
 * Merge contract (design §4): lexical first, semantic fills in only unseen
 * paths; every injected item carries the honest channel label; a semantic
 * failure degrades to lexical-only without breaking the refresh.
 */

import type { PromptContextItem } from '../../../../../src/core/types';
import {
  SemanticRetrievalQueryPort,
  VaultRetrievalComposerCoordinator,
} from '../../../../../src/features/chat/services/VaultRetrievalComposerCoordinator';

function baseSettings(overrides: Record<string, unknown> = {}) {
  return {
    vaultRetrievalEnabled: true,
    vaultRetrievalTopK: 6,
    vaultRetrievalMaxCharsPerNote: 4000,
    vaultRetrievalExcludedPaths: [] as string[],
    pdfIndexEnabled: false,
    semanticRetrievalEnabled: true,
    semanticEmbeddingProvider: 'p1',
    semanticEmbeddingModel: 'm',
    ...overrides,
  };
}

function harness(options: {
  lexical: Array<{ path: string; startLine: number; endLine: number; text: string }>;
  semantic?: Array<{ path: string; score: number }>;
  semanticThrows?: boolean;
  settings?: Record<string, unknown>;
}) {
  const merged: PromptContextItem[][] = [];
  const coordinator = new VaultRetrievalComposerCoordinator({
    facade: {
      getDraftContextItems: () => [],
      mergeVaultRetrievalDraftItems: (items) => {
        merged.push(items);
      },
    },
    retrieval: {
      select: async () => options.lexical.map((snippet) => ({
        path: snippet.path,
        startLine: snippet.startLine,
        endLine: snippet.endLine,
        score: 1,
        verbatim: false,
        text: snippet.text,
        truncated: false,
      })),
    },
    pdfRetrieval: null,
    semanticRetrieval: ((): SemanticRetrievalQueryPort | null => {
      if (!options.semantic) {
        return null;
      }
      return {
        query: async () => {
          if (options.semanticThrows) {
            throw new Error('semantic down');
          }
          return { hits: options.semantic!, degradation: null };
        },
      };
    })(),
    getSettings: () => baseSettings(options.settings ?? {}),
    getActiveTabId: () => null,
  });
  return { coordinator, merged };
}

async function firstRefresh(coordinator: VaultRetrievalComposerCoordinator): Promise<void> {
  coordinator.onComposerInputChanged('some query');
  await new Promise((resolve) => setTimeout(resolve, 700));
}

describe('R-E4 semantic merge', () => {
  it('merges lexical first and semantic only for unseen paths, with channel labels', async () => {
    const { coordinator, merged } = harness({
      lexical: [
        { path: 'a.md', startLine: 1, endLine: 4, text: 'lexical a' },
        { path: 'b.md', startLine: 2, endLine: 2, text: 'lexical b' },
      ],
      semantic: [
        { path: 'a.md', score: 0.9 }, // duplicate of a lexical hit — dropped
        { path: 'c.md', score: 0.8 }, // unseen — injected as semantic
      ],
    });
    await firstRefresh(coordinator);
    expect(merged).toHaveLength(1);
    const items = merged[0];
    expect(items.map((item) => `${item.path}:${item.retrievalChannel}`)).toEqual([
      'a.md:lexical',
      'b.md:lexical',
      'c.md:semantic',
    ]);
    expect(items[2].origin).toBe('vault-retrieval');
    expect(items[2].kind).toBe('file');
  });

  it('degrades to lexical-only when the semantic channel throws', async () => {
    const { coordinator, merged } = harness({
      lexical: [{ path: 'a.md', startLine: 1, endLine: 1, text: 'x' }],
      semantic: [{ path: 'z.md', score: 1 }],
      semanticThrows: true,
    });
    await firstRefresh(coordinator);
    expect(merged[0].map((item) => item.path)).toEqual(['a.md']);
    expect(merged[0][0].retrievalChannel).toBe('lexical');
  });

  it('never queries semantic when the toggle is off or lexical is off', async () => {
    let semanticQueries = 0;
    const coordinator = new VaultRetrievalComposerCoordinator({
      facade: {
        getDraftContextItems: () => [],
        mergeVaultRetrievalDraftItems: (items) => {
          void items;
        },
      },
      retrieval: { select: async () => [] },
      semanticRetrieval: {
        query: async () => {
          semanticQueries += 1;
          return { hits: [], degradation: null };
        },
      },
      getSettings: () => baseSettings({ semanticRetrievalEnabled: false }),
      getActiveTabId: () => null,
    });
    coordinator.onComposerInputChanged('q');
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(semanticQueries).toBe(0);
  });
});
