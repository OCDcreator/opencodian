# Settings Layout Contract Styles

> **源码**: `src/style/components/settings-layout-contract.css`
> **状态**: [REVIEW]

## 职责

定义设置界面的本地布局契约与共享 surface token。该文件为 classic 与 tabbed 设置界面提供统一的 section、ordinary setting row、object surface、inline group、半径与间距变量，并把共享设置容器映射到一致的视觉层级。

## Surface Contract

- `.opencodian-settings`：设置界面 token 作用域，所有 `--opencodian-settings-*` 变量都从 Obsidian 主题变量派生。
- `.opencodian-settings-content-shell`：布局型内容 shell，用于承载 classic / tabbed 内容，不承担重卡片视觉。
- `.opencodian-settings-section` / `.opencodian-settings-block.opencodian-settings-section`：共享 section block surface，使用 section 背景、边框与半径 token；legacy `.opencodian-settings-block` 本身保持兼容，不会单独触发契约样式。
- `.opencodian-settings-section-body` / `.opencodian-settings-block-body`：section 内部纵向 rhythm，普通设置行在这里按 row-card 规则排列。
- `.opencodian-settings-section .setting-item`：普通设置项的轻量 row-card 样式，和 object-card 等更重实体 surface 区分。

## Guardrails

- 只在 `.opencodian-settings` / `.opencodian-settings-section` 作用域内影响设置界面，不使用全局 `.setting-item` 或未标记的 `.opencodian-settings-block` 选择器。
- 共享设置 surface、spacing、row-card、object-card 和 inline group token 归此模块所有；各 section CSS 不应重复定义一套半径、边框、背景或 row-card 间距。
- 新的视觉迁移应优先复用这些 token，再按 section 的真实职责增加更具体的 object-card、summary、toolbar 或 state 样式。
- 修改后运行 `npm run build:css` 刷新根目录 `styles.css`。
