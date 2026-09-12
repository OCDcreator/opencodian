import {
  buildExtractionUserPrompt,
  countUserProse,
  evaluateExtractionGate,
  extractionSourceTag,
  fileTouchesOfMessage,
  lastUserTurnFromLines,
  memoryWritePaths,
  parseExtractionResponse,
  toExtractionLines,
  transcriptHasExtractableProse,
} from '../../../../src/core/memory/memoryExtraction';
import type { MemoryTranscriptMessage } from '../../../../src/core/memory/memoryTypes';

const BUCKET = '.opencodian/memory/projects/my-vault-0123456789abcdef';
const ROOT_NATIVE = '/vault/.opencodian/memory/projects/my-vault-0123456789abcdef/';

function msg(partial: Partial<MemoryTranscriptMessage> & { role: 'user' | 'assistant'; content: string }): MemoryTranscriptMessage {
  return { id: `m-${Math.random().toString(36).slice(2, 8)}`, timestamp: 1, ...partial };
}

describe('countUserProse (CJK-aware gate)', () => {
  it('counts latin words and CJK chars, taking the max', () => {
    expect(countUserProse('hi')).toBe(1);
    expect(countUserProse('one two three')).toBe(3);
    expect(countUserProse('以后不要再这样做')).toBeGreaterThanOrEqual(8);
    expect(countUserProse('')).toBe(0);
  });
});

describe('toExtractionLines', () => {
  it('keeps user/assistant messages and drops compaction artifacts', () => {
    const lines = toExtractionLines([
      msg({ role: 'user', content: 'hello' }),
      msg({ role: 'assistant', content: 'summary text', summary: true, summaryKind: 'compaction' }),
      msg({ role: 'assistant', content: 'reply' }),
      msg({ role: 'user', content: 'again', compactionDivider: { auto: true } }),
    ]);
    expect(lines.map((l) => l.text)).toEqual(['hello', 'reply']);
  });
});

describe('memoryWritePaths (turn-wrote-memory gate)', () => {
  it('detects a write tool call into the memory bucket with enough content', () => {
    const messages = [
      msg({
        role: 'assistant',
        content: 'saved',
        toolCalls: [{
          name: 'write',
          input: {
            filePath: `${ROOT_NATIVE}my-memory.md`,
            content: 'x'.repeat(200),
          },
        }],
      }),
    ];
    expect(memoryWritePaths(messages, BUCKET, ROOT_NATIVE)).toHaveLength(1);
  });

  it('ignores writes outside the bucket, short writes, and non-write tools', () => {
    const outside = msg({
      role: 'assistant',
      content: '',
      toolCalls: [{ name: 'write', input: { filePath: '/vault/notes/other.md', content: 'x'.repeat(300) } }],
    });
    const tooShort = msg({
      role: 'assistant',
      content: '',
      toolCalls: [{ name: 'write', input: { filePath: `${ROOT_NATIVE}m.md`, content: 'short' } }],
    });
    const readTool = msg({
      role: 'assistant',
      content: '',
      toolCalls: [{ name: 'read', input: { filePath: `${ROOT_NATIVE}m.md`, content: 'x'.repeat(300) } }],
    });
    const all = [outside, tooShort, readTool];
    expect(memoryWritePaths(all, BUCKET, ROOT_NATIVE)).toEqual([]);
  });

  it('probes every plausible input field via fileTouchesOfMessage', () => {
    const touches = fileTouchesOfMessage(msg({
      role: 'assistant',
      content: '',
      toolCalls: [{ name: 'str_replace_editor', input: { file_path: '/x/y.md', newString: 'z'.repeat(200) } }],
    }));
    expect(touches[0]).toMatchObject({ name: 'str_replace_editor', filePath: '/x/y.md' });
  });
});

describe('evaluateExtractionGate (D26)', () => {
  const root = ROOT_NATIVE;
  const bucket = BUCKET;

  it('skips empty transcripts and non-grown transcripts', () => {
    const base = { lastExtractedMessageCount: 0, projectDir: bucket, memoryRootNative: root };
    expect(evaluateExtractionGate({ lines: [], ...base }).skipReason).toBe('empty-transcript');

    const lines = toExtractionLines([
      msg({ role: 'user', content: 'please remember this preference' }),
      msg({ role: 'assistant', content: 'ok' }),
    ]);
    expect(evaluateExtractionGate({ lines, lastExtractedMessageCount: 2, projectDir: bucket, memoryRootNative: root }).skipReason)
      .toBe('transcript-not-grown');
  });

  it('skips turns whose newest user message is below the prose threshold', () => {
    const lines = toExtractionLines([msg({ role: 'user', content: 'hi' })]);
    const out = evaluateExtractionGate({ lines, lastExtractedMessageCount: 0, projectDir: BUCKET, memoryRootNative: root });
    expect(out.skipReason).toBe('user-prose-below-threshold');
  });

  it('skips when the turn already wrote the memory bucket itself', () => {
    const lines = toExtractionLines([
      msg({ role: 'user', content: 'remember that I prefer tabs over spaces now' }),
      msg({
        role: 'assistant',
        content: 'saved',
        toolCalls: [{ name: 'write', input: { filePath: `${root}pref.md`, content: 'y'.repeat(220) } }],
      }),
    ]);
    const out = evaluateExtractionGate({ lines, lastExtractedMessageCount: 0, projectDir: BUCKET, memoryRootNative: root });
    expect(out.skipReason).toBe('turn-wrote-memory');
  });

  it('proceeds for a substantive fresh turn', () => {
    const lines = toExtractionLines([
      msg({ role: 'user', content: '以后回答问题时先给结论再给细节，因为上次我等了很久' }),
    ]);
    const out = evaluateExtractionGate({ lines, lastExtractedMessageCount: 0, projectDir: BUCKET, memoryRootNative: root });
    expect(out.proceed).toBe(true);
    expect(out.skipReason).toBeNull();
  });

  it('lastUserTurnFromLines picks the newest user text', () => {
    const lines = toExtractionLines([
      msg({ role: 'user', content: 'first' }),
      msg({ role: 'assistant', content: 'r' }),
      msg({ role: 'user', content: 'second turn has enough words now' }),
    ]);
    expect(lastUserTurnFromLines(lines)).toBe('second turn has enough words now');
    expect(transcriptHasExtractableProse(lines)).toBe(true);
  });
});

describe('buildExtractionUserPrompt', () => {
  it('embeds the dedupe index and the transcript with caps', () => {
    const prompt = buildExtractionUserPrompt({
      transcript: '[user] hello there friend',
      indexContent: '- [A](a.md) — hook',
    });
    expect(prompt).toContain('- [A](a.md) — hook');
    expect(prompt).toContain('[user] hello there friend');
    expect(prompt).toContain('{"memories":[]}');

    const long = Array.from({ length: 2000 }, (_, i) => `[user] line ${i} of the transcript`).join('\n');
    const truncatedPrompt = buildExtractionUserPrompt({ transcript: long, indexContent: null });
    expect(truncatedPrompt).toContain('older transcript omitted');
    expect(truncatedPrompt.length).toBeLessThan(60_000);
  });
});

describe('parseExtractionResponse (defensive, ≤1 per turn)', () => {
  const valid = JSON.stringify({
    memories: [{
      name: 'conclusion-first',
      description: 'Answer conclusion first',
      type: 'feedback',
      body: 'Trigger: user asks a question\n**Why:** they wait long\n**How to apply:** lead with the answer',
    }],
  });

  it('parses plain JSON, fenced JSON and {observations:[…]} shapes', () => {
    expect(parseExtractionResponse(valid)).toHaveLength(1);
    expect(parseExtractionResponse('```json\n' + valid + '\n```')).toHaveLength(1);
    expect(parseExtractionResponse('{"observations":[{"name":"x-y","description":"d","type":"project","body":"b"}]}')).toHaveLength(1);
  });

  it('caps at one memory per turn and drops invalid entries', () => {
    const two = JSON.stringify({
      memories: [
        { name: 'first-one', description: 'd', type: 'project', body: 'b' },
        { name: 'second-one', description: 'd', type: 'project', body: 'b' },
      ],
    });
    expect(parseExtractionResponse(two)).toHaveLength(1);

    const bad = JSON.stringify({
      memories: [
        { name: '中文', description: 'd', type: 'project', body: 'b' },
        { name: 'ok-name', description: '', type: 'project', body: 'b' },
        { name: 'bad-type', description: 'd', type: 'note', body: 'b' },
      ],
    });
    expect(parseExtractionResponse(bad)).toHaveLength(0);
  });

  it('fails soft to [] on garbage', () => {
    expect(parseExtractionResponse('')).toEqual([]);
    expect(parseExtractionResponse('not json at all')).toEqual([]);
    expect(parseExtractionResponse('{"broken": ')).toEqual([]);
  });

  it('clamps description and body lengths', () => {
    const out = parseExtractionResponse(JSON.stringify({
      memories: [{ name: 'big', description: 'd'.repeat(500), type: 'user', body: 'b'.repeat(9000) }],
    }));
    expect(out[0].description.length).toBe(200);
    expect(out[0].body.length).toBe(4000);
  });

  it('extractionSourceTag stamps the session prefix', () => {
    expect(extractionSourceTag('ses_abcdefghijklmn')).toBe('extracted ses_abcdefgh');
  });
});
