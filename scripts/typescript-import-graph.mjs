// TypeScript import-edge classification library (Phase 1 Task 5).
//
// Uses the TypeScript compiler API to classify every import edge into:
//   - runtime-static   (value import, statically resolved)
//   - runtime-dynamic  (dynamic import() or import() with a variable specifier)
//   - require          (require() call)
//   - type-only        (import type / import of types only)
//   - re-export        (export ... from / export type ... from)
//
// The classifier resolves path aliases (@/* -> src/*), barrel files, and
// relative specifiers. Specifiers that cannot be resolved to an internal
// module fail closed (the caller decides whether to treat them as external).
//
// This deliberately does NOT reuse Graphify's mixed import edges: Graphify
// collapses runtime and type edges, so it cannot distinguish a type-only cycle
// (benign) from a runtime cycle (a real problem). The baseline must keep them
// separate.

import path from 'node:path';

let ts;

/**
 * Lazily load the TypeScript compiler. Kept lazy so pure-function unit tests
 * that do not need a real Program can still import this module.
 */
async function getTs() {
  if (ts) return ts;
  const mod = await import('typescript');
  ts = mod.default ?? mod;
  return ts;
}

export function toPosix(value) {
  return String(value).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/');
}

export function normalizeRepoPath(value) {
  return toPosix(value).replace(/^\/+/, '').replace(/\/$/, '');
}

/**
 * Determine the edge kind for a single import declaration node.
 * Returns one of: 'runtime-static' | 'runtime-dynamic' | 'require' | 'type-only' | 're-export'.
 */
export function classifyImportKind(tsModule, node) {
  const tsLocal = tsModule;
  // import type { X } from '...'  OR  import '...' where everything is type
  if (tsLocal.isImportClause(node) && node.isTypeOnly) return 'type-only';
  if (tsLocal.isImportDeclaration(node)) {
    const clause = node.importClause;
    if (clause && clause.isTypeOnly) return 'type-only';
    // Named bindings that are all type-only? TS represents `import type` via
    // clause.isTypeOnly; a plain `import { X }` that imports only types still
    // emits a value import unless elided. We treat non-typeOnly clauses as
    // runtime-static (conservative — type-only is opt-in via `import type`).
    return 'runtime-static';
  }
  // export ... from '...' (re-export)
  if (
    tsLocal.isExportDeclaration(node)
    && node.moduleSpecifier
  ) {
    return node.isTypeOnly ? 'type-only' : 're-export';
  }
  // dynamic import('...')
  if (tsLocal.isCallExpression(node) && node.expression.kind === tsLocal.SyntaxKind.ImportKeyword) {
    return 'runtime-dynamic';
  }
  // require('...') — detected in the require-call scanner, not here.
  return 'runtime-static';
}

/**
 * Extract the module specifier text from an import/export node, if present.
 */
export function getSpecifier(tsModule, node) {
  const tsLocal = tsModule;
  if (tsLocal.isImportDeclaration(node)) {
    return node.moduleSpecifier?.text ?? null;
  }
  if (tsLocal.isExportDeclaration(node) && node.moduleSpecifier) {
    return node.moduleSpecifier.text ?? null;
  }
  if (
    tsLocal.isCallExpression(node)
    && node.expression.kind === tsLocal.SyntaxKind.ImportKeyword
    && node.arguments[0]
    && tsLocal.isStringLiteral(node.arguments[0])
  ) {
    return node.arguments[0].text;
  }
  return null;
}

/**
 * Resolve a module specifier to a repo-relative file path, honoring the @/*
 * path alias and barrel index files. Returns null when unresolved (external or
 * dynamic specifier that cannot be statically resolved).
 *
 * @param {string} specifier
 * @param {string} fromFile - repo-relative path of the importing file
 * @param {object} opts - { aliasPrefix: 'src', aliasTarget: '@', knownFiles: Set<string>, extensions: string[] }
 */
export function resolveSpecifier(specifier, fromFile, opts = {}) {
  const aliasTarget = opts.aliasTarget ?? '@';
  const aliasPrefix = opts.aliasPrefix ?? 'src';
  const extensions = opts.extensions ?? ['.ts', '.tsx', '.d.ts'];
  const knownFiles = opts.knownFiles ?? new Set();

  let candidate;
  if (specifier === aliasTarget || specifier.startsWith(`${aliasTarget}/`)) {
    candidate = specifier.replace(aliasTarget, aliasPrefix);
  } else if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const fromDir = fromFile.includes('/') ? fromFile.slice(0, fromFile.lastIndexOf('/')) : '';
    candidate = normalizeRepoPath(path.posix.join(fromDir, specifier));
  } else {
    // External (npm package) or bare specifier — not an internal edge.
    return null;
  }

  // Try exact + extensions.
  const tries = [candidate, ...extensions.map((ext) => candidate + ext)];
  // Barrel: if candidate is a directory, look for index.ts inside.
  tries.push(`${candidate}/index.ts`, `${candidate}/index.tsx`);

  for (const t of tries) {
    if (knownFiles.has(normalizeRepoPath(t))) {
      return normalizeRepoPath(t);
    }
  }
  return null;
}

/**
 * Parse a single source file and emit edges: { from, to, kind, specifier }.
 * 'from' is repo-relative; 'to' is repo-relative or null (external).
 * Pure (no disk IO) given the source text and resolved rootDir.
 *
 * @param {object} args - { filePath, sourceText, tsModule, knownFiles, aliasPrefix, aliasTarget }
 */
export function extractEdges({ filePath, sourceText, tsModule, knownFiles, aliasPrefix = 'src', aliasTarget = '@' }) {
  const tsLocal = tsModule;
  const source = tsLocal.createSourceFile(filePath, sourceText, tsLocal.ScriptTarget.Latest, true);
  const fromPath = normalizeRepoPath(filePath);
  const edges = [];

  const visit = (node) => {
    // import/export with a module specifier
    if (
      tsLocal.isImportDeclaration(node)
      || (tsLocal.isExportDeclaration(node) && node.moduleSpecifier)
    ) {
      const specifier = getSpecifier(tsLocal, node);
      const kind = classifyImportKind(tsLocal, node);
      const resolved = specifier
        ? resolveSpecifier(specifier, fromPath, { knownFiles, aliasPrefix, aliasTarget })
        : null;
      edges.push({ from: fromPath, to: resolved, kind, specifier, external: resolved === null });
      return;
    }
    // dynamic import('...')
    if (
      tsLocal.isCallExpression(node)
      && node.expression.kind === tsLocal.SyntaxKind.ImportKeyword
    ) {
      const specifier = getSpecifier(tsLocal, node);
      const kind = 'runtime-dynamic';
      const resolved = specifier
        ? resolveSpecifier(specifier, fromPath, { knownFiles, aliasPrefix, aliasTarget })
        : null;
      edges.push({ from: fromPath, to: resolved, kind, specifier, external: resolved === null });
      return;
    }
    // require('...') — only string-literal requires; variable requires fail closed.
    if (
      tsLocal.isCallExpression(node)
      && tsLocal.isIdentifier(node.expression)
      && node.expression.text === 'require'
      && node.arguments[0]
    ) {
      if (tsLocal.isStringLiteral(node.arguments[0])) {
        const specifier = node.arguments[0].text;
        const resolved = resolveSpecifier(specifier, fromPath, { knownFiles, aliasPrefix, aliasTarget });
        edges.push({ from: fromPath, to: resolved, kind: 'require', specifier, external: resolved === null });
      } else {
        // Variable specifier require — cannot resolve statically. Record as
        // unresolved require so the caller can require exact registration.
        edges.push({ from: fromPath, to: null, kind: 'require', specifier: null, external: true, unresolved: true });
      }
      return;
    }
    tsLocal.forEachChild(node, visit);
  };

  visit(source);
  return edges;
}

/**
 * Stable edge id: from|to|kind|specifier — content-addressed, no line numbers.
 */
export function edgeId(edge) {
  return [edge.from, edge.to ?? 'EXTERNAL', edge.kind, edge.specifier ?? ''].join('|');
}

/**
 * Build the full import graph for a set of files. Returns { edges, unresolved }.
 * This is async because it loads the TS module lazily.
 */
export async function buildImportGraph(files, { aliasPrefix = 'src', aliasTarget = '@', readFile } = {}) {
  const tsModule = await getTs();
  const knownFiles = new Set(files.map(normalizeRepoPath));
  const edges = [];
  const unresolved = [];
  const read = readFile ?? ((p) => {
    // eslint-disable-next-line global-require
    const fs = require('node:fs');
    return fs.readFileSync(p, 'utf8');
  });

  for (const file of files) {
    const repoPath = normalizeRepoPath(file);
    let sourceText;
    try {
      sourceText = read(file);
    } catch {
      continue;
    }
    const fileEdges = extractEdges({
      filePath: repoPath,
      sourceText,
      tsModule,
      knownFiles,
      aliasPrefix,
      aliasTarget,
    });
    for (const e of fileEdges) {
      edges.push(e);
      if (e.unresolved) {
        unresolved.push({ from: e.from, kind: e.kind, specifier: e.specifier });
      }
    }
  }

  return { edges, unresolved };
}

// ---------------------------------------------------------------------------
// SCC detection (Tarjan's algorithm) and baseline generation.
//
// Critical design rule: runtime SCCs and type-only/mixed SCCs are detected
// SEPARATELY. A type-only cycle is benign (type coupling debt, reported but
// not a runtime blocker); a pure runtime cycle is a hard gate. Graphify
// collapses these into mixed edges and cannot tell them apart, so this module
// keeps them distinct.
// ---------------------------------------------------------------------------

/**
 * Build an adjacency map from edges, optionally filtering by edge kind.
 * Only internal edges (to !== null, external === false) participate.
 *
 * @param {Array} edges
 * @param {object} opts - { includeKinds: Set<string> } ; if omitted, all kinds
 * @returns {Map<string, Set<string>>}
 */
export function buildAdjacency(edges, opts = {}) {
  const include = opts.includeKinds ? new Set(opts.includeKinds) : null;
  const adj = new Map();
  for (const e of edges) {
    if (e.external || !e.to) continue;
    if (include && !include.has(e.kind)) continue;
    if (!adj.has(e.from)) adj.set(e.from, new Set());
    adj.get(e.from).add(e.to);
    if (!adj.has(e.to)) adj.set(e.to, new Set());
  }
  return adj;
}

/**
 * Detect strongly-connected components via Tarjan's iterative algorithm.
 * Returns an array of SCCs, each a sorted array of node ids.
 */
export function detectSccs(adjacency) {
  const adj = adjacency;
  const index = new Map();
  const lowlink = new Map();
  const onStack = new Set();
  const stack = [];
  const sccs = [];
  let counter = 0;

  // Iterative strongconnect to avoid stack overflow on large graphs.
  const strongconnect = (v0) => {
    const work = [{ v: v0, neighbors: [...(adj.get(v0) ?? [])] }];
    index.set(v0, counter);
    lowlink.set(v0, counter);
    counter += 1;
    stack.push(v0);
    onStack.add(v0);

    while (work.length) {
      const frame = work[work.length - 1];
      if (frame.neighbors.length > 0) {
        const w = frame.neighbors.shift();
        if (!index.has(w)) {
          index.set(w, counter);
          lowlink.set(w, counter);
          counter += 1;
          stack.push(w);
          onStack.add(w);
          work.push({ v: w, neighbors: [...(adj.get(w) ?? [])] });
        } else if (onStack.has(w)) {
          lowlink.set(frame.v, Math.min(lowlink.get(frame.v), index.get(w)));
        }
      } else {
        // Done with frame.v
        if (lowlink.get(frame.v) === index.get(frame.v)) {
          const comp = [];
          let w;
          do {
            w = stack.pop();
            onStack.delete(w);
            comp.push(w);
          } while (w !== frame.v);
          if (comp.length > 1) {
            sccs.push([...comp].sort());
          }
        }
        work.pop();
        if (work.length) {
          const parent = work[work.length - 1];
          lowlink.set(parent.v, Math.min(lowlink.get(parent.v), lowlink.get(frame.v)));
        }
      }
    }
  };

  for (const v of adj.keys()) {
    if (!index.has(v)) {
      strongconnect(v);
    }
  }
  return sccs;
}

const RUNTIME_EDGE_KINDS = new Set(['runtime-static', 'runtime-dynamic', 'require']);

/**
 * Classify edges into runtime vs type-only. 're-export' is treated as carrying
 * the same runtime/type character as the re-exported symbol, but conservatively
 * counts as runtime-static unless it is explicitly type-only (handled at edge
 * extraction via kind='type-only' for `export type`).
 */
export function isRuntimeEdge(edge) {
  return RUNTIME_EDGE_KINDS.has(edge.kind);
}

/**
 * Detect runtime SCCs (pure runtime cycles — hard blocker) and mixed/type-only
 * SCCs separately. A mixed SCC contains at least one type-only edge and at least
 * one runtime edge; a type-only SCC contains only type-only edges.
 *
 * @returns { runtimeSccs, typeOnlySccs, mixedSccs }
 */
export function classifySccs(edges) {
  const runtimeAdj = buildAdjacency(edges, { includeKinds: RUNTIME_EDGE_KINDS });
  const allInternalAdj = buildAdjacency(edges);
  const typeOnlyAdj = buildAdjacency(edges, { includeKinds: new Set(['type-only']) });

  const runtimeSccs = detectSccs(runtimeAdj);

  // Mixed SCC: a cycle in ALL edges that is NOT a pure-runtime cycle and NOT a
  // pure-type-only cycle — i.e. it contains both runtime and type-only edges.
  const allSccs = detectSccs(allInternalAdj);
  const typeOnlySccs = detectSccs(typeOnlyAdj);

  const runtimeSet = new Set(runtimeSccs.map((s) => s.join(',')));
  const typeOnlySet = new Set(typeOnlySccs.map((s) => s.join(',')));
  const mixedSccs = allSccs.filter((s) => !runtimeSet.has(s.join(',')) && !typeOnlySet.has(s.join(',')));

  return { runtimeSccs, typeOnlySccs, mixedSccs };
}

/**
 * Stable SCC id: sorted-member join. Members are file paths, so the id does not
 * drift with line numbers.
 */
export function sccId(members) {
  return [...members].sort().join(';;');
}

/**
 * Generate a frozen, content-addressed baseline from the current graph.
 * Output: { edges: [{id, from, to, kind, specifier}], runtimeSccs: [{id, members}],
 *           typeOnlySccs: [...], mixedSccs: [...], generatedAt, headSha? }
 * This file is GENERATED and must never be hand-edited. Manifest exceptions
 * reference these ids; ordinary diffs cannot refresh the baseline.
 */
export function generateBaseline(edges, { headSha = null } = {}) {
  const { runtimeSccs, typeOnlySccs, mixedSccs } = classifySccs(edges);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    headShaAtGeneration: headSha,
    edges: edges
      .filter((e) => !e.external && e.to)
      .map((e) => ({
        id: edgeId(e),
        from: e.from,
        to: e.to,
        kind: e.kind,
        specifier: e.specifier ?? null,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    runtimeSccs: runtimeSccs.map((m) => ({ id: sccId(m), members: m })).sort((a, b) => a.id.localeCompare(b.id)),
    typeOnlySccs: typeOnlySccs.map((m) => ({ id: sccId(m), members: m })).sort((a, b) => a.id.localeCompare(b.id)),
    mixedSccs: mixedSccs.map((m) => ({ id: sccId(m), members: m })).sort((a, b) => a.id.localeCompare(b.id)),
  };
}

/**
 * Diff a current graph against a frozen baseline. Returns:
 *   { newRuntimeSccs, newTypeCouplingMembers, newReverseEdges }
 * A new reverse-layer runtime/type edge, a new runtime SCC, or a new member in
 * a baseline type-coupling SCC are all non-waivable blockers.
 *
 * reverseEdgeFn(fromPath, toPath, edge) => boolean: returns true if the edge is
 * a layer/owner reverse edge (e.g. core -> feature). The caller supplies this
 * using the manifest's layer/owner allowlist.
 */
export function diffAgainstBaseline(currentEdges, baseline, { isReverseEdge = () => false } = {}) {
  const baselineEdgeIds = new Set((baseline.edges ?? []).map((e) => e.id));
  const newReverseEdges = [];
  for (const e of currentEdges) {
    if (e.external || !e.to) continue;
    if (!baselineEdgeIds.has(edgeId(e)) && isReverseEdge(e.from, e.to, e)) {
      newReverseEdges.push({ from: e.from, to: e.to, kind: e.kind, specifier: e.specifier });
    }
  }

  const { runtimeSccs, typeOnlySccs, mixedSccs } = classifySccs(currentEdges);
  const baselineRuntime = new Set((baseline.runtimeSccs ?? []).map((s) => s.id));
  const baselineTypeCoupling = new Map();
  for (const s of [...(baseline.typeOnlySccs ?? []), ...(baseline.mixedSccs ?? [])]) {
    baselineTypeCoupling.set(s.id, new Set(s.members));
  }

  const newRuntimeSccs = runtimeSccs.filter((s) => !baselineRuntime.has(sccId(s)));

  // New member in an existing baseline type-coupling SCC: a member set that
  // intersects a baseline SCC but is not identical to it.
  const newTypeCouplingMembers = [];
  for (const s of [...typeOnlySccs, ...mixedSccs]) {
    const id = sccId(s);
    if (baselineTypeCoupling.has(id)) {
      // identical SCC — no growth
      continue;
    }
    // Check if this SCC shares any member with a baseline SCC (i.e. it grew or
    // shrank). Any non-identical overlap is a new-member violation.
    const memberSet = new Set(s);
    for (const [bId, bMembers] of baselineTypeCoupling) {
      const overlap = [...memberSet].some((m) => bMembers.has(m));
      if (overlap && bId !== id) {
        newTypeCouplingMembers.push({ current: s, baseline: [...bMembers] });
        break;
      }
    }
  }

  return { newRuntimeSccs, newTypeCouplingMembers, newReverseEdges };
}

