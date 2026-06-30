import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Notice } from 'obsidian';

jest.mock('obsidian', () => ({
  ...jest.requireActual('obsidian'),
  Notice: jest.fn(),
}));

import type { McpServerSnapshot, McpServerStatus } from '../../../../src/core/opencode/types';
import { SettingsMcpSection } from '../../../../src/features/settings/SettingsMcpSection';
import { setLocale, t } from '../../../../src/i18n';
import type OpenCodianPlugin from '../../../../src/main';
import {
  buttonRecords,
  clearRecordArrays,
  createPlugin,
  createSectionHeading,
  flushAsync,
  mockSettingPrototype,
} from './helpers/mcpSectionTestHelpers';

describe('SettingsMcpSection', () => {
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

  it('renders MCP management panel shells for toolbar, stats, and server cards', async () => {
    const plugin = createPlugin({
      servers: { connected: { status: 'connected' } },
      updatedAt: null,
    });
    const section = new SettingsMcpSection({
      plugin: plugin as unknown as OpenCodianPlugin,
      createSectionHeading,
      requestDisplayRefresh: jest.fn(),
    });
    const containerEl = document.createElement('div');

    section.attachTabbed(containerEl, 'mcp');
    await flushAsync();

    expect(containerEl.querySelector('.opencodian-mcp-settings-shell')).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-mcp-overview-shell')).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-mcp-overview-toolbar')).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-mcp-overview-title-row')).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-mcp-overview-title')).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-mcp-overview-description')).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-mcp-overview-actions')).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-mcp-toolbar-add')).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-mcp-server-list-shell')).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-mcp-server-list-header')).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-mcp-server-list > .opencodian-settings-scrollarea-viewport')).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-settings-scrollarea-content--mcp')).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-mcp-server-card-actions')).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-mcp-server-action-grid')).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-mcp-add-form-layout')).toBeNull();
  });

  it('renders overview chips with tone dots and in-card refresh info', async () => {
    const plugin = createPlugin({
      servers: {
        connected: { status: 'connected' },
        auth: { status: 'needs_auth' },
        failed: { status: 'failed', error: 'boom' },
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

    expect(containerEl.querySelectorAll('.opencodian-mcp-overview-card-dot')).toHaveLength(4);
    expect(containerEl.querySelector('.opencodian-mcp-overview-card--success')).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-mcp-overview-card--accent')).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-mcp-overview-card--danger')).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-mcp-overview-refresh-info')?.textContent).toContain(
      t('settings.server.mcp.overview.lastRefresh'),
    );
    const titleRow = containerEl.querySelector('.opencodian-mcp-overview-title-row');
    expect(titleRow?.querySelector('.opencodian-mcp-overview--title-rail')).not.toBeNull();
  });

  it('marks runtime-only servers as unknown transport', async () => {
    const plugin = createPlugin({
      servers: { inherited: { status: 'connected' } },
      updatedAt: null,
    });
    const section = new SettingsMcpSection({
      plugin: plugin as unknown as OpenCodianPlugin,
      createSectionHeading,
      requestDisplayRefresh: jest.fn(),
    });
    const containerEl = document.createElement('div');

    section.attachTabbed(containerEl, 'mcp');
    await flushAsync();

    expect(containerEl.textContent).toContain(t('settings.server.mcp.transportUnknown'));
  });

  it('groups ownership, status, and transport chips together beside the server name', async () => {
    const plugin = createPlugin({
      servers: { inherited: { status: 'connected' } },
      updatedAt: null,
    });
    const section = new SettingsMcpSection({
      plugin: plugin as unknown as OpenCodianPlugin,
      createSectionHeading,
      requestDisplayRefresh: jest.fn(),
    });
    const containerEl = document.createElement('div');

    section.attachTabbed(containerEl, 'mcp');
    await flushAsync();

    const chipRail = containerEl.querySelector('.opencodian-mcp-server-card-chip-rail');
    expect(chipRail).not.toBeNull();
    expect(chipRail?.textContent).toContain(t('settings.server.mcp.ownership.runtimeOnly'));
    expect(chipRail?.textContent).toContain(t('settings.server.mcp.status.connected'));
    expect(chipRail?.textContent).toContain(t('settings.server.mcp.transportUnknown'));
  });

  it('does not render the wrapped helper hint for runtime-only servers without errors', async () => {
    const plugin = createPlugin({
      servers: { inherited: { status: 'connected' } },
      updatedAt: null,
    });
    const section = new SettingsMcpSection({
      plugin: plugin as unknown as OpenCodianPlugin,
      createSectionHeading,
      requestDisplayRefresh: jest.fn(),
    });
    const containerEl = document.createElement('div');

    section.attachTabbed(containerEl, 'mcp');
    await flushAsync();

    expect(containerEl.querySelector('.opencodian-mcp-server-card-status-summary')?.textContent).toContain(
      t('settings.server.mcp.card.runtimeOnlyHint'),
    );
    expect(containerEl.querySelector('.opencodian-mcp-server-card-helper')).toBeNull();
  });

  it('registers a classic settings section heading when attached outside tabbed mode', async () => {
    const plugin = createPlugin({ servers: {}, updatedAt: null });
    const requestDisplayRefresh = jest.fn();
    const createSectionHeadingSpy = jest.fn(createSectionHeading);
    const section = new SettingsMcpSection({
      plugin: plugin as unknown as OpenCodianPlugin,
      createSectionHeading: createSectionHeadingSpy,
      requestDisplayRefresh,
    });
    const containerEl = document.createElement('div');

    section.attach(containerEl);
    await flushAsync();

    expect(createSectionHeadingSpy).toHaveBeenCalledWith(
      containerEl,
      t('settings.mcp.title'),
      t('settings.quickNav.mcpDesc'),
    );
    expect(containerEl.querySelector<HTMLHeadingElement>('h3')?.textContent).toBe(
      t('settings.mcp.title'),
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

    const rows = containerEl.querySelectorAll('.opencodian-mcp-server-card');
    expect(rows).toHaveLength(3);

    const rowNames = Array.from(rows).map(
      (row) => row.querySelector('.opencodian-mcp-server-card-name')?.textContent,
    );
    expect(rowNames).toContain('my-server');
    expect(rowNames).toContain('broken');
    expect(rowNames).toContain('needs-oauth');

    const errorRow = Array.from(rows).find(
      (row) => row.querySelector('.opencodian-mcp-server-card-name')?.textContent === 'broken',
    );
    expect(errorRow?.querySelector('.opencodian-mcp-server-card-main')).not.toBeNull();
    expect(errorRow?.querySelector('.opencodian-mcp-server-card-actions')).not.toBeNull();
    expect(errorRow?.querySelector('.opencodian-mcp-server-card-helper')?.textContent).toContain(
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
    expect(refreshRecord!.control.setCta).not.toHaveBeenCalled();

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
    clearRecordArrays();
    (Notice as unknown as jest.Mock).mockClear();
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
    expect(containerEl.querySelectorAll('.opencodian-mcp-server-card')).toHaveLength(1);
  });

  it('keeps MCP server list height and scroll stable during local catalog refresh', async () => {
    jest.useFakeTimers();
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;
    let nextFrameId = 0;
    const frameTimeouts = new Map<number, number>();
    window.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
      const frameId = ++nextFrameId;
      const timeoutId = window.setTimeout(() => {
        frameTimeouts.delete(frameId);
        callback(Date.now());
      }, 0);
      frameTimeouts.set(frameId, timeoutId);
      return frameId;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = ((frameId: number): void => {
      const timeoutId = frameTimeouts.get(frameId);
      if (timeoutId === undefined) {
        return;
      }
      window.clearTimeout(timeoutId);
      frameTimeouts.delete(frameId);
    }) as typeof window.cancelAnimationFrame;

    try {
      let catalogListener: ((snapshot: { mcp: McpServerSnapshot }) => void) | null = null;
      const plugin = createPlugin({
        servers: { first: { status: 'connected' } },
        updatedAt: null,
      });
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
      document.body.appendChild(containerEl);

      section.attachTabbed(containerEl, 'mcp');
      await flushAsync();
      jest.advanceTimersByTime(1);

      const listContentEl = containerEl.querySelector<HTMLElement>('.opencodian-settings-scrollarea-content--mcp');
      expect(listContentEl).not.toBeNull();
      Object.defineProperty(listContentEl!, 'offsetHeight', {
        configurable: true,
        value: 360,
      });
      let scrollTop = 120;
      Object.defineProperty(listContentEl!, 'scrollTop', {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
          scrollTop = value;
        },
      });

      catalogListener!({
        mcp: {
          servers: {
            first: { status: 'connected' },
            second: { status: 'failed', error: 'boom' },
          },
          updatedAt: Date.now(),
        },
      });

      expect(listContentEl!.style.minHeight).toBe('360px');
      expect(listContentEl!.scrollTop).toBe(120);

      jest.advanceTimersByTime(1);

      expect(listContentEl!.style.minHeight).toBe('');
      expect(listContentEl!.scrollTop).toBe(120);
    } finally {
      window.requestAnimationFrame = originalRequestAnimationFrame;
      window.cancelAnimationFrame = originalCancelAnimationFrame;
      jest.useRealTimers();
    }
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
    expect(containerEl.querySelector('.opencodian-mcp-server-card-helper')?.textContent).toContain(
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

    expect(containerEl.querySelectorAll('.opencodian-mcp-server-card-helper.is-error')).toHaveLength(0);
  });
});

describe('SettingsMcpSection CSS contract', () => {
  it('keeps MCP management surfaces aligned with the shared settings hierarchy contract', () => {
    const css = readFileSync(
      join(process.cwd(), 'src/style/modals/config-editor-modal.css'),
      'utf8',
    );

    const findRule = (selector: string, required: string): string => (
      Array.from(css.matchAll(new RegExp(`${selector}\\s*\\{[^}]*\\}`, 'g')))
        .map((match) => match[0])
        .find((rule) => rule.includes(required)) ?? ''
    );

    const toolbarRule = findRule('\\.opencodian-mcp-overview-toolbar', 'background:');
    const shellRule = findRule('\\.opencodian-mcp-settings-shell,\\s*\\.opencodian-mcp-add-form-layout', 'gap:');
    const overviewShellRule = findRule('\\.opencodian-mcp-overview-shell', 'background:');
    const overviewCardRule = findRule('\\.opencodian-mcp-overview-card', 'background:');
    const serverCardRule = findRule(
      '\\.opencodian-mcp-server-row,\\s*\\.opencodian-mcp-server-card',
      'background:',
    );
    const serverListRule = findRule('\\.opencodian-mcp-server-list', 'overflow:');
    const mcpScrollContentRule = findRule('\\.opencodian-settings-scrollarea-content--mcp', 'gap:');
    const actionSettingRule = findRule(
      '\\.opencodian-mcp-server-row-actions \\.setting-item,\\s*\\.opencodian-mcp-server-card-actions \\.setting-item',
      'box-shadow:',
    );
    const helperRule = findRule(
      '\\.opencodian-mcp-server-row-error,\\s*\\.opencodian-mcp-server-card-helper',
      'background:',
    );
    const emptyRule = findRule('\\.opencodian-mcp-empty', 'background:');
    const detailsRule = findRule(
      '\\.opencodian-mcp-details-summary,\\s*\\.opencodian-mcp-details-section,\\s*\\.opencodian-mcp-details-technical',
      'background:',
    );
    const formGroupRule = findRule('\\.opencodian-mcp-form-group', 'background:');
    const classicOverviewShellRule = findRule(
      '\\.opencodian-settings\\[data-settings-layout-mode="classic"\\] \\.opencodian-mcp-overview-shell',
      'gap:',
    );
    const classicServerListShellRule = findRule(
      '\\.opencodian-settings\\[data-settings-layout-mode="classic"\\] \\.opencodian-mcp-server-list-shell',
      'border-top:',
    );
    const classicServerListRule = findRule(
      '\\.opencodian-settings\\[data-settings-layout-mode="classic"\\] \\.opencodian-mcp-server-list',
      'gap:',
    );
    const mcpCss = css.slice(
      css.indexOf('.opencodian-mcp-overview-shell'),
      css.indexOf('.opencodian-plugin-summary-list'),
    );
    const mcpCssWithoutBadges = mcpCss.replace(
      /\.opencodian-mcp-badge[\s\S]*?\.opencodian-mcp-transport-badge/,
      '',
    );

    expect(shellRule).toContain('var(--opencodian-settings-space-lg');
    expect(overviewShellRule).toContain('var(--opencodian-settings-inline-bg');
    expect(overviewShellRule).toContain('var(--opencodian-settings-radius-row');
    expect(toolbarRule).toContain('background: transparent');
    expect(toolbarRule).toContain('border: none');
    expect(overviewCardRule).toContain('var(--opencodian-settings-inline-border');
    expect(overviewCardRule).toContain('border-radius: 999px');
    expect(overviewCardRule).toContain('box-shadow: none');
    expect(serverCardRule).toContain('var(--opencodian-settings-form-row-bg');
    expect(serverCardRule).toContain('var(--opencodian-settings-form-row-radius');
    expect(serverCardRule).toContain('box-shadow: none');
    expect(serverListRule).toContain('overflow: hidden');
    expect(mcpScrollContentRule).toContain('var(--opencodian-settings-space-md');
    expect(actionSettingRule).toContain('background: transparent');
    expect(helperRule).toContain('var(--opencodian-settings-row-bg');
    expect(emptyRule).toContain('var(--opencodian-settings-row-bg');
    expect(detailsRule).toContain('var(--opencodian-settings-object-bg');
    expect(formGroupRule).toContain('var(--opencodian-settings-object-bg');
    expect(classicOverviewShellRule).toBe('');
    expect(classicServerListShellRule).toBe('');
    expect(classicServerListRule).toBe('');
    expect(mcpCssWithoutBadges).not.toContain('linear-gradient');
    expect(mcpCssWithoutBadges).not.toContain('backdrop-filter');
    expect(mcpCssWithoutBadges).not.toContain('transform: translateY');
    expect(mcpCssWithoutBadges).not.toMatch(/border-left:\s*[2-9]px/);
  });
});
