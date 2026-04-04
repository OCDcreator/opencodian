# Tool Name Constants

> **源码**: `src/core/tools/toolNames.ts`
> **状态**: [DRAFT]

## 概述

定义 OpenCode 工具名称的常量映射表。这些常量在流式渲染、工具调用 UI、权限检查等模块中用于标识和匹配具体的工具类型。使用 `as const` 确保类型窄化。

## 导入关系

上游: 无依赖
下游:
- `src/core/types/tools.ts`（重复定义，待合并）
- `src/utils/streaming/ToolCallRenderer.ts`
- `src/features/chat/OpenCodianView.ts`
- `src/core/security/BlocklistChecker.ts`（间接，通过工具名判断是否需要命令检查）

## 核心类型 / 接口

| 类型 | 说明 |
|------|------|
| `TOOL_NAMES` | `as const` 对象，包含 14 个工具名常量 |
| `ToolName` | 所有工具名字符串的联合类型 |

## 核心逻辑

### 工具名称映射

| 常量 | 值 | 说明 |
|------|----|------|
| `READ` | `'Read'` | 文件读取 |
| `WRITE` | `'Write'` | 文件写入 |
| `EDIT` | `'Edit'` | 文件编辑 |
| `BASH` | `'Bash'` | Shell 命令执行 |
| `GLOB` | `'Glob'` | 文件模式匹配搜索 |
| `GREP` | `'Grep'` | 内容搜索 |
| `VIEW` | `'View'` | 文件查看 |
| `LS` | `'LS'` | 目录列表 |
| `ASK_USER` | `'AskUser'` | 向用户提问 |
| `ENTER_PLAN_MODE` | `'EnterPlanMode'` | 进入计划模式 |
| `EXIT_PLAN_MODE` | `'ExitPlanMode'` | 退出计划模式 |
| `TASK` | `'Task'` | 子任务派发 |
| `WEB_SEARCH` | `'WebSearch'` | 网络搜索 |
| `WEB_FETCH` | `'WebFetch'` | 网页抓取 |

## 关键方法

无运行时方法，仅导出常量和类型。

## 数据流

1. OpenCode server 发送 `tool_use` SSE 事件（含 `name` 字段）
2. 客户端将 `name` 与 `TOOL_NAMES` 常量比较
3. 匹配到 `BASH` → 触发黑名单检查和权限审批
4. `ToolCallRenderer` 根据工具名选择渲染模板

## 与其他模块的交互

- **ToolCallRenderer**: 使用工具名决定工具调用的 UI 展示样式
- **BlocklistChecker**: 对 `BASH` 工具执行命令黑名单检查
- **PermissionTypes**: 工具名与权限配置中的 key 对应（如 `bash`, `edit`, `read`）
- **StreamChunk**: `tool_use` 类型的 `name` 字段携带工具名

## 配置项

无，工具名称由 OpenCode server 定义。

## 注意事项

- `src/core/types/tools.ts` 中有重复定义的 `TOOL_NAMES` 和 `ToolName`，两个模块都导出了相同的常量。消费方应统一从一处导入，后续考虑合并去重。
- 工具名大小写敏感（如 `'LS'` 全大写，其余首字母大写）

## 待补充
- [ ] 合并 `src/core/tools/toolNames.ts` 和 `src/core/types/tools.ts` 中的重复定义
- [ ] 记录 OpenCode server 端工具注册机制
- [ ] 补充新增工具时的更新清单
