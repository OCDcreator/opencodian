# Graph Report - /Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src  (2026-06-17)

## Corpus Check
- 462 files · ~521,681 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 6968 nodes · 16726 edges · 91 communities detected
- Extraction: 71% EXTRACTED · 29% INFERRED · 0% AMBIGUOUS · INFERRED: 4917 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 85|Community 85]]
- [[_COMMUNITY_Community 86|Community 86]]
- [[_COMMUNITY_Community 87|Community 87]]
- [[_COMMUNITY_Community 88|Community 88]]
- [[_COMMUNITY_Community 89|Community 89]]
- [[_COMMUNITY_Community 90|Community 90]]

## God Nodes (most connected - your core abstractions)
1. `t()` - 830 edges
2. `OpenCodianView` - 218 edges
3. `OpenCodeService` - 128 edges
4. `ClaudeCodeAdapter` - 126 edges
5. `SettingsClaudeCodeSection` - 122 edges
6. `SettingsCapabilityLabSection` - 108 edges
7. `SettingsFormatterSection` - 102 edges
8. `OpenCodianPlugin` - 71 edges
9. `getConversationBackendSessionId()` - 66 edges
10. `CodexAdapter` - 60 edges

## Surprising Connections (you probably didn't know these)
- `shouldUseOpenCodeServerSync()` --calls--> `getConversationBackendSessionId()`  [INFERRED]
  /Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/features/chat/services/ConversationSyncLoadRuntimeViewHostFactory.ts → /Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/core/types/chat.ts
- `normalizeSessionCommandPath()` --calls--> `normalizeContextPath()`  [INFERRED]
  /Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/core/opencode/OpenCodeSessionControlOrchestrator.ts → /Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/shared/contextPath.ts
- `describeProviderDirectorySummary()` --calls--> `t()`  [INFERRED]
  /Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/features/settings/SettingsModelCatalogAvailability.ts → /Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/i18n/index.ts
- `renderLanguageSetting()` --calls--> `t()`  [INFERRED]
  /Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/features/settings/SettingsPanelChrome.ts → /Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/i18n/index.ts
- `buildNormalizedLoadedSettings()` --calls--> `normalizeEffortLevel()`  [INFERRED]
  /Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/core/types/settingsLoadNormalization.ts → /Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/core/types/settings.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.01
Nodes (110): ActiveTabContextUsageCoordinator, applyPassiveScrollMeasurement(), applyUserScrollIntent(), getDistanceFromBottom(), getProgrammaticScrollGuardDelayMs(), hasProgrammaticScrollGuard(), isNearBottom(), BackgroundConversationPostSyncHandoffCoordinator (+102 more)

### Community 1 - "Community 1"
Cohesion: 0.01
Nodes (47): renderAgentSwitcherChips(), AssistantNoticeCardRenderer, CodexMcpServerDetailModal, createCodexMcpServerDetailHost(), handleViewResource(), renderResourceContent(), renderResourceEntry(), renderResourceTemplateEntry() (+39 more)

### Community 2 - "Community 2"
Cohesion: 0.01
Nodes (180): AgentInvocationService, BackgroundTaskTimelineLaunchService, buildChatAppearanceCustomCss(), ChildSessionGraphService, buildClaudeCodeModelSelectorProviders(), expandHomeDirectory(), getAugmentedPath(), getDefaultClaudeCliCandidates() (+172 more)

### Community 3 - "Community 3"
Cohesion: 0.01
Nodes (70): assignIfDefined(), normalizeConversationSessionSettings(), normalizeNullableBoolean(), normalizeNullableEnum(), normalizeNullableString(), normalizeNullableStringArray(), buildCommandScopedAgent(), cloneConfigObject() (+62 more)

### Community 4 - "Community 4"
Cohesion: 0.01
Nodes (73): AcpClientManager, registerBuiltinGlassAdapters(), ClaudeCodeAsyncQueue, CodexAdapter, isRecordLike(), readCommandString(), CodexAppServerClient, extractItemMessages() (+65 more)

### Community 5 - "Community 5"
Cohesion: 0.01
Nodes (34): BackgroundConversationPostSyncRefreshExecutor, BackgroundTaskCompletionNoticeService, BackgroundTaskIndicatorCoordinator, BackgroundTaskInlinePanelRenderer, BackgroundTaskLiveSignalCoordinator, createBackgroundTaskLiveSignalCoordinatorHost(), BackgroundTaskNoticeStateService, BackgroundTaskStreamTriggerCoordinator (+26 more)

### Community 6 - "Community 6"
Cohesion: 0.02
Nodes (44): ClaudeCodeAdapter, ClaudeCodeRuntimeAbortController, extractModelUsageFromRaw(), isClaudeAgentSdkBundledExecutablePath(), isOpenCodianLocalClaudeSessionId(), normalizeMcpServerInfo(), normalizeMcpServerRuntimeStatus(), normalizeMcpToolNames() (+36 more)

### Community 7 - "Community 7"
Cohesion: 0.01
Nodes (40): ChatHeaderPresenter, readActiveBackendFromPlugin(), readOpenCodianPlugin(), ChatSurfaceAppearanceCoordinator, assembleConversationHydrationRuntime(), createConversationHydrationRuntimeBridges(), createConversationHydrationRuntimeViewHosts(), createConversationRenderHost() (+32 more)

### Community 8 - "Community 8"
Cohesion: 0.02
Nodes (117): getChatAppearanceBackgroundSizeValue(), getChatAppearanceCssVariables(), areChatAppearanceSettingsEqual(), diffObject(), getBuiltinThemePresets(), getThemeAppearanceOverridesFromBase(), getThemePresetDefinition(), hasThemeAppearanceOverrides() (+109 more)

### Community 9 - "Community 9"
Cohesion: 0.02
Nodes (57): buildComposerContextChipStates(), createFocusContextPreview(), getContextTargetKey(), getPromptContextTargetKey(), removeDraftContextItemsByTarget(), resolveFocusContextPreview(), upsertDraftContextItem(), ComposerContextActionService (+49 more)

### Community 10 - "Community 10"
Cohesion: 0.02
Nodes (56): AgentMentionComposerController, filterAgentMentionCandidates(), findSingleTextEdit(), getEmptyAgentMentionMenuStatus(), isAtomicMentionEditKey(), isPrintableEditKey(), scrollSelectedItemIntoView(), updateTrackedMentionRanges() (+48 more)

### Community 11 - "Community 11"
Cohesion: 0.02
Nodes (16): normalizeClaudeCodePermissionMode(), readClaudeCodePermissionModeFromPlugin(), readCodexSandboxModeFromPlugin(), readOpenCodianPlugin(), switchClaudeCodePermissionModeInPlugin(), switchCodexSandboxModeInPlugin(), OpenCodianSettingTab, OpenCodianSettingsView (+8 more)

### Community 12 - "Community 12"
Cohesion: 0.02
Nodes (15): AcpTransportOwner, translateAcpMessageChunk(), translateAcpToolCall(), translateAcpToolCallUpdate(), OpenCodePromptRequestBuilder, buildCanonicalConversationFingerprintPayload(), cloneSettings(), getDebugTextPreview() (+7 more)

### Community 13 - "Community 13"
Cohesion: 0.02
Nodes (13): LocalSidecarEndpointResolver, LocalSidecarLauncher, LocalProcessProbe, OpenCodeEventSubscriptionCoordinator, cloneSettings(), deepClonePlain(), deepCloneValue(), isPlainRecord() (+5 more)

### Community 14 - "Community 14"
Cohesion: 0.02
Nodes (29): OpenCodeCatalogQueryCoordinator, OpenCodeCatalogStateStore, isTransientQuestionMutationError(), normalizePermissionRequest(), normalizePermissionResponse(), normalizePermissionToolReference(), normalizeStringArray(), OpenCodeQuestionPermissionHub (+21 more)

### Community 15 - "Community 15"
Cohesion: 0.02
Nodes (26): AdditionalDirectoriesConfigBadgeCoordinator, readAdditionalDirectoriesFromPlugin(), readOpenCodianPlugin(), ChatVisualDemoCoordinator, CodexRuntimeDefaultsBadgeCoordinator, readAdditionalDirectories(), readNetworkAccessEnabled(), readOpenCodianPlugin() (+18 more)

### Community 16 - "Community 16"
Cohesion: 0.03
Nodes (52): appendUsageChunk(), ClaudeCodeStreamNormalizer, isRecord(), isTextBlock(), isThinkingBlock(), isToolResultBlock(), isToolUseBlock(), logSummaries() (+44 more)

### Community 17 - "Community 17"
Cohesion: 0.03
Nodes (50): buildCodexApprovalQuestionRequest(), clamp(), createStageLayerElement(), createSvgElement(), estimateProjectionDelta(), formatNumber(), generateFilterId(), GlassOctahedronDemoController (+42 more)

### Community 18 - "Community 18"
Cohesion: 0.03
Nodes (81): ConversationIdentityRuntime, ConversationMessageRenderDelegate, ConversationSyncedUpdateApplyDelegate, getIncrementalRenderedMessageUpdate(), TrailingAssistantPatchPlanningDelegate, attachOpenCodeAppAgents(), OpenCodeSdkFacade, buildMessageRenderGroups() (+73 more)

### Community 19 - "Community 19"
Cohesion: 0.03
Nodes (80): buildLobehubDefinitions(), buildOpencodeDefinitions(), computeMatchScore(), createDefinition(), findBuiltinIcon(), formatBuiltinSource(), getBuiltinIcon(), getDisplayName() (+72 more)

### Community 20 - "Community 20"
Cohesion: 0.03
Nodes (54): buildStreamErrorNotice(), ModelCatalogStateService, assembleModelCatalog(), assembleServerModelCatalog(), filterCatalogToProviderIds(), projectEffectiveCatalog(), resolveProviderAvailabilityProbePlan(), selectProviderProbeModelId() (+46 more)

### Community 21 - "Community 21"
Cohesion: 0.03
Nodes (12): cloneConversationMetadataOnly(), ConversationFullMessageCache, formatDurationMs(), OpenCodianPlugin, OpenCodianStartupCoordinator, PluginRuntimeCoordinator, ProjectConfigFileWatcher, broadcastModelsLoadedToSettingsViews() (+4 more)

### Community 22 - "Community 22"
Cohesion: 0.03
Nodes (24): resolveCodexBinaryPath(), wireHiddenAdapters(), getActiveBackendCapabilities(), getAgentServiceRegistry(), setAgentServiceRegistry(), AgentServiceRegistry, McpServerStatusModal, redactMcpSensitiveText() (+16 more)

### Community 23 - "Community 23"
Cohesion: 0.03
Nodes (32): ConversationUserMessageRenderDelegate, detectMcpAuthError(), applyMcpAuthOutcome(), applyMcpRetryOutcome(), cssEscape(), getMcpServerName(), renderMcpExpandedContent(), renderMcpServerChip() (+24 more)

### Community 24 - "Community 24"
Cohesion: 0.03
Nodes (37): archiveBackendSession(), extractSessionDetailFields(), extractTimestamp(), extractTitleSummary(), forkBackendSession(), getActiveSessionBackendService(), getActiveSessionHistoryService(), getBackendSessionDetail() (+29 more)

### Community 25 - "Community 25"
Cohesion: 0.03
Nodes (27): chooseForkTarget(), ForkTargetModal, ModelPickerModal, ProviderBuiltinIconPickerModal, commitHistoryValue(), enhanceSearchInput(), readHistory(), resolveBoundary() (+19 more)

### Community 26 - "Community 26"
Cohesion: 0.04
Nodes (27): buildFragmentWithLinks(), createWikilinkElement(), createWikilinkPattern(), extractLinkTarget(), fileExistsInVault(), findWikilinks(), processFileLinks(), processTextNode() (+19 more)

### Community 27 - "Community 27"
Cohesion: 0.03
Nodes (25): extractAssistantStructuredTextCopyContent(), resolveAssistantCopyContent(), AssistantErrorRenderer, buildErrorAssistantFooterPayload(), buildNoticeAssistantFooterPayload(), buildPersistedAssistantFooterPayload(), buildPseudoStreamAssistantFooterPayload(), resolvePersistedAssistantFooterStatusLabel() (+17 more)

### Community 28 - "Community 28"
Cohesion: 0.04
Nodes (13): ConversationHistoryActionsCoordinator, ConversationHistoryDialogService, ConversationSessionSignalRuntime, normalizeDiffEntries(), normalizeMessageInfo(), normalizePart(), OpenCodeSyncEventRuntimeCoordinator, resolveSessionId() (+5 more)

### Community 29 - "Community 29"
Cohesion: 0.05
Nodes (87): clamp(), compileGlShader(), createGlProgram(), createLiquidDiamondDemoWebGlRenderer(), createPlane(), cross3(), dot3(), estimateAdaptiveDisplacementRangePx() (+79 more)

### Community 30 - "Community 30"
Cohesion: 0.05
Nodes (55): getInputPanelGlassRefractionCssVariables(), InputPanelAppearanceCoordinator, createComposerGlassFilterElement(), createSvgElement(), ensureComposerGlassSvgDefs(), ensureComposerGlassSvgRootElement(), InputPanelThemeRuntime, applyBackdropFilterValue() (+47 more)

### Community 31 - "Community 31"
Cohesion: 0.04
Nodes (9): AgentCatalogService, SurfaceAgentBuilder, AgentMentionCandidateService, normalizeRuntimeAgents(), MarkdownAgentWorkspaceService, parseFrontmatter(), SettingsAgentsSection, SystemAgentGuardService (+1 more)

### Community 32 - "Community 32"
Cohesion: 0.07
Nodes (8): ChatSelectionControlsCoordinator, readActiveBackendFromPlugin(), createClaudeCodePermissionConfig(), createCodexSandboxConfig(), createOpenCodePermissionConfig(), PermissionModeSelectorCoordinator, readSandboxSettingsFromPlugin(), SandboxConfigBadgeCoordinator

### Community 33 - "Community 33"
Cohesion: 0.11
Nodes (49): add3(), buildClipPath(), buildDisplacementTrace(), buildGlassOctahedronBackdropFilterValue(), buildGlassOctahedronLightBackdropFilterValue(), clamp(), computeBounds(), convexHull() (+41 more)

### Community 34 - "Community 34"
Cohesion: 0.07
Nodes (5): ContextDetailModal, ContextRing, ContextUsageDisplayService, getLocale(), setLocale()

### Community 35 - "Community 35"
Cohesion: 0.1
Nodes (37): getDefaultClaudeCodeDebugChannelSettings(), getDefaultDebugModuleSettings(), isDebugModuleKey(), normalizeClaudeCodeDebugChannelSettings(), normalizeDebugModuleSettings(), normalizeDebugRefreshIntervalMs(), resolveDebugModuleKey(), createLogger() (+29 more)

### Community 36 - "Community 36"
Cohesion: 0.1
Nodes (3): ModelConfigModelListEditor, ModelConfigProviderEditor, ModelConfigStructuredOptionsEditor

### Community 37 - "Community 37"
Cohesion: 0.12
Nodes (14): QuestionDock, applyQuestionDockSelection(), getQuestionDockActiveInteractionState(), getQuestionDockDraftAnswers(), sanitizeQuestionDockAnswer(), selectQuestionDockGroup(), selectQuestionDockQuestion(), setQuestionDockDraftAnswer() (+6 more)

### Community 38 - "Community 38"
Cohesion: 0.15
Nodes (23): buildAskUserQuestionInput(), ClaudeCodePermissionBridge, cloneInput(), createAllowResult(), createDenyResult(), destinationOf(), getToolUseID(), isAskUserQuestion() (+15 more)

### Community 39 - "Community 39"
Cohesion: 0.1
Nodes (9): buildClaudeCodeElicitationContent(), buildClaudeCodeElicitationQuestionRequest(), coerceElicitationScalarAnswer(), getHeader(), getSchemaProperties(), normalizeClaudeCodeElicitationContent(), SessionPermissionTracker, PermissionInlineCardRenderer (+1 more)

### Community 40 - "Community 40"
Cohesion: 0.09
Nodes (5): ComposerContextViewFacade, createComposerContextServices(), ComposerContextViewHostAdapter, createFocusContextServices(), FocusContextViewHostAdapter

### Community 41 - "Community 41"
Cohesion: 0.14
Nodes (15): createBackgroundConversationPostSyncHandoffServices(), createBackgroundConversationPostSyncHandoffViewHostAdapter(), createPostSyncQuestionTodoRefreshHosts(), createPostSyncQuestionTodoRefreshServices(), createQuestionTodoBackgroundTaskActivationHosts(), createQuestionTodoBackgroundTaskActivationServices(), createQuestionTodoBackgroundTaskActivationViewHostAdapter(), createQuestionTodoBackgroundTaskRefreshServices() (+7 more)

### Community 42 - "Community 42"
Cohesion: 0.22
Nodes (2): buildNextHiddenSlashCommands(), SettingsCommandsSection

### Community 43 - "Community 43"
Cohesion: 0.39
Nodes (1): CodexReadbackModal

### Community 44 - "Community 44"
Cohesion: 0.4
Nodes (1): ContextFileCatalogEventBridge

### Community 45 - "Community 45"
Cohesion: 0.67
Nodes (0): 

### Community 46 - "Community 46"
Cohesion: 0.67
Nodes (0): 

### Community 47 - "Community 47"
Cohesion: 1.0
Nodes (2): adaptMcpConfigForClaude(), adaptSingleMcpEntry()

### Community 48 - "Community 48"
Cohesion: 1.0
Nodes (1): WebSocket

### Community 49 - "Community 49"
Cohesion: 1.0
Nodes (0): 

### Community 50 - "Community 50"
Cohesion: 1.0
Nodes (0): 

### Community 51 - "Community 51"
Cohesion: 1.0
Nodes (0): 

### Community 52 - "Community 52"
Cohesion: 1.0
Nodes (0): 

### Community 53 - "Community 53"
Cohesion: 1.0
Nodes (0): 

### Community 54 - "Community 54"
Cohesion: 1.0
Nodes (0): 

### Community 55 - "Community 55"
Cohesion: 1.0
Nodes (0): 

### Community 56 - "Community 56"
Cohesion: 1.0
Nodes (0): 

### Community 57 - "Community 57"
Cohesion: 1.0
Nodes (0): 

### Community 58 - "Community 58"
Cohesion: 1.0
Nodes (0): 

### Community 59 - "Community 59"
Cohesion: 1.0
Nodes (0): 

### Community 60 - "Community 60"
Cohesion: 1.0
Nodes (0): 

### Community 61 - "Community 61"
Cohesion: 1.0
Nodes (0): 

### Community 62 - "Community 62"
Cohesion: 1.0
Nodes (0): 

### Community 63 - "Community 63"
Cohesion: 1.0
Nodes (0): 

### Community 64 - "Community 64"
Cohesion: 1.0
Nodes (0): 

### Community 65 - "Community 65"
Cohesion: 1.0
Nodes (0): 

### Community 66 - "Community 66"
Cohesion: 1.0
Nodes (0): 

### Community 67 - "Community 67"
Cohesion: 1.0
Nodes (0): 

### Community 68 - "Community 68"
Cohesion: 1.0
Nodes (0): 

### Community 69 - "Community 69"
Cohesion: 1.0
Nodes (0): 

### Community 70 - "Community 70"
Cohesion: 1.0
Nodes (0): 

### Community 71 - "Community 71"
Cohesion: 1.0
Nodes (0): 

### Community 72 - "Community 72"
Cohesion: 1.0
Nodes (0): 

### Community 73 - "Community 73"
Cohesion: 1.0
Nodes (0): 

### Community 74 - "Community 74"
Cohesion: 1.0
Nodes (0): 

### Community 75 - "Community 75"
Cohesion: 1.0
Nodes (0): 

### Community 76 - "Community 76"
Cohesion: 1.0
Nodes (0): 

### Community 77 - "Community 77"
Cohesion: 1.0
Nodes (0): 

### Community 78 - "Community 78"
Cohesion: 1.0
Nodes (0): 

### Community 79 - "Community 79"
Cohesion: 1.0
Nodes (0): 

### Community 80 - "Community 80"
Cohesion: 1.0
Nodes (0): 

### Community 81 - "Community 81"
Cohesion: 1.0
Nodes (0): 

### Community 82 - "Community 82"
Cohesion: 1.0
Nodes (0): 

### Community 83 - "Community 83"
Cohesion: 1.0
Nodes (0): 

### Community 84 - "Community 84"
Cohesion: 1.0
Nodes (0): 

### Community 85 - "Community 85"
Cohesion: 1.0
Nodes (0): 

### Community 86 - "Community 86"
Cohesion: 1.0
Nodes (0): 

### Community 87 - "Community 87"
Cohesion: 1.0
Nodes (0): 

### Community 88 - "Community 88"
Cohesion: 1.0
Nodes (0): 

### Community 89 - "Community 89"
Cohesion: 1.0
Nodes (0): 

### Community 90 - "Community 90"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **1 isolated node(s):** `WebSocket`
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 48`** (2 nodes): `ws-shim.d.ts`, `WebSocket`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (2 nodes): `isCommandBlocked()`, `BlocklistChecker.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (2 nodes): `setupCollapsible()`, `collapsible.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (1 nodes): `jsx-shim.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (1 nodes): `toolNames.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (1 nodes): `opencodeConfig.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (1 nodes): `tools.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 57`** (1 nodes): `modelConfig.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 58`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 59`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 60`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 61`** (1 nodes): `AgentService.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 62`** (1 nodes): `CodexAppServerClientTypes.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 63`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 64`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 65`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 66`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 67`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 68`** (1 nodes): `sdkTypes.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 69`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 70`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 71`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 72`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 73`** (1 nodes): `SendPipelineTypes.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 74`** (1 nodes): `trailingAssistantPatchTypes.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 75`** (1 nodes): `ComposerContextHostAdapter.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 76`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 77`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 78`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 79`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 80`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 81`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 82`** (1 nodes): `providerIconTypes.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 83`** (1 nodes): `lobehubIconManifest.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 84`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 85`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 86`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 87`** (1 nodes): `en.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 88`** (1 nodes): `zh.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 89`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 90`** (1 nodes): `three.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `Community 1` to `Community 0`, `Community 2`, `Community 3`, `Community 4`, `Community 5`, `Community 6`, `Community 7`, `Community 8`, `Community 9`, `Community 10`, `Community 11`, `Community 12`, `Community 14`, `Community 15`, `Community 16`, `Community 17`, `Community 19`, `Community 20`, `Community 21`, `Community 22`, `Community 23`, `Community 24`, `Community 25`, `Community 26`, `Community 27`, `Community 28`, `Community 31`, `Community 32`, `Community 34`, `Community 36`, `Community 37`, `Community 39`, `Community 42`, `Community 43`?**
  _High betweenness centrality (0.385) - this node is a cross-community bridge._
- **Why does `OpenCodianView` connect `Community 7` to `Community 0`, `Community 4`, `Community 5`, `Community 8`, `Community 9`, `Community 11`, `Community 14`, `Community 15`, `Community 18`, `Community 21`, `Community 22`, `Community 23`, `Community 24`, `Community 27`, `Community 28`, `Community 30`?**
  _High betweenness centrality (0.088) - this node is a cross-community bridge._
- **Why does `OpenCodeService` connect `Community 12` to `Community 0`, `Community 3`, `Community 4`, `Community 5`, `Community 6`, `Community 13`, `Community 14`, `Community 16`, `Community 20`, `Community 21`, `Community 22`, `Community 24`, `Community 28`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Are the 829 inferred relationships involving `t()` (e.g. with `.getEmptyConversationTitle()` and `.generateDefaultTitle()`) actually correct?**
  _`t()` has 829 INFERRED edges - model-reasoned connections that need verification._
- **What connects `WebSocket` to the rest of the system?**
  _1 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._