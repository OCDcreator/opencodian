/**
 * ZCodeProtocolTypes.test.ts — boundary validation for the ZCode Protocol.
 *
 * Covers the envelope contract (no `jsonrpc` field outbound), malformed and
 * drifted inbound frames, and honest capability parsing (absent flags stay
 * null instead of being fabricated).
 */
import { describe, expect, it } from '@jest/globals';

import {
  parseZCodeInboundMessage,
  parseZCodeRuntimeCapabilities,
  serializeZCodeRequest,
  serializeZCodeServerRequestReply,
} from '../../../../../src/core/agents/backend/zcode/ZCodeProtocolTypes';

describe('parseZCodeInboundMessage', () => {
  it('parses a response with a result', () => {
    expect(parseZCodeInboundMessage('{"id":"opencodian-1","result":{"independentPlanState":true}}'))
      .toEqual({ kind: 'response', id: 'opencodian-1', result: { independentPlanState: true } });
  });

  it('parses a response whose result is null', () => {
    expect(parseZCodeInboundMessage('{"id":"opencodian-2","result":null}'))
      .toEqual({ kind: 'response', id: 'opencodian-2', result: null });
  });

  it('normalizes numeric ids to strings', () => {
    expect(parseZCodeInboundMessage('{"id":7,"result":null}'))
      .toEqual({ kind: 'response', id: '7', result: null });
  });

  it('parses an error response with structured code and optional data', () => {
    expect(parseZCodeInboundMessage('{"id":"opencodian-3","error":{"code":-32602,"message":"Invalid params","data":{"name":"ZodError"}}}'))
      .toEqual({
        kind: 'error',
        id: 'opencodian-3',
        error: { code: -32602, message: 'Invalid params', data: { name: 'ZodError' } },
      });
  });

  it('parses a notification and tolerates unknown extra fields (additive drift)', () => {
    expect(parseZCodeInboundMessage('{"method":"startup/storageState","params":{"phase":"ready"},"futureField":123}'))
      .toEqual({ kind: 'notification', method: 'startup/storageState', params: { phase: 'ready' } });
  });

  it('parses an unknown notification method without rejecting the frame', () => {
    expect(parseZCodeInboundMessage('{"method":"unknown/future.event","params":{}}'))
      .toEqual({ kind: 'notification', method: 'unknown/future.event', params: {} });
  });

  it('parses a server-initiated request (id + method)', () => {
    expect(parseZCodeInboundMessage('{"id":"ask-1","method":"interaction/requestPermission","params":{"requestId":"r1"}}'))
      .toEqual({
        kind: 'server-request',
        id: 'ask-1',
        method: 'interaction/requestPermission',
        params: { requestId: 'r1' },
      });
  });

  it('rejects malformed JSON honestly', () => {
    expect(parseZCodeInboundMessage('not json')).toEqual({ kind: 'invalid', reason: 'malformed-json' });
  });

  it('rejects non-object JSON', () => {
    expect(parseZCodeInboundMessage('[1,2,3]')).toEqual({ kind: 'invalid', reason: 'not-an-object' });
    expect(parseZCodeInboundMessage('"str"')).toEqual({ kind: 'invalid', reason: 'not-an-object' });
  });

  it('rejects unrecognized envelopes', () => {
    expect(parseZCodeInboundMessage('{"jsonrpc":"2.0"}')).toEqual({ kind: 'invalid', reason: 'unrecognized-envelope' });
    expect(parseZCodeInboundMessage('{"params":{}}')).toEqual({ kind: 'invalid', reason: 'unrecognized-envelope' });
  });

  it('rejects responses missing both result and error', () => {
    expect(parseZCodeInboundMessage('{"id":"x"}')).toEqual({ kind: 'invalid', reason: 'missing-result-and-error' });
  });

  it('rejects malformed error shapes', () => {
    expect(parseZCodeInboundMessage('{"id":"x","error":{"code":"boom"}}')).toEqual({ kind: 'invalid', reason: 'invalid-error-shape' });
    expect(parseZCodeInboundMessage('{"id":"x","error":"boom"}')).toEqual({ kind: 'invalid', reason: 'invalid-error-shape' });
  });

  it('rejects invalid id types and treats a null id as absent', () => {
    expect(parseZCodeInboundMessage('{"id":{"nested":true},"result":null}')).toEqual({ kind: 'invalid', reason: 'invalid-id-type' });
    expect(parseZCodeInboundMessage('{"id":null,"method":"x"}')).toEqual({ kind: 'notification', method: 'x', params: {} });
  });
});

describe('serializeZCodeRequest', () => {
  it('never emits the jsonrpc field the official runtime rejects', () => {
    const frame = serializeZCodeRequest({ id: 'opencodian-1', method: 'runtime/capabilities', params: {} });
    const parsed = JSON.parse(frame) as Record<string, unknown>;
    expect(parsed).toEqual({ id: 'opencodian-1', method: 'runtime/capabilities', params: {} });
    expect('jsonrpc' in parsed).toBe(false);
  });

  it('omits params entirely when undefined', () => {
    const parsed = JSON.parse(serializeZCodeRequest({ id: 'a', method: 'session/list' })) as Record<string, unknown>;
    expect('params' in parsed).toBe(false);
  });

  it('round-trips server request replies with structured errors', () => {
    const reply = JSON.parse(serializeZCodeServerRequestReply({
      id: 'ask-1',
      error: { code: -32601, message: 'Method not found: interaction/browserExecute' },
    })) as Record<string, unknown>;
    expect(reply['id']).toBe('ask-1');
    expect(reply['error']).toEqual({ code: -32601, message: 'Method not found: interaction/browserExecute' });
    expect('jsonrpc' in reply).toBe(false);
  });
});

describe('parseZCodeRuntimeCapabilities', () => {
  it('surfaces known flags and preserves raw for drift analysis', () => {
    const capabilities = parseZCodeRuntimeCapabilities({ independentPlanState: true, futureFlag: 'x' });
    expect(capabilities.independentPlanState).toBe(true);
    expect(capabilities.raw).toEqual({ independentPlanState: true, futureFlag: 'x' });
  });

  it('keeps absent or non-boolean known flags unavailable (null), never fabricated', () => {
    expect(parseZCodeRuntimeCapabilities({}).independentPlanState).toBeNull();
    expect(parseZCodeRuntimeCapabilities({ independentPlanState: 'yes' }).independentPlanState).toBeNull();
    expect(parseZCodeRuntimeCapabilities(null).independentPlanState).toBeNull();
    expect(parseZCodeRuntimeCapabilities('junk').raw).toEqual({});
  });
});
