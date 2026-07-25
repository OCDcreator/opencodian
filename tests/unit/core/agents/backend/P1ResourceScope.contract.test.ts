import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import {
  catalogClaudeAgentResourceHistory,
  createClaudeAgentResource,
  deleteClaudeAgentResource,
  discoverClaudeAgentResources,
  readClaudeAgentResourceContent,
  restoreClaudeAgentResourceHistoryEntry,
  updateClaudeAgentResource,
} from '../../../../../src/core/agents/backend/ClaudeProjectAgentDiscovery';
import {
  catalogClaudeCommandResourceHistory,
  createClaudeCommandResource,
  deleteClaudeCommandResource,
  discoverClaudeCommandResources,
  readClaudeCommandResourceContent,
  restoreClaudeCommandResourceHistoryEntry,
  updateClaudeCommandResource,
} from '../../../../../src/core/agents/backend/ClaudeProjectCommandDiscovery';
import {
  catalogClaudeSkillResourceHistory,
  createClaudeSkillResource,
  deleteClaudeSkillResource,
  discoverClaudeSkillResources,
  readClaudeSkillResourceContent,
  restoreClaudeSkillResourceHistoryEntry,
  updateClaudeSkillResource,
} from '../../../../../src/core/agents/backend/ClaudeProjectSkillDiscovery';
import { computeFileRevision } from '../../../../../src/core/agents/backend/ProjectResourceSecureWrite';

describe('P1-A scoped resource contract', () => {
  let sandboxPath: string;
  let archiveRootPath: string;

  beforeEach(async () => {
    sandboxPath = await fs.mkdtemp(path.join(os.tmpdir(), 'opencodian-p1-resources-'));
    archiveRootPath = path.join(sandboxPath, 'archive');
  });

  afterEach(async () => {
    await fs.rm(sandboxPath, { recursive: true, force: true });
  });

  it('creates and discovers an explicitly selected global Claude command with its target and revision', async () => {
    const created = await createClaudeCommandResource({
      scope: 'global',
      basePath: sandboxPath,
      name: 'review',
      content: '# Review\n\nReview carefully.\n',
      expectedRevision: null,
      archiveRootPath,
    });

    expect(created.status).toBe('success');
    expect(created.scope).toBe('global');
    expect(created.targetPath).toBe(path.join(sandboxPath, '.claude', 'commands', 'review.md'));

    const discovered = await discoverClaudeCommandResources({
      scope: 'global',
      basePath: sandboxPath,
    });
    expect(discovered).toHaveLength(1);
    expect(discovered[0]).toMatchObject({
      name: 'review',
      scope: 'global',
      readonly: false,
      filePath: created.targetPath,
    });
    await expect(fs.realpath(created.targetPath)).resolves.toBe(discovered[0].revision.canonicalPath);
    expect(discovered[0].revision.sha256).toMatch(/^[a-f0-9]{64}$/);
    await expect(readClaudeCommandResourceContent({
      scope: 'global',
      basePath: sandboxPath,
      name: 'review',
      expectedRevision: discovered[0].revision,
    })).resolves.toMatchObject({ status: 'success', content: '# Review\n\nReview carefully.\n' });

    const duplicate = await createClaudeCommandResource({
      scope: 'global',
      basePath: sandboxPath,
      name: 'review',
      content: '# Must not replace\n',
      expectedRevision: null,
      archiveRootPath,
    });
    expect(duplicate.status).toBe('conflict');
    await expect(fs.readFile(created.targetPath, 'utf8')).resolves.toBe('# Review\n\nReview carefully.\n');
  });

  it('preserves a stale command draft, catalogs overwrite/delete history, and restores a selected deleted target', async () => {
    const versionOne = '# Review v1\n';
    const externalVersion = '# External version three\n';
    const finalVersion = '# Review v4 final\n';
    const created = await createClaudeCommandResource({
      scope: 'global',
      basePath: sandboxPath,
      name: 'review',
      content: versionOne,
      expectedRevision: null,
      archiveRootPath,
    });
    expect(created.status).toBe('success');
    if (created.status !== 'success') throw new Error('create failed');

    const versionTwo = await updateClaudeCommandResource({
      scope: 'global',
      basePath: sandboxPath,
      name: 'review',
      content: '# Review v2\n',
      expectedRevision: created.revision,
      archiveRootPath,
    });
    expect(versionTwo.status).toBe('success');
    if (versionTwo.status !== 'success') throw new Error('update failed');

    await fs.writeFile(created.targetPath, externalVersion, 'utf8');
    const staleDraft = '# Caller draft that must survive as caller state\n';
    const conflict = await updateClaudeCommandResource({
      scope: 'global',
      basePath: sandboxPath,
      name: 'review',
      content: staleDraft,
      expectedRevision: versionTwo.revision,
      archiveRootPath,
    });
    expect(conflict.status).toBe('conflict');
    await expect(fs.readFile(created.targetPath, 'utf8')).resolves.toBe(externalVersion);

    const [external] = await discoverClaudeCommandResources({ scope: 'global', basePath: sandboxPath });
    const finalUpdate = await updateClaudeCommandResource({
      scope: 'global',
      basePath: sandboxPath,
      name: 'review',
      content: finalVersion,
      expectedRevision: external.revision,
      archiveRootPath,
    });
    expect(finalUpdate.status).toBe('success');
    if (finalUpdate.status !== 'success') throw new Error('final update failed');

    const deleted = await deleteClaudeCommandResource({
      scope: 'global',
      basePath: sandboxPath,
      name: 'review',
      expectedRevision: finalUpdate.revision,
      archiveRootPath,
    });
    expect(deleted.status).toBe('success');
    await expect(fs.stat(created.targetPath)).rejects.toMatchObject({ code: 'ENOENT' });

    const history = await catalogClaudeCommandResourceHistory({
      scope: 'global',
      basePath: sandboxPath,
      archiveRootPath,
    });
    expect(history.status).toBe('success');
    if (history.status !== 'success') throw new Error('history catalog failed');
    expect(history.targets).toHaveLength(1);
    expect(history.targets[0]).toMatchObject({ backend: 'claude', scope: 'global', kind: 'command' });
    expect(history.targets[0].entries.map((entry) => entry.archiveKind).sort()).toEqual([
      'delete',
      'overwrite',
      'overwrite',
    ]);
    const firstOverwrite = history.targets[0].entries.find(
      (entry) => entry.archiveKind === 'overwrite' && entry.size === Buffer.byteLength(versionOne),
    );
    expect(firstOverwrite).toBeDefined();

    const externalWinner = '# External winner during restore\n';
    await fs.writeFile(created.targetPath, externalWinner, 'utf8');
    const restoreConflict = await restoreClaudeCommandResourceHistoryEntry({
      scope: 'global',
      basePath: sandboxPath,
      name: 'review',
      entryIdentity: firstOverwrite!.identity,
      expectedRevision: null,
      archiveRootPath,
    });
    expect(restoreConflict.status).toBe('conflict');
    await expect(fs.readFile(created.targetPath, 'utf8')).resolves.toBe(externalWinner);
    await fs.unlink(created.targetPath);

    const restored = await restoreClaudeCommandResourceHistoryEntry({
      scope: 'global',
      basePath: sandboxPath,
      name: 'review',
      entryIdentity: firstOverwrite!.identity,
      expectedRevision: null,
      archiveRootPath,
    });
    expect(restored.status).toBe('success');
    await expect(fs.readFile(created.targetPath, 'utf8')).resolves.toBe(versionOne);
  });

  it('uses the project target path and rejects a command symlink that escapes the narrow resource root', async () => {
    const created = await createClaudeCommandResource({
      scope: 'project',
      basePath: sandboxPath,
      name: 'project-only',
      content: '# Project command\n',
      expectedRevision: null,
      archiveRootPath,
    });
    expect(created.status).toBe('success');
    expect(created.scope).toBe('project');
    expect(created.targetPath).toBe(path.join(sandboxPath, '.claude', 'commands', 'project-only.md'));

    const outsidePath = path.join(sandboxPath, 'outside-command.md');
    const outsideContent = '# Outside\n';
    await fs.writeFile(outsidePath, outsideContent, 'utf8');
    const linkPath = path.join(sandboxPath, '.claude', 'commands', 'escape.md');
    await fs.symlink(outsidePath, linkPath);

    const discovered = await discoverClaudeCommandResources({ scope: 'project', basePath: sandboxPath });
    expect(discovered.map((resource) => resource.name)).toEqual(['project-only']);
    const outsideRevision = await computeFileRevision(outsidePath);
    expect(outsideRevision).not.toBeNull();
    const escapedUpdate = await updateClaudeCommandResource({
      scope: 'project',
      basePath: sandboxPath,
      name: 'escape',
      content: '# Replaced\n',
      expectedRevision: outsideRevision!,
      archiveRootPath,
    });
    expect(escapedUpdate.status).toBe('invalid-path');
    await expect(fs.readFile(outsidePath, 'utf8')).resolves.toBe(outsideContent);
  });
});

describe('P1-A scoped Claude skill and agent contract', () => {
  let sandboxPath: string;
  let archiveRootPath: string;

  beforeEach(async () => {
    sandboxPath = await fs.mkdtemp(path.join(os.tmpdir(), 'opencodian-p1-resources-'));
    archiveRootPath = path.join(sandboxPath, 'archive');
  });

  afterEach(async () => {
    await fs.rm(sandboxPath, { recursive: true, force: true });
  });

  it('runs global Claude skill create/edit/delete/history/selected-restore through the secure contract', async () => {
    const versionOne = '---\nname: audit\ndescription: Audit v1\n---\n\n# Audit v1\n';
    const versionTwo = '---\nname: audit\ndescription: Audit v2\n---\n\n# Audit v2\n';
    const created = await createClaudeSkillResource({
      scope: 'global',
      basePath: sandboxPath,
      name: 'audit',
      content: versionOne,
      expectedRevision: null,
      archiveRootPath,
    });
    expect(created.status).toBe('success');
    if (created.status !== 'success') throw new Error('skill create failed');
    expect(created.targetPath).toBe(path.join(sandboxPath, '.claude', 'skills', 'audit', 'SKILL.md'));

    const discovered = await discoverClaudeSkillResources({ scope: 'global', basePath: sandboxPath });
    expect(discovered).toHaveLength(1);
    expect(discovered[0]).toMatchObject({
      name: 'audit',
      scope: 'global',
      readonly: false,
      skillMdPath: created.targetPath,
    });
    await expect(readClaudeSkillResourceContent({
      scope: 'global',
      basePath: sandboxPath,
      name: 'audit',
      expectedRevision: discovered[0].revision,
    })).resolves.toMatchObject({ status: 'success', content: versionOne });

    const updated = await updateClaudeSkillResource({
      scope: 'global',
      basePath: sandboxPath,
      name: 'audit',
      content: versionTwo,
      expectedRevision: discovered[0].revision,
      archiveRootPath,
    });
    expect(updated.status).toBe('success');
    if (updated.status !== 'success') throw new Error('skill update failed');
    const deleted = await deleteClaudeSkillResource({
      scope: 'global',
      basePath: sandboxPath,
      name: 'audit',
      expectedRevision: updated.revision,
      archiveRootPath,
    });
    expect(deleted.status).toBe('success');

    const history = await catalogClaudeSkillResourceHistory({
      scope: 'global',
      basePath: sandboxPath,
      archiveRootPath,
    });
    expect(history.status).toBe('success');
    if (history.status !== 'success') throw new Error('skill history failed');
    expect(history.targets).toHaveLength(1);
    expect(history.targets[0]).toMatchObject({ backend: 'claude', scope: 'global', kind: 'skill' });
    const deletedEntry = history.targets[0].entries.find((entry) => entry.archiveKind === 'delete');
    expect(deletedEntry).toBeDefined();

    const restored = await restoreClaudeSkillResourceHistoryEntry({
      scope: 'global',
      basePath: sandboxPath,
      name: 'audit',
      entryIdentity: deletedEntry!.identity,
      expectedRevision: null,
      archiveRootPath,
    });
    expect(restored.status).toBe('success');
    await expect(fs.readFile(created.targetPath, 'utf8')).resolves.toBe(versionTwo);
  });

  it('runs global Claude agent create/edit/delete/history/selected-restore through the secure contract', async () => {
    const versionOne = '---\nname: reviewer\ndescription: Review v1\n---\n\n# Reviewer v1\n';
    const versionTwo = '---\nname: reviewer\ndescription: Review v2\n---\n\n# Reviewer v2\n';
    const created = await createClaudeAgentResource({
      scope: 'global',
      basePath: sandboxPath,
      name: 'reviewer',
      content: versionOne,
      expectedRevision: null,
      archiveRootPath,
    });
    expect(created.status).toBe('success');
    if (created.status !== 'success') throw new Error('agent create failed');
    expect(created.targetPath).toBe(path.join(sandboxPath, '.claude', 'agents', 'reviewer.md'));

    const [discovered] = await discoverClaudeAgentResources({ scope: 'global', basePath: sandboxPath });
    expect(discovered).toMatchObject({ name: 'reviewer', scope: 'global', readonly: false });
    await expect(readClaudeAgentResourceContent({
      scope: 'global',
      basePath: sandboxPath,
      name: 'reviewer',
      expectedRevision: discovered.revision,
    })).resolves.toMatchObject({ status: 'success', content: versionOne });
    const updated = await updateClaudeAgentResource({
      scope: 'global',
      basePath: sandboxPath,
      name: 'reviewer',
      content: versionTwo,
      expectedRevision: discovered.revision,
      archiveRootPath,
    });
    expect(updated.status).toBe('success');
    if (updated.status !== 'success') throw new Error('agent update failed');
    const deleted = await deleteClaudeAgentResource({
      scope: 'global',
      basePath: sandboxPath,
      name: 'reviewer',
      expectedRevision: updated.revision,
      archiveRootPath,
    });
    expect(deleted.status).toBe('success');

    const history = await catalogClaudeAgentResourceHistory({
      scope: 'global',
      basePath: sandboxPath,
      archiveRootPath,
    });
    expect(history.status).toBe('success');
    if (history.status !== 'success') throw new Error('agent history failed');
    expect(history.targets).toHaveLength(1);
    expect(history.targets[0]).toMatchObject({ backend: 'claude', scope: 'global', kind: 'agent' });
    const deletedEntry = history.targets[0].entries.find((entry) => entry.archiveKind === 'delete');
    expect(deletedEntry).toBeDefined();
    const restored = await restoreClaudeAgentResourceHistoryEntry({
      scope: 'global',
      basePath: sandboxPath,
      name: 'reviewer',
      entryIdentity: deletedEntry!.identity,
      expectedRevision: null,
      archiveRootPath,
    });
    expect(restored.status).toBe('success');
    await expect(fs.readFile(created.targetPath, 'utf8')).resolves.toBe(versionTwo);
  });
});

describe('P1-A Claude fixed-root confinement', () => {
  let sandboxPath: string;
  let outsidePath: string;

  beforeEach(async () => {
    sandboxPath = await fs.mkdtemp(path.join(os.tmpdir(), 'opencodian-p1-claude-victim-'));
    outsidePath = await fs.mkdtemp(path.join(os.tmpdir(), 'opencodian-p1-claude-outside-'));
  });

  afterEach(async () => {
    await fs.rm(sandboxPath, { recursive: true, force: true });
    await fs.rm(outsidePath, { recursive: true, force: true });
  });

  it('does not create a global command root through an escaping .claude symlink', async () => {
    await fs.symlink(outsidePath, path.join(sandboxPath, '.claude'));
    const created = await createClaudeCommandResource({
      scope: 'global',
      basePath: sandboxPath,
      name: 'escape',
      content: '# Must stay confined\n',
      expectedRevision: null,
      archiveRootPath: path.join(sandboxPath, 'archive'),
    });

    expect(created.status).toBe('invalid-path');
    await expect(fs.stat(path.join(outsidePath, 'commands'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.stat(path.join(outsidePath, 'commands', 'escape.md'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
