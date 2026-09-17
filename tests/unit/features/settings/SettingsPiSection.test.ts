import { type App, Setting } from 'obsidian';

import type { PiAdapter } from '../../../../src/core/agents/backend/pi/PiAdapter';
import type { PiMcpConfigService } from '../../../../src/core/agents/backend/pi/PiMcpConfigService';
import { getActiveSecondaryTabId,getPrimaryTabDefinition } from '../../../../src/features/settings/settingsLayoutRegistry';
import { SettingsPiConfigurationSection } from '../../../../src/features/settings/SettingsPiConfigurationSection';
import { SettingsPiSection } from '../../../../src/features/settings/SettingsPiSection';
import { setLocale } from '../../../../src/i18n';

describe('Pi native settings integration', () => {
  beforeEach(() => { setLocale('zh'); document.body.innerHTML = ''; });
  afterEach(() => jest.restoreAllMocks());
  it('owns a backend tab with dedicated secondary pages and remembers the selected page', () => {
    const pi = getPrimaryTabDefinition('pi');
    expect(pi?.backendRequired).toBe('pi');
    expect(pi?.secondaryTabs.map(tab => tab.id)).toEqual(['connection', 'providers', 'model', 'execution', 'mcp', 'resources', 'account', 'sessions', 'advanced']);
    expect(getActiveSecondaryTabId('pi', { pi: 'providers' })).toBe('providers');
    expect(getPrimaryTabDefinition('codex')?.defaultSecondaryTabId).toBe('connection');
    expect(getPrimaryTabDefinition('claude-code')?.defaultSecondaryTabId).toBe('runtime');
  });
  it('renders the connection surface using the same section shell contract as existing backends', () => {
    const container = document.body.createDiv();
    new SettingsPiSection({ settings: { backendSettings: {} }, saveSettings: async () => {} }).attachTabbed(container, 'connection');
    expect(container.querySelector('[data-pi-section="connection"][data-settings-surface="section"]')).not.toBeNull();
    expect(container.querySelector('[data-settings-surface="section-body"]')).not.toBeNull();
    expect(container.textContent).toContain('连接');
    expect(container.textContent).not.toContain('settings.pi.');
  });
  it('lists declared MCP servers with the last extension status, without write actions', () => {
    const rows: Array<{ name: string; desc: string }> = [];
    jest.spyOn(Setting.prototype, 'setName').mockImplementation(function (name: string) {
      rows.push({ name, desc: '' });
      return this;
    });
    jest.spyOn(Setting.prototype, 'setDesc').mockImplementation(function (desc: string) {
      const last = rows[rows.length - 1];
      if (last) last.desc = desc;
      return this;
    });
    const container = document.body.createDiv();
    const host = {
      app: { vault: { adapter: { basePath: '/vault' } } } as unknown as App,
      settings: { backendSettings: {} },
      saveSettings: async () => {},
      agentServiceRegistry: { get: () => ({
        getExtensionStatus: () => ({ statuses: { mcp: '🔌 MCP: 5 servers enabled (1 connected)' }, message: '✗ zhipu-zai: needs auth', updatedAt: Date.now() }),
      } as unknown as PiAdapter) },
    };
    const mcpConfig = { read: () => ({
      servers: [
        { name: 'zhipu-web-search', transport: 'stdio' as const, endpoint: 'npx -y zhipu-mcp', disabled: false, auth: 'none' as const, source: '/home/u/.pi/agent/mcp.json' },
        { name: 'remote', transport: 'http' as const, endpoint: 'https://mcp.example.com/sse', disabled: true, auth: 'oauth' as const, source: '/vault/.mcp.json' },
      ],
      sources: ['/home/u/.pi/agent/mcp.json', '/vault/.mcp.json'],
      exclusive: false,
    }) } as unknown as PiMcpConfigService;

    new SettingsPiSection(host as never, mcpConfig).attachTabbed(container, 'mcp');

    expect(container.querySelector('[data-pi-section="mcp"][data-settings-surface="section"]')).not.toBeNull();
    expect(rows.map(row => row.name)).toEqual(['zhipu-web-search', 'remote']);
    expect(rows[0].desc).toBe('stdio · npx -y zhipu-mcp · 来源 /home/u/.pi/agent/mcp.json');
    expect(rows[1].desc).toBe('http · https://mcp.example.com/sse · 已禁用 · 认证：OAuth · 来源 /vault/.mcp.json');
    expect(container.textContent).toContain('已合并的配置文件：/home/u/.pi/agent/mcp.json · /vault/.mcp.json');
    expect(container.querySelector('.opencodian-pi-mcp-status-line')?.textContent).toBe('🔌 MCP: 5 servers enabled (1 connected)');
    expect(container.textContent).toContain('✗ zhipu-zai: needs auth');
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });
  it('says so when Pi has not reported any status yet', () => {
    const container = document.body.createDiv();
    new SettingsPiSection({ settings: { backendSettings: {} }, saveSettings: async () => {} }).attachTabbed(container, 'mcp');

    expect(container.textContent).toContain('还没有收到任何上报');
  });
  it('saves an explicit project override with revision and preserves untouched settings', async () => {
    const buttonCallbacks: Array<() => Promise<void>> = [];
    const numberChanges: Array<(value: string) => void> = [];
    jest.spyOn(Setting.prototype, 'addButton').mockImplementation(function (callback) {
      const button = { setButtonText: () => button, setCta: () => button, setDisabled: () => button, onClick: (cb: () => Promise<void>) => { buttonCallbacks.push(cb); return button; } };
      callback(button as never); return this;
    });
    jest.spyOn(Setting.prototype, 'addText').mockImplementation(function (callback) {
      const input = { inputEl: document.createElement('input'), setValue: () => input, setPlaceholder: () => input, setDisabled: () => input, onChange: (cb: (value: string) => void) => { numberChanges.push(cb); return input; } };
      callback(input as never); return this;
    });
    const snapshot = { scopes: { global: { path: '/global', revision: 'g', value: {} }, project: { path: '/project', revision: 'p', value: { compaction: { reserveTokens: 100 } } } }, fields: [{ path: 'compaction.reserveTokens', group: 'execution', kind: 'number', min: 0, label: { zh: '预留', en: 'Reserve' } }], sdkVersion: '0.73.1' };
    const command = jest.fn(async () => snapshot);
    const saved = jest.fn(async () => {});
    new SettingsPiConfigurationSection({ command } as unknown as PiAdapter, saved, async () => {}).attach(document.body.createDiv(), 'execution');
    await Promise.resolve(); await Promise.resolve();
    numberChanges[0]('456');
    await buttonCallbacks[1]();
    expect(command).toHaveBeenCalledWith(undefined, 'save_configuration', { scope: 'project', revision: 'p', changes: { 'compaction.reserveTokens': 456 } });
    expect(saved).toHaveBeenCalledWith(['compaction.reserveTokens']);
  });
});
