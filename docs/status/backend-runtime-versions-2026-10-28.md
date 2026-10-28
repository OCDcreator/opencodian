# 后端版本与配置核对（2026-10-28）

以 2026-10-28 的官方 npm registry `latest` 和官方发布页为版本来源。DSH 按用户选择使用 `next` 的候选版，不切换到 alpha。SDK 锁定版本与用户安装的运行时分别记录。

| 后端 | 插件依赖 | 本机运行时目标 |
| --- | --- | --- |
| OpenCode 2 | `@opencode/client` 2.0.18 → 2.2.0 | CLI 2.2.0 |
| Claude Code | `@anthropic-ai/claude-agent-sdk` 0.3.283 → 0.3.312 | CLI 2.1.296 → 2.1.312 |
| Codex | `@openai/codex-sdk` 0.158.0 → 0.165.0 | CLI 0.164.0 → 0.165.0 |
| Pi | 不随插件分发官方 SDK | 已安装官方包 1.4.0，保持该版本 |
| ZCode | 不随插件分发官方运行时 | 已安装桌面 3.16.3、内核 0.17.0，切回官方安装发现 |
| DeepSeek Harness | 插件自有扩展；官方包由安装的载体提供 | 桌面载体 rc.3 → npm CLI 0.2.1-rc.4 |

休眠 OpenCode 1 的 `@opencode-ai/sdk` 同步到 1.19.5；不恢复它的可选入口。版本管理仍使用插件当前版本，未因更新 SDK 自动发布新插件版本。

## 配置修复

- Pi 插件路径原为另一台机器的 Windows `pi.cmd`，现使用自动发现。通过 Pi 独立配置通道的 revision 检查，原生默认模型从已移出目录的 `opencode-go/deepseek-v4-flash` 修正为 `opencode-go/deepseek-v4.1-flash`；原始文件由配置通道备份，其他字段保留。
- ZCode 取消历史开发 checkout 的可执行文件覆盖，使用安装的官方桌面运行时。插件默认模型显式设为当前 provider 允许的 `opencode-go/deepseek-v4.1-flash`，覆盖原生空默认继承到的受限模型。没有更改 provider 的地址或凭据。
- OpenCode 2 取消临时 npm 缓存目录中的可执行文件覆盖，使用已安装的 CLI。
- npm DSH CLI 的启动使用 PATH 上的外部 Node；桌面载体继续使用原始 Electron。原 `process.execPath` 在 Obsidian 内会指向宿主应用，真实探针观察到启动文本混入 JSON-RPC，回归测试覆盖 CLI 和桌面两种载体。

## 验证边界

macOS Test Vault 构建 `main.202610281948` 已通过完整 `npm run verify`：10,853 项测试通过、5 项既有跳过，lint、类型、文档、代码图、生产构建与生成 CSS 检查全部通过。部署后文件哈希一致，重载回读确认 Pi/ZCode 路径设置、ZCode 默认模型、活动后端和会话摘要保持一致。

同一最终构建上，六个后端均使用保存后的正常配置通过原生辅助会话的提取、召回、去重和遗忘；反思调用全部成功，Pi 产生新主题，其余后端返回无新增记忆。每个辅助会话均释放，探针的设置、活动后端和会话摘要前后一致。记忆文件系统隔离在本次工作区证据目录，未替换原生适配器或添加临时模型覆盖。

接口测试、原生辅助会话和聊天输入框 UI 路径分别判断；本页不宣称 Windows 或所有历史版本/权限 profile 的完整矩阵验收。

## 上游来源

- [Claude Agent SDK 0.3.312](https://github.com/anthropics/claude-agent-sdk-typescript/releases/tag/v0.3.312)
- [Codex 0.165.0](https://github.com/openai/codex/releases/tag/rust-v0.165.0)
- [OpenCode 2.2.0](https://github.com/anomalyco/opencode/releases/tag/v2.2.0)
- [Pi 1.4.0](https://github.com/earendil-works/pi/releases/tag/v1.4.0)
- [ZCode 官方发布页](https://zcode.z.ai/_next/changelog)
- [DSH 0.2.1-rc.4](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-rc.4)
