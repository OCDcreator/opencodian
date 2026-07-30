// check:graphify freshness — content-addressed (Phase 2 Task 7).
//
// Replaces the timestamp/mtime comparison with a deterministic graph-input
// digest check. The committed graphify-out/input-manifest.json records the
// digest of the exact source/config/tool envelope the artifacts were built
// from. This gate recomputes the current envelope digest and requires equality.
//
// Commit timestamp, mtime and "Built from commit" are NO LONGER correctness
// signals (they were unreliable: the report could carry a stale commit SHA
// while the source tree had advanced).
//
// Byte digest is intentional: comment-only source changes conservatively
// require a refresh.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { buildInputManifest, checkFreshness } from './graph-input-digest.mjs';

const repoRoot = process.cwd();
const manifestPath = join(repoRoot, 'graphify-out', 'input-manifest.json');
const artifactPaths = ['graphify-out/GRAPH_REPORT.md', 'graphify-out/graph.json'];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function resolveGraphifyVersion() {
  // Use the same interpreter resolution as the wrapper (repo venv first).
  const localVenvPython = join(repoRoot, '.graphify-venv', 'bin', 'python3');
  const interpreters = [localVenvPython, 'python3', 'python'];
  const argSets = [
    ['-m', 'graphify', '--version'],
    ['-c', 'import graphify; print(getattr(graphify, "__version__", ""))'],
    ['-c', 'import importlib.metadata as m; print(m.version("graphifyy"))'],
  ];
  for (const py of interpreters) {
    for (const args of argSets) {
      try {
        const probe = spawnSync(py, args, { cwd: repoRoot, encoding: 'utf8' });
        if (probe.status === 0) {
          const version = probe.stdout.trim();
          if (version && version !== 'unknown') {
            return version;
          }
        }
      } catch {
        // try next
      }
    }
  }
  return 'unknown';
}

// Require the artifacts and the manifest to exist.
for (const rel of artifactPaths) {
  if (!existsSync(join(repoRoot, rel))) {
    fail(`Missing graphify artifact: ${rel}`);
  }
}
if (!existsSync(manifestPath)) {
  fail([
    'graphify-out/input-manifest.json is missing.',
    '',
    'The freshness gate is content-addressed and requires the manifest written by',
    '`npm run graphify:update:src`. Run the update to regenerate artifacts + manifest.',
  ].join('\n'));
}

let storedManifest;
try {
  storedManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (error) {
  fail(`graphify-out/input-manifest.json is not valid JSON: ${error.message}`);
}

const result = checkFreshness(repoRoot, storedManifest, {
  graphifyVersion: resolveGraphifyVersion(),
});

if (!result.fresh) {
  const changed = (result.changedRecords ?? []).slice(0, 20);
  fail([
    `graphify-out is stale: ${result.reason}`,
    '',
    `stored digest:   ${result.stored ?? storedManifest.digest}`,
    `current digest:  ${result.current}`,
    changed.length ? '' : '',
    ...changed.map((c) => `  - ${c.change}: ${c.kind}:${c.key}`),
    changed.length === 20 ? '  ... (truncated)' : '',
    '',
    'Run: npm run graphify:update:src',
  ].filter((line, i, arr) => !(line === '' && arr[i - 1] === '')).join('\n'));
}

console.log('graphify freshness ok.');
console.log(`- content digest: ${result.digest}`);
