import type { OpencodeConfig, OpencodeFormatterConfig, OpencodeLspConfig } from '../types';
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

export function readLspConfigValue(
  config: OpencodeConfig,
): OpencodeLspConfig | undefined {
  const lsp = config.lsp;
  if (lsp === undefined) {
    return undefined;
  }
  if (typeof lsp === 'boolean') {
    return lsp;
  }
  return isRecord(lsp) ? cloneFormatterConfigValue(lsp) : undefined;
}

export function writeLspConfigValue(
  config: OpencodeConfig,
  lsp: OpencodeLspConfig | null | undefined,
): void {
  if (lsp === null || lsp === undefined) {
    delete config.lsp;
    return;
  }
  config.lsp = typeof lsp === 'boolean'
    ? lsp
    : isRecord(lsp)
      ? cloneFormatterConfigValue(lsp)
      : undefined;
  if (config.lsp === undefined) {
    delete config.lsp;
  }
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
