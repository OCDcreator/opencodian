import { existsSync } from 'fs';
import { resolve } from 'path';

type CapabilityAvailability =
  | { readonly kind: 'available' }
  | {
      readonly kind:
        | 'disabled-by-user'
        | 'unsupported-by-server'
        | 'unsupported-by-sdk'
        | 'unknown';
    };

type ExperimentalAction =
  | 'pty.create'
  | 'project-copy.create'
  | 'control-plane.move-session'
  | 'session.background';

interface ExperimentalActionRequest {
  readonly action: ExperimentalAction;
  readonly capabilityId: string;
  readonly confirmation?: {
    readonly confirmed: boolean;
    readonly scope: string;
    readonly target: string;
    readonly cleanup: 'not-required' | 'remove-created-pty';
  };
  readonly input?: unknown;
  readonly dryRun?: boolean;
}

interface ExperimentalActionFacade {
  execute(request: ExperimentalActionRequest): Promise<{
    readonly kind: 'completed' | 'cancelled' | 'failed';
    readonly createdPtyId?: string;
  }>;
  cleanupPty(ptyId: string): Promise<void>;
}

interface ExperimentalActionCoordinator {
  runExperimentalAction(request: ExperimentalActionRequest): Promise<{
    readonly kind: 'completed' | 'cancelled' | 'unsupported' | 'failed';
    readonly reason?: string;
    readonly availability?: string;
    readonly cleanup?: {
      readonly action: 'pty.remove';
      readonly outcome: 'completed' | 'failed';
    };
  }>;
}

interface ExperimentalActionCoordinatorConstructor {
  new (host: {
    readonly getCapability: (capabilityId: string) => CapabilityAvailability;
    readonly actionFacade: ExperimentalActionFacade;
  }): ExperimentalActionCoordinator;
}

interface ExperimentalActionCoordinatorModule {
  readonly OpenCodeSdkExperimentalActionCoordinator: ExperimentalActionCoordinatorConstructor;
}

const coordinatorModulePath = resolve(
  __dirname,
  '../../../../src/core/opencode/OpenCodeSdkExperimentalActionCoordinator',
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isCoordinatorModule(value: unknown): value is ExperimentalActionCoordinatorModule {
  return isRecord(value) && typeof value.OpenCodeSdkExperimentalActionCoordinator === 'function';
}

function loadCoordinatorModule(): ExperimentalActionCoordinatorModule | undefined {
  if (!existsSync(`${coordinatorModulePath}.ts`)) {
    return undefined;
  }

  const moduleValue: unknown = jest.requireActual(coordinatorModulePath);
  return isCoordinatorModule(moduleValue) ? moduleValue : undefined;
}

function confirmedRequest(overrides: Partial<ExperimentalActionRequest> = {}): ExperimentalActionRequest {
  return {
    action: 'pty.create',
    capabilityId: 'v2.pty.create',
    confirmation: {
      confirmed: true,
      scope: 'test vault',
      target: 'echo smoke-test',
      cleanup: 'remove-created-pty',
    },
    input: { command: 'echo smoke-test', cwd: 'test vault' },
    ...overrides,
  };
}

function createHost(
  availability: CapabilityAvailability,
  execution: { readonly kind: 'completed' | 'cancelled' | 'failed'; readonly createdPtyId?: string },
): {
  readonly getCapability: jest.Mock<CapabilityAvailability, [string]>;
  readonly actionFacade: {
    readonly execute: jest.Mock<Promise<typeof execution>, [ExperimentalActionRequest]>;
    readonly cleanupPty: jest.Mock<Promise<void>, [string]>;
  };
} {
  return {
    getCapability: jest.fn(() => availability),
    actionFacade: {
      execute: jest.fn().mockResolvedValue(execution),
      cleanupPty: jest.fn().mockResolvedValue(undefined),
    },
  };
}

describe('OpenCodeSdkExperimentalActionCoordinator', () => {
  it('does not invoke a PTY action when its experimental gate is disabled', async () => {
    const coordinatorModule = loadCoordinatorModule();
    expect(coordinatorModule).toBeDefined();
    if (!coordinatorModule) {
      return;
    }

    const host = createHost({ kind: 'disabled-by-user' }, { kind: 'completed' });
    const coordinator = new coordinatorModule.OpenCodeSdkExperimentalActionCoordinator(host);

    await expect(coordinator.runExperimentalAction(confirmedRequest())).resolves.toEqual({
      kind: 'unsupported',
      availability: 'disabled-by-user',
      reason: 'capability-unavailable',
    });
    expect(host.actionFacade.execute).not.toHaveBeenCalled();
  });

  it('does not invoke a control-plane action when the server does not support it', async () => {
    const coordinatorModule = loadCoordinatorModule();
    expect(coordinatorModule).toBeDefined();
    if (!coordinatorModule) {
      return;
    }

    const host = createHost({ kind: 'unsupported-by-server' }, { kind: 'completed' });
    const coordinator = new coordinatorModule.OpenCodeSdkExperimentalActionCoordinator(host);

    await expect(coordinator.runExperimentalAction(confirmedRequest({
      action: 'control-plane.move-session',
      capabilityId: 'experimental.controlPlane.moveSession',
    }))).resolves.toEqual({
      kind: 'unsupported',
      availability: 'unsupported-by-server',
      reason: 'capability-unavailable',
    });
    expect(host.actionFacade.execute).not.toHaveBeenCalled();
  });

  it('requires explicit confirmation before invoking a project-copy action', async () => {
    const coordinatorModule = loadCoordinatorModule();
    expect(coordinatorModule).toBeDefined();
    if (!coordinatorModule) {
      return;
    }

    const host = createHost({ kind: 'available' }, { kind: 'completed' });
    const coordinator = new coordinatorModule.OpenCodeSdkExperimentalActionCoordinator(host);

    await expect(coordinator.runExperimentalAction(confirmedRequest({
      action: 'project-copy.create',
      capabilityId: 'v2.projectCopy.create',
      confirmation: undefined,
    }))).resolves.toEqual({
      kind: 'cancelled',
      reason: 'confirmation-required',
    });
    expect(host.actionFacade.execute).not.toHaveBeenCalled();
  });

  it('does not allow one enabled capability to authorize a different action', async () => {
    const coordinatorModule = loadCoordinatorModule();
    expect(coordinatorModule).toBeDefined();
    if (!coordinatorModule) {
      return;
    }

    const host = createHost({ kind: 'available' }, { kind: 'completed' });
    const coordinator = new coordinatorModule.OpenCodeSdkExperimentalActionCoordinator(host);

    await expect(coordinator.runExperimentalAction(confirmedRequest({
      action: 'project-copy.create',
      capabilityId: 'v2.pty.create',
    }))).resolves.toEqual({ kind: 'failed', reason: 'action-failed' });
    expect(host.actionFacade.execute).not.toHaveBeenCalled();
  });

  it('does not make deferred v2 session creation executable through the experimental coordinator', async () => {
    const coordinatorModule = loadCoordinatorModule();
    expect(coordinatorModule).toBeDefined();
    if (!coordinatorModule) {
      return;
    }

    const host = createHost({ kind: 'available' }, { kind: 'completed' });
    const coordinator = new coordinatorModule.OpenCodeSdkExperimentalActionCoordinator(host);

    await expect(coordinator.runExperimentalAction({
      action: 'session.create' as never,
      capabilityId: 'v2.session.create',
      confirmation: {
        confirmed: true,
        scope: 'test vault',
        target: 'new-session',
        cleanup: 'not-required',
      },
      input: { title: 'new-session' },
    })).resolves.toEqual({ kind: 'failed', reason: 'action-failed' });
    expect(host.actionFacade.execute).not.toHaveBeenCalled();
  });

  it('does not execute a confirmed PTY action when its command differs from the confirmed target', async () => {
    const coordinatorModule = loadCoordinatorModule();
    expect(coordinatorModule).toBeDefined();
    if (!coordinatorModule) {
      return;
    }

    const host = createHost({ kind: 'available' }, { kind: 'completed' });
    const coordinator = new coordinatorModule.OpenCodeSdkExperimentalActionCoordinator(host);

    await expect(coordinator.runExperimentalAction(confirmedRequest({
      input: { command: 'echo different', cwd: 'test vault' },
    }))).resolves.toEqual({ kind: 'failed', reason: 'action-failed' });
    expect(host.actionFacade.execute).not.toHaveBeenCalled();
  });

});

describe('OpenCodeSdkExperimentalActionCoordinator scope and PTY ownership', () => {
  it('does not execute a project copy when its source location differs from the confirmed scope', async () => {
    const coordinatorModule = loadCoordinatorModule();
    expect(coordinatorModule).toBeDefined();
    if (!coordinatorModule) {
      return;
    }

    const host = createHost({ kind: 'available' }, { kind: 'completed' });
    const coordinator = new coordinatorModule.OpenCodeSdkExperimentalActionCoordinator(host);

    await expect(coordinator.runExperimentalAction(confirmedRequest({
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
        location: { directory: '/other-vault' },
        strategy: 'git_worktree',
        directory: '/copies',
        name: 'sdk-smoke',
      },
    }))).resolves.toEqual({ kind: 'failed', reason: 'action-failed' });
    expect(host.actionFacade.execute).not.toHaveBeenCalled();
  });

  it('performs no action for a confirmed background dry run', async () => {
    const coordinatorModule = loadCoordinatorModule();
    expect(coordinatorModule).toBeDefined();
    if (!coordinatorModule) {
      return;
    }

    const host = createHost({ kind: 'available' }, { kind: 'completed' });
    const coordinator = new coordinatorModule.OpenCodeSdkExperimentalActionCoordinator(host);

    await expect(coordinator.runExperimentalAction(confirmedRequest({
      action: 'session.background',
      capabilityId: 'experimental.session.background',
      confirmation: {
        confirmed: true,
        scope: 'test vault',
        target: 'session-1',
        cleanup: 'not-required',
      },
      input: { sessionID: 'session-1', directory: 'test vault' },
      dryRun: true,
    }))).resolves.toEqual({
      kind: 'cancelled',
      reason: 'dry-run',
    });
    expect(host.actionFacade.execute).not.toHaveBeenCalled();
  });

  it('runs a confirmed available action without returning raw action data', async () => {
    const coordinatorModule = loadCoordinatorModule();
    expect(coordinatorModule).toBeDefined();
    if (!coordinatorModule) {
      return;
    }

    const host = createHost({ kind: 'available' }, { kind: 'completed' });
    const coordinator = new coordinatorModule.OpenCodeSdkExperimentalActionCoordinator(host);

    await expect(coordinator.runExperimentalAction(confirmedRequest({
      action: 'session.background',
      capabilityId: 'experimental.session.background',
      confirmation: {
        confirmed: true,
        scope: 'test vault',
        target: 'session-1',
        cleanup: 'not-required',
      },
      input: { sessionID: 'session-1', directory: 'test vault' },
    }))).resolves.toEqual({ kind: 'completed' });
    expect(host.actionFacade.execute).toHaveBeenCalledWith(expect.objectContaining({
      action: 'session.background',
      capabilityId: 'experimental.session.background',
    }));
  });

  it('keeps a successfully created PTY available for the explicit remove action', async () => {
    const coordinatorModule = loadCoordinatorModule();
    expect(coordinatorModule).toBeDefined();
    if (!coordinatorModule) {
      return;
    }

    const host = createHost({ kind: 'available' }, { kind: 'completed', createdPtyId: 'pty-42' });
    const coordinator = new coordinatorModule.OpenCodeSdkExperimentalActionCoordinator(host);

    await expect(coordinator.runExperimentalAction(confirmedRequest())).resolves.toEqual({
      kind: 'completed',
      ptyId: 'pty-42',
    });
    expect(host.actionFacade.cleanupPty).not.toHaveBeenCalled();
  });

  it('allows a previously created PTY to be removed after its create gate is disabled', async () => {
    const coordinatorModule = loadCoordinatorModule();
    expect(coordinatorModule).toBeDefined();
    if (!coordinatorModule) {
      return;
    }

    const host = createHost({ kind: 'available' }, { kind: 'completed', createdPtyId: 'pty-42' });
    const coordinator = new coordinatorModule.OpenCodeSdkExperimentalActionCoordinator(host);

    await expect(coordinator.runExperimentalAction(confirmedRequest())).resolves.toEqual({
      kind: 'completed',
      ptyId: 'pty-42',
    });
    host.getCapability.mockReturnValue({ kind: 'disabled-by-user' });

    await expect(coordinator.runExperimentalAction(confirmedRequest({
      action: 'pty.remove',
      capabilityId: 'v2.pty.create',
      confirmation: {
        confirmed: true,
        scope: 'test vault',
        target: 'pty-42',
        cleanup: 'not-required',
      },
      input: { ptyID: 'pty-42' },
    }))).resolves.toEqual({ kind: 'completed' });
    expect(host.actionFacade.execute).toHaveBeenCalledTimes(2);
  });

  it('does not remove a PTY that the coordinator did not create', async () => {
    const coordinatorModule = loadCoordinatorModule();
    expect(coordinatorModule).toBeDefined();
    if (!coordinatorModule) {
      return;
    }

    const host = createHost({ kind: 'available' }, { kind: 'completed' });
    const coordinator = new coordinatorModule.OpenCodeSdkExperimentalActionCoordinator(host);

    await expect(coordinator.runExperimentalAction(confirmedRequest({
      action: 'pty.remove',
      capabilityId: 'v2.pty.create',
      confirmation: {
        confirmed: true,
        scope: 'test vault',
        target: 'pty-42',
        cleanup: 'not-required',
      },
      input: { ptyID: 'pty-42' },
    }))).resolves.toEqual({ kind: 'failed', reason: 'action-failed' });
    expect(host.actionFacade.execute).not.toHaveBeenCalled();
  });

  it('removes a PTY when its post-create action is cancelled', async () => {
    const coordinatorModule = loadCoordinatorModule();
    expect(coordinatorModule).toBeDefined();
    if (!coordinatorModule) {
      return;
    }

    const host = createHost({ kind: 'available' }, { kind: 'cancelled', createdPtyId: 'pty-42' });
    const coordinator = new coordinatorModule.OpenCodeSdkExperimentalActionCoordinator(host);

    await expect(coordinator.runExperimentalAction(confirmedRequest())).resolves.toEqual({
      kind: 'cancelled',
      reason: 'action-cancelled',
      cleanup: { action: 'pty.remove', outcome: 'completed' },
    });
    expect(host.actionFacade.cleanupPty).toHaveBeenCalledWith('pty-42');
  });

  it('records a redacted cleanup failure when a created PTY action fails', async () => {
    const coordinatorModule = loadCoordinatorModule();
    expect(coordinatorModule).toBeDefined();
    if (!coordinatorModule) {
      return;
    }

    const host = createHost({ kind: 'available' }, { kind: 'failed', createdPtyId: 'pty-42' });
    host.actionFacade.cleanupPty.mockRejectedValue(new Error('token=secret-value'));
    const coordinator = new coordinatorModule.OpenCodeSdkExperimentalActionCoordinator(host);

    const result = await coordinator.runExperimentalAction(confirmedRequest());

    expect(result).toEqual({
      kind: 'failed',
      reason: 'action-failed',
      cleanup: { action: 'pty.remove', outcome: 'failed' },
    });
    expect(JSON.stringify(result)).not.toContain('secret-value');
  });
});
