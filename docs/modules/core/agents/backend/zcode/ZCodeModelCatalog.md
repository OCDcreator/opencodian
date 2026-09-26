# ZCodeModelCatalog

> 2026-09-26（Plan 独立状态修复）：`session/read.settings.mode.current` 可能保留 `build`、`edit`、`yolo` 或 `auto` 基础模式；任何有效基础模式都不能直接否定已受理的 Plan 请求。`classifyZCodeModeReadback` 对这些基础投影返回“Plan 需独立事件读回”，无值或非模式值仍拒绝。实际生效仍由 adapter 的同会话 `session/events.planEnabled` 证明。FA880 真正聊天 `/plan` 暴露了此前只特殊处理 `build` 时对 `yolo` 的误报失败。

> 2026-09-25 (FA880): `session/read` remains a base-mode projection. The adapter now pairs it with native `session/events` to confirm independent `planEnabled:true` for the same session; this catalog module still classifies the snapshot-only result conservatively.

> 2026-09-24（续做）：模型选择把每模型 `reasoningLevel` 放入 `session/setModel.model.options`；独立 `thoughtLevel` 不再被同一 UI 档位伪装替代。`build/edit/yolo/auto` 必须经 `session/read` 确认；ZCode 0.16.9 的 `plan` 是独立状态，快照只投影基础 `build`，因此记录为「请求已受理、直接读回不可用」，绝不把 `build` 伪称为已确认计划。

> 2026-09-24 (票 06 收敛)：`ZCodeModelSurface` 类与 `parseZCodeDefaultModel` 纯函数亦在此——catalog 生命周期（快照捕获/广播保热/校验门控 setters/两边界应用）聚合为 adapter 的委托面；adapter 仅薄转发（其文件行数回到门禁内）。

> 源码: src/core/agents/backend/zcode/ZCodeModelCatalog.ts

> 2026-09-24 (票 06)：实时模型/思考/模式/斜杠命令目录面与发送前校验的唯一模块。

## 职责

2026-09-24 原生快照纠错：`session/create` 与 `session/resume` 返回完整实时目录，本机探针观察到 66 个模型；`session/read`、`session/setModel` 等读回常只投影当前模型（1 个）。目录以 create/resume 为权威，窄读回只更新当前模型、模式与思考状态，不再覆盖完整列表。恢复会话时 adapter 捕获 resume 快照。模型图像输入能力从同一条模型元数据读出，发送图片前再核对当前会话的原生模型读回。

从运行时负载（会话快照 `settings`、`state.updated` 广播 patch）解析出规范化目录：模型条目（providerId/modelId/label/providerLabel/contextWindow/maxOutputTokens/reasoningLevels/defaultReasoningLevel/supportsImageInput）、currentModel、thoughtLevels、currentThoughtLevel、currentMode、slashCommands（name/description/inputHint/source）。**绝不硬编码镜像**——payload 无目录时返回 null（调用方如实报不可用）。`patchZCodeCatalogSettings` 负责把广播 patch 叠在基准 settings 上。校验器：`validateZCodeModelSelection`（目录内模型才放行；reasoningLevel 需在该模型 levels 内、缺省取 defaultLevel、必需未给或档位不支持一律发送前拒绝）、`validateZCodeThoughtLevel`、`validateZCodeMode`（plan/build/edit/yolo/auto 枚举）。

每模型 `reasoningLevel` 经 `session/setModel.model.options` 写入并从同会话 `session/read.settings.model.current.options` 核验；独立 `thoughtLevel` 经 `session/setThoughtLevel` 写入后，也必须从同会话 `session/read.settings.thoughtLevel.current` 核验。不匹配时抛错，不能把请求受理当作生效。

这里的“独立”指协议入口和可观测字段不同，**不是保证运行时值互不影响**。2026-09-25 的 ZCode 3.14.3 Test Vault 同会话实测：`setThoughtLevel(high)` 后，`session/read` 的 thoughtLevel 与当前模型 reasoningLevel 均从 `max` 变成 `high`；恢复 `max` 后两者都回到 `max`。UI 不应从字段分离推断配置效果必然分离。

## 验证

tests/unit/core/agents/backend/ZCodeModelCatalog.test.ts：全量解析、无目录→null、patch 合并、模型校验（解析默认档/未知模型/档位不支持/spec-less 模型/必需未给）、思考级与模式枚举校验。
