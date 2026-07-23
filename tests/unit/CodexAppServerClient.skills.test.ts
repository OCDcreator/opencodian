/**
 * CodexAppServerClient tests — focused on the `skills/list` route and the
 * `skills/changed` notification subscription.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { CodexAppServerClient } from '../../src/core/agents/backend/CodexAppServerClient';

type Client = CodexAppServerClient;

function createClientWithMocks(overrides: Partial<Record<keyof Client, (...args: any[]) => any>> = {}): Client {
  const client = Object.create(CodexAppServerClient.prototype) as Client;
  const handlers: Record<string, Array<(params: unknown) => void>> = {};
  (client as any).start = jest.fn().mockResolvedValue(undefined);
  (client as any).request = jest.fn().mockResolvedValue(undefined);
  (client as any).addNotificationHandler = jest.fn((method: string, handler: (params: unknown) => void) => {
    (handlers[method] ??= []).push(handler);
  });
  (client as any).removeNotificationHandler = jest.fn((method: string, handler: (params: unknown) => void) => {
    handlers[method] = (handlers[method] ?? []).filter((h) => h !== handler);
  });
  (client as any).__handlers = handlers;
  Object.assign(client, overrides);
  return client;
}

describe('CodexAppServerClient — listSkills()', () => {
  it('requests skills/list and returns the data array', async () => {
    const client = createClientWithMocks({
      request: jest.fn().mockResolvedValue({ data: [{ name: 'code-review', description: 'Review code', enabled: true, scope: 'project' }] }),
    } as any);

    const skills = await client.listSkills({ cwd: '/vault' });

    expect((client as any).request).toHaveBeenCalledWith('skills/list', { cwd: '/vault' });
    expect(skills).toEqual([{ name: 'code-review', description: 'Review code', enabled: true, scope: 'project' }]);
  });

  it('passes forceReload when requested', async () => {
    const client = createClientWithMocks({
      request: jest.fn().mockResolvedValue({ data: [] }),
    } as any);

    await client.listSkills({ cwd: '/vault', forceReload: true });

    expect((client as any).request).toHaveBeenCalledWith('skills/list', { cwd: '/vault', forceReload: true });
  });

  it('omits params entirely when no options are given', async () => {
    const client = createClientWithMocks({
      request: jest.fn().mockResolvedValue({ data: [] }),
    } as any);

    await client.listSkills();

    expect((client as any).request).toHaveBeenCalledWith('skills/list', {});
  });

  it('accepts a bare array response shape', async () => {
    const client = createClientWithMocks({
      request: jest.fn().mockResolvedValue([{ name: 'bare-skill' }]),
    } as any);

    const skills = await client.listSkills();

    expect(skills).toEqual([{ name: 'bare-skill' }]);
  });

  it('returns an empty array when the route rejects', async () => {
    const client = createClientWithMocks({
      request: jest.fn().mockRejectedValue(new Error('method not found')),
    } as any);

    const skills = await client.listSkills({ cwd: '/vault' });

    expect(skills).toEqual([]);
  });
});

describe('CodexAppServerClient — subscribeToSkillsChanged()', () => {
  it('registers a skills/changed handler and returns an unsubscribe function', () => {
    const client = createClientWithMocks();
    const handler = jest.fn();

    const unsubscribe = client.subscribeToSkillsChanged(handler);

    expect((client as any).addNotificationHandler).toHaveBeenCalledWith('skills/changed', expect.any(Function));
    expect(typeof unsubscribe).toBe('function');

    unsubscribe();

    expect((client as any).removeNotificationHandler).toHaveBeenCalledWith('skills/changed', expect.any(Function));
  });

  it('invokes the user handler (with no payload contract) when skills/changed fires', () => {
    const client = createClientWithMocks();
    const handler = jest.fn();

    client.subscribeToSkillsChanged(handler);
    const handlers = (client as any).__handlers['skills/changed'] as Array<(p: unknown) => void>;
    expect(handlers).toHaveLength(1);

    handlers[0]({ some: 'payload' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe stops further invocations', () => {
    const client = createClientWithMocks();
    const handler = jest.fn();

    const unsubscribe = client.subscribeToSkillsChanged(handler);
    unsubscribe();

    const handlers = (client as any).__handlers['skills/changed'] as Array<(p: unknown) => void>;
    expect(handlers).toHaveLength(0);

    handlers.push?.(() => undefined);
    handler();
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
