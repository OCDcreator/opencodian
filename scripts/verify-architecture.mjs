// verify:architecture — the unified architecture gate surface.
//
// Runs: owner-manifest, owner-boundaries, dependency-direction, architecture-
// cycles, architecture-approvals, using the same change scope. This combines
// Phase 1 Tasks 1/3/4/5/6 so local verify, pre-push, PR, push and the package
// workflow all exercise the same architecture gates (including the structured
// approval validation that protected CI needs).
//
// Usage: npm run verify:architecture -- [--base <ref>]

import { execSync } from 'node:child_process';
import process from 'node:process';

const steps = [
  ['owner manifest', 'node scripts/check-owner-manifest.mjs'],
  ['owner boundaries', 'node scripts/check-owner-boundaries.mjs'],
  ['dependency direction', 'node scripts/check-dependency-direction.mjs'],
  ['architecture cycles', 'node scripts/check-architecture-cycles.mjs'],
  ['architecture approvals', 'node scripts/check-architecture-approvals.mjs'],
];

function main() {
  const extra = process.argv.slice(2);
  const results = [];
  for (const [name, cmd] of steps) {
    process.stdout.write(`\n=== ${name} ===\n`);
    try {
      execSync(`${cmd} ${extra.join(' ')}`.trim(), { stdio: 'inherit' });
      results.push({ name, ok: true });
    } catch {
      results.push({ name, ok: false });
    }
  }
  process.stdout.write('\n=== verify:architecture summary ===\n');
  for (const r of results) {
    process.stdout.write(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}\n`);
  }
  process.exitCode = results.every((r) => r.ok) ? 0 : 1;
}

main();
