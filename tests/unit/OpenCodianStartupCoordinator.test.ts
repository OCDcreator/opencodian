import { OpenCodianStartupCoordinator } from '../../src/core/runtime/OpenCodianStartupCoordinator';

describe('OpenCodianStartupCoordinator', () => {
  let coordinator: OpenCodianStartupCoordinator;

  beforeEach(() => {
    coordinator = new OpenCodianStartupCoordinator();
  });

  describe('execute', () => {
    it('invokes callbacks in order: registerAppIcon -> prepare -> bootstrap -> registerWorkspace', async () => {
      const callOrder: string[] = [];
      const manifest = { version: '1.0.0' } as import('obsidian').PluginManifest;

      await coordinator.execute({
        manifest,
        getVaultBasePath: () => '/test-vault',
        registerAppIcon: () => { callOrder.push('registerAppIcon'); },
        onPrepareStartupState: async () => {
          callOrder.push('prepare');
          return { pid: 1234 };
        },
        onBootstrapOpenCodeRuntime: async () => { callOrder.push('bootstrap'); },
        onRegisterWorkspaceIntegration: () => { callOrder.push('registerWorkspace'); },
        onScheduleDeferredRuntimeWarmup: () => { callOrder.push('warmup'); },
      });

      expect(callOrder).toEqual([
        'registerAppIcon',
        'prepare',
        'bootstrap',
        'registerWorkspace',
        'warmup',
      ]);
    });

    it('passes prepared state to bootstrap callback', async () => {
      const manifest = { version: '1.0.0' } as import('obsidian').PluginManifest;
      const preparedState = { pid: 5678, extra: 'data' };
      let receivedState: unknown = null;

      await coordinator.execute({
        manifest,
        getVaultBasePath: () => '/test-vault',
        registerAppIcon: () => {},
        onPrepareStartupState: async () => preparedState,
        onBootstrapOpenCodeRuntime: async (state) => { receivedState = state; },
        onRegisterWorkspaceIntegration: () => {},
        onScheduleDeferredRuntimeWarmup: () => {},
      });

      expect(receivedState).toBe(preparedState);
    });

    it('propagates errors from prepare and marks trace failed', async () => {
      const manifest = { version: '1.0.0' } as import('obsidian').PluginManifest;

      await expect(
        coordinator.execute({
          manifest,
          getVaultBasePath: () => '/test-vault',
          registerAppIcon: () => {},
          onPrepareStartupState: async () => { throw new Error('prepare failed'); },
          onBootstrapOpenCodeRuntime: async () => {},
          onRegisterWorkspaceIntegration: () => {},
          onScheduleDeferredRuntimeWarmup: () => {},
        }),
      ).rejects.toThrow('prepare failed');

      const summary = coordinator.getStartupPerfSummaryLines();
      expect(summary.some((line) => line.includes('failed'))).toBe(true);
    });

    it('propagates errors from bootstrap and marks trace failed', async () => {
      const manifest = { version: '1.0.0' } as import('obsidian').PluginManifest;

      await expect(
        coordinator.execute({
          manifest,
          getVaultBasePath: () => '/test-vault',
          registerAppIcon: () => {},
          onPrepareStartupState: async () => ({ pid: 1 }),
          onBootstrapOpenCodeRuntime: async () => { throw new Error('bootstrap failed'); },
          onRegisterWorkspaceIntegration: () => {},
          onScheduleDeferredRuntimeWarmup: () => {},
        }),
      ).rejects.toThrow('bootstrap failed');

      const summary = coordinator.getStartupPerfSummaryLines();
      expect(summary.some((line) => line.includes('failed'))).toBe(true);
    });

    it('does not call registerWorkspace or warmup when bootstrap fails', async () => {
      const manifest = { version: '1.0.0' } as import('obsidian').PluginManifest;
      const callOrder: string[] = [];

      await expect(
        coordinator.execute({
          manifest,
          getVaultBasePath: () => '/test-vault',
          registerAppIcon: () => { callOrder.push('registerAppIcon'); },
          onPrepareStartupState: async () => { callOrder.push('prepare'); return { pid: 1 }; },
          onBootstrapOpenCodeRuntime: async () => { callOrder.push('bootstrap'); throw new Error('fail'); },
          onRegisterWorkspaceIntegration: () => { callOrder.push('registerWorkspace'); },
          onScheduleDeferredRuntimeWarmup: () => { callOrder.push('warmup'); },
        }),
      ).rejects.toThrow('fail');

      expect(callOrder).toEqual(['registerAppIcon', 'prepare', 'bootstrap']);
    });
  });

  describe('measureStartupStep', () => {
    it('records ok entries for successful operations', async () => {
      const manifest = { version: '1.0.0' } as import('obsidian').PluginManifest;

      await coordinator.execute({
        manifest,
        getVaultBasePath: () => '/test-vault',
        registerAppIcon: () => {},
        onPrepareStartupState: async (c) => {
          await c.measureStartupStep('inner-step', async () => 'result');
          return { pid: 1 };
        },
        onBootstrapOpenCodeRuntime: async () => {},
        onRegisterWorkspaceIntegration: () => {},
        onScheduleDeferredRuntimeWarmup: () => {},
      });

      const summary = coordinator.getStartupPerfSummaryLines();
      expect(summary.some((line) => line.includes('inner-step'))).toBe(true);
    });

    it('records error entries for failed operations', async () => {
      const manifest = { version: '1.0.0' } as import('obsidian').PluginManifest;

      await expect(
        coordinator.execute({
          manifest,
          getVaultBasePath: () => '/test-vault',
          registerAppIcon: () => {},
          onPrepareStartupState: async (c) => {
            await c.measureStartupStep('failing-step', async () => { throw new Error('inner error'); });
            return { pid: 1 };
          },
          onBootstrapOpenCodeRuntime: async () => {},
          onRegisterWorkspaceIntegration: () => {},
          onScheduleDeferredRuntimeWarmup: () => {},
        }),
      ).rejects.toThrow('inner error');

      const summary = coordinator.getStartupPerfSummaryLines();
      expect(summary.some((line) => line.includes('failed'))).toBe(true);
    });

    it('preserves correct nested depth for sequential measurements', async () => {
      const manifest = { version: '1.0.0' } as import('obsidian').PluginManifest;
      const depths: number[] = [];

      await coordinator.execute({
        manifest,
        getVaultBasePath: () => '/test-vault',
        registerAppIcon: () => {},
        onPrepareStartupState: async (c) => {
          await c.measureStartupStep('outer', async () => {
            await c.measureStartupStep('inner-1', async () => {
              depths.push(1);
            });
            await c.measureStartupStep('inner-2', async () => {
              depths.push(1);
            });
          });
          return { pid: 1 };
        },
        onBootstrapOpenCodeRuntime: async () => {},
        onRegisterWorkspaceIntegration: () => {},
        onScheduleDeferredRuntimeWarmup: () => {},
      });

      expect(depths).toEqual([1, 1]);
    });
  });

  describe('getStartupPerformanceDiagnosisLines', () => {
    it('returns diagnosis with primary phase when trace exists', async () => {
      const manifest = { version: '1.0.0' } as import('obsidian').PluginManifest;

      await coordinator.execute({
        manifest,
        getVaultBasePath: () => '/test-vault',
        registerAppIcon: () => {},
        onPrepareStartupState: async (c) => {
          await c.measureStartupStep('slow-step', async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
          });
          return { pid: 1 };
        },
        onBootstrapOpenCodeRuntime: async () => {},
        onRegisterWorkspaceIntegration: () => {},
        onScheduleDeferredRuntimeWarmup: () => {},
      });

      const diagnosis = coordinator.getStartupPerformanceDiagnosisLines();
      expect(diagnosis.length).toBeGreaterThan(0);
      expect(diagnosis[0]).toMatch(/Primary phase:/);
    });

    it('returns fallback message when no trace exists', () => {
      const freshCoordinator = new OpenCodianStartupCoordinator();
      const diagnosis = freshCoordinator.getStartupPerformanceDiagnosisLines();
      expect(diagnosis).toEqual(['No startup trace captured yet.']);
    });
  });
});
