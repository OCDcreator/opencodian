/**
 * Unit tests for BackendSessionBrowserModal fork / archive / unarchive actions.
 */

import { App } from 'obsidian';

import { AgentCapability } from '../../../../src/core/agents/AgentCapability';
import {
  archiveBackendSession,
  forkBackendSession,
  unarchiveBackendSession,
} from '../../../../src/core/agents/backend/AgentBackendRouting';
import {
  type BackendSessionBrowserHost,
  BackendSessionBrowserModal,
} from '../../../../src/features/chat/ui/BackendSessionBrowserModal';

jest.mock('../../../../src/core/agents/backend/AgentBackendRouting', () => ({
  ...jest.requireActual('../../../../src/core/agents/backend/AgentBackendRouting'),
  forkBackendSession: jest.fn().mockResolvedValue({ id: 'forked-1', title: 'Forked' }),
  archiveBackendSession: jest.fn().mockResolvedValue(true),
  unarchiveBackendSession: jest.fn().mockResolvedValue(true),
  listBackendSessions: jest.fn().mockResolvedValue([
    { id: 'session-1', title: 'First', shareUrl: null, updatedAt: Date.now(), archived: false },
    { id: 'session-2', title: 'Second', shareUrl: null, updatedAt: Date.now(), archived: true },
  ]),
  getBackendSessionPreview: jest.fn().mockResolvedValue([]),
}));

function createHost(overrides?: Partial<BackendSessionBrowserHost>): BackendSessionBrowserHost {
  const mockService = {
    hasCapability: (cap: AgentCapability) =>
      cap === AgentCapability.Fork || cap === AgentCapability.Sessions,
  };
  return {
    getAgentServiceRegistry: () => ({
      getActive: () => mockService,
      get: () => mockService,
    }) as unknown as ReturnType<BackendSessionBrowserHost['getAgentServiceRegistry']>,
    createConversationFromBackendSession: jest.fn().mockResolvedValue('conv-1'),
    loadConversation: jest.fn().mockResolvedValue(undefined),
    getActiveBackendKind: () => 'codex',
    showNotice: jest.fn(),
    isStreaming: () => false,
    ...overrides,
  };
}

async function openModal(host: BackendSessionBrowserHost): Promise<BackendSessionBrowserModal> {
  const modal = new BackendSessionBrowserModal({} as App, host);
  modal.open();
  modal.onOpen();
  // Wait for async loadSessions() to complete
  await new Promise((resolve) => setTimeout(resolve, 50));
  return modal;
}

describe('BackendSessionBrowserModal lifecycle actions', () => {
  it('renders fork and archive buttons for an active session', async () => {
    const host = createHost();
    const modal = await openModal(host);

    const item = modal.contentEl.querySelector('[data-session-id="session-1"]') as HTMLElement;
    item?.click();
    await new Promise((resolve) => setTimeout(resolve, 10));

    const footer = modal.contentEl.querySelector('.opencodian-backend-session-browser-footer');
    expect(footer).not.toBeNull();
    expect(footer!.querySelector('.opencodian-backend-session-browser-fork-btn')).not.toBeNull();
    expect(footer!.querySelector('.opencodian-backend-session-browser-archive-btn')).not.toBeNull();
    expect(footer!.querySelector('.opencodian-backend-session-browser-unarchive-btn')).toBeNull();
  });

  it('renders unarchive button for an archived session and hides fork/archive', async () => {
    const host = createHost();
    const modal = await openModal(host);

    const item = modal.contentEl.querySelector('[data-session-id="session-2"]') as HTMLElement;
    item?.click();
    await new Promise((resolve) => setTimeout(resolve, 10));

    const footer = modal.contentEl.querySelector('.opencodian-backend-session-browser-footer');
    expect(footer!.querySelector('.opencodian-backend-session-browser-fork-btn')).toBeNull();
    expect(footer!.querySelector('.opencodian-backend-session-browser-archive-btn')).toBeNull();
    expect(footer!.querySelector('.opencodian-backend-session-browser-unarchive-btn')).not.toBeNull();
  });

  it('does not render lifecycle buttons when active backend lacks capabilities', async () => {
    const host = createHost({
      getAgentServiceRegistry: () => ({
        getActive: () => ({
          hasCapability: () => false,
        }),
        get: () => null,
      }) as unknown as ReturnType<BackendSessionBrowserHost['getAgentServiceRegistry']>,
    });
    const modal = await openModal(host);

    const footer = modal.contentEl.querySelector('.opencodian-backend-session-browser-footer');
    expect(footer!.querySelector('.opencodian-backend-session-browser-fork-btn')).toBeNull();
    expect(footer!.querySelector('.opencodian-backend-session-browser-archive-btn')).toBeNull();
    expect(footer!.querySelector('.opencodian-backend-session-browser-unarchive-btn')).toBeNull();
  });

  it('archived sessions display the archived label and is-archived class', async () => {
    const host = createHost();
    const modal = await openModal(host);

    const items = modal.contentEl.querySelectorAll('.opencodian-backend-session-browser-item');
    expect(items.length).toBe(2);
    expect(items[0].querySelector('.opencodian-backend-session-browser-item-archived')).toBeNull();
    expect(items[0].classList.contains('is-archived')).toBe(false);
    expect(items[1].querySelector('.opencodian-backend-session-browser-item-archived')).not.toBeNull();
    expect(items[1].classList.contains('is-archived')).toBe(true);
  });

  it('clicking fork delegates to forkBackendSession routing and refreshes the list', async () => {
    const host = createHost();
    const modal = await openModal(host);

    const item = modal.contentEl.querySelector('[data-session-id="session-1"]') as HTMLElement;
    item?.click();
    await new Promise((resolve) => setTimeout(resolve, 10));

    const forkBtn = modal.contentEl.querySelector('.opencodian-backend-session-browser-fork-btn') as HTMLButtonElement;
    expect(forkBtn.disabled).toBe(false);
    forkBtn.click();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(forkBackendSession).toHaveBeenCalledWith(expect.anything(), 'session-1');
    expect(host.showNotice).toHaveBeenCalledWith(expect.stringContaining('Forked'));
  });

  it('clicking archive delegates to archiveBackendSession routing and refreshes the list', async () => {
    const host = createHost();
    const modal = await openModal(host);

    const item = modal.contentEl.querySelector('[data-session-id="session-1"]') as HTMLElement;
    item?.click();
    await new Promise((resolve) => setTimeout(resolve, 10));

    const archiveBtn = modal.contentEl.querySelector('.opencodian-backend-session-browser-archive-btn') as HTMLButtonElement;
    expect(archiveBtn.disabled).toBe(false);
    archiveBtn.click();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(archiveBackendSession).toHaveBeenCalledWith(expect.anything(), 'session-1');
  });

  it('clicking unarchive on an archived row delegates to unarchiveBackendSession routing and refreshes the list', async () => {
    const host = createHost();
    const modal = await openModal(host);

    const item = modal.contentEl.querySelector('[data-session-id="session-2"]') as HTMLElement;
    item?.click();
    await new Promise((resolve) => setTimeout(resolve, 10));

    const unarchiveBtn = modal.contentEl.querySelector('.opencodian-backend-session-browser-unarchive-btn') as HTMLButtonElement;
    expect(unarchiveBtn.disabled).toBe(false);
    unarchiveBtn.click();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(unarchiveBackendSession).toHaveBeenCalledWith(expect.anything(), 'session-2');
  });
});
