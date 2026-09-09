# Graph Report - src  (2026-09-09)

## Graph Freshness
- Source digest: `9cc4ce9eaf25a9466644b94abfee9d44339d5e8db4ce947155ae942a78193d29`
- Generated at: 2026-09-09T11:06:51.540Z
- HEAD at generation: `5a55da286336851f7f4616ce822d76bf29d07d3f` (informational only; the content digest is the correctness signal)
- Run `npm run graphify:update:src` after `src/`, tsconfig, package/lock, ignore rules, wrapper or Graphify version changes.

## Corpus Check
- 569 files · ~707,171 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 8946 nodes · 23026 edges · 53 communities detected
- Extraction: 69% EXTRACTED · 31% INFERRED · 0% AMBIGUOUS · INFERRED: 7228 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 57|Community 57]]

## God Nodes (most connected - your core abstractions)
1. `t()` - 1099 edges
2. `OpenCodianView` - 221 edges
3. `ClaudeCodeAdapter` - 138 edges
4. `OpenCodeService` - 138 edges
5. `SettingsCapabilityLabSection` - 121 edges
6. `SettingsClaudeCodeSection` - 121 edges
7. `SettingsFormatterSection` - 109 edges
8. `CodexAdapter` - 103 edges
9. `getConversationBackendSessionId()` - 79 edges
10. `OpenCodianPlugin` - 77 edges

## Surprising Connections (you probably didn't know these)
- `normalizeSessionCommandPath()` --calls--> `normalizeContextPath()`  [INFERRED]
  src\core\opencode\OpenCodeSessionControlOrchestrator.ts → src\shared\contextPath.ts
- `shouldUseOpenCodeServerSync()` --calls--> `getConversationBackendSessionId()`  [INFERRED]
  src\features\chat\services\ConversationSyncLoadRuntimeViewHostFactory.ts → src\core\types\chat.ts
- `getQuestionResolutionAnswerText()` --calls--> `t()`  [INFERRED]
  src\features\chat\runtime\QuestionResolutionCardRenderer.ts → src\i18n\index.ts
- `resolveCodexModelProviders()` --calls--> `resolveCodexModelCatalogFromAdapter()`  [INFERRED]
  src\features\chat\services\ChatSelectionControlsCoordinator.ts → src\core\agents\backend\BackendModelCatalog.ts
- `buildClaudeCodeOptions()` --calls--> `normalizeClaudeCodeToolAliases()`  [INFERRED]
  src\core\agents\backend\ClaudeCodeOptionsBuilder.ts → src\core\types\settings.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.01
Nodes (98): renderAgentSwitcherChips(), AssistantNoticeCardRenderer, formatTurnDiffPathLabel(), truncateTurnDiffFilename(), describeCapabilityAvailability(), isUnsupportedResult(), localizeCapabilityReason(), queryCapabilities() (+90 more)

### Community 1 - "Community 1"
Cohesion: 0.01
Nodes (98): ActiveTabContextUsageCoordinator, buildStreamErrorNotice(), BackgroundConversationPostSyncHandoffCoordinator, BackgroundConversationPostSyncRefreshExecutor, assignIfDefined(), createEmptyTabContextState(), getConversationBackendSessionId(), normalizeConversationSessionSettings() (+90 more)

### Community 2 - "Community 2"
Cohesion: 0.01
Nodes (262): AgentInvocationService, buildClaudeCodeModelSelectorProviders(), buildChatAppearanceCustomCss(), ChildSessionGraphService, expandHomeDirectory(), getAugmentedPath(), getDefaultClaudeCliCandidates(), getPathDelimiter() (+254 more)

### Community 3 - "Community 3"
Cohesion: 0.01
Nodes (94): archiveBackendSession(), extractSessionDetailFields(), extractTimestamp(), extractTitleSummary(), forkBackendSession(), getActiveSessionBackendService(), getActiveSessionHistoryService(), getBackendSessionDetail() (+86 more)

### Community 4 - "Community 4"
Cohesion: 0.01
Nodes (60): ContextRing, ConversationSessionSignalRuntime, mapServerStatus(), OpenCodeAdapter, attachOpenCodeAppAgents(), OpenCodeCatalogQueryCoordinator, OpenCodeCatalogStateStore, deepCloneJsonLike() (+52 more)

### Community 5 - "Community 5"
Cohesion: 0.01
Nodes (53): AcpClientManager, removeExistingFloatingSwitcher(), BackgroundTaskInlinePanelRenderer, asRecord(), byteLength(), chunkEnvelope(), ClaudeSessionTraceService, identifiersFrom() (+45 more)

### Community 6 - "Community 6"
Cohesion: 0.01
Nodes (49): getChatAppearanceBackgroundSizeValue(), getChatAppearanceCssVariables(), getInputPanelGlassRefractionCssVariables(), ChatRuntimeComposition, ChatSurfaceAppearanceCoordinator, createCodexMcpServerDetailHost(), assembleConversationHydrationRuntime(), createConversationHydrationRuntimeBridges() (+41 more)

### Community 7 - "Community 7"
Cohesion: 0.01
Nodes (42): BackgroundTaskIndicatorCoordinator, BackgroundTaskLiveSignalCoordinator, createBackgroundTaskLiveSignalCoordinatorHost(), BackgroundTaskNoticeStateService, BackgroundTaskStreamTriggerCoordinator, BackgroundTaskTimelineAssemblyService, BackgroundTaskTimelineLaunchService, BackgroundTaskTimelineService (+34 more)

### Community 8 - "Community 8"
Cohesion: 0.02
Nodes (112): buildCodexModelSelectorProviders(), resolveCodexModelCatalogFromAdapter(), appendSdkSignalChunk(), appendUsageChunk(), ClaudeCodeStreamNormalizer, isRecord(), isTextBlock(), isThinkingBlock() (+104 more)

### Community 9 - "Community 9"
Cohesion: 0.02
Nodes (126): ClaudeManagedSettingsDiscovery, errorCode(), readClaudeCommandContent(), ClaudeSettingsSourceService, errorCode(), applyTomlScalarEdits(), buildProjectConfigEdits(), escapeRegex() (+118 more)

### Community 10 - "Community 10"
Cohesion: 0.01
Nodes (123): buildLobehubDefinitions(), buildOpencodeDefinitions(), computeMatchScore(), createDefinition(), findBuiltinIcon(), formatBuiltinSource(), getBuiltinIcon(), getDisplayName() (+115 more)

### Community 11 - "Community 11"
Cohesion: 0.02
Nodes (125): areChatAppearanceSettingsEqual(), diffObject(), getBuiltinThemePresets(), getThemeAppearanceOverridesFromBase(), getThemePresetDefinition(), hasThemeAppearanceOverrides(), mergePartialChatAppearanceSettings(), resolveThemeChatAppearance() (+117 more)

### Community 12 - "Community 12"
Cohesion: 0.02
Nodes (25): McpServerStatusModal, redactMcpSensitiveText(), redactMcpTechnicalDetails(), redactUnknownSecretValues(), statusLabel(), summarizeCommand(), transportSummary(), OpenCodePromptRequestBuilder (+17 more)

### Community 13 - "Community 13"
Cohesion: 0.02
Nodes (55): buildComposerContextChipStates(), createFocusContextPreview(), getContextTargetKey(), getPromptContextTargetKey(), removeDraftContextItemsByTarget(), resolveFocusContextPreview(), upsertDraftContextItem(), ComposerContextActionService (+47 more)

### Community 14 - "Community 14"
Cohesion: 0.02
Nodes (19): getSettingPageCtor(), OpenCodianSettingTab, OpenCodianSettingsView, SettingsClaudeProviderMetadataPersistenceCoordinator, getActiveSecondaryTabId(), getPrimaryTabDefinition(), resolvePrimaryTabId(), resolveSecondaryTabId() (+11 more)

### Community 15 - "Community 15"
Cohesion: 0.02
Nodes (39): CodexAdapter, isExecutableMissingError(), isRecordLike(), readCommandString(), readThreadIdFromParams(), buildEffectiveEvidenceWithApplication(), buildUniformEffectiveEvidence(), CodexAppServerClient (+31 more)

### Community 16 - "Community 16"
Cohesion: 0.02
Nodes (69): buildCommandScopedAgent(), cloneConfigObject(), cloneConfigValue(), getCommandScopedAgentId(), getCommandScopedAgentMetadata(), isCommandScopedAgentForCommand(), isCommandScopedAgentId(), mergeConfigObjects() (+61 more)

### Community 17 - "Community 17"
Cohesion: 0.02
Nodes (79): getProgrammaticScrollGuardDelayMs(), disposeCollapsiblesWithin(), ConversationHydrationOutcomeBridge, getOpenCodeActivationSessionId(), ConversationHydrationRenderBridge, ConversationIdentityRuntime, ConversationKeyedReconcileDelegate, beginConversationRenderSurfacePass() (+71 more)

### Community 18 - "Community 18"
Cohesion: 0.02
Nodes (68): registerBuiltinGlassAdapters(), buildClaudeCodeElicitationContent(), buildClaudeCodeElicitationQuestionRequest(), buildClaudeCodeUserDialogQuestionRequest(), buildClaudeCodeUserDialogResult(), coerceElicitationScalarAnswer(), getHeader(), getSchemaProperties() (+60 more)

### Community 19 - "Community 19"
Cohesion: 0.02
Nodes (5): ChatVisualDemoCoordinator, LspStatusIndicator, SettingsFormatterSection, SettingsStyleControls, TooltipLayerController

### Community 20 - "Community 20"
Cohesion: 0.02
Nodes (41): buildLocalStreamOutcome(), ClaudeSettingsCommonFieldsPresenter, ClaudeUserMessageIdentityBackfillService, setBackfillPersistenceHost(), buildConversationMetaFromStoredRecord(), cloneConversationListDiagnostics(), ConversationMetadataCache, getUtf8ByteLength() (+33 more)

### Community 21 - "Community 21"
Cohesion: 0.02
Nodes (39): AgentMentionComposerController, filterAgentMentionCandidates(), findSingleTextEdit(), getEmptyAgentMentionMenuStatus(), isAtomicMentionEditKey(), isPrintableEditKey(), scrollSelectedItemIntoView(), updateTrackedMentionRanges() (+31 more)

### Community 22 - "Community 22"
Cohesion: 0.02
Nodes (37): AnchoredOverlayLayoutController, calculateAnchoredOverlayLayout(), roundGeometry(), applyPassiveScrollMeasurement(), applyUserScrollIntent(), getDistanceFromBottom(), hasProgrammaticScrollGuard(), isNearBottom() (+29 more)

### Community 23 - "Community 23"
Cohesion: 0.02
Nodes (23): resolveToolKind(), LspStatusRefreshCoordinator, PluginManagementService, isOpenCodeSettingsBackendActive(), resolveSettingsActiveBackend(), SettingsBackendSection, applyInlineCodeText(), buildInlineCodeFragment() (+15 more)

### Community 24 - "Community 24"
Cohesion: 0.02
Nodes (32): AdditionalDirectoriesConfigBadgeCoordinator, readAdditionalDirectoriesFromPlugin(), readOpenCodianPlugin(), pinAgentSwitcherToSettingsEdge(), renderAgentSwitcherBackendIcon(), renderAgentSwitcherFloatingIcons(), renderAgentSwitcherHeaderIcons(), renderAgentSwitcherIcon() (+24 more)

### Community 25 - "Community 25"
Cohesion: 0.03
Nodes (38): MarkdownRenderScheduler, detectMcpAuthError(), applyMcpAuthOutcome(), applyMcpRetryOutcome(), cssEscape(), getMcpServerName(), renderMcpExpandedContent(), renderMcpServerChip() (+30 more)

### Community 26 - "Community 26"
Cohesion: 0.03
Nodes (118): ContextDetailModal, applyDisplacementSnapshot(), applyHostTransform(), buildBackdropFilterValue(), buildFallbackBackdropFilterValue(), clamp(), createFaceSvgElement(), createStageLayerElement() (+110 more)

### Community 27 - "Community 27"
Cohesion: 0.03
Nodes (27): ChildSessionGraphCoordinator, appendText(), bindDisclosure(), ClaudeSettingsContextSourcesPresenter, claudeSettingsScopeLabel(), clearChildren(), createActionButton(), createDisclosureToggle() (+19 more)

### Community 28 - "Community 28"
Cohesion: 0.03
Nodes (29): buildFragmentWithLinks(), createWikilinkElement(), createWikilinkPattern(), extractLinkTarget(), fileExistsInVault(), findWikilinks(), processFileLinks(), processTextNode() (+21 more)

### Community 29 - "Community 29"
Cohesion: 0.03
Nodes (21): wireHiddenAdapters(), AgentServiceRegistry, expandHomeDirectory(), getPathApi(), getPathDelimiter(), getPathFallbacks(), getPathValue(), getSearchDirectories() (+13 more)

### Community 30 - "Community 30"
Cohesion: 0.04
Nodes (4): LocalSidecarEndpointResolver, LocalSidecarLauncher, LocalProcessProbe, ServerManager

### Community 31 - "Community 31"
Cohesion: 0.03
Nodes (31): extractAssistantStructuredTextCopyContent(), resolveAssistantCopyContent(), AssistantErrorRenderer, buildErrorAssistantFooterPayload(), buildNoticeAssistantFooterPayload(), buildPersistedAssistantFooterPayload(), buildPseudoStreamAssistantFooterPayload(), resolvePersistedAssistantFooterStatusLabel() (+23 more)

### Community 32 - "Community 32"
Cohesion: 0.04
Nodes (18): AcpTransportOwner, translateAcpMessageChunk(), translateAcpToolCall(), translateAcpToolCallUpdate(), ClaudeCodeAsyncQueue, classifyProbeFailure(), hasMinimumServer117Hint(), isFunction() (+10 more)

### Community 33 - "Community 33"
Cohesion: 0.04
Nodes (23): buildClaudeSettingsCommonFieldEdit(), isPlainObject(), matchesKind(), isRecord(), matchesConfirmedTarget(), OpenCodeSdkExperimentalActionCoordinator, PiAdapter, piRecord() (+15 more)

### Community 34 - "Community 34"
Cohesion: 0.05
Nodes (61): clamp(), createStageLayerElement(), createSvgElement(), estimateProjectionDelta(), formatNumber(), generateFilterId(), GlassOctahedronDemoController, maxRenderQuality() (+53 more)

### Community 35 - "Community 35"
Cohesion: 0.04
Nodes (9): AgentCatalogService, SurfaceAgentBuilder, AgentMentionCandidateService, normalizeRuntimeAgents(), MarkdownAgentWorkspaceService, parseFrontmatter(), SettingsAgentsSection, SystemAgentGuardService (+1 more)

### Community 36 - "Community 36"
Cohesion: 0.07
Nodes (16): formatTimestamp(), ModelPricingModal, parseRate(), addPricedTokens(), buildBackendReportedCostDetails(), buildUnavailableCostDetails(), hasConfiguredRate(), inferProviderId() (+8 more)

### Community 37 - "Community 37"
Cohesion: 0.11
Nodes (48): applyBackdropFilterValue(), applyGlassTint(), applyInstanceMarker(), applyShellInteractiveStyles(), buildFallbackBackdropFilterValue(), buildSvgBackdropFilterValue(), clamp(), cleanupInstanceArtifacts() (+40 more)

### Community 38 - "Community 38"
Cohesion: 0.09
Nodes (4): ModelConfigModelListEditor, ModelConfigProviderEditor, ModelConfigStructuredOptionsEditor, isSafeProviderExtraOptionForVisualEditor()

### Community 39 - "Community 39"
Cohesion: 0.11
Nodes (40): applyFilterLayerStyles(), applyShellStyles(), buildBackdropFilterValue(), buildEdgeBandWeight(), buildFallbackBackdropFilterValue(), buildFilterLayerBoxShadow(), captureDatasetSnapshot(), captureStyleSnapshot() (+32 more)

### Community 40 - "Community 40"
Cohesion: 0.15
Nodes (23): buildAskUserQuestionInput(), ClaudeCodePermissionBridge, cloneInput(), createAllowResult(), createDenyResult(), destinationOf(), getToolUseID(), isAskUserQuestion() (+15 more)

### Community 41 - "Community 41"
Cohesion: 0.14
Nodes (1): ContextUsageDisplayService

### Community 42 - "Community 42"
Cohesion: 0.15
Nodes (18): asRecord(), mapAgentMessageDelta(), mapAgentMessageItem(), mapAppServerNotification(), mapErrorNotification(), mapFileChangeItem(), mapFileChangePaths(), mapItemNotification() (+10 more)

### Community 43 - "Community 43"
Cohesion: 0.14
Nodes (15): createBackgroundConversationPostSyncHandoffServices(), createBackgroundConversationPostSyncHandoffViewHostAdapter(), createPostSyncQuestionTodoRefreshHosts(), createPostSyncQuestionTodoRefreshServices(), createQuestionTodoBackgroundTaskActivationHosts(), createQuestionTodoBackgroundTaskActivationServices(), createQuestionTodoBackgroundTaskActivationViewHostAdapter(), createQuestionTodoBackgroundTaskRefreshServices() (+7 more)

### Community 44 - "Community 44"
Cohesion: 0.19
Nodes (20): buildTrailingAssistantPatchCompletionDebugPlan(), buildTrailingAssistantPatchCompletionDebugPlanFromTailOutcomePlanningContext(), buildTrailingAssistantPatchCompletionDebugPlanningContext(), buildTrailingAssistantPatchCompletionDebugPlanningContextInputs(), buildTrailingAssistantPatchCompletionDebugPlanningContextShape(), buildTrailingAssistantPatchCompletionDebugPlanningContextSourceContract(), buildTrailingAssistantPatchCompletionDebugSourceContractFromTailOutcomePlanningContext(), buildTrailingAssistantPatchCompletionDebugSummaryPlan() (+12 more)

### Community 45 - "Community 45"
Cohesion: 0.19
Nodes (2): QuestionDock, isQuestionAnswerComplete()

### Community 46 - "Community 46"
Cohesion: 0.39
Nodes (1): CodexReadbackModal

### Community 47 - "Community 47"
Cohesion: 0.4
Nodes (1): ClaudeCodeHelpModal

### Community 48 - "Community 48"
Cohesion: 0.4
Nodes (1): BackgroundTaskCompletionNoticeService

### Community 49 - "Community 49"
Cohesion: 0.4
Nodes (1): ComposerContextEventBridge

### Community 50 - "Community 50"
Cohesion: 0.4
Nodes (1): ContextFileCatalogEventBridge

### Community 53 - "Community 53"
Cohesion: 1.0
Nodes (2): adaptMcpConfigForClaude(), adaptSingleMcpEntry()

### Community 57 - "Community 57"
Cohesion: 1.0
Nodes (1): WebSocket

## Knowledge Gaps
- **5 isolated node(s):** `ArchiveIntegrityError`, `PathConfinementError`, `SourceUnavailableError`, `PackageValidationError`, `WebSocket`
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 41`** (30 nodes): `ContextUsageDisplayService`, `.buildBreakdownSegments()`, `.buildDisplayTokenBreakdown()`, `.buildUnavailableSummary()`, `.calculatePercentage()`, `.collectBreakdownChars()`, `.estimateBreakdownTokens()`, `.estimateTokens()`, `.fitBreakdownTokens()`, `.formatCumulativeTotal()`, `.formatCurrency()`, `.formatNumber()`, `.formatPercent()`, `.getAssistantCharsFromMessage()`, `.getAssistantCharsFromPart()`, `.getContextBreakdown()`, `.getCurrentContextSnapshot()`, `.getDisplayTokenBreakdown()`, `.getNestedStringField()`, `.getObjectField()`, `.getParts()`, `.getStringField()`, `.getToolChars()`, `.getUnknownField()`, `.getUserCharsFromMessage()`, `.getUserCharsFromPart()`, `.isRecord()`, `.stringifyUnknown()`, `.summarize()`, `ContextUsageDisplayService.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (19 nodes): `QuestionDock.ts`, `QuestionDock`, `.attachPreviewHandlers()`, `.collectAnswerFromSection()`, `.constructor()`, `.destroy()`, `.focusOptionInput()`, `.getOptionInputs()`, `.handleOptionFocusKey()`, `.handleQuestionKeydown()`, `.handleSubmitOrNext()`, `.render()`, `.renderBody()`, `.renderFooter()`, `.renderHeader()`, `.renderTabs()`, `.toggleCollapsed()`, `.toggleOptionInput()`, `isQuestionAnswerComplete()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (8 nodes): `CodexReadbackModal`, `.constructor()`, `.load()`, `.onOpen()`, `.renderShell()`, `.renderStateMessage()`, `.setState()`, `CodexReadbackModal.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (6 nodes): `ClaudeCodeHelpModal`, `.appendSection()`, `.constructor()`, `.onClose()`, `.onOpen()`, `ClaudeCodeHelpModal.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (5 nodes): `BackgroundTaskCompletionNoticeService`, `.constructor()`, `.flushQueuedNotices()`, `.queueNotices()`, `BackgroundTaskCompletionNoticeService.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (5 nodes): `ComposerContextEventBridge`, `.constructor()`, `.dispose()`, `.start()`, `ComposerContextEventBridge.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (5 nodes): `ContextFileCatalogEventBridge`, `.constructor()`, `.dispose()`, `.start()`, `ContextFileCatalogEventBridge.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (3 nodes): `adaptMcpConfigForClaude()`, `adaptSingleMcpEntry()`, `ClaudeCodeMcpConfigAdapter.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 57`** (2 nodes): `ws-shim.d.ts`, `WebSocket`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `Community 0` to `Community 1`, `Community 2`, `Community 3`, `Community 4`, `Community 5`, `Community 6`, `Community 7`, `Community 8`, `Community 9`, `Community 10`, `Community 11`, `Community 12`, `Community 13`, `Community 14`, `Community 15`, `Community 16`, `Community 17`, `Community 18`, `Community 19`, `Community 20`, `Community 21`, `Community 22`, `Community 23`, `Community 24`, `Community 25`, `Community 26`, `Community 27`, `Community 28`, `Community 29`, `Community 31`, `Community 33`, `Community 35`, `Community 36`, `Community 38`, `Community 41`, `Community 45`, `Community 46`, `Community 47`?**
  _High betweenness centrality (0.323) - this node is a cross-community bridge._
- **Why does `OpenCodianView` connect `Community 6` to `Community 1`, `Community 2`, `Community 3`, `Community 4`, `Community 5`, `Community 7`, `Community 8`, `Community 9`, `Community 13`, `Community 14`, `Community 15`, `Community 17`, `Community 18`, `Community 19`, `Community 21`, `Community 22`, `Community 24`, `Community 25`, `Community 29`, `Community 31`, `Community 32`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **Why does `getConversationBackendSessionId()` connect `Community 1` to `Community 2`, `Community 4`, `Community 6`, `Community 7`, `Community 17`, `Community 18`, `Community 20`, `Community 25`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Are the 1098 inferred relationships involving `t()` (e.g. with `.getEmptyConversationTitle()` and `.generateDefaultTitle()`) actually correct?**
  _`t()` has 1098 INFERRED edges - model-reasoned connections that need verification._
- **What connects `ArchiveIntegrityError`, `PathConfinementError`, `SourceUnavailableError` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._