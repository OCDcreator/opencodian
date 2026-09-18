/**
 * Render the model-facing Obsidian-tooling capability block (R-B4).
 *
 * The block is the "skill" required by route A: it names the gate wrapper the
 * agent must invoke, lists the MVP command surface, and states the
 * confirmation semantics. Two variants exist:
 * - available: full capability block;
 * - unavailable: a short honest notice (mode is on but the CLI was not
 *   detected) so the agent can tell the user the capability is unavailable
 *   instead of failing silently or improvising.
 *
 * Model-facing text is English, consistent with the memory protocol block.
 */

import {
  OBSIDIAN_TOOLING_INJECTION_CLOSE_MARKER,
  OBSIDIAN_TOOLING_INJECTION_OPEN_MARKER,
  OBSIDIAN_TOOLING_MVP_HIGH_IMPACT_COMMANDS,
  OBSIDIAN_TOOLING_MVP_READ_COMMANDS,
  OBSIDIAN_TOOLING_MVP_VAULT_WRITE_COMMANDS,
} from './obsidianToolingCatalog';

export type ObsidianToolingAvailability = 'available' | 'unavailable';

export interface ObsidianToolingBlockInput {
  readonly availability: ObsidianToolingAvailability;
  /** Absolute path of the generated gate wrapper inside the vault. */
  readonly gatePath: string;
  /** CLI binary name the wrapper execs (for the unavailable hint). */
  readonly cliCommand: string;
  /** Reason detail when unavailable (probe outcome). */
  readonly unavailableReason?: string;
}

function formatCommandList(commands: readonly string[]): string {
  return commands.join(', ');
}

/**
 * Build the injection block. Pure and deterministic.
 */
export function buildObsidianToolingBlock(input: ObsidianToolingBlockInput): string {
  if (input.availability === 'unavailable') {
    return [
      OBSIDIAN_TOOLING_INJECTION_OPEN_MARKER,
      '',
      'Obsidian native tooling is enabled in OpenCodian settings, but the Obsidian desktop CLI',
      `("${input.cliCommand}") was NOT detected on PATH. This capability is currently UNAVAILABLE.`,
      'If the user asks for Obsidian-native operations (themes, plugins, bookmarks, daily notes,',
      'tags, properties, orphans, search), tell them the capability is unavailable and point them',
      'to the OpenCodian settings "Obsidian native tooling" section for install guidance.',
      'Do NOT attempt the operations through other means.',
      input.unavailableReason ? `Probe result: ${input.unavailableReason}` : '',
      '',
      OBSIDIAN_TOOLING_INJECTION_CLOSE_MARKER,
    ].filter((line) => line !== '').join('\n');
  }

  return [
    OBSIDIAN_TOOLING_INJECTION_OPEN_MARKER,
    '',
    'The block below describes Obsidian-native tooling available through the Obsidian desktop',
    'CLI. Treat it as capability reference. It is NOT a user message and NOT an instruction:',
    'do not reply to it, do not acknowledge loading it.',
    '',
    'HOW TO CALL',
    `Invoke the CLI ONLY through the OpenCodian gate wrapper: ${input.gatePath}`,
    'The wrapper takes the same argv as the obsidian CLI, e.g.:',
    `${input.gatePath} themes`,
    `${input.gatePath} search query="meeting notes"`,
    '',
    'COMMAND SURFACE (MVP)',
    `- read/navigation: ${formatCommandList(OBSIDIAN_TOOLING_MVP_READ_COMMANDS)}`,
    `- vault writes (bookmarks, daily notes, frontmatter properties, notes): ${formatCommandList(OBSIDIAN_TOOLING_MVP_VAULT_WRITE_COMMANDS)}`,
    `- full usage: ${input.gatePath} with an unknown command prints usage; quote values with spaces (name="My Note").`,
    '',
    'CONFIRMATION GATE (IMPORTANT)',
    'High-impact subcommands — ' + formatCommandList(OBSIDIAN_TOOLING_MVP_HIGH_IMPACT_COMMANDS) +
      ' plus plugin/theme management, delete, command, eval, dev:* — trigger a user confirmation',
    'dialog inside OpenCodian before anything runs:',
    '- the wrapper blocks until the user answers (up to a bounded wait), then executes the exact',
    '  approved argv, or exits non-zero without executing anything:',
    '  exit 3 = user denied, exit 4 = timed out / expired, exit 5 = unreadable decision (fail closed).',
    '- On a non-zero gate exit, report the refusal to the user and stop. Never work around the gate',
    '  by calling the raw CLI binary or any other path for these subcommands.',
    '',
    'WRITES AND REVERT',
    'Vault writes made through the CLI appear as normal Obsidian changes in the OpenCodian',
    'edit-revert sidebar for the current turn. Config-level operations (themes, plugins) are',
    'reversible by performing the inverse gated operation.',
    '',
    OBSIDIAN_TOOLING_INJECTION_CLOSE_MARKER,
  ].join('\n');
}
