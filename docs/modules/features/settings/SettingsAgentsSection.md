# SettingsAgentsSection

> **源码**: `src/features/settings/SettingsAgentsSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsAgentsSection` 是 settings/agents 分区的 owner。它负责加载当前 OpenCode 运行时返回的 built-in / project agent 目录，并与当前 vault 的 `.opencode/opencode.json` 中的 project agent 覆盖合并展示。

本轮只实现 Agents 设置的最小可交付壳层：

- 读取 runtime agent 目录与 `OpencodeConfigManager.getAgentConfig()`
- 用 `OpencodeConfigManager.getDefaultAgent()` 初始化默认主代理下拉框
- 通过 `updateDefaultAgent()` 写回项目级 `default_agent`
- 为 `mode: 'subagent'` 的条目提供基础 `hidden` 可见性开关
- 通过 `upsertAgentConfig()` / `removeAgentConfig()` 写回或清理 `agent.<id>.hidden`

完整 CRUD、prompt/model/temperature/top_p/steps/color/permission/options 编辑仍留给后续 slice。

## 核心逻辑

### runtime + project catalog 合并

owner 会并行读取：

- `openCodeService.sdk.app.agents()`：当前 runtime scope 下的 agent 目录，包含 OpenCode built-in agent 与 runtime 已识别的 project agent
- `OpencodeConfigManager.getAgentConfig()`：当前 vault 的项目配置 agent map，兼容 native `agent` 与 deprecated `mode`
- `OpencodeConfigManager.getDefaultAgent()`：项目级默认主代理

合并时优先用 project 配置里的 `description` / `mode` 覆盖 runtime 元数据，并保留 runtime-only、runtime+project-override、project-only 三类条目。`default_agent` 下拉只列出 `primary` / `all` 且未 `disable` 的条目；如果当前配置值已不在可选列表中，会保留一个 unavailable 选项，避免静默丢失现有配置。

### subagent visibility 写回

当前 slice 只处理 OpenCode 原生 `hidden` 字段的基础路径：

- 打开开关时写入 `agent.<id>.hidden = true`
- 关闭开关时，如果 project override 只剩 `hidden` 字段，则删除该 agent override
- 关闭开关时，如果 project override 还有其他字段，则删除 `hidden` 后通过 `upsertAgentConfig()` 保留其余配置

这条路径只对 `mode: 'subagent'` 且未 `disable` 的条目开放，因为 OpenCode 的 `hidden` 语义主要用于子代理 `@` 菜单可见性。

## 关键方法

| 方法 | 说明 |
|------|------|
| `attach()` | 挂载 Agents section，创建默认主代理下拉与 agent 目录容器，并启动首次异步刷新 |
| `dispose()` | 递增 refresh run id，防止旧异步加载结果回写已重建的设置页 |

## 与其他模块的交互

- `OpenCodianSettings.ts`: 创建并挂载本 owner，把 Agents section 从主设置页中独立出来
- `OpenCodeService`: 通过 SDK facade 的 `app.agents()` 读取 runtime agent 目录
- `OpencodeConfigManager`: 读取 / 写回 project `agent`、legacy `mode` import、`default_agent`
- `core/types/opencodeConfig.ts`: 提供 `OpencodeAgentConfig` / `OpencodeAgentMode` 类型
- `i18n/locales/*`: 提供 Agents section 标题、目录来源、mode、状态与错误文案

## 注意事项

- 不要在 `OpenCodianView.ts` 或 `OpenCodeService.ts` 中追加 Agents settings ownership；设置页写回应继续留在本 owner 与 `OpencodeConfigManager` seam 内。
- 当前 owner 只写项目级 `.opencode/opencode.json`，不要读写全局 OpenCode 配置。
- 后续补充 CRUD 时，优先扩展这个 owner 或相邻 modal，而不是把 agent 表单逻辑塞回 `OpenCodianSettings.ts`。
