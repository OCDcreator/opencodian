/**
 * Tracer bullet — ClaudeSettingsHookModel handler mutation (add only): insert one
 * supported handler into an existing known event / matcher group. The edit
 * replaces only ['hooks', event, groupIndex, 'hooks'] and is directly applicable,
 * preserving matcher, unknown group/handler fields, sibling groups/events, and
 * unrelated top-level settings.
 */
import { buildClaudeHookHandlerEdit } from '../../../../../src/core/agents/backend/ClaudeSettingsHookModel';
import { applyJsoncPathEdits } from '../../../../../src/core/agents/backend/ProjectResourceSecureWrite';

const grp = (g: unknown): Record<string, unknown> => g as Record<string, unknown>;

describe('ClaudeSettingsHookModel handler add', () => {
  it('adds a supported handler to an existing group, preserving raw fields and siblings', () => {
    const settings = {
      top: true,
      hooks: {
        PreToolUse: [
          { matcher: 'Bash', unknownGroupField: 'g', hooks: [{ type: 'command', command: 'echo', once: true, unknownHandlerField: 'h' }] },
          { matcher: 'Write', hooks: [{ type: 'command', command: 'w' }] },
        ],
        Stop: [{ hooks: [{ type: 'command', command: 's' }] }],
      },
    };
    const cloneBefore = JSON.parse(JSON.stringify(settings));

    const res = buildClaudeHookHandlerEdit(settings, 'PreToolUse', 0, {
      type: 'add', handler: { type: 'http', url: 'http://x', customField: 'c' },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(res.edit.path).toEqual(['hooks', 'PreToolUse', 0, 'hooks']);
    expect(res.handlers).toHaveLength(2);
    // existing handler raw preserved
    expect(grp(res.handlers[0]).once).toBe(true);
    expect(grp(res.handlers[0]).unknownHandlerField).toBe('h');
    // newly added handler raw preserved
    expect(grp(res.handlers[1]).type).toBe('http');
    expect(grp(res.handlers[1]).customField).toBe('c');

    // input not mutated
    expect(settings).toEqual(cloneBefore);

    // edit is directly applicable; matcher / unknown group field / siblings / top-level unchanged
    const applied = applyJsoncPathEdits(JSON.stringify(settings), [res.edit]);
    expect(applied.ok).toBe(true);
    if (!applied.ok) throw new Error('unreachable');
    const parsed = JSON.parse(applied.result);
    expect(parsed.top).toBe(true);
    expect(parsed.hooks.PreToolUse[0].matcher).toBe('Bash');
    expect(parsed.hooks.PreToolUse[0].unknownGroupField).toBe('g');
    expect(parsed.hooks.PreToolUse[0].hooks).toHaveLength(2);
    expect(parsed.hooks.PreToolUse[0].hooks[1]).toEqual({ type: 'http', url: 'http://x', customField: 'c' });
    expect(parsed.hooks.PreToolUse[1]).toEqual({ matcher: 'Write', hooks: [{ type: 'command', command: 'w' }] });
    expect(parsed.hooks.Stop).toEqual([{ hooks: [{ type: 'command', command: 's' }] }]);
  });

  it('inserts at an explicit index', () => {
    const settings = { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'a' }, { type: 'command', command: 'b' }] }] } };
    const res = buildClaudeHookHandlerEdit(settings, 'PreToolUse', 0, {
      type: 'add', handler: { type: 'command', command: 'mid' }, index: 1,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(res.handlers.map((h) => grp(h).command)).toEqual(['a', 'mid', 'b']);
  });

  it('rejects unknown event, invalid group index/shape, invalid hooks shape, invalid insertion index, and unknown handler type', () => {
    const settings = { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'x' }] }] } };
    expect(buildClaudeHookHandlerEdit(settings, 'FutureEvent', 0, { type: 'add', handler: { type: 'command' } }).ok).toBe(false);
    expect(buildClaudeHookHandlerEdit(settings, 'PreToolUse', 5, { type: 'add', handler: { type: 'command' } }).ok).toBe(false);
    expect(buildClaudeHookHandlerEdit({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: 'not-array' }] } }, 'PreToolUse', 0, { type: 'add', handler: { type: 'command' } }).ok).toBe(false);
    expect(buildClaudeHookHandlerEdit(settings, 'PreToolUse', 0, { type: 'add', handler: { type: 'command' }, index: 99 }).ok).toBe(false);
    expect(buildClaudeHookHandlerEdit(settings, 'PreToolUse', 0, { type: 'add', handler: { type: 'future_type' } }).ok).toBe(false);
    expect(buildClaudeHookHandlerEdit(settings, 'PreToolUse', 0, { type: 'add', handler: { command: 'no-type' } }).ok).toBe(false);
  });

  it('rejects add-handler with invalid documented fields (metadata-driven)', () => {
    const baseSettings = { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'keep' }] }] } };
    const cases: Array<{ name: string; handler: Record<string, unknown>; field: string }> = [
      { name: 'missing required command', handler: { type: 'command' }, field: 'command' },
      { name: 'wrong common kind (timeout)', handler: { type: 'command', command: 'x', timeout: 'no' }, field: 'timeout' },
      { name: 'wrong type kind (args not array)', handler: { type: 'command', command: 'x', args: 'no' }, field: 'args' },
      { name: 'enum violation (shell)', handler: { type: 'command', command: 'x', shell: 'zsh' }, field: 'shell' },
      { name: 'non-finite number', handler: { type: 'command', command: 'x', timeout: Infinity }, field: 'timeout' },
      { name: 'string-array non-string element', handler: { type: 'http', url: 'u', allowedEnvVars: ['a', 1] }, field: 'allowedEnvVars' },
      { name: 'string-record non-string value', handler: { type: 'http', url: 'u', headers: { k: 1 } }, field: 'headers' },
      { name: 'json-object is array', handler: { type: 'mcp_tool', server: 's', tool: 't', input: [] }, field: 'input' },
      { name: 'missing required url', handler: { type: 'http' }, field: 'url' },
    ];
    for (const c of cases) {
      const res = buildClaudeHookHandlerEdit(baseSettings, 'PreToolUse', 0, { type: 'add', handler: c.handler });
      expect(res.ok).toBe(false);
      if (res.ok) throw new Error(`case "${c.name}" should have failed`);
      expect(res.diagnostics.some((d) => d.path === `hooks.PreToolUse[0].hooks[add].${c.field}`)).toBe(true);
    }
  });

  it('accepts valid handlers and preserves unknown/internal fields verbatim', () => {
    const baseSettings = { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'keep' }] }] } };
    // command with unknown/internal fields (once, rewakeMessage, custom) -> valid, preserved
    const cmdRes = buildClaudeHookHandlerEdit(baseSettings, 'PreToolUse', 0, {
      type: 'add', handler: { type: 'command', command: 'echo', once: true, rewakeMessage: 'r', customField: 'c', shell: 'bash' },
    });
    expect(cmdRes.ok).toBe(true);
    if (!cmdRes.ok) throw new Error('unreachable');
    const added = cmdRes.handlers[1];
    expect(grp(added).command).toBe('echo');
    expect(grp(added).once).toBe(true);
    expect(grp(added).rewakeMessage).toBe('r');
    expect(grp(added).customField).toBe('c');
    // http valid
    expect(buildClaudeHookHandlerEdit(baseSettings, 'PreToolUse', 0, {
      type: 'add', handler: { type: 'http', url: 'http://x', headers: { Authorization: 'Bearer $T' }, allowedEnvVars: ['T'] },
    }).ok).toBe(true);
    // mcp_tool valid with json-object input
    expect(buildClaudeHookHandlerEdit(baseSettings, 'PreToolUse', 0, {
      type: 'add', handler: { type: 'mcp_tool', server: 's', tool: 't', input: { file: 'a' } },
    }).ok).toBe(true);
    // prompt valid
    expect(buildClaudeHookHandlerEdit(baseSettings, 'PreToolUse', 0, {
      type: 'add', handler: { type: 'prompt', prompt: 'p', model: 'm' },
    }).ok).toBe(true);
  });

  it('accepts and preserves prompt continueOnBlock while agent field updates stay rejected', () => {
    const settings = {
      hooks: {
        PreToolUse: [{
          matcher: 'Bash',
          hooks: [{ type: 'prompt', prompt: 'existing', unknownField: 'keep' }],
        }],
      },
    };

    const added = buildClaudeHookHandlerEdit(settings, 'PreToolUse', 0, {
      type: 'add',
      handler: {
        type: 'prompt',
        prompt: 'added',
        continueOnBlock: true,
        unknownField: 'added-unknown',
      },
    });
    expect(added.ok).toBe(true);
    if (!added.ok) throw new Error('unreachable');
    expect(grp(added.handlers[1])).toMatchObject({
      type: 'prompt',
      prompt: 'added',
      continueOnBlock: true,
      unknownField: 'added-unknown',
    });

    const updated = buildClaudeHookHandlerEdit(settings, 'PreToolUse', 0, {
      type: 'update-field', index: 0, field: 'continueOnBlock', value: false,
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) throw new Error('unreachable');
    expect(updated.edit.path).toEqual(['hooks', 'PreToolUse', 0, 'hooks', 0, 'continueOnBlock']);
    expect(grp(updated.handlers[0])).toMatchObject({
      type: 'prompt',
      prompt: 'existing',
      continueOnBlock: false,
      unknownField: 'keep',
    });

    const agentSettings = {
      hooks: {
        PreToolUse: [{
          matcher: 'Bash',
          hooks: [{ type: 'agent', prompt: 'delegate', unknownField: 'keep' }],
        }],
      },
    };
    const rejected = buildClaudeHookHandlerEdit(agentSettings, 'PreToolUse', 0, {
      type: 'update-field', index: 0, field: 'continueOnBlock', value: true,
    });
    expect(rejected.ok).toBe(false);
    expect(agentSettings.hooks.PreToolUse[0].hooks[0]).toEqual({
      type: 'agent', prompt: 'delegate', unknownField: 'keep',
    });
  });
});

describe('ClaudeSettingsHookModel handler update-field', () => {
  const settings = () => ({
    top: true,
    hooks: {
      PreToolUse: [
        {
          matcher: 'Bash', unknownGroupField: 'g', hooks: [
            { type: 'command', command: 'orig', timeout: 60, once: true, rewakeMessage: 'r', customField: 'c' },
            { type: 'command', command: 'sibling' },
          ],
        },
      ],
      Stop: [{ hooks: [{ type: 'command', command: 's' }] }],
    },
  });

  it('sets a structured field with a fine-grained edit preserving siblings and unknowns', () => {
    const s = settings();
    const res = buildClaudeHookHandlerEdit(s, 'PreToolUse', 0, { type: 'update-field', index: 0, field: 'command', value: 'newcmd' });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(res.edit.path).toEqual(['hooks', 'PreToolUse', 0, 'hooks', 0, 'command']);
    expect(res.edit.value).toBe('newcmd');
    expect(grp(res.handlers[0]).command).toBe('newcmd');
    // unedited unknown/internal fields preserved
    expect(grp(res.handlers[0]).once).toBe(true);
    expect(grp(res.handlers[0]).rewakeMessage).toBe('r');
    expect(grp(res.handlers[0]).customField).toBe('c');
    expect(grp(res.handlers[0]).timeout).toBe(60);
    // sibling handler unchanged
    expect(grp(res.handlers[1]).command).toBe('sibling');
    // input not mutated
    expect(s).toEqual(settings());

    // fine-grained edit applies; siblings/groups/events/top preserved
    const applied = applyJsoncPathEdits(JSON.stringify(s), [res.edit]);
    expect(applied.ok).toBe(true);
    if (!applied.ok) throw new Error('unreachable');
    const parsed = JSON.parse(applied.result);
    expect(parsed.top).toBe(true);
    expect(parsed.hooks.PreToolUse[0].matcher).toBe('Bash');
    expect(parsed.hooks.PreToolUse[0].unknownGroupField).toBe('g');
    expect(parsed.hooks.PreToolUse[0].hooks[0].command).toBe('newcmd');
    expect(parsed.hooks.PreToolUse[0].hooks[0].timeout).toBe(60);
    expect(parsed.hooks.PreToolUse[0].hooks[1]).toEqual({ type: 'command', command: 'sibling' });
    expect(parsed.hooks.Stop).toEqual([{ hooks: [{ type: 'command', command: 's' }] }]);
  });

  it('deletes an optional structured field when value is undefined', () => {
    const s = settings();
    const res = buildClaudeHookHandlerEdit(s, 'PreToolUse', 0, { type: 'update-field', index: 0, field: 'timeout', value: undefined });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(res.edit.path).toEqual(['hooks', 'PreToolUse', 0, 'hooks', 0, 'timeout']);
    expect(res.edit.value).toBeUndefined();
    expect(grp(res.handlers[0]).timeout).toBeUndefined();
    expect(grp(res.handlers[0]).command).toBe('orig');
    expect(grp(res.handlers[0]).once).toBe(true);
    const applied = applyJsoncPathEdits(JSON.stringify(s), [res.edit]);
    expect(applied.ok).toBe(true);
    if (!applied.ok) throw new Error('unreachable');
    const parsed = JSON.parse(applied.result);
    expect(parsed.hooks.PreToolUse[0].hooks[0].timeout).toBeUndefined();
    expect(parsed.hooks.PreToolUse[0].hooks[0].command).toBe('orig');
  });

  it('rejects fail-closed invalid / unknown-field updates', () => {
    const s = settings();
    const update = (m: Parameters<typeof buildClaudeHookHandlerEdit>[3]) =>
      buildClaudeHookHandlerEdit(s, 'PreToolUse', 0, m).ok;
    // unknown/internal/non-structured field
    expect(update({ type: 'update-field', index: 0, field: 'once', value: false })).toBe(false);
    expect(update({ type: 'update-field', index: 0, field: 'customField', value: 'x' })).toBe(false);
    expect(update({ type: 'update-field', index: 0, field: 'nonexistent', value: 1 })).toBe(false);
    // delete a required field
    expect(update({ type: 'update-field', index: 0, field: 'command', value: undefined })).toBe(false);
    // wrong kind
    expect(update({ type: 'update-field', index: 0, field: 'timeout', value: 'no' })).toBe(false);
    // enum violation
    expect(update({ type: 'update-field', index: 0, field: 'shell', value: 'zsh' })).toBe(false);
    // handler index out of range
    expect(update({ type: 'update-field', index: 9, field: 'command', value: 'x' })).toBe(false);
    // unknown event
    expect(buildClaudeHookHandlerEdit(s, 'FutureEvent', 0, { type: 'update-field', index: 0, field: 'command', value: 'x' }).ok).toBe(false);
  });
});

describe('ClaudeSettingsHookModel handler delete', () => {
  it('deletes a handler preserving remaining raw order, siblings, and applies cleanly', () => {
    const settings = {
      top: true,
      hooks: {
        PreToolUse: [
          { matcher: 'Bash', unknownGroupField: 'g', hooks: [
            { type: 'command', command: 'a', once: true },
            { type: 'command', command: 'b' },
            { type: 'command', command: 'c' },
          ] },
        ],
        Stop: [{ hooks: [{ type: 'command', command: 's' }] }],
      },
    };
    const cloneBefore = JSON.parse(JSON.stringify(settings));

    const res = buildClaudeHookHandlerEdit(settings, 'PreToolUse', 0, { type: 'delete', index: 1 });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(res.edit.path).toEqual(['hooks', 'PreToolUse', 0, 'hooks']);
    expect(res.handlers.map((h) => grp(h).command)).toEqual(['a', 'c']);
    // remaining raw preserved verbatim (once on handler a)
    expect(grp(res.handlers[0]).once).toBe(true);
    // input not mutated
    expect(settings).toEqual(cloneBefore);

    const applied = applyJsoncPathEdits(JSON.stringify(settings), [res.edit]);
    expect(applied.ok).toBe(true);
    if (!applied.ok) throw new Error('unreachable');
    const parsed = JSON.parse(applied.result);
    expect(parsed.top).toBe(true);
    expect(parsed.hooks.PreToolUse[0].matcher).toBe('Bash');
    expect(parsed.hooks.PreToolUse[0].unknownGroupField).toBe('g');
    expect(parsed.hooks.PreToolUse[0].hooks.map((h: Record<string, unknown>) => h.command)).toEqual(['a', 'c']);
    expect(parsed.hooks.Stop).toEqual([{ hooks: [{ type: 'command', command: 's' }] }]);
  });

  it('allows deleting the last handler yielding an empty hooks array', () => {
    const settings = { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'only' }] }] } };
    const res = buildClaudeHookHandlerEdit(settings, 'PreToolUse', 0, { type: 'delete', index: 0 });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(res.handlers).toEqual([]);
    expect(res.edit.value).toEqual([]);
  });

  it('allows deleting raw elements with unknown/malformed handler types (repair)', () => {
    const base = { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [
      { type: 'command', command: 'keep' },
      { type: 'future_type', x: 1 },
      { notEvenTyped: true },
    ] }] } };
    const r1 = buildClaudeHookHandlerEdit(base, 'PreToolUse', 0, { type: 'delete', index: 1 });
    expect(r1.ok).toBe(true);
    if (!r1.ok) throw new Error('unreachable');
    expect(r1.handlers).toHaveLength(2);
    expect(grp(r1.handlers[0]).command).toBe('keep');
    expect(grp(r1.handlers[1]).notEvenTyped).toBe(true);
    // delete the malformed element from the result
    const r2 = buildClaudeHookHandlerEdit({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: r1.handlers }] } }, 'PreToolUse', 0, { type: 'delete', index: 1 });
    expect(r2.ok).toBe(true);
    if (!r2.ok) throw new Error('unreachable');
    expect(r2.handlers).toHaveLength(1);
    expect(grp(r2.handlers[0]).command).toBe('keep');
  });

  it('rejects invalid index and unknown event', () => {
    const settings = { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'x' }] }] } };
    expect(buildClaudeHookHandlerEdit(settings, 'PreToolUse', 0, { type: 'delete', index: 9 }).ok).toBe(false);
    expect(buildClaudeHookHandlerEdit(settings, 'FutureEvent', 0, { type: 'delete', index: 0 }).ok).toBe(false);
  });
});

describe('ClaudeSettingsHookModel handler move', () => {
  it('reorders handlers (document order only) preserving raw elements and siblings', () => {
    const settings = {
      top: true,
      hooks: {
        PreToolUse: [
          { matcher: 'Bash', unknownGroupField: 'g', hooks: [
            { type: 'command', command: 'a', once: true },
            { type: 'command', command: 'b' },
            { type: 'command', command: 'c' },
          ] },
        ],
        Stop: [{ hooks: [{ type: 'command', command: 's' }] }],
      },
    };
    const cloneBefore = JSON.parse(JSON.stringify(settings));

    const res = buildClaudeHookHandlerEdit(settings, 'PreToolUse', 0, { type: 'move', fromIndex: 0, toIndex: 2 });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(res.edit.path).toEqual(['hooks', 'PreToolUse', 0, 'hooks']);
    expect(res.handlers.map((h) => grp(h).command)).toEqual(['b', 'c', 'a']);
    // moved element raw preserved verbatim
    expect(grp(res.handlers[2]).once).toBe(true);
    // input not mutated
    expect(settings).toEqual(cloneBefore);

    const applied = applyJsoncPathEdits(JSON.stringify(settings), [res.edit]);
    expect(applied.ok).toBe(true);
    if (!applied.ok) throw new Error('unreachable');
    const parsed = JSON.parse(applied.result);
    expect(parsed.top).toBe(true);
    expect(parsed.hooks.PreToolUse[0].matcher).toBe('Bash');
    expect(parsed.hooks.PreToolUse[0].unknownGroupField).toBe('g');
    expect(parsed.hooks.PreToolUse[0].hooks.map((h: Record<string, unknown>) => h.command)).toEqual(['b', 'c', 'a']);
    expect(parsed.hooks.Stop).toEqual([{ hooks: [{ type: 'command', command: 's' }] }]);
  });

  it('allows moving raw elements with unknown/malformed handler types', () => {
    const settings = { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [
      { type: 'command', command: 'keep' },
      { type: 'future_type', x: 1 },
      { notEvenTyped: true },
    ] }] } };
    const res = buildClaudeHookHandlerEdit(settings, 'PreToolUse', 0, { type: 'move', fromIndex: 2, toIndex: 0 });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(grp(res.handlers[0]).notEvenTyped).toBe(true);
    expect(grp(res.handlers[1]).command).toBe('keep');
    expect(grp(res.handlers[2]).type).toBe('future_type');
  });

  it('rejects out-of-range indices and unknown event', () => {
    const settings = { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'x' }] }] } };
    expect(buildClaudeHookHandlerEdit(settings, 'PreToolUse', 0, { type: 'move', fromIndex: 0, toIndex: 9 }).ok).toBe(false);
    expect(buildClaudeHookHandlerEdit(settings, 'PreToolUse', 0, { type: 'move', fromIndex: 9, toIndex: 0 }).ok).toBe(false);
    expect(buildClaudeHookHandlerEdit(settings, 'FutureEvent', 0, { type: 'move', fromIndex: 0, toIndex: 0 }).ok).toBe(false);
  });
});
