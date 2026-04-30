## Round Design

- Exact `[NEXT]` slice: `[NEXT] Task 2 - Package plugin startup, warmup, and refresh orchestration out of main.ts` in lane `h3-settings-bootstrap-package` / `H3 - Package the settings and bootstrap hotspot`.
- Goal: reduce one startup/runtime orchestration cluster in `src/main.ts` by strengthening a durable plugin-adjacent owner while preserving startup order and view refresh semantics.
- Constraints and acceptance criteria: `main.ts` must lose measurable assembly pressure; startup order, deferred warmup, session-bootstrap warmup readiness, model reload, settings UI refresh, slash catalog invalidation, and provider-icon UI application must remain behaviorally equivalent; no runtime behavior may shift into an anemic wrapper; do not touch `OpenCodianView.ts` or `OpenCodeService.ts`; do not start Task 3.
- Targeted hotspot files: `src/main.ts` and one durable plugin-adjacent owner under `src/core/` or `src/features/`.
- Adjacent owners considered: `src/core/types/settingsLoadNormalization.ts` already owns persisted-settings bootstrap normalization and should not receive runtime refresh responsibilities; a plugin-level runtime coordinator under `src/core/` can own repeated warmup and view-refresh orchestration because it coordinates multiple services/views and has multiple call sites.
- Intended before/after ownership surface: before, `OpenCodianPlugin` directly owns deferred runtime warmup timer/promise state, warmup readiness sequencing, view UI refresh iteration, slash-command invalidation iteration, and model-refresh frame scheduling; after, `OpenCodianPlugin` keeps high-level lifecycle calls while a durable runtime coordinator owns timer/frame state and the repeated orchestration against the plugin host callbacks.
- Tests likely to change: `tests/unit/main.test.ts` for deferred warmup and slash/model refresh seams; `tests/unit/main/themeSettingsMigration.test.ts` should remain covered by configured validation.
- Docs likely to change: `docs/modules/entry-point/main.md` and a matching module doc for any new durable `src/core/**` owner if introduced.
- Explicit non-goals: do not alter settings persistence, config merge semantics, conversation storage, OpenCode SDK/service behavior, chat view rendering internals, settings UI section packaging, or deployment artifacts; do not use OpenCode; do not introduce a thin one-method helper.

## Hotspot Baseline

- Lane baseline identifies `src/main.ts` as a startup, runtime warmup, and cross-view refresh orchestration hotspot.
- Graph baseline: `graphify-out/GRAPH_REPORT.md` lists `OpenCodianPlugin` as a hub with `86` edges in the committed `src` graph.
- Current `src/main.ts`: `1546` lines and `16` import statements.
- Current warmup/refresh surface in `src/main.ts`: plugin-local `modelRefreshFrameId`, `deferredRuntimeWarmupTimerId`, and `deferredRuntimeWarmupPromise` state plus `refreshOpenCodianViews()`, `invalidateSlashCommandMenuCatalogs()`, `queueModelRefresh()`, `clearQueuedModelRefresh()`, `scheduleDeferredRuntimeWarmup()`, `ensureRuntimeWarmupReadyForSessionBootstrap()`, `clearDeferredRuntimeWarmupTimer()`, `shouldWarmupRuntimeAfterStartup()`, `startDeferredRuntimeWarmup()`, and `runDeferredRuntimeWarmup()`.
- Current startup order evidence: `onload()` runs app icon registration, `prepareStartupState()`, `bootstrapOpenCodeRuntime()`, workspace integration registration, persists the startup trace, then calls `scheduleDeferredRuntimeWarmup()` after workspace integration.
- Current module-doc baseline: `docs/modules/entry-point/main.md` says `main.ts` still owns plugin-level state caches, UI refresh scheduling, diagnostics export, and local `.opencode` permission sync, while persisted settings merge/normalization has already moved to an adjacent bootstrap owner.

## Design Review Result

- Verdict: PASS.
- Review: The design targets exactly the queued Task 2 cluster and shrinks durable orchestration from `main.ts` rather than moving behavior into chat/service hotspots. A dedicated core runtime coordinator is justified because it owns multiple long-lived scheduler states and multi-call orchestration seams, not a one-off wrapper. The plugin remains the lifecycle owner and host for Obsidian services, preserving startup order by invoking the coordinator only after workspace integration. Tests can cover the public plugin seams already exercised by `main.test.ts`, and module docs/graphify can track the new owner boundary.

## Implementation Summary

- Completed Task 2 by moving deferred runtime warmup, session-bootstrap warmup readiness, model refresh frame scheduling, slash catalog fan-out, and cross-view UI/model refresh fan-out into the new durable `PluginRuntimeCoordinator` owner.
- `OpenCodianPlugin` now keeps lifecycle ordering, settings/storage/service construction, command registration, diagnostics, and host callbacks, while delegating startup-after-workspace warmup and repeated runtime refresh orchestration to the coordinator.
- Startup order remains unchanged: `onload()` still registers workspace integration before scheduling deferred warmup; `createConversation()` still waits for warmup readiness before creating an OpenCode session.
- The coordinator is not a one-method wrapper: it owns multiple long-lived scheduler states (`deferredRuntimeWarmupTimerId`, `deferredRuntimeWarmupPromise`, `modelRefreshFrameId`) and multi-call runtime orchestration seams.

## Files Changed

- `src/main.ts`: removed direct warmup timer/promise state, model refresh frame state, cross-view refresh fan-out, slash catalog invalidation fan-out, and warmup readiness implementation; added coordinator host wiring.
- `src/core/runtime/PluginRuntimeCoordinator.ts`: added the durable plugin runtime orchestration owner for warmup, model refresh, slash invalidation, and view refresh fan-out.
- `tests/unit/main.test.ts`: updated startup/warmup and slash invalidation tests to assert the coordinator seam while preserving existing behavior expectations.
- `docs/modules/entry-point/main.md`: documented the reduced entry-point ownership surface and the new runtime coordinator handoff.
- `docs/modules/core/runtime/PluginRuntimeCoordinator.md`: added module documentation for the new owner boundary, state, data flow, and guardrails.
- `docs/modules/README.md`: added the new core runtime module-doc path to the module map.
- `graphify-out/GRAPH_REPORT.md`, `graphify-out/graph.json`: refreshed src-scoped graph artifacts after adding the coordinator.
- `docs/status/lanes/h3-settings-bootstrap-package/autopilot-round-roadmap.md`: marked Task 2 `[DONE]` and promoted Task 3 to `[NEXT]`.

## Validation

- `npm test -- --runInBand tests/unit/main.test.ts tests/unit/main/themeSettingsMigration.test.ts` — PASS, 2 suites / 40 tests.
- `npm run graphify:update:src` — PASS, rebuilt and synced src-scoped graph artifacts.
- `npm run check:module-docs` — PASS, 374 source modules / 374 mapped docs and required docs OK.
- `npm run lint` — initially failed on import sorting in `PluginRuntimeCoordinator.ts`; focused repair ran `npx eslint src/core/runtime/PluginRuntimeCoordinator.ts --fix`.
- `npm run lint` — PASS after focused repair.
- `npm run typecheck` — initially failed because `startConfiguredLocalServerIfNeeded()` still needed `isLocalServerMode`; focused repair restored the import.
- `npm run typecheck` — PASS after focused repair.
- `npm run lint && npm test -- --runInBand tests/unit/main.test.ts tests/unit/main/themeSettingsMigration.test.ts` — PASS after repair, including targeted tests.
- `npm test` — PASS, 340 suites / 1736 tests.
- `npm run build` — PASS, `BUILD_ID: autopilot-hotspot-core-packaging-review-loop.202604302049`.
- `npm run check:graphify` — PASS.
- Vulture validation command is blank in round configuration, so no substitute command was run.
- No deploy step was required because this maintainability refactor did not require Test Vault deployment under the lane contract.

## Code Review Result

- Verdict: PASS.
- Review: The diff implements exactly H3 Task 2 and does not start Task 3 implementation. It shrinks `main.ts` by moving repeated runtime warmup/refresh scheduler state and fan-out behavior into a durable core coordinator, preserves startup order and session-bootstrap warmup semantics, avoids adding behavior to `OpenCodianView.ts` or `OpenCodeService.ts`, updates matching module docs, refreshes graphify after `src/` edits, and passes the configured validation gates. The final review removed a thin exported helper and corrected a stale `main.md` state description before rerunning affected and full gates. No background or detached work was used.

## Outcome

- Completed roadmap item: `[DONE] Task 2 - Package plugin startup, warmup, and refresh orchestration out of main.ts`.
- Hotspot delta: `src/main.ts` changed from `1546` to `1417` lines while removing direct ownership of deferred warmup timer/promise state, model refresh frame state, cross-view refresh fan-out, and slash catalog fan-out; import count changed from `16` to `17` because the new durable coordinator is imported.
- Acceptance: `main.ts` loses measurable assembly pressure, startup order and view refresh semantics remain covered by targeted tests, and the new coordinator owns durable multi-call runtime orchestration rather than an anemic wrapper.

## Next Recommended Slice

- Continue with `[NEXT] Task 3 - Package model-catalog presentation pressure and checkpoint settings-shell deltas` in the next round only.
