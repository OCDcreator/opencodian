/**
 * Codex approval-policy tests.
 *
 * Covers the type layer (defaults/normalization → 'inherit', session override)
 * and the adapter behavior: 'inherit' omits the override; untrusted/on-request
 * require the app-server + approval bridge and fail closed otherwise; 'never'
 * wires through and may use the SDK fallback; updateApprovalPolicy changes the
 * resolved wire policy for the next turn.
 */
import { AgentCapability } from '../../../../../src/core/agents/AgentCapability';
import { CodexAdapter } from '../../../../../src/core/agents/backend/CodexAdapter';
import { normalizeConversationSessionSettings } from '../../../../../src/core/types';
import type { StreamChunk } from '../../../../../src/core/types/chat';
import {
  getDefaultCodexBackendSettings,
  normalizeBackendSettings,
} from '../../../../../src/core/types/settings';

const mockAppServerStart = jest.fn<Promise<void>, []>();
const mockAppServerStop = jest.fn();
const mockStartThread = jest.fn();
const mockResumeThread = jest.fn();
const mockStartTurn = jest.fn();
const mockInterruptTurn = jest.fn();
let notificationHandler: ((event: { method: string; params: unknown }) => void) | null = null;

jest.mock('../../../../../src/core/agents/backend/CodexAppServerClient', () => {
  const actual = jest.requireActual('../../../../../src/core/agents/backend/CodexAppServerClient');
  return {
    ...actual,
    CodexAppServerClient: jest.fn().mockImplementation(() => ({
      start: mockAppServerStart,
    stop: mockAppServerStop,
    startThread: mockStartThread,
    resumeThread: mockResumeThread,
    startTurn: mockStartTurn,
    interruptTurn: mockInterruptTurn,
    subscribeToThreadNotifications: jest.fn((_threadId, handler) => {
      notificationHandler = handler;
      return { dispose: jest.fn() };
    }),
    registerServerRequestHandler: jest.fn(),
    unregisterServerRequestHandler: jest.fn(),
    getThreadEffectiveSettings: jest.fn().mockReturnValue(null),
  })),
  };
});

function createMockCodex() {
  const thread = {
    runStreamed: jest.fn().mockResolvedValue({ events: (async function* () { /* empty */ })() }),
  };
  return {
    startThread: jest.fn().mockReturnValue(thread),
    resumeThread: jest.fn().mockReturnValue(thread),
    thread,
  };
}

async function collectStream(adapter: CodexAdapter, sessionId: string): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const chunk of adapter.sendMessage({ sessionId, content: 'go' })) {
    chunks.push(chunk);
  }
  return chunks;
}

function resetMocks(): void {
  jest.clearAllMocks();
  notificationHandler = null;
  mockAppServerStart.mockResolvedValue(undefined);
  mockStartThread.mockResolvedValue({ id: 'thread-new' });
  mockResumeThread.mockResolvedValue({ id: 'thread-new' });
  mockStartTurn.mockImplementation(async () => {
    setTimeout(() => {
      notificationHandler?.({ method: 'turn/completed', params: { threadId: 'thread-new', turn: { id: 'turn-1', error: null } } });
    }, 0);
    return { id: 'turn-1' };
  });
  mockInterruptTurn.mockResolvedValue(true);
}

describe('CodexApprovalPolicy — type layer', () => {
  it('defaults to inherit', () => {
    expect(getDefaultCodexBackendSettings().approvalPolicy).toBe('inherit');
  });

  it('normalizes missing/unknown approvalPolicy to inherit (no migration to on-request)', () => {
    const normalized = normalizeBackendSettings({ codex: { approvalPolicy: 'on-failure' } }).codex;
    expect(normalized.approvalPolicy).toBe('inherit');
    const missing = normalizeBackendSettings({ codex: {} }).codex;
    expect(missing.approvalPolicy).toBe('inherit');
  });

  it('preserves a valid explicit approvalPolicy', () => {
    expect(normalizeBackendSettings({ codex: { approvalPolicy: 'never' } }).codex.approvalPolicy).toBe('never');
    expect(normalizeBackendSettings({ codex: { approvalPolicy: 'untrusted' } }).codex.approvalPolicy).toBe('untrusted');
  });

  it('session override normalizes codexApprovalPolicy and rejects unknown values', () => {
    expect(normalizeConversationSessionSettings({ codexApprovalPolicy: 'on-request' })?.codexApprovalPolicy).toBe('on-request');
    // Unknown values drop the override (undefined), not inherit-as-string.
    expect(normalizeConversationSessionSettings({ codexApprovalPolicy: 'bogus' as never })?.codexApprovalPolicy).toBeUndefined();
    expect(normalizeConversationSessionSettings({ codexApprovalPolicy: null })?.codexApprovalPolicy).toBeNull();
  });
});

describe('CodexAdapter approval-policy resolution', () => {
  beforeEach(() => resetMocks());

  it('inherit omits approvalPolicy from app-server thread/turn options', async () => {
    const adapter = new CodexAdapter({
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
      approvalPolicy: 'inherit',
    });
    await adapter.start();
    await collectStream(adapter, 'codex-local-1');

    expect(mockStartThread).toHaveBeenCalledWith(expect.not.objectContaining({ approvalPolicy: expect.anything() }));
    expect(mockStartTurn).toHaveBeenCalledWith(expect.not.objectContaining({ approvalPolicy: expect.anything() }));
  });

  it('untrusted wires approvalPolicy when the app-server and a bridge are available', async () => {
    const adapter = new CodexAdapter({
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
      approvalPolicy: 'untrusted',
    });
    adapter.setApprovalHost({ collectApproval: jest.fn().mockResolvedValue({ decision: 'approved' }) });
    await adapter.start();
    await collectStream(adapter, 'codex-local-1');

    expect(mockStartTurn).toHaveBeenCalledWith(expect.objectContaining({ approvalPolicy: 'untrusted' }));
  });

  it('on-request wires approvalPolicy when the bridge is available', async () => {
    const adapter = new CodexAdapter({
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
      approvalPolicy: 'on-request',
    });
    adapter.setApprovalHost({ collectApproval: jest.fn().mockResolvedValue({ decision: 'approved' }) });
    await adapter.start();
    await collectStream(adapter, 'codex-local-1');

    expect(mockStartTurn).toHaveBeenCalledWith(expect.objectContaining({ approvalPolicy: 'on-request' }));
  });

  it('untrusted fails closed with an actionable error when no approval bridge is set', async () => {
    const adapter = new CodexAdapter({
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
      approvalPolicy: 'untrusted',
    });
    await adapter.start();
    const chunks = await collectStream(adapter, 'codex-local-1');

    expect(chunks.some((c) => c.type === 'error')).toBe(true);
    expect(mockStartTurn).not.toHaveBeenCalled();
  });

  it('on-request fails closed when the app-server is unavailable (no silent SDK substitution)', async () => {
    mockAppServerStart.mockRejectedValueOnce(new Error('no app-server'));
    const adapter = new CodexAdapter({
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
      approvalPolicy: 'on-request',
    });
    adapter.setApprovalHost({ collectApproval: jest.fn().mockResolvedValue({ decision: 'approved' }) });
    await adapter.start();
    const chunks = await collectStream(adapter, 'codex-local-1');

    expect(chunks.some((c) => c.type === 'error')).toBe(true);
    expect(mockStartTurn).not.toHaveBeenCalled();
  });

  it('never wires approvalPolicy without requiring a bridge', async () => {
    const adapter = new CodexAdapter({
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
      approvalPolicy: 'never',
    });
    await adapter.start();
    await collectStream(adapter, 'codex-local-1');

    expect(mockStartTurn).toHaveBeenCalledWith(expect.objectContaining({ approvalPolicy: 'never' }));
  });

  it('never may use the SDK fallback when the app-server is unavailable (no fail-closed)', async () => {
    mockAppServerStart.mockRejectedValueOnce(new Error('no app-server'));
    const adapter = new CodexAdapter({
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
      approvalPolicy: 'never',
    });
    await adapter.start();
    const chunks = await collectStream(adapter, 'codex-local-1');

    // No error chunk: never falls back to the SDK path instead of failing closed.
    expect(chunks.some((c) => c.type === 'error')).toBe(false);
    expect(mockStartTurn).not.toHaveBeenCalled();
  });

  it('updateApprovalPolicy changes the resolved wire policy for the next turn', async () => {
    const adapter = new CodexAdapter({
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
      approvalPolicy: 'inherit',
    });
    adapter.setApprovalHost({ collectApproval: jest.fn().mockResolvedValue({ decision: 'approved' }) });
    await adapter.start();
    adapter.updateApprovalPolicy('never');
    await collectStream(adapter, 'codex-local-1');

    expect(mockStartTurn).toHaveBeenCalledWith(expect.objectContaining({ approvalPolicy: 'never' }));
  });

  it('declares the Permissions capability surface is unaffected', () => {
    const adapter = new CodexAdapter({ createCodex: jest.fn().mockResolvedValue(createMockCodex()) });
    expect(adapter.hasCapability(AgentCapability.Permissions)).toBe(true);
  });
});
