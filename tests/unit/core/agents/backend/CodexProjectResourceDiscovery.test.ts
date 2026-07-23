/**
 * CodexProjectResourceDiscovery tests — discovery, CRUD, validation, atomic
 * write, and path-traversal / global-readonly boundaries.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  createCodexProjectAgent,
  createCodexProjectSkill,
  defaultCodexAgentContent,
  defaultCodexSkillContent,
  deleteCodexProjectAgent,
  deleteCodexProjectSkill,
  discoverCodexGlobalAgents,
  discoverCodexGlobalSkills,
  discoverCodexProjectAgents,
  discoverCodexProjectSkills,
  readCodexAgentContent,
  readCodexSkillContent,
  updateCodexProjectAgent,
  updateCodexProjectSkill,
  validateCodexAgentContent,
  validateCodexSkillContent,
} from '../../../../../src/core/agents/backend/CodexProjectResourceDiscovery';
import { isSafeResourceName } from '../../../../../src/core/agents/backend/ProjectResourceSecureWrite';

function tmpVault(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'opencodian-codex-res-'));
}

function writeSkill(vault: string, name: string, body: string): void {
  const dir = path.join(vault, '.agents', 'skills', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), body, 'utf-8');
}

function writeAgent(vault: string, name: string, body: string): void {
  const dir = path.join(vault, '.codex', 'agents');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.toml`), body, 'utf-8');
}

describe('CodexProjectResourceDiscovery — name + validation helpers', () => {
  it('rejects unsafe resource names', () => {
    expect(isSafeResourceName('')).toBe(false);
    expect(isSafeResourceName('.hidden')).toBe(false);
    expect(isSafeResourceName('a/b')).toBe(false);
    expect(isSafeResourceName('a\\b')).toBe(false);
    expect(isSafeResourceName('ok-name')).toBe(true);
  });

  it('validates SKILL.md frontmatter', () => {
    expect(validateCodexSkillContent('no frontmatter')).not.toBeNull();
    expect(validateCodexSkillContent('---\nname: x\n---\n# x')).not.toBeNull();
    expect(validateCodexSkillContent('---\nname: x\ndescription: y\n---\n# x')).toBeNull();
  });

  it('validates agent TOML required fields', () => {
    expect(validateCodexAgentContent('name = "x"')).not.toBeNull();
    expect(validateCodexAgentContent('name = "x"\ndescription = "y"')).toBeNull();
  });
});

describe('CodexProjectResourceDiscovery — project skill CRUD', () => {
  it('discovers, creates, updates, and deletes project skills atomically', async () => {
    const vault = tmpVault();
    try {
      expect(await discoverCodexProjectSkills(vault)).toEqual([]);

      const created = await createCodexProjectSkill(vault, 'my-skill');
      expect(created.ok).toBe(true);
      expect(fs.existsSync((created as { path: string }).path)).toBe(true);

      const discovered = await discoverCodexProjectSkills(vault);
      expect(discovered.map((s) => s.name)).toEqual(['my-skill']);
      expect(discovered[0].scope).toBe('project');
      expect(discovered[0].readonly).toBe(false);

      const updated = await updateCodexProjectSkill(
        vault,
        'my-skill',
        '---\nname: my-skill\ndescription: updated\n---\n# updated\n',
      );
      expect(updated.ok).toBe(true);
      const content = await readCodexSkillContent(path.join(vault, '.agents', 'skills', 'my-skill', 'SKILL.md'));
      expect(content).toContain('updated');

      const deleted = await deleteCodexProjectSkill(vault, 'my-skill');
      expect(deleted.ok).toBe(true);
      expect(await discoverCodexProjectSkills(vault)).toEqual([]);
    } finally {
      fs.rmSync(vault, { recursive: true, force: true });
    }
  });

  it('rejects duplicate skill creation', async () => {
    const vault = tmpVault();
    try {
      writeSkill(vault, 'dup', defaultCodexSkillContent('dup'));
      const result = await createCodexProjectSkill(vault, 'dup');
      expect(result.ok).toBe(false);
      expect((result as { reason: string }).reason).toBe('duplicate');
    } finally {
      fs.rmSync(vault, { recursive: true, force: true });
    }
  });

  it('rejects invalid names and invalid content', async () => {
    const vault = tmpVault();
    try {
      const escaped = await createCodexProjectSkill(vault, '../escape');
      expect(escaped.ok).toBe(false);
      const bad = await createCodexProjectSkill(vault, 'bad', 'no frontmatter');
      expect(bad.ok).toBe(false);
    } finally {
      fs.rmSync(vault, { recursive: true, force: true });
    }
  });

  it('refuses to write outside the vault root (path traversal)', async () => {
    const vault = tmpVault();
    try {
      const result = await createCodexProjectSkill(vault, '..%2f..%2fevil'.replace(/%2f/g, '/'));
      expect(result.ok).toBe(false);
    } finally {
      fs.rmSync(vault, { recursive: true, force: true });
    }
  });
});

describe('CodexProjectResourceDiscovery — project agent CRUD', () => {
  it('discovers, creates, updates, and deletes project agents', async () => {
    const vault = tmpVault();
    try {
      expect(await discoverCodexProjectAgents(vault)).toEqual([]);

      const created = await createCodexProjectAgent(vault, 'reviewer');
      expect(created.ok).toBe(true);

      writeAgent(vault, 'extra', 'name = "extra"\ndescription = "d"\n');
      const discovered = await discoverCodexProjectAgents(vault);
      expect(discovered.map((a) => a.name).sort()).toEqual(['extra', 'reviewer']);
      expect(discovered[0].readonly).toBe(false);

      const updated = await updateCodexProjectAgent(
        vault,
        'reviewer',
        'name = "reviewer"\ndescription = "updated agent"\n',
      );
      expect(updated.ok).toBe(true);
      const content = await readCodexAgentContent(path.join(vault, '.codex', 'agents', 'reviewer.toml'));
      expect(content).toContain('updated agent');

      const deleted = await deleteCodexProjectAgent(vault, 'reviewer');
      expect(deleted.ok).toBe(true);
      expect((await discoverCodexProjectAgents(vault)).map((a) => a.name)).toEqual(['extra']);
    } finally {
      fs.rmSync(vault, { recursive: true, force: true });
    }
  });

  it('rejects duplicate agent creation', async () => {
    const vault = tmpVault();
    try {
      writeAgent(vault, 'dup', defaultCodexAgentContent('dup'));
      const result = await createCodexProjectAgent(vault, 'dup');
      expect(result.ok).toBe(false);
      expect((result as { reason: string }).reason).toBe('duplicate');
    } finally {
      fs.rmSync(vault, { recursive: true, force: true });
    }
  });
});

describe('CodexProjectResourceDiscovery — global readonly boundary', () => {
  it('discovers global skills and agents read-only without write APIs', async () => {
    const home = tmpVault();
    try {
      writeSkill(home, 'global-skill', defaultCodexSkillContent('global-skill'));
      writeAgent(home, 'global-agent', 'name = "global-agent"\ndescription = "d"\n');

      const skills = await discoverCodexGlobalSkills(home);
      expect(skills.map((s) => s.name)).toEqual(['global-skill']);
      expect(skills[0].readonly).toBe(true);
      expect(skills[0].scope).toBe('global');

      const agents = await discoverCodexGlobalAgents(home);
      expect(agents.map((a) => a.name)).toEqual(['global-agent']);
      expect(agents[0].readonly).toBe(true);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('does not discover Codex legacy ~/.codex/prompts', async () => {
    const home = tmpVault();
    try {
      const promptsDir = path.join(home, '.codex', 'prompts');
      fs.mkdirSync(promptsDir, { recursive: true });
      fs.writeFileSync(path.join(promptsDir, 'legacy.md'), 'legacy', 'utf-8');

      // No discovery function reads prompts; agents discovery only reads .codex/agents
      const agents = await discoverCodexGlobalAgents(home);
      expect(agents).toEqual([]);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
