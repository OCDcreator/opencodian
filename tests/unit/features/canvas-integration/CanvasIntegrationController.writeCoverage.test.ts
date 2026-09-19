/**
 * CanvasIntegrationController text-node write coverage tests (R-C5, §6.2 /
 * acceptance 3): the rewrite flow runs against the REAL EditRevertService on
 * the shared in-memory vault harness, with the dialogs stubbed to auto-resolve.
 *
 * Pins the R-C5 measured-failure repairs:
 *  - the `.canvas` write opens a real R-B3 batch round (pre-image captured
 *    BEFORE the write) and records `notePluginWrite` on success;
 *  - coverage unavailable ⇒ the write is REFUSED (fail closed), never written
 *    unrevertable;
 *  - the write itself rides the host pipeline (`setData` + `requestSave(false)`
 *    — no duplicate history push) and flushes the view save immediately.
 */

import type { App, WorkspaceLeaf } from 'obsidian';

import type { AgentAuxQueryCapability } from '../../../../src/core/agents/backend/AgentAuxQueryCapability';
import { EditRevertService } from '../../../../src/core/storage/EditRevertService';
import { CanvasIntegrationController } from '../../../../src/features/canvas-integration/CanvasIntegrationController';
import type { CanvasAuxTarget } from '../../../../src/features/canvas-integration/CanvasNodeRewriteService';
import type { CanvasRewritePreviewModalOptions } from '../../../../src/features/canvas-integration/CanvasRewriteModals';
import {
  createHarnessService,
  EditRevertVaultHarness,
  settle,
} from '../../core/storage/EditRevertVaultHarness';

const CANVAS_PATH = 'boards/e2e.canvas';
const CANVAS_PRE = '{"nodes":[{"id":"n1","type":"text","x":0,"y":0,"width":250,"height":60,"text":"original"}],"edges":[]}';
const CONVERSATION_ID = 'conv-canvas-write';

const mockPreviewOptions: Array<CanvasRewritePreviewModalOptions> = [];
let mockPreviewConfirm = true;

jest.mock('../../../../src/features/canvas-integration/CanvasRewriteModals', () => ({
  CanvasRewriteInstructionModal: class {
    constructor(_app: unknown, opts: { onResolve: (value: string) => void }) {
      setTimeout(() => opts.onResolve('rewrite it'), 0);
    }

    open(): void {
      // Resolution is scheduled in the constructor.
    }
  },
  CanvasRewritePreviewModal: class {
    constructor(_app: unknown, opts: CanvasRewritePreviewModalOptions) {
      mockPreviewOptions.push(opts);
      setTimeout(() => {
        if (mockPreviewConfirm) {
          opts.onConfirm();
        } else {
          opts.onCancel();
        }
      }, 0);
    }

    open(): void {
      // Resolution is scheduled in the constructor.
    }
  },
  CanvasNodePickModal: class {
    constructor(_app: unknown, _rows: unknown, onResolve: (id: string | null) => void) {
      setTimeout(() => onResolve(null), 0);
    }

    open(): void {
      // Resolution is scheduled in the constructor.
    }
  },
}));

interface Fixture {
  harness: EditRevertVaultHarness;
  service: EditRevertService;
  notices: string[];
  setData: jest.fn;
  requestSave: jest.fn;
  saveImmediately: jest.fn;
  controller: CanvasIntegrationController;
}

async function buildFixture(options: { withRevert?: boolean; disableRevert?: boolean } = {}): Promise<Fixture> {
  const harness = new EditRevertVaultHarness();
  harness.vaultFiles.set(CANVAS_PATH, CANVAS_PRE);
  harness.folders.add('boards');
  const context = createHarnessService({
    harness,
    isEnabled: options.disableRevert ? () => false : undefined,
  });
  await context.service.initialize();
  await settle(context.service);

  const notices: string[] = [];
  const setData = jest.fn();
  const requestSave = jest.fn();
  // The host view save: persists the live canvas document through
  // vault.modify — modelled by writing the last setData payload to disk.
  const saveImmediately = jest.fn(async () => {
    const doc = setData.mock.calls.at(-1)?.[0];
    if (doc !== undefined) {
      harness.vaultFiles.set(CANVAS_PATH, JSON.stringify(doc));
    }
  });
  const view = {
    containerEl: document.createElement('div'),
    file: { path: CANVAS_PATH },
    saveImmediately,
    canvas: {
      selection: new Set([{
        getData: () => ({ id: 'n1', type: 'text', text: 'original' }),
      }]),
      getData: () => ({
        nodes: [{ id: 'n1', type: 'text', x: 0, y: 0, width: 250, height: 60, text: 'original' }],
        edges: [],
      }),
      setData,
      requestSave,
    },
  };
  const leaf = { view } as unknown as WorkspaceLeaf;
  const workspace = {
    getLeavesOfType: (type: string) => (type === 'canvas' ? [leaf] : []),
    on: () => ({ id: 1 }),
    offref: () => undefined,
    activeLeaf: leaf,
  };
  const app = { vault: harness.vault, workspace } as unknown as App;

  const auxTarget: CanvasAuxTarget = {
    adapter: {
      kind: 'opencode',
      displayName: 'OpenCode',
      getAuxQuery: () => ({
        kind: 'opencode',
        displayName: 'OpenCode',
        startAuxQuerySession: async () => ({
          queryId: 'q1',
          safety: {},
          query: async () => ({
            success: true as const,
            text: '<replacement>rewritten body</replacement>',
            toolCalls: [] as Array<{ name: string }>,
          }),
          followUp: jest.fn(),
          cancel: jest.fn(),
          dispose: jest.fn().mockResolvedValue(undefined),
        }),
      }) as unknown as AgentAuxQueryCapability,
      resolveModel: () => ({ ok: true, model: null }),
      getEffort: () => null,
    },
    workingDirectory: '/test-vault',
  };

  const controller = new CanvasIntegrationController({
    app,
    getEditRevert: () => (options.withRevert === false ? null : context.service),
    getActiveConversationId: () => CONVERSATION_ID,
    resolveAuxTarget: () => auxTarget,
    notify: (message) => notices.push(message),
  });
  controller.attach();
  return { harness, service: context.service, notices, setData, requestSave, saveImmediately, controller };
}

async function runRewrite(fixture: Fixture): Promise<void> {
  await fixture.controller.aiEditNodeFromCommand();
  await settle(fixture.service);
}

describe('CanvasIntegrationController text-node write coverage (R-C5 / §6.2)', () => {
  beforeEach(() => {
    mockPreviewOptions.length = 0;
    mockPreviewConfirm = true;
  });

  it('opens a real R-B3 round for the .canvas path and records the plugin write', async () => {
    const fixture = await buildFixture();
    await runRewrite(fixture);

    // The write rode the host pipeline: setData applied the rewrite and
    // requestSave carried pushHistory=false (no duplicate history push).
    expect(fixture.setData).toHaveBeenCalledTimes(1);
    expect(fixture.requestSave).toHaveBeenCalledWith(false);
    const doc = fixture.setData.mock.calls[0][0] as { nodes: Array<{ id: string; text?: string }> };
    expect(doc.nodes.find((node) => node.id === 'n1')?.text).toBe('rewritten body');
    // The view save was flushed so the recorded entry matches the vault.
    expect(fixture.saveImmediately).toHaveBeenCalledTimes(1);

    const model = fixture.service.getSidebarModel(CONVERSATION_ID);
    const entry = model.entries.find((candidate) => candidate.path === CANVAS_PATH);
    expect(entry).toMatchObject({ status: 'modified', revertible: true });
    const meta = fixture.service.getRoundMeta(model.roundId ?? '');
    expect(meta?.entries.find((candidate) => candidate.path === CANVAS_PATH)?.source).toBe('plugin');
    expect(model.roundOpen).toBe(false);
  });

  it('the recorded pre-image is the PRE-write canvas and one-click revert restores it', async () => {
    const fixture = await buildFixture();
    await runRewrite(fixture);

    // The flushed view save persisted the POST-write document...
    const persisted = fixture.harness.vaultFiles.get(CANVAS_PATH) ?? '';
    expect(persisted).toContain('rewritten body');
    // ...and the recorded pre-image is exactly the pre-write content.
    const result = await fixture.service.revertFile(CONVERSATION_ID, CANVAS_PATH);
    expect(result).toMatchObject({ ok: true, changed: 1 });
    expect(fixture.harness.vaultFiles.get(CANVAS_PATH)).toBe(CANVAS_PRE);
  });

  it('refuses the write (fail closed) when no revert surface is composed', async () => {
    const fixture = await buildFixture({ withRevert: false });
    await runRewrite(fixture);

    expect(fixture.setData).not.toHaveBeenCalled();
    expect(fixture.requestSave).not.toHaveBeenCalled();
    expect(fixture.harness.vaultFiles.get(CANVAS_PATH)).toBe(CANVAS_PRE);
    expect(fixture.notices.join('\n')).toContain('nothing was written');
  });

  it('refuses the write when the revert surface is composed but capture is disabled', async () => {
    const fixture = await buildFixture({ disableRevert: true });
    await runRewrite(fixture);

    expect(fixture.setData).not.toHaveBeenCalled();
    expect(fixture.harness.vaultFiles.get(CANVAS_PATH)).toBe(CANVAS_PRE);
    expect(fixture.notices.join('\n')).toContain('nothing was written');
    expect(fixture.service.getSidebarModel(CONVERSATION_ID).entries).toHaveLength(0);
  });

  it('discloses missing coverage in the preview before the confirm (both node kinds)', async () => {
    const fixture = await buildFixture({ withRevert: false });
    await runRewrite(fixture);
    expect(mockPreviewOptions).toHaveLength(1);
    expect(mockPreviewOptions[0].revertNote).toContain('No revert coverage');
  });

  it('shows no revert warning in the preview when coverage is composed', async () => {
    const fixture = await buildFixture();
    await runRewrite(fixture);
    expect(mockPreviewOptions).toHaveLength(1);
    expect(mockPreviewOptions[0].revertNote).toBeUndefined();
  });
});
