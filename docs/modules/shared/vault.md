# Vault 工具函数

> **源码**: `src/shared/vault.ts`
> **状态**: [REVIEW]

## 概述

提供 Vault 相关的工具函数。当前仅包含 `getVaultBasePath()`，通过类型断言访问 Obsidian `VaultAdapter` 的 `basePath` 属性，获取 vault 的文件系统绝对路径。现在它还会容忍 `app.vault` 或 `adapter` 缺失的测试 / mock 场景，直接回退 `null`，避免启动日志和诊断路径在单元测试里提前抛错。

## 导入关系
上游: `obsidian` (App)
下游: `OpenCodianView`, `ServerManager`, `OpenCodeService` 等需要 vault 路径的模块

## 核心类型 / 接口

无独立类型定义。

## 核心逻辑

### getVaultBasePath(app)

```typescript
function getVaultBasePath(app: App): string | null {
  return (app.vault?.adapter as unknown as { basePath?: string } | undefined)?.basePath ?? null;
}
```

通过双重类型断言（`as unknown as`）访问 `FileSystemAdapter` 的内部 `basePath` 属性。此属性在桌面端存在，移动端不存在。

## 关键方法

| 方法 | 说明 |
|------|------|
| `getVaultBasePath(app)` | 获取 vault 文件系统绝对路径 |

## 数据流

```
调用方 → getVaultBasePath(app)
  → app.vault.adapter.basePath
  → "/Users/user/my-vault" 或 null
```

## 与其他模块的交互

- **ServerManager**: 获取 vault 路径用于设置 OpenCode server 的工作目录
- **OpenCodeService**: 在构建 API URL 时可能使用 vault 路径
- **OpenCodianView**: 在需要文件系统路径的场景调用

## 配置项

无

## 注意事项

- 使用了类型断言访问未公开的 API，未来 Obsidian 版本可能破坏
- `app.vault` / `adapter` 缺失时会返回 `null`；调用方不能假定这里一定有值
- 移动端 Obsidian 不支持文件系统路径，返回 `null`
- 仅适用于桌面端 Obsidian（与 AGENTS.md 中 "Desktop only" 要求一致）

