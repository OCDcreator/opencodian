# PiRpcClient
> 2026-09-21 (advantage-parity R-F7)：PiLaunchOptions 新增 `getExtraEnv`；spawn env 在 PATH 增补之后叠加额外环境（显式用户变量含 PATH 保持最终话语权）。

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

2026-10-07：Pi 服务在导入/构造 SDK 前调用安装 SDK 的 core/output-guard.takeOverStdout（0.73.1 与 1.0.x 均提供），保护 JSONL stdout，npm/git 子进程及扩展普通 stdout 进入已排空的 stderr。协议 writer 在 takeover 前固定原始 stdout write，不被重定向；测试注入 streams 的离线路径不接管宿主 stdout。缺 guard/method 明确拒绝启动，不能忽略非 JSON 行来使握手通过。
启动 wrapper 与显式 file-service 入口同样提前固定 error writer，SDK 接管 stdout 后的 startup failure 仍进入 JSONL transport_error；不把已排空的 stderr 当作协议错误输出。
configurationOnly 的配置 transport 也使用捕获的 raw protocol writer，SDK 接管 stdout 后的配置读取/保存响应保持 JSONL；独立 configurationOnly fixture 验收与普通聊天分别执行。

空分支持久化：服务侧 `fork` / `clone` 等待原生 fork 完成后，只在 SDK 返回的子文件不存在时，用公开 `sessionManager.getHeader()` / `getEntries()` 的完整原生数据以 exclusive-create 落盘，再返回给 facade。保留 header 的 native ID、parentSession 与 entry IDs；取消不写，已有文件不覆写，写失败不 ACK 成功。这样 PiAdapter 切回父 actor 后仍能准确打开子分支。

minimum SDK 的 `createBranchedSession` 会在子文件尚无消息而未落盘时立即重开该路径；服务在独立 Pi 进程内对该公开方法安装一次包装，在返回路径前持久化公共 header/entries。该逻辑不调用 `_persist` / `_rewriteFile` 等私有方法，内存分支返回空路径时跳过。真实 0.73.1 与 1.0.0 服务回归核对 native ID、父文件、模型、空对话和父文件字节不变。
