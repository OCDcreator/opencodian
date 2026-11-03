# ZCodeAccountService

> 源码: src/core/agents/backend/zcode/ZCodeAccountService.ts

官方 CLI 登录与退出的后端 owner。智谱 / BigModel 与 Z.AI 使用 `login <family> --json --no-browser`，凭据放在笔记库外、本机共用的 `~/.opencodian/zcode/account`。临时登录根与私有 provider 文件隔离桌面账号及桌面默认模型；成功且未取消才提交。跨实例 sidecar 锁序列化登录与退出，发布时对凭据 revision 再检查；取消、超时、失败和迟到结果不发布。凭据原子替换且不建历史归档，避免退出后留下可恢复 token。

公开快照只有状态、账号名称、授权链接；不返回 token。原生 enc:v1 profile 解码只用于摘要。账号环境最后覆盖 ZCODE_DATA_BASE_DIR；显式固定原生本机 cipher secret，使私有 HOME 的辅助查询能够读取相同凭据。聊天 storage 根和个人 API 路径另行保留。日志与 UI 不输出秘密。

原生 CLI 负责 OAuth、凭据加密和续期；用户完成浏览器授权才构成真实登录验收。单测 fixture 不能证明账户可调用。桌面应用仅使用确认的安装路径唤起，不虚构设置 deep link。

验证：ZCodeAccountService.test.ts 覆盖私有 stage、成功发布、取消/迟到、失败、超时、跨库序列化、外部刷新冲突及退出不修改共享 API。
