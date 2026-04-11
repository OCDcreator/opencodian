# Context Path Helpers

> **源码**: `src/shared/contextPath.ts`
> **状态**: [REVIEW]

## 概述

`contextPath.ts` 收口 Obsidian context 文件路径在不同宿主平台之间的规范化逻辑，避免 `OpenCodeService` 和 `obsidianContext` 直接依赖当前 Node.js 进程的 `path` 风格。

本模块主要解决一个跨平台细节：macOS/Linux 测试或运行环境里也会处理 Windows vault 路径（例如 `C:\vault`），因此 Windows drive path、`file:///C:/...` URL、vault-relative attachment path 都必须按“路径自身的风格”解析，而不能按当前宿主 OS 解析。

## 导入关系

上游: Node `path`
下游: `src/shared/obsidianContext.ts`, `src/core/opencode/OpenCodeService.ts`, 单元测试

## 核心逻辑

### 路径规范化

- `normalizeContextPath(pathValue)` 把反斜杠统一成正斜杠，并对 Windows drive path 使用 `path.win32.normalize()`。
- `isAbsoluteContextPath(pathValue)` 识别 Windows drive absolute path 与 POSIX absolute path。
- `resolveContextPath(pathValue, vaultPath?)` 在 `pathValue` 为相对路径时按 `vaultPath` 的风格解析；Windows vault 在 macOS 上仍会解析为 `C:/vault/...`。

### 附件路径还原

`normalizeContextAttachmentPath(filePath, vaultPath?)` 会：

1. 先把输入文件路径归一成正斜杠形式
2. 如果 `filePath` 和 `vaultPath` 属于同一 Windows/POSIX 风格且文件在 vault 内，则返回 vault-relative path
3. 否则保留规范化后的原路径

### file URL 互转

- `pathToContextFileUrl(pathValue)` 把规范化路径转换成 `file:///` URL，并保持 Windows drive URL 为 `file:///C:/...`。
- `contextPathFromFileUrl(fileUrl)` 从 `file:///` URL 还原路径，能把 `file:///C:/vault/a.md` 的 URL pathname `/C:/vault/a.md` 还原成 `C:/vault/a.md`。

## 关键方法

| 方法 | 说明 |
|------|------|
| `normalizeContextPath(pathValue)` | 路径风格感知的正斜杠规范化 |
| `isAbsoluteContextPath(pathValue)` | 判断 Windows/POSIX 绝对路径 |
| `resolveContextPath(pathValue, vaultPath?)` | 以 vault path 为根解析 context 相对路径 |
| `normalizeContextAttachmentPath(filePath, vaultPath?)` | 把 OpenCode 持久化路径还原为 UI 可用的附件路径 |
| `pathToContextFileUrl(pathValue)` | 构建跨平台稳定的 `file:///` URL |
| `contextPathFromFileUrl(fileUrl)` | 从 `file:///` URL 还原跨平台路径 |

## 注意事项

- 这个模块只处理文件路径字符串，不检查文件是否真实存在。
- Windows drive path 在内部统一展示为 `C:/...`，用于对齐 OpenCode `directory` scope 与 context file URL。
- 不要在 `OpenCodeService` 里重新使用宿主平台 `path.resolve()` / `path.relative()` 处理 vault context 路径；需要时扩展本模块。
