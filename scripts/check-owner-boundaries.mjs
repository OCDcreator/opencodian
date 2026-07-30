// check:owner-boundaries gate (Phase 1 Task 4).
//
// Evaluates changed owners against the canonical manifest, replacing the legacy
// hard-coded four-file path guard and its net-line-count heuristic.
//
// Evaluation rules (from the plan):
//   PASS when changes stay inside declared owner responsibilities, even if a
//   shell grew in LOC for legitimate composition wiring.
//
//   FAIL when a changed path is ambiguous/unowned (not legacy-unassigned), or
//   when canonical state appears duplicated.
//
//   HINT (not block) when a thin-layer style filename is touched, unless it is
//   a consumer-owned type-only port that removes the full plugin/main dep.
//
// This gate never passes/fails on added/removed line count alone. The
// 'maintainability-refactor' net-line requirement is removed from active
// semantics.
//
// Scope source (in priority order):
//   1. VERIFY_SCOPE_ARTIFACT env (JSON from run-verify)
//   2. --base <ref> (computes scope via change-scope-lib)
//   3. --diff <range> (raw git range, legacy compatibility)
//
// Exit code 0 = PASS, 1 = FAIL (blockers present).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  evaluateOwnerBoundaries,
  collectThinLayerHints,
  loadOwnerConfig,
  normalizeRepoPath,
  repoRoot,
} from './architecture-owner-lib.mjs';
import { computeChangeScope, resolveBaseRef } from './change-scope-lib.mjs';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { base: null, diff: null, scopeArtifact: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === '--base') {
      args.base = argv[++i];
    } else if (item.startsWith('--base=')) {
      args.base = item.slice('--base='.length);
    } else if (item === '--diff') {
      args.diff = argv[++i];
    } else if (item.startsWith('--diff=')) {
      args.diff = item.slice('--diff='.length);
    } else if (item === '--json') {
      args.json = true;
    }
  }
  args.scopeArtifact = process.env.VERIFY_SCOPE_ARTIFACT ?? null;
  return args;
}

function readAddedLines(root, rangeOrSha, repoPath) {
  // Extract added code lines from a single file's diff for the canonical-state
  // duplication heuristic. rangeOrSha is either "A..B" or a single sha (for
  // workspace, we diff against the file on disk).
  try {
    const out = execFileSync('git', ['diff', '--unified=0', rangeOrSha, '--', repoPath], {
      cwd: root,
      encoding: 'utf8',
    });
    return out
      .split(/\r?\n/)
      .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
      .map((line) => line.slice(1));
  } catch {
    return [];
  }
}

function main() {
  const args = parseArgs();
  const root = repoRoot();
  const config = loadOwnerConfig(root);

  let candidatePaths = []; // array of { path, status }
  let addedByPath = {}; // path -> added lines

  if (args.scopeArtifact && fs.existsSync(args.scopeArtifact)) {
    const scope = JSON.parse(fs.readFileSync(args.scopeArtifact, 'utf8'));
    // Use the committed candidate as the primary view; index/workspace are also
    // surfaced so a staged-only change is not hidden. For boundary evaluation
    // we union the paths but dedupe, preferring committed > index > workspace.
    const seen = new Map();
    for (const r of scope.candidates.committed) seen.set(r.path, r);
    for (const r of scope.candidates.index) if (!seen.has(r.path)) seen.set(r.path, r);
    for (const r of scope.candidates.workspace) if (!seen.has(r.path)) seen.set(r.path, r);
    candidatePaths = [...seen.values()];
    // Added lines: from the committed diff range (merge-base..head).
    for (const r of candidatePaths) {
      addedByPath[r.path] = readAddedLines(root, `${scope.mergeBaseSha}..${scope.headSha}`, r.path);
    }
  } else if (args.diff) {
    const out = execFileSync('git', ['diff', '--name-status', '--find-renames', args.diff], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
    candidatePaths = out
      ? out.split(/\r?\n/).map((line) => {
          const parts = line.split('\t');
          const status = parts[0];
          if (status.startsWith('R') || status.startsWith('C')) {
            return [{ path: normalizeRepoPath(parts[1]), status: 'D' }, { path: normalizeRepoPath(parts[2]), status: 'A' }];
          }
          return { path: normalizeRepoPath(parts[1]), status: status[0] };
        }).flat()
      : [];
    for (const r of candidatePaths) {
      addedByPath[r.path] = readAddedLines(root, args.diff, r.path);
    }
  } else {
    // Resolve scope from --base or fail closed.
    const baseResolution = resolveBaseRef(root, { explicit: args.base });
    if (!baseResolution.ref) {
      process.stderr.write(`FAIL owner-boundaries: ${baseResolution.error}\n`);
      process.exitCode = 1;
      return;
    }
    const scope = computeChangeScope(root, { baseRef: baseResolution.ref });
    const seen = new Map();
    for (const r of scope.candidates.committed) seen.set(r.path, r);
    for (const r of scope.candidates.index) if (!seen.has(r.path)) seen.set(r.path, r);
    for (const r of scope.candidates.workspace) if (!seen.has(r.path)) seen.set(r.path, r);
    candidatePaths = [...seen.values()];
    for (const r of candidatePaths) {
      addedByPath[r.path] = readAddedLines(root, `${scope.mergeBaseSha}..${scope.headSha}`, r.path);
    }
  }

  // Only evaluate paths under managed source scopes; skip docs/scripts/tests.
  const managed = candidatePaths.filter((r) => r.path.startsWith('src/') && /\.(ts|tsx)$/.test(r.path));

  const diffs = managed.map((r) => ({
    path: r.path,
    status: r.status,
    added: addedByPath[r.path] ?? [],
  }));

  const result = evaluateOwnerBoundaries(config, diffs);
  const thinLayerHints = collectThinLayerHints(diffs);

  const ok = result.ok;
  if (args.json) {
    process.stdout.write(JSON.stringify({ ok, blockers: result.blockers, hints: result.hints, thinLayerHints, touchedOwners: result.touchedOwners }, null, 2) + '\n');
  } else if (ok) {
    process.stdout.write(
      `PASS owner-boundaries\n` +
        `- evaluated managed paths: ${managed.length}\n` +
        `- touched owners: ${result.touchedOwners.join(', ') || 'none'}\n`,
    );
    for (const h of [...result.hints, ...thinLayerHints.map((t) => `${t.path}: ${t.reason}`)]) {
      process.stdout.write(`- review hint: ${h}\n`);
    }
  } else {
    process.stderr.write(`FAIL owner-boundaries\n`);
    for (const b of result.blockers) {
      process.stderr.write(`- ${b}\n`);
    }
  }
  process.exitCode = ok ? 0 : 1;
}

main();
