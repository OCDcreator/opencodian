# Obsidian CLI 多库目标加固（2026-11-14）

基线 `f03df458`，插件版本保持 2.2.0。用户在 1.15.1 核查后授权同时加固技能与插件认可的 CLI 调用路径。

## 实施

- 生成门脚本扫描完整 argv：后置、重复、空的 vault 选择器均以 exit 2 拒绝；库相关命令漏目标同样拒绝。验证位于命令分类、确认请求和实际 CLI 启动之前。
- help／version／vaults 保留无目标全局查询。合法 argv 原样交给既有分类与批准／拒绝／超时机制，不重新排序、不以错误写法诱发待批准请求。
- 模型能力块给出前置 `vault="<target vault>"` 示例，要求先核对库名及物理路径，目标不匹配或不可用即停；完整帮助使用 `gate help`。
- 同步共享 obsidian-plugin-autodebug 技能的命令示例、目标身份规则和存在执行缺口的入口必填检查；技能源属于 my-skills 仓库，独立验证／提交。

参数格式验证并不证明宿主实际命中，调用者仍须确认原生身份。裸 CLI 与同用户伪造决策文件仍在既有用户态门控威胁模型之外；此轮没有扩展为沙箱或接入新宿主 API。PDF worker 隔离不在本次路由加固内。

## 验证

- Obsidian 工具定向：9 个套件／74 项通过，涵盖真实 POSIX shell、记录型 CLI、中文／空格库名、参数中普通 vault 字样、错误目标零执行／零请求，以及批准／拒绝／超时。
- `npm run verify -- --base origin/main` 十五项全通过：1,084 个套件／12,374 项测试通过，另有 4 个套件／8 项按条件跳过，lint 0 errors／0 warnings。架构、owner、模块文档、Graphify、devlog、类型、生产构建和样式一致性均通过。
- CodeGraph 沿用已有索引，未 init；修改前精确解析两个符号，直接函数／方法调用方各 1 个（排除 file 节点），impact depth=1，影响分别 6／5 个节点，范围在现有门控与注入链。修改后已 sync／affected。
- 构建 `zcode-obsidian-cli-vault-hardening-20261114.202611140824` 已部署 macOS Test Vault，四个运行文件与 dist 哈希一致。重载后实际 getDebugBuildIdentityText 读回相同 BUILD_ID。
- 直接运行插件重新生成的门脚本：8 组错误参数全部 exit 2，记录型 CLI 从未启动，确认目录前后相同；合法 `vault=testvault vault` 通过真实 Obsidian 1.15.1 返回匹配的库名和物理路径。此探针没有执行笔记写入、安装、删除或模型回合。

实机范围为 macOS Obsidian 1.15.1；Windows 当前未开放本插件的 POSIX 门控，不以模拟测试声称 Windows 原生门控已可用。证据位于本机 tracker 的 `obsidian-cli-vault-hardening-20261114/`，不提交真实库内容、原始日志或本机配置。
