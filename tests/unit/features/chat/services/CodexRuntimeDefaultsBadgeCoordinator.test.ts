import { CodexRuntimeDefaultsBadgeCoordinator } from '../../../../../src/features/chat/services/CodexRuntimeDefaultsBadgeCoordinator';

type MockApp = {
  plugins?: {
    plugins?: {
      opencodian?: {
        settings?: {
          backendSettings?: {
            codex?: {
              networkAccessEnabled?: boolean;
              webSearchMode?: string;
              additionalDirectories?: string;
            };
          };
        };
      };
    };
  };
};

function mockGlobalApp(app: MockApp): () => void {
  const originalApp = (globalThis as { app?: MockApp }).app;
  (globalThis as { app?: MockApp }).app = app;
  return () => {
    (globalThis as { app?: MockApp }).app = originalApp;
  };
}

function mockCodexSettings(settings: {
  networkAccessEnabled?: boolean;
  webSearchMode?: string;
  additionalDirectories?: string;
}): () => void {
  return mockGlobalApp({
    plugins: {
      plugins: {
        opencodian: {
          settings: {
            backendSettings: {
              codex: settings,
            },
          },
        },
      },
    },
  });
}

describe('CodexRuntimeDefaultsBadgeCoordinator', () => {
  let restoreApp: (() => void) | null = null;

  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
    restoreApp?.();
    restoreApp = null;
  });

  it('renders nothing when all Codex runtime defaults are quiet/default', () => {
    restoreApp = mockCodexSettings({
      networkAccessEnabled: false,
      webSearchMode: 'cached',
      additionalDirectories: '',
    });
    const container = document.createElement('div');
    document.body.appendChild(container);

    const coordinator = new CodexRuntimeDefaultsBadgeCoordinator();
    coordinator.mount(container);

    expect(container.querySelector('.opencodian-codex-runtime-defaults-badge')).toBeNull();
    expect(container.style.display).toBe('none');
  });

  it('shows a network badge when network access is enabled', () => {
    restoreApp = mockCodexSettings({
      networkAccessEnabled: true,
      webSearchMode: 'cached',
      additionalDirectories: '',
    });
    const container = document.createElement('div');
    document.body.appendChild(container);

    const coordinator = new CodexRuntimeDefaultsBadgeCoordinator();
    coordinator.mount(container);

    const badge = container.querySelector<HTMLElement>('.opencodian-codex-runtime-defaults-badge[data-badge-kind="network"]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('Network');
  });

  it('shows a web search badge when web search mode differs from the default cached mode', () => {
    restoreApp = mockCodexSettings({
      networkAccessEnabled: false,
      webSearchMode: 'live',
      additionalDirectories: '',
    });
    const container = document.createElement('div');
    document.body.appendChild(container);

    const coordinator = new CodexRuntimeDefaultsBadgeCoordinator();
    coordinator.mount(container);

    const badge = container.querySelector<HTMLElement>('.opencodian-codex-runtime-defaults-badge[data-badge-kind="webSearch"]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('Web live');
  });

  it('shows a disabled web search badge when web search is explicitly disabled', () => {
    restoreApp = mockCodexSettings({
      networkAccessEnabled: false,
      webSearchMode: 'disabled',
      additionalDirectories: '',
    });
    const container = document.createElement('div');
    document.body.appendChild(container);

    const coordinator = new CodexRuntimeDefaultsBadgeCoordinator();
    coordinator.mount(container);

    const badge = container.querySelector<HTMLElement>('.opencodian-codex-runtime-defaults-badge[data-badge-kind="webSearch"]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('Web off');
  });

  it('shows an additional directories badge with count when directories are configured', () => {
    restoreApp = mockCodexSettings({
      networkAccessEnabled: false,
      webSearchMode: 'cached',
      additionalDirectories: '/tmp/context\n\n~/notes',
    });
    const container = document.createElement('div');
    document.body.appendChild(container);

    const coordinator = new CodexRuntimeDefaultsBadgeCoordinator();
    coordinator.mount(container);

    const badge = container.querySelector<HTMLElement>('.opencodian-codex-runtime-defaults-badge[data-badge-kind="additionalDirectories"]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('2 extra dir');
    expect(badge?.getAttribute('title')).toContain('/tmp/context');
    expect(badge?.getAttribute('title')).toContain('~/notes');
  });

  it('updates badges when settings change', () => {
    restoreApp = mockCodexSettings({
      networkAccessEnabled: true,
      webSearchMode: 'cached',
      additionalDirectories: '',
    });
    const container = document.createElement('div');
    document.body.appendChild(container);

    const coordinator = new CodexRuntimeDefaultsBadgeCoordinator();
    coordinator.mount(container);
    expect(container.querySelectorAll('.opencodian-codex-runtime-defaults-badge')).toHaveLength(1);

    restoreApp();
    restoreApp = mockCodexSettings({
      networkAccessEnabled: false,
      webSearchMode: 'cached',
      additionalDirectories: '',
    });
    coordinator.update();

    expect(container.querySelector('.opencodian-codex-runtime-defaults-badge')).toBeNull();
    expect(container.style.display).toBe('none');
  });

  it('removes the container on destroy and survives a later update', () => {
    restoreApp = mockCodexSettings({
      networkAccessEnabled: true,
      webSearchMode: 'cached',
      additionalDirectories: '',
    });
    const container = document.createElement('div');
    document.body.appendChild(container);

    const coordinator = new CodexRuntimeDefaultsBadgeCoordinator();
    coordinator.mount(container);
    coordinator.destroy();
    coordinator.update();

    expect(document.body.contains(container)).toBe(false);
    expect(container.querySelector('.opencodian-codex-runtime-defaults-badge')).not.toBeNull();
  });
});
