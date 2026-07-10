/**
 * Static capability registry for the OpenCode SDK 1.17.18 surface.
 *
 * This registry is the immutable metadata source for the capability
 * availability layer (Task 2). Each entry describes one SDK method, its risk
 * class, its user opt-in gate default, and how (if at all) the discovery
 * coordinator should probe live server support.
 *
 * Source of truth for IDs and `sdkPath` values:
 * `docs/status/opencode-sdk-1.17.18-capability-inventory.md`.
 *
 * The entry list is adapted (field-for-field) from the
 * `codex/opencode-sdk-117-capability-registry` worktree registry at commit
 * `b3ed2edd`, but remapped to the plan's `OpenCodeSdkCapabilityDefinition`
 * shape. It intentionally contains no probe-runtime concerns (no `callArgs`,
 * no `expectedKeys`); those belong to the Capability Lab probe runner
 * (Task 7).
 */

import type { OpenCodeSdkCapabilitySafety } from './OpenCodeSdkCapabilityState';

export type OpenCodeSdkCapabilityCategory =
  | 'top-level-app'
  | 'top-level-auth'
  | 'top-level-config'
  | 'top-level-event'
  | 'top-level-files'
  | 'top-level-mcp'
  | 'top-level-project'
  | 'top-level-runtime'
  | 'top-level-session'
  | 'top-level-tui'
  | 'top-level-vcs'
  | 'experimental'
  | 'v2-core'
  | 'v2-session'
  | 'v2-catalog'
  | 'v2-integration'
  | 'v2-permission-question'
  | 'v2-files'
  | 'v2-runtime'
  | 'v2-project';

/**
 * Which plugin surface owns a capability. 'diagnostic' = Capability Lab only.
 */
export type OpenCodeSdkCapabilitySurface = 'chat' | 'settings' | 'both' | 'diagnostic';

/**
 * How the discovery coordinator probes server support for an entry.
 * - `read`     → may invoke a safe read method to confirm the endpoint exists.
 * - `presence` → only checks `typeof resolved === 'function'` (SDK presence).
 * - `none`     → never invoked as a probe (all state-changing/experimental entries).
 */
export type OpenCodeSdkCapabilityServerProbe = 'read' | 'presence' | 'none';

/**
 * How the plugin surfaces a capability that is not available.
 * - `legacy-fallback`        → silently route to the legacy HTTP path (stable read/stream).
 * - `unsupported-visible`    → show as disabled-with-reason in Settings.
 * - `experimental-gated`     → hidden unless the experimental gate is explicitly enabled.
 * - `none`                   → no automatic surfacing.
 */
export type OpenCodeSdkCapabilityFallbackPolicy =
  | 'legacy-fallback'
  | 'unsupported-visible'
  | 'experimental-gated'
  | 'none';

export interface OpenCodeSdkCapabilityDefinition {
  /** Stable capability id, e.g. `v2.health.get`. */
  readonly id: string;
  /** Dotted SDK client path resolved against the facade, e.g. `['v2','health','get']`. */
  readonly sdkPath: readonly string[];
  readonly category: OpenCodeSdkCapabilityCategory;
  readonly surface: OpenCodeSdkCapabilitySurface;
  /** Risk classification; feeds the availability resolver. */
  readonly risk: OpenCodeSdkCapabilitySafety;
  /** Default user opt-in gate (read-only → true; state-changing/experimental/stream → false). */
  readonly defaultGate: boolean;
  readonly serverProbe: OpenCodeSdkCapabilityServerProbe;
  readonly fallbackPolicy: OpenCodeSdkCapabilityFallbackPolicy;
  /** Minimum server version hint surfaced when the endpoint is missing. */
  readonly minimumServerHint: string | undefined;
  readonly description: string;
}

interface OpenCodeSdkCapabilityBaseSpec {
  readonly id: string;
  readonly category: OpenCodeSdkCapabilityCategory;
  readonly surface: OpenCodeSdkCapabilitySurface;
  readonly description: string;
  readonly minimumServerHint?: string;
}

const MINIMUM_SERVER_HINT_117 = 'OpenCode server 1.17+';

function readOnlyEntry(
  spec: OpenCodeSdkCapabilityBaseSpec,
  sdkPath: readonly string[],
): OpenCodeSdkCapabilityDefinition {
  return {
    id: spec.id,
    sdkPath,
    category: spec.category,
    surface: spec.surface,
    risk: 'read-only',
    defaultGate: true,
    serverProbe: 'read',
    fallbackPolicy: spec.surface === 'diagnostic' ? 'unsupported-visible' : 'legacy-fallback',
    minimumServerHint: spec.minimumServerHint,
    description: spec.description,
  };
}

function streamEntry(
  spec: OpenCodeSdkCapabilityBaseSpec,
  sdkPath: readonly string[],
): OpenCodeSdkCapabilityDefinition {
  return {
    id: spec.id,
    sdkPath,
    category: spec.category,
    surface: spec.surface,
    risk: 'stream',
    defaultGate: false,
    serverProbe: 'presence',
    fallbackPolicy: 'legacy-fallback',
    minimumServerHint: spec.minimumServerHint,
    description: spec.description,
  };
}

function presenceEntry(
  spec: OpenCodeSdkCapabilityBaseSpec,
  sdkPath: readonly string[],
  risk: OpenCodeSdkCapabilitySafety,
): OpenCodeSdkCapabilityDefinition {
  return {
    id: spec.id,
    sdkPath,
    category: spec.category,
    surface: spec.surface,
    risk,
    defaultGate: false,
    serverProbe: 'presence',
    fallbackPolicy: 'experimental-gated',
    minimumServerHint: spec.minimumServerHint,
    description: spec.description,
  };
}

function stateChangingEntry(
  spec: OpenCodeSdkCapabilityBaseSpec,
  sdkPath: readonly string[],
  risk: OpenCodeSdkCapabilitySafety,
): OpenCodeSdkCapabilityDefinition {
  return {
    id: spec.id,
    sdkPath,
    category: spec.category,
    surface: spec.surface,
    risk,
    defaultGate: false,
    serverProbe: 'none',
    fallbackPolicy: 'experimental-gated',
    minimumServerHint: spec.minimumServerHint,
    description: spec.description,
  };
}

/**
 * Build the dotted-path segments from a `namespace.method` id-style string.
 * e.g. `path('v2.health', 'get')` → `['v2','health','get']`.
 */
function path(namespace: string, method: string): readonly string[] {
  return [...namespace.split('.'), method];
}

export const OPENCODE_SDK_CAPABILITY_REGISTRY: readonly OpenCodeSdkCapabilityDefinition[] = [
  // ---------- top-level auth (state-changing) ----------
  stateChangingEntry({ id: 'auth.remove', category: 'top-level-auth', surface: 'settings', description: 'Remove provider auth credentials.' }, path('auth', 'remove'), 'state-changing'),
  stateChangingEntry({ id: 'auth.set', category: 'top-level-auth', surface: 'settings', description: 'Set provider auth credentials.' }, path('auth', 'set'), 'state-changing'),

  // ---------- top-level app ----------
  stateChangingEntry({ id: 'app.log', category: 'top-level-app', surface: 'diagnostic', description: 'Write a diagnostic log entry to the OpenCode server.' }, path('app', 'log'), 'state-changing'),
  readOnlyEntry({ id: 'app.agents', category: 'top-level-app', surface: 'settings', description: 'List OpenCode agents.' }, path('app', 'agents')),
  readOnlyEntry({ id: 'app.skills', category: 'top-level-app', surface: 'settings', description: 'List OpenCode skills.' }, path('app', 'skills')),

  // ---------- experimental.* ----------
  stateChangingEntry({ id: 'experimental.controlPlane.moveSession', category: 'experimental', surface: 'diagnostic', description: 'Move a session between locations.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('experimental.controlPlane', 'moveSession'), 'state-changing'),
  readOnlyEntry({ id: 'experimental.capabilities.get', category: 'experimental', surface: 'diagnostic', description: 'Read server-advertised experimental capability flags.' }, path('experimental.capabilities', 'get')),
  readOnlyEntry({ id: 'experimental.console.get', category: 'experimental', surface: 'diagnostic', description: 'Read active Console provider metadata.' }, path('experimental.console', 'get')),
  readOnlyEntry({ id: 'experimental.console.listOrgs', category: 'experimental', surface: 'diagnostic', description: 'List switchable Console organizations.' }, path('experimental.console', 'listOrgs')),
  stateChangingEntry({ id: 'experimental.console.switchOrg', category: 'experimental', surface: 'diagnostic', description: 'Switch the active Console organization.' }, path('experimental.console', 'switchOrg'), 'state-changing'),
  readOnlyEntry({ id: 'experimental.session.list', category: 'experimental', surface: 'diagnostic', description: 'List experimental sessions.' }, path('experimental.session', 'list')),
  stateChangingEntry({ id: 'experimental.session.background', category: 'experimental', surface: 'diagnostic', description: 'Detach synchronous subagents into the background.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('experimental.session', 'background'), 'state-changing'),
  readOnlyEntry({ id: 'experimental.resource.list', category: 'experimental', surface: 'diagnostic', description: 'List MCP resources.' }, path('experimental.resource', 'list')),
  presenceEntry({ id: 'experimental.projectCopy.generateName', category: 'experimental', surface: 'diagnostic', description: 'Generate a project-copy name from task context.' }, path('experimental.projectCopy', 'generateName'), 'experimental-action'),
  readOnlyEntry({ id: 'experimental.workspace.adapter.list', category: 'experimental', surface: 'diagnostic', description: 'List workspace adapters.' }, path('experimental.workspace.adapter', 'list')),
  readOnlyEntry({ id: 'experimental.workspace.list', category: 'experimental', surface: 'diagnostic', description: 'List workspaces.' }, path('experimental.workspace', 'list')),
  stateChangingEntry({ id: 'experimental.workspace.create', category: 'experimental', surface: 'diagnostic', description: 'Create a workspace.' }, path('experimental.workspace', 'create'), 'state-changing'),
  stateChangingEntry({ id: 'experimental.workspace.syncList', category: 'experimental', surface: 'diagnostic', description: 'Register missing adapter workspaces.' }, path('experimental.workspace', 'syncList'), 'state-changing'),
  readOnlyEntry({ id: 'experimental.workspace.status', category: 'experimental', surface: 'diagnostic', description: 'Read workspace connection status.' }, path('experimental.workspace', 'status')),
  stateChangingEntry({ id: 'experimental.workspace.remove', category: 'experimental', surface: 'diagnostic', description: 'Remove a workspace.' }, path('experimental.workspace', 'remove'), 'state-changing'),
  stateChangingEntry({ id: 'experimental.workspace.warp', category: 'experimental', surface: 'diagnostic', description: 'Warp a session into a workspace.' }, path('experimental.workspace', 'warp'), 'state-changing'),

  // ---------- top-level runtime / global ----------
  readOnlyEntry({ id: 'global.health', category: 'top-level-runtime', surface: 'settings', description: 'Read global OpenCode health.' }, path('global', 'health')),
  streamEntry({ id: 'global.event', category: 'top-level-event', surface: 'chat', description: 'Subscribe to global OpenCode events.' }, path('global', 'event')),
  stateChangingEntry({ id: 'global.dispose', category: 'top-level-runtime', surface: 'diagnostic', description: 'Dispose OpenCode instances.' }, path('global', 'dispose'), 'state-changing'),
  stateChangingEntry({ id: 'global.upgrade', category: 'top-level-runtime', surface: 'diagnostic', description: 'Upgrade the OpenCode server binary.' }, path('global', 'upgrade'), 'state-changing'),
  readOnlyEntry({ id: 'global.config.get', category: 'top-level-config', surface: 'settings', description: 'Read global OpenCode configuration.' }, path('global.config', 'get')),
  stateChangingEntry({ id: 'global.config.update', category: 'top-level-config', surface: 'settings', description: 'Update global OpenCode configuration.' }, path('global.config', 'update'), 'state-changing'),

  // ---------- event / config / tool / worktree ----------
  streamEntry({ id: 'event.subscribe', category: 'top-level-event', surface: 'chat', description: 'Subscribe to scoped OpenCode events.' }, path('event', 'subscribe')),
  readOnlyEntry({ id: 'config.get', category: 'top-level-config', surface: 'settings', description: 'Read scoped OpenCode configuration.' }, path('config', 'get')),
  stateChangingEntry({ id: 'config.update', category: 'top-level-config', surface: 'settings', description: 'Update scoped OpenCode configuration.' }, path('config', 'update'), 'state-changing'),
  readOnlyEntry({ id: 'config.providers', category: 'top-level-config', surface: 'settings', description: 'List configured providers.' }, path('config', 'providers')),
  presenceEntry({ id: 'tool.list', category: 'top-level-runtime', surface: 'diagnostic', description: 'List tools for a provider/model fixture.' }, path('tool', 'list'), 'experimental-action'),
  readOnlyEntry({ id: 'tool.ids', category: 'top-level-runtime', surface: 'settings', description: 'List tool IDs.' }, path('tool', 'ids')),
  stateChangingEntry({ id: 'worktree.remove', category: 'top-level-runtime', surface: 'diagnostic', description: 'Remove a git worktree and branch.' }, path('worktree', 'remove'), 'state-changing'),
  readOnlyEntry({ id: 'worktree.list', category: 'top-level-runtime', surface: 'diagnostic', description: 'List sandbox worktrees.' }, path('worktree', 'list')),
  stateChangingEntry({ id: 'worktree.create', category: 'top-level-runtime', surface: 'diagnostic', description: 'Create a sandbox worktree.' }, path('worktree', 'create'), 'state-changing'),
  stateChangingEntry({ id: 'worktree.reset', category: 'top-level-runtime', surface: 'diagnostic', description: 'Reset a sandbox worktree.' }, path('worktree', 'reset'), 'state-changing'),

  // ---------- find / file / path / instance ----------
  presenceEntry({ id: 'find.text', category: 'top-level-files', surface: 'diagnostic', description: 'Find text by pattern.' }, path('find', 'text'), 'experimental-action'),
  presenceEntry({ id: 'find.files', category: 'top-level-files', surface: 'diagnostic', description: 'Find files by query.' }, path('find', 'files'), 'experimental-action'),
  presenceEntry({ id: 'find.symbols', category: 'top-level-files', surface: 'diagnostic', description: 'Find symbols by query.' }, path('find', 'symbols'), 'experimental-action'),
  presenceEntry({ id: 'file.list', category: 'top-level-files', surface: 'diagnostic', description: 'List files for a path fixture.' }, path('file', 'list'), 'experimental-action'),
  presenceEntry({ id: 'file.read', category: 'top-level-files', surface: 'diagnostic', description: 'Read a file fixture.' }, path('file', 'read'), 'experimental-action'),
  readOnlyEntry({ id: 'file.status', category: 'top-level-files', surface: 'settings', description: 'Read file status.' }, path('file', 'status')),
  stateChangingEntry({ id: 'instance.dispose', category: 'top-level-runtime', surface: 'diagnostic', description: 'Dispose the current OpenCode instance.' }, path('instance', 'dispose'), 'state-changing'),
  readOnlyEntry({ id: 'path.get', category: 'top-level-files', surface: 'settings', description: 'Read OpenCode paths.' }, path('path', 'get')),

  // ---------- vcs ----------
  readOnlyEntry({ id: 'vcs.get', category: 'top-level-vcs', surface: 'settings', description: 'Read VCS metadata.' }, path('vcs', 'get')),
  readOnlyEntry({ id: 'vcs.status', category: 'top-level-vcs', surface: 'settings', description: 'Read VCS status.' }, path('vcs', 'status')),
  presenceEntry({ id: 'vcs.diff', category: 'top-level-vcs', surface: 'diagnostic', description: 'Read VCS diff for a mode fixture.' }, path('vcs', 'diff'), 'experimental-action'),
  stateChangingEntry({ id: 'vcs.apply', category: 'top-level-vcs', surface: 'diagnostic', description: 'Apply a VCS patch.' }, path('vcs', 'apply'), 'state-changing'),
  presenceEntry({ id: 'vcs.diff2.raw', category: 'top-level-vcs', surface: 'diagnostic', description: 'Read raw VCS diff.' }, path('vcs.diff2', 'raw'), 'experimental-action'),

  // ---------- runtime status ----------
  readOnlyEntry({ id: 'command.list', category: 'top-level-runtime', surface: 'settings', description: 'List slash commands.' }, path('command', 'list')),
  readOnlyEntry({ id: 'lsp.status', category: 'top-level-runtime', surface: 'settings', description: 'Read LSP status.' }, path('lsp', 'status')),
  readOnlyEntry({ id: 'formatter.status', category: 'top-level-runtime', surface: 'settings', description: 'Read formatter status.' }, path('formatter', 'status')),

  // ---------- mcp ----------
  readOnlyEntry({ id: 'mcp.status', category: 'top-level-mcp', surface: 'settings', description: 'Read MCP status.' }, path('mcp', 'status')),
  stateChangingEntry({ id: 'mcp.add', category: 'top-level-mcp', surface: 'settings', description: 'Add an MCP server.' }, path('mcp', 'add'), 'state-changing'),
  stateChangingEntry({ id: 'mcp.connect', category: 'top-level-mcp', surface: 'settings', description: 'Connect an MCP server.' }, path('mcp', 'connect'), 'state-changing'),
  stateChangingEntry({ id: 'mcp.disconnect', category: 'top-level-mcp', surface: 'settings', description: 'Disconnect an MCP server.' }, path('mcp', 'disconnect'), 'state-changing'),
  stateChangingEntry({ id: 'mcp.auth.remove', category: 'top-level-mcp', surface: 'settings', description: 'Remove MCP OAuth credentials.' }, path('mcp.auth', 'remove'), 'state-changing'),
  stateChangingEntry({ id: 'mcp.auth.start', category: 'top-level-mcp', surface: 'settings', description: 'Start MCP OAuth.' }, path('mcp.auth', 'start'), 'state-changing'),
  stateChangingEntry({ id: 'mcp.auth.callback', category: 'top-level-mcp', surface: 'settings', description: 'Complete MCP OAuth callback.' }, path('mcp.auth', 'callback'), 'state-changing'),
  stateChangingEntry({ id: 'mcp.auth.authenticate', category: 'top-level-mcp', surface: 'settings', description: 'Run MCP OAuth authentication.' }, path('mcp.auth', 'authenticate'), 'state-changing'),

  // ---------- project ----------
  readOnlyEntry({ id: 'project.list', category: 'top-level-project', surface: 'settings', description: 'List known projects.' }, path('project', 'list')),
  readOnlyEntry({ id: 'project.current', category: 'top-level-project', surface: 'settings', description: 'Read the current project.' }, path('project', 'current')),
  stateChangingEntry({ id: 'project.initGit', category: 'top-level-project', surface: 'settings', description: 'Initialize git for a project.' }, path('project', 'initGit'), 'state-changing'),
  stateChangingEntry({ id: 'project.update', category: 'top-level-project', surface: 'settings', description: 'Update project metadata.' }, path('project', 'update'), 'state-changing'),
  presenceEntry({ id: 'project.directories', category: 'top-level-project', surface: 'settings', description: 'List directories for a project fixture.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('project', 'directories'), 'experimental-action'),

  // ---------- pty ----------
  readOnlyEntry({ id: 'pty.shells', category: 'top-level-runtime', surface: 'diagnostic', description: 'List available shells.' }, path('pty', 'shells')),
  readOnlyEntry({ id: 'pty.list', category: 'top-level-runtime', surface: 'diagnostic', description: 'List PTY sessions.' }, path('pty', 'list')),
  stateChangingEntry({ id: 'pty.create', category: 'top-level-runtime', surface: 'diagnostic', description: 'Create a PTY session.' }, path('pty', 'create'), 'state-changing'),
  stateChangingEntry({ id: 'pty.remove', category: 'top-level-runtime', surface: 'diagnostic', description: 'Remove a PTY session.' }, path('pty', 'remove'), 'state-changing'),
  presenceEntry({ id: 'pty.get', category: 'top-level-runtime', surface: 'diagnostic', description: 'Get a PTY fixture.' }, path('pty', 'get'), 'experimental-action'),
  stateChangingEntry({ id: 'pty.update', category: 'top-level-runtime', surface: 'diagnostic', description: 'Update a PTY session.' }, path('pty', 'update'), 'state-changing'),
  stateChangingEntry({ id: 'pty.connectToken', category: 'top-level-runtime', surface: 'diagnostic', description: 'Create a PTY connection token.' }, path('pty', 'connectToken'), 'state-changing'),
  streamEntry({ id: 'pty.connect', category: 'top-level-runtime', surface: 'diagnostic', description: 'Connect to a PTY stream.' }, path('pty', 'connect')),

  // ---------- question / permission ----------
  readOnlyEntry({ id: 'question.list', category: 'top-level-session', surface: 'chat', description: 'List pending question requests.' }, path('question', 'list')),
  stateChangingEntry({ id: 'question.reply', category: 'top-level-session', surface: 'chat', description: 'Reply to a question request.' }, path('question', 'reply'), 'state-changing'),
  stateChangingEntry({ id: 'question.reject', category: 'top-level-session', surface: 'chat', description: 'Reject a question request.' }, path('question', 'reject'), 'state-changing'),
  readOnlyEntry({ id: 'permission.list', category: 'top-level-session', surface: 'chat', description: 'List pending permission requests.' }, path('permission', 'list')),
  stateChangingEntry({ id: 'permission.reply', category: 'top-level-session', surface: 'chat', description: 'Reply to a permission request.' }, path('permission', 'reply'), 'state-changing'),
  stateChangingEntry({ id: 'permission.respond', category: 'top-level-session', surface: 'chat', description: 'Respond to a deprecated permission request.' }, path('permission', 'respond'), 'state-changing'),

  // ---------- provider ----------
  readOnlyEntry({ id: 'provider.list', category: 'top-level-project', surface: 'settings', description: 'List providers.' }, path('provider', 'list')),
  readOnlyEntry({ id: 'provider.auth', category: 'top-level-project', surface: 'settings', description: 'List provider auth methods.' }, path('provider', 'auth')),
  stateChangingEntry({ id: 'provider.oauth.authorize', category: 'top-level-project', surface: 'settings', description: 'Start provider OAuth.' }, path('provider.oauth', 'authorize'), 'state-changing'),
  stateChangingEntry({ id: 'provider.oauth.callback', category: 'top-level-project', surface: 'settings', description: 'Complete provider OAuth.' }, path('provider.oauth', 'callback'), 'state-changing'),

  // ---------- session ----------
  readOnlyEntry({ id: 'session.list', category: 'top-level-session', surface: 'chat', description: 'List legacy-shaped sessions.' }, path('session', 'list')),
  stateChangingEntry({ id: 'session.create', category: 'top-level-session', surface: 'chat', description: 'Create a legacy-shaped session.' }, path('session', 'create'), 'state-changing'),
  readOnlyEntry({ id: 'session.status', category: 'top-level-session', surface: 'chat', description: 'Read session status.' }, path('session', 'status')),
  stateChangingEntry({ id: 'session.delete', category: 'top-level-session', surface: 'chat', description: 'Delete a session.' }, path('session', 'delete'), 'state-changing'),
  presenceEntry({ id: 'session.get', category: 'top-level-session', surface: 'chat', description: 'Get a session fixture.' }, path('session', 'get'), 'experimental-action'),
  stateChangingEntry({ id: 'session.update', category: 'top-level-session', surface: 'chat', description: 'Update a session.' }, path('session', 'update'), 'state-changing'),
  presenceEntry({ id: 'session.children', category: 'top-level-session', surface: 'chat', description: 'List child sessions for a fixture.' }, path('session', 'children'), 'experimental-action'),
  presenceEntry({ id: 'session.todo', category: 'top-level-session', surface: 'chat', description: 'Read todo list for a session fixture.' }, path('session', 'todo'), 'experimental-action'),
  presenceEntry({ id: 'session.diff', category: 'top-level-session', surface: 'chat', description: 'Read message diff for a fixture.' }, path('session', 'diff'), 'experimental-action'),
  presenceEntry({ id: 'session.messages', category: 'top-level-session', surface: 'chat', description: 'Read messages for a session fixture.' }, path('session', 'messages'), 'experimental-action'),
  streamEntry({ id: 'session.prompt', category: 'top-level-session', surface: 'chat', description: 'Send a streaming session prompt.' }, path('session', 'prompt')),
  stateChangingEntry({ id: 'session.deleteMessage', category: 'top-level-session', surface: 'chat', description: 'Delete a session message.' }, path('session', 'deleteMessage'), 'state-changing'),
  presenceEntry({ id: 'session.message', category: 'top-level-session', surface: 'chat', description: 'Read one message for a fixture.' }, path('session', 'message'), 'experimental-action'),
  stateChangingEntry({ id: 'session.fork', category: 'top-level-session', surface: 'chat', description: 'Fork a session.' }, path('session', 'fork'), 'state-changing'),
  stateChangingEntry({ id: 'session.abort', category: 'top-level-session', surface: 'chat', description: 'Abort a session.' }, path('session', 'abort'), 'state-changing'),
  stateChangingEntry({ id: 'session.init', category: 'top-level-session', surface: 'chat', description: 'Initialize AGENTS.md for a session.' }, path('session', 'init'), 'state-changing'),
  stateChangingEntry({ id: 'session.unshare', category: 'top-level-session', surface: 'chat', description: 'Unshare a session.' }, path('session', 'unshare'), 'state-changing'),
  stateChangingEntry({ id: 'session.share', category: 'top-level-session', surface: 'chat', description: 'Share a session.' }, path('session', 'share'), 'state-changing'),
  stateChangingEntry({ id: 'session.summarize', category: 'top-level-session', surface: 'chat', description: 'Summarize a session with an agent.' }, path('session', 'summarize'), 'state-changing'),
  stateChangingEntry({ id: 'session.promptAsync', category: 'top-level-session', surface: 'chat', description: 'Send an asynchronous session prompt.' }, path('session', 'promptAsync'), 'state-changing'),
  stateChangingEntry({ id: 'session.command', category: 'top-level-session', surface: 'chat', description: 'Send a slash command to a session.' }, path('session', 'command'), 'state-changing'),
  stateChangingEntry({ id: 'session.shell', category: 'top-level-session', surface: 'chat', description: 'Run a shell command in a session.' }, path('session', 'shell'), 'state-changing'),
  stateChangingEntry({ id: 'session.revert', category: 'top-level-session', surface: 'chat', description: 'Revert a session message.' }, path('session', 'revert'), 'state-changing'),
  stateChangingEntry({ id: 'session.unrevert', category: 'top-level-session', surface: 'chat', description: 'Restore reverted session messages.' }, path('session', 'unrevert'), 'state-changing'),

  // ---------- part / sync ----------
  stateChangingEntry({ id: 'part.delete', category: 'top-level-session', surface: 'chat', description: 'Delete a message part.' }, path('part', 'delete'), 'state-changing'),
  stateChangingEntry({ id: 'part.update', category: 'top-level-session', surface: 'chat', description: 'Update a message part.' }, path('part', 'update'), 'state-changing'),
  stateChangingEntry({ id: 'sync.start', category: 'top-level-runtime', surface: 'chat', description: 'Start workspace sync loops.' }, path('sync', 'start'), 'state-changing'),
  stateChangingEntry({ id: 'sync.replay', category: 'top-level-runtime', surface: 'chat', description: 'Replay sync history.' }, path('sync', 'replay'), 'state-changing'),
  stateChangingEntry({ id: 'sync.steal', category: 'top-level-runtime', surface: 'chat', description: 'Move a session into sync workspace state.' }, path('sync', 'steal'), 'state-changing'),
  presenceEntry({ id: 'sync.history.list', category: 'top-level-runtime', surface: 'diagnostic', description: 'List sync history.' }, path('sync.history', 'list'), 'experimental-action'),

  // ---------- tui ----------
  presenceEntry({ id: 'tui.control.next', category: 'top-level-tui', surface: 'diagnostic', description: 'Read the next TUI control request.' }, path('tui.control', 'next'), 'experimental-action'),
  stateChangingEntry({ id: 'tui.control.response', category: 'top-level-tui', surface: 'diagnostic', description: 'Submit a TUI control response.' }, path('tui.control', 'response'), 'state-changing'),
  stateChangingEntry({ id: 'tui.appendPrompt', category: 'top-level-tui', surface: 'diagnostic', description: 'Append text to the TUI prompt.' }, path('tui', 'appendPrompt'), 'state-changing'),
  stateChangingEntry({ id: 'tui.openHelp', category: 'top-level-tui', surface: 'diagnostic', description: 'Open the TUI help dialog.' }, path('tui', 'openHelp'), 'state-changing'),
  stateChangingEntry({ id: 'tui.openSessions', category: 'top-level-tui', surface: 'diagnostic', description: 'Open the TUI sessions dialog.' }, path('tui', 'openSessions'), 'state-changing'),
  stateChangingEntry({ id: 'tui.openThemes', category: 'top-level-tui', surface: 'diagnostic', description: 'Open the TUI themes dialog.' }, path('tui', 'openThemes'), 'state-changing'),
  stateChangingEntry({ id: 'tui.openModels', category: 'top-level-tui', surface: 'diagnostic', description: 'Open the TUI models dialog.' }, path('tui', 'openModels'), 'state-changing'),
  stateChangingEntry({ id: 'tui.submitPrompt', category: 'top-level-tui', surface: 'diagnostic', description: 'Submit the TUI prompt.' }, path('tui', 'submitPrompt'), 'state-changing'),
  stateChangingEntry({ id: 'tui.clearPrompt', category: 'top-level-tui', surface: 'diagnostic', description: 'Clear the TUI prompt.' }, path('tui', 'clearPrompt'), 'state-changing'),
  stateChangingEntry({ id: 'tui.executeCommand', category: 'top-level-tui', surface: 'diagnostic', description: 'Execute a TUI command.' }, path('tui', 'executeCommand'), 'state-changing'),
  stateChangingEntry({ id: 'tui.showToast', category: 'top-level-tui', surface: 'diagnostic', description: 'Show a TUI toast.' }, path('tui', 'showToast'), 'state-changing'),
  stateChangingEntry({ id: 'tui.publish', category: 'top-level-tui', surface: 'diagnostic', description: 'Publish a TUI event.' }, path('tui', 'publish'), 'state-changing'),
  stateChangingEntry({ id: 'tui.selectSession', category: 'top-level-tui', surface: 'diagnostic', description: 'Select a TUI session.' }, path('tui', 'selectSession'), 'state-changing'),

  // ---------- v2 core (NEW subnamespaces) ----------
  readOnlyEntry({ id: 'v2.health.get', category: 'v2-core', surface: 'settings', description: 'Read v2 server health.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.health', 'get')),
  readOnlyEntry({ id: 'v2.location.get', category: 'v2-core', surface: 'settings', description: 'Read current v2 location metadata.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.location', 'get')),

  // ---------- v2 catalog ----------
  readOnlyEntry({ id: 'v2.agent.list', category: 'v2-catalog', surface: 'settings', description: 'List v2 agents.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.agent', 'list')),

  // ---------- v2 session ----------
  readOnlyEntry({ id: 'v2.session.list', category: 'v2-session', surface: 'chat', description: 'List v2 sessions.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.session', 'list')),
  stateChangingEntry({ id: 'v2.session.create', category: 'v2-session', surface: 'chat', description: 'Create a v2 session.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.session', 'create'), 'state-changing'),
  readOnlyEntry({ id: 'v2.session.active', category: 'v2-session', surface: 'chat', description: 'List active foreground v2 sessions.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.session', 'active')),
  presenceEntry({ id: 'v2.session.get', category: 'v2-session', surface: 'chat', description: 'Get a v2 session fixture.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.session', 'get'), 'experimental-action'),
  stateChangingEntry({ id: 'v2.session.switchAgent', category: 'v2-session', surface: 'chat', description: 'Switch a v2 session agent.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.session', 'switchAgent'), 'state-changing'),
  stateChangingEntry({ id: 'v2.session.switchModel', category: 'v2-session', surface: 'chat', description: 'Switch a v2 session model.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.session', 'switchModel'), 'state-changing'),
  streamEntry({ id: 'v2.session.prompt', category: 'v2-session', surface: 'chat', description: 'Send a v2 session prompt.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.session', 'prompt')),
  stateChangingEntry({ id: 'v2.session.compact', category: 'v2-session', surface: 'chat', description: 'Compact a v2 session.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.session', 'compact'), 'state-changing'),
  presenceEntry({ id: 'v2.session.wait', category: 'v2-session', surface: 'chat', description: 'Wait for a v2 session fixture.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.session', 'wait'), 'experimental-action'),
  presenceEntry({ id: 'v2.session.context', category: 'v2-session', surface: 'chat', description: 'Read v2 session context for a fixture.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.session', 'context'), 'experimental-action'),
  presenceEntry({ id: 'v2.session.history', category: 'v2-session', surface: 'chat', description: 'Read v2 session history for a fixture.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.session', 'history'), 'experimental-action'),
  streamEntry({ id: 'v2.session.events', category: 'v2-session', surface: 'chat', description: 'Subscribe to v2 session events for a fixture.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.session', 'events')),
  presenceEntry({ id: 'v2.session.interrupt', category: 'v2-session', surface: 'chat', description: 'Interrupt a v2 session fixture.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.session', 'interrupt'), 'experimental-action'),
  presenceEntry({ id: 'v2.session.message', category: 'v2-session', surface: 'chat', description: 'Read one v2 session message for a fixture.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.session', 'message'), 'experimental-action'),
  presenceEntry({ id: 'v2.session.messages', category: 'v2-session', surface: 'chat', description: 'Read v2 session messages for a fixture.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.session', 'messages'), 'experimental-action'),
  stateChangingEntry({ id: 'v2.session.revert.stage', category: 'v2-session', surface: 'chat', description: 'Stage a v2 session revert.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.session.revert', 'stage'), 'state-changing'),
  stateChangingEntry({ id: 'v2.session.revert.clear', category: 'v2-session', surface: 'chat', description: 'Clear a staged v2 session revert.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.session.revert', 'clear'), 'state-changing'),
  stateChangingEntry({ id: 'v2.session.revert.commit', category: 'v2-session', surface: 'chat', description: 'Commit a staged v2 session revert.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.session.revert', 'commit'), 'state-changing'),

  // ---------- v2 session permission ----------
  presenceEntry({ id: 'v2.session.permission.list', category: 'v2-session', surface: 'chat', description: 'List v2 session permission requests for a fixture.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.session.permission', 'list'), 'experimental-action'),
  stateChangingEntry({ id: 'v2.session.permission.create', category: 'v2-session', surface: 'chat', description: 'Create a v2 session permission request.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.session.permission', 'create'), 'state-changing'),
  presenceEntry({ id: 'v2.session.permission.get', category: 'v2-session', surface: 'chat', description: 'Get a v2 session permission request fixture.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.session.permission', 'get'), 'experimental-action'),
  stateChangingEntry({ id: 'v2.session.permission.reply', category: 'v2-session', surface: 'chat', description: 'Reply to a v2 session permission request.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.session.permission', 'reply'), 'state-changing'),

  // ---------- v2 session question ----------
  presenceEntry({ id: 'v2.session.question.list', category: 'v2-session', surface: 'chat', description: 'List v2 session question requests for a fixture.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.session.question', 'list'), 'experimental-action'),
  stateChangingEntry({ id: 'v2.session.question.reply', category: 'v2-session', surface: 'chat', description: 'Reply to a v2 session question request.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.session.question', 'reply'), 'state-changing'),
  stateChangingEntry({ id: 'v2.session.question.reject', category: 'v2-session', surface: 'chat', description: 'Reject a v2 session question request.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.session.question', 'reject'), 'state-changing'),

  // ---------- v2 model / provider ----------
  readOnlyEntry({ id: 'v2.model.list', category: 'v2-catalog', surface: 'settings', description: 'List v2 models.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.model', 'list')),
  readOnlyEntry({ id: 'v2.provider.list', category: 'v2-catalog', surface: 'settings', description: 'List v2 providers.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.provider', 'list')),
  presenceEntry({ id: 'v2.provider.get', category: 'v2-catalog', surface: 'settings', description: 'Get one v2 provider fixture.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.provider', 'get'), 'experimental-action'),

  // ---------- v2 integration ----------
  readOnlyEntry({ id: 'v2.integration.list', category: 'v2-integration', surface: 'settings', description: 'List v2 integrations.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.integration', 'list')),
  presenceEntry({ id: 'v2.integration.get', category: 'v2-integration', surface: 'settings', description: 'Get one v2 integration fixture.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.integration', 'get'), 'experimental-action'),
  stateChangingEntry({ id: 'v2.integration.connect.key', category: 'v2-integration', surface: 'settings', description: 'Store a key credential for a v2 integration.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.integration.connect', 'key'), 'state-changing'),
  stateChangingEntry({ id: 'v2.integration.connect.oauth', category: 'v2-integration', surface: 'settings', description: 'Start v2 integration OAuth.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.integration.connect', 'oauth'), 'state-changing'),
  stateChangingEntry({ id: 'v2.integration.attempt.cancel', category: 'v2-integration', surface: 'settings', description: 'Cancel a v2 integration OAuth attempt.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.integration.attempt', 'cancel'), 'state-changing'),
  presenceEntry({ id: 'v2.integration.attempt.status', category: 'v2-integration', surface: 'settings', description: 'Read a v2 integration attempt fixture.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.integration.attempt', 'status'), 'experimental-action'),
  stateChangingEntry({ id: 'v2.integration.attempt.complete', category: 'v2-integration', surface: 'settings', description: 'Complete v2 integration OAuth.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.integration.attempt', 'complete'), 'state-changing'),

  // ---------- v2 credential ----------
  stateChangingEntry({ id: 'v2.credential.remove', category: 'v2-integration', surface: 'settings', description: 'Remove a v2 credential.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.credential', 'remove'), 'state-changing'),
  stateChangingEntry({ id: 'v2.credential.update', category: 'v2-integration', surface: 'settings', description: 'Update a v2 credential label.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.credential', 'update'), 'state-changing'),

  // ---------- v2 permission (NEW) ----------
  readOnlyEntry({ id: 'v2.permission.request.list', category: 'v2-permission-question', surface: 'chat', description: 'List v2 pending permission requests.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.permission.request', 'list')),
  readOnlyEntry({ id: 'v2.permission.saved.list', category: 'v2-permission-question', surface: 'settings', description: 'List v2 saved permissions.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.permission.saved', 'list')),
  stateChangingEntry({ id: 'v2.permission.saved.remove', category: 'v2-permission-question', surface: 'settings', description: 'Remove a v2 saved permission.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.permission.saved', 'remove'), 'state-changing'),

  // ---------- v2 fs (NEW) ----------
  presenceEntry({ id: 'v2.fs.read', category: 'v2-files', surface: 'chat', description: 'Read a v2 filesystem fixture.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.fs', 'read'), 'experimental-action'),
  readOnlyEntry({ id: 'v2.fs.list', category: 'v2-files', surface: 'chat', description: 'List v2 filesystem entries.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.fs', 'list')),
  presenceEntry({ id: 'v2.fs.find', category: 'v2-files', surface: 'chat', description: 'Find v2 filesystem entries for a query fixture.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.fs', 'find'), 'experimental-action'),

  // ---------- v2 runtime (NEW): command / skill / event ----------
  readOnlyEntry({ id: 'v2.command.list', category: 'v2-runtime', surface: 'settings', description: 'List v2 commands.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.command', 'list')),
  readOnlyEntry({ id: 'v2.skill.list', category: 'v2-runtime', surface: 'settings', description: 'List v2 skills.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.skill', 'list')),
  streamEntry({ id: 'v2.event.subscribe', category: 'v2-runtime', surface: 'chat', description: 'Subscribe to native v2 event payloads.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.event', 'subscribe')),

  // ---------- v2 pty (NEW) ----------
  readOnlyEntry({ id: 'v2.pty.list', category: 'v2-runtime', surface: 'diagnostic', description: 'List v2 PTY sessions.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.pty', 'list')),
  stateChangingEntry({ id: 'v2.pty.create', category: 'v2-runtime', surface: 'diagnostic', description: 'Create a v2 PTY session.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.pty', 'create'), 'state-changing'),
  stateChangingEntry({ id: 'v2.pty.remove', category: 'v2-runtime', surface: 'diagnostic', description: 'Remove a v2 PTY session.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.pty', 'remove'), 'state-changing'),
  presenceEntry({ id: 'v2.pty.get', category: 'v2-runtime', surface: 'diagnostic', description: 'Get a v2 PTY fixture.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.pty', 'get'), 'experimental-action'),
  stateChangingEntry({ id: 'v2.pty.update', category: 'v2-runtime', surface: 'diagnostic', description: 'Update a v2 PTY session.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.pty', 'update'), 'state-changing'),
  stateChangingEntry({ id: 'v2.pty.connectToken', category: 'v2-runtime', surface: 'diagnostic', description: 'Create a v2 PTY WebSocket ticket.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.pty', 'connectToken'), 'state-changing'),
  streamEntry({ id: 'v2.pty.connect', category: 'v2-runtime', surface: 'diagnostic', description: 'Connect to a v2 PTY stream.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.pty', 'connect')),

  // ---------- v2 question / reference (NEW) ----------
  readOnlyEntry({ id: 'v2.question.request.list', category: 'v2-permission-question', surface: 'chat', description: 'List v2 pending question requests.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.question.request', 'list')),
  readOnlyEntry({ id: 'v2.reference.list', category: 'v2-runtime', surface: 'chat', description: 'List v2 references.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.reference', 'list')),

  // ---------- v2 projectCopy (NEW) ----------
  stateChangingEntry({ id: 'v2.projectCopy.remove', category: 'v2-project', surface: 'diagnostic', description: 'Remove a v2 project copy.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.projectCopy', 'remove'), 'state-changing'),
  stateChangingEntry({ id: 'v2.projectCopy.create', category: 'v2-project', surface: 'diagnostic', description: 'Create a v2 project copy.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.projectCopy', 'create'), 'state-changing'),
  stateChangingEntry({ id: 'v2.projectCopy.refresh', category: 'v2-project', surface: 'diagnostic', description: 'Refresh a v2 project copy.', minimumServerHint: MINIMUM_SERVER_HINT_117 }, path('v2.projectCopy', 'refresh'), 'state-changing'),
];

let cachedRegistryCopy: readonly OpenCodeSdkCapabilityDefinition[] | null = null;

/**
 * Return a defensive copy of the full capability registry.
 * Callers may mutate the result without affecting the cached immutable source.
 */
export function getOpenCodeSdkCapabilityRegistry(): OpenCodeSdkCapabilityDefinition[] {
  if (cachedRegistryCopy === null) {
    cachedRegistryCopy = OPENCODE_SDK_CAPABILITY_REGISTRY.map((entry) => ({ ...entry }));
  }
  return cachedRegistryCopy.map((entry) => ({ ...entry }));
}
