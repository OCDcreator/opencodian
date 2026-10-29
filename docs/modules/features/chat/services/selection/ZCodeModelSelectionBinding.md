# ZCodeModelSelectionBinding

2026-10-29：无 sessionId 时调用 adapter 的工作区原生目录，并用其中读回的默认模型初始化选择器；有 sessionId 时维持原会话读回，工作区默认值不覆盖会话选择。切换 ZCode 后模型按钮及提供商目录可直接显示，不再依赖先建聊天或发送。

> 源码: src/features/chat/services/selection/ZCodeModelSelectionBinding.ts

> 2026-09-24 (票 06)：ZCode 专属模型选择策略绑定（与 Pi 绑定同模式，宿主不变）。

## 职责

包裹 `ModelSelectionRuntimeHost`：`loadModelCatalogData` 以 **ZCode 实时目录**按 provider 分组喂选择器（每模型自带 reasoning 档位 variants）；目录未观测到时如实给空（**不伪造镜像**）；`getDefaultModelSelection` 按原生会话读回保存当前模型，不借用持久化默认冒充有效模型；`isModelAvailableOnServer` 按缓存 providers 判定。装配于 ChatSelectionControlsCoordinator，仅在后端为 zcode 时接管。新建 deferred 会话在首轮发送前可能无法 `session/read`，此时保留 `session/create` 已给的原生目录和当前模型，不让该读失败中断绑定。

## 验证

装配路径与语义由 adapter 层 ZCodeAdapter.models.test.ts 覆盖（目录捕获、校验、边界）；`ZCodeModelSelectionBinding.test.ts` 覆盖 deferred 会话读失败时仍使用 create 快照模型。


> 2026-10-08 ZCode selection: 会话级 model override 与每模型 reasoning override 经既有保存/归一化链持久化，null 档位继承 native 模型默认；view 重载与切会话分别回读，保存失败只回滚发起会话。保存值不代替 native options 生效证据。

## 目录定位（2026-10-23）

- 源码位置：`src/features/chat/services/selection/ZCodeModelSelectionBinding.ts`。
- 原位置：`src/features/chat/services/ZCodeModelSelectionBinding.ts`；文件名、导出接口与业务职责保持不变。
- 随目录调整更新的依赖：`src/features/chat/services/selection/ModelSelectionRuntime.ts`。
