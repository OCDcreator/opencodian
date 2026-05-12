# Settings MCP Server Density Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the MCP/server settings surface follow the shared settings hierarchy contract without changing runtime behavior.

**Architecture:** This is Slice 3 of the settings UI refactor. The implementation stays CSS-first: `SettingsMcpSection` continues to own behavior and DOM structure, while `config-editor-modal.css` maps MCP toolbar, overview cards, server cards, details, empty states, and editor form groups onto the existing `--opencodian-settings-*` surface tokens. A focused Jest CSS contract prevents reintroducing nested heavy cards, gradients, blur, hover lift, side stripes, or local MCP-only surface vocabulary.

**Tech Stack:** Obsidian plugin, TypeScript, Jest, vanilla CSS compiled through `npm run build:css`, Test Vault deployment, Obsidian CLI/autodebug evidence capture.

---

## Design Constraints

- Product register: Obsidian-native workbench, dense but not crowded, calm/capable/transparent.
- Both classic/tiled and tabbed modes remain first-class and should use the same visual hierarchy.
- Ordinary setting items may keep card feel, but card levels must be unified: no outer card containing another visually equivalent card.
- MCP/server semantic badges remain colored because connection, auth, failure, and disabled states affect user decisions.
- No functional changes to MCP add/edit/delete/connect/disconnect/auth/monitor flows.
- No new schema, settings defaults, locale copy, or OpenCode runtime changes.
- No gradients, decorative blur/glass, heavy shadow, hover `translateY`, or side-stripe borders.

## File Structure

- Modify: `tests/unit/features/settings/SettingsMcpSection.test.ts`
  - Add a CSS contract test for the MCP/server settings hierarchy.
- Modify: `src/style/modals/config-editor-modal.css`
  - Re-map `.opencodian-mcp-*` surface selectors to shared settings tokens.
  - Keep existing responsive behavior, badge semantics, and action layout.
- Modify: `docs/modules/style/modals/config-editor-modal.md`
  - Document the Slice 3 guardrail so future edits do not reintroduce local MCP card families.
- Create: `docs/status/settings-mcp-server-density-visual-qa-2026-05-12.md`
  - Record build/deploy/autodebug evidence and screenshot paths after validation.
- Generated/possibly modified: `styles.css`, `graphify-out/*`
  - Refresh with repo scripts only if build/graphify reports changes.

## Task 1: Write The MCP CSS Contract Test

**Files:**
- Modify: `tests/unit/features/settings/SettingsMcpSection.test.ts`

- [ ] **Step 1: Add filesystem imports at the top**

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
```

- [ ] **Step 2: Add a CSS contract describe block**

Append after the existing `SettingsMcpSection` behavior describes:

```ts
describe('SettingsMcpSection CSS contract', () => {
  it('keeps MCP management surfaces aligned with the shared settings hierarchy contract', () => {
    const css = readFileSync(
      join(process.cwd(), 'src/style/modals/config-editor-modal.css'),
      'utf8',
    );

    const findRule = (selector: string, required: string): string => (
      Array.from(css.matchAll(new RegExp(`${selector}\\s*\\{[^}]*\\}`, 'g')))
        .map((match) => match[0])
        .find((rule) => rule.includes(required)) ?? ''
    );

    const toolbarRule = findRule('\\.opencodian-mcp-overview-toolbar', 'background:');
    const overviewCardRule = findRule('\\.opencodian-mcp-overview-card', 'background:');
    const serverCardRule = findRule('\\.opencodian-mcp-server-row,\\s*\\.opencodian-mcp-server-card', 'background:');
    const actionSettingRule = findRule('\\.opencodian-mcp-server-row-actions \\.setting-item,\\s*\\.opencodian-mcp-server-card-actions \\.setting-item', 'box-shadow:');
    const helperRule = findRule('\\.opencodian-mcp-server-row-error,\\s*\\.opencodian-mcp-server-card-helper', 'background:');
    const emptyRule = findRule('\\.opencodian-mcp-empty', 'background:');
    const detailsRule = findRule('\\.opencodian-mcp-details-summary,\\s*\\.opencodian-mcp-details-section,\\s*\\.opencodian-mcp-details-technical', 'background:');
    const formGroupRule = findRule('\\.opencodian-mcp-form-group', 'background:');
    const cssWithoutBadges = css.replace(/\\.opencodian-mcp-badge[\\s\\S]*?\\.opencodian-mcp-transport-badge/, '');

    expect(toolbarRule).toContain('var(--opencodian-settings-inline-bg');
    expect(overviewCardRule).toContain('var(--opencodian-settings-object-bg');
    expect(overviewCardRule).toContain('box-shadow: none');
    expect(serverCardRule).toContain('var(--opencodian-settings-object-bg');
    expect(serverCardRule).toContain('box-shadow: none');
    expect(actionSettingRule).toContain('background: transparent');
    expect(helperRule).toContain('var(--opencodian-settings-row-bg');
    expect(emptyRule).toContain('var(--opencodian-settings-row-bg');
    expect(detailsRule).toContain('var(--opencodian-settings-object-bg');
    expect(formGroupRule).toContain('var(--opencodian-settings-object-bg');
    expect(cssWithoutBadges).not.toContain('linear-gradient');
    expect(cssWithoutBadges).not.toContain('backdrop-filter');
    expect(cssWithoutBadges).not.toContain('transform: translateY');
    expect(cssWithoutBadges).not.toMatch(/border-left:\\s*[2-9]px/);
  });
});
```

- [ ] **Step 3: Run the focused test and confirm it fails before CSS edits**

Run:

```bash
npm test -- --runInBand tests/unit/features/settings/SettingsMcpSection.test.ts
```

Expected: FAIL because MCP rules still use local `color-mix(...)` backgrounds instead of `--opencodian-settings-*` tokens.

## Task 2: Re-map MCP/Server CSS To Shared Settings Tokens

**Files:**
- Modify: `src/style/modals/config-editor-modal.css`

- [ ] **Step 1: Update toolbar and overview cards**

Replace the MCP toolbar and overview card surface declarations so:

```css
.opencodian-mcp-overview-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--opencodian-settings-inline-border);
  border-radius: var(--opencodian-settings-radius-inline);
  background: var(--opencodian-settings-inline-bg);
  box-shadow: none;
}

.opencodian-mcp-overview-card {
  padding: 12px;
  border: 1px solid var(--opencodian-settings-object-border);
  border-radius: var(--opencodian-settings-radius-row);
  background: var(--opencodian-settings-object-bg);
  box-shadow: none;
}
```

- [ ] **Step 2: Update server card and helper rows**

Set server cards to object surface weight and helper/error rows to row surface weight:

```css
.opencodian-mcp-server-row,
.opencodian-mcp-server-card {
  padding: 12px;
  border: 1px solid var(--opencodian-settings-object-border);
  border-radius: var(--opencodian-settings-radius-row);
  background: var(--opencodian-settings-object-bg);
  box-shadow: none;
}

.opencodian-mcp-server-row-error,
.opencodian-mcp-server-card-helper {
  margin-top: 10px;
  padding: 9px 10px;
  border: 1px solid var(--opencodian-settings-row-border);
  border-radius: var(--opencodian-settings-radius-inline);
  background: var(--opencodian-settings-row-bg);
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.55;
  word-break: break-word;
}
```

- [ ] **Step 3: Update empty, details, and form group surfaces**

Map empty state, details modal sections, and form groups to object/row tokens:

```css
.opencodian-mcp-empty {
  padding: 16px 14px;
  border: 1px dashed var(--opencodian-settings-row-border);
  border-radius: var(--opencodian-settings-radius-row);
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.55;
  text-align: center;
  background: var(--opencodian-settings-row-bg);
  box-shadow: none;
}

.opencodian-mcp-details-summary,
.opencodian-mcp-details-section,
.opencodian-mcp-details-technical,
.opencodian-mcp-form-group {
  border: 1px solid var(--opencodian-settings-object-border);
  border-radius: var(--opencodian-settings-radius-row);
  background: var(--opencodian-settings-object-bg);
  box-shadow: none;
}
```

Keep existing spacing and `overflow: hidden` for `.opencodian-mcp-form-group`.

- [ ] **Step 4: Keep semantic badges unchanged**

Do not replace `.opencodian-mcp-badge--connected`, `--failed`, `--needs-auth`, or `--disabled` colors. They are state indicators, not decorative card surfaces.

## Task 3: Run Focused Verification And Refresh Docs

**Files:**
- Modify: `docs/modules/style/modals/config-editor-modal.md`

- [ ] **Step 1: Run focused MCP tests**

Run:

```bash
npm test -- --runInBand tests/unit/features/settings/SettingsMcpSection.test.ts tests/unit/features/settings/SettingsMcpSection.actions.test.ts tests/unit/features/settings/McpServerEditorModal.test.ts tests/unit/features/settings/McpServerStatusModal.test.ts
```

Expected: PASS.

- [ ] **Step 2: Build CSS**

Run:

```bash
npm run build:css
```

Expected: generated root `styles.css` updates without errors.

- [ ] **Step 3: Update module docs**

Append:

```md
## 2026-05-12 MCP/server density slice

MCP management now follows the shared settings hierarchy token contract:

- management toolbar uses inline tokens;
- overview metrics, server cards, details panels, and editor form groups use object tokens;
- helper/error/empty rows use row tokens;
- MCP status badges keep semantic colors because runtime state affects user decisions.

Guardrail: do not reintroduce a local MCP-only card family with gradients, decorative blur, hover lift, side-stripe borders, or shadowed nested cards.
```

## Task 4: Full Verification And Deploy

**Files:**
- Generated if needed: `graphify-out/*`, `styles.css`

- [ ] **Step 1: Refresh graphify only if `src/` changes require it**

Run:

```bash
npm run graphify:update:src
```

Expected: graphify completes. If no graph artifacts change, leave them untouched.

- [ ] **Step 2: Stage planned source/doc/generated files before full verify**

Run:

```bash
git add tests/unit/features/settings/SettingsMcpSection.test.ts src/style/modals/config-editor-modal.css docs/modules/style/modals/config-editor-modal.md styles.css graphify-out
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
rg -n "BUILD_ID" dist/main.js /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js
```

Expected: Test Vault `main.js` contains the same newest build id as `dist/main.js`.

## Task 5: Obsidian Autodebug Visual Check

**Files:**
- Create runtime-only artifacts under `.obsidian-debug/settings-mcp-server-density/`
- Create: `docs/status/settings-mcp-server-density-visual-qa-2026-05-12.md`

- [ ] **Step 1: Attach debug surface and reload plugin**

Run:

```bash
obsidian dev:debug on vault=testvault
obsidian dev:console clear vault=testvault
obsidian dev:errors clear vault=testvault
obsidian plugin:reload id=opencodian vault=testvault
```

Expected: reload succeeds.

- [ ] **Step 2: Open OpenCodian settings to tabbed MCP**

Use `obsidian eval` to open Settings, switch OpenCodian settings layout to tabbed, and set primary tab `mcp`.

Expected DOM facts:

```json
{
  "mode": "tabbed",
  "primary": "mcp",
  "mcp": true,
  "serverCards": ">0 or empty state",
  "tabPanel": false
}
```

- [ ] **Step 3: Capture tabbed screenshot and CSS facts**

Capture:

```bash
obsidian dev:screenshot path=.obsidian-debug/settings-mcp-server-density/tabbed-mcp.png vault=testvault
```

Use `obsidian eval` or `obsidian dev:css` to confirm:

- `.opencodian-mcp-overview-toolbar` background resolves from inline token style.
- `.opencodian-mcp-overview-card` has no `box-shadow`.
- `.opencodian-mcp-server-card` has no `box-shadow`.
- No visible nested `.opencodian-settings-tab-panel` exists.

- [ ] **Step 4: Check classic mode parity**

Use `obsidian eval` to switch settings layout to classic and re-open the MCP section.

Expected DOM facts:

```json
{
  "mode": "classic",
  "mcp": true,
  "serverCards": ">0 or empty state"
}
```

Capture:

```bash
obsidian dev:screenshot path=.obsidian-debug/settings-mcp-server-density/classic-mcp.png vault=testvault
```

- [ ] **Step 5: Restore Test Vault preference to tabbed MCP and inspect logs**

Run:

```bash
obsidian dev:errors vault=testvault
obsidian dev:console vault=testvault level=error limit=80
```

Expected: no captured errors.

- [ ] **Step 6: Write QA report**

`docs/status/settings-mcp-server-density-visual-qa-2026-05-12.md` must include:

- branch and worktree path;
- deployed build id;
- focused tests and full `npm run verify` result;
- deploy path;
- tabbed/classic DOM facts;
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
git diff --cached -- tests/unit/features/settings/SettingsMcpSection.test.ts src/style/modals/config-editor-modal.css docs/modules/style/modals/config-editor-modal.md docs/status/settings-mcp-server-density-visual-qa-2026-05-12.md
```

- [ ] **Step 2: Commit**

Run:

```bash
git commit -m "style: unify mcp server settings density"
```

Expected: commit created on `codex/settings-ui-layout-foundation`.

## Self-Review

- Spec coverage: covers third-round UI-only implementation, both layout modes, shared card hierarchy, focused tests, docs, build, deploy, and Obsidian autodebug.
- Placeholder scan: no `TBD`, `TODO`, or unspecified test command remains.
- Type consistency: no new TypeScript runtime API is introduced; CSS test helper follows existing settings CSS contract pattern.
