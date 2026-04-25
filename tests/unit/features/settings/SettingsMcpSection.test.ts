import { Setting } from 'obsidian';

import type { McpServerSnapshot, McpServerStatus } from '../../../../src/core/opencode/types';
import { SettingsMcpSection } from '../../../../src/features/settings/SettingsMcpSection';
import { setLocale, t } from '../../../../src/i18n';
import type OpenCodianPlugin from '../../../../src/main';

interface MockButtonControl {
  buttonEl: HTMLButtonElement;
  onClick: jest.MockedFunction<(callback: () => void | Promise<void>) => MockButtonControl>;
  setButtonText: jest.MockedFunction<(value: string) => MockButtonControl>;
  setCta: jest.MockedFunction<() => MockButtonControl>;
  setDisabled: jest.MockedFunction<(value: boolean) => MockButtonControl>;
}

interface ButtonRecord {
  control: MockButtonControl;
  name: string;
  onClick?: () => void | Promise<void>;
}

type McpSectionPlugin = Pick<OpenCodianPlugin, 'openCodeService'>;

const buttonRecords: ButtonRecord[] = [];

function createButtonRecord(name: string): ButtonRecord {
  const record: ButtonRecord = {
    name,
    control: {
      buttonEl: document.createElement('button'),
      onClick: jest.fn(),
      setButtonText: jest.fn(),
      setCta: jest.fn(),
      setDisabled: jest.fn(),
    },
  };
  record.control.onClick.mockImplementation((callback) => {
    record.onClick = callback;
    return record.control;
  });
  record.control.setButtonText.mockReturnValue(record.control);
  record.control.setCta.mockReturnValue(record.control);
  record.control.setDisabled.mockReturnValue(record.control);
  return record;
}

function createPlugin(snapshot?: Partial<McpServerSnapshot>): McpSectionPlugin {
  const currentSnapshot: McpServerSnapshot = {
    servers: {},
    updatedAt: null,
    ...snapshot,
  };

  return {
    openCodeService: {
      getMcpServerSnapshot: jest.fn().mockReturnValue(currentSnapshot),
      refreshMcpServerStatus: jest.fn().mockResolvedValue(currentSnapshot.servers),
      subscribeToCatalogUpdates: jest.fn().mockReturnValue(jest.fn()),
    } as unknown as McpSectionPlugin['openCodeService'],
  };
}

function createSectionHeading(containerEl: HTMLElement, title: string): HTMLHeadingElement {
  const headingEl = document.createElement('h3');
  headingEl.textContent = title;
  containerEl.appendChild(headingEl);
  return headingEl;
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function mockSettingPrototype(): void {
  jest.spyOn(Setting.prototype, 'setName').mockImplementation(function setName(this: Setting) {
    return this;
  });
  jest.spyOn(Setting.prototype, 'setDesc').mockImplementation(function setDesc(this: Setting) {
    return this;
  });
  jest.spyOn(Setting.prototype, 'addButton').mockImplementation(function addButton(
    this: Setting,
    callback: (control: MockButtonControl) => unknown,
  ) {
    const record = createButtonRecord('');
    buttonRecords.push(record);
    callback(record.control);
    return this;
  });
}

describe('SettingsMcpSection', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
    buttonRecords.length = 0;
    mockSettingPrototype();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders overview cards with zero servers on empty snapshot', async () => {
    const plugin = createPlugin({ servers: {}, updatedAt: null });
    const requestDisplayRefresh = jest.fn();
    const section = new SettingsMcpSection({
      plugin: plugin as unknown as OpenCodianPlugin,
      createSectionHeading,
      requestDisplayRefresh,
    });
    const containerEl = document.createElement('div');

    section.attachTabbed(containerEl, 'mcp');
    await flushAsync();

    expect(containerEl.querySelector('.opencodian-mcp-overview')).not.toBeNull();
    const cards = containerEl.querySelectorAll('.opencodian-mcp-overview-card');
    expect(cards).toHaveLength(4);

    const values = Array.from(cards).map((card) => card.querySelector('.opencodian-mcp-overview-card-value')?.textContent);
    expect(values).toEqual(['0', '0', '0', '0']);

    expect(containerEl.querySelector('.opencodian-mcp-empty')?.textContent).toBe(
      t('settings.server.mcp.empty'),
    );
  });

  it('renders overview counts and server rows from runtime snapshot', async () => {
    const servers: Record<string, McpServerStatus> = {
      'my-server': { status: 'connected' },
      'broken': { status: 'failed', error: 'connection refused' },
      'needs-oauth': { status: 'needs_auth' },
    };
    const plugin = createPlugin({ servers, updatedAt: 1700000000000 });
    const section = new SettingsMcpSection({
      plugin: plugin as unknown as OpenCodianPlugin,
      createSectionHeading,
      requestDisplayRefresh: jest.fn(),
    });
    const containerEl = document.createElement('div');

    section.attachTabbed(containerEl, 'mcp');
    await flushAsync();

    const values = Array.from(
      containerEl.querySelectorAll('.opencodian-mcp-overview-card-value'),
    ).map((el) => el.textContent);
    expect(values).toEqual(['3', '1', '1', '1']);

    const rows = containerEl.querySelectorAll('.opencodian-mcp-server-row');
    expect(rows).toHaveLength(3);

    const rowNames = Array.from(rows).map(
      (row) => row.querySelector('.opencodian-mcp-server-row-name')?.textContent,
    );
    expect(rowNames).toContain('my-server');
    expect(rowNames).toContain('broken');
    expect(rowNames).toContain('needs-oauth');

    const errorRow = Array.from(rows).find(
      (row) => row.querySelector('.opencodian-mcp-server-row-name')?.textContent === 'broken',
    );
    expect(errorRow?.querySelector('.opencodian-mcp-server-row-error')?.textContent).toContain(
      'connection refused',
    );
  });

  it('triggers MCP status refresh on attach', async () => {
    const plugin = createPlugin();
    const section = new SettingsMcpSection({
      plugin: plugin as unknown as OpenCodianPlugin,
      createSectionHeading,
      requestDisplayRefresh: jest.fn(),
    });
    const containerEl = document.createElement('div');

    section.attachTabbed(containerEl, 'mcp');
    await flushAsync();

    expect(plugin.openCodeService.refreshMcpServerStatus).toHaveBeenCalledTimes(1);
  });

  it('renders a refresh button and disables it during refresh', async () => {
    let resolveRefresh: () => void = () => {};
    const plugin = createPlugin();
    (plugin.openCodeService.refreshMcpServerStatus as jest.Mock).mockImplementation(
      () => new Promise<void>((resolve) => {
        resolveRefresh = resolve;
      }),
    );
    const section = new SettingsMcpSection({
      plugin: plugin as unknown as OpenCodianPlugin,
      createSectionHeading,
      requestDisplayRefresh: jest.fn(),
    });
    const containerEl = document.createElement('div');

    section.attachTabbed(containerEl, 'mcp');

    await flushAsync();

    const refreshRecord = buttonRecords[0];
    expect(refreshRecord).toBeDefined();
    expect(refreshRecord!.control.setCta).toHaveBeenCalled();

    await refreshRecord!.onClick?.();
    expect(refreshRecord!.control.setDisabled).toHaveBeenCalledWith(true);

    resolveRefresh();
    await flushAsync();

    expect(refreshRecord!.control.setDisabled).toHaveBeenCalledWith(false);
  });
});

describe('SettingsMcpSection subscriptions and status', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
    buttonRecords.length = 0;
    mockSettingPrototype();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('subscribes to catalog updates and re-renders on change', async () => {
    let catalogListener: ((snapshot: { mcp: McpServerSnapshot }) => void) | null = null;
    const plugin = createPlugin({ servers: {}, updatedAt: null });
    (plugin.openCodeService.subscribeToCatalogUpdates as jest.Mock).mockImplementation(
      (listener: (snapshot: { mcp: McpServerSnapshot }) => void) => {
        catalogListener = listener;
        return jest.fn();
      },
    );
    const section = new SettingsMcpSection({
      plugin: plugin as unknown as OpenCodianPlugin,
      createSectionHeading,
      requestDisplayRefresh: jest.fn(),
    });
    const containerEl = document.createElement('div');

    section.attachTabbed(containerEl, 'mcp');
    await flushAsync();

    expect(containerEl.querySelector('.opencodian-mcp-empty')).not.toBeNull();

    expect(catalogListener).not.toBeNull();
    catalogListener!({
      mcp: {
        servers: {
          'new-server': { status: 'connected' },
        },
        updatedAt: Date.now(),
      },
    });

    expect(containerEl.querySelector('.opencodian-mcp-empty')).toBeNull();
    expect(containerEl.querySelectorAll('.opencodian-mcp-server-row')).toHaveLength(1);
  });

  it('cleans up catalog subscription on dispose', async () => {
    const unsubscribe = jest.fn();
    const plugin = createPlugin();
    (plugin.openCodeService.subscribeToCatalogUpdates as jest.Mock).mockReturnValue(unsubscribe);
    const section = new SettingsMcpSection({
      plugin: plugin as unknown as OpenCodianPlugin,
      createSectionHeading,
      requestDisplayRefresh: jest.fn(),
    });
    const containerEl = document.createElement('div');

    section.attachTabbed(containerEl, 'mcp');
    await flushAsync();

    expect(unsubscribe).not.toHaveBeenCalled();

    section.dispose();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('renders status badges with correct CSS classes', async () => {
    const servers: Record<string, McpServerStatus> = {
      'connected-srv': { status: 'connected' },
      'disabled-srv': { status: 'disabled' },
      'failed-srv': { status: 'failed', error: 'err' },
      'auth-srv': { status: 'needs_auth' },
    };
    const plugin = createPlugin({ servers, updatedAt: 1700000000000 });
    const section = new SettingsMcpSection({
      plugin: plugin as unknown as OpenCodianPlugin,
      createSectionHeading,
      requestDisplayRefresh: jest.fn(),
    });
    const containerEl = document.createElement('div');

    section.attachTabbed(containerEl, 'mcp');
    await flushAsync();

    const badges = containerEl.querySelectorAll('.opencodian-mcp-badge');
    expect(badges).toHaveLength(4);

    const badgeClasses = Array.from(badges).map((b) =>
      Array.from(b.classList).filter((c) => c.startsWith('opencodian-mcp-badge--')).join(' '),
    );
    expect(badgeClasses).toContain('opencodian-mcp-badge--connected');
    expect(badgeClasses).toContain('opencodian-mcp-badge--disabled');
    expect(badgeClasses).toContain('opencodian-mcp-badge--failed');
    expect(badgeClasses).toContain('opencodian-mcp-badge--needs-auth');
  });

  it('renders needs_client_registration status with error', async () => {
    const servers: Record<string, McpServerStatus> = {
      'reg-srv': { status: 'needs_client_registration', error: 'missing clientId' },
    };
    const plugin = createPlugin({ servers, updatedAt: 1700000000000 });
    const section = new SettingsMcpSection({
      plugin: plugin as unknown as OpenCodianPlugin,
      createSectionHeading,
      requestDisplayRefresh: jest.fn(),
    });
    const containerEl = document.createElement('div');

    section.attachTabbed(containerEl, 'mcp');
    await flushAsync();

    expect(containerEl.querySelector('.opencodian-mcp-badge--needs-client-registration')).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-mcp-server-row-error')?.textContent).toContain(
      'missing clientId',
    );
  });

  it('does not show error row for connected or disabled servers', async () => {
    const servers: Record<string, McpServerStatus> = {
      'ok-srv': { status: 'connected' },
      'off-srv': { status: 'disabled' },
    };
    const plugin = createPlugin({ servers, updatedAt: 1700000000000 });
    const section = new SettingsMcpSection({
      plugin: plugin as unknown as OpenCodianPlugin,
      createSectionHeading,
      requestDisplayRefresh: jest.fn(),
    });
    const containerEl = document.createElement('div');

    section.attachTabbed(containerEl, 'mcp');
    await flushAsync();

    expect(containerEl.querySelectorAll('.opencodian-mcp-server-row-error')).toHaveLength(0);
  });
});
