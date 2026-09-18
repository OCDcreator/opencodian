/**
 * Barrel for the Obsidian native tooling core (`core.obsidian-tooling` owner,
 * R-B4 route A: official desktop CLI).
 *
 * Hard invariant: nothing exported from here imports an agent backend, the
 * OpenCode service, or any feature/app module. App contact (vault adapter,
 * Modals, fs watchers) is bound by `app.obsidian-tooling`.
 */

export {
  type CliSpawnFn,
  OBSIDIAN_CLI_DEFAULT_COMMAND,
  OBSIDIAN_CLI_PROBE_TIMEOUT_MS,
  type ObsidianCliProbeResult,
  probeObsidianCli,
  type ProbeObsidianCliInput,
} from './ObsidianCliProbe';
export { buildGateScript, type GateScriptInput } from './obsidianGateScript';
export {
  buildGateScriptCommandSets,
  classifyObsidianSubcommand,
  type GateScriptCommandSets,
  OBSIDIAN_GATE_SCRIPT_FILENAME,
  OBSIDIAN_TOOLING_COMMAND_CATALOG,
  OBSIDIAN_TOOLING_DIR,
  OBSIDIAN_TOOLING_GATE_WAIT_DEFAULT_SECONDS,
  OBSIDIAN_TOOLING_GATE_WAIT_MAX_SECONDS,
  OBSIDIAN_TOOLING_GATE_WAIT_MIN_SECONDS,
  OBSIDIAN_TOOLING_INJECTION_CLOSE_MARKER,
  OBSIDIAN_TOOLING_INJECTION_OPEN_MARKER,
  OBSIDIAN_TOOLING_MVP_HIGH_IMPACT_COMMANDS,
  OBSIDIAN_TOOLING_MVP_READ_COMMANDS,
  OBSIDIAN_TOOLING_MVP_VAULT_WRITE_COMMANDS,
  OBSIDIAN_TOOLING_REQUEST_EXPIRY_MS,
  OBSIDIAN_TOOLING_REQUESTS_DIRNAME,
  type ObsidianToolingCommandClass,
  type ObsidianToolingCommandSpec,
} from './obsidianToolingCatalog';
export {
  extractObsidianToolingInjection,
  planToolingInjection,
  prependObsidianToolingInjection,
  toolingEpochMarkerCount,
  type ToolingInjectionPlan,
  type ToolingInjectionSkipReason,
  type ToolingTranscriptMessage,
  transcriptHasToolingInjection,
} from './obsidianToolingInjection';
export {
  buildObsidianToolingBlock,
  type ObsidianToolingAvailability,
  type ObsidianToolingBlockInput,
} from './obsidianToolingPrompt';
export {
  buildDecisionDocument,
  type ObsidianToolingDecision,
  type ObsidianToolingRequest,
  type ParsedToolingRequest,
  parseToolingRequest,
  requestRequiresConfirmation,
  toolingRequestIdFromFilename,
} from './obsidianToolingRequests';
export type { ObsidianToolingStatusSnapshot } from './obsidianToolingStatus';
