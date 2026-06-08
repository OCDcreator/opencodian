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

export function hasSessionCreationCapability(service: AgentService | null | undefined): service is AgentSessionCapability {
  if (!service?.hasCapability(AgentCapability.Sessions)) {
    return false;
  }

  const sessionService = service as Partial<AgentSessionCapability>;
  return typeof sessionService.createSession === 'function'
    && typeof sessionService.deleteSession === 'function'
    && typeof sessionService.updateSessionTitle === 'function';
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
  let session: unknown;
  try {
    session = await sessionService.getSession(sessionId);
  } catch {
    return null;
  }
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
  let session: unknown;
  try {
    session = await sessionService.getSession(sessionId);
  } catch {
    return null;
  }
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
// Backend-aware session detail normalization (stable inspection seam)
// ---------------------------------------------------------------------------

/**
 * Normalized session-detail shape for stable inspection surfaces.
 *
 * This is a **best-effort detail seam**, not a generic cross-backend
 * session-detail contract. Fields that the backend does not provide are
 * returned as `null`. Consumers should omit or label unavailable fields
 * rather than inventing fake values.
 */
export interface NormalizedSessionDetail {
  id: string;
  backendKind: string;
  /** Display title (summary for Claude, title for OpenCode). */
  title: string;
  /** Backend summary or description, if distinct from title. */
  summary: string;
  createdAt: number | null;
  updatedAt: number | null;
  customTitle: string | null;
  /** Best-effort backend-specific fields — null when unavailable. */
  gitBranch: string | null;
  cwd: string | null;
  tag: string | null;
  fileSize: number | null;
}

/**
 * Read session detail metadata from the active backend as a normalized object.
 *
 * Routes through the registry and calls `getSession(sessionId)` on the active
 * session-capable adapter, then extracts fields based on the active backend
 * kind. Returns `null` when no session-capable adapter is available,
 * `getSession` is not implemented, or the session is not found.
 *
 * This is a **narrow read-only seam** for stable inspection surfaces. It does
 * not expose raw provider-owned diagnostic controls.
 */
export async function getBackendSessionDetail(
  registry: AgentServiceRegistry | null | undefined,
  sessionId: string,
): Promise<NormalizedSessionDetail | null> {
  const active = getActiveSessionBackendService(registry);
  if (!active || typeof active.getSession !== 'function') {
    return null;
  }

  let session: unknown;
  try {
    session = await active.getSession(sessionId);
  } catch {
    return null;
  }
  if (!session || typeof session !== 'object') {
    return null;
  }

  const record = session as Record<string, unknown>;
  const kind = (active as { kind?: string }).kind ?? 'unknown';

  return extractSessionDetailFields(record, kind, sessionId);
}

/** Extract normalized detail fields from a raw session record. */
function extractSessionDetailFields(
  record: Record<string, unknown>,
  kind: string,
  fallbackId: string,
): NormalizedSessionDetail {
  const id = String(record.id ?? record.sessionId ?? fallbackId);
  const updatedAt = extractTimestamp(record, 'lastModified', 'updatedAt', 'updated');
  const createdAt = extractTimestamp(record, 'createdAt', undefined, 'created');
  const customTitle = typeof record.customTitle === 'string' && record.customTitle.trim()
    ? record.customTitle.trim()
    : null;

  const { title, summary } = extractTitleSummary(record, kind);
  const stringField = (value: unknown): string | null =>
    typeof value === 'string' && value.trim() ? value.trim() : null;
  const numberField = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

  return {
    id,
    backendKind: kind,
    title,
    summary,
    createdAt,
    updatedAt,
    customTitle,
    gitBranch: stringField(record.gitBranch ?? record.git_branch),
    cwd: stringField(record.cwd ?? record.workingDirectory ?? record.working_directory),
    tag: stringField(record.tag),
    fileSize: numberField(record.fileSize ?? record.file_size),
  };
}

/** Extract a timestamp from a session record, trying multiple field paths. */
function extractTimestamp(
  record: Record<string, unknown>,
  direct: string,
  alt?: string,
  timeField?: string,
): number | null {
  if (typeof record[direct] === 'number') return record[direct] as number;
  if (alt && typeof record[alt] === 'number') return record[alt] as number;
  if (timeField) {
    const time = record.time as Record<string, unknown> | undefined;
    if (time && typeof time === 'object' && typeof time[timeField] === 'number') {
      return time[timeField] as number;
    }
  }
  return null;
}

/** Extract title and summary based on backend kind. */
function extractTitleSummary(
  record: Record<string, unknown>,
  kind: string,
): { title: string; summary: string } {
  if (kind === 'opencode') {
    return {
      title: String(record.title ?? ''),
      summary: String(record.description ?? ''),
    };
  }
  // Claude Code and generic: summary is the main title field
  return {
    title: String(record.summary ?? record.title ?? ''),
    summary: String(record.summary ?? ''),
  };
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

  let rawSessions: unknown;
  try {
    rawSessions = await active.listSessions();
  } catch {
    return [];
  }
  if (!Array.isArray(rawSessions)) {
    return [];
  }

  return rawSessions.filter((s): s is Record<string, unknown> => s !== null && typeof s === 'object').map((record, idx) => {
    let shareUrl: string | null = null;
    const share = active.kind === 'opencode' && record.share && typeof record.share === 'object'
      ? record.share as Record<string, unknown>
      : null;
    if (share) {
      const url = share.url;
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
 * Normalize an array of content blocks (Claude SDK style) into preview parts.
 * Each block should be an object; non-object entries are skipped.
 */
function normalizeContentBlocks(blocks: unknown[]): NormalizedSessionPreviewPart[] {
  const parts: NormalizedSessionPreviewPart[] = [];
  for (const block of blocks) {
    if (typeof block === 'object' && block !== null) {
      const b = block as Record<string, unknown>;
      if (b.type === 'text' && typeof b.text === 'string') {
        parts.push({ type: 'text', text: b.text });
      } else {
        parts.push({ type: String(b.type ?? 'block'), text: JSON.stringify(block, null, 2) });
      }
    }
  }
  return parts;
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

  let rawMessages: unknown;
  try {
    rawMessages = await historyService.getSessionMessages(sessionId);
  } catch {
    return null;
  }
  if (!Array.isArray(rawMessages)) {
    return null;
  }

  return rawMessages.filter((msg): msg is Record<string, unknown> => msg !== null && typeof msg === 'object').map((record): NormalizedSessionPreviewMessage => {
    // Detect OpenCode {info, parts} shape
    if (record.info && typeof record.info === 'object' && Array.isArray(record.parts)) {
      const info = record.info as Record<string, unknown>;
      const parts = (record.parts as unknown[]).filter(
        (p): p is Record<string, unknown> => p !== null && typeof p === 'object',
      );
      return {
        role: String(info.role ?? 'unknown'),
        parts: parts.map((part) => ({
          type: String(part.type ?? 'unknown'),
          text: typeof part.text === 'string' ? part.text : JSON.stringify(part, null, 2),
        })),
      };
    }

    // Resolve role and content, handling Claude SDK nested envelope
    // { type, message: { role, content } } as well as top-level fields.
    const msg = record.message && typeof record.message === 'object'
      ? record.message as Record<string, unknown>
      : null;
    const role = msg
      ? String(msg.role ?? record.type ?? record.role ?? 'unknown')
      : String(record.role ?? record.type ?? 'unknown');
    // Prefer nested message.content; fall back to top-level record.content
    const content = (msg && msg.content !== undefined) ? msg.content : record.content;

    // Try recognized content fields
    if (typeof content === 'string') {
      return { role, parts: [{ type: 'text', text: content }] };
    }

    if (Array.isArray(content)) {
      // Claude SDK content blocks: [{ type: 'text', text: '...' }, ...]
      const parts = normalizeContentBlocks(content);
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
  if (!Array.isArray(rawMessages)) {
    return [];
  }

  const safeMessages = rawMessages.filter((msg): msg is Record<string, unknown> => msg !== null && typeof msg === 'object');

  if (backend === 'opencode') {
    return (safeMessages as Array<{
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
  // Claude SDK records nest role/content under `record.message`, so unwrap
  // when the envelope exists; otherwise fall back to top-level fields.
  return safeMessages.map((record, idx) => {
    // Claude SDK nested envelope: { message: { role, content } }
    const msg = record.message && typeof record.message === 'object'
      ? record.message as Record<string, unknown>
      : null;
    return {
      id: (record.id ?? record.message_id ?? record.uuid ?? `msg-${idx}`) as string,
      role: ((msg?.role ?? record.role ?? record.type ?? 'unknown') as string),
      createdAt: typeof record.created_at === 'number' ? record.created_at : null,
      payload: JSON.stringify(record, null, 2),
    };
  });
}
