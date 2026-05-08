import type { AgentMentionIntent } from '../../../core/agents';
import type {
  CommandComposerSubmission,
  ComposerInputMode,
  ComposerInputSubmission,
  PromptComposerSubmission,
} from './MessageSendPreparationService';

function parseCommandSubmission(content: string): CommandComposerSubmission | null {
  const trimmedContent = content.trim();
  if (!trimmedContent.startsWith('/') || trimmedContent.startsWith('//')) {
    return null;
  }

  const commandBody = trimmedContent.slice(1);
  if (!commandBody || /^\s/.test(commandBody)) {
    return null;
  }

  const commandMatch = /^(\S+)(?:\s+([\s\S]*))?$/.exec(commandBody);
  if (!commandMatch?.[1]) {
    return null;
  }

  return {
    kind: 'command',
    rawContent: trimmedContent,
    command: commandMatch[1],
    arguments: commandMatch[2] ?? '',
  };
}

export function buildComposerInputSubmission(
  content: string,
  mode: ComposerInputMode = 'prompt',
): ComposerInputSubmission | null {
  const trimmedContent = content.trim();
  if (!trimmedContent) {
    return null;
  }

  if (mode === 'shell') {
    return {
      kind: 'shell',
      rawContent: trimmedContent,
      command: trimmedContent,
    };
  }

  return parseCommandSubmission(trimmedContent) ?? {
    kind: 'prompt',
    content: trimmedContent,
  };
}

export function buildComposerInputSubmissionWithAgentIntents(
  content: string,
  mode: ComposerInputMode,
  mentions: AgentMentionIntent[],
  primaryAgent: string | null | undefined,
): ComposerInputSubmission | null {
  const trimStartOffset = content.length - content.trimStart().length;
  return decoratePromptSubmissionWithPrimaryAgent(
    decoratePromptSubmissionWithAgentMentions(
      buildComposerInputSubmission(content, mode),
      shiftAgentMentionSourceSpans(mentions, -trimStartOffset),
    ),
    primaryAgent,
  );
}

export function isCommandComposerText(content: string): boolean {
  return parseCommandSubmission(content) !== null;
}

export function decoratePromptSubmissionWithAgentMentions(
  submission: ComposerInputSubmission | null,
  mentions: AgentMentionIntent[],
): ComposerInputSubmission | null {
  if (!submission || submission.kind !== 'prompt' || mentions.length === 0) {
    return submission;
  }

  return {
    ...submission,
    invocationIntent: {
      ...(submission.invocationIntent ?? {}),
      kind: 'prompt',
      mentions: [
        ...getExistingMentions(submission),
        ...mentions,
      ],
    },
  };
}

export function shiftAgentMentionSourceSpans(
  mentions: AgentMentionIntent[],
  delta: number,
): AgentMentionIntent[] {
  if (delta === 0) {
    return mentions;
  }

  return mentions.map((mention) => ({
    ...mention,
    source: mention.source
      ? {
        ...mention.source,
        start: mention.source.start + delta,
        end: mention.source.end + delta,
      }
      : undefined,
  }));
}

export function decoratePromptSubmissionWithPrimaryAgent(
  submission: ComposerInputSubmission | null,
  primaryAgent: string | null | undefined,
): ComposerInputSubmission | null {
  const normalizedPrimaryAgent = primaryAgent?.trim();
  if (!submission || submission.kind !== 'prompt' || !normalizedPrimaryAgent) {
    return submission;
  }

  return {
    ...submission,
    invocationIntent: {
      ...(submission.invocationIntent ?? {}),
      kind: 'prompt',
      primaryAgent: normalizedPrimaryAgent,
    },
  };
}

function getExistingMentions(
  submission: PromptComposerSubmission,
): readonly AgentMentionIntent[] {
  return submission.invocationIntent?.mentions ?? [];
}

export function getSlashCommandMenuQuery(textarea: HTMLTextAreaElement): string | null {
  const selectionStart = textarea.selectionStart ?? textarea.value.length;
  const selectionEnd = textarea.selectionEnd ?? selectionStart;
  if (selectionStart !== selectionEnd) {
    return null;
  }

  const beforeCursor = textarea.value.slice(0, selectionStart);
  if (/^\/skills(?:\s+\S*)?$/i.test(beforeCursor)) {
    return beforeCursor.slice(1);
  }

  let slashIndex = -1;
  for (let i = beforeCursor.length - 1; i >= 0; i--) {
    const ch = beforeCursor[i];
    if (ch === '/') {
      slashIndex = i;
      break;
    }

    if (/\s/.test(ch)) {
      break;
    }
  }

  if (slashIndex < 0) {
    return null;
  }

  if (slashIndex > 0 && !/\s/.test(beforeCursor[slashIndex - 1])) {
    return null;
  }

  if (slashIndex > 0 && beforeCursor[slashIndex - 1] === '/') {
    return null;
  }

  const searchText = beforeCursor.slice(slashIndex + 1);
  if (/\s/.test(searchText) && !/^skills(?:\s+\S*)?$/i.test(searchText)) {
    return null;
  }

  return searchText;
}
