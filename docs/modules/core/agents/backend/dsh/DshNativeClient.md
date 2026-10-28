# DshNativeClient

源码：`src/core/agents/backend/dsh/DshNativeClient.ts`

在 `core.backend` 内扩展既有 JSON-RPC 传输，拥有每次启动的原生 Harness 扩展和私有 profile 目录。只有 `nativeProtocol: opencodian.dsh-native/1` 握手成功才报告就绪；不静默回退为 ACP。

构建把 `assets/dsh/service.mjs`、`auxiliary.mjs`、`launcher.mjs` 合并到 `DSH_NATIVE_SERVICE_SOURCE`。启动时写出权限为 0600 的自有服务、启动文件及 overlay，由用户安装的 Node/Electron 载体加载官方 Harness 包。`launcher.mjs` 使用官方 SDK composition 的 application-owned profile 接缝，读取已有 SDK bundles、用户 patch 与模块目录，根配置和 manifest 写入本次私有目录；原 SDK profile 不经过会重写根配置的 CLI prepareProfile。相对插件路径仍以原 patch 所在目录解析。

2026-10-28：npm CLI 载体通过 PATH 上的外部 `node` 启动；桌面应用载体继续使用其原始 Electron 命令。嵌入 Obsidian 时 `process.execPath` 指向宿主应用，不能用于 CLI 服务，否则会打开界面或将启动文本混入 JSON-RPC。单元测试分别断言两种载体，升级后的真实 CLI 验证单独记录。

`nativeRequest` 复用父类的请求关联和超时。并发 start/stop、准备中取消、部分文件创建失败均受代际保护。停止等待原生进程退出后，只 unlink 明确列出的自有文件和模块目录链接，再以非递归 rmdir 删除空目录；未知残留导致可见失败，不扩大删除范围。

真实无模型探针 `DshNative.live.test.ts` 验证 MCP、反向问题请求、原 profile 原字节保留、相对插件路径和首次启动不创建用户 SDK profile。单元测试覆盖准备失败、并发停止和迟到启动。Windows 载体兼容性须独立实机验收。
