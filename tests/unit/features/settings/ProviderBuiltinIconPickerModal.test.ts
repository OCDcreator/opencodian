import { ProviderBuiltinIconPickerModal } from '../../../../src/features/settings/ProviderBuiltinIconPickerModal';
import { setLocale } from '../../../../src/i18n';
import { ProviderIconService } from '../../../../src/utils/icons/ProviderIconService';

function createApp() {
  return {
    vault: {
      configDir: '.obsidian',
      adapter: {
        getResourcePath: jest.fn((targetPath: string) => `app://${targetPath}`),
      },
    },
  };
}

describe('ProviderBuiltinIconPickerModal', () => {
  beforeEach(() => {
    setLocale('en');
  });

  it('filters built-in icon cards and emits the chosen selection', async () => {
    const onChoose = jest.fn().mockResolvedValue(undefined);
    const app = createApp();
    const modal = new ProviderBuiltinIconPickerModal(app as never, {
      providerId: 'requesty',
      library: {
        requesty: [
          {
            id: 'builtin:opencode:requesty',
            type: 'builtin',
            source: 'opencode:requesty',
            addedAt: 1,
          },
        ],
      },
      onChoose,
    });
    (modal as unknown as { app: unknown }).app = app;

    modal.onOpen();

    const searchInput = modal.contentEl.querySelector<HTMLInputElement>('.opencodian-builtin-icon-picker-search-input');
    expect(searchInput).not.toBeNull();

    searchInput!.value = 'requesty';
    searchInput!.dispatchEvent(new Event('input'));

    const cards = Array.from(modal.contentEl.querySelectorAll<HTMLButtonElement>('.opencodian-builtin-icon-picker-card'));
    expect(cards.length).toBeGreaterThan(0);
    expect(cards[0]?.textContent).toContain('Requesty');
    expect(cards[0]?.classList.contains('is-selected')).toBe(true);

    cards[0]?.click();

    await Promise.resolve();
    expect(onChoose).toHaveBeenCalledWith({
      libraryId: 'opencode',
      iconId: 'requesty',
      variant: 'auto',
    });
  });

  it('filters LobeHub cards by requested variant and emits that variant', async () => {
    const onChoose = jest.fn().mockResolvedValue(undefined);
    const app = createApp();
    const library = ProviderIconService.selectBuiltinIcon({
      providerId: 'adobe',
      libraryId: 'lobehub',
      iconId: 'adobe',
      library: {},
      variant: 'color',
    });
    const modal = new ProviderBuiltinIconPickerModal(app as never, {
      providerId: 'adobe',
      library,
      onChoose,
    });
    (modal as unknown as { app: unknown }).app = app;

    modal.onOpen();

    const variantSelect = Array.from(modal.contentEl.querySelectorAll<HTMLSelectElement>('select'))
      .find((selectEl) => Boolean(selectEl.querySelector('option[value="color"]')));
    expect(variantSelect).not.toBeNull();
    variantSelect!.value = 'color';
    variantSelect!.dispatchEvent(new Event('change'));

    const searchInput = modal.contentEl.querySelector<HTMLInputElement>('.opencodian-builtin-icon-picker-search-input');
    searchInput!.value = 'adobe';
    searchInput!.dispatchEvent(new Event('input'));

    const cards = Array.from(modal.contentEl.querySelectorAll<HTMLButtonElement>('.opencodian-builtin-icon-picker-card'));
    expect(cards.length).toBeGreaterThan(0);
    expect(cards[0]?.textContent).toContain('Adobe');
    expect(cards[0]?.textContent).toContain('Color');

    cards[0]?.click();

    await Promise.resolve();
    expect(onChoose).toHaveBeenCalledWith({
      libraryId: 'lobehub',
      iconId: 'adobe',
      variant: 'color',
    });
  });
});
