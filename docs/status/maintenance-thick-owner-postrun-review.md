# Thick-Owner Thinning Run Audit

> Date: 2026-04-30
> Scope: tasks master-10 through master-14 + postrun-1
> Baseline: docs/requirements/maintenance-development-baseline.md

## Summary

Four thick-owner thinning tasks (master-10 through master-13) and one doc-audit task (master-14) were executed. All four canonical thick owners lost meaningful responsibility density. One new module was created; three existing modules received extracted behavior. No thin-helper proliferation was observed.

All changes pass `npm run verify` (372/372 module-doc coverage, 339 test suites, 1729 tests, 0 lint errors, build OK).

## Thick-Owner Line Count Changes

| Owner | Before | After | Delta | Notes |
|---|---|---|---|---|
| `OpenCodianView.ts` | 5561 | 5418 | **-143** | Body rendering → AssistantShellViewHostAdapter |
| `OpenCodeService.ts` | 1973 | 1867 | **-106** | Session normalization → OpenCodeMessageNormalizationMapper |
| `main.ts` | 1613 | 1546 | **-67** | Config bootstrap → OpencodeConfigManager statics |
| `ServerManager.ts` | 1590 | 1418 | **-172** | OS process inspection → LocalSidecarProcessInspector |
| **Total** | **10737** | **10249** | **-488** | |

## New and Growing Modules

| Module | Before | After | Delta | Owner type |
|---|---|---|---|---|
| `LocalSidecarProcessInspector.ts` | *(new)* | 195 | +195 | Protocol boundary (OS process queries) |
| `OpenCodeMessageNormalizationMapper.ts` | 398 | 512 | +114 | Domain mapper (session normalization) |
| `AssistantShellViewHostAdapter.ts` | 158 | 317 | +159 | Domain runtime owner (body rendering) |
| `OpencodeConfigManager.ts` | 577 | 582 | +5 | Config owner (static helpers) |

Net new code in recipients: +473 lines. Net removed from thick owners: -488 lines. Near-parity confirms extraction, not expansion.

## Ownership Outcome

This section records the Ownership outcome: whether the completed changes reduced ownership density without thin-helper proliferation.

### Baseline Compliance Assessment

### 1. Did this change reduce or at least preserve ownership clarity?

**Yes.** Each extraction moved a complete, self-contained behavior slice into a module whose existing responsibility already overlapped with the extracted logic:

- OS process inspection (`lsof`/`ps`/PowerShell queries) is a protocol boundary — fits `LocalSidecarProcessInspector`.
- Session normalization (6 pure mapping methods) is a data transformation concern — fits `OpenCodeMessageNormalizationMapper`.
- Assistant body rendering (4 DOM rendering methods) is a view composition concern — fits `AssistantShellViewHostAdapter`.
- Config bootstrap/sync (2 static helpers) is a config ownership concern — fits `OpencodeConfigManager`.

### 2. Did it avoid growing OpenCodianView.ts or OpenCodeService.ts ownership?

**Yes.** Both shrank. OpenCodianView lost 143 lines; OpenCodeService lost 106 lines. Neither gained new responsibilities.

### 3. Did it remove duplication, or merely relocate it?

**It removed ownership density, not duplication.** The thick owners previously held behavior that was conceptually foreign to their core facade/shell role. The extracted modules now own those behaviors as primary responsibilities. No duplicate call paths were created — the thick owners delegate to the new homes without keeping parallel implementations.

### 4. Did it keep the boundary aligned with existing domain owners?

**Yes.** All extractions went to existing modules within the same domain directory. Only `LocalSidecarProcessInspector` is new, and it sits in `src/core/opencode/` alongside `ServerManager`, which is the correct domain boundary for OS process inspection.

### 5. Did it avoid thin helper fragmentation?

**Yes.** No adapter/factory/bridge/provider files were created. The new `LocalSidecarProcessInspector` owns a complete behavior slice (195 lines of OS-specific process queries). The three existing recipients all received behavior within their existing ownership scope.

### 6. Did the verification evidence match the scope of the change?

**Yes.** `npm run verify` covers module-doc coverage, graphify freshness, devlog order, lint, typecheck, full test suite (1729 tests), and production build. All gates green for every task.

## Anti-Fragmentation Check

Baseline anti-fragmentation warning signs:

| Warning sign | Present? | Evidence |
|---|---|---|
| New helper only called once | No | `LocalSidecarProcessInspector` is called from `ServerManager` for all process inspection paths |
| Parallel adapter/factory/provider layers | No | No new layers created |
| Logic extracted but original keeps same conceptual burden | No | Each thick owner lost both the code and the conceptual ownership |
| Tiny files that must always be read together | No | Smallest recipient is `OpencodeConfigManager` at 582 lines; smallest new module is `LocalSidecarProcessInspector` at 195 lines |

## Ownership Direction of Travel

| Metric | Direction | Acceptable? |
|---|---|---|
| Thick owner line counts | Down (all 4) | Yes |
| Import surface of thick owners | Down or neutral | Yes |
| New thin helpers | 0 | Yes |
| Test count | Preserved (1729) | Yes |
| Module-doc coverage | 372/372 (100%) | Yes |

## Follow-Up Assessment

The thick owners remain above the review threshold (1000 lines) but the baseline explicitly states:

> "The goal is not to force these files below an arbitrary number. The goal is to make them safer to understand and change."

## Follow-Up Decision

Follow-up decision: high-confidence candidates exist for future maintenance backlog; no immediate follow-up is required.

### High-confidence follow-up candidates

1. **OpenCodeService.ts (1867 lines)** — The biggest remaining extraction candidate is the canonical state mutation slice (~250 lines of session lifecycle state management). This is a self-contained concern that could move to a new or existing runtime coordinator. However, it touches the session state hot path and should only be extracted with careful TDD coverage.

2. **OpenCodianView.ts (5418 lines)** — Still the largest file. Further thinning should target the next cohesive slice (e.g., tab/conversation lifecycle coordination) but must preserve the per-tab concurrent-session behavior documented in AGENTS.md.

3. **ServerManager.ts (1418 lines)** — Reduced by 172 lines. Remaining bulk is domain-level adopt/recycle/conflict logic, which is its core ownership. No further extraction recommended at this time.

4. **main.ts (1546 lines)** — Reduced by 67 lines. Further lifecycle bootstrap slices could be identified, but the remaining methods are increasingly interleaved with plugin lifecycle callbacks that belong in the entry point.

### No immediate follow-up required

The changes achieved their stated goal: reduce ownership density in four thick owners without creating thin helpers or expanding the overall codebase surface. The follow-up candidates above are **future maintenance backlog items**, not urgent regression risks.
