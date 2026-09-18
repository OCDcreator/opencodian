/**
 * Obsidian CLI command catalog (R-B4, route A: official CLI).
 *
 * Single source of truth for how the plugin classifies the desktop app CLI's
 * subcommands. The classification is consumed by:
 * - the generated gate script (`obsidianGateScript.ts`), which is the actual
 *   enforcement point for high-impact confirmations;
 * - the injected capability block (`obsidianToolingPrompt.ts`);
 * - the settings status row and the requirement docs.
 *
 * Classification semantics (fail-closed by design):
 * - `read`        — pure queries; no vault or app-state mutation.
 * - `navigation`  — opens tabs/views/URLs in the running app; no data change.
 * - `vault-write` — writes vault content through the running app's vault API.
 *                   These surface as normal Obsidian vault events and are
 *                   therefore visible to (and partially revertible through)
 *                   the R-B3 edit-revert sidebar during an open round.
 * - `high-impact` — themes/plugins config, dev/eval surfaces, arbitrary
 *                   command execution, destructive deletes, app reloads.
 *                   ALWAYS routed through the user-confirmation gate.
 * - anything unknown to this catalog is treated as `high-impact` so a future
 *   CLI subcommand can never silently bypass the confirmation gate.
 *
 * Verified against `obsidian --help` (CLI 1.13.7, macOS, 2026-09-18).
 */

export type ObsidianToolingCommandClass = 'read' | 'navigation' | 'vault-write' | 'high-impact';

export interface ObsidianToolingCommandSpec {
  readonly subcommand: string;
  readonly commandClass: ObsidianToolingCommandClass;
  /** Surfaced in the injected MVP skill block (requirement scope). */
  readonly mvp: boolean;
}

const spec = (
  subcommands: string,
  commandClass: ObsidianToolingCommandClass,
  mvp = false,
): ObsidianToolingCommandSpec[] => (
  subcommands.split(/\s+/).filter(Boolean).map((subcommand) => ({ subcommand, commandClass, mvp }))
);

/**
 * The catalog. Keep in sync with `obsidian --help`; the wrapper regenerates
 * whenever the tooling mode is applied, so edits here reach the gate script.
 */
export const OBSIDIAN_TOOLING_COMMAND_CATALOG: readonly ObsidianToolingCommandSpec[] = [
  // --- read (queries) -------------------------------------------------------
  ...spec('aliases backlinks base:query base:views bases bookmarks commands', 'read', true),
  ...spec('daily:path daily:read deadends diff file files folder folders', 'read'),
  ...spec('help history history:list history:read hotkey hotkeys outline', 'read', true),
  ...spec('orphans plugin plugins plugins:enabled properties property:read', 'read', true),
  ...spec('random:read read recents search search:context snippets snippets:enabled', 'read', true),
  ...spec('sync sync:deleted sync:history sync:read sync:status tag tags task tasks', 'read', true),
  ...spec('template:read templates theme themes unresolved vault vaults version', 'read', true),
  ...spec('wordcount workspace', 'read'),

  // --- navigation (UI state only) --------------------------------------------
  ...spec('open random search:open history:open sync:open tab:open web', 'navigation'),

  // --- vault-write (R-B3-visible through vault events) ------------------------
  ...spec('append prepend create base:create template:insert bookmark', 'vault-write', true),
  ...spec('daily daily:append daily:prepend property:set property:remove', 'vault-write', true),
  ...spec('move rename history:restore sync:restore', 'vault-write'),

  // --- high-impact (always gated behind explicit user confirmation) -----------
  ...spec('theme:set theme:install theme:uninstall', 'high-impact', true),
  ...spec('plugin:enable plugin:disable plugin:install plugin:uninstall plugin:reload', 'high-impact', true),
  ...spec('plugins:restrict snippet:enable snippet:disable', 'high-impact'),
  ...spec('command eval delete reload restart devtools', 'high-impact'),
  ...spec('dev:cdp dev:console dev:css dev:debug dev:dom dev:errors dev:mobile dev:screenshot', 'high-impact'),
];

const CLASS_BY_SUBCOMMAND: ReadonlyMap<string, ObsidianToolingCommandClass> = new Map(
  OBSIDIAN_TOOLING_COMMAND_CATALOG.map((entry) => [entry.subcommand, entry.commandClass]),
);

/** MVP read-only subcommands shown in the injected skill block. */
export const OBSIDIAN_TOOLING_MVP_READ_COMMANDS: readonly string[] = OBSIDIAN_TOOLING_COMMAND_CATALOG
  .filter((entry) => entry.mvp && (entry.commandClass === 'read' || entry.commandClass === 'navigation'))
  .map((entry) => entry.subcommand);

/** MVP write subcommands that pass through and surface in the revert sidebar. */
export const OBSIDIAN_TOOLING_MVP_VAULT_WRITE_COMMANDS: readonly string[] = OBSIDIAN_TOOLING_COMMAND_CATALOG
  .filter((entry) => entry.mvp && entry.commandClass === 'vault-write')
  .map((entry) => entry.subcommand);

/** MVP high-impact subcommands named explicitly in the injected skill block. */
export const OBSIDIAN_TOOLING_MVP_HIGH_IMPACT_COMMANDS: readonly string[] = [
  'theme:set',
  'theme:install',
  'theme:uninstall',
  'plugin:enable',
  'plugin:disable',
  'plugin:install',
  'plugin:uninstall',
];

/**
 * Classify a subcommand. Unknown / empty input classifies as `high-impact`
 * (fail closed): a future CLI subcommand must never bypass the gate.
 */
export function classifyObsidianSubcommand(subcommand: string | null | undefined): ObsidianToolingCommandClass {
  if (!subcommand) {
    return 'high-impact';
  }
  return CLASS_BY_SUBCOMMAND.get(subcommand) ?? 'high-impact';
}

/** Subcommand sets embedded into the generated gate script, in stable order. */
export interface GateScriptCommandSets {
  /** Executed directly (read + navigation + vault-write). */
  readonly passthrough: readonly string[];
  /** Require a user decision before execution. */
  readonly highImpact: readonly string[];
}

export function buildGateScriptCommandSets(): GateScriptCommandSets {
  const passthrough = OBSIDIAN_TOOLING_COMMAND_CATALOG
    .filter((entry) => entry.commandClass !== 'high-impact')
    .map((entry) => entry.subcommand)
    .sort();
  const highImpact = OBSIDIAN_TOOLING_COMMAND_CATALOG
    .filter((entry) => entry.commandClass === 'high-impact')
    .map((entry) => entry.subcommand)
    .sort();
  return { passthrough, highImpact };
}

/** Marker frame for the injected capability block (detection across reloads). */
export const OBSIDIAN_TOOLING_INJECTION_OPEN_MARKER = '[OPENCODIAN OBSIDIAN TOOLING]';
export const OBSIDIAN_TOOLING_INJECTION_CLOSE_MARKER = '[/OPENCODIAN OBSIDIAN TOOLING]';

/** Plugin-owned tooling directory inside the vault (same root as R-B3 checkpoints). */
export const OBSIDIAN_TOOLING_DIR = '.opencodian/obsidian-tooling';
/** Requests subdirectory the gate script writes into (also watched by the plugin). */
export const OBSIDIAN_TOOLING_REQUESTS_DIRNAME = 'requests';
/** Generated gate script file name inside the tooling directory. */
export const OBSIDIAN_GATE_SCRIPT_FILENAME = 'obsidian-gate';

/** Gate handshake waits. */
export const OBSIDIAN_TOOLING_GATE_WAIT_DEFAULT_SECONDS = 90;
export const OBSIDIAN_TOOLING_GATE_WAIT_MIN_SECONDS = 15;
export const OBSIDIAN_TOOLING_GATE_WAIT_MAX_SECONDS = 240;
/** Plugin-side pending-request expiry (must exceed the wrapper wait ceiling). */
export const OBSIDIAN_TOOLING_REQUEST_EXPIRY_MS = 5 * 60 * 1000;
