/**
 * BatchOrganizePlan — pure planning core for batch note organizing (R-B5).
 *
 * docs/requirements/flowtext-parity.md R-B5: task templates (find by tag /
 * property / keyword and move, batch-edit frontmatter properties, rule-based
 * rename), a real preview computed from vault state, and a fail-closed
 * preview→execute handshake. This module holds only deterministic,
 * Obsidian-free logic so it can be unit-tested directly:
 *
 * - scope matching (tag / property / keyword) over plain note snapshots;
 * - template → operation plan compilation (move / rename / property edit)
 *   with deterministic ordering and explicit target-collision exclusions;
 * - the plan signature used for the stale-plan check: the executor recomputes
 *   the plan right before writing and refuses to run when the vault changed
 *   between preview and confirm (zero writes on mismatch);
 * - typed frontmatter value parsing plus the property mutation applied inside
 *   Obsidian's `processFrontMatter` callback (YAML serialization itself stays
 *   with Obsidian, so existing formatting and property types survive).
 *
 * Template labels are product assets and live in the zh/en locales under
 * `batchOrganize.*`; this module never carries user-facing wording.
 *
 * The stateful vault-facing owner is `src/app/batchOrganize/`.
 */

/** The built-in batch-organizing task templates (labels resolved via i18n). */
export type BatchOrganizeTemplateId = 'move-notes' | 'edit-properties' | 'rename-by-rule';

export const BATCH_ORGANIZE_TEMPLATE_IDS: readonly BatchOrganizeTemplateId[] = [
  'move-notes',
  'edit-properties',
  'rename-by-rule',
];

/** Which notes a batch template selects. */
export type BatchScope =
  | { kind: 'tag'; tag: string }
  | { kind: 'property'; name: string; /** `null` matches "property exists". */ value: string | null }
  | { kind: 'keyword'; text: string };

/** Frontmatter value with an explicit Obsidian property type. */
export type BatchPropertyValue =
  | { type: 'text'; value: string }
  | { type: 'number'; value: number }
  | { type: 'boolean'; value: boolean }
  | { type: 'list'; value: readonly string[] };

export type BatchPropertyCondition =
  | { kind: 'equals'; name: string; value: string }
  | { kind: 'exists'; name: string };

export type BatchPropertyOperation =
  | { op: 'set'; name: string; value: BatchPropertyValue }
  | { op: 'remove'; name: string }
  | { op: 'set-if'; name: string; value: BatchPropertyValue; condition: BatchPropertyCondition };

export interface BatchMoveParams {
  scope: BatchScope;
  /** Vault-relative target folder ('' = vault root). */
  targetFolder: string;
}

export interface BatchEditPropertiesParams {
  scope: BatchScope;
  operation: BatchPropertyOperation;
}

export interface BatchRenameParams {
  scope: BatchScope;
  find: string;
  replaceWith: string;
  /** Treat `find` as a regular expression instead of a literal. */
  useRegex: boolean;
}

export type BatchTemplateParams =
  | { templateId: 'move-notes'; params: BatchMoveParams }
  | { templateId: 'edit-properties'; params: BatchEditPropertiesParams }
  | { templateId: 'rename-by-rule'; params: BatchRenameParams };

/** Plain note record the matchers run against (built from metadata cache + content). */
export interface BatchNoteSnapshot {
  /** Vault-relative path with `/` separators, `.md` extension. */
  readonly path: string;
  /** Basename without extension. */
  readonly name: string;
  /** Tags with the leading `#` stripped (frontmatter + inline). */
  readonly tags: readonly string[];
  /** Frontmatter properties as parsed by Obsidian. */
  readonly properties: Readonly<Record<string, unknown>>;
  /** Lowercased note content for keyword matching; `undefined` = name-only. */
  readonly contentText?: string;
}

export type BatchOperation =
  /** Move into another folder (`fileManager.renameFile` — references update). */
  | { kind: 'move'; from: string; to: string }
  /** Rule-based rename within the same folder (`fileManager.renameFile`). */
  | { kind: 'rename'; from: string; to: string }
  /** Frontmatter edit through `processFrontMatter`. */
  | { kind: 'edit-properties'; path: string };

export type BatchConflictReason = 'target-exists' | 'duplicate-target';

/** A planned operation excluded because its target path is occupied twice. */
export interface BatchConflict {
  readonly from: string;
  readonly to: string;
  readonly reason: BatchConflictReason;
}

export interface BatchPlan {
  readonly templateId: BatchOrganizeTemplateId;
  /** Deterministically ordered (ascending source path). */
  readonly operations: readonly BatchOperation[];
}

export interface BatchPlanResult {
  readonly plan: BatchPlan;
  readonly conflicts: readonly BatchConflict[];
}

export type BatchParamErrorCode = 'invalid-folder' | 'invalid-rename-rule' | 'invalid-property-name';

/**
 * Compile a template + note snapshots into a previewable plan.
 *
 * `existingPaths` is the set of all vault markdown paths at planning time;
 * planned renames/moves into an occupied path are excluded as conflicts
 * (fail-closed: never overwrite). Property no-ops and unmet conditions are
 * silently excluded — the preview list is exactly what would change.
 */
export function buildBatchPlan(
  template: BatchTemplateParams,
  notes: readonly BatchNoteSnapshot[],
  existingPaths: ReadonlySet<string>,
): BatchPlanResult {
  const matched = notes.filter((note) => matchesBatchScope(note, scopeOf(template)));
  switch (template.templateId) {
    case 'move-notes':
      return planMoves(template.params, matched, existingPaths);
    case 'rename-by-rule':
      return planRenames(template.params, matched, existingPaths);
    case 'edit-properties':
      return planPropertyEdits(template.params, matched);
  }
}

function scopeOf(template: BatchTemplateParams): BatchScope {
  return template.params.scope;
}

function planMoves(
  params: BatchMoveParams,
  notes: readonly BatchNoteSnapshot[],
  existingPaths: ReadonlySet<string>,
): BatchPlanResult {
  const folder = params.targetFolder;
  const operations: BatchOperation[] = [];
  const conflicts: BatchConflict[] = [];
  const claimedTargets = new Map<string, string>();
  for (const note of notes) {
    const directory = directoryOf(note.path);
    if (directory === folder) {
      continue; // already in the target folder
    }
    const to = folder ? `${folder}/${basenameOf(note.path)}` : basenameOf(note.path);
    const conflict = classifyTargetConflict(to, note.path, existingPaths, claimedTargets);
    if (conflict) {
      conflicts.push({ from: note.path, to, reason: conflict });
      continue;
    }
    claimedTargets.set(to, note.path);
    operations.push({ kind: 'move', from: note.path, to });
  }
  return { plan: { templateId: 'move-notes', operations: sortOperations(operations) }, conflicts };
}

function planRenames(
  params: BatchRenameParams,
  notes: readonly BatchNoteSnapshot[],
  existingPaths: ReadonlySet<string>,
): BatchPlanResult {
  const ruleError = validateRenameRule(params);
  if (ruleError) {
    return { plan: { templateId: 'rename-by-rule', operations: [] }, conflicts: [] };
  }
  const operations: BatchOperation[] = [];
  const conflicts: BatchConflict[] = [];
  const claimedTargets = new Map<string, string>();
  for (const note of notes) {
    const directory = directoryOf(note.path);
    const nextStem = applyRenameRule(note.name, params);
    if (!nextStem || nextStem === note.name) {
      continue; // rule produced nothing new
    }
    const to = directory ? `${directory}/${nextStem}.md` : `${nextStem}.md`;
    const conflict = classifyTargetConflict(to, note.path, existingPaths, claimedTargets);
    if (conflict) {
      conflicts.push({ from: note.path, to, reason: conflict });
      continue;
    }
    claimedTargets.set(to, note.path);
    operations.push({ kind: 'rename', from: note.path, to });
  }
  return { plan: { templateId: 'rename-by-rule', operations: sortOperations(operations) }, conflicts };
}

function planPropertyEdits(
  params: BatchEditPropertiesParams,
  notes: readonly BatchNoteSnapshot[],
): BatchPlanResult {
  const operations = notes
    .filter((note) => propertyOperationWouldChange(note.properties, params.operation))
    .map<BatchOperation>((note) => ({ kind: 'edit-properties', path: note.path }));
  return { plan: { templateId: 'edit-properties', operations: sortOperations(operations) }, conflicts: [] };
}

function classifyTargetConflict(
  to: string,
  from: string,
  existingPaths: ReadonlySet<string>,
  claimedTargets: Map<string, string>,
): BatchConflictReason | null {
  const claimedBy = claimedTargets.get(to);
  if (claimedBy !== undefined && claimedBy !== from) {
    return 'duplicate-target';
  }
  if (existingPaths.has(to) && to !== from) {
    return 'target-exists';
  }
  return null;
}

function sortOperations(operations: BatchOperation[]): BatchOperation[] {
  return [...operations].sort((a, b) => comparePaths(sourceOf(a), sourceOf(b)));
}

function sourceOf(operation: BatchOperation): string {
  return operation.kind === 'edit-properties' ? operation.path : operation.from;
}

function comparePaths(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// --- scope matching -----------------------------------------------------------

/**
 * Tag comparison is case-insensitive and `#`-tolerant; property values are
 * compared after scalar string coercion; keyword matches the note name and
 * (when snapshot content is present) the content, case-insensitively.
 */
export function matchesBatchScope(note: BatchNoteSnapshot, scope: BatchScope): boolean {
  switch (scope.kind) {
    case 'tag': {
      const wanted = normalizeTag(scope.tag);
      if (!wanted) {
        return false;
      }
      return note.tags.some((tag) => normalizeTag(tag) === wanted);
    }
    case 'property': {
      if (!scope.name) {
        return false;
      }
      if (!(scope.name in note.properties)) {
        return false;
      }
      if (scope.value === null) {
        return true;
      }
      return coercePropertyToString(note.properties[scope.name]) === scope.value;
    }
    case 'keyword': {
      const needle = scope.text.trim().toLowerCase();
      if (!needle) {
        return false;
      }
      if (note.name.toLowerCase().includes(needle)) {
        return true;
      }
      return note.contentText !== undefined && note.contentText.includes(needle);
    }
  }
}

/** Strip the leading `#` and trim; comparison happens lowercased. */
export function normalizeTag(raw: string): string {
  return raw.trim().replace(/^#/, '').toLowerCase();
}

/**
 * Normalize a raw tags value (frontmatter `tags`: string, comma-separated
 * string, or string array) plus inline tags (`#foo/bar`) into canonical tags.
 */
export function normalizeTagList(frontmatterTags: unknown, inlineTags: readonly string[]): string[] {
  const tags = new Set<string>();
  const push = (raw: string): void => {
    const normalized = normalizeTag(raw);
    if (normalized) {
      tags.add(normalized);
    }
  };
  if (typeof frontmatterTags === 'string') {
    for (const part of frontmatterTags.split(/[,\s]+/)) {
      push(part);
    }
  } else if (Array.isArray(frontmatterTags)) {
    for (const part of frontmatterTags) {
      if (typeof part === 'string') {
        push(part);
      }
    }
  }
  for (const inline of inlineTags) {
    push(inline);
  }
  return [...tags];
}

/** Scalar string coercion; `null` for arrays/objects (never equal by value). */
export function coercePropertyToString(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return null;
}

// --- parameter validation -------------------------------------------------------

/** Normalize a user-typed target folder; `null` when it is not a safe relative folder. */
export function validateTargetFolder(raw: string): string | null {
  const normalized = raw.trim().replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/^\/+/, '').replace(/\/+$/, '');
  if (!normalized) {
    return ''; // vault root
  }
  if (normalized.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    return null;
  }
  if (normalized.includes(':')) {
    return null;
  }
  return normalized;
}

/** Error code for an unusable rename rule, or `null` when the rule is valid. */
export function validateRenameRule(params: Pick<BatchRenameParams, 'find' | 'useRegex'>): BatchParamErrorCode | null {
  if (!params.find.trim()) {
    return 'invalid-rename-rule';
  }
  if (params.useRegex) {
    try {
      new RegExp(params.find);
    } catch {
      return 'invalid-rename-rule';
    }
  }
  return null;
}

export function validatePropertyName(name: string): BatchParamErrorCode | null {
  return name.trim() ? null : 'invalid-property-name';
}

/** Apply the rename rule to a note stem; empty result means "rule erases the name". */
export function applyRenameRule(stem: string, params: Pick<BatchRenameParams, 'find' | 'replaceWith' | 'useRegex'>): string {
  let next: string;
  if (params.useRegex) {
    next = stem.replace(new RegExp(params.find, 'g'), params.replaceWith);
  } else {
    next = stem.split(params.find).join(params.replaceWith);
  }
  next = next.trim();
  if (!next || next === '.' || next === '..' || next.includes('/') || next.includes('\\')) {
    return '';
  }
  return next;
}

// --- typed property values --------------------------------------------------------

/** Parse a raw settings-form input into a typed property value; `null` = invalid. */
export function parseBatchPropertyValue(raw: string, type: BatchPropertyValue['type']): BatchPropertyValue | null {
  switch (type) {
    case 'text':
      return { type, value: raw };
    case 'number': {
      const parsed = Number(raw.trim());
      return raw.trim() !== '' && Number.isFinite(parsed) ? { type, value: parsed } : null;
    }
    case 'boolean':
      if (raw.trim() === 'true') return { type, value: true };
      if (raw.trim() === 'false') return { type, value: false };
      return null;
    case 'list': {
      const items = raw.split(',').map((item) => item.trim()).filter((item) => item.length > 0);
      return items.length > 0 ? { type, value: items } : null;
    }
  }
}

function typedValueEquals(current: unknown, value: BatchPropertyValue): boolean {
  switch (value.type) {
    case 'text':
      return current === value.value;
    case 'number':
      return typeof current === 'number' && current === value.value;
    case 'boolean':
      return current === value.value;
    case 'list':
      return Array.isArray(current)
        && current.length === value.value.length
        && value.value.every((item, index) => current[index] === item);
  }
}

function toPlainValue(value: BatchPropertyValue): unknown {
  return value.type === 'list' ? [...value.value] : value.value;
}

function conditionMatches(properties: Readonly<Record<string, unknown>>, condition: BatchPropertyCondition): boolean {
  if (!(condition.name in properties)) {
    return false;
  }
  if (condition.kind === 'exists') {
    return true;
  }
  return coercePropertyToString(properties[condition.name]) === condition.value;
}

/** True when applying the operation to these properties changes anything. */
export function propertyOperationWouldChange(
  properties: Readonly<Record<string, unknown>>,
  operation: BatchPropertyOperation,
): boolean {
  if (operation.op === 'remove') {
    return operation.name in properties;
  }
  if (operation.op === 'set-if' && !conditionMatches(properties, operation.condition)) {
    return false;
  }
  return !typedValueEquals(properties[operation.name], operation.value);
}

/**
 * Mutate the frontmatter object inside Obsidian's `processFrontMatter`
 * callback. Values are written with their declared JS types so Obsidian's
 * property panel keeps showing text/number/boolean/list correctly; YAML
 * serialization stays entirely with Obsidian.
 */
export function applyBatchPropertyOperation(
  frontmatter: Record<string, unknown>,
  operation: BatchPropertyOperation,
): void {
  if (operation.op === 'remove') {
    delete frontmatter[operation.name];
    return;
  }
  if (operation.op === 'set-if' && !conditionMatches(frontmatter, operation.condition)) {
    return;
  }
  frontmatter[operation.name] = toPlainValue(operation.value);
}

// --- stale-plan handshake -----------------------------------------------------------

/**
 * Stable signature of a compiled plan. The executor recomputes the plan from
 * live vault state right before writing and refuses to execute when the
 * signature differs from the confirmed preview (vault changed in between —
 * fail closed with zero writes).
 */
export function planSignature(result: BatchPlanResult): string {
  return JSON.stringify({ templateId: result.plan.templateId, operations: result.plan.operations });
}

export function plansAreIdentical(a: BatchPlanResult, b: BatchPlanResult): boolean {
  return planSignature(a) === planSignature(b);
}

// --- path helpers --------------------------------------------------------------------

/**
 * Distinct target folders of move/rename operations, codepoint-sorted so a
 * parent always precedes its nested children. The vault root (`''`) is
 * excluded — it trivially exists. The executor ensures each of these exists
 * (`vault.createFolder`) before the first write; the preview shows the ones
 * currently missing as "folders to be created".
 */
export function collectTargetFolders(operations: readonly BatchOperation[]): string[] {
  const folders = new Set<string>();
  for (const operation of operations) {
    if (operation.kind === 'edit-properties') {
      continue;
    }
    const folder = directoryOf(operation.to);
    if (folder) {
      folders.add(folder);
    }
  }
  return [...folders].sort(comparePaths);
}

export function basenameOf(path: string): string {
  const segments = path.split('/');
  return segments[segments.length - 1] ?? path;
}

export function directoryOf(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}
