/**
 * ConversationMarkdownExporter — R-D1 (advantage-parity): the PURE serializer
 * half of conversation export (vault orchestration lives in
 * `ConversationMarkdownExportService.ts`).
 *
 * Copilot's "save chat to note" strength, inherited without its cloud path:
 * this module serializes the plugin's OWN stored message structure
 * (`Conversation.messages`, raw markdown `content` — never rendered HTML)
 * into a frontmatter + per-turn note body, so exports become searchable,
 * linkable, syncable vault citizens. No vault access, no side effects, no
 * i18n: the exported note is a portable document artifact, so its fixed
 * labels ("User", "Assistant", callout titles) are stable English tokens by
 * design; user-facing notices live in the app-layer caller.
 *
 * Images are emitted as `{{opencodian:image:<messageId>:<index>}}`
 * placeholders; the service resolves them to `![[…]]` embeds once the
 * content-addressed attachments are placed.
 */

import { sanitizeVaultFileBaseName } from '../../shared/vault';
import type { ChatMessage, Conversation } from '../types';
import type { ImageAttachment } from '../types/chat';

const MAX_TOOL_INPUT_CHARS = 500;
const MAX_TOOL_RESULT_CHARS = 1000;

export interface BuildConversationMarkdownResult {
  markdown: string;
  /** Images referenced by the body; the caller writes them before the note. */
  pendingImages: Array<ImageAttachment & { messageId: string; index: number }>;
  frontmatterModel: string | null;
}

function formatLocalDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

function yamlQuote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars)}… (${value.length} chars total)`;
}

function formatToolInput(input: Record<string, unknown>): string {
  try {
    return truncateText(JSON.stringify(input), MAX_TOOL_INPUT_CHARS);
  } catch {
    return '(unserializable input)';
  }
}

export function shortConversationId(conversationId: string): string {
  return conversationId.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 8) || 'conv';
}

/**
 * Render the export file name from the user template. Placeholders:
 * {$date} {$time} {$topic}/{$title} {$backend} {$id}; unknown placeholders
 * stay verbatim (honest, debuggable), whitespace collapses to `_`, and the
 * stem goes through the shared vault-safe sanitizer.
 */
export function renderFileName(conversation: Conversation, template: string): string {
  const date = new Date(conversation.createdAt);
  const pad = (value: number) => String(value).padStart(2, '0');
  const replacements: Record<string, string> = {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`,
    topic: sanitizeVaultFileBaseName(conversation.title || 'untitled'),
    title: sanitizeVaultFileBaseName(conversation.title || 'untitled'),
    backend: conversation.backend ?? 'opencode',
    id: shortConversationId(conversation.id),
  };
  const rendered = template.replace(/\{\$(\w+)\}/g, (match, key: string) => (
    key in replacements ? replacements[key] : match
  ));
  const sanitized = sanitizeVaultFileBaseName(rendered.replace(/\s+/g, '_'));
  return sanitized || `conversation-${shortConversationId(conversation.id)}`;
}

/** Serialize one chat message to a folded callout (notices, compaction). */
function renderCalloutMessage(message: ChatMessage, hasContent: boolean): string | null {
  if (message.displayStyle === 'notice') {
    const tone = message.noticeTone === 'warning' || message.noticeTone === 'error'
      ? message.noticeTone
      : 'info';
    const title = message.noticeTitle || 'Notice';
    return `> [!${tone}] ${title}${hasContent ? `\n> ${message.content.split('\n').join('\n> ')}` : ''}`;
  }
  if (message.summary === true) {
    return `> [!abstract]- Compaction summary${hasContent ? `\n> ${message.content.split('\n').join('\n> ')}` : ''}`;
  }
  return null;
}

/** Serialize one regular turn: heading + content + image placeholders + tool calls. */
function renderTurnMessage(
  message: ChatMessage,
  pendingImages: BuildConversationMarkdownResult['pendingImages'],
): string {
  const roleLabel = message.role === 'assistant' ? 'Assistant' : 'User';
  const heading = `## ${roleLabel} · ${formatLocalDateTime(message.timestamp)}`;
  const parts: string[] = [];

  if (typeof message.content === 'string' && message.content.trim().length > 0) {
    parts.push(message.content);
  }

  (message.images ?? []).forEach((image, index) => {
    const extension = ATTACHMENT_EXTENSIONS[image.mediaType];
    if (!extension) {
      parts.push(`> [!warning] Unsupported image type (${image.mediaType}) — not exported`);
      return;
    }
    pendingImages.push({ ...image, messageId: message.id, index });
    // The embed path is resolved by the service once the attachment is
    // placed (the attachment folder may renumber conflicts).
    parts.push(`{{opencodian:image:${message.id}:${index}}}`);
  });

  const turnBlock = parts.length > 0 ? `${heading}\n\n${parts.join('\n\n')}` : heading;

  const toolCalls = message.toolCalls ?? [];
  if (toolCalls.length === 0) {
    return turnBlock;
  }
  const toolLines = toolCalls.map((toolCall) => {
    const status = toolCall.status ?? 'unknown';
    const line = `- **${toolCall.name}** — ${status} · input: ${formatToolInput(toolCall.input)}`;
    if (typeof toolCall.result === 'string' && toolCall.result.trim().length > 0) {
      return `${line}\n  - result: ${truncateText(toolCall.result, MAX_TOOL_RESULT_CHARS).split('\n').join(' ')}`;
    }
    return line;
  });
  // EVERY physical line of the callout body must carry the `> ` prefix — a
  // tool entry's continuation line would otherwise break out of the folded
  // callout in reading view (verified on the real machine).
  const calloutBody = toolLines
    .flatMap((line) => line.split('\n'))
    .map((line) => `> ${line}`)
    .join('\n');
  return `${turnBlock}\n\n> [!example]- Tool calls (${toolCalls.length})\n${calloutBody}`;
}

const ATTACHMENT_EXTENSIONS: Record<ImageAttachment['mediaType'], string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

/**
 * Pure serializer: conversation → markdown document.
 */
export function buildConversationMarkdown(
  conversation: Conversation,
  options: { exportedAt?: number } = {},
): BuildConversationMarkdownResult {
  const exportedAt = options.exportedAt ?? Date.now();
  const pendingImages: BuildConversationMarkdownResult['pendingImages'] = [];
  const bodyBlocks: string[] = [];
  let frontmatterModel: string | null = null;

  for (const message of conversation.messages) {
    const hasContent = typeof message.content === 'string' && message.content.trim().length > 0;
    const hasImages = Array.isArray(message.images) && message.images.length > 0;
    const hasToolCalls = Array.isArray(message.toolCalls) && message.toolCalls.length > 0;
    const isSpecial = message.displayStyle === 'notice' || message.summary === true;

    if (!isSpecial && !hasContent && !hasImages && !hasToolCalls) {
      continue;
    }

    if (isSpecial) {
      bodyBlocks.push(renderCalloutMessage(message, hasContent)!);
      continue;
    }

    if (message.role === 'assistant' && message.modelId) {
      frontmatterModel = message.modelId;
    }
    bodyBlocks.push(renderTurnMessage(message, pendingImages));
  }

  const title = conversation.title || 'Untitled conversation';
  const lines: string[] = [
    '---',
    'opencodian: conversation-export',
    `conversation_id: ${conversation.id}`,
    `backend: ${conversation.backend ?? 'opencode'}`,
    ...(frontmatterModel ? [`model: ${frontmatterModel}`] : []),
    `title: ${yamlQuote(title)}`,
    `created: ${new Date(conversation.createdAt).toISOString()}`,
    `updated: ${new Date(conversation.updatedAt).toISOString()}`,
    `message_count: ${conversation.messages.length}`,
    `exported_at: ${new Date(exportedAt).toISOString()}`,
    '---',
    '',
    `# ${title}`,
    '',
  ];
  lines.push(bodyBlocks.join('\n\n'));
  lines.push('');
  return { markdown: lines.join('\n'), pendingImages, frontmatterModel };
}
