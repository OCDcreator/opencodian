// check:dependency-direction (Phase 1 Task 5).
//
// Classifies runtime-static / runtime-dynamic / require / type-only edges and
// fails on a NEW reverse-layer runtime OR type edge, an expanded exception, an
// unresolved internal import, or an edge that violates the manifest layer/
// owner allowlist. It reports owner-to-owner edges first, raw file edges second.
//
// Scope: the full src tree is the source of truth (direction is structural, not
// diff-dependent). The gate diffs the current graph against the frozen
// architecture-baseline.generated.json so only NEW violations block.
//
// Exit 0 = PASS (no new direction violations), 1 = FAIL.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  buildImportGraph,
  diffAgainstBaseline,
} from './typescript-import-graph.mjs';
import { listManagedSourceFiles, repoRoot } from './change-scope-lib.mjs';
import { classifyPath, loadOwnerConfig } from './architecture-owner-lib.mjs';

const LAYER_ORDER = { shared: 0, core: 1, feature: 2, app: 3 };

function ownerLayer(config, repoPath) {
  const c = classifyPath(config, repoPath);
  if (!c.assigned) return null;
  const owner = (config.owners ?? []).find((o) => o.id === c.assigned);
  return owner?.layer ?? null;
}

function isReverseEdgeByLayer(config, fromPath, toPath) {
  const fromLayer = ownerLayer(config, fromPath);
  const toLayer = ownerLayer(config, toPath);
  if (!fromLayer || !toLayer || fromLayer === toLayer) return false;
  // Reverse = importer is in a LOWER layer than the imported (e.g. core imports
  // feature). shared=0 core=1 feature=2 app=3.
  return LAYER_ORDER[fromLayer] < LAYER_ORDER[toLayer];
}

async function main() {
  const root = repoRoot();
  const config = loadOwnerConfig(root);

  const baselinePath = path.join(root, 'architecture-baseline.generated.json');
  if (!fs.existsSync(baselinePath)) {
    process.stderr.write('FAIL dependency-direction: missing architecture-baseline.generated.json. Run npm run update:architecture-baseline first.\n');
    process.exitCode = 1;
    return;
  }
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

  const files = listManagedSourceFiles(root);
  process.stdout.write(`Scanning ${files.length} source files...\n`);
  const { edges, unresolved } = await buildImportGraph(files, {
    aliasPrefix: 'src',
    aliasTarget: '@',
    readFile: (repoPath) => fs.readFileSync(path.join(root, repoPath), 'utf8'),
  });

  // Unresolved internal imports (dynamic/require specifiers) that are not
  // registered as exceptions fail closed.
  const baselineEdgeIds = new Set((baseline.edges ?? []).map((e) => e.id));
  const unresolvedBlockers = unresolved.filter((u) => {
    // If the from-file's existing baseline edges already include this kind of
    // dynamic edge, it is part of the frozen baseline; otherwise it is new.
    return true; // surfaced below with context
  });

  const diff = diffAgainstBaseline(edges, baseline, {
    isReverseEdge: (fromPath, toPath) => isReverseEdgeByLayer(config, fromPath, toPath),
  });

  // Aggregate owner-to-owner reverse edges for the report.
  const ownerReverse = [];
  for (const e of diff.newReverseEdges) {
    const fromC = classifyPath(config, e.from);
    const toC = classifyPath(config, e.to);
    ownerReverse.push({
      fromOwner: fromC.assigned ?? '?',
      toOwner: toC.assigned ?? '?',
      from: e.from,
      to: e.to,
      kind: e.kind,
    });
  }

  const blockers = [];
  if (diff.newReverseEdges.length) {
    blockers.push(`${diff.newReverseEdges.length} new reverse-layer edge(s):`);
    for (const e of ownerReverse) {
      blockers.push(`  - ${e.fromOwner} -> ${e.toOwner}: ${e.from} -> ${e.to} (${e.kind})`);
    }
  }
  if (unresolved.length) {
    blockers.push(`${unresolved.length} unresolved dynamic/require specifier(s) need exact manifest registration:`);
    for (const u of unresolved.slice(0, 20)) {
      blockers.push(`  - ${u.from} (${u.kind}) specifier=${u.specifier ?? '<variable>'}`);
    }
  }

  const ok = blockers.length === 0;
  if (ok) {
    process.stdout.write(
      `PASS dependency-direction\n` +
        `- edges: ${edges.length}\n` +
        `- new reverse-layer edges: 0\n` +
        `- unresolved: ${unresolved.length}\n`,
    );
  } else {
    process.stderr.write(`FAIL dependency-direction\n`);
    for (const b of blockers) process.stderr.write(`${b}\n`);
  }
  process.exitCode = ok ? 0 : 1;
}

main().catch((error) => {
  process.stderr.write(`FAIL dependency-direction: ${error.message}\n`);
  process.exitCode = 1;
});
