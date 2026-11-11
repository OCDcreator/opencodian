# SettingsZCodeAccounts

> 源码: src/features/settings/backends/zcode/SettingsZCodeAccounts.ts

聊天设置中的“账号与模型管理”展开区。通过窄接口调用账号 owner 和共享 API 配置 owner；展示账号隔离、API 共享和生效时机。官方登录有浏览器授权、备用链接、取消与失败反馈；退出先显示范围确认。表单以 password 输入新密钥，已有密钥只显示保留提示。

服务列表与表单不持有后端秘密。revision 冲突保留草稿并提示读取最新配置；保存后分别反馈文件保存与目录刷新/重连。加载 epoch 与 isConnected 拒绝旧页面响应。原生应用入口仅唤起应用并给出设置路径。

验证：SettingsZCodeSection.test.ts 覆盖挂接/失败恢复；账号与文件边界由独立后端测试覆盖。实际浏览器授权需真人完成，UI fixture 仅用于截图异常状态。

冲突提示旁提供读取最新配置并保留草稿，读取失败不显示成功。成功保存后禁用本次表单并清空新密钥输入，防止新建服务重复提交。

Kimi 复审后：冲突绑定编辑开始时 revision，读取最新仅展示公共字段差异；必须显式选择以草稿保存才使用新 revision。删除冲突要求重新选择对象和确认。字段校验关联 aria-invalid/描述并聚焦，单处就近显示并公告错误；编辑/删除按钮包含服务名，取消操作恢复触发焦点，退出完成后聚焦可用登录按钮。

API 表单保存成功后保留禁用的“已保存”状态，将“取消”改为“关闭”并聚焦该按钮；关闭表单不撤销共享配置写入。

API 服务行默认只显示地址与模型数量；原生“查看模型”details 默认收起，展开后用共享有界 ScrollArea 展示全部可选择复制的模型 ID。长 ID 换行，模型数组不截断，也不改变编辑表单或持久化数据。

## 2026-11-08 账号/共享 API 分页 + 归档历史恢复

`attach` 保留为经典布局的组合 disclosure；页签布局改用 `attachAccount`（官方登录页）与 `attachProviders`（共享个人 API 服务页）分别挂接。两页均新增显式范围声明：账号=机器级 OpenCodian 自有登录（ADR-0003，与桌面账号互不影响）；API 服务=与 ZCode 桌面共享同一份配置，编辑同时影响两个产品。行级 `describeBackendSetting` 徽章：账号 scope=global/effect=immediate/risk=medium，provider 行 scope=shared/effect=new-session/risk=high。

providers 区在 `getPersonalConfigService()` 具备 `listPersonalConfigHistory`/`restorePersonalConfigEntry`（core 已落地：allowlist=配置目录、archive backend='zcode' kind='personal-providers'）时渲染“版本历史” disclosure：懒加载条目（identity/timestamp/size），恢复流程为 打开→Restore→Confirm 三击；经 `safeRestoreArchivedEntry` 带 expectedRevision CAS，conflict 提供“读取最新后重试”，成功后 refreshConfiguration + 重载列表。契约缺失时整个区块不渲染——绝不渲染死按钮或虚构历史。归档位于配置旁（~/.opencodian 下，0700，不入仓库）。
