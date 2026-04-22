# English Locale

> **源码**: `src/i18n/locales/en.ts`
> **状态**: [REVIEW]

## 概述

OpenCodian 的英文翻译表，导出 `enTranslations` 静态对象。它为设置面板、聊天界面、调试提示、权限交互以及 Liquid Glass 相关帮助文本提供英文文案，也是整个 i18n 系统的键空间基准。最近一轮还扩展了会话设置弹窗分组布局相关键：继承说明、会话覆盖 badge、上下文压缩分组与显示分组。

源码约 1000 行。

## 导入关系

```text
上游: 无
下游: src/i18n/locales/index.ts, src/i18n/index.ts
```

## 核心类型 / 接口

```typescript
export const enTranslations: Record<string, string> = {
  'plugin.name': 'OpenCodian',
  'plugin.description': 'Use OpenCode AI assistant in Obsidian',
  'settings.server.title': 'Server',
  'settings.server.mode.name': 'Connection mode',
  // ... 约 400+ 个键
};
```

## 核心逻辑

### 英文基准键空间

该文件提供所有翻译键的英文实现。`src/i18n/index.ts` 会以英文表作为：
1. 类型推导来源（`TranslationKey = keyof typeof enTranslations`）
2. 最终回退来源（当前语言缺失时回退到英文）

因此它实际上承担"默认键集"的角色。

### 覆盖范围

当前键空间覆盖：

- 插件基础信息（`plugin.*`）
- 设置页各分组（`settings.server.*`, `settings.model.*`, `settings.style.*` 等）
- 会话与聊天交互（`chat.input.*`, `chat.context.*`, `chat.tab.*`, `chat.sessionSettings.*` 等）
- 权限 / question / 调试提示
- 主题与 Liquid Glass 参数说明（大量 `settings.style.input.liquidGlass.*` 键）

### 帮助文本

包含大量解释型长文本，如：
```typescript
'settings.style.input.liquidGlass.shuding.help.displacementScale':
  'This is the main "glass strength" slider. Higher bends the background more; lower looks calmer...',
```

这些键以 `.help.` 为前缀，用于设置面板的"用大白话解释"功能。

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `enTranslations` | 英文静态翻译表对象 |

## 数据流

不适用。该模块没有运行时流程；典型消费链路为 `t(key)` → 查英文表 → 返回文案或作为回退。

```
t('settings.server.started')
  → translations.en['settings.server.started']  // 英文值
  → 或 translations.zh[key]  // 如果当前是中文
```

## 与其他模块的交互

- 被 [locales/index.md](./index.md) 聚合
- 被 [i18n/index.md](../index.md) 用作默认回退语言和 `TranslationKey` 推导来源

## 配置项

无。

## 键前缀统计

| 前缀 | 用途 |
|------|------|
| `plugin.*` | 插件基本信息 |
| `settings.server.*` | 服务器设置 |
| `settings.model.*` | 模型设置 |
| `settings.conversation.*` | 对话设置 |
| `settings.security.*` | 安全设置 |
| `settings.ui.*` | UI 设置 |
| `settings.style.*` | 样式设置（含大量 Liquid Glass 帮助文本） |
| `settings.debug.*` | 调试设置（含 module toggles、refresh interval、诊断动作与 console help） |
| `settings.user.*` | 用户设置 |
| `settings.plugins.*` | 插件管理 |
| `settings.quickNav.*` | 快速导航 |
| `chat.*` | 聊天界面 |

## 注意事项

- 新增翻译键时，英文表与中文表必须同步保持键名一致
- 如果某个键只出现在中文表、不出现在英文表，类型安全和回退逻辑都会变差
- 帮助文本（`.help.` 键）通常为多行长文本，使用 `\n` 换行
- 参数插值占位符使用 `{paramName}` 格式
- 本文件是 i18n 类型安全的基础，修改需谨慎

## Liquid Glass 帮助键

以下键专门服务于 Liquid Glass 设置帮助系统：
- `settings.style.input.liquidGlass.shuding.*.desc` — 参数描述
- `settings.style.input.liquidGlass.shuding.help.*` — 详细帮助
- `settings.style.input.liquidGlass.nikdelvin.*.desc`
- `settings.style.input.liquidGlass.shudingDiamond.*.desc`
- `settings.style.input.help.*` — 通用帮助
