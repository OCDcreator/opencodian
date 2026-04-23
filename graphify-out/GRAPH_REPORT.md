# Graph Report - src  (2026-04-24)

## Corpus Check
- 336 files · ~280,319 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 4395 nodes · 9699 edges · 47 communities detected
- Extraction: 74% EXTRACTED · 26% INFERRED · 0% AMBIGUOUS · INFERRED: 2543 edges (avg confidence: 0.8)
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

## God Nodes (most connected - your core abstractions)
1. `t()` - 367 edges
2. `OpenCodianView` - 247 edges
3. `OpenCodeService` - 146 edges
4. `OpenCodianPlugin` - 88 edges
5. `ServerManager` - 81 edges
6. `SettingsModelCatalogPresenter` - 54 edges
7. `OpenCodeStreamingRuntimeCoordinator` - 52 edges
8. `OpenCodeCatalogQueryCoordinator` - 50 edges
9. `ConversationTabRuntimeCoordinator` - 45 edges
10. `OpenCodeStreamEventTransformer` - 39 edges

## Surprising Connections (you probably didn't know these)
- `normalizeSessionCommandPath()` --calls--> `normalizeContextPath()`  [INFERRED]
  src/core/opencode/OpenCodeSessionControlOrchestrator.ts → src/shared/contextPath.ts
- `buildNormalizedLoadedSettings()` --calls--> `normalizeEffortLevel()`  [INFERRED]
  src/core/types/settingsLoadNormalization.ts → src/core/types/settings.ts
- `buildNormalizedLoadedSettings()` --calls--> `normalizeThinkingBudget()`  [INFERRED]
  src/core/types/settingsLoadNormalization.ts → src/core/types/settings.ts
- `buildNormalizedLoadedSettings()` --calls--> `normalizeTitleMode()`  [INFERRED]
  src/core/types/settingsLoadNormalization.ts → src/core/types/settings.ts
- `buildNormalizedLoadedSettings()` --calls--> `normalizeSlashCommandSkillMode()`  [INFERRED]
  src/core/types/settingsLoadNormalization.ts → src/core/types/settings.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.01
Nodes (80): AssistantNoticeCardRenderer, ConversationHistoryActionsCoordinator, ConversationHistoryDialogService, t(), LiquidGlassSettingHelpModal, ModelConfigJsonModal, ModelConfigModal, createModelConfigKeyValueState() (+72 more)

### Community 1 - "Community 1"
Cohesion: 0.01
Nodes (40): buildStreamErrorNotice(), applyPassiveScrollMeasurement(), applyUserScrollIntent(), getDistanceFromBottom(), getProgrammaticScrollGuardDelayMs(), hasProgrammaticScrollGuard(), isNearBottom(), ConversationHydrationRenderBridge (+32 more)

### Community 2 - "Community 2"
Cohesion: 0.02
Nodes (25): BackgroundTaskCompletionNoticeService, BackgroundTaskIndicatorCoordinator, BackgroundTaskInlinePanelRenderer, BackgroundTaskLiveSignalCoordinator, createBackgroundTaskLiveSignalCoordinatorHost(), BackgroundTaskNoticeStateService, BackgroundTaskStreamTriggerCoordinator, BackgroundTaskTimelineService (+17 more)

### Community 3 - "Community 3"
Cohesion: 0.02
Nodes (61): buildComposerContextChipStates(), createFocusContextPreview(), getContextTargetKey(), getPromptContextTargetKey(), removeDraftContextItemsByTarget(), resolveFocusContextPreview(), upsertDraftContextItem(), ComposerContextActionService (+53 more)

### Community 4 - "Community 4"
Cohesion: 0.02
Nodes (81): areChatAppearanceSettingsEqual(), diffObject(), getBuiltinThemePresets(), getThemeAppearanceOverridesFromBase(), getThemePresetDefinition(), hasThemeAppearanceOverrides(), mergePartialChatAppearanceSettings(), resolveThemeChatAppearance() (+73 more)

### Community 5 - "Community 5"
Cohesion: 0.02
Nodes (20): ActiveTabContextUsageCoordinator, BackgroundTaskActivationIndicatorCoordinator, createEmptyTabContextState(), ContextUsageService, ConversationHydrationOutcomeBridge, ConversationLoadRecoveryCoordinator, ConversationTabLifecycleRecoveryCoordinator, ConversationTabOpenCoordinator (+12 more)

### Community 6 - "Community 6"
Cohesion: 0.02
Nodes (14): OpenCodePromptRequestBuilder, buildCanonicalConversationFingerprintPayload(), cloneSettings(), getDebugTextPreview(), isPlainRecord(), OpenCodeService, cloneMessage(), clonePart() (+6 more)

### Community 7 - "Community 7"
Cohesion: 0.02
Nodes (40): ConversationTurnViewModelBuilder, getMessageParentId(), getRecordString(), isRecord(), createSdkClient(), extractRenderableToolMetadata(), OpenCodeMessageNormalizationMapper, OpenCodeToolContentAssembler (+32 more)

### Community 8 - "Community 8"
Cohesion: 0.03
Nodes (13): OpenCodeEventSubscriptionCoordinator, cloneSettings(), OpenCodeServiceLifecycleCoordinator, normalizeDiffEntries(), normalizeMessageInfo(), normalizePart(), OpenCodeSyncEventRuntimeCoordinator, resolveSessionId() (+5 more)

### Community 9 - "Community 9"
Cohesion: 0.02
Nodes (16): OpenCodeCatalogQueryCoordinator, OpenCodeCatalogStateStore, OpenCodeQuestionPermissionHub, appendSdkErrorStatus(), describeSdkError(), extractSdkErrorMessage(), getSdkErrorRecordBaseMessage(), getSdkErrorRecordStatusCode() (+8 more)

### Community 10 - "Community 10"
Cohesion: 0.03
Nodes (96): buildLobehubDefinitions(), buildOpencodeDefinitions(), computeMatchScore(), createDefinition(), findBuiltinIcon(), formatBuiltinSource(), getBuiltinIcon(), getDisplayName() (+88 more)

### Community 11 - "Community 11"
Cohesion: 0.03
Nodes (21): buildConversationMetaFromStoredRecord(), cloneConversationListDiagnostics(), ConversationMetadataCache, getUtf8ByteLength(), trackTopDiagnosticEntries(), parseOpencodeConfigText(), stripJsonComments(), OpencodeConfigManager (+13 more)

### Community 12 - "Community 12"
Cohesion: 0.02
Nodes (77): ConversationMessageRenderDelegate, ConversationSyncedUpdateApplyDelegate, ConversationUserMessageRenderDelegate, getIncrementalRenderedMessageUpdate(), ConversationRenderService, ConversationSyncVisiblePostSyncRouter, TrailingAssistantPatchPlanningDelegate, buildMessageRenderGroups() (+69 more)

### Community 13 - "Community 13"
Cohesion: 0.03
Nodes (25): buildLocalStreamOutcome(), normalizeConversationSessionSettings(), ConversationAuthoritativeMessageMergeCoordinator, ConversationAuthoritativeReloadCoordinator, findLatestInterruptedNotice(), findLatestUserBeforeTimestamp(), isInterruptedNoticeMessage(), shouldBypassCanonicalSyncForInterruptedNotice() (+17 more)

### Community 14 - "Community 14"
Cohesion: 0.03
Nodes (27): resetLogEmissionThrottleState(), clearProviderIconCache(), QuestionDockCoordinator, applyQuestionDockSelection(), getQuestionDockActiveInteractionState(), getQuestionDockDraftAnswers(), sanitizeQuestionDockAnswer(), selectQuestionDockGroup() (+19 more)

### Community 15 - "Community 15"
Cohesion: 0.04
Nodes (18): clamp(), createStageLayerElement(), createSvgElement(), estimateProjectionDelta(), formatNumber(), generateFilterId(), GlassOctahedronDemoController, maxRenderQuality() (+10 more)

### Community 16 - "Community 16"
Cohesion: 0.05
Nodes (18): renderAssistantPlainTextFallbackContent(), renderAssistantStructuredContent(), buildQuestionResolutionCardRenderPlan(), StreamController, formatDurationSeconds(), normalizeDurationSeconds(), ThinkingBlockRenderer, ToolCallRenderer (+10 more)

### Community 17 - "Community 17"
Cohesion: 0.04
Nodes (20): ChatHeaderPresenter, ComposerContextViewFacade, createComposerContextServices(), ComposerContextViewHostAdapter, buildComposerInputSubmission(), ComposerInputShellCoordinator, parseCommandSubmission(), createFocusContextServices() (+12 more)

### Community 18 - "Community 18"
Cohesion: 0.05
Nodes (47): ModelCatalogStateService, assembleModelCatalog(), assembleServerModelCatalog(), filterCatalogToProviderIds(), projectEffectiveCatalog(), resolveProviderAvailabilityProbePlan(), selectProviderProbeModelId(), filterCatalog() (+39 more)

### Community 19 - "Community 19"
Cohesion: 0.04
Nodes (11): buildChatAppearanceCustomCss(), getChatAppearanceBackgroundSizeValue(), getChatAppearanceCssVariables(), getInputPanelGlassRefractionCssVariables(), getInputPanelThemeFamily(), getLiquidGlassAdapterIdForInputPanelTheme(), isValidChatAppearanceCustomCssDeclarations(), SettingsStyleControls (+3 more)

### Community 20 - "Community 20"
Cohesion: 0.05
Nodes (5): ComposerContextEventBridge, OpenCodianSettingTab, SettingsPluginSection, SettingsSectionCoordinator, SettingsServerSection

### Community 21 - "Community 21"
Cohesion: 0.06
Nodes (72): measureDisplacementRangeAtUv(), add3(), applyEdgeBulge(), applyFilterLayerState(), bounds2(), buildBackdropFilterValue(), buildDisplacementTrace(), buildFallbackBackdropFilterValue() (+64 more)

### Community 22 - "Community 22"
Cohesion: 0.07
Nodes (53): createComposerGlassFilterElement(), createSvgElement(), ensureComposerGlassSvgDefs(), ensureComposerGlassSvgRootElement(), InputPanelThemeRuntime, applyBackdropFilterValue(), applyGlassTint(), applyInstanceMarker() (+45 more)

### Community 23 - "Community 23"
Cohesion: 0.05
Nodes (48): applyDisplacementSnapshot(), applyHostTransform(), buildBackdropFilterValue(), buildFallbackBackdropFilterValue(), clamp(), createFaceSvgElement(), createStageLayerElement(), createState() (+40 more)

### Community 24 - "Community 24"
Cohesion: 0.04
Nodes (19): extractAssistantStructuredTextCopyContent(), resolveAssistantCopyContent(), AssistantErrorRenderer, buildErrorAssistantFooterPayload(), buildNoticeAssistantFooterPayload(), buildPersistedAssistantFooterPayload(), buildPseudoStreamAssistantFooterPayload(), resolvePersistedAssistantFooterStatusLabel() (+11 more)

### Community 25 - "Community 25"
Cohesion: 0.05
Nodes (4): ChatSelectionControlsCoordinator, ModelSelectionRuntime, buildModelSelectorDisplayState(), PermissionModeSelectorCoordinator

### Community 26 - "Community 26"
Cohesion: 0.07
Nodes (18): ContextDetailModal, ContextUsageDisplayService, getLocale(), buildObjectReplacementPatch(), buildProjectAgentOptionsPatch(), buildProjectAgentPermissionPatch(), buildTaskAllowlistPermission(), cloneJsonValue() (+10 more)

### Community 27 - "Community 27"
Cohesion: 0.11
Nodes (49): add3(), buildClipPath(), buildDisplacementTrace(), buildGlassOctahedronBackdropFilterValue(), buildGlassOctahedronLightBackdropFilterValue(), clamp(), computeBounds(), convexHull() (+41 more)

### Community 28 - "Community 28"
Cohesion: 0.09
Nodes (2): BackgroundTaskTimelineAssemblyService, BackgroundTaskTimelineLaunchService

### Community 29 - "Community 29"
Cohesion: 0.08
Nodes (32): registerBuiltinGlassAdapters(), getDefaultDebugModuleSettings(), isDebugModuleKey(), normalizeDebugModuleSettings(), normalizeDebugRefreshIntervalMs(), resolveDebugModuleKey(), setLocale(), createLogger() (+24 more)

### Community 30 - "Community 30"
Cohesion: 0.11
Nodes (40): applyFilterLayerStyles(), applyShellStyles(), buildBackdropFilterValue(), buildEdgeBandWeight(), buildFallbackBackdropFilterValue(), buildFilterLayerBoxShadow(), captureDatasetSnapshot(), captureStyleSnapshot() (+32 more)

### Community 31 - "Community 31"
Cohesion: 0.13
Nodes (31): buildCommandScopedAgent(), cloneConfigObject(), cloneConfigValue(), getCommandScopedAgentId(), getCommandScopedAgentMetadata(), isCommandScopedAgentForCommand(), isCommandScopedAgentId(), mergeConfigObjects() (+23 more)

### Community 32 - "Community 32"
Cohesion: 0.08
Nodes (6): BackgroundConversationAttentionCoordinator, BackgroundConversationPostSyncHandoffCoordinator, BackgroundConversationPostSyncRefreshExecutor, BackgroundConversationSignalSyncStateCoordinator, ConversationSyncBackgroundPostSyncRouter, PostSyncQuestionTodoRefreshPlanBuilder

### Community 33 - "Community 33"
Cohesion: 0.11
Nodes (16): buildFragmentWithLinks(), createWikilinkElement(), createWikilinkPattern(), extractLinkTarget(), fileExistsInVault(), findWikilinks(), processFileLinks(), processTextNode() (+8 more)

### Community 34 - "Community 34"
Cohesion: 0.13
Nodes (4): ContextFileCatalogBuildRunner, ContextFileCatalogIndex, createContextFileEntry(), ContextFileCatalogService

### Community 35 - "Community 35"
Cohesion: 0.14
Nodes (3): EffortSelector, isAdaptiveThinkingModel(), UserMessageFooterRenderer

### Community 36 - "Community 36"
Cohesion: 0.15
Nodes (13): createBackgroundConversationPostSyncHandoffServices(), createBackgroundConversationPostSyncHandoffViewHostAdapter(), createPostSyncQuestionTodoRefreshHosts(), createPostSyncQuestionTodoRefreshServices(), createQuestionTodoBackgroundTaskActivationHosts(), createQuestionTodoBackgroundTaskActivationServices(), createQuestionTodoBackgroundTaskActivationViewHostAdapter(), createQuestionTodoBackgroundTaskRefreshServices() (+5 more)

### Community 37 - "Community 37"
Cohesion: 0.26
Nodes (1): TabBar

### Community 38 - "Community 38"
Cohesion: 0.26
Nodes (1): ProjectConfigFileWatcher

### Community 39 - "Community 39"
Cohesion: 0.24
Nodes (1): ConversationSessionSettingsModal

### Community 40 - "Community 40"
Cohesion: 0.29
Nodes (1): ModelPickerModal

### Community 41 - "Community 41"
Cohesion: 0.2
Nodes (6): buildModelOptionValue(), parseModelOptionValue(), scrollToCurrentModel(), selectHighlightedModel(), renderModelList(), bindModelSelectorStickyHeaders()

### Community 42 - "Community 42"
Cohesion: 0.29
Nodes (1): ContextFilePickerModal

### Community 43 - "Community 43"
Cohesion: 0.44
Nodes (8): formatMcpSummaryField(), getFirstScalarMcpFallback(), getMcpSummaryFromFields(), getMcpToolSummary(), getPathTail(), resolveMcpSummaryCategory(), tokenizeMcpToolName(), truncateMcpSummaryText()

### Community 44 - "Community 44"
Cohesion: 0.39
Nodes (1): ConversationCompactionHelpModal

### Community 45 - "Community 45"
Cohesion: 0.47
Nodes (4): buildCodeFence(), prepareUserMessageMarkdownForDisplay(), replaceOutsideMarkdownCode(), trimFenceContent()

### Community 46 - "Community 46"
Cohesion: 0.4
Nodes (1): ContextFileCatalogEventBridge

## Knowledge Gaps
- **Thin community `Community 28`** (43 nodes): `BackgroundTaskTimelineAssemblyService`, `.addCompletionToSegment()`, `.applyReminderToSegment()`, `.captureUserSegmentAnchor()`, `.collectCompletionReminderSegments()`, `.collectDiagnostics()`, `.collectMessageSegments()`, `.collectSegments()`, `.collectTaskLaunchBlock()`, `.constructor()`, `.createEmptySegment()`, `.createSegment()`, `.createSegmentCollectionState()`, `.finalizeCollectedSegments()`, `.finalizeSegment()`, `.findBackgroundTaskAnchorIndex()`, `.findSegmentByTaskId()`, `.getLatestSearchModeSegment()`, `.getLatestSegmentWithActivity()`, `.getOrCreateRuntimeSegment()`, `.getOrCreateSegment()`, `.getPendingLaunches()`, `.isBackgroundTaskCompletionReminder()`, `.isSearchModeAnchorMessage()`, `.mergeRuntimeSegmentState()`, `.mergeSegmentCompletions()`, `.mergeSegmentLaunches()`, `.resolvePendingState()`, `.resolveReminderSegments()`, `.segmentHasTaskActivity()`, `.upsertSegmentLaunch()`, `BackgroundTaskTimelineLaunchService`, `.addCompletedTasksFromMessage()`, `.extractBackgroundTaskId()`, `.filterPendingLaunches()`, `.getBackgroundTaskDescription()`, `.isLaunchMatchedByCompletion()`, `.upsertLaunch()`, `BackgroundTaskTimelineAssemblyService.ts`, `BackgroundTaskTimelineLaunchService.ts`, `.collectBackgroundTaskDiagnostics()`, `.collectBackgroundTaskSegments()`, `.getMessageAnchorKey()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (15 nodes): `TabBar.ts`, `TabBar`, `.attachTooltipLabel()`, `.closeOverflowMenu()`, `.constructor()`, `.destroy()`, `.getMaxVisibleTabs()`, `.openOverflowMenu()`, `.partitionItems()`, `.positionOverflowMenu()`, `.render()`, `.renderBackgroundTaskState()`, `.renderOverflowButton()`, `.renderTabItem()`, `.shouldOpenOverflowAbove()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (13 nodes): `ProjectConfigFileWatcher.ts`, `ProjectConfigFileWatcher`, `.clearPendingChange()`, `.constructor()`, `.dispose()`, `.getAbstractFilePath()`, `.handleMutation()`, `.handleRename()`, `.matchesProjectConfig()`, `.resolveRelativeConfigPath()`, `.runChangeHandler()`, `.scheduleChange()`, `.start()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (13 nodes): `ConversationSessionSettingsModal`, `.buildOverrides()`, `.constructor()`, `.createFieldShell()`, `.createHero()`, `.createNumberField()`, `.createSection()`, `.handleSave()`, `.onClose()`, `.onOpen()`, `.setBusy()`, `.setError()`, `ConversationSessionSettingsModal.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (12 nodes): `ModelPickerModal.ts`, `ModelPickerModal`, `.choose()`, `.constructor()`, `.getFilteredGroups()`, `.getOptionValues()`, `.navigate()`, `.onOpen()`, `.renderList()`, `.renderOption()`, `.selectHighlighted()`, `.syncHighlight()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (11 nodes): `ContextFilePickerModal`, `.constructor()`, `.createExtensionFilterButton()`, `.finish()`, `.getFilteredEntries()`, `.loadCatalogData()`, `.onClose()`, `.onOpen()`, `.render()`, `.renderExtensionFilters()`, `.scheduleRender()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (8 nodes): `ConversationCompactionHelpModal`, `.constructor()`, `.createCard()`, `.createTipsCard()`, `.onClose()`, `.onOpen()`, `.tr()`, `ConversationCompactionHelpModal.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (5 nodes): `ContextFileCatalogEventBridge`, `.constructor()`, `.dispose()`, `.start()`, `ContextFileCatalogEventBridge.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `Community 0` to `Community 1`, `Community 2`, `Community 3`, `Community 4`, `Community 5`, `Community 6`, `Community 9`, `Community 10`, `Community 11`, `Community 12`, `Community 13`, `Community 14`, `Community 15`, `Community 16`, `Community 17`, `Community 18`, `Community 19`, `Community 20`, `Community 23`, `Community 24`, `Community 25`, `Community 26`, `Community 28`, `Community 29`, `Community 35`, `Community 37`, `Community 39`, `Community 40`, `Community 42`, `Community 44`?**
  _High betweenness centrality (0.344) - this node is a cross-community bridge._
- **Why does `OpenCodianView` connect `Community 1` to `Community 0`, `Community 2`, `Community 3`, `Community 4`, `Community 5`, `Community 35`, `Community 7`, `Community 11`, `Community 12`, `Community 13`, `Community 14`, `Community 15`, `Community 16`, `Community 17`, `Community 19`, `Community 24`, `Community 28`?**
  _High betweenness centrality (0.168) - this node is a cross-community bridge._
- **Why does `OpenCodeService` connect `Community 6` to `Community 2`, `Community 4`, `Community 5`, `Community 7`, `Community 8`, `Community 9`, `Community 11`, `Community 13`, `Community 14`, `Community 16`, `Community 18`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Are the 366 inferred relationships involving `t()` (e.g. with `.getEmptyConversationTitle()` and `.generateDefaultTitle()`) actually correct?**
  _`t()` has 366 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.02 - nodes in this community are weakly interconnected._