import { describe, expect, it, jest } from '@jest/globals';

import {
  DshAcpClient,
  type DshAcpClientOptions,
  type DshWireRecord,
} from '../../../../../src/core/agents/backend/dsh/DshAcpClient';

const HANDSHAKE = {
  protocolVersion: 1,
  agentInfo: { name: 'deepseek-harness-acp', version: '0.0.1' },
  agentCapabilities: { sessionCapabilities: { list: {}, resume: {}, close: {} } },
  authMethods: [],
};

/**
 * Child that answers the handshake, emits one session/update notification with
 * content-shaped fields plus a secret-shaped title, then completes the prompt.
 */
function fixtureScript(): string {
  return `
process.stdin.setEncoding('utf8');
let input = '';
const send = (value) => process.stdout.write(JSON.stringify(value) + '\\n');
const respond = (message, result) => send({ jsonrpc: '2.0', id: message.id, result });
const handshake = ${JSON.stringify(HANDSHAKE)};
process.stdin.on('data', (chunk) => {
  input += chunk;
  for (;;) {
    const newline = input.indexOf('\\n');
    if (newline < 0) break;
    const line = input.slice(0, newline);
    input = input.slice(newline + 1);
    if (!line.trim()) continue;
    const message = JSON.parse(line);
    if (message.method === 'initialize') { respond(message, handshake); continue; }
    if (message.method === 'session/new') { respond(message, { sessionId: 'sess-trace-1' }); continue; }
    if (message.method === 'session/prompt') {
      send({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: message.params.sessionId, update: {
        sessionUpdate: 'tool_call', toolCallId: 'c1', title: 'echo sk-abc123456789xyz',
        rawInput: { command: 'SECRET-SHELL' }, content: [{ type: 'text', text: 'SECRET-CONTENT' }],
        status: 'in_progress', time: 1760000000000 } } });
      respond(message, { stopReason: 'end_turn' });
      continue;
    }
    if (message.id === undefined) continue; // Never answer notifications (session/cancel).
    respond(message, {});
  }
});
`;
}

function clientFor(observer: ((record: DshWireRecord) => void) | undefined, transport: 'native' | 'acp'): DshAcpClient {
  const options: DshAcpClientOptions = {
    cwd: process.cwd(),
    launch: { command: process.execPath, args: ['-e', fixtureScript()], env: {} },
    requestTimeoutMs: 5_000,
    promptTimeoutMs: 5_000,
    ...(observer ? { trace: { observer: { recordWireEvent: observer }, transport } } : {}),
  };
  return new DshAcpClient(options);
}

async function runPrompt(client: DshAcpClient): Promise<void> {
  await client.start();
  const session = await client.newSession(process.cwd());
  const sessionId = String((session as { sessionId?: unknown }).sessionId);
  await client.prompt(sessionId, 'hello');
  client.cancel(sessionId);
  await client.stop();
}

describe('DSH ACP client trace hooks', () => {
  it('emits whitelisted wire records with client round-trip timing and no raw payload', async () => {
    const records: DshWireRecord[] = [];
    const client = clientFor((record) => records.push(record), 'acp');
    await runPrompt(client);
    const kinds = records.map((record) => record.kind);
    expect(kinds).toContain('connection');
    expect(kinds).toContain('request');
    expect(kinds).toContain('notification');
    expect(kinds).toContain('response');
    expect(kinds).toContain('client-notification');

    const started = records.find((record) => record.kind === 'connection' && record.method === 'starting');
    expect(started?.transport).toBe('acp');
    const connected = records.find((record) => record.kind === 'connection' && record.method === 'connected');

    const promptRequest = records.find((record) => record.kind === 'request' && record.method === 'session/prompt');
    expect(promptRequest?.sessionId).toBe('sess-trace-1');
    expect(promptRequest?.transport).toBe('acp');
    expect(promptRequest?.bytes).toBeGreaterThan(0);

    const newSessionResponse = records.find((record) => record.kind === 'response' && record.method === 'session/new');
    expect(newSessionResponse?.sessionId).toBe('sess-trace-1');

    const update = records.find((record) => record.kind === 'notification' && record.sessionUpdate === 'tool_call');
    expect(update?.detail).toMatchObject({ toolCallId: 'c1', status: 'in_progress', backendTimeMs: 1760000000000 });
    const detailJson = JSON.stringify(update?.detail);
    expect(detailJson).not.toContain('SECRET-SHELL');
    expect(detailJson).not.toContain('SECRET-CONTENT');
    expect(detailJson).not.toContain('sk-abc123456789xyz');

    const promptResponse = records.find((record) => record.kind === 'response' && record.method === 'session/prompt');
    expect(promptResponse?.ok).toBe(true);
    expect(typeof promptResponse?.durationMs).toBe('number');
    expect(promptResponse?.durationMs).toBeGreaterThanOrEqual(0);
    expect(connected).toBeDefined();
  });

  it('keeps zero trace behavior when no hook is injected', async () => {
    const observer = jest.fn();
    const client = clientFor(undefined, 'native');
    await runPrompt(client);
    expect(observer).not.toHaveBeenCalled();
  });
});
