# Graph Report - src  (2026-04-27)

## Corpus Check
- 355 files · ~302,868 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 4691 nodes · 10447 edges · 48 communities detected
- Extraction: 74% EXTRACTED · 26% INFERRED · 0% AMBIGUOUS · INFERRED: 2738 edges (avg confidence: 0.8)
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

## God Nodes (most connected - your core abstractions)
1. `t()` - 437 edges
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
- `buildQuestionAnswerMarkdown()` --calls--> `t()`  [INFERRED]
  src\features\chat\runtime\QuestionResolutionCardRenderer.ts → src\i18n\index.ts
- `buildQuestionRejectedMarkdown()` --calls--> `t()`  [INFERRED]
  src\features\chat\runtime\QuestionResolutionCardRenderer.ts → src\i18n\index.ts
- `getQuestionResolutionAnswerText()` --calls--> `t()`  [INFERRED]
  src\features\chat\runtime\QuestionResolutionCardRenderer.ts → src\i18n\index.ts
- `assertModelExtraFieldKeyAllowed()` --calls--> `t()`  [INFERRED]
  src\features\settings\modelConfigWorkspace.ts → src\i18n\index.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.01
Nodes (61): AssistantNoticeCardRenderer, buildInterruptedAssistantNotice(), ConversationCompactionHelpModal, ConversationHistoryDialogService, t(), LiquidGlassSettingHelpModal, McpServerEditorModal, McpServerStatusModal (+53 more)

### Community 1 - "Community 1"
Cohesion: 0.01
Nodes (33): AssistantShellViewHostAdapter, applyPassiveScrollMeasurement(), applyUserScrollIntent(), getDistanceFromBottom(), getProgrammaticScrollGuardDelayMs(), hasProgrammaticScrollGuard(), isNearBottom(), createConversationHydrationRuntimeViewHosts() (+25 more)

### Community 2 - "Community 2"
Cohesion: 0.01
Nodes (34): AssistantShellRenderer, BackgroundTaskCompletionNoticeService, BackgroundTaskIndicatorCoordinator, BackgroundTaskInlinePanelRenderer, BackgroundTaskLiveSignalCoordinator, createBackgroundTaskLiveSignalCoordinatorHost(), BackgroundTaskNoticeStateService, BackgroundTaskStreamTriggerCoordinator (+26 more)

### Community 3 - "Community 3"
Cohesion: 0.02
Nodes (55): ConversationTurnViewModelBuilder, getMessageParentId(), getRecordString(), createSdkClient(), extractRenderableToolMetadata(), OpenCodeMessageNormalizationMapper, OpenCodeToolContentAssembler, resolveOpenCodeToolKind() (+47 more)

### Community 4 - "Community 4"
Cohesion: 0.02
Nodes (95): buildChatAppearanceCustomCss(), getChatAppearanceBackgroundSizeValue(), getChatAppearanceCssVariables(), getInputPanelGlassRefractionCssVariables(), areChatAppearanceSettingsEqual(), diffObject(), getBuiltinThemePresets(), getThemeAppearanceOverridesFromBase() (+87 more)

### Community 5 - "Community 5"
Cohesion: 0.02
Nodes (20): BackgroundConversationAttentionCoordinator, createEmptyTabContextState(), ContextDetailModal, ContextRing, ContextUsageService, ConversationHistoryActionsCoordinator, ConversationLoadRecoveryCoordinator, ConversationTabLifecycleRecoveryCoordinator (+12 more)

### Community 6 - "Community 6"
Cohesion: 0.02
Nodes (38): buildConversationMetaFromStoredRecord(), cloneConversationListDiagnostics(), ConversationMetadataCache, getUtf8ByteLength(), trackTopDiagnosticEntries(), isRecord(), cloneFormatterConfigValue(), readFormatterConfigValue() (+30 more)

### Community 7 - "Community 7"
Cohesion: 0.03
Nodes (12): OpenCodeEventSubscriptionCoordinator, cloneSettings(), OpenCodeServiceLifecycleCoordinator, normalizeDiffEntries(), normalizeMessageInfo(), normalizePart(), OpenCodeSyncEventRuntimeCoordinator, resolveSessionId() (+4 more)

### Community 8 - "Community 8"
Cohesion: 0.02
Nodes (10): OpenCodePromptRequestBuilder, buildCanonicalConversationFingerprintPayload(), cloneSettings(), getDebugTextPreview(), isPlainRecord(), OpenCodeService, cloneMessage(), clonePart() (+2 more)

### Community 9 - "Community 9"
Cohesion: 0.02
Nodes (20): OpenCodeCatalogQueryCoordinator, OpenCodeCatalogStateStore, normalizePermissionRequest(), normalizePermissionResponse(), normalizePermissionToolReference(), normalizeStringArray(), OpenCodeQuestionPermissionHub, appendSdkErrorStatus() (+12 more)

### Community 10 - "Community 10"
Cohesion: 0.02
Nodes (63): BackgroundTaskActivationIndicatorCoordinator, ConversationHydrationOutcomeBridge, ConversationHydrationRenderBridge, ConversationAssistantMessageRenderDelegate, ConversationMessageRenderDelegate, ConversationSyncedUpdateApplyDelegate, ConversationUserMessageRenderDelegate, getIncrementalRenderedMessageUpdate() (+55 more)

### Community 11 - "Community 11"
Cohesion: 0.03
Nodes (29): buildStreamErrorNotice(), renderAssistantNoticeCardAndFooter(), renderAssistantPlaceholderAsNotice(), renderPersistedAssistantNotice(), buildLocalStreamOutcome(), normalizeConversationSessionSettings(), ConversationAuthoritativeMessageMergeCoordinator, ConversationAuthoritativeReloadCoordinator (+21 more)

### Community 12 - "Community 12"
Cohesion: 0.02
Nodes (24): buildComposerContextChipStates(), createFocusContextPreview(), getContextTargetKey(), getPromptContextTargetKey(), removeDraftContextItemsByTarget(), resolveFocusContextPreview(), upsertDraftContextItem(), ComposerContextActionService (+16 more)

### Community 13 - "Community 13"
Cohesion: 0.03
Nodes (12): OpenCodianSettingTab, PermissionModeSelectorCoordinator, getActiveSecondaryTabId(), getPrimaryTabDefinition(), resolvePrimaryTabId(), resolveSecondaryTabId(), SettingsSectionCoordinator, SettingsTabbedRenderer (+4 more)

### Community 14 - "Community 14"
Cohesion: 0.04
Nodes (76): buildLobehubDefinitions(), buildOpencodeDefinitions(), computeMatchScore(), createDefinition(), findBuiltinIcon(), formatBuiltinSource(), getBuiltinIcon(), getDisplayName() (+68 more)

### Community 15 - "Community 15"
Cohesion: 0.03
Nodes (35): renderAssistantPlainTextFallbackContent(), renderAssistantStructuredContent(), QuestionDock, QuestionDockCoordinator, applyQuestionDockSelection(), getQuestionDockActiveInteractionState(), getQuestionDockDraftAnswers(), sanitizeQuestionDockAnswer() (+27 more)

### Community 16 - "Community 16"
Cohesion: 0.04
Nodes (36): ModelConfigModal, createModelConfigKeyValueState(), createModelConfigModalSnapshot(), isBlankProviderState(), parseAddProviderJsonDraft(), readProviderOptionString(), resolveModelConfigJsonDraftValue(), syncProviderFormFromJsonDraft() (+28 more)

### Community 17 - "Community 17"
Cohesion: 0.04
Nodes (39): clamp(), createStageLayerElement(), createSvgElement(), estimateProjectionDelta(), formatNumber(), generateFilterId(), GlassOctahedronDemoController, maxRenderQuality() (+31 more)

### Community 18 - "Community 18"
Cohesion: 0.04
Nodes (16): ChatHeaderPresenter, buildComposerInputSubmission(), ComposerInputShellCoordinator, parseCommandSubmission(), InputPanelAppearanceCoordinator, createComposerGlassFilterElement(), createSvgElement(), ensureComposerGlassSvgDefs() (+8 more)

### Community 19 - "Community 19"
Cohesion: 0.04
Nodes (4): SettingsModelCatalogCoordinator, SettingsModelCatalogPresenter, SettingsModelIconCacheManager, SettingsModelSection

### Community 20 - "Community 20"
Cohesion: 0.05
Nodes (48): ModelCatalogStateService, assembleModelCatalog(), assembleServerModelCatalog(), filterCatalogToProviderIds(), projectEffectiveCatalog(), resolveProviderAvailabilityProbePlan(), selectProviderProbeModelId(), filterCatalog() (+40 more)

### Community 21 - "Community 21"
Cohesion: 0.04
Nodes (9): ActiveTabContextUsageCoordinator, AgentInvocationService, ChatSelectionControlsCoordinator, getPerformanceTimestampMs(), buildOptimisticUserMessage(), MessageSendPreparationService, ModelSelectionRuntime, TabConversationActivationBridge (+1 more)

### Community 22 - "Community 22"
Cohesion: 0.04
Nodes (41): ContextFileCatalogBuildRunner, ContextFileCatalogIndex, createContextFileEntry(), ContextFileCatalogService, contextPathFromFileUrl(), isAbsoluteContextPath(), isWindowsDrivePath(), normalizeContextAttachmentPath() (+33 more)

### Community 23 - "Community 23"
Cohesion: 0.06
Nodes (72): measureDisplacementRangeAtUv(), add3(), applyEdgeBulge(), applyFilterLayerState(), bounds2(), buildBackdropFilterValue(), buildDisplacementTrace(), buildFallbackBackdropFilterValue() (+64 more)

### Community 24 - "Community 24"
Cohesion: 0.04
Nodes (35): registerBuiltinGlassAdapters(), getDefaultDebugModuleSettings(), isDebugModuleKey(), normalizeDebugModuleSettings(), normalizeDebugRefreshIntervalMs(), resolveDebugModuleKey(), setLocale(), createLogger() (+27 more)

### Community 25 - "Community 25"
Cohesion: 0.05
Nodes (48): applyDisplacementSnapshot(), applyHostTransform(), buildBackdropFilterValue(), buildFallbackBackdropFilterValue(), clamp(), createFaceSvgElement(), createStageLayerElement(), createState() (+40 more)

### Community 26 - "Community 26"
Cohesion: 0.05
Nodes (8): ConversationSessionSettingsModal, buildModelPickerGroups(), filterModelPickerGroups(), findModelPickerOption(), findModelPickerOptionByRef(), ModelPickerModal, normalizeChatFontSizePx(), SettingsConversationSection

### Community 27 - "Community 27"
Cohesion: 0.07
Nodes (44): applyFilterLayerStyles(), applyShellStyles(), buildBackdropFilterValue(), buildEdgeBandWeight(), buildFallbackBackdropFilterValue(), buildFilterLayerBoxShadow(), captureDatasetSnapshot(), captureStyleSnapshot() (+36 more)

### Community 28 - "Community 28"
Cohesion: 0.11
Nodes (48): applyBackdropFilterValue(), applyGlassTint(), applyInstanceMarker(), applyShellInteractiveStyles(), buildFallbackBackdropFilterValue(), buildSvgBackdropFilterValue(), clamp(), cleanupInstanceArtifacts() (+40 more)

### Community 29 - "Community 29"
Cohesion: 0.12
Nodes (47): add3(), buildClipPath(), buildDisplacementTrace(), clamp(), computeBounds(), convexHull(), createFace(), createGlassOctahedronProjectionContext() (+39 more)

### Community 30 - "Community 30"
Cohesion: 0.09
Nodes (2): BackgroundTaskTimelineAssemblyService, BackgroundTaskTimelineLaunchService

### Community 31 - "Community 31"
Cohesion: 0.13
Nodes (31): buildCommandScopedAgent(), cloneConfigObject(), cloneConfigValue(), getCommandScopedAgentId(), getCommandScopedAgentMetadata(), isCommandScopedAgentForCommand(), isCommandScopedAgentId(), mergeConfigObjects() (+23 more)

### Community 32 - "Community 32"
Cohesion: 0.07
Nodes (7): BackgroundConversationPostSyncHandoffCoordinator, BackgroundConversationPostSyncRefreshExecutor, BackgroundConversationSignalSyncStateCoordinator, PostSyncQuestionTodoRefreshFacade, PostSyncQuestionTodoRefreshPlanBuilder, VisibleConversationPostSyncCoordinator, VisibleConversationPostSyncStateCoordinator

### Community 33 - "Community 33"
Cohesion: 0.09
Nodes (11): extractAssistantStructuredTextCopyContent(), resolveAssistantCopyContent(), AssistantErrorRenderer, buildErrorAssistantFooterPayload(), buildNoticeAssistantFooterPayload(), buildPersistedAssistantFooterPayload(), buildPseudoStreamAssistantFooterPayload(), resolvePersistedAssistantFooterStatusLabel() (+3 more)

### Community 34 - "Community 34"
Cohesion: 0.11
Nodes (16): buildFragmentWithLinks(), createWikilinkElement(), createWikilinkPattern(), extractLinkTarget(), fileExistsInVault(), findWikilinks(), processFileLinks(), processTextNode() (+8 more)

### Community 35 - "Community 35"
Cohesion: 0.14
Nodes (1): ContextUsageDisplayService

### Community 36 - "Community 36"
Cohesion: 0.09
Nodes (5): ComposerContextViewFacade, createComposerContextServices(), ComposerContextViewHostAdapter, createFocusContextServices(), FocusContextViewHostAdapter

### Community 37 - "Community 37"
Cohesion: 0.15
Nodes (2): ChildSessionGraphCoordinator, ChildSessionGraphService

### Community 38 - "Community 38"
Cohesion: 0.14
Nodes (3): EffortSelector, isAdaptiveThinkingModel(), UserMessageFooterRenderer

### Community 39 - "Community 39"
Cohesion: 0.13
Nodes (4): AgentCatalogService, SurfaceAgentBuilder, SystemAgentGuardService, isSystemAgentId()

### Community 40 - "Community 40"
Cohesion: 0.19
Nodes (20): buildTrailingAssistantPatchCompletionDebugPlan(), buildTrailingAssistantPatchCompletionDebugPlanFromTailOutcomePlanningContext(), buildTrailingAssistantPatchCompletionDebugPlanningContext(), buildTrailingAssistantPatchCompletionDebugPlanningContextInputs(), buildTrailingAssistantPatchCompletionDebugPlanningContextShape(), buildTrailingAssistantPatchCompletionDebugPlanningContextSourceContract(), buildTrailingAssistantPatchCompletionDebugSourceContractFromTailOutcomePlanningContext(), buildTrailingAssistantPatchCompletionDebugSummaryPlan() (+12 more)

### Community 41 - "Community 41"
Cohesion: 0.15
Nodes (13): createBackgroundConversationPostSyncHandoffServices(), createBackgroundConversationPostSyncHandoffViewHostAdapter(), createPostSyncQuestionTodoRefreshHosts(), createPostSyncQuestionTodoRefreshServices(), createQuestionTodoBackgroundTaskActivationHosts(), createQuestionTodoBackgroundTaskActivationServices(), createQuestionTodoBackgroundTaskActivationViewHostAdapter(), createQuestionTodoBackgroundTaskRefreshServices() (+5 more)

### Community 42 - "Community 42"
Cohesion: 0.26
Nodes (1): TabBar

### Community 43 - "Community 43"
Cohesion: 0.2
Nodes (6): buildModelOptionValue(), parseModelOptionValue(), scrollToCurrentModel(), selectHighlightedModel(), renderModelList(), bindModelSelectorStickyHeaders()

### Community 44 - "Community 44"
Cohesion: 0.44
Nodes (8): formatMcpSummaryField(), getFirstScalarMcpFallback(), getMcpSummaryFromFields(), getMcpToolSummary(), getPathTail(), resolveMcpSummaryCategory(), tokenizeMcpToolName(), truncateMcpSummaryText()

### Community 45 - "Community 45"
Cohesion: 0.4
Nodes (1): FocusContextMarkdownViewLocator

### Community 46 - "Community 46"
Cohesion: 0.4
Nodes (1): ComposerContextEventBridge

### Community 47 - "Community 47"
Cohesion: 0.4
Nodes (1): ContextFileCatalogEventBridge

## Knowledge Gaps
- **Thin community `Community 30`** (42 nodes): `BackgroundTaskTimelineAssemblyService`, `.addCompletionToSegment()`, `.applyReminderToSegment()`, `.captureUserSegmentAnchor()`, `.collectCompletionReminderSegments()`, `.collectDiagnostics()`, `.collectMessageSegments()`, `.collectSegments()`, `.collectTaskLaunchBlock()`, `.constructor()`, `.createEmptySegment()`, `.createSegment()`, `.createSegmentCollectionState()`, `.finalizeCollectedSegments()`, `.finalizeSegment()`, `.findBackgroundTaskAnchorIndex()`, `.findSegmentByTaskId()`, `.getLatestSearchModeSegment()`, `.getLatestSegmentWithActivity()`, `.getOrCreateRuntimeSegment()`, `.getOrCreateSegment()`, `.getPendingLaunches()`, `.isBackgroundTaskCompletionReminder()`, `.isSearchModeAnchorMessage()`, `.mergeRuntimeSegmentState()`, `.mergeSegmentCompletions()`, `.mergeSegmentLaunches()`, `.resolvePendingState()`, `.resolveReminderSegments()`, `.segmentHasTaskActivity()`, `.upsertLaunch()`, `.upsertSegmentLaunch()`, `BackgroundTaskTimelineLaunchService`, `.addCompletedTasksFromMessage()`, `.extractBackgroundTaskId()`, `.filterPendingLaunches()`, `.getBackgroundTaskDescription()`, `.isLaunchMatchedByCompletion()`, `.upsertLaunch()`, `BackgroundTaskTimelineAssemblyService.ts`, `BackgroundTaskTimelineLaunchService.ts`, `.getMessageAnchorKey()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (28 nodes): `ContextUsageDisplayService`, `.buildBreakdownSegments()`, `.buildDisplayTokenBreakdown()`, `.calculatePercentage()`, `.collectBreakdownChars()`, `.estimateBreakdownTokens()`, `.estimateTokens()`, `.fitBreakdownTokens()`, `.formatCurrency()`, `.formatNumber()`, `.formatPercent()`, `.getAssistantCharsFromMessage()`, `.getAssistantCharsFromPart()`, `.getContextBreakdown()`, `.getDisplaySnapshot()`, `.getDisplayTokenBreakdown()`, `.getNestedStringField()`, `.getObjectField()`, `.getParts()`, `.getStringField()`, `.getToolChars()`, `.getUnknownField()`, `.getUserCharsFromMessage()`, `.getUserCharsFromPart()`, `.isRecord()`, `.stringifyUnknown()`, `.summarize()`, `ContextUsageDisplayService.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (23 nodes): `ChildSessionGraphCoordinator`, `.clearGraph()`, `.constructor()`, `.getGraph()`, `.refreshGraph()`, `ChildSessionGraphService`, `.buildEdge()`, `.canonicalizeToolName()`, `.computeGraphStatus()`, `.deduplicateEdges()`, `.enrichEdgesWithChildSessions()`, `.extractSessionId()`, `.findOrphanedSessions()`, `.isTaskToolBlock()`, `.isTaskToolCall()`, `.reconstructGraph()`, `.resolveEdgeStatus()`, `.tryBuildEdgeFromBlock()`, `.tryBuildEdgeFromToolCall()`, `ChildSessionGraphService.ts`, `ChildSessionGraphCoordinator.ts`, `.getSessionChildren()`, `.loadConversation()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (15 nodes): `TabBar.ts`, `TabBar`, `.attachTooltipLabel()`, `.closeOverflowMenu()`, `.constructor()`, `.destroy()`, `.getMaxVisibleTabs()`, `.openOverflowMenu()`, `.partitionItems()`, `.positionOverflowMenu()`, `.render()`, `.renderBackgroundTaskState()`, `.renderOverflowButton()`, `.renderTabItem()`, `.shouldOpenOverflowAbove()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (6 nodes): `FocusContextMarkdownViewLocator.ts`, `FocusContextMarkdownViewLocator`, `.constructor()`, `.getActiveMarkdownView()`, `.getMarkdownViews()`, `.rememberMarkdownFilePath()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (5 nodes): `ComposerContextEventBridge`, `.constructor()`, `.dispose()`, `.start()`, `ComposerContextEventBridge.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (5 nodes): `ContextFileCatalogEventBridge`, `.constructor()`, `.dispose()`, `.start()`, `ContextFileCatalogEventBridge.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `Community 0` to `Community 1`, `Community 2`, `Community 4`, `Community 5`, `Community 6`, `Community 8`, `Community 9`, `Community 10`, `Community 11`, `Community 12`, `Community 13`, `Community 14`, `Community 15`, `Community 16`, `Community 18`, `Community 19`, `Community 20`, `Community 21`, `Community 22`, `Community 24`, `Community 25`, `Community 26`, `Community 30`, `Community 33`, `Community 35`, `Community 38`, `Community 42`?**
  _High betweenness centrality (0.427) - this node is a cross-community bridge._
- **Why does `OpenCodianView` connect `Community 1` to `Community 0`, `Community 2`, `Community 3`, `Community 4`, `Community 5`, `Community 37`, `Community 38`, `Community 9`, `Community 10`, `Community 11`, `Community 12`, `Community 13`, `Community 15`, `Community 17`, `Community 18`, `Community 21`, `Community 30`?**
  _High betweenness centrality (0.124) - this node is a cross-community bridge._
- **Why does `OpenCodeService` connect `Community 8` to `Community 0`, `Community 3`, `Community 6`, `Community 7`, `Community 9`, `Community 11`, `Community 15`, `Community 19`, `Community 20`, `Community 27`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **Are the 436 inferred relationships involving `t()` (e.g. with `.getEmptyConversationTitle()` and `.generateDefaultTitle()`) actually correct?**
  _`t()` has 436 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._