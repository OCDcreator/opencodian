# Settings Skill Tool ACP UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Skills, Tools, and ACP Agents settings surfaces usable, scannable, and Obsidian-native instead of a loose list of controls.

**Architecture:** Keep ownership inside the existing settings section files and shared settings CSS contract. Add lightweight structural wrappers, summary rows, empty/loading states, and semantic classes without changing runtime config behavior.

**Tech Stack:** TypeScript, Obsidian `Setting`, DOM helpers, CSS variables, Jest, repo module-doc and graphify gates.

---

## File Structure

- Modify: `src/features/settings/SettingsSkillSection.ts`
  - Add a compact toolbar, grouped source sections, loading state, refined skill cards, and source/count metadata.
- Modify: `src/features/settings/SettingsToolSection.ts`
  - Add grouped tool panels with group headers, permission chips, empty states, and stable row classes.
- Modify: `src/features/settings/SettingsAcpSection.ts`
  - Replace scattered preset buttons and plain agent cards with a composed preset rail, agent summary header, and stacked form grid.
- Modify: `src/style/components/settings-layout-contract.css`
  - Add the visual system for the three surfaces: tokens, toolbar, compact cards, grouped rows, responsive ACP grid, focus/hover states.
- Modify: `src/i18n/locales/en.ts`
  - Add concise labels for counts, loading, tool group descriptions, and ACP presets.
- Modify: `src/i18n/locales/zh.ts`
  - Add matching Chinese labels.
- Modify: `tests/unit/features/settings/SettingsSurfaceSections.test.ts`
  - Add focused DOM tests for Skills, Tools, and ACP layout classes and states.
- Modify: `docs/modules/features/settings/SettingsSkillSection.md`
  - Document the new toolbar, grouped card rendering, and loading/empty behavior.
- Modify: `docs/modules/features/settings/SettingsToolSection.md`
  - Document grouped panels and semantic permission row classes.
- Modify: `docs/modules/features/settings/SettingsAcpSection.md`
  - Document preset rail and agent card layout changes.

## Task 1: Baseline Section Tests

**Files:**
- Create or modify: `tests/unit/features/settings/SettingsSurfaceSections.test.ts`

- [ ] **Step 1: Write failing DOM tests**

Add tests that instantiate each section in isolation and assert the new layout classes:

```ts
expect(containerEl.querySelector('.opencodian-skill-toolbar')).not.toBeNull();
expect(containerEl.querySelector('.opencodian-tool-group-panel')).not.toBeNull();
expect(containerEl.querySelector('.opencodian-acp-preset-rail')).not.toBeNull();
```

- [ ] **Step 2: Run the focused test**

Run: `npm run test -- tests/unit/features/settings/SettingsSurfaceSections.test.ts --runInBand`

Expected: FAIL because the new classes do not exist yet.

## Task 2: Skills Surface

**Files:**
- Modify: `src/features/settings/SettingsSkillSection.ts`
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/zh.ts`

- [ ] **Step 1: Add toolbar and loading state**

Wrap the permission dropdown and refresh action in `.opencodian-skill-toolbar`, add `.opencodian-settings-inline-empty` while skills load, and preserve the existing `setToolPermission('skill', action)` behavior.

- [ ] **Step 2: Add grouped source sections**

Render each non-empty source in `.opencodian-skill-source-section` with a header containing the source label and item count.

- [ ] **Step 3: Refine cards**

Render skill name, short description, location, and content preview in stable child classes so CSS can make the cards scannable without changing fetched data.

## Task 3: Tools Surface

**Files:**
- Modify: `src/features/settings/SettingsToolSection.ts`
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/zh.ts`

- [ ] **Step 1: Add group panels**

Render built-in tool groups as `.opencodian-tool-group-panel` with a header and short description.

- [ ] **Step 2: Add semantic permission row classes**

Each tool row gets `.opencodian-tool-permission-row` plus `data-tool-permission`, with display name, tool id, and dropdown preserved.

- [ ] **Step 3: Improve custom tool empty state**

Use a shared empty-state class with plain copy when no catalog store or custom tools exist.

## Task 4: ACP Surface

**Files:**
- Modify: `src/features/settings/SettingsAcpSection.ts`
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/zh.ts`

- [ ] **Step 1: Replace preset bar with rail**

Render `.opencodian-acp-preset-rail` with one add-custom action and one button per preset, using concise labels and no oversized button text.

- [ ] **Step 2: Add agent card header**

Each card gets `.opencodian-acp-agent-card-header`, name/title, command summary, enabled toggle, and remove action.

- [ ] **Step 3: Keep fields full-width and accessible**

Use generated label/input ids and keep labels above inputs. Preserve save-on-change behavior.

## Task 5: CSS Contract

**Files:**
- Modify: `src/style/components/settings-layout-contract.css`

- [ ] **Step 1: Add shared surface primitives**

Add `.opencodian-settings-inline-empty`, toolbar, group panel, and compact metadata styles using existing Obsidian variables.

- [ ] **Step 2: Style Skills**

Make skill groups scannable, cards compact, source paths monospace, and content previews readable with capped height.

- [ ] **Step 3: Style Tools**

Make permission rows align, wrap on small widths, and expose allow/ask/deny states with restrained semantic tones.

- [ ] **Step 4: Style ACP**

Make preset rail and agent cards responsive, with stable field dimensions and 44px-class hit targets where buttons are present.

## Task 6: Docs And Generated Artifacts

**Files:**
- Modify: `docs/modules/features/settings/SettingsSkillSection.md`
- Modify: `docs/modules/features/settings/SettingsToolSection.md`
- Modify: `docs/modules/features/settings/SettingsAcpSection.md`
- Generated: `styles.css`
- Generated: `graphify-out/**`

- [ ] **Step 1: Update module docs**

Document the new DOM structure and clarify that behavior is unchanged.

- [ ] **Step 2: Refresh CSS build**

Run: `npm run build:css`

Expected: root `styles.css` updates.

- [ ] **Step 3: Refresh graphify**

Run: `npm run graphify:update:src`

Expected: graph freshness artifacts are current.

## Task 7: Verification And Autodebug

**Files:**
- Runtime artifacts under: `.obsidian-debug/`

- [ ] **Step 1: Run focused tests**

Run: `npm run test -- tests/unit/features/settings/SettingsSurfaceSections.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 2: Run build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 3: Deploy to Test Vault**

Copy `dist/main.js`, `dist/manifest.json`, and `dist/styles.css` to `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`.

- [ ] **Step 4: Verify BUILD_ID**

Read the newest `BUILD_ID` from `dist/main.js` and confirm the deployed `main.js` contains the same value.

- [ ] **Step 5: Run Obsidian autodebug**

Use the repo-local or skill-provided Obsidian debug workflow to reload the plugin, open settings, capture console/errors/screenshot/DOM evidence, and inspect the visual result for the three settings surfaces.

## Self-Review

- Spec coverage: Skills, Tools, ACP Agents styling/layout are explicitly covered.
- Placeholder scan: No implementation step relies on unspecified helper names.
- Type consistency: Existing settings section owners and settings persistence APIs remain unchanged.
