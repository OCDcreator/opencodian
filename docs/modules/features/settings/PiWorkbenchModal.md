# PiWorkbenchModal

> 源码: src/features/settings/PiWorkbenchModal.ts

## 职责

选择Pi会话、展示分组动作和实时事件；新建/导入/分叉返回新句柄后刷新选择。打开聊天由宿主导入原生历史。结果按原生结构显示；API key密码输入且结果不回显。

停止按钮关闭当前服务，也可退出OAuth/包操作。账号/包持久化操作需要明确确认。只依赖PiAdapter，不持有其他后端状态。

## 验证

PiWorkbenchActions.test.ts、SDK脚本、Test Vault。

## 2026-10-02 T07 产品消费

模型页 set_thinking_level 下拉框读取所选 plugin-local session 的 getAvailableThinkingLevels；只显示该 session 实际返回的 levels，max 不经过固定枚举筛除。缺 session、空集合、旧 SDK unavailable 或失败时禁止选择猜测档位；切换 session/action 后旧请求不能填入新控件。

会话页 get_entries 使用 typed facade；since 是原生 entry ID，空输入省略参数。entries/parentId/leafId 与未知节点字段原样展示。仅 SDK unavailable 时明确显示 full-history fallback、sinceApplied:false，读取现有 getSessionMessages；未知 since/请求失败直接显示错误，不伪装为增量成功。

PiClaudeSessionControlsUI.test.ts 覆盖实际控件操作、动态 max、无会话、unsupported/failure、native since/leaf、回退文案及不偷偷回退失败。无需新 RPC 或 paid 模型。
