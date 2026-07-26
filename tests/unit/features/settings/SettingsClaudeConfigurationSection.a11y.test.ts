import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SettingsClaudeConfigurationSection } from '../../../../src/features/settings/SettingsClaudeConfigurationSection';
import { candidate, fakePlugin, flushMicrotasks, projectRevision, readOk, stubService } from './SettingsClaudeConfigurationSection.testSupport';

/**
 * P0-2: dynamic state and error semantics. Status, errors, busy regions,
 * invalid fields, disclosures, and focus recovery must be perceivable by
 * assistive technology, not just visual styling.
 */
// This suite keeps the settings workbench's cross-disclosure behavior matrix
// together so every public render/action seam shares the same fixture.
// eslint-disable-next-line max-lines-per-function
describe('SettingsClaudeConfigurationSection accessibility semantics', () => {
  beforeEach(() => { document.body.innerHTML = ''; });
  afterEach(() => { document.body.innerHTML = ''; });

  const renderSection = (overrides: Parameters<typeof stubService>[0] = {}) => {
    const body = document.createElement('div');
    document.body.appendChild(body);
    new SettingsClaudeConfigurationSection({
      plugin: fakePlugin('/vault') as never,
      sourceService: stubService({ read: async () => readOk('{"model":"x"}'), ...overrides }),
    }).render(body);
    return body;
  };

  const hasHiddenAncestor = (element: HTMLElement): boolean => {
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      if (ancestor.hidden) return true;
    }
    return false;
  };

  const expectSemanticFocus = (scope: HTMLElement): HTMLElement => {
    const active = document.activeElement;
    expect(active).toBeInstanceOf(HTMLElement);
    const control = active as HTMLElement;
    expect(['BUTTON', 'INPUT', 'SELECT']).toContain(control.tagName);
    expect(scope.contains(control)).toBe(true);
    expect(control.hasAttribute('disabled')).toBe(false);
    expect(hasHiddenAncestor(control)).toBe(false);
    expect((control.getAttribute('aria-label') ?? control.textContent ?? '').trim()).not.toBe('');
    return control;
  };

  it('announces ordinary completion through a polite live region', async () => {
    const write = jest.fn(async (params: { targetPath: string; content: string }) => ({
      targetPath: params.targetPath,
      draft: params.content,
      evidence: { persistence: 'verified', application: 'pending', runtime: 'unavailable' },
      result: { status: 'success', revision: projectRevision },
    }));
    const body = renderSection({ write: write as never });
    await flushMicrotasks();
    const polite = body.querySelector('[data-claude-config-live-polite]') as HTMLElement;
    expect(polite).toBeTruthy();
    expect(polite.getAttribute('role')).toBe('status');
    expect(polite.getAttribute('aria-live')).toBe('polite');
    expect(polite.getAttribute('aria-atomic')).toBe('true');
    (body.querySelector('[data-claude-config-save]') as HTMLButtonElement).click();
    await flushMicrotasks();
    expect(polite.textContent).toContain('Saved');
  });

  it('announces blocking errors and conflicts through alert semantics', async () => {
    const write = jest.fn(async (params: { content: string }) => ({
      targetPath: '/vault/.claude/settings.json',
      draft: params.content,
      evidence: { persistence: 'failed', application: 'unavailable', runtime: 'unavailable' },
      result: { status: 'conflict' },
    }));
    const body = renderSection({ write: write as never });
    await flushMicrotasks();
    const alert = body.querySelector('[data-claude-config-live-alert]') as HTMLElement;
    expect(alert).toBeTruthy();
    expect(alert.getAttribute('role')).toBe('alert');
    const draft = body.querySelector('[data-claude-config-draft]') as HTMLTextAreaElement;
    draft.value = '{"model":"kept"}';
    draft.dispatchEvent(new Event('input'));
    (body.querySelector('[data-claude-config-save]') as HTMLButtonElement).click();
    await flushMicrotasks();
    expect(alert.textContent).toContain('Conflict');
  });

  it('marks the source inventory busy while it loads', async () => {
    let resolveInventory: (value: ReturnType<typeof candidate>[]) => void = () => {};
    const inventory = jest.fn(() => new Promise<ReturnType<typeof candidate>[]>((resolve) => { resolveInventory = resolve; }));
    const body = renderSection({ inventory: inventory as never });
    const sources = body.querySelector('[data-claude-config-sources]') as HTMLElement;
    expect(sources.getAttribute('aria-busy')).toBe('true');
    resolveInventory([candidate()]);
    await flushMicrotasks();
    expect(sources.getAttribute('aria-busy')).not.toBe('true');
  });

  it('synchronously keeps History visibility, expanded state, controls, and busy state aligned while it loads or closes', async () => {
    let resolveHistory: () => void = () => {};
    const listHistory = jest.fn(() => new Promise((resolve) => {
      resolveHistory = () => resolve({ status: 'success', targets: [{ canonicalTarget: '/vault/.claude/settings.json', backend: 'claude', scope: 'project', kind: 'settings', format: 'json', entries: [] }] });
    }));
    const body = renderSection({ listHistory: listHistory as never });
    await flushMicrotasks();
    const toggle = body.querySelector('[data-claude-config-history-toggle]') as HTMLButtonElement;
    const controls = toggle.getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    toggle.click();
    const history = body.querySelector('[data-claude-config-history]') as HTMLElement;
    expect(history.id).toBe(controls);
    expect(history.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(history.getAttribute('aria-busy')).toBe('true');
    toggle.click();
    expect(history.hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(history.getAttribute('aria-busy')).toBe('false');
    resolveHistory();
    await flushMicrotasks();
    expect(history.getAttribute('aria-busy')).not.toBe('true');
  });

  it('marks an invalid JSON draft with aria-invalid and links the diagnostic', async () => {
    const body = renderSection();
    await flushMicrotasks();
    const draft = body.querySelector('[data-claude-config-draft]') as HTMLTextAreaElement;
    const diagnostic = body.querySelector('[data-claude-config-diagnostic]') as HTMLElement;
    draft.value = '{"unterminated":';
    draft.dispatchEvent(new Event('input'));
    expect(draft.getAttribute('aria-invalid')).toBe('true');
    expect(diagnostic.id).toBeTruthy();
    expect(draft.getAttribute('aria-describedby')).toContain(diagnostic.id);
    draft.value = '{"ok":true}';
    draft.dispatchEvent(new Event('input'));
    expect(draft.getAttribute('aria-invalid')).not.toBe('true');
  });

  it('marks an invalid common-field value with aria-invalid on the control', async () => {
    const body = renderSection();
    await flushMicrotasks();
    const days = body.querySelector('[data-claude-config-field="cleanupPeriodDays"]') as HTMLInputElement;
    const diagnostic = body.querySelector('[data-claude-config-diagnostic]') as HTMLElement;
    days.value = '0';
    days.dispatchEvent(new Event('change'));
    expect(days.getAttribute('aria-invalid')).toBe('true');
    expect(days.getAttribute('aria-describedby')).toContain(diagnostic.id);
  });

  it('keeps common, Hooks, Inventory, and History errors visible outside hidden disclosures with alert semantics', async () => {
    const body = renderSection({
      inventory: async () => { throw new Error('inventory unavailable'); },
      listHistory: async () => ({ status: 'archive-failed' as const, cause: 'manifest unreadable' }),
      read: async () => readOk('{"hooks":{"PreToolUse":[{"matcher":"*","hooks":[{"type":"command","command":"echo ok","args":["ok"]}]}]}}'),
    });
    await flushMicrotasks();
    const draft = body.querySelector('[data-claude-config-draft]') as HTMLTextAreaElement;
    const diagnostic = body.querySelector('[data-claude-config-diagnostic]') as HTMLElement;
    const advanced = body.querySelector('[data-claude-config-advanced-region]') as HTMLElement;
    draft.value = '{"unterminated":';
    draft.dispatchEvent(new Event('input'));
    expect(diagnostic.hidden).toBe(false);
    expect(diagnostic.getAttribute('role')).toBe('alert');
    expect(advanced.contains(diagnostic)).toBe(false);
    expect(hasHiddenAncestor(diagnostic)).toBe(false);
    expect(draft.getAttribute('aria-describedby')).toBe(diagnostic.id);
    expect(hasHiddenAncestor(document.getElementById(draft.getAttribute('aria-describedby')!) as HTMLElement)).toBe(false);

    const status = body.querySelector('[data-claude-config-status]') as HTMLElement;
    const alert = body.querySelector('[data-claude-config-live-alert]') as HTMLElement;
    expect(status.textContent).toContain('Failed to read Claude settings sources');
    expect(alert.textContent).toContain('Failed to read Claude settings sources');

    (body.querySelector('[data-claude-config-history-toggle]') as HTMLButtonElement).click();
    await flushMicrotasks();
    const history = body.querySelector('[data-claude-config-history]') as HTMLElement;
    const historyError = history.querySelector('.opencodian-claude-configuration-history-error') as HTMLElement;
    expect(history.hidden).toBe(false);
    expect(historyError.getAttribute('role')).toBe('alert');
  });

  it('clears stale common and Hooks invalid wiring after Advanced JSON repairs the values', async () => {
    const body = renderSection({
      read: async () => readOk('{"hooks":{"PreToolUse":[{"matcher":"*","hooks":[{"type":"command","command":"echo ok","args":["ok"]}]}]}}'),
    });
    await flushMicrotasks();
    const days = body.querySelector('[data-claude-config-field="cleanupPeriodDays"]') as HTMLInputElement;
    days.value = '0';
    days.dispatchEvent(new Event('change'));
    expect(days.getAttribute('aria-invalid')).toBe('true');
    const args = body.querySelector('[data-claude-hooks-handler-field="PreToolUse:0:0:args"]') as HTMLInputElement;
    args.value = '{broken';
    args.dispatchEvent(new Event('change'));
    expect(args.getAttribute('aria-invalid')).toBe('true');

    const draft = body.querySelector('[data-claude-config-draft]') as HTMLTextAreaElement;
    draft.value = '{"cleanupPeriodDays":7,"hooks":{"PreToolUse":[{"matcher":"*","hooks":[{"type":"command","command":"echo ok","args":["fixed"]}]}]}}';
    draft.dispatchEvent(new Event('input'));
    expect(days.getAttribute('aria-invalid')).toBeNull();
    expect(days.getAttribute('aria-describedby')).toBeNull();
    const repairedArgs = body.querySelector('[data-claude-hooks-handler-field="PreToolUse:0:0:args"]') as HTMLInputElement;
    expect(repairedArgs.getAttribute('aria-invalid')).toBeNull();
    expect(repairedArgs.getAttribute('aria-describedby')).toBeNull();
  });

  it('moves keyboard-triggered unsaved-switch focus to the first enabled decision button, not a presentational div', async () => {
    const body = renderSection();
    await flushMicrotasks();
    const draft = body.querySelector('[data-claude-config-draft]') as HTMLTextAreaElement;
    draft.value = '{"model":"dirty"}';
    draft.dispatchEvent(new Event('input'));
    const scope = body.querySelector('[data-claude-config-scope]') as HTMLSelectElement;
    scope.focus();
    scope.value = 'global';
    scope.dispatchEvent(new Event('change', { bubbles: true }));
    const decision = body.querySelector('[data-claude-config-switch-confirm]') as HTMLElement;
    const save = body.querySelector('[data-claude-config-switch-save]') as HTMLButtonElement;
    expect(decision.getAttribute('role')).toBe('group');
    expect(decision.hasAttribute('tabindex')).toBe(false);
    expect(document.activeElement).toBe(save);
    expect(document.activeElement?.tagName).toBe('BUTTON');
  });

  it('keeps the unsaved-switch decision keyboard-activatable with a visible semantic focus ring', async () => {
    const write = jest.fn(async (params: { targetPath: string; content: string }) => ({
      targetPath: params.targetPath,
      draft: params.content,
      evidence: { persistence: 'verified' as const, application: 'pending' as const, runtime: 'unavailable' as const },
      result: { status: 'success' as const, revision: projectRevision },
    }));
    const body = renderSection({ write: write as never });
    await flushMicrotasks();
    const draft = body.querySelector('[data-claude-config-draft]') as HTMLTextAreaElement;
    draft.value = '{"model":"keyboard-dirty"}';
    draft.dispatchEvent(new Event('input'));
    const scope = body.querySelector('[data-claude-config-scope]') as HTMLSelectElement;
    scope.value = 'global';
    scope.dispatchEvent(new Event('change', { bubbles: true }));

    const decision = body.querySelector('[data-claude-config-switch-confirm]') as HTMLElement;
    const save = body.querySelector('[data-claude-config-switch-save]') as HTMLButtonElement;
    expect(decision.getAttribute('role')).toBe('group');
    expect(decision.contains(save)).toBe(true);
    expect(document.activeElement).toBe(save);
    expect(['BUTTON', 'INPUT', 'SELECT']).toContain((document.activeElement as HTMLElement).tagName);

    // Native browsers activate a focused button with Enter. Dispatch the
    // keyboard event at the public button seam, then use click() to model the
    // browser's default activation in jsdom.
    save.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    save.click();
    await flushMicrotasks();
    expect(write).toHaveBeenCalledTimes(1);

    const css = readFileSync(join(process.cwd(), 'src/style/components/settings-claude-code.css'), 'utf8');
    expect(css).toMatch(/\.opencodian-claude-configuration button:focus-visible,[\s\S]*outline:\s*2px solid/);
  });

  it('exposes aria-expanded and aria-controls on every workbench disclosure toggle', async () => {
    const body = renderSection();
    await flushMicrotasks();
    for (const dataName of [
      'data-claude-config-sources-toggle',
      'data-claude-config-advanced-toggle',
      'data-claude-config-history-toggle',
      'data-claude-config-hooks-toggle',
    ]) {
      const toggle = body.querySelector(`[${dataName}]`) as HTMLButtonElement;
      expect(toggle).toBeTruthy();
      const controls = toggle.getAttribute('aria-controls');
      expect(controls).toBeTruthy();
      expect(body.ownerDocument.getElementById(controls!)).toBeTruthy();
      const before = toggle.getAttribute('aria-expanded');
      toggle.click();
      await flushMicrotasks();
      expect(toggle.getAttribute('aria-expanded')).not.toBe(before);
    }
  });

  it('keeps collapsed disclosures from destroying the canonical draft', async () => {
    const body = renderSection();
    await flushMicrotasks();
    const draft = body.querySelector('[data-claude-config-draft]') as HTMLTextAreaElement;
    draft.value = '{"model":"kept"}';
    draft.dispatchEvent(new Event('input'));
    const advancedToggle = body.querySelector('[data-claude-config-advanced-toggle]') as HTMLButtonElement;
    advancedToggle.click();
    advancedToggle.click();
    const hooksToggle = body.querySelector('[data-claude-config-hooks-toggle]') as HTMLButtonElement;
    hooksToggle.click();
    hooksToggle.click();
    expect((body.querySelector('[data-claude-config-draft]') as HTMLTextAreaElement).value).toBe('{"model":"kept"}');
  });

  it('returns focus to the delete trigger when its confirmation is cancelled', async () => {
    const body = renderSection();
    await flushMicrotasks();
    const trigger = body.querySelector('[data-claude-config-delete]') as HTMLButtonElement;
    trigger.click();
    const cancel = body.querySelector('[data-claude-config-delete-cancel]') as HTMLButtonElement;
    cancel.click();
    expect(document.activeElement).toBe(trigger);
  });

  it('moves focus to a predictable surviving control after deleting a hook group', async () => {
    const body = renderSection({
      read: async () => readOk('{"hooks":{"PreToolUse":[{"matcher":"a","hooks":[]},{"matcher":"b","hooks":[]}]}}'),
    });
    await flushMicrotasks();
    (body.querySelector('[data-claude-config-hooks-toggle]') as HTMLButtonElement).click();
    const hooksRoot = body.querySelector('[data-claude-config-hooks]') as HTMLElement;
    const deleteSecond = hooksRoot.querySelector('[data-claude-hooks-group="PreToolUse:1"] [data-claude-hooks-group-delete]') as HTMLButtonElement;
    deleteSecond.click();
    expectSemanticFocus(hooksRoot);
    expect((document.activeElement as HTMLElement).tagName).toMatch(/^(BUTTON|INPUT|SELECT)$/);
  });

  it('moves focus to the moved hook group after a reorder', async () => {
    const body = renderSection({
      read: async () => readOk('{"hooks":{"PreToolUse":[{"matcher":"a","hooks":[]},{"matcher":"b","hooks":[]}]}}'),
    });
    await flushMicrotasks();
    (body.querySelector('[data-claude-config-hooks-toggle]') as HTMLButtonElement).click();
    const hooksRoot = body.querySelector('[data-claude-config-hooks]') as HTMLElement;
    const moveDown = hooksRoot.querySelector('[data-claude-hooks-group="PreToolUse:0"] [data-claude-hooks-group-move-down]') as HTMLButtonElement;
    moveDown.click();
    const movedGroup = hooksRoot.querySelector('[data-claude-hooks-group="PreToolUse:1"]') as HTMLElement;
    expectSemanticFocus(movedGroup);
    expect((document.activeElement as HTMLElement).tagName).toMatch(/^(BUTTON|INPUT|SELECT)$/);
  });

  it('keeps every structural hook refocus on a visible semantic control in the intended group or handler', async () => {
    const body = renderSection({
      read: async () => readOk('{"hooks":{"PreToolUse":[{"matcher":"a","hooks":[{"type":"command","command":"one"}]},{"matcher":"b","hooks":[{"type":"command","command":"two"}]}]}}'),
    });
    await flushMicrotasks();
    (body.querySelector('[data-claude-config-hooks-toggle]') as HTMLButtonElement).click();
    const hooksRoot = body.querySelector('[data-claude-config-hooks]') as HTMLElement;

    const event = hooksRoot.querySelector('[data-claude-hooks-event-select]') as HTMLSelectElement;
    event.value = 'PreToolUse';
    (hooksRoot.querySelector('[data-claude-hooks-group-add]') as HTMLButtonElement).click();
    expectSemanticFocus(hooksRoot.querySelector('[data-claude-hooks-group="PreToolUse:2"]') as HTMLElement);

    (hooksRoot.querySelector('[data-claude-hooks-group="PreToolUse:2"] [data-claude-hooks-group-delete]') as HTMLButtonElement).click();
    expectSemanticFocus(hooksRoot.querySelector('[data-claude-hooks-group="PreToolUse:1"]') as HTMLElement);

    (hooksRoot.querySelector('[data-claude-hooks-group="PreToolUse:0"] [data-claude-hooks-group-move-down]') as HTMLButtonElement).click();
    expectSemanticFocus(hooksRoot.querySelector('[data-claude-hooks-group="PreToolUse:1"]') as HTMLElement);

    (hooksRoot.querySelector('[data-claude-hooks-group="PreToolUse:0"] [data-claude-hooks-handler-add]') as HTMLButtonElement).click();
    expectSemanticFocus(hooksRoot.querySelector('[data-claude-hooks-handler="PreToolUse:0:1"]') as HTMLElement);

    const type = hooksRoot.querySelector('[data-claude-hooks-handler-field="PreToolUse:0:0:type"]') as HTMLSelectElement;
    type.value = 'http';
    type.dispatchEvent(new Event('change'));
    const handler = hooksRoot.querySelector('[data-claude-hooks-handler="PreToolUse:0:0"]') as HTMLElement;
    const focusedType = expectSemanticFocus(handler);
    expect(focusedType.getAttribute('data-claude-hooks-handler-field')).toBe('PreToolUse:0:0:type');

    const css = readFileSync(join(process.cwd(), 'src/style/components/settings-claude-code.css'), 'utf8');
    expect(css).toMatch(/\.opencodian-claude-configuration button:focus-visible,[\s\S]*outline:\s*2px solid/);
    expect(css).not.toContain('.opencodian-claude-configuration-hook-group:focus');
    expect(css).not.toContain('.opencodian-claude-configuration-hook-handler:focus');
  });

  it('has no visible focusable control without an accessible name', async () => {
    const body = renderSection({
      read: async () => readOk('{"hooks":{"PreToolUse":[{"matcher":"*","hooks":[{"type":"command","command":"echo hi"}]}]}}'),
    });
    await flushMicrotasks();
    const controls = body.querySelectorAll('button, input, select, textarea');
    const unnamed: string[] = [];
    for (const control of Array.from(controls)) {
      const el = control as HTMLElement;
      const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim();
      const labelledBy = el.getAttribute('aria-labelledby');
      if (!name && !labelledBy) unnamed.push(`${el.tagName}.${el.className}`);
    }
    expect(unnamed).toEqual([]);
  });
});
