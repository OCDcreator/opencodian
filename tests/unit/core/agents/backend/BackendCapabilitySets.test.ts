import { describe, expect, it } from '@jest/globals';

import { AgentCapability } from '../../../../../src/core/agents/AgentCapability';
import { OpenCode2Adapter } from '../../../../../src/core/agents/backend/OpenCode2Adapter';
import { OpenCodeAdapter } from '../../../../../src/core/agents/backend/OpenCodeAdapter';
import { PiAdapter } from '../../../../../src/core/agents/backend/pi/PiAdapter';
import { ZCodeAdapter } from '../../../../../src/core/agents/backend/zcode/ZCodeAdapter';
import type { OpenCodeService } from '../../../../../src/core/opencode/OpenCodeService';

/**
 * B5 (other-backends-audit) 2026-09-30: each backend's declared capability set
 * is locked to an explicit expected list so future capability additions are
 * deliberate, and steer wiring stays honest — TurnSteering is declared only
 * where a native steerTurn() actually exists.
 */

function expectCapabilitySet(
  actual: ReadonlySet<AgentCapability>,
  expected: readonly AgentCapability[],
): void {
  expect(actual.size).toBe(expected.length);
  for (const cap of expected) {
    expect(actual.has(cap)).toBe(true);
  }
}

function steerMethodOf(adapter: unknown): unknown {
  return (adapter as { steerTurn?: unknown }).steerTurn;
}

describe('backend capability sets', () => {
  it('legacy OpenCodeAdapter declares the full OpenCode set minus TurnSteering', () => {
    const adapter = new OpenCodeAdapter({} as unknown as OpenCodeService);

    expect(adapter.kind).toBe('opencode');
    expectCapabilitySet(adapter.capabilities, [
      AgentCapability.Chat,
      AgentCapability.Sessions,
      AgentCapability.Tools,
      AgentCapability.Mcp,
      AgentCapability.Permissions,
      AgentCapability.Fork,
      AgentCapability.Branching,
      AgentCapability.Todos,
      AgentCapability.Questions,
      AgentCapability.Models,
      AgentCapability.Subagents,
      AgentCapability.Context,
      AgentCapability.Providers,
      AgentCapability.Compaction,
      AgentCapability.CostTracking,
      AgentCapability.Thinking,
      AgentCapability.Hooks,
      AgentCapability.Config,
      AgentCapability.FileOps,
      AgentCapability.Shell,
      AgentCapability.Sharing,
      AgentCapability.Export,
      AgentCapability.Images,
      AgentCapability.AuxQuery,
      AgentCapability.InlineCompletion,
    ]);
    // No native mid-turn steer seam on the legacy HTTP/SSE adapter: the chat
    // layer must render queue-only status instead of a failing steer button.
    expect(adapter.hasCapability(AgentCapability.TurnSteering)).toBe(false);
    expect(steerMethodOf(adapter)).toBeUndefined();
  });

  it('OpenCode2Adapter declares its explicit set including native TurnSteering', () => {
    const adapter = new OpenCode2Adapter({
      workingDirectory: '/vault',
      getSettings: () => ({ mode: 'remote', executablePath: '', baseUrl: 'http://127.0.0.1:4096', password: '' }),
    });

    expect(adapter.kind).toBe('opencode2');
    expectCapabilitySet(adapter.capabilities, [
      AgentCapability.Chat,
      AgentCapability.Sessions,
      AgentCapability.Models,
      AgentCapability.Images,
      AgentCapability.Permissions,
      AgentCapability.Tools,
      AgentCapability.Thinking,
      AgentCapability.Fork,
      AgentCapability.Branching,
      AgentCapability.Compaction,
      AgentCapability.CostTracking,
      AgentCapability.Context,
      AgentCapability.Questions,
      AgentCapability.Subagents,
      AgentCapability.TurnSteering,
      AgentCapability.AuxQuery,
      AgentCapability.InlineCompletion,
    ]);
    expect(steerMethodOf(adapter)).toEqual(expect.any(Function));
  });

  it('PiAdapter declares its explicit set including native TurnSteering', () => {
    const adapter = new PiAdapter({ workingDirectory: '/vault' });

    expect(adapter.kind).toBe('pi');
    expectCapabilitySet(adapter.capabilities, [
      AgentCapability.Chat,
      AgentCapability.Sessions,
      AgentCapability.Tools,
      AgentCapability.Models,
      AgentCapability.FileOps,
      AgentCapability.Shell,
      AgentCapability.Images,
      AgentCapability.CostTracking,
      AgentCapability.Fork,
      AgentCapability.Context,
      AgentCapability.Compaction,
      AgentCapability.Thinking,
      AgentCapability.Export,
      AgentCapability.AuxQuery,
      AgentCapability.InlineCompletion,
      AgentCapability.TurnSteering,
    ]);
    expect(steerMethodOf(adapter)).toEqual(expect.any(Function));
  });

  it('ZCodeAdapter declares its explicit set without TurnSteering', () => {
    const adapter = new ZCodeAdapter();

    expect(adapter.kind).toBe('zcode');
    expectCapabilitySet(adapter.capabilities, [
      AgentCapability.Chat,
      AgentCapability.Sessions,
      AgentCapability.Fork,
      AgentCapability.Compaction,
      AgentCapability.Questions,
      AgentCapability.Permissions,
      AgentCapability.Models,
      AgentCapability.Context,
      AgentCapability.Thinking,
      AgentCapability.Images,
      AgentCapability.InlineCompletion,
      AgentCapability.AuxQuery,
    ]);
    expect(adapter.hasCapability(AgentCapability.TurnSteering)).toBe(false);
    expect(steerMethodOf(adapter)).toBeUndefined();
  });
});

describe('steerTurn on steer-capable backends', () => {
  it('OpenCode2Adapter steerTurn resolves false for a session with no active turn', async () => {
    const adapter = new OpenCode2Adapter({
      workingDirectory: '/vault',
      getSettings: () => ({ mode: 'remote', executablePath: '', baseUrl: 'http://127.0.0.1:4096', password: '' }),
    });

    await expect(adapter.steerTurn('missing-session', 'steer text')).resolves.toBe(false);
  });

  it('PiAdapter steerTurn resolves false for a session with no active run', async () => {
    const adapter = new PiAdapter({ workingDirectory: '/vault' });

    await expect(adapter.steerTurn('missing-session', 'steer text')).resolves.toBe(false);
  });
});
