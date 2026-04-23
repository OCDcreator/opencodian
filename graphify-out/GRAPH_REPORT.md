# Graph Report - src  (2026-04-23)

## Corpus Check
- 335 files · ~278,688 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 4383 nodes · 9673 edges · 48 communities detected
- Extraction: 74% EXTRACTED · 26% INFERRED · 0% AMBIGUOUS · INFERRED: 2533 edges (avg confidence: 0.8)
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
1. `t()` - 363 edges
2. `OpenCodianView` - 246 edges
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
  src\core\opencode\OpenCodeSessionControlOrchestrator.ts → src\shared\contextPath.ts
- `getCommandScopedAgentMetadata()` --calls--> `isRecord()`  [INFERRED]
  src\core\config\commandScopedAgent.ts → src\features\chat\services\ConversationTurnViewModelBuilder.ts
- `mergeConfigObjects()` --calls--> `isRecord()`  [INFERRED]
  src\core\config\commandScopedAgent.ts → src\features\chat\services\ConversationTurnViewModelBuilder.ts
- `assembleServerModelCatalog()` --calls--> `catalogFromRuntimeResult()`  [INFERRED]
  src\core\config\modelConfigAssembly.ts → src\core\config\modelConfigCatalog.ts
- `setProviderEnabled()` --calls--> `buildAvailabilitySubset()`  [INFERRED]
  src\core\config\modelConfigAvailability.ts → src\features\settings\modelConfigSavePlan.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.01
Nodes (55): buildInterruptedAssistantNotice(), renderAssistantNoticeCardAndFooter(), renderAssistantPlaceholderAsNotice(), renderPersistedAssistantNotice(), AssistantShellRenderer, AssistantShellViewHostAdapter, applyPassiveScrollMeasurement(), applyUserScrollIntent() (+47 more)

### Community 1 - "Community 1"
Cohesion: 0.01
Nodes (86): AssistantNoticeCardRenderer, ContextFilePickerModal, ConversationSessionSettingsModal, t(), LiquidGlassSettingHelpModal, ModelConfigModal, createModelConfigKeyValueState(), createModelConfigModalSnapshot() (+78 more)

### Community 2 - "Community 2"
Cohesion: 0.01
Nodes (36): BackgroundConversationPostSyncHandoffCoordinator, BackgroundConversationPostSyncRefreshExecutor, BackgroundConversationSignalSyncStateCoordinator, BackgroundTaskCompletionNoticeService, BackgroundTaskIndicatorCoordinator, BackgroundTaskInlinePanelRenderer, BackgroundTaskLiveSignalCoordinator, createBackgroundTaskLiveSignalCoordinatorHost() (+28 more)

### Community 3 - "Community 3"
Cohesion: 0.02
Nodes (85): areChatAppearanceSettingsEqual(), diffObject(), getBuiltinThemePresets(), getThemeAppearanceOverridesFromBase(), getThemePresetDefinition(), hasThemeAppearanceOverrides(), mergePartialChatAppearanceSettings(), resolveThemeChatAppearance() (+77 more)

### Community 4 - "Community 4"
Cohesion: 0.02
Nodes (47): renderAssistantPlainTextFallbackContent(), renderAssistantStructuredContent(), createSdkClient(), extractRenderableToolMetadata(), OpenCodeMessageNormalizationMapper, OpenCodeToolContentAssembler, resolveOpenCodeToolKind(), resolveToolResultVisibility() (+39 more)

### Community 5 - "Community 5"
Cohesion: 0.02
Nodes (34): buildConversationMetaFromStoredRecord(), cloneConversationListDiagnostics(), ConversationMetadataCache, getUtf8ByteLength(), trackTopDiagnosticEntries(), ConversationTurnViewModelBuilder, getMessageParentId(), getRecordString() (+26 more)

### Community 6 - "Community 6"
Cohesion: 0.02
Nodes (25): ActiveTabContextUsageCoordinator, BackgroundTaskActivationIndicatorCoordinator, ChatSelectionControlsCoordinator, ConversationHydrationOutcomeBridge, ConversationHydrationRenderBridge, ConversationAssistantMessageRenderDelegate, ConversationMessageRenderDelegate, ConversationSyncedUpdateApplyDelegate (+17 more)

### Community 7 - "Community 7"
Cohesion: 0.02
Nodes (9): OpenCodePromptRequestBuilder, buildCanonicalConversationFingerprintPayload(), getDebugTextPreview(), isPlainRecord(), OpenCodeService, cloneMessage(), clonePart(), cloneState() (+1 more)

### Community 8 - "Community 8"
Cohesion: 0.02
Nodes (17): OpenCodeCatalogQueryCoordinator, OpenCodeCatalogStateStore, OpenCodeQuestionPermissionHub, appendSdkErrorStatus(), describeSdkError(), extractSdkErrorMessage(), getSdkErrorRecordBaseMessage(), getSdkErrorRecordStatusCode() (+9 more)

### Community 9 - "Community 9"
Cohesion: 0.03
Nodes (96): buildLobehubDefinitions(), buildOpencodeDefinitions(), computeMatchScore(), createDefinition(), findBuiltinIcon(), formatBuiltinSource(), getBuiltinIcon(), getDisplayName() (+88 more)

### Community 10 - "Community 10"
Cohesion: 0.03
Nodes (27): PermissionInlineCardRenderer, QuestionDock, QuestionDockCoordinator, applyQuestionDockSelection(), getQuestionDockActiveInteractionState(), getQuestionDockDraftAnswers(), sanitizeQuestionDockAnswer(), selectQuestionDockGroup() (+19 more)

### Community 11 - "Community 11"
Cohesion: 0.03
Nodes (23): buildStreamErrorNotice(), buildLocalStreamOutcome(), ConversationAuthoritativeMessageMergeCoordinator, ConversationAuthoritativeReloadCoordinator, findLatestInterruptedNotice(), findLatestUserBeforeTimestamp(), isInterruptedNoticeMessage(), shouldBypassCanonicalSyncForInterruptedNotice() (+15 more)

### Community 12 - "Community 12"
Cohesion: 0.04
Nodes (50): ModelCatalogStateService, assembleModelCatalog(), assembleServerModelCatalog(), filterCatalogToProviderIds(), projectEffectiveCatalog(), resolveProviderAvailabilityProbePlan(), selectProviderProbeModelId(), filterCatalog() (+42 more)

### Community 13 - "Community 13"
Cohesion: 0.03
Nodes (22): buildComposerContextChipStates(), createFocusContextPreview(), getContextTargetKey(), getPromptContextTargetKey(), removeDraftContextItemsByTarget(), resolveFocusContextPreview(), upsertDraftContextItem(), ComposerContextActionService (+14 more)

### Community 14 - "Community 14"
Cohesion: 0.04
Nodes (45): clamp(), createStageLayerElement(), createSvgElement(), estimateProjectionDelta(), formatNumber(), generateFilterId(), GlassOctahedronDemoController, maxRenderQuality() (+37 more)

### Community 15 - "Community 15"
Cohesion: 0.04
Nodes (42): ContextAttachmentBuilder, ContextFileCatalogBuildRunner, ContextFileCatalogIndex, createContextFileEntry(), ContextFileCatalogService, contextPathFromFileUrl(), isAbsoluteContextPath(), isWindowsDrivePath() (+34 more)

### Community 16 - "Community 16"
Cohesion: 0.04
Nodes (16): ChatHeaderPresenter, buildComposerInputSubmission(), ComposerInputShellCoordinator, parseCommandSubmission(), InputPanelAppearanceCoordinator, createComposerGlassFilterElement(), createSvgElement(), ensureComposerGlassSvgDefs() (+8 more)

### Community 17 - "Community 17"
Cohesion: 0.04
Nodes (12): OpenCodeEventSubscriptionCoordinator, cloneSettings(), OpenCodeServiceLifecycleCoordinator, normalizeDiffEntries(), normalizeMessageInfo(), normalizePart(), OpenCodeSyncEventRuntimeCoordinator, resolveSessionId() (+4 more)

### Community 18 - "Community 18"
Cohesion: 0.05
Nodes (11): extractStructuredErrorMessage(), getDebugTextPreview(), logAssistantFinalizationDebug(), OpenCodeStreamingRuntimeCoordinator, resolveReasoningDurationSeconds(), stringifyDebugPayload(), summarizeAssistantParts(), buildTitleGenerationPrompt() (+3 more)

### Community 19 - "Community 19"
Cohesion: 0.05
Nodes (11): buildChatAppearanceCustomCss(), getChatAppearanceBackgroundSizeValue(), getChatAppearanceCssVariables(), getInputPanelGlassRefractionCssVariables(), ConversationSessionSettingsCoordinator, getInputPanelThemeFamily(), getLiquidGlassAdapterIdForInputPanelTheme(), isValidChatAppearanceCustomCssDeclarations() (+3 more)

### Community 20 - "Community 20"
Cohesion: 0.06
Nodes (74): getCanvasDpiForQuality(), renderDisplacementMapAtQuality(), measureDisplacementRangeAtUv(), add3(), applyEdgeBulge(), applyFilterLayerState(), bounds2(), buildBackdropFilterValue() (+66 more)

### Community 21 - "Community 21"
Cohesion: 0.07
Nodes (1): ServerManager

### Community 22 - "Community 22"
Cohesion: 0.05
Nodes (63): buildTrailingAssistantPatchCompletionDebugLoggingContext(), buildTrailingAssistantPatchCompletionDebugLogPlan(), buildTrailingAssistantPatchDebugFinalLogInputs(), buildTrailingAssistantPatchDebugFinalLogInputsContract(), buildTrailingAssistantPatchDebugFinalLogPayload(), buildTrailingAssistantPatchDebugFinalLogPayloadContractFromInputs(), buildTrailingAssistantPatchDebugFinalLogPlan(), buildTrailingAssistantPatchDebugFinalLogPlanContract() (+55 more)

### Community 23 - "Community 23"
Cohesion: 0.05
Nodes (4): OpenCodianSettingTab, SettingsPluginSection, SettingsSectionCoordinator, SettingsUiSection

### Community 24 - "Community 24"
Cohesion: 0.11
Nodes (49): add3(), buildClipPath(), buildDisplacementTrace(), buildGlassOctahedronBackdropFilterValue(), buildGlassOctahedronLightBackdropFilterValue(), clamp(), computeBounds(), convexHull() (+41 more)

### Community 25 - "Community 25"
Cohesion: 0.11
Nodes (48): applyBackdropFilterValue(), applyGlassTint(), applyInstanceMarker(), applyShellInteractiveStyles(), buildFallbackBackdropFilterValue(), buildSvgBackdropFilterValue(), clamp(), cleanupInstanceArtifacts() (+40 more)

### Community 26 - "Community 26"
Cohesion: 0.11
Nodes (40): applyFilterLayerStyles(), applyShellStyles(), buildBackdropFilterValue(), buildEdgeBandWeight(), buildFallbackBackdropFilterValue(), buildFilterLayerBoxShadow(), captureDatasetSnapshot(), captureStyleSnapshot() (+32 more)

### Community 27 - "Community 27"
Cohesion: 0.08
Nodes (5): ContextDetailModal, ContextRing, ContextUsageService, getLocale(), getDefaultContextWindow()

### Community 28 - "Community 28"
Cohesion: 0.09
Nodes (2): BackgroundTaskTimelineAssemblyService, BackgroundTaskTimelineLaunchService

### Community 29 - "Community 29"
Cohesion: 0.07
Nodes (7): registerBuiltinGlassAdapters(), getAllGlassAdapters(), getGlassAdapter(), registerGlassAdapter(), unregisterGlassAdapter(), SettingsStyleControls, SettingsStyleLiquidGlassInputControls

### Community 30 - "Community 30"
Cohesion: 0.13
Nodes (31): buildCommandScopedAgent(), cloneConfigObject(), cloneConfigValue(), getCommandScopedAgentId(), getCommandScopedAgentMetadata(), isCommandScopedAgentForCommand(), isCommandScopedAgentId(), mergeConfigObjects() (+23 more)

### Community 31 - "Community 31"
Cohesion: 0.12
Nodes (27): getDefaultDebugModuleSettings(), isDebugModuleKey(), normalizeDebugModuleSettings(), normalizeDebugRefreshIntervalMs(), resolveDebugModuleKey(), createLogger(), createLoggerCall(), emit() (+19 more)

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
Cohesion: 0.14
Nodes (3): EffortSelector, isAdaptiveThinkingModel(), UserMessageFooterRenderer

### Community 37 - "Community 37"
Cohesion: 0.15
Nodes (13): createBackgroundConversationPostSyncHandoffServices(), createBackgroundConversationPostSyncHandoffViewHostAdapter(), createPostSyncQuestionTodoRefreshHosts(), createPostSyncQuestionTodoRefreshServices(), createQuestionTodoBackgroundTaskActivationHosts(), createQuestionTodoBackgroundTaskActivationServices(), createQuestionTodoBackgroundTaskActivationViewHostAdapter(), createQuestionTodoBackgroundTaskRefreshServices() (+5 more)

### Community 38 - "Community 38"
Cohesion: 0.23
Nodes (1): SettingsServerSection

### Community 39 - "Community 39"
Cohesion: 0.22
Nodes (1): PermissionModeSelectorCoordinator

### Community 40 - "Community 40"
Cohesion: 0.23
Nodes (15): clamp(), compileGlShader(), createGlProgram(), createLiquidDiamondDemoWebGlRenderer(), createPlane(), cross3(), dot3(), estimateAdaptiveDisplacementRangePx() (+7 more)

### Community 41 - "Community 41"
Cohesion: 0.26
Nodes (1): TabBar

### Community 42 - "Community 42"
Cohesion: 0.2
Nodes (6): buildModelOptionValue(), parseModelOptionValue(), scrollToCurrentModel(), selectHighlightedModel(), renderModelList(), bindModelSelectorStickyHeaders()

### Community 43 - "Community 43"
Cohesion: 0.44
Nodes (8): formatMcpSummaryField(), getFirstScalarMcpFallback(), getMcpSummaryFromFields(), getMcpToolSummary(), getPathTail(), resolveMcpSummaryCategory(), tokenizeMcpToolName(), truncateMcpSummaryText()

### Community 44 - "Community 44"
Cohesion: 0.47
Nodes (4): buildCodeFence(), prepareUserMessageMarkdownForDisplay(), replaceOutsideMarkdownCode(), trimFenceContent()

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
- **Thin community `Community 21`** (76 nodes): `ServerManager.ts`, `ServerManager`, `.attachLaunchTracking()`, `.buildConflictMessage()`, `.buildHealthyLocalConflictDiagnostics()`, `.buildLaunchFailureError()`, `.buildOrphanRestartDiagnostics()`, `.canBindLocalEndpoint()`, `.captureCommandOutput()`, `.cleanup()`, `.clearLaunchState()`, `.clearManagedServerState()`, `.collectManagedPidCandidates()`, `.constructor()`, `.createCurrentManagedShutdownPlan()`, `.createLaunchOutputHandler()`, `.dispose()`, `.doStart()`, `.findOpenCodeBinary()`, `.formatLaunchOutputTail()`, `.getActiveLaunchSnapshot()`, `.getAdoptableManagedServerState()`, `.getAuthHeaders()`, `.getConfigFingerprint()`, `.getCurrentPluginManagedListenerPid()`, `.getCurrentPluginManagedListenerPidSync()`, `.getLaunchExitSuffix()`, `.getListeningProcessId()`, `.getListeningProcessIdSync()`, `.getManagedConfigDir()`, `.getManagedLauncherPid()`, `.getManagedListenerPid()`, `.getManagedServerStateSnapshot()`, `.getProcessCommandLine()`, `.getProcessCommandLineSync()`, `.getRelevantConfigPaths()`, `.getSpawnEnv()`, `.handleHealthyOccupiedLocalEndpoint()`, `.inspectExistingHealthyServer()`, `.isDefaultManagedLocalEndpoint()`, `.isLegacyManagedServerState()`, `.isLocalPortAvailableSync()`, `.isPidRunning()`, `.isPidRunningSync()`, `.isPortAvailable()`, `.killWindowsProcessTree()`, `.killWindowsProcessTreeSync()`, `.launchLocalServerRuntime()`, `.looksLikeOpenCodeServeCommand()`, `.looksLikePluginManagedSidecarCommand()`, `.matchesManagedServerSignature()`, `.normalizeManagedWorkingDirectory()`, `.pushLaunchOutput()`, `.recycleUnknownLocalServer()`, `.refreshManagedListenerPid()`, `.resolveExecutableCandidate()`, `.resolveOccupiedHealthyLocalEndpoint()`, `.restart()`, `.restartManagedServer()`, `.runManagedShutdownLifecycle()`, `.runManagedShutdownLifecycleSync()`, `.setDiagnostics()`, `.setManagedServerState()`, `.setStatus()`, `.shouldRecycleUnknownLocalServer()`, `.shouldSpawnViaShell()`, `.spawnServer()`, `.start()`, `.stop()`, `.terminateManagedPid()`, `.terminateManagedPidSync()`, `.terminateManagedProcess()`, `.throwIfLaunchFailed()`, `.tryAdoptManagedServer()`, `.waitForHealthy()`, `.waitForPortAvailability()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (41 nodes): `BackgroundTaskTimelineAssemblyService`, `.addCompletionToSegment()`, `.applyReminderToSegment()`, `.captureUserSegmentAnchor()`, `.collectCompletionReminderSegments()`, `.collectDiagnostics()`, `.collectMessageSegments()`, `.collectSegments()`, `.collectTaskLaunchBlock()`, `.constructor()`, `.createEmptySegment()`, `.createSegment()`, `.createSegmentCollectionState()`, `.finalizeCollectedSegments()`, `.finalizeSegment()`, `.findBackgroundTaskAnchorIndex()`, `.findSegmentByTaskId()`, `.getLatestSearchModeSegment()`, `.getLatestSegmentWithActivity()`, `.getOrCreateRuntimeSegment()`, `.getOrCreateSegment()`, `.getPendingLaunches()`, `.isBackgroundTaskCompletionReminder()`, `.isSearchModeAnchorMessage()`, `.mergeRuntimeSegmentState()`, `.mergeSegmentCompletions()`, `.mergeSegmentLaunches()`, `.resolvePendingState()`, `.resolveReminderSegments()`, `.segmentHasTaskActivity()`, `.upsertLaunch()`, `.upsertSegmentLaunch()`, `BackgroundTaskTimelineLaunchService`, `.addCompletedTasksFromMessage()`, `.extractBackgroundTaskId()`, `.filterPendingLaunches()`, `.getBackgroundTaskDescription()`, `.isLaunchMatchedByCompletion()`, `.upsertLaunch()`, `BackgroundTaskTimelineAssemblyService.ts`, `BackgroundTaskTimelineLaunchService.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (28 nodes): `ContextUsageDisplayService`, `.buildBreakdownSegments()`, `.buildDisplayTokenBreakdown()`, `.calculatePercentage()`, `.collectBreakdownChars()`, `.estimateBreakdownTokens()`, `.estimateTokens()`, `.fitBreakdownTokens()`, `.formatCurrency()`, `.formatNumber()`, `.formatPercent()`, `.getAssistantCharsFromMessage()`, `.getAssistantCharsFromPart()`, `.getContextBreakdown()`, `.getDisplaySnapshot()`, `.getDisplayTokenBreakdown()`, `.getNestedStringField()`, `.getObjectField()`, `.getParts()`, `.getStringField()`, `.getToolChars()`, `.getUnknownField()`, `.getUserCharsFromMessage()`, `.getUserCharsFromPart()`, `.isRecord()`, `.stringifyUnknown()`, `.summarize()`, `ContextUsageDisplayService.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (19 nodes): `SettingsServerSection.ts`, `SettingsServerSection`, `.addHelpButton()`, `.attach()`, `.buildStatusDescription()`, `.collectStatusSnapshot()`, `.constructor()`, `.dispose()`, `.getStatusText()`, `.isBusyStatus()`, `.isLocalMode()`, `.refreshStatus()`, `.registerContainerCleanup()`, `.renderAuthSettings()`, `.renderLocalSettings()`, `.renderModeSetting()`, `.renderRemoteSettings()`, `.renderStatusSetting()`, `.updateStatusButtons()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (18 nodes): `.updatePermissionTriggerDisplay()`, `PermissionModeSelectorCoordinator.ts`, `PermissionModeSelectorCoordinator`, `.applyLocaleTexts()`, `.applyTriggerDisplay()`, `.buildDropdown()`, `.closeDropdown()`, `.constructor()`, `.destroy()`, `.getPermissionModeOptions()`, `.getTriggerDisplayState()`, `.isOpen()`, `.mount()`, `.openDropdown()`, `.selectPermissionMode()`, `.toggleDropdown()`, `.updateDropdownSelection()`, `.updateTriggerDisplay()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (15 nodes): `TabBar.ts`, `TabBar`, `.attachTooltipLabel()`, `.closeOverflowMenu()`, `.constructor()`, `.destroy()`, `.getMaxVisibleTabs()`, `.openOverflowMenu()`, `.partitionItems()`, `.positionOverflowMenu()`, `.render()`, `.renderBackgroundTaskState()`, `.renderOverflowButton()`, `.renderTabItem()`, `.shouldOpenOverflowAbove()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (6 nodes): `FocusContextMarkdownViewLocator.ts`, `FocusContextMarkdownViewLocator`, `.constructor()`, `.getActiveMarkdownView()`, `.getMarkdownViews()`, `.rememberMarkdownFilePath()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (5 nodes): `ComposerContextEventBridge`, `.constructor()`, `.dispose()`, `.start()`, `ComposerContextEventBridge.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (5 nodes): `ContextFileCatalogEventBridge`, `.constructor()`, `.dispose()`, `.start()`, `ContextFileCatalogEventBridge.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `Community 1` to `Community 0`, `Community 2`, `Community 3`, `Community 4`, `Community 5`, `Community 6`, `Community 7`, `Community 8`, `Community 9`, `Community 10`, `Community 11`, `Community 12`, `Community 14`, `Community 15`, `Community 16`, `Community 19`, `Community 23`, `Community 27`, `Community 28`, `Community 29`, `Community 32`, `Community 34`, `Community 36`, `Community 38`, `Community 39`, `Community 41`?**
  _High betweenness centrality (0.418) - this node is a cross-community bridge._
- **Why does `OpenCodianView` connect `Community 0` to `Community 2`, `Community 3`, `Community 4`, `Community 5`, `Community 6`, `Community 36`, `Community 10`, `Community 11`, `Community 13`, `Community 14`, `Community 16`, `Community 19`?**
  _High betweenness centrality (0.130) - this node is a cross-community bridge._
- **Why does `OpenCodeService` connect `Community 7` to `Community 1`, `Community 4`, `Community 5`, `Community 8`, `Community 10`, `Community 12`, `Community 17`, `Community 26`?**
  _High betweenness centrality (0.064) - this node is a cross-community bridge._
- **Are the 362 inferred relationships involving `t()` (e.g. with `.getEmptyConversationTitle()` and `.generateDefaultTitle()`) actually correct?**
  _`t()` has 362 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._