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
}
