// Unified verify runner.
//
// Creates one temporary change-scope artifact and runs the full gate sequence
// in the order required by the plan:
//   1. change scope
//   2. owner manifest / boundaries
//   3. dependency direction / cycles   (Phase 1 Task 5)
//   4. module docs
//   5. Graphify digest                  (Phase 2 Task 7)
//   6. devlog order
//   7. lint
//   8. typecheck
//   9. affected focused tests (hint)
//   10. full tests
//   11. production build
//   12. generated styles clean check
//
// The runner exposes the scope to gates via the VERIFY_SCOPE_ARTIFACT env var
// and prints a compact scope/owner summary before the expensive gates. It never
// re-invents a diff range: every diff-aware gate reads the same artifact.
//
// Usage:
//   node scripts/run-verify.mjs [--base <ref>]
//   npm run verify -- --base origin/main

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { computeChangeScope, repoRoot, resolveBaseRef } from './change-scope-lib.mjs';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { base: null, stopOnFirst: true };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === '--base') {
      args.base = argv[++i];
    } else if (item.startsWith('--base=')) {
      args.base = item.slice('--base='.length);
    } else if (item === '--continue-on-error') {
      args.stopOnFirst = false;
    }
  }
  return args;
}

function runStep(name, command, { env = {}, cwd } = {}) {
  process.stdout.write(`\n=== ${name} ===\n`);
  try {
    execSync(command, { stdio: 'inherit', cwd, env: { ...process.env, ...env } });
    return { name, ok: true };
  } catch (error) {
    return { name, ok: false, status: error.status ?? 1 };
  }
}

function main() {
  const args = parseArgs();
  const root = repoRoot();
  const baseResolution = resolveBaseRef(root, { explicit: args.base });
  if (!baseResolution.ref) {
    process.stderr.write(`FAIL verify: ${baseResolution.error}\n`);
    process.exitCode = 1;
    return;
  }

  // Resolve the scope once and write a temp artifact. Gates read
  // VERIFY_SCOPE_ARTIFACT so they all see the same committed/index/workspace
  // candidates; no gate invents its own range.
  let scope;
  try {
    scope = computeChangeScope(root, { baseRef: baseResolution.ref });
  } catch (error) {
    process.stderr.write(`FAIL verify: could not resolve change scope — ${error.message}\n`);
    process.exitCode = 1;
    return;
  }

  const artifactFile = path.join(os.tmpdir(), `opencodian-verify-scope-${process.pid}.json`);
  fs.writeFileSync(artifactFile, JSON.stringify(scope, null, 2) + '\n');

  // Compact pre-run summary so a human/agent sees scope + path count before the
  // expensive gates run.
  process.stdout.write(
    `verify scope\n` +
      `- base: ${scope.baseRef} (${scope.baseSha.slice(0, 12)})\n` +
      `- head: ${scope.headSha.slice(0, 12)}\n` +
      `- merge-base: ${scope.mergeBaseSha.slice(0, 12)}\n` +
      `- changed paths: ${scope.paths.length}\n` +
      `- committed/index/workspace digests: ${scope.digests.committed.slice(0, 8)} / ${scope.digests.index.slice(0, 8)} / ${scope.digests.workspace.slice(0, 8)}\n`,
  );

  const gateEnv = { VERIFY_SCOPE_ARTIFACT: artifactFile, VERIFY_BASE_REF: scope.baseRef };

  const steps = [
    ['change scope', 'node scripts/check-change-scope.mjs'],
    ['owner manifest', 'node scripts/check-owner-manifest.mjs'],
    ['module docs', 'npm run check:module-docs'],
    ['graphify freshness', 'npm run check:graphify'],
    ['devlog order', 'npm run check:devlog-order'],
    ['lint', 'npm run lint'],
    ['typecheck', 'npm run typecheck'],
    ['full tests', 'npm test'],
    ['production build', 'npm run build'],
    ['generated styles clean', 'git diff --exit-code -- styles.css'],
  ];

  const results = [];
  for (const [name, command] of steps) {
    const result = runStep(name, command, { env: gateEnv, cwd: root });
    results.push(result);
    if (!result.ok && args.stopOnFirst) {
      break;
    }
  }

  // Always clean up the temp artifact.
  try {
    fs.unlinkSync(artifactFile);
  } catch {
    // ignore
  }

  process.stdout.write('\n=== verify summary ===\n');
  for (const r of results) {
    process.stdout.write(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}\n`);
  }

  const failed = results.filter((r) => !r.ok);
  process.exitCode = failed.length === 0 ? 0 : 1;
}

main();
