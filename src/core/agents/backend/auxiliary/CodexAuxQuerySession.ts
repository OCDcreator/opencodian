/**
 * CodexAuxQuerySession — provably read-only auxiliary session on the Codex
 * app-server protocol.
 *
 * Isolation and read-only enforcement:
 *
 * 1. The thread is created **ephemeral**, so the app-server keeps no rollout on
 *    disk and never returns it from `thread/list` — auxiliary work cannot leak
 *    into the chat session list or into `~/.codex/sessions`.
 * 2. `sandbox: 'read-only'` on the thread plus
 *    `sandboxPolicy: { type: 'readOnly', networkAccess: false }` on the turn
 *    make writes and network access impossible at the sandbox level.
 * 3. `approvalPolicy: 'never'` means the server never asks the host for
 *    approval, so no chat approval handler can be reached from an aux turn.
 * 4. After the thread starts, `getThreadEffectiveSettings()` — the app-server's
 *    own report — is asserted to show a read-only sandbox with approvals off.
 *    A mismatch fails the turn instead of degrading.
 *
 * The aux system prompt travels to the model through `thread/start`'s
 * `developerInstructions`, which is Codex's own thread instruction seam (verified
 * against codex-cli 0.154.0). The safety argument does not rest on that text.
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
import { CodexAppServerClient } from '../CodexAppServerClient';
import type { AppServerTurnStartOptions } from '../CodexAppServerClientTypes';
import { type AppServerStreamState,mapAppServerNotification } from '../CodexAppServerStreamMapper';

const logger = createLogger('CodexAuxQuerySession');

const DEFAULT_TURN_TIMEOUT_MS = 180_000;

/**
 * Temp-dir prefix for image attachments. Mirrors the chat-side prefix
 * (`opencodian-codex-image-` in CodexAdapter); the aux variant is distinct so
 * audit residue probes can tell aux traffic apart from chat traffic.
 */
const AUX_IMAGE_TEMP_PREFIX = 'opencodian-aux-image-';

/** File extension per image media type; mirrors the chat-side mapping. */
const AUX_IMAGE_EXTENSIONS: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

export interface CodexAuxSessionOptions {
  readonly systemPrompt: string;
  readonly model?: BackendModelSelection;
  /** Codex-native reasoning effort (`minimal..persistent`), sent per turn. */
  readonly effort?: AppServerTurnStartOptions['effort'];
  readonly workingDirectory: string;
  /** Shared app-server client owned by the adapter. */
  readonly client: CodexAppServerClient;
  readonly turnTimeoutMs?: number;
}

/** The app-server's own effective-settings report, narrowed to what we assert. */
export interface CodexEffectiveSettings {
  readonly approvalPolicy?: string;
  readonly sandboxType?: string;
  readonly networkAccess?: boolean;
  readonly cwd?: string;
}

export class CodexAuxQuerySession implements AuxQuerySession {
  readonly queryId: string;
  readonly safety: AuxQuerySafetyProof;

  private threadId: string | null = null;
  private turnAbort: AbortController | null = null;
  private subscription: { dispose(): void } | null = null;
  private inFlight: Promise<AuxQueryResult> | null = null;
  private disposed = false;
  private observedTools: AuxObservedToolCall[] = [];
  private effectiveSettings: CodexEffectiveSettings | null = null;
  /** Temp dirs currently holding image attachments; dispose() sweeps them. */
  private readonly imageTempDirs = new Set<string>();

  private constructor(private readonly options: CodexAuxSessionOptions) {
    this.queryId = `codex-aux-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    this.safety = {
      backend: 'codex',
      // Codex's enforcement is the sandbox rather than an empty tool set: the
      // model keeps a shell, but the sandbox makes it read-only. `effectiveTools`
      // therefore reports the runtime-verified enforcement axes, all of which
      // come from the app-server's own effective-settings report.
      enforcedPolicy: 'read-only-allowlist',
      effectiveTools: [],
      deniedCapabilities: AUX_DENIED_CAPABILITIES,
      mechanism: 'codex ephemeral thread with sandbox=read-only, '
        + 'turn sandboxPolicy={readOnly, networkAccess:false}, approvalPolicy=never; '
        + 'verified against the app-server effective-settings report',
    };
  }

  /** Create the auxiliary session and its ephemeral thread. */
  static async create(options: CodexAuxSessionOptions): Promise<CodexAuxQuerySession> {
    const session = new CodexAuxQuerySession(options);
    await session.startThread();
    return session;
  }

  /** The app-server's own effective settings for this thread. */
  getEffectiveSettings(): CodexEffectiveSettings | null {
    return this.effectiveSettings;
  }

  async query(request: AuxQueryTurnRequest): Promise<AuxQueryResult> {
    return this.runTurn(request);
  }

  async followUp(prompt: string, request?: Partial<AuxQueryTurnRequest>): Promise<AuxQueryResult> {
    return this.runTurn({ ...request, prompt });
  }

  cancel(): void {
    this.turnAbort?.abort();
    const threadId = this.threadId;
    const turnId = this.currentTurnId;
    if (threadId && turnId) {
      void this.options.client.interruptTurn(threadId, turnId).catch((error: unknown) => {
        logger.debug('Codex auxiliary interrupt failed', error);
      });
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.turnAbort?.abort();
    this.subscription?.dispose();
    this.subscription = null;
    const threadId = this.threadId;
    this.threadId = null;
    // Backstop: a cancelled turn normally cleans its own image temp dir in
    // the turn's finally, but a wedged turn must not leave one behind either.
    // The dirs live in the system temp directory, never in the vault, so the
    // vault-snapshot audit is unaffected; this sweep just keeps /tmp clean.
    for (const dir of this.imageTempDirs) {
      removeImageTempDir(dir);
    }
    this.imageTempDirs.clear();
    if (!threadId) return;
    // Ephemeral threads are not persisted, so there is no rollout to archive
    // (the app-server reports "no rollout found" for them). Only the adapter's
    // client-side settings cache needs clearing.
    this.options.client.clearThreadEffectiveSettings(threadId);
  }

  // ---------------------------------------------------------------------------
  // Thread lifecycle
  // ---------------------------------------------------------------------------

  private async startThread(): Promise<void> {
    const thread = await this.options.client.startThread({
      cwd: this.options.workingDirectory,
      sandbox: 'read-only',
      approvalPolicy: 'never',
      ephemeral: true,
      // Codex's own thread instruction seam: the model keeps its base
      // instructions (and therefore its tool knowledge) and the read-only
      // editing contract is layered on top.
      developerInstructions: this.options.systemPrompt,
    });
    if (!thread?.id) {
      throw new Error('Codex auxiliary session could not create an ephemeral thread.');
    }
    this.threadId = thread.id;
    this.verifyEffectiveSettings(thread.id);
  }

  /**
   * Assert the app-server's own report shows the read-only shape.
   *
   * Runtime proof for audit item 1: the sandbox type, network access, and
   * approval policy come from the server's effective settings, not from the
   * parameters we sent.
   */
  private verifyEffectiveSettings(threadId: string): void {
    const raw = this.options.client.getThreadEffectiveSettings(threadId) as
      | Record<string, unknown>
      | null;
    if (!raw) {
      throw new Error(
        'Codex auxiliary session could not read back effective thread settings; refusing to run.',
      );
    }
    const sandbox = typeof raw.sandbox === 'object' && raw.sandbox !== null
      ? raw.sandbox as Record<string, unknown>
      : {};
    const settings: CodexEffectiveSettings = {
      ...(typeof raw.approvalPolicy === 'string' ? { approvalPolicy: raw.approvalPolicy } : {}),
      ...(typeof sandbox.type === 'string' ? { sandboxType: sandbox.type } : {}),
      ...(typeof sandbox.networkAccess === 'boolean' ? { networkAccess: sandbox.networkAccess } : {}),
      ...(typeof raw.cwd === 'string' ? { cwd: raw.cwd } : {}),
    };
    this.effectiveSettings = settings;

    if (settings.sandboxType !== 'readOnly') {
      throw new Error(
        `Codex auxiliary session is not read-only: reported sandbox is "${settings.sandboxType ?? 'unknown'}".`,
      );
    }
    if (settings.networkAccess) {
      throw new Error('Codex auxiliary session reported network access enabled.');
    }
    if (settings.approvalPolicy !== 'never') {
      throw new Error(
        `Codex auxiliary session reported approval policy "${settings.approvalPolicy ?? 'unknown'}".`,
      );
    }
    (this.safety as { effectiveTools: readonly string[] }).effectiveTools = [
      `sandbox:${settings.sandboxType}`,
      `approval:${settings.approvalPolicy}`,
      `network:${settings.networkAccess ? 'true' : 'false'}`,
    ];
  }

  // ---------------------------------------------------------------------------
  // Turn execution
  // ---------------------------------------------------------------------------

  private async runTurn(request: AuxQueryTurnRequest): Promise<AuxQueryResult> {
    if (this.disposed || !this.threadId) {
      return { success: false, error: 'Codex auxiliary session is closed.', cancelled: true };
    }
    if (this.inFlight) {
      return { success: false, error: 'Codex auxiliary session is already running a turn.' };
    }
    const run = this.executeTurn(request);
    this.inFlight = run;
    try {
      return await run;
    } finally {
      if (this.inFlight === run) this.inFlight = null;
    }
  }

  private currentTurnId: string | null = null;

  private async executeTurn(request: AuxQueryTurnRequest): Promise<AuxQueryResult> {
    const threadId = this.threadId as string;
    const abort = new AbortController();
    this.turnAbort = abort;
    this.observedTools = [];
    this.currentTurnId = null;

    let text = '';
    let toolUseSeen = false;
    let settled: ((result: AuxQueryResult) => void) | null = null;
    let settledResult: AuxQueryResult | null = null;

    const streamState: AppServerStreamState = {
      streamedAgentMessageItemIds: new Set<string>(),
      streamedReasoningItemIds: new Set<string>(),
      startedTodoItemIds: new Set<string>(),
      outputSchema: null,
    };

    const settle = (result: AuxQueryResult): void => {
      if (settledResult) return;
      settledResult = result;
      settled?.(result);
    };

    this.subscription = this.options.client.subscribeToThreadNotifications(threadId, (event) => {
      if (event.method === 'turn/completed') {
        settle({ success: true, text, toolCalls: [...this.observedTools] });
        return;
      }
      const mapped = mapAppServerNotification({
        event,
        threadId,
        sessionId: threadId,
        modelId: this.resolveModelId(),
        streamState,
      });
      for (const chunk of mapped.chunks) {
        if (chunk.type === 'text') {
          text += chunk.content;
          request.onTextChunk?.(text);
        } else if (chunk.type === 'tool_use') {
          toolUseSeen = true;
          this.observedTools.push({
            name: chunk.name,
            ...(chunk.kind === 'mcp' ? { kind: 'mcp' } : {}),
          });
        }
      }
    });

    const timeout = setTimeout(
      () => abort.abort(),
      this.options.turnTimeoutMs ?? DEFAULT_TURN_TIMEOUT_MS,
    );
    request.signal?.addEventListener('abort', () => abort.abort(), { once: true });

    const completion = new Promise<AuxQueryResult>((resolve) => {
      settled = resolve;
      if (settledResult) resolve(settledResult);
    });

    let imageTempDir: string | null = null;
    let input: AppServerTurnStartOptions['input'];
    try {
      const built = this.buildTurnInput(request);
      input = built.input;
      imageTempDir = built.imageTempDir;
    } catch (error) {
      clearTimeout(timeout);
      this.subscription.dispose();
      this.subscription = null;
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    try {
      const turn = await this.options.client.startTurn({
        threadId,
        input,
        cwd: this.options.workingDirectory,
        approvalPolicy: 'never',
        sandboxPolicy: { type: 'readOnly', networkAccess: false },
        ...(this.resolveModelId() ? { model: this.resolveModelId() as string } : {}),
        ...(this.options.effort ? { effort: this.options.effort } : {}),
      });
      this.currentTurnId = turn?.id ?? null;
    } catch (error) {
      clearTimeout(timeout);
      this.subscription.dispose();
      this.subscription = null;
      this.cleanupImageTempDir(imageTempDir);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    abort.signal.addEventListener('abort', () => {
      settle({ success: false, error: 'Codex auxiliary turn was cancelled.', cancelled: true });
    }, { once: true });

    try {
      const result = await completion;
      if (!result.success) return result;
      if (!text && !toolUseSeen) {
        return { success: false, error: 'Codex auxiliary turn returned an empty response.' };
      }
      return result;
    } finally {
      clearTimeout(timeout);
      this.subscription?.dispose();
      this.subscription = null;
      this.cleanupImageTempDir(imageTempDir);
      if (this.turnAbort === abort) this.turnAbort = null;
      this.currentTurnId = null;
    }
  }

  /**
   * Turn input: one text entry plus, for image attachments, one `localImage`
   * entry per image — the chat-side app-server shape (CodexAdapter
   * `buildAppServerInput`). `local_image` requires a real file path, so each
   * image is decoded into a temp dir in the SYSTEM temp directory (never the
   * vault); the turn's finally removes the dir, and `dispose()` sweeps any
   * leftover.
   */
  private buildTurnInput(request: AuxQueryTurnRequest): {
    input: AppServerTurnStartOptions['input'];
    imageTempDir: string | null;
  } {
    const text: AppServerTurnStartOptions['input'][number] = {
      type: 'text',
      text: request.prompt,
      text_elements: [],
    };
    const images = request.images ?? [];
    if (images.length === 0) return { input: [text], imageTempDir: null };
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), AUX_IMAGE_TEMP_PREFIX));
    this.imageTempDirs.add(tempDir);
    const input: AppServerTurnStartOptions['input'] = [text];
    images.forEach((image, index) => {
      const ext = AUX_IMAGE_EXTENSIONS[image.mediaType] ?? 'bin';
      const filePath = path.join(tempDir, `image-${index}.${ext}`);
      fs.writeFileSync(filePath, Buffer.from(image.data, 'base64'));
      input.push({ type: 'localImage', path: filePath });
    });
    return { input, imageTempDir: tempDir };
  }

  private cleanupImageTempDir(dir: string | null): void {
    if (!dir) return;
    this.imageTempDirs.delete(dir);
    removeImageTempDir(dir);
  }

  private resolveModelId(): string | null {
    const model = this.options.model;
    return model && model.kind === 'codex' ? model.model : null;
  }
}

function removeImageTempDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (error) {
    logger.warn('Failed to remove Codex auxiliary image temp dir', error);
  }
}
