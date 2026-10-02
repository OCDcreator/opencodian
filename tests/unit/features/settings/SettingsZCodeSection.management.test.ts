import { Setting, type ToggleComponent } from 'obsidian';

import type { ZCodeManagementCatalog } from '../../../../src/core/agents/backend/zcode';
import { type SettingsZCodeHost, SettingsZCodeSection } from '../../../../src/features/settings/SettingsZCodeSection';

const catalog: ZCodeManagementCatalog = {
  configuration: { state: 'available', targetPath: '/vault/.zcode/config.json', revision: { canonicalPath: '/vault/.zcode/config.json', mtimeMs: 1, size: 2, sha256: 'abc' }, pluginOverrideCount: 0, mcpDeclarationCount: 0, hookDeclarationCount: 2 },
  plugins: { state: 'available', entries: [{ id: 'fixture@local', enabled: true, enabledSource: 'user', packageMissing: false, mcpCount: 0, hookCount: 0 }] },
  mcp: { state: 'available', entries: [{ id: 'local', status: 'connected', toolCount: 0, authentication: 'unknown' }] },
  hooks: { state: 'unavailable', effective: null },
  mutation: { plugins: 'available', mcp: 'unavailable', hooks: 'unavailable' },
};

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => { document.body.innerHTML = ''; });
afterEach(() => { jest.restoreAllMocks(); });

it.each(['classic', 'tabbed'])('opens management at the real %s ZCode settings path, saves and reopens the effective catalog', async (layout) => {
  const read = jest.fn().mockResolvedValueOnce(catalog).mockResolvedValue({ ...catalog, plugins: { state: 'available', entries: [{ ...catalog.plugins.entries![0], enabled: false, enabledSource: 'workspace' }] } });
  const mutation = jest.fn().mockResolvedValue({ status: 'success', evidence: { persistence: 'verified', application: 'pending', runtime: 'verified' } });
  const host: SettingsZCodeHost = {
    settings: { backendSettings: {} }, saveSettings: jest.fn(), invalidateSlashCommandCatalog: jest.fn(),
    agentServiceRegistry: { get: () => ({ start: jest.fn(), stop: jest.fn(), getManagementCatalog: read, setManagedPluginEnabled: mutation }) },
  };
  const toggles: Array<{ value: boolean; disabled: boolean; change?: (value: boolean) => Promise<void> }> = [];
  jest.spyOn(Setting.prototype, 'addToggle').mockImplementation(function (this: Setting, configure) {
    const state = { value: false, disabled: false, change: undefined as ((value: boolean) => Promise<void>) | undefined };
    const component = {
      setValue: (value: boolean) => { state.value = value; return component; },
      setDisabled: (value: boolean) => { state.disabled = value; return component; },
      onChange: (change: (value: boolean) => Promise<void>) => { state.change = change; return component; },
    };
    toggles.push(state);
    configure(component as unknown as ToggleComponent);
    return this;
  });
  const container = document.body.createDiv();
  const section = new SettingsZCodeSection(host);
  if (layout === 'classic') section.attach(container);
  else section.attachTabbed(container, 'connection');
  await flush();
  expect(container.querySelector('[data-settings-target="zcode-management"]')).not.toBeNull();
  expect(toggles[0]).toMatchObject({ value: true, disabled: false });
  await toggles[0].change!(false);
  expect(mutation).toHaveBeenCalledWith('fixture@local', false, catalog.configuration.revision);
  expect(toggles[1].value).toBe(false);
  expect(container.querySelector('[data-zcode-management="outcome"]')?.textContent).toContain('application: pending');
  expect(host.invalidateSlashCommandCatalog).toHaveBeenCalledTimes(1);
  expect(host.saveSettings).not.toHaveBeenCalled();
  // Reopen uses a fresh native query rather than a retained optimistic toggle.
  section.attach(document.body.createDiv());
  await flush();
  expect(read).toHaveBeenCalledTimes(3);
  expect(toggles[2].value).toBe(false);
});

it('shows unavailable runtime and never renders an optimistic mutation control', async () => {
  const read = jest.fn().mockResolvedValue({ ...catalog, plugins: { state: 'unavailable', entries: null }, mcp: { state: 'unavailable', entries: null } });
  const host: SettingsZCodeHost = { settings: { backendSettings: {} }, saveSettings: jest.fn(), agentServiceRegistry: { get: () => ({ start: jest.fn(), stop: jest.fn(), getManagementCatalog: read }) } };
  const toggle = jest.spyOn(Setting.prototype, 'addToggle');
  const container = document.body.createDiv();
  new SettingsZCodeSection(host).attach(container);
  await flush();
  expect(toggle).not.toHaveBeenCalled();
  expect(container.textContent?.toLowerCase()).toContain('unavailable');
  expect(container.textContent).toContain('Declaration counts do not prove execution.');
});

it('disables plugin changes when native mutation or secure source is unavailable', async () => {
  const read = jest.fn().mockResolvedValue({ ...catalog, configuration: { ...catalog.configuration, state: 'failed' }, mutation: { ...catalog.mutation, plugins: 'unavailable' } });
  const host: SettingsZCodeHost = { settings: { backendSettings: {} }, saveSettings: jest.fn(), agentServiceRegistry: { get: () => ({ start: jest.fn(), stop: jest.fn(), getManagementCatalog: read }) } };
  const disabled = jest.fn();
  jest.spyOn(Setting.prototype, 'addToggle').mockImplementation(function (this: Setting, configure) {
    const component = { setValue: () => component, setDisabled: (value: boolean) => { disabled(value); return component; }, onChange: () => component };
    configure(component as unknown as ToggleComponent);
    return this;
  });
  new SettingsZCodeSection(host).attach(document.body.createDiv());
  await flush();
  expect(disabled).toHaveBeenCalledWith(true);
});
