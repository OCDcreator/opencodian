import { Notice } from 'obsidian';

jest.mock('obsidian', () => ({
  ...jest.requireActual('obsidian'),
  Notice: jest.fn(),
}));

import { SettingsMcpSection } from '../../../../src/features/settings/SettingsMcpSection';
import { setLocale, t } from '../../../../src/i18n';
import type OpenCodianPlugin from '../../../../src/main';
import {
  buttonRecords,
  changeDropdown,
  changeText,
  changeTextArea,
  changeToggle,
  clearRecordArrays,
  createPlugin,
  createSectionHeading,
  expectLastNotice,
  flushAsync,
  getButtonRecord,
  getTextAreaRecord,
  getTextRecord,
  getToggleRecord,
  mockSettingPrototype,
} from './helpers/mcpSectionTestHelpers';

describe('SettingsMcpSection server actions', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
    clearRecordArrays();
    (Notice as unknown as jest.Mock).mockClear();
    mockSettingPrototype();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows status-aware action buttons per server row', async () => {
    const plugin = createPlugin({
      servers: {
        connected: { status: 'connected' },
        disabled: { status: 'disabled' },
        failed: { status: 'failed', error: 'boom' },
        auth: { status: 'needs_auth' },
        registered: { status: 'needs_client_registration', error: 'client missing' },
      },
      updatedAt: 1700000000000,
    });
    const section = new SettingsMcpSection({
      plugin: plugin as unknown as OpenCodianPlugin,
      createSectionHeading,
      requestDisplayRefresh: jest.fn(),
    });
    const containerEl = document.createElement('div');

    section.attachTabbed(containerEl, 'mcp');
    await flushAsync();

    expect(getButtonRecord(t('settings.server.mcp.action.disconnect'))).toBeDefined();
    expect(buttonRecords.filter((record) => record.label === t('settings.server.mcp.action.connect'))).toHaveLength(2);
    expect(getButtonRecord(t('settings.server.mcp.action.authenticate'))).toBeDefined();
    expect(getButtonRecord(t('settings.server.mcp.action.clearAuth'))).toBeDefined();

    const row = Array.from(containerEl.querySelectorAll('.opencodian-mcp-server-row')).find(
      (item) => item.querySelector('.opencodian-mcp-server-row-name')?.textContent === 'registered',
    );
    expect(row?.querySelector('button')).toBeNull();
  });

  it('connect action calls service and refreshes runtime status', async () => {
    const plugin = createPlugin({
      servers: { disabled: { status: 'disabled' } },
      updatedAt: 1700000000000,
    });
    const section = new SettingsMcpSection({
      plugin: plugin as unknown as OpenCodianPlugin,
      createSectionHeading,
      requestDisplayRefresh: jest.fn(),
    });
    const containerEl = document.createElement('div');

    section.attachTabbed(containerEl, 'mcp');
    await flushAsync();
    (plugin.openCodeService.refreshMcpServerStatus as jest.Mock).mockClear();

    await getButtonRecord(t('settings.server.mcp.action.connect'))?.onClick?.();
    await flushAsync();

    expect(plugin.openCodeService.connectMcpServer).toHaveBeenCalledWith('disabled');
    expect(plugin.openCodeService.refreshMcpServerStatus).toHaveBeenCalledTimes(1);
  });

  it('disconnect action calls service and refreshes runtime status', async () => {
    const plugin = createPlugin({
      servers: { connected: { status: 'connected' } },
      updatedAt: 1700000000000,
    });
    const section = new SettingsMcpSection({
      plugin: plugin as unknown as OpenCodianPlugin,
      createSectionHeading,
      requestDisplayRefresh: jest.fn(),
    });
    const containerEl = document.createElement('div');

    section.attachTabbed(containerEl, 'mcp');
    await flushAsync();
    (plugin.openCodeService.refreshMcpServerStatus as jest.Mock).mockClear();

    await getButtonRecord(t('settings.server.mcp.action.disconnect'))?.onClick?.();
    await flushAsync();

    expect(plugin.openCodeService.disconnectMcpServer).toHaveBeenCalledWith('connected');
    expect(plugin.openCodeService.refreshMcpServerStatus).toHaveBeenCalledTimes(1);
  });
});

describe('SettingsMcpSection add-server form', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
    clearRecordArrays();
    (Notice as unknown as jest.Mock).mockClear();
    mockSettingPrototype();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('validates add-server form before calling the service', async () => {
    const plugin = createPlugin({
      servers: { duplicate: { status: 'connected' } },
      updatedAt: 1700000000000,
    });
    const section = new SettingsMcpSection({
      plugin: plugin as unknown as OpenCodianPlugin,
      createSectionHeading,
      requestDisplayRefresh: jest.fn(),
    });
    const containerEl = document.createElement('div');

    section.attachTabbed(containerEl, 'mcp');
    await flushAsync();

    const submit = () => getButtonRecord(t('settings.server.mcp.add.submit'))?.onClick?.();

    await submit();
    expectLastNotice(t('settings.server.mcp.validation.nameRequired'));

    await changeText(t('settings.server.mcp.add.name'), 'duplicate');
    await submit();
    expectLastNotice(t('settings.server.mcp.validation.nameDuplicate'));

    await changeText(t('settings.server.mcp.add.name'), 'local-server');
    await submit();
    expectLastNotice(t('settings.server.mcp.validation.commandRequired'));

    await changeDropdown(t('settings.server.mcp.add.type'), 'remote');
    await submit();
    expectLastNotice(t('settings.server.mcp.validation.urlRequired'));

    await changeText(t('settings.server.mcp.add.url'), 'not a url');
    await submit();
    expectLastNotice(t('settings.server.mcp.validation.urlInvalid'));

    await changeText(t('settings.server.mcp.add.url'), 'https://example.com/mcp');
    await changeText(t('settings.server.mcp.add.timeout'), '-1');
    await submit();
    expectLastNotice(t('settings.server.mcp.validation.timeoutPositive'));

    expect(plugin.openCodeService.addMcpServer).not.toHaveBeenCalled();
  });

  it('submits a valid local add-server form and resets fields', async () => {
    const plugin = createPlugin();
    const section = new SettingsMcpSection({
      plugin: plugin as unknown as OpenCodianPlugin,
      createSectionHeading,
      requestDisplayRefresh: jest.fn(),
    });
    const containerEl = document.createElement('div');

    section.attachTabbed(containerEl, 'mcp');
    await flushAsync();

    await changeText(t('settings.server.mcp.add.name'), 'local-server');
    await changeTextArea(t('settings.server.mcp.add.command'), 'npx\nserver.js');
    await changeTextArea(t('settings.server.mcp.add.environment'), 'FOO=bar\nBAR=baz');
    await changeToggle(t('settings.server.mcp.add.enabled'), false);
    await changeText(t('settings.server.mcp.add.timeout'), '45');

    await getButtonRecord(t('settings.server.mcp.add.submit'))?.onClick?.();
    await flushAsync();

    expect(plugin.openCodeService.addMcpServer).toHaveBeenCalledWith('local-server', {
      type: 'local',
      command: ['npx', 'server.js'],
      environment: { FOO: 'bar', BAR: 'baz' },
      enabled: false,
      timeout: 45,
    });
    expectLastNotice(t('settings.server.mcp.notice.added', { name: 'local-server' }));
    expect(getTextRecord(t('settings.server.mcp.add.name'))?.control.inputEl.value).toBe('');
    expect(getTextAreaRecord(t('settings.server.mcp.add.command'))?.control.inputEl.value).toBe('');
    expect(getTextAreaRecord(t('settings.server.mcp.add.environment'))?.control.inputEl.value).toBe('');
    expect(getTextRecord(t('settings.server.mcp.add.timeout'))?.control.inputEl.value).toBe('');
    expect(getToggleRecord(t('settings.server.mcp.add.enabled'))?.control.toggleEl.checked).toBe(true);
  });

  it('preserves enabled: true in add-server payload for local server', async () => {
    const plugin = createPlugin();
    const section = new SettingsMcpSection({
      plugin: plugin as unknown as OpenCodianPlugin,
      createSectionHeading,
      requestDisplayRefresh: jest.fn(),
    });
    const containerEl = document.createElement('div');

    section.attachTabbed(containerEl, 'mcp');
    await flushAsync();

    await changeText(t('settings.server.mcp.add.name'), 'enabled-local');
    await changeTextArea(t('settings.server.mcp.add.command'), 'node\nserver.js');

    await getButtonRecord(t('settings.server.mcp.add.submit'))?.onClick?.();
    await flushAsync();

    expect(plugin.openCodeService.addMcpServer).toHaveBeenCalledWith('enabled-local', {
      type: 'local',
      command: ['node', 'server.js'],
      enabled: true,
    });
  });

  it('submits remote server with OAuth configured including redirectUri', async () => {
    const plugin = createPlugin();
    const section = new SettingsMcpSection({
      plugin: plugin as unknown as OpenCodianPlugin,
      createSectionHeading,
      requestDisplayRefresh: jest.fn(),
    });
    const containerEl = document.createElement('div');

    section.attachTabbed(containerEl, 'mcp');
    await flushAsync();

    await changeDropdown(t('settings.server.mcp.add.type'), 'remote');
    await changeText(t('settings.server.mcp.add.name'), 'oauth-server');
    await changeText(t('settings.server.mcp.add.url'), 'https://mcp.example.com/mcp');
    await changeDropdown(t('settings.server.mcp.add.oauth'), 'configured');
    await changeText(t('settings.server.mcp.add.oauthClientId'), 'client-123');
    await changeText(t('settings.server.mcp.add.oauthClientSecret'), 'secret-abc');
    await changeText(t('settings.server.mcp.add.oauthScope'), 'read write');
    await changeText(t('settings.server.mcp.add.oauthRedirectUri'), 'https://app.example.com/callback');
    await changeToggle(t('settings.server.mcp.add.enabled'), false);

    await getButtonRecord(t('settings.server.mcp.add.submit'))?.onClick?.();
    await flushAsync();

    expect(plugin.openCodeService.addMcpServer).toHaveBeenCalledWith('oauth-server', {
      type: 'remote',
      url: 'https://mcp.example.com/mcp',
      oauth: {
        clientId: 'client-123',
        clientSecret: 'secret-abc',
        scope: 'read write',
        redirectUri: 'https://app.example.com/callback',
      },
      enabled: false,
    });
    expectLastNotice(t('settings.server.mcp.notice.added', { name: 'oauth-server' }));
  });

  it('keeps configured OAuth distinct from auto even when fields are blank', async () => {
    const plugin = createPlugin();
    const section = new SettingsMcpSection({
      plugin: plugin as unknown as OpenCodianPlugin,
      createSectionHeading,
      requestDisplayRefresh: jest.fn(),
    });
    const containerEl = document.createElement('div');

    section.attachTabbed(containerEl, 'mcp');
    await flushAsync();

    await changeDropdown(t('settings.server.mcp.add.type'), 'remote');
    await changeText(t('settings.server.mcp.add.name'), 'configured-blank');
    await changeText(t('settings.server.mcp.add.url'), 'https://mcp.example.com/mcp');
    await changeDropdown(t('settings.server.mcp.add.oauth'), 'configured');

    await getButtonRecord(t('settings.server.mcp.add.submit'))?.onClick?.();
    await flushAsync();

    expect(plugin.openCodeService.addMcpServer).toHaveBeenCalledWith('configured-blank', {
      type: 'remote',
      url: 'https://mcp.example.com/mcp',
      oauth: {},
      enabled: true,
    });
  });

  it('submits remote server with OAuth auto and explicit enabled: false', async () => {
    const plugin = createPlugin();
    const section = new SettingsMcpSection({
      plugin: plugin as unknown as OpenCodianPlugin,
      createSectionHeading,
      requestDisplayRefresh: jest.fn(),
    });
    const containerEl = document.createElement('div');

    section.attachTabbed(containerEl, 'mcp');
    await flushAsync();

    await changeDropdown(t('settings.server.mcp.add.type'), 'remote');
    await changeText(t('settings.server.mcp.add.name'), 'disabled-remote');
    await changeText(t('settings.server.mcp.add.url'), 'https://mcp.example.com/mcp');
    await changeToggle(t('settings.server.mcp.add.enabled'), false);

    await getButtonRecord(t('settings.server.mcp.add.submit'))?.onClick?.();
    await flushAsync();

    expect(plugin.openCodeService.addMcpServer).toHaveBeenCalledWith('disabled-remote', {
      type: 'remote',
      url: 'https://mcp.example.com/mcp',
      enabled: false,
    });
  });
});
