import { Notice } from 'obsidian';

import type {
  SessionCommandInput,
  SessionCommandTemplateContext,
} from '../../../core/opencode/OpenCodeSessionControlOrchestrator';
import {
  type Conversation,
  getConversationBackendSessionId,
  type OpencodeCommandConfigRecord,
  type SlashCommandSkillMode,
} from '../../../core/types';
import { t } from '../../../i18n';
import { createLogger } from '../../../shared';
import type { FocusContextPreview } from '../composerContext';
import type { TabId } from '../tabs';
import type { CommandMdFile } from './CommandMdFileLoader';
import type { SendPreparationServerAvailability } from './MessageSendPreparationService';

const logger = createLogger('SlashCommandExecutionService');
export type SlashCommandServerAvailability = SendPreparationServerAvailability;
export interface SlashCommandRuntimeCatalogEntry { name?: string; source?: string }
export interface SlashCommandRuntimeSkillEntry { name?: string }
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

export interface SlashCommandExecutionHost {
  ensureConversationReady(): Promise<Conversation | null>;
  /** Returns the current active conversation without side effects, or null. */
  getCurrentConversation?(): Conversation | null;
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
  revertSession(sessionId: string, messageID: string): Promise<boolean>;
  unrevertSession(sessionId: string): Promise<boolean>;
  shareSession(sessionId: string): Promise<string | null>;
  unshareSession(sessionId: string): Promise<boolean>;
  createNewConversation(): Promise<void>;
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
  ensureServerReadyForChat: (availability: Exclude<SlashCommandServerAvailability, 'running' | 'external'>) => Promise<boolean>;
  opencodeConfigManager: { getCommandConfig(): Promise<OpencodeCommandConfigRecord>; getConfigDir(): string } | null;
  getSlashCommandSkillMode: () => SlashCommandSkillMode;
  openCodeServiceSdk: { command: { list(): Promise<unknown> }; app: { skills(): Promise<unknown> } };
  openCodeService: {
    runSessionCommand(sessionId: string, input: SessionCommandInput): Promise<unknown>;
    revertSession(sessionId: string, messageID: string, partID?: string): Promise<boolean>;
    unrevertSession(sessionId: string): Promise<boolean>;
    shareSession(sessionId: string): Promise<unknown>;
    unshareSession(sessionId: string): Promise<unknown>;
  };
  runCompactSession: (sessionId: string) => Promise<boolean>;
  getVaultPath: () => string | null;
  composerContextViewFacade: { refreshActiveFocusContextPreview(): void };
  getTabRuntimeState: (tabId: TabId | null) => { focusContextPreview?: FocusContextPreview | null } | null;
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
    const match = /^@([a-zA-Z0-9_-]+)[.,;:!?]*$/.exec(token);
    if (match) agentTokens.push(match[1]);
    else remainingTokens.push(token);
  }
  return {
    cleanedArguments: remainingTokens.join(' '),
    agent: agentTokens.length > 0 ? agentTokens[agentTokens.length - 1] : undefined,
  };
}

function parseSlashCommandInput(content: string): ParsedSlashCommandInput | null {
  const trimmedContent = content.trim();
  if (!trimmedContent || trimmedContent.startsWith('//')) return null;

  if (trimmedContent.startsWith('/')) {
    const commandBody = trimmedContent.slice(1);
    if (!commandBody || /^\s/.test(commandBody)) return null;
    const commandMatch = /^(\S+)(?:\s+([\s\S]*))?$/.exec(commandBody);
    if (!commandMatch) return null;
    const command = commandMatch[1]?.trim() ?? '';
    if (!command) return null;
    const { cleanedArguments, agent } = extractAgentFromArguments(commandMatch[2] ?? '');
    return { command, arguments: cleanedArguments, agent };
  }

  const midRegex = /\s\/(\S+)/g;
  let lastMidMatch: RegExpExecArray | null = null;
  let currentMatch: RegExpExecArray | null;
  while ((currentMatch = midRegex.exec(trimmedContent)) !== null) lastMidMatch = currentMatch;
  if (!lastMidMatch?.[1]) return null;
  if (lastMidMatch.index > 0 && trimmedContent[lastMidMatch.index] === '/') return null;
  const commandName = lastMidMatch[1].trim();
  if (!commandName) return null;

  const afterCommand = trimmedContent.slice(lastMidMatch.index + lastMidMatch[0].length);
  const rawArguments = afterCommand.trim();
  const { cleanedArguments, agent } = extractAgentFromArguments(rawArguments);

  return {
    command: commandName,
    arguments: cleanedArguments,
    agent,
  };
}

function hasProjectCommand(projectCommands: OpencodeCommandConfigRecord, commandId: string): boolean {
  return Object.prototype.hasOwnProperty.call(projectCommands, commandId);
}

interface RuntimeCommandMatchOptions {
  skillMode: SlashCommandSkillMode;
  runtimeSkillNames: Set<string>;
  hasProjectOverride: boolean;
}

function isRunnableRuntimeCommand(
  command: SlashCommandRuntimeCatalogEntry, commandId: string, options: RuntimeCommandMatchOptions,
): boolean {
  if (command.name !== commandId || command.source === 'mcp') return false;
  if (options.hasProjectOverride) return true;
  const isSkill = command.source === 'skill' || options.runtimeSkillNames.has(commandId);
  return !isSkill || options.skillMode === 'direct';
}

function isRuntimeSkillCommand(
  command: SlashCommandRuntimeCatalogEntry, commandId: string, runtimeSkillNames: Set<string>,
): boolean {
  return command.name === commandId && (command.source === 'skill' || runtimeSkillNames.has(commandId));
}

function collectRuntimeSkillNames(runtimeSkills: SlashCommandRuntimeSkillEntry[]): Set<string> {
  return new Set(runtimeSkills.map((s) => s.name?.trim()).filter((n): n is string => Boolean(n)));
}

function findMdFileCommand(commands: CommandMdFile[], commandId: string): CommandMdFile | null {
  return commands.find((c) => c.id === commandId) ?? null;
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

const SYNTHETIC_BUILTIN_COMMAND_IDS = new Set(['compact', 'undo', 'redo', 'new', 'share', 'unshare']);

function shouldUseBuiltInSyntheticCommand(
  parsedCommand: ParsedSlashCommandInput,
  hasProjectOverride: boolean,
  runtimeCommands: SlashCommandRuntimeCatalogEntry[],
  mdFileCommands: CommandMdFile[],
): boolean {
  if (!SYNTHETIC_BUILTIN_COMMAND_IDS.has(parsedCommand.command) || hasProjectOverride) {
    return false;
  }
  if (mdFileCommands.some((c) => c.id === parsedCommand.command)) {
    return false;
  }
  const runtimeMatch = runtimeCommands.find((command) => command.name === parsedCommand.command);
  return !runtimeMatch || runtimeMatch.source === 'command';
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

    // Claude Code backend: all slash commands fall through to raw send.
    // Claude natively handles its own /commands; intercepting them here
    // would route through OpenCode's runSessionCommand which rejects non-opencode backends.
    const currentConversation = this.host.getCurrentConversation?.();
    if (currentConversation && (currentConversation.backend ?? 'opencode') === 'claude-code') {
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
        const mdFileCommands = await this.host.getMdFileCommands();
        if (shouldUseBuiltInSyntheticCommand(parsedCommand, hasProjectOverride, runtimeCommands, mdFileCommands)) {
          return this.handleSyntheticBuiltinCommand(parsedCommand.command);
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
            const mdFileCommand = findMdFileCommand(mdFileCommands, parsedCommand.command);
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
      if (!this.ensureOpenCodeConversationForCommand(conversation, executableCommand.command)) {
        return true;
      }
      const sessionId = getConversationBackendSessionId(conversation);
      if (!sessionId) {
        this.host.notifySlashCommandFailed(executableCommand.command, new Error('No backend session available'));
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
      await this.host.runSessionCommand(sessionId, commandInput);
      await this.host.syncVisibleConversationInBackground();
      return true;
    } catch (error) {
      logger.error(`Failed to run slash command /${executableCommand.command}:`, error);
      this.host.notifySlashCommandFailed(executableCommand.command, error);
      return true;
    }
  }

  private ensureOpenCodeConversationForCommand(conversation: Conversation, commandId: string): boolean {
    const backend = conversation.backend ?? 'opencode';
    if (backend === 'opencode') return true;
    this.host.notifySlashCommandFailed(commandId, new Error('No OpenCode session available'));
    return false;
  }

  private async handleSyntheticBuiltinCommand(commandId: string): Promise<boolean> {
    const ready = await this.ensureServerReadyForCommand();
    if (!ready) return true;
    switch (commandId) {
      case 'compact': return this.handleCompactCommand();
      case 'undo': return this.handleUndoCommand();
      case 'redo': return this.handleRedoCommand();
      case 'new': return this.handleNewCommand();
      case 'share': return this.handleShareCommand();
      case 'unshare': return this.handleUnshareCommand();
      default: return false;
    }
  }

  private async handleCompactCommand(): Promise<boolean> {
    const conversation = await this.prepareExecutionContext();
    const backend = conversation?.backend ?? 'opencode';
    const sessionId = conversation ? getConversationBackendSessionId(conversation) : undefined;
    if (!sessionId || backend !== 'opencode') { new Notice(t('slashCommand.compact.noSession')); return true; }
    await this.host.runCompactSession(sessionId);
    return true;
  }

  private async handleUndoCommand(): Promise<boolean> {
    const conversation = await this.prepareExecutionContext();
    if (!conversation) { return true; }
    const backend = conversation?.backend ?? 'opencode';
    const sessionId = getConversationBackendSessionId(conversation);
    if (!sessionId || backend !== 'opencode') { new Notice(t('slashCommand.undo.noSession')); return true; }
    const lastUserMsg = [...conversation.messages].reverse()
      .find((m) => m.role === 'user' && m.sourceMessageId);
    if (!lastUserMsg?.sourceMessageId) { new Notice(t('slashCommand.undo.noUserMessage')); return true; }
    try {
      const ok = await this.host.revertSession(sessionId, lastUserMsg.sourceMessageId);
      new Notice(t(ok ? 'slashCommand.undo.success' : 'slashCommand.undo.failed'));
      if (ok) await this.host.syncVisibleConversationInBackground();
    } catch { new Notice(t('slashCommand.undo.failed')); }
    return true;
  }

  private async handleRedoCommand(): Promise<boolean> {
    const conversation = await this.prepareExecutionContext();
    if (!conversation) { return true; }
    const backend = conversation.backend ?? 'opencode';
    const sessionId = getConversationBackendSessionId(conversation);
    if (!sessionId || backend !== 'opencode') { new Notice(t('slashCommand.redo.noSession')); return true; }
    try {
      const ok = await this.host.unrevertSession(sessionId);
      new Notice(t(ok ? 'slashCommand.redo.success' : 'slashCommand.redo.failed'));
      if (ok) await this.host.syncVisibleConversationInBackground();
    } catch { new Notice(t('slashCommand.redo.failed')); }
    return true;
  }

  private async handleNewCommand(): Promise<boolean> {
    await this.host.createNewConversation();
    return true;
  }

  private async handleShareCommand(): Promise<boolean> {
    const conversation = await this.prepareExecutionContext();
    const backend = conversation?.backend ?? 'opencode';
    const sessionId = conversation ? getConversationBackendSessionId(conversation) : undefined;
    if (!sessionId || backend !== 'opencode') { new Notice(t('slashCommand.share.noSession')); return true; }
    new Notice(t('slashCommand.share.starting'));
    const url = await this.host.shareSession(sessionId);
    if (url) { await navigator.clipboard.writeText(url); new Notice(t('slashCommand.share.success')); }
    else { new Notice(t('slashCommand.share.failed')); }
    return true;
  }

  private async handleUnshareCommand(): Promise<boolean> {
    const conversation = await this.prepareExecutionContext();
    const backend = conversation?.backend ?? 'opencode';
    const sessionId = conversation ? getConversationBackendSessionId(conversation) : undefined;
    if (!sessionId || backend !== 'opencode') { new Notice(t('slashCommand.unshare.noSession')); return true; }
    const ok = await this.host.unshareSession(sessionId);
    new Notice(t(ok ? 'slashCommand.unshare.success' : 'slashCommand.unshare.failed'));
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
    if (!conversation) return null;
    const tabId = this.host.getActiveTabId();
    if (!tabId || !this.host.ensureTabRuntime(tabId)) return null;
    if (this.host.isTabForegroundBusy(tabId)) { this.host.notifyForegroundBusy(); return null; }
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
    return focusPreview?.kind === 'selection' ? focusPreview.textSnapshot ?? '' : '';
  }
}
