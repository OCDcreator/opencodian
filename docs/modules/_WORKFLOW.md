# OpenCodian 文档并行填充与增量更新工作流

> 适用对象：负责补全 `docs/modules/` 的大模型 / 代理
> 目标：让多模型并行写文档时不冲突，且后续每次代码变更后都能稳定增量同步

## 推荐并行拆分

推荐使用 6 个并行 worker。这样写入范围清晰，且负载相对均衡。

### Worker 1: 入口与 OpenCode 运行时

**写入范围**

- `docs/modules/entry-point/main.md`
- `docs/modules/core/opencode/index.md`
- `docs/modules/core/opencode/OpenCodeService.md`
- `docs/modules/core/opencode/ServerManager.md`
- `docs/modules/core/opencode/createSdkClient.md`
- `docs/modules/core/opencode/sdkFetch.md`
- `docs/modules/core/opencode/sdkFeatureFlags.md`
- `docs/modules/core/opencode/sdkTypes.md`
- `docs/modules/core/opencode/omoCompat.md`
- `docs/modules/core/opencode/types.md`

**特点**

- 依赖链深
- 需要结合 `main.ts` 理解服务装配
- 建议分配给能力最强的模型

### Worker 2: 核心配置与持久化

**写入范围**

- `docs/modules/core/config/index.md`
- `docs/modules/core/config/ModelConfigService.md`
- `docs/modules/core/config/OpencodeConfigManager.md`
- `docs/modules/core/config/PluginManagementService.md`
- `docs/modules/core/config/modelConfig.md`
- `docs/modules/core/storage/index.md`
- `docs/modules/core/storage/StorageService.md`
- `docs/modules/core/security/index.md`
- `docs/modules/core/security/BlocklistChecker.md`
- `docs/modules/core/tools/index.md`
- `docs/modules/core/tools/toolNames.md`
- `docs/modules/core/prompts/titleGeneration.md`
- `docs/modules/core/theme/index.md`

**特点**

- 以配置 schema、目录约束、文件写入和服务职责为主
- 适合中高能力模型

### Worker 3: 核心类型与国际化

**写入范围**

- `docs/modules/core/types/index.md`
- `docs/modules/core/types/chat.md`
- `docs/modules/core/types/models.md`
- `docs/modules/core/types/settings.md`
- `docs/modules/core/types/opencodeConfig.md`
- `docs/modules/core/types/permission.md`
- `docs/modules/core/types/tools.md`
- `docs/modules/i18n/index.md`
- `docs/modules/i18n/locales/index.md`
- `docs/modules/i18n/locales/en.md`
- `docs/modules/i18n/locales/zh.md`

**特点**

- 运行时逻辑少，重点是导出语义、类型边界、键空间和同步约束
- 适合快一些但足够细心的模型

### Worker 4: Shared 与 Utils

**写入范围**

- `docs/modules/shared/index.md`
- `docs/modules/shared/logger.md`
- `docs/modules/shared/obsidianContext.md`
- `docs/modules/shared/toolExecution.md`
- `docs/modules/shared/vault.md`
- `docs/modules/shared/modals/index.md`
- `docs/modules/shared/modals/ForkTargetModal.md`
- `docs/modules/utils/index.md`
- `docs/modules/vendor/three.md`
- `docs/modules/utils/editorSelectionHighlight.md`
- `docs/modules/utils/icons/index.md`
- `docs/modules/utils/icons/ProviderIconService.md`
- `docs/modules/utils/markdown/index.md`
- `docs/modules/utils/markdown/MarkdownRenderer.md`
- `docs/modules/utils/markdown/fileLink.md`
- `docs/modules/utils/markdown/imageEmbed.md`
- `docs/modules/utils/markdown/types.md`
- `docs/modules/utils/streaming/index.md`
- `docs/modules/utils/streaming/StreamController.md`
- `docs/modules/utils/streaming/ThinkingBlockRenderer.md`
- `docs/modules/utils/streaming/ToolCallRenderer.md`
- `docs/modules/utils/streaming/types.md`
- `docs/modules/utils/glass/index.md`
- `docs/modules/utils/glass/builtin-adapters.md`
- `docs/modules/utils/glass/registry.md`
- `docs/modules/utils/glass/types.md`
- `docs/modules/utils/glass/adapters/nikdelvin.md`
- `docs/modules/utils/glass/adapters/shuding.md`
- `docs/modules/utils/glass/adapters/shudingDiamond.md`

**特点**

- 文件数量多，但很多是工具型 / 类型型 / adapter 型模块
- 适合稳健、执行力强的模型

### Worker 5: Chat 主链路

**写入范围**

- `docs/modules/features/chat/index.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/autoScrollState.md`
- `docs/modules/features/chat/chatAppearance.md`
- `docs/modules/features/chat/composerContext.md`
- `docs/modules/features/chat/forkMessages.md`
- `docs/modules/features/chat/glassOctahedronDemo.md`
- `docs/modules/features/chat/glassOctahedronDemoRefraction.md`
- `docs/modules/features/chat/glassOctahedronDemoThree.md`
- `docs/modules/features/chat/liquidDiamondDemo.md`
- `docs/modules/features/chat/liquidDiamondDemoWebgl.md`
- `docs/modules/features/chat/renderGroups.md`
- `docs/modules/features/chat/userMessageActions.md`
- `docs/modules/features/chat/userMessageDisplay.md`
- `docs/modules/features/chat/rendering/collapsible.md`
- `docs/modules/features/chat/services/ContextUsageService.md`
- `docs/modules/features/chat/services/TitleGenerationService.md`

**特点**

- 高耦合、高上下文密度
- `OpenCodianView.md` 是本组核心，建议先写它，再回填周边模块

### Worker 6: Tabs、Chat UI 与 Settings

**写入范围**

- `docs/modules/features/chat/tabs/index.md`
- `docs/modules/features/chat/tabs/Tab.md`
- `docs/modules/features/chat/tabs/TabBar.md`
- `docs/modules/features/chat/tabs/TabManager.md`
- `docs/modules/features/chat/tabs/types.md`
- `docs/modules/features/chat/ui/ContextDetailModal.md`
- `docs/modules/features/chat/ui/ContextFilePickerModal.md`
- `docs/modules/features/chat/ui/ContextRing.md`
- `docs/modules/features/chat/ui/EffortSelector.md`
- `docs/modules/features/chat/ui/NavigationSidebar.md`
- `docs/modules/features/chat/ui/QuestionDock.md`
- `docs/modules/features/chat/ui/questionDockState.md`
- `docs/modules/features/chat/ui/SessionTodoDock.md`
- `docs/modules/features/settings/index.md`
- `docs/modules/features/settings/OpenCodianSettings.md`
- `docs/modules/features/settings/ModelConfigModal.md`
- `docs/modules/features/settings/ModelConfigJsonModal.md`
- `docs/modules/features/settings/OpencodeConfigModal.md`
- `docs/modules/features/settings/ProviderIconCacheModal.md`
- `docs/modules/features/settings/ServerSettingHelpModal.md`
- `docs/modules/features/settings/LiquidGlassSettingHelpModal.md`

**特点**

- 交互组件多，和设置项、i18n、主视图有交叉
- 适合擅长 UI / 状态梳理的模型

## 只有 5 个模型时怎么合并

优先保持 `Worker 1`、`Worker 5`、`Worker 6` 独立不动。

把下面两组并成一个 worker：

- `Worker 2 + Worker 3`

保留：

- `Worker 4` 独立

这样 5 包分别是：

1. 入口与 OpenCode 运行时
2. 核心配置 + 持久化 + 类型 + i18n
3. Shared 与 Utils
4. Chat 主链路
5. Tabs、Chat UI 与 Settings

## 推荐执行波次

### 波次 1: 各 worker 填叶子文档

- 每个 worker 只改自己负责的文件
- 完成后把文档状态从 `[DRAFT]` 改成 `[REVIEW]`
- 不改 `docs/modules/README.md` 和 `docs/modules/_TEMPLATE.md`
- 如果发现总索引或上层 `index.md` 需要补充，只在交付说明中指出

### 波次 2: 汇总 worker 收口聚合文档

由一个单独的汇总模型负责：

- 检查各层 `index.md` 是否与叶子文档一致
- 必要时修正 `docs/modules/README.md`
- 统一术语、状态和交叉引用

### 波次 3: reviewer 只做审查

由一个 reviewer 模型执行：

- 对照源码 spot-check
- 只提问题或做小修，不做大规模重写
- 把成熟文档从 `[REVIEW]` 提升到 `[FINAL]`

## 每个 worker 的统一提示词

把下面模板发给每个 worker，只替换“写入范围”部分：

```text
你负责补全 OpenCodian 的模块文档。你只能修改我列出的文档文件，不能改代码，也不能修改其他文档。

工作范围：
- docs/modules/...

请先阅读对应的 src/**/*.ts 源码，以及必要的直接依赖文件，再补全文档。

要求：
- 以源码事实为准，不编造行为
- 对服务类模块，重点写职责、关键方法、状态、数据流、模块交互
- 对 types.ts / 常量文件，重点写导出语义、消费方、约束，不要硬凑运行时流程
- 对 index.ts barrel，重点写聚合关系和公开 API 面
- 对 locale 文件，重点写键空间、用途、同步要求
- 完成后把状态从 [DRAFT] 改成 [REVIEW]
- 不修改 docs/modules/README.md、docs/modules/_TEMPLATE.md、docs/modules/_WORKFLOW.md
- 如果你发现上层索引文档也需要调整，只在最终说明里列出，不要越权修改

输出要求：
- 直接修改文件
- 最终给出：你改了哪些文档、哪些地方仍不确定、建议哪个汇总模型后续统一收口
```

## 后续每次代码更新，如何增量更新文档

不要每次全量重写。固定按 diff 做增量同步。

### 步骤 1: 列出本次必须同步的文档

分支 / CI 审核时用主干范围：

```bash
npm run list:module-docs -- --range origin/main...HEAD
```

本地未提交改动自检时用 `HEAD`：

```bash
npm run list:module-docs -- --range HEAD
```

输出中的 `Required module docs` 是必须修改的直接映射文档；`Aggregate docs to inspect` 是新增、删除或 `index.ts` 变更时建议检查的父级索引 / 总索引。

### 步骤 2: 更新目标文档

按 `module-docs.config.json` 映射更新直接文档：

- `src/main.ts` -> `docs/modules/entry-point/main.md`
- 其他 `src/**/foo.ts(x)` -> `docs/modules/**/foo.md`
- `src/style/**/foo.css` -> `docs/modules/style/**/foo.md`

### 步骤 3: 判断是否需要额外更新聚合文档

除了直接映射的文档，再结合 `Aggregate docs to inspect` 按下面规则补充：

- 新增或删除 `src/**/*.ts`
  - 更新对应父目录 `index.md`
  - 必要时更新 `docs/modules/README.md`
- 修改 `src/**/index.ts`
  - 一定更新对应 `index.md`
- 修改 `src/i18n/locales/*.ts`
  - 更新对应 locale 文档
  - 通常也顺手检查 `docs/modules/i18n/index.md`
- 修改跨模块职责或开发流程
  - 更新 `devlog.md`
  - 必要时更新 `AGENTS.md`

### 步骤 4: 分配 doc-sync worker

常规小改动：

- 让改代码的同一个模型顺手更新对应文档

中大改动：

- 代码模型负责代码
- doc-sync 模型只看 diff 和受影响源码，更新映射出的文档
- reviewer 模型做最终核对

### 步骤 5: reviewer 核对

reviewer 只检查：

- 文档是否覆盖这次改动
- 描述是否与源码一致
- 有没有漏掉父级 `index.md` / `README.md`
- 状态是否需要从 `[REVIEW]` 进到 `[FINAL]`

## 增量更新 worker 的提示词

```text
你负责根据本次代码 diff 增量更新 OpenCodian 的模块文档。

你只能修改这些文档：
- docs/modules/...

对应源码变更：
- src/...

要求：
- 只更新与本次 diff 直接相关的文档内容
- 不全量重写无关章节
- 如果某个变更影响目录聚合或总索引，允许同时更新对应 index.md / README.md
- 如果只是文案小改或实现细节调整，优先做最小必要文档变更
- 文档内容以源码现状为准
- 完成后说明：更新了哪些文档，是否还有应补但未补的上层索引文档
```

## 交付前检查清单

- [ ] 只修改了自己负责的文档文件
- [ ] 文档状态值使用 `[DRAFT]` / `[REVIEW]` / `[FINAL]`
- [ ] 说明与源码一致，没有猜测性描述
- [ ] 涉及 `index.ts` 的变更已检查对应 `index.md`
- [ ] 涉及新增/删除模块时已检查 `docs/modules/README.md`
- [ ] 必要时已更新 `devlog.md`
- [ ] 已运行 `npm run check:module-docs`

## 自动化硬约束

模块文档同步不再只靠人工记忆，交付前必须通过以下脚本：

```bash
npm run check:module-docs
```

它会顺序运行：

1. `scripts/check-module-doc-coverage.mjs`
   - 检查源码存在但文档缺失
   - 检查文档存在但源码已删除

2. `scripts/check-module-doc-diff.mjs --range HEAD`
   - 检查本地未提交源码改动是否同步触碰映射文档

分支审核 / CI 场景可以显式传入基准范围：

```bash
node scripts/check-module-doc-diff.mjs --range origin/main...HEAD
```

如果脚本失败，先按错误输出补齐、修改或删除对应文档；只有确认是非源码文档或特殊入口时，才把例外写进 `module-docs.config.json`。
