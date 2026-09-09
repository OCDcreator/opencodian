# PiRpcClient

> 源码: src/core/agents/backend/pi/PiRpcClient.ts

## 职责

解析用户自行安装的官方 npm CLI 及外部 Node；在独立进程运行内嵌服务代码并加载官方 dist/index.js。支持 Windows npm shim，不执行 shell，不打包或安装 SDK。未安装 Pi 时直接提示不可用。

2026-09-09 Windows兼容：按实际npm shim目标和包元数据识别旧@mariozechner及新@earendil-works包，支持pi/pi.cmd/pi.ps1和带引号路径。CLI迁至dist/bundle/cli.js时仍从包根dist/index.js加载SDK，不能用CLI父目录猜SDK位置，也不能在双包共存时静默换包。Node补查标准Program Files/nodejs及NVM_SYMLINK。PiCommandResolution测试覆盖新旧安装、活跃shim、缺失文件和GUI旧PATH。

LF JSONL 保留 Unicode/分片；id/command 校验、请求超时及0无限等待、32MiB帧限制、错误清理。stderr 排空，不进入聊天或日志。close先发shutdown，2秒后强制结束。

## UI 与验证

respond 只发送明确 UI 回复，不替用户批准。启动错误/退出使全部pending失败并通知运行时取消弹窗。PiRpcClient.test.ts 及真实SDK验收脚本验证传输。

2026-09-09：configurationOnly启动标记交给service.mjs，配置编辑不触发模型/扩展启动。

## 标准安装包

构建把4个插件自有Pi服务模块合并为PI_SERVICE_SOURCE嵌入main.js，官方SDK仍来自用户安装。外部Node通过短启动代码接收stdin中指定字节数的服务源码，以内存ES模块加载，之后同一stdin继续承载JSONL；不占用Windows长命令行、不创建或展开服务文件。发行包只有main.js、manifest.json、styles.css；源码树/测试仍支持显式servicePath。真实SDK验收覆盖不存在的Pi路径、无服务资产安装目录和完整接口。
