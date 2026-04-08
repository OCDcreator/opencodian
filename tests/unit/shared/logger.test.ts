import {
  createLogger,
  setDebugLoggingEnabled,
  setInlineSerializedDebugLogArgsEnabled,
} from '../../../src/shared';

describe('logger debug argument formatting', () => {
  beforeEach(() => {
    setDebugLoggingEnabled(true);
    setInlineSerializedDebugLogArgsEnabled(false);
  });

  afterEach(() => {
    setDebugLoggingEnabled(false);
    setInlineSerializedDebugLogArgsEnabled(false);
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
});
