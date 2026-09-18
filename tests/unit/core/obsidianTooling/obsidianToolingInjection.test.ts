import {
  OBSIDIAN_TOOLING_INJECTION_OPEN_MARKER,
} from '../../../../src/core/obsidianTooling/obsidianToolingCatalog';
import {
  extractObsidianToolingInjection,
  planToolingInjection,
  prependObsidianToolingInjection,
  toolingEpochMarkerCount,
  transcriptHasToolingInjection,
} from '../../../../src/core/obsidianTooling/obsidianToolingInjection';

const msg = (partial: {
  role: 'user' | 'assistant';
  content: string;
  summary?: boolean;
  compactionDivider?: unknown;
  parts?: unknown[];
}) => ({ id: `m-${Math.random()}`, timestamp: 1, ...partial });

describe('tooling injection epoch planning (R-B4)', () => {
  it('injects once per epoch and then skips', () => {
    const messages = [msg({ role: 'user', content: 'first turn' })];
    const first = planToolingInjection({ blockText: 'BLOCK', messages });
    expect(first.text).toBe('BLOCK');
    expect(first.skippedReason).toBeNull();

    const second = planToolingInjection({
      blockText: 'BLOCK',
      messages,
      injectedEpochMarkerCount: toolingEpochMarkerCount(messages),
    });
    expect(second.text).toBeNull();
    expect(second.skippedReason).toBe('already-injected-this-epoch');
  });

  it('detects the marker in persisted transcripts (reload across sessions)', () => {
    const messages = [
      msg({ role: 'user', content: `something before` }),
      msg({ role: 'user', content: `${OBSIDIAN_TOOLING_INJECTION_OPEN_MARKER}\nblock` }),
      msg({ role: 'user', content: 'later turn' }),
    ];
    const plan = planToolingInjection({ blockText: 'BLOCK', messages });
    expect(plan.text).toBeNull();
    expect(plan.skippedReason).toBe('already-injected-this-epoch');
    expect(transcriptHasToolingInjection(messages)).toBe(true);
  });

  it('detects the marker inside persisted synthetic parts', () => {
    const messages = [
      msg({
        role: 'user',
        content: 'user text',
        parts: [{ type: 'text', text: `${OBSIDIAN_TOOLING_INJECTION_OPEN_MARKER} ...` }],
      }),
    ];
    expect(transcriptHasToolingInjection(messages)).toBe(true);
  });

  it('a compaction divider starts a fresh epoch', () => {
    const messages = [
      msg({ role: 'user', content: `${OBSIDIAN_TOOLING_INJECTION_OPEN_MARKER}` }),
      msg({ role: 'assistant', content: 'summary', summary: true }),
      msg({ role: 'user', content: 'new epoch' }),
    ];
    expect(transcriptHasToolingInjection(messages)).toBe(false);
    const plan = planToolingInjection({ blockText: 'BLOCK', messages, injectedEpochMarkerCount: 0 });
    expect(plan.text).toBe('BLOCK');
  });

  it('null block text means disabled (mode off produces nothing)', () => {
    const plan = planToolingInjection({ blockText: null, messages: [] });
    expect(plan.text).toBeNull();
    expect(plan.skippedReason).toBe('disabled');
  });
});

describe('options-bag contract (backend-neutral seam)', () => {
  it('extracts the injection from the bag and stays inert when absent', () => {
    expect(extractObsidianToolingInjection({ obsidianToolingInjection: { text: 'BLOCK' } })).toBe('BLOCK');
    expect(extractObsidianToolingInjection({ obsidianToolingInjection: { text: '   ' } })).toBeNull();
    expect(extractObsidianToolingInjection(undefined)).toBeNull();
    expect(extractObsidianToolingInjection(null)).toBeNull();
    expect(extractObsidianToolingInjection({ memoryInjection: { text: 'MEMORY' } })).toBeNull();
  });

  it('prepends to prompt content only when present (claude/codex/pi seam)', () => {
    expect(prependObsidianToolingInjection('USER TEXT', { obsidianToolingInjection: { text: 'BLOCK' } })).toBe(
      'BLOCK\n\nUSER TEXT',
    );
    expect(prependObsidianToolingInjection('USER TEXT', undefined)).toBe('USER TEXT');
    expect(prependObsidianToolingInjection('USER TEXT', {})).toBe('USER TEXT');
  });

  it('does not confuse the memory injection key with the tooling key', () => {
    const options = { memoryInjection: { text: 'MEMORY BLOCK' } };
    expect(prependObsidianToolingInjection('USER', options)).toBe('USER');
  });
});
