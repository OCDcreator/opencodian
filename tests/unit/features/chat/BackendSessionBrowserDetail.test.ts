/**
 * Unit tests for BackendSessionBrowserDetail transcript rendering:
 * paginated turns path (load more / unavailable) and legacy fallback.
 */

import {
  getBackendSessionDetail,
  getBackendSessionPreview,
  getBackendSessionTurnsPage,
  hasBackendSessionTurnsPage,
  type NormalizedSessionDetail,
} from '../../../../src/core/agents/backend/AgentBackendRouting';
import type { AgentServiceRegistry } from '../../../../src/core/agents/backend/AgentServiceRegistry';
import { renderBackendSessionDetail } from '../../../../src/features/chat/ui/BackendSessionBrowserDetail';

jest.mock('../../../../src/core/agents/backend/AgentBackendRouting', () => ({
  ...jest.requireActual('../../../../src/core/agents/backend/AgentBackendRouting'),
  getBackendSessionDetail: jest.fn(),
  getBackendSessionPreview: jest.fn(),
  getBackendSessionTurnsPage: jest.fn(),
  hasBackendSessionTurnsPage: jest.fn(),
}));

const seamMock = hasBackendSessionTurnsPage as jest.Mock;
const detailMock = getBackendSessionDetail as jest.Mock;
const previewMock = getBackendSessionPreview as jest.Mock;
const turnsPageMock = getBackendSessionTurnsPage as jest.Mock;

const REGISTRY = null as AgentServiceRegistry | null;

function makeDetail(): NormalizedSessionDetail {
  return {
    id: 'ses-1',
    backendKind: 'codex',
    title: 'Test session',
    summary: '',
    createdAt: 1000,
    updatedAt: 2000,
    customTitle: null,
    gitBranch: null,
    cwd: '/vault',
    tag: null,
    fileSize: null,
  };
}

async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('renderBackendSessionDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    detailMock.mockResolvedValue(makeDetail());
  });

  describe('legacy path (backend without the paginated turns seam)', () => {
    it('renders the flat preview transcript unchanged', async () => {
      seamMock.mockReturnValue(false);
      previewMock.mockResolvedValue([
        { role: 'user', parts: [{ type: 'text', text: 'hello' }] },
        { role: 'assistant', parts: [{ type: 'text', text: 'hi' }] },
      ]);

      const el = document.createElement('div');
      await renderBackendSessionDetail(el, 'ses-1', REGISTRY);

      expect(previewMock).toHaveBeenCalledWith(REGISTRY, 'ses-1');
      expect(turnsPageMock).not.toHaveBeenCalled();
      expect(el.querySelectorAll('.opencodian-backend-session-browser-detail-msg')).toHaveLength(2);
      expect(el.querySelector('.opencodian-backend-session-browser-detail-load-more')).toBeNull();
    });

    it('renders the empty state when the legacy preview has no messages', async () => {
      seamMock.mockReturnValue(false);
      previewMock.mockResolvedValue([]);

      const el = document.createElement('div');
      await renderBackendSessionDetail(el, 'ses-1', REGISTRY);

      expect(el.querySelector('.opencodian-backend-session-browser-detail-transcript-empty')).not.toBeNull();
    });
  });

  describe('paginated path (backend with the turns seam)', () => {
    it('renders the first turns page without a load-more button when exhausted', async () => {
      seamMock.mockReturnValue(true);
      turnsPageMock.mockResolvedValue({
        messages: [{ role: 'user', parts: [{ type: 'text', text: 'only page' }] }],
        nextCursor: null,
        backwardsCursor: null,
      });

      const el = document.createElement('div');
      await renderBackendSessionDetail(el, 'ses-1', REGISTRY);

      expect(previewMock).not.toHaveBeenCalled();
      expect(turnsPageMock).toHaveBeenCalledWith(REGISTRY, 'ses-1', { limit: 20, sortDirection: 'asc' });
      expect(el.querySelectorAll('.opencodian-backend-session-browser-detail-msg')).toHaveLength(1);
      expect(el.querySelector('.opencodian-backend-session-browser-detail-load-more')).toBeNull();
    });

    it('appends the next turns page when load-more is clicked and removes the button at the end', async () => {
      seamMock.mockReturnValue(true);
      turnsPageMock
        .mockResolvedValueOnce({
          messages: [{ role: 'user', parts: [{ type: 'text', text: 'first' }] }],
          nextCursor: 'cursor-2',
          backwardsCursor: null,
        })
        .mockResolvedValueOnce({
          messages: [
            { role: 'assistant', parts: [{ type: 'text', text: 'second' }] },
            { role: 'activity', parts: [{ type: 'tool_call', text: 'fs/read' }] },
          ],
          nextCursor: null,
          backwardsCursor: null,
        });

      const el = document.createElement('div');
      await renderBackendSessionDetail(el, 'ses-1', REGISTRY);

      expect(el.querySelectorAll('.opencodian-backend-session-browser-detail-msg')).toHaveLength(1);
      const loadMore = el.querySelector('.opencodian-backend-session-browser-detail-load-more') as HTMLButtonElement;
      expect(loadMore).not.toBeNull();
      expect(el.querySelector('.opencodian-backend-session-browser-detail-transcript-count')?.textContent)
        .toContain('1 messages');

      loadMore.click();
      await flushAsync();

      expect(turnsPageMock).toHaveBeenLastCalledWith(REGISTRY, 'ses-1', {
        cursor: 'cursor-2',
        limit: 20,
        sortDirection: 'asc',
      });
      expect(el.querySelectorAll('.opencodian-backend-session-browser-detail-msg')).toHaveLength(2);
      expect(el.querySelector('.opencodian-backend-session-browser-detail-activity')).not.toBeNull();
      expect(el.querySelector('.opencodian-backend-session-browser-detail-load-more')).toBeNull();
      expect(el.querySelector('.opencodian-backend-session-browser-detail-transcript-count')?.textContent)
        .toContain('3 messages');
    });

    it('keeps the load-more button with a retry label when the next page fails', async () => {
      seamMock.mockReturnValue(true);
      turnsPageMock
        .mockResolvedValueOnce({
          messages: [{ role: 'user', parts: [{ type: 'text', text: 'first' }] }],
          nextCursor: 'cursor-2',
          backwardsCursor: null,
        })
        .mockResolvedValueOnce(null);

      const el = document.createElement('div');
      await renderBackendSessionDetail(el, 'ses-1', REGISTRY);

      const loadMore = el.querySelector('.opencodian-backend-session-browser-detail-load-more') as HTMLButtonElement;
      loadMore.click();
      await flushAsync();

      expect(el.querySelector('.opencodian-backend-session-browser-detail-load-more')).not.toBeNull();
      const retryBtn = el.querySelector('.opencodian-backend-session-browser-detail-load-more') as HTMLButtonElement;
      expect(retryBtn.disabled).toBe(false);
      expect(retryBtn.textContent).toContain('Retry');
      expect(el.querySelectorAll('.opencodian-backend-session-browser-detail-msg')).toHaveLength(1);
    });

    it('renders the empty state for an empty first page', async () => {
      seamMock.mockReturnValue(true);
      turnsPageMock.mockResolvedValue({ messages: [], nextCursor: null, backwardsCursor: null });

      const el = document.createElement('div');
      await renderBackendSessionDetail(el, 'ses-1', REGISTRY);

      expect(el.querySelector('.opencodian-backend-session-browser-detail-transcript-empty')).not.toBeNull();
      expect(el.querySelector('.opencodian-backend-session-browser-detail-load-more')).toBeNull();
    });

    it('renders the unavailable placeholder when the thread is missing or deleted (null page)', async () => {
      seamMock.mockReturnValue(true);
      turnsPageMock.mockResolvedValue(null);

      const el = document.createElement('div');
      await renderBackendSessionDetail(el, 'ses-1', REGISTRY);

      expect(previewMock).not.toHaveBeenCalled();
      expect(el.querySelector('.opencodian-backend-session-browser-detail-transcript-unavailable')).not.toBeNull();
      // Metadata card still renders so the user sees which session failed.
      expect(el.querySelector('.opencodian-backend-session-browser-detail-metadata')).not.toBeNull();
    });
  });
});
