# chatAppearance

> **源码**: `src/features/chat/chatAppearance.ts`
> **状态**: [REVIEW]

## 概述

这个模块是聊天外观的纯函数工具集，不直接操作 DOM。它把设置对象转换成 `OpenCodianView.applyChatAppearanceSettings()` 可以批量写入容器元素的 CSS 变量和样式文本。

## 导出

```typescript
getChatAppearanceBackgroundSizeValue(fitMode): string
getChatAppearanceCssVariables(appearance): Record<string, string>
getInputPanelGlassRefractionCssVariables(settings): Record<string, string>
buildChatAppearanceCustomCss(declarations): string
```

## 关键行为

### 背景尺寸映射

`getChatAppearanceBackgroundSizeValue()` 只负责把 `fitMode` 枚举转换成 CSS `background-size` 值：

- `contain` -> `contain`
- `fit-width` -> `100% auto`
- `fit-height` -> `auto 100%`
- `cover` 或未知值 -> `cover`

### 聊天外观变量生成

`getChatAppearanceCssVariables()` 读取 `ChatAppearanceSettings`，生成消息区、背景、用户气泡、助手气泡、输入区、滚动条相关的 `--opencodian-*` 变量。

输入区字体现在会通过 `resolveComposerFontFamily()` 合并英文字体 / 中文字体设置，写入 `--opencodian-composer-font-family`，并由 `InputFontLoader` singleton 按需加载 CDN 字体。

其中有几组变量是运行时计算值，不是直接照抄设置：

- `backgroundScale = 1 + depth / 100`
- `backgroundBleed` 由 `blur`、`edgeFade`、`depth` 组合计算，并有 `28px` 下限
- 背景遮罩和高光透明度会做上限裁剪，避免数值失控

### 输入面板玻璃折射变量

`getInputPanelGlassRefractionCssVariables()` 为 `glass`、`card`、`pill` 三层分别生成透明度、模糊、饱和度、亮度变量，供输入面板的 glass-refraction 主题使用。

### 自定义 CSS 包装

`buildChatAppearanceCustomCss()` 会先裁剪字符串，再调用 `isValidChatAppearanceCustomCssDeclarations()` 做校验。只有在声明非空且通过校验时，才返回：

```css
.opencodian-container {
  ...
}
```

否则返回空字符串。

## 模块关系

- 上游依赖：`../../core/types`
- 下游消费者：`OpenCodianView.applyChatAppearanceSettings()`

## 注意事项

- 这个模块不保存任何状态，也不附带默认值回填逻辑；输入必须是已经完成初始化的设置对象。
- 自定义 CSS 只能以“声明集合”的形式注入，作用域固定为 `.opencodian-container`，不会在这里生成更外层或更复杂的选择器。
