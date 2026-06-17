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

  it('shows the full Medium effort label in the compact composer control', () => {
    const { container } = mount(makeCallbacks({
      getVariant: () => 'medium',
    }));

    expect(container.querySelector('.opencodian-effort-current')?.textContent).toBe('Medium');
  });
});
