# WorkbenchHostRuntime

> 源码：`src/core/runtime/WorkbenchHostRuntime.ts`
> Owner：core.runtime

## 职责与边界

宿主工具运行时：每会话 PTY、输出环缓存、输入/resize/stop 和显式 Git 操作。macOS 使用 Python pty，Windows 使用 bundled PowerShell ConPTY bridge；工作台关闭仅卸载 UI，runtime dispose 终止自己创建的进程。Git 支持 scope-root 状态、diff、stage/unstage、显式 commit 和外部 worktree，不自动提交。子进程参数通过 execFile/spawn 传递，不拼接 shell。

## 验证

聚焦测试、类型检查、lint、模块文档与图刷新均为修改期门禁。真实模型/宿主行为验收见 `.scratch/goal-agent-workbench-20261030/evidence/`；未验收能力不得由单测替代。
