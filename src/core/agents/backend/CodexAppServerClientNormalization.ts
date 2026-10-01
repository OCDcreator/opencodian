/**
 * CodexAppServerClientNormalization — pure transcript normalization helpers
 * for the local Codex app-server client.
 *
 * Split out of `CodexAppServerClient` so the client module stays under the
 * project line budget. These functions turn raw app-server threads/turns/items
 * into the preview-message shape consumed by `AgentBackendRouting`
 * (`listBackendSessions` / `getBackendSessionPreview`).
 */

import type {
  AppServerItem,
  AppServerThread,
  AppServerThreadItemsPage,
  AppServerThreadTurnsPage,
  AppServerTurn,
} from './CodexAppServerClientTypes';

/** Normalized preview message shape consumed by AgentBackendRouting. */
export interface AppServerPreviewMessage {
  role: string;
  parts: Array<{ type: string; text: string }>;
}

/**
 * A page of normalized preview messages plus the cursor pagination metadata
 * reported by `thread/turns/list` / `thread/items/list`. Cursors are opaque
 * server tokens; `nextCursor` pages forward in the requested sort direction.
 */
export interface AppServerPreviewMessagePage {
  messages: AppServerPreviewMessage[];
  nextCursor: string | null;
  backwardsCursor: string | null;
}

/** Normalize app-server threads into the shape expected by listBackendSessions. */
export function normalizeThreadList(threads: AppServerThread[]): Array<{
  id: string;
  title: string;
  updatedAt: number | null;
  shareUrl: null;
  archived?: boolean;
}> {
  return threads.map((t) => ({
    id: t.id,
    title: t.name ?? t.preview.slice(0, 80) ?? '(untitled)',
    updatedAt: t.updatedAt ? t.updatedAt * 1000 : null, // seconds → ms
    shareUrl: null,
    archived: t.archived ?? false,
  }));
}

/** Normalize app-server turns into the shape expected by getBackendSessionPreview. */
export function normalizeTurnsToPreviewMessages(
  turns: AppServerTurn[],
): AppServerPreviewMessage[] {
  const messages: AppServerPreviewMessage[] = [];
  for (const turn of turns) {
    for (const item of turn.items) {
      const extracted = extractItemMessages(item);
      if (extracted) messages.push(...extracted);
    }
  }
  return messages;
}

/**
 * Normalize a `thread/turns/list` page (typically requested with
 * `itemsView: 'summary'` for session browsing) into a preview-message page.
 * Turn payloads in summary view carry the same AppServerItem shapes as full
 * turns, so the per-item extraction matches `normalizeTurnsToPreviewMessages`.
 */
export function normalizeTurnsPageToPreviewMessages(
  page: AppServerThreadTurnsPage,
): AppServerPreviewMessagePage {
  return {
    messages: normalizeTurnsToPreviewMessages(page.data),
    nextCursor: page.nextCursor ?? null,
    backwardsCursor: page.backwardsCursor ?? null,
  };
}

/**
 * Normalize a `thread/items/list` page into a preview-message page. Used for
 * per-turn item expansion on paginated thread transcripts; each entry's item
 * goes through the same extraction as turn-embedded items.
 */
export function normalizeThreadItemsPageToPreviewMessages(
  page: AppServerThreadItemsPage,
): AppServerPreviewMessagePage {
  const messages: AppServerPreviewMessage[] = [];
  for (const entry of page.data) {
    const extracted = extractItemMessages(entry.item);
    if (extracted) messages.push(...extracted);
  }
  return {
    messages,
    nextCursor: page.nextCursor ?? null,
    backwardsCursor: page.backwardsCursor ?? null,
  };
}

/**
 * Extract normalized preview messages from a single app-server turn item.
 * Returns `null` for items that have no previewable content (reasoning,
 * contextCompaction). Text items produce user/assistant messages; activity
 * items (tool calls, file changes, web searches) produce activity messages.
 */
function extractItemMessages(item: AppServerItem): AppServerPreviewMessage[] | null {
  if (item.type === 'userMessage' && Array.isArray(item.content)) {
    return normalizeUserMessageItem(item.content);
  }
  if (item.type === 'agentMessage' && typeof item.text === 'string' && item.text.length > 0) {
    return [{ role: 'assistant', parts: [{ type: 'text', text: item.text }] }];
  }
  return normalizeActivityItem(item);
}

/** Normalize a userMessage content array into a single user message. */
function normalizeUserMessageItem(
  content: Array<{ type: string; text?: string }>,
): AppServerPreviewMessage[] | null {
  const textParts = content
    .filter((c): c is { type: string; text: string } =>
      c.type === 'text' && typeof c.text === 'string' && c.text.length > 0,
    )
    .map((c) => c.text);
  if (textParts.length === 0) return null;
  return [{ role: 'user', parts: textParts.map((text) => ({ type: 'text', text })) }];
}

/** Normalize activity items (tool calls, file changes, web searches). */
function normalizeActivityItem(item: AppServerItem): AppServerPreviewMessage[] | null {
  if (item.type === 'mcpToolCall' && typeof item.tool === 'string') {
    const label = typeof item.server === 'string' && item.server.length > 0
      ? `${item.server}/${item.tool}`
      : item.tool;
    return [{ role: 'activity', parts: [{ type: 'tool_call', text: label }] }];
  }
  if (item.type === 'fileChange' && Array.isArray(item.changes)) {
    const result: AppServerPreviewMessage[] = [];
    for (const change of item.changes) {
      if (typeof change.path === 'string' && change.path.length > 0) {
        const kind = typeof change.kind === 'string' && change.kind.length > 0 ? change.kind : 'change';
        result.push({ role: 'activity', parts: [{ type: 'file_change', text: `${change.path} (${kind})` }] });
      }
    }
    return result.length > 0 ? result : null;
  }
  if (item.type === 'webSearch' && typeof item.query === 'string' && item.query.length > 0) {
    return [{ role: 'activity', parts: [{ type: 'web_search', text: item.query }] }];
  }
  return null;
}
