/**
 * ClaudeCodeAuxQuerySession — provably read-only auxiliary session on the Claude
 * Code Agent SDK.
 *
 * Read-only enforcement is layered, and every layer is either native to the CLI
 * or verified from the CLI's own runtime report:
 *
 * 1. `tools` limits the session's base tool set to the read-only allowlist, so
 *    write tools are not merely gated — they are absent from the model's tool
 *    set. `disallowedTools` removes the write names a second time.
 * 2. `strictMcpConfig` drops every MCP server that would otherwise arrive from
 *    user settings, project `.mcp.json`, or plugins.
 * 3. `canUseTool` denies anything outside the allowlist that still asks.
 * 4. `system/init` — the CLI's own per-turn session report — is read back on the
 *    first turn; `tools`, `mcp_servers`, and `permissionMode` must match the
 *    intended read-only shape or the turn is discarded and the native session is
 *    torn down (fail closed).
 *
 * `settingSources` is intentionally left to the user's configuration: Claude
 * Code provider credentials commonly live in `~/.claude/settings.json` `env`,
 * and dropping settings would break authentication. Layer 1 is what keeps the
 * session read-only, and it is verified at runtime rather than assumed.
 *
 * See docs/requirements/inline-edit.md §5.3, §5.4 and §11.
 */

import { createLogger } from '../../../../shared/logger';
import type { ClaudeCodeEffort } from '../../../types/settings';
import type {
  AuxObservedToolCall,
  AuxQueryResult,
  AuxQuerySafetyProof,
  AuxQuerySession,
  AuxQueryTurnRequest,
  BackendModelSelection,
} from '../AgentAuxQueryCapability';
import { AUX_DENIED_CAPABILITIES } from '../AgentAuxQueryCapability';
import type { ClaudeCodeSpawnClaudeCodeProcess } from '../ClaudeCodeOptionsBuilder';
import { type ClaudeCodeQueuedPrompt,createUserPrompt } from '../ClaudeCodeQueue';
import {
  createRendererSafeAbortController,
  type RendererSafeAbortController,
} from '../ClaudeCodeSdkAbortShim';

const logger = createLogger('ClaudeCodeAuxQuerySession');

/** Tools the auxiliary agent may keep. Mirrors the reviewed read-only allowlist. */
export const CLAUDE_AUX_ALLOWED_TOOLS: readonly string[] = [
  'Read',
  'Grep',
  'Glob',
  'WebSearch',
  'WebFetch',
];

/** Write-class tools removed from the session's tool namespace outright. */
const CLAUDE_AUX_DISALLOWED_TOOLS: readonly string[] = [
  'Bash',
  'BashOutput',
  'KillShell',
  'KillBash',
  'Write',
  'Edit',
  'MultiEdit',
  'NotebookEdit',
  'ApplyPatch',
  'Task',
  'Agent',
  'TodoWrite',
  'SlashCommand',
  'Skill',
];

const DEFAULT_TURN_TIMEOUT_MS = 180_000;

/**
 * The slice of the Agent SDK facade this session uses.
 *
 * Declared locally rather than imported from `ClaudeCodeAdapter`: the adapter
 * imports this module, so sharing its types would form a type-level cycle. The
 * real facade is structurally assignable to it.
 */
export interface ClaudeAuxSdkHandle extends AsyncIterable<unknown> {
  interrupt?(): Promise<unknown>;
  close?(): void;
}

export interface ClaudeAuxSdkFacade {
  query(input: {
    prompt: AsyncIterable<ClaudeCodeQueuedPrompt>;
    options: Record<string, unknown>;
  }): ClaudeAuxSdkHandle;
}

type ClaudeAuxQueryHandle = ClaudeAuxSdkHandle;

export interface ClaudeCodeAuxSessionOptions {
  readonly systemPrompt: string;
  readonly model?: BackendModelSelection;
  /** Claude-native effort (`low..max`); absent lets the CLI default apply. */
  readonly effort?: ClaudeCodeEffort;
  readonly workingDirectory: string;
  readonly sdk: ClaudeAuxSdkFacade;
  readonly pathToClaudeCodeExecutable?: string;
  readonly env?: Record<string, string | undefined>;
  readonly spawnClaudeCodeProcess?: ClaudeCodeSpawnClaudeCodeProcess;
  readonly turnTimeoutMs?: number;
}

/** The CLI's `system/init` report, narrowed to the fields we verify. */
interface ClaudeInitReport {
  readonly tools: readonly string[];
  readonly mcpServers: readonly string[];
  readonly permissionMode?: string;
}

/**
 * Prompt queue consumed by the SDK.
 *
 * The SDK writes it as a stream, which lets one native session serve several
 * turns (the clarification loop) without restarting the CLI process.
 */
class ClaudeAuxPromptQueue {
  private readonly pending: ClaudeCodeQueuedPrompt[] = [];
  private wake: (() => void) | null = null;
  private closed = false;

  push(value: ClaudeCodeQueuedPrompt): void {
    if (this.closed) return;
    this.pending.push(value);
    this.release();
  }

  close(): void {
    this.closed = true;
    this.release();
  }

  stream(): AsyncIterable<ClaudeCodeQueuedPrompt> {
    return { [Symbol.asyncIterator]: () => this.iterate() };
  }

  private async *iterate(): AsyncGenerator<ClaudeCodeQueuedPrompt> {
    for (;;) {
      while (this.pending.length > 0) {
        const next = this.pending.shift();
        if (next) yield next;
      }
      if (this.closed) return;
      await new Promise<void>((resolve) => { this.wake = resolve; });
    }
  }

  private release(): void {
    const wake = this.wake;
    this.wake = null;
    wake?.();
  }
}

export class ClaudeCodeAuxQuerySession implements AuxQuerySession {
  readonly queryId: string;
  /** Upgraded to the CLI-reported tool list once the first turn is verified. */
  readonly safety: AuxQuerySafetyProof;

  private readonly queue = new ClaudeAuxPromptQueue();
  private handle: ClaudeAuxQueryHandle | null = null;
  private pump: Promise<void> | null = null;
  private disposal: Promise<void> | null = null;
  private turnSettle: ((result: AuxQueryResult) => void) | null = null;
  private turnMessages: unknown[] = [];
  private turnAbort: AbortController | null = null;
  private turnTextChunk: ((accumulatedText: string) => void) | null = null;
  private streamedText = '';
  private sdkAbort: RendererSafeAbortController | null = null;
  private initReport: ClaudeInitReport | null = null;
  private verificationFailure: string | null = null;
  private disposed = false;

  private constructor(private readonly options: ClaudeCodeAuxSessionOptions) {
    this.queryId = `cc-aux-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    this.safety = {
      backend: 'claude-code',
      enforcedPolicy: 'read-only-allowlist',
      effectiveTools: [...CLAUDE_AUX_ALLOWED_TOOLS],
      deniedCapabilities: AUX_DENIED_CAPABILITIES,
      mechanism: 'claude agent-sdk session with tools=[read-only allowlist], '
        + 'disallowedTools=[write class], strictMcpConfig, canUseTool deny gate; '
        + 'verified against the CLI system/init report on the first turn',
    };
  }

  /** Create the auxiliary session. Throws when the SDK facade is missing. */
  static create(options: ClaudeCodeAuxSessionOptions): ClaudeCodeAuxQuerySession {
    if (!options.sdk) {
      throw new Error('Claude Code auxiliary session requires a loaded SDK.');
    }
    return new ClaudeCodeAuxQuerySession(options);
  }

  /**
   * Start the CLI process eagerly, without submitting a turn (R-C3 prewarm).
   *
   * The read-only session normally spawns the CLI inside the first `runTurn`,
   * which would put the full 1–3 s process start inside the completion trigger
   * path. `warmUp()` opens the SDK query and its prompt queue; the CLI idles
   * until the first real prompt arrives. Enforcement is untouched: the same
   * options are used, and the `system/init` readback still runs on the first
   * turn and still fails the session on any deviation.
   */
  warmUp(): void {
    if (this.pump || this.disposed) return;
    this.startSession();
  }

  /**
   * The tool list the CLI itself reported for this session.
   *
   * `null` until the first turn has been observed. Read-only audit evidence:
   * this value is produced by the CLI, not by the request we sent.
   */
  getRuntimeToolReadback(): readonly string[] | null {
    return this.initReport ? [...this.initReport.tools] : null;
  }

  async query(request: AuxQueryTurnRequest): Promise<AuxQueryResult> {
    return this.runTurn(request);
  }

  async followUp(prompt: string, request?: Partial<AuxQueryTurnRequest>): Promise<AuxQueryResult> {
    return this.runTurn({ ...request, prompt });
  }

  cancel(): void {
    this.turnAbort?.abort();
    const handle = this.handle;
    if (handle && typeof handle.interrupt === 'function') {
      void Promise.resolve(handle.interrupt()).catch((error: unknown) => {
        logger.debug('Claude auxiliary interrupt failed', error);
      });
    }
  }

  async dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.disposal = (async () => {
      this.releaseNativeState();
      try {
        await this.pump;
      } catch {
        // Pump teardown is best effort.
      }
      this.pump = null;
    })();
    return this.disposal;
  }

  // ---------------------------------------------------------------------------
  // Turn execution
  // ---------------------------------------------------------------------------

  private async runTurn(request: AuxQueryTurnRequest): Promise<AuxQueryResult> {
    if (this.disposed) {
      return { success: false, error: 'Claude Code auxiliary session is closed.', cancelled: true };
    }
    if (this.turnSettle) {
      return { success: false, error: 'Claude Code auxiliary session is already running a turn.' };
    }

    const abort = new AbortController();
    this.turnAbort = abort;
    this.turnMessages = [];
    this.streamedText = '';
    this.turnTextChunk = request.onTextChunk ?? null;
    const timeout = setTimeout(
      () => abort.abort(),
      this.options.turnTimeoutMs ?? DEFAULT_TURN_TIMEOUT_MS,
    );
    request.signal?.addEventListener('abort', () => abort.abort(), { once: true });
    abort.signal.addEventListener('abort', () => this.sdkAbort?.abort(), { once: true });

    try {
      if (!this.pump) {
        this.startSession();
      }
      const result = await this.awaitTurn(request, abort);
      if (result.success) {
        // Authoritative end-of-turn emission: the accumulated text built from
        // partial stream events may lag a holdback behind the final message,
        // so the complete assistant text is always emitted once here too.
        request.onTextChunk?.(result.text);
      }
      return result;
    } finally {
      this.turnTextChunk = null;
      clearTimeout(timeout);
      if (this.turnAbort === abort) {
        this.turnAbort = null;
      }
    }
  }

  private startSession(): void {
    // The option set is built here in full rather than inherited from the chat
    // path: the aux session deliberately omits fields the SDK treats as optional
    // (settingSources, permission prompts) so chat options cannot leak in.
    //
    // No local AbortController shim is needed: the renderer-side facade from
    // ClaudeCodeSdkLoader already wraps every query with
    // withSdkAbortControllerShim (see ClaudeCodeSdkAbortShim). The safe
    // controller is still passed as an option so the SDK skips its own
    // default-controller construction and cancels kill the subprocess.
    this.sdkAbort = createRendererSafeAbortController();
    const handle: ClaudeAuxSdkHandle = this.options.sdk.query({
      prompt: this.queue.stream(),
      options: this.buildSdkOptions(this.sdkAbort),
    });
    this.handle = handle;
    this.pump = (async () => {
      try {
        for await (const message of handle) {
          this.observe(message);
        }
      } catch (error) {
        this.settleTurn({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        // The stream ended: any in-flight turn can never complete.
        this.settleTurn({ success: false, error: 'Claude Code auxiliary session ended.' });
      }
    })();
  }

  /** Feed one observed SDK message into the current turn. */
  private observe(message: unknown): void {
    this.turnMessages.push(message);
    const record = message as { type?: unknown; subtype?: unknown };
    if (record?.type === 'system' && record?.subtype === 'init') {
      this.captureInitReport(message);
      return;
    }
    if (record?.type === 'stream_event') {
      this.observeStreamEvent(message);
      return;
    }
    if (record?.type === 'result') {
      this.settleTurn(this.buildTurnResult(message));
    }
  }

  /**
   * Progressive text emission (R-A3): with `includePartialMessages` the SDK
   * wraps raw Messages API stream events; text deltas accumulate into the
   * turn text so the caller can render the growing preview. Only text deltas
   * count — thinking and tool-input JSON never enter the preview channel.
   * Render-only: the authoritative result text still comes from the complete
   * assistant messages at `type === 'result'`.
   */
  private observeStreamEvent(message: unknown): void {
    const emit = this.turnTextChunk;
    if (!emit) return;
    const event = (message as { event?: unknown }).event;
    const record = event as { type?: unknown; delta?: unknown };
    if (record?.type !== 'content_block_delta') return;
    const delta = record.delta as { type?: unknown; text?: unknown };
    if (delta?.type !== 'text_delta' || typeof delta.text !== 'string' || !delta.text) return;
    this.streamedText += delta.text;
    emit(this.streamedText);
  }

  /**
   * Read back the CLI's own session report and fail closed on any deviation.
   *
   * Runtime proof for audit item 1: the tool and MCP server lists come from the
   * CLI's report, not from the request we sent.
   */
  private captureInitReport(message: unknown): void {
    const record = message as {
      tools?: unknown;
      mcp_servers?: unknown;
      permissionMode?: unknown;
    };
    const tools = Array.isArray(record.tools)
      ? record.tools.filter((entry): entry is string => typeof entry === 'string')
      : [];
    const mcpServers = Array.isArray(record.mcp_servers)
      ? record.mcp_servers
        .map((entry) => (typeof entry === 'object' && entry !== null
          ? String((entry as Record<string, unknown>).name ?? '')
          : ''))
        .filter((name) => name.length > 0)
      : [];
    const permissionMode = typeof record.permissionMode === 'string' ? record.permissionMode : undefined;
    this.initReport = { tools, mcpServers, permissionMode };

    const unexpectedTools = tools.filter((name) => !CLAUDE_AUX_ALLOWED_TOOLS.includes(name));
    if (unexpectedTools.length > 0) {
      this.verificationFailure = `Claude Code auxiliary session exposed unexpected tools: ${unexpectedTools.join(', ')}`;
    } else if (mcpServers.length > 0) {
      this.verificationFailure = `Claude Code auxiliary session exposed MCP servers: ${mcpServers.join(', ')}`;
    } else if (permissionMode === 'bypassPermissions') {
      this.verificationFailure = 'Claude Code auxiliary session started in bypassPermissions mode.';
    }

    if (this.verificationFailure) {
      logger.warn(this.verificationFailure);
      this.cancel();
      return;
    }

    // Upgrade the proof to the CLI-reported readback.
    (this.safety as { effectiveTools: readonly string[] }).effectiveTools = [...tools];
  }

  private buildTurnResult(message: unknown): AuxQueryResult {
    if (this.verificationFailure) {
      return { success: false, error: this.verificationFailure };
    }
    const record = message as { subtype?: unknown; is_error?: unknown; result?: unknown };
    const text = accumulateAssistantText(this.turnMessages);
    const toolCalls = collectToolCalls(this.turnMessages);
    if (record.subtype !== 'success' || record.is_error === true) {
      const detail = typeof record.result === 'string' && record.result ? record.result : 'turn failed';
      return { success: false, error: `Claude Code auxiliary turn failed: ${detail}` };
    }
    if (!text) {
      return { success: false, error: 'Claude Code auxiliary turn returned an empty response.' };
    }
    return { success: true, text, toolCalls };
  }

  private awaitTurn(request: AuxQueryTurnRequest, abort: AbortController): Promise<AuxQueryResult> {
    return new Promise<AuxQueryResult>((resolve) => {
      this.turnSettle = resolve;
      abort.signal.addEventListener('abort', () => {
        this.settleTurn({
          success: false,
          error: 'Claude Code auxiliary turn was cancelled.',
          cancelled: true,
        });
      }, { once: true });
      // Image attachments reuse the chat-side queue serialization
      // (ClaudeCodeQueue.createUserPrompt): Anthropic base64 image blocks in
      // the user message content.
      this.queue.push(createUserPrompt(request.prompt, request.images ?? []));
    });
  }

  /**
   * Settle the in-flight turn.
   *
   * A failed or unverifiable turn is fatal for the session: native state is torn
   * down so no later turn can reuse a conversation that was never verified.
   */
  private settleTurn(result: AuxQueryResult): void {
    const resolve = this.turnSettle;
    this.turnSettle = null;
    if (!resolve) return;
    if (!result.success) {
      this.releaseNativeState();
    }
    resolve(result);
  }

  /** Synchronous native teardown; safe to call from inside the pump. */
  private releaseNativeState(): void {
    this.disposed = true;
    this.queue.close();
    this.turnAbort?.abort();
    this.sdkAbort?.abort();
    const handle = this.handle;
    this.handle = null;
    if (handle?.close) {
      try {
        handle.close();
      } catch {
        // The CLI process may already be gone.
      }
    }
  }

  private buildSdkOptions(sdkAbort: RendererSafeAbortController): Record<string, unknown> {
    const options: Record<string, unknown> = {
      cwd: this.options.workingDirectory,
      systemPrompt: this.options.systemPrompt,
      tools: [...CLAUDE_AUX_ALLOWED_TOOLS],
      disallowedTools: [...CLAUDE_AUX_DISALLOWED_TOOLS],
      strictMcpConfig: true,
      // Progressive text deltas for the inline-edit streaming preview (R-A3).
      // Partial stream events are render-only; the turn result still comes
      // from the complete assistant messages.
      includePartialMessages: true,
      includeHookEvents: false,
      persistSession: false,
      permissionMode: 'default',
      // Renderer-safe controller: the DOM AbortSignal from a plain
      // `new AbortController()` is rejected by Node's events helpers inside
      // the bundled SDK (see ClaudeCodeSdkAbortShim).
      abortController: sdkAbort,
      canUseTool: (toolName: string, input: Record<string, unknown>) => {
        if (CLAUDE_AUX_ALLOWED_TOOLS.includes(toolName)) {
          return Promise.resolve({ behavior: 'allow', updatedInput: input });
        }
        logger.debug(`Claude auxiliary session denied tool "${toolName}"`);
        return Promise.resolve({ behavior: 'deny', message: 'This inline-edit session is read-only.' });
      },
    };
    if (this.options.pathToClaudeCodeExecutable) {
      options.pathToClaudeCodeExecutable = this.options.pathToClaudeCodeExecutable;
    }
    if (this.options.env) {
      options.env = { ...this.options.env };
    }
    if (this.options.spawnClaudeCodeProcess) {
      options.spawnClaudeCodeProcess = this.options.spawnClaudeCodeProcess;
    }
    const model = this.options.model;
    if (model && model.kind === 'claude-code') {
      options.model = model.model;
    }
    if (this.options.effort) {
      options.effort = this.options.effort;
    }
    return options;
  }
}

// -----------------------------------------------------------------------------
// Message helpers
// -----------------------------------------------------------------------------

function accumulateAssistantText(messages: readonly unknown[]): string {
  const chunks: string[] = [];
  for (const message of messages) {
    const record = message as { type?: unknown; message?: { content?: unknown } };
    if (record?.type !== 'assistant') continue;
    const content = record.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (typeof block !== 'object' || block === null) continue;
      const typed = block as { type?: unknown; text?: unknown };
      if (typed.type === 'text' && typeof typed.text === 'string' && typed.text) {
        chunks.push(typed.text);
      }
    }
  }
  return chunks.join('');
}

function collectToolCalls(messages: readonly unknown[]): AuxObservedToolCall[] {
  const calls: AuxObservedToolCall[] = [];
  const seen = new Set<string>();
  for (const message of messages) {
    const record = message as { type?: unknown; message?: { content?: unknown } };
    if (record?.type !== 'assistant') continue;
    const content = record.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (typeof block !== 'object' || block === null) continue;
      const typed = block as { type?: unknown; name?: unknown };
      if (typed.type !== 'tool_use' || typeof typed.name !== 'string' || !typed.name) continue;
      if (seen.has(typed.name)) continue;
      seen.add(typed.name);
      calls.push(typed.name.startsWith('mcp__')
        ? { name: typed.name, kind: 'mcp' }
        : { name: typed.name });
    }
  }
  return calls;
}
