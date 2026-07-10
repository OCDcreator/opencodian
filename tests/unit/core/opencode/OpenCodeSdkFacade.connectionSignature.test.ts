import type { CreateSdkClientOptions } from '../../../../src/core/opencode/createSdkClient';
import { OpenCodeSdkFacade } from '../../../../src/core/opencode/OpenCodeSdkFacade';
import type { SdkOpencodeClient } from '../../../../src/core/opencode/sdkTypes';

jest.mock('@opencode-ai/sdk/v2/client', () => ({
  createOpencodeClient: jest.fn(),
}), { virtual: true });

describe('OpenCodeSdkFacade connection signature', () => {
  it('returns an opaque generation that advances only when effective connection options change', () => {
    let options: CreateSdkClientOptions = {
      baseUrl: 'http://127.0.0.1:4196',
      directory: '/vault',
      authHeaders: { Authorization: 'Bearer initial-secret' },
    };
    const facade = new OpenCodeSdkFacade(
      () => options,
      () => ({} as SdkOpencodeClient),
    );

    expect(facade.getConnectionSignature()).toBe('connection-1');
    expect(facade.getConnectionSignature()).toBe('connection-1');

    options = {
      ...options,
      authHeaders: { Authorization: 'Bearer changed-secret' },
    };

    expect(facade.getConnectionSignature()).toBe('connection-2');
    expect(facade.getConnectionSignature()).not.toContain('secret');

    const connectionIdentity = (facade as unknown as { connectionIdentity: unknown }).connectionIdentity;
    expect(connectionIdentity).toEqual(expect.objectContaining({
      authHeadersFingerprint: expect.any(String),
    }));
    expect(JSON.stringify(connectionIdentity)).not.toContain('changed-secret');
  });

  it('tracks every auth header case-insensitively without retaining its raw value', () => {
    let options: CreateSdkClientOptions = {
      baseUrl: 'http://127.0.0.1:4196',
      directory: '/vault',
      authHeaders: {
        Authorization: 'Bearer initial-secret',
        'X-OpenCode-Session': 'first-session-secret',
      },
    };
    const facade = new OpenCodeSdkFacade(
      () => options,
      () => ({} as SdkOpencodeClient),
    );

    expect(facade.getConnectionSignature()).toBe('connection-1');

    options = {
      ...options,
      authHeaders: {
        authorization: 'Bearer initial-secret',
        'x-opencode-session': 'first-session-secret',
      },
    };
    expect(facade.getConnectionSignature()).toBe('connection-1');

    options = {
      ...options,
      authHeaders: {
        ...options.authHeaders,
        'x-opencode-session': 'second-session-secret',
      },
    };
    expect(facade.getConnectionSignature()).toBe('connection-2');

    const connectionIdentity = (facade as unknown as { connectionIdentity: unknown }).connectionIdentity;
    expect(JSON.stringify(connectionIdentity)).not.toContain('second-session-secret');
  });

  it('records a temporary connection used by an SDK call before it returns to the original options', async () => {
    let releaseHealth: (() => void) | undefined;
    const healthGet = jest.fn(() => new Promise<void>((resolve) => {
      releaseHealth = resolve;
    }));
    let options: CreateSdkClientOptions = {
      baseUrl: 'http://127.0.0.1:4196',
      directory: '/vault-a',
      authHeaders: { Authorization: 'Bearer initial-secret' },
    };
    const facade = new OpenCodeSdkFacade(
      () => options,
      () => ({ v2: { health: { get: healthGet } } } as SdkOpencodeClient),
    );

    expect(facade.getConnectionSignature()).toBe('connection-1');
    options = { ...options, directory: '/vault-b' };
    const pendingHealth = facade.v2.health.get();
    expect(healthGet).toHaveBeenCalledTimes(1);

    options = { ...options, directory: '/vault-a' };
    if (!releaseHealth) {
      throw new Error('Expected the SDK health request to be pending.');
    }
    releaseHealth();
    await pendingHealth;

    expect(facade.getConnectionSignature()).toBe('connection-3');
  });
});
