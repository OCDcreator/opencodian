# Formatter & LSP Settings Design

## Status

Approved exploration direction for the next settings-surface iteration.

This design supersedes the earlier formatter-only plan in `docs/superpowers/specs/2026-04-25-formatter-settings-design.md`.

## Goal

将现有独立的 `Formatter / 格式化工具` 设置页升级为一个更完整的 `Formatter & LSP / 格式化与语言服务` 设置面，既覆盖 OpenCode 后端当前公开的全部 formatter 与 LSP 配置能力，也让设置页的信息架构、视觉层级、文案解释和编辑效率更符合用户认知。

这次改动不是只“补字段”，而是同时解决三类问题：

- 能力覆盖不足：当前插件只对 formatter 提供完整配置面，LSP 还缺少对等的 schema 级设置 UI。
- 信息架构偏旧：现有 formatter 页面更像堆叠表单，状态、概念解释、项目配置意图之间的关系不够清楚。
- 视觉表达不均衡：对于较复杂的工具配置，页面需要更清晰的节奏和更好的分区，避免用户把它当成一块难以扫描的后台配置墙。

## Chosen Approach

采用“**一级整合入口 + 概览优先 + Formatter/LSP 分页深挖 + 编辑页默认展开全部关键字段 + JSON 兜底**”的方案：

- 一级设置入口从 `Formatter` 升级为 `Formatter & LSP`
- 二级页签固定为：
  - `Overview`
  - `Formatter`
  - `LSP`
- `Overview` 负责解释概念、展示运行态摘要、区分“当前运行状态”和“项目配置意图”
- `Formatter` 页只处理 `formatter` subtree，所有可视化字段默认展开
- `LSP` 页只处理 `lsp` subtree，所有可视化字段默认展开，包括 `initialization`
- `Advanced JSON` 不再独立成一个页签，而是作为 `Formatter` / `LSP` 页底部的最后一个区块
- 可视化编辑优先覆盖后端已公开的全部 schema 字段；未知字段继续通过 JSON editor 保留

## Why This Approach

- formatter 与 LSP 都属于 OpenCode 的项目级能力，合并成一个一级入口更符合用户心理模型。用户真正关心的是“代码编辑后如何格式化”和“代码理解/跳转靠什么语言服务”，而不是后端内部 namespace。
- 用户已经明确偏好“概览优先”，所以入口层必须先回答“这是什么、现在是什么状态、什么时候需要改”，而不是一进来就落到长表单。
- 用户同时又希望进入编辑页后尽量少折叠、少点击，因此 `Formatter` / `LSP` 深挖页必须默认展开字段，而不是再把重要项藏在层层 disclosure 里。
- formatter 和 LSP 的 schema 并不完全一致，尤其是：
  - formatter 使用 `environment`
  - lsp 使用 `env`
  - lsp 还独有 `initialization`
  这些差异必须被清楚表达，而不是为了 UI 复用被硬压成假统一模型。
- `Overview` + 独立编辑页 的结构能够同时满足新手理解成本和高级用户配置效率，比“单页全展开”更可控，也比“左右控制台式编辑器”更贴合 Obsidian 设置场景。

## Scope

### In Scope

- 一级设置入口从 `Formatter` 重构为 `Formatter & LSP`
- classic / tabbed 双布局中的导航、标题、二级页签同步更新
- 新增 LSP 的显式类型支持与项目配置读写
- formatter 与 lsp 的运行时状态展示
- formatter 与 lsp 的可视化配置编辑器
- formatter 与 lsp 的高级 JSON 编辑器
- 面向用户的概念说明、状态说明、字段说明文案
- 中英文 i18n
- 对应测试、模块文档、必要的 graphify/module-doc 同步
- 使用 `obsidian-plugin-autodebug` 做设置页调试、截图和回归审查

### Out of Scope

- 修改 OpenCode server / SDK schema 本身
- 自动安装 formatter 或 LSP server
- 发起真实格式化执行或语言服务请求作为设置页动作
- 为每种具体语言单独做专门向导
- 做一整套与现有 settings 完全隔离的新 UI 系统

## Source Constraints

本设计以当前 upstream 文档与源码为准：

- formatter 文档：`https://opencode.ai/docs/zh-cn/formatters/`
- upstream formatter schema / builtin 信息：
  - `packages/opencode/src/format/formatter.ts`
- upstream lsp schema：
  - `packages/opencode/src/config/lsp.ts`
  - `packages/sdk/js/src/v2/gen/types.gen.ts`

设计上必须承认并保留这些约束：

- `formatter` schema 支持：
  - `boolean`
  - `Record<string, { disabled?: boolean; command?: string[]; environment?: Record<string, string>; extensions?: string[] }>`
- `lsp` schema 支持：
  - `boolean`
  - `Record<string, { disabled: true } | { command: string[]; extensions?: string[]; disabled?: boolean; env?: Record<string, string>; initialization?: Record<string, unknown> }>`
- 对自定义 LSP server，upstream 要求 `extensions` 必填；builtin server 和显式 disabled 条目不受此限制

## Information Architecture

### Primary Navigation

一级标签改为：

- `Formatter & LSP`

它必须同时出现在：

- `settingsLayoutRegistry.ts` 的一级 tab 定义
- classic settings quick-nav
- 设置页 heading / scroll target
- 任何 settings title / subtitle / analytics-like 标记里仍引用旧名称的地方

### Secondary Tabs

二级标签固定为：

- `overview`
- `formatter`
- `lsp`

语义分工：

- `overview`：解释概念，展示摘要和引导动作
- `formatter`：专注 formatter 项目配置
- `lsp`：专注 LSP 项目配置

不再保留独立 `advanced` 子页，防止把“高级 JSON”误用成主入口。

## UX Direction

### Product Direction

这块设置面的产品方向不是“面向完全初学者的极简开关”，也不是“面向专家用户的纯控制台”。

它应该是一块**概览友好、说明充分、进入编辑后效率很高**的工作台设置面：

- 首屏帮助用户建立认知
- 深挖页减少不必要折叠
- 复杂字段也尽量在同一语境中可见

### Overview

`Overview` 只做三类事情：

1. 解释 formatter 与 LSP 的区别
2. 展示运行态与项目配置摘要
3. 给出明确入口动作

建议内容：

- 一段简短说明：
  - formatter 负责“AI 改完代码后如何落盘格式化”
  - LSP 负责“代码理解、跳转、诊断等语言服务能力”
- 两组摘要卡片：
  - formatter 摘要
  - LSP 摘要
- 每组摘要都明确区分：
  - runtime status
  - project config status
- CTA 行为：
  - “Configure Formatter”
  - “Configure LSP”

`Overview` 不承担深度编辑，不直接塞长表单。

### Formatter Page

`Formatter` 页使用统一骨架：

1. 模式切换区
2. 模式说明区
3. 内置 formatter 区
4. 自定义 formatter 区
5. 高级 JSON 区

每个条目默认展开，直接显示：

- `command`
- `environment`
- `extensions`

每个条目头部显示轻量摘要：

- 名称
- 扩展名
- runtime enabled / not enabled
- 当前是否存在项目覆写

内置 formatter 需要保留三态动作：

- `Use default`
- `Disable in project`
- `Override in project`

### LSP Page

`LSP` 页与 formatter 保持相同节奏，但保留 schema 差异：

1. 模式切换区
2. 模式说明区
3. 内置 LSP 区
4. 自定义 LSP 区
5. 高级 JSON 区

每个条目默认展开，直接显示：

- `command`
- `extensions`
- `env`
- `initialization`

需要明确提示：

- 自定义 LSP 必须填写 `extensions`
- `initialization` 会原样写入 LSP 初始化参数
- `env` 字段名与 formatter 的 `environment` 不同，这是后端 schema 差异，不做假统一

## Data Model

### Formatter Types

当前 `src/core/types/opencodeConfig.ts` 已显式建模 formatter；本轮应继续复用，但围绕新 UI 抽出更明确的 helper，使 formatter 读写逻辑不被散落在 section owner 里。

### LSP Types

本轮必须为 `src/core/types/opencodeConfig.ts` 增加显式 LSP 类型，例如：

- `OpencodeLspEntryConfig`
- `OpencodeLspConfig`
- `OpencodeLspStatus`（基于实际 SDK 返回做最小消费模型）

类型约束要同时满足两个目标：

- 对已知字段提供清晰编辑支持
- 保留 index signature / unknown field 容忍度，确保未来上游字段不会在保存时被意外抹掉

### Config State Semantics

formatter 与 lsp 都遵循三态：

- 字段缺失：default mode
- `false`：all disabled
- object：custom mode

UI 需要把三态转成一致的用户语言，但内部保存时仍保留原生 schema：

- 切到 `default`：删除 subtree
- 切到 `disabled`：写入 `false`
- 切到 `custom`：初始化为空对象或保留现有 object

### Unknown Field Preservation

视觉编辑器只应覆盖本轮负责的字段。

保存内置条目或自定义条目时必须：

- 先读取当前 subtree
- 合并更新目标 entry
- 保留 entry 内其余未知字段
- 保留 subtree 中未编辑的 sibling entries

高级 JSON 编辑器则直接负责 subtree 全量写回。

## Runtime State

### Formatter Runtime

继续通过 SDK facade / catalog query coordinator 获取：

- `formatter.status()`

Overview 与 Formatter 页把它当成“当前 runtime 结果”，不等同于项目配置。

### LSP Runtime

通过对应的：

- `lsp.status()`

来提供 LSP 摘要。

运行态显示必须始终和配置态分离，以避免以下误解：

- “我已经配置了，为什么状态不是 online？”
- “明明 runtime 有结果，为什么项目配置里没看到对应条目？”

### Offline / Failure Handling

如果 runtime 请求失败：

- `Overview` 显示 fetch failed / offline
- `Formatter` / `LSP` 页仍允许本地配置编辑
- builtin 列表不能因为 runtime 失败而完全消失

## Builtin Catalog Strategy

formatter 与 LSP 的 builtin 列表都不能纯依赖一次 runtime 返回。

策略分两层：

1. runtime 可见项优先显示实际状态
2. upstream 已知 builtin 列表作为补充候选，在 runtime 离线或未探测到时仍允许编辑

这意味着实现上需要一套稳定的“显示定义”来源，而不是把 runtime items 当成完整真相。

对于 formatter：

- 现有 `FORMATTER_BUILTIN_CATALOG` 可以继续使用，但要检查是否需要抽离或与新 owner 共享

对于 LSP：

- 需要从 upstream builtin server 列表中整理一份最小稳定 catalog
- catalog 只负责名称、默认扩展名、必要说明
- 不要把复杂启动逻辑复制进插件

## Interaction Rules

### Mode Switching

formatter / lsp 都遵循：

- 切到 `default`：删除 subtree
- 切到 `disabled`：写 `false`
- 切到 `custom`：若当前不是 object，则初始化 `{}`；若已是 object，则保留现有值

### Builtin Entries

内置条目支持：

- revert to default
- disable in project
- override in project

当条目处于 override 状态时，相关字段默认展开。
用户已经明确希望深挖页“尽量摊开”，因此即使字段为空，也不主动折叠成二次点击编辑模式。

### Custom Entries

自定义 formatter / LSP 都支持：

- 新增
- 编辑 name
- 编辑 command
- 编辑 environment-like fields
- 编辑 extensions
- 删除

其中自定义 LSP 还支持：

- 编辑 `initialization`

自定义名称必须有稳定 normalize 规则，并在冲突时给出可理解提示。

### Field Editing

`command`

- 继续使用 tokenized array 语义，而不是单个 shell 字符串
- UI 可暂时保留“单输入框 + split”交互，只要文案明确它最终会保存为数组

`environment` / `env`

- 使用 key/value rows
- 空 key 不允许保存
- 空 value 允许

`extensions`

- 使用 list/tag-like 编辑
- 统一 trim、补前导 `.`, 去重
- 对自定义 LSP，空值时阻止保存并给出明确提示

`initialization`

- 使用对象 JSON textarea 或结构化 object editor
- 首轮实现优先保证可编辑、可校验、可保留；不强求深度 schema-aware 子字段 UI

## Visual Design Direction

实现必须遵守当前 settings UI contract：

- 复用现有 settings token 和 section vocabulary
- 避免重新引入厚重卡片叠卡片
- 避免渐变、玻璃化、夸张 hover/motion

针对这一块页面，建议的视觉策略是：

- `Overview`：轻摘要卡 + 说明区 + CTA
- `Formatter` / `LSP`：分组卡片 + 条目卡片 + 稳定的状态 badge
- 条目详情区保持默认展开，但通过小标题、间距、字段标签和帮助文案建立节奏

目标观感：

- calm
- explicit
- scan-friendly
- not a control-panel wall

## Architecture

### Owner Strategy

优先复用并扩展现有 settings owner，而不是新建很多薄层 helper。

推荐方向：

- 现有 `SettingsFormatterSection` 升级为新的 combined owner，或重命名为更准确的 owner
- 它负责：
  - `Overview`
  - `Formatter`
  - `LSP`
- 读写逻辑保持通过已有 config manager / OpenCode service seam 完成

避免把运行态查询、config 写回、UI rendering、JSON editor 分散到大量只有单一调用点的新文件中。

### Config Helpers

如果 formatter / lsp 都需要 subtree-level exact replace / merge helper，应在 config 相关模块中提供与 formatter helper 对称的 lsp helper，而不是把 JSON splice 逻辑塞在 UI 层。

### Settings Layout Integration

必须同步更新：

- `settingsLayoutRegistry.ts`
- `SettingsTabbedRenderer.ts`
- `OpenCodianSettings.ts`
- `OpenCodianSettingsView.ts`

并保持 classic / tabbed 两种模式的一级入口和二级 tab 一致。

## Testing Strategy

### Unit Tests

至少新增或更新以下测试：

- 一级入口和二级页签注册
- `Overview` 渲染
- formatter mode switching
- lsp mode switching
- runtime failure fallback
- builtin 条目渲染与状态摘要
- 自定义 formatter 保存 / 删除
- 自定义 LSP 保存 / 删除
- 自定义 LSP 缺少 `extensions` 的校验
- formatter `environment` 与 lsp `env` 的字段映射
- `initialization` 保存与 JSON 校验
- 高级 JSON editor 对未知字段的保留
- CSS / layout contract tests（如该页面新增了稳定 class contract）

### Integration / Build Checks

实现完成前的最低 gate：

- 相关单测
- `npm run build`
- 必要时 `npm run verify`
- `npm run check:module-docs`
- 若 `src/` 改动触发 freshness 要求，则更新 graphify

### Obsidian Debug Loop

按 `obsidian-plugin-autodebug` 执行本地验收闭环：

1. build
2. deploy 到 Test Vault
3. reload plugin
4. 打开设置页对应入口
5. 截图、DOM/CSS、状态文案检查
6. 发现问题后 patch 并重复

至少验证：

- 一级入口命名正确
- 二级标签工作正常
- overview 的说明和状态不卡顿、不重叠、不截断
- formatter / lsp 默认展开字段不会造成灾难性布局
- dark/light 或当前主题下的可读性正常

## Documentation Updates

实现时需要同步更新相应文档，至少包括：

- 受影响 source module 对应的 `docs/modules/**`
- 若入口命名变化影响设置文档，也要同步说明
- 如架构边界改变，更新相关 requirements/status 文档

## Risks

### Layout Density Risk

编辑页默认展开全部字段会让页面明显变长。需要通过稳定分组、状态摘要和字段节奏来避免“展开即失控”。

### Schema Drift Risk

upstream formatter / LSP schema 仍可能演进。视觉编辑器必须保留 unknown fields，JSON editor 也必须继续作为完整兜底。

### Runtime vs Config Confusion

如果文案和布局处理不好，用户会把“已配置”和“已生效”混为一谈。这是这次设计必须优先解决的问题。

## Open Questions Resolved In Exploration

- 一级入口是否仍叫 `Formatter`：否，改为 `Formatter & LSP`
- 信息架构是否采用概览优先：是
- 深挖页是否应大量折叠：否，默认展开关键字段
- `Advanced JSON` 是否独立成页：否，放在各自编辑页底部

## Implementation Readiness

该设计已经足够进入 implementation planning。

实现时的优先顺序建议为：

1. 类型与 config helper 补齐
2. 导航 / settings layout 接线
3. `Overview` 页面
4. `Formatter` 页面重构
5. `LSP` 页面新增
6. i18n / tests / docs
7. autodebug 验收闭环
