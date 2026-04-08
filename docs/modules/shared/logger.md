# Logger

> **源码**: `src/shared/logger.ts`
> **状态**: [REVIEW]

## 概述

结构化日志工具模块。通过 `createLogger(scope)` 创建带前缀的 Logger 实例，支持 info/debug/warn/error 四个级别。维护最近 500 条日志的内存环形缓冲区，用于诊断导出。Debug 级别可通过 `setDebugLoggingEnabled()` 或 localStorage 开关控制；另外还能通过 `setInlineSerializedDebugLogArgsEnabled()` 把 debug 的对象参数改成内联 JSON 文本，方便直接在 Console 行内查看。

## 导入关系
上游: 无（纯工具模块）
下游: 几乎所有模块（`ProviderIconService`, `StreamController`, `OpenCodeService`, `ServerManager` 等）

## 核心类型 / 接口

### Logger（接口）
```typescript
interface Logger {
  info: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}
```

### LogEntry（内部）
```typescript
interface LogEntry {
  timestamp: string;      // ISO 8601
  method: 'log' | 'warn' | 'error';
  scope: string;
  message: string;
}
```

## 核心逻辑

### 日志级别行为

| 方法 | 行为 |
|------|------|
| `info` | 始终输出到 console.log + 记录到缓冲区 |
| `debug` | 仅 debug 模式启用时输出 + 记录 |
| `warn` | 始终输出到 console.warn + 记录 |
| `error` | 始终输出到 console.error + 记录 |

### Debug 模式检测

`isDebugEnabled()` 检查顺序：
1. `globalThis.__OPENCODIAN_DEBUG__` 全局标志
2. `localStorage.getItem('opencodian:debug') === 'true'`

### 日志格式

`formatArgs(scope, args, options)` 在第一条消息前添加 `[HH:MM:SS] [scope]` 前缀。默认保留对象参数为独立 console 参数；当 `inlineSerializeNonStringArgs` 开启时，会把 debug 日志里的非字符串参数先序列化，再直接拼进消息文本。

### 环形缓冲区

`recentLogEntries` 数组最多保留 `MAX_LOG_ENTRIES=500` 条记录。超出时从头部删除最旧的条目。

### 序列化

`stringifyArg()` 处理不同类型的参数：
- `string` → 直接返回
- `Error` → 返回 `stack` 或 `message`
- 其他 → `JSON.stringify()`，失败则 `String()`

## 关键方法

| 方法 | 说明 |
|------|------|
| `createLogger(scope)` | 创建带前缀的 Logger 实例 |
| `setDebugLoggingEnabled(enabled)` | 启用/禁用 debug 级别日志 |
| `setInlineSerializedDebugLogArgsEnabled(enabled)` | 控制 debug 日志是否把对象参数内联序列化到消息文本 |
| `getRecentLogEntries()` | 获取最近日志条目数组 |
| `getRecentLogText()` | 获取最近日志的格式化文本（用于诊断导出） |

## 数据流

```
createLogger('OpenCodeService')
  → { info, debug, warn, error }

logger.info('Server started on port', port)
  → pushRecentLog('log', 'OpenCodeService', ['Server started on port', port])
  → emit('log', 'OpenCodeService', [...])
    → formatArgs('OpenCodeService', [...], { inlineSerializeNonStringArgs: false })
      → ['[14:30:05] [OpenCodeService] Server started on port', 3000]
    → console.log(...)

getRecentLogText()
  → recentLogEntries.map(format).join('\n')
  → "2026-04-04T06:30:05.123Z [LOG] [OpenCodeService] Server started on port 3000"
```

## 与其他模块的交互

- **几乎所有模块**: 通过 `createLogger(scope)` 获取日志器
- **OpenCodianSettings (Debug 面板)**: 调用 `setDebugLoggingEnabled()`、`setInlineSerializedDebugLogArgsEnabled()` 和 `getRecentLogText()` 实现调试开关与诊断导出
- **main.ts**: 初始化时可能设置 debug 模式

## 配置项

| 常量 | 值 | 说明 |
|------|-----|------|
| `DEBUG_STORAGE_KEY` | `'opencodian:debug'` | localStorage 键名 |
| `DEBUG_FLAG_KEY` | `'__OPENCODIAN_DEBUG__'` | 全局标志键名 |
| `INLINE_SERIALIZED_DEBUG_ARGS_FLAG_KEY` | `'__OPENCODIAN_INLINE_SERIALIZED_DEBUG_ARGS__'` | debug 参数内联序列化开关 |
| `MAX_LOG_ENTRIES` | 500 | 内存缓冲区最大条目数 |

## 注意事项

- 日志前缀约定：`[OpenCodian]`, `[ServerManager]`, `[OpenCodeService]`, `[OpenCodianView]`, `[OpenCodianSettings]`, `[ProviderIconService]`, `[StreamController]`, `[i18n]`
- `debug` 日志包含敏感信息时应注意过滤
- `getRecentLogText()` 返回完整日志文本，可能较大
- 环形缓冲区在插件重载后清空（模块级状态）

