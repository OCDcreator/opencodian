# SettingsDshNativeFields

源码：`src/features/settings/backends/dsh/SettingsDshNativeFields.ts`

DSH 已审核 metadata 的引导式表单渲染器，归属 `feature.settings-shell`。它拥有复杂配置的条目编辑，不拥有文件、凭据或设置持久化。

## 2026-11-09 凭据管理行归属

`renderDshNativeCredentialRow` 是凭据引用行的实质所有者（无新薄文件；端口类型在本文件内结构化声明，不 import core 传输模块，避免循环）。workspace 通过 `DshNativeCredentialRowPort` 提供可用性／过期谓词与 describe/set/unset RPC；行内 UI 只回读 metadata——configured/missing、来源（或未知）与本连接可写／只读，并固定展示本机凭据存储跨当前计算机所有库与 DSH 会话共享的作用域说明。密码输入与 Set/Unset 在原生服务证明可写之前保持禁用；回调再次校验可用性与过期状态，一次性提交后立即清空密码框，反馈只含本地化结果与 metadata，绝不回显密钥值或原始错误。请求头凭据仍明确要求重连。

- 解析 descriptor 的 `*` 映射与 `[]` 数组路径，将提供商、模型、权限预设、压缩模型策略、请求头、重试和兼容性对象渲染为有名称的字段及添加／移除动作。
- scalar 以原生 select / input 编辑，布尔值和枚举都保留显式继承。数值展示单位和已审核的边界；最终有效性由 core 统一验证。
- union 使用 metadata alternatives / literalValue，明确呈现数字或 low、false 或等级映射、模板文本／变量对象等真实分支，不猜测 JSON 文本类型。
- maps 支持新命名条目与自定义已回读继承条目；arrays 支持逐项编辑、移除与复制继承列表。所有组合修改通过 host 标记为组事务。
- 普通字段先展示，高级字段放在后续独立 disclosure；沿用已接受的 DSH 单层边框、主题、标签和窄屏布局。
- 字段标签和单位来自 `settings.dsh.native.*`，原生精确协议枚举保留标识；credential-reference 交给 host 渲染本机凭据操作。不会收集或缓存密钥。
- 2026-11-09 视觉首轮修复：每个 scalar/union 决策先展示一句 `settings.dsh.native.help.*` 后果说明，继承状态、基准值、单位与真实保存时机放在随后较弱的元数据行；不再用“继承 · 比例／数量”代替说明。
- help 优先匹配 namespace + 原始公开 path，再匹配 namespace + leaf，最后使用语义相同的共享 leaf；压缩摘要 maxTokens、DeepSeek 默认请求 maxTokens、模型 maxTokens 以及策略目标 provider/model 都分别解释。容量字段不声称增大模型实际能力，权限／工具开关不声称绕过沙箱，保存文案不声称实时应用。
- `host.transaction` 仅说明并传递根字段的实际事务语义，用于自定义会话默认 provider/model；其他简单字段按既有自动保存条件，已存在同组草稿时仍需 Save group。测试生成全部公开结构来校验中英文后果覆盖，并检查元数据顺序、代表性后果及自定义模型的真实保存行为。

聚焦测试：`tests/unit/features/settings/backends/dsh/SettingsDshNativeWorkspace.test.ts` 的提供商、模型数组、union、继承、字段本地化与请求头凭据场景。
