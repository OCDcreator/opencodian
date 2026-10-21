import type * as fs from 'node:fs';
import nodeFs from 'node:fs';
import nodeOs from 'node:os';

import { type App, Setting } from 'obsidian';

import type { PiAdapter } from '../../../../src/core/agents/backend/pi/PiAdapter';
import { PiMcpConfigService } from '../../../../src/core/agents/backend/pi/PiMcpConfigService';
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

// Finite original Pi flags plus generic-report flag spellings. These values are synthetic.
const matrix008Shapes = [
  ...['--token', '-token', '--api-key', '--api_key', '--client_secret', '--PASSWORD', '--secret', '--credentials', '--authorization']
    .flatMap((flag, index) => ['independent', 'equal'].map(form => {
      const secret = `FAKE_MATRIX008_FLAG_${index}_${form}`;
      return { id: `${flag}/${form}`, input: `safe-mcp ${flag}${form === 'equal' ? '=' : ' '}${secret} --port 4096`, forbidden: [secret], safe: ['safe-mcp', '--port 4096'] };
    })),
  { id: 'url-password', input: 'https://safe-user:FAKE_MATRIX008_URL_PASSWORD@fixture.invalid/mcp?mode=safe#section', forbidden: ['FAKE_MATRIX008_URL_PASSWORD'], safe: ['fixture.invalid/mcp', 'mode=safe'] },
  { id: 'url-query', input: 'https://fixture.invalid/mcp?access_token=FAKE_MATRIX008_URL_QUERY&mode=safe', forbidden: ['FAKE_MATRIX008_URL_QUERY'], safe: ['fixture.invalid/mcp', 'mode=safe'] },
  { id: 'url-labelled-fragment', input: 'https://fixture.invalid/mcp#token=FAKE_MATRIX008_LABELLED_FRAGMENT', forbidden: ['FAKE_MATRIX008_LABELLED_FRAGMENT'], safe: ['fixture.invalid/mcp'] },
  { id: 'url-unlabelled-fragment', input: 'https://fixture.invalid/mcp#FAKE_MATRIX008_UNLABELLED_FRAGMENT', forbidden: ['FAKE_MATRIX008_UNLABELLED_FRAGMENT'], safe: ['fixture.invalid/mcp'] },
  { id: 'url-distinct', input: 'https://FAKE_MATRIX008_DISTINCT_USER:FAKE_MATRIX008_DISTINCT_PASSWORD@fixture.invalid/mcp?access_token=FAKE_MATRIX008_DISTINCT_QUERY&mode=safe#FAKE_MATRIX008_DISTINCT_FRAGMENT', forbidden: ['FAKE_MATRIX008_DISTINCT_USER', 'FAKE_MATRIX008_DISTINCT_PASSWORD', 'FAKE_MATRIX008_DISTINCT_QUERY', 'FAKE_MATRIX008_DISTINCT_FRAGMENT'], safe: ['fixture.invalid/mcp', 'mode=safe'] },
  { id: 'url-reused', input: 'https://FAKE_MATRIX008_REUSED_VALUE:FAKE_MATRIX008_REUSED_VALUE@fixture.invalid/mcp?access_token=FAKE_MATRIX008_REUSED_VALUE&mode=safe#FAKE_MATRIX008_REUSED_VALUE', forbidden: ['FAKE_MATRIX008_REUSED_VALUE'], safe: ['fixture.invalid/mcp', 'mode=safe'] },
];


describe('MATRIX008 Pi extension-status output negatives', () => {
  beforeEach(() => { setLocale('zh'); document.body.innerHTML = ''; });
  afterEach(() => { jest.restoreAllMocks(); document.body.innerHTML = ''; });

  it.each(matrix008Shapes.flatMap(shape => ['statuses', 'message'].map(position => ({ ...shape, position }))))(
    'MATRIX008 $id excludes fake values from Pi $position JSDOM projection',
    (shape) => {
      const snapshot: ReturnType<PiAdapter['getExtensionStatus']> = {
        statuses: { mcp: shape.position === 'statuses' ? shape.input : 'safe-mcp connected' },
        message: shape.position === 'message' ? shape.input : 'safe-mcp ready',
        updatedAt: 1,
      };
      const getExtensionStatus = jest.fn(() => snapshot);
      const adapter = { getExtensionStatus } as unknown as PiAdapter;
      const host = {
        settings: { backendSettings: {} }, saveSettings: async () => {},
        agentServiceRegistry: { get: () => adapter },
      };
      const container = document.body.createDiv();
      new SettingsPiSection(host as never).attachTabbed(container, 'mcp');
      const selector = shape.position === 'statuses' ? '.opencodian-pi-mcp-status-line' : '.opencodian-pi-mcp-status-message';
      const output = container.querySelector(selector)?.textContent ?? '';
      process.stdout.write(`MATRIX008_SINK ${JSON.stringify({ caseId: shape.id, sink: `pi-${shape.position}-JSDOM`, source: 'typed controlled getExtensionStatus -> actual mcpStatus; upstream RPC not executed', input: shape.input, output, forbidden: shape.forbidden, safe: shape.safe })}\n`);
      expect(getExtensionStatus).toHaveBeenCalledTimes(1);
      expect(container.querySelectorAll('button')).toHaveLength(0);
      for (const safe of shape.safe) expect(output).toContain(safe);
      expect(shape.forbidden.filter(secret => output.includes(secret))).toEqual([]);
    },
  );
});

describe('MATRIX008 Pi declaration reader to settings descriptions', () => {
  beforeEach(() => { setLocale('zh'); document.body.innerHTML = ''; });
  afterEach(() => { jest.restoreAllMocks(); document.body.innerHTML = ''; });

  it.each([
    { id: 'declaration-flags-distinct', entry: { command: 'safe-mcp', args: ['--token', 'FAKE_MATRIX008_DECL_TOKEN', '--api-key=FAKE_MATRIX008_DECL_KEY', '--port', '4096'] }, forbidden: ['FAKE_MATRIX008_DECL_TOKEN', 'FAKE_MATRIX008_DECL_KEY'], safe: ['safe-mcp', '--port 4096'] },
    { id: 'declaration-url-distinct', entry: { url: 'https://FAKE_MATRIX008_DECL_USER:FAKE_MATRIX008_DECL_PASSWORD@fixture.invalid/mcp?access_token=FAKE_MATRIX008_DECL_QUERY#FAKE_MATRIX008_DECL_FRAGMENT' }, forbidden: ['FAKE_MATRIX008_DECL_USER', 'FAKE_MATRIX008_DECL_PASSWORD', 'FAKE_MATRIX008_DECL_QUERY', 'FAKE_MATRIX008_DECL_FRAGMENT'], safe: ['fixture.invalid/mcp'] },
    { id: 'declaration-url-reused', entry: { url: 'https://FAKE_MATRIX008_DECL_REUSED:FAKE_MATRIX008_DECL_REUSED@fixture.invalid/mcp?access_token=FAKE_MATRIX008_DECL_REUSED#FAKE_MATRIX008_DECL_REUSED' }, forbidden: ['FAKE_MATRIX008_DECL_REUSED'], safe: ['fixture.invalid/mcp'] },
  ])('MATRIX008 $id excludes fake values through the real declaration reader', (shape) => {
    const home = '/fixture.invalid/home';
    const workingDirectory = '/fixture.invalid/vault';
    const configPath = `${home}/.pi/agent/mcp.json`;
    const input = JSON.stringify({ mcpServers: { 'safe-mcp': shape.entry } });
    const readFile = jest.spyOn(nodeFs, 'readFileSync').mockImplementation(((file: fs.PathOrFileDescriptor) => {
      expect(file).toBe(configPath);
      return input;
    }) as typeof nodeFs.readFileSync);
    jest.spyOn(nodeOs, 'homedir').mockReturnValue(home);
    const service = new PiMcpConfigService();
    const read = service.read.bind(service);
    jest.spyOn(service, 'read').mockImplementation(options => read({ ...options, homeDir: home, env: { PI_MCP_CONFIG_MODE: 'exclusive' } }));
    const descriptions: string[] = [];
    jest.spyOn(Setting.prototype, 'setDesc').mockImplementation(function (desc: string) { descriptions.push(desc); return this; });
    const host = { app: { vault: { adapter: { basePath: workingDirectory } } } as unknown as App, settings: { backendSettings: {} }, saveSettings: async () => {} };
    const container = document.body.createDiv();
    new SettingsPiSection(host, service).attachTabbed(container, 'mcp');
    const output = descriptions.join('\n');
    process.stdout.write(`MATRIX008_SINK ${JSON.stringify({ caseId: shape.id, sink: 'pi-description-Setting', source: 'synthetic fs.readFileSync -> actual PiMcpConfigService -> actual SettingsPiSection setDesc; no Copy action', input, output, forbidden: shape.forbidden, safe: shape.safe })}\n`);
    expect(readFile).toHaveBeenCalledTimes(1);
    expect(service.read).toHaveBeenCalledWith({ workingDirectory });
    expect(container.querySelectorAll('button')).toHaveLength(0);
    for (const safe of shape.safe) expect(output).toContain(safe);
    expect(shape.forbidden.filter(secret => output.includes(secret))).toEqual([]);
  });
});

describe('MATRIX010 Pi status strict output boundary', () => {
  beforeEach(() => { setLocale('zh'); document.body.innerHTML = ''; });
  afterEach(() => { jest.restoreAllMocks(); document.body.innerHTML = ''; });

  it('sanitizes every status and message while preserving safe text, time, role and cached bytes', () => {
    const snapshot: ReturnType<PiAdapter['getExtensionStatus']> = {
      statuses: {
        mcp: 'safe-mcp https://FAKE_MATRIX010_USER:FAKE_MATRIX010_PASSWORD@example.test/mcp?token=FAKE_MATRIX010_QUERY&mode=safe#FAKE_MATRIX010_FRAGMENT',
        another: 'https://FAKE_MATRIX010_USER@example.test/other#FAKE_MATRIX010_FRAGMENT',
        safe: '🔌 safe-mcp connected --port 4096',
      },
      message: 'safe-mcp https://FAKE_MATRIX010_USER@example.test/mcp?mode=safe#FAKE_MATRIX010_FRAGMENT ready',
      updatedAt: 1,
    };
    const before = JSON.stringify(snapshot);
    const getExtensionStatus = jest.fn(() => snapshot);
    const adapter = { getExtensionStatus } as unknown as PiAdapter;
    const host = { settings: { backendSettings: {} }, saveSettings: async () => {}, agentServiceRegistry: { get: () => adapter } };
    const read: PiMcpConfigService['read'] = () => ({ servers: [], sources: [], exclusive: false });
    const config = { read } as PiMcpConfigService;
    const container = document.body.createDiv();
    new SettingsPiSection(host, config).attachTabbed(container, 'mcp');
    const lines = Array.from(container.querySelectorAll('.opencodian-pi-mcp-status-line')).map(line => line.textContent);
    expect(lines).toEqual([
      'safe-mcp https://[REDACTED]@example.test/mcp?token=[REDACTED]&mode=safe#[REDACTED]',
      'https://[REDACTED]@example.test/other#[REDACTED]',
      '🔌 safe-mcp connected --port 4096',
    ]);
    expect(container.querySelector('.opencodian-pi-mcp-status-message')?.textContent).toBe('safe-mcp https://[REDACTED]@example.test/mcp?mode=safe#[REDACTED] ready');
    expect(container.querySelector('.opencodian-pi-mcp-status')?.getAttribute('role')).toBe('status');
    expect(container.querySelector('.opencodian-pi-mcp-status-meta')?.textContent).toContain(new Date(1).toLocaleTimeString());
    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(getExtensionStatus).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(snapshot)).toBe(before);
  });
});
