// check:module-doc-owner-impact (Phase 2 Task 8).
//
// Derives the affected owner overview (from architecture-owners.config.json)
// and the mapped module docs (from module-docs.config.json) for changed source
// paths in the unified scope, and fails when an owner boundary changes without
// a matching owner-overview or mapped-doc update.
//
// This does NOT duplicate the mapped-doc glob in the manifest: it composes the
// owner manifest (owner-level overviewDoc) with module-docs.config.json
// (source -> mapped-doc). The module-doc config remains the sole owner of the
// source -> mapped-doc relationship.
//
// Scope source: VERIFY_SCOPE_ARTIFACT > --base > --diff (legacy).
//
// Exit 0 = PASS, 1 = FAIL (owner boundary changed without doc updates).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { classifyPath, loadOwnerConfig, normalizeRepoPath } from './architecture-owner-lib.mjs';
import {
  findGroupForSource,
  loadConfig as loadModuleDocConfig,
  mapSourceToDoc,
} from './module-doc-guard-lib.mjs';
import { computeChangeScope, resolveBaseRef, repoRoot } from './change-scope-lib.mjs';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { base: null, diff: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--base') args.base = argv[++i];
    else if (argv[i].startsWith('--base=')) args.base = argv[i].slice(7);
    else if (argv[i] === '--diff') args.diff = argv[++i];
    else if (argv[i].startsWith('--diff=')) args.diff = argv[i].slice(7);
  }
  return args;
}

function readChangedSourcePaths(root, args) {
  // Prefer the unified scope artifact; fall back to --base (computeChangeScope)
  // then --diff (raw git range).
  if (process.env.VERIFY_SCOPE_ARTIFACT && fs.existsSync(process.env.VERIFY_SCOPE_ARTIFACT)) {
    const scope = JSON.parse(fs.readFileSync(process.env.VERIFY_SCOPE_ARTIFACT, 'utf8'));
    return [...new Set([...scope.candidates.committed, ...scope.candidates.index, ...scope.candidates.workspace].map((r) => r.path))];
  }
  if (args.diff) {
    const out = execFileSync('git', ['diff', '--name-only', '--find-renames', args.diff], { cwd: root, encoding: 'utf8' }).trim();
    return out ? out.split(/\r?\n/).map(normalizeRepoPath) : [];
  }
  const baseResolution = resolveBaseRef(root, { explicit: args.base });
  if (!baseResolution.ref) {
    throw new Error(`Cannot resolve base ref: ${baseResolution.error}`);
  }
  const scope = computeChangeScope(root, { baseRef: baseResolution.ref });
  return scope.paths;
}

function main() {
  const args = parseArgs();
  const root = repoRoot();
  const ownerConfig = loadOwnerConfig(root);
  const moduleDocConfig = loadModuleDocConfig(root);

  const changedPaths = readChangedSourcePaths(root, args);
  const changedSet = new Set(changedPaths.map(normalizeRepoPath));

  // Group changed paths by owner; collect required owner-overview and mapped-doc
  // updates.
  const ownerToSources = new Map();
  const requiredOverviewDocs = new Set();
  const requiredMappedDocs = new Set();

  for (const p of changedSet) {
    if (!p.startsWith('src/') || !/\.(ts|tsx)$/.test(p)) continue;
    const classification = classifyPath(ownerConfig, p);
    if (!classification.assigned) continue;
    const owner = (ownerConfig.owners ?? []).find((o) => o.id === classification.assigned);
    if (!owner) continue;
    if (!ownerToSources.has(owner.id)) ownerToSources.set(owner.id, []);
    ownerToSources.get(owner.id).push(p);

    if (owner.overviewDoc) {
      requiredOverviewDocs.add(normalizeRepoPath(owner.overviewDoc));
    }
    const group = findGroupForSource(moduleDocConfig, p);
    if (group) {
      requiredMappedDocs.add(normalizeRepoPath(mapSourceToDoc(group, p)));
    }
  }

  // Owner-boundary change via manifest only (no src change): if
  // architecture-owners.config.json itself changed, every owner overviewDoc
  // must be touched (a boundary change affects the owner model narrative).
  // This closes the gap where a manifest-only boundary edit would PASS with an
  // empty changed-src set.
  const manifestChanged = changedSet.has('architecture-owners.config.json');
  if (manifestChanged) {
    for (const owner of ownerConfig.owners ?? []) {
      if (owner.overviewDoc) {
        requiredOverviewDocs.add(normalizeRepoPath(owner.overviewDoc));
      }
    }
  }

  // An owner boundary change is signaled when the manifest itself changed OR a
  // path moved owners. For Phase 2 we treat any changed source path under an
  // owner as requiring its overview + mapped doc to be touched (diff-
  // accountability), matching the existing module-doc accountability model but
  // now also covering the owner overview.
  const missingOverview = [...requiredOverviewDocs].filter((doc) => !changedSet.has(doc));
  const missingMapped = [...requiredMappedDocs].filter((doc) => !changedSet.has(doc));

  if (missingOverview.length || missingMapped.length) {
    process.stderr.write('FAIL module-doc-owner-impact\n');
    if (missingOverview.length) {
      process.stderr.write(`- owner overview not updated for changed owners (${missingOverview.length}):\n`);
      for (const d of missingOverview) process.stderr.write(`    - ${d}\n`);
    }
    if (missingMapped.length) {
      process.stderr.write(`- mapped module doc not updated (${missingMapped.length}):\n`);
      for (const d of missingMapped) process.stderr.write(`    - ${d}\n`);
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `PASS module-doc-owner-impact\n` +
      `- changed source paths: ${[...changedSet].filter((p) => p.startsWith('src/')).length}\n` +
      `- affected owners: ${ownerToSources.size}\n` +
      `- required overview docs: ${requiredOverviewDocs.size}\n` +
      `- required mapped docs: ${requiredMappedDocs.size}\n`,
  );
}

main();
