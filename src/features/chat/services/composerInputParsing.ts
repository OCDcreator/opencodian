import type { AgentMentionIntent } from '../../../core/agents';
import type {
  CommandComposerSubmission,
  ComposerInputMode,
  ComposerInputSubmission,
  PromptComposerSubmission,
} from './MessageSendPreparationService';

function parseCommandSubmission(content: string): CommandComposerSubmission | null {
  const trimmedContent = content.trim();
  if (!trimmedContent || trimmedContent.startsWith('//')) {
    return null;
  }

  // Strategy 1: /command at start of text (backward compatible)
  if (trimmedContent.startsWith('/')) {
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

  // Strategy 2: /command after whitespace (e.g. "some text /command args")
  // Use global regex and take the LAST match to prefer the rightmost /command.
  const midRegex = /\s\/(\S+)/g;
  let lastMidMatch: RegExpExecArray | null = null;
  let currentMatch: RegExpExecArray | null;
  while ((currentMatch = midRegex.exec(trimmedContent)) !== null) {
    lastMidMatch = currentMatch;
  }

  if (!lastMidMatch?.[1]) {
    return null;
  }

  // Reject // (e.g. "text //comment" should not be treated as a command)
  const slashPosition = lastMidMatch.index + 1; // position of the '/' in full text
  if (slashPosition > 0 && trimmedContent[slashPosition - 1] === '/') {
    return null;
  }

  const precedingText = trimmedContent.slice(0, lastMidMatch.index).trim();
  const commandName = lastMidMatch[1];
  const afterCommand = trimmedContent.slice(lastMidMatch.index + lastMidMatch[0].length);
  const argumentsText = afterCommand.trim();

  // For mid-text commands, rawContent is the FULL original text so that if the
  // slash command is not recognized, the send pipeline falls through to sending
  // the complete text as a regular prompt (no data loss).
  return {
    kind: 'command',
    rawContent: trimmedContent,
    command: commandName,
    arguments: argumentsText,
    precedingText: precedingText || undefined,
    originalContent: trimmedContent,
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
  const prefixedSkillsMatch = /(?:^|\s)(\/skills(?:\s+\S*)?\s*)$/i.exec(beforeCursor);
  if (prefixedSkillsMatch?.[1]) {
    const prefixedSkillsQuery = prefixedSkillsMatch[1].slice(1);
    return /^skills\s*$/i.test(prefixedSkillsQuery)
      ? 'skills '
      : prefixedSkillsQuery;
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

/**
 * Replace the /xxx slash token at the cursor position with `replacement`,
 * preserving surrounding text. Returns the new value and cursor position.
 */
export function replaceSlashTokenAtCursor(
  current: string,
  cursorPos: number,
  replacement: string,
): { value: string; cursorPos: number } {
  const beforeCursor = current.slice(0, cursorPos);
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

  if (slashIndex >= 0) {
    let tokenEnd = slashIndex + 1;
    while (tokenEnd < current.length && !/\s/.test(current[tokenEnd])) {
      tokenEnd++;
    }
    const before = current.slice(0, slashIndex);
    const after = current.slice(tokenEnd);
    return {
      value: before + replacement + after,
      cursorPos: before.length + replacement.length,
    };
  }

  return { value: replacement, cursorPos: replacement.length };
}
