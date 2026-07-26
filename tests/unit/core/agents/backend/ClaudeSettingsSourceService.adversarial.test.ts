/**
 * Adversarial acceptance: evidence over existing ClaudeSettingsSourceService
 * public behavior with real temp filesystem fixtures (no mocks). No source is
 * modified here.
 */
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { ClaudeSettingsSourceService } from '../../../../../src/core/agents/backend/ClaudeSettingsSourceService';
import type { ArchiveHistoryEntryIdentity } from '../../../../../src/core/agents/backend/ConfigurationArchiveService';

const mkVault = async (home: string, vault: string, managedConfigDir: string, archiveRootPath: string) => {
  await fs.mkdir(home, { recursive: true });
  await fs.mkdir(vault, { recursive: true });
  await fs.mkdir(managedConfigDir, { recursive: true });
  return new ClaudeSettingsSourceService(vault, { home, managedConfigDir, archiveRootPath });
};

describe('ClaudeSettingsSourceService adversarial', () => {
  it('archive failure leaves the winner untouched', async () => {
    const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-adv-archive-'));
    const home = path.join(sandbox, 'home');
    const vault = path.join(sandbox, 'vault');
    const managedConfigDir = path.join(sandbox, 'managed');
    // archiveRootPath whose parent is a regular file -> archive cannot create its dir
    const blocker = path.join(sandbox, 'blocker');
    await fs.writeFile(blocker, 'x', 'utf8');
    const archiveRootPath = path.join(blocker, 'archive');
    const service = await mkVault(home, vault, managedConfigDir, archiveRootPath);

    const projectPath = path.join(vault, '.claude', 'settings.json');
    const v1 = '{"hooks":{"Stop":[]}}';
    const created = await service.write({ targetPath: projectPath, content: v1, expectedRevision: null });
    if (created.result.status !== 'success') throw new Error('setup write failed');
    const revision = created.result.revision;

    const v2 = '{"hooks":{"Stop":[]},"permissions":{"allow":["Bash"]}}';
    const outcome = await service.write({ targetPath: projectPath, content: v2, expectedRevision: revision });
    expect(outcome.result.status).toBe('archive-failed');
    // disk bytes remain the exact original winner
    expect(await fs.readFile(projectPath, 'utf8')).toBe(v1);
    // honest evidence
    expect(outcome.evidence.persistence).toBe('failed');
    expect(outcome.evidence.runtime).not.toBe('verified');

    await fs.rm(sandbox, { recursive: true, force: true });
  });

  it('writable-path confinement: symlinked .claude and non-candidate targets fail closed and create nothing', async () => {
    const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-adv-confine-'));
    const home = path.join(sandbox, 'home');
    const vault = path.join(sandbox, 'vault');
    const external = path.join(sandbox, 'external');
    const managedConfigDir = path.join(sandbox, 'managed');
    const archiveRootPath = path.join(sandbox, 'archive');
    await fs.mkdir(home, { recursive: true });
    await fs.mkdir(vault, { recursive: true });
    await fs.mkdir(external, { recursive: true });
    await fs.mkdir(managedConfigDir, { recursive: true });
    // vault/.claude is a symlink escaping to an external directory
    await fs.symlink(external, path.join(vault, '.claude'), 'dir');
    const service = new ClaudeSettingsSourceService(vault, { home, managedConfigDir, archiveRootPath });

    const projectTarget = service.getDefaultProjectSettingsPath();
    const res = await service.write({ targetPath: projectTarget, content: '{"hooks":{}}', expectedRevision: null });
    expect(res.result.status).not.toBe('success');
    // no external settings file created through the escaped symlink
    await expect(fs.access(path.join(external, 'settings.json'))).rejects.toThrow();

    // a non-candidate target outside the exact inventory returns invalid-target and creates nothing
    const outside = path.join(vault, 'outside.json');
    const res2 = await service.write({ targetPath: outside, content: '{"hooks":{}}', expectedRevision: null });
    expect(res2.result.status).toBe('invalid-target');
    await expect(fs.access(outside)).rejects.toThrow();

    await fs.rm(sandbox, { recursive: true, force: true });
  });

  it('restore validates identity before materialization (wrong vault + tampered identity)', async () => {
    const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-adv-restore-'));
    const home = path.join(sandbox, 'home');
    const managedConfigDir = path.join(sandbox, 'managed');
    const archiveRootPath = path.join(sandbox, 'shared-archive');
    const vaultA = path.join(sandbox, 'vaultA');
    const vaultB = path.join(sandbox, 'vaultB');
    const serviceA = await mkVault(home, vaultA, managedConfigDir, archiveRootPath);
    await fs.mkdir(vaultB, { recursive: true });
    const serviceB = new ClaudeSettingsSourceService(vaultB, { home, managedConfigDir, archiveRootPath });

    // produce a valid Project delete-history identity in vault A (shared archive)
    const projectA = path.join(vaultA, '.claude', 'settings.json');
    const created = await serviceA.write({ targetPath: projectA, content: '{"hooks":{"Stop":[]}}', expectedRevision: null });
    if (created.result.status !== 'success') throw new Error('setup write failed');
    const revision = created.result.revision;
    const deleted = await serviceA.delete({ targetPath: projectA, expectedRevision: revision });
    if (deleted.result.status !== 'success') throw new Error('setup delete failed');
    const history = await serviceA.listHistory(projectA);
    if (history.status !== 'success') throw new Error('setup history failed');
    const deleteEntry = history.targets.flatMap((t) => t.entries).find((e) => e.archiveKind === 'delete');
    expect(deleteEntry).toBeDefined();
    const identity: ArchiveHistoryEntryIdentity = deleteEntry!.identity;

    // vault B's .claude is absent before restore
    await expect(fs.stat(path.join(vaultB, '.claude'))).rejects.toThrow();

    // restore with vault A's identity against vault B -> wrong target, no materialization
    const wrongTarget = await serviceB.restore({ entryIdentity: identity, expectedRevision: null });
    expect(wrongTarget.result.status).toBe('invalid-target');
    await expect(fs.stat(path.join(vaultB, '.claude'))).rejects.toThrow();

    // tampered opaque identity -> invalid-target, no materialization
    const tampered = (identity + 'tampered') as ArchiveHistoryEntryIdentity;
    const tamperRes = await serviceB.restore({ entryIdentity: tampered, expectedRevision: null });
    expect(tamperRes.result.status).toBe('invalid-target');
    await expect(fs.stat(path.join(vaultB, '.claude'))).rejects.toThrow();

    await fs.rm(sandbox, { recursive: true, force: true });
  });
});
