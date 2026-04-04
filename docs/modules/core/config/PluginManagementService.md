# PluginManagementService

> **源码**: `src/core/config/PluginManagementService.ts`
> **状态**: [REVIEW]

## 概述

`PluginManagementService` 负责检查 OpenCode 插件来源，并把“全局配置 + 项目配置 + 目录式插件”整理成一份快照，供设置页展示。它只写项目级内容，不会修改全局配置目录。

服务同时覆盖 3 类对象：

- 配置文件里的 `plugin` 数组
- `plugin/` 与 `plugins/` 目录下的脚本文件
- 项目级 `oh-my-opencode.jsonc`

## 导入关系

```text
上游: fs, os, path, src/core/types/index.ts, src/core/config/modelConfig.ts, src/core/config/OpencodeConfigManager.ts
下游: src/features/settings/OpenCodianSettings.ts
```

## 核心类型 / 接口

```typescript
export type PluginEntryKind = 'npm' | 'local';
export type PluginEntryScope = 'global' | 'project';
export type PluginEntrySource = 'config' | 'directory';

export interface PluginEntry {
  kind: PluginEntryKind;
  scope: PluginEntryScope;
  source: PluginEntrySource;
  specifier: string;
  displayName: string;
  fullPath?: string;
  options?: OpencodePluginOptions;
}

export interface PluginDirectorySnapshot {
  scope: PluginEntryScope;
  path: string;
  exists: boolean;
  files: string[];
}

export interface PluginEnvironmentSnapshot {
  serviceMode: ServerMode;
  isolationMode: PluginIsolationMode;
  vaultConfigDir: string;
  globalConfigPath: string;
  projectConfigPath: string;
  globalConfigSpecs: OpencodePluginSpec[];
  projectConfigSpecs: OpencodePluginSpec[];
  globalConfigPlugins: PluginEntry[];
  globalDirectoryPlugins: PluginEntry[];
  projectConfigPlugins: PluginEntry[];
  projectDirectoryPlugins: PluginEntry[];
  globalDirectories: PluginDirectorySnapshot[];
  projectDirectories: PluginDirectorySnapshot[];
  globalInfluenceDetected: boolean;
  omoConfigPath: string;
  omoConfigExists: boolean;
}
```

## 核心逻辑

### 环境快照组装

`inspect(serviceMode, isolationMode)` 会并发读取 4 组数据：

1. 全局配置文件 `<home>/.config/opencode/opencode.json`
2. 项目配置文件 `<vault>/.opencode/opencode.json`
3. 全局 `plugin/` 与 `plugins/` 目录扫描结果
4. 项目 `plugin/` 与 `plugins/` 目录扫描结果

之后它会把配置式插件和目录式插件分别标准化，再组合成 `PluginEnvironmentSnapshot`。这份快照里同时保留：

- 原始 `plugin` 数组
- 标准化后的 `PluginEntry[]`
- 每个目录是否存在、包含哪些文件
- 是否检测到全局插件影响
- OMO 配置文件路径与存在状态

### 目录插件扫描规则

目录扫描固定检查两个文件夹名：

- `plugin`
- `plugins`

只收录以下扩展名的文件：

- `.js`
- `.ts`
- `.mjs`
- `.cjs`

子目录不会递归展开，只有当前目录下的文件会被记录。

### 项目侧写入能力

这个服务只提供 3 个项目级写操作：

| 方法 | 行为 |
|------|------|
| `updateProjectConfigPlugins(plugins)` | 通过 `OpencodeConfigManager` 更新项目配置的 `plugin` 字段 |
| `ensureProjectPluginDirectory()` | 创建 `<vault>/.opencode/plugins` |
| `ensureProjectOmoConfig()` | 创建 `<vault>/.opencode/oh-my-opencode.jsonc`，若不存在则写入占位模板 |

需要注意，虽然扫描会同时看 `plugin/` 和 `plugins/`，但自动创建时只会创建 `plugins/`。

### 配置式插件解析

`parsePluginSpecLines(text)` 用于设置页文本编辑器的逐行解析：

- 非空且不以 `[` 开头的行，原样作为字符串 specifier
- 以 `[` 开头的行，按 JSON 解析，要求必须是 `[string, object]` 二元组
- 解析到非法 tuple 时直接抛错

与此不同，`inspect()` 在读取现有配置文件时调用的内部 `parseConfigPlugin()` 遇到非法项会返回 `null`，然后在 `extractConfigPlugins()` 里被静默忽略。

### 本地 / npm 分类规则

`classifySpecifier()` 把以下 specifier 判为 `local`：

- `file://...`
- `./...`
- `../...`
- `~/...`
- `~\\...`
- 绝对路径
- Windows 盘符路径

其余值都归类为 `npm`。

## 关键方法

| 方法 | 说明 |
|------|------|
| `inspect(serviceMode, isolationMode)` | 生成完整插件环境快照 |
| `updateProjectConfigPlugins(plugins)` | 更新项目配置里的 `plugin` 数组 |
| `ensureProjectPluginDirectory()` | 确保项目 `.opencode/plugins` 存在 |
| `ensureProjectOmoConfig()` | 确保项目 OMO 配置文件存在 |
| `getProjectOmoConfigPath()` | 返回项目 OMO 配置绝对路径 |
| `getProjectOmoConfigRelativePath()` | 返回固定相对路径 `.opencode/oh-my-opencode.jsonc` |
| `formatPluginSpec(spec)` | 将字符串或 tuple 规格化为展示文本 |
| `parsePluginSpecLines(text)` | 把多行文本解析成 `OpencodePluginSpec[]` |

## 数据流

```text
global opencode.json + project opencode.json
  -> 配置式 plugin 解析

global/project plugin + plugins 目录
  -> 目录式 plugin 扫描

两类结果
  -> inspect()
  -> PluginEnvironmentSnapshot
  -> OpenCodianSettings 插件管理区
```

## 与其他模块的交互

- `src/features/settings/OpenCodianSettings.ts` 是这个服务当前的实际消费方，用它展示插件来源、编辑项目级 `plugin` 列表、创建项目插件目录和 OMO 配置。
- `OpencodeConfigManager` 负责项目配置文件读写，`PluginManagementService` 在其之上做插件视图整合。
- `modelConfig.parseOpencodeConfigText()` 被复用于全局配置文件读取，因此全局 `opencode.json` 也支持带注释 JSON。

## 注意事项

- 默认全局配置目录是 `path.join(os.homedir(), '.config', 'opencode')`；源码没有做平台分支处理。
- `inspect()` 不会修改文件系统，只负责读取和归一化。
- `ensureProjectOmoConfig()` 首次创建时只写入一个非常小的占位模板，不会注入更完整的默认配置。
- 目录扫描仅记录文件，不记录目录，也不会读取插件文件内容。
