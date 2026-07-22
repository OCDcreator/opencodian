import { Modal, Setting } from 'obsidian';

import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import {
  type CostEstimateBackend,
  renderCostEstimateSettingsRow,
} from '../../../../src/features/settings/CostEstimateSettingsRow';
import { setLocale, t } from '../../../../src/i18n';
import type OpenCodianPlugin from '../../../../src/main';

type ButtonRecord = {
  onClick: () => void;
  text: string;
};

describe('renderCostEstimateSettingsRow', () => {
  const buttonRecords: ButtonRecord[] = [];
  const descriptions: string[] = [];

  beforeEach(() => {
    setLocale('zh');
    buttonRecords.length = 0;
    descriptions.length = 0;
    jest.spyOn(Setting.prototype, 'setName').mockReturnThis();
    jest.spyOn(Setting.prototype, 'setDesc').mockImplementation(function setDesc(_description: string) {
      descriptions.push(_description);
      return this;
    });
    jest.spyOn(Setting.prototype, 'addButton').mockImplementation(function addButton(
      callback: (control: { setButtonText: jest.Mock; onClick: jest.Mock }) => unknown,
    ) {
      const record = { text: '', onClick: jest.fn() as unknown as () => void };
      const control = {
        setButtonText: jest.fn().mockImplementation((text: string) => {
          record.text = text;
          return control;
        }),
        onClick: jest.fn().mockImplementation((handler: () => void) => {
          record.onClick = handler;
          return control;
        }),
      };
      callback(control);
      buttonRecords.push(record);
      return this;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('exposes the shared management entry from OpenCode, Claude Code, and Codex settings with backend-specific disclosure', () => {
    const plugin = {
      app: {},
      settings: DEFAULT_SETTINGS,
      modelPricingService: {
        getStatus: jest.fn().mockReturnValue({ fetchedAt: 1710000000000, entryCount: 42 }),
      },
    } as unknown as OpenCodianPlugin;
    const openSpy = jest.spyOn(Modal.prototype, 'open');
    const containerEl = document.createElement('div');

    const backends: CostEstimateBackend[] = ['opencode', 'claude-code', 'codex'];
    for (const backend of backends) {
      renderCostEstimateSettingsRow(containerEl, plugin, backend);
    }

    expect(buttonRecords.map((record) => record.text)).toEqual([
      t('settings.cost.row.manage'),
      t('settings.cost.row.manage'),
      t('settings.cost.row.manage'),
    ]);
    expect(descriptions).toEqual(expect.arrayContaining([
      expect.stringContaining(t('settings.cost.backend.opencode')),
      expect.stringContaining(t('settings.cost.backend.claudeCode')),
      expect.stringContaining(t('settings.cost.backend.codex')),
      expect.stringContaining(t('settings.cost.identity.claudeCode.provider')),
      expect.stringContaining(t('settings.cost.identity.codex.provider')),
    ]));
    expect(descriptions).toEqual(expect.arrayContaining([
      expect.stringContaining(t('settings.cost.row.catalogReady', { count: '42' })),
    ]));

    for (const record of buttonRecords) {
      record.onClick();
    }
    expect(openSpy).toHaveBeenCalledTimes(3);
  });
});
