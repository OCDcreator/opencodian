# OpenCodian Docs Guide

`docs/` 现在按用途分组，而不是把阶段性文档都堆在根目录。

## 从哪里开始看

- `architecture/README.md`
  - 面向开发者的整体架构总览，适合先建立系统心智模型。
- `modules/README.md`
  - 按 `src/**/*.ts` 映射的模块文档入口。代码行为变更时，优先更新这里。
- `status/`
  - 当前 rollout、迁移状态和手工验收清单。
  - 后续开发可维护性准入规则见 `status/development-maintainability-rules.md`。
  - 历史可维护性 phase/autopilot/checkpoint 文档已归档到 `docs/archive/maintainability/`（见 `archive/maintainability/index.md`），不在默认阅读链中；当前架构路线以 `superpowers/plans/2026-07-30-agent-friendly-architecture-and-governance-refactor.md` 为准。
- `requirements/`
  - 仍有维护价值的功能需求、实现状态和产品约束说明。
  - 当前维护期的项目级开发基线见 `requirements/maintenance-development-baseline.md`，应与 `status/development-maintainability-rules.md` 一起阅读。
- `reference/`
  - 外部资料或文档快照，作为项目内参考，不直接代表当前实现。

## 当前目录约定

- `docs/` 根目录只放分类入口，不再堆放单个专题文档。
- 代码邻近文档放进 `docs/modules/`。
- 功能需求和阶段性状态文档放进 `docs/requirements/` 或 `docs/status/`。
- 外部资料快照放进 `docs/reference/`。
- `SERVER_API.md` 和 `devlog.md` 继续留在仓库根目录，不并入 `docs/`。

## 建议阅读顺序

1. `architecture/README.md`
2. `requirements/maintenance-development-baseline.md`
3. `status/development-maintainability-rules.md`
4. `modules/README.md`
5. 需要时再查其他 `requirements/` 文档、`status/` 里的当前 capability/current-state 文档和 `reference/`

## 本次整理说明

已删除这些明显过时或重复的文档：

- `MIGRATION.md`
- `integrate-raw-messages-panel.md`
- `opencode-modules-analysis.md`

这些内容要么属于历史迁移阶段，要么是一次性实施计划，要么与现有模块文档/参考快照重复，继续保留只会增加噪音。

## 历史可维护性归档（2026-07-30，Task 19）

`docs/status/` 下原有的编号 phase 文档（`maintainability-phase-N.md`）、autopilot master/lane/round 控制文档、checkpoint 执行包、density visual-QA 与 council 审查等历史证据，已通过 `git mv` 迁入 `docs/archive/maintainability/`（`phases/` 与 `autopilot/` 两个子目录，索引见 `archive/maintainability/index.md`）。git 历史完整保留，可用 `git log --follow` 追溯。

这些归档文档**不在默认 agent 阅读链中**；当前唯一的架构路线图是 `docs/superpowers/plans/2026-07-30-agent-friendly-architecture-and-governance-refactor.md`，配合 `docs/architecture/README.md`。

注：`docs/superpowers/` 目录仍然存在，存放当前活跃 plan 与 specs（早期文档曾误称其已删除，现更正）。
