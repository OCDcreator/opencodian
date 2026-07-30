// Structured, diff-bound approval library (Phase 1 Task 6).
//
// docs/architecture/approvals/<id>.json is an approval REQUEST + diff binding,
// NOT a trust root. A repo-writable JSON can never produce a PASS on its own.
// Trust comes from outside the repo: protected CI must verify a required
// reviewer / CODEOWNERS review identity and write it into the gate output.
//
// An approval request binds:
//   - rules: which waivable budget rules it covers
//   - paths: exact path set
//   - baseSha + scopeDigest: the committed candidate digest it approves
//   - expiresAt + singleUse
//
// The gate recomputes the committed candidate digest and only allows the
// approval when: digest matches, paths are a subset, rules match, not expired,
// not reused, workspace/index clean, and an EXTERNAL authority is present
// (provided by protected CI, never by the JSON itself).
//
// Rules that can NEVER be approved (hard invariants):
//   DEPENDENCY_DIRECTION, NEW_ARCHITECTURE_CYCLE, DUPLICATE_CANONICAL_STATE,
//   diagnostics redaction / chat isolation, test/module-doc/Graphify freshness.

export const NEVER_APPROVABLE_RULES = new Set([
  'DEPENDENCY_DIRECTION',
  'NEW_ARCHITECTURE_CYCLE',
  'DUPLICATE_CANONICAL_STATE',
  'DIAGNOSTICS_REDACTION',
  'CHAT_ISOLATION',
  'TEST_FRESHNESS',
  'MODULE_DOC_FRESHNESS',
  'GRAPHIFY_FRESHNESS',
]);

const ALLOWED_REQUEST_KEYS = new Set([
  'schemaVersion',
  'id',
  'rules',
  'paths',
  'baseSha',
  'scopeDigest',
  'reason',
  'evidence',
  'requestedBy',
  'authorityPolicy',
  'expiresAt',
  'singleUse',
]);

export function validateApprovalRequest(request) {
  const errors = [];
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return { ok: false, errors: ['Approval request must be a JSON object.'] };
  }
  for (const key of Object.keys(request)) {
    if (!ALLOWED_REQUEST_KEYS.has(key)) {
      errors.push(`Unknown approval key: "${key}".`);
    }
  }
  if (request.schemaVersion !== 1) {
    errors.push(`schemaVersion must be 1, got ${JSON.stringify(request.schemaVersion)}.`);
  }
  if (typeof request.id !== 'string' || !request.id.trim()) {
    errors.push('id must be a non-empty string.');
  }
  if (!Array.isArray(request.rules) || request.rules.length === 0) {
    errors.push('rules must be a non-empty array.');
  }
  for (const rule of request.rules ?? []) {
    if (NEVER_APPROVABLE_RULES.has(rule)) {
      errors.push(`rule "${rule}" is a hard invariant and can never be approved.`);
    }
  }
  if (!Array.isArray(request.paths) || request.paths.length === 0) {
    errors.push('paths must be a non-empty array.');
  }
  if (typeof request.baseSha !== 'string' || !/^[0-9a-f]{40}$/.test(request.baseSha)) {
    errors.push('baseSha must be a full 40-char SHA.');
  }
  if (typeof request.scopeDigest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(request.scopeDigest)) {
    errors.push('scopeDigest must be "sha256:<64 hex>".');
  }
  if (typeof request.reason !== 'string' || !request.reason.trim()) {
    errors.push('reason must be a non-empty string.');
  }
  if (!Array.isArray(request.evidence)) {
    errors.push('evidence must be an array.');
  }
  if (typeof request.expiresAt !== 'string' || Number.isNaN(Date.parse(request.expiresAt))) {
    errors.push('expiresAt must be a valid ISO date.');
  }
  if (typeof request.singleUse !== 'boolean') {
    errors.push('singleUse must be a boolean.');
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Evaluate an approval request against a computed committed candidate digest
 * and the actual changed paths. Returns a verdict object.
 *
 * @param {object} request - the parsed approval JSON
 * @param {object} ctx - { committedDigest, changedPaths (Set<string>), externalAuthority (string|null), now (Date), isCleanWorkspace (bool), baseShaFromGit, requestIsNewVsMergeBase (bool) }
 * @returns {{ status: 'PASS'|'REVIEW_REQUIRED'|'FAIL', reasons: string[] }}
 *
 * status meanings:
 *   PASS          - external authority present AND all bindings match
 *   REVIEW_REQUIRED - no external authority (local gate); never merge-ready
 *   FAIL          - a binding mismatch, expiry, reuse, dirty workspace, or
 *                   never-approvable rule
 */
export function evaluateApproval(request, ctx = {}) {
  const reasons = [];
  const now = ctx.now ?? new Date();
  const externalAuthority = ctx.externalAuthority ?? null;

  // 1. Never-approvable rules are rejected at validation; re-check defensively.
  for (const rule of request.rules ?? []) {
    if (NEVER_APPROVABLE_RULES.has(rule)) {
      return { status: 'FAIL', reasons: [`rule "${rule}" is a hard invariant; cannot be approved.`] };
    }
  }

  // 2. Expiry.
  if (Date.parse(request.expiresAt) < now.getTime()) {
    return { status: 'FAIL', reasons: [`approval expired at ${request.expiresAt}.`] };
  }

  // 3. Base SHA must match the git-resolved base.
  if (ctx.baseShaFromGit && request.baseSha !== ctx.baseShaFromGit) {
    reasons.push(`baseSha mismatch: request ${request.baseSha} vs git ${ctx.baseShaFromGit}.`);
  }

  // 4. Committed candidate digest must match (recomputed by the gate).
  if (ctx.committedDigest && request.scopeDigest !== `sha256:${ctx.committedDigest}`) {
    reasons.push(`scopeDigest mismatch: request ${request.scopeDigest} vs computed sha256:${ctx.committedDigest.slice(0, 12)}….`);
  }

  // 5. Paths: every changed path must be within the approved path set. Path
  //    superset (approving more than changed) is allowed; subset is not.
  const approvedPaths = new Set(request.paths ?? []);
  const changedPathsRaw = ctx.changedPaths ?? [];
  const changedPaths = changedPathsRaw instanceof Set ? changedPathsRaw : new Set(changedPathsRaw);
  for (const changed of changedPaths) {
    if (!approvedPaths.has(changed)) {
      reasons.push(`changed path "${changed}" is not in the approved path set.`);
    }
  }

  // 6. singleUse: the request file must be new relative to merge-base (not a
  //    pre-existing reused request).
  if (request.singleUse && ctx.requestIsNewVsMergeBase === false) {
    reasons.push('singleUse request already exists in base history; cannot be reused.');
  }

  // 7. Workspace/index must be clean so the committed digest is authoritative.
  if (ctx.isCleanWorkspace === false) {
    reasons.push('approval only takes effect when workspace and index are clean (committed digest is authoritative).');
  }

  // 8. Rules must match the actual triggered budget rules (caller passes which
  //    rules the diff triggered; mismatch = FAIL).
  if (ctx.triggeredRules && request.rules) {
    for (const triggered of ctx.triggeredRules) {
      if (!request.rules.includes(triggered)) {
        reasons.push(`triggered rule "${triggered}" is not covered by this approval.`);
      }
    }
  }

  if (reasons.length) {
    return { status: 'FAIL', reasons };
  }

  // 9. External authority. Without it, a repo-writable JSON can never PASS —
  //    locally the gate returns REVIEW_REQUIRED, never merge-ready.
  if (!externalAuthority) {
    return { status: 'REVIEW_REQUIRED', reasons: ['No external authority (protected CI required reviewer / CODEOWNERS) present. A repo-writable JSON alone cannot approve.'] };
  }

  return { status: 'PASS', reasons: [`approved by external authority: ${externalAuthority}`] };
}
