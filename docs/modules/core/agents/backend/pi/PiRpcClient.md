# PiRpcClient

> 源码: src/core/agents/backend/pi/PiRpcClient.ts

## 职责

解析官方 npm CLI 及外部 Node；启动 assets/pi/service.mjs 并传入官方 dist/index.js。支持 Windows npm shim，不执行 shell，不打包 SDK。

LF JSONL 保留 Unicode/分片；id/command 校验、请求超时及0无限等待、32MiB帧限制、错误清理。stderr 排空，不进入聊天或日志。close先发shutdown，2秒后强制结束。

## UI 与验证

respond 只发送明确 UI 回复，不替用户批准。启动错误/退出使全部pending失败并通知运行时取消弹窗。PiRpcClient.test.ts 及真实SDK验收脚本验证传输。

2026-09-09：configurationOnly启动标记交给service.mjs，配置编辑不触发模型/扩展启动。

## 标准安装包

构建把4个插件自有Pi服务脚本作为PI_SERVICE_SOURCES嵌入main.js，官方SDK仍外置。Pi启动时按内容哈希写入插件assets/pi/.bundled-<hash>/，使用临时文件和原子替换；不同版本不互相覆盖正在运行的服务。仅三文件安装也能启动Pi，源码树/测试仍支持显式servicePath。
