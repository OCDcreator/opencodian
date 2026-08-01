# Settings plugin-type coupling inventory and per-domain decision — 2026-08-01

## Task 18 boundary and outcome

This is Phase 5 / Task 18's dated, docs-only discovery inventory. It authorizes
**no** production, test, manifest, configuration, generated-graph, ledger, devlog, or
approval change. The only Task 18 artifacts are this file plus the dated child plans it
names. Every `import type OpenCodianPlugin from '../../main'` in
`src/features/settings/**` remains exactly as it is; no port is created, approved, or
merged by this inventory.

**Decision after independent CodeGraph reproduction and per-domain member-access
inventory:** three settings domains — **debug**, **model-catalog**, and
**plugin-update** — are independently releasable enough to receive a dated child plan
that fully characterizes a narrow consumer-owned `Settings<Domain>Port` slice. The
remaining domains — **claude**, **codex**, **opencode**, **style**, **agents**,
**mcp**, **shell**, and the broad **plugin** bucket — are **deferred with owner
`feature.settings-*` and a hard expiry of 2026-09-01**, because each crosses a shared
service registry, a broad appearance-callback surface, cross-domain construction, or is
the shell that owns the composition seam itself. No implementation slice is approved by
this inventory. Each child plan is a "deferred until its own review/merge checkpoint"
artifact; nothing here claims a slice is implemented.

This matches the parent plan's Stop and Rollback Conditions (lines 907–919): a thin port
is allowed only when it removes the complete `OpenCodianPlugin` dependency and is
consumer-owned/colocated, never a settings mega-port, one-interface-per-callback,
runtime forwarding module, `unknown` cast, or global lookup.

## Owner facts and non-negotiable contracts

The manifest already decomposes `src/features/settings/**` into one shell owner plus
nine delegated sub-owners (`architecture-owners.config.json`). All ten are `layer:
feature`, all `forbid` `app`, and every settings file resolves to exactly one of them
via `npm run inspect:owner` / `node scripts/inspect-owner.mjs`. The shell owns the
composition seam; the sub-owners own their domain sections.

```bash
$ cat architecture-owners.config.json | jq -r '.owners[] | select(.id|startswith("feature.settings")) | "\(.id)\t\(.risk)"'
feature.settings-shell	high
feature.settings-debug	high
feature.settings-model-catalog	medium
feature.settings-claude	medium
feature.settings-codex	medium
feature.settings-opencode	medium
feature.settings-style	medium
feature.settings-mcp	medium
feature.settings-agents	medium
feature.settings-plugin	medium
```

`feature.settings-shell` (high risk, `include: src/features/settings/**`) delegates to
all nine sub-owners. Its `allowedOwnerDependencies` is `["shared.foundation",
"core.types", "core.config"]`, `forbiddenDependencies: ["app"]`, `requiredGates:
["typecheck", "module-docs", "build"]`, entrypoints `OpenCodianSettings.ts` and
`OpenCodianSettingsView.ts`, and canonical state `["OpenCodianSettings normalized
state", "settings section coordinator state"]`.

`feature.settings-debug` (high risk) is the most explicitly port-ready owner. Its
manifest already documents the intended direction verbatim:

- responsibilities include "shared debug section shell/router, plugin export actions"
  and three complete per-backend trace panels each ending in "narrow diagnostics-port
  wiring";
- canonicalState: `"backend trace settings persisted in OpenCodianPlugin.settings;
  panels keep no second settings copy"` and `"trace status and catalog state owned by
  app diagnostics services and exposed through narrow ports"`;
- `allowedOwnerDependencies: ["shared.foundation", "shared.diagnostics",
  "core.opencode-diagnostics", "core.backend-diagnostics", "core.types"]`;
- `requiredGates` includes `"diagnostics-safety"`.

Non-negotiable contracts preserved by every card below:

1. `OpenCodianPlugin.settings` (the `OpenCodianSettings` object), `OpenCodianPlugin.app`,
   `OpenCodianPlugin.openCodeService`, `OpenCodianPlugin.sdk`, and every service getter
   (`modelConfigService`, `modelPricingService`, `opencodeConfigManager`,
   `pluginUpdateService`, `agentServiceRegistry`, trace services) remain public and are
   **not** privatized, removed, or migrated. The ports proposed here are consumer-owned
   type-only seams that replace the *import* of the monolith plugin type inside a domain;
   they do not change the plugin's public surface.
2. No port may leak a mutable `Map`, listener set, registry, raw SDK client, store
   writer, or a generic `unknown`/cast/global lookup. A short port is allowed only when
   it removes the complete `OpenCodianPlugin` dependency and is colocated with the
   consumer owner.
3. The shell (`feature.settings-shell`) remains the single composition point that
   constructs every section and passes it the plugin instance. No card creates a second
   composition root, a settings mega-port, or a runtime forwarding module.
4. `main.ts` gains no new incoming `src/features/settings` import outside a recorded,
   independently reviewed app/reverse/type-cycle/canonical exception.

## Current behavior inventory: file → owner and `this.plugin.<member>` accesses

Every one of the 54 files that import `OpenCodianPlugin` does so **type-only**
(`import type OpenCodianPlugin from '../../main'`; two files use
`import type { OpenCodianPlugin }`). Per-owner file counts of the 54 importers:

```
  10 feature.settings-plugin
   7 feature.settings-model-catalog
   7 feature.settings-agents
   6 feature.settings-style
   6 feature.settings-opencode
   6 feature.settings-codex
   5 feature.settings-shell
   5 feature.settings-claude
   1 feature.settings-mcp
   1 feature.settings-debug
```

The exact `this.plugin.<member>` accesses per domain (from `grep -rhoE
this\.plugin\.[A-Za-z0-9_]+` over each owner's importing files), with the unique members
each domain actually reaches:

| Domain (owner) | Importing files | `this.plugin.<member>` members actually used (count) |
|---|---|---|
| **debug** (`feature.settings-debug`) | `SettingsDebugSection.ts` | `settings`(23), `saveSettings`(10), `getDebugBuildIdentityText`(2), `writeDiagnosticLogFile`(1), `logServerStatusSnapshot`(1), `buildDiagnosticReport`(1). Trace services (`openCodeTraceService`/`codexTraceService`/`claudeTraceService`) are read **by the shell** when wiring `getOpenCodeDiagnostics`/`getCodexDiagnostics`/`getClaudeDiagnostics`, not by the section. |
| **model-catalog** (`feature.settings-model-catalog`) | `SettingsModelSection.ts`, `SettingsModelCatalogCoordinator.ts`, `SettingsModelIconCacheManager.ts`, `SettingsModelCatalogAvailability.ts`, `SettingsModelCatalogPresenter.ts`, `ModelConfigModal.ts`, `ModelPricingModal.ts`, `ModelConfigJsonModal.ts`, `ModelConfigProviderEditor.ts` | `settings`(39), `modelConfigService`(16), `saveSettings`(7), `openCodeService`(7), `modelPricingService`(5), `applyProviderIconColorMode`(4), `scheduleSettingsUiStateSave`(2), `app`(1) |
| **opencode** (`feature.settings-opencode`) | `SettingsBackendSection.ts`, `SettingsServerSection.ts`, `SettingsCommandsSection.ts`, `SettingsProjectAgentEditor.ts`, `SettingsProjectCommandEditor.ts`, `CostEstimateSettingsRow.ts` | `settings`(64), `saveSettings`(15), `openCodeService`(12), `agentServiceRegistry`(7), `opencodeConfigManager`(2) |
| **claude** (`feature.settings-claude`) | `SettingsClaudeCodeSection.ts`, `SettingsClaudeConfigurationSection.ts`, `SettingsClaudeProviderMetadataPersistenceCoordinator.ts`, `SettingsClaudeProvidersSection.ts`, `SettingsClaudeResourcesSection.ts` | `app`(8), `settings`(4), `invalidateSlashCommandCatalog`(3), `agentServiceRegistry`(2), `saveSettings`(1) |
| **codex** (`feature.settings-codex`) | `SettingsCodexSection.ts`, `SettingsCodexProjectConfigSection.ts`, `SettingsCodexAccountSurface.ts`, `SettingsCodexLegacyCredentialControl.ts`, `SettingsCodexReadbackControls.ts`, `SettingsCodexResourcesSection.ts` | `settings`(25), `agentServiceRegistry`(15), `saveSettings`(10), `app`(9), `manifest`(1), `loadBackendSessionConversation`(1), `invalidateSlashCommandCatalog`(1), `createConversationFromBackendSession`(1) |
| **style** (`feature.settings-style`) | `SettingsStyleSection.ts`, `settingsStyleControls.ts`, `SettingsStyleInputPanelSection.ts`, `SettingsStyleLiquidGlassInputControls.ts`, `SettingsStylePresetSection.ts`, `SettingsStyleBackgroundSection.ts` | `settings`(95), `getChatAppearanceBaseline`(39), `updateChatAppearance`(7), `saveSettings`(2), `getActiveThemePresetDefinition`(2), plus 10 single-use appearance/theme callbacks (`selectThemePresetAndSave`, `scheduleChatAppearanceSave`, `resolveChatThemeBackgroundDataUrl`, `resetThemePresetAppearanceAndSave`, `resetChatAppearanceToBaselineAndSave`, `resetChatAppearanceGroupAndSave`, `resetChatAppearanceGroup`, `importChatThemeBackgroundFile`, `clearChatThemeBackground`, `applyChatAppearanceSettings`) |
| **agents** (`feature.settings-agents`) | `SettingsAgentsSection.ts`, `SettingsToolSection.ts`, `SettingsToolDetailModal.ts`, `SettingsToolFileService.ts`, `SettingsSkillSection.ts`, `capabilityDisclosureRow.ts`, `SettingsCapabilityLabSection.ts`, `SettingsMcpSection.ts`(mcp owner) | `openCodeService`(24), `app`(23), `settings`(17), `opencodeConfigManager`(14), `claudeCodePermissionHostContext`(5), `saveSettings`(4), `agentServiceRegistry`(4), `claudeCodePermissionBridge`(2), `getConversations`(1) |
| **mcp** (`feature.settings-mcp`) | `SettingsMcpSection.ts` | (counted within agents row above; mcp reaches `openCodeService`, `opencodeConfigManager`, `app`, `settings`) |
| **plugin** (`feature.settings-plugin`) | `SettingsPluginSection.ts`, `SettingsPluginUpdateSection.ts`, `SettingsAcpSection.ts`, `SettingsConversationSection.ts`, `SettingsSecuritySection.ts`, `SettingsUiSection.ts`, `SettingsUserSection.ts`, `SettingsFormatterSection.ts`, `ProviderBuiltinIconPickerModal.ts`, `ProviderIconCacheModal.ts` | `settings`(130), `saveSettings`(34), `openCodeService`(22), `opencodeConfigManager`(20), `app`(8), `pluginUpdateService`(6), `refreshQuestionUi`(3), `refreshConversationRendering`(3), `modelConfigService`(2), `agentServiceRegistry`(2), `reapplyConversationSessionDefaults`(1) |
| **shell** (`feature.settings-shell`) | `OpenCodianSettings.ts`, `OpenCodianSettingsView.ts`, `SettingsPanelChrome.ts`, `SettingsTabbedRenderer.ts`, `SettingsViewRegistrar.ts` | `settings`(24), `saveSettings`(4), `openCodeTraceService`(2), `codexTraceService`(2), `claudeTraceService`(2), `scheduleSettingsUiStateSave`(1) |

The composition seam: `OpenCodianSettingsView` holds `private readonly plugin:
OpenCodianPlugin` and, in each `addXxxSettings` method, constructs the section with
`plugin: this.plugin` plus narrow callbacks (e.g. debug also receives
`getOpenCodeDiagnostics: () => createOpenCodeTraceDiagnosticsPort(this.plugin.openCodeTraceService)`).
Each section then reaches `this.plugin.<member>` for its data and services. The
consumer-owned port replaces `plugin: OpenCodianPlugin` in a section's options with a
narrow `Settings<Domain>Port`; the shell remains the only place that adapts
`OpenCodianPlugin` → each port.

## CodeGraph evidence and reproducible method

`./node_modules/.bin/codegraph status --json` reported CodeGraph 1.5.0, state `complete`,
`pendingChanges` all zero, `worktreeMismatch: null`, 24,937 nodes / 119,024 edges. No
`init` was run. Every row below was root-queried, then given actual function/method
callers and a finite depth-2 impact from the repository root. Caller lists include only
`function`/`method` nodes (never `file` nodes). `query` is the root-file/id confirmation.

```bash
./node_modules/.bin/codegraph query '<Symbol>' --json \
  | jq '[.[] | select(.node.kind=="class" or .node.kind=="interface" or .node.kind=="function") | {name:.node.name,kind:.node.kind,filePath:.node.filePath,startLine:.node.startLine,id:.node.id}]'
./node_modules/.bin/codegraph callers '<Symbol>' --json \
  | jq '[.callers[]? | select(.kind=="function" or .kind=="method") | {name,kind,filePath,startLine}]'
./node_modules/.bin/codegraph impact '<Symbol>' --depth 2 --json \
  | jq '{depth,nodeCount,edgeCount,root:(.affected[0]//{}|{name,kind,filePath,startLine})}'
```

This is **not** an exhaustive inventory of every settings symbol; it covers the material
domain roots each card would move or call through. Remaining helpers, renderers, and
sub-panels are an explicit stop/defer condition: no card may claim a complete lifecycle
until it first inventories its own transitive members with the same evidence format.

### Domain roots assessed (one-definition unless noted)

| Query-confirmed root (id / file / line) | Direct function/method callers | Depth-2 nodes/edges (returned root) | Decision |
|---|---|---|---|
| `SettingsModelCatalogCoordinator` — `class:bf59bad673fcef3b2ab7b46339ce614d`, `SettingsModelCatalogCoordinator.ts:70` | `SettingsModelSection` constructor (line 86); test `createCoordinator` | 32 / (edgeCount reported) — root `SettingsModelCatalogCoordinator` | One definition. Owner `feature.settings-model-catalog`. Child plan: model-catalog. |
| `SettingsDebugSection` — `class:f40625da621553de403c758ad8459986`, `SettingsDebugSection.ts:116` | `OpenCodianSettings.addDebugSettings`(572), `OpenCodianSettingsView.addDebugSettings`(489), `SettingsTabbedRenderer.renderDebugContent`(518); tests `createSection`/`createTabbedSection`/`renderTabbed` | 72 / 120 — root `SettingsDebugSection` | One definition. Owner `feature.settings-debug`. Child plan: debug. |
| `OpencodeConfigModal` — `class:12864655289ef1a856e167006eab2e80`, `OpencodeConfigModal.ts:61` | `SettingsPluginSection.attach`(234), `SettingsSecuritySection.renderConfigFileSetting`(296), `ModelConfigModal.openAdvancedEditor`(885); test `selectSource` | 98 / 127 — root `OpencodeConfigModal` | One definition but **cross-owner callers** (plugin + model-catalog construct it directly with a fresh `OpencodeConfigManager`). Defer opencode domain. |
| `SettingsClaudeCodeSection` — `class:2ffd1667434f79d0f7badceae5a40468`, `SettingsClaudeCodeSection.ts:290` | `OpenCodianSettings.addClaudeCodeSettings`(448), `OpenCodianSettingsView.addClaudeCodeSettings`(364), `SettingsTabbedRenderer.renderClaudeCodeContent`(394) | 160 / 320 — root `SettingsClaudeCodeSection` | One definition; largest settings radius. Defer claude domain. |
| `SettingsCodexSection` — `class:a8d8a42dac2d94f604e55e39d4a89d5f`, `SettingsCodexSection.ts:42` | `SettingsTabbedRenderer.renderCodexContent`(402); tests `openLoadedThreadsModal`/`openModelListModal`/`openPermissionProfilesModal` | 60 / 114 — root `SettingsCodexSection` | One definition; reaches `agentServiceRegistry` heavily. Defer codex domain. |
| `SettingsStyleSection` — `class:1ce31bc7ebad7207e1cb51a9554e5dee`, `SettingsStyleSection.ts:37` | `OpenCodianSettings.addStyleSettings`(561), `OpenCodianSettingsView.addStyleSettings`(478), `SettingsTabbedRenderer.renderStyleContent`(507); test `createStyleSection` | 58 / 124 — root `SettingsStyleSection` | One definition; broad appearance-callback surface (12+ callbacks). Defer style domain. |
| `SettingsBackendSection` — `class:1034196fa43306c7718c1bdcf6391311`, `SettingsBackendSection.ts:35` | `SettingsTabbedRenderer.renderGeneralContent`(338) | 29 / 44 — root `SettingsBackendSection` | One definition; crosses `agentServiceRegistry` + `opencodeConfigManager`. Defer opencode domain. |
| `SettingsAgentsSection` — `class:6c20208f173c9b54833cebdd58d38391`, `SettingsAgentsSection.ts:54` | `OpenCodianSettings.addAgentsSettings`(508), `OpenCodianSettingsView.addAgentsSettings`(424), `SettingsTabbedRenderer.renderAgentsContent`(441); tests | 60 / 116 — root `SettingsAgentsSection` | One definition; reaches `openCodeService.sdk` + `claudeCodePermissionHostContext`. Defer agents domain. |
| `SettingsMcpSection` — `class:dccda48070ab6a86557ad4eeb1a4d9db`, `SettingsMcpSection.ts:119` | `OpenCodianSettings.addMcpSettings`(456), `OpenCodianSettingsView.addMcpSettings`(372), `SettingsTabbedRenderer.renderServerContent`(363)/`renderMcpContent`(466) | 60 / 96 — root `SettingsMcpSection` | One definition; only 1 importing file but reaches `openCodeService`/`opencodeConfigManager`. Defer mcp domain (merge with opencode later). |
| `SettingsPluginUpdateSection` — `class:6c05dbb83468947fa02c61080c93c1d8`, `SettingsPluginUpdateSection.ts:19` | `OpenCodianSettings.renderPluginUpdateSection`(171), `OpenCodianSettingsView.renderPluginUpdateSection`(309); test `createSection` | 33 / 49 — root `SettingsPluginUpdateSection` | One definition; reaches **only** `this.plugin.pluginUpdateService` (6 accesses). Child plan: plugin-update. |

### Collision hard stops (not normalized)

`codegraph query 'OpenCodianSettings'` returned **three** definitions — the
`OpenCodianSettings` *interface* in `src/core/types/settings.ts:2791`
(`interface:dc19e5be4a5dae0d6f1d60c9b58253fc`), the `OpenCodianSettingsView` *class* in
`OpenCodianSettingsView.ts:52` (`class:b666878670267166e6cbe1bb09395e99`), and the
`OpenCodianSettingsRuntimeCoordinatorHost` *interface* in
`src/core/runtime/OpenCodianSettingsRuntimeCoordinator.ts:29`. This unqualified name is a
**collision hard stop**: it is the settings *data type*, not a movable section. The
shell-domain card below therefore uses the qualified `OpenCodianSettingsView` class
(`class:b666878670267166e6cbe1bb09395e99`, callers `SettingsViewRegistrar.registerSettingsView`(14)/`getSettingsViews`(98), impact depth-2 = 83 nodes / 145 edges) and does not treat the unqualified `OpenCodianSettings` result as a section root. No shell extraction proceeds until a qualified-root re-inventory reproduces a single definition.

No other section root above produced a multi-definition collision: each
`Settings*Section` query returned exactly one class plus its own option/runtime interfaces
in the same file.

## Deferred candidate cards (not implementation authorization)

For the **three independently-releasable domains** (debug, model-catalog, plugin-update),
this inventory points at a separate dated child plan rather than re-stating the full card
inline. Each child plan carries the complete mandatory structure (owner current→target,
scope+evidence with CodeGraph numbers, exact narrow port, characterization matrix with
**verified-existing** named tests, falsifiable acceptance/abort, exact future
transaction+rollback file set, empty manifest/config/index-export set, mandatory C/B/G
topology). The three child plans are:

- `docs/superpowers/plans/2026-08-01-settings-debug-port-slice.md` —
  `feature.settings-debug`, 1 importing file → target 0, narrow
  `SettingsDebugPort`.
- `docs/superpowers/plans/2026-08-01-settings-model-catalog-port-slice.md` —
  `feature.settings-model-catalog`, 7 importing files → target 0, narrow
  `SettingsModelCatalogPort`.
- `docs/superpowers/plans/2026-08-01-settings-plugin-update-port-slice.md` —
  `feature.settings-plugin` (update subset), 1 importing file → target 0, narrow
  `SettingsPluginUpdatePort`.

Each child plan remains "deferred until its own independent review/merge checkpoint";
this inventory does not approve, schedule, or merge any of them.

The remaining domains are **DEFERRED without a child plan** (a later inventory must
author one). Each is retained by its current owner through Phase 5 with a hard expiry of
**2026-09-01**:

### Deferred: claude, codex, opencode, style, agents, mcp, shell, and the broad plugin bucket

- **Common expiry action (mandatory for each):** on 2026-09-01, run a fresh per-domain
  CodeGraph + member-access inventory, obtain an independent read-only review plus merge
  checkpoint, **or** record an explicitly approved deferred-owner/expiry extension before
  any source move. Neither expiry passage nor a passing test authorizes implementation.
- **Why each is not yet independently releasable:**
  - **claude** (`feature.settings-claude`, 5 files): `SettingsClaudeCodeSection` is the
    largest settings root (160/320) and reaches `app`, `agentServiceRegistry`, and
    `invalidateSlashCommandCatalog`; a port must also coordinate the
    `SettingsClaudeProviderMetadataPersistenceCoordinator` and resource/provider sections
    as one lifecycle. Cross-section coordination is unproven.
  - **codex** (`feature.settings-codex`, 6 files): reaches `agentServiceRegistry`(15),
    `app`(9), plus `loadBackendSessionConversation`/`createConversationFromBackendSession`
    — these are conversation-creation surfaces, not pure settings, and must be inventoried
    against chat composition before a narrow port is safe.
  - **opencode** (`feature.settings-opencode`, 6 files): `OpencodeConfigModal` is
    constructed **directly** by `SettingsPluginSection`, `SettingsSecuritySection`, and
    `ModelConfigModal.openAdvancedEditor` (each builds a fresh `OpencodeConfigManager`).
    A port here must reconcile three cross-owner construction sites first.
  - **style** (`feature.settings-style`, 6 files): depends on 12+ appearance/theme
    callbacks (`getChatAppearanceBaseline`, `updateChatAppearance`,
    `resetChatAppearance*`, `selectThemePresetAndSave`, etc.) that all delegate to the
    plugin's `settingsRuntimeCoordinator`. A port would risk becoming a one-interface-
    per-callback mega-port unless the appearance surface is first consolidated.
  - **agents** (`feature.settings-agents`, 7 files): reaches `openCodeService`(24),
    `opencodeConfigManager`(14), `claudeCodePermissionHostContext`(5),
    `claudeCodePermissionBridge`(2) — four different core services plus the capability
    lab. Needs a per-sub-section (agents/tools/skill/caplab) split before one port.
  - **mcp** (`feature.settings-mcp`, 1 file): smallest deferral; reaches
    `openCodeService`/`opencodeConfigManager` and should be merged into the opencode
    domain's later re-inventory rather than ported alone.
  - **shell** (`feature.settings-shell`, 5 files): owns the composition seam; it is the
    one place that must keep `OpenCodianPlugin` to adapt it into every other domain's
    port. Porting the shell is the **last** step, not a first slice. The unqualified
    `OpenCodianSettings` collision above is an additional hard stop.
  - **plugin bucket** (`feature.settings-plugin`, 10 files): a catch-all owner mixing
    update, acp, conversation, security, ui, user, formatter, and provider-icon modals.
    Only `SettingsPluginUpdateSection` (sole `pluginUpdateService` access) is narrow
    enough to slice now; the rest need their own sub-domain split.

For every deferred domain the exact manifest transaction is **zero manifest delta**:
`architecture-owners.config.json`, `module-docs.config.json`, every
`src/features/settings/index.ts`, and `manifest.json` are explicitly untouched. No future
sub-owner is named or permitted by this inventory. A later proposal that wants an owner
transfer must first name an existing or new literal owner ID, include path,
`delegatesTo` transaction, and a fresh review; it cannot reinterpret this zero-delta
decision.

### Mandatory future commit topology and rollback sequence for every card

No card may combine tests, behavior, and generated graph state in one commit. The
following topology is mandatory for every child plan; each card's exact files are
allocated to it (these settings cards are **type-only** ports, so B is small, but the
topology still applies):

1. **C — characterization commit, retained:** only that card's focused test files and any
   required module-doc characterization assertion. It remains after rollback.
2. **B — behavior commit, independently reversible:** only the card's source (the new
   consumer-owned `Settings<Domain>Port` type, the section(s) that switch from
   `OpenCodianPlugin` to the port, and the shell adapter line), plus mapped module-doc
   and owner-doc files. It contains no graph artifact, manifest, config, barrel,
   generated file, or test allocated to C. Its owner transaction is a literal
   same-owner zero manifest delta.
3. **G — graph snapshot commit after B:** run `npm run graphify:update:src` and
   `npm run check:graphify`, then commit only `graphify-out/GRAPH_REPORT.md`,
   `graphify-out/graph.json`, and `graphify-out/input-manifest.json`.

Rollback is: `git revert --no-edit G`; `git revert --no-edit B`; `npm run
graphify:update:src`; `npm run check:graphify`; and, if the refresh changes the three
named artifacts, commit only them as `chore(graphify): restore src graph after B`. This
restores the graph digest for reverted source while retaining C. Rerun the card matrix
and `npm run verify`. A changed manifest/config/barrel or a digest not matching restored
source is an abort, not permission to amend B.

## Per-domain port sketches (for the three child-plan domains only)

The plan's rules for every port (parent plan lines 802, 917): a port may be short if it
removes the complete `OpenCodianPlugin` dependency and is colocated with the consumer
owner. **AVOID** a settings mega-port, one-interface-per-callback, runtime forwarding
modules, `unknown` casts, and global lookup. Each port is `import type`-only, defined
**inside the consumer owner's directory**, and adapted by the shell (the one place that
keeps `OpenCodianPlugin`).

- **`SettingsDebugPort`** (`feature.settings-debug`): needs `settings` (the debug slice:
  `enableDebugLogging`, `inlineSerializedDebugLogArgs`, `debugModuleSettings`,
  `debugRefreshIntervalMs`, `debugLogPaths`, and the three
  `backendSettings.<backend>.debug*`/trace slices), `saveSettings`, plus the three
  diagnostic-action callbacks the section actually invokes — `getDebugBuildIdentityText`,
  `writeDiagnosticLogFile`, `logServerStatusSnapshot`, `buildDiagnosticReport`. The trace
  *ports* (`getOpenCodeDiagnostics`/`getCodexDiagnostics`/`getClaudeDiagnostics`) are
  already narrow callbacks passed by the shell and stay as-is. The full sketch,
  characterization matrix, and transaction are in the child plan.
- **`SettingsModelCatalogPort`** (`feature.settings-model-catalog`): needs the
  `modelSourceMode`/`disabledModelRefs`/`defaultProvider`/`defaultModel` settings slice,
  `saveSettings`, the nullable `modelConfigService` and `modelPricingService` service
  surfaces, the small `openCodeService.getServerStatus()` read used for availability, the
  `applyProviderIconColorMode`/`scheduleSettingsUiStateSave` callbacks, and `app` (for
  vault path). The full sketch is in the child plan.
- **`SettingsPluginUpdatePort`** (`feature.settings-plugin` update subset): needs only
  `pluginUpdateService` (the section reaches `this.plugin.pluginUpdateService` six times
  and nothing else). This is the narrowest possible port. The full sketch is in the child
  plan.

## Re-entry gates before any deferred card may become a proposed slice

For **each** card, and before a source edit, run and record:

1. focused characterization tests plus new contract tests for that exact domain;
2. CodeGraph `query`, `callers`, finite `impact --depth 2` for every moved/coupled
   symbol, then `git diff --name-only --diff-filter=ACMR | ./node_modules/.bin/codegraph
   affected --stdin --path . --json` after edits;
3. `npm run inspect:owner -- <each new/changed path> --json`,
   `npm run check:owner-manifest`, `npm run check:owner-boundaries`, `npm run
   check:dependency-direction`, `npm run check:architecture-cycles`, `npm run
   check:architecture-approvals`, full `npm run verify:architecture`, and `npm run
   check:module-docs`; record dependency-direction and architecture-cycle output proving
   no reverse type/runtime edge and one canonical-state owner;
4. `diagnostics-safety` tests for any debug/trace touch;
5. `npm run graphify:update:src`, `npm run check:graphify`, `npm run verify`, and a fresh
   `npm run build`;
6. Test Vault deployment only if the final diff touches a deploy-relevant path listed in
   `AGENTS.md` (e.g. `src/main.ts`, settings/style/theme/assets/manifest); otherwise
   record that deployment is not triggered. If triggered, deploy sequentially and verify
   `BUILD_ID`.

A multi-definition query, a root divergence, a cross-card radius, or a same-name
collision stops source work and is reported as a hard stop (as the unqualified
`OpenCodianSettings` collision above is).

## Baseline → target metric (Phase 5 acceptance)

The Phase 5 metric (parent plan lines 807, 878) is **settings→main type-only
`OpenCodianPlugin` import count**. Baseline and re-verified counts:

```bash
$ rg -l "OpenCodianPlugin" src/features/settings/ | wc -l
      54
$ rg -c "OpenCodianPlugin" src/features/settings/ | awk -F: '{s+=$2} END {print s}'
186
```

Baseline = **54 files / 186 references**, all type-only. Per-domain targets (each child
plan reaches its target before the next domain starts, per acceptance line 807):

| Domain | Baseline importing files | Target after its child plan | Child plan |
|---|---|---|---|
| debug | 1 | 0 | `2026-08-01-settings-debug-port-slice.md` |
| model-catalog | 7 | 0 | `2026-08-01-settings-model-catalog-port-slice.md` |
| plugin-update | 1 (of plugin's 10) | 0 for that file | `2026-08-01-settings-plugin-update-port-slice.md` |
| claude | 5 | deferred (owner `feature.settings-claude`, expiry 2026-09-01) | none yet |
| codex | 6 | deferred (owner `feature.settings-codex`, expiry 2026-09-01) | none yet |
| opencode | 6 | deferred (owner `feature.settings-opencode`, expiry 2026-09-01) | none yet |
| style | 6 | deferred (owner `feature.settings-style`, expiry 2026-09-01) | none yet |
| agents | 7 | deferred (owner `feature.settings-agents`, expiry 2026-09-01) | none yet |
| mcp | 1 | deferred (owner `feature.settings-mcp`, expiry 2026-09-01) | none yet |
| plugin (non-update) | 9 | deferred (owner `feature.settings-plugin`, expiry 2026-09-01) | none yet |
| shell | 5 | deferred (owner `feature.settings-shell`, expiry 2026-09-01; last step) | none yet |

Every removed import must correspond to a tested port, never to `unknown`/cast/global
lookup (acceptance line 808). The cumulative target after the three child plans merge is
54 → 45 importing files; the remaining 9 are the deferred domains.

## Zero-source-change proof

Before handoff, only the new plan files under `docs/superpowers/plans/` may differ. The
following must show no production/test source path and a clean patch:

```bash
git diff --name-only -- src tests manifest.json package.json architecture-owners.config.json graphify-out devlog.md AGENTS.md
git ls-files --others --exclude-standard -- src tests
git diff --check
git diff --no-index --check /dev/null docs/superpowers/plans/2026-08-01-settings-plugin-coupling-inventory.md
git diff --no-index --check /dev/null docs/superpowers/plans/2026-08-01-settings-debug-port-slice.md
git diff --no-index --check /dev/null docs/superpowers/plans/2026-08-01-settings-model-catalog-port-slice.md
git diff --no-index --check /dev/null docs/superpowers/plans/2026-08-01-settings-plugin-update-port-slice.md
git status --short
```

The `git diff --no-index --check` commands exit **1** for untracked new files; their
output must otherwise be empty (no whitespace diagnostics). Treat any whitespace output
as a documentation repair failure. Keep the normal `git diff --check` too, because it
covers tracked changes.

This inventory does not close Phase 5, modify the ledger, or constitute approval. A
source move needs fresh independent read-only review after its own implementation phase.
Task 16 (ClaudeCodeAdapter) and Task 17 (OpenCodeService) are the sibling Phase 5
inventories already on file; this Task 18 inventory neither blocks nor authorizes them.
