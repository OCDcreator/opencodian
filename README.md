# OpenCodian

将 OpenCode AI 编程助手嵌入 Obsidian 侧边栏的插件。支持多种 LLM 提供商，包括 Claude、GPT 和本地模型。

## 特性

- 🤖 **多模型支持** - 支持 Claude、GPT、本地模型等
- 💻 **本地优先** - 可配置本地模型，数据不离开本地
- 💬 **多标签页** - 同时管理多个对话
- 🔒 **安全控制** - 权限模式和命令黑名单
- 📁 **Vault 集成** - 直接访问和操作 Obsidian 文件
- ⚡ **流式响应** - 实时显示 AI 回复

## 安装

### 前置要求

1. 安装 [Obsidian](https://obsidian.md/) (v1.4.5+)
2. 安装 OpenCode:
   ```bash
   npm install -g opencode-ai
   ```

### 安装插件

1. 下载最新版本的 OpenCodian
2. 解压到 Vault 的 `.obsidian/plugins/opencodian/` 目录
3. 在 Obsidian 设置中启用 OpenCodian
4. 配置模型提供商和 API 密钥

## 配置

### 服务器设置

- **自动启动** - 插件加载时自动启动 OpenCode 服务器
- **主机/端口** - 服务器监听地址（默认: 127.0.0.1:4096）

### 模型设置

- **默认提供商** - 选择要使用的 AI 提供商
- **默认模型** - 选择具体的模型 ID

示例提供商配置:
- **Anthropic** - `claude-3-5-sonnet-20241022`
- **OpenAI** - `gpt-4`
- **Local** - 本地 vLLM/Ollama 服务

### 安全设置

- **权限模式**
  - YOLO - 自动批准所有操作
  - Normal - 需要用户确认
  - Plan - 计划模式

- **命令黑名单** - 阻止危险的 bash 命令
- **外部访问** - 是否允许访问 Vault 外部文件

## 使用

### 基本用法

1. 点击侧边栏的机器人图标或运行命令 "OpenCodian: Open chat view"
2. 在输入框中输入问题或指令
3. 按 Enter 发送，Shift+Enter 换行
4. 按 Escape 取消正在进行的回复

### 命令

- **OpenCodian: Open chat view** - 打开聊天视图
- **OpenCodian: New conversation** - 开始新对话
- **OpenCodian: Inline edit** - 行内编辑选中的文本

## 开发

### 项目结构

```
src/
├── core/
│   ├── opencode/       # OpenCode SDK 封装
│   ├── storage/        # 存储层
│   ├── types/          # 类型定义
│   └── tools/          # 工具定义
├── features/
│   ├── chat/           # 聊天功能
│   ├── settings/       # 设置面板
│   └── inline-edit/    # 行内编辑
├── shared/             # 共享组件
├── i18n/               # 国际化
└── utils/              # 工具函数
```

### 开发命令

```bash
# 安装依赖
npm install

# 检查 esbuild 是否匹配当前系统
npm run doctor:esbuild

# 切换 Windows/macOS 后，自动重装当前平台依赖
npm run doctor:esbuild:fix

# 开发模式（自动编译）
npm run dev

# 生产构建
npm run build

# 类型检查
npm run typecheck

# 运行测试
npm run test

# 代码检查
npm run lint
```

### 双环境开发说明

如果你在同一个仓库目录里来回切换 Windows 和 macOS，`node_modules/` 里的原生依赖会互相覆盖，`esbuild` 最容易先报错。

- **根因**：`package-lock.json` 可以跨平台共享，但 `node_modules/` 不能跨平台复用。
- **推荐方案**：每个系统各用一个独立 clone / worktree，只同步源码和锁文件，不共享 `node_modules/`。
- **单目录折中方案**：每次切换系统后先运行 `npm run doctor:esbuild:fix`，再继续 `npm run dev` 或 `npm run build`。

## 架构

OpenCodian 使用客户端/服务器架构：

```
┌─────────────┐      HTTP/SSE      ┌──────────────┐      API
│  Obsidian   │ ◄────────────────► │ OpenCode     │ ◄────────► LLM
│  OpenCodian │                    │ Server       │
│  (Plugin)   │  @opencode-ai/sdk  │ (Node.js)    │
└─────────────┘                    └──────────────┘
```

### 与 Claudian 的区别

| 特性 | Claudian | OpenCodian |
|------|----------|------------|
| 后端 | Claude Agent SDK | OpenCode Server |
| 模型 | 仅限 Claude | 多提供商 |
| 开源 | 闭源 SDK | 完全开源 |
| 本地模型 | 不支持 | 支持 |

## 常见问题

### Q: OpenCode 服务器无法启动？
A: 确保已安装 OpenCode: `npm install -g opencode-ai`，检查端口 4096 是否被占用。

### Q: 如何配置本地模型？
A: 在 OpenCode 配置中添加本地提供商，指向你的 vLLM/Ollama 服务地址。

### Q: 支持哪些文件操作？
A: 支持读取、写入、编辑 Vault 中的文件，以及执行 bash 命令（受权限控制）。

### Q: 为什么 `npm run build` 提示 esbuild 平台不匹配？
A: 这是因为当前 `node_modules/` 是在另一个系统里安装的。先运行 `npm run doctor:esbuild:fix`。如果你长期双环境开发，建议每个系统使用独立工作目录。

## 许可证

MIT License

## 致谢

- 灵感来源于 [Claudian](https://github.com/YishenTu/claudian) 插件
- 使用 [OpenCode](https://opencode.ai/) 作为 AI 后端
