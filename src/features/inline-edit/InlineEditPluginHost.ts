/**
 * InlineEditPluginHost — the plugin-side implementation of `InlineEditHost`.
 *
 * The plugin main class owns the chat view reference and the agent registry, so
 * it is the only place that can answer "which backend and model does inline edit
 * use right now?". This module turns those references into the small host
 * contract the controller depends on, which keeps `main.ts` to a few lines and
 * makes the resolution rules unit-testable.
 *
 * Resolution order (docs/requirements/inline-edit.md §7.1 and §9):
 *   1. backend  — the active chat tab's backend, else the registry's active adapter
 *   2. model    — `inlineEditModelOverrides[kind]`, else the active chat tab's
 *                 model, else `null` (let the backend pick its default)
 *
 * An explicitly configured override that does not parse is reported as an error
 * instead of silently falling back to a default model.
 */

import { AgentCapability, hasCapability } from '../../core/agents/AgentCapability';
import type { AgentAuxQueryCapability, BackendModelSelection } from '../../core/agents/backend/AgentAuxQueryCapability';
import type { AgentServiceRegistry } from '../../core/agents/backend/AgentServiceRegistry';
import type { AgentBackendKind } from '../../core/types/chat';
import type {
  InlineEditChoice,
  InlineEditContextFile,
  InlineEditHost,
  InlineEditHostAdapter,
  InlineEditModelSelectionLabel,
} from './InlineEditHost';

/** Settings slice inline edit reads. */
export interface InlineEditSettingsSlice {
  readonly enabled: boolean;
  readonly modelOverrides: Partial<Record<AgentBackendKind, string>>;
  readonly effortOverrides: Partial<Record<AgentBackendKind, string>>;
}

/** Everything the host needs from the plugin, injected so it stays testable. */
export interface InlineEditPluginBridge {
  getVaultPath(): string;
  getLocale(): 'en' | 'zh';
  getRegistry(): AgentServiceRegistry | null;
  /** Backend of the active chat tab; `null` when no chat tab is open. */
  getActiveChatBackend(): AgentBackendKind | null;
  /** Effective `{ provider, model }` of the active chat tab; `null` when unknown. */
  getActiveChatModel(): { provider: string; model: string } | null;
  getSettings(): InlineEditSettingsSlice;
  /**
   * Optional backend-specific availability check for an explicit override.
   * When absent only the override's syntax is validated.
   */
  isModelAvailable?(kind: AgentBackendKind, selection: BackendModelSelection): boolean;
  /** Model choices for the picker; a resolved `null` hides model rows. */
  listModels?(kind: AgentBackendKind): Promise<readonly InlineEditChoice[] | null>;
  /** Effort levels for the picker; `null`/absent hides the effort chip. */
  listEfforts?(kind: AgentBackendKind): readonly InlineEditChoice[] | null;
  /** Persist the model override (`null` clears the entry). */
  setModelOverride?(kind: AgentBackendKind, ref: string | null): Promise<void>;
  /** Persist the effort override (`null` clears the entry). */
  setEffortOverride?(kind: AgentBackendKind, id: string | null): Promise<void>;
  /**
   * Resolve a provider icon element for the model chip / menu rows, rendered
   * the same way as the main composer model selector. `null` falls back to a
   * generic lucide glyph.
   */
  createProviderIcon?(providerId: string, size: number): HTMLElement | null;
  /** Vault notes offered by the "add context" picker; `null` hides the affordance. */
  listContextFiles?(): readonly InlineEditContextFile[] | null;
}

/** Build the host the controller uses. */
export function createInlineEditPluginHost(bridge: InlineEditPluginBridge): InlineEditHost {
  return {
    getWorkingDirectory: () => bridge.getVaultPath(),
    getLocale: () => bridge.getLocale(),
    resolveAdapter: () => resolveAdapter(bridge),
    createProviderIcon: bridge.createProviderIcon
      ? (providerId, size) => bridge.createProviderIcon?.(providerId, size) ?? null
      : undefined,
    listContextFiles: bridge.listContextFiles ? () => bridge.listContextFiles?.() ?? null : undefined,
  };
}

function resolveAdapter(bridge: InlineEditPluginBridge): InlineEditHostAdapter | null {
  const registry = bridge.getRegistry();
  const kind = bridge.getActiveChatBackend() ?? registry?.getActiveKind() ?? null;
  if (!kind) return null;
  const adapter = registry?.get(kind);
  if (!adapter) return null;

  const { listModels, listEfforts, setModelOverride, setEffortOverride } = bridge;

  return {
    kind,
    displayName: adapter.displayName,
    getAuxQuery: () => (hasCapability(adapter.capabilities, AgentCapability.AuxQuery)
      ? adapter as unknown as AgentAuxQueryCapability
      : null),
    resolveModel: () => resolveModel(bridge, kind),
    listModels: listModels ? () => listModels(kind) : undefined,
    listEfforts: listEfforts ? () => listEfforts(kind) : undefined,
    describeModelSelection: () => describeModelSelection(bridge, kind),
    getEffort: () => bridge.getSettings().effortOverrides[kind] ?? null,
    setModelOverride: setModelOverride ? (ref) => setModelOverride(kind, ref) : undefined,
    setEffortOverride: setEffortOverride ? (id) => setEffortOverride(kind, id) : undefined,
  };
}

/** Chip label following the same precedence as `resolveModel`. */
export function describeModelSelection(
  bridge: InlineEditPluginBridge,
  kind: AgentBackendKind,
): InlineEditModelSelectionLabel {
  const override = bridge.getSettings().modelOverrides[kind];
  if (typeof override === 'string' && override.trim()) {
    return { label: override.trim(), source: 'override' };
  }
  const tabModel = bridge.getActiveChatModel();
  if (tabModel?.model) {
    const label = kind === 'opencode' || kind === 'pi'
      ? `${tabModel.provider}/${tabModel.model}`
      : tabModel.model;
    return { label, source: 'chat' };
  }
  return { label: '', source: 'default' };
}

function resolveModel(
  bridge: InlineEditPluginBridge,
  kind: AgentBackendKind,
): { ok: true; model: BackendModelSelection | null } | { ok: false; error: string } {
  const override = bridge.getSettings().modelOverrides[kind];
  if (typeof override === 'string' && override.trim()) {
    const parsed = parseModelOverride(kind, override.trim());
    if (!parsed) {
      return { ok: false, error: `"${override.trim()}" is not a valid ${kind} model reference.` };
    }
    if (bridge.isModelAvailable && !bridge.isModelAvailable(kind, parsed)) {
      return { ok: false, error: `"${override.trim()}" is not available in the ${kind} model catalog.` };
    }
    return { ok: true, model: parsed };
  }

  const tabModel = bridge.getActiveChatModel();
  if (!tabModel?.model) return { ok: true, model: null };
  return { ok: true, model: normalizeTabModel(kind, tabModel) };
}

/**
 * Parse a user-entered model override.
 *
 * Formats follow each backend's own model identity (design §9):
 * `provider/model` for opencode and pi, a bare model id or SDK alias for
 * claude-code, and a model id for codex. Returns `null` when the string cannot
 * be a valid reference for that backend.
 */
export function parseModelOverride(
  kind: AgentBackendKind,
  raw: string,
): BackendModelSelection | null {
  switch (kind) {
    case 'opencode':
    case 'pi': {
      const separator = raw.indexOf('/');
      if (separator <= 0 || separator === raw.length - 1) return null;
      const provider = raw.slice(0, separator).trim();
      const model = raw.slice(separator + 1).trim();
      if (!provider || !model || /\s/.test(raw)) return null;
      return { kind, provider, model };
    }
    case 'claude-code':
      return /\s/.test(raw) ? null : { kind: 'claude-code', model: raw };
    case 'codex':
      return /\s/.test(raw) ? null : { kind: 'codex', model: raw };
    default:
      return null;
  }
}

/** Normalise the active chat tab's `{ provider, model }` into a backend selection. */
export function normalizeTabModel(
  kind: AgentBackendKind,
  tabModel: { provider: string; model: string },
): BackendModelSelection {
  if (kind === 'opencode' || kind === 'pi') {
    return { kind, provider: tabModel.provider, model: tabModel.model };
  }
  return kind === 'claude-code'
    ? { kind: 'claude-code', model: tabModel.model }
    : { kind: 'codex', model: tabModel.model };
}
