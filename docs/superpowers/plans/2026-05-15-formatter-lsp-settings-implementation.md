# Formatter & LSP Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the formatter-only settings surface with a combined `Formatter & LSP` entry that adds overview, formatter, and LSP editing flows while preserving exact OpenCode config semantics.

**Architecture:** Extend the existing formatter settings owner instead of inventing a second parallel settings surface. Add explicit LSP config types/helpers at the config boundary, route a renamed primary tab through classic and tabbed settings shells, then rebuild the settings owner around three sub-surfaces: overview, formatter config, and LSP config. Runtime status stays SDK-backed; project config stays local-file-backed; the UI makes that split explicit.

**Tech Stack:** TypeScript, Obsidian settings UI, existing OpenCodian settings owners, Jest unit tests, OpenCode SDK facade, local `.opencode/opencode.json` config manager

---

### Task 1: Add explicit LSP config types and config-manager helpers

**Files:**
- Modify: `src/core/types/opencodeConfig.ts`
- Modify: `src/core/types/index.ts`
- Create: `src/core/config/lspConfig.ts`
- Modify: `src/core/config/OpencodeConfigManager.ts`
- Test: `tests/unit/core/config/OpencodeConfigManager.test.ts`

- [ ] **Step 1: Write failing config-helper tests for LSP read/write semantics**

Add cases alongside existing config-manager coverage to prove:

```ts
it('reads lsp config as undefined when the subtree is absent', async () => {
  await writeOpencodeJson({});
  await expect(manager.getLspConfig()).resolves.toBeUndefined();
});

it('writes false when disabling the entire lsp subtree', async () => {
  await manager.updateLspConfig(false);
  await expect(readOpencodeJson()).resolves.toMatchObject({ lsp: false });
});

it('preserves custom entries and unknown fields when writing lsp object config', async () => {
  await manager.updateLspConfig({
    tsserver: {
      command: ['typescript-language-server', '--stdio'],
      extensions: ['.ts', '.tsx'],
      env: { NODE_ENV: 'development' },
      initialization: { hostInfo: 'OpenCodian' },
      extra: { passthrough: true },
    },
  });
  await expect(readOpencodeJson()).resolves.toMatchObject({
    lsp: {
      tsserver: {
        command: ['typescript-language-server', '--stdio'],
        extensions: ['.ts', '.tsx'],
        env: { NODE_ENV: 'development' },
        initialization: { hostInfo: 'OpenCodian' },
        extra: { passthrough: true },
      },
    },
  });
});
```

- [ ] **Step 2: Run the focused config-manager test file and confirm failure**

Run: `npm test -- --runTestsByPath tests/unit/core/config/OpencodeConfigManager.test.ts`

Expected: failure because `getLspConfig` / `updateLspConfig` helpers do not exist yet.

- [ ] **Step 3: Add explicit LSP config types and subtree helpers**

Implement the config boundary with upstream-aligned types and exact subtree replacement:

```ts
export interface OpencodeLspEntryConfig {
  command?: string[];
  extensions?: string[];
  disabled?: boolean;
  env?: Record<string, string>;
  initialization?: Record<string, unknown>;
  [key: string]: unknown;
}

export type OpencodeLspConfig =
  | boolean
  | Record<string, OpencodeLspEntryConfig>;
```

```ts
export function readLspConfigValue(config: OpencodeConfig): OpencodeLspConfig | undefined {
  const lsp = config.lsp;
  if (lsp === undefined) return undefined;
  if (typeof lsp === 'boolean') return lsp;
  return isRecord(lsp) ? cloneConfigValue(lsp) : undefined;
}

export function writeLspConfigValue(
  config: OpencodeConfig,
  lsp: OpencodeLspConfig | null | undefined,
): void {
  if (lsp == null) {
    delete config.lsp;
    return;
  }
  config.lsp = typeof lsp === 'boolean'
    ? lsp
    : isRecord(lsp)
      ? cloneConfigValue(lsp)
      : undefined;
  if (config.lsp === undefined) {
    delete config.lsp;
  }
}
```

Then wire `OpencodeConfigManager.getLspConfig()` and `updateLspConfig()` exactly like formatter.

- [ ] **Step 4: Re-run the focused config-manager test file and confirm pass**

Run: `npm test -- --runTestsByPath tests/unit/core/config/OpencodeConfigManager.test.ts`

Expected: PASS for the new LSP subtree coverage.

- [ ] **Step 5: Commit the config-boundary slice**

```bash
git add src/core/types/opencodeConfig.ts src/core/types/index.ts src/core/config/lspConfig.ts src/core/config/OpencodeConfigManager.ts tests/unit/core/config/OpencodeConfigManager.test.ts
git commit -m "feat: add lsp config helpers"
```

### Task 2: Rename the settings entry and route three sub-tabs through the settings shells

**Files:**
- Modify: `src/features/settings/settingsLayoutRegistry.ts`
- Modify: `src/features/settings/SettingsTabbedRenderer.ts`
- Modify: `src/features/settings/OpenCodianSettings.ts`
- Modify: `src/features/settings/OpenCodianSettingsView.ts`
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/zh.ts`
- Test: `tests/unit/features/settings/settingsLayoutRegistry.test.ts`
- Test: `tests/unit/features/settings/SettingsTabbedRenderer.test.ts`

- [ ] **Step 1: Add failing navigation tests for the renamed primary tab and new sub-tabs**

Add assertions like:

```ts
expect(getPrimaryTabDefinition('formatter')?.secondaryTabs.map((tab) => tab.id)).toEqual([
  'overview',
  'formatter',
  'lsp',
]);
expect(getPrimaryTabDefinition('formatter')?.labelKey).toBe('settings.formatter.title');
```

And tabbed-renderer routing coverage that expects the formatter owner to receive `overview`, `formatter`, and `lsp`.

- [ ] **Step 2: Run the routing/layout tests and confirm failure**

Run: `npm test -- --runTestsByPath tests/unit/features/settings/settingsLayoutRegistry.test.ts tests/unit/features/settings/SettingsTabbedRenderer.test.ts`

Expected: failures because the current registry still exposes only `overview` + `config`.

- [ ] **Step 3: Update settings registry, section wiring, and i18n keys**

Change the navigation shape:

```ts
{
  id: 'formatter',
  labelKey: 'settings.formatter.title',
  icon: 'paintbrush',
  defaultSecondaryTabId: 'overview',
  secondaryTabs: [
    { id: 'overview', labelKey: 'settings.formatter.tab.overview' },
    { id: 'formatter', labelKey: 'settings.formatter.tab.formatter' },
    { id: 'lsp', labelKey: 'settings.formatter.tab.lsp' },
  ],
}
```

Update the owner call sites so the same section instance can render the renamed sub-tabs in both classic and tabbed shells. Refresh locale strings so the primary title reads `Formatter & LSP` / `格式化与语言服务`.

- [ ] **Step 4: Re-run the navigation/layout tests and confirm pass**

Run: `npm test -- --runTestsByPath tests/unit/features/settings/settingsLayoutRegistry.test.ts tests/unit/features/settings/SettingsTabbedRenderer.test.ts`

Expected: PASS with the new tab registration.

- [ ] **Step 5: Commit the navigation slice**

```bash
git add src/features/settings/settingsLayoutRegistry.ts src/features/settings/SettingsTabbedRenderer.ts src/features/settings/OpenCodianSettings.ts src/features/settings/OpenCodianSettingsView.ts src/i18n/locales/en.ts src/i18n/locales/zh.ts tests/unit/features/settings/settingsLayoutRegistry.test.ts tests/unit/features/settings/SettingsTabbedRenderer.test.ts
git commit -m "feat: route formatter and lsp settings tabs"
```

### Task 3: Rebuild the settings owner around overview, formatter config, and LSP config

**Files:**
- Modify: `src/features/settings/SettingsFormatterSection.ts`
- Modify: `src/core/opencode/OpenCodeCatalogQueryCoordinator.ts` (only if return typing needs tightening)
- Test: `tests/unit/features/settings/SettingsFormatterSection.test.ts`

- [ ] **Step 1: Replace formatter-only rendering assumptions with failing overview/LSP tests**

Add coverage for:

```ts
it('renders overview, formatter, and lsp tab content', async () => {
  section.attachTabbed(containerEl, 'lsp');
  await flushPromises();
  expect(containerEl.textContent).toContain(t('settings.formatter.tab.lsp'));
});

it('shows lsp mode and runtime summary without requiring formatter runtime success', async () => {
  const { plugin } = createPlugin({
    lspConfig: { tsserver: { disabled: true } },
    lspRuntimeStatus: [{ id: 'tsserver', root: '/vault', status: 'running' }],
  });
  // assertions for summary cards / runtime badges
});

it('blocks saving a custom lsp entry without extensions', async () => {
  // create custom LSP row, leave extensions empty, click save
  expect(mockNotice).toHaveBeenCalledWith(expect.stringContaining('extensions'));
});
```

- [ ] **Step 2: Run the formatter-section test file and confirm failure**

Run: `npm test -- --runTestsByPath tests/unit/features/settings/SettingsFormatterSection.test.ts`

Expected: failure because the owner only understands `overview` and `config`, and knows nothing about LSP config/state.

- [ ] **Step 3: Refactor the owner into a combined Formatter & LSP section**

Keep the single-owner structure, but split internal render paths into:

```ts
attachTabbed(containerEl: HTMLElement, secondaryTabId: string): void {
  switch (secondaryTabId) {
    case 'overview':
      this.renderOverviewBlock(containerEl);
      break;
    case 'formatter':
      this.renderFormatterConfigBlock(containerEl);
      break;
    case 'lsp':
      this.renderLspConfigBlock(containerEl);
      break;
    default:
      this.renderOverviewBlock(containerEl);
  }
}
```

Add paired helpers:

- `loadFormatterConfig()` / `loadLspConfig()`
- `loadFormatterRuntimeStatus()` / `loadLspRuntimeStatus()`
- formatter row editors using `command` / `environment` / `extensions`
- LSP row editors using `command` / `extensions` / `env` / `initialization`
- JSON editors for both subtrees

Keep exact subtree writes through the config manager, preserve unknown fields, and make overview cards explicitly separate runtime state from project config state.

- [ ] **Step 4: Re-run the section test file and confirm pass**

Run: `npm test -- --runTestsByPath tests/unit/features/settings/SettingsFormatterSection.test.ts`

Expected: PASS for overview, formatter config, LSP config, validation, and JSON fallback behaviors.

- [ ] **Step 5: Commit the owner refactor**

```bash
git add src/features/settings/SettingsFormatterSection.ts tests/unit/features/settings/SettingsFormatterSection.test.ts
git commit -m "feat: add formatter and lsp settings surface"
```

### Task 4: Align the section styling contract with the new information architecture

**Files:**
- Modify: `src/style/modals/config-editor-modal.css`
- Test: `tests/unit/features/settings/SettingsFormatterSection.test.ts`

- [ ] **Step 1: Add failing CSS contract expectations for overview cards and default-expanded LSP rows**

Extend the existing CSS assertions so they check both formatter and new LSP surfaces use the shared settings tokens instead of ad hoc gradients or nested heavy cards.

- [ ] **Step 2: Run the settings-section test file and confirm failure**

Run: `npm test -- --runTestsByPath tests/unit/features/settings/SettingsFormatterSection.test.ts`

Expected: failure because the new classes/styles have not been added yet.

- [ ] **Step 3: Implement the visual contract**

Add styles for the new surfaces using the shared token vocabulary:

```css
.opencodian-formatter-overview-grid,
.opencodian-formatter-runtime-panel,
.opencodian-lsp-runtime-panel,
.opencodian-formatter-entry-card,
.opencodian-lsp-entry-card {
  background: var(--opencodian-settings-object-bg);
  border: 1px solid var(--opencodian-settings-object-border);
  border-radius: var(--opencodian-settings-radius-row);
  box-shadow: none;
}
```

Keep the editing fields calm and scan-friendly; no gradients, no glassmorphism, no heavy hover lifts.

- [ ] **Step 4: Re-run the settings-section test file and confirm pass**

Run: `npm test -- --runTestsByPath tests/unit/features/settings/SettingsFormatterSection.test.ts`

Expected: PASS with the updated CSS contract.

- [ ] **Step 5: Commit the styling slice**

```bash
git add src/style/modals/config-editor-modal.css tests/unit/features/settings/SettingsFormatterSection.test.ts
git commit -m "style: polish formatter and lsp settings layout"
```

### Task 5: Update module docs, run verification, and complete the Obsidian autodebug loop

**Files:**
- Modify: `docs/modules/features/settings/SettingsFormatterSection.md`
- Modify: `docs/modules/features/settings/settingsLayoutRegistry.md`
- Modify: `docs/modules/i18n/locales/en.md`
- Modify: `docs/modules/i18n/locales/zh.md`
- Modify: any module-doc index entries required by `npm run check:module-docs`

- [ ] **Step 1: Refresh module docs for the combined settings surface**

Document the renamed primary entry, the new sub-tabs, the LSP config semantics, and the runtime/config split in the affected module docs.

- [ ] **Step 2: Run targeted tests and build**

Run:

```bash
npm test -- --runTestsByPath tests/unit/core/config/OpencodeConfigManager.test.ts tests/unit/features/settings/settingsLayoutRegistry.test.ts tests/unit/features/settings/SettingsTabbedRenderer.test.ts tests/unit/features/settings/SettingsFormatterSection.test.ts
npm run build
npm run check:module-docs
```

Expected: all commands pass.

- [ ] **Step 3: Refresh graphify if `src/` freshness requires it**

Run: `npm run graphify:update:src`

Expected: committed `graphify-out/` artifacts stay fresh for the touched `src/` files.

- [ ] **Step 4: Deploy to the Test Vault and validate with the Obsidian autodebug loop**

Run the documented sequence separately:

```bash
npm run build
cp dist/main.js /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js
cp dist/manifest.json /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/manifest.json
cp dist/styles.css /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/styles.css
```

Then use the autodebug workflow to reload the plugin, open the `Formatter & LSP` settings entry, capture a screenshot, inspect DOM/text, and iterate until the surface is visually and functionally healthy.

- [ ] **Step 5: Commit the verification/docs slice**

```bash
git add docs/modules/features/settings/SettingsFormatterSection.md docs/modules/features/settings/settingsLayoutRegistry.md docs/modules/i18n/locales/en.md docs/modules/i18n/locales/zh.md graphify-out/GRAPH_REPORT.md graphify-out/graph.json
git commit -m "docs: update formatter and lsp settings docs"
```
