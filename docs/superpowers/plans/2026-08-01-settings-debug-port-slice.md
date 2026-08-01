# Settings debug port slice — 2026-08-01 (deferred until its own review)

## Boundary and decision

This is a Task 18 child plan. It is **discovery only** and authorizes no production,
test, manifest, configuration, generated-graph, ledger, devlog, or approval change. It
is **deferred until its own independent read-only review plus merge checkpoint**; nothing
here is implemented, scheduled, or approved. The parent inventory is
`docs/superpowers/plans/2026-08-01-settings-plugin-coupling-inventory.md`.

**Slice:** replace the type-only `import type OpenCodianPlugin from '../../main'` in
`src/features/settings/SettingsDebugSection.ts` with a consumer-owned type-only
`SettingsDebugPort`, colocated with `feature.settings-debug`. The shell
(`OpenCodianSettings`/`OpenCodianSettingsView`) adapts `OpenCodianPlugin` → the port;
the plugin's public surface (`settings`, trace-service getters, `saveSettings`,
diagnostic actions) is unchanged.

## Owner current → target

- **Current owner:** `feature.settings-debug` (high risk).
- **Target owner:** `feature.settings-debug` (same owner; this is a same-owner type-seam
  introduction, not an owner transfer).
- **Retirement / expiry:** retain through Phase 5 to **2026-09-01**. On expiry, run a
  fresh per-domain CodeGraph + member-access inventory and obtain an independent review/
  merge checkpoint, **or** record an explicitly approved deferred-owner/expiry extension
  before any source move. Neither expiry passage nor a passing test authorizes
  implementation.

## Scope and evidence

The debug domain is one section plus three trace panels:

- `src/features/settings/SettingsDebugSection.ts` (the sole importer of
  `OpenCodianPlugin` in this owner).
- `src/features/settings/debug/OpenCodeDebugPanel.ts`,
  `src/features/settings/debug/CodexDebugPanel.ts`,
  `src/features/settings/debug/ClaudeCodeDebugPanel.ts` (these receive narrow
  diagnostics ports from the section; they do **not** import `OpenCodianPlugin`).

`this.plugin.<member>` accesses in `SettingsDebugSection.ts` (from
`grep -hoE this\.plugin\.[A-Za-z0-9_]+`):

```
  23 this.plugin.settings
  10 this.plugin.saveSettings
   2 this.plugin.getDebugBuildIdentityText
   1 this.plugin.writeDiagnosticLogFile
   1 this.plugin.logServerStatusSnapshot
   1 this.plugin.buildDiagnosticReport
```

The three trace services (`openCodeTraceService`/`codexTraceService`/`claudeTraceService`)
are read **by the shell** when it wires `getOpenCodeDiagnostics`/
`getCodexDiagnostics`/`getClaudeDiagnostics`; the section itself consumes only the
resulting diagnostics ports. The `feature.settings-debug` manifest already documents
this direction: canonicalState `"backend trace settings persisted in
OpenCodianPlugin.settings; panels keep no second settings copy"` and `"trace status and
catalog state owned by app diagnostics services and exposed through narrow ports"`.

### CodeGraph evidence (re-run before any source edit)

`codegraph status` reported CodeGraph 1.5.0, complete, `pendingChanges` zero. Root
reproduction (caller lists are function/method only):

```bash
./node_modules/.bin/codegraph query 'SettingsDebugSection' --json \
  | jq '[.[] | select(.node.kind=="class" or .node.kind=="interface") | {name:.node.name,kind:.node.kind,filePath:.node.filePath,startLine:.node.startLine,id:.node.id}]'
# one class: SettingsDebugSection (class:f40625da621553de403c758ad8459986, SettingsDebugSection.ts:116)
# + its own SettingsDebugSectionOptions interface (line 65)

./node_modules/.bin/codegraph callers 'SettingsDebugSection' --json \
  | jq '[.callers[]? | select(.kind=="function" or .kind=="method") | {name,kind,filePath,startLine}]'
# OpenCodianSettings.addDebugSettings (OpenCodianSettings.ts:572)
# OpenCodianSettingsView.addDebugSettings (OpenCodianSettingsView.ts:489)
# SettingsTabbedRenderer.renderDebugContent (SettingsTabbedRenderer.ts:518)
# tests: createSection, createTabbedSection, renderTabbed (x2)

./node_modules/.bin/codegraph impact 'SettingsDebugSection' --depth 2 --json \
  | jq '{depth,nodeCount,edgeCount,root:(.affected[0]|{name,kind,filePath,startLine})}'
# depth 2: 72 nodes / 120 edges; root SettingsDebugSection
```

One definition, no collision. The two production callers (`OpenCodianSettings` and
`OpenCodianSettingsView`) are the shell sites that must adapt the port; the
`SettingsTabbedRenderer` caller is also shell-owned and already receives the constructed
section, so it needs no plugin reference change.

## Exact narrow port / composition

No port is created by this plan. The re-entry seam is a consumer-owned type-only
`SettingsDebugPort`, colocated at `src/features/settings/SettingsDebugSection.ts` (or a
sibling under the debug owner's include), defining exactly:

- `settings: OpenCodianPlugin['settings']` — but narrowed in practice to the debug
  fields the section reads: `enableDebugLogging`, `inlineSerializedDebugLogArgs`,
  `debugModuleSettings`, `debugRefreshIntervalMs`, `debugLogPaths`, and the three
  `backendSettings.openCode`/`codex`/`claudeCode` debug/trace slices. The port type may
  reference the full `OpenCodianSettings` type (already in `core/types`) without
  importing `main.ts`.
- `saveSettings: OpenCodianPlugin['saveSettings']`.
- `getDebugBuildIdentityText: OpenCodianPlugin['getDebugBuildIdentityText']`.
- `writeDiagnosticLogFile: OpenCodianPlugin['writeDiagnosticLogFile']`.
- `logServerStatusSnapshot: OpenCodianPlugin['logServerStatusSnapshot']`.
- `buildDiagnosticReport: OpenCodianPlugin['buildDiagnosticReport']`.

The existing `getOpenCodeDiagnostics`/`getCodexDiagnostics`/`getClaudeDiagnostics` and
`createSectionHeading` callbacks in `SettingsDebugSectionOptions` are already narrow and
unchanged. The shell constructs `new SettingsDebugSection({ port:
this.pluginAsDebugPort(), ... })` (or spreads the plugin's bound methods). The port must
not expose `openCodeTraceService`/`codexTraceService`/`claudeTraceService` directly,
`agentServiceRegistry`, `openCodeService`, or any non-debug member; it must not become a
generic settings dump.

## Characterization matrix (named tests — verified to exist)

Every test below was confirmed to exist under `tests/unit/features/settings/` before
listing:

- `tests/unit/features/settings/SettingsDebugSection.test.ts` — section shell/router,
  tab mounting, settings toggle → save.
- `tests/unit/features/settings/SettingsDebugSection.navSeam.test.ts` — tab navigation
  seam.
- `tests/unit/features/settings/SettingsDebugSection.diagnostics-characterization.test.ts`
  — diagnostic-action characterization (build identity, log file, report, status
  snapshot).
- `tests/unit/features/settings/SettingsDebugSection.codex.test.ts` — Codex panel
  settings/status/actions/catalog/capture-content.
- `tests/unit/features/settings/SettingsDebugSection.claude-trace.test.ts` — Claude
  panel workbench DOM, console channels, session-trace settings/actions/catalog/filter.
- `tests/unit/features/settings/OpenCodeDebugPanel.test.ts`,
  `tests/unit/features/settings/CodexDebugPanel.test.ts`,
  `tests/unit/features/settings/ClaudeCodeDebugPanel.test.ts` — per-backend panel
  parity through the narrow diagnostics ports.

A re-entry must extend the section test to assert the port receives exactly the listed
members and that a missing/throwing diagnostic action cannot corrupt settings save
order or trace-port wiring.

## Falsifiable acceptance / abort

- **Accept only if:** `SettingsDebugSection.ts` no longer imports `OpenCodianPlugin`
  from `'../../main'`; the section compiles against `SettingsDebugPort` alone; the shell
  is the only place adapting `OpenCodianPlugin` → the port; every debug setting toggle
  still persists through `saveSettings`; each diagnostic action
  (`getDebugBuildIdentityText`/`writeDiagnosticLogFile`/`logServerStatusSnapshot`/
  `buildDiagnosticReport`) returns byte-for-byte characterization-equivalent results; and
  the three trace panels still mount through their existing narrow diagnostics ports with
  no second settings copy.
- **Abort before source move if:** the port needs `openCodeTraceService`/
  `codexTraceService`/`claudeTraceService` directly, `agentServiceRegistry`,
  `openCodeService`, or any non-debug member; a query root differs from
  `class:f40625da621553de403c758ad8459986`; the port grows a generic settings dump or a
  runtime forwarding module; or `diagnostics-safety` canaries fail.

## Exact future transaction and rollback file set

If and only if re-entry passes, C receives the test paths below and B receives the
source/doc paths below; their combined exact permitted file set is:

- `src/features/settings/SettingsDebugSection.ts` (switch to `SettingsDebugPort`);
- `src/features/settings/OpenCodianSettings.ts` (adapt `OpenCodianPlugin` → port in
  `addDebugSettings`);
- `src/features/settings/OpenCodianSettingsView.ts` (same adaptation);
- `src/features/settings/SettingsTabbedRenderer.ts` (only if its `renderDebugContent`
  signature changes; otherwise omit);
- `tests/unit/features/settings/SettingsDebugSection.test.ts`;
- `tests/unit/features/settings/SettingsDebugSection.navSeam.test.ts`;
- `tests/unit/features/settings/SettingsDebugSection.diagnostics-characterization.test.ts`;
- `tests/unit/features/settings/SettingsDebugSection.codex.test.ts`;
- `tests/unit/features/settings/SettingsDebugSection.claude-trace.test.ts`;
- `docs/modules/features/settings/SettingsDebugSection.md`;
- `docs/architecture/owners/feature-settings-debug.md`.

**Exact manifest/config/index-export set: empty.** `architecture-owners.config.json`,
`module-docs.config.json`, `manifest.json`, `package.json`, and every
`src/features/settings/index.ts` are explicitly untouched. The port is type-only and
colocated; no barrel re-export is permitted.

### Mandatory C/B/G topology and rollback

1. **C — characterization commit, retained:** the five `SettingsDebugSection*` test files
   above.
2. **B — behavior commit, independently reversible:** `SettingsDebugSection.ts`, the
   shell adapter lines in `OpenCodianSettings.ts`/`OpenCodianSettingsView.ts` (and
   `SettingsTabbedRenderer.ts` only if its signature changes), plus the two doc files.
   No graph artifact, manifest, config, barrel, or test in B.
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
check:architecture-approvals`, `npm run verify:architecture`, `npm run check:module-docs`,
`npm run check:graphify` (diagnostics-safety is already a required gate of
`feature.settings-debug`); then `npm run graphify:update:src`, `npm run verify`, `npm run
build`; then `git diff --name-only --diff-filter=ACMR | ./node_modules/.bin/codegraph
affected --stdin --path . --json`. Test Vault deployment is conditional: deploy
sequentially only if a deploy-relevant `AGENTS.md` path changed (settings/style/theme are
deploy-relevant; a type-only port in `SettingsDebugSection.ts` is not by itself), then
prove `BUILD_ID`.

## Baseline → target metric

- Baseline importing files for this domain: **1** (`SettingsDebugSection.ts`).
- Target after this child plan: **0**.
- Re-verify with `rg -l "OpenCodianPlugin" src/features/settings/SettingsDebugSection.ts`
  (must be empty post-B).
