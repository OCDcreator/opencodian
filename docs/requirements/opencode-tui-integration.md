# OpenCodian 集成 OpenCode TUI 需求整理

## 1. 背景

当前 OpenCodian 已经作为 Obsidian 插件，基于 OpenCode 提供的 HTTP / SSE 能力实现聊天、会话、模型选择、权限确认和流式渲染。

现在希望进一步把“OpenCode 的 TUI 体验”带到 OpenCodian 里，让用户在 Obsidian 内也能获得更紧凑、更键盘驱动、更接近终端工作流的交互方式。

但这里需要先澄清一件事：

`要集成的目标不应简单表述为“把原生 TUI 原样嵌进 Obsidian”`。

更准确的目标应该是：

`在 OpenCodian 内提供尽可能接近 OpenCode TUI 的工作流与交互体验，并与 Obsidian 环境原生融合。`

这份文档用于给后续开发或另一个大模型直接做设计与实现。

## 2. 用户真实诉求

用户想要的通常不是“必须运行 Zig 渲染出来的那个终端界面本体”，而是下面这些体验能力：

1. 更紧凑的信息密度
2. 更强的键盘驱动交互
3. 更接近终端 TUI 的布局和状态反馈
4. 会话、消息、模型、权限等操作能快速切换
5. 仍然保留 Obsidian 内的主题、快捷键、剪贴板、笔记联动能力

因此本需求的核心不是“复刻上游实现技术栈”，而是“在插件里实现 TUI 级别的使用体验”。

## 3. 当前已验证事实

## 3.1 OpenCodian 当前已经是 OpenCode API 客户端

当前仓库中的 `OpenCodeService` 已明确承担 OpenCode Server 的 HTTP / SSE 通信职责：

- `src/core/opencode/OpenCodeService.ts`
  - 文件头部已说明其通过 HTTP API 与 OpenCode Server 交互
  - `sendMessage()` 通过 `/session/:id/prompt_async` 发起请求
  - 通过 `/event` 建立 SSE 事件流

这意味着当前 OpenCodian 的核心业务能力，本质上已经建立在 OpenCode 服务端 API 之上，而不是依赖 TUI 本体。

## 3.2 从架构上看，TUI 和 OpenCodian 是同级关系

更合理的系统关系应理解为：

```text
                ┌──────────────────┐
                │  opencode serve   │
                │  HTTP / SSE / WS  │
                └────────┬─────────┘
                         │
          ┌──────────────┼──────────────┐
          │              │              │
    ┌─────┴──────┐ ┌────┴─────┐ ┌──────┴───────┐
    │ TUI (终端)  │ │ Web App  │ │ OpenCodian   │
    │ Zig/Bun/PTY │ │ Browser  │ │ Obsidian     │
    └────────────┘ └──────────┘ └──────────────┘
```

也就是说：

1. TUI 不是 OpenCodian 的“内部模块”
2. TUI 与 OpenCodian 更像是两个并列前端
3. 它们消费的是同一个 OpenCode 服务能力

## 3.3 当前仓库没有现成的终端嵌入基础设施

在当前仓库里搜索 `xterm`、`node-pty`、`pty`、`terminal` 等关键词，没有发现可直接复用的终端嵌入依赖或实现。

因此如果要走“在 Obsidian 内嵌真实终端”的路线，至少还需要新增一整套终端仿真与 PTY 桥接基础设施，而不是在现有聊天 UI 上做小改。

## 3.4 原生 TUI 依赖真实 TTY，不能假设可直接嵌入 Electron 视图

基于已有技术判断和外部分析意见，可先把边界写清楚：

1. OpenCode 原生 TUI 依赖终端 / PTY 语义，不是普通 Web 组件
2. 它的渲染与运行时假设并不天然适配 Obsidian 的 Electron WebView 环境
3. 即使通过 `xterm.js + PTY` 做转发，也只能得到“终端中继”而不是“Obsidian 原生 UI”

因此：

`“把 OpenCode 原生 TUI 原封不动嵌入 OpenCodian”不应作为第一版正式需求。`

## 4. 核心结论

## 4.1 技术上不是完全不可做

如果只问“能不能在 Obsidian 里看到 TUI 画面”，答案是：

`理论上可以尝试。`

例如可以引入 `xterm.js`，再桥接本地 PTY 子进程，把 `opencode` 终端界面转发到插件视图中。

## 4.2 但“直接嵌入原生 TUI”不是推荐路径

原因主要有三类：

1. 技术复杂度高
   - 需要终端仿真、PTY 管理、窗口尺寸同步、输入转发、进程生命周期控制
2. 与 Obsidian 集成差
   - 快捷键、焦点管理、复制粘贴、主题、字体、滚动、命令面板联动都容易割裂
3. 产品收益不稳定
   - 最终得到的往往只是“Obsidian 里套了一个终端”，不是真正融合的插件体验

## 4.3 推荐把需求重写为“集成 TUI 体验”，而不是“嵌入 TUI 本体”

建议把目标能力拆成三个方向：

| 方案 | 定义 | 结论 |
| --- | --- | --- |
| A. 内嵌真实终端 | 用 `xterm.js + PTY` 运行 OpenCode 原生 TUI | 技术可探索，但不建议作为主线 |
| B. TUI 风格的 Obsidian 视图 | 模仿 TUI 的布局、键盘交互、信息密度，底层继续走 OpenCode API | 推荐主线 |
| C. 继续增强当前聊天 UI | 在现有 UI 上吸收 TUI 的优点，而不追求明显“终端感” | 可作为 B 的一部分持续推进 |

## 5. 推荐产品定位

建议将该需求正式命名为：

`OpenCode TUI 风格工作台`

而不是：

`在 OpenCodian 内嵌 OpenCode 原生 TUI`

推荐定位如下：

1. 以 Obsidian 原生视图为载体
2. 保留 OpenCodian 现有 API、存储、会话、多标签和上下文能力
3. 在 UI 与交互上吸收 TUI 的优势
4. 仅把“真实终端嵌入”作为实验性分支，不作为默认交付目标

## 6. 推荐实现范围

## 6.1 Phase 1：TUI 风格视图 MVP

目标：在不引入 PTY 终端桥接的前提下，让 OpenCodian 提供明显更像 TUI 的工作模式。

建议包含：

1. 新增一个可切换的聊天视图模式，例如 `standard` / `tui`
2. 更紧凑的双栏或三栏布局
   - 左侧会话列表
   - 中间消息流
   - 右侧上下文 / 状态 / 工具面板
3. 更强的键盘操作
   - 会话切换
   - 焦点跳转
   - 消息导航
   - 快速发送
   - 打开模型选择 / 权限面板
4. 更终端化的状态显示
   - 当前模型
   - token / context usage
   - 流状态
   - tool / permission / question 状态
5. 更紧凑的消息样式
   - 减少大块留白
   - 强化结构边界
   - 让 streaming 状态更可感知

这是当前最稳、最符合产品价值的主线。

## 6.2 Phase 2：补齐 TUI 交互能力

在 TUI 风格视图 MVP 稳定后，再继续补齐更像终端工作流的细节：

1. 命令式快捷入口
   - 会话动作面板
   - 模型切换面板
   - 权限处理面板
2. 键盘优先的消息列表和工具结果导航
3. 更清晰的“当前运行态”面板
   - 正在流式输出
   - 正在等待权限
   - 正在等待问题回答
   - 当前会话上下文占用
4. 更贴近 TUI 的视觉语言
   - 紧凑边框
   - 状态色
   - 更像面板系统的布局，而不是普通聊天气泡堆叠

## 6.3 Phase 3：实验性终端嵌入评估

只有在前两期稳定后，才适合把“真实终端嵌入”作为实验项评估。

该阶段目标不是承诺交付，而是回答两个问题：

1. `xterm.js + PTY` 在 Obsidian 插件环境中是否足够稳定
2. 真终端方案相比 TUI 风格原生视图，是否真的带来明显收益

如果进入这一阶段，建议明确打上：

`experimental`

并限定边界：

1. 只在本地托管 OpenCode 模式下支持
2. 不保证与 Obsidian 主题、快捷键、剪贴板完全融合
3. 不替代标准聊天视图

## 7. 第一版明确非目标

以下内容不应在第一版需求中承诺：

1. 把 OpenCode 原生 TUI 无改造地直接嵌进 Obsidian
2. 在远程服务模式下也稳定提供真实 PTY TUI
3. 完整复刻所有终端细节与操作手感
4. 为了 TUI 体验而绕开 OpenCodian 现有存储、设置、i18n、主题与会话体系
5. 让实验性终端视图成为默认主界面

## 8. 功能需求细化

## 8.1 视图与布局

1. 用户可在设置或视图命令中切换到 `TUI 风格模式`
2. 新模式仍然复用现有会话和消息数据，不新建平行存储
3. 支持在窄宽度下退化为单栏或双栏布局，避免移动面板崩坏

## 8.2 键盘交互

1. 常见动作应具备快捷键或统一命令入口
2. 焦点移动要可预测，不能与 Obsidian 现有快捷键严重冲突
3. 在输入框、消息区、侧栏之间切换时，要有清晰焦点高亮

## 8.3 状态可见性

1. 当前会话模型、provider、effort 要持续可见
2. streaming、tool call、permission、question 等运行态要可见
3. 如果上下文占用、后台状态或错误存在，应能快速定位

## 8.4 Obsidian 原生融合

1. 保留现有主题系统与样式变量接入
2. 保留剪贴板、文件链接、wikilink、图片嵌入等 Obsidian 联动
3. 保留本地持久化、会话恢复、多标签能力
4. 保留现有 i18n 文案体系

## 8.5 终端嵌入实验能力

如果未来进入实验性终端路线，需额外满足：

1. 终端实例生命周期由插件显式管理
2. 仅在本地模式下开放
3. 提供明确的失败回退路径，失败后仍能回到标准视图或 TUI 风格视图

## 9. 验收标准

## 9.1 TUI 风格视图 MVP

1. 用户可以在 OpenCodian 中打开一种新的 `TUI 风格` 视图模式
2. 新模式仍能正常发送消息、接收流式响应、切换会话、选择模型
3. 新模式明显比当前默认聊天视图更紧凑、更适合键盘操作
4. 不破坏已有会话恢复、本地持久化、多标签和上下文联动

## 9.2 Obsidian 融合度

1. 主题切换后，新视图能正常适配
2. 剪贴板、文件链接、Markdown 渲染等基础能力不退化
3. 快捷键冲突可控，不会明显破坏 Obsidian 常规工作流

## 9.3 实验性终端嵌入

只有在进入实验阶段后，才需要满足以下验收：

1. 用户可显式开启或关闭实验性终端视图
2. 终端启动失败不会影响标准聊天功能
3. 终端视图仅作为附加能力，不替代主线实现

## 10. 对实现的附加建议

如果后续直接开始做实现，建议优先检查这些文件：

- `src/features/chat/OpenCodianView.ts`
- `src/features/chat/services/ContextUsageService.ts`
- `src/features/chat/userMessageDisplay.ts`
- `src/features/chat/userMessageActions.ts`
- `src/core/opencode/OpenCodeService.ts`
- `src/core/types/settings.ts`
- `src/features/settings/OpenCodianSettings.ts`
- `styles.css`
- `docs/architecture/README.md`
- `docs/modules/features/chat/OpenCodianView.md`

推荐优先顺序：

1. 先定义 `TUI 风格视图` 的产品边界
2. 再落紧凑布局、状态栏和键盘交互
3. 然后补齐设置项、主题适配和文档
4. 最后再决定是否需要实验性 `xterm.js + PTY` 路线

## 11. 需求结论

如果把需求表述成“在 OpenCodian 里直接跑 OpenCode 原生 TUI”，这件事虽然不是绝对不可能，但不是当前最合理的产品路线。

更合适的结论是：

1. `原生 TUI 直接嵌入` 可以作为实验性研究方向
2. `TUI 风格的 Obsidian 原生视图` 应作为正式主线需求
3. `继续增强现有 OpenCodian UI 并吸收 TUI 优点` 是最稳妥、最符合现有架构的落地方向

因此，建议后续立项、设计和开发时，统一使用下面这句作为需求定义：

`在 OpenCodian 中实现 OpenCode TUI 风格工作台，而不是简单嵌入 OpenCode 原生 TUI。`
