import {
  buildTitleGenerationPrompt,
  buildTitleGenerationSystemPrompt,
  normalizeTitleGenerationLocale,
} from '../../../core/prompts/titleGeneration';
import type OpenCodianPlugin from '../../../main';

export type TitleGenerationResult =
  | { success: true; title: string }
  | { success: false; error: string };

export type TitleGenerationCallback = (
  conversationId: string,
  result: TitleGenerationResult
) => Promise<void>;

export class TitleGenerationService {
  private readonly activeGenerations = new Map<string, AbortController>();

  constructor(private readonly plugin: OpenCodianPlugin) {}

  async generateTitle(
    conversationId: string,
    userMessage: string,
    currentModel: { provider: string; model: string },
    callback: TitleGenerationCallback,
  ): Promise<void> {
    this.cancelConversation(conversationId);

    const controller = new AbortController();
    this.activeGenerations.set(conversationId, controller);

    const { provider, model } = this.resolveModel(currentModel);
    const locale = normalizeTitleGenerationLocale(this.plugin.settings.locale);
    const prompt = buildTitleGenerationPrompt(this.truncateText(userMessage, 600), locale);

    let tempSessionId: string | null = null;

    try {
      tempSessionId = await this.plugin.openCodeService.createSession('Title Generation', { setCurrent: false });
      const response = await this.plugin.openCodeService.requestAssistantResponse(prompt, {
        sessionId: tempSessionId,
        provider,
        model,
        system: buildTitleGenerationSystemPrompt(locale),
      });

      if (controller.signal.aborted) {
        return;
      }

      const title = this.parseTitle(response?.content ?? '');
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

  private resolveModel(currentModel: { provider: string; model: string }): { provider: string; model: string } {
    const configuredModel = this.plugin.settings.aiTitleModel.trim();
    if (!configuredModel) {
      return currentModel;
    }

    const separatorIndex = configuredModel.indexOf('/');
    if (separatorIndex > 0 && separatorIndex < configuredModel.length - 1) {
      return {
        provider: configuredModel.slice(0, separatorIndex),
        model: configuredModel.slice(separatorIndex + 1),
      };
    }

    return {
      provider: currentModel.provider,
      model: configuredModel,
    };
  }

  private truncateText(text: string, maxLength: number): string {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) {
      return normalized;
    }

    return `${normalized.substring(0, maxLength - 3)}...`;
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

    let title = firstLine
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
