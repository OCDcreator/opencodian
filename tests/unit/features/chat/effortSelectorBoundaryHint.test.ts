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

function findObsidianNativeTooltipOwner(trigger: Element): HTMLElement | null {
  return trigger.closest<HTMLElement>('[aria-label], [title]');
}

function getAccessibleCarrier(current: Element | null): HTMLElement | null {
  const labelId = current?.getAttribute('aria-labelledby');
  return labelId ? current.querySelector<HTMLElement>(`#${labelId}`) : null;
}

describe('EffortSelector boundary hint', () => {
  it('keeps the effort label and boundary hint in the custom tooltip instead of visible toolbar text', () => {
    const { container } = mount(makeCallbacks({
      getBoundaryHint: () => 'Applies to next turn',
    }));

    const group = container.querySelector('.opencodian-effort-group');
    const current = container.querySelector('.opencodian-effort-current');
    const currentValue = current?.querySelector('.opencodian-effort-current-value');
    const accessibleCarrier = getAccessibleCarrier(current);
    const expected = 'Effort: Medium. Controls how much reasoning budget the model spends before answering. Higher effort can be slower or costlier, but can help complex tasks. Applies to next turn';
    expect(container.querySelector('.opencodian-effort-label')).toBeNull();
    expect(container.querySelector('.opencodian-effort-boundary-hint')).toBeNull();
    expect(currentValue?.textContent).toBe('Medium');
    expect(group?.getAttribute('aria-label')).toBeNull();
    expect(group?.getAttribute('data-tooltip')).toBeNull();
    expect(current?.getAttribute('data-tooltip')).toBe(expected);
    expect(current?.getAttribute('data-tooltip-position')).toBe('top');
    expect(current?.getAttribute('aria-label')).toBeNull();
    expect(current?.getAttribute('aria-labelledby')).toBe(accessibleCarrier?.id);
    expect(accessibleCarrier?.textContent).toBe(expected);
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
    const accessibleCarrier = getAccessibleCarrier(current);
    const expected = 'Effort: Medium. Controls how much reasoning budget the model spends before answering. Higher effort can be slower or costlier, but can help complex tasks. Applies to next turn';
    expect(group?.getAttribute('aria-label')).toBeNull();
    expect(group?.getAttribute('data-tooltip')).toBeNull();
    expect(current?.getAttribute('data-tooltip')).toBe(expected);
    expect(current?.getAttribute('aria-label')).toBeNull();
    expect(current?.getAttribute('aria-labelledby')).toBe(accessibleCarrier?.id);
    expect(accessibleCarrier?.textContent).toBe(expected);
    expect(group?.getAttribute('title')).toBeNull();
    expect(current?.getAttribute('title')).toBeNull();
  });

  it('still exposes the effort meaning through accessible metadata when no boundary hint is provided', () => {
    const { container } = mount(makeCallbacks());

    const group = container.querySelector('.opencodian-effort-group');
    const current = container.querySelector('.opencodian-effort-current');
    const accessibleCarrier = getAccessibleCarrier(current);
    const expected = 'Effort: Medium. Controls how much reasoning budget the model spends before answering. Higher effort can be slower or costlier, but can help complex tasks.';
    expect(group?.getAttribute('aria-label')).toBeNull();
    expect(group?.getAttribute('data-tooltip')).toBeNull();
    expect(current?.getAttribute('data-tooltip')).toBe(expected);
    expect(current?.getAttribute('aria-label')).toBeNull();
    expect(current?.getAttribute('aria-labelledby')).toBe(accessibleCarrier?.id);
    expect(accessibleCarrier?.textContent).toBe(expected);
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
    expect(getAccessibleCarrier(container.querySelector('.opencodian-effort-current'))?.textContent).toBe(
      'Effort: Medium. Controls how much reasoning budget the model spends before answering. Higher effort can be slower or costlier, but can help complex tasks. Next message only',
    );
  });

  it('shows the full Medium effort label in the compact composer control', () => {
    const { container } = mount(makeCallbacks({
      getVariant: () => 'medium',
    }));

    expect(container.querySelector('.opencodian-effort-current-value')?.textContent).toBe('Medium');
  });

  it('gives effort choices radio-menu semantics without tooltips covering the options', () => {
    const { container } = mount(makeCallbacks());

    const gears = Array.from(container.querySelectorAll<HTMLElement>('.opencodian-effort-gear'));

    expect(gears.map(gear => gear.textContent)).toEqual(['High', 'Medium', 'Low']);
    expect(gears.every(gear => gear.getAttribute('role') === 'menuitemradio')).toBe(true);
    expect(gears.map(gear => gear.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
    expect(gears.every(gear => !gear.hasAttribute('data-tooltip'))).toBe(true);
  });

  it('supports keyboard selection, Escape and Tab without leaking Escape to the host', async () => {
    let variant = 'medium';
    const onVariantChange = jest.fn(async (value: string | undefined) => { variant = value ?? ''; });
    const { container, selector } = mount(makeCallbacks({ getVariant: () => variant, onVariantChange }));
    document.body.appendChild(container);
    const trigger = container.querySelector<HTMLElement>('.opencodian-effort-current')!;
    const hostEscape = jest.fn();
    document.addEventListener('keydown', hostEscape);
    trigger.focus();
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    const selected = container.querySelector<HTMLElement>('[aria-checked="true"]')!;
    expect(document.activeElement).toBe(selected);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    selected.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    expect(document.activeElement?.textContent).toBe('Low');
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    await Promise.resolve(); await Promise.resolve();
    expect(onVariantChange).toHaveBeenCalledWith('low');
    const nextTrigger = container.querySelector<HTMLElement>('.opencodian-effort-current')!;
    expect(document.activeElement).toBe(nextTrigger);
    nextTrigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    expect(document.activeElement?.textContent).toBe('Low');
    hostEscape.mockClear();
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(nextTrigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(nextTrigger);
    expect(hostEscape).not.toHaveBeenCalled();
    nextTrigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(nextTrigger.getAttribute('aria-expanded')).toBe('false');
    document.removeEventListener('keydown', hostEscape);
    selector.destroy();
    container.remove();
  });

  it('keeps every custom tooltip trigger outside Obsidian native tooltip ownership', () => {
    const { container } = mount(makeCallbacks({
      getBoundaryHint: () => 'Applies to next turn',
    }));

    const triggers = Array.from(
      container.querySelectorAll<HTMLElement>('.opencodian-tooltip-trigger[data-tooltip]'),
    );

    expect(triggers).not.toHaveLength(0);
    expect(triggers.map(findObsidianNativeTooltipOwner)).toEqual(
      triggers.map(() => null),
    );
  });

  it('does not reclaim focus when the user leaves during an async save', async () => {
    let resolveSave: () => void = () => {};
    const onVariantChange = jest.fn(() => new Promise<void>((resolve) => { resolveSave = resolve; }));
    const { container, selector } = mount(makeCallbacks({ onVariantChange }));
    const nextControl = document.createElement('button');
    nextControl.textContent = 'Next control';
    document.body.append(container, nextControl);
    const trigger = container.querySelector<HTMLElement>('.opencodian-effort-current')!;
    trigger.focus();
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    const selected = container.querySelector<HTMLElement>('[aria-checked="true"]')!;
    selected.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    nextControl.focus();
    resolveSave();
    await Promise.resolve(); await Promise.resolve();

    expect(onVariantChange).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(nextControl);
    selector.destroy();
    container.remove();
    nextControl.remove();
  });

  it('prevents duplicate saves and keeps a failed choice open for retry', async () => {
    let rejectSave: (reason: Error) => void = () => {};
    const onVariantChange = jest.fn(() => new Promise<void>((_resolve, reject) => { rejectSave = reject; }));
    const { container, selector } = mount(makeCallbacks({ onVariantChange }));
    document.body.appendChild(container);
    const trigger = container.querySelector<HTMLElement>('.opencodian-effort-current')!;
    trigger.click();
    const choice = container.querySelector<HTMLElement>('[role="menuitemradio"]')!;
    choice.click();
    choice.click();
    expect(onVariantChange).toHaveBeenCalledTimes(1);
    rejectSave(new Error('save failed'));
    await Promise.resolve(); await Promise.resolve();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('.opencodian-effort-feedback')?.textContent).toBe('Could not save the reasoning level. Try again.');
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
    selector.destroy();
    container.remove();
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
