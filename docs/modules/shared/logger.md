# Logger

> **源码**: `src/shared/logger.ts`
> **状态**: [REVIEW]

## 概述

`logger.ts` 是 OpenCodian 的共享日志内核。它提供：

- `createLogger(scope, options?)`
- `always / info / debug / warn / error` 五级日志
- 最近日志环形缓存
- debug 总开关、模块开关、刷新间隔
- 高频日志的指纹去重 / 节流 helper

当前契约是：普通用户默认安静；只有 `always` / `warn` / `error` 默认可见，`info` / `debug` 需要“总开关 + 模块开关”都放行。

## 核心类型 / 接口

```typescript
interface Logger {
  always: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

interface LogEntry {
  timestamp: string;
  level: 'always' | 'info' | 'debug' | 'warn' | 'error';
  method: 'log' | 'warn' | 'error';
  scope: string;
  moduleKey: DebugModuleKey;
  channel?: string;
  message: string;
}
```

## 核心逻辑

### 级别与 gating

| 级别 | 默认输出 | 说明 |
|------|----------|------|
| `always` | 是 | 启动首行、关键 build marker 等极少数一次性状态 |
| `info` | 否 | 需要 `enableDebugLogging=true` 且模块开关打开 |
| `debug` | 否 | 同样受总开关 + 模块开关控制 |
| `warn` | 是 | 降级和非致命异常 |
| `error` | 是 | 真实错误 |

`createLogger(scope)` 会先通过 `resolveDebugModuleKey(scope)` 归到一个 debug module；如果调用方显式传 `moduleKey`，则优先用显式值。调用方还可以传 `channel`，目前用于 Claude Code SDK diagnostics 的 `runtime`、`sessions`、`stream`、`permissions`、`mcp` 和 `experimental` 细分过滤。

Claude Code 的 `info` / `debug` 日志额外受 `backendSettings.claudeCode.debugChannels` 控制。关闭某个通道会抑制对应可选日志进入 console 和最近日志缓存，但不影响 `warn` / `error`。

### 最近日志缓存

- `recentLogEntries` 最多保留 `500` 条
- 只有真正输出的日志才会进入缓存
- `getRecentLogText()` 会输出 `[LEVEL] [moduleKey] [channel?] [scope]` 头信息
- `clearRecentLogs()` 可由设置页主动清空缓存

### 高频日志节流

`shouldEmitLogFingerprint(key, fingerprint, options?)` 用统一缓存记录：

- 最近一次指纹
- 最近一次输出时间

相同指纹在刷新间隔内会被抑制；payload 发生变化时则立即放行。`ActiveTabContextUsageCoordinator` 现在用它抑制空闲轮询刷屏。

## 关键方法

| 方法 | 说明 |
|------|------|
| `createLogger(scope, options?)` | 创建日志器；可选显式 `moduleKey` |
| `setDebugLoggingEnabled(enabled)` | 设置总 debug 开关 |
| `setDebugModuleSettings(settings)` | 批量写入模块开关 |
| `setDebugModuleEnabled(moduleKey, enabled)` | 切换单个模块开关 |
| `setDebugRefreshIntervalMs(intervalMs)` | 设置高频日志刷新间隔 |
| `setInlineSerializedDebugLogArgsEnabled(enabled)` | debug 对象参数是否内联 JSON |
| `getRecentLogEntries()` / `getRecentLogText()` / `getRecentLogTextForEntries()` | 读取最近日志缓存或格式化已过滤条目 |
| `clearRecentLogs()` | 清空最近日志缓存 |
| `shouldEmitLogFingerprint()` | 高频日志的共享节流 / 去重 helper |
| `resetLogEmissionThrottleState()` | 重置节流状态（主要供测试使用） |

## 与其他模块的交互

- `src/shared/debugModules.ts`: 提供模块注册表、默认值和 scope 映射
- `src/main.ts`: 在设置加载 / 保存后同步 logger 全局状态，并输出 `always` 启动 build marker
- `src/features/settings/SettingsDebugSection.ts`: 暴露 debug 总开关、模块开关、刷新间隔、清空缓存和诊断动作
- `src/features/settings/SettingsDebugSection.ts`: Claude Code 页按 `moduleKey === 'claudeCode'` 与 channel 设置过滤最近日志预览
- `src/features/chat/services/ActiveTabContextUsageCoordinator.ts`: 使用共享指纹节流避免 context-usage 轮询刷屏

## 注意事项

- `info` 不再默认输出；如果某条日志必须始终可见，应改成 `always`、`warn` 或 `error`。
- 高频日志的指纹应尽量排除纯耗时字段，否则会因为每次耗时波动而失去去重效果。
- 最近日志缓存是内存态；插件重载后会清空。
