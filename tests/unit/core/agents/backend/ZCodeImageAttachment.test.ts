/**
 * ZCodeImageAttachment.test.ts — local validation, native wire mapping, and
 * model capability gate (ticket 07).
 *
 * Junk fails before dispatch. A live catalog must affirm image support.
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { AgentCapability } from '../../../../../src/core/agents/AgentCapability';
import { loadBackendSessionMessages } from '../../../../../src/core/agents/backend/AgentBackendRouting';
import type { AgentService } from '../../../../../src/core/agents/backend/AgentService';
import { AgentServiceRegistry } from '../../../../../src/core/agents/backend/AgentServiceRegistry';
import { ZCodeAdapter } from '../../../../../src/core/agents/backend/zcode/ZCodeAdapter';
import type { ZCodeAppServerTransport } from '../../../../../src/core/agents/backend/zcode/ZCodeAppServerTransport';
import { toZCodeImageInput, validateZCodeImageAttachment, ZCODE_IMAGE_MAX_DECODED_BYTES } from '../../../../../src/core/agents/backend/zcode/ZCodeImageAttachment';
import type { ZCodeProviderConfigSnapshot } from '../../../../../src/core/agents/backend/zcode/ZCodeProviderConfigDiscovery';
import type { ZCodeRuntimeResolution } from '../../../../../src/core/agents/backend/zcode/ZCodeRuntimeResolver';
import type { StreamChunk } from '../../../../../src/core/types/chat';

const providerConfig: ZCodeProviderConfigSnapshot = {
  dataRoot: '/home/tester/.zcode',
  configPath: '/home/tester/.zcode/v2/provider_config.json',
  builtinConfigPath: '/builtin/zcode-builtin.json',
  state: 'validated',
  providerCount: 7,
  detail: null,
  env: { ZCODE_STORAGE_DIR: '/home/tester/.zcode' },
};

const readyResolution: ZCodeRuntimeResolution = {
  mode: 'ready',
  launch: {
    command: '/runtime/zcode-agent',
    args: ['app-server', '--stdio'],
    entryKind: 'native-binary',
    entryPath: '/runtime/zcode-agent',
    source: 'app-bundled',
    extraEnv: {},
  },
};

function b64(bytes: number): string {
  return Buffer.alloc(bytes, 7).toString('base64');
}

describe('validateZCodeImageAttachment', () => {
  it('maps image bytes to the official native attachment input shape', () => {
    expect(toZCodeImageInput({ data: b64(42), mediaType: 'image/png', filename: 'pixel.png' }, 0)).toEqual({
      kind: 'image', filename: 'pixel.png', mimeType: 'image/png', sizeBytes: 42, dataBase64: b64(42),
    });
  });
  it('accepts well-formed supported images and reports decoded size', () => {
    expect(validateZCodeImageAttachment({ data: b64(42), mediaType: 'image/png' }, 0))
      .toEqual({ ok: true, decodedBytes: 42 });
    expect(validateZCodeImageAttachment({ data: b64(1024), mediaType: 'image/jpeg' }, 1).ok).toBe(true);
    expect(validateZCodeImageAttachment({ data: b64(64), mediaType: 'image/gif' }, 2).ok).toBe(true);
    expect(validateZCodeImageAttachment({ data: b64(64), mediaType: 'image/webp' }, 3).ok).toBe(true);
  });

  it('rejects unsupported media types with an actionable reason', () => {
    const result = validateZCodeImageAttachment({ data: b64(10), mediaType: 'image/tiff' }, 0);
    expect(result).toMatchObject({ ok: false, reason: 'malformed-type' });
    expect(result.ok === false && result.detail).toContain('image/tiff');
  });

  it('rejects missing and empty data', () => {
    expect(validateZCodeImageAttachment({ data: '', mediaType: 'image/png' }, 0)).toMatchObject({ ok: false, reason: 'missing-data' });
    expect(validateZCodeImageAttachment({ data: '====', mediaType: 'image/png' }, 1).ok).toBe(false);
  });

  it('rejects malformed base64', () => {
    expect(validateZCodeImageAttachment({ data: 'not-base64!!', mediaType: 'image/png' }, 0))
      .toMatchObject({ ok: false, reason: 'malformed-base64' });
    expect(validateZCodeImageAttachment({ data: 'QUJDRA', mediaType: 'image/png' }, 0))
      .toMatchObject({ ok: false, reason: 'malformed-base64' });
  });

  it('rejects oversized images after decoding', () => {
    const result = validateZCodeImageAttachment({ data: b64(ZCODE_IMAGE_MAX_DECODED_BYTES + 1), mediaType: 'image/png' }, 2);
    expect(result).toMatchObject({ ok: false, reason: 'oversized' });
    expect(result.ok === false && result.detail).toContain(String(ZCODE_IMAGE_MAX_DECODED_BYTES));
  });
});

describe('ZCodeAdapter — image sends fail-closed with zero dispatch', () => {
  let calls: { method: string }[];
  let adapter: ZCodeAdapter;

  async function collect(generator: AsyncGenerator<StreamChunk>): Promise<StreamChunk[]> {
    const chunks: StreamChunk[] = [];
    for await (const chunk of generator) chunks.push(chunk);
    return chunks;
  }

  afterEach(() => {
    adapter.dispose();
    jest.restoreAllMocks();
  });

  async function startAdapter(): Promise<void> {
    calls = [];
    const fake = {
      start: jest.fn(async () => {}),
      request: jest.fn(async (method: string) => {
        calls.push({ method });
        return method === 'runtime/capabilities' ? { independentPlanState: true } : {};
      }),
      dispose: jest.fn(),
      onNotification: jest.fn(() => ({ dispose: jest.fn() })),
      onServerRequest: jest.fn(() => ({ dispose: jest.fn() })),
    };
    adapter = new ZCodeAdapter({
      workingDirectory: '/vault',
      resolveRuntime: () => readyResolution,
      discoverProviderConfig: () => providerConfig,
      createTransport: () => fake as unknown as ZCodeAppServerTransport,
    });
    await adapter.start();
  }

  it('rejects junk attachments with the actionable reason and sends nothing', async () => {
    await startAdapter();
    const chunks = await collect(adapter.sendMessage({
      sessionId: 'sess_a',
      content: 'look',
      images: [{ data: 'not-base64!!', mediaType: 'image/png' }],
    }));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ type: 'error' });
    expect((chunks[0] as { content: string }).content).toContain('not well-formed base64');
    expect((chunks[0] as { content: string }).content).toContain('no partial turn');
    expect(calls.filter((call) => call.method === 'session/send')).toEqual([]);
  });

  it('names the failing attachment among multiple and still sends nothing', async () => {
    await startAdapter();
    const chunks = await collect(adapter.sendMessage({
      sessionId: 'sess_a',
      content: 'look',
      images: [
        { data: b64(10), mediaType: 'image/png' },
        { data: b64(ZCODE_IMAGE_MAX_DECODED_BYTES + 10), mediaType: 'image/png' },
      ],
    }));
    expect(chunks).toHaveLength(1);
    expect((chunks[0] as { content: string }).content).toContain('Attachment #2');
    expect((chunks[0] as { content: string }).content).toContain('over the');
    expect(calls.filter((call) => call.method === 'session/send')).toEqual([]);
  });

  it('rejects valid images when no live model capability has been observed', async () => {
    await startAdapter();
    const chunks = await collect(adapter.sendMessage({
      sessionId: 'sess_a',
      content: 'describe',
      images: [{ data: b64(69), mediaType: 'image/png' }],
    }));
    expect(chunks).toHaveLength(1);
    expect((chunks[0] as { content: string }).content).toContain('does not report image input support');
    expect((chunks[0] as { content: string }).content).toContain('no partial turn');
    expect(calls.filter((call) => call.method === 'session/send')).toEqual([]);
  });
});

describe('Restored attachment identity passthrough', () => {
  it('preserves native attachment records in hydrated message payloads', async () => {
    const attachments = [{ ref: 'zcode-artifact://sess_a/att1', fileName: 'red.png', mime: 'image/png', bytes: 69 }];
    const adapter: AgentService = {
      kind: 'zcode',
      displayName: 'ZCode',
      description: '',
      capabilities: new Set<AgentCapability>([AgentCapability.Sessions]),
      status: 'connected',
      hasCapability: () => true,
      start: async () => {},
      stop: async () => {},
      dispose: () => {},
      onStatusChange: () => ({ dispose: () => {} }),
      getSessionMessages: async () => [{
        info: { id: 'msg_1', role: 'user', time: { created: 1 } },
        parts: [{ type: 'text', text: 'look' }],
        attachments,
      }],
    };
    const registry = new AgentServiceRegistry();
    registry.register(adapter);
    registry.setEnabled('zcode');
    const rows = await loadBackendSessionMessages(registry, { backend: 'zcode' }, 'sess_a');
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toContain('zcode-artifact://sess_a/att1');
    expect(rows[0].payload).toContain('red.png');
    expect(rows[0].payload).toContain('image/png');
  });
});
