import { runMemoryAgent } from '../../../../src/core/memory/memoryAgentExtraction';
import { InMemoryMemoryFileSystem } from '../../../../src/core/memory/memoryFileSystem';
import { buildTopicManifest } from '../../../../src/core/memory/memoryManifest';

const topic = { name: 'answer-style', description: 'Answer style', type: 'feedback', body: '> Please answer with a conclusion first.\nTrigger: questions\nWhy: save time\nHow to apply: conclusion first' };

async function harness(replies: unknown[]) {
  const fs = new InMemoryMemoryFileSystem('/vault');
  const projectDir = '.opencodian/memory/projects/test';
  await fs.writeFile(`${projectDir}/answer-style.md`, '---\nname: answer-style\ndescription: Answer style\nmetadata:\n  type: feedback\n  source: extracted old-session\n---\nPrefer long answers.\n');
  const prompts: string[] = [];
  const run = (extra = {}) => runMemoryAgent({ fs, projectDir, indexContent: '- [Style](answer-style.md) — Answer style',
    manifest: [], transcript: '[user] From now on please keep answers concise because I read them on my phone.',
    source: 'extracted test-session', modelRef: '', invoker: { invoke: async ({ user }) => {
      prompts.push(user);
      return JSON.stringify(replies.shift());
    } }, ...extra });
  return { fs, projectDir, prompts, run };
}

it('reads then updates an existing topic and creates multiple topics without duplicating its pointer', async () => {
  const h = await harness([
    { actions: [{ tool: 'Read', path: 'answer-style.md' }], done: false },
    { actions: [
      { tool: 'Edit', path: 'answer-style.md', oldString: 'Prefer long answers.', newString: 'Prefer concise answers.\n> Please keep answers concise.' },
      { tool: 'Write', path: 'phone-reading.md', memory: topic },
      { tool: 'Write', path: 'phone-context.md', memory: { ...topic, type: 'user' } },
    ], done: true },
  ]);
  const result = await h.run();
  expect(result).toEqual({ writtenFiles: ['answer-style.md', 'phone-reading.md', 'phone-context.md'], modelCalls: 2 });
  expect(h.prompts[1]).toContain('Prefer long answers.');
  expect(await h.fs.readFile(`${h.projectDir}/answer-style.md`)).toContain('Prefer concise answers.');
  const manifest = await buildTopicManifest(h.fs, h.projectDir);
  expect(manifest.find(e => e.filename === 'answer-style.md')?.source).toBe('extracted test-session');
  expect(manifest.find(e => e.filename === 'answer-style.md')?.type).toBe('feedback');
  const index = await h.fs.readFile(`${h.projectDir}/MEMORY.md`);
  expect(index).toContain('phone-reading.md');
  expect(index).toContain('phone-context.md');
});

it('uses a JSON operation namespace distinct from backend-native tools', async () => {
  const h = await harness([{ actions: [{ operation: 'create', path: 'phone-reading.md', memory: topic }], done: true }]);
  await expect(h.run()).resolves.toMatchObject({ writtenFiles: ['phone-reading.md'], modelCalls: 1 });
});

it.each(['../outside.md', '/absolute.md', 'nested/file.md', 'MEMORY.md', '..\\outside.md'])(
  'rejects an out-of-scope model path %s before writes', async path => {
    const h = await harness([{ actions: [{ tool: 'Write', path, memory: topic }], done: true }]);
    await expect(h.run()).rejects.toThrow('memory-path-rejected');
    expect(await h.fs.listFiles(h.projectDir)).toEqual(['answer-style.md']);
  },
);

it('withholds secret-bearing reads and rejects secret-bearing writes', async () => {
  const h = await harness([
    { actions: [{ tool: 'Read', path: 'credential.md' }], done: false },
    { actions: [{ tool: 'Write', path: 'new.md', memory: { ...topic, body: 'st_12345678-1234-1234-1234-123456789abc' } }], done: true },
  ]);
  await h.fs.writeFile(`${h.projectDir}/credential.md`, 'st_12345678-1234-1234-1234-123456789abc');
  await expect(h.run()).rejects.toThrow('memory-content-rejected');
  expect(h.prompts[1]).toContain('withheld: secret guard');
  expect(h.prompts[1]).not.toContain('st_12345678');
  expect(await h.fs.readFile(`${h.projectDir}/new.md`)).toBeNull();
});

it('requires reading before an edit and preserves files when a later action is invalid', async () => {
  const h = await harness([{ actions: [
    { tool: 'Write', path: 'new.md', memory: topic },
    { tool: 'Edit', path: 'answer-style.md', oldString: 'long', newString: 'short' },
  ], done: true }]);
  await expect(h.run()).rejects.toThrow('memory-edit-requires-read');
  expect(await h.fs.readFile(`${h.projectDir}/new.md`)).toBeNull();
});

it('rejects stale writes after a concurrent update or settings change', async () => {
  const h = await harness([{ actions: [{ tool: 'Read', path: 'answer-style.md' }], done: false },
    { actions: [{ tool: 'Edit', path: 'answer-style.md', oldString: 'long', newString: 'short' }], done: true }]);
  let checks = 0;
  await expect(h.run({ isCurrent: () => ++checks < 3 })).rejects.toThrow('memory-settings-changed');
  expect(await h.fs.readFile(`${h.projectDir}/answer-style.md`)).toContain('long');
});

it('rejects a revision conflict instead of overwriting an external writer', async () => {
  const h = await harness([]);
  let calls = 0;
  await expect(h.run({ invoker: { invoke: async () => {
    if (++calls === 1) return JSON.stringify({ actions: [{ tool: 'Read', path: 'answer-style.md' }], done: false });
    await h.fs.writeFile(`${h.projectDir}/answer-style.md`, 'external writer won');
    return JSON.stringify({ actions: [{ tool: 'Edit', path: 'answer-style.md', oldString: 'long', newString: 'short' }], done: true });
  } } })).rejects.toThrow('memory-revision-conflict');
  expect(await h.fs.readFile(`${h.projectDir}/answer-style.md`)).toBe('external writer won');
});
