# LocalSidecarEndpointResolver

> **源码**: `src/core/opencode/LocalSidecarEndpointResolver.ts`
> **状态**: [REVIEW]

## 概述

`LocalSidecarEndpointResolver` 负责本地 OpenCode sidecar 端点被健康服务占用时的 domain 判定与诊断文本组装。它不查询系统进程、不 kill 进程、不启动 server，只把 `ServerManager` 和 `LocalSidecarProcessInspector` 提供的事实转换成稳定决策：

- 已持久化的 managed sidecar 能否 adopt
- stale managed sidecar 是否需要 restart
- 默认插件端点上的 orphan sidecar 是否可以 recycle
- 其它健康服务占用端点时应返回怎样的 conflict diagnostics / message

因此它是 `ServerManager` 的相邻运行时 owner：`ServerManager` 仍负责生命周期执行与状态变更，本模块负责 sidecar endpoint truth semantics。

## 导入关系

```text
上游:
- `../types/settings`
- `./types`

下游:
- `src/core/opencode/ServerManager`
```

## 核心类型 / 状态

- `ExistingServerProcessInfo`: 端口监听 PID、命令行，以及命令行分类结果
- `SidecarCommandClassification`: `looksLikeOpenCodeServe` / `looksLikePluginManagedSidecar`
- `ManagedServerAdoptionOutcome`: `adopted` / `restart` / `skip`
- `OccupiedLocalEndpointResolution`: `adopt-managed` / `restart-managed` / `recycle-orphan` / `conflict`
- `LocalSidecarEndpointResolverRuntime`: `ServerManager` 注入的窄 callback 集合，用于获取 adopt 结果、现有健康 server 信息和当前 persisted managed state

本类自身不保存 mutable runtime state；构造时只持有当前 `OpenCodeServerConfig`，配置变更时由 `ServerManager.updateConfig()` 重建 resolver。

## 核心逻辑

### 命令行分类

`classifyCommandLine()` 先判断命令行是否像当前配置端点上的 `opencode serve`：

- 命令包含 `opencode` 与 ` serve`
- port 支持 `--port 4196` 与 `--port=4196`
- hostname 支持 `--hostname 127.0.0.1` 与 `--hostname=127.0.0.1`

在此基础上，只有同时包含 Obsidian CORS 标记的命令才会被判定为 plugin-managed sidecar。

### 健康占用端点决策

`resolveOccupiedHealthyLocalEndpoint()` 的顺序保持与原 `ServerManager` 语义一致：

1. 先尝试 adopt 已持久化 managed server
2. 如果 listener PID 或 signature stale，则要求 restart
3. 如果没有可 adopt 的 managed state，则检查当前健康占用者
4. 仅当默认插件端点上没有 persisted state 且占用者像 plugin-managed sidecar 时，允许 recycle orphan
5. 其它情况返回 conflict diagnostics

### 诊断文本

`buildOrphanRestartDiagnostics()`、`buildHealthyLocalConflictDiagnostics()` 和 `buildConflictMessage()` 统一生成 settings/status 面板与启动错误使用的 sidecar diagnostics 文本，避免这些文案散落在生命周期执行代码中。

## 关键方法

| 方法 | 说明 |
|------|------|
| `resolveOccupiedHealthyLocalEndpoint(runtime)` | 对健康占用本地端点做 adopt / restart / recycle / conflict 判定 |
| `classifyCommandLine(commandLine)` | 返回 OpenCode serve / plugin-managed sidecar 分类结果 |
| `looksLikeOpenCodeServeCommand(commandLine)` | 判断命令是否像当前 host/port 的 `opencode serve` |
| `looksLikePluginManagedSidecarCommand(commandLine)` | 判断命令是否像 OpenCodian 启动的 sidecar |
| `shouldRecycleUnknownLocalServer(existingServer, managedServerState)` | 判断默认端点上的未知健康 server 是否可当 orphan sidecar 回收 |
| `buildOrphanRestartDiagnostics(existingServer)` | 生成 orphan sidecar 被重启后的成功 diagnostics |
| `buildHealthyLocalConflictDiagnostics(existingServer)` | 生成健康端点冲突 diagnostics |
| `buildConflictMessage(existingServer, healthy)` | 生成启动失败时抛出的用户可读冲突信息 |

## 与其他模块的交互

- `ServerManager` 在 `handleHealthyOccupiedLocalEndpoint()` 中调用本模块返回的 resolution，但仍由 `ServerManager` 执行 restart、recycle、spawn、status/diagnostics mutation。
- `LocalSidecarProcessInspector` 仍是唯一 OS 进程查询 owner；本模块只消费查询结果。
- `OpenCodeServiceLifecycleCoordinator` 只消费 server lifecycle 状态，不直接依赖本模块。

## 注意事项

- 不要把 process kill、port wait、spawn、health probe 等生命周期执行逻辑移入本模块。
- 新的 sidecar truth 规则应优先在本模块和对应 unit tests 中覆盖，再由 `ServerManager` 调用。
- 如果 local host/port 配置发生变化，必须重建 resolver，避免命令行分类继续使用旧配置。
