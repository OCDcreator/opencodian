/**
 * RED-1 / GREEN-1 — Claude settings source inventory (vertical slice).
 *
 * Observes the future public API:
 *   new ClaudeSettingsSourceService(vaultPath, deterministicOptions).inventory()
 *
 * Finds the four base sources by stable origin (and managed base by origin +
 * expected path) so future managed-settings.d / plist candidates can coexist
 * without breaking this slice. Asserts the full precedence chain Managed >
 * CLI args > Local > Project > User (CLI args is not a file candidate). Managed
 * is read-only. No real user settings are read; every path is injected.
 */
import { createHash } from 'node:crypto';

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { ClaudeSettingsSourceService } from '../../../../../src/core/agents/backend/ClaudeSettingsSourceService';

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

const VALID_EVIDENCE_STATUS = new Set([
  'verified',
  'pending',
  'unavailable',
  'failed',
  'not-applicable',
]);

type Candidate = {
  scope: string;
  origin: string;
  path: string;
  exists: boolean;
  editable: boolean;
  priority: number;
  revision: {
    canonicalPath: string;
    mtimeMs: number;
    size: number;
    sha256: string;
  } | null;
  evidence: {
    persistence: string;
    application: string;
    runtime: string;
  };
};

function findByOrigin(list: Candidate[], origin: string): Candidate | undefined {
  return list.find((c) => c.origin === origin);
}

function findManagedBase(list: Candidate[], expectedPath: string): Candidate | undefined {
  return list.find((c) => c.origin === 'managed-file' && c.path === expectedPath);
}

function expectRevision(revision: unknown, expectedContent: string): void {
  expect(revision).not.toBeNull();
  const r = revision as Candidate['revision'];
  if (r === null) throw new Error('revision unexpectedly null');
  expect(typeof r.canonicalPath).toBe('string');
  expect(r.canonicalPath.length).toBeGreaterThan(0);
  expect(typeof r.mtimeMs).toBe('number');
  expect(typeof r.size).toBe('number');
  // Content-addressed proof over temp content (not real user data).
  expect(r.sha256).toBe(sha256(expectedContent));
}

function expectHonestEvidence(evidence: unknown): void {
  expect(evidence).toBeTruthy();
  expect(typeof evidence).toBe('object');
  const e = evidence as Candidate['evidence'];
  for (const axis of [e.persistence, e.application, e.runtime]) {
    expect(VALID_EVIDENCE_STATUS.has(axis)).toBe(true);
  }
  // Inventory is a read-only discovery pass with no backend readback, so the
  // runtime axis must never impersonate "verified".
  expect(e.runtime).not.toBe('verified');
}

describe('ClaudeSettingsSourceService inventory', () => {
  it('discovers Global, Project, Local, and read-only managed settings sources in real Claude precedence order without filesystem side effects', async () => {
    // ---- deterministic temp roots (never touches real user settings) ----
    const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-src-inv-'));
    const home = path.join(sandbox, 'home');
    const vault = path.join(sandbox, 'vault');
    const managedConfigDir = path.join(sandbox, 'managed');
    await fs.mkdir(home, { recursive: true });
    await fs.mkdir(vault, { recursive: true });
    await fs.mkdir(managedConfigDir, { recursive: true });

    const globalContent = '{"hooks":{"Stop":[]}}';
    const projectContent = '{"hooks":{"PreToolUse":[]}}';
    const localContent = '{"hooks":{"PostToolUse":[]}}';
    const managedContent = '{"permissions":{"deny":["Bash"]}}';

    const globalPath = path.join(home, '.claude', 'settings.json');
    const projectPath = path.join(vault, '.claude', 'settings.json');
    const localPath = path.join(vault, '.claude', 'settings.local.json');
    const managedPath = path.join(managedConfigDir, 'managed-settings.json');

    await fs.mkdir(path.dirname(globalPath), { recursive: true });
    await fs.mkdir(path.dirname(projectPath), { recursive: true });
    await fs.writeFile(globalPath, globalContent, 'utf8');
    await fs.writeFile(projectPath, projectContent, 'utf8');
    await fs.writeFile(localPath, localContent, 'utf8');
    await fs.writeFile(managedPath, managedContent, 'utf8');

    const inventory = (await new ClaudeSettingsSourceService(vault, {
      home,
      managedConfigDir,
    }).inventory()) as Candidate[];

    expect(Array.isArray(inventory)).toBe(true);

    // Find the four base sources by stable origin (and managed base by path)
    // so future extra managed candidates (drop-ins / plist) do not break this.
    const global = findByOrigin(inventory, 'user-settings');
    const project = findByOrigin(inventory, 'project-settings');
    const local = findByOrigin(inventory, 'local-settings');
    const managed = findManagedBase(inventory, managedPath);
    expect(global).toBeDefined();
    expect(project).toBeDefined();
    expect(local).toBeDefined();
    expect(managed).toBeDefined();

    // resolved paths equal the injected deterministic roots (no real-path fallback)
    expect(global!.path).toBe(globalPath);
    expect(project!.path).toBe(projectPath);
    expect(local!.path).toBe(localPath);
    expect(managed!.path).toBe(managedPath);

    // exists + editable (managed is read-only and never writable)
    expect(global!.exists).toBe(true);
    expect(project!.exists).toBe(true);
    expect(local!.exists).toBe(true);
    expect(managed!.exists).toBe(true);
    expect(global!.editable).toBe(true);
    expect(project!.editable).toBe(true);
    expect(local!.editable).toBe(true);
    expect(managed!.editable).toBe(false);

    // revisions are real and content-addressed over the temp content written
    expectRevision(global!.revision, globalContent);
    expectRevision(project!.revision, projectContent);
    expectRevision(local!.revision, localContent);
    expectRevision(managed!.revision, managedContent);

    // honest three-axis evidence on every base candidate
    expectHonestEvidence(global!.evidence);
    expectHonestEvidence(project!.evidence);
    expectHonestEvidence(local!.evidence);
    expectHonestEvidence(managed!.evidence);

    // precedence reflects the full file chain Managed > Local > Project > User.
    // (CLI args sits between Managed and Local in Claude's full chain but is not
    // a file candidate, so it is absent from inventory.)
    expect(managed!.priority).toBeGreaterThan(local!.priority);
    expect(local!.priority).toBeGreaterThan(project!.priority);
    expect(project!.priority).toBeGreaterThan(global!.priority);

    // ---- second call: absent managed dir must produce no side effects ----
    const absentManagedDir = path.join(sandbox, 'absent-managed');
    const absentManagedPath = path.join(absentManagedDir, 'managed-settings.json');
    const inventoryWithAbsentManaged = (await new ClaudeSettingsSourceService(vault, {
      home,
      managedConfigDir: absentManagedDir,
    }).inventory()) as Candidate[];

    // inventory() must not create the missing managed directory or any file.
    await expect(fs.stat(absentManagedDir)).rejects.toThrow();
    const absentManaged = findManagedBase(inventoryWithAbsentManaged, absentManagedPath);
    expect(absentManaged).toBeDefined();
    expect(absentManaged!.exists).toBe(false);
    expect(absentManaged!.editable).toBe(false);
    expect(absentManaged!.revision).toBeNull();

    await fs.rm(sandbox, { recursive: true, force: true });
  });

  it('maps a non-ENOENT root error to failed evidence, not absent', async () => {
    const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-src-fail-'));
    const home = path.join(sandbox, 'home');
    const vault = path.join(sandbox, 'vault');
    await fs.mkdir(home, { recursive: true });
    await fs.mkdir(vault, { recursive: true });

    // A single path component longer than NAME_MAX (255) raises ENAMETOOLONG
    // on macOS — a non-ENOENT root error that must fail closed instead of
    // masquerading as a benign absent source.
    const overlongManagedDir = path.join(sandbox, 'x'.repeat(300));
    const managedPath = path.join(overlongManagedDir, 'managed-settings.json');

    const inventory = (await new ClaudeSettingsSourceService(vault, {
      home,
      managedConfigDir: overlongManagedDir,
    }).inventory()) as Candidate[];

    const managed = findManagedBase(inventory, managedPath);
    expect(managed).toBeDefined();
    expect(managed!.exists).toBe(false);
    expect(managed!.revision).toBeNull();
    // A real I/O failure is not a missing source: persistence must be 'failed',
    // never 'not-applicable'.
    expect(managed!.evidence.persistence).toBe('failed');
    expect(managed!.evidence.runtime).not.toBe('verified');

    await fs.rm(sandbox, { recursive: true, force: true });
  });
});
