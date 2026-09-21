/**
 * advantage-parity R-F7: claude-code env assembly contract — the resolved
 * domain environment is merged under the legacy `settings.env` map, which
 * keeps its historical final-say priority.
 */

import { buildClaudeCodeOptions } from '../../../../../src/core/agents/backend';
import { getDefaultClaudeCodeBackendSettings } from '../../../../../src/core/types';

describe('ClaudeCodeOptionsBuilder domainEnv (R-F7)', () => {
  it('merges domain env below the legacy settings.env map', () => {
    const settings = {
      ...getDefaultClaudeCodeBackendSettings(),
      env: { BOTH: 'from-legacy', LEGACY_ONLY: 'legacy' },
    };

    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings,
      domainEnv: { SHARED: 'domain', BOTH: 'from-domains' },
    });

    expect(options.env).toEqual({
      SHARED: 'domain',
      BOTH: 'from-legacy',
      LEGACY_ONLY: 'legacy',
    });
  });

  it('still emits env from domains alone when no legacy map exists', () => {
    const settings = {
      ...getDefaultClaudeCodeBackendSettings(),
      env: {},
    };

    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings,
      domainEnv: { SHARED: 'domain' },
    });

    expect(options.env).toEqual({ SHARED: 'domain' });
  });

  it('keeps the byte-identical no-domains behavior (env omitted when legacy empty)', () => {
    const options = buildClaudeCodeOptions({
      vaultPath: '/vault/project',
      settings: getDefaultClaudeCodeBackendSettings(),
    });

    expect(options).not.toHaveProperty('env');
  });
});
