# English Locale

> **源码**: `src/i18n/locales/en.ts`
> **状态**: [DRAFT]

## 概述

OpenCodian 的英文翻译表，导出 `enTranslations` 静态对象。它为设置面板、聊天界面、调试提示、权限交互以及 Liquid Glass 相关帮助文本提供英文文案，也是整个 i18n 系统的键空间基准。

## 导入关系

```text
上游: 无
下游: src/i18n/locales/index.ts, src/i18n/index.ts
```

## 核心类型 / 接口

```typescript
export const enTranslations: Record<string, string> = {
  'plugin.name': 'OpenCodian',
  'settings.server.title': 'Server',
  // ...
};
```

## 核心逻辑

### 英文基准键空间

该文件提供所有翻译键的英文实现。`src/i18n/index.ts` 会以英文表作为类型推导和最终回退来源，因此它实际上承担“默认键集”的角色。

### 覆盖范围

当前键空间覆盖：

- 插件基础信息
- 设置页各分组
- 会话与聊天交互
- 权限 / question / 调试提示
- 主题与 Liquid Glass 参数说明

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `enTranslations` | 英文静态翻译表 |

## 数据流

不适用。该模块没有运行时流程；典型消费链路为 `t(key)` -> 查英文表 -> 返回文案或作为回退。

## 与其他模块的交互

- 被 [locales/index.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/i18n/locales/index.md) 聚合
- 被 [i18n/index.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/i18n/index.md) 用作默认回退语言和 `TranslationKey` 推导来源

## 配置项

无。

## 注意事项

- 新增翻译键时，英文表与中文表必须同步保持键名一致
- 如果某个键只出现在中文表、不出现在英文表，类型安全和回退逻辑都会变差

## 待补充

- [ ] 按键前缀整理主要文案域
- [ ] 记录哪些键专门服务于 Liquid Glass 帮助系统

