# Debug Modules

> **源码**: `src/shared/debugModules.ts`
> **状态**: [REVIEW]

## 概述

`debugModules.ts` 是调试日志模块注册表的单一事实源。它定义：

- 可在设置页暴露的 debug module 列表
- 每个模块的 i18n label / desc key
- 默认模块开关状态
- 高频日志刷新间隔的默认值与归一化范围
- `scope -> moduleKey` 的默认映射规则

这样 logger、settings UI、设置归一化和测试都可以共享同一份模块定义，避免“新增 scope 但忘了给设置页加开关”的漂移。

## 核心类型

```typescript
type DebugModuleKey =
  | 'app'
  | 'settings'
  | 'server'
  | 'models'
  | 'chat'
  | 'contextUsage'
  | 'streaming'
  | 'tasks'
  | 'storage'
  | 'providerIcons'
  | 'visuals';

type DebugModuleSettings = Record<DebugModuleKey, boolean>;
```

## 核心逻辑

### 注册表

`DEBUG_MODULE_REGISTRY` 为每个模块提供：

- `key`
- `labelKey`
- `descriptionKey`
- `defaultEnabled`

### 默认值与归一化

- `getDefaultDebugModuleSettings()`：生成所有模块默认开关
- `normalizeDebugModuleSettings()`：把持久化设置收敛为完整布尔表
- `normalizeDebugRefreshIntervalMs()`：把刷新间隔限制在稳定范围内

### scope 映射

`resolveDebugModuleKey(scope)` 按现有 logger scope 名称把日志归到较粗粒度的模块：

- `ActiveTabContextUsageCoordinator` → `contextUsage`
- `Stream*` / `Streaming*` → `streaming`
- `Question*` / `Todo*` / `BackgroundTask*` → `tasks`
- `OpenCode*` / `ServerManager` → `server`
- `Settings*` / `*Modal` / `*Editor` → `settings`
- 其余聊天视图类 scope 收到 `chat`

## 与其他模块的交互

- `src/shared/logger.ts`: 读取模块默认值、判断模块开关、解析默认 `moduleKey`
- `src/core/types/settings.ts`: 复用默认值与归一化函数，持久化 `debugModuleSettings` / `debugRefreshIntervalMs`
- `src/features/settings/SettingsDebugSection.ts`: 用注册表动态生成设置项
- `tests/unit/shared/logger.test.ts`: 校验模块开关与节流契约

## 注意事项

- 新增可选 debug 日志子系统时，优先先改这个注册表，再改具体 logger scope。
- `resolveDebugModuleKey()` 只做粗粒度归类；如果某个 scope 需要更明确归类，优先在 `createLogger(scope, { moduleKey })` 里显式指定。
