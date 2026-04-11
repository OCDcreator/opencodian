import type { LobehubIconVariant, StaticLobehubIconVariant } from '../../core/types';

import {
  LOBEHUB_ICON_MANIFEST,
  type LobehubManifestEntry,
} from './lobehubIconManifest';

export type BuiltinIconLibraryId = 'lobehub' | 'opencode';

export interface BuiltinIconLobehubMetadata {
  color: string;
  colorGradient?: string;
  componentId: string;
  docsUrl: string;
  fullTitle: string;
  group: 'model' | 'provider' | 'application';
  staticVariants: StaticLobehubIconVariant[];
  supportedVariants: LobehubIconVariant[];
  title: string;
}

export interface BuiltinIconDefinition {
  libraryId: BuiltinIconLibraryId;
  iconId: string;
  displayName: string;
  aliases: string[];
  normalizedAliases: string[];
  tokens: string[];
  searchText: string;
  source: string;
  lobehub?: BuiltinIconLobehubMetadata;
}

export interface SearchBuiltinIconsOptions {
  libraryId?: BuiltinIconLibraryId;
  limit?: number;
}

export interface ParsedBuiltinSource {
  libraryId: BuiltinIconLibraryId;
  iconId: string;
}

export const PROVIDER_ICON_MAP: Record<string, string> = {
  'openai': 'openai',
  'openai-compatible': 'openai',
  'anthropic': 'anthropic',
  'claude': 'claude',
  'google': 'google',
  'gemini': 'gemini',
  'palm': 'palm',
  'vertexai': 'vertexai',
  'deepseek': 'deepseek',
  'zhipu': 'zhipu',
  'chatglm': 'chatglm',
  'glm': 'zhipu',
  'alibaba': 'alibaba',
  'alibabacloud': 'alibabacloud',
  'bailian': 'bailian',
  'qwen': 'qwen',
  'tongyi': 'qwen',
  'baidu': 'baidu',
  'baiducloud': 'baiducloud',
  'wenxin': 'wenxin',
  'ernie': 'wenxin',
  'bytedance': 'bytedance',
  'doubao': 'doubao',
  'coze': 'coze',
  'capcut': 'capcut',
  'jimeng': 'jimeng',
  'moonshot': 'moonshot',
  'kimi': 'moonshot',
  'minimax': 'minimax',
  'abab': 'minimax',
  '01ai': 'zeroone',
  'yi': 'yi',
  'baichuan': 'baichuan',
  'huawei': 'huawei',
  'huaweicloud': 'huaweicloud',
  'pangu': 'huaweicloud',
  'tencent': 'tencent',
  'tencentcloud': 'tencentcloud',
  'hunyuan': 'hunyuan',
  'yuanbao': 'yuanbao',
  'spark': 'spark',
  'sensetime': 'sensenova',
  'sensenova': 'sensenova',
  'iflytek': 'spark',
  'iflytekcloud': 'iflytekcloud',
  'meta': 'meta',
  'llama': 'meta',
  'mistral': 'mistral',
  'cohere': 'cohere',
  'aya': 'aya',
  'commanda': 'commanda',
  'ai21': 'ai21',
  'jamba': 'ai21',
  'xai': 'xai',
  'grok': 'grok',
  'perplexity': 'perplexity',
  'groq': 'groq',
  'together': 'together',
  'fireworks': 'fireworks',
  'ollama': 'ollama',
  'vllm': 'vllm',
  'azure': 'azure',
  'azureai': 'azureai',
  'aws': 'aws',
  'bedrock': 'bedrock',
  'nova': 'nova',
  'cloudflare': 'cloudflare',
  'workersai': 'workersai',
  'github': 'github',
  'copilot': 'githubcopilot',
  'opencopilot': 'githubcopilot',
  'openrouter': 'openrouter',
  'siliconflow': 'siliconcloud',
  'siliconcloud': 'siliconcloud',
  'nvidia': 'nvidia',
  'nemotron': 'nvidia',
  'microsoft': 'microsoft',
  'bing': 'bing',
  'replicate': 'replicate',
  'stability': 'stability',
  'midjourney': 'midjourney',
  'adobe': 'adobe',
  'firefly': 'adobefirefly',
  'dalle': 'dalle',
  'flux': 'flux',
  'bfl': 'bfl',
  'elevenlabs': 'elevenlabs',
  'suno': 'suno',
  'udio': 'udio',
  'pika': 'pika',
  'runway': 'runway',
  'luma': 'luma',
  'dreammachine': 'dreammachine',
  'kling': 'kling',
  'krea': 'krea',
  'fal': 'fal',
  'ideogram': 'ideogram',
  'recraft': 'recraft',
  'sonnet': 'claude',
  'opus': 'claude',
  'haiku': 'claude',
  'langchain': 'langchain',
  'langgraph': 'langgraph',
  'llamaindex': 'llamaindex',
  'huggingface': 'huggingface',
  'replit': 'replit',
  'vercel': 'vercel',
  'v0': 'v0',
  'notion': 'notion',
  'figma': 'figma',
  'snowflake': 'snowflake',
  'dify': 'dify',
  'fastgpt': 'fastgpt',
  'lobehub': 'lobehub',
  'opencode': 'opencode',
  'cursor': 'cursor',
  'windsurf': 'windsurf',
  'trae': 'trae',
  'lmstudio': 'lmstudio',
  'jan': 'menlo',
  'anythingllm': 'menlo',
  'openwebui': 'openwebui',
  'lobechat': 'lobehub',
  'cherrystudio': 'cherrystudio',
  'oneapi': 'newapi',
  'newapi': 'newapi',
  'ppio': 'ppio',
  'volcengine': 'volcengine',
  'stepfun': 'stepfun',
  'skywork': 'skywork',
  'tiangong': 'tiangong',
  'internlm': 'internlm',
  'ai360': 'ai360',
  'aihubmix': 'aihubmix',
  'api2d': 'openai',
  'anthropic-bedrock': 'bedrock',
  'anthropic-vertex': 'vertexai',
  'cerebras': 'cerebras',
  'friendli': 'friendli',
  'lambda': 'lambda',
  'leptonai': 'leptonai',
  'octoai': 'lambda',
  'predibase': 'baseten',
  'sambanova': 'sambanova',
  'targon': 'targon',
  'tii': 'tii',
  'falcon': 'tii',
  'upstage': 'upstage',
  'writer': 'palm',
  'zephyr': 'huggingface',
  'yi-01': 'yi',
  'deepinfra': 'deepinfra',
  'monsterapi': 'deepinfra',
  'ai71': 'falcon',
  'cloudflare-ai': 'cloudflare',
  'azure-openai': 'azure',
  'gcp-vertex': 'vertexai',
  'amazon-bedrock': 'bedrock',
  'ibm': 'ibm',
  'watson': 'ibm',
  'oracle': 'aws',
  'salesforce': 'salesforce',
  'sap': 'salesforce',
  'qwen-max': 'qwen',
  'qwen-plus': 'qwen',
  'qwen-turbo': 'qwen',
  'ernie-bot': 'wenxin',
  'ernie-bot-turbo': 'wenxin',
  'ernie-bot-4': 'wenxin',
  'glm-4': 'zhipu',
  'glm-3': 'zhipu',
  'chatglm-4': 'chatglm',
  'chatglm-3': 'chatglm',
  'abab6': 'minimax',
  'abab5': 'minimax',
  'moonshot-v1': 'moonshot',
  'yi-large': 'yi',
  'yi-medium': 'yi',
  'yi-spark': 'yi',
  'baichuan2': 'baichuan',
  'baichuan3': 'baichuan',
  'sensechat': 'sensenova',
  'spark-desk': 'spark',
  'pangu-2': 'huaweicloud',
  'pangu-3': 'huaweicloud',
  'hunyuan-pro': 'hunyuan',
  'hunyuan-standard': 'hunyuan',
  'hunyuan-lite': 'hunyuan',
  'step-1': 'stepfun',
  'step-2': 'stepfun',
  'skywork-gpt': 'skywork',
  'internlm2': 'internlm',
  'internlm-chat': 'internlm',
  'deepseek-chat': 'deepseek',
  'deepseek-coder': 'deepseek',
  'openchat': 'openchat',
  'dolphin': 'dolphin',
  'nous': 'nousresearch',
  'hermes': 'nousresearch',
  'wizardlm': 'microsoft',
  'vicuna': 'lmsys',
  'lmsys': 'lmsys',
  'togetherai': 'together',
  'anyscale': 'anyscale',
  'banana': 'nanobanana',
  'baseten': 'baseten',
  'coreweave': 'coreweave',
  'crusoe': 'crusoe',
  'foundry': 'foundry',
  'gooseai': 'goose',
  'gradient': 'gradient',
  'hyperbolic': 'hyperbolic',
  'mystic': 'mystic',
  'novita': 'novita',
  'pplx': 'perplexity',
  'pi': 'inflection',
  'poe': 'poe',
  'reka': 'reka',
  'shuttleai': 'shuttleai',
  'stochasticai': 'stochasticai',
  'thebai': 'thebai',
  'titanml': 'titanml',
  'yandexgpt': 'yandex',
  'you': 'youmind',
  'claude-api': 'claude',
  'gpt-4': 'openai',
  'gpt-4o': 'openai',
  'gpt-4-turbo': 'openai',
  'gpt-3.5': 'openai',
  'gpt-3.5-turbo': 'openai',
  'gemini-pro': 'gemini',
  'gemini-ultra': 'gemini',
  'gemini-1.5': 'gemini',
  'llama-2': 'meta',
  'llama-3': 'meta',
  'llama-3.1': 'meta',
  'llama-3.2': 'meta',
  'llama-4': 'meta',
  'mixtral': 'mistral',
  'mixtral-8x7b': 'mistral',
  'mixtral-8x22b': 'mistral',
  'mistral-tiny': 'mistral',
  'mistral-small': 'mistral',
  'mistral-medium': 'mistral',
  'mistral-large': 'mistral',
  'codellama': 'meta',
  'phi-2': 'microsoft',
  'phi-3': 'microsoft',
  'gemma': 'gemma',
  'gemma-2': 'gemma',
  'gemma-3': 'gemma',
  'qwen-72b': 'qwen',
  'qwen-110b': 'qwen',
  'qwen-1.5': 'qwen',
  'qwen-2': 'qwen',
  'qwen-2.5': 'qwen',
  'qwen-coder': 'qwen',
  'yi-34b': 'yi',
  'dbrx': 'dbrx',
  'command-r': 'cohere',
  'command-r-plus': 'cohere',
  'claude-3-opus': 'claude',
  'claude-3-sonnet': 'claude',
  'claude-3-haiku': 'claude',
  'claude-3.5-sonnet': 'claude',
  'claude-3.5-haiku': 'claude',
  'grok-1': 'grok',
  'grok-2': 'grok',
  'pplx-7b': 'perplexity',
  'pplx-70b': 'perplexity',
  'sonar-small': 'perplexity',
  'sonar-medium': 'perplexity',
  'sonar-large': 'perplexity',
};

export const OPENCODE_ICON_ALIAS_MAP: Record<string, string> = {
  'amazonbedrock': 'amazon-bedrock',
  'bedrock': 'amazon-bedrock',
  'azurecognitiveservices': 'azure-cognitive-services',
  'cloudflareaigateway': 'cloudflare-ai-gateway',
  'cloudflareworkersai': 'cloudflare-workers-ai',
  'githubcopilot': 'github-copilot',
  'githubmodels': 'github-models',
  'googlevertex': 'google-vertex',
  'googlevertexanthropic': 'google-vertex-anthropic',
  'iflow': 'iflowcn',
  'moonshot': 'moonshotai',
  'moonshotv1': 'moonshotai',
  'nebiusai': 'nebius',
  'novita': 'novita-ai',
  'ollama': 'ollama-cloud',
  'perplexityagent': 'perplexity-agent',
  'privatemode': 'privatemode-ai',
  'qihang': 'qihang-ai',
  'qiniu': 'qiniu-ai',
  'requestyai': 'requesty',
  'sap': 'sap-ai-core',
  'siliconflowcn': 'siliconflow-cn',
  'tencent': 'tencent-coding-plan',
  'together': 'togetherai',
  'zhipu': 'zhipuai',
  'zhipuaicodingplan': 'zhipuai-coding-plan',
};

const OPENCODE_ICON_IDS = [
  '302ai',
  'abacus',
  'aihubmix',
  'alibaba-cn',
  'alibaba-coding-plan-cn',
  'alibaba-coding-plan',
  'alibaba',
  'amazon-bedrock',
  'anthropic',
  'azure-cognitive-services',
  'azure',
  'bailing',
  'baseten',
  'berget',
  'cerebras',
  'chutes',
  'clarifai',
  'cloudferro-sherlock',
  'cloudflare-ai-gateway',
  'cloudflare-workers-ai',
  'cohere',
  'cortecs',
  'deepinfra',
  'deepseek',
  'dinference',
  'drun',
  'evroc',
  'fastrouter',
  'fireworks-ai',
  'firmware',
  'friendli',
  'github-copilot',
  'github-models',
  'gitlab',
  'google-vertex-anthropic',
  'google-vertex',
  'google',
  'groq',
  'helicone',
  'huggingface',
  'iflowcn',
  'inception',
  'inference',
  'io-net',
  'jiekou',
  'kilo',
  'kimi-for-coding',
  'kuae-cloud-coding-plan',
  'llama',
  'lmstudio',
  'lucidquery',
  'meganova',
  'minimax-cn-coding-plan',
  'minimax-cn',
  'minimax-coding-plan',
  'minimax',
  'mistral',
  'moark',
  'modelscope',
  'moonshotai-cn',
  'moonshotai',
  'morph',
  'nano-gpt',
  'nebius',
  'nova',
  'novita-ai',
  'nvidia',
  'ollama-cloud',
  'openai',
  'opencode-go',
  'opencode',
  'openrouter',
  'ovhcloud',
  'perplexity-agent',
  'perplexity',
  'poe',
  'privatemode-ai',
  'qihang-ai',
  'qiniu-ai',
  'requesty',
  'sap-ai-core',
  'scaleway',
  'siliconflow-cn',
  'siliconflow',
  'stackit',
  'stepfun',
  'submodel',
  'synthetic',
  'tencent-coding-plan',
  'togetherai',
  'upstage',
  'v0',
  'venice',
  'vercel',
  'vivgrid',
  'vultr',
  'wandb',
  'xai',
  'xiaomi',
  'zai-coding-plan',
  'zai',
  'zenmux',
  'zhipuai-coding-plan',
  'zhipuai',
] as const;

const libraryOrder: Record<BuiltinIconLibraryId, number> = {
  lobehub: 0,
  opencode: 1,
};

function titleCaseSegment(segment: string): string {
  if (!segment) {
    return segment;
  }

  if (/^[a-z]\d$/i.test(segment)) {
    return segment.toLowerCase();
  }

  return segment[0].toUpperCase() + segment.slice(1);
}

function getDisplayName(iconId: string): string {
  const customNames: Record<string, string> = {
    '302ai': '302.AI',
    'aihubmix': 'AiHubMix',
    'iflowcn': 'iFlow CN',
    'lmstudio': 'LM Studio',
    'nano-gpt': 'Nano GPT',
    'novita-ai': 'Novita AI',
    'ollama-cloud': 'Ollama Cloud',
    'openai': 'OpenAI',
    'opencode': 'OpenCode',
    'opencode-go': 'OpenCode Go',
    'qihang-ai': 'Qihang AI',
    'qiniu-ai': 'Qiniu AI',
    'sap-ai-core': 'SAP AI Core',
    'v0': 'v0',
    'xai': 'xAI',
    'zhipuai': 'Zhipu AI',
  };

  const override = customNames[iconId];
  if (override) {
    return override;
  }

  return iconId
    .split('-')
    .map((segment) => titleCaseSegment(segment))
    .join(' ');
}

function normalizeSearchValue(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function tokenize(value: string): string[] {
  return value
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function buildLobehubDefinitions(): BuiltinIconDefinition[] {
  const aliasesByIconId = new Map<string, string[]>();

  for (const [alias, iconId] of Object.entries(PROVIDER_ICON_MAP)) {
    const aliases = aliasesByIconId.get(iconId) ?? [];
    aliases.push(alias);
    aliasesByIconId.set(iconId, aliases);
  }

  return LOBEHUB_ICON_MANIFEST
    .map((entry) => createDefinition('lobehub', entry.iconId, aliasesByIconId.get(entry.iconId) ?? [], entry))
    .sort(sortDefinitions);
}

function buildOpencodeDefinitions(): BuiltinIconDefinition[] {
  const aliasesByIconId = new Map<string, string[]>();

  for (const [alias, iconId] of Object.entries(OPENCODE_ICON_ALIAS_MAP)) {
    const aliases = aliasesByIconId.get(iconId) ?? [];
    aliases.push(alias);
    aliasesByIconId.set(iconId, aliases);
  }

  return [...OPENCODE_ICON_IDS]
    .sort((left, right) => left.localeCompare(right))
    .map((iconId) => createDefinition('opencode', iconId, aliasesByIconId.get(iconId) ?? []));
}

function createDefinition(
  libraryId: BuiltinIconLibraryId,
  iconId: string,
  aliases: string[],
  manifestEntry?: LobehubManifestEntry,
): BuiltinIconDefinition {
  const displayName = manifestEntry?.fullTitle ?? getDisplayName(iconId);
  const searchValues = [
    iconId,
    displayName,
    manifestEntry?.title,
    manifestEntry?.docsUrl,
    manifestEntry?.componentId,
    ...aliases,
  ].filter((value): value is string => Boolean(value));
  const values = Array.from(new Set(searchValues));
  return {
    libraryId,
    iconId,
    displayName,
    aliases,
    normalizedAliases: values.map((value) => normalizeSearchValue(value)).filter(Boolean),
    tokens: Array.from(new Set(values.flatMap((value) => tokenize(value)))),
    searchText: values.join(' ').toLowerCase(),
    source: formatBuiltinSource(libraryId, iconId),
    lobehub: manifestEntry ? {
      color: manifestEntry.color,
      colorGradient: manifestEntry.colorGradient,
      componentId: manifestEntry.componentId,
      docsUrl: manifestEntry.docsUrl,
      fullTitle: manifestEntry.fullTitle,
      group: manifestEntry.group,
      staticVariants: Object.entries(manifestEntry.variants)
        .filter(([, variantEntry]) => variantEntry?.staticSupport)
        .map(([variant]) => variant as StaticLobehubIconVariant),
      supportedVariants: [
        'auto',
        ...Object.keys(manifestEntry.variants) as Array<Exclude<LobehubIconVariant, 'auto'>>,
      ],
      title: manifestEntry.title,
    } : undefined,
  };
}

const BUILTIN_ICON_DEFINITIONS = [...buildLobehubDefinitions(), ...buildOpencodeDefinitions()];
const BUILTIN_ICON_BY_SOURCE = new Map(BUILTIN_ICON_DEFINITIONS.map((definition) => [definition.source, definition]));

function computeMatchScore(definition: BuiltinIconDefinition, query: string): number {
  const trimmedQuery = query.trim().toLowerCase();
  if (!trimmedQuery) {
    return 0;
  }

  if (definition.aliases.some((alias) => alias.toLowerCase() === trimmedQuery) || definition.iconId.toLowerCase() === trimmedQuery) {
    return 400;
  }

  const normalizedQuery = normalizeSearchValue(trimmedQuery);
  if (!normalizedQuery) {
    return 0;
  }

  if (definition.normalizedAliases.includes(normalizedQuery)) {
    return 300;
  }

  const queryTokens = tokenize(trimmedQuery);
  if (queryTokens.length > 0 && queryTokens.every((token) => definition.tokens.includes(token))) {
    return 200;
  }

  if (definition.searchText.includes(trimmedQuery) || definition.normalizedAliases.some((value) => value.includes(normalizedQuery))) {
    return 100;
  }

  return -1;
}

function sortDefinitions(left: BuiltinIconDefinition, right: BuiltinIconDefinition): number {
  const libraryComparison = libraryOrder[left.libraryId] - libraryOrder[right.libraryId];
  if (libraryComparison !== 0) {
    return libraryComparison;
  }

  return left.displayName.localeCompare(right.displayName);
}

export function isBuiltinIconLibraryId(value: string): value is BuiltinIconLibraryId {
  return value === 'lobehub' || value === 'opencode';
}

export function formatBuiltinSource(libraryId: BuiltinIconLibraryId, iconId: string): string {
  return `${libraryId}:${iconId}`;
}

export function parseBuiltinSource(source: string): ParsedBuiltinSource | null {
  const parts = source.split(':');
  if (parts.length !== 2) {
    return null;
  }

  const [libraryId, iconId] = parts;
  if (!isBuiltinIconLibraryId(libraryId) || !iconId.trim()) {
    return null;
  }

  return {
    libraryId,
    iconId: iconId.trim(),
  };
}

export function findBuiltinIcon(source: string): BuiltinIconDefinition | null {
  return BUILTIN_ICON_BY_SOURCE.get(source) ?? null;
}

export function getBuiltinIcon(libraryId: BuiltinIconLibraryId, iconId: string): BuiltinIconDefinition | null {
  return findBuiltinIcon(formatBuiltinSource(libraryId, iconId));
}

export function listBuiltinIcons(options: { libraryId?: BuiltinIconLibraryId } = {}): BuiltinIconDefinition[] {
  const items = options.libraryId
    ? BUILTIN_ICON_DEFINITIONS.filter((definition) => definition.libraryId === options.libraryId)
    : BUILTIN_ICON_DEFINITIONS;
  return [...items].sort(sortDefinitions);
}

export function searchBuiltinIcons(
  query: string,
  options: SearchBuiltinIconsOptions = {},
): BuiltinIconDefinition[] {
  const definitions = listBuiltinIcons({ libraryId: options.libraryId });
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return options.limit ? definitions.slice(0, options.limit) : definitions;
  }

  const matched = definitions
    .map((definition) => ({ definition, score: computeMatchScore(definition, trimmedQuery) }))
    .filter((item) => item.score >= 0)
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }

      return sortDefinitions(left.definition, right.definition);
    })
    .map((item) => item.definition);

  return options.limit ? matched.slice(0, options.limit) : matched;
}

export function resolveBuiltinIconMatch(providerId: string): BuiltinIconDefinition | null {
  const normalizedProviderId = normalizeSearchValue(providerId);
  if (!normalizedProviderId) {
    return null;
  }

  const opencodeAliasTarget = OPENCODE_ICON_ALIAS_MAP[normalizedProviderId];
  if (opencodeAliasTarget) {
    return getBuiltinIcon('opencode', opencodeAliasTarget);
  }

  return searchBuiltinIcons(providerId, { limit: 1 })[0] ?? null;
}
