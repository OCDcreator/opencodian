import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { App } from 'obsidian';

import type { Conversation } from '../../../../src/core/types';
import {
  type ContextUsageSnapshot,
  createEmptyTabContextState,
  type TabContextState,
} from '../../../../src/core/types';
import {
  ActiveTabContextUsageCoordinator,
  type ActiveTabContextUsageCoordinatorHost,
  type ForegroundCompactionActionResult,
  type ForegroundCompactionControl,
} from '../../../../src/features/chat/services/ActiveTabContextUsageCoordinator';
import {
  ContextDetailModal,
  type ContextDetailModalCompactionCoordinator,
} from '../../../../src/features/chat/ui/ContextDetailModal';
import { setLocale } from '../../../../src/i18n';

type MockedHost = {
  [Key in keyof ActiveTabContextUsageCoordinatorHost]:
    ActiveTabContextUsageCoordinatorHost[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : ActiveTabContextUsageCoordinatorHost[Key];
};

function createCodexConversation(): Conversation {
  return {
    id: 'conversation-codex',
    title: 'Codex compaction conversation',
    createdAt: 100,
    updatedAt: 200,
    backend: 'codex',
    backendSessionId: 'session-codex',
    messages: [],
  };
}

function createHost(
  overrides: Partial<MockedHost> = {},
): MockedHost {
  const state = createEmptyTabContextState();
  const conversation = createCodexConversation();
  return {
    hasActiveTab: jest.fn().mockReturnValue(true),
    getCurrentConversation: jest.fn().mockReturnValue(conversation),
    getCurrentSessionModel: jest.fn().mockReturnValue({ provider: 'openai', model: 'gpt-5.4' }),
    getCurrentSessionModelResolution: jest.fn().mockReturnValue({
      status: 'available',
      provider: 'openai',
      model: 'gpt-5.4',
      ref: 'openai/gpt-5.4',
      providerName: 'OpenAI',
      modelName: 'GPT-5.4',
      contextWindow: 128000,
    }),
    findKnownModelInfo: jest.fn().mockReturnValue(null),
    getActiveTabContextUsage: jest.fn().mockReturnValue(state),
    setActiveTabContextUsage: jest.fn(),
    renderContextUsageIndicator: jest.fn(),
    getSessionContextUsageSnapshot: jest.fn().mockResolvedValue(null),
    hasTab: jest.fn().mockReturnValue(true),
    getTabContextUsage: jest.fn().mockReturnValue(state),
    setTabContextUsage: jest.fn(),
    getActiveTabId: jest.fn().mockReturnValue('tab-codex'),
    openContextUsageDetailsModal: jest.fn(),
    persistContextUsageSnapshot: jest.fn().mockResolvedValue(undefined),
    getForegroundCompactionAvailability: jest.fn().mockReturnValue({
      status: 'available',
      threadId: 'thread-exact-123',
    }),
    compactForegroundThread: jest.fn().mockResolvedValue({
      status: 'verified',
      acknowledged: true,
      runtimeVerified: true,
      started: true,
      completed: true,
      tokenUsageObserved: true,
      threadId: 'thread-exact-123',
    }),
    ...overrides,
  };
}

function createContextState(): TabContextState {
  return {
    ...createEmptyTabContextState(),
    estimatedInputTokens: 120,
    estimatedOutputTokens: 20,
    contextWindow: 128000,
    percentage: 1,
    provider: 'openai',
    providerName: 'OpenAI',
    model: 'gpt-5.4',
    modelName: 'GPT-5.4',
  };
}

function createSnapshot(): ContextUsageSnapshot {
  return {
    sessionId: 'session-codex',
    sessionTitle: 'Codex compaction conversation',
    createdAt: 100,
    updatedAt: 300,
    compactingAt: null,
    providerId: 'openai',
    providerName: 'OpenAI',
    modelId: 'gpt-5.4',
    modelName: 'GPT-5.4',
    contextWindow: 128000,
    totalTokens: 80,
    inputTokens: 50,
    outputTokens: 20,
    reasoningTokens: 10,
    cacheReadTokens: 0,
    cacheWriteTokens: null,
    totalCost: null,
  };
}

function control(overrides: Partial<ForegroundCompactionControl> = {}): ForegroundCompactionControl {
  return {
    visible: true,
    tabId: 'tab-codex',
    sessionId: 'session-codex',
    threadId: 'thread-exact-123',
    title: 'Codex compaction conversation',
    availability: { status: 'available', threadId: 'thread-exact-123' },
    ...overrides,
  };
}

function result(overrides: Partial<ForegroundCompactionActionResult> = {}): ForegroundCompactionActionResult {
  return {
    status: 'verified',
    acknowledged: true,
    runtimeVerified: true,
    started: true,
    completed: true,
    tokenUsageObserved: true,
    threadId: 'thread-exact-123',
    ...overrides,
  };
}

function findCompactionButton(modal: ContextDetailModal): HTMLButtonElement {
  const button = modal.contentEl.querySelector<HTMLButtonElement>('[data-context-compaction-action]');
  expect(button).not.toBeNull();
  return button!;
}

let originalConfirm: typeof window.confirm;

beforeEach(() => {
  document.body.innerHTML = '';
  setLocale('en');
  originalConfirm = window.confirm;
  window.confirm = jest.fn().mockReturnValue(true);
});

afterEach(() => {
  window.confirm = originalConfirm;
  document.body.innerHTML = '';
});

describe('foreground Codex compaction coordinator fencing', () => {
  it.each(['unavailable', 'invalid-thread', 'busy'] as const)(
    'returns the %s availability state and does not dispatch',
    (status) => {
      const host = createHost({
        getForegroundCompactionAvailability: jest.fn().mockReturnValue({ status, threadId: 'thread-exact-123' }),
      });
      const coordinator = new ActiveTabContextUsageCoordinator(host);

      expect(coordinator.getForegroundCompactionControl()).toMatchObject({
        visible: true,
        availability: { status },
      });
      return expect(coordinator.compactForegroundThread()).resolves.toMatchObject({ status });
    },
  );

  it('keeps non-Codex conversations hidden', () => {
    const host = createHost({
      getCurrentConversation: jest.fn().mockReturnValue({ ...createCodexConversation(), backend: 'opencode' }),
    });
    const coordinator = new ActiveTabContextUsageCoordinator(host);

    expect(coordinator.getForegroundCompactionControl()).toMatchObject({ visible: false });
    expect(host.getForegroundCompactionAvailability).not.toHaveBeenCalled();
  });

  it('hides the action when the active tab is unavailable', () => {
    const host = createHost({ hasActiveTab: jest.fn().mockReturnValue(false) });
    const coordinator = new ActiveTabContextUsageCoordinator(host);

    expect(coordinator.getForegroundCompactionControl()).toMatchObject({ visible: false });
    expect(host.getForegroundCompactionAvailability).not.toHaveBeenCalled();
  });

  it('reports available with the exact thread target', () => {
    const coordinator = new ActiveTabContextUsageCoordinator(createHost());

    expect(coordinator.getForegroundCompactionControl()).toEqual({
      visible: true,
      tabId: 'tab-codex',
      sessionId: 'session-codex',
      threadId: 'thread-exact-123',
      title: 'Codex compaction conversation',
      availability: { status: 'available', threadId: 'thread-exact-123' },
    });
  });

  it('dispatches the exact session id and refreshes once after verified runtime evidence', async () => {
    const host = createHost({
      getSessionContextUsageSnapshot: jest.fn().mockResolvedValue(createSnapshot()),
    });
    const coordinator = new ActiveTabContextUsageCoordinator(host);
    const onAccepted = jest.fn();

    await expect(coordinator.compactForegroundThread({ onAccepted })).resolves.toMatchObject({
      status: 'verified',
      runtimeVerified: true,
    });
    expect(host.compactForegroundThread).toHaveBeenCalledWith('session-codex', expect.objectContaining({
      onAccepted: expect.any(Function),
    }));
    expect(host.getSessionContextUsageSnapshot).toHaveBeenCalledWith('session-codex');
    expect(host.setActiveTabContextUsage).toHaveBeenCalledTimes(1);
  });

  it('does not dispatch when the modal target becomes stale before confirmation dispatch', async () => {
    const host = createHost();
    const coordinator = new ActiveTabContextUsageCoordinator(host);
    const modal = new ContextDetailModal({} as App, {
      conversation: createCodexConversation(),
      contextState: createContextState(),
      compactionCoordinator: coordinator,
      rawMessageLoader: async () => [],
    });
    modal.onOpen();
    host.getActiveTabId.mockReturnValue('tab-other');
    Object.defineProperty(window, 'confirm', {
      configurable: true,
      writable: true,
      value: jest.fn().mockReturnValue(true),
    });
    findCompactionButton(modal).click();
    await Promise.resolve();
    await Promise.resolve();

    expect(host.compactForegroundThread).not.toHaveBeenCalled();
    expect(modal.contentEl.querySelector('[role="status"]')?.textContent).toContain('stale');
  });

  it('fences a late result after the active conversation changes', async () => {
    let resolveResult!: (value: ForegroundCompactionActionResult) => void;
    const host = createHost({
      compactForegroundThread: jest.fn().mockReturnValue(new Promise<ForegroundCompactionActionResult>((resolve) => {
        resolveResult = resolve;
      })),
    });
    const coordinator = new ActiveTabContextUsageCoordinator(host);
    const pending = coordinator.compactForegroundThread();
    host.getCurrentConversation.mockReturnValue({
      ...createCodexConversation(),
      id: 'conversation-other',
      backendSessionId: 'session-other',
    });
    resolveResult(result());

    await expect(pending).resolves.toMatchObject({ status: 'stale' });
    expect(host.getSessionContextUsageSnapshot).not.toHaveBeenCalled();
  });
});

describe('ContextDetailModal foreground compaction action', () => {
  function createModal(
    coordinator: ContextDetailModalCompactionCoordinator,
  ): ContextDetailModal {
    return new ContextDetailModal({} as App, {
      conversation: createCodexConversation(),
      contextState: createContextState(),
      compactionCoordinator: coordinator,
      rawMessageLoader: async () => [],
    });
  }

  it('renders the target thread and exact confirmation, while cancel has no side effect', () => {
    const coordinator = {
      getForegroundCompactionControl: jest.fn().mockReturnValue(control()),
      compactForegroundThread: jest.fn(),
    } satisfies ContextDetailModalCompactionCoordinator;
    const modal = createModal(coordinator);
    modal.onOpen();
    const button = findCompactionButton(modal);

    expect(modal.contentEl.querySelector('.opencodian-context-compaction-thread')?.textContent)
      .toBe('thread-exact-123');
    window.confirm = jest.fn().mockReturnValue(false);
    button.click();

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('thread-exact-123'));
    expect(coordinator.compactForegroundThread).not.toHaveBeenCalled();
  });

  it('shows accepted then verified success and does not invent token values', async () => {
    let accepted!: () => void;
    const coordinator = {
      getForegroundCompactionControl: jest.fn().mockReturnValue(control()),
      compactForegroundThread: jest.fn().mockImplementation(({ onAccepted }: { onAccepted?: () => void }) => {
        accepted = onAccepted!;
        return Promise.resolve(result());
      }),
    } satisfies ContextDetailModalCompactionCoordinator;
    const modal = createModal(coordinator);
    modal.onOpen();
    findCompactionButton(modal).click();
    accepted();
    expect(modal.contentEl.querySelector('[role="status"]')?.textContent)
      .toContain('Accepted');
    await Promise.resolve();
    await Promise.resolve();

    expect(modal.contentEl.querySelector('[role="status"]')?.textContent)
      .toContain('verified');
    expect(modal.contentEl.querySelector('.opencodian-context-modal-value')?.textContent)
      .not.toContain('80');
  });

  it('blocks duplicate clicks, exposes live-region ARIA state, and resets on reload', async () => {
    let resolveRequest!: (value: ForegroundCompactionActionResult) => void;
    const coordinator = {
      getForegroundCompactionControl: jest.fn().mockReturnValue(control()),
      compactForegroundThread: jest.fn().mockReturnValue(new Promise<ForegroundCompactionActionResult>((resolve) => {
        resolveRequest = resolve;
      })),
    } satisfies ContextDetailModalCompactionCoordinator;
    const modal = createModal(coordinator);
    modal.onOpen();
    const button = findCompactionButton(modal);
    const status = modal.contentEl.querySelector<HTMLElement>('[role="status"]')!;

    expect(button.type).toBe('button');
    expect(button.getAttribute('aria-label')).toContain('thread-exact-123');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('aria-atomic')).toBe('true');
    button.click();
    button.click();
    expect(coordinator.compactForegroundThread).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);
    expect(status.getAttribute('aria-busy')).toBe('true');

    resolveRequest(result());
    await Promise.resolve();
    await Promise.resolve();
    modal.onClose();
    modal.onOpen();
    expect(modal.contentEl.querySelector('[role="status"]')?.textContent).toBe('Ready');
    expect(findCompactionButton(modal).disabled).toBe(false);
  });

  it.each([
    ['unavailable', 'Codex app-server is unavailable'],
    ['invalid-thread', 'No valid Codex app-server thread'],
    ['busy', 'Codex thread is busy'],
  ] as const)('renders the %s disabled reason in English', (availability, copy) => {
    const coordinator = {
      getForegroundCompactionControl: jest.fn().mockReturnValue(control({
        availability: { status: availability, threadId: 'thread-exact-123' },
      })),
      compactForegroundThread: jest.fn(),
    } satisfies ContextDetailModalCompactionCoordinator;
    const modal = createModal(coordinator);
    modal.onOpen();

    expect(findCompactionButton(modal).disabled).toBe(true);
    expect(modal.contentEl.querySelector('[role="status"]')?.textContent).toContain(copy);
  });

  it('renders the Chinese accepted and unavailable copy', () => {
    setLocale('zh');
    const unavailableCoordinator = {
      getForegroundCompactionControl: jest.fn().mockReturnValue(control({
        availability: { status: 'unavailable', threadId: 'thread-exact-123' },
      })),
      compactForegroundThread: jest.fn(),
    } satisfies ContextDetailModalCompactionCoordinator;
    const modal = createModal(unavailableCoordinator);
    modal.onOpen();
    expect(modal.contentEl.querySelector('[role="status"]')?.textContent).toContain('不可用');
    expect(findCompactionButton(modal).getAttribute('aria-label')).toContain('thread-exact-123');
  });
});

describe('ContextDetailModal foreground compaction layout and result states', () => {
  function createModal(
    coordinator: ContextDetailModalCompactionCoordinator,
  ): ContextDetailModal {
    return new ContextDetailModal({} as App, {
      conversation: createCodexConversation(),
      contextState: createContextState(),
      compactionCoordinator: coordinator,
      rawMessageLoader: async () => [],
    });
  }

  it('keeps the narrow modal CSS contract in the source stylesheet', () => {
    const css = readFileSync(path.resolve(
      process.cwd(),
      'src/style/modals/config-editor-modal.css',
    ), 'utf8');
    expect(css).toContain('@media (max-width: 720px)');
    expect(css).toContain('.opencodian-context-compaction-action-row {');
    expect(css).toContain('flex-direction: column;');
    expect(css).toContain('.opencodian-context-compaction-controls {');
    expect(css).toContain('width: 100%;');
    expect(css).toContain('.opencodian-context-compaction-thread {');
    expect(css).toContain('overflow-wrap: anywhere;');
    expect(css).toContain('.opencodian-context-compaction-status {');
    const generatedCss = readFileSync(path.resolve(process.cwd(), 'styles.css'), 'utf8');
    expect(generatedCss).toContain('.opencodian-context-compaction-action-row');
    expect(generatedCss).toContain('.opencodian-context-compaction-thread');
  });

  it('proves the 346px-equivalent DOM/CSS shrink and wrap contract', () => {
    const css = readFileSync(path.resolve(
      process.cwd(),
      'src/style/modals/config-editor-modal.css',
    ), 'utf8');
    const surfaceEl = document.createElement('div');
    surfaceEl.style.width = '346px';
    surfaceEl.innerHTML = `
      <div class="opencodian-context-compaction-action-row">
        <div class="opencodian-context-compaction-copy">
          <span class="opencodian-context-compaction-thread">thread-${'x'.repeat(200)}</span>
        </div>
        <div class="opencodian-context-compaction-controls">
          <button class="opencodian-context-compaction-button" type="button">Compact</button>
          <div class="opencodian-context-compaction-status" role="status">Ready</div>
        </div>
      </div>`;
    document.body.appendChild(surfaceEl);

    expect(surfaceEl.style.width).toBe('346px');
    expect(surfaceEl.querySelector('.opencodian-context-compaction-action-row')).not.toBeNull();
    expect(surfaceEl.querySelector('.opencodian-context-compaction-copy')).not.toBeNull();
    expect(surfaceEl.querySelector('.opencodian-context-compaction-controls')).not.toBeNull();
    expect(surfaceEl.querySelector('.opencodian-context-compaction-thread')?.textContent).toHaveLength(207);
    expect(css).toMatch(/\.opencodian-context-compaction-action-row\s*\{[\s\S]*?width:\s*100%;/);
    expect(css).toMatch(/\.opencodian-context-compaction-action-row\s*\{[\s\S]*?max-width:\s*100%;[\s\S]*?box-sizing:\s*border-box;/);
    expect(css).toMatch(/\.opencodian-context-compaction-thread\s*\{[\s\S]*?overflow-wrap:\s*anywhere;/);
    expect(css).toMatch(/\.opencodian-context-compaction-status\s*\{[\s\S]*?overflow-wrap:\s*anywhere;/);
    expect(css).toMatch(/\.opencodian-context-compaction-button\s*\{[\s\S]*?min-width:\s*0;/);
    expect(css).toMatch(/\.opencodian-context-compaction-button\s*\{[\s\S]*?max-width:\s*100%;[\s\S]*?box-sizing:\s*border-box;/);
    expect(css).toMatch(/@media \(max-width: 720px\)[\s\S]*?\.opencodian-context-compaction-action-row[\s\S]*?flex-direction:\s*column;[\s\S]*?\.opencodian-context-compaction-controls[\s\S]*?width:\s*100%;[\s\S]*?\.opencodian-context-compaction-button[\s\S]*?width:\s*100%;/);
  });

  it.each([
    ['failed', 'Context compaction failed'],
    ['malformed', 'malformed compaction response'],
    ['stale', 'result is stale'],
  ] as const)('keeps %s result honest', async (status, copy) => {
    const coordinator = {
      getForegroundCompactionControl: jest.fn().mockReturnValue(control()),
      compactForegroundThread: jest.fn().mockResolvedValue(result({
        status,
        runtimeVerified: false,
        acknowledged: false,
        completed: false,
        tokenUsageObserved: false,
      })),
    } satisfies ContextDetailModalCompactionCoordinator;
    const modal = createModal(coordinator);
    modal.onOpen();
    findCompactionButton(modal).click();
    await Promise.resolve();
    await Promise.resolve();

    expect(modal.contentEl.querySelector('[role="status"]')?.textContent).toContain(copy);
    expect(modal.contentEl.querySelector('[role="status"]')?.textContent).not.toContain('verified');
  });

  it('reports timeout with acknowledgement and fences late stale results', async () => {
    const coordinator = {
      getForegroundCompactionControl: jest.fn().mockReturnValue(control()),
      compactForegroundThread: jest.fn().mockResolvedValue(result({
        status: 'timed-out',
        runtimeVerified: false,
        completed: false,
        tokenUsageObserved: false,
      })),
    } satisfies ContextDetailModalCompactionCoordinator;
    const modal = createModal(coordinator);
    modal.onOpen();
    findCompactionButton(modal).click();
    await Promise.resolve();
    await Promise.resolve();

    expect(modal.contentEl.querySelector('[role="status"]')?.textContent)
      .toContain('Accepted');
    expect(modal.contentEl.querySelector('[role="status"]')?.textContent)
      .toContain('verification');
    expect(modal.contentEl.querySelector('[role="status"]')?.classList.contains('is-error')).toBe(false);
    expect(modal.contentEl.querySelector('[role="status"]')?.classList.contains('is-success')).toBe(false);
    expect(modal.contentEl.querySelector('[role="status"]')?.classList.contains('is-pending-verification')).toBe(true);
  });

  it('recreates as busy during a pending request without preserving accepted or success state', async () => {
    let resolveOriginal!: (value: ForegroundCompactionActionResult) => void;
    let currentControl = control();
    const coordinator = {
      getForegroundCompactionControl: jest.fn().mockImplementation(() => currentControl),
      compactForegroundThread: jest.fn().mockReturnValue(new Promise<ForegroundCompactionActionResult>((resolve) => {
        resolveOriginal = resolve;
      })),
    } satisfies ContextDetailModalCompactionCoordinator;
    const original = createModal(coordinator);
    original.onOpen();
    findCompactionButton(original).click();
    await Promise.resolve();
    expect(original.contentEl.querySelector('[role="status"]')?.textContent).toContain('Requesting');

    currentControl = control({ availability: { status: 'busy', threadId: 'thread-exact-123' } });
    original.onClose();
    original.onOpen();
    const recreated = original;
    const recreatedButton = findCompactionButton(recreated);
    expect(recreatedButton.disabled).toBe(true);
    expect(recreated.contentEl.querySelector('[role="status"]')?.textContent).toContain('busy');
    expect(recreated.contentEl.querySelector('[role="status"]')?.textContent).not.toContain('Accepted');
    expect(recreated.contentEl.querySelector('[role="status"]')?.textContent).not.toContain('verified');
    recreatedButton.click();
    expect(coordinator.compactForegroundThread).toHaveBeenCalledTimes(1);

    resolveOriginal(result());
    await Promise.resolve();
    await Promise.resolve();
    expect(recreated.contentEl.querySelector('[role="status"]')?.textContent).toContain('busy');
    recreated.onClose();
  });
});
