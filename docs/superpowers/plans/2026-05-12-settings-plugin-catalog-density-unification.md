# Settings Plugin Catalog Density Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Agents, Commands, and Plugin catalog/settings rows follow the shared settings hierarchy contract in both classic and tabbed settings modes.

**Architecture:** This is Slice 5 of the settings UI refactor. `SettingsAgentsSection.ts`, `SettingsCommandsSection.ts`, and `SettingsPluginSection.ts` already share `.opencodian-plugin-block`, `.opencodian-plugin-block-body`, `.opencodian-settings-catalog-scroll`, and plugin summary/source hooks, so the slice stays CSS-first and avoids behavior changes. A focused CSS contract test pins this shared family to the existing `--opencodian-settings-*` object/row/inline tokens and bans local heavy cards, gradients, decorative blur, hover lift, side-stripe borders, and undefined radius tokens.

**Tech Stack:** Obsidian plugin, TypeScript, Jest, vanilla CSS compiled through `npm run build:css`, Test Vault deployment, Obsidian CLI/autodebug evidence capture.

---

## Design Constraints

- Product register: Obsidian-native workbench, dense but not crowded, calm/capable/transparent.
- Both classic/tiled and tabbed modes remain first-class. A section must not become a card only because it is rendered in classic mode.
- Agents/Commands/Plugins behavior is unchanged: default agent selection, expert mode, catalog visibility toggles, markdown agent workspace, project command editor, plugin isolation, project directory and OMO controls must keep the same semantics.
- Shared plugin/catalog surfaces should read as section + row hierarchy:
  - `.opencodian-plugin-block` is an unframed section shell.
  - catalog `Setting` rows and plugin summary rows use row tokens.
  - agent editor groups and plugin source items use object tokens only where a contained editable/object-like surface is useful.
  - exact paths use inline tokens.
- No schema, default, migration, locale, OpenCode runtime, command, agent, or plugin-management logic changes.
- No gradients, decorative blur/glass, heavy shadow, hover `translateY`, side-stripe borders, or undefined settings radius tokens.

## File Structure

- Modify: `tests/unit/features/settings/SettingsPluginSection.test.ts`
  - Add a shared CSS contract test for plugin/catalog density.
- Modify: `src/style/modals/config-editor-modal.css`
  - Retune `.opencodian-plugin-block*`, `.opencodian-settings-catalog-scroll`, `.opencodian-agent-editor-*`, `.opencodian-plugin-summary-*`, and `.opencodian-plugin-source-*` to shared settings tokens.
- Modify: `docs/modules/style/modals/config-editor-modal.md`
  - Document the Agents/Commands/Plugin catalog density guardrail.
- Create after validation: `docs/status/settings-plugin-catalog-density-visual-qa-2026-05-12.md`
  - Record build/deploy/autodebug evidence and screenshot paths.
- Generated/possibly modified: `styles.css`, `graphify-out/*`
  - Refresh with repo scripts if build/graphify reports changes.

## Task 1: Write The Shared Plugin/Catalog CSS Contract Test

**Files:**
- Modify: `tests/unit/features/settings/SettingsPluginSection.test.ts`

- [ ] **Step 1: Append a CSS contract test**

Append this block after the existing tests:

```ts
describe('Settings plugin/catalog CSS contract', () => {
  it('keeps agents, commands, and plugin rows aligned with the shared settings hierarchy contract', () => {
    const css = fs.readFileSync(
      path.join(process.cwd(), 'src/style/modals/config-editor-modal.css'),
      'utf8',
    );

    const findRule = (selector: string, required: string): string => (
      Array.from(css.matchAll(new RegExp(`${selector}\\s*\\{[^}]*\\}`, 'g')))
        .map((match) => match[0])
        .find((rule) => rule.includes(required)) ?? ''
    );

    const blockRule = findRule('\\.opencodian-plugin-block', 'background:');
    const bodyRule = findRule('\\.opencodian-plugin-block-body', 'padding:');
    const catalogRowRule = findRule(
      '\\.opencodian-settings-catalog-scroll > \\.setting-item',
      'background:',
    );
    const agentGroupRule = findRule('\\.opencodian-agent-editor-group', 'background:');
    const summaryRule = findRule('\\.opencodian-plugin-summary-row', 'background:');
    const sourcePathRule = findRule('\\.opencodian-plugin-source-path', 'background:');
    const sourceItemRule = findRule(
      '\\.opencodian-plugin-source-item,\\s*\\.opencodian-plugin-source-empty',
      'background:',
    );
    const pluginCatalogCss = css.slice(
      css.indexOf('.opencodian-plugin-block'),
      css.indexOf('.opencodian-mcp-overview-shell'),
    );

    expect(blockRule).toContain('background: transparent');
    expect(blockRule).toContain('border: 0');
    expect(blockRule).toContain('box-shadow: none');
    expect(bodyRule).toContain('var(--opencodian-settings-space-md');
    expect(catalogRowRule).toContain('var(--opencodian-settings-row-bg');
    expect(catalogRowRule).toContain('box-shadow: none');
    expect(agentGroupRule).toContain('var(--opencodian-settings-object-bg');
    expect(agentGroupRule).toContain('box-shadow: none');
    expect(summaryRule).toContain('var(--opencodian-settings-row-bg');
    expect(sourcePathRule).toContain('var(--opencodian-settings-inline-bg');
    expect(sourceItemRule).toContain('var(--opencodian-settings-object-bg');
    expect(pluginCatalogCss).not.toContain('linear-gradient');
    expect(pluginCatalogCss).not.toContain('backdrop-filter');
    expect(pluginCatalogCss).not.toContain('transform: translateY');
    expect(pluginCatalogCss).not.toMatch(/border-left:\s*[2-9]px/);
    expect(pluginCatalogCss).not.toMatch(/opencodian-settings-radius-(md|lg)/);
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails before CSS edits**

Run:

```bash
npm test -- --runInBand tests/unit/features/settings/SettingsPluginSection.test.ts
```

Expected: FAIL because the shared plugin/catalog CSS still uses the old card shell and non-token row styles.

## Task 2: Retune Shared Plugin/Catalog CSS

**Files:**
- Modify: `src/style/modals/config-editor-modal.css`

- [ ] **Step 1: Replace the shared plugin block shell**

Replace `.opencodian-plugin-block`, heading, desc, body, and catalog scroll rules with:

```css
.opencodian-plugin-block {
  margin: var(--opencodian-settings-space-xl) 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  overflow: visible;
}

.opencodian-plugin-block > .opencodian-settings-subsection-heading {
  margin: 0;
  padding: 0;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: none;
  color: var(--text-normal);
}

.opencodian-plugin-block-desc {
  max-width: 68ch;
  padding: 4px 0 0;
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-muted);
}

.opencodian-plugin-block-body {
  display: flex;
  flex-direction: column;
  gap: var(--opencodian-settings-space-md);
  padding: var(--opencodian-settings-space-md) 0 0;
}

.opencodian-settings-catalog-scroll,
.opencodian-agent-catalog-scroll {
  max-height: min(460px, 52vh);
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 2px;
}
```

- [ ] **Step 2: Add catalog row rules**

Add immediately after the scroll rules:

```css
.opencodian-settings-catalog-scroll > .setting-item {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--opencodian-settings-row-border);
  border-radius: var(--opencodian-settings-radius-row);
  background: var(--opencodian-settings-row-bg);
  box-shadow: none;
}

.opencodian-settings-catalog-scroll > .setting-item + .setting-item {
  margin-top: var(--opencodian-settings-space-sm);
}

.opencodian-settings-catalog-scroll > .setting-item .setting-item-info {
  min-width: 0;
}
```

- [ ] **Step 3: Retune agent editor groups**

Replace the `.opencodian-agent-editor-group*` block with token-based rules:

```css
.opencodian-agent-editor-layout {
  display: flex;
  flex-direction: column;
  gap: var(--opencodian-settings-space-md);
}

.opencodian-agent-editor-group {
  border: 1px solid var(--opencodian-settings-object-border);
  border-radius: var(--opencodian-settings-radius-row);
  background: var(--opencodian-settings-object-bg);
  box-shadow: none;
  overflow: hidden;
}

.opencodian-agent-editor-group-header,
.opencodian-agent-editor-group-summary {
  padding: 12px;
  background: transparent;
}

.opencodian-agent-editor-group-summary {
  display: flex;
  align-items: center;
  gap: var(--opencodian-settings-space-md);
  cursor: pointer;
  list-style: none;
}

.opencodian-agent-editor-group-summary::-webkit-details-marker {
  display: none;
}

.opencodian-agent-editor-group-summary::after {
  content: "▾";
  margin-left: auto;
  color: var(--text-faint);
  font-size: 13px;
  line-height: 1;
  transition: transform 0.16s ease, color 0.16s ease;
}

.opencodian-agent-editor-group-collapsible[open] > .opencodian-agent-editor-group-summary::after {
  transform: rotate(180deg);
  color: var(--text-muted);
}

.opencodian-agent-editor-group-summary-copy {
  min-width: 0;
}

.opencodian-agent-editor-group-title {
  color: var(--text-normal);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.35;
}

.opencodian-agent-editor-group-description {
  margin-top: 4px;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.5;
}

.opencodian-agent-editor-group-body {
  display: flex;
  flex-direction: column;
  gap: var(--opencodian-settings-space-sm);
  padding: 0 12px 12px;
}

.opencodian-agent-editor-group-body > .setting-item {
  margin: 0;
  padding: 8px 0;
  border-top: 1px solid var(--opencodian-settings-row-border);
  background: transparent;
  box-shadow: none;
}

.opencodian-agent-editor-group-body > .setting-item:first-child {
  border-top: none;
}
```

- [ ] **Step 4: Retune plugin summary/source rows**

Replace `.opencodian-plugin-summary-*` and `.opencodian-plugin-source-*` rules with:

```css
.opencodian-plugin-summary-list,
.opencodian-plugin-source-list {
  display: flex;
  flex-direction: column;
  gap: var(--opencodian-settings-space-sm);
}

.opencodian-plugin-summary-row {
  display: grid;
  grid-template-columns: minmax(130px, 170px) minmax(0, 1fr);
  gap: var(--opencodian-settings-space-md);
  align-items: start;
  padding: 10px 12px;
  border: 1px solid var(--opencodian-settings-row-border);
  border-radius: var(--opencodian-settings-radius-row);
  background: var(--opencodian-settings-row-bg);
  box-shadow: none;
}

.opencodian-plugin-summary-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
}

.opencodian-plugin-summary-value {
  min-width: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-normal);
  word-break: break-word;
}

.opencodian-plugin-source-group {
  padding: 12px 0;
  border-top: 1px solid var(--opencodian-settings-row-border);
}

.opencodian-plugin-source-group:first-child {
  padding-top: 0;
  border-top: none;
}

.opencodian-plugin-source-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-normal);
}

.opencodian-plugin-source-path {
  margin-top: var(--opencodian-settings-space-sm);
  padding: 8px 10px;
  border: 1px solid var(--opencodian-settings-inline-border);
  border-radius: var(--opencodian-settings-radius-inline);
  background: var(--opencodian-settings-inline-bg);
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-muted);
  word-break: break-word;
}

.opencodian-plugin-source-list {
  margin-top: var(--opencodian-settings-space-md);
}

.opencodian-plugin-source-item,
.opencodian-plugin-source-empty {
  padding: 10px 12px;
  border: 1px solid var(--opencodian-settings-object-border);
  border-radius: var(--opencodian-settings-radius-row);
  background: var(--opencodian-settings-object-bg);
  box-shadow: none;
  font-size: 12px;
  line-height: 1.6;
  word-break: break-word;
}

.opencodian-plugin-source-empty {
  color: var(--text-faint);
}
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm test -- --runInBand tests/unit/features/settings/SettingsPluginSection.test.ts tests/unit/features/settings/SettingsAgentsSection.test.ts tests/unit/features/settings/SettingsCommandsSection.test.ts tests/unit/features/settings/SettingsTabbedRenderer.test.ts
```

Expected: PASS.

## Task 3: Refresh Generated CSS And Docs

**Files:**
- Modify: `docs/modules/style/modals/config-editor-modal.md`
- Generated: `styles.css`

- [ ] **Step 1: Add module-doc guardrail**

Append this section to `docs/modules/style/modals/config-editor-modal.md`:

```md
## 2026-05-12 Agents / Commands / Plugin catalog density slice

Agents, Commands, and Plugin settings now share the same plugin/catalog density contract:

- `.opencodian-plugin-block` is an unframed section shell, not a nested card.
- catalog `Setting` rows and plugin summary rows use row tokens.
- agent editor groups and plugin source items use object tokens.
- plugin source paths use inline tokens.

Guardrail: 不要在 `.opencodian-plugin-block*`、`.opencodian-settings-catalog-scroll`、`.opencodian-agent-editor-*` 或 `.opencodian-plugin-source-*` 重新引入大卡片套小卡片、渐变、decorative blur、hover lift、side-stripe border 或未定义的 settings radius token。
```

- [ ] **Step 2: Build merged CSS**

Run:

```bash
npm run build:css
```

Expected: PASS and root `styles.css` updated if needed.

- [ ] **Step 3: Refresh graphify**

Run:

```bash
npm run graphify:update:src
```

Expected: PASS. Commit generated graph files only if the script changes them.

## Task 4: Full Verification, Deployment, And Autodebug

**Files:**
- Create: `docs/status/settings-plugin-catalog-density-visual-qa-2026-05-12.md`

- [ ] **Step 1: Run full verify**

Run:

```bash
npm run verify
```

Expected: PASS for owner guard, module docs, graphify, devlog order, lint, typecheck, tests, and production build.

- [ ] **Step 2: Deploy to Test Vault sequentially**

Run these commands separately:

```bash
cp dist/main.js /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js
cp dist/manifest.json /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/manifest.json
cp dist/styles.css /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/styles.css
```

- [ ] **Step 3: Verify deployed BUILD_ID**

Read the build id from `dist/main.js`, then verify the same id appears in the Test Vault `main.js`:

```bash
rg -n "<BUILD_ID_FROM_DIST>" dist/main.js /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js
```

Expected: both files contain the same build id.

- [ ] **Step 4: Run Obsidian autodebug DOM/CSS checks**

Use the Obsidian CLI/autodebug eval-file flow to:

1. enable debug for `testvault`;
2. clear console/errors;
3. reload plugin `opencodian`;
4. open settings in tabbed Agents catalog, tabbed Commands catalog, tabbed Plugins overview/global source views, and classic mode for at least one catalog surface;
5. assert `.opencodian-plugin-block` has transparent background/no shadow/no heavy border;
6. assert catalog rows have `box-shadow: none`, `border-left-width: 1px`, and the shared radius;
7. capture screenshots under `.obsidian-debug/settings-plugin-catalog-density/`;
8. verify `obsidian dev:errors vault=testvault` and `obsidian dev:console vault=testvault level=error limit=80` are empty.

- [ ] **Step 5: Write QA report**

Create `docs/status/settings-plugin-catalog-density-visual-qa-2026-05-12.md` with:

- branch/worktree/build id;
- files changed;
- focused/full verification results;
- deployment path and BUILD_ID proof;
- autodebug DOM/CSS JSON snippets;
- screenshot paths;
- console/error capture result;
- remaining design debt.

## Task 5: Final Review And Commit

- [ ] **Step 1: Inspect diff**

Run:

```bash
git diff --stat
git diff --check
git diff -- tests/unit/features/settings/SettingsPluginSection.test.ts src/style/modals/config-editor-modal.css docs/modules/style/modals/config-editor-modal.md docs/status/settings-plugin-catalog-density-visual-qa-2026-05-12.md | sed -n '1,260p'
```

Expected: no whitespace errors; diff limited to the planned slice.

- [ ] **Step 2: Commit**

Run:

```bash
git add tests/unit/features/settings/SettingsPluginSection.test.ts src/style/modals/config-editor-modal.css styles.css docs/modules/style/modals/config-editor-modal.md docs/status/settings-plugin-catalog-density-visual-qa-2026-05-12.md docs/superpowers/plans/2026-05-12-settings-plugin-catalog-density-unification.md
git commit -m "style: unify plugin catalog settings density"
```

- [ ] **Step 3: Confirm clean state**

Run:

```bash
git status --short --branch
git log -1 --oneline
```

Expected: branch clean, latest commit is `style: unify plugin catalog settings density`.

## Self-Review

- Spec coverage: The plan covers fifth-round scope for Agents, Commands, and Plugin catalog/settings rows, both classic and tabbed rendering, CSS contract, docs, build/deploy/autodebug, and final commit.
- Placeholder scan: No TBD/TODO/implement-later placeholders are present. Commands and expected outputs are concrete.
- Type consistency: The test uses existing `fs` and `path` imports in `SettingsPluginSection.test.ts`; CSS selectors match existing settings hooks; no TypeScript runtime APIs are introduced.
