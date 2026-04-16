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
  - 也放阶段性维护/重构说明，例如 `status/maintainability-phase-1.md`、`status/maintainability-phase-4.md`、`status/maintainability-phase-5.md`、`status/maintainability-phase-7.md`。
- `requirements/`
  - 仍有维护价值的功能需求、实现状态和产品约束说明。
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
2. `modules/README.md`
3. 需要时再查 `status/`、`requirements/`、`reference/`

## 本次整理说明

已删除这些明显过时或重复的文档：

- `MIGRATION.md`
- `integrate-raw-messages-panel.md`
- `opencode-modules-analysis.md`
- `superpowers/`

这些内容要么属于历史迁移阶段，要么是一次性实施计划，要么与现有模块文档/参考快照重复，继续保留只会增加噪音。
