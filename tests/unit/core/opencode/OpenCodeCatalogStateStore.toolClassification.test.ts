import { OpenCodeCatalogStateStore } from '../../../../src/core/opencode/OpenCodeCatalogStateStore';
import { isBuiltinToolName } from '../../../../src/shared/toolIdentity';

describe('Tool classification via isBuiltinToolName', () => {
  it('classifies known builtin tools', () => {
    expect(isBuiltinToolName('read')).toBe(true);
    expect(isBuiltinToolName('bash')).toBe(true);
    expect(isBuiltinToolName('task')).toBe(true);
    expect(isBuiltinToolName('skill')).toBe(true);
    expect(isBuiltinToolName('plan_enter')).toBe(true);
    expect(isBuiltinToolName('todowrite')).toBe(true);
    expect(isBuiltinToolName('edit')).toBe(true);
    expect(isBuiltinToolName('write')).toBe(true);
    expect(isBuiltinToolName('glob')).toBe(true);
    expect(isBuiltinToolName('grep')).toBe(true);
  });

  it('classifies non-builtin tools as false', () => {
    expect(isBuiltinToolName('my_custom_tool')).toBe(false);
    expect(isBuiltinToolName('mcp__some_tool')).toBe(false);
    expect(isBuiltinToolName('database')).toBe(false);
    expect(isBuiltinToolName('math_add')).toBe(false);
  });

  it('classifies store tool ids into builtin and custom buckets', () => {
    const store = new OpenCodeCatalogStateStore({ syncOpenCodeEventSubscriptions: jest.fn() });

    expect(store.classifyToolIds(['read', 'my_custom_tool', 'skill', 'mcp__some_tool'])).toEqual({
      builtin: ['read', 'skill'],
      custom: ['my_custom_tool', 'mcp__some_tool'],
    });
  });
});
