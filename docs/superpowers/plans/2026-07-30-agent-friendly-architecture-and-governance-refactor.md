# OpenCodian Agent-Friendly Architecture and Governance Refactor Plan

> **Status:** proposed implementation plan, revised after independent ZCode and Kimi K3 adversarial reviews; no runtime change is authorized by this document alone.
>
> **Implementation style:** execute phase by phase. Every code-bearing task starts with characterization or failing gate tests, preserves current behavior, and ends with focused checks plus `npm run verify`.
>
> **Supersedes for architecture work:** the active planning role of `docs/status/maintainability-master-plan.md`, `docs/status/maintainability-lane-map.md`, `docs/status/maintainability-round-roadmap.md`, and the generic thick-owner autopilot plans. Their historical evidence remains useful, but they must not run in parallel as another architecture roadmap after Phase 6.

## Goal

把 OpenCodian 从“依靠少数超大文件、人工记忆和路径特判来维持秩序”重构为“owner 边界可查询、依赖方向可验证、变更范围可信、例外可审计、行为切片可独立测试”的项目，使 coding agent 能快速回答以下问题：

1. 这项改动属于哪个 owner？
2. 应从哪个入口开始读，哪些文件不该动？
3. 允许依赖哪些相邻 owner，禁止跨越哪些边界？
4. 需要更新哪些测试、模块文档和生成物？
5. 当前 diff 的真实 merge-base、已提交、暂存、未暂存和未跟踪范围是什么？
6. 如果必须触碰高风险 shell，什么是可豁免的预算，什么是永远不可豁免的架构/安全不变量？

## Core Decision

采用**粗粒度、完整行为 owner**，不采用微服务化，也不采用“一回调一个文件”的碎片化拆分。

- owner 是一个能独立描述职责、入口、状态、依赖、测试和生命周期的行为单元。
- 文件行数、import 数和图中心度是观察指标，不是单独的合并判据。
- 新模块必须拥有完整行为切片、被三处以上复用，或隔离高风险外部依赖；否则优先并入现有 owner。
- `main.ts`、`OpenCodianView.ts`、`OpenCodeService.ts` 等 shell 可以被修改，只要修改符合其声明职责、没有新增禁止依赖/循环/重复真相，并通过相应合同测试；不再要求每次逐文件净删行。
- owner manifest 是机器可读的唯一架构事实源；AGENTS、门禁、`inspect:owner` 和生成文档都消费它，不再维护平行的手写 owner 地图。

## Non-Goals

- 不做一次性 big-bang rewrite。
- 不为了降低行数复制状态、回调或生命周期到更多文件。
- 不把 OpenCode、Codex、Claude Code 强行抹平成一个丢失后端语义的 mega interface。
- 不在门禁迁移阶段顺手改变聊天、trace、provider、配置或存储行为。
- 不把 Graphify 或 module docs 删除；它们分别保留 graph 与 source-to-doc 责任，并与 owner inspector 组合而不复制 owner facts。
- 不承诺第一批就清零全部历史 type coupling；先正确区分 runtime/type edge、禁止新增反向边和 runtime SCC，再按稳定切片偿还基线债务。
- 不允许 approval 绕过安全脱敏、聊天主路径隔离、依赖方向、新 runtime cycle/type-coupling expansion、重复 canonical state、测试、文档或生成物门禁。

## Current Evidence Baseline (2026-07-30, `bb788051`)

### Repository scale

- `src/`：543 个 TypeScript 模块，230,179 行。
- module docs：576 个 source module / 576 个 mapped doc，coverage gate 当前通过。
- `docs/status/maintainability-phase-N.md`：497 份编号 phase 文档，共 36,378 行；另有 6 份 model-config maintainability phase 文档。
- 历史维护文档同时使用 phase、git round、roadmap `Rxxx` 与多套 autopilot lane 编号，agent 默认阅读成本过高。

### Hotspots

| Surface | LOC | Graphify evidence |
|---|---:|---|
| `src/core/agents/backend/ClaudeCodeAdapter.ts` | 6,067 | `ClaudeCodeAdapter` 209 edges |
| `src/features/chat/OpenCodianView.ts` | 5,053 | `OpenCodianView` 296 edges，cohesion 0.02 |
| `src/core/opencode/OpenCodeService.ts` | 2,043 | `OpenCodeService` 176 edges，cohesion 0.02 |
| `src/features/settings/SettingsDebugSection.ts` | 1,526 | 同时拥有五个 debug source tab、三后端 trace workbench 与插件导出动作 |
| `src/main.ts` | 1,316 | `OpenCodianPlugin` 250 edges；直接构造三种 trace service |

### Dependency debt

Graphify 当前报告 14 条**混合 import SCC**，包括：

- `StorageService -> main.ts -> storage/index -> StorageService`
- `PluginRuntimeCoordinator -> OpenCodianView -> main.ts -> PluginRuntimeCoordinator`
- `PluginRuntimeCoordinator -> OpenCodianView -> TitleGenerationService -> main.ts -> PluginRuntimeCoordinator`
- OpenCode streaming/lifecycle、chat background-task 和 send-pipeline 的混合类型/值依赖环。

独立审查确认这 14 条 SCC 每条至少含一条 type-only edge，因此不能直接称为 runtime cycle。全仓指向 `src/main.ts` 的 57 处 import 当前也全部是 `import type`；真实债务是跨层类型耦合，以及 `PluginRuntimeCoordinator.ts` 从 `core` runtime import `features/chat` 等反向值依赖。后续门禁必须分别建模 runtime edge、type-only edge、dynamic import 和 `require()`，不能复刻 Graphify 的混合结论。

### Current owner-guard failure modes

`scripts/owner-guard-lib.mjs` 只硬编码四个路径：

- `src/features/chat/OpenCodianView.ts`
- `src/core/opencode/OpenCodeService.ts`
- `src/main.ts`
- `src/core/opencode/ServerManager.ts`

已确认的问题：

1. 本地默认 range 是 `HEAD`；提交后干净 tree 会得到“无改动”。
2. CI push 使用 `HEAD`，可能只看到空工作区；PR 才使用 `origin/<base>...HEAD`。
3. module-doc diff script 在 package script 中硬编码 `--range HEAD`，PR 也可能只验证最后一个 commit。
4. ownership 依赖 Map/Set/timer/listener 等正则猜测，无法理解真实 owner 或依赖方向。
5. `maintainability-refactor` 要求所有 touched guarded files 逐文件 removed > added，诱导 line-count theater。
6. approval 是自由文本，不能绑定 rule、path、diff digest、期限或证据。

### Current Graphify failure mode

`npm run check:graphify` 当前通过，最新 `src` commit 与 graph artifact commit 都是 `bb788051`；但 `GRAPH_REPORT.md` 仍写 `Built from commit: 921a9742`。当前 gate 比较 commit timestamp/mtime，不证明报告内容对应当前 source tree。

## Agent-Friendly Engineering Principles

### P1. One canonical owner graph

架构 owner、layer、入口、依赖和测试责任只在 `architecture-owners.config.json` 中定义。source -> module-doc 的路径映射继续只由 `module-docs.config.json` 定义；owner manifest 不复制 mapped-doc glob，`inspect:owner` 组合读取两者。其他入口只引用或生成，不复制事实。

### P2. Complete behavior slices

owner 至少要覆盖以下生命周期中的一个完整闭环：

- input -> validation -> state transition -> output；
- construct -> start -> observe -> flush/dispose；
- render -> interact -> persist -> refresh；
- request -> transport -> normalize -> recover。

只有 DTO、单一透传回调或名字好看的空壳不构成 owner。

### P3. Ports instead of plugin-shaped access

consumer 在自己一侧声明窄 port；`OpenCodianPlugin` 结构化满足这些 port。`core` / `features` 不 import `main.ts`，也不通过完整 plugin 实例读取任意服务。

### P4. Truth has one home

每个 owner manifest 条目必须声明 canonical state。跨 owner 只能读快照、命令或事件，不得复制可写 Map/Set/cache 作为第二真相。

### P5. Hard invariants and budgets are different

- hard invariant：依赖方向、新 runtime cycle/type-coupling expansion、canonical state 唯一性、安全边界、测试/文档/生成物一致性；不可 approval。
- review budget：热点 shell 增长、公开入口增加、临时 boundary exception；只能由 diff-bound request + 仓外受保护 review 放行。

### P6. Change scope is a first-class artifact

所有 diff-aware gate 使用同一个 scope：merge-base..HEAD + index + worktree + untracked files。任何 gate 不得自行猜另一个 range。

### P7. Characterize before moving

重构只移动已由 characterization tests 固化的行为。若无法先写出合同测试，说明 owner 边界尚未理解，应停止而不是继续抽文件。

### P8. Navigation before narration

agent 默认入口是 `npm run inspect:owner -- <path|symbol>`。长篇历史状态文档进入 archive，不再要求每轮全读。

## Target Layering

```text
shared owners in src/shared, src/types, src/i18n, src/vendor, selected src/utils
        |  no dependency on core/features/app/main
        v
core owners in src/core and any utility owner with core runtime dependencies
        |  domain/backend/infrastructure owners; no feature/app/main imports
        v
src/features
        |  UI/use-case owners; consume core through narrow ports
        v
src/app + src/main.ts
           composition, Obsidian registration, lifecycle wiring only
```

Additional rules:

- `src/vendor/**` 只包装 vendored/high-risk dependency，不 import product feature。
- layer 由 owner 条目声明，不由顶层目录机械决定；`src/utils/**` 必须按真实 runtime 依赖逐 owner 分类。shared utility 若仍有向上的 type-only edge，先记录 type-coupling debt，再把中性类型下沉。
- `src/style/**` 不持有 runtime state。
- `src/main.ts` 允许构造、注入、注册、start/stop；禁止实现 feature-specific branching、trace report logic、chat state 或 settings panel behavior。
- `features/chat`、`features/settings` 各自在 consumer side 定义 host ports；不建立一个共享的 `OpenCodianPluginFacade` mega interface。
- layer gate 在 Phase 1 先锁定 baseline exception；Phase 2 起禁止新增，之后逐条删除 exception。

## Canonical Owner Manifest

### Location

`architecture-owners.config.json`

### Matching semantics

- 每个受管 source path 必须命中**恰好一个** owner。
- 正式 owner 不使用隐式 priority；0 match 或多 match 都失败，迫使边界显式。
- `include` 使用 repo-relative glob。禁止无说明的 raw `exclude`；若粗 owner 必须把子树让给细 owner，使用结构化 `delegatesTo`，并验证被让出的每个 path 恰好由目标 owner 接管。
- Phase 0 bootstrap 可使用 `legacy.unassigned.explicitPaths`，但只能列出精确文件、不能使用 glob、不能接收新文件、数量只能单调下降，并在进入 Phase 1 前清零。
- generated artifacts 与纯样式由显式 scope 排除，不靠隐含目录白名单。
- schema 必须拒绝 unknown keys；禁止像当前 `module-docs.config.json` 顶层游离 mapping 一样静默忽略配置漂移。

### Required schema

```json
{
  "schemaVersion": 1,
  "sourceScopes": ["src/**/*.ts", "src/**/*.tsx"],
  "layers": [
    {
      "id": "shared",
      "mayImportLayers": ["shared"]
    },
    {
      "id": "core",
      "mayImportLayers": ["shared", "core"]
    },
    {
      "id": "feature",
      "mayImportLayers": ["shared", "core", "feature"]
    },
    {
      "id": "app",
      "mayImportLayers": ["shared", "core", "feature", "app"]
    }
  ],
  "owners": [
    {
      "id": "app.diagnostics-runtime",
      "layer": "app",
      "include": ["src/app/diagnostics/**"],
      "delegatesTo": [],
      "responsibilities": [
        "construct backend trace services",
        "own diagnostics registry lifecycle",
        "flush and dispose all diagnostics"
      ],
      "canonicalState": ["backend diagnostics service registry"],
      "entrypoints": ["DiagnosticsRuntimeCoordinator"],
      "allowedOwnerDependencies": [
        "core.opencode-diagnostics",
        "core.agent-backend-diagnostics"
      ],
      "forbiddenDependencies": ["feature.chat-shell", "feature.settings-shell"],
      "adjacentOwners": ["feature.chat-diagnostics", "feature.settings-debug"],
      "tests": ["tests/unit/app/diagnostics/**"],
      "overviewDoc": "docs/architecture/owners/app-diagnostics-runtime.md",
      "requiredGates": ["diagnostics-safety", "typecheck", "module-docs"],
      "risk": "high"
    }
  ],
  "legacy": {
    "unassigned": {
      "explicitPaths": [],
      "mustReachZeroBeforePhase": 1
    }
  },
  "dependencyExceptions": []
}
```

### Initial owner granularity

Phase 0 应以现有行为边界和 module-doc 目录为线索建立 coarse owners，而不是 543 个 file owners；“20-40”只是初始观测范围，不是门禁配额。Task 1A 先允许受限的 explicit unassigned 清单跑通 schema，Task 1B 按域完成归类并在 Phase 1 前把 unassigned 清零。首批必须显式覆盖：

- app composition/runtime
- shared diagnostics
- OpenCode diagnostics/runtime/config/server
- Codex/Claude backend transport、adapter、diagnostics
- chat shell、send pipeline、conversation sync、background task、diagnostics
- settings shell、debug、backend configuration、model catalog、style
- storage、update、icons、i18n/vendor utilities

### Dependency exceptions

owner manifest 的 `dependencyExceptions` 只保存债务的治理元数据；当前反向 edge 与 SCC 的精确证据写入内容寻址的生成文件 `architecture-baseline.generated.json`。该文件由工具生成、禁止手改，不构成第二套 owner 事实源。每条 exception 必须包含：

- stable id
- generated baseline edge/SCC id；edge id 使用 from path、to path、edge kind 与 specifier，不使用易漂移行号
- rule id
- reason
- characterization tests
- retirement phase
- expiry date

exception 只能引用 frozen baseline 中已存在的精确 edge/SCC；任何扩大匹配范围或新增 edge 都失败。偿还债务时通过专用 retire 命令重生成 baseline 并删除对应 exception，普通 feature diff 不得刷新 baseline。

## Governance 2.0

### Unified change scope

新增 `scripts/change-scope-lib.mjs` 与 `scripts/run-verify.mjs`：

1. PR：使用 GitHub base ref，解析 merge-base，固定 full SHA。
2. push：使用 event `before` / `after` SHA；用现有 `ZERO_SHA_PATTERN` 识别新分支事件，base 来源依次为 event repository default branch、repo 配置的 `defaultBaseRef`、显式 CLI 参数，不能退化为 `HEAD` 或猜任意 remote。
3. local：`npm run verify -- --base origin/main`；若省略，runner 可以解析已配置 upstream/main，但必须打印 resolved base/head/merge-base，无法解析时 fail closed。
4. scope artifact 同时保存 committed、index、workspace 三个 candidate view；每个 view 都从 merge-base 计算最终 path snapshot，workspace view 叠加 HEAD + index + worktree + untracked。普通 hard gate 必须检查所有不同 candidate，不能让 staged 内容被安全的 worktree 内容遮盖。
5. digest 不哈希原始 `git diff` 文本，而对排序后的 `(path, finalStatus, mode, contentSha256)` 记录哈希；rename 规范化为 delete + add。相同文件最终状态在 committed、staged、unstaged、untracked 四种形态下必须得到相同 candidate digest。
6. runner 创建临时 JSON scope artifact，并通过环境变量传给所有 diff-aware gates；运行结束删除。

任何 non-empty branch diff 被报告为 “No changed paths detected” 都是 gate bug，测试必须覆盖。

### Owner guard 2.0

旧 `check:owner-guard` 在 Phase 1 内保留为 deprecated alias，但必须在 Task 9 完成时删除；双轨期从 Task 4 merge 起不得超过 30 天，且 Phase 3 runtime pilot 不得在旧 guard 仍 active 时开始。最终由以下 gate 取代：

- `check:owner-manifest`：strict schema、unknown-key rejection、100% coverage、exactly-one owner、入口/测试/owner-overview 路径存在。
- `check:owner-boundaries`：changed owner 与依赖/状态/entrypoint 变化符合 manifest。
- `check:dependency-direction`：runtime-static、runtime-dynamic、`require()` 与 type-only edge 分别报告并符合 layer/owner allowlist；动态 specifier 不能解析时 fail closed 或引用精确登记项。
- `check:architecture-cycles`：只把纯 runtime SCC 当作 runtime cycle hard gate；type-only/mixed SCC 单独作为 type-coupling debt 报告。两类基线都禁止新增成员，但不得把 type-only 环描述成运行时环。
- `check:change-scope`：所有 gate 使用相同完整范围。

新的判定不要求 guarded file 净删行。以下情况可正常通过：

- shell 内增加符合声明职责的 composition wiring；
- 用更清楚的代码替换更短但隐晦的代码；
- 在 owner 内增加测试驱动的完整行为，同时不跨界。

以下情况即使净删行也失败：

- 把状态复制到第二 owner；
- 新增反向 runtime/type import 或 runtime cycle；
- 把一个完整责任拆成多个无独立生命周期的薄 adapter/factory；
- 通过 dynamic access/service locator 绕过 port。

### Structured approval

仓内 JSON 无法证明“批准者不是写代码的 agent”。因此 `docs/architecture/approvals/<id>.json` 只是**approval request + diff binding**，不是信任根；它替代环境变量自由文本，但不能单独让 gate PASS。至少包含：

```json
{
  "schemaVersion": 1,
  "id": "2026-07-30-main-composition-touch",
  "rules": ["BUDGET_HOTSPOT_GROWTH"],
  "paths": ["src/main.ts"],
  "baseSha": "<full sha>",
  "scopeDigest": "sha256:<normalized diff digest>",
  "reason": "composition-only wiring for diagnostics runtime",
  "evidence": ["tests/unit/app/diagnostics/DiagnosticsRuntimeCoordinator.test.ts"],
  "requestedBy": "agent",
  "authorityPolicy": "protected-review",
  "expiresAt": "2026-08-06T00:00:00Z",
  "singleUse": true
}
```

Gate 必须重算 committed candidate digest；approval 只允许在 index/worktree clean 时生效。diff 变化、路径超集、rule 不匹配、过期或复用都失败。request 文件本身必须在 scope 内，便于 code review 与 git history 审计。`singleUse` 还要求 request 文件相对 merge-base 是新增文件；已存在于 base history 的 request 不能再次生效。

信任根来自仓外：PR CI 必须验证受保护 environment 的 required reviewer 或 CODEOWNERS/host API 返回的授权 review identity，并把 identity/reference 写入 gate 输出；用户可编辑的 JSON 不保存 `approvedBy`。本地 gate 只能返回 `REVIEW_REQUIRED`，不得声称 merge-ready；pre-push 可以上传该请求，但最终 merge gate 必须在受保护 CI 上完成。直接提交 main 的流程没有可验证的人类 approval 时，不允许使用 budget waiver，只能重新设计为无需 approval 的改动。此机制只防误用和未经 review 的合并，不声称能抵抗拥有仓库管理员权限的恶意 actor。

永远不可 approval 的规则：

- `DEPENDENCY_DIRECTION`
- `NEW_ARCHITECTURE_CYCLE`
- `DUPLICATE_CANONICAL_STATE`
- diagnostics redaction/chat isolation 等 security/availability contract
- test/module-doc/Graphify freshness

### Graphify freshness 2.0

新增 deterministic graph-input digest。输入不是只有 `src/**`，而是：排序后的 repo-relative `src` path + file bytes、解析后的 `tsconfig*.json` extends 链、`package.json`、`package-lock.json`、`.gitignore`、`.graphifyignore`（若存在）、Graphify wrapper 脚本和实际 Graphify 工具版本；排除 transient `src/graphify-out`。采用 byte digest 是有意的保守策略，注释改动也要求刷新图。

- `npm run graphify:update:src` 生成 `graphify-out/input-manifest.json`。
- wrapper 重写报告 freshness block，记录 `Source digest`、生成时间与 informational `HEAD at generation`。
- `check:graphify` 重算当前 graph-input digest；digest 不等即失败。可复用 Graphify 自身 per-file `ast_hash` 作为明细，但不能遗漏 config/tool-version envelope。
- commit timestamp、mtime 和 “Built from commit” 不再作为正确性依据。
- 工作区改动、暂存改动、已提交未推送改动都由内容 digest 一致处理。

### Module docs 2.0

保留 576/576 路径覆盖，但 owner 语义只来自 manifest：

- manifest 变更时，checker 计算受影响 owner 与 mapped module docs。
- changed source 的 mapped doc 必须同 scope 更新，不能只看最后一个 commit。
- 新增 owner 必须有 owner-level rationale/invariants overview；新增/删除/rename module 继续更新 aggregate index。
- 不用四个固定 prose heading 冒充“semantic validation”。checker 只验证路径、引用、owner overview 存在与 diff accountability；依赖、测试和 gate 列表由 `inspect:owner` 从 manifest 实时生成，不复制到 576 份 prose 文档。
- module docs 只记录难以机器表达的行为语义、fallback 与为何如此；自动化不能证明散文真实，code review 仍对内容负责。
- `module-docs.config.json` 继续唯一拥有 source -> mapped-doc 关系；owner manifest 只保存一个 owner-level `overviewDoc`。两份配置都使用 strict schema/unknown-key rejection。

### CI and hooks

目标命令：

```text
npm run inspect:owner -- <path|symbol> [--json]
npm run verify:architecture -- --base <ref>
npm run verify -- --base <ref>
```

`npm run verify` 顺序：

1. change scope
2. owner manifest / boundaries
3. dependency direction / cycles
4. module docs
5. Graphify digest
6. devlog order
7. lint
8. typecheck
9. affected focused tests（提示/快速失败）
10. full tests
11. production build
12. generated styles clean check（现有 `git diff --exit-code -- styles.css` 也消费同一 scope/candidate 语义）

pre-push 与 CI 调用同一 runner；不得各自拼不同 range。

## Runtime Pilot: Diagnostics Vertical Slice

Diagnostics 是第一条试点，因为三后端已存在共享 foundation。三种 service construction 当前共址于 `main.ts`，但没有独立 owner，构造/注入/dispose 样板重复；chat routing 与 settings rendering 则分别散落在 `OpenCodianView.ts` 和 `SettingsDebugSection.ts`。这里有明确的安全/可用性合同，适合作为纵向迁移试点。

### Target owners

#### `app.diagnostics-runtime`

`DiagnosticsRuntimeCoordinator`：

- 构造 OpenCode/Codex/Claude trace service；
- 注入 settings getters、vault path、known secrets、runtime metadata；
- 注册 typed backend diagnostics ports；
- 统一 flush/dispose；
- main 只保留一个 coordinator 字段与 start/stop wiring。

不把三后端事件 schema 或 service 内部状态合并。

#### `feature.chat-diagnostics`

`ChatDiagnosticsCoordinator`：

- 组合现有 Codex/Claude host adapter 与 OpenCode chat diagnostics；
- 统一 header state、menu route、arm/claim/cancel、report/export 与 tab-cleanup capture-cancel seam；
- 所有 public hook 继续 best-effort/try-catch，trace bug 不得逃逸到 send/RPC/chat path；
- `OpenCodianView` 只依赖一个窄 `ChatDiagnosticsPort`，不直接访问 trace service/store/report builder。

当前 delete-conversation 路径没有 trace flush/cancel 交互；characterization 必须固化“无交互”现状，不能为了抽 coordinator 发明一个不存在的 seam。OpenCode inline export 与 Codex/Claude adapter 的 flush 行为也不同，结构重构默认逐后端保留差异，统一语义只能作为另一个显式行为变更。

#### `feature.settings-debug`

`SettingsDebugSection` 已经拥有 tab shell/router，并继续保留它以及 plugin/export tab。三个 backend panel 分别拥有完整 render/settings/status/actions/catalog 生命周期：

- `OpenCodeDebugPanel`
- `CodexDebugPanel`
- `ClaudeCodeDebugPanel`

每个 panel 接收 typed settings/diagnostics port 与 persistence callback，不接收完整 `OpenCodianPlugin`。Claude panel 必须同时保留 console debug channels 与独立 session trace controls。

旧 non-tabbed `attach` 路径当前遗漏 Codex。Task 10 必须先证明该路径是否仍可达：若可达，把遗漏作为单独 bugfix 设计；若不可达，另开 cleanup 删除。Task 13 不得在纯重构 commit 中静默“修好”或永久固化这项不一致。

### Diagnostics invariants

迁移前先固化：

- 所有 disk/console/clipboard/export payload 经过 redactor；knownSecrets getter 动态有效。
- trace disabled、service absent、observer absent 时行为不变。
- 所有 chat/send/observer hook fail closed，不影响用户聊天。
- OpenCode 现有 diagnostics 测试不修改语义。
- 三后端 storage path、阈值、trace id 和 retention 不改变。
- unload、reload、clear/export 和 tab cleanup 的逐后端 flush/dispose/cancel 行为不改变；delete-conversation 当前无 trace 交互。
- plugin export 动作的文件名、编码、排序与内容 byte-for-byte 不变。

## Phased Implementation

## Phase 0 — Canonical ownership and measurements (no runtime changes)

### Task 1A: Bootstrap strict owner manifest tooling

**Files:**

- Create: `architecture-owners.config.json`
- Create: `scripts/architecture-owner-lib.mjs`
- Create: `scripts/check-owner-manifest.mjs`
- Create: `tests/unit/infrastructure/architecture-owner-lib.test.mjs`
- Create: `docs/architecture/owner-model.md`
- Create: `docs/architecture/owners/README.md` and initial owner overview pages
- Modify: `package.json`

**Steps:**

- [ ] Write failing fixtures for unknown keys, zero-owner, ambiguous-owner, invalid delegation, glob-based unassigned, missing entrypoint/test/overview path, duplicate canonical state, and expired dependency exception.
- [ ] Implement strict schema loading, glob matching, structured delegation and exactly-one owner coverage.
- [ ] Populate unambiguous coarse owners first；未分类文件只能进入精确 `legacy.unassigned.explicitPaths`，新文件不得进入该清单。
- [ ] Add `npm run check:owner-manifest` and make its JSON output stable for other tools.
- [ ] Run infrastructure tests, owner manifest check, module-doc coverage and `git diff --check`.

**Acceptance:** 100% path accounted for（real owner + explicit unassigned）；0 ambiguous owners；0 unknown keys；unassigned baseline 被锁定且只能减少。

### Task 1B: Classify every legacy-unassigned path

**Files:**

- Modify: `architecture-owners.config.json`
- Extend: owner fixtures and `docs/architecture/owner-model.md`
- Create/update: classified owners' `docs/architecture/owners/*.md` overview pages

**Steps:**

- [ ] 按 app/shared/OpenCode/backend/chat/settings/storage 等域分批归类，每批单独 review。
- [ ] 对 nested ownership 使用 `delegatesTo`，禁止靠匿名 exclude 链模拟不可见优先级。
- [ ] 明确每个 `src/utils` owner 的 runtime layer；向上 type-only edge 进入后续 generated debt baseline，不因此把 runtime layer 错归为 core。
- [ ] 每批运行 owner manifest、module-doc coverage 与 inspector fixtures。

**Acceptance:** `legacy.unassigned.explicitPaths` 为 0；Phase 1 不得在非零状态开始；initial owner count 由实际边界决定而非预设配额。

### Task 2: Add the agent owner inspector

**Files:**

- Create: `scripts/inspect-owner.mjs`
- Create: `tests/unit/infrastructure/inspect-owner.test.mjs`
- Modify: `package.json`
- Modify: `AGENTS.md`

**Steps:**

- [ ] Write golden tests for representative chat, settings, OpenCode, Codex, Claude, storage and main paths.
- [ ] Resolve a path directly; for a symbol, use CodeGraph query output and then resolve its file owner.
- [ ] Print owner, responsibility, canonical state, entrypoints, allowed/forbidden dependencies, adjacent owners, tests, owner overview, mapped module doc（从 module-doc config 派生）, risk, active exceptions and required gates.
- [ ] Support `--json` for agents and `--explain` for humans.
- [ ] Replace long AGENTS hot-path lists with the inspector command plus a short fallback map.

**Acceptance:** representative queries resolve one owner and actionable focused gates without reading a phase history document。

## Phase 1 — Trustworthy diff and architecture gates (no runtime changes)

### Task 3: Implement unified change scope

**Files:**

- Create: `scripts/change-scope-lib.mjs`
- Create: `scripts/check-change-scope.mjs`
- Create: `scripts/run-verify.mjs`
- Create: `tests/unit/infrastructure/change-scope-lib.test.mjs`
- Modify: `package.json`

**Steps:**

- [ ] Create temp-repo tests for branch commits, staged, unstaged, untracked, rename/delete, detached HEAD, missing remote and GitHub new-branch push.
- [ ] Compute immutable base/head/merge-base SHA plus committed/index/workspace candidate snapshots and unioned path/status records.
- [ ] Hash normalized `(path, finalStatus, mode, contentSha256)` records；rename 使用 delete+add；approval request metadata 从自身 digest 中排除。
- [ ] Add equivalence tests proving the same logical final tree in committed/staged/unstaged/untracked forms yields the same candidate digest, while divergent index/workspace candidates are both checked.
- [ ] Make direct gate invocation require an explicit scope artifact or explicit base/head.
- [ ] Make verify runner create one temporary scope artifact and pass it to every diff-aware gate.

**Acceptance:** a non-empty `origin/main...HEAD` can never become Class A “no changes” merely because worktree is clean。

### Task 4: Replace path guard with owner-boundary evaluation

**Files:**

- Create: `scripts/check-owner-boundaries.mjs`
- Extend: `scripts/architecture-owner-lib.mjs`
- Create: `tests/unit/infrastructure/owner-boundaries.test.mjs`
- Modify: `scripts/check-owner-guard.mjs`（deprecated compatibility alias）
- Modify: `package.json`

**Steps:**

- [ ] Write tests proving line growth inside declared composition can pass and line deletion with duplicated state can fail.
- [ ] Evaluate owner changes, public entrypoints, state signals and new owner dependencies against manifest.
- [ ] Keep thin-layer detection as a review hint, not a filename-based blocker. Consumer-owned type-only port 若消除完整 plugin/main dependency，不算 runtime forwarding shim；若只有透传函数且没有独立合同，仍视为碎片。
- [ ] Remove `maintainability-refactor` net-line requirement from active semantics.
- [ ] Preserve the old command as an alias only until Task 9；记录 Task 4 merge 时间并强制 30-day expiry。

**Acceptance:** no hard-coded four-file list；no pass/fail based solely on added/removed line count。

### Task 5: Enforce dependency direction and cycle baseline

**Files:**

- Create: `scripts/typescript-import-graph.mjs`
- Create: `scripts/check-dependency-direction.mjs`
- Create: `scripts/check-architecture-cycles.mjs`
- Create: `scripts/update-architecture-baseline.mjs`
- Create: `tests/unit/infrastructure/typescript-import-graph.test.mjs`
- Generate: `architecture-baseline.generated.json`
- Modify: `architecture-owners.config.json`
- Modify: `package.json`

**Steps:**

- [ ] Use the TypeScript compiler API to classify `runtime-static`, `runtime-dynamic`, `require`, `type-only` and re-export edges；解析 path alias/barrel，无法解析的 internal/dynamic specifier fail closed。
- [ ] Characterize the existing dynamic sites（currently Codex adapter, Claude SDK loader, main dynamic config load and TraceRedactor require）and require exact manifest registration where static resolution is impossible.
- [ ] Generate a frozen, content-addressed baseline with stable file-edge and SCC ids；manifest exceptions reference those ids and ordinary diffs cannot refresh the baseline.
- [ ] Run runtime SCC detection separately from type/mixed coupling；the current 14 Graphify SCCs must not be imported wholesale as runtime debt.
- [ ] Fail on a new reverse-layer runtime or type edge, expanded exception, unresolved internal import, new runtime SCC, or new member in a baseline type-coupling SCC.
- [ ] Report owner-to-owner edges first and raw file edges second so agents see the correct repair location.
- [ ] Add `verify:architecture` combining Tasks 1, 3, 4 and 5.

**Acceptance:** baseline runtime/type debt may remain but is precisely classified；new reverse edges and runtime cycles are non-waivable blockers；type-only SCC is never reported as runtime cycle。

### Task 6: Add structured, diff-bound approvals

**Files:**

- Create: `scripts/architecture-approval-lib.mjs`
- Create: `scripts/check-architecture-approvals.mjs`
- Create: `tests/unit/infrastructure/architecture-approval-lib.test.mjs`
- Create: `docs/architecture/approvals/README.md`
- Modify: `scripts/check-owner-boundaries.mjs`

**Steps:**

- [ ] Test wrong path/rule/base/digest, dirty workspace, expired, reused, oversized and agent-fabricated requests without external authority.
- [ ] Validate exact committed candidate digest and single-use request semantics.
- [ ] Limit approval to explicitly waivable budget rules.
- [ ] Reject any approval naming a hard invariant.
- [ ] In protected CI, validate required-reviewer/CODEOWNERS identity from the host rather than a JSON string；locally return `REVIEW_REQUIRED` and document the non-authenticating threat model.
- [ ] Delete support for `OWNER_GUARD_APPROVED` in Task 9, no later than 30 days after Task 4 merge and before Phase 3.

**Acceptance:** protected CI can answer exactly which external review approved what committed candidate for which rule and until when；a repo-writable JSON alone can never produce PASS。

## Phase 2 — Graphify, module docs, CI, and documentation truth

### Task 7: Make Graphify freshness content-addressed

**Files:**

- Create: `scripts/graph-input-digest.mjs`
- Create: `tests/unit/infrastructure/graph-input-digest.test.mjs`
- Modify: `scripts/update-graphify-src.mjs`
- Modify: `scripts/check-graphify-freshness.mjs`
- Generate: `graphify-out/input-manifest.json`
- Regenerate: `graphify-out/GRAPH_REPORT.md`, `graphify-out/graph.json`

**Steps:**

- [ ] Test deterministic path ordering, byte changes, rename/delete, working tree, transient-output exclusion, tsconfig extends, package/lock changes, ignore rules, wrapper changes and Graphify version changes.
- [ ] Write graph-input digest during graph update and patch the report freshness block；可包含 Graphify per-file `ast_hash` 明细。
- [ ] Replace timestamp/mtime comparison with digest equality.
- [ ] Keep commit SHA informational only.
- [ ] Prove the current `921a9742` metadata mismatch can no longer pass.

**Acceptance:** `check:graphify` passes iff artifacts identify the exact current source/config/tool input envelope；comment-only source changes conservatively require refresh by design。

### Task 8: Make module-doc checks owner-aware and scope-correct

**Files:**

- Modify: `scripts/module-doc-guard-lib.mjs`
- Modify: `scripts/check-module-doc-diff.mjs`
- Create: `scripts/check-module-doc-owner-impact.mjs`
- Modify: `tests/unit/infrastructure/module-doc-guard-lib.test.mjs`
- Modify: `module-docs.config.json`
- Modify: `package.json`

**Steps:**

- [ ] Consume the unified scope artifact instead of `--range HEAD`.
- [ ] Derive affected owner overview from manifest changes and mapped module docs from `module-docs.config.json`; do not duplicate mapped-doc globs in the manifest.
- [ ] Make module-doc config parsing strict and add a regression fixture for unknown/top-level stray mappings.
- [ ] Fail if an owner boundary changes without owner overview and mapped docs updates.
- [ ] Keep 576/576 coverage at or above baseline.

**Acceptance:** a multi-commit PR cannot hide an undocumented source change in an earlier commit；checker 不以固定 prose headings 假装验证语义真实性。

### Task 9: Unify CI, pre-push, and verify

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/plugin-package.yml`
- Modify: `.githooks/pre-push`
- Modify: `scripts/install-hooks.mjs`
- Modify: `package.json`
- Create: `tests/unit/infrastructure/verify-runner.test.mjs`

**Steps:**

- [ ] Pass explicit GitHub event base/head to the shared runner.
- [ ] Use the same architecture gates and scope in local verify, pre-push, PR, push and package workflow.
- [ ] Bring generated `styles.css` cleanliness into the same runner/scope reporting.
- [ ] Print a compact scope/owner/affected-test summary before expensive tests.
- [ ] Keep full lint/typecheck/test/build as final merge gates.
- [ ] Remove old `GUARD_TARGETS`, `OWNER_GUARD_APPROVED` and deprecated command implementation；verify no workflow still sets `HEAD` as an empty diff range.

**Acceptance:** identical normalized candidate tree produces identical digest/architecture decision on local, hook and CI surfaces；old/new owner gates no longer coexist when Phase 3 starts。

## Phase 3 — Diagnostics vertical slice

### Task 10: Characterize the three-backend diagnostics contract

**Files:**

- Create: `tests/unit/app/diagnostics/DiagnosticsRuntimeContract.test.ts`
- Create: `tests/unit/features/chat/ChatDiagnosticsContract.test.ts`
- Extend: `tests/unit/features/settings/SettingsDebugSection.test.ts`
- Reuse unchanged: existing OpenCode/Codex/Claude trace/redaction/watchdog tests

**Steps:**

- [ ] Capture construction options, dynamic knownSecrets, enabled/disabled behavior and dispose/flush ordering.
- [ ] Capture all current main construction/injection/dispose wiring points, including the bootstrap timing implied by `codexTraceService!` / `claudeTraceService!`.
- [ ] Capture header/menu/send claim/cancel, tab-cleanup capture cancel, and fail-closed behavior；assert delete-conversation currently performs no trace interaction.
- [ ] Add secret/path canaries for disk, console, clipboard/report and export.
- [ ] Capture six tabbed debug subtabs and backend-specific control/catalog behavior；separately prove whether legacy non-tabbed `attach` is reachable and record its current Codex omission.
- [ ] Capture plugin export bytes and each backend's current export/flush ordering；do not invent a uniform cross-backend baseline.
- [ ] Do not move production code until the characterization suite passes on current implementation.

**Acceptance:** tests can detect any loss of redaction, chat isolation, backend-specific controls or lifecycle cleanup。

### Task 11: Introduce `DiagnosticsRuntimeCoordinator`

**Files:**

- Create: `src/app/diagnostics/DiagnosticsRuntimeCoordinator.ts`
- Create: `src/app/diagnostics/types.ts`
- Create: `src/app/diagnostics/index.ts`
- Create/update: matching module docs and indexes
- Modify: `src/main.ts`
- Modify: agent adapter wiring only where typed ports are injected
- Test: `tests/unit/app/diagnostics/DiagnosticsRuntimeCoordinator.test.ts`

**Steps:**

- [ ] Run CodeGraph callers/impact for each existing constructor/wiring function before editing.
- [ ] First make construction order explicit inside the coordinator and eliminate public non-null trace-service fields; do not expose partially initialized ports.
- [ ] Move the three concrete service constructions without changing options/defaults.
- [ ] Expose typed backend ports; do not expose a generic mutable service map.
- [ ] Move flush/dispose lifecycle into the coordinator.
- [ ] Switch construction side before chat/settings consumers；reduce `main.ts` to one coordinator field and one diagnostics construction/injection seam, with no long-lived compatibility service fields.
- [ ] Run diagnostics characterization, backend tests, module docs, Graphify and full verify.

**Acceptance:** `main.ts` has zero direct `new *SessionTraceService`; runtime behavior and redaction remain byte-for-byte compatible at public boundaries。

### Task 12: Introduce `ChatDiagnosticsCoordinator`

**Files:**

- Create: `src/features/chat/services/ChatDiagnosticsCoordinator.ts`
- Create/update: matching module docs
- Modify: `src/features/chat/OpenCodianView.ts`
- Modify only necessary header/send/tab-cleanup seams
- Test: `tests/unit/features/chat/ChatDiagnosticsCoordinator.test.ts`

**Steps:**

- [ ] Run CodeGraph callers/impact for every touched existing method.
- [ ] Migrate one backend per green commit: first OpenCode inline logic, then Codex adapter, then Claude adapter；the coordinator must expose operations, not backend-id lookup of mutable services.
- [ ] Centralize best-effort boundaries while retaining backend-specific ports.
- [ ] Inject one coordinator/port into header and send runtime.
- [ ] Remove direct trace service/store/report access from `OpenCodianView`.
- [ ] Run chat diagnostics contract, send pipeline, header, tab cleanup, deletion-no-trace-interaction and backend regression suites after every backend step.

**Acceptance:** diagnostics failure cannot escape any chat hook；`OpenCodianView` has zero direct backend trace service/store access。

### Task 13: Split backend debug panels into complete owners

**Files:**

- Create: `src/features/settings/debug/OpenCodeDebugPanel.ts`
- Create: `src/features/settings/debug/CodexDebugPanel.ts`
- Create: `src/features/settings/debug/ClaudeCodeDebugPanel.ts`
- Create: `src/features/settings/debug/types.ts`
- Modify: `src/features/settings/SettingsDebugSection.ts`
- Create/update: matching module docs and indexes
- Test: backend panel tests plus `SettingsDebugSection.test.ts`

**Steps:**

- [ ] Treat Task 10 as a hard prerequisite；do not begin extraction until panel, plugin-export and legacy-attach characterization passes.
- [ ] Characterize each panel render/settings/status/actions/catalog lifecycle.
- [ ] Move one backend at a time, keeping each intermediate commit green.
- [ ] Inject narrow typed ports and save/refresh callbacks; do not pass the full plugin.
- [ ] Keep section-level tab/router/plugin-export responsibilities and shared platform/dialog/path/action helpers in `SettingsDebugSection`, injected as callbacks where needed；do not copy shared helpers into three panels or hide them in `types.ts`.
- [ ] Preserve Claude console logger/channel controls alongside independent trace settings.
- [ ] Apply the separately approved legacy non-tabbed decision；do not mix a Codex-visibility bugfix/deletion with the mechanical panel move.
- [ ] Run settings tests, locale checks, build and Test Vault deployment per AGENTS because settings runtime files change.

**Acceptance:** `SettingsDebugSection` has zero direct backend trace service/store/report calls；plugin export output is byte-for-byte unchanged；each panel is a complete owner, not a forwarding shim；shared helpers have one home。

## Phase 4 — Composition shell and layer debt

### Task 14: Remove `main.ts` imports from storage and chat core paths

**Files:**

- Create consumer-side `StoragePluginPort`, `ChatPluginPort`, and `TitleGenerationPort` in their owning modules/directories
- Move `PluginRuntimeCoordinator` to `src/app/runtime/` if its dependencies remain app-level
- Modify: `StorageService.ts`, `OpenCodianView.ts`, `TitleGenerationService.ts`, `main.ts`, affected factories/tests/docs

**Steps:**

- [ ] Characterize current constructors and public behavior.
- [ ] Replace full plugin types with the smallest consumer-owned ports.
- [ ] Move app-level orchestration out of `core` rather than adding a core -> feature exception.
- [ ] Remove all type-level `main.ts` coupling from the targeted storage/chat paths and eliminate the real `core/runtime -> features/chat` runtime reverse edge by moving app orchestration.
- [ ] Delete corresponding type-coupling/runtime-edge baseline entries only after the classified import gate proves absence.

**Acceptance:** no `src/core/**` runtime or type import of `src/main.ts`；chat shell and title generation no longer import the plugin class；targeted type-coupling count reaches zero；no new runtime SCC。

### Task 15: Create a chat runtime composition owner

**Files:**

- Create: `src/features/chat/runtime/ChatRuntimeComposition.ts`
- Modify: `src/features/chat/OpenCodianView.ts`
- Modify: existing runtime factory/host types only as required
- Test: `tests/unit/features/chat/ChatRuntimeComposition.test.ts` plus view lifecycle suites

**Steps:**

- [ ] Inventory existing surface/background/interaction/conversation/send wiring and disposal order.
- [ ] Commit an inventory table listing every concrete coordinator constructor/import to move and the exact retained ItemView responsibilities；code movement is blocked until this target list is reviewed.
- [ ] Move coordinator construction as one cohesive composition owner; do not move tab canonical state out of its current owner without separate design.
- [ ] Keep `OpenCodianView` responsible for Obsidian ItemView lifecycle, DOM mount points and forwarding.
- [ ] Measure direct constructed dependencies and graph edges before/after; line count is informational only.

**Acceptance:** view lifecycle tests pass；every concrete constructor/import named in the approved move inventory is absent from `OpenCodianView` and owned by `ChatRuntimeComposition`；the view does not retrieve services from composition by key/type；no new thin per-callback files。Graph edges are reported as evidence, not used as the sole pass criterion。

## Phase 5 — Follow-up program gates for backend and settings convergence

Phase 5 不是把三个开放式史诗伪装成三个 implementation task。每个 task 只授权 discovery、characterization inventory 和一份新的 dated child plan；在 child plan 通过独立对抗性 review 前，不得修改对应 production source。每份 child plan 必须把工作拆成可独立 revert 的 behavior slices，并各自运行完整 SDD/verification 流程。

### Task 16: Inventory `ClaudeCodeAdapter` and author its slice plan

Do not pre-authorize a file split from names alone. Produce a behavior inventory using CodeGraph and tests, then write `docs/superpowers/plans/<date>-claude-adapter-owner-slices.md`. Candidate slices may include process/session lifecycle, SDK query stream ownership, permission/elicitation bridge, and trace instrumentation, but only if each has a complete lifecycle and stable port.

**Rules:**

- preserve Claude SDK options, session identity, resume/fork, permission, cancellation and trace ordering；
- no duplicate maps/listeners between adapter and extracted owner；
- adapter remains backend facade, not state dump；
- every slice removes a manifest responsibility from the adapter owner and adds it to exactly one new/existing owner。
- child plan 必须为每个 slice 列出 files、characterization tests、CodeGraph blast radius、canonical state、rollback commit 和可证伪 acceptance；inventory/review 未完成时 production source 零修改。

### Task 17: Inventory `OpenCodeService` and author its convergence plan

Write a separate dated child plan using the same characterize-then-move method. Preserve SDK-first/legacy fallback and `OpenCodeSessionStateStore` as canonical session/message/part truth. Do not create another service-local cache or generic gateway. The child plan must enumerate slices and stop conditions before any source move; retire owner exceptions only when contract tests and dependency gate prove an implemented child slice.

### Task 18: Inventory settings plugin-type coupling and author per-domain plans

Inventory exact type-only/runtime dependencies and `this.plugin` capabilities by settings domain: debug, model catalog, backend config, style, agents/tools/MCP, update. Write one child plan per independently releasable domain, not one mega-plan. A consumer-owned type-only `Settings<Domain>Port` may be short if it removes the complete `OpenCodianPlugin` dependency and is colocated with the consumer owner；avoid a settings mega-port, one interface per callback, runtime forwarding modules, `unknown` casts and global lookup.

**Acceptance for Phase 5:**

- no new imports of `main.ts` outside `src/app`；
- each child plan records its domain's exact baseline/target `main.ts` type-import count and reaches the target before the next domain starts；
- every removed import corresponds to a tested port, not `unknown`/cast/global lookup；
- no new runtime cycle, reverse type edge or canonical-state exception；
- Phase 6 only starts after each selected child plan has its own review/merge checkpoint, or the remaining domains are explicitly deferred with owner/expiry。

## Phase 6 — Documentation retirement and steady-state governance

### Task 19: Archive historical maintainability/autopilot state

**Files:**

- Move numbered history to `docs/archive/maintainability/phases/`
- Move completed autopilot lane evidence to `docs/archive/maintainability/autopilot/`
- Create: `docs/archive/maintainability/index.md`
- Update: `docs/README.md`, `AGENTS.md`, active requirements/rules
- Mark superseded master/lane documents as archived pointers or move them

**Steps:**

- [ ] Generate an index with original path, phase/round id, date/status if parseable, and git-history note.
- [ ] Search the whole repository for links/references to every moved master/lane/phase path and update them or leave a deliberate archived pointer；dead links fail the task.
- [ ] Keep history searchable; do not delete evidence solely to reduce repo size.
- [ ] Remove historical phase files from default agent reading instructions.
- [ ] Correct stale docs claims, including the statement that `docs/superpowers/` was deleted.
- [ ] Keep only canonical current architecture, requirements, module docs and active plan in default navigation.

**Acceptance:** there is one active architecture roadmap；agents are not instructed to read hundreds of phase documents。

### Task 20: Publish the steady-state contract and prove compatibility gates are gone

**Files:**

- Confirm old owner-guard implementation/approval env was removed by Task 9
- Update: `docs/requirements/agent-maintainability.md`
- Update: `docs/status/development-maintainability-rules.md`
- Update: `AGENTS.md`, CI, package scripts and module indexes
- Regenerate Graphify artifacts

**Steps:**

- [ ] Prove no workflow/hook/docs references old range, `GUARD_TARGETS`, `OWNER_GUARD_APPROVED` or unauthenticated approval semantics.
- [ ] Remove expired baseline exceptions and document remaining debt with owners/expiry.
- [ ] Run architecture gates, full verify, build, and required Test Vault acceptance for runtime phases.
- [ ] Publish before/after metrics without claiming success from LOC alone.

## Verification Matrix

| Change class | Required checks |
|---|---|
| Manifest/gate scripts only | infrastructure Jest, `verify:architecture`, module docs, `git diff --check` |
| Graphify tooling | digest tests, update graph, stale canary, `check:graphify` |
| Docs archive only | link/index checks, module-doc guard if mapped docs touched, `git diff --check` |
| Diagnostics runtime | characterization + all three backend diagnostics suites + security canaries + full verify |
| Chat composition | focused chat/header/send/tab-cleanup/delete-no-trace-interaction/reload suites + full verify + build/deploy when required |
| Settings panels/ports | focused settings/locale suites + full verify + build + Test Vault UI acceptance |
| Backend adapter slice | backend-specific lifecycle/stream/permission/cancel suites + full verify |

## Success Metrics

### Gate correctness

- 100% managed source paths resolve to exactly one owner。
- `legacy.unassigned.explicitPaths` = 0 before Phase 1。
- local/CI/hook 对同一 normalized candidate tree 产生同一 digest 和 gate result；dirty local state 的 committed/index/workspace candidates 分别可见。
- non-empty branch diff 的 empty-scope false pass 为 0。
- Graphify graph-input digest 与 current source/config/tool envelope 精确一致；报告不再以 stale commit metadata 声称新鲜。
- 新 reverse runtime/type layer violations = 0；新 runtime architecture cycles = 0；type-only/mixed SCC 不冒充 runtime cycle。
- 需要 budget waiver 的 diff 只有在受保护外部 review 生效后才 merge-ready；agent 自写 JSON 不能自批。

### Architecture

- `main.ts` 不被 `core` runtime/type import；targeted chat/storage `main.ts` type coupling = 0；`core/runtime -> features/chat` reverse runtime edge = 0。
- `main.ts` 只直接构造 app-level coordinators，不直接构造三种 trace service。
- `OpenCodianView` 不直接访问 backend trace service/store/report builder。
- `SettingsDebugSection` 不直接访问 backend trace service/store/report builder。
- 每次责任迁移在 manifest 中表现为一个 owner 减少、另一个 owner 增加，canonical state 不重复。

### Agent experience

- `inspect:owner` 对代表性路径给出唯一 owner、入口、测试、文档、风险和必跑门禁。
- 默认阅读链缩短为 `AGENTS.md -> inspect:owner -> owner/module doc -> focused source`。
- active architecture roadmap 只有本计划/其后继状态页一套；历史 phase/autopilot 文档不在默认入口。

### Quality

- lint 始终 0 errors / 0 warnings。
- typecheck/full tests/build 始终通过。
- diagnostics security/chat-isolation canaries 始终通过。
- 不以任何单一 LOC、file count 或 import count 指标宣称 merge-ready。

## Phase Checkpoints

- Phase 0 exit：strict schema green、unassigned = 0、inspector fixtures green；否则不得启动 dependency gate。
- Phase 1 exit：runtime/type/dynamic edge 分类与 frozen baseline green；structured request 不能自批；change-scope candidate tests green。
- Phase 2 exit：旧 owner guard/env 已删除，Graphify graph-input digest 与 scope-correct module docs/CI green；这是 Phase 3 的硬前置。
- Phase 3 exit：diagnostics characterization、安全 canary、三后端 regressions、full verify、build 与 Test Vault acceptance 全绿；每个 backend move 可独立 revert。
- Phase 4 exit：targeted type coupling/runtime reverse edge 达到明确的零目标，chat composition inventory 全部迁移，无 service locator。
- Phase 5：每个 child plan 自成 checkpoint；任何一个 epic 不得以一个不可回滚的“大任务”提交。
- Phase 6 exit：历史文档引用无死链，剩余 debt 有 owner/expiry，steady-state gates 是唯一 active 路径。

## Stop and Rollback Conditions

出现以下任一情况，停止当前 slice，回退该 slice 的 runtime move，但保留已验证的 gate/characterization tests：

1. 为让新边界成立需要复制 canonical mutable state。
2. 新 port 比原 plugin/service surface 更宽，或退化为 service locator。
3. characterization tests 无法区分旧/新生命周期顺序。
4. diagnostics redaction 或 chat isolation canary 失败。
5. layer/cycle exception 需要扩大到通配目录。
6. focused tests 通过但 full verify 失败，且修复会跨出当前 owner。
7. 新增 runtime forwarding files，却没有独立合同/状态/生命周期/高风险依赖，也没有消除真实 layer 违规。纯类型、consumer-owned、与 consumer 共址且消除完整 plugin/main dependency 的窄 port 不按行数触发本条。

回滚以最小 behavior-slice commit 为单位；禁止用 `git reset --hard` 覆盖用户工作。Phase 5 child plan 的每个 slice 必须可独立 revert，不能把整个 adapter/service epic 作为一个回滚单元。

## Commit Strategy

- gates、runtime characterization、每个 owner move、docs archive 分开提交。
- 每个 runtime owner 一次只移动一个行为切片。
- Conventional Commit examples：
  - `feat(architecture): add canonical owner manifest`
  - `fix(gates): unify committed and working-tree change scope`
  - `refactor(diagnostics): centralize runtime composition`
  - `refactor(chat): own diagnostics routing in one coordinator`
  - `docs(architecture): archive superseded maintainability phases`
- 不在同一 commit 混入 feature behavior 或产品 UI redesign。

## Final Merge Readiness

本计划不是以“几个大文件变短”为完成条件。完成条件是：owner 可机器解析、runtime/type/dynamic 依赖被正确分类、反向边和新 runtime cycle 可阻断、所有 gate 使用可信 candidate scope、Graphify 完整输入包可寻址、module docs 与 owner change 同步、diagnostics 试点证明完整责任可以无行为回归地迁移，并且历史治理体系已经收束为一个当前事实源。
