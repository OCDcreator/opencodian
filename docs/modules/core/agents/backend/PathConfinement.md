# PathConfinement

> **源码**: `src/core/agents/backend/PathConfinement.ts`
> **状态**: [ACTIVE]

## 概述

`PathConfinement` 是配置完整性工作的**单一共享 symlink-aware parent-walk confinement owner**（见 `docs/adr/0001`）。它消除了三处各自实现 parent-walk（`ProjectResourceSecureWrite.assertWithinRoot` / `resolveCanonicalTargetWithinRoot` 与 `ConfigurationArchiveService.confinedPath`）的算法漂移，统一了安全契约：

- 缺失组件（**仅 ENOENT**）锚定到最近已验证祖先（create 安全）
- 任何其他 lstat/realpath 错误（EACCES/EIO/...）**fail closed**（抛 `PathConfinementError`），绝不静默当“缺失”
- 解析后逃出 anchor root 的 symlink **fail closed**
- 未解析的 symlink **fail closed**

各调用方保留各自的 domain-error 映射、lexical-escape 检查与 root-resolution 策略（如 archive 允许 root 不存在），只把 walk 算法委托给本 owner。

## 核心导出

| 导出 | 说明 |
|------|------|
| `PathConfinementError` | escape / 不可读 / symlink 未解析时抛出 |
| `isENOENTError(err)` | 仅识别 ENOENT（其余 fail closed） |
| `isWithinRoot(root, candidate)` | 词法包含校验（含 root 本身） |
| `resolveAnchorRealpath(rootPath)` | anchor root realpath；ENOENT→词法回退；其余错误抛出（archive 允许 root 尚不存在） |
| `confinedComponentWalk(realRoot, components)` | 共享 parent-walk；返回受限 canonical 路径，失败抛 `PathConfinementError` |

## 注意事项

- 这是唯一的 confinement walk 算法 owner；新增 confinement 场景必须复用本模块，不得再起平行实现。
- 调用方负责 root 解析与 domain error 映射（`assertWithinRoot`→`ProjectResourceError`，archive→`ArchiveIntegrityError`，allowlist→null）。
- relative path 由调用方从**词法** root 计算，walk 从 **real** root 下行（保证 macOS `/var -> /private/var` 等根级 symlink 下一致）。
