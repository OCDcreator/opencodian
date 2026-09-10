# Plugin Update Service

> **源码**: `src/core/update/PluginUpdateService.ts`
> **状态**: [REVIEW]
> **Updated**: 2026-07-27 — added static compatibility-index discovery, transactional self-update, and local rollback backups.

## 概述

`PluginUpdateService` owns OpenCodian's self-update boundary. It discovers the complete stable Release history, validates the three-file plugin package, exposes immutable UI snapshots, and replaces or restores the installed package through one serialized transaction.

The service is deliberately internal: it has no configurable release URL and never invokes Obsidian's internal reload APIs. Successful changes require the user to reload the plugin or restart Obsidian.

## 来源与版本目录

- GitHub Raw is the primary source: it reads the standard root `versions.json` once from the release branch. Gitea reads the same file only when GitHub Raw has a request failure, HTTP 429, or 5xx response.
- `versions.json` is a stable-SemVer-to-`minAppVersion` object. A reachable malformed index, an ordinary 4xx, or an invalid entry fails closed; the service does not merge or silently switch source lists.
- The selected source's stable entries are sorted descending. The fixed `vX.Y.Z` Release URL convention supplies the three asset URLs without querying the GitHub or Gitea Releases APIs.
- Every installation stages `main.js`, `manifest.json`, and `styles.css` before write. The downloaded manifest must match `opencodian`, the selected version, and the selected `versions.json` minimum version.
- Incompatible versions remain visible with `installable: false`; the service calls `requireApiVersion()` through an injectable seam for that decision.

## Public state and operations

- `checkForUpdates()` refreshes the selected source catalogue and local backups, then persists `lastCheckAt`, latest stable version, and source.
- `getSnapshot()` supplies the settings owner with current version, release/backup history, operation state, and a display-safe error.
- `onProgress(listener)` returns a disposable snapshot subscription. It reports check start/completion and installation progress; a failing listener cannot interrupt other consumers, installation, or rollback. New UI instances read `getSnapshot()` before subscribing, so an active or terminal operation remains visible after reopening settings.
- `installLatestStable()` and `installRelease(version)` only operate on the verified snapshot catalogue.
- `restoreBackup(id)` works offline from an already verified backup.
- `markVersionNotified(version)` persists the once-per-version startup-notice marker.

## Transaction and recovery

Release files are downloaded and validated completely before the current plugin is touched. The service then snapshots the current three files under `<plugin-dir>/.opencodian-update-backups`, retains the three newest complete backups, writes only the fixed asset names to the exact configured plugin directory, and reads every file back for byte-for-byte verification.

If a write or post-write verification fails, the original three-file package is written back and verified. Update and restore calls share one exclusive promise, preventing concurrent package changes.

Checks and package changes also exclude one another. Each operation acquires its promise lock before notifying subscribers or invoking injected IO; a progress callback cannot reenter installation or let a pending check overwrite installation state. A later check preserves the version installed during the current plugin lifetime instead of resetting it to the manifest captured at startup.

## Transient progress

`PluginUpdateSnapshot.progress` contains a target `version` and phase: `preparing`, `downloading`, `backing-up`, `installing`, `verifying`, `restoring-original`, `complete`, or `failed`. Preparing and `isApplying: true` are published synchronously before slow work begins. During download, `assetName`, `completedFiles`, and `totalFiles` report the current fixed asset and the number of complete validated download responses; no byte percentage is inferred from an opaque `requestUrl` request.

Backup, install, verification, and automatic restoration phases are published before their work begins. A failed operation retains `snapshot.error`; `complete` is published only after the transaction and final backup-list refresh finish. The operation lock remains held throughout that final refresh. Successfully verified package version is retained even if a later backup-list refresh fails. Progress lives only in service memory, remains readable after completion, and resets when the next check or package operation starts.

## Testing seams

`request`, `isApiVersionSupported`, `now`, and `persistState` are injectable. Unit tests use these seams with an in-memory `DataAdapter` to prove one-request static-index discovery, source fallback boundaries, index/manifest validation rejection, compatibility gating, complete staging, rollback recovery, retention, deferred-download progress, exact phase order, subscription disposal/failure isolation, and concurrent/reentrant-operation rejection.
