import { spawn } from 'child_process';

import type { AgentBackendKind, StreamChunk } from '../../types/chat';
import type { ClaudeCodeBackendSettings } from '../../types/settings';
import { AgentCapability, type BackendCapabilities } from '../AgentCapability';
import type {
  AgentChatCapability,
  AgentChatSendRequest,
  AgentConnectionStatus,
  AgentService,
  AgentServiceInfo,
  AgentSessionCapability,
  Disposable,
  StatusChangeHandler,
} from './AgentService';
import {
  buildClaudeCodeOptions,
  type ClaudeCodeSdkOptionsShape,
  type ClaudeCodeSpawnRequest,
} from './ClaudeCodeOptionsBuilder';
import { ClaudeCodePermissionBridge } from './ClaudeCodePermissionBridge';
import { ClaudeCodeStreamNormalizer } from './ClaudeCodeStreamNormalizer';

export interface ClaudeCodeSdkQueryInput {
  prompt: string | AsyncIterable<unknown>;
  options: ClaudeCodeSdkOptionsShape;
}

export interface ClaudeCodeSdkFacade {
  query(input: ClaudeCodeSdkQueryInput): AsyncIterable<unknown>;
}

export type ClaudeCodeSdkLoader = () => Promise<ClaudeCodeSdkFacade>;

export interface ClaudeCodeAdapterOptions {
  vaultPath: string;
  settings: ClaudeCodeBackendSettings;
  pathToClaudeCodeExecutable?: string;
  sdk?: ClaudeCodeSdkFacade;
  sdkLoader?: ClaudeCodeSdkLoader;
  permissionBridge?: ClaudeCodePermissionBridge;
}

const CLAUDE_CODE_PHASE1_CAPABILITIES: BackendCapabilities = Object.freeze(
  new Set<AgentCapability>([
    AgentCapability.Chat,
    AgentCapability.Sessions,
    AgentCapability.Tools,
    AgentCapability.Mcp,
    AgentCapability.Permissions,
    AgentCapability.Thinking,
    AgentCapability.FileOps,
    AgentCapability.Shell,
  ]),
);

interface ClaudeCodeSessionState {
  id: string;
  title: string;
  messages: ClaudeCodeQueuedPrompt[];
}

interface ClaudeCodeQueuedPrompt {
  type: 'user';
  message: { role: 'user'; content: string };
}

class ClaudeCodeRuntimeAbortController {
  private readonly controller = new AbortController();
  readonly signal = this.controller.signal;

  abort(reason?: unknown): void {
    this.controller.abort(reason);
  }
}

function createSessionId(): string {
  return `claude-code-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function* singlePrompt(prompt: string): AsyncGenerator<ClaudeCodeQueuedPrompt> {
  yield {
    type: 'user',
    message: {
      role: 'user',
      content: prompt,
    },
  };
}

export class ClaudeCodeAdapter
  implements AgentService, AgentChatCapability, AgentSessionCapability
{
  readonly kind: AgentBackendKind = 'claude-code';
  readonly displayName = 'Claude Code';
  readonly description = 'Claude Code official Agent SDK backend';
  readonly capabilities = CLAUDE_CODE_PHASE1_CAPABILITIES;

  private statusValue: AgentConnectionStatus = 'disconnected';
  private readonly statusChangeHandlers = new Set<StatusChangeHandler>();
  private readonly sessions = new Map<string, ClaudeCodeSessionState>();
  private readonly cancelledSessions = new Set<string>();
  private readonly invalidatedSessions = new Set<string>();
  private sdkLoadPromise: Promise<ClaudeCodeSdkFacade> | null = null;

  constructor(private readonly options: ClaudeCodeAdapterOptions) {}

  hasCapability(cap: AgentCapability): boolean {
    return this.capabilities.has(cap);
  }

  get status(): AgentConnectionStatus {
    return this.statusValue;
  }

  getInfo(): AgentServiceInfo {
    return {
      kind: this.kind,
      displayName: this.displayName,
      description: this.description,
      status: this.status,
      capabilities: this.capabilities,
    };
  }

  async start(): Promise<void> {
    this.setStatus('connected');
  }

  async stop(): Promise<void> {
    this.cancelledSessions.clear();
    this.setStatus('disconnected');
  }

  dispose(): void {
    this.cancelledSessions.clear();
    for (const sessionId of this.sessions.keys()) {
      this.invalidatedSessions.add(sessionId);
    }
    this.sessions.clear();
    this.statusChangeHandlers.clear();
    this.statusValue = 'disconnected';
  }

  onStatusChange(handler: StatusChangeHandler): Disposable {
    this.statusChangeHandlers.add(handler);
    return { dispose: () => this.statusChangeHandlers.delete(handler) };
  }

  async createSession(title = 'New Claude Code chat'): Promise<string> {
    const id = createSessionId();
    this.invalidatedSessions.delete(id);
    this.sessions.set(id, {
      id,
      title,
      messages: [],
    });
    return id;
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.cancelledSessions.add(sessionId);
    this.invalidatedSessions.add(sessionId);
    this.sessions.delete(sessionId);
  }

  async updateSessionTitle(sessionId: string, title: string): Promise<void> {
    const session = this.requireSession(sessionId);
    session.title = title;
  }

  async *sendMessage(request: AgentChatSendRequest): AsyncGenerator<StreamChunk> {
    const session = this.getOrRestoreSession(request.sessionId);
    this.cancelledSessions.delete(request.sessionId);
    const prompt = {
      type: 'user' as const,
      message: {
        role: 'user' as const,
        content: request.content,
      },
    };
    session.messages.push(prompt);

    const normalizer = new ClaudeCodeStreamNormalizer({
      sessionId: request.sessionId,
    });
    const abortController = new ClaudeCodeRuntimeAbortController() as AbortController;
    const options = this.buildSdkOptions(abortController);
    let sdk: ClaudeCodeSdkFacade;
    try {
      sdk = await this.getSdk();
    } catch (error) {
      yield {
        type: 'error',
        content: `Claude Code SDK unavailable: ${error instanceof Error ? error.message : String(error)}`,
      };
      return;
    }

    const source = sdk.query({
      prompt: singlePrompt(request.content),
      options,
    });

    let sawChunk = false;
    try {
      for await (const message of source) {
        if (this.cancelledSessions.has(request.sessionId)) {
          return;
        }
        const chunks = normalizer.transformSDKMessage(message);
        for (const chunk of chunks) {
          sawChunk = true;
          yield chunk;
        }
      }
    } catch (error) {
      yield {
        type: 'error',
        content: `Claude Code stream failed: ${error instanceof Error ? error.message : String(error)}`,
      };
      if (!sawChunk) {
        return;
      }
    }
  }

  cancelStream(sessionId: string): void {
    this.cancelledSessions.add(sessionId);
  }

  private buildSdkOptions(abortController?: AbortController): ClaudeCodeSdkOptionsShape {
    return buildClaudeCodeOptions({
      vaultPath: this.options.vaultPath,
      settings: this.options.settings,
      pathToClaudeCodeExecutable: this.options.pathToClaudeCodeExecutable,
      abortController,
      spawnClaudeCodeProcess: this.spawnClaudeCodeProcess,
      canUseTool: this.options.permissionBridge
        ? this.options.permissionBridge.canUseTool.bind(this.options.permissionBridge)
        : undefined,
    });
  }

  private readonly spawnClaudeCodeProcess = (request: ClaudeCodeSpawnRequest) => {
    const child = spawn(request.command, request.args, {
      cwd: request.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: request.env as NodeJS.ProcessEnv,
      windowsHide: true,
    });

    request.signal?.addEventListener('abort', () => {
      if (!child.killed) {
        child.kill('SIGTERM');
      }
    }, { once: true });

    return {
      stdin: child.stdin,
      stdout: child.stdout,
      get killed() {
        return child.killed;
      },
      get exitCode() {
        return child.exitCode;
      },
      kill: child.kill.bind(child),
      on: child.on.bind(child),
      once: child.once.bind(child),
      off: child.off.bind(child),
    };
  };

  private getSdk(): Promise<ClaudeCodeSdkFacade> {
    if (this.options.sdk) {
      return Promise.resolve(this.options.sdk);
    }
    if (!this.options.sdkLoader) {
      return Promise.reject(new Error('No Claude Code SDK loader configured'));
    }
    this.sdkLoadPromise ??= this.options.sdkLoader();
    return this.sdkLoadPromise;
  }

  private requireSession(sessionId: string): ClaudeCodeSessionState {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Claude Code session not found: ${sessionId}`);
    }
    return session;
  }

  private getOrRestoreSession(sessionId: string): ClaudeCodeSessionState {
    const session = this.sessions.get(sessionId);
    if (session) {
      return session;
    }
    if (this.invalidatedSessions.has(sessionId)) {
      throw new Error(`Claude Code session not found: ${sessionId}`);
    }

    const restoredSession: ClaudeCodeSessionState = {
      id: sessionId,
      title: 'Restored Claude Code chat',
      messages: [],
    };
    this.sessions.set(sessionId, restoredSession);
    return restoredSession;
  }

  private setStatus(status: AgentConnectionStatus): void {
    if (this.statusValue === status) {
      return;
    }
    this.statusValue = status;
    for (const handler of this.statusChangeHandlers) {
      handler(status);
    }
  }
}
