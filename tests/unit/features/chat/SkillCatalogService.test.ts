import {
  SkillCatalogService,
  type SkillCatalogServiceHost,
  type SkillInfo,
} from '../../../../src/features/chat/services/SkillCatalogService';

function createHost(
  overrides: Partial<SkillCatalogServiceHost> = {},
): jest.Mocked<SkillCatalogServiceHost> {
  return {
    fetchSkills: jest.fn().mockResolvedValue([]),
    getCacheTtl: jest.fn(() => 30_000),
    ...overrides,
  } as jest.Mocked<SkillCatalogServiceHost>;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return {
    promise,
    reject,
    resolve,
  };
}

describe('SkillCatalogService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns empty array when no skills are available', async () => {
    const host = createHost();
    const service = new SkillCatalogService(host);

    await expect(service.getAll()).resolves.toEqual([]);
  });

  it('caches skills within TTL', async () => {
    const skills: SkillInfo[] = [
      {
        name: 'git-release',
        description: 'Create releases',
        location: '.opencode/skills/git-release/SKILL.md',
        content: '---\nname: git-release\n---\nBody text',
      },
    ];
    const host = createHost({
      fetchSkills: jest.fn().mockResolvedValue(skills),
    });
    const service = new SkillCatalogService(host);

    const first = await service.getAll();
    const second = await service.getAll();

    expect(first).toEqual(skills);
    expect(second).toBe(first);
    expect(host.fetchSkills).toHaveBeenCalledTimes(1);
  });

  it('refreshes cache after TTL expires', async () => {
    jest.useFakeTimers();
    const skills: SkillInfo[] = [
      { name: 'test', description: 'Test skill', location: 'builtin', content: '' },
    ];
    const host = createHost({
      fetchSkills: jest.fn().mockResolvedValue(skills),
      getCacheTtl: jest.fn(() => 1_000),
    });
    const service = new SkillCatalogService(host);

    await service.getAll();
    expect(host.fetchSkills).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1_001);

    await service.getAll();
    expect(host.fetchSkills).toHaveBeenCalledTimes(2);
  });

  it('classifies skills by source location', async () => {
    const skills: SkillInfo[] = [
      { name: 'a', description: '', location: '.opencode/skills/a/SKILL.md', content: '' },
      { name: 'b', description: '', location: '/home/.config/opencode/skills/b/SKILL.md', content: '' },
      { name: 'c', description: '', location: '.claude/skills/c/SKILL.md', content: '' },
      { name: 'd', description: '', location: '.agents/skills/d/SKILL.md', content: '' },
      { name: 'e', description: '', location: 'builtin', content: '' },
      {
        name: 'f',
        description: '',
        location: '/Users/me/.cache/opencode/packages/superpowers/node_modules/superpowers/skills/f/SKILL.md',
        content: '',
      },
    ];
    const host = createHost({
      fetchSkills: jest.fn().mockResolvedValue(skills),
    });
    const service = new SkillCatalogService(host);

    const groups = await service.groupBySource();

    expect(groups.project).toEqual([skills[0]]);
    expect(groups.global).toEqual([skills[1]]);
    expect(groups.claude).toEqual([skills[2]]);
    expect(groups.agents).toEqual([skills[3]]);
    expect(groups.builtin).toEqual([skills[4]]);
    expect(groups.plugin).toEqual([skills[5]]);
  });

  it('forces refresh when refresh() is called', async () => {
    const host = createHost({
      fetchSkills: jest.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { name: 'new', location: 'builtin', content: '' },
        ]),
    });
    const service = new SkillCatalogService(host);

    await service.getAll();
    await expect(service.refresh()).resolves.toEqual([
      { name: 'new', location: 'builtin', content: '' },
    ]);
    expect(host.fetchSkills).toHaveBeenCalledTimes(2);
  });

  it('returns skill by name', async () => {
    const skills: SkillInfo[] = [
      { name: 'git-release', description: 'Releases', location: 'builtin', content: 'body' },
      { name: 'pr-review', description: 'Reviews', location: 'builtin', content: 'body2' },
    ];
    const host = createHost({
      fetchSkills: jest.fn().mockResolvedValue(skills),
    });
    const service = new SkillCatalogService(host);

    await expect(service.getByName('git-release')).resolves.toBe(skills[0]);
  });

  it('deduplicates concurrent loads', async () => {
    const deferredSkills = createDeferred<SkillInfo[]>();
    const skills: SkillInfo[] = [
      { name: 'frontend-design', location: 'builtin', content: '' },
    ];
    const host = createHost({
      fetchSkills: jest.fn(() => deferredSkills.promise),
    });
    const service = new SkillCatalogService(host);

    const first = service.getAll();
    const second = service.getAll();

    expect(host.fetchSkills).toHaveBeenCalledTimes(1);

    deferredSkills.resolve(skills);

    await expect(first).resolves.toBe(skills);
    await expect(second).resolves.toBe(skills);
    expect(host.fetchSkills).toHaveBeenCalledTimes(1);
  });
});
