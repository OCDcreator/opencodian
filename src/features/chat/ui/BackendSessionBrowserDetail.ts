import {
  getBackendSessionDetail,
  getBackendSessionPreview,
  type NormalizedSessionDetail,
  type NormalizedSessionPreviewMessage,
  type NormalizedSessionPreviewPart,
} from '../../../core/agents/backend/AgentBackendRouting';
import type { AgentServiceRegistry } from '../../../core/agents/backend/AgentServiceRegistry';
import { t } from '../../../i18n';

/**
 * Render the detail view (metadata + full transcript) for a backend session
 * into the provided preview element.
 */
export async function renderBackendSessionDetail(
  previewEl: HTMLElement,
  sessionId: string,
  registry: AgentServiceRegistry | null,
): Promise<void> {
  previewEl.empty();
  previewEl.createEl('p', {
    cls: 'opencodian-backend-session-browser-preview-loading',
    text: t('chat.backendSessions.detailLoading'),
  });

  // Fetch metadata and transcript in parallel
  const [detailResult, transcriptResult] = await Promise.all([
    getBackendSessionDetail(registry, sessionId).catch(() => null),
    getBackendSessionPreview(registry, sessionId).catch(() => null),
  ]);

  previewEl.empty();

  // Render metadata card
  renderDetailMetadata(previewEl, detailResult);

  // Render full transcript
  renderDetailTranscript(previewEl, transcriptResult);
}

function renderDetailMetadata(containerEl: HTMLElement, detail: NormalizedSessionDetail | null): void {
  const metaEl = containerEl.createDiv({
    cls: 'opencodian-backend-session-browser-detail-metadata',
  });

  metaEl.createEl('h4', { text: t('chat.backendSessions.detailTitle') });

  if (!detail) {
    metaEl.createEl('p', {
      cls: 'opencodian-backend-session-browser-detail-unavailable',
      text: t('chat.backendSessions.detailMetadataUnavailable'),
    });
    return;
  }

  const fields: Array<{ label: string; value: string | null }> = [
    { label: t('chat.backendSessions.detailField.id'), value: detail.id },
    { label: t('chat.backendSessions.detailField.backend'), value: detail.backendKind },
    { label: t('chat.backendSessions.detailField.title'), value: detail.title || null },
    { label: t('chat.backendSessions.detailField.customTitle'), value: detail.customTitle },
    { label: t('chat.backendSessions.detailField.createdAt'), value: detail.createdAt ? formatDateTime(detail.createdAt) : null },
    { label: t('chat.backendSessions.detailField.updatedAt'), value: detail.updatedAt ? formatDateTime(detail.updatedAt) : null },
    { label: t('chat.backendSessions.detailField.gitBranch'), value: detail.gitBranch },
    { label: t('chat.backendSessions.detailField.cwd'), value: detail.cwd },
    { label: t('chat.backendSessions.detailField.tag'), value: detail.tag },
    { label: t('chat.backendSessions.detailField.fileSize'), value: detail.fileSize !== null ? formatFileSize(detail.fileSize) : null },
  ];

  for (const field of fields) {
    if (field.value === null) continue;
    const rowEl = metaEl.createDiv({
      cls: 'opencodian-backend-session-browser-detail-field',
      attr: { 'data-detail-field': field.label },
    });
    rowEl.createEl('span', {
      cls: 'opencodian-backend-session-browser-detail-field-label',
      text: field.label,
    });
    rowEl.createEl('span', {
      cls: 'opencodian-backend-session-browser-detail-field-value',
      text: field.value,
    });
  }
}

function renderDetailTranscript(containerEl: HTMLElement, transcript: NormalizedSessionPreviewMessage[] | null): void {
  const transcriptEl = containerEl.createDiv({
    cls: 'opencodian-backend-session-browser-detail-transcript',
  });

  transcriptEl.createEl('h4', { text: t('chat.backendSessions.detailTranscriptTitle') });

  const noticeEl = transcriptEl.createDiv({
    cls: 'opencodian-backend-session-browser-detail-transcript-notice',
  });
  noticeEl.createEl('p', { text: t('chat.backendSessions.detailTranscriptNotice') });

  if (!transcript || transcript.length === 0) {
    transcriptEl.createEl('p', {
      cls: 'opencodian-backend-session-browser-detail-transcript-empty',
      text: t('chat.backendSessions.detailTranscriptEmpty'),
    });
    return;
  }

  transcriptEl.createEl('p', {
    cls: 'opencodian-backend-session-browser-detail-transcript-count',
    text: t('chat.backendSessions.detailTranscriptCount', { count: transcript.length }),
  });

  const messagesEl = transcriptEl.createDiv({
    cls: 'opencodian-backend-session-browser-detail-messages',
  });

  for (const msg of transcript) {
    if (msg.role === 'activity') {
      for (const part of msg.parts) {
        renderDetailActivityLine(messagesEl, part);
      }
      continue;
    }

    // Skip messages that would produce a blank role-only row
    const hasRenderableContent = msg.parts.some((p) => partHasContent(p));
    if (!hasRenderableContent) continue;

    const msgEl = messagesEl.createDiv({
      cls: `opencodian-backend-session-browser-detail-msg opencodian-backend-session-browser-detail-msg-${msg.role}`,
    });

    msgEl.createDiv({
      cls: 'opencodian-backend-session-browser-detail-msg-role',
      text: msg.role,
    });

    for (const part of msg.parts) {
      renderDetailPart(msgEl, part);
    }
  }
}

/** Whether a part has renderable content (not empty/whitespace-only). */
function partHasContent(part: NormalizedSessionPreviewPart): boolean {
  if (part.type === 'text') {
    return !!part.text && part.text.trim().length > 0;
  }
  // Non-text parts always have some content (serialized JSON or type label)
  return true;
}

/** Icon prefix for an activity part type. */
function activityIcon(partType: string): string {
  switch (partType) {
    case 'tool_call': return '\u2699';
    case 'file_change': return '\u{1F4C4}';
    case 'web_search': return '\u{1F50D}';
    default: return '\u2022';
  }
}

/** Render a single activity line in the detail transcript. */
function renderDetailActivityLine(containerEl: HTMLElement, part: NormalizedSessionPreviewPart): void {
  const icon = activityIcon(part.type);
  const label = part.type === 'tool_call'
    ? t('chat.backendSessions.activityTool')
    : part.type === 'file_change'
      ? t('chat.backendSessions.activityFile')
      : part.type === 'web_search'
        ? t('chat.backendSessions.activitySearch')
        : '';
  const lineEl = containerEl.createDiv({
    cls: 'opencodian-backend-session-browser-detail-activity',
    attr: { 'data-activity': part.type },
  });
  lineEl.createSpan({ cls: 'opencodian-backend-session-browser-detail-activity-icon', text: icon });
  if (label) {
    lineEl.createSpan({ cls: 'opencodian-backend-session-browser-detail-activity-label', text: label });
  }
  lineEl.createSpan({ cls: 'opencodian-backend-session-browser-detail-activity-text', text: part.text });
}

/** Render a single transcript part — text inline, non-text as a collapsed summary. */
function renderDetailPart(containerEl: HTMLElement, part: NormalizedSessionPreviewPart): void {
  if (part.type === 'text' && part.text && part.text.trim().length > 0) {
    // No truncation in detail view — full text
    containerEl.createDiv({
      cls: 'opencodian-backend-session-browser-detail-msg-text',
      text: part.text,
    });
    return;
  }

  if (part.type === 'text') {
    // Empty or whitespace-only text part — skip
    return;
  }

  // Non-text part: render as collapsed <details> with type label
  const detailsEl = containerEl.createEl('details', {
    cls: 'opencodian-backend-session-browser-detail-part-collapsed',
  });
  detailsEl.createEl('summary', {
    text: t('chat.backendSessions.detailNonTextPart', { type: part.type }),
  });
  const content = part.text || t('chat.backendSessions.detailNonTextPartEmpty');
  detailsEl.createEl('pre', {
    cls: 'opencodian-backend-session-browser-detail-part-content',
    text: content,
  });
}

function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
