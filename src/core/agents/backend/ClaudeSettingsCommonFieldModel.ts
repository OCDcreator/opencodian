/**
 * Pure common-settings field model, grounded only in the installed Agent SDK
 * 0.3.145 auto-generated Settings interface (sdk.d.ts:3943) and CLI 2.1.204.
 * Catalog metadata + a fine-grained edit seam. No stringification, no writing,
 * no input mutation.
 */
import { type JsoncPathEdit } from './ProjectResourceSecureWrite';

export type ClaudeCommonFieldKind = 'string' | 'number' | 'boolean' | 'string-array' | 'string-record';

export interface ClaudeCommonFieldMeta {
  readonly id: string;
  readonly path: readonly (string | number)[];
  readonly kind: ClaudeCommonFieldKind;
  /** Allowed values for an enum-like string field (e.g. permissions.defaultMode). */
  readonly options?: readonly string[];
  /** Inclusive numeric minimum (e.g. cleanupPeriodDays Minimum 1). */
  readonly min?: number;
}

/**
 * SDK-grounded catalog. Field lines (sdk.d.ts): model@4066, permissions.defaultMode@4052,
 * allow@4040 / deny@4044 / ask@4048, env@4009 ({[k:string]:string}),
 * cleanupPeriodDays@3993 (number, "Minimum 1"), respectGitignore@3989,
 * includeGitInstructions@4032.
 */
export const CLAUDE_SETTINGS_COMMON_FIELDS: readonly ClaudeCommonFieldMeta[] = [
  { id: 'model', path: ['model'], kind: 'string' },
  { id: 'permissions.defaultMode', path: ['permissions', 'defaultMode'], kind: 'string', options: ['acceptEdits', 'auto', 'bypassPermissions', 'default', 'dontAsk', 'plan'] },
  { id: 'permissions.allow', path: ['permissions', 'allow'], kind: 'string-array' },
  { id: 'permissions.ask', path: ['permissions', 'ask'], kind: 'string-array' },
  { id: 'permissions.deny', path: ['permissions', 'deny'], kind: 'string-array' },
  { id: 'env', path: ['env'], kind: 'string-record' },
  { id: 'cleanupPeriodDays', path: ['cleanupPeriodDays'], kind: 'number', min: 1 },
  { id: 'respectGitignore', path: ['respectGitignore'], kind: 'boolean' },
  { id: 'includeGitInstructions', path: ['includeGitInstructions'], kind: 'boolean' },
];

export interface ClaudeCommonFieldEvidence {
  readonly sdkVersion: string;
  readonly sdkSettingsInterfaceLine: number;
  readonly cliVersion: string;
}

export const CLAUDE_SETTINGS_COMMON_FIELD_EVIDENCE: ClaudeCommonFieldEvidence = {
  sdkVersion: '0.3.145',
  sdkSettingsInterfaceLine: 3943,
  cliVersion: '2.1.204',
};

export type ClaudeCommonFieldEditResult =
  | { ok: true; edit: JsoncPathEdit }
  | { ok: false; diagnostics: readonly { readonly path: string; readonly message: string }[] };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function matchesKind(value: unknown, meta: ClaudeCommonFieldMeta): boolean {
  switch (meta.kind) {
    case 'string':
      return typeof value === 'string' && (meta.options === undefined || meta.options.includes(value));
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) && (meta.min === undefined || value >= meta.min);
    case 'boolean':
      return typeof value === 'boolean';
    case 'string-array':
      return Array.isArray(value) && value.every((e) => typeof e === 'string');
    case 'string-record':
      return isPlainObject(value) && Object.values(value).every((v) => typeof v === 'string');
    default:
      return false;
  }
}

/**
 * Build one fine-grained `JsoncPathEdit` for a common settings field.
 * `null` removes the field (edit value undefined). Non-null values must match
 * the documented kind/range/enum. If a nested parent (e.g. permissions) exists
 * but is not a plain object, fail closed rather than overwriting it. Pure: no
 * stringify/write/input mutation. The applier (applyJsoncPathEdits) creates
 * missing parents and preserves unknown siblings/order/formatting locality.
 */
export function buildClaudeSettingsCommonFieldEdit(
  settings: unknown,
  fieldId: string,
  value: unknown,
): ClaudeCommonFieldEditResult {
  const diagnostics: { path: string; message: string }[] = [];
  const fail = (): ClaudeCommonFieldEditResult => ({ ok: false, diagnostics });

  const meta = CLAUDE_SETTINGS_COMMON_FIELDS.find((f) => f.id === fieldId);
  if (meta === undefined) {
    diagnostics.push({ path: fieldId, message: 'unknown common settings field' });
    return fail();
  }
  if (!isPlainObject(settings)) {
    diagnostics.push({ path: 'settings', message: 'settings must be a plain object' });
    return fail();
  }

  // If the field is nested, its existing parent (if any) must be a plain object;
  // do not overwrite a non-object parent.
  if (meta.path.length > 1) {
    let cursor: unknown = settings;
    for (let i = 0; i < meta.path.length - 1; i++) {
      if (!isPlainObject(cursor)) {
        diagnostics.push({ path: meta.path.slice(0, i + 1).join('.'), message: 'parent is not a plain object' });
        return fail();
      }
      cursor = cursor[meta.path[i] as string];
    }
    if (cursor !== undefined && !isPlainObject(cursor)) {
      diagnostics.push({ path: meta.path.slice(0, -1).join('.'), message: 'parent is not a plain object' });
      return fail();
    }
  }

  // null removes the field
  if (value === null) {
    return { ok: true, edit: { path: [...meta.path], value: undefined } };
  }
  if (!matchesKind(value, meta)) {
    const constraint = meta.options !== undefined ? ` (one of ${meta.options.join('|')})` : meta.min !== undefined ? ` (>= ${meta.min})` : '';
    diagnostics.push({ path: meta.path.join('.'), message: `field ${fieldId} must be of kind ${meta.kind}${constraint}` });
    return fail();
  }
  return { ok: true, edit: { path: [...meta.path], value } };
}
