import type { App } from 'obsidian';
import { Setting } from 'obsidian';

import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { ConversationCompactionHelpModal } from '../../../../src/features/settings/ConversationCompactionHelpModal';
import { OpenCodeProjectConfigHelpModal } from '../../../../src/features/settings/OpenCodeProjectConfigHelpModal';
import { SettingsConversationSection } from '../../../../src/features/settings/SettingsConversationSection';
import { setLocale, t } from '../../../../src/i18n';
import type OpenCodianPlugin from '../../../../src/main';

interface MockExtraButtonControl {
  extraSettingsEl: HTMLElement;
  onClick: jest.MockedFunction<(callback: () => void | Promise<void>) => MockExtraButtonControl>;
  setIcon: jest.MockedFunction<(icon: string) => MockExtraButtonControl>;
  setTooltip: jest.MockedFunction<(tooltip: string) => MockExtraButtonControl>;
}

interface ExtraButtonRecord {
  name: string;
  control: MockExtraButtonControl;
  onClick?: () => void | Promise<void>;
}

type ConversationSectionPlugin = Pick<
  OpenCodianPlugin,
  | 'settings'
  | 'saveSettings'
  | 'refreshConversationRendering'
  | 'refreshQuestionUi'
  | 'reapplyConversationSessionDefaults'
  | 'opencodeConfigManager'
  | 'openCodeService'
>;

const extraButtonRecords: ExtraButtonRecord[] = [];

function createExtraButtonRecord(name: string): ExtraButtonRecord {
  const control: MockExtraButtonControl = {
    extraSettingsEl: document.createElement('span'),
    onClick: jest.fn(),
    setIcon: jest.fn(),
    setTooltip: jest.fn(),
  };
  const record: ExtraButtonRecord = {
    name,
    control,
  };
  control.onClick.mockImplementation((callback) => {
    record.onClick = callback;
    return control;
  });
  control.setIcon.mockReturnValue(control);
  control.setTooltip.mockReturnValue(control);
  return record;
}

function createPlugin(overrides?: Partial<ConversationSectionPlugin['settings']>): ConversationSectionPlugin {
  return {
    settings: {
      ...DEFAULT_SETTINGS,
      ...overrides,
    },
    saveSettings: jest.fn().mockResolvedValue(undefined),
    refreshConversationRendering: jest.fn(),
    refreshQuestionUi: jest.fn(),
    reapplyConversationSessionDefaults: jest.fn().mockResolvedValue(undefined),
    opencodeConfigManager: {
      getCompactionConfig: jest.fn().mockResolvedValue(undefined),
      getConfigPath: jest.fn().mockReturnValue('/test/.opencode/opencode.json'),
      updateCompactionConfig: jest.fn().mockResolvedValue(undefined),
    } as never,
    openCodeService: {
      reapplyCompactionConfigFromProjectConfig: jest.fn().mockResolvedValue({ status: 'applied' }),
      requireSdkCapability: jest.fn().mockReturnValue({ kind: 'available' }),
      refreshSdkCapabilities: jest.fn().mockResolvedValue({ entries: [], generatedAt: 0 }),
    } as never,
  } as unknown as ConversationSectionPlugin;
}

function createSectionHeading(containerEl: HTMLElement, title: string): HTMLHeadingElement {
  const headingEl = document.createElement('h2');
  headingEl.textContent = title;
  containerEl.appendChild(headingEl);
  return headingEl;
}

function createSettingsBlock(containerEl: HTMLElement): HTMLElement {
  const bodyEl = document.createElement('div');
  containerEl.appendChild(bodyEl);
  return bodyEl;
}

function createSection(plugin = createPlugin(), app = {} as App) {
  const section = new SettingsConversationSection({
    app,
    plugin: plugin as unknown as OpenCodianPlugin,
    createSectionHeading,
    createSettingsBlock: (containerEl) => createSettingsBlock(containerEl),
    addSettingHelpButton: (setting, helpButton) => {
      setting.addExtraButton((button) => {
        button
          .setIcon('help-circle')
          .setTooltip(helpButton.tooltip)
          .onClick(helpButton.onClick);
      });
    },
    setRefreshTitleModelsCallback: jest.fn(),
  });
  section.attach(document.createElement('div'));
  return section;
}

describe('SettingsConversationSection compaction help', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
    extraButtonRecords.length = 0;

    jest.spyOn(Setting.prototype, 'setName').mockImplementation(function setName(this: Setting, name: string) {
      (this as Setting & { __settingName?: string }).__settingName = name;
      return this;
    });
    jest.spyOn(Setting.prototype, 'setDesc').mockImplementation(function setDesc(this: Setting) {
      return this;
    });
    jest.spyOn(Setting.prototype, 'addToggle').mockImplementation(function addToggle(this: Setting) {
      return this;
    });
    jest.spyOn(Setting.prototype, 'addText').mockImplementation(function addText(this: Setting) {
      return this;
    });
    jest.spyOn(Setting.prototype, 'addButton').mockImplementation(function addButton(this: Setting) {
      return this;
    });
    jest.spyOn(Setting.prototype, 'addExtraButton').mockImplementation(function addExtraButton(
      this: Setting,
      callback: (control: MockExtraButtonControl) => unknown,
    ) {
      const name = (this as Setting & { __settingName?: string }).__settingName ?? '';
      const record = createExtraButtonRecord(name);
      extraButtonRecords.push(record);
      callback(record.control);
      return this;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('adds help buttons for each project compaction setting', () => {
    createSection();

    const helpSettingNames = extraButtonRecords.map((record) => record.name);

    expect(helpSettingNames).toEqual(expect.arrayContaining([
      t('settings.conversation.compaction.auto.name'),
      t('settings.conversation.compaction.prune.name'),
      t('settings.conversation.compaction.tailTurns.name'),
      t('settings.conversation.compaction.preserveRecentTokens.name'),
      t('settings.conversation.compaction.reserved.name'),
    ]));
  });

  it('opens the compaction help modal from the reserved token help button', () => {
    const openSpy = jest.spyOn(ConversationCompactionHelpModal.prototype, 'open').mockImplementation(() => {});
    createSection();

    const reservedHelpButton = extraButtonRecords.find((record) => record.name === t('settings.conversation.compaction.reserved.name'));

    reservedHelpButton?.onClick?.();

    expect(openSpy).toHaveBeenCalledTimes(1);
  });

  it('opens the sharing help modal from the share mode help button', () => {
    const openSpy = jest.spyOn(OpenCodeProjectConfigHelpModal.prototype, 'open').mockImplementation(() => {});
    createSection();

    const shareHelpButton = extraButtonRecords.find((record) => record.name === t('settings.conversation.share.mode.name'));

    shareHelpButton?.onClick?.();

    expect(openSpy).toHaveBeenCalledTimes(1);
  });
});
