import type {
  OpencodeAgentConfig,
  OpencodeAgentConfigRecord,
  OpencodeCommandConfig,
} from '../types';
import { isRecord } from './modelConfig';

export const COMMAND_SCOPED_AGENT_KIND = 'slash-command-sampling';
export const COMMAND_SCOPED_AGENT_OPTIONS_KEY = 'opencodianCommand';
const COMMAND_SCOPED_AGENT_PREFIX = 'opencodian-command:';

export function getCommandScopedAgentId(commandId: string): string {
  return `${COMMAND_SCOPED_AGENT_PREFIX}${commandId.trim()}`;
}

export function isCommandScopedAgentId(agentId: unknown): boolean {
  return typeof agentId === 'string' && agentId.trim().startsWith(COMMAND_SCOPED_AGENT_PREFIX);
}

export function getCommandScopedAgentMetadata(
  options: unknown,
  commandId: string,
): Record<string, unknown> | undefined {
  if (!isRecord(options)) {
    return undefined;
  }

  const metadata = options[COMMAND_SCOPED_AGENT_OPTIONS_KEY];
  if (
    !isRecord(metadata)
    || metadata.kind !== COMMAND_SCOPED_AGENT_KIND
    || metadata.commandId !== commandId
  ) {
    return undefined;
  }

  return metadata;
}

export function prepareCommandPatchWithScopedAgent(options: {
  command: OpencodeCommandConfig;
  commandId: string;
  existingCommand: OpencodeCommandConfig | undefined;
  legacyAgents: OpencodeAgentConfigRecord;
  nativeAgents: OpencodeAgentConfigRecord;
}): OpencodeCommandConfig {
  const {
    command,
    commandId,
    existingCommand,
    legacyAgents,
    nativeAgents,
  } = options;
  const hasTemperaturePatch = Object.prototype.hasOwnProperty.call(command, 'temperature');
  const hasTopPPatch = Object.prototype.hasOwnProperty.call(command, 'top_p');
  const commandPatch: OpencodeCommandConfig = {
    ...command,
  };

  delete commandPatch.temperature;
  delete commandPatch.top_p;

  if (!hasTemperaturePatch && !hasTopPPatch) {
    return commandPatch;
  }

  const scopedAgentId = getCommandScopedAgentId(commandId);
  const existingScopedAgent = nativeAgents[scopedAgentId];
  const nextTemperature = hasTemperaturePatch
    ? normalizeCommandSamplingValue(command.temperature)
    : existingScopedAgent?.temperature;
  const nextTopP = hasTopPPatch
    ? normalizeCommandSamplingValue(command.top_p)
    : existingScopedAgent?.top_p;

  if (nextTemperature === undefined && nextTopP === undefined) {
    if (
      !Object.prototype.hasOwnProperty.call(commandPatch, 'agent')
      && existingCommand?.agent === scopedAgentId
    ) {
      commandPatch.agent = undefined;
    }
    removeCommandScopedAgent(nativeAgents, commandId);
    return commandPatch;
  }

  const baseAgentId = resolveCommandScopedBaseAgentId(
    Object.prototype.hasOwnProperty.call(commandPatch, 'agent')
      ? commandPatch.agent
      : existingCommand?.agent,
  );
  const baseAgent = baseAgentId
    ? nativeAgents[baseAgentId] ?? legacyAgents[baseAgentId]
    : undefined;
  nativeAgents[scopedAgentId] = buildCommandScopedAgent({
    baseAgent,
    baseAgentId,
    commandId,
    existingScopedAgent,
    subtask: typeof commandPatch.subtask === 'boolean'
      ? commandPatch.subtask
      : existingCommand?.subtask,
    temperature: nextTemperature,
    topP: nextTopP,
  });
  commandPatch.agent = scopedAgentId;
  return commandPatch;
}

export function removeCommandScopedAgent(
  nativeAgents: OpencodeAgentConfigRecord,
  commandId: string,
): void {
  delete nativeAgents[getCommandScopedAgentId(commandId)];
}

function normalizeCommandSamplingValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function resolveCommandScopedBaseAgentId(value: unknown): string | undefined {
  const agentId = typeof value === 'string' ? value.trim() : '';
  if (!agentId || isCommandScopedAgentId(agentId)) {
    return undefined;
  }
  return agentId;
}

function buildCommandScopedAgent(options: {
  baseAgent: OpencodeAgentConfig | undefined;
  baseAgentId: string | undefined;
  commandId: string;
  existingScopedAgent: OpencodeAgentConfig | undefined;
  subtask: boolean | undefined;
  temperature: number | undefined;
  topP: number | undefined;
}): OpencodeAgentConfig {
  const {
    baseAgent,
    baseAgentId,
    commandId,
    existingScopedAgent,
    subtask,
    temperature,
    topP,
  } = options;
  const base: OpencodeAgentConfig = baseAgent
    ? cloneConfigObject(baseAgent)
    : existingScopedAgent && isCommandScopedAgentForCommand(existingScopedAgent, commandId)
      ? cloneConfigObject(existingScopedAgent)
      : {};
  const metadata: Record<string, unknown> = {
    kind: COMMAND_SCOPED_AGENT_KIND,
    commandId,
  };
  if (baseAgentId) {
    metadata.baseAgent = baseAgentId;
  }

  return mergeConfigObjects(base, {
    description: base.description ?? `OpenCodian generated agent for /${commandId}`,
    disable: undefined,
    hidden: true,
    mode: base.mode ?? (subtask === true ? 'subagent' : 'primary'),
    temperature,
    top_p: topP,
    options: {
      [COMMAND_SCOPED_AGENT_OPTIONS_KEY]: metadata,
    },
  });
}

function isCommandScopedAgentForCommand(agent: OpencodeAgentConfig | undefined, commandId: string): boolean {
  return getCommandScopedAgentMetadata(agent?.options, commandId) !== undefined;
}

function mergeConfigObjects<T extends Record<string, unknown>>(
  existing: T | undefined,
  patch: T,
): T {
  const next: Record<string, unknown> = existing ? cloneConfigObject(existing) : {};

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete next[key];
      continue;
    }

    const currentValue = next[key];
    if (isRecord(currentValue) && isRecord(value)) {
      next[key] = mergeConfigObjects(currentValue, value);
      continue;
    }

    next[key] = cloneConfigValue(value);
  }

  return next as T;
}

function cloneConfigObject<T extends Record<string, unknown>>(value: T): T {
  return cloneConfigValue(value);
}

function cloneConfigValue<T>(value: T): T {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? value : JSON.parse(serialized) as T;
}
