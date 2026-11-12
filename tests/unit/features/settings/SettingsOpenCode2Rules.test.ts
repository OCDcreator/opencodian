import { parse } from 'jsonc-parser';

import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { SettingsOpenCode2Section } from '../../../../src/features/settings/backends/opencode/SettingsBackendSection';
import { setLocale } from '../../../../src/i18n';

function fixture(config: Record<string, unknown>) {
  const settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as typeof DEFAULT_SETTINGS;
  settings.backendSettings.opencode2.configContent = JSON.stringify(config, null, 2);
  settings.backendSettings.opencode2.mode = 'local';
  const adapter = {
    readConfigurationSummary: jest.fn().mockResolvedValue({ version: '2.2.6', providers: 0, models: 0, agents: 1, skills: 0, commands: 0, mcp: 0 }),
    readManagementCatalog: jest.fn().mockResolvedValue({ integrations: [], mcp: [], agents: [{ id: 'build', name: 'build' }], commands: [], skills: [], plugins: [] }),
    getModelSelectorProviders: jest.fn().mockResolvedValue([]),
    validateConfigContent: jest.fn(async (content: string) => { settings.backendSettings.opencode2.configContent = content; }),
  };
  const host = { settings, saveSettings: jest.fn().mockResolvedValue(undefined), agentServiceRegistry: { get: () => adapter } };
  const mount = (tab: string): HTMLElement => {
    const root = document.createElement('div');
    document.body.append(root);
    new SettingsOpenCode2Section({ plugin: host, requestDisplayRefresh: jest.fn(), renderTitleSettings: jest.fn() }).attachTabbed(root, tab);
    return root;
  };
  return { host, adapter, mount, saved: () => parse(settings.backendSettings.opencode2.configContent) as Record<string, unknown> };
}

async function settle(): Promise<void> {
  for (let index = 0; index < 30; index += 1) await Promise.resolve();
}

function edit(control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string): void {
  expect(control).not.toBeNull();
  control.value = value;
  control.dispatchEvent(new Event(control.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
}

function field(root: HTMLElement, path: string): HTMLElement {
  return root.querySelector<HTMLElement>(`[data-config-path="${path}"]`)!;
}

function selectServer(root: HTMLElement, id: string): void {
  root.querySelector<HTMLButtonElement>(`.opencodian-opencode2-item[data-resource-id="${id}"]`)!.click();
}

const servers = {
  a: { type: 'local', command: ['node', 'a.mjs'], environment: { ROOT: 'a' }, timeout: { catalog: 30000 }, customNative: { preserve: true } },
  b: { type: 'local', command: ['node', 'b.mjs'], environment: { ROOT: 'b' } },
};

beforeEach(() => { document.body.innerHTML = ''; setLocale('en'); });

describe('OpenCode 2 ordered native permissions', () => {
  it('preserves current edits and unknown rule fields through down, custom action, and remove', async () => {
    const current = fixture({ permissions: [
      { action: 'read', resource: '*', effect: 'allow', extension: true },
      { action: 'shell', resource: '*', effect: 'ask' },
      { action: 'edit', resource: '*.md', effect: 'deny' },
    ] });
    const root = current.mount('permissions'); await settle();
    const rows = () => Array.from(root.querySelectorAll<HTMLElement>('.opencodian-opencode2-rule'));
    edit(rows()[0].querySelectorAll<HTMLInputElement>('input')[1], 'notes/*.md');
    rows()[0].querySelectorAll<HTMLButtonElement>('button')[1].click();
    expect(rows()[1].querySelectorAll<HTMLInputElement>('input')[1].value).toBe('notes/*.md');
    edit(rows()[2].querySelector<HTMLSelectElement>('select')!, '__custom__');
    edit(rows()[2].querySelector<HTMLInputElement>('input')!, 'publish');
    rows()[0].querySelectorAll<HTMLButtonElement>('button')[2].click();
    root.querySelector<HTMLButtonElement>('[data-action="apply"]')!.click(); await settle();
    expect(current.saved().permissions).toEqual([
      { action: 'read', resource: 'notes/*.md', effect: 'allow', extension: true },
      { action: 'publish', resource: '*.md', effect: 'deny' },
    ]);
  });
});

describe('OpenCode 2 MCP repeated fields', () => {
  it('keeps key/value rows scoped and blocks duplicate names without dropping their draft', async () => {
    const current = fixture({ mcp: { servers } });
    const root = current.mount('mcp'); await settle();
    const pairs = () => Array.from(root.querySelectorAll<HTMLElement>('.opencodian-opencode2-kv-row'));
    edit(pairs()[0].querySelectorAll<HTMLInputElement>('input')[1], 'a-edited');
    selectServer(root, 'b');
    expect(pairs()[0].querySelectorAll<HTMLInputElement>('input')[1].value).toBe('b');
    root.querySelector<HTMLButtonElement>('.opencodian-opencode2-kv .opencodian-opencode2-subheader button')!.click();
    edit(pairs()[1].querySelector<HTMLInputElement>('input')!, 'ROOT');
    expect(root.querySelector<HTMLButtonElement>('[data-action="apply"]')!.disabled).toBe(true);
    edit(pairs()[1].querySelector<HTMLInputElement>('input')!, 'EXTRA');
    edit(pairs()[1].querySelectorAll<HTMLInputElement>('input')[1], 'b-extra');
    selectServer(root, 'a');
    expect(pairs()[0].querySelectorAll<HTMLInputElement>('input')[1].value).toBe('a-edited');
    root.querySelector<HTMLButtonElement>('[data-action="apply"]')!.click(); await settle();
    const saved = current.saved().mcp as { servers: typeof servers };
    expect(saved.servers.a.environment).toEqual({ ROOT: 'a-edited' });
    expect(saved.servers.b.environment).toEqual({ ROOT: 'b', EXTRA: 'b-extra' });
  });

  it('restores separate transport drafts and only validates the currently selected transport', async () => {
    const current = fixture({ mcp: { servers: { a: servers.a } } });
    const root = current.mount('mcp'); await settle();
    const transport = () => field(root, 'mcp.servers.a.type').querySelector<HTMLSelectElement>('select')!;
    root.querySelector<HTMLButtonElement>('.opencodian-opencode2-kv .opencodian-opencode2-subheader button')!.click();
    edit(transport(), 'remote');
    edit(field(root, 'mcp.servers.a.url').querySelector<HTMLInputElement>('input')!, 'https://example.invalid/mcp');
    expect(root.querySelector<HTMLButtonElement>('[data-action="apply"]')!.disabled).toBe(false);
    edit(transport(), 'local');
    const pairs = root.querySelectorAll<HTMLElement>('.opencodian-opencode2-kv-row');
    expect(pairs).toHaveLength(2);
    expect(root.querySelector<HTMLButtonElement>('[data-action="apply"]')!.disabled).toBe(true);
    edit(pairs[1].querySelector<HTMLInputElement>('input')!, 'EXTRA');
    edit(transport(), 'remote');
    expect(field(root, 'mcp.servers.a.url').querySelector<HTMLInputElement>('input')!.value).toBe('https://example.invalid/mcp');
    expect(root.querySelector<HTMLButtonElement>('[data-action="apply"]')!.disabled).toBe(false);
    root.querySelector<HTMLButtonElement>('[data-action="apply"]')!.click(); await settle();
    const server = (current.saved().mcp as { servers: Record<string, Record<string, unknown>> }).servers.a;
    expect(server).toEqual({ type: 'remote', url: 'https://example.invalid/mcp', timeout: { catalog: 30000 }, customNative: { preserve: true } });
  });
});

describe('OpenCode 2 adopted configuration', () => {
  it('clears a stale buffer-unit choice when adopting external saved configuration', async () => {
    const current = fixture({ compaction: { buffer: '15%' } });
    const first = current.mount('context'); await settle();
    edit(field(first, 'compaction.buffer').querySelector<HTMLSelectElement>('select')!, 'percent');
    current.host.settings.backendSettings.opencode2.configContent = JSON.stringify({ compaction: { buffer: 40 } }, null, 2);
    const second = current.mount('context'); await settle();
    const buffer = field(second, 'compaction.buffer');
    expect(buffer.querySelector<HTMLSelectElement>('select')!.value).toBe('tokens');
    edit(buffer.querySelector<HTMLInputElement>('input')!, '41');
    second.querySelector<HTMLButtonElement>('[data-action="apply"]')!.click(); await settle();
    expect(current.saved().compaction).toEqual({ buffer: 41 });
  });

  it('enables record restore immediately and preserves unrelated JSONC comments and unknown keys', async () => {
    const current = fixture({ extension: { untouched: true } });
    current.host.settings.backendSettings.opencode2.configContent = '{\n  // keep this comment\n  "extension": {"untouched":true}\n}';
    const root = current.mount('agents'); await settle();
    const restore = root.querySelector<HTMLButtonElement>('[data-config-action="restore-record"]')!;
    expect(restore.disabled).toBe(true);
    edit(field(root, 'agents.build.description').querySelector<HTMLInputElement>('input')!, 'Updated purpose');
    expect(restore.disabled).toBe(false);
    root.querySelector<HTMLButtonElement>('[data-action="apply"]')!.click(); await settle();
    expect(current.host.settings.backendSettings.opencode2.configContent).toContain('// keep this comment');
    expect(current.saved().extension).toEqual({ untouched: true });
  });
});
