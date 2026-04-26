# Graph Report - src  (2026-04-26)

## Corpus Check
- 352 files · ~300,019 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 4646 nodes · 10331 edges · 46 communities detected
- Extraction: 74% EXTRACTED · 26% INFERRED · 0% AMBIGUOUS · INFERRED: 2709 edges (avg confidence: 0.8)
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

## God Nodes (most connected - your core abstractions)
1. `t()` - 431 edges
2. `OpenCodianView` - 252 edges
3. `OpenCodeService` - 146 edges
4. `OpenCodianPlugin` - 88 edges
5. `ServerManager` - 81 edges
6. `SettingsModelCatalogPresenter` - 57 edges
7. `OpenCodeStreamingRuntimeCoordinator` - 52 edges
8. `OpenCodeCatalogQueryCoordinator` - 50 edges
9. `OpencodeConfigManager` - 45 edges
10. `ConversationTabRuntimeCoordinator` - 45 edges

## Surprising Connections (you probably didn't know these)
- `normalizeSessionCommandPath()` --calls--> `normalizeContextPath()`  [INFERRED]
  src\core\opencode\OpenCodeSessionControlOrchestrator.ts → src\shared\contextPath.ts
- `assertModelExtraFieldKeyAllowed()` --calls--> `t()`  [INFERRED]
  src\features\settings\modelConfigWorkspace.ts → src\i18n\index.ts
- `getCommandScopedAgentMetadata()` --calls--> `isRecord()`  [INFERRED]
  src\core\config\commandScopedAgent.ts → src\features\chat\services\ConversationTurnViewModelBuilder.ts
- `mergeConfigObjects()` --calls--> `isRecord()`  [INFERRED]
  src\core\config\commandScopedAgent.ts → src\features\chat\services\ConversationTurnViewModelBuilder.ts
- `assembleServerModelCatalog()` --calls--> `catalogFromRuntimeResult()`  [INFERRED]
  src\core\config\modelConfigAssembly.ts → src\core\config\modelConfigCatalog.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.01
Nodes (73): AgentInvocationService, buildStreamErrorNotice(), renderAssistantNoticeCardAndFooter(), renderAssistantPlaceholderAsNotice(), renderPersistedAssistantNotice(), renderAssistantPlainTextFallbackContent(), AssistantShellRenderer, AssistantShellViewHostAdapter (+65 more)

### Community 1 - "Community 1"
Cohesion: 0.01
Nodes (52): AssistantNoticeCardRenderer, buildInterruptedAssistantNotice(), ConversationCompactionHelpModal, t(), LiquidGlassSettingHelpModal, isProviderEnabled(), ModelConfigJsonModal, ProviderBuiltinIconPickerModal (+44 more)

### Community 2 - "Community 2"
Cohesion: 0.01
Nodes (29): ActiveTabContextUsageCoordinator, BackgroundTaskActivationIndicatorCoordinator, createEmptyTabContextState(), ContextDetailModal, ContextRing, ContextUsageService, ConversationHistoryActionsCoordinator, ConversationHistoryDialogService (+21 more)

### Community 3 - "Community 3"
Cohesion: 0.02
Nodes (51): createSdkClient(), extractRenderableToolMetadata(), OpenCodeMessageNormalizationMapper, OpenCodeToolContentAssembler, resolveOpenCodeToolKind(), resolveToolResultVisibility(), extractRenderableToolMetadata(), extractStructuredErrorMessage() (+43 more)

### Community 4 - "Community 4"
Cohesion: 0.02
Nodes (24): BackgroundTaskCompletionNoticeService, BackgroundTaskIndicatorCoordinator, BackgroundTaskInlinePanelRenderer, BackgroundTaskLiveSignalCoordinator, createBackgroundTaskLiveSignalCoordinatorHost(), BackgroundTaskNoticeStateService, BackgroundTaskStreamTriggerCoordinator, BackgroundTaskTimelineService (+16 more)

### Community 5 - "Community 5"
Cohesion: 0.02
Nodes (113): getDefaultDebugModuleSettings(), isDebugModuleKey(), normalizeDebugModuleSettings(), normalizeDebugRefreshIntervalMs(), resolveDebugModuleKey(), areChatAppearanceSettingsEqual(), diffObject(), getBuiltinThemePresets() (+105 more)

### Community 6 - "Community 6"
Cohesion: 0.02
Nodes (18): OpenCodePromptRequestBuilder, buildCanonicalConversationFingerprintPayload(), cloneSettings(), getDebugTextPreview(), isPlainRecord(), OpenCodeService, cloneMessage(), clonePart() (+10 more)

### Community 7 - "Community 7"
Cohesion: 0.03
Nodes (13): OpenCodeEventSubscriptionCoordinator, cloneSettings(), OpenCodeServiceLifecycleCoordinator, normalizeDiffEntries(), normalizeMessageInfo(), normalizePart(), OpenCodeSyncEventRuntimeCoordinator, resolveSessionId() (+5 more)

### Community 8 - "Community 8"
Cohesion: 0.02
Nodes (20): OpenCodeCatalogQueryCoordinator, OpenCodeCatalogStateStore, normalizePermissionRequest(), normalizePermissionResponse(), normalizePermissionToolReference(), normalizeStringArray(), OpenCodeQuestionPermissionHub, appendSdkErrorStatus() (+12 more)

### Community 9 - "Community 9"
Cohesion: 0.03
Nodes (96): buildLobehubDefinitions(), buildOpencodeDefinitions(), computeMatchScore(), createDefinition(), findBuiltinIcon(), formatBuiltinSource(), getBuiltinIcon(), getDisplayName() (+88 more)

### Community 10 - "Community 10"
Cohesion: 0.03
Nodes (31): ConversationTurnViewModelBuilder, getMessageParentId(), getRecordString(), isRecord(), cloneFormatterConfigValue(), readFormatterConfigValue(), writeFormatterConfigValue(), parseOpencodeConfigText() (+23 more)

### Community 11 - "Community 11"
Cohesion: 0.03
Nodes (119): applyDisplacementSnapshot(), applyHostTransform(), buildBackdropFilterValue(), buildFallbackBackdropFilterValue(), clamp(), createFaceSvgElement(), createStageLayerElement(), createState() (+111 more)

### Community 12 - "Community 12"
Cohesion: 0.03
Nodes (37): ConversationSessionSettingsModal, ModelConfigModal, createModelConfigKeyValueState(), createModelConfigModalSnapshot(), isBlankProviderState(), parseAddProviderJsonDraft(), readProviderOptionString(), resolveModelConfigJsonDraftValue() (+29 more)

### Community 13 - "Community 13"
Cohesion: 0.03
Nodes (23): buildComposerContextChipStates(), createFocusContextPreview(), getContextTargetKey(), getPromptContextTargetKey(), removeDraftContextItemsByTarget(), resolveFocusContextPreview(), upsertDraftContextItem(), ComposerContextActionService (+15 more)

### Community 14 - "Community 14"
Cohesion: 0.03
Nodes (22): normalizeConversationSessionSettings(), buildChatAppearanceCustomCss(), getChatAppearanceBackgroundSizeValue(), getChatAppearanceCssVariables(), getInputPanelGlassRefractionCssVariables(), buildConversationMetaFromStoredRecord(), cloneConversationListDiagnostics(), ConversationMetadataCache (+14 more)

### Community 15 - "Community 15"
Cohesion: 0.03
Nodes (55): ConversationAssistantMessageRenderDelegate, ConversationMessageRenderDelegate, ConversationSyncedUpdateApplyDelegate, ConversationUserMessageRenderDelegate, getIncrementalRenderedMessageUpdate(), ConversationRenderService, TrailingAssistantPatchPlanningDelegate, buildMessageRenderGroups() (+47 more)

### Community 16 - "Community 16"
Cohesion: 0.04
Nodes (42): ContextAttachmentBuilder, ContextFileCatalogBuildRunner, ContextFileCatalogIndex, createContextFileEntry(), ContextFileCatalogService, contextPathFromFileUrl(), isAbsoluteContextPath(), isWindowsDrivePath() (+34 more)

### Community 17 - "Community 17"
Cohesion: 0.04
Nodes (21): registerBuiltinGlassAdapters(), ChatHeaderPresenter, buildComposerInputSubmission(), ComposerInputShellCoordinator, parseCommandSubmission(), InputPanelAppearanceCoordinator, createComposerGlassFilterElement(), createSvgElement() (+13 more)

### Community 18 - "Community 18"
Cohesion: 0.03
Nodes (25): QuestionDockCoordinator, applyQuestionDockSelection(), getQuestionDockActiveInteractionState(), getQuestionDockDraftAnswers(), sanitizeQuestionDockAnswer(), selectQuestionDockGroup(), selectQuestionDockQuestion(), setQuestionDockDraftAnswer() (+17 more)

### Community 19 - "Community 19"
Cohesion: 0.04
Nodes (8): getInputPanelThemeFamily(), getLiquidGlassAdapterIdForInputPanelTheme(), addSettingHelpButton(), SettingsStyleBackgroundSection, SettingsStyleControls, SettingsStyleInputPanelSection, SettingsStyleLiquidGlassInputControls, SettingsStyleSection

### Community 20 - "Community 20"
Cohesion: 0.05
Nodes (61): clamp(), createStageLayerElement(), createSvgElement(), estimateProjectionDelta(), formatNumber(), generateFilterId(), GlassOctahedronDemoController, maxRenderQuality() (+53 more)

### Community 21 - "Community 21"
Cohesion: 0.05
Nodes (46): ModelCatalogStateService, assembleModelCatalog(), assembleServerModelCatalog(), filterCatalogToProviderIds(), projectEffectiveCatalog(), resolveProviderAvailabilityProbePlan(), selectProviderProbeModelId(), filterCatalog() (+38 more)

### Community 22 - "Community 22"
Cohesion: 0.05
Nodes (10): OpenCodianSettingTab, getActiveSecondaryTabId(), getPrimaryTabDefinition(), resolvePrimaryTabId(), resolveSecondaryTabId(), SettingsSectionCoordinator, SettingsTabbedRenderer, renderUserExcludedTagsSetting() (+2 more)

### Community 23 - "Community 23"
Cohesion: 0.05
Nodes (4): ChatSelectionControlsCoordinator, buildModelSelectorDisplayState(), PermissionModeSelectorCoordinator, ProjectConfigFileWatcher

### Community 24 - "Community 24"
Cohesion: 0.05
Nodes (6): AgentCatalogService, SurfaceAgentBuilder, MarkdownAgentWorkspaceService, SettingsAgentsSection, SystemAgentGuardService, isSystemAgentId()

### Community 25 - "Community 25"
Cohesion: 0.07
Nodes (6): PendingIndicatorController, PermissionInlineCardRenderer, hasVisibleStreamingContent(), SendPipelineTrace, StreamChunkRouter, StreamingInlineCardRenderer

### Community 26 - "Community 26"
Cohesion: 0.07
Nodes (6): buildModelPickerGroups(), filterModelPickerGroups(), findModelPickerOption(), findModelPickerOptionByRef(), ModelPickerModal, SettingsConversationSection

### Community 27 - "Community 27"
Cohesion: 0.11
Nodes (48): applyBackdropFilterValue(), applyGlassTint(), applyInstanceMarker(), applyShellInteractiveStyles(), buildFallbackBackdropFilterValue(), buildSvgBackdropFilterValue(), clamp(), cleanupInstanceArtifacts() (+40 more)

### Community 28 - "Community 28"
Cohesion: 0.05
Nodes (9): BackgroundConversationAttentionCoordinator, BackgroundConversationPostSyncHandoffCoordinator, BackgroundConversationPostSyncRefreshExecutor, ConversationSyncBackgroundPostSyncRouter, ConversationSyncVisiblePostSyncRouter, PostSyncQuestionTodoRefreshFacade, PostSyncQuestionTodoRefreshPlanBuilder, VisibleConversationPostSyncCoordinator (+1 more)

### Community 29 - "Community 29"
Cohesion: 0.09
Nodes (2): BackgroundTaskTimelineAssemblyService, BackgroundTaskTimelineLaunchService

### Community 30 - "Community 30"
Cohesion: 0.11
Nodes (40): applyFilterLayerStyles(), applyShellStyles(), buildBackdropFilterValue(), buildEdgeBandWeight(), buildFallbackBackdropFilterValue(), buildFilterLayerBoxShadow(), captureDatasetSnapshot(), captureStyleSnapshot() (+32 more)

### Community 31 - "Community 31"
Cohesion: 0.13
Nodes (31): buildCommandScopedAgent(), cloneConfigObject(), cloneConfigValue(), getCommandScopedAgentId(), getCommandScopedAgentMetadata(), isCommandScopedAgentForCommand(), isCommandScopedAgentId(), mergeConfigObjects() (+23 more)

### Community 32 - "Community 32"
Cohesion: 0.09
Nodes (11): extractAssistantStructuredTextCopyContent(), resolveAssistantCopyContent(), AssistantErrorRenderer, buildErrorAssistantFooterPayload(), buildNoticeAssistantFooterPayload(), buildPersistedAssistantFooterPayload(), buildPseudoStreamAssistantFooterPayload(), resolvePersistedAssistantFooterStatusLabel() (+3 more)

### Community 33 - "Community 33"
Cohesion: 0.11
Nodes (16): buildFragmentWithLinks(), createWikilinkElement(), createWikilinkPattern(), extractLinkTarget(), fileExistsInVault(), findWikilinks(), processFileLinks(), processTextNode() (+8 more)

### Community 34 - "Community 34"
Cohesion: 0.14
Nodes (1): ContextUsageDisplayService

### Community 35 - "Community 35"
Cohesion: 0.09
Nodes (5): ComposerContextViewFacade, createComposerContextServices(), ComposerContextViewHostAdapter, createFocusContextServices(), FocusContextViewHostAdapter

### Community 36 - "Community 36"
Cohesion: 0.19
Nodes (20): buildTrailingAssistantPatchCompletionDebugPlan(), buildTrailingAssistantPatchCompletionDebugPlanFromTailOutcomePlanningContext(), buildTrailingAssistantPatchCompletionDebugPlanningContext(), buildTrailingAssistantPatchCompletionDebugPlanningContextInputs(), buildTrailingAssistantPatchCompletionDebugPlanningContextShape(), buildTrailingAssistantPatchCompletionDebugPlanningContextSourceContract(), buildTrailingAssistantPatchCompletionDebugSourceContractFromTailOutcomePlanningContext(), buildTrailingAssistantPatchCompletionDebugSummaryPlan() (+12 more)

### Community 37 - "Community 37"
Cohesion: 0.15
Nodes (13): createBackgroundConversationPostSyncHandoffServices(), createBackgroundConversationPostSyncHandoffViewHostAdapter(), createPostSyncQuestionTodoRefreshHosts(), createPostSyncQuestionTodoRefreshServices(), createQuestionTodoBackgroundTaskActivationHosts(), createQuestionTodoBackgroundTaskActivationServices(), createQuestionTodoBackgroundTaskActivationViewHostAdapter(), createQuestionTodoBackgroundTaskRefreshServices() (+5 more)

### Community 38 - "Community 38"
Cohesion: 0.28
Nodes (1): ChildSessionGraphService

### Community 39 - "Community 39"
Cohesion: 0.26
Nodes (1): TabBar

### Community 40 - "Community 40"
Cohesion: 0.2
Nodes (6): buildModelOptionValue(), parseModelOptionValue(), scrollToCurrentModel(), selectHighlightedModel(), renderModelList(), bindModelSelectorStickyHeaders()

### Community 41 - "Community 41"
Cohesion: 0.44
Nodes (8): formatMcpSummaryField(), getFirstScalarMcpFallback(), getMcpSummaryFromFields(), getMcpToolSummary(), getPathTail(), resolveMcpSummaryCategory(), tokenizeMcpToolName(), truncateMcpSummaryText()

### Community 42 - "Community 42"
Cohesion: 0.47
Nodes (4): buildCodeFence(), prepareUserMessageMarkdownForDisplay(), replaceOutsideMarkdownCode(), trimFenceContent()

### Community 43 - "Community 43"
Cohesion: 0.4
Nodes (1): FocusContextMarkdownViewLocator

### Community 44 - "Community 44"
Cohesion: 0.4
Nodes (1): ComposerContextEventBridge

### Community 45 - "Community 45"
Cohesion: 0.4
Nodes (1): ContextFileCatalogEventBridge

## Knowledge Gaps
- **Thin community `Community 29`** (42 nodes): `BackgroundTaskTimelineAssemblyService`, `.addCompletionToSegment()`, `.applyReminderToSegment()`, `.captureUserSegmentAnchor()`, `.collectCompletionReminderSegments()`, `.collectDiagnostics()`, `.collectMessageSegments()`, `.collectSegments()`, `.collectTaskLaunchBlock()`, `.constructor()`, `.createEmptySegment()`, `.createSegment()`, `.createSegmentCollectionState()`, `.finalizeCollectedSegments()`, `.finalizeSegment()`, `.findBackgroundTaskAnchorIndex()`, `.findSegmentByTaskId()`, `.getLatestSearchModeSegment()`, `.getLatestSegmentWithActivity()`, `.getOrCreateRuntimeSegment()`, `.getOrCreateSegment()`, `.getPendingLaunches()`, `.isBackgroundTaskCompletionReminder()`, `.isSearchModeAnchorMessage()`, `.mergeRuntimeSegmentState()`, `.mergeSegmentCompletions()`, `.mergeSegmentLaunches()`, `.resolvePendingState()`, `.resolveReminderSegments()`, `.segmentHasTaskActivity()`, `.upsertLaunch()`, `.upsertSegmentLaunch()`, `BackgroundTaskTimelineLaunchService`, `.addCompletedTasksFromMessage()`, `.extractBackgroundTaskId()`, `.filterPendingLaunches()`, `.getBackgroundTaskDescription()`, `.isLaunchMatchedByCompletion()`, `.upsertLaunch()`, `BackgroundTaskTimelineAssemblyService.ts`, `BackgroundTaskTimelineLaunchService.ts`, `.getMessageAnchorKey()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (28 nodes): `ContextUsageDisplayService`, `.buildBreakdownSegments()`, `.buildDisplayTokenBreakdown()`, `.calculatePercentage()`, `.collectBreakdownChars()`, `.estimateBreakdownTokens()`, `.estimateTokens()`, `.fitBreakdownTokens()`, `.formatCurrency()`, `.formatNumber()`, `.formatPercent()`, `.getAssistantCharsFromMessage()`, `.getAssistantCharsFromPart()`, `.getContextBreakdown()`, `.getDisplaySnapshot()`, `.getDisplayTokenBreakdown()`, `.getNestedStringField()`, `.getObjectField()`, `.getParts()`, `.getStringField()`, `.getToolChars()`, `.getUnknownField()`, `.getUserCharsFromMessage()`, `.getUserCharsFromPart()`, `.isRecord()`, `.stringifyUnknown()`, `.summarize()`, `ContextUsageDisplayService.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (15 nodes): `ChildSessionGraphService`, `.buildEdge()`, `.canonicalizeToolName()`, `.computeGraphStatus()`, `.deduplicateEdges()`, `.enrichEdgesWithChildSessions()`, `.extractSessionId()`, `.findOrphanedSessions()`, `.isTaskToolBlock()`, `.isTaskToolCall()`, `.reconstructGraph()`, `.resolveEdgeStatus()`, `.tryBuildEdgeFromBlock()`, `.tryBuildEdgeFromToolCall()`, `ChildSessionGraphService.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (15 nodes): `TabBar.ts`, `TabBar`, `.attachTooltipLabel()`, `.closeOverflowMenu()`, `.constructor()`, `.destroy()`, `.getMaxVisibleTabs()`, `.openOverflowMenu()`, `.partitionItems()`, `.positionOverflowMenu()`, `.render()`, `.renderBackgroundTaskState()`, `.renderOverflowButton()`, `.renderTabItem()`, `.shouldOpenOverflowAbove()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (6 nodes): `FocusContextMarkdownViewLocator.ts`, `FocusContextMarkdownViewLocator`, `.constructor()`, `.getActiveMarkdownView()`, `.getMarkdownViews()`, `.rememberMarkdownFilePath()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (5 nodes): `ComposerContextEventBridge`, `.constructor()`, `.dispose()`, `.start()`, `ComposerContextEventBridge.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (5 nodes): `ContextFileCatalogEventBridge`, `.constructor()`, `.dispose()`, `.start()`, `ContextFileCatalogEventBridge.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `Community 1` to `Community 0`, `Community 2`, `Community 4`, `Community 5`, `Community 6`, `Community 9`, `Community 10`, `Community 12`, `Community 13`, `Community 14`, `Community 15`, `Community 16`, `Community 17`, `Community 18`, `Community 19`, `Community 22`, `Community 23`, `Community 24`, `Community 25`, `Community 26`, `Community 29`, `Community 32`, `Community 34`, `Community 39`?**
  _High betweenness centrality (0.387) - this node is a cross-community bridge._
- **Why does `OpenCodianView` connect `Community 0` to `Community 2`, `Community 3`, `Community 4`, `Community 5`, `Community 13`, `Community 14`, `Community 15`, `Community 17`, `Community 18`, `Community 23`, `Community 25`, `Community 29`?**
  _High betweenness centrality (0.156) - this node is a cross-community bridge._
- **Why does `OpenCodeService` connect `Community 6` to `Community 0`, `Community 1`, `Community 3`, `Community 7`, `Community 8`, `Community 10`, `Community 18`, `Community 21`, `Community 25`?**
  _High betweenness centrality (0.081) - this node is a cross-community bridge._
- **Are the 430 inferred relationships involving `t()` (e.g. with `.getEmptyConversationTitle()` and `.generateDefaultTitle()`) actually correct?**
  _`t()` has 430 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._