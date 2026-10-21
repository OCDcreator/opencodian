# OpenCode 2 local-native 辅助验收（2026-10-11）

本批完成 FA880/win32 与隔离 Mac/darwin 的获准有限队列，未提升整 case/profile/platform。完整实机报告、原件、请求计数和恢复差异保存在 `/Users/dht/.codex/artifacts/opencodian/overnight-aux-2026-10-11/delivery.md`。

| 包 | FA880 / win32 | Mac / darwin |
|---|---|---|
| Q1 | 真实只读、Accept/Reject/范围内 dirty 有限通过 | 同条件有限通过；literal 末尾 LF 被既有合同允许的归一化移除 |
| Q2 | 旧候选启动取消 late query/orphan 失败；其它 editor 隔离通过 | 新候选受控启动取消与正常另一 editor Accept 通过 |
| Q3 | ghost/Tab/stale/settled Esc 有限通过 | ghost/Tab/已完成 ghost 的 stale 有限通过 |
| Q4 | known owned 释放与恢复部分通过；full unload 受阻 | 新实例真实 unload 与 known owned 释放部分通过 |

唯一最小修复提交 `9cc8415710ec66cfafc7956d049236dfd109a630`：InlineEditService 保留 pending factory 所有权，取消后阻止晚 query，迟到 session 单次释放且重复 dispose 可等待 teardown。8 个行为回归有旧实现失败证据；最终相关 27 suites / 442 tests 通过。完整新 verify：15 gates、986 suites、10,338 tests、lint 0 errors / 0 warnings，exit 0。

版本保持 1.1.37，新 BUILD_ID `REMAINDER.20261011.inlinecancel1`，main SHA256 `4a13d694da229e9db46b1bd9c7711624120a3d2dade0f92e3e927f41d78c6a85`。123 产物仅 main.js 变，2,842 输入恰 service/test/doc/3 graph 变化，提交后冻结输入和 6 个 Git blob 相同。当前 graphify 0.9.36 按既有本地 AST 路径重提取 739 文件，未用 LLM；generated graph 较大差分单列，不代表更多产品源码修改。CodeGraph 有限 depth=1 与 affected 原件保留，QuestionDock 同名 submit 误边已消歧。

旧实机审计仍绑定 `REMAINDER.20261009.clauderestore1` / source `60350ea2735371d188c3f1b04290b5762abb508f`，FA native 2.0.24、Mac 2.0.22，合法 opencode-go 目的地 `http://192.168.31.147:8317/v1`。各固定 4 个真实 prompt：27 字节 patch 阳性、aux 诱导/追问/图片工具 0 与 note 字节保持。有效工具无原生枚举端点，空表来自 native exact deny 及版本过滤契约推导。新候选 39 audit 实际源码和 HTTP shim 未变，Mac复用同 profile 拒写前提。

Mac 新候选取消复验只延迟一次真实 factory-final 交付，实际 35,002ms；普通 Esc 时 actual starting/session-null 成立，迟到同 session dispose/remove 49ms 完成，query/prompt/admission 0，PID/port/root 退出；下一正常 B Accept 一次写准确，原 A 保持。自然竞态全部时序、active-model completion cancel、模型覆盖未验。FA 正常 reload 会关闭原受保护 Pi，因此新候选 UI 复验与 full unload 受阻，没有替代类或伪装卸载。

FA 保守 14/20；9 renderer SDK/admission + 4 audit HTTP，另 1 本地负向。Mac 保守 12/20；7 UI 动作含 1 无 query 的取消，6 SDK/admission + 4 audit HTTP，另 1 本地负向。不同层不混加；provider 请求、内部 retry、物理模型和旧 observer 空窗继续 unknown。

FA 55 完整旧对象、Pi/native、tabs/layout/draft/settings/env 保持，disk core/ui 仅 updatedAt；只 after-owned-startup 采集 27 scope 进程/4 监听保持，缺 pre-start 全 OS 基线。Mac原74与continued75完整会话字节保持，已知2份continued .bak原字节恢复、workspace/runtime/config保持；core仅updatedAt+lastCheckAt、ui仅updatedAt/序列化差异。原17进程样本16身份相同，既有 ZCode Helper PID65847 缺失原因 unknown，未重启或归因产品。全夜初始 .bak/all-listener/enabled-plugin 逐字基线未知。新候选 main 按授权保留在隔离库，环境恢复原关闭状态。

Mac audit 阶段3PID缺席与最终11continuationPID/8observedports退出分时证明；newmain11877端口unknown。真实新插件 unload events42→0/commands25→0/client断开/pool0。private40目录/276文件0700/0600。标准Mac TestVault247文件清单与SHA保持；Windows标准路径不存在，不能核全目录相等。原仓库HEAD保持且干净，无项目远端push、merge、tag或release。

权威账本仅12获准行追加15子条件；仍1906行，其它行、目标原属性和旧clause前缀/状态保持，wholeCasePassed不晋升。3次凭据/完整旧对象工具输出暴露已披露并收口private，公开精确值与完整结构扫描分别留证；历史转录无法撤回，未擅自轮换认证。

恢复摘要、账本写入收据与终审分别见同证据根的 `restoration-summary.md`、`ledger-write-receipt.json` 和 `review/`。最多五项剩余动作在主报告：FA安全加载复验、active时序补验、65847只读归因、literal LF/模型覆盖合同、凭据后续处理。
