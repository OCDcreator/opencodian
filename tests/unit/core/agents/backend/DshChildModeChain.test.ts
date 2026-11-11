import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';

import { describe, expect, it } from '@jest/globals';

import type { AgentServiceRegistry } from '../../../../../src/core/agents/backend/AgentServiceRegistry';
import type { DshJsonObject } from '../../../../../src/core/agents/backend/dsh/DshAcpClient';
import { DshAdapter } from '../../../../../src/core/agents/backend/dsh/DshAdapter';
import type { Conversation } from '../../../../../src/core/types';
import { SessionInformationCoordinator, type WorkbenchSession } from '../../../../../src/features/chat/services/conversation/SessionInformationCoordinator';
import { FakeDshClient, settings } from './DshAdapter.fixture';

/**
 * Full service → adapter → coordinator mode chain over REAL product code:
 * the real bridge `apply` (spawned subprocess, installed public DSH) serves
 * `session/information` from stub `subagents.listChildren`; its output feeds
 * the real `DshAdapter.readSessionInformation`, whose agents drive the real
 * `SessionInformationCoordinator` child slot. No projection logic is copied
 * and no mode is hand-mocked at the service boundary. Mirrors the established
 * DshNativeServiceHistory subprocess fixture pattern. Hosts without an
 * installed public DSH skip honestly; a configured-but-unusable
 * DSH_PUBLIC_INSTALL fails instead of hiding behind that skip.
 */
// DSH_PUBLIC_INSTALL (the installed `@deepseek-ai/dsh` package directory) wins.
// Default candidates derive from the Node install prefix of `process.execPath`:
// Unix global modules live under `<prefix>/lib/node_modules`, Windows under
// `<prefix>/node_modules`, with npm's dirname(execPath) layout as fallback.
const explicitInstall = process.env.DSH_PUBLIC_INSTALL;
const execDir = path.dirname(process.execPath);
const nodePrefix = path.basename(execDir) === 'bin' ? path.dirname(execDir) : execDir;
const installRoot = explicitInstall ?? [
  path.join(nodePrefix, process.platform === 'win32' ? 'node_modules' : 'lib/node_modules', '@deepseek-ai', 'dsh'),
  path.join(execDir, 'node_modules', '@deepseek-ai', 'dsh'),
].find((candidate) => existsSync(path.join(candidate, 'package.json')));
const bridgeMarker = installRoot
  ? path.join(installRoot, 'node_modules', '@deepseek-ai', 'dsh-mcp-client', 'lib', 'index.js')
  : undefined;
const available = !!bridgeMarker && existsSync(bridgeMarker);

type BridgeAgent = { id: string; title: string; status: string; mode: string; readable: boolean };

async function realBridgeAgents(): Promise<BridgeAgent[]> {
  if (!installRoot) throw new Error('no installed public DSH resolved; set DSH_PUBLIC_INSTALL to the installed @deepseek-ai/dsh package directory');
  const fixture = path.join(__dirname, 'DshChildModeChain.fixture.mjs');
  const anchor = path.join(installRoot, 'package.json');
  const child = spawn(process.execPath, [fixture, anchor], { stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map<number, (value: DshJsonObject) => void>();
  const lines = createInterface({ input: child.stdout });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => { stderr += chunk; });
  lines.on('line', (line) => {
    try { const value = JSON.parse(line) as DshJsonObject; pending.get(value.id as number)?.(value); pending.delete(value.id as number); } catch { /* notifications */ }
  });
  const request = (id: number, method: string, params: DshJsonObject = {}): Promise<DshJsonObject> => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`request ${method} timed out: ${stderr.slice(-400)}`)), 15_000);
    pending.set(id, (value) => { clearTimeout(timer); resolve(value); });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
    try {
      await request(1, 'initialize');
      const response = await request(2, 'session/information', { sessionId: 'parent' }) as { result?: { agents?: BridgeAgent[] } };
      const agents = response.result?.agents;
      if (!Array.isArray(agents)) throw new Error(`bridge returned no agents: ${JSON.stringify(response).slice(0, 300)} | stderr: ${stderr.slice(-300)}`);
      return agents;
    } finally { child.kill(); }
}

class BridgeClient extends FakeDshClient {
  override handshake: DshJsonObject = { nativeProtocol: 'opencodian.dsh-native/1', agentCapabilities: {}, controlCapabilities: {
    readback: true, revision: 0, jobs: { present: false }, terminal: { present: false }, goal: { present: false },
    subagents: { present: true, list: true, get: true, cancel: true, prompt: true },
  } };
  constructor(private readonly agents: BridgeAgent[]) { super({ workingDirectory: '/synthetic-vault' } as never); }
  override async nativeRequest(method: string): Promise<DshJsonObject> {
    if (method === 'session/information') return { agents: this.agents };
    if (method === 'session/child-history') return { messages: [] };
    if (method === 'control/capabilities') return { controlCapabilities: {
      readback: true, revision: 0, jobs: { present: false }, terminal: { present: false }, goal: { present: false },
      subagents: { present: true, list: true, get: true, cancel: true, prompt: true },
    } };
    throw new Error('Unexpected synthetic control method');
  }
}

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

// Honest skip only for unconfigured hosts without an install. A configured
// DSH_PUBLIC_INSTALL always runs, so the guard below fails loudly on setup errors.
const dshChainSuite = explicitInstall || available ? describe : describe.skip;

dshChainSuite('DSH child mode chain (real bridge → adapter → coordinator)', () => {
  it('reaches a continuable child composer only through the real projections', async () => {
    if (!available) {
      throw new Error(`DSH_PUBLIC_INSTALL is set but unusable: missing ${bridgeMarker}`);
    }
    const bridgeAgents = await realBridgeAgents();
    expect(bridgeAgents.map((agent) => agent.mode)).toEqual(['continuable', 'one-shot', 'unknown']);
    const adapter = new DshAdapter({ workingDirectory: '/synthetic-vault',
      getSettings: () => ({ ...settings(), workingDirectory: '/synthetic-vault', transport: 'native' as const }),
      createClient: () => new BridgeClient(bridgeAgents) });
    try {
      const parent = await adapter.createSession();
      const information = await adapter.readSessionInformation(parent);
      expect(information.agents?.map((agent) => agent.mode)).toEqual(['continuable', 'one-shot', 'unknown']);

      const session: WorkbenchSession = { tabId: 'tab-a', backend: 'dsh', streaming: false, todos: [], backgroundTasks: [], resources: [],
        conversation: { id: 'c1', title: 'c1', backend: 'dsh', backendSessionId: parent, createdAt: 1, updatedAt: 1, messages: [] } as Conversation };
      const registry = { get: (kind: string) => kind === 'dsh' ? adapter : undefined } as unknown as AgentServiceRegistry;
      const coordinator = new SessionInformationCoordinator({ getActiveSession: () => session, getSessions: () => [session],
        getRegistry: () => registry, onChange: jest.fn(), openChildView: jest.fn() });
      try {
        coordinator.refresh(session, true); await flush();
        const agents = coordinator.project(session).agents ?? [];
        expect(agents.map((agent) => agent.mode)).toEqual(['continuable', 'one-shot', 'unknown']);
        const continuable = agents.find((agent) => agent.id === 'child-continuable')!;
        expect(continuable.readable).toBe(true);
        await coordinator.openChild(continuable);
        const child = coordinator.project(session).child;
        expect(child?.agent.mode).toBe('continuable');
        expect(child?.canContinue).toBe(true);
      } finally { coordinator.destroy(); }
    } finally { await adapter.stop(); }
  });
});
