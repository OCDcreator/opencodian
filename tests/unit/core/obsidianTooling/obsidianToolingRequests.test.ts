import {
  buildDecisionDocument,
  type ObsidianToolingRequest,
  parseToolingRequest,
  requestRequiresConfirmation,
  toolingRequestIdFromFilename,
} from '../../../../src/core/obsidianTooling/obsidianToolingRequests';

const validRequest = {
  id: 'req-1726656000-123-456',
  subcommand: 'plugin:install',
  argv: ['plugin:install', 'name=dataview'],
  requestedAt: 1726656000,
  waitSeconds: 90,
  gateDir: '/vault/.opencodian/obsidian-tooling',
};

function requestFrom(raw: string): ObsidianToolingRequest {
  const parsed = parseToolingRequest(raw);
  expect(parsed).toMatchObject({ ok: true });
  return (parsed as { ok: true; request: ObsidianToolingRequest }).request;
}

describe('tooling request/decision schema (R-B4 fail-closed intake)', () => {
  it('accepts a well-formed request', () => {
    const request = requestFrom(JSON.stringify(validRequest));
    expect(request.subcommand).toBe('plugin:install');
    expect(request.argv).toEqual(['plugin:install', 'name=dataview']);
  });

  it('rejects malformed payloads so the wrapper gets an explicit refusal', () => {
    const cases: [string, unknown][] = [
      ['not-json', '{"id": broken'],
      ['not-object', '"just a string"'],
      ['bad-id', { ...validRequest, id: 'bad id with spaces!' }],
      ['bad-subcommand', { ...validRequest, subcommand: '' }],
      ['bad-argv', { ...validRequest, argv: [] }],
      ['bad-argv-entry', { ...validRequest, argv: ['plugin:install', 42] }],
      ['bad-requestedAt', { ...validRequest, requestedAt: 'x' }],
      ['bad-waitSeconds', { ...validRequest, waitSeconds: 0 }],
    ];
    for (const [reason, payload] of cases) {
      const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
      expect(parseToolingRequest(raw)).toEqual({ ok: false, reason });
    }
  });

  it('rejects a request whose first positional argument is not the declared subcommand', () => {
    expect(parseToolingRequest(JSON.stringify({
      ...validRequest,
      subcommand: 'theme:set',
      argv: ['plugin:install', 'name=x'],
    }))).toEqual({ ok: false, reason: 'argv-subcommand-mismatch' });
  });

  it('allows global key=value options before the subcommand', () => {
    const request = requestFrom(JSON.stringify({
      ...validRequest,
      subcommand: 'theme:set',
      argv: ['vault=work', 'theme:set', 'name=Minimal'],
    }));
    expect(request.argv).toEqual(['vault=work', 'theme:set', 'name=Minimal']);
  });

  it('derives ids only from request filenames (tmp and decision files ignored)', () => {
    expect(toolingRequestIdFromFilename('req-1-2-3.request.json')).toBe('req-1-2-3');
    expect(toolingRequestIdFromFilename('req-1-2-3.request.json.tmp')).toBeNull();
    expect(toolingRequestIdFromFilename('req-1-2-3.decision.json')).toBeNull();
    expect(toolingRequestIdFromFilename('unrelated.txt')).toBeNull();
  });

  it('emits single-line decision documents', () => {
    expect(buildDecisionDocument('allow', 1726656001)).toBe('{"decision":"allow","decidedAt":1726656001}\n');
    expect(buildDecisionDocument('deny', 1726656001)).toBe('{"decision":"deny","decidedAt":1726656001}\n');
    expect(buildDecisionDocument('expired', 1726656001)).toBe('{"decision":"expired","decidedAt":1726656001}\n');
    expect(buildDecisionDocument('invalid', 1726656001)).toBe('{"decision":"invalid","decidedAt":1726656001}\n');
  });

  it('only high-impact classifications require confirmation', () => {
    expect(requestRequiresConfirmation({ ...validRequest, subcommand: 'plugin:install' })).toBe(true);
    expect(requestRequiresConfirmation({
      ...validRequest,
      subcommand: 'themes',
      argv: ['themes'],
    })).toBe(false);
  });
});
