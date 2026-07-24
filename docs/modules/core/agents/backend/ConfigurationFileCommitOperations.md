# ConfigurationFileCommitOperations

> **源码**: `src/core/agents/backend/ConfigurationFileCommitOperations.ts`
> **状态**: [ACTIVE]

## 概述

`ConfigurationFileCommitOperations` 是配置文件**最终提交 syscall 的窄隔离层**。它只包装 Node 的 `rename`、`link` 与 `unlink`，不决定路径是否安全、不比较 revision、不归档、也不把任何错误改写为业务结果。

高风险安全策略全部由 `ProjectResourceSecureWrite` 保持为唯一 owner：它先执行 allowlist / realpath confinement、归档、`FileRevision` 与私有 `dev`/`ino` 身份校验，再在最终提交点调用本模块。这个分界使公共 `safeWriteFile` / `safeDeleteFile` / `safeRestoreFile` 可以在不 mock Node core module 的情况下，针对真实提交边界注入外部文件修改并回归验证。

## 核心导出

| 导出 | 说明 |
|---|---|
| `renameFileAtCommit(sourcePath, targetPath)` | 对已准备文件或预期 target 执行单次真实 `rename`。 |
| `linkFileAtCommit(sourcePath, targetPath)` | 对同文件系统路径执行单次真实 `link`；调用方据 `EEXIST` 实现 create-if-absent。 |
| `unlinkFileAtCommit(targetPath)` | 对已 identity-verified 的 claimed file 执行单次真实 `unlink`。 |

## 不变量

- 不接受配置对象、allowlist、revision、archive 或 UI 参数；它不是第二个安全策略层。
- 不吞掉 `EEXIST`、`ENOENT` 或 I/O 错误；上层必须据真实 errno 决定 `conflict`、恢复或 `write-failed`。
- 新增提交 syscall 必须优先放在这里，再由 `ProjectResourceSecureWrite` 编排；不得在资源发现器或设置 UI 中直接写入配置文件。
- 测试可 spy 本模块导出，但必须仍然通过公开 `safe*` API 断言用户可见结果和磁盘 bytes，不能把 facade spy 当作业务断言。
