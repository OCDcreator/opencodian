import type { ChatMessage, Conversation, PromptContextItem } from '../../../core/types';
import type { AutoInternalLinkProcessor } from '../../inline-edit/InlineEditAutoLink';

/**
 * AssistantAutoInternalLinkService — chat-side R-B1 boundary
 * (docs/requirements/flowtext-parity.md R-B1 生成内容自动内链).
 *
 * The inline-edit path applies the auto-internal-link pass to its parsed
 * result before the diff preview; the chat path had no equivalent wiring.
 * This service closes that scope gap by calling the SAME processor seam
 * (`createInlineEditAutoLinkProcessor`, shared with the inline path) once the
 * turn's assistant text is final:
 *
 * - the reference-note set is the turn's own `contextItems` (attached context
 *   + R-B2 context groups, which attach through the same chip mechanism);
 *   R-C1 retrieval fragments are a different source and do not ground links;
 * - it runs on the completed assistant message only — interrupted streams
 *   and notices are never rewritten;
 * - it never runs frame by frame: the streamed text is left untouched and
 *   the pass is applied once at finalization, before the final conversation
 *   save and the render apply, so the persisted text and the rendered text
 *   always agree;
 * - a non-empty reference set with no match (or a rejected dead heading) is
 *   a normal no-op and produces no user notice; a missing processor seam is
 *   reported through the finalization trace, never silently.
 *
 * Mutating the message in place is not a vault write: chat messages live in
 * plugin storage, so the single-`replaceRange` write-path rule is untouched.
 */
export type ChatAutoInternalLinkSkipReason =
  | 'processor-unavailable'
  | 'no-references'
  | 'no-completed-assistant-message'
  | 'unchanged'
  | 'applied';

export interface ChatAutoInternalLinkOutcome {
  readonly changed: boolean;
  readonly reason: ChatAutoInternalLinkSkipReason;
  /** Number of note entries handed to the processor (0 unless references). */
  readonly referenceCount: number;
  /**
   * Pre-mutation view of `conversation.messages` for the caller's render
   * apply: a shallow copy in which the rewritten message is replaced by its
   * pre-mutation clone, so the renderer sees a genuine before/after diff.
   * Only meaningful when `changed` is true.
   */
  readonly previousMessages: ChatMessage[];
}

/** Stage logger shared with the finalization pipeline's trace. */
export type ChatAutoInternalLinkLogStage = (stage: string, payload?: Record<string, unknown>) => void;

/**
 * Narrow port consumed by the authoritative sync merge (rewrite survival) and
 * the canonical render projection (render parity): re-apply the deterministic
 * per-turn pass over a message array. No processor ⇒ structural no-op.
 */
export type AutoInternalLinkTurnRewriter = {
  applyToTurnMessages(messages: ChatMessage[]): boolean;
};

export class AssistantAutoInternalLinkService {
  constructor(private readonly processor: AutoInternalLinkProcessor | null | undefined) {}

  /**
   * Re-apply the pass over a whole message array, turn by turn: the reference
   * set for each turn is derived from THAT turn's user message
   * `contextAttachments` (the durable record — this is what survives the
   * server round trip and a plugin reload), and each completed assistant
   * message of the turn is rewritten in place. Interrupted streams and notice
   * rows are never touched, exactly like the finalization tail pass. The
   * processor is idempotent (existing links are protected zones), so running
   * this over already-linked text is a no-op.
   *
   * Consumers: the authoritative sync merge (so the text the merge adopts
   * keeps the links) and the canonical render projection (so the render input
   * matches the stored text). Both feed the same rule, so storage and DOM
   * cannot disagree.
   */
  applyToTurnMessages(messages: ChatMessage[]): boolean {
    if (!this.processor) {
      return false;
    }
    let changed = false;
    let references: readonly { readonly path: string }[] = [];
    for (const message of messages) {
      if (message.role === 'user') {
        references = collectStoredReferenceNotes(message.contextAttachments);
        continue;
      }
      if (references.length === 0 || !isRewritableAssistantMessage(message)) {
        continue;
      }
      if (applyProcessorToMessageText(this.processor, message, references)) {
        changed = true;
      }
    }
    return changed;
  }

  /**
   * Apply the auto-internal-link pass to this turn's completed assistant
   * message inside `conversation`. Returns whether any text changed (so the
   * caller can force the foreground render apply and persist the mutation)
   * plus the pre-mutation message snapshot to render against.
   */
  applyToConversationTail(
    conversation: Conversation,
    contextItems: readonly PromptContextItem[] | undefined,
    logStage: ChatAutoInternalLinkLogStage,
  ): ChatAutoInternalLinkOutcome {
    const previousMessages = [...conversation.messages];
    const outcome = this.applyToConversationTailOutcome(conversation, contextItems, previousMessages);
    logStage('auto-internal-link-pass', {
      changed: outcome.changed,
      reason: outcome.reason,
      referenceCount: outcome.referenceCount,
    });
    return { ...outcome, previousMessages };
  }

  private applyToConversationTailOutcome(
    conversation: Conversation,
    contextItems: readonly PromptContextItem[] | undefined,
    previousMessages: ChatMessage[],
  ): ChatAutoInternalLinkOutcome {
    if (!this.processor) {
      // §6.7 honesty: report the missing seam through the trace instead of
      // pretending the pass ran.
      return { changed: false, reason: 'processor-unavailable', referenceCount: 0, previousMessages };
    }

    const references = collectTurnReferenceNotes(contextItems);
    if (references.length === 0) {
      return { changed: false, reason: 'no-references', referenceCount: 0, previousMessages };
    }

    const found = findCompletedTurnAssistantMessage(conversation);
    if (!found) {
      return {
        changed: false,
        reason: 'no-completed-assistant-message',
        referenceCount: references.length,
        previousMessages,
      };
    }

    // Pre-mutation clone for the caller's before/after render diff: the
    // in-place rewrite below mutates the live message object, so a plain
    // array copy would make the render apply see two identical states.
    const candidateSnapshot: ChatMessage = { ...found.message };
    const changed = applyProcessorToMessageText(this.processor, found.message, references);
    if (changed) {
      previousMessages[found.index] = candidateSnapshot;
    }
    return {
      changed,
      reason: changed ? 'applied' : 'unchanged',
      referenceCount: references.length,
      previousMessages,
    };
  }
}

/**
 * The turn's reference-note set: file-level note attachments only
 * (R-B1 sources are attached context + R-B2 context groups). Folders carry
 * no verifiable headings, PDFs are not notes, selections are fragments, and
 * R-C1 retrieval fragments are a separate, unnamed source — none of them
 * ground links here. The processor still verifies every path against the
 * metadata cache, so a stale or missing path can never produce a dead link.
 */
function collectTurnReferenceNotes(
  contextItems: readonly PromptContextItem[] | undefined,
): { readonly path: string }[] {
  if (!contextItems || contextItems.length === 0) {
    return [];
  }
  const references: { path: string }[] = [];
  for (const item of contextItems) {
    if (!isEligibleReferenceNote(item)) {
      continue;
    }
    references.push({ path: item.path });
  }
  return references;
}

/**
 * The durable variant: derive the reference set from the turn's user message
 * `contextAttachments` — the record that persists with the conversation and
 * survives the authoritative server round trip. Same eligibility rules as the
 * finalization-time collector, so a resync re-applies exactly the links whose
 * references are still on record and never invents new ones.
 */
function collectStoredReferenceNotes(
  attachments: readonly {
    kind?: PromptContextItem['kind'];
    path: string;
    origin?: PromptContextItem['origin'];
  }[]
  | undefined,
): { readonly path: string }[] {
  if (!attachments || attachments.length === 0) {
    return [];
  }
  const references: { path: string }[] = [];
  for (const attachment of attachments) {
    if (!isEligibleReferenceNote(attachment)) {
      continue;
    }
    references.push({ path: attachment.path });
  }
  return references;
}

function isEligibleReferenceNote(
  entry: { kind?: PromptContextItem['kind']; path: string; origin?: PromptContextItem['origin'] },
): boolean {
  if (entry.kind !== 'file' && entry.kind !== 'current_note') {
    return false;
  }
  if (entry.origin === 'vault-retrieval') {
    return false;
  }
  return Boolean(entry.path);
}

/**
 * What the pass may rewrite: a regular assistant message with final text.
 * Interrupted streams and notice rows are fail-closed exclusions — partial
 * text stays as generated, notices are never prose.
 */
function isRewritableAssistantMessage(message: ChatMessage): boolean {
  return message.role === 'assistant'
    && message.displayStyle !== 'notice'
    && message.streamState !== 'interrupted';
}

/**
 * The completed assistant message of THIS turn: the last non-notice assistant
 * message after the turn's last user message. Scanning only that region can
 * never touch an earlier turn's text; interrupted streams and notice rows
 * are skipped (fail-closed: partial text stays as generated).
 */
function findCompletedTurnAssistantMessage(
  conversation: Conversation,
): { message: ChatMessage; index: number } | null {
  const messages = conversation.messages;
  let lastUserIndex = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'user') {
      lastUserIndex = i;
      break;
    }
  }

  let candidate: ChatMessage | null = null;
  let candidateIndex = -1;
  for (let i = lastUserIndex + 1; i < messages.length; i += 1) {
    const message = messages[i];
    if (!message || !isRewritableAssistantMessage(message)) {
      continue;
    }
    candidate = message;
    candidateIndex = i;
  }
  if (!candidate || candidateIndex < 0) {
    return null;
  }
  return { message: candidate, index: candidateIndex };
}

/**
 * Rewrite the message's own text representations with the processor:
 * every text content block is processed (blocks are what the structured
 * renderer shows), and `content` is kept in agreement — derived from the
 * blocks when it was their exact join (local persistence invariant), and
 * processed independently otherwise (e.g. synced server text without
 * blocks). Both render paths therefore show exactly the stored text.
 */
function applyProcessorToMessageText(
  processor: AutoInternalLinkProcessor,
  message: ChatMessage,
  references: readonly { readonly path: string }[],
): boolean {
  const textBlocks = (message.contentBlocks ?? []).filter(
    (block) => block.type === 'text',
  );
  let changed = false;

  if (textBlocks.length > 0) {
    const originalJoin = textBlocks.map((block) => block.text ?? '').join('');
    let newJoin = '';
    for (const block of textBlocks) {
      const linked = processor(block.text ?? '', references);
      if (linked !== (block.text ?? '')) {
        block.text = linked;
        changed = true;
      }
      newJoin += linked;
    }
    if (message.content === originalJoin) {
      // Preserve the local persistence invariant content === join(blocks).
      if (newJoin !== message.content) {
        message.content = newJoin;
        changed = true;
      }
    } else if (applyProcessorToContent(processor, message, references)) {
      changed = true;
    }
    return changed;
  }

  return applyProcessorToContent(processor, message, references);
}

function applyProcessorToContent(
  processor: AutoInternalLinkProcessor,
  message: ChatMessage,
  references: readonly { readonly path: string }[],
): boolean {
  const linked = processor(message.content, references);
  if (linked === message.content) {
    return false;
  }
  message.content = linked;
  return true;
}
