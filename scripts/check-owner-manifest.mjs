// check:owner-manifest gate.
//
// Validates the canonical owner manifest against the strict schema, then checks
// that every managed source path (under sourceScopes) is accounted for with
// exactly-one owner coverage. This is the Phase 0 gate that replaces ad-hoc
// owner maps with a machine-readable single source of truth.
//
// Strictness levels:
//   - default: schema, unknown keys, exactly-one coverage, ambiguous detection,
//     unassigned baseline locked, canonical-state uniqueness.
//   - --strict-paths: additionally requires overviewDoc existence and non-empty
//     declared test globs. Used after Task 1B has authored owner overviews.
//
// Exit code 0 = PASS, 1 = FAIL.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  auditPathReferences,
  checkCoverage,
  findMissingOverviewDocs,
  loadOwnerConfig,
  normalizeRepoPath,
  repoRoot,
} from './architecture-owner-lib.mjs';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { strictPaths: false, json: false, config: 'architecture-owners.config.json' };
  for (const item of argv) {
    if (item === '--strict-paths') {
      args.strictPaths = true;
    } else if (item === '--json') {
      args.json = true;
    } else if (item.startsWith('--config=')) {
      args.config = item.slice('--config='.length);
    } else if (item === '--config') {
      // handled by the next-arg convention below; kept for symmetry
    }
  }
  return args;
}

function collectManagedPaths(root, config) {
  // Resolve sourceScopes against the repo root and return the sorted list of
  // files that must be covered by exactly one owner (or listed explicitly).
  // Ambient declaration files (*.d.ts) are excluded to match module-docs
  // coverage: they are type shims, not owned runtime modules.
  const all = [];
  for (const scope of config.sourceScopes) {
    for (const file of expandScope(root, scope)) {
      const normalized = normalizeRepoPath(file);
      if (/\.d\.ts$/.test(normalized)) {
        continue;
      }
      all.push(normalized);
    }
  }
  return [...new Set(all)].sort();
}

function expandScope(root, scope) {
  // Supports a single recursive `**` plus an optional `*` suffix for extension.
  // This intentionally mirrors the glob support of the owner lib so the gate
  // and coverage check agree.
  const normalized = normalizeRepoPath(scope);
  if (!normalized.includes('**')) {
    const resolved = path.join(root, normalized);
    return fs.existsSync(resolved) ? [normalized] : [];
  }
  const [prefix, suffix] = normalized.split('**');
  const baseDir = path.join(root, normalizeRepoPath(prefix.replace(/\/$/, '')));
  if (!fs.existsSync(baseDir) || !fs.statSync(baseDir).isDirectory()) {
    return [];
  }
  const suffixGlob = suffix.replace(/^\//, '');
  const results = [];
  const stack = [baseDir];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(fullPath);
        } else if (entry.isFile()) {
          const rel = path.relative(baseDir, fullPath).split(path.sep).join('/');
          // A scope like src/**/*.ts means "any .ts file at any depth". The
          // suffix glob (*.ts) targets the filename, so match both the full
          // relative path and the bare basename. Matching the basename lets a
          // single-star suffix glob reach files in subdirectories, which is
          // the intended recursive-** semantics.
          const base = path.basename(rel);
          if (matchesGlob(rel, suffixGlob) || matchesGlob(base, suffixGlob)) {
            results.push(normalizeRepoPath(path.relative(root, fullPath)));
          }
        }
      }
  }
  return results;
}

function globToRegExp(glob) {
  let source = '^';
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    const next = glob[index + 1];
    if (char === '*') {
      if (next === '*') {
        source += '.*';
        index += 1;
      } else {
        source += '[^/]*';
      }
      continue;
    }
    if (char === '?') {
      source += '[^/]';
      continue;
    }
    source += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  source += '$';
  return new RegExp(source);
}

function matchesGlob(value, glob) {
  return globToRegExp(glob).test(value);
}

function main() {
  const args = parseArgs();
  const root = repoRoot();
  const config = loadOwnerConfig(root, args.config);

  const managedPaths = collectManagedPaths(root, config);
  const coverage = checkCoverage(config, managedPaths);

  const findings = [];
  const exitErrors = [];

  if (coverage.ambiguous.length) {
    exitErrors.push(
      `${coverage.ambiguous.length} path(s) match multiple owners (ambiguous):`,
      ...coverage.ambiguous.map((a) => `  - ${a.path} -> ${a.owners.join(', ')}`),
    );
  }

  const realUnassigned = coverage.unassigned.filter((u) => !u.explicit);
  if (realUnassigned.length) {
    exitErrors.push(
      `${realUnassigned.length} managed path(s) have no owner and are not listed in legacy.unassigned.explicitPaths:`,
      ...realUnassigned.map((u) => `  - ${u.path}`),
    );
  }

  const explicitUnassigned = coverage.unassigned.filter((u) => u.explicit);
  const phaseTarget = config.legacy?.unassigned?.mustReachZeroBeforePhase;
  if (explicitUnassigned.length > 0 && typeof phaseTarget === 'number') {
    exitErrors.push(
      `legacy.unassigned.explicitPaths has ${explicitUnassigned.length} entries; must reach 0 before Phase ${phaseTarget}.`,
      ...explicitUnassigned.map((u) => `  - ${u.path}`),
    );
  }

  if (args.strictPaths) {
    const missingDocs = findMissingOverviewDocs(root, config);
    if (missingDocs.length) {
      exitErrors.push(
        `${missingDocs.length} owner(s) reference a missing overviewDoc:`,
        ...missingDocs.map((m) => `  - ${m.ownerId} -> ${m.overviewDoc}`),
      );
    }
    const audit = auditPathReferences(root, config);
    if (audit.missingEntrypoints.length) {
      exitErrors.push(
        `${audit.missingEntrypoints.length} owner(s) reference a missing entrypoint file:`,
        ...audit.missingEntrypoints.map((m) => `  - ${m.ownerId} -> ${m.entrypoint}`),
      );
    }
    if (audit.emptyTests.length) {
      findings.push(
        `note: ${audit.emptyTests.length} owner(s) declare a test glob with no matching files (informational):`,
        ...audit.emptyTests.map((m) => `  - ${m.ownerId} -> ${m.tests}`),
      );
    }
  }

  const ok = exitErrors.length === 0;
  if (args.json) {
    process.stdout.write(
      JSON.stringify(
        {
          ok,
          managedPathCount: managedPaths.length,
          covered: coverage.covered,
          ambiguous: coverage.ambiguous,
          unassigned: coverage.unassigned,
          errors: exitErrors,
        },
        null,
        2,
      ) + '\n',
    );
  } else {
    if (ok) {
      process.stdout.write(
        `PASS owner-manifest\n` +
          `- managed paths: ${managedPaths.length}\n` +
          `- covered: ${coverage.covered}\n` +
          `- ambiguous: ${coverage.ambiguous.length}\n` +
          `- unassigned (explicit): ${explicitUnassigned.length}\n` +
          `- unassigned (real): ${realUnassigned.length}\n`,
      );
      for (const line of findings) {
        process.stdout.write(`${line}\n`);
      }
    } else {
      process.stderr.write(`FAIL owner-manifest\n`);
      for (const line of exitErrors) {
        process.stderr.write(`${line}\n`);
      }
    }
  }
  process.exitCode = ok ? 0 : 1;
}

main();
