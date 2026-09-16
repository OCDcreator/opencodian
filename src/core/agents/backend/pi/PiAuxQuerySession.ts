/**
 * PiAuxQuerySession — provably read-only auxiliary session on the Pi RPC service.
 *
 * Pi exposes a session-level active-tool allowlist over its own protocol
 * (`set_tools` / `get_tools`), so read-only enforcement is a native mechanism
 * rather than a prompt instruction:
 *
 * 1. The session calls `set_tools` with the read-only allowlist, which the Pi
 *    SDK applies to the live session (`setActiveToolsByName`).
 * 2. It then calls `get_tools` and requires the SDK-reported `active` list to be
 *    exactly the allowlist. A mismatch fails the session (fail closed). This is
 *    also the audit's runtime evidence.
 * 3. Native session state lives in a private temp directory instead of the
 *    plugin's `.pi/opencodian-sessions`, so an auxiliary session never appears in
 *    the plugin session list and leaves nothing behind after `dispose()`.
 *
 * Pi has no system-prompt seam; the aux system prompt is prepended to the first
 * message, mirroring how the chat path delivers memory injection. The safety
 * argument does not rest on that text.
 *
 * See docs/requirements/inline-edit.md §5.3, §5.4 and §11.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createLogger } from '../../../../shared/logger';
import type {
  AuxObservedToolCall,
  AuxQueryResult,
  AuxQuerySafetyProof,
  AuxQuerySession,
  AuxQueryTurnRequest,
  BackendModelSelection,
} from '../AgentAuxQueryCapability';
import { AUX_DENIED_CAPABILITIES } from '../AgentAuxQueryCapability';
import { piRecord, PiRpcClient, type PiRpcPort } from './PiRpcClient';

const logger = createLogger('PiAuxQuerySession');

const DEFAULT_TURN_TIMEOUT_MS = 180_000;

/**
 * Read-only tool names the auxiliary session may keep, intersected with what the
 * installed Pi SDK actually exposes.
 */
const PI_AUX_READONLY_CANDIDATES: readonly string[] = [
  'read',
  'grep',
  'find',
  'ls',
  'glob',
];

/** Pi RPC protocol version this module speaks. */
const PI_SERVICE_PROTOCOL = 1;

/**
 * Tool names that must never remain active in an auxiliary session, whatever
 * else the SDK exposes.
 */
const PI_AUX_WRITE_TOOL_NAMES: readonly string[] = [
  'bash',
  'powershell',
  'shell',
  'exec',
  'edit',
  'write',
  'multiedit',
  'patch',
  'apply_patch',
  'task',
  'agent',
];

export interface PiAuxSessionOptions {
  readonly systemPrompt: string;
  readonly model?: BackendModelSelection;
  readonly workingDirectory: string;
  readonly executablePath: string;
  readonly servicePath?: string;
  readonly turnTimeoutMs?: number;
}

export class PiAuxQuerySession implements AuxQuerySession {
  readonly queryId: string;
  readonly safety: AuxQuerySafetyProof;

  private client: PiRpcPort | null = null;
  private scopeDir: string | null = null;
  private turnAbort: AbortController | null = null;
  private inFlight: Promise<AuxQueryResult> | null = null;
  private disposed = false;

  private constructor(
    private readonly options: PiAuxSessionOptions,
    safety: AuxQuerySafetyProof,
  ) {
    this.queryId = `pi-aux-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    this.safety = safety;
  }

  /**
   * Create the auxiliary session. Rejects when the Pi SDK exposes no read-only
   * tool subset or refuses the allowlist (fail closed).
   */
  static async create(options: PiAuxSessionOptions): Promise<PiAuxQuerySession> {
    const scopeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencodian-inline-pi-'));
    let client: PiRpcPort | null = null;
    try {
      client = new PiRpcClient({
        workingDirectory: options.workingDirectory,
        sessionDirectory: scopeDir,
        executablePath: options.executablePath,
        ...(options.servicePath ? { servicePath: options.servicePath } : {}),
      });

      const state = await client.request({ type: 'get_state' }, 0);
      if (state.serviceProtocol !== PI_SERVICE_PROTOCOL) {
        throw new Error('Pi auxiliary session found an incompatible Pi service protocol.');
      }
      await client.request({ type: 'new_session' }, 0);

      const catalog = await client.request({ type: 'get_tools' });
      const available = readToolNames(catalog.tools);
      const allow = PI_AUX_READONLY_CANDIDATES.filter((name) => available.includes(name));
      if (allow.length === 0) {
        throw new Error(
          `Pi auxiliary session found no read-only tools among [${available.join(', ')}].`,
        );
      }

      await client.request({ type: 'set_tools', names: allow });

      // Native readback: the SDK reports which tools are active.
      const readback = await client.request({ type: 'get_tools' });
      const active = readActiveToolNames(readback.active);
      if (!sameToolSet(active, allow)) {
        throw new Error(
          `Pi auxiliary session tool readback mismatch: requested [${allow.join(', ')}], `
          + `active [${active.join(', ')}].`,
        );
      }
      const stillWriteCapable = active.filter((name) => PI_AUX_WRITE_TOOL_NAMES.includes(name));
      if (stillWriteCapable.length > 0) {
        throw new Error(
          `Pi auxiliary session kept write-capable tools active: ${stillWriteCapable.join(', ')}.`,
        );
      }

      const safety: AuxQuerySafetyProof = {
        backend: 'pi',
        enforcedPolicy: 'read-only-allowlist',
        effectiveTools: active,
        deniedCapabilities: AUX_DENIED_CAPABILITIES,
        mechanism: 'pi session tool allowlist via set_tools, verified by the SDK get_tools readback',
      };
      const session = new PiAuxQuerySession(options, safety);
      session.client = client;
      session.scopeDir = scopeDir;
      return session;
    } catch (error) {
      try {
        client?.close();
      } catch {
        // Client teardown is best effort.
      }
      removeScopeDir(scopeDir);
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  async query(request: AuxQueryTurnRequest): Promise<AuxQueryResult> {
    return this.runTurn(request, true);
  }

  async followUp(prompt: string, request?: Partial<AuxQueryTurnRequest>): Promise<AuxQueryResult> {
    return this.runTurn({ ...request, prompt }, false);
  }

  cancel(): void {
    this.turnAbort?.abort();
    const client = this.client;
    if (client) {
      void Promise.resolve(client.request({ type: 'abort' }, 10_000)).catch((error: unknown) => {
        logger.debug('Pi auxiliary abort failed', error);
      });
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.turnAbort?.abort();
    const client = this.client;
    this.client = null;
    try {
      client?.close();
    } catch {
      // The Pi service process may already be gone.
    }
    // Give the child process a moment to release its session file handle.
    await new Promise((resolve) => { setTimeout(resolve, 400); });
    const dir = this.scopeDir;
    this.scopeDir = null;
    if (dir) removeScopeDir(dir);
  }

  // ---------------------------------------------------------------------------
  // Turn execution
  // ---------------------------------------------------------------------------

  private async runTurn(
    request: AuxQueryTurnRequest,
    includeSystemPrompt: boolean,
  ): Promise<AuxQueryResult> {
    const client = this.client;
    if (this.disposed || !client) {
      return { success: false, error: 'Pi auxiliary session is closed.', cancelled: true };
    }
    if (this.inFlight) {
      return { success: false, error: 'Pi auxiliary session is already running a turn.' };
    }
    const run = this.executeTurn(client, request, includeSystemPrompt);
    this.inFlight = run;
    try {
      return await run;
    } finally {
      if (this.inFlight === run) this.inFlight = null;
    }
  }

  private async executeTurn(
    client: PiRpcPort,
    request: AuxQueryTurnRequest,
    includeSystemPrompt: boolean,
  ): Promise<AuxQueryResult> {
    const abort = new AbortController();
    this.turnAbort = abort;
    const observed: AuxObservedToolCall[] = [];
    const seen = new Set<string>();
    const unsubscribe = client.subscribe((event) => {
      const record = piRecord(event);
      if (record.type !== 'tool_execution_start') return;
      const name = typeof record.toolName === 'string' ? record.toolName : '';
      if (!name || seen.has(name)) return;
      seen.add(name);
      observed.push({ name });
    });

    const timeout = setTimeout(
      () => abort.abort(),
      this.options.turnTimeoutMs ?? DEFAULT_TURN_TIMEOUT_MS,
    );
    request.signal?.addEventListener('abort', () => abort.abort(), { once: true });

    try {
      await this.applyModel(client);
      const message = includeSystemPrompt
        ? `${this.options.systemPrompt}\n\n---\n\n${request.prompt}`
        : request.prompt;
      await client.request({ type: 'prompt', message }, 0);
      if (abort.signal.aborted) {
        return { success: false, error: 'Pi auxiliary turn was cancelled.', cancelled: true };
      }
      const last = await client.request({ type: 'get_last_assistant_text' });
      const text = typeof last.text === 'string' ? last.text : '';
      if (!text) {
        return { success: false, error: 'Pi auxiliary turn returned an empty response.' };
      }
      request.onTextChunk?.(text);
      return { success: true, text, toolCalls: observed };
    } catch (error) {
      if (abort.signal.aborted) {
        return { success: false, error: 'Pi auxiliary turn was cancelled.', cancelled: true };
      }
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      clearTimeout(timeout);
      unsubscribe();
      if (this.turnAbort === abort) this.turnAbort = null;
    }
  }

  private async applyModel(client: PiRpcPort): Promise<void> {
    const model = this.options.model;
    if (!model || model.kind !== 'pi') return;
    await client.request({ type: 'set_model', provider: model.provider, modelId: model.model }, 30_000);
  }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function readToolNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      const record = piRecord(entry);
      return typeof record.name === 'string' ? record.name : '';
    })
    .filter((name) => name.length > 0);
}

function readActiveToolNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

function sameToolSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const set = new Set(right);
  return left.every((name) => set.has(name));
}

function removeScopeDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (error) {
    logger.warn('Failed to remove Pi auxiliary scope directory', error);
  }
}
