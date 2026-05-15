import { setLocale, t } from '../../../src/i18n';

describe('i18n interpolation', () => {
  afterEach(() => {
    setLocale('en');
  });

  it('replaces double-brace placeholders without leaving stray braces', () => {
    setLocale('zh');

    expect(t('settings.formatter.overview.summary.detected', { count: 1 })).toBe('已检测：1');
  });

  it('keeps single-brace placeholders working for existing translation keys', () => {
    setLocale('en');

    expect(t('settings.model.common.summary', { providers: 2, models: 7 })).toBe(
      '2 providers · 7 models currently selectable',
    );
  });
});
