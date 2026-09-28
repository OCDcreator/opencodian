/* eslint-disable max-lines -- OpenCode 2 protocol methods stay together at the separate transport boundary. */
/** OpenCode 2 transport boundary. V2 has a separate CLI, HTTP API and event schema. */
import { type ChildProcessWithoutNullStreams,spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rmdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { OpenCodeClient } from '@opencode/client';

import { appendObsidianContextBlocks } from '../../../shared/obsidianContext';
import { prependMemoryInjection } from '../../memory';
import { prependObsidianToolingInjection } from '../../obsidianTooling';
import { createSdkFetch } from '../../opencode/sdkFetch';
import type { ChatMessage, ContextUsageSnapshot, QuestionRequest, SessionDiffEntry, StreamChunk, ToolCallInfo } from '../../types/chat';
import type { OpenCode2BackendSettings } from '../../types/settings';
import { AgentCapability, type BackendCapabilities } from '../AgentCapability';
import { AUX_DENIED_CAPABILITIES, type AuxQueryResult, type AuxQuerySession, type AuxQuerySessionConfig, type AuxQueryTurnRequest } from './AgentAuxQueryCapability';
import type { InlineCompletionSession, InlineCompletionSessionConfig } from './AgentInlineCompletionCapability';
import type {
  AgentBranchCapability,
  AgentChatCapability,
  AgentChatSendRequest,
  AgentConnectionStatus,
  AgentPermissionCapability,
  AgentQuestionCapability,
  AgentService,
  AgentSessionCapability,
  Disposable,
  StatusChangeHandler,
} from './AgentService';
import { WarmInlineCompletionSession } from './auxiliary/WarmInlineCompletionSession';

const CAPABILITIES: BackendCapabilities = Object.freeze(new Set([
  AgentCapability.Chat,
  AgentCapability.Sessions,
  AgentCapability.Models,
  AgentCapability.Images,
  AgentCapability.Permissions,
  AgentCapability.Tools,
  AgentCapability.Thinking,
  AgentCapability.Fork,
  AgentCapability.Branching,
  AgentCapability.Compaction,
  AgentCapability.CostTracking,
  AgentCapability.Context,
  AgentCapability.Questions,
  AgentCapability.Subagents,
  AgentCapability.TurnSteering,
  AgentCapability.AuxQuery,
  AgentCapability.InlineCompletion,
]));

interface ActiveTurn {
  controller: AbortController;
  events: Array<{ type: string; data?: Record<string, unknown> }>;
  wake: (() => void) | null;
  toolNames: Map<string, string>;
  toolInputs: Map<string, Record<string, unknown>>;
}

export interface OpenCode2AdapterOptions {
  workingDirectory: string;
  getSettings: () => OpenCode2BackendSettings;
  /** Isolated auxiliary process environment, never a persisted plugin setting. */
  extraEnv?: Readonly<Record<string, string>>;
}

export class OpenCode2Adapter implements AgentService, AgentChatCapability, AgentSessionCapability, AgentPermissionCapability, AgentQuestionCapability, AgentBranchCapability {
  readonly kind = 'opencode2' as const;
  readonly displayName = 'OpenCode 2';
  readonly description = 'OpenCode 2 API';
  readonly capabilities = CAPABILITIES;

  private client: OpenCodeClient | null = null;
  private process: ChildProcessWithoutNullStreams | null = null;
  private statusValue: AgentConnectionStatus = 'disconnected';
  private readonly statusHandlers = new Set<StatusChangeHandler>();
  private readonly turns = new Map<string, ActiveTurn>();
  private starting: Promise<void> | null = null;
  private readonly permissionSessions = new Map<string, string>();
  private readonly questionSessions = new Map<string, string>();
  private defaultModel: { provider: string; model: string } | null = null;
  private connectionKey: string | null = null;

  constructor(private readonly options: OpenCode2AdapterOptions) {}

  get status(): AgentConnectionStatus { return this.statusValue; }
  hasCapability(cap: AgentCapability): boolean { return this.capabilities.has(cap); }
  onStatusChange(handler: StatusChangeHandler): Disposable {
    this.statusHandlers.add(handler);
    return { dispose: () => this.statusHandlers.delete(handler) };
  }

  private setStatus(status: AgentConnectionStatus): void {
    this.statusValue = status;
    for (const handler of this.statusHandlers) handler(status);
  }

  async start(): Promise<void> {
    if (this.starting) return this.starting;
    const settings = this.options.getSettings();
    const key = JSON.stringify([settings.mode, settings.executablePath, settings.baseUrl, settings.password, settings.configContent ?? '']);
    this.starting = (async () => {
      if (this.client && this.connectionKey === key) {
        try { await this.client.server.info({ signal: AbortSignal.timeout(5000) }); return; }
        catch { /* A stopped listener may precede the owned process exit event. */ }
      }
      if (this.client || this.process) await this.stop();
      this.setStatus('connecting');
      try {
        await this.connect(settings);
        this.connectionKey = key;
        this.setStatus('connected');
      } catch (error) {
        await this.stop();
        this.setStatus('error');
        throw error;
      }
    })().finally(() => { this.starting = null; });
    return this.starting;
  }

  private async connect(settings: OpenCode2BackendSettings): Promise<void> {
    const password = settings.mode === 'local' ? randomBytes(32).toString('base64url') : settings.password;
    let baseUrl = settings.baseUrl.trim();
    if (settings.mode === 'local') {
      const executable = settings.executablePath.trim() || 'opencode2';
      const child = spawn(executable, ['serve', '--stdio', '--hostname', '127.0.0.1', '--port', '0', '--cors', 'app://obsidian.md'], {
        cwd: this.options.workingDirectory,
        env: { ...process.env,
          ...(settings.configContent?.trim() ? { OPENCODE_CONFIG_CONTENT: settings.configContent } : {}),
          ...this.options.extraEnv, OPENCODE_PASSWORD: password },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
      this.process = child;
      baseUrl = await new Promise<string>((resolve, reject) => {
        let output = '';
        const timeout = setTimeout(() => reject(new Error('OpenCode 2 server start timed out')), 15000);
        const finish = (url?: string, error?: Error) => {
          clearTimeout(timeout);
          child.stdout.removeAllListeners('data');
          child.removeAllListeners('error');
          child.removeAllListeners('exit');
          if (url) resolve(url); else reject(error ?? new Error('OpenCode 2 server exited'));
        };
        child.once('error', (error) => finish(undefined, error));
        child.once('exit', () => finish());
        child.stdout.on('data', (chunk: Buffer) => {
          output += chunk.toString();
          const line = output.split('\n')[0];
          if (!line.endsWith('}') || !line.startsWith('{')) return;
          try {
            const parsed = JSON.parse(line) as { url?: unknown };
            if (typeof parsed.url === 'string' && /^http:\/\/127\.0\.0\.1:\d+$/.test(parsed.url)) finish(parsed.url);
          } catch { /* wait for a complete handshake */ }
        });
      });
      child.stderr.resume();
      child.stdout.resume();
      child.on('exit', () => {
        if (this.process !== child) return;
        this.client = null;
        this.connectionKey = null;
        for (const turn of this.turns.values()) {
          turn.events.push({ type: 'transport.error' });
          turn.wake?.();
          turn.controller.abort();
        }
        this.setStatus('error');
      });
    }
    if (!/^https?:\/\//.test(baseUrl)) throw new Error('OpenCode 2 server URL is invalid');
    const auth = Buffer.from(`opencode:${password}`, 'utf8').toString('base64');
    const { OpenCode } = await import('@opencode/client');
    const client = OpenCode.make({
      baseUrl,
      headers: { Authorization: `Basic ${auth}` },
      fetch: createSdkFetch(),
    });
    const info = await client.server.info();
    if (!info.version.startsWith('2.')) throw new Error(`Expected OpenCode 2 server, got ${info.version}`);
    this.client = client;
  }

  async stop(): Promise<void> {
    await Promise.allSettled([...this.turns.keys()].map((id) => this.cancelStream(id)));
    for (const turn of this.turns.values()) {
      turn.events.push({ type: 'session.execution.interrupted' });
      turn.wake?.();
      turn.controller.abort();
    }
    this.client = null;
    this.connectionKey = null;
    const child = this.process;
    this.process = null;
    if (child && child.exitCode === null) {
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 3000);
        child.once('exit', () => { clearTimeout(timeout); resolve(); });
        child.kill();
      });
    }
    this.setStatus('disconnected');
  }

  dispose(): void {
    void this.stop();
    this.statusHandlers.clear();
  }

  private async ready(): Promise<OpenCodeClient> {
    await this.start();
    if (!this.client) throw new Error('OpenCode 2 client unavailable');
    return this.client;
  }

  async createSession(title?: string): Promise<string> {
    const client = await this.ready();
    const session = await client.session.create({
      ...(title ? { title } : {}),
      location: { directory: this.options.workingDirectory },
    });
    return session.id;
  }

  async listSessions(): Promise<unknown[]> {
    const client = await this.ready();
    const sessions: unknown[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = await client.session.list({ directory: this.options.workingDirectory, limit: 100, ...(cursor ? { cursor } : {}) });
      sessions.push(...page.data);
      const next = page.cursor.next ?? undefined;
      if (page.data.length < 100 || !next || seenCursors.has(next)) break;
      seenCursors.add(next);
      cursor = next;
    } while (cursor);
    return sessions;
  }

  async getSession(sessionId: string): Promise<unknown | null> {
    const client = await this.ready();
    try { return await client.session.get({ sessionID: sessionId }); } catch { return null; }
  }

  async deleteSession(sessionId: string): Promise<void> {
    const client = await this.ready();
    await client.session.remove({ sessionID: sessionId });
  }

  async updateSessionTitle(sessionId: string, title: string): Promise<void> {
    const client = await this.ready();
    await client.session.update({ sessionID: sessionId, title });
  }

  async forkSession(sessionId: string, messageID?: string): Promise<{ id: string; title: string }> {
    const client = await this.ready();
    const session = await client.session.fork({ sessionID: sessionId, ...(messageID ? { before: messageID } : {}) });
    return { id: session.id, title: session.title ?? '' };
  }

  async revertSession(sessionId: string, messageID: string): Promise<boolean> {
    const client = await this.ready();
    await client.session.revert.stage({ sessionID: sessionId, messageID, files: true });
    return true;
  }

  async unrevertSession(sessionId: string): Promise<boolean> {
    const client = await this.ready();
    await client.session.revert.clear({ sessionID: sessionId });
    return true;
  }

  async getSessionRevertState(sessionId: string): Promise<{ messageID: string; partID?: string } | null> {
    const session = await this.getSession(sessionId) as { revert?: { messageID: string; partID?: string } } | null;
    return session?.revert ?? null;
  }

  getSessionDiff(sessionId: string, messageID: string): Promise<SessionDiffEntry[]>;
  getSessionDiff(sessionId: string): Promise<SessionDiffEntry[] | null>;
  async getSessionDiff(sessionId: string, messageID?: string): Promise<SessionDiffEntry[] | null> {
    const client = await this.ready();
    if (messageID) return client.session.diff({ sessionID: sessionId, from: messageID });
    // V2's omitted range means the latest turn. The sidebar needs the current
    // session range, excluding messages hidden by a staged native revert.
    const [session, messages] = await Promise.all([
      client.session.get({ sessionID: sessionId }), this.listAllMessages(client, sessionId),
    ]);
    const revertIndex = session.revert
      ? messages.findIndex((message) => message.id === session.revert?.messageID) : -1;
    if (session.revert && revertIndex < 0) throw new Error('OpenCode 2 revert anchor was not found in native history');
    const visible = revertIndex >= 0 ? messages.slice(0, revertIndex) : messages;
    const users = visible.filter((message) => message.type === 'user');
    if (users.length === 0) return [];
    // Missing native snapshots (including non-Git vaults) are unknown session
    // state, not an authoritative empty diff. Never request workspace status.
    if (!visible.some((message) => message.type === 'assistant' && message.snapshot?.start)) {
      const files = new Set<string>();
      for (const message of visible) {
        if (message.type !== 'assistant') continue;
        for (const part of message.content) {
          if (part.type !== 'tool' || part.state.status !== 'completed' || !/^(write|edit|patch|apply_?patch)$/i.test(part.name)) continue;
          const input = part.state.input;
          const file = input.file ?? input.path ?? input.filePath;
          if (typeof file === 'string' && file) files.add(file);
        }
      }
      return files.size ? [...files].map((file) => ({ file, additions: 0, deletions: 0, statsUnavailable: true })) : null;
    }
    return client.session.diff({ sessionID: sessionId, from: users[0].id, to: users[users.length - 1].id });
  }

  async getSessionChildren(sessionId: string): Promise<unknown[]> {
    const client = await this.ready();
    const result = await client.session.list({ parentID: sessionId, directory: this.options.workingDirectory, limit: 100 });
    return result.data;
  }

  async getBackgroundTasks(sessionId: string): Promise<Array<{ taskId: string; status: string; description: string; cancellable: boolean }>> {
    const client = await this.ready();
    const [children, messages] = await Promise.all([
      this.getSessionChildren(sessionId), this.listAllMessages(client, sessionId),
    ]);
    const childById = new Map((children as Array<{ id: string; title?: string; outcome?: string }>).map((child) => [child.id, child]));
    const tasks = new Map<string, { taskId: string; status: string; description: string; cancellable: boolean }>();
    for (const message of messages) {
      if (message.type !== 'assistant') continue;
      for (const part of message.content) {
        if (part.type !== 'tool' || part.name !== 'subagent') continue;
        const state = part.state;
        if (state.status === 'streaming') continue;
        const input = state.input;
        const metadata = state.metadata;
        const childId = typeof metadata?.sessionID === 'string' ? metadata.sessionID
          : typeof input.sessionID === 'string' ? input.sessionID : null;
        if (!childId) continue;
        const child = childById.get(childId);
        const background = input.background === true || metadata?.status === 'running';
        if (!background) continue;
        const status = !child ? 'unknown' : child.outcome === 'succeeded' ? 'completed'
          : child?.outcome === 'failed' ? 'failed'
            : child?.outcome === 'interrupted' ? 'interrupted' : 'running';
        tasks.set(childId, { taskId: childId, status,
          description: typeof input.description === 'string' ? input.description : child?.title ?? 'Subagent',
          cancellable: status === 'running' });
      }
    }
    return [...tasks.values()];
  }

  async cancelBackgroundTask(sessionId: string, taskId: string): Promise<boolean> {
    const tasks = await this.getBackgroundTasks(sessionId);
    if (!tasks.some((task) => task.taskId === taskId && task.cancellable)) return false;
    const client = await this.ready();
    await client.session.interrupt({ sessionID: taskId });
    return true;
  }

  async getBackgroundTaskChanges(sessionId: string, taskId: string): Promise<{ sourceMessageId: string; entries: SessionDiffEntry[] } | null> {
    const client = await this.ready();
    const children = await this.getSessionChildren(sessionId) as Array<{ id: string; outcome?: string }>;
    if (!children.some((child) => child.id === taskId && child.outcome === 'succeeded')) return null;
    const parentMessages = await this.listAllMessages(client, sessionId);
    let sourceMessageId = '';
    let anchor = '';
    for (const message of parentMessages) {
      if (message.type === 'user') sourceMessageId = message.id;
      if (message.type === 'assistant' && message.content.some((part) => part.type === 'tool'
        && part.name === 'subagent' && part.state.status !== 'streaming'
        && part.state.metadata?.sessionID === taskId)) anchor = sourceMessageId;
    }
    if (!anchor) return null;
    const native = await this.getSessionDiff(taskId);
    if (native !== null) return { sourceMessageId: anchor, entries: native };
    const childMessages = await this.listAllMessages(client, taskId);
    const files = new Set<string>();
    for (const message of childMessages) {
      if (message.type !== 'assistant') continue;
      for (const part of message.content) {
        if (part.type !== 'tool' || part.state.status !== 'completed' || !/^(write|edit|patch|apply_?patch)$/i.test(part.name)) continue;
        const input = part.state.input;
        const file = input.file ?? input.path ?? input.filePath;
        if (typeof file === 'string' && file) files.add(file);
      }
    }
    return { sourceMessageId: anchor, entries: [...files].map((file) => ({ file, additions: 0, deletions: 0, statsUnavailable: true })) };
  }

  async compactSession(sessionId: string): Promise<boolean> {
    const client = await this.ready();
    const admitted = await client.session.compact({ sessionID: sessionId });
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      const messages = await client.message.list({ sessionID: sessionId, type: 'compaction', order: 'desc', limit: 20 });
      const compacted = messages.data.find((message) => message.id === admitted.id);
      if (compacted?.type === 'compaction' && compacted.status === 'completed') return true;
      if (compacted?.type === 'compaction' && compacted.status === 'failed') return false;
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('OpenCode 2 compaction accepted but completion is not yet verified');
  }

  async listCommands(): Promise<Array<{ name: string; description?: string; source: string }>> {
    const client = await this.ready();
    const result = await client.command.list({ location: { directory: this.options.workingDirectory } });
    return result.data.map((command) => ({ name: command.name, description: command.description, source: 'opencode2' }));
  }

  async listSkills(): Promise<Array<{ name: string; description?: string; location: string }>> {
    const client = await this.ready();
    const result = await client.skill.list({ location: { directory: this.options.workingDirectory } });
    return result.data.map((skill) => ({ name: skill.name, description: skill.description, location: skill.path }));
  }

  async listAgents() {
    const client = await this.ready();
    const location = { directory: this.options.workingDirectory };
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const agents = (await client.agent.list({ location })).data;
      if (agents.length > 0) return agents;
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('OpenCode 2 agent catalog did not become ready');
  }

  async runSessionCommand(sessionId: string, command: string, args: string): Promise<void> {
    const client = await this.ready();
    await client.session.command({ sessionID: sessionId, name: command, text: args });
  }

  async generateTitle(prompt: string, provider: string, model: string): Promise<string> {
    const client = await this.ready();
    const response = await client.generate.text({ prompt, model: { providerID: provider, id: model } });
    return response.text;
  }

  async readConfigurationSummary(): Promise<{ version: string; providers: number; models: number; agents: number; skills: number; commands: number; mcp: number; configKeys: string[] }> {
    const client = await this.ready();
    const location = { directory: this.options.workingDirectory };
    const [info, providers, models, agents, skills, commands, mcp, config] = await Promise.all([
      client.server.info(), client.provider.list({ location }), client.model.list({ location }),
      this.listAgents(), client.skill.list({ location }), client.command.list({ location }),
      client.mcp.list({ location }), client.config.get({ location }),
    ]);
    return { version: info.version, providers: providers.data.length, models: models.data.length,
      agents: agents.length, skills: skills.data.length, commands: commands.data.length,
      mcp: mcp.data.length, configKeys: [...new Set(config.flatMap((entry) => entry.type === 'document' ? Object.keys(entry.info) : []))] };
  }

  async validateConfigContent(content: string): Promise<void> {
    const settings = this.options.getSettings();
    if (settings.mode !== 'local') throw new Error('OpenCode 2 config overlays require local mode');
    if (this.turns.size) throw new Error('Wait for OpenCode 2 active turns before changing configuration');
    const input = content.trim() ? JSON.parse(content) as unknown : {};
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('OpenCode 2 configuration must be a JSON object');
    const previous = settings.configContent;
    settings.configContent = content.trim();
    try {
      const client = await this.ready();
      const entries = await client.config.get({ location: { directory: this.options.workingDirectory } });
      const documents = entries.filter((entry) => entry.type === 'document');
      const overlay = documents.at(-1)?.info;
      const matches = (expected: unknown, actual: unknown): boolean => {
        // Native config normalizes provider/model#variant strings. Compare the
        // confirmed reference semantically without accepting a changed model.
        if (typeof expected === 'string' && actual && typeof actual === 'object' && !Array.isArray(actual)) {
          const ref = actual as { providerID?: unknown; model?: unknown; variant?: unknown };
          if (typeof ref.providerID === 'string' && typeof ref.model === 'string') {
            return expected === `${ref.providerID}/${ref.model}${typeof ref.variant === 'string' ? `#${ref.variant}` : ''}`;
          }
        }
        if (Array.isArray(expected)) return Array.isArray(actual) && expected.length === actual.length
          && expected.every((value, index) => matches(value, actual[index]));
        if (expected && typeof expected === 'object') return !!actual && typeof actual === 'object'
          && Object.entries(expected).every(([key, value]) => matches(value, (actual as Record<string, unknown>)[key]));
        return expected === actual;
      };
      for (const [key, value] of Object.entries(input)) {
        if (key !== '$schema' && !matches(value, (overlay as Record<string, unknown> | undefined)?.[key])) {
          throw new Error(`OpenCode 2 configuration readback did not match: ${key}`);
        }
      }
    } catch (error) {
      settings.configContent = previous;
      await this.stop();
      throw error;
    }
  }

  async readManagementCatalog() {
    const client = await this.ready();
    const location = { directory: this.options.workingDirectory };
    const [integrations, mcp, agents, commands, skills, plugins] = await Promise.all([
      client.integration.list({ location }), client.mcp.list({ location }), this.listAgents(),
      client.command.list({ location }), client.skill.list({ location }), client.plugin.list({ location }),
    ]);
    return { integrations: integrations.data, mcp: mcp.data, agents, commands: commands.data, skills: skills.data, plugins: plugins.data };
  }

  async setMcpConnection(server: string, connected: boolean): Promise<void> {
    const client = await this.ready();
    const location = { directory: this.options.workingDirectory };
    await (connected ? client.mcp.connect({ server, location }) : client.mcp.disconnect({ server, location }));
    const readback = (await client.mcp.list({ location })).data.find((entry) => entry.name === server);
    if (!readback || (connected ? readback.status.status !== 'connected' : readback.status.status !== 'disabled')) {
      throw new Error(`OpenCode 2 MCP connection readback failed: ${server}`);
    }
  }

  async connectIntegrationKey(integrationID: string, key: string, answer?: Record<string, string | number | boolean | readonly string[]>): Promise<void> {
    const client = await this.ready();
    const location = { directory: this.options.workingDirectory };
    await client.integration.connect.key({ integrationID, key, answer, location });
    const integration = (await client.integration.get({ integrationID, location })).data;
    if (!integration.connections.some((connection) => connection.type === 'credential' && connection.method === 'key')) {
      throw new Error('OpenCode 2 did not confirm the saved integration credential');
    }
  }

  async beginIntegrationOAuth(integrationID: string, methodID: string, answer?: Record<string, string | number | boolean | readonly string[]>) {
    const client = await this.ready();
    return (await client.integration.oauth.connect({ integrationID, methodID, answer, location: { directory: this.options.workingDirectory } })).data;
  }

  async readIntegrationOAuth(integrationID: string, attemptID: string) {
    const client = await this.ready();
    return (await client.integration.oauth.status({ integrationID, attemptID, location: { directory: this.options.workingDirectory } })).data;
  }

  async finishIntegrationOAuth(integrationID: string, attemptID: string, code?: string): Promise<void> {
    const client = await this.ready();
    await client.integration.oauth.complete({ integrationID, attemptID, code, location: { directory: this.options.workingDirectory } });
    const result = await this.readIntegrationOAuth(integrationID, attemptID);
    if (result.status !== 'complete') throw new Error(`OpenCode 2 authentication status: ${result.status}`);
  }

  async cancelIntegrationOAuth(integrationID: string, attemptID: string): Promise<void> {
    const client = await this.ready();
    await client.integration.oauth.cancel({ integrationID, attemptID, location: { directory: this.options.workingDirectory } });
  }

  async manageCredential(credentialID: string, action: 'activate' | 'remove'): Promise<void> {
    const client = await this.ready();
    await (action === 'activate' ? client.credential.activate({ credentialID }) : client.credential.remove({ credentialID }));
  }

  async startAuxQuerySession(config: AuxQuerySessionConfig): Promise<AuxQuerySession & {
    readSafetyRules(): Promise<{ agentPermissions: readonly unknown[]; sessionPermissions: readonly unknown[] }>;
  }> {
    const settings = this.options.getSettings();
    if (settings.mode !== 'local') throw new Error('OpenCode 2 auxiliary queries require a local isolated CLI');
    if (config.model && config.model.kind !== 'opencode2') throw new Error('Invalid OpenCode 2 auxiliary model');
    const client = await this.ready();
    const entries = await client.config.get({ location: { directory: this.options.workingDirectory } });
    const providers = Object.assign({}, ...entries.filter((entry) => entry.type === 'document').map((entry) => entry.info.providers ?? {}));
    const root = await mkdtemp(path.join(os.tmpdir(), 'opencodian-opencode2-aux-'));
    const configDir = path.join(root, 'config');
    const permissions = [{ action: '*', resource: '*', effect: 'deny' as const }];
    const isolated = new OpenCode2Adapter({
      workingDirectory: root,
      getSettings: () => ({ ...settings, mode: 'local', permissionMode: 'inherit' }),
      extraEnv: {
        OPENCODE_TEST_HOME: root,
        OPENCODE_CONFIG_DIR: configDir,
        OPENCODE_CONFIG_PROJECT_DISABLE: '1',
        OPENCODE_CONFIG: '',
        OPENCODE_CONFIG_CONTENT: JSON.stringify({ providers, permissions, default_agent: 'opencodian-aux',
          agents: { 'opencodian-aux': { mode: 'primary', hidden: true, system: config.systemPrompt, permissions } } }),
      },
    });
    let sessionId = '';
    const verify = async () => {
      const native = await isolated.ready();
      const [session, agent] = await Promise.all([
        native.session.get({ sessionID: sessionId }),
        native.agent.get({ agentID: 'opencodian-aux', location: { directory: root } }),
      ]);
      if (session.agent !== 'opencodian-aux' || JSON.stringify(session.permissions) !== JSON.stringify(permissions)
        || agent.data.permissions.at(-1)?.effect !== 'deny' || agent.data.permissions.at(-1)?.action !== '*'
        || agent.data.permissions.at(-1)?.resource !== '*') throw new Error('OpenCode 2 auxiliary deny rules failed readback');
      return { agentPermissions: agent.data.permissions, sessionPermissions: session.permissions ?? [] };
    };
    try {
      const native = await isolated.ready();
      await isolated.getModelSelectorProviders();
      let agentReady = false;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const catalog = await native.agent.list({ location: { directory: root } });
        if (catalog.data.some((agent) => agent.id === 'opencodian-aux')) { agentReady = true; break; }
        await new Promise<void>((resolve) => setTimeout(resolve, 100));
      }
      if (!agentReady) throw new Error('OpenCode 2 auxiliary agent catalog did not become ready');
      const session = await native.session.create({ location: { directory: root }, agent: 'opencodian-aux', permissions });
      sessionId = session.id;
      await verify();
    } catch (error) {
      if (sessionId) await isolated.deleteSession(sessionId).catch(() => {});
      await isolated.stop();
      await rmdir(configDir).catch(() => {});
      await rmdir(root).catch(() => {});
      throw error;
    }
    let disposed = false;
    let running = false;
    const run = async (request: AuxQueryTurnRequest): Promise<AuxQueryResult> => {
      if (disposed) return { success: false, error: 'OpenCode 2 auxiliary session disposed' };
      if (running) return { success: false, error: 'OpenCode 2 auxiliary query already running' };
      if (request.signal?.aborted) return { success: false, error: 'Cancelled', cancelled: true };
      running = true;
      let text = '';
      let timedOut = false;
      const toolCalls: Array<{ name: string }> = [];
      const cancel = () => { void isolated.cancelStream(sessionId); };
      request.signal?.addEventListener('abort', cancel, { once: true });
      const timer = setTimeout(() => { timedOut = true; cancel(); }, config.turnTimeoutMs ?? 180000);
      try {
        await verify();
        const model = config.model?.kind === 'opencode2' ? config.model : null;
        for await (const chunk of isolated.sendMessage({ sessionId, content: request.prompt,
          images: request.images ? [...request.images] : undefined,
          options: model ? { provider: model.provider, model: model.model, variant: config.effort } : {},
        })) {
          if (chunk.type === 'tool_use') toolCalls.push({ name: chunk.name });
          if (chunk.type === 'text') { text += chunk.content; request.onTextChunk?.(text); }
          if (chunk.type === 'error') return { success: false, error: chunk.content };
        }
        await verify();
        if (request.signal?.aborted || timedOut) return { success: false, error: timedOut ? 'OpenCode 2 auxiliary query timed out' : 'Cancelled', cancelled: true };
        if (toolCalls.length) return { success: false, error: 'OpenCode 2 auxiliary query exposed tools despite deny rules' };
        return text.trim() ? { success: true, text, toolCalls } : { success: false, error: 'Empty OpenCode 2 auxiliary result' };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      } finally {
        clearTimeout(timer);
        request.signal?.removeEventListener('abort', cancel);
        running = false;
      }
    };
    return {
      queryId: sessionId,
      supportsImages: true,
      readSafetyRules: verify,
      safety: { backend: 'opencode2', enforcedPolicy: 'none', effectiveTools: [],
        deniedCapabilities: AUX_DENIED_CAPABILITIES,
        mechanism: 'isolated OpenCode 2 config/home + native agent and session wildcard deny rules (tool snapshot filtering)' },
      query: run,
      followUp: (prompt, request) => run({ ...request, prompt }),
      cancel: () => { void isolated.cancelStream(sessionId); },
      dispose: async () => {
        if (disposed) return;
        disposed = true;
        await isolated.cancelStream(sessionId).catch(() => {});
        try { await isolated.deleteSession(sessionId); } finally {
          await isolated.stop();
          await rmdir(configDir).catch(() => {});
          await rmdir(root).catch(() => {});
        }
      },
    };
  }

  async startInlineCompletionSession(config: InlineCompletionSessionConfig): Promise<InlineCompletionSession> {
    const create = () => this.startAuxQuerySession({ ...config, turnTimeoutMs: 4000 });
    return WarmInlineCompletionSession.create({ backend: this.kind, session: await create(), recreate: create });
  }

  async steerTurn(sessionId: string, text: string): Promise<boolean> {
    if (!this.turns.has(sessionId)) return false;
    const client = await this.ready();
    await client.session.prompt({ sessionID: sessionId, text, delivery: 'steer' });
    return true;
  }

  async applyPermissionMode(sessionId: string, mode: 'inherit' | 'normal' | 'yolo' | 'plan'): Promise<void> {
    const client = await this.ready();
    const agents = await this.listAgents();
    const target = agents.find((agent) => agent.name.toLowerCase() === (mode === 'plan' ? 'plan' : 'build'));
    if (!target) throw new Error(`OpenCode 2 ${mode === 'plan' ? 'Plan' : 'Build'} agent unavailable`);
    const permissions = mode === 'yolo'
      ? [{ action: '*', resource: '*', effect: 'allow' as const }]
      : mode === 'normal'
        ? [{ action: '*', resource: '*', effect: 'ask' as const }]
        : [];
    await client.session.update({ sessionID: sessionId, permissions });
    await client.session.switchAgent({ sessionID: sessionId, agent: target.id });
    const session = await client.session.get({ sessionID: sessionId });
    if (session.agent !== target.id || JSON.stringify(session.permissions ?? []) !== JSON.stringify(permissions)) {
      throw new Error('OpenCode 2 permission mode readback did not match');
    }
  }

  async getSessionContextUsageSnapshot(sessionId: string): Promise<ContextUsageSnapshot | null> {
    const client = await this.ready();
    const session = await client.session.get({ sessionID: sessionId });
    const model = session.model;
    if (!model) return null;
    const catalog = await client.model.list({ location: { directory: this.options.workingDirectory } });
    const modelInfo = catalog.data.find((entry) => entry.providerID === model.providerID && entry.id === model.id);
    if (!modelInfo) return null;
    const tokens = session.tokens;
    return {
      sessionId, sessionTitle: session.title ?? '', createdAt: session.time.created,
      updatedAt: session.time.updated, providerId: model.providerID,
      providerName: model.providerID, modelId: model.id, modelName: modelInfo.name,
      contextWindow: modelInfo.limit.context, totalTokens: tokens.input + tokens.output + tokens.reasoning,
      inputTokens: tokens.input, outputTokens: tokens.output, reasoningTokens: tokens.reasoning,
      cacheReadTokens: tokens.cache.read, cacheWriteTokens: tokens.cache.write,
      totalCost: session.cost,
    };
  }

  async getSessionMessages(sessionId: string): Promise<unknown[]> {
    const client = await this.ready();
    const messages = await this.listAllMessages(client, sessionId);
    return messages.filter((message) => message.type === 'user' || message.type === 'assistant').map((message) => ({
      info: { id: message.id, role: message.type === 'assistant' ? 'assistant' : 'user', time: message.time },
      parts: message.type === 'assistant' ? message.content : [{ type: 'text', text: message.type === 'user' ? message.text : '' }],
    }));
  }

  private async listAllMessages(client: OpenCodeClient, sessionId: string): Promise<Awaited<ReturnType<OpenCodeClient['message']['list']>>['data']> {
    const messages: Awaited<ReturnType<OpenCodeClient['message']['list']>>['data'] = [];
    const seenCursors = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = await client.message.list({ sessionID: sessionId, limit: 100, order: 'asc', ...(cursor ? { cursor } : {}) });
      messages.push(...page.data);
      const next = page.cursor.next ?? undefined;
      if (page.data.length < 100 || !next || seenCursors.has(next)) break;
      seenCursors.add(next);
      cursor = next;
    } while (cursor);
    return messages;
  }

  async getChatMessages(sessionId: string): Promise<ChatMessage[]> {
    const client = await this.ready();
    const messages = await this.listAllMessages(client, sessionId);
    return messages.flatMap<ChatMessage>((message) => {
      if (message.type === 'user' && message.text.trim()) return [{
        id: message.id, role: 'user' as const, content: message.text,
        timestamp: message.time.created, sourceMessageId: message.id,
      }];
      if (message.type === 'assistant') {
        const content = message.content.filter((part) => part.type === 'text').map((part) => part.text).join('');
        const toolCalls: ToolCallInfo[] = message.content.filter((part) => part.type === 'tool').map((part) => ({
          id: part.id, name: part.name,
          input: typeof part.state.input === 'object' ? part.state.input : {},
          status: part.state.status === 'completed' ? 'completed'
            : part.state.status === 'error' ? 'error' : 'running',
          ...(part.state.status === 'completed' || part.state.status === 'error'
            ? { result: (part.state.content ?? []).flatMap((item) => 'text' in item ? [item.text] : []).join('\n') }
            : {}),
        }));
        if (content || toolCalls.length) return [{
          id: message.id, role: 'assistant' as const, content,
          timestamp: message.time.created, sourceMessageId: message.id,
          modelId: message.model.id,
          ...(toolCalls.length ? { toolCalls } : {}),
        }];
      }
      return [];
    });
  }

  async getPendingPermissions(): Promise<unknown[]> {
    const client = await this.ready();
    const response = await client.permission.request.list({ location: { directory: this.options.workingDirectory } });
    for (const request of response.data) this.permissionSessions.set(request.id, request.sessionID);
    return response.data.map((request) => ({
      id: request.id, sessionID: request.sessionID, permission: request.action,
      patterns: request.resources, always: request.save ?? [], metadata: request.metadata ?? {},
    }));
  }

  async respondToPermission(requestID: string, reply: unknown, message?: string): Promise<void> {
    if (reply !== 'once' && reply !== 'always' && reply !== 'reject') throw new Error('Invalid OpenCode 2 permission reply');
    const sessionID = this.permissionSessions.get(requestID);
    if (!sessionID) throw new Error('OpenCode 2 permission request is no longer active');
    const client = await this.ready();
    await client.permission.reply({ sessionID, requestID, decision: reply, ...(message ? { message } : {}) });
    this.permissionSessions.delete(requestID);
  }

  private toQuestionRequest(form: { id: string; sessionID: string; title: string; fields: ReadonlyArray<{
    key: string; type: string; title?: string; description?: string; options?: ReadonlyArray<{ label: string; value: string; description?: string }>;
  }> }): QuestionRequest | null {
    const questions = form.fields.map((field) => ({
      question: field.title || field.description || form.title,
      header: field.title || form.title,
      options: field.type === 'boolean'
        ? [{ label: 'true', description: '' }, { label: 'false', description: '' }]
        : field.options?.map((option) => ({ label: option.label, description: option.description ?? '' })) ?? [],
      multiple: field.type === 'multiselect',
      custom: (field.type === 'string' || field.type === 'number') && !field.options?.length,
    }));
    if (questions.length === 0) return null;
    this.questionSessions.set(form.id, form.sessionID);
    return { id: form.id, sessionId: form.sessionID, questions };
  }

  async getPendingQuestions(): Promise<QuestionRequest[]> {
    const client = await this.ready();
    const result = await client.form.list({ location: { directory: this.options.workingDirectory } });
    return result.data.map((form) => this.toQuestionRequest(form)).filter((request): request is QuestionRequest => request !== null);
  }

  async replyToQuestion(requestID: string, answers: string[][]): Promise<void> {
    const sessionID = this.questionSessions.get(requestID);
    if (!sessionID) throw new Error('OpenCode 2 form is no longer active');
    const client = await this.ready();
    const form = await client.session.form.get({ sessionID, formID: requestID });
    const answer: Record<string, string | string[] | boolean | number> = {};
    form.fields.forEach((field, index) => {
      const selected = answers[index] ?? [];
      const options = 'options' in field ? field.options : undefined;
      const values = selected.map((value) => options?.find((option) => option.label === value)?.value ?? value);
      if (field.type === 'multiselect') answer[field.key] = values;
      else if (field.type === 'boolean') {
        if (values[0] !== 'true' && values[0] !== 'false') throw new Error('Invalid OpenCode 2 boolean answer');
        answer[field.key] = values[0] === 'true';
      } else if (field.type === 'number') {
        const number = Number(values[0]);
        if (!values[0]?.trim() || !Number.isFinite(number)) throw new Error('Invalid OpenCode 2 numeric answer');
        answer[field.key] = number;
      } else answer[field.key] = values[0] ?? '';
    });
    await client.session.form.reply({ sessionID, formID: requestID, answer });
    this.questionSessions.delete(requestID);
  }

  async rejectQuestion(requestID: string): Promise<void> {
    const sessionID = this.questionSessions.get(requestID);
    if (!sessionID) throw new Error('OpenCode 2 form is no longer active');
    const client = await this.ready();
    await client.session.form.cancel({ sessionID, formID: requestID });
    this.questionSessions.delete(requestID);
  }

  async getModelSelectorProviders(): Promise<Array<{ id: string; name: string; models: Array<{ id: string; name: string; contextWindow: number; variants: string[] }> }>> {
    const client = await this.ready();
    const location = { directory: this.options.workingDirectory };
    let result: Awaited<ReturnType<OpenCodeClient['model']['list']>>;
    let defaultResult: Awaited<ReturnType<OpenCodeClient['model']['default']>>;
    for (let attempt = 0; ; attempt += 1) {
      [result, defaultResult] = await Promise.all([
        client.model.list({ location }),
        client.model.default({ location }),
      ]);
      if ((result.data.length > 0 && defaultResult.data) || attempt >= 15) break;
      await new Promise<void>((resolve) => setTimeout(resolve, 1000));
    }
    this.defaultModel = defaultResult.data
      ? { provider: defaultResult.data.providerID, model: defaultResult.data.id }
      : null;
    const providers = new Map<string, { id: string; name: string; models: Array<{ id: string; name: string; contextWindow: number; variants: string[] }> }>();
    for (const model of result.data) {
      if (!model.enabled) continue;
      const provider = providers.get(model.providerID) ?? { id: model.providerID, name: model.providerID, models: [] };
      provider.models.push({ id: model.id, name: model.name, contextWindow: model.limit.context, variants: model.variants.map((variant) => variant.id) });
      providers.set(model.providerID, provider);
    }
    return [...providers.values()];
  }

  getDefaultModelSelection(): { provider: string; model: string } | null {
    return this.defaultModel;
  }

  // eslint-disable-next-line complexity -- The OpenCode 2 event union is normalized at this single transport boundary.
  private async *mapTurnEvent(
    client: OpenCodeClient,
    sessionId: string,
    event: { type: string; data?: Record<string, unknown> },
    textSeen: boolean,
  ): AsyncGenerator<StreamChunk> {
    const data = event.data;
    const turn = this.turns.get(sessionId);
    if (event.type === 'form.created' && data && data.form && typeof data.form === 'object'
      && (data.form as { sessionID?: unknown }).sessionID === sessionId) {
      const request = this.toQuestionRequest(data.form as Parameters<OpenCode2Adapter['toQuestionRequest']>[0]);
      if (request) yield { type: 'question_request', request };
      return;
    }
    if (event.type === 'permission.asked' && data && typeof data.id === 'string'
      && data.sessionID === sessionId && typeof data.action === 'string' && Array.isArray(data.resources)) {
      this.permissionSessions.set(data.id, sessionId);
      yield { type: 'permission_request', id: data.id, sessionID: sessionId, permission: data.action,
        patterns: data.resources.filter((resource): resource is string => typeof resource === 'string'),
        always: Array.isArray(data.save) ? data.save.filter((resource): resource is string => typeof resource === 'string') : [],
        metadata: data.metadata && typeof data.metadata === 'object' ? data.metadata as Record<string, unknown> : {},
      };
      return;
    }
    if (event.type === 'session.tool.input.started' && data && typeof data.id === 'string' && typeof data.name === 'string') {
      turn?.toolNames.set(data.id, data.name);
    }
    if (event.type === 'session.tool.called' && data && typeof data.id === 'string') {
      const input = data.input && typeof data.input === 'object' ? data.input as Record<string, unknown> : {};
      turn?.toolInputs.set(data.id, input);
      yield { type: 'tool_use', id: data.id, name: turn?.toolNames.get(data.id) ?? 'unknown',
        input,
      };
      return;
    }
    if ((event.type === 'session.tool.success' || event.type === 'session.tool.failed') && data && typeof data.id === 'string') {
      const parts = Array.isArray(data.content) ? data.content : [];
      const text = parts.map((part: { type?: string; text?: string }) => part.type === 'text' ? part.text ?? '' : '').join('\n');
      yield { type: 'tool_result', toolUseId: data.id, content: text || (event.type === 'session.tool.failed' ? 'OpenCode 2 tool failed' : ''),
        ...(event.type === 'session.tool.failed' ? { isError: true } : {}),
      };
      const name = turn?.toolNames.get(data.id) ?? '';
      const input = turn?.toolInputs.get(data.id);
      const file = input?.file ?? input?.path ?? input?.filePath;
      if (event.type === 'session.tool.success' && /^(write|edit|patch|apply_?patch)$/i.test(name)
        && typeof file === 'string' && file) yield { type: 'file_edited', file };
      return;
    }
    if (event.type === 'session.text.delta' && typeof event.data?.delta === 'string') {
      yield { type: 'text', content: event.data.delta };
    } else if (event.type === 'session.reasoning.delta' && typeof event.data?.delta === 'string') {
      yield { type: 'thinking', content: event.data.delta };
    } else if (event.type === 'session.execution.succeeded') {
      if (!textSeen) {
        const messages = await client.message.list({ sessionID: sessionId, limit: 10, order: 'desc', type: 'assistant' });
        const latest = messages.data[0];
        if (latest?.type === 'assistant') {
          for (const part of latest.content) if (part.type === 'text' && part.text) yield { type: 'text', content: part.text };
        }
      }
      yield { type: 'message_stop' };
    } else if (event.type === 'session.execution.failed') {
      yield { type: 'error', content: 'OpenCode 2 generation failed' };
    } else if (event.type === 'session.execution.interrupted') {
      yield { type: 'message_stop' };
    } else if (event.type === 'transport.error') {
      yield { type: 'error', content: 'OpenCode 2 event stream disconnected' };
    }
  }

  // eslint-disable-next-line complexity -- This entry point keeps per-turn setup, protocol admission and cleanup in one guarded lifecycle.
  async *sendMessage(request: AgentChatSendRequest): AsyncGenerator<StreamChunk> {
    const client = await this.ready();
    const sessionId = request.sessionId;
    if (!sessionId) throw new Error('OpenCode 2 session ID is required');
    if (this.turns.has(sessionId)) throw new Error('OpenCode 2 session already has an active turn');
    const turn: ActiveTurn = { controller: new AbortController(), events: [], wake: null, toolNames: new Map(), toolInputs: new Map() };
    this.turns.set(sessionId, turn);
    const iterator = client.event.subscribe({ signal: turn.controller.signal })[Symbol.asyncIterator]();
    try {
      const first = await iterator.next();
      if (first.done || first.value.type !== 'server.connected') throw new Error('OpenCode 2 event subscription did not connect');
    } catch (error) {
      turn.controller.abort();
      await iterator.return?.();
      this.turns.delete(sessionId);
      throw error;
    }
    const pump = (async () => {
      try {
        for (;;) {
          const next = await iterator.next();
          if (next.done) {
            turn.events.push({ type: 'transport.error' });
            turn.wake?.();
            break;
          }
          if ('data' in next.value && next.value.data && 'sessionID' in next.value.data
            && next.value.data.sessionID !== sessionId) continue;
          turn.events.push(next.value as { type: string; data?: Record<string, unknown> });
          turn.wake?.();
        }
      } catch (error) {
        turn.events.push({ type: 'transport.error', data: { error } });
        turn.wake?.();
      }
    })();
    try {
      const mode = this.options.getSettings().permissionMode;
      if (mode && mode !== 'inherit') await this.applyPermissionMode(sessionId, mode);
      const requestedAgent = request.options?.agent;
      if (typeof requestedAgent === 'string' && requestedAgent.trim()) {
        const agents = await this.listAgents();
        const selected = agents.find((agent) => agent.id === requestedAgent || agent.name === requestedAgent);
        if (!selected || selected.mode === 'subagent') throw new Error(`OpenCode 2 primary agent unavailable: ${requestedAgent}`);
        await client.session.switchAgent({ sessionID: sessionId, agent: selected.id });
      }
      const provider = request.options?.provider;
      const model = request.options?.model;
      if (typeof provider === 'string' && typeof model === 'string' && provider && model) {
        const variant = request.options?.variant;
        await client.session.switchModel({ sessionID: sessionId, model: {
          providerID: provider, id: model,
          ...(typeof variant === 'string' && variant ? { variant } : {}),
        } });
      }
      const files = request.images?.map((image) => ({ uri: `data:${image.mediaType};base64,${image.data}`, name: image.filename }));
      const parts = Array.isArray(request.options?.requestParts)
        ? request.options.requestParts as Array<{ type?: string; name?: string; id?: string }>
        : [];
      const mentionedAgents = parts.filter((part) => part.type === 'agent' && typeof part.name === 'string')
        .map((part) => ({ name: part.name as string }));
      const requestedSkillIds = parts.filter((part) => part.type === 'skill' && typeof part.id === 'string')
        .map((part) => part.id as string);
      const mentionedSkills: Array<{ id: string; name: string }> = [];
      if (requestedSkillIds.length || /(?:^|\s)\/(?:skills\s+)?[\w-]+/.test(request.content)) {
        const catalog = (await client.skill.list({ location: { directory: this.options.workingDirectory } })).data;
        for (const skill of catalog) {
          const escapedName = skill.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          if ((requestedSkillIds.includes(skill.id)
            || new RegExp(`(?:^|\\s)\\/(?:skills\\s+)?${escapedName}(?=$|\\s)`).test(request.content))
            && !mentionedSkills.some((entry) => entry.id === skill.id)) mentionedSkills.push({ id: skill.id, name: skill.name });
        }
      }
      const content = appendObsidianContextBlocks(
        prependObsidianToolingInjection(prependMemoryInjection(request.content, request.options), request.options),
        request.options,
      );
      const admitted = await client.session.prompt({ sessionID: sessionId, text: content,
        ...(files?.length ? { files } : {}),
        ...(mentionedAgents.length ? { agents: mentionedAgents } : {}),
        ...(mentionedSkills.length ? { skills: mentionedSkills } : {}),
      });
      yield { type: 'message_start' };
      let textSeen = false;
      let delivered = !admitted.id;
      for (;;) {
        if (turn.events.length === 0) await new Promise<void>((resolve) => { turn.wake = resolve; });
        turn.wake = null;
        const event = turn.events.shift() as { type: string; data?: Record<string, unknown> } | undefined;
        if (!event) continue;
        if (!delivered) {
          if (event.type === 'session.inbox.delivered' && event.data?.inboxID === admitted.id) delivered = true;
          else if (event.type === 'transport.error') throw new Error('OpenCode 2 event stream disconnected before prompt delivery');
          continue;
        }
        const chunks = this.mapTurnEvent(client, sessionId, event, textSeen);
        for await (const chunk of chunks) {
          if (chunk.type === 'text') textSeen = true;
          yield chunk;
          if (chunk.type === 'message_stop' || chunk.type === 'error') return;
        }
      }
    } finally {
      turn.controller.abort();
      await iterator.return?.();
      await pump;
      this.turns.delete(sessionId);
    }
  }

  async cancelStream(sessionId: string): Promise<void> {
    const turn = this.turns.get(sessionId);
    if (!turn || !this.client) return;
    try { await this.client.session.interrupt({ sessionID: sessionId }); } finally {
      turn.events.push({ type: 'session.execution.interrupted', data: { sessionID: sessionId } });
      turn.wake?.();
    }
  }
}
