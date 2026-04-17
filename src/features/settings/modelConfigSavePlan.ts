import {
  collectConfiguredProviderIds,
  formatModelReference,
  setProviderEnabled,
} from '../../core/config/modelConfig';
import type {
  OpencodeModelConfigSubset,
  OpencodeProviderConfig,
  OpencodeProviderModelConfig,
} from '../../core/types';
import { t } from '../../i18n';
import {
  type ModelConfigModalFlow,
  parseAddProviderJsonDraft,
} from './modelConfigModalState';
import {
  assertModelExtraFieldKeyAllowed,
  parseLooseValue,
  parseModelVariantValue,
  PROVIDER_ID_PATTERN,
  type ProviderFormState,
  resolveNpmForInterfaceFormat,
} from './modelConfigWorkspace';

export interface ModelConfigSavePlan {
  nextConfig: OpencodeModelConfigSubset;
  nextDisabledModelRefs: string[];
  restartServerAfterWrite: boolean;
}

export interface ModelConfigSavePlanInput {
  flow: ModelConfigModalFlow;
  modelValue: string;
  smallModelValue: string;
  providers: ProviderFormState[];
  selectedProvider: ProviderFormState | null;
  localConfigAtOpen: OpencodeModelConfigSubset;
  serverConfigAtOpen: OpencodeModelConfigSubset;
  initialDisabledModelRefs: string[];
  jsonDraftValue: string;
}

export type ProviderAvailabilitySubset = Pick<OpencodeModelConfigSubset, 'enabled_providers' | 'disabled_providers'>;

export function buildModelConfigSavePlan(input: ModelConfigSavePlanInput): ModelConfigSavePlan {
  return input.flow === 'add-provider'
    ? buildAddProviderSavePlan(input)
    : buildWorkspaceSavePlan(input);
}

export function buildWorkspaceSavePlan(input: ModelConfigSavePlanInput): ModelConfigSavePlan {
  return {
    nextConfig: toModelConfig(input),
    nextDisabledModelRefs: buildNextDisabledModelRefs(input),
    restartServerAfterWrite: true,
  };
}

export function buildAddProviderSavePlan(input: ModelConfigSavePlanInput): ModelConfigSavePlan {
  const provider = input.selectedProvider;
  if (!provider) {
    throw new Error(t('settings.model.visualEditor.noProviderSelected'));
  }

  const providerId = provider.id.trim();
  const providerName = provider.name.trim();
  if (!providerId) {
    throw new Error(t('settings.model.visualEditor.errorProviderId'));
  }
  if (!PROVIDER_ID_PATTERN.test(providerId)) {
    throw new Error(t('settings.model.visualEditor.errorProviderIdFormat'));
  }
  if (!providerName) {
    throw new Error(t('settings.model.visualEditor.errorProviderName'));
  }
  if (Object.prototype.hasOwnProperty.call(input.localConfigAtOpen.provider ?? {}, providerId)) {
    throw new Error(t('settings.model.visualEditor.errorProviderDuplicate'));
  }

  const parsedConfig = parseAddProviderJsonDraft(input.jsonDraftValue);
  parsedConfig.name = providerName;

  const availabilitySubset = buildAvailabilitySubset(input);
  return {
    nextConfig: {
      ...input.localConfigAtOpen,
      provider: {
        ...(input.localConfigAtOpen.provider ?? {}),
        [providerId]: parsedConfig,
      },
      enabled_providers: availabilitySubset.enabled_providers,
      disabled_providers: availabilitySubset.disabled_providers,
    },
    nextDisabledModelRefs: [...input.initialDisabledModelRefs],
    restartServerAfterWrite: false,
  };
}

export function buildAvailabilitySubset(input: {
  providers: ProviderFormState[];
  localConfigAtOpen: OpencodeModelConfigSubset;
  serverConfigAtOpen: OpencodeModelConfigSubset;
}): ProviderAvailabilitySubset {
  const providerIds = Array.from(new Set([
    ...input.providers.map((provider) => provider.id.trim()).filter(Boolean),
    ...collectConfiguredProviderIds(input.localConfigAtOpen),
    ...collectConfiguredProviderIds(input.serverConfigAtOpen),
  ]));

  let subset: OpencodeModelConfigSubset = {
    enabled_providers: Array.isArray(input.localConfigAtOpen.enabled_providers)
      ? [...input.localConfigAtOpen.enabled_providers]
      : undefined,
    disabled_providers: Array.isArray(input.localConfigAtOpen.disabled_providers)
      ? [...input.localConfigAtOpen.disabled_providers]
      : undefined,
  };

  for (const provider of input.providers) {
    const providerId = provider.id.trim();
    if (!providerId) {
      continue;
    }
    subset = setProviderEnabled({
      subset,
      providerId,
      enabled: provider.enabled,
      knownProviderIds: providerIds,
      inherited: input.serverConfigAtOpen,
    });
  }

  return {
    enabled_providers: subset.enabled_providers,
    disabled_providers: subset.disabled_providers,
  };
}

export function toModelConfig(input: {
  modelValue: string;
  smallModelValue: string;
  providers: ProviderFormState[];
  localConfigAtOpen: OpencodeModelConfigSubset;
  serverConfigAtOpen: OpencodeModelConfigSubset;
}): OpencodeModelConfigSubset {
  const providerEntries = input.providers.reduce<Record<string, OpencodeProviderConfig>>((result, provider) => {
    const isBlankProvider = !provider.id.trim()
      && !provider.name.trim()
      && !provider.baseURL.trim()
      && !provider.apiKey.trim()
      && provider.extraOptions.every((entry) => !entry.key.trim() && !entry.value.trim())
      && provider.models.length === 0;
    if (isBlankProvider) {
      return result;
    }

    const providerId = provider.id.trim();
    const providerName = provider.name.trim();
    const baseURL = provider.baseURL.trim();

    if (!providerId) {
      throw new Error(t('settings.model.visualEditor.errorProviderId'));
    }
    if (!PROVIDER_ID_PATTERN.test(providerId)) {
      throw new Error(t('settings.model.visualEditor.errorProviderIdFormat'));
    }
    if (!providerName) {
      throw new Error(t('settings.model.visualEditor.errorProviderName'));
    }
    if (!baseURL) {
      throw new Error(t('settings.model.visualEditor.errorBaseURL'));
    }
    if (Object.prototype.hasOwnProperty.call(result, providerId)) {
      throw new Error(t('settings.model.visualEditor.errorProviderDuplicate'));
    }

    const nextProvider = serializeProviderConfig(provider, {
      validate: true,
      includeName: true,
    });
    result[providerId] = nextProvider;
    return result;
  }, {});

  const availabilitySubset = buildAvailabilitySubset(input);
  return {
    model: input.modelValue.trim() || undefined,
    small_model: input.smallModelValue.trim() || undefined,
    provider: providerEntries,
    enabled_providers: availabilitySubset.enabled_providers,
    disabled_providers: availabilitySubset.disabled_providers,
  };
}

export function buildNextDisabledModelRefs(input: {
  localConfigAtOpen: OpencodeModelConfigSubset;
  providers: ProviderFormState[];
  initialDisabledModelRefs: string[];
}): string[] {
  const managedProviderIds = new Set([
    ...Object.keys(input.localConfigAtOpen.provider ?? {}),
    ...input.providers.map((provider) => provider.id.trim()).filter(Boolean),
  ]);
  const nextRefs = input.initialDisabledModelRefs.filter((ref) => {
    const [providerId] = ref.split('/');
    return !managedProviderIds.has(providerId);
  });

  for (const provider of input.providers) {
    const providerId = provider.id.trim();
    if (!providerId) {
      continue;
    }
    for (const model of provider.models) {
      const modelId = model.id.trim();
      if (!modelId || model.enabled) {
        continue;
      }
      nextRefs.push(formatModelReference(providerId, modelId));
    }
  }

  return Array.from(new Set(nextRefs)).sort((left, right) => left.localeCompare(right));
}

export function serializeProviderConfig(
  provider: ProviderFormState,
  options: { validate: boolean; includeName: boolean },
): OpencodeProviderConfig {
  const providerName = provider.name.trim();
  const baseURL = provider.baseURL.trim();

  if (options.validate) {
    if (!providerName && options.includeName) {
      throw new Error(t('settings.model.visualEditor.errorProviderName'));
    }
    if (!baseURL) {
      throw new Error(t('settings.model.visualEditor.errorBaseURL'));
    }
  }

  const nextProvider = cloneUnmanagedProviderFields(provider.raw);
  if (options.includeName) {
    nextProvider.name = providerName;
  } else {
    delete nextProvider.name;
  }
  nextProvider.npm = resolveNpmForInterfaceFormat(provider);
  const nextOptions: Record<string, unknown> = {};
  if (baseURL) {
    nextOptions.baseURL = baseURL;
  } else {
    delete nextOptions.baseURL;
  }
  if (provider.apiKey.trim()) {
    nextOptions.apiKey = provider.apiKey.trim();
  } else {
    delete nextOptions.apiKey;
  }
  for (const entry of provider.extraOptions) {
    const key = entry.key.trim();
    if (!key || key === 'baseURL' || key === 'apiKey') {
      continue;
    }
    nextOptions[key] = parseLooseValue(entry.value);
  }
  nextProvider.options = nextOptions;

  const modelEntries = provider.models.reduce<Record<string, OpencodeProviderModelConfig>>((models, model) => {
    const modelId = model.id.trim();
    if (!modelId) {
      if (options.validate) {
        throw new Error(t('settings.model.visualEditor.errorModelId'));
      }
      return models;
    }
    if (Object.prototype.hasOwnProperty.call(models, modelId)) {
      throw new Error(t('settings.model.visualEditor.errorModelDuplicate'));
    }

    const nextModel: OpencodeProviderModelConfig = {};
    if (model.name.trim()) {
      nextModel.name = model.name.trim();
    } else {
      delete nextModel.name;
    }

    const nextLimit: NonNullable<OpencodeProviderModelConfig['limit']> = {};
    if (model.context.trim()) {
      const parsed = Number(model.context.trim());
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(t('settings.model.visualEditor.errorContextLimit'));
      }
      nextLimit.context = parsed;
    } else {
      delete nextLimit.context;
    }
    if (model.output.trim()) {
      const parsed = Number(model.output.trim());
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(t('settings.model.visualEditor.errorOutputLimit'));
      }
      nextLimit.output = parsed;
    } else {
      delete nextLimit.output;
    }
    if (Object.keys(nextLimit).length > 0) {
      nextModel.limit = nextLimit;
    } else {
      delete nextModel.limit;
    }

    const nextModelOptions: Record<string, unknown> = {};
    for (const entry of model.options) {
      const key = entry.key.trim();
      if (!key) {
        continue;
      }
      nextModelOptions[key] = parseLooseValue(entry.value);
    }
    if (Object.keys(nextModelOptions).length > 0) {
      nextModel.options = nextModelOptions;
    } else {
      delete nextModel.options;
    }

    const nextModelVariants: Record<string, Record<string, unknown>> = {};
    for (const entry of model.variants) {
      const key = entry.key.trim();
      if (!key) {
        continue;
      }
      nextModelVariants[key] = parseModelVariantValue(key, entry.value);
    }
    if (Object.keys(nextModelVariants).length > 0) {
      nextModel.variants = nextModelVariants;
    } else {
      delete nextModel.variants;
    }

    for (const entry of model.extraFields) {
      const key = assertModelExtraFieldKeyAllowed(entry.key);
      if (!key) {
        continue;
      }
      nextModel[key] = parseLooseValue(entry.value);
    }

    models[modelId] = nextModel;
    return models;
  }, {});

  nextProvider.models = modelEntries;
  return nextProvider;
}

function cloneUnmanagedProviderFields(raw: OpencodeProviderConfig): OpencodeProviderConfig {
  return Object.entries(raw).reduce<OpencodeProviderConfig>((result, [key, value]) => {
    if (key === 'name' || key === 'npm' || key === 'options' || key === 'models') {
      return result;
    }
    result[key] = value;
    return result;
  }, {});
}
