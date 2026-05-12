# Settings Layout Visible Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the settings layout refactor visibly meaningful while preserving all current settings behavior: classic and tabbed modes should share one polished hierarchy, ordinary settings should keep a light card feel without dense card nesting, and Obsidian visual QA should prove the result.

**Architecture:** Build on the existing settings layout foundation branch instead of starting over. Keep the current DOM contract markers, strengthen the settings-local design token layer, make navigation surfaces lighter and equivalent across classic/tabbed, scope ordinary setting rows to one shared surface treatment, and leave high-complexity object-card migrations for later owner-specific slices. Use Obsidian CLI/autodebug checks as the final acceptance gate, not screenshots alone.

**Tech Stack:** TypeScript, Obsidian `Setting`, Jest/jsdom, CSS custom properties, existing vanilla CSS pipeline, Obsidian CLI developer commands, Test Vault deployment.

---

## Skill Synthesis

- `ckm:brand`: Keep OpenCodian calm, capable, transparent, and Obsidian-native. No marketing gloss, no novelty visuals, no confusing brand split between modes.
- `ckm:design-system`: Use a three-layer token mindset. Existing Obsidian variables are primitives, settings semantic tokens describe surface weights, and component tokens map to navigation, section, row, object, inline, status, and preview surfaces.
- `ckm:ui-styling` and `ui-ux-pro-max`: Preserve accessibility first: visible focus, keyboard tab order, readable contrast in light/dark, stable interactions, no layout-shifting hover states, semantic state text beyond color.
- `impeccable`: Product-register interface. Cards are allowed only when they communicate hierarchy; nested full cards are wrong. The scene is a repeated expert workbench inside Obsidian, so density is welcome but crowding is not.
- `minimalist-ui`: Use quiet, flat, utilitarian surfaces: low shadow, clear borders, restrained accents, no gradients as decoration, no heavy glass.
- `redesign-existing-projects`: Work with the existing stack and improve targeted weak points: current quick nav and tab pills are visually heavier than the new contract; old tab-panel CSS remains as confusing dead/legacy styling; style settings have a side-stripe card anti-pattern that must not leak into the shared contract.
- `obsidian-plugin-autodebug`: After build/deploy, open the real Test Vault settings UI, reload the plugin, capture DOM/screenshot/error evidence, and compare the result to this plan.

## Scope Boundaries

In scope:

- One visible UI slice after the already-committed foundation work.
- CSS-only or marker-only changes that do not alter settings data, defaults, migrations, save behavior, model/provider/MCP behavior, or OpenCode config writes.
- Classic quick-nav, tabbed primary/secondary tabs, shared section blocks, ordinary `Setting` rows, and visual QA.
- Documentation for the new visible slice.

Out of scope:

- Full MCP/model/formatter/agents/commands/plugins/style object-card migration.
- New framework, shadcn/Tailwind installation, new icon library, or new runtime UI dependency.
- Chat/composer/model selector redesign.
- Setting schema or i18n copy changes unless a test or accessibility label requires a tiny structural label.

## File Structure

- Modify `src/style/components/settings-layout-contract.css`: owns this slice's token-backed visible hierarchy. Add only settings-scoped selectors.
- Modify `src/style/components/model-selector.css`: remove or neutralize legacy settings-only rules that contradict the shared contract, especially heavy `.opencodian-settings-tab-panel`, quick-nav, tabs, and style-section side-stripe rules.
- Modify `tests/unit/features/settings/OpenCodianSettings.test.ts`: add CSS contract regression checks and DOM root checks for real modal settings state.
- Modify `tests/unit/features/settings/SettingsTabbedRenderer.test.ts`: keep the no-tab-panel tests and add navigation/content-shell marker assertions if missing.
- Modify `tests/unit/features/settings/OpenCodianSettingsView.test.ts`: confirm editor-area settings mirrors the visible contract.
- Modify `docs/modules/style/components/settings-layout-contract.md`: document the visible hierarchy slice and forbidden nested-card treatment.
- Modify `docs/status/settings-layout-foundation-visual-qa-2026-05-12.md` or create a new status note after Obsidian QA: record build id, screenshots, DOM findings, and remaining object-card work.

## Design Contract For This Slice

The visible outcome should read like this:

- **Navigation shell:** Classic quick-nav and tabbed primary/secondary tabs are navigation, not content cards. They can have borders and active states, but no heavy shadow, no large rounded floating card, no oversized padding.
- **Section block:** One visible section surface per settings group. It is the strongest card-like container in this slice.
- **Ordinary row:** Normal `Setting` rows are light cards inside a section. They may have a subtle border/background, but must not compete with object cards or section blocks.
- **Object surfaces:** Existing object-heavy sections can keep their local styling in this slice, but any touched styles must map down to `--opencodian-settings-object-*` or remain untouched.
- **Style settings exception:** Do not force all preview cards to row cards. Only remove broad contradictions such as heavy side stripes when they are part of shared settings hierarchy.

## Task 1: Add Contract Tests Before Visual CSS Changes

**Files:**
- Modify: `tests/unit/features/settings/OpenCodianSettings.test.ts`
- Modify: `tests/unit/features/settings/SettingsTabbedRenderer.test.ts`
- Modify: `tests/unit/features/settings/OpenCodianSettingsView.test.ts`

- [ ] **Step 1: Add a CSS contract test for the visible slice**

In `tests/unit/features/settings/OpenCodianSettings.test.ts`, extend the existing CSS-related describe block or add this test near the current settings CSS assertions:

```ts
it('keeps the visible settings hierarchy token-scoped and avoids heavy legacy tab panels', () => {
  const css = readFileSync(
    join(process.cwd(), 'src/style/components/settings-layout-contract.css'),
    'utf8',
  );
  const legacyCss = readFileSync(
    join(process.cwd(), 'src/style/components/model-selector.css'),
    'utf8',
  );

  expect(css).toContain('--opencodian-settings-nav-bg');
  expect(css).toContain('--opencodian-settings-section-bg');
  expect(css).toContain('--opencodian-settings-row-bg');
  expect(css).toContain('--opencodian-settings-object-bg');
  expect(css).toMatch(/\\.opencodian-settings\\s+\\.opencodian-settings-quick-nav/);
  expect(css).toMatch(/\\.opencodian-settings\\s+\\.opencodian-settings-tab-primary/);
  expect(css).toMatch(/\\.opencodian-settings\\s+\\.opencodian-settings-section\\s+\\.setting-item/);

  expect(legacyCss).not.toMatch(/\\.opencodian-settings-tab-panel\\s*\\{[\\s\\S]*box-shadow:/);
  expect(legacyCss).not.toMatch(/\\.opencodian-style-section\\s*\\{[\\s\\S]*border-left:\\s*[2-9]px/);
});
```

Expected first run: fail because the new nav tokens/selector contract are not complete yet and legacy CSS still contains heavy tab-panel or side-stripe rules.

- [ ] **Step 2: Add a DOM root disambiguation test**

In `tests/unit/features/settings/OpenCodianSettings.test.ts`, add a regression test that checks the official settings tab root, not any stale editor-area root:

```ts
it('marks the active settings tab root with the current layout mode contract', async () => {
  const { tab, plugin } = createSettingsTab({ settingsLayoutMode: 'tabbed' });

  await tab.display();

  expect(plugin.settings.settingsLayoutMode).toBe('tabbed');
  expect(tab.containerEl.classList.contains('opencodian-settings--tabbed')).toBe(true);
  expect(tab.containerEl.dataset.settingsSurface).toBe('page');
  expect(tab.containerEl.dataset.settingsLayoutMode).toBe('tabbed');
  expect(tab.containerEl.querySelector('.opencodian-settings-content-shell')).not.toBeNull();
  expect(tab.containerEl.querySelector('.opencodian-settings-tab-panel')).toBeNull();
});
```

If the local test helper uses a different factory name, keep the assertions exactly but adapt only the helper call to the existing test file pattern.

- [ ] **Step 3: Add or keep tabbed renderer no-panel assertions**

In `tests/unit/features/settings/SettingsTabbedRenderer.test.ts`, ensure this assertion exists for at least style, plugin, model, and formatter tabs:

```ts
expect(containerEl.querySelector('.opencodian-settings-content-shell')).not.toBeNull();
expect(containerEl.querySelector('.opencodian-settings-tab-panel')).toBeNull();
```

Expected: these may already pass from the foundation work. If already present, do not duplicate them.

- [ ] **Step 4: Add editor-area contract assertion**

In `tests/unit/features/settings/OpenCodianSettingsView.test.ts`, ensure the editor-area view checks the same contract:

```ts
expect(view.contentEl.dataset.settingsSurface).toBe('page');
expect(view.contentEl.dataset.settingsLayoutMode).toBe('tabbed');
expect(view.contentEl.querySelector('.opencodian-settings-content-shell')).not.toBeNull();
expect(view.contentEl.querySelector('.opencodian-settings-tab-panel')).toBeNull();
```

- [ ] **Step 5: Run focused tests and confirm expected failures**

Run:

```bash
npm test -- --runInBand tests/unit/features/settings/OpenCodianSettings.test.ts tests/unit/features/settings/SettingsTabbedRenderer.test.ts tests/unit/features/settings/OpenCodianSettingsView.test.ts
```

Expected before implementation: at least the new CSS contract test fails.

## Task 2: Make Navigation Shells Visibly Equivalent

**Files:**
- Modify: `src/style/components/settings-layout-contract.css`
- Modify: `src/style/components/model-selector.css`
- Test: focused settings tests from Task 1

- [ ] **Step 1: Add navigation tokens**

In `src/style/components/settings-layout-contract.css`, extend the `.opencodian-settings` token block with navigation and state tokens:

```css
  --opencodian-settings-nav-bg:
    color-mix(in srgb, var(--background-secondary) 54%, transparent);
  --opencodian-settings-nav-border:
    color-mix(in srgb, var(--background-modifier-border) 72%, transparent);
  --opencodian-settings-nav-active-bg:
    color-mix(in srgb, var(--interactive-accent) 10%, var(--background-primary));
  --opencodian-settings-nav-active-border:
    color-mix(in srgb, var(--interactive-accent) 38%, var(--background-modifier-border-hover));
  --opencodian-settings-focus-ring:
    color-mix(in srgb, var(--interactive-accent) 60%, transparent);
```

- [ ] **Step 2: Add scoped quick-nav overrides**

Append this block after the content-shell rules:

```css
.opencodian-settings .opencodian-settings-quick-nav {
  gap: var(--opencodian-settings-space-sm);
  margin: 0 0 var(--opencodian-settings-space-lg);
  padding: 10px 12px;
  border: 1px solid var(--opencodian-settings-nav-border);
  border-radius: var(--opencodian-settings-radius-section);
  background: var(--opencodian-settings-nav-bg);
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.opencodian-settings .opencodian-settings-quick-nav-label {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.opencodian-settings .opencodian-settings-quick-nav-chips {
  gap: var(--opencodian-settings-space-sm);
}

.opencodian-settings .opencodian-settings-quick-nav-btn {
  min-height: 28px;
  padding: 5px 9px;
  border-color: var(--opencodian-settings-inline-border);
  border-radius: var(--opencodian-settings-radius-inline);
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.opencodian-settings .opencodian-settings-quick-nav-btn:hover {
  background: var(--opencodian-settings-inline-bg);
  border-color: var(--opencodian-settings-nav-active-border);
  box-shadow: none;
  transform: none;
}

.opencodian-settings .opencodian-settings-quick-nav-btn:focus-visible {
  outline: 2px solid var(--opencodian-settings-focus-ring);
  outline-offset: 2px;
}
```

- [ ] **Step 3: Add scoped tab navigation overrides**

Append this block after the quick-nav block:

```css
.opencodian-settings .opencodian-settings-tabs-primary,
.opencodian-settings .opencodian-settings-tabs-secondary {
  gap: var(--opencodian-settings-space-sm);
  margin: 0 0 var(--opencodian-settings-space-lg);
}

.opencodian-settings .opencodian-settings-tab-primary,
.opencodian-settings .opencodian-settings-tab-secondary {
  min-height: 30px;
  padding: 6px 10px;
  border-color: var(--opencodian-settings-inline-border);
  border-radius: var(--opencodian-settings-radius-inline);
  background: transparent;
  box-shadow: none;
  transform: none;
}

.opencodian-settings .opencodian-settings-tab-primary:hover,
.opencodian-settings .opencodian-settings-tab-secondary:hover {
  background: var(--opencodian-settings-inline-bg);
  transform: none;
}

.opencodian-settings .opencodian-settings-tab-primary.opencodian-settings-tab-active,
.opencodian-settings .opencodian-settings-tab-secondary.opencodian-settings-tab-active {
  border-color: var(--opencodian-settings-nav-active-border);
  background: var(--opencodian-settings-nav-active-bg);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--interactive-accent) 10%, transparent);
}

.opencodian-settings .opencodian-settings-tab-primary:focus-visible,
.opencodian-settings .opencodian-settings-tab-secondary:focus-visible {
  outline: 2px solid var(--opencodian-settings-focus-ring);
  outline-offset: 2px;
}
```

- [ ] **Step 4: Neutralize legacy heavy tab-panel CSS**

In `src/style/components/model-selector.css`, replace the `.opencodian-settings-tab-panel` block with a compatibility stub:

```css
.opencodian-settings-tab-panel {
  display: contents;
}
```

Do not remove the selector in this slice; leaving a harmless compatibility selector makes rollback and stale build debugging easier.

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm test -- --runInBand tests/unit/features/settings/OpenCodianSettings.test.ts tests/unit/features/settings/SettingsTabbedRenderer.test.ts tests/unit/features/settings/OpenCodianSettingsView.test.ts
```

Expected: Task 1 CSS and DOM tests pass.

## Task 3: Refine Section Blocks And Ordinary Setting Rows

**Files:**
- Modify: `src/style/components/settings-layout-contract.css`
- Test: focused settings tests from Task 1

- [ ] **Step 1: Add page rhythm without changing behavior**

In `src/style/components/settings-layout-contract.css`, add:

```css
.opencodian-settings[data-settings-surface='page'] {
  display: flex;
  flex-direction: column;
  gap: var(--opencodian-settings-space-lg);
}

.opencodian-settings.opencodian-settings--tabbed[data-settings-surface='page'] {
  gap: var(--opencodian-settings-space-xl);
}
```

- [ ] **Step 2: Strengthen section block hierarchy**

Update the section selector in `settings-layout-contract.css` so it includes `overflow: hidden` and no shadow:

```css
.opencodian-settings .opencodian-settings-section,
.opencodian-settings .opencodian-settings-block.opencodian-settings-section {
  overflow: hidden;
  border: 1px solid var(--opencodian-settings-section-border);
  border-radius: var(--opencodian-settings-radius-section);
  background: var(--opencodian-settings-section-bg);
  box-shadow: none;
}
```

- [ ] **Step 3: Keep ordinary settings light, not dense**

Keep the row-card treatment, but do not collapse rows into a dense table. Use this rule:

```css
.opencodian-settings .opencodian-settings-section .setting-item {
  margin: 0;
  padding: 12px 14px;
  border: 1px solid var(--opencodian-settings-row-border);
  border-radius: var(--opencodian-settings-radius-row);
  background: var(--opencodian-settings-row-bg);
  box-shadow: none;
}
```

Do not change this to full-width row dividers in this slice. The user explicitly allowed a card feel for ordinary settings as long as the hierarchy is unified and not too dense.

- [ ] **Step 4: Add section description and heading rules**

Add:

```css
.opencodian-settings .opencodian-settings-block-desc {
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.5;
}

.opencodian-settings .opencodian-settings-section-heading {
  color: var(--text-normal);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: none;
}
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm test -- --runInBand tests/unit/features/settings/OpenCodianSettings.test.ts tests/unit/features/settings/SettingsTabbedRenderer.test.ts tests/unit/features/settings/OpenCodianSettingsView.test.ts
```

Expected: pass.

## Task 4: Remove Shared Anti-Patterns Without Migrating Object Sections

**Files:**
- Modify: `src/style/components/model-selector.css`
- Modify: `src/style/components/settings-layout-contract.css`
- Test: `tests/unit/features/settings/OpenCodianSettings.test.ts`

- [ ] **Step 1: Remove the style-section side stripe**

In `src/style/components/model-selector.css`, edit `.opencodian-style-section` so it no longer uses a left stripe:

```css
.opencodian-style-section {
  position: relative;
  margin: 24px 0 16px;
  padding: 16px;
  border-radius: var(--opencodian-settings-radius-section, var(--radius-m, 8px));
  border: 1px solid var(--opencodian-settings-section-border, var(--background-modifier-border));
  background: var(--opencodian-settings-section-bg, var(--background-secondary));
}
```

This satisfies the `impeccable` side-stripe ban while preserving style settings structure and controls.

- [ ] **Step 2: Map preview cards to object/preview token weight**

In `settings-layout-contract.css`, add:

```css
.opencodian-settings .opencodian-theme-style-card,
.opencodian-settings .opencodian-style-input-lock-note,
.opencodian-settings .opencodian-debug-help-item {
  border-color: var(--opencodian-settings-object-border);
  background: var(--opencodian-settings-object-bg);
  box-shadow: none;
}
```

- [ ] **Step 3: Keep hover movement subtle and non-layout-shifting**

If `.opencodian-theme-style-card:hover` currently adds a large shadow or translate, reduce it to token-backed border/background only:

```css
.opencodian-settings .opencodian-theme-style-card:hover {
  border-color: var(--opencodian-settings-nav-active-border);
  background: color-mix(in srgb, var(--interactive-accent) 6%, var(--opencodian-settings-object-bg));
  box-shadow: none;
}
```

- [ ] **Step 4: Run CSS contract tests**

Run:

```bash
npm test -- --runInBand tests/unit/features/settings/OpenCodianSettings.test.ts
```

Expected: pass, including the no-side-stripe check.

## Task 5: Build, Docs, Graphify, And Verify

**Files:**
- Modify: `docs/modules/style/components/settings-layout-contract.md`
- Create: `docs/status/settings-layout-visible-unification-visual-qa-2026-05-12.md`
- Generated: `styles.css`
- Generated if source changed: `graphify-out/**`

- [ ] **Step 1: Update settings layout contract docs**

Append this section to `docs/modules/style/components/settings-layout-contract.md`:

```markdown
## Visible Unification Slice

This module now owns the visible hierarchy for the first settings layout unification slice:

- classic quick navigation and tabbed primary/secondary tabs are both navigation-shell surfaces;
- `.opencodian-settings-content-shell` is structural only;
- `.opencodian-settings-section` is the strongest shared content surface for this slice;
- ordinary `.setting-item` rows inside settings sections use a light row-card surface;
- preview/object-like descendants may map to object tokens but full object-section migration remains owner-specific follow-up work.

Do not reintroduce heavy `.opencodian-settings-tab-panel` styling or section-card side stripes. Those patterns recreate the card-in-card hierarchy that this contract removes.
```

- [ ] **Step 2: Build CSS**

Run:

```bash
npm run build:css
```

Expected: exits `0` and regenerates root `styles.css`.

- [ ] **Step 3: Run focused tests**

Run:

```bash
npm test -- --runInBand tests/unit/features/settings/OpenCodianSettings.test.ts tests/unit/features/settings/SettingsTabbedRenderer.test.ts tests/unit/features/settings/OpenCodianSettingsView.test.ts
```

Expected: pass.

- [ ] **Step 4: Refresh graphify if any `src/` file changed**

Run:

```bash
npm run graphify:update:src
```

Expected: exits `0` and keeps committed graph artifacts synchronized.

- [ ] **Step 5: Run full verification**

Run:

```bash
npm run verify
```

Expected: lint `0 errors / 0 warnings`, typecheck passes, tests pass, production build passes.

## Task 6: Deploy To Test Vault And Run Obsidian Autodebug Visual QA

**Files / Artifacts:**
- Deploy: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js`
- Deploy: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/manifest.json`
- Deploy: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/styles.css`
- Runtime artifacts: `.obsidian-debug/settings-layout-visible-unification/`
- Status doc: `docs/status/settings-layout-visible-unification-visual-qa-2026-05-12.md`

- [ ] **Step 1: Build production bundle**

Run:

```bash
npm run build
```

Expected: exits `0` and prints a new `BUILD_ID`.

- [ ] **Step 2: Copy deployed artifacts sequentially**

Run these as separate commands:

```bash
cp dist/main.js /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js
```

```bash
cp dist/manifest.json /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/manifest.json
```

```bash
cp dist/styles.css /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/styles.css
```

Expected: each command exits `0`.

- [ ] **Step 3: Verify deployed build identity**

Run:

```bash
rg -n "BUILD_ID" /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js
```

Expected: deployed `main.js` contains the newest build id from Step 1.

- [ ] **Step 4: Reload plugin**

Run:

```bash
obsidian plugin:reload id=opencodian vault=testvault
```

Expected: exits `0`.

- [ ] **Step 5: Open and inspect official settings modal, not stale editor-area roots**

Run:

```bash
obsidian eval vault=testvault code="(() => { app.setting.open(); app.setting.openTabById('opencodian'); app.setting.activeTab?.display?.(); const tab = app.setting.activeTab; const root = tab?.containerEl?.querySelector('.opencodian-settings') ?? tab?.containerEl; return { activeTab: tab?.id || tab?.name || null, className: root?.className || null, mode: root?.dataset?.settingsLayoutMode || null, quickNav: root?.querySelectorAll('.opencodian-settings-quick-nav').length || 0, primaryTabs: root?.querySelectorAll('.opencodian-settings-tab-primary').length || 0, contentShell: root?.querySelectorAll('.opencodian-settings-content-shell').length || 0, tabPanel: root?.querySelectorAll('.opencodian-settings-tab-panel').length || 0, sections: root?.querySelectorAll('.opencodian-settings-section').length || 0 }; })()"
```

Expected in tabbed mode:

Expected: returned JSON has `activeTab: "opencodian"`, `mode: "tabbed"`, `quickNav: 0`, `contentShell: 1`, `tabPanel: 0`, `primaryTabs >= 1`, and `sections >= 1`.

- [ ] **Step 6: Switch to classic and inspect equivalent hierarchy**

Run:

```bash
obsidian eval vault=testvault code="(() => { const plugin = app.plugins.plugins.opencodian; plugin.settings.settingsLayoutMode = 'classic'; return plugin.saveSettings().then(() => { app.setting.open(); app.setting.openTabById('opencodian'); app.setting.activeTab?.display?.(); const root = app.setting.activeTab.containerEl.querySelector('.opencodian-settings') ?? app.setting.activeTab.containerEl; return { mode: root.dataset.settingsLayoutMode, quickNav: root.querySelectorAll('.opencodian-settings-quick-nav').length, primaryTabs: root.querySelectorAll('.opencodian-settings-tab-primary').length, tabPanel: root.querySelectorAll('.opencodian-settings-tab-panel').length, sections: root.querySelectorAll('.opencodian-settings-section').length }; }); })()"
```

Expected:

Expected: returned JSON has `mode: "classic"`, `quickNav: 1`, `primaryTabs: 0`, `tabPanel: 0`, and `sections >= 1`.

- [ ] **Step 7: Capture screenshots**

Create the output directory:

```bash
mkdir -p .obsidian-debug/settings-layout-visible-unification
```

Capture at least:

```bash
obsidian dev:screenshot vault=testvault path=/Users/dht/.codex/worktrees/settings-ui-layout-foundation/opencodian/.obsidian-debug/settings-layout-visible-unification/classic-settings.png
```

Switch to tabbed:

```bash
obsidian eval vault=testvault code="(() => { const plugin = app.plugins.plugins.opencodian; plugin.settings.settingsLayoutMode = 'tabbed'; return plugin.saveSettings().then(() => { app.setting.open(); app.setting.openTabById('opencodian'); app.setting.activeTab?.display?.(); return true; }); })()"
```

Then capture:

```bash
obsidian dev:screenshot vault=testvault path=/Users/dht/.codex/worktrees/settings-ui-layout-foundation/opencodian/.obsidian-debug/settings-layout-visible-unification/tabbed-settings.png
```

- [ ] **Step 8: Capture console/errors**

Run:

```bash
obsidian dev:errors vault=testvault
```

Expected: no OpenCodian errors related to settings rendering.

Run:

```bash
obsidian dev:console vault=testvault level=error limit=80
```

Expected: no OpenCodian settings errors.

- [ ] **Step 9: Write the visual QA status note**

Create `docs/status/settings-layout-visible-unification-visual-qa-2026-05-12.md`:

```markdown
# Settings Layout Visible Unification Visual QA - 2026-05-12

## Scope

Visible settings layout unification after the foundation branch.

## Build And Deployment

- Branch: `codex/settings-ui-layout-foundation`
- Build id: Record the exact `BUILD_ID` printed by `npm run build` and verified in deployed `main.js`.
- Test vault: `/Volumes/SDD2T/obsidian-vault-write/testvault`
- Deployed files: `main.js`, `manifest.json`, `styles.css`

## DOM Checks

- Official settings modal inspected through `app.setting.activeTab.containerEl`, not a stale editor-area root.
- Classic mode: quick nav present, primary tabs absent, tab panel absent, shared sections present.
- Tabbed mode: primary tabs present, quick nav absent, tab panel absent, one content shell present, shared sections present.

## Visual Checks

- Classic and tabbed navigation shells use the same quiet hierarchy.
- Ordinary settings retain a light card-row feel without competing with section blocks.
- No heavy tab-panel card wraps section cards.
- Style-section side stripes are absent from shared settings surfaces.

## Artifacts

- `.obsidian-debug/settings-layout-visible-unification/classic-settings.png`
- `.obsidian-debug/settings-layout-visible-unification/tabbed-settings.png`

## Console / Error Checks

- `obsidian dev:errors`: Record whether the command returned no captured errors or list the first OpenCodian settings-related error.
- `obsidian dev:console level=error`: Record whether the command returned no captured errors or list the first OpenCodian settings-related console error.

## Remaining Work

Object-heavy sections such as MCP, model availability, formatter runtime rows, agents, commands, plugins, and deep style preview cards remain owner-specific migration slices.
```

- [ ] **Step 10: Restore the user's preferred layout mode if needed**

If the test changed the setting, restore it to the mode the user was using before QA. If unknown, leave `tabbed` because current settings showed `tabbed` before this plan.

Run:

```bash
obsidian eval vault=testvault code="(() => { const plugin = app.plugins.plugins.opencodian; plugin.settings.settingsLayoutMode = 'tabbed'; return plugin.saveSettings().then(() => true); })()"
```

Expected: returns `true`.

## Task 7: Final Review And Commit

**Files:**
- Source/style/docs/test files touched above
- Generated `styles.css`
- Generated `graphify-out/**` if source changed

- [ ] **Step 1: Inspect diff**

Run:

```bash
git diff --stat
git diff -- src/style/components/settings-layout-contract.css src/style/components/model-selector.css
```

Expected: diff is focused on settings UI hierarchy and docs/tests. No chat/composer/model selector runtime behavior changed.

- [ ] **Step 2: Confirm no accidental settings behavior changes**

Run:

```bash
git diff -- src/core/types/settings.ts src/main.ts src/core/config src/core/opencode
```

Expected: no diff, unless a prior committed foundation change already touched docs or graph artifacts.

- [ ] **Step 3: Commit**

Run:

```bash
git add src/style/components/settings-layout-contract.css src/style/components/model-selector.css styles.css tests/unit/features/settings/OpenCodianSettings.test.ts tests/unit/features/settings/SettingsTabbedRenderer.test.ts tests/unit/features/settings/OpenCodianSettingsView.test.ts docs/modules/style/components/settings-layout-contract.md docs/status/settings-layout-visible-unification-visual-qa-2026-05-12.md graphify-out
git commit -m "style: visibly unify settings layout hierarchy"
```

If `git add graphify-out` reports no changes, omit it from the final staged set.

## Acceptance Checklist

- [ ] Plan exists before code changes.
- [ ] No settings behavior, defaults, migrations, save semantics, OpenCode config behavior, model filtering, MCP behavior, or chat appearance runtime behavior changed.
- [ ] Classic quick-nav and tabbed tabs are both visually light navigation shells.
- [ ] Tabbed mode has no heavy `.opencodian-settings-tab-panel` shell.
- [ ] Ordinary settings retain a comfortable light row-card feel.
- [ ] Section blocks remain the strongest standard content surface.
- [ ] No side-stripe section cards remain in the shared settings surface.
- [ ] Focus-visible states remain visible.
- [ ] Focused settings tests pass.
- [ ] `npm run verify` passes.
- [ ] Test Vault deploy contains the newest `BUILD_ID`.
- [ ] Obsidian official settings modal DOM checks pass for classic and tabbed.
- [ ] Screenshots exist for classic and tabbed.
- [ ] Console/error checks show no OpenCodian settings errors.
