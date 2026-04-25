import { AgentCatalogService } from '../../../../src/core/agents/AgentCatalogService';
import { SystemAgentGuardService } from '../../../../src/core/agents/SystemAgentGuardService';
import {
  type AgentCatalogInput,
  isSystemAgentId,
  type RuntimeAgentShape,
  SYSTEM_AGENT_IDS,
} from '../../../../src/core/agents/types';
import type { OpencodeAgentConfig } from '../../../../src/core/types/opencodeConfig';

function makeRuntimeAgent(overrides: Partial<RuntimeAgentShape> & { name: string }): RuntimeAgentShape {
  return {
    mode: 'primary',
    ...overrides,
  };
}

function makeConfigAgent(overrides: Partial<OpencodeAgentConfig> = {}): OpencodeAgentConfig {
  return { ...overrides };
}

describe('isSystemAgentId', () => {
  it.each(SYSTEM_AGENT_IDS as unknown as string[])(
    'recognizes "%s" as a system agent',
    (id) => {
      expect(isSystemAgentId(id)).toBe(true);
    },
  );

  it('does not match non-system agent IDs', () => {
    expect(isSystemAgentId('build')).toBe(false);
    expect(isSystemAgentId('plan')).toBe(false);
    expect(isSystemAgentId('explore')).toBe(false);
    expect(isSystemAgentId('')).toBe(false);
    expect(isSystemAgentId('custom-agent')).toBe(false);
  });

  it('narrows the type correctly', () => {
    const id = 'title';
    expect(isSystemAgentId(id)).toBe(true);
    const _typed: 'title' | 'summary' | 'compaction' = id;
    expect(_typed).toBe(id);
  });
});

describe('SYSTEM_AGENT_IDS', () => {
  it('contains exactly title, summary, compaction', () => {
    expect(SYSTEM_AGENT_IDS).toEqual(['title', 'summary', 'compaction']);
  });
});

describe('SystemAgentGuardService', () => {
  let guard: SystemAgentGuardService;

  beforeEach(() => {
    guard = new SystemAgentGuardService();
  });

  describe('checkWriteAllowed', () => {
    it('allows writes to non-system agents', () => {
      const result = guard.checkWriteAllowed('build');
      expect(result).toEqual({
        agentId: 'build',
        isSystem: false,
        allowed: true,
      });
    });

    it('blocks writes to system agents when expert mode is off', () => {
      for (const id of SYSTEM_AGENT_IDS) {
        const result = guard.checkWriteAllowed(id);
        expect(result.isSystem).toBe(true);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain(id);
        expect(result.reason).toContain('expert mode');
      }
    });

    it('allows writes to system agents when expert mode is on', () => {
      guard.setExpertMode(true);
      for (const id of SYSTEM_AGENT_IDS) {
        const result = guard.checkWriteAllowed(id);
        expect(result.isSystem).toBe(true);
        expect(result.allowed).toBe(true);
        expect(result.reason).toBeUndefined();
      }
    });

    it('toggles expert mode correctly', () => {
      expect(guard.expertMode).toBe(false);
      guard.setExpertMode(true);
      expect(guard.expertMode).toBe(true);
      guard.setExpertMode(false);
      expect(guard.expertMode).toBe(false);
    });
  });

  describe('getRiskLabel', () => {
    it('returns null for non-system agents', () => {
      expect(guard.getRiskLabel('build')).toBeNull();
      expect(guard.getRiskLabel('custom')).toBeNull();
    });

    it('returns read-only label when expert mode is off', () => {
      expect(guard.getRiskLabel('title')).toBe('Built-in System Agent (read-only)');
    });

    it('returns expert-override label when expert mode is on', () => {
      guard.setExpertMode(true);
      expect(guard.getRiskLabel('title')).toBe('Built-in System Agent (expert override allowed)');
    });
  });
});

describe('AgentCatalogService - source layers', () => {
  let service: AgentCatalogService;

  beforeEach(() => {
    service = new AgentCatalogService();
  });

  describe('builtin agents from runtime only', () => {
    it('maps a single runtime agent', () => {
      const input: AgentCatalogInput = {
        runtimeAgents: [makeRuntimeAgent({ name: 'build', description: 'Default agent' })],
        configAgents: {},
      };

      const catalog = service.aggregate(input);
      expect(catalog).toHaveLength(1);

      const agent = catalog[0]!;
      expect(agent.id).toBe('build');
      expect(agent.displayName).toBe('build');
      expect(agent.description).toBe('Default agent');
      expect(agent.mode).toBe('primary');
      expect(agent.sources).toEqual(['runtime']);
      expect(agent.hidden).toBe(false);
      expect(agent.disabled).toBe(false);
      expect(agent.system).toBe(false);
      expect(agent.runtimeAvailable).toBe(true);
      expect(agent.hasProjectOverride).toBe(false);
      expect(agent.defaultEligible).toBe(true);
      expect(agent.subagentVisible).toBe(false);
    });

    it('maps multiple runtime agents', () => {
      const input: AgentCatalogInput = {
        runtimeAgents: [
          makeRuntimeAgent({ name: 'build', mode: 'primary' }),
          makeRuntimeAgent({ name: 'plan', mode: 'primary' }),
          makeRuntimeAgent({ name: 'explore', mode: 'subagent' }),
          makeRuntimeAgent({ name: 'general', mode: 'subagent' }),
        ],
        configAgents: {},
      };

      const catalog = service.aggregate(input);
      expect(catalog).toHaveLength(4);

      const byId = Object.fromEntries(catalog.map((a) => [a.id, a]));

      expect(byId['build']!.defaultEligible).toBe(true);
      expect(byId['plan']!.defaultEligible).toBe(true);
      expect(byId['explore']!.defaultEligible).toBe(false);
      expect(byId['general']!.defaultEligible).toBe(false);
      expect(byId['explore']!.subagentVisible).toBe(true);
      expect(byId['general']!.subagentVisible).toBe(true);
      expect(byId['build']!.subagentVisible).toBe(false);
    });
  });

  describe('builtin + config override', () => {
    it('merges config override into a runtime agent', () => {
      const input: AgentCatalogInput = {
        runtimeAgents: [
          makeRuntimeAgent({ name: 'build', mode: 'primary', description: 'Default' }),
        ],
        configAgents: {
          build: makeConfigAgent({ description: 'Customized build agent', steps: 10 }),
        },
      };

      const catalog = service.aggregate(input);
      expect(catalog).toHaveLength(1);

      const agent = catalog[0]!;
      expect(agent.sources).toEqual(['runtime', 'config']);
      expect(agent.description).toBe('Customized build agent');
      expect(agent.hasProjectOverride).toBe(true);
      expect(agent.rawConfig?.steps).toBe(10);
    });

    it('config override can change mode from primary to all', () => {
      const input: AgentCatalogInput = {
        runtimeAgents: [
          makeRuntimeAgent({ name: 'build', mode: 'primary' }),
        ],
        configAgents: {
          build: makeConfigAgent({ mode: 'all' }),
        },
      };

      const catalog = service.aggregate(input);
      const agent = catalog[0]!;
      expect(agent.mode).toBe('all');
      expect(agent.defaultEligible).toBe(true);
      expect(agent.subagentVisible).toBe(true);
    });

    it('config override can hide an agent', () => {
      const input: AgentCatalogInput = {
        runtimeAgents: [
          makeRuntimeAgent({ name: 'build', mode: 'primary' }),
        ],
        configAgents: {
          build: makeConfigAgent({ hidden: true }),
        },
      };

      const catalog = service.aggregate(input);
      const agent = catalog[0]!;
      expect(agent.hidden).toBe(true);
      expect(agent.defaultEligible).toBe(false);
      expect(agent.subagentVisible).toBe(false);
    });

    it('config override can disable an agent', () => {
      const input: AgentCatalogInput = {
        runtimeAgents: [
          makeRuntimeAgent({ name: 'build', mode: 'primary' }),
        ],
        configAgents: {
          build: makeConfigAgent({ disable: true }),
        },
      };

      const catalog = service.aggregate(input);
      const agent = catalog[0]!;
      expect(agent.disabled).toBe(true);
      expect(agent.defaultEligible).toBe(false);
    });
  });

  describe('config-only agents', () => {
    it('creates an agent that only exists in config', () => {
      const input: AgentCatalogInput = {
        runtimeAgents: [],
        configAgents: {
          'my-custom': makeConfigAgent({
            description: 'Custom agent',
            mode: 'all',
          }),
        },
      };

      const catalog = service.aggregate(input);
      expect(catalog).toHaveLength(1);

      const agent = catalog[0]!;
      expect(agent.id).toBe('my-custom');
      expect(agent.sources).toEqual(['config']);
      expect(agent.runtimeAvailable).toBe(false);
      expect(agent.hasProjectOverride).toBe(true);
      expect(agent.mode).toBe('all');
      expect(agent.defaultEligible).toBe(true);
    });
  });

  describe('markdown-only agents', () => {
    it('creates an agent that only exists in the file layer', () => {
      const input: AgentCatalogInput = {
        runtimeAgents: [],
        configAgents: {},
        fileAgents: [
          {
            path: '.opencode/agents/researcher.md',
            scope: 'project',
            agentId: 'researcher',
            frontmatter: { mode: 'all' },
            promptBody: 'Research the current project state.',
            parseStatus: 'ok',
            runtimeSeen: false,
          },
        ],
      };

      const catalog = service.aggregate(input);
      expect(catalog).toHaveLength(1);

      const agent = catalog[0]!;
      expect(agent.id).toBe('researcher');
      expect(agent.sources).toEqual(['file']);
      expect(agent.originPath).toBe('.opencode/agents/researcher.md');
      expect(agent.runtimeAvailable).toBe(false);
      expect(agent.hasProjectOverride).toBe(false);
      expect(agent.mode).toBeNull();
      expect(agent.defaultEligible).toBe(false);
      expect(agent.subagentVisible).toBe(false);
    });
  });

  describe('system agents', () => {
    it('identifies system agents regardless of source', () => {
      const input: AgentCatalogInput = {
        runtimeAgents: [
          makeRuntimeAgent({ name: 'title', mode: 'primary', hidden: true }),
          makeRuntimeAgent({ name: 'summary', mode: 'primary', hidden: true }),
          makeRuntimeAgent({ name: 'compaction', mode: 'primary', hidden: true }),
        ],
        configAgents: {},
      };

      const catalog = service.aggregate(input);
      expect(catalog).toHaveLength(3);

      for (const agent of catalog) {
        expect(agent.system).toBe(true);
        expect(agent.hidden).toBe(true);
        expect(agent.defaultEligible).toBe(false);
      }
    });

    it('allows config override on system agents (guard is separate)', () => {
      const input: AgentCatalogInput = {
        runtimeAgents: [
          makeRuntimeAgent({ name: 'title', mode: 'primary', hidden: true }),
        ],
        configAgents: {
          title: makeConfigAgent({ description: 'Custom title', mode: 'primary', hidden: false }),
        },
      };

      const catalog = service.aggregate(input);
      const agent = catalog[0]!;
      expect(agent.system).toBe(true);
      expect(agent.hasProjectOverride).toBe(true);
      expect(agent.hidden).toBe(false);
      expect(agent.defaultEligible).toBe(true);
    });
  });
});

describe('AgentCatalogService - field resolution', () => {
  let service: AgentCatalogService;

  beforeEach(() => {
    service = new AgentCatalogService();
  });

  describe('mode=all agents', () => {
    it('is both defaultEligible and subagentVisible', () => {
      const input: AgentCatalogInput = {
        runtimeAgents: [
          makeRuntimeAgent({ name: 'multi', mode: 'all' }),
        ],
        configAgents: {},
      };

      const catalog = service.aggregate(input);
      const agent = catalog[0]!;
      expect(agent.defaultEligible).toBe(true);
      expect(agent.subagentVisible).toBe(true);
    });
  });

  describe('unknown mode', () => {
    it('treats unrecognized mode as null', () => {
      const input: AgentCatalogInput = {
        runtimeAgents: [
          makeRuntimeAgent({ name: 'weird', mode: 'something-else' }),
        ],
        configAgents: {},
      };

      const catalog = service.aggregate(input);
      const agent = catalog[0]!;
      expect(agent.mode).toBeNull();
      expect(agent.defaultEligible).toBe(false);
      expect(agent.subagentVisible).toBe(false);
    });
  });

  describe('empty input', () => {
    it('returns empty catalog', () => {
      const catalog = service.aggregate({
        runtimeAgents: [],
        configAgents: {},
      });
      expect(catalog).toEqual([]);
    });
  });

  describe('displayName', () => {
    it('uses config name when provided', () => {
      const input: AgentCatalogInput = {
        runtimeAgents: [
          makeRuntimeAgent({ name: 'build' }),
        ],
        configAgents: {
          build: makeConfigAgent({ name: 'Builder' }),
        },
      };

      const catalog = service.aggregate(input);
      expect(catalog[0]!.displayName).toBe('Builder');
    });

    it('falls back to id when no display name is set', () => {
      const input: AgentCatalogInput = {
        runtimeAgents: [
          makeRuntimeAgent({ name: 'build' }),
        ],
        configAgents: {},
      };

      const catalog = service.aggregate(input);
      expect(catalog[0]!.displayName).toBe('build');
    });
  });

  describe('native/builtin flag', () => {
    it('sets builtin from runtime native field', () => {
      const input: AgentCatalogInput = {
        runtimeAgents: [
          makeRuntimeAgent({ name: 'build', native: true }),
        ],
        configAgents: {},
      };

      const catalog = service.aggregate(input);
      expect(catalog[0]!.builtin).toBe(true);
    });

    it('sets builtin from runtime builtIn field', () => {
      const input: AgentCatalogInput = {
        runtimeAgents: [
          makeRuntimeAgent({ name: 'build', builtIn: true }),
        ],
        configAgents: {},
      };

      const catalog = service.aggregate(input);
      expect(catalog[0]!.builtin).toBe(true);
    });

    it('leaves builtin undefined when no runtime data', () => {
      const input: AgentCatalogInput = {
        runtimeAgents: [],
        configAgents: {
          'custom': makeConfigAgent({ mode: 'primary' }),
        },
      };

      const catalog = service.aggregate(input);
      expect(catalog[0]!.builtin).toBeUndefined();
    });
  });
});
