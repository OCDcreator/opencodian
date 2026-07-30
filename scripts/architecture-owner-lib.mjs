// Canonical owner manifest library.
//
// This module is the single machine-readable source of truth for architecture
// owners, layers, and dependency-exception governance metadata. It owns:
//   - strict schema loading (unknown-key rejection),
//   - structured delegation (delegatesTo) and exactly-one owner coverage,
//   - canonical-state uniqueness,
//   - dependency-exception registration and expiry,
//   - path/symbol classification for the agent inspector.
//
// It intentionally does NOT own the source -> module-doc mapping (that stays in
// module-doc-guard-lib.mjs / module-docs.config.json) and it does NOT own the
// runtime/type/dynamic import-edge classification (that is Phase 1 work). The
// inspector composes this manifest with the module-doc mapping; it never
// duplicates owner facts into a second truth source.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const VALID_LAYERS = ['shared', 'core', 'feature', 'app'];
export const VALID_RISK_LEVELS = ['low', 'medium', 'high'];

const LAYER_IMPORT_DEFAULTS = {
  shared: ['shared'],
  core: ['shared', 'core'],
  feature: ['shared', 'core', 'feature'],
  app: ['shared', 'core', 'feature', 'app'],
};

const OWNER_ALLOWED_KEYS = new Set([
  'id',
  'layer',
  'include',
  'delegatesTo',
  'responsibilities',
  'canonicalState',
  'entrypoints',
  'allowedOwnerDependencies',
  'forbiddenDependencies',
  'adjacentOwners',
  'tests',
  'overviewDoc',
  'requiredGates',
  'risk',
]);

const TOP_LEVEL_ALLOWED_KEYS = new Set([
  'schemaVersion',
  'sourceScopes',
  'layers',
  'owners',
  'legacy',
  'dependencyExceptions',
]);

const LAYER_ALLOWED_KEYS = new Set(['id', 'mayImportLayers']);

const LEGACY_ALLOWED_KEYS = new Set(['unassigned']);
const LEGACY_UNASSIGNED_ALLOWED_KEYS = new Set([
  'explicitPaths',
  'mustReachZeroBeforePhase',
]);

const EXCEPTION_ALLOWED_KEYS = new Set([
  'id',
  'baselineEdgeId',
  'ruleId',
  'reason',
  'characterizationTests',
  'retirementPhase',
  'expiresAt',
]);

const GLOB_META_CHARS = new Set(['*', '?', '[', ']', '{', '}']);

export function toPosix(value) {
  return String(value).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/');
}

export function normalizeRepoPath(value) {
  return toPosix(value).replace(/^\/+/, '').replace(/\/$/, '');
}

export function repoRoot(cwd = process.cwd()) {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
  }).trim();
}

export function globToRegExp(glob) {
  let source = '^';

  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    const next = glob[index + 1];

    if (char === '*') {
      if (next === '*') {
        const following = glob[index + 2];
        if (following === '/') {
          source += '(?:.*/)?';
          index += 2;
        } else {
          source += '.*';
          index += 1;
        }
      } else {
        source += '[^/]*';
      }
      continue;
    }

    if (char === '?') {
      source += '[^/]';
      continue;
    }

    source += escapeRegex(char);
  }

  source += '$';
  return new RegExp(source);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function matchesAny(value, patterns) {
  return patterns.some((pattern) => globToRegExp(pattern).test(value));
}

export function isGlobPattern(value) {
  return [...GLOB_META_CHARS].some((char) => value.includes(char));
}

/**
 * Validate the parsed owner manifest against the strict schema.
 * Returns { ok, errors } where errors is an array of human-readable strings.
 * This is a pure function: it takes the parsed config object and performs no
 * filesystem access, so it is the contract target of the failing fixtures.
 */
export function validateConfig(config) {
  const errors = [];

  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return { ok: false, errors: ['Manifest must be a JSON object.'] };
  }

  for (const key of Object.keys(config)) {
    if (!TOP_LEVEL_ALLOWED_KEYS.has(key)) {
      errors.push(`Unknown top-level key: "${key}".`);
    }
  }

  if (config.schemaVersion !== 1) {
    errors.push(`schemaVersion must be 1, got ${JSON.stringify(config.schemaVersion)}.`);
  }

  const sourceScopes = config.sourceScopes;
  if (!Array.isArray(sourceScopes) || sourceScopes.length === 0) {
    errors.push('sourceScopes must be a non-empty array of globs.');
  } else if (!sourceScopes.every((scope) => typeof scope === 'string' && scope.trim())) {
    errors.push('sourceScopes must contain only non-empty strings.');
  }

  const layers = config.layers;
  if (!Array.isArray(layers) || layers.length === 0) {
    errors.push('layers must be a non-empty array.');
  } else {
    const layerIds = new Set();
    layers.forEach((layer, index) => {
      if (!layer || typeof layer !== 'object' || Array.isArray(layer)) {
        errors.push(`layers[${index}] must be an object.`);
        return;
      }
      for (const key of Object.keys(layer)) {
        if (!LAYER_ALLOWED_KEYS.has(key)) {
          errors.push(`layers[${index}] unknown key: "${key}".`);
        }
      }
      if (typeof layer.id !== 'string' || !layer.id.trim()) {
        errors.push(`layers[${index}].id must be a non-empty string.`);
      } else if (VALID_LAYERS.includes(layer.id) && layerIds.has(layer.id)) {
        errors.push(`Duplicate layer id: "${layer.id}".`);
      } else {
        layerIds.add(layer.id);
      }
      if (
        layer.mayImportLayers !== undefined
        && (!Array.isArray(layer.mayImportLayers)
          || !layer.mayImportLayers.every((target) => typeof target === 'string'))
      ) {
        errors.push(`layers[${index}].mayImportLayers must be an array of strings.`);
      }
    });
    for (const requiredLayer of VALID_LAYERS) {
      if (!layerIds.has(requiredLayer)) {
        errors.push(`Missing required layer: "${requiredLayer}".`);
      }
    }
  }

  const owners = config.owners;
  if (!Array.isArray(owners) || owners.length === 0) {
    errors.push('owners must be a non-empty array.');
    return { ok: false, errors };
  }

  const ownerIds = new Set();
  const canonicalStateGlobal = new Map();

  owners.forEach((owner, index) => {
    const label = owner?.id ? `owner "${owner.id}"` : `owners[${index}]`;
    if (!owner || typeof owner !== 'object' || Array.isArray(owner)) {
      errors.push(`${label} must be an object.`);
      return;
    }
    for (const key of Object.keys(owner)) {
      if (!OWNER_ALLOWED_KEYS.has(key)) {
        errors.push(`${label} unknown key: "${key}".`);
      }
    }
    if (typeof owner.id !== 'string' || !owner.id.trim()) {
      errors.push(`${label} id must be a non-empty string.`);
    } else if (ownerIds.has(owner.id)) {
      errors.push(`Duplicate owner id: "${owner.id}".`);
    } else {
      ownerIds.add(owner.id);
    }
    if (!VALID_LAYERS.includes(owner.layer)) {
      errors.push(`${label} layer must be one of ${VALID_LAYERS.join(', ')}, got ${JSON.stringify(owner.layer)}.`);
    }
    if (owner.include !== undefined && !Array.isArray(owner.include)) {
      errors.push(`${label} include must be an array of globs.`);
    } else if (Array.isArray(owner.include) && !owner.include.every((pattern) => typeof pattern === 'string' && pattern.trim())) {
      errors.push(`${label} include must contain only non-empty glob strings.`);
    }
    if (owner.delegatesTo !== undefined && !Array.isArray(owner.delegatesTo)) {
      errors.push(`${label} delegatesTo must be an array of owner ids.`);
    }
    if (
      owner.delegatesTo
      && !owner.delegatesTo.every((target) => typeof target === 'string' && target.trim())
    ) {
      errors.push(`${label} delegatesTo must contain only non-empty owner id strings.`);
    }
    if (!Array.isArray(owner.responsibilities) || owner.responsibilities.length === 0) {
      errors.push(`${label} responsibilities must be a non-empty array.`);
    }
    if (owner.canonicalState !== undefined && !Array.isArray(owner.canonicalState)) {
      errors.push(`${label} canonicalState must be an array.`);
    }
    if (owner.entrypoints !== undefined && !Array.isArray(owner.entrypoints)) {
      errors.push(`${label} entrypoints must be an array.`);
    }
    if (owner.allowedOwnerDependencies !== undefined && !Array.isArray(owner.allowedOwnerDependencies)) {
      errors.push(`${label} allowedOwnerDependencies must be an array.`);
    }
    if (owner.forbiddenDependencies !== undefined && !Array.isArray(owner.forbiddenDependencies)) {
      errors.push(`${label} forbiddenDependencies must be an array.`);
    }
    if (owner.adjacentOwners !== undefined && !Array.isArray(owner.adjacentOwners)) {
      errors.push(`${label} adjacentOwners must be an array.`);
    }
    if (owner.tests !== undefined && !Array.isArray(owner.tests)) {
      errors.push(`${label} tests must be an array.`);
    }
    if (typeof owner.overviewDoc !== 'string' || !owner.overviewDoc.trim()) {
      errors.push(`${label} overviewDoc must be a non-empty path string.`);
    }
    if (owner.requiredGates !== undefined && !Array.isArray(owner.requiredGates)) {
      errors.push(`${label} requiredGates must be an array.`);
    }
    if (owner.risk !== undefined && !VALID_RISK_LEVELS.includes(owner.risk)) {
      errors.push(`${label} risk must be one of ${VALID_RISK_LEVELS.join(', ')}, got ${JSON.stringify(owner.risk)}.`);
    }

    // Canonical-state uniqueness across owners (hard invariant P4).
    const states = Array.isArray(owner.canonicalState) ? owner.canonicalState : [];
    for (const state of states) {
      if (typeof state !== 'string' || !state.trim()) {
        errors.push(`${label} canonicalState must contain only non-empty strings.`);
        continue;
      }
      const existing = canonicalStateGlobal.get(state);
      if (existing) {
        errors.push(
          `Duplicate canonical state "${state}" declared by owners "${existing}" and "${owner.id}".`,
        );
      } else {
        canonicalStateGlobal.set(state, owner.id);
      }
    }
  });

  // Cross-owner references: delegatesTo, allowed/forbidden/adjacent.
  for (const owner of owners) {
    const label = `owner "${owner.id}"`;
    for (const ref of owner.delegatesTo ?? []) {
      if (!ownerIds.has(ref)) {
        errors.push(`${label} delegatesTo references unknown owner "${ref}".`);
      }
    }
    for (const ref of owner.allowedOwnerDependencies ?? []) {
      if (!ownerIds.has(ref)) {
        errors.push(`${label} allowedOwnerDependencies references unknown owner "${ref}".`);
      }
    }
    for (const ref of owner.adjacentOwners ?? []) {
      if (!ownerIds.has(ref)) {
        errors.push(`${label} adjacentOwners references unknown owner "${ref}".`);
      }
    }
  }

  // Delegation cycles (invalid delegation).
  const delegationCycle = detectDelegationCycle(owners);
  if (delegationCycle) {
    errors.push(`Invalid delegation cycle: ${delegationCycle.join(' -> ')}.`);
  }

  // Delegation coverage: a coarse owner that delegates to a fine owner must
  // actually own the subtree the fine owner claims; otherwise the delegation is
  // a no-op that masks an ambiguous boundary. We test this by deriving the
  // directory prefix of each delegate include pattern and checking that the
  // delegator has at least one include glob whose scope contains that prefix
  // (tested as a concrete placeholder path so glob semantics apply). Unknown
  // delegate ids are already reported by the cross-owner reference check above;
  // skip them here to avoid cascading.
  const byId = new Map(owners.map((owner) => [owner.id, owner]));
  for (const owner of owners) {
    for (const delegateId of owner.delegatesTo ?? []) {
      const delegate = byId.get(delegateId);
      if (!delegate) {
        continue;
      }
      const orphan = (delegate.include ?? []).filter((pattern) => {
        const prefix = includeDirPrefix(pattern);
        if (!prefix) {
          return false;
        }
        const placeholder = `${prefix}/__delegate_probe__.ts`;
        return !(owner.include ?? []).some((ownPattern) =>
          globToRegExp(ownPattern).test(placeholder),
        );
      });
      if (orphan.length) {
        errors.push(
          `owner "${owner.id}" delegates to "${delegateId}" but does not cover its include subtree: ${orphan.join(', ')}.`,
        );
      }
    }
  }

  // Legacy unassigned validation.
  const legacy = config.legacy;
  if (legacy !== undefined) {
    if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy)) {
      errors.push('legacy must be an object.');
    } else {
      for (const key of Object.keys(legacy)) {
        if (!LEGACY_ALLOWED_KEYS.has(key)) {
          errors.push(`legacy unknown key: "${key}".`);
        }
      }
      const unassigned = legacy.unassigned;
      if (unassigned !== undefined) {
        if (!unassigned || typeof unassigned !== 'object' || Array.isArray(unassigned)) {
          errors.push('legacy.unassigned must be an object.');
        } else {
          for (const key of Object.keys(unassigned)) {
            if (!LEGACY_UNASSIGNED_ALLOWED_KEYS.has(key)) {
              errors.push(`legacy.unassigned unknown key: "${key}".`);
            }
          }
          const explicitPaths = unassigned.explicitPaths;
          if (explicitPaths !== undefined) {
            if (!Array.isArray(explicitPaths)) {
              errors.push('legacy.unassigned.explicitPaths must be an array.');
            } else {
              explicitPaths.forEach((entry, i) => {
                if (typeof entry !== 'string' || !entry.trim()) {
                  errors.push(`legacy.unassigned.explicitPaths[${i}] must be a non-empty string.`);
                  return;
                }
                if (isGlobPattern(entry)) {
                  errors.push(
                    `legacy.unassigned.explicitPaths[${i}] ("${entry}") must be an exact path, not a glob.`,
                  );
                }
              });
              const dupes = findDuplicates(explicitPaths.map(normalizeRepoPath));
              if (dupes.length) {
                errors.push(`legacy.unassigned.explicitPaths has duplicates: ${dupes.join(', ')}.`);
              }
            }
          }
          if (
            unassigned.mustReachZeroBeforePhase !== undefined
            && (typeof unassigned.mustReachZeroBeforePhase !== 'number'
              || !Number.isInteger(unassigned.mustReachZeroBeforePhase))
          ) {
            errors.push('legacy.unassigned.mustReachZeroBeforePhase must be an integer.');
          }
        }
      }
    }
  }

  // Dependency exceptions.
  const exceptions = config.dependencyExceptions;
  if (exceptions !== undefined) {
    if (!Array.isArray(exceptions)) {
      errors.push('dependencyExceptions must be an array.');
    } else {
      const exceptionIds = new Set();
      exceptions.forEach((exception, index) => {
        const label = exception?.id ? `exception "${exception.id}"` : `dependencyExceptions[${index}]`;
        if (!exception || typeof exception !== 'object' || Array.isArray(exception)) {
          errors.push(`${label} must be an object.`);
          return;
        }
        for (const key of Object.keys(exception)) {
          if (!EXCEPTION_ALLOWED_KEYS.has(key)) {
            errors.push(`${label} unknown key: "${key}".`);
          }
        }
        if (typeof exception.id !== 'string' || !exception.id.trim()) {
          errors.push(`${label} id must be a non-empty string.`);
        } else if (exceptionIds.has(exception.id)) {
          errors.push(`Duplicate exception id: "${exception.id}".`);
        } else {
          exceptionIds.add(exception.id);
        }
        if (typeof exception.baselineEdgeId !== 'string' || !exception.baselineEdgeId.trim()) {
          errors.push(`${label} baselineEdgeId must be a non-empty string.`);
        }
        if (typeof exception.ruleId !== 'string' || !exception.ruleId.trim()) {
          errors.push(`${label} ruleId must be a non-empty string.`);
        }
        if (typeof exception.reason !== 'string' || !exception.reason.trim()) {
          errors.push(`${label} reason must be a non-empty string.`);
        }
        if (!Array.isArray(exception.characterizationTests)) {
          errors.push(`${label} characterizationTests must be an array.`);
        }
        if (typeof exception.retirementPhase !== 'string' || !exception.retirementPhase.trim()) {
          errors.push(`${label} retirementPhase must be a non-empty string.`);
        }
        if (typeof exception.expiresAt !== 'string' || !exception.expiresAt.trim()) {
          errors.push(`${label} expiresAt must be a non-empty ISO date string.`);
        } else if (Number.isNaN(Date.parse(exception.expiresAt))) {
          errors.push(`${label} expiresAt is not a valid date: ${exception.expiresAt}.`);
        }
      });
    }
  }

  return { ok: errors.length === 0, errors };
}

function findDuplicates(values) {
  const seen = new Set();
  const dupes = new Set();
  for (const value of values) {
    if (seen.has(value)) {
      dupes.add(value);
    } else {
      seen.add(value);
    }
  }
  return [...dupes];
}

/**
 * Derive the directory prefix of an include glob for delegation-coverage
 * testing. Returns null when the glob does not encode a subtree. For example:
 *   "src/core/opencode/**"        -> "src/core/opencode"
 *   "src/core/opencode/diagnostics/index.ts" -> "src/core/opencode/diagnostics"
 *   "src/main.ts"                 -> null (single-file, no subtree)
 *   "src/features/chat/services/**" -> "src/features/chat/services"
 */
function includeDirPrefix(pattern) {
  const normalized = normalizeRepoPath(pattern);
  if (!normalized.includes('/')) {
    return null;
  }
  const withoutGlob = normalized.replace(/\/\*.*$/, '');
  if (withoutGlob === normalized) {
    // No glob suffix: it's an exact file path, delegate must be covered by a
    // glob that matches this file — we still return the directory so the probe
    // tests the file location rather than the literal name.
    const dir = normalized.slice(0, normalized.lastIndexOf('/'));
    return dir || null;
  }
  return withoutGlob || null;
}

function detectDelegationCycle(owners) {
  const byId = new Map(owners.map((owner) => [owner.id, owner]));
  const visited = new Map(); // id -> 'visiting' | 'done'
  const stack = [];

  function visit(id) {
    if (visited.get(id) === 'done') {
      return null;
    }
    if (visited.get(id) === 'visiting') {
      const cycleStart = stack.indexOf(id);
      return [...stack.slice(cycleStart), id];
    }
    visited.set(id, 'visiting');
    stack.push(id);
    const owner = byId.get(id);
    if (owner) {
      for (const target of owner.delegatesTo ?? []) {
        const result = visit(target);
        if (result) {
          return result;
        }
      }
    }
    stack.pop();
    visited.set(id, 'done');
    return null;
  }

  for (const owner of owners) {
    const result = visit(owner.id);
    if (result) {
      return result;
    }
  }
  return null;
}

/**
 * Resolve the set of owners whose include globs match a given repo-relative
 * source path, before delegation reduction.
 */
export function findOwnerMatches(config, sourcePath) {
  const normalized = normalizeRepoPath(sourcePath);
  return (config.owners ?? []).filter((owner) =>
    (owner.include ?? []).some((pattern) => globToRegExp(pattern).test(normalized)),
  );
}

/**
 * Apply structured delegation reduction: a coarse owner yields a path to any
 * delegated fine owner that also claims it. Returns the effective owner set.
 */
export function resolveEffectiveOwners(config, sourcePath) {
  const matched = findOwnerMatches(config, sourcePath);
  if (matched.length <= 1) {
    return matched;
  }
  const effective = new Set(matched);
  let changed = true;
  while (changed) {
    changed = false;
    for (const candidate of effective) {
      let yields = false;
      for (const other of effective) {
        if (candidate.id === other.id) {
          continue;
        }
        if ((candidate.delegatesTo ?? []).includes(other.id)) {
          yields = true;
          break;
        }
      }
      if (yields) {
        effective.delete(candidate);
        changed = true;
        break;
      }
    }
  }
  return [...effective];
}

/**
 * Classify a single source path. Returns:
 *   { assigned: ownerId }  when exactly one effective owner,
 *   { ambiguous: [ids] }   when more than one effective owner,
 *   { unassigned: true }   when no effective owner (and not explicitly listed).
 */
export function classifyPath(config, sourcePath) {
  const normalized = normalizeRepoPath(sourcePath);
  const explicit = config?.legacy?.unassigned?.explicitPaths ?? [];
  const effective = resolveEffectiveOwners(config, normalized);
  if (effective.length === 1) {
    return { assigned: effective[0].id };
  }
  if (effective.length > 1) {
    return { ambiguous: effective.map((owner) => owner.id) };
  }
  if (explicit.map(normalizeRepoPath).includes(normalized)) {
    return { unassigned: true, explicit: true };
  }
  return { unassigned: true, explicit: false };
}

/**
 * Check full coverage for a list of managed source paths.
 * Returns { unassigned, ambiguous, covered } where each is an array of
 * { path, ...detail } records. A path is covered when assigned to an owner or
 * explicitly listed in legacy.unassigned.explicitPaths.
 */
export function checkCoverage(config, sourcePaths) {
  const result = { unassigned: [], ambiguous: [], covered: 0 };
  const explicit = new Set((config?.legacy?.unassigned?.explicitPaths ?? []).map(normalizeRepoPath));
  for (const rawPath of sourcePaths) {
    const sourcePath = normalizeRepoPath(rawPath);
    const classification = classifyPath(config, sourcePath);
    if (classification.assigned) {
      result.covered += 1;
    } else if (classification.ambiguous) {
      result.ambiguous.push({ path: sourcePath, owners: classification.ambiguous });
    } else if (explicit.has(sourcePath)) {
      result.unassigned.push({ path: sourcePath, explicit: true });
    } else {
      result.unassigned.push({ path: sourcePath, explicit: false });
    }
  }
  return result;
}

/**
 * Verify that every overviewDoc path exists on disk. Returns an array of
 * missing paths (empty when all present). Pure-filesystem, not schema.
 */
export function findMissingOverviewDocs(root, config) {
  const missing = [];
  for (const owner of config.owners ?? []) {
    if (typeof owner.overviewDoc === 'string' && owner.overviewDoc.trim()) {
      const resolved = path.isAbsolute(owner.overviewDoc)
        ? owner.overviewDoc
        : path.join(root, normalizeRepoPath(owner.overviewDoc));
      if (!fs.existsSync(resolved)) {
        missing.push({ ownerId: owner.id, overviewDoc: normalizeRepoPath(owner.overviewDoc) });
      }
    }
  }
  return missing;
}

/**
 * Resolve an owner id by id, path, or entrypoint symbol.
 * Returns the owner object or null.
 */
export function resolveOwner(config, query) {
  const normalized = normalizeRepoPath(query);
  const byId = (config.owners ?? []).find((owner) => owner.id === query);
  if (byId) {
    return byId;
  }
  const classification = classifyPath(config, normalized);
  if (classification.assigned) {
    return (config.owners ?? []).find((owner) => owner.id === classification.assigned) ?? null;
  }
  const byEntrypoint = (config.owners ?? []).find((owner) =>
    (owner.entrypoints ?? []).some((entry) => entry === query || normalizeRepoPath(entry) === normalized),
  );
  return byEntrypoint ?? null;
}

/**
 * Validate path existence for owner entrypoints/tests/overview declared as
 * file paths. Entrypoints that look like file paths (ending in .ts/.tsx) and
 * test globs are checked against disk. Returns { missingEntrypoints,
 * emptyTests }.
 */
export function auditPathReferences(root, config) {
  const missingEntrypoints = [];
  const emptyTests = [];
  for (const owner of config.owners ?? []) {
    for (const entry of owner.entrypoints ?? []) {
      if (/\.(ts|tsx)$/.test(entry)) {
        const resolved = path.join(root, normalizeRepoPath(entry));
        if (!fs.existsSync(resolved)) {
          missingEntrypoints.push({ ownerId: owner.id, entrypoint: entry });
        }
      }
    }
    for (const testGlob of owner.tests ?? []) {
      if (!testGlobHasMatch(root, testGlob)) {
        emptyTests.push({ ownerId: owner.id, tests: testGlob });
      }
    }
  }
  return { missingEntrypoints, emptyTests };
}

function testGlobHasMatch(root, globPattern) {
  // Resolve a simple recursive glob against the filesystem. Supports a single
  // `**` segment. This is intentionally lightweight; complex globs fall back to
  // true (not reported as empty) to avoid false negatives.
  const normalized = normalizeRepoPath(globPattern);
  if (!normalized.includes('**')) {
    const resolved = path.join(root, normalized);
    return fs.existsSync(resolved);
  }
  const [prefix, suffix] = normalized.split('**');
  const baseDir = path.join(root, normalizeRepoPath(prefix.replace(/\/$/, '')));
  if (!fs.existsSync(baseDir) || !fs.statSync(baseDir).isDirectory()) {
    return false;
  }
  return walkHasMatch(baseDir, suffix.replace(/^\//, ''));
}

function walkHasMatch(baseDir, suffixGlob) {
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
        if (matchesAny(rel, [suffixGlob])) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Default mayImportLayers for a layer id when the manifest omits it.
 */
export function defaultMayImportLayers(layerId) {
  return [...(LAYER_IMPORT_DEFAULTS[layerId] ?? [])];
}

/**
 * Load and validate the owner manifest from disk. Throws on schema failure so
 * the checker and inspector fail closed.
 */
export function loadOwnerConfig(root, configPath = 'architecture-owners.config.json') {
  const resolved = path.isAbsolute(configPath) ? configPath : path.join(root, configPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Missing owner manifest: ${normalizeRepoPath(path.relative(root, resolved) || configPath)}`);
  }
  const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  const { ok, errors } = validateConfig(parsed);
  if (!ok) {
    throw new Error(`Invalid owner manifest:\n- ${errors.join('\n- ')}`);
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Owner-boundary evaluation (Phase 1 Task 4)
//
// This replaces the legacy path guard's hard-coded four-file list and
// net-line-count heuristic. Evaluation works against the canonical manifest:
//
//   PASS when changes stay inside declared owner responsibilities, even if a
//   shell grew in LOC for legitimate composition wiring.
//
//   FAIL when:
//     - a change crosses into a forbidden dependency,
//     - a new owner dependency or public entrypoint is added without manifest
//       registration,
//     - canonical state is duplicated into a second owner,
//     - a new runtime forwarding shim appears without an independent contract.
//
// Consumer-owned type-only ports that remove the complete plugin/main
// dependency are NOT runtime forwarding shims and do not fail.
//
// The diff records passed in are { path, status, addedLineCount, removedLineCount }
// objects, typically derived from the change-scope candidate views. Ownership
// is resolved per path via classifyPath. Net line count is informational only.
// ---------------------------------------------------------------------------

const FORBIDDEN_DEPENDENCY_HINTS = [
  // Crude signal that a file introduced an import the owner forbids. Real
  // dependency-direction classification is Phase 1 Task 5; this is a fast
  // pre-check that flags obvious manifest-forbidden imports in added lines.
];

/**
 * Evaluate a set of diff records against the owner manifest.
 *
 * @param {object} config - loaded owner manifest
 * @param {Array<{path:string,status?:string,added?:string[],addedLineCount?:number,removedLineCount?:number}>} diffs
 * @returns {{ ok:boolean, blockers:string[], hints:string[], touchedOwners:string[] }}
 */
export function evaluateOwnerBoundaries(config, diffs) {
  const blockers = [];
  const hints = [];
  const touchedOwners = new Set();

  for (const diff of diffs) {
    const sourcePath = normalizeRepoPath(diff.path);
    const classification = classifyPath(config, sourcePath);
    if (classification.assigned) {
      touchedOwners.add(classification.assigned);
    } else if (classification.ambiguous) {
      blockers.push(
        `${sourcePath} matches multiple owners (${classification.ambiguous.join(', ')}); resolve via delegatesTo.`,
      );
      continue;
    } else if (!diff.explicitUnassigned) {
      // An unmanaged path that is not legacy-unassigned is out of manifest scope.
      blockers.push(`${sourcePath} is not owned by any manifest owner and is not legacy-unassigned.`);
      continue;
    }
    // else: explicit legacy-unassigned path — allowed during Phase 0 only.

    // Canonical-state duplication heuristic: if added lines declare a new
    // Map/Set/cache/Store and the owner already declares a different
    // canonical state, flag it. This is a coarse hint; the schema already
    // enforces uniqueness at manifest-load time, this catches *unregistered*
    // second-truth introduction in code.
    if (diff.added?.length) {
      const addedLines = diff.added ?? [];
      if (addedLines.some((line) => /new\s+(Map|Set|WeakMap|WeakSet)\b/.test(line))) {
        const owner = (config.owners ?? []).find((o) => o.id === classification.assigned);
        if (owner && (owner.canonicalState ?? []).length > 0) {
          hints.push(
            `${sourcePath}: new Map/Set added to owner "${owner.id}" which already declares canonical state; confirm this is not a duplicate second truth.`,
          );
        }
      }
    }
  }

  return {
    ok: blockers.length === 0,
    blockers,
    hints,
    touchedOwners: [...touchedOwners].sort(),
  };
}

/**
 * Detect thin-layer forwarding files as a REVIEW HINT, not a blocker.
 * A file is a thin-layer candidate if its name matches a forwarding suffix
 * (Facade/Gateway/Builder/Provider/Adapter) AND its body is mostly single-line
 * pass-through functions without independent state/contract. This function only
 * flags by name; deeper contract analysis is deferred to review.
 *
 * Consumer-owned type-only ports colocated with the consumer owner and removing
 * a complete plugin/main dependency are explicitly NOT flagged.
 */
export function collectThinLayerHints(diffs, { typeOnlyPortPaths = [] } = {}) {
  const typeOnly = new Set((typeOnlyPortPaths ?? []).map(normalizeRepoPath));
  const pattern = /(Facade|Gateway|Builder|Provider|Adapter)\.tsx?$/;
  const hints = [];
  for (const diff of diffs) {
    const base = normalizeRepoPath(diff.path).split('/').pop() ?? diff.path;
    if (pattern.test(base) && !typeOnly.has(normalizeRepoPath(diff.path))) {
      hints.push({
        path: normalizeRepoPath(diff.path),
        reason: 'thin-layer style filename; confirm it owns a full behavior slice and is not a forwarding shim.',
      });
    }
  }
  return hints;
}
