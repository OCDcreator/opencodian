import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SettingsClaudeConfigurationSection } from '../../../../src/features/settings/SettingsClaudeConfigurationSection';
import { setLocale } from '../../../../src/i18n';
import { candidate, fakePlugin, flushMicrotasks, projectRevision, readOk, stubService } from './SettingsClaudeConfigurationSection.testSupport';

/**
 * P1: high-risk action context, hooks accessible names, human-facing
 * localization. P2: current-editing summary, progressive disclosure, source
 * inventory information architecture, action hierarchy, and narrow-width CSS.
 */
const clearDocumentAndLocale = (): void => {
  document.body.innerHTML = '';
  setLocale('en');
};

beforeEach(() => { document.body.innerHTML = ''; });
afterEach(clearDocumentAndLocale);

const renderSection = (overrides: Parameters<typeof stubService>[0] = {}) => {
  const body = document.createElement('div');
  document.body.appendChild(body);
  new SettingsClaudeConfigurationSection({
    plugin: fakePlugin('/vault') as never,
    sourceService: stubService({ read: async () => readOk('{"model":"x"}'), ...overrides }),
  }).render(body);
  return body;
};

describe('SettingsClaudeConfigurationSection UX copy and information architecture · action context', () => {

  // ─── P1-1: high-risk action context ──────────────────────────────────

  it('delete confirmation names the scope, target path, and action', async () => {
    const body = renderSection();
    await flushMicrotasks();
    (body.querySelector('[data-claude-config-delete]') as HTMLButtonElement).click();
    const confirm = body.querySelector('[data-claude-config-delete-confirm]') as HTMLElement;
    expect(confirm.textContent).toContain('/vault/.claude/settings.json');
    expect(/project/i.test(confirm.textContent ?? '')).toBe(true);
  });

  it('restore confirmation names the target path being overwritten', async () => {
    const identity = 'opaque-history-entry' as never;
    const body = renderSection({
      listHistory: async () => ({ status: 'success' as const, targets: [{ canonicalTarget: '/vault/.claude/settings.json', backend: 'claude', scope: 'project', kind: 'settings', format: 'json', entries: [{ identity, archiveKind: 'overwrite', timestamp: 1, size: 2 }] }] }),
    });
    await flushMicrotasks();
    (body.querySelector('[data-claude-config-history-toggle]') as HTMLButtonElement).click();
    await flushMicrotasks();
    (body.querySelector('[data-claude-config-history-restore]') as HTMLButtonElement).click();
    const confirm = body.querySelector('[data-claude-config-restore-confirm]') as HTMLElement;
    expect(confirm.textContent).toContain('/vault/.claude/settings.json');
  });

  it('gives every hooks delete/move button a unique accessible name per event/group/handler', async () => {
    const body = renderSection({
      read: async () => readOk('{"hooks":{"PreToolUse":[{"matcher":"a","hooks":[{"type":"command","command":"one"},{"type":"command","command":"two"}]},{"matcher":"b","hooks":[]}],"Stop":[{"matcher":"","hooks":[{"type":"command","command":"three"}]}]}}'),
    });
    await flushMicrotasks();
    const names = new Set<string>();
    const buttons = body.querySelectorAll('[data-claude-hooks-group-delete], [data-claude-hooks-group-move-up], [data-claude-hooks-group-move-down], [data-claude-hooks-handler-delete], [data-claude-hooks-handler-move-up], [data-claude-hooks-handler-move-down]');
    expect(buttons.length).toBeGreaterThanOrEqual(7);
    for (const button of Array.from(buttons)) {
      const name = (button.getAttribute('aria-label') ?? '').trim();
      expect(name.length).toBeGreaterThan(0);
      expect(names.has(name)).toBe(false);
      names.add(name);
      expect(name).toMatch(/PreToolUse|Stop/);
    }
  });
});

describe('SettingsClaudeConfigurationSection UX copy and information architecture · localization', () => {

  // ─── P1-2: human-facing localization ─────────────────────────────────

  it('localizes scope, presence, writable, and axis states without merging axes', async () => {
    setLocale('zh');
    const body = renderSection({
      inventory: async () => [
        candidate({ scope: 'project', origin: 'project-settings', evidence: { persistence: 'verified', application: 'pending', runtime: 'unavailable' } }),
        candidate({ scope: 'managed', origin: 'managed-file', editable: false, revision: null, exists: false, evidence: { persistence: 'unavailable', application: 'unavailable', runtime: 'unavailable' } }),
      ],
    });
    await flushMicrotasks();
    const sources = body.querySelector('[data-claude-config-sources]') as HTMLElement;
    const humanProject = sources.querySelector('[data-claude-config-evidence-human="project"]') as HTMLElement;
    expect(humanProject.textContent).toContain('持久化');
    expect(humanProject.textContent).toContain('已验证');
    expect(humanProject.textContent).toContain('待');
    expect(humanProject.textContent).toContain('不可用');
    // The three axes must stay independent: a verified persistence must not
    // promote application/runtime to verified anywhere in the human layer.
    const humanManaged = sources.querySelector('[data-claude-config-evidence-human="managed"]') as HTMLElement;
    expect(humanManaged.textContent).not.toContain('已验证');
    expect(sources.textContent).toContain('只读');
    expect(sources.textContent).toContain('项目');
  });

  it('keeps the technical tokens inspectable alongside the human layer', async () => {
    const body = renderSection({
      inventory: async () => [candidate({ revision: projectRevision })],
    });
    await flushMicrotasks();
    const sources = body.querySelector('[data-claude-config-sources]') as HTMLElement;
    expect(sources.querySelector('[data-claude-config-evidence="project"]')?.textContent).toContain('persistence=verified');
    expect(sources.querySelector('[data-claude-config-revision="project"]')?.textContent).toContain(projectRevision.sha256);
    expect(sources.querySelector('[data-claude-config-source-path="project"]')?.textContent).toBe('/vault/.claude/settings.json');
  });

  it('shows a persistent localized Global warning with the full target path only when Global is selected', async () => {
    const body = renderSection();
    await flushMicrotasks();
    const warning = body.querySelector('[data-claude-config-global-warning]') as HTMLElement;
    expect(warning.hidden).toBe(true);
    const select = body.querySelector('[data-claude-config-scope]') as HTMLSelectElement;
    select.value = 'global';
    select.dispatchEvent(new Event('change'));
    await flushMicrotasks();
    expect(warning.hidden).toBe(false);
    expect(warning.textContent).toMatch(/all projects/i);
    expect(warning.textContent).toContain('/home/.claude/settings.json');
    select.value = 'project';
    select.dispatchEvent(new Event('change'));
    await flushMicrotasks();
    expect(warning.hidden).toBe(true);
  });

  it('uses human-readable Chinese wording for the Global warning', async () => {
    setLocale('zh');
    const body = renderSection();
    await flushMicrotasks();
    const warning = body.querySelector('[data-claude-config-global-warning]') as HTMLElement;
    const select = body.querySelector('[data-claude-config-scope]') as HTMLSelectElement;
    select.value = 'global';
    select.dispatchEvent(new Event('change'));
    await flushMicrotasks();
    expect(warning.textContent).toContain('全局');
    expect(warning.textContent).not.toContain('Global');
  });

  it('localizes the JSON parse failure while keeping the raw parser message as detail', async () => {
    setLocale('zh');
    const body = renderSection();
    await flushMicrotasks();
    const draft = body.querySelector('[data-claude-config-draft]') as HTMLTextAreaElement;
    draft.value = '{"unterminated":';
    draft.dispatchEvent(new Event('input'));
    const diagnostic = body.querySelector('[data-claude-config-diagnostic]') as HTMLElement;
    expect(diagnostic.textContent).toContain('草稿');
    expect(diagnostic.textContent).not.toBe('');
  });

  it.each([
    { locale: 'en' as const, axis: 'Persistence', archiveKind: 'Previous version' },
    { locale: 'zh' as const, axis: '持久化', archiveKind: '覆盖前归档' },
  ])('localizes Save, Delete, Restore, and history metadata for $locale without leaking technical evidence tokens', async ({ locale, axis, archiveKind }) => {
    setLocale(locale);
    const identity = `localized-${locale}` as never;
    const successEvidence = { persistence: 'verified' as const, application: 'pending' as const, runtime: 'unavailable' as const };
    const body = renderSection({
      write: async (params: { targetPath: string; content: string }) => ({
        targetPath: params.targetPath,
        draft: params.content,
        evidence: successEvidence,
        result: { status: 'success' as const, revision: projectRevision },
      }),
      delete: async () => ({
        targetPath: '/vault/.claude/settings.json',
        evidence: successEvidence,
        result: { status: 'success' as const, revision: projectRevision },
      }),
      listHistory: async () => ({
        status: 'success' as const,
        targets: [{
          canonicalTarget: '/vault/.claude/settings.json', backend: 'claude', scope: 'project', kind: 'settings', format: 'json',
          entries: [{ identity, archiveKind: 'overwrite', timestamp: Date.UTC(2026, 6, 26, 9, 8), size: 1536 }],
        }],
      }),
      restore: async () => ({ evidence: successEvidence, result: { status: 'success' as const, revision: projectRevision } }),
    });
    await flushMicrotasks();
    const status = body.querySelector('[data-claude-config-status]') as HTMLElement;
    const expectHumanStatus = () => {
      expect(status.textContent).toContain(axis);
      expect(status.textContent).not.toContain('persistence=');
      expect(status.textContent).not.toContain('application=');
      expect(status.textContent).not.toContain('runtime=');
    };

    (body.querySelector('[data-claude-config-save]') as HTMLButtonElement).click();
    await flushMicrotasks();
    expectHumanStatus();

    (body.querySelector('[data-claude-config-delete]') as HTMLButtonElement).click();
    (body.querySelector('[data-claude-config-delete-accept]') as HTMLButtonElement).click();
    await flushMicrotasks();
    expectHumanStatus();

    (body.querySelector('[data-claude-config-history-toggle]') as HTMLButtonElement).click();
    await flushMicrotasks();
    const historyMeta = body.querySelector('.opencodian-claude-configuration-history-meta') as HTMLElement;
    expect(historyMeta.textContent).toContain(archiveKind);
    expect(historyMeta.textContent).toContain('KB');
    expect(historyMeta.textContent).not.toContain('1536');
    expect(historyMeta.textContent).not.toContain('overwrite');

    (body.querySelector('[data-claude-config-history-restore]') as HTMLButtonElement).click();
    (body.querySelector('[data-claude-config-restore-accept]') as HTMLButtonElement).click();
    await flushMicrotasks();
    expectHumanStatus();
  });
});

describe('SettingsClaudeConfigurationSection UX copy and information architecture · progressive disclosure', () => {

  // ─── P2-1: current editing summary + source inventory IA ─────────────

  it('answers scope, path, presence, writable, dirty, and per-axis state in a compact summary bar', async () => {
    const body = renderSection({
      inventory: async () => [candidate({ evidence: { persistence: 'verified', application: 'pending', runtime: 'unavailable' } })],
    });
    await flushMicrotasks();
    const summary = body.querySelector('[data-claude-config-summary]') as HTMLElement;
    expect(summary).toBeTruthy();
    expect(summary.querySelector('[data-claude-config-summary-path]')?.textContent).toBe('/vault/.claude/settings.json');
    expect(summary.querySelector('[data-claude-config-summary-dirty]')).toBeTruthy();
    const axes = summary.querySelector('[data-claude-config-summary-evidence]') as HTMLElement;
    expect(axes.textContent).toMatch(/persistence|持久化/i);
    expect(axes.textContent).toMatch(/runtime|运行时/i);
    const draft = body.querySelector('[data-claude-config-draft]') as HTMLTextAreaElement;
    draft.value = '{"model":"dirty"}';
    draft.dispatchEvent(new Event('input'));
    expect(summary.querySelector('[data-claude-config-summary-dirty]')?.textContent).toMatch(/unsaved|未保存/i);
  });

  it('moves the source inventory behind a counted disclosure and marks the current source', async () => {
    const body = renderSection({
      inventory: async () => [
        candidate({ scope: 'project' }),
        candidate({ scope: 'managed', editable: false }),
      ],
    });
    await flushMicrotasks();
    const toggle = body.querySelector('[data-claude-config-sources-toggle]') as HTMLButtonElement;
    expect(toggle.textContent).toContain('2');
    const sources = body.querySelector('[data-claude-config-sources]') as HTMLElement;
    expect(sources.hidden).toBe(true);
    toggle.click();
    expect(sources.hidden).toBe(false);
    const current = body.querySelector('[data-claude-config-source-current]') as HTMLElement;
    expect(current).toBeTruthy();
    expect(current.textContent).toMatch(/current|当前/i);
    // Managed stays visible and read-only inside the disclosure.
    expect(body.querySelector('[data-claude-config-readonly="managed"]')).toBeTruthy();
  });

  // ─── P2-2: progressive disclosure + action hierarchy ─────────────────

  it('collapses advanced JSON, history, and hooks behind disclosures while common settings stay visible', async () => {
    const body = renderSection();
    await flushMicrotasks();
    expect((body.querySelector('[data-claude-config-advanced-region]') as HTMLElement).hidden).toBe(true);
    expect((body.querySelector('[data-claude-config-hooks]') as HTMLElement).hidden).toBe(true);
    expect((body.querySelector('[data-claude-config-history]') as HTMLElement).hidden).toBe(true);
    expect((body.querySelector('[data-claude-config-form]') as HTMLElement).hidden).toBe(false);
  });

  it('makes Save the primary action and Delete the danger action', async () => {
    const body = renderSection();
    await flushMicrotasks();
    const save = body.querySelector('[data-claude-config-save]') as HTMLButtonElement;
    const remove = body.querySelector('[data-claude-config-delete]') as HTMLButtonElement;
    expect(save.className).toContain('mod-cta');
    expect(remove.className).toContain('mod-warning');
    expect(save.className).not.toContain('mod-warning');
  });

  it('filters the hook event catalog accessibly and reports no matches', async () => {
    const body = renderSection({ read: async () => readOk('{"hooks":{}}') });
    await flushMicrotasks();
    const filter = body.querySelector('[data-claude-hooks-event-filter]') as HTMLInputElement;
    expect(filter.getAttribute('aria-label')).toBeTruthy();
    const eventSelect = body.querySelector('[data-claude-hooks-event-select]') as HTMLSelectElement;
    const total = eventSelect.options.length;
    expect(total).toBeGreaterThan(3);
    filter.value = 'pretool';
    filter.dispatchEvent(new Event('input'));
    expect(eventSelect.options.length).toBeLessThan(total);
    expect(Array.from(eventSelect.options).some((option) => option.value === 'PreToolUse')).toBe(true);
    filter.value = 'zzz-no-match';
    filter.dispatchEvent(new Event('input'));
    expect(eventSelect.options.length).toBe(1);
    expect(eventSelect.options[0].disabled).toBe(true);
  });

  // ─── P2-3: narrow-width CSS contract ─────────────────────────────────

  it('renders paths as natural segments with a full-path affordance and a real narrow-width layout contract', async () => {
    const body = renderSection();
    await flushMicrotasks();
    const path = body.querySelector('[data-claude-config-summary-path]') as HTMLElement;
    expect(path.textContent).toBe('/vault/.claude/settings.json');
    expect(path.getAttribute('title')).toBe('/vault/.claude/settings.json');
    expect(path.getAttribute('aria-label')).toBe('/vault/.claude/settings.json');
    expect(path.querySelectorAll('[data-claude-config-path-segment]').length).toBeGreaterThanOrEqual(3);
    expect(body.querySelector('[data-claude-config-copy-path]')).toBeTruthy();

    const css = readFileSync(join(process.cwd(), 'src/style/components/settings-claude-code.css'), 'utf8');
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    expect(css).not.toContain('word-break: break-all');
    expect(css).toContain('.opencodian-claude-configuration-path-segment');
    expect(getComputedStyle(path).display).toBe('flex');
    expect(getComputedStyle(path).flexWrap).toBe('wrap');
    expect(css).toMatch(/@media[^{]*max-width/);
  });
});
