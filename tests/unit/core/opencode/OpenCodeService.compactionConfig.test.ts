import { SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS } from '../../../../src/core/opencode/sdkFeatureFlags';
import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import {
  createOpenCodeServiceTestContext,
  OpenCodeService,
} from './OpenCodeService.testSupport';

describe('OpenCodeService compaction config', () => {
  it('reloads scoped backend state from project compaction config without calling config.update', async () => {
    const { mockSdkClient } = createOpenCodeServiceTestContext();
    const service = new OpenCodeService(DEFAULT_SETTINGS, {}, {
      sdkFeatureFlags: SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS,
    });
    service.setVaultPath('C:\\vault');
    mockSdkClient.instance.dispose.mockResolvedValue(true);
    mockSdkClient.config.get.mockResolvedValue({
      compaction: {
        auto: false,
        prune: true,
        tail_turns: 3,
        reserved: 16_000,
      },
    });

    const result = await service.reapplyCompactionConfigFromProjectConfig({
      auto: false,
      prune: true,
      tail_turns: 3,
      reserved: 16_000,
    });

    expect(result).toEqual({ status: 'applied' });
    expect(mockSdkClient.instance.dispose).toHaveBeenCalledTimes(1);
    expect(mockSdkClient.config.update).not.toHaveBeenCalled();
    expect(service).toBeDefined();
  });

  it('reports deferred when project config reload does not affect the resolved config', async () => {
    const { mockSdkClient } = createOpenCodeServiceTestContext();
    const service = new OpenCodeService(DEFAULT_SETTINGS, {}, {
      sdkFeatureFlags: SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS,
    });
    service.setVaultPath('C:\\vault');
    mockSdkClient.instance.dispose.mockResolvedValue(true);
    mockSdkClient.config.get.mockResolvedValue({
      compaction: {
        auto: true,
        reserved: 12_000,
      },
    });

    const result = await service.reapplyCompactionConfigFromProjectConfig({
      auto: false,
      reserved: 16_000,
    });

    expect(result).toMatchObject({
      status: 'deferred',
      reason: expect.stringContaining('resolved config'),
    });
  });

  it('reports deferred when project config is disabled by server model-source mode', async () => {
    const { mockSdkClient } = createOpenCodeServiceTestContext();
    const service = new OpenCodeService({
      ...DEFAULT_SETTINGS,
      modelSourceMode: 'server',
    }, {}, {
      sdkFeatureFlags: SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS,
    });
    service.setVaultPath('C:\\vault');

    const result = await service.reapplyCompactionConfigFromProjectConfig({
      auto: true,
      reserved: 10_000,
    });

    expect(result).toMatchObject({
      status: 'deferred',
      reason: expect.stringContaining('modelSourceMode'),
    });
    expect(mockSdkClient.instance.dispose).not.toHaveBeenCalled();
  });

  it('reports deferred when vault directory scope is unavailable', async () => {
    const { mockSdkClient } = createOpenCodeServiceTestContext();
    const service = new OpenCodeService(DEFAULT_SETTINGS, {}, {
      sdkFeatureFlags: SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS,
    });

    const result = await service.reapplyCompactionConfigFromProjectConfig({
      auto: false,
      reserved: 16_000,
    });

    expect(result).toMatchObject({
      status: 'deferred',
      reason: expect.stringContaining('scope'),
    });
    expect(mockSdkClient.instance.dispose).not.toHaveBeenCalled();
  });
});
