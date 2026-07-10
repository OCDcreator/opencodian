# OpenCodeCapabilitySettingsMigration

> **源码**: `src/core/opencode/OpenCodeCapabilitySettingsMigration.ts`
> **状态**: [REVIEW]

## 概述

Versioned settings envelope for OpenCode capability preferences and experimental gates. Provides pure normalization and migration functions that auto-map safe legacy fields, retain valid fields, and preserve raw backups for impossible mappings. Never persists secrets, tokens, or raw server payloads.

## 核心逻辑

- `OpenCodeCapabilitySettings` 包含 `schemaVersion`（当前为 1）、`experimentalGates`（string-keyed boolean map）、`preferences`（string-keyed string map）、可选 `migrationReport`。
- `normalizeOpenCodeCapabilitySettings(value)` 把未知输入归一化为默认 envelope（schemaVersion=1，空 gates/preferences）；只保留 schemaVersion 1。
- `migrateOpenCodeCapabilitySettings(raw, now)` 返回 `{ normalized, report, requiresBackup }`：
  - 安全迁移：string `'true'`/`'false'` → boolean（outcome `migrated`）。
  - 保留：已是正确类型的值（outcome `retained`）。
  - 不可能映射：嵌套对象出现在需要 boolean 的位置 → outcome `impossible`，`requiresBackup: true`，reason 字符串，原始值不写入 report。
  - 幂等：对已归一化的 envelope 再次迁移不产生 `migrated` entry。
- 安全脱敏：任何看起来像 credential/key/token 的字段或值都被剥离并记为 `impossible`，绝不写入 report。

## 与其他模块的交互

- `src/core/types/settings.ts`：`OpenCodianSettings` 新增可选 `opencodeCapabilities` 字段。
- `src/core/storage/StorageService.ts`：`snapshotRawCapabilitySettings(raw)` 在不可映射时把未修改原始值写入备份路径。
- `src/main.ts`：`loadSettings()` 后调用 `migrateOpenCodeCapabilitySettingsEnvelope()`，迁移后展示 startup notice（不含原始备份内容）。
