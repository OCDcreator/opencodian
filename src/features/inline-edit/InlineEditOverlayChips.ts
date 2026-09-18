/**
 * InlineEditOverlayChips — the model/effort chip and dropdown menu surface of
 * the floating bar.
 *
 * Extracted from `InlineEditInputOverlay` so the bar stays a skeleton: it
 * owns the menu container, placement, and Escape ordering, while this module
 * owns chip construction, chip syncing, and menu row rendering — the same
 * split the preset menu and context UI already use.
 */

import { setIcon } from 'obsidian';

import type { AgentBackendKind } from '../../core/types/chat';
import { t } from '../../i18n';
import type { InlineEditOverlayChipState } from './InlineEditInputOverlay';
import {
  choicesToMenuItems,
  effortMenuIcon,
  type InlineEditOverlayMenuItem,
} from './InlineEditOverlayPrimitives';
import type { InlineEditChoice, InlineEditHostAdapter } from './InlineEditTypes';

/** Provider-icon factory the chips need for the model glyph. */
export interface InlineEditOverlayChipCallbacks {
  createProviderIcon?(providerId: string, size: number): HTMLElement | null;
  onPickModel(id: string | null): void;
  onPickEffort(id: string | null): void;
}

/** Everything the chip-state helpers need from one active edit. */
export interface InlineEditChipStateHost {
  readonly adapter: InlineEditHostAdapter;
  readonly modelChoices: readonly InlineEditChoice[] | null;
  readonly sessionStarted: boolean;
}

/**
 * Provider id used to resolve the model chip / menu row icon. OpenCode and pi
 * refs carry `provider/model`; bare claude-code and codex ids map to the
 * provider their models come from. Anything else renders a generic glyph.
 */
export function inferInlineEditModelProvider(ref: string, kind: AgentBackendKind): string | null {
  const slash = ref.indexOf('/');
  if (slash > 0) return ref.slice(0, slash);
  if (kind === 'claude-code') return 'anthropic';
  if (kind === 'codex') return 'openai';
  return null;
}

/** Chip state for the model picker (label, icon, loading, menu rows). */
export function inlineEditModelChipState(host: InlineEditChipStateHost): InlineEditOverlayChipState {
  const selection = host.adapter.describeModelSelection();
  const activeId = selection.source === 'default' ? null : selection.label;
  const kind = host.adapter.kind;
  return {
    label: activeId ?? '',
    iconProvider: activeId ? inferInlineEditModelProvider(activeId, kind) : null,
    loading: host.adapter.listModels != null && host.modelChoices === null,
    disabled: host.sessionStarted,
    items: choicesToMenuItems(host.modelChoices ?? [], activeId).map((item) => ({
      ...item,
      iconProvider: item.id === null ? null : inferInlineEditModelProvider(item.id, kind),
    })),
  };
}

/** Chip state for the effort picker; `null` hides the chip. */
export function inlineEditEffortChipState(host: InlineEditChipStateHost): InlineEditOverlayChipState | null {
  const efforts = host.adapter.listEfforts?.() ?? null;
  if (!efforts) return null;
  const current = host.adapter.getEffort();
  return {
    label: current ?? '',
    disabled: host.sessionStarted,
    items: choicesToMenuItems(efforts, current),
  };
}

export interface InlineEditChipPickCallbacks {
  notify(message: string): void;
  rerender(): void;
}

/** Persist a model override picked from the chip menu. */
export async function pickInlineEditModel(
  host: InlineEditChipStateHost,
  callbacks: InlineEditChipPickCallbacks,
  id: string | null,
): Promise<void> {
  if (host.sessionStarted) return;
  try {
    await host.adapter.setModelOverride?.(id);
  } catch (error) {
    callbacks.notify(error instanceof Error ? error.message : String(error));
  }
  callbacks.rerender();
}

/** Persist an effort override picked from the chip menu. */
export async function pickInlineEditEffort(
  host: InlineEditChipStateHost,
  callbacks: InlineEditChipPickCallbacks,
  id: string | null,
): Promise<void> {
  if (host.sessionStarted) return;
  try {
    await host.adapter.setEffortOverride?.(id);
  } catch (error) {
    callbacks.notify(error instanceof Error ? error.message : String(error));
  }
  callbacks.rerender();
}

/** Build one config chip button (icon prefix + value + chevron). */
export function buildInlineEditConfigChip(
  bar: HTMLElement,
  kind: 'model' | 'effort',
  onToggle: () => void,
): void {
  const chip = bar.createEl('button', {
    cls: `opencodian-inline-edit-chip opencodian-inline-edit-chip-${kind}`,
    attr: { type: 'button' },
  });
  // Icon slot is filled by syncInlineEditConfigChip: provider icon for the
  // model chip, a lucide glyph for effort. The full name lives on the tooltip.
  chip.createSpan({ cls: 'opencodian-inline-edit-chip-prefix' });
  chip.createSpan({ cls: 'opencodian-inline-edit-chip-value' });
  const chevron = chip.createSpan({ cls: 'opencodian-inline-edit-chip-chevron' });
  setIcon(chevron, 'chevron-down');
  chip.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onToggle();
  });
}

/** Bring one chip in line with a render pass; hides it when state is null. */
export function syncInlineEditConfigChip(
  panel: HTMLElement,
  kind: 'model' | 'effort',
  state: InlineEditOverlayChipState | null,
  callbacks: Pick<InlineEditOverlayChipCallbacks, 'createProviderIcon'>,
): void {
  const chip = panel.querySelector<HTMLButtonElement>(`:scope .opencodian-inline-edit-chip-${kind}`);
  if (!chip) return;
  if (!state) {
    chip.style.display = 'none';
    chip.disabled = true;
    return;
  }
  chip.style.display = '';
  chip.disabled = state.disabled === true;
  const prefixText = t(kind === 'model' ? 'inlineEdit.bar.model' : 'inlineEdit.bar.effort');
  const valueText = state.loading
    ? t('inlineEdit.bar.loading')
    : state.label || t('inlineEdit.bar.default');

  const prefix = chip.querySelector<HTMLElement>(':scope > .opencodian-inline-edit-chip-prefix');
  if (prefix) {
    const provider = kind === 'model' ? state.iconProvider ?? null : null;
    const iconKey = provider ? `provider:${provider}` : `lucide:${kind}`;
    if (prefix.dataset.iconKey !== iconKey) {
      prefix.dataset.iconKey = iconKey;
      prefix.empty();
      const iconEl = provider ? callbacks.createProviderIcon?.(provider, 13) : null;
      if (iconEl) {
        iconEl.setAttribute('aria-hidden', 'true');
        prefix.appendChild(iconEl);
      } else {
        setIcon(prefix, kind === 'model' ? 'cpu' : 'brain');
      }
    }
  }

  // The effort chip keeps its label word visible — a bare "high" does not
  // read as a thinking-effort selector. The model chip stays icon + name.
  const value = chip.querySelector<HTMLElement>(':scope > .opencodian-inline-edit-chip-value');
  const displayText = kind === 'effort' ? `${prefixText} ${valueText}` : valueText;
  if (value && value.textContent !== displayText) value.textContent = displayText;

  const label = `${prefixText}: ${valueText}`;
  if (chip.title !== label) chip.title = label;
}

export interface InlineEditOverlayMenuRenderCallbacks extends InlineEditOverlayChipCallbacks {
  /** Close the owning menu container (overlay-side bookkeeping). */
  onClose(): void;
}

/** Bundle for `renderInlineEditConfigMenu` (keeps the parameter list flat). */
export interface InlineEditConfigMenuRender {
  readonly menu: HTMLElement;
  readonly kind: 'model' | 'effort';
  readonly chip: InlineEditOverlayChipState;
  readonly anchorChip: HTMLElement | null;
  readonly panel: HTMLElement | null;
}

/** Render the dropdown rows for one chip's menu into an existing container. */
export function renderInlineEditConfigMenu(
  render: InlineEditConfigMenuRender,
  callbacks: InlineEditOverlayMenuRenderCallbacks,
): void {
  const { menu, kind, chip, anchorChip, panel } = render;
  menu.empty();
  const clearLabel = kind === 'model' ? t('inlineEdit.bar.followChat') : t('inlineEdit.bar.effortDefault');
  const clearActive = !chip.label || chip.label === t('inlineEdit.bar.default');
  const renderEntry = (entry: InlineEditOverlayMenuItem): void => {
    const item = menu.createDiv({
      cls: `opencodian-inline-edit-menu-item${entry.active ? ' is-active' : ''}`,
    });
    const check = item.createSpan({ cls: 'opencodian-inline-edit-menu-item-check' });
    setIcon(check, 'check');
    // Every row carries a 13px icon slot so labels stay aligned: provider
    // brand icons for models, signal bars for effort levels, a glyph for
    // the "clear override" row.
    if (kind === 'model') {
      const iconEl = entry.id !== null && entry.iconProvider
        ? callbacks.createProviderIcon?.(entry.iconProvider, 13)
        : null;
      if (iconEl) {
        iconEl.classList.add('opencodian-inline-edit-menu-item-icon');
        iconEl.setAttribute('aria-hidden', 'true');
        item.appendChild(iconEl);
      } else {
        const glyph = item.createSpan({ cls: 'opencodian-inline-edit-menu-item-glyph' });
        setIcon(glyph, entry.id === null ? 'messages-square' : 'cpu');
      }
    } else {
      const glyph = item.createSpan({ cls: 'opencodian-inline-edit-menu-item-glyph' });
      setIcon(glyph, effortMenuIcon(entry.id));
    }
    item.createSpan({ cls: 'opencodian-inline-edit-menu-item-label', text: entry.label });
    item.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const id = entry.id;
      callbacks.onClose();
      if (kind === 'model') callbacks.onPickModel(id);
      else callbacks.onPickEffort(id);
    });
  };
  renderEntry({ id: null, label: clearLabel, active: clearActive });
  if (chip.items.length > 0) {
    menu.createDiv({ cls: 'opencodian-inline-edit-menu-separator' });
    for (const entry of chip.items) {
      renderEntry(entry);
    }
  }
  // Anchor the menu under its chip, clamped inside the panel.
  if (anchorChip && panel) {
    const chipRect = anchorChip.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const localLeft = chipRect.left - panelRect.left;
    menu.style.left = `${Math.max(0, localLeft)}px`;
  }
}

// -----------------------------------------------------------------------------
// Per-edit orchestration (extracted from InlineEditController)
// -----------------------------------------------------------------------------

/** The slice of one active edit the pick/load helpers need. */
export interface InlineEditPickEditHost {
  readonly adapter: InlineEditHostAdapter;
  modelChoices: readonly InlineEditChoice[] | null;
  readonly sessionStarted: boolean;
}

export interface InlineEditPickDeps {
  notify(message: string): void;
  rerender(): void;
}

/** Run one model pick for `edit` (persists the override, re-renders the bar). */
export async function runInlineEditModelPick(
  edit: InlineEditPickEditHost,
  deps: InlineEditPickDeps,
  id: string | null,
): Promise<void> {
  await pickInlineEditModel(
    { adapter: edit.adapter, modelChoices: edit.modelChoices, sessionStarted: edit.sessionStarted },
    { notify: deps.notify, rerender: deps.rerender },
    id,
  );
}

/** Run one effort pick for `edit`. */
export async function runInlineEditEffortPick(
  edit: InlineEditPickEditHost,
  deps: InlineEditPickDeps,
  id: string | null,
): Promise<void> {
  await pickInlineEditEffort(
    { adapter: edit.adapter, modelChoices: edit.modelChoices, sessionStarted: edit.sessionStarted },
    { notify: deps.notify, rerender: deps.rerender },
    id,
  );
}

/** Fetch the backend's model list for the picker (best effort). */
export async function loadInlineEditModelChoices(
  edit: InlineEditPickEditHost,
  deps: { rerender(): void },
): Promise<void> {
  const lister = edit.adapter.listModels;
  if (!lister) return;
  try {
    edit.modelChoices = await lister.call(edit.adapter) ?? [];
  } catch {
    edit.modelChoices = [];
  }
  deps.rerender();
}
