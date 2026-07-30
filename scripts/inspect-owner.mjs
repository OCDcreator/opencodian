// inspect:owner — agent navigation command.
//
// Resolves a path or symbol to its architecture owner and prints an actionable
// summary: responsibility, canonical state, entrypoints, allowed/forbidden
// dependencies, adjacent owners, tests, owner overview doc, mapped module doc
// (derived from module-docs.config.json), risk, active exceptions and required
// gates.
//
// Usage:
//   npm run inspect:owner -- <path|symbol> [--json] [--explain]
//
// The inspector never duplicates owner facts into a second truth source; it
// composes the canonical owner manifest with the module-doc path mapping. For a
// symbol query that does not match an owner entrypoint directly, it shells out
// to CodeGraph query (if available) to resolve the symbol's file, then resolves
// that file's owner.

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

import {
  classifyPath,
  defaultMayImportLayers,
  loadOwnerConfig,
  normalizeRepoPath,
  resolveOwner,
  repoRoot,
} from './architecture-owner-lib.mjs';
import {
  collectSourceMappings,
  findGroupForSource,
  loadConfig,
  mapSourceToDoc,
} from './module-doc-guard-lib.mjs';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { json: false, explain: false, query: null, config: 'architecture-owners.config.json' };
  const positional = [];
  for (const item of argv) {
    if (item === '--json') {
      args.json = true;
    } else if (item === '--explain') {
      args.explain = true;
    } else if (item.startsWith('--config=')) {
      args.config = item.slice('--config='.length);
    } else if (!item.startsWith('--')) {
      positional.push(item);
    }
  }
  args.query = positional[0] ?? null;
  return args;
}

function resolveSymbolFile(root, symbol) {
  // Best-effort: use CodeGraph query if the binary is available. Returns the
  // first file path from the JSON output, or null.
  try {
    const bin = path.join(root, 'node_modules', '.bin', 'codegraph');
    const output = execFileSync(bin, ['query', symbol, '--json'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const parsed = JSON.parse(output);
    const first = Array.isArray(parsed) ? parsed[0] : parsed?.results?.[0] ?? parsed?.result?.[0];
    const file = first?.file ?? first?.filePath ?? first?.path;
    return file ? normalizeRepoPath(file) : null;
  } catch {
    return null;
  }
}

function buildSummary(root, ownerConfig, moduleDocConfig, query) {
  // 1. Try direct owner resolution by id/path/entrypoint.
  let owner = resolveOwner(ownerConfig, query);
  let resolvedPath = null;
  let symbolUsed = false;

  // 2. If still unresolved and the query looks like a symbol (no path
  //    separators, no extension), try CodeGraph to find its file.
  if (!owner && !/[/.]/.test(query)) {
    const file = resolveSymbolFile(root, query);
    if (file) {
      symbolUsed = true;
      resolvedPath = file;
      owner = resolveOwner(ownerConfig, file);
    }
  } else if (owner && !owner.include?.length) {
    // Reference-only owner: note that it owns no paths.
  } else if (/\.(ts|tsx)$/.test(query) || query.includes('/')) {
    resolvedPath = normalizeRepoPath(query);
  }

  if (!owner) {
    return {
      query,
      resolved: false,
      reason: 'No owner matched the query by id, path or entrypoint symbol, and CodeGraph resolution did not find a file.',
    };
  }

  // Derive mapped module doc from module-docs.config.json for the resolved path.
  let mappedDoc = null;
  if (resolvedPath) {
    const group = findGroupForSource(moduleDocConfig, resolvedPath);
    if (group) {
      mappedDoc = mapSourceToDoc(group, resolvedPath);
    }
  }

  // Active (non-expired) exceptions referencing this owner's allowed owners.
  const now = Date.now();
  const activeExceptions = (ownerConfig.dependencyExceptions ?? []).filter((exception) => {
    if (!exception.expiresAt) {
      return true;
    }
    return Date.parse(exception.expiresAt) >= now;
  });

  const layer = owner.layer;
  const mayImportLayers = ownerConfig.layers?.find((l) => l.id === layer)?.mayImportLayers
    ?? defaultMayImportLayers(layer);

  return {
    query,
    resolved: true,
    symbolResolutionUsed: symbolUsed || null,
    resolvedPath,
    owner: {
      id: owner.id,
      layer,
      mayImportLayers,
      responsibilities: owner.responsibilities ?? [],
      canonicalState: owner.canonicalState ?? [],
      entrypoints: owner.entrypoints ?? [],
      allowedOwnerDependencies: owner.allowedOwnerDependencies ?? [],
      forbiddenDependencies: owner.forbiddenDependencies ?? [],
      adjacentOwners: owner.adjacentOwners ?? [],
      tests: owner.tests ?? [],
      overviewDoc: owner.overviewDoc ?? null,
      mappedModuleDoc: mappedDoc,
      risk: owner.risk ?? null,
      requiredGates: owner.requiredGates ?? [],
      activeExceptions: activeExceptions.map((e) => ({
        id: e.id,
        ruleId: e.ruleId,
        retirementPhase: e.retirementPhase,
        expiresAt: e.expiresAt,
      })),
    },
  };
}

function formatHuman(summary, explain) {
  if (!summary.resolved) {
    return `No owner resolved for "${summary.query}".\n${summary.reason}\n`;
  }
  const o = summary.owner;
  const lines = [];
  lines.push(`Owner: ${o.id}  (layer: ${o.layer})`);
  if (summary.resolvedPath) {
    lines.push(`Resolved path: ${summary.resolvedPath}`);
  }
  if (summary.symbolResolutionUsed) {
    lines.push(`Symbol "${summary.query}" resolved via CodeGraph to ${summary.resolvedPath}.`);
  }
  lines.push('');
  lines.push('Responsibilities:');
  for (const r of o.responsibilities) {
    lines.push(`  - ${r}`);
  }
  if (o.canonicalState.length) {
    lines.push('');
    lines.push('Canonical state (truth home):');
    for (const s of o.canonicalState) {
      lines.push(`  - ${s}`);
    }
  }
  if (o.entrypoints.length) {
    lines.push('');
    lines.push('Entrypoints:');
    for (const e of o.entrypoints) {
      lines.push(`  - ${e}`);
    }
  }
  lines.push('');
  lines.push(`Allowed to import layers: ${o.mayImportLayers.join(', ')}`);
  if (o.allowedOwnerDependencies.length) {
    lines.push(`Allowed owner dependencies: ${o.allowedOwnerDependencies.join(', ')}`);
  }
  if (o.forbiddenDependencies.length) {
    lines.push(`Forbidden dependencies: ${o.forbiddenDependencies.join(', ')}`);
  }
  if (o.adjacentOwners.length) {
    lines.push(`Adjacent owners (prefer editing these instead when out of scope): ${o.adjacentOwners.join(', ')}`);
  }
  if (o.tests.length) {
    lines.push('');
    lines.push('Focused tests:');
    for (const t of o.tests) {
      lines.push(`  - ${t}`);
    }
  }
  lines.push('');
  lines.push('Navigation:');
  if (o.overviewDoc) {
    lines.push(`  - owner overview: ${o.overviewDoc}`);
  }
  if (o.mappedModuleDoc) {
    lines.push(`  - mapped module doc: ${o.mappedModuleDoc}`);
  }
  if (o.requiredGates.length) {
    lines.push(`  - required gates: ${o.requiredGates.join(', ')}`);
  }
  if (o.activeExceptions.length) {
    lines.push('');
    lines.push('Active dependency exceptions:');
    for (const e of o.activeExceptions) {
      lines.push(`  - ${e.id} (${e.ruleId}, retire ${e.retirementPhase}, expires ${e.expiresAt})`);
    }
  }
  if (explain) {
    lines.push('');
    lines.push('How to decide ownership:');
    lines.push('  1. Check if the path is inside this owner\'s include globs.');
    lines.push('  2. If a new behavior, confirm it fits one responsibility above.');
    lines.push('  3. If not, check adjacent owners before adding a new module.');
    lines.push('  4. Update module docs and run required gates after changes.');
  }
  return `${lines.join('\n')}\n`;
}

function main() {
  const args = parseArgs();
  if (!args.query) {
    process.stderr.write(
      'Usage: npm run inspect:owner -- <path|symbol> [--json] [--explain]\n',
    );
    process.exitCode = 2;
    return;
  }
  const root = repoRoot();
  const ownerConfig = loadOwnerConfig(root, args.config);
  let moduleDocConfig;
  try {
    moduleDocConfig = loadConfig(root);
  } catch {
    // Module-doc config is optional for the inspector; absence is not fatal.
    moduleDocConfig = { groups: [] };
  }
  const summary = buildSummary(root, ownerConfig, moduleDocConfig, args.query);
  if (args.json) {
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  } else {
    process.stdout.write(formatHuman(summary, args.explain));
  }
  process.exitCode = summary.resolved ? 0 : 1;
}

main();
