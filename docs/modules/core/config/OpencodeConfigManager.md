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
  static getPermissionTemplate(mode: PermissionMode): PermissionConfig | PermissionAction;
  static summarizePermissionConfig(permission: PermissionConfig | PermissionAction | undefined): PermissionConfigSummary;
  static ensureInitialized(vaultPath: string, permissionMode: PermissionMode): Promise<void>;
  static syncPermissionMode(vaultPath: string, permissionMode: PermissionMode, options?: { healthCheck?: () => Promise<boolean> }): Promise<void>;
  exists(): Promise<boolean>;
  read(): Promise<OpencodeConfig>;
  write(config: OpencodeConfig): Promise<void>;
  updatePermission(permission: PermissionConfig | PermissionAction): Promise<void>;
  getPluginConfig(): Promise<OpencodePluginSpec[]>;
  updatePluginConfig(plugins: OpencodePluginSpec[]): Promise<void>;
  getCompactionConfig(): Promise<OpencodeCompactionConfig | undefined>;
  getFormatterConfig(): Promise<OpencodeFormatterConfig | undefined>;
  updateFormatterConfig(formatter: OpencodeFormatterConfig | null | undefined): Promise<void>;
  updateCompactionConfig(compaction: OpencodeCompactionConfig | null | undefined): Promise<void>;
  getDefaultAgent(): Promise<string | undefined>;
  updateDefaultAgent(defaultAgent: string | null | undefined): Promise<void>;
  getAgentConfig(): Promise<OpencodeAgentConfigRecord>;
  updateAgentConfig(agents: OpencodeAgentConfigRecord): Promise<void>;
  upsertAgentConfig(agentId: string, agent: OpencodeAgentConfig): Promise<void>;
  removeAgentConfig(agentId: string): Promise<void>;
  getCommandConfig(): Promise<OpencodeCommandConfigRecord>;
  updateCommandConfig(commands: OpencodeCommandConfigRecord): Promise<void>;
  upsertCommandConfig(commandId: string, command: OpencodeCommandConfig): Promise<void>;
  removeCommandConfig(commandId: string): Promise<void>;
  getPermissionConfig(): Promise<PermissionConfig | PermissionAction | undefined>;
  setYoloMode(): Promise<void>;
  setNormalMode(): Promise<void>;
  setPlanMode(): Promise<void>;
  setToolPermission(tool: string, action: PermissionAction): Promise<void>;
  setSkillPermissionPattern(pattern: string, action: PermissionAction): Promise<void>;
  setAgentSkillPermission(agentId: string, action: PermissionAction | undefined): Promise<void>;
  setAgentSkillToolEnabled(agentId: string, enabled: boolean | undefined): Promise<void>;
  getConfigDir(): string;
  getPluginDir(): string;
  getConfigPath(): string;
  remove(): Promise<void>;
  notifyRestartRequired(): Promise<void>;
}

getCommandScopedAgentId(commandId: string): string
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

这个类内置了 3 套 **OpenCodian shorthand template**，并把“写模板”和“识别模板 / 自定义规则”放到同一处：

| 方法 | 写入内容 |
|------|------|
| `setYoloMode()` | `permission = 'allow'` |
| `setNormalMode()` | `* / read / edit / write / bash / websearch / webfetch / glob / grep / list / task / skill` 全部设为 `ask` |
| `setPlanMode()` | `* = ask`，`edit = deny`，`write = deny`，`bash = ask` |

其中：

- `getPermissionTemplate(mode)` 返回上述模板的标准对象 / 字符串形态，避免 writer 与 reader 各自维护一份模式定义
- `summarizePermissionConfig(permission)` 会先尝试 **精确匹配** 这 3 套模板；只有完全一致时才返回 `templateMode`
- 如果不是精确模板，summary 会额外标记 `external-directory`、`task-allowlist`、`patterned-rules` 等自定义特征，供 settings UI 用人话展示

这点很重要：`plan` 只是 OpenCodian 的 shorthand，不是上游 OpenCode 的原生权限模式；上游仍是 rule-based `permission + pattern + action` 语义。

`setToolPermission()` 允许增量改某一个工具权限；如果原始 `permission` 是字符串，会先转成对象形态 `{ '*': 原值 }`。当目标是 `skill` 且已有 `permission.skill` 对象时，它只更新 `permission.skill['*']`，保留单技能 pattern 覆盖。

`setSkillPermissionPattern()` 专门写 `permission.skill.<pattern>`，用于 Skills 设置页给单个 skill name 或 pattern 配置 allow / ask / deny。它会把字符串简写提升为 `{ '*': 原值 }`，并保留已有 `permission.skill` 默认规则。

`clearToolPermission('*')` 会删除全局默认工具权限；如果当前配置是字符串简写（例如 `'allow'`），它会直接删除整个 `permission` 字段，让 OpenCode 回到上游默认值。`clearToolPermission('skill')` 会清除技能默认权限；如果 `permission.skill` 里还有单技能 pattern 覆盖，则只移除 `'*'` 默认项并保留这些覆盖。`clearSkillPermissionPattern(pattern)` 会删除单个技能覆盖；如果剩下的 `permission.skill['*']` 与全局 `permission['*']` 相同，则会删除 `permission.skill` 回到继承全局。

`setAgentSkillPermission()` 写 `agent.<id>.permission.skill`，用于按代理覆盖全局技能权限；传入 `undefined` 会移除该代理的 skill 权限覆盖。`setAgentSkillToolEnabled()` 写 `agent.<id>.tools.skill`，用于让特定代理完全禁用或启用 skill tool；传入 `undefined` 会回到继承状态。

### 插件配置读写

`getPluginConfig()` 和 `updatePluginConfig()` 只处理 `config.plugin` 字段：

- 读取时如果不是数组，返回空数组
- 写入时如果传入空数组，会删除 `plugin` 字段而不是写 `[]`

### formatter 精确子树写入

`getFormatterConfig()` / `updateFormatterConfig()` 封装了 project-scoped `formatter` 字段的读写；formatter 专属的 exact-write 细节现在委托给 `src/core/config/formatterConfig.ts`：

- 读取时支持三态：字段缺失返回 `undefined`、布尔值原样返回、对象时返回深拷贝副本
- 写入时**不会**像 `compaction` / `agent` helper 那样 deep merge，而是直接替换整个 `formatter` 子树
- 这让 UI / runtime 可以安全删除某个 formatter entry；如果还走 merge，旧 entry 会残留在磁盘上
- 传入 `null` 或 `undefined` 时会删除 `formatter` 字段；传入空对象 `{}` 时会保留显式 custom mode（无额外 per-formatter override）

### 会话/Agent/Command 配置 helper

manager 内提供了更细粒度的项目配置 helper，供当前 session settings、Agents settings 与 Commands/slash-command UI/runtime 共同复用：

- `getCompactionConfig()` / `updateCompactionConfig()`：读写 `compaction`，并在 patch 时保留已有未知字段
- `getFormatterConfig()` / `updateFormatterConfig()`：读写 `formatter`，具体 exact-write 规则委托给 `formatterConfig.ts`，允许删除 formatter 条目并保留 formatter entry 内未知字段
- `getDefaultAgent()` / `updateDefaultAgent()`：读写并 trim `default_agent`，空字符串会删除字段
- `getAgentConfig()`：把 native `agent` 与 deprecated `mode` 合并成单个 map，读取时优先返回 native `agent`
- `upsertAgentConfig()`：写入 native `agent` 条目时，会先吸收同名 deprecated `mode` 条目，再递归 merge，避免丢失未知字段 / `tools` / `options`
- `removeAgentConfig()`：删除 native `agent` 的同时，也会删除 deprecated `mode` 中的同名 legacy 条目，避免 helper 读取时被“复活”
- `getCommandConfig()` / `upsertCommandConfig()` / `removeCommandConfig()`：对 `command` map 做同样的 clone + merge + 删除封装
- `getCommandScopedAgentId()`：为命令级 Temperature / Top P 生成稳定的隐藏 agent ID（`opencodian-command:<commandId>`）

这些 helper 都基于 `read()` 后再局部修改再 `write()`，因此 `formatter`、`watcher`、top-level `tools` 等不属于当前切口的字段会保持原样。

### command-owned hidden agent

`upsertCommandConfig()` 现在还承担一个很窄的 commands helper 责任：如果 patch 里显式包含 `temperature` 或 `top_p`，manager 会：

- 从 `command.<id>` patch 中消费这两个字段，而不是把它们原样写进 OpenCode 的 `command` schema
- 生成 / 更新一个稳定的隐藏 project agent：`agent["opencodian-command:<id>"]`
- 把当前 command 的 `agent` 指向这个生成 agent，让 OpenCode 仍通过原生 `session.command()` 语义拿到命令级 sampling
- 在 project command 原本指向某个 project agent 时，先用该 project agent 的配置做 base，再叠加 `hidden: true`、sampling 值与 `options.opencodianCommand` metadata
- 当 `temperature` / `top_p` 被显式清空或 command 被删除时，顺带清理对应的生成 agent

这让 commands settings 可以支持命令级 sampling，而不必把新的 runtime ownership 塞回 chat/view/service 层。

### 路径与重启提醒

`getConfigDir()`、`getPluginDir()`、`getConfigPath()` 只做路径返回，不触发文件创建。

`notifyRestartRequired()` 只是弹出一个 5 秒 `Notice`，提醒用户重启 OpenCode 服务；源码里没有实际重启逻辑。

## 关键方法

| 方法 | 说明 |
|------|------|
| `getPermissionTemplate(mode)` | 返回 OpenCodian 的标准权限模板 |
| `summarizePermissionConfig(permission)` | 识别精确模板或提取自定义权限特征 |
| `read()` | 读取并解析项目级 OpenCode 配置，失败时回退默认值 |
| `write(config)` | 写入项目级配置并强制附带 `$schema` |
| `updatePermission(permission)` | 直接替换 `permission` 字段 |
| `getPluginConfig()` | 返回 `plugin` 数组副本 |
| `updatePluginConfig(plugins)` | 更新或删除 `plugin` 字段 |
| `getCompactionConfig()` / `updateCompactionConfig()` | 读写 `compaction`，支持 patch merge 与删除 |
| `getFormatterConfig()` / `updateFormatterConfig()` | 读写 `formatter`，具体 exact subtree write 规则委托给 `formatterConfig.ts` |
| `getDefaultAgent()` / `updateDefaultAgent()` | 读写 `default_agent`，空值时删除 |
| `getAgentConfig()` / `upsertAgentConfig()` / `removeAgentConfig()` | 兼容 deprecated `mode` 导入的 agent helper |
| `getCommandConfig()` / `upsertCommandConfig()` / `removeCommandConfig()` | 命令 map 的细粒度 helper，必要时维护 command-owned hidden agent |
| `getCommandScopedAgentId()` | 返回命令级隐藏 agent 的稳定 ID |
| `setYoloMode()` | 整体改为 `'allow'` |
| `setNormalMode()` | 写入“全部询问”权限对象 |
| `setPlanMode()` | 写入“禁止写入”的计划模式权限对象 |
| `setToolPermission(tool, action)` | 改单个工具的权限 |
| `clearToolPermission(tool)` | 删除单个工具权限；`tool='*'` 时删除全局默认并回到 OpenCode 默认值 |
| `notifyRestartRequired()` | 弹 Notice，不执行重启 |

## 与其他模块的交互

- `src/main.ts` 会在设置同步时创建并使用它来落地 `permissionMode`。
- `src/features/settings/SettingsSecuritySection.ts` 通过 `summarizePermissionConfig()` 把 `.opencode` 权限规则转成 template/custom 状态文案。
- `src/features/settings/SettingsToolSection.ts` 通过 `setToolPermission()` / `clearToolPermission()` 管理 `permission["*"]` 默认值与单工具覆盖。
- `src/core/config/ModelConfigService.ts` 通过它读写模型相关字段所在的完整配置文件。
- `src/core/config/PluginManagementService.ts` 通过它读写项目级 `plugin` 配置，并复用它暴露的 `.opencode` 路径。
- `src/features/settings/OpencodeConfigModal.ts` 直接接受这个管理器实例，用于编辑项目配置。

## 注意事项

### 优先扩展的相邻模块

新配置行为不应直接加入本模块。根据功能类型，优先扩展以下 owner：

| 功能类型 | 优先扩展 |
|----------|----------|
| 模型目录展示 / provider 筛选 | `ModelConfigService` |
| 设置页项目配置编辑 UI | `OpencodeConfigModal` |
| 设置页权限 UI / 安全区 | `SettingsSecuritySection` |
| 插件管理 UI / 运行时 | `PluginManagementService` |
| Formatter 配置读写细节 | `src/core/config/formatterConfig.ts` |
| Agent 配置 schema / 类型 | `src/core/types/opencodeConfig.ts` |
| Command 配置 UI | `SettingsCommandsSection` / `SettingsProjectCommandEditor` |

### 不可移除的关键行为

1. **`write()` 的 `$schema` 强制注入**：每次写入都会把 `$schema` 设为 `https://opencode.ai/config.json`；即使调用方传入别的值也会被覆盖。这是为了保证 OpenCode CLI 和编辑器扩展总能正确识别配置 schema。
2. **Formatter 的 exact subtree write**：`updateFormatterConfig()` 不做 deep merge，而是直接替换整个 `formatter` 子树。这让 UI 可以安全删除 formatter entry；如果改为 merge，旧 entry 会残留在磁盘上。
3. **Agent helper 的 deprecated `mode` 兼容**：读取时会合并 deprecated `mode` 和 native `agent`；删除时同步清理两个位置的条目。不能只清理 `agent` 而留下 `mode`，否则 helper 读取时"复活"旧配置。
4. **`read()` 的静默回退默认值**：文件不存在或解析失败时返回默认配置（`$schema` + `permission: '*': 'ask'`），不抛异常。下游依赖这个行为——不能改为抛异常，否则启动流程会中断。
5. **Command-owned hidden agent 命名空间**：`opencodian-command:` 前缀是 OpenCodian 保留的 project agent 命名空间；不能被其他用途占用。

### 其他注意事项

- 仓库源码的实际文件名是 `.opencode/opencode.json`，不是 `config.json`。
- `write()` 失败时会抛出新的通用错误 `Failed to write OpenCode configuration`，原始错误只写日志。
- `remove()` 只删除配置文件，不会删除 `.opencode` 目录或其子目录。

## 2026-04-23 Compaction config alignment

Compaction config is now project-scoped (`.opencode/opencode.json`). Ownership facts:
1. `OpencodeConfigManager` is the sole writer of compaction config to `.opencode/opencode.json` via `updateCompactionConfig()`.
2. Compaction config source of truth is `.opencode/opencode.json`, not plugin settings or conversation session settings; `getCompactionConfig()` reads from this file.
3. Manual `session.summarize()` remains a per-session action available through `OpenCodeService` session control, not managed by this configuration manager.
