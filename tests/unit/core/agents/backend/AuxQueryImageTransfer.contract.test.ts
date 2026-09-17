/**
 * Contract test: `AuxQueryTurnRequest.images` serialization across the four
 * auxiliary backends (docs/requirements/flowtext-parity.md R-A4 技术约束).
 *
 * Every backend must land the attachment in its native wire shape by reusing
 * the chat-side implementation, and — for Codex, whose `local_image` needs a
 * real file — the temp file must live in the system temp dir and be gone
 * after the turn / dispose, with the vault filesystem untouched.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from '@jest/globals';

import type { AuxQueryImageAttachment } from '../../../../../src/core/agents/backend/AgentAuxQueryCapability';
import type { AuxHttpResponse,AuxTransport } from '../../../../../src/core/agents/backend/auxiliary/AuxTransport';
import {
  type ClaudeAuxSdkHandle,
  ClaudeCodeAuxQuerySession,
} from '../../../../../src/core/agents/backend/auxiliary/ClaudeCodeAuxQuerySession';
import { CodexAuxQuerySession } from '../../../../../src/core/agents/backend/auxiliary/CodexAuxQuerySession';
import { OpenCodeAuxQuerySession } from '../../../../../src/core/agents/backend/auxiliary/OpenCodeAuxQuerySession';
import type { OpenCodeAuxScope } from '../../../../../src/core/agents/backend/auxiliary/OpenCodeAuxScope';
import type { AppServerTurnStartOptions } from '../../../../../src/core/agents/backend/CodexAppServerClientTypes';
import type { PiRecord } from '../../../../../src/core/agents/backend/pi/PiRpcClient';

const IMAGE: AuxQueryImageAttachment = {
  mediaType: 'image/png',
  data: Buffer.from('fake-png-payload').toString('base64'),
};

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => { setTimeout(resolve, 10); });
  }
  throw new Error('waitFor timed out');
}

// ---------------------------------------------------------------------------
// OpenCode
// ---------------------------------------------------------------------------

describe('OpenCode aux image serialization', () => {
  it('adds a chat-shaped file part with a data URL to the message body', async () => {
    const bodies: unknown[] = [];
    let historyReads = 0;
    const transport: AuxTransport = async (url, request): Promise<AuxHttpResponse> => {
      const method = request?.method ?? 'GET';
      if (method === 'POST' && /\/session(\?|$)/.test(url)) {
        return jsonResponse({ id: 'sess-1' });
      }
      if (method === 'POST' && url.includes('/session/') && url.includes('/message')) {
        bodies.push(JSON.parse(String(request?.body)));
        return jsonResponse({});
      }
      if (method === 'GET' && url.includes('/session/') && url.includes('/message')) {
        historyReads += 1;
        // First read = before the turn; second read = after the turn.
        return historyReads === 1
          ? jsonResponse([{ info: { role: 'user' }, parts: [] }])
          : jsonResponse([
            { info: { role: 'user' }, parts: [] },
            { info: { role: 'assistant' }, parts: [{ type: 'text', text: '<insertion>ok</insertion>' }] },
          ]);
      }
      return jsonResponse({});
    };
    const scope = {
      ensureStarted: () => Promise.resolve('http://127.0.0.1:4096'),
      getVerification: () => ({ allowed: ['read'], agent: { name: 'audit-readonly' } }),
      getSessionDirectory: () => '',
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } as unknown as OpenCodeAuxScope;
    const session = await OpenCodeAuxQuerySession.create({
      systemPrompt: 'sys',
      workingDirectory: '/vault',
      scope,
      agentName: 'audit-readonly',
      transport,
    });
    const result = await session.query({ prompt: 'OCR this', images: [IMAGE] });
    expect(result.success).toBe(true);
    expect(bodies).toHaveLength(1);
    const body = bodies[0] as { parts: { type: string; mime?: string; url?: string; text?: string }[] };
    const filePart = body.parts.find((part) => part.type === 'file');
    expect(filePart).toBeDefined();
    expect(filePart?.mime).toBe('image/png');
    expect(filePart?.url).toBe(`data:image/png;base64,${IMAGE.data}`);
    // Text part stays first and untouched.
    expect(body.parts[0]).toMatchObject({ type: 'text', text: 'OCR this' });
    await session.dispose();
  });
});

function jsonResponse(payload: unknown): AuxHttpResponse {
  return {
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(payload)),
    json: () => Promise.resolve(payload),
  };
}

// ---------------------------------------------------------------------------
// Claude Code
// ---------------------------------------------------------------------------

class FakeClaudeHandle implements ClaudeAuxSdkHandle {
  private readonly waiters: Array<(value: unknown) => void> = [];
  private readonly queue: unknown[] = [];
  private ended = false;
  closed = false;
  private static readonly END: unique symbol = Symbol('end');

  emit(message: unknown): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter(message);
    else this.queue.push(message);
  }

  end(): void {
    this.ended = true;
    while (this.waiters.length) this.waiters.shift()?.(FakeClaudeHandle.END);
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<unknown> {
    for (;;) {
      if (this.queue.length) {
        yield this.queue.shift();
        continue;
      }
      if (this.ended) return;
      const value: unknown = await new Promise((resolve) => {
        this.waiters.push(resolve);
      });
      if (value === FakeClaudeHandle.END) return;
      yield value;
    }
  }

  interrupt(): Promise<unknown> {
    return Promise.resolve();
  }

  close(): void {
    this.closed = true;
    this.end();
  }
}

class FakeClaudeSdk {
  readonly prompts: unknown[] = [];
  readonly seenOptions: Record<string, unknown>[] = [];
  private handle: FakeClaudeHandle | null = null;
  private pump: Promise<void> | null = null;

  query(input: { prompt: AsyncIterable<unknown>; options: Record<string, unknown> }): ClaudeAuxSdkHandle {
    this.seenOptions.push(input.options);
    this.pump = (async () => {
      for await (const value of input.prompt) this.prompts.push(value);
    })();
    this.handle = new FakeClaudeHandle();
    return this.handle;
  }

  push(message: unknown): void {
    this.handle?.emit(message);
  }

  async finish(): Promise<void> {
    this.handle?.end();
    await this.pump;
  }
}

describe('Claude Code aux image serialization', () => {
  it('sends the image as an Anthropic base64 block via the chat queue shape', async () => {
    const sdk = new FakeClaudeSdk();
    const session = ClaudeCodeAuxQuerySession.create({
      systemPrompt: 'sys',
      workingDirectory: '/vault',
      sdk: sdk as unknown as ConstructorParameters<typeof ClaudeCodeAuxQuerySession.create>[0]['sdk'],
    });
    const turn = session.query({ prompt: 'OCR this', images: [IMAGE] });
    await waitFor(() => sdk.prompts.length === 1);

    const queued = sdk.prompts[0] as {
      type: string;
      message: { role: string; content: { type: string; text?: string; source?: { type: string; media_type: string; data: string } }[] };
    };
    expect(queued.type).toBe('user');
    const textBlock = queued.message.content.find((block) => block.type === 'text');
    expect(textBlock?.text).toBe('OCR this');
    const imageBlock = queued.message.content.find((block) => block.type === 'image');
    expect(imageBlock?.source).toEqual({
      type: 'base64',
      media_type: 'image/png',
      data: IMAGE.data,
    });

    sdk.push({ type: 'system', subtype: 'init', tools: ['Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch'], mcp_servers: [] });
    sdk.push({ type: 'assistant', message: { content: [{ type: 'text', text: '<insertion>ok</insertion>' }] } });
    sdk.push({ type: 'result', subtype: 'success', is_error: false });
    const result = await turn;
    expect(result.success).toBe(true);
    // dispose() closes the prompt queue, which lets the SDK pump end; the
    // fake's finish() must therefore come after dispose().
    await session.dispose();
    await sdk.finish();
  });

  it('streams progressive text deltas through onTextChunk (R-A3)', async () => {
    const sdk = new FakeClaudeSdk();
    const session = ClaudeCodeAuxQuerySession.create({
      systemPrompt: 'sys',
      workingDirectory: '/vault',
      sdk: sdk as unknown as ConstructorParameters<typeof ClaudeCodeAuxQuerySession.create>[0]['sdk'],
    });
    const chunks: string[] = [];
    const turn = session.query({
      prompt: 'go',
      onTextChunk: (accumulated) => { chunks.push(accumulated); },
    });
    await waitFor(() => sdk.prompts.length === 1);
    sdk.push({ type: 'system', subtype: 'init', tools: ['Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch'], mcp_servers: [] });
    // Thinking deltas and tool-input JSON must NOT enter the preview channel.
    sdk.push({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'hmm' } } });
    sdk.push({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: '<ins' } } });
    sdk.push({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'ertion>x</insertion>' } } });
    sdk.push({ type: 'assistant', message: { content: [{ type: 'text', text: '<insertion>x</insertion>' }] } });
    sdk.push({ type: 'result', subtype: 'success', is_error: false });
    const result = await turn;
    expect(result.success).toBe(true);
    // Progressive deltas, then the authoritative end-of-turn emission of the
    // same accumulated text (the controller's parser is idempotent).
    expect(chunks).toEqual(['<ins', '<insertion>x</insertion>', '<insertion>x</insertion>']);
    await session.dispose();
    await sdk.finish();
  });
});

// ---------------------------------------------------------------------------
// Codex
// ---------------------------------------------------------------------------

interface FakeCodexClientShape {
  startThread(options: unknown): Promise<{ id: string } | null>;
  getThreadEffectiveSettings(threadId: string): unknown;
  clearThreadEffectiveSettings(threadId: string): void;
  subscribeToThreadNotifications(threadId: string, listener: (event: unknown) => void): { dispose(): void };
  startTurn(options: AppServerTurnStartOptions): Promise<{ id: string } | null>;
  interruptTurn(threadId: string, turnId: string): Promise<unknown>;
}

function createFakeCodexClient(onTurnStart?: (input: AppServerTurnStartOptions['input']) => void): FakeCodexClientShape {
  let listener: ((event: unknown) => void) | null = null;
  return {
    startThread: () => Promise.resolve({ id: 'thread-1' }),
    getThreadEffectiveSettings: () => ({
      approvalPolicy: 'never',
      sandbox: { type: 'readOnly', networkAccess: false },
      cwd: '/vault',
    }),
    clearThreadEffectiveSettings: () => { /* no-op */ },
    subscribeToThreadNotifications: (_threadId, cb) => {
      listener = cb;
      return { dispose: () => { listener = null; } };
    },
    startTurn: (options) => {
      onTurnStart?.(options.input);
      // Simulate the server streaming one agent message, then completing.
      setTimeout(() => {
        listener?.({ method: 'item/agentMessage/delta', params: { delta: '<insertion>ok</insertion>' } });
        listener?.({ method: 'turn/completed', params: {} });
      }, 0);
      return Promise.resolve({ id: 'turn-1' });
    },
    interruptTurn: () => Promise.resolve(),
  };
}

describe('Codex aux image serialization', () => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'opencodian-aux-contract-vault-'));
  afterEach(() => {
    for (const entry of fs.readdirSync(vault)) {
      fs.rmSync(path.join(vault, entry), { recursive: true, force: true });
    }
  });

  function snapshotVault(): Map<string, string> {
    const entries = new Map<string, string>();
    for (const entry of fs.readdirSync(vault)) {
      entries.set(entry, fs.readFileSync(path.join(vault, entry)).toString('hex'));
    }
    return entries;
  }

  it('writes local_image files to the system temp dir, cleans up, and leaves the vault untouched', async () => {
    let capturedInput: AppServerTurnStartOptions['input'] = [];
    const client = createFakeCodexClient((input) => { capturedInput = input; });
    const session = await CodexAuxQuerySession.create({
      systemPrompt: 'sys',
      workingDirectory: vault,
      client: client as unknown as ConstructorParameters<typeof CodexAuxQuerySession.create>[0]['client'],
    });
    const before = snapshotVault();
    const tempBefore = fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith('opencodian-aux-image-')).length;

    const result = await session.query({ prompt: 'OCR this', images: [IMAGE] });

    expect(result.success).toBe(true);
    const entries = capturedInput as { type: string; path?: string; text?: string }[];
    const localImage = entries.find((entry) => entry.type === 'localImage');
    expect(localImage).toBeDefined();
    expect(localImage?.path).toBeDefined();
    // The temp file lives in the system temp dir, NEVER in the vault.
    const dir = path.dirname(localImage?.path ?? '');
    expect(dir.startsWith(os.tmpdir())).toBe(true);
    expect(dir.startsWith(vault)).toBe(false);
    // ...and it is gone after the turn settled.
    expect(fs.existsSync(localImage?.path ?? '')).toBe(false);
    expect(fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith('opencodian-aux-image-')).length)
      .toBe(tempBefore);
    // Vault filesystem unchanged.
    expect(snapshotVault()).toEqual(before);
    await session.dispose();
  });

  it('dispose sweeps leftover image temp dirs', async () => {
    const client = createFakeCodexClient();
    const session = await CodexAuxQuerySession.create({
      systemPrompt: 'sys',
      workingDirectory: vault,
      client: client as unknown as ConstructorParameters<typeof CodexAuxQuerySession.create>[0]['client'],
    });
    // Simulate a wedged turn: a temp dir registered but never cleaned.
    const leaked = path.join(os.tmpdir(), `opencodian-aux-image-leak-${Date.now()}`);
    fs.mkdirSync(leaked);
    (session as unknown as { imageTempDirs: Set<string> }).imageTempDirs.add(leaked);
    await session.dispose();
    expect(fs.existsSync(leaked)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Pi
// ---------------------------------------------------------------------------

function createFakePiPort(): {
  port: {
    request(command: PiRecord, timeoutMs?: number): Promise<PiRecord>;
    subscribe(listener: (event: PiRecord) => void): () => void;
    close(): void;
  };
  requests: PiRecord[];
  emit(event: PiRecord): void;
  /** Resolve the pending `prompt` request (the turn may then finish). */
  releasePrompt(): void;
} {
  const requests: PiRecord[] = [];
  let listener: ((event: PiRecord) => void) | null = null;
  let promptResolve: (() => void) | null = null;
  const port = {
    request(command: PiRecord): Promise<PiRecord> {
      requests.push(command);
      switch (command.type) {
        case 'get_state':
          return Promise.resolve({ serviceProtocol: 1 });
        case 'new_session':
          return Promise.resolve({});
        case 'get_tools':
          // First call: catalog; second call: readback of the active set.
          return requests.filter((r) => r.type === 'get_tools').length === 1
            ? Promise.resolve({ tools: ['read', 'grep', 'find', 'ls', 'glob', 'bash', 'edit'] })
            : Promise.resolve({ active: ['read', 'grep', 'find', 'ls', 'glob'] });
        case 'set_tools':
          return Promise.resolve({});
        case 'prompt':
          // Hold the turn open until the test has emitted its stream events,
          // so progressive deltas deterministically precede the readback.
          return new Promise<PiRecord>((resolve) => {
            promptResolve = () => { resolve({}); };
          });
        case 'get_last_assistant_text':
          return Promise.resolve({ text: '<insertion>ok</insertion>' });
        default:
          return Promise.resolve({});
      }
    },
    subscribe(cb: (event: PiRecord) => void) {
      listener = cb;
      return () => { listener = null; };
    },
    close() { /* no-op */ },
  };
  return {
    port,
    requests,
    emit: (event) => { listener?.(event); },
    releasePrompt: () => { promptResolve?.(); },
  };
}

describe('Pi aux image serialization', () => {
  it('rides the prompt request in the chat-side images shape and streams text deltas', async () => {
    const fake = createFakePiPort();
    const original = jest.requireActual<typeof import('../../../../../src/core/agents/backend/pi/PiRpcClient')>(
      '../../../../../src/core/agents/backend/pi/PiRpcClient',
    );
    // PiAuxQuerySession constructs PiRpcClient internally; spy on it.
    const PiRpcClientSpy = jest.spyOn(original, 'PiRpcClient') as unknown as jest.SpyInstance;
    PiRpcClientSpy.mockImplementation(() => fake.port);

    const { PiAuxQuerySession: SessionClass } = jest.requireActual<typeof import('../../../../../src/core/agents/backend/pi/PiAuxQuerySession')>(
      '../../../../../src/core/agents/backend/pi/PiAuxQuerySession',
    );
    const session = await SessionClass.create({
      systemPrompt: 'sys',
      workingDirectory: '/vault',
      executablePath: '/usr/bin/pi',
    });
    const chunks: string[] = [];
    const turn = session.query({
      prompt: 'OCR this',
      images: [IMAGE],
      onTextChunk: (accumulated) => { chunks.push(accumulated); },
    });
    await waitFor(() => fake.requests.some((request) => request.type === 'prompt'));
    // Stream two progressive deltas before the turn is allowed to settle.
    fake.emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: '<insertion>' } });
    fake.emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'ok</insertion>' } });
    fake.releasePrompt();
    const result = await turn;

    expect(result.success).toBe(true);
    const promptRequest = fake.requests.find((request) => request.type === 'prompt');
    expect(promptRequest?.images).toEqual([
      { type: 'image', data: IMAGE.data, mimeType: 'image/png' },
    ]);
    expect(chunks).toEqual(['<insertion>', '<insertion>ok</insertion>', '<insertion>ok</insertion>']);
    await session.dispose();
    PiRpcClientSpy.mockRestore();
  });
});
