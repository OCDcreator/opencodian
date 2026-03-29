import type { OmoBackgroundTaskInfo, OmoMessageMeta, OmoReminderType } from '../types';

const OMO_INTERNAL_INITIATOR_MARKER = '<!-- OMO_INTERNAL_INITIATOR -->';
const SYSTEM_REMINDER_TAG_PATTERN = /<system-reminder>([\s\S]*?)<\/system-reminder>/i;
const MODE_LINE_PATTERN = /^\[([a-z0-9-]+-mode)\]\s*$/i;

function getFirstMeaningfulLine(text: string): string {
  const line = text
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0);

  return line ?? '';
}

function normalizeMultilineText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function classifyReminderType(reminderText: string): OmoReminderType {
  const normalized = reminderText.toUpperCase();
  if (normalized.includes('[ALL BACKGROUND TASKS COMPLETE]')) {
    return 'all-background-tasks-complete';
  }
  if (normalized.includes('[BACKGROUND TASK COMPLETED]')) {
    return 'background-task-completed';
  }
  return 'generic';
}

function stripMarkdownEmphasis(line: string): string {
  return line.replace(/\*\*/g, '').trim();
}

function parseSingleBackgroundTask(lines: string[]): OmoBackgroundTaskInfo[] {
  let id = '';
  let description = '';

  for (const line of lines) {
    const normalized = stripMarkdownEmphasis(line);

    if (!id) {
      const idMatch = normalized.match(/^ID:\s*`([^`]+)`$/i);
      if (idMatch?.[1]) {
        id = idMatch[1].trim();
        continue;
      }
    }

    if (!description) {
      const descriptionMatch = normalized.match(/^Description:\s*(.+)$/i);
      if (descriptionMatch?.[1]) {
        description = descriptionMatch[1].trim();
      }
    }
  }

  return id || description
    ? [{ id, description }]
    : [];
}

function parseCompletedBackgroundTasks(lines: string[]): OmoBackgroundTaskInfo[] {
  const tasks: OmoBackgroundTaskInfo[] = [];

  for (const line of lines) {
    const normalized = stripMarkdownEmphasis(line);
    const taskMatch = normalized.match(/^-\s*`([^`]+)`\s*:\s*(.+)$/);
    if (!taskMatch?.[1] || !taskMatch[2]) {
      continue;
    }

    tasks.push({
      id: taskMatch[1].trim(),
      description: taskMatch[2].trim(),
    });
  }

  return tasks;
}

function parseReminderTasks(reminderText: string, reminderType: OmoReminderType): OmoBackgroundTaskInfo[] | undefined {
  const lines = reminderText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (reminderType === 'background-task-completed') {
    const tasks = parseSingleBackgroundTask(lines);
    return tasks.length > 0 ? tasks : undefined;
  }

  if (reminderType === 'all-background-tasks-complete') {
    const tasks = parseCompletedBackgroundTasks(lines);
    return tasks.length > 0 ? tasks : undefined;
  }

  return undefined;
}

function detectSystemReminder(text: string): OmoMessageMeta | null {
  const hasInternalMarker = text.includes(OMO_INTERNAL_INITIATOR_MARKER);
  const tagMatch = text.match(SYSTEM_REMINDER_TAG_PATTERN);
  if (!tagMatch && !hasInternalMarker) {
    return null;
  }

  const reminderText = normalizeMultilineText(
    (tagMatch?.[1] ?? text)
      .replace(OMO_INTERNAL_INITIATOR_MARKER, '')
      .replace(SYSTEM_REMINDER_TAG_PATTERN, '$1'),
  );
  if (!reminderText) {
    return null;
  }

  const reminderType = classifyReminderType(reminderText);

  return {
    kind: 'system-reminder',
    reminderType,
    reminderText,
    rawText: text.trim(),
    headline: getFirstMeaningfulLine(reminderText),
    isInternalInitiator: hasInternalMarker,
    tasks: parseReminderTasks(reminderText, reminderType),
  };
}

function detectUserInjection(text: string): OmoMessageMeta | null {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return null;
  }

  const lines = normalized.split('\n');
  const modeMatch = lines[0]?.trim().match(MODE_LINE_PATTERN);
  if (!modeMatch) {
    return null;
  }

  let separatorIndex = -1;
  for (let index = lines.length - 1; index >= 1; index -= 1) {
    if (lines[index].trim() === '---') {
      separatorIndex = index;
      break;
    }
  }

  if (separatorIndex <= 1 || separatorIndex >= lines.length - 1) {
    return null;
  }

  const injectedPrompt = normalizeMultilineText(lines.slice(1, separatorIndex).join('\n'));
  const originalText = normalizeMultilineText(lines.slice(separatorIndex + 1).join('\n'));
  if (!injectedPrompt || !originalText) {
    return null;
  }

  return {
    kind: 'user-injection',
    modeTag: modeMatch[1].toLowerCase(),
    injectedPrompt,
    originalText,
    rawText: normalized,
    headline: getFirstMeaningfulLine(injectedPrompt),
  };
}

export function detectOmoMessageMeta(
  role: 'user' | 'assistant',
  text: string,
): OmoMessageMeta | null {
  const systemReminder = detectSystemReminder(text);
  if (systemReminder) {
    return systemReminder;
  }

  if (role === 'user') {
    return detectUserInjection(text);
  }

  return null;
}
