import type { WorkspaceLeaf } from 'obsidian';

import {
  createLogger,
  setDebugLoggingEnabled,
  setDebugModuleSettings,
  setDebugRefreshIntervalMs,
  setInlineSerializedDebugLogArgsEnabled,
} from '../../shared';
import { OpencodeConfigManager } from '../config';
import type { OpenCodeService } from '../opencode';
import type { StorageService } from '../storage';
import { splitPersistedSettings } from '../storage';
import { getThemeAppearanceOverridesFromBase, getThemePresetDefinition } from '../theme';
import type {
  ChatAppearanceSettings,
  OpenCodianSettings,
  ThemePresetDefinition,
  ThemePresetId,
} from '../types';
import {
  getDefaultChatAppearanceSettings,
  normalizeChatAppearanceSettings,
} from '../types';

const logger = createLogger('SettingsRuntimeCoordinator');

export interface OpenCodianSettingsRuntimeCoordinatorHost {
  getSettings(): OpenCodianSettings;
  setSettings(settings: OpenCodianSettings): void;
  getOpenCodeService(): OpenCodeService;
  getStorageService(): StorageService;
  getVaultBasePath(): string | null;
  refreshOpenCodianViews(options: { reloadModels?: boolean; applyUi?: boolean }): void;
  invalidateSlashCommandMenuCatalogs(options?: { preload?: boolean }): void;
  applyProviderIconColorMode(): void;
  getOpenCodianLeaves(): WorkspaceLeaf[];
  onSettingsPersistenceBlocked(message: string): void;
}

/**
 * Coordinates the settings save/refresh/config-sync runtime for OpenCodian.
 *
 * This is a durable runtime owner — not a thin helper — that owns:
 * - Settings save choreography (service update, rollback, persistence, view refresh, config sync)
 * - Theme/appearance state mutations and save triggering
 * - Theme background asset caching and resolution
 * - Debounced settings save timers
 *
 * `main.ts` retains plugin lifecycle ownership and the public API surface;
 * this coordinator holds the detailed choreography that `saveSettings()` delegates to.
 */
export class OpenCodianSettingsRuntimeCoordinator {
  private themeBackgroundDataUrlCache = new Map<string, string | null>();
  private themeBackgroundDataUrlRequests = new Map<string, Promise<string | null>>();
  private chatAppearanceSaveTimeoutId: number | null = null;
  private settingsUiStateSaveTimeoutId: number | null = null;
  private settingsPersistenceWritable = true;

  constructor(private readonly host: OpenCodianSettingsRuntimeCoordinatorHost) {}

  initialize(settingsPersistenceWritable: boolean): void {
    this.settingsPersistenceWritable = settingsPersistenceWritable;
  }

  async saveSettings(options: {
    syncService?: boolean;
    reloadModels?: boolean;
    syncConfig?: boolean;
    applyUi?: boolean;
  } = {}): Promise<void> {
    const {
      syncService = true,
      reloadModels = true,
      syncConfig = true,
      applyUi = true,
    } = options;

    this.clearChatAppearanceSaveTimer();
    this.clearSettingsUiStateSaveTimer();
    this.applyLoggerSettings();

    if (syncService) {
      const previousSettings = this.host.getOpenCodeService().getSettingsSnapshot();

      try {
        await this.host.getOpenCodeService().updateSettings(this.host.getSettings());
      } catch (error) {
        this.host.setSettings(previousSettings);
        this.applyLoggerSettings();
        throw error;
      }
    }

    await this.persistSettingsDomains({ core: true, ui: true });

    this.host.refreshOpenCodianViews({ reloadModels, applyUi });
    this.host.invalidateSlashCommandMenuCatalogs();

    if (syncConfig) {
      const vaultPath = this.host.getVaultBasePath();
      if (vaultPath) {
        await OpencodeConfigManager.syncPermissionMode(
          vaultPath,
          this.host.getSettings().permissionMode,
          { healthCheck: () => this.host.getOpenCodeService().checkHealth() },
        );
      }
    }
  }

  getActiveThemePresetDefinition(): ThemePresetDefinition | null {
    return getThemePresetDefinition(this.host.getSettings().theme.activePresetId);
  }

  getChatAppearanceBaseline(): ChatAppearanceSettings {
    const activePreset = this.getActiveThemePresetDefinition();
    return activePreset
      ? normalizeChatAppearanceSettings(activePreset.appearance)
      : getDefaultChatAppearanceSettings();
  }

  selectThemePreset(presetId: ThemePresetId): void {
    const preset = getThemePresetDefinition(presetId);
    if (!preset) {
      return;
    }

    const settings = this.host.getSettings();
    const preservedBackground = normalizeChatAppearanceSettings(settings.chatAppearance).background;
    settings.theme.activePresetId = preset.id;
    settings.theme.customAppearanceOverrides = {};
    settings.chatAppearance = normalizeChatAppearanceSettings({
      ...preset.appearance,
      background: preservedBackground,
    });
  }

  updateChatAppearance(mutator: (appearance: ChatAppearanceSettings) => void): void {
    const nextAppearance = normalizeChatAppearanceSettings(this.host.getSettings().chatAppearance);
    mutator(nextAppearance);
    this.setEffectiveChatAppearance(nextAppearance);
  }

  resetChatAppearanceToBaseline(): void {
    this.setEffectiveChatAppearance(this.getChatAppearanceBaseline());
  }

  resetChatAppearanceGroup(
    group: 'layout' | 'background' | 'user' | 'assistant' | 'input' | 'scrollbar' | 'advanced',
  ): void {
    const baseline = this.getChatAppearanceBaseline();
    const nextAppearance = normalizeChatAppearanceSettings(this.host.getSettings().chatAppearance);

    if (group === 'layout') {
      nextAppearance.layout = { ...baseline.layout };
      nextAppearance.sticky = { ...baseline.sticky };
    } else if (group === 'background') {
      nextAppearance.background = { ...baseline.background };
    } else if (group === 'user') {
      nextAppearance.user = { ...baseline.user };
    } else if (group === 'assistant') {
      nextAppearance.assistant = { ...baseline.assistant };
    } else if (group === 'input') {
      nextAppearance.input = { ...baseline.input };
    } else if (group === 'scrollbar') {
      nextAppearance.scrollbar = { ...baseline.scrollbar };
    } else {
      nextAppearance.advanced = { ...baseline.advanced };
    }

    this.setEffectiveChatAppearance(nextAppearance);
  }

  async selectThemePresetAndSave(presetId: ThemePresetId): Promise<void> {
    const previousAppearance = normalizeChatAppearanceSettings(this.host.getSettings().chatAppearance);
    this.selectThemePreset(presetId);
    await this.saveChatAppearanceImmediately(previousAppearance);
  }

  async resetChatAppearanceToBaselineAndSave(): Promise<void> {
    const previousAppearance = normalizeChatAppearanceSettings(this.host.getSettings().chatAppearance);
    this.resetChatAppearanceToBaseline();
    await this.saveChatAppearanceImmediately(previousAppearance);
  }

  async resetThemePresetAppearanceAndSave(): Promise<void> {
    const previousAppearance = normalizeChatAppearanceSettings(this.host.getSettings().chatAppearance);
    const preservedBackground = previousAppearance.background;
    this.resetChatAppearanceToBaseline();
    this.updateChatAppearance((appearance) => {
      appearance.background = { ...preservedBackground };
    });
    await this.saveChatAppearanceImmediately(previousAppearance);
  }

  async resetChatAppearanceGroupAndSave(
    group: 'layout' | 'background' | 'user' | 'assistant' | 'input' | 'scrollbar' | 'advanced',
  ): Promise<void> {
    const previousAppearance = normalizeChatAppearanceSettings(this.host.getSettings().chatAppearance);
    this.resetChatAppearanceGroup(group);
    await this.saveChatAppearanceImmediately(previousAppearance);
  }

  async importChatThemeBackgroundFile(file: File): Promise<void> {
    const previousAppearance = normalizeChatAppearanceSettings(this.host.getSettings().chatAppearance);
    const asset = await this.host.getStorageService().saveThemeBackgroundAsset(
      await file.arrayBuffer(),
      file.name,
      file.type,
    );

    this.updateChatAppearance((appearance) => {
      appearance.background.imagePath = asset.path;
      appearance.background.imageMimeType = asset.mimeType;
      appearance.background.imageDisplayName = asset.displayName;
    });

    try {
      await this.saveChatAppearanceImmediately(previousAppearance);
    } catch (error) {
      this.clearThemeBackgroundDataUrlCache(asset.path);
      await this.host.getStorageService().removeThemeBackground(asset.path);
      throw error;
    }
  }

  async clearChatThemeBackground(): Promise<void> {
    const previousAppearance = normalizeChatAppearanceSettings(this.host.getSettings().chatAppearance);
    const hadBackground = Boolean(
      previousAppearance.background.imagePath
      || previousAppearance.background.imageMimeType
      || previousAppearance.background.imageDisplayName,
    );
    if (!hadBackground) {
      return;
    }

    this.updateChatAppearance((appearance) => {
      appearance.background.imagePath = '';
      appearance.background.imageMimeType = '';
      appearance.background.imageDisplayName = '';
    });

    await this.saveChatAppearanceImmediately(previousAppearance);
  }

  async resolveChatThemeBackgroundDataUrl(): Promise<string | null> {
    const { imagePath, imageMimeType } = this.host.getSettings().chatAppearance.background;
    if (!imagePath) {
      return null;
    }

    const cacheKey = `${imagePath}::${imageMimeType}`;
    if (this.themeBackgroundDataUrlCache.has(cacheKey)) {
      return this.themeBackgroundDataUrlCache.get(cacheKey) ?? null;
    }

    const inFlightRequest = this.themeBackgroundDataUrlRequests.get(cacheKey);
    if (inFlightRequest) {
      return inFlightRequest;
    }

    const request = this.host.getStorageService().readThemeBackgroundDataUrl(imagePath, imageMimeType)
      .then((dataUrl) => {
        this.themeBackgroundDataUrlCache.set(cacheKey, dataUrl);
        return dataUrl;
      })
      .catch((error) => {
        logger.warn('Failed to resolve chat theme background asset', error);
        this.themeBackgroundDataUrlCache.set(cacheKey, null);
        return null;
      })
      .finally(() => {
        this.themeBackgroundDataUrlRequests.delete(cacheKey);
      });

    this.themeBackgroundDataUrlRequests.set(cacheKey, request);
    return request;
  }

  scheduleChatAppearanceSave(delay = 220): void {
    this.clearChatAppearanceSaveTimer();
    this.chatAppearanceSaveTimeoutId = window.setTimeout(() => {
      this.chatAppearanceSaveTimeoutId = null;
      void this.persistSettingsDomains({ core: true }).catch((error) => {
        logger.error('Failed to persist core settings', error);
      });
    }, delay);
  }

  scheduleSettingsUiStateSave(delay = 220): void {
    this.clearSettingsUiStateSaveTimer();
    this.settingsUiStateSaveTimeoutId = window.setTimeout(() => {
      this.settingsUiStateSaveTimeoutId = null;
      void this.persistSettingsDomains({ ui: true }).catch((error) => {
        logger.error('Failed to persist UI settings state', error);
      });
    }, delay);
  }

  async saveSettingsUiStateImmediately(): Promise<void> {
    this.clearSettingsUiStateSaveTimer();
    await this.persistSettingsDomains({ ui: true });
  }

  clearChatAppearanceSaveTimer(): void {
    if (this.chatAppearanceSaveTimeoutId !== null) {
      window.clearTimeout(this.chatAppearanceSaveTimeoutId);
      this.chatAppearanceSaveTimeoutId = null;
    }
  }

  clearSettingsUiStateSaveTimer(): void {
    if (this.settingsUiStateSaveTimeoutId !== null) {
      window.clearTimeout(this.settingsUiStateSaveTimeoutId);
      this.settingsUiStateSaveTimeoutId = null;
    }
  }

  private applyLoggerSettings(): void {
    const settings = this.host.getSettings();
    setDebugLoggingEnabled(settings.enableDebugLogging);
    setDebugModuleSettings(settings.debugModuleSettings);
    setDebugRefreshIntervalMs(settings.debugRefreshIntervalMs);
    setInlineSerializedDebugLogArgsEnabled(settings.inlineSerializedDebugLogArgs);
  }

  async persistSettingsDomains(options: { core?: boolean; ui?: boolean }): Promise<boolean> {
    if (!this.settingsPersistenceWritable) {
      this.host.onSettingsPersistenceBlocked(
        'OpenCodian settings persistence is in recovery-only mode because the saved settings files could not be safely recovered.',
      );
      return false;
    }

    const { core, ui } = splitPersistedSettings(this.host.getSettings());
    if (options.core) {
      await this.host.getStorageService().saveCoreSettings(core);
    }
    if (options.ui) {
      await this.host.getStorageService().saveUiSettings(ui);
    }
    return true;
  }

  private setEffectiveChatAppearance(nextAppearance: ChatAppearanceSettings): void {
    const settings = this.host.getSettings();
    settings.chatAppearance = normalizeChatAppearanceSettings(nextAppearance);
    const activePreset = this.getActiveThemePresetDefinition();
    settings.theme.customAppearanceOverrides = activePreset
      ? getThemeAppearanceOverridesFromBase(activePreset.appearance, settings.chatAppearance)
      : {};
  }

  private async saveChatAppearanceImmediately(previousAppearance: ChatAppearanceSettings): Promise<void> {
    const previousBackgroundPath = previousAppearance.background.imagePath;
    const nextBackgroundPath = this.host.getSettings().chatAppearance.background.imagePath;

    try {
      const persisted = await this.persistSettingsDomains({ core: true });
      if (!persisted) {
        return;
      }
    } catch (error) {
      this.setEffectiveChatAppearance(previousAppearance);
      this.host.refreshOpenCodianViews({ reloadModels: false, applyUi: true });
      throw error;
    }

    if (previousBackgroundPath && previousBackgroundPath !== nextBackgroundPath) {
      this.clearThemeBackgroundDataUrlCache(previousBackgroundPath);
      try {
        await this.host.getStorageService().removeThemeBackground(previousBackgroundPath);
      } catch (error) {
        logger.warn('Failed to delete old chat theme background asset', error);
      }
    }
  }

  private clearThemeBackgroundDataUrlCache(path?: string | null): void {
    if (!path) {
      this.themeBackgroundDataUrlCache.clear();
      this.themeBackgroundDataUrlRequests.clear();
      return;
    }

    const pathPrefix = `${path}::`;
    for (const cacheKey of Array.from(this.themeBackgroundDataUrlCache.keys())) {
      if (cacheKey.startsWith(pathPrefix)) {
        this.themeBackgroundDataUrlCache.delete(cacheKey);
      }
    }
    for (const cacheKey of Array.from(this.themeBackgroundDataUrlRequests.keys())) {
      if (cacheKey.startsWith(pathPrefix)) {
        this.themeBackgroundDataUrlRequests.delete(cacheKey);
      }
    }
  }
}
