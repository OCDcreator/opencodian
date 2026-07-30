// check:architecture-approvals (Phase 1 Task 6).
//
// Reads approval requests from docs/architecture/approvals/*.json and evaluates
// them against the current committed candidate digest + changed paths. A
// repo-writable JSON alone can never produce PASS; the gate requires an external
// authority (env EXTERNAL_REVIEW_AUTHORITY, normally supplied by protected CI
// from a required reviewer / CODEOWNERS identity).
//
// Locally, the gate returns REVIEW_REQUIRED for any pending request — never
// merge-ready. In protected CI, EXTERNAL_REVIEW_AUTHORITY carries the host-
// verified identity.
//
// Usage:
//   EXTERNAL_REVIEW_AUTHORITY=github-required-reviewer:123 node scripts/check-architecture-approvals.mjs --base <ref>
//
// Exit 0 = no pending requests OR all requests PASS; 1 = any request FAILed a
// binding. REVIEW_REQUIRED is exit 0 with a notice (local cannot be merge-ready
// anyway; the merge gate runs in CI).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { evaluateApproval, validateApprovalRequest } from './architecture-approval-lib.mjs';
import { repoRoot, resolveBaseRef, computeScopeShas, computeChangeScope } from './change-scope-lib.mjs';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { base: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--base') args.base = argv[++i];
    else if (argv[i].startsWith('--base=')) args.base = argv[i].slice(7);
  }
  return args;
}

function listApprovalRequests(root) {
  const dir = path.join(root, 'docs/architecture/approvals');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json') && f !== 'README.md')
    .map((f) => path.join(dir, f));
}

function isWorkspaceClean(root) {
  try {
    execFileSync('git', ['diff', '--quiet'], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['diff', '--cached', '--quiet'], { cwd: root, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function requestIsNewVsMergeBase(root, mergeBaseSha, requestFile) {
  // singleUse requires the request file to be newly added relative to
  // merge-base. Check if the file existed at merge-base.
  try {
    execFileSync('git', ['cat-file', '-e', `${mergeBaseSha}:${path.relative(root, requestFile)}`], {
      cwd: root,
      stdio: 'ignore',
    });
    return false; // existed at merge-base
  } catch {
    return true; // new
  }
}

function main() {
  const args = parseArgs();
  const root = repoRoot();
  const requests = listApprovalRequests(root);
  const externalAuthority = process.env.EXTERNAL_REVIEW_AUTHORITY ?? null;

  if (requests.length === 0) {
    process.stdout.write('PASS architecture-approvals\n- no pending approval requests\n');
    process.exitCode = 0;
    return;
  }

  const baseResolution = resolveBaseRef(root, { explicit: args.base });
  if (!baseResolution.ref) {
    process.stderr.write(`FAIL architecture-approvals: ${baseResolution.error}\n`);
    process.exitCode = 1;
    return;
  }
  const { baseSha, headSha, mergeBaseSha } = computeScopeShas(root, { baseRef: baseResolution.ref });

  // Recompute committed candidate digest for the committed view.
  const committedRaw = execFileSync('git', ['diff', '--name-status', '--find-renames', `${mergeBaseSha}..${headSha}`], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  // Recompute the committed candidate digest for approval binding via the
  // change-scope helper already imported at the top of this file. (Do NOT use
  // require() — this is an ESM module.)
  const scope = computeChangeScope(root, { baseRef: baseResolution.ref });
  const committedDigest = scope.digests.committed;
  const changedPaths = new Set(scope.paths);

  let anyFail = false;
  const clean = isWorkspaceClean(root);

  for (const file of requests) {
    let request;
    try {
      request = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      process.stderr.write(`FAIL: ${path.basename(file)} is not valid JSON: ${error.message}\n`);
      anyFail = true;
      continue;
    }
    const validation = validateApprovalRequest(request);
    if (!validation.ok) {
      process.stderr.write(`FAIL: ${path.basename(file)} invalid: ${validation.errors.join('; ')}\n`);
      anyFail = true;
      continue;
    }
    const verdict = evaluateApproval(request, {
      committedDigest,
      changedPaths,
      baseShaFromGit: baseSha,
      isCleanWorkspace: clean,
      requestIsNewVsMergeBase: requestIsNewVsMergeBase(root, mergeBaseSha, file),
      externalAuthority,
      now: new Date(),
    });
    if (verdict.status === 'FAIL') {
      anyFail = true;
      process.stderr.write(`FAIL: ${path.basename(file)} — ${verdict.reasons.join('; ')}\n`);
    } else if (verdict.status === 'REVIEW_REQUIRED') {
      process.stdout.write(`REVIEW_REQUIRED: ${path.basename(file)} — ${verdict.reasons.join('; ')}\n`);
    } else {
      process.stdout.write(`PASS: ${path.basename(file)} — ${verdict.reasons.join('; ')}\n`);
    }
  }

  process.exitCode = anyFail ? 1 : 0;
}

main();
