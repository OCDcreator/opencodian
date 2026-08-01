# Settings model-catalog port slice — 2026-08-01 (deferred until its own review)

## Boundary and decision

This is a Task 18 child plan. It is **discovery only** and authorizes no production,
test, manifest, configuration, generated-graph, ledger, devlog, or approval change. It
is **deferred until its own independent read-only review plus merge checkpoint**; nothing
here is implemented, scheduled, or approved. The parent inventory is
`docs/superpowers/plans/2026-08-01-settings-plugin-coupling-inventory.md`.

**Slice:** replace the type-only `import type OpenCodianPlugin from '../../main'` across
the seven importing files of `feature.settings-model-catalog` with a consumer-owned
type-only `SettingsModelCatalogPort`, colocated with the owner. The shell adapts
`OpenCodianPlugin` → the port; the plugin's public surface
(`modelConfigService`/`modelPricingService`/`openCodeService`/`settings`/`app`) is
unchanged.

## Owner current → target

- **Current owner:** `feature.settings-model-catalog` (medium risk).
- **Target owner:** `feature.settings-model-catalog` (same owner; same-owner type-seam).
- **Retirement / expiry:** retain through Phase 5 to **2026-09-01**. On expiry, run a
  fresh per-domain CodeGraph + member-access inventory and obtain an independent review/
  merge checkpoint, **or** record an explicitly approved deferred-owner/expiry extension
  before any source move. Neither expiry passage nor a passing test authorizes
  implementation.

## Scope and evidence

The model-catalog domain owns the model config UI, picker, pricing modal, icon cache,
and catalog coordinator. Seven files import `OpenCodianPlugin`:

- `src/features/settings/SettingsModelSection.ts`;
- `src/features/settings/SettingsModelCatalogCoordinator.ts`;
- `src/features/settings/SettingsModelIconCacheManager.ts`;
- `src/features/settings/ModelConfigModal.ts`;
- `src/features/settings/ModelPricingModal.ts`;
- `src/features/settings/ModelConfigJsonModal.ts`;
- `src/features/settings/ModelConfigProviderEditor.ts`.

(`SettingsModelCatalogAvailability.ts` and `SettingsModelCatalogPresenter.ts` do not
import `OpenCodianPlugin`.)

Per-file `this.*.plugin.<member>` accesses (from `grep -hoE "(this\.[a-zA-Z]+\.)?plugin\.[A-Za-z0-9_]+"`):

| File | members (count) |
|---|---|
| `SettingsModelSection.ts` | `settings`(6), `scheduleSettingsUiStateSave`(2), `modelConfigService`(2) |
| `SettingsModelCatalogCoordinator.ts` | `settings`(27), `saveSettings`(3), `openCodeService`(2) |
| `SettingsModelIconCacheManager.ts` | `settings`(15), `applyProviderIconColorMode`(4), `saveSettings`(3), `modelConfigService`(2), `openCodeService`(2) |
| `ModelConfigModal.ts` | `settings`(11), `modelConfigService`(9), `openCodeService`(3), `saveSettings`(1), `app`(1) |
| `ModelPricingModal.ts` | `settings`(5), `modelPricingService`(5), `saveSettings`(2) |
| `ModelConfigJsonModal.ts` | `openCodeService`(3), `modelConfigService`(3), `settings`(2), `saveSettings`(1) |
| `ModelConfigProviderEditor.ts` | `app`(1) |

Union of members reached: `settings`, `saveSettings`, `modelConfigService`,
`modelPricingService`, `openCodeService`, `applyProviderIconColorMode`,
`scheduleSettingsUiStateSave`, `app`.

`ModelConfigModal.openAdvancedEditor` constructs `new OpencodeConfigModal(this.app, new
OpencodeConfigManager(vaultPath), {...})` directly — it does **not** use
`this.plugin.opencodeConfigManager`. That cross-owner construction is a deferred
opencode-domain concern and is out of scope here; this port only needs the model-config
slice plus the `app` for vault-path resolution.

### CodeGraph evidence (re-run before any source edit)

`codegraph status` reported CodeGraph 1.5.0, complete, `pendingChanges` zero. Root
reproduction (caller lists are function/method only):

```bash
./node_modules/.bin/codegraph query 'SettingsModelCatalogCoordinator' --json \
  | jq '[.[] | select(.node.kind=="class" or .node.kind=="interface") | {name:.node.name,kind:.node.kind,filePath:.node.filePath,startLine:.node.startLine,id:.node.id}]'
# one class: SettingsModelCatalogCoordinator (class:bf59bad673fcef3b2ab7b46339ce614d, SettingsModelCatalogCoordinator.ts:70)
# + its own SettingsModelCatalogCoordinatorOptions interface (line 51)

./node_modules/.bin/codegraph callers 'SettingsModelCatalogCoordinator' --json \
  | jq '[.callers[]? | select(.kind=="function" or .kind=="method") | {name,kind,filePath,startLine}]'
# SettingsModelSection constructor (SettingsModelSection.ts:86)
# tests/unit/features/settings/SettingsModelCatalogCoordinator.smallModel.test.ts createCoordinator (line 83)

./node_modules/.bin/codegraph impact 'SettingsModelCatalogCoordinator' --depth 2 --json \
  | jq '{depth,nodeCount,edgeCount,root:(.affected[0]|{name,kind,filePath,startLine})}'
# depth 2: 32 nodes; root SettingsModelCatalogCoordinator
```

One definition, no collision. The single production caller is the
`SettingsModelSection` constructor (shell-owned wiring), which is the natural adaptation
site. (`SettingsModelSection` is constructed by the shell's `addModelSettings`.)

## Exact narrow port / composition

No port is created by this plan. The re-entry seam is a consumer-owned type-only
`SettingsModelCatalogPort`, colocated at `src/features/settings/` (under the owner's
include), defining exactly:

- `settings` — the model-catalog slice: `modelSourceMode`, `disabledModelRefs`,
  `defaultProvider`, `defaultModel` (and the few shared fields the coordinator touches).
  The port type may reference `OpenCodianSettings` from `core/types` without importing
  `main.ts`.
- `saveSettings: OpenCodianPlugin['saveSettings']`.
- `modelConfigService: OpenCodianPlugin['modelConfigService']` (nullable).
- `modelPricingService: OpenCodianPlugin['modelPricingService']` (nullable).
- `openCodeService: Pick<OpenCodianPlugin['openCodeService'], 'getServerStatus'>` (the
  only read used for catalog availability; keep this narrow, do not widen to the full
  service).
- `applyProviderIconColorMode: OpenCodianPlugin['applyProviderIconColorMode']`.
- `scheduleSettingsUiStateSave: OpenCodianPlugin['scheduleSettingsUiStateSave']`.
- `app: OpenCodianPlugin['app']` (for vault-path resolution in
  `ModelConfigModal`/`ModelConfigProviderEditor`).

The shell adapts `OpenCodianPlugin` → `SettingsModelCatalogPort` once and passes it to
the coordinator/section/modals. The port must not expose `opencodeConfigManager`,
`agentServiceRegistry`, trace services, or a generic plugin dump; it must not become a
runtime forwarding module. `ModelConfigModal.openAdvancedEditor`'s direct
`OpencodeConfigModal` construction is left as-is (out of scope; deferred opencode
domain).

## Characterization matrix (named tests — verified to exist)

Every test below was confirmed to exist under `tests/unit/features/settings/` before
listing:

- `tests/unit/features/settings/SettingsModelSection.test.ts` — section render, default
  model selector, save round-trip.
- `tests/unit/features/settings/SettingsModelSection.availabilityFooter.test.ts` —
  availability footer wiring.
- `tests/unit/features/settings/SettingsModelCatalogAvailability.test.ts` — catalog
  availability state.
- `tests/unit/features/settings/SettingsModelCatalogCoordinator.smallModel.test.ts` —
  coordinator small-model selection and disabled-ref mutation/save.
- `tests/unit/features/settings/SettingsModelCatalogPresenter.test.ts` — presenter
  rendering.
- `tests/unit/features/settings/ModelConfigModal.test.ts` — modal open/select/save.
- `tests/unit/features/settings/ModelPricingModal.test.ts` — pricing modal.
- `tests/unit/features/settings/modelPicker.test.ts` — picker selection.
- `tests/unit/features/settings/modelConfigSavePlan.test.ts` — save-plan computation.
- `tests/unit/features/settings/modelConfigWorkspace.test.ts` — workspace hydration/
  disabled-ref reconciliation.

(`ModelConfigModal.g9.*` tests also exist for source-mutation/retry-persistence/
source-read/save and may be included at re-entry.) A re-entry must add a port-shape
contract test asserting the port carries exactly the listed members and that a null
`modelConfigService`/`modelPricingService` is handled identically to today.

## Falsifiable acceptance / abort

- **Accept only if:** none of the seven files imports `OpenCodianPlugin` from
  `'../../main'`; all compile against `SettingsModelCatalogPort` alone; the shell is the
  only adapter; `modelSourceMode`/`disabledModelRefs`/`defaultProvider`/`defaultModel`
  mutate and persist byte-for-byte characterization-equivalently; availability still
  reads `openCodeService.getServerStatus()` exactly once per refresh; icon-cache
  `applyProviderIconColorMode` and `scheduleSettingsUiStateSave` fire unchanged; and a
  null `modelConfigService`/`modelPricingService` behaves identically.
- **Abort before source move if:** the port needs `opencodeConfigManager`,
  `agentServiceRegistry`, trace services, a raw SDK client, or any non-catalog member; a
  query root differs from `class:bf59bad673fcef3b2ab7b46339ce614d`; the port grows a
  generic plugin dump, a runtime forwarding module, or `unknown` casts; or focused tests
  pass but full `npm run verify` fails and the fix crosses out of this owner.

## Exact future transaction and rollback file set

If and only if re-entry passes, C receives the test paths below and B receives the
source/doc paths below; their combined exact permitted file set is:

- `src/features/settings/SettingsModelSection.ts`;
- `src/features/settings/SettingsModelCatalogCoordinator.ts`;
- `src/features/settings/SettingsModelIconCacheManager.ts`;
- `src/features/settings/ModelConfigModal.ts`;
- `src/features/settings/ModelPricingModal.ts`;
- `src/features/settings/ModelConfigJsonModal.ts`;
- `src/features/settings/ModelConfigProviderEditor.ts`;
- `src/features/settings/OpenCodianSettings.ts` (adapt in `addModelSettings`);
- `src/features/settings/OpenCodianSettingsView.ts` (same adaptation);
- `tests/unit/features/settings/SettingsModelSection.test.ts`;
- `tests/unit/features/settings/SettingsModelSection.availabilityFooter.test.ts`;
- `tests/unit/features/settings/SettingsModelCatalogAvailability.test.ts`;
- `tests/unit/features/settings/SettingsModelCatalogCoordinator.smallModel.test.ts`;
- `tests/unit/features/settings/SettingsModelCatalogPresenter.test.ts`;
- `tests/unit/features/settings/ModelConfigModal.test.ts`;
- `tests/unit/features/settings/ModelPricingModal.test.ts`;
- `tests/unit/features/settings/modelPicker.test.ts`;
- `tests/unit/features/settings/modelConfigSavePlan.test.ts`;
- `tests/unit/features/settings/modelConfigWorkspace.test.ts`;
- `docs/modules/features/settings/SettingsModelSection.md`;
- `docs/architecture/owners/feature-settings-model-catalog.md`.

**Exact manifest/config/index-export set: empty.** `architecture-owners.config.json`,
`module-docs.config.json`, `manifest.json`, `package.json`, and every
`src/features/settings/index.ts` are explicitly untouched. The port is type-only and
colocated; no barrel re-export is permitted.

### Mandatory C/B/G topology and rollback

1. **C — characterization commit, retained:** the nine test files above (plus any
   `ModelConfigModal.g9.*` tests included at re-entry).
2. **B — behavior commit, independently reversible:** the seven domain source files, the
   two shell adapter lines (`OpenCodianSettings.ts`/`OpenCodianSettingsView.ts`), plus
   the two doc files. No graph artifact, manifest, config, barrel, or test in B.
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
affected --stdin --path . --json`. Test Vault deployment is conditional: settings/style
are deploy-relevant, so if the final diff touches a deploy-relevant `AGENTS.md` path,
deploy sequentially and prove `BUILD_ID`; a type-only port in the model-catalog files is
not by itself deploy-relevant, but the shell adapter line may be — verify against
`AGENTS.md` at re-entry.

## Baseline → target metric

- Baseline importing files for this domain: **7**.
- Target after this child plan: **0**.
- Re-verify with `rg -l "OpenCodianPlugin" src/features/settings/SettingsModelSection.ts
  src/features/settings/SettingsModelCatalogCoordinator.ts
  src/features/settings/SettingsModelIconCacheManager.ts
  src/features/settings/ModelConfigModal.ts src/features/settings/ModelPricingModal.ts
  src/features/settings/ModelConfigJsonModal.ts
  src/features/settings/ModelConfigProviderEditor.ts` (must be empty post-B).
