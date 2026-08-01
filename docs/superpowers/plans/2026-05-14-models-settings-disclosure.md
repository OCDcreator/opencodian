# Models Settings Disclosure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Models settings page fully disclose the OpenCode model/provider capabilities identified in `docs/archive/maintainability/phases/models-settings-audit-2026-05-14.md`.

**Architecture:** Keep section ownership intact. `SettingsModelSection` adds the Common-tab entry point, `SettingsModelCatalogCoordinator` owns local `.opencode` writes for `small_model`, and the model workspace editor gets a focused structured-options helper while retaining raw key/value escape hatches.

**Tech Stack:** TypeScript, Obsidian settings UI, Jest/jsdom, OpenCodian model config services.

---

### Task 1: Common-tab `small_model` Disclosure

**Files:**
- Modify: `src/features/settings/SettingsModelSection.ts`
- Modify: `src/features/settings/SettingsModelCatalogCoordinator.ts`
- Test: `tests/unit/features/settings/SettingsModelCatalogCoordinator.test.ts`

- [x] Write failing tests for selecting and clearing `small_model` through the coordinator.
- [x] Add `smallModelButton` to the runtime state and render a Common-tab setting.
- [x] Add `openSmallModelPicker()` and `updateSmallModelButton()` to read/write local model config `small_model`.
- [x] Run the focused coordinator tests.

### Task 2: Structured Model Options Disclosure

**Files:**
- Create: `src/features/settings/modelConfigStructuredOptions.ts`
- Modify: `src/features/settings/modelConfigWorkspace.ts`
- Modify: `src/features/settings/ModelConfigModelListEditor.ts`
- Test: `tests/unit/features/settings/modelConfigStructuredOptions.test.ts`
- Test: `tests/unit/features/settings/modelConfigWorkspace.test.ts`

- [x] Write failing helper tests for reasoning effort, text verbosity, reasoning summary, include list, and Anthropic thinking fields.
- [x] Implement structured option get/set helpers that operate on existing key/value option state.
- [x] Render optional structured controls above the raw `options` editor.
- [x] Ensure preview/save serialization remains unchanged.

### Task 3: Docs, Build, and Runtime Validation

**Files:**
- Create: `docs/modules/features/settings/modelConfigStructuredOptions.md`
- Modify: `docs/modules/features/settings/SettingsModelSection.md`
- Modify: `docs/modules/features/settings/ModelConfigModal.md`
- Modify: `docs/archive/maintainability/phases/models-settings-audit-2026-05-14.md`

- [x] Update module docs and the audit report final status.
- [x] Run focused tests, module-doc guard, build.
- [x] Deploy to Test Vault and verify BUILD_ID.
- [x] Run Obsidian autodebug assertion for the Models settings page.
