# ClaudeSettingsSourceTypes

> **源码**: `src/core/agents/backend/ClaudeSettingsSourceTypes.ts`
> **状态**: [ACTIVE]

## 概述

`ClaudeSettingsSourceTypes` 集中定义 Claude settings source inventory 与 mutation 的稳定 public contracts。它被 backend service、Settings controller/UI 和测试共同消费，不包含运行时代码或副作用；`ClaudeSettingsSourceService` 通过 type-only re-export 保持旧 import 路径兼容。

## 职责

- 定义 source scope/format/candidate 与严格 JSON parse diagnostic 形状；`format=plist` 只支持 path-only inspection，不能进入 JSON editor。
- 定义 read、path edits、write、delete、history、restore 的参数和类型化结果。
- 复用 shared secure-write 的 revision、evidence、archive history、mutation outcome 与 opaque archive identity 类型，不复制安全契约。
- 定义 SourceService 的 home、managed roots、username、archive root 和 deterministic platform 注入 options。

## 导入关系

上游: type-only `ConfigurationArchiveService`、type-only `ProjectResourceSecureWrite`

下游: `ClaudeSettingsSourceService`（并由其 type-only re-export）、Settings mutation/controller/UI、测试

## 维护约束

- 保持纯类型模块；不要加入 filesystem、archive 或 UI 运行时逻辑。
- 修改 public contract 时同步 SourceService、Settings consumers 与 focused tests；旧 SourceService type import 路径必须继续可用。
- `expectedRevision=null` 在 write/restore 中表示目标必须不存在；delete 的 expectedRevision 永远非 null。Global/Project/Local 的 target 由 service 的显式 scope slots 绑定，managed candidate 永远 `editable=false`。
- `ConfigurationEvidence` 的 persistence/application/runtime 是独立轴；类型只传递证据，不推断 runtime 应用。Windows HKLM/HKCU registry discovery 不在这些 contracts 的覆盖范围内，仍是 residual。
