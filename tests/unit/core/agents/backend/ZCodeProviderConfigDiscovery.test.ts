/**
 * ZCodeProviderConfigDiscovery.test.ts — provider configuration discovery and
 * the official injection-pair contract.
 *
 * Covers root resolution (env override, beta channel, home default), builtin
 * config discovery (entry-anchored and per-platform), the all-or-nothing pair
 * rule (`ZCODE_BUILTIN_PROVIDER_CONFIG_FILE` + `ZCODE_PERSONAL_PROVIDER_CONFIG_FILE`),
 * honest validation states, and the read-only contract (discovery never writes).
 */
import { describe, expect, it } from '@jest/globals';

import {
  discoverZCodeProviderConfig,
  resolveZCodeDataRoot,
} from '../../../../../src/core/agents/backend/zcode/ZCodeProviderConfigDiscovery';

const homedir = '/home/tester';
const builtinPath = '/Applications/ZCode.app/Contents/Resources/config/provider/zcode-builtin.json';
const personalPath = '/home/tester/.zcode/v2/provider_config.json';

function fsFixture(files: Record<string, string>) {
  return {
    existsSync: (candidate: string) => candidate in files,
    readFile: (candidate: string) => {
      const contents = files[candidate];
      if (contents === undefined) throw new Error('ENOENT');
      return contents;
    },
  };
}

describe('resolveZCodeDataRoot', () => {
  it('prefers ZCODE_STORAGE_DIR when set', () => {
    expect(resolveZCodeDataRoot({ env: { ZCODE_STORAGE_DIR: '/data/zcode' }, homedir })).toBe('/data/zcode');
  });

  it('defaults to ~/.zcode', () => {
    expect(resolveZCodeDataRoot({ env: {}, homedir })).toBe('/home/tester/.zcode');
  });

  it('uses the beta channel root when the runtime reports beta', () => {
    expect(resolveZCodeDataRoot({ env: { ZCODE_BETA: '1' }, homedir })).toBe('/home/tester/.zcode-beta');
    expect(resolveZCodeDataRoot({ env: { ZCODE_ENV: 'beta' }, homedir })).toBe('/home/tester/.zcode-beta');
  });
});

describe('discoverZCodeProviderConfig — injection pair', () => {
  it('injects the complete pair when builtin is validated and personal is present', () => {
    const snapshot = discoverZCodeProviderConfig({
      env: {},
      homedir,
      platform: 'darwin',
      ...fsFixture({
        [builtinPath]: JSON.stringify({ providers: {} }),
        [personalPath]: JSON.stringify({ config: { providerConfigRules: { providerRules: [{}, {}] } } }),
      }),
    });
    expect(snapshot.state).toBe('validated');
    expect(snapshot.builtinConfigPath).toBe(builtinPath);
    expect(snapshot.configPath).toBe(personalPath);
    expect(snapshot.providerCount).toBe(2);
    expect(snapshot.env).toEqual({
      ZCODE_STORAGE_DIR: '/home/tester/.zcode',
      ZCODE_BUILTIN_PROVIDER_CONFIG_FILE: builtinPath,
      ZCODE_PERSONAL_PROVIDER_CONFIG_FILE: personalPath,
    });
  });

  it('anchors builtin discovery to the resolved runtime entry (glm -> config/provider)', () => {
    const entryAnchored = '/opt/custom/resources/config/provider/zcode-builtin.json';
    const snapshot = discoverZCodeProviderConfig({
      env: {},
      homedir,
      platform: 'linux',
      entryPath: '/opt/custom/resources/glm/zcode.cjs',
      ...fsFixture({
        [entryAnchored]: JSON.stringify({ providers: {} }),
        [personalPath]: JSON.stringify({}),
      }),
    });
    expect(snapshot.state).toBe('validated');
    expect(snapshot.builtinConfigPath).toBe(entryAnchored);
  });

  it('counts provider rules via the formal schema and reports unknown shapes as unavailable', () => {
    const withRules = discoverZCodeProviderConfig({
      env: {},
      homedir,
      platform: 'darwin',
      ...fsFixture({
        [builtinPath]: JSON.stringify({ providers: {} }),
        [personalPath]: JSON.stringify({ config: { providerConfigRules: { providerRules: [{}, {}, {}] } } }),
      }),
    });
    expect(withRules.providerCount).toBe(3);
    const unknownShape = discoverZCodeProviderConfig({
      env: {},
      homedir,
      platform: 'darwin',
      ...fsFixture({
        [builtinPath]: JSON.stringify({ providers: {} }),
        [personalPath]: JSON.stringify({ something: 'else' }),
      }),
    });
    // An unknown shape must never fabricate a count (not even 0).
    expect(unknownShape.providerCount).toBeNull();
  });

  it('reports builtin read failures as unreadable, distinct from malformed JSON', () => {
    const snapshot = discoverZCodeProviderConfig({
      env: {},
      homedir,
      platform: 'darwin',
      existsSync: (candidate) => candidate === builtinPath,
      readFile: (candidate) => {
        if (candidate === builtinPath) throw new Error('EACCES');
        return '{}';
      },
    });
    expect(snapshot.state).toBe('unreadable');
    expect(snapshot.detail).toContain('never rewrites this file');
  });

  it('still injects the pair when the personal config is absent (runtime-managed first run)', () => {
    const snapshot = discoverZCodeProviderConfig({
      env: {},
      homedir,
      platform: 'darwin',
      ...fsFixture({ [builtinPath]: JSON.stringify({ providers: {} }) }),
    });
    expect(snapshot.state).toBe('validated');
    expect(snapshot.providerCount).toBeNull();
    expect(snapshot.env['ZCODE_PERSONAL_PROVIDER_CONFIG_FILE']).toBe(personalPath);
  });

  it('never injects half of the pair: builtin missing means storage env only', () => {
    const snapshot = discoverZCodeProviderConfig({
      env: {},
      homedir,
      platform: 'linux',
      ...fsFixture({ [personalPath]: JSON.stringify({}) }),
    });
    expect(snapshot.state).toBe('missing');
    expect(snapshot.builtinConfigPath).toBeNull();
    expect(snapshot.detail).toContain('zcode-builtin.json');
    expect(Object.keys(snapshot.env)).toEqual(['ZCODE_STORAGE_DIR']);
  });

  it('blocks the pair when the personal config is malformed and never rewrites it', () => {
    const snapshot = discoverZCodeProviderConfig({
      env: {},
      homedir,
      platform: 'darwin',
      ...fsFixture({
        [builtinPath]: JSON.stringify({ providers: {} }),
        [personalPath]: '{not json',
      }),
    });
    expect(snapshot.state).toBe('malformed');
    expect(snapshot.detail).toContain('never rewrites this file');
    expect(Object.keys(snapshot.env)).toEqual(['ZCODE_STORAGE_DIR']);
  });

  it('reports a malformed builtin config without injecting the pair', () => {
    const snapshot = discoverZCodeProviderConfig({
      env: {},
      homedir,
      platform: 'darwin',
      ...fsFixture({ [builtinPath]: '[1,2,3]' }),
    });
    expect(snapshot.state).toBe('malformed');
    expect(Object.keys(snapshot.env)).toEqual(['ZCODE_STORAGE_DIR']);
  });

  it('honors explicit env paths for both halves and Windows path semantics', () => {
    const snapshot = discoverZCodeProviderConfig({
      env: {
        ZCODE_STORAGE_DIR: 'C:\\Users\\tester\\.zcode',
        ZCODE_DATA_BASE_DIR: 'C:\\Users\\tester',
        ZCODE_BUILTIN_PROVIDER_CONFIG_FILE: 'C:\\zcode\\zcode-builtin.json',
        ZCODE_PERSONAL_PROVIDER_CONFIG_FILE: 'C:\\zcode\\personal.json',
      },
      homedir: 'C:\\Users\\tester',
      platform: 'win32',
      ...fsFixture({
        'C:\\zcode\\zcode-builtin.json': JSON.stringify({ providers: {} }),
        'C:\\zcode\\personal.json': JSON.stringify({ config: { providerConfigRules: { providerRules: [{}] } } }),
      }),
    });
    expect(snapshot.state).toBe('validated');
    expect(snapshot.env['ZCODE_BUILTIN_PROVIDER_CONFIG_FILE']).toBe('C:\\zcode\\zcode-builtin.json');
    expect(snapshot.env['ZCODE_PERSONAL_PROVIDER_CONFIG_FILE']).toBe('C:\\zcode\\personal.json');
    expect(snapshot.providerCount).toBe(1);
  });
});
