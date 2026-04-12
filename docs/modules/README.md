# OpenCodian 模块功能文档

> 按源码模块组织的项目文档群。`src/**/*.ts` 原则上都应在 `docs/modules/` 下拥有一篇对应文档。

## 覆盖规则

### 一对一映射

- `src/main.ts` -> `docs/modules/entry-point/main.md`
- 其余 `src/**/foo.ts` -> `docs/modules/**/foo.md`
- `index.ts` barrel 文件也需要单独文档，重点说明导出面和聚合关系
- `i18n/locales/*.ts` 语言包也需要单独文档，重点说明键空间、用途和维护约束
- 功能目录下的 demo / experimental 辅助模块也需要纳入文档，不因“不是主流程”而跳过

### 非源码文档

以下文档不直接映射 `src/` 文件，而是补充项目基础设施信息：

- `docs/modules/README.md`
- `docs/modules/_TEMPLATE.md`
- `docs/modules/_WORKFLOW.md`
- `docs/modules/infrastructure/build-pipeline.md`
- `docs/modules/infrastructure/test-framework.md`
- `docs/modules/infrastructure/scripts.md`

### 当前基线

- `src/**/*.ts`: 当前共有 137 个 TypeScript 源码模块
- `src/style/**/*.css`: 当前共有 17 个样式模块（不含 `src/style/index.css` 聚合入口）
- `docs/modules/**/*.md`: 当前共有 153 篇模块与基础设施文档

## 文档结构

```text
docs/modules/
├── README.md                          ← 总索引与覆盖规则
├── _TEMPLATE.md                       ← 统一文档模板
├── _WORKFLOW.md                       ← 并行填充与增量更新工作流
├── entry-point/
│   └── main.md
├── core/
│   ├── config/
│   │   ├── index.md
│   │   ├── ModelConfigService.md
│   │   ├── OpencodeConfigManager.md
│   │   ├── PluginManagementService.md
│   │   └── modelConfig.md
│   ├── opencode/
│   │   ├── index.md
│   │   ├── OpenCodeService.md
│   │   ├── ServerManager.md
│   │   ├── createSdkClient.md
│   │   ├── sdkFetch.md
│   │   ├── sdkFeatureFlags.md
│   │   ├── sdkTypes.md
│   │   ├── omoCompat.md
│   │   └── types.md
│   ├── prompts/
│   │   └── titleGeneration.md
│   ├── security/
│   │   ├── index.md
│   │   └── BlocklistChecker.md
│   ├── storage/
│   │   ├── index.md
│   │   └── StorageService.md
│   ├── theme/
│   │   └── index.md
│   ├── tools/
│   │   ├── index.md
│   │   └── toolNames.md
│   └── types/
│       ├── index.md
│       ├── chat.md
│       ├── models.md
│       ├── settings.md
│       ├── opencodeConfig.md
│       ├── permission.md
│       └── tools.md
├── features/
│   ├── chat/
│   │   ├── index.md
│   │   ├── OpenCodianView.md
│   │   ├── autoScrollState.md
│   │   ├── chatAppearance.md
│   │   ├── composerContext.md
│   │   ├── forkMessages.md
│   │   ├── glassOctahedronDemo.md
│   │   ├── glassOctahedronDemoRefraction.md
│   │   ├── glassOctahedronDemoThree.md
│   │   ├── liquidDiamondDemo.md
│   │   ├── liquidDiamondDemoWebgl.md
│   │   ├── renderGroups.md
│   │   ├── runtime/
│   │   │   ├── AssistantCopyContent.md
│   │   │   ├── AssistantFooterPayload.md
│   │   │   ├── AssistantShellRenderer.md
│   │   │   ├── AssistantNoticeRenderer.md
│   │   │   ├── AssistantPlainTextFallbackRenderer.md
│   │   │   ├── AssistantStructuredContentRenderer.md
│   │   │   ├── BackgroundTaskIndicatorCoordinator.md
│   │   │   ├── BackgroundTaskInlinePanelRenderer.md
│   │   │   ├── BackgroundTaskStreamTriggerCoordinator.md
│   │   │   ├── ConversationHydrationOutcomeBridge.md
│   │   │   ├── ConversationHydrationRenderBridge.md
│   │   │   ├── ConversationLoadRuntimeBridge.md
│   │   │   ├── ConversationTransitionBridge.md
│   │   │   ├── PermissionInlineCardRenderer.md
│   │   │   ├── QuestionInlineCardRenderer.md
│   │   │   ├── QuestionResolutionCoordinator.md
│   │   │   ├── QuestionResolutionCardRenderer.md
│   │   │   ├── StreamingInlineCardRenderer.md
│   │   │   ├── buildLocalStreamOutcome.md
│   │   │   ├── LocalStreamMessagePersistence.md
│   │   │   ├── PendingIndicatorController.md
│   │   │   ├── sendPipelineContent.md
│   │   │   ├── SendPipelineRuntime.md
│   │   │   ├── SendPipelineTrace.md
│   │   │   ├── SendPipelineTypes.md
│   │   │   ├── StreamChunkRouter.md
│   │   │   ├── StreamLocalFinalizer.md
│   │   │   └── StreamShellFinalizer.md
│   │   ├── userMessageActions.md
│   │   ├── userMessageDisplay.md
│   │   ├── rendering/
│   │   │   └── collapsible.md
│   │   ├── services/
│   │   │   ├── ComposerContextActionService.md
│   │   │   ├── ComposerContextCoordinator.md
│   │   │   ├── ContextAttachmentBuilder.md
│   │   │   ├── ContextFileCatalogService.md
│   │   │   ├── FocusContextRuntimeService.md
│   │   │   ├── ContextUsageService.md
│   │   │   ├── ConversationRenderService.md
│   │   │   ├── ConversationViewStateService.md
│   │   │   ├── MessageFinalizationService.md
│   │   │   ├── MessageSendPreparationService.md
│   │   │   ├── PersistentAssistantNoticeService.md
│   │   │   ├── ScrollManager.md
│   │   │   └── TitleGenerationService.md
│   │   ├── tabs/
│   │   │   ├── index.md
│   │   │   ├── Tab.md
│   │   │   ├── TabBar.md
│   │   │   ├── TabManager.md
│   │   │   └── types.md
│   │   └── ui/
│   │       ├── ContextDetailModal.md
│   │       ├── ContextFilePickerModal.md
│   │       ├── ContextRing.md
│   │       ├── EffortSelector.md
│   │       ├── modelSelector/
│   │       │   ├── ModelSelectorDisplay.md
│   │       │   ├── ModelSelectorInteractions.md
│   │       │   ├── ModelSelectorRenderer.md
│   │       │   └── types.md
│   │       ├── NavigationSidebar.md
│   │       ├── QuestionDock.md
│   │       ├── questionDockState.md
│   │       └── SessionTodoDock.md
│   └── settings/
│       ├── index.md
│       ├── LiquidGlassSettingHelpModal.md
│       ├── ModelConfigJsonModal.md
│       ├── ModelConfigModal.md
│       ├── OpencodeConfigModal.md
│       ├── OpenCodianSettings.md
│       ├── ProviderIconCacheModal.md
│       └── ServerSettingHelpModal.md
├── i18n/
│   ├── index.md
│   └── locales/
│       ├── index.md
│       ├── en.md
│       └── zh.md
├── shared/
│   ├── contextPath.md
│   ├── index.md
│   ├── logger.md
│   ├── obsidianContext.md
│   ├── toolIdentity.md
│   ├── toolExecution.md
│   ├── vault.md
│   └── modals/
│       ├── index.md
│       └── ForkTargetModal.md
├── utils/
│   ├── index.md
│   ├── editorSelectionHighlight.md
│   ├── glass/
│   │   ├── index.md
│   │   ├── builtin-adapters.md
│   │   ├── registry.md
│   │   ├── types.md
│   │   └── adapters/
│   │       ├── nikdelvin.md
│   │       ├── shuding.md
│   │       └── shudingDiamond.md
│   ├── icons/
│   │   ├── index.md
│   │   └── ProviderIconService.md
│   ├── markdown/
│   │   ├── index.md
│   │   ├── MarkdownRenderer.md
│   │   ├── fileLink.md
│   │   ├── imageEmbed.md
│   │   └── types.md
│   └── streaming/
│       ├── index.md
│       ├── StreamController.md
│       ├── ThinkingBlockRenderer.md
│       ├── ToolCallRenderer.md
│       └── types.md
├── vendor/
│   └── three.md
├── style/
│   └── README.md
└── infrastructure/
    ├── build-pipeline.md
    ├── scripts.md
    └── test-framework.md
```

## 编写约定

每篇文档遵循统一模板，详见 [`_TEMPLATE.md`](_TEMPLATE.md)。
并行分工与后续增量维护流程，详见 [`_WORKFLOW.md`](_WORKFLOW.md)。

### 状态标记

统一使用带方括号的状态值，不使用裸字符串：

| 标记 | 含义 |
|------|------|
| `[DRAFT]` | 框架已建，仍可能缺细节或待补充 |
| `[REVIEW]` | 内容已补全，待人工审阅 |
| `[FINAL]` | 已定稿，短期内可作为稳定参考 |

### 模块类型写法

- 服务类 / 控制器类模块：重点写职责、状态、关键方法、运行时数据流
- 类型 / 常量模块：重点写导出类型、约束语义、消费方，不要硬凑“运行流程”
- `index.ts` barrel 模块：重点写“从哪里导出什么，给谁做聚合入口”
- locale 模块：重点写键空间、语言覆盖范围、与 `t()` 的协作关系
- demo / experimental 模块：重点写它接入的主功能、切换入口、清理路径和风险点

### 填写原则

- 模板中的章节是“默认骨架”，不适用时可明确写“无”或“不适用”
- 不要为了填满模板而虚构数据流、方法或配置项
- 优先写“为什么存在”和“改动时要看哪里”，其次才是重复源码细节
- 若一个模块高度依赖别处定义，文档中应直接链接或点名对应模块文档
