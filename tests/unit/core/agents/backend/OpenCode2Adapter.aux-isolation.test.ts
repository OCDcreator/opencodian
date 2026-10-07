import { access } from 'node:fs/promises';

import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { OpenCode2Adapter } from '../../../../../src/core/agents/backend/OpenCode2Adapter';

type Scope = { workingDirectory: string; extraEnv?: Record<string, string> };
const deny = { action: '*', resource: '*', effect: 'deny' };
const isolatedScopes: Scope[] = [];

function harness(rules: Array<{ action: string; resource: string; effect: string }>): OpenCode2Adapter {
  const client = {
    config: { get: async () => [] },
    agent: { list: async () => ({ data: [{ id: 'opencodian-aux' }] }),
      get: async () => ({ data: { permissions: rules } }) },
    session: { create: async () => ({ id: 'owned-aux' }),
      get: async () => ({ agent: 'opencodian-aux', permissions: [deny] }), remove: async () => {}, interrupt: async () => {} },
  };
  jest.spyOn(OpenCode2Adapter.prototype, 'start').mockImplementation(async function (this: OpenCode2Adapter) {
    const options = (this as unknown as { options: Scope }).options;
    if (options.workingDirectory !== '/vault') isolatedScopes.push(options);
    Object.assign(this, { client });
  });
  jest.spyOn(OpenCode2Adapter.prototype, 'getModelSelectorProviders').mockResolvedValue([]);
  return new OpenCode2Adapter({ workingDirectory: '/vault',
    getSettings: () => ({ mode: 'local', executablePath: 'owned-opencode', baseUrl: '', password: '' }) });
}

afterEach(() => { jest.restoreAllMocks(); isolatedScopes.length = 0; });

describe('OpenCode 2 auxiliary native scope', () => {
  it('keeps an added browser deny and isolates all data roots from the parent environment', async () => {
    const adapter = harness([deny, { action: 'browser', resource: '*', effect: 'deny' }]);
    const aux = await adapter.startAuxQuerySession({ systemPrompt: 'read only' });
    try {
      const scope = isolatedScopes[0];
      expect(scope).toBeDefined();
      for (const key of ['HOME', 'USERPROFILE', 'XDG_DATA_HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME', 'OPENCODE_DB', 'TMPDIR', 'TMP', 'TEMP']) {
        expect(scope.extraEnv?.[key]).toBeDefined();
        expect(scope.extraEnv?.[key]?.startsWith(scope.workingDirectory)).toBe(true);
      }
      await expect(aux.readSafetyRules()).resolves.toMatchObject({ sessionPermissions: [deny] });
    } finally {
      await aux.dispose();
      await adapter.stop();
    }
    await expect(access(isolatedScopes[0].workingDirectory)).rejects.toThrow();
  });

  it('rejects an allow or ask after the wildcard deny', async () => {
    for (const effect of ['allow', 'ask']) {
      const adapter = harness([deny, { action: 'browser', resource: '*', effect }]);
      await expect(adapter.startAuxQuerySession({ systemPrompt: 'read only' })).rejects.toThrow('deny rules failed readback');
      await adapter.stop();
      jest.restoreAllMocks();
    }
  });
});
