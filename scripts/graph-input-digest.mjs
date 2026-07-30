// Graphify graph-input digest library (Phase 2 Task 7).
//
// Replaces the timestamp/mtime freshness check with a deterministic, content-
// addressed digest over the FULL graph-input envelope, not just src/** files.
// Per the plan, the input is:
//   - sorted repo-relative src path + file bytes (excluding transient
//     src/graphify-out)
//   - parsed tsconfig*.json extends chain
//   - package.json
//   - package-lock.json
//   - .gitignore
//   - .graphifyignore (if present)
//   - the Graphify wrapper script (scripts/update-graphify-src.mjs +
//     scripts/run-graphify-update.py)
//   - the actual Graphify tool version
//
// Byte digest is intentional: comment-only source changes conservatively
// require a refresh. Commit SHA, mtime and "Built from commit" are informational
// only and are NOT correctness signals.

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function toPosix(value) {
  return String(value).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/');
}

export function normalizeRepoPath(value) {
  return toPosix(value).replace(/^\/+/, '').replace(/\/$/, '');
}

function sha256Bytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

/**
 * Collect the deterministic graph-input records: { kind, key, sha256 }.
 * Each record contributes its (kind, key, sha256) to the final digest. The key
 * is a stable identifier (repo-relative path for files, logical name for
 * config/tool). Ordering is by (kind, key) so the digest is stable regardless
 * of filesystem walk order.
 */
export function collectGraphInputRecords(root, opts = {}) {
  const readFile = opts.readFile ?? ((p) => fs.readFileSync(p));
  const records = [];
  const seen = new Set();

  const addFile = (repoPath, kind) => {
    const normalized = normalizeRepoPath(repoPath);
    if (seen.has(`${kind}:${normalized}`)) return;
    let bytes;
    try {
      bytes = readFile(path.join(root, normalized));
    } catch {
      return; // missing optional file is simply absent from the envelope
    }
    seen.add(`${kind}:${normalized}`);
    records.push({ kind, key: normalized, sha256: sha256Bytes(bytes) });
  };

  // 1. src source files (excluding transient src/graphify-out and .d.ts stays
  //    in the envelope — comment changes must trigger refresh).
  const srcFiles = listSrcFiles(root);
  for (const f of srcFiles) {
    if (f.startsWith('src/graphify-out/')) continue;
    addFile(f, 'src');
  }

  // 2. tsconfig*.json extends chain (resolve via tsc --showConfig is heavy; we
  //    include all tsconfig*.json at repo root + the extends targets they
  //    reference). For Phase 2 we include all tsconfig*.json files found at root
  //    and referenced extends; a simpler correct approach: include every
  //    tsconfig*.json under the repo root.
  for (const tc of listTsconfigs(root)) {
    addFile(tc, 'tsconfig');
  }

  // 3. package.json + package-lock.json
  addFile('package.json', 'package');
  addFile('package-lock.json', 'package');

  // 4. ignore rules
  addFile('.gitignore', 'ignore');
  addFile('.graphifyignore', 'ignore');

  // 5. wrapper scripts
  addFile('scripts/update-graphify-src.mjs', 'wrapper');
  addFile('scripts/run-graphify-update.py', 'wrapper');

  // 6. Graphify tool version (resolved lazily by caller via opts.graphifyVersion)
  if (opts.graphifyVersion) {
    records.push({ kind: 'tool', key: 'graphify-version', sha256: sha256Bytes(opts.graphifyVersion) });
  }

  return records.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    return a.key.localeCompare(b.key);
  });
}

function listSrcFiles(root) {
  const out = execFileSync('git', ['ls-files', 'src/'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  if (!out) return [];
  return out.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map(normalizeRepoPath);
}

function listTsconfigs(root) {
  // Root-level tsconfig*.json + any nested ones that affect compilation.
  const out = execFileSync('git', ['ls-files', '*tsconfig*.json', '**/*tsconfig*.json'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  if (!out) return [];
  return out.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map(normalizeRepoPath);
}

/**
 * Compute the graph-input digest from collected records. Stable: same input
 * envelope => same digest, regardless of the order records were collected in.
 * Sorts internally so callers passing unsorted records still get a stable hash.
 */
export function computeGraphInputDigest(records) {
  const sorted = [...records].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    return a.key.localeCompare(b.key);
  });
  const serialized = sorted
    .map((r) => `${r.kind}\0${r.key}\0${r.sha256}`)
    .join('\n');
  return sha256Bytes(serialized);
}

/**
 * Build the input manifest: { schemaVersion, digest, records, generatedAt,
 * headSha }. Written to graphify-out/input-manifest.json by the update wrapper.
 */
export function buildInputManifest(root, { graphifyVersion, headSha } = {}) {
  const records = collectGraphInputRecords(root, { graphifyVersion });
  const digest = computeGraphInputDigest(records);
  return {
    schemaVersion: 1,
    digest,
    recordCount: records.length,
    records,
    generatedAt: new Date().toISOString(),
    headShaAtGeneration: headSha ?? null,
    graphifyVersion: graphifyVersion ?? null,
  };
}

/**
 * Compare a stored manifest digest against a freshly recomputed one. Returns
 * { fresh: true } when equal, { fresh: false, reason } otherwise.
 */
export function checkFreshness(root, storedManifest, { graphifyVersion } = {}) {
  if (!storedManifest || typeof storedManifest.digest !== 'string') {
    return { fresh: false, reason: 'stored manifest has no digest' };
  }
  const fresh = buildInputManifest(root, { graphifyVersion });
  if (fresh.digest === storedManifest.digest) {
    return { fresh: true, digest: fresh.digest };
  }
  return {
    fresh: false,
    reason: 'graph-input digest changed',
    stored: storedManifest.digest,
    current: fresh.digest,
    changedRecords: diffRecords(storedManifest.records ?? [], fresh.records),
  };
}

export function diffRecords(stored, current) {
  const storedMap = new Map(stored.map((r) => [`${r.kind}:${r.key}`, r]));
  const currentMap = new Map(current.map((r) => [`${r.kind}:${r.key}`, r]));
  const changed = [];
  for (const [mapKey, rec] of currentMap) {
    const old = storedMap.get(mapKey);
    if (!old) {
      changed.push({ kind: rec.kind, key: rec.key, change: 'added' });
    } else if (old.sha256 !== rec.sha256) {
      changed.push({ kind: rec.kind, key: rec.key, change: 'modified' });
    }
  }
  for (const [mapKey, rec] of storedMap) {
    if (!currentMap.has(mapKey)) {
      changed.push({ kind: rec.kind, key: rec.key, change: 'removed' });
    }
  }
  return changed.sort((a, b) => `${a.kind}:${a.key}`.localeCompare(`${b.kind}:${b.key}`));
}
