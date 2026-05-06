# Graph Report - /Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src  (2026-05-07)

## Corpus Check
- 375 files · ~314,349 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 4917 nodes · 10807 edges · 89 communities detected
- Extraction: 74% EXTRACTED · 26% INFERRED · 0% AMBIGUOUS · INFERRED: 2855 edges (avg confidence: 0.8)
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

## God Nodes (most connected - your core abstractions)
1. `t()` - 440 edges
2. `OpenCodianView` - 178 edges
3. `OpenCodeService` - 127 edges
4. `OpenCodianPlugin` - 59 edges
5. `OpenCodeCatalogQueryCoordinator` - 50 edges
6. `ConversationTabRuntimeCoordinator` - 48 edges
7. `OpencodeConfigManager` - 47 edges
8. `SettingsModelCatalogPresenter` - 47 edges
9. `ServerManager` - 43 edges
10. `SettingsFormatterSection` - 43 edges

## Surprising Connections (you probably didn't know these)
- `normalizeSessionCommandPath()` --calls--> `normalizeContextPath()`  [INFERRED]
  /Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/core/opencode/OpenCodeSessionControlOrchestrator.ts → /Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/shared/contextPath.ts
- `renderLanguageSetting()` --calls--> `t()`  [INFERRED]
  /Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/features/settings/SettingsPanelChrome.ts → /Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/i18n/index.ts
- `assertModelExtraFieldKeyAllowed()` --calls--> `t()`  [INFERRED]
  /Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/features/settings/modelConfigWorkspace.ts → /Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/i18n/index.ts
- `buildQuestionAnswerMarkdown()` --calls--> `t()`  [INFERRED]
  /Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/features/chat/runtime/QuestionResolutionCardRenderer.ts → /Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/i18n/index.ts
- `buildQuestionRejectedMarkdown()` --calls--> `t()`  [INFERRED]
  /Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/features/chat/runtime/QuestionResolutionCardRenderer.ts → /Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/i18n/index.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.01
Nodes (62): AssistantNoticeCardRenderer, ChatHeaderPresenter, ComposerContextEventBridge, ContextFilePickerModal, ConversationNoticeCoordinator, ConversationSessionSettingsModal, t(), LiquidGlassSettingHelpModal (+54 more)

### Community 1 - "Community 1"
Cohesion: 0.01
Nodes (57): AgentInvocationService, applyPassiveScrollMeasurement(), applyUserScrollIntent(), getDistanceFromBottom(), getProgrammaticScrollGuardDelayMs(), hasProgrammaticScrollGuard(), isNearBottom(), ChildSessionGraphCoordinator (+49 more)

### Community 2 - "Community 2"
Cohesion: 0.02
Nodes (23): BackgroundTaskCompletionNoticeService, BackgroundTaskIndicatorCoordinator, BackgroundTaskLiveSignalCoordinator, createBackgroundTaskLiveSignalCoordinatorHost(), BackgroundTaskNoticeStateService, BackgroundTaskStreamTriggerCoordinator, BackgroundTaskTimelineAssemblyService, BackgroundTaskTimelineLaunchService (+15 more)

### Community 3 - "Community 3"
Cohesion: 0.02
Nodes (29): ConversationTurnViewModelBuilder, getMessageParentId(), getRecordString(), isRecord(), createSdkClient(), OpenCodePromptRequestBuilder, buildCanonicalConversationFingerprintPayload(), cloneSettings() (+21 more)

### Community 4 - "Community 4"
Cohesion: 0.02
Nodes (19): LocalSidecarEndpointResolver, LocalSidecarLauncher, LocalProcessProbe, LocalSidecarProcessInspector, OpenCodeEventSubscriptionCoordinator, cloneSettings(), deepClonePlain(), deepCloneValue() (+11 more)

### Community 5 - "Community 5"
Cohesion: 0.02
Nodes (88): areChatAppearanceSettingsEqual(), diffObject(), getBuiltinThemePresets(), getThemeAppearanceOverridesFromBase(), getThemePresetDefinition(), hasThemeAppearanceOverrides(), mergePartialChatAppearanceSettings(), resolveThemeChatAppearance() (+80 more)

### Community 6 - "Community 6"
Cohesion: 0.02
Nodes (53): ModelCatalogStateService, assembleModelCatalog(), assembleServerModelCatalog(), filterCatalogToProviderIds(), projectEffectiveCatalog(), resolveProviderAvailabilityProbePlan(), selectProviderProbeModelId(), filterCatalog() (+45 more)

### Community 7 - "Community 7"
Cohesion: 0.02
Nodes (19): ActiveTabContextUsageCoordinator, buildStreamErrorNotice(), BackgroundTaskActivationIndicatorCoordinator, createEmptyTabContextState(), normalizeConversationSessionSettings(), ChatSelectionControlsCoordinator, ContextUsageService, ConversationHydrationOutcomeBridge (+11 more)

### Community 8 - "Community 8"
Cohesion: 0.02
Nodes (21): attachOpenCodeAppAgents(), OpenCodeCatalogQueryCoordinator, OpenCodeCatalogStateStore, normalizePermissionRequest(), normalizePermissionResponse(), normalizePermissionToolReference(), normalizeStringArray(), OpenCodeQuestionPermissionHub (+13 more)

### Community 9 - "Community 9"
Cohesion: 0.03
Nodes (14): buildConversationMetaFromStoredRecord(), cloneConversationListDiagnostics(), ConversationMetadataCache, getUtf8ByteLength(), trackTopDiagnosticEntries(), MarkdownAgentWorkspaceService, McpConfigService, OpencodeConfigManager (+6 more)

### Community 10 - "Community 10"
Cohesion: 0.03
Nodes (40): OpenCodeLegacySseStreamReader, extractRenderableToolMetadata(), OpenCodeMessageNormalizationMapper, OpenCodeToolContentAssembler, resolveOpenCodeToolKind(), resolveToolResultVisibility(), extractRenderableToolMetadata(), extractStructuredErrorMessage() (+32 more)

### Community 11 - "Community 11"
Cohesion: 0.03
Nodes (97): buildLobehubDefinitions(), buildOpencodeDefinitions(), computeMatchScore(), createDefinition(), findBuiltinIcon(), formatBuiltinSource(), getBuiltinIcon(), getDisplayName() (+89 more)

### Community 12 - "Community 12"
Cohesion: 0.03
Nodes (65): BackgroundConversationSignalSyncStateCoordinator, ConversationAuthoritativeMessageMergeCoordinator, ConversationAuthoritativeReloadCoordinator, findLatestInterruptedNotice(), findLatestUserBeforeTimestamp(), isInterruptedNoticeMessage(), shouldBypassCanonicalSyncForInterruptedNotice(), shouldPreserveInterruptedNoticeOnSync() (+57 more)

### Community 13 - "Community 13"
Cohesion: 0.03
Nodes (17): ConversationAssistantMessageRenderDelegate, ConversationMessageRenderDelegate, ConversationUserMessageRenderDelegate, StreamController, formatDurationSeconds(), normalizeDurationSeconds(), ThinkingBlockRenderer, ToolCallRenderer (+9 more)

### Community 14 - "Community 14"
Cohesion: 0.03
Nodes (10): ChatVisualDemoCoordinator, formatDurationMs(), getRecentLogText(), OpenCodianPlugin, OpenCodianStartupCoordinator, PluginRuntimeCoordinator, ProjectConfigFileWatcher, getCurrentPlatformDebugLogPath() (+2 more)

### Community 15 - "Community 15"
Cohesion: 0.04
Nodes (36): ModelConfigModal, createModelConfigKeyValueState(), createModelConfigModalSnapshot(), isBlankProviderState(), parseAddProviderJsonDraft(), readProviderOptionString(), resolveModelConfigJsonDraftValue(), syncProviderFormFromJsonDraft() (+28 more)

### Community 16 - "Community 16"
Cohesion: 0.03
Nodes (23): buildComposerContextChipStates(), createFocusContextPreview(), getContextTargetKey(), getPromptContextTargetKey(), removeDraftContextItemsByTarget(), resolveFocusContextPreview(), upsertDraftContextItem(), ComposerContextActionService (+15 more)

### Community 17 - "Community 17"
Cohesion: 0.03
Nodes (14): ConversationHistoryActionsCoordinator, ConversationHistoryDialogService, assembleConversationLoadRecovery(), ConversationLoadRecoveryCoordinator, createConversationLoadRecoveryHost(), ConversationTabLifecycleRecoveryCoordinator, ConversationTabOpenCoordinator, cloneMessagesBeforeForkTarget() (+6 more)

### Community 18 - "Community 18"
Cohesion: 0.04
Nodes (42): ContextAttachmentBuilder, ContextFileCatalogBuildRunner, ContextFileCatalogIndex, createContextFileEntry(), ContextFileCatalogService, contextPathFromFileUrl(), isAbsoluteContextPath(), isWindowsDrivePath() (+34 more)

### Community 19 - "Community 19"
Cohesion: 0.03
Nodes (26): QuestionDockCoordinator, applyQuestionDockSelection(), getQuestionDockActiveInteractionState(), getQuestionDockDraftAnswers(), sanitizeQuestionDockAnswer(), selectQuestionDockGroup(), selectQuestionDockQuestion(), setQuestionDockDraftAnswer() (+18 more)

### Community 20 - "Community 20"
Cohesion: 0.03
Nodes (31): extractAssistantStructuredTextCopyContent(), resolveAssistantCopyContent(), AssistantErrorRenderer, buildErrorAssistantFooterPayload(), buildNoticeAssistantFooterPayload(), buildPersistedAssistantFooterPayload(), buildPseudoStreamAssistantFooterPayload(), resolvePersistedAssistantFooterStatusLabel() (+23 more)

### Community 21 - "Community 21"
Cohesion: 0.05
Nodes (7): OpenCodianSettingTab, getActiveSecondaryTabId(), getPrimaryTabDefinition(), resolvePrimaryTabId(), resolveSecondaryTabId(), SettingsSectionCoordinator, SettingsTabbedRenderer

### Community 22 - "Community 22"
Cohesion: 0.05
Nodes (26): AgentMentionComposerController, filterAgentMentionCandidates(), findSingleTextEdit(), getEmptyAgentMentionMenuStatus(), isAgentMentionTokenBoundary(), scrollSelectedItemIntoView(), updateTrackedMentionRanges(), ChatAgentSelectionCoordinator (+18 more)

### Community 23 - "Community 23"
Cohesion: 0.04
Nodes (19): BackgroundTaskInlinePanelRenderer, EffortSelector, isAdaptiveThinkingModel(), clamp(), createStageLayerElement(), createSvgElement(), estimateProjectionDelta(), formatNumber() (+11 more)

### Community 24 - "Community 24"
Cohesion: 0.04
Nodes (15): buildModelPickerGroups(), findModelPickerOption(), findModelPickerOptionByRef(), SettingsConversationSection, addSettingHelpButton(), applyInlineCodeText(), buildInlineCodeFragment(), createSettingsBlock() (+7 more)

### Community 25 - "Community 25"
Cohesion: 0.05
Nodes (19): buildLocalStreamOutcome(), ConversationAuthoritativeSyncCoordinator, ConversationLoadRuntimeBridge, appendNoticeMessage(), logInterruptedAssistantPersistence(), logInterruptedNoticePersistence(), persistLocalStreamOutcome(), writeShellDataset() (+11 more)

### Community 26 - "Community 26"
Cohesion: 0.06
Nodes (72): measureDisplacementRangeAtUv(), add3(), applyEdgeBulge(), applyFilterLayerState(), bounds2(), buildBackdropFilterValue(), buildDisplacementTrace(), buildFallbackBackdropFilterValue() (+64 more)

### Community 27 - "Community 27"
Cohesion: 0.07
Nodes (53): createComposerGlassFilterElement(), createSvgElement(), ensureComposerGlassSvgDefs(), ensureComposerGlassSvgRootElement(), InputPanelThemeRuntime, applyBackdropFilterValue(), applyGlassTint(), applyInstanceMarker() (+45 more)

### Community 28 - "Community 28"
Cohesion: 0.05
Nodes (48): applyDisplacementSnapshot(), applyHostTransform(), buildBackdropFilterValue(), buildFallbackBackdropFilterValue(), clamp(), createFaceSvgElement(), createStageLayerElement(), createState() (+40 more)

### Community 29 - "Community 29"
Cohesion: 0.06
Nodes (21): ContextDetailModal, ContextUsageDisplayService, cloneFormatterConfigValue(), readFormatterConfigValue(), writeFormatterConfigValue(), getLocale(), buildObjectReplacementPatch(), buildProjectAgentOptionsPatch() (+13 more)

### Community 30 - "Community 30"
Cohesion: 0.08
Nodes (33): buildCommandScopedAgent(), cloneConfigObject(), cloneConfigValue(), getCommandScopedAgentId(), getCommandScopedAgentMetadata(), isCommandScopedAgentForCommand(), isCommandScopedAgentId(), mergeConfigObjects() (+25 more)

### Community 31 - "Community 31"
Cohesion: 0.12
Nodes (47): add3(), buildClipPath(), buildDisplacementTrace(), clamp(), computeBounds(), convexHull(), createFace(), createGlassOctahedronProjectionContext() (+39 more)

### Community 32 - "Community 32"
Cohesion: 0.06
Nodes (7): buildChatAppearanceCustomCss(), getChatAppearanceBackgroundSizeValue(), getChatAppearanceCssVariables(), getInputPanelGlassRefractionCssVariables(), ChatSurfaceAppearanceCoordinator, ConversationSessionSettingsCoordinator, InputPanelAppearanceCoordinator

### Community 33 - "Community 33"
Cohesion: 0.07
Nodes (11): AgentCatalogService, SurfaceAgentBuilder, AgentMentionCandidateService, normalizeRuntimeAgents(), buildHiddenCommandCacheKey(), loadAgentMentionCandidatesFromComposerCatalog(), loadAgentMentionCandidatesFromSlashCommandMenuItems(), loadAgentSelectionCandidatesFromComposerCatalog() (+3 more)

### Community 34 - "Community 34"
Cohesion: 0.11
Nodes (40): applyFilterLayerStyles(), applyShellStyles(), buildBackdropFilterValue(), buildEdgeBandWeight(), buildFallbackBackdropFilterValue(), buildFilterLayerBoxShadow(), captureDatasetSnapshot(), captureStyleSnapshot() (+32 more)

### Community 35 - "Community 35"
Cohesion: 0.06
Nodes (8): BackgroundConversationAttentionCoordinator, BackgroundConversationPostSyncHandoffCoordinator, BackgroundConversationPostSyncRefreshExecutor, ConversationSyncVisiblePostSyncRouter, PostSyncQuestionTodoRefreshFacade, PostSyncQuestionTodoRefreshPlanBuilder, VisibleConversationPostSyncCoordinator, VisibleConversationPostSyncStateCoordinator

### Community 36 - "Community 36"
Cohesion: 0.09
Nodes (29): registerBuiltinGlassAdapters(), getDefaultDebugModuleSettings(), isDebugModuleKey(), normalizeDebugModuleSettings(), normalizeDebugRefreshIntervalMs(), resolveDebugModuleKey(), setLocale(), createLogger() (+21 more)

### Community 37 - "Community 37"
Cohesion: 0.1
Nodes (11): McpServerStatusModal, redactMcpSensitiveText(), redactMcpTechnicalDetails(), redactUnknownSecretValues(), statusLabel(), summarizeCommand(), transportSummary(), countByStatus() (+3 more)

### Community 38 - "Community 38"
Cohesion: 0.11
Nodes (16): buildFragmentWithLinks(), createWikilinkElement(), createWikilinkPattern(), extractLinkTarget(), fileExistsInVault(), findWikilinks(), processFileLinks(), processTextNode() (+8 more)

### Community 39 - "Community 39"
Cohesion: 0.09
Nodes (5): ComposerContextViewFacade, createComposerContextServices(), ComposerContextViewHostAdapter, createFocusContextServices(), FocusContextViewHostAdapter

### Community 40 - "Community 40"
Cohesion: 0.14
Nodes (15): createBackgroundConversationPostSyncHandoffServices(), createBackgroundConversationPostSyncHandoffViewHostAdapter(), createPostSyncQuestionTodoRefreshHosts(), createPostSyncQuestionTodoRefreshServices(), createQuestionTodoBackgroundTaskActivationHosts(), createQuestionTodoBackgroundTaskActivationServices(), createQuestionTodoBackgroundTaskActivationViewHostAdapter(), createQuestionTodoBackgroundTaskRefreshServices() (+7 more)

### Community 41 - "Community 41"
Cohesion: 0.19
Nodes (20): buildTrailingAssistantPatchCompletionDebugPlan(), buildTrailingAssistantPatchCompletionDebugPlanFromTailOutcomePlanningContext(), buildTrailingAssistantPatchCompletionDebugPlanningContext(), buildTrailingAssistantPatchCompletionDebugPlanningContextInputs(), buildTrailingAssistantPatchCompletionDebugPlanningContextShape(), buildTrailingAssistantPatchCompletionDebugPlanningContextSourceContract(), buildTrailingAssistantPatchCompletionDebugSourceContractFromTailOutcomePlanningContext(), buildTrailingAssistantPatchCompletionDebugSummaryPlan() (+12 more)

### Community 42 - "Community 42"
Cohesion: 0.28
Nodes (1): ChildSessionGraphService

### Community 43 - "Community 43"
Cohesion: 0.26
Nodes (1): TabBar

### Community 44 - "Community 44"
Cohesion: 0.2
Nodes (6): buildModelOptionValue(), parseModelOptionValue(), scrollToCurrentModel(), selectHighlightedModel(), renderModelList(), bindModelSelectorStickyHeaders()

### Community 45 - "Community 45"
Cohesion: 0.24
Nodes (6): createConversationSyncBridgePorts(), assembleConversationSyncRuntime(), createConversationSyncHosts(), createConversationSyncServices(), createConversationSyncLoadRuntimeHosts(), createConversationSyncLoadRuntimeViewHosts()

### Community 46 - "Community 46"
Cohesion: 0.44
Nodes (8): formatMcpSummaryField(), getFirstScalarMcpFallback(), getMcpSummaryFromFields(), getMcpToolSummary(), getPathTail(), resolveMcpSummaryCategory(), tokenizeMcpToolName(), truncateMcpSummaryText()

### Community 47 - "Community 47"
Cohesion: 0.39
Nodes (1): ServerSettingHelpModal

### Community 48 - "Community 48"
Cohesion: 0.39
Nodes (1): ConversationCompactionHelpModal

### Community 49 - "Community 49"
Cohesion: 0.4
Nodes (1): ContextFileCatalogEventBridge

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

## Knowledge Gaps
- **Thin community `Community 50`** (2 nodes): `isCommandBlocked()`, `BlocklistChecker.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (2 nodes): `setupCollapsible()`, `collapsible.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (1 nodes): `jsx-shim.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (1 nodes): `toolNames.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (1 nodes): `opencodeConfig.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (1 nodes): `tools.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 57`** (1 nodes): `permission.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 58`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 59`** (1 nodes): `modelConfig.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 60`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 61`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 62`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 63`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 64`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 65`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 66`** (1 nodes): `sdkTypes.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 67`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 68`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 69`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 70`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 71`** (1 nodes): `SendPipelineTypes.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 72`** (1 nodes): `trailingAssistantPatchTypes.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 73`** (1 nodes): `ComposerContextHostAdapter.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 74`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 75`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 76`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 77`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 78`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 79`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 80`** (1 nodes): `providerIconTypes.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 81`** (1 nodes): `lobehubIconManifest.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 82`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 83`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 84`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 85`** (1 nodes): `en.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 86`** (1 nodes): `zh.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 87`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 88`** (1 nodes): `three.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `Community 0` to `Community 1`, `Community 2`, `Community 5`, `Community 6`, `Community 7`, `Community 9`, `Community 11`, `Community 13`, `Community 14`, `Community 15`, `Community 17`, `Community 18`, `Community 19`, `Community 20`, `Community 21`, `Community 22`, `Community 23`, `Community 24`, `Community 25`, `Community 28`, `Community 29`, `Community 30`, `Community 32`, `Community 36`, `Community 37`, `Community 43`, `Community 47`, `Community 48`?**
  _High betweenness centrality (0.456) - this node is a cross-community bridge._
- **Why does `OpenCodianView` connect `Community 1` to `Community 32`, `Community 33`, `Community 2`, `Community 0`, `Community 10`, `Community 12`, `Community 13`, `Community 14`, `Community 16`, `Community 17`, `Community 19`, `Community 22`, `Community 23`?**
  _High betweenness centrality (0.095) - this node is a cross-community bridge._
- **Why does `OpenCodeService` connect `Community 3` to `Community 0`, `Community 1`, `Community 2`, `Community 4`, `Community 37`, `Community 6`, `Community 8`, `Community 9`, `Community 10`, `Community 12`, `Community 14`, `Community 19`, `Community 24`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Are the 439 inferred relationships involving `t()` (e.g. with `.getEmptyConversationTitle()` and `.generateDefaultTitle()`) actually correct?**
  _`t()` has 439 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.02 - nodes in this community are weakly interconnected._