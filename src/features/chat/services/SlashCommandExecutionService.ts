import { Notice } from 'obsidian';

import type { ResolvedModelSelection } from '../../../core/config/modelConfig';
import type {
  SessionCommandInput,
  SessionCommandTemplateContext,
} from '../../../core/opencode/OpenCodeSessionControlOrchestrator';
import type {
  Conversation,
  OpencodeCommandConfigRecord,
  SlashCommandSkillMode,
} from '../../../core/types';
import { t } from '../../../i18n';
import { createLogger } from '../../../shared';
import type { FocusContextPreview } from '../composerContext';
import type { TabId } from '../tabs';
import type { ModelSelectorSelection } from '../ui/modelSelector/types';
import type { CommandMdFile } from './CommandMdFileLoader';
import { loadCommandsFromConfigDir } from './CommandMdFileLoader';
import type { SendPreparationServerAvailability } from './MessageSendPreparationService';

const logger = createLogger('SlashCommandExecutionService');

export type SlashCommandServerAvailability = SendPreparationServerAvailability;

export interface SlashCommandRuntimeCatalogEntry {
  name?: string;
  source?: string;
}

export interface SlashCommandRuntimeSkillEntry {
  name?: string;
}

export interface CompactSessionOpenCodeService {
  getSessionContextUsageSnapshot(sessionId: string): Promise<{
    providerId?: string | null;
    modelId?: string | null;
  } | null>;
  summarizeSession(
    sessionId: string,
    providerID: string,
    modelID: string,
    share: boolean,
  ): Promise<boolean>;
}

export async function executeCompactSession(
  sessionId: string,
  service: CompactSessionOpenCodeService,
  getModel: () => ModelSelectorSelection | null,
  getModelResolution: () => ResolvedModelSelection,
): Promise<boolean> {
  const snapshot = await service.getSessionContextUsageSnapshot(sessionId);
  const currentModel = getModel();
  const currentModelResolution = getModelResolution();
  const providerID = snapshot?.providerId ?? currentModel?.provider ?? currentModelResolution.provider ?? '';
  const modelID = snapshot?.modelId ?? currentModel?.model ?? currentModelResolution.model ?? '';
  if (!providerID || !modelID) {
    new Notice(t('slashCommand.compact.noModel'));
    return false;
  }

  new Notice(t('slashCommand.compact.starting'));
  const compacted = await service.summarizeSession(sessionId, providerID, modelID, false);
  new Notice(t(compacted ? 'slashCommand.compact.success' : 'slashCommand.compact.failed'));
  return compacted;
}

export interface SlashCommandExecutionHost {
  ensureConversationReady(): Promise<Conversation | null>;
  getActiveTabId(): TabId | null;
  ensureTabRuntime(tabId: TabId | null): boolean;
  isTabForegroundBusy(tabId: TabId | null): boolean;
  notifyForegroundBusy(): void;
  getServerAvailability(): Promise<SlashCommandServerAvailability>;
  refreshServerStatusBadge(): Promise<void>;
  ensureServerReadyForChat(
    availability: Exclude<SlashCommandServerAvailability, 'running' | 'external'>,
  ): Promise<boolean>;
  getProjectCommands(): Promise<OpencodeCommandConfigRecord>;
  getRuntimeCommands(): Promise<SlashCommandRuntimeCatalogEntry[]>;
  getRuntimeSkills(): Promise<SlashCommandRuntimeSkillEntry[]>;
  getMdFileCommands(): Promise<CommandMdFile[]>;
  getSlashCommandSkillMode(): SlashCommandSkillMode;
  getVaultPath(): string | null;
  refreshActiveFocusContextPreview(): void;
  getActiveFocusContextPreview(): FocusContextPreview | null;
  runSessionCommand(sessionId: string, input: SessionCommandInput): Promise<unknown>;
  runCompactSession(sessionId: string): Promise<boolean>;
  startConversationSyncLoop(): void;
  syncVisibleConversationInBackground(): Promise<void>;
  notifySlashCommandFailed(commandId: string, error: unknown): void;
}

export interface SlashCommandExecutionHostDependencies {
  getCurrentConversation: () => Conversation | null;
  createNewConversation: () => Promise<void>;
  getActiveTabId: () => TabId | null;
  ensureTabRuntimeState: (tabId: TabId) => unknown;
  isTabForegroundBusy: (tabId: TabId) => boolean;
  notifyForegroundBusy: () => void;
  getServerAvailability: () => Promise<SlashCommandServerAvailability>;
  chatHeaderPresenter: { refreshServerStatusBadge(): Promise<void> };
  ensureServerReadyForChat: (
    availability: Exclude<SlashCommandServerAvailability, 'running' | 'external'>,
  ) => Promise<boolean>;
  opencodeConfigManager: {
    getCommandConfig(): Promise<OpencodeCommandConfigRecord>;
    getConfigDir(): string;
  } | null;
  getSlashCommandSkillMode: () => SlashCommandSkillMode;
  openCodeServiceSdk: {
    command: { list(): Promise<unknown> };
    app: { skills(): Promise<unknown> };
  };
  openCodeService: {
    runSessionCommand(sessionId: string, input: SessionCommandInput): Promise<unknown>;
  };
  runCompactSession: (sessionId: string) => Promise<boolean>;
  getVaultPath: () => string | null;
  composerContextViewFacade: { refreshActiveFocusContextPreview(): void };
  getTabRuntimeState: (
    tabId: TabId | null,
  ) => { focusContextPreview?: FocusContextPreview | null } | null;
  conversationSyncBridgePorts: {
    getLoopControl(): { startConversationSyncLoop(): void };
    getVisibleSyncFollowUp(): { syncVisibleConversationInBackground(): Promise<void> };
  };
  notifySlashCommandFailed: (commandId: string, error: unknown) => void;
}

interface ParsedSlashCommandInput {
  arguments: string;
  command: string;
  agent?: string;
}

function extractAgentFromArguments(argumentsText: string): { cleanedArguments: string; agent?: string } {
  const tokens = argumentsText.split(/\s+/);
  const agentTokens: string[] = [];
  const remainingTokens: string[] = [];

  for (const token of tokens) {
    if (!token) continue;
    // Match @agent with optional trailing punctuation, reject emails
    const match = /^@([a-zA-Z0-9_-]+)[.,;:!?]*$/.exec(token);
    if (match) {
      agentTokens.push(match[1]);
    } else {
      remainingTokens.push(token);
    }
  }

  return {
    cleanedArguments: remainingTokens.join(' '),
    agent: agentTokens.length > 0 ? agentTokens[agentTokens.length - 1] : undefined,
  };
}

function parseSlashCommandInput(content: string): ParsedSlashCommandInput | null {
  const trimmedContent = content.trim();
  if (!trimmedContent || trimmedContent.startsWith('//')) {
    return null;
  }

  // Strategy 1: /command at start of text
  if (trimmedContent.startsWith('/')) {
    const commandBody = trimmedContent.slice(1);
    if (!commandBody || /^\s/.test(commandBody)) {
      return null;
    }

    const commandMatch = /^(\S+)(?:\s+([\s\S]*))?$/.exec(commandBody);
    if (!commandMatch) {
      return null;
    }

    const command = commandMatch[1]?.trim() ?? '';
    if (!command) {
      return null;
    }

    const rawArguments = commandMatch[2] ?? '';
    const { cleanedArguments, agent } = extractAgentFromArguments(rawArguments);
    return {
      command,
      arguments: cleanedArguments,
      agent,
    };
  }

  // Strategy 2: /command after whitespace (mid-text, e.g. "some text /command args")
  // Use global regex and take the LAST match to prefer the rightmost /command.
  const midRegex = /\s\/(\S+)/g;
  let lastMidMatch: RegExpExecArray | null = null;
  let currentMatch: RegExpExecArray | null;
  while ((currentMatch = midRegex.exec(trimmedContent)) !== null) {
    lastMidMatch = currentMatch;
  }

  if (!lastMidMatch?.[1]) {
    return null;
  }

  // Reject //
  const slashPosition = lastMidMatch.index + 1;
  if (slashPosition > 0 && trimmedContent[slashPosition - 1] === '/') {
    return null;
  }

  const commandName = lastMidMatch[1].trim();
  if (!commandName) {
    return null;
  }

  const afterCommand = trimmedContent.slice(lastMidMatch.index + lastMidMatch[0].length);
  const rawArguments = afterCommand.trim();
  const { cleanedArguments, agent } = extractAgentFromArguments(rawArguments);

  return {
    command: commandName,
    arguments: cleanedArguments,
    agent,
  };
}

function hasProjectCommand(
  projectCommands: OpencodeCommandConfigRecord,
  commandId: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(projectCommands, commandId);
}

interface RuntimeCommandMatchOptions {
  skillMode: SlashCommandSkillMode;
  runtimeSkillNames: Set<string>;
  hasProjectOverride: boolean;
}

function isRunnableRuntimeCommand(
  command: SlashCommandRuntimeCatalogEntry,
  commandId: string,
  options: RuntimeCommandMatchOptions,
): boolean {
  if (command.name !== commandId || command.source === 'mcp') {
    return false;
  }

  if (options.hasProjectOverride) {
    return true;
  }

  const isRuntimeSkill = command.source === 'skill' || options.runtimeSkillNames.has(commandId);
  return !isRuntimeSkill || options.skillMode === 'direct';
}

function isRuntimeSkillCommand(
  command: SlashCommandRuntimeCatalogEntry,
  commandId: string,
  runtimeSkillNames: Set<string>,
): boolean {
  return command.name === commandId
    && (command.source === 'skill' || runtimeSkillNames.has(commandId));
}

function collectRuntimeSkillNames(runtimeSkills: SlashCommandRuntimeSkillEntry[]): Set<string> {
  return new Set(
    runtimeSkills
      .map((skill) => skill.name?.trim())
      .filter((name): name is string => Boolean(name)),
  );
}

function findMdFileCommand(commands: CommandMdFile[], commandId: string): CommandMdFile | null {
  return commands.find((command) => command.id === commandId) ?? null;
}

function expandMdFileCommandTemplate(template: string, argumentsText: string): string {
  const args = argumentsText.trim();
  const positionalArgs = args.split(/\s+/);
  return template.replace(/\$(\d+|[A-Za-z_][A-Za-z0-9_]*)/g, (token, name: string) => {
    if (/^\d+$/.test(name)) {
      return positionalArgs[Number(name) - 1] ?? '';
    }

    if (name === 'ARGUMENTS' || name === 'ARGS') {
      return args;
    }

    if (/^[A-Z][A-Z0-9_]*$/.test(name)) {
      return '';
    }

    return args;
  });
}

function parsePrefixedSkillCommand(argumentsText: string): ParsedSlashCommandInput | null {
  const normalizedArguments = argumentsText.trim();
  if (!normalizedArguments) {
    return null;
  }

  const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(normalizedArguments);
  if (!match?.[1]) {
    return null;
  }

  return {
    command: match[1],
    arguments: match[2] ?? '',
  };
}

function shouldUseBuiltInCompactCommand(
  parsedCommand: ParsedSlashCommandInput,
  hasProjectOverride: boolean,
  runtimeCommands: SlashCommandRuntimeCatalogEntry[],
): boolean {
  if (parsedCommand.command !== 'compact' || hasProjectOverride) {
    return false;
  }

  const runtimeCompact = runtimeCommands.find((command) => command.name === 'compact');
  return !runtimeCompact || runtimeCompact.source === 'command';
}

export class SlashCommandExecutionService {
  constructor(private readonly host: SlashCommandExecutionHost) {}

  async tryRunSlashCommand(content: string): Promise<boolean | string> {
    const parsedCommand = parseSlashCommandInput(content);
    if (!parsedCommand) {
      return false;
    }

    // Mid-text commands always fall through to prompt path
    if (!content.trimStart().startsWith('/')) {
      return false;
    }

    let executableCommand = parsedCommand;

    try {
      // Known skills fall through to prompt expansion (SkillContentExpander handles them)
      const runtimeSkills = await this.host.getRuntimeSkills();
      const runtimeSkillNames = collectRuntimeSkillNames(runtimeSkills);
      if (runtimeSkillNames.has(parsedCommand.command)) {
        return false;
      }

      const skillMode = this.host.getSlashCommandSkillMode();
      const projectCommands = await this.host.getProjectCommands();
      const isPrefixedSkillCommand =
        skillMode === 'skills-command' && parsedCommand.command === 'skills';

      if (isPrefixedSkillCommand) {
        const prefixedSkillCommand = parsePrefixedSkillCommand(parsedCommand.arguments);
        if (!prefixedSkillCommand) {
          return false;
        }

        const ready = await this.ensureServerReadyForCommand();
        if (!ready) {
          return true;
        }

        const runtimeCommands = await this.host.getRuntimeCommands();
        const runtimeSkillNames = collectRuntimeSkillNames(await this.host.getRuntimeSkills());
        const isRuntimeSkill = runtimeCommands.some((command) =>
          isRuntimeSkillCommand(command, prefixedSkillCommand.command, runtimeSkillNames)
        );
        if (!isRuntimeSkill) {
          return false;
        }

        executableCommand = prefixedSkillCommand;
      } else {
        const ready = await this.ensureServerReadyForCommand();
        if (!ready) {
          return true;
        }

        const hasProjectOverride = hasProjectCommand(projectCommands, parsedCommand.command);
        const runtimeCommands = await this.host.getRuntimeCommands();
        if (shouldUseBuiltInCompactCommand(parsedCommand, hasProjectOverride, runtimeCommands)) {
          return this.handleCompactCommand();
        }

        const runtimeSkillNames = skillMode === 'skills-command'
          ? collectRuntimeSkillNames(await this.host.getRuntimeSkills())
          : new Set<string>();
        const isRuntimeCommand = runtimeCommands.some((command) =>
          isRunnableRuntimeCommand(
            command,
            parsedCommand.command,
            { skillMode, runtimeSkillNames, hasProjectOverride },
          )
        );
        if (!isRuntimeCommand) {
          if (!hasProjectOverride) {
            const mdFileCommand = findMdFileCommand(
              await this.host.getMdFileCommands(),
              parsedCommand.command,
            );
            if (mdFileCommand) {
              return expandMdFileCommandTemplate(mdFileCommand.template, parsedCommand.arguments);
            }
          }

          return false;
        }
      }

      const conversation = await this.prepareExecutionContext();
      if (!conversation) {
        return true;
      }

      this.host.refreshActiveFocusContextPreview();
      this.host.startConversationSyncLoop();
      const commandInput: SessionCommandInput = {
        command: executableCommand.command,
        arguments: executableCommand.arguments,
        placeholderContext: this.buildPlaceholderContext(conversation),
      };
      if (executableCommand.agent) {
        commandInput.agent = executableCommand.agent;
      }
      await this.host.runSessionCommand(conversation.openCodeSessionId, commandInput);
      await this.host.syncVisibleConversationInBackground();
      return true;
    } catch (error) {
      logger.error(`Failed to run slash command /${executableCommand.command}:`, error);
      this.host.notifySlashCommandFailed(executableCommand.command, error);
      return true;
    }
  }

  private async handleCompactCommand(): Promise<boolean> {
    const ready = await this.ensureServerReadyForCommand();
    if (!ready) {
      return true;
    }

    const conversation = await this.prepareExecutionContext();
    const sessionId = conversation?.openCodeSessionId;
    if (!sessionId) {
      new Notice(t('slashCommand.compact.noSession'));
      return true;
    }

    await this.host.runCompactSession(sessionId);
    return true;
  }

  private async ensureServerReadyForCommand(): Promise<boolean> {
    const availability = await this.host.getServerAvailability();
    await this.host.refreshServerStatusBadge();
    if (availability === 'running' || availability === 'external') {
      return true;
    }

    return this.host.ensureServerReadyForChat(availability);
  }

  private async prepareExecutionContext(): Promise<Conversation | null> {
    const conversation = await this.host.ensureConversationReady();
    if (!conversation) {
      return null;
    }

    const tabId = this.host.getActiveTabId();
    if (!tabId || !this.host.ensureTabRuntime(tabId)) {
      return null;
    }

    if (this.host.isTabForegroundBusy(tabId)) {
      this.host.notifyForegroundBusy();
      return null;
    }

    return conversation;
  }

  private buildPlaceholderContext(conversation: Conversation): SessionCommandTemplateContext {
    const focusPreview = this.host.getActiveFocusContextPreview();
    return {
      vaultPath: this.host.getVaultPath(),
      currentNotePath: this.resolveCurrentNotePath(conversation, focusPreview),
      currentSelection: this.resolveCurrentSelection(focusPreview),
      externalContextPaths: conversation.externalContextPaths ?? [],
      conversationTitle: conversation.title,
    };
  }

  private resolveCurrentNotePath(
    conversation: Conversation,
    focusPreview: FocusContextPreview | null,
  ): string {
    return focusPreview?.path ?? conversation.currentNote ?? '';
  }

  private resolveCurrentSelection(focusPreview: FocusContextPreview | null): string {
    if (focusPreview?.kind !== 'selection') {
      return '';
    }

    return focusPreview.textSnapshot ?? '';
  }
}

export function createSlashCommandExecutionHost(
  deps: SlashCommandExecutionHostDependencies,
): SlashCommandExecutionHost {
  return {
    ensureConversationReady: async () => {
      if (!deps.getCurrentConversation()) {
        await deps.createNewConversation();
      }

      return deps.getCurrentConversation();
    },
    getActiveTabId: () => deps.getActiveTabId(),
    ensureTabRuntime: (tabId) => Boolean(tabId && deps.ensureTabRuntimeState(tabId)),
    isTabForegroundBusy: (tabId) => (tabId ? deps.isTabForegroundBusy(tabId) : false),
    notifyForegroundBusy: () => deps.notifyForegroundBusy(),
    getServerAvailability: () => deps.getServerAvailability(),
    refreshServerStatusBadge: () => deps.chatHeaderPresenter.refreshServerStatusBadge(),
    ensureServerReadyForChat: (availability) => deps.ensureServerReadyForChat(availability),
    getProjectCommands: async () => deps.opencodeConfigManager?.getCommandConfig() ?? {},
    getRuntimeCommands: async () => {
      const runtimeCommands = await deps.openCodeServiceSdk.command.list();
      return Array.isArray(runtimeCommands) ? runtimeCommands : [];
    },
    getRuntimeSkills: async () => {
      const runtimeSkills = await deps.openCodeServiceSdk.app.skills();
      return Array.isArray(runtimeSkills) ? runtimeSkills : [];
    },
    getMdFileCommands: async () => loadCommandsFromConfigDir(deps.opencodeConfigManager?.getConfigDir()),
    getSlashCommandSkillMode: () => deps.getSlashCommandSkillMode(),
    getVaultPath: () => deps.getVaultPath(),
    refreshActiveFocusContextPreview: () =>
      deps.composerContextViewFacade.refreshActiveFocusContextPreview(),
    getActiveFocusContextPreview: () =>
      deps.getTabRuntimeState(deps.getActiveTabId())?.focusContextPreview ?? null,
    runSessionCommand: (sessionId, input) =>
      deps.openCodeService.runSessionCommand(sessionId, input),
    runCompactSession: (sessionId) => deps.runCompactSession(sessionId),
    startConversationSyncLoop: () =>
      deps.conversationSyncBridgePorts.getLoopControl().startConversationSyncLoop(),
    syncVisibleConversationInBackground: () =>
      deps.conversationSyncBridgePorts.getVisibleSyncFollowUp().syncVisibleConversationInBackground(),
    notifySlashCommandFailed: (commandId, error) =>
      deps.notifySlashCommandFailed(commandId, error),
  };
}
