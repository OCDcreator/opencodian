# 六后端会话标题重构（2026-10-30）

## 范围

继 `session-title-audit-2026-10-30.md` 审计后实施。保留本聊天先前未提交的标签栏／历史面板改动，不改行内补全、Canvas 或 Pi 资源脚本，不发布版本。

## 当前实现

| 后端 | 原生优先读回 | 辅助生成 | 设置 |
| --- | --- | --- | --- |
| OpenCode 2 | session.title，拒绝占位 | generate.text，支持 AbortSignal | titleMode + aiTitleModel，原生目录校验 |
| Claude Code | SDK summary，区分 custom/unknown 与输入预览 | 所属 Claude 只读 aux session | 既有 autoTitle + aiTitleModelOverrides |
| Codex | 活跃／持久线程均读 app-server name；preview 不算完成标题 | 所属 Codex 隔离 aux thread | titleMode + aiTitleModelOverrides |
| Pi | 读取已有 session title，无原生 AI 生成轮询等待 | 所属 Pi aux session | titleMode + aiTitleModelOverrides |
| ZCode | session.title + titleSource，first_input 不算生成完成 | 所属 ZCode aux session | titleMode + aiTitleModelOverrides |
| DSH | 原生 title 读回，输入预览不算 AI 生成 | 所属 DSH aux session | titleMode + aiTitleModelOverrides |

六后端首条消息都立即保存本地规则标题。规则模式不额外调用模型；Claude 保留独立 autoTitle 开关。AI 模式先原生、再所属后端辅助；失败保留规则标题并展示失败／重试入口。规则标题不提前 rename 原生。unknown 原生来源不冒充 AI 生成。

选模顺序：该后端显式备用模型 → 当前已是轻量模型则沿用 → 当前供应商目录中的轻量候选 → 当前聊天模型。显式不可用直接失败；不会任意换供应商。轻量依据名字，不依据实时价格。元数据记录选择／请求模型，不编造 backend 未提供的最终模型读回。

titleState 持久化 rule/native/ai/manual、revision、选择模型/source、error。人工改名即便文字未变化也推进 revision；保存及原生 rename 分别串行。切换标签不取消标题任务；重载只恢复一次原生读回，打断任务可显式重试，不自动重复付费调用。删除会话后不能默认落回旧 OpenCode。

## CodeGraph 前置分析

使用现有 CodeGraph 1.5 索引；impact 深度统一为 **1**，直接调用者只统计 function/method，排除 file/property/interface。具体 JSON 在本机 `.obsidian-debug/session-title-refactor-20261030/`。类级结果跨到行内补全／Canvas／Pi 资源脚本，已暂停并取得用户允许在标题范围内继续。

| 符号 | 直接函数／方法调用者数 | blast radius 节点数 |
| --- | ---: | ---: |
| TitleGenerationService | 2 | 38 |
| generateTitle | 1 | 3 |
| waitForOfficialTitle | 1 | 2 |
| readOfficialSessionTitle | 1 | 3 |
| normalizeOfficialTitle | 1 | 2 |
| delay | 1 | 2 |
| resolveModel（旧实现） | 3 | 5 |
| parseTitle | 2 | 3 |
| cancelConversation | 3 | 4 |
| cancelAll | 4 | 5 |
| readBackendSessionTitle | 2 | 6 |
| OpenCodianView.applyFallbackConversationTitle | 3 | 4 |
| OpenCodianView.startAiConversationTitleGeneration | 3 | 4 |
| OpenCodianView.updateConversationTitleState | 4 | 6 |
| MessageSendPreparationService.prepareMessageSend | 1 | 13 |
| markConversationTitleGenerationPending | 1 | 2 |
| createMessageSendPreparationHost | 1 | 4 |
| StorageService.saveConversation | 11 | 14 |
| buildConversationMetaFromStoredRecord | 3 | 5 |
| OpenCodianPlugin.generateDefaultTitle | 3 | 4 |
| OpenCodianPlugin.loadConversations | 10 | 15 |
| OpenCodianPlugin.createConversationFromSession | 7 | 10 |
| ChatRuntimeComposition.createSurfaceRuntimeWiring | 1 | 2 |
| ConversationTransitionBridge.prepareLoadedConversationTransition | 1 | 3 |
| CodexAdapter.getSession | 0 | 6 |
| OpenCode2Adapter.generateTitle | 0 | 2 |
| ConversationHistoryActionsCoordinator.show | 2 | 4 |
| ConversationHistoryActionsCoordinator.renameConversation | 1 | 2 |
| SettingsConversationSection.renderDisplayTabBlock | 1 | 2 |
| SettingsConversationSection.attach | 2 | 3 |
| SettingsConversationSection.loadTitleModels | 3 | 4 |
| normalizeModelProviderPluginDebugSettings | 1 | 5 |
| TitleModelResolver.resolve（运行验收后的调整） | 2 | 3 |
| TitleModelResolver.readCatalog | 1 | 2 |
| ChatRuntimeComposition.buildSendPipelineHostDependencies | 2 | 3 |

索引可能包含同名动态方法的保守边；未据此捏造风险等级。每个查询核对 root 文件，所修改的跨范围方法均受用户已确认的标题范围约束。

## 验证记录

### 工程检查

2026-10-30 最终源码的 `npm run verify` 已通过 owner、架构、模块文档、Graphify、devlog、lint、typecheck、全量测试和 production build。全量结果为 **1,022 个测试套件、11,157 项测试通过，2 个套件／6 项测试跳过**。CodeGraph 索引同步完成，pendingChanges 为零；变更影响查询已保存。没有修改行内补全、Canvas、Pi 资源脚本或发布版本。

工作区 `styles.css` 包含本聊天已授权的样式修改，故普通 verify 的最后一项 `git diff --exit-code -- styles.css` 会报告待暂存差异；这不是构建生成的新漂移。重复 CSS 生成的 SHA-256 相同。最终先备份索引，临时只暂存当前 CSS 作为待评审基线，不设置 Git 索引环境变量；**完整 verify 15 项全部通过，退出码 0，用时 64.53 秒**。Git 在验证中刷新了索引 stat 缓存；逐条核对 stage entries 只包含预期 CSS 暂存差异后，已按原始字节恢复索引。恢复后保留原有未提交改动，没有提交／推送。

首次尝试把复制索引路径通过 `GIT_INDEX_FILE` 传入全量测试，污染了测试用临时仓库的 Git 环境并导致 5 项基础设施测试失败；该尝试不能算通过，也不作为产品缺陷证据，已被上述无此变量的完整复跑取代。最终日志和索引恢复记录为 `verify-review-final.log` / `verify-review-final.json`。

### macOS Test Vault

目标为本机 `testvault`，插件 `opencodian`，构建 **`main.202610301638`**。`main.js`、`manifest.json`、`styles.css` 已顺序复制，逐文件 SHA-256 与 dist 相同，运行实例也读回相同 BUILD_ID。最后完整门禁使用已支持的 `OPENCODIAN_BUILD_ID` 保留该验收构建 ID，随后重新部署；与真实模型／界面验收时的三个文件哈希完全一致，故沿用相同产物的运行证据。

真实模型测试直接调用已加载生产 `TitleGenerationService` 和所属 adapter 的隔离标题入口，未通过聊天输入框创建真实聊天会话，因此仅证明标题服务到模型的调用链，不冒充六后端完整 UI 聊天验收。

| 后端 | 实际标题请求模型 | 结果 |
| --- | --- | --- |
| OpenCode 2 | ocgw / deepseek-v4.1-flash | 成功；沿用当前轻量模型 |
| Claude Code | claude-code / haiku | 成功；轻量候选 |
| Codex | codex / gpt-5.6-luna | 成功；轻量候选 |
| Pi | opencode-go / deepseek-v4.1-flash | 成功；沿用当前轻量模型 |
| ZCode | opencode-go / deepseek-v4.1-flash | 成功；测试服务临时显式指定，未保存到用户设置 |
| DSH | deepseek-official / deepseek-flash | 成功；沿用当前模型，原生复合 ID 保留 |

ZCode 默认工作区模型 `opencode-go/gpt-5.6-luna` 的请求收到上游 403，脱敏失败分类包含 API key／quota；不能声称该默认模型在当前账号可用。指定同供应商的 deepseek-v4.1-flash 后成功，说明模型配置与调用链需要分别判断。失败路径保留规则标题，不偷偷换供应商，也不弱化只读 aux 校验。

界面检查使用一条明确标记的本地测试会话，真实鼠标／键盘操作历史列表的重试与人工改名，生产持久化和 TabManager 保持启用。已确认失败状态／重试按钮、重试后保留规则标题、人工标题同步标签栏、full conversation 与 metadata 保存一致、过期自动结果被 revision 拒绝。该检查不声称完成模型聊天输入端到端测试。所有探针均在 finally 恢复设置、会话／标签和后端连接状态，并删除自己创建的测试会话，实际前后快照一致。

本机证据位于 `.obsidian-debug/session-title-refactor-20261030/`：`native-title-final-results.json`、`zcode-title-diagnostic.json`、`zcode-title-explicit.json`、`title-ui-results.json`、`deployment-final.json`、`css-determinism.json`。原始诊断与机器路径不作为提交资产。
