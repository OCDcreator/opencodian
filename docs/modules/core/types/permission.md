# Permission Types

> **源码**: `src/core/types/permission.ts`
> **状态**: [REVIEW]

## 概述

定义 OpenCode 工具执行的权限配置、权限请求/响应协议和相关类型。覆盖从静态权限配置（`.opencode/opencode.json` 中的 `permission` 字段）到动态权限请求（运行时 OpenCode server 发送的审批请求）的完整生命周期。

## 导入关系

上游: `src/core/types/opencodeConfig.ts`（`OpencodeConfig` — 用于类型别名）
下游:
- `src/core/opencode/OpenCodeService.ts`（处理权限请求/响应）
- `src/features/chat/OpenCodianView.ts`（渲染权限卡片 UI）
- `src/core/config/OpencodeConfigManager.ts`（读写 permission 配置）

## 核心类型 / 接口

### 权限动作

| 类型 | 说明 |
|------|------|
| `PermissionAction` | `'allow' \| 'deny' \| 'ask'` — 单个权限的动作 |
| `ToolPermission` | `PermissionAction \| Record<string, PermissionAction>` — 工具级权限（支持路径/模式级细粒度） |
| `PermissionReply` | `'once' \| 'always' \| 'session' \| 'reject'` — 用户对权限请求的响应；`session` 为插件侧临时语义，发给 SDK 前映射为 `always` |
| `SessionPermissionTracker` | 内存中的 per-session approval tracker；key 包含 session、tool、action 和完整排序后的 pattern set；不持久化，插件 reload 后清空 |

### 权限配置

| 类型 | 说明 |
|------|------|
| `PermissionConfig` | 完整权限配置对象，覆盖 18 种工具/操作的权限 |
| `PermissionMode` | `'yolo' \| 'normal' \| 'plan'` — 全局权限模式 |
| `PermissionSettings` | 插件侧权限设置（`mode`, `useProjectConfig`, `toolPermissions`） |

### 运行时权限请求

| 类型 | 说明 |
|------|------|
| `PermissionRequest` | server 发来的权限请求（`id`, `sessionID`, `permission`, `patterns`, `metadata`, `always`, `tool?`） |
| `PermissionReplyInput` | 用户回复（`requestID`, `reply`, `message?`） |

## 核心逻辑

### 工具权限映射

`PermissionConfig` 定义了 18 种工具/操作的权限控制：

| 配置 key | 对应工具 | 说明 |
|----------|----------|------|
| `*` | 默认（通配符） | 所有未明确配置的工具 |
| `read` | 文件读取 | Read 工具 |
| `edit` | 文件编辑 | 含 edit, write, patch, multiedit |
| `write` | 文件写入 | Write 工具 |
| `bash` | Shell 命令执行 | Bash 工具 |
| `glob` | 文件模式搜索 | Glob 工具 |
| `grep` | 内容搜索 | Grep 工具 |
| `list` | 目录列表 | LS 工具 |
| `task` | 子任务派发 | Task 工具 |
| `skill` | 技能加载 | Skill 工具 |
| `lsp` | LSP 查询 | LSP 工具 |
| `webfetch` | URL 抓取 | WebFetch 工具 |
| `websearch` | 网络搜索 | WebSearch 工具 |
| `codesearch` | 代码搜索 | CodeSearch 工具 |
| `external_directory` | 外部目录访问 | 外部目录 |
| `doom_loop` | 死循环检测 | 循环检测 |
| `todoread` | Todo 列表读取 | 读取待办 |
| `todowrite` | Todo 列表写入 | 写入待办 |

### 权限模式

| 模式 | 行为 |
|------|------|
| `yolo` | 自动允许所有操作，不弹审批 |
| `normal` | 按 `PermissionConfig` 配置决定是否弹审批 |
| `plan` | 类似 normal，但进入计划模式（更严格的审查流程） |

### 细粒度权限

`ToolPermission` 支持两种形式：
1. 简单形式：`"allow"` — 统一设置
2. 细粒度形式：`{ "*.md": "allow", "*.js": "ask" }` — 按路径模式设置

### 权限请求生命周期

1. OpenCode server 在工具执行前发送 `permission_request` SSE 事件
2. 客户端展示权限卡片，显示工具名、命令/文件路径、元数据
3. 用户选择 `'once'` / `'always'` / `'session'` / `'reject'`
4. 客户端发送 `respondToPermission(requestID, reply, message?)` 到 server；service 边界会把本地 `session` 映射为 OpenCode wire value `always`
5. `'always'` 响应会将对应 patterns 加入自动批准列表
6. `'session'` 只在插件本地记录当前 `sessionID` 的 approval，并在 SDK 边界按 OpenCode 支持的协议发送 `'always'`

## 关键方法

无运行时方法，仅类型导出。源码约 100 行。

## 数据流

1. OpenCode server → `permission_request` SSE → 客户端解析为 `PermissionRequest`
2. UI 渲染权限卡片 → 用户操作
3. 构建 `PermissionReplyInput` → 发送到 server
4. server 执行或拒绝工具调用

## 与其他模块的交互

- **OpenCodeService**: `getPendingPermissions()`, `respondToPermission()` — 权限请求的 CRUD
- **OpenCodianView**: 渲染权限卡片、收集用户响应
- **OpencodeConfigManager**: 读写 `permission` 字段
- **BlocklistChecker**: 在权限审批流程中检查命令黑名单
- **Settings**: `settings.permissionMode` 控制全局权限策略

## 配置项

| 设置 | 默认值 | 说明 |
|------|--------|------|
| `settings.permissionMode` | `'yolo'` | 全局权限模式 |
| `.opencode/opencode.json` → `permission` | — | OpenCode 原生权限配置 |
| `settings.autoRestartOnPermissionChange` | `false` | 权限变更后是否自动重启 server |

### 权限配置示例

```json
{
  "permission": {
    "*": "ask",
    "read": "allow",
    "bash": { "*": "ask", "ls": "allow" },
    "edit": "ask"
  }
}
```

或简写：
```json
{
  "permission": "allow"
}
```

## 注意事项

- `OpencodeConfig` 类型在此文件中通过 `type OpencodeConfig = BaseOpencodeConfig` 重导出，供交叉引用使用
- `ToolPermission` 支持 `Record<string, PermissionAction>` 形式，允许按文件路径/模式设置不同权限
- `PermissionRequest.always` 字段包含可自动批准的 patterns，`'always'` 响应应参考此列表
- `PermissionReply.session` 不是 OpenCode SDK 原生值；`OpenCodeQuestionPermissionHub` 会在 SDK / legacy HTTP 边界映射成 `'always'`，本地 tracker 只负责会话内临时记忆
- `PermissionRequest.tool` 字段可选，仅在工具调用触发的权限请求中存在（含 `messageID` 和 `callID`）
- `PermissionSettings.useProjectConfig` 控制是否使用项目级配置文件的权限设置

## PermissionRequest 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 请求唯一 ID |
| `sessionID` | `string` | 所属会话 ID |
| `permission` | `string` | 权限类型（工具名） |
| `patterns` | `string[]` | 请求的模式列表 |
| `metadata` | `Record<string, unknown>` | 额外元数据 |
| `always` | `string[]` | 可自动批准的模式 |
| `tool?` | `{ messageID, callID }` | 工具调用信息 |
