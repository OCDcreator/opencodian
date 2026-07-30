// check:architecture-cycles (Phase 1 Task 5).
//
// Detects cycles SEPARATELY by kind:
//   - runtime SCCs (pure runtime-static/dynamic/require cycles): HARD BLOCKER.
//     Any new runtime SCC fails. Baseline runtime SCCs (currently 0) are the
//     frozen debt; new ones are non-waivable.
//   - type-only / mixed SCCs (type coupling debt): reported, NOT described as
//     runtime cycles. New MEMBERS in a baseline type-coupling SCC fail, but the
//     SCCs themselves are allowed as debt.
//
// This gate never reports a type-only/mixed SCC as a runtime cycle (the bug in
// Graphify's collapsed-edge view that this phase fixes).
//
// Exit 0 = PASS (no new runtime SCC, no new type-coupling member), 1 = FAIL.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  buildImportGraph,
  classifySccs,
  diffAgainstBaseline,
  sccId,
} from './typescript-import-graph.mjs';
import { listManagedSourceFiles, repoRoot } from './change-scope-lib.mjs';

async function main() {
  const root = repoRoot();
  const baselinePath = path.join(root, 'architecture-baseline.generated.json');
  if (!fs.existsSync(baselinePath)) {
    process.stderr.write('FAIL architecture-cycles: missing architecture-baseline.generated.json. Run npm run update:architecture-baseline first.\n');
    process.exitCode = 1;
    return;
  }
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

  const files = listManagedSourceFiles(root);
  process.stdout.write(`Scanning ${files.length} source files...\n`);
  const { edges } = await buildImportGraph(files, {
    aliasPrefix: 'src',
    aliasTarget: '@',
    readFile: (repoPath) => fs.readFileSync(path.join(root, repoPath), 'utf8'),
  });

  const current = classifySccs(edges);
  const diff = diffAgainstBaseline(edges, baseline);

  const blockers = [];

  // New runtime SCC = non-waivable hard blocker.
  if (diff.newRuntimeSccs.length) {
    blockers.push(`${diff.newRuntimeSccs.length} NEW runtime SCC(s) — non-waivable:`);
    for (const scc of diff.newRuntimeSccs) {
      blockers.push(`  - ${sccId(scc)}`);
    }
  }

  // New member in a baseline type-coupling SCC = blocker (debt must not grow).
  if (diff.newTypeCouplingMembers.length) {
    blockers.push(`${diff.newTypeCouplingMembers.length} type-coupling SCC(s) gained new members:`);
    for (const m of diff.newTypeCouplingMembers) {
      blockers.push(`  - current: ${sccId(m.current)}`);
      blockers.push(`    baseline: ${sccId(m.baseline)}`);
    }
  }

  const ok = blockers.length === 0;
  if (ok) {
    process.stdout.write(
      `PASS architecture-cycles\n` +
        `- runtime SCCs: ${current.runtimeSccs.length} (baseline ${baseline.runtimeSccs?.length ?? 0})\n` +
        `- type-only SCCs: ${current.typeOnlySccs.length} (debt, baseline ${baseline.typeOnlySccs?.length ?? 0})\n` +
        `- mixed SCCs: ${current.mixedSccs.length} (debt, baseline ${baseline.mixedSccs?.length ?? 0})\n` +
        `- new runtime SCCs: 0\n` +
        `- new type-coupling members: 0\n`,
    );
  } else {
    process.stderr.write(`FAIL architecture-cycles\n`);
    for (const b of blockers) process.stderr.write(`${b}\n`);
    process.stderr.write(`note: type-only/mixed SCCs are debt, NOT runtime cycles.\n`);
  }
  process.exitCode = ok ? 0 : 1;
}

main().catch((error) => {
  process.stderr.write(`FAIL architecture-cycles: ${error.message}\n`);
  process.exitCode = 1;
});
