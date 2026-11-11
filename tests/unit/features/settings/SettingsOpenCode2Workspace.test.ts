import { Setting } from 'obsidian';

import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { SettingsOpenCode2Section } from '../../../../src/features/settings/backends/opencode/SettingsBackendSection';
import { renderBackendSettingsWorkspace } from '../../../../src/features/settings/controls/BackendSettingsWorkspace';
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

/** Drives one native radio card from the shared backend choice control. */
function choose(container: HTMLElement, key: string, value: string): HTMLInputElement {
  const radio = container.querySelector<HTMLInputElement>(
    `.opencodian-backend-choice-group[data-backend-key="${key}"] input[value="${value}"]`,
  );
  expect(radio).not.toBeNull();
  radio!.checked = true;
  radio!.dispatchEvent(new Event('change', { bubbles: true }));
  return radio!;
}

describe('OpenCode 2 task presentation', () => {
  beforeEach(() => { document.body.innerHTML = ''; setLocale('en'); });
  afterEach(() => { jest.restoreAllMocks(); });

  it.each(['connection', 'model', 'agents', 'permissions', 'context', 'tools', 'mcp', 'configuration', 'advanced'])(
    'places the scoped backup after Connection and omits it from the %s page header', async (tab) => {
      const { host } = createHost();
      const container = document.body.createDiv();
      renderBackendSettingsWorkspace(container, 'opencode2', host, jest.fn());
      new SettingsOpenCode2Section({ plugin: host, requestDisplayRefresh: jest.fn(), renderTitleSettings: jest.fn() })
        .attachTabbed(container, tab);
      await settle();
      const root = container.querySelector('.opencodian-opencode2-settings')!;
      expect(container.firstElementChild).toBe(root);
      expect(root.querySelector('h3')).not.toBeNull();
      expect(container.querySelector('.opencodian-backend-workspace-context')).toBeNull();
      const backup = container.querySelector('.opencodian-opencode2-connection-backup');
      expect(container.querySelectorAll('.opencodian-opencode2-connection-backup')).toHaveLength(tab === 'connection' ? 1 : 0);
      expect(backup?.previousElementSibling ?? null).toBe(tab === 'connection' ? root : null);
      expect(backup?.querySelector('details')?.open ?? false).toBe(false);
    },
  );

  it('keeps the classic layout backup immediately after the connection form across catalog repaints', async () => {
    const { host } = createHost();
    const container = document.body.createDiv();
    renderBackendSettingsWorkspace(container, 'opencode2', host, jest.fn());
    new SettingsOpenCode2Section({ plugin: host, requestDisplayRefresh: jest.fn(), renderTitleSettings: jest.fn() }).attach(container);
    await settle();
    const connection = container.querySelector('[data-settings-target="opencode2-connection"]')!;
    expect(connection.nextElementSibling).toBe(container.querySelector('.opencodian-opencode2-connection-backup'));
    expect(container.querySelectorAll('.opencodian-opencode2-connection-backup')).toHaveLength(1);
  });

  it('shows pending actions across tabs and clears their emphasis after discard', async () => {
    const { host } = createHost();
    const context = mount(host, 'context');
    await settle();
    expect(context.querySelector('.opencodian-opencode2-footer')?.getAttribute('data-draft-state')).toBe('clean');
    const source = context.querySelector<HTMLElement>('[data-config-path="compaction.auto"] .opencodian-opencode2-badge')!;
    expect(source.hidden).toBe(true);
    edit(context, '[data-config-path="compaction.auto"] select', 'false');
    expect(source.hidden).toBe(false);
    expect(context.querySelector('.opencodian-opencode2-footer')?.getAttribute('data-draft-state')).toBe('pending');
    context.remove();
    const model = mount(host, 'model');
    expect(model.querySelector('.opencodian-opencode2-footer')?.getAttribute('data-draft-state')).toBe('pending');
    model.querySelector<HTMLButtonElement>('[data-action="discard"]')!.click();
    expect(model.querySelector('.opencodian-opencode2-footer')?.getAttribute('data-draft-state')).toBe('clean');
    model.remove();
    const restored = mount(host, 'context');
    expect(restored.querySelector<HTMLElement>('[data-config-path="compaction.auto"] .opencodian-opencode2-badge')!.hidden).toBe(true);
    expect(host.saveSettings).not.toHaveBeenCalled();
  });

});

describe('OpenCode 2 functional settings workspace', () => {
  beforeEach(() => { document.body.innerHTML = ''; setLocale('en'); });
  afterEach(() => { jest.restoreAllMocks(); });

  it('defines nine pages, embedded branding, and migration of retired secondary tabs', () => {
    const tab = getPrimaryTabDefinition('opencode2')!;
    expect(tab.icon).toBe('opencodian-opencode2');
    expect(tab.secondaryTabs.map(({ id }) => id)).toEqual(['connection', 'model', 'agents', 'permissions', 'context', 'tools', 'mcp', 'configuration', 'advanced']);
    expect(resolveSecondaryTabId('opencode2', 'auth')).toBe('model');
    expect(resolveSecondaryTabId('opencode2', 'integrations')).toBe('model');
    expect(resolveSecondaryTabId('opencode2', 'models')).toBe('model');
    expect(resolveSecondaryTabId('opencode2', 'extensions')).toBe('configuration');
    expect(resolveSecondaryTabId('opencode2', 'resources')).toBe('configuration');
    expect(resolveSecondaryTabId('opencode2', 'context')).toBe('context');
    expect(resolveSecondaryTabId('opencode2', 'catalog')).toBe('advanced');
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
    const second = mount(host, 'advanced');
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
    const advanced = mount(host, 'context');
    edit(advanced, '[data-config-path="compaction.auto"] select', 'false');
    advanced.querySelector<HTMLButtonElement>('[data-action="apply"]')!.click();
    await settle();
    const applied = adapter.validateConfigContent.mock.calls[0][0];
    expect(applied).toContain('// keep this comment');
    expect(applied).toMatch(/"untouched":\s*true/);
    expect(applied).toContain('openai/model-b');
    expect(applied).toContain('"auto": false');
    expect(host.saveSettings).toHaveBeenCalledTimes(1);
    expect(adapter.validateConfigContent.mock.invocationCallOrder[0]).toBeLessThan(host.saveSettings.mock.invocationCallOrder[0]);
  });

  it('retains invalid rule drafts across tabs and blocks apply until corrected', async () => {
    const { host, adapter } = createHost('{\n // keep this comment\n "permissions": [{"action":"read","resource":"**","effect":"allow"}],\n}');
    const permissions = mount(host, 'permissions');
    await settle();
    const rule = permissions.querySelector('.opencodian-opencode2-rule')!;
    expect(rule).not.toBeNull();
    edit(permissions, '.opencodian-opencode2-rule select', '__custom__');
    edit(permissions, '.opencodian-opencode2-rule input', ''); // a rule without an action is an invalid draft
    expect(permissions.querySelector<HTMLButtonElement>('[data-action="apply"]')!.disabled).toBe(true);
    permissions.remove();
    const restored = mount(host, 'permissions');
    expect(restored.querySelector('.opencodian-opencode2-rule select')!.value).toBe('__custom__');
    expect(restored.querySelector('.opencodian-opencode2-rule input')!.value).toBe('');
    expect(restored.querySelector<HTMLButtonElement>('[data-action="apply"]')!.disabled).toBe(true);
    edit(restored, '.opencodian-opencode2-rule input', 'websearch');
    expect(restored.querySelector<HTMLButtonElement>('[data-action="apply"]')!.disabled).toBe(false);
    expect(adapter.validateConfigContent).not.toHaveBeenCalled();
  });

  it('stages raw JSONC edits behind an explicit merge, refusing invalid JSONC at merge time', async () => {
    const { host, adapter } = createHost();
    const advanced = mount(host, 'advanced');
    await settle();
    const apply = advanced.querySelector<HTMLButtonElement>('[data-action="apply"]')!;
    edit(advanced, '.opencodian-opencode2-raw', '{ "not json"');
    expect(apply.disabled).toBe(true); // staged raw drafts never apply directly
    advanced.querySelector<HTMLButtonElement>('[data-action="merge-raw"]')!.click();
    expect(apply.disabled).toBe(true); // invalid JSONC is refused at merge time
    edit(advanced, '.opencodian-opencode2-raw', '\n{"compaction":{"auto":false},"customSetting":{"untouched":true}}\n');
    advanced.querySelector<HTMLButtonElement>('[data-action="merge-raw"]')!.click();
    const mergedApply = advanced.querySelector<HTMLButtonElement>('[data-action="apply"]')!; // repaint replaces the node
    expect(mergedApply.disabled).toBe(false);
    mergedApply.click();
    await settle();
    // The merge adopts the staged text verbatim: no reformatting, unknown fields intact.
    expect(adapter.validateConfigContent.mock.calls[0][0]).toContain('"compaction":{"auto":false}');
    expect(host.saveSettings).toHaveBeenCalledTimes(1);
    expect(advanced.querySelector<HTMLButtonElement>('[data-action="apply"]')!.disabled).toBe(true);
    expect(advanced.textContent).not.toContain('configuration changed elsewhere');
  });

  it('discards a staged raw draft and unlocks the form again', async () => {
    const { host, adapter } = createHost('{"compaction":{"auto":true}}');
    const advanced = mount(host, 'advanced');
    await settle();
    const raw = advanced.querySelector<HTMLTextAreaElement>('.opencodian-opencode2-raw')!;
    const savedDraft = raw.value;
    edit(advanced, '.opencodian-opencode2-raw', '{"compaction":{"auto":false},"oops":true}');
    expect(advanced.querySelector('.opencodian-opencode2-draft-lock')).not.toBeNull();
    expect(advanced.querySelector<HTMLInputElement>('[data-config-control]')!.disabled).toBe(true); // form locked while staged
    advanced.querySelector<HTMLButtonElement>('[data-action="discard-raw"]')!.click();
    expect(advanced.querySelector<HTMLTextAreaElement>('.opencodian-opencode2-raw')!.value).toBe(savedDraft); // repaint re-renders the draft
    expect(advanced.querySelector('.opencodian-opencode2-draft-lock')).toBeNull();
    expect(advanced.querySelector<HTMLInputElement>('[data-config-control]')!.disabled).toBe(false);
    expect(advanced.querySelector<HTMLButtonElement>('[data-action="apply"]')!.disabled).toBe(true);
    expect(adapter.validateConfigContent).not.toHaveBeenCalled();
    expect(host.saveSettings).not.toHaveBeenCalled();
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
    const advanced = mount(host, 'context');
    await settle();
    edit(advanced, '[data-config-path="compaction.auto"] select', 'false');
    advanced.querySelector<HTMLButtonElement>('[data-action="apply"]')!.click();
    await settle();
    expect(host.saveSettings).not.toHaveBeenCalled();
    expect(advanced.textContent).not.toContain('private token value');
    expect(advanced.textContent).toContain('Apply or save failed');
    expect(advanced.querySelector<HTMLSelectElement>('[data-config-path="compaction.auto"] select')!.value).toBe('false');
  });

  it('does not overwrite an externally changed overlay with the page draft', async () => {
    const { host, adapter } = createHost();
    const models = mount(host, 'model');
    await settle();
    edit(models, '[data-config-path="model"] select', 'openai/model-b');
    host.settings.backendSettings.opencode2.configContent = '{"external":true}';
    models.remove();
    const next = mount(host, 'advanced');
    expect(next.textContent).toContain('configuration changed elsewhere');
    expect(next.querySelector<HTMLButtonElement>('[data-action="apply"]')!.disabled).toBe(true);
    expect(adapter.validateConfigContent).not.toHaveBeenCalled();
  });

  it('keeps remote collection records selectable while every mutation stays locked', async () => {
    const { host, adapter } = createHost('{"agents":{"porter":{"description":"Configured porter"}}}');
    host.settings.backendSettings.opencode2.mode = 'remote';
    const agents = mount(host, 'agents');
    await settle();
    const item = agents.querySelector<HTMLButtonElement>(".opencodian-opencode2-item[data-resource-id='porter']")!;
    expect(item).not.toBeNull();
    item.click();
    expect(item.getAttribute('aria-pressed')).toBe('true'); // selection is allowed in remote mode
    expect(agents.querySelector('.opencodian-opencode2-editor')).not.toBeNull();
    for (const control of Array.from(agents.querySelectorAll<HTMLInputElement>('[data-config-control]'))) {
      expect(control.disabled).toBe(true);
    }
    for (const action of Array.from(agents.querySelectorAll<HTMLButtonElement>('[data-config-action]'))) {
      expect(action.disabled).toBe(true);
    }
    agents.querySelector<HTMLButtonElement>('[data-action="apply"]')!.click();
    expect(adapter.validateConfigContent).not.toHaveBeenCalled();
    expect(host.saveSettings).not.toHaveBeenCalled();
  });
});

describe('OpenCode 2 connection surface', () => {
  beforeEach(() => { document.body.innerHTML = ''; setLocale('en'); });
  afterEach(() => { jest.restoreAllMocks(); });

  it('saves the permission mode plugin choice without touching the overlay', async () => {
    const { host } = createHost();
    const permissions = mount(host, 'permissions');
    await settle();
    const group = permissions.querySelector('.opencodian-backend-choice-group[data-backend-key="permissionMode"]');
    expect(group?.getAttribute('role')).toBe('radiogroup');
    const inherit = group!.querySelector<HTMLInputElement>('input[value="inherit"]')!;
    expect(inherit.checked).toBe(true);
    expect(group!.querySelector('.opencodian-backend-choice-desc')).toBeNull();
    const hint = permissions.querySelector<HTMLElement>('.opencodian-opencode2-choice-hint')!;
    expect(group!.nextElementSibling).toBe(hint);
    expect(group!.getAttribute('aria-describedby')).toBe(hint.id);
    choose(permissions, 'permissionMode', 'yolo');
    await settle();
    expect(host.settings.backendSettings.opencode2.permissionMode).toBe('yolo');
    expect(hint.textContent).toBe(group!.querySelector('input[value="yolo"]')!.getAttribute('aria-description'));
    expect(host.saveSettings).toHaveBeenCalledTimes(1);
    expect(permissions.querySelector('[data-backend-effect="next-turn"]')).not.toBeNull();
  });

  it('restores both the choice and its external explanation when saving is rejected', async () => {
    const { host } = createHost();
    const connection = mount(host, 'connection');
    await settle();
    const group = connection.querySelector<HTMLElement>('.opencodian-backend-choice-group[data-backend-key="mode"]')!;
    const hint = group.nextElementSibling!;
    const initial = hint.textContent;
    host.saveSettings.mockRejectedValueOnce(new Error('save rejected'));
    choose(connection, 'mode', 'remote');
    await settle();
    expect(group.querySelector<HTMLInputElement>('input[value="local"]')!.checked).toBe(true);
    expect(hint.textContent).toBe(initial);
    expect(group.querySelectorAll('.opencodian-backend-choice-desc')).toHaveLength(0);
  });

  it('reveals the custom executable input only after choosing custom', async () => {
    const { host } = createHost();
    jest.spyOn(Setting.prototype, 'setName').mockImplementation(function (this: Setting, name: string) {
      (this as Setting & { __name?: string }).__name = name;
      return this;
    });
    const textHandlers = new Map<string, (value: string) => Promise<void>>();
    jest.spyOn(Setting.prototype, 'addText').mockImplementation(function (this: Setting, callback) {
      const inputEl = this.controlEl.createEl('input');
      const input = {
        inputEl,
        setPlaceholder: jest.fn().mockReturnThis(),
        setValue: jest.fn().mockReturnThis(),
        onChange: jest.fn((handler: (value: string) => Promise<void>) => {
          textHandlers.set((this as Setting & { __name?: string }).__name ?? '', handler);
          return input;
        }),
      };
      callback(input as never);
      return this;
    });
    const connection = mount(host, 'connection');
    await settle();
    expect(connection.querySelector('input[aria-label="CLI executable"]')).toBeNull();
    choose(connection, 'executablePath', 'custom');
    await settle();
    expect(connection.querySelector('input[aria-label="CLI executable"]')).not.toBeNull();
    await textHandlers.get('CLI executable')!('/usr/local/bin/opencode2 ');
    expect(host.settings.backendSettings.opencode2.executablePath).toBe('/usr/local/bin/opencode2');
    expect(host.saveSettings).toHaveBeenCalled();
  });

  it('switches connection mode through choice cards and refreshes the surface', async () => {
    const { host } = createHost();
    const requestDisplayRefresh = jest.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    new SettingsOpenCode2Section({ plugin: host, requestDisplayRefresh, renderTitleSettings: jest.fn() })
      .attachTabbed(container, 'connection');
    await settle();
    expect(container.querySelector('[data-backend-key="mode"] input[value="local"]')!.checked).toBe(true);
    choose(container, 'mode', 'remote');
    await settle();
    expect(host.settings.backendSettings.opencode2.mode).toBe('remote');
    expect(host.saveSettings).toHaveBeenCalled();
    expect(requestDisplayRefresh).toHaveBeenCalled();
  });

  it('offers catalog agents as default agent choices with inherit first', async () => {
    const { host } = createHost();
    const agents = mount(host, 'agents');
    await settle();
    const select = agents.querySelector<HTMLSelectElement>('[data-config-path="default_agent"] select');
    expect(select).not.toBeNull();
    expect(select!.options[0].value).toBe('');
    expect(select!.options[0].textContent).toContain('Inherit');
    expect(Array.from(select!.options).some((option) => option.value === 'build')).toBe(true);
  });
});
