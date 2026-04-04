# Locale Barrel

> **源码**: `src/i18n/locales/index.ts`
> **状态**: [DRAFT]

## 概述

语言包聚合入口，负责把英文与中文翻译表统一导出给 `src/i18n/index.ts` 使用。它是国际化系统的静态资源边界，不包含翻译逻辑，只负责聚合语言字典。

## 导入关系

```text
上游: ./en, ./zh
下游: src/i18n/index.ts
```

## 核心类型 / 接口

```typescript
export { enTranslations } from './en';
export { zhTranslations } from './zh';
```

## 核心逻辑

### 语言包收口

该文件只做 re-export，使上层国际化入口不需要分别引用两个 locale 文件。

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `enTranslations` | 英文翻译表 |
| `zhTranslations` | 简体中文翻译表 |

## 数据流

典型链路：`i18n/index.ts` 导入两个翻译对象 -> 构建语言映射表 -> `t()` 根据当前 locale 取值。

## 与其他模块的交互

- 上游实现见 [en.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/i18n/locales/en.md) 和 [zh.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/i18n/locales/zh.md)
- 下游整体逻辑见 [index.md](C:/Users/lt/Desktop/Write/custom-project/opencodian/docs/modules/i18n/index.md)

## 配置项

无直接配置。

## 注意事项

- 新增语言时，需要同时更新本文件与 `src/i18n/index.ts`

## 待补充

- [ ] 记录未来新增 locale 时的最小修改清单

