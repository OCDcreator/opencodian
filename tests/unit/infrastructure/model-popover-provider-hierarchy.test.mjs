const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const puppeteer = require('puppeteer');

jest.setTimeout(30000);
const MODEL_CSS_PATH = join(process.cwd(), 'src/style/components/model-selector.css');


/**
 * Extract a single CSS rule body for a given selector from the source CSS.
 * This is intentionally simple: it relies on the selector being unique and
 * the declaration block using braces on their own lines.
 */
const extractRuleSource = (css, selector) => {
  const startMarker = selector + ' {';
  const start = css.indexOf(startMarker);
  if (start === -1) return null;
  let depth = 0;
  let end = -1;
  for (let i = start + startMarker.length; i < css.length; i += 1) {
    const ch = css[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      if (depth === 0) {
        end = i;
        break;
      }
      depth -= 1;
    }
  }
  if (end === -1) return null;
  return css.slice(start, end + 1);
};

/*
 * Visual hierarchy regression contract for the Model popover.
 *
 * The provider heading must read unmistakably as a group label, not as
 * another selectable model row. Direction A flattens the heading into
 * the popover surface and removes the old tonal band / full-width
 * separator; hierarchy is conveyed by icon ownership, indentation,
 * whitespace, and typography alone.
 *
 *   1. No tonal band: the provider header background matches the
 *      popover frame surface (--background-primary).
 *   2. No full-width bottom separator under the header.
 *   3. The header remains sticky at top:0, fully opaque, above rows.
 *   4. The header text reads as a label: smaller font-size and a
 *      different (more muted) color than a model option row.
 *
 * Sticky + scrollport coverage is shared with
 * model-popover-viewport-render.test.mjs; this file focuses on the
 * provider-vs-model distinction only.
 */

const buildGroupsHtml = () => {
  return (
    '<div class="opencodian-model-group">' +
      '<div class="opencodian-model-provider-header">' +
        '<span class="opencodian-model-provider-header-icon"></span>' +
        '<span class="opencodian-model-provider-header-text">anthropic</span>' +
      '</div>' +
      '<div class="opencodian-model-option opencodian-composer-popover-option"' +
        ' data-value="anthropic/claude-sonnet-4-5">' +
        '<span class="opencodian-model-option-icon opencodian-composer-popover-option-icon"></span>' +
        '<span class="opencodian-model-option-name opencodian-model-option-main opencodian-composer-popover-option-main">' +
          'Claude Sonnet 4.5' +
        '</span>' +
        '<span class="opencodian-model-option-check opencodian-composer-popover-option-check"></span>' +
      '</div>' +
    '</div>'
  );
};

const buildPage = async (page, themeVars) => {
  const frameCss = readFileSync(
    join(process.cwd(), 'src/style/components/composer-popover-frame.css'),
    'utf8',
  );
  const modelCss = readFileSync(
    join(process.cwd(), 'src/style/components/model-selector.css'),
    'utf8',
  );
  const rootVars = Object.entries(themeVars)
    .map(([k, v]) => `${k}:${v};`)
    .join('');

  await page.setViewport({ width: 640, height: 720, deviceScaleFactor: 1 });
  await page.setContent(
    '<style>' +
      ':root {' + rootVars + '}' +
      '* { box-sizing:border-box; }' +
      'body { margin:0; }' +
      '.opencodian-model-selector { position:relative; width:340px; margin:24px; }' +
      '.opencodian-model-dropdown { display:block; position:static; margin-bottom:0; }' +
      frameCss + modelCss +
    '</style>' +
    '<div class="opencodian-model-selector">' +
      '<div class="opencodian-model-dropdown">' +
        '<div class="opencodian-composer-popover-frame">' +
          '<div class="opencodian-composer-popover-content">' +
            '<div class="opencodian-model-dropdown-scroll">' +
              '<div class="opencodian-model-groups">' +
                buildGroupsHtml() +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>',
  );
};

// Light theme tokens representative of default Obsidian light.
const lightTheme = {
  '--text-normal': '#202020',
  '--text-muted': '#666666',
  '--text-faint': '#777777',
  '--background-primary': '#ffffff',
  '--background-secondary': '#f4f4f4',
  '--background-secondary-alt': '#eaeaea',
  '--background-modifier-border': '#d4d4d4',
  '--background-modifier-border-hover': '#bcbcbc',
  '--background-modifier-hover': '#f0f0f0',
  '--background-modifier-box-shadow': 'rgba(0,0,0,.15)',
  '--interactive-accent': '#356ac3',
  '--scrollbar-thumb-bg': '#999999',
};

// Dark theme tokens representative of default Obsidian dark.
const darkTheme = {
  '--text-normal': '#dcddde',
  '--text-muted': '#999999',
  '--text-faint': '#777777',
  '--background-primary': '#202020',
  '--background-secondary': '#1e1e1e',
  '--background-secondary-alt': '#252525',
  '--background-modifier-border': '#3a3a3a',
  '--background-modifier-border-hover': '#4a4a4a',
  '--background-modifier-hover': '#2a2a2a',
  '--background-modifier-box-shadow': 'rgba(0,0,0,.4)',
  '--interactive-accent': '#7c84cc',
  '--scrollbar-thumb-bg': '#555555',
};

const parseAlpha = (color) => {
  // Modern browsers may resolve color-mix() / lab() / etc. to the
  // CSS Color 4 forms `color(srgb r g b)` or `color(srgb r g b / a)`.
  if (color.startsWith('color(')) {
    const slashSplit = color.split('/');
    if (slashSplit.length === 1) return 1;
    const tail = slashSplit[1].trim().replace(/\)$/, '').trim();
    return parseFloat(tail);
  }
  const m = color.match(/rgba?\(\s*[\d.]+[ ,]+[\d.]+[ ,]+[\d.]+(?:[ ,]+([\d.]+))?\s*\)/);
  if (!m) return null;
  return m[1] === undefined ? 1 : parseFloat(m[1]);
};

describe('Model popover provider header vs model option visual hierarchy', () => {
  let browser;

  beforeAll(async () => {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--disable-setuid-sandbox', '--no-sandbox'],
    });
  });

  afterAll(async () => {
    if (browser) await browser.close();
  });

  for (const [themeName, theme] of [['light', lightTheme], ['dark', darkTheme]]) {
    describe(`${themeName} theme`, () => {
      it('renders an opaque primary background matching the popover frame surface', async () => {
        const page = await browser.newPage();
        try {
          await buildPage(page, theme);
          const result = await page.evaluate(() => {
            const frame = document.querySelector('.opencodian-composer-popover-frame');
            const header = document.querySelector('.opencodian-model-provider-header');
            return {
              frameBg: window.getComputedStyle(frame).backgroundColor,
              headerBg: window.getComputedStyle(header).backgroundColor,
            };
          });
          // Direction A: no tonal band; header sits flush on the frame surface.
          expect(result.headerBg).toBe(result.frameBg);
          // Sticky coverage: header background must be fully opaque so
          // scrolling model rows never bleed through.
          expect(parseAlpha(result.headerBg)).toBe(1);
        } finally {
          await page.close();
        }
      });

      it('provider header has no full-width bottom separator', async () => {
        const page = await browser.newPage();
        try {
          await buildPage(page, theme);
          const result = await page.evaluate(() => {
            const header = document.querySelector('.opencodian-model-provider-header');
            const cs = window.getComputedStyle(header);
            return {
              borderBottomWidth: cs.borderBottomWidth,
              borderBottomStyle: cs.borderBottomStyle,
              borderBottomColor: cs.borderBottomColor,
            };
          });
          const width = parseFloat(result.borderBottomWidth);
          const hasVisibleSeparator =
            width > 0 &&
            result.borderBottomStyle !== 'none' &&
            result.borderBottomColor !== 'rgba(0, 0, 0, 0)' &&
            result.borderBottomColor !== 'transparent';
          expect(hasVisibleSeparator).toBe(false);
        } finally {
          await page.close();
        }
      });

      it('provider header remains sticky at top:0 and stacks above model rows', async () => {
        const page = await browser.newPage();
        try {
          await buildPage(page, theme);
          const result = await page.evaluate(() => {
            const header = document.querySelector('.opencodian-model-provider-header');
            const hs = window.getComputedStyle(header);
            return {
              position: hs.position,
              top: hs.top,
              zIndex: hs.zIndex,
            };
          });
          expect(result.position).toBe('sticky');
          expect(result.top).toBe('0px');
          expect(parseInt(result.zIndex, 10)).toBeGreaterThanOrEqual(1);
        } finally {
          await page.close();
        }
      });

      it('provider header text reads as a label (smaller + different color) vs a model option', async () => {
        const page = await browser.newPage();
        try {
          await buildPage(page, theme);
          const result = await page.evaluate(() => {
            const header = document.querySelector('.opencodian-model-provider-header');
            const option = document.querySelector('.opencodian-model-option');
            const hs = window.getComputedStyle(header);
            const os = window.getComputedStyle(option);
            return {
              headerColor: hs.color,
              headerFontSize: parseFloat(hs.fontSize),
              optionColor: os.color,
              optionFontSize: parseFloat(os.fontSize),
            };
          });
          // Header label is visibly smaller than a model option row.
          expect(result.headerFontSize).toBeLessThan(result.optionFontSize);
          // Header label uses a different (more muted) text color.
          expect(result.headerColor).not.toBe(result.optionColor);
        } finally {
          await page.close();
        }
      });
    });
  }
});
describe('Model popover provider header source style contract', () => {
  it('requires provider header to use opaque primary background and no tonal band or separator', () => {
    const css = readFileSync(MODEL_CSS_PATH, 'utf8');
    const rule = extractRuleSource(css, '.opencodian-model-provider-header');
    expect(rule).not.toBeNull();
    // Direction A: heading must sit flush on the popover surface.
    expect(rule).toMatch(/background:\s*var\(--background-primary\)\s*;/);
    expect(rule).not.toMatch(/background:\s*color-mix\(/);
    expect(rule).not.toMatch(/border-bottom:/);
  });

  it('requires provider header color to use --text-muted and forbids --text-faint', () => {
    const css = readFileSync(MODEL_CSS_PATH, 'utf8');
    const rule = extractRuleSource(css, '.opencodian-model-provider-header');
    expect(rule).not.toBeNull();
    // The header must be visually stronger than the search placeholder,
    // which already uses --text-faint. Provider headings are group labels,
    // not placeholder/status text.
    expect(rule).toMatch(/color:\s*var\(--text-muted\)\s*;/);
    expect(rule).not.toMatch(/color:\s*var\(--text-faint\)\s*;/);
  });
});
