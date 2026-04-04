# OpenCode Config Schema Types

> **源码**: `src/core/types/opencodeConfig.ts`
> **状态**: [DRAFT]

## 概述

定义 `.opencode/config.json` 配置文件的 TypeScript 类型映射，涵盖 provider 配置、模型参数、插件数组等。供 `ModelConfigService` 和 `OpencodeConfigManager` 读写 OpenCode 原生配置时使用。类型设计为宽松的超集（所有接口都有 `[key: string]: unknown` 索引签名），以兼容 OpenCode 未来新增的字段。

## 导入关系

上游: `src/core/types/permission.ts`（`PermissionConfig`, `PermissionAction` — 通过 `import()` 类型引用）
下游:
- `src/core/config/ModelConfigService.ts`（读写模型配置）
- `src/core/config/OpencodeConfigManager.ts`（读写完整配置）
- `src/core/config/PluginManagementService.ts`（读写 plugin 数组）
- `src/core/types/permission.ts`（交叉引用）

## 核心类型 / 接口

| 类型 | 说明 |
|------|------|
| `OpencodeProviderModelLimit` | 模型 token 限制（context?, output?） |
| `OpencodeProviderModelConfig` | 单个模型配置（name?, limit?, options?, variants?） |
| `OpencodeProviderConfig` | 提供商配置（npm?, name?, options?, models?） |
| `OpencodePluginOptions` | `Record<string, unknown>` — 插件选项 |
| `OpencodePluginSpec` | `string \| [string, OpencodePluginOptions]` — 插件声明格式 |
| `OpencodeModelConfigSubset` | 模型相关配置子集（model?, small_model?, provider?, enabled_providers?, disabled_providers?） |
| `OpencodeConfig` | 完整配置（继承 ModelConfigSubset + $schema?, permission?, plugin?, agent?） |

## 核心逻辑

### 配置层级
- `OpencodeModelConfigSubset` — 仅模型/提供商相关字段，供 `ModelConfigService` 局部读写
- `OpencodeConfig` — 完整配置，增加 `permission`、`plugin`、`agent`、`$schema` 等顶层字段

### 插件声明格式
`OpencodePluginSpec` 支持两种写法：
- 字符串：`"plugin-name"` — 纯 npm 包名
- 元组：`["plugin-name", { key: "value" }]` — 带选项的插件

### 索引签名
所有接口均包含 `[key: string]: unknown`，确保读写时不会因未知字段报错。

## 关键方法

无运行时方法，仅类型导出。

## 数据流

1. `OpencodeConfigManager` 读取 `.opencode/config.json` → 解析为 `OpencodeConfig`
2. `ModelConfigService` 读取模型子集 → `OpencodeModelConfigSubset`
3. `PluginManagementService` 读写 `plugin` 数组 → `OpencodePluginSpec[]`
4. 写回时保留未知字段（索引签名透传）

## 与其他模块的交互

- **ModelConfigService**: 使用 `OpencodeModelConfigSubset` 进行局部配置读写
- **OpencodeConfigManager**: 使用 `OpencodeConfig` 进行完整配置读写
- **PluginManagementService**: 使用 `OpencodePluginSpec` 管理插件列表
- **PermissionConfig**: 通过 `import('./permission').PermissionConfig` 类型引用关联

## 配置项

此模块是 OpenCode 配置的类型映射，对应的 JSON 文件为 `.opencode/config.json`。

## 注意事项

- `permission` 字段类型为 `PermissionConfig | PermissionAction`（联合类型），支持简写形式（如 `permission: "allow"` 等同于所有工具 allow）
- `import()` 类型引用避免了 `opencodeConfig.ts` 和 `permission.ts` 之间的循环依赖
- `models` 使用 `Record<string, OpencodeProviderModelConfig>` 以模型 ID 为 key
- `variants` 支持同一模型的不同变体配置

## 待补充
- [ ] 补充 `.opencode/config.json` 的完整示例
- [ ] 记录 `agent` 字段的已知配置项
- [ ] 补充 `OpencodePluginSpec` 的解析逻辑文档
- [ ] 记录 `$schema` 字段对应的 JSON Schema URL
