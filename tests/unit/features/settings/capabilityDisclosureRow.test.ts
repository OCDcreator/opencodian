/* eslint-disable max-lines-per-function -- Disclosure row coverage exercises every availability kind plus re-check together. */
import { Setting } from 'obsidian';

import type {
  OpenCodeSdkCapabilityAvailability,
  OpenCodeUnsupportedCapabilityResult,
} from '../../../../src/core/opencode/OpenCodeSdkCapabilityDiscoveryCoordinator';
import { renderCapabilityDisclosureRows } from '../../../../src/features/settings/capabilityDisclosureRow';
import { setLocale, t } from '../../../../src/i18n';
import type OpenCodianPlugin from '../../../../src/main';

interface MockButtonControl {
  buttonEl: HTMLButtonElement;
  onClick: jest.MockedFunction<(callback: () => void | Promise<void>) => MockButtonControl>;
  setButtonText: jest.MockedFunction<(value: string) => MockButtonControl>;
  setDisabled: jest.MockedFunction<(value: boolean) => MockButtonControl>;
  setTooltip: jest.MockedFunction<(value: string) => MockButtonControl>;
}

interface ButtonRecord {
  control: MockButtonControl;
  settingName: string;
  settingClasses: string[];
}

interface SettingState {
  name: string;
  desc: string;
  classes: string[];
  buttons: ButtonRecord[];
  settingEl: HTMLElement;
}

type RequireResult = OpenCodeSdkCapabilityAvailability | OpenCodeUnsupportedCapabilityResult;

type OpenCodeServiceLike = Pick<OpenCodianPlugin['openCodeService'], 'requireSdkCapability' | 'refreshSdkCapabilities'>;

const settingStates: SettingState[] = [];

function attachState(setting: Setting): SettingState {
  const state: SettingState = {
    name: '',
    desc: '',
    classes: [],
    buttons: [],
    settingEl: setting.settingEl,
  };
  (setting as Setting & { __state?: SettingState }).__state = state;
  settingStates.push(state);
  return state;
}

function stateOf(setting: Setting): SettingState {
  return (setting as Setting & { __state?: SettingState }).__state ?? attachState(setting);
}

function createButtonControl(): MockButtonControl {
  const control: MockButtonControl = {
    buttonEl: document.createElement('button'),
    onClick: jest.fn(),
    setButtonText: jest.fn(),
    setDisabled: jest.fn(),
    setTooltip: jest.fn(),
  };
  control.onClick.mockImplementation((callback) => {
    (control.buttonEl as unknown as { __onClick?: () => void | Promise<void> }).__onClick = callback;
    return control;
  });
  control.setButtonText.mockReturnValue(control);
  control.setDisabled.mockReturnValue(control);
  control.setTooltip.mockReturnValue(control);
  return control;
}

function createPlugin(
  requireImpl: (id: string) => RequireResult,
  refreshImpl: () => Promise<unknown>,
): { plugin: { openCodeService: OpenCodeServiceLike }; openCodeService: OpenCodeServiceLike } {
  const openCodeService: OpenCodeServiceLike = {
    requireSdkCapability: jest.fn(requireImpl) as unknown as OpenCodeServiceLike['requireSdkCapability'],
    refreshSdkCapabilities: jest.fn(refreshImpl) as unknown as OpenCodeServiceLike['refreshSdkCapabilities'],
  };
  return { plugin: { openCodeService }, openCodeService };
}

function findSettingByName(name: string): SettingState | undefined {
  return settingStates.find((state) => state.name === name);
}

function invokeRecheck(): void {
  // The footer Setting has an empty name and is the last row rendered.
  const footerStates = settingStates.filter((state) => state.name === '');
  const footer = footerStates[footerStates.length - 1];
  expect(footer).toBeDefined();
  const recheckButton = footer!.buttons[0];
  expect(recheckButton).toBeDefined();
  const handler = (recheckButton!.control.buttonEl as unknown as { __onClick?: () => void | Promise<void> }).__onClick;
  expect(handler).toBeDefined();
  void handler!();
}

describe('renderCapabilityDisclosureRows', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
    settingStates.length = 0;

    jest.spyOn(Setting.prototype, 'setName').mockImplementation(function setName(this: Setting, name: string) {
      stateOf(this).name = name;
      return this;
    });
    jest.spyOn(Setting.prototype, 'setDesc').mockImplementation(function setDesc(this: Setting, desc: string | DocumentFragment) {
      if (typeof desc === 'string') {
        stateOf(this).desc = desc;
      }
      return this;
    });
    jest.spyOn(Setting.prototype, 'setClass').mockImplementation(function setClass(this: Setting, cls: string) {
      stateOf(this).classes.push(cls);
      return this;
    });
    jest.spyOn(Setting.prototype, 'addButton').mockImplementation(function addButton(
      this: Setting,
      callback: (control: MockButtonControl) => unknown,
    ) {
      const control = createButtonControl();
      callback(control);
      const state = stateOf(this);
      state.buttons.push({
        control,
        settingName: state.name,
        settingClasses: [...state.classes],
      });
      return this;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders a row per availability kind with status label and reason', () => {
    const requireImpl = (id: string): RequireResult => {
      switch (id) {
        case 'cap.available':
          return { kind: 'available' };
        case 'cap.server':
          return {
            supported: false,
            capabilityId: id,
            kind: 'unsupported-by-server',
            reason: 'The connected OpenCode server does not expose this endpoint.',
            minimumServerHint: 'OpenCode server 1.17+',
          };
        case 'cap.gate':
          return {
            supported: false,
            capabilityId: id,
            kind: 'disabled-by-user',
            reason: 'Capability is disabled by the user opt-in gate.',
          };
        case 'cap.unknown':
          return {
            kind: 'unknown',
            reason: 'Capability support could not be confirmed (transient transport failure).',
          };
        default:
          throw new Error(`unexpected id ${id}`);
      }
    };
    const { plugin } = createPlugin(requireImpl, () => Promise.resolve({ entries: [], generatedAt: 0 }));

    const containerEl = document.createElement('div');
    renderCapabilityDisclosureRows(
      containerEl,
      plugin as unknown as OpenCodianPlugin,
      ['cap.available', 'cap.server', 'cap.gate', 'cap.unknown'],
      { headingKey: 'settings.server.capabilityStatus' },
    );

    // Four capability rows + one footer row (empty name) with the Re-check button.
    expect(settingStates).toHaveLength(5);

    const availableRow = findSettingByName('cap.available')!;
    expect(availableRow.desc).toContain(t('capabilities.status.available'));
    expect(availableRow.classes).toContain('opencodian-capability-row--available');
    expect(availableRow.buttons[0]!.control.setDisabled).toHaveBeenLastCalledWith(true);
    expect(availableRow.buttons[0]!.control.buttonEl.getAttribute('data-capability-tone')).toBe('available');

    const serverRow = findSettingByName('cap.server')!;
    expect(serverRow.desc).toContain(t('capabilities.status.unsupportedByServer'));
    // Reason text rendered (never raw server errors).
    expect(serverRow.desc).toContain('does not expose this endpoint');
    expect(serverRow.desc).toContain('OpenCode server 1.17+');
    expect(serverRow.classes).toContain('opencodian-capability-row--disabled');
    expect(serverRow.buttons[0]!.control.buttonEl.getAttribute('data-capability-tone')).toBe('disabled');

    const gateRow = findSettingByName('cap.gate')!;
    expect(gateRow.desc).toContain(t('capabilities.status.disabledByUser'));
    expect(gateRow.classes).toContain('opencodian-capability-row--disabled');

    const unknownRow = findSettingByName('cap.unknown')!;
    expect(unknownRow.desc).toContain(t('capabilities.status.unknown'));
    expect(unknownRow.classes).toContain('opencodian-capability-row--unknown');
  });

  it('keeps unsupported rows visible and disables their action badges', () => {
    const requireImpl = (id: string): RequireResult => {
      if (id === 'cap.server') {
        return {
          supported: false,
          capabilityId: id,
          kind: 'unsupported-by-server',
          reason: 'missing endpoint',
        };
      }
      return { kind: 'available' };
    };
    const { plugin } = createPlugin(requireImpl, () => Promise.resolve({ entries: [], generatedAt: 0 }));

    const containerEl = document.createElement('div');
    renderCapabilityDisclosureRows(containerEl, plugin as unknown as OpenCodianPlugin, ['cap.server']);

    // Unsupported row is still rendered (never hidden).
    expect(findSettingByName('cap.server')).toBeDefined();
    const serverRow = findSettingByName('cap.server')!;
    // Badge button is disabled.
    expect(serverRow.buttons[0]!.control.setDisabled).toHaveBeenLastCalledWith(true);
    expect(serverRow.buttons[0]!.control.buttonEl.getAttribute('disabled')).toBe('true');
    // Reason text is rendered.
    expect(serverRow.desc).toContain('missing endpoint');
  });

  it('calls refreshSdkCapabilities when Re-check is clicked and re-renders', async () => {
    const requireImpl = (_id: string): RequireResult => ({ kind: 'available' });
    const refreshImpl = jest.fn(async () => ({ entries: [], generatedAt: 1 }));
    const { plugin, openCodeService } = createPlugin(requireImpl, refreshImpl);

    const containerEl = document.createElement('div');
    renderCapabilityDisclosureRows(containerEl, plugin as unknown as OpenCodianPlugin, ['cap.available']);

    const initialRecordCount = settingStates.length;
    invokeRecheck();
    await Promise.resolve();
    await Promise.resolve();

    expect(openCodeService.refreshSdkCapabilities).toHaveBeenCalledTimes(1);
    // Re-render produced a fresh set of rows (idempotent replace clears the
    // container and rebuilds).
    expect(settingStates.length).toBe(initialRecordCount + initialRecordCount);
  });

  it('uses locale labels when provided and falls back to the capability id', () => {
    const requireImpl = (_id: string): RequireResult => ({ kind: 'available' });
    const { plugin } = createPlugin(requireImpl, () => Promise.resolve({ entries: [], generatedAt: 0 }));

    const containerEl = document.createElement('div');
    renderCapabilityDisclosureRows(
      containerEl,
      plugin as unknown as OpenCodianPlugin,
      ['cap.labeled', 'cap.unlabeled'],
      { labels: { 'cap.labeled': 'settings.server.capabilityStatus' } },
    );

    expect(findSettingByName(t('settings.server.capabilityStatus'))).toBeDefined();
    expect(findSettingByName('cap.unlabeled')).toBeDefined();
  });
});
