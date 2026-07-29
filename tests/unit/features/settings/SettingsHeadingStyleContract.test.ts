import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const stylesheetPaths = [
  'src/style/components/model-selector.css',
  'src/style/components/settings-layout-contract.css',
  'src/style/components/settings-agents.css',
  'src/style/components/settings-claude-code.css',
  'src/style/components/settings-codex-account.css',
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
    <div class="opencodian-settings opencodian-settings-codex-block">
      <div class="opencodian-settings-codex-group" data-codex-group="runtime-defaults">
        <div class="opencodian-settings-codex-group-header-text">
          <h4 class="opencodian-settings-codex-group-title">Runtime defaults</h4>
          <div class="opencodian-settings-codex-group-desc">Runtime description</div>
        </div>
        <div class="opencodian-settings-codex-group-controls"><div class="setting-item">Runtime control</div></div>
      </div>
      <div class="opencodian-settings-codex-group" data-codex-group="project-config">
        <div class="opencodian-settings-codex-group-header-text">
          <h4 class="opencodian-settings-codex-group-title">Project config</h4>
          <div class="opencodian-settings-codex-group-desc">Project description</div>
        </div>
        <div class="opencodian-settings-codex-group-controls"><div class="setting-item">Project control</div></div>
      </div>
      <div class="opencodian-settings-codex-group" data-codex-group="permissions">
        <div class="opencodian-settings-codex-group-header-text">
          <h4 class="opencodian-settings-codex-group-title">Permissions</h4>
          <div class="opencodian-settings-codex-group-desc">Permissions description</div>
        </div>
        <div class="opencodian-settings-codex-group-controls"><div class="setting-item">Permissions control</div></div>
      </div>
      <div class="opencodian-settings-codex-group" data-codex-group="resume-and-inspect">
        <div class="opencodian-settings-codex-group-header-text">
          <h4 class="opencodian-settings-codex-group-title">Resume and inspect</h4>
          <div class="opencodian-settings-codex-group-desc">Resume description</div>
        </div>
        <div class="opencodian-settings-codex-group-controls"><div class="setting-item">Resume control</div></div>
      </div>
      <div class="opencodian-settings-codex-group" data-codex-group="account-and-status">
        <div class="opencodian-settings-codex-group-header">
          <div class="opencodian-settings-codex-group-header-text">
            <h4 class="opencodian-settings-codex-group-title">Account and status</h4>
            <div class="opencodian-settings-codex-group-desc">Account description</div>
          </div>
          <button type="button">Refresh</button>
        </div>
        <div class="opencodian-settings-codex-group-controls"><div class="setting-item">Account control</div></div>
      </div>
      <div class="opencodian-settings-codex-group" data-codex-group="cost-estimate">
        <h4 class="opencodian-settings-codex-group-title">Cost estimate</h4>
        <div class="opencodian-settings-codex-group-controls"><div class="setting-item">Cost control</div></div>
      </div>
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

  it('keeps all Codex group headings flush and uses one title rhythm', () => {
    const groups = Array.from(document.querySelectorAll<HTMLElement>('[data-codex-group]'));
    expect(groups).toHaveLength(6);
    const codexBlock = document.querySelector<HTMLElement>('.opencodian-settings-codex-block');
    expect(codexBlock).not.toBeNull();
    expect(getComputedStyle(codexBlock as HTMLElement).getPropertyValue('--oc-codex-group-title-desc-gap').trim()).toBe('4px');
    expect(getComputedStyle(codexBlock as HTMLElement).getPropertyValue('--oc-codex-group-header-gap').trim()).toBe('16px');
    const describedGroups = groups.filter((group) => group.querySelector('.opencodian-settings-codex-group-desc'));
    expect(describedGroups).toHaveLength(5);

    for (const group of groups) {
      const title = group.querySelector('.opencodian-settings-codex-group-title');
      const controls = group.querySelector('.opencodian-settings-codex-group-controls');
      expect(title).not.toBeNull();
      expect(controls).not.toBeNull();
      expectFlushHeading(title as Element);
      expect(getComputedStyle(controls as Element).marginTop).toBe('var(--oc-codex-group-header-gap)');
    }

    for (const group of describedGroups) {
      const description = group.querySelector('.opencodian-settings-codex-group-desc') as Element;
      const headerText = description.parentElement;
      expect(headerText).not.toBeNull();
      expect(headerText?.classList.contains('opencodian-settings-codex-group-header-text')).toBe(true);
      expect(getComputedStyle(headerText as Element).gap).toBe('var(--oc-codex-group-title-desc-gap)');
    }
  });
});
