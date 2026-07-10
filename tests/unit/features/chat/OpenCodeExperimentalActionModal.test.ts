import type { OpenCodeExperimentalActionRequest } from '../../../../src/core/opencode/OpenCodeSdkExperimentalActionCoordinator';
import { OpenCodeExperimentalActionModal } from '../../../../src/features/chat/ui/OpenCodeExperimentalActionModal';

describe('OpenCodeExperimentalActionModal', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not execute an available PTY action until its command and confirmation are supplied', async () => {
    const runAction = jest.fn<Promise<{ kind: 'completed' }>, [OpenCodeExperimentalActionRequest]>()
      .mockResolvedValue({ kind: 'completed' });
    const modal = new OpenCodeExperimentalActionModal({} as never, {
      sessionId: 'session-1',
      defaultDirectory: '/vault',
      availableActions: new Set(['pty.create']),
      runAction,
    });
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);

    modal.onOpen();
    const ptyButton = modal.contentEl.querySelector<HTMLButtonElement>('[data-action="pty.create"]');
    const commandInput = modal.contentEl.querySelector<HTMLInputElement>('[data-experimental-input="pty-command"]');
    const ptyScope = modal.contentEl.querySelector<HTMLElement>('[data-experimental-scope="pty"]');
    expect(ptyButton).not.toBeNull();
    expect(modal.contentEl.querySelector('[data-action="session.background"]')).toBeNull();
    expect(ptyScope?.textContent).toContain('/vault');

    ptyButton?.click();
    expect(runAction).not.toHaveBeenCalled();

    if (!commandInput || !ptyButton) {
      throw new Error('Expected PTY controls');
    }
    commandInput.value = 'echo';
    ptyButton.click();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(runAction).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    ptyButton.click();
    await Promise.resolve();

    expect(runAction).toHaveBeenCalledWith({
      action: 'pty.create',
      capabilityId: 'v2.pty.create',
      confirmation: {
        confirmed: true,
        scope: '/vault',
        target: 'echo',
        cleanup: 'remove-created-pty',
      },
      input: { command: 'echo', cwd: '/vault' },
    });
  });

  it('shows a project-copy preview and sends only the confirmed copy parameters', async () => {
    const runAction = jest.fn<Promise<{ kind: 'completed' }>, [OpenCodeExperimentalActionRequest]>()
      .mockResolvedValue({ kind: 'completed' });
    const modal = new OpenCodeExperimentalActionModal({} as never, {
      sessionId: 'session-1',
      defaultDirectory: '/vault',
      projectId: 'project-1',
      availableActions: new Set(['project-copy.create']),
      runAction,
    });
    jest.spyOn(window, 'confirm').mockReturnValue(true);

    modal.onOpen();
    const projectIdInput = modal.contentEl.querySelector<HTMLInputElement>('[data-experimental-input="project-copy-project-id"]');
    const directoryInput = modal.contentEl.querySelector<HTMLInputElement>('[data-experimental-input="project-copy-directory"]');
    const nameInput = modal.contentEl.querySelector<HTMLInputElement>('[data-experimental-input="project-copy-name"]');
    const copyButton = modal.contentEl.querySelector<HTMLButtonElement>('[data-action="project-copy.create"]');
    expect(modal.contentEl.querySelector('[data-experimental-preview="project-copy"]')).not.toBeNull();
    expect(projectIdInput).not.toBeNull();
    expect(directoryInput).not.toBeNull();
    expect(nameInput).not.toBeNull();
    expect(copyButton).not.toBeNull();

    if (!projectIdInput || !directoryInput || !nameInput || !copyButton) {
      throw new Error('Expected project-copy controls');
    }
    projectIdInput.value = 'project-1';
    directoryInput.value = '/copies';
    nameInput.value = 'sdk-smoke';
    copyButton.click();
    await Promise.resolve();

    expect(runAction).toHaveBeenCalledWith({
      action: 'project-copy.create',
      capabilityId: 'v2.projectCopy.create',
      confirmation: {
        confirmed: true,
        scope: '/vault',
        target: '/copies/sdk-smoke',
        cleanup: 'not-required',
      },
      input: {
        projectID: 'project-1',
        location: { directory: '/vault' },
        strategy: 'git_worktree',
        directory: '/copies',
        name: 'sdk-smoke',
      },
    });
  });

  it('encodes a control-plane destination in the upstream request shape', async () => {
    const runAction = jest.fn<Promise<{ kind: 'completed' }>, [OpenCodeExperimentalActionRequest]>()
      .mockResolvedValue({ kind: 'completed' });
    const modal = new OpenCodeExperimentalActionModal({} as never, {
      sessionId: 'session-1',
      defaultDirectory: '/vault',
      availableActions: new Set(['control-plane.move-session']),
      runAction,
    });
    jest.spyOn(window, 'confirm').mockReturnValue(true);

    modal.onOpen();
    const destinationInput = modal.contentEl.querySelector<HTMLInputElement>('[data-experimental-input="control-plane-destination"]');
    const moveButton = modal.contentEl.querySelector<HTMLButtonElement>('[data-action="control-plane.move-session"]');
    if (!destinationInput || !moveButton) {
      throw new Error('Expected control-plane controls');
    }
    destinationInput.value = '/other-vault';
    moveButton.click();
    await Promise.resolve();

    expect(runAction).toHaveBeenCalledWith({
      action: 'control-plane.move-session',
      capabilityId: 'experimental.controlPlane.moveSession',
      confirmation: {
        confirmed: true,
        scope: '/vault',
        target: '/other-vault',
        cleanup: 'not-required',
      },
      input: {
        sessionID: 'session-1',
        destination: { directory: '/other-vault' },
        moveChanges: false,
      },
    });
  });

  it('keeps a completed background action on the existing inline-status path', async () => {
    const runAction = jest.fn<Promise<{ kind: 'completed' }>, [OpenCodeExperimentalActionRequest]>()
      .mockResolvedValue({ kind: 'completed' });
    const onBackgroundActionCompleted = jest.fn();
    const modal = new OpenCodeExperimentalActionModal({} as never, {
      sessionId: 'session-1',
      defaultDirectory: '/vault',
      availableActions: new Set(['session.background']),
      runAction,
      onBackgroundActionCompleted,
    });
    jest.spyOn(window, 'confirm').mockReturnValue(true);

    modal.onOpen();
    modal.contentEl.querySelector<HTMLButtonElement>('[data-action="session.background"]')?.click();
    await Promise.resolve();

    expect(runAction).toHaveBeenCalledWith({
      action: 'session.background',
      capabilityId: 'experimental.session.background',
      confirmation: {
        confirmed: true,
        scope: '/vault',
        target: 'session-1',
        cleanup: 'not-required',
      },
      input: { sessionID: 'session-1', directory: '/vault' },
    });
    expect(onBackgroundActionCompleted).toHaveBeenCalledTimes(1);
  });

  it('removes a created PTY when its owner modal closes', async () => {
    const runAction = jest.fn<Promise<{ kind: 'completed'; ptyId?: string }>, [OpenCodeExperimentalActionRequest]>()
      .mockResolvedValueOnce({ kind: 'completed', ptyId: 'pty-42' })
      .mockResolvedValueOnce({ kind: 'completed' });
    const modal = new OpenCodeExperimentalActionModal({} as never, {
      sessionId: 'session-1',
      defaultDirectory: '/vault',
      availableActions: new Set(['pty.create']),
      runAction,
    });
    jest.spyOn(window, 'confirm').mockReturnValue(true);

    modal.onOpen();
    const commandInput = modal.contentEl.querySelector<HTMLInputElement>('[data-experimental-input="pty-command"]');
    const createButton = modal.contentEl.querySelector<HTMLButtonElement>('[data-action="pty.create"]');
    if (!commandInput || !createButton) {
      throw new Error('Expected PTY controls');
    }
    commandInput.value = 'echo';
    createButton.click();
    await Promise.resolve();
    modal.onClose();
    await Promise.resolve();

    expect(runAction).toHaveBeenLastCalledWith({
      action: 'pty.remove',
      capabilityId: 'v2.pty.create',
      confirmation: {
        confirmed: true,
        scope: '/vault',
        target: 'pty-42',
        cleanup: 'not-required',
      },
      input: { ptyID: 'pty-42' },
    });
  });

});

describe('OpenCodeExperimentalActionModal PTY ownership', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not create a second PTY while the modal owns an active PTY', async () => {
    const runAction = jest.fn<Promise<{ kind: 'completed'; ptyId?: string }>, [OpenCodeExperimentalActionRequest]>()
      .mockResolvedValue({ kind: 'completed', ptyId: 'pty-42' });
    const modal = new OpenCodeExperimentalActionModal({} as never, {
      sessionId: 'session-1',
      defaultDirectory: '/vault',
      availableActions: new Set(['pty.create']),
      runAction,
    });
    jest.spyOn(window, 'confirm').mockReturnValue(true);

    modal.onOpen();
    const commandInput = modal.contentEl.querySelector<HTMLInputElement>('[data-experimental-input="pty-command"]');
    const createButton = modal.contentEl.querySelector<HTMLButtonElement>('[data-action="pty.create"]');
    if (!commandInput || !createButton) {
      throw new Error('Expected PTY controls');
    }
    commandInput.value = 'echo';
    createButton.click();
    await Promise.resolve();
    createButton.click();
    await Promise.resolve();

    expect(runAction).toHaveBeenCalledTimes(1);
    expect(createButton.disabled).toBe(true);
  });
});
