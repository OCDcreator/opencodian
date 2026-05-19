# Graph Report - /Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/src  (2026-05-19)

## Corpus Check
- 401 files · ~360,595 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 5613 nodes · 12877 edges · 82 communities detected
- Extraction: 72% EXTRACTED · 28% INFERRED · 0% AMBIGUOUS · INFERRED: 3633 edges (avg confidence: 0.8)
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

## God Nodes (most connected - your core abstractions)
1. `t()` - 591 edges
2. `OpenCodianView` - 182 edges
3. `OpenCodeService` - 127 edges
4. `SettingsFormatterSection` - 96 edges
5. `OpenCodianPlugin` - 65 edges
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
Nodes (65): AssistantNoticeCardRenderer, ComposerContextEventBridge, t(), McpServerEditorModal, ModelConfigJsonModal, ModelConfigModelListEditor, ModelConfigProviderEditor, ModelConfigStructuredOptionsEditor (+57 more)

### Community 1 - "Community 1"
Cohesion: 0.01
Nodes (162): AgentInvocationService, BackgroundTaskTimelineLaunchService, buildChatAppearanceCustomCss(), collectMarkdownFiles(), loadCommandsFromConfigDir(), loadCommandsFromMdFiles(), parseFrontmatter(), LiquidGlassSettingHelpModal (+154 more)

### Community 2 - "Community 2"
Cohesion: 0.01
Nodes (63): AssistantErrorRenderer, applyPassiveScrollMeasurement(), applyUserScrollIntent(), getDistanceFromBottom(), getProgrammaticScrollGuardDelayMs(), hasProgrammaticScrollGuard(), isNearBottom(), BackgroundTaskTimelineService (+55 more)

### Community 3 - "Community 3"
Cohesion: 0.02
Nodes (99): ConversationSessionSettingsModal, areChatAppearanceSettingsEqual(), diffObject(), getBuiltinThemePresets(), getThemeAppearanceOverridesFromBase(), getThemePresetDefinition(), hasThemeAppearanceOverrides(), mergePartialChatAppearanceSettings() (+91 more)

### Community 4 - "Community 4"
Cohesion: 0.02
Nodes (38): LspStatusRefreshCoordinator, OpenCodeCatalogQueryCoordinator, OpenCodeCatalogStateStore, OpenCodeEventSubscriptionCoordinator, OpenCodeMessageNormalizationMapper, isTransientQuestionMutationError(), normalizePermissionRequest(), normalizePermissionResponse() (+30 more)

### Community 5 - "Community 5"
Cohesion: 0.01
Nodes (38): getChatAppearanceBackgroundSizeValue(), getChatAppearanceCssVariables(), getInputPanelGlassRefractionCssVariables(), ChatSurfaceAppearanceCoordinator, assembleConversationHydrationRuntime(), createConversationHydrationRuntimeBridges(), createConversationHydrationRuntimeViewHosts(), createConversationRenderHost() (+30 more)

### Community 6 - "Community 6"
Cohesion: 0.02
Nodes (43): normalizeConversationSessionSettings(), buildConversationMetaFromStoredRecord(), cloneConversationListDiagnostics(), ConversationMetadataCache, getUtf8ByteLength(), trackTopDiagnosticEntries(), cloneFormatterConfigValue(), readFormatterConfigValue() (+35 more)

### Community 7 - "Community 7"
Cohesion: 0.02
Nodes (20): BackgroundTaskCompletionNoticeService, BackgroundTaskIndicatorCoordinator, BackgroundTaskLiveSignalCoordinator, createBackgroundTaskLiveSignalCoordinatorHost(), BackgroundTaskNoticeStateService, BackgroundTaskStreamTriggerCoordinator, BackgroundTaskTimelineAssemblyService, ContextRing (+12 more)

### Community 8 - "Community 8"
Cohesion: 0.02
Nodes (53): buildComposerContextChipStates(), createFocusContextPreview(), getContextTargetKey(), getPromptContextTargetKey(), removeDraftContextItemsByTarget(), resolveFocusContextPreview(), upsertDraftContextItem(), ComposerContextActionService (+45 more)

### Community 9 - "Community 9"
Cohesion: 0.02
Nodes (78): AcpClientManager, registerBuiltinGlassAdapters(), ConversationTurnViewModelBuilder, getMessageParentId(), getRecordString(), isRecord(), ConversationWriteSerializationService, createConversationWriteSerializationState() (+70 more)

### Community 10 - "Community 10"
Cohesion: 0.02
Nodes (11): OpenCodianSettingTab, OpenCodianSettingsView, SettingsAcpSection, getElectronDialog(), SettingsDebugSection, getActiveSecondaryTabId(), getPrimaryTabDefinition(), resolvePrimaryTabId() (+3 more)

### Community 11 - "Community 11"
Cohesion: 0.02
Nodes (24): assembleConversationLoadRecovery(), ConversationLoadRecoveryCoordinator, createConversationLoadRecoveryHost(), ConversationTabLifecycleRecoveryCoordinator, ConversationTabOpenCoordinator, ConversationTabRuntimeCoordinator, createConversationTabRuntimeCoordinator(), createConversationTabRuntimeCoordinatorHost() (+16 more)

### Community 12 - "Community 12"
Cohesion: 0.02
Nodes (43): ActiveTabContextUsageCoordinator, buildStreamErrorNotice(), createEmptyTabContextState(), ChatSelectionControlsCoordinator, ContextUsageService, ConversationViewStateService, getDefaultDebugModuleSettings(), isDebugModuleKey() (+35 more)

### Community 13 - "Community 13"
Cohesion: 0.02
Nodes (15): ChatVisualDemoCoordinator, cloneConversationMetadataOnly(), ConversationFullMessageCache, ConversationHistoryActionsCoordinator, ConversationHistoryDialogService, formatDurationMs(), OpenCodianPlugin, OpenCodianStartupCoordinator (+7 more)

### Community 14 - "Community 14"
Cohesion: 0.02
Nodes (15): AcpTransportOwner, translateAcpMessageChunk(), translateAcpToolCall(), translateAcpToolCallUpdate(), OpenCodePromptRequestBuilder, buildCanonicalConversationFingerprintPayload(), cloneSettings(), getDebugTextPreview() (+7 more)

### Community 15 - "Community 15"
Cohesion: 0.03
Nodes (32): OpenCodeLegacySseStreamReader, extractRenderableToolMetadata(), OpenCodeToolContentAssembler, resolveOpenCodeToolKind(), resolveToolResultVisibility(), extractRenderableToolMetadata(), extractStructuredErrorMessage(), extractStructuredErrorName() (+24 more)

### Community 16 - "Community 16"
Cohesion: 0.02
Nodes (35): extractAssistantStructuredTextCopyContent(), resolveAssistantCopyContent(), buildErrorAssistantFooterPayload(), buildNoticeAssistantFooterPayload(), buildPersistedAssistantFooterPayload(), buildPseudoStreamAssistantFooterPayload(), resolvePersistedAssistantFooterStatusLabel(), AssistantFooterRenderer (+27 more)

### Community 17 - "Community 17"
Cohesion: 0.03
Nodes (120): applyDisplacementSnapshot(), applyHostTransform(), buildBackdropFilterValue(), buildFallbackBackdropFilterValue(), clamp(), createFaceSvgElement(), createStageLayerElement(), createState() (+112 more)

### Community 18 - "Community 18"
Cohesion: 0.03
Nodes (32): AgentMentionComposerController, filterAgentMentionCandidates(), findSingleTextEdit(), getEmptyAgentMentionMenuStatus(), isAtomicMentionEditKey(), isPrintableEditKey(), scrollSelectedItemIntoView(), updateTrackedMentionRanges() (+24 more)

### Community 19 - "Community 19"
Cohesion: 0.03
Nodes (78): ConversationIdentityRuntime, ConversationAssistantMessageRenderDelegate, ConversationMessageRenderDelegate, ConversationUserMessageRenderDelegate, getIncrementalRenderedMessageUpdate(), TrailingAssistantPatchPlanningDelegate, buildMessageRenderGroups(), extractTextContent() (+70 more)

### Community 20 - "Community 20"
Cohesion: 0.03
Nodes (81): buildLobehubDefinitions(), buildOpencodeDefinitions(), computeMatchScore(), createDefinition(), findBuiltinIcon(), formatBuiltinSource(), getBuiltinIcon(), getDisplayName() (+73 more)

### Community 21 - "Community 21"
Cohesion: 0.04
Nodes (4): LocalSidecarEndpointResolver, LocalSidecarLauncher, LocalProcessProbe, ServerManager

### Community 22 - "Community 22"
Cohesion: 0.04
Nodes (9): BackgroundTaskInlinePanelRenderer, ChildSessionGraphCoordinator, EffortSelector, formatVariantLabel(), NavigationSidebar, SessionTodoDock, queueSkillServiceRestart(), restartLocalServiceAfterSkillCatalogWrite() (+1 more)

### Community 23 - "Community 23"
Cohesion: 0.04
Nodes (9): buildModelPickerGroups(), filterModelPickerGroups(), findModelPickerOption(), findModelPickerOptionByRef(), ModelPickerModal, SettingsModelCatalogCoordinator, SettingsModelCatalogPresenter, SettingsModelIconCacheManager (+1 more)

### Community 24 - "Community 24"
Cohesion: 0.03
Nodes (30): buildFragmentWithLinks(), createWikilinkElement(), createWikilinkPattern(), extractLinkTarget(), fileExistsInVault(), findWikilinks(), processFileLinks(), processTextNode() (+22 more)

### Community 25 - "Community 25"
Cohesion: 0.05
Nodes (61): clamp(), createStageLayerElement(), createSvgElement(), estimateProjectionDelta(), formatNumber(), generateFilterId(), GlassOctahedronDemoController, maxRenderQuality() (+53 more)

### Community 26 - "Community 26"
Cohesion: 0.03
Nodes (15): AgentCatalogService, SurfaceAgentBuilder, AgentMentionCandidateService, normalizeRuntimeAgents(), MarkdownAgentWorkspaceService, parseFrontmatter(), SettingsAgentsSection, appendSyntheticBuiltinCommands() (+7 more)

### Community 27 - "Community 27"
Cohesion: 0.05
Nodes (4): SettingsConversationSection, addSettingHelpButton(), createSettingsBlock(), SettingsStyleControls

### Community 28 - "Community 28"
Cohesion: 0.04
Nodes (11): SessionPermissionTracker, PermissionInlineCardRenderer, QuestionDockResolutionActionFacade, QuestionInlineCardRenderer, QuestionInlineResolutionActionFacade, QuestionResolutionCoordinator, createQuestionRejectExecutionAction(), createQuestionReplyExecutionAction() (+3 more)

### Community 29 - "Community 29"
Cohesion: 0.07
Nodes (53): createComposerGlassFilterElement(), createSvgElement(), ensureComposerGlassSvgDefs(), ensureComposerGlassSvgRootElement(), InputPanelThemeRuntime, applyBackdropFilterValue(), applyGlassTint(), applyInstanceMarker() (+45 more)

### Community 30 - "Community 30"
Cohesion: 0.06
Nodes (9): PluginManagementService, applyInlineCodeText(), buildInlineCodeFragment(), renderLanguageSetting(), renderSettingsPanelTitle(), resolvePluginAssetUrl(), setSettingDescWithFormatting(), setSettingNameWithFormatting() (+1 more)

### Community 31 - "Community 31"
Cohesion: 0.09
Nodes (10): McpServerStatusModal, redactMcpSensitiveText(), redactMcpTechnicalDetails(), redactUnknownSecretValues(), statusLabel(), summarizeCommand(), transportSummary(), SettingsMcpSection (+2 more)

### Community 32 - "Community 32"
Cohesion: 0.09
Nodes (3): ContextDetailModal, ContextUsageDisplayService, getLocale()

### Community 33 - "Community 33"
Cohesion: 0.06
Nodes (8): BackgroundConversationPostSyncHandoffCoordinator, BackgroundConversationPostSyncRefreshExecutor, ConversationSyncBackgroundPostSyncRouter, ConversationSyncVisiblePostSyncRouter, PostSyncQuestionTodoRefreshFacade, PostSyncQuestionTodoRefreshPlanBuilder, VisibleConversationPostSyncCoordinator, VisibleConversationPostSyncStateCoordinator

### Community 34 - "Community 34"
Cohesion: 0.12
Nodes (32): buildCommandScopedAgent(), cloneConfigObject(), cloneConfigValue(), getCommandScopedAgentId(), getCommandScopedAgentMetadata(), isCommandScopedAgentForCommand(), isCommandScopedAgentId(), mergeConfigObjects() (+24 more)

### Community 35 - "Community 35"
Cohesion: 0.09
Nodes (5): ComposerContextViewFacade, createComposerContextServices(), ComposerContextViewHostAdapter, createFocusContextServices(), FocusContextViewHostAdapter

### Community 36 - "Community 36"
Cohesion: 0.13
Nodes (4): ContextFileCatalogBuildRunner, ContextFileCatalogIndex, createContextFileEntry(), ContextFileCatalogService

### Community 37 - "Community 37"
Cohesion: 0.14
Nodes (15): createBackgroundConversationPostSyncHandoffServices(), createBackgroundConversationPostSyncHandoffViewHostAdapter(), createPostSyncQuestionTodoRefreshHosts(), createPostSyncQuestionTodoRefreshServices(), createQuestionTodoBackgroundTaskActivationHosts(), createQuestionTodoBackgroundTaskActivationServices(), createQuestionTodoBackgroundTaskActivationViewHostAdapter(), createQuestionTodoBackgroundTaskRefreshServices() (+7 more)

### Community 38 - "Community 38"
Cohesion: 0.28
Nodes (1): ChildSessionGraphService

### Community 39 - "Community 39"
Cohesion: 0.24
Nodes (12): applyUserMessageTextHighlightSpans(), buildCodeFence(), extractExpandedSkillNames(), extractUserMessageAgentHighlightSpans(), extractUserMessageCommandHighlightSpans(), extractUserMessageTextHighlightSpans(), getHighlightClassName(), isExpandedSkillToken() (+4 more)

### Community 40 - "Community 40"
Cohesion: 0.39
Nodes (1): ServerSettingHelpModal

### Community 41 - "Community 41"
Cohesion: 0.39
Nodes (1): ConversationCompactionHelpModal

### Community 42 - "Community 42"
Cohesion: 0.4
Nodes (1): ContextFileCatalogEventBridge

### Community 43 - "Community 43"
Cohesion: 1.0
Nodes (0):

### Community 44 - "Community 44"
Cohesion: 1.0
Nodes (0):

### Community 45 - "Community 45"
Cohesion: 1.0
Nodes (0):

### Community 46 - "Community 46"
Cohesion: 1.0
Nodes (0):

### Community 47 - "Community 47"
Cohesion: 1.0
Nodes (0):

### Community 48 - "Community 48"
Cohesion: 1.0
Nodes (0):

### Community 49 - "Community 49"
Cohesion: 1.0
Nodes (0):

### Community 50 - "Community 50"
Cohesion: 1.0
Nodes (0):

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

## Knowledge Gaps
- **Thin community `Community 43`** (2 nodes): `isCommandBlocked()`, `BlocklistChecker.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (2 nodes): `setupCollapsible()`, `collapsible.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (1 nodes): `jsx-shim.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (1 nodes): `toolNames.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (1 nodes): `opencodeConfig.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (1 nodes): `tools.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (1 nodes): `modelConfig.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 57`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 58`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 59`** (1 nodes): `sdkTypes.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 60`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 61`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 62`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 63`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 64`** (1 nodes): `SendPipelineTypes.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 65`** (1 nodes): `trailingAssistantPatchTypes.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 66`** (1 nodes): `ComposerContextHostAdapter.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 67`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 68`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 69`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 70`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 71`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 72`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 73`** (1 nodes): `providerIconTypes.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 74`** (1 nodes): `lobehubIconManifest.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 75`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 76`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 77`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 78`** (1 nodes): `en.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 79`** (1 nodes): `zh.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 80`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 81`** (1 nodes): `three.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `Community 0` to `Community 1`, `Community 2`, `Community 3`, `Community 5`, `Community 6`, `Community 7`, `Community 8`, `Community 9`, `Community 10`, `Community 11`, `Community 12`, `Community 13`, `Community 16`, `Community 17`, `Community 18`, `Community 19`, `Community 20`, `Community 22`, `Community 23`, `Community 24`, `Community 26`, `Community 27`, `Community 28`, `Community 30`, `Community 31`, `Community 32`, `Community 34`, `Community 40`, `Community 41`?**
  _High betweenness centrality (0.437) - this node is a cross-community bridge._
- **Why does `OpenCodianView` connect `Community 5` to `Community 0`, `Community 2`, `Community 6`, `Community 7`, `Community 8`, `Community 10`, `Community 11`, `Community 13`, `Community 14`, `Community 16`, `Community 18`, `Community 19`, `Community 24`, `Community 26`, `Community 28`?**
  _High betweenness centrality (0.082) - this node is a cross-community bridge._
- **Why does `OpenCodeService` connect `Community 14` to `Community 0`, `Community 1`, `Community 4`, `Community 5`, `Community 6`, `Community 7`, `Community 9`, `Community 13`, `Community 15`, `Community 24`, `Community 27`, `Community 28`, `Community 31`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Are the 590 inferred relationships involving `t()` (e.g. with `.getEmptyConversationTitle()` and `.generateDefaultTitle()`) actually correct?**
  _`t()` has 590 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.01 - nodes in this community are weakly interconnected._