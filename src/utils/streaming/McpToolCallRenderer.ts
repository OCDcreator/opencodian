import { setIcon } from 'obsidian';

import { detectMcpAuthError } from './mcpAuthErrorDetection';
import type { ToolCallInfo } from './types';
export function getMcpServerName(toolCall: Pick<ToolCallInfo, 'kind' | 'toolMetadata'>): string | null {
  if (toolCall.kind !== 'mcp') {
    return null;
  }
  const server = toolCall.toolMetadata?.server;
  if (typeof server === 'string' && server.trim().length > 0) {
    return server.trim();
  }
  return null;
}

export function renderMcpServerChip(
  header: HTMLElement,
  serverName: string,
  onOpen?: (serverName: string) => void,
): void {
  if (onOpen) {
    const serverChip = header.createEl('button', { cls: 'streaming-tool-server-chip is-interactive' });
    serverChip.type = 'button';
    serverChip.setText(serverName);
    serverChip.title = `View server details: ${serverName}`;
    serverChip.setAttribute('aria-label', `View server details: ${serverName}`);
    serverChip.addEventListener('click', (e) => {
      e.stopPropagation();
      onOpen(serverName);
    });
    serverChip.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        onOpen(serverName);
      }
    });
    return;
  }
  const serverChip = header.createSpan({ cls: 'streaming-tool-server-chip' });
  serverChip.setText(serverName);
  serverChip.title = `MCP server: ${serverName}`;
}

function shouldShowAuthButton(
  toolCall: Pick<ToolCallInfo, 'kind' | 'status' | 'result'>,
  onAuthenticate?: (serverName: string) => void,
): boolean {
  return (
    toolCall.kind === 'mcp'
    && toolCall.status === 'error'
    && typeof onAuthenticate === 'function'
    && detectMcpAuthError(toolCall.result)
  );
}

function shouldShowRetryButton(
  toolCall: Pick<ToolCallInfo, 'kind' | 'status'>,
  onRetry?: (toolCall: ToolCallInfo) => void,
): boolean {
  return (
    toolCall.kind === 'mcp'
    && toolCall.status === 'error'
    && typeof onRetry === 'function'
  );
}

export function renderOrUpdateMcpAuthButton(
  header: HTMLElement,
  toolCall: ToolCallInfo,
  onAuthenticate?: (serverName: string) => void,
): void {
  const existingBtn = header.querySelector('.streaming-tool-auth-btn');

  if (!shouldShowAuthButton(toolCall, onAuthenticate)) {
    existingBtn?.remove();
    return;
  }

  if (existingBtn) return;

  const serverName = getMcpServerName(toolCall);
  if (!serverName) return;

  const authBtn = header.createEl('button', { cls: 'streaming-tool-auth-btn' });
  authBtn.type = 'button';
  authBtn.setAttribute('aria-label', `Authenticate ${serverName}`);
  authBtn.title = `Authentication required for ${serverName}. Click to start OAuth login.`;
  const iconEl = authBtn.createSpan({ cls: 'streaming-tool-auth-btn-icon' });
  setIcon(iconEl, 'key-round');
  authBtn.createSpan({ cls: 'streaming-tool-auth-btn-text', text: 'Authenticate' });
  authBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    onAuthenticate!(serverName);
  });
  authBtn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      onAuthenticate!(serverName);
    }
  });
}

export function renderMcpExpandedContent(
  container: HTMLElement,
  toolCall: ToolCallInfo,
  onOpenMcpServerDetail?: (serverName: string) => void,
): void {
  const serverName = getMcpServerName(toolCall);
  if (!serverName) {
    return;
  }
  const detailsEl = container.createDiv({ cls: 'streaming-mcp-details' });
  const fieldEl = detailsEl.createDiv({ cls: 'streaming-mcp-field' });
  fieldEl.createSpan({ text: `Server: ${serverName}` });

  if (toolCall.status === 'error' && detectMcpAuthError(toolCall.result)) {
    const hintEl = detailsEl.createDiv({ cls: 'streaming-mcp-auth-hint' });
    hintEl.createSpan({ text: 'This call failed because the server requires authentication. ' });
    hintEl.createSpan({ text: 'Use the Authenticate button to fix this.' });
  }

  if (onOpenMcpServerDetail) {
    const linkEl = detailsEl.createEl('button', { cls: 'streaming-mcp-server-link' });
    linkEl.type = 'button';
    linkEl.textContent = 'View server details';
    linkEl.title = `View auth, schema, and resources for ${serverName}`;
    linkEl.addEventListener('click', (e) => {
      e.stopPropagation();
      onOpenMcpServerDetail(serverName);
    });
  }
}

export type McpAuthOutcome = 'completed' | 'pending' | 'failed';

export function applyMcpAuthOutcome(
  toolBlock: HTMLElement,
  serverName: string,
  outcome: McpAuthOutcome,
): void {
  const authBtn = toolBlock.querySelector('.streaming-tool-auth-btn');
  if (!authBtn) return;

  const ariaLabel = authBtn.getAttribute('aria-label') || '';
  if (!ariaLabel.includes(serverName)) return;

  if (outcome === 'completed') {
    authBtn.remove();
    const header = toolBlock.querySelector('.streaming-tool-header');
    if (header instanceof HTMLElement && !header.querySelector('.streaming-tool-auth-done')) {
      const badge = header.createSpan({ cls: 'streaming-tool-auth-done' });
      setIcon(badge.createSpan({ cls: 'streaming-tool-auth-done-icon' }), 'check-circle');
      badge.createSpan({ cls: 'streaming-tool-auth-done-text', text: 'Authenticated' });
    }
  }

  const hint = toolBlock.querySelector('.streaming-mcp-auth-hint');
  if (hint instanceof HTMLElement) {
    hint.empty();
    hint.removeClass('is-pending', 'is-failed');
    if (outcome === 'completed') {
      hint.addClass('is-done');
      hint.createSpan({ text: 'Authentication successful. Send your message again to retry.' });
    } else if (outcome === 'pending') {
      hint.addClass('is-pending');
      hint.createSpan({ text: 'Authentication in progress. Complete login in your browser.' });
    } else {
      hint.addClass('is-failed');
      hint.createSpan({ text: 'Authentication failed. Click Authenticate to retry, or check server details.' });
    }
  }
}

export function applyMcpAuthOutcomeToContainer(
  container: HTMLElement,
  serverName: string,
  outcome: McpAuthOutcome,
): void {
  container.querySelectorAll('.streaming-tool-call').forEach((block) => {
    if (block instanceof HTMLElement) {
      applyMcpAuthOutcome(block, serverName, outcome);
    }
  });
}

export function renderOrUpdateMcpRetryButton(
  header: HTMLElement,
  toolCall: ToolCallInfo,
  onRetry?: (toolCall: ToolCallInfo) => void,
): void {
  const existingBtn = header.querySelector('.streaming-tool-retry-btn');

  if (!shouldShowRetryButton(toolCall, onRetry)) {
    existingBtn?.remove();
    return;
  }

  if (existingBtn) return;

  const retryBtn = header.createEl('button', { cls: 'streaming-tool-retry-btn' });
  retryBtn.type = 'button';
  retryBtn.setAttribute('aria-label', `Retry ${toolCall.name}`);
  retryBtn.title = `Re-run this MCP tool call to verify the fix.`;
  const iconEl = retryBtn.createSpan({ cls: 'streaming-tool-retry-btn-icon' });
  setIcon(iconEl, 'rotate-cw');
  retryBtn.createSpan({ cls: 'streaming-tool-retry-btn-text', text: 'Retry' });
  retryBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    retryBtn.disabled = true;
    retryBtn.addClass('is-busy');
    onRetry!(toolCall);
  });
  retryBtn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      retryBtn.disabled = true;
      retryBtn.addClass('is-busy');
      onRetry!(toolCall);
    }
  });
}

export interface McpRetryOutcome {
  ok: boolean;
  text: string;
}

/**
 * Surface the result of an inline MCP tool-call retry on the matching tool
 * block. The block is identified by `data-tool-id` so the outcome is tied to
 * the exact failed block the user clicked Retry on.
 */
export function applyMcpRetryOutcome(
  container: HTMLElement,
  toolCallId: string,
  outcome: McpRetryOutcome,
): void {
  const block = container.querySelector<HTMLElement>(
    `.streaming-tool-call[data-tool-id="${cssEscape(toolCallId)}"]`,
  );
  if (!block) return;

  const retryBtn = block.querySelector('.streaming-tool-retry-btn');
  if (retryBtn instanceof HTMLButtonElement) {
    retryBtn.disabled = false;
    retryBtn.removeClass('is-busy');
  }

  let resultEl = block.querySelector<HTMLElement>('.streaming-tool-retry-result');
  if (!resultEl) {
    resultEl = block.createDiv({ cls: 'streaming-tool-retry-result' });
  }
  resultEl.empty();
  resultEl.removeClass('is-ok', 'is-fail');
  resultEl.addClass(outcome.ok ? 'is-ok' : 'is-fail');
  const iconEl = resultEl.createSpan({ cls: 'streaming-tool-retry-result-icon' });
  setIcon(iconEl, outcome.ok ? 'check-circle' : 'alert-circle');
  resultEl.createSpan({ cls: 'streaming-tool-retry-result-text', text: outcome.text });
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, '\\$&');
}
