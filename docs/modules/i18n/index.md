# 国际化系统

> **源码**: `src/i18n/index.ts` + `src/i18n/locales/`
> **状态**: [REVIEW]

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
- `settings.*` — 设置界面文本（约 400+ 键）
- `chat.*` — 聊天界面文本（约 150+ 键）
- `plugin.*` — 插件基础信息
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
// → "Found 5 providers" (en) 或 "找到 5 个提供商" (zh)
```

### 语言切换

`setLocale(locale)` 更新模块级 `currentLocale` 变量。不支持的语言回退到 `'en'`。

### 可用语言

```typescript
getAvailableLocales()
// → [{ value: 'en', label: 'English' }, { value: 'zh', label: '简体中文' }]
```

## 关键方法

| 方法 | 说明 |
|------|------|
| `setLocale(locale: Locale): void` | 设置当前语言 |
| `getLocale(): Locale` | 获取当前语言 |
| `t(key: TranslationKey, params?: TranslationParams): string` | 翻译键值（支持参数插值） |
| `getAvailableLocales(): { value: Locale; label: string }[]` | 获取可选语言列表（含原生标签） |
| `getAllTranslations(): Record<TranslationKey, string>` | 获取当前语言全部翻译表（调试用） |

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
- **TitleGenerationService**: 使用 `locale` 驱动 AI 标题生成语言

## 配置项

通过 `OpenCodianSettings.locale` 配置，值为 `'en'` 或 `'zh'`。

## 翻译键分类统计

| 前缀 | 用途 | 约数 |
|------|------|------|
| `settings.*` | 设置界面 | 400+ |
| `chat.*` | 聊天界面 | 150+ |
| `plugin.*` | 插件信息 | 2 |

### 主要键空间

- `settings.server.*` — 服务器设置
- `settings.model.*` — 模型设置
- `settings.conversation.*` — 对话设置
- `settings.security.*` — 安全设置
- `settings.ui.*` — UI 设置
- `settings.style.*` — 样式设置
- `settings.debug.*` — 调试设置
- `settings.user.*` — 用户设置
- `settings.plugins.*` — 插件管理
- `settings.quickNav.*` — 快速导航
- `chat.input.*` — 输入框
- `chat.context.*` — 上下文
- `chat.question.*` — 问题系统
- `chat.tab.*` — 标签页
- `chat.fork.*` — 分叉对话
- `chat.rewind.*` — 回退对话
- `chat.serverStatus.*` — 服务器状态
- `chat.error.*` — 错误提示
- `chat.notice.*` — 通知
- `chat.omo.*` — OMO 相关
- `chat.backgroundTask.*` — 后台任务
- `chat.todo.*` — 待办
- `chat.message.*` — 消息
- `chat.stream.*` — 流式
- `chat.action.*` — 动作
- `chat.navigation.*` — 导航
- `chat.effort.*` — 努力级别
- `chat.history.*` — 历史会话

## 注意事项

- 翻译表是静态的，不支持运行时动态添加
- 新增翻译键必须同时添加到 `en.ts` 和 `zh.ts`
- 参数插值仅支持简单 `{key}` 格式，不支持复数规则等高级功能
- `TranslationKey` 类型从 `en.ts` 推导，保证类型安全
- 中文翻译文件约 1000 行，英文翻译文件约 1000 行
- 两套翻译表键必须完全一致，否则类型推导会失效

## 新增语言步骤

1. 创建 `src/i18n/locales/xx.ts`，导出 `xxTranslations` 对象
2. 更新 `src/i18n/locales/index.ts`，导出新语言
3. 更新 `src/i18n/index.ts`：
   - 添加 `Locale` 联合类型
   - 添加 `translations` 记录
   - 更新 `getAvailableLocales()`
4. 确保新语言键与英文表完全一致
