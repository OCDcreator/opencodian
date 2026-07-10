import {
  getOpenCodeSdkCapabilityRegistry,
  OPENCODE_SDK_CAPABILITY_REGISTRY,
  type OpenCodeSdkCapabilityDefinition,
} from '../../../../src/core/opencode/OpenCodeSdkCapabilityRegistry';

const EXPECTED_NEW_V2_SUBNAMESPACES = [
  'v2.health',
  'v2.location',
  'v2.agent',
  'v2.integration',
  'v2.credential',
  'v2.permission',
  'v2.fs',
  'v2.command',
  'v2.skill',
  'v2.event',
  'v2.pty',
  'v2.question',
  'v2.reference',
  'v2.projectCopy',
];

describe('OpenCodeSdkCapabilityRegistry', () => {
  const registry = getOpenCodeSdkCapabilityRegistry();

  describe('structural integrity', () => {
    it('every entry has a unique id', () => {
      const ids = registry.map((entry) => entry.id);
      const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
      expect(duplicates).toEqual([]);
    });

    it('every sdkPath is non-empty and has at least one segment', () => {
      for (const entry of registry) {
        expect(entry.sdkPath.length).toBeGreaterThan(0);
        for (const segment of entry.sdkPath) {
          expect(typeof segment).toBe('string');
          expect(segment.length).toBeGreaterThan(0);
        }
      }
    });

    it('the defensive copy returned by the getter is a fresh array of plain objects', () => {
      const first = getOpenCodeSdkCapabilityRegistry();
      const second = getOpenCodeSdkCapabilityRegistry();
      expect(first).not.toBe(second);
      expect(first.length).toBe(second.length);
      // mutating the copy must not affect subsequent reads
      first.push({ ...(first[0] as OpenCodeSdkCapabilityDefinition) });
      (first[0].sdkPath as string[])[0] = 'mutated';
      expect(getOpenCodeSdkCapabilityRegistry().length).toBe(second.length);
      expect(getOpenCodeSdkCapabilityRegistry()[0].sdkPath[0]).not.toBe('mutated');
    });

    it('the frozen source constant has the same length as the getter', () => {
      expect(OPENCODE_SDK_CAPABILITY_REGISTRY.length).toBe(registry.length);
    });
  });

  describe('gate defaults by risk class', () => {
    it('read-only entries have defaultGate=true', () => {
      const readOnly = registry.filter((entry) => entry.risk === 'read-only');
      expect(readOnly.length).toBeGreaterThan(0);
      for (const entry of readOnly) {
        expect(entry.defaultGate).toBe(true);
      }
    });

    it('state-changing entries have defaultGate=false', () => {
      const stateChanging = registry.filter((entry) => entry.risk === 'state-changing');
      expect(stateChanging.length).toBeGreaterThan(0);
      for (const entry of stateChanging) {
        expect(entry.defaultGate).toBe(false);
      }
    });

    it('experimental-action entries have defaultGate=false', () => {
      const experimental = registry.filter((entry) => entry.risk === 'experimental-action');
      expect(experimental.length).toBeGreaterThan(0);
      for (const entry of experimental) {
        expect(entry.defaultGate).toBe(false);
      }
    });

    it('stream entries have defaultGate=false', () => {
      const streams = registry.filter((entry) => entry.risk === 'stream');
      expect(streams.length).toBeGreaterThan(0);
      for (const entry of streams) {
        expect(entry.defaultGate).toBe(false);
      }
    });
  });

  describe('server-probe consistency', () => {
    it('state-changing and experimental-action entries never use a read probe', () => {
      const risky = registry.filter(
        (entry) => entry.risk === 'state-changing' || entry.risk === 'experimental-action',
      );
      expect(risky.length).toBeGreaterThan(0);
      for (const entry of risky) {
        expect(entry.serverProbe).not.toBe('read');
      }
    });

    it('read-only entries use the read probe', () => {
      const readOnly = registry.filter((entry) => entry.risk === 'read-only');
      for (const entry of readOnly) {
        expect(entry.serverProbe).toBe('read');
      }
    });

    it('stream entries use a presence probe', () => {
      const streams = registry.filter((entry) => entry.risk === 'stream');
      for (const entry of streams) {
        expect(entry.serverProbe).toBe('presence');
      }
    });
  });

  describe('v2 subnamespace coverage', () => {
    it('covers all 14 new client.v2.* subnamespaces from the inventory', () => {
      for (const subnamespace of EXPECTED_NEW_V2_SUBNAMESPACES) {
        const matching = registry.filter(
          (entry) => entry.sdkPath[0] === 'v2' && `${entry.sdkPath[0]}.${entry.sdkPath[1]}` === subnamespace,
        );
        expect(matching.length).toBeGreaterThan(0);
      }
    });

    it('each new v2 subnamespace entry carries a minimumServerHint', () => {
      const v2Entries = registry.filter((entry) => entry.sdkPath[0] === 'v2');
      expect(v2Entries.length).toBeGreaterThan(0);
      for (const entry of v2Entries) {
        expect(entry.minimumServerHint).toBeDefined();
        expect(typeof entry.minimumServerHint).toBe('string');
      }
    });

    it('includes the canonical v2.health.get entry from the inventory', () => {
      const health = registry.find((entry) => entry.id === 'v2.health.get');
      expect(health).toBeDefined();
      expect(health?.sdkPath).toEqual(['v2', 'health', 'get']);
      expect(health?.risk).toBe('read-only');
      expect(health?.defaultGate).toBe(true);
    });
  });

  describe('definition shape', () => {
    const requiredKeys: ReadonlyArray<keyof OpenCodeSdkCapabilityDefinition> = [
      'id',
      'sdkPath',
      'category',
      'surface',
      'risk',
      'defaultGate',
      'serverProbe',
      'fallbackPolicy',
      'minimumServerHint',
      'description',
    ];

    it.each(requiredKeys.filter((key) => key !== 'minimumServerHint'))(
      'every entry has a defined %s field',
      (key) => {
        for (const entry of registry) {
          expect(entry[key]).not.toBeUndefined();
        }
      },
    );

    it.each(['sdkPath', 'defaultGate', 'description'] as const)(
      'every entry has a correctly-typed %s field',
      (key) => {
        const typeChecks: Record<string, (v: unknown) => boolean> = {
          sdkPath: (v) => Array.isArray(v),
          defaultGate: (v) => typeof v === 'boolean',
          description: (v) => typeof v === 'string' && (v as string).length > 0,
        };
        const checker = typeChecks[key];
        for (const entry of registry) {
          expect(checker(entry[key])).toBe(true);
        }
      },
    );

    it('every defined minimumServerHint is a string', () => {
      const definedHints = registry
        .map((entry) => entry.minimumServerHint)
        .filter((hint): hint is string => typeof hint === 'string');
      // sanity: the registry uses string hints
      const nonStringHints = registry
        .map((entry) => entry.minimumServerHint)
        .filter((hint) => hint !== undefined && typeof hint !== 'string');
      expect(nonStringHints).toEqual([]);
      expect(definedHints.length).toBeGreaterThan(0);
    });
  });
});
