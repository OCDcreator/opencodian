# ServerSettingHelpModal

> **源码**: `src/features/settings/ServerSettingHelpModal.ts`
> **状态**: [REVIEW]

## 概述

服务器设置的帮助 Modal。根据 topic 参数显示对应的帮助内容，包括介绍、含义说明、填写方法、额外备注、示例、提示。所有文本通过 i18n key `settings.server.help.{topic}.*` 获取。

## 导入关系
上游: `obsidian`（App、Modal）、`i18n`
下游: 被 `OpenCodianSettings` 的各服务器设置项的 `?` 帮助按钮打开

## 核心类型 / 接口

```typescript
type ServerHelpTopic =
  | 'mode' | 'autoStart' | 'executablePath' | 'host' | 'port' | 'remoteUrl'
  | 'auth' | 'username' | 'password' | 'token' | 'status';
```

## 核心逻辑

### 帮助内容生成

`getHelpContent()` 根据 topic 构建 HTML，使用以下 i18n key：
- `.intro` - 概述
- `.meaning` - "这意味着什么"
- `.fill` - "如何填写"
- `.extra` - 更多备注（可选）
- `.example` - 示例（可选）
- `.tip1` / `.tip2` - 提示（可选，过滤掉未翻译的 key）

### 条件渲染

extra / example / tips 仅在对应的 i18n key 有有效翻译时显示。

### HTML 转义

`escapeHtml()` 对示例和提示文本进行 HTML 转义。

## 关键方法

| 方法 | 说明 |
|------|------|
| `constructor(app, topic)` | 接收 topic 参数 |
| `onOpen()` | 渲染标题和帮助内容 |
| `getHelpContent()` | 根据 topic 生成 HTML |
| `tr(key)` | 代理 `t()` 函数 |
| `escapeHtml(value)` | HTML 实体转义 |

## 数据流

```
ServerHelpTopic → getHelpContent()
        ↓
i18n keys: settings.server.help.{topic}.{intro|meaning|fill|extra|example|tip1|tip2}
        ↓
条件过滤 → HTML 字符串 → innerHTML
```

## 与其他模块的交互

- **OpenCodianSettings**: 通过 `addServerHelpButton()` 为每个服务器设置项添加 `?` 按钮
- **i18n**: `settings.server.help.*` 命名空间

## 配置项

无直接配置项。行为完全由 `topic` 参数决定。

## 注意事项

- 使用 `innerHTML` 注入 HTML，但所有动态文本经过 `escapeHtml()` 转义
- `tr()` 使用 `t(key as never)` 绕过类型检查（因为 key 是动态拼接的）
- tip 过滤逻辑：当 i18n 返回的值包含原始 key 文本时视为未翻译

## 补充说明

- 各 topic 的帮助内容由 i18n key 提供，具体文本见 `src/i18n/locales/en.ts` 和 `src/i18n/locales/zh.ts` 中 `settings.server.help.{topic}.*` 命名空间
- `addServerHelpButton()` 定义在 `OpenCodianSettings.ts` 中，为每个服务器设置项创建 `?` 按钮，点击时 `new ServerSettingHelpModal(this.app, topic).open()`
