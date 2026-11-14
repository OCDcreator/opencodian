# Obsidian 1.15.1 兼容性核查（2026-11-13）

结论：Pele、CodeMirror 与 Electron 的公告变更未发现当前插件必须修改的调用点。多库实测发现 CLI 的 `vault=` 参数位置值得加固；该问题不能仅凭一次当前版实测认定由 1.15.1 引入。此文记录核查及后续建议，没有把本轮后端修复范围扩大为宿主工具门控改造。

## 官方公告与当前宿主

- [1.15.0 公共版（2026-11-02）](https://obsidian.md/changelog/2026-11-02-desktop-v1.15.0)：引入 **Pele**，用于 Mermaid 12.1.0 兼容图表；图表随主题配色／字体并响应笔记宽度。`loadMermaid()`／`window.mermaid` 改由 Pele 执行，产物 SVG 使用 `.pele-*` 类，新接口可在 loadMermaid 完成后访问 `window.pele`；新增 `--mermaid-*` 主题变量。
- [1.15.1 公共版（2026-11-12）](https://obsidian.md/changelog/2026-11-12-desktop-v1.15.1)：继续改进阅读模式、索引与独立窗口生命周期，修复 Mermaid 内的 Obsidian URI 链接；CLI 脚本输出更可靠、eval 支持顶层 await；安装器更新至 Electron 43.8.9。
- 本机实际 running renderer、安装器与 CLI 均为 **1.15.1**，Electron **43.8.9**；测试库路径与插件 BUILD_ID 已分别读回，不能用安装文件版本代替运行态。

## 对照插件接入点

| 更新 | 当前用法与判断 |
| --- | --- |
| Pele 替换 Mermaid 渲染 | 插件没有直接调用 loadMermaid／window.mermaid／window.pele，也未匹配旧 Mermaid SVG 类。画布预览走 `CanvasRewriteModals.ts` 的宿主 MarkdownRenderer.render，聊天走 `utils/markdown/MarkdownRenderer.ts` 的 renderMarkdown；渲染交给宿主，当前无需替换为另一套图表引擎。复杂图表逐语法回归尚未执行。 |
| CodeMirror 关闭格式节点加入 formatting-*-end | 当前源码没有按旧完整 formatting 节点名匹配的调用点，不需为本条改动补兼容分支。 |
| 隐藏窗口定时器与独立窗口修复 | 未发现 activeWindow 定时器用法；当前设置工作台及独立 Settings 文档能渲染。实机自动化应按 ownerDocument／真实窗口身份选择目标，不能只查询主窗口 document 或旧标题格式。独立设置窗口能力并非由此次观察就能认定首次出现在 1.15.1。 |
| Electron 43.8.9 | 插件源码未直接导入 Electron；ZCode node-bundle 路径仍拒绝借用 Obsidian Electron 二进制。已在新宿主重载最终插件并读回运行态。 |
| CLI 输出与顶层 await | 现有参数及响应判断仍需验证目标库和结构化结果；不能把退出码 0 等同命中目标库。 |

无需仅因版本号提高 minAppVersion，亦无已证据要求升级当前 Obsidian typings。

## 多库 CLI 实测与建议加固

在本机同时打开多个库时，以下两个只读调用的目标不同：

```text
obsidian eval vault=testvault code=...       → 活动库（没有命中 testvault）
obsidian vault=testvault eval code=...       → testvault（名称／物理路径均匹配）
```

因此本次后续命令统一采用**前置** `vault=<name>`，操作前先读回库身份。最初 trailing vault 的 plugin:reload 在另一库未找到插件，未发生重载；不能把这个偶然失败当作门控的目标隔离保证。没有读取另一库的笔记或会话内容。

插件不会自己组装日常 CLI argv，但 `obsidianGateScript.ts` 的 `buildGateScript` 允许 key=value 出现在参数分类过程的任意位置，最终原样转发；`obsidianToolingPrompt.ts` 的 `buildObsidianToolingBlock` 没有说明 vault 参数位置。这意味着模型若生成 trailing vault，当前封装缺少提前拒绝的保护。建议后续在门控中拒绝子命令之后的 vault 全局选项，并在提示词示例明确前置写法。共享 autodebug 执行脚本已前置 vault，部分文档示例仍需同步。

这是**当前版本已实测的路由／封装边界**；没有旧 CLI 的受控对照，不将其定性为本次版本引入的回归，也不臆测官方是否承诺支持 trailing 写法。

初轮 CodeGraph 仅用于改造范围评估：两个符号均为唯一定义、各 1 个直接函数／方法调用方（排除 file 节点）；impact depth=2，buildGateScript 为 7 个符号，buildObsidianToolingBlock 为 8 个符号。后者涉及聊天组合入口，初轮核查没有修改这些函数或越过该边界。

2026-11-14 用户授权加固后的处置：已在既有门控内拒绝后置／重复／空的 vault 参数，并要求库相关命令显式前置目标；help／version／vaults 保留全局查询。提示词与共享调试技能同步前置示例和目标身份核验要求。合法 argv 仍原样传递，原高影响确认流程保留；参数校验本身不冒充宿主目标身份的权威读回。

## PDF 与实证边界

Pele 处理图表，不改 PDF 管线。插件独立 pdf-engine 入口仍会在首次加载时设置 globalThis.pdfjsWorker，当前没有恢复该全局；这是既有待隔离评估事项。项目已有干净进程对照未证明它造成宿主 PDF 不渲染，1.15.x 公告也没有 PDF.js 管线变更，故不将其升级成已证实的 1.15.1 缺陷。后续可专门测试插件索引 PDF 前后宿主 PDF 查看器，并评估并发 worker 生命周期下的隔离方案。

本轮实际验证：1.15.1 上插件 2.2.0 的最终 2249 构建加载、Claude 六模式／ZCode guarded 原生控件选择、设置读回与恢复、截图目检均完成，见[后端适配验收](backend-runtime-refresh-2026-11-13.md)。未执行复杂 Mermaid 全语法矩阵、PDF 引擎与宿主查看器交叉实测或 Windows 原生 UI；这些边界不由单测或公告阅读代替。
