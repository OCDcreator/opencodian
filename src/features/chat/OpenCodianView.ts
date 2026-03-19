/**
 * OpenCodian View
 * 
 * Main sidebar view for the OpenCodian chat interface.
 */

import type { EventRef, WorkspaceLeaf } from 'obsidian';
import { Component, ItemView, Menu, Notice, Scope, setIcon } from 'obsidian';

import { VIEW_TYPE_OPENCODIAN } from '../../core/types';
import type { ChatMessage, Conversation } from '../../core/types';
import { OpenCodeService } from '../../core/opencode';
import type OpenCodianPlugin from '../../main';
import { MarkdownRenderService } from '../../utils/markdown';

/** Logo SVG */
const LOGO_SVG = {
  viewBox: '0 0 24 24',
  width: '24',
  height: '24',
  path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z',
  fill: 'currentColor',
};

export class OpenCodianView extends ItemView {
  private plugin: OpenCodianPlugin;
  private chatContainerEl: HTMLElement | null = null;
  private messagesContainer: HTMLElement | null = null;
  private inputContainer: HTMLElement | null = null;
  private currentConversation: Conversation | null = null;
  private isStreaming = false;

  // Event refs for cleanup
  private eventRefs: EventRef[] = [];

  constructor(leaf: WorkspaceLeaf, plugin: OpenCodianPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_OPENCODIAN;
  }

  getDisplayText(): string {
    return 'OpenCodian';
  }

  getIcon(): string {
    return 'bot';
  }

  async onOpen() {
    // Build UI
    this.buildUI();

    // Wire events
    this.wireEventHandlers();

    // Create or load conversation
    if (this.plugin.getConversations().length === 0) {
      await this.createNewConversation();
    } else {
      await this.loadConversation(this.plugin.getConversations()[0].id);
    }
  }

  async onClose() {
    // Cleanup event refs
    for (const ref of this.eventRefs) {
      this.plugin.app.vault.offref(ref);
    }
    this.eventRefs = [];
  }

  /** Build the UI structure */
  private buildUI() {
    this.chatContainerEl = this.contentEl.createDiv({ cls: 'opencodian-container' });

    // Header
    const header = this.chatContainerEl.createDiv({ cls: 'opencodian-header' });
    this.buildHeader(header);

    // Messages area
    this.messagesContainer = this.chatContainerEl.createDiv({ cls: 'opencodian-messages' });

    // Input area
    this.inputContainer = this.chatContainerEl.createDiv({ cls: 'opencodian-input-area' });
    this.buildInputArea(this.inputContainer);
  }

  /** Build header */
  private buildHeader(header: HTMLElement) {
    // Logo and title
    const titleEl = header.createDiv({ cls: 'opencodian-title' });
    
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', LOGO_SVG.viewBox);
    svg.setAttribute('width', LOGO_SVG.width);
    svg.setAttribute('height', LOGO_SVG.height);
    svg.setAttribute('fill', LOGO_SVG.fill);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', LOGO_SVG.path);
    svg.appendChild(path);
    titleEl.appendChild(svg);

    titleEl.createEl('span', { text: 'OpenCodian' });

    // Actions
    const actions = header.createDiv({ cls: 'opencodian-header-actions' });

    // New conversation button
    const newBtn = actions.createDiv({ cls: 'opencodian-header-btn' });
    setIcon(newBtn, 'plus');
    newBtn.setAttribute('aria-label', 'New conversation');
    newBtn.addEventListener('click', () => {
      void this.createNewConversation();
    });

    // History button
    const historyBtn = actions.createDiv({ cls: 'opencodian-header-btn' });
    setIcon(historyBtn, 'history');
    historyBtn.setAttribute('aria-label', 'History');
    historyBtn.addEventListener('click', (event) => {
      this.showConversationHistory(event);
    });

    // Settings button
    const settingsBtn = actions.createDiv({ cls: 'opencodian-header-btn' });
    setIcon(settingsBtn, 'settings');
    settingsBtn.setAttribute('aria-label', 'Settings');
    settingsBtn.addEventListener('click', () => {
      // @ts-ignore - Obsidian API
      this.app.setting.open();
      // @ts-ignore - Obsidian API
      this.app.setting.openTabById('opencodian');
    });
  }

  /** Build input area */
  private buildInputArea(container: HTMLElement) {
    const inputWrapper = container.createDiv({ cls: 'opencodian-input-wrapper' });
    
    const textarea = inputWrapper.createEl('textarea', {
      cls: 'opencodian-input',
      attr: { placeholder: 'Ask anything...', rows: '1' },
    });

    // Auto-resize textarea
    textarea.addEventListener('input', () => {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    });

    // Send on Enter (Shift+Enter for new line)
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const message = textarea.value.trim();
        if (message && !this.isStreaming) {
          void this.sendMessage(message);
          textarea.value = '';
          textarea.style.height = 'auto';
        }
      }
    });

    // Send button
    const sendBtn = inputWrapper.createDiv({ cls: 'opencodian-send-btn' });
    setIcon(sendBtn, 'send');
    sendBtn.addEventListener('click', () => {
      const message = textarea.value.trim();
      if (message && !this.isStreaming) {
        void this.sendMessage(message);
        textarea.value = '';
        textarea.style.height = 'auto';
      }
    });

    // Model selector
    const modelSelector = container.createDiv({ cls: 'opencodian-model-selector' });
    modelSelector.createEl('span', { text: 'Model: ' });
    const modelSelect = modelSelector.createEl('select');
    modelSelect.createEl('option', { value: 'default', text: 'Default' });
    
    // TODO: Populate with available models from OpenCode
  }

  /** Wire event handlers */
  private wireEventHandlers() {
    // Escape to cancel streaming
    this.scope = new Scope(this.app.scope);
    this.scope.register([], 'Escape', () => {
      if (this.isStreaming) {
        this.cancelStreaming();
      }
      return false;
    });

    // File open event
    this.registerEvent(
      this.plugin.app.workspace.on('file-open', (file) => {
        if (file && this.currentConversation) {
          this.currentConversation.currentNote = file.path;
        }
      })
    );
  }

  /** Create a new conversation */
  private async createNewConversation() {
    try {
      const conversation = await this.plugin.createConversation();
      await this.loadConversation(conversation.id);
      new Notice('New conversation started');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to create conversation';
      new Notice(msg);
    }
  }

  /** Load a conversation */
  private async loadConversation(id: string) {
    const conversation = this.plugin.getConversationById(id);
    if (!conversation) return;

    this.currentConversation = conversation;

    // Clear messages display
    this.messagesContainer?.empty();

    // Set session in service
    this.plugin.openCodeService.setSessionId(conversation.openCodeSessionId);

    // Load messages from OpenCode
    try {
      const messages = await this.plugin.openCodeService.getSessionMessages(
        conversation.openCodeSessionId
      );

      // Render messages
      for (const { info, parts } of messages) {
        const message = OpenCodeService.openCodeMessageToChatMessage(
          info,
          parts
        );
        this.renderMessage(message);
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
    }

    // Scroll to bottom
    this.scrollToBottom();
  }

  /** Show conversation history */
  private showConversationHistory(event: MouseEvent) {
    const conversations = this.plugin.getConversations();
    
    if (conversations.length === 0) {
      new Notice('No conversation history');
      return;
    }

    const menu = new Menu();
    
    // Add each conversation to the menu
    for (const conv of conversations) {
      const isActive = this.currentConversation?.id === conv.id;
      const title = conv.title || 'Untitled';
      const date = new Date(conv.updatedAt).toLocaleDateString();
      
      menu.addItem((item) => {
        item
          .setTitle(`${title}${isActive ? ' (current)' : ''}`)
          .setIcon(isActive ? 'check' : 'message-square')
          .setSection('conversations')
          .onClick(() => {
            if (!isActive) {
              void this.loadConversation(conv.id);
            }
          });
        
        // Add tooltip with creation date
        const el = item.dom as HTMLElement;
        el.setAttribute('title', `Created: ${date}`);
      });
    }
    
    // Add separator and delete options
    if (conversations.length > 0) {
      menu.addSeparator();
      
      menu.addItem((item) => {
        item
          .setTitle('Delete current conversation')
          .setIcon('trash')
          .setSection('actions')
          .onClick(() => {
            void this.deleteCurrentConversation();
          });
      });
      
      if (conversations.length > 1) {
        menu.addItem((item) => {
          item
            .setTitle('Delete all conversations')
            .setIcon('trash-2')
            .setSection('actions')
            .onClick(() => {
              void this.deleteAllConversations();
            });
        });
      }
    }
    
    // Show the menu below the history button
    menu.showAtMouseEvent(event);
  }

  /** Delete current conversation */
  private async deleteCurrentConversation() {
    if (!this.currentConversation) return;
    
    const confirmed = confirm(
      `Are you sure you want to delete "${this.currentConversation.title}"?`
    );
    if (!confirmed) return;
    
    const deletedId = this.currentConversation.id;
    await this.plugin.deleteConversation(deletedId);
    
    // Load another conversation or create new one
    const remaining = this.plugin.getConversations();
    if (remaining.length > 0) {
      await this.loadConversation(remaining[0].id);
    } else {
      await this.createNewConversation();
    }
    
    new Notice('Conversation deleted');
  }

  /** Delete all conversations */
  private async deleteAllConversations() {
    const confirmed = confirm(
      'Are you sure you want to delete ALL conversations? This cannot be undone.'
    );
    if (!confirmed) return;
    
    const conversations = this.plugin.getConversations();
    for (const conv of conversations) {
      await this.plugin.deleteConversation(conv.id);
    }
    
    await this.createNewConversation();
    new Notice('All conversations deleted');
  }

  /** Send a message */
  private async sendMessage(content: string) {
    if (!this.currentConversation) {
      await this.createNewConversation();
    }

    if (!this.currentConversation) return;

    // Add user message to UI
    this.renderMessage({
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
    });

    this.isStreaming = true;
    this.scrollToBottom();

    // Stream response
    const stream = this.plugin.openCodeService.sendMessage(content, {
      sessionId: this.currentConversation.openCodeSessionId,
    });

    let assistantMessage = '';
    const messageEl = this.createAssistantMessageElement();

    try {
      for await (const chunk of stream) {
        if (chunk.type === 'text') {
          // Accumulate the message content
          assistantMessage += chunk.content;
          // Update the display with full content
          this.updateMessageContent(messageEl, assistantMessage);
          console.log('[OpenCodianView] Received chunk:', chunk.content.substring(0, 50) + '...');
        } else if (chunk.type === 'tool_use') {
          this.renderToolUse(chunk.name, chunk.input);
        } else if (chunk.type === 'error') {
          console.error('[OpenCodianView] Stream error:', chunk.content);
          new Notice(chunk.content);
          break;
        } else if (chunk.type === 'message_start') {
          console.log('[OpenCodianView] Message stream started');
        } else if (chunk.type === 'message_stop') {
          console.log('[OpenCodianView] Message stream stopped');
        }
        this.scrollToBottom();
      }
      
      console.log('[OpenCodianView] Final message:', assistantMessage.substring(0, 100) + '...');
    } finally {
      this.isStreaming = false;
    }

    // Update conversation
    this.currentConversation.updatedAt = Date.now();
    await this.plugin.storage.saveConversation(this.currentConversation);
  }

  /** Cancel streaming */
  private cancelStreaming() {
    // TODO: Implement cancel logic
    this.isStreaming = false;
    new Notice('Streaming cancelled');
  }

  /** Render a message */
  private renderMessage(message: { id: string; role: string; content: string; timestamp: number }) {
    const messageEl = this.messagesContainer?.createDiv({
      cls: `opencodian-message opencodian-message--${message.role}`,
    });

    if (!messageEl) return;

    // Avatar
    const avatar = messageEl.createDiv({ cls: 'opencodian-message-avatar' });
    if (message.role === 'assistant') {
      setIcon(avatar, 'bot');
    } else {
      setIcon(avatar, 'user');
    }

    // Content
    const content = messageEl.createDiv({ cls: 'opencodian-message-content' });
    content.createEl('div', { cls: 'opencodian-message-text', text: message.content });

    // Timestamp
    const time = new Date(message.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    content.createEl('div', { cls: 'opencodian-message-time', text: time });

    return messageEl;
  }

  /** Create assistant message element for streaming */
  private createAssistantMessageElement(): HTMLElement {
    const messageEl = this.messagesContainer?.createDiv({
      cls: 'opencodian-message opencodian-message--assistant',
    });

    if (!messageEl) return document.createElement('div');

    const avatar = messageEl.createDiv({ cls: 'opencodian-message-avatar' });
    setIcon(avatar, 'bot');

    const content = messageEl.createDiv({ cls: 'opencodian-message-content' });
    content.createEl('div', { cls: 'opencodian-message-text' });

    return content.querySelector('.opencodian-message-text') as HTMLElement || messageEl;
  }

  /** Update message content during streaming */
  private updateMessageContent(element: HTMLElement, content: string) {
    element.textContent = content;
  }

  /** Render tool use */
  private renderToolUse(name: string, input: Record<string, unknown>) {
    const toolEl = this.messagesContainer?.createDiv({ cls: 'opencodian-tool-use' });
    if (!toolEl) return;

    const header = toolEl.createDiv({ cls: 'opencodian-tool-header' });
    setIcon(header.createDiv({ cls: 'opencodian-tool-icon' }), 'wrench');
    header.createEl('span', { text: name });

    const inputEl = toolEl.createEl('pre', { cls: 'opencodian-tool-input' });
    inputEl.textContent = JSON.stringify(input, null, 2);
  }

  /** Scroll to bottom of messages */
  private scrollToBottom() {
    if (this.messagesContainer) {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
  }
}
