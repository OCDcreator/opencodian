import type {
  SessionCommandInput,
  SessionCommandTemplateContext,
} from '../../../core/opencode/OpenCodeSessionControlOrchestrator';
import type {
  Conversation,
  OpencodeCommandConfigRecord,
} from '../../../core/types';
import { createLogger } from '../../../shared';
import type { FocusContextPreview } from '../composerContext';
import type { TabId } from '../tabs';
import type { SendPreparationServerAvailability } from './MessageSendPreparationService';

const logger = createLogger('SlashCommandExecutionService');

export type SlashCommandServerAvailability = SendPreparationServerAvailability;

export interface SlashCommandRuntimeCatalogEntry {
  name?: string;
  source?: string;
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
  getVaultPath(): string | null;
  refreshActiveFocusContextPreview(): void;
  getActiveFocusContextPreview(): FocusContextPreview | null;
  runSessionCommand(sessionId: string, input: SessionCommandInput): Promise<unknown>;
  startConversationSyncLoop(): void;
  syncVisibleConversationInBackground(): Promise<void>;
  notifySlashCommandFailed(commandId: string, error: unknown): void;
}

interface ParsedSlashCommandInput {
  arguments: string;
  command: string;
}

function parseSlashCommandInput(content: string): ParsedSlashCommandInput | null {
  const trimmedContent = content.trim();
  if (!trimmedContent.startsWith('/') || trimmedContent.startsWith('//')) {
    return null;
  }

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

  return {
    command,
    arguments: commandMatch[2] ?? '',
  };
}

function hasProjectCommand(
  projectCommands: OpencodeCommandConfigRecord,
  commandId: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(projectCommands, commandId);
}

function isRunnableRuntimeCommand(
  command: SlashCommandRuntimeCatalogEntry,
  commandId: string,
): boolean {
  return command.name === commandId
    && command.source !== 'mcp'
    && command.source !== 'skill';
}

export class SlashCommandExecutionService {
  constructor(private readonly host: SlashCommandExecutionHost) {}

  async tryRunSlashCommand(content: string): Promise<boolean> {
    const parsedCommand = parseSlashCommandInput(content);
    if (!parsedCommand) {
      return false;
    }

    try {
      const projectCommands = await this.host.getProjectCommands();
      const isProjectCommand = hasProjectCommand(projectCommands, parsedCommand.command);

      if (!isProjectCommand) {
        const ready = await this.ensureServerReadyForCommand();
        if (!ready) {
          return true;
        }

        const runtimeCommands = await this.host.getRuntimeCommands();
        const isRuntimeCommand = runtimeCommands.some((command) =>
          isRunnableRuntimeCommand(command, parsedCommand.command)
        );
        if (!isRuntimeCommand) {
          return false;
        }
      }

      const ready = isProjectCommand ? await this.ensureServerReadyForCommand() : true;
      if (!ready) {
        return true;
      }

      const conversation = await this.prepareExecutionContext();
      if (!conversation) {
        return true;
      }

      this.host.refreshActiveFocusContextPreview();
      this.host.startConversationSyncLoop();
      await this.host.runSessionCommand(conversation.openCodeSessionId, {
        command: parsedCommand.command,
        arguments: parsedCommand.arguments,
        placeholderContext: this.buildPlaceholderContext(conversation),
      });
      await this.host.syncVisibleConversationInBackground();
      return true;
    } catch (error) {
      logger.error(`Failed to run slash command /${parsedCommand.command}:`, error);
      this.host.notifySlashCommandFailed(parsedCommand.command, error);
      return true;
    }
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
