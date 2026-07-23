# ProjectResourceSecureWrite

> **源码**: `src/core/agents/backend/ProjectResourceSecureWrite.ts`
> **状态**: [ACTIVE]

## 概述

`ProjectResourceSecureWrite.ts` 集中隔离项目资源写入的高风险安全边界，供 Claude 与 Codex 的项目资源 discovery owner 共用：

- 名字安全校验（`isSafeResourceName`）
- 路径穿越 / 越根保护（`assertWithinRoot`，单一 chokepoint）
- 原子写（`atomicWriteFile`：临时文件 + rename，失败清理临时文件，绝不残留半成品）

全局资源（`~/.claude`、`~/.agents`、`~/.codex`）永不经过此处——它们严格只读。

## 导入关系

上游: Node `fs`、`fs/promises`、Node `path`
下游: `ClaudeProjectCommandDiscovery`、`ClaudeProjectSkillDiscovery`、`ClaudeProjectAgentDiscovery`、`backend/index`

## 核心导出

| 导出 | 说明 |
|------|------|
| `ProjectResourceWriteError` | 写失败原因联合类型（含 `not-found`） |
| `ProjectResourceError` | 携带 code 的 Error 子类 |
| `isSafeResourceName(name)` | 名字安全校验 |
| `assertWithinRoot(rootPath, targetPath)` | **async**；symlink-aware 安全 parent-walk：`realpath` 解析真实 root，逐组件 `lstat`，任一已有父路径为 symlink 且 real target 逃出真实 root 即拒绝（`path-traversal`）。覆盖 create（目标不存在时停在首个缺失组件，信任已验证父级）与 update/delete（目标存在则校验其 real path）。 |
| `atomicWriteFile(targetPath, content)` | 原子写 |
| `toWriteErrorCode(err)` | 把捕获异常归一为写错误 code |

## 注意事项

- 这是唯一的项目资源写入安全 chokepoint；新增资源类型写入必须复用本模块，不得另起重复实现。
- `assertWithinRoot` 为 **async**，所有 create/update/delete 调用点必须 `await`。
- 纯 `path.resolve` 词法检查**不能**防御父目录符号链接逃逸（如 `<vault>/.agents/skills/foo -> ~/.agents/skills/foo`）；本实现用 `realpath` + `lstat` parent-walk 才安全。
- Codex 的 `CodexProjectResourceDiscovery` 已收口到本共享实现，不再有平行弱实现。
