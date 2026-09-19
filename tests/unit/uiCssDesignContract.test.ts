import * as fs from 'fs';
import * as path from 'path';

/**
 * CSS design contract for the flowtext-parity frontend repair pass.
 *
 * These are static assertions on the committed design system (DESIGN.md) and
 * the surfaces this pass touched. They pin the documented values the styles
 * rely on (DESIGN.md §3 Typography, §5 Modal Layout, §2/§4 rules) and assert
 * the absence of the impeccable bans (side-stripe accent borders, bounce
 * easing, undeclared UI font families, off-scale radii, hardcoded px label
 * sizes) so they cannot silently come back.
 */

const WT_ROOT = path.resolve(__dirname, '..', '..');

function read(rel: string): string {
  return fs.readFileSync(path.resolve(WT_ROOT, rel), 'utf8');
}

function expectNoMatches(css: string, pattern: RegExp, label: string): void {
  const match = css.match(pattern);
  expect(`${label}: ${match ? match[0] : 'none'}`).toBe(`${label}: none`);
}

function getCssRuleBlock(css: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, 'm'));
  expect(match).not.toBeNull();
  return match?.[1] ?? '';
}

const BATCH_CSS = 'src/style/modals/batch-organize-modal.css';
const TOOLING_CSS = 'src/style/modals/obsidian-tooling-confirm-modal.css';
const IMAGEGEN_CSS = 'src/style/modals/image-generation-modal.css';
const CONTRAST_CSS = 'src/style/modals/plugin-modal-contrast.css';
const BATCH_TS = 'src/app/batchOrganize/BatchOrganizeModal.ts';
const TOOLING_TS = 'src/app/obsidianTooling/ObsidianToolingApprovalModal.ts';
const IMAGEGEN_TS = 'src/features/chat/ui/ImageGenerationModal.ts';
const INLINE_EDIT_CONFIRM_TS = 'src/features/inline-edit/InlineEditConfirmModal.ts';
const CANVAS_REWRITE_TS = 'src/features/canvas-integration/CanvasRewriteModals.ts';
const CANVAS_GENERATE_TS = 'src/features/canvas-integration/CanvasGenerationFlow.ts';
const PDF_ANNOTATION_TS = 'src/features/chat/services/PdfAnnotationPreviewModal.ts';

/** Every plugin modal root class covered by the shared contrast contract. */
const CONTRAST_MODAL_CLASSES = [
  'opencodian-inline-edit-confirm-modal',
  'opencodian-batch-organize-modal',
  'opencodian-imagegen-modal',
  'opencodian-tooling-confirm-modal',
  'opencodian-canvas-modal',
  'opencodian-pdf-annotation-modal',
] as const;

/** `border-left`/`border-right` wider than 1px is an impeccable ban. */
const SIDE_STRIPE_PATTERN = /border-(?:left|right):\s*(?!1px|0\b|0px\b|none\b|transparent\b)[1-9]\d*(?:\.\d+)?px/;

describe('batch organize modal design contract (DESIGN.md §5 Modal Layout)', () => {
  const css = read(BATCH_CSS);
  const ts = read(BATCH_TS);

  it('scopes every stage under a modal root class applied in the TS', () => {
    expect(css).toMatch(/\.opencodian-batch-organize-modal\s*\{/);
    expect(ts).toContain("this.modalEl.addClass('opencodian-batch-organize-modal')");
  });

  it('declares the documented modal spacing tokens verbatim', () => {
    expect(css).toMatch(/--opencodian-modal-content-padding-x:\s*22px/);
    expect(css).toMatch(/--opencodian-modal-content-padding-y:\s*22px/);
    expect(css).toMatch(/--opencodian-modal-form-row-gap:\s*12px/);
    expect(css).toMatch(/--opencodian-modal-form-label-control-gap:\s*16px/);
    expect(css).toMatch(/--opencodian-modal-action-gap:\s*8px/);
  });

  it('pads .modal-content with the documented padding tokens', () => {
    const block = getCssRuleBlock(css, '.opencodian-batch-organize-modal .modal-content');
    expect(block).toMatch(/padding:\s*var\(--opencodian-modal-content-padding-y\)\s+var\(--opencodian-modal-content-padding-x\)/);
  });

  it('uses the documented label + control column anatomy', () => {
    const row = getCssRuleBlock(css, '.opencodian-batch-organize-row');
    expect(row).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(220px,\s*max-content\)/);
    expect(row).toMatch(/column-gap:\s*var\(--opencodian-modal-form-label-control-gap\)/);
    expect(ts).toContain('opencodian-modal-form-grid');
  });

  it('renders action rows through the shared right-aligned separator row', () => {
    expect(ts).toContain('opencodian-modal-actions');
  });

  it('keeps the title on the documented Title scale (700 / 14px) and body at 13px', () => {
    const title = getCssRuleBlock(css, '.opencodian-batch-organize-modal h3');
    expect(title).toMatch(/font-size:\s*14px/);
    expect(title).toMatch(/font-weight:\s*700/);
    expect(css).toMatch(/\.opencodian-batch-organize-hint\s*\{[^}]*font-size:\s*13px/);
  });

  it('renders preview paths as monospace evidence and lets them wrap, not overflow', () => {
    const item = getCssRuleBlock(css, '.opencodian-batch-organize-item');
    expect(item).toMatch(/font-family:\s*var\(--font-monospace\)/);
    expect(item).toMatch(/overflow-wrap:\s*anywhere/);
    const list = getCssRuleBlock(css, '.opencodian-batch-organize-list');
    expect(list).toMatch(/overflow-y:\s*auto/);
  });

  it('provides visible keyboard focus (2px accent outline with offset)', () => {
    expect(css).toMatch(/focus-visible[^{]*\{[^}]*outline:\s*2px solid var\(--interactive-accent\)[^}]*outline-offset:\s*2px/s);
  });

  it('provides a prefers-reduced-motion alternative', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });

  it('contains no side-stripe accent borders and no per-modal warning-ink duplicate', () => {
    // jest/expect-expect cannot see through the local expectNoMatches helper,
    // so pair it with a direct assertion that also pins the file identity.
    expect(css).toContain('opencodian-batch-organize-modal');
    expectNoMatches(css, SIDE_STRIPE_PATTERN, 'batch-organize side stripe');
    // The warning tone has ONE source of truth (shared contrast module).
    expect(css).toMatch(/color:\s*var\(--opencodian-modal-warning-ink\)/);
    expect(css).not.toContain('color-mix(in srgb, var(--text-error)');
  });
});

describe('obsidian tooling approval modal design contract', () => {
  const css = read(TOOLING_CSS);
  const ts = read(TOOLING_TS);

  it('scopes the modal under a root class applied in the TS', () => {
    expect(css).toMatch(/\.opencodian-tooling-confirm-modal\s*\{/);
    expect(ts).toContain("this.modalEl.addClass('opencodian-tooling-confirm-modal')");
  });

  it('declares the documented modal spacing tokens and uses them on .modal-content', () => {
    expect(css).toMatch(/--opencodian-modal-content-padding-x:\s*22px/);
    expect(css).toMatch(/--opencodian-modal-content-padding-y:\s*22px/);
    const block = getCssRuleBlock(css, '.opencodian-tooling-confirm-modal .modal-content');
    expect(block).toMatch(/padding:\s*var\(--opencodian-modal-content-padding-y\)\s+var\(--opencodian-modal-content-padding-x\)/);
  });

  it('presents the exact command as monospace evidence that wraps, not overflows', () => {
    const cmd = getCssRuleBlock(css, '.opencodian-tooling-confirm-command');
    expect(cmd).toMatch(/font-family:\s*var\(--font-monospace\)/);
    expect(cmd).toMatch(/overflow-wrap:\s*anywhere/);
    expect(ts).toContain('opencodian-tooling-confirm-command');
  });

  it('uses the shared action row and the rose deny vocabulary (native mod-warning)', () => {
    expect(ts).toContain('opencodian-modal-actions');
    expect(ts).toContain('mod-warning');
    expect(ts).toContain('mod-cta');
  });

  it('no longer ships a per-modal button contrast rule (shared contract owns it)', () => {
    // The ink-mix background was measured live as NEVER landing (the theme
    // out-specifies a (0,2,0) plugin selector for background-color); the
    // label-only fix lives in plugin-modal-contrast.css now.
    expect(css).not.toContain('#e11d48');
    expect(css).not.toContain('#0f172a');
    expect(css).not.toMatch(/\.opencodian-tooling-confirm-modal \.(mod-warning|mod-cta)\s*\{/);
  });

  it('provides focus handling, owns no motion rules, and has no side stripes', () => {
    expect(css).toMatch(/focus-visible[^{]*\{[^}]*outline:\s*2px solid var\(--interactive-accent\)/s);
    // Button transitions (and their reduced-motion alternative) are owned by
    // the shared contrast module — this file carries no motion declarations.
    expect(css).not.toMatch(/transition:/);
    expectNoMatches(css, SIDE_STRIPE_PATTERN, 'tooling side stripe');
  });
});

describe('inline edit document-replace confirm modal design contract', () => {
  const ts = read(INLINE_EDIT_CONFIRM_TS);

  it('applies the modal root class covered by the shared contrast contract', () => {
    expect(ts).toContain("modal.modalEl.addClass('opencodian-inline-edit-confirm-modal')");
    // The destructive pairing comes from the native setWarning() vocabulary.
    expect(ts).toContain('.setWarning()');
  });
});

describe('shared plugin modal contrast contract (R-A6 and siblings)', () => {
  const css = read(CONTRAST_CSS);

  it('is wired into the style index', () => {
    expect(read('src/style/index.css')).toContain("@import 'modals/plugin-modal-contrast.css';");
    expect(fs.existsSync(path.resolve(WT_ROOT, 'src/style/modals/inline-edit-confirm-modal.css'))).toBe(false);
  });

  it('targets every plugin modal root class in all three rule sets', () => {
    for (const modalClass of CONTRAST_MODAL_CLASSES) {
      const scoped = css.split(modalClass).length - 1;
      // The class must appear in the warning-ink scope, the warning-note
      // rule, the button-label rules and the reduced-motion block.
      expect(scoped).toBeGreaterThanOrEqual(4);
    }
  });

  it('lightens the label only: light ink on the host ground, no background override', () => {
    const label = css.match(/\.mod-cta,\n?[\s\S]*?\.mod-warning \{([^}]*)\}/)?.[1] ?? '';
    // The label ink is a documented token rather than a repeated literal, so
    // the value lives in exactly one place and reads as a design decision.
    expect(label).toMatch(/color:\s*var\(--opencodian-modal-contrast-label\)/);
    expect(label).toMatch(/--text-color:\s*var\(--opencodian-modal-contrast-label\)/);
    expect(css).toMatch(/--opencodian-modal-contrast-label:\s*#fff/);
    // Declaring a background can only lose the cascade against the theme
    // (measured live) — a silent non-win is exactly the drift this stops.
    expect(css).not.toMatch(/background:\s*color-mix/);
    // Bare .mod-destructive sits on a translucent ground — whitening its
    // label would be unreadable; only solid-ground variants are covered.
    expect(css).not.toMatch(/\}\s*\.mod-destructive\s*\{/);
  });

  it('owns the shared warning body-copy ink (raw --text-error measured 4.20:1)', () => {
    expect(css).toMatch(/--opencodian-modal-warning-ink:\s*color-mix\(in srgb, var\(--text-error\) 72%, var\(--text-normal\)\)/);
    expect(css).toMatch(/\.opencodian-modal-warning-note \{\s*color: var\(--opencodian-modal-warning-ink\);/);
  });

  it('stays motion-safe and free of impeccable bans', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expectNoMatches(css, SIDE_STRIPE_PATTERN, 'plugin contrast side stripe');
  });

  it('every scoped modal TS applies its root class', () => {
    expect(read(BATCH_TS)).toContain("this.modalEl.addClass('opencodian-batch-organize-modal')");
    expect(read(TOOLING_TS)).toContain("this.modalEl.addClass('opencodian-tooling-confirm-modal')");
    expect(read(IMAGEGEN_TS)).toContain("this.modalEl.addClass('opencodian-imagegen-modal')");
    expect(read(CANVAS_REWRITE_TS)).toContain("this.modalEl.addClass('opencodian-canvas-modal')");
    expect(read(CANVAS_GENERATE_TS)).toContain("this.modalEl.addClass('opencodian-canvas-modal')");
    expect(read(PDF_ANNOTATION_TS)).toContain("this.modalEl.addClass('opencodian-pdf-annotation-modal')");
  });

  it('canvas and pdf preview modals use the shared warning-note class, not inline --text-error', () => {
    for (const ts of [read(CANVAS_REWRITE_TS), read(PDF_ANNOTATION_TS)]) {
      expect(ts).toContain("addClass('opencodian-modal-warning-note')");
      expect(ts).not.toContain("style.color = 'var(--text-error)'");
    }
  });
});

describe('image generation modal design contract (DESIGN.md §5 Modal Layout)', () => {
  const css = read(IMAGEGEN_CSS);
  const ts = read(IMAGEGEN_TS);

  it('scopes the modal under a root class applied in the TS', () => {
    expect(css).toMatch(/\.opencodian-imagegen-modal\s*\{/);
    expect(ts).toContain("this.modalEl.addClass('opencodian-imagegen-modal')");
  });

  it('declares the documented modal spacing tokens verbatim and pads .modal-content with them', () => {
    expect(css).toMatch(/--opencodian-modal-content-padding-x:\s*22px/);
    expect(css).toMatch(/--opencodian-modal-content-padding-y:\s*22px/);
    expect(css).toMatch(/--opencodian-modal-header-body-gap:\s*16px/);
    expect(css).toMatch(/--opencodian-modal-section-gap:\s*20px/);
    expect(css).toMatch(/--opencodian-modal-section-inner-gap:\s*12px/);
    expect(css).toMatch(/--opencodian-modal-card-gap:\s*12px/);
    expect(css).toMatch(/--opencodian-modal-form-row-gap:\s*12px/);
    expect(css).toMatch(/--opencodian-modal-form-label-control-gap:\s*16px/);
    expect(css).toMatch(/--opencodian-modal-action-gap:\s*8px/);
    const block = getCssRuleBlock(css, '.opencodian-imagegen-modal .modal-content');
    expect(block).toMatch(/padding:\s*var\(--opencodian-modal-content-padding-y\)\s+var\(--opencodian-modal-content-padding-x\)/);
  });

  it('keeps the host-native colour and type choices (no retheming)', () => {
    expect(css).toMatch(/border-radius:\s*var\(--radius-m/);
    expect(css).toMatch(/background:\s*var\(--background-secondary\)/);
    // Warning body copy rides the shared measured ink (raw --text-error
    // measured 4.20:1 as modal body text — below the floor).
    expect(css).toMatch(/color:\s*var\(--opencodian-modal-warning-ink\)/);
    expect(css).not.toMatch(/color:\s*var\(--text-error\)/);
    expect(css).toMatch(/font-size:\s*var\(--font-ui-smaller\)/);
  });

  it('keeps the result image bounded and its caption an honest smaller label', () => {
    const image = getCssRuleBlock(css, '.opencodian-imagegen-result-image');
    expect(image).toMatch(/max-height:\s*320px/);
    expect(image).toMatch(/object-fit:\s*contain/);
    const meta = getCssRuleBlock(css, '.opencodian-imagegen-result-meta');
    expect(meta).toMatch(/color:\s*var\(--text-muted\)/);
  });

  it('contains no side-stripe accent borders', () => {
    expect(css).toContain('opencodian-imagegen-modal');
    expectNoMatches(css, SIDE_STRIPE_PATTERN, 'imagegen side stripe');
  });
});

describe('impeccable bans absent from touched surfaces', () => {
  it('inline-permission.css: no side-stripe border and no invalid :has-text selectors', () => {
    const css = read('src/style/components/inline-permission.css');
    expectNoMatches(css, SIDE_STRIPE_PATTERN, 'inline-permission side stripe');
    expect(css).not.toContain(':has-text(');
    expect(css).not.toContain('.opencodian-permission-completed');
  });

  it('chat message entrance uses an exponential ease-out within 150-250ms, no bounce', () => {
    for (const file of ['src/style/features/chat-assistant.css', 'src/style/features/chat-user.css']) {
      const css = read(file);
      expectNoMatches(css, /cubic-bezier\(0\.34/, `${file} bounce easing`);
      expect(css).toMatch(/animation:\s*messageSlideIn\s+0\.2s\s+cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\)/);
    }
    // The shared keyframes live in chat-user.css; both users animate the same name.
    expect(read('src/style/features/chat-user.css')).toMatch(/@keyframes messageSlideIn/);
  });

  it('chat-assistant.css uses no undeclared UI font families', () => {
    const css = read('src/style/features/chat-assistant.css');
    expect(css).not.toContain("'Space Mono'");
    // Model ids are exact things: DESIGN.md Mono Evidence Rule.
    expect(css).toMatch(/font-family:\s*var\(--font-monospace\)/);
  });
});

describe('type-scale drift snapped to documented scale', () => {
  it('inline-edit.css keeps radii and paddings on its documented token scale', () => {
    const css = read('src/style/features/inline-edit.css');
    expect(css).not.toMatch(/border-radius:\s*[57]px/);
    expect(css).not.toMatch(/padding:\s*7px/);
    expect(css).not.toMatch(/margin-top:\s*7px/);
    expect(css).toMatch(/--ocie-radius-xs:\s*6px/);
    expect(css).toMatch(/--ocie-radius-sm:\s*8px/);
    expect(css).toMatch(/--ocie-radius:\s*12px/);
  });

  it('label-size text scales with the host interface setting, not hardcoded px', () => {
    for (const file of [
      'src/style/components/modified-files-sidebar.css',
      'src/style/components/inline-permission.css',
      'src/style/features/chat-assistant.css',
    ]) {
      const css = read(file);
      expect(css).not.toMatch(/font-size:\s*1[012]px/);
      expect(css).toMatch(/var\(--font-ui-smaller\)/);
    }
  });
});

describe('DESIGN.md declares every bundled font family', () => {
  it('documents the composer serif and numeral families of chat-assistant.css', () => {
    const design = read('DESIGN.md');
    expect(design).toMatch(/### Bundled Families/);
    expect(design).toContain('OpenCodian Newsreader');
    expect(design).toContain('OpenCodian Oxanium Numerals');
    const chat = read('src/style/features/chat-assistant.css');
    // The declared families remain in use, via the documented consumers.
    expect(chat).toMatch(/"OpenCodian Newsreader", Georgia, serif/);
    expect(chat).toMatch(/"OpenCodian Oxanium Numerals"/);
  });
});
