# Owner: feature.settings-agents
> 2026-09-28：OpenCode 2 设置包含原生 MCP 连接状态、API 密钥/OAuth 认证、凭据切换与运行目录。原生配置覆盖层和 OpenCode 1 配置互相独立。
> 2026-09-24 (票 06)：SettingsZCodeSection 新增三项持久化默认字段与重连时的斜杠目录失效调用。
> 2026-09-22（二轮核查修复）：SettingsZCodeSection 的 provider 计数未知时显示「数量不可用」，移除 ?? 0 伪造。
> 2026-09-22 (ZCode 票 01)：SettingsBackendSection 的 ALL_BACKEND_OPTIONS 增加 zcode（可启用/禁用，不影响其他后端启停语义）；新增 SettingsZCodeSection（ZCode 运行时覆盖 + ready/unavailable/failed 诚实诊断面）。
> 2026-09-21 (advantage-parity R-E6)：owner manifest 刷新——shared.foundation 的 include 新增 `src/shared/tokenEstimate.ts`（token 估算启发式）；本 owner 的边界与职责未变。

> Auto-generated scaffold from `architecture-owners.config.json`. The manifest is the canonical truth source; this page narrates the model and records hard-to-automate rationale. Update it when the owner boundary or its non-obvious invariants change.
- 2026-09-13 (universal memory backend): owner manifest gained `core.memory` and `app.memory-runtime`; this owner's boundary itself is unchanged (no source touched, allowlist untouched).

- **Layer:** `feature` (may import layers: shared, core, feature)
- **Risk:** medium
- **Include:** `src/features/settings/resources/SettingsAgentsSection.ts`, `src/features/settings/resources/AgentSwitcherChips.ts`, `src/features/settings/resources/AgentSwitcherFloatingIcons.ts`, `src/features/settings/resources/SettingsSkillSection.ts`, `src/features/settings/resources/SlashCommandCatalogRenderer.ts`, `src/features/settings/resources/SettingsToolSection.ts`, `src/features/settings/resources/SettingsToolDetailModal.ts`, `src/features/settings/resources/SettingsToolFileService.ts`, `src/features/settings/capabilities/capabilityDisclosureRow.ts`, `src/features/settings/capabilities/capabilityLabBackendTabs.ts`, `src/features/settings/capabilities/capabilityLabBackendWorkspace.ts`, `src/features/settings/capabilities/SettingsCapabilityLabSection.ts`

## Responsibilities
- agents, skill, tool and capability-lab settings sections
- agent switcher chips and floating icons, slash command catalog renderer

## Entrypoints
- `src/features/settings/resources/SettingsAgentsSection.ts`
- `src/features/settings/capabilities/SettingsCapabilityLabSection.ts`

## Dependency surface
- **Allowed owner dependencies:** `shared.foundation`, `core.agents`, `core.config`, `core.types`
- **Forbidden dependencies:** `app`
- **Adjacent owners** (prefer editing these when out of scope): `feature.settings-shell`, `core.agents`

## Focused tests
- `tests/unit/features/settings/**Agent*`
- `tests/unit/features/settings/**Capability*`

## Required gates
Run before merge: `npm run typecheck`, `npm run module-docs`.

## Hard invariants
- Do not cross `forbiddenDependencies`.
- Do not replicate canonical state in another owner.
- Changes here must update the matching `docs/modules/**` page (via `module-docs.config.json`).
- Run `npm run inspect:owner -- <this owner or a path>` for an always-fresh summary.

## Pi owner boundary review (2026-09-08)

The new core.backend-pi owner isolates the external Pi process service. feature.settings-agents retains its existing responsibilities; Pi process lifecycle, RPC compatibility and native history must not be added to this owner.

Pi图标由AgentSwitcherFloatingIcons单处注册用户SVG形状，三种后端图标入口共用，其他后端图标不变。

## Agent switcher icon modifier cleanup (2026-09-11)

`AgentSwitcherFloatingIcons` now removes the `opencodian-agent-switcher-icon--lobehub` modifier class before falling back to `fallbackIcon`. That class only applies to LobeHub glyphs, so a reused button container kept hiding the fallback icon after a backend lost its LobeHub icon. Pi icon registration stays single-sourced in this owner.

- 2026-09-15: Owner 模型新增 `feature.inline-edit`（行内编辑：CM6 内嵌输入框 + 原位词级 diff + 单次 `replaceRange` 落盘），owner 表已更新；本 owner 的边界与职责未变。

- 2026-09-18 (FlowText 批次 B)：owner manifest 随 R-B1/R-B2 更新——新增 `src/shared/contextGroupPlan.ts` 归属 `shared.foundation`；本 owner 的边界与职责未变。

## 2026-09-27 OpenCode 2 compatibility

The agent switcher identifies OpenCode 2 independently and reuses the OpenCode visual icon.

2026-10-07 owner manifest 核对：新增 `shared.foundation` 的 `src/shared/sessionCatalogReadback.ts`，统一目录读取结果与错误分类。本 owner `feature.settings-agents` 的路径映射、职责、canonical state 和依赖约束经核对保持原定义；目录读取仍由 backend/lifecycle owners 调用共享契约。

## 2026-10-23 DSH switcher icon

后端切换器使用官方 DeepSeek Harness favicon 路径和蓝色，原始文件随 assets 保留。图标映射归本 owner；`dsh` 的启用/连接真值继续来自后端 registry，图标本身不代表连接成功。

## 目录定位（2026-10-23）

当前源码目录：`src/features/settings/capabilities`、`src/features/settings/resources`。

目录整理沿用本 owner 的职责、状态和依赖约束；路径导航见[源码目录说明](../source-layout.md)。
