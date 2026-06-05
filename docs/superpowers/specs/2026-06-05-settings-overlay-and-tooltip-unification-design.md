# Settings Overlay And Tooltip Unification Design

## Status

Approved exploration direction for the next settings-surface iteration.

This design builds on the earlier chat tooltip overlay fix and defines the settings-side follow-up:

- unify repo-controlled settings popovers under body-level overlay owners
- remove repo-internal settings native `title` tooltips
- keep framework-owned Obsidian `.setTooltip()` behavior out of scope for this round

## Goal

将 settings 侧当前分裂的 tooltip / popup / popover 体系收拢成两条清晰、可维护、可测试的渲染链路：

- `SettingsTooltipController`
- `SettingsPopoverController`

这次改动不是单纯把几个样式“调顺眼”，而是要解决三类结构性问题：

- **挂载位置不一致**：有的提示层挂在 `document.body`，有的还挂在局部容器里，导致 clipping 和 stacking 行为不可预测
- **原生 tooltip 失控**：repo 内 settings 还直接写了多处原生 `title`，它们会绕过插件自己的层级、样式和交互合同
- **信息承载方式混乱**：有些长文本靠 hover `title` 才能看到全部，有些元数据又塞进原生 `<option title>`，可见性和跨平台一致性都很差

## Chosen Approach

采用“**两个 owner、同一套几何合同、渐进迁移调用点、彻底清掉 repo 内 settings 原生 `title`**”的方案：

- 新增 `SettingsTooltipController`
  - 负责 settings 侧所有 repo 自己渲染的被动提示
  - body-level fixed overlay
  - hover / focus 驱动
  - 替换交互控件与截断文本上的原生 `title`
- 新增 `SettingsPopoverController`
  - 负责 settings 侧所有 repo 自己渲染的交互式弹层
  - body-level fixed overlay
  - 输入驱动 / 键盘导航 / 点击选择 / Escape 收起
  - 首批迁移 `enhanceSearchInput()` 搜索历史和 formatter/LSP builtin suggestion popover
- quick-nav tooltip 暂时保留现有业务 owner，但其几何和层级合同向新体系看齐
- Obsidian `.setTooltip()` 本轮不迁移
- settings repo 内直接写的原生 `title` 全部迁出：
  - 交互控件 → 共享 tooltip
  - 截断文本 / 值预览 → 共享 tooltip
  - `<option title>` 元数据 → 固定 detail 区或邻接详情块

## Why This Approach

- 这轮用户目标不是“修某一个按钮”，而是收掉 settings 侧“还分裂着的 popup/tooltip”。继续局部修补宿主 `position: relative` 或 `z-index` 只会把系统维持在碎片状态。
- tooltip 和 popover 的交互语义不同：
  - tooltip 是被动提示，不能抢鼠标
  - popover 是主动交互层，需要承载键盘导航、列表选择和滚动
  因此不适合为了“看起来统一”强行塞进一个过大的 all-in-one owner。
- repo 内 settings 原生 `title` 已经覆盖了几种完全不同的信息类型：按钮帮助、截断文本补全、颜色值预览、原生 `option` 元数据。如果不按信息类型重构，只是把 `title` 换个 API 名字，问题不会消失。
- Obsidian `.setTooltip()` 是框架侧行为，替换它会把这轮风险面扩大到插件外部控制链路，不符合这次“先统一 repo 自己可控体系”的边界。

## Scope

### In Scope

- 新增 `SettingsTooltipController`
- 新增 `SettingsPopoverController`
- 统一 settings body-level overlay 的定位、flip/clamp、层级和视口边距合同
- 迁移 `searchInputEnhancer.ts` 的搜索历史 popover
- 迁移 `SettingsFormatterSection.ts` 的 builtin formatter / LSP suggestion popover
- 替换 repo 内 settings 直接写入 DOM 的原生 `title`
- 为原来依赖 `<option title>` 的场景设计固定详情承载方式
- 对应单测、CSS 合同测试、模块文档更新

### Out Of Scope

- 迁移或替换 Obsidian `.setTooltip()`
- 修改 OpenCode / Obsidian 上游 API
- 统一非 settings 区域的 native `title`
- 新增一套与现有 settings layout 完全隔离的新 UI 系统
- 让所有 settings 浮层都必须共用同一个类或单一 controller

## Current Inventory

本设计针对的 settings 侧 repo-controlled 浮层主要分成四类：

1. `SettingsSectionCoordinator` quick-nav tooltip
   - 已是 body-level overlay
   - 仍有自己的 one-off owner 与几何逻辑
2. `searchInputEnhancer.ts` 搜索历史 popover
   - 当前挂在宿主容器内部
   - 定位依赖 `containerEl`
3. `SettingsFormatterSection.ts` builtin suggestion popover
   - 当前挂在 `.opencodian-builtin-list-search-field` 内
   - 受 sticky toolbar / scroll 容器影响
4. repo 内 settings 原生 `title`
   - 交互控件
   - 截断文本 / 值预览
   - 原生 `<option title>`
   - 图标 / 图片标签

## Source Constraints

当前设计以现有 repo 代码形态为准，尤其是：

- `src/features/settings/searchInputEnhancer.ts`
- `src/features/settings/SettingsFormatterSection.ts`
- `src/features/settings/SettingsSectionCoordinator.ts`
- `src/features/settings/settingsStyleControls.ts`
- `src/features/settings/SettingsStyleBackgroundSection.ts`
- `src/features/settings/SettingsSkillSection.ts`
- `src/features/settings/SlashCommandCatalogRenderer.ts`
- `src/features/settings/SettingsModelIconCacheManager.ts`
- `src/features/settings/SettingsCapabilityLabSection.ts`
- `src/style/modals/config-editor-modal.css`
- `src/style/components/model-selector.css`

需要承认并保留以下约束：

- formatter / LSP builtin suggestion 不是纯展示层，而是键盘可达的交互列表
- search history popover 当前已经有持久化和 debounce 逻辑，不应在迁移 overlay 时打散这条数据链
- quick-nav tooltip 已有测试覆盖 body-level mount；本轮更适合对齐合同，而不是强制重写 owner
- `<select><option>` 不适合继续承载复杂 tooltip 语义，尤其是多行元数据

## Architecture

### SettingsTooltipController

职责：

- 监听 settings 侧 tooltip trigger 的 hover / focus
- 把 tooltip bubble 挂到 `document.body`
- 解析 placement / alignment hint
- 处理 top / bottom / left / right fallback
- 执行 viewport clamp
- 统一 tooltip layer 的 `z-index` 和箭头偏移逻辑

调用方式：

- 交互控件通过 helper 注册 tooltip label
- 截断文本和值预览通过 helper 注册 tooltip content
- 不再通过原生 `title` 表达 repo 自己控制的提示文案

边界：

- 不负责可交互列表
- 不负责管理 Obsidian `.setTooltip()`

### SettingsPopoverController

职责：

- 为输入驱动的交互式弹层提供 body-level mount
- 支持 anchor-based fixed positioning
- 默认使用 `bottom-start`
- 下方空间不足时翻到上方
- 宽度至少与 anchor 对齐，最大尺寸受 viewport 限制
- 弹层内容自身滚动，不再依赖宿主滚动容器

首批 owner：

- `enhanceSearchInput()` 的搜索历史
- formatter / LSP builtin search suggestion

边界：

- 不处理被动 hover tooltip
- 不改变各业务 owner 自己的过滤、键盘导航、选择和状态逻辑，只接管 mount / geometry / layering

### Quick-Nav Alignment

quick-nav tooltip 这轮不强制合并进 `SettingsTooltipController`，但需要对齐以下合同：

- body-level fixed positioning
- 同一视口边距和 clamp 规则
- 与 settings tooltip / popover 的层级梯度兼容

这样它不再是一个“行为像 overlay、规则却独立漂移”的例外系统。

## Native `title` Replacement Rules

### Interaction Controls

按钮、切换、图标入口、拖拽预览提示这类交互控件：

- 删除原生 `title`
- 改为共享 tooltip trigger
- 保留或补齐 `aria-label` / `aria-labelledby`

代表场景：

- `settingsStyleControls.ts` reset button
- `SettingsSkillSection.ts` permission help button
- `SlashCommandCatalogRenderer.ts` visibility toggle wrapper
- `SettingsStyleBackgroundSection.ts` background preview drag hint

### Truncated Text And Value Previews

当前通过 `title` 暴露完整文本的值预览：

- 删除原生 `title`
- 当前可见文本继续保留截断样式
- hover/focus 时通过 `SettingsTooltipController` 显示完整内容

代表场景：

- color value preview
- normalized value display
- provider icon label

### `<option title>` Metadata

原来塞在原生 `option.title` 里的多行元数据不做“自定义原生 tooltip 模拟”。

替代策略：

- 保留 option 的短文本 label
- 选中项详情展示到邻接的固定 detail 区
- detail 区在 selection change 时同步更新

代表场景：

- `SettingsCapabilityLabSection` 的 session select 元数据

### Images And Icons

- `alt` 保留语义文本
- 需要 hover 说明时，由外层 host 成为 tooltip trigger
- 不再让 `img.title` 直接决定可见提示

## Geometry And Layering Contract

### Shared Rules

- 所有 repo-controlled settings overlay 都挂到 `document.body`
- 使用 `position: fixed`
- 统一 viewport margin
- 统一 horizontal clamp
- 支持 vertical flip

### Layering Gradient

建议层级关系：

- settings page content / sticky toolbars
- settings tooltip layer
- settings popover layer
- modal / confirm dialog / external framework higher layers

原则：

- tooltip 不能压住交互式 popover
- popover 必须高于 settings 内容与 sticky 行
- settings overlay 不能反过来压过真正的 modal

## Migration Order

1. 引入 `SettingsTooltipController` / `SettingsPopoverController`
2. 迁移 `searchInputEnhancer.ts`
3. 迁移 formatter / LSP builtin suggestion popover
4. 批量替换 repo 内 settings 原生 `title`
5. 对齐 quick-nav tooltip 的几何和层级合同

这条顺序的意图是先解决最确定的 clipping / stacking 根因，再收语义层的 `title` 债务。

## Error Handling And Fallbacks

- tooltip content 为空时不渲染 overlay
- popover 在无候选项时可以隐藏，但业务 owner 自己的“empty state”仍需保留
- anchor 不存在、已断开连接、或视口变化导致无法安全定位时，overlay 应主动销毁或隐藏
- 若 controller 不可用，不回退到自动写原生 `title`；而是保持无 hover 提示，避免再次引入双体系

## Testing Strategy

### Failing Tests First

每个迁移阶段先补失败测试，再写实现。

### Unit Tests

新增 / 扩展测试覆盖：

- tooltip / popover 渲染到 `document.body`，不是原宿主容器
- 靠近 viewport 边缘时会 clamp / flip
- search history 在 focus / blur / input / selection 下仍保持现有行为
- formatter / LSP suggestion 的键盘导航、Enter 选择、Escape 收起不回归
- 原来依赖 `title` 的 settings 控件不再写原生 `title`
- `<option title>` 场景改成固定 detail 区同步展示

### CSS Contract Tests

覆盖：

- settings tooltip layer 使用 `position: fixed`
- settings popover layer 使用 `position: fixed`
- max width / max height / z-index 合同
- 旧的局部 absolute popover 规则不再是主路径

### Manual Verification Targets

- model picker / provider icon picker 搜索历史
- slash command catalog 搜索历史
- formatter builtin search suggestion
- LSP builtin search suggestion
- style settings reset / value preview / background preview
- skill permission help
- capability lab session detail preview

## Documentation Impact

需要同步更新：

- `docs/modules/features/settings/SettingsSectionCoordinator.md`
- `docs/modules/features/settings/SettingsFormatterSection.md`
- `docs/modules/features/settings/SettingsPanelChrome.md`（若新增 helper 入口）
- `docs/modules/style/modals/config-editor-modal.md`
- 新增 controller 对应的 `docs/modules/shared/` 或 `docs/modules/features/settings/` 文档，取决于最终落点

## Risks

- settings popover 与现有 sticky toolbar 的交互如果处理不好，容易出现“位置正确但宽度/滚动行为变了”的回归
- 批量删除 `title` 时，如果没有同步补 tooltip 或 detail 区，可能造成信息直接丢失
- quick-nav 若这轮同时强绑到新 controller，会扩大改动面；因此本设计明确只对齐合同，不强制立刻合并 owner

## Success Criteria

- repo-controlled settings tooltip / popover 不再依赖局部容器挂载
- repo 内 settings 直接写入 DOM 的原生 `title` 被清理干净
- formatter / LSP suggestion 与搜索历史不再受 scroll container / sticky container clipping
- 关键 settings 入口的 hover / focus 行为在层级和边缘处理上表现一致
- 不引入对 Obsidian `.setTooltip()` 的额外耦合
