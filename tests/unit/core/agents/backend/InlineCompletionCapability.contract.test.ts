/**
 * Contract tests for the R-C3 capability wiring across the four backends
 * (docs/requirements/flowtext-parity.md §6.5 — backend-agnostic, honest
 * capability gaps; design §3.1/§3.6):
 *
 * - every backend adapter declares (or, for OpenCode whose capability set is
 *   exhaustive, implements) the inline-completion capability;
 * - the feature-layer host adapter surfaces the capability only when the
 *   backend declares it, so an undeclaring backend is honestly absent;
 * - the write audit on completion turns reuses the shared
 *   `findWriteToolCalls`, never a second classifier.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from '@jest/globals';

import { AgentCapability, hasCapability } from '../../../../../src/core/agents/AgentCapability';
import { OPENCODE_FULL_CAPABILITIES } from '../../../../../src/core/agents/AgentCapability';
import {
  findWriteToolCalls,
} from '../../../../../src/core/agents/backend/AgentAuxQueryCapability';
import {
  buildInlineCompletionTurnPrompt,
  INLINE_COMPLETION_PREFIX_WINDOW_CHARS,
  INLINE_COMPLETION_SUFFIX_WINDOW_CHARS,
  INLINE_COMPLETION_TURN_TIMEOUT_MS,
} from '../../../../../src/core/agents/backend/AgentInlineCompletionCapability';
import type { AgentBackendKind } from '../../../../../src/core/types/chat';

const WT_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');

/** The four adapter sources; each must expose the capability honestly. */
const ADAPTER_SOURCES: readonly { readonly file: string; readonly backend: AgentBackendKind }[] = [
  { file: 'src/core/agents/backend/OpenCodeAdapter.ts', backend: 'opencode' },
  { file: 'src/core/agents/backend/ClaudeCodeAdapter.ts', backend: 'claude-code' },
  { file: 'src/core/agents/backend/CodexAdapter.ts', backend: 'codex' },
  { file: 'src/core/agents/backend/pi/PiAdapter.ts', backend: 'pi' },
];

function readSource(file: string): string {
  return fs.readFileSync(path.resolve(WT_ROOT, file), 'utf8');
}

describe('inline-completion capability exposure matrix (§6.5)', () => {
  it('declares the capability id on the shared enum', () => {
    expect(AgentCapability.InlineCompletion).toBe('inline-completion');
  });

  it('each of the four adapter sources wires the capability', () => {
    for (const adapter of ADAPTER_SOURCES) {
      const source = readSource(adapter.file);
      // OpenCode's capability set is the exhaustive enum, so its evidence is
      // the capability interface; the other three declare the id explicitly.
      const capabilityMarker = adapter.backend === 'opencode'
        ? 'AgentInlineCompletionCapability'
        : 'AgentCapability.InlineCompletion';
      expect(source.includes(capabilityMarker)).toBe(true);
      expect(source.includes('startInlineCompletionSession')).toBe(true);
    }
  });

  it('OpenCode adapter implements the capability interface', () => {
    // OpenCode's capability set is exhaustive (OPENCODE_FULL_CAPABILITIES),
    // so the honest-exposure evidence is the implements clause + method.
    const source = readSource('src/core/agents/backend/OpenCodeAdapter.ts');
    expect(source).toMatch(/AgentInlineCompletionCapability\b/);
    expect(source).toMatch(/startInlineCompletionSession\(/);
  });

  it('the exhaustive OpenCode set covers the new capability', () => {
    expect(hasCapability(OPENCODE_FULL_CAPABILITIES, AgentCapability.InlineCompletion)).toBe(true);
  });
});

describe('feature-layer host wiring', () => {
  it('resolves the completion capability only when the backend declares it', async () => {
    // The wiring lives in InlineEditPluginHost.resolveAdapter, which gates on
    // hasCapability(adapter.capabilities, AgentCapability.InlineCompletion).
    // Import lazily to keep this file's subject the capability contract.
    const { createInlineEditPluginHost } = await import(
      '../../../../../src/features/inline-edit/InlineEditPluginHost'
    );
    const registryStub = {
      getActiveKind: () => 'opencode' as AgentBackendKind,
      get: () => ({
        kind: 'opencode',
        displayName: 'OpenCode',
        capabilities: new Set<AgentCapability>([AgentCapability.AuxQuery]),
        hasCapability: (cap: AgentCapability) => cap === AgentCapability.AuxQuery,
      }),
    };
    const bridge = {
      getVaultPath: () => '/vault',
      getLocale: () => 'en' as const,
      getRegistry: () => registryStub as never,
      getActiveChatBackend: () => null,
      getActiveChatModel: () => null,
      getSettings: () => ({
        enabled: true,
        modelOverrides: {},
        effortOverrides: {},
        presetPrompts: [],
        maxConcurrentEdits: 3,
        documentModeEnabled: true,
      }),
    };
    const host = createInlineEditPluginHost(bridge as never);
    const adapterWithoutCompletion = host.resolveAdapter();
    expect(adapterWithoutCompletion?.getInlineCompletion?.() ?? null).toBeNull();

    // Declaring backend: the adapter is surfaced as the capability.
    registryStub.get = () => ({
      kind: 'opencode',
      displayName: 'OpenCode',
      capabilities: new Set<AgentCapability>([AgentCapability.AuxQuery, AgentCapability.InlineCompletion]),
      hasCapability: (cap: AgentCapability) =>
        cap === AgentCapability.AuxQuery || cap === AgentCapability.InlineCompletion,
    }) as never;
    const adapterWithCompletion = host.resolveAdapter();
    const capability = adapterWithCompletion?.getInlineCompletion?.() ?? null;
    expect(capability).not.toBeNull();
  });
});

describe('shared write audit on completion turns', () => {
  it('classifies write-class tool calls via findWriteToolCalls', () => {
    expect(findWriteToolCalls([{ name: 'Write' }, { name: 'read' }])).toEqual(['Write']);
    expect(findWriteToolCalls([{ name: 'mcp__fs_write', kind: 'mcp' }])).toEqual(['mcp__fs_write']);
    expect(findWriteToolCalls([{ name: 'read' }, { name: 'grep' }])).toEqual([]);
  });
});

describe('shared turn prompt constants', () => {
  it('fixes the request window sizes and the turn timeout', () => {
    expect(INLINE_COMPLETION_PREFIX_WINDOW_CHARS).toBe(4000);
    expect(INLINE_COMPLETION_SUFFIX_WINDOW_CHARS).toBe(1000);
    expect(INLINE_COMPLETION_TURN_TIMEOUT_MS).toBe(4000);
  });

  it('builds a backend-agnostic turn prompt carrying the full request', () => {
    const prompt = buildInlineCompletionTurnPrompt({
      prefix: 'PREFIX',
      suffix: 'SUFFIX',
      maxChars: 250,
    });
    expect(prompt).toContain('PREFIX');
    expect(prompt).toContain('SUFFIX');
    expect(prompt).toContain('250');
    expect(prompt).toContain('<^.^>');
    // The completion protocol is separate from inline-edit's XML contract.
    expect(prompt).not.toContain('<replacement>');
    expect(prompt).not.toContain('<insertion>');
    expect(prompt).not.toContain('<editor_cursor>');
  });
});
