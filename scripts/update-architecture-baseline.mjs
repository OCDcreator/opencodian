// update-architecture-baseline — generate the frozen dependency baseline.
//
// This is the ONLY command that (re)generates architecture-baseline.generated.json.
// It must be run deliberately (e.g. after retiring an exception), never by an
// ordinary feature diff. The output is content-addressed and GENERATED; it must
// never be hand-edited. Manifest dependencyExceptions reference its edge/SCC ids.
//
// Usage: node scripts/update-architecture-baseline.mjs

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { buildImportGraph, generateBaseline, normalizeRepoPath } from './typescript-import-graph.mjs';
import { repoRoot } from './change-scope-lib.mjs';

function listSourceFiles(root) {
  const out = execFileSync('git', ['ls-files', 'src/**/*.ts', 'src/**/*.tsx'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  return out
    .split(/\r?\n/)
    .map(normalizeRepoPath)
    .filter((p) => p && !p.endsWith('.d.ts'));
}

async function main() {
  const root = repoRoot();
  const files = listSourceFiles(root);
  process.stdout.write(`Scanning ${files.length} source files for import edges...\n`);

  // buildImportGraph uses the filePath param as the 'from'. Pass repo-relative
  // paths so edges stay repo-relative; readFile receives the same string, so map
  // it to the absolute path on disk.
  const { edges, unresolved } = await buildImportGraph(files, {
    aliasPrefix: 'src',
    aliasTarget: '@',
    readFile: (repoPath) => fs.readFileSync(path.join(root, repoPath), 'utf8'),
  });

  const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const baseline = generateBaseline(edges, { headSha });

  if (unresolved.length) {
    process.stdout.write(`note: ${unresolved.length} dynamic/require specifier(s) could not be statically resolved and require exact manifest registration.\n`);
  }

  const outPath = path.join(root, 'architecture-baseline.generated.json');
  fs.writeFileSync(outPath, JSON.stringify(baseline, null, 2) + '\n');

  process.stdout.write(
    `Wrote ${normalizeRepoPath(path.relative(root, outPath))}\n` +
      `- edges: ${baseline.edges.length}\n` +
      `- runtime SCCs: ${baseline.runtimeSccs.length}\n` +
      `- type-only SCCs: ${baseline.typeOnlySccs.length}\n` +
      `- mixed SCCs: ${baseline.mixedSccs.length}\n` +
      `- generated at HEAD ${headSha.slice(0, 12)}\n`,
  );
  process.stdout.write(`This file is GENERATED. Do not hand-edit. Manifest exceptions reference its edge/SCC ids.\n`);
}

main().catch((error) => {
  process.stderr.write(`FAIL update-architecture-baseline: ${error.message}\n`);
  process.exitCode = 1;
});
