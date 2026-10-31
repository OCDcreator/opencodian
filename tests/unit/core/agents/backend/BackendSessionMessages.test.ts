import { backendSessionMessagesToChat, preserveGoalIntentMessages } from '../../../../../src/core/agents/backend/BackendSessionMessages';
import type { ChatMessage } from '../../../../../src/core/types';

describe('Goal intent transcript reconciliation', () => {
  const goal: ChatMessage = { id: 'local-goal', role: 'user', content: 'Check everything', timestamp: 2,
    parts: [{ type: 'opencodian_goal_intent' }] };
  const before: ChatMessage = { id: 'previous', role: 'assistant', content: 'Earlier', timestamp: 1, sourceMessageId: 'native-before' };
  const after: ChatMessage = { id: 'next', role: 'assistant', content: 'FIRST', timestamp: 3, sourceMessageId: 'native-after' };
  it('retains the intent in place when the backend only persists assistant output', () => {
    expect(preserveGoalIntentMessages([before, goal, after], [before, after]).map((message) => message.id))
      .toEqual(['previous', 'local-goal', 'next']);
    expect(preserveGoalIntentMessages([before, goal], [before, after]).map((message) => message.id))
      .toEqual(['previous', 'local-goal', 'next']);
  });
  it('does not duplicate a native user item and retains its marker on later syncs', () => {
    const native = { ...goal, id: 'native-goal', parts: [{ type: 'text', text: goal.content }] };
    const merged = preserveGoalIntentMessages([goal], [native, after]);
    expect(merged).toHaveLength(2);
    expect(merged[0].parts).toContainEqual({ type: 'opencodian_goal_intent' });
    expect(preserveGoalIntentMessages(merged, [after])).toHaveLength(2);
  });
});

describe('native continuation transcript projection', () => {
  it('honors native ZCode hidden and model-only semantics while keeping visible control events', () => {
    const messages=backendSessionMessagesToChat('zcode',[
      {info:{id:'hidden',role:'user',semantics:{uiVisibility:'hidden',transcriptVisibility:'hidden'}},parts:[{type:'text',text:'Private environment'}]},
      {info:{id:'continuation',role:'user',visibility:'model-only'},parts:[{type:'text',text:'Private Goal continuation'}]},
      {info:{id:'visible',role:'assistant',semantics:{origin:'system',uiVisibility:'visible'}},parts:[{type:'text',text:'Goal paused'}]},
    ]);
    expect(messages.map(message=>message.content)).toEqual(['Goal paused']);
  });
  it('preserves Codex command output, file changes and native turn identity', () => {
    const messages=backendSessionMessagesToChat('codex',[
      {id:'cmd1',role:'assistant',sourceTurnId:'turn2',content:[{type:'commandExecution',id:'cmd1',command:'npm test',cwd:'/owned',status:'completed',aggregatedOutput:'All tests pass'}]},
      {id:'file1',role:'assistant',sourceTurnId:'turn2',content:[{type:'fileChange',id:'file1',changes:[{path:'a.ts',kind:'update',diff:'+line'}],status:'completed'}]},
    ]);
    expect(messages[0]).toMatchObject({sourceMessageId:'cmd1',sourceTurnId:'turn2',toolCalls:[{id:'cmd1',name:'shell',input:{command:'npm test',cwd:'/owned'},result:'All tests pass'}]});
    expect(messages[1].toolCalls?.[0].result).toContain('a.ts');
  });

  it('attaches Harness results to their original tool without exposing internal user injections',()=>{
    const messages=backendSessionMessagesToChat('dsh',[
      {id:'internal',role:'user',sourceKind:'system',content:'Private continuation instructions'},
      {id:'assistant',role:'assistant',content:[{type:'tool_use',id:'call1',name:'read',input:{path:'a.md'}}]},
      {id:'result',role:'tool',content:[{type:'tool_result',toolCallId:'call1',content:'Native output'}]},
    ]);
    expect(messages).toHaveLength(1);
    expect(messages[0].toolCalls?.[0]).toMatchObject({id:'call1',result:'Native output',status:'completed'});
  });
  it('keeps stable identities, thinking and tool results through multiple automatic rounds', () => {
    const messages = backendSessionMessagesToChat('claude-code', [
      { uuid: 'u1', type: 'user', message: { role: 'user', content: 'Do the task' } },
      { uuid: 'a1', type: 'assistant', message: { role: 'assistant', content: [
        { type: 'thinking', thinking: 'Inspect first' },
        { type: 'tool_use', id: 'tool1', name: 'Read', input: { file_path: 'a.md' } },
      ] } },
      { uuid: 'r1', type: 'user', message: { role: 'user', content: [
        { type: 'tool_result', tool_use_id: 'tool1', content: [{ type: 'text', text: 'file contents' }] },
      ] } },
      { uuid: 'a2', type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Verified' }] } },
    ]);
    expect(messages.map((message) => message.sourceMessageId)).toEqual(['u1', 'a1', 'a2']);
    expect(messages[1].contentBlocks?.[0]).toEqual({ type: 'thinking', thinking: 'Inspect first' });
    expect(messages[1].toolCalls?.[0]).toMatchObject({ id: 'tool1', result: 'file contents', status: 'completed' });
    expect(messages[2].content).toBe('Verified');
  });

  it('retains image-only user messages and native ZCode message identities', () => {
    const messages = backendSessionMessagesToChat('zcode', [
      { info: { messageId: 'native-u', role: 'user', time: { created: 12 } }, parts: [
        { type: 'image', source: { media_type: 'image/png', data: 'aGVsbG8=' } },
      ] },
      { info: { messageId: 'native-a', role: 'assistant' }, parts: [{ type: 'text', text: 'Visible' }] },
    ]);
    expect(messages[0]).toMatchObject({ sourceMessageId: 'native-u', timestamp: 12, images: [{ mediaType: 'image/png', data: 'aGVsbG8=' }] });
    expect(messages[1].content).toBe('Visible');
  });

  it('keeps Codex native activity text when its preview has no tool-call identity', () => {
    expect(backendSessionMessagesToChat('codex', [{ id: 'activity', role: 'activity', sourceTurnId: 'turn2',
      content: [{ type: 'tool_call', text: 'Shell: npm test' }, { type: 'file_change', text: 'a.ts (update)' }],
    }])[0]).toMatchObject({ sourceMessageId: 'activity', sourceTurnId: 'turn2', content: 'Shell: npm test\na.ts (update)' });
  });
});
