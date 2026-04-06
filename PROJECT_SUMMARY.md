# OpenCodian 项目总结

## 项目概述

**OpenCodian** 是一个仿照 Claudian 的 Obsidian 插件项目，使用 OpenCode SDK 替代 Claude Agent SDK，实现开源、多模型支持的 AI 编程助手。

## 项目位置

```
/Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian/
```

## 文件结构

```
opencodian/
├── README.md                    # 项目说明
├── LICENSE                      # MIT 许可证
├── PROJECT_SUMMARY.md           # 本文件
│
├── docs/
│   ├── README.md                # 文档入口与分类说明
│   ├── architecture/README.md   # 当前架构总览
│   └── modules/README.md        # 模块文档入口
│
├── src/
│   ├── main.ts                  # 插件入口
│   │
│   ├── core/
│   │   ├── opencode/            # OpenCode SDK 封装
│   │   │   ├── index.ts
│   │   │   ├── OpenCodeService.ts    # 核心服务
│   │   │   ├── ServerManager.ts      # 服务器生命周期管理
│   │   │   └── types.ts              # 类型定义
│   │   │
│   │   ├── storage/             # 存储层
│   │   │   ├── index.ts
│   │   │   └── StorageService.ts
│   │   │
│   │   ├── types/               # 类型定义
│   │   │   ├── index.ts
│   │   │   ├── chat.ts
│   │   │   ├── models.ts
│   │   │   ├── settings.ts
│   │   │   └── tools.ts
│   │   │
│   │   └── tools/               # 工具定义
│   │       ├── index.ts
│   │       └── toolNames.ts
│   │
│   ├── features/
│   │   ├── chat/                # 聊天功能
│   │   │   ├── index.ts
│   │   │   └── OpenCodianView.ts     # 主视图
│   │   │
│   │   └── settings/            # 设置面板
│   │       ├── index.ts
│   │       └── OpenCodianSettings.ts
│   │
│   ├── shared/                  # 共享组件
│   │   └── index.ts
│   │
│   ├── i18n/                    # 国际化
│   │   └── index.ts
│   │
│   └── utils/                   # 工具函数
│       └── index.ts
│
├── tests/
│   ├── setup.ts                 # 测试设置
│   ├── __mocks__/
│   │   └── obsidian.ts          # Obsidian API Mock
│   └── unit/
│       └── core/
│           └── opencode/
│               └── OpenCodeService.test.ts
│
├── scripts/                     # 构建脚本
│   ├── build.mjs
│   ├── build-css.mjs
│   ├── run-jest.js
│   └── sync-version.js
│
├── package.json                 # 项目配置
├── manifest.json                # Obsidian 插件清单
├── tsconfig.json                # TypeScript 配置
├── tsconfig.jest.json           # Jest TypeScript 配置
├── .eslintrc.cjs                # ESLint 配置
├── .gitignore                   # Git 忽略配置
├── jest.config.js               # Jest 配置
├── esbuild.config.mjs           # esbuild 配置
└── styles.css                   # 编译后的样式
```

## 核心组件

### 1. OpenCodeService (src/core/opencode/OpenCodeService.ts)

主要功能：
- 封装 `@opencode-ai/sdk`
- 管理会话生命周期
- 发送/接收消息
- 流式响应处理
- 消息格式转换

### 2. ServerManager (src/core/opencode/ServerManager.ts)

主要功能：
- 启动/停止 OpenCode 服务器进程
- 健康检查
- 端口管理
- 崩溃恢复

### 3. StorageService (src/core/storage/StorageService.ts)

主要功能：
- 会话元数据存储
- 设置持久化
- 文件系统操作

### 4. OpenCodianView (src/features/chat/OpenCodianView.ts)

主要功能：
- 侧边栏聊天界面
- 消息渲染
- 用户输入处理
- 工具调用显示

### 5. OpenCodianSettingTab (src/features/settings/OpenCodianSettings.ts)

主要功能：
- 服务器配置
- 模型选择
- 安全设置
- UI 设置

## 技术栈

| 类别 | 技术 |
|------|------|
| **语言** | TypeScript 5.0+ |
| **构建** | esbuild 0.27+ |
| **测试** | Jest 30.2+ |
| **Lint** | ESLint 8.57+ |
| **SDK** | @opencode-ai/sdk |
| **目标** | ES2018, CommonJS |

## 与 Claudian 的对比

| 特性 | Claudian | OpenCodian |
|------|----------|------------|
| **SDK** | @anthropic-ai/claude-agent-sdk | @opencode-ai/sdk |
| **架构** | 直接嵌入 | 客户端/服务器 |
| **模型** | 仅限 Claude | 多提供商支持 |
| **本地模型** | ❌ | ✅ |
| **开源程度** | 闭源 SDK | 完全开源 |
| **MCP 支持** | ✅ | ❌ (OpenCode 自有插件系统) |
| **价格** | 需要 Claude 订阅 | 可选择免费本地模型 |

## 开发路线图

### Phase 1: 基础架构 ✅
- [x] 项目初始化
- [x] SDK 集成
- [x] ServerManager 实现
- [x] 基础会话功能

### Phase 2: 核心功能
- [ ] 完整的消息发送/接收
- [ ] 流式响应优化
- [ ] 工具调用渲染
- [ ] 历史记录管理

### Phase 3: UI 完善
- [ ] 多标签页支持
- [ ] 文件上下文选择器
- [ ] 图片上传/显示
- [ ] 代码高亮

### Phase 4: 高级功能
- [ ] 行内编辑
- [ ] 会话搜索
- [ ] 导出功能
- [ ] 主题支持

### Phase 5: 优化
- [ ] 性能优化
- [ ] 错误处理
- [ ] 测试覆盖
- [ ] 文档完善

## 使用方式

### 开发模式

```bash
cd /Volumes/SDD2T/obsidian-vault-write/custom-project/opencodian
npm install
npm run dev
```

### 生产构建

```bash
npm run build
```

### 运行测试

```bash
npm run test
```

## 配置说明

### OpenCode 服务器设置

```json
{
  "server": {
    "host": "127.0.0.1",
    "port": 4096,
    "autoStart": true
  }
}
```

### 模型配置

```json
{
  "defaultProvider": "anthropic",
  "defaultModel": "claude-3-5-sonnet-20241022",
  "providers": [
    {
      "id": "anthropic",
      "name": "Anthropic",
      "enabled": true
    }
  ]
}
```

## 关键设计决策

### 1. 服务器管理模式

OpenCode 采用客户端/服务器架构，需要显式管理服务器进程。ServerManager 负责：
- 启动/停止服务器
- 监控健康状态
- 自动重启

### 2. 会话存储

与 Claudian 不同，OpenCode 服务器自动持久化消息历史。插件只存储会话元数据：
- 会话 ID
- 标题
- 时间戳

### 3. 消息格式转换

OpenCode 使用 `Part[]` 格式，需要转换为 StreamChunk 以适配 UI：

```typescript
// OpenCode Part
{ type: 'text', text: 'Hello' }

// Claudian StreamChunk
{ type: 'text', content: 'Hello' }
```

### 4. 多模型支持

通过 `client.config.providers()` 动态获取可用模型，支持：
- Anthropic Claude
- OpenAI GPT
- 本地模型（vLLM/Ollama）
- 任意 OpenAI 兼容 API

## 已知限制

1. **需要独立安装 OpenCode** - 用户需要手动安装 `opencode-ai` npm 包
2. **服务器端口占用** - 需要确保端口 4096 未被占用
3. **首次启动较慢** - 服务器启动需要时间
4. **MCP 不兼容** - OpenCode 使用自有插件系统，不与 MCP 兼容

## 下一步工作

1. **完善流式响应** - 当前实现需要优化 SSE 处理
2. **添加工具渲染** - 实现工具调用和结果的 UI 展示
3. **实现多标签** - 添加 TabManager 支持多会话
4. **添加文件上下文** - 实现 @-mention 文件选择器
5. **完善错误处理** - 添加重连和恢复机制

## 参考资源

- [Claudian AGENTS.md](https://github.com/YishenTu/claudian/blob/main/AGENTS.md)
- [OpenCode SDK 文档](https://opencode.ai/docs/sdk/)
- [Obsidian 开发者文档](https://docs.obsidian.md/)
- [文档入口](./docs/README.md)
- [架构文档](./docs/architecture/README.md)
