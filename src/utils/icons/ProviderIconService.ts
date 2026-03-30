/**
 * Provider Icon Service
 * 
 * Uses Lobehub Icons (https://lobehub.com/icons) CDN for provider logos
 * CDN URL: https://unpkg.com/@lobehub/icons-static-svg@latest/icons/{id}.svg
 */

import * as fs from 'fs';
import type { App } from 'obsidian';
import { normalizePath, requestUrl } from 'obsidian';
import * as path from 'path';

import type { ProviderIconEntry, ProviderIconLibrary } from '../../core/types';
import { createLogger } from '../../shared';

const logger = createLogger('ProviderIconService');
const loggedIconUrls = new Map<string, string | null>();
const resolvedIconUrls = new Map<string, string | null>();
const inFlightIconLoads = new Map<string, Promise<string | null>>();
const failedIconIds = new Set<string>();

export interface ProviderIconCacheEntry {
  providerId: string;
  entry: ProviderIconEntry;
  iconId: string | null;
  cached: boolean;
  cachePath: string | null;
  iconUrl: string | null;
  isCurrentProvider: boolean;
  isSelected: boolean;
  sourceLabel: string;
}

export interface ProviderIconProviderState {
  providerId: string;
  isCurrentProvider: boolean;
  entries: ProviderIconCacheEntry[];
}

export interface ProviderIconCacheSummary {
  currentProviders: number;
  totalProviders: number;
  cachedProviders: number;
  totalIcons: number;
  cachedIcons: number;
}

interface ResolveIconUrlOptions {
  retryFailed?: boolean;
}

interface LoadedIconAsset {
  data: ArrayBuffer;
  mimeType: string;
}

interface NormalizedCustomSource {
  type: 'url' | 'file';
  source: string;
  localPath?: string;
}

// Map provider IDs to Lobehub icon IDs
const PROVIDER_ICON_MAP: Record<string, string> = {
  // OpenAI
  'openai': 'openai',
  'openai-compatible': 'openai',
  
  // Anthropic/Claude
  'anthropic': 'anthropic',
  'claude': 'claude',
  
  // Google
  'google': 'google',
  'gemini': 'gemini',
  'palm': 'palm',
  'vertexai': 'vertexai',
  
  // DeepSeek
  'deepseek': 'deepseek',
  
  // Zhipu/GLM
  'zhipu': 'zhipu',
  'chatglm': 'chatglm',
  'glm': 'zhipu',
  
  // Alibaba
  'alibaba': 'alibaba',
  'alibabacloud': 'alibabacloud',
  'bailian': 'bailian',
  'qwen': 'qwen',
  'tongyi': 'qwen',
  
  // Baidu
  'baidu': 'baidu',
  'baiducloud': 'baiducloud',
  'wenxin': 'wenxin',
  'ernie': 'wenxin',
  
  // ByteDance
  'bytedance': 'bytedance',
  'doubao': 'doubao',
  'coze': 'coze',
  'capcut': 'capcut',
  'jimeng': 'jimeng',
  
  // Moonshot/Kimi
  'moonshot': 'moonshot',
  'kimi': 'moonshot',
  
  // MiniMax
  'minimax': 'minimax',
  'abab': 'minimax',
  
  // 01.AI
  '01ai': 'zeroone',
  'yi': 'yi',
  
  // Baichuan
  'baichuan': 'baichuan',
  
  // Huawei
  'huawei': 'huawei',
  'huaweicloud': 'huaweicloud',
  'pangu': 'huaweicloud',
  
  // Tencent
  'tencent': 'tencent',
  'tencentcloud': 'tencentcloud',
  'hunyuan': 'hunyuan',
  'yuanbao': 'yuanbao',
  'spark': 'spark',
  
  // SenseTime
  'sensetime': 'sensenova',
  'sensenova': 'sensenova',
  
  // iFlytek
  'iflytek': 'spark',
  'iflytekcloud': 'iflytekcloud',
  
  // Meta
  'meta': 'meta',
  'llama': 'meta',
  
  // Mistral
  'mistral': 'mistral',
  
  // Cohere
  'cohere': 'cohere',
  'aya': 'aya',
  'commanda': 'commanda',
  
  // AI21
  'ai21': 'ai21',
  'jamba': 'ai21',
  
  // xAI
  'xai': 'xai',
  'grok': 'grok',
  
  // Perplexity
  'perplexity': 'perplexity',
  
  // Groq
  'groq': 'groq',
  
  // Together
  'together': 'together',
  
  // Fireworks
  'fireworks': 'fireworks',
  
  // Ollama
  'ollama': 'ollama',
  
  // vLLM
  'vllm': 'vllm',
  
  // Azure
  'azure': 'azure',
  'azureai': 'azureai',
  
  // AWS
  'aws': 'aws',
  'bedrock': 'bedrock',
  'nova': 'nova',
  
  // Cloudflare
  'cloudflare': 'cloudflare',
  'workersai': 'workersai',
  
  // GitHub
  'github': 'github',
  'copilot': 'githubcopilot',
  'opencopilot': 'githubcopilot',
  
  // OpenRouter
  'openrouter': 'openrouter',
  
  // SiliconFlow
  'siliconflow': 'siliconcloud',
  'siliconcloud': 'siliconcloud',
  
  // Nvidia
  'nvidia': 'nvidia',
  'nemotron': 'nvidia',
  
  // Microsoft
  'microsoft': 'microsoft',
  'bing': 'bing',
  
  // Replicate
  'replicate': 'replicate',
  
  // Stability
  'stability': 'stability',
  
  // Midjourney
  'midjourney': 'midjourney',
  
  // Adobe
  'adobe': 'adobe',
  'firefly': 'adobefirefly',
  
  // DALL-E
  'dalle': 'dalle',
  
  // Stability/FLUX
  'flux': 'flux',
  'bfl': 'bfl',
  
  // ElevenLabs
  'elevenlabs': 'elevenlabs',
  
  // Suno
  'suno': 'suno',
  
  // Udio
  'udio': 'udio',
  
  // Pika
  'pika': 'pika',
  
  // Runway
  'runway': 'runway',
  
  // Luma
  'luma': 'luma',
  'dreammachine': 'dreammachine',
  
  // Kling
  'kling': 'kling',
  
  // Krea
  'krea': 'krea',
  
  // Fal
  'fal': 'fal',
  
  // Ideogram
  'ideogram': 'ideogram',
  
  // Recraft
  'recraft': 'recraft',
  
  // Anthropic specific models
  'sonnet': 'claude',
  'opus': 'claude',
  'haiku': 'claude',
  
  // LangChain
  'langchain': 'langchain',
  'langgraph': 'langgraph',
  
  // LlamaIndex
  'llamaindex': 'llamaindex',
  
  // HuggingFace
  'huggingface': 'huggingface',
  
  // Replit
  'replit': 'replit',
  
  // Vercel
  'vercel': 'vercel',
  'v0': 'v0',
  
  // Notion
  'notion': 'notion',
  
  // Figma
  'figma': 'figma',
  
  // Snowflake
  'snowflake': 'snowflake',
  
  // Dify
  'dify': 'dify',
  
  // FastGPT
  'fastgpt': 'fastgpt',
  
  // LobeHub
  'lobehub': 'lobehub',
  
  // OpenCode
  'opencode': 'opencode',
  
  // Cursor
  'cursor': 'cursor',
  
  // Windsurf
  'windsurf': 'windsurf',
  
  // Trae
  'trae': 'trae',
  
  // LM Studio
  'lmstudio': 'lmstudio',
  
  // Jan
  'jan': 'menlo',
  
  // AnythingLLM
  'anythingllm': 'menlo',
  
  // OpenWebUI
  'openwebui': 'openwebui',
  
  // LobeChat
  'lobechat': 'lobehub',
  
  // Cherry Studio
  'cherrystudio': 'cherrystudio',
  
  // OneAPI
  'oneapi': 'newapi',
  'newapi': 'newapi',
  
  // PPIO
  'ppio': 'ppio',
  
  // Volcengine
  'volcengine': 'volcengine',
  
  // StepFun
  'stepfun': 'stepfun',
  
  // Skywork
  'skywork': 'skywork',
  
  // Tiangong
  'tiangong': 'tiangong',
  
  // InternLM
  'internlm': 'internlm',
  
  // Ai360
  'ai360': 'ai360',
  
  // AiHubMix
  'aihubmix': 'aihubmix',
  
  // API2D
  'api2d': 'openai',
  
  // Anthropic Bedrock
  'anthropic-bedrock': 'bedrock',
  
  // Anthropic Vertex
  'anthropic-vertex': 'vertexai',
  
  // Cerebras
  'cerebras': 'cerebras',
  
  // FriendliAI
  'friendli': 'friendli',
  
  // Lambda
  'lambda': 'lambda',
  
  // LeptonAI
  'leptonai': 'leptonai',
  
  // OctoAI
  'octoai': 'lambda',
  
  // Predibase
  'predibase': 'baseten',
  
  // SambaNova
  'sambanova': 'sambanova',
  
  // Targon
  'targon': 'targon',
  
  // Tii (Falcon)
  'tii': 'tii',
  'falcon': 'tii',
  
  // Upstage
  'upstage': 'upstage',
  
  // Writer
  'writer': 'palm',
  
  // Zephyr
  'zephyr': 'huggingface',
  
  // Yi
  'yi-01': 'yi',
  
  // DeepInfra
  'deepinfra': 'deepinfra',
  
  // MonsterAPI
  'monsterapi': 'deepinfra',
  
  // AI71
  'ai71': 'falcon',
  
  // Cloudflare Workers AI
  'cloudflare-ai': 'cloudflare',
  
  // Azure OpenAI
  'azure-openai': 'azure',
  
  // GCP Vertex AI
  'gcp-vertex': 'vertexai',
  
  // Amazon Bedrock
  'amazon-bedrock': 'bedrock',
  
  // IBM Watson
  'ibm': 'ibm',
  'watson': 'ibm',
  
  // Oracle
  'oracle': 'aws',
  
  // Salesforce
  'salesforce': 'salesforce',
  
  // SAP
  'sap': 'salesforce',
  
  // Alibaba Qwen
  'qwen-max': 'qwen',
  'qwen-plus': 'qwen',
  'qwen-turbo': 'qwen',
  
  // Baidu ERNIE
  'ernie-bot': 'wenxin',
  'ernie-bot-turbo': 'wenxin',
  'ernie-bot-4': 'wenxin',
  
  // Zhipu GLM
  'glm-4': 'zhipu',
  'glm-3': 'zhipu',
  'chatglm-4': 'chatglm',
  'chatglm-3': 'chatglm',
  
  // MiniMax
  'abab6': 'minimax',
  'abab5': 'minimax',
  
  // Moonshot
  'moonshot-v1': 'moonshot',
  
  // 01.AI
  'yi-large': 'yi',
  'yi-medium': 'yi',
  'yi-spark': 'yi',
  
  // Baichuan
  'baichuan2': 'baichuan',
  'baichuan3': 'baichuan',
  
  // SenseTime
  'sensechat': 'sensenova',
  
  // iFlytek
  'spark-desk': 'spark',
  
  // Huawei
  'pangu-2': 'huaweicloud',
  'pangu-3': 'huaweicloud',
  
  // Tencent
  'hunyuan-pro': 'hunyuan',
  'hunyuan-standard': 'hunyuan',
  'hunyuan-lite': 'hunyuan',
  
  // StepFun
  'step-1': 'stepfun',
  'step-2': 'stepfun',
  
  // Skywork
  'skywork-gpt': 'skywork',
  
  // InternLM
  'internlm2': 'internlm',
  'internlm-chat': 'internlm',
  
  // DeepSeek
  'deepseek-chat': 'deepseek',
  'deepseek-coder': 'deepseek',
  
  // OpenChat
  'openchat': 'openchat',
  
  // Dolphin
  'dolphin': 'dolphin',
  
  // NousResearch
  'nous': 'nousresearch',
  'hermes': 'nousresearch',
  
  // WizardLM
  'wizardlm': 'microsoft',
  
  // Vicuna
  'vicuna': 'lmsys',
  
  // LMSYS
  'lmsys': 'lmsys',
  
  // Together AI
  'togetherai': 'together',
  
  // Anyscale
  'anyscale': 'anyscale',
  
  // Banana
  'banana': 'nanobanana',
  
  // Baseten
  'baseten': 'baseten',
  
  // CoreWeave
  'coreweave': 'coreweave',
  
  // Crusoe
  'crusoe': 'crusoe',
  
  // Foundry
  'foundry': 'foundry',
  
  // GooseAI
  'gooseai': 'goose',
  
  // Gradient
  'gradient': 'gradient',
  
  // Hyperbolic
  'hyperbolic': 'hyperbolic',
  
  // Mystic
  'mystic': 'mystic',
  
  // Novita AI
  'novita': 'novita',
  
  // Perplexity Labs
  'pplx': 'perplexity',
  
  // Pi
  'pi': 'inflection',
  
  // Poe
  'poe': 'poe',
  
  // Reka
  'reka': 'reka',
  
  // ShuttleAI
  'shuttleai': 'shuttleai',
  
  // StochasticAI
  'stochasticai': 'stochasticai',
  
  // TheB.AI
  'thebai': 'thebai',
  
  // TitanML
  'titanml': 'titanml',
  
  // YandexGPT
  'yandexgpt': 'yandex',
  
  // You.com
  'you': 'youmind',
  
  // Claude API
  'claude-api': 'claude',
  
  // GPT-4
  'gpt-4': 'openai',
  'gpt-4o': 'openai',
  'gpt-4-turbo': 'openai',
  'gpt-3.5': 'openai',
  'gpt-3.5-turbo': 'openai',
  
  // Gemini
  'gemini-pro': 'gemini',
  'gemini-ultra': 'gemini',
  'gemini-1.5': 'gemini',
  
  // Llama
  'llama-2': 'meta',
  'llama-3': 'meta',
  'llama-3.1': 'meta',
  'llama-3.2': 'meta',
  'llama-4': 'meta',
  
  // Mixtral
  'mixtral': 'mistral',
  'mixtral-8x7b': 'mistral',
  'mixtral-8x22b': 'mistral',
  
  // Mistral models
  'mistral-tiny': 'mistral',
  'mistral-small': 'mistral',
  'mistral-medium': 'mistral',
  'mistral-large': 'mistral',
  
  // CodeLlama
  'codellama': 'meta',
  
  // Phi
  'phi-2': 'microsoft',
  'phi-3': 'microsoft',
  
  // Gemma
  'gemma': 'gemma',
  'gemma-2': 'gemma',
  'gemma-3': 'gemma',
  
  // Qwen models
  'qwen-72b': 'qwen',
  'qwen-110b': 'qwen',
  'qwen-1.5': 'qwen',
  'qwen-2': 'qwen',
  'qwen-2.5': 'qwen',
  'qwen-coder': 'qwen',
  
  // Yi models
  'yi-34b': 'yi',
  
  // DBRX
  'dbrx': 'dbrx',
  
  // Command R
  'command-r': 'cohere',
  'command-r-plus': 'cohere',
  
  // Claude models
  'claude-3-opus': 'claude',
  'claude-3-sonnet': 'claude',
  'claude-3-haiku': 'claude',
  'claude-3.5-sonnet': 'claude',
  'claude-3.5-haiku': 'claude',
  
  // Grok models
  'grok-1': 'grok',
  'grok-2': 'grok',
  
  // Perplexity models
  'pplx-7b': 'perplexity',
  'pplx-70b': 'perplexity',
  'sonar-small': 'perplexity',
  'sonar-medium': 'perplexity',
  'sonar-large': 'perplexity',
};

// CDN base URL for Lobehub icons
const LOBEHUB_CDN_BASE = 'https://unpkg.com/@lobehub/icons-static-svg@latest/icons';
const ICON_CACHE_DIR = '.opencodian/provider-icons';
const MAX_ICON_BYTES = 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/svg+xml',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);
const MIME_TYPE_TO_EXTENSION: Record<string, string> = {
  'image/svg+xml': 'svg',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export class ProviderIconService {
  /**
   * Get icon URL for a provider
   */
  static getIconUrl(providerId: string): string | null {
    const iconId = this.getIconId(providerId);
    if (!iconId) {
      return null;
    }

    return `${LOBEHUB_CDN_BASE}/${iconId}.svg`;
  }

  static async resolveIconUrl(
    app: App,
    providerId: string,
    library: ProviderIconLibrary = {},
    options: ResolveIconUrlOptions = {},
  ): Promise<string | null> {
    const entry = this.getEffectiveEntries(providerId, library)[0] ?? null;
    if (!entry) {
      if (loggedIconUrls.get(providerId) !== null) {
        logger.debug(`No icon found for: ${providerId}`);
        loggedIconUrls.set(providerId, null);
      }
      return null;
    }

    return this.resolveEntryUrl(app, providerId, entry, options);
  }
  
  /**
   * Get icon ID for a provider
   * Tries multiple normalization strategies for better matching
   */
  static getIconId(providerId: string): string | null {
    if (!providerId) return null;
    
    // Strategy 1: Direct lowercase match
    const lowerId = providerId.toLowerCase();
    if (PROVIDER_ICON_MAP[lowerId]) {
      return PROVIDER_ICON_MAP[lowerId];
    }
    
    // Strategy 2: Remove spaces and special chars, keep alphanumeric
    const normalizedId = lowerId.replace(/[^a-z0-9]/g, '');
    if (PROVIDER_ICON_MAP[normalizedId]) {
      return PROVIDER_ICON_MAP[normalizedId];
    }
    
    // Strategy 3: Extract English parts (for names like "AiHubMix (推理时代)")
    const englishParts = lowerId.match(/[a-z]+/g);
    if (englishParts) {
      // Try each English part
      for (const part of englishParts) {
        if (part.length < 2) continue; // Skip single letters
        if (PROVIDER_ICON_MAP[part]) {
          return PROVIDER_ICON_MAP[part];
        }
      }
      
      // Try combined English parts
      const combined = englishParts.join('');
      if (PROVIDER_ICON_MAP[combined]) {
        return PROVIDER_ICON_MAP[combined];
      }
    }
    
    // Strategy 4: Partial match - check if any key is contained in the providerId
    for (const [key, value] of Object.entries(PROVIDER_ICON_MAP)) {
      if (normalizedId.includes(key) || lowerId.includes(key)) {
        return value;
      }
    }
    
    // Strategy 5: Reverse partial match - check if providerId is contained in any key
    for (const [key, value] of Object.entries(PROVIDER_ICON_MAP)) {
      if (key.includes(normalizedId) || key.includes(lowerId)) {
        return value;
      }
    }
    
    return null;
  }
  
  /**
   * Check if provider has an icon
   */
  static hasIcon(providerId: string): boolean {
    return this.getIconId(providerId) !== null;
  }

  /**
   * Build state for current and persisted provider icon entries using local cache only.
   */
  static async getProviderCacheState(
    app: App,
    currentProviderIds: string[],
    library: ProviderIconLibrary = {},
  ): Promise<{ providers: ProviderIconProviderState[]; summary: ProviderIconCacheSummary }> {
    const currentProviders = this.uniqueProviderIds(currentProviderIds);
    const allProviders = this.mergeProviderIds(currentProviders, Object.keys(library));

    const providers = await Promise.all(allProviders.map(async (providerId) => {
      const entries = await this.getProviderCacheEntries(app, providerId, library, currentProviders.includes(providerId));
      return {
        providerId,
        isCurrentProvider: currentProviders.includes(providerId),
        entries,
      } satisfies ProviderIconProviderState;
    }));

    providers.sort((left, right) => {
      if (left.isCurrentProvider !== right.isCurrentProvider) {
        return left.isCurrentProvider ? -1 : 1;
      }
      return left.providerId.localeCompare(right.providerId);
    });

    const totalIcons = providers.reduce((sum, provider) => sum + provider.entries.length, 0);
    const cachedIcons = providers.reduce(
      (sum, provider) => sum + provider.entries.filter((entry) => entry.cached).length,
      0,
    );
    const cachedProviders = providers.filter((provider) => provider.entries.some((entry) => entry.cached)).length;

    return {
      providers,
      summary: {
        currentProviders: currentProviders.length,
        totalProviders: providers.length,
        cachedProviders,
        totalIcons,
        cachedIcons,
      },
    };
  }

  /**
   * Ensure the default mapped entry is persisted for providers that should survive provider-list changes.
   */
  static persistDefaultEntries(
    providerIds: string[],
    library: ProviderIconLibrary,
  ): ProviderIconLibrary {
    let nextLibrary = { ...library };

    for (const providerId of this.uniqueProviderIds(providerIds)) {
      if (this.resolveLibraryProviderId(providerId, nextLibrary)) {
        continue;
      }

      const defaultEntry = this.getDefaultEntry(providerId);
      if (!defaultEntry) {
        continue;
      }

      nextLibrary = {
        ...nextLibrary,
        [providerId]: [defaultEntry],
      };
    }

    return nextLibrary;
  }

  static async addCustomIconSource(
    app: App,
    providerId: string,
    sourceInput: string,
    library: ProviderIconLibrary,
  ): Promise<ProviderIconLibrary> {
    const normalizedProviderId = providerId.trim();
    if (!normalizedProviderId) {
      throw new Error('Provider ID is required.');
    }

    const storedProviderId = this.resolveLibraryProviderId(normalizedProviderId, library) ?? normalizedProviderId;
    const normalizedSource = this.normalizeCustomSource(sourceInput);
    const existingEntries = this.getEffectiveEntries(storedProviderId, library);
    if (existingEntries.some((entry) => entry.type !== 'mapped' && entry.source === normalizedSource.source)) {
      throw new Error('This icon source has already been added for the provider.');
    }

    const asset = await this.loadCustomSourceAsset(normalizedSource);
    const cacheFileName = this.buildCustomCacheFileName(normalizedProviderId, asset.mimeType);
    const entry: ProviderIconEntry = {
      id: this.createEntryId(),
      type: normalizedSource.type,
      source: normalizedSource.source,
      mimeType: asset.mimeType,
      cacheFileName,
      addedAt: Date.now(),
      updatedAt: Date.now(),
    };

    await this.writeCachedAsset(app, normalizePath(`${ICON_CACHE_DIR}/${cacheFileName}`), asset.data);
    failedIconIds.delete(this.getEntryRuntimeKey(normalizedProviderId, entry));

    return {
      ...library,
      [storedProviderId]: [...existingEntries, entry],
    };
  }

  static updateProviderEntries(
    providerId: string,
    entries: ProviderIconEntry[],
    library: ProviderIconLibrary,
  ): ProviderIconLibrary {
    const requestedProviderId = providerId.trim();
    if (!requestedProviderId) {
      return library;
    }
    const normalizedProviderId = this.resolveLibraryProviderId(requestedProviderId, library) ?? requestedProviderId;

    const sanitizedEntries = entries.filter((entry, index, collection) =>
      Boolean(entry.id)
      && Boolean(entry.source)
      && collection.findIndex((candidate) => candidate.id === entry.id) === index,
    );

    if (sanitizedEntries.length === 0) {
      const nextLibrary = { ...library };
      delete nextLibrary[normalizedProviderId];
      return nextLibrary;
    }

    return {
      ...library,
      [normalizedProviderId]: sanitizedEntries,
    };
  }

  static removeProviderEntry(
    providerId: string,
    entryId: string,
    library: ProviderIconLibrary,
  ): ProviderIconLibrary {
    const resolvedProviderId = this.resolveLibraryProviderId(providerId, library) ?? providerId;
    const nextEntries = (library[resolvedProviderId] ?? []).filter((entry) => entry.id !== entryId);
    return this.updateProviderEntries(providerId, nextEntries, library);
  }

  static async clearCache(app: App): Promise<number> {
    resolvedIconUrls.clear();
    inFlightIconLoads.clear();
    loggedIconUrls.clear();
    failedIconIds.clear();

    const adapter = app.vault.adapter;
    const cacheDir = normalizePath(ICON_CACHE_DIR);

    try {
      const exists = await adapter.exists(cacheDir);
      if (!exists) {
        return 0;
      }

      const listing = await adapter.list(cacheDir);
      let removedCount = 0;

      for (const file of listing.files) {
        try {
          await adapter.remove(file);
          removedCount += 1;
        } catch (error) {
          logger.debug(`Failed to remove cached icon: ${file}`, error);
        }
      }

      logger.debug(`Cleared provider icon cache: removed ${removedCount} file(s)`);
      return removedCount;
    } catch (error) {
      logger.warn('Failed to clear provider icon cache', error);
      throw error;
    }
  }

  /**
   * Preload icons for a set of providers into the local cache.
   */
  static async warmProviderIcons(
    app: App,
    providerIds: string[],
    library: ProviderIconLibrary = {},
  ): Promise<{ total: number; supported: number; cached: number; failed: number }> {
    const uniqueProviderIds = this.uniqueProviderIds(providerIds);

    let supported = 0;
    let cached = 0;
    let failed = 0;

    for (const providerId of uniqueProviderIds) {
      const entries = this.getEffectiveEntries(providerId, library);
      if (entries.length === 0) {
        continue;
      }

      supported += 1;
      const iconUrl = await this.resolveIconUrl(app, providerId, library, { retryFailed: true });
      if (iconUrl) {
        cached += 1;
      } else {
        failed += 1;
      }
    }

    logger.debug(
      `Warm provider icons complete: total=${uniqueProviderIds.length}, supported=${supported}, cached=${cached}, failed=${failed}`,
    );

    return {
      total: uniqueProviderIds.length,
      supported,
      cached,
      failed,
    };
  }
  
  /**
   * Create an img element with the provider icon
   */
  static createIconElement(providerId: string, size: number = 16): HTMLElement | null {
    const iconUrl = this.getIconUrl(providerId);
    if (!iconUrl) return null;
    
    const img = document.createElement('img');
    img.src = iconUrl;
    img.width = size;
    img.height = size;
    img.style.width = `${size}px`;
    img.style.height = `${size}px`;
    img.style.objectFit = 'contain';
    img.alt = providerId;
    
    // Add error handler to fallback to default icon
    img.onerror = () => {
      logger.debug(`Failed to load icon for: ${providerId}`);
      img.style.display = 'none';
    };
    
    return img;
  }

  private static async getProviderCacheEntries(
    app: App,
    providerId: string,
    library: ProviderIconLibrary,
    isCurrentProvider: boolean,
  ): Promise<ProviderIconCacheEntry[]> {
    const entries = this.getEffectiveEntries(providerId, library);
    return Promise.all(entries.map(async (entry, index) => {
      const cachedAsset = await this.readCachedAsset(app, entry);
      return {
        providerId,
        entry,
        iconId: entry.type === 'mapped' ? entry.source : null,
        cached: cachedAsset !== null,
        cachePath: this.getCachePathForEntry(entry),
        iconUrl: cachedAsset ? this.assetToDataUrl(cachedAsset) : null,
        isCurrentProvider,
        isSelected: index === 0,
        sourceLabel: this.getEntrySourceLabel(entry),
      } satisfies ProviderIconCacheEntry;
    }));
  }

  private static getEffectiveEntries(
    providerId: string,
    library: ProviderIconLibrary,
  ): ProviderIconEntry[] {
    const resolvedProviderId = this.resolveLibraryProviderId(providerId, library);
    const savedEntries = resolvedProviderId ? (library[resolvedProviderId] ?? []) : [];
    if (savedEntries.length === 0) {
      const defaultEntry = this.getDefaultEntry(providerId);
      return defaultEntry ? [defaultEntry] : [];
    }

    const defaultEntry = this.getDefaultEntry(providerId);
    const hasMappedEntry = savedEntries.some((entry) => entry.type === 'mapped');
    if (!defaultEntry || hasMappedEntry) {
      return [...savedEntries];
    }

    return [...savedEntries, defaultEntry];
  }

  private static getDefaultEntry(providerId: string): ProviderIconEntry | null {
    const iconId = this.getIconId(providerId);
    if (!iconId) {
      return null;
    }

    return {
      id: `mapped:${iconId}`,
      type: 'mapped',
      source: iconId,
      mimeType: 'image/svg+xml',
      addedAt: 0,
    };
  }

  private static async resolveEntryUrl(
    app: App,
    providerId: string,
    entry: ProviderIconEntry,
    options: ResolveIconUrlOptions,
  ): Promise<string | null> {
    const runtimeKey = this.getEntryRuntimeKey(providerId, entry);
    if (resolvedIconUrls.has(runtimeKey)) {
      return resolvedIconUrls.get(runtimeKey) ?? null;
    }

    if (options.retryFailed) {
      failedIconIds.delete(runtimeKey);
    } else if (failedIconIds.has(runtimeKey)) {
      return null;
    }

    const inFlight = inFlightIconLoads.get(runtimeKey);
    if (inFlight) {
      return inFlight;
    }

    const loadPromise = this.loadEntryUrl(app, providerId, entry);
    inFlightIconLoads.set(runtimeKey, loadPromise);

    try {
      const resolvedUrl = await loadPromise;
      if (resolvedUrl) {
        resolvedIconUrls.set(runtimeKey, resolvedUrl);
      } else {
        resolvedIconUrls.delete(runtimeKey);
      }
      return resolvedUrl;
    } finally {
      inFlightIconLoads.delete(runtimeKey);
    }
  }

  private static async loadEntryUrl(
    app: App,
    providerId: string,
    entry: ProviderIconEntry,
  ): Promise<string | null> {
    const runtimeKey = this.getEntryRuntimeKey(providerId, entry);
    const cachedAsset = await this.readCachedAsset(app, entry);
    if (cachedAsset) {
      failedIconIds.delete(runtimeKey);
      const localUrl = this.assetToDataUrl(cachedAsset);
      loggedIconUrls.set(providerId, localUrl);
      return localUrl;
    }

    try {
      const asset = entry.type === 'mapped'
        ? await this.loadMappedAsset(entry.source, providerId)
        : await this.loadCustomSourceAsset(this.normalizeCustomSource(entry.source, entry.type));
      await this.writeCachedAsset(app, this.getCachePathForEntry(entry), asset.data);
      failedIconIds.delete(runtimeKey);
      const localUrl = this.assetToDataUrl(asset);
      loggedIconUrls.set(providerId, localUrl);
      return localUrl;
    } catch (error) {
      failedIconIds.add(runtimeKey);
      logger.warn(`Failed to fetch icon for ${providerId}`, error);
      return null;
    }
  }

  private static async loadMappedAsset(iconId: string, providerId: string): Promise<LoadedIconAsset> {
    const remoteUrl = `${LOBEHUB_CDN_BASE}/${iconId}.svg`;
    const response = await requestUrl({
      url: remoteUrl,
      method: 'GET',
      throw: false,
    });

    if (response.status >= 400) {
      throw new Error(`HTTP ${response.status} while fetching ${providerId}`);
    }

    const mimeType = this.detectMimeType(response.arrayBuffer, response.headers['content-type'], remoteUrl);
    if (mimeType !== 'image/svg+xml') {
      throw new Error('Default mapped icon did not return valid SVG content.');
    }

    return {
      data: response.arrayBuffer,
      mimeType,
    };
  }

  private static async loadCustomSourceAsset(source: NormalizedCustomSource): Promise<LoadedIconAsset> {
    return source.type === 'url'
      ? this.loadRemoteCustomAsset(source.source)
      : this.loadLocalCustomAsset(source.localPath ?? source.source);
  }

  private static async loadRemoteCustomAsset(source: string): Promise<LoadedIconAsset> {
    const response = await requestUrl({
      url: source,
      method: 'GET',
      throw: false,
    });

    if (response.status >= 400) {
      throw new Error(`HTTP ${response.status} while fetching custom icon.`);
    }

    this.assertByteLength(response.arrayBuffer.byteLength);
    const mimeType = this.detectMimeType(response.arrayBuffer, response.headers['content-type'], source);
    return {
      data: response.arrayBuffer,
      mimeType,
    };
  }

  private static async loadLocalCustomAsset(localPath: string): Promise<LoadedIconAsset> {
    const stats = await fs.promises.stat(localPath);
    if (!stats.isFile()) {
      throw new Error('The provided local icon path is not a file.');
    }

    this.assertByteLength(stats.size);
    const buffer = await fs.promises.readFile(localPath);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const mimeType = this.detectMimeType(arrayBuffer, undefined, localPath);
    return {
      data: arrayBuffer,
      mimeType,
    };
  }

  private static async readCachedAsset(app: App, entry: ProviderIconEntry): Promise<LoadedIconAsset | null> {
    const cachePath = this.getCachePathForEntry(entry);
    if (!cachePath) {
      return null;
    }

    try {
      const adapter = app.vault.adapter;
      const exists = await adapter.exists(cachePath);
      if (!exists) {
        return null;
      }

      const readBinary = adapter.readBinary?.bind(adapter) as undefined | ((path: string) => Promise<ArrayBuffer>);
      if (!readBinary) {
        return null;
      }

      const data = await readBinary(cachePath);
      return {
        data,
        mimeType: entry.mimeType ?? this.getMimeTypeFromPath(cachePath) ?? 'image/svg+xml',
      };
    } catch (error) {
      logger.debug(`Failed to read cached icon: ${cachePath}`, error);
      return null;
    }
  }

  private static async writeCachedAsset(app: App, cachePath: string | null, data: ArrayBuffer): Promise<void> {
    if (!cachePath) {
      return;
    }

    try {
      const adapter = app.vault.adapter;
      const dirExists = await adapter.exists(normalizePath(ICON_CACHE_DIR));
      if (!dirExists) {
        await adapter.mkdir(normalizePath(ICON_CACHE_DIR));
      }

      const writeBinary = adapter.writeBinary?.bind(adapter) as undefined | ((path: string, data: ArrayBuffer) => Promise<void>);
      if (!writeBinary) {
        throw new Error('Vault adapter does not support binary icon cache writes.');
      }

      await writeBinary(cachePath, data);
    } catch (error) {
      logger.debug(`Failed to write cached icon: ${cachePath}`, error);
      throw error;
    }
  }

  private static normalizeCustomSource(
    sourceInput: string,
    expectedType?: 'url' | 'file',
  ): NormalizedCustomSource {
    const source = this.stripEnclosingQuotes(sourceInput.trim());
    if (!source) {
      throw new Error('Please paste a non-empty local path or URL.');
    }

    if (source.length > 2048) {
      throw new Error('The icon source is too long.');
    }

    if (this.isAbsoluteLocalPath(source)) {
      if (expectedType && expectedType !== 'file') {
        throw new Error('Expected a URL, but received a local file path.');
      }

      return { type: 'file', source, localPath: source };
    }

    const maybeUrl = this.tryParseUrl(source);
    if (maybeUrl) {
      if (maybeUrl.protocol === 'http:' || maybeUrl.protocol === 'https:') {
        if (expectedType && expectedType !== 'url') {
          throw new Error('Expected a local file path, but received a URL.');
        }
        return { type: 'url', source: maybeUrl.toString() };
      }

      if (maybeUrl.protocol === 'file:') {
        if (expectedType && expectedType !== 'file') {
          throw new Error('Expected a URL, but received a local file path.');
        }
        return { type: 'file', source: maybeUrl.toString(), localPath: decodeURIComponent(maybeUrl.pathname.replace(/^\/([A-Za-z]:)/, '$1')) };
      }

      throw new Error('Only http(s) URLs and local file paths are allowed.');
    }

    if (!this.isAbsoluteLocalPath(source)) {
      throw new Error('Please use an absolute local file path or a full URL.');
    }

    if (expectedType && expectedType !== 'file') {
      throw new Error('Expected a URL, but received a local file path.');
    }

    return { type: 'file', source, localPath: source };
  }

  private static tryParseUrl(source: string): URL | null {
    try {
      return new URL(source);
    } catch {
      return null;
    }
  }

  private static isAbsoluteLocalPath(source: string): boolean {
    return path.isAbsolute(source) || /^[A-Za-z]:[\\/]/.test(source);
  }

  private static detectMimeType(buffer: ArrayBuffer, headerValue?: string, sourceHint?: string): string {
    const normalizedHeader = headerValue?.split(';')[0]?.trim().toLowerCase();
    if (normalizedHeader && ALLOWED_IMAGE_MIME_TYPES.has(normalizedHeader)) {
      return normalizedHeader;
    }

    const bytes = new Uint8Array(buffer);
    const prefix = Buffer.from(bytes.slice(0, Math.min(bytes.length, 2048)))
      .toString('utf-8')
      .replace(/^\uFEFF/, '')
      .trimStart();
    if (/<svg[\s>]/i.test(prefix) || (/^<\?xml/i.test(prefix) && /\.svg$/i.test(sourceHint ?? ''))) {
      return 'image/svg+xml';
    }

    if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      return 'image/png';
    }

    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return 'image/jpeg';
    }

    if (bytes.length >= 6) {
      const signature = Buffer.from(bytes.slice(0, 6)).toString('ascii');
      if (signature === 'GIF87a' || signature === 'GIF89a') {
        return 'image/gif';
      }
    }

    if (bytes.length >= 12) {
      const riff = Buffer.from(bytes.slice(0, 4)).toString('ascii');
      const webp = Buffer.from(bytes.slice(8, 12)).toString('ascii');
      if (riff === 'RIFF' && webp === 'WEBP') {
        return 'image/webp';
      }
    }

    const fromPath = this.getMimeTypeFromPath(sourceHint);
    if (fromPath) {
      return fromPath;
    }

    throw new Error('Only SVG, PNG, JPEG, WEBP, and GIF icon files are supported.');
  }

  private static getMimeTypeFromPath(sourceHint?: string): string | null {
    if (!sourceHint) {
      return null;
    }

    const extension = path.extname(sourceHint).toLowerCase();
    switch (extension) {
      case '.svg':
        return 'image/svg+xml';
      case '.png':
        return 'image/png';
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.webp':
        return 'image/webp';
      case '.gif':
        return 'image/gif';
      default:
        return null;
    }
  }

  private static buildCustomCacheFileName(providerId: string, mimeType: string): string {
    const extension = MIME_TYPE_TO_EXTENSION[mimeType];
    const safeProvider = providerId.replace(/[^a-z0-9_-]/gi, '-').slice(0, 48) || 'provider';
    return `${safeProvider}-${this.createEntryId()}.${extension}`;
  }

  private static createEntryId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private static getCachePathForEntry(entry: ProviderIconEntry): string | null {
    if (entry.type === 'mapped') {
      return normalizePath(`${ICON_CACHE_DIR}/${entry.source}.svg`);
    }

    if (!entry.cacheFileName) {
      return null;
    }

    return normalizePath(`${ICON_CACHE_DIR}/${entry.cacheFileName}`);
  }

  private static getEntryRuntimeKey(providerId: string, entry: ProviderIconEntry): string {
    return `${providerId}::${entry.id}`;
  }

  private static assetToDataUrl(asset: LoadedIconAsset): string {
    const base64 = Buffer.from(asset.data).toString('base64');
    return `data:${asset.mimeType};base64,${base64}`;
  }

  private static getEntrySourceLabel(entry: ProviderIconEntry): string {
    if (entry.type === 'mapped') {
      return `LobeHub / ${entry.source}`;
    }

    return entry.source;
  }

  private static uniqueProviderIds(providerIds: string[]): string[] {
    return Array.from(new Set(
      providerIds
        .map((providerId) => providerId.trim())
        .filter(Boolean),
    ));
  }

  private static mergeProviderIds(currentProviderIds: string[], savedProviderIds: string[]): string[] {
    const merged: string[] = [];
    const seen = new Set<string>();

    for (const providerId of [...currentProviderIds, ...savedProviderIds]) {
      const trimmedProviderId = providerId.trim();
      if (!trimmedProviderId) {
        continue;
      }

      const canonicalKey = this.getCanonicalProviderKey(trimmedProviderId);
      if (seen.has(canonicalKey)) {
        continue;
      }

      seen.add(canonicalKey);
      merged.push(trimmedProviderId);
    }

    return merged;
  }

  private static resolveLibraryProviderId(
    providerId: string,
    library: ProviderIconLibrary,
  ): string | null {
    const trimmedProviderId = providerId.trim();
    if (!trimmedProviderId) {
      return null;
    }

    if (Object.prototype.hasOwnProperty.call(library, trimmedProviderId)) {
      return trimmedProviderId;
    }

    const canonicalKey = this.getCanonicalProviderKey(trimmedProviderId);
    for (const savedProviderId of Object.keys(library)) {
      if (this.getCanonicalProviderKey(savedProviderId) === canonicalKey) {
        return savedProviderId;
      }
    }

    return null;
  }

  private static getCanonicalProviderKey(providerId: string): string {
    return providerId.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private static stripEnclosingQuotes(source: string): string {
    if (source.length >= 2) {
      const firstChar = source[0];
      const lastChar = source[source.length - 1];
      if ((firstChar === '"' && lastChar === '"') || (firstChar === '\'' && lastChar === '\'')) {
        return source.slice(1, -1).trim();
      }
    }

    return source;
  }

  private static assertByteLength(byteLength: number): void {
    if (byteLength > MAX_ICON_BYTES) {
      throw new Error('The icon file is too large. Maximum size is 1 MB.');
    }
  }
}
