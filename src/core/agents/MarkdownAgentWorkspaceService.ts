/**
 * Markdown Agent Workspace Service
 *
 * Manages the file-truth layer for Markdown agent definitions.
 * OpenCode scans agent Markdown files from four directory roots:
 *
 *   `.opencode/agent/`   (project-scoped, preferred)
 *   `.opencode/agents/`  (project-scoped, alternative)
 *   `agent/`             (root-scoped)
 *   `agents/`            (root-scoped)
 *
 * Agent IDs are derived from the relative path segment under those roots,
 * NOT from a plugin-private registry. The plugin mirrors this upstream
 * contract and surfaces divergence explicitly.
 *
 * This service is responsible for:
 * - Scanning and parsing Markdown agent files into `SurfaceAgentFile[]`
 * - Creating, updating, and deleting Markdown agent files
 * - Detecting parse errors, duplicate IDs, and source conflicts
 * - Keeping file-write state and runtime-visibility state separate
 *
 * It does NOT:
 * - Trigger runtime refresh (callers do that)
 * - Merge file truth with config/runtime truth (AgentCatalogService does that)
 * - Invent plugin-private agent semantics
 */

import { parseDocument, stringify as stringifyYaml } from 'yaml';

import { createLogger } from '../../shared';

const logger = createLogger('MarkdownAgentWorkspaceService');

// ---------------------------------------------------------------------------
// Directory root patterns (mirrors upstream OpenCode config/agent.ts)
// ---------------------------------------------------------------------------

/**
 * The four directory roots where OpenCode looks for Markdown agent files.
 * Ordered by preference: project-scoped roots come first.
 */
export const AGENT_FILE_ROOTS = [
  '.opencode/agent',
  '.opencode/agents',
  'agent',
  'agents',
] as const;

export type AgentFileRoot = typeof AGENT_FILE_ROOTS[number];

/**
 * Internal patterns used for extracting agent IDs from paths.
 * Must match the upstream `configEntryNameFromPath` search roots.
 */
const AGENT_FILE_ROOT_PATTERNS = [
  '/.opencode/agent/',
  '/.opencode/agents/',
  '/agent/',
  '/agents/',
] as const;

// ---------------------------------------------------------------------------
// Frontmatter parsing
// ---------------------------------------------------------------------------

/**
 * Extract YAML frontmatter between `---` delimiters and return the remaining
 * body text. Uses a real YAML parser so malformed frontmatter becomes an
 * explicit `parse-error` state instead of being silently ignored.
 */
function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} | { parseError: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const rawFrontmatter = match[1]!;
  const body = content.slice(match[0]!.length).trim();
  const document = parseDocument(rawFrontmatter);

  if (document.errors.length > 0) {
    return {
      parseError: document.errors[0]?.message ?? 'Failed to parse YAML frontmatter',
    };
  }

  const value = document.toJSON();
  if (value === null || value === undefined) {
    return { frontmatter: {}, body };
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    return {
      parseError: 'YAML frontmatter must be an object',
    };
  }

  return { frontmatter: value as Record<string, unknown>, body };
}

// ---------------------------------------------------------------------------
// Agent ID extraction (mirrors upstream configEntryNameFromPath)
// ---------------------------------------------------------------------------

/**
 * Extract the agent ID from a vault-relative path.
 * The ID is the path segment after one of the known roots, minus the `.md`
 * extension. Nested paths are preserved (e.g. `team/researcher` → `team/researcher`).
 */
function agentIdFromPath(vaultRelativePath: string): string | null {
  const normalized = vaultRelativePath.replace(/\\/g, '/');
  for (const pattern of AGENT_FILE_ROOT_PATTERNS) {
    const index = normalized.indexOf(pattern);
    if (index === -1) {
      continue;
    }
    const candidate = normalized.slice(index + pattern.length);
    const ext = candidate.endsWith('.md') ? '.md' : '';
    return ext.length > 0 ? candidate.slice(0, -ext.length) : candidate;
  }
  return null;
}

/**
 * Determine the scope of a vault-relative agent file path.
 */
function scopeFromPath(vaultRelativePath: string): 'project' | 'root' {
  const normalized = vaultRelativePath.replace(/\\/g, '/');
  return normalized.startsWith('.opencode/') ? 'project' : 'root';
}

// ---------------------------------------------------------------------------
// File system interface (dependency injection for testability)
// ---------------------------------------------------------------------------

/**
 * Minimal file system interface needed by the workspace service.
 * Obsidian's `Vault` API provides these operations.
 */
export interface MarkdownAgentFs {
  /**
   * List files recursively under `dirPath`.
   * Returns vault-relative paths ending in `.md`.
   */
  listFiles(dirPath: string): Promise<string[]>;

  /** Read the full text content of a vault-relative file. */
  read(path: string): Promise<string>;

  /** Write text content to a vault-relative file, creating it if needed. */
  write(path: string, content: string): Promise<void>;

  /** Delete a vault-relative file. */
  delete(path: string): Promise<void>;

  /** Get the last modification timestamp for a vault-relative file. */
  getModifiedTime(path: string): Promise<number | undefined>;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Result of a scan operation. Contains all parsed files plus any
 * detected duplicates or parse errors.
 */
export interface MarkdownAgentScanResult {
  /** Successfully parsed files. */
  readonly files: readonly import('./types').SurfaceAgentFile[];

  /** Agent IDs that appear in more than one file. */
  readonly duplicateIds: readonly string[];

  /** Files that failed to parse. */
  readonly parseErrors: readonly {
    readonly path: string;
    readonly error: string;
  }[];
}

/**
 * Input for creating or updating a Markdown agent file.
 */
export interface MarkdownAgentFileInput {
  /** The desired agent ID. */
  readonly agentId: string;

  /** Which root directory to write into. */
  readonly root: AgentFileRoot;

  /** Frontmatter fields (mode, model, etc.). */
  readonly frontmatter: Record<string, unknown>;

  /** The prompt body (Markdown content after frontmatter). */
  readonly promptBody: string;
}

export class MarkdownAgentWorkspaceService {
  constructor(private readonly fs: MarkdownAgentFs) {}

  /**
   * Scan all known agent file roots and parse each Markdown file.
   *
   * Returns a `MarkdownAgentScanResult` that separates successfully parsed
   * files from duplicates and parse errors. Duplicates are tracked but NOT
   * deduplicated — the caller decides how to surface them.
   */
  async scan(): Promise<MarkdownAgentScanResult> {
    const rawFiles: {
      path: string;
      scope: 'project' | 'root';
      agentId: string;
    }[] = [];

    // Scan all four roots in parallel
    const scanResults = await Promise.all(
      AGENT_FILE_ROOTS.map(async (root) => {
        try {
          const paths = await this.fs.listFiles(root);
          return paths.map((p) => ({
            path: p,
            scope: scopeFromPath(p),
            agentId: agentIdFromPath(p),
          }));
        } catch {
          // Directory may not exist — that's fine
          return [];
        }
      }),
    );

    for (const batch of scanResults) {
      for (const entry of batch) {
        if (entry.agentId !== null) {
          rawFiles.push({
            path: entry.path,
            scope: entry.scope,
            agentId: entry.agentId,
          });
        }
      }
    }

    // Detect duplicates
    const idCounts = new Map<string, number>();
    for (const file of rawFiles) {
      idCounts.set(file.agentId, (idCounts.get(file.agentId) ?? 0) + 1);
    }
    const duplicateIds = Array.from(idCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([id]) => id);

    // Parse each file
    const files: import('./types').SurfaceAgentFile[] = [];
    const parseErrors: { path: string; error: string }[] = [];

    const parsedResults = await Promise.allSettled(
      rawFiles.map(async (raw) => {
        const content = await this.fs.read(raw.path);
        const lastModifiedAt = await this.fs.getModifiedTime(raw.path);
        const result = parseFrontmatter(content);

        if ('parseError' in result) {
          return {
            type: 'error' as const,
            path: raw.path,
            error: result.parseError,
          };
        }

        const isDuplicate = duplicateIds.includes(raw.agentId);
        return {
          type: 'success' as const,
          file: {
            path: raw.path,
            scope: raw.scope,
            agentId: raw.agentId,
            frontmatter: result.frontmatter,
            promptBody: result.body,
            parseStatus: isDuplicate ? 'duplicate-id' as const : 'ok' as const,
            lastModifiedAt,
            runtimeSeen: false,
          } satisfies import('./types').SurfaceAgentFile,
        };
      }),
    );

    for (const result of parsedResults) {
      if (result.status === 'rejected') {
        parseErrors.push({
          path: '(unknown)',
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
        continue;
      }

      if (result.value.type === 'error') {
        parseErrors.push({
          path: result.value.path,
          error: result.value.error,
        });
        continue;
      }

      files.push(result.value.file);
    }

    return { files, duplicateIds, parseErrors };
  }

  /**
   * Mark which agent IDs are currently visible in the runtime.
   * This updates the `runtimeSeen` flag on scan results without re-reading files.
   */
  markRuntimeSeen(
    files: readonly import('./types').SurfaceAgentFile[],
    runtimeAgentIds: ReadonlySet<string>,
  ): import('./types').SurfaceAgentFile[] {
    return files.map((file) => ({
      ...file,
      runtimeSeen: runtimeAgentIds.has(file.agentId),
    }));
  }

  /**
   * Create a new Markdown agent file.
   * Returns the vault-relative path of the created file.
   */
  async create(input: MarkdownAgentFileInput): Promise<string> {
    const vaultPath = `${input.root}/${input.agentId}.md`;
    const content = this.serializeMarkdown(input.frontmatter, input.promptBody);
    await this.fs.write(vaultPath, content);
    logger.info('Created Markdown agent file', { path: vaultPath });
    return vaultPath;
  }

  /**
   * Update an existing Markdown agent file.
   * The file is identified by its vault-relative path.
   */
  async update(
    vaultPath: string,
    input: Omit<MarkdownAgentFileInput, 'root'>,
  ): Promise<void> {
    const content = this.serializeMarkdown(input.frontmatter, input.promptBody);
    await this.fs.write(vaultPath, content);
    logger.info('Updated Markdown agent file', { path: vaultPath });
  }

  /**
   * Delete a Markdown agent file by vault-relative path.
   */
  async deleteFile(vaultPath: string): Promise<void> {
    await this.fs.delete(vaultPath);
    logger.info('Deleted Markdown agent file', { path: vaultPath });
  }

  /**
   * Serialize frontmatter + body into a Markdown string.
   */
  private serializeMarkdown(
    frontmatter: Record<string, unknown>,
    body: string,
  ): string {
    const entries = Object.entries(frontmatter).filter(
      ([, value]) => value !== undefined,
    );

    if (entries.length === 0) {
      return body;
    }

    const yamlBlock = stringifyYaml(Object.fromEntries(entries)).trimEnd();
    return `---\n${yamlBlock}\n---\n${body}`;
  }
}
