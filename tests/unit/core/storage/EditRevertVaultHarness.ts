/**
 * In-memory Obsidian vault double for R-B3 edit-revert tests.
 *
 * Serves both namespaces the service touches: real vault files (written back
 * through `vault.process` / `vault.create` / `vault.trash`) and plugin-data
 * checkpoint artifacts (`.opencodian/checkpoints/**` via the data adapter).
 * Vault mutations emit the same events Obsidian would, so the service's
 * vault-event funnel and its self-write guard are exercised for real.
 */

import { TFile } from 'obsidian';

import { EditRevertService } from '../../../../src/core/storage/EditRevertService';

export const VAULT_BASE = '/test-vault';
export const CONVERSATION_ID = 'conv-1';
export const POST_TURN_GRACE_MS = 10 * 60 * 1000;

type VaultFileHandler = (file: TFile) => void;

export class EditRevertVaultHarness {
  /** Vault content files keyed by vault-relative path. */
  readonly vaultFiles = new Map<string, string>();
  /** Plugin-data artifacts (checkpoint blobs and round JSONs). */
  readonly diskFiles = new Map<string, string>();
  readonly trashLog: Array<{ path: string; system: boolean }> = [];
  readonly processLog: string[] = [];
  readonly createLog: string[] = [];
  /** Every adapter write; must stay under the plugin data prefix. */
  readonly adapterWriteLog: string[] = [];
  private readonly dirs = new Set<string>();
  private readonly handlers: Record<'modify' | 'create' | 'delete', VaultFileHandler[]> = {
    modify: [],
    create: [],
    delete: [],
  };

  readonly adapter = {
    exists: async (path: string): Promise<boolean> => {
      return this.dirs.has(path) || this.diskFiles.has(path) || this.vaultFiles.has(path);
    },
    mkdir: async (path: string): Promise<void> => {
      this.dirs.add(path);
    },
    write: async (path: string, data: string): Promise<void> => {
      this.adapterWriteLog.push(path);
      this.diskFiles.set(path, data);
    },
    read: async (path: string): Promise<string> => {
      const content = this.vaultFiles.get(path) ?? this.diskFiles.get(path);
      if (content === undefined) {
        throw new Error(`file not found: ${path}`);
      }
      return content;
    },
    remove: async (path: string): Promise<void> => {
      this.diskFiles.delete(path);
      this.dirs.delete(path);
    },
    stat: async (path: string): Promise<{ size: number }> => {
      const content = this.vaultFiles.get(path) ?? this.diskFiles.get(path);
      if (content === undefined) {
        throw new Error(`file not found: ${path}`);
      }
      return { size: Buffer.byteLength(content, 'utf8') };
    },
    list: async (prefix: string): Promise<{ files: string[]; folders: string[] }> => {
      const direct = (path: string): boolean => {
        if (!path.startsWith(`${prefix}/`)) {
          return false;
        }
        return path.slice(prefix.length + 1).split('/').length === 1;
      };
      return {
        files: [...this.diskFiles.keys()].filter((path) => direct(path) && !this.dirs.has(path)),
        folders: [...this.dirs].filter(direct),
      };
    },
    getBasePath: (): string => VAULT_BASE,
  };

  readonly vault = {
    adapter: this.adapter,
    on: (name: 'modify' | 'create' | 'delete', handler: VaultFileHandler): unknown => {
      this.handlers[name].push(handler);
      return { off: (): void => undefined };
    },
    offref: (_ref: unknown): void => undefined,
    getAbstractFileByPath: (path: string): TFile | null => {
      return this.vaultFiles.has(path) ? makeTFile(path) : null;
    },
    process: async (file: TFile, fn: (content: string) => string): Promise<TFile> => {
      const next = fn(this.vaultFiles.get(file.path) ?? '');
      this.vaultFiles.set(file.path, next);
      this.processLog.push(file.path);
      this.emit('modify', file.path);
      return file;
    },
    create: async (path: string, content: string): Promise<TFile> => {
      this.vaultFiles.set(path, content);
      this.createLog.push(path);
      this.emit('create', path);
      return makeTFile(path);
    },
    trash: async (file: TFile, system: boolean): Promise<void> => {
      this.vaultFiles.delete(file.path);
      this.trashLog.push({ path: file.path, system });
      this.emit('delete', file.path);
    },
  };

  /** Simulate the agent (or user) writing an existing vault file. */
  writeAgentFile(path: string, content: string): void {
    this.vaultFiles.set(path, content);
    this.emit('modify', path);
  }

  /** Simulate the agent creating a new vault file. */
  createAgentFile(path: string, content: string): void {
    this.vaultFiles.set(path, content);
    this.emit('create', path);
  }

  diskFilesUnder(prefix: string): string[] {
    return [...this.diskFiles.keys()].filter((path) => path.startsWith(prefix));
  }

  private emit(name: 'modify' | 'create' | 'delete', path: string): void {
    for (const handler of [...this.handlers[name]]) {
      handler(makeTFile(path));
    }
  }
}

export function makeTFile(path: string): TFile {
  const file = new TFile();
  file.path = path;
  file.name = path.split('/').pop() ?? path;
  file.basename = file.name.replace(/\.[^.]+$/, '');
  file.extension = file.name.includes('.') ? (file.name.split('.').pop() ?? '') : '';
  return file;
}

export interface HarnessService {
  service: EditRevertService;
  clock: { value: number };
  /** Advance the injected clock (also used to expire the post-turn grace). */
  advance(ms: number): void;
  harness: EditRevertVaultHarness;
}

export function createHarnessService(
  overrides: Partial<{
    isEnabled: () => boolean;
    now: () => number;
    limitBytes: number;
    harness: EditRevertVaultHarness;
  }> = {},
): HarnessService {
  const harness = overrides.harness ?? new EditRevertVaultHarness();
  const clock = { value: 1_000_000 };
  const service = new EditRevertService({
    app: { vault: harness.vault } as unknown as { vault: unknown },
    isEnabled: overrides.isEnabled ?? (() => true),
    getSnapshotLimitBytes: () => overrides.limitBytes ?? 50 * 1024 * 1024,
    now: overrides.now ?? (() => clock.value),
  } as unknown as ConstructorParameters<typeof EditRevertService>[0]);
  return {
    service,
    clock,
    advance: (ms: number) => {
      clock.value += ms;
    },
    harness,
  };
}

/** Await the service queue twice so tasks enqueued by a tail task also settle. */
export async function settle(service: EditRevertService): Promise<void> {
  await service.flush();
  await service.flush();
}

/** Run one full capture round: begin -> mutations -> end -> grace expiry. */
export async function runRound(
  context: HarnessService,
  options: {
    conversationId?: string;
    backend?: string;
    userText?: string;
    contextPaths?: string[];
    mutate?: () => void;
  } = {},
): Promise<string> {
  const { service } = context;
  const conversationId = options.conversationId ?? CONVERSATION_ID;
  service.beginTurnCapture({
    conversationId,
    backend: options.backend ?? 'opencode',
    userText: options.userText ?? '',
    contextPaths: options.contextPaths ?? [],
  });
  await settle(service);
  options.mutate?.();
  await settle(service);
  service.endTurnCapture(conversationId);
  await settle(service);
  context.advance(POST_TURN_GRACE_MS + 1);
  return conversationId;
}
