# Composer Popover Card Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Composer Agent, Permission, and Model popovers one complete, flat card system while preserving their separate data, selection, and persistence behavior.

**Architecture:** Add a Composer-only `ComposerPopoverFrame` for shared header/content/footer DOM and a small DOM-only roving-focus helper. Existing selector coordinators keep their own data and writeback ownership; they render current content inside the frame. The Model popover remains search-first with sticky provider headers, while Agent and Permission add truthful arrow-key navigation.

**Tech Stack:** TypeScript, Obsidian DOM APIs, Jest 30/jsdom, CSS custom properties, OpenCodian i18n, esbuild, graphify, Obsidian Plugin Autodebug.

## Global Constraints

- Each Composer trigger opens only its own card; do not merge Agent, Permission, and Model content.
- Leave runtime-dock trigger appearance unchanged.
- The common frame owns no catalog data, risk classification, persistence, or backend API call.
- Preserve `AnchoredOverlayLayoutController`, its 8px Chat safe inset, and existing Agent `340px/272px`, Permission `280px/220px`, Model `340px/280px` preferred/minimum widths.
- Preserve Model search, provider grouping, sticky headers, scroll behavior, and current-tab `modelOverride`.
- Preserve Agent default/candidate and loading/empty/failed states.
- Preserve backend-specific Permission choices and explicit risk descriptions. Only Permission keeps semantic selected colors; Agent and Model use product accent selection.
- Localize every new visible string in both English and Chinese.
- Do not add dependencies, `as any`, `@ts-ignore`, `@ts-expect-error`, gradients, or `backdrop-filter`.
- Update matching module docs, root `styles.css`, and the committed `src` graph.
- Do not stage unrelated `.omo/` work.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/features/chat/ui/ComposerPopoverFrame.ts` | Shared header/content/footer DOM; no runtime state. |
| `src/features/chat/ui/ComposerPopoverListNavigation.ts` | DOM-only roving focus for Agent and Permission options. |
| `src/style/components/composer-popover-frame.css` | Shared flat card, header, footer, option, selected/focus and reduced-motion rules. |
| `ChatAgentSelectionCoordinator.ts` | Keeps async Agent catalog ownership; mounts it in the frame and owns Agent keyboard selection. |
| `PermissionModeSelectorCoordinator.ts` | Keeps backend mode ownership; mounts it in the frame and only closes on successful writes. |
| `ChatSelectionControlsCoordinator.ts` | Keeps Model catalog/search/override ownership; provides focus restoration to permission/model selection. |
| `ComposerInputShellCoordinator.ts` | Exposes one narrow public Composer focus method. |
| `OpenCodianView.ts` | Wires focus restoration without new runtime ownership. |
| `src/i18n/locales/{en,zh}.ts` | Frame, Model title/search/state copy. |
| Existing selector CSS/tests/docs | Migrate visual duplication, lock behavior, document changed contracts. |

## Shared Interfaces

Task 1 creates these exact interfaces:

```ts
export interface ComposerPopoverFrameTexts {
  title: string;
  escapeKey: string;
  navigateHint: string;
  selectHint: string;
}

export interface ComposerPopoverFrameHandle {
  contentEl: HTMLElement;
  refresh(texts: ComposerPopoverFrameTexts): void;
}

export function mountComposerPopoverFrame(
  dropdownEl: HTMLElement,
  texts: ComposerPopoverFrameTexts,
): ComposerPopoverFrameHandle;

export function getPopoverOptions(rootEl: HTMLElement, selector: string): HTMLElement[];
export function getSelectedPopoverOptionIndex(rootEl: HTMLElement, selector: string): number | null;
export function focusPopoverOption(rootEl: HTMLElement, selector: string, index: number): number | null;
export function movePopoverOptionFocus(
  rootEl: HTMLElement,
  selector: string,
  currentIndex: number | null,
  direction: 1 | -1,
): number | null;
```

The list helper wraps at boundaries, makes exactly one option `tabindex="0"`, focuses it with `preventScroll: true`, then scrolls it into view. It returns `null` for an empty list.

---

## Task 1: Build And Test The Shared Frame Foundation

**Files:**

- Create: `src/features/chat/ui/ComposerPopoverFrame.ts`
- Create: `src/features/chat/ui/ComposerPopoverListNavigation.ts`
- Create: `tests/unit/features/chat/ui/ComposerPopoverFrame.test.ts`
- Create: `tests/unit/features/chat/ui/ComposerPopoverListNavigation.test.ts`
- Create: `docs/modules/features/chat/ui/ComposerPopoverFrame.md`
- Create: `docs/modules/features/chat/ui/ComposerPopoverListNavigation.md`

**Interfaces:** Produces the interfaces in **Shared Interfaces**. These modules import no coordinator, settings type, or backend service.

- [ ] **Step 1: Write failing frame DOM tests.**

Create `ComposerPopoverFrame.test.ts` with these assertions:

```ts
const dropdown = document.createElement('div');
const frame = mountComposerPopoverFrame(dropdown, {
  title: 'Choose model', escapeKey: 'Esc', navigateHint: 'Navigate', selectHint: 'Select',
});
const child = frame.contentEl.createDiv({ text: 'catalog' });

expect(dropdown.querySelector('.opencodian-composer-popover-frame')).not.toBeNull();
expect(dropdown.querySelector('.opencodian-composer-popover-title')?.textContent).toBe('Choose model');
expect(dropdown.querySelector('kbd')?.textContent).toBe('Esc');
expect(dropdown.querySelector('.opencodian-composer-popover-footer')?.textContent).toContain('Navigate');

frame.refresh({ title: '选择模型', escapeKey: 'Esc', navigateHint: '导航', selectHint: '选择' });
expect(frame.contentEl.contains(child)).toBe(true);
expect(dropdown.querySelector('.opencodian-composer-popover-title')?.textContent).toBe('选择模型');
```

- [ ] **Step 2: Write failing roving-focus tests.**

Create `ComposerPopoverListNavigation.test.ts` with three `.option` elements, one `aria-selected="true"`, and `scrollIntoView = jest.fn()`. Assert selected-index discovery, `ArrowUp` wrapping first→last, `ArrowDown` wrapping last→first, `tabIndex` becoming `[-1, 0, -1]`, focused element matching the active option, and `null` for an empty root.

- [ ] **Step 3: Prove the tests fail before implementation.**

Run:

```bash
npm test -- --runInBand --runTestsByPath \
  tests/unit/features/chat/ui/ComposerPopoverFrame.test.ts \
  tests/unit/features/chat/ui/ComposerPopoverListNavigation.test.ts
```

Expected: FAIL with unresolved imports for both new modules.

- [ ] **Step 4: Implement the frame.**

In `ComposerPopoverFrame.ts`, append one `.opencodian-composer-popover-frame` into the supplied selector-specific dropdown. Build child elements in this exact order:

```ts
const frameEl = dropdownEl.createDiv({ cls: 'opencodian-composer-popover-frame' });
const headerEl = frameEl.createDiv({ cls: 'opencodian-composer-popover-header' });
const titleEl = headerEl.createSpan({ cls: 'opencodian-composer-popover-title' });
const escapeKeyEl = headerEl.createEl('kbd', { cls: 'opencodian-composer-popover-escape-key' });
const contentEl = frameEl.createDiv({ cls: 'opencodian-composer-popover-content' });
const footerEl = frameEl.createDiv({ cls: 'opencodian-composer-popover-footer' });
const navigateEl = footerEl.createSpan({ cls: 'opencodian-composer-popover-footer-navigate' });
const selectEl = footerEl.createSpan({ cls: 'opencodian-composer-popover-footer-select' });
```

`refresh()` changes only title/key/footer text and never empties `contentEl`; the dropdown remains the listbox owner.

- [ ] **Step 5: Implement the keyboard helper.**

In `ComposerPopoverListNavigation.ts`, derive options with `Array.from(rootEl.querySelectorAll<HTMLElement>(selector))`. Clamp a requested focus index, set every option `tabIndex` to `-1`, set the active option to `0`, call `focus({ preventScroll: true })`, call `scrollIntoView({ block: 'nearest' })`, and return the active index. `movePopoverOptionFocus()` must use modulo arithmetic for wrapping.

- [ ] **Step 6: Verify, document, and commit the foundation.**

Run:

```bash
npm test -- --runInBand --runTestsByPath \
  tests/unit/features/chat/ui/ComposerPopoverFrame.test.ts \
  tests/unit/features/chat/ui/ComposerPopoverListNavigation.test.ts
npm run typecheck
```

Expected: both suites PASS and typecheck exits `0`.

Document the presentation-only and DOM-only ownership boundaries, then commit:

```bash
git add src/features/chat/ui/ComposerPopoverFrame.ts \
  src/features/chat/ui/ComposerPopoverListNavigation.ts \
  tests/unit/features/chat/ui/ComposerPopoverFrame.test.ts \
  tests/unit/features/chat/ui/ComposerPopoverListNavigation.test.ts \
  docs/modules/features/chat/ui/ComposerPopoverFrame.md \
  docs/modules/features/chat/ui/ComposerPopoverListNavigation.md
git commit -m "Add Composer popover frame foundation"
```

## Task 2: Add Shared CSS, Localized Frame Copy, And Generated CSS

**Files:**

- Create: `src/style/components/composer-popover-frame.css`
- Modify: `src/style/index.css:3-6`
- Modify: `src/i18n/locales/en.ts:1942-1955`
- Modify: `src/i18n/locales/zh.ts:1942-1955`
- Create: `tests/unit/features/chat/ui/ComposerPopoverFrameStyleContract.test.ts`
- Create: `docs/modules/style/components/composer-popover-frame.md`
- Modify: `docs/modules/i18n/locales/en.md`
- Modify: `docs/modules/i18n/locales/zh.md`
- Modify: generated `styles.css`

**Interfaces:** Consumes `ComposerPopoverFrameTexts` from Task 1 and produces the `opencodian-composer-popover-*` CSS contract for Tasks 3–5.

- [ ] **Step 1: Add localizable frame and Model text.**

Add these exact keys in both locale files near the existing Agent selector keys:

```ts
// en.ts
'chat.composerPopover.navigateHint': 'Navigate',
'chat.composerPopover.selectHint': 'Select',
'chat.composerPopover.agentTitle': 'Choose primary agent',
'chat.composerPopover.permissionTitle': 'Permission mode',
'chat.composerPopover.modelTitle': 'Choose model',
'chat.composerPopover.modelSearchPlaceholder': 'Search providers or models…',
'chat.composerPopover.modelLoading': 'Loading models…',
'chat.composerPopover.modelNoModels': 'No models available',
'chat.composerPopover.modelNoResults': 'No matching models',

// zh.ts
'chat.composerPopover.navigateHint': '导航',
'chat.composerPopover.selectHint': '选择',
'chat.composerPopover.agentTitle': '选择主 Agent',
'chat.composerPopover.permissionTitle': '权限模式',
'chat.composerPopover.modelTitle': '选择模型',
'chat.composerPopover.modelSearchPlaceholder': '搜索提供商或模型…',
'chat.composerPopover.modelLoading': '正在加载模型…',
'chat.composerPopover.modelNoModels': '没有可用模型',
'chat.composerPopover.modelNoResults': '没有匹配的模型',
```

Do not modify existing Agent default text, permission labels/descriptions, or backend-specific sandbox strings.

- [ ] **Step 2: Write the stylesheet contract test before writing the stylesheet.**

Create `ComposerPopoverFrameStyleContract.test.ts` using `fs.readFileSync('src/style/components/composer-popover-frame.css', 'utf8')`. Assert it contains selectors for `.opencodian-composer-popover-frame`, `-header`, `-footer`, `-option`, `.is-selected`, `:focus-visible`, and `prefers-reduced-motion`; assert it does not contain `backdrop-filter`, `linear-gradient`, or `radial-gradient`.

- [ ] **Step 3: Run that test and confirm it fails because the stylesheet is absent.**

Run:

```bash
npm test -- --runInBand --runTestsByPath tests/unit/features/chat/ui/ComposerPopoverFrameStyleContract.test.ts
```

Expected: FAIL because `src/style/components/composer-popover-frame.css` does not exist.

- [ ] **Step 4: Implement the common flat stylesheet.**

Create `src/style/components/composer-popover-frame.css` using semantic Obsidian variables:

```css
.opencodian-composer-popover-frame {
  overflow: hidden;
  border: 1px solid var(--background-modifier-border);
  border-radius: 14px;
  background: var(--background-primary);
  box-shadow: 0 12px 28px var(--background-modifier-box-shadow);
}

.opencodian-composer-popover-header,
.opencodian-composer-popover-footer {
  display: flex;
  align-items: center;
  min-height: 36px;
  padding: 0 12px;
  color: var(--text-muted);
}

.opencodian-composer-popover-header {
  justify-content: space-between;
  border-bottom: 1px solid var(--background-modifier-border);
}

.opencodian-composer-popover-footer {
  gap: 10px;
  border-top: 1px solid var(--background-modifier-border);
  font-size: 11px;
}

.opencodian-composer-popover-escape-key {
  padding: 1px 5px;
  border: 1px solid var(--background-modifier-border);
  border-radius: 4px;
  font: inherit;
}

.opencodian-composer-popover-option {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) 18px;
  align-items: center;
  column-gap: 8px;
  min-height: 48px;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: 8px;
}

.opencodian-composer-popover-option:hover { background: var(--background-modifier-hover); }
.opencodian-composer-popover-option:focus-visible { outline: 2px solid var(--interactive-accent); outline-offset: -2px; }
.opencodian-composer-popover-option.is-selected {
  background: color-mix(in srgb, var(--interactive-accent) 12%, transparent);
  border-color: color-mix(in srgb, var(--interactive-accent) 36%, var(--background-modifier-border));
  box-shadow: inset 3px 0 0 var(--interactive-accent);
}
```

Add title casing, muted section/state padding, icon/check slots, text truncation, and a reduced-motion block. Keep CSS flat: no glass effects, gradients, or hover transforms.

- [ ] **Step 5: Import, build, and verify common styling.**

Insert this import immediately before `agent-selector.css` in `src/style/index.css`:

```css
@import 'components/composer-popover-frame.css';
```

Run:

```bash
npm test -- --runInBand --runTestsByPath \
  tests/unit/features/chat/ui/ComposerPopoverFrame.test.ts \
  tests/unit/features/chat/ui/ComposerPopoverListNavigation.test.ts \
  tests/unit/features/chat/ui/ComposerPopoverFrameStyleContract.test.ts
npm run build:css
```

Expected: all focused tests PASS and root `styles.css` is regenerated.

- [ ] **Step 6: Document and commit common visual infrastructure.**

Document the flat frame selector contract and locale key families. Then commit:

```bash
git add src/style/components/composer-popover-frame.css src/style/index.css styles.css \
  src/i18n/locales/en.ts src/i18n/locales/zh.ts \
  tests/unit/features/chat/ui/ComposerPopoverFrameStyleContract.test.ts \
  docs/modules/style/components/composer-popover-frame.md \
  docs/modules/i18n/locales/en.md docs/modules/i18n/locales/zh.md
git commit -m "Style Composer popover cards consistently"
```

## Task 3: Move Agent Into The Frame And Add Async Roving Focus

**Files:**

- Modify: `src/features/chat/services/ChatAgentSelectionCoordinator.ts:17-363`
- Modify: `src/style/components/agent-selector.css:154-390`
- Modify: `tests/unit/features/chat/ChatAgentSelectionCoordinator.test.ts:60-250`
- Modify: `docs/modules/features/chat/services/ChatAgentSelectionCoordinator.md`
- Modify: `docs/modules/style/components/agent-selector.md`

**Interfaces:** Consumes Task 1 frame/navigation helpers. Produces Agent frame markup, roving `tabIndex`, and keyboard selection through existing `selectAgent()`.

- [ ] **Step 1: Write failing Agent frame and keyboard tests.**

Extend `ChatAgentSelectionCoordinator.test.ts` to assert:

1. After opening and settling its async catalog, Agent contains exactly one common frame, title `Choose primary agent`, `kbd` `Esc`, and footer text containing `Navigate` and `Select`.
2. Keyboard opening with `Enter` focuses selected default Agent (`tabindex="0"`).
3. `ArrowUp` on default wraps to the last candidate; `ArrowDown` wraps back to default; exactly one option has `tabindex="0"`.
4. `Enter` on focused Build selects Build, closes the card, and calls `restoreInputFocus()` once.
5. `Escape` inside the list closes it, returns focus to `.opencodian-agent-trigger`, and leaves no positive option tabindex.
6. Failed/empty asynchronous catalog states do not focus a state line and remain open until explicit close.

Use:

```ts
trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
await settleAsyncWork();
dropdown.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
```

- [ ] **Step 2: Run the Agent suite and verify the assertions fail.**

Run:

```bash
npm test -- --runInBand --runTestsByPath tests/unit/features/chat/ChatAgentSelectionCoordinator.test.ts
```

Expected: FAIL because Agent renders its heading directly, has no footer, and has no listbox arrow handling.

- [ ] **Step 3: Mount Agent content inside the common frame.**

Add `private frame: ComposerPopoverFrameHandle | null` and set it in `mount()` with:

```ts
private getFrameTexts(): ComposerPopoverFrameTexts {
  return {
    title: t('chat.composerPopover.agentTitle'),
    escapeKey: 'Esc',
    navigateHint: t('chat.composerPopover.navigateHint'),
    selectHint: t('chat.composerPopover.selectHint'),
  };
}
```

Change `renderList()` to empty and populate `frame.contentEl`, retaining existing `.opencodian-agent-dropdown-heading`, option, and state class names. Add `.opencodian-composer-popover-option`, `tabindex="-1"`, `role="option"`, and correct `aria-selected` to each actual Agent row.

- [ ] **Step 4: Implement keyboard opening, wrapping navigation, selection, and focus return.**

Track `openedWithKeyboard` and `focusedOptionIndex`. Let trigger `Enter`, `Space`, `ArrowDown`, and `ArrowUp` open with keyboard intent; mouse opening must not steal focus. Add one dropdown `keydown` handler:

```ts
if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
  this.focusedOptionIndex = movePopoverOptionFocus(
    this.frame.contentEl, '.opencodian-agent-option', this.focusedOptionIndex,
    event.key === 'ArrowDown' ? 1 : -1,
  );
  event.preventDefault();
} else if (event.key === 'Enter' && this.focusedOptionIndex !== null) {
  this.getOptionElements()[this.focusedOptionIndex]?.click();
  event.preventDefault();
} else if (event.key === 'Escape') {
  this.closeDropdown({ restoreTriggerFocus: true });
  event.preventDefault();
}
```

After `reloadCatalog()` re-renders, focus selected row or first option only if the card remains open and `openedWithKeyboard` is true. `closeDropdown({ restoreTriggerFocus?: boolean })` resets focus state; selection calls it without trigger restore, then preserves existing `host.restoreInputFocus()`.

- [ ] **Step 5: Keep only Agent-specific CSS.**

Remove Agent dropdown outer card styles and duplicate option geometry/hover/focus/selected rules now owned by the common component. Keep trigger, default/mode badge, description, marker, state, overflow, and layout rules. Do not keep the current yellow Agent selected row; Agent rows use Task 2’s product accent. Do not alter the Agent trigger’s current warning-selected appearance.

- [ ] **Step 6: Verify, document, and commit Agent migration.**

Run:

```bash
npm test -- --runInBand --runTestsByPath \
  tests/unit/features/chat/ChatAgentSelectionCoordinator.test.ts \
  tests/unit/features/chat/ui/ComposerPopoverFrame.test.ts \
  tests/unit/features/chat/ui/ComposerPopoverListNavigation.test.ts
npm run build:css
npm run list:module-docs -- --range HEAD
```

Expected: all tests PASS, CSS regenerated, and listed Agent/frame docs are updated. Document Agent’s independent catalog/invocation ownership and new keyboard contract. Commit:

```bash
git add src/features/chat/services/ChatAgentSelectionCoordinator.ts \
  src/style/components/agent-selector.css styles.css \
  tests/unit/features/chat/ChatAgentSelectionCoordinator.test.ts \
  docs/modules/features/chat/services/ChatAgentSelectionCoordinator.md \
  docs/modules/style/components/agent-selector.md
git commit -m "Unify Agent popover card behavior"
```

## Task 4: Move Permission Into The Frame, Preserve Semantics, And Make Failure Observable

**Files:**

- Modify: `src/features/chat/services/PermissionModeSelectorCoordinator.ts:13-402`
- Modify: `src/features/chat/services/ChatSelectionControlsCoordinator.ts:37-43, 759-791`
- Modify: `src/features/chat/services/ComposerInputShellCoordinator.ts:521-547`
- Modify: `src/features/chat/OpenCodianView.ts:1167-1275, 4711-4735`
- Modify: `src/style/components/permission-mode-selector.css:301-700`
- Modify: `tests/unit/features/chat/claudePermissionModeSelector.test.ts`
- Modify: `tests/unit/features/chat/ChatSelectionControlsCoordinator.test.ts:87-354`
- Modify: `tests/unit/features/chat/ComposerInputShellCoordinator.test.ts`
- Modify: `docs/modules/features/chat/services/PermissionModeSelectorCoordinator.md`
- Modify: `docs/modules/features/chat/services/ChatSelectionControlsCoordinator.md`
- Modify: `docs/modules/features/chat/services/ComposerInputShellCoordinator.md`
- Modify: `docs/modules/features/chat/OpenCodianView.md`
- Modify: `docs/modules/style/components/permission-mode-selector.md`

**Interfaces:**

- Change `PermissionModeSelectorHost.switchPermissionMode(mode)` from `Promise<void>` to `Promise<boolean>`.
- Add `restoreInputFocus(): void` to `PermissionModeSelectorHost`.
- Add `restoreComposerInputFocus(): void` to `ChatSelectionControlsCoordinatorHost`.
- Add `public focusInput(): void` to `ComposerInputShellCoordinator`.
- `OpenCodianView.createChatSelectionControlsCoordinatorHost()` returns `restoreComposerInputFocus: () => this.composerInputShellCoordinator.focusInput()`.

- [ ] **Step 1: Write failing Permission behavior tests.**

Extend `claudePermissionModeSelector.test.ts` with tests that verify shared frame/header/footer, `data-permission-semantic="danger"` on bypass, keyboard wrap/Enter selection, and this failing-write path:

```ts
const failingHost: PermissionModeSelectorHost = {
  getPermissionMode: () => 'default',
  switchPermissionMode: jest.fn(async () => false),
  restoreInputFocus: jest.fn(),
};
```

Open the card, choose `acceptEdits`, await microtasks, then assert `aria-expanded === 'true'`, default remains `.is-selected`, and `restoreInputFocus` was not called.

Extend `ChatSelectionControlsCoordinator.test.ts` to prove successful OpenCode Permission selection calls `restoreComposerInputFocus()` once, while a failed write does not. Extend `ComposerInputShellCoordinator.test.ts` to call `coordinator.focusInput()` after build and assert `document.activeElement === fixture.textarea`.

- [ ] **Step 2: Run targeted tests and confirm red.**

Run:

```bash
npm test -- --runInBand --runTestsByPath \
  tests/unit/features/chat/claudePermissionModeSelector.test.ts \
  tests/unit/features/chat/ChatSelectionControlsCoordinator.test.ts \
  tests/unit/features/chat/ComposerInputShellCoordinator.test.ts
```

Expected: FAIL because Permission has neither common-frame markup nor focus/navigation/write-success semantics.

- [ ] **Step 3: Implement the boolean write and input-focus seams.**

Add this public method to `ComposerInputShellCoordinator`:

```ts
focusInput(): void {
  this.inputTextareaEl?.focus();
}
```

In `ChatSelectionControlsCoordinatorHost`, add `restoreComposerInputFocus(): void`; pass it as `restoreInputFocus` to every `PermissionModeSelectorCoordinator` host constructed by `buildBackendPermissionSelector()`.

Make all write paths return `Promise<boolean>`:

- `switchClaudeCodePermissionModeInPlugin()` returns `false` when plugin/settings do not exist and `true` only after save/adapter calls resolve.
- `switchCodexSandboxModeInPlugin()` returns `false` when plugin/settings do not exist and `true` after save/adapter update.
- `OpenCodianView.switchPermissionMode()` returns `true` after successful restart. Its existing catch remains responsible for logger/Notice feedback, returns `false`, and does not rethrow.

Do not change stored modes, notices, adapter calls, or restart order.

- [ ] **Step 4: Mount Permission content in the frame and add roving focus.**

Mirror Task 3’s lifecycle in `PermissionModeSelectorCoordinator`: render current options into `frame.contentEl`, retain `.opencodian-permission-option`, add `.opencodian-composer-popover-option`, `role="option"`, correct `aria-selected`, and `tabindex="-1"`. `getFrameTexts()` uses `chat.composerPopover.permissionTitle`, `navigateHint`, and `selectHint`.

Set `data-permission-semantic` during option creation:

```ts
const semantic = mode.id === 'yolo' || mode.id === 'bypassPermissions' || mode.id === 'danger-full-access'
  ? 'danger'
  : mode.id === 'plan' || mode.id === 'read-only'
    ? 'safe'
    : 'neutral';
```

Keyboard-open focuses the current mode; Arrow keys wrap, Enter triggers the same `selectPermissionMode`, and Escape closes plus restores trigger focus.

Replace `selectPermissionMode()` with:

```ts
private async selectPermissionMode(mode: string): Promise<void> {
  const didSwitch = await this.host.switchPermissionMode(mode);
  if (!didSwitch) {
    return;
  }
  this.updateTriggerDisplay();
  this.closeDropdown();
  this.host.restoreInputFocus();
}
```

This preserves existing backend error feedback while keeping failed mode changes visible in-place.

- [ ] **Step 5: Migrate Permission CSS while retaining risk semantics.**

Remove common card shell, option geometry, generic hover/selected, and duplicate animation rules. Delete the Claude-specific flat-menu exception that conflicts with the approved shared card system. Retain icon/description typography and implement only semantic selected overrides:

```css
.opencodian-permission-option[data-permission-semantic='danger'].is-selected {
  background: color-mix(in srgb, var(--background-modifier-error) 12%, transparent);
  border-color: color-mix(in srgb, var(--background-modifier-error) 42%, var(--background-modifier-border));
  box-shadow: inset 3px 0 0 var(--background-modifier-error);
}

.opencodian-permission-option[data-permission-semantic='safe'].is-selected {
  background: color-mix(in srgb, var(--background-modifier-success) 12%, transparent);
  border-color: color-mix(in srgb, var(--background-modifier-success) 42%, var(--background-modifier-border));
  box-shadow: inset 3px 0 0 var(--background-modifier-success);
}
```

Use existing semantic variables and `color-mix()`. Risky choices retain explicit description and visible check/icon color; Agent and Model must receive no permission semantic styling.

- [ ] **Step 6: Verify, document, and commit Permission migration.**

Run:

```bash
npm test -- --runInBand --runTestsByPath \
  tests/unit/features/chat/claudePermissionModeSelector.test.ts \
  tests/unit/features/chat/ChatSelectionControlsCoordinator.test.ts \
  tests/unit/features/chat/ComposerInputShellCoordinator.test.ts
npm run build:css
npm run typecheck
```

Expected: suites PASS, CSS is generated, and typecheck exits `0`. Document the boolean write outcome, focus seam, backend modes, and semantic selected overrides. Commit:

```bash
git add src/features/chat/services/PermissionModeSelectorCoordinator.ts \
  src/features/chat/services/ChatSelectionControlsCoordinator.ts \
  src/features/chat/services/ComposerInputShellCoordinator.ts \
  src/features/chat/OpenCodianView.ts \
  src/style/components/permission-mode-selector.css styles.css \
  tests/unit/features/chat/claudePermissionModeSelector.test.ts \
  tests/unit/features/chat/ChatSelectionControlsCoordinator.test.ts \
  tests/unit/features/chat/ComposerInputShellCoordinator.test.ts \
  docs/modules/features/chat/services/PermissionModeSelectorCoordinator.md \
  docs/modules/features/chat/services/ChatSelectionControlsCoordinator.md \
  docs/modules/features/chat/services/ComposerInputShellCoordinator.md \
  docs/modules/features/chat/OpenCodianView.md \
  docs/modules/style/components/permission-mode-selector.md
git commit -m "Unify Permission popover card behavior"
```

## Task 5: Move Model Into The Frame Without Regressing Search Or Sticky Groups

**Files:**

- Modify: `src/features/chat/services/ChatSelectionControlsCoordinator.ts:46-49, 460-692`
- Modify: `src/features/chat/services/ModelSelectionRuntime.ts:228-239`
- Modify: `src/features/chat/ui/modelSelector/ModelSelectorRenderer.ts:1-134`
- Modify: `src/style/components/model-selector.css:169-440`
- Modify: `tests/unit/features/chat/ChatSelectionControlsCoordinator.test.ts`
- Modify: `tests/unit/features/chat/modelSelectorRenderer.test.ts`
- Modify: `tests/unit/features/chat/modelSelectorInteractions.test.ts`
- Modify: `docs/modules/features/chat/services/ChatSelectionControlsCoordinator.md`
- Modify: `docs/modules/features/chat/services/ModelSelectionRuntime.md`
- Modify: `docs/modules/features/chat/ui/modelSelector/ModelSelectorRenderer.md`
- Modify: `docs/modules/features/chat/ui/modelSelector/ModelSelectorInteractions.md`
- Modify: `docs/modules/style/components/model-selector.md`

**Interfaces:** Consumes Task 1 frame and Task 2 locale keys. Model continues to use existing `ModelSelectorInteractions`, not the non-search list helper.

- [ ] **Step 1: Add failing Model regression tests.**

Extend `ChatSelectionControlsCoordinator.test.ts` to assert one common frame/title/Esc/footer contains the existing search input and scroll container; search keeps focus after opening; ArrowDown+Enter selects highlighted Model, closes card, writes active-tab override, and calls `restoreComposerInputFocus()` once; Escape from search closes and focuses the trigger.

Extend `modelSelectorRenderer.test.ts`: every Model row has `role="option"`, accurate `aria-selected`, `tabindex="-1"`, and `.opencodian-composer-popover-option`, while provider headers and sticky binding remain unchanged. Extend interaction tests only to lock existing clamping; do not turn Model arrow behavior into wrapping.

- [ ] **Step 2: Run Model tests and confirm red.**

Run:

```bash
npm test -- --runInBand --runTestsByPath \
  tests/unit/features/chat/ChatSelectionControlsCoordinator.test.ts \
  tests/unit/features/chat/modelSelectorRenderer.test.ts \
  tests/unit/features/chat/modelSelectorInteractions.test.ts
```

Expected: FAIL because search/scroll currently mount directly under the dropdown and Model options lack the common row ARIA/classes.

- [ ] **Step 3: Mount Model content inside the shared frame.**

Add `private modelPopoverFrame: ComposerPopoverFrameHandle | null`. In `buildModelDropdown()`, mount it after emptying the selector dropdown, then append current search wrapper and scroll container into `modelPopoverFrame.contentEl`. Set dropdown `role="listbox"`; preserve trigger ARIA; keep search first.

Replace `MODEL_SEARCH_PLACEHOLDER` and four Model text literals with Task 2 locale keys. In `applyLocaleTexts()`, refresh the frame, update search placeholder, and render list without clearing `modelFilterQuery`.

- [ ] **Step 4: Add Model option semantics only.**

In `ModelSelectorRenderer.ts`, create rows with:

```ts
cls: 'opencodian-model-option opencodian-composer-popover-option',
attr: {
  role: 'option',
  'aria-selected': String(modelValue === currentValue),
  tabindex: '-1',
  'data-value': modelValue,
},
```

Do not move provider headers, change sticky-header binding, or alter Model interaction helpers.

- [ ] **Step 5: Return focus only after successful Model write.**

Make `ModelSelectionRuntime.switchModel()` return `boolean`: return `false` if active-tab override refuses, otherwise preserve identity sync/Notice and return `true`. Change Model close to accept `{ restoreTriggerFocus?: boolean }`; Escape requests trigger focus. Successful click/Enter closes normally then calls `host.restoreComposerInputFocus()` only when `switchModel()` returned true.

- [ ] **Step 6: Migrate Model CSS, verify, document, and commit.**

Remove Model outer card and duplicated common row/animation/reduced-motion rules; retain search, scrollbar, provider header, icon, unavailable trigger, and group spacing within `.opencodian-model-*` scope. Then run:

```bash
npm test -- --runInBand --runTestsByPath \
  tests/unit/features/chat/ChatSelectionControlsCoordinator.test.ts \
  tests/unit/features/chat/modelSelectorRenderer.test.ts \
  tests/unit/features/chat/modelSelectorInteractions.test.ts
npm run typecheck
npm run build:css
```

Expected: all tests PASS, typecheck exits `0`, and CSS is regenerated. Document content-slot/search-first/sticky-header/current-tab override behavior. Commit:

```bash
git add src/features/chat/services/ChatSelectionControlsCoordinator.ts \
  src/features/chat/services/ModelSelectionRuntime.ts \
  src/features/chat/ui/modelSelector/ModelSelectorRenderer.ts \
  src/style/components/model-selector.css styles.css \
  tests/unit/features/chat/ChatSelectionControlsCoordinator.test.ts \
  tests/unit/features/chat/modelSelectorRenderer.test.ts \
  tests/unit/features/chat/modelSelectorInteractions.test.ts \
  docs/modules/features/chat/services/ChatSelectionControlsCoordinator.md \
  docs/modules/features/chat/services/ModelSelectionRuntime.md \
  docs/modules/features/chat/ui/modelSelector/ModelSelectorRenderer.md \
  docs/modules/features/chat/ui/modelSelector/ModelSelectorInteractions.md \
  docs/modules/style/components/model-selector.md
git commit -m "Unify Model popover card behavior"
```

## Task 6: Complete Repository Gates And Test Vault QA

**Files:**

- Modify: generated `styles.css`
- Modify: `graphify-out/GRAPH_REPORT.md`
- Modify: `graphify-out/graph.json`
- Modify: every module page reported by `npm run list:module-docs -- --range HEAD`
- Output: `.obsidian-debug/composer-popover-card-unification-*/`

**Interfaces:** Consumes all completed DOM, CSS, locale, keyboard, and persistence contracts. Produces module-doc parity, a refreshed source graph, production build, deployed Test Vault artifact, and runtime evidence.

- [ ] **Step 1: Reconcile module documentation.**

Run `npm run list:module-docs -- --range HEAD` followed by `npm run check:module-docs`.

Expected: every changed/new TypeScript or CSS module has a matching changed/new `docs/modules/**` page. Update each page named by the first command before proceeding.

- [ ] **Step 2: Refresh source graph and run full verify.**

Run `npm run graphify:update:src`, `npm run check:graphify`, then `npm run verify`.

Expected: graph is current; owner guard, module docs, graph, devlog order, lint at `0 errors / 0 warnings`, typecheck, all Jest suites, and production build exit `0`.

- [ ] **Step 3: Deploy sequentially to Test Vault.**

Run `npm run build`, record `BUILD_ID`, then separately copy `dist/main.js`, `dist/manifest.json`, and `dist/styles.css` to the available Test Vault plugin directory. Use local `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`; otherwise use SSH host `desktop-gs1a9np` and `C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\`. Do not chain build/copy. Verify deployed `main.js` contains the recorded `BUILD_ID`.

- [ ] **Step 4: Run live Obsidian visual and behavior QA.**

Use `obsidian-plugin-autodebug` to reload the Test Vault plugin, prove the active surface, inspect console errors, capture DOM/computed-style evidence, and save artifacts below `.obsidian-debug/composer-popover-card-unification-<BUILD_ID>/`.

Verify all of these cases:

1. Agent common frame/title/Esc/footer; default/candidates; loading/empty/failed; mouse selection; Arrow wrap; Enter select; Escape trigger focus; no clipping.
2. OpenCode Permission common frame and YOLO/normal/plan semantic selected state. Repeat surface checks under Claude Code and Codex settings, confirming explicit backend labels/descriptions and dangerous selected modes.
3. Model common frame/title/Esc/footer; search focus; sticky headers while scrolling; filtering; search Arrow/Enter; current-tab override; no clipping.
4. Light and dark themes; all three cards captured; triggers retain their existing appearance.

- [ ] **Step 5: Review and commit remaining generated artifacts only when necessary.**

Run `git diff --check` and `git status --short`; leave `.omo/` untracked. If owning commits did not include generated CSS/graph/docs, stage those expected artifacts and commit `Verify Composer popover card unification`. Do not create an empty validation commit. Record evidence paths and residual risks in handoff.

## Plan Self-Review

### Spec coverage

- Independent cards and unchanged triggers: global constraints and Tasks 3–5.
- Common header/Esc/footer and flat visual system: Tasks 1–2.
- Agent states and async keyboard focus: Task 3.
- Permission backend modes, semantic selected color, successful-write-only close: Task 4.
- Model search/sticky headers/current-tab override/existing arrow clamping: Task 5.
- Accessibility, focus, ARIA, reduced motion, locales: Tasks 1–5.
- Docs, CSS generation, graph, full verify, Test Vault runtime proof: Task 6.

### Placeholder scan

This plan contains no TBD/TODO/future-work instructions. Each source change names paths, interfaces, behavioral assertions, commands, and expected output.

### Interface consistency

- `ComposerPopoverFrameTexts` and `ComposerPopoverFrameHandle` originate in Task 1 and remain unchanged.
- `PermissionModeSelectorHost.switchPermissionMode(): Promise<boolean>` is introduced and consumed in Task 4.
- `ChatSelectionControlsCoordinatorHost.restoreComposerInputFocus()` originates in `OpenCodianView` and is consumed by Permission/Model selection.
- `ComposerInputShellCoordinator.focusInput()` is the only new Composer focus API.
- Model stays on `ModelSelectorInteractions`; only Agent/Permission use the new navigation helper.
