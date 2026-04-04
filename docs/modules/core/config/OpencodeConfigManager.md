# OpencodeConfigManager

> **源码**: `src/core/config/OpencodeConfigManager.ts`
> **状态**: [REVIEW]

## 概述

`OpencodeConfigManager` 是项目级 OpenCode 配置文件的文件系统包装器。它面向当前 vault 的绝对路径工作，统一管理：

- 配置目录：`<vault>/.opencode`
- 配置文件：`<vault>/.opencode/opencode.json`
- 插件目录：`<vault>/.opencode/plugins`

这个类不依赖 Obsidian 的 vault adapter，而是直接使用 Node `fs` 和 `path`，因此它的职责偏向桌面端文件管理与权限配置持久化。

## 导入关系

```text
上游: fs, path, obsidian Notice, src/shared/logger.ts, src/core/config/modelConfig.ts, src/core/types/permission.ts, src/core/types/opencodeConfig.ts
下游: src/main.ts, src/features/settings/OpenCodianSettings.ts, src/features/settings/OpencodeConfigModal.ts, src/core/config/ModelConfigService.ts, src/core/config/PluginManagementService.ts
```

## 核心类型 / 接口

```typescript
class OpencodeConfigManager {
  exists(): Promise<boolean>;
  read(): Promise<OpencodeConfig>;
  write(config: OpencodeConfig): Promise<void>;
  updatePermission(permission: PermissionConfig | PermissionAction): Promise<void>;
  getPluginConfig(): Promise<OpencodePluginSpec[]>;
  updatePluginConfig(plugins: OpencodePluginSpec[]): Promise<void>;
  getPermissionConfig(): Promise<PermissionConfig | PermissionAction | undefined>;
  setYoloMode(): Promise<void>;
  setNormalMode(): Promise<void>;
  setPlanMode(): Promise<void>;
  setToolPermission(tool: string, action: PermissionAction): Promise<void>;
  getConfigDir(): string;
  getPluginDir(): string;
  getConfigPath(): string;
  remove(): Promise<void>;
  notifyRestartRequired(): Promise<void>;
}
```

## 核心逻辑

### 配置文件存在性与默认值

`exists()` 用 `fs.promises.access()` 检查 `opencode.json` 是否存在。

`read()` 的行为是：

1. 文件不存在时返回默认配置
2. 文件存在时读取文本
3. 用 `parseOpencodeConfigText()` 解析带注释的 JSON
4. 读取失败或解析失败时记录日志并返回默认配置

默认配置只包含两项：

- `$schema: 'https://opencode.ai/config.json'`
- `permission: { '*': 'ask' }`

### 写入与 schema 注入

`write()` 总会：

1. 确保 `.opencode` 目录存在
2. 以 `JSON.stringify(..., null, 2)` 写入格式化 JSON
3. 在最终输出对象最前面强制写入 `$schema: OPENCODE_SCHEMA_URL`

这意味着即使调用方传入了别的 `$schema`，最终写入也会被当前模块覆盖为 `https://opencode.ai/config.json`。

### 权限配置快捷模式

这个类内置了 3 套权限模板：

| 方法 | 写入内容 |
|------|------|
| `setYoloMode()` | `permission = 'allow'` |
| `setNormalMode()` | `* / read / edit / write / bash / websearch / webfetch / glob / grep / list / task / skill` 全部设为 `ask` |
| `setPlanMode()` | `* = ask`，`edit = deny`，`write = deny`，`bash = ask` |

`setToolPermission()` 允许增量改某一个工具权限；如果原始 `permission` 是字符串，会先转成对象形态 `{ '*': 原值 }`。

### 插件配置读写

`getPluginConfig()` 和 `updatePluginConfig()` 只处理 `config.plugin` 字段：

- 读取时如果不是数组，返回空数组
- 写入时如果传入空数组，会删除 `plugin` 字段而不是写 `[]`

### 路径与重启提醒

`getConfigDir()`、`getPluginDir()`、`getConfigPath()` 只做路径返回，不触发文件创建。

`notifyRestartRequired()` 只是弹出一个 5 秒 `Notice`，提醒用户重启 OpenCode 服务；源码里没有实际重启逻辑。

## 关键方法

| 方法 | 说明 |
|------|------|
| `read()` | 读取并解析项目级 OpenCode 配置，失败时回退默认值 |
| `write(config)` | 写入项目级配置并强制附带 `$schema` |
| `updatePermission(permission)` | 直接替换 `permission` 字段 |
| `getPluginConfig()` | 返回 `plugin` 数组副本 |
| `updatePluginConfig(plugins)` | 更新或删除 `plugin` 字段 |
| `setYoloMode()` | 整体改为 `'allow'` |
| `setNormalMode()` | 写入“全部询问”权限对象 |
| `setPlanMode()` | 写入“禁止写入”的计划模式权限对象 |
| `setToolPermission(tool, action)` | 改单个工具的权限 |
| `notifyRestartRequired()` | 弹 Notice，不执行重启 |

## 与其他模块的交互

- `src/main.ts` 会在设置同步时创建并使用它来落地 `permissionMode`。
- `src/core/config/ModelConfigService.ts` 通过它读写模型相关字段所在的完整配置文件。
- `src/core/config/PluginManagementService.ts` 通过它读写项目级 `plugin` 配置，并复用它暴露的 `.opencode` 路径。
- `src/features/settings/OpencodeConfigModal.ts` 直接接受这个管理器实例，用于编辑项目配置。

## 注意事项

- 仓库源码的实际文件名是 `.opencode/opencode.json`，不是 `config.json`。
- `read()` 的失败策略是“记录日志后静默回退默认值”，不会把错误向上抛。
- `write()` 失败时会抛出新的通用错误 `Failed to write OpenCode configuration`，原始错误只写日志。
- `remove()` 只删除配置文件，不会删除 `.opencode` 目录或其子目录。
