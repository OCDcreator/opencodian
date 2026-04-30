# Autopilot Round Roadmap — `h3-settings-bootstrap-package`

## Queue

### [NEXT] Task 1 - Package `OpenCodianSettings` section-shell bridges

- **Goal**: Remove one durable cross-section bridge or shell-construction slice from `OpenCodianSettings.ts` by leaning harder on the existing section owners and chrome helpers.
- **Key files**:
  - `src/features/settings/OpenCodianSettings.ts`
  - `src/features/settings/SettingsSectionCoordinator.ts`
  - `src/features/settings/SettingsTabbedRenderer.ts`
  - one or more existing section owners
  - matching tests/docs
- **Acceptance**:
  - `OpenCodianSettings.ts` loses measurable direct assembly work.
  - No new thin settings shells are introduced.
- **Validation**: `npm test -- --runInBand tests/unit/features/settings/OpenCodianSettings.test.ts tests/unit/features/settings/SettingsTabbedRenderer.test.ts tests/unit/features/settings/SettingsModelSection.test.ts tests/unit/features/settings/SettingsCommandsSection.test.ts`

### [QUEUED] Task 2 - Package plugin startup, warmup, and refresh orchestration out of `main.ts`

- **Goal**: Reduce one startup/runtime orchestration cluster in `main.ts` by strengthening an existing or clearly durable plugin-adjacent owner.
- **Key files**:
  - `src/main.ts`
  - one or more plugin-adjacent owners under `src/core/` or `src/features/`
  - matching tests/docs
- **Acceptance**:
  - `main.ts` loses measurable assembly pressure while startup order and view refresh semantics remain correct.
  - No runtime behavior shifts into anemic wrappers.
- **Validation**: `npm test -- --runInBand tests/unit/main.test.ts tests/unit/main/themeSettingsMigration.test.ts`

### [QUEUED] Task 3 - Package model-catalog presentation pressure and checkpoint settings-shell deltas

- **Goal**: Tighten the boundary between `SettingsModelCatalogPresenter.ts` and adjacent owners so presentation state becomes more focused and the lane can record before/after hotspot deltas.
- **Key files**:
  - `src/features/settings/SettingsModelCatalogPresenter.ts`
  - `src/features/settings/SettingsModelSection.ts`
  - `src/core/config/ModelConfigService.ts`
  - matching tests/docs
- **Acceptance**:
  - Presenter or section shell pressure decreases without smearing config semantics across UI helpers.
  - The lane documents hotspot deltas for the checkpoint lane.
- **Validation**: `npm test -- --runInBand tests/unit/features/settings/SettingsModelCatalogPresenter.test.ts tests/unit/features/settings/SettingsModelSection.test.ts tests/unit/features/settings/modelConfigWorkspace.test.ts`

## Lane State

- When Task 1-3 are complete and no `[NEXT]` or `[QUEUED]` items remain here, the controller switches to `h4-checkpoint`.
