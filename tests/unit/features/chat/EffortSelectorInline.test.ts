/**
 * Inline effort presentation used by the combined model popover.
 *
 * The slider must expose exactly the backend's real effort options (plus the
 * inherit/off option only when the backend allows it) and route every change
 * through the same `onVariantChange` callback as the legacy popover.
 */
import { EffortSelector, type EffortSelectorCallbacks } from '../../../../src/features/chat/ui/EffortSelector';

function makeCallbacks(overrides: Partial<EffortSelectorCallbacks> = {}): EffortSelectorCallbacks {
  return {
    getVariants: () => ['low', 'medium', 'high'],
    getVariant: () => 'medium',
    onVariantChange: jest.fn(async () => {}),
    getCurrentModel: () => 'test/model',
    allowDefaultOption: () => false,
    getDefaultOptionLabel: () => 'Disabled',
    ...overrides,
  };
}

function mount(callbacks: EffortSelectorCallbacks): { selector: EffortSelector; container: HTMLElement } {
  const host = document.createElement('div');
  const selector = new EffortSelector(host, callbacks, { presentation: 'inline' });
  return { selector, container: selector.getElement() };
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function getSlider(container: HTMLElement): HTMLInputElement {
  const slider = container.querySelector<HTMLInputElement>('.opencodian-effort-slider');
  if (!slider) throw new Error('inline effort slider was not created');
  return slider;
}

describe('EffortSelector inline presentation', () => {
  it('maps a discrete slider onto the real variants and reports the selected label', () => {
    const { selector, container } = mount(makeCallbacks());

    const slider = getSlider(container);
    expect(slider.min).toBe('0');
    expect(slider.max).toBe('2');
    expect(slider.value).toBe('1');
    expect(slider.getAttribute('aria-valuetext')).toBe('Medium');
    expect(container.querySelector('.opencodian-effort-panel-output')?.textContent).toBe('Medium');
    expect(Array.from(container.querySelectorAll('.opencodian-effort-tick')).map((tick) => tick.textContent))
      .toEqual(['Low', 'Medium', 'High']);
    expect(selector.getDisplayLabel()).toBe('Medium');
  });

  it('calls onVariantChange with the real variant selected on the slider', async () => {
    let current: string | undefined = 'medium';
    const onVariantChange = jest.fn(async (variant: string | undefined) => { current = variant; });
    const { container } = mount(makeCallbacks({
      getVariant: () => current,
      onVariantChange,
    }));
    const slider = getSlider(container);

    slider.value = '2';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsync();

    expect(onVariantChange).toHaveBeenCalledWith('high');
    expect(current).toBe('high');
    expect(container.querySelector('.opencodian-effort-panel-output')?.textContent).toBe('High');
  });

  it('keeps inherit/off as an explicit first step and maps it back to undefined', async () => {
    const onVariantChange = jest.fn(async () => {});
    const { selector, container } = mount(makeCallbacks({
      getVariants: () => ['low', 'medium'],
      getVariant: () => undefined,
      allowDefaultOption: () => true,
      getDefaultOptionLabel: () => 'Inherit default',
      onVariantChange,
    }));

    const slider = getSlider(container);
    expect(slider.max).toBe('2');
    expect(slider.value).toBe('0');
    expect(slider.getAttribute('aria-valuetext')).toBe('Inherit default');
    expect(Array.from(container.querySelectorAll('.opencodian-effort-tick')).map((tick) => tick.textContent))
      .toEqual(['Inherit default', 'Low', 'Medium']);
    expect(selector.getDisplayLabel()).toBe('Inherit default');

    slider.value = '1';
    slider.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsync();
    expect(onVariantChange).toHaveBeenLastCalledWith('low');
  });

  it('does not offer the inherit/off step when the backend requires an explicit effort', () => {
    const { container } = mount(makeCallbacks({ allowDefaultOption: () => false }));

    expect(Array.from(container.querySelectorAll('.opencodian-effort-tick')).map((tick) => tick.textContent))
      .toEqual(['Low', 'Medium', 'High']);
    expect(container.querySelector('.opencodian-effort-panel-output')?.textContent).toBe('Medium');
  });

  it('renders the backend boundary hint inside the inline panel', () => {
    const { container } = mount(makeCallbacks({
      getBoundaryHint: () => 'Applies to next turn',
    }));

    const hint = container.querySelector<HTMLElement>('.opencodian-effort-panel-hint');
    expect(hint?.textContent).toBe('Applies to next turn');
    expect(hint?.classList.contains('is-hidden')).toBe(false);
  });

  it('enables the spectrum only at the highest actual option during preview and readback', () => {
    let current = 'medium';
    const { selector, container } = mount(makeCallbacks({ getVariant: () => current }));
    const slider = getSlider(container);
    expect(slider.classList.contains('is-highest')).toBe(false);

    slider.value = slider.max;
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(slider.classList.contains('is-highest')).toBe(true);
    expect(slider.getAttribute('aria-valuetext')).toBe('High');

    slider.value = '1';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(slider.classList.contains('is-highest')).toBe(false);

    current = 'high';
    selector.updateDisplay();
    expect(slider.classList.contains('is-highest')).toBe(true);
    current = 'low';
    selector.updateDisplay();
    expect(slider.classList.contains('is-highest')).toBe(false);
  });

  it('removes the highest-option spectrum when a save fails and the real value is restored', async () => {
    const { container } = mount(makeCallbacks({
      onVariantChange: jest.fn(async () => { throw new Error('save rejected'); }),
    }));
    const slider = getSlider(container);
    slider.value = slider.max;
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsync();

    expect(slider.value).toBe('1');
    expect(slider.classList.contains('is-highest')).toBe(false);
    expect(slider.getAttribute('aria-valuetext')).toBe('Medium');
    expect(container.querySelector('.opencodian-effort-panel-feedback')?.textContent).not.toBe('');
  });

  it('hides itself when the current model exposes no effort axis', () => {
    const { selector, container } = mount(makeCallbacks({ getVariants: () => [] }));

    expect(container.classList.contains('is-hidden')).toBe(true);
    expect(container.style.display).toBe('none');
    expect(selector.getDisplayLabel()).toBe('');
  });
});
