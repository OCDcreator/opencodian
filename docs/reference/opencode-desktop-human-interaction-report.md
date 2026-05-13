# OpenCode Desktop 前端人机交互组件全面报告

> **项目路径**: `/Volumes/SDD2T/obsidian-vault-write/open-source-project/AI-tools-agents/opencode/` (覆盖 `packages/desktop/`, `packages/opencode/`, `packages/web/`, `packages/app/`, `packages/ui/`)  
> **分析日期**: 2026-05-12  
> **修订日期**: 2026-05-12 (基于 Council 审查反馈修订)  
> **报告目标**: 全面梳理 OpenCode Desktop 作为前端，所有用于处理和人类之间交互展示的组件体系

---

## 目录

1. [概述](#1-概述)
2. [架构全景图](#2-架构全景图)
3. [TUI 终端交互界面](#3-tui-终端交互界面)
   - 3.1 进程模型
   - 3.2 路由系统
   - 3.3 组件层级
   - 3.4 上下文/状态管理
   - 3.5 插件系统
   - 3.6 配置系统
   - 3.7 UI 基础组件
   - 3.8 事件系统
   - 3.9 提示输入系统
   - 3.10 快捷键绑定系统
4. [Desktop Electron 桌面应用](#4-desktop-electron-桌面应用)
   - 4.1 三层进程架构
   - 4.2 主进程层
   - 4.3 预加载层
   - 4.4 渲染器层
   - 4.5 IPC 通信机制
   - 4.6 侧边服务器管理
   - 4.7 原生 API 封装
5. [Web 前端](#5-web-前端)
   - 5.1 架构概述
   - 5.2 共享会话查看器
   - 5.3 文档站点
6. [App 应用层](#6-app-应用层)
   - 6.1 路由结构
   - 6.2 会话页面
   - 6.3 19 个上下文提供者
7. [UI 共享组件库](#7-ui-共享组件库)
   - 7.1 设计系统
   - 7.2 63 个组件分类
   - 7.3 主题引擎
8. [交互模式总结](#8-交互模式总结)
9. [人机交互能力矩阵](#9-人机交互能力矩阵)

---

## 1. 概述

OpenCode Desktop 不是一个单一的前端，而是**多层前端体系**的集合，包含：

| 前端类型 | 包路径 | 技术栈 | 交互场景 |
|---------|--------|--------|---------|
| **TUI** | `packages/opencode/src/cli/cmd/tui/` | SolidJS + opentui | 终端命令行交互 |
| **Desktop** | `packages/desktop/` | Electron 41 + SolidJS | 桌面 GUI 应用 |
| **Web** | `packages/web/` | Astro 5 + SolidJS | 文档/共享链接 |
| **App** | `packages/app/` | SolidJS + Solid Router | 共享应用逻辑层 |
| **UI** | `packages/ui/` | SolidJS + Kobalte | 共享组件库 |

**核心设计原则**：
- **薄壳厚芯**：Desktop 是薄壳（Electron 包装），Web 是独立文档站点，真正的应用逻辑在 `app/` 和 `ui/` 中
- **平台抽象**：Desktop/App 通过 `PlatformProvider` 封装原生能力差异；TUI 使用独立的插件系统；Web 仅用于文档和共享查看器
- **状态单向流动**：SSE → GlobalSDK → GlobalSync → UI 组件

---

## 2. 架构全景图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          用户 / 浏览器                                  │
└───────────────────────────┬─────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                    ▼
┌───────────────┐  ┌────────────────┐  ┌──────────────────────┐
│   web/        │  │   desktop/     │  │   CLI / TUI         │
│ (Astro SSR)   │  │ (Electron)     │  │ (opentui 终端)      │
│               │  │                │  │                      │
│ 文档/落地页   │  │ 主进程         │  │ 主线程 + Worker      │
│ 共享页面      │  │ 侧边服务器     │  │ opentui 渲染器       │
│ SolidJS 岛    │  │ 原生 API       │  │                      │
│ (Share.tsx)   │  │ MemoryRouter   │  │                      │
└───────┬───────┘  └───────┬────────┘  └──────────────────────┘
        │                  │
        └─────────┬────────┘
                  ▼
┌──────────────────────────────────────┐
│          @opencode-ai/app            │
│                                      │
│  AppInterface                        │
│  ├─ ServerProvider                   │
│  ├─ ConnectionGate (健康检查)        │
│  ├─ GlobalSDK (SSE 事件流)           │
│  ├─ GlobalSync (全局存储)            │
│  ├─ Router (首页/目录/会话)          │
│  ├─ 19 个上下文提供者                │
│  └─ PlatformProvider 抽象            │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│       @opencode-ai/ui                │
│                                      │
│  63 个 SolidJS 组件                  │
│  ├─ Button / Input / Select / Tabs   │
│  ├─ Dialog / Toast / Popover         │
│  ├─ Markdown / Card / List           │
│  ├─ MessagePart / SessionTurn        │
│  ├─ ProviderIcon / ToolCard          │
│  ├─ Typewriter / AnimatedNumber      │
│  └─ 主题系统 (37 个主题)             │
│                                      │
│  └─ @kobalte/core (无障碍原语)       │
│  └─ Tailwind v4 (可选工具类)         │
│  └─ marked + Shiki + KaTeX           │
│  └─ 17 个 locale 文件                │
└──────────────────┬───────────────────┘
                   │
         ┌─────────┼─────────┐
         ▼         ▼         ▼
┌────────────┐ ┌────────┐ ┌──────────────┐
│ @opencode  │ │ core/  │ │   sdk/       │
│ (server)   │ │工具    │ │ SSE 客户端   │
└────────────┘ └────────┘ └──────────────┘
```

---

## 3. TUI 终端交互界面

**路径**: `packages/opencode/src/cli/cmd/tui/`  
**技术栈**: SolidJS + opentui (基于 Zig 的终端 UI 框架)  
**SDK**: `@opencode-ai/sdk/v2`

### 3.1 进程模型

TUI 采用**双进程架构**：主线程渲染 UI，Worker 线程运行 OpenCode 服务器。

```
┌─────────────────────────────────────┐
│          主线程 (Main Thread)       │
│  (thread.ts)                        │
│  ├── 创建 Worker 进程               │
│  ├── 创建 RPC 客户端                │
│  ├── 导入 app.tui()                 │
│  └── 通过 opentui 渲染 TUI          │
├─────────────────────────────────────┤
│          Worker 线程                │
│  (worker.ts)                        │
│  ├── 启动 OpenCode 服务器           │
│  ├── 处理 fetch RPCs                │
│  ├── 转发全局事件 (RPC)             │
│  └── 管理升级/重载                  │
└─────────────────────────────────────┘
```

**三种连接模式**：
1. **本地模式 (默认)**: 内部 Worker RPC — `http://opencode.internal` + 自定义 fetch
2. **外部模式 (--port/--hostname)**: 直接 HTTP 连接
3. **附加模式 (opencode attach <url>)**: 连接到任意运行中的服务器

### 3.2 路由系统

**文件**: `context/route.tsx` + `app.tsx`

路由系统简单扁平，仅三种路由类型：

| 路由类型 | 用途 | 渲染组件 |
|---------|------|---------|
| `home` | 落地页（Logo + 输入框） | `<Home />` |
| `session` | 聊天会话（消息、侧边栏、输入框） | `<Session />` |
| `plugin` | 外部插件扩展 | `routes.get(id).render()` |

**路由行为** (app.tsx)：
- 插件路由通过 `TuiPluginRuntime` 注册（`Map<string, RouteEntry[]>`）
- 路由变更使用 `solid-js/store` + `reconcile()` 实现最小 DOM 更新
- 终端标题根据路由和会话标题动态更新
- `--continue` 参数自动导航至最近的根会话
- `--fork` 在导航前创建分支
- `--session` 直接导航至指定会话

### 3.3 组件层级

#### App 外壳

```
<ErrorBoundary>
  <OpencodeKeymapProvider>      ← 快捷键系统
    <ArgsProvider>              ← CLI 参数 (--continue, --model 等)
      <ExitProvider>           ← 应用生命周期/清理
        <KVProvider>           ← 持久化键值存储
          <ToastProvider>      ← Toast 通知
            <RouteProvider>    ← 路由状态
              <TuiConfigProvider>
                <SDKProvider>  ← OpenCode API 客户端 + SSE 事件
                  <ProjectProvider>
                    <SyncProvider>        ← 主数据同步 (v1)
                    <SyncProviderV2>      ← 实验性会话同步 (v2)
                      <ThemeProvider>
                        <LocalProvider>   ← 本地状态 (agent, model, session, MCP)
                          <PromptStashProvider>
                          <DialogProvider>  ← 模态对话框栈
                          <CommandPaletteProvider>
                          <FrecencyProvider>
                          <PromptHistoryProvider>
                          <PromptRefProvider>
                          <EditorContextProvider>
                            <App>
```

#### 首页路由 (`routes/home.tsx`)

```
<Logo />                    ← 应用 Logo（可通过插件插槽替换）
<Prompt />                  ← 文本输入框（带自动补全）
<Toast />                   ← 覆盖层通知
<PluginSlot: home_footer /> ← 状态栏（单一胜出插件）
```

#### 会话路由 (`routes/session/index.tsx`)

提供包含会话状态（宽度、隐藏、时间戳、提供商等）的 `context`：

```
<ScrollBox>
  <UserMessage />           ← 用户消息（文件附件、agent 颜色、压缩标记）
  <AssistantMessage />      ← 委托给 Part 组件：
    <TextPart />            ← Markdown 渲染的助手文本
    <ToolPart />            ← 工具调用/执行显示
    <ReasoningPart />       ← 可折叠思考块
</ScrollBox>
<PermissionPrompt />        ← 模态权限请求（编辑/读取/Shell 等）
<QuestionPrompt />          ← 交互式问题对话框
<SubagentFooter />          ← 子会话导航栏
<Prompt />                  ← 文本输入框
<Sidebar />                 ← 会话信息面板（42 列宽）
<Toast />
```

**Part 渲染映射** (`PART_MAPPING`)：

| 类型 | 组件 | 说明 |
|-----|------|------|
| `text` | `<TextPart>` | Markdown/代码渲染，含语法高亮 |
| `tool` | `<ToolPart>` | 工具调用显示（进度、diff 渲染） |
| `reasoning` | `<ReasoningPart>` | 可折叠思考块，支持 [REDACTED] 过滤 |

#### 会话子路由

| 文件 | 用途 |
|------|------|
| `footer.tsx` | 状态栏（目录、LSP/MCP 计数、权限计数） |
| `sidebar.tsx` | 会话信息（标题、ID、工作区、Token、待办、diff）+ 插件插槽 |
| `permission.tsx` | 文件编辑 diff、Shell 命令、glob/grep、web fetch — 模态权限授予（一次/总是/拒绝） |
| `question.tsx` | 多标签页问题表单（选项、自定义文本输入、多选） |
| `dialog-message.tsx` | 完整消息详情/回复对话框 |
| `dialog-subagent.tsx` | 子代理消息检查 |
| `dialog-timeline.tsx` | 会话时间线（导航消息） |
| `dialog-fork-from-timeline.tsx` | 在特定消息处分叉 |
| `subagent-footer.tsx` | 子会话导航栏（含 Token 用量） |

### 3.4 上下文/状态管理

所有上下文使用 `createSimpleContext` 辅助函数（基于 SolidJS `createContext`），提供 `provider` 组件和类型化访问器。

#### 核心数据上下文

| 上下文 | 文件 | 职责 | 关键 API |
|--------|------|------|---------|
| **SDK** | `context/sdk.tsx` | OpenCode SDK v2 客户端 + SSE 事件流 | `client`, `event`, `url`, `fetch`, `directory` |
| **Sync** | `context/sync.tsx` | 主存储：会话、消息、部件、提供商、agents、待办、diff、权限、问题、LSP、MCP | `data`, `session.get/query/refresh/status/sync`, `bootstrap` |
| **SyncV2** | `context/sync-v2.tsx` | 实验性 `session.next.*` 事件流 | `data.messages`, `session.message.sync` |
| **Local** | `context/local.tsx` | 本地状态：当前 agent、模型（含变体、收藏）、会话固定、MCP 开关 | `model.current/set/cycle/favorite`, `agent.current/set/move/color`, `session.pinned/recentOrder/slots`, `mcp.isEnabled/toggle` |
| **Theme** | `context/theme.tsx` | 主题解析、30+ 内置主题、自定义主题加载、基于 ANSI 的系统主题生成、语法高亮 | `theme` (Proxy), `syntax`, `set`, `mode`, `lock` |
| **Project** | `context/project.tsx` | 项目路径、工作区列表/状态 | `instance.path`, `workspace.current/list/status` |
| **Route** | `context/route.tsx` | 当前路由（home/session/plugin） | `data`, `navigate()` |
| **KV** | `context/kv.tsx` | 持久化 JSON 键值存储（文件支持、flock 锁定） | `get`, `set`, `signal`（响应式 getter/setter） |
| **TuiConfig** | `context/tui-config.tsx` | 解析的 TUI 配置 | 传递 `TuiConfig.Resolved` |
| **Exit** | `context/exit.tsx` | 应用生命周期、清理、错误输出 | 可调用函数，含 `.message.set()` |
| **Args** | `context/args.tsx` | CLI 参数 | `model`, `agent`, `prompt`, `continue`, `sessionID`, `fork` |
| **Prompt** | `context/prompt.tsx` | 全局提示引用 | `current: PromptRef`（供其他组件操作输入框） |
| **Editor** | `context/editor.ts` | 通过 WebSocket MCP 的 IDE 集成 | `selection`, `reconnect`, `onMention`, `labelState` |
| **CommandPalette** | `context/command-palette.tsx` | 命令面板 + 斜杠命令 | `run`, `show`, `slashes`, `suspend`, `matcher` |
| **Directory** | `context/directory.ts` | 当前目录路径（含分支信息） | Computed memo |
| **Event** | `context/event.ts` | SDK 全局事件流包装 | `useEvent()` hook |
| **PathFormat** | `context/path-format.tsx` | 路径格式化上下文 | `PathFormatterProvider` |
| **EditorZed** | `context/editor-zed.ts` | Zed 编辑器集成工具 | 编辑器辅助函数 |

**注意**: `directory.ts` 导出 `useDirectory()` hook（非 Provider），`aggregate-failures.ts` 导出 `aggregateFailures()` 工具函数（非 Provider）。

#### UI 上下文

| 上下文 | 文件 | 职责 |
|--------|------|------|
| **Dialog** | `ui/dialog.tsx` | 基于栈的模态对话框管理器（Esc/退格关闭） |
| **Toast** | `ui/toast.tsx` | 自动消失的覆盖层通知 |

### 3.5 插件系统

**路径**: `plugin/`

复杂的插件架构，允许外部 JS/TS 模块扩展 TUI。

#### 架构

```
plugin/runtime.ts         ← 插件生命周期管理
  ├── api.tsx             ← 插件 API 桥接 (createTuiApi)
  ├── slots.tsx           ← 插槽系统（组件注入点）
  ├── internal.ts         ← 内置功能插件
  └── command-shim.ts     ← v1 → v2 API 兼容桥接
```

#### 插件生命周期

1. **加载**: 从配置解析内部插件 + 外部插件
2. **初始化**: `App` 挂载期间调用 `TuiPluginRuntime.init()`
3. **激活**: 每个插件获得作用域 API + 生命周期信号
4. **销毁**: 退出时清理（每个插件 5 秒超时保护）

#### 插件 API (`TuiPluginApi`)

| 命名空间 | 能力 |
|---------|------|
| `route` | 注册/导航路由 |
| `keymap` | 注册快捷键、命令、层级（作用域追踪） |
| `ui` | 对话框组件（Alert, Confirm, Prompt, Select）、插槽渲染、提示注入、Toast |
| `kv` | 键值存储访问 |
| `state` | 同步状态只读访问（配置、提供商、会话、消息、部件、LSP、MCP） |
| `client` | 原始 SDK 客户端访问 |
| `event` | 订阅事件（作用域追踪） |
| `theme` | 读取/设置主题、主题安装 |
| `slots` | 注册组件注入插槽 |
| `plugins` | 列出/激活/停用/添加/安装其他插件 |
| `lifecycle` | AbortSignal + onDispose |

#### 插槽系统 (`slots.tsx`)

基于 `@opentui/solid` 的 `createSolidSlotRegistry`。插槽名称定义在 `packages/plugin/src/tui.ts` (`TuiHostSlotMap`)，在 `packages/opencode/src/cli/cmd/tui/plugin/slots.tsx` 中注册运行时。关键注入点：

| 插槽名称 | 位置 | 模式 |
|---------|------|------|
| `app` | App 覆盖层 | append |
| `app_bottom` | App 底部（路由之后） | append |
| `home_logo` | 首页 Logo 区域 | replace |
| `home_prompt` | 首页输入框 | replace |
| `home_prompt_right` | 首页输入框右侧 | append |
| `home_bottom` | 首页底部内容 | append |
| `home_footer` | 首页页脚 | single_winner |
| `sidebar_title` | 会话侧边栏标题 | single_winner |
| `sidebar_content` | 会话侧边栏内容 | append |
| `sidebar_footer` | 会话侧边栏底部 | single_winner |
| `session_prompt` | 会话输入框 | replace |
| `session_prompt_right` | 会话输入框右侧 | append |

**注意**: 之前的报告错误列出了 `sidebar_info` 和 `sidebar_bottom`（不存在），遗漏了 `app`、`home_bottom`、`sidebar_content` 和 `sidebar_footer`。

#### 内置插件 (`internal.ts`)

预安装的功能插件：
- **Home**: `tips`, `tips-view`, `footer`
- **Sidebar**: `files`, `lsp`, `mcp`, `todo`, `context`, `footer`
- **System**: `plugins`（管理器）, `session-v2`（调试）, `which-key`

#### 插件解析

- 内部插件 → 直接加载
- 外部插件 → 通过 `PluginLoader` 从 `.opencode/tui.json` 配置条目解析
- 插件主题 → `.json` 文件通过 `opencode-ai/core/util/flock` 同步到配置目录

### 3.6 配置系统

**路径**: `config/`

| 文件 | 用途 | 关键导出 |
|------|------|---------|
| `config/tui.ts` | 主配置加载/解析器 | `get()`, `Service`, `Resolved`，从 `tui.json` 读取，扁平化嵌套 `tui` 键 |
| `config/keybind.ts` | 快捷键绑定规范化 | `TuiKeybind`（绑定定义、命令映射、验证） |
| `config/cwd.ts` | 工作目录服务 | Effect 上下文用于配置解析 |
| `config/tui-schema.ts` | 模式定义 | `TuiInfo`, `KeymapLeaderTimeoutDefault` |
| `config/tui-migrate.ts` | 配置迁移 | 处理旧 → 新配置格式 |

配置通过 Effect 的 `Layer` 系统解析 (`layer.ts`)：
```
CliLayer = Observability.layer
  .pipe(Layer.merge(TuiConfig.layer))
  .pipe(Layer.provide(Npm.defaultLayer))
```

### 3.7 UI 基础组件

#### UI 原语 (`ui/`)

| 组件 | 文件 | 用途 |
|------|------|------|
| **Dialog** | `ui/dialog.tsx` | 基于栈的模态对话框（Esc/退格关闭、可配置尺寸 medium/large/xlarge、覆盖层背景） |
| **DialogAlert** | `ui/dialog-alert.tsx` | 简单确认对话框，静态 `.show()` 支持基于 Promise 的用法 |
| **DialogConfirm** | `ui/dialog-confirm.tsx` | 是/否/跳过对话框，基于 Promise 的 `.show()` |
| **DialogPrompt** | `ui/dialog-prompt.tsx` | 文本输入对话框 |
| **DialogSelect** | `ui/dialog-select.tsx` | 模糊搜索可过滤选择列表（分组、fuzzysort 匹配、键盘导航、操作按钮） |
| **DialogHelp** | `ui/dialog-help.tsx` | 快捷键参考 |
| **DialogExportOptions** | `ui/dialog-export-options.tsx` | 会话导出配置（文件名、包含思考/工具详情/元数据） |
| **Link** | `ui/link.tsx` | 可点击 URL 链接 |
| **Toast** | `ui/toast.tsx` | 自动消失的通知覆盖层（info/success/warning/error 变体） |
| **Spinner** | `ui/spinner.ts` | 可配置的旋转器帧（dots, line, braille, arrows, pulse 等） |

#### 对话框组件 (`component/dialog-*`)

| 组件 | 用途 |
|------|------|
| `dialog-agent.tsx` | Agent 选择列表 |
| `dialog-model.tsx` | 模型选择（按提供商分组） |
| `dialog-provider.tsx` | 提供商连接列表 |
| `dialog-mcp.tsx` | MCP 开关列表 |
| `dialog-skill.tsx` | 技能选择 |
| `dialog-session-list.tsx` | 会话列表（搜索、固定、取消） |
| `dialog-session-rename.tsx` | 会话重命名 |
| `dialog-session-delete-failed.tsx` | 删除结果（成功/失败计数） |
| `dialog-stash.tsx` | 暂存提示 |
| `dialog-status.tsx` | 连接/版本状态 |
| `dialog-tag.tsx` | 标签选择 |
| `dialog-theme-list.tsx` | 主题选择器 |
| `dialog-variant.tsx` | 模型变体选择 |
| `dialog-workspace-create.tsx` | 工作区创建（分叉/切换） |
| `dialog-workspace-file-changes.tsx` | 工作区切换的文件变更审查 |
| `dialog-workspace-unavailable.tsx` | 工作区错误显示 |
| `dialog-console-org.tsx` | 控制台组织切换器 |
| `dialog-retry-action.tsx` | 速率限制的升级对话框 |

#### 视觉组件

| 组件 | 用途 |
|------|------|
| `border.tsx` | SplitBorder, EmptyBorder — 自定义边框字符 |
| `spinner.tsx` | 旋转器包装（使用 `opentui-spinner`） |
| `logo.tsx` | 应用 Logo（含 agent 颜色） |
| `startup-loading.tsx` | 初始化期间的加载覆盖层 |
| `error-component.tsx` | 带堆栈跟踪的全屏错误显示 |
| `plugin-route-missing.tsx` | 未注册插件路由的回退 |
| `workspace-label.tsx` | 工作区类型/状态徽章 |
| `use-connected.tsx` | 提供商连接状态 hook |
| `todo-item.tsx` | 待办清单项渲染 |
| `bg-pulse.tsx` | 背景脉冲动画 |

### 3.8 事件系统

#### TUI 事件 (`event.ts`)

使用 Effect 的 `Schema` 进行验证的类型化总线事件：

| 事件 | 说明 |
|------|------|
| `tui.prompt.append` | 向活动提示追加文本 |
| `tui.command.execute` | 按名称执行任意命令 |
| `tui.toast.show` | 显示 Toast 通知 |
| `tui.session.select` | 导航到会话 |

#### SDK 事件 (`context/event.ts`)

包装 SDK 的全局事件流，按项目范围过滤。`sync.tsx` 中处理的主要事件类型：

| 事件类型 | 说明 |
|---------|------|
| `session.updated/deleted/status/next.*` | 会话生命周期 |
| `message.updated/removed/part.updated/part.delta/part.removed` | 消息更新 |
| `permission.asked/replied` | 权限请求 |
| `question.asked/replied/rejected` | 问题生命周期 |
| `todo.updated` | 待办更新 |
| `session.diff` | 文件变更 |
| `lsp.updated` | LSP 状态 |
| `vcs.branch.updated` | Git 分支变更 |
| `installation.update-available` | 自动升级提示 |

SDK 事件经过批处理（16ms 合并窗口）并通过 `solid-js` `batch()` 分派以实现单次渲染更新。

### 3.9 提示输入系统

**路径**: `component/prompt/`（1800+ 行复杂系统）

| 子组件 | 用途 |
|--------|------|
| `index.tsx` | 主提示组件：文本区域、文件附件、模式切换、草稿保留、从参数自动提交 |
| `autocomplete.tsx` | `/` 斜杠命令自动补全、`@` 文件/上下文提及、frecency 排序 |
| `history.tsx` | 提示历史（JSONL 文件，最近 50 条）、上下导航 |
| `stash.tsx` | 暂存提示存储（内存 + 文件支持） |
| `frecency.tsx` | 基于 frecency 的模型、agents 等排序 |
| `traits.ts` | 提示特征计算（文本、文件、Shell 模式） |
| `part.ts` | 文件部件分配工具 |

**关键提示功能**：
- **模式切换**: `normal` ↔ `shell`（通过 `$` 前缀检测）
- **部件管理**: 文件附件、agent 提及、文本部件
- **草稿保留**: 超过 20 字符的提示在退出时保存
- **成本估算**: 输入期间显示 Token 估算
- **历史**: JSONL 支持，最多 50 条，自动修复损坏
- **暂存**: 临时保存（ctrl+e → 暂存，/stash 恢复）
- **自动补全**: Frecency 排序的 `/` 命令、`@` 文件上下文、`#` 文件

### 3.10 快捷键绑定系统

**文件**: `keymap.tsx`

基于 `@opentui/keymap`：

- **层级**: App 级、会话级、输入特定层级，按上下文组合
- **引导键**: 定时引导序列（如 `space g t` 表示"转到终端"）
- **命令面板**: 所有命令以 `namespace: "palette"` 注册
- **响应式**: `useBindings()` 用于上下文快捷键注入
- **别名**: `enter→return`, `esc→escape`

---

## 4. Desktop Electron 桌面应用

**路径**: `packages/desktop/`  
**技术栈**: Electron 41 + electron-vite + electron-builder + SolidJS  
**版本**: 1.14.48

### 4.1 三层进程架构

```
┌─────────────────────────────────────────────────────────────┐
│                    主进程 (Main Process)                     │
│  src/main/index.ts                                          │
│  ├── 应用生命周期、单实例锁定、深度链接                       │
│  ├── 侧边服务器进程管理 (utilityProcess.fork)               │
│  ├── IPC 处理程序 (main/ipc.ts — 36 invoke + 4 on)         │
│  ├── 窗口管理 (main/windows.ts)                             │
│  ├── 原生 macOS 菜单 (main/menu.ts)                         │
│  ├── 自动更新器 (main/updater.ts)                           │
│  └── Tauri → Electron 存储迁移 (main/migrate.ts)            │
├─────────────────────────────────────────────────────────────┤
│                    侧边服务器进程 (Sidecar)                  │
│  main/sidecar.ts                                            │
│  ├── 导入 virtual:opencode-server (从 packages/opencode/ 编译)│
│  ├── SQLite JSON 迁移 (drizzle-orm)                         │
│  ├── HTTP 服务器 (127.0.0.1:随机端口)                       │
│  └── IPC 消息: {start} → {ready|error|sqlite}               │
├─────────────────────────────────────────────────────────────┤
│                    渲染器进程 (Renderer)                     │
│  SolidJS                                                    │
│  ├── i18n (15 种语言)                                       │
│  ├── 启动/加载画面 (迁移进度)                               │
│  ├── Platform 对象 → 包装 window.api.* (contextBridge)      │
│  ├── 自定义 webview 缩放 (Cmd/Ctrl +/-/0)                   │
│  └── 渲染: AppBaseProviders → AppInterface with MemoryRouter │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 主进程层

#### `main/index.ts` — 应用入口点 (371 行)

初始化生命周期流程：
1. 设置上下文菜单、工作目录（`~`）、环回代理绕过
2. 可选创建引导测试根目录（基于 tmpdir 的临时环境）
3. 配置应用身份（`app.setName`, `app.setAppUserModelId`, `app.setPath("userData", ...)`）
4. 调用 `initLogging()`，加载系统 CA 证书
5. 强制单实例锁定
6. 监听 `second-instance`（新实例的深度链接）和 `open-url`（macOS 深度链接）
7. 通过 `registerIpcHandlers()` 注册所有 IPC 处理程序
8. `app.whenReady()` 后：运行 `migrate()`，注册 `oc://` 协议，设置 Dock 图标，设置自动更新器
9. 打开临时端口（`0` = 操作系统分配），生成 UUID 密码
10. 调用 `spawnLocalServer()` 分叉侧边服务器，等待健康检查
11. 如需 DB 迁移且加载超过 1 秒：显示 `createLoadingWindow()`
12. 侧边服务器健康后：创建 `createMainWindow()` 和 `createMenu()`

**关键设计决策**：
- **渲染器中无 Node.js** — 沙盒化渲染器，`contextIsolation: true`，仅 `window.api`（通过 preload 暴露）桥接主进程
- **侧边架构** — OpenCode 服务器作为 Electron `utilityProcess.fork()` 生成的 OS 级子进程运行，不在主进程或渲染器中
- **Tauri → Electron 迁移** — 完整的 Tauri `.dat` → `electron-store` 迁移路径

#### `main/server.ts` — 侧边服务器管理 (258 行)

| 函数 | 用途 |
|------|------|
| `spawnLocalServer(hostname, port, password, configureEnv, options)` | 分叉 `sidecar.js`，发送含连接参数的 `start` 消息，等待 `ready` 或 `error` 回复，然后 HTTP 健康轮询。返回 `{ listener: { stop }, health: { wait } }` |
| `checkHealth(url, password)` | `GET /global/health` 配合 Basic 认证 |
| `getDefaultServerUrl()` / `setDefaultServerUrl(url)` | 从 `electron-store` 读取/写入 `defaultServerUrl` |
| `getWslConfig()` / `setWslConfig(config)` | 从 `electron-store` 读取/写入 WSL 配置 |
| `preferAppEnv(userDataPath)` | 加载 shell 环境（通过 `shell-env.ts`）到 `process.env`，设置 OpenCode 标志 |

**协议**: 侧边通信通过 `child.postMessage()` / `child.on("message")` 进行，使用类型化消息（`start`, `stop`, `ready`, `sqlite`, `error`, `stopped`）。

#### `main/sidecar.ts` — 侧边进程入口 (178 行)

在 `utilityProcess` 内部运行：
1. 在 `process.parentPort` 上监听 `start` / `stop` 命令
2. `start` 时：准备环境、加载系统 CA、设置代理、动态导入 `virtual:opencode-server`
3. 如需迁移则运行 `JsonMigration`，向父进程报告进度
4. 调用 `Server.listen(...)`，含主机名、端口、认证、CORS
5. `stop` 时：调用 `listener.stop()`，发送 `stopped`，退出
6. 错误时：发送 `error` 消息，退出

#### `main/windows.ts` — 窗口管理 (244 行)

| 函数 | 用途 |
|------|------|
| `createMainWindow()` | 主 BrowserWindow：默认 1280×800，macOS 隐藏标题栏带交通灯按钮，Win32 无边框带 `titleBarOverlay`，沙盒化含 preload。通过 `electron-window-state` 管理窗口状态。应用 CORS 头部。加载 `index.html` |
| `createLoadingWindow()` | 加载启动画面：640×480 不可调整大小，居中。加载 `loading.html` |
| `registerRendererProtocol()` | 注册特权 `oc://renderer/` 协议，从 `out/renderer/` 提供静态文件。防止路径遍历 |
| `setTitlebar(win, theme)` / `updateTitlebar(win)` | Win32 自定义标题栏覆盖层，支持暗/亮模式和缩放感知 |
| `setDockIcon()` | macOS 自定义 Dock 图标 |
| `setBackgroundColor(color)` / `getBackgroundColor()` | 读取/写入背景色（从渲染器主题同步） |

**UI 细节**：
- `titlebarHeight = 40px`，Windows 通过 `setTitleBarOverlay` 自定义覆盖层
- `oc://` 特权协议（安全、标准、支持 Fetch API）
- 仅允许来自受信任渲染器 URL 的剪贴板写入
- 从 webview 的缩放变更立即重置为 1（缩放通过 IPC 外部处理）

#### `main/menu.ts` — macOS 菜单系统 (141 行)

仅 macOS 原生应用菜单（Win/Linux 无操作）：

| 菜单 | 项目 |
|------|------|
| **OpenCode** | About、Check for Updates、Settings (`Cmd+,`)、Reload Webview、Restart、Hide/Quit |
| **File** | New Session (`Shift+Cmd+S`)、Open Project (`Cmd+O`)、New Window (`Cmd+Shift+N`)、Close |
| **Edit** | Undo/Redo、Cut/Copy/Paste/SelectAll |
| **View** | Toggle Sidebar (`Cmd+B`)、Toggle Terminal (Ctrl+\`\`)、Toggle File Tree、Reload、DevTools、Zoom、Fullscreen |
| **Go** | Back/Forward (`Cmd+[` / `Cmd+]`)、Prev/Next Session (Option+Up/Down)、Prev/Next Project (`Cmd+Option+Up/Down`) |
| **Window** | 标准窗口菜单 |
| **Help** | OpenCode Docs、Support Forum、Share Feedback、Report Bug |

**UI**: `trigger(id)` → `menu-command` IPC → 渲染器 `useCommand().trigger(id)`

#### `main/updater.ts` — 自动更新 (123 行)

通过 `electron-updater` 检查、下载和安装更新：

| 函数 | 用途 |
|------|------|
| `setupAutoUpdater()` | 配置 `autoUpdater`（channel `latest`，无预发布，手动下载/安装） |
| `checkUpdate()` | 获取更新元数据，下载更新，返回 `{ updateAvailable, version }`。缓存下载 |
| `checkForUpdates(alertOnFail, killSidecar)` | UI 包装器：结果显示原生对话框（错误 / 最新 / 重启提示） |
| `installUpdate(killSidecar)` | 终止侧边服务器，调用 `autoUpdater.quitAndInstall()` |

**注意**: 开发构建中更新器**禁用**（`UPDATER_ENABLED = app.isPackaged && CHANNEL !== "dev"`）。

#### `main/migrate.ts` — Tauri → Electron 迁移 (91 行)

一次性迁移 Tauri `.dat` 文件到 `electron-store`：
1. 检查设置存储中的 `tauriMigrated` 标志
2. 从 Tauri 数据目录读取所有 `.dat` 文件
3. 对每个 `.dat` 文件：解析 JSON，复制目标 `electron-store` 中不存在的键
4. `opencode.settings.dat` → 存储名 `"opencode.settings"`；其他保留完整文件名

### 4.3 预加载层

#### `preload/index.ts` — 上下文桥接 (71 行)

通过 `contextBridge.exposeInMainWorld("api", ...)` 向沙盒化渲染器暴露 `window.api`。

**关键模式**：
- `awaitInitialization(onStep)` — 注册 `init-step` 事件单向监听器，返回 `ServerReadyData` promise
- `onSqliteMigrationProgress` / `onMenuCommand` / `onDeepLink` — 返回清理函数的事件订阅
- `loadingWindowComplete()` — 使用 `ipcRenderer.send()`（即发即弃）

#### `preload/types.ts` — 类型定义 (79 行)

| 类型 | 用途 |
|------|------|
| `InitStep` | `{ phase: "server_waiting" }` / `{ phase: "sqlite_waiting" }` / `{ phase: "done" }` |
| `ServerReadyData` | 服务器连接的 `{ url, username, password }` |
| `SqliteMigrationProgress` | `{ type: "InProgress"; value: number }` / `{ type: "Done" }` |
| `WslConfig` | `{ enabled: boolean }` |
| `TitlebarTheme` | `{ mode: "light" | "dark" }` |
| `WindowConfig` | `{ updaterEnabled: boolean }` |
| `ElectronAPI` | `window.api` 的完整 40+ 方法接口 |

### 4.4 渲染器层

#### `renderer/index.tsx` — 渲染器入口 (381 行)

**平台适配器 (`createPlatform()`)**：
- 从 `navigator.userAgent` 检测操作系统
- 提供 `openDirectoryPickerDialog`, `openFilePickerDialog`, `saveFilePickerDialog` — 均含 WSL 路径转换
- 提供 `openLink`, `openPath`（含 WSL 感知 Windows 路径解析）
- `storage(name?)` → 创建 `AsyncStorage` 外观，基于 `window.api.store*` IPC
- `checkUpdate` / `updateAndRestart` / `restart` — 更新生命周期
- `notify(title, description, href)` — Web `Notification`，可选 focus-then-navigate
- `fetch` — 透传（Electron 中无需覆盖）
- `getWslEnabled` / `setWslEnabled` / `getDefaultServer` / `setDefaultServer` / `getDisplayBackend` / `setDisplayBackend`
- `parseMarkdown` → 委托给主进程
- `webviewZoom` — 来自 `webview-zoom.ts` 的响应式缩放信号
- `checkAppExists`, `readClipboardImage`

**渲染流程**：
1. 创建平台适配器
2. 获取：`windowConfig`, `windowCount`, `sidecar`（服务器连接）, `defaultServer`, `locale`
3. 等待所有资源加载完成（`Show when !loading`）
4. 渲染 `<PlatformProvider>` → `<AppBaseProviders>` → `<AppInterface>` 含 `MemoryRouter`、sidecar/附加服务器和默认服务器
5. `<Inner>` 组件：连接菜单命令，从主题 CSS 变量同步背景色
6. 在模块级别监听深度链接和菜单命令

**UI**: 主题感知背景色同步（`--background-base` CSS 变量 → `setBackgroundColor` IPC）

#### `renderer/loading.tsx` — 加载启动画面 (83 行)

SQLite 迁移期间的迁移进度启动画面：
- 显示 OpenCode Logo（`Splash` 组件）
- 分阶段状态消息："Just a moment..." → "Migrating your database"（3 秒后） → "This may take a couple of minutes"（9 秒后）
- 与 `SqliteMigrationProgress` IPC 事件同步的 `Progress` 条
- `phase === "done"` 后 1 秒调用 `window.api.loadingWindowComplete()`

#### `renderer/webview-zoom.ts` — 缩放处理器 (55 行)

键盘驱动缩放（`Cmd/Ctrl` + `-`/`=`/`0`）：
- 在 `window` 级别监听键盘事件
- 范围：`0.2` – `10`，步进 `0.2`
- 调用 `window.api.setZoomFactor(next)`（更新 Electron 缩放）
- 导出 `webviewZoom` 响应式信号，UI 可响应缩放变更
- 正确处理并发缩放请求（仅当仍为最新请求值时设置信号）

### 4.5 IPC 通信机制

**文件**: `main/ipc.ts` — IPC 处理程序注册 (213 行, 36 个 `ipcMain.handle` + 4 个 `ipcMain.on`)

#### IPC 通道（invoke/handle）

| 通道 | 用途 |
|------|------|
| `kill-sidecar` | 停止服务器进程 |
| `await-initialization` | 等待服务器就绪，流式返回 `init-step` 事件 |
| `get-window-config` | 返回 `{ updaterEnabled }` |
| `consume-initial-deep-links` | 返回窗口就绪前挂起的深度链接 |
| `get/set-default-server-url` | 默认外部服务器 URL 持久化 |
| `get/set-wsl-config` | WSL 开关持久化 |
| `get/set-display-backend` | Linux 显示后端（Wayland/WL） |
| `parse-markdown` | 服务器端 markdown → HTML（通过 `marked`）。注意：preload 中对应方法为 `parseMarkdownCommand` |
| `check-app-exists` | macOS 应用包存在性检查 |
| `wsl-path` | Windows → WSL 路径转换 |
| `resolve-app-path` | Windows `where` → `.exe` 解析 |
| `run-updater` / `check-update` / `install-update` | 更新编排 |
| `set-background-color` | 将渲染器主题背景传递给主进程 |
| `store-get/set/delete/clear/keys/length` | 通用命名 `electron-store` 访问 |
| `open-directory-picker` / `open-file-picker` / `save-file-picker` | 原生 OS 文件对话框 |
| `open-path` | `shell.openPath` 或 `open -a <app> <path>` |
| `read-clipboard-image` | 剪贴板 PNG 读取 |
| `get-window-count` / `get/set-window-focus` / `show-window` | 窗口状态查询。注意：通道为 `set-window-focus`（非 `set-window-focused`） |
| `get/set-zoom-factor` | WebContents 缩放 |
| `set-titlebar` | Win32 覆盖层主题 |

#### 仅发送通道（渲染器 → 主进程，fire-and-forget）

| 通道 | 用途 |
|------|------|
| `loading-window-complete` | 加载窗口完成信号 |
| `open-link` | `shell.openExternal` |
| `show-notification` | 原生 `Notification` |
| `relaunch` | `app.relaunch(); app.exit(0)` |

#### 仅发送通道（主进程 → 渲染器）

| 通道 | 说明 |
|------|------|
| `init-step` | 初始化步骤更新（`await-initialization` 内部使用 `event.sender.send` 发送） |
| `sqlite-migration-progress` | 迁移百分比更新 |
| `menu-command` | 菜单操作 ID |
| `deep-link` | `opencode://` URL |

#### 孤儿/未实现 API

| 通道/方法 | 说明 |
|-----------|------|
| `install-cli` | Preload 中暴露为 `window.api.installCli()`，但主进程 (`main/ipc.ts`) **无对应处理程序**。此方法在 renderer 中可通过 `window.api.installCli()` 调用，但实际无响应。 |

### 4.6 侧边服务器管理

**侧边进程协议**（主进程与侧边进程之间的 IPC）：

```
Parent → Child: {type: "start", hostname, port, password, userDataPath, needsMigration}
Child → Parent: {type: "sqlite", progress: {type: "InProgress", value: 50}}
Child → Parent: {type: "ready"}
Parent → Child: {type: "stop"}
```

**ElectronAPI** (`window.api.*` 通过 contextBridge）：

| 类别 | 方法 |
|------|------|
| **生命周期** | `awaitInitialization`, `killSidecar`, `relaunch`, `loadingWindowComplete` |
| **存储** | `storeGet/Set/Delete/Clear/Keys/Length` |
| **文件对话框** | `openDirectoryPicker`, `openFilePicker`, `saveFilePicker` |
| **应用** | `checkAppExists`, `resolveAppPath` |
| **WSL** | `getWslConfig`, `setWslConfig`, `wslPath` |
| **链接** | `openLink`, `openPath` |
| **剪贴板** | `readClipboardImage` |
| **更新** | `checkUpdate`, `installUpdate`, `runUpdater` |
| **深度链接** | `consumeInitialDeepLinks`, `onDeepLink` |
| **Markdown** | `parseMarkdownCommand` |
| **窗口** | `getWindowCount`, `getWindowFocused`, `setWindowFocus`, `showWindow` |
| **CLI** | `installCli`（孤儿通道，主进程无处理程序） |

### 4.7 原生 API 封装

#### `main/apps.ts` — 外部应用解析 (155 行)

| 函数 | 用途 |
|------|------|
| `checkAppExists(appName)` | macOS：检查 `/Applications/`、`~/Applications/` 和 `$PATH`。Win/Linux：始终返回 true |
| `resolveAppPath(appName)` | Windows：`where` → 通过 `%~dp0` 或模糊目录搜索从 `.cmd`/`.bat` 包装器解析 `.exe`。非 Windows：原样返回 `appName` |
| `wslPath(path, mode)` | 调用 `wsl -e wslpath` 在 Windows ↔ WSL 路径间转换 |

**UI**: 支持从渲染器"在外部应用中打开"。

#### `main/shell-env.ts` — Shell 环境加载 (90 行)

| 函数 | 用途 |
|------|------|
| `loadShellEnv(shell)` | 尝试 `shell -il -c "env -0"`，然后 `shell -l -c "env -0"`，返回环境字典或 `null`。跳过 nushell |
| `parseShellEnv(out)` | 解析以 null 分隔的 `KEY=VALUE\0` 输出 |
| `mergeShellEnv(shell, env)` | 将 shell 环境与覆盖环境合并 |

**UI**: 确保生成的 OpenCode 服务器继承用户的终端 PATH 和配置。

---

## 5. Web 前端

**路径**: `packages/web/`  
**技术栈**: Astro 5 SSR (Cloudflare adapter) + SolidJS 交互岛

### 5.1 架构概述

| 方面 | 详情 |
|------|------|
| **框架** | Astro 5 SSR + SolidJS 交互岛 |
| **构建工具** | Astro (底层 Vite) |
| **CSS 方案** | Starlight 主题 + 自定义 CSS 模块 (`.module.css`) |
| **状态管理** | SolidJS `createStore` + `createMemo`（每个组件本地） |

### 5.2 路由

| 路由 | 文件 | 类型 | 用途 |
|------|------|------|------|
| `/` | `components/Lander.astro` | SSR | 落地页（英雄区、安装命令、功能、截图） |
| `/docs/**` | Starlight 自动路由 | SSR | 19 种语言的 500+ MDX 文档页面 |
| `/docs/<slug>` | `pages/[...slug].md.ts` | API | 原始文档正文作为 `text/plain` |
| `/s/[id]` | `pages/s/[id].astro` | SSR + SolidJS 岛 | **共享会话查看器** |

### 5.3 共享会话查看器 (`Share.tsx`)

```
Share (SolidJS 岛, client:only)
├── WebSocket → wss://<api>/share_poll?id=<id>
│   ├── session/info → setStore("info")
│   ├── session/message/<id> → setStore("messages", id, ...)
│   └── session/part → setStore("messages", messageID, "parts", ...)
│
├── Session Header (标题、版本、模型、时间)
├── Messages List (SolidJS For + SuspenseList revealOrder="forwards")
│   └── Part.tsx (按 type/role 路由)
│       ├── role=user, type=text → ContentText
│       ├── role=user, type=file → File badge
│       ├── role=assistant, type=text → ContentMarkdown
│       ├── role=assistant, type=reasoning → Collapsible reasoning
│       ├── type=tool, status=error → ContentError
│       └── type=tool, status=completed →
│           ├── BashTool → ContentBash (终端风格)
│           ├── GrepTool → ResultsButton + ContentText
│           ├── WriteTool → ContentCode + LSP 诊断
│           ├── EditTool → ContentDiff + 诊断
│           ├── ReadTool → ContentCode
│           ├── TodoWriteTool → Checklist
│           ├── TaskTool → ContentMarkdown
│           └── FallbackTool → args 表格 + ContentText
├── Status Summary (成本、Token、连接状态)
└── Debug Panel (?debug=true — 原始 JSON 转储)
```

**通信**: 简单 WebSocket (`share_poll` 端点)。JSON 消息格式 `{key, content}`。2 秒延迟自动重连。V1→V2 消息迁移。

**Web 包文件统计** (排除 content/docs 目录)：
- `.tsx`: 12
- `.ts`: 6
- `.astro`: 7

**文档 locale 文件**: 19 种语言

### 5.4 文档站点

19 种语言的 500+ MDX 文档页面，使用 Starlight 主题系统。主要交互为静态内容浏览 + 搜索。

---

## 6. App 应用层

**路径**: `packages/app/`  
**技术栈**: SolidJS + SolidJS Router + TanStack Query

### 6.1 路由结构

| 路由 | 组件 | 说明 |
|------|------|------|
| `/` | `Home` | 最近项目列表、服务器选择（懒加载） |
| `/:dir` | `DirectoryLayout` | 解码 base64 dir → SDK 客户端 → 同步 → 数据上下文 |
| `/:dir/session/:id?` | `Session` | 完整聊天 UI（虚拟滚动、编辑器、侧面板） |

### 6.2 会话页面组件层级

```
Session
├── SessionHeader
│   ├── 项目名称 + 工作区选择器
│   ├── 模型/agent 选择器
│   ├── 终端切换、审查面板切换
│   ├── 应用打开按钮（VS Code、Cursor）
│   └── 状态弹出框
├── MessageTimeline
│   ├── ScrollView (virtua 虚拟滚动)
│   ├── SessionTurn (来自 @opencode-ai/ui)
│   │   ├── UserMessage（含文件标签页）
│   │   └── AssistantMessage（文本 + 工具部件）
│   ├── History load more button
│   └── SessionContextUsage (Token 用量)
├── SessionComposerRegion
│   ├── Revert dock (回滚消息)
│   ├── Followup dock
│   ├── Permission dock / Question dock / Todo dock
│   └── PromptInput
│       ├── 模型选择器
│       ├── ContentEditable 编辑器
│       ├── @ / slash 弹出框
│       ├── 上下文项 + 图片附件
│       └── 提交按钮
├── SessionSidePanel (审查 diff / 文件树)
└── TerminalPanel
    └── Terminal (ghostty-web 模拟器)
```

### 6.3 19 个上下文提供者

App 层的 `context/` 目录包含 19 个主要上下文文件（排除辅助文件和子目录工具）：

| 文件/名称 | 角色 |
|-----------|------|
| `platform.tsx` | 平台抽象接口 |
| `server.tsx` | 服务器连接管理 |
| `global-sdk.tsx` | SSE 事件流（合并、批处理） |
| `global-sync.tsx` | 全局存储（路径、项目、配置、提供商） |
| `sdk.tsx` | 每个目录的 SDK 客户端包装器 |
| `sync.tsx` | 每个目录的会话同步 + 乐观更新 |
| `local.tsx` | 每个目录的模型/agent 选择 |
| `layout.tsx` | UI 布局状态（侧边栏、终端、标签页） |
| `settings.tsx` | 用户设置 |
| `models.tsx` | 模型目录 |
| `command.tsx` | 命令面板 |
| `prompt.tsx` | 提示输入状态 |
| `terminal.tsx` | 终端会话 |
| `file.tsx` | 文件浏览 |
| `comments.tsx` | 代码审查注释 |
| `notification.tsx` | 会话通知 |
| `highlights.tsx` | 代码高亮 |
| `language.tsx` | 语言/locale 管理 |
| `permission.tsx` | 权限管理 |

**注意**: `global-sync/` 子目录包含实现细节（bootstrap.ts, child-store.ts, event-reducer.ts 等），但不是独立的上下文提供者。`file/` 子目录包含文件相关工具，但 `file.tsx` 是主要上下文。

---

## 7. UI 共享组件库

**路径**: `packages/ui/src/components/`  
**技术栈**: SolidJS + Kobalte（无障碍原语）

### 7.1 设计系统

- **主题引擎**: 基于 Oklch。37 个内置主题（OC-2、Catppuccin、Nord、Dracula、GitHub 等）
- **Token 生成**: 种子颜色 → 算法化 12 步色阶 → 300+ CSS 自定义属性
- **Token 类别**: 背景、表面、文本、边框、图标、输入、按钮、语法高亮（18 个 Token）、markdown（16 个 Token）、diff、头像
- **CSS 层级**: `theme > base > components > utilities`
- **Tailwind**: v4 集成通过 `@theme` 指令（将 CSS 变量映射到 Tailwind 颜色）

### 7.2 63 个组件分类

UI 包 `packages/ui/src/components/` 目录包含 63 个 `.tsx` 组件文件（排除 `.stories.tsx` 测试文件）：

| 类别 | 组件 |
|------|------|
| **表单输入** (11) | `accordion`, `button`, `checkbox`, `collapsible`, `inline-input`, `radio-group`, `select`, `switch`, `tabs`, `text-field`, `sticky-accordion-header` |
| **悬停/弹出** (5) | `context-menu`, `dropdown-menu`, `hover-card`, `popover`, `tooltip` |
| **覆盖层/布局** (4) | `dialog`, `dock-surface`, `scroll-view`, `toast` |
| **数据展示** (13) | `animated-number`, `card`, `diff-changes`, `keybind`, `line-comment`, `line-comment-annotations`, `list`, `logo`, `markdown`, `progress`, `progress-circle`, `provider-icon`, `spinner` |
| **图标/媒体** (8) | `app-icon`, `avatar`, `favicon`, `file-icon`, `font`, `icon`, `icon-button`, `image-preview` |
| **AI/聊天** (12) | `basic-tool`, `dock-prompt`, `message-nav`, `message-part`, `session-retry`, `session-review`, `session-turn`, `tag`, `tool-count-label`, `tool-count-summary` (原名 Summary), `tool-error-card`, `tool-status-title` |
| **文件相关** (5) | `file`, `file-media`, `file-search`, `file-ssr`, `resize-handle` |
| **动画** (5) | `motion-spring`, `text-reveal`, `text-shimmer`, `text-strikethrough`, `typewriter` |

**注意**: 之前的报告错误列出了 `SessionDiff`（实际是 `.ts` 工具文件，非 UI 组件）和 `ShellSubmessageMotion`（不存在），遗漏了 `resize-handle`, `favicon`, `font`, `line-comment-annotations`, `file`, `file-media`, `file-ssr`, `file-search`。

### 7.3 国际化

17 种 locale，每种 80+ 个键（`ui.sessionReview.*`, `ui.tool.*`, `ui.message.*`, `ui.common.*`, `ui.list.*`）

### 7.4 上下文提供者（来自 `ui`）

- `ThemeProvider` — 主题管理、预览
- `DataProvider` — AI 会话数据存储
- `DialogProvider` — 程序化对话框
- `I18nProvider` — 含模板解析的 `t()` 函数
- `MarkedProvider` — markdown 解析器（marked + Shiki + KaTeX）
- `FileComponentProvider` — 可注入的文件渲染器
- `WorkerPoolProvider` — diff web workers

---

## 8. 交互模式总结

### 8.1 通信模式

1. **SolidJS Signals/Stores** — 核心响应式
2. **Context Providers** — 20+ 上下文用于依赖注入
3. **SDK Client** — 突变的直接 API 调用
4. **SSE Event Stream** — 来自服务器的实时推送（合并 + 批处理）
5. **RPC (thread → worker)** — 进程内通信
6. **Plugin API** — 通过 `TuiPluginApi` 的外部模块扩展
7. **Bus Events** — 类型化跨组件通信 (`TuiEvent`)
8. **Keymap Commands** — 通过快捷键的统一命令执行

### 8.2 用户输入模式

| 模式 | TUI | Desktop | Web |
|------|-----|---------|-----|
| 文本输入 | 文本区域 + 自动补全 | ContentEditable 编辑器 | 只读 |
| 文件附件 | `@` 提及 + 拖放 | 拖放 + 文件选择器 | 无 |
| 命令执行 | `/` 斜杠命令 | `/` 斜杠命令 | 无 |
| 快捷键 | 层级化 keymap | 全局 + 应用快捷键 | 无 |
| 鼠标交互 | 有限（终端） | 完整鼠标支持 | 完整鼠标支持 |
| 权限授予 | 模态对话框 | 模态对话框 | 无 |
| 问题回答 | 多标签页表单 | 多标签页表单 | 无 |

### 8.3 状态管理对比

| 层面 | TUI | Desktop | App |
|------|-----|---------|-----|
| 全局状态 | SyncProvider + SyncProviderV2 | GlobalSyncProvider | GlobalSyncProvider |
| 本地状态 | LocalProvider | LocalProvider | LocalProvider |
| 主题 | ThemeProvider (30+ 主题) | ThemeProvider (37 主题) | ThemeProvider |
| 路由 | RouteProvider (home/session/plugin) | MemoryRouter (Solid Router) | BrowserRouter / MemoryRouter |
| 插件 | TuiPluginRuntime | N/A | N/A |

**主题数量说明**: TUI 使用 `@opencode-ai/ui` 主题系统，但部分主题受终端能力限制（如图像渲染、真彩色支持），实际可用主题约为 30+。Desktop/App 可使用全部 37 个主题。

**Locale 数量说明**: 
- Desktop/TUI: 15 种（由 `renderer/i18n/` 和 `app/src/i18n/` 共同决定）
- UI 库: 17 种（`ui/src/i18n/`）
- Web 文档: 19 种（Starlight 配置）

---

## 9. 人机交互能力矩阵

### 9.1 交互能力总览

| 能力 | TUI | Desktop | Web |
|------|-----|---------|-----|
| **会话管理** | ✅ 完整（创建、删除、重命名、固定、分叉） | ✅ 完整 | ✅ 只读（共享） |
| **消息发送** | ✅ 文本 + 文件 + 斜杠命令 | ✅ 文本 + 文件 + 斜杠命令 | ❌ 无 |
| **消息渲染** | ✅ Markdown + 代码 + 工具 + 思考 | ✅ Markdown + 代码 + 工具 + 思考 | ✅ Markdown + 代码 + 工具 |
| **文件浏览** | ✅ 侧边栏文件列表 | ✅ 文件树面板 | ❌ 无 |
| **权限管理** | ✅ 模态对话框 | ✅ 模态对话框 | ❌ 无 |
| **问题回答** | ✅ 多标签页表单 | ✅ 多标签页表单 | ❌ 无 |
| **主题切换** | ✅ 30+ 内置主题 + 自定义 | ✅ 37 个主题 | ✅ Starlight 主题 |
| **快捷键** | ✅ 完整层级化系统 | ✅ 全局 + 应用 | ❌ 无 |
| **插件扩展** | ✅ 完整插件系统 | ❌ N/A | ❌ N/A |
| **通知** | ✅ Toast | ✅ 原生 + Web | ❌ 无 |
| **终端** | ✅ 集成 | ✅ ghostty-web | ❌ 无 |
| **IDE 集成** | ✅ WebSocket MCP | ✅ WebSocket MCP | ❌ 无 |
| **自动更新** | ❌ CLI 方式 | ✅ 自动更新器 | N/A |
| **多语言** | ✅ 15 种 | ✅ 15 种 | ✅ 19 种 |
| **剪贴板** | ✅ OSC 52 / pbcopy / xclip | ✅ 原生 + 图片 | ❌ 无 |
| **缩放** | ❌ 无 | ✅ Cmd/Ctrl +/- | ✅ 浏览器缩放 |
| **拖放** | ❌ 有限 | ✅ 完整 | ❌ 无 |

### 9.2 人机交互组件清单（完整）

#### TUI 专用交互组件 (40+)

- `Prompt` — 文本输入（含自动补全、历史、暂存）
- `DialogAlert/Confirm/Prompt/Select` — 模态对话框
- `DialogAgent/Model/Provider/Skill` — 选择对话框
- `DialogSessionList/Rename/DeleteFailed` — 会话管理
- `DialogMcp/Status/Tag/ThemeList/Variant` — 配置对话框
- `DialogWorkspaceCreate/FileChanges/Unavailable` — 工作区对话框
- `DialogConsoleOrg/RetryAction` — 组织/升级对话框
- `DialogMessage/Subagent/Timeline/ForkFromTimeline` — 消息/子代理/时间线
- `Toast` — 覆盖层通知
- `PermissionPrompt` — 权限请求
- `QuestionPrompt` — 问题表单
- `CommandPalette` — 命令面板
- `Logo` — 应用标识
- `Spinner` — 加载指示器
- `BgPulse` — 背景动画
- `WorkspaceLabel` — 工作区状态
- `ErrorComponent` — 错误显示
- `UserMessage/AssistantMessage` — 消息渲染
- `TextPart/ToolPart/ReasoningPart` — 消息部件
- `Sidebar` — 会话信息面板
- `Footer` — 状态栏
- `SubagentFooter` — 子代理导航
- `TodoItem` — 待办项

#### Desktop 专用交互组件 (10+)

- `LoadingWindow` — 迁移进度画面
- `MainWindow` — 主窗口
- `Menu` — macOS 应用菜单
- `TitleBarOverlay` — Win32 标题栏
- `SystemNotification` — 原生通知
- `FilePicker` — 文件对话框
- `ClipboardImageReader` — 剪贴板图片
- `AutoUpdater` — 更新对话框
- `DeepLinkHandler` — 深度链接
- `ZoomController` — 缩放控制

#### App 层共享交互组件 (30+)

- `Session` — 完整会话页面
- `SessionHeader` — 会话头部
- `MessageTimeline` — 消息时间线
- `SessionComposerRegion` — 编辑器区域
- `PromptInput` — 内容可编辑输入
- `SessionSidePanel` — 侧面板
- `TerminalPanel` — 终端面板
- `Home` — 首页
- `DirectoryLayout` — 目录布局

#### UI 库共享交互组件 (63)

完整列表见第 7.2 节。

---

## 10. 总结

OpenCode Desktop 作为前端，其人机交互能力覆盖**三个主要界面**：

1. **TUI（终端用户界面）**：面向命令行用户的完整交互环境，含 40+ 组件、完整插件系统、30+ 主题、层级化快捷键、模态对话框、文件附件、权限管理、问题回答等

2. **Desktop（Electron 桌面应用）**：面向 GUI 用户的完整桌面环境，含原生菜单、文件对话框、剪贴板、通知、自动更新、WSL 支持、窗口管理等，通过 `PlatformProvider` 抽象封装所有原生能力

3. **Web（文档/共享站点）**：面向浏览器用户的只读共享会话查看器和文档站点

**核心交互设计理念**：
- **平台抽象统一**：Desktop/App 通过 `PlatformProvider` 封装原生能力差异；TUI 使用独立的插件和上下文系统
- **状态单向流动**：SSE → GlobalSDK → GlobalSync → UI 组件
- **响应式优先**：SolidJS Signals 驱动所有 UI 更新
- **插件可扩展**：TUI 支持完整的插件系统扩展交互能力
- **无障碍支持**：基于 Kobalte 的无障碍原语
- **国际化完整**：15-19 种语言支持

**总计人机交互组件数**：**150+ 个专用交互组件**，覆盖从文本输入、文件操作、权限管理、主题切换、通知提示到终端模拟的完整人机交互场景。

---

## 附录：修订记录

| 日期 | 修订内容 | 原因 |
|------|---------|------|
| 2026-05-12 | UI 组件数 49 → 63 | Council 审查：实际为 63 个 .tsx 文件 |
| 2026-05-12 | App 上下文提供者 30+ → 19 | Council 审查：实际为 19 个主要上下文文件 |
| 2026-05-12 | IPC 通道分类修正 | Council 审查：4 个通道从 invoke/handle 移至 send-only |
| 2026-05-12 | 插件插槽修正 | Council 审查：移除 2 个不存在插槽，添加 2 个缺失插槽 |
| 2026-05-12 | Web 文件计数修正 | Council 审查：.tsx 13→12, .ts 7→6 |
| 2026-05-12 | 删除虚构组件 | Council 审查：移除 ShellSubmessageMotion，标记 SessionDiff 为工具文件 |
| 2026-05-12 | 添加缺失组件 | Council 审查：添加 8 个缺失 UI 组件和 3 个缺失 App 上下文 |
| 2026-05-12 | Section 7.2 分类数量修正 | Council v2 审查：修正 4 个分类计数不匹配 |
| 2026-05-12 | 移除重复组件 listing | Council v2 审查：dock-prompt、line-comment 去重 |
| 2026-05-12 | 添加缺失组件 | Council v2 审查：添加 tag、session-turn |
| 2026-05-12 | install-cli 移至孤儿 API 区 | Council v2 审查：从 invoke/handle 表移出 |
| 2026-05-12 | 头部项目路径扩展 | Council v2 审查：覆盖全部 5 个包 |
| 2026-05-12 | 添加缺失插槽 app/home_bottom | Oracle 审查：补全 plugin/src/tui.ts 中定义的插槽 |
| 2026-05-12 | 修正插槽定义来源 | Oracle 审查：插槽名定义在 plugin/src/tui.ts 而非 slots.tsx |
| 2026-05-12 | 添加 IPC init-step 通道 | Oracle 审查：补充遗漏的 send-only 通道 |
| 2026-05-12 | 修正 IPC 处理程序数量 | Oracle 审查：50+ → 36 invoke + 4 on |
| 2026-05-12 | 修正 PlatformProvider 描述 | Oracle 审查：TUI 不使用 PlatformProvider |
| 2026-05-12 | 主题/locale 数量澄清 | Council 审查：添加数量差异说明 |
