import type { ToolCallInfo } from './types';

function getTaskSessionId(toolCall: Pick<ToolCallInfo, 'toolMetadata'>): string | null {
  const sessionId = typeof toolCall.toolMetadata?.sessionId === 'string'
    ? toolCall.toolMetadata.sessionId.trim()
    : '';
  return sessionId || null;
}

export function renderTaskExpandedContent(
  container: HTMLElement,
  toolCall: ToolCallInfo,
  onOpenToolSession?: (sessionId: string, toolCall: ToolCallInfo) => void,
): void {
  const detailsEl = container.createDiv({ cls: 'streaming-task-details' });
  const subagentType = typeof toolCall.input.subagent_type === 'string'
    ? toolCall.input.subagent_type.trim()
    : '';
  const description = typeof toolCall.input.description === 'string'
    ? toolCall.input.description.trim()
    : typeof toolCall.input.prompt === 'string'
      ? toolCall.input.prompt.trim()
      : '';
  const sessionId = getTaskSessionId(toolCall);

  if (subagentType) {
    detailsEl.createDiv({ cls: 'streaming-task-field', text: `Agent: ${subagentType}` });
  }
  if (description) {
    detailsEl.createDiv({ cls: 'streaming-task-field', text: `Description: ${description}` });
  }
  detailsEl.createDiv({ cls: 'streaming-task-field', text: `Status: ${toolCall.status}` });

  if (sessionId) {
    detailsEl.createDiv({ cls: 'streaming-task-field', text: `Session: ${sessionId}` });
    const openButton = detailsEl.createEl('button', {
      cls: 'streaming-task-session-button',
      text: 'Open subagent session',
    });
    openButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onOpenToolSession?.(sessionId, toolCall);
    });
  } else {
    detailsEl.createDiv({
      cls: 'streaming-task-field streaming-task-field-muted',
      text: 'Session unavailable',
    });
  }

  detailsEl.createDiv({
    cls: 'streaming-task-field streaming-task-field-muted',
    text: toolCall.status === 'error'
      ? 'Task failed. Open the subagent session for details.'
      : 'Task result is kept in the subagent session.',
  });
}
