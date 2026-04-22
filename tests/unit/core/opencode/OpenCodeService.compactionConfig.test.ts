import { SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS } from '../../../../src/core/opencode/sdkFeatureFlags';
import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import {
  createOpenCodeServiceTestContext,
  mockCreateSdkClient,
  mockRequestUrl,
  OpenCodeService,
} from './OpenCodeService.testSupport';

describe('OpenCodeService compaction config', () => {
  it('applies compaction config through backend config.update and preserves adjacent fields', async () => {
    const { service, mockSdkClient } = createOpenCodeServiceTestContext();
    const scopedService = new OpenCodeService(DEFAULT_SETTINGS, {}, {
      sdkFeatureFlags: SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS,
    });
    scopedService.setVaultPath('C:\\vault');
    mockSdkClient.config.get
      .mockResolvedValueOnce({
        model: 'openai/gpt-5',
        compaction: {
          prune: false,
          tail_turns: 3,
        },
      })
      .mockResolvedValueOnce({
        model: 'openai/gpt-5',
        compaction: {
          prune: false,
          tail_turns: 3,
          auto: false,
          reserved: 16_000,
        },
      });
    mockSdkClient.config.update.mockResolvedValue({
      model: 'openai/gpt-5',
      compaction: {
        prune: false,
        tail_turns: 3,
        auto: false,
        reserved: 16_000,
      },
    });

    const result = await scopedService.applyCompactionConfig({
      auto: false,
      reserved: 16_000,
    });

    expect(result.status).toBe('applied');
    expect(mockSdkClient.config.get).toHaveBeenCalledTimes(2);
    expect(mockSdkClient.config.update).toHaveBeenCalledWith({
      config: {
        compaction: {
          prune: false,
          tail_turns: 3,
          auto: false,
          reserved: 16_000,
        },
      },
    });
    expect(mockCreateSdkClient).toHaveBeenCalledWith(expect.objectContaining({
      baseUrl: 'http://127.0.0.1:4196',
      directory: 'C:/vault',
    }));
    expect(mockRequestUrl).not.toHaveBeenCalled();
    expect(service).toBeDefined();
  });

  it('reports deferred when backend config.update does not affect the resolved scoped config', async () => {
    const { mockSdkClient } = createOpenCodeServiceTestContext();
    const service = new OpenCodeService(DEFAULT_SETTINGS, {}, {
      sdkFeatureFlags: SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS,
    });
    service.setVaultPath('C:\\vault');
    mockSdkClient.config.get
      .mockResolvedValueOnce({
        model: 'openai/gpt-5',
      })
      .mockResolvedValueOnce({
        model: 'openai/gpt-5',
      });
    mockSdkClient.config.update.mockResolvedValue({
      compaction: {
        auto: true,
        reserved: 12_000,
      },
    });

    const result = await service.applyCompactionConfig({
      auto: true,
      reserved: 12_000,
    });

    expect(result).toMatchObject({
      status: 'deferred',
      reason: expect.stringContaining('resolved config'),
    });
    expect(mockSdkClient.config.get).toHaveBeenCalledTimes(2);
    expect(mockSdkClient.config.update).toHaveBeenCalledWith({
      config: {
        compaction: {
          auto: true,
          reserved: 12_000,
        },
      },
    });
  });

  it('reports deferred compaction apply when backend config update is unavailable', async () => {
    const service = new OpenCodeService(DEFAULT_SETTINGS, {}, {
      sdkFeatureFlags: { sdkCrud: false },
    });
    service.setVaultPath('C:\\vault');
    mockRequestUrl.mockRejectedValue(new Error('backend unavailable'));

    const result = await service.applyCompactionConfig({
      auto: true,
      reserved: 12_000,
    });

    expect(result).toMatchObject({
      status: 'deferred',
      reason: 'backend unavailable',
    });
  });

  it('disposes the scoped instance and verifies the project config readback in merge mode', async () => {
    const { mockSdkClient } = createOpenCodeServiceTestContext();
    const service = new OpenCodeService(DEFAULT_SETTINGS, {}, {
      sdkFeatureFlags: SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS,
    });
    service.setVaultPath('C:\\vault');
    mockSdkClient.instance.dispose.mockResolvedValue(true);
    mockSdkClient.config.get.mockResolvedValue({
      compaction: {
        auto: false,
        reserved: 16_000,
      },
    });

    const result = await service.reapplyCompactionConfigFromProjectConfig({
      auto: false,
      reserved: 16_000,
    });

    expect(result).toEqual({ status: 'applied' });
    expect(mockSdkClient.instance.dispose).toHaveBeenCalledTimes(1);
    expect(mockSdkClient.config.get).toHaveBeenCalledTimes(1);
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
});
