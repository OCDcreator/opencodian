import type { ContextUsageSnapshot, OpenCodeCurrentContextUsage } from '../types';
import type {
  Message,
  Session,
  SessionMessage,
} from './OpenCodeSessionLifecycleCoordinator';

export type AvailableModelDirectory = {
  providers: Array<{
    id: string;
    name: string;
    models: Array<{
      id: string;
      name: string;
      contextWindow?: number;
    }>;
  }>;
  defaults: Record<string, string>;
};

type ModelMetadata = {
  providerId: string | null;
  providerName: string | null;
  modelId: string | null;
  modelName: string | null;
  contextWindow: number;
};

type TokenBreakdown = {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number | null;
};

type SessionContextUsageBuilderDeps = {
  getAvailableModels(): Promise<AvailableModelDirectory>;
  getSessionMessages(sessionId: string): Promise<SessionMessage[]>;
};

export async function buildSessionLevelContextUsageSnapshot(
  session: Session,
  sessionId: string,
  deps: Pick<SessionContextUsageBuilderDeps, 'getAvailableModels'>,
): Promise<ContextUsageSnapshot> {
  const modelMetadata = await resolveSessionLevelModelMetadata(
    deps.getAvailableModels,
    session.model?.providerID ?? null,
    session.model?.id ?? null,
  );
  return buildContextUsageSnapshot({
    session,
    sessionId,
    updatedAt: session.time.updated,
    modelMetadata,
    cumulativeTokenBreakdown: buildTokenBreakdown(session.tokens),
    totalCost: typeof session.cost === 'number' ? session.cost : null,
    openCodeCurrentContext: null,
    openCodeHasCumulativeTokens: session.tokens != null,
  });
}

export async function buildMessageLevelContextUsageSnapshot(
  session: Session,
  sessionId: string,
  deps: SessionContextUsageBuilderDeps,
): Promise<ContextUsageSnapshot> {
  const [messages, providersResult] = await Promise.all([
    deps.getSessionMessages(sessionId),
    deps.getAvailableModels(),
  ]);
  const latestAssistantWithTokens = findLatestAssistantWithTokens(messages);
  const modelMetadata = resolveModelMetadata(
    providersResult,
    latestAssistantWithTokens?.info.providerID ?? session.model?.providerID ?? null,
    latestAssistantWithTokens?.info.modelID ?? session.model?.id ?? null,
  );

  return buildContextUsageSnapshot({
    session,
    sessionId,
    updatedAt: latestAssistantWithTokens?.info.time.created ?? session.time.updated,
    modelMetadata,
    cumulativeTokenBreakdown: buildTokenBreakdown(session.tokens),
    totalCost: typeof session.cost === 'number' ? session.cost : null,
    openCodeCurrentContext: latestAssistantWithTokens
      ? buildOpenCodeCurrentContextUsage(
        modelMetadata,
        buildTokenBreakdown(latestAssistantWithTokens.info.tokens),
      )
      : null,
    openCodeHasCumulativeTokens: session.tokens != null,
  });
}

function buildContextUsageSnapshot(options: {
  session: Session;
  sessionId: string;
  updatedAt: number;
  modelMetadata: ModelMetadata;
  cumulativeTokenBreakdown: TokenBreakdown;
  totalCost: number | null;
  openCodeCurrentContext: OpenCodeCurrentContextUsage | null;
  openCodeHasCumulativeTokens: boolean;
}): ContextUsageSnapshot {
  const {
    session,
    sessionId,
    updatedAt,
    modelMetadata,
    cumulativeTokenBreakdown,
    totalCost,
    openCodeCurrentContext,
    openCodeHasCumulativeTokens,
  } = options;

  return {
    sessionId,
    sessionTitle: session.title,
    createdAt: session.time.created,
    updatedAt,
    compactingAt: typeof session.time.compacting === 'number'
      ? session.time.compacting
      : null,
    providerId: modelMetadata.providerId,
    providerName: modelMetadata.providerName,
    modelId: modelMetadata.modelId,
    modelName: modelMetadata.modelName,
    contextWindow: modelMetadata.contextWindow,
    totalTokens: cumulativeTokenBreakdown.totalTokens,
    inputTokens: cumulativeTokenBreakdown.inputTokens,
    outputTokens: cumulativeTokenBreakdown.outputTokens,
    reasoningTokens: cumulativeTokenBreakdown.reasoningTokens,
    cacheReadTokens: cumulativeTokenBreakdown.cacheReadTokens,
    cacheWriteTokens: cumulativeTokenBreakdown.cacheWriteTokens,
    totalCost,
    openCodeCurrentContext,
    openCodeHasCumulativeTokens,
  };
}

function buildTokenBreakdown(
  tokens?: Session['tokens'] | Message['tokens'],
): TokenBreakdown {
  const inputTokens = tokens?.input ?? 0;
  const outputTokens = tokens?.output ?? 0;
  const reasoningTokens = tokens?.reasoning ?? 0;
  const cacheReadTokens = tokens?.cache?.read ?? 0;
  const cacheWriteTokens = tokens?.cache?.write ?? null;

  return {
    totalTokens: inputTokens
      + outputTokens
      + reasoningTokens
      + cacheReadTokens
      + (cacheWriteTokens ?? 0),
    inputTokens,
    outputTokens,
    reasoningTokens,
    cacheReadTokens,
    cacheWriteTokens,
  };
}

function buildOpenCodeCurrentContextUsage(
  modelMetadata: ModelMetadata,
  tokenBreakdown: TokenBreakdown,
): OpenCodeCurrentContextUsage {
  return {
    providerId: modelMetadata.providerId,
    providerName: modelMetadata.providerName,
    modelId: modelMetadata.modelId,
    modelName: modelMetadata.modelName,
    contextWindow: modelMetadata.contextWindow,
    totalTokens: tokenBreakdown.totalTokens,
    inputTokens: tokenBreakdown.inputTokens,
    outputTokens: tokenBreakdown.outputTokens,
    reasoningTokens: tokenBreakdown.reasoningTokens,
    cacheReadTokens: tokenBreakdown.cacheReadTokens,
    cacheWriteTokens: tokenBreakdown.cacheWriteTokens,
  };
}

async function resolveSessionLevelModelMetadata(
  getAvailableModels: () => Promise<AvailableModelDirectory>,
  rawProviderId: string | null,
  rawModelId: string | null,
): Promise<ModelMetadata> {
  try {
    return resolveModelMetadata(
      await getAvailableModels(),
      rawProviderId,
      rawModelId,
    );
  } catch {
    return {
      providerId: rawProviderId,
      providerName: rawProviderId,
      modelId: rawModelId,
      modelName: rawModelId,
      contextWindow: 0,
    };
  }
}

function resolveModelMetadata(
  providersResult: AvailableModelDirectory,
  rawProviderId: string | null,
  rawModelId: string | null,
): ModelMetadata {
  const provider = rawProviderId
    ? providersResult.providers.find((candidate) => candidate.id === rawProviderId)
    : undefined;
  const model = provider && rawModelId
    ? provider.models.find((candidate) => candidate.id === rawModelId)
    : undefined;

  return {
    providerId: rawProviderId,
    providerName: provider?.name ?? rawProviderId,
    modelId: rawModelId,
    modelName: model?.name ?? rawModelId,
    contextWindow: model?.contextWindow ?? 0,
  };
}

function findLatestAssistantWithTokens(
  messages: SessionMessage[],
): SessionMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.info.role !== 'assistant') {
      continue;
    }

    const tokenBreakdown = buildTokenBreakdown(message.info.tokens);
    if (tokenBreakdown.totalTokens <= 0) {
      continue;
    }

    return message;
  }

  return null;
}
