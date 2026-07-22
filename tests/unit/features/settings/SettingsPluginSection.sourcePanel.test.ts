import * as fs from 'fs';
import * as path from 'path';

import type { PluginEnvironmentSnapshot } from '../../../../src/core/config/PluginManagementService';
import { PluginManagementService } from '../../../../src/core/config/PluginManagementService';
import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { SettingsPluginSection } from '../../../../src/features/settings/SettingsPluginSection';
import { setLocale, t } from '../../../../src/i18n';
import type OpenCodianPlugin from '../../../../src/main';

function createSnapshotWithSource(overrides: Partial<PluginEnvironmentSnapshot> = {}): PluginEnvironmentSnapshot {
  return {
    serviceMode: 'local',
    isolationMode: 'default',
    vaultConfigDir: '/vault/.opencode',
    globalConfigPath: '/Users/test/.config/opencode/opencode.json',
    projectConfigPath: '/vault/.opencode/opencode.json',
    globalConfigSpecs: [],
    projectConfigSpecs: ['managed-plugin'],
    globalConfigPlugins: [],
    globalDirectoryPlugins: [],
    projectConfigPlugins: [
      {
        kind: 'npm',
        scope: 'project',
        source: 'config',
        specifier: 'managed-plugin',
        displayName: 'managed-plugin',
        disabled: false,
      },
    ],
    projectDirectoryPlugins: [],
    disabledProjectConfigPlugins: [],
    disabledProjectDirectoryPlugins: [],
    globalDirectories: [],
    projectDirectories: [],
    globalInfluenceDetected: false,
    omoConfigPath: '/vault/.opencode/oh-my-opencode.jsonc',
    omoConfigExists: false,
    configSources: [
      {
        scope: 'global',
        path: '/Users/test/.config/opencode/opencode.json',
        exists: true,
        editable: false,
        specs: [],
        plugins: [],
      },
      {
        scope: 'global',
        path: '/Users/test/.config/opencode/opencode.jsonc',
        exists: false,
        editable: false,
        specs: [],
        plugins: [],
      },
      {
        scope: 'project',
        path: '/vault/.opencode/opencode.json',
        exists: true,
        editable: true,
        specs: ['managed-plugin'],
        plugins: [
          {
            kind: 'npm',
            scope: 'project',
            source: 'config',
            specifier: 'managed-plugin',
            displayName: 'managed-plugin',
            disabled: false,
          },
        ],
      },
      {
        scope: 'project',
        path: '/vault/.opencode/opencode.jsonc',
        exists: true,
        editable: false,
        specs: [],
        plugins: [],
        error: 'Unexpected token } at line 4',
      },
    ],
    ...overrides,
  };
}

function createSection() {
  const app = {
    vault: { adapter: { basePath: '/vault' } },
  };
  const plugin = {
    app,
    settings: DEFAULT_SETTINGS,
    saveSettings: jest.fn(),
  };
  const section = new SettingsPluginSection({
    app: app as unknown as never,
    plugin: plugin as unknown as OpenCodianPlugin,
    createSectionHeading: (containerEl: HTMLElement, title: string) => containerEl.createEl('h2', { text: title }),
    applyInlineCodeText: (targetEl, text) => {
      if (targetEl) targetEl.textContent = text;
    },
    setSettingNameWithFormatting: (setting, text) => {
      setting.setName(text);
    },
    setSettingDescWithFormatting: (setting, text) => {
      setting.setDesc(text);
    },
  });
  const containerEl = document.createElement('div');
  document.body.appendChild(containerEl);
  section.attach(containerEl);
  return { containerEl, section };
}

async function flushAsync() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('SettingsPluginSection source panel structure', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
    jest.spyOn(PluginManagementService.prototype, 'inspect').mockResolvedValue(createSnapshotWithSource());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders full path exactly once per source group', async () => {
    const { containerEl } = createSection();
    await flushAsync();

    const canonical = containerEl.querySelector('[data-source-path="/vault/.opencode/opencode.json"]') as HTMLElement;
    expect(canonical).not.toBeNull();

    // Title shows the basename only, not the full path.
    const titleText = canonical.querySelector('.opencodian-plugin-source-title')?.textContent ?? '';
    expect(titleText).toBe('opencode.json');
    expect(titleText).not.toContain('/vault/');

    // Exactly one path-label element holding the full path.
    const pathLabels = canonical.querySelectorAll('.opencodian-plugin-source-path-label');
    expect(pathLabels).toHaveLength(1);
    expect(pathLabels[0]?.textContent).toBe('/vault/.opencode/opencode.json');
  });

  it('uses semantic dl/dt/dd for compact metadata rows instead of nested cards', async () => {
    const { containerEl } = createSection();
    await flushAsync();

    const canonical = containerEl.querySelector('[data-source-path="/vault/.opencode/opencode.json"]') as HTMLElement;
    const meta = canonical.querySelector('.opencodian-plugin-source-meta');
    expect(meta).not.toBeNull();
    expect(meta?.tagName).toBe('DL');

    const rows = meta?.querySelectorAll('.opencodian-plugin-source-meta-row');
    expect(rows?.length).toBeGreaterThanOrEqual(2);
    for (const row of Array.from(rows ?? [])) {
      const dt = row.querySelector('dt.opencodian-plugin-source-meta-label');
      const dd = row.querySelector('dd.opencodian-plugin-source-meta-value');
      expect(dt).not.toBeNull();
      expect(dd).not.toBeNull();
      // No card-like styling on individual metadata rows.
      expect(row.tagName).not.toBe('SECTION');
    }
  });

  it('treats a missing candidate path as a neutral muted state, not an error', async () => {
    const { containerEl } = createSection();
    await flushAsync();

    const missing = containerEl.querySelector('[data-source-path="/Users/test/.config/opencode/opencode.jsonc"]') as HTMLElement;
    expect(missing).not.toBeNull();

    // data-path-status is "missing", not "error".
    expect(missing.querySelector('.opencodian-plugin-source-path')?.getAttribute('data-path-status')).toBe('missing');
    // Status text is the muted "missing" string.
    expect(missing.querySelector('.opencodian-plugin-source-path-status')?.textContent)
      .toBe(t('settings.plugins.source.statusMissing'));
    // A reassuring missingHelp note is rendered, not an error.
    expect(missing.querySelector('.opencodian-plugin-source-meta-note[data-note-kind="missing"]')).not.toBeNull();
    expect(missing.querySelector('.opencodian-plugin-source-meta-row.is-error')).toBeNull();
  });

  it('renders parse errors with error semantics distinct from missing', async () => {
    const { containerEl } = createSection();
    await flushAsync();

    const errorGroup = containerEl.querySelector('[data-source-path="/vault/.opencode/opencode.jsonc"]') as HTMLElement;
    expect(errorGroup).not.toBeNull();

    expect(errorGroup.querySelector('.opencodian-plugin-source-path')?.getAttribute('data-path-status')).toBe('error');
    expect(errorGroup.querySelector('.opencodian-plugin-source-path-status')?.textContent)
      .toBe(t('settings.plugins.source.statusError'));
    // Error metadata row carries the is-error modifier.
    const errorRow = errorGroup.querySelector('.opencodian-plugin-source-meta-row.is-error');
    expect(errorRow).not.toBeNull();
    expect(errorRow?.textContent).toContain(t('settings.plugins.source.error'));
    expect(errorRow?.textContent).toContain('Unexpected token } at line 4');
  });

  it('keeps empty source entries subdued and inline rather than full cards', async () => {
    const { containerEl } = createSection();
    await flushAsync();

    const empty = containerEl.querySelector('[data-source-path="/Users/test/.config/opencode/opencode.json"]') as HTMLElement;
    expect(empty).not.toBeNull();

    const emptyEl = empty.querySelector('.opencodian-plugin-source-empty');
    expect(emptyEl).not.toBeNull();
    expect(emptyEl?.getAttribute('data-empty-kind')).toBe('no-entries');
    expect(emptyEl?.textContent).toBe(t('settings.plugins.source.empty'));
  });

  it('renders scope and access as low-chroma badges in the header, not as separate rows', async () => {
    const { containerEl } = createSection();
    await flushAsync();

    const canonical = containerEl.querySelector('[data-source-path="/vault/.opencode/opencode.json"]') as HTMLElement;
    const header = canonical.querySelector('.opencodian-plugin-source-header');
    expect(header).not.toBeNull();

    const scopeBadge = header?.querySelector('.opencodian-plugin-source-scope-badge[data-scope="project"]');
    const accessBadge = header?.querySelector('.opencodian-plugin-source-access-badge[data-access="editable"]');
    expect(scopeBadge?.textContent).toBe(t('settings.plugins.source.scopeProject'));
    expect(accessBadge?.textContent).toBe(t('settings.plugins.source.editable'));
  });

  it('renders source entries as flat separated rows without nested cards', async () => {
    const { containerEl } = createSection();
    await flushAsync();

    const canonical = containerEl.querySelector('[data-source-path="/vault/.opencode/opencode.json"]') as HTMLElement;
    const list = canonical.querySelector('.opencodian-plugin-source-list');
    expect(list).not.toBeNull();

    const items = list?.querySelectorAll('.opencodian-plugin-source-item');
    expect(items?.length).toBe(1);

    // The source-list is a sibling of meta, not nested inside it.
    expect(list?.parentElement).toBe(canonical);
    expect(canonical.querySelector('.opencodian-plugin-source-meta .opencodian-plugin-source-list')).toBeNull();
  });
});

describe('SettingsPluginSection source panel CSS selector contract', () => {
  it('uses stable selectors and aria semantics for the filter', () => {
    const css = fs.readFileSync(
      path.join(process.cwd(), 'src/style/modals/config-editor-modal.css'),
      'utf8',
    );

    // Active button uses interactive-accent for selected state.
    expect(css).toMatch(/\.opencodian-plugin-source-filter-button\.is-active\s*\{[^}]*--interactive-accent/);
    // Focus-visible state exists for keyboard users.
    expect(css).toMatch(/\.opencodian-plugin-source-filter-button:focus-visible/);
    // Stable data-attribute selector for the host so production CSS and tests can rely on it.
    expect(css).toMatch(/\.opencodian-plugin-source-filter-host\[data-source-filter=/);
  });

  it('keeps the filter bar compact on wide screens and full-width on narrow screens', () => {
    const css = fs.readFileSync(
      path.join(process.cwd(), 'src/style/modals/config-editor-modal.css'),
      'utf8',
    );

    // Wide-screen (base rule, outside @media): filter must shrink to fit
    // content and left-align inside its column flex parent.
    const baseRule = css.match(/\.opencodian-plugin-source-filter\s*\{[^}]*\}/)?.[0] ?? '';
    expect(baseRule).toMatch(/width:\s*fit-content/);
    expect(baseRule).toMatch(/align-self:\s*flex-start/);
    // Overflow safety so long button labels do not break the layout.
    expect(baseRule).toMatch(/overflow:\s*hidden/);

    // Narrow-screen (≤480px @media): filter must expand to full width so
    // the three buttons can split evenly.
    const mediaMarker = '@media (max-width: 480px)';
    const mediaStart = css.lastIndexOf(mediaMarker);
    expect(mediaStart).toBeGreaterThan(-1);
    let depth = 0;
    let mediaEnd = -1;
    for (let i = mediaStart; i < css.length; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') { depth--; if (depth === 0) { mediaEnd = i; break; } }
    }
    const mediaBlock = css.slice(mediaStart, mediaEnd);
    expect(mediaBlock).toMatch(/\.opencodian-plugin-source-filter\s*\{[^}]*width:\s*100%/);
    expect(mediaBlock).toMatch(/\.opencodian-plugin-source-filter-button\s*\{[^}]*flex:\s*1 1 0/);
  });

  it('keeps source panel CSS free of nested card surfaces and side-stripe borders', () => {
    const css = fs.readFileSync(
      path.join(process.cwd(), 'src/style/modals/config-editor-modal.css'),
      'utf8',
    );

    const pluginSectionCss = css.slice(
      css.indexOf('.opencodian-plugin-source-group'),
      css.indexOf('/* Managed plugin entry row'),
    );

    // No backdrop-filter decoration.
    expect(pluginSectionCss).not.toContain('backdrop-filter');
    // No gradient text or hero-metric template.
    expect(pluginSectionCss).not.toContain('linear-gradient');
    // No thick side-stripe accent borders.
    expect(pluginSectionCss).not.toMatch(/border-(left|right):\s*[2-9]px/);
    // No card background on path (must be flat transparent).
    expect(pluginSectionCss).toMatch(/\.opencodian-plugin-source-path\s*\{[^}]*background:\s*transparent/);
  });

  it('collapses metadata rows to a single column at narrow widths (≤480px)', () => {
    const css = fs.readFileSync(
      path.join(process.cwd(), 'src/style/modals/config-editor-modal.css'),
      'utf8',
    );

    // There are multiple @media (max-width: 480px) blocks in the file.
    // Find the one that contains the plugin source-panel responsive rules
    // by locating the LAST occurrence (the source panel CSS is near the end).
    const mediaMarker = '@media (max-width: 480px)';
    const mediaStart = css.lastIndexOf(mediaMarker);
    expect(mediaStart).toBeGreaterThan(-1);

    // Extract the full block by brace-counting so nested rules don't
    // terminate the match early.
    let depth = 0;
    let mediaEnd = -1;
    for (let i = mediaStart; i < css.length; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') {
        depth--;
        if (depth === 0) { mediaEnd = i; break; }
      }
    }
    expect(mediaEnd).toBeGreaterThan(mediaStart);
    const mediaBlock = css.slice(mediaStart, mediaEnd);

    // The two-column metadata grid must collapse to a single column so
    // long labels and values do not overflow horizontally on narrow widths.
    expect(mediaBlock).toMatch(/\.opencodian-plugin-source-meta-row\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    // Path stacks label over status: the current source-panel DOM uses
    // .opencodian-plugin-source-path (flex), so it must switch to
    // flex-direction: column at narrow widths. The legacy grid-based
    // .opencodian-plugin-source-path-row must also collapse to single column.
    expect(mediaBlock).toMatch(/\.opencodian-plugin-source-path\s*\{[^}]*flex-direction:\s*column/);
    expect(mediaBlock).toMatch(/\.opencodian-plugin-source-path-row\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    // Status badge must not stretch full-width; it should left-align.
    expect(mediaBlock).toMatch(/\.opencodian-plugin-source-path-status\s*\{[^}]*align-self:\s*flex-start/);
    // Header switches to column layout so badges wrap below the title.
    expect(mediaBlock).toMatch(/\.opencodian-plugin-source-header\s*\{[^}]*flex-direction:\s*column/);
    // Badge container takes full width and wraps.
    expect(mediaBlock).toMatch(/\.opencodian-plugin-source-badges\s*\{[^}]*width:\s*100%/);
  });
});
