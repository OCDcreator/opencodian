# Goal 与 Agent 工作台实施验收

任务开始：2026-10-30。验收完成：2026-10-31（Asia/Shanghai）。
版本维持 2.1.4；Test Vault 构建为 `main.202610310007`。本轮未提交、推送或发布版本。

## 已实现

- 上下文圈环右侧的靶心支持一次性 Goal 发送、当前目标详情、原生编辑/替换、停止/恢复、清除及可用预算。普通消息属于补充指令。
- 右上角参考 OpenChamber、ZCode、DSH，重做为默认 320px 的紧凑分组状态面板，使用宿主字体、颜色和图标。提供展开、停靠、概览/任务/文件/工具及主工作区视图。
- 目标状态由后端或具名扩展持久化；插件观察状态，不启动另一套自动续跑器。失败、未知、无目标和待确认分别呈现。
- 计划/Todo、后台任务列表、原生输出与取消、会话变更及既有回退入口接入同一工作台。
- 工具包含真实 xterm PTY、插件所启动的进程列表、隔离 webview、网址/截图附加、当前上下文、命令/技能/MCP 资源目录、记忆和设置入口。
- Git 状态、diff、stage/unstage、显式提交、worktree 与审查草稿均由用户动作触发。仓库状态与会话文件变更保持独立。
- 主工作区视图复用会话和宿主 runtime；关闭视图不结束终端。异步截图完成时重新检查源会话，防止附到其它会话。

## 真实后端记录

| 后端 | 有界自动续跑 | 生命周期证据与差异 |
|---|---|---|
| OpenCode 2 | 两条独立助手回复，原生 complete | 运行中 pause/resume/clear 均读回 confirmed；计数采用原生轮次 |
| Claude Code | 两条独立助手回复，原生 complete | 停止保留 active Goal、执行变为 stopped；恢复沿用相同 Goal ID 并读到 running；clear 读回 null。没有发送虚构的 pause/resume 命令 |
| ZCode | 两条独立助手回复，原生 complete | pause/resume/clear 均有确认；遵循原生 hidden/model-only 字段过滤内部续跑及环境消息 |
| DeepSeek Harness | 两条独立助手回复，原生 complete | 运行中 pause/resume/clear 有确认；分别展示 durable 状态和 armed 开关 |
| Codex | 收到两条独立回复；原生最终为 blocked | 如实显示 blocked，不推断 complete；pause/resume/clear 均读回 confirmed |
| Pi 1.4 | 兼容扩展自动续跑两轮并 complete | 隔离环境验证 `@narumitw/pi-goal@0.54.13`，pause/resume/clear 通过；未修改用户全局扩展安装。实际环境未检测到兼容扩展时保持不可创建 |

Claude 当前 CLI 没有发出 SDK 类型声明中的 active_goal 消息时，从 SDK 会话存储中的结构化 goal_status 记录对账，不解析助手自然语言推断完成。

原生 Goal 的长度、预算和动作差异由 adapter 能力控制。当前协议不能无损携带 Goal 附件/引用的路径会在修改目标前拒绝，并保留草稿；不会静默丢弃输入。

## UI 与宿主操作

- 实际输入流程：预备 Goal → 发送 → 后端确认 → 草稿清空 → complete；Goal 用户消息在后端只记录助手输出时仍保留，后续同步不重复。
- 实际 Test Vault DOM 在 320/400/640/960px 容器宽度及浅/深主题下共 8 组检查通过：无越界、横向溢出或输入区遮挡。宽度由诊断临时设置并恢复，主题类也已恢复。
- reduced-motion、Esc 关闭及入口焦点恢复已检查。计划转目标与已完成目标再次预备/取消有回归覆盖。
- macOS 真实终端通过键盘输入执行标记和 stty，浮层重开、主工作区打开/关闭后保持同一 PID；验收创建的终端已停止。
- Windows 使用真实 ConPTY 子进程验证中文 UTF-8、91×29 resize、输入、命令结果和正常退出；没有把该探针当作 Windows Obsidian 完整 UI 验收。
- 浏览器实际打开本地只读页面，网址与真实 PNG 截图附加成功；测试附件已移除。
- Git 在独立临时仓库验证从子目录解析 root、diff、stage/unstage、提交与 worktree；未操作项目或 Test Vault 的 Git 提交。

本轮没有逐项实机覆盖 Pi 的所有 retry/compaction 组合，也没有覆盖 Windows Obsidian 完整的面板操作。所列测试结果仅对应实际执行的场景。

## 门禁与证据

`npm run verify` 全部通过：架构/owner/依赖/循环检查、模块文档、graphify、devlog 顺序、lint 0 errors / 0 warnings、typecheck、全量测试、生产构建与生成样式检查。

全量结果：1,028 个测试套件通过、2 个跳过；11,191 项测试通过、6 项跳过、0 失败。CodeGraph 已 sync 并完成 affected 检查；设计检测无剩余发现。保留仓库已有混合换行格式，`git -c core.whitespace=cr-at-eol diff --check` 通过。

macOS Test Vault 已顺序复制 main.js、manifest.json、styles.css 与 assets；前三项 SHA-256 一致，运行日志确认新 BUILD_ID。

本机原始记录位于 Local Markdown tracker 的 `.scratch/goal-agent-workbench-20261030/evidence/`：

- `verify-final.log`、`deploy-final.json`、`reload-final.json`：完整门禁与部署。
- `native-goals-second.json`、`codex-final.json`、`pi-extension.json`：多轮原生/扩展执行。
- `lifecycle-final.json`、`claude-resume-final.json`：运行中的停止、恢复和清除。
- `responsive-final.json`、`focus-final.json`、`ui-state-final.json`：布局、焦点及目标消息。
- `host-runtime.json`、`terminal-windows-final.json`、`terminal-ui-final.json`、`terminal-desktop-final.json`、`desktop-close-final.json`：宿主功能。
- `browser-attach-final.json`、`workbench-panel-final.png`：实际附加结果与最终面板截图。

这些本机验收记录包含会话 ID 和运行环境；自动化回归测试保留在仓库 tests 下。
