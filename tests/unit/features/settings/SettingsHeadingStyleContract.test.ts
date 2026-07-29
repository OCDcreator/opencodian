import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const stylesheetPaths = [
  'src/style/components/model-selector.css',
  'src/style/components/settings-layout-contract.css',
  'src/style/components/settings-agents.css',
  'src/style/components/settings-claude-code.css',
];

function loadStylesheets(): string {
  return stylesheetPaths
    .map((relativePath) => readFileSync(join(process.cwd(), relativePath), 'utf8'))
    .join('\n');
}

function expectFlushHeading(element: Element): void {
  const computed = getComputedStyle(element);
  expect(computed.marginTop).toBe('0px');
  expect(computed.marginRight).toBe('0px');
  expect(computed.marginBottom).toBe('0px');
  expect(computed.marginLeft).toBe('0px');
  expect(computed.paddingTop).toBe('0px');
  expect(computed.paddingRight).toBe('0px');
  expect(computed.paddingBottom).toBe('0px');
  expect(computed.paddingLeft).toBe('0px');
}

function mountFixture(): void {
  document.head.innerHTML = '';
  document.body.innerHTML = `
    <div class="opencodian-settings vertical-tab-content">
      <h3 class="opencodian-settings-section-heading">Section</h3>
      <h4 class="opencodian-settings-subsection-heading">Subsection</h4>
      <h5 class="opencodian-settings-subsection-heading">Nested subsection</h5>
      <div class="opencodian-skill-source-header"><h3>Skills</h3></div>
      <div class="opencodian-tool-group-header"><h3>Tools</h3></div>
      <div class="opencodian-tool-files-header"><h3>Files</h3></div>
      <div class="opencodian-backend-agent-group-title"><h4>Agents</h4></div>
      <div class="opencodian-claude-code-group-header"><h4 class="opencodian-claude-code-group-title">Claude</h4></div>
    </div>
    <div class="opencodian-settings vertical-tab-content" data-settings-layout-mode="classic">
      <h3 class="opencodian-settings-section-heading">Classic section</h3>
    </div>
  `;

  const hostStyle = document.createElement('style');
  hostStyle.textContent = `
    .vertical-tab-content h3,
    .vertical-tab-content h4,
    .vertical-tab-content h5 {
      margin: 0 0 16px;
      padding: 0 16px;
    }
  `;
  document.head.append(hostStyle);

  const pluginStyle = document.createElement('style');
  pluginStyle.textContent = loadStylesheets();
  document.head.append(pluginStyle);
}

describe('Settings heading style contract', () => {
  beforeEach(() => {
    mountFixture();
  });

  it('overrides host heading spacing for shared section and subsection headings', () => {
    const selectors = [
      '.opencodian-settings-section-heading',
      '.opencodian-settings-subsection-heading',
      'h5.opencodian-settings-subsection-heading',
    ];

    for (const selector of selectors) {
      const heading = document.querySelector(selector);
      expect(heading).not.toBeNull();
      expectFlushHeading(heading as Element);
    }

    const subsectionHeading = document.querySelector('.opencodian-settings-subsection-heading');
    const computed = getComputedStyle(subsectionHeading as Element);
    expect(computed.fontSize).toBe('14px');
    expect(computed.fontWeight).toBe('700');
    expect(computed.lineHeight).toBe('1.35');
  });

  it('keeps Settings group headers flush with their content tracks', () => {
    const selectors = [
      '.opencodian-skill-source-header',
      '.opencodian-tool-group-header',
      '.opencodian-tool-files-header',
      '.opencodian-backend-agent-group-title',
      '.opencodian-claude-code-group-header',
    ];

    for (const selector of selectors) {
      const header = document.querySelector(selector);
      expect(header).not.toBeNull();
      expect(getComputedStyle(header as Element).paddingLeft).toBe('0px');
      expect(getComputedStyle(header as Element).paddingRight).toBe('0px');
    }
  });

  it('preserves the classic top-level section ribbon', () => {
    const classicHeading = document.querySelector<HTMLElement>(
      '[data-settings-layout-mode="classic"] > .opencodian-settings-section-heading',
    );

    expect(classicHeading).not.toBeNull();
    expect(getComputedStyle(classicHeading as HTMLElement).textAlign).toBe('center');
    expect(getComputedStyle(classicHeading as HTMLElement).paddingLeft).toBe('12px');
  });
});
