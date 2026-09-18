/**
 * BatchOrganizePlan unit tests (R-B5 批量整理, pure planning core).
 *
 * Covers docs/requirements/flowtext-parity.md §R-B5 unit-testable surface:
 * scope matching (tag / property / keyword), template → plan compilation
 * with deterministic ordering and target-collision exclusion, typed
 * frontmatter value parsing and the processFrontMatter mutation, and the
 * plan signature used for the fail-closed stale-plan handshake.
 */

import {
  applyBatchPropertyOperation,
  type BatchNoteSnapshot,
  type BatchOperation,
  buildBatchPlan,
  coercePropertyToString,
  collectTargetFolders,
  matchesBatchScope,
  normalizeTag,
  normalizeTagList,
  parseBatchPropertyValue,
  plansAreIdentical,
  planSignature,
  propertyOperationWouldChange,
  validatePropertyName,
  validateRenameRule,
  validateTargetFolder,
} from '../../../src/shared';

function note(overrides: Partial<BatchNoteSnapshot> & { path: string }): BatchNoteSnapshot {
  return {
    name: overrides.path.split('/').pop()?.replace(/\.md$/, '') ?? '',
    tags: [],
    properties: {},
    ...overrides,
  };
}

const MOVE_TEMPLATE = {
  templateId: 'move-notes',
  params: { scope: { kind: 'tag', tag: '待整理' }, targetFolder: '归档' },
} as const;

describe('batch scope matching (R-B5)', () => {
  it('matches tags with or without #, case-insensitively, including nested tags', () => {
    const n = note({ path: 'a.md', tags: ['Book/ToRead', '待整理'] });
    expect(matchesBatchScope(n, { kind: 'tag', tag: '待整理' })).toBe(true);
    expect(matchesBatchScope(n, { kind: 'tag', tag: '#待整理' })).toBe(true);
    expect(matchesBatchScope(n, { kind: 'tag', tag: 'tobook' })).toBe(false);
    expect(matchesBatchScope(n, { kind: 'tag', tag: 'book/toread' })).toBe(true);
    expect(matchesBatchScope(n, { kind: 'tag', tag: '' })).toBe(false);
  });

  it('normalizes frontmatter and inline tag sources', () => {
    expect(normalizeTagList('a, b c', ['#d', '#e/f'])).toEqual(['a', 'b', 'c', 'd', 'e/f']);
    expect(normalizeTagList(['X', '#y'], [])).toEqual(['x', 'y']);
    expect(normalizeTagList(undefined, [])).toEqual([]);
  });

  it('matches properties by existence and by scalar value coercion', () => {
    const n = note({ path: 'a.md', properties: { status: 'done', rating: 5, pinned: true } });
    expect(matchesBatchScope(n, { kind: 'property', name: 'status', value: null })).toBe(true);
    expect(matchesBatchScope(n, { kind: 'property', name: 'status', value: 'done' })).toBe(true);
    expect(matchesBatchScope(n, { kind: 'property', name: 'status', value: 'todo' })).toBe(false);
    expect(matchesBatchScope(n, { kind: 'property', name: 'rating', value: '5' })).toBe(true);
    expect(matchesBatchScope(n, { kind: 'property', name: 'pinned', value: 'true' })).toBe(true);
    expect(matchesBatchScope(n, { kind: 'property', name: 'missing', value: null })).toBe(false);
    expect(matchesBatchScope(n, { kind: 'property', name: '', value: null })).toBe(false);
  });

  it('matches keywords in the note name and (when present) the content', () => {
    const n = note({ path: 'meeting-notes.md', contentText: 'quarterly budget discussion' });
    expect(matchesBatchScope(n, { kind: 'keyword', text: 'Meeting' })).toBe(true);
    expect(matchesBatchScope(n, { kind: 'keyword', text: 'BUDGET' })).toBe(true);
    expect(matchesBatchScope(n, { kind: 'keyword', text: 'absent' })).toBe(false);
    expect(matchesBatchScope(n, { kind: 'keyword', text: '' })).toBe(false);
    // Name-only snapshot (no content read): name still matches.
    expect(matchesBatchScope(note({ path: 'meeting-notes.md' }), { kind: 'keyword', text: 'meeting' })).toBe(true);
  });
});

describe('move template planning (R-B5)', () => {
  const existing = new Set(['notes/a.md', 'notes/b.md', 'inbox/a.md', '归档/keep.md']);

  it('plans moves for matched notes, skipping ones already in the target folder', () => {
    const notes = [
      note({ path: 'notes/a.md', tags: ['待整理'] }),
      note({ path: 'notes/b.md', tags: ['other'] }),
      note({ path: '归档/keep.md', tags: ['待整理'] }),
    ];
    const { plan, conflicts } = buildBatchPlan(MOVE_TEMPLATE, notes, existing);
    expect(plan.operations).toEqual([{ kind: 'move', from: 'notes/a.md', to: '归档/a.md' }]);
    expect(conflicts).toEqual([]);
  });

  it('reports conflicts instead of overwriting an occupied target', () => {
    const notes = [
      note({ path: 'notes/a.md', tags: ['待整理'] }),
      note({ path: 'inbox/a.md', tags: ['待整理'] }),
    ];
    const { plan, conflicts } = buildBatchPlan(MOVE_TEMPLATE, notes, existing);
    expect(plan.operations).toEqual([{ kind: 'move', from: 'notes/a.md', to: '归档/a.md' }]);
    expect(conflicts).toEqual([{ from: 'inbox/a.md', to: '归档/a.md', reason: 'duplicate-target' }]);
  });

  it('flags a target that already exists in the vault as target-exists', () => {
    const notes = [note({ path: 'notes/a.md', tags: ['待整理'] })];
    const { conflicts } = buildBatchPlan(
      { templateId: 'move-notes', params: { scope: { kind: 'tag', tag: '待整理' }, targetFolder: '归档' } },
      notes,
      new Set([...existing, '归档/a.md']),
    );
    expect(conflicts).toEqual([{ from: 'notes/a.md', to: '归档/a.md', reason: 'target-exists' }]);
  });

  it('supports the vault root as target and sorts operations deterministically', () => {
    const notes = [note({ path: 'z.md', tags: ['t'] }), note({ path: 'sub/a.md', tags: ['t'] })];
    const { plan } = buildBatchPlan(
      { templateId: 'move-notes', params: { scope: { kind: 'tag', tag: 't' }, targetFolder: '' } },
      notes,
      new Set(['z.md', 'sub/a.md']),
    );
    // z.md is already in the vault root and must be skipped.
    expect(plan.operations).toEqual([
      { kind: 'move', from: 'sub/a.md', to: 'a.md' },
    ]);
  });
});

describe('rename-by-rule planning (R-B5)', () => {
  const existing = new Set(['notes/report-draft.md', 'notes/other.md', 'notes/final.md']);

  it('replaces literal text in the stem and keeps the extension', () => {
    const notes = [note({ path: 'notes/report-draft.md' })];
    const { plan } = buildBatchPlan(
      {
        templateId: 'rename-by-rule',
        params: { scope: { kind: 'keyword', text: 'report' }, find: '-draft', replaceWith: '', useRegex: false },
      },
      notes,
      existing,
    );
    expect(plan.operations).toEqual([{ kind: 'rename', from: 'notes/report-draft.md', to: 'notes/report.md' }]);
  });

  it('supports regex replacement and excludes no-change results', () => {
    const notes = [note({ path: 'notes/report-draft.md', tags: ['all'] }), note({ path: 'notes/other.md', tags: ['all'] })];
    const { plan } = buildBatchPlan(
      {
        templateId: 'rename-by-rule',
        params: { scope: { kind: 'tag', tag: 'all' }, find: '^(\\w+)-\\w+$', replaceWith: '$1', useRegex: true },
      },
      notes,
      existing,
    );
    expect(plan.operations).toEqual([{ kind: 'rename', from: 'notes/report-draft.md', to: 'notes/report.md' }]);
  });

  it('returns an empty plan for an invalid rule instead of throwing', () => {
    const notes = [note({ path: 'notes/report-draft.md' })];
    const { plan } = buildBatchPlan(
      {
        templateId: 'rename-by-rule',
        params: { scope: { kind: 'keyword', text: '' }, find: '([unclosed', replaceWith: 'x', useRegex: true },
      },
      notes,
      existing,
    );
    expect(plan.operations).toEqual([]);
  });

  it('refuses to rename onto an existing path', () => {
    const notes = [note({ path: 'notes/report-draft.md', tags: ['all'] })];
    const { conflicts } = buildBatchPlan(
      {
        templateId: 'rename-by-rule',
        params: { scope: { kind: 'tag', tag: 'all' }, find: 'report-draft', replaceWith: 'final', useRegex: false },
      },
      notes,
      existing,
    );
    expect(conflicts).toEqual([{ from: 'notes/report-draft.md', to: 'notes/final.md', reason: 'target-exists' }]);
  });
});

describe('property-edit planning and mutation (R-B5)', () => {
  it('includes only files where the operation changes anything', () => {
    const notes = [
      note({ path: 'a.md', tags: ['all'], properties: {} }),
      note({ path: 'b.md', tags: ['all'], properties: { status: 'done' } }),
    ];
    const { plan } = buildBatchPlan(
      {
        templateId: 'edit-properties',
        params: { scope: { kind: 'tag', tag: 'all' }, operation: { op: 'set', name: 'status', value: { type: 'text', value: 'done' } } },
      },
      notes,
      new Set(),
    );
    expect(plan.operations).toEqual([{ kind: 'edit-properties', path: 'a.md' }]);
  });

  it('remove applies only where the property exists', () => {
    const notes = [
      note({ path: 'has.md', tags: ['all'], properties: { tmp: 1 } }),
      note({ path: 'not.md', tags: ['all'], properties: {} }),
    ];
    const { plan } = buildBatchPlan(
      {
        templateId: 'edit-properties',
        params: { scope: { kind: 'tag', tag: 'all' }, operation: { op: 'remove', name: 'tmp' } },
      },
      notes,
      new Set(),
    );
    expect(plan.operations).toEqual([{ kind: 'edit-properties', path: 'has.md' }]);
  });

  it('set-if respects equals and exists conditions', () => {
    const operation = {
      op: 'set-if',
      name: 'archived',
      value: { type: 'boolean', value: true },
      condition: { kind: 'equals', name: 'status', value: 'done' },
    } as const;
    expect(propertyOperationWouldChange({ status: 'done' }, operation)).toBe(true);
    expect(propertyOperationWouldChange({ status: 'todo' }, operation)).toBe(false);
    expect(propertyOperationWouldChange({}, operation)).toBe(false);

    const existsOp = {
      op: 'set-if',
      name: 'archived',
      value: { type: 'boolean', value: true },
      condition: { kind: 'exists', name: 'any' },
    } as const;
    expect(propertyOperationWouldChange({ any: 1 }, existsOp)).toBe(true);
    expect(propertyOperationWouldChange({}, existsOp)).toBe(false);
  });

  it('mutates the frontmatter object with declared JS types (processFrontMatter semantics)', () => {
    const fm: Record<string, unknown> = { keep: 'yes', n: 1 };
    applyBatchPropertyOperation(fm, { op: 'set', name: 'text', value: { type: 'text', value: 'hello' } });
    applyBatchPropertyOperation(fm, { op: 'set', name: 'num', value: { type: 'number', value: 42 } });
    applyBatchPropertyOperation(fm, { op: 'set', name: 'flag', value: { type: 'boolean', value: false } });
    applyBatchPropertyOperation(fm, { op: 'set', name: 'list', value: { type: 'list', value: ['a', 'b'] } });
    applyBatchPropertyOperation(fm, { op: 'remove', name: 'n' });
    applyBatchPropertyOperation(fm, { op: 'set-if', name: 'cond', value: { type: 'text', value: 'x' }, condition: { kind: 'exists', name: 'absent' } });
    expect(fm).toEqual({ keep: 'yes', text: 'hello', num: 42, flag: false, list: ['a', 'b'] });
  });

  it('parses typed values from raw form input and rejects mismatches', () => {
    expect(parseBatchPropertyValue('hello', 'text')).toEqual({ type: 'text', value: 'hello' });
    expect(parseBatchPropertyValue(' 42 ', 'number')).toEqual({ type: 'number', value: 42 });
    expect(parseBatchPropertyValue('abc', 'number')).toBeNull();
    expect(parseBatchPropertyValue('true', 'boolean')).toEqual({ type: 'boolean', value: true });
    expect(parseBatchPropertyValue('yes', 'boolean')).toBeNull();
    expect(parseBatchPropertyValue('a, b,c', 'list')).toEqual({ type: 'list', value: ['a', 'b', 'c'] });
    expect(parseBatchPropertyValue(' , ', 'list')).toBeNull();
  });
});

describe('plan signature / stale-plan handshake (R-B5)', () => {
  const notes = [note({ path: 'notes/a.md', tags: ['待整理'] }), note({ path: 'notes/b.md', tags: ['待整理'] })];
  const existing = new Set(['notes/a.md', 'notes/b.md']);

  it('identical plans share a signature regardless of input order', () => {
    const a = buildBatchPlan(MOVE_TEMPLATE, notes, existing);
    const b = buildBatchPlan(MOVE_TEMPLATE, [...notes].reverse(), existing);
    expect(plansAreIdentical(a, b)).toBe(true);
    expect(planSignature(a)).toBe(planSignature(b));
  });

  it('a changed vault (new match) yields a different signature', () => {
    const a = buildBatchPlan(MOVE_TEMPLATE, notes, existing);
    const changed = buildBatchPlan(MOVE_TEMPLATE, [...notes, note({ path: 'notes/c.md', tags: ['待整理'] })], new Set([...existing, 'notes/c.md']));
    expect(plansAreIdentical(a, changed)).toBe(false);
  });

  it('a changed vault (file vanished) yields a different signature', () => {
    const a = buildBatchPlan(MOVE_TEMPLATE, notes, existing);
    const changed = buildBatchPlan(MOVE_TEMPLATE, [notes[0]], new Set(['notes/a.md']));
    expect(plansAreIdentical(a, changed)).toBe(false);
  });
});

describe('parameter validation helpers (R-B5)', () => {
  it('validates target folders fail-closed', () => {
    expect(validateTargetFolder('')).toBe('');
    expect(validateTargetFolder('  归档/子目录 ')).toBe('归档/子目录');
    expect(validateTargetFolder('./a/b/')).toBe('a/b');
    expect(validateTargetFolder('../escape')).toBeNull();
    expect(validateTargetFolder('a/../b')).toBeNull();
    expect(validateTargetFolder('C:/temp')).toBeNull();
  });

  it('validates rename rules and property names', () => {
    expect(validateRenameRule({ find: 'x', useRegex: false })).toBeNull();
    expect(validateRenameRule({ find: '  ', useRegex: false })).toBe('invalid-rename-rule');
    expect(validateRenameRule({ find: '^a+', useRegex: true })).toBeNull();
    expect(validateRenameRule({ find: '([bad', useRegex: true })).toBe('invalid-rename-rule');
    expect(validatePropertyName('status')).toBeNull();
    expect(validatePropertyName('')).toBe('invalid-property-name');
  });

  it('coerces scalar property values to strings and rejects composites', () => {
    expect(coercePropertyToString('s')).toBe('s');
    expect(coercePropertyToString(1.5)).toBe('1.5');
    expect(coercePropertyToString(false)).toBe('false');
    expect(coercePropertyToString([1])).toBeNull();
    expect(coercePropertyToString({ a: 1 })).toBeNull();
    expect(coercePropertyToString(undefined)).toBeNull();
    expect(normalizeTag('#Hello/World')).toBe('hello/world');
  });
});

describe('target folder collection (R-B5-D1)', () => {
  it('collects distinct codepoint-sorted target folders; root and property edits are excluded', () => {
    const operations: BatchOperation[] = [
      { kind: 'move', from: 'a.md', to: '归档/b.md' },
      { kind: 'move', from: 'c.md', to: '归档/sub/d.md' },
      { kind: 'rename', from: 'e.md', to: 'f.md' },
      { kind: 'edit-properties', path: '归档/g.md' },
    ];
    // Parents sort before children, so creating in list order is always safe.
    expect(collectTargetFolders(operations)).toEqual(['归档', '归档/sub']);
  });

  it('returns an empty list for property-edit batches (no target folders involved)', () => {
    const operations: BatchOperation[] = [{ kind: 'edit-properties', path: 'a.md' }];
    expect(collectTargetFolders(operations)).toEqual([]);
  });
});
