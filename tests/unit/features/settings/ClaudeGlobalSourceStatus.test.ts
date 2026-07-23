/**
 * Claude global source-status regression tests.
 *
 * Verifies the "discovered but not enabled" status for global Claude resources
 * when the `user` setting source is disabled, the "enabled" status when it is
 * on, and that project resources are never marked with the global/disabled
 * status. Covers the pure helper that drives the badge rendering.
 */
import { resolveClaudeResourceScopeStatus } from '../../../../src/features/settings/SettingsClaudeResourcesSection';

describe('resolveClaudeResourceScopeStatus', () => {
  it('marks a global resource as discovered-not-enabled when user source is off', () => {
    const status = resolveClaudeResourceScopeStatus({ readonly: true }, false);
    expect(status.cls).toBe('opencodian-claude-resource-scope is-global-disabled');
    // English copy asserts the disabled phrasing.
    expect(status.label).toContain('discovered');
    expect(status.label).toContain('not enabled');
  });

  it('marks a global resource as enabled when user source is on', () => {
    const status = resolveClaudeResourceScopeStatus({ readonly: true }, true);
    expect(status.cls).toBe('opencodian-claude-resource-scope is-global');
    expect(status.label).toContain('enabled');
    expect(status.label).not.toContain('discovered');
  });

  it('never marks a project resource with the global/disabled status', () => {
    const disabled = resolveClaudeResourceScopeStatus({ readonly: false }, false);
    const enabled = resolveClaudeResourceScopeStatus({ readonly: false }, true);
    expect(disabled.cls).toBe('opencodian-claude-resource-scope is-project');
    expect(enabled.cls).toBe('opencodian-claude-resource-scope is-project');
    expect(disabled.label).toBe(enabled.label);
    expect(disabled.label.toLowerCase()).toContain('project');
  });

  it('disabled vs enabled global statuses are clearly distinct', () => {
    const disabled = resolveClaudeResourceScopeStatus({ readonly: true }, false);
    const enabled = resolveClaudeResourceScopeStatus({ readonly: true }, true);
    expect(disabled.cls).not.toBe(enabled.cls);
    expect(disabled.label).not.toBe(enabled.label);
  });
});
