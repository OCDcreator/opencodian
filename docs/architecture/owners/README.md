# Architecture Owner Model

> **Status:** active, machine-readable single source of truth for OpenCodian architecture owners.
>
> This document explains the owner model. The **canonical facts** live in `architecture-owners.config.json` and are enforced by `npm run check:owner-manifest`. This page only narrates the model; it does not duplicate owner facts.

## What an owner is

An architecture **owner** is a coarse-grained, complete behavior unit: it owns a responsibility, an entry point, canonical state, a dependency surface, a test surface, a lifecycle, and a risk/gate classification. Owners are **not** one file per callback. The initial set is defined by existing behavior boundaries and module-doc directories, not by a line-count quota.

An owner answers the six agent questions from the refactor plan:

1. Which owner does this change belong to?
2. Where do I start reading, and which files should I not touch?
3. Which adjacent owners may I depend on, and which boundaries must I not cross?
4. Which tests, module docs and generated artifacts must I update?
5. What is the real diff scope (merge-base, committed, staged, unstaged, untracked)?
6. For high-risk shells, what is an approvable budget and what is a non-waivable architectural/security invariant?

## The canonical manifest

`architecture-owners.config.json` is the single machine-readable truth source for owners, layers and dependency-exception governance metadata. Every other entry point (AGENTS, gates, `inspect:owner`, generated docs) consumes it — they never copy owner facts into a parallel map.

Key schema guarantees enforced by `check:owner-manifest`:

- **Exactly-one coverage**: every managed source path (under `sourceScopes`) matches exactly one effective owner, after `delegatesTo` reduction. Zero or multiple matches both fail.
- **Unknown-key rejection**: the manifest refuses top-level, layer, owner, legacy and exception keys it does not recognize, so config drift cannot be silently ignored.
- **Structured delegation**: a coarse owner yields a subtree to a fine owner via `delegatesTo`. The delegator must actually cover the delegate's include subtree; anonymous `exclude` chains are forbidden.
- **Canonical-state uniqueness (P4)**: each declared canonical state belongs to exactly one owner. Cross-owner access is read-only snapshot/command/event, never a second writable Map/Set/cache.
- **Legacy unassigned is a shrinking baseline**: `legacy.unassigned.explicitPaths` accepts exact paths only (no globs), cannot receive new files, and must reach zero before `mustReachZeroBeforePhase`. It is locked and can only decrease.

## Layers

```
shared  -> no dependency on core/feature/app
core    -> domain/backend/infrastructure; no feature/app imports
feature -> UI/use-case owners; consume core through narrow ports
app     -> composition, Obsidian registration, lifecycle wiring only
```

Layer membership is declared per owner in the manifest (`owner.layer`), not mechanically by top-level directory. `src/utils/**` is classified by real runtime dependency per owner; a shared utility with an upward type-only edge is recorded as type-coupling debt, not silently re-layered as core.

Each layer declares `mayImportLayers`. Phase 1 will enforce runtime/type/dynamic import edges against these allowlists; Phase 0 only records the layer assignment.

## Owners vs. reference-only dependency aliases

Most owners declare `include` globs and own source paths. A small number of owners declare **no paths** (`include` omitted) and exist only as dependency-surface aliases so the `allowedOwnerDependencies`/`adjacentOwners` vocabulary stays readable (for example `feature.chat-send` points at the send pipeline that physically lives in `feature.chat-runtime`). These reference-only owners never hold canonical state and are never the resolution target for a source path.

## Module docs and Graphify are not replaced

The owner manifest does **not** duplicate the source -> module-doc path mapping (that stays solely in `module-docs.config.json`) and does **not** duplicate Graphify graph facts. `inspect:owner` composes the manifest with the module-doc mapping; Graphify keeps its graph and community detection responsibility. The three sources are composed, not merged into one mega-truth.

## Dependency exceptions

`dependencyExceptions` holds governance metadata (stable id, rule id, reason, characterization tests, retirement phase, expiry) for known debt. The precise reverse-edge/SCC evidence is written to the content-addressed generated file `architecture-baseline.generated.json` by Phase 1 tooling — it is not a second owner truth source and is never hand-edited. Exceptions only reference edges already present in a frozen baseline; ordinary feature diffs cannot refresh the baseline.

## Navigation

Agents resolve an owner with:

```bash
npm run inspect:owner -- <path|symbol> [--json] [--explain]
```

The default reading chain is `AGENTS.md -> inspect:owner -> owner/module doc -> focused source`, not hundreds of phase-history documents.
