import type { AppServerThreadGoal } from '../../../../src/core/agents/backend/CodexAppServerClient';
import {
  ConversationSessionSettingsModal,
} from '../../../../src/features/chat/ui/ConversationSessionSettingsModal';
import { setLocale } from '../../../../src/i18n';

const SAMPLE_GOAL: AppServerThreadGoal = {
  threadId: 'thread-1',
  objective: 'Build feature X',
  status: 'active',
  tokenBudget: null,
  tokensUsed: 0,
  timeUsedSeconds: 0,
  createdAt: 1781277321,
  updatedAt: 1781277321,
};

describe('ConversationSessionSettingsModal Codex thread goal', () => {
  beforeEach(() => {
    setLocale('en');
  });

  it('shows Clear goal button when initial goal exists', () => {
    const modal = new ConversationSessionSettingsModal({} as never, {
      conversationTitle: 'Codex chat',
      defaults: {
        chatFontSizePx: 13,
        codexSandboxMode: 'workspace-write',
        codexModelReasoningEffort: 'medium',
        codexModelOverride: 'codex-mini-latest',
        codexThreadGoal: SAMPLE_GOAL,
      },
      showCodexControls: true,
      onSave: jest.fn(),
      onClearThreadGoal: jest.fn().mockResolvedValue(true),
    });

    modal.onOpen();

    const clearBtn = modal.contentEl.querySelector<HTMLButtonElement>(
      '.opencodian-session-settings-codex-goal-clear-btn',
    );
    expect(clearBtn).not.toBeNull();
  });

  it('does not show Clear goal button when initial goal is null', () => {
    const modal = new ConversationSessionSettingsModal({} as never, {
      conversationTitle: 'Codex chat',
      defaults: {
        chatFontSizePx: 13,
        codexSandboxMode: 'workspace-write',
        codexModelReasoningEffort: 'medium',
        codexModelOverride: 'codex-mini-latest',
        codexThreadGoal: null,
      },
      showCodexControls: true,
      onSave: jest.fn(),
      onClearThreadGoal: jest.fn().mockResolvedValue(true),
      onSetThreadGoal: jest.fn().mockResolvedValue(SAMPLE_GOAL),
    });

    modal.onOpen();

    const clearBtn = modal.contentEl.querySelector<HTMLButtonElement>(
      '.opencodian-session-settings-codex-goal-clear-btn',
    );
    expect(clearBtn).toBeNull();
  });

  it('creates Clear goal button after setting goal from empty state', async () => {
    const setGoal = jest.fn().mockResolvedValue(SAMPLE_GOAL);
    const modal = new ConversationSessionSettingsModal({} as never, {
      conversationTitle: 'Codex chat',
      defaults: {
        chatFontSizePx: 13,
        codexSandboxMode: 'workspace-write',
        codexModelReasoningEffort: 'medium',
        codexModelOverride: 'codex-mini-latest',
        codexThreadGoal: null,
      },
      showCodexControls: true,
      onSave: jest.fn(),
      onClearThreadGoal: jest.fn().mockResolvedValue(true),
      onSetThreadGoal: setGoal,
    });

    modal.onOpen();

    expect(
      modal.contentEl.querySelector('.opencodian-session-settings-codex-goal-clear-btn'),
    ).toBeNull();

    const input = modal.contentEl.querySelector<HTMLInputElement>(
      '.opencodian-session-settings-codex-goal-input',
    );
    const setBtn = modal.contentEl.querySelector<HTMLButtonElement>(
      '.opencodian-session-settings-codex-goal-set-btn',
    );

    if (!input || !setBtn) {
      throw new Error('Expected goal set controls to render');
    }

    input.value = 'Build feature X';
    setBtn.click();
    await Promise.resolve();

    expect(setGoal).toHaveBeenCalledWith('Build feature X', undefined);

    const clearBtn = modal.contentEl.querySelector<HTMLButtonElement>(
      '.opencodian-session-settings-codex-goal-clear-btn',
    );
    expect(clearBtn).not.toBeNull();
  });

  it('does not create duplicate Clear goal button on repeated set', async () => {
    const setGoal = jest.fn().mockResolvedValue(SAMPLE_GOAL);
    const modal = new ConversationSessionSettingsModal({} as never, {
      conversationTitle: 'Codex chat',
      defaults: {
        chatFontSizePx: 13,
        codexSandboxMode: 'workspace-write',
        codexModelReasoningEffort: 'medium',
        codexModelOverride: 'codex-mini-latest',
        codexThreadGoal: null,
      },
      showCodexControls: true,
      onSave: jest.fn(),
      onClearThreadGoal: jest.fn().mockResolvedValue(true),
      onSetThreadGoal: setGoal,
    });

    modal.onOpen();

    const input = modal.contentEl.querySelector<HTMLInputElement>(
      '.opencodian-session-settings-codex-goal-input',
    );
    const setBtn = modal.contentEl.querySelector<HTMLButtonElement>(
      '.opencodian-session-settings-codex-goal-set-btn',
    );

    if (!input || !setBtn) {
      throw new Error('Expected goal set controls to render');
    }

    input.value = 'Build feature X';
    setBtn.click();
    await Promise.resolve();

    input.value = 'Build feature Y';
    setBtn.click();
    await Promise.resolve();

    const clearButtons = modal.contentEl.querySelectorAll<HTMLButtonElement>(
      '.opencodian-session-settings-codex-goal-clear-btn',
    );
    expect(clearButtons.length).toBe(1);
  });

  it('renders budget input alongside goal text input', () => {
    const modal = new ConversationSessionSettingsModal({} as never, {
      conversationTitle: 'Codex chat',
      defaults: {
        chatFontSizePx: 13,
        codexSandboxMode: 'workspace-write',
        codexModelReasoningEffort: 'medium',
        codexModelOverride: 'codex-mini-latest',
        codexThreadGoal: null,
      },
      showCodexControls: true,
      onSave: jest.fn(),
      onSetThreadGoal: jest.fn().mockResolvedValue(SAMPLE_GOAL),
    });

    modal.onOpen();

    const goalSetShell = modal.contentEl.querySelector('.opencodian-session-settings-codex-goal-set');
    expect(goalSetShell).not.toBeNull();

    const textInput = goalSetShell!.querySelector<HTMLInputElement>(
      'input.opencodian-session-settings-codex-goal-input',
    );
    expect(textInput).not.toBeNull();
    expect(textInput!.type).toBe('text');

    const budgetInput = goalSetShell!.querySelector<HTMLInputElement>(
      'input.opencodian-session-settings-codex-goal-budget-input',
    );
    expect(budgetInput).not.toBeNull();
    expect(budgetInput!.getAttribute('min')).toBe('0');

    const setBtn = goalSetShell!.querySelector<HTMLButtonElement>(
      'button.opencodian-session-settings-codex-goal-set-btn',
    );
    expect(setBtn).not.toBeNull();
  });

  it('forwards tokenBudget from budget input when setting goal', async () => {
    const setGoal = jest.fn().mockResolvedValue({ ...SAMPLE_GOAL, tokenBudget: 50000 });
    const modal = new ConversationSessionSettingsModal({} as never, {
      conversationTitle: 'Codex chat',
      defaults: {
        chatFontSizePx: 13,
        codexSandboxMode: 'workspace-write',
        codexModelReasoningEffort: 'medium',
        codexModelOverride: 'codex-mini-latest',
        codexThreadGoal: null,
      },
      showCodexControls: true,
      onSave: jest.fn(),
      onSetThreadGoal: setGoal,
    });

    modal.onOpen();

    const goalSetShell = modal.contentEl.querySelector('.opencodian-session-settings-codex-goal-set');
    const textInput = goalSetShell!.querySelector<HTMLInputElement>(
      'input.opencodian-session-settings-codex-goal-input',
    );
    const budgetInput = goalSetShell!.querySelector<HTMLInputElement>(
      'input.opencodian-session-settings-codex-goal-budget-input',
    );
    const setBtn = goalSetShell!.querySelector<HTMLButtonElement>(
      'button.opencodian-session-settings-codex-goal-set-btn',
    );

    textInput!.value = 'Budgeted task';
    budgetInput!.value = '50000';
    setBtn!.click();
    await Promise.resolve();

    expect(setGoal).toHaveBeenCalledWith('Budgeted task', { tokenBudget: 50000 });
  });
});
