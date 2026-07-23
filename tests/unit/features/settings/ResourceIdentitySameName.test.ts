/**
 * Same-name project+global resource identity regression tests.
 *
 * Validates the fix for the readonly-view bug: clicking a GLOBAL readonly item
 * must show the GLOBAL resource's own content, not a same-name PROJECT
 * resource's content. The editors now load by the item's EXACT path (not by a
 * name-based `[...project, ...global].find(name)` lookup). These tests assert
 * the underlying contract the editors rely on: each discovered item carries a
 * scope-distinct path, and reading by that exact path returns the correct
 * scope's content.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  discoverClaudeGlobalAgents,
  discoverClaudeGlobalCommands,
  discoverClaudeGlobalSkills,
  discoverClaudeProjectAgents,
  discoverClaudeProjectSkills,
  readClaudeAgentContent,
  readClaudeCommandContent,
  readClaudeSkillContent,
} from '../../../../src/core/agents/backend';
import {
  discoverCodexGlobalAgents,
  discoverCodexGlobalSkills,
  discoverCodexProjectAgents,
  readCodexAgentContent,
  readCodexSkillContent,
} from '../../../../src/core/agents/backend';

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('same-name project+global identity — Claude', () => {
  let vault: string;
  let home: string;

  beforeEach(() => {
    vault = tmpDir('opencodian-id-claude-vault-');
    home = tmpDir('opencodian-id-claude-home-');
  });
  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('skill: global readonly item resolves to its own global content, not the project copy', async () => {
    const writeSkill = (root: string, scope: string) => {
      const dir = path.join(root, '.claude', 'skills', 'shared');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: shared\ndescription: ${scope}\n---\n# ${scope}\n`, 'utf-8');
    };
    writeSkill(vault, 'project-copy');
    writeSkill(home, 'global-original');

    const project = await discoverClaudeProjectSkills(vault);
    const global = await discoverClaudeGlobalSkills(home);

    // Both discovered, same name, distinct paths + scope.
    expect(project[0].name).toBe('shared');
    expect(global[0].name).toBe('shared');
    expect(project[0].skillMdPath).not.toBe(global[0].skillMdPath);
    expect(global[0].readonly).toBe(true);
    expect(global[0].scope).toBe('global');

    // Reading by the GLOBAL item's exact path must return global content.
    const globalContent = await readClaudeSkillContent(global[0].skillMdPath);
    expect(globalContent).toContain('global-original');
    expect(globalContent).not.toContain('project-copy');
  });

  it('command: global readonly item resolves to its own global content', async () => {
    const writeCmd = (root: string, body: string) => {
      const dir = path.join(root, '.claude', 'commands');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'shared.md'), body, 'utf-8');
    };
    writeCmd(vault, '# project command\n');
    writeCmd(home, '# global command\n');

    const global = (await discoverClaudeGlobalCommands(home))[0];
    expect(global.readonly).toBe(true);
    const content = await readClaudeCommandContent(global.filePath);
    expect(content).toContain('global command');
    expect(content).not.toContain('project command');
  });

  it('agent: global readonly item resolves to its own global content', async () => {
    const writeAgent = (root: string, body: string) => {
      const dir = path.join(root, '.claude', 'agents');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'shared.md'), body, 'utf-8');
    };
    writeAgent(vault, 'project agent body');
    writeAgent(home, 'global agent body');

    const project = await discoverClaudeProjectAgents(vault);
    const global = await discoverClaudeGlobalAgents(home);
    expect(project[0].filePath).not.toBe(global[0].filePath);
    const content = await readClaudeAgentContent(global[0].filePath);
    expect(content).toContain('global agent body');
    expect(content).not.toContain('project agent body');
  });
});

describe('same-name project+global identity — Codex', () => {
  let vault: string;
  let home: string;

  beforeEach(() => {
    vault = tmpDir('opencodian-id-codex-vault-');
    home = tmpDir('opencodian-id-codex-home-');
  });
  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('skill: global readonly item resolves to its own global content', async () => {
    const writeSkill = (root: string, body: string) => {
      const dir = path.join(root, '.agents', 'skills', 'shared');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'SKILL.md'), body, 'utf-8');
    };
    writeSkill(vault, '---\nname: shared\ndescription: project\n---\n# project\n');
    writeSkill(home, '---\nname: shared\ndescription: global\n---\n# global\n');

    const global = (await discoverCodexGlobalSkills(home))[0];
    expect(global.readonly).toBe(true);
    expect(global.scope).toBe('global');
    const content = await readCodexSkillContent(global.skillMdPath);
    expect(content).toContain('global');
    expect(content).not.toContain('project');
  });

  it('agent: global readonly item resolves to its own global content', async () => {
    const writeAgent = (root: string, body: string) => {
      const dir = path.join(root, '.codex', 'agents');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'shared.toml'), body, 'utf-8');
    };
    writeAgent(vault, 'name = "shared"\ndescription = "project"\n');
    writeAgent(home, 'name = "shared"\ndescription = "global"\n');

    const project = await discoverCodexProjectAgents(vault);
    const global = await discoverCodexGlobalAgents(home);
    expect(project[0].agentTomlPath).not.toBe(global[0].agentTomlPath);
    const content = await readCodexAgentContent(global[0].agentTomlPath);
    expect(content).toContain('global');
    expect(content).not.toContain('project');
  });
});
