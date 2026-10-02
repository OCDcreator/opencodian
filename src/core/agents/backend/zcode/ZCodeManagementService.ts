/**
 * ZCode management boundary. Contracts pinned to zai-org/ZCode
 * 29628c9acdb81b703bbd4080c207a0e7ce5e276e; support is probed on the live
 * transport, never inferred from the desktop version or a patched bundle.
 * Owns redacted catalogs plus project-only revision/archive guarded writes.
 */
import * as path from 'node:path';

import {
  applyJsoncPathEdits,
  type ConfigurationEvidence,
  type FileRevision,
  readAllowlistedFileSnapshot,
  type SafeFileMutationResult,
  safeWriteFile,
  validateConfigurationContent,
} from '../ProjectResourceSecureWrite';
import { ZCodeRemoteRequestError } from './ZCodeAppServerTransport';
import { asRecordValue, ZCodeProtocolErrorCode } from './ZCodeProtocolTypes';

export type ZCodeCatalogState = 'available' | 'unavailable' | 'failed';
export interface ZCodePluginManagementEntry {
  readonly id: string;
  readonly enabled: boolean;
  readonly enabledSource: 'user' | 'workspace' | null;
  readonly packageMissing: boolean;
  readonly mcpCount: number | null;
  readonly hookCount: number | null;
}
export interface ZCodeMcpManagementEntry {
  readonly id: string;
  readonly status: 'connecting' | 'connected' | 'disabled' | 'disconnected' | 'failed' | 'untrusted' | 'unknown';
  readonly toolCount: number | null;
  /** Empty host auth headers and a connected status never prove authentication. */
  readonly authentication: 'required' | 'failed' | 'unknown';
}
export interface ZCodeManagementCatalog {
  readonly configuration: {
    readonly state: ZCodeCatalogState;
    readonly targetPath: string;
    readonly revision: FileRevision | null;
    readonly pluginOverrideCount: number | null;
    readonly mcpDeclarationCount: number | null;
    readonly hookDeclarationCount: number | null;
  };
  readonly plugins: { readonly state: ZCodeCatalogState; readonly entries: readonly ZCodePluginManagementEntry[] | null };
  readonly mcp: { readonly state: ZCodeCatalogState; readonly entries: readonly ZCodeMcpManagementEntry[] | null };
  readonly hooks: { readonly state: 'unavailable'; readonly effective: null };
  readonly mutation: { readonly plugins: ZCodeCatalogState; readonly mcp: 'unavailable'; readonly hooks: 'unavailable' };
}
export interface ZCodeManagementMutationResult {
  readonly status: SafeFileMutationResult['status'] | 'unavailable' | 'readback-failed';
  readonly evidence: ConfigurationEvidence;
}
export interface ZCodeManagementOptions {
  readonly workingDirectory: string;
  /** Bound to one owned transport. Null while disconnected; never starts it. */
  readonly request: ((method: string, params: Record<string, unknown>) => Promise<unknown>) | null;
  readonly archiveRootPath?: string;
}

const MCP_STATES = ['connecting', 'connected', 'disabled', 'disconnected', 'failed', 'untrusted'] as const;
const HOOK_EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PermissionRequest', 'PostToolUse', 'PostToolUseFailure', 'Stop'];
const noEvidence: ConfigurationEvidence = { persistence: 'unavailable', application: 'unavailable', runtime: 'unavailable' };

/** Only identifiers cross the UI boundary, never options, commands, headers or error text. */
function resourceId(value: unknown): string | null {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:@/-]{0,255}$/.test(value) ? value : null;
}

function parsePlugins(raw: unknown): readonly ZCodePluginManagementEntry[] | null {
  const plugins = asRecordValue(raw)['plugins'];
  if (!Array.isArray(plugins)) return null;
  const entries: ZCodePluginManagementEntry[] = [];
  const ids = new Set<string>();
  for (const value of plugins) {
    const plugin = asRecordValue(value);
    const id = resourceId(plugin['id']);
    if (!id || typeof plugin['enabled'] !== 'boolean' || ids.has(id)) return null;
    ids.add(id);
    const enabledSource = plugin['enabledSource'];
    entries.push({
      id,
      enabled: plugin['enabled'],
      enabledSource: enabledSource === 'user' || enabledSource === 'workspace' ? enabledSource : null,
      packageMissing: plugin['packageStatus'] === 'missing',
      mcpCount: Array.isArray(plugin['mcpServerNames']) ? plugin['mcpServerNames'].length : null,
      hookCount: Array.isArray(plugin['hookDetails']) ? plugin['hookDetails'].length : null,
    });
  }
  return entries;
}

function parseMcp(raw: unknown): readonly ZCodeMcpManagementEntry[] | null {
  const statuses = asRecordValue(raw)['statuses'];
  if (!statuses || typeof statuses !== 'object' || Array.isArray(statuses)) return null;
  const entries: ZCodeMcpManagementEntry[] = [];
  for (const [name, value] of Object.entries(statuses)) {
    const id = resourceId(name);
    if (!id) return null;
    const snapshot = asRecordValue(value);
    const status = MCP_STATES.find((candidate) => candidate === snapshot['status']) ?? 'unknown';
    const count = snapshot['toolCount'];
    entries.push({
      id, status,
      toolCount: typeof count === 'number' && Number.isSafeInteger(count) && count >= 0 ? count : null,
      authentication: snapshot['authorization'] ? 'required'
        : snapshot['failureKind'] === 'not_authenticated' || snapshot['failureKind'] === 'oauth_authorization_failed' ? 'failed' : 'unknown',
    });
  }
  return entries;
}

function countHooks(config: Record<string, unknown>): number {
  const events = asRecordValue(asRecordValue(config['hooks'])['events']);
  return HOOK_EVENTS.reduce((total, event) => {
    const groups = events[event];
    if (!Array.isArray(groups)) return total;
    return total + groups.reduce((count: number, group: unknown) => {
      const hooks = asRecordValue(group)['hooks'];
      return count + (Array.isArray(hooks) ? hooks.length : 0);
    }, 0);
  }, 0);
}

function readFailure(error: unknown): ZCodeCatalogState {
  return error instanceof ZCodeRemoteRequestError && error.code === ZCodeProtocolErrorCode.MethodNotFound ? 'unavailable' : 'failed';
}

export class ZCodeManagementService {
  private readonly targetPath: string;
  private readonly workspace: { workspacePath: string; workspaceKey: string };
  private readonly allowlist;

  constructor(private readonly options: ZCodeManagementOptions) {
    const workspacePath = path.resolve(options.workingDirectory);
    this.workspace = { workspacePath, workspaceKey: workspacePath.replace(/\\/g, '/') };
    this.targetPath = path.join(workspacePath, '.zcode', 'config.json');
    this.allowlist = [{ scope: 'project' as const, rootPath: workspacePath }];
  }

  async readCatalog(): Promise<ZCodeManagementCatalog> {
    const snapshot = await readAllowlistedFileSnapshot({ targetPath: this.targetPath, allowlist: this.allowlist });
    let config: Record<string, unknown> | null = null;
    if (snapshot.status === 'absent') config = {};
    else if (snapshot.status === 'success' && validateConfigurationContent('json', snapshot.content).ok) {
      config = asRecordValue(JSON.parse(snapshot.content));
    }
    const [plugins, mcp, mutation] = await Promise.all([
      this.readNative('plugins/list', parsePlugins),
      this.readNative('mcp/list', parseMcp),
      this.probePluginMutation(),
    ]);
    return {
      configuration: {
        state: config ? 'available' : 'failed', targetPath: this.targetPath,
        revision: snapshot.status === 'success' ? snapshot.revision : null,
        pluginOverrideCount: config ? Object.keys(asRecordValue(asRecordValue(config['plugins'])['enabledPlugins'])).length : null,
        mcpDeclarationCount: config ? Object.keys(asRecordValue(asRecordValue(config['mcp'])['servers'])).length : null,
        hookDeclarationCount: config ? countHooks(config) : null,
      },
      plugins, mcp,
      hooks: { state: 'unavailable', effective: null },
      mutation: { plugins: mutation, mcp: 'unavailable', hooks: 'unavailable' },
    };
  }

  private async readNative<T>(method: string, parse: (raw: unknown) => readonly T[] | null): Promise<{ state: ZCodeCatalogState; entries: readonly T[] | null }> {
    if (!this.options.request) return { state: 'unavailable', entries: null };
    try {
      const raw = await this.options.request(method, { workspace: this.workspace, ...(method === 'mcp/list' ? { mode: 'status' } : {}) });
      const entries = parse(raw);
      return { state: entries ? 'available' : 'failed', entries };
    } catch (error) {
      return { state: readFailure(error), entries: null };
    }
  }

  /** Mandatory workspace/pluginId/enabled are omitted: official schema rejects before IO. */
  private async probePluginMutation(): Promise<ZCodeCatalogState> {
    if (!this.options.request) return 'unavailable';
    try {
      await this.options.request('plugins/setEnabled', {});
      // A successful malformed request cannot prove the pinned mutation contract.
      return 'unavailable';
    } catch (error) {
      if (error instanceof ZCodeRemoteRequestError && error.code === ZCodeProtocolErrorCode.InvalidParams) return 'available';
      return readFailure(error);
    }
  }

  /**
   * Write the native enabledPlugins workspace override through the shared secure
   * writer. The native writer defaults to user scope and has no revision/archive
   * transaction; never dispatch it with valid params or bypass that chokepoint.
   * Existing sessions keep their startup snapshot; application remains pending.
   */
  async setPluginEnabled(pluginId: string, enabled: boolean, expectedRevision: FileRevision | null): Promise<ZCodeManagementMutationResult> {
    if (!resourceId(pluginId) || typeof enabled !== 'boolean' || await this.probePluginMutation() !== 'available') {
      return { status: 'unavailable', evidence: noEvidence };
    }
    const native = await this.readNative('plugins/list', parsePlugins);
    const plugin = native.entries?.find((entry) => entry.id === pluginId);
    if (native.state !== 'available' || !plugin || plugin.packageMissing) return { status: 'unavailable', evidence: noEvidence };
    const snapshot = await readAllowlistedFileSnapshot({
      targetPath: this.targetPath, allowlist: this.allowlist, ...(expectedRevision ? { expectedRevision } : {}),
    });
    if (snapshot.status !== 'success' && snapshot.status !== 'absent') {
      return { status: snapshot.status === 'conflict' ? 'conflict' : 'invalid-path', evidence: noEvidence };
    }
    const content = snapshot.status === 'success' ? snapshot.content : '{}';
    if (!validateConfigurationContent('json', content).ok) return { status: 'invalid-content', evidence: noEvidence };
    const edit = applyJsoncPathEdits(content, [{ path: ['plugins', 'enabledPlugins', pluginId], value: enabled }]);
    if (!edit.ok) return { status: 'invalid-content', evidence: noEvidence };
    const write = await safeWriteFile({
      targetPath: this.targetPath, content: edit.result, expectedRevision, allowlist: this.allowlist, format: 'json',
      archive: { backend: 'zcode', kind: 'plugins', format: 'json', ...(this.options.archiveRootPath ? { archiveRootPath: this.options.archiveRootPath } : {}) },
    });
    if (write.status !== 'success') return { status: write.status, evidence: noEvidence };
    return this.verifySavedPlugin(pluginId, enabled, write.revision);
  }

  private async verifySavedPlugin(pluginId: string, enabled: boolean, revision: FileRevision): Promise<ZCodeManagementMutationResult> {
    const reopened = await readAllowlistedFileSnapshot({ targetPath: this.targetPath, allowlist: this.allowlist, expectedRevision: revision });
    const persisted = reopened.status === 'success' && validateConfigurationContent('json', reopened.content).ok
      && asRecordValue(asRecordValue(asRecordValue(JSON.parse(reopened.content))['plugins'])['enabledPlugins'])[pluginId] === enabled;
    // This is a fresh native config resolution, independent of the source write.
    const readback = await this.readNative('plugins/list', parsePlugins);
    const effective = readback.entries?.find((entry) => entry.id === pluginId);
    const confirmed = effective?.enabled === enabled && effective.enabledSource === 'workspace' && !effective.packageMissing;
    return {
      status: persisted && confirmed ? 'success' : 'readback-failed',
      evidence: {
        persistence: persisted ? 'verified' : 'failed', application: 'pending',
        runtime: confirmed ? 'verified' : readback.state === 'unavailable' ? 'unavailable' : 'failed',
        detail: 'Effective workspace configuration only; existing sessions retain their startup snapshot. New-session application has not been observed.',
      },
    };
  }
}
