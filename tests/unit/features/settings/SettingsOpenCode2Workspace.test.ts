import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { SettingsOpenCode2Section } from '../../../../src/features/settings/backends/opencode/SettingsBackendSection';
import { getPrimaryTabDefinition, resolveSecondaryTabId } from '../../../../src/features/settings/settingsLayoutRegistry';
import { setLocale } from '../../../../src/i18n';

function createHost(content = '') {
  const settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as typeof DEFAULT_SETTINGS;
  settings.backendSettings.opencode2.configContent = content;
  const adapter = {
    readConfigurationSummary: jest.fn().mockResolvedValue({ version: '2.0.18', providers: 1, models: 2, agents: 1, skills: 1, commands: 0, mcp: 1 }),
    readManagementCatalog: jest.fn().mockResolvedValue({
      integrations: [], mcp: [{ name: 'docs', status: { status: 'connected' } }],
      agents: [{ id: 'build', name: 'Build' }], skills: [{ id: 'review' }], commands: [], plugins: [],
    }),
    getModelSelectorProviders: jest.fn().mockResolvedValue([{ id: 'openai', name: 'OpenAI', models: [{ id: 'model-a', name: 'Model A' }, { id: 'model-b', name: 'Model B' }] }]),
    validateConfigContent: jest.fn(async (value: string) => { settings.backendSettings.opencode2.configContent = value; }),
    setMcpConnection: jest.fn().mockResolvedValue(undefined),
  };
  const host = { settings, agentServiceRegistry: { get: jest.fn(() => adapter) }, saveSettings: jest.fn().mockResolvedValue(undefined) };
  return { host, adapter };
}

function mount(host: ReturnType<typeof createHost>['host'], tab: string) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  new SettingsOpenCode2Section({ plugin: host, requestDisplayRefresh: jest.fn(), renderTitleSettings: jest.fn() }).attachTabbed(container, tab);
  return container;
}

async function settle() { for (let i = 0; i < 12; i++) await Promise.resolve(); }

function edit(container: HTMLElement, selector: string, value: string) {
  const input = container.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(selector)!;
  expect(input).not.toBeNull();
  input.value = value;
  input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
}

describe('OpenCode 2 functional settings workspace', () => {
  beforeEach(() => { document.body.innerHTML = ''; setLocale('en'); });

  it('defines all eight pages, embedded branding, and migration of old authentication links', () => {
    const tab = getPrimaryTabDefinition('opencode2')!;
    expect(tab.icon).toBe('opencodian-opencode2');
    expect(tab.secondaryTabs.map(({ id }) => id)).toEqual(['connection', 'model', 'agents', 'permissions', 'mcp', 'resources', 'context', 'advanced']);
    expect(resolveSecondaryTabId('opencode2', 'auth')).toBe('model');
    expect(resolveSecondaryTabId('opencode2', 'integrations')).toBe('model');
  });

  it('automatically reads and shares the native catalog across page instances', async () => {
    const { host, adapter } = createHost();
    const mcp = mount(host, 'mcp');
    await settle();
    expect(adapter.readManagementCatalog).toHaveBeenCalledTimes(1);
    expect(mcp.querySelector('[data-catalog-state="complete"]')).not.toBeNull();
    const model = mount(host, 'model');
    await settle();
    expect(adapter.readManagementCatalog).toHaveBeenCalledTimes(1);
    expect(model.querySelector('option[value="openai/model-a"]')).not.toBeNull();
  });

  it('coalesces concurrent initial reads rather than issuing one read per page', async () => {
    const { host, adapter } = createHost();
    let finish!: (value: unknown) => void;
    adapter.readManagementCatalog.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const first = mount(host, 'model');
    const second = mount(host, 'context');
    expect(adapter.readManagementCatalog).toHaveBeenCalledTimes(1);
    finish({ integrations: [], mcp: [], agents: [], skills: [], commands: [], plugins: [] });
    await settle();
    expect(first.querySelector('[data-catalog-state="complete"]')).not.toBeNull();
    expect(second.querySelector('[data-catalog-state="complete"]')).not.toBeNull();
  });

  it('keeps one JSONC draft across tabs, preserves unknown fields/comments, and applies before saving', async () => {
    const { host, adapter } = createHost('{\n // keep this comment\n "customSetting": {"untouched":true},\n "model":"openai/model-a",\n}');
    const models = mount(host, 'model');
    await settle();
    edit(models, '[data-config-path="model"] select', 'openai/model-b');
    expect(host.saveSettings).not.toHaveBeenCalled();
    models.remove();
    const context = mount(host, 'context');
    edit(context, '[data-config-path="compaction.auto"] select', 'false');
    context.querySelector<HTMLButtonElement>('[data-action="apply"]')!.click();
    await settle();
    const applied = adapter.validateConfigContent.mock.calls[0][0];
    expect(applied).toContain('// keep this comment');
    expect(applied).toMatch(/"untouched":\s*true/);
    expect(applied).toContain('openai/model-b');
    expect(applied).toContain('"auto": false');
    expect(host.saveSettings).toHaveBeenCalledTimes(1);
    expect(adapter.validateConfigContent.mock.invocationCallOrder[0]).toBeLessThan(host.saveSettings.mock.invocationCallOrder[0]);
  });

  it('retains malformed per-field drafts across tabs and blocks apply until corrected', async () => {
    const { host, adapter } = createHost();
    const permissions = mount(host, 'permissions');
    await settle();
    edit(permissions, '[data-config-path="permissions"] textarea', '[invalid');
    expect(permissions.querySelector<HTMLButtonElement>('[data-action="apply"]')!.disabled).toBe(true);
    permissions.remove();
    const restored = mount(host, 'permissions');
    expect(restored.querySelector<HTMLTextAreaElement>('[data-config-path="permissions"] textarea')!.value).toBe('[invalid');
    edit(restored, '[data-config-path="permissions"] textarea', '[{"action":"shell","resource":"*","effect":"ask"}]');
    expect(restored.querySelector<HTMLButtonElement>('[data-action="apply"]')!.disabled).toBe(false);
    expect(adapter.validateConfigContent).not.toHaveBeenCalled();
  });

  it('adopts the confirmed normalized overlay after applying a raw JSONC draft', async () => {
    const { host, adapter } = createHost();
    adapter.validateConfigContent.mockImplementationOnce(async (value: string) => {
      host.settings.backendSettings.opencode2.configContent = value.trim();
    });
    const advanced = mount(host, 'advanced');
    await settle();
    edit(advanced, '.opencodian-opencode2-raw', '\n {"compaction":{"auto":false}} \n');
    advanced.querySelector<HTMLButtonElement>('[data-action="apply"]')!.click();
    await settle();
    expect(advanced.querySelector<HTMLTextAreaElement>('.opencodian-opencode2-raw')!.value)
      .toBe(host.settings.backendSettings.opencode2.configContent);
    expect(advanced.textContent).not.toContain('configuration changed elsewhere');
    expect(advanced.querySelector<HTMLButtonElement>('[data-action="apply"]')!.disabled).toBe(true);
  });

  it('keeps remote definitions read-only and never saves a local overlay to a remote service', async () => {
    const { host, adapter } = createHost();
    host.settings.backendSettings.opencode2.mode = 'remote';
    const models = mount(host, 'model');
    await settle();
    expect(models.querySelector<HTMLSelectElement>('[data-config-path="model"] select')!.disabled).toBe(true);
    models.querySelector<HTMLButtonElement>('[data-action="apply"]')!.click();
    expect(adapter.validateConfigContent).not.toHaveBeenCalled();
    expect(host.saveSettings).not.toHaveBeenCalled();
  });

  it('keeps the draft on failed application and does not report it as effective', async () => {
    const { host, adapter } = createHost();
    adapter.validateConfigContent.mockRejectedValueOnce(new Error('private token value'));
    const context = mount(host, 'context');
    await settle();
    edit(context, '[data-config-path="compaction.auto"] select', 'false');
    context.querySelector<HTMLButtonElement>('[data-action="apply"]')!.click();
    await settle();
    expect(host.saveSettings).not.toHaveBeenCalled();
    expect(context.textContent).not.toContain('private token value');
    expect(context.textContent).toContain('Apply or save failed');
    expect(context.querySelector<HTMLSelectElement>('[data-config-path="compaction.auto"] select')!.value).toBe('false');
  });

  it('does not overwrite an externally changed overlay with the page draft', async () => {
    const { host, adapter } = createHost();
    const models = mount(host, 'model');
    await settle();
    edit(models, '[data-config-path="model"] select', 'openai/model-b');
    host.settings.backendSettings.opencode2.configContent = '{"external":true}';
    models.remove();
    const next = mount(host, 'context');
    expect(next.textContent).toContain('configuration changed elsewhere');
    expect(next.querySelector<HTMLButtonElement>('[data-action="apply"]')!.disabled).toBe(true);
    expect(adapter.validateConfigContent).not.toHaveBeenCalled();
  });
});
