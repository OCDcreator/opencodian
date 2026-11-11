# ModelSelectionRuntime

> **源码**: `src/features/chat/services/selection/ModelSelectionRuntime.ts`
> **状态**: [REVIEW]

## 概述

`ModelSelectionRuntime` 是 chat toolbar model selector 的 selection-state owner。它把 model catalog cache、active-tab requested/default selection、effective/base catalog resolution、server availability check、switch-model writeback 与 unavailable follow-up copy 从 `ChatSelectionControlsCoordinator` 的 DOM/dropdown lifecycle 中分离出来。

它负责：

- 加载 host 提供的 model catalog bundle 与 provider 列表，并生成 selector 可用的 provider/model snapshot
- 用 `catalogBundle.server` 的 provider/model 引用集合标记 `runtime` 与 `configured-only`；不依赖 `existsInServer` 字段
- 根据 active-tab override 与 default selection 推导 requested/current/resolved model
- 当 backend 只有轻量 provider snapshot、没有完整 `ModelCatalogBundle` 时，仍会用 snapshot 做 exact validation 与 fallback，避免旧 tab override 把未知 provider/model 直接送入发送管线
- 在 disabled model filtering 后保留 base catalog metadata，用于 unavailable/known model display
- 执行 send 前 server availability 验证，并根据 source mode 生成 unavailable follow-up 文案
- 通过 active-tab override seam 写回模型选择，并在成功时同步 context usage identity 与 switch notice

## 公开接口

```typescript
export interface ModelSelectionRuntimeHost {
  loadModelCatalogData(): Promise<{
    catalogBundle: ModelCatalogBundle | null;
    providers: readonly ModelSelectorProvider[];
  }>;
  getActiveTabModelOverride(): ModelSelectorSelection | null;
  setActiveTabModelOverride(selection: ModelSelectorSelection): boolean;
  getDefaultModelSelection(): ModelSelectorSelection | null;
  syncActiveTabContextUsageIdentity(): void;
  getModelSourceMode(): ModelSourceMode;
  isModelAvailableOnServer(provider: string, model: string): Promise<boolean>;
}

export interface ModelUnavailableNoticeContent {
  title: string;
  message: string;
}

export class ModelSelectionRuntime {
  reloadModelCatalog(): Promise<void>;
  reset(): void;
  hasLoadedModelCatalog(): boolean;
  getAvailableProviders(): readonly ModelSelectorProvider[];
  getCurrentSessionModel(): ModelSelectorSelection | null;
  getCurrentSessionModelResolution(): ResolvedModelSelection;
  findKnownModelInfo(selection: ModelSelectorSelection | null): ModelSelectorKnownModelInfo | null;
  formatModelId(model: Partial<ModelSelectorSelection> | null | undefined): string | undefined;
  ensureSelectedModelAvailable(provider: string | undefined, model: string | undefined): Promise<boolean>;
  getModelUnavailableNoticeContent(): ModelUnavailableNoticeContent;
  switchModel(provider: string, model: string, options?: { notify?: boolean }): boolean;
}
```

## 关键行为

- `reloadModelCatalog()` 只更新 model selection runtime snapshot；dropdown rerender 与 trigger/icon refresh 仍由 `ChatSelectionControlsCoordinator` 编排
- `getCurrentSessionModel()` 只在 runtime 可用子集内解析 requested override/default selection；默认值指向 configured-only 时回退到同 provider 的 runtime 模型或全局首个 runtime 模型
- selector provider snapshot 保留 configured-only 条目供 UI 展示，但内部 `availableModels` 只包含 runtime 条目
- `catalogBundle === null` 的 Claude Code 等轻量快照默认全部视为 runtime，保持跨 backend 兼容
- `getCurrentSessionModel()` 在无 bundle 的 snapshot 模式下只返回 snapshot 中已知的模型；若 requested model 不存在，会回退到同 provider 首个模型或首个可用模型
- `findKnownModelInfo()` 优先返回 currently available model metadata，找不到时回落到 base catalog metadata
- `ensureSelectedModelAvailable()` 保留原有 resolution gate 与 server availability fallback；在 snapshot 模式下会先验证 provider/model 是否存在于 snapshot，未知模型不会进入 server availability seam
- `switchModel()` 返回 active-tab override writeback 是否被 host 接受；成功时同步 context usage identity，并默认显示 switch notice。需要等待异步持久化的调用方可传 `notify: false`，自行在保存成功后提供事实性反馈

## 与 `ChatSelectionControlsCoordinator` 的边界

- `ModelSelectionRuntime` 不创建 DOM、不处理 dropdown/search/keyboard/sticky header，也不解析 provider icon
- `ChatSelectionControlsCoordinator` 继续负责 selector placement、list render、permission selector display 和 effort selector follow-up
- settings model catalog、provider icon fallback、send pipeline options 与 session override 语义保持在原有 owner / host seam 内

## Pi 严格选择

2026-09-08：新增可选 preserveRequestedModel。仅 Pi 绑定启用，保留不可用的原请求让发送门禁明确拒绝，不静默选择目录第一项。其他后端的默认解析和异步时序保持不变。

目录加载以递增 generation 归属当前请求；reset（控件重建/后端切换）和较新 refresh 都会使旧异步结果失效。旧结果不覆盖当前目录，也不更新当前 tab 的 context 身份。

## 会话作用域 catalog 契约（2026-11-10，已实现并冻结）

实际缺陷（工程师 8c43 现场诊断）：DSH ACP 新会话的默认模型（v4-flash）存在于权威目录 112 项中，但 runtime `hasLoaded` 的目录精确等于上一个会话（4888）的 111 项；无 override、无 disabled 过滤参与。发送前 server availability 校验因此在首次模型调用之前就拒绝新会话默认模型。

已冻结实现（diff SHA `eecfc522e97ea22c3afe3a9e064d0a757feffa4bfe9dac2120d8fd5f09a972f5`）：**`ModelSelectionRuntime` 无任何改动**，本页不声明新的 runtime 作用域实现。修复全部位于 `ChatSelectionControlsCoordinator`，仅复用本页既有通用契约：

- **既有通用契约不变，也是保护机制**：`reloadModelCatalog()` 的递增 load generation 归属当前请求——正是它保护已加载代际不被并发/迟到的旧异步加载覆盖；`reset()` 清空已加载状态。本 runtime 不感知会话作用域。
- Coordinator 侧作用域 fence：wrapDSH host 要求**显式自有会话**，无会话即发布空 providers；发布前后捕获 session / transport / adapter 对象，任一变化即改发空——绝不借用其他活跃会话/用户的目录。
- 每个 DSH 发送门（`ensureSelectedModelAvailable`）无条件触发既有 reload（读缓存 providers，无 RPC），dropdown 打开同理；由此新会话的第一门即重建成新目录。非 DSH 的空目录 guard 保持不变。
- **scope unknown ≠ actual unavailable**：fence 判定作用域已变后目录按 *unknown* 处理（发布空、不显示旧作用域列表）；只有当前作用域的权威应答才能得出 *unavailable*（CONTEXT.md 证据轴：跨作用域目录不是证据）。
- **strict availability 保留**：发送前校验仍按当前作用域权威目录拒绝未知模型；不放宽校验，无其他模型 workaround，无 UI/CSS 变化。

主线报告单元结果：新增 3 用例 RED→GREEN（共 8 用例），9 套件 191 通过，tsc/lint 0。ACP 实际模型验收已在 0427 完成并记录（`phase2-final-acceptance-0427` / `acceptance-0427.md`）：新会话默认 `deepseek-v4-flash` 经普通 Send 一次真实回显成功，发送门前 stale 111 项 unavailable → 门后自有 112 项 available，override 与 D0 不变。本页只声称该已记录案例；其他模型/分支的 live 行为不在本页验收范围内。

## 目录定位（2026-10-23）

- 源码位置：`src/features/chat/services/selection/ModelSelectionRuntime.ts`。
- 原位置：`src/features/chat/services/ModelSelectionRuntime.ts`；文件名、导出接口与业务职责保持不变。
