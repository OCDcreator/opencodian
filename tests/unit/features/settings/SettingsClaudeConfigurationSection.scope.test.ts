import type { ClaudeSettingsSourceCandidate } from '../../../../src/core/agents/backend/ClaudeSettingsSourceService';
import {
  isConfigurationSourceSelectable,
  resolveConfigurationScopeSelection,
  SettingsClaudeConfigurationSection,
} from '../../../../src/features/settings/SettingsClaudeConfigurationSection';
import { candidate, fakePlugin, flushMicrotasks, stubService } from './SettingsClaudeConfigurationSection.testSupport';

describe('SettingsClaudeConfigurationSection scope selection model', () => {
  it('defaults to Project and never selects Global implicitly', () => {
    expect(resolveConfigurationScopeSelection(null)).toBe('project');
    expect(resolveConfigurationScopeSelection(undefined)).toBe('project');
    expect(resolveConfigurationScopeSelection('managed')).toBe('project');
    expect(resolveConfigurationScopeSelection('unknown')).toBe('project');
  });

  it('honors an explicit Global or Local selection, but only those', () => {
    expect(resolveConfigurationScopeSelection('global')).toBe('global');
    expect(resolveConfigurationScopeSelection('local')).toBe('local');
    expect(resolveConfigurationScopeSelection('project')).toBe('project');
  });

  it('marks managed sources as not selectable for editing', () => {
    expect(isConfigurationSourceSelectable({ scope: 'project', editable: true })).toBe(true);
    expect(isConfigurationSourceSelectable({ scope: 'managed', editable: false })).toBe(false);
    expect(isConfigurationSourceSelectable({ scope: 'managed', editable: true })).toBe(false);
    expect(isConfigurationSourceSelectable({ scope: 'project', editable: false })).toBe(false);
  });
});

describe('SettingsClaudeConfigurationSection source DOM', () => {
  beforeEach(() => { document.body.innerHTML = ''; });
  afterEach(() => { document.body.innerHTML = ''; });

  it('renders with Project as the default target and shows its path', () => {
    const body = document.createElement('div');
    document.body.appendChild(body);
    new SettingsClaudeConfigurationSection({
      plugin: fakePlugin('/vault') as never,
      sourceService: stubService(),
    }).render(body);
    const select = body.querySelector('[data-claude-config-scope]') as HTMLSelectElement;
    expect(select.value).toBe('project');
    expect(body.querySelector('[data-claude-config-target]')?.textContent).toBe('/vault/.claude/settings.json');
  });

  it('switches to Global or Local only after an explicit selection', () => {
    const body = document.createElement('div');
    document.body.appendChild(body);
    new SettingsClaudeConfigurationSection({ plugin: fakePlugin('/vault') as never, sourceService: stubService() }).render(body);
    const select = body.querySelector('[data-claude-config-scope]') as HTMLSelectElement;
    select.value = 'global';
    select.dispatchEvent(new Event('change'));
    expect(body.querySelector('[data-claude-config-target]')?.textContent).toBe('/home/.claude/settings.json');
    select.value = 'local';
    select.dispatchEvent(new Event('change'));
    expect(body.querySelector('[data-claude-config-target]')?.textContent).toBe('/vault/.claude/settings.local.json');
    select.value = 'managed';
    select.dispatchEvent(new Event('change'));
    expect(body.querySelector('[data-claude-config-target]')?.textContent).toBe('/vault/.claude/settings.json');
  });

  it('renders independent evidence and marks managed sources read-only', async () => {
    const body = document.createElement('div');
    document.body.appendChild(body);
    new SettingsClaudeConfigurationSection({
      plugin: fakePlugin('/vault') as never,
      sourceService: stubService({
        inventory: async () => [
          candidate({ scope: 'project', origin: 'project-settings', priority: 100 }),
          candidate({ scope: 'managed', origin: 'managed-file', editable: false, priority: 400, evidence: { persistence: 'unavailable', application: 'unavailable', runtime: 'unavailable' } }),
        ],
      }),
    }).render(body);
    await flushMicrotasks();
    const sources = body.querySelector('[data-claude-config-sources]')!;
    expect(sources.querySelector('[data-claude-config-evidence="project"]')?.textContent).toContain('persistence=verified');
    expect(sources.querySelector('[data-claude-config-evidence="managed"]')?.textContent).toContain('persistence=unavailable');
    expect(sources.querySelector('[data-claude-config-readonly="managed"]')).toBeTruthy();
    expect(sources.querySelector('[data-claude-config-readonly="project"]')).toBeFalsy();
  });

  it('generation-fences stale inventory so it cannot overwrite a newer render', async () => {
    let resolveFirst: (value: ClaudeSettingsSourceCandidate[]) => void = () => {};
    const first = new Promise<ClaudeSettingsSourceCandidate[]>((resolve) => { resolveFirst = resolve; });
    const body = document.createElement('div');
    document.body.appendChild(body);
    const section = new SettingsClaudeConfigurationSection({
      plugin: fakePlugin('/vault') as never,
      sourceService: stubService({
        inventory: jest.fn().mockImplementationOnce(() => first).mockImplementationOnce(async () => [candidate({ origin: 'project-settings-fresh' })]),
      }),
    });
    section.render(body);
    section.render(body);
    await flushMicrotasks();
    resolveFirst([candidate({ origin: 'project-settings-STALE' })]);
    await flushMicrotasks();
    expect(body.querySelector('[data-claude-config-sources]')?.textContent).toContain('project-settings-fresh');
    expect(body.querySelector('[data-claude-config-sources]')?.textContent).not.toContain('STALE');
  });

  it('surfaces inventory failure inline', async () => {
    const body = document.createElement('div');
    document.body.appendChild(body);
    new SettingsClaudeConfigurationSection({
      plugin: fakePlugin('/vault') as never,
      sourceService: stubService({ inventory: async () => { throw new Error('boom'); } }),
    }).render(body);
    await flushMicrotasks();
    expect(body.querySelector('[data-claude-config-error]')).toBeTruthy();
  });
});
