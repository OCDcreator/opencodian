/**
 * DOM-level regression tests for the Codex `$` skill-selector trigger.
 *
 * Simulates REAL input events on a real textarea (the same build path the live
 * UI uses) to guard the previously-broken flow where `$` left the menu blank
 * and cleared the textarea. Covers `$missing`, `use $missing` (mid-text), and
 * selecting a skill (raw `$skill-name ` insertion preserving surroundings).
 */
import type { SlashCommandMenuItem } from '../../../../src/core/config/slashCommandCatalog';
import {
  ComposerInputShellCoordinator,
  type ComposerInputShellCoordinatorHost,
} from '../../../../src/features/chat/services/ComposerInputShellCoordinator';
import { setLocale, t } from '../../../../src/i18n';

class ResizeObserverMock {
  readonly observe = jest.fn();
  readonly disconnect = jest.fn();
}

function codexSkillItem(id: string, description: string): SlashCommandMenuItem {
  return {
    id,
    description,
    hasProjectOverride: false,
    insertText: `$${id} `,
    runtimeAvailable: true,
    source: 'codex-skill',
    subtask: false,
    isBuiltin: false,
  };
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function createCodexFixture(menuItems: SlashCommandMenuItem[] = []) {
  const host: jest.Mocked<ComposerInputShellCoordinatorHost> = {
    attachSessionTodo: jest.fn(),
    attachQuestionDock: jest.fn(),
    setContextRowElement: jest.fn(),
    setTooltipLabel: jest.fn(),
    getInputPlaceholder: jest.fn(() => t('chat.input.placeholder')),
    getSlashCommandSkillMode: jest.fn(() => 'skills-command'),
    isCodexBackendActive: jest.fn(() => true),
    onCodexAgentMentionUnavailable: jest.fn(),
    onCodexSkillsEmpty: jest.fn(),
    addChosenFileContextToActiveTab: jest.fn().mockResolvedValue(undefined),
    registerEscapeHandler: jest.fn(),
    mountSelectionControls: jest.fn(),
    mountContextUsageIndicator: jest.fn(),
    mountEffortSelector: jest.fn(),
    isActiveTabStreaming: jest.fn(() => false),
    cancelStreaming: jest.fn(),
    isTabForegroundBusy: jest.fn(() => false),
    showProcessingBlockedNotice: jest.fn(),
    getComposerInputMode: jest.fn(() => 'prompt'),
    submitMessage: jest.fn(),
    loadSlashCommandMenuItems: jest.fn().mockImplementation(async () => menuItems),
    setComposerStackHeight: jest.fn(),
    scheduleSettledScrollToBottomIfNeeded: jest.fn(),
  };
  const container = document.body.createDiv();
  const coordinator = new ComposerInputShellCoordinator(host);
  coordinator.build(container);
  const textarea = container.querySelector<HTMLTextAreaElement>('.opencodian-input');
  if (!textarea) {
    throw new Error('textarea was not created');
  }
  return { container, textarea, host, coordinator };
}

function renderedMenuText(container: HTMLElement): Array<string | null> {
  return Array.from(
    container.querySelectorAll<HTMLElement>('.opencodian-slash-command-menu-item'),
    (el) => el.textContent,
  );
}

function menuHasSkillsEntry(container: HTMLElement): boolean {
  return renderedMenuText(container).some((text) => text !== null && /skills/i.test(text));
}

function type(textarea: HTMLTextAreaElement, value: string, cursor?: number): void {
  textarea.value = value;
  const at = cursor ?? value.length;
  textarea.setSelectionRange(at, at);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('ComposerInputShellCoordinator — Codex `$` trigger (real DOM)', () => {
  beforeEach(() => {
    setLocale('en');
    (globalThis as typeof globalThis & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver =
      ResizeObserverMock as unknown as typeof ResizeObserver;
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
    delete (globalThis as typeof globalThis & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
  });

  it('opens the skill selector on `$missing` (no skills) showing the /skills entry, without clearing the textarea', async () => {
    const fixture = createCodexFixture([]); // zero codex skills
    type(fixture.textarea, '$missing');

    await flushAsync();

    // Menu is NOT blank — the /skills capability entry is present.
    expect(menuHasSkillsEntry(fixture.container)).toBe(true);
    // The user's input is preserved (the bug cleared it).
    expect(fixture.textarea.value).toBe('$missing');
  });

  it('opens the selector on mid-text `use $missing` and preserves surrounding text', async () => {
    const fixture = createCodexFixture([]);
    type(fixture.textarea, 'use $missing');

    await flushAsync();

    expect(menuHasSkillsEntry(fixture.container)).toBe(true);
    expect(fixture.textarea.value).toBe('use $missing');
  });

  it('lists matching skills for `$cod` plus the /skills entry', async () => {
    const fixture = createCodexFixture([
      codexSkillItem('code-review', 'Review code'),
      codexSkillItem('git-flow', 'Git workflow'),
    ]);
    type(fixture.textarea, '$cod');

    await flushAsync();

    const texts = renderedMenuText(fixture.container);
    expect(texts.some((x) => x && /code-review/i.test(x))).toBe(true);
    expect(texts.some((x) => x && /skills/i.test(x))).toBe(true);
    expect(texts.some((x) => x && /git-flow/i.test(x))).toBe(false);
  });

  it('selecting a skill inserts raw `$skill-name ` and preserves surrounding text', async () => {
    const fixture = createCodexFixture([codexSkillItem('code-review', 'Review code')]);
    type(fixture.textarea, 'use $cod', 'use $cod'.length);

    await flushAsync();

    // Select the highlighted (first) item via Enter.
    fixture.textarea.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
    await flushAsync();

    // The `$cod` token is replaced with the raw `$code-review ` text; the
    // surrounding `use ` prefix is preserved. Nothing is sent to the OpenCode
    // session-command path.
    expect(fixture.textarea.value).toContain('$code-review ');
    expect(fixture.textarea.value).toContain('use ');
    expect(fixture.host.submitMessage).not.toHaveBeenCalled();
  });

  it('does NOT clear the textarea when no skill matches `$zzz`', async () => {
    const fixture = createCodexFixture([codexSkillItem('code-review', 'Review code')]);
    type(fixture.textarea, '$zzz');

    await flushAsync();

    // Still shows the /skills entry (not blank) and keeps input intact.
    expect(menuHasSkillsEntry(fixture.container)).toBe(true);
    expect(fixture.textarea.value).toBe('$zzz');
  });
});
