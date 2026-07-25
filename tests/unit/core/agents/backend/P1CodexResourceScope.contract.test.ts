import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import {
  catalogCodexAgentResourceHistory,
  catalogCodexSkillResourceHistory,
  createCodexAgentResource,
  createCodexSkillResource,
  deleteCodexAgentResource,
  deleteCodexSkillResource,
  discoverCodexAgentResources,
  discoverCodexProjectAgents,
  discoverCodexProjectSkills,
  discoverCodexSkillResources,
  readCodexAgentResourceContent,
  readCodexSkillResourceContent,
  restoreCodexAgentResourceHistoryEntry,
  restoreCodexSkillResourceHistoryEntry,
  updateCodexAgentResource,
  updateCodexSkillResource,
  validateCodexAgentContent,
} from '../../../../../src/core/agents/backend/CodexProjectResourceDiscovery';

describe('P1-A scoped Codex resource contract', () => {
  let sandboxPath: string;
  let archiveRootPath: string;

  beforeEach(async () => {
    sandboxPath = await fs.mkdtemp(path.join(os.tmpdir(), 'opencodian-p1-codex-resources-'));
    archiveRootPath = path.join(sandboxPath, 'archive');
  });

  afterEach(async () => {
    await fs.rm(sandboxPath, { recursive: true, force: true });
  });

  it('runs global Codex skill create/edit/delete/history/selected-restore through the secure contract', async () => {
    const versionOne = '---\nname: planner\ndescription: Plan v1\n---\n\n# Planner v1\n';
    const versionTwo = '---\nname: planner\ndescription: Plan v2\n---\n\n# Planner v2\n';
    const created = await createCodexSkillResource({
      scope: 'global',
      basePath: sandboxPath,
      name: 'planner',
      content: versionOne,
      expectedRevision: null,
      archiveRootPath,
    });
    expect(created.status).toBe('success');
    if (created.status !== 'success') throw new Error('Codex skill create failed');
    expect(created.targetPath).toBe(path.join(sandboxPath, '.agents', 'skills', 'planner', 'SKILL.md'));

    const [discovered] = await discoverCodexSkillResources({ scope: 'global', basePath: sandboxPath });
    expect(discovered).toMatchObject({ name: 'planner', scope: 'global', readonly: false });
    await expect(readCodexSkillResourceContent({
      scope: 'global',
      basePath: sandboxPath,
      name: 'planner',
      expectedRevision: discovered.revision,
    })).resolves.toMatchObject({ status: 'success', content: versionOne });
    const updated = await updateCodexSkillResource({
      scope: 'global',
      basePath: sandboxPath,
      name: 'planner',
      content: versionTwo,
      expectedRevision: discovered.revision,
      archiveRootPath,
    });
    expect(updated.status).toBe('success');
    if (updated.status !== 'success') throw new Error('Codex skill update failed');
    const deleted = await deleteCodexSkillResource({
      scope: 'global',
      basePath: sandboxPath,
      name: 'planner',
      expectedRevision: updated.revision,
      archiveRootPath,
    });
    expect(deleted.status).toBe('success');

    const history = await catalogCodexSkillResourceHistory({
      scope: 'global',
      basePath: sandboxPath,
      archiveRootPath,
    });
    expect(history.status).toBe('success');
    if (history.status !== 'success') throw new Error('Codex skill history failed');
    expect(history.targets).toHaveLength(1);
    expect(history.targets[0]).toMatchObject({ backend: 'codex', scope: 'global', kind: 'skill' });
    const deletedEntry = history.targets[0].entries.find((entry) => entry.archiveKind === 'delete');
    expect(deletedEntry).toBeDefined();
    const restored = await restoreCodexSkillResourceHistoryEntry({
      scope: 'global',
      basePath: sandboxPath,
      name: 'planner',
      entryIdentity: deletedEntry!.identity,
      expectedRevision: null,
      archiveRootPath,
    });
    expect(restored.status).toBe('success');
    await expect(fs.readFile(created.targetPath, 'utf8')).resolves.toBe(versionTwo);
  });

  it('validates the complete Codex agent TOML document instead of matching required fields by regex', () => {
    expect(validateCodexAgentContent('name = "reviewer"\ndescription = "Review code"\n')).toBeNull();
    expect(validateCodexAgentContent('name = "reviewer"\ndescription = "Review code"\nbroken = [\n')).not.toBeNull();
    expect(validateCodexAgentContent('name = 42\ndescription = "Review code"\n')).not.toBeNull();
    expect(validateCodexAgentContent('[nested]\nname = "reviewer"\ndescription = "Review code"\n')).not.toBeNull();
    expect(validateCodexAgentContent('name = "one"\nname = "two"\ndescription = "Review code"\n')).not.toBeNull();
  });

  it('does not follow a symlinked Codex resource root while discovering skill or agent metadata', async () => {
    const outsidePath = await fs.mkdtemp(path.join(os.tmpdir(), 'opencodian-p1-codex-outside-'));
    try {
      const outsideSkillsRoot = path.join(outsidePath, 'skills');
      const outsideAgentsRoot = path.join(outsidePath, 'agents');
      await fs.mkdir(path.join(outsideSkillsRoot, 'escaped'), { recursive: true });
      await fs.mkdir(outsideAgentsRoot, { recursive: true });
      await fs.writeFile(
        path.join(outsideSkillsRoot, 'escaped', 'SKILL.md'),
        '---\nname: escaped\ndescription: ROOT-EXTERNAL SKILL BYTES\n---\n\n# Escaped\n',
        'utf8',
      );
      await fs.writeFile(
        path.join(outsideAgentsRoot, 'escaped.toml'),
        'name = "escaped"\ndescription = "ROOT-EXTERNAL AGENT BYTES"\n',
        'utf8',
      );
      await fs.mkdir(path.join(sandboxPath, '.agents'), { recursive: true });
      await fs.mkdir(path.join(sandboxPath, '.codex'), { recursive: true });
      await fs.symlink(outsideSkillsRoot, path.join(sandboxPath, '.agents', 'skills'));
      await fs.symlink(outsideAgentsRoot, path.join(sandboxPath, '.codex', 'agents'));

      await expect(discoverCodexProjectSkills(sandboxPath)).resolves.toEqual([]);
      await expect(discoverCodexSkillResources({ scope: 'project', basePath: sandboxPath })).resolves.toEqual([]);
      await expect(discoverCodexProjectAgents(sandboxPath)).resolves.toEqual([]);
      await expect(discoverCodexAgentResources({ scope: 'project', basePath: sandboxPath })).resolves.toEqual([]);
    } finally {
      await fs.rm(outsidePath, { recursive: true, force: true });
    }
  });

  it('runs global Codex agent TOML create/edit/delete/history/selected-restore through the secure contract', async () => {
    const versionOne = '# v1\nname = "reviewer"\ndescription = "Review v1"\n';
    const versionTwo = '# v2\nname = "reviewer"\ndescription = "Review v2"\n';
    const created = await createCodexAgentResource({
      scope: 'global',
      basePath: sandboxPath,
      name: 'reviewer',
      content: versionOne,
      expectedRevision: null,
      archiveRootPath,
    });
    expect(created.status).toBe('success');
    if (created.status !== 'success') throw new Error('Codex agent create failed');
    expect(created.targetPath).toBe(path.join(sandboxPath, '.codex', 'agents', 'reviewer.toml'));

    const [discovered] = await discoverCodexAgentResources({ scope: 'global', basePath: sandboxPath });
    expect(discovered).toMatchObject({ name: 'reviewer', scope: 'global', readonly: false });
    await expect(readCodexAgentResourceContent({
      scope: 'global',
      basePath: sandboxPath,
      name: 'reviewer',
      expectedRevision: discovered.revision,
    })).resolves.toMatchObject({ status: 'success', content: versionOne });
    const updated = await updateCodexAgentResource({
      scope: 'global',
      basePath: sandboxPath,
      name: 'reviewer',
      content: versionTwo,
      expectedRevision: discovered.revision,
      archiveRootPath,
    });
    expect(updated.status).toBe('success');
    if (updated.status !== 'success') throw new Error('Codex agent update failed');
    const deleted = await deleteCodexAgentResource({
      scope: 'global',
      basePath: sandboxPath,
      name: 'reviewer',
      expectedRevision: updated.revision,
      archiveRootPath,
    });
    expect(deleted.status).toBe('success');

    const history = await catalogCodexAgentResourceHistory({
      scope: 'global',
      basePath: sandboxPath,
      archiveRootPath,
    });
    expect(history.status).toBe('success');
    if (history.status !== 'success') throw new Error('Codex agent history failed');
    expect(history.targets).toHaveLength(1);
    expect(history.targets[0]).toMatchObject({ backend: 'codex', scope: 'global', kind: 'agent', format: 'toml' });
    const deletedEntry = history.targets[0].entries.find((entry) => entry.archiveKind === 'delete');
    expect(deletedEntry).toBeDefined();
    const restored = await restoreCodexAgentResourceHistoryEntry({
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
