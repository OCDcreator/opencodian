import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { ClaudeSettingsSourceService } from '../../../../../src/core/agents/backend/ClaudeSettingsSourceService';

async function archiveDeletedProjectSettings(
  service: ClaudeSettingsSourceService,
  projectPath: string,
): Promise<void> {
  const created = await service.write({
    targetPath: projectPath,
    content: '{"hooks":{"Stop":[]}}',
    expectedRevision: null,
  });
  if (created.result.status !== 'success') throw new Error('setup write failed');
  const deleted = await service.delete({
    targetPath: projectPath,
    expectedRevision: created.result.revision,
  });
  if (deleted.result.status !== 'success') throw new Error('setup delete failed');
}

describe('ClaudeSettingsSourceService missing-root history', () => {
  it('lists the selected delete history after its narrow root is removed without materializing it', async () => {
    const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-src-list-missing-'));
    const home = path.join(sandbox, 'home');
    const vault = path.join(sandbox, 'vault');
    const archiveRootPath = path.join(sandbox, 'archive');
    const claudeRoot = path.join(vault, '.claude');
    const projectPath = path.join(claudeRoot, 'settings.json');
    await fs.mkdir(home, { recursive: true });
    await fs.mkdir(vault, { recursive: true });
    const service = new ClaudeSettingsSourceService(vault, {
      home,
      managedConfigDir: path.join(sandbox, 'managed'),
      archiveRootPath,
    });

    await archiveDeletedProjectSettings(service, projectPath);
    await fs.rm(claudeRoot, { recursive: true, force: true });

    const history = await service.listHistory(projectPath);

    expect(history.status).toBe('success');
    if (history.status !== 'success') throw new Error('history lookup failed');
    expect(history.targets).toHaveLength(1);
    expect(history.targets[0].entries.map((entry) => entry.archiveKind)).toContain('delete');
    await expect(fs.stat(claudeRoot)).rejects.toThrow();
    await fs.rm(sandbox, { recursive: true, force: true });
  });

  it('matches archived history when the configured vault path is a lexical symlink', async () => {
    const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-src-list-symlink-'));
    const home = path.join(sandbox, 'home');
    const realVault = path.join(sandbox, 'real-vault');
    const lexicalVault = path.join(sandbox, 'vault-link');
    const archiveRootPath = path.join(sandbox, 'archive');
    await fs.mkdir(home, { recursive: true });
    await fs.mkdir(realVault, { recursive: true });
    await fs.symlink(realVault, lexicalVault, 'dir');
    const service = new ClaudeSettingsSourceService(lexicalVault, {
      home,
      managedConfigDir: path.join(sandbox, 'managed'),
      archiveRootPath,
    });
    const projectPath = service.getDefaultProjectSettingsPath();
    const realClaudeRoot = path.join(realVault, '.claude');

    await archiveDeletedProjectSettings(service, projectPath);
    await fs.rm(realClaudeRoot, { recursive: true, force: true });

    const history = await service.listHistory(projectPath);

    expect(history.status).toBe('success');
    if (history.status !== 'success') throw new Error('history lookup failed');
    expect(history.targets).toHaveLength(1);
    expect(history.targets[0].entries.map((entry) => entry.archiveKind)).toContain('delete');
    await expect(fs.stat(realClaudeRoot)).rejects.toThrow();
    await fs.rm(sandbox, { recursive: true, force: true });
  });

  it('returns only the current project when a shared archive root contains another vault', async () => {
    const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-src-list-shared-'));
    const home = path.join(sandbox, 'home');
    const vaultA = path.join(sandbox, 'vault-a');
    const vaultB = path.join(sandbox, 'vault-b');
    const archiveRootPath = path.join(sandbox, 'archive');
    await fs.mkdir(home, { recursive: true });
    await fs.mkdir(vaultA, { recursive: true });
    await fs.mkdir(vaultB, { recursive: true });
    const serviceA = new ClaudeSettingsSourceService(vaultA, {
      home,
      managedConfigDir: path.join(sandbox, 'managed'),
      archiveRootPath,
    });
    const serviceB = new ClaudeSettingsSourceService(vaultB, {
      home,
      managedConfigDir: path.join(sandbox, 'managed'),
      archiveRootPath,
    });
    const projectA = serviceA.getDefaultProjectSettingsPath();
    const projectB = serviceB.getDefaultProjectSettingsPath();
    await archiveDeletedProjectSettings(serviceA, projectA);
    await archiveDeletedProjectSettings(serviceB, projectB);
    await fs.rm(path.dirname(projectA), { recursive: true, force: true });
    const expectedA = path.join(await fs.realpath(vaultA), '.claude', 'settings.json');

    const catalog = await serviceA.catalogHistory('project');
    const history = await serviceA.listHistory(projectA);

    expect(catalog.status).toBe('success');
    if (catalog.status !== 'success') throw new Error('catalog lookup failed');
    expect(catalog.targets.map((target) => target.canonicalTarget)).toEqual([expectedA]);
    expect(history.status).toBe('success');
    if (history.status !== 'success') throw new Error('history lookup failed');
    expect(history.targets.map((target) => target.canonicalTarget)).toEqual([expectedA]);
    expect(history.targets[0].entries.map((entry) => entry.archiveKind)).toContain('delete');
    await expect(fs.stat(path.dirname(projectA))).rejects.toThrow();
    await fs.rm(sandbox, { recursive: true, force: true });
  });

  it('uses injected Windows case-insensitive comparison for a target path variant', async () => {
    const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-src-list-win-case-'));
    const home = path.join(sandbox, 'home');
    const vault = path.join(sandbox, 'VaultCase');
    const archiveRootPath = path.join(sandbox, 'archive');
    await fs.mkdir(home, { recursive: true });
    await fs.mkdir(vault, { recursive: true });
    const service = new ClaudeSettingsSourceService(vault, {
      home,
      managedConfigDir: path.join(sandbox, 'managed'),
      archiveRootPath,
      platform: 'win32',
    });
    const projectPath = service.getDefaultProjectSettingsPath();
    await archiveDeletedProjectSettings(service, projectPath);
    await fs.rm(path.dirname(projectPath), { recursive: true, force: true });
    const caseVariant = projectPath.replace('VaultCase', 'vaultcase');
    expect(caseVariant).not.toBe(projectPath);

    const history = await service.listHistory(caseVariant);

    expect(history.status).toBe('success');
    if (history.status !== 'success') throw new Error('history lookup failed');
    expect(history.targets).toHaveLength(1);
    expect(history.targets[0].entries.map((entry) => entry.archiveKind)).toContain('delete');
    await expect(fs.stat(path.dirname(projectPath))).rejects.toThrow();
    await fs.rm(sandbox, { recursive: true, force: true });
  });

  it('fails closed on a corrupt archive manifest without materializing the missing root', async () => {
    const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-src-list-corrupt-'));
    const home = path.join(sandbox, 'home');
    const vault = path.join(sandbox, 'vault');
    const archiveRootPath = path.join(sandbox, 'archive');
    await fs.mkdir(home, { recursive: true });
    await fs.mkdir(vault, { recursive: true });
    const service = new ClaudeSettingsSourceService(vault, {
      home,
      managedConfigDir: path.join(sandbox, 'managed'),
      archiveRootPath,
    });
    const projectPath = service.getDefaultProjectSettingsPath();
    const claudeRoot = path.dirname(projectPath);
    await archiveDeletedProjectSettings(service, projectPath);
    await fs.rm(claudeRoot, { recursive: true, force: true });
    const settingsArchiveRoot = path.join(archiveRootPath, 'claude', 'project', 'settings');
    const hashDirs = await fs.readdir(settingsArchiveRoot);
    expect(hashDirs).toHaveLength(1);
    await fs.writeFile(path.join(settingsArchiveRoot, hashDirs[0], 'manifest.json'), '{', 'utf8');

    const history = await service.listHistory(projectPath);

    expect(history.status).toBe('archive-failed');
    await expect(fs.stat(claudeRoot)).rejects.toThrow();
    await fs.rm(sandbox, { recursive: true, force: true });
  });
});
