# SettingsSecretsKeychain

> **源码**: `src/core/storage/SettingsSecretsKeychain.ts`
> **状态**: [REVIEW]

## 概述

R-D2（advantage-parity）的密钥钥匙串模块：把设置中的敏感值（服务器认证、codex/pi 后端密钥、自定义供应商密钥、图片生成模型密钥、远程控制令牌）迁入 Obsidian 的 `app.secretStorage`（OS 钥匙串面，1.11.4+；经参考插件核实为唯一 API 面——`app.keychain` 不存在，本仓库 obsidian.d.ts 已收 `SecretStorage` 型）。继承 Copilot 的能力但保持本地优先：**运行时设置对象始终持有真实值**（所有既有消费方零改动），只有持久化的 core profile 在保存边界把真实值换成 `opencodian-keychain:v1:<key>` 占位符、在加载边界换回。

## 对外 API

```typescript
interface SettingsSecretStorage { setSecret(id, value): Promise<void>; getSecret(id): Promise<string | null>; }

class SettingsSecretsKeychain {
  static forApp(app: App, vaultPath: string): SettingsSecretsKeychain; // 探测 app.secretStorage
  scrubForPersistence(core, { enabled }): Promise<core'>;   // 保存侧：真实值 → 占位符（先写钥匙串）
  resolveAfterLoad(core): Promise<core'>;                    // 加载侧：占位符 → 真实值；明文一次性迁移
  takePendingLoadReport(): SettingsSecretsLoadReport | null; // 供应用层诚实提示
  isAvailable(): boolean;
  peekSecret(keychainKey): Promise<string | null>;           // 测试/诊断缝
}
// 纯函数
buildSecretPlaceholder(keychainKey): string;
parseSecretPlaceholder(value): string | null;
buildSecretId(vaultHash, keychainKey): string;  // SecretStorage id：[a-z0-9-] ≤64，oc<hash8>- 前缀
```

## 不变量

- **保存侧 fail-open**（对持久化而言）：钥匙串写失败保留明文继续落盘——凭证永不因钥匙串故障丢失；**输入对象永不 mutate**（深拷贝被触碰子对象）。
- **加载侧一次性迁移**：明文 → `setSecret` + 占位符（migrated 报告）；占位符 → `getSecret` 还原；条目缺失/宿主无 secretStorage → 字段置空 + unresolved 报告（fail-closed，不伪造）。
- **回滚**：`secretsKeychainEnabled`（默认 true）为显式开关；关闭后下一次持久化把真实值写回 `settings.core.json`。
- **vault 分域 + id 合规**：id = `oc<hash8(vaultPath)>-<slug>`，满足 SecretStorage 的 `^[a-z0-9-]+$` ≤64 约束；不同库互不可读；超长 slug 截断 + 哈希尾消歧。
- **冗余写跳过**：`lastWritten` 缓存使相同值重复保存不产生钥匙串写。
- **数组条目按稳定 id 定键**（`providers.<id>.apiKey`、`imageGenerationModels.<id>.apiKey`），重排不错位；无 id 的遗留行退化为索引键（现行 schema 两类数组均带 id）。
- **locale 纪律**：core 不 import i18n；用户提示经 `takePendingLoadReport` 由 main.ts 本地化。

## 关联模块

- `src/core/storage/StorageService.ts`：`saveCoreSettings`（scrub）/`loadPersistedSettings`（resolve）两个挂点 + 报告透传。
- `src/core/runtime/OpenCodianSettingsRuntimeCoordinator.ts`：persist 时穿 `secretsKeychainEnabled` 旗标。
- `src/features/settings/SettingsPanelChrome.ts`：设置行 `renderSecretsKeychainSetting`（模态与编辑区两个设置面共用）。
