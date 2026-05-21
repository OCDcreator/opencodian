import {
  clearRecentLogs,
  createLogger,
  getRecentLogEntries,
  getRecentLogTextForEntries,
  resetLogEmissionThrottleState,
  resolveLoggerDebugModuleKey,
  setClaudeCodeDebugChannelSettings,
  setDebugLoggingEnabled,
  setDebugModuleEnabled,
  setDebugRefreshIntervalMs,
  setInlineSerializedDebugLogArgsEnabled,
  shouldEmitLogFingerprint,
} from '../../../src/shared';
import { DEFAULT_DEBUG_REFRESH_INTERVAL_MS } from '../../../src/shared/debugModules';

describe('logger debug argument formatting', () => {
  beforeEach(() => {
    setDebugLoggingEnabled(true);
    setDebugModuleEnabled('contextUsage', true);
    setClaudeCodeDebugChannelSettings(undefined);
    setInlineSerializedDebugLogArgsEnabled(false);
    setDebugRefreshIntervalMs(DEFAULT_DEBUG_REFRESH_INTERVAL_MS);
    resetLogEmissionThrottleState();
    clearRecentLogs();
  });

  afterEach(() => {
    setDebugLoggingEnabled(false);
    setDebugModuleEnabled('contextUsage', true);
    setClaudeCodeDebugChannelSettings(undefined);
    setInlineSerializedDebugLogArgsEnabled(false);
    setDebugRefreshIntervalMs(DEFAULT_DEBUG_REFRESH_INTERVAL_MS);
    resetLogEmissionThrottleState();
    clearRecentLogs();
    jest.restoreAllMocks();
  });

  it('keeps object payloads as separate console arguments by default', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const logger = createLogger('LoggerTest');
    const payload = { foo: 'bar' };

    logger.debug('Payload', payload);

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy.mock.calls[0]?.[0]).toContain('[LoggerTest] Payload');
    expect(consoleSpy.mock.calls[0]?.[1]).toBe(payload);
  });

  it('inlines serialized non-string debug payloads when the toggle is enabled', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const logger = createLogger('LoggerTest');

    setInlineSerializedDebugLogArgsEnabled(true);
    logger.debug('Payload', { foo: 'bar' }, 7, false);

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy.mock.calls[0]).toHaveLength(1);
    expect(consoleSpy.mock.calls[0]?.[0]).toContain('[LoggerTest] Payload {"foo":"bar"} 7 false');
  });

  it('does not change non-debug console argument formatting', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const logger = createLogger('LoggerTest');
    const payload = { foo: 'bar' };

    setInlineSerializedDebugLogArgsEnabled(true);
    logger.info('Payload', payload);

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy.mock.calls[0]?.[0]).toContain('[LoggerTest] Payload');
    expect(consoleSpy.mock.calls[0]?.[1]).toBe(payload);
  });

  it('keeps info/debug quiet unless global and module debug logging are both enabled', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const logger = createLogger('ActiveTabContextUsageCoordinator');

    setDebugLoggingEnabled(false);
    logger.info('hidden info');
    logger.debug('hidden debug');

    setDebugLoggingEnabled(true);
    setDebugModuleEnabled('contextUsage', false);
    logger.info('module hidden info');
    logger.debug('module hidden debug');

    setDebugModuleEnabled('contextUsage', true);
    logger.info('visible info');
    logger.debug('visible debug');

    expect(consoleSpy.mock.calls.map((call) => String(call[0]))).toEqual([
      expect.stringContaining('[ActiveTabContextUsageCoordinator] visible info'),
      expect.stringContaining('[ActiveTabContextUsageCoordinator] visible debug'),
    ]);
  });

  it('routes Claude Code scopes to the Claude Code debug module', () => {
    expect(resolveLoggerDebugModuleKey('ClaudeCodeAdapter')).toBe('claudeCode');
    expect(resolveLoggerDebugModuleKey('claude-code-session')).toBe('claudeCode');
    expect(resolveLoggerDebugModuleKey('Claude Code Stream')).toBe('claudeCode');
  });

  it('stores optional log channels for diagnostic filtering', () => {
    const logger = createLogger('ClaudeCodeAdapter', { moduleKey: 'claudeCode', channel: 'runtime' });

    logger.debug('SDK query creation', { source: 'model-catalog' });

    const entries = getRecentLogEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      scope: 'ClaudeCodeAdapter',
      moduleKey: 'claudeCode',
      channel: 'runtime',
    });
    expect(getRecentLogTextForEntries(entries)).toContain('[claudeCode] [runtime] [ClaudeCodeAdapter]');
  });

  it('gates optional Claude Code logs by diagnostic channel', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const runtimeLogger = createLogger('ClaudeCodeAdapter', { moduleKey: 'claudeCode', channel: 'runtime' });
    const streamLogger = createLogger('ClaudeCodeStreamNormalizer', { moduleKey: 'claudeCode', channel: 'stream' });

    setClaudeCodeDebugChannelSettings({
      runtime: false,
      sessions: true,
      stream: true,
      permissions: true,
      mcp: true,
      experimental: false,
    });
    runtimeLogger.debug('hidden runtime');
    streamLogger.debug('visible stream');

    const entries = getRecentLogEntries();
    const logText = entries.map((entry) => entry.message).join('\n');
    expect(logText).toContain('visible stream');
    expect(logText).not.toContain('hidden runtime');
    expect(entries).toEqual([expect.objectContaining({ channel: 'stream' })]);
    expect(consoleSpy.mock.calls.map((call) => String(call[0])).join('\n')).toContain('visible stream');
    expect(consoleSpy.mock.calls.map((call) => String(call[0])).join('\n')).not.toContain('hidden runtime');
  });

  it('emits always/warn/error even when optional module logs are disabled', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const logger = createLogger('ActiveTabContextUsageCoordinator');

    setDebugLoggingEnabled(false);
    setDebugModuleEnabled('contextUsage', false);

    logger.always('startup marker');
    logger.warn('warning marker');
    logger.error('error marker');

    expect(logSpy.mock.calls[0]?.[0]).toContain('[ActiveTabContextUsageCoordinator] startup marker');
    expect(warnSpy.mock.calls[0]?.[0]).toContain('[ActiveTabContextUsageCoordinator] warning marker');
    expect(errorSpy.mock.calls[0]?.[0]).toContain('[ActiveTabContextUsageCoordinator] error marker');
  });

  it('can clear the recent diagnostic log buffer', () => {
    const logger = createLogger('LoggerTest');

    logger.always('captured');
    expect(getRecentLogEntries()).toHaveLength(1);

    clearRecentLogs();

    expect(getRecentLogEntries()).toHaveLength(0);
  });

  it('suppresses identical fingerprints until the configured refresh interval passes', () => {
    jest.spyOn(Date, 'now')
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1200)
      .mockReturnValueOnce(1300)
      .mockReturnValueOnce(2100);
    setDebugRefreshIntervalMs(1000);

    expect(shouldEmitLogFingerprint('context-usage-refresh', 'same')).toBe(true);
    expect(shouldEmitLogFingerprint('context-usage-refresh', 'same')).toBe(false);
    expect(shouldEmitLogFingerprint('context-usage-refresh', 'changed')).toBe(true);
    expect(shouldEmitLogFingerprint('context-usage-refresh', 'changed')).toBe(false);
  });
});
