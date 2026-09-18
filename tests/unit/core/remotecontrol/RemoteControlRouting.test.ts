import {
  isAllowedRemoteControlHost,
  parseInstructionBody,
  REMOTE_CONTROL_MAX_INSTRUCTION_CHARS,
  REMOTE_CONTROL_PORT,
  resolveRemoteControlOperation,
} from '../../../../src/core/remotecontrol/RemoteControlService';

describe('RemoteControl routing (R-C6 closed whitelist)', () => {
  describe('Host-header allowlist (checked before auth)', () => {
    it.each([
      [`127.0.0.1:${REMOTE_CONTROL_PORT}`],
      [`localhost:${REMOTE_CONTROL_PORT}`],
      [`[::1]:${REMOTE_CONTROL_PORT}`],
      [`  LOCALHOST:${REMOTE_CONTROL_PORT}  `],
    ])('accepts loopback host %j', (host) => {
      expect(isAllowedRemoteControlHost(host, REMOTE_CONTROL_PORT)).toBe(true);
    });

    it.each([
      [undefined],
      [''],
      ['evil.example.com:4105'],
      ['127.0.0.1.evil.com:4105'],
      [`127.0.0.1:${REMOTE_CONTROL_PORT + 1}`],
      ['[::1]:22'],
      [`127.0.0.1.evil.com:${REMOTE_CONTROL_PORT}`],
      ['localhost:80'],
    ])('rejects host %j with 403 semantics', (host) => {
      expect(isAllowedRemoteControlHost(host, REMOTE_CONTROL_PORT)).toBe(false);
    });
  });

  describe('method + path whitelist', () => {
    it('allows exactly the three documented operations', () => {
      expect(resolveRemoteControlOperation('GET', '/v1/health')).toEqual({
        kind: 'allowed',
        op: 'health',
      });
      expect(resolveRemoteControlOperation('POST', '/v1/instruction')).toEqual({
        kind: 'allowed',
        op: 'instruction.submit',
      });
      expect(resolveRemoteControlOperation('GET', '/v1/session')).toEqual({
        kind: 'allowed',
        op: 'session.status',
      });
    });

    it.each([
      ['PUT', '/v1/health'],
      ['DELETE', '/v1/session'],
      ['POST', '/v1/health'],
      ['GET', '/v1/instruction'],
      ['OPTIONS', '/v1/health'],
      ['PATCH', '/v1/instruction'],
    ])('rejects wrong method %j on %j with 405 semantics', (method, path) => {
      expect(resolveRemoteControlOperation(method, path)).toEqual({ kind: 'method_not_allowed' });
    });

    it('rejects any unknown path structurally — including hypothetical file reads', () => {
      expect(resolveRemoteControlOperation('POST', '/v1/readFile')).toEqual({
        kind: 'unknown_operation',
      });
      expect(resolveRemoteControlOperation('GET', '/etc/passwd')).toEqual({
        kind: 'unknown_operation',
      });
      expect(resolveRemoteControlOperation('GET', '/v1/health/')).toEqual({
        kind: 'unknown_operation',
      });
      expect(resolveRemoteControlOperation('GET', '/V1/HEALTH')).toEqual({
        kind: 'unknown_operation',
      });
      // The pure resolver is exact; the service strips queries before calling
      // it, so a query string alone never unlocks anything.
      expect(resolveRemoteControlOperation('GET', '/v1/health?x=1')).toEqual({
        kind: 'unknown_operation',
      });
      expect(resolveRemoteControlOperation('GET', '/')).toEqual({
        kind: 'unknown_operation',
      });
    });
  });

  describe('closed request-body shape', () => {
    it('accepts exactly one instruction string field', () => {
      expect(parseInstructionBody(JSON.stringify({ instruction: '整理笔记' })))
        .toBe('整理笔记');
    });

    it.each([
      ['not json at all'],
      ['{broken'],
      ['[1,2,3]'],
      ['"just a string"'],
      ['null'],
      ['{}'],
      [JSON.stringify({ instruction: '   ' })],
      [JSON.stringify({})],
      [JSON.stringify({ instruction: 42 })],
      [JSON.stringify({ instruction: null })],
      // Any extra field (e.g. a hypothetical path) is structurally rejected.
      [JSON.stringify({ instruction: 'ok', path: '/etc/passwd' })],
      [JSON.stringify({ op: 'readFile', path: '/etc/passwd' })],
      [JSON.stringify({ instruction: 'ok', op: 'readFile' })],
    ])('rejects body %j as malformed_request', (body) => {
      expect(() => parseInstructionBody(body)).toThrow();
    });

    it('rejects instructions above the hard character cap', () => {
      const overlong = 'a'.repeat(REMOTE_CONTROL_MAX_INSTRUCTION_CHARS + 1);
      expect(() => parseInstructionBody(JSON.stringify({ instruction: overlong }))).toThrow();
      const atCap = 'a'.repeat(REMOTE_CONTROL_MAX_INSTRUCTION_CHARS);
      expect(parseInstructionBody(JSON.stringify({ instruction: atCap }))).toBe(atCap);
    });
  });
});
