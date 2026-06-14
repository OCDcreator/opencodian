/**
 * Unit tests for AgentBackendRouting fork / archive / unarchive helpers.
 */

import { AgentCapability } from '../../../../../src/core/agents/AgentCapability';
import {
  archiveBackendSession,
  forkBackendSession,
  unarchiveBackendSession,
} from '../../../../../src/core/agents/backend/AgentBackendRouting';
import type { AgentForkCapability, AgentService, AgentSessionCapability } from '../../../../../src/core/agents/backend/AgentService';
import type { AgentServiceRegistry } from '../../../../../src/core/agents/backend/AgentServiceRegistry';

function makeRegistry(adapter: Partial<AgentSessionCapability & AgentForkCapability>): AgentServiceRegistry {
  const service = adapter as unknown as AgentService;
  service.hasCapability = (cap: AgentCapability) => adapter.capabilities?.has(cap) ?? false;
  return {
    getActive: () => service,
  } as unknown as AgentServiceRegistry;
}

describe('AgentBackendRouting session lifecycle helpers', () => {
  describe('forkBackendSession', () => {
    it('returns fork result when adapter implements forkSession', async () => {
      const adapter = {
        capabilities: new Set([AgentCapability.Sessions, AgentCapability.Fork]),
        forkSession: jest.fn().mockResolvedValue({ id: 'new-1', title: 'Forked' }),
      };
      const registry = makeRegistry(adapter);

      const result = await forkBackendSession(registry, 'source-1');

      expect(result).toEqual({ id: 'new-1', title: 'Forked' });
      expect(adapter.forkSession).toHaveBeenCalledWith('source-1');
    });

    it('returns null when adapter lacks forkSession', async () => {
      const adapter = {
        capabilities: new Set([AgentCapability.Sessions]),
      };
      const registry = makeRegistry(adapter);

      const result = await forkBackendSession(registry, 'source-1');

      expect(result).toBeNull();
    });

    it('returns null when registry is null', async () => {
      const result = await forkBackendSession(null, 'source-1');
      expect(result).toBeNull();
    });

    it('returns null when forkSession throws', async () => {
      const adapter = {
        capabilities: new Set([AgentCapability.Sessions, AgentCapability.Fork]),
        forkSession: jest.fn().mockRejectedValue(new Error('boom')),
      };
      const registry = makeRegistry(adapter);

      const result = await forkBackendSession(registry, 'source-1');

      expect(result).toBeNull();
    });
  });

  describe('archiveBackendSession', () => {
    it('returns true when adapter supports archiveSession', async () => {
      const adapter = {
        capabilities: new Set([AgentCapability.Sessions]),
        archiveSession: jest.fn().mockResolvedValue(true),
      };
      const registry = makeRegistry(adapter);

      const result = await archiveBackendSession(registry, 'session-1');

      expect(result).toBe(true);
      expect(adapter.archiveSession).toHaveBeenCalledWith('session-1');
    });

    it('returns false when adapter lacks archiveSession', async () => {
      const adapter = {
        capabilities: new Set([AgentCapability.Sessions]),
      };
      const registry = makeRegistry(adapter);

      const result = await archiveBackendSession(registry, 'session-1');

      expect(result).toBe(false);
    });

    it('returns false when archiveSession throws', async () => {
      const adapter = {
        capabilities: new Set([AgentCapability.Sessions]),
        archiveSession: jest.fn().mockRejectedValue(new Error('boom')),
      };
      const registry = makeRegistry(adapter);

      const result = await archiveBackendSession(registry, 'session-1');

      expect(result).toBe(false);
    });
  });

  describe('unarchiveBackendSession', () => {
    it('returns true when adapter supports unarchiveSession', async () => {
      const adapter = {
        capabilities: new Set([AgentCapability.Sessions]),
        unarchiveSession: jest.fn().mockResolvedValue(true),
      };
      const registry = makeRegistry(adapter);

      const result = await unarchiveBackendSession(registry, 'session-1');

      expect(result).toBe(true);
      expect(adapter.unarchiveSession).toHaveBeenCalledWith('session-1');
    });

    it('returns false when adapter lacks unarchiveSession', async () => {
      const adapter = {
        capabilities: new Set([AgentCapability.Sessions]),
      };
      const registry = makeRegistry(adapter);

      const result = await unarchiveBackendSession(registry, 'session-1');

      expect(result).toBe(false);
    });

    it('returns false when unarchiveSession throws', async () => {
      const adapter = {
        capabilities: new Set([AgentCapability.Sessions]),
        unarchiveSession: jest.fn().mockRejectedValue(new Error('boom')),
      };
      const registry = makeRegistry(adapter);

      const result = await unarchiveBackendSession(registry, 'session-1');

      expect(result).toBe(false);
    });
  });
});
