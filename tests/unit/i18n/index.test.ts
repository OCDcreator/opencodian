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

  it('describes context totals without naming a single backend', () => {
    setLocale('en');

    expect(t('context.breakdown.note')).toContain('backend usage snapshot');
    expect(t('context.breakdown.note')).not.toContain('OpenCode usage');

    setLocale('zh');

    expect(t('context.breakdown.note')).toContain('后端返回的 usage 快照');
    expect(t('context.breakdown.note')).not.toContain('OpenCode 返回');
  });

  it('does not label verified context usage settings copy as readback', () => {
    setLocale('en');

    expect(t('settings.claudeCode.contextUsage.unavailable')).toContain('Context usage snapshots');
    expect(t('settings.claudeCode.contextUsage.summary')).toContain('Context usage snapshot');
    expect(t('settings.claudeCode.contextUsage.unavailable')).not.toContain('readback');
    expect(t('settings.claudeCode.contextUsage.summary')).not.toContain('readback');

    setLocale('zh');

    expect(t('settings.claudeCode.contextUsage.unavailable')).toContain('上下文用量快照');
    expect(t('settings.claudeCode.contextUsage.summary')).toContain('上下文用量快照');
    expect(t('settings.claudeCode.contextUsage.unavailable')).not.toContain('回读');
    expect(t('settings.claudeCode.contextUsage.summary')).not.toContain('回读');
  });
});
