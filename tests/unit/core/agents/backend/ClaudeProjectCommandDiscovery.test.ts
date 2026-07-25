import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import {
  createClaudeProjectCommand,
  discoverClaudeCommandResources,
  discoverClaudeProjectCommands,
} from '../../../../../src/core/agents/backend/ClaudeProjectCommandDiscovery';

describe('ClaudeProjectCommandDiscovery', () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'opencodian-claude-commands-'));
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  async function writeCommand(fileName: string, content: string): Promise<void> {
    const commandsDir = path.join(tempRoot, '.claude', 'commands');
    await fs.mkdir(commandsDir, { recursive: true });
    await fs.writeFile(path.join(commandsDir, fileName), content, 'utf-8');
  }

  it.each([null, undefined, ''])(
    'returns an empty array when vaultPath is %p',
    async (vaultPath) => {
      await expect(discoverClaudeProjectCommands(vaultPath)).resolves.toEqual([]);
    },
  );

  it("returns an empty array when .claude/commands doesn't exist", async () => {
    await expect(discoverClaudeProjectCommands(tempRoot)).resolves.toEqual([]);
  });

  it('discovers markdown files and extracts command names from filenames', async () => {
    await writeCommand('write-summary.md', '# Write Summary\n\nSummarize the current note.');

    await expect(discoverClaudeProjectCommands(tempRoot)).resolves.toEqual([
      {
        name: 'write-summary',
        description: 'Write Summary',
        filePath: path.join(tempRoot, '.claude', 'commands', 'write-summary.md'),
        relativePath: path.join('.claude', 'commands', 'write-summary.md'),
        readonly: false,
        scope: 'project',
      },
    ]);
  });

  it('skips non-markdown files and hidden markdown files', async () => {
    await writeCommand('visible.md', '# Visible Command');
    await writeCommand('notes.txt', '# Not Markdown');
    await writeCommand('.hidden.md', '# Hidden Command');

    const commands = await discoverClaudeProjectCommands(tempRoot);

    expect(commands.map((command) => command.name)).toEqual(['visible']);
  });

  it('extracts description from first heading or first paragraph', async () => {
    await writeCommand('heading.md', '---\ntitle: ignored\n---\n\n## Heading Description\n\nBody.');
    await writeCommand('paragraph.md', '---\nname: paragraph\n---\n\nFirst paragraph description.\n\nSecond paragraph.');

    const commands = await discoverClaudeProjectCommands(tempRoot);

    expect(commands.map((command) => [command.name, command.description])).toEqual([
      ['heading', 'Heading Description'],
      ['paragraph', 'First paragraph description.'],
    ]);
  });

  it('sorts results alphabetically by name', async () => {
    await writeCommand('zeta.md', '# Zeta');
    await writeCommand('alpha.md', '# Alpha');
    await writeCommand('middle.md', '# Middle');

    const commands = await discoverClaudeProjectCommands(tempRoot);

    expect(commands.map((command) => command.name)).toEqual(['alpha', 'middle', 'zeta']);
  });

  it('rejects a command leaf symlink without exposing root-external content', async () => {
    const outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'opencodian-claude-command-outside-'));
    try {
      const outsideFile = path.join(outsideRoot, 'escaped.md');
      await fs.writeFile(outsideFile, '# ROOT-EXTERNAL COMMAND BYTES\n', 'utf-8');
      const commandsDir = path.join(tempRoot, '.claude', 'commands');
      await fs.mkdir(commandsDir, { recursive: true });
      await fs.symlink(outsideFile, path.join(commandsDir, 'escaped.md'));

      await expect(discoverClaudeProjectCommands(tempRoot)).resolves.toEqual([]);
      await expect(discoverClaudeCommandResources({ scope: 'project', basePath: tempRoot })).resolves.toEqual([]);
    } finally {
      await fs.rm(outsideRoot, { recursive: true, force: true });
    }
  });

  it('rejects a fixed commands-root symlink without exposing root-external content', async () => {
    const outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'opencodian-claude-command-root-outside-'));
    try {
      await fs.writeFile(path.join(outsideRoot, 'escaped.md'), '# ROOT-EXTERNAL COMMAND ROOT BYTES\n', 'utf-8');
      await fs.mkdir(path.join(tempRoot, '.claude'), { recursive: true });
      await fs.symlink(outsideRoot, path.join(tempRoot, '.claude', 'commands'));

      await expect(discoverClaudeProjectCommands(tempRoot)).resolves.toEqual([]);
      await expect(discoverClaudeCommandResources({ scope: 'project', basePath: tempRoot })).resolves.toEqual([]);
    } finally {
      await fs.rm(outsideRoot, { recursive: true, force: true });
    }
  });

  it('creates .claude/commands/<name>.md with default content and returns absolute path', async () => {
    const filePath = await createClaudeProjectCommand(tempRoot, 'draft-reply');

    expect(filePath).toBe(path.join(tempRoot, '.claude', 'commands', 'draft-reply.md'));
    await expect(fs.readFile(filePath ?? '', 'utf-8')).resolves.toBe(
      '# draft-reply\n\nDescription of the draft-reply command.\n',
    );
  });

  it('creates .claude/commands/<name>.md with custom content when provided', async () => {
    const filePath = await createClaudeProjectCommand(tempRoot, 'review', '# Custom Command\n\nReview this.');

    expect(filePath).toBe(path.join(tempRoot, '.claude', 'commands', 'review.md'));
    await expect(fs.readFile(filePath ?? '', 'utf-8')).resolves.toBe('# Custom Command\n\nReview this.');
  });

  it.each(['', 'nested/command', 'nested\\command', '.hidden'])(
    'returns null when creating a command with invalid name %p',
    async (commandName) => {
      await expect(createClaudeProjectCommand(tempRoot, commandName)).resolves.toBeNull();
    },
  );

  it('returns null when creating a command with null vaultPath', async () => {
    await expect(createClaudeProjectCommand(null, 'draft-reply')).resolves.toBeNull();
  });
});
