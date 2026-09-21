# EnvironmentVariablesModal

> **源码**: `src/features/settings/EnvironmentVariablesModal.ts`
> **状态**: [REVIEW]

## 概述

R-F7（advantage-parity）每供应商环境变量分域编辑器。共享区（全部后端生效）与供应商域区（下拉选既有 providers 键或手输新键 + 同款键/值行编辑、逐行删除、整域删除）。编辑在草稿状态上进行，每次变更经 `normalizeEnvironmentVariablesDomains` 归一化后写回 `settings.environmentVariables` 并走常规 `saveSettings` 路径；指纹失效 Notice 由 main.ts 在下一次 load/save 时触发。

窄结构化 host port（`EnvironmentVariablesModalHost`：`app` / `settings` / `saveSettings`），不 import 应用层；行样式见 `src/style/components/environment-variables-modal.css`。
