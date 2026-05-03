# Graph Report - src  (2026-05-03)

## Corpus Check
- 369 files · ~308,162 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 4809 nodes · 10577 edges · 55 communities detected
- Extraction: 73% EXTRACTED · 27% INFERRED · 0% AMBIGUOUS · INFERRED: 2810 edges (avg confidence: 0.8)
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

## God Nodes (most connected - your core abstractions)
1. `t()` - 437 edges
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
  src\core\opencode\OpenCodeSessionControlOrchestrator.ts → src\shared\contextPath.ts
- `buildLocalStreamOutcome()` --calls--> `shouldSyncAfterStream()`  [INFERRED]
  src\features\chat\runtime\buildLocalStreamOutcome.ts → src\features\chat\services\MessageFinalizationService.ts
- `buildQuestionAnswerMarkdown()` --calls--> `t()`  [INFERRED]
  src\features\chat\runtime\QuestionResolutionCardRenderer.ts → src\i18n\index.ts
- `buildQuestionRejectedMarkdown()` --calls--> `t()`  [INFERRED]
  src\features\chat\runtime\QuestionResolutionCardRenderer.ts → src\i18n\index.ts
- `getQuestionResolutionAnswerText()` --calls--> `t()`  [INFERRED]
  src\features\chat\runtime\QuestionResolutionCardRenderer.ts → src\i18n\index.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.01
Nodes (87): AssistantNoticeCardRenderer, ConversationCompactionHelpModal, ConversationSessionSettingsModal, t(), LiquidGlassSettingHelpModal, ModelConfigJsonModal, ModelConfigModal, createModelConfigKeyValueState() (+79 more)

### Community 1 - "Community 1"
Cohesion: 0.01
Nodes (37): applyPassiveScrollMeasurement(), applyUserScrollIntent(), getDistanceFromBottom(), getProgrammaticScrollGuardDelayMs(), hasProgrammaticScrollGuard(), isNearBottom(), ConversationHydrationOutcomeBridge, ConversationHydrationRenderBridge (+29 more)

### Community 2 - "Community 2"
Cohesion: 0.02
Nodes (26): ActiveTabContextUsageCoordinator, buildStreamErrorNotice(), BackgroundTaskActivationIndicatorCoordinator, createEmptyTabContextState(), ContextDetailModal, ContextRing, ContextUsageService, assembleConversationLoadRecovery() (+18 more)

### Community 3 - "Community 3"
Cohesion: 0.01
Nodes (53): AgentInvocationService, buildInterruptedAssistantNotice(), renderAssistantNoticeCardAndFooter(), renderAssistantPlaceholderAsNotice(), renderPersistedAssistantNotice(), renderAssistantPlainTextFallbackContent(), AssistantShellRenderer, AssistantShellViewHostAdapter (+45 more)

### Community 4 - "Community 4"
Cohesion: 0.02
Nodes (17): ChildSessionGraphCoordinator, buildConversationMetaFromStoredRecord(), cloneConversationListDiagnostics(), ConversationMetadataCache, getUtf8ByteLength(), trackTopDiagnosticEntries(), MarkdownAgentWorkspaceService, McpConfigService (+9 more)

### Community 5 - "Community 5"
Cohesion: 0.02
Nodes (20): BackgroundTaskCompletionNoticeService, BackgroundTaskIndicatorCoordinator, BackgroundTaskInlinePanelRenderer, BackgroundTaskLiveSignalCoordinator, createBackgroundTaskLiveSignalCoordinatorHost(), BackgroundTaskNoticeStateService, BackgroundTaskStreamTriggerCoordinator, BackgroundTaskTimelineService (+12 more)

### Community 6 - "Community 6"
Cohesion: 0.02
Nodes (87): areChatAppearanceSettingsEqual(), diffObject(), getBuiltinThemePresets(), getThemeAppearanceOverridesFromBase(), getThemePresetDefinition(), hasThemeAppearanceOverrides(), mergePartialChatAppearanceSettings(), resolveThemeChatAppearance() (+79 more)

### Community 7 - "Community 7"
Cohesion: 0.02
Nodes (47): createSdkClient(), OpenCodeLegacySseStreamReader, extractRenderableToolMetadata(), OpenCodeMessageNormalizationMapper, OpenCodeToolContentAssembler, resolveOpenCodeToolKind(), resolveToolResultVisibility(), extractRenderableToolMetadata() (+39 more)

### Community 8 - "Community 8"
Cohesion: 0.02
Nodes (15): OpenCodePromptRequestBuilder, buildCanonicalConversationFingerprintPayload(), cloneSettings(), getDebugTextPreview(), OpenCodeService, cloneMessage(), clonePart(), cloneState() (+7 more)

### Community 9 - "Community 9"
Cohesion: 0.02
Nodes (57): BackgroundConversationSignalSyncStateCoordinator, buildLocalStreamOutcome(), ConversationAuthoritativeMessageMergeCoordinator, ConversationAuthoritativeReloadCoordinator, findLatestInterruptedNotice(), findLatestUserBeforeTimestamp(), isInterruptedNoticeMessage(), shouldBypassCanonicalSyncForInterruptedNotice() (+49 more)

### Community 10 - "Community 10"
Cohesion: 0.02
Nodes (20): OpenCodeCatalogQueryCoordinator, OpenCodeCatalogStateStore, normalizePermissionRequest(), normalizePermissionResponse(), normalizePermissionToolReference(), normalizeStringArray(), OpenCodeQuestionPermissionHub, appendSdkErrorStatus() (+12 more)

### Community 11 - "Community 11"
Cohesion: 0.03
Nodes (96): buildLobehubDefinitions(), buildOpencodeDefinitions(), computeMatchScore(), createDefinition(), findBuiltinIcon(), formatBuiltinSource(), getBuiltinIcon(), getDisplayName() (+88 more)

### Community 12 - "Community 12"
Cohesion: 0.02
Nodes (9): ChatVisualDemoCoordinator, ConversationHistoryActionsCoordinator, ConversationHistoryDialogService, OpenCodianPlugin, ModelPickerModal, PendingIndicatorController, PermissionModeSelectorCoordinator, PluginRuntimeCoordinator (+1 more)

### Community 13 - "Community 13"
Cohesion: 0.03
Nodes (23): buildComposerContextChipStates(), createFocusContextPreview(), getContextTargetKey(), getPromptContextTargetKey(), removeDraftContextItemsByTarget(), resolveFocusContextPreview(), upsertDraftContextItem(), ComposerContextActionService (+15 more)

### Community 14 - "Community 14"
Cohesion: 0.04
Nodes (13): OpenCodeEventSubscriptionCoordinator, cloneSettings(), deepClonePlain(), deepCloneValue(), isPlainRecord(), OpenCodeServiceLifecycleCoordinator, normalizeDiffEntries(), normalizeMessageInfo() (+5 more)

### Community 15 - "Community 15"
Cohesion: 0.04
Nodes (8): LocalSidecarEndpointResolver, LocalSidecarLauncher, LocalProcessProbe, LocalSidecarProcessInspector, formatDurationMs(), getRecentLogText(), OpenCodianStartupCoordinator, ServerManager

### Community 16 - "Community 16"
Cohesion: 0.04
Nodes (42): ContextAttachmentBuilder, ContextFileCatalogBuildRunner, ContextFileCatalogIndex, createContextFileEntry(), ContextFileCatalogService, contextPathFromFileUrl(), isAbsoluteContextPath(), isWindowsDrivePath() (+34 more)

### Community 17 - "Community 17"
Cohesion: 0.05
Nodes (78): createComposerGlassFilterElement(), createSvgElement(), ensureComposerGlassSvgDefs(), ensureComposerGlassSvgRootElement(), InputPanelThemeRuntime, measureDisplacementRangeAtUv(), getLiquidGlassAdapterIdForInputPanelTheme(), add3() (+70 more)

### Community 18 - "Community 18"
Cohesion: 0.05
Nodes (11): OpenCodianSettingTab, getActiveSecondaryTabId(), getPrimaryTabDefinition(), resolvePrimaryTabId(), resolveSecondaryTabId(), SettingsSectionCoordinator, SettingsTabbedRenderer, renderUserExcludedTagsSetting() (+3 more)

### Community 19 - "Community 19"
Cohesion: 0.05
Nodes (61): clamp(), createStageLayerElement(), createSvgElement(), estimateProjectionDelta(), formatNumber(), generateFilterId(), GlassOctahedronDemoController, maxRenderQuality() (+53 more)

### Community 20 - "Community 20"
Cohesion: 0.05
Nodes (49): ModelCatalogStateService, assembleModelCatalog(), assembleServerModelCatalog(), filterCatalogToProviderIds(), projectEffectiveCatalog(), resolveProviderAvailabilityProbePlan(), selectProviderProbeModelId(), filterCatalog() (+41 more)

### Community 21 - "Community 21"
Cohesion: 0.04
Nodes (24): QuestionDock, QuestionDockCoordinator, applyQuestionDockSelection(), getQuestionDockActiveInteractionState(), getQuestionDockDraftAnswers(), sanitizeQuestionDockAnswer(), selectQuestionDockGroup(), selectQuestionDockQuestion() (+16 more)

### Community 22 - "Community 22"
Cohesion: 0.05
Nodes (54): buildCommandScopedAgent(), cloneConfigObject(), cloneConfigValue(), getCommandScopedAgentId(), getCommandScopedAgentMetadata(), isCommandScopedAgentForCommand(), isCommandScopedAgentId(), mergeConfigObjects() (+46 more)

### Community 23 - "Community 23"
Cohesion: 0.05
Nodes (15): ChatHeaderPresenter, ComposerContextViewFacade, createComposerContextServices(), ComposerContextViewHostAdapter, buildComposerInputSubmission(), ComposerInputShellCoordinator, parseCommandSubmission(), createFocusContextServices() (+7 more)

### Community 24 - "Community 24"
Cohesion: 0.07
Nodes (6): StreamController, formatDurationSeconds(), normalizeDurationSeconds(), ThinkingBlockRenderer, ToolCallRenderer, createStreamState()

### Community 25 - "Community 25"
Cohesion: 0.05
Nodes (48): applyDisplacementSnapshot(), applyHostTransform(), buildBackdropFilterValue(), buildFallbackBackdropFilterValue(), clamp(), createFaceSvgElement(), createStageLayerElement(), createState() (+40 more)

### Community 26 - "Community 26"
Cohesion: 0.05
Nodes (12): ConversationIdentityRuntime, ConversationAssistantMessageRenderDelegate, ConversationMessageRenderDelegate, ConversationUserMessageRenderDelegate, getIncrementalRenderedMessageUpdate(), TrailingAssistantPatchPlanningDelegate, buildMessageRenderGroups(), flattenContentBlocks() (+4 more)

### Community 27 - "Community 27"
Cohesion: 0.06
Nodes (21): McpServerEditorModal, McpServerStatusModal, redactMcpSensitiveText(), redactMcpTechnicalDetails(), redactUnknownSecretValues(), statusLabel(), summarizeCommand(), transportSummary() (+13 more)

### Community 28 - "Community 28"
Cohesion: 0.06
Nodes (7): buildModelPickerGroups(), filterModelPickerGroups(), findModelPickerOption(), findModelPickerOptionByRef(), SettingsConversationSection, addSettingHelpButton(), SettingsStyleControls

### Community 29 - "Community 29"
Cohesion: 0.08
Nodes (4): cloneFormatterConfigValue(), readFormatterConfigValue(), writeFormatterConfigValue(), SettingsFormatterSection

### Community 30 - "Community 30"
Cohesion: 0.06
Nodes (8): buildChatAppearanceCustomCss(), getChatAppearanceBackgroundSizeValue(), getChatAppearanceCssVariables(), getInputPanelGlassRefractionCssVariables(), ChatSurfaceAppearanceCoordinator, ConversationSessionSettingsCoordinator, InputPanelAppearanceCoordinator, isValidChatAppearanceCustomCssDeclarations()

### Community 31 - "Community 31"
Cohesion: 0.11
Nodes (48): applyBackdropFilterValue(), applyGlassTint(), applyInstanceMarker(), applyShellInteractiveStyles(), buildFallbackBackdropFilterValue(), buildSvgBackdropFilterValue(), clamp(), cleanupInstanceArtifacts() (+40 more)

### Community 32 - "Community 32"
Cohesion: 0.08
Nodes (33): registerBuiltinGlassAdapters(), getDefaultDebugModuleSettings(), isDebugModuleKey(), normalizeDebugModuleSettings(), normalizeDebugRefreshIntervalMs(), resolveDebugModuleKey(), getLocale(), setLocale() (+25 more)

### Community 33 - "Community 33"
Cohesion: 0.09
Nodes (2): BackgroundTaskTimelineAssemblyService, BackgroundTaskTimelineLaunchService

### Community 34 - "Community 34"
Cohesion: 0.09
Nodes (39): applyTrailingAssistantPatchTailState(), buildTrailingAssistantPatchExecutionPlan(), buildTrailingAssistantPatchExecutionPlanFromExecutionTailPlanningContext(), buildTrailingAssistantPatchExecutionTailInputs(), buildTrailingAssistantPatchExecutionTailPlanningContext(), buildTrailingAssistantPatchExecutionTailPlanningContextFromInputs(), buildTrailingAssistantPatchExecutionTailPlanParts(), buildTrailingAssistantPatchExecutionTailPlanPartsFromExecutionTailPlanningContext() (+31 more)

### Community 35 - "Community 35"
Cohesion: 0.11
Nodes (40): applyFilterLayerStyles(), applyShellStyles(), buildBackdropFilterValue(), buildEdgeBandWeight(), buildFallbackBackdropFilterValue(), buildFilterLayerBoxShadow(), captureDatasetSnapshot(), captureStyleSnapshot() (+32 more)

### Community 36 - "Community 36"
Cohesion: 0.12
Nodes (2): ChatSelectionControlsCoordinator, buildModelSelectorDisplayState()

### Community 37 - "Community 37"
Cohesion: 0.09
Nodes (11): extractAssistantStructuredTextCopyContent(), resolveAssistantCopyContent(), AssistantErrorRenderer, buildErrorAssistantFooterPayload(), buildNoticeAssistantFooterPayload(), buildPersistedAssistantFooterPayload(), buildPseudoStreamAssistantFooterPayload(), resolvePersistedAssistantFooterStatusLabel() (+3 more)

### Community 38 - "Community 38"
Cohesion: 0.11
Nodes (16): buildFragmentWithLinks(), createWikilinkElement(), createWikilinkPattern(), extractLinkTarget(), fileExistsInVault(), findWikilinks(), processFileLinks(), processTextNode() (+8 more)

### Community 39 - "Community 39"
Cohesion: 0.14
Nodes (1): ContextUsageDisplayService

### Community 40 - "Community 40"
Cohesion: 0.13
Nodes (3): EffortSelector, isAdaptiveThinkingModel(), UserMessageFooterRenderer

### Community 41 - "Community 41"
Cohesion: 0.13
Nodes (4): AgentCatalogService, SurfaceAgentBuilder, SystemAgentGuardService, isSystemAgentId()

### Community 42 - "Community 42"
Cohesion: 0.14
Nodes (15): createBackgroundConversationPostSyncHandoffServices(), createBackgroundConversationPostSyncHandoffViewHostAdapter(), createPostSyncQuestionTodoRefreshHosts(), createPostSyncQuestionTodoRefreshServices(), createQuestionTodoBackgroundTaskActivationHosts(), createQuestionTodoBackgroundTaskActivationServices(), createQuestionTodoBackgroundTaskActivationViewHostAdapter(), createQuestionTodoBackgroundTaskRefreshServices() (+7 more)

### Community 43 - "Community 43"
Cohesion: 0.12
Nodes (4): ConversationSyncVisiblePostSyncRouter, PostSyncQuestionTodoRefreshFacade, VisibleConversationPostSyncCoordinator, VisibleConversationPostSyncStateCoordinator

### Community 44 - "Community 44"
Cohesion: 0.28
Nodes (1): ChildSessionGraphService

### Community 45 - "Community 45"
Cohesion: 0.26
Nodes (1): TabBar

### Community 46 - "Community 46"
Cohesion: 0.2
Nodes (6): buildModelOptionValue(), parseModelOptionValue(), scrollToCurrentModel(), selectHighlightedModel(), renderModelList(), bindModelSelectorStickyHeaders()

### Community 47 - "Community 47"
Cohesion: 0.26
Nodes (1): ProjectConfigFileWatcher

### Community 48 - "Community 48"
Cohesion: 0.31
Nodes (6): createQuestionPostResolutionRuntimeHostAdapter(), createQuestionRuntimeHosts(), createQuestionRuntimeServices(), createQuestionRuntimeViewHostAdapter(), createQuestionRuntimeBundle(), createQuestionRuntimeViewHost()

### Community 49 - "Community 49"
Cohesion: 0.44
Nodes (8): formatMcpSummaryField(), getFirstScalarMcpFallback(), getMcpSummaryFromFields(), getMcpToolSummary(), getPathTail(), resolveMcpSummaryCategory(), tokenizeMcpToolName(), truncateMcpSummaryText()

### Community 50 - "Community 50"
Cohesion: 0.39
Nodes (1): ServerSettingHelpModal

### Community 51 - "Community 51"
Cohesion: 0.47
Nodes (4): buildCodeFence(), prepareUserMessageMarkdownForDisplay(), replaceOutsideMarkdownCode(), trimFenceContent()

### Community 52 - "Community 52"
Cohesion: 0.4
Nodes (1): FocusContextMarkdownViewLocator

### Community 53 - "Community 53"
Cohesion: 0.4
Nodes (1): ComposerContextEventBridge

### Community 54 - "Community 54"
Cohesion: 0.4
Nodes (1): ContextFileCatalogEventBridge

## Knowledge Gaps
- **Thin community `Community 33`** (43 nodes): `BackgroundTaskTimelineAssemblyService`, `.addCompletionToSegment()`, `.applyReminderToSegment()`, `.captureUserSegmentAnchor()`, `.collectCompletionReminderSegments()`, `.collectDiagnostics()`, `.collectMessageSegments()`, `.collectSegments()`, `.collectTaskLaunchBlock()`, `.constructor()`, `.createEmptySegment()`, `.createSegment()`, `.createSegmentCollectionState()`, `.finalizeCollectedSegments()`, `.finalizeSegment()`, `.findBackgroundTaskAnchorIndex()`, `.findSegmentByTaskId()`, `.getLatestSearchModeSegment()`, `.getLatestSegmentWithActivity()`, `.getOrCreateRuntimeSegment()`, `.getOrCreateSegment()`, `.getPendingLaunches()`, `.isBackgroundTaskCompletionReminder()`, `.isSearchModeAnchorMessage()`, `.mergeRuntimeSegmentState()`, `.mergeSegmentCompletions()`, `.mergeSegmentLaunches()`, `.resolvePendingState()`, `.resolveReminderSegments()`, `.segmentHasTaskActivity()`, `.upsertLaunch()`, `.upsertSegmentLaunch()`, `BackgroundTaskTimelineLaunchService`, `.addCompletedTasksFromMessage()`, `.extractBackgroundTaskId()`, `.filterPendingLaunches()`, `.getBackgroundTaskDescription()`, `.isLaunchMatchedByCompletion()`, `.upsertLaunch()`, `.armIndicatorForUserMessage()`, `BackgroundTaskTimelineAssemblyService.ts`, `BackgroundTaskTimelineLaunchService.ts`, `.getMessageAnchorKey()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (32 nodes): `ChatSelectionControlsCoordinator`, `.applyLocaleTexts()`, `.build()`, `.buildModelDropdown()`, `.closeModelDropdown()`, `.constructor()`, `.destroy()`, `.ensureSelectedModelAvailable()`, `.findKnownModelInfo()`, `.formatModelId()`, `.getAvailableProviders()`, `.getCurrentSessionModel()`, `.getCurrentSessionModelResolution()`, `.getModelUnavailableNoticeContent()`, `.hasLoadedModelCatalog()`, `.highlightModelOption()`, `.mountModelSelector()`, `.navigateModelList()`, `.openModelDropdown()`, `.refreshModelOptions()`, `.registerEscapeHandler()`, `.reloadModelCatalog()`, `.renderModelList()`, `.scrollToCurrentModel()`, `.selectHighlightedModel()`, `.selectModel()`, `.toggleModelDropdown()`, `.updateModelSelectorDisplay()`, `.updateModelSelectorIcon()`, `ChatSelectionControlsCoordinator.ts`, `ModelSelectorDisplay.ts`, `buildModelSelectorDisplayState()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (28 nodes): `ContextUsageDisplayService`, `.buildBreakdownSegments()`, `.buildDisplayTokenBreakdown()`, `.calculatePercentage()`, `.collectBreakdownChars()`, `.estimateBreakdownTokens()`, `.estimateTokens()`, `.fitBreakdownTokens()`, `.formatCurrency()`, `.formatNumber()`, `.formatPercent()`, `.getAssistantCharsFromMessage()`, `.getAssistantCharsFromPart()`, `.getContextBreakdown()`, `.getDisplaySnapshot()`, `.getDisplayTokenBreakdown()`, `.getNestedStringField()`, `.getObjectField()`, `.getParts()`, `.getStringField()`, `.getToolChars()`, `.getUnknownField()`, `.getUserCharsFromMessage()`, `.getUserCharsFromPart()`, `.isRecord()`, `.stringifyUnknown()`, `.summarize()`, `ContextUsageDisplayService.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (15 nodes): `ChildSessionGraphService`, `.buildEdge()`, `.canonicalizeToolName()`, `.computeGraphStatus()`, `.deduplicateEdges()`, `.enrichEdgesWithChildSessions()`, `.extractSessionId()`, `.findOrphanedSessions()`, `.isTaskToolBlock()`, `.isTaskToolCall()`, `.reconstructGraph()`, `.resolveEdgeStatus()`, `.tryBuildEdgeFromBlock()`, `.tryBuildEdgeFromToolCall()`, `ChildSessionGraphService.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (15 nodes): `TabBar.ts`, `TabBar`, `.attachTooltipLabel()`, `.closeOverflowMenu()`, `.constructor()`, `.destroy()`, `.getMaxVisibleTabs()`, `.openOverflowMenu()`, `.partitionItems()`, `.positionOverflowMenu()`, `.render()`, `.renderBackgroundTaskState()`, `.renderOverflowButton()`, `.renderTabItem()`, `.shouldOpenOverflowAbove()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (12 nodes): `ProjectConfigFileWatcher.ts`, `ProjectConfigFileWatcher`, `.clearPendingChange()`, `.constructor()`, `.dispose()`, `.getAbstractFilePath()`, `.handleMutation()`, `.handleRename()`, `.matchesProjectConfig()`, `.resolveRelativeConfigPath()`, `.runChangeHandler()`, `.scheduleChange()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (8 nodes): `ServerSettingHelpModal.ts`, `ServerSettingHelpModal`, `.constructor()`, `.escapeHtml()`, `.getHelpContent()`, `.onClose()`, `.onOpen()`, `.tr()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (6 nodes): `FocusContextMarkdownViewLocator.ts`, `FocusContextMarkdownViewLocator`, `.constructor()`, `.getActiveMarkdownView()`, `.getMarkdownViews()`, `.rememberMarkdownFilePath()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (5 nodes): `ComposerContextEventBridge`, `.constructor()`, `.dispose()`, `.start()`, `ComposerContextEventBridge.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (5 nodes): `ContextFileCatalogEventBridge`, `.constructor()`, `.dispose()`, `.start()`, `ContextFileCatalogEventBridge.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `Community 0` to `Community 1`, `Community 2`, `Community 3`, `Community 4`, `Community 5`, `Community 6`, `Community 9`, `Community 11`, `Community 12`, `Community 13`, `Community 14`, `Community 16`, `Community 18`, `Community 20`, `Community 21`, `Community 22`, `Community 23`, `Community 25`, `Community 26`, `Community 27`, `Community 28`, `Community 29`, `Community 30`, `Community 32`, `Community 33`, `Community 36`, `Community 37`, `Community 39`, `Community 40`, `Community 45`, `Community 50`?**
  _High betweenness centrality (0.387) - this node is a cross-community bridge._
- **Why does `OpenCodianView` connect `Community 1` to `Community 0`, `Community 33`, `Community 2`, `Community 3`, `Community 5`, `Community 7`, `Community 40`, `Community 9`, `Community 12`, `Community 13`, `Community 23`, `Community 26`, `Community 30`?**
  _High betweenness centrality (0.099) - this node is a cross-community bridge._
- **Why does `OpenCodeService` connect `Community 8` to `Community 4`, `Community 7`, `Community 9`, `Community 10`, `Community 14`, `Community 20`, `Community 21`, `Community 27`, `Community 29`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **Are the 436 inferred relationships involving `t()` (e.g. with `.getEmptyConversationTitle()` and `.generateDefaultTitle()`) actually correct?**
  _`t()` has 436 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.02 - nodes in this community are weakly interconnected._