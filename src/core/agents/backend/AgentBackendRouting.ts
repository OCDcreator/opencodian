import type { AgentBackendKind, Conversation } from '../../types/chat';
import { AgentCapability } from '../AgentCapability';
import type {
  AgentChatCapability,
  AgentService,
  AgentSessionCapability,
} from './AgentService';
import type { AgentServiceRegistry } from './AgentServiceRegistry';

export function resolveConversationBackendKind(
  conversation: Pick<Conversation, 'backend'> | null | undefined,
): AgentBackendKind {
  return conversation?.backend ?? 'opencode';
}

export function hasChatCapability(service: AgentService | null | undefined): service is AgentChatCapability {
  return Boolean(service?.hasCapability(AgentCapability.Chat));
}

export function hasSessionCapability(service: AgentService | null | undefined): service is AgentSessionCapability {
  return Boolean(service?.hasCapability(AgentCapability.Sessions));
}

export function getConversationBackendService(
  registry: AgentServiceRegistry | null | undefined,
  conversation: Pick<Conversation, 'backend'> | null | undefined,
): AgentService | null {
  const backend = resolveConversationBackendKind(conversation);
  return registry?.get(backend) ?? null;
}

export function getActiveSessionBackendService(
  registry: AgentServiceRegistry | null | undefined,
): AgentSessionCapability | null {
  const active = registry?.getActive() ?? null;
  return hasSessionCapability(active) ? active : null;
}

export function getConversationSessionBackendService(
  registry: AgentServiceRegistry | null | undefined,
  conversation: Pick<Conversation, 'backend'> | null | undefined,
): AgentSessionCapability | null {
  const service = getConversationBackendService(registry, conversation);
  return hasSessionCapability(service) ? service : null;
}

export function getConversationChatBackendService(
  registry: AgentServiceRegistry | null | undefined,
  conversation: Pick<Conversation, 'backend'> | null | undefined,
): AgentChatCapability | null {
  const service = getConversationBackendService(registry, conversation);
  return hasChatCapability(service) ? service : null;
}

/**
 * Returns the session backend for the given conversation ONLY if it also
 * implements `getSessionMessages`.  Used for session history productization
 * where callers need to read raw messages from the backend.
 */
export function getConversationSessionHistoryService(
  registry: AgentServiceRegistry | null | undefined,
  conversation: Pick<Conversation, 'backend'> | null | undefined,
): (AgentSessionCapability & Pick<Required<AgentSessionCapability>, 'getSessionMessages'>) | null {
  const service = getConversationSessionBackendService(registry, conversation);
  if (!service || typeof (service as AgentSessionCapability).getSessionMessages !== 'function') {
    return null;
  }
  return service as AgentSessionCapability & Pick<Required<AgentSessionCapability>, 'getSessionMessages'>;
}

/**
 * Returns the **active** backend's session service ONLY if it also implements
 * `getSessionMessages`.  Convenience wrapper for consumers that need to read
 * session messages from the active backend without a specific conversation
 * context (e.g. settings inspection surfaces).
 */
export function getActiveSessionHistoryService(
  registry: AgentServiceRegistry | null | undefined,
): (AgentSessionCapability & Pick<Required<AgentSessionCapability>, 'getSessionMessages'>) | null {
  const service = getActiveSessionBackendService(registry);
  if (!service || typeof service.getSessionMessages !== 'function') {
    return null;
  }
  return service as AgentSessionCapability & Pick<Required<AgentSessionCapability>, 'getSessionMessages'>;
}

// ---------------------------------------------------------------------------
// Backend-aware session title read
// ---------------------------------------------------------------------------

/**
 * Read the display title of a backend session through the routing layer.
 *
 * Routes through the registry and calls `getSession(sessionId)` on the
 * backend adapter, then extracts the backend-specific title field for
 * the currently productized backends:
 * - OpenCode: `.title`
 * - Claude Code: `.summary`
 *
 * Returns `null` when no session service is available, `getSession` is not
 * implemented, the session is not found, the backend has not been mapped
 * yet, or the mapped title field is empty.
 */
export async function readBackendSessionTitle(
  registry: AgentServiceRegistry | null | undefined,
  conversation: Pick<Conversation, 'backend'> | null,
  sessionId: string | null,
): Promise<string | null> {
  if (!sessionId) {
    return null;
  }

  const sessionService = getConversationSessionBackendService(registry, conversation);
  if (!sessionService || typeof sessionService.getSession !== 'function') {
    return null;
  }

  const backend = resolveConversationBackendKind(conversation);
  const session = await sessionService.getSession(sessionId);
  if (!session || typeof session !== 'object') {
    return null;
  }

  const record = session as Record<string, unknown>;

  if (backend === 'opencode') {
    const title = record.title;
    return typeof title === 'string' && title.trim() ? title.trim() : null;
  }

  if (backend === 'claude-code') {
    const summary = record.summary;
    return typeof summary === 'string' && summary.trim() ? summary.trim() : null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Backend-aware session share-URL read
// ---------------------------------------------------------------------------

/**
 * Read the share URL of a backend session through the routing layer.
 *
 * Routes through the registry and calls `getSession(sessionId)` on the
 * backend adapter, then extracts the backend-specific share URL field:
 * - OpenCode: `session.share.url`
 * - Claude Code and other backends: no share URL equivalent → `null`
 *
 * This is a **narrow backend-aware session-detail read seam** for share-URL
 * inspection only.  It must not be described as a generic stable
 * cross-backend session-detail object contract.
 *
 * Returns `null` when no session service is available, `getSession` is not
 * implemented, the session is not found, the backend has no share URL
 * concept, or the share URL is empty.
 */
export async function readBackendSessionShareUrl(
  registry: AgentServiceRegistry | null | undefined,
  conversation: Pick<Conversation, 'backend'> | null,
  sessionId: string | null,
): Promise<string | null> {
  if (!sessionId) {
    return null;
  }

  const sessionService = getConversationSessionBackendService(registry, conversation);
  if (!sessionService || typeof sessionService.getSession !== 'function') {
    return null;
  }

  const backend = resolveConversationBackendKind(conversation);
  const session = await sessionService.getSession(sessionId);
  if (!session || typeof session !== 'object') {
    return null;
  }

  const record = session as Record<string, unknown>;

  if (backend === 'opencode') {
    const share = record.share;
    if (!share || typeof share !== 'object') {
      return null;
    }
    const url = (share as Record<string, unknown>).url;
    return typeof url === 'string' && url.trim().length > 0 ? url : null;
  }

  // Claude Code and other backends: no share URL concept at this time.
  return null;
}

// ---------------------------------------------------------------------------
// Backend-aware session message normalization
// ---------------------------------------------------------------------------

export interface NormalizedSessionMessage {
  id: string;
  role: string;
  createdAt: number | null;
  payload: string;
}

// ---------------------------------------------------------------------------
// Backend-aware session-row normalization (inspection seam)
// ---------------------------------------------------------------------------

/**
 * Lightweight session-row shape for settings inspection surfaces.
 * Decoupled from OpenCode `Session` and Claude SDK session types so the
 * shared-session list no longer assumes a specific backend payload shape.
 */
export interface NormalizedSessionRow {
  id: string;
  title: string;
  shareUrl: string | null;
  updatedAt: number | null;
}

export interface NormalizedSessionPreviewPart {
  type: string;
  text: string;
}

export interface NormalizedSessionPreviewMessage {
  role: string;
  parts: NormalizedSessionPreviewPart[];
}

/**
 * List sessions from the active backend as normalized rows.
 *
 * Routes through the registry and calls `listSessions()` on the active
 * session-capable adapter, then normalizes the raw results into
 * `NormalizedSessionRow[]` based on the active backend kind:
 * - OpenCode: extracts `.id`, `.title`, `.share.url`, `.time.updated`
 * - Claude / generic: best-effort field extraction from SDK records
 *
 * Returns `[]` when no session-capable adapter is available or the adapter
 * does not implement `listSessions`.
 */
export async function listBackendSessions(
  registry: AgentServiceRegistry | null | undefined,
): Promise<NormalizedSessionRow[]> {
  const active = getActiveSessionBackendService(registry);
  if (!active || typeof active.listSessions !== 'function') {
    return [];
  }

  const rawSessions = await active.listSessions();
  if (!Array.isArray(rawSessions)) {
    return [];
  }

  return rawSessions.map((session: unknown, idx: number) => {
    const record = session as Record<string, unknown>;

    // Extract share URL if present
    let shareUrl: string | null = null;
    const share = record.share;
    if (share && typeof share === 'object') {
      const url = (share as Record<string, unknown>).url;
      if (typeof url === 'string' && url.trim().length > 0) {
        shareUrl = url;
      }
    }

    return {
      id: String(record.id ?? record.sessionId ?? `session-${idx}`),
      title: String(record.title ?? record.summary ?? ''),
      shareUrl,
      updatedAt: typeof record.updatedAt === 'number'
        ? record.updatedAt
        : typeof (record.time as Record<string, unknown> | undefined)?.updated === 'number'
          ? (record.time as Record<string, unknown>).updated as number
          : null,
    };
  });
}

/**
 * Read session preview messages from the active backend as normalized entries.
 *
 * Routes through the registry and calls `getSessionMessages(sessionId)` on
 * the active history-capable adapter, then normalizes raw results into
 * `NormalizedSessionPreviewMessage[]` based on the active backend kind:
 * - OpenCode: extracts `.info.role` + `.parts[]` with `{type, text}`
 * - Claude / generic: extracts `.role`/`.type` + recognized content fields
 *
 * Returns `null` when no history-capable adapter is available.
 * Returns `[]` when the backend supports preview reads but the session has no
 * previewable messages.
 */
export async function getBackendSessionPreview(
  registry: AgentServiceRegistry | null | undefined,
  sessionId: string,
): Promise<NormalizedSessionPreviewMessage[] | null> {
  const historyService = getActiveSessionHistoryService(registry);
  if (!historyService) {
    return null;
  }

  const rawMessages = await historyService.getSessionMessages(sessionId);
  if (!Array.isArray(rawMessages)) {
    return null;
  }

  return rawMessages.map((msg: unknown): NormalizedSessionPreviewMessage => {
    const record = msg as Record<string, unknown>;

    // Detect OpenCode {info, parts} shape
    if (record.info && typeof record.info === 'object' && Array.isArray(record.parts)) {
      const info = record.info as Record<string, unknown>;
      const parts = record.parts as Array<Record<string, unknown>>;
      return {
        role: String(info.role ?? 'unknown'),
        parts: parts.map((part) => ({
          type: String(part.type ?? 'unknown'),
          text: typeof part.text === 'string' ? part.text : JSON.stringify(part, null, 2),
        })),
      };
    }

    // Generic / Claude normalization
    const role = String(record.role ?? record.type ?? 'unknown');

    // Try recognized content fields
    const content = record.content;
    if (typeof content === 'string') {
      return { role, parts: [{ type: 'text', text: content }] };
    }

    if (Array.isArray(content)) {
      // Claude SDK content blocks: [{ type: 'text', text: '...' }, ...]
      const parts: NormalizedSessionPreviewPart[] = [];
      for (const block of content) {
        if (typeof block === 'object' && block !== null) {
          const b = block as Record<string, unknown>;
          if (b.type === 'text' && typeof b.text === 'string') {
            parts.push({ type: 'text', text: b.text });
          } else {
            parts.push({ type: String(b.type ?? 'block'), text: JSON.stringify(block, null, 2) });
          }
        }
      }
      if (parts.length > 0) {
        return { role, parts };
      }
    }

    // Fallback: serialize the whole record as a single json part
    return {
      role,
      parts: [{ type: 'json', text: JSON.stringify(record, null, 2) }],
    };
  });
}

/**
 * Load and normalize raw session messages from the backend.
 *
 * - OpenCode messages have `{info, parts}` shape.
 * - Claude / other backends: best-effort generic normalization from SDK shape.
 *
 * Returns `[]` when no session history service is available.
 */
export async function loadBackendSessionMessages(
  registry: AgentServiceRegistry | null | undefined,
  conversation: Pick<Conversation, 'backend'> | null,
  sessionId: string | null,
): Promise<NormalizedSessionMessage[]> {
  if (!sessionId) {
    return [];
  }
  const historyService = getConversationSessionHistoryService(registry, conversation);
  if (!historyService) {
    return [];
  }

  const backend = resolveConversationBackendKind(conversation);
  const rawMessages = await historyService.getSessionMessages(sessionId);

  if (backend === 'opencode') {
    return (rawMessages as Array<{
      info: { id: string; role: string; time: { created?: number } };
      parts: unknown;
    }>).map(({ info, parts }) => ({
      id: info.id,
      role: info.role,
      createdAt: info.time.created ?? null,
      payload: JSON.stringify({ message: info, parts }, null, 2),
    }));
  }

  // Generic normalization for Claude / other backends.
  return rawMessages.map((msg: unknown, idx: number) => {
    const record = msg as Record<string, unknown>;
    return {
      id: (record.id ?? record.message_id ?? `msg-${idx}`) as string,
      role: (record.role ?? record.type ?? 'unknown') as string,
      createdAt: typeof record.created_at === 'number' ? record.created_at : null,
      payload: JSON.stringify(record, null, 2),
    };
  });
}
