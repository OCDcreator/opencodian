import { Notice } from 'obsidian';

import type { ResolvedModelSelection } from '../../../core/config/modelConfig';
import { t } from '../../../i18n';
import type { ModelSelectorSelection } from '../ui/modelSelector/types';
import { loadCommandsFromConfigDir } from './CommandMdFileLoader';
import type {
  CompactSessionOpenCodeService,
  SlashCommandExecutionHost,
  SlashCommandExecutionHostDependencies,
} from './SlashCommandExecutionService';

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

export function createSlashCommandExecutionHost(
  deps: SlashCommandExecutionHostDependencies,
): SlashCommandExecutionHost {
  return {
    ensureConversationReady: async () => {
      if (!deps.getCurrentConversation()) await deps.createNewConversation();
      return deps.getCurrentConversation();
    },
    getCurrentConversation: () => deps.getCurrentConversation(),
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
    revertSession: (sessionId, messageID) => deps.openCodeService.revertSession(sessionId, messageID),
    unrevertSession: (sessionId) => deps.openCodeService.unrevertSession(sessionId),
    shareSession: async (sessionId) => {
      try {
        const s = await deps.openCodeService.shareSession(sessionId);
        const share = (s as Record<string, unknown>)?.share as Record<string, unknown> | undefined;
        return share?.url as string ?? null;
      } catch { return null; }
    },
    unshareSession: async (sessionId) => {
      try { await deps.openCodeService.unshareSession(sessionId); return true; }
      catch { return false; }
    },
    createNewConversation: () => deps.createNewConversation(),
    startConversationSyncLoop: () =>
      deps.conversationSyncBridgePorts.getLoopControl().startConversationSyncLoop(),
    syncVisibleConversationInBackground: () =>
      deps.conversationSyncBridgePorts.getVisibleSyncFollowUp().syncVisibleConversationInBackground(),
    notifySlashCommandFailed: (commandId, error) =>
      deps.notifySlashCommandFailed(commandId, error),
  };
}
