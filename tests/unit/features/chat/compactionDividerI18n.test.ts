import { t } from '../../../../src/i18n';

describe('compaction divider i18n keys', () => {
  it('resolves all divider label keys without fallback to raw key', () => {
    const keys = [
      'chat.compaction.divider.completed',
      'chat.compaction.divider.overflow',
      'chat.compaction.divider.autoLabel',
      'chat.compaction.divider.manualLabel',
      'chat.compaction.divider.live',
    ] as const;

    for (const key of keys) {
      const value = t(key);
      expect(value).not.toBe(key);
      expect(value.length).toBeGreaterThan(0);
    }
  });
});
