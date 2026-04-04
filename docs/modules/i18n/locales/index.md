# Locale Barrel

> **源码**: `src/i18n/locales/index.ts`
> **状态**: [REVIEW]

## 概述

语言包聚合入口，负责把英文与中文翻译表统一导出给 `src/i18n/index.ts` 使用。它是国际化系统的静态资源边界，不包含翻译逻辑，只负责聚合语言字典。

## 导入关系

```text
上游: ./en, ./zh
下游: src/i18n/index.ts
```

## 核心导出

```typescript
export { enTranslations } from './en';
export { zhTranslations } from './zh';
```

## 核心逻辑

### 语言包收口

该文件只做 re-export，使上层国际化入口不需要分别引用两个 locale 文件。

```typescript
// 消费方用法
import { enTranslations, zhTranslations } from './locales';
```

而非：
```typescript
// 不推荐的写法
import { enTranslations } from './locales/en';
import { zhTranslations } from './locales/zh';
```

## 关键方法

| 方法 / 导出 | 说明 |
|-------------|------|
| `enTranslations` | 英文翻译表（约 1000 行） |
| `zhTranslations` | 简体中文翻译表（约 1000 行） |

## 数据流

典型链路：`i18n/index.ts` 导入两个翻译对象 → 构建语言映射表 → `t()` 根据当前 locale 取值。

```
src/i18n/locales/en.ts ──┐
                         ├─→ src/i18n/locales/index.ts ──→ src/i18n/index.ts ──→ 全模块
src/i18n/locales/zh.ts ──┘
```

## 与其他模块的交互

- 上游实现见 [en.md](./en.md) 和 [zh.md](./zh.md)
- 下游整体逻辑见 [index.md](../index.md)

## 配置项

无直接配置。

## 注意事项

- 新增语言时，需要同时更新本文件与 `src/i18n/index.ts`
- 本文件应保持极简，只负责聚合，不添加翻译逻辑
- 所有翻译表必须保持键一致性（以英文表为基准）

## 源码

```typescript
/**
 * Locale exports
 */

export { enTranslations } from './en';
export { zhTranslations } from './zh';
```

源码仅 6 行，是典型的 barrel 文件。
