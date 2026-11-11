# SessionWorkbenchRepository

> 源码：`src/features/chat/ui/SessionWorkbenchRepository.ts`
> Owner：feature.chat-ui

## 职责与边界

会话工作台仓库工作面的唯一状态所有者：Git 快照、按会话的草稿（提交说明、worktree 分支/目录、打开的文件行、已加载差异）、在途差异读取（pending/requeue）以及决定异步结果能否落地的两代（session 访问代 `generation` 与仓库读取代 `revision`）。由 `SessionWorkbenchTools` 组合：宿主用本文件内的窄结构接口（`Pick<WorkbenchHostRuntime, readGit|gitDiff|stageFile|commit|createWorktree>` + 目录/草稿目录），呈现用 4 回调 shell（button/enable/showError/clearError），头部（label/detail/actions）由外壳传入；本模块不 import `SessionWorkbenchTools`，也不持有 UI 外壳状态。

读取与展示：`show()` 每个工作目录只读一次，之后读取一律显式（刷新按钮或重试）；无快照时按 git 自身文案（en/zh）分类为“不在仓库中”，其他失败保持诚实的通用失败并附 `failureDetail` 单行化（去 ANSI、去凭据、限长 240）的细节，从不显示原始 stderr。文件行懒加载差异：展开才读；stage/unstage/刷新后保留打开行、已加载差异、提交说明、worktree 输入（草稿按 identity 存储并有界 LRU），打开的差异在后台重读更新而不清屏。提交/worktree 创建在 UI 先做本地化校验，mutation 参数原样转发宿主 runtime。mutation 结果分 `done/stale/failed`：写入总会完成，但只有发起它的那次访问（lease 仍当前且面板仍挂载）触发补读并消费其草稿；`stale` 回执绝不报错、不清当前访问的草稿或输入框，返回的访问经自己的 `show()` 重新读取。

2026-11-11 展示布局：有 Git 快照时，仓库工具头使用两行网格——分支与操作一行，工作目录独占第二行；分支和目录图标是独立节点，刷新只更新文字，不会重绘掉图标。无快照（读取中、非仓库或失败）时隐藏该工具头，只显示一个状态块：失败/加载标题、单次工作目录以及重试/代码审查操作，不再重复“仓库”标题与路径。文件行保留原始 `file.path` 作为 tooltip 与所有 Git 操作参数，展示时仅拆成“文件名 + 父目录”，状态字母不继承默认 code 胶囊底色。提交说明保持会话草稿，输入高度与右对齐提交操作仅由 CSS 控制。

所有权门禁：每次读取绑定 `lease(generation:identity) + revision + root`；结果落地前重查当前快照中的文件状态与已挂载、仍打开的行。旧会话访问（A→B→A）的结果永不落地、不进缓存；新请求撞上在途读取时进入 requeue，由恰好一次新读取应答；`detach()` 递增两代，销毁后的表面既不落地也不发起任何 git 读取（读取前要求已挂载的打开行）。无快照的会话不保留上一会话的行。

## 验证

`tests/unit/features/chat/SessionWorkbenchRepository.test.ts`：每目录一次读取与非仓库/通用失败状态；懒加载差异、stage 后打开行/差异/草稿保留与跨会话恢复；缓存快照在重挂载时免读还原并补读打开差异；提交与 worktree 的本地化校验和原样转发；延迟竞态——同 XY 刷新期在途读取被排队且新结果优先、A→B→A 旧结果不落地并由当前访问补读、detach 后迟到的差异/快照读取既不落地也不触发新读取；`failureDetail` 与 `store` 的有界性。

外壳组合与错误归属（错误只进 git 错误区、切会话清除）由 SessionWorkbenchTools 测试覆盖。
