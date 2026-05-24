# SettingsServerSection

> **源码**: `src/features/settings/SettingsServerSection.ts`
> **状态**: [REVIEW]

## 概述

`SettingsServerSection.ts` 是设置页 Server 分区的专属 owner。它从 `OpenCodianSettings` 主类中接管了这块 section 的完整 lifecycle，包括：

- server mode 切换与 local/remote 子分支装配
- OpenCode executable path / host / port / remote URL / auth 输入写回
- start / stop / test / refresh 按钮与状态文案刷新
- 固定轮询驱动的 server status 同步
- help modal 按钮与 unload cleanup

目标不是拆薄 helper，而是把一整块 server DOM/state/runtime 责任收口到单独 owner，避免 `OpenCodianSettings` 继续直接持有大段 server section 组装与轮询逻辑。

## 核心逻辑

### 挂载与释放

- `attach()` 负责创建 section heading、按当前 mode 渲染 local 或 remote 子区块，并挂上 auth/status 区块
- `dispose()` 清掉轮询、状态按钮引用与 unload listener，避免 settings 面板重建后旧 section 继续回写
- `refreshStatus()` 会读取 `OpenCodeService` 的 health、diagnostics、internal status，再同步按钮可用态与描述文本；如果当前 active backend 已经切出 OpenCode，旧轮询回调会静默返回，避免 Claude active backend 下继续探测 OpenCode server

### 配置写回

- mode 切换继续保留 local→remote 自动填充 base URL、local 下 bearer→none fallback 的旧语义
- local OpenCode executable path / host / port 仍沿用原生 `change` / `blur` 事件提交与错误提示；可执行文件路径留空表示继续使用自动探测
- remote URL、basic auth、bearer token 仍直接写回 plugin settings，并在 mode/auth 切换后请求 settings 面板整体重建
- executable path、remote URL 和 bearer token 这些长文本字段会标记 `.opencodian-wide-text-setting`，让 inline hint/path 在设置布局中获得更宽但有上限的输入列；host/port/username/password 继续保持普通紧凑宽度
- 所有这些配置写回 callback 执行前都必须重新确认 active backend 仍是 OpenCode。Server 一级设置页在 tabbed layout 里只会于 OpenCode active 时挂载，但旧 dropdown/text callback 可能在切到 Claude Code 后短暂存活；这种 stale callback 必须显示 OpenCode-only Notice，并且不能改写 server settings、调用 `saveSettings()` 或请求整页重绘。active backend fallback 由 `settingsBackendGuards.ts` 统一解析，避免 Server 与其他 OpenCode-owned settings owner 的 stale guard 语义漂移。

### 状态与动作

- status 文案继续区分 local managed / external / conflict / orphan restarted / remote connected 等状态
- action 按钮继续保留 local `start` 与 remote `test` 的分叉行为
- stop / refresh 按钮继续沿用原有禁用条件，并在每次刷新后通知模型分区同步 catalog refresh 按钮状态
- start / stop / test / manual refresh 按钮执行前也会重新确认 active backend 仍是 OpenCode；如果已经切到 Claude Code，只显示 OpenCode-only Notice，不调用 `openCodeService.start()`、`stop()` 或 `checkHealth()`。

## 关键方法

| 方法 | 说明 |
|------|------|
| `attach()` | 挂载整个 server section，并启动状态轮询 |
| `dispose()` | 停止轮询并释放旧 section runtime |
| `refreshStatus()` | 刷新 status 描述、按钮状态与跨 section 的 server-state 回调 |

## 与其他模块的交互

- `OpenCodianSettings`: 创建该 owner，并接收最新 `lastKnownServerHealthy/Status` 回写，同时负责触发整页重建
- `OpenCodeService`: 提供 health、diagnostics、internal status 与 start/stop/test 所需的 runtime API
- model section host: 通过 `notifyModelCatalogStatus()` 复用 server health 状态，控制模型刷新按钮
- `ServerSettingHelpModal`: 作为每个 server setting 的帮助入口

## 注意事项

- 这里的 owner seam 必须继续保留 local/remote mode 语义、managed/external/conflict 判定、auth fallback 与 restart/test 行为
- 如果只改 server section，优先扩展这个 owner；不要再把 mode/auth/status/action 细节塞回 `OpenCodianSettings`

## 2026-04-24 Tabbed layout support

Added `attachTabbed(containerEl, secondaryTabId)` method for the tabbed settings layout. It routes content to the appropriate secondary tab:

- `connection` — renders mode + local executable path / host / port or remote URL settings
- `auth` — renders auth type + credentials
- `status` — renders status display with polling interval

The classic `attach()` method remains unchanged for the classic flat layout.
