# 源码目录

目录按职责组织，文件名保留现有领域名称。查找实现先选功能目录，再用 `npm run inspect:owner -- <path>` 确认归属；owner、状态和依赖约束仍以 `architecture-owners.config.json` 为准。

```text
src/
├── main.ts                         插件入口
├── app/                            跨功能装配、生命周期及 Obsidian 接入
├── core/                           后端协议、配置、存储与领域能力
│   └── agents/backend/
│       ├── Agent*.ts               公共能力、注册与路由
│       ├── claude/                 Claude SDK、权限、会话、资源发现
│       ├── codex/                  Codex app-server、传输及事件映射
│       ├── opencode/               OpenCode adapter（含保留的旧实现）
│       ├── pi/、zcode/、dsh/       各自的后端实现
│       ├── configuration/          跨后端配置文件、安全写入与归档
│       ├── auxiliary/              只读辅助查询
│       └── diagnostics/            后端会话追踪
├── features/
│   ├── chat/
│   │   ├── OpenCodianView.ts        视图入口与装配
│   │   ├── runtime/
│   │   │   ├── ChatRuntimeComposition.ts
│   │   │   ├── activation/         标签激活、恢复和状态桥接
│   │   │   ├── send/               发送管线、流分发与收尾
│   │   │   ├── rendering/          当前回合的消息壳与卡片渲染
│   │   │   └── background/         后台任务的流与指示器
│   │   ├── services/
│   │   │   ├── composer/           输入框、提及和上下文操作
│   │   │   ├── context/            上下文检索、附件、焦点和用量
│   │   │   ├── conversation/       会话历史、设置、持久化和标签协调
│   │   │   ├── sync/               权威同步、恢复与同步后协调
│   │   │   ├── send/               发送准备、完成通知和后续队列
│   │   │   ├── rendering/          会话渲染、视图模型和滚动
│   │   │   ├── background/         后台任务时间线及完成通知
│   │   │   ├── questions/          问题、待办及解决流程
│   │   │   ├── commands/           斜杠命令目录、菜单和执行
│   │   │   ├── selection/          模型、agent、权限与配置状态
│   │   │   ├── surface/            标题栏、输入面板外观和导航
│   │   │   ├── integrations/       PDF、图像生成及后端专属 UI
│   │   │   ├── diagnostics/        聊天诊断入口
│   │   │   ├── title/              标题生成契约与实现
│   │   │   └── demos/              演示装配
│   │   ├── rendering/              共用展示规则和消息渲染辅助
│   │   ├── tabs/、ui/              标签模型及可见控件
│   │   ├── retrieval/              相关笔记视图
│   │   └── demos/                  可选视觉实验
│   ├── settings/
│   │   ├── OpenCodianSettings*.ts   设置入口
│   │   ├── SettingsTabbed*.ts       标签页装配
│   │   ├── backends/               claude、codex、opencode、pi、zcode、acp
│   │   ├── models/                 模型目录、编辑器与选择器
│   │   │   └── icons/              provider 图标管理
│   │   ├── appearance/             外观、背景、字体和输入面板
│   │   ├── resources/              agents、skills、tools 和上下文分组
│   │   ├── capabilities/           能力导航及运行时证据
│   │   ├── mcp/                    MCP 表单、状态和编辑器
│   │   ├── debug/                  调试设置与后端诊断面板
│   │   ├── controls/               设置页共用输入和浮层控件
│   │   └── general/                插件、会话、安全及其他功能设置
│   └── …                           其他独立功能保持自己的目录
├── shared/                         无功能归属的共用规则与基础设施
├── utils/                          已有通用渲染、图标等工具
├── i18n/、types/、vendor/           语言资源、声明与供应代码
└── style/                          样式源文件
```

## 放置新文件

- 功能内的实现放入对应功能及职责子目录；后端实现进入自身后端目录。
- `runtime/` 保留执行期状态与流程，`services/` 保留会话级协调和功能服务；同名子目录便于定位，二者仍沿用各自的 owner。
- 只有供多个功能使用、且符合依赖方向的实现才进入 `shared/` 或 `utils/`。文件以 `Service`、`Coordinator`、`HostAdapter` 结尾不决定其目录。
- 目录本身用于导航；优先直接引用已有文件。新增 barrel 或转发层应有明确的公共导出需求。
- 模块文档镜像源码路径：`src/**/Foo.ts` 对应 `docs/modules/**/Foo.md`；现有测试位置保留，导入指向实际源码。
- 路径迁移要同步静态与动态导入、Jest mock、源码断言、审计脚本、owner 清单及文档链接，并核对迁移前后的模块依赖。

2026-10-23 的整理仅调整路径与引用。后端选择、并发会话、发送流程、只读辅助查询规则和视觉实验的启用方式保持原状。实验依赖仍由现有构建流程处理。

## 2026-10-24 DSH 补充定位

- `src/core/agents/backend/dsh/DshProtocolCodec.ts`：共享 ACP 准入与内容编码，服务多个已有入口。
- `src/features/settings/backends/dsh/SettingsDshSection.ts`：完整 DSH 设置子区，由现有后端组合层注入窄 host。
- `tests/unit/core/agents/backend/DshAdapter.fixture.ts`：隔离 native process 依赖的故障可控夹具，分别支持 lifecycle 与 configuration/media 场景。
