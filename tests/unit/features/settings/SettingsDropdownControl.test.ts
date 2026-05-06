import { enhanceSettingsSelect } from '../../../../src/features/settings/SettingsDropdownControl';

function createSelect(): HTMLSelectElement {
  const selectEl = document.createElement('select');
  const presetEl = document.createElement('option');
  presetEl.value = 'preset';
  presetEl.textContent = 'Preset';
  selectEl.appendChild(presetEl);

  const refractionEl = document.createElement('option');
  refractionEl.value = 'glass-refraction';
  refractionEl.textContent = 'Glass Refraction';
  selectEl.appendChild(refractionEl);

  const liquidEl = document.createElement('option');
  liquidEl.value = 'liquid-glass';
  liquidEl.textContent = 'Liquid Glass';
  selectEl.appendChild(liquidEl);
  selectEl.value = 'preset';
  document.body.appendChild(selectEl);
  return selectEl;
}

describe('SettingsDropdownControl', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('renders a cross-platform menu below a persistent trigger', () => {
    const selectEl = createSelect();

    enhanceSettingsSelect(selectEl);

    const triggerEl = document.body.querySelector<HTMLButtonElement>('.opencodian-settings-dropdown-trigger');
    const menuEl = document.body.querySelector<HTMLElement>('.opencodian-settings-dropdown-menu');

    expect(selectEl.classList.contains('opencodian-settings-native-select')).toBe(true);
    expect(triggerEl?.textContent).toContain('Preset');
    expect(menuEl?.classList.contains('is-hidden')).toBe(true);

    triggerEl?.click();

    expect(triggerEl?.getAttribute('aria-expanded')).toBe('true');
    expect(triggerEl?.textContent).toContain('Preset');
    expect(menuEl?.classList.contains('is-hidden')).toBe(false);
    expect(menuEl?.querySelectorAll('[role="option"]')).toHaveLength(3);
    expect(menuEl?.querySelector('[aria-selected="true"]')?.textContent).toContain('Preset');
  });

  it('syncs selection back to the original select and dispatches change', () => {
    const selectEl = createSelect();
    const onChange = jest.fn();
    selectEl.addEventListener('change', onChange);

    enhanceSettingsSelect(selectEl);

    document.body.querySelector<HTMLButtonElement>('.opencodian-settings-dropdown-trigger')?.click();
    const options = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('.opencodian-settings-dropdown-option'),
    );
    options.find((optionEl) => optionEl.dataset.value === 'liquid-glass')?.click();

    expect(selectEl.value).toBe('liquid-glass');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(document.body.querySelector('.opencodian-settings-dropdown-trigger')?.textContent).toContain('Liquid Glass');
    expect(document.body.querySelector('.opencodian-settings-dropdown-menu')?.classList.contains('is-hidden')).toBe(true);
  });

  it('supports keyboard navigation and skips disabled options', () => {
    const selectEl = createSelect();
    selectEl.options[1].disabled = true;
    const onChange = jest.fn();
    selectEl.addEventListener('change', onChange);

    enhanceSettingsSelect(selectEl);

    const triggerEl = document.body.querySelector<HTMLButtonElement>('.opencodian-settings-dropdown-trigger');
    triggerEl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    triggerEl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    triggerEl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(selectEl.value).toBe('liquid-glass');
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
