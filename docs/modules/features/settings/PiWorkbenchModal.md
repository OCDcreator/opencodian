# PiWorkbenchModal

> 源码: src/features/settings/PiWorkbenchModal.ts

## 职责

选择Pi会话、展示分组动作和实时事件；新建/导入/分叉返回新句柄后刷新选择。打开聊天由宿主导入原生历史。结果按原生结构显示；API key密码输入且结果不回显。

停止按钮关闭当前服务，也可退出OAuth/包操作。账号/包持久化操作需要明确确认。只依赖PiAdapter，不持有其他后端状态。

## 验证

PiWorkbenchActions.test.ts、SDK脚本、Test Vault。
