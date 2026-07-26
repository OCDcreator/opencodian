/**
 * Tracer bullet — ClaudeSettingsHookModel group mutations: build a local
 * JsoncPathEdit (array-replace at ['hooks', event]) for add / update-matcher /
 * delete / move, preserving unknown raw fields without mutating the input.
 */
import { buildClaudeHookGroupEdit } from '../../../../../src/core/agents/backend/ClaudeSettingsHookModel';
import { applyJsoncPathEdits } from '../../../../../src/core/agents/backend/ProjectResourceSecureWrite';

const grp = (g: unknown): Record<string, unknown> => g as Record<string, unknown>;
const hooksOf = (g: unknown): unknown[] => (Array.isArray(grp(g).hooks) ? grp(g).hooks : []) as unknown[];
const nextSettings = (groups: readonly unknown[]): { hooks: { PreToolUse: readonly unknown[] } } => ({
  hooks: { PreToolUse: groups },
});

describe('ClaudeSettingsHookModel group mutations', () => {
  it('add/update-matcher/move/delete produce array-replace edits preserving unknown raw', () => {
    const originalHandler = { type: 'command', command: 'echo', once: true, unknownHandlerField: 'h' };
    const originalGroup = { matcher: 'Bash', unknownGroupField: 'g', hooks: [originalHandler] };
    const settings = { hooks: { PreToolUse: [originalGroup] } };
    const cloneBefore = JSON.parse(JSON.stringify(settings));

    // add a second group
    const addRes = buildClaudeHookGroupEdit(settings, 'PreToolUse', {
      type: 'add', group: { matcher: 'Write', hooks: [{ type: 'command', command: 'echo2' }] },
    });
    expect(addRes.ok).toBe(true);
    if (!addRes.ok) throw new Error('unreachable');
    expect(addRes.edit.path).toEqual(['hooks', 'PreToolUse']);
    expect(addRes.groups).toHaveLength(2);
    expect(grp(addRes.groups[0]).unknownGroupField).toBe('g');
    expect(grp(hooksOf(addRes.groups[0])[0]).once).toBe(true);

    // update-matcher on index 0 -> 'Edit' (only matcher changes; group not rebuilt)
    const updRes = buildClaudeHookGroupEdit(nextSettings(addRes.groups), 'PreToolUse', {
      type: 'update-matcher', index: 0, matcher: 'Edit',
    });
    expect(updRes.ok).toBe(true);
    if (!updRes.ok) throw new Error('unreachable');
    expect(grp(updRes.groups[0]).matcher).toBe('Edit');
    expect(grp(updRes.groups[0]).unknownGroupField).toBe('g');
    expect(grp(hooksOf(updRes.groups[0])[0]).unknownHandlerField).toBe('h');

    // update-matcher null deletes matcher, preserving the rest
    const nullRes = buildClaudeHookGroupEdit(nextSettings(updRes.groups), 'PreToolUse', {
      type: 'update-matcher', index: 0, matcher: null,
    });
    expect(nullRes.ok).toBe(true);
    if (!nullRes.ok) throw new Error('unreachable');
    expect(grp(nullRes.groups[0]).matcher).toBeUndefined();
    expect(grp(nullRes.groups[0]).unknownGroupField).toBe('g');

    // move index 0 -> 1 (document order only)
    const moveRes = buildClaudeHookGroupEdit(nextSettings(updRes.groups), 'PreToolUse', {
      type: 'move', fromIndex: 0, toIndex: 1,
    });
    expect(moveRes.ok).toBe(true);
    if (!moveRes.ok) throw new Error('unreachable');
    expect(grp(moveRes.groups[0]).matcher).toBe('Write');
    expect(grp(moveRes.groups[1]).matcher).toBe('Edit');

    // delete index 0 (from moveRes order: Write@0, Edit@1)
    const delRes = buildClaudeHookGroupEdit(nextSettings(moveRes.groups), 'PreToolUse', { type: 'delete', index: 0 });
    expect(delRes.ok).toBe(true);
    if (!delRes.ok) throw new Error('unreachable');
    expect(delRes.groups).toHaveLength(1);
    expect(grp(delRes.groups[0]).matcher).toBe('Edit');
    expect(grp(delRes.groups[0]).unknownGroupField).toBe('g');
    expect(grp(hooksOf(delRes.groups[0])[0]).once).toBe(true);

    // original input never mutated across the whole sequence
    expect(settings).toEqual(cloneBefore);
  });

  it('rejects no-matcher event matcher addition and invalid index/shape with typed diagnostics', () => {
    const mdSettings = { hooks: { MessageDisplay: [{ hooks: [{ type: 'command', command: 'x' }] }] } };
    const mdRes = buildClaudeHookGroupEdit(mdSettings, 'MessageDisplay', {
      type: 'add', group: { matcher: '*', hooks: [] },
    });
    expect(mdRes.ok).toBe(false);
    if (mdRes.ok) throw new Error('unreachable');
    expect(mdRes.diagnostics.some((d) => /matcher/i.test(d.message))).toBe(true);

    const mdUpdate = buildClaudeHookGroupEdit(mdSettings, 'MessageDisplay', {
      type: 'update-matcher', index: 0, matcher: '*',
    });
    expect(mdUpdate.ok).toBe(false);

    const settings = { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [] }] } };
    expect(buildClaudeHookGroupEdit(settings, 'PreToolUse', { type: 'delete', index: 5 }).ok).toBe(false);
    expect(buildClaudeHookGroupEdit(settings, 'PreToolUse', { type: 'move', fromIndex: 0, toIndex: 5 }).ok).toBe(false);
    expect(buildClaudeHookGroupEdit(settings, 'PreToolUse', { type: 'update-matcher', index: 5, matcher: 'X' }).ok).toBe(false);
    expect(buildClaudeHookGroupEdit(settings, 'FutureEvent', { type: 'delete', index: 0 }).ok).toBe(false);
    expect(buildClaudeHookGroupEdit({ hooks: { PreToolUse: { not: 'array' } } }, 'PreToolUse', { type: 'delete', index: 0 }).ok).toBe(false);
    expect(buildClaudeHookGroupEdit(settings, 'PreToolUse', { type: 'add', group: { hooks: 'not-array' } }).ok).toBe(false);
  });

  it('add creates the first group when settings has no hooks, preserving unrelated top-level settings', () => {
    const settings = { someTopLevelSetting: true, env: { FOO: 'bar' } };
    const group = { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo' }] };

    const res = buildClaudeHookGroupEdit(settings, 'PreToolUse', { type: 'add', group });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(res.edit.path).toEqual(['hooks', 'PreToolUse']);
    expect(res.edit.value).toEqual([group]);

    // the edit is directly applicable without requiring a nonexistent parent,
    // and preserves unrelated top-level settings
    const applied = applyJsoncPathEdits(JSON.stringify(settings), [res.edit]);
    expect(applied.ok).toBe(true);
    if (!applied.ok) throw new Error('unreachable');
    const parsed = JSON.parse(applied.result);
    expect(parsed.someTopLevelSetting).toBe(true);
    expect(parsed.env).toEqual({ FOO: 'bar' });
    expect(parsed.hooks.PreToolUse).toEqual([group]);

    // input not mutated
    expect(settings).toEqual({ someTopLevelSetting: true, env: { FOO: 'bar' } });
  });

  it('retains matcher restrictions when creating the first group on a no-hooks settings', () => {
    const settings = { other: 1 };
    // no-matcher event: add with matcher rejected even when creating the first group
    expect(buildClaudeHookGroupEdit(settings, 'MessageDisplay', { type: 'add', group: { matcher: '*', hooks: [] } }).ok).toBe(false);
    // no-matcher event: add without matcher succeeds
    const ok = buildClaudeHookGroupEdit(settings, 'MessageDisplay', { type: 'add', group: { hooks: [{ type: 'command', command: 'x' }] } });
    expect(ok.ok).toBe(true);
  });
});

describe('ClaudeSettingsHookModel group update-matcher fine-grained edit', () => {
  it('returns a fine-grained matcher edit that applies preserving siblings', () => {
    const settings = {
      top: true,
      hooks: {
        PreToolUse: [
          { matcher: 'Bash', unknownGroupField: 'g', hooks: [{ type: 'command', command: 'h', once: true }] },
          { matcher: 'Write', hooks: [{ type: 'command', command: 'w' }] },
        ],
        Stop: [{ hooks: [{ type: 'command', command: 's' }] }],
      },
    };
    const cloneBefore = JSON.parse(JSON.stringify(settings));

    // set matcher -> fine-grained single-field edit
    const setRes = buildClaudeHookGroupEdit(settings, 'PreToolUse', { type: 'update-matcher', index: 0, matcher: 'Edit' });
    expect(setRes.ok).toBe(true);
    if (!setRes.ok) throw new Error('unreachable');
    expect(setRes.edit.path).toEqual(['hooks', 'PreToolUse', 0, 'matcher']);
    expect(setRes.edit.value).toBe('Edit');
    expect(grp(setRes.groups[0]).matcher).toBe('Edit');
    // other group/handler/unknown fields preserved in result.groups
    expect(grp(setRes.groups[0]).unknownGroupField).toBe('g');
    expect(grp(hooksOf(setRes.groups[0])[0]).once).toBe(true);
    expect(grp(setRes.groups[1]).matcher).toBe('Write');
    expect(settings).toEqual(cloneBefore);

    const appliedSet = applyJsoncPathEdits(JSON.stringify(settings), [setRes.edit]);
    expect(appliedSet.ok).toBe(true);
    if (!appliedSet.ok) throw new Error('unreachable');
    const parsedSet = JSON.parse(appliedSet.result);
    expect(parsedSet.top).toBe(true);
    expect(parsedSet.hooks.PreToolUse[0].matcher).toBe('Edit');
    expect(parsedSet.hooks.PreToolUse[0].unknownGroupField).toBe('g');
    expect(parsedSet.hooks.PreToolUse[0].hooks[0]).toEqual({ type: 'command', command: 'h', once: true });
    expect(parsedSet.hooks.PreToolUse[1]).toEqual({ matcher: 'Write', hooks: [{ type: 'command', command: 'w' }] });
    expect(parsedSet.hooks.Stop).toEqual([{ hooks: [{ type: 'command', command: 's' }] }]);

    // delete matcher (null) -> value undefined
    const delRes = buildClaudeHookGroupEdit(settings, 'PreToolUse', { type: 'update-matcher', index: 0, matcher: null });
    expect(delRes.ok).toBe(true);
    if (!delRes.ok) throw new Error('unreachable');
    expect(delRes.edit.path).toEqual(['hooks', 'PreToolUse', 0, 'matcher']);
    expect(delRes.edit.value).toBeUndefined();
    expect(grp(delRes.groups[0]).matcher).toBeUndefined();
    expect(grp(delRes.groups[0]).unknownGroupField).toBe('g');
    const appliedDel = applyJsoncPathEdits(JSON.stringify(settings), [delRes.edit]);
    expect(appliedDel.ok).toBe(true);
    if (!appliedDel.ok) throw new Error('unreachable');
    const parsedDel = JSON.parse(appliedDel.result);
    expect(parsedDel.hooks.PreToolUse[0].matcher).toBeUndefined();
    expect(parsedDel.hooks.PreToolUse[0].unknownGroupField).toBe('g');
  });

  it('preserves no-matcher behavior: set rejected, null repair allowed', () => {
    const settings = { hooks: { MessageDisplay: [{ matcher: 'invalid', hooks: [{ type: 'command', command: 'x' }] }] } };
    expect(buildClaudeHookGroupEdit(settings, 'MessageDisplay', { type: 'update-matcher', index: 0, matcher: '*' }).ok).toBe(false);
    const repair = buildClaudeHookGroupEdit(settings, 'MessageDisplay', { type: 'update-matcher', index: 0, matcher: null });
    expect(repair.ok).toBe(true);
    if (!repair.ok) throw new Error('unreachable');
    expect(repair.edit.path).toEqual(['hooks', 'MessageDisplay', 0, 'matcher']);
    expect(repair.edit.value).toBeUndefined();
  });

  it('add/delete/move still replace the whole event array', () => {
    const settings = { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'x' }] }] } };
    const addRes = buildClaudeHookGroupEdit(settings, 'PreToolUse', { type: 'add', group: { matcher: 'Write', hooks: [] } });
    expect(addRes.ok).toBe(true);
    if (!addRes.ok) throw new Error('unreachable');
    expect(addRes.edit.path).toEqual(['hooks', 'PreToolUse']);
    const delRes = buildClaudeHookGroupEdit(settings, 'PreToolUse', { type: 'delete', index: 0 });
    expect(delRes.ok).toBe(true);
    if (!delRes.ok) throw new Error('unreachable');
    expect(delRes.edit.path).toEqual(['hooks', 'PreToolUse']);
    const moveRes = buildClaudeHookGroupEdit({ hooks: { PreToolUse: [{ matcher: 'A', hooks: [] }, { matcher: 'B', hooks: [] }] } }, 'PreToolUse', { type: 'move', fromIndex: 0, toIndex: 1 });
    expect(moveRes.ok).toBe(true);
    if (!moveRes.ok) throw new Error('unreachable');
    expect(moveRes.edit.path).toEqual(['hooks', 'PreToolUse']);
  });
});
