# SettingsPluginSection

> **源码**: `src/features/settings/SettingsPluginSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsPluginSection` 是 settings/plugins 分区的厚 owner。它从 `OpenCodianSettings.ts` 接管插件管理 section 的完整 lifecycle：插件环境快照刷新、project config plugin 编辑器、isolation mode 写回、项目插件目录创建，以及项目级 OMO 配置创建/打开。

这个 owner 的职责边界刻意保持在“**plugin management section 装配 + snapshot refresh orchestration**”：

- 持有 plugin section 级别的 DOM 组装、快照渲染与 action wiring
- 使用 `PluginManagementService` 读取 global/project config 与插件目录快照
- 保存 project config 中的 `plugin` 列表，并保留 local/remote restart notice 语义
- 管理 OMO 配置文件的创建、写入 vault adapter 与 Obsidian tab 打开流程

## 核心逻辑

### section lifecycle 收束

`attach()` 会在一个 owner 内完成 plugins section 的主要阶段：

- 创建 section heading 与 overview/global/project-directory/OMO 四个 subsection
- 首次刷新 `PluginEnvironmentSnapshot` 并回填 project config textarea
- 装配 refresh/open raw config action
- 装配 project config plugin 保存按钮
- 装配 isolation mode dropdown、project plugin directory create action 与 OMO open action

这样 `OpenCodianSettings` 不再直接持有 plugin snapshot、editor、directory 或 OMO lifecycle 细节，只保留 owner 创建与 formatting bridge。

### snapshot refresh orchestration

owner 内部把快照刷新链路集中起来：

- 用当前 `server.mode` 与 `pluginIsolationMode` 调用 `PluginManagementService.inspect()`
- 将 `projectConfigSpecs` 格式化回 textarea，保持 project config editor 与快照同步
- 渲染 service/isolation/global influence、global/project plugin 来源、project directory 与 OMO 状态
- 插件来源分组会把路径状态和已检测插件数分开渲染：目录路径逐行显示 `available/missing`，插件条目只代表实际检测结果，避免“路径不存在但下方还有插件”的误读
- 在手动 refresh 时显示成功/失败 notice

`dispose()` 会递增 refresh run id，避免 settings tab 关闭或重建后的旧异步刷新继续更新旧 DOM。

## 关键方法

| 方法 | 说明 |
|------|------|
| `attach()` | 构建并挂载 plugins section，启动首次快照刷新，并注册所有 plugin management actions |
| `dispose()` | 使当前异步快照刷新失效，供 settings tab 重建或关闭时调用 |

## 与其他模块的交互

- `OpenCodianSettings.ts`: 创建并复用 owner，向其提供 section heading、inline-code formatting 与 setting name/desc formatting seams
- `PluginManagementService.ts`: 提供 plugin 快照、project plugin config 写回、project plugin directory 创建与 OMO config 创建
- `OpencodeConfigManager.ts`: 用于 raw `.opencode/opencode.json` modal 与 project plugin config 写回
- `OpencodeConfigModal.ts`: 提供 raw OpenCode config 编辑入口
- `shared/vault.ts`: 通过 `getVaultBasePath()` 获取 vault base path，用于 project scope 与 OMO 文件相对路径

## 注意事项

- 不要改变 plugin snapshot 来源、project/global 解析顺序、restart notice 语义或 OMO 配置创建规则。
- `pluginIsolationMode` 写回后必须保存设置并刷新 snapshot；OpenCode 服务是否需要重启仍通过既有 notice 告知。
- OMO action 需要先确保 project OMO config 存在，再把文件镜像进 vault adapter 并用 `workspace.openLinkText()` 打开。
- 如果后续继续推进 plugins lane，优先在这个 owner 内扩展完整 section lifecycle，而不是回到 `OpenCodianSettings` 主类里追加闭包。

## 2026-04-24 Tabbed layout support

Added `attachTabbed(containerEl, secondaryTabId)` method for the tabbed settings layout. It routes content by secondary tab:

- `overview` — renders environment snapshot overview
- `global` — renders global plugin source display
- `project-directory` — renders project plugin directory management
- `omo` — renders OMO config management

The classic `attach()` method remains unchanged.
