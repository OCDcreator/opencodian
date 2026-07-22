# ModelPricingModal

> **源码**: `src/features/settings/ModelPricingModal.ts`
> **状态**: [REVIEW]

## 概述

`ModelPricingModal` 是三个 backend 共用的“成本估算与单价”管理弹窗。它把 models.dev 缓存刷新、per-provider/model 单价覆盖和已保存覆盖列表放在同一个地方，避免 OpenCode、Claude Code、Codex 各自维护会漂移的价格表。

## 交互

- 展示目录来源、最近刷新时间和有价格模型数量；目录首次使用和过期后自动刷新，也可显式刷新。
- 新增/编辑覆盖需填写 Provider ID 与模型 ID；可选 Base URL 与它们组成精确 third-party gateway 身份。输入、输出、缓存读取、缓存写入四类价格独立填写。
- 单价字段单位为 USD / 100 万 Token。空字段使用目录价；用户必须显式输入 `0` 才代表 0 单价。
- 未填覆盖时，后端返回的模型 ID 自动匹配 models.dev；输入 provider/model 时显示目录匹配提示，没有匹配时才需要用户填写完整本地价格。
- 覆盖可编辑或移除，保存后进入 `modelPricingOverrides` 并立即影响后续本地估算。

## 边界

弹窗始终说明 models.dev 是本地目录估算来源，绝不会改变供应商账单或订阅用量。OpenCode 后端已上报的 session cost 始终优先，Claude Code 与 Codex 仅显示 API 等价估算。
