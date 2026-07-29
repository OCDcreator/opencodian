import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const stylesheetPaths = [
  'src/style/components/settings-codex-account.css',
  'src/style/components/settings-codex-resources.css',
  'src/style/components/settings-claude-resources.css',
  'src/style/components/settings-claude-code.css',
];

function loadStylesheets(): string {
  return stylesheetPaths
    .map((relativePath) => readFileSync(join(process.cwd(), relativePath), 'utf8'))
    .join('\n');
}

function mountFixture(): HTMLElement {
  document.head.innerHTML = '';
  document.body.innerHTML = `
    <div class="opencodian-settings vertical-tab-content opencodian-settings-codex-block">
      <div class="opencodian-codex-account-card">
        <div class="opencodian-codex-account-card-header">
          <h4 class="opencodian-codex-account-card-title">Account</h4>
          <button class="opencodian-codex-account-card-refresh">Refresh</button>
        </div>
      </div>
      <div class="opencodian-codex-provider-configuration-status">
        <div class="opencodian-codex-provider-configuration-status-header">
          <h4 class="opencodian-codex-provider-configuration-status-title">Provider</h4>
        </div>
        <span class="opencodian-codex-provider-configuration-status-state">External</span>
      </div>
      <div class="opencodian-settings-codex-group">
        <div class="opencodian-settings-codex-group-header">
          <div class="opencodian-settings-codex-group-header-text">
            <h4 class="opencodian-settings-codex-group-title">Group</h4>
            <p class="opencodian-settings-codex-group-desc">Description</p>
          </div>
          <button>Refresh all</button>
        </div>
      </div>
      <div class="opencodian-codex-account-usage-buckets">
        <p class="opencodian-codex-account-usage-buckets-title">Recent days</p>
        <div class="opencodian-codex-account-usage-bars"></div>
        <div class="opencodian-codex-account-usage-labels"></div>
      </div>
      <div class="opencodian-codex-account-rate-limit-groups">
        <p class="opencodian-codex-account-usage-buckets-title">By tier</p>
        <div class="opencodian-codex-account-rate-limit-group">
          <p class="opencodian-codex-account-rate-limit-group-title">Tier</p>
          <div class="opencodian-codex-account-rows"></div>
        </div>
      </div>
      <div class="opencodian-codex-global-config-summary-providers">
        <h5 class="opencodian-codex-global-config-summary-providers-title">Providers</h5>
        <div>Provider row</div>
      </div>
      <div class="opencodian-codex-project-config-advanced">
        <h5 class="opencodian-codex-project-config-advanced-title">Advanced</h5>
        <div class="opencodian-codex-project-config-advanced-desc">TOML</div>
        <textarea></textarea>
      </div>
      <div class="opencodian-codex-resource-group-header">
        <h4 class="opencodian-codex-resource-group-title">Codex resources</h4>
        <button>New</button>
      </div>
      <div class="opencodian-claude-resource-group-header">
        <h4 class="opencodian-claude-resource-group-title">Claude resources</h4>
        <button>New</button>
      </div>
      <div class="opencodian-claude-code-group-header">
        <h4 class="opencodian-claude-code-group-title">Claude Code</h4>
        <button>Help</button>
      </div>
    </div>
  `;

  const hostStyle = document.createElement('style');
  hostStyle.textContent = `
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

  return document.querySelector('.opencodian-settings') as HTMLElement;
}

describe('Codex settings title alignment contract', () => {
  beforeEach(() => {
    mountFixture();
  });

  it('wins over host heading spacing with zero margin and padding', () => {
    const titleClasses = [
      'opencodian-codex-account-card-title',
      'opencodian-codex-provider-configuration-status-title',
      'opencodian-settings-codex-group-title',
      'opencodian-codex-account-usage-buckets-title',
      'opencodian-codex-account-rate-limit-group-title',
      'opencodian-codex-global-config-summary-providers-title',
      'opencodian-codex-project-config-advanced-title',
      'opencodian-codex-resource-group-title',
      'opencodian-claude-resource-group-title',
      'opencodian-claude-code-group-title',
    ];

    for (const titleClass of titleClasses) {
      const title = document.querySelector(`.${titleClass}`);
      expect(title).not.toBeNull();
      const computed = getComputedStyle(title as Element);
      expect(computed.marginTop).toBe('0px');
      expect(computed.marginRight).toBe('0px');
      expect(computed.marginBottom).toBe('0px');
      expect(computed.marginLeft).toBe('0px');
      expect(computed.paddingLeft).toBe('0px');
      expect(computed.paddingRight).toBe('0px');
      expect(computed.paddingTop).toBe('0px');
      expect(computed.paddingBottom).toBe('0px');
    }
  });

  it('centers title rows through their parent layout owners', () => {
    const centeredParents = [
      '.opencodian-codex-account-card-header',
      '.opencodian-codex-provider-configuration-status-header',
      '.opencodian-settings-codex-group-header',
      '.opencodian-codex-resource-group-header',
      '.opencodian-claude-resource-group-header',
      '.opencodian-claude-code-group-header',
    ];

    for (const selector of centeredParents) {
      const parent = document.querySelector(selector);
      expect(parent).not.toBeNull();
      expect(getComputedStyle(parent as Element).alignItems).toBe('center');
    }
  });

  it('moves title-to-content rhythm to parent gaps instead of heading margins', () => {
    const css = loadStylesheets();
    expect(css).toMatch(
      /\.opencodian-codex-account-usage-buckets\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*gap:/s,
    );
    expect(css).toMatch(
      /\.opencodian-codex-account-rate-limit-groups\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*gap:/s,
    );
    expect(css).toMatch(
      /\.opencodian-settings-codex-group-header-text\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*gap:\s*var\(--oc-codex-group-title-desc-gap\)/s,
    );
    expect(css).not.toMatch(
      /opencodian-codex-account-(usage-buckets|rate-limit-group)-title[^}]*margin:\s*0\s+0/s,
    );
  });
});
