import { OpenCodeContextPartSerializer } from '../../../../src/core/opencode/OpenCodeContextPartSerializer';
import { type PdfIndexFs,PdfIndexService } from '../../../../src/core/pdf';
import { pdfIndexFingerprint } from '../../../../src/core/pdf/pdfIndexFormat';
import { PdfEngineLoader } from '../../../../src/core/pdf/pdfTextEngine';
import type { PromptContextItem } from '../../../../src/core/types';
import { VaultRetrievalComposerCoordinator } from '../../../../src/features/chat/services/VaultRetrievalComposerCoordinator';
import {
  buildContextAttachment,
  parseObsidianContextTag,
} from '../../../../src/shared';

function pdfDocumentItem(overrides: Partial<PromptContextItem> = {}): PromptContextItem {
  return {
    id: 'ctx-1',
    kind: 'pdf_document',
    path: 'docs/paper.pdf',
    label: 'paper.pdf',
    mime: 'application/pdf',
    pdf: {
      textLayerPresent: true,
      pageCount: 2,
      extractedChars: 22,
      extraction: 'embedded',
    },
    pdfPages: [
      { page: 1, text: 'first page body' },
      { page: 2, text: 'second page body' },
    ],
    ...overrides,
  };
}

describe('R-C4 context entry contract (backend-agnostic serialization)', () => {
  const local = new OpenCodeContextPartSerializer({ isLocalServerMode: () => true, getVaultPath: () => '/v' });
  const remote = new OpenCodeContextPartSerializer({ isLocalServerMode: () => false, getVaultPath: () => undefined });

  it('serializes pdf_document to the SAME text part in local and remote mode', () => {
    const item = pdfDocumentItem();
    const localPart = local.createPromptContextPart(item);
    const remotePart = remote.createPromptContextPart(item);
    expect(localPart).toEqual(remotePart);
    expect(localPart.type).toBe('text');
    expect((localPart as { text: string }).synthetic).toBe(true);
    expect((localPart as { text: string }).text).toContain('<obsidian_context kind="pdf_document" path="docs/paper.pdf">');
    expect((localPart as { text: string }).text).toContain('[第 1 页]\nfirst page body');
    expect((localPart as { text: string }).text).toContain('共 2 页');
  });

  it('serializes pdf_selection with page + range locator, identical across modes', () => {
    const item: PromptContextItem = {
      id: 'ctx-2',
      kind: 'pdf_selection',
      path: 'docs/paper.pdf',
      label: 'paper.pdf',
      mime: 'application/pdf',
      pdf: { textLayerPresent: true, pageCount: 2, extractedChars: 17, extraction: 'embedded' },
      pdfSelection: { page: 3, rangeStr: '0,1,2,3', text: 'chosen sentence' },
    };
    const localPart = local.createPromptContextPart(item) as { text: string };
    expect(localPart.text).toBe(remote.createPromptContextPart(item).text);
    expect(localPart.text).toContain('kind="pdf_selection"');
    expect(localPart.text).toContain('page="3"');
    expect(localPart.text).toContain('selection="0,1,2,3"');
    expect(localPart.text).toContain('chosen sentence');
  });

  it('never writes textSnapshot on PDF items (note-text-only contract)', () => {
    const item = pdfDocumentItem();
    expect(item.textSnapshot).toBeUndefined();
    const tag = local.createPromptContextPart(item) as { text: string };
    expect(tag.text).not.toContain('textSnapshot');
    const attachment = buildContextAttachment(item);
    expect(attachment.textSnapshot).toBeUndefined();
  });

  it('persists pdf metadata and the bounded selection locator, never pdfPages', () => {
    const attachment = buildContextAttachment(pdfDocumentItem({
      pdfSelection: { page: 4, text: 'x'.repeat(500) },
    }));
    expect(attachment.pdf?.pageCount).toBe(2);
    expect(attachment.pdfSelection?.page).toBe(4);
    expect(attachment.pdfSelection!.text.length).toBeLessThanOrEqual(201);
    expect(attachment).not.toHaveProperty('pdfPages');
  });

  it('parseObsidianContextTag accepts the new kinds (round-trip)', () => {
    for (const kind of ['pdf_document', 'pdf_selection'] as const) {
      const parsed = parseObsidianContextTag(`<obsidian_context kind="${kind}" path="p.pdf">body</obsidian_context>`);
      expect(parsed?.kind).toBe(kind);
      expect(parsed?.path).toBe('p.pdf');
    }
  });

  it('fail-closes in remote mode when a pdf payload exceeds the text cap', () => {
    const item = pdfDocumentItem({
      pdfPages: [{ page: 1, text: 'x'.repeat(80 * 1024) }],
    });
    expect(() => remote.createPromptContextPart(item)).toThrow(/remote size limit/);
    // Local mode has no byte cap (attach-time limits already bounded it).
    expect(() => local.createPromptContextPart(item)).not.toThrow();
  });
});

describe('R-C4 off-state contract (byte-identical requests when pdfIndexEnabled=false)', () => {
  function makeFsDouble(): PdfIndexFs {
    return {
      listPdfFiles: async () => [{ path: 'a.pdf', mtimeMs: 1, size: 1 }],
      readPdfBinary: async () => null,
      writeIndexFileAtomic: async () => undefined,
      readIndexFile: async () => null,
      deleteIndexFile: async () => undefined,
    };
  }

  it('the index service makes no reads, no writes and no engine loads while off', async () => {
    const fsDouble = makeFsDouble();
    let engineLoads = 0;
    const service = new PdfIndexService();
    service.attach(
      fsDouble,
      () => ({
        pdfIndexEnabled: false,
        vaultRetrievalTopK: 6,
        vaultRetrievalMaxCharsPerNote: 4000,
        vaultRetrievalExcludedPaths: [],
      }),
      async () => {
        engineLoads += 1;
        throw new Error('engine must never load while off');
      },
    );
    await service.onSettingsChanged();
    await service.rebuildAll();
    expect(engineLoads).toBe(0);
    expect(await service.select('anything')).toEqual([]);
    service.dispose();
  });

  it('the engine loader requires nothing before load() is called', () => {
    const loader = new PdfEngineLoader({ getPluginDir: () => '/unused' });
    expect(loader.isLoaded()).toBe(false);
  });

  it('fingerprint stability means identical index paths across rebuilds', () => {
    const meta = { path: 'a.pdf', mtimeMs: 5, size: 9 };
    expect(pdfIndexFingerprint(meta)).toBe(pdfIndexFingerprint({ ...meta }));
  });
});

describe('R-C4 composer coordinator contract (pdf hits ride the managed chips)', () => {
  function flushDebounce(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 700));
  }

  function makeCoordinator(overrides: {
    vaultRetrievalEnabled?: boolean;
    pdfIndexEnabled?: boolean;
    pdfHits?: SelectedPdfSnippet[];
  }) {
    const draft: PromptContextItem[] = [];
    let pdfCalls = 0;
    const coordinator = new VaultRetrievalComposerCoordinator({
      facade: {
        getDraftContextItems: () => [...draft],
        mergeVaultRetrievalDraftItems: (items) => {
          draft.length = 0;
          draft.push(...items);
        },
      },
      retrieval: {
        select: async () => [],
      },
      pdfRetrieval: {
        select: async () => {
          pdfCalls += 1;
          return overrides.pdfHits ?? [];
        },
      },
      getSettings: () => ({
        vaultRetrievalEnabled: overrides.vaultRetrievalEnabled ?? false,
        vaultRetrievalTopK: 6,
        vaultRetrievalMaxCharsPerNote: 4000,
        vaultRetrievalExcludedPaths: [],
        pdfIndexEnabled: overrides.pdfIndexEnabled ?? false,
      }),
      getActiveTabId: () => 'tab-1',
    });
    return { coordinator, draft, getPdfCalls: () => pdfCalls };
  }

  it('injects a pdf hit as a pdf_document fragment chip with no textSnapshot', async () => {
    const { coordinator, draft } = makeCoordinator({
      pdfIndexEnabled: true,
      pdfHits: [{
        pdfPath: 'docs/paper.pdf',
        chunkId: 'docs/paper.pdf#p3-4',
        pageFrom: 3,
        pageTo: 4,
        score: 5,
        verbatim: false,
        text: 'matched fragment text',
        truncated: false,
      }],
    });
    coordinator.onComposerInputChanged('query');
    await flushDebounce();
    expect(draft).toHaveLength(1);
    expect(draft[0].kind).toBe('pdf_document');
    expect(draft[0].origin).toBe('vault-retrieval');
    expect(draft[0].pdf?.fragment).toEqual({ pageFrom: 3, pageTo: 4 });
    expect(draft[0].pdfPages).toEqual([{ page: 3, text: 'matched fragment text' }]);
    expect(draft[0].textSnapshot).toBeUndefined();
    coordinator.dispose();
  });

  it('makes no pdf retrieval calls while pdfIndexEnabled is off (byte-identical requests)', async () => {
    const { coordinator, draft, getPdfCalls } = makeCoordinator({
      pdfIndexEnabled: false,
      vaultRetrievalEnabled: true,
      pdfHits: [{
        pdfPath: 'docs/paper.pdf',
        chunkId: 'c',
        pageFrom: 1,
        pageTo: 1,
        score: 5,
        verbatim: false,
        text: 'should not inject',
        truncated: false,
      }],
    });
    coordinator.onComposerInputChanged('query');
    await flushDebounce();
    expect(getPdfCalls()).toBe(0);
    expect(draft).toHaveLength(0);
    coordinator.dispose();
  });
});
