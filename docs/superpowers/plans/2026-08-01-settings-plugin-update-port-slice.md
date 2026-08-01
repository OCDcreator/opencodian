# Settings plugin-update port slice — 2026-08-01 (deferred until its own review)

## Boundary and decision

This is a Task 18 child plan. It is **discovery only** and authorizes no production,
test, manifest, configuration, generated-graph, ledger, devlog, or approval change. It
is **deferred until its own independent read-only review plus merge checkpoint**; nothing
here is implemented, scheduled, or approved. The parent inventory is
`docs/superpowers/plans/2026-08-01-settings-plugin-coupling-inventory.md`.

**Slice:** replace the type-only `import type OpenCodianPlugin from '../../main'` in
`src/features/settings/SettingsPluginUpdateSection.ts` with a consumer-owned type-only
`SettingsPluginUpdatePort`, colocated with the section. This is the narrowest possible
settings port: the section reaches exactly one plugin member, `pluginUpdateService`.
The shell adapts `OpenCodianPlugin` → the port; the plugin's public
`pluginUpdateService` getter is unchanged.

## Owner current → target

- **Current owner:** `feature.settings-plugin` (medium risk; the section lives in this
  catch-all owner). The slice targets only `SettingsPluginUpdateSection.ts`; the other
  nine `feature.settings-plugin` importers remain deferred.
- **Target owner:** `feature.settings-plugin` (same owner; same-owner type-seam).
- **Retirement / expiry:** retain through Phase 5 to **2026-09-01**. On expiry, run a
  fresh per-domain CodeGraph + member-access inventory and obtain an independent review/
  merge checkpoint, **or** record an explicitly approved deferred-owner/expiry extension
  before any source move. Neither expiry passage nor a passing test authorizes
  implementation.

## Scope and evidence

The plugin-update domain is a single section:

- `src/features/settings/SettingsPluginUpdateSection.ts` (the sole importer in scope).

`this.plugin.<member>` accesses (from `grep -hoE this\.plugin\.[A-Za-z0-9_]+`):

```
   6 this.plugin.pluginUpdateService
```

The section reaches **only** `this.plugin.pluginUpdateService`, used as:
`getSnapshot()` (lines 33, 262, 331), `checkForUpdates()` (321),
`installRelease(version)` (337), `restoreBackup(id)` (351). The
`PluginUpdateService` type and its `PluginUpdateSnapshot`/`PluginUpdateRelease`/
`PluginUpdateBackup`/`comparePluginVersions` companions are already imported directly
from `'../../core/update/PluginUpdateService'` (line 3) — only the *service instance*
arrives via `this.plugin.pluginUpdateService`. The `SettingsPluginUpdateSectionOptions`
also carries `requestDisplayRefresh`, `isExpanded`, `onExpandedChange`, which are already
narrow callbacks and unchanged.

### CodeGraph evidence (re-run before any source edit)

`codegraph status` reported CodeGraph 1.5.0, complete, `pendingChanges` zero. Root
reproduction (caller lists are function/method only):

```bash
./node_modules/.bin/codegraph query 'SettingsPluginUpdateSection' --json \
  | jq '[.[] | select(.node.kind=="class" or .node.kind=="interface") | {name:.node.name,kind:.node.kind,filePath:.node.filePath,startLine:.node.startLine,id:.node.id}]'
# one class: SettingsPluginUpdateSection (class:6c05dbb83468947fa02c61080c93c1d8, SettingsPluginUpdateSection.ts:19)
# + its own SettingsPluginUpdateSectionOptions interface (line 7)

./node_modules/.bin/codegraph callers 'SettingsPluginUpdateSection' --json \
  | jq '[.callers[]? | select(.kind=="function" or .kind=="method") | {name,kind,filePath,startLine}]'
# OpenCodianSettings.renderPluginUpdateSection (OpenCodianSettings.ts:171)
# OpenCodianSettingsView.renderPluginUpdateSection (OpenCodianSettingsView.ts:309)
# tests/unit/features/settings/SettingsPluginUpdateSection.test.ts createSection (line 63)

./node_modules/.bin/codegraph impact 'SettingsPluginUpdateSection' --depth 2 --json \
  | jq '{depth,nodeCount,edgeCount,root:(.affected[0]|{name,kind,filePath,startLine})}'
# depth 2: 33 nodes / 49 edges; root SettingsPluginUpdateSection
```

One definition, no collision. The two production callers are the shell sites that must
adapt the port.

## Exact narrow port / composition

No port is created by this plan. The re-entry seam is a consumer-owned type-only
`SettingsPluginUpdatePort`, colocated at `src/features/settings/SettingsPluginUpdateSection.ts`
(or a sibling under the owner's include), defining exactly:

- `pluginUpdateService: PluginUpdateService` — imported as a type from
  `'../../core/update/PluginUpdateService'` (the same module the section already imports
  for its value types), not from `'../../main'`.

That is the entire port. The shell constructs
`new SettingsPluginUpdateSection({ pluginUpdateService: this.plugin.pluginUpdateService,
requestDisplayRefresh, ... })`. The port must not expose `settings`, `saveSettings`,
`app`, or any other plugin member; it must not become a generic plugin dump or a runtime
forwarding module. This is the canonical "short port that removes the complete
`OpenCodianPlugin` dependency" allowed by the parent plan (lines 802, 917).

## Characterization matrix (named tests — verified to exist)

Every test below was confirmed to exist under `tests/unit/features/settings/` before
listing:

- `tests/unit/features/settings/SettingsPluginUpdateSection.test.ts` — section render,
  snapshot badge states (idle/checking/error/empty/update/current), check-for-updates,
  install-release, restore-backup, downgrade guard.
- `tests/unit/features/settings/SettingsPluginUpdateSection.cssContract.test.ts` — CSS
  contract / data-attribute surface (`data-plugin-update-status`,
  `data-plugin-update-source`, `data-plugin-update-applying`).

A re-entry must add a port-shape contract test asserting the port carries exactly
`pluginUpdateService` and that `getSnapshot`/`checkForUpdates`/`installRelease`/
`restoreBackup` delegation is byte-for-byte unchanged.

## Falsifiable acceptance / abort

- **Accept only if:** `SettingsPluginUpdateSection.ts` no longer imports
  `OpenCodianPlugin` from `'../../main'`; it compiles against `SettingsPluginUpdatePort`
  alone; the shell is the only adapter; `getSnapshot()`/`checkForUpdates()`/
  `installRelease()`/`restoreBackup()` behave byte-for-byte characterization-equivalently;
  badge variant transitions and the CSS data-attribute contract are unchanged; and the
  downgrade guard still compares `currentVersion` to `release.version` identically.
- **Abort before source move if:** the port needs `settings`, `saveSettings`, `app`,
  `manifest`, or any non-update member; a query root differs from
  `class:6c05dbb83468947fa02c61080c93c1d8`; the port grows beyond
  `pluginUpdateService`, a runtime forwarding module, or `unknown` casts; or focused
  tests pass but full `npm run verify` fails and the fix crosses out of this owner.

## Exact future transaction and rollback file set

If and only if re-entry passes, C receives the test paths below and B receives the
source/doc paths below; their combined exact permitted file set is:

- `src/features/settings/SettingsPluginUpdateSection.ts` (switch to
  `SettingsPluginUpdatePort`);
- `src/features/settings/OpenCodianSettings.ts` (adapt in
  `renderPluginUpdateSection`);
- `src/features/settings/OpenCodianSettingsView.ts` (same adaptation);
- `tests/unit/features/settings/SettingsPluginUpdateSection.test.ts`;
- `tests/unit/features/settings/SettingsPluginUpdateSection.cssContract.test.ts`;
- `docs/modules/features/settings/SettingsPluginUpdateSection.md`;
- `docs/architecture/owners/feature-settings-plugin.md`.

**Exact manifest/config/index-export set: empty.** `architecture-owners.config.json`,
`module-docs.config.json`, `manifest.json`, `package.json`, and every
`src/features/settings/index.ts` are explicitly untouched. The port is type-only and
colocated; no barrel re-export is permitted.

### Mandatory C/B/G topology and rollback

1. **C — characterization commit, retained:** the two test files above.
2. **B — behavior commit, independently reversible:**
   `SettingsPluginUpdateSection.ts`, the two shell adapter lines
   (`OpenCodianSettings.ts`/`OpenCodianSettingsView.ts`), plus the two doc files. No graph
   artifact, manifest, config, barrel, or test in B.
3. **G — graph snapshot after B:** `npm run graphify:update:src` && `npm run
   check:graphify`, then commit only `graphify-out/GRAPH_REPORT.md`,
   `graphify-out/graph.json`, `graphify-out/input-manifest.json`.

Rollback: `git revert --no-edit G`; `git revert --no-edit B`; `npm run
graphify:update:src`; `npm run check:graphify`; commit the three graph artifacts only if
they changed as `chore(graphify): restore src graph after B`. Rerun the matrix and `npm
run verify`. A changed manifest/config/barrel or a digest not matching restored source
is an abort, not permission to amend B.

## Re-entry gates

Run and record, in order: the CodeGraph reproduction above; the characterization matrix
(green); then `npm run typecheck`, `npm run inspect:owner -- <each changed path>
--json`, `npm run check:owner-manifest`, `npm run check:owner-boundaries`, `npm run
check:dependency-direction`, `npm run check:architecture-cycles`, `npm run
check:architecture-approvals`, `npm run verify:architecture`, `npm run check:module-docs`;
then `npm run graphify:update:src`, `npm run check:graphify`, `npm run verify`, `npm run
build`; then `git diff --name-only --diff-filter=ACMR | ./node_modules/.bin/codegraph
affected --stdin --path . --json`. Test Vault deployment: settings are deploy-relevant
per `AGENTS.md`; a type-only port here is not by itself deploy-relevant, but the shell
adapter line may be — verify against `AGENTS.md` at re-entry and deploy sequentially with
`BUILD_ID` proof only if a deploy-relevant path changed.

## Baseline → target metric

- Baseline importing files for this domain: **1** (`SettingsPluginUpdateSection.ts`).
- Target after this child plan: **0** for that file (the other nine
  `feature.settings-plugin` importers remain deferred).
- Re-verify with `rg -l "OpenCodianPlugin"
  src/features/settings/SettingsPluginUpdateSection.ts` (must be empty post-B).
