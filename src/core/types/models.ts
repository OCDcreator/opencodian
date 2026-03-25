/**
 * Model-related type definitions
 */

/** Model information */
export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  supportsThinking?: boolean;
  supportsVision?: boolean;
}

/** Model provider */
export interface ModelProvider {
  id: string;
  name: string;
  models: ModelInfo[];
  defaultModelId?: string;
}

/** Default context window sizes */
const DEFAULT_CONTEXT_WINDOWS: Record<string, number> = {
  'claude-3-opus-20240229': 200000,
  'claude-3-5-sonnet-20241022': 200000,
  'claude-3-5-haiku-20241022': 200000,
  'gpt-4': 128000,
  'gpt-4-turbo': 128000,
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
};

/** Get default context window for a model */
export function getDefaultContextWindow(modelId: string): number {
  // Check exact match
  if (DEFAULT_CONTEXT_WINDOWS[modelId]) {
    return DEFAULT_CONTEXT_WINDOWS[modelId];
  }

  // Check partial matches
  if (modelId.includes('claude-3-opus')) return 200000;
  if (modelId.includes('claude-3-5-sonnet')) return 200000;
  if (modelId.includes('claude-3-5-haiku')) return 200000;
  if (modelId.includes('claude-3')) return 200000;
  if (modelId.includes('gpt-4')) return 128000;
  if (modelId.includes('gpt-3.5')) return 16000;

  // Default fallback
  return 128000;
}
