# Chinese Locale

> **源码**: `src/i18n/locales/zh.ts`
> **状态**: [DRAFT]

## 概述

OpenCodian 的简体中文翻译表，导出 `zhTranslations` 静态对象。它覆盖插件设置、聊天交互、状态提示、帮助说明和 Liquid Glass 参数解释，是中文界面的主要文案来源。

## 导入关系

```text
上游: 无
下游: src/i18n/locales/index.ts, src/i18n/index.ts
```

## 核心类型 / 接口

```typescript
export const zhTranslations: Record<string, string> = {
  'plugin.name': 'OpenCodian',
  'settings.server.title': '服务器',
  // ...
};
```

## 核心逻辑

### 中文文案实现

该文件为英文键空间提供中文对应值，供 `setLocale('zh')` 后的全部界面使用。

### 帮助文案承载

除了普通 UI 标签外，这个文件还承载大量“解释型文案”，尤其是样式设置、主题背景与 Liquid Glass 参数的 plain-language help。

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `zhTranslations` | 简体中文静态翻译表 |

## 数据流

不适用。运行时会在 `t(key)` 中按当前 locale 直接读取该字典。

## 与其他模块的交互

- 被 [locales/index.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/i18n/locales/index.md) 聚合
- 被 [i18n/index.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/i18n/index.md) 用于中文界面输出

## 配置项

无。

## 注意事项

- 中文文案应保持与英文键空间一一对应，不要单边新增键
- 该文件很长，修改时优先按前缀搜索已有键，避免重复定义或局部风格漂移

## 待补充

- [ ] 补充中文文案中“说明型长文本”的组织约定
- [ ] 统计当前主要键前缀分布

