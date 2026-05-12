# Settings Layout Regression Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit the completed settings UI refactor slices, codify the classic/tabbed hierarchy rules, and prevent future slices from over-flattening or over-nesting settings surfaces.

**Architecture:** This is Slice 6 of the settings UI refactor. It is primarily a regression-audit and contract-hardening pass rather than a new visual slice: consolidate rules in module docs, add a focused Jest contract that reads the docs/CSS contracts, then verify the real Obsidian settings surfaces through autodebug screenshots and DOM checks. Runtime settings behavior remains untouched.

**Tech Stack:** Obsidian plugin, TypeScript/Jest contract tests, Markdown status/module docs, existing vanilla CSS contracts, Obsidian CLI/autodebug evidence capture.

---

## Design Constraints

- Product register: Obsidian-native workbench, dense but not crowded, calm/capable/transparent.
- Respect the user feedback from Slice 5: flattening is not universally good. Classic mode often needs visible second-level grouping when one primary section contains many child areas.
- Tabbed mode and classic mode are both first-class, but their hierarchy affordances differ:
  - tabbed mode can use unframed child blocks when secondary tabs already separate the child areas;
  - classic mode may need lightweight child panels for multi-block sections.
- Do not change schema, defaults, migrations, locale copy, runtime logic, OpenCode service behavior, agent/command/plugin behavior, or settings save semantics.
- Only make CSS changes if audit/autodebug finds a concrete visual regression.

## File Structure

- Create: `docs/status/settings-layout-regression-audit-2026-05-12.md`
  - Documents the audit matrix, findings, and final hierarchy rules.
- Modify: `docs/modules/style/components/settings-layout-contract.md`
  - Adds a reusable hierarchy taxonomy: nav, section, classic child panel, object, row, inline.
- Modify: `tests/unit/features/settings/OpenCodianSettings.test.ts`
  - Adds a contract test that checks the docs and CSS preserve mode-aware hierarchy language and selectors.
- Runtime-only: `.obsidian-debug/settings-layout-regression-audit/*`
  - Autodebug eval scripts, JSON output, and screenshots. Do not commit.

## Task 1: Write The Regression Contract Test

**Files:**
- Modify: `tests/unit/features/settings/OpenCodianSettings.test.ts`

- [x] **Step 1: Add a docs/CSS contract test**

Append inside the existing settings hierarchy contract `describe` block or near the existing visible hierarchy test:

```ts
it('documents mode-aware settings hierarchy rules after the regression audit', () => {
  const contractDoc = readFileSync(
    join(process.cwd(), 'docs/modules/style/components/settings-layout-contract.md'),
    'utf8',
  );
  const modalDoc = readFileSync(
    join(process.cwd(), 'docs/modules/style/modals/config-editor-modal.md'),
    'utf8',
  );
  const modalCss = readFileSync(
    join(process.cwd(), 'src/style/modals/config-editor-modal.css'),
    'utf8',
  );

  expect(contractDoc).toContain('Mode-Aware Hierarchy Taxonomy');
  expect(contractDoc).toContain('classic child panel');
  expect(contractDoc).toContain('tabbed mode');
  expect(contractDoc).toContain('classic mode');
  expect(contractDoc).toContain('row tokens');
  expect(contractDoc).toContain('inline tokens');
  expect(modalDoc).toContain('classic hierarchy repair');
  expect(modalCss).toMatch(/data-settings-layout-mode="classic"[\s\S]*\.opencodian-plugin-block/);
  expect(modalCss).toMatch(/\.opencodian-settings-catalog-scroll > \.setting-item\s*\{[\s\S]*var\(--opencodian-settings-row-bg/);
});
```

- [x] **Step 2: Run the focused test and confirm it fails before docs updates**

Run:

```bash
npm test -- --runInBand tests/unit/features/settings/OpenCodianSettings.test.ts
```

Expected: FAIL because `Mode-Aware Hierarchy Taxonomy` does not exist yet.

## Task 2: Document The Mode-Aware Hierarchy Taxonomy

**Files:**
- Modify: `docs/modules/style/components/settings-layout-contract.md`
- Create: `docs/status/settings-layout-regression-audit-2026-05-12.md`

- [x] **Step 1: Add taxonomy to module docs**

Add a section named `Mode-Aware Hierarchy Taxonomy` after `Surface Contract`:

```md
## Mode-Aware Hierarchy Taxonomy

- **Navigation shell**: quick nav, primary tabs, and secondary tabs. Use nav / inline tokens. Never use content-card styling here.
- **Primary section**: `.opencodian-settings-section`. Use section tokens. This is the strongest shared content surface.
- **Classic child panel**: a child group inside a classic section when the area has several independent sub-areas. Use object tokens, no shadow, no gradient, no blur. Do not use this by default in tabbed mode because secondary tabs already provide hierarchy.
- **Object surface**: a meaningful entity such as a provider, server, formatter, editor group, or plugin source item. Use object tokens.
- **Row surface**: ordinary settings rows, catalog rows, helper rows, tables, and nested editable rows. Use row tokens.
- **Inline surface**: paths, compact key/value rows, toolbars, filters, and button bars. Use inline tokens or transparent backgrounds.

Rule: never apply one hierarchy rule globally across both layout modes without checking what already provides separation. In classic mode, visible grouping may be needed for scanability. In tabbed mode, extra panels can become nested-card noise.
```

- [x] **Step 2: Create audit status doc**

Create `docs/status/settings-layout-regression-audit-2026-05-12.md` with:

- scope and non-goals;
- audit matrix for layout foundation, model availability, MCP, formatter, agents, commands, plugins;
- accepted mode differences;
- remaining design debt;
- autodebug evidence paths after Task 4.

## Task 3: Run Focused And Full Verification

- [x] **Step 1: Run focused tests**

Run:

```bash
npm test -- --runInBand tests/unit/features/settings/OpenCodianSettings.test.ts tests/unit/features/settings/SettingsPluginSection.test.ts tests/unit/features/settings/SettingsMcpSection.test.ts tests/unit/features/settings/SettingsFormatterSection.test.ts tests/unit/features/settings/SettingsModelCatalogPresenter.test.ts
```

Expected: PASS.

- [x] **Step 2: Run full verify**

Run:

```bash
npm run verify
```

Expected: PASS.

## Task 4: Autodebug Regression Audit

**Runtime-only files:**
- Create under `.obsidian-debug/settings-layout-regression-audit/`

- [x] **Step 1: Use Obsidian CLI preflight**

Run:

```bash
obsidian help
obsidian dev:console clear vault=testvault
obsidian dev:errors clear vault=testvault
obsidian plugin:reload id=opencodian vault=testvault
```

- [x] **Step 2: Run eval scripts for representative surfaces**

Use `obsidian_eval_file.mjs` to inspect:

- classic model availability;
- tabbed model availability;
- classic MCP overview;
- tabbed MCP overview;
- classic formatter;
- tabbed formatter overview;
- classic agents catalog;
- tabbed agents catalog;
- tabbed plugins global.

Each result should include:

- mode;
- primary/secondary tab when applicable;
- section or child panel border/radius/shadow;
- object/row/inline counts where available;
- no `.opencodian-settings-tab-panel`;
- no console errors.

- [x] **Step 3: Capture screenshots**

Save screenshots under:

```text
.obsidian-debug/settings-layout-regression-audit/
```

- [x] **Step 4: Update audit status doc**

Add the result JSON summaries, screenshot paths, and console/error status to `docs/status/settings-layout-regression-audit-2026-05-12.md`.

## Task 5: Commit

- [x] **Step 1: Inspect diff**

Run:

```bash
git diff --stat
git diff --check
git diff -- docs/modules/style/components/settings-layout-contract.md docs/status/settings-layout-regression-audit-2026-05-12.md tests/unit/features/settings/OpenCodianSettings.test.ts | sed -n '1,260p'
```

- [x] **Step 2: Commit**

Run:

```bash
git add docs/modules/style/components/settings-layout-contract.md docs/status/settings-layout-regression-audit-2026-05-12.md docs/superpowers/plans/2026-05-12-settings-layout-regression-audit.md tests/unit/features/settings/OpenCodianSettings.test.ts
git commit -m "docs: codify settings layout hierarchy rules"
```

## Self-Review

- Spec coverage: The plan uses the requested design/UI skills, writes a concrete plan first, implements a regression audit rather than a new broad slice, and includes Obsidian autodebug.
- Placeholder scan: No TBD/TODO/fill-in placeholders are present; audit doc content is specified concretely.
- Type consistency: The test uses existing `readFileSync` and `join` imports already present in `OpenCodianSettings.test.ts`.
