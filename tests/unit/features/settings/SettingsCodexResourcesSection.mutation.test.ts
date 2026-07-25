/**
 * Settings-layer contract test: Codex project resource mutations
 * (create/update/delete) invoke `onAfterMutation`, which the host wires to
 * `plugin.invalidateSlashCommandCatalog()` so the chat menu cache refreshes
 * immediately (not via skills/changed or the 120s TTL).
 *
 * Exercises the section with mocked Obsidian primitives (Modal/Setting/Notice)
 * and mocked discovery CRUD that resolves ok, then asserts the callback fires.
 * The resource rows and action buttons are real DOM (row-card redesign), so
 * the harness drives them with native clicks; the create modal's name field
 * still flows through a mocked `Setting.addText` whose onChange is captured.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { Modal, Setting } from 'obsidian';

import { SettingsCodexResourcesSection } from '../../../../src/features/settings/SettingsCodexResourcesSection';

// Mock the backend CRUD + discovery so the section's success path runs without
// touching the filesystem and renders an empty list per group.
jest.mock('../../../../src/core/agents/backend/CodexProjectResourceDiscovery', () => ({
  createCodexSkillResource: jest.fn().mockResolvedValue({ status: 'success', targetPath: '/vault/.agents/skills/x/SKILL.md', revision: { canonicalPath: '/vault/.agents/skills/x/SKILL.md', mtimeMs: 1, size: 1, sha256: 'a'.repeat(64) } }),
  createCodexAgentResource: jest.fn().mockResolvedValue({ status: 'success', targetPath: '/vault/.codex/agents/x.toml', revision: { canonicalPath: '/vault/.codex/agents/x.toml', mtimeMs: 1, size: 1, sha256: 'a'.repeat(64) } }),
  updateCodexSkillResource: jest.fn().mockResolvedValue({ status: 'success' }),
  updateCodexAgentResource: jest.fn().mockResolvedValue({ status: 'success' }),
  deleteCodexSkillResource: jest.fn().mockResolvedValue({ status: 'success' }),
  deleteCodexAgentResource: jest.fn().mockResolvedValue({ status: 'success' }),
  discoverCodexSkillResources: jest.fn().mockResolvedValue([]),
  discoverCodexAgentResources: jest.fn().mockResolvedValue([]),
  catalogCodexSkillResourceHistory: jest.fn().mockResolvedValue({ status: 'success', targets: [] }),
  catalogCodexAgentResourceHistory: jest.fn().mockResolvedValue({ status: 'success', targets: [] }),
  restoreCodexSkillResourceHistoryEntry: jest.fn().mockResolvedValue({ status: 'success' }),
  restoreCodexAgentResourceHistoryEntry: jest.fn().mockResolvedValue({ status: 'success' }),
  readCodexSkillContent: jest.fn().mockResolvedValue('---\nname: x\ndescription: y\n---\n# x\n'),
  readCodexSkillResourceContent: jest.fn().mockResolvedValue({ status: 'success', content: '---\nname: x\ndescription: y\n---\n# x\n', revision: { canonicalPath: '/vault/.agents/skills/x/SKILL.md', mtimeMs: 1, size: 1, sha256: 'a'.repeat(64) }, scope: 'project', targetPath: '/vault/.agents/skills/x/SKILL.md' }),
  readCodexAgentContent: jest.fn().mockResolvedValue('name = "x"\ndescription = "y"\n'),
  readCodexAgentResourceContent: jest.fn().mockResolvedValue({ status: 'success', content: 'name = "x"\ndescription = "y"\n', revision: { canonicalPath: '/vault/.codex/agents/x.toml', mtimeMs: 1, size: 1, sha256: 'a'.repeat(64) }, scope: 'project', targetPath: '/vault/.codex/agents/x.toml' }),
  defaultCodexSkillContent: jest.fn().mockReturnValue('---\nname: x\ndescription: y\n---\n# x\n'),
  defaultCodexAgentContent: jest.fn().mockReturnValue('name = "x"\ndescription = "y"\n'),
  validateCodexSkillContent: jest.fn().mockReturnValue(null),
  validateCodexAgentContent: jest.fn().mockReturnValue(null),
}));

jest.mock('../../../../src/core/agents/backend', () => ({
  createCodexProjectSkill: jest.fn().mockResolvedValue({ ok: true, path: '/vault/.agents/skills/x/SKILL.md' }),
  createCodexProjectAgent: jest.fn().mockResolvedValue({ ok: true, path: '/vault/.codex/agents/x.toml' }),
  updateCodexProjectSkill: jest.fn().mockResolvedValue({ ok: true, path: '/vault/.agents/skills/x/SKILL.md' }),
  updateCodexProjectAgent: jest.fn().mockResolvedValue({ ok: true, path: '/vault/.codex/agents/x.toml' }),
  deleteCodexProjectSkill: jest.fn().mockResolvedValue({ ok: true, path: '/vault/.agents/skills/x' }),
  deleteCodexProjectAgent: jest.fn().mockResolvedValue({ ok: true, path: '/vault/.codex/agents/x.toml' }),
  discoverCodexProjectSkills: jest.fn().mockResolvedValue([]),
  discoverCodexGlobalSkills: jest.fn().mockResolvedValue([]),
  discoverCodexProjectAgents: jest.fn().mockResolvedValue([]),
  discoverCodexGlobalAgents: jest.fn().mockResolvedValue([]),
  readCodexSkillContent: jest.fn().mockResolvedValue('---\nname: x\ndescription: y\n---\n# x\n'),
  readCodexAgentContent: jest.fn().mockResolvedValue('name = "x"\ndescription = "y"\n'),
  defaultCodexSkillContent: jest.fn().mockReturnValue('---\nname: x\ndescription: y\n---\n# x\n'),
  defaultCodexAgentContent: jest.fn().mockReturnValue('name = "x"\ndescription = "y"\n'),
  validateCodexSkillContent: jest.fn().mockReturnValue(null),
  validateCodexAgentContent: jest.fn().mockReturnValue(null),
}));

const backend = jest.requireMock('../../../../src/core/agents/backend') as Record<string, jest.Mock>;
const scopedBackend = jest.requireMock('../../../../src/core/agents/backend/CodexProjectResourceDiscovery') as Record<string, jest.Mock>;

/**
 * Capture create-modal interactions: the text-field setter (mocked
 * `Setting.addText` onChange) and each opened Modal instance (via `open`).
 */
function captureModalControls() {
  const textChangeSetters: Array<(value: string) => void> = [];
  const modals: Modal[] = [];

  jest.spyOn(Setting.prototype, 'addText').mockImplementation(function (this: any, cb: any) {
    const fakeText = {
      onChange(setter: (value: string) => void) { textChangeSetters.push(setter); return fakeText; },
      setValue() { return fakeText; },
    };
    if (typeof cb === 'function') {
      cb(fakeText);
    }
    return this;
  });
  jest.spyOn(Modal.prototype, 'open').mockImplementation(function (this: Modal) {
    modals.push(this);
  });

  return {
    modals,
    setNextTextInput(value: string): void {
      textChangeSetters.forEach((setter) => setter(value));
      textChangeSetters.length = 0;
    },
  };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('SettingsCodexResourcesSection — onAfterMutation contract', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    Object.values(backend).forEach((m) => m.mockClear());
    Object.values(scopedBackend).filter((m): m is jest.Mock => typeof m?.mockClear === 'function').forEach((m) => m.mockClear());
  });

  function makeSection(onAfterMutation: () => void): SettingsCodexResourcesSection {
    return new SettingsCodexResourcesSection({
      plugin: {
        app: { vault: { adapter: { basePath: '/vault' } } },
      } as any,
      createSectionHeading: (hostEl: HTMLElement) => hostEl.createEl('h3'),
      onAfterMutation,
    });
  }

  function renderAndGetCreateButtons(section: SettingsCodexResourcesSection): NodeListOf<HTMLButtonElement> {
    const containerEl = document.createElement('div');
    section.render(containerEl);
    // [0] = skills group create, [1] = agents group create
    return containerEl.querySelectorAll<HTMLButtonElement>('.opencodian-codex-resource-create');
  }

  it('invokes onAfterMutation after a successful project skill create', async () => {
    const spy = jest.fn();
    const section = makeSection(spy);
    const controls = captureModalControls();

    const createButtons = renderAndGetCreateButtons(section);
    expect(createButtons.length).toBeGreaterThanOrEqual(2);
    createButtons[0].click();
    controls.setNextTextInput('x');

    const modal = controls.modals.at(-1) as any;
    const confirmEl = modal.contentEl.querySelector('.mod-cta') as HTMLButtonElement;
    expect(confirmEl).toBeTruthy();
    confirmEl.click();
    await flush();

    expect(scopedBackend.createCodexSkillResource).toHaveBeenCalledWith(expect.objectContaining({ scope: 'project', basePath: '/vault', name: 'x', expectedRevision: null }));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('invokes onAfterMutation after a successful project agent create', async () => {
    const spy = jest.fn();
    const section = makeSection(spy);
    const controls = captureModalControls();

    const createButtons = renderAndGetCreateButtons(section);
    createButtons[1].click();
    controls.setNextTextInput('x');

    const modal = controls.modals.at(-1) as any;
    (modal.contentEl.querySelector('.mod-cta') as HTMLButtonElement).click();
    await flush();

    expect(scopedBackend.createCodexAgentResource).toHaveBeenCalledWith(expect.objectContaining({ scope: 'project', basePath: '/vault', name: 'x', expectedRevision: null }));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does NOT invoke onAfterMutation when create fails', async () => {
    scopedBackend.createCodexSkillResource.mockResolvedValueOnce({ status: 'conflict', expected: null, current: null });
    const spy = jest.fn();
    const section = makeSection(spy);
    const controls = captureModalControls();

    const createButtons = renderAndGetCreateButtons(section);
    createButtons[0].click();
    controls.setNextTextInput('dup');

    const modal = controls.modals.at(-1) as any;
    (modal.contentEl.querySelector('.mod-cta') as HTMLButtonElement).click();
    await flush();

    expect(spy).not.toHaveBeenCalled();
  });

  it('replaces resource groups, heading, and runtime readback after create/update/delete reloads', async () => {
    const revisions = {
      initial: { canonicalPath: '/vault/.agents/skills/x/SKILL.md', mtimeMs: 1, size: 8, sha256: 'a'.repeat(64) },
      created: { canonicalPath: '/vault/.agents/skills/x/SKILL.md', mtimeMs: 2, size: 9, sha256: 'b'.repeat(64) },
      updated: { canonicalPath: '/vault/.agents/skills/x/SKILL.md', mtimeMs: 3, size: 10, sha256: 'c'.repeat(64) },
    };
    let phase: 'initial' | 'created' | 'updated' | 'deleted' = 'initial';
    const currentRevision = () => revisions[phase === 'deleted' ? 'updated' : phase];
    scopedBackend.discoverCodexSkillResources.mockImplementation(async ({ scope }: { scope: string }) => (
      scope === 'project' && phase !== 'deleted'
        ? [{
          name: 'x', description: `phase-${phase}`, skillMdPath: currentRevision().canonicalPath, relativePath: '.agents/skills/x',
          readonly: false, scope: 'project', revision: currentRevision(),
        }]
        : []
    ));
    scopedBackend.createCodexSkillResource.mockImplementation(async () => {
      phase = 'created';
      return { status: 'success', targetPath: revisions.created.canonicalPath, revision: revisions.created };
    });
    scopedBackend.readCodexSkillResourceContent.mockImplementation(async () => ({
      status: 'success', content: `# ${phase}\n`, revision: currentRevision(), scope: 'project', targetPath: currentRevision().canonicalPath,
    }));
    scopedBackend.updateCodexSkillResource.mockImplementation(async () => {
      phase = 'updated';
      return { status: 'success', targetPath: revisions.updated.canonicalPath, revision: revisions.updated };
    });
    scopedBackend.deleteCodexSkillResource.mockImplementation(async () => {
      phase = 'deleted';
      return { status: 'success', targetPath: revisions.updated.canonicalPath };
    });

    const textSetters: Array<(value: string) => void> = [];
    const modals: Modal[] = [];
    jest.spyOn(Setting.prototype, 'addText').mockImplementation(function (this: any, callback: any) {
      const control = { onChange(setter: (value: string) => void) { textSetters.push(setter); return control; } };
      callback(control);
      return this;
    });
    jest.spyOn(Modal.prototype, 'open').mockImplementation(function (this: Modal) { modals.push(this); });
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    const container = document.createElement('div');
    const section = makeSection(jest.fn());
    section.render(container);

    const expectDom = (revision: string | null): void => {
      expect(container.querySelectorAll('h3')).toHaveLength(1);
      expect(container.querySelectorAll('[data-codex-resource-group="skill"]')).toHaveLength(1);
      expect(container.querySelectorAll('[data-codex-resource-group="agent"]')).toHaveLength(1);
      expect(container.querySelectorAll('[data-codex-runtime-readback="skills-list"]')).toHaveLength(1);
      expect(container.querySelectorAll('.opencodian-codex-resource-boundary-note')).toHaveLength(1);
      const rows = container.querySelectorAll('[data-codex-resource-group="skill"] .opencodian-codex-resource-row');
      expect(rows).toHaveLength(revision ? 1 : 0);
      expect(rows[0]?.getAttribute('data-resource-revision') ?? null).toBe(revision);
    };
    await flush();
    expectDom(revisions.initial.sha256);

    (container.querySelector('[data-codex-resource-group="skill"] .opencodian-codex-resource-create') as HTMLButtonElement).click();
    textSetters.splice(0).forEach((setter) => setter('x'));
    (modals.at(-1)?.contentEl.querySelector('.mod-cta') as HTMLButtonElement).click();
    await flush();
    expectDom(revisions.created.sha256);

    (container.querySelector('[data-codex-resource-group="skill"] .opencodian-codex-resource-edit') as HTMLButtonElement).click();
    await flush();
    const editModal = modals.at(-1) as Modal;
    const editor = editModal.contentEl.querySelector('textarea') as HTMLTextAreaElement;
    editor.value = '# updated\n';
    editor.dispatchEvent(new Event('input'));
    (editModal.contentEl.querySelector('.mod-cta') as HTMLButtonElement).click();
    await flush();
    expectDom(revisions.updated.sha256);

    (container.querySelector('[data-codex-resource-group="skill"] .opencodian-codex-resource-delete') as HTMLButtonElement).click();
    await flush();
    expectDom(null);
  });
});
