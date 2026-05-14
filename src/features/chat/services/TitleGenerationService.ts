import { parseModelReference, resolveModelSelection } from '../../../core/config/modelConfig';
import type { LocalOutputFormat } from '../../../core/opencode/types';
import {
  buildTitleGenerationPrompt,
  buildTitleGenerationSystemPrompt,
  normalizeTitleGenerationLocale,
} from '../../../core/prompts/titleGeneration';
import type { ChatMessage } from '../../../core/types';
import type OpenCodianPlugin from '../../../main';

const TITLE_MODEL_UNAVAILABLE_ERROR = 'Configured AI title model is unavailable';

export type TitleGenerationResult =
  | { success: true; title: string }
  | { success: false; error: string };

export type TitleGenerationCallback = (
  conversationId: string,
  result: TitleGenerationResult
) => Promise<void>;

export interface TitleGenerationOptions {
  sessionId?: string;
  officialPollAttempts?: number;
  officialPollIntervalMs?: number;
}

const TITLE_GENERATION_OUTPUT_FORMAT: LocalOutputFormat = {
  type: 'json_schema',
  schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
      },
    },
    required: ['title'],
    additionalProperties: false,
  },
};

const OFFICIAL_TITLE_POLL_ATTEMPTS = 12;
const OFFICIAL_TITLE_POLL_INTERVAL_MS = 1_500;
const OPENCODE_DEFAULT_TITLE_PATTERN = /^(New session - |Child session - )\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export class TitleGenerationService {
  private readonly activeGenerations = new Map<string, AbortController>();

  constructor(private readonly plugin: OpenCodianPlugin) {}

  // eslint-disable-next-line max-params -- Existing view seam passes model and callback separately; options are only for official-title polling.
  async generateTitle(
    conversationId: string,
    userMessage: string,
    currentModel: { provider: string; model: string },
    callback: TitleGenerationCallback,
    options: TitleGenerationOptions = {},
  ): Promise<void> {
    this.cancelConversation(conversationId);

    const controller = new AbortController();
    this.activeGenerations.set(conversationId, controller);

    const locale = normalizeTitleGenerationLocale(this.plugin.settings.locale);
    const prompt = buildTitleGenerationPrompt(this.truncateText(userMessage, 600), locale);

    let tempSessionId: string | null = null;

    try {
      const officialTitle = await this.waitForOfficialTitle(conversationId, options, controller.signal);
      if (controller.signal.aborted) {
        return;
      }
      if (officialTitle) {
        await this.safeCallback(callback, conversationId, {
          success: true,
          title: officialTitle,
        });
        return;
      }

      const { provider, model } = await this.resolveModel(currentModel);
      tempSessionId = await this.plugin.openCodeService.createSession('Title Generation', { setCurrent: false });
      const response = await this.plugin.openCodeService.requestAssistantResponse(prompt, {
        sessionId: tempSessionId,
        provider,
        model,
        format: TITLE_GENERATION_OUTPUT_FORMAT,
        system: buildTitleGenerationSystemPrompt(locale),
      });

      if (controller.signal.aborted) {
        return;
      }

      const title = this.extractTitle(response);
      if (!title) {
        await this.safeCallback(callback, conversationId, {
          success: false,
          error: 'Failed to parse title from response',
        });
        return;
      }

      await this.safeCallback(callback, conversationId, { success: true, title });
    } catch (error) {
      if (!controller.signal.aborted) {
        await this.safeCallback(callback, conversationId, {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    } finally {
      this.activeGenerations.delete(conversationId);
      if (tempSessionId) {
        try {
          await this.plugin.openCodeService.deleteSession(tempSessionId);
        } catch {
          // Ignore cleanup failures
        }
      }
    }
  }

  private async waitForOfficialTitle(
    conversationId: string,
    options: TitleGenerationOptions,
    signal: AbortSignal,
  ): Promise<string | null> {
    const sessionId = options.sessionId?.trim()
      ?? await this.resolveConversationSessionId(conversationId);
    if (!sessionId) {
      return null;
    }

    const attempts = Math.max(1, options.officialPollAttempts ?? OFFICIAL_TITLE_POLL_ATTEMPTS);
    const intervalMs = Math.max(0, options.officialPollIntervalMs ?? OFFICIAL_TITLE_POLL_INTERVAL_MS);

    for (let attempt = 0; attempt < attempts; attempt++) {
      if (signal.aborted) {
        return null;
      }

      try {
        const title = await this.readOfficialSessionTitle(sessionId);
        if (title) {
          return title;
        }
      } catch {
        return null;
      }

      if (attempt < attempts - 1 && intervalMs > 0) {
        await this.delay(intervalMs, signal);
      }
    }

    return null;
  }

  private async readOfficialSessionTitle(sessionId: string): Promise<string | null> {
    const sessions = await this.plugin.openCodeService.listSessions();
    const session = sessions.find((item) => item.id === sessionId);
    return typeof session?.title === 'string'
      ? this.normalizeOfficialTitle(session.title)
      : null;
  }

  private async resolveConversationSessionId(conversationId: string): Promise<string | null> {
    try {
      const conversation = await this.plugin.getConversationById(conversationId, {
        preferCache: true,
      });
      return conversation?.openCodeSessionId ?? null;
    } catch {
      return null;
    }
  }

  private normalizeOfficialTitle(rawTitle: string): string | null {
    const title = rawTitle.trim();
    if (!title || OPENCODE_DEFAULT_TITLE_PATTERN.test(title)) {
      return null;
    }

    return title.length > 100 ? `${title.substring(0, 97)}...` : title;
  }

  private async delay(ms: number, signal: AbortSignal): Promise<void> {
    if (ms <= 0 || signal.aborted) {
      return;
    }

    await new Promise<void>((resolve) => {
      const timeout = window.setTimeout(resolve, ms);
      signal.addEventListener('abort', () => {
        window.clearTimeout(timeout);
        resolve();
      }, { once: true });
    });
  }

  cancelConversation(conversationId: string): void {
    const controller = this.activeGenerations.get(conversationId);
    if (!controller) {
      return;
    }

    controller.abort();
    this.activeGenerations.delete(conversationId);
  }

  cancelAll(): void {
    for (const controller of this.activeGenerations.values()) {
      controller.abort();
    }
    this.activeGenerations.clear();
  }

  private async resolveModel(currentModel: { provider: string; model: string }): Promise<{ provider: string; model: string }> {
    const configuredModel = this.plugin.settings.aiTitleModel.trim();
    if (!configuredModel) {
      return currentModel;
    }

    const explicitModel = parseModelReference(configuredModel);
    if (!explicitModel) {
      return currentModel;
    }

    if (!this.plugin.modelConfigService) {
      return explicitModel;
    }

    try {
      const catalogs = await this.plugin.modelConfigService.getCatalogs(
        this.plugin.settings.modelSourceMode,
        this.plugin.settings.disabledModelRefs,
      );
      const resolution = resolveModelSelection(
        catalogs.baseEffective,
        catalogs.effective,
        explicitModel.provider,
        explicitModel.model,
      );
      if (resolution.status === 'available') {
        return explicitModel;
      }
      throw new Error(TITLE_MODEL_UNAVAILABLE_ERROR);
    } catch (error) {
      if (error instanceof Error && error.message === TITLE_MODEL_UNAVAILABLE_ERROR) {
        throw error;
      }
      // Fall back to the current conversation model if availability could not be resolved.
      // An explicitly unavailable model should still fail the title generation flow.
    }

    return {
      provider: currentModel.provider,
      model: currentModel.model,
    };
  }

  private truncateText(text: string, maxLength: number): string {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) {
      return normalized;
    }

    return `${normalized.substring(0, maxLength - 3)}...`;
  }

  private extractTitle(response: ChatMessage | null): string | null {
    const structuredTitle = this.extractStructuredTitle(response?.structured);
    if (structuredTitle) {
      return structuredTitle;
    }

    return this.parseTitle(response?.content ?? '');
  }

  private extractStructuredTitle(structured: unknown): string | null {
    if (!structured || typeof structured !== 'object') {
      return null;
    }

    const title = (structured as { title?: unknown }).title;
    return typeof title === 'string' ? this.normalizeTitleCandidate(title) : null;
  }

  private parseTitle(responseText: string): string | null {
    const firstLine = responseText
      .trim()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);

    if (!firstLine) {
      return null;
    }

    return this.normalizeTitleCandidate(firstLine);
  }

  private normalizeTitleCandidate(rawTitle: string): string | null {
    let title = rawTitle
      .replace(/^title\s*:\s*/i, '')
      .replace(/^["'`]+/, '')
      .replace(/["'`]+$/, '')
      .replace(/^[*-]\s*/, '')
      .trim();

    title = title.replace(/[.!?:;,，。！？；：]+$/u, '').trim();
    if (!title) {
      return null;
    }

    if (title.length > 50) {
      title = `${title.substring(0, 47).trimEnd()}...`;
    }

    return title || null;
  }

  private async safeCallback(
    callback: TitleGenerationCallback,
    conversationId: string,
    result: TitleGenerationResult,
  ): Promise<void> {
    try {
      await callback(conversationId, result);
    } catch {
      // Ignore callback errors
    }
  }
}
