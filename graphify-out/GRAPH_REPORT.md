# Graph Report - /Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src  (2026-05-17)

## Corpus Check
- 399 files · ~357,261 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 5583 nodes · 12805 edges · 90 communities detected
- Extraction: 72% EXTRACTED · 28% INFERRED · 0% AMBIGUOUS · INFERRED: 3607 edges (avg confidence: 0.8)
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

## God Nodes (most connected - your core abstractions)
1. `t()` - 583 edges
2. `OpenCodianView` - 181 edges
3. `OpenCodeService` - 127 edges
4. `SettingsFormatterSection` - 96 edges
5. `OpenCodianPlugin` - 64 edges
6. `OpencodeConfigManager` - 58 edges
7. `ConversationTabRuntimeCoordinator` - 58 edges
8. `SettingsConversationSection` - 56 edges
9. `SettingsSkillSection` - 51 edges
10. `OpenCodeCatalogQueryCoordinator` - 50 edges

## Surprising Connections (you probably didn't know these)
- `normalizeSessionCommandPath()` --calls--> `normalizeContextPath()`  [INFERRED]
  /Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/core/opencode/OpenCodeSessionControlOrchestrator.ts → /Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/shared/contextPath.ts
- `renderLanguageSetting()` --calls--> `t()`  [INFERRED]
  /Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/features/settings/SettingsPanelChrome.ts → /Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/i18n/index.ts
- `buildQuestionAnswerMarkdown()` --calls--> `t()`  [INFERRED]
  /Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/features/chat/runtime/QuestionResolutionCardRenderer.ts → /Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/i18n/index.ts
- `buildQuestionRejectedMarkdown()` --calls--> `t()`  [INFERRED]
  /Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/features/chat/runtime/QuestionResolutionCardRenderer.ts → /Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/i18n/index.ts
- `getQuestionResolutionAnswerText()` --calls--> `t()`  [INFERRED]
  /Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/features/chat/runtime/QuestionResolutionCardRenderer.ts → /Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src/i18n/index.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.01
Nodes (43): AssistantNoticeCardRenderer, t(), LspStatusRefreshCoordinator, ModelConfigJsonModal, ModifiedFilesSidebarHelpModal, OpencodeConfigModal, OpenCodeProjectConfigHelpModal, ProviderBuiltinIconPickerModal (+35 more)

### Community 1 - "Community 1"
Cohesion: 0.01
Nodes (44): applyPassiveScrollMeasurement(), applyUserScrollIntent(), getDistanceFromBottom(), getProgrammaticScrollGuardDelayMs(), hasProgrammaticScrollGuard(), isNearBottom(), ConversationHydrationRenderBridge, assembleConversationHydrationRuntime() (+36 more)

### Community 2 - "Community 2"
Cohesion: 0.01
Nodes (37): AcpClientManager, AcpTransportOwner, translateAcpMessageChunk(), translateAcpToolCall(), translateAcpToolCallUpdate(), ConversationTurnViewModelBuilder, getMessageParentId(), getRecordString() (+29 more)

### Community 3 - "Community 3"
Cohesion: 0.02
Nodes (112): AgentInvocationService, BackgroundTaskTimelineLaunchService, buildChatAppearanceCustomCss(), ChildSessionGraphService, collectMarkdownFiles(), loadCommandsFromConfigDir(), loadCommandsFromMdFiles(), parseFrontmatter() (+104 more)

### Community 4 - "Community 4"
Cohesion: 0.02
Nodes (122): registerBuiltinGlassAdapters(), getDefaultDebugModuleSettings(), isDebugModuleKey(), normalizeDebugModuleSettings(), normalizeDebugRefreshIntervalMs(), resolveDebugModuleKey(), areChatAppearanceSettingsEqual(), diffObject() (+114 more)

### Community 5 - "Community 5"
Cohesion: 0.02
Nodes (32): ActiveTabContextUsageCoordinator, BackgroundConversationPostSyncHandoffCoordinator, BackgroundConversationPostSyncRefreshExecutor, createEmptyTabContextState(), ContextUsageService, ConversationHistoryActionsCoordinator, ConversationHistoryDialogService, assembleConversationLoadRecovery() (+24 more)

### Community 6 - "Community 6"
Cohesion: 0.02
Nodes (53): buildCommandScopedAgent(), cloneConfigObject(), cloneConfigValue(), getCommandScopedAgentId(), getCommandScopedAgentMetadata(), isCommandScopedAgentForCommand(), isCommandScopedAgentId(), mergeConfigObjects() (+45 more)

### Community 7 - "Community 7"
Cohesion: 0.02
Nodes (33): OpenCodeCatalogQueryCoordinator, OpenCodeCatalogStateStore, OpenCodeEventSubscriptionCoordinator, OpenCodeMessageNormalizationMapper, isTransientQuestionMutationError(), normalizePermissionRequest(), normalizePermissionResponse(), normalizePermissionToolReference() (+25 more)

### Community 8 - "Community 8"
Cohesion: 0.02
Nodes (39): AssistantErrorRenderer, BackgroundTaskTimelineService, createBackgroundTaskViewHost(), buildLocalStreamOutcome(), ConversationAuthoritativeMessageMergeCoordinator, ConversationAuthoritativeReloadCoordinator, findLatestInterruptedNotice(), findLatestUserBeforeTimestamp() (+31 more)

### Community 9 - "Community 9"
Cohesion: 0.02
Nodes (15): BackgroundTaskCompletionNoticeService, BackgroundTaskIndicatorCoordinator, BackgroundTaskLiveSignalCoordinator, createBackgroundTaskLiveSignalCoordinatorHost(), BackgroundTaskNoticeStateService, BackgroundTaskStreamTriggerCoordinator, BackgroundTaskTimelineAssemblyService, ContextRing (+7 more)

### Community 10 - "Community 10"
Cohesion: 0.03
Nodes (10): ChatVisualDemoCoordinator, ChildSessionGraphCoordinator, ComposerContextEventBridge, OpenCodianSettingTab, OpenCodianSettingsView, getActiveSecondaryTabId(), getPrimaryTabDefinition(), resolvePrimaryTabId() (+2 more)

### Community 11 - "Community 11"
Cohesion: 0.03
Nodes (27): cloneConversationMetadataOnly(), ConversationFullMessageCache, clamp(), createStageLayerElement(), createSvgElement(), estimateProjectionDelta(), formatNumber(), generateFilterId() (+19 more)

### Community 12 - "Community 12"
Cohesion: 0.03
Nodes (120): applyDisplacementSnapshot(), applyHostTransform(), buildBackdropFilterValue(), buildFallbackBackdropFilterValue(), clamp(), createFaceSvgElement(), createStageLayerElement(), createState() (+112 more)

### Community 13 - "Community 13"
Cohesion: 0.03
Nodes (80): buildLobehubDefinitions(), buildOpencodeDefinitions(), computeMatchScore(), createDefinition(), findBuiltinIcon(), formatBuiltinSource(), getBuiltinIcon(), getDisplayName() (+72 more)

### Community 14 - "Community 14"
Cohesion: 0.03
Nodes (31): OpenCodeLegacySseStreamReader, extractRenderableToolMetadata(), OpenCodeToolContentAssembler, resolveOpenCodeToolKind(), resolveToolResultVisibility(), extractRenderableToolMetadata(), extractStructuredErrorMessage(), extractStructuredErrorName() (+23 more)

### Community 15 - "Community 15"
Cohesion: 0.03
Nodes (24): buildComposerContextChipStates(), createFocusContextPreview(), getContextTargetKey(), getPromptContextTargetKey(), removeDraftContextItemsByTarget(), resolveFocusContextPreview(), upsertDraftContextItem(), ComposerContextActionService (+16 more)

### Community 16 - "Community 16"
Cohesion: 0.03
Nodes (36): AgentMentionComposerController, filterAgentMentionCandidates(), findSingleTextEdit(), getEmptyAgentMentionMenuStatus(), isAtomicMentionEditKey(), isPrintableEditKey(), scrollSelectedItemIntoView(), updateTrackedMentionRanges() (+28 more)

### Community 17 - "Community 17"
Cohesion: 0.04
Nodes (7): LocalSidecarEndpointResolver, LocalSidecarLauncher, LocalProcessProbe, formatDurationMs(), getRecentLogText(), OpenCodianStartupCoordinator, ServerManager

### Community 18 - "Community 18"
Cohesion: 0.03
Nodes (11): buildStreamErrorNotice(), ChatSelectionControlsCoordinator, ConversationHydrationOutcomeBridge, ConversationViewStateService, ModelSelectionRuntime, buildModelSelectorDisplayState(), PermissionModeSelectorCoordinator, QuestionTodoActivationRefreshCoordinator (+3 more)

### Community 19 - "Community 19"
Cohesion: 0.04
Nodes (21): BackgroundTaskInlinePanelRenderer, ConversationUserMessageRenderDelegate, StreamController, formatDurationSeconds(), normalizeDurationSeconds(), ThinkingBlockRenderer, ToolCallRenderer, createStreamState() (+13 more)

### Community 20 - "Community 20"
Cohesion: 0.03
Nodes (19): buildModelPickerGroups(), filterModelPickerGroups(), findModelPickerOption(), findModelPickerOptionByRef(), ModelPickerModal, describeModelAvailabilitySummary(), describeProviderAvailabilityProbe(), describeProviderModels() (+11 more)

### Community 21 - "Community 21"
Cohesion: 0.03
Nodes (59): ConversationIdentityRuntime, ConversationMessageRenderDelegate, ConversationSyncedUpdateApplyDelegate, getIncrementalRenderedMessageUpdate(), TrailingAssistantPatchPlanningDelegate, attachOpenCodeAppAgents(), OpenCodeSdkFacade, buildMessageRenderGroups() (+51 more)

### Community 22 - "Community 22"
Cohesion: 0.04
Nodes (33): ContextAttachmentBuilder, ContextFileCatalogBuildRunner, ContextFileCatalogIndex, createContextFileEntry(), ContextFileCatalogService, contextPathFromFileUrl(), isAbsoluteContextPath(), isWindowsDrivePath() (+25 more)

### Community 23 - "Community 23"
Cohesion: 0.03
Nodes (25): QuestionDock, QuestionDockCoordinator, applyQuestionDockSelection(), getQuestionDockActiveInteractionState(), getQuestionDockDraftAnswers(), sanitizeQuestionDockAnswer(), selectQuestionDockGroup(), selectQuestionDockQuestion() (+17 more)

### Community 24 - "Community 24"
Cohesion: 0.04
Nodes (13): PluginManagementService, ProjectConfigFileWatcher, SettingsAcpSection, applyInlineCodeText(), buildInlineCodeFragment(), createSettingsBlock(), renderLanguageSetting(), renderSettingsPanelTitle() (+5 more)

### Community 25 - "Community 25"
Cohesion: 0.03
Nodes (30): buildFragmentWithLinks(), createWikilinkElement(), createWikilinkPattern(), extractLinkTarget(), fileExistsInVault(), findWikilinks(), processFileLinks(), processTextNode() (+22 more)

### Community 26 - "Community 26"
Cohesion: 0.05
Nodes (50): ModelCatalogStateService, assembleModelCatalog(), assembleServerModelCatalog(), filterCatalogToProviderIds(), projectEffectiveCatalog(), resolveProviderAvailabilityProbePlan(), selectProviderProbeModelId(), collectCurrentEnabledProviderIds() (+42 more)

### Community 27 - "Community 27"
Cohesion: 0.03
Nodes (29): extractAssistantStructuredTextCopyContent(), resolveAssistantCopyContent(), buildErrorAssistantFooterPayload(), buildNoticeAssistantFooterPayload(), buildPersistedAssistantFooterPayload(), buildPseudoStreamAssistantFooterPayload(), resolvePersistedAssistantFooterStatusLabel(), AssistantFooterRenderer (+21 more)

### Community 28 - "Community 28"
Cohesion: 0.04
Nodes (9): AgentCatalogService, SurfaceAgentBuilder, AgentMentionCandidateService, normalizeRuntimeAgents(), MarkdownAgentWorkspaceService, parseFrontmatter(), SettingsAgentsSection, SystemAgentGuardService (+1 more)

### Community 29 - "Community 29"
Cohesion: 0.04
Nodes (8): ChatHeaderPresenter, ConversationRenderService, ConversationSyncVisiblePostSyncRouter, LspStatusIndicator, PluginRuntimeCoordinator, UserMessageFooterRenderer, VisibleConversationPostSyncCoordinator, VisibleConversationPostSyncStateCoordinator

### Community 30 - "Community 30"
Cohesion: 0.06
Nodes (6): getCurrentPlatformDebugLogPath(), getCurrentPlatformKey(), getElectronDialog(), SettingsDebugSection, SettingsServerSection, SettingsTabbedRenderer

### Community 31 - "Community 31"
Cohesion: 0.05
Nodes (11): normalizeConversationSessionSettings(), getChatAppearanceBackgroundSizeValue(), getChatAppearanceCssVariables(), getInputPanelGlassRefractionCssVariables(), ChatSurfaceAppearanceCoordinator, ConversationSessionSettingsCoordinator, extractPrimaryFontName(), InputFontLoader (+3 more)

### Community 32 - "Community 32"
Cohesion: 0.07
Nodes (53): createComposerGlassFilterElement(), createSvgElement(), ensureComposerGlassSvgDefs(), ensureComposerGlassSvgRootElement(), InputPanelThemeRuntime, applyBackdropFilterValue(), applyGlassTint(), applyInstanceMarker() (+45 more)

### Community 33 - "Community 33"
Cohesion: 0.06
Nodes (20): McpServerEditorModal, McpServerStatusModal, redactMcpSensitiveText(), redactMcpTechnicalDetails(), redactUnknownSecretValues(), statusLabel(), summarizeCommand(), transportSummary() (+12 more)

### Community 34 - "Community 34"
Cohesion: 0.11
Nodes (49): add3(), buildClipPath(), buildDisplacementTrace(), buildGlassOctahedronBackdropFilterValue(), buildGlassOctahedronLightBackdropFilterValue(), clamp(), computeBounds(), convexHull() (+41 more)

### Community 35 - "Community 35"
Cohesion: 0.06
Nodes (5): SessionPermissionTracker, PermissionInlineCardRenderer, QuestionInlineCardRenderer, QuestionResolutionCoordinator, StreamingInlineCardRenderer

### Community 36 - "Community 36"
Cohesion: 0.09
Nodes (21): buildNextHiddenSlashCommands(), SettingsCommandsSection, buildRuntimeSkillSourceMap(), extractPluginSkillName(), inferSkillSource(), isCatalogRuntimeCommand(), isPathWithinRoot(), mergeSlashCommandCatalog() (+13 more)

### Community 37 - "Community 37"
Cohesion: 0.11
Nodes (40): applyFilterLayerStyles(), applyShellStyles(), buildBackdropFilterValue(), buildEdgeBandWeight(), buildFallbackBackdropFilterValue(), buildFilterLayerBoxShadow(), captureDatasetSnapshot(), captureStyleSnapshot() (+32 more)

### Community 38 - "Community 38"
Cohesion: 0.1
Nodes (2): ContextDetailModal, ContextUsageDisplayService

### Community 39 - "Community 39"
Cohesion: 0.13
Nodes (2): ConversationSessionSettingsModal, normalizeChatFontSizePx()

### Community 40 - "Community 40"
Cohesion: 0.09
Nodes (5): ComposerContextViewFacade, createComposerContextServices(), ComposerContextViewHostAdapter, createFocusContextServices(), FocusContextViewHostAdapter

### Community 41 - "Community 41"
Cohesion: 0.13
Nodes (1): SettingsStyleControls

### Community 42 - "Community 42"
Cohesion: 0.19
Nodes (20): buildTrailingAssistantPatchCompletionDebugPlan(), buildTrailingAssistantPatchCompletionDebugPlanFromTailOutcomePlanningContext(), buildTrailingAssistantPatchCompletionDebugPlanningContext(), buildTrailingAssistantPatchCompletionDebugPlanningContextInputs(), buildTrailingAssistantPatchCompletionDebugPlanningContextShape(), buildTrailingAssistantPatchCompletionDebugPlanningContextSourceContract(), buildTrailingAssistantPatchCompletionDebugSourceContractFromTailOutcomePlanningContext(), buildTrailingAssistantPatchCompletionDebugSummaryPlan() (+12 more)

### Community 43 - "Community 43"
Cohesion: 0.14
Nodes (15): createBackgroundConversationPostSyncHandoffServices(), createBackgroundConversationPostSyncHandoffViewHostAdapter(), createPostSyncQuestionTodoRefreshHosts(), createPostSyncQuestionTodoRefreshServices(), createQuestionTodoBackgroundTaskActivationHosts(), createQuestionTodoBackgroundTaskActivationServices(), createQuestionTodoBackgroundTaskActivationViewHostAdapter(), createQuestionTodoBackgroundTaskRefreshServices() (+7 more)

### Community 44 - "Community 44"
Cohesion: 0.26
Nodes (1): NavigationSidebar

### Community 45 - "Community 45"
Cohesion: 0.31
Nodes (2): EffortSelector, formatVariantLabel()

### Community 46 - "Community 46"
Cohesion: 0.31
Nodes (6): createQuestionPostResolutionRuntimeHostAdapter(), createQuestionRuntimeHosts(), createQuestionRuntimeServices(), createQuestionRuntimeViewHostAdapter(), createQuestionRuntimeBundle(), createQuestionRuntimeViewHost()

### Community 47 - "Community 47"
Cohesion: 0.33
Nodes (1): SessionTodoDock

### Community 48 - "Community 48"
Cohesion: 0.39
Nodes (1): ServerSettingHelpModal

### Community 49 - "Community 49"
Cohesion: 0.39
Nodes (1): ConversationCompactionHelpModal

### Community 50 - "Community 50"
Cohesion: 0.4
Nodes (1): ContextFileCatalogEventBridge

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

## Knowledge Gaps
- **Thin community `Community 51`** (2 nodes): `isCommandBlocked()`, `BlocklistChecker.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (2 nodes): `setupCollapsible()`, `collapsible.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (1 nodes): `jsx-shim.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (1 nodes): `toolNames.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (1 nodes): `opencodeConfig.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 57`** (1 nodes): `tools.ts`
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
- **Thin community `Community 65`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 66`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 67`** (1 nodes): `sdkTypes.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 68`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 69`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 70`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 71`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 72`** (1 nodes): `SendPipelineTypes.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 73`** (1 nodes): `trailingAssistantPatchTypes.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 74`** (1 nodes): `ComposerContextHostAdapter.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 75`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 76`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 77`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 78`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 79`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 80`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 81`** (1 nodes): `providerIconTypes.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 82`** (1 nodes): `lobehubIconManifest.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 83`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 84`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 85`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 86`** (1 nodes): `en.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 87`** (1 nodes): `zh.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 88`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 89`** (1 nodes): `three.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `Community 0` to `Community 1`, `Community 2`, `Community 3`, `Community 4`, `Community 5`, `Community 6`, `Community 8`, `Community 9`, `Community 10`, `Community 11`, `Community 12`, `Community 13`, `Community 15`, `Community 16`, `Community 18`, `Community 19`, `Community 20`, `Community 22`, `Community 23`, `Community 24`, `Community 25`, `Community 26`, `Community 27`, `Community 28`, `Community 29`, `Community 30`, `Community 31`, `Community 33`, `Community 35`, `Community 36`, `Community 38`, `Community 39`, `Community 41`, `Community 44`, `Community 45`, `Community 47`, `Community 48`, `Community 49`?**
  _High betweenness centrality (0.415) - this node is a cross-community bridge._
- **Why does `OpenCodianView` connect `Community 1` to `Community 0`, `Community 35`, `Community 5`, `Community 8`, `Community 9`, `Community 10`, `Community 11`, `Community 15`, `Community 16`, `Community 18`, `Community 19`, `Community 21`, `Community 30`, `Community 31`?**
  _High betweenness centrality (0.113) - this node is a cross-community bridge._
- **Why does `OpenCodeService` connect `Community 2` to `Community 0`, `Community 33`, `Community 6`, `Community 7`, `Community 8`, `Community 9`, `Community 11`, `Community 14`, `Community 23`, `Community 24`, `Community 25`, `Community 26`, `Community 29`, `Community 30`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Are the 582 inferred relationships involving `t()` (e.g. with `.getEmptyConversationTitle()` and `.generateDefaultTitle()`) actually correct?**
  _`t()` has 582 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._