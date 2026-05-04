import type {
  AgentMentionIntent,
  InvocationPromptPart,
  ResolvedAgentInvocation,
  SubtaskIntent,
  SurfaceInvocationIntent,
} from './types';

const EMPTY_RESOLVED: ResolvedAgentInvocation = Object.freeze({
  invocationParts: Object.freeze([]),
});

type AgentInvocationPromptPart = Extract<InvocationPromptPart, { type: 'agent' }>;
type AgentInvocationSource = NonNullable<AgentInvocationPromptPart['source']>;

export class AgentInvocationService {
  resolveInvocationIntent(intent: SurfaceInvocationIntent | undefined): ResolvedAgentInvocation {
    if (!intent || (intent.kind && intent.kind !== 'prompt')) {
      return EMPTY_RESOLVED;
    }

    const hasPrimaryAgent = typeof intent.primaryAgent === 'string' && intent.primaryAgent.trim().length > 0;
    const hasMentions = Array.isArray(intent.mentions) && intent.mentions.length > 0;
    const hasSubtasks = Array.isArray(intent.subtasks) && intent.subtasks.length > 0;

    if (!hasPrimaryAgent && !hasMentions && !hasSubtasks) {
      return EMPTY_RESOLVED;
    }

    const invocationParts: InvocationPromptPart[] = [];

    if (hasMentions) {
      for (const mention of intent.mentions!) {
        const resolvedMention = this.resolveMention(mention);
        if (resolvedMention) {
          invocationParts.push(resolvedMention);
        }
      }
    }

    if (hasSubtasks) {
      for (const subtask of intent.subtasks!) {
        const resolvedSubtask = this.resolveSubtask(subtask);
        if (resolvedSubtask) {
          invocationParts.push(resolvedSubtask);
        }
      }
    }

    return {
      ...(hasPrimaryAgent ? { agent: intent.primaryAgent!.trim() } : {}),
      invocationParts,
    };
  }

  removeMentionFallbackText(content: string, invocation: ResolvedAgentInvocation): string {
    return invocation.invocationParts
      .filter((part): part is AgentInvocationPromptPart & { source: AgentInvocationSource } =>
        part.type === 'agent' && Boolean(part.source))
      .map((part) => part.source)
      .sort((left, right) => right.start - left.start)
      .reduce((nextContent, source) => this.removeMentionSourceSpan(nextContent, source), content);
  }

  private resolveMention(mention: AgentMentionIntent): (InvocationPromptPart & { type: 'agent' }) | null {
    const agentId = mention.agentId.trim();
    if (!agentId) {
      return null;
    }

    return {
      type: 'agent',
      name: agentId,
      ...(mention.source ? { source: { ...mention.source } } : {}),
    };
  }

  private resolveSubtask(subtask: SubtaskIntent): (InvocationPromptPart & { type: 'subtask' }) | null {
    const agentId = subtask.agentId.trim();
    const description = subtask.description.trim();
    const prompt = subtask.prompt.trim();
    if (!agentId || !description || !prompt) {
      return null;
    }

    return {
      type: 'subtask',
      description,
      prompt,
      agent: agentId,
      ...(subtask.model ? { model: { ...subtask.model } } : {}),
      ...(typeof subtask.command === 'string' && subtask.command.trim()
        ? { command: subtask.command.trim() }
      : {}),
    };
  }

  private removeMentionSourceSpan(
    content: string,
    source: AgentInvocationSource,
  ): string {
    if (
      !Number.isInteger(source.start)
      || !Number.isInteger(source.end)
      || source.start < 0
      || source.end <= source.start
      || source.end > content.length
      || content.slice(source.start, source.end) !== source.value
    ) {
      return content;
    }

    let start = source.start;
    let end = source.end;
    if (start > 0 && end < content.length && this.isInlineWhitespace(content[start - 1]) && this.isInlineWhitespace(content[end])) {
      end += 1;
    } else if (start === 0 && this.isInlineWhitespace(content[end])) {
      end += 1;
    } else if (end === content.length && start > 0 && this.isInlineWhitespace(content[start - 1])) {
      start -= 1;
    }

    return `${content.slice(0, start)}${content.slice(end)}`;
  }

  private isInlineWhitespace(value: string | undefined): boolean {
    return value === ' ' || value === '\t';
  }
}
