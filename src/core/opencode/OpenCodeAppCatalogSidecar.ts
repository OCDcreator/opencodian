const OPEN_CODE_APP_AGENTS_PROMISE_KEY = Symbol('opencodian.openCodeAppAgentsPromise');

type OpenCodeAppAgentsCarrier = {
  [OPEN_CODE_APP_AGENTS_PROMISE_KEY]?: Promise<unknown>;
};

export function getAttachedOpenCodeAppAgents(value: unknown): Promise<unknown> | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  return (value as OpenCodeAppAgentsCarrier)[OPEN_CODE_APP_AGENTS_PROMISE_KEY];
}

export function attachOpenCodeAppAgents(value: unknown, agentsPromise: Promise<unknown>): unknown {
  if (!value || typeof value !== 'object') {
    return value;
  }

  try {
    Object.defineProperty(value, OPEN_CODE_APP_AGENTS_PROMISE_KEY, {
      configurable: true,
      enumerable: false,
      value: agentsPromise,
    });
  } catch {
    // Some SDK return shapes may be frozen; the original result remains usable without the sidecar.
  }

  return value;
}
