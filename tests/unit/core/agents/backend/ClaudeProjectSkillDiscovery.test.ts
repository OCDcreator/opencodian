import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import {
  createClaudeProjectSkill,
  discoverClaudeProjectSkills,
} from '../../../../../src/core/agents/backend/ClaudeProjectSkillDiscovery';

describe('ClaudeProjectSkillDiscovery', () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'opencodian-claude-skills-'));
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  async function writeSkill(name: string, content: string): Promise<void> {
    const skillDir = path.join(tempRoot, '.claude', 'skills', name);
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), content, 'utf-8');
  }

  it('returns an empty array when vaultPath is null', async () => {
    await expect(discoverClaudeProjectSkills(null)).resolves.toEqual([]);
  });

  it('returns an empty array when vaultPath is an empty string', async () => {
    await expect(discoverClaudeProjectSkills('')).resolves.toEqual([]);
  });

  it("returns an empty array when .claude/skills doesn't exist", async () => {
    await expect(discoverClaudeProjectSkills(tempRoot)).resolves.toEqual([]);
  });

  it('returns an empty array when .claude/skills has no subdirectories', async () => {
    const skillsDir = path.join(tempRoot, '.claude', 'skills');
    await fs.mkdir(skillsDir, { recursive: true });
    await fs.writeFile(path.join(skillsDir, 'README.md'), '# Readme', 'utf-8');
    await fs.writeFile(path.join(skillsDir, 'SKILL.md'), '# Root Skill', 'utf-8');

    await expect(discoverClaudeProjectSkills(tempRoot)).resolves.toEqual([]);
  });

  it('discovers a single skill with SKILL.md and extracts description from first heading', async () => {
    await writeSkill('write-tests', '---\ntitle: ignored\n---\n\n# Write Tests\n\nTest-writing skill.');

    await expect(discoverClaudeProjectSkills(tempRoot)).resolves.toEqual([
      {
        name: 'write-tests',
        description: 'Write Tests',
        skillMdPath: path.join(tempRoot, '.claude', 'skills', 'write-tests', 'SKILL.md'),
        relativePath: path.join('.claude', 'skills', 'write-tests'),
      },
    ]);
  });

  it('discovers multiple skills sorted alphabetically by name', async () => {
    await writeSkill('zeta', '# zeta skill');
    await writeSkill('alpha', '# alpha skill');
    await writeSkill('middle', '# middle skill');

    const skills = await discoverClaudeProjectSkills(tempRoot);

    expect(skills.map((skill) => skill.name)).toEqual(['alpha', 'middle', 'zeta']);
    expect(skills.map((skill) => skill.description)).toEqual([
      'alpha skill',
      'middle skill',
      'zeta skill',
    ]);
  });

  it('skips skill folders without SKILL.md', async () => {
    await fs.mkdir(path.join(tempRoot, '.claude', 'skills', 'missing-skill-md'), { recursive: true });
    await writeSkill('valid-skill', '# Valid Skill');

    await expect(discoverClaudeProjectSkills(tempRoot)).resolves.toEqual([
      {
        name: 'valid-skill',
        description: 'Valid Skill',
        skillMdPath: path.join(tempRoot, '.claude', 'skills', 'valid-skill', 'SKILL.md'),
        relativePath: path.join('.claude', 'skills', 'valid-skill'),
      },
    ]);
  });

  it('skips hidden directories', async () => {
    await writeSkill('.hidden', '# Hidden Skill');
    await writeSkill('visible', '# Visible Skill');

    const skills = await discoverClaudeProjectSkills(tempRoot);

    expect(skills.map((skill) => skill.name)).toEqual(['visible']);
  });

  it('extracts description from first content paragraph when no heading is present', async () => {
    await writeSkill('paragraph-skill', '---\nname: paragraph-skill\n---\n\nFirst useful paragraph.\n\nSecond paragraph.');

    const [skill] = await discoverClaudeProjectSkills(tempRoot);

    expect(skill.description).toBe('First useful paragraph.');
  });

  it('returns an empty description when SKILL.md has only frontmatter', async () => {
    await writeSkill('frontmatter-only', '---\nname: frontmatter-only\ndescription: ignored\n---\n');

    const [skill] = await discoverClaudeProjectSkills(tempRoot);

    expect(skill.description).toBe('');
  });

  it('truncates long descriptions to 200 chars with ellipsis', async () => {
    await writeSkill('long-description', 'a'.repeat(201));

    const [skill] = await discoverClaudeProjectSkills(tempRoot);

    expect(skill.description).toBe(`${'a'.repeat(197)}...`);
    expect(skill.description).toHaveLength(200);
  });

  it('creates .claude/skills/<name>/SKILL.md with valid frontmatter default content', async () => {
    const skillMdPath = await createClaudeProjectSkill(tempRoot, 'draft-notes');

    expect(skillMdPath).toBe(path.join(tempRoot, '.claude', 'skills', 'draft-notes', 'SKILL.md'));
    const content = await fs.readFile(skillMdPath ?? '', 'utf-8');
    expect(content).toContain('---');
    expect(content).toContain('name: draft-notes');
    expect(content).toContain('description:');
    expect(content).toContain('# draft-notes');
  });

  it('creates .claude/skills/<name>/SKILL.md with custom content when provided', async () => {
    const skillMdPath = await createClaudeProjectSkill(tempRoot, 'summarize', '# Custom Skill\n\nDo this.');

    expect(skillMdPath).toBe(path.join(tempRoot, '.claude', 'skills', 'summarize', 'SKILL.md'));
    await expect(fs.readFile(skillMdPath ?? '', 'utf-8')).resolves.toBe('# Custom Skill\n\nDo this.');
  });

  it('returns null when creating a skill with null vaultPath', async () => {
    await expect(createClaudeProjectSkill(null, 'draft-notes')).resolves.toBeNull();
  });

  it.each(['', 'nested/skill', 'nested\\skill', '.hidden'])(
    'returns null when creating a skill with invalid name %p',
    async (skillName) => {
      await expect(createClaudeProjectSkill(tempRoot, skillName)).resolves.toBeNull();
    },
  );
});
