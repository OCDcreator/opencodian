# ZCodeModelSelectionBinding

> 源码: src/features/chat/services/ZCodeModelSelectionBinding.ts

> 2026-09-24 (票 06)：ZCode 专属模型选择策略绑定（与 Pi 绑定同模式，宿主不变）。

## 职责

包裹 `ModelSelectionRuntimeHost`：`loadModelCatalogData` 以 **ZCode 实时目录**按 provider 分组喂选择器（每模型自带 reasoning 档位 variants）；目录未观测到时如实给空（**不伪造镜像**）；`getDefaultModelSelection` 按原生会话读回保存当前模型，不借用持久化默认冒充有效模型；`isModelAvailableOnServer` 按缓存 providers 判定。装配于 ChatSelectionControlsCoordinator，仅在后端为 zcode 时接管。新建 deferred 会话在首轮发送前可能无法 `session/read`，此时保留 `session/create` 已给的原生目录和当前模型，不让该读失败中断绑定。

## 验证

装配路径与语义由 adapter 层 ZCodeAdapter.models.test.ts 覆盖（目录捕获、校验、边界）；`ZCodeModelSelectionBinding.test.ts` 覆盖 deferred 会话读失败时仍使用 create 快照模型。
