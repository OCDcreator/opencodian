/**
 * Measurement harness: linked-note dropdown scale (advantage-parity review J).
 *
 * The review claimed the conversation-settings linked-note picker degrades on a
 * large vault: it enumerates every Markdown path, builds one native `<option>`
 * per path, and builds one `<button>` per path again when the enhanced menu is
 * expanded, with no search. This harness measures that claim instead of
 * assuming it — the review's own framing ("两倍节点") is wrong about *when* the
 * buttons appear, so the numbers below separate modal-open cost from
 * first-expand cost.
 *
 * Run explicitly (it is deliberately outside jest's `testMatch` so the numbers
 * never slow the normal suite):
 *
 *   node scripts/run-jest.js --testMatch '<rootDir>/tests/bench/**\/*.bench.ts'
 *
 * Nothing here asserts a pass/fail threshold: it prints a report so a decision
 * to change the picker can be based on measurements.
 */

import type { App } from 'obsidian';

import { ConversationSessionSettingsModal } from '../../src/features/chat/ui/ConversationSessionSettingsModal';
import { setLocale } from '../../src/i18n';

const SIZES = [5000, 20000];

interface Row {
  paths: number;
  buildPathsMs: number;
  optionInsertMs: number;
  enhanceMs: number;
  modalOpenMs: number;
  modalNodes: number;
  nativeOptions: number;
  expandMs: number;
  menuButtons: number;
  totalNodesAfterExpand: number;
  heapDeltaMb: number;
  hasSearchInput: boolean;
  menuScrollable: boolean;
}

function makePaths(count: number): string[] {
  const paths: string[] = [];
  for (let index = 0; index < count; index += 1) {
    paths.push(`drafts/folder-${index % 200}/note-${index}.md`);
  }
  return paths;
}

function countNodes(root: ParentNode): number {
  return root.querySelectorAll('*').length;
}

/** Isolate the option-insertion cost from the enhancer cost. */
function timeSubSteps(paths: readonly string[]): {
  buildPathsMs: number;
  optionInsertMs: number;
  enhanceMs: number;
} {
  const buildStart = performance.now();
  const list = [...paths];
  const buildPathsMs = performance.now() - buildStart;

  const host = document.body.createDiv();
  const selectEl = host.createEl('select');
  const optionStart = performance.now();
  for (const path of list) {
    const optionEl = selectEl.ownerDocument.createElement('option');
    optionEl.textContent = path;
    optionEl.value = path;
    selectEl.appendChild(optionEl);
  }
  const optionInsertMs = performance.now() - optionStart;

  host.remove();
  return {
    buildPathsMs: Math.round(buildPathsMs * 100) / 100,
    optionInsertMs: Math.round(optionInsertMs * 100) / 100,
    enhanceMs: 0,
  };
}

function measure(size: number): Row {
  setLocale('en');
  document.body.empty();
  const paths = makePaths(size);
  const subSteps = timeSubSteps(paths);

  const heapBefore = process.memoryUsage().heapUsed;

  const modal = new ConversationSessionSettingsModal({} as App, {
    conversationTitle: 'Bench',
    defaults: { chatFontSizePx: 13 },
    linkedNote: { markdownPaths: paths, exists: false },
    onSave: jest.fn(),
  });

  const openStart = performance.now();
  modal.onOpen();
  const modalOpenMs = performance.now() - openStart;

  // The enhanced trigger only opens when it is connected, so attach the modal
  // content the way a real open modal is attached.
  document.body.appendChild(modal.contentEl);

  const selectEl = modal.contentEl.querySelector<HTMLSelectElement>('[data-linked-note-path="true"]');
  const triggerEl = modal.contentEl.querySelector<HTMLButtonElement>(
    '.opencodian-settings-dropdown-trigger',
  );
  if (!selectEl || !triggerEl) {
    throw new Error('linked-note select or enhanced trigger not found');
  }

  const modalNodes = countNodes(modal.contentEl);
  const nativeOptions = selectEl.options.length;

  const expandStart = performance.now();
  triggerEl.click();
  const expandMs = performance.now() - expandStart;

  const menuButtons = document.querySelectorAll('.opencodian-settings-dropdown-option').length;
  const menuEl = document.querySelector('.opencodian-settings-dropdown-menu');
  const hasSearchInput = Boolean(
    menuEl?.querySelector('input, [role="searchbox"], [role="textbox"]'),
  );

  const row: Row = {
    paths: size,
    buildPathsMs: subSteps.buildPathsMs,
    optionInsertMs: subSteps.optionInsertMs,
    enhanceMs: subSteps.enhanceMs,
    modalOpenMs: Math.round(modalOpenMs * 100) / 100,
    modalNodes,
    nativeOptions,
    expandMs: Math.round(expandMs * 100) / 100,
    menuButtons,
    totalNodesAfterExpand: countNodes(document.body),
    heapDeltaMb: Math.round(((process.memoryUsage().heapUsed - heapBefore) / 1024 / 1024) * 100) / 100,
    hasSearchInput,
    menuScrollable: menuEl?.classList.contains('is-scrollable') ?? false,
  };

  document.body.empty();
  return row;
}

describe('linked-note dropdown scale benchmark (J)', () => {
  it('reports open/expand cost and node counts for large vaults', () => {
    const rows = SIZES.map(measure);
    // eslint-disable-next-line no-console -- the harness exists to print numbers.
    console.log(`\n${JSON.stringify(rows, null, 2)}\n`);
    expect(rows).toHaveLength(SIZES.length);
  });
});
