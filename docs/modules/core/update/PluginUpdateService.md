# Plugin Update Service

> **源码**: `src/core/update/PluginUpdateService.ts`
> **状态**: [REVIEW]
> **Updated**: 2026-07-27 — added stable-release discovery, transactional self-update, and local rollback backups.

## 概述

`PluginUpdateService` owns OpenCodian's self-update boundary. It discovers the complete stable Release history, validates the three-file plugin package, exposes immutable UI snapshots, and replaces or restores the installed package through one serialized transaction.

The service is deliberately internal: it has no configurable release URL and never invokes Obsidian's internal reload APIs. Successful changes require the user to reload the plugin or restart Obsidian.

## 来源与版本目录

- GitHub Releases is the primary source. Gitea is queried only when GitHub is unavailable because of a request failure, HTTP 429, rate-limit 403, or 5xx response.
- A reachable source that returns malformed metadata, an ordinary 4xx response, an invalid manifest, or invalid assets fails closed; the service does not merge or silently switch source lists.
- Every page is read (`per_page`/`limit` 100, capped at 500 pages), drafts and prereleases are omitted, and valid stable SemVer tags are sorted descending.
- Each listed release must have exactly `main.js`, `manifest.json`, and `styles.css`. Its manifest must match the `vX.Y.Z` tag, identify `opencodian`, and contain stable `version` and `minAppVersion` values.
- Incompatible releases remain visible with `installable: false`; the service calls `requireApiVersion()` through an injectable seam for that decision.

## Public state and operations

- `checkForUpdates()` refreshes the selected source catalogue and local backups, then persists `lastCheckAt`, latest stable version, and source.
- `getSnapshot()` supplies the settings owner with current version, release/backup history, operation state, and a display-safe error.
- `installLatestStable()` and `installRelease(version)` only operate on the verified snapshot catalogue.
- `restoreBackup(id)` works offline from an already verified backup.
- `markVersionNotified(version)` persists the once-per-version startup-notice marker.

## Transaction and recovery

Release files are downloaded and validated completely before the current plugin is touched. The service then snapshots the current three files under `<plugin-dir>/.opencodian-update-backups`, retains the three newest complete backups, writes only the fixed asset names to the exact configured plugin directory, and reads every file back for byte-for-byte verification.

If a write or post-write verification fails, the original three-file package is written back and verified. Update and restore calls share one exclusive promise, preventing concurrent package changes.

## Testing seams

`request`, `isApiVersionSupported`, `now`, and `persistState` are injectable. Unit tests use these seams with an in-memory `DataAdapter` to prove pagination, source fallback boundaries, validation rejection, compatibility gating, complete staging, rollback recovery, retention, and concurrent-operation rejection.

