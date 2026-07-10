/**
 * Safety boundary for experimental OpenCode SDK actions.
 *
 * Experimental endpoints are intentionally not callable from Settings or Chat
 * directly. This coordinator requires the production capability snapshot to
 * be available, an explicit user confirmation, and a non-dry-run request
 * before it delegates the semantic action to its host. It never returns raw
 * SDK data or errors, because those can contain sensitive server details.
 */

export type OpenCodeExperimentalAction =
  | 'pty.create'
  | 'pty.remove'
  | 'project-copy.create'
  | 'control-plane.move-session'
  | 'session.background';

const ACTION_CAPABILITY_IDS: Readonly<Record<OpenCodeExperimentalAction, string>> = {
  'pty.create': 'v2.pty.create',
  'pty.remove': 'v2.pty.create',
  'project-copy.create': 'v2.projectCopy.create',
  'control-plane.move-session': 'experimental.controlPlane.moveSession',
  'session.background': 'experimental.session.background',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function matchesConfirmedTarget(request: OpenCodeExperimentalActionRequest): boolean {
  const confirmation = request.confirmation;
  if (!confirmation || !isRecord(request.input)) {
    return false;
  }

  switch (request.action) {
    case 'pty.create':
      return request.input.command === confirmation.target
        && request.input.cwd === confirmation.scope;
    case 'pty.remove':
      return request.input.ptyID === confirmation.target;
    case 'project-copy.create': {
      const directory = request.input.directory;
      const name = request.input.name;
      const location = request.input.location;
      return typeof directory === 'string'
        && typeof name === 'string'
        && `${directory}/${name}` === confirmation.target
        && isRecord(location)
        && location.directory === confirmation.scope;
    }
    case 'control-plane.move-session': {
      const destination = request.input.destination;
      return isRecord(destination) && destination.directory === confirmation.target;
    }
    case 'session.background':
      return request.input.sessionID === confirmation.target
        && request.input.directory === confirmation.scope;
  }
}

export interface OpenCodeExperimentalActionConfirmation {
  readonly confirmed: boolean;
  readonly scope: string;
  readonly target: string;
  readonly cleanup: 'not-required' | 'remove-created-pty';
}

export interface OpenCodeExperimentalActionRequest {
  readonly action: OpenCodeExperimentalAction;
  readonly capabilityId: string;
  readonly confirmation?: OpenCodeExperimentalActionConfirmation;
  readonly input?: unknown;
  readonly dryRun?: boolean;
}

export type OpenCodeExperimentalActionAvailability =
  | { readonly kind: 'available' }
  | {
      readonly kind:
        | 'disabled-by-user'
        | 'unsupported-by-server'
        | 'unsupported-by-sdk'
        | 'unknown';
    };

export type OpenCodeExperimentalActionExecution =
  | { readonly kind: 'completed'; readonly createdPtyId?: string }
  | { readonly kind: 'cancelled'; readonly createdPtyId?: string }
  | { readonly kind: 'failed'; readonly createdPtyId?: string };

export type OpenCodeExperimentalActionCleanup = {
  readonly action: 'pty.remove';
  readonly outcome: 'completed' | 'failed';
};

export type OpenCodeExperimentalActionResult =
  | { readonly kind: 'completed'; readonly ptyId?: string }
  | {
      readonly kind: 'cancelled';
      readonly reason: 'confirmation-required' | 'dry-run' | 'action-cancelled';
      readonly cleanup?: OpenCodeExperimentalActionCleanup;
    }
  | {
      readonly kind: 'unsupported';
      readonly availability: Exclude<OpenCodeExperimentalActionAvailability['kind'], 'available'>;
      readonly reason: 'capability-unavailable';
    }
  | {
      readonly kind: 'failed';
      readonly reason: 'action-failed';
      readonly cleanup?: OpenCodeExperimentalActionCleanup;
    };

export interface OpenCodeSdkExperimentalActionCoordinatorHost {
  readonly getCapability: (capabilityId: string) => OpenCodeExperimentalActionAvailability;
  readonly actionFacade: {
    execute(request: OpenCodeExperimentalActionRequest): Promise<OpenCodeExperimentalActionExecution>;
    cleanupPty(ptyId: string): Promise<void>;
  };
}

/**
 * Runs state-changing experimental actions only after all product gates pass.
 *
 * A cancellation or failure after PTY creation triggers best-effort cleanup
 * when the confirmed request declared that requirement. Cleanup status is
 * deliberately coarse so neither PTY details nor server error text escape.
 */
export class OpenCodeSdkExperimentalActionCoordinator {
  private readonly ownedPtyIds = new Set<string>();

  constructor(private readonly host: OpenCodeSdkExperimentalActionCoordinatorHost) {}

  async runExperimentalAction(
    request: OpenCodeExperimentalActionRequest,
  ): Promise<OpenCodeExperimentalActionResult> {
    if (ACTION_CAPABILITY_IDS[request.action] !== request.capabilityId) {
      return { kind: 'failed', reason: 'action-failed' };
    }

    const authorizationFailure = this.authorizeAction(request);
    if (authorizationFailure) {
      return authorizationFailure;
    }

    if (!request.confirmation?.confirmed) {
      return { kind: 'cancelled', reason: 'confirmation-required' };
    }

    if (!matchesConfirmedTarget(request)) {
      return { kind: 'failed', reason: 'action-failed' };
    }

    if (request.dryRun) {
      return { kind: 'cancelled', reason: 'dry-run' };
    }

    const execution = await this.executeSafely(request);
    const cleanup = execution.kind === 'completed'
      ? undefined
      : await this.cleanupCreatedPtyIfRequired(request, execution.createdPtyId);

    if (execution.kind === 'completed') {
      if (request.action === 'pty.create' && execution.createdPtyId) {
        this.ownedPtyIds.add(execution.createdPtyId);
        return { kind: 'completed', ptyId: execution.createdPtyId };
      }
      if (request.action === 'pty.remove') {
        this.ownedPtyIds.delete(request.confirmation.target);
      }
      return { kind: 'completed' };
    }

    if (execution.kind === 'cancelled') {
      return cleanup
        ? { kind: 'cancelled', reason: 'action-cancelled', cleanup }
        : { kind: 'cancelled', reason: 'action-cancelled' };
    }

    return cleanup
      ? { kind: 'failed', reason: 'action-failed', cleanup }
      : { kind: 'failed', reason: 'action-failed' };
  }

  private authorizeAction(
    request: OpenCodeExperimentalActionRequest,
  ): OpenCodeExperimentalActionResult | undefined {
    const ownsPty = request.action === 'pty.remove'
      && isRecord(request.input)
      && typeof request.input.ptyID === 'string'
      && this.ownedPtyIds.has(request.input.ptyID);
    if (request.action === 'pty.remove' && !ownsPty) {
      return { kind: 'failed', reason: 'action-failed' };
    }

    const capability = this.host.getCapability(request.capabilityId);
    const canRemoveOwnedPty = ownsPty && capability.kind === 'disabled-by-user';
    if (capability.kind === 'available' || canRemoveOwnedPty) {
      return undefined;
    }

    return {
      kind: 'unsupported',
      availability: capability.kind,
      reason: 'capability-unavailable',
    };
  }

  private async executeSafely(
    request: OpenCodeExperimentalActionRequest,
  ): Promise<OpenCodeExperimentalActionExecution> {
    try {
      return await this.host.actionFacade.execute(request);
    } catch {
      return { kind: 'failed' };
    }
  }

  private async cleanupCreatedPtyIfRequired(
    request: OpenCodeExperimentalActionRequest,
    createdPtyId: string | undefined,
  ): Promise<OpenCodeExperimentalActionCleanup | undefined> {
    if (
      !createdPtyId
      || request.action !== 'pty.create'
      || request.confirmation?.cleanup !== 'remove-created-pty'
    ) {
      return undefined;
    }

    try {
      await this.host.actionFacade.cleanupPty(createdPtyId);
      return { action: 'pty.remove', outcome: 'completed' };
    } catch {
      return { action: 'pty.remove', outcome: 'failed' };
    }
  }
}
