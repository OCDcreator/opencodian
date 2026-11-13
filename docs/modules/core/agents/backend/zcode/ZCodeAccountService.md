# ZCodeAccountService

> 源码: src/core/agents/backend/zcode/ZCodeAccountService.ts

官方 CLI 登录与退出的后端 owner。智谱 / BigModel 与 Z.AI 使用 `login <family> --json --no-browser`，凭据放在笔记库外、本机共用的 `~/.opencodian/zcode/account`。临时登录根与私有 provider 文件隔离桌面账号及桌面默认模型；成功且未取消才提交。跨实例 sidecar 锁序列化登录与退出，发布时对凭据 revision 再检查；取消、超时、失败和迟到结果不发布。凭据原子替换且不建历史归档，避免退出后留下可恢复 token。

公开快照只有状态、账号名称、授权链接；不返回 token。原生 profile 解码只用于摘要，支持官方两种信封：legacy `enc:v1:` 与当前运行时写入（含自动 v1→v2 原地迁移）的系统 `enc:v2:{os|env}:<指纹24>:`。字节形状对齐官方 systemCredentialCipher：key = sha256(托管 secret)，指纹 = sha256(key 字节).hex 前 24 位，AES-256-GCM base64url(iv.tag.ct)；官方 codec 只存在于运行时 bundle 内，无法以包形式导入，故在插件内镜像字节契约而非加载 bundle。仅 env（托管 secret）来源可在进程内解码；os（系统钥匙串密钥）来源诚实呈现为 unreadable，绝不访问钥匙串。指纹不匹配（托管 secret 变更）、密文篡改、畸形信封与未知 `enc:` 前缀一律按损坏凭据拒绝。账号环境最后覆盖 ZCODE_DATA_BASE_DIR；显式固定原生本机 cipher secret，使私有 HOME 的辅助查询能够读取相同凭据。插件独占该账号 secret：账号环境显式把 ZCODE_CREDENTIAL_SECRET_FILE 清空为空串（覆盖配置与继承值），使子进程（登录/注销、app-server、辅助查询，均最后合并此记录）永远只见单一托管 secret 来源；官方 cipher 对同时设置两个来源会直接拒绝，且插件绝不读取用户 secret 文件。聊天 storage 根和个人 API 路径另行保留。日志与 UI 不输出秘密。

原生 CLI 负责 OAuth、凭据加密和续期；用户完成浏览器授权才构成真实登录验收。单测 fixture 不能证明账户可调用。桌面应用仅使用确认的安装路径唤起，不虚构设置 deep link。

验证：ZCodeAccountService.test.ts 覆盖私有 stage、成功发布、取消/迟到、失败、超时、跨库序列化、外部刷新冲突及退出不修改共享 API；凭据编解码用例覆盖明文、enc:v1、enc:v2 env（含固定 secret 与派生 fallback 两条路径）、os 来源拒读、指纹不符、v1/v2 密文篡改、畸形信封、未知 enc 前缀、混合记录损坏及 token/非名称 profile 字段不外泄。
