/**
 * Unit tests for BackendSessionBrowserModal search filtering.
 */

import { App } from 'obsidian';

import {
  type BackendSessionBrowserHost,
  BackendSessionBrowserModal,
} from '../../../../src/features/chat/ui/BackendSessionBrowserModal';

jest.mock('../../../../src/core/agents/backend/AgentBackendRouting', () => ({
  ...jest.requireActual('../../../../src/core/agents/backend/AgentBackendRouting'),
  listBackendSessions: jest.fn(),
  getBackendSessionPreview: jest.fn().mockResolvedValue([]),
  getBackendSessionDetail: jest.fn().mockResolvedValue(null),
  forkBackendSession: jest.fn(),
  archiveBackendSession: jest.fn(),
  unarchiveBackendSession: jest.fn(),
}));

const { listBackendSessions } = jest.requireMock('../../../../src/core/agents/backend/AgentBackendRouting');

function createHost(overrides?: Partial<BackendSessionBrowserHost>): BackendSessionBrowserHost {
  const mockService = {
    hasCapability: () => false,
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
  await new Promise((resolve) => setTimeout(resolve, 50));
  return modal;
}

describe('BackendSessionBrowserModal search filtering', () => {
  beforeEach(() => {
    listBackendSessions.mockResolvedValue([
      { id: 's1', title: 'Build a React app', shareUrl: null, updatedAt: Date.now() },
      { id: 's2', title: 'Debug Python script', shareUrl: null, updatedAt: Date.now() },
      { id: 's3', title: 'Refactor database schema', shareUrl: null, updatedAt: Date.now() },
      { id: 's4', title: 'Write unit tests', shareUrl: null, updatedAt: Date.now() },
    ]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders all sessions when search is empty', async () => {
    const modal = await openModal(createHost());
    const items = modal.contentEl.querySelectorAll('.opencodian-backend-session-browser-item');
    expect(items.length).toBe(4);
  });

  it('renders search input', async () => {
    const modal = await openModal(createHost());
    const input = modal.contentEl.querySelector('.opencodian-backend-session-browser-search-input');
    expect(input).not.toBeNull();
    expect((input as HTMLInputElement).type).toBe('search');
  });

  it('filters sessions by title (case-insensitive)', async () => {
    const modal = await openModal(createHost());

    const input = modal.contentEl.querySelector('.opencodian-backend-session-browser-search-input') as HTMLInputElement;
    input.value = 'python';
    input.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 10));

    const items = modal.contentEl.querySelectorAll('.opencodian-backend-session-browser-item');
    expect(items.length).toBe(1);
    expect(items[0].getAttribute('data-session-id')).toBe('s2');
  });

  it('shows no-match message when search yields no results', async () => {
    const modal = await openModal(createHost());

    const input = modal.contentEl.querySelector('.opencodian-backend-session-browser-search-input') as HTMLInputElement;
    input.value = 'nonexistent';
    input.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 10));

    const items = modal.contentEl.querySelectorAll('.opencodian-backend-session-browser-item');
    expect(items.length).toBe(0);

    const emptyMsg = modal.contentEl.querySelector('.opencodian-backend-session-browser-empty');
    expect(emptyMsg).not.toBeNull();
  });

  it('restores full list when search is cleared', async () => {
    const modal = await openModal(createHost());

    const input = modal.contentEl.querySelector('.opencodian-backend-session-browser-search-input') as HTMLInputElement;
    input.value = 'database';
    input.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(modal.contentEl.querySelectorAll('.opencodian-backend-session-browser-item').length).toBe(1);

    input.value = '';
    input.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(modal.contentEl.querySelectorAll('.opencodian-backend-session-browser-item').length).toBe(4);
  });
});
