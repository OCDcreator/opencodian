/**
 * Backend-neutral Obsidian-tooling injection (R-B4). Mirrors the D-O2 memory
 * injection contract: the block rides the send-options bag
 * (`obsidianToolingInjection`) to every adapter seam — opencode translates it
 * into a synthetic text part; claude/codex/pi prepend it to the message text.
 * The key is inert for consumers that do not read it.
 *
 * Injection happens once per context epoch, using the same two signals as the
 * memory seam: an in-memory per-conversation compaction watermark (for
 * backends that do not persist the injected text) plus a transcript marker
 * scan (which survives plugin reloads for backends that persist it).
 */

import type { ChatMessage } from '../types';
import { OBSIDIAN_TOOLING_INJECTION_OPEN_MARKER } from './obsidianToolingCatalog';

export type ToolingInjectionSkipReason = 'disabled' | 'already-injected-this-epoch';

export interface ToolingInjectionPlan {
  /** Full injection block text, or null when nothing should be injected. */
  text: string | null;
  skippedReason: ToolingInjectionSkipReason | null;
}

/** Structural transcript shape needed for the epoch scan (test-friendly). */
export type ToolingTranscriptMessage = Pick<ChatMessage, 'role' | 'content'> &
  Partial<Pick<ChatMessage, 'summary' | 'summaryKind' | 'compactionDivider' | 'parts'>>;

/**
 * Detect whether the transcript already carries a tooling injection for the
 * current context epoch (after the most recent compaction marker).
 */
export function transcriptHasToolingInjection(
  messages: ReadonlyArray<ToolingTranscriptMessage>,
): boolean {
  let hasInjection = false;
  for (const message of messages) {
    if (message.summary || message.compactionDivider) {
      hasInjection = false; // compaction starts a fresh context epoch
      continue;
    }
    if (message.role !== 'user') continue;
    if (typeof message.content === 'string' && message.content.includes(OBSIDIAN_TOOLING_INJECTION_OPEN_MARKER)) {
      hasInjection = true;
      continue;
    }
    const parts = message.parts;
    if (Array.isArray(parts)) {
      for (const part of parts) {
        if (
          part
          && typeof part === 'object'
          && typeof (part as { text?: unknown }).text === 'string'
          && ((part as { text: string }).text as string).includes(OBSIDIAN_TOOLING_INJECTION_OPEN_MARKER)
        ) {
          hasInjection = true;
          break;
        }
      }
    }
  }
  return hasInjection;
}

/** Compaction-marker count used as the per-conversation epoch watermark. */
export function toolingEpochMarkerCount(messages: ReadonlyArray<ToolingTranscriptMessage>): number {
  let count = 0;
  for (const message of messages) {
    if (message.summary || message.compactionDivider) {
      count += 1;
    }
  }
  return count;
}

/**
 * Plan the per-epoch tooling injection. Pure: the caller supplies the block
 * text (already rendered for the current availability) and the in-memory
 * epoch watermark. Null block text means "nothing to inject" (mode off).
 */
export function planToolingInjection(input: {
  blockText: string | null;
  messages: ReadonlyArray<ToolingTranscriptMessage>;
  /** Compaction-marker count when this conversation last got an injection. */
  injectedEpochMarkerCount?: number;
}): ToolingInjectionPlan {
  if (input.blockText === null) {
    return { text: null, skippedReason: 'disabled' };
  }
  const epoch = toolingEpochMarkerCount(input.messages);
  const alreadyInjected =
    input.injectedEpochMarkerCount === epoch || transcriptHasToolingInjection(input.messages);
  if (alreadyInjected) {
    return { text: null, skippedReason: 'already-injected-this-epoch' };
  }
  return { text: input.blockText, skippedReason: null };
}

/**
 * Read the tooling injection out of a backend send-options bag. Inert for
 * backends that do not consume it.
 */
export function extractObsidianToolingInjection(
  options: Record<string, unknown> | undefined | null,
): string | null {
  const raw = (options as { obsidianToolingInjection?: unknown } | undefined)?.obsidianToolingInjection;
  if (!raw || typeof raw !== 'object') return null;
  const text = (raw as { text?: unknown }).text;
  return typeof text === 'string' && text.trim().length > 0 ? text : null;
}

/**
 * Prefix a prompt content with the tooling injection (claude/codex/pi seam:
 * these backends expose no per-turn system-prompt parameter, so the
 * reference-framed block rides at the front of the message text).
 */
export function prependObsidianToolingInjection(
  content: string,
  options: Record<string, unknown> | undefined | null,
): string {
  const injection = extractObsidianToolingInjection(options);
  if (!injection) return content;
  return `${injection}\n\n${content}`;
}
