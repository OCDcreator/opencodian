import type { DshTraceLedgerSnapshot } from '../../../../src/core/agents/backend/diagnostics/types';
import {
  ChatDiagnosticsCoordinator,
  type ChatDiagnosticsCoordinatorHost,
  type ChatDiagnosticsCoordinatorViewHost,
  createChatDiagnosticsCoordinatorFactory,
  type DshTraceLedgerPort,
} from '../../../../src/features/chat/services/diagnostics/ChatDiagnosticsCoordinator';

function viewHost(): ChatDiagnosticsCoordinatorViewHost {
  return {
    getOpenCodeSessionTraceSettings: () => ({ enabled: true }),
    getCodexSessionTraceSettings: () => ({ enabled: false }),
    getClaudeSessionTraceSettings: () => ({ enabled: false }),
    getActiveTabId: () => 'tab-1',
    getSessionIdForTab: () => null,
    getCurrentConversation: () => null,
    refreshHeaderChrome: () => undefined,
    createOpenCodeDiagnosticsMenu: () => ({}) as never,
    createBackendDiagnosticsMenu: () => ({}) as never,
    promptDiagnosticsUserContext: async () => ({}),
    writeTextToClipboard: async () => undefined,
    showNotice: () => undefined,
  } as unknown as ChatDiagnosticsCoordinatorViewHost;
}

function coordinatorHost(): ChatDiagnosticsCoordinatorHost {
  return {
    getOpenCodeSessionTraceSettings: () => ({ enabled: true }),
    getOpenCodeTraceService: () => undefined,
    getActiveTabId: () => 'tab-1',
    getSessionIdForTab: () => null,
    refreshHeaderChrome: () => undefined,
    createMenu: () => ({}) as never,
    promptDiagnosticsUserContext: async () => ({}),
    writeTextToClipboard: async () => undefined,
    showNotice: () => undefined,
  } as unknown as ChatDiagnosticsCoordinatorHost;
}

const snapshot: DshTraceLedgerSnapshot = {
  entries: [
    { timestamp: '2026-01-01T00:00:01.000Z', timeSource: 'client', name: 'turn.started' },
    { timestamp: '2026-01-01T00:00:02.000Z', timeSource: 'client', name: 'turn.finished', detail: 'completed', durationMs: 1500, durationKind: 'client-round-trip' },
  ],
  timing: { lastTurnClientRoundTripMs: 1500, observedTurnCount: 1, eventCount: 2, lastEventAt: '2026-01-01T00:00:02.000Z' },
};

describe('ChatDiagnosticsCoordinator DSH ledger', () => {
  it('reads the ledger for exactly the requested session id through the injected port', async () => {
    const readSessionLedger = jest.fn(async (sessionId: string) => (sessionId === 'sess-a' ? snapshot : null));
    const port: DshTraceLedgerPort = { readSessionLedger, resolveTraceId: () => 'trace-a' };
    const factory = createChatDiagnosticsCoordinatorFactory({ getDshTraceService: () => port });
    const coordinator = factory.create(viewHost());
    await expect(coordinator.getDshTraceLedger('sess-a')).resolves.toBe(snapshot);
    expect(readSessionLedger).toHaveBeenCalledWith('sess-a');
    await expect(coordinator.getDshTraceLedger('sess-b')).resolves.toBeNull();
  });

  it('trims the session id and refuses empty ids without touching the port', async () => {
    const readSessionLedger = jest.fn(async () => snapshot);
    const port: DshTraceLedgerPort = { readSessionLedger, resolveTraceId: () => undefined };
    const coordinator = createChatDiagnosticsCoordinatorFactory({ getDshTraceService: () => port }).create(viewHost());
    await expect(coordinator.getDshTraceLedger('  sess-a  ')).resolves.toBe(snapshot);
    expect(readSessionLedger).toHaveBeenCalledWith('sess-a');
    await expect(coordinator.getDshTraceLedger('   ')).resolves.toBeNull();
    expect(readSessionLedger).toHaveBeenCalledTimes(1);
  });

  it('stays fail-closed without a port and absorbs port rejections', async () => {
    const failClosed = new ChatDiagnosticsCoordinator(coordinatorHost());
    await expect(failClosed.getDshTraceLedger('sess-a')).resolves.toBeNull();
    const rejecting: DshTraceLedgerPort = { readSessionLedger: async () => { throw new Error('store closed'); }, resolveTraceId: () => undefined };
    const coordinator = createChatDiagnosticsCoordinatorFactory({ getDshTraceService: () => rejecting }).create(viewHost());
    await expect(coordinator.getDshTraceLedger('sess-a')).resolves.toBeNull();
  });

  it('falls back to the fail-closed DSH port when the factory omits getDshTraceService', () => {
    const coordinator = createChatDiagnosticsCoordinatorFactory().create(viewHost());
    return expect(coordinator.getDshTraceLedger('sess-a')).resolves.toBeNull();
  });
});
