import type { OpencodeMcpEntryConfig } from '../../core/types';
import { t } from '../../i18n';

export const MCP_REDACTED_VALUE = '[redacted]';

export function parseMcpKvPairs(text: string): Array<[string, string]> {
  return text.split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const eqIndex = line.indexOf('=');
      if (eqIndex === -1) {
        return [line, ''];
      }
      return [line.substring(0, eqIndex).trim(), line.substring(eqIndex + 1)];
    });
}

export function parseMcpKvPairsToRecord(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of parseMcpKvPairs(text)) {
    if (key) {
      result[key] = value;
    }
  }
  return result;
}

export interface AddFormState {
  type: 'local' | 'remote';
  name: string;
  command: string;
  environment: string;
  enabled: boolean;
  timeout: string;
  url: string;
  headers: string;
  oauthMode: 'auto' | 'disabled' | 'configured';
  oauthClientId: string;
  oauthClientSecret: string;
  oauthScope: string;
  oauthRedirectUri: string;
  originalEnvironment: Record<string, string>;
  originalHeaders: Record<string, string>;
  originalOauthClientSecret: string | null;
}

export interface McpFormValidationOptions {
  existingNames?: string[];
  originalName?: string;
}

export function createDefaultMcpFormState(): AddFormState {
  return {
    type: 'local',
    name: '',
    command: '',
    environment: '',
    enabled: true,
    timeout: '',
    url: '',
    headers: '',
    oauthMode: 'auto',
    oauthClientId: '',
    oauthClientSecret: '',
    oauthScope: '',
    oauthRedirectUri: '',
    originalEnvironment: {},
    originalHeaders: {},
    originalOauthClientSecret: null,
  };
}

function recordToKvText(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return '';
  }
  return Object.entries(value as Record<string, unknown>)
    .map(([key]) => `${key}=${MCP_REDACTED_VALUE}`)
    .join('\n');
}

export function mcpEntryToFormState(name: string, entry: OpencodeMcpEntryConfig): AddFormState {
  const oauth = entry.oauth;
  const oauthRecord = oauth && typeof oauth === 'object' && !Array.isArray(oauth)
    ? oauth as Record<string, unknown>
    : {};
  const originalEnvironment = isStringRecord(entry.environment);
  const originalHeaders = isStringRecord(entry.headers);
  const originalOauthClientSecret = typeof oauthRecord.clientSecret === 'string'
    ? oauthRecord.clientSecret
    : null;
  return {
    ...createDefaultMcpFormState(),
    type: entry.type === 'remote' ? 'remote' : 'local',
    name,
    command: Array.isArray(entry.command) ? entry.command.join('\n') : '',
    environment: recordToKvText(entry.environment),
    enabled: entry.enabled !== false,
    timeout: typeof entry.timeout === 'number' ? String(entry.timeout) : '',
    url: typeof entry.url === 'string' ? entry.url : '',
    headers: recordToKvText(entry.headers),
    oauthMode: oauth === false ? 'disabled' : oauth && typeof oauth === 'object' ? 'configured' : 'auto',
    oauthClientId: typeof oauthRecord.clientId === 'string' ? oauthRecord.clientId : '',
    oauthClientSecret: originalOauthClientSecret ? MCP_REDACTED_VALUE : '',
    oauthScope: typeof oauthRecord.scope === 'string' ? oauthRecord.scope : '',
    oauthRedirectUri: typeof oauthRecord.redirectUri === 'string' ? oauthRecord.redirectUri : '',
    originalEnvironment,
    originalHeaders,
    originalOauthClientSecret,
  };
}

function isStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

export function validateMcpFormState(
  state: AddFormState,
  options: McpFormValidationOptions = {},
): string | null {
  const name = state.name.trim();
  if (!name) {
    return t('settings.server.mcp.validation.nameRequired');
  }

  if (
    name !== options.originalName
    && options.existingNames?.includes(name)
  ) {
    return t('settings.server.mcp.validation.nameDuplicate');
  }

  if (state.type === 'local') {
    const commandLines = state.command
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (commandLines.length === 0) {
      return t('settings.server.mcp.validation.commandRequired');
    }
    const envKeys = parseMcpKvPairs(state.environment);
    if (envKeys.some(([key]) => key.length === 0)) {
      return t('settings.server.mcp.validation.emptyKey', {
        field: t('settings.server.mcp.add.environment'),
      });
    }
  }

  if (state.type === 'remote') {
    if (!state.url.trim()) {
      return t('settings.server.mcp.validation.urlRequired');
    }
    try {
      // eslint-disable-next-line no-new
      new URL(state.url.trim());
    } catch {
      return t('settings.server.mcp.validation.urlInvalid');
    }
    const headerKeys = parseMcpKvPairs(state.headers);
    if (headerKeys.some(([key]) => key.length === 0)) {
      return t('settings.server.mcp.validation.emptyKey', {
        field: t('settings.server.mcp.add.headers'),
      });
    }
  }

  if (state.timeout !== '') {
    const timeout = parseInt(state.timeout, 10);
    if (!Number.isInteger(timeout) || timeout <= 0) {
      return t('settings.server.mcp.validation.timeoutPositive');
    }
  }

  return null;
}

export function buildMcpConfigFromFormState(state: AddFormState): OpencodeMcpEntryConfig {
  const config: OpencodeMcpEntryConfig = { type: state.type };

  if (state.type === 'local') {
    config.command = state.command
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const environment = parseSensitiveKvRecord(state.environment, state.originalEnvironment);
    if (environment) {
      config.environment = environment;
    }
  } else {
    config.url = state.url.trim();
    const headers = parseSensitiveKvRecord(state.headers, state.originalHeaders);
    if (headers) {
      config.headers = headers;
    }
    if (state.oauthMode === 'disabled') {
      config.oauth = false;
    } else if (state.oauthMode === 'configured') {
      const oauth: Record<string, string> = {};
      if (state.oauthClientId) {
        oauth.clientId = state.oauthClientId;
      }
      if (state.oauthClientSecret === MCP_REDACTED_VALUE && state.originalOauthClientSecret) {
        oauth.clientSecret = state.originalOauthClientSecret;
      } else if (state.oauthClientSecret) {
        oauth.clientSecret = state.oauthClientSecret;
      }
      if (state.oauthScope) {
        oauth.scope = state.oauthScope;
      }
      if (state.oauthRedirectUri) {
        oauth.redirectUri = state.oauthRedirectUri;
      }
      config.oauth = oauth;
    }
  }

  config.enabled = state.enabled;
  if (state.timeout) {
    const timeout = parseInt(state.timeout, 10);
    if (Number.isInteger(timeout) && timeout > 0) {
      config.timeout = timeout;
    }
  }
  return config;
}

function parseSensitiveKvRecord(
  text: string,
  originals: Record<string, string>,
): Record<string, string> | undefined {
  const parsed = parseMcpKvPairs(text);
  if (parsed.length === 0) {
    return undefined;
  }
  const result: Record<string, string> = {};
  for (const [key, value] of parsed) {
    if (!key) {
      continue;
    }
    if (value === MCP_REDACTED_VALUE && Object.prototype.hasOwnProperty.call(originals, key)) {
      result[key] = originals[key];
      continue;
    }
    result[key] = value;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}
