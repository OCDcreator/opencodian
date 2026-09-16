/**
 * OpenCodeAuxScope — isolated execution scope for auxiliary queries.
 *
 * Inline edit needs an OpenCode agent that is provably unable to write, without
 * ever touching the user's configuration. This module owns a dedicated
 * `opencode serve` process started with:
 *
 * - `OPENCODE_CONFIG` pointing at a generated config in a private temp directory,
 *   so the read-only agent definition never lands in a vault `.opencode` folder
 *   or in `~/.config/opencode`;
 * - `OPENCODE_PURE`, so the user's global plugins are not loaded;
 * - a **private session directory** (a temp work dir, not the vault), so the
 *   generated session is scoped to its own project and is therefore invisible to
 *   the chat server's session listing even though both share one session store;
 * - an explicit read-only `external_directory` grant for the caller's directory
 *   (the vault), so the agent can still read the note it is editing.
 *
 * The isolation is *verified*, not assumed: `verifyEffectiveScope()` reads the
 * agent definition and the native tool catalogue back out of the running server
 * and fails closed when either differs from the intended read-only shape.
 *
 * See docs/requirements/inline-edit.md §5.3, §5.4 and §11 (audit item 1).
 */

import { type ChildProcess,spawn } from 'node:child_process';
import fs from 'node:fs';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { createLogger } from '../../../../shared/logger';
import { auxFetchTransport,type AuxTransport } from './AuxTransport';

const logger = createLogger('OpenCodeAuxScope');

/** Agent name used inside the isolated scope. Unique to avoid config collisions. */
export const OPENCODE_AUX_AGENT = 'opencodian-inline-readonly';

/**
 * Tools the aux agent may keep. Matches the reviewed read-only allowlist for the
 * Claude backend (read/search tools, plus read-only network fetches).
 */
export const OPENCODE_AUX_ALLOWED_TOOLS: readonly string[] = [
  'read',
  'grep',
  'glob',
  'webfetch',
  'websearch',
];

/**
 * Built-in tool ids known at the time of writing, taken from the server's own
 * `/experimental/tool/ids`. Every id outside the allowlist is disabled
 * explicitly; a live catalogue that contains anything not covered here fails the
 * scope verification (see `verifyEffectiveScope`).
 */
const KNOWN_OPENCODE_TOOLS: readonly string[] = [
  'invalid',
  'question',
  'bash',
  'read',
  'glob',
  'grep',
  'edit',
  'write',
  'task',
  'webfetch',
  'todowrite',
  'websearch',
  'skill',
  'apply_patch',
  'lsp',
  'multiedit',
  'patch',
  'list',
];

/** Permission classes denied on top of the `*` catch-all. */
const OPENCODE_DENIED_PERMISSIONS: readonly string[] = [
  'edit',
  'bash',
  'task',
  'todowrite',
  'skill',
  'webfetch',
  'websearch',
];

export interface OpenCodeAuxScopeOptions {
  /** Directory the aux session may read; normally the vault root. */
  readonly workingDirectory: string;
  /** Optional explicit path to the `opencode` executable. */
  readonly executablePath?: string;
  /** Extra environment for the spawned server (inherits the plugin process by default). */
  readonly env?: NodeJS.ProcessEnv;
  /**
   * HTTP transport for scope startup, verification, and session traffic.
   * Defaults to plain `fetch`, which works in Node (audit scripts, tests).
   * Inside the Obsidian renderer raw `fetch` to localhost is blocked by the
   * app CSP, so the adapter injects a `requestUrl`-backed transport.
   */
  readonly transport?: AuxTransport;
}

/** Raw permission rule as returned by `GET /agent`. */
interface OpenCodePermissionRule {
  readonly permission?: string;
  readonly pattern?: string;
  readonly action?: string;
}

export interface OpenCodeAuxAgentReadback {
  readonly name: string;
  readonly rules: readonly OpenCodePermissionRule[];
  readonly toolMap: Record<string, boolean>;
}

export interface OpenCodeAuxScopeVerification {
  /** Native built-in tool ids, enumerated from the running server. */
  readonly catalog: readonly string[];
  /** Catalog ids the agent may still use. */
  readonly allowed: readonly string[];
  /** Catalog ids explicitly disabled in the agent tool map. */
  readonly denied: readonly string[];
  readonly agent: OpenCodeAuxAgentReadback;
}

/**
 * Owns the isolated OpenCode server process and its generated config scope.
 *
 * One instance is shared by all aux sessions of the plugin and is disposed on
 * plugin unload; each aux *session* (OpenCode session id) is created and deleted
 * per query by `OpenCodeAuxQuerySession`.
 */
export class OpenCodeAuxScope {
  private child: ChildProcess | null = null;
  private scopeDir: string | null = null;
  private sessionDir: string | null = null;
  private baseUrl: string | null = null;
  private starting: Promise<void> | null = null;
  private verification: OpenCodeAuxScopeVerification | null = null;
  private readRoot: string | null = null;

  constructor(private readonly options: OpenCodeAuxScopeOptions) {}

  private get transport(): AuxTransport {
    return this.options.transport ?? auxFetchTransport;
  }

  /**
   * The private directory the auxiliary session belongs to.
   *
   * Deliberately not the caller's directory: keeping every aux session inside
   * this scope's own project is what keeps it out of the chat session list.
   */
  getSessionDirectory(): string {
    if (!this.sessionDir) {
      throw new Error('OpenCode auxiliary scope is not running.');
    }
    return this.sessionDir;
  }

  /** The directory the auxiliary agent is allowed to read (normally the vault). */
  getReadRoot(): string {
    if (!this.readRoot) {
      throw new Error('OpenCode auxiliary scope is not running.');
    }
    return this.readRoot;
  }

  /** The isolated server base URL, starting it on first use. */
  async ensureStarted(workingDirectory: string): Promise<string> {
    if (this.baseUrl && this.readRoot === workingDirectory) {
      return this.baseUrl;
    }
    if (this.starting) {
      await this.starting;
      if (this.baseUrl && this.readRoot === workingDirectory) {
        return this.baseUrl;
      }
    }
    if (this.baseUrl && this.readRoot !== workingDirectory) {
      // The scope is bound to one read root; a different caller needs a fresh one.
      await this.dispose();
    }
    this.starting = this.start(workingDirectory);
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
    if (!this.baseUrl) {
      throw new Error('OpenCode auxiliary scope failed to start.');
    }
    return this.baseUrl;
  }

  /** Effective-scope evidence captured during startup verification. */
  getVerification(): OpenCodeAuxScopeVerification {
    if (!this.verification) {
      throw new Error('OpenCode auxiliary scope has not been verified yet.');
    }
    return this.verification;
  }

  /**
   * Native session ids currently present in this scope's own project.
   *
   * Because aux sessions live in a private session directory, this list is
   * unaffected by the chat server. Used to prove an aux session left no residue
   * after `dispose()`.
   */
  async listNativeSessionIds(): Promise<string[]> {
    const baseUrl = this.baseUrl;
    const sessionDir = this.sessionDir;
    if (!baseUrl || !sessionDir) {
      throw new Error('OpenCode auxiliary scope is not running.');
    }
    const response = await this.transport(scopeUrl(baseUrl, '/session', sessionDir));
    if (!response.ok) {
      throw new Error(`OpenCode auxiliary scope session readback failed (${response.status}).`);
    }
    const payload = await response.json() as unknown;
    if (!Array.isArray(payload)) return [];
    return payload
      .map((entry) => (typeof entry === 'object' && entry !== null
        ? (entry as Record<string, unknown>).id
        : undefined))
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
  }

  async dispose(): Promise<void> {
    const child = this.child;
    this.child = null;
    this.baseUrl = null;
    this.verification = null;
    this.readRoot = null;
    this.sessionDir = null;
    if (child) {
      await killProcessTree(child);
    }
    const dir = this.scopeDir;
    this.scopeDir = null;
    if (dir) {
      const removed = await removeDirectoryWithRetry(dir);
      if (!removed) {
        logger.warn(`Failed to remove auxiliary scope directory: ${dir}`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Startup
  // ---------------------------------------------------------------------------

  private async start(readRoot: string): Promise<void> {
    const executable = resolveOpenCodeExecutable(this.options.executablePath);
    if (!executable) {
      throw new Error(
        'OpenCode executable for the inline-edit auxiliary scope could not be resolved.',
      );
    }

    const scopeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencodian-inline-aux-'));
    const sessionDir = path.join(scopeDir, 'work');
    fs.mkdirSync(sessionDir, { recursive: true, mode: 0o700 });
    const configPath = path.join(scopeDir, 'opencode.json');
    fs.writeFileSync(configPath, buildScopeConfig(readRoot), { mode: 0o600 });

    const port = await reservePort();
    const env: NodeJS.ProcessEnv = { ...process.env, ...this.options.env };
    env.OPENCODE_CONFIG = configPath;
    env.OPENCODE_PURE = 'true';
    delete env.OPENCODE_CONFIG_DIR;
    delete env.OPENCODE_CONFIG_CONTENT;
    delete env.OPENCODE_PERMISSION;

    const child = spawn(executable.path, [
      'serve',
      '--port',
      String(port),
      '--hostname',
      '127.0.0.1',
    ], {
      cwd: sessionDir,
      env,
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: executable.shell,
      windowsHide: process.platform === 'win32',
    });

    this.child = child;
    this.scopeDir = scopeDir;
    this.sessionDir = sessionDir;
    this.readRoot = readRoot;
    const baseUrl = `http://127.0.0.1:${port}`;

    child.stdout?.on('data', () => { /* drained to avoid backpressure */ });
    child.stderr?.on('data', () => { /* drained to avoid backpressure */ });
    child.once('exit', (code) => {
      if (this.child === child) {
        this.child = null;
        this.baseUrl = null;
        this.verification = null;
        logger.warn(`OpenCode auxiliary scope exited unexpectedly (code ${String(code)})`);
      }
    });

    try {
      await waitForHealth(baseUrl, sessionDir, this.transport);
      this.verification = await verifyEffectiveScope(baseUrl, sessionDir, this.transport);
    } catch (error) {
      await this.dispose();
      throw error instanceof Error ? error : new Error(String(error));
    }
    this.baseUrl = baseUrl;
  }
}

// -----------------------------------------------------------------------------
// Scope config
// -----------------------------------------------------------------------------

/** Build the generated config that defines the read-only agent. */
function buildScopeConfig(readRoot: string): string {
  const allowed = new Set(OPENCODE_AUX_ALLOWED_TOOLS);
  const tools: Record<string, boolean> = {};
  for (const name of KNOWN_OPENCODE_TOOLS) {
    tools[name] = allowed.has(name);
  }
  for (const name of OPENCODE_AUX_ALLOWED_TOOLS) {
    tools[name] = true;
  }

  const permission: Record<string, unknown> = { '*': 'deny' };
  for (const name of OPENCODE_AUX_ALLOWED_TOOLS) {
    permission[name] = 'allow';
  }
  for (const name of OPENCODE_DENIED_PERMISSIONS) {
    permission[name] = name === 'bash' ? { '*': 'deny' } : 'deny';
  }
  // Read-only reach into the caller's directory. Writes remain impossible
  // because no write-capable tool exists in this agent's tool map.
  permission.external_directory = {
    ...buildExternalDirectoryPatterns(readRoot),
    // opencode always allows its own tool-output scratch space.
    [toForwardSlashes(path.join(os.homedir(), '.local', 'share', 'opencode', 'tool-output', '*'))]: 'allow',
  };

  return `${JSON.stringify({
    $schema: 'https://opencode.ai/config.json',
    agent: {
      [OPENCODE_AUX_AGENT]: {
        description: 'OpenCodian inline edit read-only agent (generated, do not edit)',
        mode: 'primary',
        tools,
        permission,
      },
    },
  }, null, 2)}\n`;
}

/** Glob patterns granting read reach into the caller's directory. */
function buildExternalDirectoryPatterns(readRoot: string): Record<string, string> {
  const base = toForwardSlashes(readRoot).replace(/\/+$/, '');
  return {
    [`${escapeGlob(base)}/**`]: 'allow',
    [`${escapeGlob(base)}/*`]: 'allow',
    [escapeGlob(base)]: 'allow',
  };
}

/** Escape glob metacharacters so a path with `[]{}*?` cannot widen the grant. */
function escapeGlob(value: string): string {
  return value.replace(/[\\*?{}[\]]/g, (match) => `\\${match}`);
}

// -----------------------------------------------------------------------------
// Runtime verification (audit item 1)
// -----------------------------------------------------------------------------

/**
 * Read the effective agent definition and the native tool catalogue out of the
 * running server and assert they match the intended read-only shape.
 *
 * Throws — which makes `startAuxQuerySession` reject — when the isolated scope
 * did not take effect.
 */
async function verifyEffectiveScope(
  baseUrl: string,
  workingDirectory: string,
  transport: AuxTransport,
): Promise<OpenCodeAuxScopeVerification> {
  const agentsResponse = await transport(scopeUrl(baseUrl, '/agent', workingDirectory));
  if (!agentsResponse.ok) {
    throw new Error(`OpenCode auxiliary scope agent readback failed (${agentsResponse.status}).`);
  }
  const agents = await agentsResponse.json() as unknown;
  const agent = Array.isArray(agents)
    ? agents.find((entry): entry is Record<string, unknown> => (
      typeof entry === 'object' && entry !== null
      && (entry as Record<string, unknown>).name === OPENCODE_AUX_AGENT
    ))
    : undefined;
  if (!agent) {
    throw new Error('OpenCode auxiliary scope did not load the read-only agent.');
  }

  const rules = Array.isArray(agent.permission)
    ? agent.permission as OpenCodePermissionRule[]
    : [];
  const catchAll = rules.filter((rule) => rule.permission === '*' && rule.pattern === '*');
  const lastCatchAll = catchAll[catchAll.length - 1];
  if (!lastCatchAll || lastCatchAll.action !== 'deny') {
    throw new Error(
      'OpenCode auxiliary scope is not fail-closed: the effective agent has no trailing "*" deny rule.',
    );
  }
  const deniedPermissions = new Set(
    rules.filter((rule) => rule.action === 'deny').map((rule) => rule.permission ?? ''),
  );
  const missingDenies = OPENCODE_DENIED_PERMISSIONS.filter(
    (name) => name !== 'webfetch' && name !== 'websearch' && !deniedPermissions.has(name),
  );
  if (missingDenies.length > 0) {
    throw new Error(
      `OpenCode auxiliary scope is missing deny rules for: ${missingDenies.join(', ')}.`,
    );
  }

  const catalog = await readToolCatalog(baseUrl, workingDirectory, transport);
  const allowed = catalog.filter((id) => OPENCODE_AUX_ALLOWED_TOOLS.includes(id));
  const denied = catalog.filter((id) => !OPENCODE_AUX_ALLOWED_TOOLS.includes(id));
  const uncovered = denied.filter((id) => !KNOWN_OPENCODE_TOOLS.includes(id));
  if (uncovered.length > 0) {
    throw new Error(
      `OpenCode auxiliary scope tool catalogue changed unexpectedly: ${uncovered.join(', ')}. `
      + 'Refusing to run an auxiliary query with an unverified tool.',
    );
  }
  if (allowed.length === 0) {
    throw new Error('OpenCode auxiliary scope exposes no tools at all.');
  }

  const toolMap = isBooleanRecord(agent.tools) ? agent.tools : {};
  logger.debug(
    `OpenCode auxiliary scope verified: agent=${OPENCODE_AUX_AGENT} `
    + `allowed=[${allowed.join(', ')}] catalog=${catalog.length}`,
  );
  return {
    catalog,
    allowed,
    denied,
    agent: { name: OPENCODE_AUX_AGENT, rules, toolMap },
  };
}

async function readToolCatalog(
  baseUrl: string,
  workingDirectory: string,
  transport: AuxTransport,
): Promise<string[]> {
  const response = await transport(scopeUrl(baseUrl, '/experimental/tool/ids', workingDirectory));
  if (!response.ok) {
    throw new Error(
      `OpenCode auxiliary scope tool catalogue readback failed (${response.status}).`,
    );
  }
  const payload = await response.json() as unknown;
  if (!Array.isArray(payload)) {
    throw new Error('OpenCode auxiliary scope returned an invalid tool catalogue.');
  }
  return payload.filter((entry): entry is string => typeof entry === 'string');
}

function isBooleanRecord(value: unknown): value is Record<string, boolean> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value as Record<string, unknown>).every(
    (entry) => typeof entry === 'boolean',
  );
}

// -----------------------------------------------------------------------------
// Transport helpers
// -----------------------------------------------------------------------------

/** Build a scope-scoped URL, mirroring the `directory` query convention. */
export function scopeUrl(baseUrl: string, route: string, directory: string): string {
  const separator = route.includes('?') ? '&' : '?';
  return `${baseUrl}${route}${separator}directory=${encodeURIComponent(toForwardSlashes(directory))}`;
}

function toForwardSlashes(value: string): string {
  return value.replace(/\\/g, '/');
}

async function waitForHealth(baseUrl: string, directory: string, transport: AuxTransport): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await transport(scopeUrl(baseUrl, '/config', directory));
      if (response.ok) {
        return;
      }
    } catch {
      // Server socket is not accepting yet.
    }
    await delay(400);
  }
  throw new Error('OpenCode auxiliary scope did not become ready in time.');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

/**
 * Remove the scope directory, retrying briefly.
 *
 * On Windows the killed server can hold the directory handle for a moment after
 * `taskkill` returns, which surfaces as EBUSY even though the recursive delete
 * is otherwise valid.
 */
async function removeDirectoryWithRetry(dir: string): Promise<boolean> {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return true;
    } catch {
      await delay(250 * (attempt + 1));
    }
  }
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address === 'object' && address) {
        const port = address.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error('Could not reserve a port for the auxiliary scope.')));
      }
    });
  });
}

// -----------------------------------------------------------------------------
// Executable resolution and shutdown
// -----------------------------------------------------------------------------

interface ResolvedExecutable {
  readonly path: string;
  /** Windows `.cmd` shims must be spawned through the shell. */
  readonly shell: boolean;
}

/**
 * Resolve the `opencode` executable.
 *
 * Deliberately local to the aux scope: importing the chat sidecar's resolver
 * would couple this security boundary to the chat runtime.
 */
export function resolveOpenCodeExecutable(configuredPath?: string): ResolvedExecutable | null {
  const env = process.env;
  const candidates: string[] = [];
  const configured = configuredPath?.trim();
  if (configured) {
    candidates.push(expandHome(configured));
  }
  if (process.platform === 'win32') {
    if (env.APPDATA) candidates.push(path.join(env.APPDATA, 'npm', 'opencode.cmd'));
    if (env.LOCALAPPDATA) {
      candidates.push(path.join(env.LOCALAPPDATA, 'npm', 'opencode.cmd'));
      candidates.push(path.join(env.LOCALAPPDATA, 'OpenCode', 'opencode.exe'));
    }
    if (env.USERPROFILE) candidates.push(path.join(env.USERPROFILE, 'bin', 'opencode.cmd'));
  } else {
    if (env.HOME) {
      candidates.push(path.join(env.HOME, '.opencode', 'bin', 'opencode'));
      candidates.push(path.join(env.HOME, '.local', 'bin', 'opencode'));
      candidates.push(path.join(env.HOME, '.npm-global', 'bin', 'opencode'));
      candidates.push(path.join(env.HOME, '.nvm', 'current', 'bin', 'opencode'));
    }
    candidates.push('/opt/homebrew/bin/opencode', '/usr/local/bin/opencode', '/usr/bin/opencode');
  }

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return { path: candidate, shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(candidate) };
    }
  }

  // Fall back to PATH lookup for bare names.
  const onPath = findOnPath(process.platform === 'win32' ? ['opencode.cmd', 'opencode.exe'] : ['opencode']);
  return onPath ? { path: onPath, shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(onPath) } : null;
}

function expandHome(candidate: string): string {
  if (!candidate.startsWith('~')) return candidate;
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
  if (!home) return candidate;
  if (candidate === '~') return home;
  return path.join(home, candidate.slice(2));
}

function findOnPath(names: readonly string[]): string | null {
  const rawPath = process.env.PATH ?? process.env.Path ?? '';
  const entries = rawPath.split(path.delimiter).filter(Boolean);
  const extensions = process.platform === 'win32'
    ? (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';')
    : [''];
  for (const entry of entries) {
    for (const name of names) {
      for (const extension of extensions) {
        const candidate = path.join(entry, `${name}${extension}`);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }
  return null;
}

/** Terminate the auxiliary server, including shim child processes. */
export async function killProcessTree(child: ChildProcess): Promise<void> {
  const pid = child.pid;
  if (pid === undefined) return;
  if (process.platform === 'win32') {
    await new Promise<void>((resolve) => {
      const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      killer.once('exit', () => resolve());
      killer.once('error', () => resolve());
    });
    return;
  }
  try {
    child.kill('SIGTERM');
  } catch {
    // Process already gone.
  }
  await delay(500);
  if (child.exitCode === null && child.signalCode === null) {
    try {
      child.kill('SIGKILL');
    } catch {
      // Process already gone.
    }
  }
}
