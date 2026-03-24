/**
 * Provider Icon Service
 * 
 * Uses Lobehub Icons (https://lobehub.com/icons) CDN for provider logos
 * CDN URL: https://unpkg.com/@lobehub/icons-static-svg@latest/icons/{id}.svg
 */

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
  
  // Xunfei Spark
  'spark': 'spark',
  
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
  
  // Jamba
  'jamba': 'ai21',
  
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

export class ProviderIconService {
  /**
   * Get icon URL for a provider
   */
  static getIconUrl(providerId: string): string | null {
    const iconId = this.getIconId(providerId);
    if (!iconId) {
      console.log(`[ProviderIconService] No icon found for: ${providerId}`);
      return null;
    }
    const url = `${LOBEHUB_CDN_BASE}/${iconId}.svg`;
    console.log(`[ProviderIconService] Icon for ${providerId}: ${url}`);
    return url;
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
      console.log(`[ProviderIconService] Failed to load icon for: ${providerId}`);
      img.style.display = 'none';
    };
    
    return img;
  }
}
