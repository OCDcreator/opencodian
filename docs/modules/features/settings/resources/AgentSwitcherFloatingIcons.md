# AgentSwitcherFloatingIcons

> **源码**: `src/features/settings/resources/AgentSwitcherFloatingIcons.ts`
> **状态**: [REVIEW]

## 概述

`AgentSwitcherFloatingIcons` 集中维护 settings backend switcher 的图标渲染。它保留旧的左侧悬浮图标组 renderer，同时提供标题行内的 icon-only backend switcher。

## 职责

- 当 enabled agent 少于两个时不渲染悬浮切换 UI
- 为左侧隐藏占位和垂直图标组创建 DOM；占位不再承担 hover 触发
- `renderAgentSwitcherHeaderIcons()` 在传入容器内渲染 `.opencodian-agent-switcher-header-icons`，每个 enabled backend 使用一个 `.opencodian-agent-switcher-header-icon` button，并写入 `aria-label`、`aria-pressed` 和 `title`
- OpenCode、Claude Code、Codex、Copilot 的固定图标使用内置 LobeHub SVG（@lobehub/icons-static-svg 1.101.0，保留 MIT 声明），模块初始化时生成并复用 light/dark data URL；设置页 header、floating rail 与聊天状态入口共用，不依赖外网、磁盘缓存或独立窗口的浏览器缓存。Pi、ZCode、DSH 继续使用既有本地图标注册。
- `renderAgentSwitcherBackendIcon()` 为其他 settings surfaces 提供同源 backend 图标渲染入口，例如 ACP preset buttons 可以复用标题行/后端选择器的 LobeHub 图标身份，而不是重新指定一套 provider SVG 资产
- 没有内置 LobeHub 资源的图标回退到既有 Obsidian `setIcon()` 注册；图片使用 eager/sync，隐藏的另一主题层也提前解码。
- 回退到 `setIcon()` 前会移除 `.opencodian-agent-switcher-icon--lobehub`；该 class 会把容器内所有 svg 置为 `display:none`，因此复用容器（例如聊天头部状态徽章）从 LobeHub 图标切到 Pi 时必须清除，否则回退图标不可见
- 仅在锚点连接后，将图标组 portal 到锚点当前 `ownerDocument.body`，并根据设置页容器 `getBoundingClientRect().left` 写入 `--opencodian-agent-switcher-fixed-left`，让图标组固定在当前设置 pane 左边缘，不随正文滚动；未连接的预渲染设置页不能向主窗口插入浮栏
- 设置页可能先在 detached DOM 中完成渲染，再接入 workspace 或被 Obsidian adopt 到独立窗口；MutationObserver、ResizeObserver 与渲染后的微任务同步共同确认锚点的实际连接状态，跨文档迁移时移动同一浮栏并将监听器、观察器全部重新绑定到实际窗口，避免留下主窗口孤儿浮栏
- editor-area 容器和每个 Obsidian 原生 `.modal.mod-settings` 容器各自拥有独立的 floating rail；modal owner 不再跳过渲染，因此 modal 内容内会保留自己的 hover-zone anchor 和 backend 按钮
- floating rail 生命周期按 owner container 记录；同一 owner 重复 render 会先幂等清理自己的旧 anchor/rail，不会删除另一个 editor 或 modal owner 的 rail
- 原生设置 modal 出现时，editor-area rail 仅通过 `aria-hidden="true"` / `.is-hidden-behind-modal` 隐藏，modal-owned rail 保持可见；modal 移除后其 rail 随 anchor 断开清理，editor rail 恢复为 `aria-hidden="false"`
- 图标组使用 `z-index: 50` 对齐 Obsidian modal layer；当用户从 settings 打开帮助 modal、详情 modal、其他非 `.mod-settings` 子对话框，或调试/Obsidian 原生设置打开了与当前 editor-area settings 无关的 `.mod-settings` 前景窗口时，rail 会写入 `aria-hidden="true"` / `.is-hidden-behind-modal` 并隐藏，避免 body-level rail 穿到前景窗口上方
- 为 entry/click 动画添加短生命周期 CSS class，持久 idle/hover/selected 效果交给 CSS
- 点击图标后把选中的 agent 回传给 `SettingsTabbedRenderer` 统一持久化与刷新

## 集成

- `SettingsTabbedRenderer`: 在 `.opencodian-settings-panel-title-actions` 内挂载 header icon switcher，同时保留左侧可收缩 floating icon rail；两个入口共享同一套 backend 切换回调
- `SettingsAcpSection`: 对 OpenCode、Codex、Claude Code 预设按钮调用 `renderAgentSwitcherBackendIcon()`，保证 ACP create card 与设置页 backend selector 使用同一套 backend 图标身份
- `src/utils/icons/lobehubIconManifest.ts`: 仅复用静态 variant 类型；固定后端图标不再导入目录或运行时解析 CDN URL。
- `src/style/components/agent-switcher.css`: 定义 header icons、legacy hover reveal、click feedback、selected 样式和 light/dark 图标切换

## Pi 自定义图标

2026-09-09：Pi使用用户提供的P/i SVG路径，按800→100坐标缩放注册为opencodian-pi。颜色继承主机currentColor以同时适配浅色/深色；设置标签、后端切换和聊天状态通过同一注册图标呈现，移除Perplexity替代图标。

## ZCode 图标

2026-09-22：ZCode 使用用户提供的官方 SVG 路径（30→100 坐标缩放）注册为 opencodian-zcode，品牌配色原样保留；AGENT_ICON_BY_BACKEND 增加 zcode 条目（穷举映射）。

## 2026-09-27 OpenCode 2 compatibility

The OpenCode 2 choice shares the OpenCode icon but has its own backend identity and label.


## 2026-10-23 DSH backend

新增 `opencodian-dsh` 图标并绑定 `dsh` 后端。图形使用官方 `website/public/favicon.svg` 的路径与蓝色 `#4D6BFE`，将原始 50×50 viewBox 缩放到 Obsidian 的 100×100 图标坐标；原始 SVG 保存在 `assets/dsh-favicon.svg`。

## 目录定位（2026-10-23）

- 源码位置：`src/features/settings/resources/AgentSwitcherFloatingIcons.ts`。
- 原位置：`src/features/settings/AgentSwitcherFloatingIcons.ts`；文件名、导出接口与业务职责保持不变。
- 随目录调整更新的依赖：`src/features/settings/backends/opencode/SettingsBackendSection.ts`。

## 2026-10-26 独立窗口定位

Floating rail 的 resize 监听、ResizeObserver 与 MutationObserver 使用 ownerDocument.defaultView 的窗口与构造器；解绑也在同一窗口执行。独立设置窗口只有 left 变化、容器宽度不变时仍同步几何；主窗口与独立窗口保持各自 rail 生命周期，不建立全局坐标。

## 2026-10-29 窗口迁移与关闭清理

浮栏不再把预渲染时的 document 固定为终身 owner。锚点连接到新 document 时，先释放旧窗口的 resize/pagehide 监听和观察器，再将 portal 与几何同步迁至实际 owner；首次跨文档连接由 layout observation 补充原 document 的 DOM observation。锚点断开或实际 owner 的 pagehide 均幂等释放浮栏，关闭独立设置窗口后主窗口不得残留入口。单元回归覆盖未接入、首次跨窗口接入、已连接页面迁移、目标窗口 resize 及 pagehide 清理。

## 2026-10-29 固定图标即时复用

固定后端 SVG 内置在既有 renderer，light/dark URL 在模块初始化时生成一次，重复打开设置与跨窗口展示复用同一资源。聊天头部由 ChatHeaderPresenter 按后端身份保留已挂载节点；原生状态轮询不再反复销毁并重新加载同一图标。用户配置的 provider 图标与 ProviderIconService 的缓存／回退策略不受此固定入口优化影响。
