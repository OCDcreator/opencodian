# ZCodeManagementService

> 源码: src/core/agents/backend/zcode/ZCodeManagementService.ts
> Owner: core.backend（ZCode 管理与配置专属边界）

## 职责与固定来源

在当前 owned transport 上读取 ZCode plugin effective 目录与 MCP status，将项目声明、有效配置、unknown 分开。固定官方源码为 zai-org/ZCode `29628c9acdb81b703bbd4080c207a0e7ce5e276e` 的 shared protocol schema、bootstrap protocol plugins/MCP 与 workspace 配置发现。官方 source 快照不是 installed-runtime 验收证据。

这不是薄转发 helper：本模块隔离配置安全写入、运行时目录边界校验和三轴证据。SettingsZCodeSection 只显示白名单字段；原始 options、hook command、MCP headers/env、OAuth URL 和远程错误文本不越过此边界。

## 目录与缺失能力

- `plugins/list` 的 `plugins` 数组验证 id、enabled 与重复 id，输出有效开关、来源、缺包状态及 MCP/hook 数量。缺失或错误数组为 failed/null，真实空数组才是 available/[]。
- `mcp/list` 必须带 `mode: status`，禁止目录刷新落到默认 connect 分支。只显示 status/toolCount 和认证 required/failed/unknown；connected 不等于 authenticated，空 host auth headers 不证明认证。
- `hooks/list` 与 `mcp/setEnabled` 在 installed CLI 0.16.9 返回 -32601；独立 effective hooks 与 MCP/hooks mutation 都为 unavailable。项目 hooks 声明数量及 plugin hookDetails 数量不证明执行或信任。
- plugin mutation 支持通过 `plugins/setEnabled {}` 的必填参数缺失探测确认：只有 -32602 支持 pinned schema；-32601 为 unavailable，其余错误为 failed；不把意外成功视为支持。不发送任何有效参数，不调用无 revision/archive 的 native writer。

## 保存、重新打开与三轴

目标固定为当前 workspace 的 `.zcode/config.json`，允许写入根仅为当前项目；不接受任意 target/global root。修改 `plugins.enabledPlugins[pluginId]` 前先验证原生目录、插件存在且非 missing。复用 ProjectResourceSecureWrite 的稳定文件 snapshot、四字段 FileRevision、JSON path edit、strict JSON 校验、archive-before-write 与原子提交，保留其他字段。

保存后从磁盘按新 revision 重新打开，并重新调用 native `plugins/list`。只有 enabled 相等、enabledSource 为 workspace、包非 missing 才验证 effective 配置。结果三轴分别为：persistence verified（独立磁盘 reopen），runtime verified（fresh native effective 配置），application pending（旧会话仍持有启动快照，新会话应用未被观察）。运行时不支持或回读不匹配不会从请求值伪造 verified。完整配置必须三轴全 verified，本路径不会声称已完整。

外部编辑、意外文件出现、路径逃逸、malformed JSON、archive failure 均中止写入。配置写入已成功而回读失败时返回 readback-failed，保留真实 persistence 证据，UI 刷新目录。

## Profiles 与实际证据

2026-10-02 Windows resolver 找到 app-bundled node bundle，CLI `--version` 为 0.16.9，desktop package 白名单为 `@zcode/desktop` 3.14.4。真实隔离无模型探测确认 runtime/capabilities、plugins/list、mcp/list status 支持；plugins/setEnabled 缺参返回 -32602；hooks/list 与 mcp/setEnabled 返回 -32601。隔离测试根中的项目插件保存/reopen/native effective 回读为 verified/pending/verified，owned transport 已停止。

官方安装路径和 Node bundle 是同一个 observed 安装组合，不是两次独立 pass；plain Node 主机、独立 native binary、本地 patched/source bundle 和桌面 TaskIndexRepo 各列 unverified，不能继承此次 installed pass。桌面包版本检查只证明身份/版本，不证明索引数据库操作。

## 验证

正式聚焦测试：`tests/unit/core/agents/backend/ZCodeManagementService.test.ts`，覆盖磁盘保存/重开/归档、其他字段保留、revision 冲突、create 冲突、读回不匹配、missing-method、意外 ACK、目录形状错误、敏感字段剥离、认证 unknown、archive failure 和目录 junction 逃逸。

接线测试：`ZCodeAdapter.management.test.ts` 验证当前 transport、断开时不可用、无 workspace 不隐式启动，以及 transport 停止后的旧响应拒绝。SettingsZCodeSection.management.test.ts 验证经典/页签真实挂接路径、save/reopen/effective 更新、三轴 pending 显示和 unavailable 控件。证据根为 `C:/Users/lt/.codex/artifacts/opencodian/backend-integration-2026-10-02/final-expansion/zcode-t09/`，模型与 Obsidian 实机 UI 由 parent 验收。
