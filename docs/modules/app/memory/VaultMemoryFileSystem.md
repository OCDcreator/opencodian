# Vault Memory File System

> **源码**: `src/app/memory/VaultMemoryFileSystem.ts`
> **状态**: [REVIEW]

从 MemoryRuntimeCoordinator 拆出的真实 Vault 文件系统端口，供注入、清单、提取、反思及维护复用。读写经 Obsidian DataAdapter，listFiles 消费 ListedFiles.files 字符串并返回 basename；mtimeMs 通过 node fs 获取隐藏目录的真实时间。mkdir 会创建目标目录本身。

`validatePath` 从 Vault 根开始使用共享 PathConfinement 的 realpath/符号链接遍历，既校验记忆桶本身，也校验桶内目标；目录或文件链接逃逸会拒绝。文件系统端口不选择后端和模型，失败由调用方转为 fail-soft outcome。

Coordinator 保留原导出兼容，app/memory barrel 的公开面不变。测试使用 map-backed DataAdapter；真实符号链接边界另由 ExternalMemoryFileSystem 的真实文件系统测试覆盖。
