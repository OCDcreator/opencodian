# DshProtocolCodec

> 2026-10-24：prepareDshPromptBlocks 将 Vault 文件选择器产生的 file: 图片引用读取为真实字节，再交给有序内容编码。读取复用 PathConfinement 的符号链接检查，只允许当前 Vault 内、非空且不超过 20 MiB 的 PNG/JPEG/WebP/GIF；有限缓冲并检查读取期间尺寸变化。不请求远程图片 URL，不修改原始 requestParts，取消期间不提交原生 prompt。

源码：`src/core/agents/backend/dsh/DshProtocolCodec.ts`

这是无会话状态的 ACP 内容与配置准入模块，隔离可信控制器挂载外部进程/HTTP MCP 以及多模态序列化的风险。由传输层、适配器和设置组合层共用，不另建运行时 owner。

- 集中定义 ACP v1、JSON 值类型和握手校验；DshAcpClient 保留兼容类型/校验导出。
- `validateDshMcpServers` 整批验证名称唯一性、绝对 stdio command、字符串参数和环境名值，或绝对 HTTP(S) URL/headers；拒绝换行头、非法键、重复条目与不支持的传输。只验证和复制数据，不执行命令或请求 URL。
- `buildDshPromptBlocks` 保留结构化文本、文件内容、图片和资源链接顺序；只消除 requestParts 与 images 对同一附件的重复表示，保留同一表示内有意重复的图片。未知结构化内容和未获握手许可的图片明确失败。
- 光栅图片仅接受 PNG/JPEG/WebP/GIF 的规范 base64，带大小上限。输出图片转换为受限 data:image Markdown；不接收 SVG 或任意 scheme。
- 文本快照优先于资源链接，避免把选区附件扩展为整个文件。Memory/tooling 前缀与 Obsidian context 后缀由调用方提供，编码器不导入项目/聊天运行时。

验证覆盖真实 wire 数组、图片顺序/去重、MCP 声明准入及未知内容的拒绝；不把协议夹具当成真实模型多模态验收。

## 2026-10-28：原生命令与技能弹框

prepareDshPromptBlocks 保持 slash 技能文本在用户消息首行，将 memory/tooling prefix 移到附加上下文位置，保留其内容及图片顺序。原生命令仍由 native service 的 rawText 精确分派。
