import {
  migrateOpenCodeCapabilitySettings,
  normalizeOpenCodeCapabilitySettings,
  type OpenCodeCapabilityMigrationResult,
} from '../../../../src/core/opencode/OpenCodeCapabilitySettingsMigration';

describe('OpenCodeCapabilitySettingsMigration', () => {
  const fixedNow = 1739232000000; // 2025-02-11T00:00:00Z

  describe('normalizeOpenCodeCapabilitySettings', () => {
    it('returns defaults for empty/unknown input', () => {
      const result = normalizeOpenCodeCapabilitySettings(undefined);
      expect(result.schemaVersion).toBe(1);
      expect(result.experimentalGates).toEqual({});
      expect(result.preferences).toEqual({});
    });

    it('preserves known experimental gates', () => {
      const result = normalizeOpenCodeCapabilitySettings({
        schemaVersion: 1,
        experimentalGates: { 'v2.pty.create': true, 'v2.session.create': false },
        preferences: { 'v2.session.events': 'enabled' },
      });
      expect(result.experimentalGates['v2.pty.create']).toBe(true);
      expect(result.experimentalGates['v2.session.create']).toBe(false);
      expect(result.preferences['v2.session.events']).toBe('enabled');
    });

    it('drops unknown schema versions but keeps schemaVersion 1', () => {
      const result = normalizeOpenCodeCapabilitySettings({ schemaVersion: 99 });
      expect(result.schemaVersion).toBe(1);
    });
  });

  describe('migrateOpenCodeCapabilitySettings', () => {
    it('is idempotent: migrating an already-normalized envelope produces no changes', () => {
      const normalized = normalizeOpenCodeCapabilitySettings({
        schemaVersion: 1,
        experimentalGates: { 'v2.pty.create': true },
        preferences: {},
      });
      const result = migrateOpenCodeCapabilitySettings(normalized, fixedNow);
      expect(result.normalized).toEqual(normalized);
      expect(result.report.entries.filter((e) => e.outcome === 'migrated')).toHaveLength(0);
      expect(result.requiresBackup).toBe(false);
    });

    it('migrates a safe legacy field to the new representation', () => {
      // Legacy shape: a flat boolean that maps cleanly to an experimental gate.
      const legacyFixture = {
        experimentalGates: { 'v2.pty.create': 'true' as unknown },
      };
      const result = migrateOpenCodeCapabilitySettings(legacyFixture, fixedNow);
      expect(result.normalized.schemaVersion).toBe(1);
      const migratedEntries = result.report.entries.filter((e) => e.outcome === 'migrated');
      expect(migratedEntries.length).toBeGreaterThan(0);
    });

    it('preserves a valid legacy field that remains readable', () => {
      const legacyFixture = {
        experimentalGates: { 'v2.session.create': true },
      };
      const result = migrateOpenCodeCapabilitySettings(legacyFixture, fixedNow);
      expect(result.normalized.experimentalGates['v2.session.create']).toBe(true);
    });

    it('retains raw backup and reports an impossible mapping rather than deleting', () => {
      // Legacy shape: a value that cannot be safely mapped (e.g. a nested object
      // where a boolean gate is expected).
      const impossibleFixture = {
        experimentalGates: { 'v2.pty.create': { nested: 'not-a-bool' } as unknown },
      };
      const result = migrateOpenCodeCapabilitySettings(impossibleFixture, fixedNow);
      const impossibleEntries = result.report.entries.filter((e) => e.outcome === 'impossible');
      expect(impossibleEntries.length).toBeGreaterThan(0);
      expect(result.requiresBackup).toBe(true);
      // The raw value must be preserved in the report entry, not silently dropped.
      const entry = impossibleEntries[0];
      expect(entry.outcome).toBe('impossible');
      expect(typeof entry.reason).toBe('string');
      expect(entry.reason.length).toBeGreaterThan(0);
    });

    it('never persists secrets or raw server payloads in the report', () => {
      const fixtureWithSecret = {
        experimentalGates: { 'v2.pty.create': true },
        // Pretend a secret leaked into the legacy envelope.
        credentials: { apiKey: 'sk-secret-value-12345' },
      } as unknown;
      const result = migrateOpenCodeCapabilitySettings(fixtureWithSecret, fixedNow);
      const reportJson = JSON.stringify(result.report);
      expect(reportJson).not.toContain('sk-secret-value-12345');
    });

    it('produces a valid normalized result that passes normalization again', () => {
      const result = migrateOpenCodeCapabilitySettings(
        { experimentalGates: { 'v2.session.create': true } },
        fixedNow,
      );
      expect(result.normalized.schemaVersion).toBe(1);
      // Re-normalizing the migrated result should be a no-op.
      const reNormalized = normalizeOpenCodeCapabilitySettings(result.normalized);
      expect(reNormalized).toEqual(result.normalized);
    });
  });

  describe('OpenCodeCapabilityMigrationResult shape', () => {
    it('includes schemaVersion, entries, and requiresBackup', () => {
      const result: OpenCodeCapabilityMigrationResult = migrateOpenCodeCapabilitySettings({}, fixedNow);
      expect(result).toHaveProperty('normalized');
      expect(result).toHaveProperty('report');
      expect(result).toHaveProperty('requiresBackup');
      expect(result.report).toHaveProperty('entries');
      expect(result.report).toHaveProperty('generatedAt');
      expect(Array.isArray(result.report.entries)).toBe(true);
    });
  });
});
