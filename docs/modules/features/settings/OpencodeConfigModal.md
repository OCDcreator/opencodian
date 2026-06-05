# OpencodeConfigModal

> **源码**: `src/features/settings/OpencodeConfigModal.ts`
> **状态**: [REVIEW]

## 概述

通用 OpenCode 配置编辑器 Modal。直接编辑 `.opencode/opencode.json` 的完整配置文件（非仅模型部分）。提供 JSON 文本编辑器，支持格式化、重置为默认值、保存并重启服务。内嵌权限配置帮助文档（permission 模式示例：yolo / safe / readonly / custom）。

## 导入关系
上游: `obsidian`（App、Modal、Notice）、`OpencodeConfigManager`（core/config）、`OpencodeConfig`（core/types）、`i18n`、`shared`（logger）
下游: 被 `OpenCodianSettings` 的安全设置"编辑配置"按钮和插件设置"原始配置"按钮打开

## 核心类型 / 接口

无独立导出类型。使用 `OpencodeConfig`（core/types）。

## 核心逻辑

### 配置加载

`onOpen()` → `configManager.read()` 加载完整配置。加载失败时使用空对象 `{}`。

### 编辑器

`textarea` 显示 `JSON.stringify(config, null, 2)`。

### 格式化与重置

- `formatJson()`: 解析 + 重新格式化
- `resetToDefault()`: `confirm()` 确认后重置为 `{ $schema: 'https://opencode.ai/config.json', permission: { '*': 'ask' } }`

### 保存

`saveConfig()`: 解析 JSON → 基本验证（warn 缺少 `permission` 字段） → `configManager.write()` → 通过 `app.plugins.plugins['opencodian']` 获取 plugin 实例 → 可选 stop + start 服务器。

### 帮助文档

`getHelpContent()` 生成本地化 HTML，包含：
- 三种权限模式说明
- 工具列表（read / edit / bash / glob / grep）
- 四个 JSON 示例（yolo / safe / readonly / custom）
- 使用提示

## 关键方法

| 方法 | 说明 |
|------|------|
| `onOpen()` | 加载配置、渲染编辑器、按钮、帮助 |
| `formatJson()` | 解析 + 重新格式化 |
| `resetToDefault()` | confirm 后重置为默认配置 |
| `saveConfig()` | 解析 + 写入 + 重启服务 |
| `getHelpContent()` | 生成本地化帮助 HTML |

## 数据流

```
OpencodeConfigManager.read() → OpencodeConfig
        ↓ 用户编辑
JSON.parse() → configManager.write() → 重启服务
```

## 与其他模块的交互

- **OpencodeConfigManager**: 配置文件读写
- **OpenCodeService**: 通过 plugin 实例间接访问，用于重启
- **OpenCodianSettings**: 打开入口（安全设置和插件设置两个位置）

## 配置项

无额外配置项。

## 注意事项

- 通过 `(this.app as any).plugins?.plugins?.['opencodian']` 访问 plugin 实例——非类型安全
- 保存时仅 warn 缺少 permission 字段，不阻止保存
- `confirm()` 使用浏览器原生确认框

## 补充说明

- `OpencodeConfig` 类型定义在 `src/core/types/opencodeConfig.ts`，包含 `$schema`、`permission`、`mcp`、`provider`、`model` 等顶层字段
- 与 `ModelConfigJsonModal` 的职责边界：本 modal 编辑完整的 `.opencode/opencode.json`（含 permission/mcp/plugin 等），`ModelConfigJsonModal` 只读写其中的模型相关子集（model/provider/limits 等）。两者操作的是同一个配置文件，只是写入范围不同，因此并行打开时也存在后保存覆盖先保存的风险
- 配置 textarea 通过 `TextareaSizeMemory` 使用 `opencode-config-editor` key 记忆手动调整高度，并在 modal 关闭时销毁 observer。
