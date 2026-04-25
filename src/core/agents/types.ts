/**
 * Agent surface types for the unified catalog layer.
 *
 * These types represent the merged view of runtime, config, and file agent
 * truths. They keep the three layers visibly separate and avoid faking a
 * single status when the truth diverges.
 *
 * Source of truth layers:
 * - **Runtime truth** — `app.agents()` SDK call
 * - **Config truth** — `.opencode/opencode.json` `agent` / `mode` / `default_agent`
 * - **File truth** — `.opencode/agent(s)/`, `agent(s)/` Markdown files
 */

import type { OpencodeAgentConfig, OpencodeAgentMode } from '../types/opencodeConfig';

// ---------------------------------------------------------------------------
// Agent source classification
// ---------------------------------------------------------------------------

/**
 * Where an agent entry originates from. An agent can appear in multiple
 * layers simultaneously (e.g. a builtin agent with a project config override).
 *
 * The catalog records every layer that contributed data; callers decide how
 * to surface overlaps.
 */
export type SurfaceAgentSource =
  | 'runtime'      // Visible via SDK `app.agents()`
  | 'config'       // Defined in project `.opencode/opencode.json`
  | 'file'         // Defined in a Markdown agent file
  ;

// ---------------------------------------------------------------------------
// System agent identification
// ---------------------------------------------------------------------------

/**
 * Known OpenCode builtin system agents. These are hidden internal agents
 * used for title generation, context compaction, and summarization.
 *
 * They must remain visible in the catalog but are guarded from casual
 * override unless expert mode is enabled.
 */
export const SYSTEM_AGENT_IDS = [
  'title',
  'summary',
  'compaction',
] as const;

export type SystemAgentId = typeof SYSTEM_AGENT_IDS[number];

/**
 * Returns `true` when the given agent ID is one of the known OpenCode
 * builtin system agents.
 */
export function isSystemAgentId(id: string): id is SystemAgentId {
  return (SYSTEM_AGENT_IDS as readonly string[]).includes(id);
}

// ---------------------------------------------------------------------------
// SurfaceAgent — the unified catalog entry
// ---------------------------------------------------------------------------

/**
 * Represents a single agent as seen through the unified catalog.
 *
 * Fields are intentionally layered so callers can tell whether a value came
 * from runtime, config, or file — rather than collapsing into a single
 * "effective" state that hides divergence.
 */
export interface SurfaceAgent {
  /** Agent ID (matches `Agent.name` in SDK and config key). */
  readonly id: string;

  /** Human-facing display name. Falls back to `id` if none set. */
  readonly displayName: string;

  /** Agent description, resolved from project config then runtime. */
  readonly description: string;

  /** Agent mode — `primary`, `subagent`, or `all`. `null` when unknown. */
  readonly mode: OpencodeAgentMode | null;

  /**
   * Which truth layers contributed data for this agent.
   * An agent can appear in multiple layers (e.g. builtin + project override).
   */
  readonly sources: readonly SurfaceAgentSource[];

  /**
   * For file-sourced agents: the vault-relative path of the Markdown file.
   * `undefined` when the agent does not originate from a file.
   */
  readonly originPath?: string;

  /** Whether the agent is hidden (resolved from config override then runtime). */
  readonly hidden: boolean;

  /** Whether the agent is disabled via config (`disable: true`). */
  readonly disabled: boolean;

  /** Whether this is a known system agent (`title` / `summary` / `compaction`). */
  readonly system: boolean;

  /** Whether the agent was seen in the last runtime `app.agents()` call. */
  readonly runtimeAvailable: boolean;

  /** Whether the agent has a project-config override layer. */
  readonly hasProjectOverride: boolean;

  /**
   * Whether this agent is eligible to be selected as the default main agent.
   * True when `mode` is `primary` or `all`, not disabled, and not hidden.
   */
  readonly defaultEligible: boolean;

  /**
   * Whether this agent is visible in `@subagent` picker contexts.
   * True when `mode` is `subagent` or `all`, and not hidden.
   */
  readonly subagentVisible: boolean;

  /**
   * Whether the runtime reports this agent as builtin/native.
   * `undefined` when no runtime data is available for this agent.
   */
  readonly builtin: boolean | undefined;

  /**
   * Raw project config for this agent, if one exists.
   * This is the direct `agent.<id>` entry from the config file — not merged
   * with runtime defaults.
   */
  readonly rawConfig?: OpencodeAgentConfig;
}

// ---------------------------------------------------------------------------
// SurfaceAgentFile — Markdown agent file truth
// ---------------------------------------------------------------------------

/** Parse status of a Markdown agent file. */
export type SurfaceAgentFileParseStatus =
  | 'ok'
  | 'parse-error'
  | 'duplicate-id'
  | 'conflict'
  ;

/** Scope of the agent file relative to the vault root. */
export type SurfaceAgentFileScope =
  | 'project'   // `.opencode/agent/` or `.opencode/agents/`
  | 'root'      // `agent/` or `agents/`
  ;

/**
 * Represents a Markdown agent file on disk, before any runtime merging.
 * This is the file-truth layer only.
 */
export interface SurfaceAgentFile {
  /** Vault-relative path of the Markdown file. */
  readonly path: string;

  /** Whether the file lives under `.opencode/` (project) or at vault root. */
  readonly scope: SurfaceAgentFileScope;

  /** Agent ID extracted from the filename (without `.md` extension). */
  readonly agentId: string;

  /** Parsed frontmatter key-value pairs, if any. */
  readonly frontmatter: Record<string, unknown>;

  /** Prompt body content (everything after frontmatter). */
  readonly promptBody: string;

  /** Current parse status of the file. */
  readonly parseStatus: SurfaceAgentFileParseStatus;

  /** Last modification time of the file, if known. */
  readonly lastModifiedAt?: number;

  /**
   * Whether the agent from this file was seen in the last runtime snapshot.
   * This stays `false` until runtime data confirms it.
   */
  readonly runtimeSeen: boolean;
}

// ---------------------------------------------------------------------------
// Catalog aggregation input
// ---------------------------------------------------------------------------

/**
 * Minimal shape of a runtime agent from `app.agents()`.
 * Used so the catalog service stays decoupled from the exact SDK type.
 */
export interface RuntimeAgentShape {
  readonly name: string;
  readonly description?: string;
  readonly mode: string;
  readonly native?: boolean;
  readonly hidden?: boolean;
  readonly builtIn?: unknown;
}

/**
 * Input bundle for catalog aggregation. Each field represents one truth layer.
 */
export interface AgentCatalogInput {
  /** Agents from `app.agents()` runtime call. */
  readonly runtimeAgents: readonly RuntimeAgentShape[];

  /** Agent config map from `.opencode/opencode.json`. */
  readonly configAgents: Record<string, OpencodeAgentConfig>;

  /**
   * Markdown agent file scan results.
   * Empty in this slice (A1); file scanning is deferred to A4.
   */
  readonly fileAgents?: readonly SurfaceAgentFile[];
}

// ---------------------------------------------------------------------------
// Expert mode guard
// ---------------------------------------------------------------------------

/**
 * Result of a system-agent guard check.
 * Describes whether an action is allowed and why.
 */
export interface SystemAgentGuardResult {
  /** The agent ID that was checked. */
  readonly agentId: string;

  /** Whether this agent is a known system agent. */
  readonly isSystem: boolean;

  /** Whether the requested action is allowed. */
  readonly allowed: boolean;

  /** Human-readable reason when `allowed` is `false`. */
  readonly reason?: string;
}
