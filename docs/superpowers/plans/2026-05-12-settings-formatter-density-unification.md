# Settings Formatter Density Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Formatter settings overview/config surfaces follow the shared settings hierarchy contract without changing formatter behavior.

**Architecture:** This is Slice 4 of the settings UI refactor. `SettingsFormatterSection.ts` already emits stable `.opencodian-formatter-*` hooks, so this slice stays CSS-first and maps formatter summary cards, runtime table, builtin/custom editor rows, environment rows, and JSON editor controls to the existing `--opencodian-settings-*` token hierarchy. A focused Jest CSS contract guards the formatter slice against local heavy cards, gradients, blur, hover lift, undefined radius tokens, and side-stripe borders.

**Tech Stack:** Obsidian plugin, TypeScript, Jest, vanilla CSS compiled through `npm run build:css`, Test Vault deployment, Obsidian CLI/autodebug evidence capture.

---

## Design Constraints

- Product register: Obsidian-native workbench, dense but not crowded, calm/capable/transparent.
- Both classic/tiled and tabbed modes remain first-class and should use the same visual hierarchy.
- Formatter behavior is unchanged: runtime status, mode switching, builtin overrides, custom formatter CRUD, environment editing, and JSON editor semantics must remain intact.
- Formatter status badges may keep semantic enabled/disabled colors because formatter runtime state affects user decisions.
- No new schema, locale keys, defaults, config semantics, or OpenCode runtime changes.
- No gradients, decorative blur/glass, heavy shadow, hover `translateY`, undefined radius tokens, or side-stripe borders.

## File Structure

- Modify: `tests/unit/features/settings/SettingsFormatterSection.test.ts`
  - Add a CSS contract test for formatter settings hierarchy.
- Modify: `src/style/modals/config-editor-modal.css`
  - Add `.opencodian-formatter-*` CSS rules using shared settings tokens.
- Modify: `docs/modules/style/modals/config-editor-modal.md`
  - Document the Formatter density guardrail.
- Create: `docs/status/settings-formatter-density-visual-qa-2026-05-12.md`
  - Record build/deploy/autodebug evidence and screenshot paths after validation.
- Generated/possibly modified: `styles.css`, `graphify-out/*`
  - Refresh with repo scripts if build/graphify reports changes.

## Task 1: Write The Formatter CSS Contract Test

**Files:**
- Modify: `tests/unit/features/settings/SettingsFormatterSection.test.ts`

- [ ] **Step 1: Add filesystem imports at the top**

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
```

- [ ] **Step 2: Add a formatter CSS contract describe block**

Append after the existing formatter tests:

```ts
describe('SettingsFormatterSection CSS contract', () => {
  it('keeps formatter settings surfaces aligned with the shared settings hierarchy contract', () => {
    const css = readFileSync(
      join(process.cwd(), 'src/style/modals/config-editor-modal.css'),
      'utf8',
    );

    const findRule = (selector: string, required: string): string => (
      Array.from(css.matchAll(new RegExp(`${selector}\\s*\\{[^}]*\\}`, 'g')))
        .map((match) => match[0])
        .find((rule) => rule.includes(required)) ?? ''
    );

    const summaryCardRule = findRule('\\.opencodian-formatter-summary-card', 'background:');
    const runtimeListRule = findRule('\\.opencodian-formatter-runtime-list', 'background:');
    const tableRule = findRule('\\.opencodian-formatter-table', 'background:');
    const builtinRowRule = findRule('\\.opencodian-formatter-builtin-row,\\s*\\.opencodian-formatter-custom-row', 'background:');
    const fieldsRule = findRule('\\.opencodian-formatter-override-fields,\\s*\\.opencodian-formatter-custom-fields', 'background:');
    const envRowRule = findRule('\\.opencodian-formatter-env-row', 'background:');
    const jsonEditorRule = findRule('\\.opencodian-formatter-json-editor', 'background:');
    const buttonBarRule = findRule('\\.opencodian-formatter-json-buttons', 'background:');
    const formatterCss = css.slice(
      css.indexOf('.opencodian-formatter-summary-cards'),
      css.indexOf('.opencodian-plugin-summary-list'),
    );

    expect(summaryCardRule).toContain('var(--opencodian-settings-object-bg');
    expect(summaryCardRule).toContain('var(--opencodian-settings-radius-row');
    expect(summaryCardRule).toContain('box-shadow: none');
    expect(runtimeListRule).toContain('var(--opencodian-settings-object-bg');
    expect(tableRule).toContain('var(--opencodian-settings-row-bg');
    expect(builtinRowRule).toContain('var(--opencodian-settings-object-bg');
    expect(builtinRowRule).toContain('box-shadow: none');
    expect(fieldsRule).toContain('var(--opencodian-settings-row-bg');
    expect(envRowRule).toContain('var(--opencodian-settings-inline-bg');
    expect(jsonEditorRule).toContain('var(--opencodian-settings-row-bg');
    expect(buttonBarRule).toContain('background: transparent');
    expect(formatterCss).not.toContain('linear-gradient');
    expect(formatterCss).not.toContain('backdrop-filter');
    expect(formatterCss).not.toContain('transform: translateY');
    expect(formatterCss).not.toMatch(/border-left:\\s*[2-9]px/);
    expect(formatterCss).not.toMatch(/opencodian-settings-radius-(md|lg)/);
  });
});
```

- [ ] **Step 3: Run the focused test and confirm it fails before CSS edits**

Run:

```bash
npm test -- --runInBand tests/unit/features/settings/SettingsFormatterSection.test.ts
```

Expected: FAIL because the formatter CSS rules do not exist yet.

## Task 2: Add Formatter CSS Token Mapping

**Files:**
- Modify: `src/style/modals/config-editor-modal.css`

- [ ] **Step 1: Add summary and runtime overview rules**

Insert the formatter CSS block before `.opencodian-plugin-summary-list`:

```css
.opencodian-formatter-summary-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--opencodian-settings-space-md);
}

.opencodian-formatter-summary-card {
  padding: 10px 12px;
  border: 1px solid var(--opencodian-settings-object-border);
  border-radius: var(--opencodian-settings-radius-row);
  background: var(--opencodian-settings-object-bg);
  box-shadow: none;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.5;
}

.opencodian-formatter-runtime-list {
  display: flex;
  flex-direction: column;
  gap: var(--opencodian-settings-space-md);
  padding: 12px;
  border: 1px solid var(--opencodian-settings-object-border);
  border-radius: var(--opencodian-settings-radius-row);
  background: var(--opencodian-settings-object-bg);
  box-shadow: none;
}
```

- [ ] **Step 2: Add runtime table and status badge rules**

```css
.opencodian-formatter-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  overflow: hidden;
  border: 1px solid var(--opencodian-settings-row-border);
  border-radius: var(--opencodian-settings-radius-inline);
  background: var(--opencodian-settings-row-bg);
  color: var(--text-normal);
  font-size: 12px;
}

.opencodian-formatter-table th,
.opencodian-formatter-table td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--opencodian-settings-row-border);
  text-align: left;
  vertical-align: top;
}

.opencodian-formatter-table th {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
}

.opencodian-formatter-table tr:last-child td {
  border-bottom: 0;
}

.opencodian-formatter-status-badge {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 650;
  line-height: 1;
  white-space: nowrap;
}

.opencodian-formatter-status-badge.is-enabled {
  color: var(--text-success);
  background: color-mix(in srgb, var(--color-green) 14%, transparent);
  border-color: color-mix(in srgb, var(--color-green) 24%, transparent);
}

.opencodian-formatter-status-badge.is-disabled {
  color: var(--text-muted);
  background: color-mix(in srgb, var(--background-modifier-border) 32%, transparent);
  border-color: color-mix(in srgb, var(--background-modifier-border-hover) 80%, transparent);
}
```

- [ ] **Step 3: Add config row and nested field rules**

```css
.opencodian-formatter-builtin-row,
.opencodian-formatter-custom-row {
  padding: 10px 12px;
  border: 1px solid var(--opencodian-settings-object-border);
  border-radius: var(--opencodian-settings-radius-row);
  background: var(--opencodian-settings-object-bg);
  box-shadow: none;
}

.opencodian-formatter-builtin-row > .setting-item,
.opencodian-formatter-custom-row > .setting-item {
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
}

.opencodian-formatter-override-fields,
.opencodian-formatter-custom-fields {
  display: flex;
  flex-direction: column;
  gap: var(--opencodian-settings-space-sm);
  margin-top: 10px;
  padding: 10px;
  border: 1px solid var(--opencodian-settings-row-border);
  border-radius: var(--opencodian-settings-radius-inline);
  background: var(--opencodian-settings-row-bg);
}

.opencodian-formatter-override-fields .setting-item,
.opencodian-formatter-custom-fields .setting-item,
.opencodian-formatter-env-editor .setting-item {
  margin: 0;
  padding: 8px 0;
  border: 0;
  background: transparent;
  box-shadow: none;
}
```

- [ ] **Step 4: Add environment and JSON editor rules**

```css
.opencodian-formatter-env-editor {
  display: flex;
  flex-direction: column;
  gap: var(--opencodian-settings-space-sm);
}

.opencodian-formatter-env-rows {
  display: flex;
  flex-direction: column;
  gap: var(--opencodian-settings-space-sm);
}

.opencodian-formatter-env-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) max-content;
  gap: var(--opencodian-settings-space-sm);
  align-items: center;
  padding: 8px;
  border: 1px solid var(--opencodian-settings-inline-border);
  border-radius: var(--opencodian-settings-radius-inline);
  background: var(--opencodian-settings-inline-bg);
}

.opencodian-formatter-env-row input {
  min-width: 0;
}

.opencodian-formatter-json-editor {
  padding: 10px;
  border: 1px solid var(--opencodian-settings-row-border);
  border-radius: var(--opencodian-settings-radius-row);
  background: var(--opencodian-settings-row-bg);
}

.opencodian-formatter-json-textarea {
  width: 100%;
  min-height: 220px;
  resize: vertical;
  font-family: var(--font-monospace);
  font-size: 12px;
  line-height: 1.5;
}

.opencodian-formatter-json-buttons {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--opencodian-settings-space-sm);
  background: transparent;
}
```

- [ ] **Step 5: Add narrow-width rules**

Inside the existing `@media (max-width: 900px)` block:

```css
.opencodian-formatter-env-row {
  grid-template-columns: 1fr;
}

.opencodian-formatter-json-buttons {
  justify-content: flex-start;
}
```

## Task 3: Focused Verification And Docs

**Files:**
- Modify: `docs/modules/style/modals/config-editor-modal.md`

- [ ] **Step 1: Run focused formatter tests**

Run:

```bash
npm test -- --runInBand tests/unit/features/settings/SettingsFormatterSection.test.ts tests/unit/features/settings/SettingsTabbedRenderer.test.ts
```

Expected: PASS.

- [ ] **Step 2: Build CSS**

Run:

```bash
npm run build:css
```

Expected: generated root `styles.css` updates without errors.

- [ ] **Step 3: Update module docs**

Append to `docs/modules/style/modals/config-editor-modal.md`:

```md
## 2026-05-12 Formatter density slice

Formatter settings now use shared settings hierarchy tokens:

- summary cards, runtime list, builtin rows, and custom rows use object tokens;
- runtime table, override fields, custom fields, and JSON editor use row tokens;
- environment key/value rows use inline tokens;
- enabled/disabled formatter badges keep semantic status color.

Guardrail: do not introduce local formatter-only card hierarchy, gradients, decorative blur, hover lift, side-stripe borders, or undefined settings radius tokens.
```

## Task 4: Full Verification And Deploy

**Files:**
- Generated if needed: `graphify-out/*`, `styles.css`

- [ ] **Step 1: Refresh graphify for `src/` changes**

Run:

```bash
npm run graphify:update:src
```

Expected: graphify completes.

- [ ] **Step 2: Stage planned files before full verify**

Run:

```bash
git add docs/superpowers/plans/2026-05-12-settings-formatter-density-unification.md tests/unit/features/settings/SettingsFormatterSection.test.ts src/style/modals/config-editor-modal.css docs/modules/style/modals/config-editor-modal.md styles.css graphify-out
```

Expected: only planned files are staged.

- [ ] **Step 3: Run full verification**

Run:

```bash
npm run verify
```

Expected: owner guard, module docs, graphify freshness, devlog order, lint, typecheck, tests, and build all pass.

- [ ] **Step 4: Deploy generated runtime artifacts to Test Vault sequentially**

Run each copy as a separate command:

```bash
cp dist/main.js /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js
cp dist/manifest.json /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/manifest.json
cp dist/styles.css /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/styles.css
```

- [ ] **Step 5: Verify deployed BUILD_ID**

Run:

```bash
BUILD_ID=$(rg -o 'codex-settings-ui-layout-foundation\.[0-9]+' dist/main.js | tail -1)
rg -n "$BUILD_ID" dist/main.js /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js
```

Expected: Test Vault `main.js` contains the same newest build id as `dist/main.js`.

## Task 5: Obsidian Autodebug Visual Check

**Files:**
- Create runtime-only artifacts under `.obsidian-debug/settings-formatter-density/`
- Create: `docs/status/settings-formatter-density-visual-qa-2026-05-12.md`

- [ ] **Step 1: Attach debug surface and reload plugin**

Run:

```bash
obsidian dev:debug on vault=testvault
obsidian dev:console clear vault=testvault
obsidian dev:errors clear vault=testvault
obsidian plugin:reload id=opencodian vault=testvault
```

Expected: reload succeeds.

- [ ] **Step 2: Open OpenCodian settings to tabbed Formatter overview**

Use `.obsidian-debug/settings-formatter-density/open-tabbed-formatter-overview.js` with `obsidian_eval_file.mjs`.

Expected DOM/CSS facts:

```json
{
  "ok": true,
  "mode": "tabbed",
  "primary": "formatter",
  "secondary": "overview",
  "formatter": true,
  "summaryCards": ">=1",
  "tabPanel": false,
  "summaryCard": {
    "boxShadow": "none",
    "borderLeftWidth": "1px",
    "borderRadius": "10px"
  }
}
```

- [ ] **Step 3: Capture tabbed overview screenshot**

Run:

```bash
obsidian dev:screenshot path=/Users/dht/.codex/worktrees/settings-ui-layout-foundation/opencodian/.obsidian-debug/settings-formatter-density/tabbed-formatter-overview.png vault=testvault
```

- [ ] **Step 4: Open tabbed Formatter config and capture CSS facts**

Use `.obsidian-debug/settings-formatter-density/open-tabbed-formatter-config.js` with `obsidian_eval_file.mjs`.

Expected DOM/CSS facts:

```json
{
  "ok": true,
  "mode": "tabbed",
  "primary": "formatter",
  "secondary": "config",
  "formatter": true,
  "jsonEditor": true,
  "tabPanel": false
}
```

Capture:

```bash
obsidian dev:screenshot path=/Users/dht/.codex/worktrees/settings-ui-layout-foundation/opencodian/.obsidian-debug/settings-formatter-density/tabbed-formatter-config.png vault=testvault
```

- [ ] **Step 5: Check classic mode parity**

Use `.obsidian-debug/settings-formatter-density/open-classic-formatter.js` with `obsidian_eval_file.mjs`.

Expected DOM facts:

```json
{
  "ok": true,
  "mode": "classic",
  "formatter": true,
  "summaryCards": ">=1",
  "tabPanel": false
}
```

Capture:

```bash
obsidian dev:screenshot path=/Users/dht/.codex/worktrees/settings-ui-layout-foundation/opencodian/.obsidian-debug/settings-formatter-density/classic-formatter.png vault=testvault
```

- [ ] **Step 6: Restore Test Vault preference to tabbed Formatter overview and inspect logs**

Run:

```bash
obsidian dev:errors vault=testvault
obsidian dev:console vault=testvault level=error limit=80
```

Expected: no captured errors.

- [ ] **Step 7: Write QA report**

`docs/status/settings-formatter-density-visual-qa-2026-05-12.md` must include:

- branch and worktree path;
- deployed build id;
- focused tests and full `npm run verify` result;
- deploy path;
- tabbed overview/config and classic DOM/CSS facts;
- screenshot paths;
- console/error result;
- note that `.obsidian-debug/` artifacts are runtime evidence and are not committed.

## Task 6: Final Commit

**Files:**
- Stage only planned files and generated artifacts required by repo checks.

- [ ] **Step 1: Review diff**

Run:

```bash
git diff --cached --stat
git diff --cached -- tests/unit/features/settings/SettingsFormatterSection.test.ts src/style/modals/config-editor-modal.css docs/modules/style/modals/config-editor-modal.md docs/status/settings-formatter-density-visual-qa-2026-05-12.md
```

- [ ] **Step 2: Commit**

Run:

```bash
git commit -m "style: unify formatter settings density"
```

Expected: commit created on `codex/settings-ui-layout-foundation`.

## Self-Review

- Spec coverage: covers fourth-round UI-only implementation, both layout modes, formatter overview/config surfaces, focused tests, docs, build, deploy, and Obsidian autodebug.
- Placeholder scan: no `TBD`, `TODO`, or unspecified test command remains.
- Type consistency: no new runtime API is introduced; CSS test helper follows the existing settings CSS contract pattern.
