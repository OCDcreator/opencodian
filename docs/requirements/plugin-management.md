# OpenCodian 插件管理能力需求整理

## 1. 背景

当前 OpenCodian 已经能通过当前 vault 的 `.opencode/opencode.json` 管理 OpenCode 的部分项目级配置，例如模型与权限。

现在希望进一步为 OpenCodian 增加“插件管理能力”，目标包括：

1. 能识别并展示当前 OpenCode 正在受哪些插件来源影响。
2. 尽量避免全局插件污染当前项目。
3. 允许用户按项目为当前 vault 配置自己的插件能力。
4. 为后续支持 `oh-my-opencode` 这类项目级插件打基础。

这份文档用于给另一个大模型或后续开发直接做设计/实现。

## 2. 用户需求整理

用户的核心诉求可以拆成四层：

### 2.1 插件可见性

用户希望 OpenCodian 能“看见”当前 OpenCode 的插件来源，而不是黑盒运行。

至少要能区分：

1. 全局配置里的 npm 插件
2. 全局插件目录中的本地插件
3. 项目配置里的 npm 插件
4. 项目 `.opencode/plugins/` 目录中的本地插件

### 2.2 隔离全局插件影响

用户希望“当前项目不要被全局插件影响”，至少在插件行为异常时，可以快速切断全局插件对本项目的干扰。

### 2.3 项目级插件配置

用户希望在项目层面为当前 vault 配置插件，而不是只能依赖全局安装。

这对 `oh-my-opencode` 这类插件尤其重要，因为用户可能不想让所有项目都受它影响。

### 2.4 为 OMO 兼容打基础

如果 OpenCodian 未来要真正兼容 `oh-my-opencode`，仅处理消息显示还不够，还需要补齐“项目级插件治理能力”，否则插件来源不可控。

## 3. 已验证事实

## 3.1 OpenCode 本身支持插件能力

根据 [`../reference/opencode-complete-documentation.md`](../reference/opencode-complete-documentation.md) 第 15 节：

1. OpenCode 支持本地文件插件：
   - `.opencode/plugins/`
   - `~/.config/opencode/plugins/`
2. OpenCode 支持通过配置文件的 `plugin` 字段加载 npm 插件。
3. 插件来源会一起加载并按顺序执行 hook。

因此结论是：

`OpenCodian 从产品层面集成“插件管理能力”是可行的。`

这不是要让 OpenCodian 自己实现插件系统，而是让它成为 OpenCode 插件系统的管理前端。

## 3.2 OpenCode 的插件加载顺序是明确的

文档说明的顺序是：

1. 全局配置 `~/.config/opencode/opencode.json`
2. 项目配置 `opencode.json`
3. 全局插件目录 `~/.config/opencode/plugins/`
4. 项目插件目录 `.opencode/plugins/`

源码也能对上这件事：

- `reference-projects/opencode/packages/opencode/src/config/config.ts`
- `reference-projects/opencode/packages/opencode/src/config/paths.ts`

关键结论：

1. 插件来源不是“二选一”，而是合并加载。
2. `plugin` 数组是拼接去重，不是覆盖。
3. 插件目录也会被自动扫描并追加到插件列表。

## 3.3 OpenCodian 当前已有项目级配置落点

当前项目已有这些基础：

1. `src/core/config/OpencodeConfigManager.ts`
   - 已能读写当前 vault 的 `.opencode/opencode.json`
2. `src/core/opencode/ServerManager.ts`
   - 本地托管 OpenCode 时，进程工作目录会设置为当前 vault
3. `src/main.ts`
   - 已将 vault path 传给 OpenCode 服务层
4. `src/features/settings/OpenCodianSettings.ts`
   - 已有较完整的设置 UI 框架，适合新增“插件设置”分区

所以从架构上看，OpenCodian 已经具备承接“项目级插件管理 UI”的基础。

## 4. 关键可行性判断

## 4.1 能否给 OpenCodian 集成插件功能？

结论：`可以。`

但这里的“集成插件功能”应理解为：

1. 管理 OpenCode 插件配置
2. 管理项目级插件目录
3. 展示插件来源和风险
4. 控制本地托管 OpenCode 的插件加载策略

而不是让 OpenCodian 重新实现 OpenCode 的插件运行时。

## 4.2 能否读取全局插件？

结论：`可以。`

至少可以读取和展示：

1. `~/.config/opencode/opencode.json` 中 `plugin` 字段声明的 npm 插件
2. `~/.config/opencode/plugins/` 目录中的 `.js/.ts` 插件文件

这件事对 OpenCodian 来说主要是文件系统读取与列表展示，不依赖 OpenCode 上游新增能力。

## 4.3 能否禁用“所有全局插件”？

结论：`只能部分做到，而且要区分目标。`

### 情况 A：禁用所有外部插件

这是可行的。

OpenCode 上游已有 `OPENCODE_PURE`：

- `reference-projects/opencode/packages/opencode/src/index.ts`
- `reference-projects/opencode/packages/opencode/src/plugin/index.ts`

它会让 OpenCode “run without external plugins”。

但注意：

`这会禁用所有外部插件，不只禁用全局插件。`

也就是说：

1. 全局插件会被禁用
2. 项目插件也会被禁用
3. npm 插件和本地插件都会一起失效

所以它只能作为“彻底隔离模式”或“纯净模式”。

### 情况 B：只禁用全局插件，保留项目级插件

按照当前文档和参考源码，`这不是 OpenCode 现成支持的能力。`

原因是：

1. 全局配置和项目配置里的 `plugin` 会合并。
2. 全局插件目录和项目插件目录都会被统一扫描。
3. 插件运行时拿到的是合并后的结果，不保留“按来源禁用”的公开配置接口。
4. 当前文档里没有 `disabled_plugins`、`plugin_source_policy` 之类的来源级开关。

因此：

`“屏蔽全局插件影响，但保留项目插件” 不能只靠当前 OpenCode 文档能力完成。`

如果一定要做，需要二选一：

1. 推动 OpenCode 上游支持来源级插件过滤
2. 在 OpenCodian 本地托管模式下采用高风险的运行环境隔离方案

第二条不适合作为首选需求，因为它偏 hack，且对全局配置、依赖安装、认证状态都可能有副作用。

## 4.4 能否配置项目级插件？

结论：`可以，而且非常适合作为 OpenCodian 新功能。`

可行方式至少包括：

1. 管理当前 vault `.opencode/opencode.json` 里的 `plugin` npm 插件列表
2. 管理当前 vault `.opencode/plugins/` 目录下的本地插件文件
3. 管理当前 vault 的项目级插件专属配置文件，例如未来的 `.opencode/oh-my-opencode.jsonc`

这部分与 “只禁用全局插件” 不同，它本身不依赖上游新增能力。

## 5. 需求结论

## 5.1 推荐产品定位

建议把这项能力命名为：

`OpenCode 插件管理`

并明确分成两个层级：

### 一级：插件可见与项目配置

这是当前就可以推进的主线。

包括：

1. 查看全局插件来源
2. 查看项目插件来源
3. 配置项目 npm 插件
4. 管理项目 `.opencode/plugins/`
5. 为 OMO 等插件管理项目级配置文件

### 二级：插件隔离模式

这是需要严格标注边界的增强功能。

建议只提供两种明确模式：

1. `继承 OpenCode 默认插件环境`
2. `纯净模式（禁用所有外部插件）`

不要在第一版把“仅禁用全局插件、保留项目插件”做成承诺功能，因为按当前上游机制并不成立。

## 5.2 对“禁用全局插件”的正确表述

建议在需求里把这件事写成：

### 当前可实现

1. 检测当前项目是否受全局插件影响
2. 提供“纯净模式”用于禁用所有外部插件
3. 提供项目级插件配置 UI

### 当前不可直接实现

1. 只禁用全局插件
2. 同时保留项目级外部插件继续工作

这部分需要 OpenCode 上游提供来源级插件过滤机制后，才适合升级为正式能力。

## 6. 建议新增设置项

建议在 OpenCodian 设置中新增一个新的一级分区：

`插件 / Plugins`

推荐包含以下子区块。

### 6.1 插件环境概览

展示当前环境信息：

1. 当前服务模式：本地托管 / 远程
2. 当前 vault 对应的 `.opencode` 路径
3. 是否检测到全局 `plugin` 配置
4. 是否检测到全局插件目录文件
5. 是否检测到项目 `plugin` 配置
6. 是否检测到项目插件目录文件

### 6.2 全局插件来源

只读展示：

1. `~/.config/opencode/opencode.json` 中声明的 npm 插件
2. `~/.config/opencode/plugins/` 中发现的本地插件

并标注：

`这些插件可能影响当前项目`

### 6.3 项目插件配置

可编辑：

1. 当前 vault `.opencode/opencode.json` 中的 `plugin` 数组
2. 当前 vault `.opencode/plugins/` 目录
3. 未来可扩展到“创建项目插件配置模板”

### 6.4 插件隔离模式

建议第一版只提供：

1. `默认模式`
   - 继承 OpenCode 默认行为，加载全局与项目插件
2. `纯净模式`
   - 本地托管 OpenCode 时，通过环境变量禁用所有外部插件

并明确提示：

1. 纯净模式只对 OpenCodian 启动的本地 OpenCode 服务生效
2. 远程服务模式下无法由 OpenCodian 强制控制服务端插件加载策略
3. 纯净模式会一起禁用项目级插件，不仅仅是全局插件

### 6.5 OMO 项目配置入口

为后续 OMO 兼容预留：

1. 打开/编辑 `.opencode/oh-my-opencode.jsonc`
2. 检查项目是否已配置 OMO
3. 检查当前是否处于纯净模式，从而提示 OMO 会失效

## 7. 推荐实现范围

建议分阶段推进。

## Phase 1：插件可见性与项目配置

目标：

1. 新增插件设置分区
2. 展示全局插件来源
3. 展示项目插件来源
4. 支持编辑项目 `plugin` 配置
5. 支持打开项目 `.opencode/plugins/` 目录或列出其文件

这是最稳的一期，也是对 OMO 基础价值最大的一期。

## Phase 2：纯净模式

目标：

1. 本地托管 OpenCode 时支持“禁用所有外部插件”
2. 设置变更后提示需要重启 OpenCode 服务
3. 纯净模式下 UI 明确警告：
   - 全局插件会失效
   - 项目插件也会失效

这期可用于快速排查“是不是全局插件导致当前项目异常”。

## Phase 3：OMO 项目集成基础设施

目标：

1. 提供 `.opencode/oh-my-opencode.jsonc` 的项目级管理入口
2. 提供项目级插件启用指引
3. 明确显示 OMO 当前是否会因纯净模式而失效

这期完成后，才比较适合继续做更深的 OMO UI 兼容。

## 8. 非目标

下面这些内容不应在第一版承诺：

1. 只禁用全局插件、保留项目插件正常运行
2. 在远程 OpenCode 服务模式下由 OpenCodian 强制改变服务端插件加载
3. 自动替用户完成所有 npm/Bun 插件安装诊断
4. 直接改 OpenCode 上游插件装载机制

## 9. 验收标准

### 9.1 插件能力集成

1. 设置中存在独立的“插件”分区
2. 能显示当前全局插件和项目插件来源
3. 能区分 npm 插件与本地目录插件

### 9.2 项目级插件配置

1. 用户可以查看并编辑当前 vault 的项目级 `plugin` 配置
2. 用户可以查看当前 vault 的 `.opencode/plugins/` 文件列表
3. 更改后能提示是否需要重启本地 OpenCode 服务

### 9.3 纯净模式

1. 本地托管 OpenCode 模式下可开启纯净模式
2. 开启后会禁用所有外部插件
3. UI 明确提示这会同时禁用项目插件
4. 远程模式下该能力不可强制执行，并有清晰提示

### 9.4 OMO 基础

1. 插件设置页可以承接未来 OMO 项目配置入口
2. 用户能判断当前项目是否仍受全局插件影响
3. 用户能判断 OMO 是否因纯净模式而不会生效

## 10. 对实现模型的附加建议

优先检查这些文件：

- `src/core/config/OpencodeConfigManager.ts`
- `src/core/opencode/ServerManager.ts`
- `src/features/settings/OpenCodianSettings.ts`
- `src/core/types/settings.ts`
- `docs/reference/opencode-complete-documentation.md`
- `reference-projects/opencode/packages/opencode/src/config/config.ts`
- `reference-projects/opencode/packages/opencode/src/config/paths.ts`
- `reference-projects/opencode/packages/opencode/src/plugin/index.ts`
- `reference-projects/opencode/packages/opencode/src/flag/flag.ts`

推荐优先顺序：

1. 先做插件环境可见性
2. 再做项目级插件配置
3. 再做纯净模式
4. 最后再把 OMO 项目配置入口接进来
