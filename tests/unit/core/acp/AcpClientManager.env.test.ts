/**
 * advantage-parity R-F7: AcpClientManager spawn env contract — the resolved
 * domain env is injected between process.env and the agent's own config.env.
 */

import { spawn } from 'node:child_process';

import { AcpClientManager } from '../../../../src/core/acp/AcpClientManager';
import type { AcpAgentConfig } from '../../../../src/core/acp/types';

jest.mock('node:child_process', () => ({
  spawn: jest.fn().mockReturnValue({
    on: jest.fn(),
    kill: jest.fn(),
  }),
}));

const spawnMock = spawn as unknown as jest.Mock;

const buildAgent = (overrides: Partial<AcpAgentConfig> = {}): AcpAgentConfig => ({
  id: 'grok',
  name: 'Grok',
  command: 'grok-acp',
  args: ['--stdio'],
  env: { AGENT_ONLY: 'from-config' },
  enabled: true,
  ...overrides,
});

const buildManager = (getDomainsEnv?: (agentKey: string) => Record<string, string>): AcpClientManager => {
  const manager = new AcpClientManager(getDomainsEnv ? { getDomainsEnv } : {});
  manager.loadConfigs([buildAgent()]);
  return manager;
};

describe('AcpClientManager spawn env merge order (R-F7)', () => {
  beforeEach(() => {
    spawnMock.mockClear();
    process.env.BASE_ONLY = 'from-process';
  });

  it('merges process env < domain env < agent config env', async () => {
    const manager = buildManager((agentKey) => ({
      DOMAIN: `domain-${agentKey}`,
      AGENT_ONLY: 'from-domains',
    }));

    await manager.connect('grok');

    const env = spawnMock.mock.calls[0][2].env as Record<string, string>;
    expect(env.BASE_ONLY).toBe('from-process');
    expect(env.DOMAIN).toBe('domain-grok');
    expect(env.AGENT_ONLY).toBe('from-config');
  });

  it('keeps the previous behavior when no domain resolver is injected', async () => {
    const manager = buildManager();

    await manager.connect('grok');

    const env = spawnMock.mock.calls[0][2].env as Record<string, string>;
    expect(env.BASE_ONLY).toBe('from-process');
    expect(env.AGENT_ONLY).toBe('from-config');
    expect(env.DOMAIN).toBeUndefined();
  });

  it('scopes domain env by agent id', async () => {
    const manager = new AcpClientManager({
      getDomainsEnv: (agentKey) => (agentKey === 'grok' ? { WHO: 'grok' } : { WHO: 'other' }),
    });
    manager.loadConfigs([
      buildAgent(),
      buildAgent({ id: 'other-agent', name: 'Other' }),
    ]);

    await manager.connect('grok');
    await manager.connect('other-agent');

    expect((spawnMock.mock.calls[0][2].env as Record<string, string>).WHO).toBe('grok');
    expect((spawnMock.mock.calls[1][2].env as Record<string, string>).WHO).toBe('other');
  });
});
