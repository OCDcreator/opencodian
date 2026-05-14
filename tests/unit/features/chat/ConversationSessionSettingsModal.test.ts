import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ConversationSessionSettingsModal,
} from '../../../../src/features/chat/ui/ConversationSessionSettingsModal';
import { setLocale, t } from '../../../../src/i18n';

function attachMockApp(
  modal: ConversationSessionSettingsModal,
  app: unknown,
): ConversationSessionSettingsModal {
  (modal as unknown as { app: unknown }).app = app;
  return modal;
}

describe('ConversationSessionSettingsModal', () => {
  beforeEach(() => {
    setLocale('en');
  });

  it('renders only the display section for session settings', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const modal = new ConversationSessionSettingsModal({} as never, {
      conversationTitle: 'Current chat',
      defaults: {
        chatFontSizePx: 13,
      },
      initialOverrides: {
        chatFontSizePx: 16,
      },
      onSave,
    });

    modal.onOpen();

    expect(modal.contentEl.querySelector('[data-section="compaction"]')).toBeNull();
    expect(modal.contentEl.querySelector('[data-section="display"]')).not.toBeNull();

    const fontInput = modal.contentEl.querySelector<HTMLInputElement>(
      '[data-setting="chat-font-size"]',
    );
    const saveButton = modal.contentEl.querySelector<HTMLButtonElement>(
      '.opencodian-session-settings-save',
    );

    expect(fontInput?.value).toBe('16');

    if (!fontInput || !saveButton) {
      throw new Error('Expected modal controls to render');
    }

    fontInput.value = '';
    saveButton.click();
    await Promise.resolve();

    expect(onSave).toHaveBeenCalledWith(undefined);
  });

  it('shows current conversation title and inherit summary in the hero section', () => {
    const modal = new ConversationSessionSettingsModal({} as never, {
      conversationTitle: 'Research thread',
      defaults: {
        chatFontSizePx: 15,
      },
      onSave: jest.fn(),
    });

    modal.onOpen();

    expect(
      modal.contentEl.querySelector('.opencodian-session-settings-subtitle')?.textContent,
    ).toBe('Research thread');
    expect(
      modal.contentEl.querySelector('.opencodian-session-settings-hero-note')?.textContent,
    ).toContain('inherit');
  });

  it('explains the inherited smart title mode in user-facing language', () => {
    const modal = attachMockApp(new ConversationSessionSettingsModal({} as never, {
      conversationTitle: 'Research thread',
      defaults: {
        chatFontSizePx: 15,
      },
      onSave: jest.fn(),
    }), {
      plugins: {
        plugins: {
          opencodian: {
            settings: {
              titleMode: 'ai',
              questionDisplayMode: 'all',
              questionCardPosition: 'inline',
              showAnsweredQuestionCards: true,
              renderUserMarkupAsCodeBlocks: true,
            },
          },
        },
      },
    });

    modal.onOpen();

    const titleRowEl = modal.contentEl.querySelector<HTMLElement>('[data-summary="title"]');
    expect(titleRowEl?.querySelector('.opencodian-session-settings-summary-chip')?.textContent).toBe(
      t('settings.titleGeneration.mode.ai'),
    );
    expect(titleRowEl?.querySelector('.opencodian-session-settings-summary-description')?.textContent).toBe(
      t('chat.sessionSettings.modal.summary.titleGeneration.smartDesc'),
    );
  });

  it('opens the global title settings on the conversation title tab in tabbed mode', () => {
    const open = jest.fn();
    const openTabById = jest.fn();
    const saveSettings = jest.fn();
    const prepareScrollToConversationOnNextOpen = jest.fn();
    const plugin = {
      settings: {
        titleMode: 'ai',
        questionDisplayMode: 'all',
        questionCardPosition: 'inline',
        showAnsweredQuestionCards: true,
        renderUserMarkupAsCodeBlocks: true,
        settingsLayoutMode: 'tabbed',
        settingsTabbedPrimaryTab: 'general',
        settingsTabbedSecondaryTabByPrimary: { general: 'basic' },
      },
      saveSettings,
      settingsTab: {
        prepareScrollToConversationOnNextOpen,
      },
    };
    const modal = attachMockApp(new ConversationSessionSettingsModal({} as never, {
      conversationTitle: 'Research thread',
      defaults: {
        chatFontSizePx: 15,
      },
      onSave: jest.fn(),
    }), {
      plugins: {
        plugins: {
          opencodian: plugin,
        },
      },
      setting: {
        open,
        openTabById,
      },
    });

    modal.onOpen();
    modal.contentEl
      .querySelector<HTMLButtonElement>('[data-summary="title"] .opencodian-session-settings-summary-link')
      ?.click();

    expect(prepareScrollToConversationOnNextOpen).toHaveBeenCalledWith('title');
    expect(plugin.settings.settingsTabbedPrimaryTab).toBe('conversation');
    expect(plugin.settings.settingsTabbedSecondaryTabByPrimary).toEqual({
      general: 'basic',
      conversation: 'title',
    });
    expect(saveSettings).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledTimes(1);
    expect(openTabById).toHaveBeenCalledWith('opencodian');
  });

  it('maps each inherited global row to the matching conversation settings tab', () => {
    const plugin = {
      settings: {
        titleMode: 'default',
        questionDisplayMode: 'all',
        questionCardPosition: 'inline',
        showAnsweredQuestionCards: true,
        renderUserMarkupAsCodeBlocks: true,
        settingsLayoutMode: 'tabbed',
        settingsTabbedPrimaryTab: 'general',
        settingsTabbedSecondaryTabByPrimary: {},
      },
      saveSettings: jest.fn(),
    };
    const modal = attachMockApp(new ConversationSessionSettingsModal({} as never, {
      conversationTitle: 'Research thread',
      defaults: {
        chatFontSizePx: 15,
      },
      onSave: jest.fn(),
    }), {
      plugins: {
        plugins: {
          opencodian: plugin,
        },
      },
      setting: {
        open: jest.fn(),
        openTabById: jest.fn(),
      },
    });

    modal.onOpen();

    for (const [summaryId, expectedSecondaryTab] of Object.entries({
      title: 'title',
      compaction: 'compaction',
      questions: 'questions',
      rendering: 'rendering',
    })) {
      modal.contentEl
        .querySelector<HTMLButtonElement>(`[data-summary="${summaryId}"] .opencodian-session-settings-summary-link`)
        ?.click();
      expect(plugin.settings.settingsTabbedPrimaryTab).toBe('conversation');
      expect(plugin.settings.settingsTabbedSecondaryTabByPrimary.conversation).toBe(expectedSecondaryTab);
    }
  });
});

describe('ConversationSessionSettingsModal classic settings deep links', () => {
  it('can deep-link a classic settings subsection after the settings page opens', () => {
    const modal = new ConversationSessionSettingsModal({} as never, {
      conversationTitle: 'Research thread',
      defaults: {
        chatFontSizePx: 15,
      },
      onSave: jest.fn(),
    });
    const scrollContainer = document.createElement('div');
    const settingsRootEl = scrollContainer.createDiv({ cls: 'opencodian-settings--classic' });
    settingsRootEl.createDiv({ cls: 'opencodian-settings-quick-nav' });
    const targetBlockEl = settingsRootEl.createDiv({
      attr: { 'data-settings-target': 'conversation-title' },
    });
    const headingEl = targetBlockEl.createEl('h4', {
      cls: 'opencodian-settings-subsection-heading',
      text: 'Localized title can change',
    });
    const plugin = {
      settings: {
        settingsPanelScrollTop: 0,
      },
      scheduleSettingsUiStateSave: jest.fn(),
    };

    scrollContainer.className = 'vertical-tab-content';
    scrollContainer.scrollTop = 300;
    Object.defineProperty(scrollContainer, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 100, bottom: 700, left: 0, right: 800, width: 800, height: 600, x: 0, y: 100, toJSON: () => '' }),
    });
    Object.defineProperty(headingEl, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 560, bottom: 596, left: 0, right: 800, width: 800, height: 36, x: 0, y: 560, toJSON: () => '' }),
    });
    document.body.appendChild(scrollContainer);

    (modal as unknown as {
      scrollClassicSettingsHeadingIntoView(targetId: string, plugin: typeof plugin): void;
    }).scrollClassicSettingsHeadingIntoView('title', plugin);

    expect(scrollContainer.scrollTop).toBe(760);
    expect(plugin.settings.settingsPanelScrollTop).toBe(760);
    expect(plugin.scheduleSettingsUiStateSave).toHaveBeenCalledTimes(1);
  });
});

describe('ConversationSessionSettingsModal CSS contract', () => {
  it('keeps segmented choice buttons content-sized instead of equally splitting the row', () => {
    const css = readFileSync(
      join(process.cwd(), 'src/style/modals/config-editor-modal.css'),
      'utf8',
    );

    expect(css).toMatch(
      /\.opencodian-session-settings-field\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+max-content;/s,
    );
    expect(css).toMatch(
      /\.opencodian-session-settings-choice-button\s*\{[^}]*flex:\s*0\s+1\s+auto;/s,
    );
    expect(css).toMatch(
      /\.opencodian-session-settings-choice-button\[data-value="inherit"\]\s*\{[^}]*min-width:\s*max-content;/s,
    );
  });

  it('uses a neutral hero surface without the right-side accent glow', () => {
    const css = readFileSync(
      join(process.cwd(), 'src/style/modals/config-editor-modal.css'),
      'utf8',
    );

    const heroRuleMatch = css.match(
      /\.opencodian-session-settings-hero\s*\{([\s\S]*?)\n\}/,
    );

    expect(heroRuleMatch?.[1]).toBeDefined();
    expect(heroRuleMatch?.[1]).not.toContain('radial-gradient');
  });
});
