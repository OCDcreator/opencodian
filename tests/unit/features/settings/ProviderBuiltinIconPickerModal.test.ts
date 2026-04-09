import { setLocale } from '../../../../src/i18n';
import { ProviderBuiltinIconPickerModal } from '../../../../src/features/settings/ProviderBuiltinIconPickerModal';

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
    });
  });
});
