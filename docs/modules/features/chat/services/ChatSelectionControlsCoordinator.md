# ChatSelectionControlsCoordinator

> **源码**: `src/features/chat/services/ChatSelectionControlsCoordinator.ts`
> **状态**: [REVIEW]

## 概述

`ChatSelectionControlsCoordinator` 承接聊天输入工具栏里 permission / model selector 的 UI lifecycle。model selector 的目录缓存、requested/current/resolved selection 解析、active-tab override 写回与 unavailable follow-up ownership 委托给 `ModelSelectionRuntime`；permission selector 的 trigger、option list、open/close 与 mode writeback 下沉到 `PermissionModeSelectorCoordinator`，并在每次 `build()` 时按 active backend 创建 OpenCode、Claude Code 或 Codex 版本。

它负责：

- 通过 `ModelSelectionRuntime` 加载并缓存 model catalog bundle / available providers，维护 requested/current/resolved model selection
- 创建 toolbar 内的 permission / model selector 容器，并把 permission 容器交给 `PermissionModeSelectorCoordinator`
- 在 permission selector 旁集成 Claude Code additional directories configured-scope badge，用于显示额外目录请求状态
- 在 permission selector 旁集成 sandbox badge 容器（仅 Claude Code backend），用于显示 Claude Code sandbox 配置摘要
- 在 permission selector 旁集成 Codex runtime defaults badge 容器（仅 Codex backend），用于显示网络、网页搜索与额外目录等非默认 Codex 运行默认项
- 维护 model selector 的搜索、keyboard navigation、sticky header cleanup 与 provider icon 刷新
- 统一更新当前模型显示、unavailable / unconfigured class、switch-model override 写回结果、unavailable notice 文案与 effort selector 连动；trigger tooltip 明确这是当前标签的发送覆盖，不是持久化 `ConversationSessionSettings`
- 委托 `PermissionModeSelectorCoordinator` 维护 permission selector 的 mode label、selected state 与 dropdown open/close lifecycle
- 通过共享 escape handler 收束两个 selector 的关闭行为

## 公开接口

```typescript
export interface ChatSelectionControlsCoordinatorHost extends ModelSelectionRuntimeHost {
  registerEscapeHandler(handler: () => boolean): void;
  resolveProviderIconUrl(providerId: string): Promise<string | null>;
  updateEffortSelectorDisplay(): void;
  getPermissionMode(): PermissionMode;
  switchPermissionMode(mode: PermissionMode): Promise<void>;
}

export class ChatSelectionControlsCoordinator {
  build(toolbarEl: HTMLElement): void;
  reloadModelCatalog(): Promise<void>;
  hasLoadedModelCatalog(): boolean;
  getAvailableProviders(): readonly ModelSelectorProvider[];
  getCurrentSessionModel(): ModelSelectorSelection | null;
  getCurrentSessionModelResolution(): ResolvedModelSelection;
  findKnownModelInfo(selection: ModelSelectorSelection | null): ModelSelectorKnownModelInfo | null;
  formatModelId(model: Partial<ModelSelectorSelection> | null | undefined): string | undefined;
  ensureSelectedModelAvailable(provider: string | undefined, model: string | undefined): Promise<boolean>;
  getModelUnavailableNoticeContent(): { title: string; message: string };
  refreshModelOptions(): void;
  updateModelSelectorDisplay(): void;
  updatePermissionTriggerDisplay(): void;
  applyLocaleTexts(): void;
  destroy(): void;
}
```

## 关键行为

- `build()` 一次性挂载 model selector，并通过 `buildBackendPermissionSelector()` 按当前 active backend 创建 permission selector；selector 不再在 constructor 中固定创建，避免 backend hot-switch 后保留错误的 option set / host seam
- `buildBackendPermissionSelector()` 在 build time 选择 backend-appropriate config：OpenCode 使用 host 的 `getPermissionMode()` / `switchPermissionMode()`，Claude Code 则由本 coordinator 读取 live plugin 的 `backendSettings.claudeCode.permissionMode`，写回设置并调用 `adapter.setPermissionMode()`；Codex 则读取 `backendSettings.codex.sandboxMode`，写回设置并调用 `adapter.updateSandboxMode()`。三种路径均避免把 backend-specific ownership 回灌到 guarded `OpenCodianView.ts`
- `build()` 仍通过 `syncAdditionalDirectoriesBadge()` / `syncSandboxBadge()` / `syncCodexRuntimeDefaultsBadge()` 根据 active backend 决定是否挂载对应的只读配置 badge
- `reloadModelCatalog()` 触发 runtime data reload，重建 available provider/model cache，并同步 active-tab context-usage identity
- `getCurrentSessionModel()` / `getCurrentSessionModelResolution()` 通过 `ModelSelectionRuntime` 完成 requested/current/resolved selection 推导，不再要求 view 直接维护 catalog 分支
- `ensureSelectedModelAvailable()` / `getModelUnavailableNoticeContent()` 把 send 前 availability follow-up 与 notice copy 判定委托到 selection runtime
- `refreshModelOptions()` / `updateModelSelectorDisplay()` 把 list 渲染、trigger/icon 刷新与 unavailable/unconfigured state 收束到同一个 owner
- `updatePermissionTriggerDisplay()` / `applyLocaleTexts()` 继续作为 view-facing 入口，但 permission mode 文案与 selected state 刷新会委托给当前 build 创建的 `PermissionModeSelectorCoordinator`；同时通过配置 badge 同步入口确保 Claude Code additional directories / sandbox badge 与 Codex runtime defaults badge 在 backend hot-switch 后同步显示/隐藏
- additional directories badge 通过 `syncAdditionalDirectoriesBadge()` 在每次刷新时重新读取 active backend 和 `backendSettings.claudeCode.additionalDirectories`：仅 Claude Code backend 且存在非空目录时显示，其他 backend 或空配置会自动移除。该 badge 只表示 "requested extra directory scope" 会传给下一次 query，不验证 CLI 是否解析或实际访问这些路径。
- sandbox badge 通过 `syncSandboxBadge()` 在每次刷新时重新读取 active backend：仅 Claude Code backend 显示 badge，其他 backend 自动移除。该检查在 `build()`、`updatePermissionTriggerDisplay()` 和 `applyLocaleTexts()` 三个入口都会执行，确保同一活跃界面内 backend 切换后 badge 状态立即正确。badge 用于反映 expanded sandbox 设置（命令例外、filesystem/network 子策略和 ripgrep override）的当前状态。
- Codex runtime defaults badge 通过 `syncCodexRuntimeDefaultsBadge()` 在每次刷新时重新读取 active backend：仅 Codex backend 且存在网络访问启用、网页搜索非默认或额外目录非空时保留容器并渲染芯片；quiet defaults 会移除空容器，避免 toolbar 留下不可见占位或后续渲染到已移除节点。该 badge 是只读提示，不验证 Codex CLI 是否按配置执行。
- model dropdown 的 outside-click listener 使用 capture 阶段注册，确保点击其他 toolbar dropdown trigger 时当前 dropdown 能被正确关闭
- model selector trigger 现在携带 `role="button"`、`tabindex="0"`、`aria-haspopup="listbox"` 与 `aria-expanded`，dropdown 打开/关闭时同步更新这些属性并添加/移除 `is-open` 类以触发 CSS 动画
- `destroy()` 关闭 dropdown、移除 document click listener，并释放 sticky header cleanup

## 与 `OpenCodianView` 的边界

- `OpenCodianView` 现在只提供 model catalog data source、tab override writeback、model-source mode / server availability 查询、provider icon service 调用和 OpenCode permission-mode settings writeback。Claude Code permission-mode live switch 由本 coordinator 的 live plugin seam 处理；Codex sandbox-mode live switch 同理由本 coordinator 通过 `readCodexSandboxModeFromPlugin()` / `switchCodexSandboxModeInPlugin()` 处理。
- model dropdown/search/list/selection display lifecycle 仍集中在 `ChatSelectionControlsCoordinator`；model catalog cache、selection resolution、switch-model notice 与 unavailable follow-up 已进一步收束到 `ModelSelectionRuntime`
- 当前聊天模型选择写入 active-tab `modelOverride`，用于当前标签后续发送；不要把它描述为会话设置弹窗里的持久化 session setting。
- permission dropdown lifecycle 由 build-time `PermissionModeSelectorCoordinator` 承接，并仍通过 shared Escape handler 与 model dropdown 一起关闭
- send pipeline options、`ModelCatalogStateService`、provider availability 语义与 icon fallback 顺序没有变化
- 该模块刻意不接管 context usage、effort selector 或 input glass/theme；这些仍在相邻 owner 中维护
