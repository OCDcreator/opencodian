const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const puppeteer = require('puppeteer');

jest.setTimeout(30000);

describe('Model popover rendered viewport contract', () => {
  it('preserves a 280px model scroll viewport below shared card chrome', async () => {
    const frameCss = readFileSync(
      join(process.cwd(), 'src/style/components/composer-popover-frame.css'),
      'utf8',
    );
    const modelCss = readFileSync(
      join(process.cwd(), 'src/style/components/model-selector.css'),
      'utf8',
    );
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--disable-setuid-sandbox', '--no-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 640, height: 720, deviceScaleFactor: 1 });
      await page.setContent(
        '<style>' +
          ':root {' +
            '--text-normal:#202020;' +
            '--text-muted:#666;' +
            '--text-faint:#777;' +
            '--background-primary:#fff;' +
            '--background-secondary:#f4f4f4;' +
            '--background-modifier-border:#ccc;' +
            '--background-modifier-box-shadow:rgba(0,0,0,.15);' +
            '--background-modifier-hover:#eee;' +
            '--interactive-accent:#356ac3;' +
            '--scrollbar-thumb-bg:#999;' +
          '}' +
          '* { box-sizing:border-box; }' +
          'body { margin:0; }' +
          '.opencodian-model-selector { position:relative; width:340px; margin:24px; }' +
          '.opencodian-model-dropdown { display:block; }' +
          frameCss +
          modelCss +
        '</style>' +
        '<div class="opencodian-model-selector">' +
          '<div class="opencodian-model-dropdown">' +
            '<div class="opencodian-composer-popover-frame">' +
              '<div class="opencodian-composer-popover-header">Choose model</div>' +
              '<div class="opencodian-composer-popover-content">' +
                '<div class="opencodian-model-dropdown-search">' +
                  '<div class="opencodian-model-dropdown-search-container">' +
                    '<input class="opencodian-model-dropdown-search-input" />' +
                  '</div>' +
                '</div>' +
                '<div class="opencodian-model-dropdown-scroll">' +
                  '<div style="height:800px"></div>' +
                '</div>' +
              '</div>' +
              '<div class="opencodian-composer-popover-footer">Hints</div>' +
            '</div>' +
          '</div>' +
        '</div>',
      );

      const viewportHeight = await page.$eval(
        '.opencodian-model-dropdown-scroll',
        (element) => Math.round(element.getBoundingClientRect().height),
      );

      expect(viewportHeight).toBe(280);
    } finally {
      await browser.close();
    }
  });

  it('does not expose model rows above the stuck provider header at interior scroll', async () => {
    const frameCss = readFileSync(
      join(process.cwd(), 'src/style/components/composer-popover-frame.css'),
      'utf8',
    );
    const modelCss = readFileSync(
      join(process.cwd(), 'src/style/components/model-selector.css'),
      'utf8',
    );
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--disable-setuid-sandbox', '--no-sandbox'],
    });

    const buildGroupsHtml = (count, perProvider) => {
      const parts = [];
      for (let p = 1; p <= count; p += 1) {
        const options = [];
        for (let m = 0; m < perProvider; m += 1) {
          options.push(
            '<div class="opencodian-model-option opencodian-composer-popover-option"' +
              ' data-value="p' + p + '-m' + m + '">' +
              '<span class="opencodian-model-option-icon opencodian-composer-popover-option-icon"></span>' +
              '<span class="opencodian-model-option-name opencodian-composer-popover-option-main">' +
              'Model ' + p + '.' + m + ' with visible text</span>' +
              '<span class="opencodian-model-option-check opencodian-composer-popover-option-check"></span>' +
              '</div>',
          );
        }
        parts.push(
          '<div class="opencodian-model-group">' +
            '<div class="opencodian-model-provider-header">' +
              '<span class="opencodian-model-provider-header-text">provider-' + p + '</span>' +
            '</div>' +
            options.join('') +
          '</div>',
        );
      }
      return parts.join('');
    };

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 640, height: 720, deviceScaleFactor: 1 });
      await page.setContent(
        '<style>' +
          ':root {' +
            '--text-normal:#202020;' +
            '--text-muted:#666;' +
            '--text-faint:#777;' +
            '--background-primary:#fff;' +
            '--background-secondary:#f4f4f4;' +
            '--background-modifier-border:#ccc;' +
            '--background-modifier-box-shadow:rgba(0,0,0,.15);' +
            '--background-modifier-hover:#eee;' +
            '--interactive-accent:#356ac3;' +
            '--scrollbar-thumb-bg:#999;' +
          '}' +
          '* { box-sizing:border-box; }' +
          'body { margin:0; }' +
          '.opencodian-model-selector { position:relative; width:340px; margin:24px; }' +
          frameCss +
          modelCss +
          '.opencodian-model-dropdown { display:block; position:static; margin-bottom:0; }' +
        '</style>' +
        '<div class="opencodian-model-selector">' +
          '<div class="opencodian-model-dropdown">' +
            '<div class="opencodian-composer-popover-frame">' +
              '<div class="opencodian-composer-popover-content">' +
                '<div class="opencodian-model-dropdown-scroll">' +
                  '<div class="opencodian-model-groups">' +
                    buildGroupsHtml(3, 8) +
                  '</div>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>',
      );

      const scroll = await page.$('.opencodian-model-dropdown-scroll');
      await page.evaluate((el) => {
        el.scrollTop = 120;
      }, scroll);
      await new Promise((resolve) => setTimeout(resolve, 60));

      const measured = await page.evaluate(() => {
        const sc = document.querySelector('.opencodian-model-dropdown-scroll');
        const scRect = sc.getBoundingClientRect();
        const firstHeader = document.querySelector('.opencodian-model-provider-header');
        const headerRect = firstHeader.getBoundingClientRect();
        return {
          scrollTop: sc.scrollTop,
          scrollRectTop: scRect.top,
          scrollRectLeft: scRect.left,
          scrollRectWidth: scRect.width,
          headerRectTop: headerRect.top,
          gap: headerRect.top - scRect.top,
        };
      });

      // Sticky header must stick to the scrollport top edge with at most 1px tolerance.
      // Before the fix, the scroll container's 4px padding-top caused the header to
      // stick at the content-box edge (y=4), leaving a transparent 4px strip at the
      // scrollport top where model-row text bled through during scroll.
      expect(Math.abs(measured.gap)).toBeLessThanOrEqual(1);

      // Visual coverage check: every point sampled inside the original 4px top inset
      // of the scroll viewport must hit the sticky header (or a descendant), never a
      // model option row. This is the direct assertion that no row bleeds above the
      // stuck group heading.
      const samplePoints = [];
      for (let dx = 20; dx < measured.scrollRectWidth - 20; dx += 60) {
        samplePoints.push({
          x: measured.scrollRectLeft + dx,
          y: measured.scrollRectTop + 2,
        });
      }
      const hits = await page.evaluate((points) => {
        return points.map((p) => {
          const el = document.elementFromPoint(p.x, p.y);
          let isHeader = false;
          let isOption = false;
          let node = el;
          while (node && node !== document.body) {
            if (node.classList && node.classList.contains('opencodian-model-provider-header')) {
              isHeader = true;
              break;
            }
            if (node.classList && node.classList.contains('opencodian-model-option')) {
              isOption = true;
              break;
            }
            node = node.parentElement;
          }
          return { isHeader, isOption };
        });
      }, samplePoints);

      expect(hits.length).toBeGreaterThan(0);
      for (const hit of hits) {
        expect(hit.isOption).toBe(false);
        expect(hit.isHeader).toBe(true);
      }
    } finally {
      await browser.close();
    }
  });
});
