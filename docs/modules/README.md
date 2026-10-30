# OpenCodian 模块功能文档
> 2026-10-07 增量：[ClaudeCodeScopedSessionStore](core/agents/backend/claude/ClaudeCodeScopedSessionStore.md) 记录 Claude 域 config 根的原生目录接缝和文件边界。

> 按源码模块组织的项目文档群。`module-docs.config.json` 定义源码到文档的一对一映射，`src/**/*.ts(x)` 与 `src/style/**/*.css` 原则上都应在 `docs/modules/` 下拥有一篇对应文档。

## 覆盖规则

### 一对一映射

- `src/main.ts` -> `docs/modules/entry-point/main.md`
- 其余 `src/**/foo.ts` -> `docs/modules/**/foo.md`
- `src/style/**/foo.css` -> `docs/modules/style/**/foo.md`，但 `src/style/index.css` 是样式聚合入口，不单独建模块文档
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

### 硬约束检查

- `npm run check:module-docs:coverage` 检查源码存在但文档缺失、以及文档存在但源码已删除的漂移。
- `npm run check:module-docs:diff` 默认用 `--range HEAD` 检查本地未提交的源码改动是否同步触碰映射文档。
- `npm run check:module-docs` 同时运行 coverage 与 diff，并已接入 `npm run verify`。
- `node scripts/check-module-doc-diff.mjs --range origin/main...HEAD` 可用于分支 / CI 以主干为基准的审核。
- `npm run list:module-docs -- --range origin/main...HEAD` 输出某个 diff 范围内必须更新的模块文档与建议检查的聚合文档。

### 当前覆盖

使用 `npm run check:module-docs:coverage` 获取当前覆盖情况；模块清单直接由源码与映射配置核对。

## 文档结构

模块目录镜像 `src/` 的职责层级；完整目录及新文件的放置规则见[源码目录](../architecture/source-layout.md)。

| 目录 | 内容 |
|---|---|
| `entry-point/` | 插件入口 |
| `app/` | 运行时装配与 Obsidian 接入 |
| `core/` | 后端、配置、存储等领域模块 |
| `features/chat/` | 聊天视图、运行时及按职责分组的服务 |
| `features/settings/` | 设置入口、后端设置和功能分组 |
| `features/` 其他目录 | 各自独立的功能 |
| `shared/`、`utils/`、`i18n/`、`types/`、`vendor/` | 共用模块及声明 |
| `style/` | 样式模块 |
| `infrastructure/` | 构建、测试、脚本等非源码文档 |

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

## Pi 独立服务模块（2026-09-08）

- [Pi 适配器](core/agents/backend/pi/PiAdapter.md)
- [Pi RPC 传输](core/agents/backend/pi/PiRpcClient.md)
- [Pi 会话元数据](core/agents/backend/pi/PiSessionStore.md)
- [Pi 流式映射](core/agents/backend/pi/PiStreamMapper.md)
- [Pi 模型选择绑定](features/chat/services/selection/PiModelSelectionBinding.md)
- [Pi 设置界面](features/settings/backends/pi/SettingsPiSection.md)

## 聊天导航增量（2026-09-21）

- [双栏会话管理栏](features/chat/services/conversation/ConversationSessionRailCoordinator.md)：R-F5 宽面板只读会话列表，复用历史会话的后端筛选与加载路径。
- [Vim 风格聊天导航](features/chat/services/surface/ChatVimNavigationCoordinator.md)：R-F6 opt-in 的 root-scoped w/s/i 键处理与输入/overlay 避让。

### Pi SDK 完整接入补充

- core/agents/backend/pi/PiProtocol.md、PiSessionRuntime.md：版本化独立服务边界。
- features/chat/services/integrations/PiExtensionUiHost.md：标准扩展UI。
- features/settings/backends/pi/PiWorkbenchActions.md、PiWorkbenchModal.md：52项管理操作。

- features/settings/backends/pi/SettingsPiConfigurationSection.md 与 SettingsPiProvidersSection.md：Pi原生持久配置页面。

## DSH 扩展模块（2026-10-24）

- [DshProtocolCodec](core/agents/backend/dsh/DshProtocolCodec.md)
- [DshNativeClient](core/agents/backend/dsh/DshNativeClient.md)
- [DshAuxQuerySession](core/agents/backend/dsh/DshAuxQuerySession.md)
- [DshQuestionBridge](core/agents/backend/dsh/DshQuestionBridge.md)
- [SettingsDshSection](features/settings/backends/dsh/SettingsDshSection.md)

- [TitleModelResolver](features/chat/services/title/TitleModelResolver.md)：六后端标题模型目录/provider 边界。
