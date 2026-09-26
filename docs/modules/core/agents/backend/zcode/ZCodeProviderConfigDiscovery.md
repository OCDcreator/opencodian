# ZCodeProviderConfigDiscovery

> 2026-09-22（核查修复）：改为官方成对注入契约——`ZCODE_BUILTIN_PROVIDER_CONFIG_FILE` + `ZCODE_PERSONAL_PROVIDER_CONFIG_FILE` **必须同时提供**（运行时对只给一半直接抛错）。builtin 按「解析入口锚定（`<resources>/glm/` → `<resources>/config/provider/zcode-builtin.json`）→ 各平台安装根 → 显式 env」发现并只读校验（打包安装里运行时自查找的两个候选路径均不存在，这是「无法定位 CLI ZCode Built-in Provider Config」的根因）；personal 路径指向运行时自管的 `<dataBaseDir>/.zcode/v2/provider_config.json`（缺失=合法首跑态）。builtin 缺失或文件坏时**不注入半对**，给可操作诊断。`ZCODE_STORAGE_DIR` 注入不变。\n\n> 2026-09-22（二轮核查修复）：provider 计数改读正式 schema `config.providerConfigRules.providerRules`，不识别形状返回 null（UI 显示「数量不可用」，未知绝不伪造为 0）；builtin 校验拆开读取失败（unreadable）与解析失败（malformed），两者均可达。

> 源码: src/core/agents/backend/zcode/ZCodeProviderConfigDiscovery.ts

## 职责

发现并校验官方 ZCode 运行时启动所需的 provider 配置。数据根解析与官方运行时一致：`ZCODE_STORAGE_DIR` 优先，否则 `~/.zcode`（beta 渠道 `~/.zcode-beta`，由 `ZCODE_BETA=1` 或 `ZCODE_ENV=beta` 判定）；配置文件为 `<data-root>/cli/config.json`。跨平台发现而非硬编码机器路径。

状态四类：validated（JSON 对象并统计 provider 数；无 provider 节也如实报告 null）/ missing / unreadable / malformed，非 validated 均带可操作诊断。产出 `env`（`ZCODE_STORAGE_DIR`）供自有 app-server 进程启动注入。**只读契约：绝不创建、修复或改写用户配置**。

## 验证

tests/unit/core/agents/backend/ZCodeProviderConfigDiscovery.test.ts：根解析（env 覆盖/beta/默认）、四类状态、provider 计数、env 注入、Windows 路径语义。
