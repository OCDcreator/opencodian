import type { SdkOutputFormat } from './sdkTypes';
import type { LocalOutputFormat, QueryOptions } from './types';

const OPEN_CODE_ID_RANDOM_LENGTH = 14;
const OPEN_CODE_ID_RANDOM_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const OPEN_CODE_ID_TIMESTAMP_MULTIPLIER = 0x1000;
const OPEN_CODE_ID_TIMESTAMP_MODULUS = 0x1000000000000;

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
    }
  | {
      id?: string;
      type: 'agent';
      name: string;
      source?: {
        value: string;
        start: number;
        end: number;
      };
    }
  | {
      id?: string;
      type: 'subtask';
      description: string;
      prompt: string;
      agent: string;
      model?: {
        providerID: string;
        modelID: string;
      };
      command?: string;
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
  syntheticTextParts?: PromptSyntheticTextPartInput[];
  invocationParts?: readonly PromptRequestPart[];
}

export interface BuiltPromptSendPayload {
  messageID: string;
  requestParts: PromptRequestPart[];
  optimisticUserParts: PromptRequestPart[];
}

export interface PromptSyntheticTextPartInput {
  id?: string;
  text: string;
  ignored?: boolean;
  metadata?: Record<string, unknown>;
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
  messageID?: string;
  model: PromptModelSelection;
  parts: PromptRequestPart[];
  format?: SdkOutputFormat;
};

type LegacyPromptRequestBody = SharedPromptTarget & {
  messageID?: string;
  parts: PromptRequestPart[];
  model: PromptModelSelection & {
    options?: Record<string, unknown>;
  };
  format?: LocalOutputFormat;
};

interface OpenCodePromptRequestBuilderHost {
  getDefaultModelSelection(): PromptModelSelection;
  observeRuntimeToolNames(toolNames: Iterable<string>): boolean;
}

export class OpenCodePromptRequestBuilder {
  private promptRequestEntitySequence = 0;
  private promptRequestEntityLastTimestamp = 0;

  constructor(private readonly host: OpenCodePromptRequestBuilderHost) {}

  createPromptEntityId(kind: PromptRequestEntityKind): string {
    const prefix = kind === 'message' ? 'msg' : 'prt';
    const timestamp = Date.now();
    if (timestamp !== this.promptRequestEntityLastTimestamp) {
      this.promptRequestEntityLastTimestamp = timestamp;
      this.promptRequestEntitySequence = 0;
    }

    this.promptRequestEntitySequence += 1;
    const encodedTimestamp = (
      ((timestamp * OPEN_CODE_ID_TIMESTAMP_MULTIPLIER) + this.promptRequestEntitySequence)
      % OPEN_CODE_ID_TIMESTAMP_MODULUS
    ).toString(16).padStart(12, '0');

    return `${prefix}_${encodedTimestamp}${this.createPromptEntityRandomSuffix()}`;
  }

  buildStructuredPromptSendPayload(input: PromptBuildInput): BuiltPromptSendPayload {
    const messageID = input.messageID?.trim()
      ? input.messageID.trim()
      : this.createPromptEntityId('message');
    const requestParts = [
      ...input.parts,
      ...(input.invocationParts ?? []),
      ...this.buildSyntheticTextParts(input.syntheticTextParts),
    ].map((part) => this.withStablePartId(part));

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
    messageID?: string,
  ): SdkPromptParameters {
    const parameters: SdkPromptParameters = {
      sessionID: sessionId,
      ...(messageID ? { messageID } : {}),
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
    messageID?: string,
  ): LegacyPromptRequestBody {
    const requestBody: LegacyPromptRequestBody = {
      ...(messageID ? { messageID } : {}),
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

  private resolveModelSelection(options: QueryOptions): PromptModelSelection {
    const defaults = this.host.getDefaultModelSelection();
    return {
      providerID: options.provider ?? defaults.providerID,
      modelID: options.model ?? defaults.modelID,
    };
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
    const variant = options.variant;
    return variant ? variant : undefined;
  }

  private withStablePartId(part: PromptRequestPart): PromptRequestPart {
    const next = this.clonePromptRequestPart(part);
    if (!next.id) {
      next.id = this.createPromptEntityId('part');
    }
    return next;
  }

  private createPromptEntityRandomSuffix(): string {
    const bytes = new Uint8Array(OPEN_CODE_ID_RANDOM_LENGTH);
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      crypto.getRandomValues(bytes);
    } else {
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = Math.floor(Math.random() * 256);
      }
    }

    return Array.from(bytes, (byte) => OPEN_CODE_ID_RANDOM_CHARS[byte % OPEN_CODE_ID_RANDOM_CHARS.length]).join('');
  }

  private buildSyntheticTextParts(
    syntheticTextParts?: PromptSyntheticTextPartInput[],
  ): PromptRequestPart[] {
    if (!Array.isArray(syntheticTextParts) || syntheticTextParts.length === 0) {
      return [];
    }

    return syntheticTextParts
      .filter((part) => typeof part.text === 'string' && part.text.length > 0)
      .map((part) => ({
        id: part.id,
        type: 'text' as const,
        text: part.text,
        synthetic: true,
        ...(typeof part.ignored === 'boolean' ? { ignored: part.ignored } : {}),
        ...(part.metadata ? { metadata: { ...part.metadata } } : {}),
      }));
  }

  private clonePromptRequestPart(part: PromptRequestPart): PromptRequestPart {
    if (part.type === 'text') {
      return {
        ...part,
        ...(part.metadata ? { metadata: { ...part.metadata } } : {}),
      };
    }

    if (part.type === 'file') {
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

    if (part.type === 'agent') {
      return {
        ...part,
        ...(part.source ? {
          source: { ...part.source },
        } : {}),
      };
    }

    if (part.type === 'subtask') {
      return {
        ...part,
        ...(part.model ? { model: { ...part.model } } : {}),
      };
    }

    const exhaustivePart: never = part;
    throw new Error(`Unsupported prompt request part: ${JSON.stringify(exhaustivePart)}`);
  }
}
