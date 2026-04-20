import { createLogger } from '../../shared';
import type { SdkOutputFormat } from './sdkTypes';
import type { LocalOutputFormat, QueryOptions } from './types';

const logger = createLogger('OpenCodePromptRequestBuilder');

export type PromptRequestPart =
  | {
      id?: string;
      type: 'text';
      text: string;
      synthetic?: boolean;
      ignored?: boolean;
      metadata?: Record<string, unknown>;
    }
  | {
      id?: string;
      type: 'file';
      mime: string;
      filename?: string;
      url: string;
      source?: {
        type: 'file';
        path: string;
        text: {
          value: string;
          start: number;
          end: number;
        };
      };
    };

type PromptRequestOptions = QueryOptions & { system?: string };

type PromptModelSelection = {
  providerID: string;
  modelID: string;
};

export type PromptRequestEntityKind = 'message' | 'part';

export interface PromptBuildInput {
  messageID?: string;
  parts: PromptRequestPart[];
}

export interface BuiltPromptSendPayload {
  messageID: string;
  requestParts: PromptRequestPart[];
  optimisticUserParts: PromptRequestPart[];
}

type PromptSharedOptions = {
  system?: string;
  tools?: Record<string, boolean>;
  variant?: string;
  agent?: string;
  noReply?: boolean;
  format?: LocalOutputFormat;
};

type SharedPromptTarget = {
  system?: string;
  tools?: Record<string, boolean>;
  variant?: string;
  agent?: string;
  noReply?: boolean;
};

type SdkPromptParameters = SharedPromptTarget & {
  sessionID: string;
  model: PromptModelSelection;
  parts: PromptRequestPart[];
  format?: SdkOutputFormat;
};

type LegacyPromptRequestBody = SharedPromptTarget & {
  parts: PromptRequestPart[];
  model: PromptModelSelection & {
    options?: Record<string, unknown>;
  };
  format?: LocalOutputFormat;
};

interface OpenCodePromptRequestBuilderHost {
  createPromptEntityId(kind: PromptRequestEntityKind): string;
  getDefaultModelSelection(): PromptModelSelection;
  observeRuntimeToolNames(toolNames: Iterable<string>): boolean;
}

export class OpenCodePromptRequestBuilder {
  constructor(private readonly host: OpenCodePromptRequestBuilderHost) {}

  buildStructuredPromptSendPayload(input: PromptBuildInput): BuiltPromptSendPayload {
    const messageID = input.messageID?.trim()
      ? input.messageID.trim()
      : this.host.createPromptEntityId('message');
    const requestParts = input.parts.map((part) => this.withStablePartId(part));

    return {
      messageID,
      requestParts,
      optimisticUserParts: requestParts.map((part) => this.clonePromptRequestPart(part)),
    };
  }

  buildSdkPromptParameters(
    sessionId: string,
    parts: PromptRequestPart[],
    options: PromptRequestOptions,
  ): SdkPromptParameters {
    if (options.thinkingBudget !== undefined) {
      logger.debug('thinkingBudget is not currently mapped to the SDK v2 prompt payload and is being omitted', {
        thinkingBudget: options.thinkingBudget,
      });
    }

    const parameters: SdkPromptParameters = {
      sessionID: sessionId,
      model: this.resolveModelSelection(options),
      parts,
    };

    const sharedOptions = this.buildSharedPromptOptions(options);
    this.applyCommonSharedOptions(parameters, sharedOptions);
    if (sharedOptions.format) {
      parameters.format = this.resolveSdkOutputFormat(sharedOptions.format);
    }

    return parameters;
  }

  buildLegacyMessageRequestBody(
    parts: PromptRequestPart[],
    options: PromptRequestOptions,
  ): LegacyPromptRequestBody {
    const requestBody: LegacyPromptRequestBody = {
      parts,
      model: this.resolveModelSelection(options),
    };

    const sharedOptions = this.buildSharedPromptOptions(options);
    this.applyCommonSharedOptions(requestBody, sharedOptions);
    if (sharedOptions.format) {
      requestBody.format = sharedOptions.format;
    }

    return requestBody;
  }

  buildLegacyStreamRequestBody(
    parts: PromptRequestPart[],
    options: PromptRequestOptions,
  ): LegacyPromptRequestBody {
    const modelOptions = this.buildLegacyStreamModelOptions(options);
    const requestBody: LegacyPromptRequestBody = {
      parts,
      model: {
        ...this.resolveModelSelection(options),
        ...(modelOptions ? { options: modelOptions } : {}),
      },
    };

    const sharedOptions = this.buildSharedPromptOptions(options);
    this.applyCommonSharedOptions(requestBody, sharedOptions);
    if (sharedOptions.format) {
      requestBody.format = sharedOptions.format;
    }

    return requestBody;
  }

  private resolveModelSelection(options: QueryOptions): PromptModelSelection {
    const defaults = this.host.getDefaultModelSelection();
    return {
      providerID: options.provider ?? defaults.providerID,
      modelID: options.model ?? defaults.modelID,
    };
  }

  private buildLegacyStreamModelOptions(options: QueryOptions): Record<string, unknown> | undefined {
    const modelOptions: Record<string, unknown> = {};

    if (options.reasoningEffort) {
      modelOptions.reasoningEffort = options.reasoningEffort;
    }

    if (options.thinkingBudget !== undefined) {
      modelOptions.thinking = options.thinkingBudget > 0
        ? {
            type: 'enabled',
            budgetTokens: options.thinkingBudget,
          }
        : {
            type: 'disabled',
          };
    }

    return Object.keys(modelOptions).length > 0 ? modelOptions : undefined;
  }

  private applyCommonSharedOptions(target: SharedPromptTarget, sharedOptions: PromptSharedOptions): void {
    if (sharedOptions.system) {
      target.system = sharedOptions.system;
    }
    if (sharedOptions.tools) {
      target.tools = sharedOptions.tools;
    }
    if (sharedOptions.variant) {
      target.variant = sharedOptions.variant;
    }
    if (sharedOptions.agent) {
      target.agent = sharedOptions.agent;
    }
    if (typeof sharedOptions.noReply === 'boolean') {
      target.noReply = sharedOptions.noReply;
    }
  }

  private buildAllowedToolsRecord(allowedTools?: string[]): Record<string, boolean> | undefined {
    if (!allowedTools || allowedTools.length === 0) {
      return undefined;
    }

    this.host.observeRuntimeToolNames(allowedTools);
    return Object.fromEntries(allowedTools.map((toolName) => [toolName, true]));
  }

  private buildSharedPromptOptions(options: PromptRequestOptions): PromptSharedOptions {
    const sharedOptions: PromptSharedOptions = {};

    const tools = this.buildAllowedToolsRecord(options.allowedTools);
    if (tools) {
      sharedOptions.tools = tools;
    }

    const variant = this.resolveVariant(options);
    if (variant) {
      sharedOptions.variant = variant;
    }

    if (options.system?.trim()) {
      sharedOptions.system = options.system.trim();
    }

    if (typeof options.agent === 'string' && options.agent.trim()) {
      sharedOptions.agent = options.agent.trim();
    }

    if (typeof options.noReply === 'boolean') {
      sharedOptions.noReply = options.noReply;
    }

    const format = this.resolveLocalOutputFormat(options.format);
    if (format) {
      sharedOptions.format = format;
    }

    return sharedOptions;
  }

  private resolveLocalOutputFormat(format?: LocalOutputFormat): LocalOutputFormat | undefined {
    if (!format) {
      return undefined;
    }

    if (format.type === 'text') {
      return { type: 'text' };
    }

    return {
      type: 'json_schema',
      schema: format.schema,
      ...(typeof format.retryCount === 'number' ? { retryCount: format.retryCount } : {}),
    };
  }

  private resolveSdkOutputFormat(format: LocalOutputFormat): SdkOutputFormat {
    if (format.type === 'text') {
      return { type: 'text' };
    }

    return {
      type: 'json_schema',
      schema: format.schema,
      ...(typeof format.retryCount === 'number' ? { retryCount: format.retryCount } : {}),
    };
  }

  private resolveVariant(options: QueryOptions): string | undefined {
    return options.reasoningEffort;
  }

  private withStablePartId(part: PromptRequestPart): PromptRequestPart {
    const next = this.clonePromptRequestPart(part);
    if (!next.id) {
      next.id = this.host.createPromptEntityId('part');
    }
    return next;
  }

  private clonePromptRequestPart(part: PromptRequestPart): PromptRequestPart {
    if (part.type === 'text') {
      return {
        ...part,
        ...(part.metadata ? { metadata: { ...part.metadata } } : {}),
      };
    }

    return {
      ...part,
      ...(part.source ? {
        source: {
          ...part.source,
          text: { ...part.source.text },
        },
      } : {}),
    };
  }
}
