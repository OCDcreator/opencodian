# Owner Guard Hard Constraints Design

## Goal

为 OpenCodian 增加一套“本地 + CI 双层硬门禁”，把“新功能必须限制在既有 owner 内实现，不得继续回灌热点厚壳文件”从约定升级为自动阻断规则。

## Chosen Approach

采用“**路径级热点 owner 禁写 + 领域级所有权扩张审查 + 极窄例外白名单 + 本地 `pre-push` 早期门禁 + CI 最终硬门禁**”的方案：

- 把 `OpenCodianView.ts`、`OpenCodeService.ts`、`main.ts` 定义为热点 owner guard targets
- 对“新功能改动”启用额外门禁，而不是只看是否通过 `lint` / `test` / `build`
- 允许的例外只限 docs、tests、scripts、automation、样式、资源、locale 文案等纯展示/验证层
- 不把文件名模式本身当作 blocker，避免和仓库既有命名体系冲突
- 在本地 `pre-push` 和 CI 必过 job 中都运行同一套 owner guard 脚本

## Why This Approach

- 仅靠文档约定无法稳定阻止新功能继续长回 `OpenCodianView.ts`、`OpenCodeService.ts`、`main.ts`
- 只做路径黑名单不够，因为开发者可以绕开这三个文件，在相邻位置新造一个事实上的新壳层
- 只做 reviewer 人工判断不够稳，长期会退化成“看起来问题不大就放行”
- 文件名模式在这个仓库里已经有大量合法使用，不能拿来当自动 blocker
- docs / tests / styles / assets / locale 这类例外边界清晰，最适合做稳定自动化检查

## Current State

### Already Present

- `npm run verify` 已经是本仓库默认的合并前质量门禁
- `scripts/` 下已有 `check:module-docs`、`check:graphify` 等 repo-specific guard 脚本
- 维护性规则已经明确写入：
  - 不要向 `OpenCodianView.ts` 增加新的 runtime ownership
  - 不要向 `OpenCodeService.ts` 增加新的 runtime ownership
  - `main.ts` 应保持启动期 composition owner，不继续承接 feature-specific business logic
- 仓库已有 review-gated automation 和脚本化 review 入口，可作为后续扩展挂点

### Missing Or Incomplete

- 当前没有脚本会在提交/推送时自动阻止“新功能直接改热点 owner”
- 当前没有脚本会强制要求功能改动显式落在既有 adjacent owner 内
- 当前没有统一的“功能改动”判定规则
- 当前没有把“允许的例外”做成机器可判定的白名单

## Scope

### In Scope

- 定义 owner guard target 文件清单
- 定义允许的例外白名单路径
- 定义“新功能改动”与“presentation-only / docs-test-config-only”例外判定
- 新增 repo-local `check:owner-guard` 脚本
- 把 owner guard 挂到本地 `pre-push` 与 CI 必过 job
- 提供清晰、可操作的失败提示文案
- 同步维护性文档，说明这套 guard 的目标与触发条件

### Out of Scope

- 不尝试自动理解所有业务语义或自动判断“设计是否优雅”
- 不把 graph community 直接变成目录重构规则
- 不引入“热点 owner 内允许少量 wiring”这类模糊例外
- 不在本轮设计里自动修复违规改动，只负责阻断并提示调整方向
- 不改动 OpenCode / Obsidian 运行时逻辑本身

## Enforcement Model

### Guard Targets

以下文件属于热点 owner guard targets：

- `src/features/chat/OpenCodianView.ts`
- `src/core/opencode/OpenCodeService.ts`
- `src/main.ts`
- `src/core/opencode/ServerManager.ts`

这些文件允许保留壳层 / facade / composition 所有权，但不允许继续承接新功能逻辑。

### Allowed Exception Paths

默认允许以下路径在不触发 owner guard blocker 的前提下继续修改：

- `docs/**`
- `tests/**`
- `scripts/**`
- `automation/**`
- `styles.css`
- `src/style/**`
- `assets/**`
- `src/i18n/**`

这些路径的共同特征是：它们可以承接文档、验证、展示和文案变化，但不应成为功能逻辑的借道入口。

以下文件不属于自动例外，即使它们位于允许路径内也要单独审查：

- `scripts/check-owner-guard.mjs`
- `scripts/install-hooks.mjs`
- 任何会改写 owner guard 规则、hook 安装逻辑或 codegen/patch 目标的自动化脚本

### Explicitly Rejected Exception

以下例外不允许作为新功能的绕行口子；只有在明确的维护性重构模式下，且 diff 对 guard target 净减少责任时，才可由脚本放行：

- “只是改一点 import / 注册 / 传参 / callback wiring”
- “只是把新功能从别处挂进热点 owner”
- “只是加一个轻量状态字段或一条轻量分支”

原因是这些例外最容易重新引入：

- 新状态真值
- 新副作用链
- 新的跨域装配责任
- 新的回调协调责任

## Change Classification

### Class A: Safe Non-Feature Changes

满足以下条件之一时，可按非功能改动处理：

- 改动仅落在 allowed exception paths
- 改动仅涉及模块文档、维护性状态文档、测试、脚本、样式、资源或 locale 文案
- 改动落在 guard target 内，但仅做展示层、引用层、注释、类型、文案或净删除式维护，不引入新的运行时 ownership

这类改动仍需通过常规 `verify` / focused checks，但不应被 owner guard 当作“新功能回灌热点 owner”阻断。

### Class B: Feature Or Behavior Changes

满足以下任一条件时，视为功能或行为改动：

- 改动触及 `src/**` 的运行时 TypeScript owner，且不在 exception paths 内
- 改动新增用户可见行为、运行时状态、分支路径、命令处理、事件处理、副作用或会话/流式逻辑
- 改动为某个新需求接入聊天 runtime、OpenCode service runtime 或 plugin startup composition

Class B 改动必须通过 owner guard。

## Blocking Rules

### Rule 1: Hotspot File Block

如果改动被判定为 Class B，并且直接修改以下 guard targets：

- `src/features/chat/OpenCodianView.ts`
- `src/core/opencode/OpenCodeService.ts`
- `src/main.ts`
- `src/core/opencode/ServerManager.ts`

则脚本直接失败。

失败提示应明确要求：

- 将新行为下沉到既有 adjacent owner
- 或先做小步 maintainability seam 收束，再继续功能实现

### Rule 2: Thin-Layer Name Hint (non-blocking)

如果改动被判定为 Class B，且涉及以下领域之一：

- chat runtime
- opencode service/runtime
- plugin bootstrap/composition

则变更必须落在现有 owner 内，而不能通过新增广义薄层把责任重新包装后绕开 guard。

这里的文件名模式不作为 blocker，只作为 review hint：

- 新增名字指向薄层的文件，例如 `*Facade*`、`*Gateway*`、`*Builder*`、`*Provider*`
- 在 guard target 周边新增只做转发或装配的新 runtime owner
- 把跨域协调分散到多个位置且没有明确 primary owner

脚本只在这些模式与明显净新增责任同时出现时，才建议人工复查。

### Rule 3: Net-New Ownership Block

即使开发者试图把功能借道改进热点 owner，只要 diff 在 guard targets 中新增了**净新增的运行时 ownership**，就应直接失败。

可判定的 ownership 扩张信号包括：

- 新增会跨多个方法调用保存的字段，用来维护运行时 truth、协调状态或生命周期状态
- 新增持久化的 `Map` / `Set` / `Record` / cache，且该容器承载的是运行时协调而不是一次性局部变量
- 新增订阅、监听器、事件绑定、observer、disposer，且这条链路不是对既有 owner 的替换或收束
- 新增定时器 / RAF / 轮询 / retry / fallback loop，且其作用是维持长期运行时协调
- 新增 session/message/part/view/service 的衍生真值路径
- 新增“只在这个文件里才知道”的业务状态或副作用编排

下面这些信号本身不单独构成 blocker，只有在它们一起形成净新增 ownership 时才阻断：

- `if` / `switch`
- import / export 调整
- 局部缓存
- 局部 helper 提取
- 纯展示层 className / 文案改动

这层是为了阻断“路径上看起来像小改动，实际上在热点 owner 里长新责任”的情况。

## Implementation Shape

### Repo Script

新增：

- `scripts/check-owner-guard.mjs`

职责：

1. 读取当前 diff 范围
2. 分类本次改动是 Class A 还是 Class B
3. 判断是否触碰 guard targets
4. 判断是否全部落在 allowed exception paths
5. 扫描 guard targets diff 中的高风险信号
6. 输出可读的失败原因与建议 owner 落点

### Package Script

新增：

- `npm run check:owner-guard`

推荐接入：

- `npm run verify` 中前置执行

理由：

- owner guard 是 maintainability gate，不应依赖人工记忆单独运行

### Local Hook

推荐新增 repo-local `pre-push` hook 安装脚本，而不是强制 `pre-commit`：

- `pre-push` 足以阻止坏变更进入共享分支
- 不会阻碍本地小步实验
- 反馈仍然足够早
- `pre-push` 是早期门禁，不是唯一硬门禁；CI 仍是最终不可绕过的合并门槛

推荐形态：

- `scripts/install-hooks.mjs`
- `.githooks/pre-push`

`pre-push` 至少运行：

- `npm run check:owner-guard`

必要时可叠加：

- `npm run check:module-docs`
- `npm run check:graphify`

但 owner guard 本身应该保持快速，否则会降低执行意愿。

### CI Gate

CI 中新增必过 job：

- `owner-guard`

该 job 运行：

- `npm ci`
- `npm run check:owner-guard`

如果仓库继续保留聚合 `verify`，则：

- `owner-guard` 作为独立快速失败 job
- `verify` 继续做完整质量验证

这样可以更早失败，也更容易从日志中看清是“owner 违规”而不是“测试失败”。

## Failure Output Design

owner guard 的失败信息应避免只输出“blocked”。

推荐输出结构：

1. 违反了哪条规则
2. 哪些文件触发
3. 为什么这被视为新功能回灌热点 owner
4. 推荐去改的相邻 owner 或相邻目录；如果无法唯一判断，就明确指向维护性 baseline 或 module docs
5. 哪些路径属于允许例外

示例语气：

> `src/features/chat/OpenCodianView.ts` was modified by a Class B feature change. New feature behavior must land in an existing adjacent owner, not in a guarded shell file. Move the behavior into the relevant chat runtime/service owner or split the seam first.

## Rollout Plan

### Phase 1

- 先以脚本形式接入 `npm run check:owner-guard`
- 本地支持手动运行
- 在文档中宣布 guard target、例外路径和失败语义

### Phase 2

- 安装 repo-local `pre-push` hook
- 接入 CI 独立 `owner-guard` job

### Phase 3

- 根据首轮误报情况微调 Class A / Class B 判定
- 仅在证明确有必要时扩展例外白名单
- 支持显式的 `maintainability-refactor` 豁免模式：当变更对 guard targets 净减少责任，且提交/PR 说明明确标注为重构时放行

## Success Criteria

该设计成功的标志是：

1. 新功能不能再直接改 `OpenCodianView.ts`、`OpenCodeService.ts`、`main.ts`
2. 纯 docs / tests / styles / assets / locale 改动不会被误挡
3. 本地推送前与 CI 合并前都会执行同一套 owner guard
4. 失败信息能明确指出推荐 owner 落点，而不是只给抽象规则
5. guard 促使新功能优先落到既有 adjacent owner，而不是催生新的薄层碎片

## Risks And Mitigations

### Risk: False Positives Too High

- 通过先把例外收窄到展示/文案/验证层，降低语义歧义
- 通过独立 `owner-guard` job 提供清晰日志，方便快速调参

### Risk: Developers Create New Thin Layers To Bypass Guard

- 领域级 block 明确禁止新增 façade / gateway / builder / provider 薄层作为绕行手段
- reviewer 仍需按维护性文档复查 owner 是否真实收敛

### Risk: Local Hooks Are Skipped

- CI 必过 job 作为最终硬门禁
- 本地 hook 只负责尽早失败，不承担唯一防线

## Constraints

- 该 guard 必须优先服务于“减少热点 owner 新责任”，而不是成为宽泛架构评分器
- 规则必须保持机器可判定，避免引入大量人工解释空间
- 例外白名单只能向清晰、可验证的展示/文案/验证路径开放
- 维护性重构必须有显式标识，不能靠“看起来像 refactor”猜测放行
- 若后续确有必要引入新例外，必须先更新本设计与维护性文档，再更新脚本
