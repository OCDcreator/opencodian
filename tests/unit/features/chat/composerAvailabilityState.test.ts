import { WorkspaceLeaf } from 'obsidian';

jest.mock('../../../../src/core/opencode', () => ({
  OpenCodeService: class OpenCodeService {},
}));

import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { OpenCodianView } from '../../../../src/features/chat/OpenCodianView';

describe('OpenCodianView composer availability state', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses the last resolved offline availability instead of stale running server status', async () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      enabledBackends: ['opencode'],
      activeBackend: 'opencode' as const,
    };
    const openCodeService = {
      checkHealth: jest.fn().mockResolvedValue(false),
      getServerStatus: jest.fn().mockReturnValue('running'),
      isServerProcessRunning: jest.fn().mockReturnValue(false),
    };
    const view = new OpenCodianView(new WorkspaceLeaf(), {
      settings,
      openCodeService,
      storage: {},
    } as never);

    await (view as unknown as { getServerAvailability: () => Promise<string> }).getServerAvailability();

    expect(
      (view as unknown as {
        getComposerAvailabilityState: () => { kind: string };
      }).getComposerAvailabilityState().kind,
    ).toBe('backend-offline');
  });

  it('does not allow server sync while the backend is offline', async () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      enabledBackends: ['opencode'],
      activeBackend: 'opencode' as const,
    };
    const openCodeService = {
      checkHealth: jest.fn().mockResolvedValue(false),
      getServerStatus: jest.fn().mockReturnValue('running'),
      isServerProcessRunning: jest.fn().mockReturnValue(false),
    };
    const view = new OpenCodianView(new WorkspaceLeaf(), {
      settings,
      openCodeService,
      storage: {},
    } as never);

    await expect(
      (view as unknown as { canSyncConversationWithServer: () => Promise<boolean> }).canSyncConversationWithServer(),
    ).resolves.toBe(false);
  });

  it('does not start the conversation session signal runtime when no backend is enabled', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      enabledBackends: [],
      activeBackend: undefined,
    };
    const view = new OpenCodianView(new WorkspaceLeaf(), {
      settings,
      openCodeService: {},
      storage: {},
    } as never);

    expect(
      (view as unknown as { shouldStartConversationSessionSignalRuntime: () => boolean })
        .shouldStartConversationSessionSignalRuntime(),
    ).toBe(false);
  });
});
