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

// ---------------------------------------------------------------------------
// Invocation intent — describes what the user explicitly requested
// ---------------------------------------------------------------------------

/**
 * Describes a single `@subagent` mention intent within a user message.
 * The user explicitly referenced a subagent by name during composition.
 */
export interface AgentMentionIntent {
  /** The agent ID (name) of the subagent being mentioned. */
  readonly agentId: string;

  /**
   * Optional source span for the mention in the original user text.
   * Used to preserve the mention's position when constructing native parts.
   */
  readonly source?: {
    readonly value: string;
    readonly start: number;
    readonly end: number;
  };
}

/**
 * Describes an explicit subtask intent embedded in a user message.
 * Unlike `@subagent` mentions (which hint to the model), subtasks are
 * direct structured instructions that the backend processes natively.
 */
export interface SubtaskIntent {
  /** The agent ID that should handle this subtask. */
  readonly agentId: string;

  /** Human-readable description of the subtask. */
  readonly description: string;

  /** The actual subtask prompt / instruction text. */
  readonly prompt: string;

  /**
   * Optional model override for the subtask.
   * When provided, the backend should use this model instead of the agent default.
   */
  readonly model?: {
    readonly providerID: string;
    readonly modelID: string;
  };

  /**
   * Optional command to execute as part of the subtask.
   * Maps to the native `command` field on `SubtaskPartInput`.
   */
  readonly command?: string;
}

/**
 * The kind of invocation: `prompt` is a normal chat send, `command` routes
 * through the command template system, and `shell` is a shell invocation.
 * Currently only `prompt` is wired for agent invocation in A2.
 */
export type SurfaceInvocationKind = 'prompt' | 'command' | 'shell';

/**
 * Describes a single user send's explicit agent invocation intent.
 *
 * This is the unified input that `AgentInvocationService` translates into
 * native OpenCode prompt-level fields (top-level `agent`, `AgentPartInput`
 * parts, and `SubtaskPartInput` parts).
 *
 * When no fields are set (the no-intent path), existing chat behavior is
 * preserved unchanged.
 */
export interface SurfaceInvocationIntent {
  /** The kind of invocation. Defaults to `'prompt'` for normal chat sends. */
  readonly kind?: SurfaceInvocationKind;

  /**
   * Explicit main agent selection.
   * When set, this overrides the backend's default agent selection for
   * the prompt's top-level `agent` field.
   * `undefined` means "use whatever the backend defaults to".
   */
  readonly primaryAgent?: string;

  /**
   * Explicit `@subagent` mention intents.
   * Each mention maps to a native `AgentPartInput` part in the prompt.
   */
  readonly mentions?: readonly AgentMentionIntent[];

  /**
   * Explicit subtask intents.
   * Each subtask maps to a native `SubtaskPartInput` part in the prompt.
   */
  readonly subtasks?: readonly SubtaskIntent[];

  /**
   * Optional model selection override for this invocation.
   * Separate from the existing model picker; this would be an invocation-level
   * override carried alongside agent intent.
   */
  readonly modelSelection?: {
    readonly providerID: string;
    readonly modelID: string;
  };

  /**
   * If this invocation originates from a specific message (e.g. a retry or
   * follow-up), the originating message ID.
   */
  readonly sourceMessageId?: string;
}

// ---------------------------------------------------------------------------
// Invocation resolution result
// ---------------------------------------------------------------------------

/**
 * The resolved output of translating a `SurfaceInvocationIntent` into
 * native OpenCode prompt-level structures.
 *
 * This is what the send pipeline consumes — not the raw user intent.
 */
export interface ResolvedAgentInvocation {
  /**
   * The resolved main agent ID for the prompt's top-level `agent` field.
   * `undefined` when no explicit main agent was selected (use backend default).
   */
  readonly agent?: string;

  /**
   * Additional prompt parts generated from the invocation intent.
   * These are `agent`-type and `subtask`-type parts that get appended
   * to the prompt's `parts` array alongside text and file parts.
   */
  readonly invocationParts: readonly InvocationPromptPart[];
}

/**
 * A prompt part originating from agent invocation resolution.
 * These map 1:1 to OpenCode's native `AgentPartInput` and `SubtaskPartInput`.
 */
export type InvocationPromptPart =
  | {
      /** Maps to native `AgentPartInput`. */
      type: 'agent';
      /** Stable part ID, assigned by the prompt builder. */
      id?: string;
      /** The subagent name being mentioned. */
      name: string;
      /** Source span of the mention in the original text. */
      source?: {
        value: string;
        start: number;
        end: number;
      };
    }
  | {
      /** Maps to native `SubtaskPartInput`. */
      type: 'subtask';
      /** Stable part ID, assigned by the prompt builder. */
      id?: string;
      /** Human-readable description. */
      description: string;
      /** The subtask prompt text. */
      prompt: string;
      /** The agent to delegate this subtask to. */
      agent: string;
      /** Optional model override. */
      model?: {
        providerID: string;
        modelID: string;
      };
      /** Optional command. */
      command?: string;
    };
