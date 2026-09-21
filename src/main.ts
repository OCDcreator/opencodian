/* eslint-disable simple-import-sort/imports -- Entry-point bootstrap imports stay manually clustered by startup seam so owner-guarded wiring changes do not create unrelated reorder churn. */
import * as fs from 'fs';
import type { ElicitationRequest, ElicitationResult } from '@anthropic-ai/claude-agent-sdk';
import type { Editor } from 'obsidian';
import { addIcon, MarkdownView, Notice, normalizePath, Plugin, TFile, TFolder } from 'obsidian';
import * as path from 'path';
import { presentPiUiRequest } from './features/chat/services/PiExtensionUiHost';
import { OPENCODIAN_APP_ICON_ID } from './shared/brandingWordmark';

import { ModelConfigService, ModelPricingService, OpencodeConfigManager } from './core/config';
import { setAgentServiceRegistry } from './core/agents/AgentCapability';
import {
  computeBackendEnvironmentFingerprints,
  detectChangedBackends,
  resolveBackendEnvironment,
} from './core/agents/BackendEnvironment';
import { InlineEditController } from './features/inline-edit/InlineEditController';
import { InlineCompletionController } from './features/inline-edit/InlineCompletionController';
import { inlineCompletionGhostExtension } from './features/inline-edit/InlineCompletionGhost';
import { buildInlineCompletionSystemPrompt } from './features/inline-edit/InlineCompletionPrompt';
import type { BackendModelSelection } from './core/agents/backend/AgentAuxQueryCapability';
import type { InlineCompletionTarget } from './features/inline-edit/InlineCompletionService';
import { InlineCompletionService } from './features/inline-edit/InlineCompletionService';
import { createInlineEditAutoLinkProcessor } from './features/inline-edit/InlineEditAutoLink';
import { confirmInlineEditDocumentReplace } from './features/inline-edit/InlineEditConfirmModal';
import { inlineEditAtTriggerExtension } from './features/inline-edit/InlineEditAtTrigger';
import {
  findMarkdownViewForView,
  inlineEditSelectionAffordanceExtension,
} from './features/inline-edit/InlineEditSelectionAffordance';
import type { InlineEditChoice, InlineEditContextFile, InlineEditHost } from './features/inline-edit/InlineEditHost';
import { createInlineEditPluginHost, resolveCompletionOverride } from './features/inline-edit/InlineEditPluginHost';
import { inlineEditOverlayTrackerExtension } from './features/inline-edit/InlineEditInputOverlay';
import { ProviderIconService } from './utils/icons/ProviderIconService';
import { CLAUDE_CODE_EFFORT_VARIANTS, CODEX_EFFORT_VARIANTS } from './core/agents/backend/BackendModelCatalog';
import {
  normalizeInlineEditEffortOverrides,
  normalizeInlineEditModelOverrides,
} from './core/types';
import {
  getConversationSessionBackendService,
  hasSessionCreationCapability,
} from './core/agents/backend/AgentBackendRouting';
import { AgentServiceRegistry } from './core/agents/backend/AgentServiceRegistry';
import { ClaudeCodeAdapter } from './core/agents/backend/ClaudeCodeAdapter';
import { wireHiddenAdapters } from './core/agents/backend/AgentAdapterWiring';
import {
  buildClaudeCodeElicitationContent,
  buildClaudeCodeElicitationQuestionRequest,
  buildClaudeCodeUserDialogQuestionRequest,
  buildClaudeCodeUserDialogResult,
  normalizeClaudeCodeElicitationContent,
} from './core/agents/backend/ClaudeCodeElicitationBridge';
import { adaptMcpConfigForClaude } from './core/agents/backend/ClaudeCodeMcpConfigAdapter';
import { type ClaudeCodePermissionBridgeHostContext, createClaudeCodePermissionBridgeHost } from './core/agents/backend/ClaudeCodeDefaultPermissionHost';
import { ClaudeCodePermissionBridge, createClaudeCodePermissionBridge } from './core/agents/backend/ClaudeCodePermissionBridge';
import { loadClaudeCodeSdk } from './core/agents/backend/ClaudeCodeSdkLoader';
import { CodexAdapter } from './core/agents/backend/CodexAdapter';
import { type CodexApprovalHostContext, createCodexApprovalBridgeHost } from './core/agents/backend/CodexDefaultApprovalHost';
import { OpenCodeAdapter } from './core/agents/backend/OpenCodeAdapter';
import { OpenCodeService, SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS } from './core/opencode';
import { RemoteControlService } from './core/remotecontrol';
import { OpenCodeSessionTraceService } from './core/opencode/diagnostics';
import { ClaudeSessionTraceService, collectClaudeCodeKnownSecrets, CodexSessionTraceService } from './core/agents/backend/diagnostics';
import { DiagnosticsRuntimeCoordinator } from './app/diagnostics';
import { MemoryRuntimeCoordinator, VaultEmbeddingFileSystem, VaultIndexFileSystem } from './app/memory';
import {
  createOpenAiCompatibleEmbeddingClient,
  type EmbeddingClient,
  isIndexablePath,
  VaultEmbeddingIndexService,
  VaultIndexService,
} from './core/memory';
import { PdfIndexFileSystem } from './app/pdf/PdfIndexFileSystem';
import { PdfEngineLoader, PdfIndexService } from './core/pdf';
import { PdfChatIntegration } from './features/chat/services/PdfChatIntegration';
import { BatchOrganizeCoordinator, BatchOrganizeModal, BatchRevertConfirmModal } from './app/batchOrganize';
import { CanvasIntegrationController } from './features/canvas-integration/CanvasIntegrationController';
import { CanvasGenerationFlow, type CanvasPickedEntry } from './features/canvas-integration/CanvasGenerationFlow';
import type { CanvasAuxTarget } from './features/canvas-integration/CanvasNodeRewriteService';
import { chooseContextFiles } from './features/chat/ui/ContextFilePickerModal';
import { ContextFileCatalogIndex, type ContextFileCatalog } from './features/chat/services/ContextFileCatalogIndex';
import { ObsidianToolingCoordinator } from './app/obsidianTooling';
import { migrateOpenCodeCapabilitySettings } from './core/opencode/OpenCodeCapabilitySettingsMigration';
import { OpenCodianSettingsRuntimeCoordinator } from './core/runtime/OpenCodianSettingsRuntimeCoordinator';
import { OpenCodianStartupCoordinator } from './core/runtime/OpenCodianStartupCoordinator';
import { PluginRuntimeCoordinator } from './app/runtime/PluginRuntimeCoordinator';
import { StorageService } from './core/storage';
import { ConversationFullMessageCache } from './core/storage/ConversationFullMessageCache';
import { normalizeConversationLinkedNotePath } from './core/storage/ConversationMetadataCache';
import { EditRevertService } from './core/storage/EditRevertService';
import {
  ConversationMarkdownExportService,
  type ConversationExportVault,
} from './core/storage/ConversationMarkdownExportService';
import { TurnCompletionSoundService } from './features/chat/services/TurnCompletionSoundService';
import {
  buildWebViewerContextItem,
  getActiveWebViewerTabContext,
  isWebViewerAvailable,
} from './features/chat/services/WebViewerContextService';
import { RelevantNotesView, VIEW_TYPE_RELEVANT_NOTES } from './features/chat/RelevantNotesView';
import { ImageAssetStorage, type ImageAssetVault } from './core/storage/ImageAssetStorage';
import { createRequestUrlImageGenTransport, ImageGenerationService } from './core/agents/imagegen/ImageGenerationService';
import { ImageGenerationChatController, type ImageGenerationChatPorts } from './features/chat/services/ImageGenerationChatController';
import { ImageGenerationModal } from './features/chat/ui/ImageGenerationModal';
import type { InlineEditImageGenDeps } from './features/inline-edit/InlineEditImageGen';
import { PluginUpdateService } from './core/update/PluginUpdateService';
import type {
  ChatAppearanceSettings,
  ChatMessage,
  Conversation,
  OpenCodianSettings,
  ThemePresetDefinition,
  ThemePresetId,
} from './core/types';
import {
  getConversationBackendSessionId,
  getCurrentPlatformDebugLogPath,
  getCurrentPlatformKey,
  getServerBaseUrl,
  isLocalServerMode,
  normalizeLobehubIconVariant,
  normalizeProviderIconColorMode,
  VIEW_TYPE_OPENCODIAN,
} from './core/types';
import { prepareLoadedSettingsBootstrapState } from './core/types/settingsLoadNormalization';
import { OpenCodianView } from './features/chat/OpenCodianView';
import { createChatDiagnosticsCoordinatorFactory } from './features/chat/services/ChatDiagnosticsCoordinator';
import { ContextAttachmentBuilder } from './features/chat/services/ContextAttachmentBuilder';
import { OpenCodianSettingTab } from './features/settings/OpenCodianSettings';
import { broadcastModelsLoadedToSettingsViews, broadcastServerStatusToSettingsViews, registerSettingsView } from './features/settings/SettingsViewRegistrar';
import { getLocale, setLocale, t } from './i18n';
import {
  createLogger,
  getRecentLogText,
  getVaultBasePath,
  sanitizeDiagnosticReport,
  setClaudeCodeDebugChannelSettings,
  setDebugLoggingEnabled,
  setDebugModuleSettings,
  setDebugRefreshIntervalMs,
  setInlineSerializedDebugLogArgsEnabled,
} from './shared';
import { describeTextForTokenCount } from './shared/tokenEstimate';
import { registerBuiltinGlassAdapters } from './utils/glass';
import type { AgentBackendKind } from './core/types/chat';

const logger = createLogger('OpenCodian');
const OPENCODIAN_APP_ICON_SVG = `
  <g class="opencodian-app-icon-layer opencodian-app-icon-layer--light">
    <rect x="10" y="0" width="80" height="100" fill="#211E1E"/>
    <rect x="30" y="40" width="40" height="40" fill="#CFCECD"/>
  </g>
  <g class="opencodian-app-icon-layer opencodian-app-icon-layer--dark">
    <rect x="10" y="0" width="80" height="100" fill="#F1ECEC"/>
    <rect x="30" y="40" width="40" height="40" fill="#4B4646"/>
  </g>
`;

type LoadedManagedServerState = Awaited<ReturnType<StorageService['loadManagedServerState']>>;
type ConversationCachePinProvider = () => Iterable<string>;

/** R-F7: key-set + value equality for fingerprint maps (both are string→string). */
function environmentFingerprintsEqual(
  left: Record<string, string>,
  right: Record<string, string>,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  return leftKeys.every((key) => left[key] === right[key]);
}

// BUILD_ID is injected at build time via esbuild define
declare const BUILD_ID: string;

/** Main plugin class */
export default class OpenCodianPlugin extends Plugin {
  settings: OpenCodianSettings;
  storage: StorageService;
  openCodeService: OpenCodeService;
  /**
   * Diagnostics runtime coordinator — owns construction + flush/dispose of the
   * three backend trace services. Assigned during `handleBootstrapOpenCodeRuntime`.
   * The per-backend getters below delegate to it so existing consumers
   * (`this.plugin.openCodeTraceService` etc.) keep working byte-for-byte; Tasks
   * 12/13 migrate the consumers and then these shims are removed.
   */
  private diagnosticsCoordinator: DiagnosticsRuntimeCoordinator | null = null;
  /** Backend-neutral memory runtime (app.memory-runtime owner). Constructed during onload. */
  memoryRuntime: MemoryRuntimeCoordinator | null = null;
  /** R-B4 Obsidian native tooling runtime (app.obsidian-tooling owner). Constructed during onload. */
  obsidianToolingRuntime: ObsidianToolingCoordinator | null = null;
  /** Backend-neutral edit-revert snapshot service (core.storage owner, R-B3).
   * Constructed during startup after settings load; the chat runtime and the
   * modified-files sidebar consume it through `EditRevertServicePort`.
   */
  editRevertService: EditRevertService | null = null;

  /**
   * Conversation → vault Markdown export (core.storage owner, advantage-parity
   * R-D1). Manual exports are purely additive vault notes; the opt-in
   * auto-export refresh only notes this feature itself created. main.ts only
   * composes it (vault/adapter seams + settings getter + notice hooks).
   */
  conversationExportService: ConversationMarkdownExportService | null = null;

  /**
   * advantage-parity R-D3: turn-completion chime. Off by default; only
   * background-task conversations or an unfocused window may make noise.
   */
  turnCompletionSoundService: TurnCompletionSoundService | null = null;

  /**
   * R-C6 remote-drive loopback listener (core.remotecontrol owner). main.ts
   * only composes: it injects the narrow session driver bound to the
   * OpenCodeService public API plus the settings getter, applies settings at
   * startup, and disposes on unload. While `remoteControlEnabled` is false
   * the service constructs no `http.Server` at all — zero runtime cost.
   */
  remoteControlService: RemoteControlService | null = null;

  /**
   * R-C2 text-to-image runtime. Generation is a plugin-side HTTP invocation
   * (never an agent session); asset writes are the plugin's first binary
   * write into the user content area (core.storage owner). main.ts only
   * composes these and bridges them into the two entry points.
   */
  imageGenerationService: ImageGenerationService | null = null;
  imageAssetStorage: ImageAssetStorage | null = null;
  imageGenerationChatController: ImageGenerationChatController | null = null;

  /**
   * R-C1 whole-vault retrieval index (core.memory service + app-side vault
   * adapter). Dormant unless `vaultRetrievalEnabled` turns on: no listeners,
   * no indexing and no injected context while off. main.ts only composes.
   */
  vaultIndexService: VaultIndexService | null = null;
  /**
   * R-E4 (advantage-parity): optional embedding channel over the R-C1
   * lexical index. Dormant while semanticRetrievalEnabled is off.
   */
  vaultEmbeddingIndexService: VaultEmbeddingIndexService | null = null;
  /**
   * R-C4 PDF runtime: the lazily required extraction engine loader (zero
   * startup cost — pdf-engine.js is only required on first PDF attach or
   * index build), the opt-in page-anchored index service, and the pdf-view
   * chat integration. main.ts only composes.
   */
  pdfEngineLoader: PdfEngineLoader | null = null;
  pdfIndexService: PdfIndexService | null = null;
  pdfChatIntegration: PdfChatIntegration | null = null;
  /**
   * R-C5 canvas runtime (feature.canvas-integration + core.canvas). The
   * controller owns the per-leaf runtime gate and the node-AI entries; the
   * flow owns generation. main.ts only composes them, registers the two
   * commands and injects the Notice sink — no canvas logic lives here.
   */
  canvasIntegration: CanvasIntegrationController | null = null;
  canvasGenerationFlow: CanvasGenerationFlow | null = null;
  /** R-B5 batch note organizing runtime (app.batch-organize owner). Constructed during onload. */
  batchOrganizeCoordinator: BatchOrganizeCoordinator | null = null;
  /**
   * Delegating getters returning the coordinator's typed backend ports. The
   * declared types are non-nullable to match the prior stored fields (so
   * consumers using `.` access keep typechecking), but the runtime value is
   * undefined before bootstrap completes — exactly mirroring the prior
   * uninitialized stored fields, where pre-bootstrap reads returned undefined.
   * Consumers that may run before bootstrap use optional chaining
   * (`this.plugin.openCodeTraceService?.store`). Shims removed in Task 12/13.
   */
  /** @deprecated delegate to DiagnosticsRuntimeCoordinator; removed in Task 12/13. */
  get openCodeTraceService(): OpenCodeSessionTraceService {
    return this.diagnosticsCoordinator?.openCode as OpenCodeSessionTraceService;
  }
  /** @deprecated delegate to DiagnosticsRuntimeCoordinator; removed in Task 12/13. */
  get codexTraceService(): CodexSessionTraceService {
    return this.diagnosticsCoordinator?.codex as CodexSessionTraceService;
  }
  /** @deprecated delegate to DiagnosticsRuntimeCoordinator; removed in Task 12/13. */
  get claudeTraceService(): ClaudeSessionTraceService {
    return this.diagnosticsCoordinator?.claude as ClaudeSessionTraceService;
  }
  agentServiceRegistry: AgentServiceRegistry;
  claudeCodePermissionBridge: ClaudeCodePermissionBridge | null = null;
  claudeCodePermissionHostContext: ClaudeCodePermissionBridgeHostContext = { getActiveTabId: () => null };
  codexApprovalHostContext: CodexApprovalHostContext = { getActiveTabId: () => null };
  opencodeConfigManager: OpencodeConfigManager | null = null;
  modelConfigService: ModelConfigService | null = null;
  modelPricingService: ModelPricingService | null = null;
  pluginUpdateService: PluginUpdateService;
  settingsTab?: InstanceType<typeof OpenCodianSettingTab>;
  /** Inline-edit controller; edits are bucketed per editor (R-A5 parallelism). */
  inlineEditController: InlineEditController | null = null;
  private inlineEditHost: InlineEditHost | null = null;
  /** R-C3 warm completion session pool + per-editor ghost controller. */
  private inlineCompletionPool: InlineCompletionService | null = null;
  private inlineCompletionController: InlineCompletionController | null = null;

  private conversations: Conversation[] = [];
  private conversationsLoaded = false;
  private conversationsLoadPromise: Promise<void> | null = null;
  private readonly conversationFullMessageCache = new ConversationFullMessageCache({ maxFullConversations: 12 });
  private readonly conversationCachePinProviders = new Set<ConversationCachePinProvider>();
  private conversationFullMessageCacheClock = 0;
  private runtimeCoordinator = new PluginRuntimeCoordinator({
    getSettings: () => this.settings ?? null,
    getOpenCodeService: () => this.openCodeService ?? null,
    getPluginUpdateService: () => this.pluginUpdateService ?? null,
    getPluginVersion: () => this.manifest.version,
    getOpenCodianLeaves: () => this.app.workspace.getLeavesOfType(VIEW_TYPE_OPENCODIAN),
    hasEnabledBackend: (backendId: AgentBackendKind) =>
      this.settings?.enabledBackends?.includes(backendId) ?? false,
    applyProviderIconColorMode: () => this.applyProviderIconColorMode(),
    startConfiguredLocalServerIfNeeded: () => this.startConfiguredLocalServerIfNeeded(),
    logServerStatusSnapshot: (source?: string) => this.logServerStatusSnapshot(source),
    onModelsLoaded: () => {
      this.settingsTab?.onModelsLoaded();
      this.settingsTab?.refreshServerStatusDisplay();
      broadcastModelsLoadedToSettingsViews(this);
      broadcastServerStatusToSettingsViews(this);
    },
  });
  private settingsPersistenceWritable = true;
  private settingsPersistenceWarningShown = false;
  private startupCoordinator = new OpenCodianStartupCoordinator();
  private settingsRuntimeCoordinator: OpenCodianSettingsRuntimeCoordinator | null = null;
  /**
   * advantage-parity R-F7: in-memory copy of the last persisted per-backend
   * environment fingerprints, so repeated saves never re-notify or rewrite
   * runtime.json when the environment did not change.
   */
  private environmentFingerprintsCache: Record<string, string> | null = null;

  private getSettingsRuntimeCoordinator(): OpenCodianSettingsRuntimeCoordinator {
    if (!this.settingsRuntimeCoordinator) {
      this.settingsRuntimeCoordinator = new OpenCodianSettingsRuntimeCoordinator({
        getSettings: () => this.settings,
        setSettings: (settings) => { this.settings = settings; },
        getOpenCodeService: () => this.openCodeService,
        getStorageService: () => this.storage,
        getVaultBasePath: () => getVaultBasePath(this.app),
        refreshOpenCodianViews: (options) => this.runtimeCoordinator.refreshOpenCodianViews(options),
        invalidateSlashCommandMenuCatalogs: (options) => this.runtimeCoordinator.invalidateSlashCommandMenuCatalogs(options),
        scheduleDeferredRuntimeWarmup: () => this.runtimeCoordinator.scheduleDeferredRuntimeWarmup(),
        applyProviderIconColorMode: () => this.applyProviderIconColorMode(),
        getOpenCodianLeaves: () => this.app.workspace.getLeavesOfType(VIEW_TYPE_OPENCODIAN),
        onSettingsPersistenceBlocked: (message) => this.warnSettingsPersistenceBlocked(message),
      });
    }
    return this.settingsRuntimeCoordinator;
  }

  async onload() {
    const startupVaultPath = getVaultBasePath(this.app) ?? 'Unavailable';
    logger.always(`OpenCodian ${this.manifest.version} BUILD_ID=${BUILD_ID} startup begin (vault=${startupVaultPath})`);

    await this.startupCoordinator.execute({
      manifest: this.manifest,
      getVaultBasePath: () => getVaultBasePath(this.app),
      registerAppIcon: () => addIcon(OPENCODIAN_APP_ICON_ID, OPENCODIAN_APP_ICON_SVG),
      onPrepareStartupState: (coordinator) => this.handlePrepareStartupState(coordinator),
      onBootstrapOpenCodeRuntime: (initialManagedServerState) => this.handleBootstrapOpenCodeRuntime(initialManagedServerState),
      onRegisterWorkspaceIntegration: () => this.registerWorkspaceIntegration(),
      onScheduleDeferredRuntimeWarmup: () => this.runtimeCoordinator.scheduleDeferredRuntimeWarmup(),
    });
    void this.runtimeCoordinator.checkPluginUpdateOnStartup();
  }

  private warnSettingsPersistenceBlocked(message: string): void {
    logger.error(message);
    if (this.settingsPersistenceWarningShown) {
      return;
    }

    this.settingsPersistenceWarningShown = true;
    new Notice(message, 12000);
  }

  private async handlePrepareStartupState(coordinator: OpenCodianStartupCoordinator): Promise<LoadedManagedServerState> {
    this.storage = new StorageService(this);
    await coordinator.measureStartupStep('storage.initialize', () => this.storage.initialize());
    await coordinator.measureStartupStep('loadSettings', () => this.loadSettings());
    this.editRevertService = new EditRevertService({
      app: this.app,
      isEnabled: () => this.settings?.editRevertEnabled ?? true,
      getSnapshotLimitBytes: () => (this.settings?.editRevertSnapshotLimitMb ?? 50) * 1024 * 1024,
    });
    await coordinator.measureStartupStep('editRevert.initialize', () =>
      this.editRevertService?.initialize() ?? Promise.resolve());
    // advantage-parity R-D1: conversation export reads the stored message
    // structure and writes user-visible vault notes. Auto-export stays a
    // no-op while `conversationExport.autoExport` is false (the scheduler
    // returns before touching any timer or state file).
    this.conversationExportService = new ConversationMarkdownExportService({
      vault: this.createConversationExportVaultAdapter(),
      adapter: this.app.vault.adapter,
      getSettings: () => this.settings?.conversationExport,
      onUserEditedAutoExport: (_conversationId, path) => {
        new Notice(t('chat.export.autoDisabledUserEdited', { path }), 10000);
      },
    });
    // advantage-parity R-D3: notification audio, composed once. The custom
    // path resolves through Obsidian's resource path (vault-internal files).
    this.turnCompletionSoundService = new TurnCompletionSoundService({
      isWindowFocused: () => document.hasFocus(),
      getResourcePath: (vaultRelativePath) => {
        const file = this.app.vault.getAbstractFileByPath(normalizePath(vaultRelativePath));
        return file && file instanceof TFile
          ? this.app.vault.getResourcePath(file)
          : null;
      },
      showNotice: (message) => { new Notice(message, 8000); },
    });
    // R-C2 text-to-image: generation is plugin-side HTTP (never an agent
    // session); the asset write is the plugin's first binary write into the
    // user content area (W-asset), and both entry points register generated
    // assets with the edit-revert service above (R-B3 coverage).
    this.imageGenerationService = new ImageGenerationService(createRequestUrlImageGenTransport());
    this.imageAssetStorage = new ImageAssetStorage(this.createImageAssetVaultAdapter());
    this.imageGenerationChatController = new ImageGenerationChatController(
      this.createImageGenerationChatPorts(),
    );
    // R-C1: the retrieval index attaches its fs adapter and settings getter;
    // onSettingsChanged() is a no-op while vaultRetrievalEnabled is false.
    this.vaultIndexService = new VaultIndexService();
    this.vaultIndexService.attach(new VaultIndexFileSystem(this.app), () => this.settings);
    await coordinator.measureStartupStep('vaultIndex.applySettings', () =>
      this.vaultIndexService?.onSettingsChanged() ?? Promise.resolve());
    // R-E4: the optional embedding channel over the lexical index. The
    // service is a full no-op while semanticRetrievalEnabled is off (no
    // client, no index pass, no vault events); when on, it reuses the R-C1
    // scope rules and embeds incrementally with pacing. The degradation
    // notices surface honestly through the localized callback.
    this.vaultEmbeddingIndexService = new VaultEmbeddingIndexService(
      new VaultEmbeddingFileSystem(this.app),
      () => this.resolveSemanticEmbeddingClient(),
      VaultEmbeddingIndexService.scopeMatcher(
        this.settings?.vaultRetrievalExcludedPaths ?? [],
      ),
    );
    await coordinator.measureStartupStep('vaultEmbeddings.applySettings', () =>
      this.vaultEmbeddingIndexService?.onSettingsChanged(
        this.settings?.semanticRetrievalEnabled ?? false,
      ) ?? Promise.resolve());
    // R-C4: the PDF engine loader performs NO work at startup (the pdf.js
    // artifact is required on first use); the index service is dormant while
    // pdfIndexEnabled is off, and the viewer integration only mounts on pdf
    // leaves it can actually probe.
    this.pdfEngineLoader = new PdfEngineLoader({
      // `manifest.dir` is VAULT-RELATIVE in Obsidian; the loader resolves it
      // against the same adapter basePath every other absolute-path consumer
      // uses (shared/vault.ts getVaultBasePath) before createRequire.
      getPluginDir: () => this.manifest.dir,
      getVaultBasePath: () => getVaultBasePath(this.app),
    });
    this.pdfIndexService = new PdfIndexService();
    this.pdfIndexService.attach(
      new PdfIndexFileSystem(this.app),
      () => this.settings,
      () => this.pdfEngineLoader!.load(),
    );
    await coordinator.measureStartupStep('pdfIndex.applySettings', () =>
      this.pdfIndexService?.onSettingsChanged() ?? Promise.resolve());
    this.pdfChatIntegration = new PdfChatIntegration(this.app, {
      attachContextItemToActiveChat: async (item) => {
        await this.activateView();
        this.getOpenCodianView()?.attachContextItemToActiveTab(item);
      },
      openChat: async () => {
        await this.activateView();
      },
      getActiveConversation: () => this.getOpenCodianView()?.getActiveConversationSnapshot() ?? null,
      getEditRevert: () => this.editRevertService,
      buildPdfSelectionItem: (input) => {
        const builder = new ContextAttachmentBuilder(this.app, {
          getServerMode: () => this.settings.server.mode,
          loadPdfEngine: () => this.pdfEngineLoader!.load(),
        });
        return builder.buildPdfSelectionContextItem(input);
      },
    });
    this.pdfChatIntegration.attach();
    // R-C5: canvas generation + node-level AI. The runtime confirmation gate
    // lives in the controller (per leaf); when the Canvas API surface cannot
    // be proven, nothing mounts and the debug panel reports why — the plugin
    // keeps working untouched. Creation/file writes register with the revert
    // service above (R-B3 coverage).
    this.canvasGenerationFlow = new CanvasGenerationFlow({
      app: this.app,
      getEditRevert: () => this.editRevertService,
      getActiveConversationId: () => this.resolvePluginWriteConversationId(),
      resolveAuxTarget: () => this.resolveCanvasAuxTarget(),
      pickNotes: () => this.pickCanvasNotes(),
      notify: (message) => { new Notice(message); },
    });
    this.canvasIntegration = new CanvasIntegrationController({
      app: this.app,
      getEditRevert: () => this.editRevertService,
      getActiveConversationId: () => this.resolvePluginWriteConversationId(),
      resolveAuxTarget: () => this.resolveCanvasAuxTarget(),
      notify: (message) => { new Notice(message); },
    });
    this.canvasIntegration.attach();
    // R-B5 batch organizing composes on top of the R-B3 snapshot layer: the
    // coordinator refuses to execute when the snapshot service is unavailable.
    this.batchOrganizeCoordinator = new BatchOrganizeCoordinator({
      app: this.app,
      editRevert: this.editRevertService,
    });
    this.pluginUpdateService = new PluginUpdateService({
      app: this.app,
      manifest: this.manifest,
      initialState: this.settings.pluginUpdateState,
      persistState: async (state) => {
        this.settings.pluginUpdateState = state;
        await this.saveSettings({
          syncService: false,
          reloadModels: false,
          syncConfig: false,
          applyUi: false,
        });
      },
    });
    await coordinator.measureStartupStep('loadModelPricingCatalog', async () => {
      this.modelPricingService = new ModelPricingService({
        storage: this.storage,
        getOverrides: () => this.settings.modelPricingOverrides,
      });
      await this.modelPricingService.load();
    });
    await coordinator.measureStartupStep('applyLoadedSettingsStartupEffects', () => {
      this.applyLoadedSettingsStartupEffects();
    });
    return coordinator.measureStartupStep('loadManagedServerState', () => this.storage.loadManagedServerState());
  }

  private applyLoadedSettingsStartupEffects(): void {
    registerBuiltinGlassAdapters();
    this.applyLoggerSettings();
    this.applyProviderIconColorMode();
    setLocale(this.settings.locale as 'en' | 'zh');
  }

  private async handleBootstrapOpenCodeRuntime(
    initialManagedServerState: LoadedManagedServerState,
  ): Promise<void> {
    await this.startupCoordinator.measureStartupStep('initializeOpencodeConfig', () => {
      const vaultPath = getVaultBasePath(this.app);
      if (vaultPath) {
        return OpencodeConfigManager.ensureInitialized(vaultPath, this.settings.permissionMode);
      }
      return Promise.resolve();
    });

    await this.startupCoordinator.measureStartupStep('constructOpenCodeService', () => {
      // The DiagnosticsRuntimeCoordinator owns construction of all three backend
      // trace services (OpenCode → Codex → Claude, pinned order) plus their
      // flush/dispose lifecycle. main.ts no longer constructs any trace service
      // directly (Phase 3 Task 11). The per-backend getters above delegate to it.
      this.diagnosticsCoordinator = new DiagnosticsRuntimeCoordinator({
        openCodeSettings: () => this.settings.backendSettings.opencode.sessionTrace,
        codexSettings: () => this.settings.backendSettings.codex.sessionTrace,
        claudeSettings: () => this.settings.backendSettings.claudeCode.sessionTrace,
        vaultPath: getVaultBasePath(this.app) ?? undefined,
        buildIdentity: () => this.getDebugBuildIdentityText(),
        openCodeKnownSecrets: () => [
          this.settings.server.auth.password,
          this.settings.server.auth.token,
        ].filter(Boolean),
        codexKnownSecrets: () => [
          this.settings.server.auth.password, this.settings.server.auth.token,
          this.settings.backendSettings.codex.apiKey,
        ].filter(Boolean),
        claudeKnownSecrets: () => collectClaudeCodeKnownSecrets(this.settings.backendSettings.claudeCode),
        openCodeRuntimeMetadata: () => ({
          serverMode: this.settings.server.mode,
          baseUrl: getServerBaseUrl(this.settings.server),
          modelSourceMode: this.settings.modelSourceMode,
          pluginIsolationMode: this.settings.pluginIsolationMode,
        }),
        codexRuntimeMetadata: () => ({
          serverMode: this.settings.server.mode,
          modelSourceMode: this.settings.modelSourceMode,
          pluginIsolationMode: this.settings.pluginIsolationMode,
        }),
        claudeRuntimeMetadata: () => ({
          serverMode: this.settings.server.mode,
          modelSourceMode: this.settings.modelSourceMode,
          pluginIsolationMode: this.settings.pluginIsolationMode,
        }),
        // Inject the main.ts 'OpenCodian' logger so dispose warnings preserve the
        // prior `[OpenCodian]` console/export scope byte-for-byte.
        logger,
      });
      this.openCodeService = new OpenCodeService(
        this.settings,
        {
          onServerStatusChange: (status) => {
            this.handleOpenCodeServerStatusChange(status);
          },
          onError: (error) => {
            new Notice(`OpenCode error: ${error.message}`);
          },
          onModelsLoaded: (_providers) => {
            this.handleModelsLoaded();
          },
        },
        {
          initialManagedServerState,
          sdkFeatureFlags: SDK_FEATURE_FLAG_ROLLOUT_DEFAULTS,
          tracePort: this.openCodeTraceService,
          onManagedServerStateChange: (state) => {
            void this.storage.saveManagedServerState(state);
          },
          getExtraServerSpawnEnv: () => this.getDomainEnvFor('opencode'),
        },
      );

      // Wire agent service registry
      this.agentServiceRegistry = new AgentServiceRegistry();
      const openCodeAdapter = new OpenCodeAdapter(this.openCodeService);
      const userAdapters: import('./core/agents/backend/AgentService').AgentService[] = [openCodeAdapter];
      const vaultPath = getVaultBasePath(this.app);
      if (vaultPath) {
        const permissionHost = createClaudeCodePermissionBridgeHost(() => this.claudeCodePermissionHostContext);
        this.claudeCodePermissionBridge = createClaudeCodePermissionBridge(permissionHost);
        userAdapters.push(new ClaudeCodeAdapter({
          vaultPath,
          settings: this.settings.backendSettings.claudeCode,
          pathToClaudeCodeExecutable: this.getBundledClaudeCodeExecutablePath(vaultPath),
          getDomainEnvironment: () => this.getDomainEnvFor('claude-code'),
          sdkLoader: loadClaudeCodeSdk,
          permissionBridge: this.claudeCodePermissionBridge,
          tracePort: this.claudeTraceService,
          onElicitation: (request, options) => this.handleClaudeCodeElicitation(request, options),
          onUserDialog: (request, options) => this.handleClaudeCodeUserDialog(request, options),
          supportedDialogKinds: ['refusal_fallback_prompt'],
          mcpConfigLoader: () => this.readClaudeMcpServers(),
        }));
      }
      wireHiddenAdapters({
        registry: this.agentServiceRegistry,
        adapters: userAdapters,
        vaultPath: vaultPath ?? undefined,
        pluginDir: vaultPath
          ? path.join(vaultPath, this.manifest.dir?.trim() || path.join('.obsidian', 'plugins', this.manifest.id?.trim() || 'opencodian'))
          : '',
        codexSettings: this.settings.backendSettings.codex,
        codexTracePort: this.codexTraceService,
        getPiSettings: () => this.settings.backendSettings.pi,
        getCodexExtraEnv: () => this.getDomainEnvFor('codex'),
        getPiExtraEnv: () => this.getDomainEnvFor('pi'),
        onPiUiRequest: (request, signal) => presentPiUiRequest(this.app, request, signal),
      });
      this.agentServiceRegistry.setEnabledBackends(this.settings.enabledBackends);
      if (this.settings.activeBackend) {
        this.agentServiceRegistry.setActive(this.settings.activeBackend);
      }
      setAgentServiceRegistry(this.agentServiceRegistry);

      // MemoryRuntimeCoordinator owns construction of the backend-neutral
      // memory runtime on the plugin's behalf (app.memory-runtime owner).
      this.memoryRuntime = new MemoryRuntimeCoordinator({
        app: this.app,
        openCodeService: this.openCodeService,
        getSettings: () => this.settings.memory,
        getConversationMessages: async (conversationId) => {
          try {
            const conversation = await this.storage.loadFullConversation(conversationId);
            return conversation?.messages ?? null;
          } catch {
            return null;
          }
        },
      });
      this.memoryRuntime.registerCommands(this);
      this.initObsidianToolingRuntime();

      // Wire the Codex approval bridge host to the mutable context the chat
      // view populates on mount.  Mirrors the Claude permission host wiring.
      const codexAdapter = this.agentServiceRegistry.get('codex');
      if (codexAdapter instanceof CodexAdapter) {
        codexAdapter.setApprovalHost(
          createCodexApprovalBridgeHost(() => this.codexApprovalHostContext),
        );
      }

      // Auto-start the active adapter so it reaches connected state.
      // OpenCodeAdapter.start() is idempotent (ServerManager returns if already running).
      // Non-OpenCode adapters (Codex, Claude-Code) create their connection here.
      const activeKind = this.agentServiceRegistry.getActiveKind();
      if (activeKind) {
        const activeAdapter = this.agentServiceRegistry.get(activeKind);
        if (activeAdapter) {
          activeAdapter.start().catch(() => {
            // Best effort: startup continues even if adapter fails to connect.
          });
        }
      }
    });

    await this.startupCoordinator.measureStartupStep('configureVaultScopedServices', () => {
      this.configureVaultScopedServices();
    });

    await this.startupCoordinator.measureStartupStep('loadConversations', () => this.loadConversations());
    // R-F2: this belongs to the plugin lifecycle, not individual chat views.
    // Conversations are preloaded above, so the handler can update every
    // matching binding even when no OpenCodianView is currently open.
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      if (file instanceof TFile) {
        void this.followConversationLinkedNoteRename(oldPath, file.path);
      }
    }));

    this.inlineEditHost = createInlineEditPluginHost({
      getVaultPath: () => getVaultBasePath(this.app) ?? '',
      getLocale: () => getLocale(),
      getRegistry: () => this.agentServiceRegistry ?? null,
      getActiveChatBackend: () => this.getActiveChatBackendKind(),
      getActiveChatModel: () => this.getActiveChatModelRef(),
      getSettings: () => ({
        enabled: this.settings.inlineEditEnabled,
        modelOverrides: this.settings.inlineEditModelOverrides,
        effortOverrides: this.settings.inlineEditEffortOverrides,
        presetPrompts: this.settings.inlineEditPresetPrompts,
        maxConcurrentEdits: this.settings.inlineEditMaxConcurrentEdits,
        documentModeEnabled: this.settings.inlineEditDocumentModeEnabled,
      }),
      listModels: (kind) => this.listInlineEditModels(kind),
      listEfforts: (kind) => {
        if (kind === 'claude-code') {
          return CLAUDE_CODE_EFFORT_VARIANTS.map((id) => ({ id, label: id }));
        }
        if (kind === 'codex') {
          return CODEX_EFFORT_VARIANTS.map((id) => ({ id, label: id }));
        }
        return null;
      },
      setModelOverride: async (kind, ref) => {
        const next = { ...this.settings.inlineEditModelOverrides };
        if (ref === null) delete next[kind];
        else next[kind] = ref;
        this.settings.inlineEditModelOverrides = normalizeInlineEditModelOverrides(next);
        await this.saveSettings();
      },
      setEffortOverride: async (kind, id) => {
        const next = { ...this.settings.inlineEditEffortOverrides };
        if (id === null) delete next[kind];
        else next[kind] = id;
        this.settings.inlineEditEffortOverrides = normalizeInlineEditEffortOverrides(next);
        await this.saveSettings();
      },
      createProviderIcon: (providerId, size) => ProviderIconService.createIconElement(this.app, providerId, size),
      listContextFiles: () => this.listInlineEditContextFiles(),
      resolveContextFile: (path) => this.resolveInlineEditContextFile(path),
      listContextGroups: () => this.settings.contextGroups,
      applyAutoInternalLinks: this.createAutoInternalLinkBridge(),
      getImageGeneration: () => this.createInlineEditImageGenDeps(),
    });
    this.inlineEditController = new InlineEditController({
      host: this.inlineEditHost,
      confirmDocumentReplace: (info) => confirmInlineEditDocumentReplace(this.app, info),
    });

    this.configureInlineCompletion();
  }

  /**
   * R-C3 Alt ghost-text completion: the pool owns the warm read-only
   * sessions, the controller owns the per-editor ghost state machine, and
   * main.ts only composes them (no completion logic lives here).
   */
  private configureInlineCompletion(): void {
    this.inlineCompletionPool = new InlineCompletionService({
      host: {
        isEnabled: () => this.settings?.inlineCompletionEnabled ?? false,
        getLocale: () => getLocale(),
        getMaxChars: () => this.settings.inlineCompletionMaxChars,
        getNotePath: () => this.app.workspace.getActiveViewOfType(MarkdownView)?.file?.path ?? '',
        resolveCompletionTarget: () => this.resolveInlineCompletionTarget(),
        buildSystemPrompt: () =>
          buildInlineCompletionSystemPrompt(getLocale(), this.settings.inlineCompletionMaxChars),
      },
      // R-C3-D1: the pool's honesty notices (start failure, failure-chain,
      // write-tool audit) must reach the user — `notify` is required, and a
      // missing wiring now fails to compile instead of dying silently.
      notify: (message) => { new Notice(message); },
    });
    this.inlineCompletionController = new InlineCompletionController({
      pool: this.inlineCompletionPool,
      isEnabled: () => this.settings?.inlineCompletionEnabled ?? false,
      hasActiveInlineEdits: () => this.inlineEditController?.hasActiveEdits() ?? false,
      // R-C3-D1: the controller's pool-error reports (unsupported backend,
      // missing capability, unresolved model) must reach the user too.
      notify: (message) => { new Notice(message); },
    });
  }

  /**
   * R-C3: resolve the active backend's completion target for one pool call.
   * Model resolution reads the dedicated completion override first
   * (`inlineCompletionModelOverrides[kind]` — completions are latency-
   * sensitive, so a fast model can be pinned without touching inline edit)
   * and falls back to the inline-edit host's documented precedence (C3-Q3):
   * `inlineEditModelOverrides` → active chat tab model → backend default.
   * With the override map at its default (`{}`) the resolution is
   * byte-identical to the pre-setting behaviour. The system prompt rides the
   * backend's native seam.
   */
  private resolveInlineCompletionTarget(): InlineCompletionTarget {
    const adapter = this.inlineEditHost?.resolveAdapter() ?? null;
    const capability = adapter?.getInlineCompletion?.() ?? null;
    if (!adapter || !capability) {
      return { ok: false, reason: 'capability-unavailable', backend: adapter?.displayName ?? '' };
    }
    const dedicated = resolveCompletionOverride(
      adapter.kind,
      this.settings.inlineCompletionModelOverrides?.[adapter.kind],
    );
    let resolvedModel: { ok: true; model: BackendModelSelection | null } | { ok: false; error: string };
    if (dedicated) {
      resolvedModel = dedicated;
    } else {
      resolvedModel = adapter.resolveModel();
    }
    if (!resolvedModel.ok) {
      return { ok: false, reason: 'model-unavailable', detail: resolvedModel.error };
    }
    const workingDirectory = getVaultBasePath(this.app) ?? '';
    const locale = getLocale();
    const maxChars = this.settings.inlineCompletionMaxChars;
    const effort = adapter.getEffort();
    return {
      ok: true,
      backend: adapter.kind,
      displayName: adapter.displayName,
      workingDirectory,
      model: resolvedModel.model,
      effort: effort ?? null,
      startSession: () => capability.startInlineCompletionSession({
        systemPrompt: buildInlineCompletionSystemPrompt(locale, maxChars),
        workingDirectory,
        ...(resolvedModel.model ? { model: resolvedModel.model } : {}),
        ...(effort ? { effort } : {}),
      }),
    };
  }

  /**
   * R-C3 settings hook: the toggle is the pool's off switch. Turning the
   * feature off disposes every warm session immediately (acceptance 7);
   * turning it back on clears the per-cycle unsupported marks so a backend
   * gets a fresh start.
   */
  onInlineCompletionSettingChanged(enabled: boolean): void {
    if (!enabled) {
      // Off = no sessions, no network (acceptance 7, C3-Q1 reading). The
      // controller itself stays wired but gated: the extension falls through
      // on the first `isEnabled()` check, and the pool never starts sessions.
      void this.inlineCompletionPool?.disposeAll();
      return;
    }
    this.inlineCompletionPool?.resetUnsupported();
  }

  /** Whole-document form gate (R-A6), also used by the command/menu checks. */
  private documentModeEnabled(): boolean {
    return this.settings?.inlineEditDocumentModeEnabled ?? true;
  }

  /**
   * R-B1 bridge: deterministic auto-internal-link pass over final generated
   * text. One construction serves both consumers — the inline edit result
   * (before the diff preview) and the chat finalization service (once the
   * turn's assistant text is final) — so heading verification through the
   * metadata cache and the matching rules cannot drift between the paths.
   * Strict no-op while `autoInternalLinkEnabled` is off. Public because the
   * chat runtime composition wires it into finalization.
   */
  createAutoInternalLinkBridge() {
    return createInlineEditAutoLinkProcessor({
      app: this.app,
      isEnabled: () => this.settings.autoInternalLinkEnabled,
      getExcludedTerms: () => this.settings.autoInternalLinkExcludedTerms,
    });
  }

  // --- R-C2 text-to-image composition ---------------------------------------

  /**
   * The vault slice W-asset needs, over Obsidian's real APIs. Placement goes
   * through `getAvailablePathForAttachments` (attachment folder setting +
   * Obsidian conflict numbering); removal goes through `vault.trash` like the
   * revert writeback. `getAvailablePathForAttachments` is runtime-verified
   * but untyped in current obsidian.d.ts, hence the guarded cast.
   */
  private createImageAssetVaultAdapter(): ImageAssetVault {
    const vault = this.app.vault;
    return {
      getAvailablePathForAttachments: async (fileName) => {
        const resolver = (vault as unknown as {
          getAvailablePathForAttachments?: (fileName: string) => Promise<string>;
        }).getAvailablePathForAttachments;
        if (!resolver) {
          throw new Error('This Obsidian version does not expose getAvailablePathForAttachments.');
        }
        return resolver.call(vault, fileName);
      },
      writeBinary: (path, data) => vault.adapter.writeBinary(normalizePath(path), data),
      exists: (path) => vault.adapter.exists(normalizePath(path)),
      trash: async (path) => {
        const file = vault.getAbstractFileByPath(normalizePath(path));
        if (!file) return false;
        try {
          await vault.trash(file, false);
          return true;
        } catch {
          return false;
        }
      },
    };
  }

  /**
   * advantage-parity R-D1: the export service's vault seam. Note writes go
   * through the VAULT API (`vault.create`/`vault.modify`) — never the raw
   * adapter — because Obsidian must index the new note for search/links;
   * `vault.createFolder` creates missing parents (probe-proven in
   * BatchOrganizeCoordinator).
   */
  private createConversationExportVaultAdapter(): ConversationExportVault {
    const vault = this.app.vault;
    return {
      getAbstractFileByPath: (path) => vault.getAbstractFileByPath(normalizePath(path)),
      createFolder: (path) => vault.createFolder(normalizePath(path)),
      create: (path, data) => vault.create(normalizePath(path), data),
      modify: async (path, data) => {
        // vault.modify is TFile-typed; resolve the file from our path seam
        // and fail loudly when it vanished between resolution and write.
        const file = vault.getAbstractFileByPath(normalizePath(path));
        if (!file) {
          throw new Error(`Cannot modify "${path}": the note no longer exists.`);
        }
        await vault.modify(file as TFile, data);
      },
      getAvailablePathForAttachments: async (fileName) => {
        const resolver = (vault as unknown as {
          getAvailablePathForAttachments?: (fileName: string) => Promise<string>;
        }).getAvailablePathForAttachments;
        if (!resolver) {
          throw new Error('This Obsidian version does not expose getAvailablePathForAttachments.');
        }
        return resolver.call(vault, fileName);
      },
      writeBinary: (path, data) => vault.adapter.writeBinary(normalizePath(path), data),
      exists: (path) => vault.adapter.exists(normalizePath(path)),
      trash: async (path) => {
        const file = vault.getAbstractFileByPath(normalizePath(path));
        if (!file) return false;
        try {
          await vault.trash(file, false);
          return true;
        } catch {
          return false;
        }
      },
      getFileMtime: async (path) => {
        const file = vault.getAbstractFileByPath(normalizePath(path));
        if (!file) return null;
        const stat = (file as TFile).stat;
        return typeof stat?.mtime === 'number' ? stat.mtime : null;
      },
    };
  }

  /** Chat-entry ports (design §3.5): generation first, writes only on insert click. */
  private createImageGenerationChatPorts(): ImageGenerationChatPorts {
    return {
      getConfiguration: () => ({
        models: this.settings.imageGenerationModels,
        maxWidth: this.settings.imageGenerationMaxWidth,
        cleanup: this.settings.imageGenerationAssetCleanup,
      }),
      generate: (model, prompt, signal) =>
        this.imageGenerationService?.generate(model, prompt, signal)
        ?? Promise.resolve({ ok: false as const, error: 'not ready', kind: 'http' as const }),
      saveAsset: (bytes, mimeType, baseName) =>
        this.imageAssetStorage!.save(bytes, mimeType, baseName),
      trashAsset: (path) => this.imageAssetStorage?.trash(path) ?? Promise.resolve(false),
      registerAsset: (assetPath, notePath) => {
        const conversationId = this.resolveImageGenConversationId();
        if (!conversationId) return;
        void this.editRevertService?.registerPluginCreatedAsset?.(conversationId, assetPath, [notePath]);
      },
      // D2 record-then-close: record the paired reference write explicitly,
      // then close the plugin asset round so revert skips the grace window.
      noteReferenceWrite: (notePath) => {
        const conversationId = this.resolveImageGenConversationId();
        if (!conversationId) return;
        void this.editRevertService?.notePluginWrite?.(conversationId, notePath);
      },
      endAssetCapture: () => {
        const conversationId = this.resolveImageGenConversationId();
        if (!conversationId) return;
        void this.editRevertService?.endBatchCapture?.(conversationId);
      },
      resolveInsertTarget: () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return null;
        return { editor: view.editor, notePath: view.file?.path ?? '' };
      },
      notify: (message) => { new Notice(message); },
    };
  }

  /**
   * Inline-edit-entry bridge (design §3.4). `null` (runtime not ready or no
   * configured model) hides the overlay chip instead of showing a dead one.
   */
  private createInlineEditImageGenDeps(): InlineEditImageGenDeps | null {
    const service = this.imageGenerationService;
    const storage = this.imageAssetStorage;
    if (!service || !storage) return null;
    const models = this.settings.imageGenerationModels;
    if (models.length === 0) return null;
    return {
      models,
      maxWidth: this.settings.imageGenerationMaxWidth,
      cleanup: this.settings.imageGenerationAssetCleanup,
      generate: (model, prompt, signal) => service.generate(model, prompt, signal),
      saveAsset: (bytes, mimeType, baseName) => storage.save(bytes, mimeType, baseName),
      trashAsset: (path) => storage.trash(path),
      registerAsset: (assetPath, notePath) => {
        const conversationId = this.resolveImageGenConversationId();
        if (!conversationId) return;
        void this.editRevertService?.registerPluginCreatedAsset?.(conversationId, assetPath, [notePath]);
      },
      // D2 record-then-close (same contract as the chat entry ports).
      noteReferenceWrite: (notePath) => {
        const conversationId = this.resolveImageGenConversationId();
        if (!conversationId) return;
        void this.editRevertService?.notePluginWrite?.(conversationId, notePath);
      },
      endAssetCapture: () => {
        const conversationId = this.resolveImageGenConversationId();
        if (!conversationId) return;
        void this.editRevertService?.endBatchCapture?.(conversationId);
      },
      notify: (message) => { new Notice(message); },
    };
  }

  /**
   * Conversation id a generated asset registers under: the active chat view's
   * conversation when one is open, else the most recently known conversation.
   * `null` honestly means the asset cannot be registered (no conversation
   * exists at all) — the generation flow still works, revert coverage does not.
   */
  private resolveImageGenConversationId(): string | null {
    return this.resolvePluginWriteConversationId();
  }

  /**
   * The conversation a PLUGIN-initiated write (R-C2 assets, R-C5 canvas) is
   * attributed to for R-B3 round capture: the active chat conversation, or
   * the first one. `null` means no revert coverage — callers must say so.
   */
  private resolvePluginWriteConversationId(): string | null {
    const active = this.getOpenCodianView()?.getActiveConversationIdForAssets() ?? null;
    if (active) return active;
    return this.conversations[0]?.id ?? null;
  }

  /**
   * R-C5: resolve the active backend's read-only aux session inputs for the
   * canvas flows. Same documented model precedence as inline edit / completion
   * (overrides -> active chat model -> backend default); `null` makes the
   * split option unavailable and the node rewrite say so honestly.
   */
  private resolveCanvasAuxTarget(): CanvasAuxTarget | null {
    const adapter = this.inlineEditHost?.resolveAdapter() ?? null;
    const capability = adapter?.getAuxQuery?.() ?? null;
    if (!adapter || !capability) {
      return null;
    }
    const resolved = adapter.resolveModel();
    if (!resolved.ok) {
      return null;
    }
    return {
      adapter,
      workingDirectory: getVaultBasePath(this.app) ?? '',
    };
  }

  /**
   * R-C5 generation source (design E3): the R-A7 multi-select picker is the
   * primary entry; R-B2 topic groups render as one-click rows that resolve to
   * their entries. Folder entries stay folders — the flow expands them.
   */
  private async pickCanvasNotes(): Promise<readonly CanvasPickedEntry[] | null> {
    let groupPicked: readonly CanvasPickedEntry[] | null = null;
    const picked = await chooseContextFiles(
      this.app,
      async () => this.buildCanvasPickerCatalog(),
      {
        groups: this.settings.contextGroups.map((group) => ({
          id: group.id,
          name: group.name,
          entryCount: group.entries.length,
        })),
        onAttachGroup: (groupId) => {
          const group = this.settings.contextGroups.find((candidate) => candidate.id === groupId);
          if (!group) return;
          groupPicked = group.entries.map((entry) => ({ path: entry.path, kind: entry.kind }));
        },
      },
    );
    const entries = picked.length > 0 ? picked : groupPicked;
    if (!entries || entries.length === 0) {
      return null;
    }
    return entries.map((entry) => ({
      path: entry.path,
      kind: entry instanceof TFolder ? 'folder' : 'file',
    }));
  }

  /** Markdown-file catalog for the canvas note picker (composition wiring only). */
  private buildCanvasPickerCatalog(): ContextFileCatalog {
    const index = new ContextFileCatalogIndex();
    for (const file of this.app.vault.getMarkdownFiles()) {
      index.appendBuildFile(file);
    }
    return index.getCatalog();
  }

  /** Open the chat entry's generation card (composer button and /image). */
  openImageGenerationCard(prefill = ''): void {
    if (!this.imageGenerationChatController) return;
    new ImageGenerationModal(this.app, this.imageGenerationChatController, prefill).open();
  }


  /**
   * Model choices for the inline-edit floating bar picker, per backend.
   * `null` keeps the chip but leaves the menu without model rows (no catalog).
   */
  private async listInlineEditModels(
    kind: AgentBackendKind,
  ): Promise<readonly InlineEditChoice[] | null> {    try {
      if (kind === 'claude-code') {
        const adapter = this.agentServiceRegistry?.get('claude-code') as {
          supportedModels?: () => Promise<Array<{ id: string; name: string }>>;
        } | undefined;
        const models = await adapter?.supportedModels?.();
        return (models ?? []).map((entry) => ({ id: entry.id, label: entry.name || entry.id }));
      }
      if (kind === 'codex') {
        const adapter = this.agentServiceRegistry?.get('codex') as {
          getModelList?: () => Promise<Array<{ slug: string; display_name?: string }> | null>;
        } | undefined;
        const models = await adapter?.getModelList?.();
        return (models ?? []).map((entry) => ({ id: entry.slug, label: entry.display_name || entry.slug }));
      }
      if (kind === 'opencode') {
        if (!this.modelConfigService) return null;
        const bundle = await this.modelConfigService.getCatalogs(
          this.settings.modelSourceMode,
          this.settings.disabledModelRefs,
        );
        const choices: InlineEditChoice[] = [];
        for (const provider of bundle.effective.providers) {
          for (const model of provider.models) {
            choices.push({ id: `${provider.id}/${model.id}`, label: `${provider.id}/${model.name || model.id}` });
          }
        }
        return choices;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Vault entries the inline-edit "add context" picker can offer.
   *
   * Text files plus folders (R-A7): files pass paths and the read-only aux
   * tools do the reading (§6.1 forbids inlining extra vault text); folder
   * entries tell the model the notes under them are reference material. Paths
   * containing `<` or `>` are left out because they would collide with the
   * prompt's tag protocol, and the picker is the only place a user could
   * choose them.
   */
  private listInlineEditContextFiles(): readonly InlineEditContextFile[] | null {
    if (!this.app.vault?.getFiles || !this.app.vault.getAllLoadedFiles) return null;
    const entries: InlineEditContextFile[] = [];
    for (const file of this.app.vault.getFiles()) {
      if (file.extension !== 'md' && file.extension !== 'txt') continue;
      if (/[<>]/.test(file.path)) continue;
      entries.push({ path: file.path, name: file.basename, kind: 'file' });
    }
    for (const folder of this.app.vault.getAllLoadedFiles()) {
      if (!(folder instanceof TFolder)) continue;
      if (folder.path === '/') continue;
      if (/[<>]/.test(folder.path)) continue;
      entries.push({ path: folder.path, name: folder.name, kind: 'folder' });
    }
    return entries.sort((left, right) => left.path.localeCompare(right.path));
  }

  /**
   * Resolve one dropped path against the vault for the inline-edit context
   * drop surface (R-A7). The `instanceof TFile | TFolder` check is the hard
   * gate: a path string that does not resolve to a vault entry — including
   * anything outside the vault — never becomes a context chip.
   */
  private resolveInlineEditContextFile(path: string): InlineEditContextFile | null {
    const abstract = this.app.vault.getAbstractFileByPath(path);
    if (abstract instanceof TFolder) {
      if (/[<>]/.test(abstract.path)) return null;
      return { path: abstract.path, name: abstract.name, kind: 'folder' };
    }
    if (abstract instanceof TFile) {
      if (abstract.extension !== 'md' && abstract.extension !== 'txt') return null;
      if (/[<>]/.test(abstract.path)) return null;
      return { path: abstract.path, name: abstract.basename, kind: 'file' };
    }
    return null;
  }

  /**
   * Whether inline edit can run right now.
   *
   * Used to hide the command and the editor menu entry rather than letting the
   * user trigger a command that immediately reports an error.
   */
  private canRunInlineEdit(): boolean {
    if (!this.settings?.inlineEditEnabled) return false;
    return this.inlineEditHost?.resolveAdapter()?.getAuxQuery() != null;
  }

  /** Backend of the active chat tab, falling back to the registry's active kind. */
  private getActiveChatBackendKind(): AgentBackendKind | null {
    const fromTab = this.getOpenCodianView()?.getActiveConversationBackendKind() ?? null;
    if (fromTab) return fromTab;
    return this.agentServiceRegistry?.getActiveKind() ?? this.settings?.activeBackend ?? null;
  }

  /** Effective `{ provider, model }` of the active chat tab, when known. */
  private getActiveChatModelRef(): { provider: string; model: string } | null {
    return this.getOpenCodianView()?.getActiveTabModelRef() ?? null;
  }

  private getBundledClaudeCodeExecutablePath(vaultPath: string): string {
    const pluginId = this.manifest.id?.trim() || 'opencodian';
    const pluginDir = this.manifest.dir?.trim()
      ? this.manifest.dir
      : path.join((this.app.vault as { configDir?: string }).configDir ?? '.obsidian', 'plugins', pluginId);
    const platformPackage = this.getClaudeAgentSdkPlatformPackageName();
    const binaryName = process.platform === 'win32' ? 'claude.exe' : 'claude';
    return path.join(
      vaultPath,
      pluginDir,
      'node_modules',
      '@anthropic-ai',
      platformPackage,
      binaryName,
    );
  }

  private async handleClaudeCodeElicitation(
    request: ElicitationRequest,
    options: { signal: AbortSignal },
  ): Promise<ElicitationResult> {
    if (options.signal.aborted) {
      return { action: 'cancel' };
    }

    const ctx = this.claudeCodePermissionHostContext;
    const renderer = ctx.elicitationCardRenderer;
    if (!renderer) {
      return { action: 'cancel' };
    }

    const questionRequest = buildClaudeCodeElicitationQuestionRequest(request);
    const response = await renderer.collectResponse(questionRequest, ctx.getActiveTabId());
    if (!response) {
      return { action: 'cancel' };
    }
    if (response.action !== 'accept') {
      return { action: response.action };
    }
    if (
      questionRequest.questions.length === 1
      && questionRequest.questions[0].options.some((option) => option.label === 'Decline')
      && response.answers?.[0]?.[0] === 'Decline'
    ) {
      return { action: 'decline' };
    }

    return {
      action: 'accept',
      content: normalizeClaudeCodeElicitationContent(response.content)
        ?? buildClaudeCodeElicitationContent(questionRequest, response.answers ?? [], request),
    };
  }

  /**
   * SDK >= 0.3.2xx `request_user_dialog` host callback (e.g. the CLI's
   * refusal-fallback prompt). Renders through the same shared question card as
   * elicitation. Any non-accept outcome maps to `{behavior: 'cancelled'}`,
   * which makes the CLI apply the dialog's default behavior — identical to the
   * pre-callback status quo, so the wiring is fail-safe.
   */
  private async handleClaudeCodeUserDialog(
    request: import('@anthropic-ai/claude-agent-sdk').UserDialogRequest,
    options: { signal: AbortSignal; requestId: string },
  ): Promise<import('@anthropic-ai/claude-agent-sdk').UserDialogResult | null> {
    if (options.signal.aborted) {
      return { behavior: 'cancelled' };
    }

    const ctx = this.claudeCodePermissionHostContext;
    const renderer = ctx.elicitationCardRenderer;
    if (!renderer) {
      // No chat surface mounted: send no structured answer so the CLI's park
      // deadline (or another attached client) resolves the dialog.
      return null;
    }

    const questionRequest = buildClaudeCodeUserDialogQuestionRequest(request);
    const response = await renderer.collectResponse(questionRequest, ctx.getActiveTabId());
    return buildClaudeCodeUserDialogResult(request.dialogKind, response);
  }

  private getClaudeAgentSdkPlatformPackageName(): string {
    const key = `${process.platform}-${process.arch}`;
    const packages: Record<string, string> = {
      'darwin-arm64': 'claude-agent-sdk-darwin-arm64',
      'darwin-x64': 'claude-agent-sdk-darwin-x64',
      'linux-arm64': 'claude-agent-sdk-linux-arm64',
      'linux-x64': 'claude-agent-sdk-linux-x64',
      'win32-arm64': 'claude-agent-sdk-win32-arm64',
      'win32-x64': 'claude-agent-sdk-win32-x64',
    };
    return packages[key] ?? `claude-agent-sdk-${process.platform}-${process.arch}`;
  }

  private configureVaultScopedServices(): void {
    const vaultPath = getVaultBasePath(this.app);
    if (vaultPath) {
      this.opencodeConfigManager = new OpencodeConfigManager(vaultPath);
      this.modelConfigService = new ModelConfigService(this.opencodeConfigManager, this.openCodeService, {
        // R-F8: user-declared caps ride the catalog boundary (fills missing
        // metadata only — never masks authoritative contextWindow values).
        getContextWindowOverrides: () => this.settings?.modelContextWindowOverrides ?? {},
      });
      this.openCodeService.setVaultPath(vaultPath);
      logger.debug(`Vault path set to: ${vaultPath}`);
      logger.debug(`Platform: ${process.platform}`);
    } else {
      this.opencodeConfigManager = null;
      this.modelConfigService = null;
      logger.warn('Could not get vault path, OpenCode will use global config');
    }
    // R-C6 remote control composes alongside the other vault-scoped services:
    // construct + applySettings + dispose only (no listener/auth logic here).
    this.initRemoteControl(vaultPath);
  }

  private async startConfiguredLocalServerIfNeeded(): Promise<void> {
    if (!isLocalServerMode(this.settings.server) || !this.settings.server.local.autoStart) {
      return;
    }

    // Skip server startup if OpenCode agent is not the active backend
    if (this.settings.activeBackend !== 'opencode') {
      logger.debug('OpenCode is not the active backend — skipping local server startup');
      return;
    }

    try {
      await this.openCodeService.start();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to start server';
      new Notice(`OpenCode: ${msg}`);
    }
  }

  private registerWorkspaceIntegration(): void {
    this.registerView(
      VIEW_TYPE_OPENCODIAN,
      (leaf) => new OpenCodianView(leaf, this, createChatDiagnosticsCoordinatorFactory({
        getOpenCodeTraceService: () => this.diagnosticsCoordinator?.openCode,
        getCodexTraceService: () => this.diagnosticsCoordinator?.codex,
        getClaudeTraceService: () => this.diagnosticsCoordinator?.claude,
      }))
    );

    // advantage-parity R-E3: the relevant-notes side panel (graph + R-C1
    // retrieval channels for the active note).
    this.registerView(
      VIEW_TYPE_RELEVANT_NOTES,
      (leaf) => new RelevantNotesView(leaf, this),
    );

    registerSettingsView(this);

    this.addRibbonIcon(OPENCODIAN_APP_ICON_ID, '打开 OpenCodian', () => {
      this.activateView();
    });

    this.registerPluginCommands();

    // Editor context-menu entry, mirroring the command. Registered once and
    // hidden per-invocation when inline edit cannot run.
    this.registerEvent(this.app.workspace.on('editor-menu', (menu, editor, view) => {
      if (!this.canRunInlineEdit()) return;
      menu.addItem((item) => {
        item.setTitle(t('inlineEdit.command.name'))
          .setIcon('pencil')
          .onClick(() => {
            this.inlineEditController?.open(editor, view);
          });
      });
    }));

    // Whole-document form (R-A6): same engine, document anchor, second
    // confirmation on accept. Hidden while the mode is disabled.
    this.registerEvent(this.app.workspace.on('editor-menu', (menu, editor, view) => {
      if (!this.canRunInlineEdit() || !this.documentModeEnabled()) return;
      menu.addItem((item) => {
        item.setTitle(t('inlineEdit.mode.document'))
          .setIcon('file-pen')
          .onClick(() => {
            this.inlineEditController?.open(editor, view, { mode: 'document' });
          });
      });
    }));

    // advantage-parity R-F9: file-explorer context menu attach — files,
    // folders, and PDFs ride the same entry builder as the `+` picker, so
    // the chips are identical to hand-picked entries on every backend.
    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
      if (!(file instanceof TFile) && !(file instanceof TFolder)) {
        return;
      }
      menu.addItem((menuItem) => {
        menuItem
          .setTitle(t('chat.context.fileMenu.attach'))
          .setIcon('plus-circle')
          .onClick(() => {
            void this.attachVaultEntryToActiveChatContext(file);
          });
      });
    }));

    // Floating "inline edit" button next to the active selection.
    this.registerEditorExtension(inlineEditSelectionAffordanceExtension({
      canShow: () => this.canRunInlineEdit() && (this.settings?.inlineEditSelectionAffordance ?? true),
      isEditing: () => this.inlineEditController?.hasActiveEdits() ?? false,
      openForView: (editorView) => {
        const view = findMarkdownViewForView(this.app, editorView);
        if (!view?.editor) return;
        this.inlineEditController?.open(view.editor, view);
      },
    }));

    // Typing `@` at the start of a line or right after whitespace opens the
    // panel at the cursor (R-A1, opt-in via `inlineEditTriggerAt`). The `@`
    // is consumed — it never reaches the document.
    this.registerEditorExtension(inlineEditAtTriggerExtension({
      canTrigger: () => (this.settings?.inlineEditTriggerAt ?? false) && this.canRunInlineEdit(),
      openForView: (editorView) => {
        const view = findMarkdownViewForView(this.app, editorView);
        if (!view?.editor || !view.file) return false;
        // Consume the `@` only when a new panel actually opened; otherwise the
        // character falls through to normal typing (at the cap, or when the
        // backend is unavailable).
        return this.inlineEditController?.open(view.editor, view) ?? false;
      },
    }));

    // Remaps the floating inline-edit bar's anchor through document changes.
    this.registerEditorExtension(inlineEditOverlayTrackerExtension());

    // R-A5: closing a note tab or switching files detaches the editor view;
    // dispose every inline edit that belonged to it (decorations + native
    // aux sessions). Both events are cheap and prune only detached views.
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => {
      void this.inlineEditController?.pruneDetachedEdits();
      this.prewarmInlineCompletionOnEditorFocus();
    }));
    this.registerInlineCompletionExtension();
    this.registerEvent(this.app.workspace.on('layout-change', () => {
      void this.inlineEditController?.pruneDetachedEdits();
    }));

    this.settingsTab = new OpenCodianSettingTab(this.app, this);
    this.addSettingTab(this.settingsTab);
  }

  /**
   * R-C3 Alt ghost-text completion. Registered once at load (Obsidian only
   * registers editor extensions there — the documented C3-Q1 deviation from
   * acceptance 7's literal wording); every entry point is gated per event
   * by `inlineCompletionEnabled`, so the off state is: no sessions, no
   * network, no decorations, one gated key handler (R-A1 precedent).
   */
  private registerInlineCompletionExtension(): void {
    this.registerEditorExtension(inlineCompletionGhostExtension({
      // Cheap gate only: the mutual exclusion with an active inline edit
      // needs editor state and is re-checked inside the controller's trigger
      // chain, where it belongs.
      canTrigger: () => this.settings?.inlineCompletionEnabled ?? false,
      onAltTrigger: (editorView) => {
        const view = findMarkdownViewForView(this.app, editorView);
        if (!view?.editor || !view.file) return;
        this.inlineCompletionController?.trigger(view.editor, view.file.path);
      },
      onTabAccept: (editorView) => this.inlineCompletionController?.accept(editorView) ?? false,
      onEscDismiss: (editorView) => this.inlineCompletionController?.dismiss(editorView) ?? false,
      onEditorActivity: (editorView) => {
        this.inlineCompletionController?.onEditorActivity(editorView);
      },
    }));
  }

  /**
   * R-C3 prewarm: the first editor focus starts the warm completion session
   * for the active backend, taking the cold start out of the trigger path.
   * Gated by `inlineCompletionEnabled` (also re-checked inside the pool).
   */
  private prewarmInlineCompletionOnEditorFocus(): void {
    if (this.settings?.inlineCompletionEnabled) {
      this.inlineCompletionPool?.prewarm();
    }
  }

  private registerPluginCommands(): void {
    this.addCommand({
      id: 'open-view',
      name: '打开聊天视图',
      callback: () => {
        this.activateView();
      },
    });

    this.addCommand({
      id: 'new-conversation',
      name: '新建会话',
      callback: async () => {
        await this.startNewConversationForCurrentView();
      },
    });

    // advantage-parity R-E3: open the relevant-notes side panel (graph +
    // retrieval channels for the active note).
    this.addCommand({
      id: 'open-relevant-notes',
      name: t('relevantNotes.command.open'),
      callback: () => {
        void this.activateRelevantNotesView();
      },
    });

    // advantage-parity R-E2: attach the active Web Viewer tab. The command
    // only exists while the core Web Viewer plugin is enabled; without an
    // active webviewer tab it reports the honest unavailable notice.
    this.addCommand({
      id: 'attach-webviewer-tab-to-context',
      name: t('chat.webViewer.command.name'),
      checkCallback: (checking: boolean) => {
        if (!isWebViewerAvailable(this.app)) {
          return false;
        }
        if (!checking) {
          void this.attachActiveWebViewerTabToChatContext();
        }
        return true;
      },
    });

    // advantage-parity R-D1: export the active tab's conversation to a vault
    // Markdown note. Works on every backend identically — it serializes the
    // plugin's own stored messages, no backend involvement at all.
    this.addCommand({
      id: 'export-conversation-markdown',
      name: t('chat.export.command.name'),
      callback: async () => {
        await this.activateView();
        const conversation = this.getOpenCodianView()?.getActiveConversationSnapshot() ?? null;
        if (!conversation) {
          new Notice(t('chat.export.emptyConversation'));
          return;
        }
        await this.exportConversationMarkdown(conversation);
      },
    });

    // advantage-parity R-E6: token estimate commands (selection + vault).
    this.registerTokenCountCommands();

    this.addCommand({
      id: 'toggle-liquid-diamond-demo',
      name: '切换钻石演示',
      callback: async () => {
        await this.toggleLiquidDiamondDemoForCurrentView();
      },
    });

    this.addCommand({
      id: 'toggle-liquid-diamond-demo-webgl',
      name: '切换钻石演示（WebGL）',
      callback: async () => {
        await this.toggleLiquidDiamondWebGlDemoForCurrentView();
      },
    });

    this.addCommand({
      id: 'toggle-glass-octahedron',
      name: '切换玻璃正八面体',
      callback: async () => {
        await this.toggleGlassOctahedronForCurrentView();
      },
    });

    this.addCommand({
      id: 'inline-edit',
      name: t('inlineEdit.command.name'),
      // `editorCheckCallback` hides the command entirely when inline edit is off
      // or the active backend cannot run a verified read-only session.
      editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
        if (!this.canRunInlineEdit()) {
          return false;
        }
        if (!checking) {
          this.inlineEditController?.open(editor, view);
        }
        return true;
      },
    });

    this.addCommand({
      id: 'inline-edit-document',
      name: t('inlineEdit.command.document'),
      editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
        if (!this.canRunInlineEdit() || !this.documentModeEnabled()) {
          return false;
        }
        if (!checking) {
          this.inlineEditController?.open(editor, view, { mode: 'document' });
        }
        return true;
      },
    });

    // R-C3: bindable completion trigger. The default Alt-solo gesture is the
    // editor extension above; this command lets users rebind or fire the
    // completion from any hotkey (design §3.4).
    this.addCommand({
      id: 'inline-completion-trigger',
      name: t('inlineCompletion.command.trigger'),
      editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
        if (!(this.settings?.inlineCompletionEnabled ?? false)) {
          return false;
        }
        if (!checking) {
          this.inlineCompletionController?.trigger(editor, view.file?.path ?? '');
        }
        return true;
      },
    });

    this.addCommand({
      id: 'add-current-note-to-context',
      name: '将当前笔记添加到 OpenCodian 上下文',
      callback: async () => {
        await this.activateView();
        await this.getOpenCodianView()?.addCurrentNoteContextFromActiveEditor();
      },
    });

    this.addCommand({
      id: 'add-selection-to-context',
      name: '将选区添加到 OpenCodian 上下文',
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        await this.activateView();
        await this.getOpenCodianView()?.addSelectionContextFromActiveEditor(editor, view);
      },
    });

    // R-C4 phase 3: in-document interaction entries. The command works on
    // every backend (it only builds context and opens the chat) and degrades
    // honestly: no capturable selection → open the chat for manual paste.
    this.addCommand({
      id: 'pdf-ask-selection',
      name: t('chat.pdf.command.askSelection'),
      callback: async () => {
        await this.pdfChatIntegration?.askSelectionFromActivePdf();
      },
    });

    // R-C5: canvas generation from picked notes (file-reference nodes by
    // default, optional read-only AI topic split). Every backend works for
    // the default mode; the split needs a read-only aux backend and falls
    // back with an explicit notice otherwise.
    this.addCommand({
      id: 'canvas-generate-from-notes',
      name: t('canvas.command.generate'),
      callback: () => {
        void this.canvasGenerationFlow?.generateFromNotes();
      },
    });

    // R-C5: node-level AI rewrite on the active canvas. The runtime gate has
    // already decided what registers; an unusable surface gets an honest
    // notice, never a silent no-op.
    this.addCommand({
      id: 'canvas-ai-edit-node',
      name: t('canvas.rewrite.command.name'),
      checkCallback: (checking: boolean) => {
        if (!this.canvasIntegration) {
          return false;
        }
        if (!checking) {
          void this.canvasIntegration.aiEditNodeFromCommand();
        }
        return true;
      },
    });

    this.addCommand({
      id: 'pdf-save-annotation',
      name: t('chat.pdf.command.saveAnnotation'),
      checkCallback: (checking: boolean) => {
        if (!this.pdfChatIntegration) {
          return false;
        }
        if (!checking) {
          void this.pdfChatIntegration.saveLastAnnotation();
        }
        return true;
      },
    });

    this.addCommand({
      id: 'batch-organize-open',
      name: t('batchOrganize.command.open'),
      callback: () => {
        if (this.batchOrganizeCoordinator) {
          new BatchOrganizeModal(this.app, this.batchOrganizeCoordinator).open();
        }
      },
    });

    this.addCommand({
      id: 'batch-organize-revert-last',
      name: t('batchOrganize.command.revertLast'),
      checkCallback: (checking: boolean) => {
        const coordinator = this.batchOrganizeCoordinator;
        if (!coordinator?.hasLastBatch()) {
          return false;
        }
        if (!checking) {
          new BatchRevertConfirmModal(this.app, coordinator).open();
        }
        return true;
      },
    });
  }

  onunload() {
    this.runtimeCoordinator.dispose();
    this.memoryRuntime?.dispose();
    this.obsidianToolingRuntime?.dispose();
    this.canvasIntegration?.detach();
    this.canvasIntegration = null;
    this.canvasGenerationFlow = null;
    this.editRevertService?.dispose();
    // advantage-parity R-D1: drop pending auto-export timers.
    this.conversationExportService?.dispose();
    this.conversationExportService = null;
    // R-C6: close the loopback listener (none exists while the feature is
    // off), abort any in-flight remote instruction and flush the audit.
    void this.remoteControlService?.dispose();
    this.remoteControlService = null;
    // R-C2: stateless runtime handles — dropping the references is enough.
    this.imageGenerationChatController = null;
    this.imageAssetStorage = null;
    this.imageGenerationService = null;
    this.vaultIndexService?.dispose();
    // R-E4: release the embedding watcher (dormant while off).
    this.vaultEmbeddingIndexService?.dispose();
    // R-C4: unmount pdf-view toolbar buttons/listeners and cancel any
    // in-flight index build (nothing partial is ever marked ready).
    this.pdfChatIntegration?.detach();
    this.pdfChatIntegration = null;
    this.pdfIndexService?.dispose();
    this.pdfIndexService = null;
    this.pdfEngineLoader = null;
    // Stop the OpenCode server (async, best-effort)
    void this.openCodeService?.stop().catch((error) => {
      logger.warn('Failed to asynchronously stop OpenCode service during unload:', error);
    });
    // Drop any in-flight inline edit and its auxiliary session before the
    // adapters go away.
    void this.inlineEditController?.close();
    this.inlineEditController = null;
    // R-C3: release every warm completion session (no native runtime leaks).
    void this.inlineCompletionPool?.disposeAll();
    this.inlineCompletionPool = null;
    this.inlineCompletionController = null;
    // Dispose registry (which disposes adapters, which disposes OpenCodeService)
    this.agentServiceRegistry?.dispose();
    // DiagnosticsRuntimeCoordinator owns the unified flush/dispose of all three
    // backend trace services (OpenCode → Codex → Claude). coordinator.dispose()
    // awaits each backend sequentially with .catch (fail-closed); onunload calls
    // it with `void` (fire-and-forget, matching the prior unload timing).
    void this.diagnosticsCoordinator?.dispose();
    setAgentServiceRegistry(null);
    this.getSettingsRuntimeCoordinator().clearChatAppearanceSaveTimer();
    delete document.body.dataset.opencodianProviderIconMode;

  }

  /** Activate the chat view */
  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_OPENCODIAN)[0];

    if (!leaf) {
      const newLeaf = this.settings.openInMainTab
        ? workspace.getLeaf('tab')
        : workspace.getRightLeaf(false);
      if (newLeaf) {
        await newLeaf.setViewState({
          type: VIEW_TYPE_OPENCODIAN,
          active: true,
        });
        leaf = newLeaf;
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  private getOpenCodianView(): OpenCodianView | null {
    const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_OPENCODIAN)[0];
    return leaf?.view instanceof OpenCodianView
      ? leaf.view
      : null;
  }

  /**
   * advantage-parity R-E3: open (or create) the relevant-notes side panel.
   * The panel itself owns refresh timing; this only guarantees a leaf.
   */
  async activateRelevantNotesView(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_RELEVANT_NOTES)[0];
    if (!leaf) {
      const newLeaf = workspace.getRightLeaf(false);
      if (newLeaf) {
        await newLeaf.setViewState({
          type: VIEW_TYPE_RELEVANT_NOTES,
          active: true,
        });
        leaf = newLeaf;
      }
    }
    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  /**
   * advantage-parity R-E3: attach a vault note to the active chat tab's
   * context — same channel and same item shape as the `+` picker (shared
   * ContextAttachmentBuilder), so the resulting chip is identical to a
   * manually chosen file.
   */
  async attachVaultFileToActiveChatContext(path: string): Promise<boolean> {
    await this.activateView();
    const builder = new ContextAttachmentBuilder(this.app, {
      getServerMode: () => this.settings.server.mode,
      loadPdfEngine: () => this.pdfEngineLoader!.load(),
    });
    const item = await builder.buildFileContextItemFromPath(path, 'file');
    if (!item) {
      return false;
    }
    return this.getOpenCodianView()?.attachContextItemToActiveTab(item) ?? false;
  }

  /**
   * advantage-parity R-F9: file-explorer context menu attach. Reuses the
   * picker's entry builder verbatim (files keep the file path, folders become
   * path-only directory references, PDFs route to the extraction path), so
   * the resulting chips are identical to hand-picked entries.
   */
  private async attachVaultEntryToActiveChatContext(entry: TFile | TFolder): Promise<void> {
    await this.activateView();
    const builder = new ContextAttachmentBuilder(this.app, {
      getServerMode: () => this.settings.server.mode,
      loadPdfEngine: () => this.pdfEngineLoader!.load(),
    });
    const item = await builder.buildEntryContextItem(entry);
    if (!item) {
      return;
    }
    const attached = this.getOpenCodianView()?.attachContextItemToActiveTab(item) ?? false;
    if (attached) {
      new Notice(t('relevantNotes.attachSuccess', { path: entry.name || entry.path }));
    }
  }

  /**
   * advantage-parity R-E6: token estimate commands. Selection falls back
   * honestly without a non-empty selection; the vault command covers the
   * R-C1 index scope (markdown minus exclusion rules, dot paths always out).
   */
  private registerTokenCountCommands(): void {
    this.addCommand({
      id: 'count-selection-tokens',
      name: t('tokenCount.selection.command'),
      editorCallback: (editor: Editor) => {
        const selection = editor.getSelection();
        if (!selection.trim()) {
          new Notice(t('tokenCount.noSelection'));
          return;
        }
        this.reportTokenEstimate(t('tokenCount.selection.title'), selection);
      },
    });

    this.addCommand({
      id: 'count-vault-tokens',
      name: t('tokenCount.vault.command'),
      callback: () => {
        void this.countVaultTokens();
      },
    });
  }

  /**
   * advantage-parity R-E6: report a token estimate as a Notice and copy the
   * plain facts to the clipboard. The heuristic lives in shared/tokenEstimate
   * and is documented as an orientation number, never a billing figure.
   */
  private reportTokenEstimate(title: string, text: string): void {
    const facts = describeTextForTokenCount(text);
    const line = t('tokenCount.summary', {
      title,
      chars: facts.chars,
      words: facts.words,
      tokens: facts.tokens,
    });
    new Notice(line, 8000);
    void navigator.clipboard?.writeText(line).catch(() => {
      // Clipboard may be unavailable (permissions); the Notice already
      // carries the result.
    });
  }

  private async countVaultTokens(): Promise<void> {
    const rules = this.settings?.vaultRetrievalExcludedPaths ?? [];
    const files = this.app.vault.getMarkdownFiles()
      .filter((file) => isIndexablePath(file.path, rules));
    if (files.length === 0) {
      new Notice(t('tokenCount.vault.empty'));
      return;
    }
    let chars = 0;
    let cjkChars = 0;
    for (const file of files) {
      try {
        const content = await this.app.vault.cachedRead(file);
        chars += content.length;
        cjkChars += (content.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) ?? []).length;
      } catch {
        // Unreadable file: skip it; the estimate stays an estimate.
      }
    }
    const tokens = Math.ceil(((chars - cjkChars) / 4) + (cjkChars * 1.2));
    const line = t('tokenCount.vault.summary', {
      files: files.length,
      chars,
      tokens,
    });
    new Notice(line, 10000);
    void navigator.clipboard?.writeText(line).catch(() => {
      // See reportTokenEstimate: the Notice already carries the result.
    });
  }

  /**
   * advantage-parity R-E2: attach the active Web Viewer tab (R-E1 URL item
   * shape; honest notice when the active tab is not a webviewer page).
   */
  private async attachActiveWebViewerTabToChatContext(): Promise<void> {
    const tab = await getActiveWebViewerTabContext(this.app);
    if (!tab) {
      new Notice(t('chat.webViewer.command.unavailable'));
      return;
    }
    await this.activateView();
    const attached = this.getOpenCodianView()
      ?.attachContextItemToActiveTab(buildWebViewerContextItem(tab)) ?? false;
    if (attached) {
      new Notice(t('relevantNotes.attachSuccess', { path: tab.title ?? tab.url }));
    }
  }

  async reapplyConversationSessionDefaults(): Promise<void> {
    await this.getOpenCodianView()?.reapplyCurrentConversationSessionSettings();
  }

  async startNewConversationForCurrentView(): Promise<void> {
    await this.activateView();
    await this.getOpenCodianView()?.createConversationInCurrentTab();
  }

  async toggleLiquidDiamondDemoForCurrentView(): Promise<void> {
    await this.activateView();
    this.getOpenCodianView()?.toggleLiquidDiamondDemo();
  }

  async toggleLiquidDiamondWebGlDemoForCurrentView(): Promise<void> {
    await this.activateView();
    this.getOpenCodianView()?.toggleLiquidDiamondWebGlDemo();
  }

  async toggleGlassOctahedronForCurrentView(): Promise<void> {
    await this.activateView();
    await this.getOpenCodianView()?.toggleGlassOctahedron();
  }

  /** Load settings from storage */
  async loadSettings() {
    const persistedSettings = await this.startupCoordinator.measureStartupStep(
      'storage.loadPersistedSettings',
      () => this.storage.loadPersistedSettings(),
    );
    const loadState = await this.startupCoordinator.measureStartupStep(
      'normalizeLoadedSettings',
      () => prepareLoadedSettingsBootstrapState(persistedSettings),
      {
        detail: () => `core=${persistedSettings.core.source}, ui=${persistedSettings.ui.source}, persist=${persistedSettings.shouldPersist ? 'yes' : 'no'}`,
      },
    );
    this.settingsPersistenceWritable = loadState.persistedSettings.writable;
    this.settings = loadState.settings;
    this.getSettingsRuntimeCoordinator().initialize(this.settingsPersistenceWritable);

    this.reportSettingsLoadState(loadState.persistedSettings);
    this.reportSettingsSecretsLoadState();
    await this.refreshEnvironmentFingerprints();

    await this.migrateOpenCodeCapabilitySettingsEnvelope(loadState.settings.opencodeCapabilities);

    if (loadState.shouldPersistNormalizedSettings) {
      await this.startupCoordinator.measureStartupStep(
        'persistNormalizedSettings',
        () => this.getSettingsRuntimeCoordinator().persistSettingsDomains({ core: true, ui: true }),
        { detail: 'startup normalization backfill' },
      );
    }
  }

  /** Save settings to storage */
  async saveSettings(options: { syncService?: boolean; reloadModels?: boolean; syncConfig?: boolean; applyUi?: boolean } = {}) {
    await this.getSettingsRuntimeCoordinator().saveSettings(options);
    await this.refreshEnvironmentFingerprints();
  }

  /**
   * ObsidianToolingCoordinator owns the R-B4 native-tooling runtime
   * (app.obsidian-tooling owner): gate provisioning, request watcher and the
   * backend-neutral injection plan. main.ts composes only; the runtime
   * itself stays a no-op unless `obsidianToolingMode` is `cli`.
   */
  private initObsidianToolingRuntime(): void {
    this.obsidianToolingRuntime = new ObsidianToolingCoordinator({
      app: this.app,
      getMode: () => this.settings.obsidianToolingMode,
    });
    // Apply the persisted mode (no-op when off): provisions the gate and
    // starts the request watcher only when the mode is `cli`.
    void this.obsidianToolingRuntime.applySettings();
  }

  /**
   * R-C6 remote control (core.remotecontrol owner): construct + applySettings
   * + dispose only. No listener, auth, or whitelist logic lives here; the
   * narrow session driver binds the existing OpenCodeService public API
   * (createSession/sendMessage/cancelStream) without touching the service.
   */
  private initRemoteControl(vaultPath: string | null): void {
    this.remoteControlService = new RemoteControlService({
      getSettings: () => this.settings,
      driver: {
        createSession: (title, options) => this.openCodeService.createSession(title, options),
        sendMessage: (message, options) => this.openCodeService.sendMessage(message, options),
        cancelStream: (sessionId) => this.openCodeService.cancelStream(sessionId),
      },
      knownSecrets: () => [
        this.settings.remoteControlToken,
        this.settings.server.auth.password,
        this.settings.server.auth.token,
        this.settings.backendSettings.codex.apiKey,
        ...this.settings.imageGenerationModels.map((model) => model.apiKey),
      ].filter((secret) => typeof secret === 'string' && secret.length >= 4),
      vaultPath: vaultPath ?? undefined,
      notify: (message) => { new Notice(message); },
    });
    // Apply the persisted state (no-op while remoteControlEnabled is false:
    // no http.Server is constructed, nothing listens).
    void this.remoteControlService.applySettings();
  }

  /**
   * Invalidate the slash-command / runtime menu catalog so the next `/` or
   * resource open reflects project-level changes (e.g. Claude/Codex project
   * commands/skills/agents edited in the resource settings). Runtime
   * supportedCommands()/supportedAgents() remains the final menu truth.
   */
  invalidateSlashCommandCatalog(options: { preload?: boolean } = {}): void {
    this.runtimeCoordinator.invalidateSlashCommandMenuCatalogs(options);
  }

  private applyLoggerSettings(): void {
    const settings = this.settings;
    setDebugLoggingEnabled(settings.enableDebugLogging);
    setDebugModuleSettings(settings.debugModuleSettings);
    setClaudeCodeDebugChannelSettings(settings.backendSettings.claudeCode.debugChannels);
    setDebugRefreshIntervalMs(settings.debugRefreshIntervalMs);
    setInlineSerializedDebugLogArgsEnabled(settings.inlineSerializedDebugLogArgs);
  }

  applyProviderIconColorMode(): void {
    document.body.dataset.opencodianProviderIconMode = normalizeProviderIconColorMode(
      this.settings.providerIconColorMode,
    );
    document.body.dataset.opencodianProviderIconVariant = normalizeLobehubIconVariant(
      this.settings.providerIconDefaultVariant,
    );
  }

  applyChatAppearanceSettings(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_OPENCODIAN)) {
      const view = leaf.view;
      if (view instanceof OpenCodianView) {
        view.applyChatAppearanceSettings();
      }
    }
  }

  getActiveThemePresetDefinition(): ThemePresetDefinition | null {
    return this.getSettingsRuntimeCoordinator().getActiveThemePresetDefinition();
  }

  getChatAppearanceBaseline(): ChatAppearanceSettings {
    return this.getSettingsRuntimeCoordinator().getChatAppearanceBaseline();
  }

  selectThemePreset(presetId: ThemePresetId): void {
    this.getSettingsRuntimeCoordinator().selectThemePreset(presetId);
  }

  updateChatAppearance(mutator: (appearance: ChatAppearanceSettings) => void): void {
    this.getSettingsRuntimeCoordinator().updateChatAppearance(mutator);
  }

  resetChatAppearanceToBaseline(): void {
    this.getSettingsRuntimeCoordinator().resetChatAppearanceToBaseline();
  }

  resetChatAppearanceGroup(
    group: 'layout' | 'background' | 'user' | 'assistant' | 'input' | 'scrollbar' | 'advanced',
  ): void {
    this.getSettingsRuntimeCoordinator().resetChatAppearanceGroup(group);
  }

  async selectThemePresetAndSave(presetId: ThemePresetId): Promise<void> {
    return this.getSettingsRuntimeCoordinator().selectThemePresetAndSave(presetId);
  }

  async resetChatAppearanceToBaselineAndSave(): Promise<void> {
    return this.getSettingsRuntimeCoordinator().resetChatAppearanceToBaselineAndSave();
  }

  async resetThemePresetAppearanceAndSave(): Promise<void> {
    return this.getSettingsRuntimeCoordinator().resetThemePresetAppearanceAndSave();
  }

  async resetChatAppearanceGroupAndSave(
    group: 'layout' | 'background' | 'user' | 'assistant' | 'input' | 'scrollbar' | 'advanced',
  ): Promise<void> {
    return this.getSettingsRuntimeCoordinator().resetChatAppearanceGroupAndSave(group);
  }

  async importChatThemeBackgroundFile(file: File): Promise<void> {
    return this.getSettingsRuntimeCoordinator().importChatThemeBackgroundFile(file);
  }

  async clearChatThemeBackground(): Promise<void> {
    return this.getSettingsRuntimeCoordinator().clearChatThemeBackground();
  }

  async resolveChatThemeBackgroundDataUrl(): Promise<string | null> {
    return this.getSettingsRuntimeCoordinator().resolveChatThemeBackgroundDataUrl();
  }

  refreshConversationRendering(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_OPENCODIAN)) {
      const view = leaf.view;
      if (view instanceof OpenCodianView) {
        view.refreshCurrentConversationRendering();
      }
    }
  }

  refreshQuestionUi(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_OPENCODIAN)) {
      const view = leaf.view;
      if (view instanceof OpenCodianView) {
        view.refreshQuestionUi();
      }
    }
  }

  scheduleChatAppearanceSave(delay = 220): void {
    this.getSettingsRuntimeCoordinator().scheduleChatAppearanceSave(delay);
  }

  scheduleSettingsUiStateSave(delay = 220): void {
    this.getSettingsRuntimeCoordinator().scheduleSettingsUiStateSave(delay);
  }

  async saveSettingsUiStateImmediately(): Promise<void> {
    return this.getSettingsRuntimeCoordinator().saveSettingsUiStateImmediately();
  }

  async logServerStatusSnapshot(source = 'manual'): Promise<void> {
    const isHealthy = await this.openCodeService.checkHealth();
    const internalStatus = this.openCodeService.getServerStatus();
    const hasManagedProcess = this.openCodeService.isServerProcessRunning();
    const diagnostics = this.openCodeService.getServerDiagnostics();
    logger.debug(
      `Server snapshot [${source}] -> health=${isHealthy ? 'ok' : 'fail'}, status=${internalStatus}, managedProcess=${hasManagedProcess}, diagnostics=${JSON.stringify(diagnostics)}`
    );
  }

  async buildDiagnosticReport(source = 'manual'): Promise<string> {
    const vaultPath = getVaultBasePath(this.app) ?? 'Unavailable';
    const isHealthy = await this.openCodeService.checkHealth();
    const internalStatus = this.openCodeService.getServerStatus();
    const managedProcess = this.openCodeService.isServerProcessRunning();
    const diagnostics = this.openCodeService.getServerDiagnostics();

    const raw = [
      '# OpenCodian Diagnostic Report',
      '',
      `Generated: ${new Date().toISOString()}`,
      `Source: ${source}`,
      `Plugin name: ${this.manifest.name}`,
      `Plugin ID: ${this.manifest.id}`,
      `Plugin version: ${this.manifest.version}`,
      `BUILD_ID: ${BUILD_ID}`,
      `Platform: ${process.platform}`,
      `Vault path: ${vaultPath}`,
      '',
      '## Server',
      `Health: ${isHealthy ? 'ok' : 'fail'}`,
      `Status: ${internalStatus}`,
      `Managed process: ${managedProcess}`,
      `Diagnostics: ${JSON.stringify(diagnostics)}`,
      `Mode: ${this.settings.server.mode}`,
      `Base URL: ${getServerBaseUrl(this.settings.server) || '(not set)'}`,
      `Local host: ${this.settings.server.local.host}`,
      `Local port: ${this.settings.server.local.port}`,
      `Local auto-start: ${this.settings.server.local.autoStart}`,
      `Auth type: ${this.settings.server.auth.type}`,
      '',
      '## Claude Code',
      `Enabled: ${this.settings.enabledBackends.includes('claude-code')}`,
      `Active: ${this.settings.activeBackend === 'claude-code'}`,
      `Debug module enabled: ${this.settings.debugModuleSettings.claudeCode}`,
      `Model: ${this.settings.backendSettings.claudeCode.model || '(default)'}`,
      `Effort: ${this.settings.backendSettings.claudeCode.effort}`,
      `Permission mode: ${this.settings.backendSettings.claudeCode.permissionMode}`,
      `Setting sources: ${this.settings.backendSettings.claudeCode.settingSources.join(', ') || '(none)'}`,
      `Additional directories: ${this.settings.backendSettings.claudeCode.additionalDirectories.length}`,
      'MCP servers configured: loaded from project MCP config at runtime',
      `Environment variables configured: ${Object.keys(this.settings.backendSettings.claudeCode.env).length}`,
      `File checkpoint: ${this.settings.backendSettings.claudeCode.enableFileCheckpointing}`,
      `Hook event stream: ${this.settings.backendSettings.claudeCode.includeHookEvents}`,
      `Forward subagent text: ${this.settings.backendSettings.claudeCode.forwardSubagentText}`,
      `Subagent progress summaries: ${this.settings.backendSettings.claudeCode.agentProgressSummaries}`,
      '',
      '## Settings',
      `Locale: ${this.settings.locale}`,
      `Permission mode: ${this.settings.permissionMode}`,
      `Debug logging: ${this.settings.enableDebugLogging}`,
      `Debug modules: ${JSON.stringify(this.settings.debugModuleSettings)}`,
      `Debug refresh interval: ${this.settings.debugRefreshIntervalMs}ms`,
      `Inline serialized debug log args: ${this.settings.inlineSerializedDebugLogArgs}`,
      `Plugin isolation mode: ${this.settings.pluginIsolationMode}`,
      `Default provider: ${this.settings.defaultProvider}`,
      `Default model: ${this.settings.defaultModel}`,
      `Debug log path (${getCurrentPlatformKey()}): ${getCurrentPlatformDebugLogPath(this.settings.debugLogPaths) || '(not set)'}`,
      `Debug log paths: ${JSON.stringify(this.settings.debugLogPaths)}`,
      '',
      '## Startup Performance',
      ...this.startupCoordinator.getStartupPerfSummaryLines(),
      '',
      '## Startup Analysis',
      ...this.startupCoordinator.getStartupPerformanceDiagnosisLines(),
      '',
      '## Recent Logs',
      getRecentLogText() || '(no logs captured yet)',
      '',
    ].join('\n');

    return sanitizeDiagnosticReport(raw);
  }

  async writeDiagnosticLogFile(targetDirectory: string, source = 'manual'): Promise<string> {
    await fs.promises.mkdir(targetDirectory, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `opencodian-debug-${timestamp}.log`;
    const targetPath = path.join(targetDirectory, filename);
    const report = await this.buildDiagnosticReport(source);
    await fs.promises.writeFile(targetPath, report, 'utf-8');
    return targetPath;
  }

  getDebugBuildIdentityText(): string {
    return `OpenCodian ${this.manifest.version} BUILD_ID=${BUILD_ID}`;
  }

  /** Load conversations from storage */
  async loadConversations(options: { force?: boolean } = {}): Promise<void> {
    const { force = false } = options;

    if (this.conversationsLoaded && !force) {
      return;
    }

    if (this.conversationsLoadPromise) {
      await this.conversationsLoadPromise;
      return;
    }

    this.conversationsLoadPromise = (async () => {
      const metas = await this.startupCoordinator.measureStartupStep(
        'storage.listConversations',
        () => this.storage.listConversations(),
        { detail: () => this.describeConversationListDiagnostics() },
      );

      this.conversations = await this.startupCoordinator.measureStartupStep(
        'cacheConversationMetas',
        () => metas.map((meta) => ({
          id: meta.id,
          title: meta.title,
          createdAt: meta.createdAt,
          updatedAt: meta.updatedAt,
          lastResponseAt: meta.lastResponseAt,
          titleGenerationStatus: meta.titleGenerationStatus,
          backend: meta.backend,
          openCodeSessionId: meta.openCodeSessionId ?? meta.id,
          backendSessionId: meta.backendSessionId ?? meta.openCodeSessionId ?? meta.id,
          backendAgentId: meta.backendAgentId,
          linkedNotePath: meta.linkedNotePath,
          messages: [],
        })),
        { detail: () => `${metas.length} conversations` },
      );
      this.conversationsLoaded = true;
    })();

    try {
      await this.conversationsLoadPromise;
    } finally {
      this.conversationsLoadPromise = null;
    }
  }

  /** Keep every explicit conversation-to-note binding aligned with a vault rename. */
  private async followConversationLinkedNoteRename(oldPath: string, newPath: string): Promise<void> {
    const previousPath = normalizeConversationLinkedNotePath(oldPath);
    const nextPath = normalizeConversationLinkedNotePath(newPath);
    if (!previousPath || !nextPath || previousPath === nextPath) {
      return;
    }

    const affectedConversations = this.conversations.filter(
      (conversation) => conversation.linkedNotePath === previousPath,
    );
    for (const conversation of affectedConversations) {
      conversation.linkedNotePath = nextPath;
      conversation.updatedAt = Date.now();
      await this.saveConversation(conversation);
    }

    if (affectedConversations.length > 0) {
      this.getOpenCodianView()?.refreshLinkedNoteBindingState();
    }
  }

  /** Create a new conversation */
  async createConversation(): Promise<Conversation> {
    const activeBackend = this.settings.activeBackend ?? 'opencode';
    const activeBackendAdapter = Array.isArray(this.settings.enabledBackends) && this.settings.enabledBackends.includes(activeBackend)
      ? this.agentServiceRegistry?.get(activeBackend)
      : null;
    const sessionBackend = hasSessionCreationCapability(activeBackendAdapter) ? activeBackendAdapter : null;
    if (!sessionBackend && activeBackend === 'opencode') {
      if (!Array.isArray(this.settings.enabledBackends) || !this.settings.enabledBackends.includes('opencode')) {
        throw new Error('Cannot create conversation: opencode backend is not enabled');
      }

      await this.runtimeCoordinator.ensureRuntimeWarmupReadyForSessionBootstrap();
      const sessionId = await this.openCodeService.createSession();
      return this.createConversationRecord('opencode', sessionId);
    }
    if (!sessionBackend) {
      throw new Error('Cannot create conversation: active backend does not support sessions');
    }
    if (sessionBackend.kind === 'opencode') {
      await this.runtimeCoordinator.ensureRuntimeWarmupReadyForSessionBootstrap();
    }

    const sessionId = await sessionBackend.createSession();

    return this.createConversationRecord(sessionBackend.kind, sessionId);
  }

  private async createConversationRecord(
    backend: AgentBackendKind,
    sessionId: string,
  ): Promise<Conversation> {
    const conversation: Conversation = {
      id: `conv-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      title: this.getEmptyConversationTitle(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      backend,
      ...(backend === 'opencode' ? { openCodeSessionId: sessionId } : {}),
      backendSessionId: sessionId,
      messages: [],
    };

    this.conversations.unshift(conversation);
    this.touchConversationFullMessageCache(conversation.id);
    await this.storage.saveConversation(conversation);

    return conversation;
  }

  async createConversationFromSession(
    sessionId: string,
    initial?: Partial<Omit<Conversation, 'id' | 'createdAt' | 'updatedAt' | 'openCodeSessionId' | 'backendSessionId'>>,
  ): Promise<Conversation> {
    const backend = initial?.backend ?? this.settings.activeBackend ?? 'opencode';
    const conversation: Conversation = {
      id: `conv-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      title: initial?.title || this.getEmptyConversationTitle(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      backend,
      ...(backend === 'opencode' ? { openCodeSessionId: sessionId } : {}),
      backendSessionId: sessionId,
      messages: initial?.messages ? JSON.parse(JSON.stringify(initial.messages)) as Conversation['messages'] : [],
      currentNote: initial?.currentNote,
      externalContextPaths: initial?.externalContextPaths ? [...initial.externalContextPaths] : undefined,
      linkedNotePath: normalizeConversationLinkedNotePath(initial?.linkedNotePath),
      sessionSettings: initial?.sessionSettings ? JSON.parse(JSON.stringify(initial.sessionSettings)) as Conversation['sessionSettings'] : undefined,
      lastResponseAt: initial?.lastResponseAt,
      titleGenerationStatus: initial?.titleGenerationStatus,
    };

    this.conversations.unshift(conversation);
    this.touchConversationFullMessageCache(conversation.id);
    if (conversation.messages.length > 0) {
      this.trimConversationFullMessageCache();
    }
    await this.storage.saveConversation(conversation);
    return conversation;
  }

  /**
   * Minimal bridge for external hosts (e.g. settings-side backend session browser)
   * to resume a backend session into a new conversation.
   */
  async createConversationFromBackendSession(
    sessionId: string,
    title: string,
    initialMessages?: Array<{ id: string; role: 'user' | 'assistant'; content: string; timestamp: number }>,
    backend?: AgentBackendKind,
  ): Promise<string | null> {
    const resolvedBackend = backend ?? this.settings.activeBackend ?? 'opencode';
    const conversation = await this.createConversationFromSession(sessionId, {
      title,
      backend: resolvedBackend,
      messages: initialMessages as ChatMessage[] | undefined,
    });
    return conversation.id;
  }

  /**
   * Minimal bridge for external hosts to activate the chat view and load
   * a resumed conversation. Delegates to the active OpenCodianView seam.
   */
  async loadBackendSessionConversation(conversationId: string): Promise<void> {
    await this.activateView();
    await this.getOpenCodianView()?.loadConversationForExternalHost(conversationId);
  }

  async saveConversation(conversation: Conversation): Promise<void> {
    const index = this.conversations.findIndex((item) => item.id === conversation.id);
    const previousLastResponseAt = index !== -1
      ? this.conversations[index].lastResponseAt
      : undefined;
    let nextConversation = conversation;

    if (
      index !== -1
      && conversation.messages.length === 0
      && (this.conversationFullMessageCache.isEvicted(conversation.id)
        || this.conversations[index].messages.length === 0)
    ) {
      const fullConversation = await this.storage.loadFullConversation(conversation.id);
      if (fullConversation && fullConversation.messages.length > 0) {
        nextConversation = {
          ...conversation,
          messages: fullConversation.messages,
        };
      }
    }

    if (index === -1) {
      this.conversations.unshift(nextConversation);
    } else {
      this.conversations[index] = nextConversation;
    }

    this.touchConversationFullMessageCache(nextConversation.id);
    this.trimConversationFullMessageCache();

    await this.storage.saveConversation(nextConversation);

    // advantage-parity R-D1: no-op unless auto-export is on AND a new
    // assistant response landed (the scheduler checks both before arming
    // any timer, so ordinary saves — title edits, settings writes — never
    // trigger a vault write).
    this.conversationExportService?.scheduleAutoExport(nextConversation);

    // advantage-parity R-D3: a new assistant response = a completed turn.
    // The chime gates itself (off by default; background task or unfocused
    // window only) and swallows its own playback failures.
    const turnJustCompleted = nextConversation.lastResponseAt !== undefined
      && nextConversation.lastResponseAt > (previousLastResponseAt ?? 0);
    if (turnJustCompleted && this.turnCompletionSoundService) {
      this.turnCompletionSoundService.playForTurnCompletion(
        {
          enabled: this.settings?.turnCompletionSoundEnabled ?? false,
          customPath: this.settings?.turnCompletionSoundPath ?? '',
        },
        {
          isBackgroundTask: Boolean(nextConversation.backgroundTaskMetadata?.activeAnchor),
        },
      );
    }
  }

  /**
   * advantage-parity R-D1: export a conversation to a vault Markdown note
   * (manual path — always a NEW file, conflict-suffixed, never an overwrite).
   * Notices are localized here; the core service stays locale-free.
   */
  async exportConversationMarkdown(conversation: Conversation): Promise<string | null> {
    if (!this.conversationExportService) {
      return null;
    }
    try {
      const { path } = await this.conversationExportService.exportConversation(conversation);
      new Notice(t('chat.export.success', { path }));
      return path;
    } catch (error) {
      logger.error('Conversation export failed:', error);
      new Notice(
        t('chat.export.failed', {
          error: error instanceof Error ? error.message : String(error),
        }),
        10000,
      );
      return null;
    }
  }

  /**
   * Export by conversation id (history menu path): prefers the live view
   * conversation when it is the active one, otherwise loads the stored full
   * conversation. Returns null when the conversation cannot be resolved.
   */
  async exportConversationMarkdownById(conversationId: string): Promise<string | null> {
    const activeSnapshot = this.getOpenCodianView()?.getActiveConversationSnapshot() ?? null;
    if (activeSnapshot?.id === conversationId) {
      return this.exportConversationMarkdown(activeSnapshot);
    }
    const stored = await this.storage.loadFullConversation(conversationId);
    if (!stored) {
      new Notice(t('chat.export.notFound'));
      return null;
    }
    return this.exportConversationMarkdown(stored);
  }

  /** Get all conversations */
  getConversations(): Conversation[] {
    return [...this.conversations];
  }

  /** Get conversation by ID (with optional cache-first behavior) */
  async getConversationById(
    id: string,
    options: { preferCache?: boolean } = {},
  ): Promise<Conversation | undefined> {
    // First check in-memory cache
    const cached = this.conversations.find((c) => c.id === id);
    if (!cached) return undefined;

    if (options.preferCache) {
      return cached;
    }

    // Load full conversation with messages from storage
    const fullConversation = await this.storage.loadFullConversation(id);
    if (fullConversation) {
      // Update cache with full data
      const index = this.conversations.findIndex((c) => c.id === id);
      if (index !== -1) {
        this.conversations[index] = fullConversation;
      }
      this.touchConversationFullMessageCache(fullConversation.id);
      this.trimConversationFullMessageCache();
      return fullConversation;
    }

    return cached;
  }

  /** Delete a conversation */
  async deleteConversation(id: string): Promise<void> {
    const index = this.conversations.findIndex((c) => c.id === id);
    if (index === -1) return;

    const conversation = this.conversations[index];
    this.conversations.splice(index, 1);
    this.conversationFullMessageCache.forget(id);

    const backendSessionId = getConversationBackendSessionId(conversation);
    const sessionBackend = getConversationSessionBackendService(this.agentServiceRegistry, conversation);
    if (backendSessionId && sessionBackend) {
      try {
        await sessionBackend.deleteSession(backendSessionId);
      } catch {
        // Ignore errors
      }
    }

    // Delete from storage
    await this.storage.deleteConversation(id);
  }

  private touchConversationFullMessageCache(id: string): void {
    this.conversationFullMessageCacheClock = Math.max(Date.now(), this.conversationFullMessageCacheClock + 1);
    this.conversationFullMessageCache.touch(id, this.conversationFullMessageCacheClock);
  }

  registerConversationCachePinProvider(provider: ConversationCachePinProvider): void {
    this.conversationCachePinProviders.add(provider);
    this.trimConversationFullMessageCache();
  }

  unregisterConversationCachePinProvider(provider: ConversationCachePinProvider): void {
    this.conversationCachePinProviders.delete(provider);
    this.trimConversationFullMessageCache();
  }

  trimConversationFullMessageCache(): void {
    const snapshot = this.conversationFullMessageCache.trim(
      this.conversations,
      this.getConversationCachePinnedIds(),
    );
    if (snapshot.evictedConversationIds.length > 0) {
      logger.debug('Trimmed full conversation messages from memory cache', {
        evictedConversationIds: snapshot.evictedConversationIds,
        pinnedConversationIds: snapshot.pinnedConversationIds,
        fullConversationIds: snapshot.fullConversationIds,
      });
    }
  }

  private getConversationCachePinnedIds(): ReadonlySet<string> {
    const pinnedIds = new Set<string>();

    for (const provider of this.conversationCachePinProviders) {
      for (const id of provider()) {
        if (typeof id === 'string' && id.length > 0) {
          pinnedIds.add(id);
        }
      }
    }

    return pinnedIds;
  }

  /** Get placeholder title for a new, empty conversation */
  getEmptyConversationTitle(): string {
    return t('chat.tab.new');
  }

  /** Generate fallback conversation title from the first user message */
  generateDefaultTitle(firstMessage: string): string {
    const normalizedMessage = firstMessage.replace(/\r/g, '').trim();
    if (!normalizedMessage) {
      return t('chat.history.untitled');
    }

    const firstSentence = normalizedMessage
      .split(/[.!?\n]/)[0]
      .replace(/\s+/g, ' ')
      .trim();
    if (!firstSentence) {
      return t('chat.history.untitled');
    }

    const title = firstSentence.substring(0, 50).trim();
    if (!title) {
      return t('chat.history.untitled');
    }

    return title + (firstSentence.length > 50 ? '...' : '');
  }

  private handleModelsLoaded(): void {
    this.runtimeCoordinator.queueModelRefresh();
  }

  private handleOpenCodeServerStatusChange(status: string): void {
    logger.debug(`Server status changed: ${status}`);
    this.settingsTab?.refreshServerStatusDisplay();
    broadcastServerStatusToSettingsViews(this);
    // Forward to adapter for registry-level status subscribers
    const adapter = this.agentServiceRegistry?.get('opencode');
    if (adapter && 'notifyStatusChange' in adapter) {
      (adapter as import('./core/agents/backend/OpenCodeAdapter').OpenCodeAdapter).notifyStatusChange(status);
    }
    if (status === 'running') {
      this.runtimeCoordinator.invalidateSlashCommandMenuCatalogs({ preload: true });
    }
  }

  private reportSettingsLoadState(result: Awaited<ReturnType<StorageService['loadPersistedSettings']>>): void {
    const recoveredFromBackup = result.core.source === 'backup' || result.ui.source === 'backup';
    const migratedFromLegacy = result.core.source === 'legacy' || result.ui.source === 'legacy';
    const blocked = !result.writable;

    if (recoveredFromBackup) {
      const message = 'OpenCodian recovered settings from a backup after detecting an unreadable settings file.';
      logger.warn(message);
      new Notice(message, 8000);
    }

    if (migratedFromLegacy) {
      const message = 'OpenCodian migrated settings to the new split persistence format.';
      logger.info(message);
      new Notice(message, 6000);
    }

    if (blocked) {
      this.warnSettingsPersistenceBlocked(
        result.core.message
        ?? result.ui.message
        ?? 'OpenCodian could not recover saved settings. Persistence is temporarily disabled to avoid overwriting data.',
      );
    }
  }

  /**
   * R-D2: surface the keychain load report honestly — migrated fields,
   * unresolvable placeholders (missing keychain entries / older host), and
   * the "keychain not available" degradation are all announced, never silent.
   */
  /**
   * R-E4: resolve the embedding client from the user's provider settings.
   * Null (feature dormant) when the toggle is off or the provider/model is
   * not configured; a mismatched provider id reports honestly via Notice.
   */
  private resolveSemanticEmbeddingClient(): EmbeddingClient | null {
    const settings = this.settings;
    if (!settings?.semanticRetrievalEnabled) {
      return null;
    }
    const providerId = settings.semanticEmbeddingProvider.trim();
    const model = settings.semanticEmbeddingModel.trim();
    if (!providerId || !model) {
      new Notice(t('settings.semanticRetrieval.notConfiguredNotice'), 10000);
      return null;
    }
    const provider = settings.providers.find((entry) => entry.id === providerId);
    if (!provider?.baseUrl) {
      new Notice(t('settings.semanticRetrieval.providerMissingNotice'), 10000);
      return null;
    }
    return createOpenAiCompatibleEmbeddingClient({
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey ?? '',
      model,
    });
  }

  /**
   * advantage-parity R-F7: resolved domain environment (shared + the backend's
   * provider domain) for one backend kind / provider id — the single accessor
   * behind every adapter construction seam below. Legacy per-backend env
   * settings still override at their own merge points.
   */
  private getDomainEnvFor(backend: string): Record<string, string> {
    return resolveBackendEnvironment(this.settings.environmentVariables, backend);
  }

  /** Project MCP servers for the Claude adapter; missing manager/reader stays an empty config. */
  private async readClaudeMcpServers(): Promise<Awaited<ReturnType<typeof adaptMcpConfigForClaude>>> {
    if (!this.opencodeConfigManager) {
      return {};
    }
    try {
      const { McpConfigService } = await import('./core/config/McpConfigService');
      const mcpConfigService = new McpConfigService(this.opencodeConfigManager);
      return adaptMcpConfigForClaude(await mcpConfigService.readProjectServers());
    } catch {
      return {};
    }
  }

  /**
   * R-F7: backend keys whose environment participates in the
   * fingerprint — the built-in backend kinds plus every configured provider
   * domain key (custom providers / ACP agent ids).
   */
  private getEnvironmentFingerprintBackends(): string[] {
    const backends = new Set<string>([
      'opencode',
      'claude-code',
      'codex',
      'copilot',
      'pi',
      ...Object.keys(this.settings.environmentVariables.providers),
    ]);
    return [...backends].sort((left, right) => left.localeCompare(right));
  }

  /** R-F7: fingerprint of each backend's fully resolved environment (legacy env included). */
  private computeCurrentEnvironmentFingerprints(): Record<string, string> {
    return computeBackendEnvironmentFingerprints(
      this.settings.environmentVariables,
      this.getEnvironmentFingerprintBackends(),
      (backend) => (backend === 'claude-code'
        ? this.settings.backendSettings.claudeCode.env
        : undefined),
    );
  }

  /**
   * R-F7: compare the current per-backend environment fingerprints against the
   * persisted previous run; surface one localized notice listing the changed
   * backends (session-invalidation signal: existing sessions keep their old
   * environment until restarted), then persist the current fingerprints.
   * First run (no stored fingerprints) and unchanged environments stay silent.
   * Bounded failures: the fingerprint bookkeeping must never break settings
   * load/save, so any error is logged and swallowed.
   */
  private async refreshEnvironmentFingerprints(): Promise<void> {
    try {
      if (!this.storage || !this.settings) {
        return;
      }
      const current = this.computeCurrentEnvironmentFingerprints();
      const previous = this.environmentFingerprintsCache
        ?? await this.storage.loadEnvironmentFingerprints();
      if (previous) {
        const changed = detectChangedBackends(previous, current);
        if (changed.length > 0) {
          new Notice(t('envDomains.changedNotice', { backends: changed.join('、') }), 12000);
        }
      }
      if (!previous || !environmentFingerprintsEqual(previous, current)) {
        await this.storage.saveEnvironmentFingerprints(current);
      }
      this.environmentFingerprintsCache = current;
    } catch (error) {
      logger.warn('Environment fingerprint refresh failed:', error);
    }
  }

  private reportSettingsSecretsLoadState(): void {
    const report = this.storage?.takeSettingsSecretsLoadReport();
    if (!report) {
      return;
    }
    if (report.migrated.length > 0) {
      new Notice(t('settings.secrets.migratedNotice', { count: report.migrated.length }), 8000);
    }
    if (report.unresolved.length > 0) {
      logger.warn('Settings secrets could not be resolved from the keychain', {
        keys: report.unresolved,
      });
      new Notice(t('settings.secrets.unresolvedNotice', { count: report.unresolved.length }), 12000);
    }
    if (report.plaintextWithoutSecretStorage.length > 0) {
      new Notice(t('settings.secrets.noKeychainNotice', {
        count: report.plaintextWithoutSecretStorage.length,
      }), 12000);
    }
  }

  /**
   * Run the versioned OpenCode capability settings migration on the loaded
   * envelope and surface a startup notice. When the migration cannot safely
   * map a field, the unmodified raw value is snapshotted to a backup path via
   * StorageService before the normalized envelope is kept. The notice never
   * exposes raw backup content or secret values.
   */
  private async migrateOpenCodeCapabilitySettingsEnvelope(raw: unknown): Promise<void> {
    const migration = migrateOpenCodeCapabilitySettings(raw, Date.now());
    this.settings = { ...this.settings, opencodeCapabilities: migration.normalized };

    if (migration.requiresBackup) {
      await this.storage.snapshotRawCapabilitySettings(raw);
      const impossibleCount = migration.report.entries.filter((e) => e.outcome === 'impossible').length;
      const message = impossibleCount > 0
        ? `OpenCodian preserved ${impossibleCount} capability preference field(s) in a backup; some legacy values could not be auto-migrated.`
        : 'OpenCodian updated capability preferences and kept a backup of the previous values.';
      logger.warn(message, { entryCount: migration.report.entries.length });
      new Notice(message, 6000);
      return;
    }

    const migratedCount = migration.report.entries.filter((e) => e.outcome === 'migrated').length;
    if (migratedCount > 0) {
      const message = `OpenCodian migrated ${migratedCount} capability preference field(s) to the current schema.`;
      logger.info(message);
      new Notice(message, 5000);
    }
  }

  private describeConversationListDiagnostics(): string {
    const diagnostics = this.getConversationListDiagnosticsSnapshot();
    if (!diagnostics) {
      return 'conversation diagnostics unavailable';
    }

    return `sessions=${diagnostics.sessionFileCount}, metaHits=${diagnostics.metadataHitCount}, fullFallbacks=${diagnostics.fullSessionFallbackCount}`;
  }

  private getConversationListDiagnosticsSnapshot():
    ReturnType<StorageService['getConversationListDiagnosticsSnapshot']> {
    const storage = this.storage as StorageService & {
      getConversationListDiagnosticsSnapshot?: () => ReturnType<StorageService['getConversationListDiagnosticsSnapshot']>;
    };
    return storage.getConversationListDiagnosticsSnapshot?.() ?? null;
  }
}

// Export type for use in other modules
export type { OpenCodianPlugin };
