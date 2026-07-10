/* eslint-disable max-lines-per-function -- MCP action coverage keeps shared Obsidian Setting and modal mocks together with backend-switch regressions. */
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
  clearRecordArrays,
  createPlugin,
  createSectionHeading,
  flushAsync,
  getButtonRecord,
  mockSettingPrototype,
} from './helpers/mcpSectionTestHelpers';

jest.mock('../../../../src/features/settings/McpServerEditorModal', () => ({
  McpServerEditorModal: jest.fn().mockImplementation((_app, options) => ({
    open: jest.fn(() => {
      options.onSaved?.({
        mode: options.mode,
        name: options.serverName ?? 'mock-server',
        config: options.existingEntry ?? { type: 'local', command: ['node'] },
      });
    }),
  })),
}));

jest.mock('../../../../src/features/settings/McpServerStatusModal', () => ({
  ...jest.requireActual('../../../../src/features/settings/McpServerStatusModal'),
  McpServerStatusModal: jest.fn().mockImplementation(() => ({
    open: jest.fn(),
  })),
}));

import { McpServerEditorModal } from '../../../../src/features/settings/McpServerEditorModal';
import { McpServerStatusModal } from '../../../../src/features/settings/McpServerStatusModal';

describe('SettingsMcpSection server actions', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
    clearRecordArrays();
    (Notice as unknown as jest.Mock).mockClear();
    (McpServerEditorModal as unknown as jest.Mock).mockClear();
    (McpServerStatusModal as unknown as jest.Mock).mockClear();
    mockSettingPrototype();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows card actions and runtime status per server card', async () => {
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
    expect(buttonRecords.filter((record) => record.label === t('settings.server.mcp.action.monitor'))).toHaveLength(5);
    expect(getButtonRecord(t('settings.server.mcp.action.authenticate'))).toBeDefined();
    expect(getButtonRecord(t('settings.server.mcp.action.clearAuth'))).toBeDefined();
    expect(containerEl.textContent).toContain(t('settings.server.mcp.card.runtimeOnlyHint'));

    expect(containerEl.querySelectorAll('.opencodian-mcp-server-card')).toHaveLength(5);
    expect(containerEl.querySelectorAll('.opencodian-mcp-server-card-actions')).toHaveLength(5);
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

  it('blocks stale runtime actions after switching away from OpenCode backend', async () => {
    const plugin = createPlugin({
      servers: {
        connected: { status: 'connected' },
        disabled: { status: 'disabled' },
      },
      updatedAt: 1700000000000,
    }) as unknown as OpenCodianPlugin & {
      settings: { activeBackend: string; enabledBackends: string[] };
    };
    plugin.settings = {
      activeBackend: 'opencode',
      enabledBackends: ['opencode', 'claude-code'],
    };
    const section = new SettingsMcpSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: jest.fn(),
    });
    const containerEl = document.createElement('div');

    section.attachTabbed(containerEl, 'mcp');
    await flushAsync();
    (plugin.openCodeService.refreshMcpServerStatus as jest.Mock).mockClear();
    plugin.settings.activeBackend = 'claude-code';

    await getButtonRecord(t('settings.server.mcp.action.connect'))?.onClick?.();
    await getButtonRecord(t('settings.server.mcp.action.disconnect'))?.onClick?.();
    await flushAsync();

    expect(plugin.openCodeService.connectMcpServer).not.toHaveBeenCalled();
    expect(plugin.openCodeService.disconnectMcpServer).not.toHaveBeenCalled();
    expect(plugin.openCodeService.refreshMcpServerStatus).not.toHaveBeenCalled();
    expect(Notice).toHaveBeenLastCalledWith(t('settings.server.mcp.notice.openCodeOnly'));
  });

  it('opens add and monitor modals from the management panel', async () => {
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

    await getButtonRecord(t('settings.server.mcp.add.submit'))?.onClick?.();
    await getButtonRecord(t('settings.server.mcp.action.monitor'))?.onClick?.();

    expect(McpServerEditorModal).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      mode: 'add',
    }));
    expect(McpServerStatusModal).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      name: 'connected',
      status: { status: 'connected' },
    }));
  });

  it('blocks stale toolbar refresh and add actions after switching away from OpenCode backend', async () => {
    const plugin = createPlugin({
      servers: { connected: { status: 'connected' } },
      updatedAt: 1700000000000,
    }) as unknown as OpenCodianPlugin & {
      settings: { activeBackend: string; enabledBackends: string[] };
    };
    plugin.settings = {
      activeBackend: 'opencode',
      enabledBackends: ['opencode', 'claude-code'],
    };
    const section = new SettingsMcpSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: jest.fn(),
    });
    const containerEl = document.createElement('div');

    section.attachTabbed(containerEl, 'mcp');
    await flushAsync();
    (plugin.openCodeService.refreshMcpServerStatus as jest.Mock).mockClear();
    plugin.settings.activeBackend = 'claude-code';

    await getButtonRecord(t('settings.server.mcp.refresh'))?.onClick?.();
    await getButtonRecord(t('settings.server.mcp.add.submit'))?.onClick?.();
    await flushAsync();

    expect(plugin.openCodeService.refreshMcpServerStatus).not.toHaveBeenCalled();
    expect(McpServerEditorModal).not.toHaveBeenCalled();
    expect(Notice).toHaveBeenLastCalledWith(t('settings.server.mcp.notice.openCodeOnly'));
  });

  it('redacts sensitive runtime action errors in notices', async () => {
    const plugin = createPlugin({
      servers: { disabled: { status: 'disabled' } },
      updatedAt: 1700000000000,
    });
    (plugin.openCodeService.connectMcpServer as jest.Mock).mockRejectedValue(
      new Error('token=abc123'),
    );
    const section = new SettingsMcpSection({
      plugin: plugin as unknown as OpenCodianPlugin,
      createSectionHeading,
      requestDisplayRefresh: jest.fn(),
    });
    const containerEl = document.createElement('div');

    section.attachTabbed(containerEl, 'mcp');
    await flushAsync();

    await getButtonRecord(t('settings.server.mcp.action.connect'))?.onClick?.();
    await flushAsync();

    const noticeMock = Notice as unknown as jest.Mock;
    expect(String(noticeMock.mock.calls.at(-1)?.[0] ?? '')).not.toContain('abc123');
  });

  it('refreshes runtime state after deleting a project-owned server', async () => {
    const plugin = createPlugin({
      servers: { connected: { status: 'connected' } },
      updatedAt: 1700000000000,
    });
    (plugin.openCodeService.refreshMcpServerStatus as jest.Mock).mockClear();
    (plugin.opencodeConfigManager.exists as jest.Mock).mockResolvedValue(false);
    (plugin.opencodeConfigManager.read as jest.Mock).mockResolvedValue({
      mcp: {
        connected: {
          type: 'remote',
          url: 'https://mcp.example.com/mcp',
        },
      },
    });
    (plugin.opencodeConfigManager.write as jest.Mock).mockResolvedValue(undefined);
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const section = new SettingsMcpSection({
      plugin: plugin as unknown as OpenCodianPlugin,
      createSectionHeading,
      requestDisplayRefresh: jest.fn(),
    });
    const containerEl = document.createElement('div');

    section.attachTabbed(containerEl, 'mcp');
    await flushAsync();
    await flushAsync();
    (plugin.openCodeService.refreshMcpServerStatus as jest.Mock).mockClear();

    const deleteRecord = getButtonRecord(t('settings.server.mcp.action.delete'));
    expect(deleteRecord).toBeDefined();
    await deleteRecord?.onClick?.();
    await flushAsync();

    expect(confirmSpy).toHaveBeenCalled();
    expect(plugin.openCodeService.disconnectMcpServer).toHaveBeenCalledWith('connected');
    expect(plugin.openCodeService.refreshMcpServerStatus).toHaveBeenCalledTimes(2);
  });

  it('blocks stale project delete after switching away from OpenCode backend', async () => {
    const plugin = createPlugin({
      servers: { connected: { status: 'connected' } },
      updatedAt: 1700000000000,
    }) as unknown as OpenCodianPlugin & {
      settings: { activeBackend: string; enabledBackends: string[] };
    };
    plugin.settings = {
      activeBackend: 'opencode',
      enabledBackends: ['opencode', 'claude-code'],
    };
    (plugin.opencodeConfigManager.exists as jest.Mock).mockResolvedValue(false);
    (plugin.opencodeConfigManager.read as jest.Mock).mockResolvedValue({
      mcp: {
        connected: {
          type: 'remote',
          url: 'https://mcp.example.com/mcp',
        },
      },
    });
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const section = new SettingsMcpSection({
      plugin,
      createSectionHeading,
      requestDisplayRefresh: jest.fn(),
    });
    const containerEl = document.createElement('div');

    section.attachTabbed(containerEl, 'mcp');
    await flushAsync();
    await flushAsync();
    (plugin.openCodeService.refreshMcpServerStatus as jest.Mock).mockClear();
    plugin.settings.activeBackend = 'claude-code';

    await getButtonRecord(t('settings.server.mcp.action.delete'))?.onClick?.();
    await flushAsync();

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(plugin.openCodeService.disconnectMcpServer).not.toHaveBeenCalled();
    expect(plugin.opencodeConfigManager.write).not.toHaveBeenCalled();
    expect(plugin.openCodeService.refreshMcpServerStatus).not.toHaveBeenCalled();
    expect(Notice).toHaveBeenLastCalledWith(t('settings.server.mcp.notice.openCodeOnly'));
  });
});
