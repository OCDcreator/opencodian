// Deprecated compatibility alias for check:owner-guard.
//
// As of Phase 1 Task 4 (2026-07-31), owner-boundary evaluation is owned by
// scripts/check-owner-boundaries.mjs, which evaluates changes against the
// canonical manifest instead of a hard-coded four-file list and net-line
// heuristic. This alias is retained for a maximum of 30 days from the Task 4
// merge and must be deleted by Phase 1 Task 9 (no later than 2026-08-30, and
// before the Phase 3 runtime pilot begins).
//
// It now delegates to the new boundary gate so existing tooling keeps working,
// but emits a deprecation notice pointing at the replacement.

import process from 'node:process';

import { execFileSync } from 'node:child_process';

const DEPRECATION = [
  'DEPRECATED: check:owner-guard is replaced by check:owner-boundaries.',
  'The hard-coded four-file list and net-line heuristic are removed from active',
  'semantics; boundary evaluation now uses architecture-owners.config.json.',
  'This alias will be deleted by Phase 1 Task 9 (no later than 2026-08-30).',
].join(' ');

function main() {
  process.stderr.write(`${DEPRECATION}\n`);
  try {
    execFileSync(process.execPath, ['scripts/check-owner-boundaries.mjs', ...process.argv.slice(2)], {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
  } catch (error) {
    process.exitCode = error.status ?? 1;
    return;
  }
  process.exitCode = 0;
}

main();
