import { SettingsClaudeConfigurationSection } from '../../../../src/features/settings/SettingsClaudeConfigurationSection';
import { candidate, fakePlugin, flushMicrotasks, projectRevision, readOk, stubService } from './SettingsClaudeConfigurationSection.testSupport';

describe('SettingsClaudeConfigurationSection compare and mutation controller', () => {
  beforeEach(() => { document.body.innerHTML = ''; });
  afterEach(() => { document.body.innerHTML = ''; });

  it('shows a localized non-mutating draft/disk compare without replacing the draft', async () => {
    const body = document.createElement('div');
    document.body.appendChild(body);
    const write = jest.fn(async () => ({
      targetPath: '/vault/.claude/settings.json',
      draft: '{"model":"kept"}',
      evidence: { persistence: 'failed', application: 'unavailable', runtime: 'unavailable' },
      result: { status: 'conflict' },
    }));
    const read = jest.fn(async () => readOk('{"model":"disk"}'));
    new SettingsClaudeConfigurationSection({
      plugin: fakePlugin('/vault') as never,
      sourceService: stubService({ read, write }),
    }).render(body);
    await flushMicrotasks();
    const draft = body.querySelector('[data-claude-config-draft]') as HTMLTextAreaElement;
    draft.value = '{"model":"kept"}';
    draft.dispatchEvent(new Event('input'));
    (body.querySelector('[data-claude-config-save]') as HTMLButtonElement).click();
    await flushMicrotasks();
    (body.querySelector('[data-claude-config-compare]') as HTMLButtonElement).click();
    await flushMicrotasks();
    const output = body.querySelector('[data-claude-config-compare-output]') as HTMLElement;
    expect(output.textContent).toContain('Draft:\n{"model":"kept"}');
    expect(output.textContent).toContain('Disk:\n{"model":"disk"}');
    expect(draft.value).toBe('{"model":"kept"}');
    expect(body.querySelector('[data-claude-config-status]')?.textContent).toContain('Neither source was changed');
  });

  it('rejects scalar JSON and fences a detached history restore after scope changes', async () => {
    const body = document.createElement('div');
    document.body.appendChild(body);
    const identity = 'opaque-history-entry' as never;
    const restore = jest.fn(async () => ({ evidence: { persistence: 'verified', application: 'pending', runtime: 'unavailable' }, result: { status: 'success', revision: projectRevision } }));
    new SettingsClaudeConfigurationSection({
      plugin: fakePlugin('/vault') as never,
      sourceService: stubService({
        read: async () => readOk('{"model":"x"}'),
        restore,
        listHistory: async () => ({ status: 'success' as const, targets: [{ canonicalTarget: '/vault/.claude/settings.json', backend: 'claude', scope: 'project', kind: 'settings', format: 'json', entries: [{ identity, archiveKind: 'overwrite', timestamp: 1, size: 2 }] }] }),
      }),
    }).render(body);
    await flushMicrotasks();
    const draft = body.querySelector('[data-claude-config-draft]') as HTMLTextAreaElement;
    draft.value = '[]';
    draft.dispatchEvent(new Event('input'));
    expect((body.querySelector('[data-claude-config-save]') as HTMLButtonElement).disabled).toBe(true);
    expect(body.querySelector('[data-claude-config-diagnostic]')?.textContent).toContain('JSON object');
    draft.value = '{"model":"x"}';
    draft.dispatchEvent(new Event('input'));
    (body.querySelector('[data-claude-config-history-toggle]') as HTMLButtonElement).click();
    await flushMicrotasks();
    (body.querySelector('[data-claude-config-history-restore]') as HTMLButtonElement).click();
    const accept = body.querySelector('[data-claude-config-restore-accept]') as HTMLButtonElement;
    const scope = body.querySelector('[data-claude-config-scope]') as HTMLSelectElement;
    scope.value = 'global';
    scope.dispatchEvent(new Event('change'));
    accept.click();
    await flushMicrotasks();
    expect(restore).not.toHaveBeenCalled();
  });

  it('uses inline confirmations, expected revisions, and opaque history identities', async () => {
    const body = document.createElement('div');
    document.body.appendChild(body);
    const identity = 'opaque-history-entry' as never;
    const del = jest.fn(async () => ({ targetPath: '/vault/.claude/settings.json', evidence: { persistence: 'verified', application: 'pending', runtime: 'unavailable' }, result: { status: 'success' } }));
    const restore = jest.fn(async () => ({ evidence: { persistence: 'verified', application: 'pending', runtime: 'unavailable' }, result: { status: 'success', revision: projectRevision } }));
    new SettingsClaudeConfigurationSection({
      plugin: fakePlugin('/vault') as never,
      sourceService: stubService({
        read: async () => readOk('{"model":"x"}'),
        delete: del,
        restore,
        listHistory: async () => ({ status: 'success' as const, targets: [{ canonicalTarget: '/vault/.claude/settings.json', backend: 'claude', scope: 'project', kind: 'settings', format: 'json', entries: [{ identity, archiveKind: 'overwrite', timestamp: 1, size: 2 }] }] }),
      }),
    }).render(body);
    await flushMicrotasks();
    (body.querySelector('[data-claude-config-delete]') as HTMLButtonElement).click();
    expect(body.querySelector('[data-claude-config-delete-confirm]')).toBeTruthy();
    (body.querySelector('[data-claude-config-delete-accept]') as HTMLButtonElement).click();
    await flushMicrotasks();
    expect(del.mock.calls[0][0].expectedRevision).toEqual(projectRevision);
    (body.querySelector('[data-claude-config-history-toggle]') as HTMLButtonElement).click();
    await flushMicrotasks();
    (body.querySelector('[data-claude-config-history-restore]') as HTMLButtonElement).click();
    (body.querySelector('[data-claude-config-restore-accept]') as HTMLButtonElement).click();
    await flushMicrotasks();
    expect(restore.mock.calls[0][0].entryIdentity).toBe(identity);
  });

  it('renders exact-bound history for an absent target without lexical path matching', async () => {
    const body = document.createElement('div');
    document.body.appendChild(body);
    const identity = 'deleted-target-history' as never;
    const restore = jest.fn(async () => ({ evidence: { persistence: 'verified', application: 'pending', runtime: 'unavailable' }, result: { status: 'success', revision: projectRevision } }));
    const listHistory = jest.fn(async () => ({ status: 'success' as const, targets: [{ canonicalTarget: '/canonicalized/vault/.claude/settings.json', backend: 'claude', scope: 'project', kind: 'settings', format: 'json', entries: [{ identity, archiveKind: 'delete', timestamp: 1, size: 2 }] }] }));
    const catalogHistory = jest.fn(async () => { throw new Error('must not be called'); });
    const sourceService = { ...stubService({
      read: async () => ({ status: 'success' as const, source: candidate({ exists: false, revision: null }), content: '' }),
      listHistory,
      restore,
    }), catalogHistory };
    new SettingsClaudeConfigurationSection({
      plugin: fakePlugin('/vault') as never,
      sourceService: sourceService as never,
    }).render(body);
    await flushMicrotasks();
    (body.querySelector('[data-claude-config-history-toggle]') as HTMLButtonElement).click();
    await flushMicrotasks();
    expect(body.querySelector('[data-claude-config-history-entry]')).toBeTruthy();
    expect(listHistory).toHaveBeenCalledWith('/vault/.claude/settings.json');
    expect(catalogHistory).not.toHaveBeenCalled();
    (body.querySelector('[data-claude-config-history-restore]') as HTMLButtonElement).click();
    (body.querySelector('[data-claude-config-restore-accept]') as HTMLButtonElement).click();
    await flushMicrotasks();
    expect(restore.mock.calls[0][0]).toEqual({ entryIdentity: identity, expectedRevision: null });
  });

  it('re-enables the current save control after a fenced save completes after rerender', async () => {
    const body = document.createElement('div');
    document.body.appendChild(body);
    let resolveWrite: () => void = () => {};
    const write = jest.fn(() => new Promise((resolve) => {
      resolveWrite = () => resolve({ targetPath: '/vault/.claude/settings.json', draft: '{"model":"x"}', evidence: { persistence: 'verified', application: 'pending', runtime: 'unavailable' }, result: { status: 'success', revision: projectRevision } });
    }));
    const section = new SettingsClaudeConfigurationSection({
      plugin: fakePlugin('/vault') as never,
      sourceService: stubService({ read: async () => readOk('{"model":"x"}'), write: write as never }),
    });
    section.render(body);
    await flushMicrotasks();
    (body.querySelector('[data-claude-config-save]') as HTMLButtonElement).click();
    section.render(body);
    await flushMicrotasks();
    resolveWrite();
    await flushMicrotasks();
    expect((body.querySelector('[data-claude-config-save]') as HTMLButtonElement).disabled).toBe(false);
    expect(body.querySelector('[data-claude-config-status]')?.getAttribute('data-claude-config-status-level')).not.toBe('ok');
  });

  it('expires a delete confirmation captured before reload refreshes its revision', async () => {
    const body = document.createElement('div');
    document.body.appendChild(body);
    const revision2 = { ...projectRevision, mtimeMs: 11, sha256: 'new' };
    let reads = 0;
    const del = jest.fn();
    new SettingsClaudeConfigurationSection({
      plugin: fakePlugin('/vault') as never,
      sourceService: stubService({
        read: async () => (++reads === 1 ? readOk('{"model":"x"}') : { status: 'success' as const, source: candidate({ revision: revision2 }), content: '{"model":"x"}' }),
        delete: del as never,
      }),
    }).render(body);
    await flushMicrotasks();
    (body.querySelector('[data-claude-config-delete]') as HTMLButtonElement).click();
    const staleAccept = body.querySelector('[data-claude-config-delete-accept]') as HTMLButtonElement;
    (body.querySelector('[data-claude-config-reload]') as HTMLButtonElement).click();
    await flushMicrotasks();
    staleAccept.click();
    expect(del).not.toHaveBeenCalled();
  });

  it('refreshes revision and independent evidence after save without upgrading runtime', async () => {
    const body = document.createElement('div');
    document.body.appendChild(body);
    const revision2 = { ...projectRevision, mtimeMs: 11, sha256: 'new' };
    const inventory = jest.fn()
      .mockResolvedValueOnce([candidate({ revision: projectRevision, evidence: { persistence: 'verified', application: 'unavailable', runtime: 'unavailable' } })])
      .mockResolvedValue([candidate({ revision: revision2, evidence: { persistence: 'verified', application: 'pending', runtime: 'unavailable' } })]);
    new SettingsClaudeConfigurationSection({
      plugin: fakePlugin('/vault') as never,
      sourceService: stubService({
        inventory,
        read: async () => readOk('{"model":"x"}'),
        write: async () => ({ targetPath: '/vault/.claude/settings.json', draft: '{"model":"x"}', evidence: { persistence: 'verified', application: 'pending', runtime: 'unavailable' }, result: { status: 'success', revision: revision2 } }),
      }),
    }).render(body);
    await flushMicrotasks();
    (body.querySelector('[data-claude-config-save]') as HTMLButtonElement).click();
    await flushMicrotasks();
    expect(body.querySelector('[data-claude-config-revision="project"]')?.textContent).toContain('new');
    expect(body.querySelector('[data-claude-config-evidence="project"]')?.textContent).toContain('application=pending');
    expect(body.querySelector('[data-claude-config-evidence="project"]')?.textContent).toContain('runtime=unavailable');
  });
});
