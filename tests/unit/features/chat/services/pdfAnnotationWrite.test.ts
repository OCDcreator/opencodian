import {
  annotationsSidecarPathFor,
  buildAnnotationEntry,
} from '../../../../../src/core/pdf/pdfAnnotation';
import type { Conversation } from '../../../../../src/core/types';
import { PdfChatIntegration } from '../../../../../src/features/chat/services/PdfChatIntegration';
import {
  CONVERSATION_ID,
  createHarnessService,
  EditRevertVaultHarness,
  type HarnessService,
  settle,
} from '../../../core/storage/EditRevertVaultHarness';

/**
 * R-C4 annotation write contract: the ONLY new write path of this feature.
 * Runs the real EditRevertService over the shared in-memory vault harness —
 * proving pre-snapshot ordering, revert and restore symmetry, and that the
 * PDF binary itself never changes.
 */

const PDF_PATH = 'docs/paper.pdf';
const PDF_BYTES = 'raw-pdf-bytes-do-not-touch';

function buildIntegration(harness: EditRevertVaultHarness, service: HarnessService['service']): PdfChatIntegration {
  const app = { vault: harness.vault } as unknown as ConstructorParameters<typeof PdfChatIntegration>[0];
  const conversation: Conversation = {
    id: CONVERSATION_ID,
    title: 't',
    createdAt: 1,
    updatedAt: 1,
    messageCount: 2,
    messages: [
      {
        id: 'u1',
        role: 'user',
        content: 'What does the abstract claim?',
        timestamp: 1,
        contextAttachments: [{
          kind: 'pdf_selection',
          path: PDF_PATH,
          label: 'paper.pdf',
          mime: 'application/pdf',
          pdfSelection: { page: 3, rangeStr: '0,1,2,3', text: 'selected claim' },
        }],
      },
      { id: 'a1', role: 'assistant', content: 'It claims page-anchored retrieval works.', timestamp: 2 },
    ],
  };
  return new PdfChatIntegration(app, {
    attachContextItemToActiveChat: async () => undefined,
    openChat: async () => undefined,
    getActiveConversation: () => conversation,
    getEditRevert: () => service,
    buildPdfSelectionItem: () => null,
  });
}

const ENTRY = buildAnnotationEntry({
  timestamp: new Date(2026, 8, 18, 12, 0),
  pdfPath: PDF_PATH,
  selection: { page: 3, rangeStr: '0,1,2,3', text: 'selected claim' },
  question: 'What does the abstract claim?',
  answer: 'It claims page-anchored retrieval works.',
});

async function startedHarness(): Promise<{
  harness: EditRevertVaultHarness;
  context: HarnessService;
  integration: PdfChatIntegration;
  sidecarPath: string;
}> {
  const harness = new EditRevertVaultHarness();
  const context = createHarnessService({ harness });
  harness.vaultFiles.set(PDF_PATH, PDF_BYTES);
  harness.folders.add('docs');
  await context.service.initialize();
  await settle(context.service);
  const integration = buildIntegration(harness, context.service);
  return { harness, context, integration, sidecarPath: annotationsSidecarPathFor(PDF_PATH) };
}

describe('R-C4 sidecar annotation write (revert-covered contract)', () => {
  it('appends to an existing sidecar via vault.process and reverts to the pre-write content', async () => {
    const { harness, context, integration, sidecarPath } = await startedHarness();
    harness.vaultFiles.set(sidecarPath, '# Annotations\n');
    await settle(context.service);

    await integration.applyAnnotationWrite(CONVERSATION_ID, sidecarPath, ENTRY);
    await settle(context.service);

    const content = harness.vaultFiles.get(sidecarPath) ?? '';
    expect(content.startsWith('# Annotations\n\n')).toBe(true);
    expect(content).toContain('- 2026-09-18 12:00 ·');
    expect(content).toContain('> selected claim');
    // The PDF binary is byte-identical before and after.
    expect(harness.vaultFiles.get(PDF_PATH)).toBe(PDF_BYTES);

    const reverted = await context.service.revertFile(CONVERSATION_ID, sidecarPath);
    expect(reverted.ok).toBe(true);
    await settle(context.service);
    expect(harness.vaultFiles.get(sidecarPath)).toBe('# Annotations\n');
    expect(harness.vaultFiles.get(PDF_PATH)).toBe(PDF_BYTES);
  });

  it('creates a missing sidecar via vault.create and removes it from the vault on revert', async () => {
    const { harness, context, integration, sidecarPath } = await startedHarness();
    expect(harness.vaultFiles.has(sidecarPath)).toBe(false);

    await integration.applyAnnotationWrite(CONVERSATION_ID, sidecarPath, ENTRY);
    await settle(context.service);
    const created = harness.vaultFiles.get(sidecarPath);
    expect(created).toContain('[[docs/paper.pdf#page=3&selection=0,1,2,3]]');

    const reverted = await context.service.revertFile(CONVERSATION_ID, sidecarPath);
    expect(reverted.ok).toBe(true);
    await settle(context.service);
    // A created-file revert must not leave the file as if it always existed:
    // it is gone from the vault (the R-B3 created-entry path trashes it).
    expect(harness.vaultFiles.has(sidecarPath)).toBe(false);
    expect(harness.trashLog.some((row) => row.path === sidecarPath || row.path.endsWith(sidecarPath))).toBe(true);
  });

  it('restores symmetrically: revert then restore brings the annotation back', async () => {
    const { harness, context, integration, sidecarPath } = await startedHarness();
    harness.vaultFiles.set(sidecarPath, '# Annotations\n');
    await settle(context.service);

    await integration.applyAnnotationWrite(CONVERSATION_ID, sidecarPath, ENTRY);
    await settle(context.service);
    const afterWrite = harness.vaultFiles.get(sidecarPath) ?? '';

    await context.service.revertFile(CONVERSATION_ID, sidecarPath);
    await settle(context.service);
    const restored = await context.service.restoreFile(CONVERSATION_ID, sidecarPath);
    expect(restored.ok).toBe(true);
    await settle(context.service);
    expect(harness.vaultFiles.get(sidecarPath) ?? '').toBe(afterWrite);
  });

  it('writes nothing when vault.process throws (zero-change failure)', async () => {
    const { harness, context, sidecarPath } = await startedHarness();
    harness.vaultFiles.set(sidecarPath, 'original');
    await settle(context.service);

    const failingVault = {
      ...harness.vault,
      process: async () => {
        throw new Error('vault locked');
      },
    };
    const failingIntegration = new PdfChatIntegration(
      { vault: failingVault } as unknown as ConstructorParameters<typeof PdfChatIntegration>[0],
      {
        attachContextItemToActiveChat: async () => undefined,
        openChat: async () => undefined,
        getActiveConversation: () => null,
        getEditRevert: () => context.service,
        buildPdfSelectionItem: () => null,
      },
    );
    await failingIntegration.applyAnnotationWrite(CONVERSATION_ID, sidecarPath, ENTRY);
    await settle(context.service);
    expect(harness.vaultFiles.get(sidecarPath)).toBe('original');
    expect(harness.vaultFiles.get(PDF_PATH)).toBe(PDF_BYTES);
  });
});
