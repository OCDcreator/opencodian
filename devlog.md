# OpenCodian 开发日志

> **📋 日志记录原则**
>
> 本日志采用**倒序排列**，最新的开发进度写在**最前面**。
>
> 新的日期型日志必须插入到最上方第一个 `## YYYY-MM-DD ...` 条目前，禁止追加到文件末尾。
>
> 每次更新后必须运行：`npm run check:devlog-order`
>
> 如需查看最新进展，请直接阅读最上方的条目。

---

## 2026-05-25 Phase 3 - Diagnostic resume-at flag gate and ordinary resume separation

### 目标

把普通 resume 与诊断 resume-at 的边界再收紧一层：普通 resume 已稳定，但任何 `resumeSessionId` 的诊断调用都必须显式带 `_diagnosticResumeAt: true`，避免误入稳定聊天路径。

### 实施内容

| 文件 | 变更类型 | 详情 |
|---|---|---|
| `src/core/agents/backend/ClaudeCodeAdapter.ts` | 诊断旗标门禁 | `ClaudeCodeDiagnosticPromptRequest` 新增 `_diagnosticResumeAt?: boolean`；`runDiagnosticPrompt()` 在处理 `resumeSessionId` 前强制要求该 flag 为 `true`，否则提前抛错，避免 resume-at 在普通路径里被意外使用 |
| `src/features/settings/SettingsCapabilityLabSection.ts` | 诊断面板更新 | Capability Lab 的 Resume Session 探针显式传入 `_diagnosticResumeAt: true`，继续把 resume-at 维持在诊断面而非普通 chat UI |
| `tests/unit/core/agents/backend/ClaudeCodeAdapter.test.ts` / `tests/unit/features/settings/SettingsCapabilityLabSection.test.ts` | TDD 回归测试 | 新增缺失 flag 拒绝与显式 flag 通过的单元测试，并补齐所有调用点的 flag 传递 |
| `docs/modules/core/agents/backend/ClaudeCodeAdapter.md` / `docs/modules/features/settings/SettingsCapabilityLabSection.md` / `docs/status/claude-code-current-state-2026-05-22.md` | 文档更新 | 记录 resume-at 仍是诊断路径，且必须有显式 gate；状态文档不再把这轮写成单纯 tests/docs 工作，而是明确了 runtime 行为门禁 |

### 验证

- Focused green: `npm test -- --runInBand tests/unit/core/agents/backend/ClaudeCodeAdapter.test.ts tests/unit/features/settings/SettingsCapabilityLabSection.test.ts` 通过，`2` suites / `166` tests passed
- 门禁：`npm run check:graphify`、`npm run check:module-docs`、`npm run check:devlog-order`、`git diff --check` 均通过
- 构建部署：`npm run build` 生成 `BUILD_ID=feature-phase0-capability.202605251609`；已顺序部署 `dist/main.js`、`dist/manifest.json`、`dist/styles.css` 到 Test Vault，并确认 deployed `main.js` 包含同一 build id
- Runtime proof：`.obsidian-debug/positive-resume-authenticated-diagnostic-assertion-2026-05-25-result.json` 返回 `ok: true`，显式 `_diagnosticResumeAt: true` 的诊断 resume-at 保持 `sessionId=ed88a5ab-e8b2-42be-940b-5a0640ec329b` 不变并召回 nonce `positive-resume-1779696749347-xkyeg4ss`；`.obsidian-debug/diagnostic-resume-boundary-runtime-assertion-2026-05-25-result.json` 返回 `ok: true`，证明未带 `_diagnosticResumeAt` 的 `resumeSessionId` 在 `getSessionInfo()` / `sdk.query()` 前被拒绝；最终 `obsidian dev:errors vault=testvault` 为 `No errors captured.`

### 影响评估

本轮真正改变了 runtime contract，而不是只做注释或测试说明：`resumeSessionId` 现在在诊断接口上也要显式打标，防止从诊断路径滑回普通聊天路径。普通 resume 与诊断 resume-at 的分离更清楚了，但仍不把 resume-at 或任何更大的 Claude capability surface 宣称成 stable/full capability。

## 2026-05-25 Phase 3 - Ordinary resume vs diagnostic resume-at separation

### 目标

在已验证的普通 chat resume 身份边界（commit `daf9dd6f`）基础上，进一步硬化普通 resume 与诊断级 resume-at 之间的隔离：普通 resume 提升到稳定路径，resume-at 继续保持在 `runDiagnosticPrompt()` 诊断接口之后，不得进入普通聊天发送路径。

### 实施内容

| 文件 | 变更类型 | 详情 |
|---|---|---|
| `tests/unit/core/agents/backend/ClaudeCodeAdapter.test.ts` | 聚焦测试 | 新增 4 个 resume 身份隔离测试：诊断 resume-at 不修改普通 session 的 `sdkSessionId`、新本地 session 不携带 resume、普通 `sendMessage` 不接受任意 resume-at id、`runDiagnosticPrompt` 是唯一暴露 `resumeSessionId` 的接口 |
| `docs/status/claude-code-current-state-2026-05-22.md` | 文档更新 | 新增 "Ordinary resume vs diagnostic resume-at separation" 状态切片，记录测试覆盖的隔离契约 |
| `devlog.md` | 日志更新 | 记录本轮 resume 身份分离工作 |

### 验证

- Focused green: `npm test -- --runInBand tests/unit/core/agents/backend/ClaudeCodeAdapter.test.ts` 通过，`1` suite / `85` tests passed
- 门禁：`npm run check:graphify`、`npm run check:module-docs`、`npm run check:devlog-order`、`git diff --check`、`npm run lint` 均通过

### 影响评估

本轮只做测试和文档层面的 resume 身份隔离显式化，不新增代码行为、不提升诊断路径为稳定产品面、不改变 OpenCode 默认路径或 Claude Code full capability 完成度声称。

## 2026-05-25 Phase 3 - Ordinary Claude chat resume identity validation

### 目标

把上一轮已证明的 Claude diagnostic resume 身份边界推进到普通聊天发送路径：Obsidian reload 后恢复出来的真实 Claude SDK session id 必须先由 SDK session catalog 证明身份一致，才能进入 resumed `query()`。

### 实施内容

| 文件 | 变更类型 | 详情 |
|---|---|---|
| `src/core/agents/backend/ClaudeCodeAdapter.ts` | 普通 chat resume 校验 | 非本地 `backendSessionId` 恢复为 SDK resume candidate 时设置一次性 validation flag；`getOrStartRuntime()` 在创建 SDK query 前调用 `getSessionInfo(sessionId, { dir: vaultPath })` 校验存在性和可比对身份 |
| `src/core/agents/backend/ClaudeCodeAdapter.ts` | 身份错配 fail-close | catalog lookup 不可用、查无结果、无可比对 `sessionId`/`id`、或返回不同 id 都在 `sdk.query()` 前失败；stream 返回不同 SDK session id 时关闭 runtime 并返回 resume validation failure，避免静默重绑 |
| `tests/unit/core/agents/backend/ClaudeCodeAdapter.test.ts` | TDD 回归测试 | 覆盖 restored persisted SDK id 正向校验、缺失 lookup、无可比对身份、lookup 错配、metadata/raw result session id 错配、本地 `claude-code-*` handle 不误 resume、活跃持久 query follow-up 不重复 catalog lookup |
| `docs/modules/core/agents/backend/ClaudeCodeAdapter.md` / `docs/status/claude-code-current-state-2026-05-22.md` | 文档更新 | 记录 ordinary chat resume identity boundary，并明确这不是 resume-at、stable history UI、checkpoint rewind 或 full capability 完成 |

### 验证

- Red: implementer 先观察到 focused tests 失败，覆盖普通恢复未 pre-query lookup、lookup 缺失/错配仍进入 query、返回 session id 错配仍输出/重绑等缺口
- Review fix red: 独立 reviewer 指出两项 Important 问题后，补充失败用例覆盖 generic SDK-unavailable 包装、lookup 无可比对 id fail-open、非 metadata `result.session_id` 错配未拒绝
- Focused green: `npm test -- --runInBand tests/unit/core/agents/backend/ClaudeCodeAdapter.test.ts` 通过，`1` suite / `81` tests passed
- 门禁：`npm run graphify:update:src`、`npm run check:graphify`、`npm run check:module-docs`、`npm run check:devlog-order`、`git diff --check`、`npm run lint` 均通过
- 构建部署：`npm run build` 生成 `BUILD_ID=feature-phase0-capability.202605250010`；顺序部署到 Test Vault 后，`dist/main.js` 与 deployed `main.js` SHA256 同为 `12183062ded3009e590b6feec584172874a81fba696a2219d0becdcbefab37d7`，部署 Claude SDK `claude` binary hash 与 dist 同为 `368dcd9709c85534f673071e7cc8eb5422bcff367fb9bdf5ce25d9619aab7ef5`
- Runtime proof：`.obsidian-debug/ordinary-chat-resume-identity-result-20260525.json` 返回 `ok: true`，普通聊天路径在 reload 后恢复 SDK-backed conversation，保持 `backendSessionId=2c9a66fd-7a56-4aec-a99c-7f994ecb977d` 不变，发送并渲染 marker `RESUME_AFTER_RELOAD_1779639261622`，消息数从 `4` 增至 `6`；截图在 `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/ordinary-chat-resume-identity-runtime-20260525.png`，console/errors 在 `.obsidian-debug/ordinary-chat-resume-identity-console-20260525.txt` / `.obsidian-debug/ordinary-chat-resume-identity-errors-20260525.txt`，最终 `dev:errors` 为 `No errors captured.`
- 残余记录：runtime console 在 smoke 结束后的模型刷新阶段有一条 `ModelSelectionRuntime` model load error，但未进入 `dev:errors`，本轮不把它解释成 full model-catalog 稳定性 proof

### 影响评估

本轮只收紧普通 Claude chat resume 的身份校验和错误语义，不改变 OpenCode 默认路径，不新增 Claude stable sharing/rewind/history/structured-output UI，也不声称 Claude Code full capability 完成。当前阶段完成后按用户要求提交并暂停，不继续下一批能力。

## 2026-05-24 Phase 3 - SDK Foundations hook/subagent stream honesty

### 目标

修正 Claude SDK Foundations 中 hook/subagent stream 可编辑设置的成熟度表达：保留真实 SDK options wiring，但不得让设置入口被读成稳定 hook authoring 或完整 transcript/progress 产品能力。

### 实施内容

| 文件 | 变更类型 | 详情 |
|---|---|---|
| `src/features/settings/SettingsCapabilityLabSection.ts` | Capability Lab 诚实化 | `Subagent Transcript / Progress` 与 `Include Hook Events` 从普通 `Settings` surface 收紧为 `Diagnostic` + `Untested`，仍保留 SDK/Adapter wired 状态 |
| `src/features/settings/SettingsClaudeCodeSection.ts` / `src/i18n/locales/{en,zh}.ts` | 设置可见边界提示 | SDK Foundations 在 hook/subagent stream 控件前显示双语 diagnostic boundary notice，明确这些 flags 只供诊断/实验事件流使用，不启用稳定 hook authoring 或完整 transcript/progress UI |
| `tests/unit/features/settings/SettingsCapabilityLabSection.test.ts` / `SettingsClaudeCodeSection.test.ts` | TDD 回归测试 | 覆盖矩阵 surface 分类和 SDK Foundations 可见边界提示 |
| `docs/modules/**` / `docs/status/claude-code-current-state-2026-05-22.md` | 文档更新 | 记录可编辑 options 与稳定产品能力之间的边界，不声称新的 runtime 产品化 |

### 验证

- Red: `npm test -- --runInBand tests/unit/features/settings/SettingsCapabilityLabSection.test.ts tests/unit/features/settings/SettingsClaudeCodeSection.test.ts` 先失败，表现为两个矩阵行仍渲染成 `Settings` 且 SDK Foundations 未显示 diagnostic boundary notice
- Focused green: 同一命令通过，`2` suites / `112` tests passed
- 独立只读 review：无 blocking findings；确认 UI 仍保留可配置 SDK flags，但不会误标为 stable hook authoring / complete subagent transcript-progress 产品面
- 门禁：`npm run graphify:update:src`、`npm run check:graphify`、`npm run check:module-docs`、`npm run check:devlog-order`、`git diff --check`、`npm run lint` 均通过
- 构建部署：`npm run build` 生成 `BUILD_ID=feature-phase0-capability.202605242303`；顺序部署到 Test Vault 后，`dist/main.js` 与 deployed `main.js` SHA256 同为 `d404bc8d874ca589e6e9b340d8c6593d1faa681775ca09cc39629cbeca3c7bf0`，部署 Claude SDK `claude` binary hash 与 dist 同为 `368dcd9709c85534f673071e7cc8eb5422bcff367fb9bdf5ce25d9619aab7ef5`
- Runtime proof：`.obsidian-debug/claude-settings-honesty-runtime-proof-20260524-result.json` 通过 `23` 条断言，覆盖 SDK Foundations diagnostic notice、Capability Lab 两个 `Diagnostic` + `Untested` 行、负向 stable/full capability claim 扫描、editor-area / 430px 窄布局无溢出与状态恢复；截图/console/errors 位于 `.obsidian-debug/claude-settings-honesty-runtime-proof-20260524.png`、`.obsidian-debug/claude-settings-honesty-runtime-proof-20260524-console.txt`、`.obsidian-debug/claude-settings-honesty-runtime-proof-20260524-errors.txt`，最终 `dev:errors` 为 `No errors captured.`

### 影响评估

本轮只校准 hook/subagent stream 的可见成熟度表达，不新增 stable hook authoring、不新增完整 subagent transcript/progress UI、不改变 SDK option wiring 或 OpenCode 行为。

## 2026-05-24 Phase 3 - Shared-session shareUrl backend boundary

### 目标

修复 stable shared-session settings UI 的 backend 边界：非 OpenCode backend 即使返回兼容的 `share.url` 字段，也不能被当作 OpenCode 公开分享链接展示在共享会话列表中。

### 实施内容

| 文件 | 变更类型 | 详情 |
|---|---|---|
| `src/core/agents/backend/AgentBackendRouting.ts` | 路由归一化修复 | `listBackendSessions()` 只有在 active backend kind 为 `opencode` 时才把 `record.share.url` 归一化为 `NormalizedSessionRow.shareUrl`；Claude Code / generic backend 保留 id、title/summary、updatedAt 等 preview/inspection 归一化，但 `shareUrl` 为 `null` |
| `tests/unit/core/agents/backend/AgentBackendRouting.test.ts` | TDD 回归测试 | 覆盖 OpenCode list sessions 保留 `share.url`，Claude Code 与 generic backend 即使返回 `share.url` 也归一化为 `shareUrl: null` |
| `tests/unit/features/settings/SettingsConversationSection.test.ts` | 测试边界调整 | settings preview 覆盖继续证明 generic/Claude-shaped preview payload 能被归一化，但通过 OpenCode shared row 进入预览，不再依赖非 OpenCode `share.url` 使 row 出现在 OpenCode-only sharing surface |
| `docs/modules/core/agents/backend/AgentBackendRouting.md` / `docs/modules/features/settings/SettingsConversationSection.md` / `docs/status/claude-code-current-state-2026-05-22.md` | 文档更新 | 记录 `shareUrl` 是 OpenCode-only row 字段，非 OpenCode share object 不构成 stable shared-session link contract，也不代表 Claude stable sharing 已完成 |

### 验证

- Red: `npm test -- --runInBand tests/unit/core/agents/backend/AgentBackendRouting.test.ts tests/unit/features/settings/SettingsConversationSection.test.ts` 先失败，表现为 Claude row 的 `share.url` 被错误保留为 `shareUrl`
- Focused green: 同一命令通过，`2` suites / `100` tests passed
- 独立只读 review：无 blocking findings，复核 OpenCode 保留路径、Claude/generic null-share 归一化、settings 行过滤及 preview 覆盖
- 门禁：`npm run graphify:update:src`、`npm run check:graphify`、`npm run check:module-docs`、`npm run check:devlog-order`、`git diff --check`、`npm run lint` 均通过
- 构建部署：`npm run build` 生成 `BUILD_ID=feature-phase0-capability.202605242237`；顺序部署到 Test Vault 后，`dist/main.js` 与 deployed `main.js` SHA256 同为 `475e59146319f659583320cd9e5909af84fb218d030c02317a474d72d1a2c5f4`，部署 Claude SDK `claude` binary hash 与 dist 同为 `368dcd9709c85534f673071e7cc8eb5422bcff367fb9bdf5ce25d9619aab7ef5`
- Runtime proof：`.obsidian-debug/claude-share-url-honesty-result-20260524224105.json` 返回 `ok: true`，验证 Claude Code active 时兼容 `share.url` row 不渲染为 OpenCode shared-session link，430px 窄布局无横向溢出且没有 stable/full capability 声称；截图/console/errors 分别在 `.obsidian-debug/claude-share-url-honesty-screenshot-20260524224105.png`、`.obsidian-debug/claude-share-url-honesty-console-20260524224105.log`、`.obsidian-debug/claude-share-url-honesty-errors-20260524224105.log`，最终 `dev:errors` 为 `No errors captured.`

### 影响评估

本轮只修正 shared-session 列表的 OpenCode-only 分享链接边界，不新增 Claude Code stable sharing，不引入跨 backend share object contract，也不改变 `OpenCodeService.unshareSession()` 的 OpenCode-only 写操作归属。

## 2026-05-24 Phase 3 - Capability Lab advanced settings honesty

### 目标

修正 Capability Lab 对 Claude plugins / skills 配置发现的诚实表达，并把已经作为普通高级设置、已接入 SDK options 的 Claude settings 行显式列入矩阵，但不把它们误报为 runtime proof。

### 实施内容

| 文件 | 变更类型 | 详情 |
|---|---|---|
| `src/features/settings/SettingsCapabilityLabSection.ts` | Capability Lab 诚实化 | Plugins / Skills Discovery 即使有计数、名称或 `skills: all` 也保持 `Discovery Only`，不使用 active/exposed chip；矩阵新增 Allowed Tools、Disallowed Tools、Turn/Budget Limits、Environment Variables 四行，均为 `SDK` + `Adapter` wired、`Untested`、`Settings` |
| `src/core/types/settings.ts` | 设置归一化 | `normalizeClaudeCodeStringArray()` 现在 trim 字符串项后再过滤和去重，避免 allowed/disallowed tool names 带空白传入 SDK |
| `src/features/settings/SettingsClaudeCodeSection.ts` | UI 输入解析 | max turns / max budget USD 现在要求完整正数字符串，`12abc` / `5usd` 会归一化为 null/unlimited，空白仍保持 null/unlimited |
| `tests/unit/features/settings/SettingsCapabilityLabSection.test.ts` / `tests/unit/features/settings/SettingsClaudeCodeSection.test.ts` / `tests/unit/core/types/claudeCodeBackendSettingsNormalization.test.ts` | TDD 回归测试 | 覆盖 Discovery 不再显示 Exposed、新矩阵行 Settings+Untested、工具名 trim、部分数字解析为 null |
| `docs/modules/**` / `docs/status/claude-code-current-state-2026-05-22.md` | 文档更新 | 记录 plugins/skills 只是配置摘要，advanced settings 只是 SDK-option settings，不代表 live runtime proof |

### 验证

- Red: focused suite 先失败于 Plugins/Skills Discovery 仍为 `Exposed`、advanced settings 矩阵行缺失、工具名未 trim、`12abc` 仍被解析为 `12`
- Focused green: `npm test -- --runInBand tests/unit/features/settings/SettingsCapabilityLabSection.test.ts tests/unit/features/settings/SettingsClaudeCodeSection.test.ts tests/unit/core/types/claudeCodeBackendSettingsNormalization.test.ts` 通过，`3` suites / `136` tests passed

### 影响评估

本轮不新增 Claude skills/plugin authoring，不把 allowed/disallowed tools、turn/budget limits 或 env variables 宣称为 verified runtime proof，也不暴露 secrets；只修正 Capability Lab 与设置归一化的 honesty 边界。

## 2026-05-24 Phase 3 - User-message footer rewind/fork backend boundary

### 目标

修复聊天 user message footer 的能力曝光边界：当 active backend 是 OpenCode、当前 conversation 属于 Claude Code 时，不允许 footer 仅凭 OpenCode 的 Branching 能力显示 Claude 消息上的 Rewind 按钮；Fork 继续按 conversation owner 的能力声明显示。

### 实施内容

| 文件 | 变更类型 | 详情 |
|---|---|---|
| `src/features/chat/OpenCodianView.ts` | 能力路由修复 | `createUserMessageFooterRendererHost()` 改为按当前 conversation backend service 查询 `AgentCapability.Fork` / `AgentCapability.Branching`；只有 OpenCode conversation 在缺少 registry service 时保留既有 active-backend fallback |
| `tests/unit/features/chat/OpenCodianView.userMessageFooterHost.test.ts` | TDD 回归测试 | 覆盖 Claude conversation 在 OpenCode active/Branching 时隐藏 Rewind 但保留 Fork，以及 OpenCode conversation 在 Claude active 时仍保留 OpenCode Rewind |
| `docs/modules/features/chat/OpenCodianView.md` / `docs/status/claude-code-current-state-2026-05-22.md` | 文档更新 | 记录 user-message footer 按 conversation owner 暴露 fork/rewind，Claude rewind/revert/diff 仍不升级 stable |

### 验证

- Red: `npm test -- --runInBand tests/unit/features/chat/OpenCodianView.userMessageFooterHost.test.ts` 先失败，表现为 Claude conversation 继承 OpenCode Branching、OpenCode conversation 又受 Claude active backend 影响失去 Rewind
- Focused green: 同一命令通过，`1` suite / `2` tests passed
- Adjacent focused green: `npm test -- --runInBand tests/unit/features/chat/OpenCodianView.userMessageFooterHost.test.ts tests/unit/features/chat/UserMessageFooterRenderer.test.ts tests/unit/features/chat/runtime/UserMessageFooterRenderer.test.ts tests/unit/features/chat/ConversationLoadRecoveryCoordinator.test.ts tests/unit/features/chat/SlashCommandExecutionService.undoRedo.test.ts` 通过，`5` suites / `57` tests passed
- Gate: `npm run graphify:update:src`、`npm run check:graphify`、`npm run check:module-docs`、`npm run check:devlog-order`、`git diff --check`、`npm run lint` 均通过
- Build/deploy: `npm run build` 生成 `BUILD_ID feature-phase0-capability.202605242149`；Test Vault `main.js` 与 `dist/main.js` SHA256 均为 `9c45b5810338426650ed0f1183a77da6fcc3e41c949a3ab9172f01c3427022c5`
- Runtime proof: `.obsidian-debug/user-message-footer-backend-boundary-2026-05-24-result.json` 返回 `ok: true`，确认 Claude conversation 在全局 OpenCode+Branching 下隐藏 Rewind 但保留 Fork，OpenCode conversation 在全局 Claude 下保留 Fork/Rewind；`dev:errors` 为 `No errors captured.`

### 影响评估

本轮只修复 footer UI/product-surface honesty，不新增 Claude stable rewind、restore rewind、diff、modified-files sidebar 或 slash `/undo` / `/redo` 能力；这些仍按 OpenCode-only/gated 处理，直到后续有独立 runtime proof 和产品化设计。

## 2026-05-24 Phase 3 - Capability Lab permission/question/MCP proof honesty

### 目标

把 Claude permission approval、AskUserQuestion / elicitation、MCP positive smoke proof 诚实地显露在 Capability Lab 诊断面，而不是继续缺行或用普通 Exposed/Untested 文案混淆；同时不把这些能力升级成稳定产品面。

### 实施内容

| 文件 | 变更类型 | 详情 |
|---|---|---|
| `src/features/settings/SettingsCapabilityLabSection.ts` | Capability Lab 诚实化 | 新增 Permission Approval、AskUserQuestion / Elicitation 矩阵行；MCP/permission/question proof 标记为 `Verified` + `Diagnostic`，Discovery 使用 `Diagnostic Proof` |
| `tests/unit/features/settings/SettingsCapabilityLabSection.test.ts` | TDD 回归测试 | 覆盖 permission/question 诊断 proof 行、MCP proof 文案，以及矩阵行数更新 |
| `tests/unit/core/agents/backend/ClaudeCodeAdapter.test.ts` | TDD 回归测试 | 覆盖 `runDiagnosticPrompt()` 会把 `permissionBridge.canUseTool`、`onElicitation`、`mcpServers` 注入 diagnostic SDK options |
| `docs/modules/**` / `docs/status/claude-code-current-state-2026-05-22.md` | 文档更新 | 记录 proof 来源、diagnostic-only 边界和不升级 stable product surface 的限制 |

### 验证

- Red: focused suite 先失败于 Capability Lab 缺少 permission/question diagnostic proof 行与 proof label
- Focused green: `npm test -- --runInBand tests/unit/features/settings/SettingsCapabilityLabSection.test.ts tests/unit/core/agents/backend/ClaudeCodeAdapter.test.ts` 通过，`2` suites / `152` tests passed
- Gate: `npm run graphify:update:src`、`npm run check:graphify`、`npm run check:module-docs`、`npm run check:devlog-order`、`git diff --check`、`npm run lint` 均通过
- Build/deploy: `npm run build` 生成 `BUILD_ID feature-phase0-capability.202605242127`；Test Vault `main.js` 与 `dist/main.js` SHA256 均为 `561cc2e46337f2accf72c5c43916fde022c2bc311b9570dbb6d8e835d0d6f78d`；Claude SDK binary hash 为 `368dcd9709c85534f673071e7cc8eb5422bcff367fb9bdf5ce25d9619aab7ef5`
- Runtime proof: `.obsidian-debug/permission-question-mcp-diagnostic-honesty-assertion-2026-05-24-result.json` 返回 `ok: true`，确认三行 UI 为 `Verified` + `Diagnostic` / `Diagnostic Proof`，Diagnostic Proof 未使用 active/exposed chip 样式，设置根节点 horizontal overflow 为 `0px`，`dev:errors` 为 `No errors captured.`

### 影响评估

本轮只修正诊断面 honesty 与回归测试，不新增 MCP authoring、不新增 Claude permission template/settings、不复用 OpenCode question API，也不宣称 Claude Code full capability 完成。

## 2026-05-24 Phase 3 - Claude authenticated diagnostic resume positive proof

### 目标

把 Capability Lab 的 Claude diagnostic resume 从“拒绝错误 id”推进到真实 authenticated positive proof：先创建一个 Claude SDK 会话并写入 nonce，再用同一 session id 执行 `resumeSessionId` 诊断，要求返回同一 session id 且第二轮输出能召回首轮 nonce，避免把 fresh session 误报为 resume proof。

### 实施内容

| 文件 | 变更类型 | 详情 |
|---|---|---|
| `src/core/agents/backend/ClaudeCodeAdapter.ts` | 后端 proof 边界 | `runDiagnosticPrompt({ resumeSessionId })` 在 SDK query 返回后校验 resulting `sessionId`，带 resume 请求时必须等于请求的 Claude SDK session id；不同或缺失则抛出 `Claude Code diagnostic resume validation failed` |
| `src/features/settings/SettingsCapabilityLabSection.ts` | Capability Lab proof 诚实化 | Resume Session Diagnostic 在 `result.sessionId` 与 selected source session id 不一致时标记 runtime fail，不再把 fresh session 的输出渲染成 pass |
| `tests/unit/core/agents/backend/ClaudeCodeAdapter.test.ts` | TDD 回归测试 | 覆盖 resumed query 返回不同 session id 或不返回 session id 时 adapter 拒绝，确保 wrong-ID / no-ID resume 不会被当成成功 |
| `tests/unit/features/settings/SettingsCapabilityLabSection.test.ts` | TDD 回归测试 | 覆盖 Capability Lab Resume proof 对 returned id mismatch / missing id 标 fail，并覆盖 active backend 为 OpenCode 时仍只使用 `registry.get('claude-code')` 的诊断边界 |
| `docs/modules/core/agents/backend/ClaudeCodeAdapter.md` / `docs/modules/features/settings/SettingsCapabilityLabSection.md` | 模块文档 | 记录 diagnostic resume 需要 query 后 same-session id 校验，仍不是 stable resume-at 产品面 |
| `docs/status/claude-code-current-state-2026-05-22.md` | 状态更新 | 记录正向 authenticated diagnostic resume proof、artifact、非目标与剩余边界 |

### 验证

- Independent reviewer subagent 报告无 P0/P1 阻塞；P3 建议补 missing returned id 与 OpenCode-active registry boundary 测试，已在提交前补齐
- Focused green: `npm test -- --runInBand tests/unit/core/agents/backend/ClaudeCodeAdapter.test.ts tests/unit/features/settings/SettingsCapabilityLabSection.test.ts` 通过，`2` suites / `149` tests passed
- Implementer slice 已运行并通过：`npm run graphify:update:src`、`npm run check:graphify`、`npm run check:module-docs`、`git diff --check`
- `npm run build` 产出 `BUILD_ID: feature-phase0-capability.202605242047`，并已部署到 `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`
- Runtime proof: `.obsidian-debug/positive-resume-authenticated-diagnostic-assertion-2026-05-24-result.json` 返回 `ok: true`，loaded runtime 为 `OpenCodian 1.0.0 BUILD_ID=feature-phase0-capability.202605242047`；首轮 session `2d366fb9-6f34-4bbb-8f35-ac7a43ec5854` 写入 nonce `positive-resume-1779627004119-x82q2n4m`，`listSessions()` / `getSession()` 可见该 source session，第二轮 resumed session id 仍为 `2d366fb9-6f34-4bbb-8f35-ac7a43ec5854`，且输出召回 nonce
- OpenCode 边界 proof：runtime artifact 记录 `openCodeSessionApiCallCounts` 全部为 `0`、`openCodeSessionApiUsed=false`
- Runtime artifacts: `.obsidian-debug/positive-resume-authenticated-diagnostic-runtime-2026-05-24.png`、`.obsidian-debug/positive-resume-authenticated-diagnostic-console-2026-05-24.txt`、`.obsidian-debug/positive-resume-authenticated-diagnostic-errors-2026-05-24.txt`；dev errors 为 `No errors captured.`

### 影响评估

本轮只证明并收紧 Capability Lab diagnostic resume 的 same-session 正向链路；不新增稳定 resume-at UI、不做跨后端 resume、不宣称 Claude Code full capability 完成。普通聊天恢复、resume-at message targeting、fork/resume 产品化和 OpenCode-only diff/rewind/revert 边界仍按 gap ledger 继续推进。

## 2026-05-24 Phase 3 - Capability Lab diagnostic sessionStore mirror readback

### 目标

把 Capability Lab 的 Session Store mirror proof 从“只看到 `runDiagnosticPrompt({ sessionStore })` 返回 session id”升级为真实 diagnostic-store 闭环：写入、切换 Diagnostic Store、重新列出、选中返回 session、再通过 `getSessionMessages(..., { sessionStore })` 回读到至少一条消息，避免把不可读的镜像误报为 runtime proof。

### 实施内容

| 文件 | 变更类型 | 详情 |
|---|---|---|
| `src/features/settings/SettingsCapabilityLabSection.ts` | 诊断 proof 修复 | Mirror probe 改为 `sessionStoreFlush: 'eager'` 后切换到 Diagnostic Store、reload/list-check、select returned session，并通过 `getSessionMessages(sessionStore, limit: 50, includeSystemMessages: false)` 渲染 readback；空 readback 现在失败；history reload 加 request id guard 防止旧异步结果覆盖新 proof |
| `src/i18n/locales/en.ts` / `src/i18n/locales/zh.ts` | 文案诚实化 | `settings.capabilityLab.history.description` 明确只提供 diagnostic store import / mirror / readback probes，不提供稳定 delete / restore 操作 |
| `tests/unit/features/settings/SettingsCapabilityLabSection.test.ts` | TDD 回归测试 | 覆盖 history 描述、mirror readback 成功、空 readback 失败、stale reload 不覆盖 proof/selection、中文 locale 边界文案 |
| `docs/modules/features/settings/SettingsCapabilityLabSection.md` | 模块文档 | 记录 mirror proof 必须完成 Diagnostic Store list/select/readback 且读到消息才算通过 |
| `docs/modules/i18n/locales/en.md` / `docs/modules/i18n/locales/zh.md` | 模块文档 | 记录 Capability Lab history description 的 diagnostic-store-only 边界 |
| `docs/status/claude-code-current-state-2026-05-22.md` | 状态更新 | 记录本轮 proof 边界、非目标、SDK smoke、deploy freshness 与 runtime artifacts |

### 验证

- Focused green: `npm test -- --runInBand tests/unit/features/settings/SettingsCapabilityLabSection.test.ts tests/unit/core/agents/backend/ClaudeCodeAdapter.test.ts` 通过，`2` suites / `144` tests passed
- Independent reviewer subagent 复审无 findings；剩余风险限定为 live SDK runtime 行为，并由本轮 Test Vault proof 覆盖
- `npm run graphify:update:src` 已刷新 `graphify-out/`（`6138` nodes / `11631` edges / `217` communities）
- `npm run check:graphify`、`npm run check:module-docs`、`npm run check:devlog-order`、`git diff --check`、`npm run lint` 通过
- Direct SDK smoke: `.obsidian-debug/claude-code-smoke-2026-05-24-current.json` 记录 `10/10` pass（SDK import、bundled executable、text、supported models、thinking、MCP stdio tool、canUseTool allow/deny、elicitation、session resume）
- `npm run build` 通过，standalone build ID `feature-phase0-capability.202605242024`
- Test Vault deploy：`main.js`、`manifest.json`、`styles.css`、`assets/`、`node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/` 已部署到 `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`
- Deploy freshness：Test Vault `main.js` 包含 `feature-phase0-capability.202605242024`；`dist/main.js` 与部署版 `main.js` SHA256 均为 `54ae1cf0aa52c451d6be024c6d53f5a71fdeb803f98ca01f7767d2bcbc305513`；Claude SDK binary checksum 与 dist 一致：`368dcd9709c85534f673071e7cc8eb5422bcff367fb9bdf5ce25d9619aab7ef5`
- Runtime proof: `.obsidian-debug/capability-lab-sessionstore-readback-assertion-2026-05-24-result.json` 返回 `ok: true`，loaded runtime 为 `OpenCodian 1.0.0 BUILD_ID=feature-phase0-capability.202605242024`；diagnostic store session `501bfdd9-ea07-455c-88dc-bbc4d5db6be5` 被 `listSessions({ sessionStore })` 列出，`getSessionMessages(..., { sessionStore, limit: 50, includeSystemMessages: false })` 回读 `messageCount: 3`
- Runtime artifacts: `.obsidian-debug/capability-lab-sessionstore-readback-runtime-2026-05-24.png`、`.obsidian-debug/capability-lab-sessionstore-readback-console-2026-05-24.txt`、`.obsidian-debug/capability-lab-sessionstore-readback-errors-2026-05-24.txt`；dev errors 为 `No errors captured.`

### 影响评估

本轮只加强 diagnostic sessionStore proof，不新增稳定历史管理、delete/restore、正式 sessionStore 数据层或普通 chat/history UI 接入；不宣称 Claude Code full capability 完成。

## 2026-05-24 Phase 3 - Claude diagnostic resume validation boundary

### 目标

收紧 Capability Lab 的 Claude diagnostic resume 边界：`runDiagnosticPrompt({ resumeSessionId })` 只能恢复 Claude SDK session catalog 中真实存在且与请求 id 一致的会话，不能把 placeholder、OpenCode session id、OpenCodian 本地 handle 或交叉命中的 Claude session 当作稳定 resume-at 能力传给 Claude SDK。

### 实施内容

| 文件 | 变更类型 | 详情 |
|---|---|---|
| `src/core/agents/backend/ClaudeCodeAdapter.ts` | 后端边界修复 | 在 `runDiagnosticPrompt()` 创建 `sdk.query()` 前，通过 `sdk.getSessionInfo(resumeSessionId, { dir: vaultPath })` 验证诊断恢复目标；SDK lookup 不可用、返回空，或返回对象显式携带不匹配的 `sessionId` / `id` 时抛出明确的 Claude diagnostic resume validation error |
| `tests/unit/core/agents/backend/ClaudeCodeAdapter.test.ts` | TDD 回归测试 | 覆盖无效 resume id 被拒绝且不创建 query、SDK lookup 不可用时被拒绝、`sessionId` mismatch 和 `id` alias mismatch 被拒绝、无可比 id 字段时保留兼容路径、真实 SDK session 验证后继续传递 `options.resume` |
| `docs/modules/core/agents/backend/ClaudeCodeAdapter.md` | 模块文档更新 | 记录 Capability Lab diagnostic resume 只接受 SDK catalog 可验证且显式 id 不冲突的 Claude session，不代表 stable resume-at productization |
| `docs/status/claude-code-current-state-2026-05-22.md` | 状态更新 | 刷新当前 continuity anchor，并记录本 slice 的验证边界与非目标 |

### 验证

- Red: `npm test -- --runInBand tests/unit/core/agents/backend/ClaudeCodeAdapter.test.ts` 先失败，证明未修复前 `runDiagnosticPrompt()` 会接受未验证的 `resumeSessionId`，且不会调用 `sdk.getSessionInfo()`
- Follow-up Red: `npm test -- --runInBand tests/unit/core/agents/backend/ClaudeCodeAdapter.test.ts` 先失败于 `rejects diagnostic resume when SDK lookup returns a different session id`，证明上一版 guard 会接受 `sdk-session-1` 请求却返回 `sdk-session-2` 的交叉命中
- Focused green: `npm test -- --runInBand tests/unit/core/agents/backend/ClaudeCodeAdapter.test.ts` 通过，`1` suite / `72` tests passed；覆盖 `sessionId` mismatch、`id` alias mismatch、无可比 id 字段兼容，以及真实 SDK session resume
- Independent reviewer subagent 首轮提出 P3 测试缺口；补齐 `id` alias mismatch 和 no-id compatibility 后复审无 findings
- `npm run graphify:update:src` 已刷新 `graphify-out/`（`424` source files / `6137` nodes / `11626` edges / `221` communities）
- `npm run check:graphify`、`npm run check:module-docs`、`npm run check:devlog-order`、`git diff --check` 通过
- `OWNER_GUARD_APPROVED=1 npm run verify` 通过，`438` suites / `3254` tests passed，verify build ID `feature-phase0-capability.202605241909`
- `npm run build` 通过，standalone build ID `feature-phase0-capability.202605241910`
- Test Vault runtime proof：将 build `feature-phase0-capability.202605241910` 部署到 `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/` 后，部署版 `main.js` 与 `dist/main.js` SHA256 一致（`4761f41484e0ec57741d183d41189575d7c52095772fc95bd889b12a408e1fcd`），loaded runtime 报告同一 BUILD_ID
- `.obsidian-debug/diagnostic-resume-boundary-runtime-assertion-2026-05-24.json` 通过：在 deployed plugin runtime 中以 isolated fake SDK 验证 unknown resume id、mismatched `sessionId`、mismatched `id` alias 三类输入均调用一次 `getSessionInfo()`、保持 `queryCount=0`，并抛出 `Claude Code diagnostic resume validation failed`；`validAuthenticatedResumeAttempted=false`
- Runtime artifacts：`.obsidian-debug/diagnostic-resume-boundary-runtime-screenshot-2026-05-24.png`、`.obsidian-debug/diagnostic-resume-boundary-runtime-console-2026-05-24.txt`、`.obsidian-debug/diagnostic-resume-boundary-runtime-errors-2026-05-24.txt`；dev errors 为 `No errors captured.`
- 当前剩余风险不是拒绝边界，而是真实认证状态下 valid Claude resume 与 SDK catalog/query 可见性一致性的正向 proof；该项仍保持 diagnostic/gated

### 影响评估

本轮只收紧 Capability Lab diagnostic resume side channel，不新增稳定聊天恢复 UI，不开放跨后端 resume，不宣称 Claude Code full capability 完成。OpenCode 路径未修改。

## 2026-05-24 Phase 3 - Tool / Formatter / Security settings stale backend guard

### 目标

收紧 Tool、Formatter/LSP、Security 三个 OpenCode-owned 设置面板的 stale callback 边界：这些页面或二级 modal 在 OpenCode active 时挂载后，如果 active backend 切到 Claude Code，旧 callback 不能继续写 `.opencode`、写插件 OpenCode 设置、同步 OpenCode permission，或调用 OpenCode runtime restart/health API。

### 实施内容

| 文件 | 变更类型 | 详情 |
|---|---|---|
| `src/features/settings/SettingsToolSection.ts` | 后端边界修复 | 在 project tool create/open/delete、全局默认工具权限、单工具权限，以及 tool catalog / permission 写入后的本地 OpenCode restart 路径前增加 active OpenCode guard |
| `src/features/settings/SettingsToolDetailModal.ts` | 二级 modal guard | Save/Delete 执行前重新检查 active backend；modal 打开后切到 Claude Code 时只显示 Tools OpenCode-only Notice，不写入/删除 `.opencode/tools`，不触发父 section refresh/restart |
| `src/features/settings/SettingsFormatterSection.ts` | 后端边界修复 | 在 formatter/LSP mode switch、builtin/custom visual save、advanced JSON save 和 formatter/LSP 项目配置写入后的 restart 路径前增加 active OpenCode guard |
| `src/features/settings/SettingsSecuritySection.ts` | 后端边界修复 | 在 permission mode、auto restart、config editor/apply restart、blocklist/external access/export paths、blocked-command sync 和 restart helper 前增加 active OpenCode guard |
| `src/features/settings/settingsBackendGuards.ts` | 共享 guard helper | 抽出 settings owner 共用的 `activeBackend` / `enabledBackends` fallback 判断，避免各 OpenCode-owned settings section 复制并漂移 |
| `src/i18n/locales/en.ts` / `src/i18n/locales/zh.ts` | 文案新增 | 新增 Tools、Formatter/LSP、Security 各自的 OpenCode-only Notice 文案 |
| `tests/unit/features/settings/SettingsToolSection.test.ts` | +2 TDD 回归测试 | 覆盖 stale tool permission callback 与 stale project tool authoring callback |
| `tests/unit/features/settings/SettingsToolDetailModal.test.ts` | +1 TDD 回归测试 | 覆盖已打开 Tool detail modal 在切到 Claude Code 后的 Save/Delete stale callback |
| `tests/unit/features/settings/SettingsFormatterSection.test.ts` | +2 TDD 回归测试 | 覆盖 stale formatter / LSP mode callback 不写 OpenCode config、不重启 OpenCode |
| `tests/unit/features/settings/SettingsSecuritySection.test.ts` | +2 TDD 回归测试 | 覆盖 stale permission mode、restart apply 和 blocked-command sync callback |
| `tests/unit/features/settings/settingsBackendGuards.test.ts` | +3 TDD 回归测试 | 覆盖 active backend 有效、active backend stale 时回退到第一个 enabled backend，以及旧 mock 缺 settings 时保持 OpenCode active |
| `docs/modules/features/settings/*.md` | 文档更新 | 记录相关 owner / modal 的 OpenCode-owned callback 必须执行前二次检查 active backend |
| `docs/status/claude-code-current-state-2026-05-22.md` | 状态更新 | 记录本轮设置边界收紧范围、非目标和 TDD red/green evidence |

### 验证

- Red: focused tests 先失败，证明 stale Claude-active callback 会写 OpenCode tool permission、创建 `.opencode/tools`、写 formatter/LSP config、修改 Security permission mode、调用 OpenCode restart/health API，并让已打开的 Tool detail modal 写 `.opencode/tools/test-tool.ts`
- Focused green: `npm test -- --runInBand tests/unit/features/settings/SettingsToolDetailModal.test.ts` 通过，`1` suite / `1` test passed
- Broader focused tests: `npm test -- --runInBand tests/unit/features/settings/settingsBackendGuards.test.ts tests/unit/features/settings/SettingsToolSection.test.ts tests/unit/features/settings/SettingsToolDetailModal.test.ts tests/unit/features/settings/SettingsFormatterSection.test.ts tests/unit/features/settings/SettingsSecuritySection.test.ts tests/unit/features/settings/SettingsServerSection.test.ts tests/unit/features/settings/SettingsMcpSection.actions.test.ts` 通过，`7` suites / `94` tests passed
- `npm run graphify:update:src` 已刷新 `graphify-out/`（`424` source files / `6135` nodes / `11622` edges / `217` communities）
- `npm run check:graphify`、`npm run check:module-docs`、`npm run check:devlog-order`、`git diff --check`、`npm run lint` 通过
- `OWNER_GUARD_APPROVED=1 npm run verify` 通过，`438` suites / `3249` tests passed，verify build ID `feature-phase0-capability.202605241813`
- `npm run build` 通过，standalone build ID `feature-phase0-capability.202605241814`；并将 `main.js`、`manifest.json`、`styles.css`、`assets/`、`node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/` 部署到 `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`
- Test Vault `main.js` 已验证包含 `feature-phase0-capability.202605241814`；Claude SDK binary checksum 与 dist 一致：`368dcd9709c85534f673071e7cc8eb5422bcff367fb9bdf5ce25d9619aab7ef5`
- Runtime proof: `.obsidian-debug/claude-opencode-settings-stale-backend-gate-assertion-2026-05-24-result.json` 在重新加载到部署版 `feature-phase0-capability.202605241814` 后返回 outer `ok: true` 且 inner `ok: true`。脚本在真实 Test Vault settings editor-area DOM 中验证 Tools custom、Tool detail modal、Formatter、LSP、Security config/safety 控件挂载后切到 Claude Code，再触发 stale New Tool、Tool modal Save/Delete、Formatter/LSP mode、permission template、restart、blocklist、blocked-command callbacks；`saveSettings`、tool permission 写入、formatter/LSP config 写入、OpenCode bash deny sync、OpenCode health/start/stop、`.opencode/**` adapter write/remove、confirm 均保持 `0`，出现 OpenCode-only Notice，且 settings layout 无横向溢出
- Runtime artifacts: `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian-debug/claude-opencode-settings-stale-backend-gate-runtime-2026-05-24.png`、`.obsidian-debug/claude-opencode-settings-stale-backend-gate-console-2026-05-24.txt`、`.obsidian-debug/claude-opencode-settings-stale-backend-gate-errors-2026-05-24.txt`；dev errors 为 `No errors captured.`

### 影响评估

本轮只收紧 OpenCode-owned settings 写操作在 Claude active backend 下的边界，不新增 Claude Tools / Formatter / Security authoring 或 runtime-control 能力，不宣称 Claude full capability 完成。OpenCode active 下原有设置行为保持不变。

---

## 2026-05-24 Phase 3 - Server settings stale backend guard

### 目标

收紧 Server settings 的 OpenCode-only stale callback 边界：页面在 OpenCode active 时挂载后，如果 active backend 切到 Claude Code，旧的 connection/auth/status callback 不能继续改写 OpenCode server settings 或调用 OpenCode server runtime。

### 实施内容

| 文件 | 变更类型 | 详情 |
|---|---|---|
| `src/features/settings/SettingsServerSection.ts` | 后端边界修复 | 在 server mode/auth/text setting 写回，以及 status start/stop/test/manual refresh 操作前增加 active OpenCode guard；非 OpenCode active 时显示 Server OpenCode-only Notice 并跳过 settings mutation、`saveSettings()`、settings redisplay、`openCodeService.start()`、`stop()`、`checkHealth()` |
| `src/i18n/locales/en.ts` / `src/i18n/locales/zh.ts` | 文案新增 | 新增 `settings.server.notice.openCodeOnly`，明确 OpenCode server settings 只在 OpenCode active 时可用 |
| `tests/unit/features/settings/SettingsServerSection.test.ts` | +2 TDD 回归测试 | 覆盖 OpenCode active 挂载后切到 Claude Code，再触发 stale status buttons 或 connection controls 时不调用 OpenCode runtime，也不写回 server settings |
| `docs/modules/features/settings/SettingsServerSection.md` | 文档更新 | 记录 Server settings callback 和 status polling 必须重新检查 active backend，避免 stale mounted UI 泄漏到 Claude active backend |
| `docs/status/claude-code-current-state-2026-05-22.md` | 状态更新 | 记录本轮 Server settings stale backend guard 与 focused test evidence |

### 验证

- Red: focused tests 先失败，证明 stale Claude-active callback 会调用 `openCodeService.start()`，并把 server mode 从 `local` 改成 `remote`
- Focused green: `npm test -- --runInBand tests/unit/features/settings/SettingsServerSection.test.ts` 通过，`1` suite / `6` tests passed
- `npm run graphify:update:src` 已刷新 `graphify-out/`（`6124` nodes / `11570` edges / `221` communities）
- `npm run check:graphify`、`npm run check:module-docs`、`npm run check:devlog-order`、`git diff --check`、`npm run lint` 通过
- `OWNER_GUARD_APPROVED=1 npm run verify` 通过，`436` suites / `3239` tests passed，verify build ID `feature-phase0-capability.202605241714`
- `npm run build` 通过，standalone build ID `feature-phase0-capability.202605241714`；并将 `main.js`、`manifest.json`、`styles.css`、`assets/`、`node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/` 部署到 `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`
- Test Vault `main.js` 已验证包含 `feature-phase0-capability.202605241714`；Claude SDK binary checksum 与 dist 一致：`368dcd9709c85534f673071e7cc8eb5422bcff367fb9bdf5ce25d9619aab7ef5`
- Runtime proof: `.obsidian-debug/claude-server-settings-stale-backend-gate-assertion-2026-05-24-result.json` 在部署版 `feature-phase0-capability.202605241714` 上返回 outer `ok: true` 且 inner `ok: true`。脚本在真实 Test Vault settings editor-area Server DOM 中验证 connection/status controls 挂载后切到 Claude Code，再触发 stale mode/host/start/stop/refresh；`saveSettings`、`openCodeService.start`、`stop`、`checkHealth`、`getServerDiagnostics`、`getServerStatus` 均保持 `0`，server mode/host 保持 `local` / `127.0.0.1`，出现 Server OpenCode-only Notice，且 settings root 无横向溢出（`rootScrollWidth: 1042` / `rootClientWidth: 1042`）
- Runtime artifacts: `.obsidian-debug/claude-server-settings-stale-backend-gate-runtime-2026-05-24.png`、`.obsidian-debug/claude-server-settings-stale-backend-gate-console-2026-05-24.txt`、`.obsidian-debug/claude-server-settings-stale-backend-gate-errors-2026-05-24.txt`；dev errors 为 `No errors captured.`

### 影响评估

本轮只收紧 SettingsServerSection 中 OpenCode-only server settings/runtime 操作边界，不新增 Claude Code sidecar 管理能力，不宣称 Claude full capability 完成。OpenCode active 下的 server 管理行为保持不变。

---

## 2026-05-24 Phase 3 - MCP settings stale backend guard

### 目标

收紧 MCP settings 的 OpenCode-only stale callback 边界：页面在 OpenCode active 时挂载后，如果 active backend 切到 Claude Code，旧的 MCP toolbar / server-card callback 不能继续触发 OpenCode MCP runtime、弹出 Add/Edit modal、打开 Delete confirm 或写 `.opencode/opencode.json`。

### 实施内容

| 文件 | 变更类型 | 详情 |
|---|---|---|
| `src/features/settings/SettingsMcpSection.ts` | 后端边界修复 | 在 toolbar refresh、server card runtime actions、Add/Edit modal open、Add/Edit save callback、project Delete 开头增加 active OpenCode guard；非 OpenCode active 时显示 MCP OpenCode-only Notice 并跳过 `refreshMcpServerStatus()`、connect/disconnect/auth、modal construction、confirm、`McpConfigService.deleteServer()` 和 project config write |
| `src/i18n/locales/en.ts` / `src/i18n/locales/zh.ts` | 文案新增 | 新增 `settings.server.mcp.notice.openCodeOnly`，明确 MCP runtime controls 只在 OpenCode active 时可用 |
| `tests/unit/features/settings/SettingsMcpSection.actions.test.ts` | +3 TDD 回归测试 | 覆盖 OpenCode active 挂载后切到 Claude Code，再触发 stale connect/disconnect、toolbar refresh/add、project delete 时不调用 OpenCode-only runtime/config 路径 |
| `docs/modules/features/settings/SettingsMcpSection.md` | 文档更新 | 记录 MCP settings callback 必须在执行前重新检查 active backend，避免 stale mounted UI 泄漏到 Claude active backend |
| `docs/status/claude-code-current-state-2026-05-22.md` | 状态更新 | 记录本轮 MCP settings stale backend guard 与 focused test evidence |

### 验证

- Red: focused tests 先失败，证明 stale Claude-active callback 会调用 `connectMcpServer('disabled')`、`refreshMcpServerStatus()`，并在 Delete 前弹出 confirm
- Focused green: `npm test -- --runInBand tests/unit/features/settings/SettingsMcpSection.actions.test.ts` 通过，`1` suite / `9` tests passed
- `npm run graphify:update:src` 已刷新 `graphify-out/`（`6122` nodes / `11565` edges / `217` communities）
- `npm run check:graphify`、`npm run check:module-docs`、`npm run check:devlog-order`、`git diff --check`、`npm run lint` 通过
- `OWNER_GUARD_APPROVED=1 npm run verify` 通过，`436` suites / `3237` tests passed，verify build ID `feature-phase0-capability.202605241702`
- `npm run build` 通过，standalone build ID `feature-phase0-capability.202605241703`；并将 `main.js`、`manifest.json`、`styles.css`、`assets/`、`node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/` 部署到 `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`
- Test Vault `main.js` 已验证包含 `feature-phase0-capability.202605241703`；Claude SDK binary checksum 与 dist 一致：`368dcd9709c85534f673071e7cc8eb5422bcff367fb9bdf5ce25d9619aab7ef5`
- Runtime proof: `.obsidian-debug/claude-mcp-settings-stale-backend-gate-assertion-2026-05-24-result.json` 在部署版 `feature-phase0-capability.202605241703` 上返回 outer `ok: true` 且 inner `ok: true`。脚本在真实 Test Vault settings editor-area MCP DOM 中验证 MCP tab 挂载后切到 Claude Code，再点击 stale Refresh/Add/Connect/Disconnect/Delete；`refreshMcpServerStatus`、connect/disconnect/auth、`addMcpServer`、project config read/write、Delete confirm 均保持 `0`，Add/Edit modal 未打开，出现 MCP OpenCode-only Notice，且 settings root 无横向溢出（`rootScrollWidth: 1042` / `rootClientWidth: 1042`）
- Runtime artifacts: `.obsidian-debug/claude-mcp-settings-stale-backend-gate-runtime-2026-05-24.png`、`.obsidian-debug/claude-mcp-settings-stale-backend-gate-console-2026-05-24.txt`、`.obsidian-debug/claude-mcp-settings-stale-backend-gate-errors-2026-05-24.txt`；dev errors 为 `No errors captured.`

### 影响评估

本轮只收紧 SettingsMcpSection 中 OpenCode-only MCP runtime/project-config 操作边界，不新增 Claude MCP authoring 或 runtime-control 能力，不宣称 Claude full capability 完成。OpenCode active 下的 MCP 管理行为保持不变。

---

## 2026-05-24 Phase 3 - Conversation settings project config stale backend guard

### 目标

收紧 Conversation settings 里 OpenCode-only 项目配置控件的 stale callback 边界：页面在 OpenCode active 时挂载后，如果 active backend 切到 Claude Code，旧的 compaction / share mode 控件不能继续写 `.opencode/opencode.json` 或重启 OpenCode。

### 实施内容

| 文件 | 变更类型 | 详情 |
|---|---|---|
| `src/features/settings/SettingsConversationSection.ts` | 后端边界修复 | 在项目级 compaction / share change callback 和 share diagnostics click handler 开头增加 active OpenCode guard；非 OpenCode active 时先恢复控件并跳过本地 state/chip/diagnostics 更新、`updateCompactionConfig()`、`reapplyCompactionConfigFromProjectConfig()`、`updateShareConfig()`、OpenCode restart、`checkHealth()` 和 public share-host probe |
| `src/i18n/locales/en.ts` / `src/i18n/locales/zh.ts` | 文案新增 | 新增 generic `settings.conversation.projectConfig.openCodeOnly` notice，避免复用 unshare 专用文案 |
| `tests/unit/features/settings/SettingsConversationSection.test.ts` | +3 TDD 回归测试 | 覆盖 OpenCode active 挂载后切到 Claude Code，再触发 stale compaction / share save 控件或 share diagnostics 按钮时不调用 OpenCode-only 写入/检查路径，也不突变 compaction local state、share policy chip 或 diagnostics UI |
| `docs/modules/features/settings/SettingsConversationSection.md` | 文档更新 | 记录 compaction/share 项目配置 change callback 会在本地状态变化前重新检查 active backend |
| `docs/status/claude-code-current-state-2026-05-22.md` | 状态更新 | 记录本轮 project config stale backend guard 与 focused test evidence |

### 验证

- Red: focused tests 先失败，证明 stale Claude-active callback 会先把 compaction local state 改成 `tailTurns: 5`，把可见 share policy chip 从 Manual 改成 Auto，并且 stale diagnostics click 仍会调用 `openCodeService.checkHealth()`
- Focused green: `npm test -- --runInBand tests/unit/features/settings/SettingsConversationSection.test.ts` 通过，`1` suite / `35` tests passed
- `npm run graphify:update:src` 已刷新 `graphify-out/`
- `npm run check:graphify`、`npm run check:module-docs`、`npm run check:devlog-order`、`git diff --check` 通过
- `OWNER_GUARD_APPROVED=1 npm run verify` 通过，`436` suites / `3234` tests passed，verify build ID `feature-phase0-capability.202605241436`
- `npm run build` 通过，standalone build ID `feature-phase0-capability.202605241436`；并将 `main.js`、`manifest.json`、`styles.css`、`assets/`、`node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/` 部署到 `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`
- Test Vault `main.js` 已验证包含 `feature-phase0-capability.202605241436`；Claude SDK binary checksum 与 dist 一致：`368dcd9709c85534f673071e7cc8eb5422bcff367fb9bdf5ce25d9619aab7ef5`
- Runtime proof: `.obsidian-debug/claude-settings-project-config-gate-assertion-2026-05-24.json` 在部署版 `feature-phase0-capability.202605241436` 上返回 outer `ok: true` 且 inner `ok: true`。脚本在真实 settings editor-area DOM 中验证 stale compaction input、share dropdown、share diagnostics button；两段 `phaseCalls` 中 `updateCompactionConfig`、`reapplyCompactionConfigFromProjectConfig`、`updateShareConfig`、`checkHealth`、`stop`、`start`、`requestUrl` 均为 `0`，tail input / share policy chip / diagnostics UI 保持不变，按钮未被 disabled，并出现 generic OpenCode-only Notice
- Runtime artifacts: `.obsidian-debug/claude-settings-project-config-gate-2026-05-24.png`、`.obsidian-debug/claude-settings-project-config-gate-console-2026-05-24.txt`、`.obsidian-debug/claude-settings-project-config-gate-errors-2026-05-24.txt`；dev errors 为 `No errors captured.`

### 影响评估

本轮只收紧 SettingsConversationSection 中 OpenCode-only 项目配置写入边界，不新增 Claude compaction/share mode 能力，不宣称 Claude full capability 完成。OpenCode active 下的项目级 compaction/share 现有行为保持不变。

---

## 2026-05-24 Phase 3 - Ordinary slash command backend gate hardening

### 目标

收紧普通 runtime/project slash command 的 backend ownership：Claude conversation 即使带有 `backendSessionId`，也不能通过 `/build` 或 `/skills skill-id ...` 进入 OpenCode-only `session.command` 执行路径。

### 实施内容

| 文件 | 变更类型 | 详情 |
|---|---|---|
| `src/features/chat/services/SlashCommandExecutionService.ts` | 后端边界修复 | ordinary runtime/project command dispatch 在 `runSessionCommand()` 前增加 `backend === 'opencode'` gate；非 OpenCode conversation 消费命令并复用现有 slash failure notifier，不启动 OpenCode sync |
| `tests/unit/features/chat/SlashCommandExecutionService.test.ts` | +2 TDD 回归测试 | 覆盖 Claude conversation + `backendSessionId` 下 `/build --fast` 与 `/skills skill-review note.md` 不调用 `runSessionCommand()` / sync |
| `docs/modules/features/chat/services/SlashCommandExecutionService.md` | 文档更新 | 记录 ordinary runtime/project slash commands 与 prefixed skills 仍是 OpenCode-only dispatch |
| `docs/status/claude-code-current-state-2026-05-22.md` | 状态更新 | 记录本轮 ordinary slash command backend gate 和 focused test evidence |

### 验证

- Red: focused tests 先失败，证明 Claude `backendSessionId` 会被错误传给 `host.runSessionCommand('claude-session-1', ...)`，覆盖 `/build --fast` 与 `/skills skill-review note.md`
- Focused green: `npm test -- --runInBand tests/unit/features/chat/SlashCommandExecutionService.test.ts` 通过，`1` suite / `19` tests passed
- Focused regression set: `npm test -- --runInBand tests/unit/features/chat/SlashCommandExecutionService.test.ts tests/unit/features/chat/SlashCommandExecutionService.undoRedo.test.ts tests/unit/features/chat/SlashCommandExecutionService.share.test.ts` 通过，`3` suites / `35` tests passed
- `npm run graphify:update:src` 已刷新 `graphify-out/`；`git diff --check`、`npm run check:devlog-order`、`npm run check:module-docs`、`npm run check:graphify` 通过
- `OWNER_GUARD_APPROVED=1 npm run verify` 通过，`436` suites / `3231` tests passed，verify build ID `feature-phase0-capability.202605241345`
- `npm run build` 通过，standalone build ID `feature-phase0-capability.202605241345`；并将 `main.js`、`manifest.json`、`styles.css`、`assets/`、`node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/` 部署到 `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`
- Test Vault `main.js` 已验证包含 `feature-phase0-capability.202605241345`；Claude SDK binary checksum 与 dist 一致：`368dcd9709c85534f673071e7cc8eb5422bcff367fb9bdf5ce25d9619aab7ef5`
- Runtime proof: `.obsidian-debug/claude-slash-command-gate-assertion-2026-05-24.json` 在部署版 `feature-phase0-capability.202605241345` 上返回 `ok: true`。脚本走真实 DOM composer (`.opencodian-input` + `.opencodian-send-btn`)，Claude conversation 带 `backendSessionId: 'claude-session-command-1'`；`/build --fast` 与 `/skills skill-review note.md` 被识别并消费，但 `runSessionCommand`、`startConversationSyncLoop`、`syncVisibleConversationInBackground` 计数均为 `0`，slash failure notifier 只报告 `No OpenCode session available`
- Runtime artifacts: `.obsidian-debug/claude-slash-command-gate-2026-05-24.png`、`.obsidian-debug/claude-slash-command-gate-console-2026-05-24.txt`、`.obsidian-debug/claude-slash-command-gate-errors-2026-05-24.txt`；dev errors 为 `No errors captured.`

### 影响评估

本轮只收紧 ordinary runtime/project slash command 与 prefixed skill dispatch 的 OpenCode-only 边界，不宣称 Claude full capability 完成，也不新增 Claude completed slash command execution capability。OpenCode conversation 的普通 command 执行保持不变。

---

## 2026-05-24 Phase 3 - Session settings modal share backend gate

### 目标

收紧会话设置弹窗里的 share / unshare backend ownership：Claude conversation 即使带有 `backendSessionId` 且 modal action 被强制暴露，也不能调用 OpenCode-only share / unshare write seam。

### 实施内容

| 文件 | 变更类型 | 详情 |
|---|---|---|
| `src/features/chat/services/ConversationSessionSettingsCoordinator.ts` | 后端边界修复 | `shareCurrentConversation()` / `unshareCurrentConversation()` 增加 `backend === 'opencode'` gate，复用现有分享失败/不可用文案并跳过 OpenCode-only 写入 |
| `tests/unit/features/chat/ConversationSessionSettingsCoordinator.shareUrlRouting.test.ts` | +2 TDD 回归测试 | 覆盖 Claude conversation + `backendSessionId` + forced `supportsSessionSharing: true` 不调用 `shareSession()` / `unshareSession()` |
| `docs/modules/features/chat/services/ConversationSessionSettingsCoordinator.md` | 文档更新 | 记录 modal 分享读取仍走 backend-aware read seam，但分享/取消分享写入是 OpenCode-only |
| `docs/status/claude-code-current-state-2026-05-22.md` | 状态更新 | 记录本轮 modal share write backend gate 和 focused test evidence |

### 验证

- Red: focused test 先失败，证明 Claude `backendSessionId` 会被错误传给 `host.shareSession('claude-session-1')` / `host.unshareSession('claude-session-1')`
- Focused green: `npm test -- --runInBand tests/unit/features/chat/ConversationSessionSettingsCoordinator.test.ts tests/unit/features/chat/ConversationSessionSettingsCoordinator.shareUrlRouting.test.ts` 通过，`2` suites / `22` tests passed
- `npm run graphify:update:src` 已刷新 `graphify-out/`
- `OWNER_GUARD_APPROVED=1 npm run verify` 通过，`436` suites / `3229` tests passed，verify build ID `feature-phase0-capability.202605241319`
- `npm run build` 通过，standalone build ID `feature-phase0-capability.202605241321`；并将 `main.js`、`manifest.json`、`styles.css`、`assets/`、`node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/` 部署到 `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`
- Test Vault `main.js` 已验证包含 `feature-phase0-capability.202605241321`；Claude SDK binary checksum 与 dist 一致：`368dcd9709c85534f673071e7cc8eb5422bcff367fb9bdf5ce25d9619aab7ef5`
- Runtime proof: `.obsidian-debug/claude-session-settings-share-gate-assertion-2026-05-24.json` 在部署版 `feature-phase0-capability.202605241321` 上返回 `ok: true`。脚本打开真实 session settings modal，强制显示 Claude conversation 的 share actions，并分别覆盖 known-unshared share 与 stale shared unshare 状态；OpenCode `shareSession` / `unshareSession` 与 clipboard write 计数均为 `0`
- Runtime artifacts: `.obsidian-debug/claude-session-settings-share-gate-2026-05-24.png`、`.obsidian-debug/claude-session-settings-share-gate-console-2026-05-24.txt`、`.obsidian-debug/claude-session-settings-share-gate-errors-2026-05-24.txt`；dev errors 为 `No errors captured.`

### 影响评估

本轮只收紧会话设置 modal 的 OpenCode-only share / unshare write 边界，不宣称 Claude full capability 完成，不新增 Claude share URL 写入概念。`readBackendSessionShareUrl()` 的 backend-aware 读取路径保持不变。

---

## 2026-05-24 Phase 3 - Slash compact backend gate hardening

### 目标

收紧 slash `/compact` 的 backend ownership：Claude conversation 即使带有 `backendSessionId`，也不能调用 OpenCode-only compact / summarize host。

### 实施内容

| 文件 | 变更类型 | 详情 |
|---|---|---|
| `src/features/chat/services/SlashCommandExecutionService.ts` | 后端边界修复 | `/compact` 增加 `backend !== 'opencode'` gate，复用现有 compact no-session notice 并跳过 OpenCode-only host 调用 |
| `tests/unit/features/chat/SlashCommandExecutionService.share.test.ts` | +1 TDD 回归测试 | 覆盖 Claude conversation + `backendSessionId` 不调用 `runCompactSession()` |
| `docs/modules/features/chat/services/SlashCommandExecutionService.md` | 文档更新 | 记录 `/compact` 和 `/undo` / `/redo` / `/share` / `/unshare` 一样属于 OpenCode-only synthetic command gate |

### 验证

- Red: focused test 先失败，证明 Claude `backendSessionId` 会被错误传给 `host.runCompactSession('claude-session-1')`
- Focused green: `npm test -- --runInBand tests/unit/features/chat/SlashCommandExecutionService.test.ts tests/unit/features/chat/SlashCommandExecutionService.undoRedo.test.ts tests/unit/features/chat/SlashCommandExecutionService.share.test.ts` 通过，`3` suites / `33` tests passed
- `npm run graphify:update:src` 已刷新 `graphify-out/`
- `OWNER_GUARD_APPROVED=1 npm run verify` 通过，`436` suites / `3227` tests passed，build ID `feature-phase0-capability.202605241254`
- `npm run build` 通过，standalone build ID `feature-phase0-capability.202605241255`；并将 `main.js`、`manifest.json`、`styles.css`、`assets/`、`node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/` 部署到 `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`
- Test Vault `main.js` 已验证包含 `feature-phase0-capability.202605241255`；Claude SDK binary checksum 与 dist 一致：`368dcd9709c85534f673071e7cc8eb5422bcff367fb9bdf5ce25d9619aab7ef5`
- Runtime proof: `.obsidian-debug/claude-slash-compact-gate-assertion-2026-05-24.json` 在部署版 `feature-phase0-capability.202605241255` 上返回 `ok: true`。脚本走真实 DOM composer (`.opencodian-input` + `.opencodian-send-btn`)，Claude conversation 带 `backendSessionId: 'claude-session-compact-1'`；`/compact` 被消费，但 OpenCode `getSessionContextUsageSnapshot` / `summarizeSession` 计数均为 `0`，消息数保持 `0`
- Runtime artifacts: `.obsidian-debug/claude-slash-compact-gate-2026-05-24.png`、`.obsidian-debug/claude-slash-compact-gate-console-2026-05-24.txt`、`.obsidian-debug/claude-slash-compact-gate-errors-2026-05-24.txt`；dev errors 为 `No errors captured.`

### 影响评估

本轮只收紧 OpenCode-only compact / summarize 边界，不宣称 Claude full capability 完成，不新增 Claude compact 概念。

---

## 2026-05-24 Phase 3 - Slash share backend gate hardening

### 目标

收紧 slash `/share` 与 `/unshare` 的 backend ownership：Claude conversation 即使带有 `backendSessionId`，也不能调用 OpenCode-only share / unshare host。

### 实施内容

| 文件 | 变更类型 | 详情 |
|---|---|---|
| `src/features/chat/services/SlashCommandExecutionService.ts` | 后端边界修复 | `/share` 与 `/unshare` 增加 `backend !== 'opencode'` gate，复用现有 no-session notice 并跳过 OpenCode-only host 调用 |
| `tests/unit/features/chat/SlashCommandExecutionService.share.test.ts` | +2 TDD 回归测试 | 覆盖 Claude conversation + `backendSessionId` 不调用 `shareSession()` / `unshareSession()` |
| `docs/modules/features/chat/services/SlashCommandExecutionService.md` | 文档更新 | 记录 `/share` / `/unshare` 和 `/undo` / `/redo` 一样属于 OpenCode-only synthetic command gate |

### 验证

- Red: focused test 先失败，证明 Claude `backendSessionId` 会被错误传给 `host.shareSession('claude-session-1')` / `host.unshareSession('claude-session-1')`
- Focused green: `npm test -- --runInBand tests/unit/features/chat/SlashCommandExecutionService.test.ts tests/unit/features/chat/SlashCommandExecutionService.undoRedo.test.ts tests/unit/features/chat/SlashCommandExecutionService.share.test.ts` 通过，`3` suites / `32` tests passed
- `npm run graphify:update:src` 已刷新 `graphify-out/`
- `OWNER_GUARD_APPROVED=1 npm run verify` 通过，`436` suites / `3226` tests passed，build ID `feature-phase0-capability.202605241245`
- `npm run build` 通过，并将 `main.js`、`manifest.json`、`styles.css`、`assets/`、`node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/` 部署到 `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`
- Test Vault `main.js` 已验证包含 `feature-phase0-capability.202605241245`；Claude SDK binary checksum 与 dist 一致：`368dcd9709c85534f673071e7cc8eb5422bcff367fb9bdf5ce25d9619aab7ef5`
- Runtime proof: `.obsidian-debug/claude-slash-share-unshare-gate-assertion-2026-05-24.json` 在部署版 `feature-phase0-capability.202605241245` 上返回 `ok: true`。脚本走真实 DOM composer (`.opencodian-input` + `.opencodian-send-btn`)，Claude conversation 带 `backendSessionId: 'claude-session-1'`；`/share` 与 `/unshare` 被消费，但 OpenCode `shareSession` / `unshareSession` 计数均为 `0`，clipboard write 为 `0`，消息数保持 `0`
- Runtime artifacts: `.obsidian-debug/claude-slash-share-unshare-gate-2026-05-24.png`、`.obsidian-debug/claude-slash-share-unshare-gate-console-2026-05-24.txt`、`.obsidian-debug/claude-slash-share-unshare-gate-errors-2026-05-24.txt`；dev errors 为 `No errors captured.`

### 影响评估

本轮只收紧 OpenCode-only share / unshare write 边界，不宣称 Claude full capability 完成，不新增 Claude share URL 概念。

---

## 2026-05-24 Phase 3 - Claude new-conversation backend ownership boundary

### 目标

继续收紧 Claude Code 接入的 backend ownership：当当前 active backend 是 Claude，但 Claude session adapter 不可用或不具备 sessions 能力时，新建会话必须失败在 Claude 边界内，不能借 registry 默认 active 或 OpenCode fallback 偷偷创建 OpenCode 会话。

本 follow-up 修正 reviewer gap patch 的过度收紧：`sessions` 声明仍然足以进入只读 session 路由；只有新建 conversation 的创建路径需要额外确认 adapter 真的能创建 session。

### 发现

`OpenCodianPlugin.createConversation()` 先读取 `AgentServiceRegistry.getActive()`，而 registry 在只剩 OpenCode adapter session-capable 时会默认 active 到 OpenCode。这样 `settings.activeBackend = 'claude-code'` 且 OpenCode 仍启用时，active Claude 缺失会话能力的场景可能静默生成 `backend: "opencode"` conversation，并写入 `openCodeSessionId`。

Reviewer gap follow-up 的根因是把 read/list/preview/title 等只读 session seam 和 `createConversation()` 的写入创建 seam 绑到了同一个 `hasSessionCapability()`。malformed sessions adapter 可能声明 capability 并提供 `getSession` / `listSessions` / `getSessionMessages`，但缺少创建用的 `createSession` 等方法；这种 adapter 不应参与新建会话，却仍应服务只读路由。

### 实施内容

| 文件 | 变更类型 | 详情 |
|---|---|---|
| `src/core/agents/backend/AgentBackendRouting.ts` | 后端能力防护 | 恢复 `hasSessionCapability()` 的 broad read-routing 语义，并新增 `hasSessionCreationCapability()` 作为新建 conversation 的集中 guard |
| `tests/unit/core/agents/backend/AgentBackendRouting.test.ts` | 测试调整 | 覆盖声明 sessions 但缺 `createSession` 的 adapter 仍可进入 read-routing lookup，同时会被 creation helper 拒绝 |
| `src/main.ts` | 后端边界修复 | `createConversation()` 改为以 `settings.activeBackend` 查找同名 adapter，并用 `hasSessionCreationCapability()` 阻止 malformed active backend fallback 到 OpenCode |
| `tests/unit/main.test.ts` | +1/+1 follow-up 测试 | 覆盖 active Claude + OpenCode 可用 + Claude session service 缺失时不创建 OpenCode session、不 warmup、不写本地 conversation；follow-up 覆盖 active Claude 已注册 malformed sessions adapter 但缺 `createSession` 时仍抛 active-backend unsupported，不 fallback、不 warmup、不写 storage、不 append conversation |
| `docs/modules/entry-point/main.md` | 文档更新 | 记录新会话 owner 来自 `settings.activeBackend`，并说明非 OpenCode 不再 fallback 到 OpenCode |
| `docs/status/claude-code-current-state-2026-05-22.md` | 状态更新 | 记录本轮 new-conversation backend ownership boundary、runtime proof，以及 reviewer gap follow-up 的 focused evidence 边界 |

### 验证

- Focused test 已完成 red-green：新增断言先失败并实际解析出 `backend: "opencode"` conversation；修复后 `npm test -- --runInBand tests/unit/main.test.ts` 通过，`34` tests passed
- Correction focused tests 覆盖：malformed sessions adapter 仍可通过 `getConversationSessionBackendService()` 参与只读 session 路由；`hasSessionCreationCapability()` 会拒绝缺 `createSession` 的 adapter；`createConversation()` 覆盖 active Claude 已注册但缺 `createSession` 时抛 `Cannot create conversation: active backend does not support sessions`，且 OpenCode adapter / legacy `openCodeService` 不被调用，不 warmup，不写 storage，不 append conversation
- Final gate: `OWNER_GUARD_APPROVED=1 npm run verify` 通过，`435` suites / `3224` tests passed，production build 通过，`BUILD_ID: feature-phase0-capability.202605241213`
- Standalone build: `npm run build` 通过，产出同一 `BUILD_ID: feature-phase0-capability.202605241213`
- Deploy: 已按顺序部署 `dist/main.js`、`dist/manifest.json`、`dist/styles.css`、`dist/assets/`、`dist/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/` 到 `/Volumes/SDD2T/obsidian-vault-write/testvault/.obsidian/plugins/opencodian/`
- Deploy verification: Test Vault `main.js` 包含 `feature-phase0-capability.202605241213`；Claude SDK binary checksum 与 dist 一致：`368dcd9709c85534f673071e7cc8eb5422bcff367fb9bdf5ce25d9619aab7ef5`
- Runtime proof: `.obsidian-debug/claude-malformed-session-creation-boundary-assertion-2026-05-24.json` 通过，截图为 `.obsidian-debug/claude-malformed-session-creation-boundary-2026-05-24.png`，console 为 `.obsidian-debug/claude-malformed-session-creation-boundary-console-2026-05-24.txt`，errors 为 `.obsidian-debug/claude-malformed-session-creation-boundary-errors-2026-05-24.txt`；运行时报告 `ok: true`、`OpenCodian 1.0.0 BUILD_ID=feature-phase0-capability.202605241213`、registered malformed Claude adapter declared sessions but omitted `createSession`，`createConversation()` 抛出 `Cannot create conversation: active backend does not support sessions`，OpenCode adapter `createSession` 为 `0`，legacy `openCodeService.createSession` 为 `0`，storage `saveConversation` 为 `0`，conversation count delta 为 `0`，state restored，`dev:errors` 为 `No errors captured.`

### 影响评估

本轮只修复新建会话的 backend 归属边界，不宣称 Claude full capability 完成，也不新增稳定 Claude session UI。OpenCode active/legacy 新建会话仍保留 session-bootstrap warmup、`openCodeSessionId` 兼容写入和既有行为。

---

## 2026-05-24 Phase 3 - Claude title fallback backend boundary

### 目标

继续推进 Claude Code 会话闭环里的 backend ownership：标题生成可以读取 Claude 官方 summary，但不能在 Claude 没有官方 summary 时偷偷创建 OpenCode 临时标题会话。

### 发现

`TitleGenerationService` 的官方标题读取已经通过 `readBackendSessionTitle()` 按 backend 路由；但官方标题为空时，后续 AI fallback 无条件调用 `openCodeService.createSession('Title Generation')` 和 `requestAssistantResponse()`。这会让 Claude conversation 在后台借用 OpenCode 会话生成标题，违反 backend 归属边界，也可能在 OpenCode 不可用时把 Claude 标题状态错误标成失败。

### 实施内容

| 文件 | 变更类型 | 详情 |
|---|---|---|
| `src/features/chat/services/TitleGenerationService.ts` | 后端边界修复 | 非 OpenCode conversation 无官方标题时回调 first-message local title，不再进入 OpenCode AI fallback |
| `tests/unit/features/chat/TitleGenerationService.test.ts` | +1 测试 | 覆盖 Claude conversation 无官方 summary 时调用 Claude `getSession()`，不调用 OpenCode 临时 session / request / delete API |
| `docs/modules/features/chat/services/TitleGenerationService.md` | 文档更新 | 记录 AI fallback 只适用于 OpenCode，Claude/no-summary 保留本地标题 |
| `docs/status/claude-code-current-state-2026-05-22.md` | 状态更新 | 记录本轮 title fallback backend boundary |

### 验证

- Focused test 已完成 red-green：新增断言先失败，修复后 `npm test -- --runInBand tests/unit/features/chat/TitleGenerationService.test.ts` 通过，`9` tests passed
- `npm run check:devlog-order`、`npm run check:module-docs`、`npm run graphify:update:src`、`npm run check:graphify` 均通过
- Full gate: `OWNER_GUARD_APPROVED=1 npm run verify` 通过，`435` suites / `3220` tests passed，production build 通过
- Build/deploy: `npm run build` 产出部署 `BUILD_ID: feature-phase0-capability.202605241119`；已按顺序部署 `dist/main.js`、`dist/manifest.json`、`dist/styles.css`、`dist/assets/`、`dist/node_modules/` 到 Test Vault，并确认 Test Vault `main.js` 含该 BUILD_ID
- Runtime proof: `.obsidian-debug/claude-title-fallback-boundary-assertion-2026-05-24.json` 通过，截图为 `.obsidian-debug/claude-title-fallback-boundary-2026-05-24.png`；运行时报告 Claude `getSession` 调用 `1` 次，OpenCode fallback `createSession` / `requestAssistantResponse` / `deleteSession` 均为 `0`，`dev:errors` 为 `No errors captured.`

### 影响评估

本轮不新增 Claude backend-neutral title agent，也不提升 Claude 标题生成能力；只是防止 Claude 会话误用 OpenCode fallback。OpenCode smart title fallback 行为保持不变。

---

## 2026-05-24 Phase 3 - Claude settings runtime boundary coverage

### 目标

继续推进 Claude Code 可用闭环里的设置面 honest exposure：让所有 restart-sensitive 的 Claude 设置 tab 都明确提示“下一次 query 或重启 persistent session 才生效”，避免 Runtime / Tools / Limits 看起来像会全部 live-update。

### 发现

前一轮已把 Context & Sources tab 接上 runtime boundary notice 和 `restartPersistentQueries('settings-change')` 操作，但 Runtime tab 的 env / executable、Tools tab 的 MCP/tools allow-block list、Limits tab 的 max turns / budget 也都会进入下一次 SDK query options。它们缺少同一提示与重启入口，容易让用户误以为 active persistent query 会立即应用这些设置。

### 实施内容

| 文件 | 变更类型 | 详情 |
|---|---|---|
| `src/features/settings/SettingsClaudeCodeSection.ts` | 设置 UI 修正 | Runtime / Tools / Limits tab 复用现有 runtime boundary notice 和 restart action |
| `tests/unit/features/settings/SettingsClaudeCodeSection.test.ts` | +4 测试 | 覆盖 Runtime / Tools / Limits boundary notice；Runtime restart button 调用 `restartPersistentQueries('settings-change')` |
| `docs/modules/features/settings/SettingsClaudeCodeSection.md` | 文档更新 | 记录 restart-sensitive boundary 已覆盖 Runtime / Context / Tools / Limits |
| `docs/status/claude-code-current-state-2026-05-22.md` | 状态更新 | 记录本轮 settings runtime boundary coverage |

### 验证

- Focused settings test 已完成 red-green：新增断言先失败，修复后 `npm test -- --runInBand tests/unit/features/settings/SettingsClaudeCodeSection.test.ts` 通过，`31` tests passed
- `npm run check:devlog-order`、`npm run check:module-docs`、`npm run graphify:update:src`、`npm run check:graphify` 均通过
- Full gate: `OWNER_GUARD_APPROVED=1 npm run verify` 通过，`435` suites / `3219` tests passed，production build 通过
- Build/deploy: `npm run build` 产出 `BUILD_ID: feature-phase0-capability.202605241052`；已按顺序部署 `dist/main.js`、`dist/manifest.json`、`dist/styles.css`、`dist/assets/`、`dist/node_modules/` 到 Test Vault，并确认 Test Vault `main.js` 含该 BUILD_ID
- Runtime proof: `.obsidian-debug/claude-settings-runtime-boundary-assertion-2026-05-24.json` 通过，截图为 `.obsidian-debug/claude-settings-runtime-boundary-2026-05-24.png`；运行时报告 Runtime / Tools / Limits tabs 均 mounted、包含 boundary notice 和 `重启会话` 按钮、无 translation-key leakage，`dev:errors` 为 `No errors captured.`

### 影响评估

本轮只补 Claude settings 的 runtime-boundary 暴露，不新增 SDK capability、不提升 MCP authoring / skills/plugins authoring / hook authoring / structured-output UI / stable rewind。OpenCode backend 和已有 settings backend enablement 行为不变。

---

## 2026-05-24 Phase 3 - Claude completed-stream local persistence gate

### 目标

继续推进 Claude Code 可用闭环，优先修补已 runtime-proved 的 structured output 链路中仍可能丢失本地 transcript 的基础缺口，不把 structured output authoring 提升为 stable product surface。

### 发现

发送管线的 `buildLocalStreamOutcome()` 只根据 stream 是否正常完成来决定是否进入 authoritative sync。这个规则适合 OpenCode，但 Claude Code 的 authoritative sync 当前明确 gated 为 OpenCode-only，导致正常完成的 Claude stream 有机会跳过本地 assistant persistence，把 streamed text 和 `backend_event structured_output` 交给无效的 OpenCode sync 边界。

### 实施内容

| 文件 | 变更类型 | 详情 |
|---|---|---|
| `src/features/chat/runtime/buildLocalStreamOutcome.ts` | 后端边界修复 | `shouldSyncFromServer` 只对 OpenCode/legacy 会话启用，非 OpenCode completed stream 保持本地持久化路径 |
| `tests/unit/features/chat/buildLocalStreamOutcome.test.ts` | +1 测试 | 覆盖 Claude/non-OpenCode completed stream 不进入 OpenCode sync |
| `tests/unit/features/chat/SendPipelineRuntime.test.ts` | +1 测试 | 覆盖 Claude `structured_output` backend event 经发送管线落到 `ChatMessage.structured` |
| `docs/modules/features/chat/runtime/buildLocalStreamOutcome.md` | 文档更新 | 记录 sync 判定只适用于 OpenCode |
| `docs/modules/features/chat/runtime/SendPipelineRuntime.md` | 文档更新 | 记录非 OpenCode completed stream 的本地 persistence 边界 |
| `docs/status/claude-code-current-state-2026-05-22.md` | 状态更新 | 记录本轮 completed-stream local persistence gate |

### 验证

- Focused tests: `npm test -- --runInBand tests/unit/features/chat/buildLocalStreamOutcome.test.ts tests/unit/features/chat/SendPipelineRuntime.test.ts` 通过，`16` tests passed
- Full gate: `OWNER_GUARD_APPROVED=1 npm run verify` 通过，`435` suites / `3215` tests passed，production build 通过
- Build/deploy: `npm run build` 产出 `BUILD_ID: feature-phase0-capability.202605241038`，已部署到 Test Vault
- Runtime proof: `.obsidian-debug/claude-local-persistence-runtime-assertion-2026-05-24.json` 通过，截图为 `.obsidian-debug/claude-local-persistence-runtime-2026-05-24.png`；运行时报告 active backend `claude-code`、deployed non-OpenCode sync gate present、structured output capture present，`dev:errors` 为 `No errors captured.`

### 影响评估

这次只修补 Claude Code completed stream 的本地 transcript 持久化闭环。OpenCode 正常完成后 authoritative sync 的既有行为保持不变；structured output authoring 仍是 Capability Lab / diagnostic-only，普通聊天 UI 没有新增 schema authoring。

---

## 2026-05-23 Phase 3 - Claude rewind no-data-loss guard

### 目标

继续推进 Phase 3 foundation / productization，但避开已收口的 session/history/shared-session seam。选择 `rewind` 作为窄切方向，只补诊断能力的无数据损失防线，不把 Claude rewind 提升为 stable UI。

### 发现

`ClaudeCodeAdapter.rewindFiles()` 已有 dry-run 诊断入口和测试覆盖，但 adapter 本身没有强制安全默认：

1. 不传 options 会把 `undefined` 直接传给 SDK，未来新调用方可能触发真实 rewind。
2. 空 `userMessageId` 会被透传到 SDK。
3. 显式 `{ dryRun: false }` 没有审计日志。

### 实施内容

| 文件 | 变更类型 | 详情 |
|---|---|---|
| `src/core/agents/backend/ClaudeCodeAdapter.ts` | 安全防护 | `rewindFiles()` 默认强制 `{ dryRun: true }`，拒绝空白 `userMessageId`，并对显式 `dryRun:false` 记录 warn 日志 |
| `tests/unit/core/agents/backend/ClaudeCodeAdapter.test.ts` | +5 测试 | 覆盖默认 dry-run、空 options、显式真实 rewind 日志、空/空白 message id |
| `docs/modules/core/agents/backend/ClaudeCodeAdapter.md` | 文档更新 | 记录 rewind adapter 级无数据损失防护和仍为诊断态的边界 |
| `docs/status/claude-code-current-state-2026-05-22.md` | 状态更新 | 记录本轮 rewind safety guard hardening |

### 验证

- Focused rewind tests: `10` passed
- Module docs check: OK
- 完整验证结果见本轮提交前命令输出

### 影响评估

本轮不提升 Claude rewind 为 stable。它仍是 `wired + runtime-proved + diagnostic-only`：Capability Lab 只保留 dry-run preview，普通聊天 rewind/revert 仍显式 gated 为 OpenCode-only。

---

## 2026-05-23 Phase 3 — Subagent sidecar + JSONL import test hardening

### 目标

在 subagent sidecar / JSONL history import / resume-fork / Claude-native history browsing 里找到仍未完成、能窄切验证的真实缺口。不触碰 session/history/shared-session seam，不重复 rewind/stream normalizer/runtime controls/sessionStore 已收口项。不做 user-facing authoring UI，Agent Definitions 保持 Hidden/Untested。

### 发现

两个 P0 级缺口：

1. **CapLab Subagent Browser UI 零测试覆盖**：`loadSubagents()`、`loadSubagentMessages()`、session 刷新、错误状态等 6 个方法引用完全没有任何 UI 测试。如果 `listSubagents` 或 `getSubagentMessages` 在运行时失败，该功能会以损坏状态呈现且无任何测试警告。
2. **`importSessionToStore` SDK-unavailable 测试缺失**：现有的 SDK-unavailable 测试（line 857）只删除了 3 个方法（`getSessionMessages`、`listSubagents`、`getSubagentMessages`），故意遗漏了 `importSessionToStore`。此外 `listSubagents`/`getSubagentMessages` 的 stale-session 路径和 `importSessionToStore`/`getSessionMessages` 的 SDK 错误传播路径也缺少覆盖。

### 实施内容

| 文件 | 变更类型 | 详情 |
|---|---|---|
| `tests/unit/features/settings/SettingsCapabilityLabSection.test.ts` | +8 测试 | Subagent browser: 会话刷新、子代理列表渲染、空列表处理、列表加载失败、子代理消息加载、消息加载失败、运行时证明 pass/fail |
| `tests/unit/core/agents/backend/ClaudeCodeAdapter.test.ts` | +4 测试 | `importSessionToStore` SDK-unavailable、`listSubagents`/`getSubagentMessages` stale-session guard、`importSessionToStore` SDK 错误传播、`getSessionMessages` SDK 错误传播 |
| `docs/status/claude-code-current-state-2026-05-22.md` | 状态更新 | 记录本轮硬化内容和覆盖矩阵 |
| `docs/modules/features/settings/SettingsCapabilityLabSection.md` | 文档更新 | 记录 subagent browser 测试覆盖 |
| `docs/modules/core/agents/backend/ClaudeCodeAdapter.md` | 文档更新 | 记录 import/subagent 错误路径测试覆盖 |

### 验证

- `npm run verify` 通过：`431` suites / `3104` tests
- Build ID：`feature-phase0-capability.202605231854`
- 净增测试：+12（3092 → 3104）
- 无 `src/` 变更，不需要 `graphify:update:src`

### 影响评估

本轮不提升任何能力到 stable。所有涉及能力保持现有成熟度：

- **Subagent browser**：`wired + runtime-proved`，非 stable。CapLab UI 现有全路径测试覆盖。
- **JSONL import/session store**：`diagnostic store proof only`，非 stable。`importSessionToStore` 现有 SDK-unavailable 和 SDK 错误传播覆盖。
- **Subagent sidecar**：adapter-level `listSubagents`/`getSubagentMessages` 现有 stale-session 和 SDK-error 覆盖。

---

## 2026-05-23 Phase 3 — Stream normalizer lifecycle + adapter runtime control test hardening

### 目标

在 hooks/sessionStore/Claude-native history browsing 边界中找到仍未完成、能窄切验证的真实缺口。不触碰 session/history/shared-session seam，不重复 rewind 测试硬化，不做 user-facing authoring UI，Agent Definitions 保持 Hidden/Untested。

### 发现

三个真实缺口：

1. **Stream normalizer lifecycle 事件覆盖不完整**：`init`、`hook_started`、`hook_progress`、`task_started`、`task_notification`、`task_updated` 六个 SDK 系统事件子类型被正常化器识别并处理，但没有任何单元测试。`redacted_thinking` 和 `server_tool_use` 两个内容块类型同理。
2. **Adapter 运行时控制方法零覆盖**：`setModel()`、`setPermissionMode()`、`reloadMcpServers()` 三个公共方法通过 `applyToActiveQueries()` 扇出到活跃运行时，但完全没有单元测试。
3. **`getSession()` sessionStore 不对称**：`listSessions()`、`getSessionMessages()` 等方法都接受并转发 `sessionStore`，但 `getSession()` 不接受此参数，导致 Capability Lab session detail probe 无法从 diagnostic store 读取会话数据。

### 实施内容

| 文件 | 变更类型 | 详情 |
|---|---|---|
| `src/core/agents/backend/ClaudeCodeAdapter.ts` | 实现修复 | `getSession()` 新增 `options?: { sessionStore?: unknown }` 参数并转发到 SDK |
| `tests/unit/core/agents/backend/ClaudeCodeAdapter.test.ts` | +4 测试 | `setModel`、`setPermissionMode`、`reloadMcpServers`、`getSession` with sessionStore |
| `tests/unit/core/agents/backend/ClaudeCodeStreamNormalizer.test.ts` | +8 测试 | `init`、`hook_started`、`hook_progress`、`task_started`、`task_notification`、`task_updated`、`redacted_thinking`、`server_tool_use` |
| `docs/modules/core/agents/backend/ClaudeCodeAdapter.md` | 文档更新 | 记录 `getSession()` sessionStore 透传 |
| `docs/status/claude-code-current-state-2026-05-22.md` | 状态更新 | 记录本轮硬化内容和覆盖矩阵 |
| `graphify-out/` | 图谱刷新 | `src` 变更后自动刷新 |

### 验证

- `npm run verify` 通过：`431` suites / `3092` tests（+12 tests）
- Build: `BUILD_ID feature-phase0-capability.202605231841`
- Lint: 0 errors / 0 warnings
- 未触及 session/history/shared-session seam
- 未提升任何能力到 stable

### 剩余边界

- 所有 Claude Code diagnostic capability 的 adapter + normalizer 测试现已全覆盖
- 唯一保持 `Hidden/Untested` 的是 Agent Definitions（按设计不测试）
- Stream normalizer 现在对所有已识别的 SDK 事件类型和内容块类型都有显式测试
- 下一步可以转向 deploy-validation round 或 multi-backend abstraction 改善

### 目标

在 hooks/sessionStore/rewind/Claude-native history browsing 中找到测试覆盖最弱的窄切片并加固。不触碰 session/history seam，不提升任何能力到 stable。

### 发现

`ClaudeCodeAdapter.rewindFiles()` 是整个 rewind 能力中测试覆盖为零的最高风险缺口：
- 适配器层：`rewindFiles()` 无直接单元测试（5 个测试场景全部缺失）
- Coordinator 层：`handleRewindRequest` / `handleRestoreRewindRequest` 仅有 2 个 happy-path 测试，11 个错误路径完全未覆盖
- Capability Lab：rewind dry-run 探针仅测试按钮渲染，未测试实际 `adapter.rewindFiles()` 调用

### 实施内容

| 文件 | 新增测试数 | 覆盖 |
|------|-----------|------|
| `tests/unit/core/agents/backend/ClaudeCodeAdapter.test.ts` | 5 | rewindFiles 不可用/正常委托/dryRun选项/错误传播/失效session |
| `tests/unit/features/chat/ConversationLoadRecoveryCoordinator.test.ts` | 11 | handleRewindRequest 7个错误路径 + handleRestoreRewindRequest 4个错误路径 |
| `tests/unit/features/settings/SettingsCapabilityLabSection.test.ts` | 2 | dry-run 成功渲染 + 失败错误提示 |

### 技术要点

- 适配器测试使用 `createAsyncQueue` 创建可控 SDK query mock，在 runtime 存活期间调用 `rewindFiles`
- Coordinator 测试覆盖所有 guard 分支：streaming/无会话/非OpenCode/无sourceMessageId/用户取消/false返回/异常
- CapLab 测试验证 `adapter.rewindFiles(id, msgId, { dryRun: true })` 调用及结果/错误渲染

### 验证

- `npm run verify`: 431 suites / 3080 tests passed (+20 tests)
- Build: `feature-phase0-capability.202605231831`
- 未修改任何产品代码，仅新增测试
- 未提升 rewind 到 stable，生产路径仍 gated 为 OpenCode-only

### 文档更新

- `docs/status/claude-code-current-state-2026-05-22.md`: 新增 Rewind Test Hardening Round 节
- `docs/modules/core/agents/backend/ClaudeCodeAdapter.md`: 更新 rewindFiles 说明
- `docs/modules/features/chat/services/ConversationLoadRecoveryCoordinator.md`: 补充错误路径测试说明
- `docs/modules/features/settings/SettingsCapabilityLabSection.md`: 补充 dry-run probe 测试说明

---

## 2026-05-23 Phase 3 — Shared sessions backend-switch follow-up audit

### Summary

Ran a second audit round after `4f85f022` to confirm whether `SettingsConversationSection` still needed extra backend-switch guards beyond `unshareSession()`. Real-code inspection showed that shared session preview, refresh/count, stale block visibility, and copy-link behavior already have safe degradation or full-section re-render paths, so no additional production changes were justified.

### Findings

- `getBackendSessionPreview()` already degrades to `null` when the active backend loses session-history capability, and the UI shows the existing preview-failed state
- `listBackendSessions()` already degrades to `[]` when the active backend loses session-list capability, and the UI naturally re-renders to `0` + empty state
- Shared-session copy is backend-agnostic local clipboard behavior
- Standard settings backend switches fully re-render the conversation section, removing the sharing block rather than leaving it live

### Verification

- Real-code follow-up audit only; no `src/**` changes were made in this round

---

## 2026-05-23 Phase 3 — Final session/history inspection audit + unshare runtime guard

### Summary

Completed a comprehensive real-code audit of all remaining session detail / history inspection / session list-detail read surfaces to verify the lane is runtime-proof-complete. The audit confirmed all productized backend-aware seams are properly defended, all remaining direct `openCodeService` bindings are in explicitly gated OpenCode-only paths, and no outdated docs claims exist about shared preview consuming OpenCode-shaped payloads.

One defensive hardening was applied: `SettingsConversationSection.ts`'s unshare callback now has an explicit inner runtime guard that blocks the `openCodeService.unshareSession()` call if the active backend has switched away from OpenCode while the settings page is open.

### Changes

- `src/features/settings/SettingsConversationSection.ts`: Added `isOpenCodeActive()` guard inside the unshare callback with user-facing notice when the backend is no longer OpenCode
- `src/i18n/locales/en.ts` / `zh.ts`: Added `settings.conversation.share.sharedSessions.unshareUnavailable` locale string
- `tests/unit/features/settings/SettingsConversationSection.test.ts`: Added `blocks unshare when the active backend is no longer OpenCode` test
- `docs/modules/features/settings/SettingsConversationSection.md`: Updated to document the unshare runtime guard
- `docs/status/claude-code-current-state-2026-05-22.md`: Added "Final Session/History Inspection Audit Round" section with complete findings table and conclusion

### Verification

- `npm run verify` passed: `431` suites / `3061` tests

---

## 2026-05-23 Phase 3 — getBackendSessionPreview OpenCode parts inner null-item guard

### Summary

Fourth-pass runtime-safety audit of the shared backend-aware routing layer found a remaining gap: `getBackendSessionPreview()`'s OpenCode `{info, parts}` normalization path filtered null items at the messages-array level but not inside individual `parts` arrays. If a backend returned `parts: [{type: 'text'}, null, 'string', 123]`, the `.map()` callback would crash on `part.type` when `part` is `null`. The generic / Claude content-block path already handled this correctly.

### Changes

- `src/core/agents/backend/AgentBackendRouting.ts`: Added `.filter((p) => p !== null && typeof p === 'object')` to the `parts` array in the OpenCode normalization branch of `getBackendSessionPreview()`, before the `.map()` that accesses `part.type` and `part.text`
- `tests/unit/core/agents/backend/AgentBackendRouting.test.ts`: Added one test covering null / primitive items inside an OpenCode `parts` array
- `docs/modules/core/agents/backend/AgentBackendRouting.md`: Updated module doc to document the fourth runtime-safety round
- `docs/status/claude-code-current-state-2026-05-22.md`: Added "OpenCode Parts Array Inner Null-Item Runtime Safety Round" section

### Verification

- `npm run verify` passed: `431` suites / `3060` tests
- Build: `feature-phase0-capability.202605231623`
- No new shared `getSession()` consumers added; purely defensive hardening of existing seam

---

## 2026-05-23 Phase 3 — loadBackendSessionMessages non-array guard + runtime safety hardening

### Summary

Runtime-safety audit of backend-aware history normalization found one inconsistency: `loadBackendSessionMessages()` lacked the `Array.isArray` guard that both `listBackendSessions()` and `getBackendSessionPreview()` already had. Added the guard and two unit tests (OpenCode + Claude Code non-array returns).

### Changes

- `src/core/agents/backend/AgentBackendRouting.ts`: Added `Array.isArray(rawMessages)` guard after `getSessionMessages()` in `loadBackendSessionMessages()`, returning `[]` for non-array responses
- `tests/unit/core/agents/backend/AgentBackendRouting.test.ts`: Added two tests covering non-array `getSessionMessages` returns for both OpenCode and Claude Code backends
- `docs/modules/core/agents/backend/AgentBackendRouting.md`: Updated module doc to mention `loadBackendSessionMessages` and the non-array guard

### Verification

- `npm run verify` passed: `431` suites / `3051` tests
- Build: `feature-phase0-capability.202605231550`
- No new shared `getSession()` consumers added; purely defensive hardening of existing seam

## 2026-05-23 Phase 3 — Capability Lab audit + Backend Routing Probe registry verification

### Summary

Completed a focused audit of remaining session detail / history inspection / preview surfaces, especially in `SettingsCapabilityLabSection`. No new OpenCode-shaped payload assumptions were found in diagnostic or product surfaces. Enhanced the Backend Routing Probe to also verify the registry routing layer (`listBackendSessions()` + `getBackendSessionPreview()`), ensuring the productized narrow seams are exercised in diagnostic context.

### Audit Findings

**Capability Lab probes**: All 8 probes (History Browser, Subagent Browser, Session Detail, Backend Routing, Fork, Resume, Structured Output, Hook Proof) are provider-owned diagnostic and do NOT assume OpenCode-shaped payloads. They use adapter-specific methods directly.

**Remaining OpenCode-shaped payload assumptions**: All remaining `.info`/`.parts` accesses outside `core/opencode/` are in explicitly gated OpenCode-only paths:
- `ConversationAuthoritativeSyncCoordinator` — gated by `conversation.backend !== 'opencode'`
- `ConversationAuthoritativeReloadCoordinator` — OpenCode-only by design
- `ConversationRenderService` — gated by `backend !== 'opencode'`

**No new shared read seams promoted**: All remaining session reads (children, canonical state, diff, revert state, todos, event subscriptions) are OpenCode-specific and lack narrow, verifiable cross-backend semantics.

### Enhancement: Backend Routing Probe registry layer verification

The probe now exercises three paths:
1. **Provider-owned adapter path**: `adapter.listSessions()` + `adapter.getSession()`
2. **Registry routing layer (productized seams)**: `listBackendSessions()` + `getBackendSessionPreview()`
3. **Narrow read seams**: `readBackendSessionTitle()` + `readBackendSessionShareUrl()` through registry with mock conversation

This verifies that the backend-aware routing infrastructure works end-to-end, not just the adapter implementation.

### Files changed

- `src/features/settings/SettingsCapabilityLabSection.ts` — added registry routing imports (`listBackendSessions`, `getBackendSessionPreview`, `readBackendSessionTitle`, `readBackendSessionShareUrl`); `runBackendRoutingProbe` now tests all productized narrow seams
- `tests/unit/features/settings/SettingsCapabilityLabSection.test.ts` — added test for registry routing layer including narrow read seams; updated `createMockPlugin` to return adapter from `getActive()` for registry routing
- `docs/status/claude-code-current-state-2026-05-22.md` — updated snapshot commit, added Capability Lab audit section, added remaining OpenCode-shaped payload assumptions table, updated Backend Routing Probe description
- `docs/modules/features/settings/SettingsCapabilityLabSection.md` — documented registry routing layer verification in Backend Routing Probe

### Verification

- `npm test -- --testPathPatterns="SettingsCapabilityLabSection"` — 45 passed
- `npm test -- --testPathPatterns="AgentBackendRouting"` — 46 passed
- `OWNER_GUARD_APPROVED=1 npm run verify` — all green
- `npm run graphify:update:src` — graph refreshed

## 2026-05-23 Phase 3 — Efficient adapter getSession + session-read fallback cleanup

### Summary

Continued Phase 3 backend-aware session read routing by fixing the `OpenCodeAdapter.getSession()` O(n) workaround and removing the last direct `openCodeService.listSessions()` fallback in `ConversationSessionSettingsCoordinator`.

### Fix: OpenCodeAdapter.getSession() efficient path

`OpenCodeAdapter.getSession()` was using `listSessions()` + `.find()`, an O(n) scan over all sessions. The efficient single-session SDK `session.get()` path already existed on `OpenCodeSessionLifecycleCoordinator.getSessionInfo()` but was not exposed as a public method on `OpenCodeService`.

Exposed `getSessionInfo(sessionId)` as a public method on `OpenCodeService` and updated the adapter to use it directly. The adapter still returns `unknown | null` — no new cross-backend session-detail contract is created.

### Cleanup: ConversationSessionSettingsCoordinator listSessions fallback

The coordinator's `getCurrentShareUrl()` had a fallback chain: registry → `host.listSessions` → `openCodeService.listSessions()`. The last hop was the only remaining direct `openCodeService` binding for session list reads in the settings coordinator.

Removed the `openCodeService.listSessions()` fallback. When no registry and no `host.listSessions` is provided, the coordinator now returns `null` (no share URL) instead of reaching through to openCodeService. The `resolveOpenCodeService()` method now only provides `shareSession`/`unshareSession` (OpenCode-only writes), not `listSessions`.

### Files changed

- `src/core/opencode/OpenCodeService.ts` — added public `getSessionInfo(sessionId)` method
- `src/core/agents/backend/OpenCodeAdapter.ts` — `getSession()` now uses `service.getSessionInfo()` instead of `listSessions().find()`
- `src/features/chat/services/ConversationSessionSettingsCoordinator.ts` — removed `openCodeService.listSessions` fallback from `getCurrentShareUrl()`; removed `listSessions` from `resolveOpenCodeService()` and `resolveOpenCodianPlugin()` return types
- `tests/unit/core/agents/backend/OpenCodeAdapter.test.ts` — updated mock with `getSessionInfo`; test now verifies `listSessions` called once + `getSessionInfo` called per `getSession` invocation
- `tests/unit/features/chat/ConversationSessionSettingsCoordinator.shareUrlRouting.test.ts` — added test for no-registry-no-listSessions → returns null behavior
- `docs/modules/core/opencode/OpenCodeService.md` — documented `getSessionInfo()` public delegation
- `docs/modules/core/agents/backend/OpenCodeAdapter.md` — documented efficient `getSession` path
- `docs/modules/features/chat/services/ConversationSessionSettingsCoordinator.md` — updated fallback documentation
- `docs/status/claude-code-current-state-2026-05-22.md` — updated anchor commit + session-read audit entries

### Verification

- 3035 tests pass (431 suites)
- `npm run verify` green (lint, typecheck, test, build, module-docs, graphify)
- Owner-guard note: OpenCodeService change is a one-line delegation to existing lifecycle coordinator; no new behavior

## 2026-05-23 Phase 3 — SessionTodoCoordinator backend gates + Backend Routing diagnostic probe

### Summary

Continued Phase 3 backend-aware session read routing by closing the last two ungated production paths and adding a new provider-owned diagnostic probe to the Capability Lab.

### Production fix: SessionTodoCoordinator backend gates

`SessionTodoCoordinator.refreshTabSessionTodos()` and `refreshTabSessionStatus()` were the last two production code paths that called `openCodeService.getSessionTodos()` / `openCodeService.getSessionStatuses()` without an explicit `backend !== 'opencode'` guard. For non-OpenCode sessions, these would silently attempt OpenCode-only API calls.

Added explicit backend gates to both methods: they now check `conversation.backend ?? 'opencode'` via the existing `getConversationForTab()` host method and return early (empty todos / null status) for non-OpenCode sessions, matching the gating pattern used by `ConversationAuthoritativeReloadCoordinator`, `ConversationNoticeCoordinator`, `ChildSessionGraphCoordinator`, and others.

### Diagnostic probe: Backend Routing Verification

Added a new "Backend Routing" diagnostic probe (block ID `backend-routing`) to `SettingsCapabilityLabSection`:
- Matrix row #16: "Backend Routing" — SDK Exposed ✓, Adapter Wired ✓, Runtime Proof: untested → pass/fail via probe
- Shows active backend type, registered adapters, and conversation backend distribution (OpenCode vs other)
- When Claude Code adapter is available, provides a "Run Backend Routing Probe" button that exercises `listSessions()` + `getSession()` through the provider-owned adapter path
- When only OpenCode is available, shows informational status about the routing infrastructure

### Files changed

- `src/features/chat/services/SessionTodoCoordinator.ts` — backend gates on `refreshTabSessionTodos()` and `refreshTabSessionStatus()`
- `src/features/settings/SettingsCapabilityLabSection.ts` — Backend Routing matrix row + render/run probe methods
- `src/i18n/locales/en.ts` — `settings.capabilityLab.backendRouting.*` keys
- `src/i18n/locales/zh.ts` — `settings.capabilityLab.backendRouting.*` keys
- `tests/unit/features/chat/SessionTodoCoordinator.test.ts` — 5 new backend gate tests
- `tests/unit/features/settings/SettingsCapabilityLabSection.test.ts` — matrix count 15→16, block count 9→10, 3 new backend routing tests
- `docs/modules/features/chat/services/SessionTodoCoordinator.md` — backend gate documentation
- `docs/modules/features/settings/SettingsCapabilityLabSection.md` — new probe documentation
- `docs/modules/i18n/locales/en.md` + `zh.md` — i18n change log
- `docs/status/claude-code-current-state-2026-05-22.md` — session todo gate + backend routing probe entries
- `graphify-out/` — refreshed

### Verification

- 3029 tests pass (431 suites)
- `npm run verify` green (lint, typecheck, test, build, module-docs, graphify)
- Test Vault deployed with BUILD_ID `feature-phase0-capability.202605231236`
- Runtime: plugin reload clean, no errors, backend-routing block renders correctly with Active backend: opencode, Registered adapters: opencode/claude-code, 208 conversations (186 OpenCode, 22 other)

## 2026-05-20 Phase 0 capability finish

- Completed the Phase 0/1 chat capability finish for backend-aware UX without moving new runtime ownership back into `main.ts`.
- Split no-enabled-backend vs backend-offline chat states so the composer, empty notices, and status surfaces explain why sending is unavailable instead of leaving a blank input area.
- Tightened Phase 0 backend exposure to implemented backends only, keeping fresh installs on `opencode` by default and filtering unsupported persisted backend ids during settings load.
- Hardened send/session preflight so unavailable backends are checked before optimistic conversation bootstrap, preventing offline or disabled first-send flows from creating orphan OpenCode sessions.
- Reduced offline runtime noise by routing background and signal server fallbacks through suppressed verbose logging, and added regression coverage for canonical fallback, composer availability, settings normalization, and backend settings filtering.

## 2026-04-25 Lane a3-formatter-settings — F2 Formatter top-level settings UI

Added the top-level Formatter settings page with two secondary views (overview, config).

### Files created

- `src/features/settings/SettingsFormatterSection.ts` — section owner for formatter settings; renders overview (runtime status, summary cards, detected formatter table) and config (mode switch dropdown) in both classic and tabbed layouts
- `tests/unit/features/settings/SettingsFormatterSection.test.ts` — 10 tests covering attach/attachTabbed render state, mode-switch behavior (default/disabled/custom), config manager unavailability, and display refresh
- `docs/modules/features/settings/SettingsFormatterSection.md` — module doc for the new section

### Files modified

- `src/features/settings/settingsLayoutRegistry.ts` — added `formatter` primary tab with `overview`/`config` secondary tabs
- `src/features/settings/SettingsTabbedRenderer.ts` — imported and wired `SettingsFormatterSection`, added `formatter` render case and `shouldUsePanelShell` exclusion
- `src/features/settings/OpenCodianSettings.ts` — imported `SettingsFormatterSection`, added `addFormatterSettings()` classic method, wired dispose and `formatterSection` field
- `src/i18n/locales/en.ts` — added `settings.formatter.*` and `settings.quickNav.formatterDesc` i18n keys
- `src/i18n/locales/zh.ts` — added corresponding Chinese translations
- `tests/unit/features/settings/settingsLayoutRegistry.test.ts` — updated expected primary tab list to include `formatter`
- `tests/unit/features/settings/OpenCodianSettings.test.ts` — stubbed `addFormatterSettings` in two tests
- Updated 5 module docs to reflect the formatter addition

### Verification

- `npm run verify` green: lint (0 new errors), typecheck, 1647 tests passing, production build successful

---

## 2026-04-23 Project-scoped compaction config alignment — Round 3 review fixes

- Fixed all trailing whitespace; `git diff --check` now clean.
- Added 3 ownership facts + `session.summarize()` note to every touched module doc (8 files).
- Rewrote `SettingsConversationSection.md` to reflect project-scoped compaction ownership; removed stale global session default writeback for compaction.
- Removed stale `refreshCurrentSessionState()` from `ConversationSessionSettingsCoordinator.md` host interface.
- Updated debug handoff doc: archived `applyCompactionConfig()` investigation paths, pointed to new `OpencodeConfigManager.updateCompactionConfig()` + `reapplyCompactionConfigFromProjectConfig()` chain.
- Added real `Notice` mock/assertions to all compaction test branches (applied, deferred, error, config-unavailable).
- Fixed `Number.parseInt()` truncation: replaced with `Number()` + `Number.isInteger()` via `parsePositiveInteger()` helper.
- Refactored compaction save from per-field `saveProjectCompactionField()` to single full-object `saveProjectCompactionConfig()` that writes the entire compaction state at once.
- Updated `OpencodeConfigManager.md` with ownership facts.
- Removed stale `.codex-review-round1.txt` artifact.

---

## 2026-04-23 Project-scoped compaction config alignment — Round 2 review fixes

- Fixed stale module docs: removed `applyCompactionConfig()` references from `ConversationSessionSettingsModal.md`, `ConversationSessionSettingsCoordinator.md`, `OpenCodianView.md`, and `OpenCodeService.md`.
- Fixed stale status doc: updated `opencode-auto-compaction-adaptation-report-2026-04-22.md` to reflect current project-scoped implementation.
- Fixed BEL control characters (`\u0007`) corrupting `autoCompactionEnabled` and `applyCompactionConfig` in `OpenCodianView.md` and `en.md`.
- Removed dead locale keys (`settings.conversation.autoCompactionEnabled.*`, `settings.conversation.compactionReservedTokens.*`) from `en.ts` and `zh.ts`.
- Added `settings.conversation.compaction.configUnavailable` locale key for surfacing config manager unavailability.
- Fixed silent no-op in `SettingsConversationSection.saveProjectCompactionField()` when config manager is unavailable; now shows a notice.
- Removed stale `applyCompactionConfig` mock from `persistedTabRestore.test.ts`.
- Added test coverage for `prune`, `tail_turns`, `preserve_recent_tokens`, `reserved`, deferred status, save failure, and config-unavailable branches in `SettingsConversationSection`.
- Added `tail_turns` and `preserve_recent_tokens` round-trip test in `OpencodeConfigManager`.

---

## 2026-04-23 Project-scoped compaction config alignment

- Removed invalid per-conversation compaction overrides from `ConversationSessionSettings` and persisted conversation state.
- Moved compaction editing to project `.opencode/opencode.json` in the settings UI, covering all upstream fields (`auto`, `prune`, `tail_turns`, `preserve_recent_tokens`, `reserved`).
- Replaced per-session compaction runtime apply with project-scoped instance reload after config save.
- Deleted `OpenCodeService.applyCompactionConfig()` and its dead private helpers; `reapplyCompactionConfigFromProjectConfig()` is now the sole public API.
- Simplified `ConversationSessionSettingsCoordinator` to display-only (visual state) and `ConversationSessionSettingsModal` to font-size override only.
- Removed `autoCompactionEnabled` / `compactionReservedTokens` from `OpenCodianSettings` and its load normalization.

---

## 2026-04-21 模块文档硬约束接入 verify，并补齐缺失模块文档

### 🎯 改动目标

- 把现有 `docs/modules/` 机制从“约定”升级为本地 / 分支都能执行的硬校验
- 保证源码模块新增、修改、删除、重命名时，对应模块文档必须同步，否则校验不通过
- 将规则落到 repo 内脚本、配置和文档，而不是依赖后续模型记忆

### ✅ 本轮调整

- `module-docs.config.json`
  - 新增模块文档映射配置，声明 TypeScript 与样式模块的 source-root → docs-root 规则
  - 为 `src/main.ts` 配置特殊入口映射，并把 `docs/modules/_WORKFLOW.md`、`docs/modules/infrastructure/**` 等非源码文档显式列为例外

- `scripts/module-doc-guard-lib.mjs`
- `scripts/check-module-doc-coverage.mjs`
- `scripts/check-module-doc-diff.mjs`
- `scripts/list-module-doc-targets-from-diff.mjs`
  - 新增覆盖检查、diff 责任检查和 diff 文档目标列举三类脚本
  - 本地 `verify` 走 `--range HEAD`，保证未提交源码改动如果没同步文档会立即失败

- `package.json`
- `AGENTS.md`
- `docs/modules/README.md`
- `docs/modules/_WORKFLOW.md`
- `docs/modules/infrastructure/scripts.md`
- `docs/status/development-maintainability-rules.md`
  - 将 `npm run check:module-docs` 纳入标准验证与协作说明
  - 明确区分本地 `HEAD` 自检与分支 / CI 的 `origin/main...HEAD` 检查方式

- 新补 9 篇缺失模块文档：
  - `docs/modules/core/config/commandScopedAgent.md`
  - `docs/modules/features/settings/modelConfigWorkspace.md`
  - `docs/modules/features/settings/modelPicker.md`
  - `docs/modules/features/settings/providerPresets.md`
  - `docs/modules/features/settings/searchInputEnhancer.md`
  - `docs/modules/types/jsx-shim.md`
  - `docs/modules/utils/icons/builtinIconRegistry.md`
  - `docs/modules/utils/icons/lobehubIconManifest.md`
  - `docs/modules/utils/streaming/mcpSummaryConfig.md`

### 🧪 验证结果

- `node --check scripts/module-doc-guard-lib.mjs` 通过
- `node --check scripts/check-module-doc-coverage.mjs` 通过
- `node --check scripts/check-module-doc-diff.mjs` 通过
- `node --check scripts/list-module-doc-targets-from-diff.mjs` 通过
- `npm run check:module-docs` 通过
- `npm run check:devlog-order` 通过
- `npm run verify` 通过（含 lint / typecheck / 297 套测试 / build）

## 2026-04-20 斜杠命令运行时对齐、即时缓存失效与文档同步

### 🎯 改动目标

- 让 OpenCodian 的 slash 一级菜单尽量和当前 OpenCode runtime 保持一致，不再被本地 120 秒目录缓存拖慢刷新
- 修复本地 sidecar 对插件 / skill 运行时环境开关的继承行为，让默认模式更贴近官方 TUI / Desktop
- 同步模块文档与 `AGENTS.md`，把 slash catalog 缓存的真实行为记录清楚

### ✅ 本轮调整

- `src/core/opencode/ServerManager.ts`
  - 默认模式不再主动清掉用户显式设置的 `OPENCODE_DISABLE_*` / `OPENCODE_PURE` 等插件与 skill 运行时开关
  - 补充启动日志，明确记录这些关键 env flag 的实际生效值

- `src/main.ts`
  - `saveSettings()` 完成后会广播 slash command catalog 失效
  - OpenCode server status 重新进入 `running` 时，也会广播失效，并请求 view 侧做一次后台 warm preload

- `src/features/chat/OpenCodianView.ts`
  - 新增公开入口 `invalidateSlashCommandMenuCatalog()`，统一处理 preload timer 清理、catalog 失效和可选预热

- `tests/unit/core/opencode/ServerManager.lifecycle.test.ts`
- `tests/unit/main.test.ts`
  - 补回归测试，覆盖 runtime env 继承、设置保存后的 slash catalog 失效，以及 server 恢复 `running` 后的自动预热

- `docs/modules/core/opencode/ServerManager.md`
- `docs/modules/entry-point/main.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/services/SlashCommandMenuCatalogCache.md`
- `AGENTS.md`
  - 同步 slash command runtime 对齐、缓存 TTL/失效规则，以及 future work 该优先走 invalidate seam 而不是等 TTL 自然过期

### 🧪 验证结果

- `npm run test -- ServerManager.lifecycle.test.ts` 通过
- `npm run test -- main.test.ts` 通过
- `npm run verify` 通过
- 已部署到 Test Vault，并校验 `BUILD_ID = feature-slash-command-improvements.202604202345`

## 2026-04-11 可维护性第七阶段发送子系统 ownership 拆分与第八阶段交接

### 🎯 改动目标

- 沿着第六阶段已经建立的 preparation / finalization service 边界，继续把 `src/features/chat/OpenCodianView.ts` 从“超级控制器”推进到更薄的装配层
- 不再只抽 `sendMessage()` 的一个更小 helper，而是完整搬走发送子系统 ownership
- 同步沉淀第七阶段总结文档，并在文档后半段明确第八阶段的工作方向与实施顺序

### ✅ 本轮调整

- `src/features/chat/runtime/SendPipelineRuntime.ts`
- `src/features/chat/runtime/StreamChunkRouter.ts`
- `src/features/chat/runtime/StreamLocalFinalizer.ts`
- `src/features/chat/runtime/SendPipelineTypes.ts`
- `src/features/chat/runtime/sendPipelineContent.ts`
- `src/features/chat/runtime/PendingIndicatorController.ts`
- `src/features/chat/runtime/SendPipelineTrace.ts`
- `src/features/chat/runtime/buildLocalStreamOutcome.ts`
- `src/features/chat/runtime/StreamShellFinalizer.ts`
- `src/features/chat/runtime/LocalStreamMessagePersistence.ts`
- `src/features/chat/OpenCodianView.ts`
  - 新增发送子系统 runtime 子目录，正式把发送链路 ownership 从 `OpenCodianView.sendMessage()` 搬到 `SendPipelineRuntime`
  - `OpenCodianView.sendMessage()` 现已退化成 runtime bridge，view 主要保留 host 装配和仍然与 UI 紧耦合的能力暴露
  - runtime 内部继续细拆成 chunk router、local finalizer、pending indicator、trace、content helper、outcome builder、shell finalizer、message persistence 等更小模块，避免 runtime 自己变成第二个巨型类

- `tests/unit/features/chat/SendPipelineRuntime.test.ts`
- `tests/unit/features/chat/sendPipelineContent.test.ts`
- `tests/unit/features/chat/buildLocalStreamOutcome.test.ts`
  - 新增发送 runtime 与纯 helper 单测，覆盖 preparation 中止、assistant 本地持久化顺序、error-only notice、content 映射与 local outcome 推导

- `docs/modules/features/chat/runtime/*.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/README.md`
- `docs/status/maintainability-phase-7.md`
- `docs/README.md`
  - 补齐发送 runtime 子目录文档
  - 新增第七阶段总结与第八阶段实施说明文档
  - 在 docs 入口中补充最新阶段文档示例

### 🧪 验证结果

- `npm run lint` 通过（保留仓库既有 warning baseline）
- `npm run typecheck` 通过
- `npm run test` 通过（78 个 test suites，611 个 tests）
- `npm run build` 通过
- 已部署到 Test Vault，并校验 `BUILD_ID = main.202604111609`

## 2026-04-11 可维护性第三阶段 model selector 拆分与第四阶段交接

### 🎯 改动目标

- 继续沿着第一、第二阶段已建立的 helper / service / 测试边界，逐步拆分 `src/features/chat/OpenCodianView.ts`
- 优先处理第三阶段里边界最清晰、风险最低的 model selector UI 逻辑
- 产出可直接带到新会话的第三阶段总结文档，并在文末给出第四阶段实施方案和提示词

### ✅ 本轮调整

- `src/features/chat/ui/modelSelector/types.ts`
- `src/features/chat/ui/modelSelector/ModelSelectorRenderer.ts`
- `src/features/chat/ui/modelSelector/ModelSelectorInteractions.ts`
- `src/features/chat/ui/modelSelector/ModelSelectorDisplay.ts`
- `src/features/chat/OpenCodianView.ts`
  - 新增 model selector 子模块，分别承接共享类型、列表渲染、键盘/高亮交互和 trigger display state 推导
  - `OpenCodianView` 中的 `renderModelList()`、`navigateModelList()`、`highlightModelOption()`、`selectHighlightedModel()`、`scrollToCurrentModel()`、`updateModelSelectorDisplay()` 已收薄为装配/包装入口
  - 继续把 catalog loading、provider icon 异步解析、tab model override 与 context usage identity 刷新保留在 view 内，避免为了“多挪几行”而制造第二个巨型模块

- `tests/unit/features/chat/modelSelectorRenderer.test.ts`
- `tests/unit/features/chat/modelSelectorInteractions.test.ts`
- `tests/unit/features/chat/modelSelectorDisplay.test.ts`
  - 新增 model selector 单测，覆盖 loading / empty state、provider 分组渲染、sticky-header cleanup 重绑、键盘高亮、选中当前高亮项、滚动当前模型到可见区域，以及 trigger display state 推导

- `docs/status/maintainability-phase-3.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/ui/modelSelector/*.md`
- `docs/modules/README.md`
- `docs/README.md`
  - 新增第三阶段总结与第四阶段实施说明文档
  - 同步更新 `OpenCodianView` 模块文档和 model selector 子模块文档
  - 在 docs 入口中补充最新阶段文档示例

### 🧪 验证结果

- `npm run lint` 通过（保留仓库既有 warning 基线）
- `npm run typecheck` 通过
- `npm run test` 通过（72 个 test suites，577 个 tests）
- `npm run build` 通过
- 已部署到 Test Vault，并校验 `BUILD_ID = main.202604111323`

## 2026-04-11 可维护性第二阶段装载编排提取与第三阶段交接

### 🎯 改动目标

- 沿着第一阶段已建立的 helper / 测试边界，继续拆分 `src/features/chat/OpenCodianView.ts`
- 优先抽出 tab / conversation 装载编排，不触碰 model selector 和消息区重渲的大块逻辑
- 为下一会话准备第三阶段交接文档和可直接复制的启动提示词

### ✅ 本轮调整

- `src/features/chat/services/ConversationViewStateService.ts`
- `src/features/chat/OpenCodianView.ts`
  - 新增 `ConversationViewStateService`，承接 `initializeFirstTab()`、`restorePersistedTabs()`、`activateTab()`、`loadConversation()` 的装载编排
  - `OpenCodianView` 通过 host 回调向 service 暴露 tab / conversation / hydration / render / session refresh 能力
  - 保留 view 内与 UI 紧耦合的 streaming tab 激活、空 tab 激活、切换前清理 helper，避免把 service 做成第二个巨型类
  - conversation 装载链路继续复用 `ScrollManager`，不回退滚动恢复语义

- `tests/unit/features/chat/ConversationViewStateService.test.ts`
- `tests/unit/features/chat/persistedTabRestore.test.ts`
  - 新增 service 单测，覆盖 streaming tab 快路径、普通 tab preserve-scroll 装载、空 tab 分支，以及 hydration + scroll restore
  - 扩展 persisted tab restore 测试，补上无 persisted tabs 时复用首个 conversation / 创建新 conversation 的路径

- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/chat/services/ConversationViewStateService.md`
- `docs/status/maintainability-phase-2.md`
  - 更新 `OpenCodianView` 模块文档，说明 tab / conversation 装载编排已迁出
  - 新增 `ConversationViewStateService` 模块文档
  - 新增第二阶段总结与第三阶段实施说明，并在文末附上可直接复制的新会话提示词

### 🧪 验证结果

- `npm run lint` 通过
- `npm run typecheck` 通过
- `npm run test` 通过（69 个 test suites，566 个 tests）
- `npm run build` 通过
- 已部署到 Test Vault，并校验 `BUILD_ID = main.202604111257`

## 2026-04-11 可维护性第一阶段护栏与第二阶段交接

### 🎯 改动目标

- 落地“低风险首批”可维护性改进：先补工程护栏、测试保护和小范围 `OpenCodianView` 抽取，不做一次性重写
- 为后续大模型会话准备清晰交接文档和可直接复制的第二阶段启动提示词
- 把第一阶段成果纳入 CI / 文档 / AGENTS 快速上下文，方便后续继续拆分

### ✅ 本轮调整

- `.eslintrc.cjs`
- `.github/workflows/ci.yml`
  - 新增 warning 级维护性规则：复杂度、函数行数、文件行数、参数数量和 `no-explicit-any`
  - 对生成的 LobeHub manifest 和 JSX namespace shim 做定点豁免
  - 新增 GitHub Actions CI，顺序运行 `npm ci`、lint、typecheck、test、build，并检查 `styles.css` 是否与源样式同步

- `src/features/chat/services/ScrollManager.ts`
- `src/features/chat/ui/modelSelectorStickyHeaders.ts`
- `src/features/chat/OpenCodianView.ts`
  - 将消息区底部检测、滚动快照、重渲后恢复和程序化滚底提取为可单测 helper
  - 将 model selector sticky header 监听改为独立 helper + view 持有 cleanup disposer
  - 移除 `_stuckHandler` DOM 私有属性方案，避免后续继续扩散 view-local 状态

- `tests/unit/core/security/BlocklistChecker.test.ts`
- `tests/unit/features/chat/ScrollManager.test.ts`
- `tests/unit/features/chat/modelSelectorStickyHeaders.test.ts`
- `tests/unit/features/chat/persistedTabRestore.test.ts`
- `tests/unit/features/settings/ModelConfigModal.test.ts`
- `tests/setup.ts`
  - 补充 blocklist、滚动恢复、sticky header、persisted tab restore 和 `ModelConfigModal` 的关键单测
  - 补齐测试环境里的 Obsidian DOM 扩展 shim：`hasClass` / `appendText`

- `docs/status/maintainability-phase-1.md`
- `docs/README.md`
- `AGENTS.md`
- `docs/modules/**`
  - 新增第一阶段总结和第二阶段实施方向文档
  - 将可直接复制给新会话大模型的第二阶段启动提示词收敛到阶段文档内
  - 在 AGENTS 文档中补充最新 chat helper 边界
  - 同步更新 `OpenCodianView`、`ModelConfigModal`、`BlocklistChecker`、构建管线及新增 helper 的模块文档

### 🧪 验证结果

- `npm run lint` 通过（维护性规则目前以 warning 暴露既有债务）
- `npm run typecheck` 通过
- `npm run test` 通过（68 个 test suites，560 个 tests）
- `npm run build` 通过，最新 `BUILD_ID: main.202604111230`
- 已按顺序复制 `dist/main.js`、`dist/manifest.json`、`dist/styles.css` 到 Test Vault
- 已确认 Test Vault `main.js` 含最新 `BUILD_ID: main.202604111230`
- `npm run check:devlog-order` 将在本次日志更新后执行

## 2026-04-11 SDK facade、工具身份与 MCP 摘要规则整理

### 🎯 改动目标

- 为 OpenCode SDK v2 增加更稳定的 façade 层与能力快照，减少服务层到处手写 namespace 访问、响应解包与错误归一化
- 统一 builtin / MCP / custom 工具身份识别，把工具 `kind`、图标与摘要规则贯通到消息恢复、流式渲染和设置/目录相关 UI
- 修复 MCP 工具图标显示过小的问题，并把 MCP 摘要升级为“工具名动作语义优先 + 顶层输入字段回退”的可维护规则

### ✅ 本轮调整

- `src/core/opencode/OpenCodeSdkFacade.ts`
- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/types.ts`
- `src/core/opencode/index.ts`
  - 新增 SDK façade，统一 namespace 调用、`data` 解包与错误归一化
  - `OpenCodeService` 增加 tool catalog / MCP 状态快照、事件订阅与运行时工具观察
  - 流式 `tool_use` 与历史消息恢复会保留结构化 `toolKind`

- `src/shared/toolIdentity.ts`
- `src/shared/index.ts`
- `src/core/types/chat.ts`
- `src/core/types/tools.ts`
  - 新增统一工具身份层，归一化 builtin / MCP / custom / task / question / skill / plan
  - builtin 编辑类工具图标改为 `file-pen`
  - MCP 工具图标统一使用 `opencodian-tool-mcp`

- `src/utils/streaming/ToolCallRenderer.ts`
- `src/utils/streaming/mcpSummaryConfig.ts`
- `src/utils/streaming/types.ts`
- `src/utils/streaming/index.ts`
- `src/utils/streaming/StreamController.ts`
- `src/features/chat/OpenCodianView.ts`
  - `ToolCallRenderer` 头部摘要支持基于 `toolKind` 分流
  - MCP 图标改为适配 Obsidian 100×100 自定义图标视口的 LobeHub MCP SVG
  - MCP 摘要改为“动作词优先 + 类别字段优先级 + 通用字段回退 + 首个顶层短标量回退”
  - 新增 `mcpSummaryConfig` 作为独立配置模块，方便后续维护动作词和字段表

- `src/features/settings/ModelConfigModal.ts`
- `src/features/settings/OpenCodianSettings.ts`
- `src/features/chat/ui/EffortSelector.ts`
- `src/style/components/model-selector.css`
  - 补充模型配置弹窗初始视图类型
  - 修正 catalog provider toggle 的可用性判断
  - 调整 effort selector tooltip 向左展开，并补齐对应样式

- `tests/unit/core/opencode/OpenCodeSdkFacade.test.ts`
- `tests/unit/core/opencode/OpenCodeService.sdkCompat.test.ts`
- `tests/unit/core/opencode/OpenCodeService.test.ts`
- `tests/unit/shared/toolIdentity.test.ts`
- `tests/unit/utils/streaming/ToolCallRenderer.test.ts`
  - 覆盖 SDK façade、工具身份、MCP 图标、MCP 语义摘要与流式兼容行为

- `docs/modules/**`
  - 新增 `OpenCodeSdkFacade`、`toolIdentity`、`mcp-summary-fields` 模块文档
  - 同步更新 `OpenCodeService`、streaming、shared index、chat types 与模块索引页

### 🧪 验证结果

- `npm test -- tests/unit/utils/streaming/ToolCallRenderer.test.ts` 通过
- `npm run build` 通过，最新 `BUILD_ID: main.202604111153`
- 已按顺序复制 `dist/main.js`、`dist/manifest.json`、`dist/styles.css` 到 Test Vault
- 已确认 Test Vault `main.js` 含最新 `BUILD_ID: main.202604111153`
- `npm run check:devlog-order` 将在本次日志更新后执行

## 2026-04-11 上下文使用详情补充原始消息区

### 🎯 改动目标

- 参考 OpenCode 桌面端，在“上下文使用详情”弹窗中补充可展开的原始消息列表
- 保留现有 Token 统计、context ring 与上下文拆分逻辑，避免把原始消息塞进 tab usage state
- 澄清拆分图文案：仅拆分图按字符近似分摊，上方 Token 统计优先使用 OpenCode 返回的 usage

### ✅ 本轮调整

- `src/features/chat/ui/ContextDetailModal.ts`
- `src/features/chat/OpenCodianView.ts`
  - 新增 `ContextRawMessageItem` view-model 与可选 `rawMessageLoader`
  - 打开详情弹窗时通过当前 `openCodeSessionId` 懒加载 `getSessionMessages()`
  - 原始消息按 `{ message, parts }` 格式化 JSON 展示，默认折叠，并支持 loading / empty / error 状态
  - 弹窗关闭后忽略迟到的异步加载结果，避免销毁后 DOM 回写

- `src/style/modals/config-editor-modal.css`
- `styles.css`
  - 增加原始消息区、折叠项与代码块样式，保持和现有 context modal 卡片风格一致

- `src/i18n/locales/zh.ts`
- `src/i18n/locales/en.ts`
  - 新增 `context.rawMessages.*` 文案
  - 更新 `context.breakdown.note`，明确“仅下方拆分图”使用字符近似分摊

- `docs/modules/features/chat/ui/ContextDetailModal.md`
  - 同步记录新的懒加载参数、原始消息区渲染行为与异步状态

### 🧪 验证结果

- `npm run build` 通过，最新 `BUILD_ID: main.202604110850`
- 已按顺序复制 `dist/main.js`、`dist/manifest.json`、`dist/styles.css` 到 Test Vault
- 已确认 Test Vault `main.js` 含最新 `BUILD_ID: main.202604110850`
- `npm run check:devlog-order` 将在本次日志更新后执行

## 2026-04-11 Provider 图标资源改为 manifest 驱动并补齐 variant 选择

### 🎯 改动目标

- 将 provider 图标从“按文件名猜测彩色资源”升级为基于 `@lobehub/icons` 官方元数据的稳定解析链路
- 保持插件运行时继续使用原生 `<img>` 与本地缓存，不把 React 图标组件打进 Obsidian 插件 bundle
- 在缓存窗口与内置图标选择器中补齐显式 variant 选择、命中信息展示与 fallback 可视化

### ✅ 本轮调整

- `package.json`
- `package-lock.json`
- `scripts/sync-lobehub-icons.mjs`
- `src/utils/icons/lobehubIconManifest.ts`
  - 新增 `sync:lobehub-icons` 构建期脚本，基于 `@lobehub/icons` 官方 `toc` 与 CDN 规则生成本地 manifest
  - 将生成后的 manifest 入库，避免普通 `build` 依赖联网或在运行时动态解析图标能力

- `src/core/types/settings.ts`
- `src/core/types/index.ts`
- `src/main.ts`
  - 新增 `LobehubIconVariant`、`ProviderIconResolvedFormat` 等类型，并让 `ProviderIconEntry` 支持保存 `variant / resolvedVariant / resolvedFormat`
  - 设置新增 `providerIconDefaultVariant`，默认值为 `auto`
  - 启动与设置应用阶段把 provider 图标颜色模式、默认 variant 同步到 `document.body.dataset`

- `src/utils/icons/builtinIconRegistry.ts`
- `src/utils/icons/ProviderIconService.ts`
  - LobeHub 内置图标改为直接读取 manifest 构造定义，不再只靠手写 alias 与文件名推断
  - 图标解析改为 manifest 驱动候选 URL、fallback 顺序与缓存 key；缓存 key 现包含 `iconId + requestedVariant + resolvedVariant + theme + format`
  - 显式 `color / brand / text / avatar` 等 variant 现在会按能力表精确回退，不再误用不存在的静态资源
  - 保留 OpenCode 内置图标、自定义 URL/本地文件图标与默认映射的既有优先级

- `src/features/settings/OpenCodianSettings.ts`
- `src/features/settings/ProviderBuiltinIconPickerModal.ts`
- `src/features/settings/ProviderIconCacheModal.ts`
- `src/style/modals/provider-icon-cache.css`
- `src/i18n/locales/zh.ts`
- `src/i18n/locales/en.ts`
  - 设置页新增“默认提供商图标变体”高级选项
  - 内置图标选择器新增 variant 下拉，并在卡片上显示命中 variant / format / fallback
  - provider 图标缓存窗口新增命中信息 badge，并把 picker 返回的显式 variant 一起持久化
  - 修正选择器下拉 `<option>` 的真实 `value` 写入，避免测试与运行时拿到空字符串

- `tests/unit/utils/icons/ProviderIconService.test.ts`
- `tests/unit/utils/icons/builtinIconRegistry.test.ts`
- `tests/unit/features/settings/ProviderBuiltinIconPickerModal.test.ts`
- `tests/unit/core/types/settings.test.ts`
  - 补充 manifest 元数据、variant fallback、cache key、设置归一化与 picker variant 透传回归测试

- `docs/modules/utils/icons/ProviderIconService.md`
- `docs/modules/features/settings/ProviderBuiltinIconPickerModal.md`
- `docs/modules/features/settings/ProviderIconCacheModal.md`
- `docs/modules/features/settings/OpenCodianSettings.md`
- `docs/modules/core/types/settings.md`
  - 同步更新模块文档，记录 manifest 驱动解析、variant 规则、设置入口与缓存窗口展示行为

### 🧪 验证结果

- `npm test -- ProviderIconService builtinIconRegistry ProviderBuiltinIconPickerModal settings.test` 通过（91/91）
- `npm run build` 通过，最新 `BUILD_ID: main.202604110004`
- 已按顺序复制 `dist/main.js`、`dist/manifest.json`、`dist/styles.css` 到 Test Vault
- 已确认 Test Vault `main.js` 含最新 `BUILD_ID: main.202604110004`
- `npm run check:devlog-order` 将在本次日志更新后执行

## 2026-04-10 模型配置窗口补齐 variants 校验与保存保护

### 🎯 改动目标

- 继续完善模型配置可视化编辑器，避免 `variants` 配置在预览或保存时被静默丢弃
- 防止“其他高级字段”与专门的 `variants` 编辑区重复写入同一字段，造成用户配置被覆盖
- 为上述场景补充明确报错、回归测试，并重新构建部署到 Test Vault 验证

### ✅ 本轮调整

- `src/features/settings/modelConfigWorkspace.ts`
- `src/features/settings/ModelConfigModal.ts`
  - 抽出共享的 `variants` 值解析逻辑，要求每个 variant 条目必须是 JSON 对象；如果填入字符串、数组或 `null`，预览/保存都会直接报错，不再静默跳过
  - 抽出模型高级字段保留键校验，禁止在“其他高级字段”里再次写入 `name`、`limit`、`options`、`variants`，避免覆盖结构化编辑区的结果
  - 让预览构建与最终保存共用同一套校验逻辑，保证编辑器里看到的 JSON 与实际落盘结果一致

- `src/i18n/locales/zh.ts`
- `src/i18n/locales/en.ts`
  - 新增 variant 类型错误与保留字段冲突的中英文提示，方便用户在表单里直接定位问题

- `tests/unit/features/settings/modelConfigWorkspace.test.ts`
  - 新增回归测试：覆盖非对象 variant 值时报错，以及高级字段误填 `variants` 时阻止输出

### 🧪 验证结果

- `npm test -- tests/unit/features/settings/modelConfigWorkspace.test.ts` 通过（6/6）
- `npm run build` 通过，最新 `BUILD_ID: main.202604102118`
- 已按顺序复制 `dist/main.js`、`dist/manifest.json`、`dist/styles.css` 到 Test Vault
- 已确认 Test Vault `main.js` 含最新 `BUILD_ID: main.202604102118`
- `npm run check:devlog-order` 将在本次日志更新后执行

## 2026-04-10 新增提供商窗口按 `cc-switch` 对齐

### 🎯 改动目标

- 将“添加新提供商”窗口按 `cc-switch` 的 OpenCode 表单重新整理，去掉错误的“当前提供商”心智与多 provider 追加逻辑
- 让新增 provider 的 JSON 编辑、额外选项、模型管理、按钮反馈与交互细节更接近参考项目
- 修正新增表单中的输入焦点、字段到 JSON 同步、默认占位提示等问题，并同步部署到 Test Vault 验证

### ✅ 本轮调整

- `src/features/settings/ModelConfigModal.ts`
- `src/features/settings/modelConfigWorkspace.ts`
- `src/features/settings/providerPresets.ts`
  - 新增 provider 流程改为单草稿模式：选择预设只覆盖当前草稿，不再追加隐藏 provider，也不再显示“当前提供商”切换条
  - 底部 JSON 改为内嵌可编辑 textarea，并支持格式化；保存时以 JSON 内容为准，结构化字段变更会同步回 JSON
  - `Base URL` 改成 placeholder 提示，不再把预设地址直接写成真实输入值
  - 修正额外选项 / 模型选项的键名残留问题，避免编辑 key 时在 JSON 中累积 `o / op / ope...` 这样的前缀字段
  - 去掉会抢焦点的重绘路径，补充输入控件事件保护，解决“点击输入框后有时键盘无响应”的问题
  - 新增 provider 的“提供商额外选项”默认带 `setCacheKey: true`

- `src/style/modals/config-editor-modal.css`
- `styles.css`
  - 新增 provider 窗口宽度固定为 `1480px`，去掉 footer 整行背景，只保留操作按钮
  - 将“提供商额外选项”“模型管理”区块按 `cc-switch` 排布重做：标题与按钮同排、键名和值标签上移、删除按钮改成右侧垃圾桶样式
  - 强化“当前还没有定义模型”的空状态，放大字号和留白
  - 调整模型管理区块的列头、展开按钮、输入框与删除按钮中轴线对齐，并去掉该区块内难看的横线
  - 为“拉取模型”“添加模型”“添加字段”和“接口格式”下拉框增加明显的 hover / focus-visible 动效

- `src/i18n/locales/zh.ts`
- `src/i18n/locales/en.ts`
- `docs/modules/features/settings/ModelConfigModal.md`
- `docs/modules/features/settings/OpenCodianSettings.md`
- `docs/modules/style/modals/config-editor-modal.md`
  - 补充新增 provider 流程相关文案与说明
  - 同步更新设置页与样式模块文档，记录新的新增 provider 窗口结构与交互

### 🧪 验证结果

- `npm run build` 通过，最新 `BUILD_ID: main.202604101850`
- `npm run check:devlog-order` 将在本次日志更新后执行
- 已按顺序复制 `dist/main.js`、`dist/manifest.json`、`dist/styles.css` 到 Test Vault
- 已确认 Test Vault `main.js` 含最新 `BUILD_ID: main.202604101850`

## 2026-04-10 provider 图标颜色模式、预览与测试回归

### 🎯 改动目标

- 让 provider 图标支持 `跟随系统 / 单色 / 彩色` 三种显示模式，方便判断 LobeHub 彩色图标是否适合当前主题
- 在内置图标选择器中提供即时预览，避免用户来回切设置后再观察效果
- 修正相关测试基座与断言，使 `npm run test` 在当前代码状态下恢复全绿

### ✅ 本轮调整

- `src/core/types/settings.ts`
- `src/main.ts`
  - 新增全局设置 `providerIconColorMode`
  - 在插件加载与 UI 刷新时同步把图标颜色模式写到 `body[data-opencodian-provider-icon-mode]`

- `src/features/settings/OpenCodianSettings.ts`
- `src/features/settings/ProviderBuiltinIconPickerModal.ts`
- `src/features/settings/ProviderIconCacheModal.ts`
  - 在模型工具区新增 provider 图标颜色模式设置项
  - 内置图标选择器新增颜色模式按钮组与预览区，切换后即时保存并实时生效
  - provider 图标预览统一挂接到同一套图标样式类

- `src/features/chat/OpenCodianView.ts`
- `src/features/settings/ModelConfigModal.ts`
- `src/utils/icons/ProviderIconService.ts`
- `src/style/base/core.css`
- `src/style/modals/provider-icon-cache.css`
- `styles.css`
  - 聊天区、设置页、模型工作区、图标缓存弹窗统一接入 provider 图标颜色滤镜
  - 增加颜色模式与预览区的样式

- `tests/unit/main/themeSettingsMigration.test.ts`
- `tests/unit/core/opencode/OpenCodeService.test.ts`
  - 把主题迁移测试升级到当前 `loadPersistedSettings` 存储接口
  - 调整离线 fallback 日志断言，使其与当前“整段离线期抑制重复日志”的实现一致

- `docs/modules/features/settings/OpenCodianSettings.md`
- `docs/modules/features/settings/ProviderBuiltinIconPickerModal.md`
- `docs/modules/utils/icons/ProviderIconService.md`
- `docs/modules/style/base/core.md`
  - 同步补充图标颜色模式、实时预览和全局滤镜变量的文档说明

### 🧪 验证结果

- `npm run test` 通过，`60` 个测试套件、`488` 个测试全部通过
- `npm run build` 通过，最新 `BUILD_ID: main.202604101239`
- 已按顺序复制 `dist/main.js`、`dist/manifest.json`、`dist/styles.css` 到 Test Vault
- 已确认 Test Vault `main.js` 含最新 `BUILD_ID: main.202604101239`

## 2026-04-10 离线期重复连接日志收敛

### 🎯 改动目标

- 避免 OpenCode 服务离线时控制台被 `ERR_CONNECTION_REFUSED` / `ERR_CONNECTION_RESET` 的 fallback 与失败日志持续刷屏
- 让 `global.syncEvent` 在离线期不要每秒重连一次，减少重复网络报错
- 同步更新模块文档，并把最新构建部署到 Test Vault 便于验证

### ✅ 本轮调整

- `src/core/opencode/OpenCodeService.ts`
  - 将瞬时离线日志抑制从“按操作类型节流”改为“整段离线期全局只报首条”
  - 仅在服务恢复健康后清空抑制状态，避免设置轮询、消息同步、问题刷新分别重复报错
  - `global.syncEvent` 连接失败遇到 `ERR_CONNECTION_REFUSED` / `ERR_CONNECTION_RESET` 时，改为健康轮询等待恢复后再重连

- `docs/modules/core/opencode/OpenCodeService.md`
  - 更新模块文档，说明新的离线期日志收敛与 sync-event 重连策略

### 🧪 验证结果

- `npm run build` 通过，最新 `BUILD_ID: main.202604101211`
- 已按顺序复制 `dist/main.js`、`dist/manifest.json`、`dist/styles.css` 到 Test Vault
- 已确认 Test Vault `main.js` 含最新 `BUILD_ID: main.202604101211`

## 2026-04-10 设置页目录级批量提供商开关与模型批量开关

### 🎯 改动目标

- 在“可用范围与目录”里补充批量操作，但避免跨目录统一写回，改为跟随当前目录卡片执行对应 provider 批量启用/禁用
- 在 provider 展开面板里补充“启用所有模型 / 禁用所有模型”，且仅影响模型禁用状态，不误改 provider 开关
- 同步设置页文案、样式与模块文档，保持目录语义和 UI 行为一致

### ✅ 本轮调整

- `src/features/settings/OpenCodianSettings.ts`
  - 新增 provider 展开后的“`一键启用所有模型` / `一键禁用所有模型`”，批量写回插件设置 `disabledModelRefs`
  - 将 provider 级批量开关从全局顶部移到当前激活目录卡片容器下，只对该目录中的 provider 集合生效
  - 保留服务端禁用约束：来自当前目录但被服务端 scope 禁用的 provider 不会被误作为可批量启用目标

- `src/i18n/locales/zh.ts`
- `src/i18n/locales/en.ts`
  - 补充目录级 provider 批量操作与模型批量操作文案

- `src/style/modals/config-editor-modal.css`
- `styles.css`
  - 增加目录操作条、模型批量操作条与响应式布局样式

- `docs/modules/features/settings/OpenCodianSettings.md`
  - 文档改为说明：provider 批量操作绑定当前目录卡片，而不是跨全部目录统一生效

### 🧪 验证结果

- `npm run build` 通过，最新 `BUILD_ID: main.202604101153`
- 已部署 `dist/main.js`、`dist/manifest.json`、`dist/styles.css` 到 Test Vault
- 已确认 Test Vault `main.js` 含最新 `BUILD_ID: main.202604101153`

## 2026-04-10 provider 目录真值修正与设置页禁用视图对齐

### 🎯 改动目标

- 修正 `disabled_providers` 被误当成“provider 已从 runtime 目录消失”的硬事实，避免设置页 `服务器目录` 与 `opencode models` 继续失真
- 让项目本地 provider 覆盖真正遵循“本地字段替换继承字段”的语义，允许缩小或清空继承禁用数组
- 对齐设置页目录卡、可用性探测与对应测试，减少 UI/运行时口径不一致

### ✅ 本轮调整

- `src/core/config/ModelConfigService.ts`
  - `server` catalog 改为直接以当前 runtime provider/model 集合为真值，不再为继承层 `disabled_providers` 额外制造“硬禁用占位”
  - `currentEnabledProviderIds` 不再先扣掉所谓“硬服务端禁用”；只按当前 scoped config 与项目本地配置共同判断当前作用域是否启用
  - provider probe 中的 `serverDisabled` 改为表示“当前 scoped config 禁用但项目本地未禁用”，不再把继承禁用直接当成 runtime 不可用
  - `effectiveProviderConfig` 恢复为普通继承/替换合并，不再强行并回所谓硬禁用数组

- `src/features/settings/OpenCodianSettings.ts`
  - `服务器目录` / `当前生效列表` / `当前禁用列表` 的展示逻辑改为围绕 `currentEnabledProviderIds` 与当前目录事实重算
  - runtime 里仍存在、但当前被配置禁用的 provider，会继续显示在 `服务器目录`，同时在禁用视图和 badge 上表达禁用来源
  - 仅对“当前目录中不存在、但配置层声明禁用”的 provider 补占位，避免把已重新启用的 provider 留在禁用列表里

- `docs/modules/core/config/ModelConfigService.md`
- `docs/modules/core/config/modelConfig.md`
- `docs/modules/features/settings/OpenCodianSettings.md`
  - 文档统一改为：`服务器目录` 直接对齐 `config.providers(directory)` / `opencode models`
  - 明确 `disabled_providers` 是配置层输入，不是 provider 已离开 runtime 目录的证据

- `tests/unit/core/config/ModelConfigService.test.ts`
- `tests/unit/features/settings/OpenCodianSettings.test.ts`
  - 回归测试改为覆盖“runtime 仍在时继续展示 provider”“项目可覆盖继承禁用”“重新启用后从禁用视图移除”等行为

### 🧪 验证结果

- `npm test -- tests/unit/core/config/ModelConfigService.test.ts tests/unit/features/settings/OpenCodianSettings.test.ts` 通过
- `npm run build` 通过，最新 `BUILD_ID: main.202604100003`
- 已部署 `dist/main.js`、`dist/manifest.json`、`dist/styles.css` 到 Test Vault
- 已确认 Test Vault `main.js` 含最新 `BUILD_ID: main.202604100003`

## 2026-04-09 样式拆分构建接线、样式文档补全与索引同步

### 🎯 改动目标

- 让生产构建在打包前自动合并 `src/style/`，避免遗漏 `build:css` 导致 `dist/styles.css` 过期
- 统一样式入口顺序与文档说明，明确 `src/style/index.css` 才是样式覆盖关系的真实来源
- 将新建的样式模块文档、模块总索引和代理工作说明同步到当前仓库状态

### ✅ 本轮调整

- `scripts/build-css.mjs`
- `scripts/build.mjs`
  - 抽出可复用的 `buildCss()`，供 CLI 直接运行和生产构建复用
  - `npm run build` 现在会先读取 `src/style/index.css`，生成根目录 `styles.css`，再继续产出 `dist/*`

- `src/style/index.css`
- `styles.css`
  - 统一样式合并顺序为 `base -> utils -> components -> features -> modals`
  - 重新生成根目录样式产物，确保与拆分后的源码结构一致

- `docs/modules/style/README.md`
- `docs/modules/style/base/core.md`
- `docs/modules/style/components/*.md`
- `docs/modules/style/features/*.md`
- `docs/modules/style/modals/*.md`
- `docs/modules/style/utils/markdown.md`
  - 补齐样式模块文档，移除模板占位与错误命令
  - 每篇文档改为记录真实职责、关键类名、消费组件与修改注意点

- `docs/modules/README.md`
- `docs/modules/infrastructure/build-pipeline.md`
- `docs/modules/infrastructure/scripts.md`
- `AGENTS.md`
  - 同步模块总索引统计、样式目录说明与构建流程文档
  - 代理说明补充 `src/style/` / `styles.css` 的关系，以及 `npm run build` 已自动包含 CSS 合并

### 🧪 验证结果

- `npm run build` 通过，自动执行 CSS 合并，最新 `BUILD_ID: main.202604092349`
- 已部署 `dist/main.js`、`dist/manifest.json`、`dist/styles.css` 到 Test Vault
- 已确认 Test Vault `main.js` 含最新 `BUILD_ID: main.202604092349`

## 2026-04-09 本地 sidecar 生命周期、孤儿进程回收与端口迁移修正

### 🎯 改动目标

- 修正插件把错误本地服务误判成“服务器目录真值”的问题，根因聚焦到 sidecar 生命周期，而不是继续改 provider 过滤
- 将插件默认本地 sidecar 端口从 `4096` 调整为 `4196`，避免与独立 OpenCode 默认端口混淆
- 为设置页和诊断报告补上冲突 / 孤儿 sidecar 的明确状态，让问题定位不再依赖猜测

### ✅ 本轮调整

- `src/core/types/settings.ts`
- `src/core/types/index.ts`
- `src/main.ts`
  - 新增 `OPENCODIAN_LOCAL_SIDECAR_DEFAULT_PORT = 4196` 与旧默认端口常量
  - 插件本地默认端口切到 `4196`
  - 增加一次性迁移：仅当持久化配置仍是“未改过的旧本地默认值”时，才把本地 `4096` 自动迁到 `4196`
  - `onunload()` 先走同步 `dispose()`，再做异步 `stop()` 补清理

- `src/core/opencode/ServerManager.ts`
- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/types.ts`
- `src/core/opencode/index.ts`
  - 本地服务启动改为“健康轮询 + 提前退出”竞态等待，不再固定睡 1 秒
  - 保留 managed server 签名校验：签名匹配才 adopt，签名过期才 restart
  - 默认插件端点 `127.0.0.1:4196` 上的未知健康 `opencode serve` 会按“孤儿 sidecar”回收并重启
  - 自定义端口上的未知健康服务改为 `conflict`，不再伪装成正常运行
  - 新增结构化 diagnostics，并向设置页暴露 `getServerDiagnostics()`
  - Windows 卸载清理补上同步 `taskkill /T /F` 路径，减少孤儿进程

- `src/features/settings/OpenCodianSettings.ts`
- `src/i18n/locales/zh.ts`
- `src/i18n/locales/en.ts`
  - 设置页状态区新增“已回收孤儿 sidecar”“端口冲突”等显示
  - 端口占位符与帮助文案改成以插件默认 `4196` 为准，并明确区分独立 OpenCode 常见 `4096`

- `docs/modules/core/opencode/ServerManager.md`
- `docs/modules/core/config/modelConfig.md`
- `docs/status/sdk-v2-manual-checklist.md`
  - 文档口径统一为：插件 sidecar 默认 `4196`，独立 OpenCode 常见默认 `4096`
  - provider 集合异常时，优先排查 sidecar/orphan/conflict，而不是先改模型过滤逻辑

- `tests/unit/core/opencode/ServerManager.test.ts`
- `tests/unit/core/opencode/OpenCodeService.test.ts`
- `tests/unit/core/types/settings.test.ts`
- `tests/unit/main.test.ts`
  - 补充默认端口迁移、孤儿 sidecar 回收、冲突状态、同步清理、启动失败输出等回归测试

### 🧪 验证结果

- `npm test -- tests/unit/core/opencode/ServerManager.test.ts tests/unit/main.test.ts tests/unit/core/opencode/OpenCodeService.test.ts tests/unit/core/types/settings.test.ts tests/unit/features/settings/OpenCodianSettings.test.ts` 通过
- `npm run build` 通过，最新 `BUILD_ID: main.202604092344`

## 2026-04-09 后台任务权威同步、重载抑制与滚动恢复修正

### 🎯 改动目标

- 让后台任务完成时机更贴近 OpenCode SDK：优先响应 `message.updated` / `message.part.updated` / `session.diff`，不再只靠 2 秒轮询猜测
- 修正 reload 后“明明早已结束却仍显示后台任务仍在运行”的误判链路
- 修正重载或补写 notice 后消息区无法稳定滚到最底部、会被自动顶回去的问题

### ✅ 本轮调整

- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/index.ts`
  - 扩展内部 sync-event 桥接，新增 `message.updated`、`message.part.updated`、`session.diff` 订阅回调
  - 保持现有 todo/status 订阅不变，但让聊天视图能基于消息层信号更早触发 authoritative sync

- `src/features/chat/OpenCodianView.ts`
- `src/core/types/chat.ts`
  - 新增会话 hydration / authoritative-sync 状态，reload 后先重建 inline background task，再等至少一次权威消息同步后才允许 stale 降级
  - 为后台任务补充 `backgroundTaskAwaitingAuthoritativeSync` 等运行态字段，避免历史 launch 在 reload 后反向重建成“仍在运行”
  - 新增 signal-driven conversation sync，收到 SDK sync-event 时会优先刷新当前会话或后台 tab，而不是只能等轮询
  - 重做消息区滚动恢复逻辑：由“恢复旧 `scrollTop`”改成“到底 / 保持距底距离 / 保持 anchor”三态恢复
  - hydration 期间禁止 layout change 触发自动吸底，避免补写 inline/stale/completion notice 时把视图顶上去
  - 关闭 tab 的阻塞规则收敛到 foreground-only，不再因为后台任务仍在回写就强行阻止关闭
  - 为后台任务完成 notice 的 `noticeMeta` 补充 `conversationId`，方便 reload 后稳定判重

- `tests/unit/core/opencode/OpenCodeService.test.ts`
- `tests/unit/features/chat/backgroundTaskHydrationState.test.ts`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/status/sdk-v2-manual-checklist.md`
- `docs/requirements/omo-compatibility.md`
  - 新增 sync-event 桥接测试与 hydration/stale/滚动保护测试
  - 同步文档口径，明确当前实现已经具备“事件驱动 + 轮询兜底”的后台任务同步链路

### 🧪 验证结果

- `npm run typecheck` 通过
- `npm test -- tests/unit/core/opencode/OpenCodeService.test.ts tests/unit/features/chat/backgroundTaskTimeline.test.ts tests/unit/features/chat/backgroundTaskHydrationState.test.ts tests/unit/features/chat/backgroundTaskNoticeDedup.test.ts tests/unit/features/chat/staleSessionTodoState.test.ts` 通过
- `npm run build` 通过，最新 `BUILD_ID: main.202604092008`

## 2026-04-09 后台任务改为会话内链路与延迟完成卡片

### 🎯 改动目标

- 去掉后台任务运行中时的独立悬浮卡片，改成融合到当前会话 turn 内的内联状态条
- 将后台任务完成提醒改成“检测完成后排队、前台流式结束后再持久化插入”的 notice 机制
- 保持历史可回放：重开 Obsidian 后，运行态可从消息事实重建，完成卡片可继续浏览且不重复追加

### ✅ 本轮调整

- `src/features/chat/OpenCodianView.ts`
- `src/core/types/chat.ts`
  - 新增后台任务 segment 收集与 anchor 归属逻辑，按 `tool=task`、system reminder 与会话同步结果重建后台任务链路
  - 取消独立 transient background task notice，改为把运行态以内联状态条挂到触发该任务的 assistant turn 下
  - 新增完成提醒队列与 `noticeMeta` 去重信息；若当前仍有前台流式，则先缓存，流式结束后再落成持久化完成卡片
  - 发送阻塞逻辑改为只看前台主回复是否忙碌，不再因为后台任务仍在回写就阻止继续发消息

- `src/features/chat/tabs/TabBar.ts`
- `styles.css`
  - tab 状态改成“streaming 主态、background 次级标记”优先级
  - 为内联后台任务状态条和 tab 次级后台标记补齐样式

- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
  - 调整后台任务与发送阻塞相关文案，避免继续把后台任务描述成“当前标签不可交互”

- `tests/unit/features/chat/backgroundTaskTimeline.test.ts`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/status/sdk-v2-manual-checklist.md`
  - 新增后台任务时间线/完成提醒去重测试
  - 同步模块文档与手工验证口径，明确 `session.status` 只代表主 runner 忙闲，不代表后台任务完成

### 🧪 验证结果

- `npm test -- tests/unit/features/chat/backgroundTaskTimeline.test.ts tests/unit/features/chat/backgroundTaskNoticeDedup.test.ts tests/unit/features/chat/staleSessionTodoState.test.ts` 通过
- `npm run typecheck` 通过
- `npm run build` 通过，最新 `BUILD_ID: main.202604091919`

## 2026-04-09 Provider 内置图标库与 OpenCode 图标集接入

### 🎯 改动目标

- 保留现有 `LobeHub + 自定义图标源` 机制，同时新增可搜索、可浏览、可选择的内置 provider 图标库
- 把参考项目 OpenCode 的 provider 图标打包进插件，减少第三方 provider 需要手工找图标的情况
- 保持现有设置入口不变，继续从 provider icon cache 管理弹窗进入

### ✅ 本轮调整

- `src/utils/icons/builtinIconRegistry.ts`
- `src/utils/icons/ProviderIconService.ts`
- `src/core/types/settings.ts`
  - 新增 `builtin` 图标条目类型，支持 `lobehub:{iconId}` / `opencode:{iconId}` 内置源
  - 抽出双图库 registry，统一管理内置图标清单、别名、搜索与默认匹配策略
  - 扩展 provider icon service，支持 OpenCode 内置资源读取、双图库自动匹配、内置图标选择去重与预览

- `src/features/settings/ProviderBuiltinIconPickerModal.ts`
- `src/features/settings/ProviderIconCacheModal.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
- `styles.css`
  - 在现有 provider icon cache modal 中新增“选择内置图标”入口
  - 新增内置图标选择器，支持搜索、库过滤、推荐标记、当前选中高亮
  - 补齐中英文文案与对应样式

- `assets/provider-icons/opencode/`
  - vendor 参考项目 OpenCode 的 provider SVG 图标资源，随插件一同分发，不再依赖 `reference-projects/` 运行时目录

- `tests/unit/utils/icons/ProviderIconService.test.ts`
- `tests/unit/utils/icons/builtinIconRegistry.test.ts`
- `tests/unit/features/settings/ProviderBuiltinIconPickerModal.test.ts`
- `docs/modules/utils/icons/ProviderIconService.md`
- `docs/modules/features/settings/ProviderIconCacheModal.md`
- `docs/modules/features/settings/ProviderBuiltinIconPickerModal.md`
  - 补充 builtin 解析、OpenCode 内置资源加载、重复选择去重、picker 搜索/选择的测试
  - 同步刷新相关模块文档

### 🧪 验证结果

- `npm run typecheck` 通过
- 定向 Jest 测试通过：
  - `tests/unit/utils/icons/ProviderIconService.test.ts`
  - `tests/unit/utils/icons/builtinIconRegistry.test.ts`
  - `tests/unit/features/settings/ProviderBuiltinIconPickerModal.test.ts`
- `npm run build` 通过，最新 `BUILD_ID: main.202604091833`
- Test Vault 已部署并确认 `C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\main.js` 含最新 `BUILD_ID`

## 2026-04-09 现有 typecheck 错误清零与构建回归

### 🎯 改动目标

- 修掉仓库里现有的 TypeScript 编译错误，恢复 `npm run typecheck` 绿色
- 保持前一轮 `@opencode-ai/sdk@1.4.1` 升级后的主线稳定，不顺手改动无关运行时逻辑
- 重新 build 并部署到 Test Vault，确认最新产物可用

### ✅ 本轮调整

- `src/features/chat/glassOctahedronDemo.ts`
  - 简化质量降级后的分支，去掉已不可能命中的 `'full-v3'` 比较，消除收窄后的联合类型报错

- `src/features/chat/glassOctahedronDemoThree.ts`
  - 为本地 `vendor/three` 导入补上最小运行时结构类型
  - 通过局部 `MeshNode` / `GroupNode` / `CameraNode` / `LightNode` / `FresnelMaterialNode` 收口 `position`、`rotation`、`scale`、`uniforms`
  - 增加 `addObject()` 辅助函数，避免 `Scene.add()` / `Group.add()` 在当前类型面下反复报错

- `src/features/chat/OpenCodianView.ts`
  - 将流式 `tool_use` 调试日志改为读取 `streamingChunk.name`
  - 去掉同步保留逻辑里已被前置分支排除的 `displayStyle === 'notice'` 冗余判断

- `src/features/settings/OpenCodianSettings.ts`
  - 用局部常量收窄 `restoreSearchSelection`
  - 将调试快照里的 `selectedSmallModel` 改为读取 `localModelConfig.small_model`，不再访问不存在的 `settings.smallModel`

### 🧪 验证结果

- `npm run typecheck` 通过
- `npm run build` 通过，生成 `BUILD_ID: main.202604091601`
- Test Vault 已部署并确认 `C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\main.js` 含最新 `BUILD_ID`

## 2026-04-09 SDK 1.4.1 同步升级与上游 SDK 机制核对

### 🎯 改动目标

- 清理 `reference-projects/opencode` 中拉取后残留的未跟踪 `sync-conflict-*` 文件，恢复参考仓库干净状态
- 审阅上游 `opencode` 从 `ae614d9` 到 `847fc9d` 的 19 个提交，重点确认 SDK / OpenAPI / provider schema 的变化是否会影响 OpenCodian
- 将 `@opencode-ai/sdk` 从 `1.4.0` 同步升级到 `1.4.1`，并用现有 facade / fallback 验证插件仍稳定运行

### ✅ 本轮调整

- `package.json`
- `package-lock.json`
  - 将 `@opencode-ai/sdk` 精确升级到 `1.4.1`
  - 保持精确版本锁定，不放宽 semver 范围，避免后续自动漂移

- `docs/status/sdk-v2-rollout.md`
- `docs/modules/core/opencode/OpenCodeService.md`
- `docs/modules/core/opencode/sdkTypes.md`
- `docs/modules/core/types/chat.md`
  - 把 SDK 当前版本说明同步到 `1.4.1`
  - 将 `session.diff()` / scoped request rewrite 的兼容描述统一收敛到 `1.4.x`

### 🔎 上游 SDK / 接口面结论

- `@opencode-ai/sdk` 上游已发布 `1.4.1`，本地参考仓库最新头部为 `847fc9d release: v1.4.1`
- 这轮最直接的 SDK 机制变化不是 client factory 改写，而是 **OpenAPI 与生成类型对真实服务端响应的纠偏**
  - `/provider` 的 `all` 响应改为复用统一 `Provider` schema，补齐 `whitelist`、`blacklist`、`options` 等字段
  - shell/session 某些响应类型改得更贴近真实 `Message + parts` 结构，减少 SDK 类型与服务端返回不一致
- 服务端内部还同步调整了：
  - config provider schema 中 runtime provider 与 config model schema 的拆分
  - `promptAsync` 路由返回更干净的 `204`
  - workflow / provider-executed tool 的权限与消息元数据处理
- OpenCodian 现有 `OpenCodeService` 已经把 SDK 原始 payload 收敛在 service 层，并通过 `unwrapSdkData()`、provider/model 归一化和 legacy fallback 做兼容，因此 **本轮不需要额外改 service 逻辑**

### 🧪 验证结果

- `npm run build` 通过，生成 `BUILD_ID: main.202604091551`
- Test Vault 已部署并确认 `C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\main.js` 含最新 `BUILD_ID`
- SDK 定向回归通过：
  - `tests/unit/core/opencode/createSdkClient.test.ts`
  - `tests/unit/core/opencode/sdkFetch.test.ts`
  - `tests/unit/core/opencode/OpenCodeService.test.ts`
- `npm run typecheck` 仍失败，但报错集中在既有的 `glassOctahedronDemo*`、`OpenCodianView.ts`、`OpenCodianSettings.ts`，与本次 SDK 升级无关

## 2026-04-09 SDK 1.4.0 兼容与本地服务签名接管修正

### 🎯 改动目标

- 升级 `@opencode-ai/sdk` 到 `1.4.0`，兼容 SDK 新的 `data` 包裹响应、`session.diff()` patch 结构，以及 scoped GET 请求改写
- 避免插件继续误接管旧 vault / 旧配置留下的本地 `4096` managed server，导致设置页 provider 目录与 `opencode models` 严重不一致
- 把继承层 / 服务端 `disabled_providers` 固定为硬禁用，稳定 `服务器目录`、`当前生效列表`、`当前禁用列表` 三张卡的关系

### ✅ 本轮调整

- `package.json`
- `package-lock.json`
- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/types.ts`
- `src/core/types/chat.ts`
  - SDK 升级到 `1.4.0`
  - 新增 SDK `data` 响应解包与 `config.get()` 归一化，避免把 field-style 返回直接泄漏到上层
  - `getSessionDiff()` 同时兼容 legacy `before/after` 与 SDK 1.4.0 `patch` 形状
  - `SessionDiffEntry` 新增 `patch?` 兼容字段

- `src/core/opencode/ServerManager.ts`
- `src/core/config/ModelConfigService.ts`
  - managed server 状态现在额外记录启动签名：工作目录、模型来源模式、隔离模式、配置指纹
  - 如果本地 `4096` 上是旧的 managed server 且签名已过期，会先停掉旧进程、等待端口释放，再重启当前 vault 对应服务
  - spawn 前会清理继承来的 `OPENCODE_*` 覆盖环境变量，避免本地服务沿用外部终端或旧集成注入
  - 服务端继承层 `disabled_providers` 会继续作为硬禁用保留，不允许被项目本地“重新启用”覆盖

- `tests/unit/core/opencode/OpenCodeService.test.ts`
- `tests/unit/core/opencode/ServerManager.test.ts`
- `tests/unit/core/config/modelConfig.test.ts`
- `tests/unit/core/opencode/createSdkClient.test.ts`
- `tests/unit/core/opencode/sdkFetch.test.ts`
  - 新增 SDK 1.4.0 payload、scoped request、stale managed server 重启、环境变量清理等回归覆盖

- `docs/modules/core/opencode/ServerManager.md`
- `docs/modules/core/opencode/OpenCodeService.md`
- `docs/modules/core/config/ModelConfigService.md`
- `docs/modules/core/opencode/sdkTypes.md`
- `docs/modules/core/types/chat.md`
- `docs/modules/features/settings/OpenCodianSettings.md`
- `docs/status/sdk-v2-rollout.md`
- `docs/status/sdk-v2-manual-checklist.md`
  - 同步刷新 SDK rollout 现状、manual checklist，以及 provider 真值排查路径

- `AGENTS.md`
  - 补充 stale managed server / hard-disabled provider 的快速排查规则，避免后续维护再把这条链路改回去

### 🧠 架构变化

- 本地 `4096` 服务的“可接管”条件从“端口健康 + 像 OpenCode”升级为“启动签名仍匹配当前 vault / 模式 / 配置”
- 设置页三张 provider 卡的关系进一步固定：
  - `服务器目录` = `config.providers(directory)` - 服务端硬禁用 provider
  - `当前生效列表` = 上式结果再叠加项目本地 provider 开关与 source mode 过滤
  - `当前禁用列表` = 服务端禁用占位 + 项目禁用项 + `disabledModelRefs`
- SDK 1.4.0 的返回形状差异继续收敛在 service 层，UI 与上层类型不直接依赖 SDK 原始 payload

### 🧪 当前验证

- 已通过：`npm run build`
- 已通过：`npm run check:devlog-order`
- 已通过：`npm test -- tests/unit/core/config/modelConfig.test.ts tests/unit/core/opencode/OpenCodeService.test.ts tests/unit/core/opencode/ServerManager.test.ts tests/unit/core/opencode/createSdkClient.test.ts tests/unit/core/opencode/sdkFetch.test.ts`
- 已部署测试库并确认 `C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\main.js` 包含 `BUILD_ID: main.202604090009`

## 2026-04-08 AI 标题模型接入模型开关链路与失效告警

### 🎯 改动目标

- 让设置里的“AI 标题模型”也遵循 provider / model 开关链路，而不是模型一旦失效就被静默清空
- 当当前选中的标题模型已不在 `effective` catalog 中时，在设置项右侧直接给出醒目的 ⚠️ 告警入口
- 点击告警后明确提示“当前模型不可用，功能无法生效”，避免用户误以为标题生成功能仍在正常工作

### ✅ 本轮调整

- `src/features/settings/OpenCodianSettings.ts`
- `src/i18n/locales/zh.ts`
- `src/i18n/locales/en.ts`
- `styles.css`
  - 标题模型设置现在会同时读取 `baseEffective` 和 `effective`，保留已选但当前不可用的模型引用
  - 当模型存在于基础目录、但被 provider / model 开关链路过滤掉时，设置项右侧显示警告按钮
  - 点击警告按钮会弹出提示：当前模型不可用，功能无法生效
  - 为警告按钮补充单独的 warning 样式与 tooltip 文案

- `src/features/chat/services/TitleGenerationService.ts`
- `tests/unit/features/chat/TitleGenerationService.test.ts`
  - 标题生成服务不再对“显式配置但已不可用”的标题模型静默回退到当前会话模型
  - 仅在“目录可用性本身无法读取”这类异常情况下，才继续回退到当前会话模型
  - 新增测试覆盖：显式不可用模型会阻止标题生效；目录读取异常时仍可回退

- `tests/unit/features/settings/OpenCodianConversationSettings.test.ts`
  - 新增设置页测试，覆盖不可用标题模型仍会保留显示，并展示可点击的警告入口

- `docs/modules/features/chat/services/TitleGenerationService.md`
- `docs/modules/features/settings/OpenCodianSettings.md`
- `docs/modules/core/config/ModelConfigService.md`
  - 同步更新模块文档，说明标题模型现在是 availability-aware 阻断，而不是静默回退

### 🧠 架构变化

- 标题模型设置现在区分“完全不存在”和“存在但被当前开关链路禁用”两类状态
- 设置页负责保留并提示失效配置，标题生成服务负责在运行时阻止该配置继续生效
- 这样既保留用户原始选择，也让 UI 和运行时行为保持一致

### 🧪 当前验证

- 已通过：`npm test -- tests/unit/features/chat/TitleGenerationService.test.ts`
- 已通过：`npm test -- tests/unit/features/settings/OpenCodianConversationSettings.test.ts`
- 已通过：`npm run build`
- 已部署测试库并确认 `C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\main.js` 包含 `BUILD_ID: main.202604081910`

## 2026-04-08 调试日志增加内联序列化参数开关

### 🎯 改动目标

- 在设置页调试分区增加一个开关，用来控制 debug 日志里对象参数的 Console 输出形式
- 开启后，把全部非字符串 debug 参数先做 `JSON.stringify()`，再直接拼进消息字符串，避免必须展开对象才能看内容
- 关闭后，保持原本行为：对象继续作为独立 console 参数输出，便于开发者做结构化查看

### ✅ 本轮调整

- `src/core/types/settings.ts`
- `src/main.ts`
- `src/shared/logger.ts`
- `src/shared/index.ts`
  - 新增设置字段 `inlineSerializedDebugLogArgs`，默认关闭
  - 主插件加载/保存设置时会同步应用该开关，并在诊断报告里输出当前状态
  - logger 新增独立的运行时开关；仅影响 `logger.debug(...)`
  - 当开关开启时，`formatArgs(...)` 会把非字符串参数序列化后拼进首个日志字符串；关闭时仍保留独立参数输出

- `src/features/settings/OpenCodianSettings.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
  - 在设置 → 调试 中新增“内联序列化调试参数”切换项
  - 补充中英文说明文案，明确该选项用于 Console 中免展开查看对象内容

- `tests/unit/shared/logger.test.ts`
- `tests/unit/main.test.ts`
- `tests/unit/core/types/settings.test.ts`
  - 新增 logger 单测，覆盖默认独立参数输出、开启后内联 JSON 输出、以及 `info` 不受影响
  - 补充主设置加载与默认值回归测试

- `docs/modules/shared/logger.md`
- `docs/modules/shared/index.md`
- `docs/modules/core/types/settings.md`
- `docs/modules/features/settings/OpenCodianSettings.md`
- `docs/modules/entry-point/main.md`
  - 更新模块文档，补充新的调试输出格式开关与设置流转说明

### 🧠 架构变化

- debug 日志现在同时支持两种 Console 表达：结构化独立参数、或内联序列化文本
- 该行为由设置页持久化控制，但只作用于 `debug` 级别，避免影响 `info / warn / error` 的既有调试习惯

### 🧪 当前验证

- 已通过：`npm run build`
- 已通过：`npm run lint`
- 已通过：`npm run test`
- 已通过：`npm run check:devlog-order`
- 已部署测试库并确认 `C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\main.js` 包含 `BUILD_ID: main.202604081847`

## 2026-04-08 会话模型选择器接入可用性回退与未配置态

### 🎯 改动目标

- 让会话面板里的模型选择器真正适配 provider / model 开关链路，而不是在当前模型失效后只停留在黄色警告态
- 当当前会话模型被过滤或失效时，自动切到其他仍在 `effective` catalog 中可用的模型，避免发送链路继续卡在旧选择上
- 当当前来源模式下已经没有任何生效模型时，在会话工具栏里明确显示默认机器人图标与醒目的“未配置”状态

### ✅ 本轮调整

- `src/core/config/modelConfig.ts`
- `src/features/chat/OpenCodianView.ts`
- `styles.css`
  - 新增 `resolvePreferredAvailableModel()`：优先保留当前仍可用的模型；若当前模型已失效，则按“同 provider 默认模型 → 同 provider 首个模型 → effective catalog 默认模型 → effective catalog 首个模型”的顺序回退
  - 会话面板的当前模型解析改为先取 tab override / 默认模型，再基于 `effective` catalog 求出真正可发送、可展示的当前模型
  - `sendMessage()` 在发送前确保模型目录已加载，并统一使用回退后的当前模型，避免首次进入视图时仍带着失效模型发送
  - model trigger 新增 `is-unconfigured` 态；当 `effective` catalog 为空时，继续使用默认 `bot` 图标并把文案高亮为“未配置”

- `tests/unit/core/config/modelConfig.test.ts`
  - 补充回归测试，覆盖“当前模型被过滤后回退到同 provider 可用模型”以及“provider 整体失效后回退到 catalog 默认模型”

- `docs/modules/core/config/modelConfig.md`
- `docs/modules/features/chat/OpenCodianView.md`
  - 更新模块文档，补充模型选择器现在会基于 `effective` catalog 自动降级，以及空目录时的 trigger 展示规则

### 🧠 架构变化

- 会话面板里的“当前模型”不再等同于“请求时保存的模型引用”；真正参与展示、上下文标识和发送的是 availability-aware 的解析结果
- `baseEffective` 继续负责保留不可用模型的展示元数据，而 `effective` 负责驱动会话面板当前应使用的实际模型

### 🧪 当前验证

- 已通过：`npm test -- tests/unit/core/config/modelConfig.test.ts`
- 已通过：`npx eslint src/core/config/modelConfig.ts src/features/chat/OpenCodianView.ts tests/unit/core/config/modelConfig.test.ts`
- 已通过：`npm run build`
- 已通过：`npm run check:devlog-order`
- 已部署测试库并确认 `C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\main.js` 包含 `BUILD_ID: main.202604081251`

## 2026-04-08 对齐 provider 作用域解析，补上真实探针与流错误保留

### 🎯 改动目标

- 让设置页里的 provider / model 可用性展示真正对齐 OpenCode 当前 vault 作用域，而不是把 `provider.list`、默认作用域 `/config` 和 runtime 列表混成同一种“服务器目录”
- 把 provider 可用性测试从“看目录里有没有”升级成“必要时发一条最小真实请求”，直接暴露鉴权或发送失败
- 修复 Windows 下 `directory` 作用域路径与本地 server 二进制解析细节带来的排障偏差，并让聊天流错误 notice 在同步后不再闪退

### ✅ 本轮调整

- `src/core/config/ModelConfigService.ts`
- `src/core/config/modelConfig.ts`
- `src/core/config/index.ts`
- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/sdkFetch.ts`
- `src/core/opencode/ServerManager.ts`
  - `ModelConfigService` 现在同时读取项目 `.opencode`、目录作用域 runtime providers、当前作用域解析配置和继承层配置，产出 `serverConfig`、`effectiveProviderConfig`、`currentEnabledProviderIds`
  - 设置页新增 `testProviderAvailability()` 探针：能发时就用临时 session 做一次最小真实发送，区分 `available`、`send_failed`、`project_disabled`、`server_disabled`、`catalog_only`、`missing`
  - `OpenCodeService` 新增 `getProviderDirectory()`、`getResolvedModelConfig()`、`probeProviderResponse()`，并把 SDK `session.error` 与 assistant persisted message 里的结构化错误都提升成真实 `error` chunk
  - `sdkFetch` 会把 `x-opencode-directory` / `x-opencode-workspace` 改写成 query 参数，并把 Windows `C:\vault` 统一规范化成 `C:/vault`
  - `ServerManager` 现在会真正解析 `opencode` 可执行文件路径；Windows 上优先 npm 全局 `opencode.cmd`，并通过 shell 启动 `.cmd`

- `src/features/settings/OpenCodianSettings.ts`
- `src/features/chat/OpenCodianView.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
- `styles.css`
  - 设置页服务器目录改为只显示当前 runtime 真正在作用域内出现的 provider，把服务端禁用占位收敛到 `当前禁用` 视图
  - provider 状态摘要现在区分“项目禁用”和“服务端禁用”，并新增逐 provider 的测试按钮、badge 和详情文案
  - 聊天流在“无文本但有错误”场景下会保留 notice card，并按 `sourceMessageId` 等待同一条服务端回复真正补回可见内容后再让位

- `docs/architecture/README.md`
- `docs/modules/core/config/ModelConfigService.md`
- `docs/modules/core/config/modelConfig.md`
- `docs/modules/core/opencode/OpenCodeService.md`
- `docs/modules/core/opencode/ServerManager.md`
- `docs/modules/core/opencode/sdkFetch.md`
- `docs/modules/features/chat/OpenCodianView.md`
- `docs/modules/features/settings/OpenCodianSettings.md`
- `AGENTS.md`
  - 补齐目录作用域、provider 目录 / runtime 区分、Windows 路径规范化和流错误 notice 的模块文档与总览说明
  - `AGENTS.md` 增补了调试 provider/config 问题时的作用域判断与 Windows `directory` 路径注意事项

- `tests/unit/core/config/ModelConfigService.test.ts`
- `tests/unit/core/config/modelConfig.test.ts`
- `tests/unit/core/opencode/OpenCodeService.test.ts`
- `tests/unit/core/opencode/ServerManager.test.ts`
- `tests/unit/core/opencode/sdkFetch.test.ts`
- `tests/unit/features/settings/OpenCodianSettings.test.ts`
- `tests/unit/features/chat/streamErrorNoticeSync.test.ts`
  - 新增作用域 catalog、provider probe、Windows transport / binary 解析，以及流错误 notice 保留的回归覆盖

### 🧠 架构变化

- 模型目录解析现在明确拆成三层：项目配置、当前目录 runtime provider 列表、继承层 / 默认作用域配置；`baseEffective` 与 `effective` 的职责边界更清楚了
- `OpenCodeService` 不再把“模型目录”“provider 宽目录”“解析配置”混在同一个接口语义里，设置页和调试链路因此能看到更接近 OpenCode CLI 的真实结果
- transport 层开始统一处理目录作用域 query，Windows 下 SDK / legacy HTTP 调试终于能稳定落在同一个 vault 上

### 🧪 当前验证

- 已通过：`npm run build`
- 已通过：`npm run test -- ModelConfigService modelConfig OpenCodeService ServerManager sdkFetch OpenCodianSettings streamErrorNoticeSync`
- 已通过：`npm run lint`
- 已通过：`npm run check:devlog-order`
- 已部署测试库并确认 `C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\main.js` 包含 `BUILD_ID: main.202604080206`

## 2026-04-07 优化模型配置编辑器与目录感知 catalog 行为

### 🎯 改动目标

- 让模型配置相关设置在大 catalog 和多 provider 场景下更易筛选、编辑和回看
- 修复读取服务端模型目录时被当前 vault `.opencode` 配置污染的问题，避免“服务端 catalog 看起来不完整”
- 提升模型配置写入与退出流程的稳健性，减少误关闭或覆盖失败带来的排障成本

### ✅ 本轮调整

- `src/features/settings/OpenCodianSettings.ts`
- `src/features/settings/ModelPickerModal.ts`
- `src/features/settings/modelPicker.ts`
- `src/features/settings/searchInputEnhancer.ts`
- `styles.css`
  - 模型可用范围区新增 `仅显示已启用` 过滤、禁用视图、卡片式 catalog 摘要切换和更明确的服务端状态联动
  - 模型 picker 新增 provider 下拉过滤、搜索清空按钮和最近搜索历史，提升大模型列表下的定位效率
  - 设置页记住模型可用范围 / 工具区折叠状态，并为相关控件补齐交互样式与响应式细节

- `src/features/settings/ModelConfigModal.ts`
- `src/features/settings/ModelConfigJsonModal.ts`
- `src/core/types/settings.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
  - 可视化模型配置编辑器重组为更清晰的分段结构，并新增 provider 接口格式预设与自定义 npm 支持
  - provider id 新增格式校验，新增未保存改动确认，避免误关 modal 丢失编辑内容
  - JSON 编辑器与可视化编辑器保存时改为仅落盘配置，不额外触发重复同步

- `src/core/config/ModelConfigService.ts`
- `src/core/config/OpencodeConfigManager.ts`
- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/ServerManager.ts`
- `src/main.ts`
  - SDK 拉取原始服务端 catalog 时支持跳过 `directory`，确保服务端模型列表不再被 vault 级 project config 过滤
  - 本地托管 server 启动时不再注入 provider 白名单环境变量，保留 OpenCode 自身对 project config 的处理
  - `.opencode` 配置写入改为临时文件 + rename 的原子写入，并补充 catalog / spawn 相关调试日志

- `docs/modules/core/types/settings.md`
- `docs/modules/features/settings/ModelConfigJsonModal.md`
- `docs/modules/features/settings/ModelConfigModal.md`
- `docs/modules/features/settings/ModelPickerModal.md`
- `docs/modules/features/settings/OpenCodianSettings.md`
  - 同步补齐模型设置区、picker、编辑器和设置状态字段的模块文档

- `tests/unit/core/config/ModelConfigService.test.ts`
- `tests/unit/core/opencode/OpenCodeService.test.ts`
- `tests/unit/core/opencode/ServerManager.test.ts`
- `tests/unit/features/settings/OpenCodianSettings.test.ts`
  - 新增目录感知 catalog、server env、禁用视图与占位 provider 的回归覆盖

### 🧠 交互变化

- 模型搜索现在会保留最近输入记录，重新打开 picker 或可用范围搜索时可直接回用常见关键字
- 服务端 catalog 与禁用 catalog 被拆成更直观的摘要入口，便于快速区分“服务端可见”“当前生效”“被禁用”的来源
- 可视化模型配置 editor 在 provider 接口格式、默认模型与小模型设置上给出更明确的引导，减少手填出错概率

### 🧪 当前验证

- 已通过：`npm run test -- OpenCodeService ServerManager ModelConfigService OpenCodianSettings`
- 已通过：`npm run build`
- 已通过：`npm run check:devlog-order`
- 已部署测试库并确认 `C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\main.js` 包含 `BUILD_ID: main.202604071110`

## 2026-04-06 重构模型设置中心，并修复设置页图标渲染异常

### 🎯 改动目标

- 解决模型设置项信息密度过高、默认模型和标题模型在大 catalog 下难以使用的问题
- 把 provider / model 可用范围控制从“全量长列表”重组为更直观的模型管理中心
- 修复新设置页在运行时因 `setIcon` 未导入导致的模型区加载失败

### ✅ 本轮调整

- `src/features/settings/OpenCodianSettings.ts`
- `src/features/settings/ModelPickerModal.ts`
- `src/features/settings/modelPicker.ts`
- `styles.css`
  - 模型设置区重构为“常用 / 可用范围 / 工具与诊断”三段式布局
  - 默认聊天模型不再拆成 provider/model 两个普通下拉，改为共享的可搜索 picker
  - provider 可用范围管理改为折叠式分组，支持搜索、`仅显示已禁用`、来源 badge、状态 badge 和按需展开模型列表
  - icon cache、本地模型配置和 catalog 对比被移入默认收起的高级工具区
  - 补上设置页运行时对 `setIcon` 的导入，修复模型区渲染时报 `ReferenceError: setIcon is not defined`

- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
  - 更新模型设置快捷跳转说明
  - 新增模型中心、picker、provider 状态摘要、来源 badge、筛选器等中英文本案

- `docs/modules/features/settings/OpenCodianSettings.md`
- `docs/modules/features/settings/ModelPickerModal.md`
- `docs/modules/features/settings/index.md`
  - 补充新的模型设置信息架构说明
  - 新增共享模型 picker modal 的模块文档

- `tests/unit/features/settings/modelPicker.test.ts`
- `tests/unit/features/settings/OpenCodianConversationSettings.test.ts`
- `tests/unit/features/settings/OpenCodianSettings.test.ts`
  - 新增模型 picker helper 测试
  - 保持设置相关回归测试通过，覆盖新的标题模型 picker 数据层

### 🧠 交互变化

- 默认聊天模型和 AI 标题模型现在都走同一类搜索式弹层，搜索维度包含 provider 名称 / ID 与 model 名称 / ID
- provider 可用范围面板默认收起；只有展开 provider 或搜索命中时才渲染其模型列表，避免模型很多时把整个设置页拉得过长
- catalog 诊断从主操作流中后移，先看摘要卡片，再按需查看 local / server / effective 明细

### 🧪 当前验证

- 已通过：`npm run test -- modelPicker OpenCodianConversationSettings OpenCodianSettings`
- 已通过：`npm run build`
- 已通过：`npm run check:devlog-order`
- 已部署测试库并确认 `C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\main.js` 包含 `BUILD_ID: main.202604061628`

## 2026-04-06 新增模型可用范围管理，并补齐用户时间样式与标题模型回退

### 🎯 改动目标

- 让 OpenCodian 能在插件内直接控制哪些 provider / model 仍然可被选择，而不是只能被动接受本地或服务端 catalog
- 避免默认模型或 AI 标题模型被禁用后继续落到不可用状态，同时给用户消息底部时间行补齐独立的样式控制

### ✅ 本轮调整

- `src/core/config/modelConfig.ts`
- `src/core/config/ModelConfigService.ts`
- `src/core/config/index.ts`
  - 新增 `ModelReference` / `ResolvedModelSelection` 能力，以及 `formatModelReference()`、`collectConfiguredProviderIds()`、`isProviderEnabled()`、`setProviderEnabled()`、`filterCatalog()`、`resolveModelSelection()` 等模型可用性辅助函数
  - `ModelConfigService.getCatalogs()` 现在同时返回 `baseEffective` 和过滤后的 `effective`：前者保留原始合并 catalog，后者再叠加本地 provider 开关与插件侧 `disabledModelRefs`
  - `getLocalProviderIds()` 改为遵守 `enabled_providers` / `disabled_providers` 白名单与黑名单逻辑，而不是只看 `provider` 字段是否存在

- `src/core/types/settings.ts`
- `src/core/types/index.ts`
- `src/main.ts`
  - 新增 `disabledModelRefs` 设置项及归一化逻辑，只保留合法的 `provider/model` 引用
  - 新增用户消息时间样式配置：`timeFontSize`、`timeFontWeight`、`timeColor`
  - 插件加载设置时开始持久化并恢复 `disabledModelRefs`，同时不再在服务端模型加载后强行覆写用户的默认 provider/model

- `src/features/settings/OpenCodianSettings.ts`
- `src/features/settings/ModelConfigModal.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
- `styles.css`
  - 模型设置区新增“提供商与模型可用范围”面板：provider 开关写回本地 `.opencode` 配置，model 开关保存在插件设置里
  - provider / model 下拉、标题模型下拉、图标缓存来源都会基于过滤后的有效 catalog 刷新，默认模型失效时会自动清空而不是悄悄回落到别的模型
  - 本地模型配置弹窗现在会保留并回写 `enabled_providers` / `disabled_providers`
  - 用户消息底部时间行新增独立字号、字重、颜色设置，并补齐对应样式变量与中英文本案

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/chatAppearance.ts`
  - 聊天视图加载模型时改为持有完整 `ModelCatalogBundle`，并在 UI 层区分“未配置 / 可用 / 不可用”三种状态
  - 当前会话模型若已被禁用或从有效 catalog 中移除，模型选择器会进入 `is-unavailable` 警示态，同时发送前会阻止请求并插入模型不可用 notice
  - 上下文使用环、模型显示文本、tooltip 等会优先读取解析后的模型名称，避免 catalog 过滤后丢失基本展示信息
  - 收敛助手最终同步调试日志，只保留关键阶段和按阈值输出的流式进度日志，降低高频噪音

- `src/features/chat/services/TitleGenerationService.ts`
- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/ServerManager.ts`
  - AI 标题模型若被禁用或不在有效 catalog 中，标题生成会自动回退到当前会话模型，而不是继续请求失效模型
  - `OpenCodeService.autoFetchModels()` 改成只通知模型刷新，不再擅自改写默认 provider/model
  - `ServerManager` 在 local source mode 下生成 `OPENCODE_CONFIG_CONTENT` 时，也会遵守 provider 白名单 / 黑名单结果

- `tests/unit/core/config/ModelConfigService.test.ts`
- `tests/unit/core/config/modelConfig.test.ts`
- `tests/unit/core/opencode/ServerManager.test.ts`
- `tests/unit/core/types/settings.test.ts`
- `tests/unit/features/chat/TitleGenerationService.test.ts`
- `tests/unit/features/chat/chatAppearance.test.ts`
  - 新增 base/effective catalog 拆分、provider 开关规则、disabled model 过滤、失效标题模型回退、用户时间样式变量，以及 local-only server config 过滤等回归测试

### 🧠 架构变化

- 模型 catalog 现在不再只有一个“最终结果”概念，而是拆成：
  - `baseEffective`：按 local / server / merge source mode 解析后的基础有效 catalog
  - `effective`：在 `baseEffective` 之上继续叠加本地 provider 开关和插件侧 model 禁用列表后的最终可选 catalog
- 这意味着模型选择、标题生成、图标缓存、ServerManager 本地环境生成和设置 UI 都需要明确区分“基础 catalog 仍然认识这个模型”与“当前 UI 允许用户继续选择这个模型”这两个层次

### 🧪 当前验证

- 已通过：`npm run check:devlog-order`
- 已通过：`npm test -- tests/unit/core/config/ModelConfigService.test.ts tests/unit/core/config/modelConfig.test.ts tests/unit/core/opencode/ServerManager.test.ts tests/unit/core/types/settings.test.ts tests/unit/features/chat/TitleGenerationService.test.ts tests/unit/features/chat/chatAppearance.test.ts`
- 已通过：`npm run build`（`BUILD_ID: main.202604061034`）
- 已部署：`dist/main.js`、`dist/manifest.json`、`dist/styles.css` 已复制到 Test Vault，并确认插件端 `main.js` 含最新 `BUILD_ID: main.202604061034`
- 未执行：完整 Jest 测试套件

## 2026-04-05 修正助手最终同步重复/丢块问题，并优化样式数值控件交互

### 🎯 改动目标

- 修正助手消息在流式结束后的最终同步阶段，被更“薄”的服务端消息覆盖后出现文本重复、工具块丢失或内部 StructuredOutput 工具暴露的问题
- 让样式设置里的数值控件支持自由小数输入，拖动滑块时只更新显示、不在拖动过程中频繁提交设置

### ✅ 本轮调整

- `src/shared/toolExecution.ts`
- `src/shared/index.ts`
  - 新增 `isInternalStructuredOutputTool()`，统一识别 `StructuredOutput` / `structured_output` 一类内部工具名，供服务层、流式渲染层和聊天 UI 共用

- `src/core/opencode/OpenCodeService.ts`
  - 在 SDK 流事件处理里忽略内部 StructuredOutput 工具事件，避免把内部结构化输出流程当成普通工具调用渲染到聊天区
  - 对 `message.part.updated` / `message.part.delta` 增加 `part.sessionID` 过滤，防止跨 session 事件串入当前会话
  - 在 `openCodeMessageToChatMessage()` 中过滤内部 StructuredOutput tool part，但继续保留 `info.structured` 里的结构化结果
  - 补充助手最终收尾链路的调试日志，便于定位“流里看到的内容”和“最终落库/同步回来的内容”之间的差异

- `src/utils/streaming/StreamController.ts`
- `src/utils/streaming/types.ts`
  - 流式渲染阶段跳过内部 StructuredOutput 工具
  - 为 `tool_use` 但未收到 `tool_result` 的工具调用补上持久化兜底，在 `done` / timeout 收尾时也能保留工具块顺序和状态
  - 增加流式文本、工具块落盘和完成阶段的调试信息，帮助对齐前端渲染态与最终消息态

- `src/features/chat/renderGroups.ts`
- `src/features/chat/OpenCodianView.ts`
  - 合并助手消息时对相邻重复文本去重，避免同一答案既来自 content block 又来自 fallback content 时被重复拼接
  - 在会话同步合并时优先保留本地更丰富的助手 `contentBlocks`、`toolCalls`、`structured` 和 `parts`，只在文本签名不一致时才让服务端结果覆盖
  - 为加载会话、前台后台同步、发送收尾同步增加 reason tracing，并把发送收尾阶段的同步锁与尾部 rerender 日志补齐，降低后续排查成本
  - 渲染消息内容时跳过内部 StructuredOutput 工具块，不再把结构化输出内部步骤显示给用户

- `src/features/settings/OpenCodianSettings.ts`
  - 数字输入框改为 `step="any"`，允许输入 `8.35` 这类自由小数值
  - 为数值输入增加“未完成草稿”识别，像 `8.`、`-` 这类输入中间态不再被立即打断或重置
  - 滑块拖动时只刷新显示，等 `change` 再真正提交，减少拖动过程中的连续设置写入
  - 拆出通用的数值 clamp / precision 处理，避免以最小步长为 1 时把合法小数重新吸回整数步长

- `tests/unit/core/opencode/OpenCodeService.test.ts`
- `tests/unit/features/chat/conversationSyncMerge.test.ts`
- `tests/unit/features/chat/renderGroups.test.ts`
- `tests/unit/features/settings/OpenCodianStyleSettings.test.ts`
- `tests/unit/utils/streaming/StreamController.test.ts`
  - 补充内部 StructuredOutput 过滤、跨 session 事件忽略、助手同步保留富内容块、相邻重复文本去重、未完成工具调用持久化，以及数值控件自由输入/拖动提交时机等回归测试

### 🧠 问题根因

- StructuredOutput 在 OpenCode 里本质上是内部结构化输出辅助工具，但旧链路会把它一路透传到 SDK 流事件、持久化消息和 UI 渲染层，结果就是聊天区里会混入本不该展示的内部工具步骤
- 助手流结束后，前端本地已经收集到了更丰富的 `contentBlocks` / `toolCalls`，但随后会话同步如果拿到的是“只有纯文本”的服务端消息，旧合并逻辑会直接覆盖本地 richer state，最终表现成尾部消息降级、重复或丢块
- 样式设置的数值控件以前在 `input` 阶段就按步长提交，既打断了自由小数输入，也会在滑块拖动过程中产生大量不必要的设置写入

### 🧪 当前验证

- 已通过：`npm run check:devlog-order`
- 已通过：`npm test -- tests/unit/core/opencode/OpenCodeService.test.ts tests/unit/features/chat/conversationSyncMerge.test.ts tests/unit/features/chat/renderGroups.test.ts tests/unit/features/settings/OpenCodianStyleSettings.test.ts tests/unit/utils/streaming/StreamController.test.ts`
- 已通过：`npm run build`（`BUILD_ID: main.202604051821`）
- 已部署：`dist/main.js`、`dist/manifest.json`、`dist/styles.css` 已复制到 Test Vault，并确认插件端 `main.js` 含最新 `BUILD_ID: main.202604051821`
- 未执行：完整 Jest 测试套件

## 2026-04-05 助手时间行样式拆分，并收敛设置页重开时的 Forced reflow

### 🎯 改动目标

- 给助手消息底部时间行补齐更细的样式控制，不再只靠单一的 metadata 字号和颜色一起驱动整行
- 修正样式设置里的颜色选择器提交时机，避免拖动过程中频繁写入设置
- 处理设置页“第一次打开正常、关闭后再次打开开始持续出现 forced reflow 提示”的问题，在不改功能的前提下降低 reopen 时的布局压力

### ✅ 本轮调整

- `src/core/types/settings.ts`
  - 为助手时间行新增 `timeFontSize`、`timeFontWeight`、`modelIdFontSize`、`modelIdFontWeight`
  - 扩展默认值与归一化逻辑，并让旧配置在缺少新字段时继续回退到原有 `metaFontSize`

- `src/features/chat/chatAppearance.ts`
  - 为助手时间文本和 provider/model 文本补充新的 CSS 变量输出

- `src/features/settings/OpenCodianSettings.ts`
  - 在样式设置中新增时间字号、时间字重、提供商/模型字号、提供商/模型字重控制项
  - 将颜色选择器从 `input` 改为 `change` 提交，并优先使用 `showPicker()`，减少颜色拖动过程中的连续设置写入
  - 收紧设置页滚动恢复逻辑：
    - 目标位置本来就是顶部时直接快速结束
    - 首帧已经恢复到目标滚动位时不再启动 `MutationObserver` 和多轮 timeout 跟踪
    - 只有初次恢复够不到目标位置时，才启用延期恢复追踪

- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
  - 补齐时间/模型字号与字重相关文案

- `styles.css`
  - 为助手时间文本和 provider/model 文本分别应用独立字号、字重变量
  - 调整时间行和 pending 占位高度计算，兼容拆分后的样式尺寸

- `tests/unit/core/types/settings.test.ts`
  - 补充新样式字段默认值、归一化和旧字段回退测试

- `tests/unit/features/chat/chatAppearance.test.ts`
  - 补充新的时间/模型样式变量输出断言

- `tests/unit/features/settings/OpenCodianSettings.test.ts`
  - 补充设置页滚动恢复快速路径与“首帧成功时不启用 DOM 跟踪”的回归测试

- `tests/unit/features/settings/OpenCodianStyleSettings.test.ts`
  - 补充颜色选择器只在确认后提交的回归测试

### 🧠 问题根因

- 设置页 reopen 的 forced reflow 主要不是“打开设置一定有问题”，而是“关闭后再次打开时”会带着上次滚动位置进入恢复流程
- 旧实现里，即使首帧已经成功恢复到目标位置，也会继续挂 `MutationObserver` 和多轮 timeout 盯着设置页 DOM；模型、插件、图标缓存等分区的异步刷新再叠加上去，就容易在控制台形成连续 forced reflow 提示
- 同时，颜色选择器如果在拖动过程中走 `input` 提交，也会把本来只是预览的操作放大成持续 UI 更新

### 🧪 当前验证

- 已通过：`npm test -- tests/unit/core/types/settings.test.ts tests/unit/features/chat/chatAppearance.test.ts tests/unit/features/settings/OpenCodianSettings.test.ts tests/unit/features/settings/OpenCodianStyleSettings.test.ts`
- 已通过：`npm run check:devlog-order`
- 已通过：`npm run build`（`BUILD_ID: main.202604051720`）
- 已部署：`dist/main.js`、`dist/manifest.json`、`dist/styles.css` 已复制到 Test Vault，并确认插件端 `main.js` 含 `BUILD_ID: main.202604051720`
- 未执行：完整 Jest 测试套件

## 2026-04-05 玻璃正八面体实验演示接入，并把助手流式渲染修正为节流版实时 markdown

### 🎯 改动目标

- 为聊天区域补一个可独立切换的玻璃正八面体实验演示，便于继续验证折射、位移贴图和降级策略
- 修正上一版“助手流式阶段只显示轻量文本、结束后才完整 markdown 渲染”的实现偏差，恢复边生成边渲染的设计初衷
- 在保留流式可读性的同时，继续压住频繁整块重绘带来的抖动和滚动回弹

### ✅ 本轮调整

- `src/main.ts`
  - 新增 `toggle-glass-octahedron` 命令，并通过 `toggleGlassOctahedronForCurrentView()` 转发到当前 `OpenCodianView`

- `src/features/chat/OpenCodianView.ts`
  - 接入 `GlassOctahedronDemoController`，支持在消息区显示/隐藏玻璃正八面体实验层，并在视图销毁时做好清理
  - 保留助手消息流式态的 `is-streaming` 标记，以及流式期间跳过 pane 布局补偿滚动的收敛逻辑

- `src/features/chat/glassOctahedronDemo.ts`
  - 新增实验控制器，负责 overlay / host / stage / caustic / refraction / canvas / SVG filter defs 的生命周期
  - 支持拖拽、惯性、回弹、idle 动画、settled 渲染与慢帧检测后的质量降级

- `src/features/chat/glassOctahedronDemoRefraction.ts`
  - 新增正八面体投影、折射采样、位移快照、backdrop-filter 能力探测与 fallback 构建逻辑

- `src/features/chat/glassOctahedronDemoThree.ts`
  - 新增 three.js 渲染层，负责正八面体玻璃材质、fresnel 外壳、环境布光与 pose 到投影上下文的桥接

- `src/vendor/three.ts`
  - 新增本地 vendor barrel，统一从仓库内 `reference-projects/three.js` 暴露当前实验所需的 three.js 符号

- `src/utils/streaming/StreamController.ts`
  - 将流式文本更新改为“节流版实时 markdown 渲染”：首段立即渲染，后续按最小时间间隔刷新，而不是拖到 `done` 才统一渲染
  - 新增最近一次文本渲染时间与内容追踪，避免流式过程中无意义的重复最终 render
  - 为流式 markdown 更新增加最小高度保护，减少单次刷新时“先塌再长”的回弹感

- `src/utils/markdown/MarkdownRenderer.ts`
  - 将 markdown 更新改为离屏渲染后一次性替换到目标节点，避免在可见节点上先 `empty()` 再重建整块 DOM

- `styles.css`
  - 新增玻璃正八面体实验层样式，包括 overlay、host、stage、caustic、refraction、canvas 与 filter defs
  - 保留助手消息在 `is-streaming` 状态下关闭动画和内容过渡的样式，继续减轻流式阶段抖动
  - 调整时间行 pending 占位高度，使最终显示时间/模型/复制按钮时的高度跃迁更小

- `tests/unit/features/chat/glassOctahedronDemo.test.ts`
  - 新增实验 demo 单测，覆盖 overlay 构建、质量分层、拖拽与回退行为

- `tests/unit/main.test.ts`
  - 新增插件命令转发测试，确认 `toggleGlassOctahedronForCurrentView()` 会激活视图并调用当前聊天视图方法

- `tests/unit/utils/streaming/StreamController.test.ts`
  - 将回归测试更新为“流式过程中会持续渲染 markdown，同时对快速 chunk 做节流”

- `tests/unit/features/chat/liquidDiamondDemo.test.ts`
  - 调整现有动画帧断言，兼容当前实验渲染调度节奏

### 🧠 最终实现取舍

- 这次对流式渲染的最终取舍是：
  - 不接受“只在流结束后才完整渲染”的方案，因为这违背了聊天消息的实时阅读体验
  - 也不回退到“每个 token / 每帧都整块 markdown 重绘”的方案，因为这会重新放大抖动与回流压力
  - 当前采用“实时 markdown + 节流刷新 + 流式态禁用多余动画 + 流式期间抑制补偿滚动”的折中路线

### 🔍 后续收敛

- `src/features/chat/OpenCodianView.ts`
  - 将流式链路里的自动滚动从“延后补滚”收敛为“内容更新后立即锁到底部”，减少视口追内容时的补偿跳动
  - 调整助手完成时的时间行填充顺序，先在内存中组装完整行，再一次性替换进 DOM，避免“空时间行先出现再补全”的闪烁
  - 对流结束后的服务端同步补丁增加正文签名判断：若变化只在 `timestamp`、`modelId` 或状态标签等尾部元信息，则只更新时间行，不再清空并重绘整个助手正文

- 当前根因判断：
  - 早期抖动主要来自流式 markdown 重绘与自动滚动补偿叠加
  - 完成瞬间的“消失再出现”则更像来自服务端同步后尾消息补丁对正文执行了 `empty()` + 重渲染

### 🧪 当前验证

- 已通过：`node scripts/run-jest.js tests/unit/utils/streaming/StreamController.test.ts`
- 已通过：`node scripts/run-jest.js tests/unit/utils/markdown/MarkdownRenderer.test.ts tests/unit/utils/streaming/StreamController.test.ts`
- 已通过：`npm run build`（`BUILD_ID: main.202604051417`）
- 已部署：`dist/main.js`、`dist/manifest.json`、`dist/styles.css` 已复制到 Test Vault，并确认插件端 `main.js` 含 `BUILD_ID: main.202604051417`
- 待补充：本轮未为“完成瞬间仅补时间行、不重绘正文”的尾补丁分支单独新增自动化测试

## 2026-04-05 助手流式消息抖动收敛，减少流式阶段重排与滚动回弹

### 🎯 改动目标

- 处理助手消息在流式生成过程中持续“上下抖动”、结束落定后仍有明显跳动的问题
- 在保留现有消息持久化结构与最终 markdown 渲染结果的前提下，优先降低流式阶段的 DOM 重建和滚动干扰
- 尽量用小范围修补方式改善长回复阅读观感，不扩散到无关聊天功能

### ✅ 本轮调整

- `src/utils/streaming/StreamController.ts`
  - 将流式文本阶段从“每帧整块 markdown 重渲染”改为“先写入轻量 live text 预览，分段切换或完成时再做一次 markdown render”
  - 新增 `streaming-text-block--live` 流式态标记，避免 token 高频到达时不断 `empty()` 容器并重建整段 DOM
  - 把 `text` chunk 的滚动跟随改到实际文本内容更新后触发，并在 `thinking`、`tool_use`、`error`、`done` 前先 finalize 当前文本块

- `src/features/chat/OpenCodianView.ts`
  - 在流式中的 tab 上，阻止 `MutationObserver` / `ResizeObserver` 驱动的补偿式“settled scroll to bottom”反复插队
  - 为流式创建的助手消息添加 `is-streaming` 标记，等时间戳与复制按钮补齐后再移除，便于样式侧关闭流式态动画

- `styles.css`
  - 关闭助手消息在 `is-streaming` 状态下的入场动画与内容过渡，减少生成中和最终落定瞬间的视觉跳动
  - 为 `.streaming-text-block--live` 增加 `white-space: pre-wrap` 与断词规则，保证流式预览阶段排版稳定

### 🧠 问题根因

- 之前虽然已经把连续 text chunk 合并到“每帧最多一次 markdown render”，但那次 render 依然会完整清空并重建当前文本块 DOM
- 同时，消息列表的布局观察器还会在流式期间不断触发二次滚底；浏览器滚动锚定、容器高度变化和自动滚动叠加后，就会表现成持续细抖
- 结束生成时，助手气泡还会从流式态切到最终态，如果动画和过渡还在生效，会进一步放大“最后落一下”的感觉

### 🧪 当前验证

- 已通过：`npm run check:devlog-order`
- 已通过：`npm run build`（`BUILD_ID: main.202604051323`）
- 已部署：`dist/main.js`、`dist/manifest.json`、`dist/styles.css` 已复制到 Test Vault，并确认插件端 `main.js` 含 `BUILD_ID: main.202604051323`
- 未执行：完整 Jest 测试套件

## 2026-04-05 助手流式生成时合并文本 markdown 重渲染，缓解 Forced reflow 警告

### 🎯 改动目标

- 排查“助手消息生成过程中”控制台持续刷出 `[Violation] Forced reflow while executing JavaScript` 的原因
- 优先处理最明显的热点，避免流式 token 高速到达时每个 chunk 都触发一次完整 markdown 重绘
- 在不改写现有消息结构和持久化格式的前提下，尽量用最小改动先把回流压力降下来

### ✅ 本轮调整

- `src/utils/streaming/StreamController.ts`
  - 将流式 `text` chunk 的渲染方式从“每个 chunk 立刻完整 render 一次 markdown”改为“按帧合并后再 render”
  - 新增 `textRenderRequested`、`textRenderFrameId`、`textRenderInFlight`，把同一帧内连续到达的文本更新折叠成一次渲染
  - 在切换到 `thinking`、`tool_use`、`error`、`done` 前先 flush 挂起的文本 render，避免最终内容遗漏或顺序错乱
  - 在 `cancelStream()` 和 `timeoutStream()` 时清理挂起帧，避免中断后残留异步 render 再次触发 UI 更新

- `tests/unit/utils/streaming/StreamController.test.ts`
  - 保留原有 finalized thinking duration 与 interrupted text 持久化回归测试
  - 新增“连续快速 text chunk 会在完成前合并成一次 markdown render”的回归测试，覆盖这次节流逻辑

### 🧠 问题根因

- 之前助手流式输出时，`StreamController.handleTextChunk()` 每收到一个文本 chunk，就会立刻调用一次 `MarkdownRenderService.render()`
- `MarkdownRenderService.render()` 内部会先 `empty()` 容器，再让 Obsidian markdown renderer 完整重建这一整段文本的 DOM
- 当模型连续高速输出 token 时，这条链会变成：
  - 文本追加
  - 整段 markdown 重渲染
  - 自动滚动与尺寸读取继续跟进
  - 下一批 token 再次重复
- 结果就是消息越长、chunk 越密，主线程上的布局与重绘压力越高，最终在控制台表现为成片的 forced reflow violation

### 🧪 当前验证

- 已通过：`node scripts/run-jest.js tests/unit/utils/streaming/StreamController.test.ts`
- 已通过：`node scripts/run-jest.js tests/unit/utils/markdown/MarkdownRenderer.test.ts`
- 已通过：`npm run check:devlog-order`
- 已通过：`npm run build`（`BUILD_ID: main.202604051311`）
- 已部署：`dist/main.js`、`dist/manifest.json`、`dist/styles.css` 已复制到 Test Vault，并确认插件端 `main.js` 含 `BUILD_ID: main.202604051311`

## 2026-04-04 聊天自动滚动状态机收口到现有导航按钮，并修复主题预设类型检查

### 🎯 改动目标

- 按“在底部时自动跟随、向上浏览时不打断”的规则，收敛聊天区现有自然滚动逻辑
- 不新增重复 UI，直接复用现有导航栏“跳到底部”按钮来恢复自动滚动
- 修复 `src/core/theme/index.ts` 在 `npm run typecheck` 下的预设与 diff helper 类型报错

### ✅ 本轮调整

- `src/features/chat/autoScrollState.ts`
  - 新增独立的滚动状态 helper，集中管理 near-bottom 阈值、用户滚动意图、programmatic scroll guard 和 smooth/instant guard 时长

- `src/features/chat/OpenCodianView.ts`
  - 将聊天自动滚动状态提升为 tab 级 runtime 字段，分别记录 `autoScrollEnabled`、`isNearBottom` 与 `programmaticScrollGuardUntil`
  - 为每个消息 pane 接入 `scroll`、`MutationObserver` 和 `ResizeObserver`，让流式输出、增量渲染、重载恢复、composer 高度变化和内容尺寸变化都走同一套自动滚动判断
  - 用户发送新消息时强制回到底部并恢复自动滚动；用户手动上滑时停用自动滚动；用户重新回到底部时恢复
  - 删除额外新增的浮动“回到底部”按钮，改为复用现有导航栏底部按钮来触发“恢复自动滚动 + smooth 滚到底部”

- `src/features/chat/ui/NavigationSidebar.ts`
  - 为底部按钮新增可选 `onScrollToBottom` 回调，优先让宿主视图决定“滚到底部”的真实行为

- `src/core/theme/index.ts`
  - 将 `BUILTIN_THEME_PRESETS` 显式声明为 `ThemePresetDefinition[]`，避免空 `cssVariables` 触发联合类型推断并把值错误收窄为 `string | undefined`
  - 将 `diffObject` 的泛型约束从 `Record<string, unknown>` 放宽为 `object`，使 chat appearance 子配置接口可以直接参与差异提取

- `tests/unit/features/chat/autoScrollState.test.ts`
  - 补充 near-bottom 阈值、用户上滑关闭自动滚动、回到底部恢复自动滚动、被动布局测量不改写用户意图、programmatic guard 判定的回归测试

- `tests/unit/features/chat/NavigationSidebar.test.ts`
  - 新增“存在 `onScrollToBottom` 时优先调用宿主回调而不是直接 `scrollTo`”的回归测试

### 🧪 当前验证

- 已通过：`npm test -- tests/unit/features/chat/NavigationSidebar.test.ts tests/unit/features/chat/autoScrollState.test.ts`
- 已通过：`npx eslint src/features/chat/OpenCodianView.ts src/features/chat/ui/NavigationSidebar.ts tests/unit/features/chat/NavigationSidebar.test.ts`
- 已通过：`npm run typecheck`
- 已通过：`npm run check:devlog-order`
- 已通过：`npm run build`（`BUILD_ID: main.202604042313`）
- 已部署：`dist/main.js`、`dist/manifest.json`、`dist/styles.css` 已复制到 Test Vault，并确认插件端 `main.js` 含 `BUILD_ID: main.202604042313`

## 2026-04-04 待办 stale 状态跨重载保持抑制，避免旧快照短暂复活

### 🎯 改动目标

- 查清输入框上方 session todo dock 为什么会在“已降级为过期”后，刷新页面又短暂重新出现，过几分钟再消失
- 结合最新参考项目 `reference-projects/opencode`，确认 `session.todo()`、`todo.updated`、`session.status()` 和前端 live 判定的真实语义
- 在不改成“直接清空 todo 缓存”的前提下，让 OpenCodian 现有的 stale notice + suppress 方案跨重载保持一致，不再让同一份旧待办反复复活

### ✅ 本轮调整

- `reference-projects/opencode/packages/app/src/pages/session/composer/session-composer-state.ts`
- `reference-projects/opencode/packages/app/src/context/sync.tsx`
- `reference-projects/opencode/packages/app/src/context/global-sync/event-reducer.ts`
- `reference-projects/opencode/packages/sdk/js/src/v2/gen/types.gen.ts`
  - 对照参考项目确认：SDK 侧 `session.todo()` / `todo.updated` 只提供待办快照，真正决定“待办是否还该继续显示”的是前端基于 `session.status()` 和 blocked 状态计算出来的 `live`
  - 参考项目在 `count > 0 && !live` 时直接 `clear()` todo，本质上是不允许非活跃会话长期挂着旧待办

- `src/features/chat/OpenCodianView.ts`
  - 新增“从已持久化 stale notice 恢复 session todo suppression”的逻辑
  - 当会话里已经存在同一份 `chat.todo.staleTitle` notice，而且当前收到的 todo 指纹与该 notice 内容匹配时，重载后不再把这份旧 snapshot 当成新更新重新显示
  - 把 notice 匹配 helper 扩展为可指定 conversation，方便 active tab / 非 active tab 共用同一套持久 notice 复用逻辑
  - 保持现有语义不变：只有 session 重新 live，或 todo snapshot 真正变化，才清除 suppression

- `tests/unit/features/chat/staleSessionTodoState.test.ts`
  - 保留原有“长时间无活动后 suppress stale incomplete todos”的回归测试
  - 新增“reload 后如果同一份 stale notice 已持久化，则旧 todo snapshot 继续隐藏”的回归测试

### 🧠 问题根因

- OpenCodian 之前的逻辑是：
  - 先把 stale 未完成待办隐藏，并写入一条持久 notice
  - 但 reload 时 runtime 会先清空，再重新拉 `session.status()` / `session.todo()`
  - 如果服务端仍返回同一份旧 todo snapshot，插件会把它当成“新鲜数据”重新渲染，因为 `sessionTodoLastChangedAt` 被刷新了
  - 结果就是待办面板短暂复活，直到下一轮 stale timeout 再被隐藏一次

- 这次修复后：
  - 持久 notice 本身就作为“这份 todo 已经判 stale”的跨重载证据
  - 所以 reload 收到同一份旧 snapshot 时，会直接恢复 suppression，不再出现“先回来、再消失”的抖动

### 🧪 当前验证

- 已通过：`npm test -- staleSessionTodoState`
- 已通过：`npm test -- backgroundTaskNoticeDedup`
- 已通过：`npm test -- SessionTodoDock`
- 已通过：`npm run check:devlog-order`
- 已通过：`npm run build`（`BUILD_ID: main.202604042241`）
- 已部署：`dist/main.js`、`dist/manifest.json`、`dist/styles.css` 已复制到 Test Vault，并确认插件端 `main.js` 含 `BUILD_ID: main.202604042241`

## 2026-04-04 钻石 WebGL 命令分流、补充控制台诊断，并将命令名称统一汉化

### 🎯 改动目标

- 保留原有 CPU 钻石演示命令，同时新增独立的 WebGL 对照命令，方便在同一插件里直接比较两种渲染路径
- 在 WebGL 初始化链路里补充更细的控制台诊断，快速区分“环境不支持 WebGL2”和“shader / program 初始化失败”
- 将插件里现有英文命令名称统一翻译为中文，减少命令面板中的中英混杂

### ✅ 本轮调整

- `src/main.ts`
  - 新增 `toggle-liquid-diamond-demo-webgl` 命令，和原 CPU 钻石命令并行保留
  - 将现有命令名称统一改为中文
  - 顺手把 ribbon 提示和 inline edit 的临时 Notice 改成中文

- `src/features/chat/OpenCodianView.ts`
  - 为钻石演示增加 CPU / WebGL 双控制器入口
  - 切换某一条演示命令时会自动销毁另一条，避免两个 overlay 同时叠加
  - WebGL 初始化失败时，提示用户去开发者控制台查看具体原因

- `src/features/chat/liquidDiamondDemo.ts`
  - 让现有浮动钻石 demo controller 支持 `cpu` / `webgl` 两种后端
  - WebGL 命令不再静默回退到 CPU，避免影响效果对照

- `src/features/chat/liquidDiamondDemoWebgl.ts`
  - 新增独立 WebGL2 displacement renderer
  - 将位移图编码范围改为自适应估算，减少固定范围导致的量化浪费
  - 增加 WebGL2 context / API surface / shader 初始化日志
  - 修复 GLSL 常量插值时整数被写入 `float` 常量定义，导致 shader 编译失败的问题

- `tests/unit/features/chat/liquidDiamondDemo.test.ts`
- `tests/unit/main.test.ts`
  - 补充 WebGL 命令转发、WebGL mock 挂载，以及双命令分流的回归测试

### 🧪 当前验证

- 已通过：`npx jest tests/unit/features/chat/liquidDiamondDemo.test.ts tests/unit/main.test.ts --runInBand`
- 已通过：`npm run check:devlog-order`
- 已通过：`npm run build`（`BUILD_ID: main.202604042125`）
- 已部署：`dist/main.js`、`dist/manifest.json`、`dist/styles.css` 已复制到 Test Vault，并确认插件端 `main.js` 含 `BUILD_ID: main.202604042125`

## 2026-04-04 下沉 Prompt 选项、标题结构化输出，并默认启用 SDK Questions

### 🎯 改动目标

- 让 `OpenCodeService` 的本地 facade 不再只支持 provider/model/tools/context，而是补齐上游已稳定的 `agent`、`format`、`noReply` prompt 能力
- 让会话标题生成优先消费结构化输出，避免继续完全依赖“读取纯文本第一行”的脆弱解析路径
- 把 `sdkQuestions` rollout 默认打开，同时继续保留现有 legacy `/question` fallback，降低切换风险

### ✅ 本轮调整

- `src/core/opencode/types.ts`
  - 为本地 query 层新增 `LocalOutputFormat`
  - 扩展 `QueryOptions`，补入 `agent`、`noReply`、`format`

- `src/core/opencode/OpenCodeService.ts`
  - 新增共享 prompt 选项归一化逻辑，把 `system` / `tools` / `variant` / `agent` / `noReply` / `format` 同时映射到 SDK 与 legacy prompt 请求
  - 让 `requestAssistantResponse()` 与 `sendMessage()` 两条链路都支持新的 prompt 选项
  - 在 assistant 消息归一化时保留 `structured` payload，同时不改变原有 text / thinking / tool / OMO / context attachment 处理

- `src/core/types/chat.ts`
  - 为 `ChatMessage` 新增可选 `structured` 字段，承接 assistant 的结构化结果

- `src/features/chat/services/TitleGenerationService.ts`
  - 标题生成改为优先请求 `json_schema` 输出，目标结构固定为 `{ title: string }`
  - 解析顺序改为 structured title 优先，纯文本 `parseTitle()` 作为 fallback
  - 继续保留现有标题清理、截断、标点收尾与临时 session 清理逻辑

- `src/core/opencode/sdkFeatureFlags.ts`
  - 将 `sdkQuestions` 加入运行时默认 rollout

- `tests/unit/core/opencode/OpenCodeService.test.ts`
- `tests/unit/features/chat/TitleGenerationService.test.ts`
  - 补齐 SDK questions 优先/回退、prompt 参数映射、structured message 保留、标题生成 structured 优先与 fallback 行为的单测

### 🧪 当前验证

- 已通过：`node scripts/run-jest.js tests/unit/core/opencode/OpenCodeService.test.ts tests/unit/features/chat/TitleGenerationService.test.ts`
- 已通过：`npx eslint src/core/opencode/types.ts src/core/types/chat.ts src/core/opencode/OpenCodeService.ts src/core/opencode/sdkFeatureFlags.ts src/core/opencode/index.ts src/features/chat/services/TitleGenerationService.ts tests/unit/core/opencode/OpenCodeService.test.ts tests/unit/features/chat/TitleGenerationService.test.ts`
- 已通过：`npm run build`（`BUILD_ID: main.202604042059`）
- 已部署：`dist/main.js`、`dist/manifest.json`、`dist/styles.css` 已复制到 Test Vault，并确认插件端 `main.js` 含 `BUILD_ID: main.202604042059`
- 已知阻塞：`npm run typecheck` 仍被仓库中既有的 `src/core/theme/index.ts` 类型错误拦住，本轮未扩散该问题

## 2026-04-04 模块文档 review 收口：统一配置路径、修正事实偏差、提交并行工作流

### 🎯 改动目标

- 汇总 6 个文档 worker 的产出，把 `docs/modules/` 从“批量填充完成”推进到“可进入 reviewer 完成态检查”
- 修正 reviewer spot-check 中确认的事实偏差，尤其是 OpenCode 配置文件路径、schema 示例、以及 settings 文档里的配置写入边界
- 让 `[REVIEW]` 状态与文档内容保持一致，不再保留明显未完成的“待补充”章节或 checklist 口吻

### ✅ 本轮调整

- `docs/modules/_WORKFLOW.md`
  - 新增文档并行填充与增量更新 workflow
  - 记录 6 worker 拆分、5 worker 合并方案、reviewer 波次职责，以及按 git diff 反推文档更新目标的流程

- `docs/modules/README.md`
  - 把 `_WORKFLOW.md` 纳入文档元信息
  - 依据当前源码树修正模块文档总数
  - 移除已不存在的 `liquidDiamondDemoWebgl.md` 目录项，并补充 workflow 入口说明

- `docs/modules/core/**/*.md`、`docs/modules/entry-point/main.md`
  - 六个 worker 负责范围内的模块文档批量从 `[DRAFT]` 收口到 `[REVIEW]`
  - 补全文档职责、导出面、关键类型、模块交互与实现约束

- `docs/modules/core/types/permission.md`
  - 把配置文件路径从旧的 `.opencode/config.json` 更正为源码实际使用的 `.opencode/opencode.json`

- `docs/modules/core/types/opencodeConfig.md`
  - 把配置文件路径统一更正为 `.opencode/opencode.json`
  - 修正“所有接口都有索引签名”的错误描述，明确 `OpencodeModelConfigSubset` 仍是固定字段集合
  - 将示例 `$schema` 修正为当前代码实际写入的 `https://opencode.ai/config.json`

- `docs/modules/features/settings/ModelConfigJsonModal.md`
  - 明确该 modal 编辑的是同一份 `.opencode/opencode.json` 中的模型相关字段子集
  - 补充它与 `ModelConfigModal` 的覆盖关系和“后保存覆盖先保存”的风险

- `docs/modules/features/settings/OpencodeConfigModal.md`
  - 明确它与 `ModelConfigJsonModal` 操作的是同一个配置文件，而不是两个不同配置文件
  - 改为用“完整配置 / 模型子集”区分职责边界

- `docs/modules/features/chat/tabs/*.md`
- `docs/modules/features/chat/ui/*.md`
- `docs/modules/features/settings/*.md`
  - 把 `[REVIEW]` 文档里残留的 `## 待补充` 统一改成 `## 补充说明`
  - 去掉未完成 checklist 语气，改成完成态的事实补充，避免状态和内容自相矛盾

### 🧪 当前验证

- 已通过：`npm run check:devlog-order`
- 未运行：`npm run build`、`npm run test`
- 未部署：本轮为纯文档 / devlog 收口，无代码、样式、manifest 变更

## 2026-04-04 独立 Liquid Diamond Demo、旧主题迁移回 `preset`，并保留 `shudingDiamond` 为实验核心

### 🎯 改动目标

- 不再把 `liquid-diamond-shuding` 继续作为输入区正式主题保留，避免旧 vault 值落到已移除的主题路径后产生错误挂载或设置歧义
- 把钻石折射效果从“输入区主题”改成独立 demo：挂到 `messages shell` 上，可通过命令单独开关，不改写 composer 既有宽高、圆角和输入控件几何
- 预留 `shudingDiamond` 折射/几何计算核心与设置桶，便于后续实验复用，但暂时不注册进内置 liquid-glass adapter 下拉，避免未成熟实现提前暴露给普通用户

### ✅ 本轮调整

- `src/features/chat/liquidDiamondDemo.ts`
  - 新增独立 `LiquidDiamondDemoController`
  - 使用 CPU 侧钻石折射 tracing、位移图、bloom / rim / facet overlay 组合出可拖拽的浮动 demo
  - 支持 pointer capture、拖拽惯性回弹、resize 后重新约束位置，以及 `backdrop-filter: url(...)` 不可用时的 blur fallback

- `src/features/chat/OpenCodianView.ts`
  - 新增 `toggleLiquidDiamondDemo()` 与控制器生命周期清理
  - 将 demo 明确挂载到 `messagesShellEl`，不再侵入 composer shell
  - 输入区主题应用逻辑增加未知主题保护，遇到已删除的主题值时直接回落而不是继续尝试套 class

- `src/main.ts`
  - 注册 `Toggle diamond demo` 命令
  - 新增 `toggleLiquidDiamondDemoForCurrentView()`，在激活当前视图后把命令转发到 `OpenCodianView`

- `src/core/types/settings.ts`
  - 为 `inputPanelLiquidGlass` 新增 `shudingDiamond` 设置桶与默认值/归一化逻辑
  - 把历史 `inputPanelTheme = 'liquid-diamond-shuding'` 统一迁移回 `preset`

- `src/features/settings/OpenCodianSettings.ts`
  - liquid-glass adapter 映射的默认回落改为 `preset`
  - 保持设置页下拉只暴露正式支持的 `shuding` / `nikdelvin`，不把实验中的 diamond adapter 误显示成可选输入区主题

- `src/utils/glass/types.ts`
  - 扩展 `GlassEffectAdapter['id']` 联合类型，允许 `shudingDiamond` 作为独立实验 adapter / demo 核心复用

- `src/utils/glass/adapters/shudingDiamond.ts`
  - 新增独立的钻石折射核心实现，封装凸包、折射/反射、facet 投影、位移图生成和视觉层渲染
  - 继续保持其“可测试、可复用，但不进 builtin 注册表”的实验定位

- `styles.css`
  - 为 demo overlay / host / bloom / rim / canvas / stage 增加专用样式

- `tests/unit/features/chat/liquidDiamondDemo.test.ts`
- `tests/unit/utils/glass/shudingDiamond.test.ts`
- `tests/unit/main.test.ts`
- `tests/unit/main/themeSettingsMigration.test.ts`
- `tests/unit/core/types/settings.test.ts`
- `tests/unit/features/settings/OpenCodianStyleSettings.test.ts`
  - 补齐 demo 挂载位置、拖拽状态、命令转发、旧主题迁移、diamond 设置默认值，以及“实验 adapter 不进入设置 dropdown”的回归保护

### 🧪 当前验证

- 已通过：`npm run check:devlog-order`
- 已通过：`npm run test -- tests/unit/features/chat/liquidDiamondDemo.test.ts tests/unit/utils/glass/shudingDiamond.test.ts tests/unit/main.test.ts tests/unit/main/themeSettingsMigration.test.ts tests/unit/core/types/settings.test.ts tests/unit/features/settings/OpenCodianStyleSettings.test.ts`
- 已通过：`npm run build`（`BUILD_ID: main.202604041634`）
- 已完成：部署 `dist/main.js`、`dist/manifest.json`、`dist/styles.css` 到 Test Vault
- 已验证部署后的 `main.js` 包含 `BUILD_ID: main.202604041634`

## 2026-04-04 模块文档框架收口：补齐源码映射、统一状态标记、修正文档约定

### 🎯 改动目标

- 把 `docs/modules/` 从“基本骨架已建”推进到“与当前仓库真实结构一致”的状态
- 修复总索引、模板约定和实际文档树之间的偏差，避免后续继续出现 README 可见但文件不存在，或源码存在但文档缺失的问题
- 明确 `index.ts`、locale、types、demo 这类模块也属于文档覆盖范围，而不是只覆盖服务类文件

### ✅ 本轮调整

- `docs/modules/README.md`
  - 重写覆盖规则，明确 `src/**/*.ts` 原则上一一对应文档
  - 把 `index.ts`、`i18n/locales/*.ts`、demo/experimental 模块纳入正式覆盖策略
  - 更新完整目录树，使其与当前实际文档文件对齐
  - 补充状态标记规范与不同模块类型的写法建议

- `docs/modules/_TEMPLATE.md`
  - 保留统一骨架，但补充“按模块类型灵活填写”的说明
  - 明确类型文件、barrel 文件、locale 文件可以把“关键方法 / 数据流”改写为更贴切的内容
  - 统一状态值写法为 `[DRAFT]` / `[REVIEW]` / `[FINAL]`

- `docs/modules/_WORKFLOW.md`
  - 新增可直接分发给大模型的并行任务拆分方案
  - 记录 6 worker 推荐分组、5 worker 合并方案、统一提示词模板，以及按 git diff 做增量文档同步的流程

- 新增 21 篇缺失模块文档，覆盖此前未纳入框架的真实源码文件：
  - `core/*/index.ts` 系列 barrel 文档
  - `features/chat/index.ts`、`features/chat/tabs/index.ts`、`features/settings/index.ts`
  - `features/settings/ModelConfigModal.ts`
  - `features/chat/liquidDiamondDemo.ts`
  - `utils/index.ts`、`utils/icons/index.ts`、`utils/markdown/index.ts`、`utils/markdown/types.ts`、`utils/streaming/index.ts`
  - `i18n/locales/index.ts`、`i18n/locales/en.ts`、`i18n/locales/zh.ts`
  - `shared/index.ts`、`shared/modals/index.ts`

- `docs/modules/**/*.md`
  - 将已有文档中的裸 `DRAFT` 状态统一收口为 `[DRAFT]`

- `.gitignore`
  - 不再整段忽略 `docs/`
  - 改为只忽略 `docs/` 下非 `docs/modules/` 的内容，确保模块文档框架可以进入版本控制

- 校验收口
  - 按当前工作区再次核对时，`src/features/chat/liquidDiamondDemoWebgl.ts` 已不存在，因此未继续保留对应的一对一文档映射

### 🧪 当前验证

- 已通过：脚本比对 `src/**/*.ts` 与 `docs/modules/**/*.md` 后，缺失源码文档数为 `0`
- 已通过：`docs/modules` 状态标记统一为 `[DRAFT]`
- 已通过：`README` 当前基线与目录树和实际文件结构一致

## 2026-04-04 `Liquid Glass -> Shuding` 设置增加问号大白话帮助

### 🎯 改动目标

- 让普通用户在调整 `Liquid Glass -> Shuding` 参数时，不必先理解 `SDF`、`barrel distortion`、`contrast boost` 这类技术词
- 在不改动 `nikdelvin` 和其他设置分组的前提下，为 `shuding` 参数补一个可点击的问号帮助入口
- 保持这次改动只影响设置可理解性，不改变既有默认值、输入区尺寸语义和主题挂载逻辑

### ✅ 本轮调整

- `src/features/settings/OpenCodianSettings.ts`
  - 给 `shuding` 的 toggle / dropdown / text / numeric 控件统一接入 `help-circle` 按钮
  - 帮助按钮只在 `adapterId === 'shuding'` 时出现，避免把 `nikdelvin` 和其他设置一并扩散成同一套说明
  - 点击问号后打开独立帮助弹窗，标题直接复用当前设置项名称

- `src/features/settings/LiquidGlassSettingHelpModal.ts`
  - 新增轻量帮助弹窗
  - 用分段文本渲染“大白话说明”，便于把“这项会让哪里变”讲清楚

- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
  - 新增问号按钮 tooltip 文案
  - 为 `shuding` 现有参数补全 plain-language help 文案，重点解释“看起来会怎么变”“一般什么时候该调它”

- `tests/unit/features/settings/OpenCodianStyleSettings.test.ts`
  - 新增断言：`shuding` 会生成问号帮助配置，`nikdelvin` 不会
  - 新增断言：点击帮助配置会打开帮助弹窗

- `tests/unit/features/settings/LiquidGlassSettingHelpModal.test.ts`
  - 新增帮助弹窗渲染测试
  - 锁定标题、分段文案和 plain-language heading，防止后续改回技术黑话但没有回归保护

### 🧪 当前验证

- 已通过：`npm run test -- tests/unit/features/settings/OpenCodianStyleSettings.test.ts tests/unit/features/settings/LiquidGlassSettingHelpModal.test.ts`
- 已通过：`npm run build`（`BUILD_ID: main.202604041022`）
- 已完成：部署 `dist/main.js`、`dist/manifest.json`、`dist/styles.css` 到 Test Vault
- 已验证部署后的 `main.js` 包含 `BUILD_ID: main.202604041022`

## 2026-04-04 `shuding` 默认路径对齐 upstream liquid-glass.js，并补 mount / unmount 回归保护

### 🎯 改动目标

- 在不改变当前 composer 外部宽高、布局占位和圆角来源的前提下，把 `liquid-glass-shuding` 的默认折射路径收紧到参考 `reference-projects/liquid-glass-research/liquid-glass/liquid-glass.js`
- 明确把此前的 `adaptive / rect-edge / corner / barrel` 等增强逻辑降级为非默认高级参数，避免默认视觉继续偏离 upstream
- 用精确断言补齐回归测试，重点锁住默认滤镜串、SVG 挂载、最终 style 值，以及 `unmount()` 后恢复原样

### ✅ 本轮调整

- `src/utils/glass/adapters/shuding.ts`
  - 将默认位移公式收紧为 upstream 路径：
    - `roundedRectSDF(ix, iy, 0.3, 0.2, 0.6)`
    - `smoothStep(0.8, 0, distanceToEdge - 0.15)`
    - `smoothStep(0, 1, displacement)`
    - `sampleX = ix * scaled + 0.5`
    - `sampleY = iy * scaled + 0.5`
  - 默认关闭 `adaptiveSdf`、`adaptiveSdfMix`、`rectEdgeRefraction`、`rectEdgeRefractionStrength`、`cornerEnhancement`、`cornerEnhancementStrength`、`edgeBandWidth`、`barrelDistortion`、`barrelStrength`
  - 将默认滤镜改为 upstream 组合：
    - `url(#filterId) blur(0.25px) contrast(1.2) brightness(1.05) saturate(1.1)`
  - 将默认位移图生成改为固定 `canvasDPI = 1`，不再跟随 `devicePixelRatio`
  - 保留 `feImage + feDisplacementMap` 管线，并保留 `maxScale *= 0.5` 的归一化思路
  - 将默认视觉阴影改为更接近 upstream：
    - `0 4px 8px rgba(0,0,0,0.25), 0 -10px 25px inset rgba(0,0,0,0.15)`
  - 不再默认启用顶部高光、内边框、底部暗线、内凹阴影
  - 整个适配器继续只消费当前 shell 的现有宽高与圆角，不向 shell 写入 demo 的 `300px / 200px / 150px`

- `src/core/types/settings.ts`
  - 同步 `shuding` 的持久化默认值与归一化范围，确保默认保存/恢复结果和新的 upstream 默认语义一致
  - 允许 `edgeBandWidth = 0` 这类“默认关闭增强项”的值稳定持久化，不再被归一化逻辑重新抬起

- `tests/unit/core/types/settings.test.ts`
  - 新增 `shuding` 默认值断言，锁定 upstream 对齐后的 filter 参数与增强项默认关闭状态
  - 新增归一化断言，锁定零值增强参数不会被回夹成旧默认

- `tests/unit/features/chat/inputPanelTheme.test.ts`
  - 补充 `liquid-glass-shuding` 在输入区主题切换时的挂载/清理回归测试
  - 锁定运行时不会破坏输入区既有宽高与圆角

- `tests/unit/utils/glass/shuding.test.ts`
  - 新增 `shuding` adapter 定向测试
  - 覆盖默认 strict upstream displacement 分支
  - 覆盖 URL-backed filter 串、`feImage` / `feDisplacementMap` 挂载与 `scale`
  - 覆盖 mount 后 shell / filter-layer 的最终 style 值
  - 覆盖 `unmount()` 后 dataset、style 与 SVG defs 恢复原样

### 🧪 当前验证

- 已通过：`npm run test -- tests/unit/utils/glass/shuding.test.ts tests/unit/features/chat/inputPanelTheme.test.ts tests/unit/core/types/settings.test.ts`
- 已通过：`npm run test -- tests/unit/utils/glass/shuding.test.ts`
- 已通过：`npm run check:devlog-order`
- 已通过：`npm run build`（`BUILD_ID: main.202604040948`）
- 已完成：部署 `dist/main.js`、`dist/manifest.json`、`dist/styles.css` 到 Test Vault
- 已验证部署后的 `main.js` 包含 `BUILD_ID: main.202604040948`

## 2026-04-04 Nikdelvin 模式语义澄清：有背景走 Demo 背景模式，无背景走实时折射

### 🎯 改动目标

- 把 `Nikdelvin Liquid Glass` 在 OpenCodian 里的实际运行语义说清楚，避免继续把“参考原版实时折射”和“参考 demo 自带背景图视觉”混成一套模糊描述。
- 保持当前实现与参考项目的两条主路径一致：有背景时优先走内部 demo 背景图视觉，无背景时才使用实时聊天背景折射。
- 顺手修正“`Demo 纹理预设 = 无` 看起来发黑”的观感，让无背景模式更接近透明玻璃而不是深色遮罩。

### ✅ 本轮调整

- `src/utils/glass/adapters/nikdelvin.ts`
  - 明确以 `hasBackground` 区分两条模式：
    - 有 demo 纹理预设或自定义背景图时，使用内部背景图 + overlay 的 demo 背景模式
    - 没有背景图时，使用实时聊天背景折射模式
  - 在无背景模式下，将默认 overlay 从深色改成更轻的白色玻璃层，避免 `backgroundPreset = none` 时看起来像黑底

- `styles.css`
  - 将 `opencodian-composer-shell--liquid-glass` 恢复为 `isolation: isolate`，减小无背景实时折射模式下被外层 hover 重绘串进顶部边缘的概率

- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
  - 重新描述 `backgroundPreset`、`background`、`freeze` 相关设置文案
  - 在设置页里直接说明“有背景 = demo 背景模式”“无背景且背景图为空 = 实时折射模式”

- `tests/unit/utils/glass/nikdelvin.test.ts`
  - 补充针对 `Nikdelvin` 模式语义的定向测试
  - 覆盖“无背景时使用浅色 overlay”“有背景时保留原版深色 overlay”两条断言

### 🧪 当前验证

- 已通过：`npm run check:devlog-order`
- 已通过：`npm run test -- tests/unit/core/storage/StorageService.test.ts tests/unit/core/theme/themePresets.test.ts tests/unit/core/types/settings.test.ts tests/unit/features/chat/chatAppearance.test.ts tests/unit/features/chat/inputPanelTheme.test.ts tests/unit/main/themeSettingsMigration.test.ts tests/unit/utils/glass/nikdelvin.test.ts tests/unit/features/settings/OpenCodianStyleSettings.test.ts tests/unit/features/settings/OpenCodianSettings.test.ts`
- 已通过：`npm run build`（`BUILD_ID: main.202604040827`）
- 已完成：部署 `dist/main.js`、`dist/manifest.json`、`dist/styles.css` 到 Test Vault
- 已验证部署后的 `main.js` 包含 `BUILD_ID: main.202604040827`

## 2026-04-04 Nikdelvin 背景模式禁用实时折射，修复助手消息 hover 顶部横线

### 🎯 改动目标

- 修复 `liquid-glass-nikdelvin` 输入区在启用 demo 背景预设或自定义背景时，只要鼠标悬浮到助手消息，输入区顶部就会出现一条横线的问题。
- 保留“无背景”场景下的实时折射质感，但避免“有背景”场景继续去采样聊天区 hover 态，导致输入区顶部出现 seam / 折射伪影。

### ✅ 本轮调整

- `src/utils/glass/adapters/nikdelvin.ts`
  - 在 `Nikdelvin` 的基础层渲染逻辑中增加 `shouldUseBackdropRefraction = !hasBackground`
  - 当存在 demo 背景预设或自定义背景时，关闭 `glassBoxEl` 的 live backdrop refraction，只保留背景图、overlay 与 tint 路径
  - 当没有背景时，继续保留原来的 `svg` / `glass` 折射分支，不影响纯折射玻璃模式

### 🧪 当前验证

- 已通过：`npm run build`（`BUILD_ID: main.202604040210`）
- 已完成：部署 `dist/main.js`、`dist/manifest.json`、`dist/styles.css` 到 Test Vault
- 已验证部署后的 `main.js` 包含 `BUILD_ID: main.202604040210`
- 已由用户确认：启用背景的 `Nikdelvin Liquid Glass` 输入区在助手消息 hover 时不再出现顶部横线

## 2026-04-04 聊天主题背景上传、边缘融合与消息外壳背景层

### 🎯 改动目标

- 在设置页的 `样式 / Style` 中新增一套真正可用的“主题背景”能力，让用户可以上传自己的图片并将其作为 `opencodian-messages-shell` 的背景层。
- 让背景图不是生硬贴进去，而是能通过模糊、景深、主题遮罩和边缘融合自然地融入当前 Obsidian / OpenCodian 主题。
- 保持本地存储友好：图片不塞进 `settings.json`，而是单独存到插件本地目录，并在切换/清空时回收旧资源。

### ✅ 本轮调整

- `src/core/types/settings.ts`
- `src/core/theme/index.ts`
- `src/features/chat/chatAppearance.ts`
- `src/main.ts`
  - 为 `chatAppearance` 新增 `background` 分组，包含图片路径/类型/显示名，以及透明度、模糊、景深、主题遮罩、边缘融合、饱和度、亮度、横向焦点、纵向焦点等参数
  - 将背景图从主题预设 override 体系中独立出来：切换聊天主题预设时保留用户上传的背景图，但“重置全部样式”或“重置背景分组”仍会清空背景
  - 在主插件层新增背景图即时持久化、资源清理和 data URL 缓存解析逻辑，避免每次样式刷新都重复读盘

- `src/core/storage/StorageService.ts`
  - 新增 `.opencodian/theme-backgrounds/` 本地素材目录
  - 支持把上传图片以二进制写入插件本地存储，并在需要时读取为 data URL
  - 接通背景图 MIME 检测、扩展名推断、64 MB 大小限制以及旧素材删除

- `src/features/settings/OpenCodianSettings.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
  - 在样式设置中新增“主题背景”分组
  - 支持图片上传、替换、移除、预览，以及背景相关滑杆调节
  - 让主题预设切换、预设重置、背景分组重置、全部重置这些操作和背景素材生命周期保持一致

- `src/features/chat/OpenCodianView.ts`
- `styles.css`
  - 给 `opencodian-messages-shell` 新增独立背景图层、主题遮罩层和边缘融合过渡层
  - 让背景图支持 blur / depth / focus 定位等视觉调节，并把这些变量作用到聊天视图
  - 当启用主题背景时，为助手消息卡片补上默认玻璃底色，避免文本直接压在照片上影响可读性

- `tests/unit/core/types/settings.test.ts`
- `tests/unit/features/chat/chatAppearance.test.ts`
- `tests/unit/core/theme/themePresets.test.ts`
- `tests/unit/main/themeSettingsMigration.test.ts`
- `tests/unit/core/storage/StorageService.test.ts`
  - 覆盖背景设置默认值、归一化与 CSS 变量映射
  - 覆盖主题预设恢复时保留背景图的迁移行为
  - 覆盖背景素材读写与 data URL 回读

- `AGENTS.md`
  - 更新本地存储结构说明，补充 `.opencodian/theme-backgrounds/`
  - 更新聊天视图与设置页职责描述，记录消息外壳背景图能力

### 🧪 当前验证

- 已通过：`npm run test -- tests/unit/core/types/settings.test.ts tests/unit/features/chat/chatAppearance.test.ts tests/unit/core/theme/themePresets.test.ts tests/unit/main/themeSettingsMigration.test.ts tests/unit/core/storage/StorageService.test.ts`
- 已通过：`npm run test -- tests/unit/features/settings/OpenCodianStyleSettings.test.ts tests/unit/features/settings/OpenCodianSettings.test.ts`

## 2026-04-04 移除 Rdev Liquid Glass 输入区主题

### 🎯 改动目标

- 当前 `rdev` 输入区主题效果不理想，先把这套主题样式和接线完整移除，为后续重做留出干净基线。
- 避免旧 vault 继续指向已经删除的主题值，保证升级后设置页和运行时都能稳定工作。

### ✅ 本轮调整

- `src/core/types/settings.ts`
- `src/features/settings/OpenCodianSettings.ts`
- `src/features/chat/OpenCodianView.ts`
- `src/utils/glass/types.ts`
- `src/utils/glass/builtin-adapters.ts`
  - 从输入区主题类型、liquid-glass adapter 枚举、设置页映射和运行时挂载逻辑中移除 `rdev`
  - 把旧的 `inputPanelTheme = 'liquid-glass-rdev'` 归一化迁移到 `liquid-glass-shuding`
  - 把 liquid-glass 家族的默认落点从 `rdev` 改为 `shuding`
  - 删除只为 `rdev` 服务的滚动重绘 nudge 和诊断分支

- `src/utils/glass/adapters/rdev.ts`
- `src/utils/glass/adapters/rdev/*`
  - 删除整套 `rdev` adapter 实现与相关辅助模块

- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
- `tests/unit/core/types/settings.test.ts`
- `tests/unit/features/chat/inputPanelTheme.test.ts`
- `tests/unit/main/themeSettingsMigration.test.ts`
  - 移除 `rdev` 专属设置文案和测试
  - 补充已删除主题值的迁移断言，并保留其余 liquid-glass 主题覆盖

### 🧪 当前验证

- 已通过：`npm run test -- tests/unit/core/types/settings.test.ts tests/unit/features/chat/inputPanelTheme.test.ts tests/unit/main/themeSettingsMigration.test.ts`
- 已通过：`npm run check:devlog-order`
- 已通过：`npm run build`（`BUILD_ID: main.202604040143`）
- 已验证部署后的 `main.js` 包含 `BUILD_ID: main.202604040143`

## 2026-04-03 Rdev Liquid Glass 一比一语义回归与完整参数暴露

### 🎯 改动目标

- 让输入区 `liquid-glass-rdev` 不再只是“借用了 rdev 思路的 OpenCodian 变体”，而是尽量回到参考项目 `rdev-liquid-glass-react` 的层结构、位移图来源和交互语义。
- 把参考组件可调的核心参数，以及本地实现里所有布尔开关都直接暴露到设置页，方便用户自行微调。

### ✅ 本轮调整

- `src/utils/glass/adapters/rdev.ts`
- `src/utils/glass/adapters/rdev/interaction.ts`
- `src/utils/glass/adapters/rdev/displacementMaps.ts`
- `src/utils/glass/adapters/rdev/shaderUtils.ts`
- `src/utils/glass/adapters/rdev/presets.ts`
  - 将 `rdev` adapter 重写为更贴近参考组件的层结构：保留单独 warp/filter 层，补回 over-light 黑色辅助层、双层边框高光、hover glow、press glow 与 hover overlay
  - 把交互逻辑改回参考组件语义：使用方向性缩放、弹性平移、按下缩放和基于鼠标偏移的边框高光角度
  - 让 `standard / polar / prominent` 直接使用参考项目预生成 displacement map，`shader` 模式回到原版 liquid-glass shader 生成路径
  - 补齐并接通原版可调项：`saturation`、`cornerRadius`、`padding`、`overLight`
  - 另外把本地实现里的布尔开关也暴露出来：`enableInteraction`、`borderEffects`、`interactiveEffects`

- `src/core/types/settings.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
  - 扩展 `rdev` 默认配置与归一化逻辑，确保新增参数和开关能被持久化、夹取和恢复
  - 为新增设置项补齐中英文文案、描述和模式选项标签
  - 新增“跟随输入区外形”开关，并将其设为默认开启，让 `rdev` 默认继承原 composer card 的长宽和圆角，而不是强制切成原版胶囊几何

- `tests/unit/core/types/settings.test.ts`
- `tests/unit/features/chat/inputPanelTheme.test.ts`
  - 覆盖 `rdev` 新默认值与归一化边界
  - 覆盖输入区挂载 `liquid-glass-rdev` 后会生成参考风格的运行时层节点
  - 覆盖默认跟随输入区几何时，不再向 shell 强写 `padding / border-radius`

### 🧪 当前验证

- 已通过：`npm run test -- tests/unit/core/types/settings.test.ts tests/unit/features/chat/inputPanelTheme.test.ts`

## 2026-04-03 Nikdelvin Liquid Glass Demo 纹理预设、资源路径修复与 hover 稳定性

### 🎯 改动目标

- 让 `Nikdelvin Liquid Glass` 输入区默认更接近参考 demo，而不是首次启用时只剩纯黑 overlay。
- 在设置里补齐 demo 的 `Background / Lines / Rocks / Chrome / Silk` 纹理预设，并确保这些资源在 Obsidian 插件环境中真的能加载。
- 修复输入区玻璃在底部覆盖层空白区域发生 hover 穿透时，把下方助手卡片 hover 高光折射进输入区顶部的闪烁问题。

### ✅ 本轮调整

- `src/core/types/settings.ts`
- `src/main.ts`
- `src/utils/glass/adapters/nikdelvin.ts`
  - 将 `Nikdelvin` 默认参数改为更接近原版组件：保留原版 overlay / tint / box-shadow 路径，默认关闭 OpenCodian 自定义光效
  - 将默认 demo 纹理预设从 `none` 调整为 `background`
  - 为旧的 `Nikdelvin` 默认配置补一层迁移判断，让刚好还停留在旧默认值的本地设置也能自动切到新的默认背景预设
  - 暴露并接通原版可调项与可开关项，包括背景 URL、freeze、button、inline、noMorph、color 与 demo 纹理预设

- `src/features/settings/OpenCodianSettings.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
- `src/utils/glass/types.ts`
  - 让 Liquid Glass 设置面板支持 `select / text / toggle / slider` 混合渲染
  - 在 `Nikdelvin` 分支中补齐预设纹理、原版背景 URL 和其它原版选项的设置项
  - 让输入区继承圆角这类真实生效项继续在所有输入区样式分支中可见

- `src/features/chat/OpenCodianView.ts`
- `scripts/build.mjs`
- `assets/liquid-glass/nikdelvin/*`
  - 将 Nikdelvin demo 纹理资源打包进插件构建产物
  - 修复插件内置纹理资源路径，改为通过 Obsidian 资源路径加载，而不是错误的重复插件目录 / `file://` 路径
  - 让 `Background / Lines / Rocks / Chrome / Silk` 在 Obsidian 里实际可见，而不再只剩黑色玻璃层

- `styles.css`
  - 在启用 liquid-glass 输入区时，让底部输入区 overlay 自己接住鼠标，避免 hover 穿透到底下助手消息卡片
  - 修复因为助手消息 hover 态被输入区实时折射而导致的顶部高光忽隐忽现问题

### 🧪 当前验证

- 已通过：`npm run check:devlog-order`
- 已通过：`npm run build`
- 已完成：部署 `dist/main.js`、`dist/manifest.json`、`dist/styles.css` 与 `dist/assets/` 到 Test Vault
- 已验证：Test Vault `BUILD_ID = main.202604031649`

## 2026-04-03 会话输入区操作按钮样式与发送提示中文化

### 🎯 改动目标

- 在“样式 > 输入区”里新增一个可控的会话输入区操作按钮样式选项，覆盖“添加上下文”和“发送消息”两个按钮。
- 保留当前独立按钮外观作为默认样式。
- 新增一种“图标直接刻在玻璃里”的无背景样式，并补齐发送按钮缺失的中文提示。

### ✅ 本轮调整

- `src/core/types/settings.ts`
- `src/core/types/index.ts`
  - 为 `chatAppearance.input` 新增 `actionButtonStyle` 持久化设置
  - 新增 `default / etched` 两种按钮样式枚举、默认值与归一化逻辑

- `src/features/settings/OpenCodianSettings.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
  - 在“样式 > 输入区”中新增“操作按钮样式”下拉选项
  - 补齐新设置项的中英文文案
  - 为发送按钮补上 `发送消息 / 停止生成` 的中英文 tooltip 文案

- `src/features/chat/OpenCodianView.ts`
- `styles.css`
  - 让 composer 按设置切换独立按钮样式与 etched 玻璃刻印样式
  - etched 样式下移除 `+` 与发送/停止按钮的独立背景，仅保留玻璃内部图标质感
  - 发送按钮状态切换时统一改走 tooltip/i18n，而不再写死英文 `Send message / Stop streaming`
  - 切换界面语言时同步刷新输入框按钮提示

- `tests/unit/core/types/settings.test.ts`
- `tests/unit/features/chat/inputPanelTheme.test.ts`
- `tests/unit/features/settings/OpenCodianStyleSettings.test.ts`
  - 覆盖新增设置的默认值与归一化
  - 覆盖 etched 样式 class 切换
  - 覆盖发送按钮 tooltip 的中文化与设置页下拉项

### 🧪 当前验证

- 已通过：相关单测
- 已通过：`npm run build`
- 已完成：部署 `dist/main.js`、`dist/manifest.json`、`dist/styles.css` 到 Test Vault
- 已验证：Test Vault `BUILD_ID = main.202604031501`

## 2026-04-03 `shuding` 矩形玻璃面板参数化与独立调试

### 🎯 改动目标

- 让 `shuding` Liquid Glass 不再被固定成一套“胶囊感”效果，而是按矩形玻璃面板思路单独调校。
- 在设置页把折射、角落、光照、滤镜这些效果拆成独立项目，方便逐项开关和判断。
- 保证这些调整只影响 `shuding` adapter，不串到 `nikdelvin`、`rdev` 或共享输入区样式。

### ✅ 本轮调整

- `src/utils/glass/adapters/shuding.ts`
- `src/utils/glass/types.ts`
- `src/core/types/settings.ts`
  - 为 `shuding` 新增矩形面板相关参数与默认值，包括：
    - 自适应 SDF / 自适应混合
    - 矩形边缘折射 / 折射强度
    - 角落增强 / 角落强度
    - 边缘带宽
    - 桶形畸变 / 桶形强度
    - 顶部高光、内框线、底部暗线、内凹阴影及对应强度
    - blur / contrast / brightness / saturate / displacement
  - 扩展 Liquid Glass 参数类型，允许保存 boolean 配置与说明字段
  - 为新增参数补齐默认值与归一化范围

- `src/features/settings/OpenCodianSettings.ts`
- `styles.css`
  - 为 Liquid Glass 输入区设置面板补上分组标题
  - 为每个 `shuding` 项目显示更易懂的说明文字
  - 让之前只有开关的效果继续保留 toggle，同时补对应强度滑块，便于“先开关再细调”

- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
  - 补齐 `shuding` 新参数的中英文标题与浅显说明

- `src/utils/glass/adapters/shuding.ts`
  - 将矩形玻璃逻辑改为以真实宽高比和圆角驱动的自适应 SDF
  - 折射改为以边缘窄带为主、四角可加强，中心保持更清晰
  - 光照改为顶部高光线、内框线、底部暗线和可选内凹阴影的组合
  - backdrop filter 改为可单独调整 blur / contrast / brightness / saturate
  - 修复切换折射相关参数时位移贴图不立即重算的问题，避免设置看起来“没反应”

### 🧪 当前验证

- 已通过：`npm run build`
- 已通过：`npm run check:devlog-order`
- 已完成：部署 `dist/main.js`、`dist/manifest.json`、`dist/styles.css` 到 Test Vault
- 已验证：Test Vault `BUILD_ID = main.202604031428`

## 2026-04-01 输入区预设透明度与 Glass Refraction 自定义

### 🎯 改动目标

- 为 `preset` 输入区补上真正可用的背景透明度调节，并让现有 blur / shadow 滑块直接驱动 composer 壳层。
- 为正式接入的 `glass-refraction` 三档输入区预设补上可持久化的参数自定义，不再只有固定原版公式。

### ✅ 本轮调整

- `src/core/types/settings.ts`
- `src/core/theme/index.ts`
- `src/main.ts`
  - 为 `chatAppearance.input` 新增 `backgroundOpacity`
  - 新增 `inputPanelGlassRefraction` 持久化设置，分别保存 `glass / card / pill` 的背景强度、blur、saturation、brightness
  - 设置加载时补齐默认值并归一化范围

- `src/features/chat/chatAppearance.ts`
- `src/features/chat/OpenCodianView.ts`
- `styles.css`
  - 为 preset 输入区输出并消费 `--opencodian-input-bg-opacity`
  - 让 preset 输入区的 blur / shadow 变量真正作用到 composer shell
  - 为三档 `glass-refraction` 输出独立 CSS 变量，并在样式层按 tier 应用对应的 blur / opacity / saturation / brightness

- `src/features/settings/OpenCodianSettings.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
  - 在“样式 > 输入区”中为 `preset` 新增“输入框背景强度”滑块
  - 当选择 `glass-refraction` 时，改为显示当前 tier 的玻璃背景强度、blur、saturation、brightness 控件与独立 reset

- `tests/unit/core/types/settings.test.ts`
- `tests/unit/main/themeSettingsMigration.test.ts`
- `tests/unit/features/chat/chatAppearance.test.ts`
  - 覆盖新增默认值、归一化、加载行为与 CSS 变量映射

### 🧪 当前验证

- 已通过：相关单测
- 待执行：`npm run check:devlog-order`
- 待执行：`npm run lint`
- 待执行：`npm run build`
- 待执行：Test Vault 部署与 `BUILD_ID` 校验

## 2026-04-01 输入区原版 glass-refraction 三档预设接入

### 🎯 改动目标

- 不再继续维护 composer 的实验 FX 壳层，而是将输入区正式接入 `glass-refraction` reference 的三档原版 tier。
- 在设置页中提供正式的输入区样式选择：保留原本 `preset`，并新增 `glass`、`glass-card`、`glass-pill` 3 个原版子选项。

### ✅ 本轮调整

- `src/core/types/settings.ts`
- `src/main.ts`
  - 将 `InputPanelThemeId` 扩展为 `preset + 3` 个原版 `glass-refraction` 选项
  - 删除隐藏实验字段 `experimentalComposerGlassRefractionEnabled` 及命令面板实验 toggle
  - 设置加载时忽略旧实验字段与旧 `inputPanelLiquidGlassMode` 残留

- `src/features/chat/OpenCodianView.ts`
- `styles.css`
  - 删除实验态 SVG defs 注入、FX 子层 DOM 与相关运行时 helper
  - 改为在 composer shell 上直接切换正式类：
    - `opencodian-composer-shell--gr-glass`
    - `opencodian-composer-shell--gr-card`
    - `opencodian-composer-shell--gr-pill`
  - 将 reference `glass-refraction` 三档视觉公式 vendoring 到主仓样式，仅做选择器作用域改写

- `src/features/settings/OpenCodianSettings.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
  - 在“样式 > 输入区”新增正式输入区样式入口
  - 采用两级选择：`Preset / Glass Refraction` + `Glass / Glass Card / Glass Pill`
  - 当选择原版三档时禁用输入区圆角 / blur / shadow 控制，并提示这些控制只对 `Preset` 生效

- `tests/unit/core/types/settings.test.ts`
- `tests/unit/main/themeSettingsMigration.test.ts`
- `tests/unit/features/chat/inputPanelTheme.test.ts`
  - 删除实验开关相关断言
  - 新增输入区 4 档主题的归一化、加载与运行时 class 切换测试

### 🧪 当前验证

- 待执行：相关单测
- 待执行：`npm run check:devlog-order`
- 待执行：`npm run lint`
- 待执行：`npm run build`
- 待执行：Test Vault 部署与 `BUILD_ID` 校验

### 📝 结论

- 输入区的 glass-refraction 现在转为正式可选预设，而不是继续停留在实验 FX 方案上。
- `preset` 保留原有 OpenCodian 输入区调节能力；原版三档则按 reference 的 tier 公式直接接入。

## 2026-04-01 Composer Glass Refraction 去雾化对齐

### 🎯 改动目标

- 针对当前实验态“后面只是模糊的一大团”的观感，继续把 composer glass 从单纯毛玻璃块拉回到更像参考 `.glass` 的折射体。
- 保持“实验态只有 `refract` 单层 blur”不变，优先通过底色密度、边缘色散和高光层次来减弱雾块感。

### ✅ 本轮调整

- `styles.css`
  - 适度下调实验态 refraction blur，并降低深浅主题下主玻璃底色的不透明度，避免输入区背后直接结成整块雾面
  - 提高 chromatic dispersion 和 specular 的可见度，让四边色散与顶部细亮线比纯 blur 更先被读到
  - 为 `refract` 增加顶部软高光和底部轻微内收阴影，让玻璃面更有壳体体积感，而不是平铺的糊面
  - 将 specular 呼吸动画改为基于变量强度呼吸，避免动画把主题/模式下的高光强度配置覆盖掉

### 🧪 当前验证

- 待执行：相关单测
- 待执行：`npm run check:devlog-order`
- 待执行：`npm run lint`
- 待执行：`npm run build`
- 待执行：Test Vault 部署与 `BUILD_ID` 校验

### 📝 结论

- 这一轮仍然是单层模糊结构，但视觉重心不再主要落在 blur 上，而是开始更多依赖壳体高光、边缘色散和更轻的玻璃底色去建立“液态玻璃”感。

## 2026-04-01 Composer Glass Refraction 单层主层再对齐

### 🎯 改动目标

- 在已经纠正为“实验态单层 blur”之后，继续把主玻璃面的职责分布对齐到 `glass-refraction` 参考项目。
- 避免继续出现“shell 提供一半玻璃面、refract 再提供另一半玻璃面”的拆分式实现，让 `refract` 层更像参考 `.glass` 的主视觉承载层。

### ✅ 本轮调整

- `styles.css`
  - 将 shimmer sweep 和主玻璃底色从 `opencodian-composer-shell--glass-refract` 移到 `opencodian-composer-glass-fx-refract`
  - `opencodian-composer-shell--glass-refract` 只保留 ring border / inset highlight / depth shadow，不再承担主玻璃面背景
  - 让 `refract` 层同时承担：主玻璃底色、单层 blur、SVG refraction、shimmer 动画
  - 将暗色 `saturate` 和色散整体强度继续拉近参考 `.glass`
  - 为 `refract / dispersion / specular` 三层补显式 z-index，减少多层壳体下的层叠歧义

### 🧪 当前验证

- 待执行：相关单测
- 待执行：`npm run build`
- 待执行：Test Vault 部署与 `BUILD_ID` 校验

### 📝 结论

- 实验态现在不仅是“单层 blur”，而且主玻璃面的职责也更接近参考 `.glass`：`refract` 层成为真正的主玻璃面，shell 退回到承载边框和投影的容器角色。

## 2026-04-01 Composer Glass Refraction 参考样式对齐

### 🎯 改动目标

- 不再停留在“方案 A 已接通”的静态壳层阶段，而是把 composer 的实验实现重新对齐到 `reference-projects/liquid-glass-research/glass-refraction` 的 `.glass` 视觉语言。
- 修正当前实现里最影响观感的几个偏差：暗色主题 blur 被手动压成 `0px`、只有单层 FX、缺少 shimmer / specular breathing、色散过弱、SVG filter 缺少饱和增强步骤。

### ✅ 本轮调整

- `src/features/chat/OpenCodianView.ts`
  - 将 composer glass 层改为三层显式 DOM：`refract`、`dispersion`、`specular`
  - 在 SVG filter 中补上 `feColorMatrix` 饱和增强步骤，与参考 `GlassFilters.tsx` 对齐

- `styles.css`
  - 将暗色主题 `--opencodian-glass-refraction-blur` 从临时调试值 `0px` 恢复到 dense glass 基线
  - 新增并对齐 shimmer / specular 动画、四边 chromatic edge、ring border、inset highlight、depth shadow
  - 让 composer glass 的基础配色和透明度更接近参考 `.glass`
  - 明确收口为“实验态只有单层 blur”：普通 composer shell 保持默认 blur，`opencodian-composer-shell--glass-refract` 激活后由 `refract` 子层独占 blur，对齐参考项目的单层模糊结构

- `tests/unit/features/chat/composerGlassRefraction.test.ts`
  - 更新断言，要求三层显式 FX DOM 都存在，同时仍保持 SVG defs 只注入一次

### 🧪 当前验证

- 待执行：相关单测
- 待执行：`npm run build`
- 待执行：Test Vault 部署与 `BUILD_ID` 校验
- 待执行：`npm run check:devlog-order`

### 📝 结论

- 这一轮的目标是把当前实验外壳从“静态磨砂面板”推进到更接近 `glass-refraction` 参考项目的 dense `.glass` 效果。
- 模糊结构上也已从“双层 blur”纠正为“实验态单层 blur”，避免 shell 本体和 `refract` 子层重复发雾。
- 仍不恢复旧 `liquidGlass` WebGL/controller 架构，继续使用现有隐藏实验开关进行验证。

## 2026-04-01 Composer Glass Refraction 方案 A 实验接入

### 🎯 改动目标

- 按研究文档 `docs/liquid-glass-research/plan-a-glass-refraction.md`，重新为输入区 composer 接入一层低风险的 CSS/SVG 玻璃折射实验壳层。
- 不恢复已移除的 `src/features/chat/liquidGlass/*` controller / sampler / renderer 架构，只走 `OpenCodianView + styles.css` 的最小接入线。
- 为测试期提供命令面板级的开关，并将开关状态持久化到隐藏设置字段，方便在不污染正式设置页的前提下快速验证。

### ✅ 本轮调整

- `src/core/types/settings.ts`
- `src/core/types/index.ts`
- `src/main.ts`
  - 新增隐藏字段 `experimentalComposerGlassRefractionEnabled`，默认值为 `false`
  - 设置加载时对该字段做布尔回退
  - 新增命令面板开关 `Toggle composer glass refraction (experimental)`，切换后仅刷新 UI，不触发服务/模型/配置同步

- `src/features/chat/OpenCodianView.ts`
- `styles.css`
  - 在 composer shell 中新增独立的 `opencodian-composer-glass-fx` 背景层
  - 文档级一次性注入 `#opencodian-glass-refract` SVG filter，避免多 view 重复 defs
  - 通过激活类 `opencodian-composer-shell--glass-refract` 控制 refraction 壳层显示
  - 玻璃 FX 仅作用于背景层，textarea、footer、toolbar 继续保持在前景，不吃 filter

- `tests/unit/core/types/settings.test.ts`
- `tests/unit/main/themeSettingsMigration.test.ts`
- `tests/unit/features/chat/composerGlassRefraction.test.ts`
  - 覆盖隐藏开关默认值与归一化
  - 覆盖设置加载对缺省 / 显式 true / 显式 false 的处理
  - 覆盖 composer glass 壳层的 DOM 激活类、FX 层注入与 SVG defs 去重

### 🧪 当前验证

- 待执行：相关单测
- 待执行：`npm run build`
- 待执行：Test Vault 部署与 `BUILD_ID` 校验
- 待执行：`npm run check:devlog-order`

### 📝 结论

- 输入区这次恢复的是“方案 A：CSS/SVG 实验壳层”，不是旧版 Liquid Glass WebGL 运行时链路。
- 正式设置页仍保持收口状态；实验验证阶段改用命令面板开关来降低回退和对比成本。

## 2026-04-01 输入区回归预设、通知路由修正与文档仓收口

### 🎯 改动目标

- 收回输入区 `Liquid Glass` 实验链路，回归“只保留主题预设、输入区只走 preset 样式”的稳定方案。
- 修正多标签场景下后台任务 stale notice 与 turn diff notice 的路由、去重与持久化行为。
- 清理仓库内已过时的设计/迁移/spec 文档，并将临时文档工作区从版本控制中排除。

### ✅ 本轮调整

- `src/core/types/settings.ts`
- `src/core/types/index.ts`
- `src/main.ts`
- `src/features/settings/OpenCodianSettings.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
  - 将输入区主题重新收口为 `preset`
  - 旧配置中的 `inputPanelTheme = 'liquid-glass'` 会在加载时自动归一化回 `preset`
  - 移除输入区 Liquid Glass 相关设置项、模式选项与对应文案

- `src/features/chat/OpenCodianView.ts`
- `styles.css`
  - 删除输入区 Liquid Glass 运行时接线、专用 lens DOM、刷新调度与专用样式层
  - 输入区重新回到普通预设 composer 外壳
  - 为 stale background task notice 增加 fingerprint 去重，避免同一批挂起任务重复插入 notice
  - turn diff notice 现在会写回原始发送会话，并在用户已切换 tab 时正确给原 tab 标记 attention

- `src/features/chat/ui/SessionTodoDock.ts`
  - 当 todo 全部完成时自动隐藏 dock，不再继续保留空的已完成状态条

- `tests/unit/core/types/settings.test.ts`
- `tests/unit/main/themeSettingsMigration.test.ts`
- `tests/unit/features/settings/OpenCodianStyleSettings.test.ts`
- `tests/unit/features/chat/SessionTodoDock.test.ts`
- `tests/unit/features/chat/backgroundTaskNoticeDedup.test.ts`
- `tests/unit/features/chat/turnDiffNoticeRouting.test.ts`
- `tests/__mocks__/obsidian.ts`
  - 更新输入区 preset-only 迁移与设置测试
  - 新增 todo dock 完成态隐藏测试
  - 新增后台任务 stale notice 去重测试
  - 新增跨 tab turn diff notice 路由测试

- `.gitignore`
- `docs/`
  - 将 `docs/` 目录作为临时文档工作区忽略
  - 移除仓库内一批已失效的迁移说明、架构镜像、superpowers 计划/spec 文档快照，减少噪音

### 🧪 当前验证

- 通过：`npm run test -- tests/unit/core/types/settings.test.ts tests/unit/main/themeSettingsMigration.test.ts tests/unit/features/settings/OpenCodianStyleSettings.test.ts`
- 通过：`npm run lint`
- 待本条日志写入后继续执行：`npm run check:devlog-order`

### 📝 结论

- 输入区现已明确回到“预设优先”的稳定策略，不再保留 Liquid Glass 主题入口或运行时残留。
- 多 tab 下的后台任务 notice / diff notice 行为更稳定，todo dock 在任务完成后也更干净。
- 仓库内保留的开发文档范围进一步收紧，`devlog.md` 成为当前开发过程的主要持续记录入口。

## 2026-03-31 输入区 Liquid Glass 主题接入

### 🎯 改动目标

- 为输入区新增一套可选的 `Liquid Glass` 主题，保留现有输入区作为默认 `preset` 样式。
- 在不改动整体聊天主题预设体系的前提下，让输入区可以单独切换到一套 Liquid Glass 风格外观，并保留后续恢复实时折射能力的接线位。
- 保留现有输入区半径、模糊和阴影滑块作为 Liquid Glass 主题的后置微调层。

### ✅ 本轮调整

- `src/core/types/settings.ts`
- `src/core/types/index.ts`
  - 新增 `InputPanelThemeId = 'preset' | 'liquid-glass'`
  - 新增 `InputPanelLiquidGlassMode = 'css' | 'webgl-experimental'`
  - `OpenCodianSettings` 新增 `inputPanelTheme` 字段，默认值为 `preset`
  - `OpenCodianSettings` 新增 `inputPanelLiquidGlassMode` 字段，默认值为 `css`
  - 新增 `normalizeInputPanelThemeId()` 与 `normalizeInputPanelLiquidGlassMode()`，用于旧配置和非法值回退

- `src/main.ts`
  - 将 `inputPanelTheme` 与 `inputPanelLiquidGlassMode` 纳入设置加载与归一化流程
  - 保证旧用户未配置该字段时自动回退到 `preset`

- `src/features/settings/OpenCodianSettings.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
  - 将输入区“面板样式主题”从禁用占位改为可用下拉框
  - 提供 `Preset` 与 `Liquid Glass` 两个选项
  - 在 `Liquid Glass` 主题下新增 `Stable CSS shell / True Refraction (Experimental)` 渲染器选项
  - 切换时走纯 UI 保存路径：不触发服务设置同步、不刷新模型列表、不重写 OpenCode 配置

- `src/features/chat/liquidGlass/liquidGlassGeometry.ts`
- `src/features/chat/liquidGlass/MessageBandSampler.ts`
- `src/features/chat/liquidGlass/WebGLLiquidGlassRenderer.ts`
- `src/features/chat/liquidGlass/InputLiquidGlassController.ts`
  - 新增“消息区带状采样 + WebGL 镜片渲染”链路，只对输入框背后的活动消息区域取样
  - 采样器只重建 composer 后方的一条窄带，覆盖常见文本/代码/notice/card，并对复杂内容降级为占位块
  - WebGL renderer 使用原生 `Canvas2D + WebGL`，实现折射位移、边缘色散、高光与阴影叠加
  - 本地 controller 统一管理 `css` / `webgl-experimental` 两种模式，以及失败时回退到稳定 CSS 壳
  - 旧 `html2canvas / liquidGL` 运行时接线已停用，仅保留陈旧全局残留清理逻辑，避免 `document.write`、快照解析失败和关闭视图后残留 renderer

- `src/features/chat/OpenCodianView.ts`
  - 新增输入区 Liquid Glass controller 生命周期管理
  - 在 `applyChatAppearanceSettings()` 中同步输入区主题状态
  - 新增统一的 `scheduleLiquidGlassRefresh()` 节流入口，更新为“最大 24fps + 120ms 尾刷新”
  - 将以下事件汇总到同一刷新路径：
    - Obsidian `css-change`
    - 消息区 DOM MutationObserver
    - 活动消息面板内部滚动
    - tab pane 切换
    - 输入区 ResizeObserver

- `styles.css`
  - 为 composer 新增 `opencodian-composer-shell--liquid-glass` 主题样式
  - 使用 `::before / ::after` 叠加 tint、specular、边缘色散和雾化层
  - 让现有 input radius / blur / shadowBlur 继续作用于 Liquid Glass 外壳

- `package.json`
- `package-lock.json`
  - 新增 `html2canvas` 依赖，用于本地打包页面快照采样能力

- `tests/unit/core/types/settings.test.ts`
- `tests/unit/features/settings/OpenCodianStyleSettings.test.ts`
- `tests/unit/features/chat/liquidGlassGeometry.test.ts`
- `tests/unit/features/chat/MessageBandSampler.test.ts`
- `tests/unit/features/chat/InputLiquidGlassController.test.ts`
  - 补充输入区主题默认值与归一化测试
  - 补充设置页选项与纯 UI 持久化测试
  - 补充消息区带状采样几何测试与复杂内容降级不抛错测试
  - 补充 Liquid Glass controller 在 `css / webgl-experimental` 下的初始化、重建、销毁与 fallback 测试

### 🧪 当前验证

- 通过：`npm run test -- tests/unit/core/types/settings.test.ts tests/unit/features/settings/OpenCodianStyleSettings.test.ts tests/unit/main/themeSettingsMigration.test.ts tests/unit/features/chat/liquidGlassGeometry.test.ts tests/unit/features/chat/MessageBandSampler.test.ts tests/unit/features/chat/InputLiquidGlassController.test.ts`
- 待继续执行：更宽范围相关测试、`npm run check:devlog-order`、完整 build、Test Vault 部署与 `BUILD_ID` 校验

### 📝 结论

- 输入区现在提供稳定可切换的 `Liquid Glass` 主题外观，并在其下新增可选的 `True Refraction (Experimental)` 模式。

- 实验模式已经摆脱 `html2canvas / liquidGL` 的页面级快照方案，改为只采样输入框背后的活动消息条带，从而避免 `document.write`、`foreignObject` 与颜色函数解析失败等旧问题。

## 2026-03-31 主题预设系统与当前样式内置预设接入

### 🎯 改动目标

- 为聊天界面新增一套可快速切换的主题预设系统，支持在不同视觉风格与配色方案之间切换。
- 将当前 shipped 样式固化为内置预设 `glass-classic` / `OpenCodian Classic`，作为新安装用户的默认主题。
- 保留现有细粒度样式滑块与高级 CSS 作为“预设之后的微调层”，并确保老用户样式设置无损迁移。

### ✅ 本轮调整

- `src/core/theme/index.ts`
  - 新增内置主题预设注册表，覆盖 `glass / flat / soft / sharp` 四类风格与对应配色方案
  - 新增主题解析、预设基线合成、override 计算、外观比较等 helper，统一管理 preset 与最终 `chatAppearance` 的关系

- `src/core/types/settings.ts`
- `src/core/types/index.ts`
  - 为设置系统新增 `ThemePresetId`、`ThemePresetDefinition`、`ThemeSettings`
  - `OpenCodianSettings` 新增 `theme` 字段，结构为 `activePresetId + customAppearanceOverrides`
  - 保留 `chatAppearance` 作为最终生效快照，用于兼容现有渲染与存储链路

- `src/main.ts`
  - 新增主题设置迁移逻辑
  - 老用户若 `chatAppearance` 仍等于历史默认值，则自动绑定到 `glass-classic`
  - 老用户若已自定义样式，则保留原样并标记为 `Custom`
  - 新增插件级 helper，用于选择预设、按预设基线重置、按分组重置，以及在编辑样式时自动回写 `theme.customAppearanceOverrides`

- `src/features/chat/OpenCodianView.ts`
  - 在现有 `chatAppearance` CSS 变量应用前，先对聊天容器应用主题 class 与 preset-level CSS variables
  - 切换预设时可即时反映风格差异，同时继续叠加用户微调

- `src/features/settings/OpenCodianSettings.ts`
  - 在样式设置顶部新增“主题预设”区域
  - 支持风格卡片与配色方案切换，并显示“当前预设 / 已微调 / 自定义”状态
  - “全部重置”“分组重置”“单项重置”改为回到当前预设基线，而不再一律回到历史默认值
  - 修复主题卡片长文案在窄宽度下不换行、横向溢出的问题

- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
  - 新增主题预设文案与状态提示
  - 更新样式重置相关提示文案，使其准确反映“恢复预设/默认值”的行为

- `styles.css`
  - 新增 plugin-scoped 主题 accent token，并将其桥接到聊天容器内的 `interactive-accent` / `text-accent` / `text-on-accent`
  - 为 `flat / soft / sharp` 主题增加 dark/light 自适应基础 token
  - 为设置页新增主题卡片、配色 chip、状态行等样式
  - 修复主题卡片标题与描述文本的换行与断词表现

- `tests/unit/core/theme/themePresets.test.ts`
- `tests/unit/main/themeSettingsMigration.test.ts`
- `tests/unit/core/types/settings.test.ts`
  - 新增主题预设解析、override 计算、主题默认值与老设置迁移测试

### 🧪 验证结果

- 通过：`npm test`
- 通过：`npm run build`（`BUILD_ID: main.202603311902`）
- 已部署到 Test Vault：`C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\`
- 已验证部署后的 `main.js` 包含 `BUILD_ID: main.202603311902`
- 待继续观察：不同 Obsidian 第三方主题下，`flat / soft / sharp` 的 token 混色是否还需要进一步微调

### 📝 结论

- 这轮之后，OpenCodian 已具备内置主题预设能力，当前默认视觉也被沉淀为可回切的系统预设；同时原有样式微调能力仍完整保留，并以“预设基线 + 用户 override”的方式工作。

## 2026-03-31 用户消息折叠遮罩、中断提示与空助手壳过滤修复

### 🎯 改动目标

- 修复长用户消息折叠时尾部出现黑色长方形阴影的问题。
- 修复用户中断回复后出现多个无文字 assistant 消息块、或先出现中断提示后又插入空助手壳的问题。
- 收敛用户消息 hover / 展开时对 assistant 消息的遮挡感，保持单次回复的视觉统一性。

### ✅ 本轮调整

- `styles.css`
  - 将用户长消息折叠尾部从额外的深色渐变遮罩改为 `mask-image` 渐隐，避免最后一行出现突兀的黑色覆盖块
  - 下调用户消息容器与 footer 的层级，并收敛用户气泡与操作按钮 hover 时的放大幅度，减少展开和悬浮时遮住下方 assistant 内容的情况
  - 为 assistant 时间行补充可换行布局与中断状态 badge 样式，确保中断状态能在同一条回复块里被清晰表达

- `src/core/types/chat.ts`
  - 为 `ChatMessage` 增加 `streamState` 字段，用于持久化记录本地流式消息是否处于 `interrupted` 状态

- `src/features/chat/OpenCodianView.ts`
  - 中断流式回复时，如果本轮已经产生可见内容，则保留同一条 assistant 消息并标记“已中断”
  - 如果中断发生在可见正文输出前，则把预创建的流式占位直接转换成明确的中断 notice，而不是留下空 assistant 壳
  - 新增空 assistant shell 清理逻辑，流式收尾后会移除仅剩时间行、没有正文/工具/卡片内容的本地占位
  - 新增 `shouldRenderConversationMessage()`，在服务端同步合并与最终渲染前统一过滤空 assistant message，避免中断后后台 sync 又把空助手块重新插回 UI
  - 将“Streaming cancelled” 也接入中英文 i18n，统一中断提示文本来源

- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
  - 新增流式中断 toast、badge 与 notice 文案

### 🧪 验证结果

- 通过：`npm run build`（`BUILD_ID: main.202603311625`）
- 已部署到 Test Vault：`C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\`
- 已验证部署后的 `main.js` 包含 `BUILD_ID: main.202603311625`
- 待继续关注：若服务端后续仍返回异常空 assistant message，需要再补充更细的诊断日志定位具体 message payload

### 📝 结论

- 这轮之后，用户长消息折叠的尾部遮罩会更自然；中断回复时，界面会优先保持“一个回复块”的表达，不再把空助手壳插回聊天流里。

## 2026-03-31 输入框面板自动增高与最大高度统一修复

### 🎯 改动目标

- 修复用户在 composer 中输入较长消息时，输入框外层面板没有随着内容自动变高的问题。
- 保留输入区的最大高度上限，避免长文本把底部输入面板无限撑高。

### ✅ 本轮调整

- `src/features/chat/OpenCodianView.ts`
  - 在 `syncInputTextareaHeight()` 完成 textarea 高度重算后，追加调用 `scheduleComposerLayoutSync()`
  - 让每次输入后的 textarea 高度变化都能同步传递到 composer 外层布局与消息区底部留白计算

- `styles.css`
  - 将 `.opencodian-input` 从 `flex: 1` 改为 `flex: 0 0 auto`，避免 textarea 被 flex 布局固定成不随内容自然增高的状态
  - 将 `.opencodian-input` 的 CSS `max-height` 从 `200px` 统一调整为 `240px`，与 `OpenCodianView.ts` 中的 `COMPOSER_TEXTAREA_MAX_HEIGHT` 对齐

### 🧪 验证结果

- 通过：`npm run build`（`BUILD_ID: main.202603311550`）
- 已部署到 Test Vault：`C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\`
- 已验证部署后的 `main.js` 包含 `BUILD_ID: main.202603311550`

### 📝 结论

- 这轮之后，用户在输入长消息时，composer 面板会先跟随内容自然长高；达到上限后再切换为输入框内部滚动，既保留了展开反馈，也控制住了最大高度。

## 2026-03-31 消息间距收束与用户消息 Hover 操作区遮挡修复

### 🎯 改动目标

- 修复长用户消息展开后在 hover 态放大时遮住复制 / 回退 / 分叉按钮的问题。
- 收紧用户消息与助手消息外层留白，让聊天列表纵向密度更紧凑，贴近最新视觉预期。

### ✅ 本轮调整

- `styles.css`
  - 为 `.opencodian-message--user .opencodian-message-content` 增加 `transform-origin: right bottom`，让 hover 放大从右下角展开，避免长卡片继续向下压住 footer 操作区
  - 为 `.opencodian-user-message-footer` 增加 `position: relative` 与 `z-index: 1`，确保复制 / 回退 / 分叉按钮层级稳定高于 hover 后的用户气泡
  - 将通用消息容器 `.opencodian-message` 的横向 padding 从 `14px` 收窄到 `4px`
  - 将用户消息外层 `.opencodian-message--user` 的底部 padding 从 `16px` 收窄到 `4px`
  - 将助手消息外层纵向间距变量 `--opencodian-assistant-pad-y` 从 `10px` 调整为 `0px`，使 `.opencodian-message--assistant` 变为 `0px 28px`

### 🧪 验证结果

- 通过：`npm run build`（`BUILD_ID: main.202603311530`）
- 已部署到 Test Vault：`C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\`
- 已验证部署后的 `main.js` 包含 `BUILD_ID: main.202603311530`

### 📝 结论

- 这轮之后，长用户消息在展开并 hover 时不会再把底部操作按钮压住，同时用户与助手消息的外层留白都更紧凑，整体消息列表密度更高。

## 2026-03-31 Assistant 同步尾部改为按合并后结果补丁更新

### 🎯 改动目标

- 修复 assistant 在一次回复完成后出现“中间消息先出现、随后又消失”的观感问题。
- 保留“一个问题对应一个 assistant 回复块”的直觉，不把一次回复最终拆成多个独立气泡。

### ✅ 本轮调整

- `src/features/chat/OpenCodianView.ts`
  - 将会话同步后的增量更新逻辑从“按原始消息数组判断 append”改为“按合并后的渲染结果判断增量”
  - 新增 `getIncrementalRenderedMessageUpdate()`，先比较 `getMessagesForRender()` 的前缀与尾部变化，再决定是 patch 尾部 assistant，还是追加新的渲染消息
  - `applySyncedConversationUpdate()` 现在会优先复用 `patchTrailingAssistantRender()` 更新当前尾部 assistant，而不是先把新同步到的 assistant 片段单独渲染出来
  - 删除旧的 `getSimpleAppendedMessages()` / `getMessageRenderSignature()` 路径，避免“先拆开显示、后合并回去”造成的闪动和消失感

### 🧪 验证结果

- 通过：`npm test -- tests/unit/features/chat/renderGroups.test.ts`
- 通过：`npx tsc -p tsconfig.json --noEmit`
- 通过：`npm run build`（`BUILD_ID: feat-liquid-composer-reactive-refraction.202603311506`）
- 已部署到 Test Vault：`C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\`
- 已验证部署后的 `main.js` 包含 `BUILD_ID: feat-liquid-composer-reactive-refraction.202603311506`

### 📝 结论

- 这轮之后，assistant 回复在同步服务端最终消息时，会继续保持“一个回复块”的最终形态；如果尾部内容发生变化，界面会直接补丁更新当前回复块，而不是临时渲染成多段再合并回去。

## 2026-03-31 输入框内联上下文 Composer 重构

### 🎯 改动目标

- 移除输入框上方独立的上下文 tray，把上下文状态、文本输入、添加上下文按钮、发送按钮整合进同一个 composer 容器。
- 为当前焦点文档/选区提供 VS Code 风格的顶部内联提示：未附加时显示虚线预览 chip，附加后切成实线 chip。
- 优化 composer 的视觉与布局细节，包括去除内层 textarea 边框、补足默认留白、限制最大输入高度，以及微调 toolbar 中模型/圆环/思考预算的相对位置。

### ✅ 本轮调整

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/composerContext.ts`
  - 新增 per-tab `focusContextPreview` 运行时状态，把“当前焦点预览”和“已附加上下文”分离
  - 输入区重建为一体化 composer：顶部 context chips、中部 textarea、底部 `+`/发送按钮，删除旧的独立 context tray
  - 新增 `composerContext.ts` 纯逻辑辅助函数，统一处理目标去重、preview/attached chip 排序、焦点目标 key 计算
  - 当前焦点文档/选区改为事件驱动刷新：结合 `file-open`、`active-leaf-change`、`editor-change` 与 `selectionchange` 等信号更新预览 chip
  - 点击 preview chip 会即时附加当前文档/选区；点击 attached chip 会按目标维度取消附加
  - textarea 改为随输入内容增高，并在达到最大高度后切换到内部滚动
  - toolbar 顺序微调为“权限 -> 模型 -> 上下文使用圆环 -> 思考预算”，并将圆环固定到模型这一侧

- `styles.css`
  - 删除旧 context tray 样式，新增 composer 内联 chip、footer、添加上下文按钮样式
  - 当前焦点未附加 chip 使用明确的虚线边框和斜体样式；已附加 chip 使用实线样式
  - 清除 textarea 的内层边框/阴影，让输入区完全融入外层 composer 卡片
  - 调整空输入时的默认最小高度与留白，并将输入最大高度与代码限制对齐

- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
  - 补充 composer 内 `+` 按钮“添加上下文”文案

- `tests/unit/features/chat/composerContext.test.ts`
  - 新增 preview/attached 去重、排序、选区冻结与 detach 后回退为 preview 的回归测试

- `AGENTS.md`
  - 更新目录与 `OpenCodianView` 职责说明，反映新引入的 `composerContext.ts` 和输入框内联上下文 composer

### 🧪 验证结果

- 通过：`npm test`
- 通过：`npm run typecheck`
- 通过：`npm run lint`
- 通过：`npm run build`（`BUILD_ID: main.202603310022`）
- 已部署到 Test Vault：`C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\`
- 已验证部署后的 `main.js` 包含 `BUILD_ID: main.202603310022`

### 📝 结论

- 这轮之后，OpenCodian 的输入区已经从“上方独立上下文区 + 下方输入框”切换成了更接近 VS Code/Copilot 的一体化 composer；上下文提示、附加行为和输入区视觉被收拢到同一个容器中，交互更紧凑，也更容易继续打磨。

## 2026-03-30 提问卡片位置设置、输入框上方 Dock 与回顾卡片开关

### 🎯 改动目标

- 为 OpenCode question card 新增“助手消息内联 / 输入框上方 dock”两种位置模式，并保持 `inline` 为完全兼容的默认行为。
- 新增“显示已回答问题卡片”开关，让 answered / rejected recap card 可以按需显示或静默隐藏，同时继续保留持久化的 `questionResolution`。
- 让 pending question 在 reload、切 tab、会话同步后仍能按当前 session 恢复，并在 background tab 上只打 attention、不串到前台 tab。

### ✅ 本轮调整

- `src/core/types/settings.ts`
- `src/core/types/index.ts`
- `src/main.ts`
  - 新增 `questionCardPosition`（`inline | above_input`）和 `showAnsweredQuestionCards`（`boolean`）设置字段、默认值与归一化逻辑
  - 新增插件级 `refreshQuestionUi()`，供设置改动后立即刷新当前 question dock 与历史渲染

- `src/features/settings/OpenCodianSettings.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
  - 在 Conversation 分组新增“提问框位置”下拉和“显示已回答问题卡片”开关
  - 设置切换后会立即刷新聊天历史和 question UI，而不是只写入配置
  - 补充 above-input dock 所需的中英文文案

- `src/features/chat/ui/QuestionDock.ts`
- `src/features/chat/ui/questionDockState.ts`
- `src/features/chat/OpenCodianView.ts`
  - 新增输入框上方 question dock：按 `question.header` 分组 tabs，支持 `single` / `all` 两种展示模式、分页/汇总进度、关闭/拒绝、草稿答案保留
  - pending question 改为按 tab 维护队列、草稿答案、当前分组和当前题索引；background tab 收到问题时只标 `needsAttention`
  - `showQuestionDialog()` 现在会按设置分流：`inline` 继续走原始内联表单，`above_input` 改为挂起到 dock 里等待用户处理
  - 会话加载、后台同步、切 tab 后都会按 `sessionId` 刷新 pending questions，保证 dock 可恢复
  - answered / rejected recap card 现在受 `showAnsweredQuestionCards` 控制；关闭时立即隐藏 UI，但仍保留 `questionResolution` 以便未来重新开启后恢复显示

- `styles.css`
  - 新增 question dock 容器、tabs、summary/progress、close 按钮、hidden 状态和 answered section 样式
  - 复用现有 inline question card 的选项与按钮视觉，避免两套分叉样式

- `tests/unit/core/types/settings.test.ts`
- `tests/unit/features/chat/questionDockState.test.ts`
- `tests/unit/features/settings/OpenCodianConversationSettings.test.ts`
  - 补充新设置默认值 / 归一化、dock 分组/提交流程、设置控件保存与即时刷新回归测试

- `AGENTS.md`
  - 同步记录 `QuestionDock` / `questionDockState` 的 UI 结构，以及 Conversation 设置分类与 chat question 能力说明

### 🧪 验证结果

- 通过：`npm run test -- tests/unit/core/types/settings.test.ts tests/unit/features/chat/questionDockState.test.ts tests/unit/features/settings/OpenCodianConversationSettings.test.ts`
- 通过：`npm run lint`
- 通过：`npm run build`（`BUILD_ID: main.202603302343`）
- 已部署到 Test Vault：`C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\`
- 已验证部署后的 `main.js` 包含 `BUILD_ID: main.202603302343`

### 📝 结论

- 这轮之后，question card 已经不再只能埋在 assistant 消息流里；用户可以按偏好切到输入框上方的固定 dock，并且 answered/rejected 回顾卡片也可以按需显隐，同时不会牺牲会话恢复、多 tab 隔离和历史上下文追溯能力。

## 2026-03-30 Question 卡片改为就地定稿，避免 assistant 尾部重绘

### 🎯 改动目标

- 避免 question 完成态依赖“流结束后重绘整条 assistant 消息”来保留卡片。
- 修复 question card 出现/下一题/完成态时滚动不贴底、点击后视图上跳的问题。
- 让“已回答 / 已拒绝”卡片先保留在原位，并支持折叠查看。

### ✅ 本轮调整

- `src/features/chat/OpenCodianView.ts`
  - assistant 最终态改成“流式 DOM 就地定稿 + 本地消息数据补全”，不再为了 question 结果去重绘整条消息
  - 把 assistant 内容渲染抽成 `renderAssistantMessageContent()`，尾部同步改为复用现有 DOM、只更新内容区和时间行
  - `questionResolution` 纳入 message render/visual signature，避免本地已回答卡片在后续 sync 中被当成异常差异
  - 带 `questionResolution` 的 assistant message 不再走 pseudo-stream reveal，避免完成态卡片被吞掉或顺序错乱
  - question inline card 改为复用同一个 DOM 容器，减少“下一题”时 remove/recreate 导致的跳动
  - question 交互按钮点击后会先 `blur()`，减少浏览器焦点回滚造成的视图上跳
  - 新增 `keepQuestionCardPinnedToBottom()`，question 出现、切题、完成态时都主动保持贴底

- `styles.css`
  - 为已回答卡片补充 `details/summary` 折叠样式
  - 增加折叠提示文案区域，完成态卡片现在可以收起/展开

### 🧪 验证结果

- 通过：`npm run typecheck`
- 通过：`npm run lint`

### 📝 结论

- 这轮后，question 结果不再依赖 assistant 结束时整条重绘来保留；当前方向改成更轻量的“原地更新”，同时把完成态卡片留在会话里，交互也更稳定。

## 2026-03-30 Question 卡片回答结果改为同条 assistant 内联呈现

### 🎯 改动目标

- 修复 OpenCode question 交互完成后，聊天渲染被拆成“tool summary + 已回答 notice + assistant 正文”三段的问题。
- 避免 question 流程结束时再额外插入一条持久 assistant notice，导致布局抖动和会话视觉割裂。

### ✅ 本轮调整

- `src/features/chat/OpenCodianView.ts`
  - `showQuestionDialog()` 不再在回答/拒绝后调用 `appendPersistentAssistantNoticeMessage()`
  - 改为在当前 streaming assistant 消息内部追加 resolved question inline card
  - 已回答 / 已拒绝状态现在与当前 assistant turn 保持同一消息流内呈现

- `styles.css`
  - 为 resolved question card 新增样式
  - 增加回答摘要列表样式，避免完成态只剩一块突兀的临时容器

### 🧪 验证结果

- 通过：`npm run typecheck`
- 通过：`npm run lint`
- 通过：`npm test -- tests/unit/core/types/settings.test.ts tests/unit/core/opencode/OpenCodeService.test.ts`

### 📝 结论

- 这轮之后，question 流程完成时不再平白多出一条独立 assistant notice；回答结果会留在当前 assistant turn 内，整体对话结构更连贯，也更接近“一段完整会话”的预期。

## 2026-03-30 OpenCode 提问支持逐题展示模式

### 🎯 改动目标

- 让用户可以决定 OpenCode 的一组问题是“一次全部展示”，还是“逐题展示、一题答完再问下一题”。
- 把该能力做成会话设置中的显式选项，而不是写死在 question card UI 里。

### ✅ 本轮调整

- `src/core/types/settings.ts`
  - 新增 `questionDisplayMode`
  - 支持 `all` / `single`
  - 默认保持当前行为：`all`

- `src/features/settings/OpenCodianSettings.ts`
  - 在“会话”设置区新增“提问展示方式”下拉项
  - 用户可以切换为“全部一起显示”或“逐题显示”

- `src/features/chat/OpenCodianView.ts`
  - question card 渲染拆成两条路径：
    - `all`：保留当前整组问题一次性展示
    - `single`：逐题展示，当前题回答后才进入下一题
  - 逐题模式下，所有问题答完后仍一次性回传完整 answers 数组给 OpenCode

- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
  - 新增 question display mode 设置文案
  - 新增逐题模式的进度与“下一题”文案

- `styles.css`
  - 新增逐题模式进度 badge 样式

- `tests/unit/core/types/settings.test.ts`
  - 新增 `questionDisplayMode` 默认值与归一化回归测试

- `AGENTS.md`
  - 同步更新聊天 question card 能力说明与会话设置分类说明

### 🧪 验证结果

- 通过：`npm run typecheck`
- 通过：`npm run lint`
- 通过：`npm test -- tests/unit/core/types/settings.test.ts tests/unit/core/opencode/OpenCodeService.test.ts`

### 📝 结论

- 到这一轮为止，OpenCodian 的 question card 已经不再只能“一次把所有问题砸出来”，而是可以按用户偏好切换成更平滑的逐题提问流程。

## 2026-03-30 文件选择器改为隐藏目录排除并扩展附件后缀支持

### 🎯 改动目标

- 按最新联动需求，把文件选择器的过滤规则收敛为“只排除隐藏目录/隐藏文件”，不再主观屏蔽可见工程目录。
- 让 picker 不只面向 `.md`，而是能展示更多常见附件，并按后缀排序、按后缀筛选与搜索。
- 修复 picker 行高和排版过挤的问题，让文件名、路径、后缀 badge 的视觉层次稳定下来。

### ✅ 本轮调整

- `src/shared/obsidianContext.ts`
  - 移除 `node_modules`、`dist` 等“噪音目录”硬编码排除
  - `isEligibleContextFilePath()` 现在只根据“是否位于隐藏路径中”与“是否有后缀”决定是否进入 picker
  - 新增更完整的上下文 MIME 映射，覆盖图片、PDF、Office、压缩包、音视频和常见代码文件

- `src/features/chat/OpenCodianView.ts`
  - picker catalog 继续沿用缓存与增量更新，不退回到每次点击都全量重扫
  - 候选文件排序调整为“后缀 -> 文件名 -> 路径”
  - 本地模式下允许把非文本附件作为 file context 加入；远程模式仍只允许文本文件，并给出明确提示

- `src/features/chat/ui/ContextFilePickerModal.ts`
  - 搜索框改为同时匹配文件名、路径和后缀
  - 后缀筛选条增加区块标题和结果统计
  - picker 首屏默认显示全部后缀，不再强制跳到 `.md`

- `styles.css`
  - 后缀筛选 chips 改成接近设置面板快捷跳转的交互风格
  - 文件卡片增加高度、留白和 badge 对齐空间，避免文字挤压和错位

- `tests/unit/shared/obsidianContext.test.ts`
  - 回归测试更新为“隐藏路径排除 + 可见附件允许”
  - 新增附件 MIME 解析断言

- `AGENTS.md`
  - 同步刷新目录结构、OpenCodeService / OpenCodianView 现状、完整本地存储说明与 Obsidian 联动文档索引

### 🧪 验证结果

- 通过：`npm run typecheck`
- 通过：`npm run lint`
- 通过：`npm test -- tests/unit/shared/obsidianContext.test.ts tests/unit/core/opencode/OpenCodeService.test.ts`

### 📝 结论

- 这轮之后，picker 的行为更接近 Obsidian 用户预期：只避开隐藏区域，不擅自替你决定哪些可见目录算“噪音”；同时附件浏览、后缀筛选和实际发送能力也终于对齐了。

## 2026-03-30 文件选择器噪音目录排除补强与列表项错位修正

### 🎯 改动目标

- 修复 picker 仍然把测试库里的工程噪音目录算进候选文件，导致文件数量明显异常的问题。
- 修复文件项标题、路径和后缀 badge 挤在一起、错位重叠的问题。

### ✅ 本轮调整

- `src/shared/obsidianContext.ts`
  - 在隐藏目录过滤之外，新增噪音目录段排除
  - 现在会额外排除：`node_modules`、`dist`、`build`、`coverage`、`.obsidian`、`.opencode`、`.opencodian`、`.git` 等常见工程噪音目录

- `src/features/chat/ui/ContextFilePickerModal.ts`
  - catalog 加载完成后，如果存在 `.md` bucket，默认优先切到 `.md`
  - picker 首屏更贴近“选笔记”而不是“扫整个工程”

- `styles.css`
  - 文件项改为显式 `justify-content: flex-start`
  - 增加 `min-height`
  - 头部改为 `align-items: flex-start`
  - 文件名、路径、后缀 badge 的 margin / padding / 对齐方式重新收束，避免视觉重叠

- `tests/unit/shared/obsidianContext.test.ts`
  - 新增 `node_modules` 与 `dist` 排除断言

### 🧪 验证结果

- 通过：`npm run typecheck`
- 通过：`npm run lint`
- 通过：`npm test -- tests/unit/shared/obsidianContext.test.ts`

### 📝 结论

- 这轮之后，picker 不再只是“过滤点号目录”，而是会主动绕开常见工程噪音；同时列表项本身也从容易重叠的状态修到了更稳定的块级排版。

## 2026-03-30 选区上下文会话失响应定位与本地 text/plain 归一化

### 🎯 改动目标

- 排查“发送选中文本后，当前会话后续普通消息也只出现红色错误条/空白条”的问题。
- 给出能直接在测试库控制台里观察到的关键调试信号，而不是只靠 UI 现象猜测。

### ✅ 本轮调整

- `src/core/opencode/OpenCodeService.ts`
  - 本地模式下，Obsidian 文本上下文的 `file part` 统一按 `text/plain` 发送
  - 这样 OpenCode 会走更稳定的“Read tool 文本展开”路径，而不是把 Markdown/文本笔记作为数据附件继续向下传
  - hydration 阶段不再把 user message 里的 synthetic `Called the Read tool...` 文本混进可见正文
  - 新增 debug / warn 日志：
    - 发送本地 Obsidian context part 时，打印 `kind/path/requestedMime/normalizedMime`
    - 流结束时若没有 assistant message，打印 `sessionId/messageCount/roles/lastUserId`

- `tests/unit/core/opencode/OpenCodeService.test.ts`
  - 本地上下文 part 映射测试改为断言 `text/plain`
  - 新增 synthetic Read tool 文本不会污染 user 正文的回归测试

### 🧪 验证结果

- 通过：`npm test -- tests/unit/core/opencode/OpenCodeService.test.ts`
- 通过：`npm run typecheck`
- 通过：`npm run lint`

### 📝 结论

- 这轮不是只加日志，而是先根据 OpenCode 参考实现把一个高概率根因修掉了：本地文本上下文如果按 `text/markdown` 等 MIME 走下去，可能会进入更不稳定的附件链路；现在先统一收敛到 `text/plain`，同时把关键调试日志补齐，便于继续验证会话是否恢复正常。

## 2026-03-30 文件选择器隐藏目录过滤、后缀筛选与缓存 catalog

### 🎯 改动目标

- 让 `选择文件` 弹窗不再加载 `.obsidian`、`.git` 这类隐藏目录中的内容。
- 修复基于 `resolveTextMimeFromPath()` 默认值的误判，避免 `.png` 等二进制附件继续混进“文本上下文文件”列表。
- 避免每次打开 picker 都重新从头扫描和整理整份 vault 文件列表。
- 为 picker 增加按文件后缀筛选的入口，并把列表项高度和信息层级拉开，减少拥挤感。

### ✅ 本轮调整

- `src/shared/obsidianContext.ts`
  - 新增 `getContextPathExtension()`
  - 新增 `isHiddenContextPath()`
  - 新增 `isEligibleContextFilePath()`
  - picker 现在只接受“非隐藏路径 + 已知文本后缀”的文件

- `src/features/chat/OpenCodianView.ts`
  - 将文件上下文候选集从“临时数组”升级为可复用的 `ContextFileCatalog` 缓存
  - 首次构建 catalog 时按批次处理，避免长时间阻塞
  - `create` / `delete` / `rename` 事件尽量增量更新缓存，而不是每次重新全量扫描

- `src/features/chat/ui/ContextFilePickerModal.ts`
  - picker 改为消费 catalog，而不是每次打开时自己重新整理文件列表
  - 新增后缀筛选条：`全部` + 各扩展名 bucket
  - 每个列表项新增后缀 badge
  - 保留首屏最多 `200` 条结果的策略，但现在可以先按后缀再搜，缩小范围更直接

- `styles.css`
  - 新增后缀筛选条样式
  - 提升列表项高度、内边距、行高和头部布局
  - 文件名与路径的呼吸感更大，减少“上下挤在一起”的观感

- `tests/unit/shared/obsidianContext.test.ts`
  - 新增回归测试，覆盖隐藏目录过滤、已知文本后缀提取、二进制文件排除

### 🧪 验证结果

- 通过：`npm run typecheck`
- 通过：`npm run lint`
- 通过：`npm test -- tests/unit/shared/obsidianContext.test.ts tests/unit/core/opencode/OpenCodeService.test.ts`

### 📝 结论

- 到这一轮为止，文件上下文 picker 已经从“全量堆列表的临时实现”进化成了更接近正式组件的形态：候选文件来源更干净、打开代价更低、筛选路径更明确、视觉也不再那么挤。

## 2026-03-30 文件上下文选择器异步化与样式收束

### 🎯 改动目标

- 修复点击 `选择文件` 时把 vault 文件筛选、排序、全量 DOM 渲染都塞进同一个 click handler，导致控制台出现长时间 `Violation` 警告的问题。
- 收拾文件选择器与上下文 chip 的视觉层级，让它们不再像临时拼装出来的调试控件。

### ✅ 本轮调整

- `src/features/chat/ui/ContextFilePickerModal.ts`
  - `chooseContextFile()` 改为接收 loader，而不是在点击前就把全量文件数组准备好
  - modal 打开后先显示 loading 状态，再异步加载文件列表
  - 文件索引按批次构建，避免一次性长任务
  - 搜索结果首屏限制为前 `200` 项，超出时显示摘要提示，减少首屏 DOM 数量与回流开销

- `src/features/chat/OpenCodianView.ts`
  - 可选文本文件列表增加简单缓存
  - 在 vault `create` / `delete` / `rename` 时失效缓存
  - `选择文件` 点击时直接打开 picker，不再同步预先扫完整个 vault

- `styles.css`
  - 重做文件选择器标题、搜索框、列表项、空状态与摘要提示样式
  - 重做 context chip：弱化“外层大胶囊 + 内层默认按钮”的割裂感，提升信息层级和可读性

- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
  - 新增加载态与“仅显示前 N 条匹配结果”文案

### 🧪 验证结果

- 通过：`npm run typecheck`
- 通过：`npm run lint`

### 📝 结论

- 这轮之后，文件选择器会更快地先把 modal 打开，再逐步准备可选文件列表；同时 UI 也从“能用但很糙”的状态收束成了更接近插件整体风格的正式控件。

## 2026-03-30 Obsidian 上下文按钮焦点修复与本地文件回填清洗

### 🎯 改动目标

- 修复在 OpenCodian 聊天面板内点击 `当前笔记` / `当前选区` 时，经常提示“请先打开一个笔记”的问题。
- 修复本地模式下发送 vault 文件上下文后，服务端把 user message 回填成 `原始问题 + Called the Read tool with the following input...`，导致用户气泡正文被污染、上下文附件丢失的问题。

### ✅ 本轮调整

- `src/features/chat/OpenCodianView.ts`
  - `getActiveMarkdownView()` 不再只依赖当前活动视图
  - 新增对最近 Markdown 文件路径和已打开 markdown leaf 的回退查找
  - 即使当前焦点已经切到 OpenCodian 视图，仍然能回找到最近的笔记与选区来源

- `src/core/opencode/OpenCodeService.ts`
  - 为 user message hydration 新增本地文件上下文清洗逻辑
  - 识别 `Called the Read tool with the following input: {...}` 这种服务端回填文本
  - 从中提取 `filePath` / `file_path` / `path` / `notebook_path`
  - 把该段文本从用户正文剥离，恢复成 `contextAttachments`
  - 增加上下文附件去重，避免 file part 与清洗逻辑重复添加

- `tests/unit/core/opencode/OpenCodeService.test.ts`
  - 新增回归测试，覆盖“本地文件上下文被回填成 Read tool 文本”场景

### 🧪 验证结果

- 通过：`npm test -- --runTestsByPath tests/unit/core/opencode/OpenCodeService.test.ts`
- 通过：`npm run typecheck`
- 通过：`npm run lint`

### 📝 结论

- 这轮修复后，聊天面板内的上下文按钮不再过度依赖当前焦点；同时本地文件上下文在会话同步后，也会尽量恢复成“正常用户文本 + 上下文附件”的展示，而不是把底层 Read tool 回填内容直接暴露给用户。

## 2026-03-30 Obsidian 联动 MVP 状态文档补齐

### 🎯 改动目标

- 为已经落地的 Obsidian 联动 MVP 补一份可接力的开发状态文档，避免后续继续开发时只能先读代码倒推设计。
- 把这期的范围、已实现能力、未实现项、存储同步原则和关键文件职责统一整理到 `docs/`。

### ✅ 本轮调整

- 新增文档：`docs/obsidian-linkage-mvp-status.md`
- 文档内容覆盖：
  - 本期目标与非目标
  - 聊天侧 Obsidian 联动的方案总览
  - context tray / 命令 / 本地与远程上下文映射
  - `question.asked` / `file.edited + session.diff()` 联动
  - 本地完整存储原则
  - 已实现 / 未实现 / 下一步建议
  - 关键文件与职责、当前验证状态

### 🧪 验证结果

- 通过：`npm run check:devlog-order`

### 📝 结论

- 现在这轮 Obsidian 联动 MVP 已经有了单独的开发状态文档，后续继续做上下文增强、diff 展示或 `inline edit` 时，可以先看文档再进代码，接力成本会低很多。

## 2026-03-30 表格长链接换行与显示增强

### 🎯 改动目标

- 修复 assistant 消息里的 Markdown 表格在包含超长 URL 时，会把聊天面板横向撑破的问题。
- 让表格内链接在保持可点击的前提下，不影响其它普通段落、代码块和 Obsidian 原生 Markdown 渲染行为。
- 在 CSS 兜底之外，为“表格内直接显示原始超长 URL”的场景补一个更易读的显示增强。

### ✅ 本轮调整

- `styles.css`
  - 为聊天消息与流式消息作用域下的表格增加 `table-layout: fixed`
  - 保留现有表格单元格换行能力，并为 `th` / `td` 内的链接补上 `overflow-wrap: anywhere` 与 `word-break: break-all`
  - 修复范围严格限制在 `.opencodian-message-text` / `.streaming-text-block` 内，不影响其它渲染区域

- `src/utils/markdown/MarkdownRenderer.ts`
  - 在 Markdown 渲染完成后新增表格链接增强步骤
  - 仅当命中 `table a[href]`、链接显示文本与 `href` 完全相同、且 URL 长度超过阈值时，才对可见文本做截断
  - 截断格式为“前段 + ... + 后段”，同时保留原始 `href`
  - 将完整 URL 写入 `title` 与 `aria-label`，保证 hover 与可访问性场景下仍可拿到完整地址
  - 自定义链接文本与非表格链接保持不变

- `tests/unit/utils/markdown/MarkdownRenderer.test.ts`
  - 新增表格长 URL 截断测试
  - 验证表格内原始超长 URL 会被缩短显示，但 `href` 保持原值
  - 验证表格内自定义链接文本不受影响
  - 验证普通段落中的链接文本不受影响

### 🧪 验证结果

- 通过：`npm test -- --runTestsByPath tests/unit/utils/markdown/MarkdownRenderer.test.ts`
- 通过：`npm run build`
- 已部署到测试库并确认 `BUILD_ID`：`main.202603301733`

### 📝 结论

- 这轮改动把“超长 URL 撑破表格布局”的问题拆成了两层处理：CSS 负责让表格宽度服从聊天容器，渲染后处理负责改善原始长链接的可读性。最终效果是表格不会再横向失控，链接仍可点击，且改动范围限定在聊天消息表格内。

## 2026-03-30 Batch 失败态与用户拒绝工具态映射修正

### 🎯 改动目标

- 修复 `batch` 工具在部分子工具失败时，虽然输出里已经明确写出失败数量，但工具卡片仍显示绿 `√` 的问题。
- 修复用户主动关闭问题、拒绝权限、或命中显式权限规则时，工具卡片统一被当成红色错误，而不是更贴近语义的阻塞/拒绝状态的问题。
- 补齐这类“上游返回 completed / error，但 UI 需要按语义再映射”的状态判定规则。

### ✅ 本轮调整

- `src/shared/toolExecution.ts`
  - 新增阻塞态结果文本匹配规则 `BLOCKED_RESULT_PATTERNS`
  - 将以下结果统一映射为 `blocked`：
    - `The user dismissed this question`
    - `The user rejected permission to use this specific tool call`
    - `The user has specified a rule which prevents you from using this specific tool call`
  - 扩展显式失败元数据判断：当 `metadata.failed` 为数值且大于 `0` 时，也判定为失败
  - 保持现有 `invalid`、`bash` 非零退出 / 典型失败输出等错误识别逻辑不变

- `tests/unit/core/opencode/OpenCodeService.test.ts`
  - 新增 `batch` 局部失败时应映射为 `error` 的断言
  - 新增问题关闭应映射为 `blocked` 的断言
  - 新增权限拒绝应映射为 `blocked` 的断言
  - 新增权限规则阻止应映射为 `blocked` 的断言

### 🧪 验证结果

- 通过：`npm test -- tests/unit/core/opencode/OpenCodeService.test.ts tests/unit/utils/streaming/ToolCallRenderer.test.ts`
- 通过：`npm run build`
- 通过：`npm run check:devlog-order`
- 已部署到测试库并确认 `BUILD_ID`：`main.202603301719`

### 📝 结论

- 这轮改动把“部分失败却显示成功”和“用户拒绝却显示普通错误”这两类状态语义问题补齐了：`batch` 的失败数量现在能稳定转成红错，而用户主动拒绝/关闭导致的上游 error 则会更准确地显示为阻塞态。

## 2026-03-30 工具摘要全量补齐与 Bash 失败状态修正

### 🎯 改动目标

- 修复 `bash` 工具在命令实际失败、输出明确错误时，工具卡片先显示红 `×`、消息结束后又错误翻成绿 `√` 的状态误判。
- 让 `skill` 工具在调用一开始就直接显示所加载的 skill 名称，不再只出现一个空白或信息不足的工具项。
- 将工具栏摘要补齐到更多 OpenCode 常见工具，按工具类型展示更直观的关键信息，减少只看到原始工具名却不知道它在做什么的情况。

### ✅ 本轮调整

- `src/shared/toolExecution.ts`
  - 扩充 `bash` 失败输出识别规则
  - 新增对 `rm: cannot remove ... No such file or directory`、`curl: (35) ... SSL/TLS connection failed`、握手失败等典型失败输出的识别
  - 让这类已完成但实际失败的 `bash` 结果稳定归类为 `error`，不再被后续状态收敛逻辑误判成 `completed`

- `src/utils/streaming/ToolCallRenderer.ts`
  - 补全更多工具的显示名与图标映射
  - 将工具摘要逻辑扩展为按类型生成：
    - `read`：文件名 + 读取范围
    - `write` / `edit`：文件名
    - `multiedit`：文件名 + 编辑次数
    - `apply_patch` / `patch`：补丁涉及文件数或文件名
    - `list`：目录名
    - `glob` / `grep`：模式、包含规则、目录摘要
    - `lsp`：操作名 + 文件位置
    - `websearch` / `webfetch` / `codesearch`：查询或 URL
    - `task`：子代理类型 + 描述
    - `question`：问题标题或问题数
    - `skill`：skill 名称，生成时立即可见
    - `todoread` / `todowrite`：当前任务或任务进度摘要
    - `plan_enter` / `plan_exit`：模式切换提示

- `tests/unit/core/opencode/OpenCodeService.test.ts`
  - 新增 `rm` 缺失文件报错输出识别测试
  - 新增 `curl` TLS 握手失败输出识别测试

- `tests/unit/utils/streaming/ToolCallRenderer.test.ts`
  - 新增 `skill` 工具即时显示 skill 名称测试
  - 新增多类工具摘要渲染测试，覆盖 `read`、`multiedit`、`apply_patch`、`list`、`glob`、`grep`、`lsp`、`websearch`、`webfetch`、`task`、`question`、`todoread`

### 🧪 验证结果

- 通过：`npm test -- tests/unit/utils/streaming/ToolCallRenderer.test.ts tests/unit/core/opencode/OpenCodeService.test.ts`
- 通过：`npm run check:devlog-order`
- 通过：`npm run build`
- 已部署到测试库并确认 `BUILD_ID`：`main.202603301655`

### 📝 结论

- 这轮改动把工具卡片的可读性从“只显示工具名”提升为“按工具类型直接显示关键上下文”，同时修正了 `bash` 工具在明显失败场景下的状态反转问题；像 `skill` 这类工具也能在生成时立刻看出它具体调用了什么。

## 2026-03-30 用户消息原始标记代码化显示与会话开关

### 🎯 改动目标

- 解决用户消息中直接包含 `CSS` / `HTML` / `JS` / `XML` / `SVG` 等原始标记时，被 Obsidian Markdown 渲染链当作真实内容参与渲染的问题。
- 在不破坏现有用户消息 Markdown 展示能力的前提下，让这类原始标记优先以代码格式安全显示。
- 增加一个会话设置开关，允许在“原始标记代码化显示”和“沿用原始 Markdown 渲染”之间切换。

### ✅ 本轮调整

- `src/features/chat/userMessageDisplay.ts`
  - 新增用户消息显示预处理层，专门处理原始标记内容
  - 将 `<style>...</style>` 转成 `css` fenced code block
  - 将 `<script>...</script>` 转成 `javascript` fenced code block
  - 将独立的 `HTML` / `SVG` / `XML` 声明 / `MathML` / `DOCTYPE` / `comment` / `CDATA` 等统一归入 `html` fenced code block
  - 对未成块、残缺或 inline 的原始标记片段做转义，避免被 Markdown 渲染链继续解析

- `src/features/chat/OpenCodianView.ts`
  - 用户消息显示改为先走 `prepareUserMessageMarkdownForDisplay()`，再进入现有 Markdown 渲染流程
  - 新增当前会话重渲染入口，供设置开关切换后立即刷新聊天区
  - 保持 assistant 消息与其它现有渲染逻辑不变，只对用户消息显示链路做最小改动

- `src/core/types/settings.ts` / `src/main.ts`
  - 新增设置项 `renderUserMarkupAsCodeBlocks`
  - 默认值设为 `true`，保持当前安全显示行为
  - 加入设置加载与兼容归一化逻辑，旧配置缺失该字段时自动回退到默认值
  - 新增插件级 `refreshConversationRendering()`，用于统一刷新已打开的聊天视图

- `src/features/settings/OpenCodianSettings.ts`
  - 在“会话”设置分区新增开关
  - 切换后保存设置，并立即触发当前聊天视图重渲染，无需手动关闭重开

- `src/i18n/locales/en.ts` / `src/i18n/locales/zh.ts`
  - 补充会话设置开关的中英文文案

- `tests/unit/features/chat/userMessageDisplay.test.ts`
  - 新增并扩展用户消息预处理单测
  - 覆盖 `CSS`、`JS`、`HTML`、`SVG`、`XML`、`MathML`、`DOCTYPE`、`comment`、`CDATA`、inline / dangling 标记等场景

- `tests/unit/core/types/settings.test.ts`
  - 新增默认设置断言，确保 `renderUserMarkupAsCodeBlocks` 默认开启

### 🧪 验证结果

- 通过：`npm run test -- tests/unit/core/types/settings.test.ts tests/unit/features/chat/userMessageDisplay.test.ts tests/unit/features/settings/OpenCodianSettings.test.ts`
- 通过：`npx eslint src/core/types/settings.ts src/main.ts src/features/chat/OpenCodianView.ts src/features/settings/OpenCodianSettings.ts src/i18n/locales/en.ts src/i18n/locales/zh.ts tests/unit/core/types/settings.test.ts tests/unit/features/chat/userMessageDisplay.test.ts tests/unit/features/settings/OpenCodianSettings.test.ts`
- 通过：`npm run check:devlog-order`
- 通过：`npm run build`
- 已部署到测试库并确认 `BUILD_ID`：`main.202603301613`

### 📝 结论

- 这轮改动把“用户消息里的原始标记被直接渲染”的问题收敛到了一个专门的显示预处理层里，默认以安全、可读的代码格式呈现，同时又保留了会话级设置开关，便于后续在安全性与原始渲染体验之间切换。

## 2026-03-30 后台任务陈旧运行态判定与失联提示卡补强

### 🎯 改动目标

- 解决 OpenCodian 在本地 OpenCode 服务被终止、停止后重启，或后台任务未再回写时，聊天区仍长期显示“后台任务仍在运行”的误判。
- 让后台任务面板不再只依赖历史 `task` launch / OMO completion reminder，而是结合 OpenCode 当前会话 live 状态判断是否真的还在运行。
- 当面板被判定为陈旧并移除时，补一个明确的 warning 提示卡，向用户解释为什么“运行中”面板消失了。

### ✅ 本轮调整

- `src/core/opencode/OpenCodeService.ts` / `src/core/opencode/index.ts`
  - 新增 `getSessionStatuses()`，接入 SDK `session.status()` 与 legacy `/session/status` fallback
  - 新增 `session.status` 全局 sync event 订阅与归一化，和原有 `todo.updated` 共用同一条 sync 订阅链路
  - 对外导出 `SessionActivityStatus`，供聊天视图按 `idle` / `busy` / `retry` 区分当前会话是否仍然 live

- `src/features/chat/OpenCodianView.ts`
  - 为每个 tab runtime 增加会话状态缓存与请求序号，避免异步刷新串台
  - 在打开会话、切换标签、后台同步轮询时，同时刷新 session todo 和 session status
  - 将后台任务面板显示条件改为“历史 launch 记录 + 当前会话 live 状态 + 未完成 todo + 短暂宽限期”联合判定
  - 当会话已经 `idle`、没有未完成 todo、也没有新的 live 信号时，自动清理陈旧的“后台任务仍在运行”面板
  - 清理时追加 warning notice，解释当前无法再确认这些后台任务仍在运行，并列出被停止跟踪的任务

- `src/i18n/locales/en.ts` / `src/i18n/locales/zh.ts`
  - 新增后台任务陈旧状态提示卡标题、正文与“已停止跟踪”任务状态文案

- `tests/unit/core/opencode/OpenCodeService.test.ts`
  - 新增 `session.status()` 归一化测试
  - 新增 `session.status` sync event 分发测试

- `docs/opencode-service-sdk-v2-mapping.md`
  - 同步记录 `session.status` 与 `todo.updated` 已纳入当前 sync/live 判断链路

### 🧪 验证结果

- 通过：`npm test -- OpenCodeService.test.ts`
- 通过：`npm run build`
- 已部署到测试库并确认 `BUILD_ID`：`main.202603301519`

### 📝 结论

- 这轮修复把后台任务面板从“历史消息推断”升级为“历史 launch + 当前 live 状态”联合判断，能更稳地处理服务停止、重启、掉线、未回写等场景，避免把已经失联的后台任务继续误显示为运行中。

## 2026-03-30 聊天待办面板与工具摘要显示修复

### 🎯 改动目标

- 解决聊天底部待办面板偶发需要“切换标签再切回来”才出现的问题，尽量让 `todowrite` 一到达就驱动 UI 更新。
- 修复重载 Obsidian 后，明明没有后台任务却仍然出现“后台任务准备中”提示的误判。
- 优化工具块摘要显示，让 `read` / `write` / `edit` 直接显示文件名，`todo` 工具直接显示任务进度和任务名预览。

### ✅ 本轮调整

- `src/features/chat/OpenCodianView.ts`
  - 为会话 todo 增加视图层归一化与去重，避免同内容/同状态的重复 todo 在 dock 中重复显示
  - 新增流式 `todowrite` 快照应用逻辑，在工具流过程中就把最新待办写入对应标签页的 todo dock
  - 在 `todowrite` / `todoread` 结束后立即补拉一次服务端 session todo，减少 UI 只在切标签后才同步的概率
  - 调整后台任务恢复判断：若只是历史 `search-mode` 注入、后续已存在消息且没有真实 task launch，则不再显示“后台任务准备中”
  - 顺手收敛输入框 placeholder 获取逻辑，并避免在无消息且无 rewind 恢复场景下额外渲染空对话提示

- `src/utils/streaming/ToolCallRenderer.ts`
  - `read` / `write` / `edit` 支持从 `file_path`、`filePath`、`path`、`notebook_path` 等字段提取文件名摘要
  - `todowrite` / `todoread` 摘要改为显示“完成数/总数 + 任务名预览”，减少必须点开工具块才能知道内容的情况
  - 为工具摘要补上 `title`，鼠标悬停时可查看完整文本

- `src/i18n/locales/en.ts` / `src/i18n/locales/zh.ts` / `styles.css`
  - 调整聊天输入框占位文案，并为 placeholder 补充更稳定的弱化样式

- `tests/unit/utils/streaming/ToolCallRenderer.test.ts`
  - 新增工具摘要单测，覆盖文件名提取与 todo 任务名预览显示

### 🧪 验证结果

- 通过：`node scripts/run-jest.js tests/unit/utils/streaming/ToolCallRenderer.test.ts --runInBand`
- 通过：`npm run build`
- 已部署到测试库并确认 `BUILD_ID`：`main.202603301433`

### 📝 结论

- 这轮改动把 todo dock 的可见性更新从“主要依赖后续刷新/切标签触发”前移到了工具流本身，同时收紧了后台任务恢复条件，减少重载后残留提示和重复 todo 的概率。

## 2026-03-30 设置面板滚动记忆防漂移修复

### 🎯 改动目标

- 解决 OpenCodian 设置页在反复切换 Obsidian 原生设置入口与插件设置入口时，滚动位置有时能记住、有时又会自动向下滑动的问题。
- 尽量避免依赖 reflow 方案，优先从滚动锚点与错误状态写回的根因上修复。

### ✅ 本轮调整

- `src/features/settings/OpenCodianSettings.ts`
  - 为设置面板根节点增加 `overflow-anchor: none`，降低内容异步变化导致的自动滚动锚定漂移
  - 将滚动恢复改为“短暂稳态恢复”流程：恢复命中目标后不会立刻结束，而是等待一个很短的稳定窗口
  - 在恢复窗口内暂停 `settingsPanelScrollTop` 的持久化写回，避免切页或面板内部补渲染时把错误位置保存成新的记忆位置
  - 新增恢复期滚动监听；如果打开后又被外部布局变化带偏，会自动拉回目标位置后再完成恢复
  - 保留现有 `animation-frame` / `timeout` / `mutation` 多通道恢复机制，但减少无意义重复确认，避免把“稳定完成”不断向后推迟

- `tests/unit/features/settings/OpenCodianSettings.test.ts`
  - 更新原有恢复日志测试，适配新的稳态完成时序
  - 新增“恢复后发生滚动漂移时会重新拉回目标位置”的单测，覆盖本次问题的核心场景

### 🧪 验证结果

- 通过：`npm run test -- OpenCodianSettings.test.ts`
- 通过：`npm run build`
- 已部署到测试库并确认 `BUILD_ID`：`main.202603301408`

### 📝 结论

- 这次修复的重点不再是“多做几次 reflow”，而是阻止设置页在打开初期被滚动锚点或异步布局变化带偏，同时避免错误滚动值反写进持久化状态。

## 2026-03-30 Provider Icon Cache Modal 批量添加与滚动位置优化

### 🎯 改动目标

- 解决提供商图标缓存窗口在每次添加一个图标来源后自动滚回顶部的问题，减少连续维护多个 provider 时的操作打断。
- 支持一次粘贴多个图标链接批量导入，兼容空格、逗号、换行分隔，降低手动重复添加成本。

### ✅ 本轮调整

- `src/features/settings/ProviderIconCacheModal.ts`
  - 将单行输入改为多行输入，支持批量粘贴多个图标来源
  - 回车逻辑调整为 `Ctrl/Cmd + Enter` 提交，避免换行输入时误触发
  - 添加后保留弹窗滚动位置；删除、自定义图标置顶、拖拽排序后也保持当前位置
  - 批量导入时支持部分成功，成功后刷新列表并提示首个失败原因

- `src/utils/icons/ProviderIconService.ts`
  - 新增批量来源拆分逻辑
  - 支持按空格、逗号、换行拆分多个 URL
  - 保留包含空格的本地绝对路径，避免误拆
  - 避免把单个包含逗号的 URL 错误拆成多个来源

- `styles.css`
  - 调整图标来源输入区布局，适配多行文本框与批量导入提示

- `src/i18n/locales/en.ts` / `src/i18n/locales/zh.ts`
  - 更新占位文案与帮助提示，明确支持批量粘贴

- `tests/unit/utils/icons/ProviderIconService.test.ts`
  - 新增批量拆分规则测试，覆盖空格、逗号、换行、本地路径空格、URL 含逗号等场景

### 🧪 验证结果

- 通过：`npx jest tests/unit/utils/icons/ProviderIconService.test.ts --runInBand`
- 通过：`npm run typecheck`
- 通过：`npm run build`
- 已部署到测试库并确认 `BUILD_ID`：`main.202603301345`

### 📝 结论

- 这次改动把“连续添加图标来源时的滚动打断”和“多个来源必须逐条粘贴”的两个高频操作痛点一起解决了，图标缓存弹窗现在更适合批量维护。

## 2026-03-30 会话 Todo Dock（正统方案接入）

### 🎯 改动目标

- 按 OpenCode 官方数据流接入会话级 Todo，而不是只把 `todowrite` 当普通工具卡渲染。
- 让 OpenCodian 能通过 SDK 获取 `session.todo()` 快照，并通过 `global.syncEvent.subscribe()` 持续接收 `todo.updated` 增量事件。

### ✅ 本轮调整

- `src/core/opencode/OpenCodeService.ts`
  - 新增 `getSessionTodos(sessionId)`，优先走 SDK `session.todo()`，失败时回退 `/session/:id/todo`
  - 新增 `subscribeToSessionTodoUpdates()`，通过 `global.syncEvent.subscribe()` 消费 `todo.updated`
  - 增加 todo 数据归一化与 sync loop 生命周期管理

- `src/features/chat/OpenCodianView.ts`
  - 为每个 tab 增加独立的 todo 运行时状态，避免多会话串数据
  - 会话切换、加载、流结束、后台同步后都会刷新当前会话 todo
  - 将 todo 面板挂载到输入区上方，作为会话级 UI，而非工具消息的一部分

- `src/features/chat/ui/SessionTodoDock.ts`（新增）
  - 新增会话 todo dock，显示进度、当前进行项、折叠/展开列表

- `src/utils/streaming/ToolCallRenderer.ts`
  - 仍保留 `todowrite` / `todoread` 的工具卡摘要，但不再承担主 todo 展示职责

- `styles.css` / `src/i18n/locales/*.ts`
  - 补齐 dock 样式与中英文文案

### 🧪 验证结果

- 通过：`npm run typecheck`
- 通过：`node scripts/run-jest.js tests/unit/core/opencode/OpenCodeService.test.ts`

### 📝 结论

- 之前“只出现 Todo 卡片、不出现真正待办列表”的根因并不在前端渲染本身，而在于未按 OpenCode 官方方案接 `session.todo()` + `global.syncEvent.subscribe()` 这条会话级数据链路。

## 2026-03-30 AGENTS.md 文档同步（设置分组 / 图标缓存 / 重载约束）

### 🎯 改动目标

- 让 `AGENTS.md` 与当前代码实现保持一致，避免后续开发或代理工作继续参考过期文档。

### ✅ 本轮调整

- 更新 `src/features/settings/` 目录说明，补充 `ProviderIconCacheModal.ts`
- 更新存储结构说明，补充 `.opencodian/provider-icons/` 本地图标缓存目录
- 更新设置分类说明：
  - 将原来的 **Title Generation** 改为一级分组 **Conversation**
  - 将 provider 图标缓存 / 自定义图标库管理归入 **Model**
- 补充热重载恢复约束，说明 `main.ts` 必须先完成 `loadConversations()` 再注册/恢复视图

### 📝 备注

- 本次仅同步开发文档，不涉及运行时逻辑改动

## 2026-03-30 Provider Icon Cache（提供商图标缓存）功能

### 🎯 改动目标

- 为模型选择器添加可扩展的提供商图标系统，支持从 Lobehub CDN、本地文件和自定义 URL 加载图标。
- 提供图标缓存机制，避免重复下载，支持离线使用已缓存图标。
- 允许用户管理每个提供商的图标源（映射图标、自定义 URL、本地文件），并可设置默认图标。
- 保持向后兼容，现有行为不受影响。

### ✅ 本轮调整

#### 1. 核心类型定义

- `src/core/types/settings.ts`
  - 新增 `ProviderIconEntryType` 类型：`'mapped' | 'url' | 'file'`
  - 新增 `ProviderIconEntry` 接口：定义图标条目结构（id, type, source, mimeType, cacheFileName, addedAt, updatedAt）
  - 新增 `ProviderIconLibrary` 类型：`Record<string, ProviderIconEntry[]>`
  - 新增 `normalizeProviderIconLibrary()` 函数：安全地规范化用户配置的图标库数据
  - `OpenCodianSettings` 接口新增 `providerIconLibrary` 字段
  - `DEFAULT_SETTINGS` 添加 `providerIconLibrary: {}`

- `src/core/types/index.ts`
  - 导出新增的类型定义

#### 2. Provider Icon Service 重构与扩展

- `src/utils/icons/ProviderIconService.ts`
  - 新增缓存目录常量 `ICON_CACHE_DIR = '.opencodian/provider-icons'`
  - 新增缓存限制：最大 1MB 文件大小，支持 SVG/PNG/JPEG/WebP/GIF 格式
  - 新增状态管理 Map：resolvedIconUrls, inFlightIconLoads, failedIconIds
  - 新增接口定义：ProviderIconCacheEntry, ProviderIconProviderState, ProviderIconCacheSummary 等
  - 新增 `resolveIconUrl()` 方法：异步解析图标 URL，优先从缓存读取，支持重试失败项
  - 新增 `loadIconAsset()` 方法：从 URL 或本地路径加载图标数据
  - 新增 `saveIconToCache()` / `readIconFromCache()`：缓存管理
  - 新增 `addIconToLibrary()` / `removeIconFromLibrary()`：图标库增删
  - 新增 `setDefaultIconForProvider()`：设置提供商的默认图标
  - 新增 `getProviderCacheState()`：获取完整的缓存状态概览
  - 新增 `refreshIconCache()` / `warmIconCache()`：缓存刷新与预热
  - 新增 `getCacheDirectory()` / `ensureCacheDirectory()`：缓存目录管理
  - 新增 `parseCustomSource()`：解析用户输入的图标源（本地路径、file:// URL、https:// URL）

#### 3. 图标缓存管理弹窗

- `src/features/settings/ProviderIconCacheModal.ts`（新增文件）
  - 实现 `ProviderIconCacheModal` 类，继承 Obsidian 的 Modal
  - 功能：
    - 显示所有提供商的图标缓存状态概览（缓存数/总数/当前提供商数）
    - 快速跳转栏：点击提供商名称滚动到对应区域
    - 每个提供商独立区域：显示当前/仅保存状态徽章
    - 图标条目列表：显示映射图标和自定义图标
    - 支持设置默认图标、删除图标、添加新图标源
    - 支持从 URL 或本地文件路径添加图标

#### 4. 设置界面集成

- `src/features/settings/OpenCodianSettings.ts`
  - 在"模型"设置标签页新增"Provider icon cache"设置项
    - 显示当前缓存状态（加载中/状态概览/加载失败）
    - "Manage cached icons"按钮：打开 ProviderIconCacheModal
    - "Clear / refresh icon cache"按钮：刷新缓存
    - "Cache current provider icons"按钮：预热当前可用提供商图标
  - 新增 `renderProviderIconCacheSetting()` 方法渲染图标缓存设置
  - 新增 `refreshIconCacheWithNotice()` / `warmIconCacheWithNotice()` 方法
  - 调整"快速跳转"描述文案，反映模型设置的新职责

- `src/features/chat/OpenCodianView.ts`
  - 重构 `updateModelSelectorIcon()` 方法：
    - 使用 `ProviderIconService.resolveIconUrl()` 异步解析图标
    - 添加请求 ID 机制防止竞态条件
    - 加载完成后更新模型选择器触发按钮的图标
  - 新增 `modelSelectorIconRequestId` 字段追踪图标请求
  - `onOpen()` 中加载会话前确保已加载对话列表
  - `loadConversation()` 中增加重试逻辑：如果找不到会话则刷新列表再试一次

#### 5. 主程序扩展

- `src/main.ts`
  - 新增 `saveProviderIconLibrary()` 方法：保存图标库配置到 settings
  - 新增 `getProviderIconLibrary()` 方法：获取当前图标库配置
  - 新增 `deleteProviderIconCache()` 方法：删除所有图标缓存文件

#### 6. 国际化

- `src/i18n/locales/en.ts` / `src/i18n/locales/zh.ts`
  - 新增大量图标缓存相关翻译键：
    - `settings.conversation.title` - 设置分类标题（从 titleGeneration 重命名）
    - `settings.quickNav.conversationDesc` - 快速跳转描述更新
    - `settings.model.iconCache.*` - 图标缓存设置文案（20+ 个键）
    - `settings.debug.iconCache.*` - 调试区域图标缓存文案

#### 7. 样式

- `styles.css`
  - 新增 Provider Icon Cache Modal 完整样式（200+ 行）：
    - `.opencodian-icon-cache-modal-summary` - 概览文本
    - `.opencodian-icon-cache-quick-jump` - 快速跳转栏（sticky 定位）
    - `.opencodian-icon-cache-quick-jump-buttons` - 跳转按钮容器
    - `.opencodian-icon-cache-quick-jump-button` - 跳转按钮（支持 `.is-current` 高亮）
    - `.opencodian-icon-cache-provider-section` - 提供商区域
    - `.opencodian-icon-cache-provider-header` - 区域头部
    - `.opencodian-icon-cache-provider-badges` - 状态徽章容器
    - `.opencodian-icon-cache-provider-badge` - 徽章（`.is-current`/`.is-saved`）
    - `.opencodian-icon-cache-entry-list` - 图标条目列表
    - `.opencodian-icon-cache-entry` - 单个图标条目
    - `.opencodian-icon-cache-entry-preview` - 图标预览区域
    - `.opencodian-icon-cache-entry-actions` - 操作按钮区域
    - `.opencodian-icon-cache-entry-action` - 操作按钮
    - `.opencodian-icon-cache-entry-default-badge` - 默认图标徽章
    - `.opencodian-icon-cache-add-section` - 添加新图标区域
    - `.opencodian-icon-cache-add-input` - 图标源输入框
    - `.opencodian-icon-cache-add-button` - 添加按钮
    - `.opencodian-icon-cache-add-error` - 错误提示

#### 8. 测试

- `tests/unit/main.test.ts`
  - 新增测试用例覆盖 `saveProviderIconLibrary`、`getProviderIconLibrary`、`deleteProviderIconCache` 方法
- `tests/unit/utils/icons/`（新增目录）
  - `ProviderIconService.test.ts`：ProviderIconService 的单元测试

#### 9. 其他

- `.gitignore`
  - 新增 `.claude/` 目录忽略

### 🧪 验证

- `npm run test` 通过
- `npm run typecheck` 通过
- `npm run lint` 通过
- `npm run build` 成功
- `npm run check:devlog-order` 通过

### 📁 涉及文件

- 新增：
  - `src/features/settings/ProviderIconCacheModal.ts`
  - `tests/unit/utils/icons/ProviderIconService.test.ts`
- 修改：
  - `src/core/types/settings.ts`
  - `src/core/types/index.ts`
  - `src/utils/icons/ProviderIconService.ts`
  - `src/features/settings/OpenCodianSettings.ts`
  - `src/features/chat/OpenCodianView.ts`
  - `src/main.ts`
  - `src/i18n/locales/en.ts`
  - `src/i18n/locales/zh.ts`
  - `styles.css`
  - `tests/unit/main.test.ts`
  - `.gitignore`

---

## 2026-03-29 Reasoning 时长精确化、消息元数据同步与尾部渲染优化

### 🎯 改动目标

- 让 Thinking Block 的显示时长优先采用服务端计算值（SDK `part.time.start/end`），而非前端本地粗略计时。
- 支持服务端在流结束时推送准确的 message metadata（messageId、timestamp、modelId），替代本地生成的临时值。
- 优化服务端同步后的重渲染策略，仅替换变化的尾部消息而非全量重渲，减少视觉闪烁。
- 补充相关测试与文档同步。

### ✅ 本轮调整

#### 1. Reasoning/Thinking Block 时长计算优化

- `src/core/opencode/OpenCodeService.ts`
  - 新增 `resolveReasoningDurationSeconds()`，优先从 `part.time.start/end` 计算耗时，其次回退到 `part.duration`
  - 新增 `formatModelIdentifier()`，统一格式化 provider/model 标识
  - `openCodeMessageToChatMessage()` 现在返回 `modelId`（从 `providerID/modelID` 构造）
  - SDK 流事件处理：
    - `message.part.updated` 新增处理 `reasoning`/`thinking` 类型 part，推送 `durationSeconds` 到 UI
    - `message.part.delta` 的 thinking chunk 新增 `partId` 字段
  - `requestAssistantResponse()` 结束时推送 `message_metadata` chunk 包含准确的 messageId、timestamp、modelId

- `src/utils/streaming/types.ts`
  - `ThinkingChunk` 新增 `partId` 和 `durationSeconds` 字段
  - `ThinkingContentBlock` 新增 `partId` 字段
  - `ThinkingBlockState` 新增 `partId` 和 `resolvedDurationSeconds` 字段
  - `StreamState` 新增 `thinkingBlocksByPartId` 和 `thinkingBlockElements` Map，用于按 partId 索引和更新已完成的 thinking block

- `src/utils/streaming/StreamController.ts`
  - `handleThinkingChunk()` 重构：
    - 支持按 `partId` 区分不同的 thinking block
    - 如果收到带 `durationSeconds` 的 chunk 但还没有对应 thinking state，尝试更新已完成的 block
    - 空内容但有 `partId` 的 chunk 用于更新时长而不触发新 block 创建
  - `finalizeThinkingBlock()` 将完成的 thinking block 存入 `thinkingBlocksByPartId` 和 `thinkingBlockElements`
  - 新增 `updateStoredThinkingDuration()`，用于服务端推送最终时长时更新已渲染的 thinking block 标签

- `src/utils/streaming/ThinkingBlockRenderer.ts`
  - 新增 `normalizeDurationSeconds()` 和 `formatDurationSeconds()`，优化时长显示格式：
    - 小于 10 秒显示 1 位小数（如 "Thought for 5.2s"）
    - 大于等于 10 秒显示整数（如 "Thought for 15s"）
    - 小于 1 秒显示 "Thought (<1s)"
  - 新增 `updateDuration()` 方法，更新进行中的 thinking block 时长
  - 新增 `updateStoredDuration()` 方法，更新已完成的 thinking block 时长标签
  - `finalize()` 优先使用 `resolvedDurationSeconds` 而非本地计时
  - `createStoredBlock()` 使用新的格式化函数

#### 2. 消息元数据同步

- `src/core/types/chat.ts`
  - `StreamChunk` 新增 `message_metadata` 类型

- `src/features/chat/OpenCodianView.ts`
  - 流处理循环中捕获 `message_metadata` chunk，用于最终确定 assistant 消息的准确元数据
  - 使用服务端的 `messageId`、`timestamp`、`modelId` 替代本地生成的值
  - 最终化的消息包含准确的 `sourceMessageId`，便于后续追踪

#### 3. 尾部消息增量渲染优化

- `src/features/chat/OpenCodianView.ts`
  - 新增 `getMessagesForRender()`，统一处理消息分组合并逻辑
  - 新增 `patchTrailingAssistantRender()`，实现尾部 assistant 消息的增量替换：
    - 比较前后两次消息列表，检查是否只有最后一条 assistant 消息变化
    - 如果是，仅移除并重新渲染该消息元素，而非清空整个容器
    - 保留原有的滚动位置（如果在底部则保持贴底）
    - 新渲染的消息禁用进入动画（`animation: none`）
  - 服务端同步后优先尝试 `patchTrailingAssistantRender()`，失败才回退到全量 `rerenderConversationMessages()`
  - `applySyncedConversationUpdate()` 使用 `getMessagesForRender()` 简化循环逻辑

#### 4. 折叠用户消息 Markdown 渲染

- `src/features/chat/OpenCodianView.ts`
  - 长用户消息的可见文本现在使用 `renderMarkdownInto()` 渲染，支持 Markdown 格式显示

#### 5. 缓存优化

- `src/features/chat/OpenCodianView.ts`
  - 标题生成、会话重命名等场景的 `getConversationById()` 调用添加 `{ preferCache: true }` 选项，避免不必要的网络同步

#### 6. 测试与文档

- `tests/unit/core/opencode/OpenCodeService.test.ts`
  - 新增测试用例覆盖 `resolveReasoningDurationSeconds` 和 `formatModelIdentifier` 逻辑
- `tests/__mocks__/obsidian.ts`
  - 补充 mock 数据支持
- `tests/setup.ts`
  - 测试环境初始化调整
- `AGENTS.md`
  - 补充 `devlog.md` 更新约束说明
- `docs/opencode-service-sdk-v2-mapping.md`
  - 更新流式主链文档，说明 reasoning 时长计算优化

#### 7. 配置与样式

- `package.json`
  - 添加 `check:devlog-order` 脚本
- `styles.css`
  - 优化 thinking block 和消息样式
- `src/main.ts`
  - 调整初始化逻辑

### 🧪 验证

- `npm run test` 通过（新增测试用例）
- `npm run typecheck` 通过
- `npm run lint` 通过
- `npm run build` 成功
- `npm run check:devlog-order` 通过
- 已部署到 Test Vault

### 📁 涉及文件

- `src/core/opencode/OpenCodeService.ts`
- `src/core/types/chat.ts`
- `src/features/chat/OpenCodianView.ts`
- `src/utils/streaming/StreamController.ts`
- `src/utils/streaming/ThinkingBlockRenderer.ts`
- `src/utils/streaming/types.ts`
- `src/main.ts`
- `styles.css`
- `tests/unit/core/opencode/OpenCodeService.test.ts`
- `tests/__mocks__/obsidian.ts`
- `tests/setup.ts`
- `AGENTS.md`
- `docs/opencode-service-sdk-v2-mapping.md`
- `package.json`
- `devlog.md`

---

## 2026-03-29 历史记录下拉布局抖动修复与滚动优化

### 🎯 改动目标

- 解决点击历史记录按钮后下拉菜单位置计算导致的布局抖动（layout thrash）问题。
- 避免强制同步布局（forced synchronous layout），提升渲染性能。
- 优化加载会话后的滚动时机，减少视觉跳动。

### ✅ 本轮调整

- `src/features/chat/OpenCodianView.ts`
  - 新增 `scheduleHistoryDropdownPosition()`，使用 `requestAnimationFrame` 将菜单位置计算推迟到下一帧
  - 下拉菜单初始状态设为 `visibility: hidden`，位置计算完成后再显示，避免用户看到位置调整过程
  - 提取 `clearScheduledHistoryDropdownPosition()` 用于清理待执行的动画帧
  - 点击历史项加载会话时，使用 `requestAnimationFrame` 延迟加载，避免与菜单关闭动画冲突
  - 将 `loadConversation()` 和 `switchToTabById()` 中的同步滚动改为 `scheduleSettledScrollToBottom()`，确保内容稳定后再滚动

### 🧪 验证

- `npm run lint` 通过
- `npm run typecheck` 通过
- `npm run build` 成功
- 已部署到 Test Vault
- 本轮最终验证使用的 `BUILD_ID`：`main.202603291740`

### 📁 涉及文件

- `src/features/chat/OpenCodianView.ts`
- `devlog.md`

---

## 2026-03-29 回退会话空状态修复与恢复功能

### 🎯 改动目标

- 解决会话被回退（rewind）到起点后，界面显示空白且无明确提示的问题。
- 让用户能够理解当前会话处于回退状态，并提供恢复之前内容的操作入口。
- 在服务端支持获取回退状态和取消回退（unrevert）操作。

### ✅ 本轮调整

- `src/core/opencode/OpenCodeService.ts`
  - 新增 `Session.revert` 类型定义，包含 `messageID` 和可选的 `partID`
  - 新增 `applySessionRevertState()`，在加载消息时根据会话回退状态过滤消息
  - 新增 `filterMessagesByRevertState()`，按消息 ID 和 part ID 精确过滤应显示的消息范围
  - 新增 `unrevertSession()`，支持调用 SDK 或 HTTP API 取消回退状态
  - 新增 `getSessionRevertState()`，获取当前会话的回退状态
  - `getSessionMessages()` 现在会自动应用回退状态过滤

- `src/core/types/chat.ts`
  - 新增 `restore_rewind` 到 `ChatNoticeActionType`

- `src/features/chat/OpenCodianView.ts`
  - 新增 `currentConversationRevertState` 记录当前会话的回退状态
  - 新增 `createEmptyConversationNoticeMessage()`，根据是否处于回退状态显示不同的空会话提示
  - 新增 `handleRestoreRewindRequest()`，处理用户点击"恢复回退前内容"的操作
  - `renderMessages()` 在消息为空时显示提示消息而非空白
  - `syncConversationMessagesFromServer()` 现在返回 `revertState`，用于 UI 状态同步
  - `getNoticeActionLabel()` 和 `handleNoticeAction()` 支持 `restore_rewind` 操作类型

- `src/i18n/locales/en.ts` / `src/i18n/locales/zh.ts`
  - 新增回退相关文案：
    - `chat.rewind.empty.title` / `chat.rewind.empty.description`
    - `chat.rewind.empty.restore`
    - `chat.rewind.restoreSuccess` / `chat.rewind.restoreFailed`

- `tests/__mocks__/opencode-sdk.ts`
  - SDK mock 新增 `session.unrevert` 方法

- `tests/unit/core/opencode/OpenCodeService.test.ts`
  - 新增测试用例覆盖：
    - HTTP API 加载消息时应用回退状态
    - HTTP API 获取会话回退状态
    - HTTP API 恢复回退会话
    - SDK 加载消息时应用回退状态
    - SDK 获取会话回退状态
    - SDK 恢复回退会话

### 🧪 验证

- `npm run test -- OpenCodeService.test.ts` 通过（新增 6 个测试用例）
- `npm run typecheck` 通过
- `npm run lint` 通过
- `npm run build` 成功
- 已部署到 Test Vault
- 本轮最终验证使用的 `BUILD_ID`：`main.202603291737`

### 📁 涉及文件

- `src/core/opencode/OpenCodeService.ts`
- `src/core/types/chat.ts`
- `src/features/chat/OpenCodianView.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
- `tests/__mocks__/opencode-sdk.ts`
- `tests/unit/core/opencode/OpenCodeService.test.ts`
- `devlog.md`

---

## 2026-03-29 历史会话多选删除与批量清理

### 🎯 改动目标

- 让历史会话支持复选框多选，避免必须一条条删除。
- 保持现有删除确认弹框、倒计时和“删除所有会话”行为不变，只在有选中项时把“删除当前会话”切换为“删除选中会话”。
- 确保批量删除后，多 Tab 关联状态和会话面板不会残留脏数据。

### ✅ 本轮调整

- `src/features/chat/OpenCodianView.ts`
  - 在历史会话下拉列表中为每条会话增加复选框与选中态
  - 底部删除动作改为根据选中状态动态显示“删除当前会话”或“删除选中会话”
  - 新增批量删除选中会话逻辑
  - 抽出通用删除确认弹框 helper，复用现有样式与倒计时体验
  - 删除后同步清理关联 tab，并在需要时激活下一个可用 tab 或创建新会话
- `src/features/chat/tabs/TabManager.ts`
  - 新增 `closeTabs()`，支持按 tab 顺序批量关闭并返回后续激活目标
- `src/features/chat/tabs/types.ts`
  - 新增 `CloseTabsResult` 类型
- `src/i18n/locales/en.ts`
  - 补充历史多选与“删除选中会话”确认文案
- `src/i18n/locales/zh.ts`
  - 补充历史多选与“删除选中会话”确认文案
- `styles.css`
  - 增加历史会话复选框与选中态样式
- `tests/unit/features/chat/tabs/TabManager.test.ts`
  - 新增批量关闭 tab 的定向单测

### 🧪 验证

- 已通过：
  - `npm run test -- TabManager.test.ts`
  - `npm run typecheck`
  - `npx eslint src/features/chat/OpenCodianView.ts src/features/chat/tabs/TabManager.ts tests/unit/features/chat/tabs/TabManager.test.ts src/i18n/locales/en.ts src/i18n/locales/zh.ts`
  - `npm run build`
  - `npm run check:devlog-order`
- 已部署到 Test Vault。
- 本轮最终验证使用的 `BUILD_ID`：`main.202603291852`

### 📁 涉及文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/tabs/TabManager.ts`
- `src/features/chat/tabs/types.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
- `styles.css`
- `tests/unit/features/chat/tabs/TabManager.test.ts`
- `devlog.md`

---

## 2026-03-29 devlog 顺序约束与自动检查落地

### 🎯 改动目标

- 防止后续开发日志再次被追加到文件末尾，破坏“最新在前”的倒序结构。
- 把这件事从“靠记忆”改成“文档明确要求 + 脚本自动拦截”。

### ✅ 本轮调整

- `AGENTS.md`
  - 新增 `devlog.md` 更新约束
  - 明确要求新日志必须插入到首个日期型二级标题之前
  - 明确要求交付前运行 `npm run check:devlog-order`
- `devlog.md`
  - 在文件开头的“日志记录原则”中补充插入位置与校验命令
- `package.json`
  - 新增脚本：`npm run check:devlog-order`
- `scripts/check-devlog-order.mjs`
  - 扫描 `devlog.md` 中所有日期型二级标题
  - 如果顺序不是倒序，直接报错并输出错位行号

### 🧪 验证

- `npm run check:devlog-order`
- `npm run build`
- 已部署到 Test Vault
- 本轮最终验证使用的 `BUILD_ID`：`main.202603291833`

### 📁 涉及文件

- `AGENTS.md`
- `devlog.md`
- `package.json`
- `scripts/check-devlog-order.mjs`

---

## 2026-03-29 Settings 滚动恢复日志优化

### 🔇 问题现象

- 每次打开 Settings 页面时，滚动恢复逻辑会因为 `animation-frame`、`mutation` 和多轮递增 `timeout` 连续输出多条几乎相同的调试日志。
- `Settings scroll restore attempt`、`Captured settings scroll position`、`Resolved settings scroll container` 叠加后，单次打开设置页可产生 10+ 条日志，影响问题排查。

### 🎯 优化目标

- 在首次成功恢复滚动位置后，静默后续重复触发。
- 保留一条足够详细的成功日志，继续支持线上排查。

### ✅ 本轮调整

- 为设置页滚动恢复流程增加“已成功恢复”标记，成功后后续触发直接返回。
- 只有在 `scrollTop` 实际到达目标值后才判定恢复成功，避免内容尚未撑开时过早结束恢复流程。
- 首次恢复成功后立即：
  - 清理剩余的重试 `timeout`
  - 断开 `MutationObserver`
  - 停止后续重复日志输出
- 将原先多条 `Settings scroll restore attempt` 调试日志收敛为单条 `Settings scroll restored`，包含：
  - `reason`
  - `attempts`
  - `elapsedMs`
  - `targetScrollTop`
  - `restoredScrollTop`
- 移除常态下噪声较高的 `Captured settings scroll position` 与滚动容器解析调试日志。

### 🧪 验证

- 新增定向单测，覆盖：
  - 首轮恢复未成功时不应提前记录成功日志
  - 内容高度变化后由 `mutation` 触发二次恢复成功
  - 成功后 observer 和 timeout 均被清理
  - 最终只输出 1 条恢复成功日志
- 已通过：
  - `npm run test -- OpenCodianSettings.test.ts`
  - `npm run lint -- src/features/settings/OpenCodianSettings.ts tests/unit/features/settings/OpenCodianSettings.test.ts`
  - `npm run build`
- 已部署到 Test Vault。
- 本轮最终验证使用的 `BUILD_ID`：`main.202603291806`

### 📁 涉及文件

- `src/features/settings/OpenCodianSettings.ts`
- `tests/unit/features/settings/OpenCodianSettings.test.ts`
- `devlog.md`

---

## 2026-03-29 流式表格样式补齐、滚动稳定性修复与 Fork 快照 helper 抽离

### ✨ 改动目标

- 让 Markdown 表格在流式渲染阶段就显示完整边框与更清晰的层次。
- 修复消息完成、会话重渲染、标签切换时打断阅读位置的问题。
- 消除流结束和会话重绘瞬间的跳动感。
- 顺手整理 fork 快照逻辑，确保 fork 时不把被点击的目标消息一并带进新会话。

### 🏗️ 实现内容

#### 1. 流式 Markdown 与最终态样式统一

- 将 `.streaming-text-block` 纳入与 `.opencodian-message-text` 相同的 Markdown 样式作用域：
  - 标题
  - 列表
  - 引用
  - 链接
  - 行内代码
  - 表格
- 这样表格在流式过程中就能直接使用最终边框样式，不再等消息结束后才“突然补全”。

#### 2. 表格视觉增强

- 为表格新增更明显的边框色。
- 增强表头背景与字重。
- 增加隔行底色，提升行阅读辨识度。
- 补充表格容器背景与圆角，让表格块在消息中更容易被识别。

#### 3. 切换标签时保留原滚动位置

- `loadConversation()` 新增 `preserveScrollPosition` 选项。
- tab 切换回已有会话时，不再默认跳到底部，而是恢复离开该 tab 时的阅读位置。
- 仅当用户原本就在底部附近时，才继续贴底显示最新消息。

#### 4. 减少流结束后的无意义重绘与布局抖动

- 新增 `getConversationVisualFingerprint()`：
  - 若流结束后服务端同步回来的内容在视觉上没有变化，则跳过整段消息重渲染。
- 对必须重渲的场景：
  - 在 pane 上增加 `is-rehydrating` 标记
  - 临时关闭消息进入动画
  - 渲染后恢复原滚动位置或底部贴齐
- 从而减少“结束瞬间跳到顶部 / 抖一下 / 闪一下”的问题。

#### 5. Fork 快照 helper 抽离与行为修正

- 新增 `src/features/chat/forkMessages.ts`，抽离 fork 前的消息切片逻辑。
- `cloneMessagesBeforeForkTarget()` 会：
  - 默认排除被点击的目标消息本身
  - 在本地 `id` 不一致时回退用 `sourceMessageId` 定位
- 新增定向单测覆盖上述两种行为，便于后续继续维护 fork/rewind 相关逻辑。

### 🧪 验证

- `npx eslint src/features/chat/OpenCodianView.ts src/features/chat/forkMessages.ts tests/unit/features/chat/forkMessages.test.ts --max-warnings=0`
- `node scripts/run-jest.js tests/unit/features/chat/forkMessages.test.ts`
- `npm run build`
- 已部署到 Test Vault
- 本轮最终验证使用的 `BUILD_ID`：`main.202603291755`

### 📁 涉及文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/forkMessages.ts`
- `styles.css`
- `tests/unit/features/chat/forkMessages.test.ts`

---

## 2026-03-29 多 Tab 真并发发送落地、流状态去全局化与接力文档补强

### ✨ 改动目标

- 解决“一个 tab 在跑时，另一个 tab 仍不能真正发送”的问题。
- 让 tab 不只是“可切换”，而是“会话状态、流状态、后台任务状态都真正独立”。
- 将这轮并发能力落地同步回 `devlog.md`、`AGENTS.md` 与 SDK v2 mapping，方便后续会话继续接力。

### 🏗️ 实现内容

#### 1. OpenCodeService 流状态改为按 session 独立

- `OpenCodeService` 不再使用单一全局：
  - `currentAbortController`
  - `currentAbortSessionId`
  - `partTypeMap`
- 新增按 `sessionId` 维护的 `activeStreams`：
  - 每个会话各自拥有 `AbortController`
  - 每个会话各自拥有 `partTypeMap`
- `cancelStream()` 升级为按 session 定位取消；UI 现在会取消当前 tab 对应 session，而不会误伤别的 tab 流。

#### 2. OpenCodianView 改为每个 tab 一份 runtime

- 新增 `TabRuntimeState`，把以下状态从“全局单份”拆到“每个 tab 一份”：
  - `isStreaming`
  - `streamController`
  - `streamingMessageEl`
  - `streamingContentEl`
  - `currentTurnBodyEl`
  - `lastConversationSyncFingerprint`
  - `isConversationSyncInFlight`
  - 后台任务 indicator / 启动时间 / task 列表 / waiting 状态
- 每个 tab 现在都有自己的消息 pane 与自己的 `StreamController`，因此：
  - Tab A 可继续流式输出
  - Tab B 可同时发起新请求
  - 两边不会再争抢同一套 UI streaming 引用

#### 3. 后台任务与隐藏 tab 同步也改为按 tab 处理

- 后台任务卡片、完成任务列表、waiting 状态全部绑定到对应 tab runtime。
- 新增后台同步扫描逻辑：
  - 当前可见 tab 继续做普通同步
  - 非当前 tab 但仍有后台任务的会话，也会单独同步
- 因此后台任务不再依赖“唯一 stream owner tab”的旧假设。

#### 4. 交互细节修正

- 权限卡片现在会插入到发起请求的那个 tab 的流消息中。
- `processingBlocked` 文案改为“当前标签仍在处理”，不再误导成“另一个标签阻塞了你”。
- 关闭 tab 时，如果该 tab 仍在 streaming 或仍有后台任务，仍会阻止关闭，避免丢失跟踪状态。

#### 5. 文档同步

- `AGENTS.md`
  - 补充多 tab 真并发与 per-tab runtime 说明
  - 补充 `OpenCodeService` 的 per-session active stream 现状
- `docs/opencode-service-sdk-v2-mapping.md`
  - 同步“流式主链 / 取消模块”当前已落地的并发能力
  - 标明多 tab 并发依赖于 service per-session stream context + view per-tab runtime

### 🧪 验证

- `npm run typecheck` 通过
- 定向测试通过：
  - `tests/unit/core/opencode/OpenCodeService.test.ts`
  - `tests/unit/features/chat/tabs/TabManager.test.ts`
  - `tests/unit/features/chat/tabs/TabBar.test.ts`
- 全量测试通过：`npm run test`（145/145）
- `npm run build` 成功
- 已部署到 Test Vault
- 本轮最终验证使用的 `BUILD_ID`：`main.202603291519`

### 📁 涉及文件

- `src/core/opencode/OpenCodeService.ts`
- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/tabs/Tab.ts`
- `src/features/chat/tabs/TabManager.ts`
- `src/features/chat/tabs/TabBar.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
- `tests/unit/core/opencode/OpenCodeService.test.ts`
- `tests/unit/features/chat/tabs/TabManager.test.ts`
- `tests/unit/features/chat/tabs/TabBar.test.ts`
- `devlog.md`
- `AGENTS.md`
- `docs/opencode-service-sdk-v2-mapping.md`

### 📌 当前结论

- OpenCodian 现在已支持“多 tab 多任务并发发送”，前提是它们属于不同 session/tab。
- SDK v2 主链的流式接入不再被单全局流状态卡死，这为后续 `question.*`、`syncEvent` 与更完整事件消费打下了更稳的底座。
- 后续如果继续迭代，应优先补自动化测试覆盖“多 tab 同时 streaming + 后台任务回写”的组合场景。

---

## 2026-03-29 OpenCodeService → SDK v2 渐进迁移主链落地与接力文档同步

### ✨ 改动目标

- 将 `OpenCodeService` 的核心 API / prompt / streaming 主链逐步切到 OpenCode JS SDK v2。
- 保持 `ServerManager`、`OpenCodeService` facade、`ChatMessage` / `StreamChunk` / OMO 兼容层不变。
- 补齐新会话接力所需的迁移状态文档、手工验收清单与 AGENTS 说明。

### 🏗️ 实现内容

#### 1. SDK v2 依赖、类型桥接与开关护栏

- 精确锁定 `@opencode-ai/sdk@1.3.3`
- 新增：
  - `src/core/opencode/sdkFeatureFlags.ts`
  - `src/core/opencode/sdkTypes.ts`
- 引入内部 feature flags：
  - `sdkCrud`
  - `sdkPrompt`
  - `sdkStream`
  - `sdkAbort`
  - `sdkQuestions`
  - `sdkSync`
- 默认全关；插件组合根在 `src/main.ts` 里显式启用 rollout defaults，单元测试仍可保守使用 legacy 默认值

#### 2. SDK client factory 与 hybrid transport

- 新增：
  - `src/core/opencode/createSdkClient.ts`
  - `src/core/opencode/sdkFetch.ts`
- 统一注入：
  - `baseUrl`
  - 认证头
  - `directory`
- JSON 请求继续复用 Obsidian `requestUrl()` 并包装成标准 `Response`
- SSE 请求继续使用原生 `fetch()`
- SDK client 固定：
  - `responseStyle: "data"`
  - `throwOnError: true`

#### 3. OpenCodeService 主链迁移

- 已切 SDK 的能力：
  - `checkHealth()`
  - `createSession()`
  - `listSessions()`
  - `getSessionMessages()`
  - `deleteSession()`
  - `updateSessionTitle()`
  - `forkSession()`
  - `revertSession()`
  - `getAvailableModels()`
  - `getPendingPermissions()`
  - `respondToPermission()`
  - `requestAssistantResponse()`
  - `sendMessage()`
  - `cancelStream()` 的服务端 abort 补全
- 读链路保留 fallback：
  - SDK 失败时回退 legacy HTTP / legacy SSE
- 写链路不做自动重试，只保留模块级回滚能力

#### 4. 当前已完成与未完成边界

- 已完成：
  - CRUD 迁移
  - 非流式 prompt 迁移
  - 流式主链迁移
  - 双通道取消（本地 abort + 服务端 abort）
  - 路径说明与 handoff 文档同步
- 仍待补齐：
  - `format` / `agent` / `noReply`
  - `thinkingBudget` 真正映射
  - `externalContextPaths` / 真实 file parts
  - 图片 file part
  - `question.*`
  - `global.syncEvent.subscribe()`
  - `session.summarize()` / `session.diff()`
  - 旧链路收敛

#### 5. 文档同步

- `docs/opencode-service-sdk-v2-mapping.md`
  - 补齐精确 SDK 参考路径
  - 同步当前模块进度
  - 标明已实现 / 未实现 / 接力注意事项
- 新增 `docs/opencode-sdk-v2-manual-checklist.md`
  - 供 Test Vault 手工回归 SDK v2 主链
- `AGENTS.md`
  - 补充 SDK v2 混合架构、关键文件、当前模块状态与接力规则

### 🧪 验证

- `npm run typecheck` 通过
- `npm run lint` 通过
- `npm run test` 通过（140/140）
- `npm run build` 成功
- 已部署到 Test Vault
- 本轮最终验证使用的 `BUILD_ID`：`main.202603291252`

### 📁 涉及文件

- `package.json`
- `package-lock.json`
- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/createSdkClient.ts`
- `src/core/opencode/sdkFeatureFlags.ts`
- `src/core/opencode/sdkFetch.ts`
- `src/core/opencode/sdkTypes.ts`
- `src/core/opencode/index.ts`
- `src/core/opencode/types.ts`
- `src/main.ts`
- `tests/unit/core/opencode/OpenCodeService.test.ts`
- `tests/unit/core/opencode/createSdkClient.test.ts`
- `tests/unit/core/opencode/sdkFetch.test.ts`
- `docs/opencode-service-sdk-v2-mapping.md`
- `docs/opencode-sdk-v2-manual-checklist.md`
- `AGENTS.md`

### 📌 当前结论

- `OpenCodeService` 已进入“SDK v2 主链 + legacy 回滚链路并存”的稳定过渡态。
- 新会话继续开发时，应优先补齐 prompt/file/question/sync 的剩余缺口，而不是提前删除 legacy fallback。
- 当前最重要的文档入口是：
  - `docs/opencode-service-sdk-v2-mapping.md`
  - `docs/opencode-sdk-v2-manual-checklist.md`
  - `AGENTS.md`

---

## 2026-03-29 OMO 兼容主链落地、后台任务可见性补强与文档同步

### ✨ 改动目标

- 为 `oh-my-opencode` 兼容补齐聊天侧主链，而不是只停留在“项目配置入口”阶段。
- 让 OMO 注入提示词、系统提醒、后台任务进度在当前会话里可见、可理解、可区分。
- 解决后台任务完成后消息整段跳出、提示卡片 markdown 未渲染、notice 样式留白不协调等体验问题。
- 将当前已完成与未完成内容同步回需求文档和项目说明，方便新会话继续推进。

### 🏗️ 实现内容

#### 1. OMO 消息识别层

- 新增 `src/core/opencode/omoCompat.ts`
- 统一识别：
  - `[search-mode] ... --- 原始输入`
  - `<system-reminder>...</system-reminder>`
  - `<!-- OMO_INTERNAL_INITIATOR -->`
- `OpenCodeService.openCodeMessageToChatMessage()` 现在会产出 OMO 元数据，而不是把这类文本全当普通消息处理。

#### 2. 当前 user bubble 及时回写

- 发送后在 `message_start` 阶段立即拉取当前 session 的最新 user message
- 用服务端最终文本回写本地乐观消息
- 因此注入后的 `search-mode` 信息不再需要重新打开会话才能看到

#### 3. OMO 专用 UI 与中文化

- 用户消息支持：
  - 原始用户输入正文
  - 模式标签（如 `搜索模式`）
  - 注入摘要
  - 原始英文 prompt 折叠查看
- 系统提醒支持：
  - notice card 中文标题 / 摘要
  - 原始 reminder 折叠查看
- 相关 UI 已统一接入 markdown 渲染，而不是纯文本硬塞

#### 4. 后台任务运行中状态可见

- 聊天界面会根据 `search-mode` 与 `task` 工具调用显示“后台任务运行中”卡片
- 主回复结束后，如果子任务仍在执行，卡片会继续保留
- 用户不再只能盯着一个已结束的主回复发懵

#### 5. 后台任务完成后的追加消息体验优化

- 当前可见会话增加空闲期自动同步机制
- 后台任务完成回写父会话后，界面会自动吸收新增消息
- 新增的 assistant 纯文本消息会做轻量“伪流式”渐进显示，避免整段瞬间砸出

#### 6. 工具展示与样式细节收尾

- `task` 工具改成更易理解的命名与摘要
- 修复：
  - notice markdown 段落 / 列表大空白
  - 原始提醒折叠按钮过小过挤
  - 系统提醒摘要里 `ID / Description` 被挤成一行的问题

#### 7. 文档同步

- `docs/omo-compatibility-requirement.md`
  - 新增“截至 2026-03-29 的当前实现进度”
  - 明确区分已完成、未完成与建议优先级
- `AGENTS.md`
  - 补充 OMO 兼容层、renderGroups、聊天侧 OMO / 后台任务能力说明
  - 更新开发注意事项与最后更新时间

### 🧪 验证

- `npm run typecheck` 通过
- `npm test` 通过（131/131）
- 多轮 `npm run build` 成功
- 已部署到 Test Vault
- 本轮最终验证与部署过程中使用过的 `BUILD_ID`：
  - `main.202603290020`
  - `main.202603290025`
  - `main.202603290027`

### 📁 涉及文件

- `src/core/opencode/omoCompat.ts`
- `src/core/opencode/OpenCodeService.ts`
- `src/core/types/chat.ts`
- `src/core/types/index.ts`
- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/ContextUsageService.ts`
- `src/features/settings/OpenCodianSettings.ts`
- `src/utils/streaming/ToolCallRenderer.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
- `styles.css`
- `tests/unit/core/opencode/OpenCodeService.test.ts`
- `docs/omo-compatibility-requirement.md`
- `AGENTS.md`

### 📌 当前结论

- 聊天侧 OMO 兼容主线已经基本闭环：
  - 注入 prompt 可见
  - 后台提醒自动出现
  - 中文化 UI 已成型
  - 后台任务“正在运行”对用户可见
- 仍未完全做完的部分主要在“项目级 OMO 配置产品化”：
  - OMO 配置目前还是创建 / 打开入口
  - 远程模式提示还可以更直接
  - 后续若追求更强实时性，可继续评估从轮询升级到常驻事件订阅

---

## 2026-03-28 OpenCode 插件管理接入与设置页收尾

### ✨ 改动目标

- 为 OpenCodian 补齐 OpenCode 插件治理的一期能力，而不是继续把插件来源当成黑盒。
- 让当前 vault 能看见“全局插件 + 项目插件”分别从哪里来。
- 支持项目级 `plugin` 配置、项目 `.opencode/plugins/` 目录与 OMO 配置入口。
- 为本地托管 OpenCode 提供“纯净模式”，用于一次性禁用所有外部插件排障。
- 顺手修整插件设置区的界面结构、快捷跳转顺序，以及设置页中反引号文案的实际渲染效果。

### 🏗️ 实现内容

#### 1. 新增插件管理服务层
- 新增 `PluginManagementService`，负责统一读取：
  - 全局 `~/.config/opencode/opencode.json` 中的 `plugin`
  - 全局 `~/.config/opencode/plugin(s)/`
  - 项目 `.opencode/opencode.json` 中的 `plugin`
  - 项目 `.opencode/plugin(s)/`
- 能区分：
  - `npm` 插件
  - 本地路径插件
  - 配置声明来源
  - 目录扫描来源
- 补充项目级 `oh-my-opencode.jsonc` 创建入口，作为后续 OMO 兼容基础设施。

#### 2. 项目级插件配置写回能力
- `OpencodeConfigManager` 新增项目 `plugin` 数组的读取与写入能力。
- 保持现有 permission / model 配置逻辑不受影响，插件配置作为同一份 `.opencode/opencode.json` 的新管理维度。
- 新增 `.opencode/plugins/` 目录辅助方法，便于设置页创建项目本地插件目录。

#### 3. 插件隔离模式（纯净模式）
- `OpenCodianSettings` / `ServerManager` / `OpenCodeService` 串起新的 `pluginIsolationMode` 设置。
- 本地托管模式下可切换：
  - `default`
  - `pure`
- `pure` 模式通过 `OPENCODE_PURE=true` 启动本地 OpenCode，禁用所有外部插件：
  - 全局插件失效
  - 项目插件也失效
- 远程模式下仅做状态提示，不承诺强制控制远端插件环境。

#### 4. 设置页新增插件分区
- 设置页新增 `Plugins / 插件` 分区，并接入快捷跳转。
- 首版包含：
  - 插件环境概览
  - 全局来源只读展示
  - 项目 `plugin` 数组编辑
  - 项目本地插件目录创建与文件列表
  - OMO 项目配置入口
  - 插件隔离模式切换
- 快捷跳转顺序已修正为：会话标题在前，插件分区在后。

#### 5. 设置页视觉与文案渲染收尾
- 插件区改成更接近现有设置页的卡片化结构，避免裸文本堆叠。
- 为设置页新增通用的 inline-code 渲染，把带反引号的描述转成真正的 `code` 元素。
- 单独补了设置页 `code` 样式，使其更接近 Obsidian 原生行内代码，而不是仅仅“显示了反引号内容”。

### 🧪 验证

- 新增单测：
  - `tests/unit/core/config/PluginManagementService.test.ts`
- 更新单测：
  - `tests/unit/core/config/OpencodeConfigManager.test.ts`
  - `tests/unit/core/opencode/ServerManager.test.ts`
  - `tests/unit/core/types/settings.test.ts`
- 全量测试通过：`npm test`（129/129）
- 构建成功并已部署到 Test Vault
- 本轮最新验证使用的 `BUILD_ID`：`main.202603282250`

### 📁 涉及文件

- `src/core/config/PluginManagementService.ts`
- `src/core/config/OpencodeConfigManager.ts`
- `src/core/config/index.ts`
- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/ServerManager.ts`
- `src/core/opencode/types.ts`
- `src/core/types/opencodeConfig.ts`
- `src/core/types/settings.ts`
- `src/core/types/index.ts`
- `src/features/settings/OpenCodianSettings.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
- `src/main.ts`
- `styles.css`
- `tests/unit/core/config/PluginManagementService.test.ts`
- `tests/unit/core/config/OpencodeConfigManager.test.ts`
- `tests/unit/core/opencode/ServerManager.test.ts`
- `tests/unit/core/types/settings.test.ts`

### 📌 当前收益

- 用户终于可以明确判断当前 vault 是否受全局插件影响。
- 项目级插件能力开始成型，为 OMO 兼容准备好了配置治理入口。
- 排查“是不是插件导致当前项目异常”时，有了明确的纯净模式。
- 设置页插件区不再是原型状态，文案里的路径 / 配置项也能按真正的行内代码样式显示。

---

## 2026-03-28 会话标题语言感知改造

### ✨ 改动目标

- AI 自动生成会话标题时，不再固定输出英文。
- 改为根据插件当前界面语言决定标题输出语言：
  - `zh`：输出中文标题
  - `en`：输出英文标题

### 🏗️ 实现方式

- 将 `src/core/prompts/titleGeneration.ts` 从静态提示词常量改为可按语言构建的提示词工具：
  - `normalizeTitleGenerationLocale()`
  - `buildTitleGenerationSystemPrompt()`
  - `buildTitleGenerationPrompt()`
- 在 `TitleGenerationService` 内读取 `plugin.settings.locale`，并在请求标题生成时同时注入：
  - 与语言匹配的 system prompt
  - 与语言匹配的 user prompt
- 保持现有标题清洗逻辑不变，只调整模型输出语言约束。

### 🌐 行为结果

- 用户界面语言为中文时，新会话 AI 标题会明确要求模型输出简体中文。
- 用户界面语言为英文时，新会话 AI 标题会明确要求模型输出英文。
- 不支持的语言值会安全回退到英文。

### 🧪 验证

- 新增定向单测：`tests/unit/features/chat/TitleGenerationPrompt.test.ts`
- 测试通过：`npm test -- tests/unit/features/chat/TitleGenerationPrompt.test.ts`
- 构建成功：`npm run build`
- 已部署到 Test Vault
- 本轮验证使用的 `BUILD_ID`：`main.202603281319`

### 📁 涉及文件

- `src/core/prompts/titleGeneration.ts`
- `src/features/chat/services/TitleGenerationService.ts`
- `tests/unit/features/chat/TitleGenerationPrompt.test.ts`

---

## 2026-03-28 同一轮 Assistant 消息自动合并渲染

### 📋 本次开发目标

解决 OpenCode / OpenCodian 在一次回答中先输出“思考 / 工具调用说明”，再输出最终正文时，界面上被拆成两条连续 assistant 气泡的问题，让同一轮回复在视觉上保持为一条完整消息。

### ✅ 实现内容

#### 1. 连续 assistant 消息按渲染分组自动合并
- 新增 `renderGroups` 渲染辅助模块
- 对连续的默认 assistant 消息进行分组
- 渲染时将同组消息合成为一个 assistant 气泡，而不是逐条单独渲染

#### 2. 保留原始存储结构，仅调整显示层
- 没有改动会话落盘格式，也没有篡改服务端同步回来的原始消息边界
- 合并仅发生在 UI 渲染阶段，降低对回退、分叉、同步逻辑的影响范围
- `notice` 类型消息不会参与合并，避免把提示卡片和正文粘在一起

#### 3. 合并后保留内容块顺序
- 合并时会按原顺序拼接 `thinking`、`tool_use`、`text` 等 `contentBlocks`
- 这样同一轮回答里的“思考 -> 工具 -> 正文”仍能完整展示，只是落在同一个气泡内
- 合并消息优先继承最后一条 assistant 的时间戳与模型信息，保证底部信息更符合用户直觉

### 🧪 测试

- 新增 `renderGroups` 单测，覆盖：
  - 连续 assistant 消息会被归为同一渲染组
  - `notice` 消息不会跨越合并边界
  - 合并后的 `contentBlocks` 顺序、文本内容与元数据符合预期
- 已通过：
  - `npm run test`
  - `npm run lint`
  - `npm run typecheck`

### 📁 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `src/features/chat/OpenCodianView.ts` | 首次加载与重渲染时改为按消息组渲染 |
| `src/features/chat/renderGroups.ts` | 新增 assistant 消息分组与合并辅助逻辑 |
| `tests/unit/features/chat/renderGroups.test.ts` | 新增分组与合并渲染回归测试 |

### 📌 当前收益

- 同一轮回答不再因为工具调用阶段被拆成多个 assistant 气泡
- 对用户来说，一次回答的阅读流更连贯，视觉负担更小
- 方案只作用于渲染层，风险相对可控，便于后续继续细化“同轮消息”的定义

---

## 2026-03-28 标签栏数字徽标底色调整

### 📋 本次开发目标

将标签栏数字徽标的底色从纯背景色改为主题色，使其更有层次感但不至于过于耀眼。

### ✅ 实现内容

#### 数字徽标底色改为 `--background-modifier-hover`
- `.opencodian-tab-bar-badge`：底色从 `--background-primary` 改为 `--background-modifier-hover`，文字色保持 `--text-normal`
- `.opencodian-tab-overflow-menu-badge`：底色从 `--background-secondary` 改为 `--background-modifier-hover`，文字色保持 `--text-normal`
- 效果：低调但有区分度，不会像强调色（`--interactive-accent`）那样抢眼

### 🔄 变更过程

1. 最初尝试使用 `--interactive-accent` 作为底色，文字用 `--text-on-accent`
2. 用户反馈强调色过于耀眼，与整体界面不协调
3. 改用 `--background-modifier-hover`，既有层次感又不喧宾夺主

---

## 2026-03-28 助手消息流结束抖动修复

### 🐛 问题现象

- 助手消息在流式输出完成后，会出现一次明显的“向下跳”或“闪一下”的视觉抖动。
- 开启自动滚动时，滚动位置也会在结束瞬间被再次推到底部，放大这种不稳定感。

### 🔍 原因定位

- 时间戳行原本在流结束后才插入，导致消息高度在最后一刻突然增加。
- `done` 阶段仍会触发一次额外的 `scrollToBottom()`，与时间戳插入叠加，形成末尾跳动。
- 流式助手消息结构中还存在一层多余的预创建文本容器，不必要地增加了收尾阶段 DOM 调整的复杂度。

### ✅ 本轮修复

- 助手流式消息创建时就预留 `.opencodian-message-time-row` 占位，结束时只填充时间、模型和复制按钮，不再新增一整行 DOM。
- 为时间戳行增加稳定高度与隐藏占位态，避免结束瞬间撑高消息。
- `StreamController` 在处理 `done` chunk 时不再立即触发额外滚动。
- `OpenCodianView` 改为在流结束后的双 `requestAnimationFrame` 中补一次稳定滚动，等待布局完成后再校正位置。
- 清理流式助手消息里多余的空文本节点，保持实时 Markdown 渲染路径不变。

### 🎯 结果

- 保留实时 Markdown 渲染效果，不牺牲流式过程中的格式反馈。
- 显著减轻消息结束瞬间的“蹦一下”感，尤其是在自动滚动开启时更稳定。

### 🧪 验证

- 定向 ESLint 校验通过：
  - `src/features/chat/OpenCodianView.ts`
  - `src/utils/streaming/StreamController.ts`
- 构建成功并部署到 Test Vault。
- 本轮验证使用的 `BUILD_ID`：`main.202603280851`

### 📁 涉及文件

- `src/features/chat/OpenCodianView.ts`
- `src/utils/streaming/StreamController.ts`
- `styles.css`

---

## 2026-03-28 会话标题机制改造与历史重命名修复

### ✨ 新增能力

- 新会话不再默认使用时间戳标题，改为在首条用户消息发送后，立即生成“消息截取回退标题”。
- 新增标题生成模式设置：
  - `default`：仅使用首条消息回退标题
  - `ai`：先使用回退标题，再异步生成 AI 精炼标题
- 新增 AI 标题模型设置 `aiTitleModel`，留空时自动跟随当前会话模型。
- 历史会话列表新增重命名按钮，支持用户手动修改标题。

### 🏗️ 数据与服务层改造

- `OpenCodianSettings` 新增：
  - `titleMode`
  - `aiTitleModel`
- `Conversation` / `ConversationMeta` 新增：
  - `titleGenerationStatus?: 'pending' | 'success' | 'failed'`
- `StorageService` 持久化并读取标题生成状态，保证重启后历史状态不丢失。
- `OpenCodeService` 新增：
  - `updateSessionTitle()`：封装 `PATCH /session/:id`
  - `requestAssistantResponse()`：用于同步获取标题生成结果

### 🤖 AI 标题生成流程

- 新增 `src/core/prompts/titleGeneration.ts`，定义标题生成系统提示词。
- 新增 `src/features/chat/services/TitleGenerationService.ts`：
  - 使用临时 session 异步请求标题
  - 支持取消
  - 清洗 AI 返回内容（去引号、去尾标点、限制 50 字）
- 在首条用户消息发送后：
  1. 立即写入回退标题
  2. 若设置为 `ai`，则异步生成精炼标题
  3. 生成成功后同步更新本地会话、Tab 标题和服务端 session 标题
- 若用户在 AI 生成期间手动改名，则取消生成并保留用户标题。

### 🖊️ 历史会话重命名修复

- 历史会话项右侧新增铅笔按钮。
- 初版实现使用了 `window.prompt()`，但 Obsidian / Electron 渲染环境不支持原生 `prompt()`。
- 后续改为插件内部自定义重命名弹窗，支持：
  - 输入框自动聚焦
  - Enter 保存
  - Escape 取消
  - 点击遮罩关闭

### 🌐 设置、文案与样式

- 设置面板新增 “Title Settings / 标题设置” 区块。
- 中英文文案补充：
  - 标题模式
  - AI 标题模型
  - 重命名按钮
  - 标题生成状态
  - 重命名弹窗按钮
- 历史会话列表新增状态徽标与重命名按钮样式。
- 新增重命名弹窗样式。

### 🧪 验证

- `npm run lint` 通过
- `npm run typecheck` 通过
- `node scripts/run-jest.js tests/unit/core/opencode/OpenCodeService.test.ts` 通过
- `npm run build` 成功
- 已部署到 Test Vault
- 本轮最终验证使用的 `BUILD_ID`：`main.202603281012`

### 📁 涉及文件

- `src/main.ts`
- `src/core/types/settings.ts`
- `src/core/types/chat.ts`
- `src/core/types/index.ts`
- `src/core/storage/StorageService.ts`
- `src/core/opencode/OpenCodeService.ts`
- `src/core/opencode/ServerManager.ts`
- `src/core/prompts/titleGeneration.ts`
- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/TitleGenerationService.ts`
- `src/features/chat/tabs/TabManager.ts`
- `src/features/settings/OpenCodianSettings.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
- `styles.css`
- `tests/unit/core/opencode/OpenCodeService.test.ts`

---

## 2026-03-27 标签栏 Streaming 动画重构与多语言切换支持

### 📋 本次开发目标

1. 重构标签栏 streaming 状态动画，从 loader 图标改为 CSS conic-gradient 轨道光晕效果
2. 支持语言切换时动态更新界面中的 tooltip 文本

### ✅ 实现内容

#### 1. Streaming 状态改为纯 CSS 轨道动画
- 原实现：在 `.opencodian-tab-bar-state` 中放置 `loader-circle` 图标并旋转
- 新实现：
  - 新增 `.opencodian-tab-bar-badge-wrap` 包装器，包裹 badge 和 state
  - streaming 时通过 `::before` 和 `::after` 伪元素渲染 `conic-gradient` 轨道
  - 使用 `opencodian-tab-badge-orbit` 动画实现旋转光晕效果
- 效果更柔和，与玻璃拟态风格更契合

#### 2. 多语言切换时动态更新 Tooltip
- `OpenCodianView` 新增成员变量引用：
  - `newConversationBtnEl`
  - `historyBtnEl`
  - `settingsBtnEl`
- 新增 `applyLocaleTexts()` 方法，在语言切换时更新所有按钮的 tooltip
- 重构 `attachTooltipLabel` 为 `setTooltipLabel`，支持更新已有 tooltip 文本
- `main.ts` 中 `onLocaleChange` 回调增加 `view.applyLocaleTexts()` 调用

#### 3. 无障碍访问优化
- 为 tooltip label span 添加 `data-tooltip-label="true"` 属性，便于查找和更新
- 更新时复用已有 label 元素，避免重复创建

#### 4. 样式微调
- 调整 tab 阴影为内阴影风格，更符合当前玻璃拟态设计
- 增加 tab bar 容器 padding，改善视觉边距
- 优化 active tab 在 input 布局下的最大宽度限制
- 移除 streaming 时的 loader 图标，改用纯 CSS 动画

### 🧪 测试

- 新增 `TabBar` 单测：验证 streaming 状态下 badge wrap 和 state 的渲染结构

### 📁 涉及文件

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/tabs/TabBar.ts`
- `src/main.ts`
- `styles.css`
- `tests/unit/features/chat/tabs/TabBar.test.ts`

---

## 2026-03-27 设置面板滚动记忆修复与首次打开回流优化

### 📋 本次开发目标
围绕 OpenCodian 设置面板补一轮稳定性修复，解决两个直接可见的问题：

1. 启动后首次打开设置面板时出现 `Forced reflow while executing JavaScript` 性能警告
2. 设置面板关闭后再次打开，滚动位置记忆不稳定，偶发从顶部开始或被后续内容顶偏

### ✅ 实现内容

#### 1. 去掉首次打开时的祖先链同步布局探测
- 原实现会从 `containerEl` 开始逐层向上遍历 DOM
- 遍历过程中读取 `getComputedStyle()`、`scrollHeight`、`clientHeight`
- 这会在设置面板刚渲染完时强制浏览器立即做样式与布局计算，容易触发首开回流告警
- 现改为优先通过 Obsidian 已知结构选择器直接定位滚动容器：`.vertical-tab-content-container`、`.vertical-tab-content`、`.modal-content`
- 若选择器失效，再回退到 class 名轻量识别，避免重新引入首帧布局测量

#### 2. 修复滚动容器误判导致的记忆失效
- 之前按选择器顺序逐个匹配时，可能先拿到更外层容器，而不是最近的真实滚动层
- 结果是滚动监听、关闭时保存、重新打开时恢复都绑定到了错误元素
- 现改为合并选择器后统一 `closest()`，优先拿最近的匹配祖先，保证保存和恢复对着同一个滚动层执行

#### 3. 恢复滚动位置改为多时机补偿
- 仅做一次 `requestAnimationFrame` 恢复，在 Obsidian 自身滚动或异步内容插入后仍可能被覆盖
- 现增加一组有界补偿时机：
  - 首帧恢复一次
  - `24 / 80 / 160 / 320ms` 再补几次
  - 设置内容在打开初期发生 DOM 变化时再补一次
- 同时在重新渲染设置页或关闭设置页时，会统一清理这些恢复任务，避免和后续交互打架

#### 4. 恢复逻辑改成“只写 scrollTop，不测量布局”
- 为了压低打开设置按钮时的 forced reflow 风险，恢复滚动时不再读取 `scrollHeight`、`clientHeight` 来推算最大滚动范围
- 关闭设置时保存位置也不再依赖 `clientHeight > 0` 之类的布局判断
- 改为优先直接写入目标 `scrollTop`，把布局读取压缩到最低

#### 5. 增加设置页滚动调试日志
- 在解析滚动容器时输出容器 class 信息
- 在恢复滚动时输出恢复时机与目标位置
- 在关闭设置页保存位置时输出最终保存值
- 后续如果再出现偶发偏移，可以直接根据 `[OpenCodianSettings]` 日志区分是“容器识别错误”还是“打开后被宿主/异步内容再次滚动”

### 📁 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `src/features/settings/OpenCodianSettings.ts` | 设置页滚动容器定位、滚动恢复补偿、恢复任务清理、调试日志 |

### 📌 当前收益

- 首次打开设置面板时，不再依赖祖先链同步布局探测
- 设置滚动位置记忆恢复更稳，不容易被打开期的异步内容顶掉
- 点击设置按钮触发的 forced reflow 警告已明显收敛
- 后续若仍有偶发问题，已经具备足够的日志信息继续定位

---

## 2026-03-27 标签栏折叠、`+N` 溢出菜单、标签恢复与交互细节收尾

### 📋 本次开发目标
围绕会话标签栏与顶部交互做一轮可用性打磨，并把这批改动沉淀为首个正式大版本的发布基础：

1. 标签默认折叠，仅在悬浮 / 聚焦 / 激活时展开标题
2. 标签过多时引入 `+N` 溢出菜单，并根据标签栏位置智能决定弹出方向
3. 修复重启 Obsidian 后只恢复当前标签、丢失其它标签的问题
4. 统一顶部按钮、标签按钮、思考预算等区域的 tooltip 与下拉交互
5. 调整新建标签图标与若干视觉细节，完成 1.0.0 前的交互收尾

### ✅ 实现内容

#### 1. 标签默认折叠，悬浮展开
- 标签默认以紧凑胶囊展示，主要保留数字徽章
- 在悬浮、键盘聚焦、当前激活时再平滑展开标题
- 状态图标在无内容时不再占宽度，避免数字标签显得松散

#### 2. 超过 5 个标签时使用 `+N` 溢出菜单
- 标签数超过 5 个后，只保留可见槽位，剩余标签汇总进 `+N`
- 当前激活标签始终优先留在可见区域
- 最终将 `+N` 从 Obsidian 原生菜单改为插件自定义浮层，便于完全控制样式与方向
- 当标签栏位于底部输入区时，`+N` 菜单优先向上弹出；位于顶部时则优先向下弹出

#### 3. 持久化整组标签状态
- 新增隐藏的 `tabState` 设置结构，记录：
  - 标签顺序
  - 当前激活标签索引
  - 每个标签关联的会话 ID
  - 每个标签的模型覆盖设置
- 视图关闭时落盘，重新打开插件或重启 Obsidian 后按保存状态恢复
- 若某些旧标签关联的会话已不存在，会自动跳过无效项，避免恢复失败

#### 4. 统一 tooltip 体系
- 标签、顶部状态按钮、历史按钮、设置按钮等统一改为项目内自定义 tooltip
- 去掉会触发 Obsidian / 浏览器原生提示的重复属性，解决双提示问题
- 顶部四个按钮的 tooltip 改为向下显示，避免在顶部区域被宿主裁切
- `+N` 按钮悬浮时取消 tooltip，避免被裁切后出现不自然的深色横线阴影

#### 5. 思考预算与 Effort 交互修复
- 思考预算选项的 token 提示改为自定义 tooltip
- 预算下拉改为点击展开，不再悬浮即弹出，降低误触和“悬浮后不知道怎么继续”的停滞感
- 菜单支持点外部关闭与 `Esc` 关闭，鼠标离开触发按钮后仍可稳定点击 `4K / 8K / 16K`
- 当预算栏位于输入区顶部时，菜单优先向上展开，避免被底部区域遮挡

#### 6. 新建标签按钮文案与图标
- “新对话”按钮提示改为“新建标签并在新标签中对话”
- 为新建标签按钮接入自定义圆圈加号图标，并统一右上角按钮图标尺寸，修复图标显示过小问题

#### 7. 部署流程约束写入 AGENTS
- 在 `AGENTS.md` 中补充强约束：
  - 必须先构建，再部署
  - 禁止并行执行构建与部署
  - 部署后必须校验测试库中的最终 `BUILD_ID`
- 这样可以避免“测试库不是最新构建”的误部署情况再次发生

### 📁 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `src/features/chat/tabs/TabBar.ts` | 标签折叠渲染、`+N` 溢出菜单、自定义浮层、弹出方向控制 |
| `src/features/chat/tabs/TabManager.ts` | 新增整组标签恢复逻辑 |
| `src/features/chat/tabs/types.ts` | 新增标签恢复数据结构 |
| `src/features/chat/OpenCodianView.ts` | 顶部按钮 tooltip、标签状态持久化、新建标签按钮图标与提示 |
| `src/features/chat/ui/EffortSelector.ts` | 预算菜单点击展开、关闭逻辑、自定义 tooltip |
| `src/core/types/settings.ts` | 新增 `tabState` 持久化结构与归一化逻辑 |
| `src/core/types/index.ts` | 导出新增的标签状态类型与工具函数 |
| `src/main.ts` | 读取并归一化持久化标签状态 |
| `src/i18n/locales/en.ts` | 新增标签 / 历史 / 设置 / 预算相关英文文案 |
| `src/i18n/locales/zh.ts` | 新增标签 / 历史 / 设置 / 预算相关中文文案 |
| `styles.css` | 标签栏、溢出菜单、tooltip、右上角按钮图标、思考预算菜单样式 |
| `AGENTS.md` | 补充构建与部署的顺序性约束 |

### 📌 当前收益

- 标签栏在多会话场景下更紧凑，也更适合长期使用
- 多标签状态终于能跨重启恢复，不再只剩最后一个标签
- `+N` 的行为与标签栏位置保持一致，用户预期更稳定
- tooltip 不再重复，不再出现顶部看不见、底部挡住、悬浮异常阴影等问题
- 思考预算交互从“悬浮即弹”改为“点击展开”，更加明确、稳健
- 构建与部署流程被正式写入仓库规范，为 1.0.0 发布提供了稳定基础

---

## 2026-03-27 助手消息模型 ID 持久化与外层导航浮层修复

### 📋 本次开发目标
围绕聊天界面补两项直接影响可用性的细节：

1. 在助手消息底部时间戳与复制按钮之间直接显示生成该回复的模型 ID
2. 彻底解决左侧导航按钮被宿主裁切、或为了防裁切而挤压消息正文宽度的问题

### ✅ 实现内容

#### 1. 助手消息新增 `modelId` 持久化字段
- 在 `ChatMessage` 中新增 `modelId?: string`
- 发送消息时根据当前会话模型写入 `provider/model`
- 助手流式完成、错误消息、重新加载后的历史消息都统一走该字段显示模型 ID

#### 2. 助手消息 footer 直接显示模型 ID
- 助手消息底部改为：
  - 时间戳
  - `· provider/model`
  - 复制按钮
- 历史旧消息若没有 `modelId`，则保持兼容，不显示该字段
- 模型 ID 文本支持单行省略，避免长模型名破坏底部布局

#### 3. 服务端消息同步时保留本地 `modelId`
- 现有会话重载 / 同步时会用服务端消息覆盖本地消息
- 为避免本地新增的 `modelId` 被覆盖，新增了同步合并逻辑：
  - 优先按 `sourceMessageId` 回填
  - 对没有 `sourceMessageId` 的本地助手消息做末尾兜底匹配
- 这样刷新会话、重新打开 Obsidian 后，模型 ID 仍可见

#### 4. 导航按钮改为宿主外层独立浮层
- 放弃“向左溢出消息容器”与“内部预留 gutter”的方案
- 导航按钮现在不再挂在消息区内部，而是挂到 `workspace-leaf-content` 级别的独立 host 浮层
- 浮层仅负责承载导航按钮：
  - 不参与消息区布局
  - 不压缩助手消息宽度
  - 不依赖消息区 overflow 是否可见
- 导航按钮位置改为根据消息区 anchor 动态计算纵向中心点，滚动、内容变更、窗口变化时都重新校正

### 📁 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `src/core/types/chat.ts` | 为 `ChatMessage` 新增 `modelId?: string` |
| `src/features/chat/OpenCodianView.ts` | 发送时记录模型 ID、渲染助手 footer、同步回填 `modelId`、导航栏挂载改到宿主外层 |
| `src/features/chat/ui/NavigationSidebar.ts` | 新增外层 host 挂载、位置同步、宿主级浮层销毁逻辑 |
| `styles.css` | 新增助手消息模型 ID 样式，导航浮层宿主样式改为外层 absolute host |

### 🧪 验证结果

- ✅ 多次 `npm run build`
- ✅ 已多次部署到测试库：`C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\`
- ✅ 最终部署版本 BUILD_ID：`fix-revert-model-toggle.202603271716`

### 📌 当前收益

- 助手消息现在能直接看出是哪一个模型生成的
- 模型信息会跟随会话持久化，不会因刷新 / 重载丢失
- 左侧导航按钮不再压缩聊天正文
- 导航按钮从消息区布局中完全抽离，后续只需要微调浮层定位和视觉样式，不必再和消息宽度互相牵连

---

## 2026-03-27 样式设置重置交互去抖与强制回流修复

### 📋 本次开发目标
修复设置页“样式”分组在点击“全部重置”或分组“重置”时的两个问题：

1. 重置后调用 `display()` 重建整页设置面板，导致界面闪动、抖动和轻微滑动
2. 设置页刚重建就同步读取滚动容器布局属性，控制台出现 `Forced reflow while executing JavaScript` 警告

### ✅ 实现内容

#### 1. 样式重置改为原地刷新控件，不再重建整页
- 为样式数值控件建立分组绑定注册表
- “全部重置”与分组“重置”只更新 `chatAppearance` 设置值
- 随后直接把 slider / number input / 高级 CSS 文本框同步到最新值
- 移除重置链路中的 `this.display()`，避免销毁并重建整个设置面板 DOM

#### 2. 高级 CSS 文本框同步校验状态
- 为 `advanced.customCssDeclarations` 单独补充绑定刷新逻辑
- 重置时除文本值外，也同步清理或恢复非法输入提示状态
- 避免出现设置值已经回到默认，但文本框红框或提示仍停留在旧状态

#### 3. 设置页滚动绑定延后到渲染后执行
- 将滚动容器探测、滚动监听绑定、滚动位置恢复收敛到渲染后的 `requestAnimationFrame`
- 不再在 `display()` 刚重建 DOM 后立刻走 `scrollHeight / clientHeight` 判断
- 继续保留设置页滚动记忆能力，同时降低重置后的布局抖动和强制回流概率

### 📁 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `src/features/settings/OpenCodianSettings.ts` | 样式控件绑定注册、重置原地刷新、advanced 文本框同步、设置页滚动绑定延后 |

### 🧪 验证结果

- ✅ `npm run build`
- ✅ 已部署到测试库：`C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\`

### 📌 当前收益

- 点击“全部重置”或分组“重置”时，设置面板不再整页闪烁重建
- 样式控件会原地回到默认值，滚动位置更稳定
- `Forced reflow` 警告触发路径被拆开，设置页交互更顺滑

---

## 2026-03-27 用户消息操作区与导航按钮交互统一

### 📋 本次开发目标
围绕聊天界面的“用户消息操作区”和“左侧导航按钮”做一轮可用性与一致性整理，重点解决：

1. 用户消息复制 / 回退 / 分叉的布局、图标化和 hover 行为不统一
2. 自定义黑色提示与 Obsidian/浏览器原生提示重叠
3. 左侧四个导航按钮默认过于显眼，且在某些消息边距配置下容易遮挡内容
4. 导航提示文案未接入中文

### ✅ 实现内容

#### 1. 用户消息 footer 重构为单行操作区
- 将用户消息原本独立定位的复制按钮收拢进 footer
- 统一为“复制 / 回退 / 分叉 + 时间戳”同一行布局
- 时间戳默认显示，操作按钮仅在 hover / focus 用户消息时显示
- 用户消息气泡内容改为按文本自身宽度收缩，避免短消息被底部按钮区域视觉拉长

#### 2. 回退 / 分叉改为图标按钮
- 将“回退到此处”和“分叉对话”从文字按钮改为图标按钮
- 复用当前玻璃拟态视觉语言，尺寸收敛到与复制按钮一致的 30x30 图标按钮
- 保留对应操作语义，但通过 hover 提示解释含义，减少底部操作区宽度占用

#### 3. Tooltip 统一为自定义黑色提示
- 为用户消息操作区按钮和左侧四个导航按钮统一接入 `data-tooltip` 驱动的黑色 tooltip
- 去掉这些按钮上的原生 tooltip 来源，不再依赖 `title`
- 进一步移除会触发宿主额外提示的 `aria-label` 方案
- 改为 `aria-labelledby + visually-hidden label`，既保留可访问性，又避免双 tooltip 叠加

#### 4. 导航按钮中文化与样式弱化
- 将 `Scroll to top / bottom`、`Previous / Next message` 接入 i18n
- 新增中英文导航提示文案
- 导航侧栏改为：
  - 可滚动时默认半透明显示
  - hover / focus 时恢复完全不透明
- 将侧栏进一步贴近左边框，减少在助手消息靠左布局下的遮挡

### 📁 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `src/features/chat/OpenCodianView.ts` | 用户消息 footer 重构、复制行为复用、图标按钮与可访问性标签整理 |
| `src/features/chat/ui/NavigationSidebar.ts` | 四个导航按钮 tooltip 接入、自定义提示、中文化文案接入 |
| `src/i18n/locales/zh.ts` | 新增导航按钮中文提示 |
| `src/i18n/locales/en.ts` | 新增导航按钮英文提示 |
| `styles.css` | 用户消息底部操作区布局、图标按钮、黑色 tooltip、导航侧栏透明度与左侧定位调整 |

### 🧪 验证结果

- ✅ 多轮 `npm run build`
- ✅ 已部署到测试库：`C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\`

### 📌 当前收益

- 用户消息底部操作区更紧凑，短消息不再被底部按钮区域拉宽
- 回退 / 分叉 / 复制的视觉和交互语义统一
- 自定义黑色 tooltip 不再与宿主原生提示叠加
- 左侧导航按钮默认存在感更低，但悬停时仍然清晰可点击
- 导航提示在中文界面下不再出现英文残留

---

## 2026-03-27 Sticky 滚动模式下 Previous Message 导航定位修复

### 📋 本次开发目标
修复聊天界面在以下两种滚动模式下的历史导航定位问题：

1. `sticky-basic`
2. `sticky-mask`

具体是 `Previous Message` 按钮跳转到上一条用户消息时，只能看到吸顶后的用户消息本身，看不到该回合对应的助手回复；而 `Next Message` 的体感基本正常。

### ✅ 实现内容

#### 1. 导航判断与滚动目标拆分
- 保留“用当前可见位置判断上一条/下一条消息”的逻辑
- 但不再直接使用 `.opencodian-message--user` 的视觉 `top` 作为最终滚动目标
- 避免在 sticky 模式下被 `position: sticky` 改写后的 `getBoundingClientRect()` 误导

#### 2. Sticky 模式改为按 turn 锚点滚动
- 为 `sticky-basic` / `sticky-mask` 新增滚动模式识别
- 当命中 sticky 模式时：
  - 导航选择仍参考用户消息当前视觉位置
  - 实际滚动目标改为对应 `.opencodian-turn` 的文档流起点
- 这样点击 `Previous Message` 时，会回到该回合的真实开头，而不是停在已经吸顶后的 header 位置

#### 3. Natural 模式保持原行为
- 非 sticky 模式仍然沿用用户消息锚点
- 继续保留原有 `10px` 的滚动留白，避免改动自然滚动模式的观感

#### 4. 补充针对性单元测试
- 新增 `NavigationSidebar` 单元测试
- 覆盖两个关键场景：
  - sticky 模式下 `Previous` 应滚动到 turn 锚点
  - natural 模式下仍保留现有 padding 行为

### 📁 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `src/features/chat/ui/NavigationSidebar.ts` | 导航坐标计算改为“视觉定位 + turn 锚点滚动”双轨逻辑 |
| `tests/unit/features/chat/NavigationSidebar.test.ts` | 新增 sticky / natural 导航定位测试 |

### 🧪 验证结果

- ✅ `npx eslint src/features/chat/ui/NavigationSidebar.ts tests/unit/features/chat/NavigationSidebar.test.ts`
- ✅ `npm run test -- NavigationSidebar.test.ts`
- ✅ `npm run build`
- ✅ 已部署到测试库：`C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\`

### 📌 当前收益

- `Previous Message` 在吸顶模式下不再只把用户消息顶到视口顶部
- 上一回合对应的助手消息可以随着导航一起回到可见区域
- `sticky-basic`、`sticky-mask` 与 `natural` 三种滚动模式的导航语义更一致

---

## 2026-03-27 本地 OpenCode 托管认领、端口切换与设置页性能优化

### 📋 本次开发目标
围绕本地 OpenCode 服务的实际使用问题做一轮稳定性与可观测性修复，重点解决：

1. 本地服务在 Obsidian 重载后被误判为“外部服务”
2. 切换模型来源、切换端口时的状态不清晰、失败提示不明确
3. 设置页记忆滚动位置与模型刷新导致的 UI 抖动、强制回流和日志噪音

### ✅ 实现内容

#### 1. 本地服务状态语义重构
- 将本地运行态明确区分为：
  - `运行中（插件托管）`
  - `运行中（外部接管）`
- 聊天视图状态徽标同步细化为：
  - `本地托管`
  - `本地外部`
  - `远程已连接`
- 避免本地 `127.0.0.1` 上已有服务时仍然被笼统显示为普通“运行中”

#### 2. 重载 Obsidian 后认领旧的本地托管进程
- 新增运行态持久化文件 `.opencodian/runtime.json`
- 记录插件托管 OpenCode 的 PID、host、port
- 插件重载后如果检测到同一 PID 仍然存活，且命令行仍匹配当前 `opencode serve --port --hostname`，则自动认领为当前托管实例
- 认领成功后，停止/重启按钮仍可继续管理该服务，而不是退化为“本地外部”

#### 3. Windows 停服逻辑增强
- 本地托管服务停止时，Windows 下改为使用 `taskkill /PID ... /T /F`
- 终止完整 OpenCode 进程树，减少重载 Obsidian 后旧服务残留
- 对已认领但当前实例没有 `ChildProcess` 句柄的 PID，也支持按 PID 停止

#### 4. 端口切换行为收紧
- 修复 `OpenCodeService` 与插件设置对象共享引用导致的“旧端口/新端口比较失效”问题
- 切换本地主机或端口前，先检测目标端口是否可绑定
- 如果目标端口已被占用：
  - 明确抛错并提示
  - 不再静默接管该端口上的健康 OpenCode 实例
- 如果切换失败：
  - 回滚内部设置快照
  - 尝试恢复原本的本地服务
- 设置页的 host/port 输入框改为“提交时生效”，不再每输入一个字符就触发保存与重启

#### 5. 设置页服务状态与模型面板优化
- 设置页服务状态文案按本地托管 / 本地外部 / 远程连接正常重新整理
- 模型来源与服务状态切换时，提示信息更贴近真实状态
- 模型面板刷新做单帧合并，减少短时间重复重建 DOM

#### 6. 设置页记忆滚动位置的性能优化
- 设置页打开时，滚动恢复逻辑由多次 `scrollTop` 重写收敛为“主恢复 + 轻量兜底”
- 缓存设置页滚动容器，避免在打开设置按钮时沿父节点链反复 `getComputedStyle`
- 保留“记忆上次滚动位置”的功能，同时降低 `Forced reflow` 出现概率

#### 7. 模型刷新与图标日志去重
- `onModelsLoaded` 不再直接走整套重型 `saveSettings() + syncOpencodeConfig() + 全视图重刷` 链路
- 服务启动后，只在默认模型实际变化时做轻量持久化
- 聊天视图模型按钮图标在 URL 未变化时不再重复重建 DOM
- `ProviderIconService` 增加日志去重缓存：
  - 同一个 provider 的 icon URL 不变时，不再重复输出 `Icon for xxx: ...`

#### 8. 用户消息底部操作区样式整理
- 调整用户消息底部的复制、回退、分叉按钮布局
- 将复制按钮逻辑抽离为可复用的行为方法
- 统一用户消息 footer 与时间戳样式，减少消息 hover 时的布局跳动

### 📁 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `src/core/opencode/OpenCodeService.ts` | 设置快照隔离、端口切换预检查、失败回滚 |
| `src/core/opencode/ServerManager.ts` | 托管 PID 认领、Windows 进程树终止、端口占用判断增强 |
| `src/core/opencode/types.ts` | 新增 `ManagedServerState` |
| `src/core/storage/StorageService.ts` | 新增运行态文件读写 |
| `src/features/settings/OpenCodianSettings.ts` | 服务状态文案、host/port 提交流程、模型刷新合并、滚动恢复优化 |
| `src/features/chat/OpenCodianView.ts` | 模型选择器图标去重更新、用户消息 footer 与复制逻辑整理 |
| `src/main.ts` | `onModelsLoaded` 轻量化、视图刷新拆分、设置保存流程调整 |
| `src/utils/icons/ProviderIconService.ts` | icon URL debug 日志去重 |
| `src/i18n/locales/en.ts` | 新增服务状态与端口提示文案 |
| `src/i18n/locales/zh.ts` | 新增服务状态与端口提示文案 |
| `styles.css` | 用户消息底部操作区与复制按钮样式调整 |
| `tests/unit/core/storage/StorageService.test.ts` | 运行态托管 PID 存储测试 |

### 🧪 验证结果

- ✅ `npm run build`
- ✅ `npm run test -- OpenCodeService.test.ts StorageService.test.ts`
- ✅ 已多次部署到测试库：`C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\`

### 📌 当前收益

- 本地 OpenCode 服务在重载后更容易继续保持“托管”语义
- 端口切换失败时不再悄悄失效，错误提示更明确
- 设置页打开与模型刷新时的重复重绘和日志噪音明显减少
- 控制台输出更容易区分“插件重复加载”与“同一 UI 重复请求图标”

---

## 2026-03-27 Logger 控制台输出增加时间戳

### 📋 本次开发目标
继续打磨日志可读性，让控制台输出在不打开诊断报告的情况下也能快速判断事件发生顺序。

### ✅ 实现内容

#### 1. 为 logger 控制台输出统一添加本地时间戳
- 在 `src/shared/logger.ts` 中新增 `getTimestamp()`
- `formatArgs()` 统一改为输出：
  - `[HH:mm:ss] [scope] message`
- 适用于：
  - `logger.info()`
  - `logger.debug()`
  - `logger.warn()`
  - `logger.error()`

#### 2. 保持最近诊断日志结构不变
- 本次仅调整控制台展示格式
- `recentLogEntries` 仍保留原有 ISO 时间戳与消息结构
- 避免影响现有诊断报告拼装逻辑

### 📁 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `src/shared/logger.ts` | 为控制台日志前缀增加 `HH:mm:ss` 时间戳 |

### 🧪 验证结果

- ✅ `npm run lint -- src/shared/logger.ts`
- ✅ `npm run build`
- ✅ 已重新部署到测试库：`C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\`

---

## 2026-03-27 BUILD_ID 系统与发布流程完善

### 📋 本次开发目标
本轮主要建立版本可追溯机制和标准化发布流程：

1. **建立 BUILD_ID 生成机制**
   - 每次构建自动生成包含分支信息和时间戳的唯一标识
   - 格式：`{branch}.{YYYYMMDDHHmm}`，例如 `fix-revert-model-toggle.202603271430`

2. **Logger 增强**
   - 添加 `info` 方法用于无条件输出（不受调试开关控制）
   - 用于在插件加载时输出 BUILD_ID

3. **标准化版本发布流程**
   - 添加 npm scripts 支持自动更新版本号
   - 支持 patch / minor / major 三种升级类型

### ✅ BUILD_ID 生成与注入系统

#### 1. 构建工具模块 (`scripts/build-utils.mjs`)
新增专用的构建工具模块，提供：
- `getGitBranch()` - 获取当前 git 分支名称
- `sanitizeBranchName(branch)` - 清洗分支名（将 `/` 替换为 `-`，移除非法字符）
- `getLocalTimeStamp()` - 获取本地时间戳（格式 `YYYYMMDDHHmm`）
- `generateBuildId()` - 组合分支和时间戳生成 BUILD_ID

#### 2. 开发模式 BUILD_ID 注入 (`esbuild.config.mjs`)
- 在开发监听模式下自动生成 BUILD_ID
- 通过 esbuild 的 `define` 选项将 BUILD_ID 注入为全局变量
- 构建时在控制台输出 `[dev] BUILD_ID: xxx`

#### 3. 生产构建 BUILD_ID 注入 (`scripts/build.mjs`)
- 生产模式下同样生成并注入 BUILD_ID
- 构建时在控制台输出 `[build] BUILD_ID: xxx`
- BUILD_ID 会被打包进最终的 `dist/main.js`

### ✅ Logger info 方法添加 (`src/shared/logger.ts`)

#### 方法特性
- `logger.info()` - 无条件输出，不受调试开关控制
- `logger.debug()` - 受调试开关控制（保持不变）
- `logger.warn()` / `logger.error()` - 无条件输出（保持不变）

#### 使用场景
`info` 方法专门用于输出重要但非错误的信息，如：
- 插件加载时输出 BUILD_ID
- 服务器启动/停止通知
- 其他需要总是可见的运行日志

### ✅ 插件加载时输出 BUILD_ID (`src/main.ts`)

在 `onload()` 方法中添加：
```typescript
logger.info(`OpenCodian BUILD_ID: ${BUILD_ID}`);
```

效果：
- 每次插件加载时，在 Obsidian 开发者控制台输出 BUILD_ID
- 方便调试时确认当前运行的是哪个版本
- 不受调试开关影响，总是可见

### ✅ 版本发布脚本 (`scripts/release.mjs`)

#### 支持的命令
```bash
npm run release:patch  # 修复版：0.1.0 → 0.1.1
npm run release:minor  # 次版本：0.1.0 → 0.2.0
npm run release:major  # 主版本：0.1.0 → 1.0.0
```

#### 自动更新的文件
- `package.json` - 更新 `version` 字段
- `package-lock.json` - 同步版本号
- `manifest.json` - 通过 `version` 生命周期钩子同步

#### 实现细节
- 使用 `npm version` 命令进行版本升级
- `--no-git-tag-version` 避免自动创建 git 标签
- 通过现有的 `sync-version.js` 保持 manifest.json 同步

### ✅ 文档更新 (`AGENTS.md`)

#### 新增内容
- **Version Release Rules** 版本发布规则说明
- **BUILD_ID** 格式和用途说明
- **Typical Release Workflow** 典型发布流程示例

### 📁 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `scripts/build-utils.mjs` | 新增 BUILD_ID 生成工具函数 |
| `scripts/build.mjs` | 集成 BUILD_ID 生成与注入 |
| `scripts/release.mjs` | 新增版本发布脚本 |
| `esbuild.config.mjs` | 开发模式下注入 BUILD_ID |
| `src/shared/logger.ts` | 添加 `info` 方法 |
| `src/main.ts` | 插件加载时输出 BUILD_ID |
| `package.json` | 添加 `release:*` scripts |
| `AGENTS.md` | 更新发布流程和 BUILD_ID 文档 |

### 🧪 验证结果

- ✅ `npm run build` 正确输出 BUILD_ID
- ✅ `npm run dev` 正确输出 BUILD_ID
- ✅ 插件加载时控制台显示 BUILD_ID
- ✅ `npm run release:patch` 正确更新版本号

---

## 2026-03-27 设置页模型开关回退与稳定支线切换

### 📋 问题背景

- 在后续加入“模型 / 提供商开关”后，Obsidian 设置页出现严重渲染回归：
  - 切换开关后下半屏变黑 / 变空
  - 有时整个设置页直接发黑
- 多轮排查后确认：
  - 设置内容本身没有丢失
  - `scrollHeight` / `contentHeight` 等高度指标保持正常
  - 问题更接近 Obsidian 设置弹窗内部滚动 / 重绘层回归

### ✅ 今日处理结果

#### 1. 识别问题引入点

- 以 `27631b4` 为稳定参考点确认：
  - 当时模型列表为只读展示，没有开关
  - 设置页滚动与渲染正常
- 继续排查后定位到引入开关的提交：
  - `ca3274a` `feat: add model/provider toggle switches in settings`

#### 2. 保护当前排查现场

- 创建备份分支：
  - `backup/settings-black-screen`
- 将黑屏排查中的未提交改动保存到 stash：
  - `stash@{0}` → `wip: settings black-screen debug`

#### 3. 建立稳定工作支线

- 基于当前工作线新建修复分支：
  - `fix/revert-model-toggle`
- 在该分支上回退模型开关功能提交：
  - 新提交：`73ab805`
  - 作用：撤回 `ca3274a`

#### 4. 当前开发决策

- 后续开发暂时以 **无模型开关** 的稳定支线继续
- 保留：
  - 模型来源模式
  - 默认 provider / model 选择
  - 模型可视化配置面板
  - 模型 JSON 编辑器
- 暂时不恢复：
  - 设置页中的 provider / model enable/disable 开关

### 🧭 当前分支状态

- `feature/fork-conversation`
  - 原主工作线，仍包含模型开关引入后的历史
- `backup/settings-black-screen`
  - 用于保留排查现场与 stash
- `fix/revert-model-toggle`
  - 当前继续开发的稳定支线

### 📌 结论

- 这次不是放弃后续提交，而是**只回退已确认导致设置页回归的那条功能线**
- 其余已完成功能仍保留在当前稳定支线中继续使用

---

**会话日期**: 2026-03-26
**开发时间**: ~3-4 小时
**主要贡献**: 模型来源模式、模型目录可视化、provider/model 配置面板、模型 JSON 编辑器、聊天页模型可用性校验
**当前状态**: 已部署测试库，可继续在真实 vault 中验证本地 / 服务器 / 合并三种模型来源行为

---

## 2026-03-27 标签栏位置与布局重构

### ✅ 新增能力

- 在设置中新增 `标题栏下方 (below-header)` 标签栏位置。
- 为 `below-header` 新增两种布局：
  - `grid`：横向单行紧凑布局，最多显示 5 个标签，超出折叠为 `+N`
  - `vertical`：左侧悬浮竖排布局，最多显示 5 个按钮，超出折叠为 `+N`
- 新增 `belowHeaderTabBarLayout` 设置项，并将默认标签栏位置切换为 `below-header`。

### 🎨 交互与样式调整

- `header` 位置的标签默认不展开标题，仅在悬浮时让非焦点标签恢复实体感。
- `below-header/grid` 改为默认单行紧凑显示，非焦点标签默认虚化且不展开，只在悬浮时横向展开。
- `below-header/vertical` 改为与导航按钮同尺寸的悬浮玻璃按钮，文字在悬浮时横向展开，不挤压正文内容。
- 增强非焦点标签和 `+N` 的虚化程度。
- 修复输入框附近首个标签在悬浮时出现明显长方形阴影棱角的问题，hover/focus/active 时允许阴影溢出显示。

### 🏗️ 结构调整

- `OpenCodianView` 增加第三个标签挂载点 `below-header`，并根据设置在 `header / below-header / input` 之间切换。
- 竖排标签进一步移动到外层 `host`，与导航按钮使用同级的绝对定位覆盖层，而不是继续挂在聊天容器内部。
- `TabBar` 渲染逻辑按布局模式区分可见标签数和 `+N` 溢出规则。

### 🌐 国际化与设置

- 中英文设置文案新增：
  - `标题栏下方 / Below header`
  - `下方标签布局 / Below-header tab layout`
  - `横向多行 / Horizontal multi-row`
  - `左侧竖排悬浮 / Floating vertical rail`

### 🧪 验证

- 补充 `TabBar` 单测，覆盖：
  - `header` 布局最多 4 个可见标签
  - `below-header/grid` 最多 5 个可见标签
  - `below-header/vertical` 最多 5 个可见标签
- 更新测试环境中的 DOM helper，补齐 `createEl / createDiv / createSpan / addClass / toggleClass / empty`。
- 调整 `NavigationSidebar` 测试以匹配当前构造参数。
- 本轮改动已通过多次 `npm run test` 与 `npm run build` 验证，并已同步部署到 Test Vault。

### 📁 涉及文件

- `src/core/types/settings.ts`
- `src/core/types/index.ts`
- `src/main.ts`
- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/tabs/TabBar.ts`
- `src/features/chat/tabs/types.ts`
- `src/features/chat/tabs/index.ts`
- `src/features/settings/OpenCodianSettings.ts`
- `src/i18n/locales/en.ts`
- `src/i18n/locales/zh.ts`
- `styles.css`
- `tests/setup.ts`
- `tests/unit/core/types/settings.test.ts`
- `tests/unit/features/chat/NavigationSidebar.test.ts`
- `tests/unit/features/chat/tabs/TabBar.test.ts`

---

## 2026-03-26 助手消息对齐修复与代码块复制入口收敛

### 📋 本次开发目标
本轮主要处理两个聊天界面细节问题，并补充代理默认交付流程：

1. **统一助手消息内部内容的左对齐基线**
   - 让思考块、正文、工具调用块与底部时间戳共享同一左边界
   - 消除助手消息中由多层 padding 造成的视觉错位

2. **移除代码块右下角冗余复制按钮**
   - 保留现有右上角复制入口
   - 去掉 Obsidian 默认注入、在当前界面里显得突兀的代码块复制按钮

3. **补充默认测试库部署约定**
   - 约定在本仓库中完成代码/样式修改后默认构建并同步到 Test Vault

### ✅ 助手消息左对齐修复

#### 1. 抽出助手消息共享间距变量
- 在 `styles.css` 容器变量区新增：
  - `--opencodian-assistant-pad-y`
  - `--opencodian-assistant-pad-x`
  - `--opencodian-assistant-content-pad-y`
  - `--opencodian-assistant-content-pad-x`
- 避免助手消息外层、内容层、时间行各自写死横向间距

#### 2. 统一正文区与时间戳的左边界
- `opencodian-message--assistant` 继续负责外层横向留白
- `opencodian-message-content` 与 `opencodian-message-time-row` 统一使用相同的内容层横向内边距
- 修复思考块、正文、工具调用块和时间戳左边界不一致的问题

#### 3. 折叠/展开行为保持不变
- 未改动：
  - `.streaming-thinking-block.is-expanded`
  - `.streaming-tool-call.is-expanded`
  - 内容区现有的展开动画与内部缩进逻辑

### ✅ 代码块复制入口收敛

#### 1. 渲染阶段移除 Obsidian 默认复制按钮
- 在 `src/utils/markdown/MarkdownRenderer.ts` 中检测到 `.copy-code-button` 后直接移除
- 不再把默认复制按钮保留在代码块包装层中

#### 2. 样式层增加兜底隐藏
- 在 `styles.css` 中新增：
  - `.markdown-code-wrapper .copy-code-button { display: none !important; }`
- 避免在渲染时序变化或宿主行为调整时按钮重新显现

#### 3. 保留现有顶部复制入口
- 代码块右上角已有复制入口继续保留
- 最终收敛为单一复制交互，减少视觉噪音

### ✅ 代理默认部署流程补充

#### 1. 仓库级默认规则
- 在 `AGENTS.md` 中新增 `Agent Default Deploy Workflow`
- 约定在本仓库中完成代码、样式、manifest 或构建相关修改后，默认执行：
  - `npm run build`
  - 同步 `dist/main.js`、`dist/manifest.json`、`dist/styles.css` 到 Test Vault

#### 2. 本轮执行结果
- 已完成 `npm run build`
- 已同步到测试库：
  - `C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\`

### 📁 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `styles.css` | 修复助手消息内容与时间戳左对齐，并隐藏代码块默认复制按钮 |
| `src/utils/markdown/MarkdownRenderer.ts` | 移除 Obsidian 默认注入的代码块复制按钮 |
| `AGENTS.md` | 新增默认构建并部署到 Test Vault 的仓库规则 |

### 🧪 验证结果

- ✅ `npm run build`
- ✅ 已部署到 Test Vault

## 2026-03-26 会话样式系统落地与设置面板交互打磨

### 📋 本次开发目标
本轮围绕「会话界面可定制化」与「设置页使用体验」两条主线推进：

1. **为聊天界面建立可持久化的样式系统**
   - 在设置中新增独立 `样式 / Style` 大项
   - 支持对消息区、吸顶遮盖、用户消息、助手消息、输入区进行结构化调节
   - 保留高级 CSS 声明兜底，满足实验性微调需求

2. **完善设置页的视觉层级与交互体验**
   - 优化子分组层级、滑块控件排布、快速导航与关闭按钮关系
   - 为聊天相关滚动条增加主题安全的美化配置
   - 修复设置页从插件入口打开时的滚动记忆、定位跳转与初始焦点问题

### ✅ 会话样式配置系统（V1）

#### 1. 新增 `chatAppearance` 设置模型
- 在 `src/core/types/settings.ts` 中新增 `chatAppearance` 结构
- 拆分为：
  - `layout`
  - `sticky`
  - `user`
  - `assistant`
  - `input`
  - `scrollbar`
  - `advanced`
- 增加默认值工厂与 normalize 逻辑，确保老用户设置缺失时自动补齐

#### 2. 建立“即时预览 + 延迟持久化”链路
- 在 `src/main.ts` 中新增独立的样式应用与防抖保存流程
- 样式修改后可立即推送到已打开聊天视图
- 样式持久化不再触发模型刷新、服务重载、权限同步等无关副作用

#### 3. 聊天视图接入样式变量映射
- 新增 `src/features/chat/chatAppearance.ts`
- 将 `chatAppearance` 映射为容器级 CSS 变量
- 在 `src/features/chat/OpenCodianView.ts` 中统一应用变量，并注入高级声明模式的自定义样式：
  - 结构化参数先应用
  - `customCssDeclarations` 后应用，允许高级区覆盖前者

### ✅ 设置页新增“样式 / Style”大项

#### 1. 新增样式子分组
- 在 `src/features/settings/OpenCodianSettings.ts` 中新增独立 `Style` section
- 子分组包括：
  - `布局与吸顶`
  - `用户消息`
  - `助手消息`
  - `输入区`
  - `滚动条`
  - `高级样式`
- 同步加入 quick nav 快捷导航

#### 2. 抽象统一的数值调节控件
- 所有数值项统一采用：
  - 左减按钮
  - 固定宽度滑块
  - 数字输入框
  - 右加按钮
  - 单项重置按钮
- 支持 clamp、步长控制、即时预览、失焦/停止操作后延迟保存
- 补充子分组重置与整组“全部恢复默认”

#### 3. 强化设置页层级与主题安全
- 子分组标题改为更弱的视觉层级，明确低于主标题
- 子分组描述、标题、具体设置项统一左对齐基准线
- 为子分组增加更明确的容器包裹感
- 所有容器背景、分割线、按钮、说明文本全面改用 Obsidian 主题变量，避免硬编码颜色

### ✅ 滚动条样式配置（聊天界面）

#### 1. 新增滚动条结构化配置
- 在 `chatAppearance.scrollbar` 中新增：
  - `width`
  - `radius`
  - `trackOpacity`
  - `thumbOpacity`
  - `thumbHoverOpacity`
  - `edgePadding`
  - `shadowOpacity`

#### 2. 聊天区域滚动条主题化渲染
- `styles.css` 中为以下区域接入统一滚动条变量：
  - `.opencodian-messages-scroll`
  - `.opencodian-messages`
  - `.opencodian-history-scroll`
- WebKit 侧使用 `::-webkit-scrollbar*`
- Firefox 侧使用 `scrollbar-width` / `scrollbar-color` 做降级兼容
- 颜色继续基于主题变量，通过透明度与阴影强度控制质感，不开放自由配色输入

#### 3. 设置页滚动条额外美化
- 同时对 `.opencodian-settings` 的滚动条做了独立主题适配优化
- 让其在深浅主题下保持更柔和的可见度与悬停反馈
- 该部分属于设置面板视觉优化，不纳入聊天 `chatAppearance.scrollbar` 持久化配置

### ✅ 会话与设置界面样式细节收敛

#### 1. 助手消息视觉回调
- 收敛助手消息样式方向，弱化侵入文字区域的边缘高光
- 改为以圆角、阴影与轻量玻璃质感为主，拒绝明显渐变边缘

#### 2. 本地服务按钮与吸顶遮盖细节修复
- 缩小本地服务按钮阴影范围，避免悬浮层过重
- 修复主题切换时吸顶柔和遮盖未同步刷新背景的问题

#### 3. 快捷导航与关闭按钮布局修复
- 调整 `.opencodian-settings-quick-nav` 与 `.modal-close-button` 的相对关系
- 最终收敛为：快捷跳转维持原有长度与吸顶位置，关闭按钮移动到其右上角附近，避免重叠与错位

### ✅ 设置页滚动位置记忆与入口修复

#### 1. 设置页滚动位置记忆
- 在 `OpenCodianSettings` 中新增设置面板滚动容器绑定、恢复与捕获逻辑
- 支持记忆用户上次离开 `OpenCodian` 设置页时的滚动位置
- 原生 Obsidian 设置入口与插件内部入口均纳入兼容处理

#### 2. 插件入口定向打开修复
- 修复聊天界面右上角设置按钮打开后总是回到开头的问题
- 修复“本地服务”入口应跳转到服务项却落回页首的问题
- 对手动 restore 与定向滚动逻辑进行拆分，减少互相覆盖

#### 3. 初始焦点与闪动细节修复
- 清理 quick nav 初始焦点，避免从原生设置入口进入时出现语言说明 tooltip 被错误激活
- 继续收敛由多阶段滚动恢复造成的闪动感

### 📁 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `src/core/types/settings.ts` | 新增 `chatAppearance` 类型、默认值与 normalize 逻辑 |
| `src/core/types/index.ts` | 导出新的样式设置相关类型 |
| `src/features/chat/chatAppearance.ts` | 新增聊天样式变量映射与高级 CSS 声明构建工具 |
| `src/features/chat/OpenCodianView.ts` | 聊天视图接入样式应用、设置入口与服务跳转修复 |
| `src/features/settings/OpenCodianSettings.ts` | 新增样式大项、滑块控件、滚动记忆、quick nav 焦点修复 |
| `src/main.ts` | 新增样式即时应用与防抖持久化链路 |
| `src/i18n/locales/en.ts` | 补充样式与滚动条设置英文文案 |
| `src/i18n/locales/zh.ts` | 补充样式与滚动条设置中文文案 |
| `styles.css` | 新增聊天样式变量、滚动条样式、设置页层级与控件视觉优化 |
| `tests/unit/core/types/settings.test.ts` | 补充 `chatAppearance` 默认值与 normalize 测试 |
| `tests/unit/features/chat/chatAppearance.test.ts` | 新增聊天样式变量映射与高级声明测试 |

### 🧪 验证结果

- ✅ `npm run typecheck`
- ✅ `npm run lint`
- ✅ `npm run test`
- ✅ `npm run build`

## 2026-03-26 全主题适配修复与双环境构建稳定性优化

### 📋 本次开发目标
本轮主要完成两类问题收敛：

1. **聊天与设置界面全主题适配**
   - 避免在 Minimal、Things、Catppuccin、AnuPpuccin 等第三方主题下出现“贴补丁感”
   - 清除样式中的固定亮色/暗色假设
   - 统一改为基于 Obsidian 语义变量与 `color-mix()` 的主题感知写法

2. **Windows / macOS 双环境开发稳定性**
   - 修复因 Syncthing 同步 `node_modules/` 导致的 `esbuild` 平台二进制错配
   - 为仓库增加可重复执行的检测/修复命令
   - 补充仓库内说明，降低后续切系统时的维护成本

### ✅ 主题适配修复内容

#### 1. 建立统一的 Theme-Aware 变量层
- 在 `styles.css` 顶部新增一组 `--opencodian-*` 语义变量
- 覆盖表面层级、玻璃背景、边框、阴影、悬浮态、强调色、成功/警告/错误状态
- 所有变量都基于：
  - `--background-primary`
  - `--background-secondary`
  - `--background-modifier-*`
  - `--interactive-accent`
  - `--text-normal`

#### 2. 移除样式中的硬编码颜色
- 清除了 `styles.css` 中所有：
  - 十六进制颜色
  - `rgba(255,255,255,...)`
  - `rgba(0,0,0,...)`
  - 其他固定色值混合写法
- 改为统一使用 `color-mix(in srgb, var(--xxx), transparent)` 或 Obsidian 标准变量

#### 3. 重点重做的界面组件
- **用户消息气泡**：改为主题感知玻璃态背景、边框和阴影
- **助手消息悬浮态**：改为基于 `--background-modifier-hover`
- **notice 卡片**：warning / error / info 改为语义状态色
- **复制按钮**：从固定亮面按钮改为主题融入式悬浮操作按钮
- **模型下拉框**：重做弹层背景、搜索框、选中/悬浮态
- **设置页快速导航**：重做 sticky 面板、chip、tooltip、箭头
- **权限模式下拉 / 历史下拉 / 删除确认弹窗 / 权限弹窗**：统一改为主题感知玻璃层
- **内联权限卡片与状态标记**：改为语义成功/错误状态色

#### 4. 结果
- `styles.css` 中已不再包含硬编码颜色
- 插件界面在深色、浅色及第三方主题下都能更自然地融入宿主环境

### ✅ 双环境构建问题修复

#### 1. 发现的问题
- 在 macOS 上执行 `npm run build` 时，`esbuild` 报错：
  - 当前平台需要 `@esbuild/darwin-arm64`
  - 但工作目录里实际存在的是 `@esbuild/win32-x64`
- 根因是 **Syncthing 同步了 `node_modules/`**，导致 Windows 安装出的原生依赖覆盖了 macOS 本地依赖

#### 2. 新增 `esbuild` 检查/修复脚本
- 新增 `scripts/doctor-esbuild.mjs`
- 功能：
  - 检测当前平台与已安装 `@esbuild/*` 包是否匹配
  - 直接验证 `esbuild` 是否可运行
  - 在需要时自动触发 `npm ci` / `npm install` 修复当前平台依赖

#### 3. 新增 npm 命令
- `npm run doctor:esbuild`
- `npm run doctor:esbuild:fix`

#### 4. 构建脚本增强
- `scripts/build.mjs` 中增加了更友好的错误提示
- 当再次遇到平台错配时，会明确提示先运行 `npm run doctor:esbuild:fix`

### ✅ Syncthing 同步策略调整

#### 1. 新增 `.stignore`
新增 Syncthing 忽略文件，避免继续同步跨平台或本地构建产物：

- `node_modules/`
- `dist/`
- `coverage/`
- `.tmp-tsc-out/`
- `.DS_Store`
- `Thumbs.db`

#### 2. 后续工作流
- 切换系统后通常**不需要**每次都跑 `doctor`
- 只有在以下情况才需要执行：
  - 依赖变更
  - 手动重装/删除过依赖
  - `build` / `dev` 再次出现 `esbuild` 平台不匹配报错

### 📁 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `styles.css` | 全面清除硬编码颜色并重构为主题感知变量体系 |
| `scripts/doctor-esbuild.mjs` | 新增 esbuild 平台检测与修复脚本 |
| `scripts/build.mjs` | 构建脚本增加平台错配提示 |
| `package.json` | 新增 `doctor:esbuild` / `doctor:esbuild:fix` 命令 |
| `.stignore` | 新增 Syncthing 忽略规则，排除 `node_modules` 等本地目录 |
| `README.md` | 补充双环境开发与 doctor 命令说明 |
| `AGENTS.md` | 补充 Syncthing / esbuild 简短开发说明 |

### 🧪 验证结果

- ✅ 已确认 `styles.css` 中不再包含十六进制颜色或 `rgba(...)` 硬编码色值
- ✅ `npm run doctor:esbuild`
- ✅ `npm run doctor:esbuild:fix`
- ✅ `npm run build`

## 2026-03-26 无模型提示卡片新增“前往模型设置”快捷按钮

### 📋 功能补充
在“无模型可用”的会话内 notice 卡片基础上，继续补充一个更直接的操作入口：
- 卡片内新增 **前往模型设置** 按钮
- 点击后直接打开 OpenCodian 设置页
- 自动滚动定位到 **模型** 设置区

### ✅ 实现说明
- notice 卡片的动作不是临时 DOM，而是作为会话消息元数据一起持久化保存
- 因此即使：
  - 切换会话
  - 关闭后重新打开
  - 重启 Obsidian
- 这张卡片和它的按钮都会继续存在，并保持可点击

### 📁 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `src/core/types/chat.ts` | 新增 notice action 持久化类型 |
| `src/features/chat/OpenCodianView.ts` | 渲染 notice 按钮并处理“前往模型设置”动作 |
| `src/features/settings/OpenCodianSettings.ts` | 新增滚动到模型设置区的方法 |
| `styles.css` | 新增 notice 操作按钮样式 |
| `src/i18n/locales/zh.ts` | 新增中文按钮文案 |
| `src/i18n/locales/en.ts` | 新增英文按钮文案 |
| `tests/unit/core/storage/StorageService.test.ts` | 校验 notice action 能随会话持久化保存 |

### 🧪 验证结果

- ✅ `npm run typecheck`
- ✅ `npm run test`
- ✅ `npm run lint`
- ✅ `npm run build`

## 2026-03-26 无模型发送失败提示改为会话内持久卡片

### 📋 问题描述
当当前来源模式下没有可用模型时，用户在聊天页发送消息会出现两个体验问题：
- 会话区插入一整块非常突兀的红色错误块
- 同时右上角还会弹出 `Notice` 提示，视觉上重复且打断感很强

另外，这类提示如果只是临时浮层，也无法在重新打开会话或重启 Obsidian 后保留下来。

### ✅ 修复内容

#### 1. 无模型提示改为会话内 notice 卡片
- 不再为该场景使用红色 `streaming-error-block`
- 改为在聊天流中插入一张样式更温和的 **notice 卡片**
- 卡片根据当前来源模式给出更具体的说明：
  - 仅本地：提示本地 `.opencode/opencode.json` 尚无模型
  - 仅服务器：提示服务器未暴露模型
  - 合并模式：提示当前来源模式下没有可用模型
  - 已选模型失效：提示当前会话模型已不可用

#### 2. 去掉右上角重复弹窗
- `modelUnavailable` 这条发送前校验链路不再调用右上角 `Notice`
- 避免在会话中已经给出提示卡片时，界面顶部再重复提示一次

#### 3. 提示卡片持久化到会话
- 新增 assistant message 的 notice 展示元数据并直接保存进会话 JSON
- 这样在以下情况下都能保持原位显示：
  - 切换会话
  - 关闭后重新打开会话
  - 重启 Obsidian

### 📁 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `src/core/types/chat.ts` | 为消息新增 notice 展示元数据字段 |
| `src/features/chat/OpenCodianView.ts` | 将无模型错误改为会话内持久卡片，并移除右上角重复提示 |
| `styles.css` | 新增聊天 notice 卡片样式 |
| `src/i18n/locales/zh.ts` | 新增中文 notice 文案 |
| `src/i18n/locales/en.ts` | 新增英文 notice 文案 |
| `tests/unit/core/storage/StorageService.test.ts` | 补充 notice 消息持久化回归测试 |

### 🧪 验证结果

- ✅ `npm run typecheck`
- ✅ `npm run test`
- ✅ `npm run lint`
- ✅ `npm run build`

## 2026-03-26 模型来源列表设置页布局优化

### 📋 问题描述
模型来源区此前采用 **本地配置 / 服务器配置 / 当前生效列表** 三张卡片并排展示：
- provider / model 很多时，页面会被拉得很长
- 三卡片布局在不同宽度下容易出现大块留白
- “默认合并模式”说明单独占据一行，信息密度偏低

### ✅ 优化内容

#### 1. 三卡片改为单面板标签切换
- 将三份模型目录改为单个面板展示
- 通过标签切换查看：
  - 本地配置
  - 服务器配置
  - 当前生效列表
- 默认根据当前来源模式自动选中最相关视图：
  - `仅本地` → 本地配置
  - `仅服务器` → 服务器配置
  - `合并模式` → 当前生效列表

#### 2. 列表区域固定高度并支持滚动
- 模型目录面板改为固定高度滚动区
- provider 数量较多时不会继续无限拉长整个设置页
- 去掉原先三列卡片造成的视觉割裂和底部空白

#### 3. 合并模式说明并入来源选项
- 删除来源模式下方单独说明文案
- 将“默认使用合并模式，本地优先覆盖”直接并入 **合并模式** 选项文本
- 让用户在切换来源时直接看到关键规则

### 📁 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `src/features/settings/OpenCodianSettings.ts` | 将三卡片目录重构为单面板标签切换视图 |
| `styles.css` | 新增模型目录标签页与滚动面板样式，移除旧三卡片布局样式 |
| `src/i18n/locales/zh.ts` | 调整模型来源模式与目录摘要文案 |
| `src/i18n/locales/en.ts` | 同步英文文案 |

### 🧪 验证结果

- ✅ `npm run typecheck`
- ✅ `npm run lint`
- ✅ `npm run build`

## 2026-03-26 仅本地模式空模型仍可发送问题修复

### 📋 问题描述
在设置中把模型来源切换为 **仅本地** 后，如果本地 `.opencode/opencode.json` 里没有任何 provider / model：
- 会话页模型选择器仍会显示之前残留的服务器模型名
- 下拉展开后列表为空，显示与实际状态不一致
- 用户继续发送消息时，OpenCode 仍可能沿用服务器侧可用模型完成回复

### 🔍 原因分析
- `src/features/chat/OpenCodianView.ts` 中，会话模型显示和发送逻辑此前没有在 **“模型目录已经加载，但当前模型已失效 / 不存在”** 的场景下彻底清空旧值
- 设置页中的默认 provider / model 在有效模型列表为空时，也没有及时重置为空字符串
- `src/core/opencode/ServerManager.ts` 在 **仅本地** 模式下，如果本地没有 provider，之前不会显式把 `enabled_providers` 约束为空集合，导致受管 OpenCode 进程仍可能继续使用服务端/全局配置

### ✅ 修复内容

#### 1. 聊天页模型选择器严格跟随当前有效目录
- `getCurrentSessionModel()` 现在会在模型目录已加载后校验：
  - 当前会话覆盖模型是否仍存在
  - 默认 provider / model 是否仍存在
- 若两者都无效，则回退到首个可用模型；如果根本没有模型，则返回 `null`
- 模型选择器触发按钮在无模型时显示 **No models available**

#### 2. 无模型时阻止发送
- 发送消息前会再次校验当前 provider / model：
  - 未选择模型时直接阻止发送
  - 当前模型不在有效目录中时直接阻止发送
  - 当前模型不在服务端实际可用模型中时直接阻止发送

#### 3. 设置页同步清空失效默认值
- 在 `src/features/settings/OpenCodianSettings.ts` 中：
  - 若当前有效 provider 列表为空，则自动将 `defaultProvider` 置空
  - 若当前 provider 下已无模型，则自动将 `defaultModel` 置空
- provider / model 下拉框在空状态下明确显示无模型提示

#### 4. 仅本地模式显式禁用非本地 provider
- `src/core/opencode/ServerManager.ts` 在 `modelSourceMode === 'local'` 时：
  - 强制设置 `OPENCODE_DISABLE_PROJECT_CONFIG=true`
  - 指向 vault 内 `.opencode` 目录
  - 无论本地 provider 是否为空，都写入：
    - `OPENCODE_CONFIG_CONTENT={"enabled_providers":[]}`
- 这样即使本地没有模型，也不会再隐式回退到服务器/全局 provider

### 📁 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `src/features/chat/OpenCodianView.ts` | 修复会话模型选择器旧值残留，并在无模型时阻止发送 |
| `src/features/settings/OpenCodianSettings.ts` | 有效模型为空时清空默认 provider / model |
| `src/core/opencode/ServerManager.ts` | 仅本地模式下显式写入空 `enabled_providers` |
| `tests/unit/core/opencode/ServerManager.test.ts` | 补充仅本地空 provider 场景测试 |

### 🎯 修复效果
- ✅ 仅本地模式且本地无模型时，聊天页不再显示旧服务器模型
- ✅ 模型下拉框和实际可发送状态保持一致
- ✅ 无模型时发送会被拦截，不会再意外走到服务器模型
- ✅ 受管本地 OpenCode 服务严格遵循本地模型来源模式

### 🧪 验证结果

- ✅ `npm run typecheck`
- ✅ `npm run test`
- ✅ `npm run lint`
- ✅ `npm run build`

## 2026-03-26 设置页重复配置项渲染修复

### 📋 问题描述
设置界面在首次打开时通常正常，但在修改服务器相关配置并触发设置页重新渲染后，**用户 / 调试 / 界面** 等后半段配置区会重复追加到页面中，形成重复的设置项。

### 🔍 原因分析
- `src/features/settings/OpenCodianSettings.ts` 中的 `display()` 之前是异步方法
- `display()` 在渲染过程中会等待异步的 `addSecuritySettings()`
- 旧实现里 `addSecuritySettings()` 又会在中途 `await updateConfigStatus()`
- 一旦服务器配置变化再次触发 `display()`，前一次渲染可能尚未完成，导致前一次渲染恢复后又把后续的 **UI / Debug / User** 分区再次插入 DOM

本质上，这是一个由**设置页中途让出执行权**引发的重渲染竞态问题。

### ✅ 修复内容

#### 1. 将安全设置区恢复为同步渲染链路
- `addSecuritySettings()` 保持为同步方法
- 不再阻塞整个设置页主渲染流程

#### 2. 配置状态检查改为非阻塞执行
- 初始配置状态刷新从阻塞式等待改为：
  - `void updateConfigStatus().catch(...)`
- 这样配置状态仍会异步更新，但不会打断整页顺序渲染

#### 3. 将设置页 `display()` 明确改为同步方法
- 把 `display()` 从 `async display(): Promise<void>` 改为 `display(): void`
- 使设置页的渲染语义与当前实现保持一致
- 降低后续再次引入中途 `await` 导致竞态的风险

### 📁 涉及文件

| 文件 | 修改内容 |
|------|----------|
| `src/features/settings/OpenCodianSettings.ts` | 将设置页主渲染方法改为同步，并保持安全设置区状态检查为非阻塞调用 |

### 🎯 修复效果
- ✅ 修改服务器配置后，不再重复出现 **用户 / 调试 / 界面** 配置项
- ✅ 配置状态仍可异步刷新显示
- ✅ 设置页渲染顺序更加稳定，避免后半段分区被重复插入

### 🧪 验证结果

- ✅ `npm run build`

## 2026-03-26 模型来源模式、可视化模型配置面板与模型 JSON 编辑器

### 📋 功能描述
本轮围绕 **“模型配置来源不清晰”**、**“手写 `.opencode/opencode.json` 门槛高”**、以及 **“高级用户仍需要可控的 JSON 编辑入口”** 三个问题，对 OpenCodian 的模型配置链路做了一次完整增强。

目标包括：
- 让用户明确选择模型列表来自 **本地配置 / 服务器配置 / 合并模式**
- 在设置页直接看到 **本地模型列表、服务器模型列表、当前生效列表**
- 提供 **可视化模型配置面板**，无需手改 JSON 即可添加提供商和模型
- 提供 **只编辑 provider/model 相关字段** 的 JSON 编辑器，满足高级用户需求
- 让本地受管 OpenCode 服务在不同来源模式下按预期加载配置

### ✅ 实现细节

#### 1. 新增模型来源模式
- 在设置中新增 **模型来源模式**：
  - **仅本地**
  - **仅服务器**
  - **合并模式**（默认）
- 默认行为遵循 OpenCode 合并思路：
  - 服务器模型作为基础
  - 本地 `.opencode/opencode.json` 中的同名 provider / model 字段覆盖服务器同名字段
- 来源模式会保存到插件设置中，并在设置页切换后自动刷新模型目录

#### 2. 设置页显示三组模型目录
- 模型设置区现在会展示三组卡片：
  - **本地配置**
  - **服务器配置**
  - **当前生效列表**
- 每张卡片按 provider 聚合展示模型列表，方便快速对比：
  - 哪些模型只在本地
  - 哪些模型只在服务器
  - 合并后最终会在选择器里出现哪些模型

#### 3. 新增模型配置解析与合并服务
- 新增独立的模型配置处理模块，负责：
  - 读取 `.opencode/opencode.json`
  - 提取 provider / model / enabled_providers / disabled_providers 等相关字段
  - 生成本地模型目录
  - 拉取服务器模型目录
  - 产出生效后的合并目录
- 同时补充了对 **JSONC 注释** 的兼容解析，避免用户配置里带注释时直接读失败

#### 4. 可视化模型配置面板
- 新增 **Visual Model Configuration** 弹窗
- 支持直接配置：
  - 默认模型
  - small model
  - 提供商 ID / 名称
  - SDK 包名
  - API Base URL
  - API Key
  - 模型列表
  - context / output limit
- 支持：
  - 添加提供商
  - 删除提供商
  - 添加模型
  - 删除模型
- 保存后自动写回当前 vault 的 `.opencode/opencode.json`

#### 5. 模型 JSON 编辑器
- 新增 **模型 JSON 编辑器** 弹窗
- 该编辑器只显示与模型有关的子集字段，不暴露完整 OpenCode 配置
- 支持：
  - JSON 格式化
  - 基本结构校验
  - provider 对象校验
  - enabled / disabled providers 数组校验
- 保存时仅替换模型相关字段，保留原文件中其他配置（如 permission）不被覆盖

#### 6. 本地受管 OpenCode 服务按来源模式加载配置
- 对 `ServerManager` 增加来源模式感知：
  - **server**：禁用项目配置加载
  - **merge**：保持 OpenCode 默认行为
  - **local**：禁用项目配置，再通过环境变量限制到本地 provider 范围
- 这样在本地受管服务模式下，来源模式不再只是 UI 展示，而是真正影响服务启动时的配置来源

#### 7. 聊天面板模型选择器同步升级
- 聊天区模型下拉不再只依赖服务器原始列表
- 现在会读取当前来源模式下的 **生效模型目录**
- 发送消息前增加校验：
  - 如果当前选中的 provider/model 并不在已连接的 OpenCode 服务可用列表里
  - 直接提示用户切换来源模式、刷新模型或重启本地服务
- 避免出现“设置里能选，但实际发送时报模型不存在”的迷惑体验

#### 8. 中英文文案与样式同步补齐
- 为模型来源模式、三组模型卡片、可视化配置、JSON 编辑器、模型不可用提示等新增中英文文案
- 为模型来源卡片、provider/model 表单、配置弹窗补充样式
- 保持与现有设置页视觉风格一致

### 📁 本轮涉及文件

| 文件 | 修改内容 |
|------|----------|
| `src/core/types/settings.ts` | 新增 `modelSourceMode` 设置及默认值 |
| `src/core/types/opencodeConfig.ts` | 新增 OpenCode 模型配置相关类型 |
| `src/core/types/permission.ts` | 复用统一的 `OpencodeConfig` 类型 |
| `src/core/types/index.ts` | 导出新增模型配置类型 |
| `src/core/config/modelConfig.ts` | 模型配置提取、合并、JSONC 注释解析 |
| `src/core/config/ModelConfigService.ts` | 本地/服务器/生效模型目录服务 |
| `src/core/config/OpencodeConfigManager.ts` | 配置读写兼容模型字段与 JSONC |
| `src/core/config/index.ts` | 导出新配置服务 |
| `src/core/opencode/types.ts` | 服务配置增加 `modelSourceMode` |
| `src/core/opencode/OpenCodeService.ts` | 来源模式变化时支持重启受管服务 |
| `src/core/opencode/ServerManager.ts` | 启动时按来源模式设置环境变量 |
| `src/features/settings/OpenCodianSettings.ts` | 模型来源设置、目录卡片、配置入口 |
| `src/features/settings/ModelConfigModal.ts` | 新增可视化模型配置面板 |
| `src/features/settings/ModelConfigJsonModal.ts` | 新增模型 JSON 编辑器 |
| `src/features/chat/OpenCodianView.ts` | 聊天页模型目录刷新与模型可用性校验 |
| `src/main.ts` | 初始化并注入模型配置服务，刷新聊天页目录 |
| `src/i18n/locales/zh.ts` | 新增模型来源/编辑器/错误提示文案 |
| `src/i18n/locales/en.ts` | 新增模型来源/编辑器/错误提示文案 |
| `styles.css` | 新增模型来源卡片与模型配置弹窗样式 |
| `tests/unit/core/config/OpencodeConfigManager.test.ts` | 补充模型配置保留与 JSONC 解析测试 |
| `tests/unit/core/types/settings.test.ts` | 补充 `modelSourceMode` 默认值测试 |

### 🐛 本轮重点修复的问题

1. **模型到底来自哪里不清楚**：用户无法区分本地配置、服务器配置和最终生效列表
2. **本地自定义提供商配置门槛高**：必须手动编辑 JSON，不利于普通用户
3. **高级用户只能编辑完整配置**：缺少只针对 provider/model 字段的安全编辑入口
4. **来源模式只是概念，没有真正影响服务加载**：现在本地受管服务会按模式切换配置来源
5. **聊天页可能选到不可用模型**：发送前新增可用性检查与明确提示

### 🎯 验证结果

- ✅ `npm run typecheck`
- ✅ `npm run test`
- ✅ `npm run lint`
- ✅ `npm run build`
- ✅ 已重新部署到测试库：`C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\`

### 当前状态

- ✅ 模型来源模式已可在设置中切换
- ✅ 设置页可同时查看本地、服务器和生效模型目录
- ✅ 已具备可视化模型配置面板
- ✅ 已具备模型 JSON 编辑器
- ✅ 本地受管 OpenCode 服务会按来源模式调整配置加载方式
- ✅ 聊天页已能拦截不可用模型并给出明确提示

---

## 2026-03-26 远程服务器帮助文案完善与聊天面板状态显示修正

### 📋 功能描述
本轮主要围绕 **“远程服务器模式对新手不够直观”** 和 **“聊天面板状态文案与用户选择不一致”** 两个问题做补充完善。

目标包括：
- 让“远程服务器 URL”帮助说明更贴近真实使用场景，明确说明它也可以填写本地地址
- 将远程模式默认值设置为本地地址，降低第一次使用门槛
- 明确告知用户这些设置是**自动保存**的，避免担心重启后丢失
- 修复聊天面板中“外部服务”文案不合理的问题，使其跟随当前本地/远程模式显示

### ✅ 实现细节

#### 1. 远程服务器 URL 默认值改为本地地址
- 将 `server.remote.baseUrl` 默认值改为：
  - `http://127.0.0.1:4096`
- 这样即使用户切换到“远程服务器”模式，也可以先直接复用本地 OpenCode 地址测试连接
- 降低了“远程 URL 一定只能填公网地址”的认知门槛

#### 2. 切换到远程模式时自动补本地 URL
- 在用户从本地模式切换到远程模式时：
  - 如果远程 URL 还是空值
  - 自动填入当前本地配置拼出的地址
- 行为示例：
  - 本地 host = `127.0.0.1`
  - 本地 port = `4096`
  - 切到远程模式后，自动带出 `http://127.0.0.1:4096`

#### 3. 远程 URL 帮助文案补充
- 在帮助弹窗中新增更明确的说明：
  - 这个字段虽然叫“远程服务器 URL”，**也可以填写本机地址**
  - 适用于：
    - 本地地址
    - 局域网 IP
    - 域名
    - HTTPS
    - 反向代理子路径
- 示例更新为：
  - `http://127.0.0.1:4096`
  - `http://192.168.1.20:4096`
  - `https://ai.example.com`
  - `https://ai.example.com/opencode`

#### 4. 明确说明“设置会自动保存”
- 在远程 URL 帮助弹窗中增加提示：
  - 用户填写后会**自动保存**
  - 重启 Obsidian 后不会丢失
- 同时确认设置项输入逻辑继续保持：
  - 每次修改时立即调用 `saveSettings()`

#### 5. 聊天面板状态文案按模式显示
- 修复聊天面板中原来只显示“外部服务”的问题
- 现在当服务可用时，状态会根据当前选择模式显示为：
  - **本地服务**
  - **远程服务**
- 不再把用户已经主动选择的模式错误显示成“外部服务”

#### 6. 中英文文案同步修正
- 更新中文 `zh.ts` 和英文 `en.ts`
- 保证设置页帮助弹窗、聊天状态文本、默认值说明在中英文下都一致

### 📁 本轮涉及文件

| 文件 | 修改内容 |
|------|----------|
| `src/core/types/settings.ts` | 将远程 URL 默认值改为本地地址 |
| `src/features/settings/OpenCodianSettings.ts` | 切换远程模式时自动补全本地 URL；保持修改即保存 |
| `src/features/chat/OpenCodianView.ts` | 聊天面板状态文案改为按本地/远程模式显示 |
| `src/i18n/locales/zh.ts` | 补充远程 URL 可填写本地地址、自动保存说明与聊天状态文案 |
| `src/i18n/locales/en.ts` | 补充远程 URL 可填写本地地址、自动保存说明与聊天状态文案 |

### 🐛 本轮重点修复的问题

1. **远程 URL 名称容易误导**：用户以为这里只能填写公网或别的机器地址
2. **第一次切换远程模式时没有可参考值**：不利于本地快速测试
3. **用户担心设置不持久**：不清楚输入后是否会自动保存
4. **聊天面板状态文案不合理**：用户选择了本地/远程模式，却只看到“外部服务”

### 🎯 验证结果

- ✅ `npm run build`
- ✅ 已重新部署到测试库：`C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\`

### 当前状态

- ✅ 远程服务器 URL 帮助说明已明确支持填写本地地址
- ✅ 远程模式默认值已改为本地地址，方便快速试用
- ✅ 设置项保持自动保存，重启后不会丢失
- ✅ 聊天面板服务状态已能根据本地 / 远程模式正确显示

---

**会话日期**: 2026-03-26
**开发时间**: ~0.5 小时
**主要贡献**: 远程 URL 帮助文案完善、默认值优化、自动保存说明补充、聊天状态文案修正
**当前状态**: 已部署测试库，可继续观察实际使用反馈

---

## 2026-03-26 服务器可用性引导、调试诊断导出与跨平台日志路径完善

### 📋 功能描述
本轮主要围绕 **“服务未启动时用户不知道发生了什么”** 和 **“排障信息不够集中、导出不方便”** 两类问题做了一次完整收敛，同时继续打磨设置页交互体验。

目标包括：
- 在聊天窗口与设置面板中更明确地反映 OpenCode 服务真实状态
- 当服务离线时，给用户可操作的启动/重试/打开设置入口，而不是只看到抽象报错块
- 将调试日志、最近诊断信息、日志文件导出整合到独立调试分组
- 让日志默认路径支持 Windows 与 macOS/Linux 分别保存，避免跨设备同步后互相污染
- 修复选择日志路径后设置页闪烁并跳回顶部的问题

### ✅ 实现细节

#### 1. 服务器设置升级为本地 / 远程双模式
- 重构 `server` 设置结构，区分：
  - **local**：插件管理本机 OpenCode 进程
  - **remote**：连接远程 OpenCode 服务
- 新增远程地址与鉴权配置，支持：
  - 无认证
  - Basic Auth
  - Bearer Token
- 本地模式下保留 host / port / auto-start
- 远程模式下改为连接测试，不再显示无意义的“启动本地服务”操作

#### 2. 设置页新增服务器帮助弹窗
- 新增 `ServerSettingHelpModal`
- 为服务器模式、自动启动、地址、端口、远程 URL、认证方式、用户名、密码、Token、状态等字段增加帮助入口
- 帮助弹窗统一说明：
  - 这个字段是什么意思
  - 应该怎么填写
  - 示例值与注意事项

#### 3. 聊天窗口增加服务离线引导卡片
- 当 OpenCode 服务未就绪时，在会话区域直接显示状态卡片
- 卡片提供以下操作：
  - **启动服务**
  - **重试连接**
  - **打开设置**
  - **暂不启动**
- 会话顶部状态也补充了 `checking / running / starting / offline / external` 五种可视状态
- 用户在卡片中执行操作后，设置页中的服务器状态会同步刷新，不再出现“会话与设置显示不一致”

#### 4. 服务器状态检测与日志输出收敛
- 插件加载时会主动记录一次服务器状态快照
- 在设置里打开调试日志后，会额外输出当前服务器健康状态、内部状态、是否存在受管进程等信息
- 清理了部分误导性常驻日志：
  - 像“server already running on port 4096”这类信息改为 `debug` 级别
  - 未开启调试日志时不再默认刷屏
- 服务管理、健康检查、状态刷新与 UI 提示之间的联动更一致

#### 5. 调试配置拆分为独立分组
- 设置页将调试相关能力单独收纳到 **Debug / 调试** 分组
- 顶部快捷跳转新增调试入口
- 调试分组中明确说明：
  - 调试日志输出在 Obsidian 开发者工具 **Console**
  - Windows / Linux 如何打开控制台
  - macOS 如何打开控制台
  - 打开后应切换到 `Console` 标签查看与复制日志

#### 6. 增加“一键复制最近诊断信息”
- logger 新增最近日志缓冲区
- 支持将最近捕获的关键信息与当前环境拼装成诊断文本
- 点击设置页按钮后，可直接复制最近诊断结果到剪贴板，方便用户发给开发者排查

#### 7. 增加“一键生成调试日志文件”
- 新增诊断报告构建与写盘导出能力
- 日志文件中包含：
  - 插件版本
  - 当前平台
  - vault 路径
  - 服务器模式、地址、认证方式、健康状态
  - 调试开关状态
  - 最近日志缓冲内容
- 用户可直接生成 `.log` 文件发送给开发者

#### 8. 日志默认路径改为按平台分别保存
- 原先只有单一 `debugLogPath`
- 现改为平台独立的 `debugLogPaths`：
  - `windows`
  - `unix`
- Windows 与 macOS/Linux 使用各自默认路径，不会因设置同步互相覆盖
- 兼容旧设置：如果用户原本只有旧版单路径，会自动迁移到当前平台对应槽位

#### 9. 修复路径选择后的设置页闪烁与跳顶
- 去掉选择路径、生成日志后对整个设置页的 `display()` 重绘
- 改为只更新当前输入框值并保存设置
- 修复选择路径后界面闪一下、滚动位置瞬间回到顶部的体验问题

#### 10. 路径选择器补齐跨平台兜底
- 文件夹选择器默认路径会优先使用：
  1. 当前平台已保存的默认日志路径
  2. `allowedExportPaths` 中存在的本地目录
  3. 桌面目录
  4. 用户主目录
- 同时支持展开 `~`，兼容 Windows 与 macOS/Linux 常见写法

### 📁 本轮涉及文件

| 文件 | 修改内容 |
|------|----------|
| `src/core/types/settings.ts` | 重构 server 配置结构；新增平台化 debug 日志路径类型与默认值 |
| `src/core/types/index.ts` | 导出新的 server / debug path helpers |
| `src/core/opencode/types.ts` | 扩展 OpenCode server 配置类型，支持 mode / auth |
| `src/core/opencode/ServerManager.ts` | 完善本地/远程模式、健康检查、认证头与日志级别 |
| `src/core/opencode/OpenCodeService.ts` | 根据新 server 配置更新请求逻辑与设置变更处理 |
| `src/features/chat/OpenCodianView.ts` | 新增服务离线提示卡片与更细的状态显示 |
| `src/features/settings/OpenCodianSettings.ts` | 服务器设置重构、帮助按钮、调试分组、诊断导出、平台路径与无跳动更新 |
| `src/features/settings/ServerSettingHelpModal.ts` | 新增服务器字段帮助弹窗 |
| `src/features/settings/OpencodeConfigModal.ts` | 适配设置结构调整 |
| `src/main.ts` | 设置迁移、服务器状态快照、诊断报告生成、日志文件写出 |
| `src/i18n/locales/zh.ts` | 新增服务器帮助、调试、诊断、状态文案 |
| `src/i18n/locales/en.ts` | 新增服务器帮助、调试、诊断、状态文案 |
| `src/shared/logger.ts` | 增加最近日志缓冲与诊断辅助能力 |
| `src/shared/index.ts` | 导出 logger 新接口 |
| `styles.css` | 补充调试区、状态卡片与帮助弹窗相关样式 |
| `tests/unit/core/opencode/OpenCodeService.test.ts` | 更新服务配置与状态相关测试 |
| `tests/unit/core/opencode/ServerManager.test.ts` | 更新本地/远程与认证逻辑测试 |
| `tests/unit/core/types/settings.test.ts` | 更新 debugLogPaths 与平台 helper 测试 |
| `tests/__mocks__/obsidian.ts` | 补充测试环境 mock |

### 🐛 本轮重点修复的问题

1. **服务没启动时提示过于抽象**：用户只能看到错误块，不知道该启动服务还是检查设置
2. **聊天窗口与设置状态不同步**：用户在会话里感知到离线，但设置页没有实时反映
3. **调试日志开关开启后信息仍不完整**：缺少服务器健康状态与当前运行快照
4. **未开启调试日志也会出现部分服务日志**：影响普通用户使用体验
5. **日志导出能力不足**：用户难以快速提供可复现的诊断信息
6. **日志默认路径不适合跨平台同步**：同一份设置在 Windows 与 macOS/Linux 下会互相覆盖
7. **选择路径后设置页闪烁并回顶**：影响连续配置体验

### 🎯 验证结果

- ✅ `npm run typecheck`
- ✅ `npm test -- --runTestsByPath tests/unit/core/types/settings.test.ts`
- ✅ `npm run build`
- ✅ 已构建并同步到测试库：`C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian\`

### 当前状态

- ✅ 服务器未启动时，聊天窗口已能给出明确可操作引导
- ✅ 设置页已支持本地 / 远程 OpenCode 连接模式
- ✅ 调试能力已形成独立分组，支持复制诊断与导出日志文件
- ✅ 默认日志路径已支持 Windows 与 macOS/Linux 分别保存
- ✅ 路径选择后的闪烁与跳顶体验问题已修复
- ✅ 服务器状态日志、离线引导与设置页刷新链路已基本打通

---

**会话日期**: 2026-03-26
**开发时间**: ~4-5 小时
**主要贡献**: 服务器离线引导、调试诊断导出、服务器设置重构、跨平台日志路径与设置页体验修复
**当前状态**: 已部署测试库，等待进一步联调与真实使用反馈

---

## 2026-03-25 聊天气泡复制按钮与设置页快捷导航体验优化

### 📋 功能描述
本轮主要围绕两块 UI 体验做连续打磨：
- 聊天区复制按钮的玻璃质感、形状与相对气泡的位置关系
- 设置页顶部快捷跳转条、毛玻璃提示、分类说明与弹层视觉统一

目标是让聊天区复制按钮更贴合气泡角、更像系统悬浮控件，同时为设置页新增可快速定位分类的顶部导航，降低设置项增多后的查找成本。

### ✅ 实现细节

#### 1. 用户/助手复制按钮样式多轮收敛
- 将复制按钮统一为更清晰的玻璃风格，补齐半透明底、边框高光、模糊与阴影
- 从椭圆胶囊样式回退到更协调的圆角方形按钮
- 多次微调用户消息复制按钮与气泡左下角的相对位置，使其视觉上对角呼应但不遮挡气泡
- 为用户消息容器补足底部留白，避免按钮压住消息气泡

#### 2. 聊天区相关弹出层改为透明毛玻璃面板
- 将模型选择弹出框、权限控制弹出框、历史会话弹出框统一为 frosted glass 面板
- 将历史会话中的删除确认弹窗与遮罩层也统一为透明玻璃风格
- 后续又对模型选择面板单独降噪，减少内部多层渐变，避免看起来过于花哨

#### 3. 设置页新增顶部快捷跳转条
- 在设置页最顶部新增快捷跳转区，可快速滚动到语言、服务器、模型、安全、界面、用户等分类
- 为每个分类标题补充锚点与平滑滚动逻辑
- 将快捷跳转条调整到设置内容最上边，并修正容器顶部留白，确保真正贴顶显示

#### 4. 快捷跳转条视觉与交互打磨
- 顶部导航改为正文宽度内的圆角长方形玻璃条，而非整行全宽
- 去掉背景渐变，改为更纯净、更透明的模糊玻璃底
- 为快捷按钮新增玻璃提示框，并将提示内容从"跳转到某分类"改成"该分类主要设置什么"
- 解决提示框与系统黑色 tooltip 重叠的问题，移除额外 tooltip 来源
- 将提示框改到按钮下方显示，并处理左右边缘溢出与背景文字可读性问题

### 📁 本轮涉及文件

| 文件 | 修改内容 |
|------|----------|
| `styles.css` | 复制按钮样式与位置微调、模型/权限/历史/删除弹层毛玻璃化、设置页快捷导航与提示框样式 |
| `src/features/settings/OpenCodianSettings.ts` | 新增设置页顶部快捷跳转、按钮提示文案与滚动逻辑 |
| `src/i18n/locales/zh.ts` | 新增快捷跳转标题与分类说明文案 |
| `src/i18n/locales/en.ts` | 新增快捷跳转标题与分类说明文案 |

### 🎯 验证结果

- ✅ 多轮执行 `npm run build`
- ✅ 多轮部署到测试库：`C:\Users\lt\Desktop\Write\testvault\.obsidian\plugins\opencodian`
- ✅ 聊天区复制按钮位置与质感已在测试库中反复微调验证
- ✅ 设置页快捷跳转条、玻璃提示与弹层样式已在测试库中联调

### 当前状态

- ✅ 复制按钮已从早期"几乎无感"的样式收敛到更协调的玻璃悬浮按钮
- ✅ 主要聊天弹出层已统一为透明毛玻璃面板
- ✅ 设置页已具备顶部快捷跳转能力
- ✅ 快捷按钮提示框已改为功能说明型文案，并处理了遮挡、越界与可读性问题

---

**会话日期**: 2026-03-25
**开发时间**: ~2 小时
**主要贡献**: 复制按钮玻璃样式迭代、聊天弹层毛玻璃统一、设置页快捷跳转与提示交互
**当前状态**: 已部署测试库，UI 细节持续打磨中

---

---

## 2026-03-25 TypeScript 报错清零与配置兼容修复

### 📋 功能描述
在完成轻量 logger 与 ESLint 收敛后，继续清理仓库内剩余的 TypeScript 报错；重点修复聊天流式渲染、权限请求事件、OpenCode 配置权限类型、vault 路径访问兼容，以及 provider icon 映射中的重复 key 问题，最终将仓库恢复到 `tsc / lint / build` 全绿状态。

### ✅ 实现细节

#### 1. 修复 `OpenCodianView` 的 7 个 TypeScript 问题
- 修正 `permission_request` 流式事件与权限弹窗参数类型不匹配
- 使用包装状态对象替代直接闭包引用的 `pendingEl`，避免 TS 将其收窄为 `never`
- 补齐流式工具结果的可选 `isError`
- 补齐工具状态 `blocked` 的持久化类型

#### 2. 补齐 OpenCode 权限配置类型
- 在 `PermissionConfig` 中补充 `write` 字段
- 清理 `src/core/types/index.ts` 中重复导出的 `PermissionMode`
- 让计划模式 / 普通模式生成的 `.opencode` 权限配置与类型定义保持一致

#### 3. 修复 vault 路径访问兼容性
- 新增 `src/shared/vault.ts`
- 统一通过 `getVaultBasePath()` 读取 Obsidian vault 根路径
- 替换设置页和主插件中对旧 `adapter.getBasePath()` 的直接调用
- 在路径不可用时增加安全降级，避免初始化或同步配置时报错

#### 4. 清理其他编译问题
- 修正 `OpenCodeService` 中 `permission.asked` 事件字段类型
- 修正 `main.ts` 中旧版 `chatScrollMode: 'sticky'` 的兼容判断
- 修正 `checkHealth()` 返回 Promise 后的判断逻辑
- 移除 `ProviderIconService` 中重复的对象 key，消除 TS1117

### 📁 本轮涉及文件

| 文件 | 修改内容 |
|------|----------|
| `src/features/chat/OpenCodianView.ts` | 修复流式 UI 的 7 个 TS 报错 |
| `src/core/types/chat.ts` | 补充 `blocked` 状态与 `tool_result.isError` |
| `src/core/types/permission.ts` | 补充 `write` 权限类型 |
| `src/core/types/index.ts` | 移除重复导出的 `PermissionMode` |
| `src/core/opencode/OpenCodeService.ts` | 补齐权限事件字段类型 |
| `src/shared/vault.ts` | 新增 vault 路径访问 helper |
| `src/shared/index.ts` | 导出 vault helper |
| `src/main.ts` | 替换旧路径访问并修复异步判断 |
| `src/features/settings/OpenCodianSettings.ts` | 设置页改用兼容路径 helper |
| `src/utils/icons/ProviderIconService.ts` | 清理重复 key |

### 🎯 验证结果

- ✅ `npx tsc --noEmit --pretty false`
- ✅ `npm run lint`
- ✅ `npm run build`

### 当前状态

- ✅ 仓库 TypeScript 报错清零
- ✅ ESLint 继续保持 `0 errors / 0 warnings`
- ✅ 生产构建通过
- ✅ logger、debug 开关、类型系统与配置同步机制现已一致

---

**会话日期**: 2026-03-25
**开发时间**: ~1 小时
**主要贡献**: TypeScript 报错清零、vault 路径兼容、权限配置类型补齐
**当前状态**: 已通过 tsc / lint / build，待提交

---

---

## 2026-03-25 轻量 Logger 与 ESLint 清零收敛

### 📋 功能描述
为项目引入统一的轻量 logger，并把原本分散在各模块中的 `console.*` 调用收敛到统一接口；同时通过忽略规则、自动修复和小规模代码清理，将仓库本体的 ESLint 结果收敛到 `0 errors / 0 warnings`。

### ✅ 实现细节

#### 1. 统一轻量 logger
- 新增 `src/shared/logger.ts`
- 提供统一接口：
  - `logger.debug(...)`
  - `logger.warn(...)`
  - `logger.error(...)`
- 日志会自动带上模块作用域前缀，避免不同模块日志混杂

#### 2. Debug 日志开关
- `debug` 日志默认关闭
- 新增设置项 **调试日志 / Debug logging**
- 支持在设置中实时切换，保存后立即影响当前会话中的日志输出
- 运行时状态会同步到：
  - 全局标记 `__OPENCODIAN_DEBUG__`
  - `localStorage['opencodian:debug']`

#### 3. 替换散落的 console 调用
- 将 `src/main.ts`、`OpenCodeService`、`ServerManager`、`OpenCodianView` 等核心模块中的 `console.log / warn / error` 统一替换为 logger
- 测试 mock 中的 `Notice` 输出也移除了直接 `console.log`

#### 4. ESLint 收敛
- 新增 `.eslintignore`，忽略：
  - `reference-projects/**`
  - `dist/**`
  - `coverage/**`
  - `node_modules/**`
- 执行 `lint:fix` 自动清理 import/export 排序
- 手动修复：
  - 未使用变量
  - `require()` 风格导入
  - `@ts-ignore` / 类型访问问题

### 📁 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/shared/logger.ts` | 新增轻量 logger 与 debug 开关 |
| `src/shared/index.ts` | 导出 logger 相关接口 |
| `src/core/types/settings.ts` | 新增 `enableDebugLogging` 设置项 |
| `src/features/settings/OpenCodianSettings.ts` | 增加调试日志开关 UI |
| `src/i18n/locales/en.ts` | 新增 debug logging 英文文案 |
| `src/i18n/locales/zh.ts` | 新增 debug logging 中文文案 |
| `src/main.ts` | 加载/保存设置时同步 logger 开关 |
| `.eslintignore` | 忽略参考项目与构建产物，减少 lint 噪音 |

### 🐛 修复的问题

1. **调试日志分散**：各模块直接使用 `console.*`，难以统一管理
2. **无法按需开启调试日志**：排查问题时缺少运行时开关
3. **ESLint 噪音过大**：既有错误与警告较多，且容易被参考项目目录干扰

### 🎯 当前状态

**logger 与 lint 当前为：**
- ✅ 已接入统一轻量 logger
- ✅ 设置页支持切换调试日志
- ✅ 保存设置后 debug 开关立即生效
- ✅ 项目本体 ESLint 结果收敛到 `0 errors / 0 warnings`
- ✅ 构建通过，功能可继续迭代

---

**会话日期**: 2026-03-25
**开发时间**: ~1.5 小时
**主要贡献**: 统一轻量 logger、调试日志设置开关、ESLint 全量清零
**当前状态**: 功能完成，已通过 lint 与 build

---

---

## 2026-03-25 会话滚动模式与工具状态持久化修复

### 📋 功能描述
围绕聊天会话界面完成了一轮交互打磨，并修复历史会话中工具调用失败状态被错误显示为成功的问题。

### ✅ 实现细节

#### 1. 三档会话滚动模式
- 新增聊天滚动模式设置，支持三种可切换效果：
  - **自然滚动**：用户消息与助手消息正常随滚动移动
  - **用户消息吸顶**：每轮对话的用户消息作为 section header 吸顶
  - **吸顶 + 柔和遮盖**：在吸顶基础上增加边界遮盖与柔和过渡
- 现有旧配置中的 `sticky` 自动迁移为新的 `sticky-mask`

#### 2. 会话 DOM 结构重构
- 将原来的平铺消息结构改为按 turn 分组
- 每个 turn 拆分为：
  - `opencodian-turn-header`：承载用户消息
  - `opencodian-turn-body`：承载对应的助手内容
- 这样可以稳定实现"用户消息吸顶、下一条用户消息将上一条顶走"的滚动行为

#### 3. 吸顶模式视觉优化
- 为吸顶模式增加可选遮盖层，避免助手消息穿透到上一条用户消息区域
- 吸顶遮盖层跟随实际面板背景色，减少主题不一致带来的色块感
- 助手消息悬浮底纹改为圆角，避免 hover 时出现生硬直角

#### 4. 工具调用失败状态持久化修复
- 新增 `toolStatus` 持久化字段，保存工具调用的真实状态
- 流式渲染结束后，工具块会把 `completed / error` 状态一并写入消息内容块
- 从 OpenCode 历史消息恢复为本地消息时，也会推导并保留工具状态
- 历史渲染增加兼容逻辑：旧数据若没有 `toolStatus`，但结果文本以 `Error:` 开头，则仍显示为失败

### 📁 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/features/chat/OpenCodianView.ts` | 聊天视图改为 turn 分组结构；增加滚动模式类切换；渲染历史工具调用时恢复真实状态 |
| `src/features/settings/OpenCodianSettings.ts` | 新增三档会话滚动模式设置项 |
| `src/core/types/settings.ts` | 扩展 `ChatScrollMode` 类型与默认值 |
| `src/main.ts` | 保存设置时刷新打开中的聊天视图；兼容旧 `sticky` 配置迁移 |
| `src/core/types/chat.ts` | 为持久化消息块新增 `toolStatus` 字段 |
| `src/core/opencode/OpenCodeService.ts` | 从历史工具结果构建本地内容块时补齐工具状态 |
| `src/i18n/locales/en.ts` | 添加滚动模式英文文案 |
| `src/i18n/locales/zh.ts` | 添加滚动模式中文文案 |

### 🐛 修复的问题

1. **历史失败工具调用显示错误**：重载 Obsidian 后，失败工具调用会错误显示为绿色勾
2. **吸顶效果不可配置**：用户无法在自然滚动与吸顶滚动之间自由切换
3. **旧配置兼容性**：旧版 `sticky` 配置需要迁移到新的三档滚动模式体系

### 🎯 当前状态

**聊天滚动与状态恢复功能当前为：**
- ✅ 三档会话滚动模式可在设置中切换
- ✅ 打开的聊天视图会在保存设置后立即刷新滚动模式
- ✅ 失败工具调用状态会正确写入历史会话
- ✅ 旧历史消息在可推断失败状态时能正确显示红色 `×`
- ✅ 已构建并部署到测试库验证

---

**会话日期**: 2026-03-25
**开发时间**: ~3 小时
**主要贡献**: 会话滚动模式系统、吸顶交互优化、工具调用失败状态持久化修复
**当前状态**: 功能完成，已部署测试

---

---

## 2026-03-24 消息复制按钮功能

### 📋 功能描述
为聊天消息添加复制按钮，方便用户快速复制消息内容。

### ✅ 实现细节

#### 1. 用户消息复制按钮
- **位置**：气泡外左下角，与气泡底部对齐
- **触发方式**：鼠标悬浮在消息区域（包括气泡周围 28px 热区）
- **交互**：
  - 默认隐藏，悬浮显示
  - 点击后显示 "copied!" 反馈
  - 1.5 秒后恢复图标

#### 2. 助手消息复制按钮
- **位置**：时间戳旁边（同一行）
- **触发方式**：鼠标悬浮在整个助手消息区域
- **功能**：收集所有 text blocks 内容，点击后复制完整内容

#### 3. DOM 结构调整
```typescript
// 助手消息时间戳行结构
.opencodian-message-time-row
├── .opencodian-message-time-text  // 时间文本
└── .opencodian-copy-btn-inline     // 复制按钮
```

#### 4. 样式规格
| 属性 | 值 |
|------|-----|
| 图标大小 | 18x18px |
| 默认透明度 | 0（隐藏） |
| 悬浮透明度 | 1（显示） |
| 过渡动画 | 0.15s ease |
| 反馈文字颜色 | var(--text-accent) |

### 📁 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/features/chat/OpenCodianView.ts` | 新增 `addTextCopyButton` 方法、新增 `addTimestampWithCopyButton` 方法、修改消息渲染逻辑 |
| `styles.css` | 新增 `.opencodian-copy-btn`、`.opencodian-copy-btn--user`、`.opencodian-copy-btn-inline`、`.opencodian-message-time-row` 等样式 |

### 🐛 修复的问题

1. **变量名错误**：`OpenCodianView.COPY_ICON` → `COPY_ICON`
2. **未定义变量**：`content` → `contentEl` in `createAssistantMessageElement`
3. **时间戳位置错误**：流式消息时间戳在内容之前 → 改为流结束后添加到末尾
4. **助手消息定位问题**：添加 `position: relative` 确保按钮正确相对定位
5. **用户时间戳丢失**：恢复用户消息的时间戳显示

### 🎯 当前状态

**复制按钮功能完整：**
- ✅ 用户消息：气泡外左下角复制按钮
- ✅ 助手消息：时间戳旁内联复制按钮
- ✅ 悬浮热区：消息周围 28px 范围可触发
- ✅ 点击反馈：显示 "copied!" 1.5 秒
- ✅ 大小一致：统一 18x18px 图标

---

**会话日期**: 2026-03-24
**开发时间**: ~1 小时
**主要贡献**: 消息复制按钮完整功能
**当前状态**: 功能完整，已部署测试

---

---

## 2026-03-24 权限系统完善与 UI 优化

### 📋 背景
OpenCode 的权限系统通过 `.opencode/opencode.json` 配置文件控制。本次开发将权限管理完全集成到插件中，实现从配置管理到权限请求处理的完整闭环。

---

### ✅ 1. OpenCode 配置管理器

**实现内容：**
- 创建 `OpencodeConfigManager` 类管理项目级配置
- 支持自动创建、读取、更新配置文件
- 三种权限模式：YOLO/Normal/Plan

```typescript
export class OpencodeConfigManager {
  async setYoloMode(): Promise<void> {
    await this.updatePermission('allow');
  }

  async setNormalMode(): Promise<void> {
    await this.updatePermission({ '*': 'ask' });
  }

  async setPlanMode(): Promise<void> {
    await this.updatePermission({
      '*': 'ask',
      edit: 'deny',
      write: 'deny',
      bash: 'deny',
    });
  }
}
```

**文件位置：**
- `src/core/config/OpencodeConfigManager.ts`

---

### ✅ 2. 跨平台工作目录支持

**问题：**
OpenCode 服务器需要在 vault 目录启动才能读取项目配置。

**解决方案：**
```typescript
// Windows 支持
if (process.platform === 'win32') {
  candidates.push('opencode.cmd', `${process.env.APPDATA}\\npm\\opencode.cmd`);
}

// macOS 支持
if (process.platform === 'darwin') {
  candidates.push('/opt/homebrew/bin/opencode', '/usr/local/bin/opencode');
}

// 启动时设置工作目录
this.process = spawn(opencodePath, ['serve', ...], {
  cwd: this.workingDirectory,  // Vault 路径
});
```

**调试输出：**
```
[ServerManager] Working directory set to: C:\Users\lt\Desktop\Write\testvault
[ServerManager] Starting OpenCode in directory: C:\Users\lt\Desktop\Write\testvault
```

---

### ✅ 3. 内联权限请求对话框

**设计改进：**
- 从全局弹窗改为消息流内嵌卡片
- 不阻塞用户操作其他界面
- 选择后自动消失，不占用空间

**实现代码：**
```typescript
private async showPermissionDialog(request: PermissionRequest): Promise<void> {
  // 在消息流中创建权限卡片
  const permissionCard = permissionContainer.createDiv({
    cls: 'opencodian-permission-inline'
  });

  // 显示工具信息和按钮
  // ...

  // 用户选择后移除卡片
  const result = await new Promise<...>((resolve) => { ... });
  permissionCard.remove();  // 完全消失，不占用空间
}
```

**UI 样式：**
```css
.opencodian-permission-inline {
  background: var(--background-primary);
  border: 2px solid var(--interactive-accent);
  border-radius: 8px;
  padding: 16px;
  margin: 12px 0;
}
```

**文件位置：**
- `src/features/chat/OpenCodianView.ts`
- `styles.css`

---

### ✅ 4. 输入栏权限模式切换

**实现内容：**
在输入框下方工具栏添加权限模式下拉框：

```
┌─────────────────────────────────────────────────────────┐
│  [🤖 模型选择器]              [🛡️ YOLO ▼]              │
└─────────────────────────────────────────────────────────┘
```

**代码实现：**
```typescript
private initializePermissionSelector(containerEl: HTMLElement): void {
  const trigger = containerEl.createDiv({ cls: 'opencodian-permission-trigger' });

  // 根据当前模式显示不同颜色
  trigger.addClass(`mode-${mode}`);  // yolo=green, ask=blue, plan=red

  // 点击切换模式并自动重启服务
  trigger.addEventListener('click', async () => {
    await this.switchPermissionMode(newMode);
  });
}
```

**自动重启逻辑：**
```typescript
private async switchPermissionMode(mode: 'yolo' | 'normal' | 'plan'): Promise<void> {
  // 1. 更新配置
  this.plugin.settings.permissionMode = mode;
  await this.plugin.saveSettings();

  // 2. 重启 OpenCode 服务
  await this.plugin.openCodeService.stop();
  await new Promise(resolve => setTimeout(resolve, 1000));
  await this.plugin.openCodeService.start();
}
```

**显示格式：**
- YOLO 模式：`🛡️ YOLO`（绿色）
- 询问模式：`🛡️ ASK`（蓝色）
- 计划模式：`🛡️ PLAN`（红色）

---

### ✅ 5. 中文翻译完善

**新增翻译键：**
```typescript
// 权限对话框
'permissionDialog.title': '权限请求',
'permissionDialog.description': 'AI 想要使用工具：',
'permissionDialog.toolDescription': '此工具的作用：',
'permissionDialog.allowOnce': '允许一次',
'permissionDialog.allowAlways': '始终允许',
'permissionDialog.reject': '拒绝',

// 工具描述
'permissionDialog.tools.websearch': '搜索网络获取最新信息',
'permissionDialog.tools.bash': '执行终端命令（谨慎使用）',
'permissionDialog.tools.read': '读取文件内容',
'permissionDialog.tools.edit': '编辑/修改文件内容',

// 设置按钮
'settings.security.configFile.editBtn': '编辑配置',
'settings.security.configFile.applyBtn': '应用并重启',
```

**文件位置：**
- `src/i18n/locales/zh.ts`
- `src/i18n/locales/en.ts`

---

### ✅ 6. 计划模式检测修复

**问题：**
计划模式（有 `deny` 权限）被错误显示为询问模式。

**修复代码：**
```typescript
if (typeof permission === 'object' && permission?.['*'] === 'ask') {
  // 检查是否有 deny - 那是计划模式
  const hasDeny = Object.values(permission).some(v => v === 'deny');
  if (hasDeny) {
    statusText = t('settings.security.configStatus.plan');
    statusClass = 'opencodian-status-plan';
  } else {
    statusText = t('settings.security.configStatus.normal');
    statusClass = 'opencodian-status-normal';
  }
}
```

**状态显示：**
- ✅ YOLO 模式（自动批准全部）- 绿色
- ✅ 询问模式（提示批准）- 蓝色
- ✅ 计划模式（禁止修改）- 红色
- ✅ 自定义模式 - 灰色

---

### ✅ 7. 权限对话框超时修复

**问题：**
权限对话框显示时，流超时仍在计时，导致用户未响应就中断。

**修复：**
```typescript
// 显示对话框前暂停超时
if (timeoutId) {
  window.clearTimeout(timeoutId);
  timeoutId = null;
}

await this.showPermissionDialog(chunk);

// 用户响应后重新开始超时
if (this.isStreaming) {
  timeoutId = window.setTimeout(() => { ... }, STREAM_TIMEOUT_MS);
}
```

---

### 📁 修改文件列表

| 文件 | 修改内容 |
|------|----------|
| `src/core/config/OpencodeConfigManager.ts` | 新增配置管理器 |
| `src/core/opencode/ServerManager.ts` | 跨平台工作目录支持 |
| `src/core/opencode/OpenCodeService.ts` | 权限事件处理 |
| `src/features/chat/OpenCodianView.ts` | 内联权限对话框、输入栏权限切换 |
| `src/features/settings/OpenCodianSettings.ts` | 设置页面权限检测修复 |
| `src/i18n/locales/zh.ts` | 中文翻译 |
| `src/i18n/locales/en.ts` | 英文翻译 |
| `styles.css` | 权限卡片样式、权限选择器样式 |

---

### 🎯 当前状态

**权限系统功能完整：**
- ✅ 三种权限模式（YOLO/ASK/PLAN）
- ✅ 配置文件自动管理
- ✅ 内联权限请求对话框
- ✅ 输入栏快速切换权限模式
- ✅ 切换后自动重启服务
- ✅ 中英文双语支持

**待优化：**
- 设置页面 `display()` 改为 async 后需验证 Obsidian 兼容性

---

**会话日期**: 2026-03-24
**开发时间**: ~4 小时
**主要贡献**: 权限系统完整集成、跨平台支持、内联权限对话框、中文汉化
**当前状态**: 权限系统功能完整，可正常使用

---

---

## 2026-03-24 模型选择器 UI 重构与图标集成

本次会话完成了模型选择器的全面升级，从原生 `<select>` 元素迁移到自定义下拉组件，并集成了 200+ 个 AI 供应商品牌图标。

---

### ✅ 1. 模型选择器 UI 重构

**问题背景：**
- 原生 `<select>` 下拉框样式受限，无法分组显示
- 无法显示供应商图标，视觉层次不清晰
- 参考 opencode 的 UI 设计，需要更现代化的选择器

**实现内容：**

#### 自定义下拉组件架构
```
┌─────────────────────────────────────┐
│ 🤖 anthropic/claude-3-5-sonnet   ▼ │  ← Trigger 按钮（显示当前选择）
└─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────┐
│ 🔍 Search models...                 │  ← 搜索输入框
├─────────────────────────────────────┤
│ 🅰️  ANTHROPIC      ← sticky header   │
│    claude-3-opus-20240229           │
│  ✓ claude-3-5-sonnet-20241022       │  ← 当前选中
│    claude-3-5-haiku-20241022        │
├─────────────────────────────────────┤
│ 🇨🇳 DEEPSEEK       ← sticky header   │
│    deepseek-chat                    │
│    deepseek-reasoner                │
└─────────────────────────────────────┘
```

**关键实现：**

1. **Trigger 按钮设计**
   ```typescript
   // Ghost 样式按钮，显示当前选择的模型
   createEl('button', { cls: 'opencodian-model-trigger' }, (btn) => {
     btn.createSpan({ cls: 'model-trigger-icon', text: '🤖' });
     btn.createSpan({ cls: 'model-trigger-text', text: modelName });
     btn.createSpan({ cls: 'model-trigger-chevron', text: '▼' });
   });
   ```

2. **下拉面板结构**
   ```typescript
   createDiv({ cls: 'opencodian-model-dropdown' }, (dropdown) => {
     // 搜索输入
     dropdown.createDiv({ cls: 'opencodian-model-search' }, ...);
     // 可滚动列表
     dropdown.createDiv({ cls: 'opencodian-model-dropdown-scroll' }, ...);
   });
   ```

3. **定位策略**
   ```css
   .opencodian-model-dropdown {
     position: absolute;
     bottom: calc(100% + 8px);  /* 位于输入框上方 */
     left: 0;
     z-index: 1000;
   }
   ```

**涉及文件：**
- `src/features/chat/OpenCodianView.ts`
- `styles.css`

---

### ✅ 2. 粘性分组头部 (Sticky Headers)

**设计目标：**
- 提供商名称在滚动时固定在顶部
- 清晰区分不同提供商的模型
- 提供视觉反馈表示当前所在分组

**技术实现：**

1. **CSS 粘性定位**
   ```css
   .opencodian-model-provider-header {
     position: sticky;
     top: 0;
     z-index: 10;
     background: var(--background-secondary);
   }
   ```

2. **IntersectionObserver 检测粘性状态**
   ```typescript
   private handleProviderHeaderScroll(): void {
     const observer = new IntersectionObserver((entries) => {
       entries.forEach(entry => {
         const header = entry.target as HTMLElement;
         const rect = header.getBoundingClientRect();
         const containerRect = container.getBoundingClientRect();
         // 检测是否被粘住
         header.dataset.stuck = (rect.top <= containerRect.top + 1) ? 'true' : 'false';
       });
     }, { root: container, threshold: [0, 1] });
   }
   ```

3. **粘性状态视觉反馈**
   ```css
   .opencodian-model-provider-header[data-stuck="true"] {
     box-shadow: 0 8px 8px -4px rgba(0, 0, 0, 0.1);
   }
   ```

---

### ✅ 3. Lobehub 图标集成

**图标来源：**
- 使用 Lobehub Icons Static SVG 包
- 1425+ 个 AI/LLM 品牌图标
- CDN 加载：`https://unpkg.com/@lobehub/icons-static-svg@latest/icons/{name}.svg`

**ProviderIconService 实现：**

1. **图标映射表 (200+ 供应商)**
   ```typescript
   private static readonly PROVIDER_ICON_MAP: Record<string, string> = {
     // 国际主流
     'openai': 'openai',
     'anthropic': 'anthropic',
     'claude': 'claude',
     'google': 'google',
     'gemini': 'gemini',
     // 中国厂商
     'deepseek': 'deepseek',
     'aihubmix': 'aihubmix',
     'zhipu': 'zhipu',
     'glm': 'chatglm',
     'moonshot': 'moonshot',
     'kimi': 'moonshot',  // kimi = moonshot
     'qwen': 'qwen',
     '通义千问': 'qwen',
     // ... 200+ 更多映射
   };
   ```

2. **模糊匹配算法**
   ```typescript
   private static normalizeProviderId(providerId: string): string {
     return providerId
       .toLowerCase()
       .replace(/[\s\-_.]+/g, '')           // 移除分隔符
       .replace(/[\(\（].*?[\)\）]/g, '');  // 移除括号内容
   }

   static getIconUrl(providerId: string): string | undefined {
     const normalized = this.normalizeProviderId(providerId);

     // 1. 直接匹配
     if (this.PROVIDER_ICON_MAP[normalized]) {
       return this.buildUrl(this.PROVIDER_ICON_MAP[normalized]);
     }

     // 2. 包含匹配 (aihub-mix → aihubmix)
     for (const [key, iconName] of Object.entries(this.PROVIDER_ICON_MAP)) {
       if (normalized.includes(key) || key.includes(normalized)) {
         return this.buildUrl(iconName);
       }
     }

     // 3. 尝试直接使用
     return this.buildUrl(normalized);
   }
   ```

3. **SVG 图标渲染**
   ```typescript
   static getProviderIconHTML(providerId: string, size: number = 16): string {
     const iconUrl = this.getIconUrl(providerId);
     return `<img src="${iconUrl}"
                  width="${size}" height="${size}"
                  class="opencodian-provider-icon"
                  style="display: inline-block; vertical-align: middle;">`;
   }
   ```

**匹配示例：**
| 输入 | 归一化 | 匹配结果 |
|------|--------|----------|
| `AiHubMix (推理时代)` | `aihubmix` | ✅ `aihubmix` |
| `aihub-mix` | `aihubmix` | ✅ `aihubmix` |
| `zhipu-external` | `zhipexternal` | ✅ 包含 `zhipu` |
| `通义千问` | `通义千问` | ✅ `qwen` |
| `Kimi (Moonshot)` | `kimi` | ✅ `moonshot` |

---

### ✅ 4. 搜索与键盘导航

**搜索功能：**
```typescript
private modelFilterQuery = '';

// 过滤逻辑
const filtered = providers.filter(({ provider, models }) => {
  const providerMatch = provider.providerID.toLowerCase().includes(query);
  const modelMatch = models.some(m => m.toLowerCase().includes(query));
  return providerMatch || modelMatch;
});
```

**键盘导航：**
- `↑/↓` - 在选项间移动
- `Enter` - 选择高亮项
- `Escape` - 关闭下拉
- `Home/End` - 跳到首/尾

---

### ✅ 5. Flexbox 滚动修复

**问题：**
flex 容器内的子元素使用 `overflow-y: auto` 时滚动条不显示。

**解决方案：**
```css
/* 使用 max-height 而非 flex: 1 */
.opencodian-model-dropdown-scroll {
  max-height: 260px;        /* 固定最大高度 */
  overflow-y: scroll !important;  /* 强制显示滚动条 */
}

/* 父容器 */
.opencodian-model-dropdown {
  display: flex;
  flex-direction: column;
  max-height: 320px;        /* 整体最大高度 */
  overflow: hidden;         /* 防止整体溢出 */
}
```

---

### 📁 新增/修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/utils/icons/ProviderIconService.ts` | 新增：图标映射与加载服务 |
| `src/features/chat/OpenCodianView.ts` | 重构：模型选择器 UI 实现 |
| `styles.css` | 新增：下拉组件、粘性头部、图标样式 |

---

### 🎨 视觉层次设计

```
提供商头部 (14px, bold, accent color)
  └── 模型选项 (12px, normal)
  └── 模型选项 (12px, normal)

颜色规范：
- 提供商名：var(--text-accent) - 强调色
- 模型名：var(--text-normal) - 正文色
- 选中项：var(--background-modifier-hover) - 悬停背景
- 图标：16x16px，flex-shrink: 0 防止压缩
```

---

### 🔧 已知问题

1. **重复 key 警告**
   - `spark` 和 `jamba` 在映射表中重复定义（非致命）
   - 不影响功能，可后续清理

2. **图标加载延迟**
   - CDN 图标首次加载有短暂延迟
   - 浏览器缓存后快速加载

---

**会话日期**: 2026-03-24
**开发时间**: ~3 小时
**主要贡献**: 自定义模型选择器、Lobehub 图标集成、粘性分组头部、搜索功能
**当前状态**: ✅ 模型选择器 UI 完整，支持 200+ 供应商图标

---

---

## 2026-03-24 UI 改进与功能完善

本次会话完成了多项 UI 改进和 Bug 修复。

---

### ✅ 1. 时间戳移出消息气泡

**问题现象：**
- 用户消息的时间戳显示在深色气泡内部，影响美观
- 与 Claudian 的样式不一致

**解决方案：**
- 将时间戳从 `content` 容器移到 `messageEl` 级别
- 调整 CSS，让时间戳显示在气泡下方

```typescript
// 修改前：在 content 内部创建时间戳
content.createEl('div', { cls: 'opencodian-message-time', text: time });

// 修改后：在 messageEl 级别创建时间戳
messageEl.createEl('div', { cls: 'opencodian-message-time', text: time });
```

**涉及文件：**
- `src/features/chat/OpenCodianView.ts`
- `styles.css`

---

### ✅ 2. Thinking 块与工具调用样式优化（Claudian 风格）

**实现内容：**
- Thinking 块显示 "Thought for Xs" 或 "Thought (<1s)"
- 工具调用显示工具名和参数摘要
- 工具状态图标：✓ 绿色（成功）、✕ 红色（失败）
- 展开后显示左侧边框线

**样式变更：**
```css
/* Thinking 块 */
.streaming-thinking-label {
  color: var(--text-accent);  /* 橙色/红色 */
}

/* 工具调用状态 */
.streaming-tool-status.status-completed {
  color: var(--color-green);
}
.streaming-tool-status.status-error {
  color: var(--color-red);
}
```

**涉及文件：**
- `src/utils/streaming/ThinkingBlockRenderer.ts`
- `src/utils/streaming/ToolCallRenderer.ts`
- `styles.css`

---

### ✅ 3. 消息持久化存储

**问题现象：**
- 重新加载 Obsidian 后用户消息消失
- 工具调用消息跑到最下面
- Thinking duration 丢失

**解决方案：**
1. **保存完整消息**：`saveConversation` 现在保存 `messages` 数组
2. **独立 thinking 块**：每个 reasoning part 创建独立的 thinking block
3. **保持顺序**：工具调用在收到结果时立即保存到 contentBlocks

```typescript
// StorageService.ts
async saveConversation(conversation: Conversation): Promise<void> {
  const data = {
    // ... 元数据
    messages: conversation.messages,  // 保存完整消息
  };
}
```

**涉及文件：**
- `src/core/storage/StorageService.ts`
- `src/main.ts`
- `src/utils/streaming/StreamController.ts`

---

### ✅ 4. 等待提示功能

**实现内容：**
- AI 响应超过 1 秒时显示 "Getting to work..."
- 实时显示等待时间
- 提示 "(esc to interrupt)"
- 收到实际内容后自动消失

```typescript
const pendingTimeout = window.setTimeout(() => {
  pendingEl = messageContentEl.createDiv({ cls: 'opencodian-pending' });
  pendingEl.createSpan({ text: 'Getting to work...', cls: 'opencodian-pending-text' });
  // ... 计时器更新
}, 1000);
```

**CSS 样式：**
```css
.opencodian-pending {
  font-size: 13px;
  color: var(--text-accent);
  font-style: italic;
}
```

**涉及文件：**
- `src/features/chat/OpenCodianView.ts`
- `styles.css`

---

### ✅ 5. 流超时处理

**问题现象：**
- 某些工具调用长时间卡住
- 流无法正常退出

**解决方案：**
- 添加 2 分钟超时机制
- 超时后将运行中的工具标记为错误

```typescript
private timeoutStream(): void {
  for (const [toolId, toolCall] of this.state.toolCalls) {
    if (toolCall.status === 'running' || toolCall.status === 'pending') {
      toolCall.status = 'error';
      toolCall.result = 'Request timeout';
      // ... 更新 UI
    }
  }
}
```

**涉及文件：**
- `src/utils/streaming/StreamController.ts`
- `src/features/chat/OpenCodianView.ts`

---

### 🐛 遇到的问题与修复

#### 问题 1：TypeScript 类型错误

**现象：**
编译时出现 9 处类型错误，涉及：
- `ContentBlock` 未导入
- `ToolCallInfo` 类型不匹配
- `setLocale` 参数类型错误

**修复：**
```typescript
// 统一 ToolCallStatus 类型
export type ToolCallStatus = 'pending' | 'running' | 'completed' | 'error' | 'blocked';

// 修复 setLocale 调用
setLocale(this.settings.locale as 'en' | 'zh');
```

#### 问题 2：工具调用状态显示错误

**现象：**
- 工具调用失败仍显示绿色勾
- CSS 中有重复定义覆盖了错误状态颜色

**修复：**
删除 CSS 中重复的状态颜色定义。

#### 问题 3：等待提示不显示

**现象：**
- 等待提示逻辑存在但不显示
- 原因是第一帧数据到达过快，清除了等待提示

**修复：**
```typescript
// 只在有实际内容时才清除等待提示
const hasContent = (streamingChunk.type === 'text' && streamingChunk.content?.trim()) ||
                  (streamingChunk.type === 'thinking' && streamingChunk.content?.trim());
```

---

### 📁 修改文件汇总

| 文件 | 修改内容 |
|------|----------|
| `src/features/chat/OpenCodianView.ts` | 时间戳位置、等待提示、消息持久化 |
| `src/utils/streaming/ThinkingBlockRenderer.ts` | Thinking 块渲染逻辑 |
| `src/utils/streaming/ToolCallRenderer.ts` | 工具调用渲染、状态图标 |
| `src/utils/streaming/StreamController.ts` | 工具调用保存顺序、超时处理 |
| `src/core/storage/StorageService.ts` | 保存完整消息数组 |
| `src/core/opencode/OpenCodeService.ts` | 独立 thinking 块处理 |
| `src/core/types/chat.ts` | 添加 `durationSeconds` 字段 |
| `src/core/types/tools.ts` | 统一 `ToolCallStatus` 类型 |
| `src/main.ts` | 异步加载完整会话 |
| `styles.css` | 样式优化、等待提示样式 |

---

### 📝 下一步计划

1. **测试覆盖** - 添加单元测试覆盖新功能
2. **性能优化** - 大型消息历史的加载优化
3. **国际化** - 完善中英文切换

---

## 2026-03-24 UI 布局优化与玻璃拟态设计

### 📋 背景
优化聊天界面布局，改进用户消息气泡视觉效果，添加流畅的动画交互。

### ✅ 已完成功能

#### 1. 发送按钮位置调整
**改动前：**
- 发送按钮位于输入框内部右侧

**改动后：**
- 发送按钮移到输入栏下方工具栏右侧
- 布局结构：`[权限模式] [模型选择器]        [发送按钮]`

**代码变更：**
```typescript
// OpenCodianView.ts - buildInputArea()
// 将 sendBtn 从 inputWrapper 移到 toolbar
this.sendBtn = toolbar.createDiv({ cls: 'opencodian-send-btn' });
```

---

#### 2. 权限模式位置调整
**改动：**
- 权限模式从右侧移到左侧
- 与模型选择器挨着，保持视觉连贯性
- 统一字体大小为 `13px`（原来是 `12px`）

**布局结构：**
```
┌─────────────────────────────────────────────────┐
│  [PLAN] [GLM-4.5]                        [🚀]  │
└─────────────────────────────────────────────────┘
```

---

#### 3. 去掉下拉箭头
**改动：**
- 移除模型选择器的 chevron-down 图标
- 移除权限模式的 chevron-down 图标

**代码变更：**
```typescript
// OpenCodianView.ts - initializeModelSelector()
// 删除：const chevron = triggerContent.createSpan(...)
// 删除：setIcon(chevron, 'chevron-down');

// OpenCodianView.ts - initializePermissionSelector()
// 删除：const chevronEl = trigger.createSpan(...)
// 删除：setIcon(chevronEl, 'chevron-down');
```

---

#### 4. 用户消息玻璃拟态气泡
**设计效果：**
- 半透明渐变背景
- backdrop-filter 毛玻璃模糊效果
- 高光边框和多层阴影
- 圆角气泡，右下尖角

**CSS 实现：**
```css
.opencodian-message--user .opencodian-message-content {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05));
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 16px;
  border-end-end-radius: 4px;
  box-shadow:
    0 4px 24px rgba(0, 0, 0, 0.15),
    0 1px 2px rgba(255, 255, 255, 0.1) inset;
}
```

**悬停闪光效果：**
```css
.opencodian-message--user .opencodian-message-content::before {
  content: '';
  position: absolute;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
  transition: left 0.5s ease;
}

.opencodian-message--user:hover .opencodian-message-content::before {
  left: 100%;  /* 悬停时闪光扫过 */
}
```

---

#### 5. 动画效果
**消息滑入动画：**
```css
@keyframes messageSlideIn {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.opencodian-message--user,
.opencodian-message--assistant {
  animation: messageSlideIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

**发送按钮动画：**
```css
/* 悬停放大+旋转 */
.opencodian-send-btn:hover {
  transform: scale(1.1) rotate(-5deg);
  box-shadow: 0 4px 16px rgba(var(--interactive-accent-rgb), 0.4);
}

/* 停止按钮脉冲动画 */
.opencodian-stop-btn {
  animation: pulseRed 2s ease-in-out infinite;
}

@keyframes pulseRed {
  0%, 100% { box-shadow: 0 0 0 0 rgba(var(--background-modifier-error-rgb), 0.4); }
  50% { box-shadow: 0 0 0 8px rgba(var(--background-modifier-error-rgb), 0); }
}

/* 点击波纹效果 */
.opencodian-send-btn::after {
  content: '';
  position: absolute;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  transition: width 0.4s ease, height 0.4s ease;
}
```

**气泡悬停效果：**
```css
.opencodian-message--user:hover .opencodian-message-content {
  transform: translateY(-2px) scale(1.01);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  border-color: rgba(255, 255, 255, 0.25);
}
```

---

### 📁 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/features/chat/OpenCodianView.ts` | 发送按钮移到底部工具栏、移除下拉箭头、调整元素顺序 |
| `styles.css` | 玻璃拟态气泡样式、动画效果、工具栏布局调整 |

---

### 🎯 当前状态

**布局优化：**
- ✅ 发送按钮在输入栏下方右侧
- ✅ 权限模式在左侧与模型选择器挨着
- ✅ 无下拉箭头，界面更简洁

**视觉效果：**
- ✅ 用户消息玻璃拟态气泡
- ✅ 悬停闪光扫过效果
- ✅ 悬停上浮放大效果

**动画效果：**
- ✅ 消息滑入动画（带弹性效果）
- ✅ 发送按钮悬停旋转放大
- ✅ 停止按钮红色脉冲呼吸
- ✅ 点击波纹效果

---

**会话日期**: 2026-03-24
**开发时间**: ~1 小时
**主要贡献**: UI布局优化、玻璃拟态设计、动画效果增强
**当前状态**: 已部署测试，效果良好

---

---

## 2026-03-24 Bug 修复：权限卡片位置与工具错误状态

### 🐛 Bug 1：权限卡片位置错误

**问题描述：**
权限请求卡片显示在消息顶部，而不是对应的工具调用下方。

**期望效果：**
```
[思考块]
[文本内容]
🔧 websearch_web_search_exa ⏳  ← 工具调用
🔐 权限请求  ← 应该在工具卡片下方
```

**问题根源：**
- `streamingContentEl` 指向 `textEl`（文本元素）
- 工具调用直接渲染到 `messageEl`（消息元素）
- 权限卡片被插入到 `textEl`，导致顺序错误

**修复方案：**
```typescript
// 使用 messageEl 查找工具调用
const messageEl = this.streamingMessageEl;
const lastToolCall = messageEl.querySelector('.streaming-tool-call:last-of-type');

// 将权限卡片插入到工具调用之后
if (lastToolCall && lastToolCall.parentNode) {
  lastToolCall.parentNode.insertBefore(permissionCard, lastToolCall.nextSibling);
}
```

---

### 🐛 Bug 2：工具错误状态不显示红色×

**问题描述：**
工具调用返回错误时（如 timeout、权限被拒绝），状态图标显示绿色勾而不是红色×。

**问题根源：**
1. OpenCodeService 发送 `tool_result` 时没有包含 `isError` 字段
2. `convertToStreamingChunk` 转换时没有传递 `isError` 字段
3. StreamController 默认将没有 `isError` 的结果视为 `completed`

**修复方案：**

**1. OpenCodeService.ts - SSE 流处理**
```typescript
yield {
  type: 'tool_result',
  toolUseId: toolId,
  content: part.state.error ? `Error: ${part.state.error}` : (part.state.output ?? ''),
  isError: !!part.state.error,  // ← 添加错误标记
};
```

**2. OpenCodeService.ts - 历史消息加载**
```typescript
} else if (state.status === 'completed') {
  chunks.push({
    type: 'tool_result',
    toolUseId: toolPart.callID ?? '',
    content: state.output ?? '',
    isError: false,  // ← 明确标记成功
  });
} else if (state.status === 'error') {
  chunks.push({
    type: 'tool_result',
    toolUseId: toolPart.callID ?? '',
    content: `Error: ${state.error}`,
    isError: true,  // ← 明确标记错误
  });
}
```

**3. OpenCodianView.ts - 类型转换**
```typescript
case 'tool_result':
  return {
    type: 'tool_result',
    id: chunk.toolUseId,
    content: chunk.content,
    isError: chunk.isError,  // ← 传递错误标记
  };
```

**状态图标映射：**
| 状态 | 图标 | 颜色 |
|------|------|------|
| `completed` | ✓ check | 绿色 |
| `error` | ✗ x | 红色 |
| `running` | ⟳ loader | 橙色（旋转） |

---

### 📁 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/features/chat/OpenCodianView.ts` | 权限卡片插入位置修复、添加 `isError` 传递 |
| `src/core/opencode/OpenCodeService.ts` | SSE 流和历史消息加载添加 `isError` 字段 |

---

### 🎯 当前状态

**Bug 修复：**
- ✅ 权限卡片显示在对应工具调用下方
- ✅ 工具错误状态正确显示红色×图标
- ✅ 工具成功状态显示绿色勾图标

---

**会话日期**: 2026-03-24
**开发时间**: ~1 小时
**主要贡献**: Bug 修复：权限卡片位置、工具错误状态图标
**当前状态**: 已部署测试

---

---

## 2026-03-23 UI 优化与功能完善

### 🧹 代码清理：移除不必要的控制台日志

#### 清理范围
移除了约 70 处调试日志，保留错误和警告日志：

**保留的日志（有用信息）：**
- `console.error` - 错误处理日志
- `console.warn` - 警告日志

**移除的日志文件：**
- `src/main.ts` - 4 条
- `src/features/settings/OpenCodianSettings.ts` - 6 条
- `src/core/opencode/ServerManager.ts` - 7 条
- `src/utils/streaming/StreamController.ts` - 5 条
- `src/core/opencode/OpenCodeService.ts` - 38 条
- `src/features/chat/OpenCodianView.ts` - 7 条

### 🐛 修复历史会话显示问题

#### 问题描述
重新启动 Obsidian 后，以前会话的 thinking 和工具调用显示消失，只剩下一个空白框。

#### 根本原因
历史消息加载时只提取了 `type === 'text'` 的部分，没有处理 thinking 和 tool 部分。

#### 解决方案

**1. 更新 `openCodeMessageToChatMessage()` 方法**
- 添加对 `type === 'reasoning'` 部分的提取（thinking 内容）
- 构建 `contentBlocks` 数组，包含 thinking、tool_use、tool_result、text 块

**2. 新增 `renderContentBlock()` 方法**
使用与实时会话相同的渲染器：
- `ThinkingBlockRenderer.renderStored()` - 渲染可折叠的 thinking 块
- `ToolCallRenderer.render()` - 渲染工具调用卡片

**3. 更新 `renderMessage()` 方法**
- 支持完整的 `ChatMessage` 类型
- 如果存在 `contentBlocks`，按顺序渲染每个块

### 🎨 Header 样式更新

#### 新增功能
- 浅色主题显示深色 logo，深色主题显示浅色 logo
- 根据 `.theme-dark` 类自动切换
- 监听 `css-change` 事件，主题切换时自动更新

#### 修改内容
- 添加 `LOGO_SVG_LIGHT` 和 `LOGO_SVG_DARK` 常量
- 添加 `getLogoSvg()` 方法检测当前主题
- 更新 CSS 样式适配新的 logo 尺寸

### 💬 消息界面优化

#### 1. 移除头像
用户和 AI 消息都不再显示头像图标，界面更简洁。

#### 2. 融合背景样式
- 用户消息：深色半透明气泡 (`rgba(0, 0, 0, 0.3)`)，右对齐
- AI 消息：透明背景，与 Obsidian 背景融合

#### 3. 文本选择支持
- 添加 `user-select: text` 支持鼠标选择文本
- 用户消息中选中文本有白色半透明高亮

#### 4. 整体界面融合
- 容器背景改为透明
- Header 移除边框和背景色
- 输入区域移除顶部边框

### ⏹️ 停止按钮功能

#### 功能描述
发送消息后，按钮自动变为红色停止按钮，点击可中止流式响应。

#### 实现细节

**1. OpenCodeService 修改**
- 添加 `currentAbortController` 跟踪当前流
- 添加 `cancelStream()` 公共方法中止 SSE 连接
- 在生成器循环中检查 `signal.aborted` 状态

**2. OpenCodianView 修改**
- 存储 `sendBtn` 和 `inputTextarea` 引用
- 添加 `updateSendButtonState()` 方法切换按钮状态
- `cancelStreaming()` 调用服务取消方法

**3. 按钮状态切换**
- 空闲时：蓝色背景 + 发送图标
- 流式中：红色背景 + 方块图标（停止）

#### 调试日志
添加详细日志用于验证功能：
```
[OpenCodianView] cancelStreaming called, isStreaming: true
[OpenCodeService] Cancelling stream...
[OpenCodeService] Abort signal sent
[OpenCodianView] Streaming cancelled, breaking loop
```

### 📊 测试结果
- ✅ 历史会话 thinking 正确显示
- ✅ 历史会话工具调用正确显示
- ✅ Logo 随主题自动切换
- ✅ 消息文本可选择复制
- ✅ 停止按钮可中止流式响应

### 📝 涉及文件
- `src/core/opencode/OpenCodeService.ts`
- `src/features/chat/OpenCodianView.ts`
- `src/utils/streaming/ThinkingBlockRenderer.ts`
- `src/utils/streaming/ToolCallRenderer.ts`
- `styles.css`

---

**会话日期**: 2026-03-23
**开发时间**: ~3 小时
**主要贡献**: UI 优化、功能完善、代码清理
**当前状态**: ✅ 所有功能正常工作

---

---

## 2026-03-23 工具调用显示修复

### 🐛 问题描述
用户报告工具调用在会话中不显示。虽然 AI 实际调用了工具（如 web_search、bash、read 等），但前端界面中没有呈现工具调用的卡片。

### 🔍 根因分析
通过分析日志文件 `obsidian.md-1774267116377.log`，发现问题出在 `OpenCodeService.ts` 的 SSE 事件处理逻辑中：

1. **代码逻辑错误**: `message.part.updated` 事件有两个处理块
   - 第一个处理块（第 467 行）跟踪 part 类型后使用 `continue` 跳过循环
   - 第二个处理块（原第 513 行）包含工具调用处理逻辑，但**永远不会被执行**

```typescript
// 第一个处理块 - 执行后会 continue 跳过
if (eventData.type === 'message.part.updated') {
  // ... 跟踪 part 类型
  continue;  // ← 这里直接跳过了！
}

// 第二个处理块 - 永远不会执行
if (eventData.type === 'message.part.updated') {
  // 处理 tool 的逻辑在这里...
}
```

2. **数据结构确认**: OpenCode Server 发送的工具调用事件格式如下：
```json
{
  "type": "message.part.updated",
  "properties": {
    "part": {
      "id": "prt_xxx",
      "type": "tool",
      "callID": "call_xxx",
      "tool": "web_search",
      "state": {
        "status": "running",
        "input": { "query": "today's date" }
      }
    }
  }
}
```

### ✅ 修复方案

#### 1. 合并工具处理逻辑
将工具调用处理逻辑合并到第一个 `message.part.updated` 处理块中：

```typescript
if (eventData.type === 'message.part.updated') {
  const part = eventData.properties?.part;
  if (part?.id && part?.type) {
    this.partTypeMap.set(part.id, part.type);

    // 处理工具调用
    if (part.type === 'tool') {
      const toolId = part.callID || part.id;
      const toolName = part.tool || 'unknown';
      if (toolId) {
        // 新工具调用
        if (!processedToolIds.has(toolId)) {
          processedToolIds.add(toolId);
          yield {
            type: 'tool_use',
            id: toolId,
            name: toolName,
            input: part.state?.input || {}
          };
        }

        // 工具结果
        if (part.state?.output || part.state?.error) {
          // yield tool_result...
        }
      }
    }
  }
  continue;
}
```

#### 2. 删除冗余代码块
移除永远不会执行的第二个 `message.part.updated` 处理块。

### 🧪 调试过程
为确认修复效果，添加了详细的调试日志：
- `[OpenCodeService] message.part.updated - part:` - 显示 part 对象结构
- `[OpenCodeService] Tool part detected!` - 确认检测到工具类型
- `[StreamController] Rendering tool:` - 确认渲染执行

通过日志验证，工具调用已正确 yield 并传递给 `StreamController`，`ToolCallRenderer` 成功渲染了工具卡片。

### 📊 测试结果
修复后，工具调用正常显示：
- ✅ `task` 工具 - 显示任务进度
- ✅ `glob` 工具 - 显示文件搜索
- ✅ `grep` 工具 - 显示文本搜索
- ✅ `ast_grep_search` 工具 - 显示代码搜索

工具卡片显示为可折叠的 UI 组件：
```
┌─────────────────────────────────────┐
│ 🔧 web_search │ "query" │ ⏳ │
├─────────────────────────────────────┤
│ Waiting for result...               │
└─────────────────────────────────────┘
```

### 📝 代码清理
修复验证完成后，清理了所有调试日志：
- 删除了 `OpenCodeService.ts` 中的 5 处调试日志
- 删除了 `StreamController.ts` 中的 3 处调试日志

### 🎯 技术要点
1. **SSE 事件处理**: OpenCode Server 使用 `message.part.updated` 事件通知工具状态变化
2. **工具生命周期**: 工具调用经历 `pending` → `running` → `completed/error` 状态
3. **渲染流程**:
   - `OpenCodeService` 解析 SSE 事件 → yield `tool_use` chunk
   - `StreamController` 接收 chunk → 调用 `ToolCallRenderer.render()`
   - `ToolCallRenderer` 创建 DOM 元素 → 显示工具卡片

---

**会话日期**: 2026-03-23
**开发时间**: ~2 小时
**主要贡献**: 修复工具调用显示问题，清理调试日志
**涉及文件**:
- `src/core/opencode/OpenCodeService.ts`
- `src/utils/streaming/StreamController.ts`

**当前状态**: ✅ 工具调用显示功能完整，支持 task/glob/grep/ast_grep_search 等多种工具

---

---

## 2026-03-23 Bug修复：SSE流结束后无法发送新消息

### 🔧 问题分析

**现象：**
- 第一条消息流式输出正常
- 回复完成后，无法再发送新消息
- `isStreaming` 状态保持为 `true`，阻止了新消息发送

**根本原因：**
1. `fetch` 请求没有使用 `signal` 参数，导致 `abortController.abort()` 无法真正取消连接
2. `reader.read()` 在某些情况下可能挂起，导致 `for await...of` 循环无法退出
3. `finally` 块无法执行，`isStreaming` 状态无法重置

### ✅ 修复方案

**1. OpenCodianView.ts - 添加超时保护机制**
```typescript
// Set up timeout as safety net to reset isStreaming
const STREAM_TIMEOUT_MS = 120000; // 2 minutes timeout
let timeoutId: number | null = null;
const resetStreamingState = () => {
  if (timeoutId) {
    window.clearTimeout(timeoutId);
    timeoutId = null;
  }
  this.isStreaming = false;
};

timeoutId = window.setTimeout(() => {
  console.warn('[OpenCodianView] Stream timeout, forcing state reset');
  resetStreamingState();
  // ...
}, STREAM_TIMEOUT_MS);
```

**2. OpenCodeService.ts - 修复 SSE 连接取消逻辑**
```typescript
// 将 signal 传递给 fetch
const response = await fetch(url, {
  method: 'GET',
  headers: { 'Accept': 'text/event-stream' },
  signal, // 允许通过 abortController 取消请求
});

// 改进错误处理
try {
  readResult = await reader.read();
} catch (readError) {
  if (signal?.aborted || aborted) {
    break; // 优雅地处理取消
  }
  throw readError;
}
```

### 📝 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/features/chat/OpenCodianView.ts` | 添加超时机制，确保 `isStreaming` 总能被重置 |
| `src/core/opencode/OpenCodeService.ts` | 修复 `fetch` 信号传递，改进 `reader.read()` 错误处理 |

---

## 🎯 下一步建议

1. ~~**修复 SSE 流状态问题**~~ ✅ 已完成
2. **消息历史持久化** - 在插件端缓存消息历史，减少对服务器的依赖
2. **消息历史持久化** - 在插件端缓存消息历史，减少对服务器的依赖
3. **错误重试机制** - 网络错误时自动重试
4. **消息编辑/删除** - 添加消息管理功能
5. **文件附件** - 支持上传文件到对话
6. **代码块高亮** - 优化消息中代码的显示

---

**会话日期**: 2026-03-23
**开发时长**: ~4 小时
**主要贡献**: SSE 流式响应架构实现、CORS 配置、事件解析、流状态管理修复

**当前状态**: ✅ SSE 流式传输功能完整，支持连续发送多条消息

---

---

## 2026-03-23 SSE 流式响应重构（进行中）

### 🚧 重构目标
将原有的轮询式消息获取改为真正的 Server-Sent Events (SSE) 流式响应，实现逐字输出的真实流式效果。

### ✅ 已完成工作

#### 1. SSE 连接建立
**实现内容：**
- 使用原生 `fetch` + `ReadableStream` 实现 SSE 连接
- 连接 OpenCode `/event` 端点获取实时事件流
- 支持手动中断连接（`reader.cancel()`）

**代码变更：**
```typescript
// src/core/opencode/OpenCodeService.ts
private async *connectSSE(url: string, signal?: AbortSignal): AsyncGenerator<SSEEvent> {
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'text/event-stream' },
  });

  const reader = response.body!.getReader();
  // ... 读取和处理 SSE 数据
}
```

#### 2. SSE 数据解析
**实现内容：**
- 实现 `parseSSEEvents()` 方法解析 SSE 格式
- 处理 OpenCode 的特殊格式（只有 `data:` 行，无 `event:` 行）
- 从 JSON `type` 字段提取事件类型

**关键发现：**
```
OpenCode SSE 格式：
data: {"type":"message.part.delta","properties":{...}}

标准 SSE 格式：
event: message.part.delta
data: {"properties":{...}}
```

**修复：**
```typescript
// 当没有 event 类型时，从 JSON 中提取
if (!currentEvent.event && currentEvent.data) {
  try {
    const parsed = JSON.parse(currentEvent.data);
    currentEvent.event = parsed.type || 'unknown';
  } catch {
    currentEvent.event = 'unknown';
  }
}
```

#### 3. 事件类型处理
**支持的事件类型：**
| 事件类型 | 处理方式 | 说明 |
|---------|---------|------|
| `message.part.updated` | 跟踪 part 类型 | 记录 partID → 类型的映射 |
| `message.part.delta` | 流式输出 | 根据 part 类型输出 thinking/text |
| `session.idle` | 终止连接 | 消息完成信号 |
| `server.heartbeat` | 忽略 | 保持连接的心跳 |
| `server.connected` | 忽略 | 初始连接确认 |

**关键逻辑：**
```typescript
// 跟踪 part 类型
if (eventData.type === 'message.part.updated') {
  const part = eventData.properties?.part;
  if (part?.id && part?.type) {
    this.partTypeMap.set(part.id, part.type);
  }
}

// 处理流式内容
if (eventData.type === 'message.part.delta') {
  const partType = this.partTypeMap.get(props.partID);
  if (partType === 'reasoning') {
    yield { type: 'thinking', content: props.delta };
  } else {
    yield { type: 'text', content: props.delta };
  }
}
```

#### 4. CORS 配置
**问题：**
- Obsidian 使用 `app://obsidian.md` 和 `app://obsidian` 协议
- 浏览器拒绝跨域请求

**解决方案：**
```typescript
// src/core/opencode/ServerManager.ts
this.process = spawn(opencodePath, [
  'serve',
  '--port', String(this.config.port),
  '--hostname', this.config.host,
  '--cors', 'app://obsidian.md',
  '--cors', 'app://obsidian',
], {
  detached: false,
  stdio: ['ignore', 'pipe', 'pipe'],
});
```

#### 5. 连接中断机制
**实现内容：**
- 使用 `AbortSignal` 传递中断信号
- 检测到 `session.idle` 时主动中断连接
- 使用 `reader.cancel()` 中断阻塞的 `read()` 调用

**代码：**
```typescript
// 检测到消息完成
if (eventData.type === 'session.idle') {
  console.log('[OpenCodeService] Session idle, message complete');
  abortController.abort();
  break; // 退出 SSE 循环
}

// 中断处理
const abortHandler = () => {
  aborted = true;
  void reader.cancel();
};
signal?.addEventListener('abort', abortHandler);
```

### ✅ 已修复：流结束后无法发送新消息

**问题现象：**
- 第一条消息流式输出正常
- 回复完成后，点击发送按钮无反应
- 控制台无错误日志

**排查过程：**
1. ✅ 确认 `isStreaming` 状态重置逻辑存在（`finally` 块）
2. ✅ 确认 `session.idle` 事件正确处理并 break
3. ✅ 确认 `abortController.abort()` 正确中断 SSE 连接

**根因分析：**
- 通过添加详细调试日志，确认 `session.idle` 事件被正确接收和处理
- SSE 循环正确 break，`finally` 块正确执行
- `isStreaming` 状态正确重置

**验证日志：**
```
[OpenCodeService] SSE event: session.idle
[OpenCodeService] session.idle event passed filter, properties: {"sessionID":"..."}
[OpenCodeService] Session idle detected, breaking loop...
[OpenCodeService] Session idle, message complete
[OpenCodeService] Abort signal received, cancelling reader...
[OpenCodeService] SSE reader released
[OpenCodianView] Converting chunk: message_stop
[StreamController] handleChunk: done
[OpenCodianView] Streaming state reset  ← 状态正确重置
```

**添加的调试日志：**
```typescript
// OpenCodeService.ts - session 过滤器
if (eventData.properties?.sessionID && eventData.properties.sessionID !== sessionId) {
  console.log('[OpenCodeService] Skipping event for different session...');
  continue;
}

// session.idle 处理
if (eventData.type === 'session.idle') {
  console.log('[OpenCodeService] Session idle detected, breaking loop...');
  console.log('[OpenCodeService] Session idle, message complete');
  abortController.abort();
  break;
}
```

### 📁 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/core/opencode/OpenCodeService.ts` | 实现 SSE 连接、数据解析、事件处理 |
| `src/core/opencode/ServerManager.ts` | 添加 CORS 配置参数 |
| `src/features/chat/OpenCodianView.ts` | 添加异常处理，确保流结束 |

### 📝 下一步计划

1. ~~**验证连接中断**~~ ✅ 已验证，SSE 流正常工作
2. **清理调试日志** - 移除不必要的详细日志（保留关键日志）
3. **完善功能**
   - 添加连接状态指示器
   - 实现取消按钮（中断当前流）
   - 消息历史持久化到本地

---

## 2026-03-23 SDK 依赖评估与移除

### 📋 背景
项目中声明了 `@opencode-ai/sdk` 作为依赖，但实际代码完全没有使用它。项目自己实现了 HTTP 请求层和 SSE 流解析。本次评估决定是否使用官方 SDK 替代手动实现。

### 🔍 调研过程

#### 1. 对比参考项目与安装版本
- **参考项目** (`reference-projects/opencode-sdk-js`): v0.1.0-alpha.21
  - 使用 `Opencode` 类
  - 方法返回直接的 Promise，如 `await client.session.create()` 返回 `Session`
  - 支持流式事件 `client.event.list()`

- **npm 安装版本**: v1.2.27
  - 使用 `createOpencodeClient()` 或 `OpencodeClient`
  - 所有方法返回 `{ data, error, request, response }` 包装对象
  - API 结构完全不同

#### 2. API 差异示例
```typescript
// 参考项目 (v0.1.0-alpha.21)
const session = await client.session.create();
// session 直接是 Session 对象

// 安装版本 (v1.2.27)
const result = await client.session.create();
// result = { data: Session | undefined, error: APIError | undefined, request, response }
// 需要检查 result.data 或 result.error
```

#### 3. 评估结论
- 官方 SDK 版本差异过大，无法直接迁移
- 当前手动实现已经稳定工作，没有迁移的必要
- 移除未使用的依赖可以减少包体积

### ✅ 执行操作

#### 移除 SDK 依赖
```bash
npm uninstall @opencode-ai/sdk
```

#### 修复 TypeScript 类型错误
在 `OpenCodeService.ts` 中补充缺失的类型定义：
```typescript
interface OpenCodeEvent {
  type: string;
  properties: {
    // ... 已有属性
    delta?: string;
    field?: string;      // 新增
    partID?: string;     // 新增
    toolID?: string;
    result?: string;
    error?: string;
  };
}
```

#### 修复空值处理
```typescript
// partID 可能为 undefined 时的 Map 操作
if (partID && !this.partTypeMap.has(partID)) {
  const partType = eventData.properties?.part?.type;
  this.partTypeMap.set(partID, partType || 'text');
}
const partType = partID ? (this.partTypeMap.get(partID) || 'text') : 'text';

// tool output 可能为 undefined
content: part.state.error
  ? `Error: ${part.state.error}`
  : (part.state.output ?? ''),
```

#### 更新 tsconfig.json
排除 `reference-projects` 目录避免编译错误：
```json
{
  "exclude": [
    "node_modules",
    "tests",
    "reference-projects"
  ]
}
```

### 📁 修改文件

| 文件 | 修改内容 |
|------|----------|
| `package.json` | 移除 `@opencode-ai/sdk` 依赖 |
| `package-lock.json` | 更新锁定文件 |
| `src/core/opencode/OpenCodeService.ts` | 修复类型定义和空值处理 |
| `tsconfig.json` | 排除 reference-projects |

### 🏁 结果
- Git 分支 `refactor/use-sdk` 已合并到 `main`
- 构建成功，已部署到测试环境
- 项目继续使用自定义 HTTP 实现，代码更简洁

---

## 2026-03-19 Bug修复：消息显示与工具调用超时

### 🔧 修复消息无法正常显示的问题

**问题现象：**
- AI 回复的消息在 UI 中无法正常显示
- 日志显示消息已获取，但流提前退出
- 控制台显示 `[OpenCodeService] Exiting - content stable`，但内容为空

**根本原因：**
```typescript
// 原代码中的退出条件过于严格
const hasSubstantialContent = lastContent.length > 100;  // 需要超过100字符
const requiredStableCount = 8;  // 需要稳定8次轮询
```
- 如果 AI 回复短（少于100字符），`hasSubstantialContent` 永远为 false
- 轮询会持续到 `maxAttempts`（300次），用户长时间看不到内容

**解决方案：**
1. 放宽退出条件：只要有任何内容（`> 0` 字符）即可退出
2. 降低稳定计数要求：从 8 次降低到 5 次
3. 添加兜底条件：50次轮询后无论是否有内容都退出

```typescript
const hasAnyContent = lastContent.length > 0 || lastThinkingContent.length > 0;
const requiredStableCount = toolsPending ? 15 : 5;

if (stableCount >= requiredStableCount && (hasAnyContent || attempts > 50) && !toolsPending) {
  console.log('[OpenCodeService] Exiting - content stable');
  break;
}
```

**涉及文件：**
- `src/core/opencode/OpenCodeService.ts`

---

### ⏱️ 添加工具调用超时机制

**问题现象：**
- 某些工具（如 `websearch_web_search_exa`）长时间处于 `running` 状态
- 工具一直不返回结果，导致流永远无法退出
- 用户界面显示转圈，但永远无法收到最终回复

**根本原因：**
- OpenCode 的工具调用是异步的
- 某些工具可能因为网络问题或 API 错误永远卡住
- 没有超时机制导致无限等待

**解决方案：**
添加工具调用超时检测（60秒）：

```typescript
// Track tool start times for timeout detection
const toolStartTimes = new Map<string, number>();
const TOOL_TIMEOUT_MS = 60000; // 60 seconds timeout

// 记录工具开始时间
if (!processedToolIds.has(toolId)) {
  toolStartTimes.set(toolId, Date.now());
  // ...
}

// 检测超时工具
const timedOutTools: string[] = [];
for (const toolId of pendingToolIds) {
  const startTime = toolStartTimes.get(toolId);
  if (startTime && (now - startTime) > TOOL_TIMEOUT_MS) {
    console.log(`[OpenCodeService] Tool ${toolId} timed out`);
    timedOutTools.push(toolId);
  }
}

// 将超时工具标记为完成（带错误信息）
for (const toolId of timedOutTools) {
  yield {
    type: 'tool_result',
    toolUseId: toolId,
    content: 'Error: Tool execution timed out after 60 seconds',
  };
}
```

**超时处理流程：**
1. 新工具调用时记录开始时间
2. 每次轮询检查是否有工具超过 60 秒
3. 超时工具自动标记为完成，返回超时错误
4. 流可以继续退出，显示已获取的内容

**涉及文件：**
- `src/core/opencode/OpenCodeService.ts`

---

### ✅ 修复验证

**测试场景：**
- 发送消息"搜索今日时事新闻"
- AI 调用多个搜索工具
- 其中一个工具卡住（websearch_web_search_exa）

**修复前：**
- 工具一直显示 running，无法退出
- 用户看不到任何回复内容

**修复后：**
- 60秒后超时工具自动标记为错误
- 流正常退出，显示 AI 的完整回复
- 控制台显示：`Tool xxx timed out after 60000ms`

---

## 2026-03-19 功能实现与改进

本次会话完成了 OpenCodian 插件的核心功能实现和多项重要改进。

---

## ✅ 已完成的功能 (补充)

### 7. 历史会话菜单功能

**实现内容：**
- 点击历史会话按钮（history icon）弹出下拉菜单
- 显示所有历史会话列表，按更新时间排序
- 当前会话标记为 `(current)` 并显示勾选图标
- 点击任意会话即可切换到该会话
- 支持删除当前会话或删除所有会话（带确认对话框）
- 鼠标悬停显示会话创建日期

**涉及文件：**
- `src/features/chat/OpenCodianView.ts` - 菜单实现和会话切换逻辑

**技术细节：**
- 使用 Obsidian 的 `Menu` 组件创建下拉菜单
- 菜单项包含：
  - 会话列表（带图标和当前状态标记）
  - 分隔线
  - 删除当前会话
  - 删除所有会话（当会话数 > 1 时显示）
- 删除会话后自动加载剩余会话或创建新会话
- 使用 `confirm()` 对话框防止误删除

**示例交互：**
```
┌─────────────────────────┐
│ 🗨️ 会话 1               │
│ ✓ 会话 2 (current)      │
│ 🗨️ 会话 3               │
│ ─────────────────────── │
│ 🗑️ Delete current       │
│ 🗑️ Delete all           │
└─────────────────────────┘
```

### 8. Markdown 渲染支持

**实现内容：**
- 集成 `MarkdownRenderService` 到聊天界面
- AI 助手消息使用完整的 Markdown 渲染
- 支持代码块高亮（含语言标签和复制按钮）
- 支持图片嵌入 `![[image.png]]`
- 支持文件链接 `[[note]]`
- 支持表格、列表、引用等标准 Markdown 语法
- 流式响应实时 Markdown 渲染

**涉及文件：**
- `src/features/chat/OpenCodianView.ts` - 集成 Markdown 渲染服务
- `styles.css` - 添加 Markdown 渲染样式

**技术细节：**
- 使用 Obsidian 原生 `MarkdownRenderer` API
- 三阶段渲染流程：
  1. 预处理：`replaceImageEmbedsWithHtml` 处理图片嵌入
  2. 核心渲染：`MarkdownRenderer.renderMarkdown()`
  3. 后处理：`processFileLinks` 处理文件链接 + `enhanceCodeBlocks` 增强代码块
- 用户消息保持纯文本显示
- 创建独立的 `Component` 管理生命周期，避免内存泄漏

**渲染功能：**
| 功能 | 状态 |
|------|------|
| 代码块 + 语法高亮 | ✅ |
| 行内代码 | ✅ |
| 图片嵌入 `![[]]` | ✅ |
| 文件链接 `[[ ]]` | ✅ |
| 表格 | ✅ |
| 列表（有序/无序） | ✅ |
| 引用块 | ✅ |
| 标题 H1-H6 | ✅ |
| 水平分割线 | ✅ |
| 链接 | ✅ |

### 9. 流式内容渲染模块

**实现内容：**
- 创建通用流式渲染模块，支持思考块、文本、工具调用三种内容类型
- 思考块（thinking）：可折叠 + 实时计时器，默认收起
- 文本块（text）：支持 Markdown 实时渲染
- 工具调用（tool_call）：状态图标 + 可展开结果
- 支持流式数据块的增量处理和渲染
- 支持历史消息的内容块恢复渲染

**涉及文件：**
- `src/utils/streaming/` - 流式渲染模块目录
  - `types.ts` - 类型定义
  - `StreamController.ts` - 核心流式控制器
  - `ThinkingBlockRenderer.ts` - 思考块渲染器
  - `ToolCallRenderer.ts` - 工具调用渲染器
  - `index.ts` - 导出入口
  - `README.md` - 使用文档
- `styles.css` - 流式内容样式

**技术细节：**
- 三阶段内容块处理流程：
  1. `startStream()` - 创建消息容器，初始化状态
  2. `handleChunk()` - 处理各种类型的数据块
     - `thinking` → 创建/更新思考块，实时计时
     - `text` → Markdown 渲染
     - `tool_use/tool_result` → 工具调用渲染和结果更新
  3. `finalize()` - 保存 contentBlocks，触发回调
- 使用 `ContentBlock[]` 数组持久化消息内容
- 支持自定义工具图标、名称、摘要和结果渲染

**API 示例：**
```typescript
import { StreamController } from '@/utils/streaming';

const streamController = new StreamController({
  containerEl: messagesContainer,
  markdownService,
  onStreamComplete: (blocks) => saveMessage(blocks),
  scrollToBottom: () => scrollToBottom(),
});

// 开始流
streamController.startStream(contentEl);

// 处理数据块
for await (const chunk of stream) {
  await streamController.handleChunk(chunk);
}

// 恢复历史
streamController.renderStoredContentBlocks(parentEl, savedBlocks);
```

**内容块类型：**
| 类型 | 特性 |
|------|------|
| thinking | 可折叠，实时计时，默认收起 |
| text | Markdown 渲染 |
| tool_call | 状态图标（pending/running/completed/error），可展开结果 |

### 10. 会话内模型切换

**实现内容：**
- 移除 "Model: " 文本标签，仅保留下拉框
- 下拉框直接显示当前使用的模型名称（格式：Provider/Model）
- 鼠标悬停1秒后显示完整模型信息提示
- 支持下拉选择其他模型，仅影响当前会话
- 切换模型后发送的消息使用新模型
- 每个会话独立保存模型覆盖设置

**涉及文件：**
- `src/features/chat/OpenCodianView.ts` - 模型选择器实现
- `styles.css` - 选择器样式优化

**技术细节：**
- 使用 `Map<string, {provider, model}>` 存储每个会话的模型覆盖
- 模型选择优先级：会话覆盖 > 默认设置
- 从 OpenCode 服务动态加载可用模型列表
- 切换会话时自动更新选择器显示当前会话的模型

**示例交互：**
```
┌────────────────────────────┐
│ anthropic/claude-3-5-...  ▼│  <- 下拉框显示当前模型
└────────────────────────────┘
鼠标悬停1秒后显示：Using: anthropic/claude-3-5-sonnet-20241022
```

---

## ✅ 已完成的功能

### 1. 国际化支持 (i18n)

**实现内容：**
- 创建了完整的双语翻译系统
- 支持英文 (`en`) 和简体中文 (`zh`)
- 所有设置界面文本已翻译
- 新增语言选择设置项

**涉及文件：**
- `src/i18n/index.ts` - 国际化核心模块
- `src/i18n/locales/en.ts` - 英文翻译
- `src/i18n/locales/zh.ts` - 中文翻译
- `src/features/settings/OpenCodianSettings.ts` - 集成翻译
- `src/main.ts` - 初始化语言设置

### 2. 动态供应商/模型选择

**实现内容：**
- 从 OpenCode 服务器动态获取可用供应商列表
- 根据选择的供应商动态加载可用模型
- 修复模型数据格式兼容性（支持字符串数组和对象两种格式）
- 模型选择后正确保存到设置

**涉及文件：**
- `src/core/opencode/OpenCodeService.ts` - `getAvailableModels()` 方法
- `src/features/settings/OpenCodianSettings.ts` - 动态下拉菜单实现

**技术细节：**
- API 端点：`GET /config/providers`
- 处理两种 models 格式：
  - 格式1: `models: ["gpt-4", "gpt-3.5-turbo"]` (字符串数组)
  - 格式2: `models: { "model-id": { name: "..." } }` (对象)

### 3. 服务器状态检测与外部服务器识别

**实现内容：**
- 实时检测服务器运行状态（每2秒自动刷新）
- 区分插件启动的服务器和外部独立运行的服务器
- 添加 🟢/🔴 状态指示灯
- 外部服务器显示特殊标记并禁用停止按钮

**涉及文件：**
- `src/features/settings/OpenCodianSettings.ts` - 状态显示逻辑
- `src/core/opencode/ServerManager.ts` - 健康检查端点修复

**技术细节：**
- 修复健康检查端点：`/global/health`（原 `/health` 错误）
- 状态检测逻辑：
  - 健康检查通过 + 内部进程存在 = 运行中（可停止）
  - 健康检查通过 + 无内部进程 = 外部服务器（不可停止）

### 4. 会话功能修复

**问题修复：**

#### 问题1：会话ID错误导致500错误
**原因：**
- 保存会话时未存储 `openCodeSessionId`
- 加载会话时错误地使用对话ID作为 session ID
- 导致调用 `/session/{wrong-id}/message` 返回500

**解决方案：**
- 更新 `ConversationMeta` 类型，添加 `openCodeSessionId` 字段
- 修复 `StorageService.saveConversation()` 保存正确的 session ID
- 修复 `loadConversations()` 正确读取 `openCodeSessionId`

**涉及文件：**
- `src/core/types/chat.ts`
- `src/core/storage/StorageService.ts`
- `src/main.ts`

#### 问题2：消息获取端点错误
**修复内容：**
- 端点从 `/session/:id/messages` 改为 `/session/:id/message`（单数形式）
- 修复 `sendMessage()` 使用 `/prompt_async` 异步端点

**涉及文件：**
- `src/core/opencode/OpenCodeService.ts`

### 5. 消息流式响应优化

**实现内容：**
- 修复轮询逻辑，持续轮询直到获取完整回复
- 支持增量更新，实时显示AI回复
- 改进超时处理（120秒超时）
- 添加详细调试日志

**涉及文件：**
- `src/core/opencode/OpenCodeService.ts` - `sendMessage()` 方法
- `src/features/chat/OpenCodianView.ts` - 消息渲染

**技术细节：**
- 轮询间隔：1秒
- 最大尝试次数：120次（2分钟）
- 检测到助手消息后，持续轮询直到内容不再变化

### 6. 模型切换生效修复

**问题：**
- 设置中选择 glm-4.6，实际使用 glm-5
- 请求体格式错误导致模型参数未生效

**修复内容：**
- 修正请求体格式为嵌套结构：
```json
{
  "parts": [...],
  "model": {
    "providerID": "zhipu-external",
    "modelID": "glm-4.6"
  }
}
```

**涉及文件：**
- `src/core/opencode/OpenCodeService.ts`

---

## 🔧 API 端点修正记录

| 功能 | 错误端点 | 正确端点 |
|------|----------|----------|
| 健康检查 | `/health` | `/global/health` |
| 获取消息 | `/session/:id/messages` | `/session/:id/message` |
| 发送消息 | `/session/:id/prompt` | `/session/:id/prompt_async` |
| 获取模型 | `/config/providers` | `/config/providers` ✅ |

---

## 📝 调试日志添加

为以下模块添加了详细控制台日志：

1. **OpenCodeService**
   - 会话创建：`[OpenCodeService] Creating session`, `Created session ID`
   - 消息发送：`[OpenCodeService] Sending message`, `Message sent successfully`
   - 消息获取：`[OpenCodeService] Getting messages`, `Messages response`
   - 模型获取：`[OpenCodeService] Raw providers data`

2. **OpenCodianView**
   - 消息流：`[OpenCodianView] Message stream started/stopped`
   - 内容接收：`[OpenCodianView] Received chunk`
   - 最终消息：`[OpenCodianView] Final message`

3. **Settings**
   - 模型加载：`[Settings] Current defaultModel`
   - 模型切换：`[Settings] Model changed to`, `Saved settings`

---

## 🐛 已知问题与解决方案

### 已修复的问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 消息加载 500 错误 | 使用了错误的会话ID | 正确存储和读取 `openCodeSessionId` |
| 端点 404 错误 | 端点路径错误（复数形式） | 改为单数形式 `/message` |
| 模型切换不生效 | 请求体格式错误 | 改为嵌套 `model` 对象格式 |
| 服务器状态显示错误 | 未检测外部服务器 | 添加外部服务器识别逻辑 |
| 模型列表为空 | 数据结构解析错误 | 支持两种 models 数据格式 |
| 历史会话按钮无效 | `showConversationHistory()` 为空实现 | 使用 `Menu` 组件实现完整下拉菜单 |

---

## 📊 当前功能状态

### ✅ 完全可用
- [x] 中文界面
- [x] 动态供应商/模型选择
- [x] 模型切换生效
- [x] 会话创建和管理
- [x] 发送消息
- [x] 实时流式响应
- [x] 服务器状态检测
- [x] 历史会话切换（点击 history 按钮弹出菜单）
- [x] Markdown 渲染（代码块、图片、链接、表格等）
- [x] 流式内容渲染（思考块、文本、工具调用）
- [x] 会话内模型切换（下拉框选择，悬停提示）

### 🚧 已知限制
- 外部服务器无法通过插件停止（需要手动在终端停止）
- 首次加载设置时需要手动刷新模型列表
- 消息历史依赖 OpenCode 服务器存储

---
