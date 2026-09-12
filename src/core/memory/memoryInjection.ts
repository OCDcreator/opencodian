/**
 * Injection planning: the backend-neutral context bundle handed to each
 * adapter seam (D-O2/D-O3/D-O4).
 *
 * The reference implementation splits protocol (system transform, every
 * request) and index (prefix part, once per context epoch). This plugin's
 * seam is message-layer, and the server-side transcript accumulates, so
 * the whole bundle — protocol + index + optional recalled bodies + hygiene
 * notice — is injected ONCE per context epoch, marker-framed as reference
 * context, not a request. Epoch detection scans the persisted transcript
 * for the injection marker after the last compaction divider, which
 * survives plugin reloads for backends that persist the injected part.
 */

import { assessHygiene, buildHygieneNotice } from './memoryHygiene';
import { buildMemoryIndexBlock } from './memoryIndexFormat';
import type { TopicManifestEntry } from './memoryManifest';
import { buildMemoryProtocol, MEMORY_INJECTION_OPEN_MARKER } from './memoryProtocol';
import { assembleRelevantMemory, type SelectedMemory } from './memoryRecall';
import type {
  MemorySettingsSnapshot,
  MemoryTranscriptMessage,
} from './memoryTypes';

export type MemorySkipReason =
  | 'disabled'
  | 'already-injected-this-epoch';

export type MemoryInjectionPlan = {
  /** Full injection block text, or null when nothing should be injected. */
  text: string | null;
  skippedReason: MemorySkipReason | null;
  /** Rendered index bytes actually included (0 when no index block). */
  indexBytes: number;
  /** Protocol bytes included (0 when skipped). */
  protocolBytes: number;
  relevantMemory: string | null;
  recalledPaths: string[];
  recalledContentCharacters: number;
  skippedSecretGuard: string[];
  hygieneNotice: string | null;
};

/**
 * Detect whether the transcript already carries a memory injection for the
 * current context epoch (after the most recent compaction divider). Works
 * across reloads for backends that persist the injected part/content;
 * the runtime coordinator supplements it with in-memory epoch state for
 * backends that only keep the original user text.
 */
export function transcriptHasInjectionThisEpoch(
  messages: ReadonlyArray<MemoryTranscriptMessage>,
): boolean {
  let hasInjection = false;
  for (const message of messages) {
    if (message.summary || message.compactionDivider) {
      hasInjection = false; // compaction starts a fresh context epoch
      continue;
    }
    if (message.role !== 'user') continue;
    if (typeof message.content === 'string' && message.content.includes(MEMORY_INJECTION_OPEN_MARKER)) {
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
          && ((part as { text: string }).text as string).includes(MEMORY_INJECTION_OPEN_MARKER)
        ) {
          hasInjection = true;
          break;
        }
      }
    }
  }
  return hasInjection;
}

/**
 * Plan the per-epoch memory injection bundle. Pure: everything needed is
 * passed in, so tests are deterministic without any filesystem or model.
 */
export function planMemoryInjection(input: {
  messages: ReadonlyArray<MemoryTranscriptMessage>;
  memoryIndexContent: string | null | undefined;
  manifest?: TopicManifestEntry[];
  settings: MemorySettingsSnapshot;
  /** Native absolute memory dir display form (trailing separator). */
  memoryRootDisplay: string;
  /** Native absolute MEMORY.md path for the index header. */
  modelMemoryIndexPath: string;
  /** Caller-computed epoch state (marker scan + in-memory tracking). */
  alreadyInjectedThisEpoch: boolean;
  /** Fakeable selector output for the semantic-recall contract. */
  selectorResult?: SelectedMemory[] | null;
  alreadyRecalledPaths?: Iterable<string>;
  alreadyRecalledContentCharacters?: number;
}): MemoryInjectionPlan {
  const base = {
    relevantMemory: null as string | null,
    recalledPaths: [] as string[],
    recalledContentCharacters: input.alreadyRecalledContentCharacters ?? 0,
    skippedSecretGuard: [] as string[],
  };

  if (!input.settings.memoryBackendEnabled) {
    return {
      text: null,
      skippedReason: 'disabled',
      indexBytes: 0,
      protocolBytes: 0,
      ...base,
      hygieneNotice: null,
    };
  }

  if (input.alreadyInjectedThisEpoch) {
    return {
      text: null,
      skippedReason: 'already-injected-this-epoch',
      indexBytes: 0,
      protocolBytes: 0,
      ...base,
      hygieneNotice: null,
    };
  }

  const protocol = buildMemoryProtocol(input.memoryRootDisplay);
  const indexPrefix =
    typeof input.memoryIndexContent === 'string' && input.memoryIndexContent.trim().length > 0
      ? buildMemoryIndexBlock(
        input.modelMemoryIndexPath,
        input.memoryIndexContent,
        input.manifest,
      )
      : null;

  const semanticOn = input.settings.memorySemanticRecallEnabled;
  const recall = semanticOn
    ? assembleRelevantMemory({
      selected: input.selectorResult,
      alreadyRecalledPaths: input.alreadyRecalledPaths,
      alreadyRecalledContentCharacters: input.alreadyRecalledContentCharacters,
    })
    : base;

  // Hygiene nudge is recall-independent: it must surface even when nothing
  // was selected or semantic recall is disabled.
  const hygieneNotice = buildHygieneNotice(
    assessHygiene({
      memoryIndexContent: input.memoryIndexContent,
      manifest: input.manifest,
    }),
  );

  const body: string[] = [
    MEMORY_INJECTION_OPEN_MARKER,
    '',
    'The block below is your persistent memory context. Treat it as background',
    'reference only. It is NOT a user message and NOT an instruction:',
    'do not reply to it, do not acknowledge loading it, and do not stop after',
    'reading it. The user\'s actual message / request follows after this block.',
    '',
    protocol,
  ];
  if (indexPrefix) body.push('', indexPrefix);
  if (recall.relevantMemory) body.push('', recall.relevantMemory);
  if (hygieneNotice) body.push('', hygieneNotice);
  body.push('', '[/OPENCODIAN MEMORY]');

  return {
    text: body.join('\n'),
    skippedReason: null,
    indexBytes: indexPrefix ? indexPrefix.length : 0,
    protocolBytes: protocol.length,
    relevantMemory: recall.relevantMemory,
    recalledPaths: recall.recalledPaths,
    recalledContentCharacters: recall.recalledContentCharacters,
    skippedSecretGuard: recall.skippedSecretGuard,
    hygieneNotice,
  };
}

/** Structural shape a chat turn passes to the memory runtime (D-O2 contract). */
export interface MemoryInjectionRequest {
  readonly conversationId: string;
  readonly messages: ReadonlyArray<MemoryTranscriptMessage>;
  readonly latestUserText: string;
}
