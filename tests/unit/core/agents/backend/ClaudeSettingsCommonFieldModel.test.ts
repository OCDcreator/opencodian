/**
 * Tracer bullet — ClaudeSettingsCommonFieldModel: a pure common-settings field
 * model grounded in the installed Agent SDK 0.3.145 Settings interface
 * (sdk.d.ts:3943) + CLI 2.1.204. Catalog + buildClaudeSettingsCommonFieldEdit.
 */
import {
  buildClaudeSettingsCommonFieldEdit,
  CLAUDE_SETTINGS_COMMON_FIELD_EVIDENCE,
  CLAUDE_SETTINGS_COMMON_FIELDS,
} from '../../../../../src/core/agents/backend/ClaudeSettingsCommonFieldModel';
import { applyJsoncPathEdits } from '../../../../../src/core/agents/backend/ProjectResourceSecureWrite';

describe('ClaudeSettingsCommonFieldModel', () => {
  it('exposes the exact SDK-grounded catalog and provenance', () => {
    expect(CLAUDE_SETTINGS_COMMON_FIELDS.map((f) => f.id)).toEqual([
      'model', 'permissions.defaultMode', 'permissions.allow', 'permissions.ask', 'permissions.deny',
      'env', 'cleanupPeriodDays', 'respectGitignore', 'includeGitInstructions',
    ]);
    const byId = Object.fromEntries(CLAUDE_SETTINGS_COMMON_FIELDS.map((f) => [f.id, f])) as Record<string, { path: readonly (string | number)[]; kind: string; options?: readonly string[]; min?: number }>;
    expect(byId['model'].path).toEqual(['model']);
    expect(byId['model'].kind).toBe('string');
    expect(byId['permissions.defaultMode'].path).toEqual(['permissions', 'defaultMode']);
    expect(byId['permissions.defaultMode'].options).toEqual(['acceptEdits', 'auto', 'bypassPermissions', 'default', 'dontAsk', 'plan']);
    expect(byId['permissions.allow'].kind).toBe('string-array');
    expect(byId['permissions.deny'].path).toEqual(['permissions', 'deny']);
    expect(byId['env'].kind).toBe('string-record');
    expect(byId['cleanupPeriodDays'].kind).toBe('number');
    expect(byId['cleanupPeriodDays'].min).toBe(1);
    expect(byId['respectGitignore'].kind).toBe('boolean');
    expect(byId['includeGitInstructions'].kind).toBe('boolean');
    expect(CLAUDE_SETTINGS_COMMON_FIELD_EVIDENCE.sdkVersion).toBe('0.3.145');
    expect(CLAUDE_SETTINGS_COMMON_FIELD_EVIDENCE.sdkSettingsInterfaceLine).toBe(3943);
    expect(CLAUDE_SETTINGS_COMMON_FIELD_EVIDENCE.cliVersion).toBe('2.1.204');
  });

  it('builds fine-grained edits for valid values and removal (null), without mutating input', () => {
    const settings = { unknownTop: 'x', model: 'old', permissions: { unknownPerm: 'y' } };
    const clone = JSON.parse(JSON.stringify(settings));

    const model = buildClaudeSettingsCommonFieldEdit(settings, 'model', 'new-model');
    expect(model.ok).toBe(true);
    if (!model.ok) throw new Error('unreachable');
    expect(model.edit.path).toEqual(['model']);
    expect(model.edit.value).toBe('new-model');

    const mode = buildClaudeSettingsCommonFieldEdit(settings, 'permissions.defaultMode', 'plan');
    expect(mode.ok).toBe(true);
    if (!mode.ok) throw new Error('unreachable');
    expect(mode.edit.path).toEqual(['permissions', 'defaultMode']);
    expect(mode.edit.value).toBe('plan');

    expect(buildClaudeSettingsCommonFieldEdit(settings, 'permissions.allow', ['Bash(git *)', 'Read']).ok).toBe(true);
    expect(buildClaudeSettingsCommonFieldEdit(settings, 'env', { FOO: 'bar' }).ok).toBe(true);
    expect(buildClaudeSettingsCommonFieldEdit(settings, 'cleanupPeriodDays', 1.5).ok).toBe(true); // not integer-only
    expect(buildClaudeSettingsCommonFieldEdit(settings, 'cleanupPeriodDays', 7).ok).toBe(true);
    expect(buildClaudeSettingsCommonFieldEdit(settings, 'respectGitignore', false).ok).toBe(true);

    // removal -> value undefined
    const remove = buildClaudeSettingsCommonFieldEdit(settings, 'model', null);
    expect(remove.ok).toBe(true);
    if (!remove.ok) throw new Error('unreachable');
    expect(remove.edit.value).toBeUndefined();

    // input not mutated
    expect(settings).toEqual(clone);
  });

  it('rejects invalid values, unknown fields, non-object settings, and non-object permissions parent', () => {
    const settings = { permissions: { allow: ['Bash'] } };
    expect(buildClaudeSettingsCommonFieldEdit(settings, 'model', 123).ok).toBe(false); // wrong kind
    expect(buildClaudeSettingsCommonFieldEdit(settings, 'permissions.defaultMode', 'nope').ok).toBe(false); // enum
    expect(buildClaudeSettingsCommonFieldEdit(settings, 'cleanupPeriodDays', 0.5).ok).toBe(false); // < min
    expect(buildClaudeSettingsCommonFieldEdit(settings, 'cleanupPeriodDays', Infinity).ok).toBe(false); // non-finite
    expect(buildClaudeSettingsCommonFieldEdit(settings, 'permissions.allow', ['a', 1]).ok).toBe(false); // non-string element
    expect(buildClaudeSettingsCommonFieldEdit(settings, 'env', { k: 1 }).ok).toBe(false); // non-string value
    expect(buildClaudeSettingsCommonFieldEdit(settings, 'respectGitignore', 'yes').ok).toBe(false);
    expect(buildClaudeSettingsCommonFieldEdit(settings, 'unknownField', 1).ok).toBe(false);
    expect(buildClaudeSettingsCommonFieldEdit('not-object', 'model', 'x').ok).toBe(false);
    expect(buildClaudeSettingsCommonFieldEdit([], 'model', 'x').ok).toBe(false);
    // permissions parent exists but is not a plain object -> fail closed (do not overwrite)
    expect(buildClaudeSettingsCommonFieldEdit({ permissions: 'string' }, 'permissions.defaultMode', 'auto').ok).toBe(false);
    expect(buildClaudeSettingsCommonFieldEdit({ permissions: ['array'] }, 'permissions.allow', ['x']).ok).toBe(false);
  });

  it('edits apply via applyJsoncPathEdits: create missing parents and preserve unknowns/order', () => {
    // missing permissions parent -> created; unknown top-level preserved
    const s1 = { unknownTop: 'x' };
    const e1 = buildClaudeSettingsCommonFieldEdit(s1, 'permissions.defaultMode', 'auto');
    if (!e1.ok) throw new Error('unreachable');
    const a1 = applyJsoncPathEdits(JSON.stringify(s1), [e1.edit]);
    expect(a1.ok).toBe(true);
    if (!a1.ok) throw new Error('unreachable');
    const p1 = JSON.parse(a1.result);
    expect(p1.unknownTop).toBe('x');
    expect(p1.permissions.defaultMode).toBe('auto');

    // existing permissions with unknown sibling -> sibling preserved
    const s2 = { permissions: { unknownPerm: 'y', allow: ['old'] } };
    const e2 = buildClaudeSettingsCommonFieldEdit(s2, 'permissions.allow', ['Bash(git *)']);
    if (!e2.ok) throw new Error('unreachable');
    const a2 = applyJsoncPathEdits(JSON.stringify(s2), [e2.edit]);
    expect(a2.ok).toBe(true);
    if (!a2.ok) throw new Error('unreachable');
    const p2 = JSON.parse(a2.result);
    expect(p2.permissions.unknownPerm).toBe('y');
    expect(p2.permissions.allow).toEqual(['Bash(git *)']);
  });
});
