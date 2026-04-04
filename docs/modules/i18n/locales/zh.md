# Chinese Locale

> **源码**: `src/i18n/locales/zh.ts`
> **状态**: [REVIEW]

## 概述

OpenCodian 的简体中文翻译表，导出 `zhTranslations` 静态对象。它覆盖插件设置、聊天交互、状态提示、帮助说明和 Liquid Glass 参数解释，是中文界面的主要文案来源。

源码约 1000 行。

## 导入关系

```text
上游: 无
下游: src/i18n/locales/index.ts, src/i18n/index.ts
```

## 核心类型 / 接口

```typescript
export const zhTranslations: Record<string, string> = {
  'plugin.name': 'OpenCodian',
  'plugin.description': '在 Obsidian 中使用 OpenCode AI 助手',
  'settings.server.title': '服务器',
  'settings.server.mode.name': '连接模式',
  // ... 约 400+ 个键
};
```

## 核心逻辑

### 中文文案实现

该文件为英文键空间提供中文对应值，供 `setLocale('zh')` 后的全部界面使用。

### 帮助文案承载

除了普通 UI 标签外，这个文件还承载大量"解释型文案"，尤其是样式设置、主题背景与 Liquid Glass 参数的 plain-language help。

示例：
```typescript
'settings.style.input.liquidGlass.shuding.help.displacementScale':
  '这是最核心的"玻璃感强度"滑块。调高后，输入框后面的内容会被扭曲得更明显...',
```

### 翻译风格

- UI 标签：简洁、动词前置（如"发送消息"、"添加上下文"）
- 帮助文本：口语化、避免技术术语（如"调高后...会更明显"）
- 错误提示：明确、 actionable（如"请检查...后再试"）

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `zhTranslations` | 简体中文静态翻译表对象 |

## 数据流

不适用。运行时会在 `t(key)` 中按当前 locale 直接读取该字典。

```
setLocale('zh')
t('settings.server.started')
  → translations.zh['settings.server.started']  // "OpenCode 服务器已启动"
```

## 与其他模块的交互

- 被 [locales/index.md](./index.md) 聚合
- 被 [i18n/index.md](../index.md) 用于中文界面输出

## 配置项

无。

## 键前缀分布

| 前缀 | 数量级 | 说明 |
|------|--------|------|
| `settings.*` | 400+ | 设置界面（最大分组） |
| `chat.*` | 150+ | 聊天界面 |
| `plugin.*` | 2 | 插件基础信息 |

### 主要键域

- `settings.style.*` — 样式设置（含大量 Liquid Glass 参数说明）
- `settings.server.*` — 服务器设置（含帮助文本）
- `settings.model.*` — 模型设置
- `chat.context.*` — 上下文操作
- `chat.question.*` — 问题系统
- `chat.omo.*` — OMO 相关

## 注意事项

- 中文文案应保持与英文键空间一一对应，不要单边新增键
- 该文件很长，修改时优先按前缀搜索已有键，避免重复定义或局部风格漂移
- 帮助文本通常比英文版本更长（中文表达更 verbose）
- 参数插值 `{param}` 在中文语境中同样适用
- 保持与英文表键顺序一致，便于 diff 对比

## 说明型长文本组织

文件中的长文本主要分为：

1. **帮助文本**（`*.help.*`）: 多段落解释，用 `\n` 分隔
2. **描述文本**（`*.desc`）: 单行补充说明
3. **通知文本**: 带参数的提示信息
4. **选项标签**: 下拉菜单、单选按钮选项

## 同步检查清单

修改本文件时，请确保：
- [ ] 键名与 `en.ts` 完全一致
- [ ] 参数占位符 `{xxx}` 数量和名称一致
- [ ] 新增键同时在 `en.ts` 添加
- [ ] 帮助文本风格统一（口语化、第二人称）
