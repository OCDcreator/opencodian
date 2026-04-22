# Graph Report - opencodian  (2026-04-23)

## Corpus Check
- 697 files · ~888,203 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 5816 nodes · 12163 edges · 91 communities detected
- Extraction: 70% EXTRACTED · 30% INFERRED · 0% AMBIGUOUS · INFERRED: 3640 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 85|Community 85]]
- [[_COMMUNITY_Community 87|Community 87]]
- [[_COMMUNITY_Community 88|Community 88]]
- [[_COMMUNITY_Community 97|Community 97]]
- [[_COMMUNITY_Community 102|Community 102]]
- [[_COMMUNITY_Community 103|Community 103]]
- [[_COMMUNITY_Community 105|Community 105]]
- [[_COMMUNITY_Community 106|Community 106]]
- [[_COMMUNITY_Community 107|Community 107]]
- [[_COMMUNITY_Community 108|Community 108]]
- [[_COMMUNITY_Community 109|Community 109]]
- [[_COMMUNITY_Community 111|Community 111]]
- [[_COMMUNITY_Community 112|Community 112]]
- [[_COMMUNITY_Community 113|Community 113]]
- [[_COMMUNITY_Community 115|Community 115]]
- [[_COMMUNITY_Community 116|Community 116]]
- [[_COMMUNITY_Community 117|Community 117]]
- [[_COMMUNITY_Community 118|Community 118]]
- [[_COMMUNITY_Community 130|Community 130]]
- [[_COMMUNITY_Community 131|Community 131]]
- [[_COMMUNITY_Community 152|Community 152]]
- [[_COMMUNITY_Community 155|Community 155]]
- [[_COMMUNITY_Community 156|Community 156]]
- [[_COMMUNITY_Community 165|Community 165]]

## God Nodes (most connected - your core abstractions)
1. `t()` - 367 edges
2. `OpenCodianView` - 246 edges
3. `OpenCodeService` - 149 edges
4. `OpenCodianPlugin` - 88 edges
5. `ServerManager` - 81 edges
6. `SettingsModelCatalogPresenter` - 54 edges
7. `OpenCodeStreamingRuntimeCoordinator` - 52 edges
8. `OpenCodeCatalogQueryCoordinator` - 50 edges
9. `ConversationTabRuntimeCoordinator` - 45 edges
10. `clean_string()` - 39 edges

## Surprising Connections (you probably didn't know these)
- `normalizeSessionCommandPath()` --calls--> `normalizeContextPath()`  [INFERRED]
  src\core\opencode\OpenCodeSessionControlOrchestrator.ts → src\shared\contextPath.ts
- `persistLocalStreamOutcome()` --calls--> `mapStreamingContentBlocksToMessageContentBlocks()`  [INFERRED]
  src\features\chat\runtime\LocalStreamMessagePersistence.ts → src\features\chat\runtime\sendPipelineContent.ts
- `buildQuestionAnswerMarkdown()` --calls--> `t()`  [INFERRED]
  src\features\chat\runtime\QuestionResolutionCardRenderer.ts → src\i18n\index.ts
- `buildQuestionRejectedMarkdown()` --calls--> `t()`  [INFERRED]
  src\features\chat\runtime\QuestionResolutionCardRenderer.ts → src\i18n\index.ts
- `getQuestionResolutionAnswerText()` --calls--> `t()`  [INFERRED]
  src\features\chat\runtime\QuestionResolutionCardRenderer.ts → src\i18n\index.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.01
Nodes (78): createHost(), AssistantNoticeCardRenderer, buildStreamErrorNotice(), renderAssistantNoticeCardAndFooter(), renderAssistantPlaceholderAsNotice(), renderPersistedAssistantNotice(), AssistantShellViewHostAdapter, applyPassiveScrollMeasurement() (+70 more)

### Community 1 - "Community 1"
Cohesion: 0.01
Nodes (46): buildInterruptedAssistantNotice(), buildChatAppearanceCustomCss(), getChatAppearanceBackgroundSizeValue(), getChatAppearanceCssVariables(), getInputPanelGlassRefractionCssVariables(), ContextFileCatalogEventBridge, FocusContextEventBridge, t() (+38 more)

### Community 2 - "Community 2"
Cohesion: 0.02
Nodes (31): AssistantShellRenderer, BackgroundTaskCompletionNoticeService, BackgroundTaskIndicatorCoordinator, BackgroundTaskInlinePanelRenderer, BackgroundTaskLiveSignalCoordinator, createBackgroundTaskLiveSignalCoordinatorHost(), BackgroundTaskNoticeStateService, BackgroundTaskStreamTriggerCoordinator (+23 more)

### Community 3 - "Community 3"
Cohesion: 0.02
Nodes (49): extractRenderableToolMetadata(), OpenCodeMessageNormalizationMapper, OpenCodeToolContentAssembler, resolveOpenCodeToolKind(), resolveToolResultVisibility(), extractRenderableToolMetadata(), extractStructuredErrorMessage(), extractStructuredErrorName() (+41 more)

### Community 4 - "Community 4"
Cohesion: 0.01
Nodes (53): ActiveTabContextUsageCoordinator, BackgroundConversationAttentionCoordinator, BackgroundTaskActivationIndicatorCoordinator, ConversationHistoryActionsCoordinator, ConversationHistoryDialogService, ConversationHydrationOutcomeBridge, ConversationLoadRecoveryCoordinator, createConversation() (+45 more)

### Community 5 - "Community 5"
Cohesion: 0.02
Nodes (94): registerBuiltinGlassAdapters(), FocusContextMarkdownViewLocator, createView(), areChatAppearanceSettingsEqual(), diffObject(), getBuiltinThemePresets(), getThemeAppearanceOverridesFromBase(), getThemePresetDefinition() (+86 more)

### Community 6 - "Community 6"
Cohesion: 0.03
Nodes (173): acquire_lock(), autopilot_lock(), build_cli_parser_support(), build_parser(), main(), new_state(), read_lock(), release_lock() (+165 more)

### Community 7 - "Community 7"
Cohesion: 0.02
Nodes (18): hydrateCanonicalChatMessage(), createHost(), OpenCodePromptRequestBuilder, buildCanonicalConversationFingerprintPayload(), cloneSettings(), getDebugTextPreview(), isPlainRecord(), OpenCodeService (+10 more)

### Community 8 - "Community 8"
Cohesion: 0.03
Nodes (15): OpenCodeEventSubscriptionCoordinator, cloneSettings(), OpenCodeServiceLifecycleCoordinator, cloneSettings(), createHost(), createSettingsHarness(), normalizeDiffEntries(), normalizeMessageInfo() (+7 more)

### Community 9 - "Community 9"
Cohesion: 0.02
Nodes (17): normalizeConversationSessionSettings(), buildConversationMetaFromStoredRecord(), cloneConversationListDiagnostics(), ConversationMetadataCache, getUtf8ByteLength(), trackTopDiagnosticEntries(), ConversationSessionSettingsCoordinator, normalizePath() (+9 more)

### Community 10 - "Community 10"
Cohesion: 0.02
Nodes (74): createHarness(), createSegment(), createService(), createReminderMessage(), clamp(), createStageLayerElement(), createSvgElement(), estimateProjectionDelta() (+66 more)

### Community 11 - "Community 11"
Cohesion: 0.02
Nodes (58): BackgroundTaskTimelineAssemblyService, BackgroundTaskTimelineLaunchService, createSdkClient(), buildFragmentWithLinks(), createWikilinkElement(), createWikilinkPattern(), extractLinkTarget(), fileExistsInVault() (+50 more)

### Community 12 - "Community 12"
Cohesion: 0.03
Nodes (97): buildLobehubDefinitions(), buildOpencodeDefinitions(), computeMatchScore(), createDefinition(), findBuiltinIcon(), formatBuiltinSource(), getBuiltinIcon(), getDisplayName() (+89 more)

### Community 13 - "Community 13"
Cohesion: 0.03
Nodes (15): OpenCodeCatalogQueryCoordinator, OpenCodeCatalogStateStore, OpenCodeQuestionPermissionHub, appendSdkErrorStatus(), describeSdkError(), extractSdkErrorMessage(), getSdkErrorRecordBaseMessage(), getSdkErrorRecordStatusCode() (+7 more)

### Community 14 - "Community 14"
Cohesion: 0.03
Nodes (23): buildComposerContextChipStates(), createFocusContextPreview(), getContextTargetKey(), getPromptContextTargetKey(), removeDraftContextItemsByTarget(), resolveFocusContextPreview(), upsertDraftContextItem(), ComposerContextActionService (+15 more)

### Community 15 - "Community 15"
Cohesion: 0.03
Nodes (21): ChatSelectionControlsCoordinator, filterModelPickerGroups(), ModelPickerModal, buildModelOptionValue(), highlightModelOption(), parseModelOptionValue(), scrollToCurrentModel(), selectHighlightedModel() (+13 more)

### Community 16 - "Community 16"
Cohesion: 0.04
Nodes (37): ModelConfigModal, createModelConfigKeyValueState(), createModelConfigModalSnapshot(), isBlankProviderState(), parseAddProviderJsonDraft(), readProviderOptionString(), resolveModelConfigJsonDraftValue(), syncProviderFormFromJsonDraft() (+29 more)

### Community 17 - "Community 17"
Cohesion: 0.04
Nodes (74): InputPanelAppearanceCoordinator, InputPanelThemeRuntime, measureDisplacementRangeAtUv(), add3(), applyEdgeBulge(), applyFilterLayerState(), bounds2(), buildBackdropFilterValue() (+66 more)

### Community 18 - "Community 18"
Cohesion: 0.04
Nodes (52): QuestionDockCoordinator, createEmptyQuestionDockRenderPayload(), createQuestionDockRenderPayload(), QuestionDockSlotCoordinator, getAllGlassAdapters(), getGlassAdapter(), unregisterGlassAdapter(), buildNextHiddenSlashCommands() (+44 more)

### Community 19 - "Community 19"
Cohesion: 0.03
Nodes (27): ChatHeaderPresenter, createFixture(), createCatalogBundle(), createFixture(), settleAsyncWork(), createHarness(), buildComposerInputSubmission(), ComposerInputShellCoordinator (+19 more)

### Community 20 - "Community 20"
Cohesion: 0.05
Nodes (51): ModelCatalogStateService, assembleModelCatalog(), assembleServerModelCatalog(), filterCatalogToProviderIds(), projectEffectiveCatalog(), resolveProviderAvailabilityProbePlan(), selectProviderProbeModelId(), collectCurrentEnabledProviderIds() (+43 more)

### Community 21 - "Community 21"
Cohesion: 0.04
Nodes (25): formatMcpSummaryField(), getFirstScalarMcpFallback(), getMcpSummaryFromFields(), getMcpToolSummary(), getPathTail(), resolveMcpSummaryCategory(), tokenizeMcpToolName(), truncateMcpSummaryText() (+17 more)

### Community 22 - "Community 22"
Cohesion: 0.04
Nodes (41): ContextFileCatalogBuildRunner, ContextFileCatalogIndex, createContextFileEntry(), ContextFileCatalogService, contextPathFromFileUrl(), isAbsoluteContextPath(), isWindowsDrivePath(), normalizeContextAttachmentPath() (+33 more)

### Community 23 - "Community 23"
Cohesion: 0.05
Nodes (55): buildCommandScopedAgent(), cloneConfigObject(), cloneConfigValue(), getCommandScopedAgentId(), getCommandScopedAgentMetadata(), isCommandScopedAgentForCommand(), isCommandScopedAgentId(), mergeConfigObjects() (+47 more)

### Community 24 - "Community 24"
Cohesion: 0.04
Nodes (50): TrailingAssistantPatchPlanningDelegate, buildMessageRenderGroups(), flattenContentBlocks(), isMergeableAssistantMessage(), mergeAssistantMessagesForRender(), createRuntimeState(), ResizeObserverMock, buildTrailingAssistantPatchCompletionDebugLoggingContext() (+42 more)

### Community 25 - "Community 25"
Cohesion: 0.06
Nodes (27): ConversationAuthoritativeMessageMergeCoordinator, ConversationAuthoritativeReloadCoordinator, findLatestInterruptedNotice(), findLatestUserBeforeTimestamp(), isInterruptedNoticeMessage(), shouldBypassCanonicalSyncForInterruptedNotice(), shouldPreserveInterruptedNoticeOnSync(), buildTrailingAssistantPatchCompletionDebugPlan() (+19 more)

### Community 26 - "Community 26"
Cohesion: 0.11
Nodes (49): add3(), buildClipPath(), buildDisplacementTrace(), buildGlassOctahedronBackdropFilterValue(), buildGlassOctahedronLightBackdropFilterValue(), clamp(), computeBounds(), convexHull() (+41 more)

### Community 27 - "Community 27"
Cohesion: 0.06
Nodes (14): renderAssistantPlainTextFallbackContent(), renderAssistantStructuredContent(), PermissionInlineCardRenderer, QuestionInlineCardRenderer, appendQuestionResolutionCard(), appendQuestionResolutionCardFromRenderPlan(), buildQuestionAnswerMarkdown(), buildQuestionRejectedMarkdown() (+6 more)

### Community 28 - "Community 28"
Cohesion: 0.11
Nodes (48): applyBackdropFilterValue(), applyGlassTint(), applyInstanceMarker(), applyShellInteractiveStyles(), buildFallbackBackdropFilterValue(), buildSvgBackdropFilterValue(), clamp(), cleanupInstanceArtifacts() (+40 more)

### Community 29 - "Community 29"
Cohesion: 0.08
Nodes (5): ContextDetailModal, ContextRing, ContextUsageService, getLocale(), getDefaultContextWindow()

### Community 30 - "Community 30"
Cohesion: 0.05
Nodes (8): ItemView, MarkdownView, Notice, Plugin, PluginSettingTab, TFile, TFolder, WorkspaceLeaf

### Community 31 - "Community 31"
Cohesion: 0.07
Nodes (7): BackgroundConversationPostSyncHandoffCoordinator, BackgroundConversationPostSyncRefreshExecutor, BackgroundConversationSignalSyncStateCoordinator, PostSyncQuestionTodoRefreshFacade, PostSyncQuestionTodoRefreshPlanBuilder, VisibleConversationPostSyncCoordinator, VisibleConversationPostSyncStateCoordinator

### Community 32 - "Community 32"
Cohesion: 0.11
Nodes (23): aggregateDocsFromRequirements(), collectDocFiles(), collectSourceFilesForGroup(), collectSourceMappings(), docIgnoredByGroup(), escapeRegex(), findGroupForSource(), globToRegExp() (+15 more)

### Community 33 - "Community 33"
Cohesion: 0.07
Nodes (8): createHarness(), createRuntimeState(), ComposerContextViewFacade, createComposerContextServices(), ComposerContextViewHostAdapter, createFocusContextServices(), createHarness(), FocusContextViewHostAdapter

### Community 34 - "Community 34"
Cohesion: 0.09
Nodes (11): extractAssistantStructuredTextCopyContent(), resolveAssistantCopyContent(), AssistantErrorRenderer, buildErrorAssistantFooterPayload(), buildNoticeAssistantFooterPayload(), buildPersistedAssistantFooterPayload(), buildPseudoStreamAssistantFooterPayload(), resolvePersistedAssistantFooterStatusLabel() (+3 more)

### Community 35 - "Community 35"
Cohesion: 0.14
Nodes (1): ContextUsageDisplayService

### Community 36 - "Community 36"
Cohesion: 0.14
Nodes (15): Get-CleanString(), Get-CodexEventSummary(), Get-CodexItemSummary(), Get-CommitFiles(), Get-CompactText(), Get-WorkingTreeDirty(), Invoke-CodexRound(), Invoke-Git() (+7 more)

### Community 37 - "Community 37"
Cohesion: 0.12
Nodes (16): createBackgroundConversationPostSyncHandoffServices(), createBackgroundConversationPostSyncHandoffViewHostAdapter(), createPostSyncQuestionTodoRefreshHosts(), createPostSyncQuestionTodoRefreshServices(), createQuestionTodoBackgroundTaskActivationHosts(), createQuestionTodoBackgroundTaskActivationServices(), createQuestionTodoBackgroundTaskActivationViewHostAdapter(), createQuestionTodoBackgroundTaskRefreshServices() (+8 more)

### Community 38 - "Community 38"
Cohesion: 0.14
Nodes (3): EffortSelector, isAdaptiveThinkingModel(), UserMessageFooterRenderer

### Community 39 - "Community 39"
Cohesion: 0.23
Nodes (1): ConversationSessionSettingsModal

### Community 40 - "Community 40"
Cohesion: 0.14
Nodes (1): createSection()

### Community 41 - "Community 41"
Cohesion: 0.23
Nodes (10): add_doctor_subcommand(), add_restart_subcommand(), add_start_subcommand(), add_status_subcommand(), add_version_subcommand(), add_watch_subcommand(), build_parser(), CliParserSupport (+2 more)

### Community 42 - "Community 42"
Cohesion: 0.18
Nodes (3): createApp(), createPlugin(), createSection()

### Community 43 - "Community 43"
Cohesion: 0.17
Nodes (2): createConfigManager(), renderEditor()

### Community 44 - "Community 44"
Cohesion: 0.17
Nodes (1): createSection()

### Community 45 - "Community 45"
Cohesion: 0.17
Nodes (1): createSection()

### Community 46 - "Community 46"
Cohesion: 0.21
Nodes (5): createButtonRecord(), createSection(), createTextRecord(), createToggleRecord(), mockSettingPrototype()

### Community 47 - "Community 47"
Cohesion: 0.35
Nodes (10): createBackgroundTaskIndicatorCoordinator(), createBackgroundTaskLiveSignalCoordinator(), createConversation(), createConversationSyncRuntime(), createFixture(), createQuestionDockCoordinator(), createQuestionDockSlotCoordinator(), createRuntime() (+2 more)

### Community 48 - "Community 48"
Cohesion: 0.27
Nodes (4): generateBuildId(), getGitBranch(), getLocalTimeStamp(), sanitizeBranchName()

### Community 49 - "Community 49"
Cohesion: 0.2
Nodes (3): hydrateCanonicalMessage(), hydrateCanonicalMessage(), createMessage()

### Community 50 - "Community 50"
Cohesion: 0.28
Nodes (3): createConversation(), createPreparedSend(), createUserMessage()

### Community 51 - "Community 51"
Cohesion: 0.39
Nodes (7): createBackgroundTaskPort(), createConversationStatePort(), createConversationSyncPort(), createFixture(), createQuestionTodoPort(), createTabRuntimePort(), createViewWritebackPort()

### Community 53 - "Community 53"
Cohesion: 0.39
Nodes (1): ServerSettingHelpModal

### Community 54 - "Community 54"
Cohesion: 0.32
Nodes (3): createConversation(), createHost(), createSyncResult()

### Community 57 - "Community 57"
Cohesion: 0.48
Nodes (4): createConversation(), createRuntime(), createViewHost(), createViewHostAdapterHost()

### Community 58 - "Community 58"
Cohesion: 0.29
Nodes (1): ResizeObserverMock

### Community 60 - "Community 60"
Cohesion: 0.47
Nodes (4): buildCodeFence(), prepareUserMessageMarkdownForDisplay(), replaceOutsideMarkdownCode(), trimFenceContent()

### Community 62 - "Community 62"
Cohesion: 0.47
Nodes (3): createConversation(), createFixture(), createHost()

### Community 65 - "Community 65"
Cohesion: 0.4
Nodes (2): createFile(), createMarkdownView()

### Community 67 - "Community 67"
Cohesion: 0.33
Nodes (1): renderConversationSettings()

### Community 70 - "Community 70"
Cohesion: 0.4
Nodes (1): ComposerContextEventBridge

### Community 71 - "Community 71"
Cohesion: 0.5
Nodes (3): createMockSdkClient(), createOpenCodeServiceTestContext(), MockEventSource

### Community 75 - "Community 75"
Cohesion: 0.5
Nodes (2): createHost(), createStreamEventTransformer()

### Community 79 - "Community 79"
Cohesion: 0.5
Nodes (2): createConversation(), createPreparedSend()

### Community 80 - "Community 80"
Cohesion: 0.5
Nodes (2): createConversation(), createHost()

### Community 81 - "Community 81"
Cohesion: 0.5
Nodes (2): createConversation(), createHost()

### Community 84 - "Community 84"
Cohesion: 0.5
Nodes (2): createConversation(), createHost()

### Community 85 - "Community 85"
Cohesion: 0.5
Nodes (2): createFile(), createMarkdownView()

### Community 87 - "Community 87"
Cohesion: 0.5
Nodes (2): createFixture(), createRuntime()

### Community 88 - "Community 88"
Cohesion: 0.5
Nodes (2): getModalState(), getSelectedProviderState()

### Community 97 - "Community 97"
Cohesion: 0.67
Nodes (2): createCoordinator(), createRuntime()

### Community 102 - "Community 102"
Cohesion: 0.67
Nodes (2): createHost(), createRuntime()

### Community 103 - "Community 103"
Cohesion: 0.67
Nodes (2): createBridgeParts(), createSyncResult()

### Community 105 - "Community 105"
Cohesion: 0.67
Nodes (2): createConversation(), createHost()

### Community 106 - "Community 106"
Cohesion: 0.67
Nodes (2): createFixture(), createPaneCoordinator()

### Community 107 - "Community 107"
Cohesion: 0.67
Nodes (2): createFile(), createMarkdownView()

### Community 108 - "Community 108"
Cohesion: 0.67
Nodes (2): createCatalogBundle(), createRuntimeFixture()

### Community 109 - "Community 109"
Cohesion: 0.83
Nodes (3): createConversation(), createRuntime(), createViewHost()

### Community 111 - "Community 111"
Cohesion: 0.67
Nodes (2): createHost(), createRuntimeState()

### Community 112 - "Community 112"
Cohesion: 0.83
Nodes (3): createFacade(), createQuestionRequest(), createRuntimeState()

### Community 113 - "Community 113"
Cohesion: 0.67
Nodes (2): createQuestionRequest(), createResolution()

### Community 115 - "Community 115"
Cohesion: 0.67
Nodes (2): createFactoryFixture(), createQuestionRequest()

### Community 116 - "Community 116"
Cohesion: 0.67
Nodes (2): createHost(), createRuntime()

### Community 117 - "Community 117"
Cohesion: 0.67
Nodes (2): createHost(), createRuntimeCommand()

### Community 118 - "Community 118"
Cohesion: 0.67
Nodes (2): model(), provider()

### Community 130 - "Community 130"
Cohesion: 1.0
Nodes (2): createConversation(), createCoordinator()

### Community 131 - "Community 131"
Cohesion: 1.0
Nodes (2): createFixture(), createRuntime()

### Community 152 - "Community 152"
Cohesion: 1.0
Nodes (2): createCoordinator(), createQuestionRequest()

### Community 155 - "Community 155"
Cohesion: 1.0
Nodes (2): createHost(), createRuntime()

### Community 156 - "Community 156"
Cohesion: 1.0
Nodes (2): createConversation(), createHost()

### Community 165 - "Community 165"
Cohesion: 1.0
Nodes (1): Repo-local autopilot support modules.

## Knowledge Gaps
- **5 isolated node(s):** `Repo-local autopilot support modules.`, `ResizeObserverMock`, `TFile`, `MarkdownView`, `TFolder`
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 35`** (28 nodes): `ContextUsageDisplayService`, `.buildBreakdownSegments()`, `.buildDisplayTokenBreakdown()`, `.calculatePercentage()`, `.collectBreakdownChars()`, `.estimateBreakdownTokens()`, `.estimateTokens()`, `.fitBreakdownTokens()`, `.formatCurrency()`, `.formatNumber()`, `.formatPercent()`, `.getAssistantCharsFromMessage()`, `.getAssistantCharsFromPart()`, `.getContextBreakdown()`, `.getDisplaySnapshot()`, `.getDisplayTokenBreakdown()`, `.getNestedStringField()`, `.getObjectField()`, `.getParts()`, `.getStringField()`, `.getToolChars()`, `.getUnknownField()`, `.getUserCharsFromMessage()`, `.getUserCharsFromPart()`, `.isRecord()`, `.stringifyUnknown()`, `.summarize()`, `ContextUsageDisplayService.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (15 nodes): `ConversationSessionSettingsModal`, `.constructor()`, `.createAutoCompactionButton()`, `.createAutoCompactionField()`, `.createFieldShell()`, `.createHero()`, `.createNumberField()`, `.createSection()`, `.handleSave()`, `.onClose()`, `.onOpen()`, `.setBusy()`, `.setError()`, `.syncAutoCompactionButtons()`, `ConversationSessionSettingsModal.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (14 nodes): `createButtonRecord()`, `createDropdownRecord()`, `createPlugin()`, `createRuntimeAgent()`, `createSection()`, `createSectionHeading()`, `createTextAreaRecord()`, `createTextRecord()`, `createToggleRecord()`, `findButton()`, `findDropdown()`, `findToggle()`, `flushAsync()`, `SettingsAgentsSection.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (13 nodes): `createButtonRecord()`, `createConfigManager()`, `createDropdownRecord()`, `createTextAreaRecord()`, `createTextRecord()`, `createToggleRecord()`, `findButton()`, `findDropdown()`, `findText()`, `findTextArea()`, `flushAsync()`, `renderEditor()`, `SettingsProjectAgentEditor.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (12 nodes): `createButtonRecord()`, `createDropdownRecord()`, `createPlugin()`, `createRuntimeCommand()`, `createSection()`, `createSectionHeading()`, `createTextAreaRecord()`, `createTextRecord()`, `createToggleRecord()`, `findToggle()`, `flushAsync()`, `SettingsCommandsSection.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (12 nodes): `createButtonControl()`, `createDropdownRecord()`, `createExtraButtonControl()`, `createPlugin()`, `createSection()`, `createSectionHeading()`, `createTextRecord()`, `createToggleRecord()`, `findText()`, `findToggle()`, `refreshTitleModelsCallback()`, `SettingsConversationSection.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (8 nodes): `ServerSettingHelpModal`, `.constructor()`, `.escapeHtml()`, `.getHelpContent()`, `.onClose()`, `.onOpen()`, `.tr()`, `ServerSettingHelpModal.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 58`** (7 nodes): `createCanvasContextMock()`, `createMountContext()`, `createSettings()`, `normalize3()`, `ResizeObserverMock`, `.constructor()`, `shudingDiamond.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 65`** (6 nodes): `createEditor()`, `createFile()`, `createHarness()`, `createMarkdownView()`, `createSelectionPreview()`, `RetainedSelectionHighlightService.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 67`** (6 nodes): `createButtonRecord()`, `createDropdownRecord()`, `createExtraButtonRecord()`, `createToggleRecord()`, `renderConversationSettings()`, `OpenCodianConversationSettings.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 70`** (5 nodes): `ComposerContextEventBridge`, `.constructor()`, `.dispose()`, `.start()`, `ComposerContextEventBridge.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 75`** (5 nodes): `createHost()`, `createRawSseFetchMock()`, `createSseFetchMock()`, `createStreamEventTransformer()`, `OpenCodeStreamingRuntimeCoordinator.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 79`** (5 nodes): `createConversation()`, `createPreparedSend()`, `createRoutedStream()`, `createRuntime()`, `buildLocalStreamOutcome.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 80`** (5 nodes): `createConversation()`, `createHost()`, `createMessage()`, `createPort()`, `ConversationLoadRecoveryCoordinator.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 81`** (5 nodes): `appendAssistantTail()`, `createConversation()`, `createHost()`, `createMessage()`, `ConversationRenderService.testSupport.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 84`** (5 nodes): `createConversation()`, `createHost()`, `createPort()`, `createTabManagerStub()`, `ConversationTabOpenCoordinator.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 85`** (5 nodes): `createEditor()`, `createFile()`, `createMarkdownView()`, `createServiceHarness()`, `FocusContextRuntimeService.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 87`** (5 nodes): `createFixture()`, `createRuntime()`, `createTodo()`, `createToolCall()`, `SessionTodoCoordinator.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 88`** (5 nodes): `createPlugin()`, `getButtonByText()`, `getModalState()`, `getSelectedProviderState()`, `ModelConfigModal.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 97`** (4 nodes): `createCoordinator()`, `createRuntime()`, `createToolCall()`, `BackgroundTaskStreamTriggerCoordinator.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 102`** (4 nodes): `createConversation()`, `createHost()`, `createRuntime()`, `ConversationAuthoritativeSyncCoordinator.timeoutNotice.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 103`** (4 nodes): `createBridgeParts()`, `createConversation()`, `createSyncResult()`, `ConversationSyncBridge.compaction.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 105`** (4 nodes): `createConversation()`, `createHost()`, `createPort()`, `ConversationTabLifecycleRecoveryCoordinator.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 106`** (4 nodes): `createFixture()`, `createPaneCoordinator()`, `createRuntimeState()`, `ConversationTabRuntimeCoordinator.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 107`** (4 nodes): `createFile()`, `createLocatorHarness()`, `createMarkdownView()`, `FocusContextMarkdownViewLocator.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 108`** (4 nodes): `createCatalogBundle()`, `createModelCatalogProvider()`, `createRuntimeFixture()`, `ModelSelectionRuntime.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 111`** (4 nodes): `createHost()`, `createQuestionRequest()`, `createRuntimeState()`, `QuestionDockRenderStateFacade.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 113`** (4 nodes): `createHarness()`, `createQuestionRequest()`, `createResolution()`, `QuestionResolutionCoordinator.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 115`** (4 nodes): `createFactoryFixture()`, `createQuestionRequest()`, `createRuntimeState()`, `QuestionRuntimeViewHostFactory.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 116`** (4 nodes): `createHost()`, `createRuntime()`, `createTodo()`, `QuestionTodoStatusRefreshCoordinator.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 117`** (4 nodes): `createDeferred()`, `createHost()`, `createRuntimeCommand()`, `SlashCommandMenuCatalogCache.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 118`** (4 nodes): `field()`, `model()`, `provider()`, `modelConfigSavePlan.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 130`** (3 nodes): `createConversation()`, `createCoordinator()`, `BackgroundTaskIndicatorCoordinator.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 131`** (3 nodes): `createFixture()`, `createRuntime()`, `BackgroundTaskLiveSignalCoordinator.hostAssembly.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 152`** (3 nodes): `createCoordinator()`, `createQuestionRequest()`, `QuestionResolutionFlowCoordinator.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 155`** (3 nodes): `createHost()`, `createRuntime()`, `SessionTodoHostAdapter.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 156`** (3 nodes): `createConversation()`, `createHost()`, `SlashCommandExecutionService.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 165`** (2 nodes): `__init__.py`, `Repo-local autopilot support modules.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `Community 1` to `Community 0`, `Community 2`, `Community 4`, `Community 5`, `Community 7`, `Community 9`, `Community 10`, `Community 11`, `Community 12`, `Community 14`, `Community 15`, `Community 16`, `Community 18`, `Community 19`, `Community 21`, `Community 22`, `Community 23`, `Community 27`, `Community 29`, `Community 34`, `Community 35`, `Community 38`, `Community 39`, `Community 53`?**
  _High betweenness centrality (0.248) - this node is a cross-community bridge._
- **Why does `OpenCodianView` connect `Community 0` to `Community 1`, `Community 2`, `Community 3`, `Community 4`, `Community 5`, `Community 38`, `Community 6`, `Community 9`, `Community 11`, `Community 14`, `Community 17`, `Community 19`, `Community 21`, `Community 24`, `Community 25`, `Community 27`?**
  _High betweenness centrality (0.125) - this node is a cross-community bridge._
- **Why does `OpenCodeService` connect `Community 7` to `Community 2`, `Community 3`, `Community 8`, `Community 12`, `Community 13`, `Community 18`, `Community 20`, `Community 27`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Are the 366 inferred relationships involving `t()` (e.g. with `.getEmptyConversationTitle()` and `.generateDefaultTitle()`) actually correct?**
  _`t()` has 366 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Repo-local autopilot support modules.`, `ResizeObserverMock`, `TFile` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._