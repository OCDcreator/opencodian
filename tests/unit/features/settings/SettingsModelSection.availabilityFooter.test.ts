import { SettingsModelSection } from '../../../../src/features/settings/SettingsModelSection';
import { t } from '../../../../src/i18n';

describe('SettingsModelSection availability footer', () => {
  it('requests footer placement for the model availability description', () => {
    const createSettingsBlock = jest.fn((hostEl: HTMLElement) => hostEl.createDiv());
    const section = new SettingsModelSection({
      app: {} as never,
      plugin: {
        modelConfigService: {},
        settings: {
          modelSourceMode: 'merge',
          modelAvailabilitySectionOpen: true,
          modelToolsSectionOpen: true,
        },
        scheduleSettingsUiStateSave: jest.fn(),
      } as never,
      createSectionHeading: (hostEl, title) => hostEl.createEl('h2', { text: title }),
      createSettingsBlock,
      setSettingDescWithFormatting: () => undefined,
      applyInlineCodeText: () => undefined,
      refreshTitleModels: () => undefined,
      setRefreshModelsCallback: () => undefined,
      setRefreshModelCatalogStatusCallback: () => undefined,
      getServerState: () => ({ healthy: false, status: 'stopped' }),
      setServerState: () => undefined,
    });

    jest.spyOn(section as never, 'attachCommonSettings').mockImplementation(() => undefined);
    jest.spyOn(section as never, 'bootstrapModelSection').mockResolvedValue(undefined);

    section.attach(document.createElement('div'));

    expect(createSettingsBlock).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({
        title: t('settings.model.availability.title'),
        collapsible: true,
        descriptionPlacement: 'footer',
      }),
    );
  });
});
