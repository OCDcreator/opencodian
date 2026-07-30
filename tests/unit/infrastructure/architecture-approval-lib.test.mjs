const { execFileSync } = require('node:child_process');
const path = require('node:path');

const modulePath = path.join(process.cwd(), 'scripts', 'architecture-approval-lib.mjs');

function callExport(exportName, ...args) {
  const code = `
    import { pathToFileURL } from 'node:url';
    const mod = await import(pathToFileURL(${JSON.stringify(modulePath)}).href);
    const result = mod[${JSON.stringify(exportName)}](...${JSON.stringify(args)});
    process.stdout.write(JSON.stringify(result));
  `;
  const out = execFileSync(process.execPath, ['--input-type=module', '--eval', code], {
    encoding: 'utf8',
    cwd: process.cwd(),
  });
  return JSON.parse(out);
}

function makeRequest(overrides = {}) {
  return {
    schemaVersion: 1,
    id: '2026-07-31-test-waiver',
    rules: ['BUDGET_HOTSPOT_GROWTH'],
    paths: ['src/main.ts'],
    baseSha: 'a'.repeat(40),
    scopeDigest: `sha256:${'b'.repeat(64)}`,
    reason: 'composition-only wiring',
    evidence: ['tests/unit/x.test.ts'],
    requestedBy: 'agent',
    authorityPolicy: 'protected-review',
    expiresAt: '2026-12-31T00:00:00Z',
    singleUse: true,
    ...overrides,
  };
}

const VALID_DIGEST = 'b'.repeat(64);
const VALID_BASE = 'a'.repeat(40);

describe('validateApprovalRequest', () => {
  test('accepts a well-formed request', () => {
    expect(callExport('validateApprovalRequest', makeRequest())).toEqual({ ok: true, errors: [] });
  });

  test('rejects a never-approvable rule', () => {
    const r = callExport('validateApprovalRequest', makeRequest({ rules: ['DEPENDENCY_DIRECTION'] }));
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('hard invariant');
  });

  test('rejects unknown key (e.g. approvedBy)', () => {
    const r = callExport('validateApprovalRequest', makeRequest({ approvedBy: 'agent' }));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('Unknown approval key'))).toBe(true);
  });

  test('rejects invalid scopeDigest format', () => {
    const r = callExport('validateApprovalRequest', makeRequest({ scopeDigest: 'not-a-digest' }));
    expect(r.ok).toBe(false);
  });

  test('rejects invalid baseSha (not 40 hex)', () => {
    const r = callExport('validateApprovalRequest', makeRequest({ baseSha: 'short' }));
    expect(r.ok).toBe(false);
  });
});

describe('evaluateApproval — binding failures', () => {
  test('FAIL on expired', () => {
    const r = callExport('evaluateApproval', makeRequest({ expiresAt: '2020-01-01T00:00:00Z' }), {});
    expect(r.status).toBe('FAIL');
    expect(r.reasons[0]).toContain('expired');
  });

  test('FAIL on scopeDigest mismatch', () => {
    const r = callExport('evaluateApproval', makeRequest(), { committedDigest: 'c'.repeat(64) });
    expect(r.status).toBe('FAIL');
    expect(r.reasons[0]).toContain('scopeDigest mismatch');
  });

  test('FAIL on baseSha mismatch', () => {
    const r = callExport('evaluateApproval', makeRequest(), { baseShaFromGit: 'd'.repeat(40) });
    expect(r.status).toBe('FAIL');
    expect(r.reasons[0]).toContain('baseSha mismatch');
  });

  test('FAIL when a changed path is outside the approved set', () => {
    const r = callExport('evaluateApproval', makeRequest({ paths: ['src/main.ts'] }), {
      changedPaths: ['src/main.ts', 'src/other.ts'],
      committedDigest: VALID_DIGEST,
      baseShaFromGit: VALID_BASE,
      isCleanWorkspace: true,
    });
    expect(r.status).toBe('FAIL');
    expect(r.reasons[0]).toContain('not in the approved path set');
  });

  test('FAIL when workspace is dirty', () => {
    const r = callExport('evaluateApproval', makeRequest(), {
      committedDigest: VALID_DIGEST,
      baseShaFromGit: VALID_BASE,
      isCleanWorkspace: false,
    });
    expect(r.status).toBe('FAIL');
    expect(r.reasons[0]).toContain('clean');
  });

  test('FAIL when singleUse request already exists in base history', () => {
    const r = callExport('evaluateApproval', makeRequest(), {
      committedDigest: VALID_DIGEST,
      baseShaFromGit: VALID_BASE,
      isCleanWorkspace: true,
      requestIsNewVsMergeBase: false,
    });
    expect(r.status).toBe('FAIL');
    expect(r.reasons[0]).toContain('reused');
  });
});

describe('evaluateApproval — external authority is the trust root', () => {
  test('REVIEW_REQUIRED without external authority (repo-writable JSON cannot PASS)', () => {
    const r = callExport('evaluateApproval', makeRequest(), {
      committedDigest: VALID_DIGEST,
      baseShaFromGit: VALID_BASE,
      isCleanWorkspace: true,
      requestIsNewVsMergeBase: true,
      externalAuthority: null,
    });
    expect(r.status).toBe('REVIEW_REQUIRED');
    expect(r.reasons[0]).toContain('external authority');
  });

  test('PASS only with external authority + all bindings match', () => {
    const r = callExport('evaluateApproval', makeRequest(), {
      committedDigest: VALID_DIGEST,
      baseShaFromGit: VALID_BASE,
      changedPaths: ['src/main.ts'],
      isCleanWorkspace: true,
      requestIsNewVsMergeBase: true,
      externalAuthority: 'github-required-reviewer:user-123',
    });
    expect(r.status).toBe('PASS');
    expect(r.reasons[0]).toContain('approved by external authority');
  });
});
