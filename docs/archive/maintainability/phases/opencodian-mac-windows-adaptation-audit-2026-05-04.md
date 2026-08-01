# OpenCodian macOS / Windows 双端适配审查报告

日期：2026-05-04

分支：`codex/opencodian-mac-windows-adaptation-audit`

## 总体结论

OpenCodian 的双端适配成熟度为 **较成熟，但仍需要继续补齐 Windows / macOS 真实环境验证**。

插件已经把最危险的跨端差异集中在少数 owner：`LocalSidecarLauncher` 管二进制解析、spawn 与环境变量；`ServerManager` 管 managed sidecar 生命周期和 launcher/listener PID；`LocalSidecarProcessInspector` 管 OS 进程探测；`contextPath` 管 Windows/POSIX/file URL 路径规范化。审查中未发现 P0。

本轮发现的 P1 中，已小步修复 4 个：健康等待失败后的 sidecar 清理、Windows wrapper 退出后的 listener state 保留、空 `PATH` 遮住 `Path` fallback、同端口 host 切换的原地 restart。另有 1 个 P1 需要触碰 guarded thick owner `ServerManager.ts` 才能完整修复；本轮没有绕过 `owner-guard`，已把风险、复现路径和建议写入报告。剩余风险主要集中在真实 Windows/macOS CI 覆盖不足、OS probe 缺少 timeout/fallback、UNC 直写路径边缘处理、以及 Test Vault 部署流程仍偏手工。

## 已经做得好的地方

- 本地 sidecar 默认端点和 OpenCode legacy/remote 端点已分离：插件默认 `127.0.0.1:4196`，远程/legacy 默认仍可指向 `127.0.0.1:4096`。证据：`src/core/types/settings.ts:116`, `src/core/types/settings.ts:117`, `src/core/types/settings.ts:1781`；迁移测试见 `tests/unit/main.test.ts:399`。
- Windows drive path、反斜杠、vault-relative attachment 和 `file:///C:/...` round-trip 已集中到 `contextPath`，不依赖当前宿主 OS。证据：`src/shared/contextPath.ts:22`, `src/shared/contextPath.ts:39`, `src/shared/contextPath.ts:58`, `src/shared/contextPath.ts:88`；测试见 `tests/unit/shared/contextPath.test.ts:10`, `tests/unit/shared/contextPath.test.ts:23`。
- SDK 非 SSE 请求走 Obsidian `requestUrl`，可避开 Obsidian/Electron CORS 限制；SSE 仍走 native fetch。证据：`src/core/opencode/sdkFetch.ts:9`, `src/core/opencode/sdkFetch.ts:124`, `src/core/opencode/sdkFetch.ts:129`。
- OpenCode sidecar spawn 已显式注入 Obsidian CORS origin，且 `.cmd/.bat` wrapper 在 Windows 走 shell。证据：`src/core/opencode/LocalSidecarLauncher.ts:139`, `src/core/opencode/LocalSidecarLauncher.ts:143`, `src/core/opencode/LocalSidecarLauncher.ts:150`, `src/core/opencode/LocalSidecarLauncher.ts:393`。
- 本地配置发现已经覆盖 vault `.opencode`、XDG config、HOME/USERPROFILE `.opencode` 和系统级 managed config。证据：`src/core/opencode/ServerManager.ts:752`, `src/core/opencode/ServerManager.ts:756`, `src/core/opencode/ServerManager.ts:761`, `src/core/opencode/ServerManager.ts:767`, `src/core/opencode/ServerManager.ts:778`。
- 插件自身状态存储在 vault-local `.opencodian`，避免依赖 OS 用户目录。证据：`src/core/storage/StorageService.ts:29`, `src/core/storage/StorageService.ts:32`, `src/core/storage/StorageService.ts:36`, `src/core/storage/StorageService.ts:167`。
- 构建产物包含 `dist/main.js`、`dist/manifest.json`、`dist/styles.css` 和 assets，并注入 `BUILD_ID`。证据：`scripts/build.mjs:32`, `scripts/build.mjs:46`, `scripts/build.mjs:75`, `scripts/build.mjs:80`, `scripts/build.mjs:84`, `scripts/build.mjs:87`。
- graphify 显示 `ServerManager` 是核心抽象之一，审查优先聚焦 sidecar/runtime owner 是合理的。证据：`graphify-out/GRAPH_REPORT.md:103`, `graphify-out/GRAPH_REPORT.md:112`。

## 明确风险 / 缺口

### P0

未发现 P0。

### P1：已修复

1. 健康等待失败可能遗留 unmanaged sidecar。
   - 风险：`launchRuntime()` spawn 成功但 health timeout 时，旧代码在 `ServerManager` 登记 child 之前抛错，catch 清理路径看不到 process。
   - 修复：由 `LocalSidecarLauncher` 在 ready wait 抛错前清理 launch tracking，并终止刚 spawn 的 process；Windows 下优先 `taskkill /T /F`，其他平台走 `SIGTERM`。
   - 证据：`src/core/opencode/LocalSidecarLauncher.ts:83`, `src/core/opencode/LocalSidecarLauncher.ts:88`, `src/core/opencode/LocalSidecarLauncher.ts:226`, `src/core/opencode/LocalSidecarLauncher.ts:231`, `src/core/opencode/LocalSidecarLauncher.ts:247`。
   - 回归测试：`tests/unit/core/opencode/ServerManager.runtime.test.ts:408`。

2. Windows npm/桌面 wrapper 退出可能误清真实 listener state。
   - 风险：Windows 上 launcher pid 和 listener pid 常不同，wrapper 退出但 `opencode.exe` listener 仍活时，旧代码会清空 managed state。
   - 修复：`LocalSidecarLauncher` 的 exit handler 同步确认当前 host/port 上仍有 plugin-managed listener；若存在，就 detach launch tracking 并不调用 `ServerManager` 的 exit cleanup。
   - 证据：`src/core/opencode/LocalSidecarLauncher.ts:179`, `src/core/opencode/LocalSidecarLauncher.ts:183`, `src/core/opencode/LocalSidecarLauncher.ts:212`, `src/core/opencode/LocalSidecarLauncher.ts:218`。
   - 回归测试：`tests/unit/core/opencode/ServerManager.runtime.test.ts:442`。

3. `PATH=''` 会遮住 Windows `Path` / `path` fallback。
   - 风险：Obsidian 从 Explorer 启动时环境变量 casing 可能和终端不同；空 `PATH` 不应阻止从 `Path` 找到 npm shim。
   - 修复：PATH 解析选择 `PATH` / `Path` / `path` 中第一个非空值。
   - 证据：`src/core/opencode/LocalSidecarLauncher.ts:383`。
   - 回归测试：`tests/unit/core/opencode/ServerManager.lifecycle.test.ts:450`。

4. 同端口 host-only 设置切换会被当前 managed server 自己挡住。
   - 风险：从 `127.0.0.1:4196` 改为 `0.0.0.0:4196` 时，预 bind 会看到旧 listener 占用并拒绝更新，restart 没机会 stop 旧服务。
   - 修复：同端口且需要 restart 的 managed local 设置变更跳过预 bind，交给 restart 原地替换；不同端口仍保留预 bind。
   - 证据：`src/core/opencode/OpenCodeServiceLifecycleCoordinator.ts:451`, `src/core/opencode/OpenCodeServiceLifecycleCoordinator.ts:453`。
   - 回归测试：`tests/unit/core/opencode/OpenCodeServiceLifecycleCoordinator.test.ts:396`。

### P1：未直接修复，需后续维护性整改

1. `ServerManager` 的 listener PID 查询仍有按 port 不按 host 的 owner 误判风险。
   - 风险：`127.0.0.1`、`localhost`、`0.0.0.0` 或 IPv4/IPv6 地址族差异下，仅按 port 查询可能 adopt/restart/recycle 错 PID，最坏情况下停止不属于当前 host 的 listener。
   - 复现路径：准备同端口不同 local address / 地址族的 listener，让插件设置为 `127.0.0.1:4196` 或 `localhost:4196`，再触发 managed adoption / restart / orphan recycle；`ServerManager` 当前在 `tryAdoptManagedServer()`、`getAdoptableManagedServerState()`、`inspectExistingHealthyServer()`、`restartManagedServer()` 仍只传 `port`。
   - 证据：`src/core/opencode/ServerManager.ts:607`, `src/core/opencode/ServerManager.ts:639`, `src/core/opencode/ServerManager.ts:659`, `src/core/opencode/ServerManager.ts:691`。
   - 本轮已做的铺垫：`LocalSidecarProcessInspector` 已支持 host-aware PID 查询，Windows 按 `LocalAddress` 过滤，非 Windows 解析 `lsof -F pn` 并优先 exact host、其次 wildcard；`LocalSidecarLauncher` 的 wrapper-exit 保护已使用这个能力。
   - 铺垫证据：`src/core/opencode/LocalSidecarProcessInspector.ts:19`, `src/core/opencode/LocalSidecarProcessInspector.ts:81`, `src/core/opencode/LocalSidecarProcessInspector.ts:117`, `src/core/opencode/LocalSidecarLauncher.ts:218`。
   - 测试：`tests/unit/core/opencode/LocalSidecarProcessInspector.test.ts:60`, `tests/unit/core/opencode/LocalSidecarProcessInspector.test.ts:69`, `tests/unit/core/opencode/LocalSidecarProcessInspector.test.ts:101`。
   - 为什么不在本轮硬改：直接把 `this.config.local.host` 传入 `ServerManager` 的多处 lifecycle 查询会触碰 guarded thick owner `src/core/opencode/ServerManager.ts`，`npm run check:owner-guard` 会阻断 Class B 改动。本轮选择不绕过门禁。
   - 建议：开一个维护性整改任务，把 listener owner resolution 移到既有相邻 owner（例如 `LocalProcessProbe` / `LocalSidecarEndpointResolver`）后，让 `ServerManager` 只调用一个更高层的“当前配置 listener owner”方法；配套补 `ServerManager.runtime` 的同端口不同 host 回归测试，并确保 owner-guard 仍通过。

### P2：未在本轮直接修复

1. `ServerManager.setWorkingDirectory()` 仍用硬编码 `/` 拼项目配置探测路径。
   - 风险：trailing slash 或 Windows path 日志/探测路径可能出现混合或重复分隔符；`fs` 通常能容忍，但诊断和一致性较差。
   - 证据：`src/core/opencode/ServerManager.ts:78`, `src/core/opencode/ServerManager.ts:85`。
   - 本轮处理：`LocalSidecarLauncher` 的诊断日志已改为 `path.join()`，但 `ServerManager.ts` 是 guarded thick owner，未在本轮为低风险诊断问题触碰。
   - 建议：和上面的 listener owner 整改合并处理，避免为了一个诊断路径单独突破 owner-guard。

2. OS probe 命令缺少 timeout / fallback。
   - 风险：PowerShell、`lsof`、`ps` 卡住或缺失时，start/stop/adopt 可能等待过久。当前 `captureCommandOutput()` 只监听 `error` / `exit`。证据：`src/core/opencode/LocalSidecarProcessInspector.ts:285`。
   - 建议：给 `captureCommandOutput()` 增加 bounded timeout；Windows fallback 到 `netstat -ano` / `tasklist`，Unix fallback 到直接 `lsof` 或 `ss`。

3. `LocalSidecarEndpointResolver` 对 `localhost` 和 `127.0.0.1` 仍保持字符串级严格匹配。
   - 风险：一个插件形态的 orphan sidecar 若以 `--hostname localhost` 启动，而当前设置是 `127.0.0.1`，仍会走 conflict 而非 recycle。证据：`src/core/opencode/LocalSidecarEndpointResolver.ts:80`, `src/core/opencode/LocalSidecarEndpointResolver.ts:89`, `src/core/opencode/LocalSidecarEndpointResolver.ts:161`。
   - 建议：先补 resolver 测试，明确 loopback alias 是否应该等价；如果等价，收口成一处 host canonicalization。

4. UNC 直写路径 `\\server\share\...` 不是当前 `contextPath` 测试覆盖重点。
   - 风险：`file://server/share/...` 可经 `contextPathFromFileUrl()` 还原为 `//server/share/...`，但直接传入双反斜杠 UNC path 时，`path.posix.normalize()` 可能折叠双斜杠。证据：`src/shared/contextPath.ts:31`, `src/shared/contextPath.ts:105`。
   - 建议：补 `\\server\share` direct path 与 `file://server/share` round-trip 测试，再小步修 UNC normalize/resolve。

5. CI 只在 Ubuntu 上运行，没有 Windows/macOS matrix。
   - 风险：大量 Windows/macOS 语义靠 mocked `process.platform` 单测覆盖，但不能发现真实 PowerShell、`taskkill`、`lsof`、case-insensitive FS、Electron inherited env 差异。证据：`.github/workflows/ci.yml:11`, `.github/workflows/ci.yml:33`, `.github/workflows/ci.yml:64`, `.github/workflows/ci.yml:68`。
   - 建议：至少增加 nightly 或手动触发的 `windows-latest` / `macos-latest` targeted suite：`ServerManager.*`, `LocalSidecarProcessInspector`, `contextPath`, `sdkFetch`。

6. Test Vault 部署仍主要依赖手工 copy 约定。
   - 风险：AGENTS 规定 build 后顺序复制 `dist/main.js`、`dist/manifest.json`、`dist/styles.css` 并校验 `BUILD_ID`，但仓库内未看到统一 npm deploy script；双端路径差异下容易漏复制或校验旧产物。
   - 证据：构建产物生成见 `scripts/build.mjs:75`；CI 只校验 `styles.css` clean，见 `.github/workflows/ci.yml:73`。
   - 建议：新增跨平台 deploy helper，输入 Test Vault plugin dir，顺序复制产物并校验 `BUILD_ID`。

7. macOS / Linux 全局配置和安装候选仍有待与真实 OpenCode 运行时确认。
   - 风险：当前 managed config 目录包含 macOS 系统级 `/Library/Application Support/opencode`、Windows `ProgramData` 和 Linux `/etc/opencode`；OpenCode 文档也强调 `~/.config/opencode`，已由 XDG/HOME 路径覆盖，但 macOS 用户级 `~/Library/Application Support/opencode` 是否应参与 fingerprint 仍未验证。Linux binary 候选也未显式列出 `~/.local/bin` / `/snap/bin`，主要依赖 PATH。证据：`src/core/opencode/ServerManager.ts:778`, `src/core/config/ModelConfigService.ts:297`, `src/core/opencode/LocalSidecarLauncher.ts:314`。
   - 建议：用真实 `opencode config` / `opencode models` 在 macOS 与 Windows 验证配置搜索顺序，再决定是否补 macOS user Application Support；Linux 安装候选优先补 `~/.local/bin`，但不应替代 PATH fallback。

8. 全局插件目录解析仍固定为 `~/.config/opencode`，没有候选目录合并。
   - 风险：`PluginManagementService` 的默认全局插件目录与参考文档 `~/.config/opencode/plugins/` 一致，但如果 Windows OpenCode runtime 未来采用 `%APPDATA%\opencode`，插件页会漏报全局插件。证据：`src/core/config/PluginManagementService.ts:71`, `docs/reference/opencode-complete-documentation.md:2164`。
   - 建议：不要在未验证上游路径前直接改默认值；后续应抽出 shared OpenCode config path resolver，让 `PluginManagementService`、`ModelConfigService`、`ServerManager` 共享候选集合，并用 fixture 测试 Windows/macOS/Linux。

9. Settings debug 目录选择只展开 `~`，不展开 Windows `%USERPROFILE%` / `%APPDATA%`。
   - 风险：用户若在允许导出路径中填写 Windows 环境变量形式，目录 picker 默认路径不会展开，可能退回 Desktop/home。证据：`src/features/settings/SettingsDebugSection.ts:410`, `src/features/settings/SettingsDebugSection.ts:424`。
   - 建议：补一个小 helper 支持 `%VAR%` 和 `$VAR` 的安全白名单展开，先覆盖 `%USERPROFILE%`、`%APPDATA%`、`%LOCALAPPDATA%`。

10. Windows OpenCode Desktop 安装路径候选仍有限。
   - 风险：本轮已有 `%LOCALAPPDATA%\OpenCode\opencode-cli.exe` / `opencode.exe`，但如果安装器使用 `%LOCALAPPDATA%\Programs\OpenCode\` 或 `Program Files`，仍依赖 PATH fallback。证据：`src/core/opencode/LocalSidecarLauncher.ts:291`, `src/core/opencode/LocalSidecarLauncher.ts:293`。
   - 建议：先用真实 Windows mirror 上的安装位置确认，再补候选；避免把不确定路径无限扩展。

11. Windows path 归一化仍有一处大小写策略待收敛。
   - 风险：`slashCommandCatalog` 的 comparable path 对 Windows drive path 整串 lower-case，可能改变路径段展示或区分能力；Windows 文件系统通常大小写不敏感但保留大小写。证据：`src/core/config/slashCommandCatalog.ts:83`, `src/core/config/slashCommandCatalog.ts:89`。
   - 建议：只 lower-case drive letter 或引入 shared path canonicalizer；先补 runtime skill source case-preservation 测试。

12. Windows probe 固定调用 `powershell`，没有 `pwsh` fallback。
   - 风险：大多数 Windows 仍有 Windows PowerShell 5.1，但精简或自定义环境可能只有 PowerShell 7 `pwsh`。证据：`src/core/opencode/LocalSidecarProcessInspector.ts:21`, `src/core/opencode/LocalSidecarProcessInspector.ts:192`。
   - 建议：与 probe timeout/fallback 一起处理，不在本轮单独扩展。

## 建议补充的测试或修复

- 增加 `LocalSidecarProcessInspector` probe timeout/fallback 单测，并在 fake hung child 下断言会释放。
- 增加 `LocalSidecarEndpointResolver` loopback alias/quoted args 测试。
- 增加 UNC direct path 与 UNC `file://host/share` round-trip 测试。
- 增加 GitHub Actions 手动或 nightly Windows/macOS matrix，先只跑 targeted cross-platform suite，避免把常规 CI 时间拉爆。
- 增加 Test Vault deploy helper 的 dry-run / BUILD_ID verification 测试。

## 子代理审查摘要

- 进程与 shell 子代理：发现 3 个 P1，分别是健康等待失败 sidecar 泄漏、Windows wrapper exit 误清 state、空 `PATH` 遮住 `Path` fallback；本轮均已修复并补回归测试。
- 网络与本地服务子代理：发现 2 个 P1，分别是 host-blind listener PID lookup、同端口 host-only 切换被当前 managed server 阻挡；本轮修复了同端口 host restart，并为 host-aware PID probe 补了 API 和测试，但 `ServerManager` 侧完整接入因 owner-guard 未直接修改。另指出 loopback alias strict resolver 为 P2，保留为后续明确语义后处理。
- 其余方向由主线程审查：路径与文件系统、配置与用户目录、Obsidian/Electron/Test Vault、测试与 CI。结论是核心路径和 sidecar owner 成熟度较高，风险集中在 UNC、真实 OS probe、部署脚本和 CI matrix。

## opencode 复查结论

已按要求执行：

```bash
opencode run --dir "/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian" -m zhipuai-coding-plan/glm-5.1 "请审查当前 OpenCodian macOS/Windows 双端适配分析和改动，指出遗漏、误判和风险"
```

复查结论：

- 认可的成熟点：二进制发现、Windows `.cmd/.bat` shell spawn、PowerShell/lsof/ps/taskkill 分流、`contextPath` 集中处理 Windows drive/file URL。
- 已采纳并修复：`LocalSidecarLauncher` 诊断日志里的项目配置路径拼接改用 `path.join()`；`ServerManager.setWorkingDirectory()` 同类问题记录为 P2，等待后续维护性整改时合并处理。
- 第二次复查在 owner-guard 收口后执行；它仍先看到分支与 `main` 同提交，但随后读取了当前工作树源码并给出平台风险清单。
- 已记录但本轮不直接改：macOS managed config 是否应包含用户级 Application Support、`PluginManagementService` Windows 全局目录惯例、Settings debug `%USERPROFILE%` 展开、OpenCode Desktop 安装目录候选、Linux `~/.local/bin`/`/snap/bin` 候选、`lsof` 缺失 fallback、UNC direct path、`slashCommandCatalog` Windows path case 策略、`pwsh` fallback。
- 对复查中的一个判断保留意见：`/Library/Application Support/opencode` 是系统级绝对路径，不是语法错误；参考文档明确多处写 `~/.config/opencode`，当前代码已覆盖该路径。是否还应补 `~/Library/Application Support/opencode` 需要用真实 OpenCode 配置搜索顺序验证后再改。

## 本轮验证记录

- targeted tests 均通过:
  - `npm test -- tests/unit/core/opencode/ServerManager.lifecycle.test.ts --runInBand`
  - `npm test -- tests/unit/core/opencode/ServerManager.runtime.test.ts --runInBand`
  - `npm test -- tests/unit/core/opencode/OpenCodeServiceLifecycleCoordinator.test.ts --runInBand`
  - `npm test -- tests/unit/core/opencode/LocalSidecarProcessInspector.test.ts --runInBand`
  - `npm test -- tests/unit/shared/contextPath.test.ts --runInBand`
  - `npm test -- tests/unit/core/opencode/sdkFetch.test.ts --runInBand`
- graphify / docs gates 均通过:
  - `npm run graphify:update:src`
  - `npm run check:graphify`
  - `npm run check:module-docs`
- required broader gates 均通过:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run verify`

备注：`npm run verify` 中 Jest 仍输出两条 `--localstorage-file` 参数 warning，但命令最终通过：`362` 个 test suites、`2115` 个 tests 全部通过，并完成 production build。
