# Development Maintainability Rules

2026-09-10: catalog readiness is a core.config event, current usage recomputation belongs to the existing chat coordinator, and settings/details subscribe through their lifecycle. Keep numeric historical costs stable and use explicit tab billing identity. Windows tests must model native path/process/permission behavior deterministically; archive file identity uses exact bigint-derived strings.

> **Status**: active development guardrail.
> **Purpose**: keep routine feature work at the high-maintainability checkpoint reached after `R162`.

## Baseline

- `npm run verify:architecture` (owner-manifest / owner-boundaries / dependency-direction / architecture-cycles / architecture-approvals) must pass.
- `npm run check:module-docs` must pass.
- `npm run check:graphify` must pass after `src/` or config/tool envelope changes (content-addressed digest, Phase 2 Task 7).
- `npm run lint` must stay at `0 errors / 0 warnings`.
- `npm run typecheck` must pass.
- Full `npm test` must pass before merge.
- `npm run build` must pass before merge.
- Use `npm run verify` as the default local pre-merge command; it now runs the architecture gates (manifest/boundaries/dependency-direction/cycles/approvals), module-doc + owner-impact, content-addressed Graphify freshness, devlog order, lint, typecheck, tests and build.

## Ownership Rules

- Do not add new runtime ownership to `src/features/chat/OpenCodianView.ts`, `src/core/opencode/OpenCodeService.ts`, `src/main.ts`, or `src/core/opencode/ServerManager.ts`.
- When touching those files, prefer deleting assembly/import surface or moving stable responsibility into an existing adjacent owner.
- Owner boundaries are now evaluated by `npm run check:owner-boundaries` against the canonical `architecture-owners.config.json` (Phase 1 Task 4), replacing the retired hard-coded path guard. Local `verify`, pre-push, PR and push all use the same unified scope (`npm run verify:architecture`); protected CI remains the final non-bypassable gate. The old `OWNER_GUARD_APPROVED` / `--approved` free-text waiver is retired — budget waivers now require a structured diff-bound approval request validated by an external protected-CI authority (see `docs/architecture/approvals/README.md`).
- Composition-line growth inside a declared owner responsibility can pass; pass/fail is never based solely on added/removed line count. The net-line `maintainability-refactor` requirement is removed from active semantics.
- Do not add thin helper / adapter / provider / factory modules unless the module is reused in 3+ places or isolates a high-risk dependency.
- Do not move complexity sideways into more files without reducing ownership, import surface, or test responsibility.
- Prefer existing service / coordinator / runtime owners before creating new files.
- Canonical OpenCode `session/message/part` truth belongs in `src/core/opencode/OpenCodeSessionStateStore.ts`; do not reintroduce ad-hoc graph state inside `OpenCodeService.ts` or chat view-model code.
- For model-config modal UI work, prefer the existing `ModelConfigProviderEditor.ts` / `ModelConfigModelListEditor.ts` owners before growing `ModelConfigModal.ts` again.
- For trailing-assistant patch work, extend the coarse `trailingAssistantPatchPlanning.ts` / `trailingAssistantPatchExecution.ts` / `trailingAssistantPatchDebug.ts` / `trailingAssistantPatchTypes.ts` bundles instead of reintroducing one-off helper files.
- For provider icon work, extend `providerIconEntryResolution.ts` / `providerIconBuiltinSelection.ts` / `providerIconCustomSources.ts` / `providerIconAssetCache.ts` before regrowing `ProviderIconService.ts`.
- For style-settings work, extend `settingsStyleControls.ts` / `SettingsStylePresetSection.ts` / the existing background or input subsection owners before regrowing `SettingsStyleSection.ts`.
- `.opencodian-container` carries `container-type: inline-size` (R-F5), so it is a containing block for `position: fixed` descendants: a fixed child would be positioned against that container instead of the viewport. **This is a registered latent constraint, not a fixed bug** — as of 2026-09-21 the plugin owns no fixed-position descendant of that container. Every fixed overlay is mounted at `document.body` (`.opencodian-tooltip-layer` in `shared/TooltipLayerController.ts`, `.opencodian-image-preview-backdrop` in `features/chat/ui/ImagePreviewOverlay.ts`, `.opencodian-tab-overflow-menu` in `features/chat/tabs/TabBar.ts`, the portaled `.opencodian-settings-dropdown-menu`) or lives in the settings window (`.opencodian-agent-switcher-floating`). Before adding a fixed-position element inside the chat container, either mount it at `document.body` (the established pattern) or move the container-query anchor deliberately — do not assume viewport coordinates. Do not "narrow" the anchor casually: `src/style/base/core.css` currently has two unnamed container queries on this anchor: `@container (min-width: 640px)` drives the R-F5 session rail's visibility breakpoint, and `@container (max-width: 400px)` reflows the narrow Chat header into brand and tab/actions rows. Re-anchoring them to the messages shell would change when these layouts appear while moving the containment hazard one level down into a subtree that has more descendants.

## Backend settings boundary (2026-11-08)

`BackendSettingsControls` is shared by all six backend settings surfaces, and `BackendSettingsWorkspace` owns only non-secret, user-marked default snapshots. They do not own native backend state or replace configuration-file mutation services. The source/application metadata must reflect the backend's actual turn/session/reconnect boundary. Native archive restoration stays revision-checked; failed restore leaves the file unchanged. Plugin-default snapshots must not copy credentials, environment variables or raw native configuration into a second vault store. Task tabs and their legacy aliases remain in `settingsLayoutRegistry` rather than a parallel navigation registry.

## Feature Work Checklist

1. Identify the owner before coding: UI, runtime, OpenCode service, settings, storage, theme, or tests.
2. Keep new behavior local to that owner; avoid cross-domain callbacks or duplicate state.
3. Add or update focused tests for behavior changes.
4. Update matching `docs/modules/**` documentation when a module boundary changes.
5. For added / deleted / renamed modules, confirm `npm run check:module-docs` stays green so mapping coverage and diff accountability both hold.
6. Run `npm run verify` before merging.

## When To Pause

- A change requires adding a new helper layer that is not broadly reused.
- A change increases `OpenCodianView.ts`, `OpenCodeService.ts`, `main.ts`, or `ServerManager.ts` ownership instead of reducing it.
- Lint warnings appear and the fix is not obvious.
- Tests need assertions removed or weakened to pass.

In these cases, stop and design a small controlled queue or ask for review instead of continuing ad hoc.

## Pi service boundary

- `core.backend-pi` owns the external Pi RPC service boundary. Keep process transport, session metadata and event mapping in `src/core/agents/backend/pi/`.
- Do not import other backend implementations into Pi or move their responsibilities to the Pi service. Shared entrypoints only compose Pi settings/registration/model binding.
- Pi CLI is upgraded independently. Run `node scripts/pi-rpc-smoke.mjs` against the installed candidate; do not automatically update the CLI or rewrite Pi JSONL history from plugin code.

### Pi 独立 SDK 服务

Pi业务仅在core.backend-pi、专属工作台/UI主机和assets/pi中实现；共享入口按backend分流。29RPC/23SDK操作统一白名单、协议握手；SDK升级先运行完整能力验收。运行时设置内存隔离；禁止改变其余后端实现。

Pi持久配置不能用工作台命令数量代表覆盖。新增后端必须注册与已有后端一致的主标签及分组，区分官方SDK、终端专用和插件会话存储作用域；配置保存、运行时应用与状态读回分别验证。

## 2026-10-24 DSH 边界

DSH 协议准入/内容编码放在复用的 DshProtocolCodec；adapter 保留会话与生命周期真值。完整 DSH 设置区独立于后端总开关组合层，通过窄 host 连接；OpenCodianView 只转发会话保存/回读。测试将故障可控的 transport fixture 与生命周期/功能场景分开。不得为开启 aux/inline 而移除 fail-closed 只读证明，也不得将关闭会话当作删除历史。

2026-11-09：库级非敏感稀疏覆盖由类型化配置边界校验；启动合并真实继承 entry 后再物化全行 patch，保留逻辑插件名、命名 assertion 和相对 include 来源。按库隔离的本机 managed profile 持有扩展依赖和原生扩展字段，不写用户 SDK profile、全局安装或共享软链接目录。NativeControls 持有逐方法能力、session/client-generation fence 与有界脱敏输出；任务输出分页必须在源字节游标和跨块秘密脱敏之间保持一致。重连需要原生活动终态证据，idle 不等于无排队子任务。Todo 投影、Jobs 生命周期、Plan 状态与权限预设分别建模。设置 renderer 释放订阅；聊天视图仅补组合端口，原生任务生命周期归相邻 SessionInformationCoordinator。

DSH 重连必须先读同一 client/generation 的实时控制能力与 composition revision，再核对每个会话的 Goal、Jobs、子代理和终端活动；未提供方法不等于服务缺席，只有实时明确缺席才可跳过。官方可选终端 bundle 的隔离作用域保持原样，仅从已验证类身份、加载条目、所属组及 managed profile 解析其服务。新会话默认 Plan 是插件策略，只在首次发布新建或预留会话时应用并回读，不覆盖恢复或 fork。扩展字段取消覆盖要同时核对继承、有效值、用户层和严格修订变化；扩展操作结果必须保留 applied/restart-required/overridden/failed/cancelled 与更新恢复的差别。ACP 0.2.2-rc.1 忽略高级 MCP 逐服务参数，其编辑入口应标明仅 Native 生效，保留基础 ACP 声明。

2026-10-28：memory 的真实文件系统适配器及只读辅助能力绑定属于 app.memory-runtime；core.memory 只依赖 FS/model/embedding 端口。Read/Edit/Write 提取的高风险边界集中在 memoryAgentExtraction；新增后端不得复制一套记忆存储或回退到活动后端。

## 2026-10-30 标题所有权

标题生命周期、取消、revision、保存顺序和原生同步归 TitleGenerationService；TitleModelResolver 是六类模型目录/provider 边界的高风险依赖隔离。OpenCodianView 只组装模型快照和刷新标签/rail；禁止各后端偷偷借旧 OpenCode 生成标题。

## 会话工作台边界（2026-10-30）

- 后端 Goal 状态与自动续跑属于所选 native/具名 extension；共享缓存只投影，不调度。
- 会话工作台 coordinator 持有临时预备/确认、tab 身份和订阅；OpenCodianView 只装配。
- 宿主 PTY/Git 属于 WorkbenchHostRuntime，关闭工具视图不终止任务；主区域工具复用同一实例。
- 会话文件变更复用既有回退 owner，仓库状态独立；提交与创建 worktree 必须经用户明确操作。
- 2026-11-11：`SessionWorkbenchRepository` 在既有 feature.chat-ui owner 内完整隔离仓库表单、暂存／提交／工作树写入口及 snapshot／diff 的读取代际；`SessionWorkbenchTools` 单向组合它。该模块隔离会写仓库的高风险流程，不是转发薄层；不复制 Git 状态、不回依赖 Tools、不调整 lint 豁免。关闭视图使迟到读取失效；新一代刷新须补读尚未完成的差异。

## 会话信息 owner（2026-10-31）

原生只读接口归各 adapter；SessionInformationCoordinator 隔离多后端读取与身份竞态，SessionWorkbenchInformation 隔离 Markdown 子会话渲染生命周期。两者是状态/原生依赖和渲染边界，不是转发薄层。禁止将轮询、套餐/上下文口径或子会话状态放回 OpenCodianView。

## 2026-11-02 ZCode task settings

ZCode 设置 UI 不实现 OAuth 或直接读写个人配置；账号 owner 与 API 配置 owner 分离。凭据独立、本机多库共享；API 与原生应用共享。新增展示组件必须复用 Setting/surface tokens 与现有目录，不镜像原生模型。
