# Formatter Settings Design

## Goal

为 OpenCodian 新增一个独立的一级设置页 `格式化工具 / Formatter`，把 OpenCode SDK 暴露的 formatter 能力接入插件设置体系：既能查看当前项目实际检测到的 formatter 状态，也能直接在设置页里管理当前项目 `.opencode/opencode.json` 的 `formatter` 配置。

## Chosen Approach

采用“**一级设置页 + 两个二级子页 + 项目级配置写回 + 运行时状态分离展示**”的方案：

- 在 settings 一级导航、tabbed 一级标签、classic quick-nav 中新增 `Formatter`
- 新增 `SettingsFormatterSection` 作为独立 owner，保持与现有 settings 架构一致
- UI 分为 `概览`、`配置` 两个子页
- 项目配置统一读写当前 vault 的 `.opencode/opencode.json > formatter`
- 运行时检测状态统一通过现有 `OpenCodeCatalogQueryCoordinator.getFormatterStatus()` / SDK `formatter.status()` 获取
- 可视化管理覆盖常见字段，复杂场景保留 `formatter` 子树 JSON 高级编辑兜底

## Why This Approach

- formatter 属于 OpenCode 的项目级能力，不应继续挂在 `Model` 或插件全局 settings 下
- “运行时检测结果”和“项目配置意图”是两条不同语义，必须拆开显示，避免用户误解“为什么我配置了但没生效”
- 一级页 + owner 设计能复用当前 settings 的组织方式，不把 formatter 生命周期重新堆回 `OpenCodianSettings.ts`
- 可视化编辑覆盖主流使用场景，高级 JSON 让复杂覆盖、自定义 formatter 和未来上游字段扩展仍有兜底

## Scope

### In Scope

- 新增 `Formatter` 一级设置入口
- formatter 一级页的 classic / tabbed 双布局接入
- formatter 项目配置三态模式：缺失 / `false` / object
- 内置 formatter 的项目级禁用与覆盖编辑
- 自定义 formatter 新增 / 删除
- 运行时 formatter 状态查询与只读展示
- formatter 子树高级 JSON 编辑
- 中英文 i18n
- 对应模块文档同步

### Out of Scope

- 实际触发一次 formatter 执行
- formatter 拖拽排序 / 批量导入导出
- 针对每种语言额外定制专门的向导 UI
- 改动 OpenCode server / SDK formatter 协议本身

## Information Architecture

### Primary Navigation

新增一级设置项：

- `Formatter`

它必须同时出现在：

- `settingsLayoutRegistry.ts` 的一级 tab 定义
- classic settings quick-nav
- 设置页 section heading / scroll target

### Secondary Tabs

二级标签固定为：

- `overview`
- `config`

classic 模式下使用一个一级 section + 两个主 block；tabbed 模式下映射到两个 secondary tabs。

## Data Model

### Runtime State

运行时状态来自 SDK：

- `client.formatter.status()`

设计上先按以下字段消费，但实现前必须实测确认返回结构：

- `name`
- `extensions`
- `enabled`

这部分代表“当前 OpenCode runtime 实际检测到什么”，不是项目配置本身。

### Project Config State

项目配置写入：

- `.opencode/opencode.json`
- 顶层字段：`formatter`

UI 三态映射：

- `formatter` 缺失 → `默认`
- `formatter: false` → `全部禁用`
- `formatter: { ... }` → `自定义`

单个 formatter 条目结构：

- `disabled?: boolean`
- `command?: string[]`
- `environment?: Record<string, string>`
- `extensions?: string[]`

### Type Support

当前 `OpencodeConfig` 只通过 `[key: string]: unknown` 容忍 `formatter`。本轮要给 `src/core/types/opencodeConfig.ts` 增加显式 formatter 类型，避免 settings/editor 逻辑继续依赖 loose unknown。

## UX Details

### Overview

展示：

- 当前模式：默认 / 全部禁用 / 自定义
- 配置文件路径
- 摘要卡片：
  - runtime 检测到多少 formatter
  - 当前 enabled 数量
  - 项目显式禁用数量
  - 自定义 formatter 数量
- runtime formatter 状态列表（原单独 `status` 子页内容并入这里）

这个分组负责“快速判断当前项目 formatter 能力是否健康”。

### Config

该分组是主操作面，包含：

- 模式切换：
  - 默认
  - 全部禁用
  - 自定义
- 内置 formatter 列表
- 自定义 formatter 列表
- `formatter` 子树高级 JSON collapsible block（原单独 `advanced` 子页内容并入这里）

每个内置 formatter 行显示：

- 名称
- 支持扩展名
- runtime 检测状态 badge
- 项目配置状态 badge（默认 / 已禁用 / 已覆盖）

每个内置 formatter 支持三种条目状态：

- `使用默认`
- `项目禁用`
- `项目覆盖`

只有在 `项目覆盖` 时才展开高级字段：

- `command`
- `environment`
- `extensions`

若用户清空覆盖内容且未设为 disabled，则删除该 formatter 条目并回退到 `使用默认`，避免配置膨胀。

自定义 formatter 支持：

- 新增条目
- 编辑名称
- 编辑 `command`
- 编辑 `environment`
- 编辑 `extensions`
- 删除条目
- 自定义 formatter 的 object key 直接使用用户输入名称的 normalize 结果：
  - trim
  - 转小写
  - 空格转 `-`
  - 去除明显不安全字符
  - 若与现有 key 冲突则提示用户改名

配置页底部的高级 JSON block 只编辑 `formatter` 子树，不开放整份 `.opencode/opencode.json`。能力包括：

- 查看当前 `formatter` 子树 JSON
- `格式化 JSON`
- 从磁盘重载
- 保存写回

保存前必须做 JSON 结构校验；保存成功后刷新 `overview` / `config`。

## Interaction Rules

### Mode Switch

- 切到 `默认` → 删除 `config.formatter`
- 切到 `全部禁用` → 写回 `formatter: false`
- 切到 `自定义`
  - 若原值不是对象，则初始化为 `{}`
  - 不自动生成所有内置 formatter 条目

### Command Editing

- `command` 使用“参数数组”语义，不提供单字符串 shell 命令输入
- 每一项单独编辑，保留 OpenCode 原始 schema 语义

### Environment Editing

- `environment` 使用 key/value 表格
- 空 key 不允许保存
- 空 value 允许保存为 `''`

### Extensions Editing

- `extensions` 使用 tag/list 编辑
- 保存前统一规范：
  - trim whitespace
  - 自动补前导 `.`
  - 去重

### Refresh Flow

每次保存成功后：

1. 重新读取 `.opencode/opencode.json`
2. 重新拉取 `formatter.status()`
3. 重渲染当前 formatter section

### Runtime Status Fallback

- 若 server offline 或 `formatter.status()` 请求失败：
  - `overview` 页的 runtime badge 统一显示为 `离线` 或 `获取失败`
  - 本地 config 编辑仍可继续
  - 不阻止保存本地 `formatter` 配置

## Architecture

### New Owner

新增：

- `src/features/settings/SettingsFormatterSection.ts`

职责边界：

- formatter 一级页 section lifecycle
- classic / tabbed 两种布局 block 装配
- 概览 / 配置 两个分组的组装
- 调用 project config manager 和 runtime status query

`OpenCodianSettings.ts` 只负责 owner 装配，不直接持有 formatter UI 细节。

### Supporting Seams

建议增加受控 helper：

- `OpencodeConfigManager.getFormatterConfig()`
- `OpencodeConfigManager.updateFormatterConfig()`

这样 formatter 写回不用在 settings owner 里手动读写整个 config 对象。

如果 formatter section 代码量继续增长，再二次拆分：

- `SettingsFormatterConfigCoordinator`
- `SettingsFormatterStatusPresenter`

但第一版先不预拆，避免过早碎片化。

## Error Handling

- runtime `formatter.status()` 失败：
  - `overview` 显示错误 notice / offline badge
  - `config` 仍可编辑本地配置
- `.opencode/opencode.json` 不存在：
  - 允许基于默认 config 写入
- JSON 非法：
  - 阻止保存
  - 保留编辑内容，不覆盖磁盘
- 保存失败：
  - 回滚 UI optimistic state
  - 弹出 notice

## Files Expected

- Modify: `src/features/settings/settingsLayoutRegistry.ts`
- Modify: `src/features/settings/OpenCodianSettings.ts`
- Modify: `src/features/settings/SettingsTabbedRenderer.ts`
- Create: `src/features/settings/SettingsFormatterSection.ts`
- Modify: `src/core/types/opencodeConfig.ts`
- Modify: `src/core/types/index.ts`
- Modify: `src/core/config/OpencodeConfigManager.ts`
- Modify: `src/i18n/locales/zh.ts`
- Modify: `src/i18n/locales/en.ts`
- Modify: `docs/modules/features/settings/OpenCodianSettings.md`
- Create: `docs/modules/features/settings/SettingsFormatterSection.md`
- Modify: `docs/modules/core/types/opencodeConfig.md`
- Modify: `docs/modules/core/config/OpencodeConfigManager.md`

## Verification

- 先在实现前打印 / inspect 一次 `formatter.status()` 实际返回结构，再固化 UI 类型
- formatter config type helper 单测（如当前相邻模式允许）
- settings formatter section 渲染与 mode-switch/save 行为测试
- runtime formatter status 展示测试（mock SDK / service）
- targeted Jest for formatter/settings lane
- `npm run check:module-docs`
- `npm run verify`

## Implementation Notes

- 第一版优先做完整主链，不做拖拽排序或批量操作
- 第一版只保留 `overview` + `config` 两个 secondary tabs；避免过早把 formatter section 做成与 model section 同等重量级
- 不把 formatter 配置写入插件全局 settings；插件 settings 只保留 UI 状态
- 文案中必须明确“项目配置”与“运行时检测”的区别
- 若 future OpenCode schema 扩展 formatter entry 字段，`Advanced` 分组仍应允许原样保留未知字段，避免设置页写回时抹掉上游新增能力
