# LocalSidecarProcessInspector

> **源码**: `src/core/opencode/LocalSidecarProcessInspector.ts`
> **状态**: [REVIEW]

## 概述

`LocalSidecarProcessInspector` 负责 OS 级别的进程信息查询，是 `ServerManager` 的相邻运行时拥有者。它封装了跨平台的进程探测逻辑，包括：

- 根据本地端口反查监听进程的 PID
- 根据 PID 获取进程的完整命令行
- 判断某个 PID 是否仍在运行
- 同步检查本地端口是否可用

这些操作都直接调用平台原生命令（`lsof`、`ps`、`powershell`），因此构成一个**耐用的协议边界**。

## 导入关系

```text
上游:
- Node `child_process`

下游:
- `src/core/opencode/ServerManager`
```

## 核心逻辑

### 端口到 PID 的映射

`getListeningProcessId(port)` 和 `getListeningProcessIdSync(port)` 分别使用异步和同步方式查询监听指定端口的进程：

- **非 Windows**: 通过 `lsof -nP -iTCP:${port} -sTCP:LISTEN -t` 获取 PID
- **Windows**: 通过 `Get-NetTCPConnection -State Listen -LocalPort ${port}` 获取 `OwningProcess`

返回值会经过 `Number.parseInt` 校验，只有正整数才会被返回。

### 命令行解析

`getProcessCommandLine(pid)` 和 `getProcessCommandLineSync(pid)` 获取指定 PID 的完整启动命令：

- **非 Windows**: `ps -p ${pid} -o command=`
- **Windows**: `Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}"`

### PID 存活检查

`isPidRunning(pid)` / `isPidRunningSync(pid)` 是命令行查询的便捷包装：当命令行非空时认为进程仍在运行。

### 同步端口可用性检查

`isLocalPortAvailableSync(port)` 与 `ServerManager` 内部的 `isPortAvailable()`（基于 `net.createServer`）不同：

- 它使用平台命令直接查询是否有进程在监听该端口
- 在 `dispose()` 的同步清理路径中被使用，因为同步场景下无法启动 `net.Server`
- 返回 `true` 表示端口空闲，`false` 表示端口被占用或查询失败

### 命令输出捕获

`captureCommandOutput(command, args)` 是一个内部辅助方法，负责：

- `spawn` 子进程
- 捕获 `stdout`
- 在退出码为 0 时返回 trimmed stdout，否则返回 `null`

## 关键方法

| 方法 | 说明 |
|------|------|
| `getListeningProcessId(port)` | 异步查询监听端口的 PID |
| `getListeningProcessIdSync(port)` | 同步查询监听端口的 PID |
| `getProcessCommandLine(pid)` | 异步获取 PID 对应的命令行 |
| `getProcessCommandLineSync(pid)` | 同步获取 PID 对应的命令行 |
| `isPidRunning(pid)` | 异步判断 PID 是否仍在运行 |
| `isPidRunningSync(pid)` | 同步判断 PID 是否仍在运行 |
| `isLocalPortAvailableSync(port)` | 同步检查端口是否可用 |

## 与其他模块的交互

- `ServerManager` 是唯一的消费者。它在以下场景委托给本模块：
  - `refreshManagedListenerPid()` - 启动后刷新 listener PID
  - `tryAdoptManagedServer()` / `getAdoptableManagedServerState()` - adopt 前确认端口 PID 和命令行
  - `inspectExistingHealthyServer()` - 检查占用端点的进程信息
  - `getCurrentPluginManagedListenerPid()` / `getCurrentPluginManagedListenerPidSync()` - 查找插件管理的 listener
  - `runManagedShutdownLifecycleSync()` - 同步 dispose 时确认端口已释放
  - `killWindowsProcessTree()` / `killWindowsProcessTreeSync()` - 确认进程是否已终止

## 注意事项

- 所有方法都是纯查询操作，不修改系统状态（除 `isLocalPortAvailableSync` 外，它只是查询）
- 平台判断使用 `process.platform`，不支持运行时切换平台
- 命令执行失败时统一返回 `null` 而不是抛错，调用方需要自行处理
- 本模块不缓存任何查询结果，每次调用都会重新执行系统命令
