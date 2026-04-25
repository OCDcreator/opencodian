import type { OpencodeAgentConfig } from '../types/opencodeConfig';
import {
  type AgentCatalogInput,
  isSystemAgentId,
  type RuntimeAgentShape,
  type SurfaceAgent,
  type SurfaceAgentSource,
} from './types';

/**
 * Aggregates runtime, config, and file agent truths into a unified catalog.
 *
 * The catalog is a pure-function layer: callers provide the three input
 * snapshots, and the service returns the merged `SurfaceAgent[]` without
 * performing any I/O or side effects. This keeps runtime truth, config truth,
 * and file truth visibly separate in the output.
 */
export class AgentCatalogService {
  /**
   * Build the unified agent catalog from the three truth layers.
   *
   * Each layer contributes independently:
   * - **Runtime agents** provide `name`, `mode`, `hidden`, `native`, `description`.
   * - **Config agents** provide project overrides and new config-only agents.
   * - **File agents** provide markdown-originated entries (deferred to A4, but
   *   the input shape already accepts them).
   *
   * The output keeps source attribution intact so callers can surface
   * divergence (e.g. "saved to config but not yet in runtime").
   */
  aggregate(input: AgentCatalogInput): SurfaceAgent[] {
    const { runtimeAgents, configAgents, fileAgents } = input;
    const seen = new Map<string, SurfaceAgentBuilder>();

    // Layer 1: Runtime agents
    for (const rt of runtimeAgents) {
      const builder = this.getOrCreate(seen, rt.name);
      builder.addSource('runtime');
      builder.setRuntimeDefaults(rt);
    }

    // Layer 2: Config agents
    for (const [agentId, config] of Object.entries(configAgents)) {
      const builder = this.getOrCreate(seen, agentId);
      builder.addSource('config');
      builder.applyConfigOverride(config);
    }

    // Layer 3: File agents (minimal in A1; full scan deferred to A4)
    if (fileAgents) {
      for (const file of fileAgents) {
        const builder = this.getOrCreate(seen, file.agentId);
        builder.addSource('file');
        builder.setFileOrigin(file.path);
      }
    }

    // Build final entries
    const results: SurfaceAgent[] = [];
    for (const builder of seen.values()) {
      results.push(builder.build());
    }

    return results;
  }

  private getOrCreate(
    seen: Map<string, SurfaceAgentBuilder>,
    agentId: string,
  ): SurfaceAgentBuilder {
    let builder = seen.get(agentId);
    if (!builder) {
      builder = new SurfaceAgentBuilder(agentId);
      seen.set(agentId, builder);
    }
    return builder;
  }
}

// Internal builder — accumulates per-agent data from all truth layers

class SurfaceAgentBuilder {
  private readonly id: string;
  private displayName: string | undefined;
  private description: string | undefined;
  private mode: string | undefined;
  private sources: SurfaceAgentSource[] = [];
  private originPath: string | undefined;
  private hidden: boolean | undefined;
  private disabled = false;
  private runtimeAvailable = false;
  private hasProjectOverride = false;
  private builtin: boolean | undefined;
  private rawConfig: OpencodeAgentConfig | undefined;
  private _system: boolean | undefined;

  constructor(id: string) {
    this.id = id;
  }

  addSource(source: SurfaceAgentSource): void {
    if (!this.sources.includes(source)) {
      this.sources.push(source);
    }
  }

  setRuntimeDefaults(rt: RuntimeAgentShape): void {
    this.runtimeAvailable = true;
    if (rt.description !== undefined) {
      this.description = rt.description;
    }
    if (rt.mode !== undefined) {
      this.mode = rt.mode;
    }
    if (rt.hidden !== undefined) {
      this.hidden = rt.hidden;
    }
    if (rt.native !== undefined) {
      this.builtin = rt.native;
    }
    // SDK `builtIn` field — treat as native/builtin if truthy
    if (rt.builtIn !== undefined && rt.builtIn !== false) {
      this.builtin = true;
    }
  }

  applyConfigOverride(config: OpencodeAgentConfig): void {
    this.hasProjectOverride = true;
    this.rawConfig = config;

    // Config-provided fields override runtime defaults
    if (typeof config.name === 'string') {
      this.displayName = config.name;
    }
    if (config.description !== undefined) {
      this.description = config.description;
    }
    if (config.mode !== undefined) {
      this.mode = config.mode;
    }
    if (config.hidden !== undefined) {
      this.hidden = config.hidden;
    }
    if (config.disable === true) {
      this.disabled = true;
    }
  }

  setFileOrigin(vaultRelativePath: string): void {
    this.originPath = vaultRelativePath;
  }

  build(): SurfaceAgent {
    const resolvedMode = this.normalizeMode(this.mode);
    const resolvedHidden = this.hidden ?? false;
    const resolvedSystem = isSystemAgentId(this.id);

    return {
      id: this.id,
      displayName: this.displayName ?? this.id,
      description: this.description ?? '',
      mode: resolvedMode,
      sources: Object.freeze([...this.sources]),
      originPath: this.originPath,
      hidden: resolvedHidden,
      disabled: this.disabled,
      system: resolvedSystem,
      runtimeAvailable: this.runtimeAvailable,
      hasProjectOverride: this.hasProjectOverride,
      defaultEligible: this.computeDefaultEligible(resolvedMode, resolvedHidden),
      subagentVisible: this.computeSubagentVisible(resolvedMode, resolvedHidden),
      builtin: this.builtin,
      rawConfig: this.rawConfig,
    };
  }

  private normalizeMode(raw: string | undefined): 'primary' | 'subagent' | 'all' | null {
    if (raw === 'primary' || raw === 'subagent' || raw === 'all') {
      return raw;
    }
    return null;
  }

  private computeDefaultEligible(
    mode: 'primary' | 'subagent' | 'all' | null,
    hidden: boolean,
  ): boolean {
    return (mode === 'primary' || mode === 'all') && !hidden && !this.disabled;
  }

  private computeSubagentVisible(
    mode: 'primary' | 'subagent' | 'all' | null,
    hidden: boolean,
  ): boolean {
    return (mode === 'subagent' || mode === 'all') && !hidden;
  }
}
