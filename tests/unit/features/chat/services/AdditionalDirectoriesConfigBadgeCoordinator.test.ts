import { AdditionalDirectoriesConfigBadgeCoordinator } from '../../../../../src/features/chat/services/AdditionalDirectoriesConfigBadgeCoordinator';

describe('AdditionalDirectoriesConfigBadgeCoordinator', () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let savedApp: any;

  beforeAll(() => {
    savedApp = (globalThis as any).app;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  afterAll(() => {
    (globalThis as any).app = savedApp;
  });

  function mockAdditionalDirectories(additionalDirectories: unknown): void {
    (globalThis as any).app = {
      plugins: {
        plugins: {
          opencodian: {
            settings: {
              backendSettings: {
                claudeCode: {
                  additionalDirectories,
                },
              },
            },
          },
        },
      },
    };
  }

  function readBadgeTooltip(badge: HTMLElement | null): string {
    expect(badge?.hasAttribute('title')).toBe(false);
    expect(badge?.classList.contains('opencodian-tooltip-trigger')).toBe(true);
    expect(badge?.getAttribute('data-tooltip-position')).toBe('top');
    return badge?.getAttribute('data-tooltip') ?? '';
  }

  it('renders a readback badge for non-empty configured directories', () => {
    mockAdditionalDirectories(['/tmp/context', ' ', '~/notes']);
    const container = document.createElement('div');
    document.body.appendChild(container);

    const coordinator = new AdditionalDirectoriesConfigBadgeCoordinator();
    coordinator.mount(container);

    const badge = container.querySelector<HTMLElement>('.opencodian-additional-directories-config-badge');
    expect(badge).not.toBeNull();
    expect(badge?.dataset.additionalDirectoryCount).toBe('2');
    expect(
      badge?.querySelector<HTMLElement>('.opencodian-additional-directories-config-badge-text')?.textContent,
    ).toBe('2 extra dirs');
    const tooltip = readBadgeTooltip(badge);
    expect(tooltip).toContain('/tmp/context');
    expect(tooltip).toContain('next query');
    expect(tooltip).toContain('not independently verified');
  });

  it('does not render for empty or malformed settings and removes stale badges on update', () => {
    mockAdditionalDirectories(['/tmp/context']);
    const container = document.createElement('div');
    document.body.appendChild(container);

    const coordinator = new AdditionalDirectoriesConfigBadgeCoordinator();
    coordinator.mount(container);
    expect(container.querySelector('.opencodian-additional-directories-config-badge')).not.toBeNull();

    mockAdditionalDirectories([' ', 42, null]);
    coordinator.update();

    expect(container.querySelector('.opencodian-additional-directories-config-badge')).toBeNull();
  });

  it('clears references on destroy without mutating already-rendered DOM', () => {
    mockAdditionalDirectories(['/tmp/context']);
    const container = document.createElement('div');
    document.body.appendChild(container);

    const coordinator = new AdditionalDirectoriesConfigBadgeCoordinator();
    coordinator.mount(container);
    coordinator.destroy();
    coordinator.update();

    expect(container.querySelector('.opencodian-additional-directories-config-badge')).not.toBeNull();
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */
});
