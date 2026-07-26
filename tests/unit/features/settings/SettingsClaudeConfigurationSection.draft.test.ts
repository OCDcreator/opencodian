import { SettingsClaudeConfigurationSection } from '../../../../src/features/settings/SettingsClaudeConfigurationSection';
import { candidate, fakePlugin, flushMicrotasks, projectRevision, readOk, stubService } from './SettingsClaudeConfigurationSection.testSupport';

describe('SettingsClaudeConfigurationSection draft and save lifecycle', () => {
  beforeEach(() => { document.body.innerHTML = ''; });
  afterEach(() => { document.body.innerHTML = ''; });

  it('reads the selected source into the draft and enables save', async () => {
    const body = document.createElement('div');
    document.body.appendChild(body);
    new SettingsClaudeConfigurationSection({
      plugin: fakePlugin('/vault') as never,
      sourceService: stubService({ read: async () => readOk('{"model":"x"}') }),
    }).render(body);
    await flushMicrotasks();
    expect((body.querySelector('[data-claude-config-draft]') as HTMLTextAreaElement).value).toBe('{"model":"x"}');
    expect((body.querySelector('[data-claude-config-save]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('saves the selected target, exact draft, and read revision', async () => {
    const body = document.createElement('div');
    document.body.appendChild(body);
    const write = jest.fn(async (params: { targetPath: string; content: string; expectedRevision: unknown }) => ({
      targetPath: params.targetPath,
      draft: params.content,
      evidence: { persistence: 'verified', application: 'pending', runtime: 'unavailable' },
      result: { status: 'success', revision: projectRevision },
    }));
    new SettingsClaudeConfigurationSection({
      plugin: fakePlugin('/vault') as never,
      sourceService: stubService({ read: async () => readOk('{"model":"x"}'), write }),
    }).render(body);
    await flushMicrotasks();
    const draft = body.querySelector('[data-claude-config-draft]') as HTMLTextAreaElement;
    draft.value = '{"model":"y"}';
    draft.dispatchEvent(new Event('input'));
    (body.querySelector('[data-claude-config-save]') as HTMLButtonElement).click();
    await flushMicrotasks();
    expect(write).toHaveBeenCalledWith({
      targetPath: '/vault/.claude/settings.json',
      content: '{"model":"y"}',
      expectedRevision: projectRevision,
    });
    expect(body.querySelector('[data-claude-config-status]')?.getAttribute('data-claude-config-status-level')).toBe('ok');
  });

  it('retains an exact conflict draft and explains that only reload discards it', async () => {
    const body = document.createElement('div');
    document.body.appendChild(body);
    const write = jest.fn(async (params: { content: string }) => ({
      targetPath: '/vault/.claude/settings.json',
      draft: params.content,
      evidence: { persistence: 'failed', application: 'unavailable', runtime: 'unavailable' },
      result: { status: 'conflict' },
    }));
    new SettingsClaudeConfigurationSection({
      plugin: fakePlugin('/vault') as never,
      sourceService: stubService({ read: async () => readOk('{"model":"x"}'), write }),
    }).render(body);
    await flushMicrotasks();
    const draft = body.querySelector('[data-claude-config-draft]') as HTMLTextAreaElement;
    draft.value = '{"model":"kept"}';
    draft.dispatchEvent(new Event('input'));
    (body.querySelector('[data-claude-config-save]') as HTMLButtonElement).click();
    await flushMicrotasks();
    expect(draft.value).toBe('{"model":"kept"}');
    expect((body.querySelector('[data-claude-config-reload]') as HTMLButtonElement).hidden).toBe(false);
    expect((body.querySelector('[data-claude-config-compare]') as HTMLButtonElement).hidden).toBe(false);
    const status = body.querySelector('[data-claude-config-status]');
    expect(status?.getAttribute('data-claude-config-status-level')).toBe('error');
    expect(status?.textContent).toContain('Use Compare to review draft vs disk; Reload only to discard draft.');
  });

  it('prevents double submit while a save is in flight', async () => {
    const body = document.createElement('div');
    document.body.appendChild(body);
    let resolveWrite: () => void = () => {};
    const write = jest.fn(() => new Promise((resolve) => {
      resolveWrite = () => resolve({ targetPath: '/vault/.claude/settings.json', draft: '', evidence: { persistence: 'verified', application: 'pending', runtime: 'unavailable' }, result: { status: 'success', revision: projectRevision } });
    }));
    new SettingsClaudeConfigurationSection({
      plugin: fakePlugin('/vault') as never,
      sourceService: stubService({ read: async () => readOk('{"model":"x"}'), write: write as never }),
    }).render(body);
    await flushMicrotasks();
    const save = body.querySelector('[data-claude-config-save]') as HTMLButtonElement;
    save.click();
    save.click();
    expect(write).toHaveBeenCalledTimes(1);
    expect(save.disabled).toBe(true);
    resolveWrite();
    await flushMicrotasks();
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('keeps strict JSON diagnostics honest and re-enables a repaired draft', async () => {
    const body = document.createElement('div');
    document.body.appendChild(body);
    new SettingsClaudeConfigurationSection({
      plugin: fakePlugin('/vault') as never,
      sourceService: stubService({ read: async () => readOk('{}') }),
    }).render(body);
    await flushMicrotasks();
    const draft = body.querySelector('[data-claude-config-draft]') as HTMLTextAreaElement;
    const save = body.querySelector('[data-claude-config-save]') as HTMLButtonElement;
    const diagnostic = body.querySelector('[data-claude-config-diagnostic]') as HTMLElement;
    draft.value = '{"unterminated":';
    draft.dispatchEvent(new Event('input'));
    expect(save.disabled).toBe(true);
    expect(diagnostic.hidden).toBe(false);
    draft.value = '{"ok":true}';
    draft.dispatchEvent(new Event('input'));
    expect(save.disabled).toBe(false);
    expect(diagnostic.hidden).toBe(true);
  });

  it('applies a common form field to the same draft and preserves unknown JSON', async () => {
    const body = document.createElement('div');
    document.body.appendChild(body);
    new SettingsClaudeConfigurationSection({
      plugin: fakePlugin('/vault') as never,
      sourceService: stubService({ read: async () => readOk('{"unknownTop":"keep","model":"old"}') }),
    }).render(body);
    await flushMicrotasks();
    const draft = body.querySelector('[data-claude-config-draft]') as HTMLTextAreaElement;
    const model = body.querySelector('[data-claude-config-field="model"]') as HTMLInputElement;
    model.value = 'new-model';
    model.dispatchEvent(new Event('change'));
    expect(JSON.parse(draft.value)).toEqual({ unknownTop: 'keep', model: 'new-model' });
    draft.value = '{broken';
    draft.dispatchEvent(new Event('input'));
    model.value = 'x';
    model.dispatchEvent(new Event('change'));
    expect(draft.value).toBe('{broken');
  });

  it('bootstraps absent editable Project with a null expected revision', async () => {
    const body = document.createElement('div');
    document.body.appendChild(body);
    const write = jest.fn(async () => ({
      targetPath: '/vault/.claude/settings.json',
      draft: '{}',
      evidence: { persistence: 'verified', application: 'pending', runtime: 'unavailable' },
      result: { status: 'success', revision: projectRevision },
    }));
    new SettingsClaudeConfigurationSection({
      plugin: fakePlugin('/vault') as never,
      sourceService: stubService({
        read: async () => ({ status: 'success' as const, source: candidate({ exists: false, revision: null }), content: '' }),
        write,
      }),
    }).render(body);
    await flushMicrotasks();
    expect((body.querySelector('[data-claude-config-draft]') as HTMLTextAreaElement).value).toBe('{}');
    (body.querySelector('[data-claude-config-save]') as HTMLButtonElement).click();
    await flushMicrotasks();
    expect(write.mock.calls[0][0].expectedRevision).toBeNull();
  });

  it('does not let an old deferred save update a newly selected scope', async () => {
    const body = document.createElement('div');
    document.body.appendChild(body);
    let resolveWrite: () => void = () => {};
    const write = jest.fn(() => new Promise((resolve) => {
      resolveWrite = () => resolve({ targetPath: '/vault/.claude/settings.json', draft: '{}', evidence: { persistence: 'verified', application: 'pending', runtime: 'unavailable' }, result: { status: 'success', revision: projectRevision } });
    }));
    new SettingsClaudeConfigurationSection({
      plugin: fakePlugin('/vault') as never,
      sourceService: stubService({ read: async () => readOk('{}'), write: write as never }),
    }).render(body);
    await flushMicrotasks();
    (body.querySelector('[data-claude-config-save]') as HTMLButtonElement).click();
    const scope = body.querySelector('[data-claude-config-scope]') as HTMLSelectElement;
    scope.value = 'global';
    scope.dispatchEvent(new Event('change'));
    resolveWrite();
    await flushMicrotasks();
    expect(body.querySelector('[data-claude-config-status]')?.getAttribute('data-claude-config-status-level')).not.toBe('ok');
  });
});
