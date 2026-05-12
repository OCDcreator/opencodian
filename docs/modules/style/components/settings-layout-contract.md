# Settings Layout Contract Styles

> **源码**: `src/style/components/settings-layout-contract.css`
> **状态**: [REVIEW]

## 职责

定义设置界面的本地布局契约与共享 surface token。该文件为 classic 与 tabbed 设置界面提供统一的 section、ordinary setting row、object surface、inline group、半径与间距变量，并把共享设置容器映射到一致的视觉层级。

## Surface Contract

- `.opencodian-settings`：设置界面 token 作用域，所有 `--opencodian-settings-*` 变量都从 Obsidian 主题变量派生。
- `.opencodian-settings-quick-nav` / `.opencodian-settings-tab-primary` / `.opencodian-settings-tab-secondary`：classic 与 tabbed 的同级 navigation-shell surface。它们可以显示 active / hover / focus 状态，但不承担内容卡片视觉。
- `.opencodian-settings-content-shell`：布局型内容 shell，用于承载 classic / tabbed 内容，不承担重卡片视觉。
- `.opencodian-settings-section` / `.opencodian-settings-block.opencodian-settings-section`：共享 section block surface，使用 section 背景、边框与半径 token；legacy `.opencodian-settings-block` 本身保持兼容，不会单独触发契约样式。
- `.opencodian-settings-section-body` / `.opencodian-settings-block-body`：section 内部纵向 rhythm，普通设置行在这里按 row-card 规则排列。
- `.opencodian-settings-section .setting-item`：普通设置项的轻量 row-card 样式，和 object-card 等更重实体 surface 区分。
- `.opencodian-theme-style-card` / `.opencodian-style-input-lock-note` / `.opencodian-debug-help-item`：在本轮只映射到 object token weight，不把样式设置、debug help 等复杂区域完整迁移成统一 object-card。

## Visible Unification Slice

本轮可见统一只处理 settings layout 的第一层观感：

- classic quick navigation 与 tabbed primary / secondary tabs 都使用轻量 navigation shell token。
- `.opencodian-settings-content-shell` 保持结构用途，不重新引入重 tab panel 卡片。
- `.opencodian-settings-section` 是本轮最强的通用内容 surface。
- 普通 `.setting-item` 继续保留轻卡片感，但必须只在 marked settings section 内生效。
- preview / object-like descendants 可以映射到 object tokens；MCP、model availability、formatter runtime、agents、commands、plugins 和深层 style preview 仍属于后续 owner-specific migration。

不要重新引入带阴影的 `.opencodian-settings-tab-panel`，也不要在共享设置 section 上使用粗 `border-left` 侧边条。这两类样式会重新制造大卡片套大卡片或局部 UI 家族漂移。

## Guardrails

- 只在 `.opencodian-settings` / `.opencodian-settings-section` 作用域内影响设置界面，不使用全局 `.setting-item` 或未标记的 `.opencodian-settings-block` 选择器。
- 共享设置 surface、spacing、row-card、object-card 和 inline group token 归此模块所有；各 section CSS 不应重复定义一套半径、边框、背景或 row-card 间距。
- 新的视觉迁移应优先复用这些 token，再按 section 的真实职责增加更具体的 object-card、summary、toolbar 或 state 样式。
- navigation shell 的 hover / focus 只能改变背景、边框或 outline，不应使用会造成布局错觉的 translate 或重 shadow。
- 修改后运行 `npm run build:css` 刷新根目录 `styles.css`。
