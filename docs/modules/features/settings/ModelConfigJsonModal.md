# ModelConfigJsonModal

> **源码**: `src/features/settings/ModelConfigJsonModal.ts`
> **状态**: [REVIEW]

## 概述

JSON 格式的模型配置编辑器 Modal。提供原始 JSON 文本编辑器，用于直接编辑 `.opencode/opencode.json` 里的模型相关字段子集。支持格式化、保存、可选服务器重启。包含示例配置帮助文本。

## 导入关系
上游: `obsidian`（App、Modal、Notice）、`OpencodeModelConfigSubset`（core/types）、`i18n`、`main`（OpenCodianPlugin）、`shared`（logger）
下游: 被 `OpenCodianSettings` 的 JSON 编辑器按钮打开

## 核心类型 / 接口

无独立导出类型。

## 核心逻辑

### 编辑器

`textarea` 显示 `JSON.stringify(config, null, 2)` 格式化的 JSON。`spellcheck="false"`。

### 格式化

`formatJson()`: 解析 → 验证 → 重新格式化。失败时显示 Notice。

### 保存

`save()`: 解析 → `validate()` → `writeLocalModelConfig()` → `maybeRestartServer()` → `saveSettings()`。

### 未保存关闭保护

打开时会记录当前编辑器文本。若用户改过内容但没保存，关闭 modal 时会弹确认框；如果内容未变化，则直接关闭。

### 验证

`validate(value)`:
- `provider` 必须是 object（非 null/数组）
- `enabled_providers` / `disabled_providers` 必须是 string 数组

### 帮助文本

嵌入示例 JSON 配置，展示 provider 结构（name、npm、options.baseURL、options.apiKey、models）。

## 关键方法

| 方法 | 说明 |
|------|------|
| `onOpen()` | 加载配置、渲染编辑器、帮助文本、按钮 |
| `formatJson()` | 解析 + 验证 + 重新格式化 |
| `save()` | 解析 + 验证 + 写入 + 重启 |
| `validate(value)` | 检查 provider 对象类型和数组类型 |
| `maybeRestartServer()` | local 模式下 stop → 1s → start |

## 数据流

```
modelConfigService.readLocalModelConfig() → JSON
        ↓ 用户编辑
JSON.parse() → validate() → modelConfigService.writeLocalModelConfig()
        ↓
maybeRestartServer() → saveSettings()
```

## 与其他模块的交互

- **ModelConfigService**: 读写配置
- **OpenCodeService**: 可选重启
- **OpenCodianSettings**: 打开入口

## 配置项

- "保存后重启服务器" checkbox

## 注意事项

- 无 JSON schema 验证，仅检查基本结构
- 与 `ModelConfigModal`（可视化）互为补充
- `validate()` 不检查 provider 内部结构

## 补充说明

- `validate()` 仅检查 `provider` 为 object 且 `enabled_providers`/`disabled_providers` 为 string[]，不检查 provider 内部的 name/npm/options/models 结构
- 与 `ModelConfigModal` 的关系：两者都通过 `ModelConfigService` 读写同一份 `.opencode/opencode.json` 的模型相关字段。JSON 编辑器适合批量/高级编辑，可视化编辑器适合单条增删改。两者无互锁机制，同时打开时后保存者覆盖先保存者
- JSON textarea 通过 `TextareaSizeMemory` 使用 `model-config-json-editor` key 记忆手动调整高度，并在 modal 关闭时销毁 observer。
