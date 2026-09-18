# R-C2 文生图 — 实施前设计

> 需求基准：`docs/requirements/flowtext-parity.md` §5 R-C2（约 :582-618）
> 共享约束：`docs/requirements/flowtext-parity-impl-plan.md` §1；需求文档 §6（尤其 §6.2 写路径扩展、§6.1 只读契约不削弱）
> 已裁决（不再重议）：本条引入插件**第一个写入用户内容区的二进制资产写路径**；资产写入与引用写入是两个独立写步骤，各自定义失败语义；不得把"唯一写路径 = `editor.replaceRange`"当作搪塞——本设计按需求定义其扩展。

---

## 1. 目标与范围

**目标**：支持配置文生图模型（供应商 + 模型 + 密钥，可多个）；在聊天与行内编辑两个入口发起"提示词 → 生成图片 → 落盘 → 插入引用"；插入支持独占一行（`![[文件名]]`）与行内环绕两种形态；默认显示宽度可设置。

**范围内**：

1. 文生图模型配置与生成 HTTP 客户端（openai images 兼容格式先行）。
2. 二进制资产落盘（附件目录、冲突编号、大小/超时上限）。
3. 引用插入（编辑器事务，含脏检查）与两种插入形态。
4. 生成资产纳入 R-B3 回退体系（可回退移除）。
5. §7 设置项：`imageGenerationModels`、`imageGenerationMaxWidth`（建议 600）；本设计补充一个行为说明性设置 `imageGenerationAssetCleanup`（见 §4.6）。

**明确不做（§11 适用）**：

1. 不做图生图 / 局部重绘 / 多图批量；一期只做文生图单图。
2. 不做"复制 FlowText 的实现路径"（§11.3）：生成不经过任何 agent 后端会话，不由提示词保证任何行为。
3. 不引入第二套图片传输实现（§11.4）：生成 HTTP 走独立轻量客户端（见 §3.3），**不**复用也不改动聊天侧 vision 输入的四后端图片序列化（那是 R-A4 的输入通道，与本条输出方向相反）。
4. 不改动既有只读辅助契约、aux 接受写路径、脏检查（§11.5）。
5. 不做除 openai-images 兼容之外的专用 SDK 适配（`package.json` 不新增任何依赖，见 §2）。

---

## 2. 现状证据（本分支已逐条核实，2026-09-18）

| 需求文档声称 | 本分支实际情况 | 结论 |
|---|---|---|
| `providerPresets.ts` 全部为对话补全供应商 | 属实：`src/features/settings/providerPresets.ts` 的 `ProviderPreset` 均为 `interfaceFormat: 'openai-compatible'` 的对话供应商目录（`baseURL` + `models{context,output}`），无图像生成条目 | 准确 |
| `package.json` 无图像生成 SDK | 属实：依赖表中仅 `@openai/codex-sdk`（Codex agent SDK，与图像生成无关）；无 openai/dalle/stability 类依赖 | 准确；本设计不新增依赖 |
| 聊天能输入图片（vision）但没有生成路径 | 属实：输入侧 `ImageAttachment`（`src/core/types/chat.ts:40`）与 `AuxQueryImageAttachment`（`AgentAuxQueryCapability.ts:56-60`）均为**输入**通道；全仓库无任何 generation 请求构造 | 准确 |
| "插件第一次由自身写入二进制资产" | **需精确化**：既有二进制写路径存在但全部限于插件私有目录——`ThemeBackgroundStorage.ts:7`（`.opencodian/theme-backgrounds`，经 `adapter.writeBinary` `:44`）、`providerIconAssetCache.ts:57`（`.opencodian/provider-icons`，`:218`）、`PluginUpdateService.ts:723,736`（插件目录资产）。它们都不进入用户内容区、不进入笔记引用。R-C2 是**第一个写入用户附件目录、被笔记引用、参与回退体系**的二进制写 | 按此精确表述 |
| R-B3 快照体系 | 本分支**已实现**（需求文档撰写时可能尚无）：`EditRevertService.ts` / `EditRevertStore.ts` / `EditRevertVaultWriteback.ts` / `editRevertPlan.ts`。但 **`performVaultWriteEvent` 只记录 markdown**（`EditRevertService.ts:517-518` 的 `isMarkdownPath` 过滤，`editRevertPlan.ts:112-114`），文本 pre-image 捕获（`:370`）也不适用于二进制 | 存在缺口：图片资产不能靠现有 vault 事件路径进快照，需显式扩展（§3.6） |
| 回退对"新建文件"的行为 | 属实可用：turn 内新建文件回退 = 移入 Obsidian 回收站（`EditRevertVaultWriteback.ts:50-53`、`trashVaultFile :145-152` 走 `vault.trash`） | 图片资产按 'created' 条目回退可直接复用该路径 |
| 密钥既有处理路径 | 属实：后端 API key 存于插件 settings 并走归一化（`CodexBackendSettings.apiKey`，`src/core/types/settings.ts:474-478`、归一化 `:1303-1311`）；诊断输出经 `src/shared/diagnosticSecretSanitizer.ts` 脱敏 | 凭据沿用同一模式，不新增明文存储 |

**运行时 API 可行性（已对运行中的 Obsidian 做只读探查，`obsidian eval`）**：

- `app.vault.getAvailablePathForAttachments` 存在（function）；实测 `await app.vault.getAvailablePathForAttachments("flowtext-probe.png")` 返回 `"附件/flowtext-probe.png"`——按当前 vault 的附件目录设置（`getConfig("attachmentFolderPath")` 实测为 `附件`）解析，并对同名冲突自动编号（Obsidian 自身约定，不覆盖已有文件）。
- `app.vault.adapter.writeBinary`、`app.vault.trash` 均存在（后者已被 `EditRevertVaultWriteback` 生产使用）。

---

## 3. 技术方案

### 3.1 Owner 归属（inspect:owner 实测结果）

| 模块 | Owner | 依据 |
|---|---|---|
| `src/core/agents/imagegen/ImageGenerationService.ts`（新） | `core.agents` | 该 owner 的职责即"agent capability, catalog and **invocation service**"；文生图是一次模型调用服务（非存储、非后端适配器）。允许依赖 `shared.foundation + core.types`（实测），满足 HTTP 客户端所需（transport 注入后不依赖 obsidian 运行时） |
| `src/core/storage/ImageAssetStorage.ts`（新） | `core.storage` | owner 职责明确含"theme backgrounds and provider-icon assets"——vault 二进制资产写入是它的既有领域；`ThemeBackgroundStorage` 是同 owner 同模式的直接 precedent |
| `src/core/storage/EditRevertService.ts`（改，登记 API） | `core.storage` | 回退体系所属 owner |
| `src/features/inline-edit/InlineEditImageGen.ts`（新）+ `InlineEditController.ts`（改） | `feature.inline-edit` | 行内入口与插入执行；允许依赖含 `core.agents`（生成服务）与 `core.types`（实测） |
| 聊天入口（composer 动作 + 结果卡片动作） | `feature.chat-runtime` / `feature.chat-ui` | 允许依赖含 `core.agents`（实测） |
| `SettingsImageGenerationSection.ts`（新）+ settings 类型 + i18n | `feature.settings-shell` / `core.types` / `shared.i18n` | §7 四件套 |
| `src/main.ts`（改，组装） | `app.composition` | 构造 `ImageGenerationService`/`ImageAssetStorage` 并注入（`app.composition` 允许依赖 `core.agents`、`core.storage`，实测） |

**为什么分散在三个既有 owner 而不是新建 `core.imagegen` 大一统 owner**：三块职责本来就分属既有领域（调用服务/资产持久化/编辑器编排）；新建 owner 反而要为跨 owner 调用增加端口层。owner 概况文案在实施时同步更新（`architecture-owners.config.json` + `docs/architecture/owners/**` + `docs/modules/**`，module-docs 硬门禁）。

### 3.2 数据结构与接口签名

```ts
// src/core/types/settings.ts
export interface ImageGenerationModelConfig {
  readonly id: string;              // 稳定 id（uuid），多模型并列
  readonly displayName: string;
  readonly apiFormat: 'openai-images';   // 一期唯一格式；枚举为后续扩展预留
  readonly baseURL: string;         // 例 https://api.openai.com/v1
  readonly apiKey: string;          // 沿用 settings 密钥路径 + 诊断脱敏
  readonly model: string;           // 例 gpt-image-1 / 自定义
  readonly size: string;            // 例 '1024x1024'；空串用供应商默认
}
```

生成服务（`src/core/agents/imagegen/ImageGenerationService.ts`）：

```ts
export interface ImageGenTransport {
  postJson(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number):
    Promise<{ status: number; body: ArrayBuffer }>;
}
// 默认实现用 Obsidian requestUrl（比照 sdkFetch.ts:1 的传输选型与 aux 会话的 transport 注入模式）

export type ImageGenerationResult =
  | { ok: true; bytes: ArrayBuffer; mimeType: 'image/png' | 'image/jpeg' | 'image/webp' }
  | { ok: false; error: string; kind: 'timeout' | 'quota' | 'http' | 'network' | 'size-limit' };

export class ImageGenerationService {
  constructor(transport: ImageGenTransport);
  generate(config: ImageGenerationModelConfig, prompt: string, signal?: AbortSignal):
    Promise<ImageGenerationResult>;
  // 常量：GENERATION_TIMEOUT_MS = 120_000；MAX_ASSET_BYTES = 25 * 1024 * 1024
}
```

fail-closed 细节：非 2xx 一律失败（区分 401/402/429 → `quota`，其余 → `http`）；响应不含已知图片格式 → 失败；字节超 `MAX_ASSET_BYTES` → `size-limit` 失败。**无任何降级重试路径**（重试是用户再次点击，不是自动行为）。

资产落盘（`src/core/storage/ImageAssetStorage.ts`）：

```ts
export interface ImageAssetVault {
  getAvailablePathForAttachments(fileName: string): Promise<string>;
  writeBinary(path: string, data: ArrayBuffer): Promise<void>;
  exists(path: string): Promise<boolean>;
  trash(path: string): Promise<boolean>;
}

export class ImageAssetStorage {
  constructor(vault: ImageAssetVault);
  /** 冲突编号交给 getAvailablePathForAttachments（Obsidian 原生约定），绝不覆盖。 */
  async save(data: ArrayBuffer, mimeType: string, baseName: string): Promise<{ path: string }>;
  async trash(path: string): Promise<boolean>;
}
```

### 3.3 写路径定义（§6.2 的显式扩展）

实施后插件的**全部**写路径清单（本文档负责登记 C2 增量）：

1. **W-aux**（既有，不变）：行内编辑接受 → 单次 `editor.replaceRange`（`InlineEditController.ts:20-23` 不变量），脏检查 `canApplyEdit`（`InlineEditService.ts:222-224`）。
2. **W-asset（本条新增）**：图片二进制 → 附件目录（`vault.adapter.writeBinary`）。**前置条件**：生成已成功且通过大小上限；**失败语义**：文档零改动，Notice 明确失败原因。
3. **W-ref（本条新增）**：嵌入引用文本（`![[...]]`）→ 编辑器事务（`editor.replaceRange`，仍是唯一编辑器写原语，但由**新生成的显式插入步骤**调用，而非 aux 接受路径）。**前置条件**：W-asset 已成功 + 锚点快照脏检查通过。**失败语义**：保留已落盘图片，Notice 给出**实际文件路径**（验收 4）。

两个新写步骤都登记于 R-B3 回退体系（§3.6）；不存在任何绕过两者的"顺手直接写文件系统"路径。

### 3.4 入口一：行内编辑（主验收面）

1. 输入覆盖层（`InlineEditInputOverlay`）增加图像生成开关（图标 chip）；开启后输入框语义变为图像提示词。
2. 提交流程：`ImageGenerationService.generate()`（可取消：Esc → AbortSignal）→ `ImageAssetStorage.save()`（**W-asset**）→ 生成引用文本：
   - 独占一行：空行 + `![[path|{imageGenerationMaxWidth}]]`（如锚点在行中则先补换行）；
   - 行内环绕：光标处直接 `![[path|{width}]]`（FlowText 的"行间插入即环绕"对应形态）。
3. 引用文本作为 `InlineEditOutcome` 的 `preview`（`mode: 'insertion'`）进入**既有**预览 → 接受/拒绝流：复用现有 diff 预览、脏检查、单事务接受、单步撤销（验收 2 的"渲染正确"与验收 6 的"Ctrl+Z 可撤销"免费获得）。
4. 用户在预览阶段拒绝 → 引用不写入；资产按 `imageGenerationAssetCleanup` 处理（默认 `trash`），并 Notice 告知（不静默留孤儿）。
5. W-ref 失败（写入抛错/脏检查失败）→ 保留资产，Notice 显示路径（fail-visible，不自动重试）。

### 3.5 入口二：聊天

1. composer 动作按钮 + `/image` 斜杠命令（斜杠目录经 `SlashCommandMenuCatalogCache` 既有缓存机制自动收录）。
2. 生成结果以消息卡片呈现（缩略图 + 模型/耗时），卡片动作：**插入到当前笔记（独占一行 / 行内）**、重新生成、复制图片。聊天不自动改写任何笔记——插入永远是显式点击（聊天没有锚点语义，自动插入违反"写路径显式"约束）。
3. 插入目标 = 当前激活的 markdown 编辑器光标处；无激活编辑器 → 提示且不入盘前先提示（生成仍可完成，落盘发生在点击插入时——聊天路径的顺序是 generate → 卡片；save 延迟到插入点击，避免聊天刷图产生无人认领的文件）。行内编辑路径的顺序是 generate → save → 插入（有锚点，验收 1 的自动链路由该入口满足）。
4. 验收 1 的落盘+插入断言以行内编辑入口为准；聊天入口验证"卡片 → 显式插入"链路。

### 3.6 纳入 R-B3 回退体系（扩展 `EditRevertService`）

现状缺口：`performVaultWriteEvent` 过滤非 markdown（`:517-518`），图片文件不会进入回退轮次。

扩展设计（`core.storage` 内，最小增量）：

```ts
// EditRevertService 新增公开方法；EditRevertFileEntry.source 联合类型增加 'plugin'（editRevertPlan.ts:38）
registerPluginCreatedAsset(path: string, conversationId: string): Promise<void>;
```

- 语义：在当前活动轮次登记一条 `status: 'created'`、`source: 'plugin'` 的条目。created 条目无 pre-image，回退 = 移入回收站（`EditRevertVaultWriteback` 既有路径，`:50-53`），零二进制快照存储。
- 同时在**引用写入（W-ref）成功后**对该笔记调用既有 markdown 捕获路径（`performVaultWriteEvent`/turn 捕获），笔记文本回退照常。
- 回退一张图 = 资产进回收站 + 笔记引用恢复（轮次回退天然成对处理）；"恢复回退"对图片条目不可用（文件已进回收站，如实显示不可恢复——与 turn 内新建文件的既有行为一致）。
- 不改 `isMarkdownPath` 本身（它的语义是"文本笔记"，二进制文本捕获 `captureContent`（`:370`）确实不适用）；扩展点是显式登记 API，而非放宽过滤器。

### 3.7 设置四件套

| 设置 | 默认 | 归属 |
|---|---|---|
| `imageGenerationModels: ImageGenerationModelConfig[]` | `[]` | settings 类型 + 迁移归一化 + `SettingsImageGenerationSection`（列表增删改，密钥输入框走既有密码框模式） |
| `imageGenerationMaxWidth: number` | `600` | 插入引用的 `\|width` 值；验收 3 由它驱动 |
| `imageGenerationAssetCleanup: 'trash' \| 'keep'` | `'trash'` | 资产清理策略；设置项描述文本说明两种反向路径的行为（§4.6），满足"行为在设置中说明" |

i18n：zh/en 双语同步。

---

## 4. 失败语义与安全约束

1. **§6.1 只读契约零影响**：生成调用完全在插件侧（HTTP → 本地落盘），不经过任何 agent 后端会话；agent 后端（若有交互）只看到最终的嵌入文本。`AgentAuxQueryCapability`、`AUX_DENIED_CAPABILITIES`、`findWriteToolCalls` 审计（`AgentAuxQueryCapability.ts:202-218`）一律不动；`scripts/audit/run-aux-query-audit.mjs` 无需为本条扩展（无 aux 行为变化）。
2. **两段写各自 fail（需求技术约束原文）**：
   - W-asset 失败 → 文档零改动（W-ref 从未尝试）；
   - W-asset 成功 + W-ref 失败 → 保留资产 + Notice 实际路径（不静默丢弃，不留无提示孤儿）。
3. **生成失败（超时/配额/网络/超限）**：卡片或 Notice 如实显示 `kind`（验收 5），文档零改动、磁盘零改动。
4. **脏检查**：W-ref 接受前锚点快照比对沿用 `canApplyEdit` 语义（§6.3）；插入目标区在生成期间被编辑 → 脏检查失败走"保留资产 + 提示路径"分支。
5. **凭据**：`apiKey` 存 settings（与 `CodexBackendSettings.apiKey` 同路径、同归一化、同脱敏）；日志/诊断/卡片不回显完整密钥。
6. **反向操作与资产策略（验收 6）**：
   - Obsidian 原生 Ctrl+Z：只回退引用文本，插件无法可靠观测 undo → 文件保留，该行为写进设置描述；
   - 插件回退（R-B3）：轮次回退将 `created` 图片资产移入回收站（与 agent 新建文件行为一致）；
   - 行内编辑预览被拒绝：按 `imageGenerationAssetCleanup`（默认 `trash`）+ Notice。
   三种路径全部在设置描述与本文档中明示，无静默行为。
7. **fail-closed（§6.4）**：无格式支持即拒绝（不做"猜测 b64/URL"）、超限拒绝（不分块不压缩）、非 2xx 拒绝；任何中间态都不产生部分文档改动。
8. **§6.5 后端无关**：生成与插入链路后端无关（不依赖 chat backend）；行内入口的可用性继承行内编辑自身的后端可用性判断；聊天入口在四后端均可发起（生成不经过后端，天然一致——验收按四后端各跑一次插入链路确认）。

---

## 5. 测试计划

**单元**（`tests/unit/core/agents/imagegen/`、`tests/unit/core/storage/`、`tests/unit/features/inline-edit/`）：

1. `ImageGenerationService`（fake transport）：成功解码 b64；401/402/429 → `quota`；超时 → `timeout`；未知格式 → 失败；超 `MAX_ASSET_BYTES` → `size-limit`；AbortSignal 生效。
2. `ImageAssetStorage`（fake vault）：冲突编号不覆盖；`writeBinary` 失败向上传播；`baseName` 清洗（非法字符、超长）。
3. 引用文本构造：独占一行（补空行逻辑）与行内两种形态；`|width` 来自设置；宽度为 0/负数时的归一。
4. W-ref 失败/脏检查失败分支：资产保留 + 路径提示（notify 注入断言）。
5. `registerPluginCreatedAsset`：登记后条目 `created/source:'plugin'`；回退走回收站；`performRevertAll` 包含图片条目。

**契约**：

6. 两段写顺序不变式：任何生成失败路径上 `writeBinary` 与 `replaceRange` 的调用序列断言（mock 序列）。
7. 回退对称性：插入 → 回退 → 笔记恢复 + 资产入回收站；再"恢复回退"对图片条目如实不可恢复。
8. 设置归一化：`imageGenerationModels` 迁移（旧 settings 无此字段 → `[]`）；密钥字段不进诊断输出。

**真 CLI / 后端端到端**：四后端聊天会话中 `/image` 发起（生成走插件 HTTP，与后端无交互）→ 插入链路各跑一次；行内编辑入口在后端可用性矩阵内跑通。无 aux 审计变更（§4.1），但行内既有审计仍需回归通过。

**真机（Obsidian，主智能体执行）**：

9. 配置一个真实文生图模型 → 行内编辑发起 → 落盘附件目录（实际路径核对 `attachmentFolderPath` 设置）→ 引用渲染正确（验收 1、2）。
10. 调整 `imageGenerationMaxWidth` → 新插入图片宽度变化（验收 3）。
11. 人为制造 W-ref 失败（插入前改写文档触发脏检查）→ 提示含实际路径（验收 4）。
12. 断网/错 key 生成 → 无文档改动（验收 5）。
13. 回退入口可见、图片可回退、回收站核对（验收 6）；设置描述文案核对。
14. 截图存档 `artifacts/opencodian/flowtext-parity/`（卡片、两种插入形态、设置页）。

---

## 6. 验收标准映射（需求 R-C2 验收 1-6）

| # | 验收标准 | 设计如何使其可验证 |
|---|---|---|
| 1 | 配置模型 → 提示词 → 落盘附件目录 + 插入引用 | 行内入口自动链路（§3.4 步骤 2-3）；真机步骤 9 |
| 2 | 两种插入形态可用且渲染正确 | 两种引用文本构造单测 #3 + Obsidian 原生 embed 渲染（独占一行块级 / 行内 inline）；真机步骤 9 |
| 3 | 宽度设置生效 | `\|width` 由 `imageGenerationMaxWidth` 注入，单测 #3 + 真机步骤 10 |
| 4 | 写成功+插入失败 → 提示实际路径 | §4.2 分支 + 单测 #4 + 真机步骤 11 |
| 5 | 生成失败无文档改动 | `ImageGenerationResult` 失败枚举 + mock 序列契约 #6 + 真机步骤 12 |
| 6 | 反向操作后文件按既定策略处理且在设置中说明 | §4.6 三路径 + `imageGenerationAssetCleanup` 设置描述 + 契约 #7 + 真机步骤 13 |

---

## 7. 可行性验证结论

**已验证**：

1. 附件目录解析与二进制写：对运行中的 Obsidian 只读探查确认 `getAvailablePathForAttachments`（返回 `"附件/flowtext-probe.png"`，遵守当前 vault 附件设置与冲突编号约定）、`adapter.writeBinary`、`vault.trash` 全部可用；`ThemeBackgroundStorage` 提供同构生产 precedent。
2. 回退体系挂点：`EditRevertVaultWriteback` 的 created→trash 路径已在生产（`:50-53`、`:145-152`），`registerPluginCreatedAsset` 只是登记入口，不需要新的回退机制。
3. 密钥路径：settings 密钥 + 诊断脱敏均有现成实现可复用。
4. 行内接受流可作为引用写入口：`InlineEditOutcome` 的 preview/accept/dirty-check/单步撤销全部现成，引用文本只是又一种插入内容。

**未验证 / 留给实施阶段**：

1. 真实图像供应商的响应体积与耗时分布（上限值 120s/25MB 是设计定值，需真机用真实模型校准，必要时调整常量并回填本文）。
2. `getAvailablePathForAttachments` 在附件目录指向 vault 外（用户配置了绝对路径）时的行为——实施时补一个边界用例：解析失败或越界路径 → W-asset fail-closed（提示用户检查附件设置），不写入。
3. 大图（接近 25MB）在移动端/低内存环境的 `ArrayBuffer` 处理——一期按桌面端验收，移动端不在本批次范围。

---

## 8. 开放问题（需维护者裁决）

| # | 问题 | 建议 |
|---|---|---|
| C2-Q1 | 一期 API 格式只做 openai-images 兼容，是否够？ | 建议**够**：主流供应商与聚合器均提供该兼容端点；其余格式等真实需求出现再加枚举（设置结构已预留 `apiFormat`）。 |
| C2-Q2 | 聊天路径是否也自动插入当前笔记？ | 建议**不自动**（本设计采用）：聊天无锚点语义，自动插入违反"写路径显式有限"（§6.2）；卡片显式点击已经覆盖 FlowText 的用户价值。 |
| C2-Q3 | `imageGenerationAssetCleanup` 默认值？ | 建议 `'trash'`：从未被引用的孤儿图默认清理更符合"不留困惑"；被引用过的资产只走 R-B3 回退路径（不受该设置影响）。 |
| C2-Q4 | 生成的图片是否记录到会话消息（跨重启可见）？ | 建议一期卡片即弃（不持久化缩略图），落盘文件是唯一持久产物；避免 `StorageService` 为二进制预览扩容。 |
