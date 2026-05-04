# LocalSidecarProcessInspector / LocalProcessProbe

> **源码**: `src/core/opencode/LocalSidecarProcessInspector.ts`
> **状态**: [REVIEW]

## 概述

本模块现在包含两个协作 owner：

- `LocalSidecarProcessInspector`：纯 OS 进程信息查询
- `LocalProcessProbe`：组合端口 bind 探测、端口释放轮询、managed pid 终止（含 Windows 进程树）与 plugin-managed listener 判定包装

`LocalSidecarProcessInspector` 继续负责跨平台查询逻辑，包括：

- 根据本地端口反查监听进程的 PID
- 根据 PID 获取进程的完整命令行
- 判断某个 PID 是否仍在运行
- 同步检查本地端口是否可用

`LocalProcessProbe` 在其上叠加 lifecycle 侧需要的“可执行动作”与轮询流程，使 `ServerManager` 不再直接持有这批 process/port primitive。

## 导入关系

```text
上游:
- Node `child_process`, `net`
- `../../shared` logger

下游:
- `src/core/opencode/ServerManager`
```

## 核心逻辑

### 端口到 PID 的映射

`getListeningProcessId(port, host?)` 和 `getListeningProcessIdSync(port, host?)` 分别使用异步和同步方式查询监听指定端口的进程：

- **非 Windows**: 通过 `lsof -nP -iTCP:${port} -sTCP:LISTEN -t` 获取 PID
- **Windows**: 通过 `Get-NetTCPConnection -State Listen -LocalPort ${port}` 获取 `OwningProcess`

返回值会经过 `Number.parseInt` 校验，只有正整数才会被返回。

当调用方传入 host 时，查询会按当前 local address 过滤：

- Windows: 在 PowerShell 中按 `LocalAddress` 过滤目标 host，并允许 `0.0.0.0` / `::` 这类 wildcard listener。
- 非 Windows: 使用 `lsof -F pn` 输出解析 pid/address 对，优先返回 exact host 命中，其次接受 wildcard listener。

这让调用方在 `127.0.0.1` / `localhost` / `0.0.0.0` 等同端口场景下可以减少端口 owner 误判；当前 `LocalSidecarLauncher` 用它确认 Windows/npm wrapper 退出后是否仍有当前 host/port 上的 plugin-managed listener。

### 命令行解析

`getProcessCommandLine(pid)` 和 `getProcessCommandLineSync(pid)` 获取指定 PID 的完整启动命令：

- **非 Windows**: `ps -p ${pid} -o command=`
- **Windows**: `Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}"`

### PID 存活检查

`isPidRunning(pid)` / `isPidRunningSync(pid)` 是命令行查询的便捷包装：当命令行非空时认为进程仍在运行。

### 同步端口可用性检查（Inspector）

`isLocalPortAvailableSync(port)` 与 `ServerManager` 内部的 `isPortAvailable()`（基于 `net.createServer`）不同：

- 它使用平台命令直接查询是否有进程在监听该端口
- 在 `dispose()` 的同步清理路径中被使用，因为同步场景下无法启动 `net.Server`
- 返回 `true` 表示端口空闲，`false` 表示端口被占用或查询失败

### 命令输出捕获（Inspector）

`captureCommandOutput(command, args)` 是一个内部辅助方法，负责：

- `spawn` 子进程
- 捕获 `stdout`
- 在退出码为 0 时返回 trimmed stdout，否则返回 `null`

### 端口 bind 探测与端口释放轮询（LocalProcessProbe）

- `canBindLocalEndpoint(host, port)` 使用 `net.createServer` 做真实 bind 预检
- `waitForPortAvailability(host, port, timeout)` 以 200ms 周期轮询端口释放，供 `ServerManager` stop/restart 复用
- `isLocalPortAvailableSync(port)` 复用 inspector 的同步查询路径，保证 `dispose()` 同步释放检查仍可用

### managed pid 终止 primitive（LocalProcessProbe）

- `terminateManagedPid(pid)`：
  - Windows: `taskkill /T /F`（失败时二次确认 pid 存活）
  - 非 Windows: `SIGTERM` 后短等待，再尝试 `SIGKILL`
- `terminateManagedPidSync(pid)` 提供同步版（主要用于 `dispose()`）
- `getCurrentPluginManagedListenerPid*` 把“端口监听 pid 查询 + 命令行判定回调”收口到同一边界

## 关键方法

| 方法 | 说明 |
|------|------|
| `LocalSidecarProcessInspector.getListeningProcessId*` | 查询监听端口 PID（异步/同步，可按 host 过滤） |
| `LocalSidecarProcessInspector.getProcessCommandLine*` | 查询 PID 命令行（异步/同步） |
| `LocalSidecarProcessInspector.isPidRunning*` | 查询 PID 存活（异步/同步） |
| `LocalSidecarProcessInspector.isLocalPortAvailableSync` | 同步端口占用检查 |
| `LocalProcessProbe.canBindLocalEndpoint` | 真实 bind 预检 host/port |
| `LocalProcessProbe.waitForPortAvailability` | 轮询端口释放 |
| `LocalProcessProbe.terminateManagedPid*` | managed pid 终止 primitive（异步/同步） |
| `LocalProcessProbe.getCurrentPluginManagedListenerPid*` | 查询并判定 plugin-managed listener pid |

## 与其他模块的交互

- `ServerManager` 是唯一消费者，并通过 `LocalProcessProbe` 委托：
  - local endpoint bind 探测与端口释放轮询
  - 启动后 listener pid 刷新、adopt 前端口 owner/命令行检查
  - stop/restart/dispose 的 managed pid 终止 primitive
  - plugin-managed listener pid 查询（通过命令行判定回调）

## 注意事项

- `LocalSidecarProcessInspector` 仍是纯查询 owner；`LocalProcessProbe` 包含有副作用的终止动作
- 平台判断使用 `process.platform`，不支持运行时切换平台
- 命令执行失败时统一返回 `null` 而不是抛错，调用方需要自行处理
- 本模块不缓存查询结果，每次调用都会重新执行系统命令
