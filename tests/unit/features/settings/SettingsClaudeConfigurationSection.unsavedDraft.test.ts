import { SettingsClaudeConfigurationSection } from '../../../../src/features/settings/SettingsClaudeConfigurationSection';
import { candidate, fakePlugin, flushMicrotasks, projectRevision, readOk, stubService } from './SettingsClaudeConfigurationSection.testSupport';

/**
 * P0-1: unsaved-draft protection. Editing any of the three draft paths (raw
 * JSON, common fields, hooks builder) must gate a target-replacing scope
 * switch behind an explicit Save / Discard / Cancel decision.
 */
const clearDocument = (): void => { document.body.innerHTML = ''; };

beforeEach(clearDocument);
afterEach(clearDocument);

const renderSection = (overrides: Parameters<typeof stubService>[0] = {}) => {
  const body = document.createElement('div');
  document.body.appendChild(body);
  const section = new SettingsClaudeConfigurationSection({
    plugin: fakePlugin('/vault') as never,
    sourceService: stubService({ read: async () => readOk('{"model":"x"}'), ...overrides }),
  });
  section.render(body);
  return body;
};

const editRawDraft = (body: HTMLElement, value: string): void => {
  const draft = body.querySelector('[data-claude-config-draft]') as HTMLTextAreaElement;
  draft.value = value;
  draft.dispatchEvent(new Event('input'));
};

const requestGlobalSwitch = (body: HTMLElement): HTMLSelectElement => {
  const select = body.querySelector('[data-claude-config-scope]') as HTMLSelectElement;
  select.value = 'global';
  select.dispatchEvent(new Event('change'));
  return select;
};

const deferred = <T,>() => {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
};

const settleSaveAndInventory = async (): Promise<void> => {
  await flushMicrotasks();
  await flushMicrotasks();
};

const deferredWriteScenarios = [
  {
    name: 'raw JSON',
    initialDraft: '{"model":"submitted"}',
    editAfterSave: (body: HTMLElement) => editRawDraft(body, '{"model":"live-raw"}'),
    expectLiveDraft: (draft: string) => expect(draft).toContain('live-raw'),
  },
  {
    name: 'common fields',
    initialDraft: '{"model":"submitted","cleanupPeriodDays":7}',
    editAfterSave: (body: HTMLElement) => {
      const model = body.querySelector('[data-claude-config-field="model"]') as HTMLInputElement;
      model.value = 'live-common';
      model.dispatchEvent(new Event('change'));
    },
    expectLiveDraft: (draft: string) => expect(draft).toContain('live-common'),
  },
  {
    name: 'Hooks',
    initialDraft: '{"model":"submitted","hooks":{}}',
    editAfterSave: (body: HTMLElement) => {
      const eventSelect = body.querySelector('[data-claude-hooks-event-select]') as HTMLSelectElement;
      eventSelect.value = 'PreToolUse';
      (body.querySelector('[data-claude-hooks-group-add]') as HTMLButtonElement).click();
    },
    expectLiveDraft: (draft: string) => expect(draft).toContain('PreToolUse'),
  },
] as const;

describe('SettingsClaudeConfigurationSection unsaved draft protection · decisions', () => {

  it('gates a raw-draft edit behind an explicit decision instead of silently clearing it', async () => {
    const body = renderSection();
    await flushMicrotasks();
    editRawDraft(body, '{"model":"y"}');
    const select = requestGlobalSwitch(body);
    expect(body.querySelector('[data-claude-config-switch-confirm]')).toBeTruthy();
    expect((body.querySelector('[data-claude-config-draft]') as HTMLTextAreaElement).value).toBe('{"model":"y"}');
    expect(select.value).toBe('project');
    expect(body.querySelector('[data-claude-config-target]')?.textContent).toBe('/vault/.claude/settings.json');
  });

  it('gates a common-fields edit behind the same decision', async () => {
    const body = renderSection();
    await flushMicrotasks();
    const model = body.querySelector('[data-claude-config-field="model"]') as HTMLInputElement;
    model.value = 'new-model';
    model.dispatchEvent(new Event('change'));
    const select = requestGlobalSwitch(body);
    expect(body.querySelector('[data-claude-config-switch-confirm]')).toBeTruthy();
    expect(select.value).toBe('project');
    expect((body.querySelector('[data-claude-config-draft]') as HTMLTextAreaElement).value).toContain('new-model');
  });

  it('gates a hooks-builder edit behind the same decision', async () => {
    const body = renderSection({ read: async () => readOk('{"hooks":{}}') });
    await flushMicrotasks();
    const eventSelect = body.querySelector('[data-claude-hooks-event-select]') as HTMLSelectElement;
    eventSelect.value = 'PreToolUse';
    (body.querySelector('[data-claude-hooks-group-add]') as HTMLButtonElement).click();
    const select = requestGlobalSwitch(body);
    expect(body.querySelector('[data-claude-config-switch-confirm]')).toBeTruthy();
    expect(select.value).toBe('project');
    expect((body.querySelector('[data-claude-config-draft]') as HTMLTextAreaElement).value).toContain('PreToolUse');
  });

  it('Cancel keeps the current draft and selection untouched', async () => {
    const body = renderSection();
    await flushMicrotasks();
    editRawDraft(body, '{"model":"y"}');
    requestGlobalSwitch(body);
    (body.querySelector('[data-claude-config-switch-cancel]') as HTMLButtonElement).click();
    expect(body.querySelector('[data-claude-config-switch-confirm]')).toBeNull();
    expect((body.querySelector('[data-claude-config-draft]') as HTMLTextAreaElement).value).toBe('{"model":"y"}');
    expect((body.querySelector('[data-claude-config-scope]') as HTMLSelectElement).value).toBe('project');
    expect(body.querySelector('[data-claude-config-target]')?.textContent).toBe('/vault/.claude/settings.json');
  });

  it('Discard switches and replaces the draft with the newly selected source', async () => {
    const read = jest.fn(async (targetPath: string) => targetPath.includes('home')
      ? { status: 'success' as const, source: candidate({ scope: 'global', path: '/home/.claude/settings.json' }), content: '{"model":"global"}' }
      : readOk('{"model":"x"}'));
    const body = renderSection({ read });
    await flushMicrotasks();
    editRawDraft(body, '{"model":"y"}');
    requestGlobalSwitch(body);
    (body.querySelector('[data-claude-config-switch-discard]') as HTMLButtonElement).click();
    await flushMicrotasks();
    expect(body.querySelector('[data-claude-config-switch-confirm]')).toBeNull();
    expect((body.querySelector('[data-claude-config-scope]') as HTMLSelectElement).value).toBe('global');
    expect(body.querySelector('[data-claude-config-target]')?.textContent).toBe('/home/.claude/settings.json');
    expect((body.querySelector('[data-claude-config-draft]') as HTMLTextAreaElement).value).toBe('{"model":"global"}');
  });

  it('Save & switch persists the current draft before switching', async () => {
    const write = jest.fn(async (params: { targetPath: string; content: string }) => ({
      targetPath: params.targetPath,
      draft: params.content,
      evidence: { persistence: 'verified', application: 'pending', runtime: 'unavailable' },
      result: { status: 'success', revision: projectRevision },
    }));
    const read = jest.fn(async (targetPath: string) => targetPath.includes('home')
      ? { status: 'success' as const, source: candidate({ scope: 'global', path: '/home/.claude/settings.json' }), content: '{"model":"global"}' }
      : readOk('{"model":"x"}'));
    const body = renderSection({ read, write });
    await flushMicrotasks();
    editRawDraft(body, '{"model":"y"}');
    requestGlobalSwitch(body);
    (body.querySelector('[data-claude-config-switch-save]') as HTMLButtonElement).click();
    await flushMicrotasks();
    expect(write).toHaveBeenCalledWith(expect.objectContaining({
      targetPath: '/vault/.claude/settings.json',
      content: '{"model":"y"}',
    }));
    expect((body.querySelector('[data-claude-config-scope]') as HTMLSelectElement).value).toBe('global');
    expect(body.querySelector('[data-claude-config-target]')?.textContent).toBe('/home/.claude/settings.json');
  });

  it('does not switch when the save fails, and keeps the decision open', async () => {
    const write = jest.fn(async (params: { targetPath: string; content: string }) => ({
      targetPath: params.targetPath,
      draft: params.content,
      evidence: { persistence: 'failed', application: 'unavailable', runtime: 'unavailable' },
      result: { status: 'failed' },
    }));
    const body = renderSection({ write: write as never });
    await flushMicrotasks();
    editRawDraft(body, '{"model":"y"}');
    const select = requestGlobalSwitch(body);
    (body.querySelector('[data-claude-config-switch-save]') as HTMLButtonElement).click();
    await flushMicrotasks();
    expect(select.value).toBe('project');
    expect(body.querySelector('[data-claude-config-target]')?.textContent).toBe('/vault/.claude/settings.json');
    expect((body.querySelector('[data-claude-config-draft]') as HTMLTextAreaElement).value).toBe('{"model":"y"}');
    expect(body.querySelector('[data-claude-config-switch-confirm]')).toBeTruthy();
  });

  it('does not switch on a CAS conflict and keeps the conflict draft intact', async () => {
    const write = jest.fn(async (params: { content: string }) => ({
      targetPath: '/vault/.claude/settings.json',
      draft: params.content,
      evidence: { persistence: 'failed', application: 'unavailable', runtime: 'unavailable' },
      result: { status: 'conflict' },
    }));
    const body = renderSection({ write: write as never });
    await flushMicrotasks();
    editRawDraft(body, '{"model":"kept"}');
    const select = requestGlobalSwitch(body);
    (body.querySelector('[data-claude-config-switch-save]') as HTMLButtonElement).click();
    await flushMicrotasks();
    expect(select.value).toBe('project');
    expect((body.querySelector('[data-claude-config-draft]') as HTMLTextAreaElement).value).toBe('{"model":"kept"}');
    expect((body.querySelector('[data-claude-config-reload]') as HTMLButtonElement).hidden).toBe(false);
    expect((body.querySelector('[data-claude-config-compare]') as HTMLButtonElement).hidden).toBe(false);
  });
});

describe('SettingsClaudeConfigurationSection unsaved draft protection · async decisions', () => {

  it('does not complete a pending Save & Switch after the user cancels that decision', async () => {
    const pendingWrite = deferred<{
      targetPath: string;
      draft: string;
      evidence: { persistence: 'verified'; application: 'pending'; runtime: 'unavailable' };
      result: { status: 'success'; revision: typeof projectRevision };
    }>();
    const body = renderSection({ write: jest.fn(() => pendingWrite.promise) as never });
    await settleSaveAndInventory();
    editRawDraft(body, '{"model":"saved-before-cancel"}');
    const select = requestGlobalSwitch(body);
    (body.querySelector('[data-claude-config-switch-save]') as HTMLButtonElement).click();
    (body.querySelector('[data-claude-config-switch-cancel]') as HTMLButtonElement).click();

    pendingWrite.resolve({
      targetPath: '/vault/.claude/settings.json',
      draft: '{"model":"saved-before-cancel"}',
      evidence: { persistence: 'verified', application: 'pending', runtime: 'unavailable' },
      result: { status: 'success', revision: projectRevision },
    });
    await settleSaveAndInventory();

    expect(select.value).toBe('project');
    expect(body.querySelector('[data-claude-config-target]')?.textContent).toBe('/vault/.claude/settings.json');
    expect(body.querySelector('[data-claude-config-switch-confirm]')).toBeNull();
  });

  it('keeps a newer Local switch decision authoritative while a Global Save & Switch is pending', async () => {
    const pendingWrite = deferred<{
      targetPath: string;
      draft: string;
      evidence: { persistence: 'verified'; application: 'pending'; runtime: 'unavailable' };
      result: { status: 'success'; revision: typeof projectRevision };
    }>();
    const read = jest.fn(async (targetPath: string) => targetPath.includes('settings.local.json')
      ? { status: 'success' as const, source: candidate({ scope: 'local', path: '/vault/.claude/settings.local.json' }), content: '{"model":"local"}' }
      : readOk('{"model":"project"}'));
    const body = renderSection({ read: read as never, write: jest.fn(() => pendingWrite.promise) as never });
    await settleSaveAndInventory();
    editRawDraft(body, '{"model":"saved-before-retarget"}');
    const select = requestGlobalSwitch(body);
    (body.querySelector('[data-claude-config-switch-save]') as HTMLButtonElement).click();

    select.value = 'local';
    select.dispatchEvent(new Event('change'));
    const localDiscard = body.querySelector('[data-claude-config-switch-discard]') as HTMLButtonElement;
    expect(localDiscard).toBeTruthy();

    pendingWrite.resolve({
      targetPath: '/vault/.claude/settings.json',
      draft: '{"model":"saved-before-retarget"}',
      evidence: { persistence: 'verified', application: 'pending', runtime: 'unavailable' },
      result: { status: 'success', revision: projectRevision },
    });
    await settleSaveAndInventory();

    expect(select.value).toBe('project');
    expect(body.querySelector('[data-claude-config-switch-discard]')).toBe(localDiscard);
    localDiscard.click();
    await flushMicrotasks();
    expect(select.value).toBe('local');
    expect(body.querySelector('[data-claude-config-target]')?.textContent).toBe('/vault/.claude/settings.local.json');
  });

  it('disables Save & switch while the draft is invalid JSON but still allows discard or cancel', async () => {
    const body = renderSection();
    await flushMicrotasks();
    editRawDraft(body, '{"unterminated":');
    requestGlobalSwitch(body);
    const save = body.querySelector('[data-claude-config-switch-save]') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect((body.querySelector('[data-claude-config-switch-discard]') as HTMLButtonElement).disabled).toBe(false);
    (body.querySelector('[data-claude-config-switch-cancel]') as HTMLButtonElement).click();
    expect((body.querySelector('[data-claude-config-draft]') as HTMLTextAreaElement).value).toBe('{"unterminated":');
  });

  it('switches immediately without a decision when the draft has no unsaved changes', async () => {
    const body = renderSection();
    await flushMicrotasks();
    const select = requestGlobalSwitch(body);
    await flushMicrotasks();
    expect(body.querySelector('[data-claude-config-switch-confirm]')).toBeNull();
    expect(select.value).toBe('global');
    expect(body.querySelector('[data-claude-config-target]')?.textContent).toBe('/home/.claude/settings.json');
  });

  it('states explicitly that Reload discards the draft', async () => {
    const body = renderSection();
    await flushMicrotasks();
    const reload = body.querySelector('[data-claude-config-reload]') as HTMLButtonElement;
    expect(/discard|放弃/i.test(`${reload.textContent} ${reload.getAttribute('aria-label') ?? ''}`)).toBe(true);
  });

  it('keeps the saved status visible after a slow post-save re-read resolves', async () => {
    // Regression: the post-save if-clean re-read runs on real disk I/O and
    // resolves long after the controller's saved status; it must not wipe it.
    let reads = 0;
    let releaseSlowRead: ((value: ReturnType<typeof readOk>) => void) | null = null;
    const read = jest.fn(() => {
      reads += 1;
      if (reads === 1) return Promise.resolve(readOk('{"model":"x"}'));
      return new Promise<ReturnType<typeof readOk>>((resolve) => {
        releaseSlowRead = resolve;
      });
    });
    const writeOk = {
      targetPath: '/vault/.claude/settings.json',
      draft: '{"model":"y"}',
      evidence: { persistence: 'verified', application: 'pending', runtime: 'unavailable' },
      result: { status: 'success' as const, revision: projectRevision },
    };
    const body = renderSection({
      read: read as never,
      write: async () => writeOk as never,
      inventory: async () => [candidate()],
    });
    await flushMicrotasks();
    editRawDraft(body, '{"model":"y"}');
    (body.querySelector('[data-claude-config-save]') as HTMLButtonElement).click();
    await flushMicrotasks();
    // The post-save re-read is still in flight; let it land.
    releaseSlowRead?.(readOk('{"model":"y"}'));
    await flushMicrotasks();
    const status = body.querySelector('[data-claude-config-status]') as HTMLElement;
    expect(status.textContent).toContain('Persistence: verified');
    expect(status.textContent).not.toContain('persistence=');
  });
});

describe('SettingsClaudeConfigurationSection unsaved draft protection · deferred edits', () => {

  it.each(deferredWriteScenarios)(
    'keeps a post-click $name edit dirty after an ordinary deferred Save',
    async ({ initialDraft, editAfterSave, expectLiveDraft }) => {
      const pendingWrite = deferred<{
        targetPath: string;
        draft: string;
        evidence: { persistence: 'verified'; application: 'pending'; runtime: 'unavailable' };
        result: { status: 'success'; revision: typeof projectRevision };
      }>();
      const write = jest.fn(() => pendingWrite.promise);
      let diskDraft = '{"model":"baseline"}';
      const read = jest.fn(async () => readOk(diskDraft));
      const body = renderSection({
        read: read as never,
        write: write as never,
        inventory: async () => [candidate()],
      });
      await settleSaveAndInventory();
      editRawDraft(body, initialDraft);
      (body.querySelector('[data-claude-config-save]') as HTMLButtonElement).click();
      expect(write).toHaveBeenCalledWith(expect.objectContaining({ content: initialDraft }));

      editAfterSave(body);
      diskDraft = initialDraft;
      pendingWrite.resolve({
        targetPath: '/vault/.claude/settings.json',
        draft: initialDraft,
        evidence: { persistence: 'verified', application: 'pending', runtime: 'unavailable' },
        result: { status: 'success', revision: projectRevision },
      });
      await settleSaveAndInventory();

      const draft = body.querySelector('[data-claude-config-draft]') as HTMLTextAreaElement;
      expectLiveDraft(draft.value);
      expect((body.querySelector('[data-claude-config-save]') as HTMLButtonElement).disabled).toBe(false);
    },
  );

  it.each(deferredWriteScenarios)(
    'does not switch scope when a post-click $name edit supersedes a deferred Save & Switch snapshot',
    async ({ initialDraft, editAfterSave, expectLiveDraft }) => {
      const pendingWrite = deferred<{
        targetPath: string;
        draft: string;
        evidence: { persistence: 'verified'; application: 'pending'; runtime: 'unavailable' };
        result: { status: 'success'; revision: typeof projectRevision };
      }>();
      const write = jest.fn(() => pendingWrite.promise);
      let diskDraft = '{"model":"baseline"}';
      const read = jest.fn(async (targetPath: string) => targetPath.includes('home')
        ? { status: 'success' as const, source: candidate({ scope: 'global', path: '/home/.claude/settings.json' }), content: '{"model":"global"}' }
        : readOk(diskDraft));
      const body = renderSection({
        read: read as never,
        write: write as never,
        inventory: async () => [candidate()],
      });
      await settleSaveAndInventory();
      editRawDraft(body, initialDraft);
      const select = requestGlobalSwitch(body);
      (body.querySelector('[data-claude-config-switch-save]') as HTMLButtonElement).click();
      expect(write).toHaveBeenCalledWith(expect.objectContaining({ content: initialDraft }));

      editAfterSave(body);
      diskDraft = initialDraft;
      pendingWrite.resolve({
        targetPath: '/vault/.claude/settings.json',
        draft: initialDraft,
        evidence: { persistence: 'verified', application: 'pending', runtime: 'unavailable' },
        result: { status: 'success', revision: projectRevision },
      });
      await settleSaveAndInventory();

      const draft = body.querySelector('[data-claude-config-draft]') as HTMLTextAreaElement;
      expect(select.value).toBe('project');
      expect(body.querySelector('[data-claude-config-target]')?.textContent).toBe('/vault/.claude/settings.json');
      expectLiveDraft(draft.value);
      expect((body.querySelector('[data-claude-config-status]')?.textContent ?? '')).toMatch(/continue editing/i);
    },
  );
});
