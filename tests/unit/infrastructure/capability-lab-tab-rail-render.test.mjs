const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const puppeteer = require('puppeteer');

jest.setTimeout(30000);

describe('Capability Lab backend tab rail rendered contract', () => {
  it('stacks the outer header and preserves readable CJK copy in a 320px container', async () => {
    const capabilityLabCss = readFileSync(
      join(process.cwd(), 'src/style/components/settings-capability-lab.css'),
      'utf8',
    );
    const layoutCss = readFileSync(
      join(process.cwd(), 'src/style/components/settings-layout-contract.css'),
      'utf8',
    );
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--disable-setuid-sandbox', '--no-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
      await page.setContent(`
        <style>
          :root {
            --font-interface: system-ui, sans-serif;
            --text-normal: #202020;
            --text-muted: #5c5c5c;
            --background-primary: #fff;
            --opencodian-settings-space-sm: 6px;
            --opencodian-settings-space-md: 8px;
            --opencodian-settings-space-lg: 10px;
            --opencodian-settings-space-xl: 12px;
            --opencodian-settings-inline-border: #c9c9c9;
            --opencodian-settings-section-border: #c9c9c9;
            --opencodian-settings-section-bg: #fff;
            --opencodian-settings-radius-section: 8px;
          }
          * { box-sizing: border-box; }
          html, body { width: 1280px; margin: 0; }
          .opencodian-settings { width: 320px; margin: 16px; }
          ${layoutCss}
          ${capabilityLabCss}
        </style>
        <main class="opencodian-settings">
          <section class="opencodian-debug-tab-shell opencodian-debug-tab-shell-capability-lab opencodian-capability-lab-shell">
            <header class="opencodian-debug-tab-header">
              <div class="opencodian-debug-tab-copy">
                <h3 class="opencodian-settings-subsection-heading">能力实验室</h3>
                <p class="opencodian-debug-tab-desc">按后端检查可用能力、诊断证据与安全边界。</p>
              </div>
              <div class="opencodian-debug-tab-badges">
                <span>诊断专用</span>
                <span>安全只读</span>
              </div>
            </header>
            <div class="opencodian-debug-tab-body opencodian-capability-lab-body"></div>
          </section>
        </main>
      `);

      const evidence = await page.evaluate(() => {
        const shell = document.querySelector('.opencodian-capability-lab-shell');
        const header = document.querySelector('.opencodian-debug-tab-header');
        const copy = document.querySelector('.opencodian-debug-tab-copy');
        const title = document.querySelector('.opencodian-settings-subsection-heading');
        const description = document.querySelector('.opencodian-debug-tab-desc');
        if (!(shell instanceof HTMLElement)
          || !(header instanceof HTMLElement)
          || !(copy instanceof HTMLElement)
          || !(title instanceof HTMLElement)
          || !(description instanceof HTMLElement)) {
          return null;
        }
        const headerStyle = getComputedStyle(header);
        const shellStyle = getComputedStyle(shell);
        const copyRect = copy.getBoundingClientRect();
        const titleRect = title.getBoundingClientRect();
        const descriptionRect = description.getBoundingClientRect();
        return {
          columns: headerStyle.gridTemplateColumns.split(' ').filter(Boolean).length,
          shellContainerType: shellStyle.containerType,
          copyWidth: copyRect.width,
          titleWidth: titleRect.width,
          descriptionWidth: descriptionRect.width,
          shellWidth: shell.getBoundingClientRect().width,
          pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });

      expect(evidence).not.toBeNull();
      expect(evidence.columns).toBe(1);
      expect(evidence.shellContainerType).toContain('inline-size');
      expect(evidence.copyWidth).toBeGreaterThanOrEqual(evidence.shellWidth * 0.75);
      expect(evidence.titleWidth).toBeGreaterThanOrEqual(160);
      expect(evidence.descriptionWidth).toBeGreaterThanOrEqual(160);
      expect(evidence.pageOverflow).toBeLessThanOrEqual(0);
    } finally {
      await browser.close();
    }
  });

  it('keeps the keyboard focus ring visible while the 320px rail scrolls locally', async () => {
    const css = readFileSync(
      join(process.cwd(), 'src/style/components/settings-capability-lab.css'),
      'utf8',
    );
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--disable-setuid-sandbox', '--no-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 320, height: 480, deviceScaleFactor: 1 });
      await page.setContent(`
        <style>
          :root {
            --font-interface: system-ui, sans-serif;
            --text-normal: #202020;
            --text-muted: #5c5c5c;
            --text-faint: #777;
            --interactive-accent: #356ac3;
            --background-modifier-hover: #e8e8e8;
            --opencodian-settings-space-xs: 4px;
            --opencodian-settings-space-sm: 6px;
            --opencodian-settings-inline-bg: #f2f2f2;
            --opencodian-settings-inline-border: #c9c9c9;
            --opencodian-settings-radius-inline: 4px;
            --opencodian-settings-focus-ring: #174ea6;
          }
          * { box-sizing: border-box; }
          html, body { width: 320px; margin: 0; }
          .opencodian-settings { width: 288px; margin: 16px; }
          ${css}
        </style>
        <main class="opencodian-settings">
          <div data-capability-backend-tablist="true" role="tablist">
            <button data-capability-backend-tab="claude-code" role="tab" tabindex="-1">
              <span>Claude Code</span><span data-capability-backend-tab-state="true">Available</span>
            </button>
            <button data-capability-backend-tab="opencode" role="tab" tabindex="-1">
              <span>OpenCode</span><span data-capability-backend-tab-state="true">Unknown</span>
            </button>
            <button data-capability-backend-tab="codex" role="tab" tabindex="0" aria-selected="true">
              <span>Codex</span><span data-capability-backend-tab-state="true">Available</span>
            </button>
          </div>
        </main>
      `);

      await page.keyboard.press('Tab');
      await page.evaluate(() => {
        document.querySelector('[data-capability-backend-tab="codex"]')
          ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      });

      const evidence = await page.evaluate(() => {
        const rail = document.querySelector('[data-capability-backend-tablist]');
        const tab = document.querySelector('[data-capability-backend-tab="codex"]');
        const settings = document.querySelector('.opencodian-settings');
        if (!(rail instanceof HTMLElement) || !(tab instanceof HTMLElement) || !(settings instanceof HTMLElement)) {
          return null;
        }
        const railRect = rail.getBoundingClientRect();
        const tabRect = tab.getBoundingClientRect();
        const tabStyle = getComputedStyle(tab);
        const outlineExtent = Number.parseFloat(tabStyle.outlineWidth)
          + Math.max(0, Number.parseFloat(tabStyle.outlineOffset));
        return {
          pageOverflow: {
            document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            body: document.body.scrollWidth - document.body.clientWidth,
            settings: settings.scrollWidth - settings.clientWidth,
          },
          focusVisible: tab.matches(':focus-visible'),
          outlineExtent,
          clearance: {
            top: tabRect.top - railRect.top,
            right: railRect.right - tabRect.right,
            bottom: railRect.bottom - tabRect.bottom,
            left: tabRect.left - railRect.left,
          },
          railClientWidth: rail.clientWidth,
          railScrollWidth: rail.scrollWidth,
          railScrollLeft: rail.scrollLeft,
        };
      });

      expect(evidence).not.toBeNull();
      expect(evidence.focusVisible).toBe(true);
      expect(evidence.railScrollWidth).toBeGreaterThan(evidence.railClientWidth);
      expect(evidence.railScrollLeft).toBeGreaterThan(0);
      expect(evidence.pageOverflow.document).toBeLessThanOrEqual(0);
      expect(evidence.pageOverflow.body).toBeLessThanOrEqual(0);
      expect(evidence.pageOverflow.settings).toBeLessThanOrEqual(0);
      expect(evidence.clearance.top).toBeGreaterThanOrEqual(evidence.outlineExtent);
      expect(evidence.clearance.right).toBeGreaterThanOrEqual(evidence.outlineExtent);
      expect(evidence.clearance.bottom).toBeGreaterThanOrEqual(evidence.outlineExtent);
      expect(evidence.clearance.left).toBeGreaterThanOrEqual(evidence.outlineExtent);
    } finally {
      await browser.close();
    }
  });
});
