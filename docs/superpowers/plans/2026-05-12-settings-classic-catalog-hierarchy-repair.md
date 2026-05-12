# Settings Classic Catalog Hierarchy Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore readable hierarchy for Agents, Commands, and Plugin catalog/settings blocks in classic settings mode without undoing the cleaner tabbed-mode density work.

**Architecture:** This is a repair slice after the plugin/catalog density pass. The shared `.opencodian-plugin-block` remains flat by default for tabbed mode, while classic mode gets a scoped section panel under `.opencodian-settings[data-settings-layout-mode="classic"]`. Catalog rows stay on row tokens, object-like child surfaces stay on object tokens, and paths stay on inline tokens.

**Tech Stack:** Obsidian plugin, TypeScript, Jest CSS contract tests, vanilla CSS compiled through `npm run build:css`, Test Vault deployment, Obsidian CLI/autodebug evidence capture.

---

## Design Constraints

- The user-visible bug is classic mode hierarchy: Agents / Commands / Plugin areas with multiple child blocks look visually flat and hard to scan.
- Do not change behavior, defaults, schema, locale copy, OpenCode runtime logic, command logic, agent logic, or plugin-management logic.
- Do not make tabbed mode heavier: tabbed mode already has secondary tabs that carry hierarchy.
- In classic mode, `.opencodian-plugin-block` should become a light section panel using shared object tokens, no shadow, no gradient, no blur.
- Catalog rows remain row-level elements inside the classic section panel.

## File Structure

- Modify: `src/style/modals/config-editor-modal.css`
  - Add classic-mode scoped `.opencodian-plugin-block` hierarchy styles.
- Modify: `tests/unit/features/settings/SettingsPluginSection.test.ts`
  - Extend the CSS contract so it preserves both tabbed flat blocks and classic section panels.
- Modify: `docs/modules/style/modals/config-editor-modal.md`
  - Document the classic-mode repair.
- Create after validation: `docs/status/settings-classic-catalog-hierarchy-repair-visual-qa-2026-05-12.md`
  - Record verification and autodebug evidence.
- Generated: `styles.css`

## Task 1: Update The CSS Contract

- [ ] **Step 1: Keep the base block assertion for tabbed mode**

The existing `.opencodian-plugin-block` rule must continue to include:

```ts
expect(blockRule).toContain('background: transparent');
expect(blockRule).toContain('border: 0');
expect(blockRule).toContain('box-shadow: none');
```

- [ ] **Step 2: Add a classic-mode block assertion**

Add:

```ts
const classicBlockRule = findRule(
  '\\.opencodian-settings\\[data-settings-layout-mode="classic"\\] \\.opencodian-plugin-block',
  'background:',
);

expect(classicBlockRule).toContain('var(--opencodian-settings-object-bg');
expect(classicBlockRule).toContain('var(--opencodian-settings-object-border');
expect(classicBlockRule).toContain('var(--opencodian-settings-radius-row');
expect(classicBlockRule).toContain('box-shadow: none');
```

## Task 2: Add Classic-Scoped Section Panels

- [ ] **Step 1: Add classic plugin block styles**

Add after the base `.opencodian-plugin-block-body` rule:

```css
.opencodian-settings[data-settings-layout-mode="classic"] .opencodian-plugin-block {
  margin: var(--opencodian-settings-space-lg) 0 var(--opencodian-settings-space-xl);
  padding: 12px;
  border: 1px solid var(--opencodian-settings-object-border);
  border-radius: var(--opencodian-settings-radius-row);
  background: var(--opencodian-settings-object-bg);
  box-shadow: none;
}

.opencodian-settings[data-settings-layout-mode="classic"] .opencodian-plugin-block > .opencodian-settings-subsection-heading {
  padding: 0;
}

.opencodian-settings[data-settings-layout-mode="classic"] .opencodian-plugin-block-body {
  padding-top: var(--opencodian-settings-space-md);
}
```

- [ ] **Step 2: Run focused tests**

Run:

```bash
npm test -- --runInBand tests/unit/features/settings/SettingsPluginSection.test.ts tests/unit/features/settings/SettingsAgentsSection.test.ts tests/unit/features/settings/SettingsCommandsSection.test.ts tests/unit/features/settings/SettingsTabbedRenderer.test.ts
```

Expected: PASS.

## Task 3: Validate, Deploy, Autodebug, Commit

- [ ] Run `npm run build:css`.
- [ ] Run `npm run verify`.
- [ ] Deploy `dist/main.js`, `dist/manifest.json`, and `dist/styles.css` to the Test Vault plugin directory.
- [ ] Verify deployed BUILD_ID.
- [ ] Autodebug classic Agents catalog and tabbed Agents catalog:
  - classic block should have 1px border, 10px radius, no shadow;
  - tabbed block should remain transparent/unframed;
  - catalog rows should remain 1px row surfaces.
- [ ] Write QA report.
- [ ] Commit with `style: repair classic catalog settings hierarchy`.
