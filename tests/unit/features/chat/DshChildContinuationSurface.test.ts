import type { App } from 'obsidian';
import { Scope } from 'obsidian';

import type { AgentChildSessionContinuationCapability, AgentService } from '../../../../src/core/agents/backend/AgentService';
import type { AgentServiceRegistry } from '../../../../src/core/agents/backend/AgentServiceRegistry';
import type { ChatMessage, Conversation } from '../../../../src/core/types';
import { SessionWorkbenchCoordinator, type SessionWorkbenchHost, type WorkbenchSession } from '../../../../src/features/chat/services/conversation/SessionWorkbenchCoordinator';
import { t } from '../../../../src/i18n';

/**
 * Real product classes only (SessionWorkbenchCoordinator → SessionWorkbench →
 * SessionInformationCoordinator) over synthetic DOM with a fake backend
 * service. Each test codifies one documented pre-fix failure from
 * `.impeccable/review/dsh-chat-followups-20261110/subagent-frontend-independent-review.md`
 * (cases 2–5); the review agent reproduced every failure on the unfixed build.
 */

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function makeService(sends: { count: number }) {
  return {
    getGoalCapabilities: () => ({ source: 'native', driver: 'dsh', actions: [], pauseMode: 'goal', editMode: 'replace', budgets: [] }),
    readSessionGoal: jest.fn(async () => ({ status: 'unavailable', goal: null, observedAt: 1 })),
    controlSessionGoal: jest.fn(async () => ({ status: 'confirmed', readback: { status: 'ready', observedAt: 1, goal: null } })),
    subscribeToGoalEvents: jest.fn(() => ({ dispose: jest.fn() })),
    readSessionInformation: jest.fn(async () => ({ sessionId: 's1', observedAt: 1, quota: null, mcp: null,
      agents: [{ id: 'child-1', title: 'Review child', status: 'unknown', readable: true, mode: 'continuable' }] })),
    readChildSessionMessages: jest.fn<Promise<ChatMessage[]>, [string, string]>(async () => []),
    canContinueChildSession: jest.fn(async () => true),
    continueChildSession: jest.fn(async () => ({ messageId: `inbox-${++sends.count}` })),
  } as unknown as AgentService & AgentChildSessionContinuationCapability;
}

describe('child continuation surface (real coordinator + workbench DOM)', () => {
  let root: HTMLElement;
  let coordinator: SessionWorkbenchCoordinator;
  let host: SessionWorkbenchHost;
  let service: AgentService & AgentChildSessionContinuationCapability;
  let current: AgentService;
  let sends: { count: number };
  let sessions: WorkbenchSession[];
  let active: number;
  const makeSession = (tabId: string, conversationId = 'c1'): WorkbenchSession => ({ tabId, backend: 'dsh', streaming: false,
    todos: [], backgroundTasks: [], resources: [],
    conversation: { id: conversationId, title: conversationId, backend: 'dsh', backendSessionId: 's1', createdAt: 1, updatedAt: 1, messages: [] } as Conversation });

  const flushAndRender = async () => { coordinator.refresh(); await flush(); };
  const openPanel = async () => {
    root.querySelector<HTMLButtonElement>('.opencodian-workbench-trigger')!.click();
    await flush();
  };
  const openChildRow = async () => {
    await openPanel();
    const row = root.querySelector<HTMLButtonElement>('[data-section="agents"] button[aria-label="Review child"]')
      ?? root.querySelector<HTMLButtonElement>('[data-section="agents"] button');
    row!.click();
    await flush();
  };
  const composerInput = () => root.querySelector<HTMLTextAreaElement>('.opencodian-workbench-child-input');
  const sendButton = () => root.querySelector<HTMLButtonElement>(`button[aria-label="${t('workbench.info.childSend')}"]`);

  beforeEach(async () => {
    root = document.body.createDiv();
    sends = { count: 0 };
    service = makeService(sends);
    current = service;
    sessions = [makeSession('tab-a'), makeSession('tab-b')];
    active = 0;
    const app = { scope: new Scope(), keymap: { pushScope: jest.fn(), popScope: jest.fn() },
      loadLocalStorage: () => undefined, saveLocalStorage: () => undefined } as unknown as App;
    host = { app, getActiveSession: () => sessions[active], getSessions: () => sessions,
      getRegistry: () => ({ get: (kind: string) => kind === 'dsh' ? current : undefined }) as unknown as AgentServiceRegistry,
      getGoalSlot: () => root.createDiv(), getSummaryMount: () => root.createDiv(), getComposerShell: () => null,
      attachFiles: jest.fn(), mountTools: jest.fn(), updateTools: jest.fn(), syncTranscript: jest.fn(async () => {}),
      focusComposer: jest.fn(), openMessage: jest.fn(), openResource: jest.fn(), notify: jest.fn() };
    coordinator = new SessionWorkbenchCoordinator(host);
    coordinator.mount(root);
    await flush();
  });
  afterEach(() => { coordinator.destroy(); root.remove(); jest.clearAllMocks(); });

  it('case 2: clears the accepted text on receipt and never resends it while history hangs', async () => {
    service.readChildSessionMessages.mockImplementationOnce(async () => []);
    service.readChildSessionMessages.mockImplementationOnce(async () => []);
    service.readChildSessionMessages.mockRejectedValueOnce(new Error('history read failed'));
    service.readChildSessionMessages.mockImplementation(() => new Promise<ChatMessage[]>(() => {}));
    await openChildRow();
    expect(composerInput()).not.toBeNull();
    const input = composerInput()!;
    input.value = 'synthetic follow up';
    input.dispatchEvent(new Event('input'));
    sendButton()!.click();
    await flush();
    expect(service.continueChildSession).toHaveBeenCalledTimes(1);
    // Receipt rebuilds immediately: the accepted text cannot linger in the box,
    // so the stale DOM can never resend the accepted message.
    expect(composerInput()!.value).toBe('');
    sendButton()!.click();
    await flush();
    expect(service.continueChildSession).toHaveBeenCalledTimes(1);
    // The accepted receipt survives a failing history read: history outcomes
    // render as transcript errors and never erase receipt evidence.
    root.querySelector<HTMLButtonElement>(`button[aria-label="${t('workbench.refresh')}"]`)!.click();
    await flush();
    expect(root.querySelector('.opencodian-workbench-panel')?.textContent)
      .toContain(t('workbench.info.childSendAccepted', { messageId: 'inbox-1' }));
    expect(root.querySelector('[role="alert"]')?.textContent).toBe(t('workbench.info.failed'));
  });

  it('case 3: a swapped backend re-probes before any write and refuses on false', async () => {
    await openChildRow();
    expect(composerInput()).not.toBeNull();
    const swapped = makeService(sends);
    swapped.canContinueChildSession.mockResolvedValue(false);
    current = swapped;
    // Stale DOM still shows the composer; the real click must re-validate
    // against the CURRENT owner before writing.
    const input = composerInput()!;
    input.value = 'post-swap follow up';
    input.dispatchEvent(new Event('input'));
    sendButton()!.click();
    await flush();
    expect(swapped.canContinueChildSession).toHaveBeenCalledTimes(1);
    expect(swapped.continueChildSession).not.toHaveBeenCalled();
    expect((service as AgentChildSessionContinuationCapability).continueChildSession).not.toHaveBeenCalled();
    expect(root.querySelector('.opencodian-workbench-panel')?.textContent).toContain(t('workbench.info.childParentUnavailable'));
    // After the next refresh the composer is gone until the new owner proves delivery.
    await flushAndRender();
    expect(composerInput()).toBeNull();
  });

  it('case 3: refuses an owner replaced while its capability probe is pending', async () => {
    await openChildRow();
    let confirm!: (value: boolean) => void;
    const probing = makeService(sends);
    probing.canContinueChildSession.mockImplementation(() => new Promise<boolean>(resolve => { confirm = resolve; }));
    current = probing;
    composerInput()!.value = 'pending probe draft';
    composerInput()!.dispatchEvent(new Event('input'));
    sendButton()!.click();
    await flush();
    expect(probing.canContinueChildSession).toHaveBeenCalledTimes(1);
    const replacement = makeService(sends);
    current = replacement;
    root.querySelector<HTMLButtonElement>(`button[aria-label="${t('workbench.refresh')}"]`)!.click();
    await flush();
    expect(replacement.canContinueChildSession).toHaveBeenCalled();
    expect(composerInput()).not.toBeNull();
    confirm(true);
    await flush();
    expect(probing.continueChildSession).not.toHaveBeenCalled();
    expect(service.continueChildSession).not.toHaveBeenCalled();
    await flushAndRender();
    expect(composerInput()).not.toBeNull();
  });

  it('case 3: rechecks a cached-true owner after the async gate yields', async () => {
    await openChildRow();
    composerInput()!.value = 'cached owner draft';
    composerInput()!.dispatchEvent(new Event('input'));
    sendButton()!.click();
    current = makeService(sends);
    await flush();
    expect(service.continueChildSession).not.toHaveBeenCalled();
  });

  it('case 3: ignores a receipt from an owner replaced during delivery', async () => {
    await openChildRow();
    let accept!: (value: { messageId: string }) => void;
    service.continueChildSession!.mockImplementation(() => new Promise<{ messageId: string }>(resolve => { accept = resolve; }));
    composerInput()!.value = 'old owner pending draft';
    composerInput()!.dispatchEvent(new Event('input'));
    sendButton()!.click();
    await flush();
    expect(service.continueChildSession).toHaveBeenCalledTimes(1);
    current = makeService(sends);
    accept({ messageId: 'old-owner-receipt' });
    await flush();
    const information = (coordinator as unknown as { informationCoordinator: {
      project(session: WorkbenchSession): { child?: { draft?: string; sendNote?: string } };
    } }).informationCoordinator;
    expect(information.project(sessions[0]).child).toEqual(expect.objectContaining({ draft: 'old owner pending draft' }));
    expect(information.project(sessions[0]).child?.sendNote).toBeUndefined();
    expect(root.textContent).not.toContain('old-owner-receipt');
  });

  it('case 3b: child slots never cross tabs that share one conversation', async () => {
    await openChildRow();
    const input = composerInput()!;
    input.value = 'same synthetic draft';
    input.dispatchEvent(new Event('input'));
    active = 1;
    await flushAndRender();
    // Tab B shares backend+conversation but has its own empty slot.
    expect(composerInput()).toBeNull();
    // A's late receipt cannot clear B's (nonexistent) composer state.
    await flush();
    expect(composerInput()).toBeNull();
  });

  it('case 4: reopening the panel re-projects the newest draft and restores the caret', async () => {
    await openChildRow();
    const input = composerInput()!;
    input.value = 'example draft';
    input.dispatchEvent(new Event('input'));
    await flushAndRender();
    const rebuilt = composerInput()!;
    expect(rebuilt.value).toBe('example draft');
    rebuilt.value = 'new draft after refresh';
    rebuilt.setSelectionRange(3, 3);
    rebuilt.dispatchEvent(new Event('input'));
    service.readSessionInformation!.mockImplementation(() => new Promise(() => {}));
    service.readChildSessionMessages.mockImplementation(() => new Promise<ChatMessage[]>(() => {}));
    // The trigger must synchronously re-project even when authoritative reads
    // never settle; an eager fake response must not hide the stale snapshot.
    root.querySelector<HTMLButtonElement>('.opencodian-workbench-trigger')!.click();
    await flush();
    const reopened = composerInput()!;
    expect(reopened.value).toBe('new draft after refresh');
    expect(reopened.selectionStart).toBe(3);
  });

  it('case 5: an unknown probe keeps the composer read-only without an input', async () => {
    service.canContinueChildSession.mockRejectedValue(new Error('capability read failed'));
    await openChildRow();
    expect(composerInput()).toBeNull();
    expect(root.querySelector('.opencodian-workbench-panel')?.textContent).toContain(t('workbench.info.childCapabilityUnknown'));
    expect(sendButton()).toBeNull();
  });
});
