import type { AppServerReviewResult } from '../../../../src/core/agents/backend/CodexAppServerClient';
import {
  ConversationSessionSettingsModal,
} from '../../../../src/features/chat/ui/ConversationSessionSettingsModal';
import { setLocale } from '../../../../src/i18n';

function makeOptions(overrides?: Record<string, unknown>) {
  return {
    conversationTitle: 'Codex chat',
    defaults: {
      chatFontSizePx: 13,
      codexSandboxMode: 'workspace-write' as const,
      codexModelReasoningEffort: 'medium' as const,
    },
    showCodexControls: true,
    onSave: jest.fn(),
    ...overrides,
  };
}

function makeReviewResult(status: string, messages?: string[]): AppServerReviewResult {
  return {
    turn: { id: 'turn-1', status, items: [], error: null },
    reviewThreadId: 'thread-1',
    ...(messages ? { reviewMessages: messages } : {}),
  };
}

describe('ConversationSessionSettingsModal Codex review section', () => {
  beforeEach(() => {
    setLocale('en');
  });

  it('renders review section when onStartReview is provided', () => {
    const modal = new ConversationSessionSettingsModal({} as never, makeOptions({
      onStartReview: jest.fn().mockResolvedValue(null),
    }));
    modal.onOpen();

    const section = modal.contentEl.querySelector('[data-codex-review-section]');
    expect(section).not.toBeNull();
  });

  it('does not render review section when onStartReview is absent', () => {
    const modal = new ConversationSessionSettingsModal({} as never, makeOptions());
    modal.onOpen();

    const section = modal.contentEl.querySelector('[data-codex-review-section]');
    expect(section).toBeNull();
  });

  it('target dropdown has four options', () => {
    const modal = new ConversationSessionSettingsModal({} as never, makeOptions({
      onStartReview: jest.fn().mockResolvedValue(null),
    }));
    modal.onOpen();

    const select = modal.contentEl.querySelector<HTMLSelectElement>('[data-codex-review-target]');
    expect(select).not.toBeNull();
    const values = Array.from(select!.options).map((o) => o.value);
    expect(values).toEqual(['uncommittedChanges', 'baseBranch', 'commit', 'custom']);
  });

  it('param input is hidden when target is uncommittedChanges (default)', () => {
    const modal = new ConversationSessionSettingsModal({} as never, makeOptions({
      onStartReview: jest.fn().mockResolvedValue(null),
    }));
    modal.onOpen();

    const param = modal.contentEl.querySelector<HTMLInputElement>('[data-codex-review-param]');
    expect(param).not.toBeNull();
    expect(param!.style.display).toBe('none');
  });

  it('param input shows when target changes to baseBranch', () => {
    const modal = new ConversationSessionSettingsModal({} as never, makeOptions({
      onStartReview: jest.fn().mockResolvedValue(null),
    }));
    modal.onOpen();

    const select = modal.contentEl.querySelector<HTMLSelectElement>('[data-codex-review-target]');
    select!.value = 'baseBranch';
    select!.dispatchEvent(new Event('change'));

    const param = modal.contentEl.querySelector<HTMLInputElement>('[data-codex-review-param]');
    expect(param!.style.display).not.toBe('none');
  });

  it('param input hides when target changes back to uncommittedChanges', () => {
    const modal = new ConversationSessionSettingsModal({} as never, makeOptions({
      onStartReview: jest.fn().mockResolvedValue(null),
    }));
    modal.onOpen();

    const select = modal.contentEl.querySelector<HTMLSelectElement>('[data-codex-review-target]');
    select!.value = 'commit';
    select!.dispatchEvent(new Event('change'));

    const param = modal.contentEl.querySelector<HTMLInputElement>('[data-codex-review-param]');
    expect(param!.style.display).not.toBe('none');

    select!.value = 'uncommittedChanges';
    select!.dispatchEvent(new Event('change'));
    expect(param!.style.display).toBe('none');
  });

  it('status starts as idle', () => {
    const modal = new ConversationSessionSettingsModal({} as never, makeOptions({
      onStartReview: jest.fn().mockResolvedValue(null),
    }));
    modal.onOpen();

    const status = modal.contentEl.querySelector<HTMLElement>('[data-codex-review-status]');
    expect(status?.getAttribute('data-codex-review-status')).toBe('idle');
  });

  it('shows error status when onStartReview returns null', async () => {
    const modal = new ConversationSessionSettingsModal({} as never, makeOptions({
      onStartReview: jest.fn().mockResolvedValue(null),
    }));
    modal.onOpen();

    const btn = modal.contentEl.querySelector<HTMLButtonElement>('[data-codex-review-start]');
    btn!.click();

    // Wait for async handler
    await new Promise((r) => setTimeout(r, 50));

    const status = modal.contentEl.querySelector<HTMLElement>('[data-codex-review-status]');
    expect(status?.getAttribute('data-codex-review-status')).toBe('error');
  });

  it('shows error status when onStartReview throws', async () => {
    const modal = new ConversationSessionSettingsModal({} as never, makeOptions({
      onStartReview: jest.fn().mockRejectedValue(new Error('network failure')),
    }));
    modal.onOpen();

    const btn = modal.contentEl.querySelector<HTMLButtonElement>('[data-codex-review-start]');
    btn!.click();

    await new Promise((r) => setTimeout(r, 50));

    const status = modal.contentEl.querySelector<HTMLElement>('[data-codex-review-status]');
    expect(status?.getAttribute('data-codex-review-status')).toBe('error');
    expect(status?.textContent).toContain('network failure');
  });

  it('normalizes inProgress status to in_progress (NOT failed)', async () => {
    // This is the bug from review finding A: app-server returns 'inProgress'
    // (camelCase) but the status mapper checked for 'in_progress' (snake_case),
    // causing in-progress to fall through to the failed label.
    const modal = new ConversationSessionSettingsModal({} as never, makeOptions({
      onStartReview: jest.fn().mockResolvedValue(makeReviewResult('inProgress')),
    }));
    modal.onOpen();

    const btn = modal.contentEl.querySelector<HTMLButtonElement>('[data-codex-review-start]');
    btn!.click();

    await new Promise((r) => setTimeout(r, 50));

    const status = modal.contentEl.querySelector<HTMLElement>('[data-codex-review-status]');
    expect(status?.getAttribute('data-codex-review-status')).toBe('in_progress');
    // Must NOT contain the failed text
    expect(status?.textContent).not.toMatch(/failed/i);
  });

  it('shows completed status for completed turn', async () => {
    const modal = new ConversationSessionSettingsModal({} as never, makeOptions({
      onStartReview: jest.fn().mockResolvedValue(
        makeReviewResult('completed', ['LGTM: no issues found']),
      ),
    }));
    modal.onOpen();

    const btn = modal.contentEl.querySelector<HTMLButtonElement>('[data-codex-review-start]');
    btn!.click();

    await new Promise((r) => setTimeout(r, 50));

    const status = modal.contentEl.querySelector<HTMLElement>('[data-codex-review-status]');
    expect(status?.getAttribute('data-codex-review-status')).toBe('completed');
  });

  it('shows interrupted status for interrupted turn', async () => {
    const modal = new ConversationSessionSettingsModal({} as never, makeOptions({
      onStartReview: jest.fn().mockResolvedValue(makeReviewResult('interrupted')),
    }));
    modal.onOpen();

    const btn = modal.contentEl.querySelector<HTMLButtonElement>('[data-codex-review-start]');
    btn!.click();

    await new Promise((r) => setTimeout(r, 50));

    const status = modal.contentEl.querySelector<HTMLElement>('[data-codex-review-status]');
    expect(status?.getAttribute('data-codex-review-status')).toBe('interrupted');
  });

  it('disables start button during review and re-enables after', async () => {
    let resolveReview: (value: AppServerReviewResult | null) => void = () => {};
    const reviewPromise = new Promise<AppServerReviewResult | null>((r) => { resolveReview = r; });
    const modal = new ConversationSessionSettingsModal({} as never, makeOptions({
      onStartReview: jest.fn().mockReturnValue(reviewPromise),
    }));
    modal.onOpen();

    const btn = modal.contentEl.querySelector<HTMLButtonElement>('[data-codex-review-start]');
    expect(btn!.disabled).toBe(false);

    btn!.click();
    await new Promise((r) => setTimeout(r, 10));
    expect(btn!.disabled).toBe(true);

    resolveReview(makeReviewResult('completed'));
    await new Promise((r) => setTimeout(r, 10));
    expect(btn!.disabled).toBe(false);
  });
});
