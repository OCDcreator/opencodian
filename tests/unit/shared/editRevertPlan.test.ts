/**
 * EditRevertPlan pure-planner tests (R-B3).
 *
 * The planner is Obsidian-free and deterministic: write-tool classification
 * and target extraction across the four backend tool surfaces, prompt
 * candidate extraction, round retention planning, and sidebar view-model
 * derivation with explicit capability-boundary labels.
 */

import {
  buildSidebarModel,
  classifyWriteTool,
  computeBlobRefCounts,
  computeRoundBytes,
  type EditRevertFileEntry,
  type EditRevertRoundMeta,
  extractCandidatePathsFromPrompt,
  extractWriteToolTargets,
  isMarkdownPath,
  parseApplyPatchPaths,
  parseShellRedirectionTargets,
  planRoundEvictions,
} from '../../../src/shared';

function makeEntry(overrides: Partial<EditRevertFileEntry> & { path: string }): EditRevertFileEntry {
  return {
    status: 'modified',
    state: 'active',
    preImageStatus: 'available',
    preImageHash: 'h-default',
    sizeBytes: 10,
    firstWriteAt: 1,
    lastWriteAt: 1,
    source: 'vault-event',
    ...overrides,
  };
}

function makeRound(overrides: Partial<EditRevertRoundMeta> & { id: string }): EditRevertRoundMeta {
  return {
    conversationId: 'conv',
    backend: 'opencode',
    createdAt: 1,
    closedAt: null,
    degraded: false,
    acceptsWritesUntil: Number.MAX_SAFE_INTEGER,
    lastActivityAtHint: 1,
    entries: [],
    ...overrides,
  };
}

describe('editRevertPlan: write-tool classification (backend-agnostic surface)', () => {
  it.each([
    ['write', 'structured'],
    ['edit', 'structured'],
    ['Edit', 'structured'],
    ['MultiEdit', 'structured'],
    ['str_replace_editor', 'structured'],
    ['str_replace_based_edit_tool', 'structured'],
    ['apply_patch', 'structured'],
    ['write_file', 'structured'],
    ['notebookedit', 'structured'],
    ['bash', 'shell'],
    ['Bash', 'shell'],
    ['command_execution', 'shell'],
    ['run_command', 'shell'],
    ['read', null],
    ['grep', null],
    ['', null],
  ])('classifies %s as %s', (toolName, expected) => {
    expect(classifyWriteTool(toolName)).toBe(expected);
  });
});

describe('editRevertPlan: write-tool target extraction', () => {
  it('extracts direct path fields (Claude/OpenCode style inputs)', () => {
    expect(extractWriteToolTargets('Edit', { file_path: '/notes/a.md' })).toEqual(['/notes/a.md']);
    expect(extractWriteToolTargets('edit', { path: 'folder/b.md', file: 'ignored.md' })).toEqual([
      'folder/b.md',
      'ignored.md',
    ]);
  });

  it('extracts apply_patch targets including Add/Delete sides, excluding /dev/null', () => {
    const patch = [
      '*** Begin Patch',
      '*** Add File: notes/new.md',
      '+hello',
      '*** Update File: notes/old.md',
      '-bye',
      '*** Delete File: notes/gone.md',
      '*** End Patch',
    ].join('\n');
    expect(extractWriteToolTargets('apply_patch', { patch })).toEqual([
      'notes/new.md',
      'notes/old.md',
      'notes/gone.md',
    ]);
    expect(parseApplyPatchPaths('*** Update File: /dev/null\n+++ /dev/null')).toEqual([]);
  });

  it('extracts unified-diff targets (deduplicated per path)', () => {
    const diff = ['--- a/notes/x.md', '+++ b/notes/x.md', '@@ -1 +1 @@'].join('\n');
    expect(extractWriteToolTargets('edit_file', { diff })).toEqual(['notes/x.md']);
  });

  it('extracts simple markdown redirection targets from shell commands (Codex/Pi)', () => {
    expect(extractWriteToolTargets('bash', { command: 'echo hi > notes/a.md' })).toEqual(['notes/a.md']);
    expect(extractWriteToolTargets('shell', { command: 'cat a.md | tee "notes/b.md"' })).toEqual(['notes/b.md']);
    // Variables, /dev sinks and non-markdown targets are ignored.
    expect(parseShellRedirectionTargets('echo $F > $TARGET > /dev/null > out.txt')).toEqual([]);
  });

  it('returns nothing for read-only tools', () => {
    expect(extractWriteToolTargets('read', { file_path: 'a.md' })).toEqual([]);
  });
});

describe('editRevertPlan: prompt candidate extraction (budgeted pre-snapshot)', () => {
  it('collects markdown paths from wikilinks, markdown links and bare tokens', () => {
    const candidates = extractCandidatePathsFromPrompt(
      'Please update [[Folder/A.md#Section]], see [label](docs/b.md) and also Folder/c.md.',
    );
    expect(candidates).toEqual(['Folder/A.md', 'docs/b.md', 'Folder/c.md']);
  });

  it('ignores URLs, non-markdown paths and bare wikilink titles without extension', () => {
    const candidates = extractCandidatePathsFromPrompt(
      'See https://example.com/x.md, [[Plain Title]] and image.png.',
    );
    expect(candidates).toEqual([]);
  });
});

describe('editRevertPlan: round retention planning (快照淘汰)', () => {
  const round = (id: string, conversationId: string, createdAt: number, bytes: number) => ({
    id,
    conversationId,
    createdAt,
    bytes,
  });

  it('evicts the oldest round of a conversation beyond the per-conversation cap', () => {
    const evictions = planRoundEvictions(
      [
        round('r3', 'conv-a', 3, 10),
        round('r1', 'conv-a', 1, 10),
        round('r2', 'conv-a', 2, 10),
      ],
      { maxTotal: 10, maxPerConversation: 2, maxBytes: 1000 },
    );
    expect(evictions).toEqual(['r1']);
  });

  it('evicts oldest-first when the global count cap overflows', () => {
    const evictions = planRoundEvictions(
      [
        round('r1', 'conv-a', 1, 10),
        round('r2', 'conv-b', 2, 10),
        round('r3', 'conv-a', 3, 10),
        round('r4', 'conv-b', 4, 10),
        round('r5', 'conv-a', 5, 10),
      ],
      { maxTotal: 3, maxPerConversation: 10, maxBytes: 1000 },
    );
    expect(evictions).toEqual(['r1', 'r2']);
  });

  it('evicts oldest-first when the global byte cap overflows', () => {
    const evictions = planRoundEvictions(
      [
        round('r1', 'conv-a', 1, 600),
        round('r2', 'conv-b', 2, 600),
        round('r3', 'conv-a', 3, 600),
      ],
      { maxTotal: 10, maxPerConversation: 10, maxBytes: 1500 },
    );
    expect(evictions).toEqual(['r1']);
  });
});

describe('editRevertPlan: round bytes and blob refcounts (dedup accounting)', () => {
  it('counts each unique blob once per round even when entries share it', () => {
    const bytes = computeRoundBytes(
      {
        entries: [
          makeEntry({ path: 'a.md', preImageHash: 'h1' }),
          makeEntry({ path: 'b.md', preImageHash: 'h1', restoreHash: 'h2' }),
        ],
      },
      (hash) => (hash === 'h1' ? 100 : 50),
    );
    expect(bytes).toBe(150);
  });

  it('counts references across rounds', () => {
    const counts = computeBlobRefCounts([
      { entries: [makeEntry({ path: 'a.md', preImageHash: 'h1' })] },
      { entries: [makeEntry({ path: 'a.md', preImageHash: 'h1', restoreHash: 'h2' })] },
    ]);
    expect(counts.get('h1')).toBe(2);
    expect(counts.get('h2')).toBe(1);
  });
});

describe('editRevertPlan: sidebar model derivation (capability-boundary honesty)', () => {
  it('isMarkdownPath matches markdown only, case-insensitive', () => {
    expect(isMarkdownPath('notes/A.MD')).toBe(true);
    expect(isMarkdownPath('notes/a.md')).toBe(true);
    expect(isMarkdownPath('notes/a.txt')).toBe(false);
    expect(isMarkdownPath('notes/a')).toBe(false);
  });

  it('marks oversize and pre-image-less entries as not revertible with a reason (AC6)', () => {
    const model = buildSidebarModel(
      makeRound({
        id: 'r',
        entries: [
          makeEntry({ path: 'big.md', preImageStatus: 'oversize' }),
          makeEntry({ path: 'unknown.md', preImageStatus: 'unavailable' }),
          makeEntry({ path: 'ok.md' }),
          makeEntry({ path: 'new.md', status: 'created', preImageStatus: 'unavailable' }),
        ],
      }),
      true,
      1000,
    );
    expect(model.entries.find((entry) => entry.path === 'big.md')).toMatchObject({
      revertible: false,
      excludedReason: 'oversize',
    });
    expect(model.entries.find((entry) => entry.path === 'unknown.md')).toMatchObject({
      revertible: false,
      excludedReason: 'no-preimage',
    });
    expect(model.entries.find((entry) => entry.path === 'new.md')).toMatchObject({
      revertible: true,
      excludedReason: null,
    });
    expect(model.revertibleCount).toBe(2);
  });

  it('exposes reverted entries as restorable, not excluded', () => {
    const model = buildSidebarModel(
      makeRound({
        id: 'r',
        entries: [
          makeEntry({ path: 'a.md', state: 'reverted', restoreHash: 'h2' }),
        ],
      }),
      true,
      1000,
    );
    expect(model.entries[0]).toMatchObject({
      state: 'reverted',
      revertible: false,
      restorable: true,
      excludedReason: null,
    });
  });

  it('reflects the open-round and degraded state for UI gating', () => {
    const open = buildSidebarModel(makeRound({ id: 'r1' }), true, 1000);
    expect(open.roundOpen).toBe(true);

    const closed = buildSidebarModel(
      makeRound({ id: 'r2', acceptsWritesUntil: 900, degraded: true }),
      true,
      1000,
    );
    expect(closed.roundOpen).toBe(false);
    expect(closed.degraded).toBe(true);

    const disabled = buildSidebarModel(makeRound({ id: 'r3', entries: [makeEntry({ path: 'a.md' })] }), false, 1000);
    expect(disabled).toMatchObject({ enabled: false, entries: [], revertibleCount: 0 });
  });
});
