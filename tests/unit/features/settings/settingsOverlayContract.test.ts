import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const files = [
  'src/features/settings/settingsStyleControls.ts',
  'src/features/settings/SettingsStyleBackgroundSection.ts',
  'src/features/settings/SettingsModelIconCacheManager.ts',
  'src/features/settings/SlashCommandCatalogRenderer.ts',
  'src/features/settings/SettingsCapabilityLabSection.ts',
];

describe('settings overlay contract', () => {
  it('does not keep repo-controlled native title usage in settings modules', () => {
    for (const relativePath of files) {
      const source = readFileSync(join(process.cwd(), relativePath), 'utf8');
      expect(source).not.toMatch(/setAttribute\(['"]title['"]/);
      expect(source).not.toMatch(/\.title\s*=/);
    }
  });
});
