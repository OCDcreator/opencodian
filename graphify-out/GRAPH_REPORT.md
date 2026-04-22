# Graph Report - src  (2026-04-22)

## Corpus Check
- Large corpus: 334 files · ~277,146 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 4356 nodes · 9610 edges · 48 communities detected
- Extraction: 74% EXTRACTED · 26% INFERRED · 0% AMBIGUOUS · INFERRED: 2524 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Settings UI|Settings UI]]
- [[_COMMUNITY_Main Chat View|Main Chat View]]
- [[_COMMUNITY_Settings UI 2|Settings UI 2]]
- [[_COMMUNITY_Background Tasks|Background Tasks]]
- [[_COMMUNITY_Localization|Localization]]
- [[_COMMUNITY_OpenCode Service|OpenCode Service]]
- [[_COMMUNITY_Context Usage|Context Usage]]
- [[_COMMUNITY_OpenCode Service 2|OpenCode Service 2]]
- [[_COMMUNITY_OpenCode Service 3|OpenCode Service 3]]
- [[_COMMUNITY_Background Tasks 2|Background Tasks 2]]
- [[_COMMUNITY_Settings UI 3|Settings UI 3]]
- [[_COMMUNITY_Glass Demos|Glass Demos]]
- [[_COMMUNITY_Chat Feature|Chat Feature]]
- [[_COMMUNITY_Provider Icons|Provider Icons]]
- [[_COMMUNITY_Model Configuration|Model Configuration]]
- [[_COMMUNITY_Input Panel Theme|Input Panel Theme]]
- [[_COMMUNITY_Composer Context|Composer Context]]
- [[_COMMUNITY_Chat Feature 2|Chat Feature 2]]
- [[_COMMUNITY_Chat Feature 3|Chat Feature 3]]
- [[_COMMUNITY_Tool Rendering|Tool Rendering]]
- [[_COMMUNITY_Settings UI 4|Settings UI 4]]
- [[_COMMUNITY_Model Configuration 2|Model Configuration 2]]
- [[_COMMUNITY_Question Dock|Question Dock]]
- [[_COMMUNITY_Composer Context 2|Composer Context 2]]
- [[_COMMUNITY_Liquid Glass Demos|Liquid Glass Demos]]
- [[_COMMUNITY_Localization 2|Localization 2]]
- [[_COMMUNITY_Question Todos|Question Todos]]
- [[_COMMUNITY_Settings UI 5|Settings UI 5]]
- [[_COMMUNITY_Glass Demos 2|Glass Demos 2]]
- [[_COMMUNITY_Settings UI 6|Settings UI 6]]
- [[_COMMUNITY_Context Usage 2|Context Usage 2]]
- [[_COMMUNITY_Background Tasks 3|Background Tasks 3]]
- [[_COMMUNITY_Slash Commands|Slash Commands]]
- [[_COMMUNITY_Settings UI 7|Settings UI 7]]
- [[_COMMUNITY_Localization 3|Localization 3]]
- [[_COMMUNITY_Context Usage 3|Context Usage 3]]
- [[_COMMUNITY_Localization 4|Localization 4]]
- [[_COMMUNITY_Chat Feature 4|Chat Feature 4]]
- [[_COMMUNITY_Localization 5|Localization 5]]
- [[_COMMUNITY_Background Tasks 4|Background Tasks 4]]
- [[_COMMUNITY_Background Tasks 5|Background Tasks 5]]
- [[_COMMUNITY_Localization 6|Localization 6]]
- [[_COMMUNITY_Localization 7|Localization 7]]
- [[_COMMUNITY_Localization 8|Localization 8]]
- [[_COMMUNITY_Localization 9|Localization 9]]
- [[_COMMUNITY_Focus Context|Focus Context]]
- [[_COMMUNITY_Composer Context 3|Composer Context 3]]
- [[_COMMUNITY_Localization 10|Localization 10]]

## God Nodes (most connected - your core abstractions)
1. `t()` - 362 edges
2. `OpenCodianView` - 246 edges
3. `OpenCodeService` - 139 edges
4. `OpenCodianPlugin` - 88 edges
5. `ServerManager` - 81 edges
6. `SettingsModelCatalogPresenter` - 54 edges
7. `OpenCodeStreamingRuntimeCoordinator` - 52 edges
8. `OpenCodeCatalogQueryCoordinator` - 50 edges
9. `ConversationTabRuntimeCoordinator` - 45 edges
10. `OpenCodeStreamEventTransformer` - 39 edges

## Surprising Connections (you probably didn't know these)
- `normalizeSessionCommandPath()` --calls--> `normalizeContextPath()`  [INFERRED]
  C:\Users\lt\Desktop\Write\custom-project\opencodian\src\core\opencode\OpenCodeSessionControlOrchestrator.ts → C:\Users\lt\Desktop\Write\custom-project\opencodian\src\shared\contextPath.ts
- `assertModelExtraFieldKeyAllowed()` --calls--> `t()`  [INFERRED]
  C:\Users\lt\Desktop\Write\custom-project\opencodian\src\features\settings\modelConfigWorkspace.ts → C:\Users\lt\Desktop\Write\custom-project\opencodian\src\i18n\index.ts
- `getCommandScopedAgentMetadata()` --calls--> `isRecord()`  [INFERRED]
  C:\Users\lt\Desktop\Write\custom-project\opencodian\src\core\config\commandScopedAgent.ts → C:\Users\lt\Desktop\Write\custom-project\opencodian\src\features\chat\services\ConversationTurnViewModelBuilder.ts
- `mergeConfigObjects()` --calls--> `isRecord()`  [INFERRED]
  C:\Users\lt\Desktop\Write\custom-project\opencodian\src\core\config\commandScopedAgent.ts → C:\Users\lt\Desktop\Write\custom-project\opencodian\src\features\chat\services\ConversationTurnViewModelBuilder.ts
- `assembleServerModelCatalog()` --calls--> `catalogFromRuntimeResult()`  [INFERRED]
  C:\Users\lt\Desktop\Write\custom-project\opencodian\src\core\config\modelConfigAssembly.ts → C:\Users\lt\Desktop\Write\custom-project\opencodian\src\core\config\modelConfigCatalog.ts

## Communities

### Community 0 - "Settings UI"
Cohesion: 0.01
Nodes (45): ConversationSessionSettingsModal, FocusContextEventBridge, t(), LiquidGlassSettingHelpModal, ModelConfigJsonModal, buildModelPickerGroups(), filterModelPickerGroups(), findModelPickerOption() (+37 more)

### Community 1 - "Main Chat View"
Cohesion: 0.01
Nodes (35): applyPassiveScrollMeasurement(), applyUserScrollIntent(), getDistanceFromBottom(), getProgrammaticScrollGuardDelayMs(), hasProgrammaticScrollGuard(), isNearBottom(), createConversationHydrationRuntimeViewHosts(), createConversationSyncHosts() (+27 more)

### Community 2 - "Settings UI 2"
Cohesion: 0.02
Nodes (94): buildChatAppearanceCustomCss(), getChatAppearanceBackgroundSizeValue(), getChatAppearanceCssVariables(), getInputPanelGlassRefractionCssVariables(), areChatAppearanceSettingsEqual(), diffObject(), getBuiltinThemePresets(), getThemeAppearanceOverridesFromBase() (+86 more)

### Community 3 - "Background Tasks"
Cohesion: 0.02
Nodes (28): BackgroundTaskCompletionNoticeService, BackgroundTaskIndicatorCoordinator, BackgroundTaskInlinePanelRenderer, BackgroundTaskLiveSignalCoordinator, createBackgroundTaskLiveSignalCoordinatorHost(), BackgroundTaskNoticeStateService, BackgroundTaskStreamTriggerCoordinator, BackgroundTaskTimelineService (+20 more)

### Community 4 - "Localization"
Cohesion: 0.02
Nodes (40): createSdkClient(), extractRenderableToolMetadata(), OpenCodeMessageNormalizationMapper, OpenCodeToolContentAssembler, resolveOpenCodeToolKind(), resolveToolResultVisibility(), extractRenderableToolMetadata(), extractStructuredErrorMessage() (+32 more)

### Community 5 - "OpenCode Service"
Cohesion: 0.03
Nodes (13): OpenCodeEventSubscriptionCoordinator, cloneSettings(), OpenCodeServiceLifecycleCoordinator, normalizeDiffEntries(), normalizeMessageInfo(), normalizePart(), OpenCodeSyncEventRuntimeCoordinator, resolveSessionId() (+5 more)

### Community 6 - "Context Usage"
Cohesion: 0.02
Nodes (14): createEmptyTabContextState(), ConversationHistoryActionsCoordinator, ConversationHistoryDialogService, ConversationLoadRecoveryCoordinator, ConversationTabLifecycleRecoveryCoordinator, ConversationTabOpenCoordinator, ConversationTabRuntimeCoordinator, ConversationTransitionBridge (+6 more)

### Community 7 - "OpenCode Service 2"
Cohesion: 0.02
Nodes (9): OpenCodePromptRequestBuilder, buildCanonicalConversationFingerprintPayload(), getDebugTextPreview(), isPlainRecord(), OpenCodeService, cloneMessage(), clonePart(), cloneState() (+1 more)

### Community 8 - "OpenCode Service 3"
Cohesion: 0.02
Nodes (17): OpenCodeCatalogQueryCoordinator, OpenCodeCatalogStateStore, OpenCodeQuestionPermissionHub, appendSdkErrorStatus(), describeSdkError(), extractSdkErrorMessage(), getSdkErrorRecordBaseMessage(), getSdkErrorRecordStatusCode() (+9 more)

### Community 9 - "Background Tasks 2"
Cohesion: 0.02
Nodes (59): ConversationHydrationOutcomeBridge, ConversationHydrationRenderBridge, ConversationAssistantMessageRenderDelegate, ConversationMessageRenderDelegate, ConversationSyncedUpdateApplyDelegate, ConversationUserMessageRenderDelegate, getIncrementalRenderedMessageUpdate(), ConversationRenderService (+51 more)

### Community 10 - "Settings UI 3"
Cohesion: 0.03
Nodes (32): ConversationTurnViewModelBuilder, getMessageParentId(), getRecordString(), isRecord(), OpencodeConfigManager, PluginManagementService, buildObjectReplacementPatch(), buildProjectAgentOptionsPatch() (+24 more)

### Community 11 - "Glass Demos"
Cohesion: 0.03
Nodes (26): buildConversationMetaFromStoredRecord(), cloneConversationListDiagnostics(), ConversationMetadataCache, getUtf8ByteLength(), trackTopDiagnosticEntries(), clamp(), createStageLayerElement(), createSvgElement() (+18 more)

### Community 12 - "Chat Feature"
Cohesion: 0.03
Nodes (24): buildStreamErrorNotice(), buildLocalStreamOutcome(), normalizeConversationSessionSettings(), ConversationAuthoritativeMessageMergeCoordinator, ConversationAuthoritativeReloadCoordinator, findLatestInterruptedNotice(), findLatestUserBeforeTimestamp(), isInterruptedNoticeMessage() (+16 more)

### Community 13 - "Provider Icons"
Cohesion: 0.04
Nodes (74): buildLobehubDefinitions(), buildOpencodeDefinitions(), computeMatchScore(), createDefinition(), findBuiltinIcon(), formatBuiltinSource(), getBuiltinIcon(), getDisplayName() (+66 more)

### Community 14 - "Model Configuration"
Cohesion: 0.04
Nodes (36): ModelConfigModal, createModelConfigKeyValueState(), createModelConfigModalSnapshot(), isBlankProviderState(), parseAddProviderJsonDraft(), readProviderOptionString(), resolveModelConfigJsonDraftValue(), syncProviderFormFromJsonDraft() (+28 more)

### Community 15 - "Input Panel Theme"
Cohesion: 0.04
Nodes (78): InputPanelAppearanceCoordinator, createComposerGlassFilterElement(), createSvgElement(), ensureComposerGlassSvgDefs(), ensureComposerGlassSvgRootElement(), InputPanelThemeRuntime, measureDisplacementRangeAtUv(), add3() (+70 more)

### Community 16 - "Composer Context"
Cohesion: 0.03
Nodes (22): buildComposerContextChipStates(), createFocusContextPreview(), getContextTargetKey(), getPromptContextTargetKey(), removeDraftContextItemsByTarget(), resolveFocusContextPreview(), upsertDraftContextItem(), ComposerContextActionService (+14 more)

### Community 17 - "Chat Feature 2"
Cohesion: 0.04
Nodes (42): ContextAttachmentBuilder, ContextFileCatalogBuildRunner, ContextFileCatalogIndex, createContextFileEntry(), ContextFileCatalogService, contextPathFromFileUrl(), isAbsoluteContextPath(), isWindowsDrivePath() (+34 more)

### Community 18 - "Chat Feature 3"
Cohesion: 0.04
Nodes (19): ActiveTabContextUsageCoordinator, BackgroundTaskActivationIndicatorCoordinator, ChatSelectionControlsCoordinator, getPerformanceTimestampMs(), findCatalogModel(), findCatalogProvider(), pickCatalogDefaultModel(), pickCatalogProviderDefaultModel() (+11 more)

### Community 19 - "Tool Rendering"
Cohesion: 0.04
Nodes (19): AssistantNoticeCardRenderer, renderAssistantPlainTextFallbackContent(), renderAssistantStructuredContent(), buildQuestionResolutionCardRenderPlan(), StreamController, formatDurationSeconds(), normalizeDurationSeconds(), ThinkingBlockRenderer (+11 more)

### Community 20 - "Settings UI 4"
Cohesion: 0.04
Nodes (5): OpenCodianSettingTab, SettingsPluginSection, SettingsSectionCoordinator, SettingsStyleControls, SettingsUiSection

### Community 21 - "Model Configuration 2"
Cohesion: 0.05
Nodes (41): ModelCatalogStateService, assembleModelCatalog(), assembleServerModelCatalog(), filterCatalogToProviderIds(), projectEffectiveCatalog(), resolveProviderAvailabilityProbePlan(), selectProviderProbeModelId(), filterCatalog() (+33 more)

### Community 22 - "Question Dock"
Cohesion: 0.04
Nodes (23): QuestionDockCoordinator, applyQuestionDockSelection(), getQuestionDockActiveInteractionState(), getQuestionDockDraftAnswers(), sanitizeQuestionDockAnswer(), selectQuestionDockGroup(), selectQuestionDockQuestion(), setQuestionDockDraftAnswer() (+15 more)

### Community 23 - "Composer Context 2"
Cohesion: 0.04
Nodes (15): ChatHeaderPresenter, ComposerContextViewFacade, createComposerContextServices(), ComposerContextViewHostAdapter, buildComposerInputSubmission(), ComposerInputShellCoordinator, parseCommandSubmission(), createFocusContextServices() (+7 more)

### Community 24 - "Liquid Glass Demos"
Cohesion: 0.05
Nodes (48): applyDisplacementSnapshot(), applyHostTransform(), buildBackdropFilterValue(), buildFallbackBackdropFilterValue(), clamp(), createFaceSvgElement(), createStageLayerElement(), createState() (+40 more)

### Community 25 - "Localization 2"
Cohesion: 0.05
Nodes (18): extractAssistantStructuredTextCopyContent(), resolveAssistantCopyContent(), AssistantErrorRenderer, buildErrorAssistantFooterPayload(), buildNoticeAssistantFooterPayload(), buildPersistedAssistantFooterPayload(), buildPseudoStreamAssistantFooterPayload(), resolvePersistedAssistantFooterStatusLabel() (+10 more)

### Community 26 - "Question Todos"
Cohesion: 0.05
Nodes (10): BackgroundConversationAttentionCoordinator, BackgroundConversationPostSyncHandoffCoordinator, BackgroundConversationPostSyncRefreshExecutor, BackgroundConversationSignalSyncStateCoordinator, ConversationLoadRuntimeBridge, ConversationSyncBackgroundPostSyncRouter, PostSyncQuestionTodoRefreshFacade, PostSyncQuestionTodoRefreshPlanBuilder (+2 more)

### Community 27 - "Settings UI 5"
Cohesion: 0.08
Nodes (45): registerBuiltinGlassAdapters(), getAllGlassAdapters(), getGlassAdapter(), registerGlassAdapter(), unregisterGlassAdapter(), applyFilterLayerStyles(), applyShellStyles(), buildBackdropFilterValue() (+37 more)

### Community 28 - "Glass Demos 2"
Cohesion: 0.11
Nodes (49): add3(), buildClipPath(), buildDisplacementTrace(), buildGlassOctahedronBackdropFilterValue(), buildGlassOctahedronLightBackdropFilterValue(), clamp(), computeBounds(), convexHull() (+41 more)

### Community 29 - "Settings UI 6"
Cohesion: 0.11
Nodes (48): applyBackdropFilterValue(), applyGlassTint(), applyInstanceMarker(), applyShellInteractiveStyles(), buildFallbackBackdropFilterValue(), buildSvgBackdropFilterValue(), clamp(), cleanupInstanceArtifacts() (+40 more)

### Community 30 - "Context Usage 2"
Cohesion: 0.07
Nodes (6): ContextDetailModal, ContextRing, ContextUsageService, getLocale(), setLocale(), getDefaultContextWindow()

### Community 31 - "Background Tasks 3"
Cohesion: 0.09
Nodes (2): BackgroundTaskTimelineAssemblyService, BackgroundTaskTimelineLaunchService

### Community 32 - "Slash Commands"
Cohesion: 0.13
Nodes (31): buildCommandScopedAgent(), cloneConfigObject(), cloneConfigValue(), getCommandScopedAgentId(), getCommandScopedAgentMetadata(), isCommandScopedAgentForCommand(), isCommandScopedAgentId(), mergeConfigObjects() (+23 more)

### Community 33 - "Settings UI 7"
Cohesion: 0.13
Nodes (26): getDefaultDebugModuleSettings(), isDebugModuleKey(), normalizeDebugModuleSettings(), normalizeDebugRefreshIntervalMs(), resolveDebugModuleKey(), createLogger(), createLoggerCall(), emit() (+18 more)

### Community 34 - "Localization 3"
Cohesion: 0.11
Nodes (16): buildFragmentWithLinks(), createWikilinkElement(), createWikilinkPattern(), extractLinkTarget(), fileExistsInVault(), findWikilinks(), processFileLinks(), processTextNode() (+8 more)

### Community 35 - "Context Usage 3"
Cohesion: 0.14
Nodes (1): ContextUsageDisplayService

### Community 36 - "Localization 4"
Cohesion: 0.15
Nodes (22): assertByteLength(), buildCustomCacheFileName(), createCachedCustomEntry(), createEntryId(), detectIconMimeType(), getMimeTypeFromHeader(), getMimeTypeFromPath(), getMimeTypeFromSignature() (+14 more)

### Community 37 - "Chat Feature 4"
Cohesion: 0.14
Nodes (3): EffortSelector, isAdaptiveThinkingModel(), UserMessageFooterRenderer

### Community 38 - "Localization 5"
Cohesion: 0.19
Nodes (20): buildTrailingAssistantPatchCompletionDebugPlan(), buildTrailingAssistantPatchCompletionDebugPlanFromTailOutcomePlanningContext(), buildTrailingAssistantPatchCompletionDebugPlanningContext(), buildTrailingAssistantPatchCompletionDebugPlanningContextInputs(), buildTrailingAssistantPatchCompletionDebugPlanningContextShape(), buildTrailingAssistantPatchCompletionDebugPlanningContextSourceContract(), buildTrailingAssistantPatchCompletionDebugSourceContractFromTailOutcomePlanningContext(), buildTrailingAssistantPatchCompletionDebugSummaryPlan() (+12 more)

### Community 39 - "Background Tasks 4"
Cohesion: 0.15
Nodes (13): createBackgroundConversationPostSyncHandoffServices(), createBackgroundConversationPostSyncHandoffViewHostAdapter(), createPostSyncQuestionTodoRefreshHosts(), createPostSyncQuestionTodoRefreshServices(), createQuestionTodoBackgroundTaskActivationHosts(), createQuestionTodoBackgroundTaskActivationServices(), createQuestionTodoBackgroundTaskActivationViewHostAdapter(), createQuestionTodoBackgroundTaskRefreshServices() (+5 more)

### Community 40 - "Background Tasks 5"
Cohesion: 0.26
Nodes (1): TabBar

### Community 41 - "Localization 6"
Cohesion: 0.2
Nodes (6): buildModelOptionValue(), parseModelOptionValue(), scrollToCurrentModel(), selectHighlightedModel(), renderModelList(), bindModelSelectorStickyHeaders()

### Community 42 - "Localization 7"
Cohesion: 0.29
Nodes (1): ModelPickerModal

### Community 43 - "Localization 8"
Cohesion: 0.44
Nodes (8): formatMcpSummaryField(), getFirstScalarMcpFallback(), getMcpSummaryFromFields(), getMcpToolSummary(), getPathTail(), resolveMcpSummaryCategory(), tokenizeMcpToolName(), truncateMcpSummaryText()

### Community 44 - "Localization 9"
Cohesion: 0.39
Nodes (1): ServerSettingHelpModal

### Community 45 - "Focus Context"
Cohesion: 0.4
Nodes (1): FocusContextMarkdownViewLocator

### Community 46 - "Composer Context 3"
Cohesion: 0.4
Nodes (1): ComposerContextEventBridge

### Community 47 - "Localization 10"
Cohesion: 0.4
Nodes (1): ContextFileCatalogEventBridge

## Knowledge Gaps
- **Thin community `Background Tasks 3`** (42 nodes): `BackgroundTaskTimelineAssemblyService`, `.addCompletionToSegment()`, `.applyReminderToSegment()`, `.captureUserSegmentAnchor()`, `.collectCompletionReminderSegments()`, `.collectDiagnostics()`, `.collectMessageSegments()`, `.collectSegments()`, `.collectTaskLaunchBlock()`, `.constructor()`, `.createEmptySegment()`, `.createSegment()`, `.createSegmentCollectionState()`, `.finalizeCollectedSegments()`, `.finalizeSegment()`, `.findBackgroundTaskAnchorIndex()`, `.findSegmentByTaskId()`, `.getLatestSearchModeSegment()`, `.getLatestSegmentWithActivity()`, `.getOrCreateRuntimeSegment()`, `.getOrCreateSegment()`, `.getPendingLaunches()`, `.isBackgroundTaskCompletionReminder()`, `.isSearchModeAnchorMessage()`, `.mergeRuntimeSegmentState()`, `.mergeSegmentCompletions()`, `.mergeSegmentLaunches()`, `.resolvePendingState()`, `.resolveReminderSegments()`, `.segmentHasTaskActivity()`, `.upsertLaunch()`, `.upsertSegmentLaunch()`, `BackgroundTaskTimelineLaunchService`, `.addCompletedTasksFromMessage()`, `.extractBackgroundTaskId()`, `.filterPendingLaunches()`, `.getBackgroundTaskDescription()`, `.isLaunchMatchedByCompletion()`, `.upsertLaunch()`, `BackgroundTaskTimelineAssemblyService.ts`, `BackgroundTaskTimelineLaunchService.ts`, `.getMessageAnchorKey()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Context Usage 3`** (28 nodes): `ContextUsageDisplayService`, `.buildBreakdownSegments()`, `.buildDisplayTokenBreakdown()`, `.calculatePercentage()`, `.collectBreakdownChars()`, `.estimateBreakdownTokens()`, `.estimateTokens()`, `.fitBreakdownTokens()`, `.formatCurrency()`, `.formatNumber()`, `.formatPercent()`, `.getAssistantCharsFromMessage()`, `.getAssistantCharsFromPart()`, `.getContextBreakdown()`, `.getDisplaySnapshot()`, `.getDisplayTokenBreakdown()`, `.getNestedStringField()`, `.getObjectField()`, `.getParts()`, `.getStringField()`, `.getToolChars()`, `.getUnknownField()`, `.getUserCharsFromMessage()`, `.getUserCharsFromPart()`, `.isRecord()`, `.stringifyUnknown()`, `.summarize()`, `ContextUsageDisplayService.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Background Tasks 5`** (15 nodes): `TabBar.ts`, `TabBar`, `.attachTooltipLabel()`, `.closeOverflowMenu()`, `.constructor()`, `.destroy()`, `.getMaxVisibleTabs()`, `.openOverflowMenu()`, `.partitionItems()`, `.positionOverflowMenu()`, `.render()`, `.renderBackgroundTaskState()`, `.renderOverflowButton()`, `.renderTabItem()`, `.shouldOpenOverflowAbove()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Localization 7`** (12 nodes): `ModelPickerModal.ts`, `ModelPickerModal`, `.choose()`, `.constructor()`, `.getFilteredGroups()`, `.getOptionValues()`, `.navigate()`, `.onOpen()`, `.renderList()`, `.renderOption()`, `.selectHighlighted()`, `.syncHighlight()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Localization 9`** (8 nodes): `ServerSettingHelpModal.ts`, `ServerSettingHelpModal`, `.constructor()`, `.escapeHtml()`, `.getHelpContent()`, `.onClose()`, `.onOpen()`, `.tr()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Focus Context`** (6 nodes): `FocusContextMarkdownViewLocator.ts`, `FocusContextMarkdownViewLocator`, `.constructor()`, `.getActiveMarkdownView()`, `.getMarkdownViews()`, `.rememberMarkdownFilePath()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Composer Context 3`** (5 nodes): `ComposerContextEventBridge`, `.constructor()`, `.dispose()`, `.start()`, `ComposerContextEventBridge.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Localization 10`** (5 nodes): `ContextFileCatalogEventBridge`, `.constructor()`, `.dispose()`, `.start()`, `ContextFileCatalogEventBridge.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `Settings UI` to `Main Chat View`, `Settings UI 2`, `Background Tasks`, `Context Usage`, `OpenCode Service 3`, `Background Tasks 2`, `Settings UI 3`, `Chat Feature`, `Provider Icons`, `Model Configuration`, `Composer Context`, `Chat Feature 2`, `Chat Feature 3`, `Tool Rendering`, `Settings UI 4`, `Model Configuration 2`, `Question Dock`, `Composer Context 2`, `Liquid Glass Demos`, `Localization 2`, `Context Usage 2`, `Background Tasks 3`, `Context Usage 3`, `Chat Feature 4`, `Background Tasks 5`, `Localization 7`, `Localization 9`?**
  _High betweenness centrality (0.419) - this node is a cross-community bridge._
- **Why does `OpenCodianView` connect `Main Chat View` to `Settings UI`, `Settings UI 2`, `Background Tasks`, `Localization`, `Chat Feature 4`, `Context Usage`, `Background Tasks 2`, `Glass Demos`, `Chat Feature`, `Input Panel Theme`, `Composer Context`, `Tool Rendering`, `Composer Context 2`, `Localization 2`, `Background Tasks 3`?**
  _High betweenness centrality (0.155) - this node is a cross-community bridge._
- **Why does `OpenCodeService` connect `OpenCode Service 2` to `Settings UI`, `Localization`, `OpenCode Service`, `OpenCode Service 3`, `Settings UI 3`, `Model Configuration 2`, `Question Dock`, `Settings UI 5`?**
  _High betweenness centrality (0.076) - this node is a cross-community bridge._
- **Are the 361 inferred relationships involving `t()` (e.g. with `.getEmptyConversationTitle()` and `.generateDefaultTitle()`) actually correct?**
  _`t()` has 361 INFERRED edges - model-reasoned connections that need verification._
- **Should `Settings UI` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Main Chat View` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Settings UI 2` be split into smaller, more focused modules?**
  _Cohesion score 0.02 - nodes in this community are weakly interconnected._