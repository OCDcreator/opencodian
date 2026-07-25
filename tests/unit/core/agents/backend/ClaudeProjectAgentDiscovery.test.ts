import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import {
  createClaudeProjectAgent,
  discoverClaudeAgentResources,
  discoverClaudeProjectAgents,
} from '../../../../../src/core/agents/backend/ClaudeProjectAgentDiscovery';

describe('ClaudeProjectAgentDiscovery', () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'opencodian-claude-agents-'));
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  async function writeAgent(fileName: string, content: string): Promise<void> {
    const agentsDir = path.join(tempRoot, '.claude', 'agents');
    await fs.mkdir(agentsDir, { recursive: true });
    await fs.writeFile(path.join(agentsDir, fileName), content, 'utf-8');
  }

  it.each([null, undefined, ''])(
    'returns an empty array when vaultPath is %p',
    async (vaultPath) => {
      await expect(discoverClaudeProjectAgents(vaultPath)).resolves.toEqual([]);
    },
  );

  it("returns an empty array when .claude/agents doesn't exist", async () => {
    await expect(discoverClaudeProjectAgents(tempRoot)).resolves.toEqual([]);
  });

  it('discovers agent files with descriptions', async () => {
    await writeAgent('code-reviewer.md', '---\nname: ignored\n---\n\n# Code Reviewer\n\nReview code.');
    await writeAgent('summarizer.md', '---\nname: summarizer\n---\n\nSummarize current context.');

    await expect(discoverClaudeProjectAgents(tempRoot)).resolves.toEqual([
      {
        name: 'code-reviewer',
        description: 'Code Reviewer',
        filePath: path.join(tempRoot, '.claude', 'agents', 'code-reviewer.md'),
        relativePath: path.join('.claude', 'agents', 'code-reviewer.md'),
        readonly: false,
        scope: 'project',
      },
      {
        name: 'summarizer',
        description: 'Summarize current context.',
        filePath: path.join(tempRoot, '.claude', 'agents', 'summarizer.md'),
        relativePath: path.join('.claude', 'agents', 'summarizer.md'),
        readonly: false,
        scope: 'project',
      },
    ]);
  });

  it('skips non-markdown files and hidden markdown files', async () => {
    await writeAgent('visible.md', '# Visible Agent');
    await writeAgent('notes.txt', '# Not Markdown');
    await writeAgent('.hidden.md', '# Hidden Agent');

    const agents = await discoverClaudeProjectAgents(tempRoot);

    expect(agents.map((agent) => agent.name)).toEqual(['visible']);
  });

  it('rejects an agent leaf symlink without exposing root-external content', async () => {
    const outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'opencodian-claude-agent-outside-'));
    try {
      const outsideFile = path.join(outsideRoot, 'escaped.md');
      await fs.writeFile(outsideFile, '# ROOT-EXTERNAL AGENT BYTES\n', 'utf-8');
      const agentsDir = path.join(tempRoot, '.claude', 'agents');
      await fs.mkdir(agentsDir, { recursive: true });
      await fs.symlink(outsideFile, path.join(agentsDir, 'escaped.md'));

      await expect(discoverClaudeProjectAgents(tempRoot)).resolves.toEqual([]);
      await expect(discoverClaudeAgentResources({ scope: 'project', basePath: tempRoot })).resolves.toEqual([]);
    } finally {
      await fs.rm(outsideRoot, { recursive: true, force: true });
    }
  });

  it('rejects a fixed agents-root symlink without exposing root-external content', async () => {
    const outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'opencodian-claude-agent-root-outside-'));
    try {
      await fs.writeFile(path.join(outsideRoot, 'escaped.md'), '# ROOT-EXTERNAL AGENT ROOT BYTES\n', 'utf-8');
      await fs.mkdir(path.join(tempRoot, '.claude'), { recursive: true });
      await fs.symlink(outsideRoot, path.join(tempRoot, '.claude', 'agents'));

      await expect(discoverClaudeProjectAgents(tempRoot)).resolves.toEqual([]);
      await expect(discoverClaudeAgentResources({ scope: 'project', basePath: tempRoot })).resolves.toEqual([]);
    } finally {
      await fs.rm(outsideRoot, { recursive: true, force: true });
    }
  });

  it('creates .claude/agents/<name>.md with safe default frontmatter (no model placeholder)', async () => {
    const filePath = await createClaudeProjectAgent(tempRoot, 'code-reviewer');

    expect(filePath).toBe(path.join(tempRoot, '.claude', 'agents', 'code-reviewer.md'));
    const written = await fs.readFile(filePath ?? '', 'utf-8');
    // Default template must NOT include a model field — placeholder values like
    // "optional-model-name" cause Claude runtime API 400 errors on first agent call.
    expect(written).not.toContain('model:');
    expect(written).toBe(
      '---\nname: code-reviewer\ndescription: Describe what this agent does.\n---\n\n# code-reviewer\n\nSystem prompt / instructions for this agent.\n',
    );
  });

  it.each(['', 'nested/agent', 'nested\\agent', '.hidden', 'agent.name'])(
    'returns null when creating an agent with invalid name %p',
    async (agentName) => {
      await expect(createClaudeProjectAgent(tempRoot, agentName)).resolves.toBeNull();
    },
  );

  it('returns null when creating an agent with null vaultPath', async () => {
    await expect(createClaudeProjectAgent(null, 'code-reviewer')).resolves.toBeNull();
  });
});
