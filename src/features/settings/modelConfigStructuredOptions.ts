import type { KeyValueFieldState } from './modelConfigWorkspace';

export interface StructuredModelOptionsState {
  reasoningEffort: string;
  textVerbosity: string;
  reasoningSummary: string;
  include: string[];
  thinkingType: string;
  thinkingBudgetTokens: string;
}

const STRUCTURED_THINKING_KEY = 'thinking';

export function getStructuredModelOptionsState(fields: KeyValueFieldState[]): StructuredModelOptionsState {
  const thinking = readThinkingObject(fields);
  return {
    reasoningEffort: readStringOption(fields, 'reasoningEffort'),
    textVerbosity: readStringOption(fields, 'textVerbosity'),
    reasoningSummary: readStringOption(fields, 'reasoningSummary'),
    include: readStringArrayOption(fields, 'include'),
    thinkingType: typeof thinking.type === 'string' ? thinking.type : '',
    thinkingBudgetTokens: typeof thinking.budgetTokens === 'number'
      ? String(thinking.budgetTokens)
      : '',
  };
}

export function setStructuredModelOption(
  fields: KeyValueFieldState[],
  key: 'reasoningEffort' | 'textVerbosity' | 'reasoningSummary',
  value: string,
): KeyValueFieldState[] {
  return upsertOption(fields, key, value.trim());
}

export function setStructuredStringArrayOption(
  fields: KeyValueFieldState[],
  key: 'include',
  value: string,
): KeyValueFieldState[] {
  const values = value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return upsertOption(fields, key, values.length > 0 ? JSON.stringify(values) : '');
}

export function setStructuredThinkingType(fields: KeyValueFieldState[], value: string): KeyValueFieldState[] {
  const thinking = readThinkingObject(fields);
  const normalized = value.trim();
  if (normalized) {
    thinking.type = normalized;
  } else {
    delete thinking.type;
  }
  return writeThinkingObject(fields, thinking);
}

export function setStructuredThinkingBudget(fields: KeyValueFieldState[], value: string): KeyValueFieldState[] {
  const thinking = readThinkingObject(fields);
  const trimmed = value.trim();
  if (trimmed) {
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed) && parsed > 0) {
      thinking.budgetTokens = Math.floor(parsed);
    }
  } else {
    delete thinking.budgetTokens;
  }
  return writeThinkingObject(fields, thinking);
}

function readStringOption(fields: KeyValueFieldState[], key: string): string {
  const field = fields.find((entry) => entry.key.trim() === key);
  return field?.value.trim() ?? '';
}

function readStringArrayOption(fields: KeyValueFieldState[], key: string): string[] {
  const field = fields.find((entry) => entry.key.trim() === key);
  if (!field) {
    return [];
  }
  try {
    const parsed = JSON.parse(field.value);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === 'string')
      : [];
  } catch {
    return [];
  }
}

function readThinkingObject(fields: KeyValueFieldState[]): Record<string, unknown> {
  const field = fields.find((entry) => entry.key.trim() === STRUCTURED_THINKING_KEY);
  if (!field) {
    return {};
  }
  try {
    const parsed = JSON.parse(field.value);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? { ...parsed }
      : {};
  } catch {
    return {};
  }
}

function writeThinkingObject(fields: KeyValueFieldState[], thinking: Record<string, unknown>): KeyValueFieldState[] {
  const cleaned = Object.fromEntries(
    Object.entries(thinking).filter(([, value]) => value !== undefined && value !== ''),
  );
  return upsertOption(
    fields,
    STRUCTURED_THINKING_KEY,
    Object.keys(cleaned).length > 0 ? JSON.stringify(cleaned, null, 2) : '',
  );
}

function upsertOption(fields: KeyValueFieldState[], key: string, value: string): KeyValueFieldState[] {
  const existing = fields.find((entry) => entry.key.trim() === key);
  if (!value) {
    return fields.filter((entry) => entry !== existing);
  }
  if (existing) {
    return fields.map((entry) => entry === existing ? { ...entry, key, value } : entry);
  }
  return [
    ...fields,
    {
      uid: `structured-${key}`,
      key,
      value,
    },
  ];
}
