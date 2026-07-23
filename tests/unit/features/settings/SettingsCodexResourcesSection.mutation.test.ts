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

    expect(backend.createCodexProjectSkill).toHaveBeenCalledWith('/vault', 'x');
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

    expect(backend.createCodexProjectAgent).toHaveBeenCalledWith('/vault', 'x');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does NOT invoke onAfterMutation when create fails', async () => {
    backend.createCodexProjectSkill.mockResolvedValueOnce({ ok: false, reason: 'duplicate' });
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
});
