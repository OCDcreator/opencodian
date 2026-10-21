import { lstat, mkdir, mkdtemp, readdir, readFile, realpath, rmdir, unlink, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

import { ClaudeSettingsSourceService } from '../../../../src/core/agents/backend/ClaudeSettingsSourceService';
import { type ClaudeSettingsServiceBoundary, SettingsClaudeConfigurationSection } from '../../../../src/features/settings/SettingsClaudeConfigurationSection';
import { candidate, fakePlugin, flushMicrotasks, projectRevision, readOk, stubService } from './SettingsClaudeConfigurationSection.testSupport';

const clearDocument = (): void => { document.body.innerHTML = ''; };

beforeEach(clearDocument);
afterEach(clearDocument);

const deferred = <T,>() => {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
};

describe('matrix006 Claude dual-field saves with production filesystem CAS', () => {
  it.each([false, true])('serializes rapid saves and preserves both fields or external bytes (external=%s)', async (external) => {
    const fixtureRoot = path.resolve('.tmp');
    await mkdir(fixtureRoot, { recursive: true });
    const workspace = await mkdtemp(path.join(fixtureRoot, 'matrix006-cas-'));
    const releases = [deferred<void>(), deferred<void>()];
    const results = [deferred<Awaited<ReturnType<ClaudeSettingsServiceBoundary['write']>>>(), deferred<Awaited<ReturnType<ClaudeSettingsServiceBoundary['write']>>>()];
    try {
      const source = new ClaudeSettingsSourceService(workspace, {
        home: path.join(workspace, 'fake-home'), managedConfigDir: path.join(workspace, 'fake-managed'),
        managedPreferencesDir: path.join(workspace, 'fake-preferences'), username: 'fixture-user',
        archiveRootPath: path.join(workspace, 'archive'),
      });
      const target = source.getDefaultProjectSettingsPath();
      await mkdir(path.dirname(target));
      await writeFile(target, '{"model":"fixture-old","cleanupPeriodDays":30,"unrelated":"kept"}');
      const initial = await source.read(target);
      if (initial.status !== 'success') throw new Error('Fixture read failed');
      let dispatched = 0;
      // Only release timing is controlled. Persistence and revision checks execute the production writer.
      const write = jest.fn(async (params: Parameters<ClaudeSettingsServiceBoundary['write']>[0]) => {
        const index = dispatched++;
        await releases[index].promise;
        const result = await source.write(params);
        results[index].resolve(result);
        return result;
      });
      const body = document.body.appendChild(document.createElement('div'));
      new SettingsClaudeConfigurationSection({
        plugin: fakePlugin(workspace) as never,
        sourceService: stubService({ read: source.read.bind(source), write,
          getDefaultProjectSettingsPath: () => target, getDefaultGlobalSettingsPath: () => source.getDefaultGlobalSettingsPath() }),
      }).render(body);
      const model = body.querySelector('[data-claude-config-field="model"]') as HTMLInputElement;
      const cleanup = body.querySelector('[data-claude-config-field="cleanupPeriodDays"]') as HTMLInputElement;
      const draft = body.querySelector('[data-claude-config-draft]') as HTMLTextAreaElement;
      const save = body.querySelector('[data-claude-config-save]') as HTMLButtonElement;
      for (let attempt = 0; !draft.value && attempt < 100; attempt++) await flushMicrotasks();
      expect(JSON.parse(draft.value)).toEqual({ model: 'fixture-old', cleanupPeriodDays: 30, unrelated: 'kept' });
      model.value = 'fixture-new';
      model.dispatchEvent(new Event('change'));
      save.click();
      cleanup.value = '45';
      cleanup.dispatchEvent(new Event('change'));
      save.click();
      save.click();
      expect(write).toHaveBeenCalledTimes(1);
      expect(save.disabled).toBe(true);
      expect(JSON.parse(write.mock.calls[0][0].content)).toEqual({ model: 'fixture-new', cleanupPeriodDays: 30, unrelated: 'kept' });
      expect(write.mock.calls[0][0].expectedRevision).toEqual(initial.source.revision);
      releases[0].resolve();
      const first = await results[0].promise;
      for (let attempt = 0; save.disabled && attempt < 100; attempt++) await flushMicrotasks();
      expect(first.result.status).toBe('success');
      expect(JSON.parse(await readFile(target, 'utf8'))).toEqual({ model: 'fixture-new', cleanupPeriodDays: 30, unrelated: 'kept' });
      expect(JSON.parse(draft.value)).toEqual({ model: 'fixture-new', cleanupPeriodDays: 45, unrelated: 'kept' });
      expect(save.disabled).toBe(false);
      save.click();
      expect(write).toHaveBeenCalledTimes(2);
      expect(write.mock.calls[1][0]).toEqual({ targetPath: target, content: draft.value,
        expectedRevision: first.result.status === 'success' ? first.result.revision : null });
      const externalBytes = '{ "external": "fixture-external", "unrelated": "external-kept" }\n';
      if (external) await writeFile(target, externalBytes);
      releases[1].resolve();
      const second = await results[1].promise;
      for (let attempt = 0; save.disabled && attempt < 100; attempt++) await flushMicrotasks();
      expect(second.result.status).toBe(external ? 'conflict' : 'success');
      expect(JSON.parse(draft.value)).toEqual({ model: 'fixture-new', cleanupPeriodDays: 45, unrelated: 'kept' });
      expect(await readFile(target, 'utf8')).toBe(external ? externalBytes : draft.value);
      expect(body.querySelector('[data-claude-config-status]')?.getAttribute('data-claude-config-status-level')).toBe(external ? 'error' : 'ok');
      expect((body.querySelector('[data-claude-config-compare]') as HTMLButtonElement).hidden).toBe(!external);
      expect(second.evidence).toEqual({ persistence: external ? 'failed' : 'verified',
        application: external ? 'unavailable' : 'pending', runtime: 'unavailable' });
    } finally {
      releases.forEach(release => release.resolve());
      // Non-recursive cleanup is confined to the unique fixture this test created.
      expect(await realpath(workspace)).toBe(workspace);
      expect(workspace.startsWith(fixtureRoot + path.sep)).toBe(true);
      for (const entry of (await readdir(workspace, { recursive: true })).sort((a, b) => b.split(path.sep).length - a.split(path.sep).length)) {
        const owned = path.join(workspace, entry);
        if ((await lstat(owned)).isDirectory()) await rmdir(owned);
        else await unlink(owned);
      }
      await rmdir(workspace);
    }
  });
});

describe('SettingsClaudeConfigurationSection compare and mutation controller · compare and history', () => {
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
});

describe('SettingsClaudeConfigurationSection compare and mutation controller · request fencing', () => {

  it('keeps the latest reopened History request busy and does not render a closed request response', async () => {
    const first = deferred<Awaited<ReturnType<ClaudeSettingsServiceBoundary['listHistory']>>>();
    const second = deferred<Awaited<ReturnType<ClaudeSettingsServiceBoundary['listHistory']>>>();
    const listHistory = jest.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const body = document.createElement('div');
    document.body.appendChild(body);
    new SettingsClaudeConfigurationSection({
      plugin: fakePlugin('/vault') as never,
      sourceService: stubService({ read: async () => readOk('{"model":"x"}'), listHistory: listHistory as never }),
    }).render(body);
    await flushMicrotasks();
    const toggle = body.querySelector('[data-claude-config-history-toggle]') as HTMLButtonElement;
    const history = body.querySelector('[data-claude-config-history]') as HTMLElement;

    toggle.click();
    toggle.click();
    toggle.click();
    expect(listHistory).toHaveBeenCalledTimes(2);
    expect(history.hidden).toBe(false);
    expect(history.getAttribute('aria-busy')).toBe('true');

    first.resolve({
      status: 'success',
      targets: [{
        canonicalTarget: '/vault/.claude/settings.json', backend: 'claude', scope: 'project', kind: 'settings', format: 'json',
        entries: [{ identity: 'stale-history-entry' as never, archiveKind: 'overwrite', timestamp: 1, size: 2 }],
      }],
    });
    await flushMicrotasks();

    expect(history.getAttribute('aria-busy')).toBe('true');
    expect(history.querySelector('[data-claude-config-history-entry]')).toBeNull();

    second.resolve({
      status: 'success',
      targets: [{
        canonicalTarget: '/vault/.claude/settings.json', backend: 'claude', scope: 'project', kind: 'settings', format: 'json',
        entries: [{ identity: 'current-history-entry' as never, archiveKind: 'overwrite', timestamp: 2, size: 4 }],
      }],
    });
    await flushMicrotasks();

    expect(history.getAttribute('aria-busy')).toBe('false');
    expect(history.querySelector('[data-claude-config-history-entry]')?.getAttribute('data-claude-config-history-entry')).toBe('2');
  });

  it('keeps a failed source-inventory alert outside a default-hidden disclosure', async () => {
    const body = document.createElement('div');
    document.body.appendChild(body);
    new SettingsClaudeConfigurationSection({
      plugin: fakePlugin('/vault') as never,
      sourceService: stubService({
        read: async () => readOk('{"model":"x"}'),
        inventory: async () => { throw new Error('inventory unavailable'); },
      }),
    }).render(body);
    await flushMicrotasks();

    const error = body.querySelector('[data-claude-config-error]') as HTMLElement;
    const sources = body.querySelector('[data-claude-config-sources]') as HTMLElement;
    const toggle = body.querySelector('[data-claude-config-sources-toggle]') as HTMLButtonElement;
    expect(error.getAttribute('role')).toBe('alert');
    expect(error.getAttribute('aria-live')).toBe('assertive');
    expect(error.closest('[hidden]')).toBeNull();
    expect(sources.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('SettingsClaudeConfigurationSection compare and mutation controller · rerender and revisions', () => {

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
