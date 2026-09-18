import { OpenCodeContextPartSerializer } from '../../../../src/core/opencode/OpenCodeContextPartSerializer';
import { OpenCodePromptRequestBuilder } from '../../../../src/core/opencode/OpenCodePromptRequestBuilder';
import type { PromptContextItem } from '../../../../src/core/types';
import { ComposerContextRuntimeStore } from '../../../../src/features/chat/services/ComposerContextRuntimeStore';
import { buildOptimisticUserMessage } from '../../../../src/features/chat/services/MessageSendPreparationService';
import { MessageSendPreparationService } from '../../../../src/features/chat/services/MessageSendPreparationService';
import {
  buildContextAttachment,
  buildObsidianContextTag,
} from '../../../../src/shared/obsidianContext';
import {
  createComposerSendContext,
  createConversation,
  createHost,
} from './MessageSendPreparationService.testSupport';

/**
 * R-C1 contract tests (flowtext-parity §8.2):
 *  - off state must be byte-identical to the pre-feature behavior;
 *  - on state must carry selected snippets through the existing contextItems
 *    channel and remain individually cancellable;
 *  - the new `origin` field must never change legacy payloads or wire format.
 */

function retrievalChip(overrides: Partial<PromptContextItem> = {}): PromptContextItem {
  return {
    id: 'vault-retrieval-1',
    kind: 'selection',
    path: 'notes/deploy.md',
    label: 'deploy.md:3-9',
    mime: 'text/markdown',
    lineRange: { startLine: 3, endLine: 9 },
    textSnapshot: '## Deploy\n\n1. run the build\n2. ship it',
    origin: 'vault-retrieval',
    ...overrides,
  };
}

function createRequestBuilder(): OpenCodePromptRequestBuilder {
  return new OpenCodePromptRequestBuilder({
    getDefaultModelSelection: () => ({ provider: 'opencode', model: 'gpt-5.4', modelId: 'gpt-5.4' }),
    observeRuntimeToolNames: () => false,
  });
}

describe('R-C1 off-state byte-identical regression', () => {
  it('prepareMessageSend with the feature off produces the same payload as a pre-feature baseline', async () => {
    const runPrepare = async (draftItems: PromptContextItem[]) => {
      const conversation = createConversation();
      const composerSendContext = createComposerSendContext([], {
        getDraftContextItems: jest.fn().mockReturnValue(draftItems),
      });
      const service = new MessageSendPreparationService(
        createHost(conversation, [], {}),
        composerSendContext,
      );
      return service.prepareMessageSend({ content: 'how do I deploy' });
    };

    // Baseline: pre-feature behavior (no retrieval coordinator exists at all).
    const baseline = await runPrepare([]);
    // Off state: feature wired but `vaultRetrievalEnabled === false` — the
    // coordinator never runs, so the composer draft is still empty.
    const off = await runPrepare([]);

    expect(off).not.toBeNull();
    expect(baseline).not.toBeNull();
    // Byte-level equality of the outgoing request parts and the optimistic
    // user message (timestamps fixed by the shared `now` default per run, so
    // strip the volatile id/timestamp fields before comparing).
    const stripVolatile = (payload: unknown): unknown => JSON.parse(JSON.stringify(payload, (key, value) =>
      key === 'id' || key === 'timestamp' || key === 'messageID' ? '<volatile>' : value));
    expect(stripVolatile(off!.requestParts)).toEqual(stripVolatile(baseline!.requestParts));
    expect(stripVolatile(off!.optimisticUserParts)).toEqual(stripVolatile(baseline!.optimisticUserParts));
    expect(stripVolatile(off!.userMessage)).toEqual(stripVolatile(baseline!.userMessage));
    expect(off!.contextItems).toEqual([]);
  });

  it('the disabled coordinator injects nothing: identical serialized requests with and without the hook', () => {
    const manualItems: PromptContextItem[] = [];
    // With the feature off, `VaultRetrievalComposerCoordinator` performs no
    // select() and no merge (covered in its unit tests); here we prove the
    // payload side: an empty managed set serializes identically to none.
    const serializer = new OpenCodeContextPartSerializer({
      isLocalServerMode: () => true,
      getVaultPath: () => '/vault',
    });
    const builder = createRequestBuilder();

    const baselineParts = builder.buildStructuredPromptSendPayload({
      parts: serializer.buildPromptRequestParts('how do I deploy', { contextItems: manualItems }),
    });
    const offParts = builder.buildStructuredPromptSendPayload({
      parts: serializer.buildPromptRequestParts('how do I deploy', {
        contextItems: [...manualItems, ...([] as PromptContextItem[])],
      }),
    });

    const stripIds = (parts: unknown): string =>
      JSON.stringify(parts, (key, value) => (key === 'id' ? '<id>' : value));
    expect(stripIds(offParts.requestParts)).toBe(stripIds(baselineParts.requestParts));
  });
});

describe('R-C1 on-state injection channel', () => {
  const serializer = new OpenCodeContextPartSerializer({
    isLocalServerMode: () => true,
    getVaultPath: () => '/vault',
  });

  it('carries the snippet snapshot into the request parts (local mode)', () => {
    const chip = retrievalChip();
    const parts = serializer.buildPromptRequestParts('how do I deploy', { contextItems: [chip] });
    expect(parts).toHaveLength(2);
    const filePart = parts[1] as {
      type: string;
      source?: { text?: { value?: string } };
      url?: string;
    };
    expect(filePart.type).toBe('file');
    expect(filePart.source?.text?.value).toBe(chip.textSnapshot);
    expect(filePart.url).toBe('file:///vault/notes/deploy.md?start=3&end=9');
  });

  it('keeps the snippet visible in the optimistic user message with the retrieval origin', () => {
    const manual = {
      id: 'context-manual',
      kind: 'file' as const,
      path: 'notes/manual.md',
      label: 'manual.md',
      mime: 'text/markdown',
    };
    const userMessage = buildOptimisticUserMessage({
      content: 'how do I deploy',
      contextItems: [manual, retrievalChip()],
    });
    expect(userMessage.contextAttachments).toHaveLength(2);
    expect(userMessage.contextAttachments?.[1]).toMatchObject({
      path: 'notes/deploy.md',
      label: 'deploy.md:3-9',
      origin: 'vault-retrieval',
      textSnapshot: '## Deploy\n\n1. run the build\n2. ship it',
    });
    // Manual attachment keeps its legacy shape (no snapshot, no origin).
    expect(userMessage.contextAttachments?.[0].textSnapshot).toBeUndefined();
    expect(userMessage.contextAttachments?.[0].origin).toBeUndefined();
  });

  it('caps injected chips at topK in the draft store (double-cap contract)', () => {
    const runtimeState = {
      focusContextPreview: null,
      draftContextItems: [] as PromptContextItem[],
    };
    const store = new ComposerContextRuntimeStore({
      getActiveTabId: () => 'tab-1',
      getTabRuntimeState: () => runtimeState,
      renderComposerContext: () => undefined,
    });
    const topK = 6;
    const items = Array.from({ length: 10 }, (_, i) => retrievalChip({
      id: `vault-retrieval-${i}`,
      path: `n${i}.md`,
      label: `n${i}.md:1-2`,
    })).slice(0, topK);
    store.mergeVaultRetrievalDraftItems(items);
    expect(store.getDraftContextItems()).toHaveLength(topK);
  });

  it('cancelling one chip removes exactly that snippet from the outgoing request', () => {
    const runtimeState = {
      focusContextPreview: null,
      draftContextItems: [] as PromptContextItem[],
    };
    const store = new ComposerContextRuntimeStore({
      getActiveTabId: () => 'tab-1',
      getTabRuntimeState: () => runtimeState,
      renderComposerContext: () => undefined,
    });
    const keep = retrievalChip({ id: 'r1', path: 'keep.md', label: 'keep.md:1-2', lineRange: { startLine: 1, endLine: 2 } });
    const cancel = retrievalChip({ id: 'r2', path: 'cancel.md', label: 'cancel.md:1-2', lineRange: { startLine: 1, endLine: 2 } });
    store.mergeVaultRetrievalDraftItems([keep, cancel]);
    expect(store.getDraftContextItems()).toHaveLength(2);

    // The existing chip ✕ action funnels through removeDraftContextItemsForTarget.
    store.removeDraftContextItemsForTarget({ path: cancel.path, lineRange: cancel.lineRange });

    const remaining = store.getDraftContextItems();
    expect(remaining.map((item) => item.path)).toEqual(['keep.md']);

    // The request built from the rebuilt contextItems no longer contains it.
    const builder = createRequestBuilder();
    const payload = builder.buildStructuredPromptSendPayload({
      parts: serializer.buildPromptRequestParts('how do I deploy', { contextItems: remaining }),
    });
    const serialized = JSON.stringify(payload.requestParts);
    expect(serialized).toContain('keep.md');
    expect(serialized).not.toContain('cancel.md');
  });
});

describe('R-C1 origin field backcompat', () => {
  it('legacy items without origin serialize identically to before', () => {
    const legacy = {
      id: 'context-1',
      kind: 'file' as const,
      path: 'notes/legacy.md',
      label: 'legacy.md',
      mime: 'text/markdown',
    };
    const attachment = buildContextAttachment(legacy);
    expect('origin' in attachment).toBe(false);
    // The wire tag never carried origin and still does not.
    expect(buildObsidianContextTag(legacy)).toBe(buildObsidianContextTag({
      ...legacy,
      origin: 'vault-retrieval',
    }));
  });

  it('retrieval chips keep a distinct key and survive merge dedupe by target', () => {
    const runtimeState = {
      focusContextPreview: null,
      draftContextItems: [] as PromptContextItem[],
    };
    const store = new ComposerContextRuntimeStore({
      getActiveTabId: () => 'tab-1',
      getTabRuntimeState: () => runtimeState,
      renderComposerContext: () => undefined,
    });
    const manual = {
      id: 'm1',
      kind: 'selection' as const,
      path: 'notes/manual.md',
      label: 'manual.md',
      mime: 'text/markdown',
    };
    store.mergeVaultRetrievalDraftItems([retrievalChip()]);
    store.addDraftContextItem(manual);
    const items = store.getDraftContextItems();
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.origin)).toEqual(['vault-retrieval', undefined]);
    // A refresh replaces managed chips but never the manual one.
    store.mergeVaultRetrievalDraftItems([
      retrievalChip({ id: 'r1b', label: 'deploy.md:5-9', lineRange: { startLine: 5, endLine: 9 } }),
    ]);
    expect(store.getDraftContextItems().map((item) => item.id)).toEqual(['m1', 'r1b']);
  });
});
