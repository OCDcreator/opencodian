import { type App, Modal } from 'obsidian';

import type { McpServerStatus } from '../../core/opencode/types';
import type { OpencodeMcpEntryConfig } from '../../core/types';
import { t } from '../../i18n';

export interface McpServerStatusModalOptions {
  name: string;
  status: McpServerStatus;
  updatedAt: number | null;
  projectOwned: boolean;
  entry?: OpencodeMcpEntryConfig;
}

const REDACTED = '[redacted]';
const SENSITIVE_INLINE_PATTERNS = [
  /(authorization\s*[:=]\s*)([^\s,;]+(?:\s+[^\s,;]+)?)/gi,
  /(authorization\s*[:=]\s*bearer\s+)([^\s,;]+)/gi,
  /(bearer\s+)([^\s,;]+)/gi,
  /((?:api[_-]?key|token|secret|password)\s*[:=]\s*)([^\s,;]+)/gi,
  /((?:--(?:token|api[_-]?key|secret|password)|\/(?:token|api[_-]?key|secret|password))\s+)([^\s,;]+)/gi,
  /(https?:\/\/[^/\s:@]+:)([^@\s/]+)(@)/gi,
  /(([?&](?:token|access_token|api[_-]?key|secret|password))=)([^&\s]+)/gi,
  /(([?&][^=&\s]*(?:token|access[_-]?token|api[_-]?key|secret|password)[^=&\s]*)=)([^&\s]+)/gi,
];
const SENSITIVE_KEY_PATTERN = /(authorization|token|secret|password|api[_-]?key|access[_-]?token|refresh[_-]?token)/i;

export function redactMcpTechnicalDetails(entry: OpencodeMcpEntryConfig | undefined): Record<string, unknown> {
  if (!entry) {
    return {};
  }
  return redactUnknownSecretValues(entry) as Record<string, unknown>;
}

function statusLabel(status: McpServerStatus['status']): string {
  switch (status) {
    case 'connected':
      return t('settings.server.mcp.status.connected');
    case 'disabled':
      return t('settings.server.mcp.status.disabled');
    case 'failed':
      return t('settings.server.mcp.status.failed');
    case 'needs_auth':
      return t('settings.server.mcp.status.needsAuth');
    case 'needs_client_registration':
      return t('settings.server.mcp.status.needsClientRegistration');
    default:
      return status;
  }
}

function transportSummary(entry: OpencodeMcpEntryConfig | undefined): string {
  if (!entry) {
    return t('settings.server.mcp.details.runtimeOnly');
  }
  if (entry.type === 'remote') {
    return typeof entry.url === 'string' ? redactMcpSensitiveText(entry.url) : 'remote';
  }
  if (Array.isArray(entry.command) && entry.command.length > 0) {
    return summarizeCommand(entry.command);
  }
  return 'local';
}

export function redactMcpSensitiveText(text: string): string {
  let sanitized = text;
  for (const pattern of SENSITIVE_INLINE_PATTERNS) {
    sanitized = sanitized.replace(pattern, (_match, prefix: string) => `${prefix}${REDACTED}`);
  }
  return sanitized;
}

export function summarizeCommand(command: string[]): string {
  if (command.length === 0) {
    return 'local';
  }
  if (command.length === 1) {
    return redactMcpSensitiveText(command[0]);
  }
  return `${redactMcpSensitiveText(command[0])} (+${command.length - 1} args)`;
}

function redactUnknownSecretValues(value: unknown, keyName?: string): unknown {
  if (typeof value === 'string') {
    return keyName && SENSITIVE_KEY_PATTERN.test(keyName)
      ? REDACTED
      : redactMcpSensitiveText(value);
  }
  if (Array.isArray(value)) {
    if (keyName === 'command') {
      return [summarizeCommand(value.filter((item): item is string => typeof item === 'string'))];
    }
    return value.map((item) => redactUnknownSecretValues(item, keyName));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (key === 'headers' || key === 'environment') {
        const record = item && typeof item === 'object' && !Array.isArray(item)
          ? item as Record<string, unknown>
          : {};
        return [key, Object.fromEntries(Object.keys(record).map((recordKey) => [recordKey, REDACTED]))];
      }
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        return [key, REDACTED];
      }
      return [key, redactUnknownSecretValues(item, key)];
    }),
  );
}

export class McpServerStatusModal extends Modal {
  constructor(
    app: App,
    private readonly options: McpServerStatusModalOptions,
  ) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.empty();
    this.modalEl.addClass('opencodian-mcp-status-modal');
    this.titleEl.setText(t('settings.server.mcp.details.title', { name: this.options.name }));

    const summary = this.contentEl.createDiv({ cls: 'opencodian-mcp-details-summary' });
    summary.createEl('h3', { text: this.options.name });
    summary.createDiv({ text: statusLabel(this.options.status.status) });
    summary.createDiv({
      text: this.options.projectOwned
        ? t('settings.server.mcp.ownership.project')
        : t('settings.server.mcp.ownership.runtimeOnly'),
    });
    summary.createDiv({ text: transportSummary(this.options.entry) });

    if ('error' in this.options.status && this.options.status.error) {
      summary.createDiv({
        cls: 'opencodian-mcp-details-error',
        text: redactMcpSensitiveText(this.options.status.error),
      });
    }

    const updated = this.options.updatedAt
      ? new Date(this.options.updatedAt).toLocaleString()
      : t('settings.server.mcp.overview.never');
    summary.createDiv({ text: `${t('settings.server.mcp.overview.lastRefresh')}: ${updated}` });

    const tools = this.contentEl.createDiv({ cls: 'opencodian-mcp-details-section' });
    tools.createEl('h4', { text: t('settings.server.mcp.details.toolsTitle') });
    tools.createDiv({
      cls: 'opencodian-mcp-details-unavailable',
      text: t('settings.server.mcp.details.toolsUnavailable'),
    });

    const technical = this.contentEl.createEl('details', { cls: 'opencodian-mcp-details-technical' });
    technical.createEl('summary', { text: t('settings.server.mcp.details.technicalTitle') });
    technical.createEl('pre', {
      text: JSON.stringify(redactMcpTechnicalDetails(this.options.entry), null, 2),
    });
  }
}
