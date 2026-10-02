import { AgentCapability } from '../../../src/core/agents/AgentCapability';
import { AUX_DENIED_CAPABILITIES } from '../../../src/core/agents/backend/AgentAuxQueryCapability';
import type {
  InlineCompletionSession,
  InlineCompletionSessionConfig,
} from '../../../src/core/agents/backend/AgentInlineCompletionCapability';
import type { AgentServiceRegistry } from '../../../src/core/agents/backend/AgentServiceRegistry';
import { prepareLoadedSettingsBootstrapState } from '../../../src/core/types/settingsLoadNormalization';
import type { InlineCompletionTarget } from '../../../src/features/inline-edit/InlineCompletionService';
import { createInlineEditPluginHost } from '../../../src/features/inline-edit/InlineEditPluginHost';
import OpenCodianPlugin from '../../../src/main';

(globalThis as { BUILD_ID?: string }).BUILD_ID = 'test-build';

function reloadAndResolve(edit: string | undefined, completion: string | undefined) {
  // Exercise the real last load boundary, including JSON persistence. Inputs
  // must survive normalization before any feature-level resolution can see them.
  const settings = prepareLoadedSettingsBootstrapState({
    core: {
      data: JSON.parse(JSON.stringify({
        inlineEditModelOverrides: { opencode: 'legacy/edit', opencode2: edit },
        inlineCompletionModelOverrides: { opencode: 'legacy/fast', opencode2: completion },
      })),
      filePath: '.opencodian/settings.core.json',
      source: 'primary',
      shouldPersist: false,
    },
    ui: {
      data: null,
      filePath: '.opencodian/settings.ui.json',
      source: 'missing',
      shouldPersist: false,
    },
    writable: true,
    shouldPersist: false,
  }).settings;
  const session: InlineCompletionSession = {
    queryId: 't02',
    safety: {
      backend: 'opencode2',
      enforcedPolicy: 'read-only-allowlist',
      effectiveTools: ['read'],
      deniedCapabilities: AUX_DENIED_CAPABILITIES,
      mechanism: 'unit-test adapter seam',
    },
    completed: [],
    complete: jest.fn().mockResolvedValue({ ok: true, text: '', toolCalls: [] }),
    reset: jest.fn().mockResolvedValue(undefined),
    dispose: jest.fn().mockResolvedValue(undefined),
  };
  const startSession = jest.fn<Promise<InlineCompletionSession>, [InlineCompletionSessionConfig]>()
    .mockResolvedValue(session);
  const adapter = {
    displayName: 'OpenCode 2',
    capabilities: new Set([AgentCapability.AuxQuery, AgentCapability.InlineCompletion]),
    startInlineCompletionSession: startSession,
  };
  const registry = {
    getActiveKind: () => 'opencode2',
    get: (kind: string) => kind === 'opencode2' ? adapter : undefined,
  } as unknown as AgentServiceRegistry;
  const host = createInlineEditPluginHost({
    getVaultPath: () => '/vault',
    getLocale: () => 'en',
    getRegistry: () => registry,
    getActiveChatBackend: () => 'opencode2',
    getActiveChatModel: () => ({ provider: 'chat', model: 'model' }),
    getSettings: () => ({
      enabled: settings.inlineEditEnabled,
      modelOverrides: settings.inlineEditModelOverrides,
      effortOverrides: settings.inlineEditEffortOverrides,
      presetPrompts: settings.inlineEditPresetPrompts,
      maxConcurrentEdits: settings.inlineEditMaxConcurrentEdits,
      documentModeEnabled: settings.inlineEditDocumentModeEnabled,
    }),
  });
  // Invoke production composition without starting the unrelated plugin boot.
  const plugin = { settings, inlineEditHost: host, app: { workspace: {} } };
  const resolveTarget = (OpenCodianPlugin.prototype as unknown as {
    resolveInlineCompletionTarget(): InlineCompletionTarget;
  }).resolveInlineCompletionTarget;
  return { settings, host, startSession, target: resolveTarget.call(plugin) };
}

describe('reloaded OpenCode 2 model application (T02)', () => {
  it.each([
    {
      edit: ' next/edit ', completion: ' fast/completion ',
      editProvider: 'next', editModel: 'edit', completionProvider: 'fast', completionModel: 'completion',
    },
    {
      edit: ' next/edit ', completion: undefined,
      editProvider: 'next', editModel: 'edit', completionProvider: 'next', completionModel: 'edit',
    },
    {
      edit: undefined, completion: undefined,
      editProvider: 'chat', editModel: 'model', completionProvider: 'chat', completionModel: 'model',
    },
  ] as const)('resolves edit $edit and completion $completion through the real model chain', async ({
    edit, completion, editProvider, editModel, completionProvider, completionModel,
  }) => {
    const { settings, host, target, startSession } = reloadAndResolve(edit, completion);
    expect(settings.inlineEditModelOverrides.opencode).toBe('legacy/edit');
    expect(settings.inlineCompletionModelOverrides.opencode).toBe('legacy/fast');
    expect(host.resolveAdapter()?.resolveModel()).toEqual({
      ok: true, model: { kind: 'opencode2', provider: editProvider, model: editModel },
    });
    expect(target).toMatchObject({
      ok: true,
      backend: 'opencode2',
      model: { kind: 'opencode2', provider: completionProvider, model: completionModel },
    });
    if (!target.ok) throw new Error('Expected a resolved OpenCode 2 completion target');
    await target.startSession();
    expect(startSession).toHaveBeenCalledTimes(1);
    expect(startSession).toHaveBeenCalledWith(expect.objectContaining({
      model: { kind: 'opencode2', provider: completionProvider, model: completionModel },
    }));
  });

  it('reports a malformed persisted completion override instead of falling back to the edit model', () => {
    const { settings, target, startSession } = reloadAndResolve('next/edit', 'no-slash');
    expect(settings.inlineCompletionModelOverrides.opencode2).toBe('no-slash');
    expect(target).toEqual({
      ok: false,
      reason: 'model-unavailable',
      detail: '"no-slash" is not a valid opencode2 model reference.',
    });
    expect(startSession).not.toHaveBeenCalled();
  });
});
