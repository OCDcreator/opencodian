# chatAppearance

> **源码**: `src/features/chat/chatAppearance.ts`
> **状态**: [DRAFT]

## 概述

聊天外观 CSS 变量构建器。将 `ChatAppearanceSettings` 对象转换为一组 CSS 自定义属性（`--opencodian-*`），供 `styles.css` 中的规则消费。涵盖布局间距、消息气泡样式、输入面板、滚动条、主题背景图片和输入面板玻璃折射效果。

## 导入关系

**上游**:
- `../../core/types` — `ChatAppearanceSettings`, `ChatAppearanceBackgroundFitMode`, `InputPanelGlassRefractionSettings`, `isValidChatAppearanceCustomCssDeclarations`

**下游**: `OpenCodianView` — `applyChatAppearanceSettings()` 调用此模块将设置应用到 DOM。

## 核心类型 / 接口

无自定义类型，消费 `core/types` 中的 `ChatAppearanceSettings` 和 `InputPanelGlassRefractionSettings`。

## 核心逻辑

### CSS 变量生成
`getChatAppearanceCssVariables()` 接收完整外观设置，计算派生值（如 `backgroundScale`、`backgroundBleed`、`backgroundOverlayOpacity`），输出约 30 个 CSS 自定义属性。

### 背景图片适配模式
`getChatAppearanceBackgroundSizeValue()` 将 `ChatAppearanceBackgroundFitMode`（`cover`/`contain`/`fit-width`/`fit-height`）转换为 CSS `background-size` 值。

### 玻璃折射变量
`getInputPanelGlassRefractionCssVariables()` 为输入面板的 glass/card/pill 三层各生成 4 个 CSS 变量（`bg-alpha`、`blur`、`saturation`、`brightness`）。

### 自定义 CSS 注入
`buildChatAppearanceCustomCss()` 验证用户自定义 CSS 声明（通过 `isValidChatAppearanceCustomCssDeclarations` 安全校验），安全地包装在 `.opencodian-container` 选择器中。

## 关键方法

| 方法 | 说明 |
|------|------|
| `getChatAppearanceCssVariables(appearance)` | 从外观设置生成全部 CSS 自定义属性映射 |
| `getChatAppearanceBackgroundSizeValue(fitMode)` | 将 fitMode 枚举转为 CSS background-size 值 |
| `getInputPanelGlassRefractionCssVariables(settings)` | 生成输入面板玻璃折射 CSS 变量 |
| `buildChatAppearanceCustomCss(declarations)` | 构建安全的自定义 CSS 字符串 |

## 数据流

```
ChatAppearanceSettings (plugin.settings)
  → getChatAppearanceCssVariables()
    → Record<string, string> (30+ CSS 变量)
    → OpenCodianView.applyChatAppearanceSettings()
      → element.style.setProperty() 批量应用到容器
```

## 与其他模块的交互

- **OpenCodianView**: 唯一消费者，在 `applyChatAppearanceSettings()` 中调用
- **core/types**: 类型定义来源
- **styles.css**: 消费这些 CSS 变量的样式规则

## 配置项

由 `ChatAppearanceSettings` 控制，包含：
- `layout` — `messagesPaddingTop`, `messagesPaddingX`
- `sticky` — `headerGap`, `maskHeight`, `maskBlur`
- `background` — `opacity`, `blur`, `depth`, `dim`, `edgeFade`, `saturation`, `brightness`, `fitMode`, `focusX`, `focusY`
- `user` — `radius`, `tailRadius`, `blur`, `shadowBlur`
- `assistant` — `radius`, `backgroundOpacity`, `blur`, `shadowBlur`
- `input` — `radius`, `backgroundOpacity`, `blur`, `shadowBlur`
- `scrollbar` — `width`, `radius`, `trackOpacity`, `thumbOpacity` 等

## 注意事项

- `backgroundBleed` 由 `blur`、`edgeFade`、`depth` 三者联合计算，调整外观时需注意联动效果
- `backgroundOverlayOpacity` 系列值有硬上限（68%/78%/84%/18%），防止背景完全遮盖内容
- 自定义 CSS 通过验证函数确保不注入危险选择器

## 待补充

- [ ] 每个 CSS 变量在 styles.css 中的具体消费位置
- [ ] 派生值（bleed/overlay）的视觉效果说明
- [ ] 主题预设与此模块的关系
