import { ClaudeCodeStreamNormalizer } from '../../../../../src/core/agents/backend/claude/ClaudeCodeStreamNormalizer';

describe('Claude native Goal messages', () => {
  it('preserves native objective, counters, reason and session identity', () => {
    const normalizer = new ClaudeCodeStreamNormalizer({ sessionId: 's' });
    const value = { condition: 'All tests pass', iterations: 2, set_at: 42, tokens_at_start: 100, last_reason: 'One failing test' };
    expect(normalizer.transformSDKMessage({ type: 'active_goal', session_id: 's', value })).toEqual([
      { type: 'backend_event', source: 'claude-code', event: 'goal_updated', metadata: { sessionId: 's', goal: value } },
    ]);
  });

  it('forwards an explicit null as a clear instead of dropping it', () => {
    const normalizer = new ClaudeCodeStreamNormalizer({ sessionId: 's' });
    expect(normalizer.transformSDKMessage({ type: 'active_goal', session_id: 's', value: null })).toEqual([
      { type: 'backend_event', source: 'claude-code', event: 'goal_cleared', metadata: { sessionId: 's', goal: null } },
    ]);
  });
});
