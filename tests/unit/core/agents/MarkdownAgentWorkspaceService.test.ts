import {
  type MarkdownAgentFs,
  MarkdownAgentWorkspaceService,
} from '../../../../src/core/agents/MarkdownAgentWorkspaceService';
import type { SurfaceAgentFile } from '../../../../src/core/agents/types';

class InMemoryMarkdownAgentFs implements MarkdownAgentFs {
  readonly files = new Map<string, string>();
  readonly modifiedTimes = new Map<string, number>();

  private readonly missingDirectories = new Set<string>();
  private readonly readFailures = new Map<string, Error>();
  private nextModifiedTime = 1;

  seedFile(path: string, content: string, modifiedTime?: number): void {
    this.files.set(path, content);
    this.modifiedTimes.set(path, modifiedTime ?? this.nextModifiedTime++);
  }

  markDirectoryMissing(dirPath: string): void {
    this.missingDirectories.add(dirPath);
  }

  failRead(path: string, error: Error): void {
    this.readFailures.set(path, error);
  }

  async listFiles(dirPath: string): Promise<string[]> {
    if (this.missingDirectories.has(dirPath)) {
      throw new Error(`Directory does not exist: ${dirPath}`);
    }

    const prefixes = [`${dirPath}/`, `/${dirPath}/`];
    return Array.from(this.files.keys())
      .filter((path) => prefixes.some((prefix) => path.startsWith(prefix)) && /\.md$/i.test(path))
      .sort();
  }

  async read(path: string): Promise<string> {
    const failure = this.readFailures.get(path);
    if (failure) {
      throw failure;
    }

    const content = this.files.get(path);
    if (content === undefined) {
      throw new Error(`File not found: ${path}`);
    }
    return content;
  }

  async write(path: string, content: string): Promise<void> {
    this.files.set(path, content);
    this.modifiedTimes.set(path, this.nextModifiedTime++);
  }

  async delete(path: string): Promise<void> {
    this.files.delete(path);
    this.modifiedTimes.delete(path);
  }

  async getModifiedTime(path: string): Promise<number | undefined> {
    return this.modifiedTimes.get(path);
  }
}

function getFileByPath(files: readonly SurfaceAgentFile[], path: string): SurfaceAgentFile {
  const file = files.find((entry) => entry.path === path);
  expect(file).toBeDefined();
  return file!;
}

function getFileByAgentId(files: readonly SurfaceAgentFile[], agentId: string): SurfaceAgentFile {
  const file = files.find((entry) => entry.agentId === agentId);
  expect(file).toBeDefined();
  return file!;
}

describe('MarkdownAgentWorkspaceService', () => {
  let fs: InMemoryMarkdownAgentFs;
  let service: MarkdownAgentWorkspaceService;

  beforeEach(() => {
    fs = new InMemoryMarkdownAgentFs();
    service = new MarkdownAgentWorkspaceService(fs);
  });

  describe('scan', () => {
    it('returns an empty result for an empty vault', async () => {
      const result = await service.scan();

      expect(result).toEqual({
        files: [],
        duplicateIds: [],
        parseErrors: [],
      });
    });

    it('finds files in all four roots', async () => {
      fs.seedFile('.opencode/agent/project-primary.md', 'Project primary body', 10);
      fs.seedFile('.opencode/agents/project-secondary.md', 'Project secondary body', 20);
      fs.seedFile('/agent/root-primary.md', 'Root primary body', 30);
      fs.seedFile('/agents/root-secondary.md', 'Root secondary body', 40);

      const result = await service.scan();

      expect(result.duplicateIds).toEqual([]);
      expect(result.parseErrors).toEqual([]);
      expect(result.files.map((file) => file.path)).toEqual([
        '.opencode/agent/project-primary.md',
        '.opencode/agents/project-secondary.md',
        '/agent/root-primary.md',
        '/agents/root-secondary.md',
      ]);
      expect(result.files.every((file) => file.parseStatus === 'ok')).toBe(true);
    });

    it('extracts simple and nested agent IDs from paths', async () => {
      fs.seedFile('.opencode/agent/researcher.md', 'Simple agent');
      fs.seedFile('/agents/team/researcher.md', 'Nested agent');

      const result = await service.scan();

      expect(getFileByPath(result.files, '.opencode/agent/researcher.md').agentId).toBe('researcher');
      expect(getFileByPath(result.files, '/agents/team/researcher.md').agentId).toBe('team/researcher');
    });

    it('strips the .md extension from agent IDs', async () => {
      fs.seedFile('/agent/builder.md', 'Build things');

      const result = await service.scan();

      expect(getFileByPath(result.files, '/agent/builder.md').agentId).toBe('builder');
    });

    it('preserves an empty agent ID when the filename is only .md', async () => {
      fs.seedFile('.opencode/agent/.md', 'Nameless agent');

      const result = await service.scan();

      expect(getFileByPath(result.files, '.opencode/agent/.md').agentId).toBe('');
      expect(getFileByPath(result.files, '.opencode/agent/.md').parseStatus).toBe('ok');
    });

    it('detects duplicate IDs across roots', async () => {
      fs.seedFile('.opencode/agent/researcher.md', 'Project version');
      fs.seedFile('/agents/researcher.md', 'Root version');

      const result = await service.scan();

      expect(result.duplicateIds).toEqual(['researcher']);
      expect(result.parseErrors).toEqual([]);
      expect(getFileByPath(result.files, '.opencode/agent/researcher.md').parseStatus).toBe('duplicate-id');
      expect(getFileByPath(result.files, '/agents/researcher.md').parseStatus).toBe('duplicate-id');
    });

    it('surfaces parse errors when frontmatter YAML is malformed', async () => {
      fs.seedFile(
        '.opencode/agent/broken.md',
        ['---', 'name: [broken', '---', 'Broken body'].join('\n'),
      );

      const result = await service.scan();

      expect(result.files).toEqual([]);
      expect(result.duplicateIds).toEqual([]);
      expect(result.parseErrors).toHaveLength(1);
      expect(result.parseErrors[0]?.path).toBe('.opencode/agent/broken.md');
      expect(result.parseErrors[0]?.error.length).toBeGreaterThan(0);
    });

    it('sets scope to project or root based on path', async () => {
      fs.seedFile('.opencode/agents/project-agent.md', 'Project agent');
      fs.seedFile('/agent/root-agent.md', 'Root agent');

      const result = await service.scan();

      expect(getFileByPath(result.files, '.opencode/agents/project-agent.md').scope).toBe('project');
      expect(getFileByPath(result.files, '/agent/root-agent.md').scope).toBe('root');
    });

    it('handles missing directories gracefully', async () => {
      fs.markDirectoryMissing('.opencode/agent');
      fs.markDirectoryMissing('.opencode/agents');
      fs.markDirectoryMissing('agent');
      fs.seedFile('/agents/existing.md', 'Still here');

      const result = await service.scan();

      expect(result.parseErrors).toEqual([]);
      expect(result.duplicateIds).toEqual([]);
      expect(result.files.map((file) => file.path)).toEqual(['/agents/existing.md']);
      expect(getFileByPath(result.files, '/agents/existing.md').parseStatus).toBe('ok');
    });

    it('parses basic frontmatter values and coerces booleans and numbers', async () => {
      fs.seedFile(
        '.opencode/agent/researcher.md',
        ['---', 'name: Researcher', 'active: true', 'retries: 3', '---', 'Investigate changes.'].join('\n'),
      );

      const result = await service.scan();
      const file = getFileByAgentId(result.files, 'researcher');

      expect(file.frontmatter).toEqual({
        name: 'Researcher',
        active: true,
        retries: 3,
      });
      expect(file.promptBody).toBe('Investigate changes.');
      expect(file.parseStatus).toBe('ok');
    });

    it('returns empty frontmatter and full body when content has no frontmatter', async () => {
      fs.seedFile('.opencode/agent/plain.md', 'Line one\n\nLine two');

      const result = await service.scan();
      const file = getFileByAgentId(result.files, 'plain');

      expect(file.frontmatter).toEqual({});
      expect(file.promptBody).toBe('Line one\n\nLine two');
      expect(file.parseStatus).toBe('ok');
    });
  });

  describe('markRuntimeSeen', () => {
    it('marks agents present in the runtime set', async () => {
      fs.seedFile('.opencode/agent/build.md', 'Build body');
      fs.seedFile('.opencode/agent/research.md', 'Research body');

      const result = await service.scan();
      const marked = service.markRuntimeSeen(result.files, new Set(['research']));

      expect(getFileByAgentId(marked, 'research').runtimeSeen).toBe(true);
    });

    it('leaves non-runtime agents as runtimeSeen false', async () => {
      fs.seedFile('.opencode/agent/build.md', 'Build body');

      const result = await service.scan();
      const marked = service.markRuntimeSeen(result.files, new Set(['research']));

      expect(getFileByAgentId(marked, 'build').runtimeSeen).toBe(false);
    });
  });

  describe('create', () => {
    it('writes a file to the correct path with frontmatter and body', async () => {
      const path = await service.create({
        agentId: 'researcher',
        root: '.opencode/agent',
        frontmatter: {
          mode: 'all',
          active: true,
          retries: 2,
        },
        promptBody: 'Investigate the current implementation.',
      });

      expect(path).toBe('.opencode/agent/researcher.md');
      expect(fs.files.get('.opencode/agent/researcher.md')).toBe([
        '---',
        'mode: all',
        'active: true',
        'retries: 2',
        '---',
        'Investigate the current implementation.',
      ].join('\n'));
    });

    it('writes only the body when no frontmatter is provided', async () => {
      const path = await service.create({
        agentId: 'plain',
        root: 'agents',
        frontmatter: {},
        promptBody: 'Just the body.',
      });

      expect(path).toBe('agents/plain.md');
      expect(fs.files.get('agents/plain.md')).toBe('Just the body.');
    });
  });

  describe('update', () => {
    it('overwrites an existing file', async () => {
      fs.seedFile('agent/researcher.md', 'Old content');

      await service.update('agent/researcher.md', {
        agentId: 'researcher',
        frontmatter: { mode: 'primary' },
        promptBody: 'Updated body',
      });

      expect(fs.files.get('agent/researcher.md')).toBe([
        '---',
        'mode: primary',
        '---',
        'Updated body',
      ].join('\n'));
    });
  });

  describe('deleteFile', () => {
    it('removes a file from the file system', async () => {
      fs.seedFile('agents/researcher.md', 'Delete me');

      await service.deleteFile('agents/researcher.md');

      expect(fs.files.has('agents/researcher.md')).toBe(false);
      expect(fs.modifiedTimes.has('agents/researcher.md')).toBe(false);
    });
  });
});
