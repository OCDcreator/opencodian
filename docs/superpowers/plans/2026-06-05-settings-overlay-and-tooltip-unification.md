# Settings Overlay And Tooltip Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify repo-controlled settings tooltip/popover rendering under body-level overlay owners, remove repo-internal native `title` usage in settings surfaces, and verify the resulting layout/layering in the real Obsidian plugin UI.

**Architecture:** Add two settings-local overlay owners: `SettingsTooltipController` for passive hover/focus tooltips and `SettingsPopoverController` for interactive anchored popovers. Migrate the known clipped settings surfaces first (`searchInputEnhancer.ts` and `SettingsFormatterSection.ts`), then replace remaining repo-controlled native `title` usage with controller-backed tooltips or adjacent fixed detail surfaces. Keep `SettingsSectionCoordinator` as the quick-nav owner for now, but align its geometry and stacking contract with the new settings overlay layers.

**Tech Stack:** TypeScript, Jest/jsdom, Obsidian DOM helpers, existing vanilla CSS pipeline, OpenCode MCP execution, Test Vault deployment, Obsidian visual QA via autodebug if available or Codex Computer Use fallback.

---

## OpenCode Batch Contract

Use OpenCode for the code-changing work in bounded batches. For every task below:

- Run the listed focused verification command before returning.
- Return a concise changed-files summary and the exact test/build result.
- Do **not** auto-commit inside OpenCode. Hand the diff back to Codex for review between tasks.
- Preserve unrelated dirty worktree changes; never revert chat/history/title-generation work that already exists in this branch.

## File Structure

- Create: `src/features/settings/SettingsTooltipController.ts`
- Create: `src/features/settings/SettingsPopoverController.ts`
- Create: `tests/unit/features/settings/SettingsTooltipController.test.ts`
- Create: `tests/unit/features/settings/SettingsPopoverController.test.ts`
- Create: `tests/unit/features/settings/searchInputEnhancer.test.ts`
- Create: `tests/unit/features/settings/settingsOverlayContract.test.ts`
- Create: `docs/modules/features/settings/SettingsTooltipController.md`
- Create: `docs/modules/features/settings/SettingsPopoverController.md`
- Modify: `src/features/settings/searchInputEnhancer.ts`
- Modify: `src/features/settings/SettingsFormatterSection.ts`
- Modify: `src/features/settings/settingsStyleControls.ts`
- Modify: `src/features/settings/SettingsStyleBackgroundSection.ts`
- Modify: `src/features/settings/SettingsModelIconCacheManager.ts`
- Modify: `src/features/settings/SlashCommandCatalogRenderer.ts`
- Modify: `src/features/settings/SettingsCapabilityLabSection.ts`
- Modify: `src/features/settings/SettingsSectionCoordinator.ts`
- Modify: `src/style/components/model-selector.css`
- Modify: `src/style/modals/config-editor-modal.css`
- Modify: `tests/unit/features/settings/SettingsFormatterSection.test.ts`
- Modify: `tests/unit/features/settings/SettingsCapabilityLabSection.test.ts`
- Modify: `tests/unit/features/settings/OpenCodianSettings.test.ts`
- Modify: `docs/modules/features/settings/searchInputEnhancer.md`
- Modify: `docs/modules/features/settings/SettingsFormatterSection.md`
- Modify: `docs/modules/features/settings/SettingsCapabilityLabSection.md`
- Modify: `docs/modules/features/settings/SettingsSectionCoordinator.md`
- Modify: `docs/modules/style/components/model-selector.md`

## Overlay Contract

- `SettingsTooltipController`
  - Trigger selector: `[data-settings-tooltip]:not([data-settings-tooltip=""])`
  - Layer class: `.opencodian-settings-tooltip-layer`
  - Bubble class: `.opencodian-settings-tooltip-bubble`
  - Arrow class: `.opencodian-settings-tooltip-arrow`
  - Layering target: `z-index: 2300`
- `SettingsPopoverController`
  - Moves an existing interactive popover element to `document.body`
  - Layer class stays on the popover element itself; no wrapper required
  - Body-level fixed positioning with `bottom-start` default and `top-start` fallback
  - Layering target: `z-index: 2280`
- `SettingsSectionCoordinator` quick-nav tooltip
  - Stays a separate owner in this slice
  - Align viewport clamp, body-level mount, and stacking gradient under the new contract
  - Layering target: below settings tooltip and popover layers

## Task 1: Add Overlay Owners With Focused Tests

**Files:**
- Create: `src/features/settings/SettingsTooltipController.ts`
- Create: `src/features/settings/SettingsPopoverController.ts`
- Create: `tests/unit/features/settings/SettingsTooltipController.test.ts`
- Create: `tests/unit/features/settings/SettingsPopoverController.test.ts`

- [ ] **Step 1: Write the failing tooltip controller tests**

Create `tests/unit/features/settings/SettingsTooltipController.test.ts` with:

```ts
import { SettingsTooltipController } from '../../../../src/features/settings/SettingsTooltipController';

function mockRect(element: HTMLElement, rect: Partial<DOMRect>): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: rect.left ?? 0,
      y: rect.top ?? 0,
      left: rect.left ?? 0,
      top: rect.top ?? 0,
      right: rect.right ?? ((rect.left ?? 0) + (rect.width ?? 0)),
      bottom: rect.bottom ?? ((rect.top ?? 0) + (rect.height ?? 0)),
      width: rect.width ?? 0,
      height: rect.height ?? 0,
      toJSON: () => '',
    }),
  });
}

describe('SettingsTooltipController', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 240 });
  });

  afterEach(() => {
    SettingsTooltipController.ensureForDocument(document).destroy();
    document.body.innerHTML = '';
  });

  it('renders a body-level tooltip for data-settings-tooltip triggers', () => {
    const controller = SettingsTooltipController.ensureForDocument(document);
    const host = document.createElement('div');
    const button = document.createElement('button');
    host.appendChild(button);
    document.body.appendChild(host);

    button.dataset.settingsTooltip = 'Reset this value';
    mockRect(button, { left: 32, top: 72, width: 24, height: 24 });

    button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    const layer = document.body.querySelector<HTMLElement>('.opencodian-settings-tooltip-layer');
    expect(controller).toBeTruthy();
    expect(layer).not.toBeNull();
    expect(host.querySelector('.opencodian-settings-tooltip-layer')).toBeNull();
    expect(layer?.textContent).toContain('Reset this value');
  });

  it('clamps the tooltip within the viewport and cleans up on focusout', () => {
    SettingsTooltipController.ensureForDocument(document);
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.dataset.settingsTooltip = 'Very long tooltip copy';
    mockRect(button, { left: 2, top: 18, width: 20, height: 20 });

    button.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    const layer = document.body.querySelector<HTMLElement>('.opencodian-settings-tooltip-layer');
    expect(Number.parseFloat(layer?.style.left ?? '0')).toBeGreaterThanOrEqual(12);

    button.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }));
    expect(document.body.querySelector('.opencodian-settings-tooltip-layer')).toBeNull();
  });
});
```

- [ ] **Step 2: Write the failing popover controller tests**

Create `tests/unit/features/settings/SettingsPopoverController.test.ts` with:

```ts
import { SettingsPopoverController } from '../../../../src/features/settings/SettingsPopoverController';

function mockRect(element: HTMLElement, rect: Partial<DOMRect>): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: rect.left ?? 0,
      y: rect.top ?? 0,
      left: rect.left ?? 0,
      top: rect.top ?? 0,
      right: rect.right ?? ((rect.left ?? 0) + (rect.width ?? 0)),
      bottom: rect.bottom ?? ((rect.top ?? 0) + (rect.height ?? 0)),
      width: rect.width ?? 0,
      height: rect.height ?? 0,
      toJSON: () => '',
    }),
  });
}

describe('SettingsPopoverController', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 360 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 220 });
  });

  afterEach(() => {
    SettingsPopoverController.ensureForDocument(document).destroy();
    document.body.innerHTML = '';
  });

  it('moves the active popover to document.body and matches anchor width', () => {
    const controller = SettingsPopoverController.ensureForDocument(document);
    const host = document.createElement('div');
    const input = document.createElement('input');
    const popover = document.createElement('div');
    host.append(input, popover);
    document.body.appendChild(host);

    mockRect(input, { left: 24, top: 40, width: 180, height: 32 });
    mockRect(popover, { left: 0, top: 0, width: 120, height: 96 });

    controller.show({
      anchorEl: input,
      popoverEl: popover,
      matchAnchorWidth: true,
      preferredPlacement: 'bottom-start',
    });

    expect(popover.parentElement).toBe(document.body);
    expect(popover.hidden).toBe(false);
    expect(popover.style.minWidth).toBe('180px');
  });

  it('flips above the anchor when there is not enough space below', () => {
    const controller = SettingsPopoverController.ensureForDocument(document);
    const input = document.createElement('input');
    const popover = document.createElement('div');
    document.body.append(input, popover);

    mockRect(input, { left: 18, top: 184, width: 140, height: 28 });
    mockRect(popover, { left: 0, top: 0, width: 140, height: 88 });

    controller.show({
      anchorEl: input,
      popoverEl: popover,
      preferredPlacement: 'bottom-start',
    });

    expect(popover.dataset.placement).toBe('top-start');
    expect(Number.parseFloat(popover.style.top)).toBeLessThan(184);
  });
});
```

- [ ] **Step 3: Run the focused tests and confirm they fail**

Run:

```bash
npm test -- --runInBand tests/unit/features/settings/SettingsTooltipController.test.ts tests/unit/features/settings/SettingsPopoverController.test.ts
```

Expected: fail because both controllers do not exist yet.

- [ ] **Step 4: Implement the minimal tooltip controller**

Create `src/features/settings/SettingsTooltipController.ts` with:

```ts
const TOOLTIP_TRIGGER_SELECTOR = '[data-settings-tooltip]:not([data-settings-tooltip=""])';
const VIEWPORT_MARGIN_PX = 12;
const TOOLTIP_GAP_PX = 12;
const TOOLTIP_ARROW_SIZE_PX = 8;
const TOOLTIP_ARROW_MIN_INSET_PX = 10;

type SettingsTooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

const controllers = new WeakMap<Document, SettingsTooltipController>();

export class SettingsTooltipController {
  private activeTrigger: HTMLElement | null = null;
  private bubbleEl: HTMLElement | null = null;
  private layerEl: HTMLElement | null = null;
  private readonly view: Window | null;

  private constructor(private readonly document: Document) {
    this.view = document.defaultView;
    document.addEventListener('mouseover', this.handleMouseOver);
    document.addEventListener('mouseout', this.handleMouseOut);
    document.addEventListener('focusin', this.handleFocusIn);
    document.addEventListener('focusout', this.handleFocusOut);
    this.view?.addEventListener('resize', this.handleViewportChange, { passive: true });
    this.view?.addEventListener('scroll', this.handleViewportChange, { capture: true, passive: true });
  }

  static ensureForDocument(document: Document): SettingsTooltipController {
    const existing = controllers.get(document);
    if (existing) {
      return existing;
    }
    const controller = new SettingsTooltipController(document);
    controllers.set(document, controller);
    return controller;
  }

  destroy(): void {
    this.hide();
    this.document.removeEventListener('mouseover', this.handleMouseOver);
    this.document.removeEventListener('mouseout', this.handleMouseOut);
    this.document.removeEventListener('focusin', this.handleFocusIn);
    this.document.removeEventListener('focusout', this.handleFocusOut);
    this.view?.removeEventListener('resize', this.handleViewportChange);
    this.view?.removeEventListener('scroll', this.handleViewportChange, true);
    controllers.delete(this.document);
  }

  private readonly handleFocusIn = (event: FocusEvent): void => {
    const trigger = this.resolveTrigger(event.target);
    if (trigger) this.show(trigger);
  };

  private readonly handleFocusOut = (event: FocusEvent): void => {
    const trigger = this.resolveTrigger(event.target);
    if (trigger && trigger === this.activeTrigger) this.hide();
  };

  private readonly handleMouseOver = (event: MouseEvent): void => {
    const trigger = this.resolveTrigger(event.target);
    if (trigger) this.show(trigger);
  };

  private readonly handleMouseOut = (event: MouseEvent): void => {
    const trigger = this.resolveTrigger(event.target);
    if (trigger && trigger === this.activeTrigger) this.hide();
  };

  private readonly handleViewportChange = (): void => {
    if (!this.activeTrigger?.isConnected) {
      this.hide();
      return;
    }
    this.position();
  };

  private resolveTrigger(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) {
      return null;
    }
    const trigger = target.closest<HTMLElement>(TOOLTIP_TRIGGER_SELECTOR);
    return trigger?.ownerDocument === this.document ? trigger : null;
  }

  private show(trigger: HTMLElement): void {
    const label = trigger.dataset.settingsTooltip?.trim();
    if (!label) {
      this.hide();
      return;
    }
    this.activeTrigger = trigger;
    this.ensureLayer().querySelector<HTMLElement>('.opencodian-settings-tooltip-bubble')!.textContent = label;
    this.position();
  }

  private hide(): void {
    this.activeTrigger = null;
    this.layerEl?.remove();
    this.layerEl = null;
    this.bubbleEl = null;
  }
}
```

Keep the rest of the file aligned with `src/shared/TooltipLayerController.ts`: copy the viewport clamp logic instead of inventing a new geometry algorithm, but keep settings-local selector/class names so settings overlays stay isolated from chat overlays.

- [ ] **Step 5: Implement the minimal popover controller**

Create `src/features/settings/SettingsPopoverController.ts` with:

```ts
const VIEWPORT_MARGIN_PX = 12;
const POPOVER_GAP_PX = 8;

type SettingsPopoverPlacement = 'bottom-start' | 'top-start';

interface SettingsPopoverDisplayOptions {
  anchorEl: HTMLElement;
  popoverEl: HTMLElement;
  matchAnchorWidth?: boolean;
  preferredPlacement?: SettingsPopoverPlacement;
}

const controllers = new WeakMap<Document, SettingsPopoverController>();

export class SettingsPopoverController {
  private activeAnchorEl: HTMLElement | null = null;
  private activePopoverEl: HTMLElement | null = null;
  private readonly view: Window | null;

  private constructor(private readonly document: Document) {
    this.view = document.defaultView;
    this.view?.addEventListener('resize', this.handleViewportChange, { passive: true });
    this.view?.addEventListener('scroll', this.handleViewportChange, { capture: true, passive: true });
  }

  static ensureForDocument(document: Document): SettingsPopoverController {
    const existing = controllers.get(document);
    if (existing) {
      return existing;
    }
    const controller = new SettingsPopoverController(document);
    controllers.set(document, controller);
    return controller;
  }

  destroy(): void {
    this.hide();
    this.view?.removeEventListener('resize', this.handleViewportChange);
    this.view?.removeEventListener('scroll', this.handleViewportChange, true);
    controllers.delete(this.document);
  }

  show(options: SettingsPopoverDisplayOptions): void {
    const { anchorEl, popoverEl, matchAnchorWidth = true, preferredPlacement = 'bottom-start' } = options;
    this.activeAnchorEl = anchorEl;
    this.activePopoverEl = popoverEl;
    if (popoverEl.parentElement !== this.document.body) {
      this.document.body.appendChild(popoverEl);
    }
    popoverEl.hidden = false;
    popoverEl.style.position = 'fixed';
    popoverEl.style.zIndex = '2280';
    if (matchAnchorWidth) {
      popoverEl.style.minWidth = `${Math.round(anchorEl.getBoundingClientRect().width)}px`;
    }
    this.position(preferredPlacement);
  }

  hide(popoverEl?: HTMLElement): void {
    if (popoverEl && popoverEl !== this.activePopoverEl) {
      return;
    }
    this.activePopoverEl?.setAttribute('hidden', 'true');
    this.activeAnchorEl = null;
    this.activePopoverEl = null;
  }

  private readonly handleViewportChange = (): void => {
    if (!this.activeAnchorEl?.isConnected || !this.activePopoverEl?.isConnected) {
      this.hide();
      return;
    }
    this.position(this.activePopoverEl.dataset.placement === 'top-start' ? 'top-start' : 'bottom-start');
  };
}
```

Fill in the body of `position()` so it measures the active anchor/popover rects, flips from `bottom-start` to `top-start` when the viewport bottom overflows, clamps `left` within the viewport margin, and writes `data-placement`, `style.left`, and `style.top` on the active popover element.

- [ ] **Step 6: Re-run the focused tests**

Run:

```bash
npm test -- --runInBand tests/unit/features/settings/SettingsTooltipController.test.ts tests/unit/features/settings/SettingsPopoverController.test.ts
```

Expected: pass.

- [ ] **Step 7: Hand the diff back to Codex review**

Return:

```text
Changed files
Focused test result
Any API naming or geometry tradeoff you had to make
```

## Task 2: Migrate Search History Popover To The Shared Settings Popover Owner

**Files:**
- Modify: `src/features/settings/searchInputEnhancer.ts`
- Create: `tests/unit/features/settings/searchInputEnhancer.test.ts`
- Modify: `docs/modules/features/settings/searchInputEnhancer.md`
- Modify: `src/style/modals/config-editor-modal.css`

- [ ] **Step 1: Write the failing search-input overlay test**

Create `tests/unit/features/settings/searchInputEnhancer.test.ts` with:

```ts
import { enhanceSearchInput } from '../../../../src/features/settings/searchInputEnhancer';
import { setLocale } from '../../../../src/i18n';

describe('searchInputEnhancer', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
    window.localStorage.clear();
  });

  it('renders the recent-history popover in document.body and removes it on destroy', () => {
    const containerEl = document.createElement('div');
    const inputEl = document.createElement('input');
    containerEl.appendChild(inputEl);
    document.body.appendChild(containerEl);

    window.localStorage.setItem(
      'opencodian:settings-search-history:test-history',
      JSON.stringify(['prettier', 'biome']),
    );

    const handle = enhanceSearchInput({
      historyKey: 'test-history',
      inputEl,
      containerEl,
    });

    inputEl.dispatchEvent(new FocusEvent('focus'));

    const popover = document.body.querySelector<HTMLElement>('.opencodian-settings-search-history-popover');
    expect(popover).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-settings-search-history-popover')).toBeNull();

    handle.destroy();
    expect(document.body.querySelector('.opencodian-settings-search-history-popover')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```bash
npm test -- --runInBand tests/unit/features/settings/searchInputEnhancer.test.ts
```

Expected: fail because the history popover still mounts inside `containerEl`.

- [ ] **Step 3: Move `searchInputEnhancer` onto `SettingsPopoverController`**

Update `src/features/settings/searchInputEnhancer.ts` like this:

```ts
import { SettingsPopoverController } from './SettingsPopoverController';

export function enhanceSearchInput(options: SearchInputEnhancerOptions): SearchInputEnhancerHandle {
  const { historyKey, inputEl, containerEl, onClear } = options;
  const document = inputEl.ownerDocument;
  const popoverController = SettingsPopoverController.ensureForDocument(inputEl.ownerDocument);
  const historyPopoverEl = document.createElement('div');
  historyPopoverEl.className = 'opencodian-settings-search-history-popover is-hidden';
  historyPopoverEl.setAttribute('aria-label', t('settings.search.recent'));
  const historyListEl = historyPopoverEl.createDiv({
    cls: 'opencodian-settings-search-history-list',
  });
  inputEl.ownerDocument.body.appendChild(historyPopoverEl);

  const hideHistoryPopover = () => {
    historyPopoverEl.toggleClass('is-hidden', true);
    popoverController.hide(historyPopoverEl);
  };

  const showHistoryPopover = () => {
    historyPopoverEl.toggleClass('is-hidden', false);
    popoverController.show({
      anchorEl: inputEl,
      popoverEl: historyPopoverEl,
      matchAnchorWidth: true,
      preferredPlacement: 'bottom-start',
    });
  };
```

Then update the existing `renderHistory()` branches so `shouldShow === false` calls `hideHistoryPopover()` and the visible branch calls `showHistoryPopover()` after the list items are rendered.

- [ ] **Step 4: Add the settings-local popover CSS contract**

Append to `src/style/modals/config-editor-modal.css`:

```css
.opencodian-settings-search-history-popover {
  position: fixed;
  z-index: 2280;
  max-width: min(320px, calc(100vw - 24px));
}

.opencodian-settings-search-history-popover.is-hidden {
  display: none;
}
```

Keep the existing visual styling rules; only remove assumptions that the popover lives inside the search-field container.

- [ ] **Step 5: Re-run the focused test**

Run:

```bash
npm test -- --runInBand tests/unit/features/settings/searchInputEnhancer.test.ts
```

Expected: pass.

- [ ] **Step 6: Update the module doc**

Update `docs/modules/features/settings/searchInputEnhancer.md` so the “UI 增强” section explicitly says the recent-history popover is now re-parented to `document.body` via `SettingsPopoverController`, while the search history state and debounce chain stay inside `searchInputEnhancer.ts`.

- [ ] **Step 7: Hand the diff back to Codex review**

Return the changed files and the focused test output. Do not continue into formatter migration yet.

## Task 3: Migrate Formatter And LSP Search Suggestion Popovers

**Files:**
- Modify: `src/features/settings/SettingsFormatterSection.ts`
- Modify: `tests/unit/features/settings/SettingsFormatterSection.test.ts`
- Modify: `src/style/modals/config-editor-modal.css`
- Modify: `docs/modules/features/settings/SettingsFormatterSection.md`

- [ ] **Step 1: Add failing formatter popover overlay tests**

Extend `tests/unit/features/settings/SettingsFormatterSection.test.ts` with:

```ts
it('renders the builtin formatter suggestion popover in a body-level overlay', async () => {
  const { plugin } = createPlugin({
    formatterConfig: {},
    runtimeStatus: [],
  });
  const section = new SettingsFormatterSection({
    plugin,
    createSectionHeading,
    requestDisplayRefresh: displayRefresh,
  });
  const containerEl = document.createElement('div');
  document.body.appendChild(containerEl);

  section.attachTabbed(containerEl, 'config');
  await flushPromises();

  const inputEl = getBuiltinSearchInput(containerEl, 'formatter');
  inputEl.value = 'pre';
  inputEl.dispatchEvent(new Event('input'));

  const popoverEl = document.body.querySelector<HTMLElement>('.opencodian-builtin-list-search-popover');
  expect(popoverEl).not.toBeNull();
  expect(containerEl.querySelector('.opencodian-builtin-list-search-field > .opencodian-builtin-list-search-popover')).toBeNull();
});

it('renders the runtime formatter search suggestion popover in a body-level overlay', async () => {
  const { plugin } = createPlugin({
    formatterConfig: {},
    runtimeStatus: [{ name: 'prettier', command: ['prettier'], extensions: ['.ts'] }],
  });
  const section = new SettingsFormatterSection({
    plugin,
    createSectionHeading,
    requestDisplayRefresh: displayRefresh,
  });
  const containerEl = document.createElement('div');
  document.body.appendChild(containerEl);

  section.attachTabbed(containerEl, 'overview');
  await flushPromises();

  const inputEl = containerEl.querySelector<HTMLInputElement>('[data-search-scope="runtime-formatter"]');
  expect(inputEl).not.toBeNull();
  inputEl!.value = 'pre';
  inputEl!.dispatchEvent(new Event('input'));

  const popoverEl = document.body.querySelector<HTMLElement>('.opencodian-builtin-list-search-popover');
  expect(popoverEl).not.toBeNull();
  expect(containerEl.querySelector('.opencodian-formatter-runtime-toolbar .opencodian-builtin-list-search-popover')).toBeNull();
});
```

- [ ] **Step 2: Run the focused formatter tests and confirm failure**

Run:

```bash
npm test -- --runInBand tests/unit/features/settings/SettingsFormatterSection.test.ts
```

Expected: the new overlay tests fail because the popovers still mount inside their local search-field containers.

- [ ] **Step 3: Introduce one section-local popover helper and reuse it in all three search surfaces**

In `src/features/settings/SettingsFormatterSection.ts`, add a settings-local helper on the class:

```ts
private showSearchPopover(inputEl: HTMLInputElement, popoverEl: HTMLElement): void {
  SettingsPopoverController.ensureForDocument(inputEl.ownerDocument).show({
    anchorEl: inputEl,
    popoverEl,
    matchAnchorWidth: true,
    preferredPlacement: 'bottom-start',
  });
}

private hideSearchPopover(inputEl: HTMLInputElement, popoverEl: HTMLElement): void {
  SettingsPopoverController.ensureForDocument(inputEl.ownerDocument).hide(popoverEl);
  inputEl.setAttribute('aria-expanded', 'false');
  inputEl.removeAttribute('aria-activedescendant');
}
```

Then replace the inline `popoverEl.hidden = false` / `popoverEl.hidden = true` branches in:

- the runtime formatter overview search popover block near `renderOverviewTabbed()`
- the builtin formatter search block inside `renderBuiltinSearchController(..., 'formatter')`
- the builtin LSP search block inside `renderBuiltinSearchController(..., 'lsp')`

with calls to `showSearchPopover()` and `hideSearchPopover()`.

- [ ] **Step 4: Keep the popover DOM mounted and move it with the controller**

In both popover creation sites, replace:

```ts
const popoverEl = fieldEl.createDiv({
  cls: 'opencodian-builtin-list-search-popover',
  attr: { role: 'listbox' },
});
```

with:

```ts
const document = inputEl.ownerDocument;
const popoverEl = document.createElement('div');
popoverEl.className = 'opencodian-builtin-list-search-popover';
popoverEl.setAttribute('role', 'listbox');
popoverEl.hidden = true;
inputEl.ownerDocument.body.appendChild(popoverEl);
```

and make sure the section `dispose()` path or any local destroy path removes these body-level popovers when the section detaches.

- [ ] **Step 5: Tighten the CSS contract for body-level builtin search popovers**

Update `src/style/modals/config-editor-modal.css` so `.opencodian-builtin-list-search-popover` no longer assumes a local absolute positioning context:

```css
.opencodian-builtin-list-search-popover {
  position: fixed;
  z-index: 2280;
  max-height: min(320px, calc(100vh - 24px));
  overflow: auto;
}

.opencodian-builtin-list-search-popover[hidden] {
  display: none;
}
```

Keep the current option row visual design, hover state, and typography unchanged.

- [ ] **Step 6: Re-run the formatter tests**

Run:

```bash
npm test -- --runInBand tests/unit/features/settings/SettingsFormatterSection.test.ts
```

Expected: pass.

- [ ] **Step 7: Update the formatter module doc**

Update `docs/modules/features/settings/SettingsFormatterSection.md` so the builtin formatter/LSP suggestion popovers and the runtime formatter search popover are described as body-level overlays managed by `SettingsPopoverController`, while the filter/suggestion ranking logic remains owned by `SettingsFormatterSection`.

- [ ] **Step 8: Hand the diff back to Codex review**

Return the changed files and the focused test output.

## Task 4: Remove Repo-Controlled Native `title` In Settings Surfaces

**Files:**
- Create: `tests/unit/features/settings/settingsOverlayContract.test.ts`
- Modify: `src/features/settings/settingsStyleControls.ts`
- Modify: `src/features/settings/SettingsStyleBackgroundSection.ts`
- Modify: `src/features/settings/SettingsModelIconCacheManager.ts`
- Modify: `src/features/settings/SlashCommandCatalogRenderer.ts`
- Modify: `src/features/settings/SettingsCapabilityLabSection.ts`
- Modify: `tests/unit/features/settings/SettingsCapabilityLabSection.test.ts`
- Modify: `src/style/components/model-selector.css`
- Modify: `docs/modules/features/settings/SettingsCapabilityLabSection.md`

- [ ] **Step 1: Add a file-contract test for forbidden native title usage**

Create `tests/unit/features/settings/settingsOverlayContract.test.ts` with:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const files = [
  'src/features/settings/settingsStyleControls.ts',
  'src/features/settings/SettingsStyleBackgroundSection.ts',
  'src/features/settings/SettingsModelIconCacheManager.ts',
  'src/features/settings/SlashCommandCatalogRenderer.ts',
  'src/features/settings/SettingsCapabilityLabSection.ts',
];

describe('settings overlay contract', () => {
  it('does not keep repo-controlled native title usage in settings modules', () => {
    for (const relativePath of files) {
      const source = readFileSync(join(process.cwd(), relativePath), 'utf8');
      expect(source).not.toMatch(/setAttribute\(['"]title['"]/);
      expect(source).not.toMatch(/\.title\s*=/);
    }
  });
});
```

- [ ] **Step 2: Add the failing capability-lab detail-surface test**

Extend `tests/unit/features/settings/SettingsCapabilityLabSection.test.ts` with:

```ts
it('shows selected history-session metadata in a fixed detail region instead of option.title', async () => {
  const adapter = {
    listSessions: jest.fn().mockResolvedValue([
      {
        sessionId: 'abc12345-session',
        summary: 'History summary',
        lastModified: new Date('2026-06-05T10:20:30.000Z').getTime(),
      },
    ]),
  };
  const containerEl = document.createElement('div');
  const section = new SettingsCapabilityLabSection({
    plugin: createMockPlugin(adapter),
    createSectionHeading: createHeadingStub(),
  });

  section.attachTabbed(containerEl, 'capability-lab');
  await flushUi();

  const refreshButton = Array.from(containerEl.querySelectorAll<HTMLButtonElement>('button'))
    .find((button) => button.textContent === 'Refresh Sessions');
  refreshButton?.click();
  await flushUi();

  const sessionSelect = containerEl.querySelector<HTMLSelectElement>('[data-diagnostic-session-select="history"]');
  const detailEl = containerEl.querySelector<HTMLElement>('[data-capability-history-session-detail]');

  expect(sessionSelect?.options[1]?.title ?? '').toBe('');
  sessionSelect!.value = 'abc12345-session';
  sessionSelect!.dispatchEvent(new Event('change'));

  expect(detailEl?.textContent).toContain('History summary');
  expect(detailEl?.textContent).toContain('2026-06-05T10:20:30.000Z');
});
```

- [ ] **Step 3: Run the focused tests and confirm failure**

Run:

```bash
npm test -- --runInBand tests/unit/features/settings/settingsOverlayContract.test.ts tests/unit/features/settings/SettingsCapabilityLabSection.test.ts
```

Expected: fail because `title` is still present in the targeted settings modules and the capability-lab detail region does not exist yet.

- [ ] **Step 4: Replace style/settings native titles with shared tooltip triggers**

In the targeted modules, remove native `title` writes and replace them with `data-settings-tooltip` plus a settings-local controller bootstrap:

```ts
import { SettingsTooltipController } from './SettingsTooltipController';

SettingsTooltipController.ensureForDocument(resetBtn.ownerDocument);
resetBtn.dataset.settingsTooltip = t('settings.style.resetSingle.tooltip');

SettingsTooltipController.ensureForDocument(previewBtn.ownerDocument);
previewBtn.dataset.settingsTooltip = followsTheme
  ? t('settings.style.colorPicker.followThemeValue')
  : normalizedValue;
valueEl.dataset.settingsTooltip = normalizedValue || resetValue;

SettingsTooltipController.ensureForDocument(previewEl.ownerDocument);
previewEl.dataset.settingsTooltip = t('settings.style.background.preview.dragHint');

SettingsTooltipController.ensureForDocument(toggleWrap.ownerDocument);
toggleWrap.dataset.settingsTooltip = stateLabel;
```

Apply that pattern in:

- `src/features/settings/settingsStyleControls.ts`
- `src/features/settings/SettingsStyleBackgroundSection.ts`
- `src/features/settings/SlashCommandCatalogRenderer.ts`
- `src/features/settings/SettingsModelIconCacheManager.ts`

For provider icons, keep `imgEl.alt = label`, but drop `imgEl.title = label` and set the tooltip dataset on either `imgEl` or its stable wrapper element before appending it.

- [ ] **Step 5: Replace capability-lab `<option title>` metadata with a fixed adjacent detail region**

In `src/features/settings/SettingsCapabilityLabSection.ts`, replace:

```ts
opt.title = `Session: ${session.sessionId}\nSummary: ${session.summary}\nModified: ${new Date(session.lastModified).toISOString()}`;
```

with a detail surface:

```ts
const sessionDetailEl = controlsEl.createDiv({
  cls: 'opencodian-capability-lab-session-detail',
  attr: { 'data-capability-history-session-detail': 'true' },
});

const renderSessionDetail = (session: { sessionId: string; summary: string; lastModified: number } | null) => {
  sessionDetailEl.empty();
  if (!session) {
    sessionDetailEl.setText('No session selected.');
    return;
  }
  sessionDetailEl.createDiv({ text: `Session: ${session.sessionId}` });
  sessionDetailEl.createDiv({ text: `Summary: ${session.summary}` });
  sessionDetailEl.createDiv({ text: `Modified: ${new Date(session.lastModified).toISOString()}` });
};
```

Store the loaded sessions in a local `Map<string, SessionLike>` so the existing `change` handler on `sessionSelect` can call `renderSessionDetail(selectedSession)` without refetching.

- [ ] **Step 6: Add the settings tooltip CSS contract**

Append to `src/style/components/model-selector.css`:

```css
.opencodian-settings-tooltip-layer {
  position: fixed;
  z-index: 2300;
  pointer-events: none;
}

.opencodian-settings-tooltip-bubble {
  max-width: min(240px, calc(100vw - 32px));
  white-space: pre-wrap;
  overflow-wrap: break-word;
}

.opencodian-capability-lab-session-detail {
  margin-top: 8px;
  padding: 10px 12px;
  border: 1px solid var(--background-modifier-border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--background-secondary) 72%, transparent);
}
```

- [ ] **Step 7: Re-run the focused tests**

Run:

```bash
npm test -- --runInBand tests/unit/features/settings/settingsOverlayContract.test.ts tests/unit/features/settings/SettingsCapabilityLabSection.test.ts
```

Expected: pass.

- [ ] **Step 8: Hand the diff back to Codex review**

Return the changed files and the focused test output.

## Task 5: Align Quick-Nav Contract, Docs, And CSS Regression Coverage

**Files:**
- Modify: `src/features/settings/SettingsSectionCoordinator.ts`
- Modify: `tests/unit/features/settings/OpenCodianSettings.test.ts`
- Modify: `docs/modules/features/settings/SettingsSectionCoordinator.md`
- Create: `docs/modules/features/settings/SettingsTooltipController.md`
- Create: `docs/modules/features/settings/SettingsPopoverController.md`
- Modify: `docs/modules/style/components/model-selector.md`

- [ ] **Step 1: Add a CSS contract regression for the new settings overlay layers**

Extend `tests/unit/features/settings/OpenCodianSettings.test.ts` with:

```ts
it('keeps the quick-nav tooltip below the shared settings tooltip and popover layers', () => {
  const overlayCss = readFileSync(
    join(process.cwd(), 'src/style/components/model-selector.css'),
    'utf8',
  );
  const popoverCss = readFileSync(
    join(process.cwd(), 'src/style/modals/config-editor-modal.css'),
    'utf8',
  );

  expect(overlayCss).toMatch(/\.opencodian-settings-quick-nav-tooltip-layer\s*\{[\s\S]*z-index:\s*2260;/);
  expect(overlayCss).toMatch(/\.opencodian-settings-tooltip-layer\s*\{[\s\S]*z-index:\s*2300;/);
  expect(popoverCss).toMatch(/\.opencodian-builtin-list-search-popover\s*\{[\s\S]*z-index:\s*2280;/);
});
```

- [ ] **Step 2: Update the quick-nav owner only where the new contract requires it**

In `src/features/settings/SettingsSectionCoordinator.ts`, keep the existing owner, but align the geometry constants with the new settings overlay contract:

```ts
const QUICK_NAV_TOOLTIP_MARGIN_PX = 12;
const QUICK_NAV_TOOLTIP_MAX_WIDTH_PX = 240;
const QUICK_NAV_TOOLTIP_Z_INDEX = 2260;
```

Use the same viewport clamp style as the new controllers:

```ts
const left = Math.min(
  Math.max(centerX, QUICK_NAV_TOOLTIP_MARGIN_PX + halfWidth),
  Math.max(
    QUICK_NAV_TOOLTIP_MARGIN_PX + halfWidth,
    viewportWidth - QUICK_NAV_TOOLTIP_MARGIN_PX - halfWidth,
  ),
);
```

and update the CSS rule so the quick-nav layer uses the lower z-index from the new stacking gradient.

- [ ] **Step 3: Add the new module docs**

Create `docs/modules/features/settings/SettingsTooltipController.md` with:

```md
# SettingsTooltipController

> **源码**: `src/features/settings/SettingsTooltipController.ts`
> **状态**: [REVIEW]

## 概述

Settings-local passive tooltip owner. It listens for `[data-settings-tooltip]` triggers, mounts a body-level fixed overlay, and keeps settings tooltips separate from the chat/shared tooltip layer.
```

Create `docs/modules/features/settings/SettingsPopoverController.md` with:

```md
# SettingsPopoverController

> **源码**: `src/features/settings/SettingsPopoverController.ts`
> **状态**: [REVIEW]

## 概述

Settings-local interactive popover owner. It re-parents active suggestion/history popovers to `document.body`, keeps anchored width/placement logic centralized, and prevents sticky toolbars or scroll containers from clipping the content.
```

- [ ] **Step 4: Update the existing docs**

Update:

- `docs/modules/features/settings/SettingsSectionCoordinator.md`
- `docs/modules/style/components/model-selector.md`
- `docs/modules/features/settings/SettingsCapabilityLabSection.md`

to describe:

- the new tooltip/popper stacking gradient
- quick-nav staying a separate owner in this slice
- capability-lab session metadata moving from `<option title>` to a visible detail block

- [ ] **Step 5: Run the focused settings contract tests**

Run:

```bash
npm test -- --runInBand tests/unit/features/settings/OpenCodianSettings.test.ts tests/unit/features/settings/SettingsTooltipController.test.ts tests/unit/features/settings/SettingsPopoverController.test.ts
```

Expected: pass.

- [ ] **Step 6: Hand the diff back to Codex review**

Return the changed files and the focused test output.

## Task 6: Full Verification, Build, Deploy, And Real Obsidian UI QA

**Files:**
- Modify only if verification reveals a bug in one of the files above
- Update status docs only if visual QA uncovers noteworthy follow-up risk

- [ ] **Step 1: Run the full verification gate**

Run:

```bash
npm run verify
```

Expected: pass with lint, typecheck, tests, build, module docs, and graphify checks all green.

- [ ] **Step 2: Run a clean production build**

Run:

```bash
npm run build
```

Expected: pass and print the new `BUILD_ID`.

- [ ] **Step 3: Deploy to the Test Vault sequentially**

Run the copy steps sequentially, not chained:

```bash
cp dist/main.js /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js
cp dist/manifest.json /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/manifest.json
cp dist/styles.css /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/styles.css
```

If `dist/assets/` changed, also run:

```bash
cp -R dist/assets /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/assets
```

If `dist/node_modules/@anthropic-ai/claude-agent-sdk-<platform>/` exists, copy that directory into the same Test Vault plugin directory as well.

- [ ] **Step 4: Verify the deployed BUILD_ID**

Run:

```bash
rg -n "BUILD_ID" /Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/main.js
```

Expected: the deployed file contains the same `BUILD_ID` printed by the build step.

- [ ] **Step 5: Perform real Obsidian UI QA**

Primary path:

- Use Obsidian Plugin Autodebug if it is available in the executing environment.
- Reload the Test Vault plugin.
- Open Settings > OpenCodian.
- Inspect at least:
  - classic quick-nav tooltip
  - settings search history popover
  - formatter builtin search suggestions
  - formatter runtime search suggestions
  - color value tooltip surfaces
  - slash command visibility toggle tooltip
  - capability-lab session detail block

Fallback path if Obsidian Plugin Autodebug is unavailable:

- Use Codex `Computer Use` to open local Obsidian.
- Reload the plugin in the Test Vault.
- Navigate to the same settings surfaces.
- Capture screenshots and note any clipping, overlap, hidden focus ring, or truncated popover cases.

- [ ] **Step 6: Fix any visual defects discovered in QA**

If QA finds overlap or clipping, apply the minimal correction in the existing overlay owners or CSS contract and re-run the relevant focused tests before repeating the full gate:

```bash
npm test -- --runInBand tests/unit/features/settings/SettingsFormatterSection.test.ts tests/unit/features/settings/OpenCodianSettings.test.ts tests/unit/features/settings/searchInputEnhancer.test.ts tests/unit/features/settings/SettingsCapabilityLabSection.test.ts
```

- [ ] **Step 7: Return the final implementation report to Codex**

Return:

```text
Changed files
Focused and full verification output
Build ID
Deployment result
Visual QA result with screenshot/autodebug evidence
Any remaining risk or follow-up item
```
