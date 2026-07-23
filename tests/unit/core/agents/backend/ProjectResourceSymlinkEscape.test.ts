/**
 * Symlink-escape regression tests for project resource writes.
 *
 * Verifies that create/update/delete refuse to follow a symlink that escapes
 * the real vault root into a global directory, and that an external sentinel
 * file is never created/modified/deleted. Covers both Claude and Codex
 * discovery owners, which share the single secure-write chokepoint.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  createClaudeProjectSkill,
  deleteClaudeProjectAgent,
  updateClaudeProjectCommand,
} from '../../../../../src/core/agents/backend';
import {
  createCodexProjectAgent,
  createCodexProjectSkill,
  deleteCodexProjectAgent,
  deleteCodexProjectSkill,
  updateCodexProjectAgent,
} from '../../../../../src/core/agents/backend';

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Create a symlink so <vault>/<relDir> points at <external>/<leaf>. */
function plantEscapeSymlink(vault: string, external: string, relDir: string, leaf: string): void {
  const linkPath = path.join(vault, relDir);
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  fs.mkdirSync(external, { recursive: true });
  // symlink target = external/leaf
  fs.symlinkSync(path.join(external, leaf), linkPath);
}

describe('symlink-escape protection — Claude project resources', () => {
  let vault: string;
  let external: string;

  beforeEach(() => {
    vault = tmpDir('opencodian-symlink-claude-vault-');
    external = tmpDir('opencodian-symlink-claude-external-');
  });
  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
    fs.rmSync(external, { recursive: true, force: true });
  });

  it('create refuses a skill whose folder is a symlink escaping to global', async () => {
    // <vault>/.claude/skills/escaped -> <external>/escaped
    plantEscapeSymlink(vault, external, path.join('.claude', 'skills', 'escaped'), 'escaped');
    const sentinel = path.join(external, 'escaped', 'SKILL.md');
    fs.mkdirSync(path.dirname(sentinel), { recursive: true });

    const result = await createClaudeProjectSkill(vault, 'escaped');
    expect(result).toBeNull();
    // External sentinel must NOT be created.
    expect(fs.existsSync(sentinel)).toBe(false);
  });

  it('update refuses to write through a symlinked command file', async () => {
    // <vault>/.claude/commands/hijack.md -> <external>/hijack.md
    plantEscapeSymlink(vault, external, path.join('.claude', 'commands', 'hijack.md'), 'hijack.md');
    const sentinel = path.join(external, 'hijack.md');
    fs.writeFileSync(sentinel, 'original', 'utf-8');

    const result = await updateClaudeProjectCommand(vault, 'hijack', '# rewritten\nbody\n');
    expect(result.ok).toBe(false);
    expect(fs.readFileSync(sentinel, 'utf-8')).toBe('original');
  });

  it('delete refuses to delete an agent that is a symlink to external', async () => {
    // <vault>/.claude/agents/pwn.md -> <external>/pwn.md
    plantEscapeSymlink(vault, external, path.join('.claude', 'agents', 'pwn.md'), 'pwn.md');
    const sentinel = path.join(external, 'pwn.md');
    fs.writeFileSync(sentinel, 'keep-me', 'utf-8');

    const result = await deleteClaudeProjectAgent(vault, 'pwn');
    expect(result.ok).toBe(false);
    expect(fs.existsSync(sentinel)).toBe(true);
    expect(fs.readFileSync(sentinel, 'utf-8')).toBe('keep-me');
  });
});

describe('symlink-escape protection — Codex project resources', () => {
  let vault: string;
  let external: string;

  beforeEach(() => {
    vault = tmpDir('opencodian-symlink-codex-vault-');
    external = tmpDir('opencodian-symlink-codex-external-');
  });
  afterEach(() => {
    fs.rmSync(vault, { recursive: true, force: true });
    fs.rmSync(external, { recursive: true, force: true });
  });

  it('create refuses a skill whose parent skills dir is a symlink escaping', async () => {
    // <vault>/.agents/skills -> <external>/skills (whole dir symlinked out)
    plantEscapeSymlink(vault, external, path.join('.agents', 'skills'), 'skills');
    const sentinel = path.join(external, 'skills', 'evil', 'SKILL.md');

    const result = await createCodexProjectSkill(vault, 'evil');
    expect(result.ok).toBe(false);
    expect(fs.existsSync(sentinel)).toBe(false);
  });

  it('update refuses to write a Codex agent through a symlinked file', async () => {
    // <vault>/.codex/agents/hijack.toml -> <external>/hijack.toml
    plantEscapeSymlink(vault, external, path.join('.codex', 'agents', 'hijack.toml'), 'hijack.toml');
    const sentinel = path.join(external, 'hijack.toml');
    fs.writeFileSync(sentinel, 'name = "hijack"\ndescription = "orig"\n', 'utf-8');

    const result = await updateCodexProjectAgent(vault, 'hijack', 'name = "hijack"\ndescription = "pwned"\n');
    expect(result.ok).toBe(false);
    expect(fs.readFileSync(sentinel, 'utf-8')).toContain('orig');
  });

  it('delete refuses to delete a Codex skill folder that is a symlink to external', async () => {
    // <vault>/.agents/skills/pwn -> <external>/pwn
    plantEscapeSymlink(vault, external, path.join('.agents', 'skills', 'pwn'), 'pwn');
    const sentinel = path.join(external, 'pwn', 'SKILL.md');
    fs.mkdirSync(path.dirname(sentinel), { recursive: true });
    fs.writeFileSync(sentinel, 'keep-me', 'utf-8');

    const result = await deleteCodexProjectSkill(vault, 'pwn');
    expect(result.ok).toBe(false);
    expect(fs.existsSync(sentinel)).toBe(true);
    expect(fs.readFileSync(sentinel, 'utf-8')).toBe('keep-me');
  });

  it('create + update + delete of a Codex agent still work for a legit (non-symlink) target', async () => {
    const created = await createCodexProjectAgent(vault, 'legit');
    expect(created.ok).toBe(true);
    const updated = await updateCodexProjectAgent(vault, 'legit', 'name = "legit"\ndescription = "ok"\n');
    expect(updated.ok).toBe(true);
    const deleted = await deleteCodexProjectAgent(vault, 'legit');
    expect(deleted.ok).toBe(true);
  });
});
