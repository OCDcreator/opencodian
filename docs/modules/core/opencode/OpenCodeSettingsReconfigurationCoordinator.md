# OpenCodeSettingsReconfigurationCoordinator

> **源码**: `src/core/opencode/OpenCodeSettingsReconfigurationCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`OpenCodeSettingsReconfigurationCoordinator` 是 `OpenCodeService` 内部的 settings reconfiguration owner。它把原本散落在 `OpenCodeService.updateSettings()` 周围的完整重配置 lifecycle 收束到一个较厚 coordinator 中，包括：

- 新旧 settings 差异分析与 update plan 构造
- managed server restart / stop 决策
- 本地 host/port 切换前的占用预检
- sync/open-code subscription pause / resume
- 失败后的 settings/baseUrl/server config 回滚，以及原 managed server 尽力恢复

这样 `OpenCodeService` 可以回到 façade + host seam 角色，而不用继续直接铺开 reconfiguration / rollback / subscription 细节。

## 导入关系

```text
上游:
- `../../shared`
- `../types/settings`
- `./types`

下游:
- `src/core/opencode/OpenCodeService`
- 单元测试
```

## 核心类型 / 接口

- `OpenCodeSettingsReconfigurationCoordinatorHost`: host seam，提供当前 settings/baseUrl 读写、tool catalog scope invalidation，以及 server/subscription runtime 端口。
- `OpenCodeSettingsUpdatePlan`: 单次 settings 更新的快照，记录新旧 mode、baseUrl、tool catalog scope、subscription wanted state，以及 managed server 的 stop/restart 决策。
- `OpenCodeSettingsRestartDecision`: restart 判定所需的 config/auth/source-mode/isolation-mode 输入。

## 核心逻辑

### Update plan

`updateSettings()` 先读取 host 当前状态，再构造一份 plan：

- 保留 `previousSettings` / `previousBaseUrl`
- 深拷贝 `nextSettings`
- 记录更新前 tool catalog scope
- 记录 sync/open-code subscriptions 是否有活跃 listener
- 基于 mode、local host/port、auth、`modelSourceMode` 与 `pluginIsolationMode` 计算 managed server restart/stop 决策

### Apply / complete

apply 阶段会按固定顺序执行：

1. 更新 host 当前 settings 与 baseUrl
2. 把新的 server config 写入 `ServerManager`
3. 让 `OpenCodeService` 的 tool schema cache 在 scope 变化时失效
4. 暂停 sync/open-code subscriptions

随后 complete 阶段只做 lifecycle 决策：

- `local -> remote` 等场景：停止 managed server
- local runtime config / auth / source mode / isolation mode 变化：重启 managed server
- 无需 stop/restart：只恢复 subscriptions

### Rollback

如果 stop/restart 过程中抛错，coordinator 会：

1. 恢复旧 settings 与旧 baseUrl
2. 把旧 server config 写回 `ServerManager`
3. 再次执行同一条 scope invalidation / subscription pause 链路
4. 在旧模式原本是 local 且本次计划涉及 stop/restart 时，尽力重新 `start()` 原 managed server
5. 最后恢复 subscriptions，并把原始错误继续向上抛出

## 与其他模块的交互

- `OpenCodeService` 只负责创建 coordinator 并提供 host seam；公开 `updateSettings()` 继续保留在服务层。
- `ServerManager` 的 managed adoption / restart 规则保持不变；本模块只消费 `isRunning()`、`canBindLocalEndpoint()`、`stop()`、`restart()`、`start()` 与 `updateConfig()`。
- `OpenCodeCatalogQueryCoordinator` 仍拥有 tool schema cache；coordinator 只是借 host seam 触发 scope 变更时的 cache invalidation。
- `OpenCodeSyncEventRuntimeCoordinator` 与 `OpenCodeEventSubscriptionCoordinator` 仍各自拥有 wanted state / listener registry；这里仅统一编排 pause / resume 时机。

## 注意事项

- 不要把本模块再次拆成 `SettingsUpdatePlanBuilder`、`ServerRestartDecider`、`SubscriptionPauseHelper` 之类薄层；本轮目标就是保留单一厚 owner。
- 不要改变 managed server adoption/restart 规则、auth fallback、directory scope 或 sync/open-code event restart 条件。
- `createServerConfig()` 需要继续保持与 `OpenCodeService` 初始 `ServerManager` 配置一致，避免构造期与更新期语义漂移。
