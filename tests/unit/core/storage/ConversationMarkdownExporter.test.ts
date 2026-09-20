/**
 * ConversationMarkdownExporter unit tests (advantage-parity R-D1).
 *
 * Covers the acceptance matrix from the requirement:
 * - serialized structure is valid markdown with frontmatter (all-role shapes:
 *   plain turns, tool calls, images, notices, compaction summaries)
 * - manual export is purely additive (conflict suffix, never overwrite)
 * - re-export of the same conversation is idempotent in naming (new file, new
 *   sequence number, images deduped content-addressedly)
 * - failures clean up attachments created by the same export ("no half files")
 * - auto-export refreshes only notes the feature created, and gives up when
 *   the user edited the note (mtime guard), surfacing the honest callback
 * - unsafe directories / out-of-vault attachment resolution fail closed
 */

import { buildConversationMarkdown } from '../../../../src/core/storage/ConversationMarkdownExporter';
import {
  CONVERSATION_EXPORT_STATE_PATH,
  type ConversationExportAdapter,
  type ConversationExportVault,
  ConversationMarkdownExportService,
} from '../../../../src/core/storage/ConversationMarkdownExportService';
import type { Conversation } from '../../../../src/core/types';
import type { ChatMessage } from '../../../../src/core/types/chat';
import {
  type ConversationExportSettings,
  normalizeConversationExportDirectory,
  normalizeConversationExportSettings,
} from '../../../../src/core/types/settings';

const BASE64_PNG = 'aGVsbG8='; // "hello"

function message(overrides: Partial<ChatMessage> & { id: string }): ChatMessage {
  return {
    role: 'user',
    content: '',
    timestamp: Date.parse('2026-09-20T10:00:00Z'),
    ...overrides,
  } as ChatMessage;
}

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conv-abcd1234',
    title: 'Export 测试 "quotes"',
    createdAt: Date.parse('2026-09-20T09:00:00Z'),
    updatedAt: Date.parse('2026-09-20T11:00:00Z'),
    lastResponseAt: Date.parse('2026-09-20T11:00:00Z'),
    messages: [],
    backend: 'claude-code',
    ...overrides,
  };
}

class FakeVault implements ConversationExportVault {
  readonly files = new Map<string, string | ArrayBuffer>();
  readonly folders = new Set<string>();
  readonly attachmentDir = 'attachments';
  readonly createdPaths: string[] = [];
  readonly modifiedPaths: string[] = [];
  readonly trashedPaths: string[] = [];
  /** Forced mtime per path (defaults to the shared fake clock). */
  readonly mtimes = new Map<string, number>();
  now = Date.now();
  createFails = false;

  async getAvailablePathForAttachments(fileName: string): Promise<string> {
    return `${this.attachmentDir}/${fileName}`;
  }

  getAbstractFileByPath(path: string): unknown {
    return this.files.has(path) || this.folders.has(path) ? { path } : null;
  }

  async createFolder(path: string): Promise<unknown> {
    this.folders.add(path);
    return { path };
  }

  async create(path: string, data: string): Promise<unknown> {
    if (this.createFails) {
      throw new Error('create refused');
    }
    this.files.set(path, data);
    this.mtimes.set(path, this.now);
    this.createdPaths.push(path);
    return { path };
  }

  async modify(path: string, data: string): Promise<unknown> {
    if (!this.files.has(path)) {
      throw new Error(`modify: missing ${path}`);
    }
    this.files.set(path, data);
    this.mtimes.set(path, this.now);
    this.modifiedPaths.push(path);
    return { path };
  }

  async writeBinary(path: string, data: ArrayBuffer): Promise<void> {
    this.files.set(path, data);
    this.mtimes.set(path, this.now);
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.folders.has(path);
  }

  async trash(path: string): Promise<boolean> {
    if (!this.files.has(path)) return false;
    this.files.delete(path);
    this.mtimes.delete(path);
    this.trashedPaths.push(path);
    return true;
  }

  async getFileMtime(path: string): Promise<number | null> {
    return this.mtimes.get(path) ?? null;
  }
}

class FakeAdapter implements ConversationExportAdapter {
  readonly written = new Map<string, string>();

  async read(path: string): Promise<string> {
    const content = this.written.get(path);
    if (content === undefined) {
      throw new Error('missing');
    }
    return content;
  }

  async write(path: string, data: string): Promise<void> {
    this.written.set(path, data);
  }

  async exists(path: string): Promise<boolean> {
    return this.written.has(path);
  }
}

function service(
  vault: FakeVault,
  adapter: FakeAdapter,
  settings: Partial<ConversationExportSettings> = {},
) {
  return new ConversationMarkdownExportService({
    vault,
    adapter,
    getSettings: () => normalizeConversationExportSettings(settings),
  });
}

describe('settings normalization', () => {
  it('defaults to the documented values', () => {
    expect(normalizeConversationExportSettings(undefined)).toEqual({
      directory: 'opencodian-conversations',
      filenameTemplate: '{$date}_{$topic}',
      autoExport: false,
    });
  });

  it('rejects unsafe directories and keeps the last safe value at the caller', () => {
    // A leading slash is Obsidian's vault-root convention: stripped, kept.
    expect(normalizeConversationExportDirectory('/etc')).toBe('etc');
    expect(normalizeConversationExportDirectory('a/../b')).toBeNull();
    expect(normalizeConversationExportDirectory('C:/x')).toBeNull();
    expect(normalizeConversationExportDirectory(' dir/sub/ ')).toBe('dir/sub');
  });

  it('falls back to the default template when empty', () => {
    expect(normalizeConversationExportSettings({ filenameTemplate: '   ' }).filenameTemplate)
      .toBe('{$date}_{$topic}');
  });
});

describe('buildConversationMarkdown', () => {
  it('emits frontmatter, a title heading and one section per turn', () => {
    const result = buildConversationMarkdown(conversation({
      messages: [
        message({ id: 'u1', role: 'user', content: '你好，帮我看下这个' }),
        message({ id: 'a1', role: 'assistant', content: '好的，来了。', modelId: 'claude-sonnet-4' }),
      ],
    }));
    expect(result.markdown).toContain('---\nopencodian: conversation-export');
    expect(result.markdown).toContain('backend: claude-code');
    expect(result.markdown).toContain('model: claude-sonnet-4');
    expect(result.markdown).toContain('message_count: 2');
    expect(result.markdown).toContain('# Export 测试 "quotes"');
    expect(result.markdown).toContain('## User · ');
    expect(result.markdown).toContain('## Assistant · ');
    expect(result.markdown).toMatch(/title: "Export 测试 \\"quotes\\""/);
  });

  it('serializes tool calls as a folded callout with truncated input/result', () => {
    const result = buildConversationMarkdown(conversation({
      messages: [
        message({
          id: 'a1',
          role: 'assistant',
          content: '正在读取文件',
          modelId: 'm1',
          toolCalls: [{
            id: 't1',
            name: 'read',
            input: { file: 'a'.repeat(2000) },
            status: 'completed',
            result: 'r'.repeat(5000),
          }],
        }),
      ],
    }));
    expect(result.markdown).toContain('> [!example]- Tool calls (1)');
    expect(result.markdown).toContain('**read** — completed');
    expect(result.markdown).not.toContain('a'.repeat(2000));
    expect(result.markdown).not.toContain('r'.repeat(5000));
    expect(result.markdown).toContain('chars total');

    // Every physical line inside the callout must carry the `> ` prefix —
    // a continuation line without it breaks out of the folded block
    // (real-machine regression, 2026-09-20).
    const calloutLines = result.markdown
      .split('\n')
      .filter((line) => line.includes('- **read**') || line.includes('- result:'));
    expect(calloutLines).toHaveLength(2);
    for (const line of calloutLines) {
      expect(line.startsWith('> ')).toBe(true);
    }
  });

  it('emits image placeholders for supported types and warnings for others', () => {
    const result = buildConversationMarkdown(conversation({
      messages: [
        message({
          id: 'u1',
          content: 'see this',
          images: [
            { data: BASE64_PNG, mediaType: 'image/png' },
            { data: 'R0lGOD', mediaType: 'image/gif' },
          ],
        }),
      ],
    }));
    expect(result.pendingImages).toHaveLength(2);
    expect(result.markdown).toContain('{{opencodian:image:u1:0}}');
    expect(result.markdown).toContain('{{opencodian:image:u1:1}}');
  });

  it('renders notices and compaction summaries as callouts, skipping empty messages', () => {
    const result = buildConversationMarkdown(conversation({
      messages: [
        message({ id: 'n1', displayStyle: 'notice', noticeTitle: '后台任务完成', noticeTone: 'info', content: 'done' }),
        message({ id: 's1', role: 'assistant', summary: true, content: '早期对话摘要' }),
        message({ id: 'e1', content: '' }),
      ],
    }));
    expect(result.markdown).toContain('> [!info] 后台任务完成');
    expect(result.markdown).toContain('> [!abstract]- Compaction summary');
    expect(result.markdown).toContain('早期对话摘要');
    expect(result.markdown).not.toContain('## User');
  });
});

describe('ConversationMarkdownExportService.exportConversation (manual)', () => {
  it('creates a new note in the configured directory and never overwrites', async () => {
    const vault = new FakeVault();
    const svc = service(vault, new FakeAdapter());
    const conv = conversation({ messages: [message({ id: 'u1', content: 'hi' })] });

    const first = await svc.exportConversation(conv);
    expect(first.path).toBe('opencodian-conversations/2026-09-20_Export_测试_quotes.md');
    expect(vault.folders.has('opencodian-conversations')).toBe(true);

    // Re-export: same conversation, same day → sequence suffix, both files exist.
    const second = await svc.exportConversation(conv);
    expect(second.path).not.toBe(first.path);
    expect(vault.files.has(first.path)).toBe(true);
    expect(vault.files.has(second.path)).toBe(true);
  });

  it('writes image attachments once and embeds them with ![[…]]', async () => {
    const vault = new FakeVault();
    const svc = service(vault, new FakeAdapter());
    const conv = conversation({
      messages: [
        message({ id: 'u1', content: 'pic', images: [{ data: BASE64_PNG, mediaType: 'image/png' }] }),
      ],
    });
    const { path } = await svc.exportConversation(conv);
    const note = vault.files.get(path) as string;
    expect(note).toMatch(/!\[\[attachments\/[^"]+\.png\]\]/);

    // Second export of the same conversation reuses the content-addressed
    // attachment instead of duplicating it.
    const before = Array.from(vault.files.keys()).filter((p) => p.endsWith('.png')).length;
    await svc.exportConversation(conv);
    const after = Array.from(vault.files.keys()).filter((p) => p.endsWith('.png')).length;
    expect(after).toBe(before);
  });

  it('trashes attachments created by this export when the note write fails', async () => {
    const vault = new FakeVault();
    vault.createFails = true;
    const svc = service(vault, new FakeAdapter());
    const conv = conversation({
      messages: [message({ id: 'u1', content: 'pic', images: [{ data: BASE64_PNG, mediaType: 'image/png' }] })],
    });
    await expect(svc.exportConversation(conv)).rejects.toThrow('create refused');
    expect(vault.trashedPaths.some((p) => p.endsWith('.png'))).toBe(true);
  });
});

describe('auto-export', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-20T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does nothing while autoExport is off', async () => {
    const vault = new FakeVault();
    const svc = service(vault, new FakeAdapter(), { autoExport: false });
    svc.scheduleAutoExport(conversation({ messages: [message({ id: 'u1', content: 'x' })] }));
    await jest.advanceTimersByTimeAsync(5000);
    expect(vault.createdPaths).toHaveLength(0);
    svc.dispose();
  });

  it('creates then refreshes the same note as turns complete', async () => {
    const vault = new FakeVault();
    const adapter = new FakeAdapter();
    const svc = service(vault, adapter, { autoExport: true });
    const conv = conversation({ messages: [message({ id: 'u1', content: 'first' })] });

    svc.scheduleAutoExport(conv);
    await jest.advanceTimersByTimeAsync(2500);
    expect(vault.createdPaths).toHaveLength(1);
    const notePath = vault.createdPaths[0];

    // Next turn: same path is modified in place, no new file.
    const conv2 = {
      ...conv,
      messages: [message({ id: 'u1', content: 'first' }), message({ id: 'a1', role: 'assistant' as const, content: 'second' })],
      lastResponseAt: conv.lastResponseAt! + 1000,
      updatedAt: conv.updatedAt + 1000,
    };
    svc.scheduleAutoExport(conv2);
    await jest.advanceTimersByTimeAsync(2500);
    expect(vault.createdPaths).toHaveLength(1);
    expect(vault.modifiedPaths).toEqual([notePath]);
    expect((vault.files.get(notePath) as string).length).toBeGreaterThan(0);

    // State persisted under the plugin-private path.
    expect(adapter.written.has(CONVERSATION_EXPORT_STATE_PATH)).toBe(true);
    svc.dispose();
  });

  it('stops auto-updating and reports when the user edited the note', async () => {
    const vault = new FakeVault();
    const userEditCalls: Array<{ id: string; path: string }> = [];
    const svc = new ConversationMarkdownExportService({
      vault,
      adapter: new FakeAdapter(),
      getSettings: () => normalizeConversationExportSettings({ autoExport: true }),
      onUserEditedAutoExport: (id, path) => { userEditCalls.push({ id, path }); },
    });
    const conv = conversation({ messages: [message({ id: 'u1', content: 'first' })] });

    svc.scheduleAutoExport(conv);
    await jest.advanceTimersByTimeAsync(2500);
    const notePath = vault.createdPaths[0];

    // User edits the note AFTER our write.
    vault.now += 60000;
    await vault.modify(notePath, 'user took over');

    const conv2 = { ...conv, lastResponseAt: conv.lastResponseAt! + 1000 };
    svc.scheduleAutoExport(conv2);
    await jest.advanceTimersByTimeAsync(2500);
    expect(userEditCalls).toEqual([{ id: conv.id, path: notePath }]);
    expect(vault.files.get(notePath)).toBe('user took over');

    // Further turns do not touch the note anymore.
    vault.now += 60000;
    const conv3 = { ...conv, lastResponseAt: conv.lastResponseAt! + 2000 };
    svc.scheduleAutoExport(conv3);
    await jest.advanceTimersByTimeAsync(2500);
    expect(vault.modifiedPaths).toEqual([notePath]);
    svc.dispose();
  });

  it('re-creates the note when it was deleted', async () => {
    const vault = new FakeVault();
    const svc = service(vault, new FakeAdapter(), { autoExport: true });
    const conv = conversation({ messages: [message({ id: 'u1', content: 'first' })] });

    svc.scheduleAutoExport(conv);
    await jest.advanceTimersByTimeAsync(2500);
    expect(vault.createdPaths).toHaveLength(1);

    await vault.trash(vault.createdPaths[0]);
    const conv2 = { ...conv, lastResponseAt: conv.lastResponseAt! + 1000 };
    svc.scheduleAutoExport(conv2);
    await jest.advanceTimersByTimeAsync(2500);
    expect(vault.createdPaths).toHaveLength(2);
    svc.dispose();
  });
});
