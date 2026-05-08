import { UserMessageContentRenderer } from '../../../../src/features/chat/runtime/UserMessageContentRenderer';

function createRenderer() {
  const host = {
    getRenderUserMarkupAsCodeBlocks: jest.fn().mockReturnValue(false),
    renderMarkdownInto: jest.fn().mockImplementation(async (el: HTMLElement, text: string) => {
      el.textContent = text;
    }),
    scheduleActiveSettledScrollToBottomIfNeeded: jest.fn(),
    openContextAttachment: jest.fn(),
  };
  const renderer = new UserMessageContentRenderer(host);
  return { host, renderer };
}

describe('UserMessageContentRenderer.renderCompactionDivider', () => {
  let renderer: UserMessageContentRenderer;

  beforeEach(() => {
    ({ renderer } = createRenderer());
  });

  it('renders a live divider with special class and text', () => {
    const messageEl = document.createElement('div');
    renderer.renderCompactionDivider(messageEl, {
      live: true,
      auto: true,
      overflow: false,
      tailStartId: 'msg-1',
    });

    expect(messageEl.classList.contains('opencodian-compaction-divider--live')).toBe(true);
    expect(messageEl.querySelector('.opencodian-compaction-divider-line')?.textContent).toBe(
      'Compacting…',
    );
  });

  it('renders an auto divider with auto label and completed text', () => {
    const messageEl = document.createElement('div');
    renderer.renderCompactionDivider(messageEl, {
      live: false,
      auto: true,
      overflow: false,
      tailStartId: 'msg-1',
    });

    const lineEl = messageEl.querySelector('.opencodian-compaction-divider-line');
    expect(lineEl).not.toBeNull();
    expect(lineEl?.querySelector('.opencodian-compaction-divider-badge')?.textContent).toBe(
      'Auto',
    );
    expect(lineEl?.textContent).toContain('Context was compacted');
  });

  it('renders a manual divider with manual label', () => {
    const messageEl = document.createElement('div');
    renderer.renderCompactionDivider(messageEl, {
      live: false,
      auto: false,
      overflow: false,
      tailStartId: 'msg-1',
    });

    const badgeEl = messageEl.querySelector('.opencodian-compaction-divider-badge');
    expect(badgeEl?.textContent).toBe('Manual');
  });

  it('adds overflow badge when overflow flag is true', () => {
    const messageEl = document.createElement('div');
    renderer.renderCompactionDivider(messageEl, {
      live: false,
      auto: true,
      overflow: true,
      tailStartId: 'msg-1',
    });

    const overflowBadge = messageEl.querySelector('.opencodian-compaction-divider-badge.is-overflow');
    expect(overflowBadge).not.toBeNull();
    expect(overflowBadge?.textContent).toBe('after overflow');
  });
});

describe('UserMessageContentRenderer.renderUserMessageContent', () => {
  let container: HTMLDivElement;
  let host: ReturnType<typeof createRenderer>['host'];
  let renderer: UserMessageContentRenderer;

  beforeEach(() => {
    container = document.createElement('div');
    const created = createRenderer();
    host = created.host;
    renderer = created.renderer;
  });

  afterEach(() => {
    container.remove();
  });

  it('renders plain text content through markdown', async () => {
    const message = {
      id: 'msg-1',
      role: 'user' as const,
      content: 'Hello world',
      timestamp: 1,
    };

    const result = await renderer.renderUserMessageContent(container, message);

    expect(host.renderMarkdownInto).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      'Hello world',
    );
    expect(result).toBe('Hello world');
    expect(container.querySelector('.opencodian-message-text')).not.toBeNull();
  });

  it('highlights native agent source spans in rendered user text', async () => {
    const message = {
      id: 'msg-1',
      role: 'user' as const,
      content: 'Ask @reviewer to inspect this',
      timestamp: 1,
      parts: [
        {
          type: 'agent',
          name: 'reviewer',
          source: {
            value: '@reviewer',
            start: 4,
            end: 13,
          },
        },
      ],
    };

    await renderer.renderUserMessageContent(container, message);

    const textEl = container.querySelector<HTMLElement>('.opencodian-message-text');
    const highlight = textEl?.querySelector<HTMLElement>('.opencodian-message-highlight-agent');
    expect(host.renderMarkdownInto).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      'Ask @reviewer to inspect this',
    );
    expect(textEl?.textContent).toBe('Ask @reviewer to inspect this');
    expect(highlight?.textContent).toBe('@reviewer');
    expect(highlight?.dataset.highlight).toBe('agent');
  });

  it('highlights inline slash skill tokens in rendered user text', async () => {
    const message = {
      id: 'msg-1',
      role: 'user' as const,
      content: '你好 /writing-skills 为什么 /writing-skills',
      timestamp: 1,
      parts: [
        {
          type: 'text',
          text: '<skill_content name="writing-skills">...</skill_content>',
          synthetic: true,
          metadata: {
            kind: 'skill-expansion',
            skillName: 'writing-skills',
          },
        },
      ],
    };

    await renderer.renderUserMessageContent(container, message);

    const textEl = container.querySelector<HTMLElement>('.opencodian-message-text');
    const highlights = Array.from(
      textEl?.querySelectorAll<HTMLElement>('.opencodian-message-highlight-command') ?? [],
    );
    expect(host.renderMarkdownInto).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      '你好 /writing-skills 为什么 /writing-skills',
    );
    expect(textEl?.textContent).toBe('你好 /writing-skills 为什么 /writing-skills');
    expect(highlights).toHaveLength(2);
    expect(highlights.map((element) => element.textContent)).toEqual([
      '/writing-skills',
      '/writing-skills',
    ]);
    expect(highlights.every((element) => element.dataset.highlight === 'command')).toBe(true);
  });

  it('does not highlight inline slash tokens that are not known skills', async () => {
    const message = {
      id: 'msg-1',
      role: 'user' as const,
      content: '你好 /not-a-skill 为什么',
      timestamp: 1,
      parts: [],
    };

    await renderer.renderUserMessageContent(container, message);

    const textEl = container.querySelector<HTMLElement>('.opencodian-message-text');
    expect(textEl?.textContent).toBe('你好 /not-a-skill 为什么');
    expect(textEl?.querySelector('.opencodian-message-highlight-command')).toBeNull();
  });

  it('prepares user markup as code blocks when setting is enabled', async () => {
    host.getRenderUserMarkupAsCodeBlocks.mockReturnValue(true);
    const message = {
      id: 'msg-1',
      role: 'user' as const,
      content: '<style>body { color: red; }</style>',
      timestamp: 1,
    };

    await renderer.renderUserMessageContent(container, message);

    expect(host.renderMarkdownInto).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.stringContaining('```'),
    );
  });

  it('returns empty string and skips text rendering for empty content', async () => {
    const message = {
      id: 'msg-1',
      role: 'user' as const,
      content: '',
      timestamp: 1,
    };

    const result = await renderer.renderUserMessageContent(container, message);

    expect(host.renderMarkdownInto).not.toHaveBeenCalled();
    expect(result).toBe('');
  });

  it('renders context attachments as clickable chips', async () => {
    const message = {
      id: 'msg-1',
      role: 'user' as const,
      content: 'Hello',
      timestamp: 1,
      contextAttachments: [
        { kind: 'current_note' as const, path: 'note.md', label: 'Current Note' },
        { kind: 'selection' as const, path: 'note.md#selection', label: 'Selection' },
        { kind: 'file' as const, path: 'other.md', label: 'Other File' },
      ],
    };

    await renderer.renderUserMessageContent(container, message);

    const chips = container.querySelectorAll('.opencodian-user-context-chip');
    expect(chips.length).toBe(3);
    expect(chips[0].getAttribute('title')).toBe('note.md');
    expect(chips[1].classList.contains('is-selection')).toBe(true);
  });

  it('opens context attachment on chip click', async () => {
    const message = {
      id: 'msg-1',
      role: 'user' as const,
      content: 'Hello',
      timestamp: 1,
      contextAttachments: [
        { kind: 'file' as const, path: 'docs/readme.md', label: 'Readme' },
      ],
    };

    await renderer.renderUserMessageContent(container, message);

    const chip = container.querySelector('.opencodian-user-context-chip') as HTMLElement;
    chip.click();

    expect(host.openContextAttachment).toHaveBeenCalledWith('docs/readme.md');
  });
});

describe('UserMessageContentRenderer.renderUserMessageContent OMO handling', () => {
  let container: HTMLDivElement;
  let host: ReturnType<typeof createRenderer>['host'];
  let renderer: UserMessageContentRenderer;

  beforeEach(() => {
    container = document.createElement('div');
    const created = createRenderer();
    host = created.host;
    renderer = created.renderer;
  });

  afterEach(() => {
    container.remove();
  });

  it('renders OMO user injection with badge, summary, and collapsible raw block', async () => {
    const message = {
      id: 'msg-1',
      role: 'user' as const,
      content: 'injected content',
      timestamp: 1,
      omo: {
        kind: 'user-injection' as const,
        modeTag: 'search-mode',
        originalText: 'original question',
        injectedPrompt: 'system prompt here',
        headline: 'Searching files',
      },
    };

    const result = await renderer.renderUserMessageContent(container, message);

    expect(result).toBe('original question');
    expect(host.renderMarkdownInto).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.stringContaining('Searching files'),
    );

    const injectionEl = container.querySelector('.opencodian-omo-injection');
    expect(injectionEl).not.toBeNull();

    const badgeEl = injectionEl?.querySelector('.opencodian-omo-injection-badge');
    expect(badgeEl?.textContent).toBe('Search mode');

    const rawContent = injectionEl?.querySelector('.opencodian-omo-raw-content');
    expect(rawContent?.textContent).toBe('system prompt here');
  });

  it('uses custom badge label for unknown OMO mode tags', async () => {
    const message = {
      id: 'msg-1',
      role: 'user' as const,
      content: 'test',
      timestamp: 1,
      omo: {
        kind: 'user-injection' as const,
        modeTag: 'unknown-mode',
        originalText: 'original',
        injectedPrompt: 'prompt',
      },
    };

    await renderer.renderUserMessageContent(container, message);

    const badgeEl = container.querySelector('.opencodian-omo-injection-badge');
    expect(badgeEl?.textContent).toBe('Custom mode');
  });

  it('uses default headline when OMO headline is absent', async () => {
    const message = {
      id: 'msg-1',
      role: 'user' as const,
      content: 'test',
      timestamp: 1,
      omo: {
        kind: 'user-injection' as const,
        modeTag: 'analyze-mode',
        originalText: 'original',
        injectedPrompt: 'prompt',
      },
    };

    await renderer.renderUserMessageContent(container, message);

    expect(host.renderMarkdownInto).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.stringContaining('Additional instructions were injected'),
    );
  });

  it('schedules scroll on collapsible toggle', async () => {
    const message = {
      id: 'msg-1',
      role: 'user' as const,
      content: 'Hello world',
      timestamp: 1,
    };

    await renderer.renderUserMessageContent(container, message);

    expect(host.scheduleActiveSettledScrollToBottomIfNeeded).not.toHaveBeenCalled();
  });
});
