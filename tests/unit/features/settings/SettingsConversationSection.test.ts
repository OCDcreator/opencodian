import { SettingsConversationSection } from '../../../../src/features/settings/SettingsConversationSection';

describe('SettingsConversationSection', () => {
  it('dispose clears any registered title-model refresh callback', () => {
    let refreshTitleModelsCallback: (() => void) | undefined = () => {};
    const section = new SettingsConversationSection({
      app: {} as never,
      plugin: {
        settings: {},
      } as never,
      createSectionHeading: () => document.createElement('h2'),
      setRefreshTitleModelsCallback: (callback) => {
        refreshTitleModelsCallback = callback;
      },
    });

    section.dispose();

    expect(refreshTitleModelsCallback).toBeUndefined();
  });
});
