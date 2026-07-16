# Capability Lab Backend Workspaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Present Claude Code, OpenCode, and Codex capability evidence in three separate, accessible, peer workspaces inside Capability Lab.

**Architecture:** Keep `SettingsCapabilityLabSection` as the existing diagnostic owner. Recompose only its top capability overview into three peer sections, reuse the current matrix row builders and OpenCode snapshot logic, and add local CSS that makes the backend section the sole card owner.

**Tech Stack:** TypeScript, Obsidian DOM APIs, Jest/jsdom, CSS, OpenCodian i18n, graphify, Obsidian Plugin Autodebug.

## Global Constraints

- Preserve all capability classification and probe behavior.
- Keep Claude Code, OpenCode, and Codex workspaces as direct siblings in that order.
- Do not introduce nested cards or backend sections.
- Use localized visible state text and accessible table/section labels.
- Keep table overflow local to its table shell.
- Update matching `docs/modules/**` pages and run `npm run graphify:update:src` after source edits.

---

### Task 1: Lock The Backend Workspace DOM Contract

**Files:**
- Modify: `tests/unit/features/settings/SettingsCapabilityLabSection.test.ts`

**Interfaces:**
- Consumes: `SettingsCapabilityLabSection.attachTabbed(containerEl, secondaryTabId)`.
- Produces: regression assertions for `[data-capability-backend]`, `[data-backend-state]`, and `[data-capability-matrix]`.

- [x] **Step 1: Add peer-workspace and no-nesting assertions.**
- [x] **Step 2: Run the targeted Jest suite and confirm failure because the current matrix mixes Claude Code and Codex.**
- [x] **Step 3: Add backend state and accessibility assertions before implementation.**

### Task 2: Render Three Peer Backend Workspaces

**Files:**
- Modify: `src/features/settings/SettingsCapabilityLabSection.ts`
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/zh.ts`

**Interfaces:**
- Consumes: `buildMatrixRows()`, `buildCodexMatrixRows()`, and `getSdkCapabilitySnapshot()`.
- Produces: separate Claude Code and Codex matrix renderers plus the existing OpenCode snapshot renderer inside peer backend sections.

- [x] **Step 1: Add localized backend titles, descriptions, states, and table labels.**
- [x] **Step 2: Render three direct sibling backend sections with stable data attributes and accessible headings.**
- [x] **Step 3: Remove the Codex separator row and render Codex rows only in the Codex table.**
- [x] **Step 4: Preserve OpenCode safe refresh/export behavior and expose busy/live semantics.**
- [x] **Step 5: Run the targeted Jest suite and confirm it passes.**

### Task 3: Apply The Single-Surface Visual Contract

**Files:**
- Modify: `src/style/components/settings-capability-lab.css`

**Interfaces:**
- Consumes: the backend workspace DOM from Task 2.
- Produces: one visual surface per backend, flat internal table/actions, and narrow-container behavior.

- [x] **Step 1: Add backend workspace/header/state styling using existing settings tokens.**
- [x] **Step 2: Flatten table shells inside backend workspaces and remove separator styling.**
- [x] **Step 3: Add container/media fallback rules for narrow settings panes.**
- [x] **Step 4: Run `npm run build:css` and the targeted Jest suite.**

### Task 4: Documentation And Repository Gates

**Files:**
- Modify: `docs/modules/features/settings/SettingsCapabilityLabSection.md`
- Modify: `docs/modules/style/components/settings-capability-lab.md`
- Modify: generated `styles.css` and `graphify-out/**` artifacts.

**Interfaces:**
- Consumes: final DOM and CSS contracts.
- Produces: synchronized module documentation, CSS bundle, and graph.

- [x] **Step 1: Document backend ownership, states, selectors, and no-nesting rules.**
- [x] **Step 2: Run `npm run graphify:update:src`.**
- [x] **Step 3: Run `npm run verify` and resolve all failures or warnings.**

### Task 5: Test Vault Runtime And Visual QA

**Files:**
- Output: `.obsidian-debug/capability-lab-backend-workspaces-*/`.

**Interfaces:**
- Consumes: production build artifacts and Test Vault plugin path.
- Produces: BUILD_ID, DOM, console/errors, screenshots, diagnosis, and visual-review evidence.

- [x] **Step 1: Run Autodebug doctor and build the plugin.**
- [x] **Step 2: Deploy `dist/main.js`, `dist/manifest.json`, and `dist/styles.css` sequentially to the Test Vault.**
- [x] **Step 3: Reload the plugin, activate Capability Lab, and prove the active surface before capture.**
- [x] **Step 4: Assert three direct peer backend workspaces, no nested backend, no page overflow, and local table overflow.**
- [x] **Step 5: Capture light/dark screenshots and run diagnosis plus visual review.**
- [x] **Step 6: Review the final diff and report retained evidence paths and residual risks.**
