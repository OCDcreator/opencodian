import type { App } from 'obsidian';
import { Platform } from 'obsidian';
import { join } from 'path';

import { ObsidianToolingCoordinator } from '../../../../src/app/obsidianTooling/ObsidianToolingCoordinator';
import { buildGateScript } from '../../../../src/core/obsidianTooling/obsidianGateScript';
import {
  OBSIDIAN_TOOLING_DIR,
  OBSIDIAN_TOOLING_REQUESTS_DIRNAME,
} from '../../../../src/core/obsidianTooling/obsidianToolingCatalog';

type WriteRecord = { path: string; data: string };

function createMockApp(): { app: App; writes: WriteRecord[] } {
  const writes: WriteRecord[] = [];
  const adapter = {
    getBasePath: () => '/vault',
    exists: async (path: string) => writes.some((w) => w.path === path),
    read: async (path: string) => {
      const hit = writes.find((w) => w.path === path);
      if (!hit) throw new Error('missing: ' + path);
      return hit.data;
    },
    write: async (path: string, data: string) => {
      writes.push({ path, data });
    },
    mkdir: async () => undefined,
    list: async () => ({ files: [] as string[], folders: [] as string[] }),
    stat: async () => null,
    remove: async () => undefined,
  };
  return {
    app: { vault: { adapter } } as unknown as App,
    writes,
  };
}

const noopProbe = () => Promise.resolve({ status: 'available', version: '1.13.7' } as const);

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('ObsidianToolingCoordinator (R-B4)', () => {
  (Platform as { isDesktopApp: boolean }).isDesktopApp = true;
  (Platform as { isWin: boolean }).isWin = false;

  it('mode off is a zero-cost steady state: no writes, no injection', async () => {
    const { app, writes } = createMockApp();
    const coordinator = new ObsidianToolingCoordinator({ app, getMode: () => 'off', probe: noopProbe });
    await coordinator.applySettings();
    expect(writes).toEqual([]);
    expect(coordinator.planInjection({ conversationId: 'c1', messages: [] })).toBeNull();
    coordinator.dispose();
  });

  it('mode cli provisions the gate script and injects once per epoch', async () => {
    const { app, writes } = createMockApp();
    const coordinator = new ObsidianToolingCoordinator({ app, getMode: () => 'cli', probe: noopProbe });
    await coordinator.applySettings();
    await flushMicrotasks();

    const gateWrite = writes.find((w) => w.path.endsWith('obsidian-gate'));
    expect(gateWrite).toBeDefined();
    expect(gateWrite!.data).toBe(buildGateScript({ waitSeconds: 90 }));
    expect(coordinator.getStatus().gateReady).toBe(true);

    const messages = [{ role: 'user' as const, content: 'turn' }];
    const first = coordinator.planInjection({ conversationId: 'c1', messages });
    expect(first?.text).toContain('[OPENCODIAN OBSIDIAN TOOLING]');
    expect(first?.text).toContain(OBSIDIAN_TOOLING_DIR);

    const second = coordinator.planInjection({ conversationId: 'c1', messages });
    expect(second).toBeNull();
    coordinator.dispose();
  });

  it('injects the honest unavailable block when the CLI probe fails', async () => {
    const { app } = createMockApp();
    const coordinator = new ObsidianToolingCoordinator({
      app,
      getMode: () => 'cli',
      probe: () => Promise.resolve({ status: 'not-found', detail: 'obsidian: command not found' }),
    });
    await coordinator.applySettings();
    await flushMicrotasks();

    const plan = coordinator.planInjection({ conversationId: 'c1', messages: [] });
    expect(plan?.text).toContain('UNAVAILABLE');
    expect(plan?.text).toContain('obsidian: command not found');
    coordinator.dispose();
  });

  it('stays unavailable on unsupported platforms (Windows this milestone)', async () => {
    (Platform as { isWin: boolean }).isWin = true;
    try {
      const { app, writes } = createMockApp();
      const coordinator = new ObsidianToolingCoordinator({ app, getMode: () => 'cli', probe: noopProbe });
      await coordinator.applySettings();
      await flushMicrotasks();

      expect(writes).toEqual([]);
      expect(coordinator.getStatus().platformSupported).toBe(false);
      const plan = coordinator.planInjection({ conversationId: 'c1', messages: [] });
      expect(plan?.text).toContain('UNAVAILABLE');
      coordinator.dispose();
    } finally {
      (Platform as { isWin: boolean }).isWin = false;
    }
  });

  it('applySettings tearing down to off stops producing injections', async () => {
    const { app } = createMockApp();
    let mode: 'off' | 'cli' = 'cli';
    const coordinator = new ObsidianToolingCoordinator({ app, getMode: () => mode, probe: noopProbe });
    await coordinator.applySettings();
    await flushMicrotasks();
    expect(coordinator.planInjection({ conversationId: 'c1', messages: [] })).not.toBeNull();

    mode = 'off';
    await coordinator.applySettings();
    expect(coordinator.planInjection({ conversationId: 'c1', messages: [] })).toBeNull();
    coordinator.dispose();
  });

  it('request dir naming matches the gate script contract', () => {
    expect(join(OBSIDIAN_TOOLING_DIR, OBSIDIAN_TOOLING_REQUESTS_DIRNAME)).toBe(
      '.opencodian/obsidian-tooling/requests',
    );
  });
});
