/**
 * Tracer bullet — restore a validated delete identity after the narrow root has
 * been deleted, and confine the missing-root mapping to ENOENT-only.
 *
 * Flow: write create -> delete (exact revision) -> listHistory (delete
 * identity) -> fs.rm(<vault>/.claude) -> restore({entryIdentity, expectedRevision:null})
 * must succeed, materialize the narrow root, and restore exact bytes.
 */
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { ClaudeSettingsSourceService } from '../../../../../src/core/agents/backend/ClaudeSettingsSourceService';
import type { ArchiveHistoryEntryIdentity } from '../../../../../src/core/agents/backend/ConfigurationArchiveService';

type Revision = { canonicalPath: string; mtimeMs: number; size: number; sha256: string };

type WriteOutcome = { result: { status: 'success'; revision: Revision } | { status: 'conflict' } };

type DeleteOutcome = { result: { status: 'success' } | { status: 'conflict' } };

type HistoryOutcome =
  | { status: 'success'; targets: Array<{ entries: Array<{ archiveKind: string; identity: ArchiveHistoryEntryIdentity }> }> }
  | { status: 'invalid-target' };

type RestoreOutcome = {
  evidence: { persistence: string; application: string; runtime: string };
  result: { status: 'success' } | { status: 'conflict' } | { status: 'invalid-target' } | { status: 'read-only' };
};

type ArchiveIdentityPayload = {
  canonicalTarget: string;
  scope: string;
  entry: Record<string, unknown>;
  [key: string]: unknown;
};

type DeletedProjectHistoryFixture = {
  sandbox: string;
  home: string;
  vault: string;
  service: ClaudeSettingsSourceService;
  identity: ArchiveHistoryEntryIdentity;
};

function forgeHistoryIdentity(
  identity: ArchiveHistoryEntryIdentity,
  rewrite: (payload: ArchiveIdentityPayload) => ArchiveIdentityPayload,
): ArchiveHistoryEntryIdentity {
  const payload = JSON.parse(Buffer.from(identity, 'base64url').toString('utf8')) as ArchiveIdentityPayload;
  return Buffer.from(JSON.stringify(rewrite(payload)), 'utf8').toString('base64url') as ArchiveHistoryEntryIdentity;
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.stat(targetPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function createDeletedProjectHistory(): Promise<DeletedProjectHistoryFixture> {
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-src-forged-restore-'));
  const home = path.join(sandbox, 'home');
  const vault = path.join(sandbox, 'vault');
  const archiveRoot = path.join(sandbox, 'archive');
  await fs.mkdir(home, { recursive: true });
  await fs.mkdir(vault, { recursive: true });

  const service = new ClaudeSettingsSourceService(vault, {
    home,
    managedConfigDir: path.join(sandbox, 'managed'),
    archiveRootPath: archiveRoot,
  });
  const projectPath = path.join(vault, '.claude', 'settings.json');
  const created = (await service.write({
    targetPath: projectPath,
    content: '{"hooks":{"Stop":[]}}',
    expectedRevision: null,
  })) as WriteOutcome;
  if (created.result.status !== 'success') throw new Error('setup write failed');
  const deleted = (await service.delete({
    targetPath: projectPath,
    expectedRevision: created.result.revision,
  })) as DeleteOutcome;
  if (deleted.result.status !== 'success') throw new Error('setup delete failed');
  const history = (await service.listHistory(projectPath)) as HistoryOutcome;
  if (history.status !== 'success') throw new Error('setup history failed');
  const deleteEntry = history.targets.flatMap((target) => target.entries).find((entry) => entry.archiveKind === 'delete');
  if (deleteEntry === undefined) throw new Error('setup delete history missing');
  return { sandbox, home, vault, service, identity: deleteEntry.identity };
}

describe('ClaudeSettingsSourceService restore absent root', () => {
  it.each([
    {
      name: 'rewritten project-to-local association',
      targetRoot: (fixture: DeletedProjectHistoryFixture) => path.join(fixture.vault, '.claude'),
      rewrite: (payload: ArchiveIdentityPayload) => ({
        ...payload,
        canonicalTarget: path.join(path.dirname(payload.canonicalTarget), 'settings.local.json'),
        scope: 'local',
      }),
    },
    {
      name: 'rewritten project-to-global association',
      targetRoot: (fixture: DeletedProjectHistoryFixture) => path.join(fixture.home, '.claude'),
      rewrite: (payload: ArchiveIdentityPayload) => ({
        ...payload,
        canonicalTarget: path.join(
          path.dirname(path.dirname(path.dirname(payload.canonicalTarget))),
          'home',
          '.claude',
          'settings.json',
        ),
        scope: 'global',
      }),
    },
    {
      name: 'rewritten entry metadata with the original association',
      targetRoot: (fixture: DeletedProjectHistoryFixture) => path.join(fixture.vault, '.claude'),
      rewrite: (payload: ArchiveIdentityPayload) => ({
        ...payload,
        entry: { ...payload.entry, sha256: '0'.repeat(64) },
      }),
    },
  ])('rejects $name before an absent editable root is materialized', async ({ targetRoot, rewrite }) => {
    const fixture = await createDeletedProjectHistory();
    try {
      const rootPath = targetRoot(fixture);
      await fs.rm(rootPath, { recursive: true, force: true });
      const forgedIdentity = forgeHistoryIdentity(fixture.identity, (payload) => rewrite(payload, fixture));

      const restored = await fixture.service.restore({ entryIdentity: forgedIdentity, expectedRevision: null });

      expect({ status: restored.result.status, rootExists: await exists(rootPath) }).toEqual({
        status: 'invalid-target',
        rootExists: false,
      });
    } finally {
      await fs.rm(fixture.sandbox, { recursive: true, force: true });
    }
  });

  it('restores a validated identity after the narrow root is deleted', async () => {
    const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-src-restore-absent-'));
    const home = path.join(sandbox, 'home');
    const vault = path.join(sandbox, 'vault');
    const archiveRoot = path.join(sandbox, 'archive');
    await fs.mkdir(home, { recursive: true });
    await fs.mkdir(vault, { recursive: true });

    const service = new ClaudeSettingsSourceService(vault, {
      home,
      managedConfigDir: path.join(sandbox, 'managed'),
      archiveRootPath: archiveRoot,
    });
    const projectPath = path.join(vault, '.claude', 'settings.json');
    const claudeRoot = path.join(vault, '.claude');

    const original = '{"hooks":{"Stop":[]}}';
    const created = (await service.write({ targetPath: projectPath, content: original, expectedRevision: null })) as WriteOutcome;
    expect(created.result.status).toBe('success');
    if (created.result.status !== 'success') throw new Error('unreachable');
    const revision = created.result.revision;

    const deleted = (await service.delete({ targetPath: projectPath, expectedRevision: revision })) as DeleteOutcome;
    expect(deleted.result.status).toBe('success');

    const history = (await service.listHistory(projectPath)) as HistoryOutcome;
    expect(history.status).toBe('success');
    if (history.status !== 'success') throw new Error('unreachable');
    const deleteEntry = history.targets.flatMap((target) => target.entries).find((entry) => entry.archiveKind === 'delete');
    expect(deleteEntry).toBeDefined();
    const entryIdentity: ArchiveHistoryEntryIdentity = deleteEntry!.identity;

    // narrow root disappears entirely
    await fs.rm(claudeRoot, { recursive: true, force: true });
    await expect(fs.stat(claudeRoot)).rejects.toThrow();

    const restored = (await service.restore({ entryIdentity, expectedRevision: null })) as RestoreOutcome;
    expect(restored.result.status).toBe('success');
    expect(restored.evidence.persistence).toBe('verified');
    expect(restored.evidence.application).toBe('pending');
    expect(restored.evidence.runtime).not.toBe('verified');

    // the restore materialized the narrow root
    await expect(fs.stat(claudeRoot)).resolves.toBeDefined();

    // disk bytes exactly equal the pre-delete content
    expect(await fs.readFile(projectPath, 'utf8')).toBe(original);

    await fs.rm(sandbox, { recursive: true, force: true });
  });
});
