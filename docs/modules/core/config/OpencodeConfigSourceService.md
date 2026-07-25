# OpencodeConfigSourceService

> **源码**: `src/core/config/OpencodeConfigSourceService.ts`
> **状态**: [ACTIVE]

## 概述

`OpencodeConfigSourceService` 是 P1-B 的 scope-aware OpenCode 配置源 owner。它把 Project、Global 与 managed system 候选统一盘点，但每次读写仍要求调用方传入一个明确 target path；服务不会在多个并存候选之间静默挑选。managed 候选只可读取，永远不进入 writable allowlist。

它负责 raw JSONC 读取/保存、结构化 JSONC path edits、expected-revision 冲突、delete、history catalog 与 caller-selected restore。读取使用 P0 的 `readAllowlistedFileSnapshot()`：content 与 revision 来自同一个 `O_NOFOLLOW` descriptor snapshot；读期间替换/identity 变化不返回混合 bytes，而是失败证据。所有 mutation 最终委托给 `ProjectResourceSecureWrite`，复用 realpath/symlink confinement、archive-before-mutation 与原子提交契约。

## 候选与默认路径

| Scope | Source | 路径 | 可写 |
|---|---|---|---|
| Project | `project-default` | `<vault>/.opencode/opencode.jsonc` | 是 |
| Project | `project-legacy` | `<vault>/.opencode/opencode.json` | 是 |
| Global | `global-xdg-default` | `$XDG_CONFIG_HOME/opencode/opencode.jsonc` | 是 |
| Global | `global-xdg-legacy` / `global-xdg-config-legacy` | 同目录 `opencode.json` / `config.json` | 是 |
| Global | `global-home-default` | XDG 缺失时 `~/.config/opencode/opencode.jsonc` | 是 |
| Global | `global-home-legacy` / `global-home-config-legacy` | 同目录 `opencode.json` / `config.json` | 是 |
| Global | `global-dot-opencode-jsonc-legacy` / `global-dot-opencode-json-legacy` | `~/.opencode/opencode.jsonc` / `~/.opencode/opencode.json` | 是 |
| Managed | `managed-system` | 平台 managed dir 下 `opencode.jsonc` / `opencode.json` | 否 |

`getDefaultProjectConfigPath()` 与 `getDefaultGlobalConfigPath()` 只返回新建默认值，不代表自动选择。新建 Global 默认仍严格为 `$XDG_CONFIG_HOME/opencode/opencode.jsonc`；XDG 缺失时才是 `~/.config/opencode/opencode.jsonc`。`~/.opencode` 是 OpenCode 目录发现链路兼容的 legacy source，只盘点上游实际读取的 `opencode.jsonc` / `opencode.json`，不虚构该目录下的 `config.json`。`inventory()` 返回所有当前模式下的候选及 `scope`、`source`、真实 path、exists、editable、revision、parseError 和三轴 evidence，供 Settings 在候选并存时展示来源并要求用户显式选择。

## 核心导出

| 导出 | 说明 |
|---|---|
| `OpencodeConfigSourceService` | scope/source inventory 与安全 mutation owner。 |
| `OpencodeConfigSourceCandidate` | 一个候选的来源、路径、可写性、revision、parse 状态与 evidence。 |
| `OpencodeConfigSourceReadResult` | 精确 UTF-8 bytes；JSONC 无效时仍返回内容供用户修复。 |
| `OpencodeConfigSourceMutationOutcome` | target、类型化 result、三轴 evidence，并在 raw/派生文本可用时保留 `draft`。 |
| `write()` | 保存用户明确选择的完整 JSONC 源码；严格要求 `expectedRevision`。 |
| `applyPathEdits()` | 用 `jsonc-parser` path edits 修改 leaf，保留未触及注释、未知字段、键序、缩进和 EOL。 |
| `delete()` | expected-revision + archive-before-delete。 |
| `listHistory()` / `catalogHistory()` | 列出单 target 或 scope 下经完整性校验的归档历史。 |
| `restore()` | 只接受 history 返回的 opaque entry identity，恢复前重新做 allowlist、archive association 与 expected-revision 校验。 |

## 安全与冲突契约

- writable Project root 仅为 `<vault>/.opencode`；materialize root 前后都以 `assertWithinRoot(vault, root)` 重验，并在 shared mutation 前保持该 exact narrow root。缺失父目录若在两次校验之间被替换为指向 vault 外的 symlink，write/delete/restore 返回类型化 `invalid-path`，不创建外部配置文件，也不扩展 allowlist。
- writable Global root 仅为解析后的 OpenCode config dir。XDG 缺失时先把 `~/.config` 限定在 home；显式 XDG 值本身定义 global config base，最终 mutation 仍只 allowlist 其 `opencode` 子目录。每一层被 `mkdir` materialize 的 base/narrow root 都在前后以其原始 parent anchor 重验，防止 parent-symlink race 改写 allowlist 的实际根。
- legacy `~/.opencode` 是第二个独立 Global allowlist root：读写前先把该 exact root 限定在 home，不能借它授权 home 下其他文件；write/delete/history/selected restore 均只接收上述两个真实文件候选。
- history catalog 对 live root 使用 allowlist 重验；对已删除且 root 不存在的目标，只能借仍存在的父锚点计算 exact canonical candidate，绝不为盘点重建 root。同目录非候选 archive 会使整批 catalog `archive-failed`，不会作为可恢复目标暴露。
- selected restore 先在服务内部校验 opaque identity 的 `backend=opencode`、`kind=configuration`、`format=jsonc`、scope 与精确 canonical candidate，再只把该 candidate 的单一 allowlist root 交给共享 restore；其他 backend/kind 的合法 identity 或同 root 非候选 target 均返回 `invalid-target`。
- editable candidate 的 inventory/read 在读取任何 bytes 前先验证上述父根，再通过 exact narrow allowlist 解析 canonical target；目标 symlink 即使仍在 vault/home 内，只要逃出 `.opencode` 或 global `opencode` 目录，也只返回 confinement/read failure，不返回外部 content 或 revision。
- managed system candidate 的 mutation policy 仍是只读，但 read 不是 confinement 例外：inventory/read 先把目标限定在 exact managed config dir 并读取其 canonical target。逃出 managed dir 的 symlink 同样只返回 honest confinement failure，不返回外部 bytes/revision。
- managed paths 不进入 writable allowlist；raw write、delete、history mutation 都返回 `read-only`。
- create 必须传 `expectedRevision: null`；update/delete/restore 必须传读取时的完整 revision。外部修改返回 `conflict`，没有 force overwrite。
- raw write 允许用户编辑整份 JSONC，但仍先做 JSONC validation；结构化调用必须使用 `applyPathEdits()`，禁止先 parse 后 `JSON.stringify` 整体重写。
- overwrite/delete/restore 历史固定使用 `backend=opencode / kind=configuration / format=jsonc`，归档失败即中止 mutation。
- conflict outcome 保留 caller raw draft；path edit 失败保留用于派生的 base text，Settings 不得清空编辑器草稿。

## 三轴证据

source read 与 mutation evidence 都刻意不冒充 runtime truth：

- 已存在且能解析的 source read：`persistence=verified`，`application/runtime=unavailable`。
- source 不存在：`persistence=not-applicable`。
- parse/read error：`persistence=failed`。
- mutation success：`persistence=verified`、`application=pending`、`runtime=unavailable`。
- mutation failure/read-only/invalid-target：`persistence=failed`、其余两轴 `not-applicable`。

OpenCode 是否重新加载、实际合并了哪个层、runtime effective value 是独立证据；本服务不从保存成功推断这些结论。

## 与其他模块的交互

- `OpencodeConfigManager` 构造并持有本服务；旧 `.opencode/opencode.json` API 保持签名兼容，同时所有结构化写入改为 JSONC leaf patch + shared safe mutation。
- P1 Settings UI 应通过 manager 暴露的 inventory/read/write/path-edit/delete/history/restore facade 使用本服务，不应自行拼接全局路径或直接写文件。
- `ProjectResourceSecureWrite` / `ConfigurationArchiveService` 继续拥有 allowlist、revision、archive 与最终 commit 安全策略；本服务只定义 OpenCode 的候选与调用编排。

## 注意事项

- `read()` 只接受 inventory 中的精确候选路径；任意路径返回 `invalid-target`。
- `parseError` 不阻止 raw editor 展示原始 bytes，但任何 path edit 会 fail closed，直到用户通过 raw editor 提交一份合法 JSONC。
- `restore()` 的 target 可由成功 revision 或 conflict revision 推导；设置区块本身仍应保留 history 所属 target 上下文，不依赖失败 outcome 猜测路径。
- 聊天资源菜单与 slash/agent catalog 不消费本模块；P1 不改变其既有扁平目录架构。
