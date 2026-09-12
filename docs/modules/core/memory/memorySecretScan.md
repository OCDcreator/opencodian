# Memory Secret Scan

> **源码**: `src/core/memory/memorySecretScan.ts`
> **状态**: [REVIEW]

## 概述

注入侧凭据扫描守卫（zmem 2026-08-20 评审孪生，逐字移植）：sk-/ghp_/gho_/xoxb-/AKIA 前缀、Bearer 头、credential 形赋值、长 hex/base64 blob。刻意保守——宁可漏报也不误伤正常散文；误报只体现为 lint 提示。命中密钥的 Topic File 整体不进入注入，磁盘文件不动。

## 关键导出

| 导出 | 说明 |
|------|------|
| `scanForSecrets(text)` | `{ hit, kinds[] }`；kind 为命中模式名（去重、按模式序） |
