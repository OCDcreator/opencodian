import * as fs from 'fs';
import * as path from 'path';

import { PluginManagementService } from '../../../../src/core/config/PluginManagementService';
import { resolveSecondaryTabId } from '../../../../src/features/settings/settingsLayoutRegistry';
import { setLocale,t } from '../../../../src/i18n';
import {
  buttonRecords,
  createConfigSnapshot,
  createEvidenceSnapshot,
  createSection,
  createTabbedSection,
  flushAsync,
  setupSettingMocks,
} from './SettingsPluginSection.evidence.testSupport';

describe('SettingsPluginSection remote honesty and provenance', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
    buttonRecords.length = 0;
    setupSettingMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows remote honesty banner and local-only labels in remote mode', async () => {
    const { containerEl } = createSection({ serverMode: 'remote' });
    await flushAsync();

    const remoteNotice = containerEl.querySelector('[data-remote-honesty="true"]');
    expect(remoteNotice).not.toBeNull();
    expect(remoteNotice?.textContent).toContain(t('settings.plugins.remoteNotice.label'));
    expect(remoteNotice?.textContent).toContain(t('settings.plugins.remoteNotice.desc'));

    const localOnlyLabels = containerEl.querySelectorAll('[data-local-only="true"]');
    expect(localOnlyLabels.length).toBeGreaterThan(0);
  });

  it('does not show remote honesty banner or local-only labels in local mode', async () => {
    const { containerEl } = createSection({ serverMode: 'local' });
    await flushAsync();

    const remoteNotice = containerEl.querySelector('[data-remote-honesty="true"]');
    expect(remoteNotice).toBeNull();

    const localOnlyLabels = containerEl.querySelectorAll('[data-local-only="true"]');
    expect(localOnlyLabels.length).toBe(0);
  });

  it('renders all 7 config sources with scope, access, path, error and entries', async () => {
    const { containerEl } = createSection();
    await flushAsync();

    const sourceGroups = Array.from(containerEl.querySelectorAll('[data-source-scope]'));
    expect(sourceGroups).toHaveLength(7);

    const editableGroup = sourceGroups.find(
      (group) => group.getAttribute('data-source-access') === 'editable',
    );
    expect(editableGroup).toBeDefined();
    expect(editableGroup?.getAttribute('data-source-path')).toBe('/vault/.opencode/opencode.json');

    const readOnlyGroups = sourceGroups.filter(
      (group) => group.getAttribute('data-source-access') === 'read-only',
    );
    expect(readOnlyGroups).toHaveLength(6);

    const errorGroup = sourceGroups.find((group) =>
      group.querySelector('[data-path-status="error"]'),
    );
    expect(errorGroup).toBeDefined();

    for (const group of sourceGroups) {
      expect(group.querySelector('.opencodian-plugin-source-header')).not.toBeNull();
      expect(group.querySelector('.opencodian-plugin-source-count')).not.toBeNull();
      expect(group.querySelector('.opencodian-plugin-source-path')).not.toBeNull();
      expect(group.querySelector('.opencodian-plugin-source-meta')).not.toBeNull();
    }
  });

  it('keeps source header identity, single path, count and provenance rows intact', async () => {
    const { containerEl } = createSection();
    await flushAsync();

    const canonicalGroup = containerEl.querySelector('[data-source-path="/vault/.opencode/opencode.json"]') as HTMLElement;
    expect(canonicalGroup).not.toBeNull();
    // Header identity shows filename basename only, full path appears once below
    expect(canonicalGroup.querySelector('.opencodian-plugin-source-title')?.textContent)
      .toBe('opencode.json');
    expect(canonicalGroup.querySelectorAll('.opencodian-plugin-source-path-label')).toHaveLength(1);
    expect(canonicalGroup.querySelector('.opencodian-plugin-source-path-label')?.textContent)
      .toBe('/vault/.opencode/opencode.json');
    expect(canonicalGroup.querySelector('.opencodian-plugin-source-count')?.textContent).toBe('1');
    expect(canonicalGroup.querySelector('[data-path-status="available"]')).not.toBeNull();
    expect(canonicalGroup.textContent).toContain(t('settings.plugins.source.scope'));
    expect(canonicalGroup.textContent).toContain(t('settings.plugins.source.access'));
  });

  it('marks managed config and directory rows with local-only in remote mode', async () => {
    const { containerEl } = createSection({
      serverMode: 'remote',
      inspectSnapshot: {
        ...createConfigSnapshot('remote'),
        projectDirectoryPlugins: [
          {
            kind: 'local',
            scope: 'project',
            source: 'directory',
            specifier: '/vault/.opencode/plugins/demo.js',
            displayName: 'demo.js',
            disabled: false,
            fullPath: '/vault/.opencode/plugins/demo.js',
          },
        ],
      },
    });
    await flushAsync();

    const toggles = containerEl.querySelectorAll('.opencodian-plugin-toggle');
    expect(toggles.length).toBeGreaterThan(0);

    for (const toggle of Array.from(toggles)) {
      const row = toggle.closest('.opencodian-plugin-source-item');
      expect(row).not.toBeNull();
      expect(row?.querySelector('[data-local-only="true"]')).not.toBeNull();
    }
  });

  it('tabbed overview subscribes and refreshes SDK evidence exactly once', async () => {
    const { subscribeToOpenCodeEvents, refreshPluginConfigEvidence } = createTabbedSection('overview');
    await flushAsync();

    expect(subscribeToOpenCodeEvents).toHaveBeenCalledTimes(1);
    expect(refreshPluginConfigEvidence).toHaveBeenCalledTimes(1);
  });

  it('tabbed config-sources/project-plugins/omo do not subscribe or refresh SDK evidence', async () => {
    for (const tabId of ['config-sources', 'project-plugins', 'omo'] as const) {
      const { subscribeToOpenCodeEvents, refreshPluginConfigEvidence } = createTabbedSection(tabId);
      await flushAsync();

      expect(subscribeToOpenCodeEvents).not.toHaveBeenCalled();
      expect(refreshPluginConfigEvidence).not.toHaveBeenCalled();
    }
  });

  it('tabbed overview renders evidence sections', async () => {
    const { containerEl } = createTabbedSection('overview');
    await flushAsync();

    const overviewBodyEl = containerEl.querySelector('[data-section-block="overview"] .opencodian-plugin-block-body') as HTMLElement;
    expect(overviewBodyEl).not.toBeNull();
    expect(overviewBodyEl.querySelector('[data-evidence-kind="effective-config"]')).not.toBeNull();
    expect(overviewBodyEl.querySelector('[data-evidence-kind="runtime"]')).not.toBeNull();
    expect(overviewBodyEl.querySelector('[data-evidence-kind="transport"]')).not.toBeNull();
  });

  it('tabbed config-sources renders segmented filter and source groups inside filter host', async () => {
    const { containerEl } = createTabbedSection('config-sources');
    await flushAsync();

    const sourcesBody = containerEl.querySelector('[data-section-block="config-sources"] .opencodian-plugin-block-body') as HTMLElement;
    expect(sourcesBody).not.toBeNull();

    const filterBar = sourcesBody.querySelector('.opencodian-plugin-source-filter');
    expect(filterBar).not.toBeNull();
    expect(filterBar?.getAttribute('role')).toBe('group');

    const filterButtons = Array.from(filterBar?.querySelectorAll<HTMLButtonElement>('.opencodian-plugin-source-filter-button') ?? []);
    expect(filterButtons.map((btn) => btn.dataset.sourceFilter)).toEqual(['all', 'global', 'project']);
    for (const btn of filterButtons) {
      expect(btn.tagName).toBe('BUTTON');
      expect(btn.getAttribute('aria-pressed')).toMatch(/^(true|false)$/);
    }
    expect(filterButtons[0]?.getAttribute('aria-pressed')).toBe('true');
    expect(filterButtons[0]?.classList.contains('is-active')).toBe(true);

    const filterHost = sourcesBody.querySelector('.opencodian-plugin-source-filter-host') as HTMLElement;
    expect(filterHost).not.toBeNull();
    expect(filterHost.dataset.sourceFilter).toBe('all');

    const sourceGroups = Array.from(filterHost.querySelectorAll('[data-source-scope]'));
    expect(sourceGroups.length).toBeGreaterThan(0);
    const scopeValues = new Set(sourceGroups.map((g) => g.getAttribute('data-source-scope')));
    expect(scopeValues.has('global')).toBe(true);
    expect(scopeValues.has('project')).toBe(true);
  });

  it('tabbed config-sources filter narrows visible scopes when clicked', async () => {
    const { containerEl } = createTabbedSection('config-sources');
    await flushAsync();

    const filterBar = containerEl.querySelector('.opencodian-plugin-source-filter') as HTMLElement;
    const projectBtn = filterBar.querySelector<HTMLButtonElement>('[data-source-filter="project"]');
    expect(projectBtn).not.toBeNull();
    projectBtn?.click();

    const filterHost = containerEl.querySelector('.opencodian-plugin-source-filter-host') as HTMLElement;
    // Click updates the host's data-source-filter; CSS rules in config-editor-modal.css
    // hide [data-source-scope="global"] when host is [data-source-filter="project"].
    expect(filterHost.dataset.sourceFilter).toBe('project');
    expect(projectBtn?.getAttribute('aria-pressed')).toBe('true');
    expect(projectBtn?.classList.contains('is-active')).toBe(true);

    // "All" filter is no longer pressed.
    const allBtn = filterBar.querySelector<HTMLButtonElement>('[data-source-filter="all"]');
    expect(allBtn?.getAttribute('aria-pressed')).toBe('false');
    expect(allBtn?.classList.contains('is-active')).toBe(false);

    // Project scope entries still exist in DOM (CSS hides non-matching).
    const projectGroups = filterHost.querySelectorAll('[data-source-scope="project"]');
    expect(projectGroups.length).toBeGreaterThan(0);
  });

  it('tabbed config-sources CSS hides non-matching scopes based on filter host state', () => {
    const css = fs.readFileSync(
      path.join(process.cwd(), 'src/style/modals/config-editor-modal.css'),
      'utf8',
    );
    // CSS visibility filter: hide project when narrowed to global, and vice versa.
    expect(css).toMatch(/data-source-filter="global"\]\s*\[data-source-scope="project"\]/);
    expect(css).toMatch(/data-source-filter="project"\]\s*\[data-source-scope="global"\]/);
  });

  it('legacy global and project-directory tab ids resolve to config-sources and project-plugins via registry', () => {
    // Legacy IDs are normalized by settingsLayoutRegistry before reaching attachTabbed.
    // This keeps persisted `global` / `project-directory` values valid across upgrades.
    expect(resolveSecondaryTabId('plugins', 'global')).toBe('config-sources');
    expect(resolveSecondaryTabId('plugins', 'project-directory')).toBe('project-plugins');
    // Canonical IDs pass through unchanged.
    expect(resolveSecondaryTabId('plugins', 'config-sources')).toBe('config-sources');
    expect(resolveSecondaryTabId('plugins', 'project-plugins')).toBe('project-plugins');
    expect(resolveSecondaryTabId('plugins', 'overview')).toBe('overview');
    expect(resolveSecondaryTabId('plugins', 'omo')).toBe('omo');
    // Unknown plugin secondary tab id falls back to the plugin default (overview).
    expect(resolveSecondaryTabId('plugins', 'nope')).toBe('overview');
  });

  it('passes empty runtime and stale runtime through listener without inventing loaded truth', async () => {
    const { containerEl, evidenceListeners } = createSection({
      evidence: createEvidenceSnapshot({ runtime: [], staleRuntime: [] }),
    });
    await flushAsync();

    const runtimeEl = containerEl.querySelector('[data-evidence-kind="runtime"]') as HTMLElement;
    expect(runtimeEl.textContent).toContain(t('settings.plugins.evidence.noRuntimeIds'));

    evidenceListeners[0](createEvidenceSnapshot({
      runtime: [],
      staleRuntime: [],
    }));

    expect(runtimeEl.textContent).toContain(t('settings.plugins.evidence.noRuntimeIds'));
  });
});

describe('SettingsPluginSection config-sources filter invariant', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
    buttonRecords.length = 0;
    setupSettingMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('regression: filter to project -> refresh -> filter to all keeps both scopes in DOM', async () => {
    // Regression for the invariant: renderPluginSources must always render
    // every config source into the filter host, regardless of the active
    // filter. Visibility is controlled exclusively by CSS via the host's
    // data-source-filter attribute.
    //
    // Previously renderPluginSources pre-filtered the DOM by the active
    // filter, so a refresh triggered by a managed action (toggle/delete)
    // rebuilt only the project DOM. Clicking All afterwards could not
    // restore the global sources because they had never been re-rendered.
    const snapshot = createConfigSnapshot('local', ['managed-plugin']);
    const inspectSpy = jest
      .spyOn(PluginManagementService.prototype, 'inspect')
      .mockResolvedValue(snapshot);

    const { containerEl, section } = createTabbedSection('config-sources');
    await flushAsync();

    const filterHost0 = containerEl.querySelector('.opencodian-plugin-source-filter-host') as HTMLElement;
    // Sanity check: both scopes present at start.
    expect(filterHost0.querySelectorAll('[data-source-scope="global"]').length).toBeGreaterThan(0);
    expect(filterHost0.querySelectorAll('[data-source-scope="project"]').length).toBeGreaterThan(0);

    // User narrows to project (CSS-only; DOM unchanged).
    containerEl.querySelector<HTMLButtonElement>('[data-source-filter="project"]')?.click();
    expect(section['configSourceFilter' as keyof typeof section]).toBe('project');

    // Trigger the same refresh path a managed action uses: attachTabbed
    // disposes the previous run and calls createRefreshFn -> inspect ->
    // renderPluginSources(filterHost, snap, ctx). The filter state survives
    // across the re-attach because configSourceFilter is a section-instance
    // field, not a DOM-derived value.
    const refreshedContainer = document.createElement('div');
    document.body.appendChild(refreshedContainer);
    section.attachTabbed(refreshedContainer, 'config-sources');
    await flushAsync();

    const filterHost = refreshedContainer.querySelector('.opencodian-plugin-source-filter-host') as HTMLElement;
    expect(filterHost).not.toBeNull();
    // The filter UI reflects the preserved selection.
    expect(filterHost.dataset.sourceFilter).toBe('project');

    // After the refresh, BOTH scopes MUST still exist in DOM. This is the
    // core invariant: CSS hides global, but the elements are present.
    expect(filterHost.querySelectorAll('[data-source-scope="global"]').length).toBeGreaterThan(0);
    expect(filterHost.querySelectorAll('[data-source-scope="project"]').length).toBeGreaterThan(0);

    // User clicks All: only the host attribute changes; both scopes must
    // remain in DOM (this would fail pre-fix because global source groups
    // were never rebuilt after the project-filtered refresh).
    refreshedContainer.querySelector<HTMLButtonElement>('[data-source-filter="all"]')?.click();
    expect(filterHost.dataset.sourceFilter).toBe('all');
    expect(filterHost.querySelectorAll('[data-source-scope="global"]').length).toBeGreaterThan(0);
    expect(filterHost.querySelectorAll('[data-source-scope="project"]').length).toBeGreaterThan(0);

    inspectSpy.mockRestore();
  });

  it('renderPluginSources emits every config source even when filter is narrowed', async () => {
    // Direct invariant test: even when configSourceFilter is set to 'project',
    // the rendered DOM must contain every config source from the snapshot.
    const snapshot = createConfigSnapshot('local', ['managed-plugin']);
    expect((snapshot.configSources ?? []).filter((s) => s.scope === 'global').length).toBeGreaterThan(0);
    expect((snapshot.configSources ?? []).filter((s) => s.scope === 'project').length).toBeGreaterThan(0);

    const inspectSpy = jest
      .spyOn(PluginManagementService.prototype, 'inspect')
      .mockResolvedValue(snapshot);

    const { containerEl, section } = createTabbedSection('config-sources');
    await flushAsync();

    // Narrow to project via the filter button (sets section.configSourceFilter).
    containerEl.querySelector<HTMLButtonElement>('[data-source-filter="project"]')?.click();

    // Drive a re-render via the same refresh path used by managed actions.
    const container2 = document.createElement('div');
    document.body.appendChild(container2);
    section.attachTabbed(container2, 'config-sources');
    await flushAsync();

    const host2 = container2.querySelector('.opencodian-plugin-source-filter-host') as HTMLElement;
    const renderedScopes = new Set(
      Array.from(host2.querySelectorAll('[data-source-scope]'))
        .map((el) => el.getAttribute('data-source-scope')),
    );
    // Every scope present in the snapshot must appear in the rendered DOM,
    // independent of the active filter state.
    for (const scope of ['global', 'project']) {
      expect(renderedScopes.has(scope)).toBe(true);
    }

    inspectSpy.mockRestore();
  });
});
