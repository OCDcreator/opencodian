# Owner: core.update

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.

- **Layer:** `core` (may import layers: shared, core)
- **Risk:** medium
- **Include:** `src/core/update/**`

## Responsibilities
- plugin update discovery and version comparison

## Canonical state (truth home)
- plugin update persisted state

> Cross-owner access is read-only snapshot/command/event. Do not replicate this state as a second writable truth source.

## Entrypoints
- `src/core/update/PluginUpdateService.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`
- **Forbidden dependencies:** `feature`, `app`
- **Adjacent owners** (prefer editing these when out of scope): `feature.settings-plugin`, `app.composition`

## Focused tests
- `tests/unit/core/update/**`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.

## Pi owner boundary review (2026-09-08)

The new core.backend-pi owner isolates the external Pi process service. core.update retains its existing responsibilities; Pi process lifecycle, RPC compatibility and native history must not be added to this owner.

## Update transaction progress (2026-09-10)

`PluginUpdateService` owns transient operation progress and its disposable snapshot events. Acquire the check or package-operation promise before publishing state or invoking injected IO; checks and installations/restores are mutually exclusive, including subscriber reentry. UI owners may display the current phase and completed-file count but must not invent byte progress. Only publish successful completion after package verification and final backup refresh; failed installation retains its error and publishes restoration before attempting rollback. Consumers must dispose subscriptions on close, and reopening reads the existing service snapshot.

## Unavailable release assets (2026-09-12)

`versions.json` can advertise a version whose Release assets were never uploaded, so "the index lists it" is not the same as "it can be installed". The service classifies a missing asset or a 404/410 download as `ReleaseAssetsUnavailableError`, retires that candidate as `installable: false` with an `unavailableReason`, and recomputes `latestRelease` to the newest still-installable release. `installNewestInstallable()` is the auto-update entry point and walks the catalogue newest-first; `app.runtime` must call it instead of installing a specific advertised version, and must treat a `null` result as "nothing to do" rather than an error. The retirement is in-memory only: a later `checkForUpdates()` re-reads the index, so a version with assets uploaded later recovers without any cache invalidation. Transient 5xx failures must stay retryable and must not retire a version.
