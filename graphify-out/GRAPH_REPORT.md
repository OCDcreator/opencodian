# Graph Report - opencodian  (2026-04-22)

## Corpus Check
- 694 files · ~882,231 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 5794 nodes · 12104 edges · 88 communities detected
- Extraction: 70% EXTRACTED · 30% INFERRED · 0% AMBIGUOUS · INFERRED: 3627 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Community 85|Community 85]]
- [[_COMMUNITY_Community 86|Community 86]]
- [[_COMMUNITY_Community 95|Community 95]]
- [[_COMMUNITY_Community 100|Community 100]]
- [[_COMMUNITY_Community 102|Community 102]]
- [[_COMMUNITY_Community 103|Community 103]]
- [[_COMMUNITY_Community 104|Community 104]]
- [[_COMMUNITY_Community 105|Community 105]]
- [[_COMMUNITY_Community 106|Community 106]]
- [[_COMMUNITY_Community 108|Community 108]]
- [[_COMMUNITY_Community 109|Community 109]]
- [[_COMMUNITY_Community 110|Community 110]]
- [[_COMMUNITY_Community 112|Community 112]]
- [[_COMMUNITY_Community 113|Community 113]]
- [[_COMMUNITY_Community 114|Community 114]]
- [[_COMMUNITY_Community 115|Community 115]]
- [[_COMMUNITY_Community 127|Community 127]]
- [[_COMMUNITY_Community 128|Community 128]]
- [[_COMMUNITY_Community 148|Community 148]]
- [[_COMMUNITY_Community 151|Community 151]]
- [[_COMMUNITY_Community 152|Community 152]]
- [[_COMMUNITY_Community 161|Community 161]]

## God Nodes (most connected - your core abstractions)
1. `t()` - 365 edges
2. `OpenCodianView` - 246 edges
3. `OpenCodeService` - 139 edges
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
Nodes (93): createHost(), AssistantShellRenderer, AssistantShellViewHostAdapter, applyPassiveScrollMeasurement(), applyUserScrollIntent(), getDistanceFromBottom(), getProgrammaticScrollGuardDelayMs(), hasProgrammaticScrollGuard() (+85 more)

### Community 1 - "Community 1"
Cohesion: 0.01
Nodes (43): AssistantNoticeCardRenderer, buildInterruptedAssistantNotice(), t(), LiquidGlassSettingHelpModal, ModelConfigJsonModal, buildModelPickerGroups(), filterModelPickerGroups(), findModelPickerOption() (+35 more)

### Community 2 - "Community 2"
Cohesion: 0.01
Nodes (112): BackgroundTaskCompletionNoticeService, BackgroundTaskTimelineAssemblyService, BackgroundTaskTimelineLaunchService, createSdkClient(), addObject(), createEnvironmentScene(), createGlassOctahedronThreeRenderer(), disposeSceneResources() (+104 more)

### Community 3 - "Community 3"
Cohesion: 0.02
Nodes (52): extractRenderableToolMetadata(), OpenCodeMessageNormalizationMapper, OpenCodeToolContentAssembler, resolveOpenCodeToolKind(), resolveToolResultVisibility(), OpenCodeSdkFacade, extractRenderableToolMetadata(), extractStructuredErrorMessage() (+44 more)

### Community 4 - "Community 4"
Cohesion: 0.02
Nodes (33): BackgroundConversationPostSyncHandoffCoordinator, BackgroundConversationPostSyncRefreshExecutor, BackgroundConversationSignalSyncStateCoordinator, BackgroundTaskIndicatorCoordinator, BackgroundTaskInlinePanelRenderer, BackgroundTaskLiveSignalCoordinator, createBackgroundTaskLiveSignalCoordinatorHost(), BackgroundTaskNoticeStateService (+25 more)

### Community 5 - "Community 5"
Cohesion: 0.02
Nodes (92): FocusContextMarkdownViewLocator, createView(), areChatAppearanceSettingsEqual(), diffObject(), getBuiltinThemePresets(), getThemeAppearanceOverridesFromBase(), getThemePresetDefinition(), hasThemeAppearanceOverrides() (+84 more)

### Community 6 - "Community 6"
Cohesion: 0.02
Nodes (53): buildComposerContextChipStates(), createFocusContextPreview(), getContextTargetKey(), getPromptContextTargetKey(), removeDraftContextItemsByTarget(), resolveFocusContextPreview(), upsertDraftContextItem(), ComposerContextActionService (+45 more)

### Community 7 - "Community 7"
Cohesion: 0.03
Nodes (169): acquire_lock(), autopilot_lock(), build_cli_parser_support(), build_parser(), main(), new_state(), read_lock(), release_lock() (+161 more)

### Community 8 - "Community 8"
Cohesion: 0.02
Nodes (17): ConversationSessionSignalRuntime, OpenCodeEventSubscriptionCoordinator, cloneSettings(), OpenCodeServiceLifecycleCoordinator, cloneSettings(), createHost(), createSettingsHarness(), normalizeDiffEntries() (+9 more)

### Community 9 - "Community 9"
Cohesion: 0.02
Nodes (46): ContextFilePickerModal, ModelConfigModal, createModelConfigKeyValueState(), createModelConfigModalSnapshot(), isBlankProviderState(), parseAddProviderJsonDraft(), readProviderOptionString(), resolveModelConfigJsonDraftValue() (+38 more)

### Community 10 - "Community 10"
Cohesion: 0.02
Nodes (12): hydrateCanonicalChatMessage(), createHost(), OpenCodePromptRequestBuilder, buildCanonicalConversationFingerprintPayload(), cloneSettings(), getDebugTextPreview(), isPlainRecord(), OpenCodeService (+4 more)

### Community 11 - "Community 11"
Cohesion: 0.03
Nodes (22): buildChatAppearanceCustomCss(), getChatAppearanceBackgroundSizeValue(), getChatAppearanceCssVariables(), getInputPanelGlassRefractionCssVariables(), append_jsonl(), progress(), buildConversationMetaFromStoredRecord(), cloneConversationListDiagnostics() (+14 more)

### Community 12 - "Community 12"
Cohesion: 0.03
Nodes (15): OpenCodeCatalogQueryCoordinator, OpenCodeCatalogStateStore, OpenCodeQuestionPermissionHub, appendSdkErrorStatus(), describeSdkError(), extractSdkErrorMessage(), getSdkErrorRecordBaseMessage(), getSdkErrorRecordStatusCode() (+7 more)

### Community 13 - "Community 13"
Cohesion: 0.03
Nodes (19): BackgroundConversationAttentionCoordinator, ConversationHistoryActionsCoordinator, ConversationHistoryDialogService, ConversationLoadRecoveryCoordinator, createConversation(), createRuntimeState(), createService(), createTab() (+11 more)

### Community 14 - "Community 14"
Cohesion: 0.03
Nodes (76): buildLobehubDefinitions(), buildOpencodeDefinitions(), computeMatchScore(), createDefinition(), findBuiltinIcon(), formatBuiltinSource(), getBuiltinIcon(), getDisplayName() (+68 more)

### Community 15 - "Community 15"
Cohesion: 0.03
Nodes (11): ActiveTabContextUsageCoordinator, BackgroundTaskActivationIndicatorCoordinator, ChatSelectionControlsCoordinator, getPerformanceTimestampMs(), ModelSelectionRuntime, MutationObserverMock, PermissionModeSelectorCoordinator, QuestionTodoActivationRefreshCoordinator (+3 more)

### Community 16 - "Community 16"
Cohesion: 0.04
Nodes (74): InputPanelAppearanceCoordinator, InputPanelThemeRuntime, measureDisplacementRangeAtUv(), add3(), applyEdgeBulge(), applyFilterLayerState(), bounds2(), buildBackdropFilterValue() (+66 more)

### Community 17 - "Community 17"
Cohesion: 0.03
Nodes (27): ChatHeaderPresenter, createFixture(), createCatalogBundle(), createFixture(), settleAsyncWork(), createHarness(), buildComposerInputSubmission(), ComposerInputShellCoordinator (+19 more)

### Community 18 - "Community 18"
Cohesion: 0.04
Nodes (47): createHarness(), createSegment(), createService(), createReminderMessage(), clamp(), createStageLayerElement(), createSvgElement(), estimateProjectionDelta() (+39 more)

### Community 19 - "Community 19"
Cohesion: 0.04
Nodes (16): buildStreamErrorNotice(), renderAssistantNoticeCardAndFooter(), renderAssistantPlaceholderAsNotice(), renderPersistedAssistantNotice(), buildLocalStreamOutcome(), ConversationAuthoritativeSyncCoordinator, shouldSyncAfterStream(), PendingIndicatorController (+8 more)

### Community 20 - "Community 20"
Cohesion: 0.05
Nodes (51): ModelCatalogStateService, assembleModelCatalog(), assembleServerModelCatalog(), filterCatalogToProviderIds(), projectEffectiveCatalog(), resolveProviderAvailabilityProbePlan(), selectProviderProbeModelId(), collectCurrentEnabledProviderIds() (+43 more)

### Community 21 - "Community 21"
Cohesion: 0.03
Nodes (29): ContextFileCatalogEventBridge, buildFragmentWithLinks(), createWikilinkElement(), createWikilinkPattern(), extractLinkTarget(), fileExistsInVault(), findWikilinks(), processFileLinks() (+21 more)

### Community 22 - "Community 22"
Cohesion: 0.05
Nodes (52): buildCommandScopedAgent(), cloneConfigObject(), cloneConfigValue(), getCommandScopedAgentId(), getCommandScopedAgentMetadata(), isCommandScopedAgentForCommand(), isCommandScopedAgentId(), mergeConfigObjects() (+44 more)

### Community 23 - "Community 23"
Cohesion: 0.05
Nodes (50): applyDisplacementSnapshot(), applyHostTransform(), buildBackdropFilterValue(), buildFallbackBackdropFilterValue(), clamp(), createFaceSvgElement(), createStageLayerElement(), createState() (+42 more)

### Community 24 - "Community 24"
Cohesion: 0.05
Nodes (62): buildTrailingAssistantPatchCompletionDebugLoggingContext(), buildTrailingAssistantPatchCompletionDebugLogPlan(), buildTrailingAssistantPatchDebugFinalLogInputs(), buildTrailingAssistantPatchDebugFinalLogInputsContract(), buildTrailingAssistantPatchDebugFinalLogPayload(), buildTrailingAssistantPatchDebugFinalLogPayloadContractFromInputs(), buildTrailingAssistantPatchDebugFinalLogPlan(), buildTrailingAssistantPatchDebugFinalLogPlanContract() (+54 more)

### Community 25 - "Community 25"
Cohesion: 0.08
Nodes (1): SettingsModelCatalogPresenter

### Community 26 - "Community 26"
Cohesion: 0.11
Nodes (48): applyBackdropFilterValue(), applyGlassTint(), applyInstanceMarker(), applyShellInteractiveStyles(), buildFallbackBackdropFilterValue(), buildSvgBackdropFilterValue(), clamp(), cleanupInstanceArtifacts() (+40 more)

### Community 27 - "Community 27"
Cohesion: 0.12
Nodes (47): add3(), buildClipPath(), buildDisplacementTrace(), clamp(), computeBounds(), convexHull(), createFace(), createGlassOctahedronProjectionContext() (+39 more)

### Community 28 - "Community 28"
Cohesion: 0.08
Nodes (32): registerBuiltinGlassAdapters(), getDefaultDebugModuleSettings(), isDebugModuleKey(), normalizeDebugModuleSettings(), normalizeDebugRefreshIntervalMs(), resolveDebugModuleKey(), setLocale(), createLogger() (+24 more)

### Community 29 - "Community 29"
Cohesion: 0.08
Nodes (5): ContextDetailModal, ContextRing, ContextUsageService, getLocale(), getDefaultContextWindow()

### Community 30 - "Community 30"
Cohesion: 0.1
Nodes (12): renderAssistantPlainTextFallbackContent(), renderAssistantStructuredContent(), QuestionInlineCardRenderer, appendQuestionResolutionCard(), appendQuestionResolutionCardFromRenderPlan(), buildQuestionAnswerMarkdown(), buildQuestionRejectedMarkdown(), buildQuestionResolutionCardRenderPlan() (+4 more)

### Community 31 - "Community 31"
Cohesion: 0.11
Nodes (23): aggregateDocsFromRequirements(), collectDocFiles(), collectSourceFilesForGroup(), collectSourceMappings(), docIgnoredByGroup(), escapeRegex(), findGroupForSource(), globToRegExp() (+15 more)

### Community 32 - "Community 32"
Cohesion: 0.07
Nodes (8): createHarness(), createRuntimeState(), ComposerContextViewFacade, createComposerContextServices(), ComposerContextViewHostAdapter, createFocusContextServices(), createHarness(), FocusContextViewHostAdapter

### Community 33 - "Community 33"
Cohesion: 0.1
Nodes (5): normalizeConversationSessionSettings(), ConversationSessionSettingsCoordinator, ConversationSessionSettingsModal, normalizeChatFontSizePx(), normalizeCompactionReservedTokens()

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
Cohesion: 0.14
Nodes (1): createSection()

### Community 40 - "Community 40"
Cohesion: 0.23
Nodes (10): add_doctor_subcommand(), add_restart_subcommand(), add_start_subcommand(), add_status_subcommand(), add_version_subcommand(), add_watch_subcommand(), build_parser(), CliParserSupport (+2 more)

### Community 41 - "Community 41"
Cohesion: 0.18
Nodes (3): createApp(), createPlugin(), createSection()

### Community 42 - "Community 42"
Cohesion: 0.2
Nodes (7): buildModelOptionValue(), highlightModelOption(), parseModelOptionValue(), scrollToCurrentModel(), selectHighlightedModel(), renderModelList(), bindModelSelectorStickyHeaders()

### Community 43 - "Community 43"
Cohesion: 0.17
Nodes (1): createSection()

### Community 44 - "Community 44"
Cohesion: 0.17
Nodes (1): createSection()

### Community 45 - "Community 45"
Cohesion: 0.21
Nodes (5): createButtonRecord(), createSection(), createTextRecord(), createToggleRecord(), mockSettingPrototype()

### Community 46 - "Community 46"
Cohesion: 0.4
Nodes (10): classifyReminderType(), detectOmoMessageMeta(), detectSystemReminder(), detectUserInjection(), getFirstMeaningfulLine(), normalizeMultilineText(), parseCompletedBackgroundTasks(), parseReminderTasks() (+2 more)

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

### Community 61 - "Community 61"
Cohesion: 0.47
Nodes (3): createConversation(), createFixture(), createHost()

### Community 64 - "Community 64"
Cohesion: 0.4
Nodes (2): createFile(), createMarkdownView()

### Community 68 - "Community 68"
Cohesion: 0.4
Nodes (1): ComposerContextEventBridge

### Community 69 - "Community 69"
Cohesion: 0.5
Nodes (3): createMockSdkClient(), createOpenCodeServiceTestContext(), MockEventSource

### Community 73 - "Community 73"
Cohesion: 0.5
Nodes (2): createHost(), createStreamEventTransformer()

### Community 77 - "Community 77"
Cohesion: 0.5
Nodes (2): createConversation(), createPreparedSend()

### Community 78 - "Community 78"
Cohesion: 0.5
Nodes (2): createConversation(), createHost()

### Community 79 - "Community 79"
Cohesion: 0.5
Nodes (2): createConversation(), createHost()

### Community 82 - "Community 82"
Cohesion: 0.5
Nodes (2): createConversation(), createHost()

### Community 83 - "Community 83"
Cohesion: 0.5
Nodes (2): createFile(), createMarkdownView()

### Community 85 - "Community 85"
Cohesion: 0.5
Nodes (2): createFixture(), createRuntime()

### Community 86 - "Community 86"
Cohesion: 0.5
Nodes (2): getModalState(), getSelectedProviderState()

### Community 95 - "Community 95"
Cohesion: 0.67
Nodes (2): createCoordinator(), createRuntime()

### Community 100 - "Community 100"
Cohesion: 0.67
Nodes (2): createHost(), createRuntime()

### Community 102 - "Community 102"
Cohesion: 0.67
Nodes (2): createConversation(), createHost()

### Community 103 - "Community 103"
Cohesion: 0.67
Nodes (2): createFixture(), createPaneCoordinator()

### Community 104 - "Community 104"
Cohesion: 0.67
Nodes (2): createFile(), createMarkdownView()

### Community 105 - "Community 105"
Cohesion: 0.67
Nodes (2): createCatalogBundle(), createRuntimeFixture()

### Community 106 - "Community 106"
Cohesion: 0.83
Nodes (3): createConversation(), createRuntime(), createViewHost()

### Community 108 - "Community 108"
Cohesion: 0.67
Nodes (2): createHost(), createRuntimeState()

### Community 109 - "Community 109"
Cohesion: 0.83
Nodes (3): createFacade(), createQuestionRequest(), createRuntimeState()

### Community 110 - "Community 110"
Cohesion: 0.67
Nodes (2): createQuestionRequest(), createResolution()

### Community 112 - "Community 112"
Cohesion: 0.67
Nodes (2): createFactoryFixture(), createQuestionRequest()

### Community 113 - "Community 113"
Cohesion: 0.67
Nodes (2): createHost(), createRuntime()

### Community 114 - "Community 114"
Cohesion: 0.67
Nodes (2): createHost(), createRuntimeCommand()

### Community 115 - "Community 115"
Cohesion: 0.67
Nodes (2): model(), provider()

### Community 127 - "Community 127"
Cohesion: 1.0
Nodes (2): createConversation(), createCoordinator()

### Community 128 - "Community 128"
Cohesion: 1.0
Nodes (2): createFixture(), createRuntime()

### Community 148 - "Community 148"
Cohesion: 1.0
Nodes (2): createCoordinator(), createQuestionRequest()

### Community 151 - "Community 151"
Cohesion: 1.0
Nodes (2): createHost(), createRuntime()

### Community 152 - "Community 152"
Cohesion: 1.0
Nodes (2): createConversation(), createHost()

### Community 161 - "Community 161"
Cohesion: 1.0
Nodes (1): Repo-local autopilot support modules.

## Knowledge Gaps
- **5 isolated node(s):** `Repo-local autopilot support modules.`, `ResizeObserverMock`, `TFile`, `MarkdownView`, `TFolder`
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 25`** (52 nodes): `.probeProvider()`, `SettingsModelCatalogPresenter`, `.captureProviderListScrollPosition()`, `.constructor()`, `.createActionButton()`, `.createCatalogRenderContext()`, `.createProviderList()`, `.createProviderRenderState()`, `.describeModelAvailabilitySummary()`, `.describeProviderAvailabilityProbe()`, `.describeProviderModels()`, `.getCatalogPlaceholderReason()`, `.getCatalogTabTitle()`, `.getDisplayCatalogForMode()`, `.getModelToggleLabel()`, `.getProviderAvailabilityProbeBadge()`, `.getProviderAvailabilityStatusClass()`, `.getProviderAvailabilityStatusLabel()`, `.getProviderPrimaryDisabledReason()`, `.getProviderServerConstraintBadge()`, `.getProviderStatusCatalogForMode()`, `.getProviderToggleLabel()`, `.handleModelToggleChange()`, `.handleProviderToggleChange()`, `.isProviderCurrentlyEnabled()`, `.isProviderDisabledByScope()`, `.render()`, `.renderAvailabilityControls()`, `.renderAvailabilityFilterToggle()`, `.renderCatalogActions()`, `.renderCatalogOverview()`, `.renderModelCatalogSummaryCards()`, `.renderModelToggleBlock()`, `.renderProviderAccordion()`, `.renderProviderActions()`, `.renderProviderBadges()`, `.renderProviderEmptyModels()`, `.renderProviderExpandButton()`, `.renderProviderList()`, `.renderProviderModelBulkToolbar()`, `.renderProviderModelRow()`, `.renderProviderModels()`, `.renderProviderToggle()`, `.rerender()`, `.restoreAvailabilitySearchSelection()`, `.restoreProviderListScrollPosition()`, `.runPairedButtonAction()`, `.runProviderAvailabilityCheck()`, `.shouldUseFilteredModels()`, `.toggleProviderExpanded()`, `.updateAvailabilityFilter()`, `SettingsModelCatalogPresenter.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (28 nodes): `ContextUsageDisplayService`, `.buildBreakdownSegments()`, `.buildDisplayTokenBreakdown()`, `.calculatePercentage()`, `.collectBreakdownChars()`, `.estimateBreakdownTokens()`, `.estimateTokens()`, `.fitBreakdownTokens()`, `.formatCurrency()`, `.formatNumber()`, `.formatPercent()`, `.getAssistantCharsFromMessage()`, `.getAssistantCharsFromPart()`, `.getContextBreakdown()`, `.getDisplaySnapshot()`, `.getDisplayTokenBreakdown()`, `.getNestedStringField()`, `.getObjectField()`, `.getParts()`, `.getStringField()`, `.getToolChars()`, `.getUnknownField()`, `.getUserCharsFromMessage()`, `.getUserCharsFromPart()`, `.isRecord()`, `.stringifyUnknown()`, `.summarize()`, `ContextUsageDisplayService.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (14 nodes): `createButtonRecord()`, `createDropdownRecord()`, `createPlugin()`, `createRuntimeAgent()`, `createSection()`, `createSectionHeading()`, `createTextAreaRecord()`, `createTextRecord()`, `createToggleRecord()`, `findButton()`, `findDropdown()`, `findToggle()`, `flushAsync()`, `SettingsAgentsSection.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (12 nodes): `createButtonRecord()`, `createDropdownRecord()`, `createPlugin()`, `createRuntimeCommand()`, `createSection()`, `createSectionHeading()`, `createTextAreaRecord()`, `createTextRecord()`, `createToggleRecord()`, `findToggle()`, `flushAsync()`, `SettingsCommandsSection.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (12 nodes): `createButtonControl()`, `createDropdownRecord()`, `createExtraButtonControl()`, `createPlugin()`, `createSection()`, `createSectionHeading()`, `createTextRecord()`, `createToggleRecord()`, `findText()`, `findToggle()`, `refreshTitleModelsCallback()`, `SettingsConversationSection.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (8 nodes): `ServerSettingHelpModal`, `.constructor()`, `.escapeHtml()`, `.getHelpContent()`, `.onClose()`, `.onOpen()`, `.tr()`, `ServerSettingHelpModal.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 58`** (7 nodes): `createCanvasContextMock()`, `createMountContext()`, `createSettings()`, `normalize3()`, `ResizeObserverMock`, `.constructor()`, `shudingDiamond.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 64`** (6 nodes): `createEditor()`, `createFile()`, `createHarness()`, `createMarkdownView()`, `createSelectionPreview()`, `RetainedSelectionHighlightService.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 68`** (5 nodes): `ComposerContextEventBridge`, `.constructor()`, `.dispose()`, `.start()`, `ComposerContextEventBridge.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 73`** (5 nodes): `createHost()`, `createRawSseFetchMock()`, `createSseFetchMock()`, `createStreamEventTransformer()`, `OpenCodeStreamingRuntimeCoordinator.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 77`** (5 nodes): `createConversation()`, `createPreparedSend()`, `createRoutedStream()`, `createRuntime()`, `buildLocalStreamOutcome.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 78`** (5 nodes): `createConversation()`, `createHost()`, `createMessage()`, `createPort()`, `ConversationLoadRecoveryCoordinator.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 79`** (5 nodes): `appendAssistantTail()`, `createConversation()`, `createHost()`, `createMessage()`, `ConversationRenderService.testSupport.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 82`** (5 nodes): `createConversation()`, `createHost()`, `createPort()`, `createTabManagerStub()`, `ConversationTabOpenCoordinator.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 83`** (5 nodes): `createEditor()`, `createFile()`, `createMarkdownView()`, `createServiceHarness()`, `FocusContextRuntimeService.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 85`** (5 nodes): `createFixture()`, `createRuntime()`, `createTodo()`, `createToolCall()`, `SessionTodoCoordinator.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 86`** (5 nodes): `createPlugin()`, `getButtonByText()`, `getModalState()`, `getSelectedProviderState()`, `ModelConfigModal.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 95`** (4 nodes): `createCoordinator()`, `createRuntime()`, `createToolCall()`, `BackgroundTaskStreamTriggerCoordinator.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 100`** (4 nodes): `createConversation()`, `createHost()`, `createRuntime()`, `ConversationAuthoritativeSyncCoordinator.timeoutNotice.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 102`** (4 nodes): `createConversation()`, `createHost()`, `createPort()`, `ConversationTabLifecycleRecoveryCoordinator.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 103`** (4 nodes): `createFixture()`, `createPaneCoordinator()`, `createRuntimeState()`, `ConversationTabRuntimeCoordinator.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 104`** (4 nodes): `createFile()`, `createLocatorHarness()`, `createMarkdownView()`, `FocusContextMarkdownViewLocator.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 105`** (4 nodes): `createCatalogBundle()`, `createModelCatalogProvider()`, `createRuntimeFixture()`, `ModelSelectionRuntime.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 108`** (4 nodes): `createHost()`, `createQuestionRequest()`, `createRuntimeState()`, `QuestionDockRenderStateFacade.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 110`** (4 nodes): `createHarness()`, `createQuestionRequest()`, `createResolution()`, `QuestionResolutionCoordinator.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 112`** (4 nodes): `createFactoryFixture()`, `createQuestionRequest()`, `createRuntimeState()`, `QuestionRuntimeViewHostFactory.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 113`** (4 nodes): `createHost()`, `createRuntime()`, `createTodo()`, `QuestionTodoStatusRefreshCoordinator.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 114`** (4 nodes): `createDeferred()`, `createHost()`, `createRuntimeCommand()`, `SlashCommandMenuCatalogCache.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 115`** (4 nodes): `field()`, `model()`, `provider()`, `modelConfigSavePlan.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 127`** (3 nodes): `createConversation()`, `createCoordinator()`, `BackgroundTaskIndicatorCoordinator.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 128`** (3 nodes): `createFixture()`, `createRuntime()`, `BackgroundTaskLiveSignalCoordinator.hostAssembly.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 148`** (3 nodes): `createCoordinator()`, `createQuestionRequest()`, `QuestionResolutionFlowCoordinator.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 151`** (3 nodes): `createHost()`, `createRuntime()`, `SessionTodoHostAdapter.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 152`** (3 nodes): `createConversation()`, `createHost()`, `SlashCommandExecutionService.test.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 161`** (2 nodes): `__init__.py`, `Repo-local autopilot support modules.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `Community 1` to `Community 0`, `Community 2`, `Community 4`, `Community 5`, `Community 6`, `Community 9`, `Community 11`, `Community 13`, `Community 14`, `Community 15`, `Community 17`, `Community 18`, `Community 19`, `Community 23`, `Community 25`, `Community 28`, `Community 29`, `Community 30`, `Community 33`, `Community 34`, `Community 35`, `Community 38`, `Community 53`?**
  _High betweenness centrality (0.229) - this node is a cross-community bridge._
- **Why does `OpenCodianView` connect `Community 0` to `Community 1`, `Community 2`, `Community 3`, `Community 4`, `Community 5`, `Community 6`, `Community 38`, `Community 8`, `Community 11`, `Community 13`, `Community 16`, `Community 17`, `Community 19`, `Community 21`, `Community 30`?**
  _High betweenness centrality (0.111) - this node is a cross-community bridge._
- **Why does `OpenCodeService` connect `Community 10` to `Community 2`, `Community 3`, `Community 8`, `Community 11`, `Community 12`, `Community 14`, `Community 19`, `Community 20`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Are the 364 inferred relationships involving `t()` (e.g. with `.getEmptyConversationTitle()` and `.generateDefaultTitle()`) actually correct?**
  _`t()` has 364 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Repo-local autopilot support modules.`, `ResizeObserverMock`, `TFile` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._