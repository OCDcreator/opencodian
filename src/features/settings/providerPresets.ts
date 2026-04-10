import type {
  OpencodeProviderConfig,
  OpencodeProviderModelConfig,
} from '../../core/types';
import { t } from '../../i18n';
import {
  type KeyValueFieldState,
  type ModelFormState,
  type ProviderFormState,
  type ProviderInterfaceFormatId,
  serializeUnknownValue,
} from './modelConfigWorkspace';

export type ProviderPresetCategory =
  | 'official'
  | 'cn_official'
  | 'aggregator'
  | 'cloud_provider'
  | 'custom';

export interface ProviderPreset {
  id: string;
  name: string;
  category: ProviderPresetCategory;
  icon?: string;
  iconColor?: string;
  websiteUrl?: string;
  apiKeyUrl?: string;
  interfaceFormat: ProviderInterfaceFormatId;
  npm?: string;
  baseURL: string;
  apiKeyPlaceholder?: string;
  extraOptions?: Record<string, unknown>;
  models: Record<string, {
    name: string;
    context?: number;
    output?: number;
  }>;
}

export const PROVIDER_PRESET_CATEGORY_ORDER: ProviderPresetCategory[] = [
  'cn_official',
  'official',
  'aggregator',
  'cloud_provider',
];

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    category: 'cn_official',
    icon: 'sparkles',
    iconColor: '#1E88E5',
    websiteUrl: 'https://platform.deepseek.com',
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
    interfaceFormat: 'openai-compatible',
    baseURL: 'https://api.deepseek.com/v1',
    apiKeyPlaceholder: 'sk-...',
    extraOptions: { setCacheKey: true },
    models: {
      'deepseek-chat': { name: 'DeepSeek V3.2' },
      'deepseek-reasoner': { name: 'DeepSeek R1' },
    },
  },
  {
    id: 'zhipu-glm',
    name: 'Zhipu GLM',
    category: 'cn_official',
    icon: 'brain',
    iconColor: '#0F62FE',
    websiteUrl: 'https://open.bigmodel.cn',
    apiKeyUrl: 'https://www.bigmodel.cn',
    interfaceFormat: 'openai-compatible',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    extraOptions: { setCacheKey: true },
    models: {
      'glm-5': { name: 'GLM-5', context: 204800, output: 131072 },
    },
  },
  {
    id: 'zhipu-glm-en',
    name: 'Zhipu GLM en',
    category: 'cn_official',
    icon: 'languages',
    iconColor: '#0F62FE',
    websiteUrl: 'https://z.ai',
    apiKeyUrl: 'https://z.ai',
    interfaceFormat: 'openai-compatible',
    baseURL: 'https://api.z.ai/v1',
    extraOptions: { setCacheKey: true },
    models: {
      'glm-5': { name: 'GLM-5', context: 204800, output: 131072 },
    },
  },
  {
    id: 'bailian',
    name: 'Bailian',
    category: 'cn_official',
    icon: 'cloud',
    iconColor: '#624AFF',
    websiteUrl: 'https://bailian.console.aliyun.com',
    apiKeyUrl: 'https://bailian.console.aliyun.com/#/api-key',
    interfaceFormat: 'openai-compatible',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKeyPlaceholder: 'sk-...',
    extraOptions: { setCacheKey: true },
    models: {},
  },
  {
    id: 'kimi-k2-5',
    name: 'Kimi K2.5',
    category: 'cn_official',
    icon: 'moon-star',
    iconColor: '#7C3AED',
    websiteUrl: 'https://platform.moonshot.cn/console',
    apiKeyUrl: 'https://platform.moonshot.cn/console/api-keys',
    interfaceFormat: 'openai-compatible',
    baseURL: 'https://api.moonshot.cn/v1',
    extraOptions: { setCacheKey: true },
    models: {
      'kimi-k2.5': { name: 'Kimi K2.5', context: 262144, output: 262144 },
    },
  },
  {
    id: 'stepfun',
    name: 'StepFun',
    category: 'cn_official',
    icon: 'zap',
    iconColor: '#16A34A',
    websiteUrl: 'https://platform.stepfun.com',
    apiKeyUrl: 'https://platform.stepfun.com',
    interfaceFormat: 'openai-compatible',
    baseURL: 'https://api.stepfun.ai/v1',
    extraOptions: { setCacheKey: true },
    models: {
      'step-3.5-flash': { name: 'Step 3.5 Flash', context: 262144 },
    },
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    category: 'cn_official',
    icon: 'maximize-2',
    iconColor: '#F97316',
    websiteUrl: 'https://www.minimaxi.com',
    apiKeyUrl: 'https://platform.minimaxi.com',
    interfaceFormat: 'openai-compatible',
    baseURL: 'https://api.minimaxi.chat/v1',
    extraOptions: { setCacheKey: true },
    models: {
      'MiniMax-M2.7': { name: 'MiniMax M2.7', context: 204800, output: 131072 },
    },
  },
  {
    id: 'qwen',
    name: 'Qwen',
    category: 'cn_official',
    icon: 'boxes',
    iconColor: '#7C3AED',
    websiteUrl: 'https://bailian.console.aliyun.com',
    apiKeyUrl: 'https://bailian.console.aliyun.com/#/api-key',
    interfaceFormat: 'openai-compatible',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    extraOptions: { setCacheKey: true },
    models: {
      'qwen-max': { name: 'Qwen Max' },
    },
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    category: 'official',
    icon: 'feather',
    iconColor: '#D97706',
    websiteUrl: 'https://www.anthropic.com',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    interfaceFormat: 'anthropic',
    baseURL: 'https://api.anthropic.com',
    apiKeyPlaceholder: 'sk-ant-...',
    extraOptions: { setCacheKey: true },
    models: {
      'claude-sonnet-4-5-20250929': { name: 'Claude Sonnet 4.5', context: 200000, output: 64000 },
      'claude-opus-4-6': { name: 'Claude Opus 4.6', context: 1000000, output: 128000 },
    },
  },
  {
    id: 'openai',
    name: 'OpenAI',
    category: 'official',
    icon: 'circle',
    iconColor: '#10A37F',
    websiteUrl: 'https://platform.openai.com',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    interfaceFormat: 'openai-responses',
    baseURL: 'https://api.openai.com/v1',
    apiKeyPlaceholder: 'sk-...',
    extraOptions: { setCacheKey: true },
    models: {
      'gpt-5.4': { name: 'GPT-5.4', context: 400000, output: 128000 },
    },
  },
  {
    id: 'google-gemini',
    name: 'Google Gemini',
    category: 'official',
    icon: 'star',
    iconColor: '#4285F4',
    websiteUrl: 'https://ai.google.dev',
    apiKeyUrl: 'https://aistudio.google.com/app/apikey',
    interfaceFormat: 'google-gemini',
    baseURL: 'https://generativelanguage.googleapis.com',
    apiKeyPlaceholder: 'AIza...',
    extraOptions: { setCacheKey: true },
    models: {
      'gemini-2.5-flash-lite': { name: 'Gemini 2.5 Flash Lite', context: 1048576, output: 65536 },
      'gemini-3-flash-preview': { name: 'Gemini 3 Flash Preview', context: 1048576, output: 65536 },
    },
  },
  {
    id: 'aws-bedrock',
    name: 'AWS Bedrock',
    category: 'cloud_provider',
    icon: 'cloud-cog',
    iconColor: '#FF9900',
    websiteUrl: 'https://aws.amazon.com/bedrock',
    apiKeyUrl: 'https://console.aws.amazon.com',
    interfaceFormat: 'amazon-bedrock',
    baseURL: '',
    extraOptions: { setCacheKey: true },
    models: {
      'global.anthropic.claude-opus-4-6-v1': { name: 'Claude Opus 4.6', context: 1000000, output: 128000 },
    },
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    category: 'aggregator',
    icon: 'route',
    iconColor: '#8B5CF6',
    websiteUrl: 'https://openrouter.ai',
    apiKeyUrl: 'https://openrouter.ai/keys',
    interfaceFormat: 'openai-compatible',
    baseURL: 'https://openrouter.ai/api/v1',
    apiKeyPlaceholder: 'sk-or-...',
    extraOptions: { setCacheKey: true },
    models: {},
  },
  {
    id: 'siliconflow',
    name: 'SiliconFlow',
    category: 'aggregator',
    icon: 'cpu',
    iconColor: '#2563EB',
    websiteUrl: 'https://siliconflow.cn',
    apiKeyUrl: 'https://cloud.siliconflow.cn/account/ak',
    interfaceFormat: 'openai-compatible',
    baseURL: 'https://api.siliconflow.cn/v1',
    apiKeyPlaceholder: 'sk-...',
    extraOptions: { setCacheKey: true },
    models: {},
  },
];

function nextPresetUid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createKeyValueField(key: string, value: unknown): KeyValueFieldState {
  return {
    uid: nextPresetUid('provider-option'),
    key,
    value: serializeUnknownValue(value),
  };
}

function createModelRaw(model: ProviderPreset['models'][string]): OpencodeProviderModelConfig {
  const raw: OpencodeProviderModelConfig = {
    name: model.name,
  };
  if (typeof model.context === 'number' || typeof model.output === 'number') {
    raw.limit = {};
    if (typeof model.context === 'number') {
      raw.limit.context = model.context;
    }
    if (typeof model.output === 'number') {
      raw.limit.output = model.output;
    }
  }
  return raw;
}

export function presetToFormState(preset: ProviderPreset): ProviderFormState {
  const localizedName = t(`settings.model.presets.provider.${preset.id}` as never) || preset.name;
  const rawOptions: Record<string, unknown> = {
    baseURL: '',
    apiKey: '',
    ...(preset.extraOptions ?? {}),
  };
  const rawModels = Object.entries(preset.models).reduce<Record<string, OpencodeProviderModelConfig>>((result, [modelId, model]) => {
    result[modelId] = createModelRaw(model);
    return result;
  }, {});
  const rawProvider: OpencodeProviderConfig = {
    name: localizedName,
    npm: preset.npm,
    options: rawOptions,
    models: rawModels,
  };

  const models: ModelFormState[] = Object.entries(preset.models).map(([modelId, model]) => ({
    uid: nextPresetUid('model'),
    id: modelId,
    name: model.name,
    context: typeof model.context === 'number' ? String(model.context) : '',
    output: typeof model.output === 'number' ? String(model.output) : '',
    enabled: true,
    options: [],
    variants: [],
    extraFields: [],
    raw: createModelRaw(model),
  }));

  return {
    uid: nextPresetUid('provider'),
    id: preset.id,
    name: localizedName,
    interfaceFormat: preset.interfaceFormat,
    customNpm: preset.interfaceFormat === 'custom' ? (preset.npm ?? '') : '',
    baseURL: preset.baseURL,
    apiKey: '',
    enabled: true,
    extraOptions: Object.entries(preset.extraOptions ?? {}).map(([key, value]) => createKeyValueField(key, value)),
    models,
    raw: rawProvider,
  };
}
