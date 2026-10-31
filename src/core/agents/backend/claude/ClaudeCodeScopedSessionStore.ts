/** Native transcript storage for SDK catalog calls with a scoped config home. */
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

import type { SessionKey, SessionStore, SessionStoreEntry } from '@anthropic-ai/claude-agent-sdk';

// A local structural slice avoids a type cycle through the adapter/SDK loader.
interface ClaudeCatalogOptions { dir?: string; sessionStore?: unknown }
interface ScopedClaudeCatalogSdk {
  listSessions?(options?: ClaudeCatalogOptions & { limit?: number; offset?: number }): Promise<unknown>;
  getSessionInfo?(id: string, options?: ClaudeCatalogOptions): Promise<unknown>;
  getSessionMessages?(id: string, options?: ClaudeCatalogOptions & { limit?: number; offset?: number; includeSystemMessages?: boolean }): Promise<unknown>;
  listSubagents?(id: string, options?: ClaudeCatalogOptions): Promise<unknown>;
  getSubagentMessages?(id: string, agent: string, options?: ClaudeCatalogOptions & { limit?: number; offset?: number }): Promise<unknown>;
  forkSession?(id: string, options?: ClaudeCatalogOptions & { upToMessageId?: string; title?: string }): Promise<unknown>;
  renameSession?(id: string, title: string, options?: ClaudeCatalogOptions): Promise<unknown>;
  importSessionToStore?(id: string, destination: unknown, options?: { dir?: string; includeSubagents?: boolean; batchSize?: number }): Promise<void>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEGMENT = /^[a-z0-9_-]+$/i;
const PROJECT_ALIAS = /^[a-z0-9_-]{1,64}$/i;
const RESERVED_PROJECT_ALIAS = /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

export interface ClaudePersistedGoal {
  goal: Record<string, unknown> | null;
  updatedAt: number;
}

/** The CLI also persists Goal facts as typed attachments when SDK events are absent. */
export function projectClaudePersistedGoal(entries: readonly SessionStoreEntry[]): ClaudePersistedGoal {
  let goal: Record<string, unknown> | null = null;
  let updatedAt = 0;
  for (const entry of entries) {
    if (entry.isSidechain === true) continue;
    const attachment = entry.attachment as Record<string, unknown> | undefined;
    const command = entry.commandRun as Record<string, unknown> | undefined;
    if (entry.type === 'attachment' && attachment?.type === 'goal_status' && typeof attachment.condition === 'string') {
      const previous = goal as Record<string, unknown> | null;
      updatedAt = Date.parse(String(entry.timestamp)) || updatedAt;
      goal = { condition: attachment.condition, status: attachment.met === true ? 'complete' : 'active',
        id: attachment.sentinel === true ? entry.uuid : previous?.id,
        iterations: attachment.iterations ?? previous?.iterations ?? 0,
        last_reason: attachment.reason, updatedAt,
        ...(typeof attachment.tokens === 'number' ? { tokensUsed: attachment.tokens } : {}),
        ...(typeof attachment.durationMs === 'number' ? { timeUsedSeconds: attachment.durationMs / 1000 } : {}),
      };
    } else if (entry.type === 'system' && command?.command === 'goal' && typeof command.args === 'string'
      && /^(clear|stop|off|reset|none|cancel)$/i.test(command.args.trim())) {
      goal = null; updatedAt = Date.parse(String(entry.timestamp)) || updatedAt;
    }
  }
  return { goal, updatedAt };
}

/** Resolve the transcript through the SDK's native path selection and the scoped store. */
export async function readClaudePersistedGoal(sdk: ScopedClaudeCatalogSdk, options: {
  configDir: string; projectDirName?: string; sessionId: string; dir: string;
}): Promise<ClaudePersistedGoal | null> {
  if (!sdk.getSessionInfo) return null;
  const projectAlias = options.projectDirName && PROJECT_ALIAS.test(options.projectDirName)
    && !RESERVED_PROJECT_ALIAS.test(options.projectDirName) ? options.projectDirName : undefined;
  const store = new ScopedNativeSessionStore(options.configDir.normalize('NFC'), projectAlias);
  let entries: SessionStoreEntry[] | null = null;
  await sdk.getSessionInfo(options.sessionId, { dir: options.dir, sessionStore: {
    append: async () => { throw new Error('Goal readback cannot write a transcript'); },
    load: async (key: SessionKey) => {
      if (key.sessionId !== options.sessionId || key.subpath) throw new Error('Claude Goal transcript identity mismatch');
      entries = await store.load(key); return entries;
    },
  } satisfies SessionStore });
  return entries ? projectClaudePersistedGoal(entries) : null;
}

function missing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}

/** The SDK still owns chain parsing, summaries, pagination and UUID remapping. */
class ScopedNativeSessionStore implements SessionStore {
  constructor(private readonly configDir: string, private readonly projectAlias?: string) {
    if (!isAbsolute(configDir)) throw new Error('Claude Code config directory must be absolute.');
  }

  private async directory(parts: string[], create = false): Promise<string> {
    if (parts[0] === 'projects' && parts.length > 1 && this.projectAlias) {
      parts = [parts[0], this.projectAlias, ...parts.slice(2)];
    }
    let current = await realpath(this.configDir);
    for (const part of parts) {
      if (!SEGMENT.test(part)) throw new Error('Invalid scoped Claude session path.');
      current = join(current, part);
      if (create) await mkdir(current).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'EEXIST') throw error;
      });
      const info = await lstat(current);
      if (!info.isDirectory() || info.isSymbolicLink()) {
        throw new Error('Scoped Claude session directories cannot be symlinks.');
      }
    }
    return current;
  }

  private async file(key: SessionKey, create = false): Promise<string> {
    if (!UUID.test(key.sessionId)) throw new Error('Invalid scoped Claude session identity.');
    const parts = ['projects', key.projectKey];
    let name = key.sessionId;
    if (key.subpath) {
      const subparts = key.subpath.split('/');
      if (!subparts.every((part) => SEGMENT.test(part))) throw new Error('Invalid scoped Claude subagent path.');
      parts.push(key.sessionId, ...subparts.slice(0, -1));
      name = subparts.at(-1)!;
    }
    const file = join(await this.directory(parts, create), `${name}.jsonl`);
    try {
      const info = await lstat(file);
      if (!info.isFile() || info.isSymbolicLink()) throw new Error('Scoped Claude transcript must be a regular file.');
    } catch (error) {
      if (!missing(error)) throw error;
    }
    return file;
  }

  async load(key: SessionKey): Promise<SessionStoreEntry[] | null> {
    let content: string;
    let file: string;
    try {
      file = await this.file(key);
      content = await readFile(file, 'utf8');
    } catch (error) {
      if (missing(error)) return null;
      throw error;
    }
    const entries = content.split('\n').filter((line) => line.trim()).map((line) => {
      let entry: unknown;
      try { entry = JSON.parse(line); } catch { throw new Error('Scoped Claude transcript contains invalid JSON.'); }
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)
        || typeof (entry as SessionStoreEntry).type !== 'string') {
        throw new Error('Scoped Claude transcript contains an invalid entry.');
      }
      return entry as SessionStoreEntry;
    });
    if (key.subpath) {
      const metadataPath = file.slice(0, -6) + '.meta.json';
      try {
        const info = await lstat(metadataPath);
        if (!info.isFile() || info.isSymbolicLink()) throw new Error('Scoped Claude subagent metadata must be a regular file.');
        let metadata: unknown;
        try { metadata = JSON.parse(await readFile(metadataPath, 'utf8')); } catch {
          throw new Error('Scoped Claude subagent metadata contains invalid JSON.');
        }
        if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
          throw new Error('Scoped Claude subagent metadata contains an invalid entry.');
        }
        entries.push({ ...metadata, type: 'agent_metadata' });
      } catch (error) {
        if (!missing(error)) throw error;
      }
    }
    return entries;
  }

  async append(key: SessionKey, entries: SessionStoreEntry[]): Promise<void> {
    if (entries.length === 0) return;
    for (const entry of entries) {
      if (entry.sessionId !== undefined && entry.sessionId !== key.sessionId) {
        throw new Error('Scoped Claude transcript identity mismatch.');
      }
    }
    const file = await this.file(key, true);
    const handle = await open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW, 0o600);
    try {
      await handle.writeFile(`${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`);
    } finally {
      await handle.close();
    }
  }

  async listSessions(projectKey: string): Promise<Array<{ sessionId: string; mtime: number }>> {
    let directory: string;
    try { directory = await this.directory(['projects', projectKey]); } catch (error) {
      if (missing(error)) return [];
      throw error;
    }
    const rows = [];
    for (const name of await readdir(directory)) {
      const sessionId = name.endsWith('.jsonl') ? name.slice(0, -6) : '';
      if (!UUID.test(sessionId)) continue;
      try {
        const info = await lstat(await this.file({ projectKey, sessionId }));
        rows.push({ sessionId, mtime: info.mtimeMs });
      } catch (error) {
        if (!missing(error)) throw error;
      }
    }
    return rows;
  }

  async listSubkeys(key: { projectKey: string; sessionId: string }): Promise<string[]> {
    if (!UUID.test(key.sessionId)) throw new Error('Invalid scoped Claude session identity.');
    let root: string;
    try { root = await this.directory(['projects', key.projectKey, key.sessionId]); } catch (error) {
      if (missing(error)) return [];
      throw error;
    }
    const keys: string[] = [];
    const pending = [{ directory: root, parts: [] as string[] }];
    while (pending.length) {
      const current = pending.pop()!;
      for (const entry of await readdir(current.directory, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) throw new Error('Scoped Claude subagent directories cannot be symlinks.');
        const parts = [...current.parts, entry.name];
        if (entry.isDirectory() && SEGMENT.test(entry.name)) {
          pending.push({ directory: await this.directory(['projects', key.projectKey, key.sessionId, ...parts]), parts });
        } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          const subpath = parts.join('/').slice(0, -6);
          if (subpath.split('/').every((part) => SEGMENT.test(part))) keys.push(subpath);
        }
      }
    }
    return keys;
  }
}

/** Static SDK filesystem APIs have no env/configDir option; use their public store seam. */
export function scopeClaudeSessionCatalog<T extends ScopedClaudeCatalogSdk>(sdk: T, configDir: string, projectDirName?: string): T {
  const projectAlias = projectDirName && PROJECT_ALIAS.test(projectDirName) && !RESERVED_PROJECT_ALIAS.test(projectDirName)
    ? projectDirName : undefined;
  const store = new ScopedNativeSessionStore(configDir.normalize('NFC'), projectAlias);
  const scoped = <T extends { sessionStore?: unknown }>(options?: T): T & { sessionStore: unknown } => ({
    ...options,
    sessionStore: options?.sessionStore ?? store,
  } as T & { sessionStore: unknown });
  const catalog: ScopedClaudeCatalogSdk = {
    ...sdk,
    ...(sdk.listSessions ? { listSessions: (options) => sdk.listSessions!(scoped(options)) } : {}),
    ...(sdk.getSessionInfo ? { getSessionInfo: (id, options) => sdk.getSessionInfo!(id, scoped(options)) } : {}),
    ...(sdk.getSessionMessages ? { getSessionMessages: (id, options) => sdk.getSessionMessages!(id, scoped(options)) } : {}),
    ...(sdk.listSubagents ? { listSubagents: (id, options) => sdk.listSubagents!(id, scoped(options)) } : {}),
    ...(sdk.getSubagentMessages ? { getSubagentMessages: (id, agent, options) => sdk.getSubagentMessages!(id, agent, scoped(options)) } : {}),
    ...(sdk.forkSession ? { forkSession: (id, options) => sdk.forkSession!(id, scoped(options)) } : {}),
    ...(sdk.renameSession ? { renameSession: (id, title, options) => sdk.renameSession!(id, title, scoped(options)) } : {}),
    ...(sdk.importSessionToStore ? {
      importSessionToStore: async (id, destination, options) => {
        if (!sdk.getSessionInfo) throw new Error('Scoped Claude session import requires SDK identity lookup.');
        const target = destination as SessionStore;
        if (typeof target?.append !== 'function') throw new Error('Claude session import requires a writable destination store.');
        let sourceKey: SessionKey | undefined;
        const identity = await sdk.getSessionInfo(id, {
          dir: options?.dir,
          sessionStore: {
            append: store.append.bind(store),
            load: async (key: SessionKey) => {
              sourceKey = key;
              return store.load(key);
            },
          } satisfies SessionStore,
        });
        if (!identity || !sourceKey || sourceKey.sessionId !== id) {
          throw new Error('Scoped Claude session import could not verify the native identity.');
        }
        const batchSize = options?.batchSize ?? 500;
        if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error('Invalid Claude session import batch size.');
        const copy = async (key: SessionKey) => {
          const entries = await store.load(key) ?? [];
          for (let offset = 0; offset < entries.length; offset += batchSize) {
            await target.append(key, entries.slice(offset, offset + batchSize));
          }
        };
        await copy(sourceKey);
        if (options?.includeSubagents !== false) {
          for (const subpath of await store.listSubkeys(sourceKey)) await copy({ ...sourceKey, subpath });
        }
      },
    } : {}),
  };
  return { ...sdk, ...catalog };
}
