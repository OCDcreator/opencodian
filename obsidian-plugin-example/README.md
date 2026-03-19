# Obsidian + OpenCode 插件示例

基于 `@opencode-ai/sdk` 的完整 Obsidian 插件示例。

## 📦 项目结构

```
obsidian-opencode-plugin/
├── manifest.json
├── package.json
├── tsconfig.json
├── main.ts
└── README.md
```

---

## 1. 安装依赖

```bash
# 创建项目目录
mkdir obsidian-opencode-plugin
cd obsidian-opencode-plugin

# 初始化 npm
npm init -y

# 安装依赖
npm install @opencode-ai/sdk
npm install -D typescript @types/node obsidian
```

---

## 2. package.json

```json
{
  "name": "obsidian-opencode-plugin",
  "version": "1.0.0",
  "description": "Obsidian 插件 - 连接本地 OpenCode 服务器",
  "main": "main.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsc -w"
  },
  "dependencies": {
    "@opencode-ai/sdk": "^1.2.27"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0",
    "obsidian": "latest"
  }
}
```

---

## 3. manifest.json

```json
{
  "id": "obsidian-opencode-plugin",
  "name": "Obsidian OpenCode Plugin",
  "version": "1.0.0",
  "minAppVersion": "0.15.0",
  "description": "连接到本地 OpenCode 服务器的 Obsidian 插件",
  "author": "Your Name",
  "isDesktopOnly": false
}
```

---

## 4. tsconfig.json

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "inlineSourceMap": true,
    "inlineSources": true,
    "module": "ESNext",
    "target": "ES6",
    "allowJs": true,
    "noImplicitAny": true,
    "moduleResolution": "node",
    "importHelpers": true,
    "isolatedModules": true,
    "strictNullChecks": true,
    "outDir": "./",
    "lib": ["node_modules/types"]
  },
  "include": ["**/*.ts"]
}
```

---

## 5. main.ts (完整实现)

```typescript
import { Plugin, TFile, Notice, WorkspaceLeaf } from 'obsidian';
import { createOpencodeClient } from '@opencode-ai/sdk';

// 类型定义
interface Session {
    data: {
        id: string;
        title?: string;
        messageCount?: number;
    };
}

interface MessageResponse {
    data: {
        id: string;
        role: 'user' | 'assistant';
        parts: Array<{
            type: 'text' | 'file';
            text?: string;
            url?: string;
        }>;
    };
}

export default class OpenCodePlugin extends Plugin {
    private client: ReturnType<typeof createOpencodeClient> | null = null;
    private serverUrl: string = 'http://localhost:4096';
    private currentSession: Session | null = null;

    async onload() {
        console.log('OpenCode Obsidian Plugin loaded');

        // 初始化 OpenCode 客户端
        this.client = createOpencodeClient({
            baseUrl: this.serverUrl
        });

        // 添加命令
        this.addCommand({
            id: 'opencode-create-session',
            name: '创建 OpenCode 会话',
            callback: () => this.createSession()
        });

        this.addCommand({
            id: 'opencode-send-message',
            name: '发送消息到 OpenCode',
            callback: () => this.sendMessage()
        });

        // 添加侧边栏图标
        this.addRibbonIcon('bot', 'OpenCode', '点击打开 OpenCode', () => {
            this.showSessionManager();
        });
    }

    // 创建新会话
    async createSession() {
        try {
            if (!this.client) {
                new Notice('OpenCode 客户端未初始化');
                return;
            }

            const session = await this.client.session.create();
            this.currentSession = session;
            
            new Notice(`会话已创建: ${session.data.id}`);
            
            // 在当前笔记中插入会话信息
            await this.insertSessionInfo(session);
        } catch (error) {
            console.error('创建会话失败:', error);
            new Notice(`创建会话失败: ${error.message}`);
        }
    }

    // 发送消息
    async sendMessage() {
        if (!this.currentSession) {
            new Notice('请先创建会话');
            return;
        }

        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice('请先打开一个文件');
            return;
        }

        try {
            const content = await this.app.vault.read(activeFile);
            const fileUrl = this.app.vault.getResourcePath(activeFile);

            const response = await this.client.session.prompt({
                path: { id: this.currentSession.data.id },
                body: {
                    parts: [
                        {
                            type: 'file',
                            mime: 'text/markdown',
                            url: fileUrl
                        },
                        {
                            type: 'text',
                            text: '请分析这个文件并提供改进建议：'
                        }
                    ]
                }
            });

            await this.displayResponse(response, activeFile);
            new Notice('消息已发送');
        } catch (error) {
            console.error('发送消息失败:', error);
            new Notice(`发送消息失败: ${error.message}`);
        }
    }

    // 在笔记中插入会话信息
    private async insertSessionInfo(session: Session) {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) return;

        const content = await this.app.vault.read(activeFile);
        const sessionInfo = `\n\n---\n**OpenCode 会话信息:**\n- 会话 ID: \`${session.data.id}\`\n- 创建时间: ${new Date().toISOString()}\n`;

        await this.app.vault.modify(activeFile, {
            type: 'append',
            text: sessionInfo
        });
    }

    // 显示响应
    private async displayResponse(response: MessageResponse, file: TFile) {
        const textParts = response.data.parts
            .filter(p => p.type === 'text')
            .map(p => p.text)
            .join('\n\n');

        const responseSection = `\n\n---\n**OpenCode 响应:**\n${textParts}\n`;

        await this.app.vault.modify(file, {
            type: 'append',
            text: responseSection
        });
    }

    // 显示会话管理器
    private showSessionManager() {
        const leaf = this.app.workspace.getLeaf('tab');
        if (!leaf) return;

        // 创建简单的管理界面
        const container = leaf.view.containerEl;
        container.empty();
        
        const div = container.createDiv();
        div.innerHTML = `
            <div style="padding: 20px;">
                <h2>OpenCode 会话管理</h2>
                <p>当前会话: ${this.currentSession?.data.id || '无'}</p>
                <button id="create-btn">创建新会话</button>
                <button id="send-btn">发送消息</button>
            </div>
        `;

        div.querySelector('#create-btn')?.addEventListener('click', () => {
            this.createSession();
        });

        div.querySelector('#send-btn')?.addEventListener('click', () => {
            this.sendMessage();
        });
    }

    onunload() {
        console.log('OpenCode Obsidian Plugin unloaded');
    }
}
```

---

## 6. 编译和使用

### 编译

```bash
# 编译 TypeScript
npm run build

# 或开发模式（自动重新编译）
npm run dev
```

### 安装到 Obsidian

1. 将以下文件复制到你的 Obsidian vault 的插件目录:
   ```
   你的vault/.obsidian/plugins/obsidian-opencode-plugin/
   ├── manifest.json
   ├── main.js (编译后)
   └── styles.css (可选)
   ```

2. 重启 Obsidian

3. 在设置中启用插件

---

## 🎯 核心功能

- ✅ 创建 OpenCode 会话
- ✅ 发送消息到 OpenCode
- ✅ 自动读取当前笔记内容
- ✅ 在笔记中显示响应
- ✅ 侧边栏快捷操作

---

## 📡 API 参考

### client.session.create()

创建新的 OpenCode 会话。

```typescript
const session = await client.session.create()
console.log(session.data.id) // 会话 ID
```

### client.session.prompt()

发送消息到会话。

```typescript
const response = await client.session.prompt({
    path: { id: session.data.id },
    body: {
        parts: [
            { type: 'file', mime: 'text/plain', url: 'file:///path/to/file' },
            { type: 'text', text: '你的提示词' }
        ]
    }
})
```

---

## ⚙️ 重要提示

1. **OpenCode 服务器**: 确保本地 OpenCode 服务器正在运行
2. **文件路径**: OpenCode 需要能够访问文件路径
3. **异步操作**: 所有 SDK 调用都是异步的
4. **错误处理**: 务必添加 try-catch 错误处理

---

## 🔗 相关资源

- **OpenCode GitHub**: https://github.com/anomalyco/opencode
- **OpenCode 文档**: https://opencode.ai/docs
- **SDK 源码**: https://github.com/anomalyco/opencode/tree/dev/packages/sdk
- **Obsidian 插件 API**: https://docs.obsidian.md/Reference/TypeScript+API

---

## 📄 许可证

MIT License
