# LiquidGlassSettingHelpModal

> **源码**: `src/features/settings/LiquidGlassSettingHelpModal.ts`
> **状态**: [DRAFT]

## 概述

Liquid Glass（液态玻璃）效果设置的帮助 Modal。接收标题和正文文本作为构造参数，将正文按双换行分段渲染为 `<p>` 元素。用于解释输入面板的玻璃折射效果参数含义和调优建议。

## 导入关系
上游: `obsidian`（App、Modal）、`i18n`
下游: 被 `OpenCodianSettings` 的输入面板玻璃效果设置的帮助按钮打开

## 核心类型 / 接口

无独立导出类型。构造参数：

```typescript
constructor(app: App, titleText: string, bodyText: string)
```

## 核心逻辑

### 文本分段

`bodyText.split(/\n\s*\n/g)` 按双换行分段，每段 trim 后渲染为 `<p>` 元素。空段跳过。

### 标题

`this.titleText` 作为 `<h2>` 标题。

### 平语言标题

使用 i18n key `settings.style.input.help.plainLanguageHeading` 作为帮助区域的 `<h5>` 标题。

## 关键方法

| 方法 | 说明 |
|------|------|
| `constructor(app, titleText, bodyText)` | 存储标题和正文 |
| `onOpen()` | 渲染 h2 标题 + h5 帮助标题 + 分段正文 |
| `onClose()` | 清空 contentEl |

## 数据流

```
调用方构造 titleText + bodyText
        ↓
onOpen() → h2(titleText) + h5(i18n heading) + p[] (分段 bodyText)
```

## 与其他模块的交互

- **OpenCodianSettings**: 在 `addGlassRefractionInputControls()` 中创建帮助按钮，传入动态标题和正文
- **i18n**: 仅使用 `settings.style.input.help.plainLanguageHeading`

## 配置项

无直接配置项。

## 注意事项

- 标题和正文完全由调用方控制，Modal 本身不依赖 i18n 获取主体内容
- 使用 `createEl('p', { text })` 而非 innerHTML，自动安全
- 正文的分段格式要求使用双换行 `\n\n` 分隔

## 待补充
- [ ] 调用方传入的典型 titleText 和 bodyText 内容示例
- [ ] 与 glass adapter 参数的对应关系说明
