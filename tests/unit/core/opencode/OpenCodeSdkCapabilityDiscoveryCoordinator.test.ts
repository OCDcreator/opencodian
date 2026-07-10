import {
  OpenCodeSdkCapabilityDiscoveryCoordinator,
  type OpenCodeSdkCapabilityFacadeAccessor,
} from '../../../../src/core/opencode/OpenCodeSdkCapabilityDiscoveryCoordinator';
import type { OpenCodeSdkCapabilityDefinition } from '../../../../src/core/opencode/OpenCodeSdkCapabilityRegistry';

/**
 * Build a tiny fake facade + a minimal registry subset so we can assert the
 * coordinator's probing semantics deterministically without standing up the
 * full 188-entry registry. Each fake method is a jest.fn so we can assert
 * call counts (state-changing probes must never invoke their action).
 */
interface FakeFacade {
  v2: {
    health: { get: jest.Mock };
    location: { get: jest.Mock };
    capabilities: { get: jest.Mock };
    session: {
      create: jest.Mock;
      list: jest.Mock;
    };
    event: { subscribe: jest.Mock };
  };
}

function buildFakeFacade(): { facade: FakeFacade; calls: Record<string, jest.Mock[]> } {
  const calls: Record<string, jest.Mock[]> = { read: [], presence: [], stateChanging: [] };

  const healthGet = jest.fn().mockResolvedValue({ status: 'ok' });
  const locationGet = jest.fn().mockResolvedValue({ cwd: '/vault' });
  const capabilitiesGet = jest.fn().mockResolvedValue({ capabilities: [] });
  const sessionCreate = jest.fn().mockResolvedValue({ id: 'session-1' });
  const sessionList = jest.fn().mockResolvedValue([]);
  const eventSubscribe = jest.fn().mockResolvedValue({ stream: (async function* () { /* noop */ })() });

  calls.read.push(healthGet, locationGet, capabilitiesGet, sessionList);
  calls.stateChanging.push(sessionCreate);
  calls.presence.push(eventSubscribe);

  const facade: FakeFacade = {
    v2: {
      health: { get: healthGet },
      location: { get: locationGet },
      capabilities: { get: capabilitiesGet },
      session: { create: sessionCreate, list: sessionList },
      event: { subscribe: eventSubscribe },
    },
  };
  return { facade, calls };
}

function buildTestRegistry(): OpenCodeSdkCapabilityDefinition[] {
  return [
    { id: 'v2.health.get', sdkPath: ['v2', 'health', 'get'], category: 'v2-core', surface: 'settings', risk: 'read-only', defaultGate: true, serverProbe: 'read', fallbackPolicy: 'legacy-fallback', minimumServerHint: 'OpenCode server 1.17+', description: 'Read v2 server health.' },
    { id: 'v2.location.get', sdkPath: ['v2', 'location', 'get'], category: 'v2-core', surface: 'settings', risk: 'read-only', defaultGate: true, serverProbe: 'read', fallbackPolicy: 'legacy-fallback', minimumServerHint: 'OpenCode server 1.17+', description: 'Read v2 location.' },
    { id: 'experimental.capabilities.get', sdkPath: ['v2', 'capabilities', 'get'], category: 'experimental', surface: 'diagnostic', risk: 'read-only', defaultGate: true, serverProbe: 'read', fallbackPolicy: 'unsupported-visible', minimumServerHint: undefined, description: 'Read capabilities.' },
    { id: 'v2.session.list', sdkPath: ['v2', 'session', 'list'], category: 'v2-session', surface: 'chat', risk: 'read-only', defaultGate: true, serverProbe: 'read', fallbackPolicy: 'legacy-fallback', minimumServerHint: 'OpenCode server 1.17+', description: 'List v2 sessions.' },
    { id: 'v2.session.create', sdkPath: ['v2', 'session', 'create'], category: 'v2-session', surface: 'chat', risk: 'state-changing', defaultGate: false, serverProbe: 'none', fallbackPolicy: 'experimental-gated', minimumServerHint: 'OpenCode server 1.17+', description: 'Create a v2 session.' },
    { id: 'v2.event.subscribe', sdkPath: ['v2', 'event', 'subscribe'], category: 'v2-runtime', surface: 'chat', risk: 'stream', defaultGate: false, serverProbe: 'presence', fallbackPolicy: 'legacy-fallback', minimumServerHint: 'OpenCode server 1.17+', description: 'Subscribe to v2 events.' },
  ];
}

describe('OpenCodeSdkCapabilityDiscoveryCoordinator', () => {
  let accessor: OpenCodeSdkCapabilityFacadeAccessor;
  let facade: FakeFacade;

  beforeEach(() => {
    ({ facade } = buildFakeFacade());
    accessor = () => facade;
  });

  describe('read-probe ordering', () => {
    it('queries read methods (health, location, capabilities, session.list) during refresh', async () => {
      const coordinator = new OpenCodeSdkCapabilityDiscoveryCoordinator(buildTestRegistry(), { getFacade: accessor });
      const snapshot = await coordinator.refresh();
      expect(snapshot.entries).toHaveLength(6);

      // All four read-probe methods must have been invoked exactly once.
      expect(facade.v2.health.get).toHaveBeenCalledTimes(1);
      expect(facade.v2.location.get).toHaveBeenCalledTimes(1);
      expect(facade.v2.capabilities.get).toHaveBeenCalledTimes(1);
      expect(facade.v2.session.list).toHaveBeenCalledTimes(1);
    });

    it('marks successfully probed read entries as available', async () => {
      const coordinator = new OpenCodeSdkCapabilityDiscoveryCoordinator(buildTestRegistry(), { getFacade: accessor });
      const snapshot = await coordinator.refresh();
      const health = snapshot.entries.find((e) => e.id === 'v2.health.get');
      expect(health?.availability.kind).toBe('available');
    });
  });

  describe('endpoint-not-found vs transport failure', () => {
    it('treats an "is unavailable" probe error as unsupported-by-server', async () => {
      facade.v2.health.get.mockRejectedValueOnce(new Error('OpenCode SDK path v2.health.get is unavailable'));
      const coordinator = new OpenCodeSdkCapabilityDiscoveryCoordinator(buildTestRegistry(), { getFacade: accessor });
      const snapshot = await coordinator.refresh();
      const health = snapshot.entries.find((e) => e.id === 'v2.health.get');
      expect(health?.availability.kind).toBe('unsupported-by-server');
      const unavailable = health?.availability as { reason?: string; minimumServerHint?: string };
      expect(typeof unavailable.reason).toBe('string');
      expect(unavailable.minimumServerHint).toBe('OpenCode server 1.17+');
    });

    it('treats a transport/transient probe error as unknown (not unsupported)', async () => {
      facade.v2.location.get.mockRejectedValueOnce(new Error('fetch failed: ECONNREFUSED'));
      const coordinator = new OpenCodeSdkCapabilityDiscoveryCoordinator(buildTestRegistry(), { getFacade: accessor });
      const snapshot = await coordinator.refresh();
      const location = snapshot.entries.find((e) => e.id === 'v2.location.get');
      expect(location?.availability.kind).toBe('unknown');
    });
  });

  describe('state-changing safety', () => {
    it('never invokes a state-changing method as a probe (presence-only)', async () => {
      const coordinator = new OpenCodeSdkCapabilityDiscoveryCoordinator(buildTestRegistry(), { getFacade: accessor });
      await coordinator.refresh();
      // v2.session.create is state-changing; it must NEVER be called by discovery.
      expect(facade.v2.session.create).not.toHaveBeenCalled();
    });

    it('reports a state-changing entry as unknown (cannot safely confirm server support)', async () => {
      const coordinator = new OpenCodeSdkCapabilityDiscoveryCoordinator(buildTestRegistry(), { getFacade: accessor });
      const snapshot = await coordinator.refresh();
      const create = snapshot.entries.find((e) => e.id === 'v2.session.create');
      // gate is false by default → disabled-by-user takes precedence over the unknown server
      expect(create?.availability.kind).toBe('disabled-by-user');
    });

    it('still reports unknown (not available) for a state-changing entry when gate is open', async () => {
      const coordinator = new OpenCodeSdkCapabilityDiscoveryCoordinator(buildTestRegistry(), {
        getFacade: accessor,
        resolveGate: () => true,
      });
      const snapshot = await coordinator.refresh();
      const create = snapshot.entries.find((e) => e.id === 'v2.session.create');
      expect(create?.availability.kind).toBe('unknown');
      expect(facade.v2.session.create).not.toHaveBeenCalled();
    });
  });

  describe('stream / presence entries', () => {
    it('confirms presence without invoking a stream action', async () => {
      const coordinator = new OpenCodeSdkCapabilityDiscoveryCoordinator(buildTestRegistry(), {
        getFacade: accessor,
        resolveGate: () => true,
      });
      const snapshot = await coordinator.refresh();
      const eventSub = snapshot.entries.find((e) => e.id === 'v2.event.subscribe');
      // presence-only: not invoked
      expect(facade.v2.event.subscribe).not.toHaveBeenCalled();
      expect(eventSub?.availability.kind).toBe('available');
    });
  });

  describe('SDK presence', () => {
    it('returns unsupported-by-sdk when the facade is null', async () => {
      const coordinator = new OpenCodeSdkCapabilityDiscoveryCoordinator(buildTestRegistry(), {
        getFacade: () => null,
      });
      const snapshot = await coordinator.refresh();
      for (const entry of snapshot.entries) {
        expect(entry.availability.kind).toBe('unsupported-by-sdk');
      }
    });

    it('returns unsupported-by-sdk when the path does not resolve to a function', async () => {
      const facadeMissingMethod = { v2: { health: {} } };
      const coordinator = new OpenCodeSdkCapabilityDiscoveryCoordinator(buildTestRegistry(), {
        getFacade: () => facadeMissingMethod,
      });
      const snapshot = await coordinator.refresh();
      const health = snapshot.entries.find((e) => e.id === 'v2.health.get');
      expect(health?.availability.kind).toBe('unsupported-by-sdk');
    });
  });

  describe('snapshot caching', () => {
    it('getSnapshot returns the cached refresh result without re-probing', async () => {
      const coordinator = new OpenCodeSdkCapabilityDiscoveryCoordinator(buildTestRegistry(), { getFacade: accessor });
      const first = await coordinator.refresh();
      expect(facade.v2.health.get).toHaveBeenCalledTimes(1);

      const cached = coordinator.getSnapshot();
      expect(cached).toBe(first);
      // no additional probe invocation
      expect(facade.v2.health.get).toHaveBeenCalledTimes(1);
    });

    it('getSnapshot builds a presence-only snapshot before the first refresh', () => {
      const coordinator = new OpenCodeSdkCapabilityDiscoveryCoordinator(buildTestRegistry(), { getFacade: accessor });
      const snapshot = coordinator.getSnapshot();
      expect(snapshot.entries.length).toBe(6);
      // read-probe entries show unknown server support until refreshed
      const health = snapshot.entries.find((e) => e.id === 'v2.health.get');
      expect(health?.availability.kind).toBe('unknown');
    });

    it('invalidate forces the next getSnapshot to rebuild', async () => {
      const coordinator = new OpenCodeSdkCapabilityDiscoveryCoordinator(buildTestRegistry(), { getFacade: accessor });
      const first = await coordinator.refresh();
      coordinator.invalidate();
      const rebuilt = coordinator.getSnapshot();
      expect(rebuilt).not.toBe(first);
    });
  });
});
