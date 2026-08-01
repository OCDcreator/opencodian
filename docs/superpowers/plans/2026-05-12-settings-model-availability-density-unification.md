# Settings Model Availability Density Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the model availability/provider management settings area so complex provider and model rows use the same restrained hierarchy as the new shared settings layout contract, without changing behavior.

**Architecture:** Keep `SettingsModelCatalogPresenter` behavior and DOM ownership intact. Apply a targeted CSS contract slice in `src/style/modals/config-editor-modal.css` that maps model availability controls, catalog summaries, provider rows, model rows, and switches onto `--opencodian-settings-*` tokens from `settings-layout-contract.css`. Add CSS contract tests to prevent reintroducing heavy gradient/blur/shadow cards inside model availability.

**Tech Stack:** TypeScript presenter tests with Jest, vanilla CSS using Obsidian variables and OpenCodian settings tokens, generated root `styles.css`, repo module docs, Obsidian CLI autodebug.

---

## Design Constraints

- Product register: Obsidian-native workbench, dense but not crowded, no decorative UI.
- Theme: inherit Obsidian theme variables; do not hard-code a new palette.
- Color strategy: restrained. Accent appears only for active, focus, hover, and semantic status.
- Layout: no nested heavy card hierarchy. Provider rows may be object rows, model rows must feel like inline rows inside an expanded provider, not another full card family.
- Motion: keep existing state transitions but remove hover lift from provider cards.
- Accessibility: keep focus-visible states and checkbox semantics; do not remove current inputs or labels.
- Scope: no setting schema changes, no model catalog behavior changes, no provider availability logic changes, no locale changes.

## Files

- Modify: `src/style/modals/config-editor-modal.css`
  - Normalize `.opencodian-model-availability-*`, `.opencodian-model-catalog-*`, `.opencodian-model-toggle-provider*`, `.opencodian-model-toggle-model*`, and `.opencodian-model-toggle-switch*`.
- Modify: `tests/unit/features/settings/SettingsModelCatalogPresenter.test.ts`
  - Add CSS contract assertions for the model availability slice.
- Modify: `docs/modules/style/modals/config-editor-modal.md`
  - Document the Slice 2 contract and guardrails.
- Modify: `styles.css`
  - Regenerate with `npm run build:css` or `npm run build`.
- Create: `docs/archive/maintainability/phases/settings-model-availability-density-visual-qa-2026-05-12.md`
  - Record verification, deploy BUILD_ID, DOM/CSS checks, screenshots, and errors.

## Task 1: Add CSS Contract Tests First

- [ ] **Step 1: Open the presenter test**

Run:

```bash
sed -n '1,360p' tests/unit/features/settings/SettingsModelCatalogPresenter.test.ts
```

Expected: the file contains existing CSS contract tests reading `src/style/modals/config-editor-modal.css`.

- [ ] **Step 2: Add the failing CSS contract test**

Append this test inside `describe('SettingsModelCatalogPresenter', () => { ... })`:

```ts
  it('keeps model availability rows aligned with the shared settings hierarchy contract', () => {
    const css = readFileSync(
      join(process.cwd(), 'src/style/modals/config-editor-modal.css'),
      'utf8',
    );

    const providerRule = css.match(/\.opencodian-model-toggle-provider\s*\{[^}]*\}/)?.[0] ?? '';
    const providerHoverRule = css.match(/\.opencodian-model-toggle-provider:hover\s*\{[^}]*\}/)?.[0] ?? '';
    const modelRule = css.match(/\.opencodian-model-toggle-model\s*\{[^}]*\}/)?.[0] ?? '';
    const searchRule = css.match(/\.opencodian-model-availability-search-container\s*\{[^}]*\}/)?.[0] ?? '';
    const summaryCardRule = css.match(/\.opencodian-model-catalog-summary-card\s*\{[^}]*\}/)?.[0] ?? '';

    expect(providerRule).toContain('var(--opencodian-settings-object-bg');
    expect(providerRule).toContain('box-shadow: none');
    expect(providerRule).not.toContain('linear-gradient');
    expect(providerRule).not.toContain('backdrop-filter');
    expect(providerHoverRule).not.toContain('transform: translateY');
    expect(modelRule).toContain('var(--opencodian-settings-row-bg');
    expect(modelRule).toContain('box-shadow: none');
    expect(modelRule).not.toContain('backdrop-filter');
    expect(searchRule).toContain('var(--opencodian-settings-inline-bg');
    expect(summaryCardRule).toContain('var(--opencodian-settings-object-bg');
  });
```

- [ ] **Step 3: Run the focused test and confirm it fails before CSS edits**

Run:

```bash
npm test -- --runInBand tests/unit/features/settings/SettingsModelCatalogPresenter.test.ts
```

Expected before implementation: one failure in the new CSS contract test because the current provider row still uses gradients/shadows and model rows still use local heavy styling.

## Task 2: Normalize Model Availability CSS

- [ ] **Step 1: Edit `src/style/modals/config-editor-modal.css`**

Update only the model availability block from `.opencodian-model-availability-controls` through the matching reduced-motion media rules. Apply these exact rules:

```css
.opencodian-model-availability-controls {
  display: flex;
  flex-wrap: wrap;
  gap: var(--opencodian-settings-space-md, 8px);
  margin-bottom: var(--opencodian-settings-space-lg, 12px);
}

.opencodian-model-availability-search-container {
  display: flex;
  align-items: center;
  gap: var(--opencodian-settings-space-md, 8px);
  min-height: 36px;
  padding: 0 11px;
  border-radius: var(--opencodian-settings-radius-inline, 6px);
  border: 1px solid var(--opencodian-settings-inline-border, var(--background-modifier-border));
  background: var(--opencodian-settings-inline-bg, var(--background-secondary));
  box-shadow: none;
  transition: border-color 0.16s ease, background 0.16s ease, box-shadow 0.16s ease;
}

.opencodian-model-availability-search-container:focus-within {
  border-color: var(--opencodian-settings-nav-active-border, var(--background-modifier-border-hover));
  background: color-mix(in srgb, var(--interactive-accent) 5%, var(--opencodian-settings-inline-bg, var(--background-secondary)));
  box-shadow: 0 0 0 2px var(--opencodian-settings-focus-ring, color-mix(in srgb, var(--interactive-accent) 18%, transparent));
}

.opencodian-model-availability-filter-toggle {
  min-height: 36px;
  padding: 0 11px;
  border-radius: var(--opencodian-settings-radius-inline, 6px);
  border: 1px solid var(--opencodian-settings-inline-border, var(--background-modifier-border));
  background: transparent;
  box-shadow: none;
  color: var(--text-muted);
  font-size: 12px;
}

.opencodian-model-availability-filter-toggle:hover {
  border-color: var(--opencodian-settings-nav-active-border, var(--background-modifier-border-hover));
  background: var(--opencodian-settings-inline-bg, var(--background-secondary));
}

.opencodian-model-availability-filter-toggle:focus-within {
  border-color: var(--opencodian-settings-nav-active-border, var(--background-modifier-border-hover));
  box-shadow: 0 0 0 2px var(--opencodian-settings-focus-ring, color-mix(in srgb, var(--interactive-accent) 18%, transparent));
}

.opencodian-model-catalog-actions {
  margin-top: var(--opencodian-settings-space-md, 8px);
  padding: 8px 10px;
  border: 1px solid var(--opencodian-settings-row-border, var(--background-modifier-border));
  border-radius: var(--opencodian-settings-radius-row, 10px);
  background: var(--opencodian-settings-row-bg, var(--background-secondary));
  box-shadow: none;
}

.opencodian-model-toggle-provider {
  margin-top: 0;
  padding: 12px 14px;
  border: 1px solid var(--opencodian-settings-object-border, var(--background-modifier-border));
  border-radius: var(--opencodian-settings-radius-row, 10px);
  background: var(--opencodian-settings-object-bg, var(--background-secondary));
  box-shadow: none;
  transition: border-color 0.16s ease, background 0.16s ease;
}

.opencodian-model-toggle-provider:hover {
  border-color: var(--opencodian-settings-nav-active-border, var(--background-modifier-border-hover));
  background: color-mix(in srgb, var(--interactive-accent) 5%, var(--opencodian-settings-object-bg, var(--background-secondary)));
  box-shadow: none;
}

.opencodian-model-toggle-model {
  padding: 10px 12px;
  border-radius: var(--opencodian-settings-radius-inline, 6px);
  background: var(--opencodian-settings-row-bg, var(--background-primary));
  border: 1px solid var(--opencodian-settings-row-border, var(--background-modifier-border));
  box-shadow: none;
  transition: border-color 0.16s ease, background 0.16s ease;
}
```

Keep the existing semantic status badge colors and checkbox behavior, but remove gradient backgrounds, decorative blur, provider hover lift, and black-tinted shadows in this slice.

- [ ] **Step 2: Update catalog summary cards**

In the same CSS file, update `.opencodian-model-catalog-summary-card` to use:

```css
background: var(--opencodian-settings-object-bg, var(--background-primary));
border: 1px solid var(--opencodian-settings-object-border, var(--background-modifier-border-hover));
box-shadow: none;
```

Keep active/focus states visible through border/background token shifts.

- [ ] **Step 3: Preserve responsive behavior**

Keep the existing `@media (max-width: 720px)` and `@media (max-width: 480px)` structure. Remove references to `.opencodian-model-toggle-block` padding if the block is no longer rendered, but do not change wrapping behavior for provider headers, actions, model toolbar, or switches.

## Task 3: Refresh Docs And Generated CSS

- [ ] **Step 1: Update module docs**

Add a short section to `docs/modules/style/modals/config-editor-modal.md`:

```markdown
## 2026-05-12 Model availability density slice

The model availability/provider management area now maps its complex controls to the shared settings hierarchy tokens:

- Search and filter controls use inline tokens, not a separate glass toolbar.
- Catalog summary cards and provider rows use object tokens with no gradient, blur, hover lift, or decorative shadows.
- Expanded model rows use row tokens, so provider cards do not become full cards containing another full card family.
- Status badges keep semantic color because provider/model availability is decision-critical.

Guardrail: do not reintroduce `linear-gradient`, `backdrop-filter`, hover `translateY`, or black-tinted card shadows on `.opencodian-model-toggle-provider` / `.opencodian-model-toggle-model`.
```

- [ ] **Step 2: Run CSS build**

Run:

```bash
npm run build:css
```

Expected: `styles.css` is regenerated successfully.

- [ ] **Step 3: Run focused tests**

Run:

```bash
npm test -- --runInBand tests/unit/features/settings/SettingsModelCatalogPresenter.test.ts tests/unit/features/settings/OpenCodianSettings.test.ts tests/unit/features/settings/OpenCodianSettingsView.test.ts
```

Expected: all listed suites pass.

## Task 4: Full Verification And Obsidian Autodebug

- [ ] **Step 1: Run full verification**

Run:

```bash
npm run verify
```

Expected: owner guard, module docs, graphify freshness, devlog order, lint, typecheck, tests, and production build all pass.

- [ ] **Step 2: Deploy the verified build to Test Vault**

Run these as separate commands:

```bash
cp dist/main.js /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js
cp dist/manifest.json /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/manifest.json
cp dist/styles.css /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/styles.css
```

- [ ] **Step 3: Reload and inspect Obsidian**

Run:

```bash
obsidian dev:debug on vault=testvault
obsidian dev:console clear vault=testvault
obsidian dev:errors clear vault=testvault
obsidian plugin:reload id=opencodian vault=testvault
```

Then use `obsidian eval` to open Settings -> OpenCodian -> Model -> Availability and assert:

- root mode is tabbed;
- model tab is active;
- availability section exists;
- `.opencodian-model-toggle-provider` exists when catalogs are loaded;
- provider/model rows report `boxShadow: none`;
- provider row background is not a gradient string;
- `.opencodian-model-toggle-provider-list` is scrollable when enough providers exist;
- there is no captured error.

- [ ] **Step 4: Capture screenshots**

Save runtime-only screenshots under:

```text
.obsidian-debug/settings-model-availability-density/tabbed-model-availability.png
.obsidian-debug/settings-model-availability-density/classic-model-availability.png
```

Do not commit these screenshots unless explicitly requested.

- [ ] **Step 5: Write visual QA report**

Create `docs/archive/maintainability/phases/settings-model-availability-density-visual-qa-2026-05-12.md` with branch, build ID, deployment path, exact commands, DOM/CSS findings, screenshot paths, error capture, and remaining setting-density debt.

## Task 5: Final Diff And Commit

- [ ] **Step 1: Inspect diff scope**

Run:

```bash
git diff --stat
git diff -- src/style/modals/config-editor-modal.css tests/unit/features/settings/SettingsModelCatalogPresenter.test.ts
```

Expected: changes are scoped to model availability CSS/tests/docs/generated CSS and status report.

- [ ] **Step 2: Commit**

Run:

```bash
git add src/style/modals/config-editor-modal.css styles.css tests/unit/features/settings/SettingsModelCatalogPresenter.test.ts docs/modules/style/modals/config-editor-modal.md docs/archive/maintainability/phases/settings-model-availability-density-visual-qa-2026-05-12.md docs/superpowers/plans/2026-05-12-settings-model-availability-density-unification.md
git commit -m "style: unify model availability settings density"
```

Expected: commit succeeds on branch `codex/settings-ui-layout-foundation`.

## Self-Review

- Spec coverage: covers the user request to continue implementation, preserves function, targets the next visible dense settings area, and requires Obsidian autodebug.
- Placeholder scan: no TBD/TODO/fill-in placeholders remain.
- Type consistency: no TypeScript API changes are planned; tests only read CSS and existing DOM classes.
- Scope check: this is one focused subsystem, model availability/provider management. MCP, agents, commands, plugins, and appearance previews remain later slices.
