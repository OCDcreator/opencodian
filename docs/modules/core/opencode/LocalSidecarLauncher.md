# LocalSidecarLauncher

> **源码**: `src/core/opencode/LocalSidecarLauncher.ts`
> **状态**: [REVIEW]

## 概述

`LocalSidecarLauncher` 是 `ServerManager` 的本地 sidecar launch-context owner。它集中持有以下启动语义：

- OpenCode binary 解析与 `spawn` 参数构造
- 本地 launch 输出 tail 跟踪（stdout/stderr）
- 启动期进程异常/提前退出检测
- ready 健康等待轮询与启动失败错误组装
- 启动环境变量清洗与注入

`ServerManager` 仍然是生命周期/state owner：状态机变更、managed pid truth、adopt/restart/conflict 决策与 diagnostics 仍留在 `ServerManager`。

## 导入关系

```text
上游:
- Node `child_process`, `fs`, `path`
- `../../shared`
- `./types`

下游:
- `src/core/opencode/ServerManager`
```

## 核心类型 / 状态

- `LocalSidecarLaunchRuntimeOptions`: 启动超时、健康探针回调、managed state 快照、进程 error/exit 回调
- `LocalSidecarLaunchRuntimeResult`: 启动过程时间戳与 `ChildProcess`
- `activeLaunch`: 启动窗口内的输出 tail + 退出/错误快照

## 核心逻辑

### launchRuntime

`launchRuntime()` 顺序执行：

1. `spawnServer()` 拉起本地 sidecar 并挂接 launch tracking
2. `waitForHealthy()` 轮询健康检查并实时检测启动失败
3. 返回 spawn/ready 时间戳，供 `ServerManager` 输出 startup 性能日志

### 启动失败组装

当进程在 ready 前报错或退出时，`throwIfLaunchFailed()` 会通过 `buildLaunchFailureError()` 把错误前缀与输出 tail 拼接，确保失败信息包含最近 server 输出。

### 启动环境与二进制解析

- `getSpawnEnv()` 负责清理污染 `OPENCODE_*` 覆盖项，并按 `modelSourceMode` / `pluginIsolationMode` / auth 组装运行时环境。
- `findOpenCodeBinary()` + `resolveExecutableCandidate()` 负责跨平台二进制候选解析。
- Windows npm `opencode.cmd` 会通过 `shell: true` 启动。

## 关键方法

| 方法 | 说明 |
|------|------|
| `launchRuntime(options)` | 本地 sidecar spawn + ready wait 主流程 |
| `clearLaunchState()` | 清理 launch 事件监听与状态快照 |
| `updateConfig(config)` | 配置变更后刷新 launch 上下文 |
| `updateWorkingDirectory(path)` | 刷新本地 sidecar `cwd` |

## 与其他模块的交互

- `ServerManager` 将 `checkHealth` 回调与进程事件回调注入本模块，保持生命周期控制权。
- `ServerManager` 在 `launchRuntime` 成功后负责 managed pid 持久化与 listener pid 刷新。
- `LocalProcessProbe` / `LocalSidecarEndpointResolver` 不直接依赖本模块。

## 注意事项

- 本模块不应持有 `ServerStatus` 或 managed state 真值。
- 本模块不处理 adopt/restart/conflict domain 决策。
- 若新增启动上下文逻辑，优先扩展本模块，避免重新回流到 `ServerManager`。
