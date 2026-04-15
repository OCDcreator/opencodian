import { OpenCodeService } from './OpenCodeService.testSupport';

type OpenCodeMessageToChatMessage = typeof OpenCodeService.openCodeMessageToChatMessage;
type OpenCodeMessageInfo = Parameters<OpenCodeMessageToChatMessage>[0];

function createAssistantInfo(overrides: Partial<OpenCodeMessageInfo> = {}): OpenCodeMessageInfo {
  return {
    id: 'msg-1',
    sessionID: 'session-1',
    role: 'assistant',
    time: { created: 1234567890 },
    parentID: 'msg-0',
    modelID: 'claude-3-5-sonnet',
    providerID: 'anthropic',
    mode: 'default',
    path: { cwd: '/test', root: '/test' },
    cost: 0.001,
    tokens: { input: 10, output: 20, reasoning: 0, cache: { read: 0, write: 0 } },
    ...overrides,
  } as OpenCodeMessageInfo;
}

function createUserInfo(overrides: Partial<OpenCodeMessageInfo> = {}): OpenCodeMessageInfo {
  return {
    id: 'msg-user',
    sessionID: 'session-1',
    role: 'user',
    time: { created: 1234567891 },
    ...overrides,
  } as OpenCodeMessageInfo;
}

describe('OpenCodeService.openCodeMessageToChatMessage OMO compatibility', () => {
  it('extracts OMO-injected user prompts into structured metadata', () => {
    const message = OpenCodeService.openCodeMessageToChatMessage(
      createUserInfo({
        id: 'msg-omo-user',
        time: { created: 1234567896 },
      }),
      [
        {
          type: 'text',
          id: 'part-omo-user',
          sessionID: 'session-1',
          messageID: 'msg-omo-user',
          text: '[search-mode]\nMAXIMIZE SEARCH EFFORT\n\n---\n使用工具搜索一下史料',
        },
      ],
    );

    expect(message.content).toBe('使用工具搜索一下史料');
    expect(message.omo).toMatchObject({
      kind: 'user-injection',
      modeTag: 'search-mode',
      injectedPrompt: 'MAXIMIZE SEARCH EFFORT',
      originalText: '使用工具搜索一下史料',
    });
  });

  it('maps background task completion reminders into structured notice metadata', () => {
    const reminderMessage = OpenCodeService.openCodeMessageToChatMessage(
      createAssistantInfo({
        id: 'msg-omo-reminder',
        time: { created: 1234567897 },
        parentID: 'msg-omo-user',
      }),
      [
        {
          type: 'text',
          id: 'part-omo-reminder',
          sessionID: 'session-1',
          messageID: 'msg-omo-reminder',
          text: '<system-reminder>\n[BACKGROUND TASK COMPLETED]\n**ID:** `bg_8f454ac6`\n**Description:** 探索系统进程和文件管理\n</system-reminder>\n<!-- OMO_INTERNAL_INITIATOR -->',
        },
      ],
    );
    const allCompletedMessage = OpenCodeService.openCodeMessageToChatMessage(
      createAssistantInfo({
        id: 'msg-omo-reminder-all',
        time: { created: 1234567898 },
        parentID: 'msg-omo-user',
      }),
      [
        {
          type: 'text',
          id: 'part-omo-reminder-all',
          sessionID: 'session-1',
          messageID: 'msg-omo-reminder-all',
          text: '<system-reminder>\n[ALL BACKGROUND TASKS COMPLETE]\n\n**Completed:**\n- `bg_8f454ac6`: 探索系统进程和文件管理\n- `bg_32c8a726`: 搜索文件管理最佳实践\n\nUse `background_output(task_id="<id>")` to retrieve each result.\n</system-reminder>\n<!-- OMO_INTERNAL_INITIATOR -->',
        },
      ],
    );

    expect(reminderMessage.displayStyle).toBe('notice');
    expect(reminderMessage.noticeTone).toBe('info');
    expect(reminderMessage.content).toContain('[BACKGROUND TASK COMPLETED]');
    expect(reminderMessage.omo).toMatchObject({
      kind: 'system-reminder',
      reminderType: 'background-task-completed',
      isInternalInitiator: true,
      tasks: [
        {
          id: 'bg_8f454ac6',
          description: '探索系统进程和文件管理',
        },
      ],
    });
    expect(allCompletedMessage.omo).toMatchObject({
      kind: 'system-reminder',
      reminderType: 'all-background-tasks-complete',
      tasks: [
        {
          id: 'bg_8f454ac6',
          description: '探索系统进程和文件管理',
        },
        {
          id: 'bg_32c8a726',
          description: '搜索文件管理最佳实践',
        },
      ],
    });
  });
});

