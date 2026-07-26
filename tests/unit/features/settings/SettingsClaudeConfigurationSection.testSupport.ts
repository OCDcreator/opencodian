import type { ClaudeSettingsSourceCandidate } from '../../../../src/core/agents/backend/ClaudeSettingsSourceService';
import type { ClaudeSettingsServiceBoundary } from '../../../../src/features/settings/SettingsClaudeConfigurationSection';

export const flushMicrotasks = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

export const fakePlugin = (vaultPath: string): unknown => ({
  app: { vault: { adapter: { basePath: vaultPath } } },
  invalidateSlashCommandCatalog: jest.fn(),
});

export const stubService = (overrides: Partial<ClaudeSettingsServiceBoundary> = {}): ClaudeSettingsServiceBoundary => ({
  inventory: async () => [],
  read: async () => { throw new Error('not used'); },
  write: async () => { throw new Error('not used'); },
  applyPathEdits: async () => { throw new Error('not used'); },
  delete: async () => { throw new Error('not used'); },
  listHistory: async () => { throw new Error('not used'); },
  restore: async () => { throw new Error('not used'); },
  getDefaultProjectSettingsPath: () => '/vault/.claude/settings.json',
  getDefaultGlobalSettingsPath: () => '/home/.claude/settings.json',
  ...overrides,
});

export const candidate = (over: Partial<ClaudeSettingsSourceCandidate> = {}): ClaudeSettingsSourceCandidate => ({
  scope: 'project',
  origin: 'project-settings',
  path: '/vault/.claude/settings.json',
  exists: true,
  editable: true,
  priority: 100,
  revision: { canonicalPath: '/vault/.claude/settings.json', mtimeMs: 1, size: 2, sha256: 'abc' },
  evidence: { persistence: 'verified', application: 'unavailable', runtime: 'unavailable' },
  format: 'json',
  ...over,
});

export const projectRevision = { canonicalPath: '/vault/.claude/settings.json', mtimeMs: 10, size: 3, sha256: 'dead' };

export const readOk = (content: string) => ({
  status: 'success' as const,
  source: candidate({ revision: projectRevision, exists: true }),
  content,
});
