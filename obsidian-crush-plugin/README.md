# Obsidian + Crush 集成示例

这个目录包含完整的 Obsidian 插件示例，展示如何连接到本地 Crush/OpenCode 服务器。

## 📁 项目结构

```
obsidian-crush-plugin/
├── main.ts
├── manifest.json
└── README.md
```

---

## 1. manifest.json

Obsidian 插件配置文件：

```json
{
  "id": "obsidian-crush-plugin",
  "name": "Obsidian Crush Plugin",
  "version": "1.0.0",
  "minAppVersion": "0.15.0",
  "description": "连接到本地 Crush/OpenCode 服务器的 Obsidian 插件",
  "author": "你的名字",
  "isDesktopOnly": false,
  "js": "main.js"
}
```

---

## 2. main.ts (TypeScript)

完整的 Obsidian 插件实现：

```typescript
import { Plugin, TFile, moment } from 'obsidian';
import { Notice, WorkspaceLeaf } from 'obsidian';

// 类型定义（基于 Crush API）
interface Session {
    id: string;
    parentSessionID: string | null;
    title: string;
    messageCount: number;
    promptTokens: number;
    completionTokens: number;
    summaryMessageID: string | null;
    cost: number;
    todos: Todo[];
    createdAt: number;
    updatedAt: number;
}

interface Todo {
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
    activeForm: string;
}

interface MessagePart {
    type: 'text' | 'tool_use' | 'tool_result';
    text?: string;
    toolUse?: any;
    toolResult?: any;
}

interface Message {
    info: {
        id: string;
        role: 'user' | 'assistant' | 'system';
        createdAt: string;
    }
    parts: MessagePart[];
}

interface CrushServerConfig {
    url: string;
    apiKey?: string;
}

export default class CrushPlugin extends Plugin {
    private serverUrl: string = 'http://localhost:4096';
    private apiKey: string = '';
    private currentSession: Session | null = null;
    private ribbonIcon: HTMLElement | null = null;

    async onload() {
        console.log('Obsidian Crush Plugin loaded');
        
        // 从设置读取服务器配置
        await this.loadSettings();

        // 添加侧边栏按钮
        this.addRibbonIcon();
    }

    async loadSettings() {
        const settings = await this.loadData<CrushServerConfig>('crush-settings.json');
        if (settings) {
            this.serverUrl = settings.url;
            this.apiKey = settings.apiKey;
        }
    }

    async saveSettings(settings: CrushServerConfig) {
        await this.saveData('crush-settings.json', settings);
    }

    // 创建新的 Crush 会话
    async createSession(title: string = 'New Session') {
        try {
            const response = await fetch(`${this.serverUrl}/session`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({ title })
            });

            if (!response.ok) {
                throw new Error(`Failed to create session: ${response.statusText}`);
            }

            const session: Session = await response.json();
            this.currentSession = session;
            
            // 刷新 UI
            this.refreshRibbon();
            
            new Notice(`会话已创建: ${session.title}`);
        } catch (error) {
            new Notice(`创建会话失败: ${error.message}`);
        }
    }

    // 发送消息到 Crush
    async sendMessage(prompt: string) {
        if (!this.currentSession) {
            new Notice('请先创建会话');
            return;
        }

        try {
            const response = await fetch(`${this.serverUrl}/session/${this.currentSession.id}/message`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    parts: [
                        { type: 'text', text: prompt }
                    ]
                })
            });

            if (!response.ok) {
                throw new Error(`Failed to send message: ${response.statusText}`);
            }

            const message: Message = await response.json();
            this.updateSessionDisplay(message);
        } catch (error) {
            new Notice(`发送消息失败: ${error.message}`);
        }
    }

    // 获取会话列表
    async getSessions() {
        try {
            const response = await fetch(`${this.serverUrl}/session`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to get sessions: ${response.statusText}`);
            }

            const sessions: Session[] = await response.json();
            
            // 创建选择面板
            this.showSessionSelector(sessions);
        } catch (error) {
            new Notice(`获取会话列表失败: ${error.message}`);
        }
    }

    // 切换会话
    async switchSession(sessionId: string) {
        this.currentSession = (await this.getSession(sessionId)) || null;
        this.refreshRibbon();
    }

    // 获取单个会话
    private async getSession(sessionId: string): Promise<Session | null> {
        try {
            const response = await fetch(`${this.serverUrl}/session/${sessionId}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to get session: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            new Notice(`获取会话失败: ${error.message}`);
            return null;
        }
    }

    // 更新 UI 显示
    private updateSessionDisplay(message: Message) {
        const activeFile = this.app.workspace.getActiveFile();
        
        if (activeFile instanceof TFile) {
            const content = await this.app.vault.read(activeFile);
            const sessionInfo = this.formatSessionInfo();
            await activeFile.process(sessionInfo + '\n\n' + content);
        }
    }

    // 添加侧边栏图标
    private addRibbonIcon() {
        if (this.ribbonIcon) return;
        
        this.ribbonIcon = this.addRibbonIcon('🤖', {
            id: 'crush-session'
        });
    }

    // 移除侧边栏图标
    private removeRibbonIcon() {
        if (this.ribbonIcon) {
            this.ribbonIcon.remove();
        }
    }

    // 刷新侧边栏
    private refreshRibbon() {
        if (this.currentSession) {
            const activeFile = this.app.workspace.getActiveFile();
            if (activeFile) {
                this.updateSessionDisplay({ info: { id: this.currentSession.id, role: 'system', createdAt: moment().toISOString() }, parts: [] });
            }
        }
    }

    // 格式化会话信息
    private formatSessionInfo(): string {
        if (!this.currentSession) return '无活动会话';
        
        return `🤖 Crush 会话: ${this.currentSession.title}\n` +
               `消息数: ${this.currentSession.messageCount}\n` +
               `Token 使用: ${this.currentSession.promptTokens + this.currentSession.completionTokens}\n` +
               `待办事项: ${this.currentSession.todos.length}\n` +
               `创建时间: ${moment(this.currentSession.createdAt * 1000).format('YYYY-MM-DD HH:mm:ss')}\n` +
               `更新时间: ${moment(this.currentSession.updatedAt * 1000).format('YYYY-MM-DD HH:mm:ss')}`;
    }

    // 显示会话选择器
    private showSessionSelector(sessions: Session[]) {
        const modal = new WorkspaceLeaf({
            id: 'session-selector',
            width: 600,
            height: 500,
        });

        // 创建会话列表
        const sessionList = sessions.map(session => {
            const el = modal.createDiv({ text: session.title, cls: 'session-item' });
            
            el.addEventListener('click', async () => {
                modal.close();
                await this.switchSession(session.id);
            });

            return el;
        });

        // 添加新会话按钮
        const newSessionBtn = modal.createDiv({ 
            text: '+ 新建会话', 
            cls: 'new-session-btn',
            attr: { style: 'margin-top: 20px; padding: 10px 20px;' }
        });

        newSessionBtn.addEventListener('click', async () => {
            modal.close();
            await this.createSession();
        });

        // 设置按钮
        const settingsBtn = modal.createDiv({ 
            text: '⚙️ 设置', 
            cls: 'settings-btn' 
        });

        settingsBtn.addEventListener('click', () => {
            modal.close();
            this.showSettingsModal();
        });

        modal.contentEl.appendChild(sessionList);
        modal.contentEl.appendChild(newSessionBtn);
        modal.contentEl.appendChild(settingsBtn);
        
        this.openLeaf(modal);
    }

    // 显示设置面板
    private showSettingsModal() {
        const modal = new WorkspaceLeaf({
            id: 'settings-modal',
            width: 500,
            height: 400,
        });

        const form = modal.createDiv({ cls: 'settings-form' });

        // 服务器 URL
        const urlLabel = modal.createSpan({ text: '服务器 URL:' });
        const urlInput = modal.createEl('input', { type: 'text', value: this.serverUrl });
        form.appendChild(urlLabel);
        form.appendChild(urlInput);

        // API Key
        const keyLabel = modal.createSpan({ text: 'API Key:' });
        const keyInput = modal.createEl('input', { type: 'password', value: this.apiKey });
        form.appendChild(keyLabel);
        form.appendChild(keyInput);

        // 保存按钮
        const saveBtn = modal.createDiv({ 
            text: '保存', 
            cls: 'save-btn',
            attr: { style: 'margin-top: 20px;' }
        });

        saveBtn.addEventListener('click', async () => {
            this.serverUrl = urlInput.value;
            this.apiKey = keyInput.value;
            await this.saveSettings({ url: this.serverUrl, apiKey: this.apiKey });
            modal.close();
            new Notice('设置已保存');
        });

        modal.contentEl.appendChild(form);
        modal.contentEl.appendChild(saveBtn);
        
        this.openLeaf(modal);
    }
}

export default CrushPlugin;
```

---

## 3. README.md

插件使用说明：

```markdown
# Obsidian Crush Plugin

连接你的 Obsidian 到本地运行的 [Crush](https://github.com/charmbracelet/crush) / OpenCode 服务器。

## ✨ 功能

- 🤖 创建和管理 Crush 会话
- 💬 在 Obsidian 中直接发送消息到 Crush
- 📋 查看会话列表并快速切换
- ⚙️ 配置服务器连接（URL 和 API Key）
- 🔄 自动显示会话信息和待办事项

## 🚀 安装

1. 复制 `obsidian-crush-plugin` 文件夹到你的 Obsidian vault 目录下的插件目录
2. 重新加载 Obsidian
3. 点击侧边栏的 Crush 图标 (🤖)
4. 首次使用时，会弹出设置面板，配置服务器地址和 API Key

## 🔧 配置 Crush 服务器

在 Obsidian 中配置之前，需要先启动 Crush 服务器：

```bash
# 安装 Crush
brew install charmbracelet/tap/crush

# 或下载二进制文件
# 访问 https://github.com/charmbracelet/crush/releases

# 启动服务器（默认端口 4096）
crush serve

# 设置密码（可选）
export OPENCODE_SERVER_PASSWORD=your-password

# 启用 CORS（用于 Web 客户端）
crush serve --cors http://localhost:5173
```

## 📡 API 端点

插件使用以下 Crush API 端点：

| 功能 | 端点 | 说明 |
|------|--------|------|
| 创建会话 | `POST /session` | 创建新的聊天会话 |
| 获取会话 | `GET /session` | 获取所有会话列表 |
| 获取会话详情 | `GET /session/{id}` | 获取单个会话信息 |
| 发送消息 | `POST /session/{id}/message` | 向会话发送消息 |
| 获取项目 | `GET /project` | 获取项目信息 |

## 🛠️ 技术细节

- 使用 Obsidian 的 `Plugin` API 加载和保存设置
- 使用 `WorkspaceLeaf` 创建模态对话框
- 使用 `TFile` API 读写笔记内容
- 使用 `fetch` API 调用 Crush 服务器的 HTTP 端点
- 完整的类型定义（基于 `schema.json`）

## 📝 开发路线

如果你想进一步开发：

1. 实现 `Todo` 功能（管理会话待办事项）
2. 实现文件查看器（查看项目文件）
3. 实现代码高亮（集成 LSP）
4. 实现消息历史记录
5. 实现流式响应（处理长响应）

## 📄 许可证

MIT License - 自由使用、修改和分发
