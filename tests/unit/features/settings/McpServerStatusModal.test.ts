import { App } from 'obsidian';

import type { OpencodeMcpEntryConfig } from '../../../../src/core/types/opencodeConfig';
import {
  McpServerStatusModal,
  redactMcpSensitiveText,
  redactMcpTechnicalDetails,
  summarizeCommand,
} from '../../../../src/features/settings/McpServerStatusModal';
import { setLocale, t } from '../../../../src/i18n';

describe('McpServerStatusModal', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
  });

  it('renders runtime status, ownership, and explicit tools-unavailable state', () => {
    const modal = new McpServerStatusModal({} as App, {
      name: 'exa',
      status: { status: 'failed', error: 'connection refused' },
      updatedAt: 1700000000000,
      projectOwned: true,
      entry: {
        type: 'remote',
        url: 'https://mcp.example.com/mcp',
      },
    });

    modal.onOpen();

    expect(modal.contentEl.textContent).toContain('exa');
    expect(modal.contentEl.textContent).toContain(t('settings.server.mcp.status.failed'));
    expect(modal.contentEl.textContent).toContain('connection refused');
    expect(modal.contentEl.textContent).toContain(
      t('settings.server.mcp.details.toolsUnavailable'),
    );
    expect(modal.contentEl.textContent).toContain(t('settings.server.mcp.ownership.project'));
  });

  it('redacts headers, environment values, and OAuth client secrets from technical details', () => {
    const entry: OpencodeMcpEntryConfig = {
      type: 'remote',
      url: 'https://mcp.example.com/mcp',
      headers: {
        Authorization: 'Bearer very-secret',
        'X-Api-Key': 'api-secret',
      },
      environment: {
        TOKEN: 'env-secret',
      },
      oauth: {
        clientId: 'client-123',
        clientSecret: 'oauth-secret',
        scope: 'read',
      },
    };

    const redacted = redactMcpTechnicalDetails(entry);
    const serialized = JSON.stringify(redacted);

    expect(serialized).toContain('Authorization');
    expect(serialized).toContain('X-Api-Key');
    expect(serialized).toContain('TOKEN');
    expect(serialized).toContain('client-123');
    expect(serialized).not.toContain('very-secret');
    expect(serialized).not.toContain('api-secret');
    expect(serialized).not.toContain('env-secret');
    expect(serialized).not.toContain('oauth-secret');
  });

  it('redacts sensitive inline text and summarizes local commands without exposing args', () => {
    expect(redactMcpSensitiveText('Authorization=Bearer super-secret')).not.toContain('super-secret');
    expect(redactMcpSensitiveText('token: abc123')).not.toContain('abc123');
    expect(redactMcpSensitiveText('Authorization: Basic abc123')).not.toContain('abc123');
    expect(redactMcpSensitiveText('https://user:pass@example.com/mcp?token=abc123')).not.toContain('pass');
    expect(redactMcpSensitiveText('https://user:pass@example.com/mcp?token=abc123')).not.toContain('abc123');
    expect(redactMcpSensitiveText('https://example.com/mcp?exaApiKey=abc123')).not.toContain('abc123');
    expect(redactMcpSensitiveText('node --token super-secret')).not.toContain('super-secret');
    expect(redactMcpSensitiveText('node --api-key super-secret')).not.toContain('super-secret');
    expect(summarizeCommand(['npx', '-y', '@scope/server'])).toBe('npx (+2 args)');
    expect(summarizeCommand(['node --token=super-secret', 'server.js'])).not.toContain('super-secret');
    expect(summarizeCommand(['node --token super-secret', 'server.js'])).not.toContain('super-secret');
    expect(summarizeCommand(['server --token=super-secret'])).not.toContain('super-secret');
  });

  it('redacts unknown secret-shaped keys from technical details', () => {
    const redacted = redactMcpTechnicalDetails({
      type: 'remote',
      apiKey: 'key-secret',
      oauth: {
        refreshToken: 'refresh-secret',
      },
    } as OpencodeMcpEntryConfig);

    const serialized = JSON.stringify(redacted);
    expect(serialized).not.toContain('key-secret');
    expect(serialized).not.toContain('refresh-secret');
  });
});
