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
  it('keeps the effort label and boundary hint in the custom tooltip instead of visible toolbar text', () => {
    const { container } = mount(makeCallbacks({
      getBoundaryHint: () => 'Applies to next turn',
    }));

    const group = container.querySelector('.opencodian-effort-group');
    const current = container.querySelector('.opencodian-effort-current');
    expect(container.querySelector('.opencodian-effort-label')).toBeNull();
    expect(container.querySelector('.opencodian-effort-boundary-hint')).toBeNull();
    expect(current?.textContent).toBe('Medium');
    expect(group?.getAttribute('aria-label')).toBe(
      'Effort: Medium. Controls how much reasoning budget the model spends before answering. Higher effort can be slower or costlier, but can help complex tasks. Applies to next turn',
    );
    expect(group?.getAttribute('data-tooltip')).toBeNull();
    expect(current?.getAttribute('data-tooltip')).toBe(
      'Effort: Medium. Controls how much reasoning budget the model spends before answering. Higher effort can be slower or costlier, but can help complex tasks. Applies to next turn',
    );
    expect(current?.getAttribute('data-tooltip-position')).toBe('top');
    expect(group?.getAttribute('title')).toBeNull();
    expect(current?.getAttribute('title')).toBeNull();
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

  it('sets accessible metadata without native title when boundary hint is provided', () => {
    const { container } = mount(makeCallbacks({
      getBoundaryHint: () => 'Applies to next turn',
    }));

    const group = container.querySelector('.opencodian-effort-group');
    const current = container.querySelector('.opencodian-effort-current');
    const expected = 'Effort: Medium. Controls how much reasoning budget the model spends before answering. Higher effort can be slower or costlier, but can help complex tasks. Applies to next turn';
    expect(group?.getAttribute('aria-label')).toBe(expected);
    expect(group?.getAttribute('data-tooltip')).toBeNull();
    expect(current?.getAttribute('data-tooltip')).toBe(expected);
    expect(group?.getAttribute('title')).toBeNull();
    expect(current?.getAttribute('title')).toBeNull();
  });

  it('still exposes the effort meaning through accessible metadata when no boundary hint is provided', () => {
    const { container } = mount(makeCallbacks());

    const group = container.querySelector('.opencodian-effort-group');
    const current = container.querySelector('.opencodian-effort-current');
    const expected = 'Effort: Medium. Controls how much reasoning budget the model spends before answering. Higher effort can be slower or costlier, but can help complex tasks.';
    expect(group?.getAttribute('aria-label')).toBe(expected);
    expect(group?.getAttribute('data-tooltip')).toBeNull();
    expect(current?.getAttribute('data-tooltip')).toBe(expected);
    expect(group?.getAttribute('title')).toBeNull();
    expect(current?.getAttribute('title')).toBeNull();
  });

  it('updates the hint after updateDisplay when boundary hint changes', () => {
    let hintText = 'Applies to next turn';
    const { container, selector } = mount(makeCallbacks({
      getBoundaryHint: () => hintText,
    }));

    expect(container.querySelector('.opencodian-effort-current')?.getAttribute('data-tooltip')).toBe(
      'Effort: Medium. Controls how much reasoning budget the model spends before answering. Higher effort can be slower or costlier, but can help complex tasks. Applies to next turn',
    );

    hintText = 'Next message only';
    selector.updateDisplay();

    expect(container.querySelector('.opencodian-effort-current')?.getAttribute('data-tooltip')).toBe(
      'Effort: Medium. Controls how much reasoning budget the model spends before answering. Higher effort can be slower or costlier, but can help complex tasks. Next message only',
    );
  });

  it('shows the full Medium effort label in the compact composer control', () => {
    const { container } = mount(makeCallbacks({
      getVariant: () => 'medium',
    }));

    expect(container.querySelector('.opencodian-effort-current')?.textContent).toBe('Medium');
  });

  it('gives each dropdown option its own tooltip so hover changes the shared tooltip content', () => {
    const { container } = mount(makeCallbacks());

    const gears = Array.from(container.querySelectorAll<HTMLElement>('.opencodian-effort-gear'));

    expect(gears.map(gear => gear.textContent)).toEqual(['High', 'Medium', 'Low']);
    expect(gears.map(gear => gear.getAttribute('data-tooltip'))).toEqual([
      'Choose High effort. Controls how much reasoning budget the model spends before answering.',
      'Choose Medium effort. Controls how much reasoning budget the model spends before answering.',
      'Choose Low effort. Controls how much reasoning budget the model spends before answering.',
    ]);
    expect(gears.every(gear => gear.classList.contains('opencodian-tooltip-trigger'))).toBe(true);
    expect(gears.every(gear => gear.getAttribute('data-tooltip-position') === 'left')).toBe(true);
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
