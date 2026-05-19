# OpenCodianSettingsRuntimeCoordinator

> **源码**: `src/core/runtime/OpenCodianSettingsRuntimeCoordinator.ts`
> **状态**: [DRAFT]

## 概述

`OpenCodianSettingsRuntimeCoordinator` 是 OpenCodian 的设置运行时 owner。它负责：

- 设置保存编排（服务更新、回滚、持久化、视图刷新、配置同步）
- 主题/外观状态变更和保存触发
- 主题背景资源缓存和解析
- 防抖保存定时器管理

`main.ts` 保留插件生命周期所有权和公共 API 表面；此 coordinator 持有 `saveSettings()` 委托的详细编排逻辑。

## 导入关系

```text
上游:
- `src/shared/logger`
- `src/core/config/OpencodeConfigManager`
- `src/core/storage/StorageService`
- `src/core/theme`
- `src/core/types`

下游:
- `src/main.ts`（构造并提供 host callbacks）
```

## 核心类型 / 接口

```typescript
export interface OpenCodianSettingsRuntimeCoordinatorHost {
  getSettings(): OpenCodianSettings;
  setSettings(settings: OpenCodianSettings): void;
  getOpenCodeService(): OpenCodeService;
  getStorageService(): StorageService;
  getVaultBasePath(): string | null;
  refreshOpenCodianViews(options: { reloadModels?: boolean; applyUi?: boolean }): void;
  invalidateSlashCommandMenuCatalogs(options?: { preload?: boolean }): void;
  scheduleDeferredRuntimeWarmup?(): void;
  applyProviderIconColorMode(): void;
  getOpenCodianLeaves(): WorkspaceLeaf[];
  onSettingsPersistenceBlocked(message: string): void;
}
```

## 核心逻辑

### 设置保存编排 (`saveSettings`)

`saveSettings()` 是设置运行时的核心编排方法，按以下顺序执行：

1. 清除防抖保存定时器
2. 应用日志设置
3. 同步服务层设置（带失败回滚）
4. 持久化 core/ui 设置域
5. 刷新所有已打开的视图
6. 失效 slash command 菜单缓存
7. 同步 `.opencode` 权限配置
8. 当设置已经回到 `enabledBackends` 包含 `opencode` 且 `server.mode=local`、`autoStart=true` 时，调度一次 deferred runtime warmup，让从 disabled/remote/offline 恢复到本地托管时能自动拉起服务，而不是等到下次 reload 或会话 bootstrap

### 主题/外观变更

提供主题预设选择、外观更新、回退到基线等操作。所有变更都通过 `setEffectiveChatAppearance` 计算 `customAppearanceOverrides`。

### 主题背景资源

维护主题背景图的 data URL 缓存和并发请求去重。支持导入新背景、清除背景、解析 data URL。

### 防抖保存

- `scheduleChatAppearanceSave`: 防抖保存聊天外观（core 域）
- `scheduleSettingsUiStateSave`: 防抖保存 UI 状态（ui 域）

## 关键方法

| 方法 | 说明 |
|------|------|
| `saveSettings(options?)` | 设置保存编排 |
| `selectThemePreset(presetId)` | 选择主题预设 |
| `updateChatAppearance(mutator)` | 更新聊天外观 |
| `importChatThemeBackgroundFile(file)` | 导入主题背景文件 |
| `resolveChatThemeBackgroundDataUrl()` | 解析主题背景 data URL |
| `scheduleChatAppearanceSave(delay?)` | 防抖保存聊天外观 |
| `scheduleSettingsUiStateSave(delay?)` | 防抖保存 UI 状态 |

## 与其他模块的交互

- `main.ts`: 构造本模块并提供 host callbacks
- `PluginRuntimeCoordinator`: 通过 host callback 进行跨视图刷新，并在恢复到本地 auto-start 运行时时调度 deferred warmup
- `StorageService`: 通过 host callback 读写设置和主题背景资源
- `OpenCodeService`: 通过 host callback 同步设置

## 注意事项

- 本模块不直接持有 `OpenCodeService` 或 `StorageService` 的引用；所有访问通过 host seam 进行
- `settingsPersistenceWritable` 在初始化时从 `loadSettings` 结果传入
- 主题背景缓存使用 `Map` 实现，支持并发请求去重
