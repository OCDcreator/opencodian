import { type DropdownComponent, Setting, type TextComponent } from 'obsidian';

import type { ZCodeBackendSettings } from '../../../../src/core/types/settings';
import { type SettingsZCodeHost, SettingsZCodeSection } from '../../../../src/features/settings/SettingsZCodeSection';

type ChangeHandler = (value: string) => Promise<void>;
type Field = keyof ZCodeBackendSettings;
interface CapturedControl {
  value: string;
  change: ChangeHandler;
}

const initialSettings: ZCodeBackendSettings = {
  executablePath: 'C:/zcode/original.js',
  model: 'provider/original',
  thinkingLevel: 'low',
  mode: 'plan',
};

function createHost(): SettingsZCodeHost {
  return {
    settings: { backendSettings: { zcode: { ...initialSettings } } },
    saveSettings: jest.fn().mockResolvedValue(undefined),
  };
}

function captureControl() {
  const control: CapturedControl = {
    value: '',
    change: async () => { throw new Error('Change handler was not attached'); },
  };
  const component = {
    setPlaceholder: () => component,
    addOption: () => component,
    setValue: (value: string) => { control.value = value; return component; },
    onChange: (handler: (value: string) => void) => {
      control.change = handler as ChangeHandler;
      return component;
    },
  };
  return { control, component };
}

function mount(host: SettingsZCodeHost, layout: 'classic' | 'tabbed'): Record<Field, CapturedControl> {
  const textControls: CapturedControl[] = [];
  let modeControl: CapturedControl | undefined;
  jest.spyOn(Setting.prototype, 'addText').mockImplementation(function (this: Setting, configure) {
    const { control, component } = captureControl();
    textControls.push(control);
    configure(component as unknown as TextComponent);
    return this;
  });
  jest.spyOn(Setting.prototype, 'addDropdown').mockImplementation(function (this: Setting, configure) {
    const { control, component } = captureControl();
    modeControl = control;
    configure(component as unknown as DropdownComponent);
    return this;
  });

  const section = new SettingsZCodeSection(host);
  const container = document.body.createDiv();
  if (layout === 'classic') section.attach(container);
  else section.attachTabbed(container, 'connection');

  expect(textControls).toHaveLength(3);
  expect(modeControl).toBeDefined();
  return {
    executablePath: textControls[0],
    model: textControls[1],
    thinkingLevel: textControls[2],
    mode: modeControl!,
  };
}

describe.each(['classic', 'tabbed'] as const)('ZCode settings changes (%s layout)', (layout) => {
  beforeEach(() => { document.body.innerHTML = ''; });
  afterEach(() => { jest.restoreAllMocks(); });

  it('preserves consecutive model, thinking, mode and executable changes on the same rendered surface', async () => {
    const host = createHost();
    const controls = mount(host, layout);
    expect(Object.fromEntries(Object.entries(controls).map(([key, control]) => [key, control.value])))
      .toEqual(initialSettings);

    await controls.model.change('provider/new');
    await controls.thinkingLevel.change('high');
    expect(host.settings.backendSettings.zcode).toEqual({ ...initialSettings, model: 'provider/new', thinkingLevel: 'high' });
    await controls.mode.change('build');
    await controls.executablePath.change('C:/zcode/new.js');

    expect(host.settings.backendSettings.zcode).toEqual({
      executablePath: 'C:/zcode/new.js', model: 'provider/new', thinkingLevel: 'high', mode: 'build',
    });
    expect(host.saveSettings).toHaveBeenCalledTimes(4);
  });

  it.each<[Field, string]>([
    ['executablePath', 'C:/zcode/new.js'],
    ['model', 'provider/new'],
    ['thinkingLevel', 'high'],
    ['mode', 'edit'],
  ])('merges %s into the latest normalized host state after the settings object is replaced', async (field, value) => {
    const host = createHost();
    const controls = mount(host, layout);
    host.settings = {
      backendSettings: {
        zcode: {
          executablePath: ' C:/zcode/external.js ', model: ' provider/external ', thinkingLevel: ' medium ', mode: ' build ',
        } as ZCodeBackendSettings,
      },
    };

    await controls[field].change(` ${value} `);

    expect(host.settings.backendSettings.zcode).toEqual({
      executablePath: 'C:/zcode/external.js', model: 'provider/external', thinkingLevel: 'medium', mode: 'build',
      [field]: value,
    });
    expect(host.saveSettings).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['input order', [0, 1, 2, 3, 4, 5, 6]],
    ['reverse order', [6, 5, 4, 3, 2, 1, 0]],
  ] as const)('keeps rapid edits and clearing while asynchronous saves complete in %s', async (_label, order) => {
    const host = createHost();
    const snapshots: ZCodeBackendSettings[] = [];
    const finishSaves: Array<() => void> = [];
    host.saveSettings = jest.fn(() => {
      snapshots.push({ ...host.settings.backendSettings.zcode! });
      return new Promise<void>((resolve) => { finishSaves.push(resolve); });
    });
    const controls = mount(host, layout);

    const edits = [
      controls.model.change('provider/n'),
      controls.model.change('provider/new'),
      controls.thinkingLevel.change(' high '),
      controls.model.change(' provider/final '),
      controls.mode.change('build'),
      controls.executablePath.change(' C:/zcode/new.js '),
      controls.model.change('   '),
    ];
    const expected: ZCodeBackendSettings = {
      executablePath: 'C:/zcode/new.js', model: '', thinkingLevel: 'high', mode: 'build',
    };

    // Every callback publishes its normalized state before invoking saveSettings or awaiting it.
    expect(host.saveSettings).toHaveBeenCalledTimes(7);
    expect(snapshots.map((snapshot) => snapshot.model))
      .toEqual(['provider/n', 'provider/new', 'provider/new', 'provider/final', 'provider/final', 'provider/final', '']);
    expect(snapshots.map((snapshot) => snapshot.thinkingLevel))
      .toEqual(['low', 'low', 'high', 'high', 'high', 'high', 'high']);
    expect(snapshots.map((snapshot) => snapshot.mode))
      .toEqual(['plan', 'plan', 'plan', 'plan', 'build', 'build', 'build']);
    expect(snapshots.map((snapshot) => snapshot.executablePath))
      .toEqual(Array(5).fill('C:/zcode/original.js').concat(['C:/zcode/new.js', 'C:/zcode/new.js']));
    expect(host.settings.backendSettings.zcode).toEqual(expected);

    for (const index of order) {
      finishSaves[index]();
      await edits[index];
      expect(host.settings.backendSettings.zcode).toEqual(expected);
    }
  });

  it('uses normalized defaults when the latest ZCode state is absent', async () => {
    const host = createHost();
    const controls = mount(host, layout);
    host.settings.backendSettings.zcode = undefined;

    await controls.model.change(' provider/new ');

    expect(host.settings.backendSettings.zcode).toEqual({
      executablePath: '', model: 'provider/new', thinkingLevel: '', mode: '',
    });
  });
});
