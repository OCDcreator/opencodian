# Pi 独立 SDK 服务

> 基线：官方 @mariozechner/pi-coding-agent 0.73.1，服务协议 1。

## 架构

每个 Pi 会话使用独立本地 Node 进程，通过 stdin/stdout JSONL 提供 SDK 服务。进程在回合间常驻；停止、故障和卸载按会话隔离。插件不打包 SDK，官方安装可独立升级。

PiAdapter 负责共享能力入口；PiSessionRuntime 负责进程池/握手/UI生命周期；PiRpcClient 负责传输和外部 Node；PiSessionStore 负责句柄；PiStreamMapper 负责事件、历史和费用。assets/pi/service.mjs 构造 SDK；commands.mjs 分派白名单业务；extension-ui.mjs 双向桥接 UI。PiWorkbenchActions/Modal 提供分组管理，PiExtensionUiHost 渲染 Obsidian 交互。

完整 prompt 必须等待 SDK 请求、异步 agent_end 钩子、自动重试、压缩及 idle 完成；不能以单个 agent_end 结束。取消准备阶段不能继续发消息；退出迭代后无响应的进程在有限时间内被关闭。

## 能力与隔离

29 官方 RPC 和23额外 SDK 业务操作全有入口，9种标准扩展UI有双向交互。树导航、原生分叉、导入导出、模型/思考、队列、工具/资源、账号/包管理见验收矩阵。原生命令/模板/skills 由 SDK 发现并展开，聊天使用 Pi 专属命令目录。

运行时 setters 通过内存 SettingsStorage 设置会话模型、思考、重试，不改用户全局默认值。原生恢复优先保存模型，指定模型不可用时明确拒绝。认证调用前刷新共享 AuthStorage；包操作明确持久化，再同步资源字段和 reload，保留会话覆盖。

OpenCode、Claude Code、Codex 实现及依赖不变；共享入口仅追加 Pi 注册和有条件路由。无网络监听端口；这是本地进程型微服务。

## 主机边界

标准九种扩展 UI 全部适配。终端自定义组件/编辑器替换、页眉页脚、终端快捷键和主题无法作为 Obsidian 组件执行；不算业务接口已实现。底层类型、工具函数和 TUI 布局导出不是独立产品功能。Pi 没有的 MCP/子代理管理 API 不虚构。

OAuth 回调、选择器、取消已接线并用可控回调验证；真实账号浏览器授权需用户本人完成，不能以 fixture 代替真实登录证明。

## 升级与验收

1. 按官方方式升级 Pi，保留上一可用版本。
2. node scripts/pi-sdk-acceptance.mjs：对照当前安装 RpcCommand union，隔离测试全部业务操作、9 UI、自动重试/压缩、异步扩展、账号跨进程刷新、包加载卸载和原生恢复。
3. node scripts/pi-rpc-smoke.mjs：实际提供商/工具/流式回复/恢复/分叉/删除隔离。
4. Pi 定向测试；刷新 Graphify；npm run verify。
5. 构建后整体部署 main.js、manifest.json、styles.css、assets，再核对 BUILD_ID/hash，并在 Test Vault 实测。
6. SDK 破坏性变化只在 Pi 服务层处理；失败回退上个 SDK/服务版本，不自行迁移原生 JSONL。

详细逐项证据见 docs/status/pi-backend-acceptance.md。

## 原生用户配置与前端（2026-09-09）

Pi拥有与ClaudeCode/Codex一致的主标签、8二级页。51项官方settings字段按项目/全局编辑并显示继承与作用域；models.json支持自定义provider/model/headers/compat/thinkingLevelMap/modelOverrides。运行时31字段与终端/导出/CLI目录字段明确区分，不承诺终端控件能改变插件UI。配置文件修复使用独立进程，不依赖模型/扩展初始化。保存备份和revision检测，用户显式重连后应用构造时参数；同名新增provider拒绝，未知字段保留。

发行包保持Obsidian标准三文件。4个Pi包装脚本嵌入main.js，由Pi启动时按内容哈希展开；并未将外部SDK嵌入主进程。开发部署可继续复制assets，普通用户安装不需要单独下载服务资产。
