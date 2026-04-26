import type { SettingsLoadResult } from '../storage';
import {
  areChatAppearanceSettingsEqual,
  getThemeAppearanceOverridesFromBase,
  getThemePresetDefinition,
  resolveThemeChatAppearance,
} from '../theme';
import {
  DEFAULT_SETTINGS,
  getDefaultChatAppearanceSettings,
  getDefaultInputPanelGlassRefractionSettings,
  getDefaultInputPanelGlassRefractionSvgFilterSettings,
  getDefaultInputPanelLiquidGlassSettings,
  getDefaultPersistedTabState,
  getDefaultThemeSettings,
  normalizeBelowHeaderTabBarLayout,
  normalizeChatAppearanceSettings,
  normalizeChatFontSizePx,
  normalizeEffortLevel,
  normalizeInputPanelGlassRefractionSettings,
  normalizeInputPanelGlassRefractionSvgFilterSettings,
  normalizeInputPanelLiquidGlassSettings,
  normalizeInputPanelThemeId,
  normalizeModelProviderPluginDebugSettings,
  normalizePersistedTabState,
  normalizeQuestionCardSettings,
  normalizeSettingsLayoutMode,
  normalizeSettingsTabbedPrimaryTab,
  normalizeSettingsTabbedSecondaryTabByPrimary,
  normalizeSlashCommandSkillMode,
  normalizeTabBarPosition,
  normalizeThemeSettings,
  normalizeThinkingBudget,
  normalizeTitleMode,
  OPENCODE_LEGACY_LOCAL_DEFAULT_PORT,
  OPENCODIAN_LOCAL_SIDECAR_DEFAULT_HOST,
  OPENCODIAN_LOCAL_SIDECAR_DEFAULT_PORT,
  type OpenCodianSettings,
} from './settings';

const INPUT_PANEL_GLASS_REFRACTION_GLASS_DEFAULTS_VERSION = 2;

type LegacyFlatServerSettings = {
  host?: string;
  port?: number;
  autoStart?: boolean;
};

type LoadedSettingsSnapshot = Partial<OpenCodianSettings> & {
  debugLogPath?: unknown;
  server?: Partial<OpenCodianSettings['server']> | LegacyFlatServerSettings;
  experimentalComposerGlassRefractionEnabled?: unknown;
  inputPanelLiquidGlassMode?: unknown;
};

type LoadSettingsNormalizationContext = {
  normalizedChatAppearance: OpenCodianSettings['chatAppearance'];
  normalizedInputPanelGlassRefraction: OpenCodianSettings['inputPanelGlassRefraction'];
  normalizedInputPanelGlassRefractionSvgFilter: OpenCodianSettings['inputPanelGlassRefractionSvgFilter'];
  normalizedInputPanelLiquidGlass: OpenCodianSettings['inputPanelLiquidGlass'];
  normalizedServer: OpenCodianSettings['server'];
  normalizedTabState: OpenCodianSettings['tabState'];
  normalizedTheme: OpenCodianSettings['theme'];
};

type LoadSettingsNormalizationResult = {
  settings: OpenCodianSettings;
  shouldMigrateLegacyLocalDefaultPort: boolean;
  shouldResetGlassRefractionGlassDefaults: boolean;
};

type LoadSettingsBootstrapState = LoadSettingsNormalizationResult & {
  persistedSettings: SettingsLoadResult;
  shouldPersistNormalizedSettings: boolean;
};

function isLegacyNikdelvinDefaultProfile(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate);
  const legacyKeys = ['depth', 'strength', 'chromaticAberration', 'blur'];
  const hasOnlyLegacyKeys = keys.every((key) => legacyKeys.includes(key));
  const transitionalKeys = [
    'depth',
    'strength',
    'chromaticAberration',
    'blur',
    'backgroundPreset',
    'color',
    'background',
    'freeze',
    'noMorph',
    'button',
    'inline',
    'customEffects',
  ];
  const hasOnlyTransitionalKeys = keys.every((key) => transitionalKeys.includes(key));

  const matchesLegacyProfile = hasOnlyLegacyKeys
    && candidate.depth === 10
    && candidate.strength === 100
    && candidate.chromaticAberration === 2
    && candidate.blur === 0;

  const matchesTransitionalProfile = hasOnlyTransitionalKeys
    && candidate.depth === 10
    && candidate.strength === 100
    && candidate.chromaticAberration === 0
    && candidate.blur === 0
    && candidate.backgroundPreset === 'none'
    && candidate.color === 'transparent'
    && candidate.background === ''
    && candidate.freeze === false
    && candidate.noMorph === false
    && candidate.button === false
    && candidate.inline === false
    && candidate.customEffects === false;

  return matchesLegacyProfile || matchesTransitionalProfile;
}

function mergeLoadedSettingsSnapshot(persistedSettings: SettingsLoadResult): LoadedSettingsSnapshot | null {
  if (!persistedSettings.core.data && !persistedSettings.ui.data) {
    return null;
  }

  return {
    ...(persistedSettings.core.data ?? {}),
    ...(persistedSettings.ui.data ?? {}),
  } as LoadedSettingsSnapshot;
}

function normalizeServerSettingsOnLoad(savedSettings: LoadedSettingsSnapshot | null): {
  normalizedServer: OpenCodianSettings['server'];
  shouldMigrateLegacyLocalDefaultPort: boolean;
} {
  const defaultServer = DEFAULT_SETTINGS.server;
  const legacyServer = savedSettings?.server;

  if (!legacyServer || typeof legacyServer !== 'object') {
    return {
      normalizedServer: defaultServer,
      shouldMigrateLegacyLocalDefaultPort: false,
    };
  }

  const hasNestedServer =
    'mode' in legacyServer || 'local' in legacyServer || 'remote' in legacyServer || 'auth' in legacyServer;
  const normalizedServer = hasNestedServer
    ? (() => {
        const nestedServer = legacyServer as Partial<OpenCodianSettings['server']>;
        return {
          ...defaultServer,
          ...nestedServer,
          local: {
            ...defaultServer.local,
            ...(nestedServer.local ?? {}),
          },
          remote: {
            ...defaultServer.remote,
            ...(nestedServer.remote ?? {}),
          },
          auth: {
            ...defaultServer.auth,
            ...(nestedServer.auth ?? {}),
          },
        };
      })()
    : (() => {
        const flatServer = legacyServer as LegacyFlatServerSettings;
        const legacyHost = typeof flatServer.host === 'string' && flatServer.host.trim()
          ? flatServer.host.trim()
          : defaultServer.local.host;
        const legacyPort = typeof flatServer.port === 'number' ? flatServer.port : defaultServer.local.port;
        const legacyAutoStart = typeof flatServer.autoStart === 'boolean'
          ? flatServer.autoStart
          : defaultServer.local.autoStart;

        return {
          ...defaultServer,
          mode: 'local' as const,
          local: {
            host: legacyHost,
            port: legacyPort,
            autoStart: legacyAutoStart,
          },
          remote: {
            baseUrl: `http://${legacyHost}:${legacyPort}`,
          },
        };
      })();

  const shouldMigrateLegacyLocalDefaultPort = Boolean(
    savedSettings
    && normalizedServer.mode === 'local'
    && normalizedServer.local.host === OPENCODIAN_LOCAL_SIDECAR_DEFAULT_HOST
    && normalizedServer.local.port === OPENCODE_LEGACY_LOCAL_DEFAULT_PORT
    && normalizedServer.local.autoStart === DEFAULT_SETTINGS.server.local.autoStart
    && normalizedServer.remote.baseUrl === `http://${OPENCODIAN_LOCAL_SIDECAR_DEFAULT_HOST}:${OPENCODE_LEGACY_LOCAL_DEFAULT_PORT}`,
  );

  if (!shouldMigrateLegacyLocalDefaultPort) {
    return {
      normalizedServer,
      shouldMigrateLegacyLocalDefaultPort,
    };
  }

  return {
    normalizedServer: {
      ...normalizedServer,
      local: {
        ...normalizedServer.local,
        port: OPENCODIAN_LOCAL_SIDECAR_DEFAULT_PORT,
      },
    },
    shouldMigrateLegacyLocalDefaultPort,
  };
}

function normalizeThemeSettingsOnLoad(
  savedSettings: LoadedSettingsSnapshot | null,
  normalizedSavedChatAppearance: OpenCodianSettings['chatAppearance'],
  hasSavedChatAppearance: boolean,
): OpenCodianSettings['theme'] {
  const savedTheme = savedSettings?.theme;
  const hasSavedTheme = savedTheme !== undefined;

  if (!savedSettings) {
    return getDefaultThemeSettings();
  }

  if (!hasSavedTheme) {
    if (
      hasSavedChatAppearance
      && !areChatAppearanceSettingsEqual(normalizedSavedChatAppearance, getDefaultChatAppearanceSettings())
    ) {
      return {
        activePresetId: null,
        customAppearanceOverrides: {},
      } satisfies OpenCodianSettings['theme'];
    }

    return getDefaultThemeSettings();
  }

  const baseTheme = normalizeThemeSettings(savedTheme);
  if (!baseTheme.activePresetId) {
    return {
      activePresetId: null,
      customAppearanceOverrides: {},
    } satisfies OpenCodianSettings['theme'];
  }

  const preset = getThemePresetDefinition(baseTheme.activePresetId);
  if (!preset) {
    return {
      activePresetId: null,
      customAppearanceOverrides: {},
    } satisfies OpenCodianSettings['theme'];
  }

  const effectiveAppearance = hasSavedChatAppearance
    ? normalizedSavedChatAppearance
    : resolveThemeChatAppearance(baseTheme);

  return {
    activePresetId: preset.id,
    customAppearanceOverrides: getThemeAppearanceOverridesFromBase(preset.appearance, effectiveAppearance),
  } satisfies OpenCodianSettings['theme'];
}

function normalizeThemeAndChatAppearanceOnLoad(savedSettings: LoadedSettingsSnapshot | null): {
  normalizedChatAppearance: OpenCodianSettings['chatAppearance'];
  normalizedTheme: OpenCodianSettings['theme'];
} {
  const hasSavedChatAppearance = savedSettings?.chatAppearance !== undefined;
  const normalizedSavedChatAppearance = normalizeChatAppearanceSettings(savedSettings?.chatAppearance);
  const normalizedTheme = normalizeThemeSettingsOnLoad(
    savedSettings,
    normalizedSavedChatAppearance,
    hasSavedChatAppearance,
  );
  const themeResolvedAppearance = normalizedTheme.activePresetId
    ? resolveThemeChatAppearance(normalizedTheme)
    : normalizedSavedChatAppearance;
  const normalizedChatAppearance = hasSavedChatAppearance
    ? normalizeChatAppearanceSettings({
        ...themeResolvedAppearance,
        background: normalizedSavedChatAppearance.background,
      })
    : themeResolvedAppearance;

  return {
    normalizedTheme,
    normalizedChatAppearance,
  };
}

function normalizeInputPanelSettingsOnLoad(savedSettings: LoadedSettingsSnapshot | null): {
  normalizedInputPanelGlassRefraction: OpenCodianSettings['inputPanelGlassRefraction'];
  normalizedInputPanelGlassRefractionSvgFilter: OpenCodianSettings['inputPanelGlassRefractionSvgFilter'];
  normalizedInputPanelLiquidGlass: OpenCodianSettings['inputPanelLiquidGlass'];
  shouldResetGlassRefractionGlassDefaults: boolean;
} {
  const savedGlassDefaultsVersion = Number.isFinite(savedSettings?.inputPanelGlassRefractionGlassDefaultsVersion)
    ? Number(savedSettings?.inputPanelGlassRefractionGlassDefaultsVersion)
    : 0;
  const shouldResetGlassTierDefaults = savedGlassDefaultsVersion < 1;
  const shouldResetCardAndPillTierDefaults =
    savedGlassDefaultsVersion < INPUT_PANEL_GLASS_REFRACTION_GLASS_DEFAULTS_VERSION;
  const shouldResetGlassRefractionGlassDefaults =
    shouldResetGlassTierDefaults || shouldResetCardAndPillTierDefaults;
  const defaultInputPanelGlassRefraction = getDefaultInputPanelGlassRefractionSettings();
  const normalizedInputPanelGlassRefractionBase = normalizeInputPanelGlassRefractionSettings(
    savedSettings?.inputPanelGlassRefraction,
  );
  const normalizedInputPanelGlassRefraction = shouldResetGlassRefractionGlassDefaults
    ? {
        ...normalizedInputPanelGlassRefractionBase,
        ...(shouldResetGlassTierDefaults
          ? {
              glass: { ...defaultInputPanelGlassRefraction.glass },
            }
          : {}),
        ...(shouldResetCardAndPillTierDefaults
          ? {
              card: { ...defaultInputPanelGlassRefraction.card },
              pill: { ...defaultInputPanelGlassRefraction.pill },
            }
          : {}),
      }
    : normalizedInputPanelGlassRefractionBase;
  const normalizedInputPanelGlassRefractionSvgFilter = normalizeInputPanelGlassRefractionSvgFilterSettings(
    savedSettings?.inputPanelGlassRefractionSvgFilter,
  );
  const normalizedInputPanelLiquidGlassBase = normalizeInputPanelLiquidGlassSettings(
    savedSettings?.inputPanelLiquidGlass,
  );
  const defaultInputPanelLiquidGlass = getDefaultInputPanelLiquidGlassSettings();
  const normalizedInputPanelLiquidGlass = isLegacyNikdelvinDefaultProfile(savedSettings?.inputPanelLiquidGlass?.nikdelvin)
    ? {
        ...normalizedInputPanelLiquidGlassBase,
        nikdelvin: { ...defaultInputPanelLiquidGlass.nikdelvin },
      }
    : normalizedInputPanelLiquidGlassBase;

  return {
    normalizedInputPanelGlassRefraction,
    normalizedInputPanelGlassRefractionSvgFilter,
    normalizedInputPanelLiquidGlass,
    shouldResetGlassRefractionGlassDefaults,
  };
}

function buildNormalizedLoadedSettings(
  savedSettings: LoadedSettingsSnapshot | null,
  context: LoadSettingsNormalizationContext,
  normalizedModelProviderPluginDebugSettings: ReturnType<typeof normalizeModelProviderPluginDebugSettings>,
): Partial<OpenCodianSettings> | null {
  if (!savedSettings) {
    return null;
  }

  const remainingSavedSettings = {
    ...savedSettings,
  };
  delete remainingSavedSettings.experimentalComposerGlassRefractionEnabled;
  delete remainingSavedSettings.inputPanelLiquidGlassMode;
  delete remainingSavedSettings.debugLogPath;

  const normalizedQuestionCardSettings = normalizeQuestionCardSettings(savedSettings);

  return {
    ...remainingSavedSettings,
    ...normalizedModelProviderPluginDebugSettings,
    server: context.normalizedServer,
    chatScrollMode:
      (savedSettings.chatScrollMode as OpenCodianSettings['chatScrollMode'] | 'sticky' | undefined) === 'sticky'
        ? 'sticky-mask'
        : savedSettings.chatScrollMode,
    effortLevel: normalizeEffortLevel(savedSettings.effortLevel),
    thinkingBudget: normalizeThinkingBudget(savedSettings.thinkingBudget),
    tabBarPosition: normalizeTabBarPosition(savedSettings.tabBarPosition),
    belowHeaderTabBarLayout: normalizeBelowHeaderTabBarLayout(savedSettings.belowHeaderTabBarLayout),
    titleMode: normalizeTitleMode(savedSettings.titleMode),
    slashCommandSkillMode: normalizeSlashCommandSkillMode(savedSettings.slashCommandSkillMode),
    ...normalizedQuestionCardSettings,
    chatFontSizePx: normalizeChatFontSizePx(savedSettings.chatFontSizePx),
    inputPanelTheme: normalizeInputPanelThemeId(savedSettings.inputPanelTheme),
    inputPanelGlassRefraction: context.normalizedInputPanelGlassRefraction,
    inputPanelGlassRefractionSvgFilter: context.normalizedInputPanelGlassRefractionSvgFilter,
    inputPanelGlassRefractionGlassDefaultsVersion: INPUT_PANEL_GLASS_REFRACTION_GLASS_DEFAULTS_VERSION,
    inputPanelLiquidGlass: context.normalizedInputPanelLiquidGlass,
    chatAppearance: context.normalizedChatAppearance,
    theme: context.normalizedTheme,
    tabState: context.normalizedTabState,
  };
}

function resolveInitialLayoutMode(
  savedSettings: LoadedSettingsSnapshot | null,
): 'classic' | 'tabbed' {
  const explicitValue = normalizeSettingsLayoutMode(savedSettings?.settingsLayoutMode);
  if (savedSettings?.settingsLayoutMode !== undefined) {
    return explicitValue;
  }

  // Existing users with pre-existing settings data default to classic so they
  // are not forcibly switched. Truly fresh installs (no saved snapshot) use
  // the DEFAULT_SETTINGS value (tabbed).
  if (savedSettings) {
    return 'classic';
  }

  return explicitValue;
}

function normalizeLoadedPluginSettings(savedSettings: LoadedSettingsSnapshot | null): LoadSettingsNormalizationResult {
  const normalizedModelProviderPluginDebugSettings = normalizeModelProviderPluginDebugSettings(savedSettings);
  const { normalizedServer, shouldMigrateLegacyLocalDefaultPort } = normalizeServerSettingsOnLoad(savedSettings);
  const { normalizedTheme, normalizedChatAppearance } = normalizeThemeAndChatAppearanceOnLoad(savedSettings);
  const {
    normalizedInputPanelGlassRefraction,
    normalizedInputPanelGlassRefractionSvgFilter,
    normalizedInputPanelLiquidGlass,
    shouldResetGlassRefractionGlassDefaults,
  } = normalizeInputPanelSettingsOnLoad(savedSettings);
  const context: LoadSettingsNormalizationContext = {
    normalizedChatAppearance,
    normalizedInputPanelGlassRefraction,
    normalizedInputPanelGlassRefractionSvgFilter,
    normalizedInputPanelLiquidGlass,
    normalizedServer,
    normalizedTabState: normalizePersistedTabState(savedSettings?.tabState),
    normalizedTheme,
  };
  const normalizedSettings = buildNormalizedLoadedSettings(
    savedSettings,
    context,
    normalizedModelProviderPluginDebugSettings,
  );
  const normalizedTabbedSecondaryTabByPrimary = normalizeSettingsTabbedSecondaryTabByPrimary(
    savedSettings?.settingsTabbedSecondaryTabByPrimary,
  );
  const normalizedTabbedPrimaryTab = normalizeSettingsTabbedPrimaryTab(
    savedSettings?.settingsTabbedPrimaryTab,
    'server',
  );
  const migratedTabbedSettings = normalizedTabbedPrimaryTab === 'server'
    && normalizedTabbedSecondaryTabByPrimary.server === 'mcp'
    ? {
        primaryTab: 'mcp',
        secondaryTabByPrimary: {
          ...normalizedTabbedSecondaryTabByPrimary,
          mcp: normalizedTabbedSecondaryTabByPrimary.mcp ?? 'overview',
        },
      }
    : {
        primaryTab: normalizedTabbedPrimaryTab,
        secondaryTabByPrimary: normalizedTabbedSecondaryTabByPrimary,
      };

  return {
    settings: {
      ...DEFAULT_SETTINGS,
      ...normalizedSettings,
      server: context.normalizedServer,
      tabBarPosition: normalizeTabBarPosition(normalizedSettings?.tabBarPosition),
      belowHeaderTabBarLayout: normalizeBelowHeaderTabBarLayout(normalizedSettings?.belowHeaderTabBarLayout),
      inputPanelTheme: normalizeInputPanelThemeId(normalizedSettings?.inputPanelTheme),
      inputPanelGlassRefraction: normalizedSettings?.inputPanelGlassRefraction
        ?? getDefaultInputPanelGlassRefractionSettings(),
      inputPanelGlassRefractionSvgFilter: normalizedSettings?.inputPanelGlassRefractionSvgFilter
        ?? getDefaultInputPanelGlassRefractionSvgFilterSettings(),
      inputPanelGlassRefractionGlassDefaultsVersion:
        normalizedSettings?.inputPanelGlassRefractionGlassDefaultsVersion
        ?? INPUT_PANEL_GLASS_REFRACTION_GLASS_DEFAULTS_VERSION,
      inputPanelLiquidGlass: normalizedSettings?.inputPanelLiquidGlass
        ?? getDefaultInputPanelLiquidGlassSettings(),
      debugLogPaths: normalizedModelProviderPluginDebugSettings.debugLogPaths,
      disabledModelRefs: normalizedSettings?.disabledModelRefs ?? [],
      chatAppearance: normalizedChatAppearance,
      theme: normalizedTheme,
      tabState: normalizedSettings?.tabState ?? getDefaultPersistedTabState(),
      providerIconLibrary: normalizedModelProviderPluginDebugSettings.providerIconLibrary,
      providerIconColorMode: normalizedModelProviderPluginDebugSettings.providerIconColorMode,
      providerIconDefaultVariant: normalizedModelProviderPluginDebugSettings.providerIconDefaultVariant,
      settingsLayoutMode: resolveInitialLayoutMode(savedSettings),
      settingsTabbedPrimaryTab: migratedTabbedSettings.primaryTab,
      settingsTabbedSecondaryTabByPrimary: migratedTabbedSettings.secondaryTabByPrimary,
    },
    shouldMigrateLegacyLocalDefaultPort,
    shouldResetGlassRefractionGlassDefaults,
  };
}

export function prepareLoadedSettingsBootstrapState(
  persistedSettings: SettingsLoadResult,
): LoadSettingsBootstrapState {
  const savedSettings = mergeLoadedSettingsSnapshot(persistedSettings);
  const normalizedSettings = normalizeLoadedPluginSettings(savedSettings);

  return {
    persistedSettings,
    ...normalizedSettings,
    shouldPersistNormalizedSettings:
      persistedSettings.writable
      && (
        persistedSettings.shouldPersist
        || normalizedSettings.shouldResetGlassRefractionGlassDefaults
        || normalizedSettings.shouldMigrateLegacyLocalDefaultPort
      ),
  };
}
