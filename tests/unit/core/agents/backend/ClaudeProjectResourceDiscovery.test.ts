/**
 * Claude project resource discovery tests — CRUD, validation, atomic write,
 * path-traversal protection, and global-readonly boundary.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  createClaudeProjectAgent,
  createClaudeProjectCommand,
  createClaudeProjectSkill,
  defaultClaudeAgentContent,
  defaultClaudeCommandContent,
  defaultClaudeSkillContent,
  deleteClaudeProjectAgent,
  deleteClaudeProjectCommand,
  deleteClaudeProjectSkill,
  discoverClaudeGlobalAgents,
  discoverClaudeGlobalCommands,
  discoverClaudeGlobalSkills,
  discoverClaudeProjectAgents,
  discoverClaudeProjectCommands,
  discoverClaudeProjectSkills,
  updateClaudeProjectAgent,
  updateClaudeProjectCommand,
  updateClaudeProjectSkill,
  validateClaudeAgentContent,
  validateClaudeCommandContent,
  validateClaudeSkillContent,
} from '../../../../../src/core/agents/backend';

function tmpVault(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'opencodian-claude-res-'));
}

function writeFile(root: string, rel: string, body: string): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body, 'utf-8');
}

describe('Claude resource discovery — commands CRUD + global readonly', () => {
  it('discovers, creates, updates, and deletes project commands', async () => {
    const vault = tmpVault();
    try {
      expect(await discoverClaudeProjectCommands(vault)).toEqual([]);

      const created = await createClaudeProjectCommand(vault, 'summarize');
      expect(created).not.toBeNull();
      expect(fs.existsSync(created!)).toBe(true);

      const discovered = await discoverClaudeProjectCommands(vault);
      expect(discovered.map((c) => c.name)).toEqual(['summarize']);
      expect(discovered[0].scope).toBe('project');
      expect(discovered[0].readonly).toBe(false);

      const updated = await updateClaudeProjectCommand(vault, 'summarize', '# summarize\nUpdated body.\n');
      expect(updated.ok).toBe(true);

      const deleted = await deleteClaudeProjectCommand(vault, 'summarize');
      expect(deleted.ok).toBe(true);
      expect(await discoverClaudeProjectCommands(vault)).toEqual([]);
    } finally {
      fs.rmSync(vault, { recursive: true, force: true });
    }
  });

  it('rejects duplicate command creation and invalid names', async () => {
    const vault = tmpVault();
    try {
      writeFile(vault, '.claude/commands/dup.md', defaultClaudeCommandContent('dup'));
      const again = await createClaudeProjectCommand(vault, 'dup');
      expect(again).toBeNull();

      const bad = await createClaudeProjectCommand(vault, '../escape');
      expect(bad).toBeNull();
    } finally {
      fs.rmSync(vault, { recursive: true, force: true });
    }
  });

  it('discovers global commands read-only', async () => {
    const home = tmpVault();
    try {
      writeFile(home, '.claude/commands/global-cmd.md', '# global\nA global command.\n');
      const cmds = await discoverClaudeGlobalCommands(home);
      expect(cmds.map((c) => c.name)).toEqual(['global-cmd']);
      expect(cmds[0].readonly).toBe(true);
      expect(cmds[0].scope).toBe('global');
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});

describe('Claude resource discovery — skills CRUD + global readonly', () => {
  it('creates, updates, and deletes project skills with frontmatter validation', async () => {
    const vault = tmpVault();
    try {
      const created = await createClaudeProjectSkill(vault, 'my-skill');
      expect(created).not.toBeNull();

      const bad = await updateClaudeProjectSkill(vault, 'my-skill', 'no frontmatter');
      expect(bad.ok).toBe(false);

      const updated = await updateClaudeProjectSkill(
        vault,
        'my-skill',
        '---\nname: my-skill\ndescription: updated\n---\n# my-skill\n',
      );
      expect(updated.ok).toBe(true);

      const deleted = await deleteClaudeProjectSkill(vault, 'my-skill');
      expect(deleted.ok).toBe(true);
      expect(await discoverClaudeProjectSkills(vault)).toEqual([]);
    } finally {
      fs.rmSync(vault, { recursive: true, force: true });
    }
  });

  it('discovers global skills read-only', async () => {
    const home = tmpVault();
    try {
      writeFile(home, '.claude/skills/global-skill/SKILL.md', defaultClaudeSkillContent('global-skill'));
      const skills = await discoverClaudeGlobalSkills(home);
      expect(skills.map((s) => s.name)).toEqual(['global-skill']);
      expect(skills[0].readonly).toBe(true);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('validates skill frontmatter', () => {
    expect(validateClaudeSkillContent('no frontmatter')).not.toBeNull();
    expect(validateClaudeSkillContent('---\nname: x\ndescription: y\n---\n# x')).toBeNull();
  });
});

describe('Claude resource discovery — agents CRUD + global readonly', () => {
  it('creates, updates, and deletes project agents', async () => {
    const vault = tmpVault();
    try {
      const created = await createClaudeProjectAgent(vault, 'reviewer');
      expect(created).not.toBeNull();

      const updated = await updateClaudeProjectAgent(vault, 'reviewer', '# reviewer\nUpdated agent prompt.\n');
      expect(updated.ok).toBe(true);

      const discovered = await discoverClaudeProjectAgents(vault);
      expect(discovered.map((a) => a.name)).toEqual(['reviewer']);
      expect(discovered[0].readonly).toBe(false);

      const deleted = await deleteClaudeProjectAgent(vault, 'reviewer');
      expect(deleted.ok).toBe(true);
    } finally {
      fs.rmSync(vault, { recursive: true, force: true });
    }
  });

  it('discovers global agents read-only', async () => {
    const home = tmpVault();
    try {
      writeFile(home, '.claude/agents/global-agent.md', defaultClaudeAgentContent('global-agent'));
      const agents = await discoverClaudeGlobalAgents(home);
      expect(agents.map((a) => a.name)).toEqual(['global-agent']);
      expect(agents[0].readonly).toBe(true);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('validates agent content', () => {
    expect(validateClaudeAgentContent('')).not.toBeNull();
    expect(validateClaudeAgentContent('# agent\nbody')).toBeNull();
  });

  it('validates command content', () => {
    expect(validateClaudeCommandContent('')).not.toBeNull();
    expect(validateClaudeCommandContent('# cmd\nbody')).toBeNull();
  });
});
