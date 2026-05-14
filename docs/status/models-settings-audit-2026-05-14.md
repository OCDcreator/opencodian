# Models Settings Audit - 2026-05-14

## Scope

This audit covers the OpenCodian settings page `Models` primary tab and its four secondary surfaces:

- `Common`: default chat model, model source mode, and refresh controls.
- `Project config`: current `.opencode` provider/model workspace and raw JSON entry points.
- `Availability`: provider/model catalog comparison, filtering, toggles, and provider send probes.
- `Tools`: provider icon cache and icon display controls.

The audited build was deployed to the Test Vault with `BUILD_ID=main.202605141103`.

## OpenCode Capability Baseline

The relevant OpenCode documentation surface is centered on model/provider configuration:

- `model` and `small_model` are top-level config fields.
- `provider.<id>` entries define `npm`, connection `options`, and `models`.
- `provider.<id>.models.<model>` can define `name`, `limit`, `options`, and `variants`.
- Provider availability can be narrowed by `enabled_providers` / `disabled_providers`.
- Agent/command-level surfaces can also carry model references or model-related parameters, but those are separate from the global Models settings page.

Sources:

- https://opencode.ai/docs/zh-cn/models/
- https://opencode.ai/docs/zh-cn/providers/
- https://opencode.ai/docs/zh-cn/config/

## Local Responsibility Map

The Models settings surface is not a single form. It is split across these owners:

- `src/features/settings/SettingsModelSection.ts`: model settings shell; creates Common / Project config / Availability / Tools blocks.
- `src/features/settings/SettingsModelCatalogCoordinator.ts`: catalog refresh, model picker, source mode, provider/model availability writes.
- `src/features/settings/SettingsModelCatalogPresenter.ts`: provider/model catalog presentation, filtering, accordion state, bulk actions, and send-probe UI.
- `src/features/settings/ModelConfigModal.ts`: project provider/model workspace modal and save orchestration.
- `src/features/settings/modelConfigWorkspace.ts`: form hydration, preview serialization, fetched model normalization.
- `src/features/settings/modelConfigSavePlan.ts`: `.opencode` write plan, `disabledModelRefs`, provider serialization, `small_model`, `options`, and `variants`.
- `src/core/config/ModelConfigService.ts`: local/server/base-effective/effective catalog assembly and real provider send probe.
- `src/core/config/ModelCatalogStateService.ts`: UI-ready catalog state, disabled provider/model catalogs, and availability state transforms.

## Verification Commands

Static and unit verification:

```bash
npm test -- tests/unit/features/settings/modelConfigWorkspace.test.ts tests/unit/features/settings/modelConfigSavePlan.test.ts tests/unit/features/settings/ModelConfigModal.test.ts tests/unit/features/settings/SettingsModelCatalogPresenter.test.ts
```

Result: passed, `4` suites / `29` tests.

Build and Test Vault deployment:

```bash
npm run build
cp dist/main.js /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js
cp dist/manifest.json /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/manifest.json
cp dist/styles.css /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/styles.css
rg -n "main\\.202605141103" /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js
```

Result: deployed runtime artifacts contained `BUILD_ID=main.202605141103`.

Obsidian app-control preflight and reload:

```bash
node /Volumes/SDD2T/obsidian-vault-write/custom-project/my-skills/custom/obsidian-plugin-autodebug/scripts/obsidian_debug_launch_app.mjs --mode cli --vault-name testvault --output .obsidian-debug/models-settings-launch.json
obsidian dev:debug on vault=testvault
obsidian dev:console clear vault=testvault
obsidian dev:errors clear vault=testvault
obsidian plugin:reload id=opencodian vault=testvault
```

Result: CLI developer commands were available; plugin reload succeeded.

Runtime UI assertion:

```bash
node /Volumes/SDD2T/obsidian-vault-write/custom-project/my-skills/custom/obsidian-plugin-autodebug/scripts/obsidian_eval_file.mjs --vault-name testvault --file .obsidian-debug/models-settings-audit.js --output .obsidian-debug/models-settings-audit-result.json --timeout-ms 60000
obsidian dev:errors vault=testvault
obsidian dev:console limit=120 vault=testvault
```

Result: the stable completed run reached Common, Project config, workspace modal, Availability, and Tools. It found no Obsidian errors or console messages after the final capture. One assertion was corrected afterward because it treated the disabled-catalog view as a required place for model-level disabled refs; that is not the right acceptance signal for this UI. The project config modal itself did prove model-level disable state and save-plan tests prove `disabledModelRefs` persistence.

Artifacts:

- `.obsidian-debug/models-settings-launch.json`
- `.obsidian-debug/models-settings-audit.js`
- `.obsidian-debug/models-settings-audit-result.json`
- `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/models-settings-audit-current.png`

## Findings

### 1. Capability exposure is broad and mostly complete

OpenCodian exposes the important OpenCode model configuration primitives:

- top-level `model`: Common default model picker and Project config modal `Default chat model`;
- top-level `small_model`: Project config modal `Lightweight fallback model`;
- provider identity: provider id/name;
- provider adapter: known interface formats map to `npm`, with a custom adapter escape hatch;
- provider connection: `baseURL`, `apiKey`, and arbitrary provider `options`;
- model identity: model id/name;
- model limits: context/output;
- model-level `options`: arbitrary key/value JSON values;
- model-level `variants`: named JSON object variants;
- extra model fields: unknown top-level model fields preserved separately;
- provider availability: project config writes `enabled_providers` / `disabled_providers`;
- model availability: plugin-level `disabledModelRefs`;
- runtime probing: provider actual-send test buttons exist in both workspace and availability surfaces;
- icon management: provider icon cache and builtin/custom icon management are exposed.

### 2. The main UX gap is discoverability, not raw capability

The other model's report was directionally right that `small_model` is harder to find: it is inside the Project config modal, not in the Common tab next to the default chat model. The field is present and works, but users scanning the main Models page can easily miss it.

Recommendation: surface `small_model` in the Common tab as a second picker, or add a direct hint/link from Common to the Project config modal field.

### 3. Structured controls are missing for common model options

`reasoningEffort`, `textVerbosity`, `thinking`, and similar model options are supported through arbitrary key/value JSON fields. This is flexible and aligns with OpenCode's open-ended provider/model option model, but it makes common fields harder to configure safely.

Recommendation: keep the raw key/value escape hatch, but add structured optional controls for common known keys:

- `reasoningEffort`: select / segmented control.
- `textVerbosity`: select.
- `thinking`: JSON-aware structured group where possible, especially for budget/token fields.

### 4. `effortLevel` / `thinkingBudget` are not Models settings today

OpenCodian has plugin settings for `effortLevel` and `thinkingBudget`, but current code treats them as chat send controls rather than model config controls. The docs modules note that SDK and legacy prompt paths map these differently:

- SDK path maps `reasoningEffort` to `variant`; `thinkingBudget` is logged but not written into SDK payload.
- Legacy path writes `reasoningEffort` / `thinkingBudget` into `model.options`.

This means adding them naively to Models could imply stronger OpenCode config semantics than the current runtime actually guarantees.

Recommendation: do not simply duplicate chat-toolbar `effortLevel` / `thinkingBudget` into Models. If they move into settings, label them as send defaults, not OpenCode provider/model config, and keep the SDK/legacy distinction explicit.

### 5. Availability UI works, but has layered semantics

Provider availability is `.opencode` config state; model availability is plugin `disabledModelRefs`. The UI correctly separates these, and the tests cover both write paths. One audit assertion initially expected a model-level disabled ref to appear in the disabled catalog card as a hard requirement. Code review showed `ModelCatalogStateService.buildDisabledCatalog()` can include disabled models, but whether a disabled model appears depends on the currently assembled base catalog and selected catalog state. The more stable acceptance signal is:

- model toggles render in the workspace modal;
- `disabledModelRefs` save-plan tests pass;
- availability search/catalog/provider controls mount;
- provider send-probe control mounts.

## Comparison With Supplied External Finding

Agreements:

- The Models module is one of the better-covered settings modules.
- It really is organized around four secondary areas: Common, Project config, Availability, Tools.
- `small_model` is present but buried.
- common reasoning/thinking/text verbosity options are exposed as free-form key/value, not structured controls.
- the coordinator/presenter split is a strong code quality point.

Adjustment:

- `effortLevel` and `thinkingBudget` should not be treated as simply "missing Models UI" without qualification. They exist as OpenCodian send/runtime settings and have transport-specific behavior; they are adjacent to model settings, but not equivalent to OpenCode's provider/model config schema.

## 2026-05-14 Implementation Follow-Up

The first disclosure pass implemented the report's recommended follow-ups inside the existing Models settings ownership boundaries:

- Common tab now exposes OpenCode top-level `small_model` through a searchable model picker and writes it to the local `.opencode` model config.
- Expanded model cards now show structured controls for common `models.<id>.options` fields before the raw key/value editor: `reasoningEffort`, `textVerbosity`, `reasoningSummary`, `include`, `thinking.type`, and `thinking.budgetTokens`.
- Raw model `options`, `variants`, and extra top-level fields remain available as escape hatches for provider-specific capabilities.
- `effortLevel` / `thinkingBudget` remain treated as OpenCodian send-time settings rather than provider/model config fields.

Verification after the implementation pass:

- `npm run check:module-docs`: passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test -- tests/unit/features/settings/ModelConfigModal.test.ts tests/unit/features/settings/modelConfigWorkspace.test.ts tests/unit/features/settings/modelConfigSavePlan.test.ts tests/unit/features/settings/SettingsModelCatalogCoordinator.smallModel.test.ts tests/unit/features/settings/modelConfigStructuredOptions.test.ts`: passed, `5` suites / `31` tests.
- `npm run graphify:update:src`: refreshed required `graphify-out/` report/json artifacts; HTML viz was skipped by the repo wrapper because the graph is too large.
- `npm run build`: passed with `BUILD_ID=main.202605141144`.
- Test Vault deployment copied `dist/main.js`, `dist/manifest.json`, and `dist/styles.css`; deployed `main.js` contains `BUILD_ID=main.202605141144`.
- Obsidian app-control reload and `.obsidian-debug/models-settings-disclosure-assertion.js`: passed. The assertion confirmed Common-tab `small_model` disclosure and selected value, structured controls for `reasoningEffort`, `textVerbosity`, `reasoningSummary`, `include`, `thinking.type`, and `thinking.budgetTokens`, retained raw options, and correct preview JSON. Follow-up `obsidian dev:errors` and `obsidian dev:console` reported no captured errors or messages.

Additional full-gate note:

- `npm run verify` was attempted after the scoped checks above. It passed owner guard, module-doc guard, graphify freshness, devlog order, lint, and typecheck, then stopped in the full Jest phase after `OpenCodianSettings.test.ts` had already reported `15` passing tests. The post-test process failed because `SettingsSkillSection` async retry work touched DOM after jsdom teardown (`tests/setup.ts` `document.createElement` with `document` unavailable). This is outside the Models settings report scope and was not changed in this implementation pass.

## Final Status

No code defects were found in the existing exposed Models settings controls during this audit. The implementation pass addresses the identified disclosure gaps without expanding beyond the report scope.

Completed follow-up scope:

1. Common-tab `small_model` picker and local `.opencode` write path.
2. Structured controls for common `models.<id>.options` keys while retaining raw JSON/key-value support.
3. Documentation of the difference between OpenCode model config options and OpenCodian send-time `effortLevel` / `thinkingBudget`.
