/**
 * ZCodeSessionRouting.test.ts — native message hydration normalization.
 *
 * The duplicate-prevention invariant lives at this boundary: hydration maps
 * native records to stable ids, so re-running the mapping (reload/resume)
 * yields identical rows instead of duplicated history.
 */
import { describe, expect, it } from '@jest/globals';

import { AgentCapability } from '../../../../../src/core/agents/AgentCapability';
import { loadBackendSessionMessages } from '../../../../../src/core/agents/backend/AgentBackendRouting';
import type { AgentService } from '../../../../../src/core/agents/backend/AgentService';
import { AgentServiceRegistry } from '../../../../../src/core/agents/backend/AgentServiceRegistry';
import type { AgentBackendKind } from '../../../../../src/core/types/chat';

function createHistoryAdapter(kind: AgentBackendKind, messages: unknown[]): AgentService {
  return {
    kind,
    displayName: kind,
    description: '',
    capabilities: new Set<AgentCapability>([AgentCapability.Sessions]),
    status: 'connected',
    hasCapability: () => true,
    start: async () => {},
    stop: async () => {},
    dispose: () => {},
    onStatusChange: () => ({ dispose: () => {} }),
    getSessionMessages: async () => messages,
  };
}

describe('loadBackendSessionMessages — zcode hydration', () => {
  const nativeMessages = [
    {
      info: { messageId: 'msg_user_1', role: 'user', time: { created: 111 } },
      parts: [{ type: 'text', text: 'hello' }],
    },
    {
      info: { messageId: 'msg_assistant_1', role: 'assistant', time: { created: 222 } },
      parts: [{ type: 'text', text: 'world' }],
    },
  ];

  it('maps { info, parts } records to stable ids (info.messageId) with roles and times', async () => {
    const registry = new AgentServiceRegistry();
    registry.register(createHistoryAdapter('zcode', nativeMessages));
    registry.setEnabled('zcode');

    const rows = await loadBackendSessionMessages(registry, { backend: 'zcode' }, 'sess_a');
    expect(rows).toEqual([
      {
        id: 'msg_user_1',
        role: 'user',
        createdAt: 111,
        payload: JSON.stringify({ message: nativeMessages[0].info, parts: nativeMessages[0].parts }, null, 2),
      },
      {
        id: 'msg_assistant_1',
        role: 'assistant',
        createdAt: 222,
        payload: JSON.stringify({ message: nativeMessages[1].info, parts: nativeMessages[1].parts }, null, 2),
      },
    ]);
  });

  it('is idempotent: repeated hydration maps identical rows (no duplicated history)', async () => {
    const registry = new AgentServiceRegistry();
    registry.register(createHistoryAdapter('zcode', nativeMessages));
    registry.setEnabled('zcode');

    const first = await loadBackendSessionMessages(registry, { backend: 'zcode' }, 'sess_a');
    const second = await loadBackendSessionMessages(registry, { backend: 'zcode' }, 'sess_a');
    expect(second).toEqual(first);
    expect(new Set(first.map((row) => row.id)).size).toBe(first.length);
  });

  it('keeps the opencode id field working on the shared envelope branch', async () => {
    const registry = new AgentServiceRegistry();
    registry.register(createHistoryAdapter('opencode', [
      { info: { id: 'msg_oc_1', role: 'user', time: { created: 9 } }, parts: [] },
    ]));
    registry.setEnabled('opencode');

    const rows = await loadBackendSessionMessages(registry, { backend: 'opencode' }, 'sess_oc');
    expect(rows[0].id).toBe('msg_oc_1');
  });
});
