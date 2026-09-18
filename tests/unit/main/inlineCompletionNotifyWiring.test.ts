/**
 * Composition-level wiring proof for the R-C3 honesty notices (defect
 * R-C3-D1).
 *
 * The unit suites inject a `notify` spy and assert the message text, so they
 * cannot catch the composition root forgetting to pass the callback at all —
 * which is exactly the production defect: main.ts constructed both the pool
 * and the controller without `notify`, and every refusal message
 * (`sessionUnavailable`, `unsupportedAfterFailures`, `writeToolObserved`, and
 * the controller's `unsupported` report) was silently dropped, violating
 * §6.4 (a refusal must be reported, not swallowed) and §6.7 (capability gaps
 * must be shown truthfully).
 *
 * These tests run the REAL production composition — an `OpenCodianPlugin`
 * instance plus the real `configureInlineCompletion()` — and assert that the
 * failure messages land in a real Obsidian `Notice` (the mocked obsidian
 * module captures every construction), end to end through the wiring instead
 * of through an injected spy. `notify` is now a REQUIRED option, so a future
 * composition omission also fails to compile; this suite additionally proves
 * the wired callback actually delivers.
 */

import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { capturedNotices, clearCapturedNotices } from 'obsidian';

import { AUX_DENIED_CAPABILITIES } from '../../../src/core/agents/backend/AgentAuxQueryCapability';
import type {
  InlineCompletionSession,
  InlineCompletionTurnResult,
} from '../../../src/core/agents/backend/AgentInlineCompletionCapability';
import { DEFAULT_SETTINGS } from '../../../src/core/types';
import type { InlineCompletionController } from '../../../src/features/inline-edit/InlineCompletionController';
import type {
  InlineCompletionService,
  InlineCompletionTarget,
} from '../../../src/features/inline-edit/InlineCompletionService';
import OpenCodianPlugin from '../../../src/main';

(globalThis as { BUILD_ID?: string }).BUILD_ID = 'test-build';

type WiredPlugin = OpenCodianPlugin & {
  settings: typeof DEFAULT_SETTINGS;
  app: unknown;
  configureInlineCompletion(): void;
  resolveInlineCompletionTarget(): InlineCompletionTarget;
  inlineCompletionPool: InlineCompletionService;
  inlineCompletionController: InlineCompletionController;
};

/** Construct the plugin and run the real production composition under test. */
function createWiredPlugin(): WiredPlugin {
  const plugin = new OpenCodianPlugin() as WiredPlugin;
  plugin.app = { workspace: { getActiveViewOfType: () => null } };
  plugin.settings = { ...DEFAULT_SETTINGS, inlineCompletionEnabled: true };
  plugin.configureInlineCompletion();
  return plugin;
}

/** Stub only the backend-resolution seam (real adapters in production). */
function spyCompletionTarget(plugin: WiredPlugin, target: InlineCompletionTarget): void {
  jest
    .spyOn(
      plugin as unknown as { resolveInlineCompletionTarget(): InlineCompletionTarget },
      'resolveInlineCompletionTarget',
    )
    .mockReturnValue(target);
}

function okTarget(backend: 'opencode' | 'pi', startSession: () => Promise<InlineCompletionSession>): InlineCompletionTarget {
  return {
    ok: true,
    backend,
    displayName: backend === 'pi' ? 'Pi' : 'OpenCode',
    workingDirectory: '/vault',
    model: null,
    effort: null,
    startSession,
  };
}

function stubSession(): InlineCompletionSession {
  return {
    queryId: 'stub-completion',
    safety: {
      backend: 'opencode',
      enforcedPolicy: 'read-only-allowlist',
      effectiveTools: ['read'],
      deniedCapabilities: AUX_DENIED_CAPABILITIES,
      mechanism: 'stub',
    },
    complete() {
      return Promise.resolve<InlineCompletionTurnResult>({ ok: true, text: '', toolCalls: [] });
    },
    reset() {
      return Promise.resolve();
    },
    dispose() {
      return Promise.resolve();
    },
  };
}

async function flush(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function makeEditorView(doc: string): { view: EditorView; destroy(): void } {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({ state: EditorState.create({ doc }), parent });
  return {
    view,
    destroy(): void {
      view.destroy();
      parent.remove();
    },
  };
}

describe('InlineCompletion composition notify wiring (R-C3-D1 regression guard)', () => {
  beforeEach(() => {
    clearCapturedNotices();
  });

  afterEach(() => {
    clearCapturedNotices();
  });

  it('delivers the start-failure notice through the production pool wiring', async () => {
    const plugin = createWiredPlugin();
    spyCompletionTarget(plugin, okTarget(
      'pi',
      () => Promise.reject(new Error('read-only proof failed')),
    ));

    const refused = await plugin.inlineCompletionPool.obtain();

    expect(refused.ok).toBe(false);
    // One real Obsidian Notice reached the user — not a swallowed refusal.
    expect(capturedNotices).toHaveLength(1);
    expect(capturedNotices[0]).toContain('Could not start');
    expect(capturedNotices[0]).toContain('Pi');
    expect(capturedNotices[0]).toContain('read-only proof failed');
    expect(plugin.inlineCompletionPool.isUnsupported('pi')).toBe(true);
  });

  it('delivers the unsupported notice when the controller triggers on an unusable backend (the live symptom)', async () => {
    const plugin = createWiredPlugin();
    spyCompletionTarget(plugin, okTarget(
      'pi',
      () => Promise.reject(new Error('no read-only proof')),
    ));
    await plugin.inlineCompletionPool.obtain(); // marks pi unsupported for the cycle
    clearCapturedNotices();

    // The exact live defect: the Alt gesture path reports through the
    // controller's pool-error branch, which was dead without a wired notify.
    const editor = makeEditorView('hello');
    plugin.inlineCompletionController.trigger({ cm: editor.view } as never, 'notes/a.md');
    await flush();

    expect(capturedNotices).toHaveLength(1);
    // The `unsupported` branch interpolates the raw backend kind (lowercase
    // 'pi'), not the display name — wording is owned by the locale string;
    // this suite only proves delivery.
    expect(capturedNotices[0]).toContain('pi');
    editor.destroy();
  });

  it('delivers the unsupportedAfterFailures notice through the production pool wiring', async () => {
    const plugin = createWiredPlugin();
    spyCompletionTarget(plugin, okTarget('opencode', () => Promise.resolve(stubSession())));
    await plugin.inlineCompletionPool.obtain();
    clearCapturedNotices();

    plugin.inlineCompletionPool.reportTurnFailure('opencode');
    plugin.inlineCompletionPool.reportTurnFailure('opencode');
    plugin.inlineCompletionPool.reportTurnFailure('opencode');

    expect(plugin.inlineCompletionPool.isUnsupported('opencode')).toBe(true);
    expect(capturedNotices.some((notice) => notice.includes('disabled until'))).toBe(true);
  });

  it('delivers the writeToolObserved notice through the production pool wiring', async () => {
    const plugin = createWiredPlugin();
    spyCompletionTarget(plugin, okTarget('opencode', () => Promise.resolve(stubSession())));
    await plugin.inlineCompletionPool.obtain();
    clearCapturedNotices();

    plugin.inlineCompletionPool.reportWriteToolViolation('opencode', 'OpenCode', ['Write']);

    expect(capturedNotices).toHaveLength(1);
    expect(capturedNotices[0]).toContain('OpenCode');
    expect(capturedNotices[0]).toContain('Write');
  });

  it('delivers the capabilityUnavailable notice through the real target resolution (no stubs)', async () => {
    // No spy at all: with the inline-edit host absent, the real
    // resolveInlineCompletionTarget reports capability-unavailable.
    const plugin = createWiredPlugin();
    const editor = makeEditorView('hello');

    plugin.inlineCompletionController.trigger({ cm: editor.view } as never, 'notes/a.md');
    await flush();

    expect(capturedNotices.some((notice) => notice.includes('No active backend supports'))).toBe(true);
    editor.destroy();
  });
});
