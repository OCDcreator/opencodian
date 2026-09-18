/**
 * In-memory Obsidian vault double for R-B3 edit-revert tests.
 *
 * Serves both namespaces the service touches: real vault files (written back
 * through `vault.process` / `vault.create` / `vault.trash`) and plugin-data
 * checkpoint artifacts (`.opencodian/checkpoints/**` via the data adapter).
 * Vault mutations emit the same events Obsidian would, so the service's
 * vault-event funnel and its self-write guard are exercised for real.
 */

import { TFile, TFolder } from 'obsidian';

import { EditRevertService } from '../../../../src/core/storage/EditRevertService';

export const VAULT_BASE = '/test-vault';
export const CONVERSATION_ID = 'conv-1';
export const POST_TURN_GRACE_MS = 10 * 60 * 1000;

type VaultFileHandler = (file: TFile) => void;

/** The direct child folder segment of `path`; '' for vault-root entries. */
function parentFolderOf(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}

/**
 * Split a test note into its frontmatter block and the remainder. Test notes
 * store frontmatter as JSON (a valid YAML subset), so `processFrontMatter`
 * can round-trip typed property values without a real YAML engine.
 */
function splitFrontmatter(content: string): { frontmatter: Record<string, unknown>; rest: string } | null {
  if (!content.startsWith('---\n')) {
    return null;
  }
  const end = content.indexOf('\n---\n', 4);
  if (end === -1) {
    return null;
  }
  const raw = content.slice(4, end);
  const rest = content.slice(end + '\n---\n'.length);
  return { frontmatter: JSON.parse(raw) as Record<string, unknown>, rest };
}

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
  /** R-B5: every fileManager.renameFile, in call order. */
  readonly renameLog: Array<{ from: string; to: string }> = [];
  /** R-B5: call-order log proving snapshots happen before writes. */
  readonly operationOrder: string[] = [];
  /** R-B5-D1: explicitly created vault folders (folders persist once created). */
  readonly folders = new Set<string>();
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
      this.folders.delete(path);
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
      // Vault files AND plugin-data artifacts are both direct children.
      const files = new Set<string>();
      for (const path of this.diskFiles.keys()) {
        if (direct(path) && !this.dirs.has(path)) {
          files.add(path);
        }
      }
      for (const path of this.vaultFiles.keys()) {
        if (direct(path)) {
          files.add(path);
        }
      }
      // Folders: adapter mkdirs (plugin data) and created vault folders.
      // Folders persist until removed — no derivation from file paths.
      const folders = new Set<string>();
      for (const path of this.dirs) {
        if (direct(path)) {
          folders.add(path);
        }
      }
      for (const path of this.folders) {
        if (direct(path)) {
          folders.add(path);
        }
      }
      return { files: [...files], folders: [...folders] };
    },
    getBasePath: (): string => VAULT_BASE,
  };

  /** True when the vault folder `path` exists (folders persist until removed, like Obsidian). */
  hasVaultFolder(path: string): boolean {
    if (!path) {
      return true; // vault root
    }
    return this.folders.has(path);
  }

  readonly vault = {
    adapter: this.adapter,
    on: (name: 'modify' | 'create' | 'delete', handler: VaultFileHandler): unknown => {
      this.handlers[name].push(handler);
      return { off: (): void => undefined };
    },
    offref: (_ref: unknown): void => undefined,
    getAbstractFileByPath: (path: string): TFile | TFolder | null => {
      if (this.vaultFiles.has(path)) {
        return makeTFile(path);
      }
      return this.hasVaultFolder(path) ? makeTFolder(path) : null;
    },
    getMarkdownFiles: (): TFile[] => {
      return [...this.vaultFiles.keys()].filter((path) => path.endsWith('.md')).map(makeTFile);
    },
    cachedRead: async (file: TFile): Promise<string> => {
      const content = this.vaultFiles.get(file.path);
      if (content === undefined) {
        throw new Error(`file not found: ${file.path}`);
      }
      return content;
    },
    createFolder: async (path: string): Promise<TFolder> => {
      // Real `vault.createFolder` creates missing ancestors; it never fails
      // for a not-yet-existing path, so the double mirrors that.
      this.folders.add(path);
      return makeTFolder(path);
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

  /**
   * R-B5: fileManager double. `renameFile` moves the vault key WITHOUT
   * emitting modify/create/delete events — exactly like Obsidian, where a
   * rename fires only a `rename` event the event funnel does not observe.
   * R-B5-D1: like the real API it does NOT create parent folders — renaming
   * into a folder that does not exist throws.
   */
  readonly fileManager = {
    renameFile: async (file: TFile, newPath: string): Promise<void> => {
      const content = this.vaultFiles.get(file.path);
      if (content === undefined) {
        throw new Error(`file not found: ${file.path}`);
      }
      if (this.vaultFiles.has(newPath)) {
        throw new Error('target already exists');
      }
      const parent = parentFolderOf(newPath);
      if (!this.hasVaultFolder(parent)) {
        throw new Error(`target folder does not exist: ${parent || '(root)'}`);
      }
      this.operationOrder.push(`rename:${file.path}`);
      this.vaultFiles.delete(file.path);
      this.vaultFiles.set(newPath, content);
      this.renameLog.push({ from: file.path, to: newPath });
    },
    processFrontMatter: async (file: TFile, fn: (frontmatter: Record<string, unknown>) => void): Promise<void> => {
      const content = this.vaultFiles.get(file.path) ?? '';
      const parsed = splitFrontmatter(content);
      this.operationOrder.push(`frontmatter:${file.path}`);
      if (!parsed) {
        throw new Error(`no frontmatter block: ${file.path}`);
      }
      fn(parsed.frontmatter);
      const next = `---\n${JSON.stringify(parsed.frontmatter)}\n---\n${parsed.rest}`;
      await this.vault.process(file, () => next);
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

export function makeTFolder(path: string): TFolder {
  const folder = new TFolder();
  folder.path = path;
  folder.name = path.split('/').pop() ?? path;
  return folder;
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
    app: { vault: harness.vault, fileManager: harness.fileManager } as unknown as { vault: unknown },
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
