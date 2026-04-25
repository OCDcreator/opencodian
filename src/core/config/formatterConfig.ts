import type { OpencodeConfig, OpencodeFormatterConfig } from '../types';
import { isRecord } from './modelConfig';

export function readFormatterConfigValue(
  config: OpencodeConfig,
): OpencodeFormatterConfig | undefined {
  const formatter = config.formatter;
  if (formatter === undefined) {
    return undefined;
  }
  if (typeof formatter === 'boolean') {
    return formatter;
  }
  return isRecord(formatter) ? cloneFormatterConfigValue(formatter) : undefined;
}

export function writeFormatterConfigValue(
  config: OpencodeConfig,
  formatter: OpencodeFormatterConfig | null | undefined,
): void {
  if (formatter === null || formatter === undefined) {
    delete config.formatter;
    return;
  }
  config.formatter = typeof formatter === 'boolean'
    ? formatter
    : isRecord(formatter)
      ? cloneFormatterConfigValue(formatter)
      : undefined;
  if (config.formatter === undefined) {
    delete config.formatter;
  }
}

function cloneFormatterConfigValue<T>(value: T): T {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? value : JSON.parse(serialized) as T;
}
