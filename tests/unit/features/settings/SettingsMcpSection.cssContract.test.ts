import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('SettingsMcpSection CSS contract', () => {
  it('keeps MCP management surfaces aligned with the shared settings hierarchy contract', () => {
    const css = readFileSync(
      join(process.cwd(), 'src/style/modals/config-editor-modal.css'),
      'utf8',
    );

    const findRule = (selector: string, required: string): string => (
      Array.from(css.matchAll(new RegExp(`${selector}\\s*\\{[^}]*\\}`, 'g')))
        .map((match) => match[0])
        .find((rule) => rule.includes(required)) ?? ''
    );

    const toolbarRule = findRule('\\.opencodian-mcp-overview-toolbar', 'background:');
    const shellRule = findRule('\\.opencodian-mcp-settings-shell,\\s*\\.opencodian-mcp-add-form-layout', 'gap:');
    const overviewShellRule = findRule('\\.opencodian-mcp-overview-shell', 'background:');
    const overviewCardRule = findRule('\\.opencodian-mcp-overview-card', 'background:');
    const serverCardRule = findRule(
      '\\.opencodian-mcp-server-row,\\s*\\.opencodian-mcp-server-card',
      'background:',
    );
    const serverListRule = findRule('\\.opencodian-mcp-server-list', 'overflow:');
    const mcpScrollContentRule = findRule('\\.opencodian-settings-scrollarea-content--mcp', 'gap:');
    const actionSettingRule = findRule(
      '\\.opencodian-mcp-server-row-actions \\.setting-item,\\s*\\.opencodian-mcp-server-card-actions \\.setting-item',
      'box-shadow:',
    );
    const helperRule = findRule(
      '\\.opencodian-mcp-server-row-error,\\s*\\.opencodian-mcp-server-card-helper',
      'background:',
    );
    const emptyRule = findRule('\\.opencodian-mcp-empty', 'background:');
    const detailsRule = findRule(
      '\\.opencodian-mcp-details-summary,\\s*\\.opencodian-mcp-details-section,\\s*\\.opencodian-mcp-details-technical',
      'background:',
    );
    const formGroupRule = findRule('\\.opencodian-mcp-form-group', 'background:');
    const classicOverviewShellRule = findRule(
      '\\.opencodian-settings\\[data-settings-layout-mode="classic"\\] \\.opencodian-mcp-overview-shell',
      'gap:',
    );
    const classicServerListShellRule = findRule(
      '\\.opencodian-settings\\[data-settings-layout-mode="classic"\\] \\.opencodian-mcp-server-list-shell',
      'border-top:',
    );
    const classicServerListRule = findRule(
      '\\.opencodian-settings\\[data-settings-layout-mode="classic"\\] \\.opencodian-mcp-server-list',
      'gap:',
    );
    const mcpCss = css.slice(
      css.indexOf('.opencodian-mcp-overview-shell'),
      css.indexOf('.opencodian-plugin-summary-list'),
    );
    const mcpCssWithoutBadges = mcpCss.replace(
      /\.opencodian-mcp-badge[\s\S]*?\.opencodian-mcp-transport-badge/,
      '',
    );

    expect(shellRule).toContain('var(--opencodian-settings-space-lg');
    expect(overviewShellRule).toContain('var(--opencodian-settings-inline-bg');
    expect(overviewShellRule).toContain('var(--opencodian-settings-radius-row');
    expect(toolbarRule).toContain('background: transparent');
    expect(toolbarRule).toContain('border: none');
    expect(overviewCardRule).toContain('var(--opencodian-settings-inline-border');
    expect(overviewCardRule).toContain('border-radius: 999px');
    expect(overviewCardRule).toContain('box-shadow: none');
    expect(serverCardRule).toContain('var(--opencodian-settings-form-row-bg');
    expect(serverCardRule).toContain('var(--opencodian-settings-form-row-radius');
    expect(serverCardRule).toContain('box-shadow: none');
    expect(serverListRule).toContain('overflow: hidden');
    expect(mcpScrollContentRule).toContain('var(--opencodian-settings-space-md');
    expect(actionSettingRule).toContain('background: transparent');
    expect(helperRule).toContain('var(--opencodian-settings-row-bg');
    expect(emptyRule).toContain('var(--opencodian-settings-row-bg');
    expect(detailsRule).toContain('var(--opencodian-settings-object-bg');
    expect(formGroupRule).toContain('var(--opencodian-settings-object-bg');
    expect(classicOverviewShellRule).toBe('');
    expect(classicServerListShellRule).toBe('');
    expect(classicServerListRule).toBe('');
    expect(mcpCssWithoutBadges).not.toContain('linear-gradient');
    expect(mcpCssWithoutBadges).not.toContain('backdrop-filter');
    expect(mcpCssWithoutBadges).not.toContain('transform: translateY');
    expect(mcpCssWithoutBadges).not.toMatch(/border-left:\s*[2-9]px/);
  });
});
