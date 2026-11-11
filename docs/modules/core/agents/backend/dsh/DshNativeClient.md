# DshNativeClient

源码：`src/core/agents/backend/dsh/DshNativeClient.ts`

在 `core.backend` 内扩展既有 JSON-RPC 传输，拥有每次启动的原生 Harness 扩展和私有桥接文件。持久 profile 的路径与文件准入分别归 `DshManagedProfile` 和 `assets/dsh/launcher.mjs`。只有 `nativeProtocol: opencodian.dsh-native/1` 握手成功才报告就绪；不静默回退为 ACP。

构建把 `assets/dsh/service.mjs`、`auxiliary.mjs`、`launcher.mjs` 合并到 `DSH_NATIVE_SERVICE_SOURCE`。启动时写出权限为 0600 的自有服务、启动文件及 overlay，由用户安装的 Node/Electron 载体加载官方 Harness 包。`launcher.mjs` 使用官方 SDK composition 的 application-owned profile 接缝，把根配置、manifest、扩展依赖与 ConfigEditor 的 `cordis.patch.yml` 定位到机器本地、按 canonical vault 路径 SHA-256 分隔的持久目录；工作目录覆盖不改变 vault 身份。已有 SDK manifest 只读，原 SDK profile 不经过会改写 manifest 的 `loadProfile` / `loadProfileDirectory`。原始 bundle/SDK patch 在来源位置解析后写入一个自有继承 bundle；安装内包保留逻辑名称，保留 name assertions 与 PluginManager 的保护语义，源外插件及 include 路径保留原目录。持久 `node_modules` 是真实自有目录，不链接用户 SDK 依赖；普通启动依赖官方安装 resolver，不运行 npm install。dsh 0.2.2-rc.1 起 `PROFILE_TEMPLATES` 从 `@deepseek-ai/dsh-app-boot` 迁移到 `@deepseek-ai/dsh-official-bundles`（`sdk` 模板键仍在），launcher 现优先从新包解析、失败时回退旧导出，兼容两代 dsh（2026-11-08，实时审计证明 0.2.2-rc.1 全链路通过）。相对插件路径仍以原 patch 所在目录解析。

2026-10-28：npm CLI 载体通过 PATH 上的外部 `node` 启动；桌面应用载体继续使用其原始 Electron 命令。嵌入 Obsidian 时 `process.execPath` 指向宿主应用，不能用于 CLI 服务，否则会打开界面或将启动文本混入 JSON-RPC。单元测试分别断言两种载体，升级后的真实 CLI 验证单独记录。

`nativeRequest` 复用父类的请求关联和超时。并发 start/stop、准备中取消、部分文件创建失败均受代际保护。停止等待原生进程退出后，由共享 helper 只清理明确列出的临时桥接/overlay 文件和空目录；持久 profile 从不进入清理目标。未知残留导致可见失败，不扩大删除范围。

`nativeConfig` 在分配文件和启动前由 schema owner 严格校验；稀疏 namespace 配置先与上游实际 composition 深合并（数组替换），再生成整行 config overlay，避免丢失继承字段与表达式。用户 patches 先于 library defaults，最终 Native bridge patch 最后加载，注入 canonical `managedProfileRoot` 与 validated intent 的 `nativeConfigRevision`；revision 本身不是字段生效证据。凭据 header refs 由固定、注入 `credentials` 的启动插件解析，provider 等待该插件完成，失败不回显值；只在 mount 内存持有值，修改凭据需要重连。

真实无模型探针 `DshNative.live.test.ts` 验证 MCP、反向问题请求、原 profile 原字节保留、相对插件路径和首次启动不创建用户 SDK profile。单元测试覆盖准备失败、并发停止和迟到启动。Windows 载体兼容性须独立实机验收。
