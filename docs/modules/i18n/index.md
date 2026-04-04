# 国际化系统

> **源码**: `src/i18n/index.ts` + `src/i18n/locales/`
> **状态**: [DRAFT]

## 概述

基于静态翻译表的轻量级国际化（i18n）系统。支持英文（en）和中文（zh）两种语言，通过 `setLocale()` 切换语言，`t()` 函数翻译键值。翻译键使用点分层级命名（如 `settings.server.started`），支持 `{param}` 模板插值。

## 导入关系
上游: `../shared` (createLogger), `./locales/en` (enTranslations), `./locales/zh` (zhTranslations)
下游: 全模块（`t()` 调用遍布 `OpenCodianView`, `OpenCodianSettings`, `ForkTargetModal` 等）

## 核心类型 / 接口

```typescript
type Locale = 'en' | 'zh';
type TranslationKey = keyof typeof enTranslations;
type TranslationParams = Record<string, string | number>;
```

## 核心逻辑

### 翻译表结构

两个 locale 文件（`en.ts`, `zh.ts`）导出同构的 `Record<string, string>` 对象。键名使用点分层级：
- `settings.*` — 设置界面文本
- `chat.*` — 聊天界面文本
- `common.*` — 通用文本

### 翻译解析链

`t(key, params?)` 解析流程：
1. `translations[currentLocale][key]` — 当前语言
2. `translations.en[key]` — 英文回退
3. `key` 本身 — 最终回退

### 参数插值

`{paramName}` 占位符通过正则 `/\{(\w+)\}/g` 替换：
```typescript
t('settings.model.refresh.success', { count: 5 })
// → "Found 5 providers" (en) 或 "发现 5 个提供商" (zh)
```

### 语言切换

`setLocale(locale)` 更新模块级 `currentLocale` 变量。不支持的语言回退到 `'en'`。

## 关键方法

| 方法 | 说明 |
|------|------|
| `setLocale(locale)` | 设置当前语言 |
| `getLocale()` | 获取当前语言 |
| `t(key, params?)` | 翻译键值（支持参数插值） |
| `getAvailableLocales()` | 获取可选语言列表（含原生标签） |
| `getAllTranslations()` | 获取当前语言全部翻译表 |

## 数据流

```
main.ts → onload()
  → setLocale(settings.locale)  // 'en' | 'zh'

任意 UI 代码
  → t('settings.server.started')
    → translations['zh']['settings.server.started']  // "OpenCode 服务器已启动"
    → 或 translations.en[key] 回退
    → 或 key 本身最终回退

设置面板语言切换
  → setLocale(newLocale)
  → 后续 t() 调用使用新语言
```

## 与其他模块的交互

- **main.ts**: 初始化时调用 `setLocale(settings.locale)`
- **OpenCodianSettings**: 语言选择器 UI
- **OpenCodianView**: 所有 UI 文本通过 `t()` 获取
- **ForkTargetModal**: 通过 `t('chat.fork.*')` 获取对话框文本
- **Glass 适配器**: `paramDefs` 中的 `labelKey`/`descKey` 指向 i18n 键

## 配置项

通过 `OpenCodianSettings.locale` 配置，值为 `'en'` 或 `'zh'`。

## 注意事项

- 翻译表是静态的，不支持运行时动态添加
- 新增翻译键必须同时添加到 `en.ts` 和 `zh.ts`
- 参数插值仅支持简单 `{key}` 格式，不支持复数规则等高级功能
- `TranslationKey` 类型从 `en.ts` 推导，保证类型安全

## 待补充
- [ ] 翻译键完整列表和分类
- [ ] 新增 locale 的步骤指南
- [ ] 翻译覆盖率检查工具
