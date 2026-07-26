# ClaudeSettingsSourceService

> **源码**: `src/core/agents/backend/ClaudeSettingsSourceService.ts`
> **状态**: [ACTIVE]

## 概述

`ClaudeSettingsSourceService` 是 Claude Code global/project/local settings 文件的 inventory、严格 JSON read、CAS mutation 与归档历史 owner。global 明确指 `~/.claude/settings.json`，project/local 明确指 vault 下 `.claude/settings.json` 与 `.claude/settings.local.json`；Project 是 UI 的默认选择，Global 不会隐式成为写入目标。managed policy discovery 委托给 `ClaudeManagedSettingsDiscovery`；公共请求/结果契约从 `ClaudeSettingsSourceTypes` type-only re-export，保持原模块 import 兼容。

## 职责

- 组合 global `~/.claude/settings.json`、project `.claude/settings.json`、local `.claude/settings.local.json` 与只读 managed candidates，并按 Claude precedence 返回优先级。
- 通过 per-slot narrow allowlist、parent-anchor confinement 和 descriptor-bound snapshot 读取严格 JSON；无效 JSON 返回原始内容与诊断，不降级为 JSONC。
- 所有 write/delete/restore mutation 委托共享 secure-write chokepoint，保留 expectedRevision、archive-before-mutation 和三轴 evidence 契约。
- history catalog 返回前把 archive canonical target 重新绑定到本 service 的 exact editable inventory。其他 vault 共享 archive root 的合法 entries 会被跳过而不暴露；unbound scope/target 或 integrity failure 才 fail closed。selected `listHistory(targetPath)` 在 narrow root 缺失时通过 canonical comparable path 过滤已绑定 catalog，绝不 materialize root。
- selected restore 的顺序固定为：opaque identity syntactic decode → manifest/entry authentication → exact slot binding → anchor-confined mkdir → mutation lock 内再次验证并 restore。
- `ConfigurationEvidence` 三轴始终独立：read 成功只证明 persistence；write/delete/restore 成功通常为 `persistence=verified`、`application=pending`、`runtime=unavailable`。没有真实 Claude runtime probe 时不得升级后两轴。
- managed discovery 使用注入/当前 `platform` 选择 OS policy roots；managed file、drop-ins 与 macOS plist 仍全部只读。Windows HKLM/HKCU registry residual 不由本 owner 补齐。

## 核心导出

| 导出 | 说明 |
|------|------|
| `ClaudeSettingsSourceService` | inventory/read/path edits/write/delete/history/restore 服务 |
| `CLAUDE_SETTINGS_PRIORITY` | managed、CLI、local、project、user 的文档化 precedence |
| `ClaudeSettingsSourceTypes` 的 type re-export | 保持既有消费者从 SourceService 路径导入 public contracts |

## 导入关系

上游: Node `fs/promises`、`os`、`path`；`ClaudeManagedSettingsDiscovery`；`ClaudeSettingsSourceTypes`；`ConfigurationArchiveService`；`ProjectResourceSecureWrite`

下游: Claude settings mutation controller、Settings configuration surface、SourceService/HookModel integration tests

## 维护约束

- managed source 永远 `editable=false`；unknown/managed target 必须在内容解析、mkdir 或 mutation 前短路。
- read-only inventory/history 不得创建 `.claude` 或 archive directories。
- restore 不接受 archive path 或 caller-provided target path，只接受 validated history listing 发出的 opaque identity。
- 不在本模块恢复平台 managed 路径、drop-in 扫描或 plist inspection 的重复实现。
- Windows HKLM/HKCU registry policy discovery 不属于本 filesystem service，仍是 residual；managed filesystem/plist candidates 不能被描述成完整 Windows policy coverage。
