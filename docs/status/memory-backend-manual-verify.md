# 通用记忆后端 — 手工验证指南

> 对齐参考实现 `opencode-zmem/docs/manual-verify.md` 的验证风格。
> 适用版本：v1.1.24+（BUILD_ID ≥ main.202609130311）。

## 0. 前置

- 插件已部署到目标 vault（Test Vault 路径见 AGENTS.md「Build And Deploy」）。
- OpenCode 后端可用；`opencode-go/deepseek-flash`（或任意可用模型）已配置。
- 记忆开关默认**关闭**——所有验证先开启：
  设置 → 会话（Conversation）→ 工作区记忆（Workspace memory）→ 启用记忆后端。

## 1. 首回合注入（协议 + 索引）

1. 新建会话，发送任意 ≥3 词的消息（例如「以后回答先给结论再给细节，因为上次我等了很久」）。
2. 检查 vault 下 `<vault>/.opencodian/memory/projects/<slug>-<hash16>/` 目录已创建（只有 `.last-injection.json` 与 metrics 时正常，`MEMORY.md` 不会自动创建）。
3. 查看 `.opencodian/memory/metrics.jsonl`：应有一条 `kind:"injection"` 记录。
4. 第二回合不再注入：metrics 不新增 injection 行（纪元去重）。

## 2. 写入路径（模型自主写 / 插件抽取兜底）

**模型自主写**（协议驱动，主路径）：
1. 新会话首回合说「请用你的文件写工具，把『我们的代码评审固定在每周二』写进你的持久记忆目录」。
2. 期望：模型 write `<记忆文件>.md`（frontmatter 含 `node_type: memory`）+ 更新 `MEMORY.md` 索引行。
3. metrics 应出现 `kind:"extraction-skipped", detail:"turn-wrote-memory"`——该轮零额外模型调用。

**插件抽取兜底**（runtime half）：
1. 同一会话第二回合（无注入）随口给出偏好：「以后代码注释一律用中文，因为团队都用中文」。
2. 期望：回合结束约 1.5s 后，抽取写入一条 `source: extracted <session>` 的记忆，正文含 `Trigger:` / `**Why:**` / `**How to apply:**`。

## 3. 负样本（零成本）

1. 新会话只发「hi」→ 无抽取、无额外模型调用（metrics 无 extraction 行；稳态跳过不落盘）。
2. 关闭总开关后再发一回合 → 无注入、无写入、metrics 文件大小不变。

## 4. 召回生效（场景 D）

1. 用 §2 建立记忆后，**新开会话**问一个依赖该记忆的问题（例如「二分查找是什么？」）。
2. 期望：回答遵循记忆（例如结论先行）；模型可能主动 Read 记忆文件。
3. metrics 新增一条 injection（新纪元）。

## 5. 维护命令

命令面板（Ctrl/Cmd+P）：
- `记忆：工作区记忆状态` — 根目录、索引行数/字节、主题文件数、类型分布。
- `记忆：体检工作区记忆` — 密钥命中 / 缺 importance / 游离文件；健康时提示 clean。
- `记忆：遗忘一条记忆` — 输入 slug，删除文件并清理索引行。

## 6. 密钥守卫（可选）

1. 手工在桶内放一个含 `api_key = <32位随机串>` 的记忆文件并加索引行。
2. 新会话开启「语义召回」设置后再问相关问题；或直接跑 `记忆：体检` 命令。
3. 期望：lint 报告 secret 命中；语义召回下该文件整体不进入注入（注入块中无其内容）；磁盘文件不被修改。

## 7. 上限与归档（长库验证）

1. 把 `MEMORY.md` 人工扩到 150+ 行：新会话注入应带 `⚠️ [MEMORY-ACTION]` AUDIT 提示（hygiene notice）。
2. 扩到 200+ 行 / 25KB+：注入被截断并带 `> WARNING:` + `> MAINTENANCE:`（无归档尾标时）。
3. 在索引尾加 `<!-- archived: still on disk, not injected by default -->`：尾标之后的内容不再注入，WARNING 不再附 MAINTENANCE。

## 8. 后端切换（中立性）

1. 切换活跃后端（claude-code / codex / pi，若可用），开启记忆开关。
2. 新会话重复 §1/§4：注入文本相同（同一存储桶），仅交付通道不同（opencode 用 synthetic part，其余为消息前置）。
3. 已知限制：claude/codex/pi 的注入显示在发送的消息文本前部（这些后端无 per-turn system 接缝）；压缩反思依赖转录里的 compaction 标记。

## 9. 已知限制（如实记录）

- codex / pi / claude-code 的注入走消息前置（适配器内完成，聊天 UI 不显示，但后端侧转录会包含该前缀）。
- 压缩反思的触发以持久化转录出现 compaction 标记为准；OpenCode `session.compacted` 事件当前为 no-op，未单独接线。
- 语义召回为词法选择 + 正文注入（≤3 条/回合），无 embedding 通道（按产品约束显式不实现）。
- `.opencodian` 为隐藏目录，Obsidian 文件列表不可见；请用系统文件管理器或编辑器查看记忆文件。
- mtime 依赖 node fs（桌面端可用）；不可用时排序退化为重要度+原序。
