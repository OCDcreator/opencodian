# Model Provider Semantic Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render each provider as a semantic sticky Command group and each
model as a visually nested selectable leaf.

**Architecture:** `ModelSelectorRenderer` owns group semantics and the single
provider icon. `model-selector.css` owns nesting and sticky group presentation.
Existing shared Command option geometry, interaction owners, and overlay frame
remain unchanged.

**Tech Stack:** TypeScript, Obsidian DOM helpers, CSS custom properties, Jest,
Puppeteer layout tests.

## Global Constraints

- Preserve all existing dirty changes. Do not use git reset, checkout, clean,
  stash, commit, or rebase.
- Use `apply_patch` for manual file edits.
- Use Kimi Code model `kimi-code/kimi-for-coding`, never the highspeed alias.
- Do not add dependencies, new UI libraries, assets, gradients, glass, rails,
  nested cards, or renderer abstractions.
- Retain search, ARIA active-descendant behavior, Arrow/Enter/Escape handling,
  selection, focus restoration, 280px viewport, sticky coverage, and 8px
  narrow-pane inset.

---

### Task 1: Define the semantic and visual regression contract

**Files:**
- Modify: `tests/unit/features/chat/modelSelectorRenderer.test.ts`
- Modify: `tests/unit/infrastructure/model-popover-provider-hierarchy.test.mjs`

**Interfaces:**
- Consumes: `renderModelList` from
  `src/features/chat/ui/modelSelector/ModelSelectorRenderer.ts`.
- Produces: tests proving a provider group label is not an option, a provider
  logo is not repeated in model rows, and sticky header coverage remains safe.

- [ ] **Step 1: Write failing DOM tests**

  Add a renderer test that renders one provider with multiple models and
  expects a group with `role="group"`, an `aria-labelledby` reference to the
  provider label, no `role="option"` on the label, and exactly one provider
  icon for the group. Add a source/layout test requiring the group header to
  use an opaque `var(--background-primary)` surface and forbidding its old
  full-width border and tonal `color-mix` background.

- [ ] **Step 2: Run the targeted tests and record RED**

  Run:

  ```bash
  npm test -- --runInBand --runTestsByPath \
    tests/unit/features/chat/modelSelectorRenderer.test.ts \
    tests/unit/infrastructure/model-popover-provider-hierarchy.test.mjs
  ```

  Expected: failure because provider groups have no role/label relationship,
  model rows still contain provider logos, and the old heading style remains.

### Task 2: Render a semantic provider group and nested model leaves

**Files:**
- Modify: `src/features/chat/ui/modelSelector/ModelSelectorRenderer.ts`
- Modify: `src/style/components/model-selector.css`
- Modify: `docs/modules/features/chat/ui/modelSelector/ModelSelectorRenderer.md`
- Modify: `docs/modules/style/components/model-selector.md`

**Interfaces:**
- Consumes: Task 1 DOM/layout expectations and existing
  `bindModelSelectorStickyHeaders(scrollContainer, headers)`.
- Produces: provider group semantics and a stable visual hierarchy without
  changing model selection events or listbox option identity.

- [ ] **Step 1: Apply the smallest renderer change**

  Give each provider group `role="group"` and `aria-labelledby` pointing to a
  unique id on its heading label. Insert a layout-only model-options wrapper
  after the heading. Render the provider icon only in the heading. Keep the
  model option's shared leading icon slot empty, still `aria-hidden`, so grid
  alignment and interaction ownership stay unchanged.

- [ ] **Step 2: Apply the smallest style change**

  Remove the header tonal band and repeated full-width border. Keep
  `position: sticky`, `top: 0`, `z-index`, and an opaque
  `var(--background-primary)` background. Use compact heading typography and
  group spacing. Let the empty shared leading slot create the child indentation;
  do not create a second card, rail, badge, or model-row background.

- [ ] **Step 3: Run the Task 1 tests and verify GREEN**

  Run the exact command from Task 1. Expected: all targeted assertions pass.

### Task 3: Prove behavior and generated artifacts remain healthy

**Files:**
- Modify: generated `styles.css`
- Verify: `dist/main.js`, `dist/manifest.json`, `dist/styles.css`

- [ ] **Step 1: Run model behavior and viewport tests**

  ```bash
  npm test -- --runInBand --runTestsByPath \
    tests/unit/features/chat/modelSelectorRenderer.test.ts \
    tests/unit/infrastructure/model-popover-provider-hierarchy.test.mjs \
    tests/unit/infrastructure/model-popover-viewport-render.test.mjs
  ```

  Expected: all suites pass.

- [ ] **Step 2: Refresh project artifacts and full gates**

  ```bash
  npm run graphify:update:src
  OWNER_GUARD_APPROVED='Approved Composer permission-card rollback requires the existing OpenCodianView-owned OpenCode service restart seam.' npm run verify
  ```

  Expected: zero lint warnings/errors, typecheck and tests pass, module docs and
  graph freshness pass, and production build succeeds.

- [ ] **Step 3: Deploy and validate runtime sequentially**

  After the successful build, copy `dist/main.js`, then
  `dist/manifest.json`, then `dist/styles.css` to
  `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`
  in three separate commands. Confirm the deployed BUILD_ID, reload the
  plugin, and capture unscrolled and scrolled Model popovers in light and dark
  themes. Verify semantic group DOM, one provider icon per group, no row bleed,
  280px viewport, narrow 8px inset, search, Arrow/Enter/Escape, and no console
  errors.
