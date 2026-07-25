# PluginManagementService

> **源码**: `src/core/config/PluginManagementService.ts`
> **状态**: [REVIEW]

## 概述

`PluginManagementService` 负责检查 OpenCode 插件来源，并把“全局配置 + 项目配置 + 目录式插件”整理成一份快照，供设置页展示。它只写项目级内容，不会修改全局配置目录。

服务同时覆盖 3 类对象：

- 配置文件里的 `plugin` 数组
- 官方 `plugin/` 与 `plugins/` 目录下的脚本文件
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

export interface PluginEntryProvenance {
  sourcePath: string;
}

export interface PluginEntry {
  kind: PluginEntryKind;
  scope: PluginEntryScope;
  source: PluginEntrySource;
  specifier: string;
  displayName: string;
  disabled: boolean;
  fullPath?: string;
  options?: OpencodePluginOptions;
  provenance?: PluginEntryProvenance;
}

export type PluginConfigSourceScope = 'global' | 'project';

export interface PluginConfigSourceSnapshot {
  scope: PluginConfigSourceScope;
  path: string;
  exists: boolean;
  editable: boolean;
  specs: OpencodePluginSpec[];
  plugins: PluginEntry[];
  error?: string;
}

export interface PluginDirectorySnapshot {
  scope: PluginEntryScope;
  path: string;
  exists: boolean;
  files: string[];
  disabledFiles: string[];
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
  disabledProjectConfigPlugins: PluginEntry[];
  disabledProjectDirectoryPlugins: PluginEntry[];
  globalDirectories: PluginDirectorySnapshot[];
  projectDirectories: PluginDirectorySnapshot[];
  globalInfluenceDetected: boolean;
  omoConfigPath: string;
  omoConfigExists: boolean;
  configSources?: PluginConfigSourceSnapshot[];
}
```

## 核心逻辑

### 环境快照组装

`inspect(serviceMode, isolationMode, disabledPluginSpecs)` 会并发读取多组数据：

1. 全局配置文件 `<home>/.config/opencode/opencode.json`（保留为 `globalConfigPath` / `globalConfigSpecs`）
2. 项目配置 source：fresh `<vault>/.opencode/opencode.jsonc`；sole legacy `<vault>/.opencode/opencode.json` 兼容（保留为 `projectConfigPath` / `projectConfigSpecs`）。两者并存时只盘点，不产生 effective project source。
3. 全局 `plugin/`、`plugins/` 目录扫描结果
4. 项目 `plugin/`、`plugins/` 目录扫描结果
5. **所有已知配置来源的清查**（`configSources`），共 7 个：
   - 全局配置目录：`config.json`、`opencode.json`、`opencode.jsonc`
   - Vault 根目录：`opencode.json`、`opencode.jsonc`
   - Vault `.opencode/`：`opencode.json`、`opencode.jsonc`（均可盘点；fresh default 为 JSONC）

之后它会把配置式插件和目录式插件分别标准化，再组合成 `PluginEnvironmentSnapshot`。`disabledPluginSpecs` 代表插件侧保存的项目插件禁用清单，`inspect()` 会用它给项目级 config / directory entries 标记 `disabled`，并派生禁用条目集合。快照里同时保留：

- 原始 `plugin` 数组
- 标准化后的 `PluginEntry[]`
- 每个目录是否存在、包含哪些文件，以及哪些目录插件文件被插件侧禁用
- 项目级配置插件 / 目录插件的禁用条目列表
- 是否检测到全局插件影响
- OMO 配置文件路径与存在状态
- **所有配置来源的 provenance 清查**（`configSources`），包括 scope、path、exists、editable、specs、plugins、可选 error

### 配置来源与可编辑性边界

`PluginManagementService` 把配置来源分为两类：

| 来源 | 路径示例 | 可编辑 |
|---|---|:---:|
| 全局 `config.json` | `<home>/.config/opencode/config.json` | ❌ 只读 |
| 全局 `opencode.json` | `<home>/.config/opencode/opencode.json` | ❌ 只读 |
| 全局 `opencode.jsonc` | `<home>/.config/opencode/opencode.jsonc` | ❌ 只读 |
| Vault 根 `opencode.json` | `<vault>/opencode.json` | ❌ 只读 |
| Vault 根 `opencode.jsonc` | `<vault>/opencode.jsonc` | ❌ 只读 |
| Vault `.opencode/opencode.json` | `<vault>/.opencode/opencode.json` | ✅ sole legacy compatibility |
| **Vault `.opencode/opencode.jsonc`** | `<vault>/.opencode/opencode.jsonc` | ✅ fresh default |

Fresh projects use `.opencode/opencode.jsonc`; a sole legacy `.json` remains compatible. When both exist, inspection exposes both but has no effective project source, and mutation delegates to `OpencodeConfigManager`'s typed ambiguity failure rather than selecting a sibling.

`globalConfigSpecs` 与 `projectConfigSpecs` 仍分别只代表上述唯一 effective 全局/项目 source 的 `plugin` 数组，**不是**所有来源的 hand-rolled merge。项目 JSON/JSONC 双候选时 `projectConfigSpecs` 为空，避免伪造 canonical 选择。真正的 OpenCode effective config 由后端通过 `sdk.config.get()` 在运行时给出，未来会在事件接入层单独展示。

### 目录插件扫描规则

目录扫描同时检查 `plugin/` 与 `plugins/` 两个文件夹名，与 OpenCode 后端自动发现规则一致：

只收录以下扩展名的活动文件：

- `.js`
- `.ts`

对应的禁用形式 `.js.disabled`、`.ts.disabled` 也会被识别并放入 `disabledFiles`。以下文件会被忽略：

- `.mjs`、`.cjs` 及其 `.disabled` 形式
- 子目录及其内容（非递归）
- 其他非插件文件

`PluginDirectorySnapshot.disabledFiles` 记录同一目录下被插件侧禁用的文件名；对应的 `projectDirectoryPlugins` 条目也会带上 `disabled: true`，供设置页在行内切换状态。

### 项目侧写入能力

这个服务只写项目级内容，当前项目级写操作包括：

| 方法 | 行为 |
|------|------|
| `updateProjectConfigPlugins(plugins)` | 通过 `OpencodeConfigManager` 更新 fresh JSONC 或 sole legacy JSON 的 `plugin` 字段；双候选时抛 typed ambiguity，不写入任一文件 |
| `ensureProjectPluginDirectory()` | 创建 `<vault>/.opencode/plugins` |
| `ensureProjectOmoConfig()` | 创建 `<vault>/.opencode/oh-my-opencode.jsonc`，若不存在则写入占位模板 |
| `applyConfigPluginAvailabilityChange(specifier, disabled)` | 写回插件侧禁用清单中某个项目 config plugin 的可用状态，不直接改写 `plugin` 数组 |
| `toggleDirectoryPlugin(fileName, disabled)` | 写回插件侧禁用清单中某个项目目录 plugin 文件的可用状态 |
| `installConfigPlugin(spec)` | 向 fresh `.opencode/opencode.jsonc` 或 sole legacy `.json` 的 `plugin` 数组追加配置式插件；双候选 fail closed |
| `uninstallConfigPlugin(specifier)` | 从唯一 effective 项目 config plugin 列表移除匹配 specifier 并清理禁用状态；双候选 fail closed |
| `deleteDirectoryPlugin(fileName)` | 删除项目 `.opencode/plugins` 下的目录式插件文件，并清理对应禁用状态 |

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
| `inspect(serviceMode, isolationMode, disabledPluginSpecs)` | 生成完整插件环境快照，并合并插件侧项目插件禁用状态 |
| `updateProjectConfigPlugins(plugins)` | 更新项目配置里的 `plugin` 数组 |
| `applyConfigPluginAvailabilityChange(specifier, disabled)` | 切换项目 config plugin 的插件侧启用/禁用状态 |
| `toggleDirectoryPlugin(fileName, disabled)` | 切换项目目录 plugin 文件的插件侧启用/禁用状态 |
| `installConfigPlugin(spec)` | 安装/追加项目 config plugin spec |
| `uninstallConfigPlugin(specifier)` | 卸载项目 config plugin spec，并同步清理禁用记录 |
| `deleteDirectoryPlugin(fileName)` | 删除项目目录 plugin 文件，并同步清理禁用记录 |
| `ensureProjectPluginDirectory()` | 确保项目 `.opencode/plugins` 存在 |
| `ensureProjectOmoConfig()` | 确保项目 OMO 配置文件存在 |
| `getProjectOmoConfigPath()` | 返回项目 OMO 配置绝对路径 |
| `getProjectOmoConfigRelativePath()` | 返回固定相对路径 `.opencode/oh-my-opencode.jsonc` |
| `formatPluginSpec(spec)` | 将字符串或 tuple 规格化为展示文本 |
| `parsePluginSpecLines(text)` | 把多行文本解析成 `OpencodePluginSpec[]` |
| `inventoryConfigSources()` | 内部方法：并发读取所有已知配置来源 |
| `readConfigSource(path, scope, editable)` | 内部方法：读取单个配置来源，出错时返回带 `error` 的快照 |
| `detectGlobalInfluence(sources, directories)` | 内部方法：综合所有全局来源与目录判断是否存在全局插件影响 |

## 数据流

```text
global config.json / opencode.json / opencode.jsonc
  -> configSources (read-only provenance)

vault root opencode.json / opencode.jsonc
  -> configSources (read-only provenance)

vault .opencode/opencode.jsonc (fresh) OR sole opencode.json (legacy)
  -> projectConfigSpecs / projectConfigPlugins

both project JSON + JSONC
  -> configSources only; no effective selection or mutation

global opencode.json (canonical for global legacy fields)
  -> globalConfigSpecs / globalConfigPlugins

global/project plugin/ + plugins/ 目录
  -> 目录式 plugin 扫描

disabledPluginSpecs
  -> 项目级 config/directory plugin disabled 标记

各类结果
  -> inspect()
  -> PluginEnvironmentSnapshot
  -> OpenCodianSettings 插件管理区
```

## 与其他模块的交互

- `src/features/settings/OpenCodianSettings.ts` 是这个服务当前的实际消费方，用它展示插件来源、编辑项目级 `plugin` 列表、创建项目插件目录和 OMO 配置。
- `SettingsPluginSection` 会调用 install / uninstall / toggle / delete 系列方法管理项目插件行；服务层负责统一清理 `disabledPluginSpecs`，避免 UI 自己维护重复真相。
- `OpencodeConfigManager` 负责项目配置文件读写，`PluginManagementService` 在其之上做插件视图整合。
- `modelConfig.parseOpencodeConfigText()` 被复用于全局配置文件读取，因此全局 `opencode.json`/`opencode.jsonc` 也支持带注释 JSON。

## 注意事项

- 默认全局配置目录是 `path.join(os.homedir(), '.config', 'opencode')`；源码没有做平台分支处理。
- `inspect()` 不会修改文件系统，只负责读取和归一化；项目插件启用/禁用由显式 action 方法写回。
- `ensureProjectOmoConfig()` 首次创建时只写入一个非常小的占位模板，不会注入更完整的默认配置。
- 目录扫描仅记录文件，不记录目录，也不会读取插件文件内容。
- `PluginEntry.disabled` 表达 OpenCodian 插件侧禁用状态，不代表 OpenCode 全局配置或 runtime catalog 已移除该插件。
- `PluginEntry.provenance` 仅在条目来自配置式来源时存在，用于把 entry 归因到具体配置文件；目录式或禁用记忆条目不带 provenance。
- 任何单个配置文件解析失败都会记录在该来源的 `PluginConfigSourceSnapshot.error` 中，不会导致整个 `inspect()` 失败；对应唯一 effective 全局/项目 source 的数组会变为空，但其他来源和目录扫描正常返回。
- `globalInfluenceDetected` 在全局任意配置来源声明了插件，或任意全局 `plugin/` / `plugins/` 目录包含活动（非禁用）插件文件时为 `true`；仅含 `.disabled` 文件不会使其为 `true`。
- `configSources` 是 Round 1 新增的 additive 字段，用于声明式来源 provenance 清查；Round 2/3 由 `OpenCodeService` / `OpenCodeEventSubscriptionCoordinator` 独立捕获 `plugin.added` runtime evidence 与 `sdk.config.get()` effective config evidence，`PluginManagementService` 不合并这两者。
