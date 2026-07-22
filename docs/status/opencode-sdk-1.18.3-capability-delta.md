# OpenCode SDK 1.18.3 Capability Delta

**Created:** 2026-07-21
**Purpose:** Authoritative delta between the previous baseline `@opencode-ai/sdk@1.17.18` and the current pin `@opencode-ai/sdk@1.18.3`, plus the exact plugin contract used by OpenCodian.

---

## 1. Pin Facts

| Fact | Value | Notes |
|---|---|---|
| Current OpenCodian pin | `@opencode-ai/sdk@1.18.3` | exact version in `package.json` / `package-lock.json` |
| npm integrity | `sha512-Mevo4e6kQwbvto9E+42KSIVMhp+JBu+SwQhC5AomAvrV6Xkio3U249T+xDILDCXhl5Z/Hi/DlAuVLzpGnuh0gg==` | verified against npm registry |
| Previous baseline | `@opencode-ai/sdk@1.17.18` | `sha512-c/C9PhY8PrbcxDY+JIYtOZsrmMD0KzoVvxq+RGUrZ6LQp57SuVBbT4lfwA2G8Se5RNC1N5JtYjiuaXeECnF2SQ==` |
| Upstream reference commit | `08096b5e61c9227a6b52aacc745a1a51c6385284` | `reference-projects/opencode` HEAD at audit time |
| Upstream `packages/sdk/js/package.json` | `1.17.17` | reference tree is one patch behind the published npm tarball `1.17.18`, and it is not the source for current pin `1.18.3`; generated declarations in the npm tarball are the source of truth |

---

## 2. Declaration Delta (1.17.18 → 1.18.3)

- `dist/v2/gen/sdk.gen.d.ts` is **identical** between `1.17.18` and `1.18.3`.
- `dist/v2/gen/types.gen.d.ts` has **one addition**:
  - `Config.subagent_depth?: number`
- No methods added, removed, or signature-changed at the generated client level.
- No new `client.v2.*` subnamespaces.
- Top-level `OpencodeClient` namespace set is unchanged.

In other words, the 1.18.3 SDK is a **type-only delta** from the generated-client perspective; all 57 methods and 14 `v2.*` subnamespaces inventoried in the 1.17.18 baseline remain present and unchanged.

---

## 3. Plugin Config / Event Contract

This is the authoritative TypeScript shape for OpenCodian's plugin integration layer.

### 3.1 Effective plugin declarations

Effective plugin declarations are read through directory-scoped `sdk.config.get()`.

```ts
Config.plugin?: Array<string | [string, Record<string, unknown>]>;
Config.subagent_depth?: number; // new in 1.18.3
```

- `Config.plugin` is an array of specifiers.
- A specifier is either a bare string (npm package or package with version) or a tuple `[specifier, options]`.
- The effective config must be fetched with **directory scope**; do not use a process-default `/config` path as a substitute.
- `Config.subagent_depth` is a new numeric setting exposed in 1.18.3; it is unrelated to plugin loading and is handled by the Agents settings path.

### 3.2 Runtime evidence event

There is **no `plugin` namespace** on `OpencodeClient`.

The only runtime plugin evidence is the event:

```ts
{ type: "plugin.added"; properties: { id: string } }
```

Properties:
- `id: string` — an opaque runtime identifier. It is **not guaranteed** to equal any config specifier (npm package name, file path, etc.).

Behavior:
- `plugin.added` is **opportunistic and non-durable**.
- There is **no replay**. Events emitted before subscription or during a disconnect are lost.
- There is **no `plugin.removed`** event.
- There is **no `plugin.load-error`** event.
- Because the event is not callable, it must **not** be registered as an SDK path capability in `OpenCodeSdkCapabilityRegistry`.

---

## 4. Three-Layer Truth Matrix

| Layer | Source | What it proves | What it does not prove |
|---|---|---|---|
| Local declarations | `PluginManagementService.inspect()` reads global/project config files and `plugin/` / `plugins/` directories | Which plugin specs are declared on this device | That the backend has loaded them, or that they are currently active |
| Effective config | `sdk.config.get()` with directory scope | What the connected OpenCode backend resolves as the effective `plugin` list | That every listed plugin is successfully running in memory |
| Runtime observation | `plugin.added` events | That the backend emitted at least one `plugin.added` for a given runtime id | That the plugin is still loaded, that it equals a declaration, or that all loaded plugins are observed |

OpenCodian keeps these layers separate:
- `PluginManagementService` owns local declarations and provenance.
- `OpenCodeEventSubscriptionCoordinator` owns effective config evidence + runtime event evidence.
- `SettingsPluginEvidenceCoordinator` uses the existing `OpenCodeService.subscribeToOpenCodeEvents` seam; `OpenCodeService.ts` has no plugin-specific evidence forwards or state.
- `SettingsPluginEvidencePresenter` renders the three layers without merging them.

---

## 5. OpenCodian Product Mapping

| Concern | Owner | Current behavior |
|---|---|---|
| Local declaration discovery | `PluginManagementService` | Reads 7 config sources + `plugin/` / `plugins/` directories; canonical editable source is `<vault>/.opencode/opencode.json` |
| Effective config fetch | `SettingsPluginEvidenceCoordinator` → `OpenCodeEventSubscriptionCoordinator` | `SettingsPluginEvidenceCoordinator` builds a directory-scoped SDK facade and passes it through the `OpenCodeService.subscribeToOpenCodeEvents` observer; `OpenCodeEventSubscriptionCoordinator` normalizes `Config.plugin` and enforces latest-started-wins |
| Runtime event capture | `OpenCodeEventSubscriptionCoordinator` | Listens to `plugin.added`; extracts `properties.id`; deduplicates per generation; marks stale on generation rotation |
| Evidence rendering | `SettingsPluginEvidencePresenter` | Renders local summary, effective config, runtime IDs, transport state as separate layers |
| Settings orchestration | `SettingsPluginSection` | Subscribes/disposes/refreshes; keeps local file actions; delegates evidence DOM to presenter |

---

## 6. Remote / Local-Only Boundary

The following plugin declaration mutation surfaces are marked as local-only in remote mode (`[data-local-only="true"]`):

- Plugin install input + button
- Project config plugin textarea + save button
- Project plugin directory create button
- Managed config plugin group and each managed config row (toggle / delete)
- Managed directory plugin group and each managed directory row (toggle / delete)

The following surfaces are **not** currently marked local-only because they are read-only controls or belong to other concerns:

- Isolation mode dropdown
- OMO config open action
- Refresh / open raw config actions
- Read-only global/project config source displays

`sdk.config.update()` is **not used** for plugin changes. OpenCodian does not write remote OpenCode configuration. The remote effective truth remains `sdk.config.get()` evidence.

---

## 7. Stale / Unknown / No-Replay Rules

- SDK evidence carries a connection generation (opaque signature).
- When the connection signature changes, previous effective config and runtime IDs are marked `stale`.
- Because `plugin.added` has no replay, gaps mean the evidence is incomplete; the UI must not claim "no plugins loaded" just because the runtime list is empty.
- A failed effective-config refresh is represented as a snapshot-level fetch error; it does not invent entry-level load errors and does not relabel old success as current.
- Concurrent refreshes use a monotonically increasing attempt token; only the latest-started attempt may commit state.

---

## 8. Prohibitions

These rules are enforced by architecture and tests:

1. **Do not invent `plugin.removed` or `plugin.load-error`.** The SDK does not emit them.
2. **Do not auto-match runtime ids to config specifiers.** A runtime id may differ from the declaration; display it as unattributed evidence.
3. **Do not write local file edits as remote mutations.** No `config.update()` for plugin changes.
4. **Do not use process-default `/config` instead of directory-scoped `config.get()`.**
5. **Do not register `plugin.added` as a callable SDK capability.** It is an event, not a method.
6. **Do not treat empty runtime evidence as proof of zero loaded plugins.** It only proves no `plugin.added` events were observed in the current capture window.

---

## 9. Related Documents

- Historical baseline: `docs/status/opencode-sdk-1.17.18-capability-inventory.md`
- Rollout status: `docs/status/sdk-v2-rollout.md`
- Manual checklist: `docs/status/sdk-v2-manual-checklist.md`
- Capability registry module doc: `docs/modules/core/opencode/OpenCodeSdkCapabilityRegistry.md`
