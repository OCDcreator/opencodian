# SettingsCodexPluginsSection

> **源码**: `src/features/settings/SettingsCodexPluginsSection.ts`
> **状态**: [ACTIVE]

## 概述

`SettingsCodexPluginsSection.ts` 是 Codex 设置 `plugins` 二级 tab 的渲染 owner。它通过活动 Codex 后端适配器暴露的 plugin management 方法（`plugin/list`、`plugin/installed`、`plugin/install`、`plugin/uninstall`、`plugin/reconcile` 的薄委托）渲染插件浏览器：市场上可用插件列表、已安装插件列表，以及安装 / 卸载 / 对账同步操作。全部操作为只读为主：本面板绝不写 Codex 配置文件。

## 导入关系

上游: `obsidian`（Notice）、`CodexAppServerClientTypes`（plugin 路由 wire 类型）、`i18n`、`main`
下游: 由 `SettingsCodexSection` 在 `plugins` tab 下实例化（与 `resources` 相同的 borderless host 契约）

## 核心导出

| 导出 | 说明 |
|------|------|
| `SettingsCodexPluginsSection` | 渲染 Codex 插件浏览器；`render(bodyEl)` 为入口 |
| `SettingsCodexPluginsSectionOptions` | `{ plugin, createSectionHeading, onAfterMutation? }`；成功安装 / 卸载 / 对账后调用 callback，供 host 失效 runtime/catalog |

## 核心行为

- 诚实可用性规则（与 `SettingsCodexResourcesSection` 一致）：Codex 后端未激活（registry 返回 null）、适配器缺少 plugin 方法、或路由返回 null 时，根节点 `data-codex-plugins-state="unavailable"` 并显示明确不可用文案——绝不渲染假的空列表。
- 头部操作：`Refresh`（重新查询两个列表）与 `Reconcile`（调用 `plugin/reconcile`，Notice 汇报 `{changed}`/`{failed}` 计数，然后重载）。
- 两个组共用 resources 的卡片/滚动区样式类：`marketplace`（`plugin/list`）与 `installed`（`plugin/installed`）；每组独立空态使用共享 `.opencodian-settings-inline-empty`。marketplace 级加载失败（`marketplaceLoadErrors`）以 muted 错误行展示在两个组下方。
- 每个插件一行：`data-plugin-id` / `data-plugin-name` / `data-plugin-installed` / `data-plugin-enabled` 属性；安装策略（`AVAILABLE` / `NOT_AVAILABLE` / `INSTALLED_BY_DEFAULT`）渲染为 tonal badge；`availability` 与 `disabledReason` 以 muted 元数据展示。
- 安装流（marketplace 组）：`window.confirm` 确认 → `installCodexPlugin(plugin.name, options)`（本地市场传 `marketplacePath`，无 path 的远程目录传 `remoteMarketplaceName`）→ 结果 null 显示失败 Notice；`appsNeedingAuth` 非空时显示需授权应用列表的 Notice（不实现 OAuth 流）；成功后静默 `reconcileCodexPlugins()` → `onAfterMutation?.()` → 重载。
- 卸载流（installed 组）：`window.confirm` 确认 → `uninstallCodexPlugin(plugin.id)`；返回 false 显示失败 Notice 且不对账；成功后 `reconcileCodexPlugins()` → `onAfterMutation?.()` → 重载。
- 并发防护：`mutationInFlight` set 去重安装 / 卸载 / 对账；`loadGeneration` 计数器丢弃过期异步渲染结果，防止 mutation 重载后被在途的旧列表覆盖。
- 行内按钮在请求期间禁用并切换文案（`Installing...` / `Uninstalling...`）。

## 注意事项

- 适配器 seam 类型中所有方法均为可选：后端未激活或适配器早于 plugin 路由时，面板自动降级为不可用态，而不是抛错。
- 安装 / 卸载只改变 app-server 管理的插件状态；聊天菜单 runtime skill 真相仍由 `CodexAppServerClient.listSkills()` + `skills/changed` 失效驱动，`onAfterMutation` 仅负责让失效立即发生。
