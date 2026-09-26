# ZCodeRuntimeResolver

> 2026-09-22（核查修复）：node-bundle 运行器只认两个实证可用的 runner——bundle 自带应用 Electron（官方 electron-node 形态）→ PATH `node`；**绝不使用宿主注入的 Electron**（Obsidian 的 Electron 忽略 `ELECTRON_RUN_AS_NODE`，进程根本到不了 bundle）。解析顺序改为设置 `executablePath` 优先于 `ZCODE_AGENT_SERVER_COMMAND` 环境覆盖（用户显式选择高于继承环境），其余链不变。\n\n> 源码: src/core/agents/backend/zcode/ZCodeRuntimeResolver.ts

## 职责

`resolveOfficialZCodeDesktopBundle` 单独定位已安装桌面包中的 `glm/zcode.cjs`，供桌面 `TaskIndexRepo` 使用。用户为 app-server 指定的本地源码 CLI 覆盖路径不会改变桌面任务索引的实现归属；找不到官方桌面包时仍由索引桥安全拒绝写入。

定位官方 ZCode 运行时并产出 `app-server --stdio` 的精确 spawn 形态（command/args/extraEnv），只决策不 spawn。解析顺序镜像官方宿主的命令解析：

1. 设置项 `executablePath` 覆盖（原生二进制 / `zcode.cjs` bundle / 含其一的目录）
2. `ZCODE_AGENT_SERVER_COMMAND` + `ZCODE_AGENT_SERVER_ARGS_JSON` 官方命令覆盖
3. `GLM_BINARY_PATH`（已部署原生二进制）
4. `ZCODE_AGENT_WORKDIR`（内含 `zcode-agent(.exe)` 或 `zcode.cjs`）
5. 各平台应用内置 `resources/glm` 目录（macOS `/Applications/ZCode.app/...`、Windows `%LOCALAPPDATA%\Programs\ZCode\...` 等标准安装根、Linux `/opt/ZCode/...` 等）

目录内优先 `zcode-agent(.exe)`（native-binary，直接 spawn），其次 `zcode.cjs`（node-bundle）；bundle 以宿主 Electron 二进制 + `ELECTRON_RUN_AS_NODE=1` 运行（官方 electron-node 形态，macOS 从 `<App>.app/Contents/Resources` 上溯两层定位 `<App>.app/Contents/MacOS/<App>`），无 Electron 宿主时回退 PATH `node`。缺失/不兼容均给出可操作诊断（`getZCodeRuntimeErrorMessage`）。

## 验证

tests/unit/core/agents/backend/ZCodeRuntimeResolver.test.ts 与 ZCodeRuntimeResolver.hostBinaryRegression.test.ts（后者回归 macOS 宿主二进制上溯两层的缺陷）：覆盖全部解析来源、`~` 展开、目录内优先级、三平台内置布局、args JSON 非法、缺失诊断。
