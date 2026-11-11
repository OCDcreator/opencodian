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

  it('reports the fill progress as a unitless fraction clamped to [0,1]', () => {
    // The track gradient resolves the fraction inside calc(... * var(--progress));
    // a percent/unit string would make that calc invalid and break fill alignment.
    const { container } = mount(makeCallbacks());
    const slider = getSlider(container);
    const progressOf = () => slider.style.getPropertyValue('--opencodian-effort-progress');

    expect(progressOf()).toBe('0.5000');

    slider.value = '0';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(progressOf()).toBe('0.0000');

    slider.value = '2';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(progressOf()).toBe('1.0000');
  });

  it('keeps the inherit/off first step at fraction 0 and a single choice fully filled', () => {
    const { container } = mount(makeCallbacks({
      getVariants: () => ['low'],
      getVariant: () => undefined,
      allowDefaultOption: () => true,
      getDefaultOptionLabel: () => 'Inherit default',
    }));
    const slider = getSlider(container);
    expect(slider.style.getPropertyValue('--opencodian-effort-progress')).toBe('0.0000');
    expect(slider.disabled).toBe(false);

    const single = mount(makeCallbacks({ getVariants: () => ['low'], getVariant: () => 'low' }));
    const singleSlider = getSlider(single.container);
    expect(singleSlider.disabled).toBe(true);
    expect(singleSlider.style.getPropertyValue('--opencodian-effort-progress')).toBe('1.0000');
  });
});

/**
 * Switching effort must stay local to the effort control: the focused slider
 * is never natively disabled (Chromium blurs a disabled focused control to
 * <body>, which toggles every ancestor :focus-within style), the same slider
 * node survives the save, and nothing outside the control receives focus.
 *
 * jsdom does not reproduce Chromium's blur-on-disable, so the discriminating
 * assertion here is the native `disabled` property staying false while busy;
 * the real focus/ring behaviour is verified against the live plugin.
 */
describe('EffortSelector inline save keeps focus and updates locally', () => {
  const attached: HTMLElement[] = [];

  function mountAttached(callbacks: EffortSelectorCallbacks): { selector: EffortSelector; container: HTMLElement } {
    const host = document.createElement('div');
    document.body.appendChild(host);
    attached.push(host);
    const selector = new EffortSelector(host, callbacks, { presentation: 'inline' });
    return { selector, container: selector.getElement() };
  }

  /** A save the test settles by hand, so the pending window is observable. */
  function deferredSave(state: { current: string | undefined }) {
    const pending: { resolve?: () => void; reject?: (error: Error) => void } = {};
    const onVariantChange = jest.fn((variant: string | undefined) => new Promise<void>((resolve, reject) => {
      pending.resolve = () => { state.current = variant; resolve(); };
      pending.reject = reject;
    }));
    return { onVariantChange, pending };
  }

  function outputText(container: HTMLElement): string | null | undefined {
    return container.querySelector('.opencodian-effort-panel-output')?.textContent;
  }

  afterEach(() => {
    while (attached.length) attached.pop()?.remove();
  });

  it('keeps the focused slider enabled, focused and the same node across a pending save', async () => {
    const state: { current: string | undefined } = { current: 'medium' };
    const { onVariantChange, pending } = deferredSave(state);
    const editor = document.createElement('textarea');
    document.body.appendChild(editor);
    attached.push(editor);
    const { selector, container } = mountAttached(makeCallbacks({ getVariant: () => state.current, onVariantChange }));
    const slider = getSlider(container);
    const panel = container.querySelector<HTMLElement>('.opencodian-effort-panel');

    slider.focus();
    expect(document.activeElement).toBe(slider);
    slider.value = '2';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsync();

    // Pending: busy is announced through ARIA only, focus is untouched.
    expect(onVariantChange).toHaveBeenCalledTimes(1);
    expect(slider.disabled).toBe(false);
    expect(slider.getAttribute('aria-disabled')).toBe('true');
    expect(panel?.getAttribute('aria-busy')).toBe('true');
    expect(document.activeElement).toBe(slider);

    pending.resolve?.();
    await flushAsync();

    expect(slider.disabled).toBe(false);
    expect(slider.hasAttribute('aria-disabled')).toBe(false);
    expect(panel?.hasAttribute('aria-busy')).toBe(false);
    expect(getSlider(container)).toBe(slider);
    expect(slider.isConnected).toBe(true);
    expect(document.activeElement).toBe(slider);
    expect(document.activeElement).not.toBe(editor);
    expect(slider.value).toBe('2');
    expect(outputText(container)).toBe('High');
    expect(selector.getDisplayLabel()).toBe('High');
  });

  it('drops extra input and change while a save is pending without a second save or a fake preview', async () => {
    const state: { current: string | undefined } = { current: 'medium' };
    const { onVariantChange, pending } = deferredSave(state);
    const onDisplayChange = jest.fn();
    const { selector, container } = mountAttached(makeCallbacks({
      getVariant: () => state.current,
      onVariantChange,
      onDisplayChange,
    }));
    const slider = getSlider(container);
    const panel = container.querySelector<HTMLElement>('.opencodian-effort-panel');
    onDisplayChange.mockClear();

    slider.focus();
    slider.value = '2';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsync();
    expect(onVariantChange).toHaveBeenCalledTimes(1);

    // A second gesture lands while the first save is still in flight.
    slider.value = '0';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(outputText(container)).not.toBe('Low');
    expect(slider.getAttribute('aria-valuetext')).not.toBe('Low');
    slider.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsync();

    // No re-entry, and the control shows the host readback, not the dropped gesture.
    expect(onVariantChange).toHaveBeenCalledTimes(1);
    expect(slider.value).toBe('1');
    expect(outputText(container)).toBe('Medium');
    expect(selector.getDisplayLabel()).toBe('Medium');
    // The resync must not clear the busy state of the save still in flight.
    expect(panel?.getAttribute('aria-busy')).toBe('true');
    expect(slider.getAttribute('aria-disabled')).toBe('true');
    expect(slider.disabled).toBe(false);
    expect(onDisplayChange).not.toHaveBeenCalled();

    pending.resolve?.();
    await flushAsync();

    expect(onVariantChange).toHaveBeenCalledWith('high');
    expect(slider.value).toBe('2');
    expect(outputText(container)).toBe('High');
    // One display notification for the one completed save: no doubled render.
    expect(onDisplayChange).toHaveBeenCalledTimes(1);
    expect(panel?.hasAttribute('aria-busy')).toBe(false);
    expect(document.activeElement).toBe(slider);
  });

  it('restores the real value with feedback and keeps focus when a pending save fails', async () => {
    const state: { current: string | undefined } = { current: 'medium' };
    const { onVariantChange, pending } = deferredSave(state);
    const onDisplayChange = jest.fn();
    const { selector, container } = mountAttached(makeCallbacks({
      getVariant: () => state.current,
      onVariantChange,
      onDisplayChange,
    }));
    const slider = getSlider(container);
    const panel = container.querySelector<HTMLElement>('.opencodian-effort-panel');
    onDisplayChange.mockClear();

    slider.focus();
    slider.value = '2';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsync();
    expect(outputText(container)).toBe('High');

    pending.reject?.(new Error('save rejected'));
    await flushAsync();

    expect(state.current).toBe('medium');
    expect(slider.value).toBe('1');
    expect(outputText(container)).toBe('Medium');
    expect(slider.getAttribute('aria-valuetext')).toBe('Medium');
    expect(selector.getDisplayLabel()).toBe('Medium');
    expect(container.querySelector('.opencodian-effort-panel-feedback')?.textContent).not.toBe('');
    expect(slider.disabled).toBe(false);
    expect(slider.hasAttribute('aria-disabled')).toBe(false);
    expect(panel?.hasAttribute('aria-busy')).toBe(false);
    expect(onDisplayChange).toHaveBeenCalledTimes(1);
    expect(getSlider(container)).toBe(slider);
    expect(document.activeElement).toBe(slider);
  });

  it('keeps native disabled only for a single inert choice, with no busy state while idle', () => {
    const { container } = mountAttached(makeCallbacks({ getVariants: () => ['low'], getVariant: () => 'low' }));
    const slider = getSlider(container);

    expect(slider.disabled).toBe(true);
    expect(slider.hasAttribute('aria-disabled')).toBe(false);
    expect(container.querySelector('.opencodian-effort-panel')?.hasAttribute('aria-busy')).toBe(false);
  });
});

describe('EffortSelector host variant labels', () => {
  const INHERIT = 'Inherit default (Off)';
  const EXPLICIT_OFF = 'Thinking disabled';

  function inheritOffCallbacks(state: { current: string | undefined }, onVariantChange: jest.Mock) {
    return makeCallbacks({
      getVariants: () => ['off', 'low', 'max'],
      getVariant: () => state.current,
      allowDefaultOption: () => true,
      getDefaultOptionLabel: () => INHERIT,
      getVariantLabel: (variant) => (variant === 'off' ? EXPLICIT_OFF : undefined),
      onVariantChange,
    });
  }

  it('labels inherit and explicit off differently while saving undefined and "off" as distinct values', async () => {
    const state: { current: string | undefined } = { current: undefined };
    const onVariantChange = jest.fn(async (variant: string | undefined) => { state.current = variant; });
    const { selector, container } = mount(inheritOffCallbacks(state, onVariantChange));
    const slider = getSlider(container);
    const tickLabels = () => Array.from(container.querySelectorAll('.opencodian-effort-tick')).map((tick) => tick.textContent);

    // Two adjacent steps, two different labels: neither is a duplicate of the other.
    expect(tickLabels()).toEqual([INHERIT, EXPLICIT_OFF, 'Low', 'Max']);
    expect(slider.value).toBe('0');
    expect(selector.getDisplayLabel()).toBe(INHERIT);

    slider.value = '1';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(slider.getAttribute('aria-valuetext')).toBe(EXPLICIT_OFF);
    slider.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsync();

    // The label is presentational only: the persisted value is the raw variant.
    expect(onVariantChange).toHaveBeenLastCalledWith('off');
    expect(state.current).toBe('off');
    expect(selector.getDisplayLabel()).toBe(EXPLICIT_OFF);
    expect(container.querySelector('.opencodian-effort-panel-output')?.textContent).toBe(EXPLICIT_OFF);

    slider.value = '0';
    slider.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsync();

    expect(onVariantChange).toHaveBeenLastCalledWith(undefined);
    expect(state.current).toBeUndefined();
    expect(selector.getDisplayLabel()).toBe(INHERIT);
  });

  it('restores the saved step for an explicit off, an inherited value and an unmapped level', () => {
    const state: { current: string | undefined } = { current: 'off' };
    const { selector, container } = mount(inheritOffCallbacks(state, jest.fn(async () => {})));
    const slider = getSlider(container);
    expect(slider.value).toBe('1');
    expect(slider.getAttribute('aria-valuetext')).toBe(EXPLICIT_OFF);

    state.current = undefined;
    selector.updateDisplay();
    expect(slider.value).toBe('0');
    expect(slider.getAttribute('aria-valuetext')).toBe(INHERIT);

    // Unmapped variants keep the built-in capitalization on every display path.
    state.current = 'max';
    selector.updateDisplay();
    expect(slider.value).toBe('3');
    expect(slider.getAttribute('aria-valuetext')).toBe('Max');
    expect(selector.getDisplayLabel()).toBe('Max');
  });

  it('falls back to the built-in label when the host returns a blank or missing label', () => {
    const { selector, container } = mount(makeCallbacks({
      getVariants: () => ['off', 'xhigh', 'custom-tier'],
      getVariant: () => 'xhigh',
      getVariantLabel: (variant) => (variant === 'off' ? '   ' : variant === 'xhigh' ? '' : undefined),
    }));

    const labels = Array.from(container.querySelectorAll('.opencodian-effort-tick')).map((tick) => tick.textContent);
    expect(labels).toEqual(['Off', 'Xhigh', 'Custom-tier']);
    expect(labels.every((label) => (label ?? '').trim().length > 0)).toBe(true);
    expect(selector.getDisplayLabel()).toBe('Xhigh');
  });

  it('uses the same host labels in the legacy popover menu and its current value', () => {
    const host = document.createElement('div');
    const selector = new EffortSelector(host, inheritOffCallbacks({ current: 'off' }, jest.fn(async () => {})));
    const container = selector.getElement();

    expect(container.querySelector('.opencodian-effort-current-value')?.textContent).toBe(EXPLICIT_OFF);
    // The popover lists higher levels first; the inherit option stays on top.
    expect(Array.from(container.querySelectorAll('[role="menuitemradio"]')).map((option) => option.textContent))
      .toEqual([INHERIT, 'Max', 'Low', EXPLICIT_OFF]);
    expect(container.querySelector('[role="menuitemradio"][aria-checked="true"]')?.textContent).toBe(EXPLICIT_OFF);
    expect(selector.getDisplayLabel()).toBe(EXPLICIT_OFF);
    selector.destroy();
  });
});
