# MCP Settings Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reshape the MCP settings page into a normal OpenCodian-style grouped card layout while preserving existing behavior.

**Architecture:** Keep the current MCP section and add-form owners, but introduce more intentional DOM wrappers and dedicated CSS hooks so overview, runtime rows, and form groups render as stable cards. Lock the new structure with unit tests before polishing docs.

**Tech Stack:** TypeScript, Obsidian `Setting` UI primitives, repo CSS pipeline, Jest unit tests

---

### Task 1: Lock the target DOM structure with failing tests

**Files:**
- Modify: `tests/unit/features/settings/SettingsMcpSection.test.ts`

- [ ] Add assertions for the new grouped overview/server/form layout hooks.
- [ ] Run the focused MCP section test file and confirm the new assertions fail for the expected missing-structure reason.

### Task 2: Restructure the MCP section DOM

**Files:**
- Modify: `src/features/settings/SettingsMcpSection.ts`

- [ ] Add dedicated overview toolbar, server list shell, row content wrappers, and action containers.
- [ ] Keep existing refresh and runtime action behavior unchanged.
- [ ] Re-run the focused MCP section tests and confirm the new structure passes.

### Task 3: Group the add-server form

**Files:**
- Modify: `src/features/settings/SettingsMcpAddForm.ts`
- Modify: `tests/unit/features/settings/SettingsMcpSection.test.ts`

- [ ] Add grouped card wrappers for basics, connection, and conditional OAuth content.
- [ ] Add or update tests to cover the default grouped form structure.
- [ ] Re-run the focused MCP section tests and confirm the form assertions pass.

### Task 4: Style the new MCP layout

**Files:**
- Modify: `src/style/modals/config-editor-modal.css`
- Modify: `src/style/components/model-selector.css`
- Modify: `styles.css`

- [ ] Add MCP-specific styles for the overview shell, metric cards, list card, aligned server rows, grouped form cards, and action button layout.
- [ ] Keep the styling aligned with existing settings blocks and agent editor cards.
- [ ] Run the focused MCP section tests again to guard against structure regressions.

### Task 5: Refresh docs and verify

**Files:**
- Modify: `docs/modules/features/settings/SettingsMcpSection.md`
- Modify: `docs/modules/features/settings/SettingsMcpAddForm.md`

- [ ] Update docs to reflect the grouped layout shells and responsibilities.
- [ ] Run `npm run verify`.
- [ ] Report the verification result exactly as observed.
