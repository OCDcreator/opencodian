/**
 * ContextGroupAttachPlan (R-B2): the shared, deterministic rules for
 * one-click group attach — order preservation, cap with explicit omitted
 * count, missing-entry skip, and dedupe against already-attached entries.
 */

import {
  planContextGroupAttach,
  summarizeContextGroup,
} from '../../../src/shared/contextGroupPlan';

describe('planContextGroupAttach', () => {
  it('attaches every resolvable entry in group order when there is room', () => {
    const plan = planContextGroupAttach({
      entries: [
        { path: 'a.md' },
        { path: 'folder' },
        { path: 'b.md' },
      ],
      resolve: (path) => ({ resolved: path }),
      cap: Number.POSITIVE_INFINITY,
    });
    expect(plan.toAttach.map((entry) => entry.path)).toEqual(['a.md', 'folder', 'b.md']);
    expect(plan.omittedCount).toBe(0);
    expect(plan.missingPaths).toEqual([]);
  });

  it('takes entries in order up to the cap and counts the rest as omitted', () => {
    const plan = planContextGroupAttach({
      entries: [
        { path: 'a.md' },
        { path: 'gone.md' },
        { path: 'b.md' },
        { path: 'c.md' },
      ],
      resolve: (path) => (path === 'gone.md' ? null : { resolved: path }),
      cap: 2,
    });
    // Missing entries do not burn attach slots (the cap bounds attached
    // context), and entries past the cap are omitted without being resolved.
    expect(plan.toAttach.map((entry) => entry.path)).toEqual(['a.md', 'b.md']);
    expect(plan.omittedCount).toBe(1);
    expect(plan.missingPaths).toEqual(['gone.md']);
  });

  it('skips and reports entries that do not resolve, without aborting the attach', () => {
    const plan = planContextGroupAttach({
      entries: [
        { path: 'a.md' },
        { path: 'deleted.md' },
        { path: 'moved.md' },
        { path: 'b.md' },
      ],
      resolve: (path) => (path.endsWith('.md') && !['deleted.md', 'moved.md'].includes(path)
        ? { resolved: path }
        : null),
      cap: 10,
    });
    expect(plan.toAttach.map((entry) => entry.path)).toEqual(['a.md', 'b.md']);
    expect(plan.omittedCount).toBe(0);
    expect(plan.missingPaths).toEqual(['deleted.md', 'moved.md']);
  });

  it('reports a duplicated missing path only once', () => {
    const plan = planContextGroupAttach({
      entries: [{ path: 'gone.md' }, { path: 'gone.md' }, { path: 'a.md' }],
      resolve: (path) => (path === 'a.md' ? { resolved: path } : null),
      cap: 10,
    });
    expect(plan.missingPaths).toEqual(['gone.md']);
    expect(plan.toAttach).toHaveLength(1);
  });

  it('skips paths already attached and duplicate paths inside the group', () => {
    const plan = planContextGroupAttach({
      entries: [
        { path: 'a.md' },
        { path: 'b.md' },
        { path: 'a.md' },
        { path: 'c.md' },
      ],
      resolve: (path) => ({ resolved: path }),
      existingPaths: new Set(['b.md']),
      cap: 10,
    });
    expect(plan.toAttach.map((entry) => entry.path)).toEqual(['a.md', 'c.md']);
    expect(plan.omittedCount).toBe(0);
  });

  it('counts entries past a zero remaining room as omitted without resolving them', () => {
    const resolve = jest.fn((path: string) => ({ resolved: path }));
    const plan = planContextGroupAttach({
      entries: [{ path: 'a.md' }, { path: 'b.md' }],
      resolve,
      existingPaths: new Set(['x.md', 'y.md', 'z.md', 'w.md', 'v.md']),
      cap: 0,
    });
    expect(plan.toAttach).toEqual([]);
    expect(plan.omittedCount).toBe(2);
    expect(resolve).not.toHaveBeenCalled();
  });
});

describe('summarizeContextGroup', () => {
  it('projects a group into the render row shape', () => {
    expect(summarizeContextGroup({
      id: 'g1',
      name: '注意力',
      entries: [{ path: 'a.md' }, { path: 'b.md' }],
    })).toEqual({ id: 'g1', name: '注意力', entryCount: 2 });
  });
});
