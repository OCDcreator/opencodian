/**
 * Tests for EffortSelector boundary hint rendering.
 *
 * The Codex effort selector only affects subsequent thread
 * creation/resume, not the already-bound live thread. The boundary
 * hint makes this honest on the chat surface.
 */
import { EffortSelector, type EffortSelectorCallbacks } from '../../../../src/features/chat/ui/EffortSelector';

function makeCallbacks(overrides: Partial<EffortSelectorCallbacks> = {}): EffortSelectorCallbacks {
  return {
    getVariants: () => ['low', 'medium', 'high'],
    getVariant: () => 'medium',
    onVariantChange: async () => {},
    getCurrentModel: () => 'codex/default',
    allowDefaultOption: () => false,
    getDefaultOptionLabel: () => 'Disabled',
    ...overrides,
  };
}

function mount(callbacks: EffortSelectorCallbacks): { selector: EffortSelector; container: HTMLElement } {
  const container = document.createElement('div');
  const selector = new EffortSelector(container, callbacks);
  return { selector, container };
}

function mockRect(element: HTMLElement, left: number, right: number): void {
  jest.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    left, right, top: 700, bottom: 730, width: right - left, height: 30, x: left, y: 700, toJSON: () => ({}),
  });
}

describe('EffortSelector boundary hint', () => {
  it('renders a boundary hint when getBoundaryHint returns a string', () => {
    const { container } = mount(makeCallbacks({
      getBoundaryHint: () => 'Applies to next turn',
    }));

    const hint = container.querySelector('.opencodian-effort-boundary-hint');
    expect(hint).not.toBeNull();
    expect(hint?.textContent).toBe('Applies to next turn');
  });

  it('does not render a boundary hint when getBoundaryHint is undefined', () => {
    const { container } = mount(makeCallbacks());

    const hint = container.querySelector('.opencodian-effort-boundary-hint');
    expect(hint).toBeNull();
  });

  it('does not render a boundary hint when getBoundaryHint returns empty string', () => {
    const { container } = mount(makeCallbacks({
      getBoundaryHint: () => '',
    }));

    const hint = container.querySelector('.opencodian-effort-boundary-hint');
    expect(hint).toBeNull();
  });

  it('sets title attribute on the group element when boundary hint is provided', () => {
    const { container } = mount(makeCallbacks({
      getBoundaryHint: () => 'Applies to next turn',
    }));

    const group = container.querySelector('.opencodian-effort-group');
    expect(group?.getAttribute('title')).toBe('Applies to next turn');
  });

  it('does not set title attribute when no boundary hint is provided', () => {
    const { container } = mount(makeCallbacks());

    const group = container.querySelector('.opencodian-effort-group');
    expect(group?.getAttribute('title')).toBeFalsy();
  });

  it('updates the hint after updateDisplay when boundary hint changes', () => {
    let hintText = 'Applies to next turn';
    const { container, selector } = mount(makeCallbacks({
      getBoundaryHint: () => hintText,
    }));

    expect(container.querySelector('.opencodian-effort-boundary-hint')?.textContent).toBe('Applies to next turn');

    hintText = 'Next message only';
    selector.updateDisplay();

    expect(container.querySelector('.opencodian-effort-boundary-hint')?.textContent).toBe('Next message only');
  });

  it('clamps the effort menu from its right edge when opened with the keyboard', () => {
    const boundary = document.createElement('div');
    boundary.className = 'opencodian-container';
    document.body.appendChild(boundary);
    const { container, selector } = mount(makeCallbacks());
    boundary.appendChild(container);

    const gears = container.querySelector<HTMLElement>('.opencodian-effort-gears');
    const current = container.querySelector<HTMLElement>('.opencodian-effort-current');
    const options = container.querySelector<HTMLElement>('.opencodian-effort-options');
    if (!gears || !current || !options) {
      throw new Error('expected mounted effort selector');
    }
    mockRect(boundary, 100, 320);
    mockRect(gears, 260, 300);
    Object.defineProperty(options, 'scrollWidth', { configurable: true, value: 180 });

    current.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(options.style.left).toBe('-140px');
    expect(options.style.width).toBe('180px');
    expect(options.style.minWidth).toBe('60px');
    selector.destroy();
  });
});
