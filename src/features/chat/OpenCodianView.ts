/**
 * OpenCodian View
 * 
 * Main sidebar view for the OpenCodian chat interface.
 */

import type { EventRef, WorkspaceLeaf } from 'obsidian';
import { Component, ItemView, Menu, Notice, Scope, setIcon } from 'obsidian';

import { VIEW_TYPE_OPENCODIAN } from '../../core/types';
import type { ChatMessage, ContentBlock, Conversation, ToolCallInfo } from '../../core/types';
import { OpenCodeService } from '../../core/opencode';
import type OpenCodianPlugin from '../../main';
import { MarkdownRenderService } from '../../utils/markdown';
import { ProviderIconService } from '../../utils/icons/ProviderIconService';
import { StreamController, ThinkingBlockRenderer, ToolCallRenderer } from '../../utils/streaming';

/** Logo SVG for light theme (dark logo on light bg) - from opencode-logo-light.svg */
const LOGO_SVG_LIGHT = `<svg width="24" height="30" viewBox="0 0 240 300" fill="none" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#clip0_light)"><mask id="mask0_light" style="mask-type:luminance" maskUnits="userSpaceOnUse" x="0" y="0" width="240" height="300"><path d="M240 0H0V300H240V0Z" fill="white"/></mask><g mask="url(#mask0_light)"><path d="M180 240H60V120H180V240Z" fill="#CFCECD"/><path d="M180 60H60V240H180V60ZM240 300H0V0H240V300Z" fill="#211E1E"/></g></g><defs><clipPath id="clip0_light"><rect width="240" height="300" fill="white"/></clipPath></defs></svg>`;

/** Logo SVG for dark theme (light logo on dark bg) - from opencode-logo-dark.svg */
const LOGO_SVG_DARK = `<svg width="24" height="30" viewBox="0 0 240 300" fill="none" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#clip0_dark)"><mask id="mask0_dark" style="mask-type:luminance" maskUnits="userSpaceOnUse" x="0" y="0" width="240" height="300"><path d="M240 0H0V300H240V0Z" fill="white"/></mask><g mask="url(#mask0_dark)"><path d="M180 240H60V120H180V240Z" fill="#4B4646"/><path d="M180 60H60V240H180V60ZM240 300H0V0H240V300Z" fill="#F1ECEC"/></g></g><defs><clipPath id="clip0_dark"><rect width="240" height="300" fill="white"/></clipPath></defs></svg>`;

/** Pending indicator messages - randomly selected for variety */
const PENDING_MESSAGES = [
  // Technical
  'Booting up...',
  'Initializing...',
  'Loading modules...',
  'Processing...',
  'Computing...',
  'Analyzing...',
  'Thinking...',
  // Action
  'Getting to work...',
  'Diving in...',
  'Rolling up sleeves...',
  'Tackling this...',
  'On the case...',
  'Investigating...',
  'Exploring...',
  'Digging deeper...',
  // Casual
  'Bear with me...',
  'Hang tight...',
  'Just a sec...',
  'Working my magic...',
  'Almost there...',
  'Give me a moment...',
  // Whimsical
  'Asking the stars...',
  'Consulting ancient scrolls...',
  'Decoding the matrix...',
  'Channeling the cosmos...',
  'Peering into the abyss...',
];

/** Get a random pending message */
function getRandomPendingMessage(): string {
  return PENDING_MESSAGES[Math.floor(Math.random() * PENDING_MESSAGES.length)];
}

export class OpenCodianView extends ItemView {
  private plugin: OpenCodianPlugin;
  private chatContainerEl: HTMLElement | null = null;
  private messagesContainer: HTMLElement | null = null;
  private inputContainer: HTMLElement | null = null;
  private currentConversation: Conversation | null = null;
  private isStreaming = false;
  private markdownService: MarkdownRenderService | null = null;
  private messageComponent: Component;

  // Event refs for cleanup
  private eventRefs: EventRef[] = [];

  // Track rendered messages for streaming updates
  private streamingMessageEl: HTMLElement | null = null;
  private streamingContentEl: HTMLElement | null = null;

  // Model selector state
  private modelSelectorContainer: HTMLElement | null = null;
  private modelSelectorTrigger: HTMLElement | null = null;
  private modelSelectorDropdown: HTMLElement | null = null;
  private modelSelectorSearchInput: HTMLInputElement | null = null;
  private modelSelectorScrollContainer: HTMLElement | null = null;
  private availableModels: Array<{ provider: string; model: string; label: string; providerName: string; modelName: string }> = [];
  private availableProviders: Array<{ id: string; name: string; models: Array<{ id: string; name: string }> }> = [];
  private sessionModelOverrides: Map<string, { provider: string; model: string }> = new Map();
  private isModelDropdownOpen = false;
  private modelFilterQuery = '';
  private modelDropdownClickOutsideHandler: ((e: MouseEvent) => void) | null = null;

  // Streaming content state
  private streamController: StreamController | null = null;

  // Send/Stop button reference
  private sendBtn: HTMLElement | null = null;
  private inputTextarea: HTMLTextAreaElement | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: OpenCodianPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.messageComponent = new Component();
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

    // Initialize markdown service
    if (this.messagesContainer) {
      this.markdownService = new MarkdownRenderService({
        app: this.app,
        component: this.messageComponent,
        container: this.messagesContainer,
      });

      // Initialize streaming controller
      this.streamController = new StreamController({
        containerEl: this.messagesContainer,
        markdownService: this.markdownService,
        scrollToBottom: () => this.scrollToBottom(),
      });
    }

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

    // Cleanup markdown service
    this.messageComponent.unload();
    this.markdownService = null;
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
    
    // Create logo container
    const logoContainer = titleEl.createDiv({ cls: 'opencodian-logo' });
    logoContainer.innerHTML = this.getLogoSvg();

    titleEl.createEl('span', { text: 'OpenCodian', cls: 'opencodian-title-text' });
    
    // Listen for theme changes
    this.registerEvent(
      this.app.workspace.on('css-change', () => {
        logoContainer.innerHTML = this.getLogoSvg();
      })
    );

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

  /** Get logo SVG based on current theme */
  private getLogoSvg(): string {
    // Check if we're in dark mode by looking for .theme-dark class
    const isDark = document.body.classList.contains('theme-dark');
    return isDark ? LOGO_SVG_DARK : LOGO_SVG_LIGHT;
  }

  /** Build input area */
  private buildInputArea(container: HTMLElement) {
    const inputWrapper = container.createDiv({ cls: 'opencodian-input-wrapper' });
    
    this.inputTextarea = inputWrapper.createEl('textarea', {
      cls: 'opencodian-input',
      attr: { placeholder: 'Ask anything...', rows: '1' },
    });

    // Auto-resize textarea
    this.inputTextarea.addEventListener('input', () => {
      if (this.inputTextarea) {
        this.inputTextarea.style.height = 'auto';
        this.inputTextarea.style.height = `${Math.min(this.inputTextarea.scrollHeight, 200)}px`;
      }
    });

    // Send on Enter (Shift+Enter for new line)
    this.inputTextarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (this.inputTextarea && !this.isStreaming) {
          const message = this.inputTextarea.value.trim();
          if (message) {
            void this.sendMessage(message);
            this.inputTextarea.value = '';
            this.inputTextarea.style.height = 'auto';
          }
        }
      }
    });

    // Send/Stop button
    this.sendBtn = inputWrapper.createDiv({ cls: 'opencodian-send-btn' });
    setIcon(this.sendBtn, 'send');
    this.sendBtn.addEventListener('click', () => {
      if (this.isStreaming) {
        // Stop streaming
        this.cancelStreaming();
      } else if (this.inputTextarea) {
        const message = this.inputTextarea.value.trim();
        if (message) {
          void this.sendMessage(message);
          this.inputTextarea.value = '';
          this.inputTextarea.style.height = 'auto';
        }
      }
    });

    // Bottom toolbar for model selector and future buttons
    const toolbar = container.createDiv({ cls: 'opencodian-input-toolbar' });
    
    // Left side: Model selector (opencode-style)
    this.modelSelectorContainer = toolbar.createDiv({ cls: 'opencodian-model-selector' });
    this.initializeModelSelector(this.modelSelectorContainer);
    
    // Right side: Reserved for future buttons (attach file, etc.)
    // const toolbarRight = toolbar.createDiv({ cls: 'opencodian-toolbar-right' });
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
    const conversation = await this.plugin.getConversationById(id);
    if (!conversation) return;

    this.currentConversation = conversation;

    // Clear messages display
    this.messagesContainer?.empty();

    // Set session in service
    this.plugin.openCodeService.setSessionId(conversation.openCodeSessionId);

    // Use locally saved messages if available (preserves durationSeconds and other metadata)
    if (conversation.messages && conversation.messages.length > 0) {
      // Render locally saved messages
      for (const message of conversation.messages) {
        await this.renderMessage(message);
      }
    } else {
      // Fallback: Load messages from OpenCode
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
          await this.renderMessage(message);
        }
      } catch (error) {
        console.error('Failed to load messages:', error);
      }
    }

    // Scroll to bottom
    this.scrollToBottom();
    
    // Update model selector to reflect this session's model
    this.updateModelSelectorDisplay();
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
        
        // Add tooltip with creation date (set on the menu item via setTooltip if available)
        // Note: Obsidian's MenuItem doesn't expose DOM directly, tooltip shows via title in item text
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

    // Prevent sending if already streaming
    if (this.isStreaming) {

      return;
    }

    // Add user message to conversation and UI
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    this.currentConversation.messages.push(userMessage);
    await this.renderMessage(userMessage);

    this.isStreaming = true;
    this.updateSendButtonState();
    this.scrollToBottom();

    // Set up timeout as safety net to reset isStreaming
    const STREAM_TIMEOUT_MS = 120000; // 2 minutes timeout
    let timeoutId: number | null = null;
    const resetStreamingState = () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      this.isStreaming = false;
      this.updateSendButtonState();
    };

    timeoutId = window.setTimeout(() => {
      console.warn('[OpenCodianView] Stream timeout, forcing state reset');
      // Mark running tool calls as error
      this.streamController?.timeoutStream();
      resetStreamingState();
      // Add error message if still streaming
      if (this.streamController?.isStreaming()) {
        void this.streamController.handleChunk({ 
          type: 'error', 
          content: 'Response timeout' 
        });
      }
    }, STREAM_TIMEOUT_MS);

    // Stream response with current session model
    const modelOptions = this.getSendMessageOptions();
    const stream = this.plugin.openCodeService.sendMessage(content, {
      sessionId: this.currentConversation.openCodeSessionId,
      ...modelOptions,
    });

    // Create assistant message element and get content container
    const { contentEl: messageContentEl } = this.createAssistantMessageElement();

    // Show pending indicator after a short delay
    let pendingEl: HTMLElement | null = null;
    let pendingStartTime = 0;
    const pendingMessage = getRandomPendingMessage();
    console.log('[OpenCodianView] Setting up pending indicator timeout');
    const pendingTimeout = window.setTimeout(() => {
      console.log('[OpenCodianView] Pending indicator timeout fired, isStreaming:', this.isStreaming);
      if (!this.isStreaming || !messageContentEl) {
        console.log('[OpenCodianView] Not showing pending indicator - not streaming or no element');
        return;
      }
      
      console.log('[OpenCodianView] Showing pending indicator:', pendingMessage);
      pendingEl = messageContentEl.createDiv({ cls: 'opencodian-pending' });
      pendingEl.createSpan({ 
        text: pendingMessage,
        cls: 'opencodian-pending-text' 
      });
      const hintEl = pendingEl.createSpan({ cls: 'opencodian-pending-hint' });
      pendingStartTime = Date.now();
      
      // Update timer every second
      const updateTimer = () => {
        if (!pendingEl || !pendingEl.isConnected) return;
        const elapsed = Math.floor((Date.now() - pendingStartTime) / 1000);
        hintEl.setText(` (esc to interrupt · ${elapsed}s)`);
      };
      updateTimer();
      pendingEl.dataset.timerInterval = String(window.setInterval(updateTimer, 1000));
    }, 1000); // Show after 1s delay

    // Initialize streaming controller
    if (this.streamController) {
      this.streamController.startStream(messageContentEl);
    }

    // Track if we've received first content
    let receivedFirstChunk = false;

    try {
      for await (const chunk of stream) {
        // Check if streaming was cancelled
        if (!this.isStreaming) {
          console.log('[OpenCodianView] Streaming cancelled, breaking loop');
          break;
        }

        // Convert OpenCode chunks to streaming format
        const streamingChunk = this.convertToStreamingChunk(chunk);
        if (streamingChunk && this.streamController) {
          await this.streamController.handleChunk(streamingChunk);
          
          // Clear pending indicator only when actual content is received (text or thinking with content)
          const hasContent = (streamingChunk.type === 'text' && streamingChunk.content?.trim()) ||
                            (streamingChunk.type === 'thinking' && streamingChunk.content?.trim());
          
          if (!receivedFirstChunk && hasContent) {
            receivedFirstChunk = true;
            console.log('[OpenCodianView] First content chunk received, clearing pending timeout/indicator');
            window.clearTimeout(pendingTimeout);
            if (pendingEl && pendingEl.parentNode) {
              console.log('[OpenCodianView] Removing pending indicator');
              // Clear timer interval
              if (pendingEl.dataset.timerInterval) {
                window.clearInterval(Number(pendingEl.dataset.timerInterval));
              }
              pendingEl.remove();
              pendingEl = null;
            }
          }
        }
      }
      
      // Signal completion (only if not cancelled)
      if (this.isStreaming && this.streamController) {
        await this.streamController.handleChunk({ type: 'done' });
      }
    } catch (error) {
      console.error('[OpenCodianView] Streaming error:', error);
      if (this.streamController) {
        await this.streamController.handleChunk({ 
          type: 'error', 
          content: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    } finally {
      console.log('[OpenCodianView] Stream loop ended');
      resetStreamingState();
      
      // Add timestamp to the streamed message
      if (this.streamingMessageEl) {
        const timeEl = this.streamingMessageEl.querySelector('.opencodian-message-time');
        if (timeEl) {
          timeEl.textContent = new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          });
        }
      }
      
      // Get content blocks from stream (includes thinking with duration)
      const streamContentBlocks = this.streamController?.getContentBlocks();
      
      // Clear streaming tracking
      this.streamingMessageEl = null;
      this.streamingContentEl = null;
      
      // Add the assistant message to conversation with content blocks
      if (streamContentBlocks && streamContentBlocks.length > 0 && this.currentConversation) {
        // Extract text content from text blocks
        const textContent = streamContentBlocks
          .filter((b): b is { type: 'text'; content: string } => b.type === 'text')
          .map(b => b.content)
          .join('');
        
        // Convert streaming content blocks to core ContentBlock format
        const contentBlocks: ContentBlock[] = streamContentBlocks.map(b => {
          if (b.type === 'text') {
            return { type: 'text', text: b.content };
          } else if (b.type === 'thinking') {
            return { 
              type: 'thinking', 
              thinking: b.content,
              durationSeconds: b.durationSeconds,
            };
          } else if (b.type === 'tool_call') {
            return {
              type: 'tool_use',
              toolId: b.toolCall.id,
              toolName: b.toolCall.name,
              toolInput: b.toolCall.input,
              toolResult: b.toolCall.result,
            };
          }
          return { type: 'text', text: '' };
        });
        
        // Create the assistant message
        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: textContent,
          timestamp: Date.now(),
          contentBlocks: contentBlocks,
        };
        
        // Add to conversation
        this.currentConversation.messages.push(assistantMessage);
      }
    }

    // Update conversation
    if (this.currentConversation) {
      this.currentConversation.updatedAt = Date.now();
      await this.plugin.storage.saveConversation(this.currentConversation);
    }
  }

  /** Cancel streaming */
  private cancelStreaming() {
    console.log('[OpenCodianView] cancelStreaming called, isStreaming:', this.isStreaming);
    
    // Call service to abort the SSE connection
    console.log('[OpenCodianView] Calling openCodeService.cancelStream()...');
    this.plugin.openCodeService.cancelStream();
    
    // Update local state
    this.isStreaming = false;
    console.log('[OpenCodianView] isStreaming set to false');
    
    // Update button state
    this.updateSendButtonState();
    console.log('[OpenCodianView] Send button state updated');
    
    new Notice('Streaming cancelled');
  }

  /** Update send button icon based on streaming state */
  private updateSendButtonState() {
    if (!this.sendBtn) return;
    
    // Clear current icon
    this.sendBtn.empty();
    
    if (this.isStreaming) {
      // Show stop icon (square)
      setIcon(this.sendBtn, 'square');
      this.sendBtn.addClass('opencodian-stop-btn');
      this.sendBtn.removeClass('opencodian-send-btn');
      this.sendBtn.setAttribute('aria-label', 'Stop streaming');
    } else {
      // Show send icon
      setIcon(this.sendBtn, 'send');
      this.sendBtn.addClass('opencodian-send-btn');
      this.sendBtn.removeClass('opencodian-stop-btn');
      this.sendBtn.setAttribute('aria-label', 'Send message');
    }
  }

  /** Render a message */
  private async renderMessage(message: ChatMessage) {
    const messageEl = this.messagesContainer?.createDiv({
      cls: `opencodian-message opencodian-message--${message.role}`,
    });

    if (!messageEl) return;

    // Content container
    const content = messageEl.createDiv({ cls: 'opencodian-message-content' });

    // For user messages, always use simple text rendering
    if (message.role === 'user') {
      if (message.content) {
        const textEl = content.createDiv({ cls: 'opencodian-message-text' });
        textEl.textContent = message.content;
      }
    } else if (message.contentBlocks && message.contentBlocks.length > 0) {
      // For assistant messages, render content blocks (thinking, tools, etc.)
      for (const block of message.contentBlocks) {
        await this.renderContentBlock(content, block);
      }
    } else if (message.content) {
      // Fallback to simple text rendering for assistant
      const textEl = content.createDiv({ cls: 'opencodian-message-text' });
      if (this.markdownService) {
        await this.markdownService.render(textEl, message.content);
      } else {
        textEl.textContent = message.content;
      }
    }

    // Timestamp (outside content bubble)
    const time = new Date(message.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    messageEl.createEl('div', { cls: 'opencodian-message-time', text: time });

    return messageEl;
  }

  /** Render a content block using the same renderers as streaming */
  private async renderContentBlock(container: HTMLElement, block: ContentBlock) {
    if (!this.markdownService) return;

    switch (block.type) {
      case 'thinking':
        if (block.thinking) {
          const thinkingRenderer = new ThinkingBlockRenderer(this.markdownService, {
            collapsedByDefault: true,
            showTimer: false,
          });
          thinkingRenderer.renderStored(container, block.thinking, block.durationSeconds);
        }
        break;

      case 'tool_use':
        if (block.toolName && block.toolId) {
          const toolRenderer = new ToolCallRenderer();
          const toolCall: ToolCallInfo = {
            id: block.toolId,
            name: block.toolName,
            input: block.toolInput || {},
            status: 'completed',
            result: block.toolResult,
          };
          toolRenderer.render(container, toolCall);
        }
        break;

      case 'tool_result':
        // Tool results are rendered as part of tool_use or separately if needed
        // For now, skip as they're typically shown within the tool call UI
        break;

      case 'text':
      default:
        if (block.text) {
          const textEl = container.createDiv({ cls: 'opencodian-message-text' });
          await this.markdownService.render(textEl, block.text);
        }
        break;
    }
  }

  /** Create assistant message element for streaming */
  private createAssistantMessageElement(): { messageEl: HTMLElement; contentEl: HTMLElement } {
    const messageEl = this.messagesContainer?.createDiv({
      cls: 'opencodian-message opencodian-message--assistant',
    });

    if (!messageEl) {
      const fallback = document.createElement('div');
      return { messageEl: fallback, contentEl: fallback };
    }

    const content = messageEl.createDiv({ cls: 'opencodian-message-content' });
    const textEl = content.createDiv({ cls: 'opencodian-message-text' });

    // Add timestamp placeholder (outside content bubble)
    messageEl.createEl('div', { cls: 'opencodian-message-time', text: '' });

    // Track for streaming updates
    this.streamingMessageEl = messageEl;
    this.streamingContentEl = textEl;

    return { messageEl, contentEl: textEl };
  }

  /** Update message content during streaming */
  private async updateMessageContent(contentEl: HTMLElement, content: string) {
    if (!this.markdownService) {
      contentEl.textContent = content;
      return;
    }

    // Use markdown rendering for streaming updates
    await this.markdownService.render(contentEl, content);
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

  /** Initialize model selector (opencode-style) */
  private initializeModelSelector(containerEl: HTMLElement): void {
    this.modelSelectorContainer = containerEl;
    
    // Create trigger button - ghost style, shows provider icon + model name + chevron
    this.modelSelectorTrigger = containerEl.createDiv({ cls: 'opencodian-model-trigger' });
    const triggerContent = this.modelSelectorTrigger.createDiv({ cls: 'opencodian-model-trigger-content' });
    
    // Provider icon
    const iconWrapper = triggerContent.createSpan({ cls: 'opencodian-model-trigger-icon' });
    setIcon(iconWrapper, 'bot'); // Default icon, will be updated
    
    // Model name
    triggerContent.createSpan({ cls: 'opencodian-model-trigger-text' });
    
    // Chevron
    const chevron = triggerContent.createSpan({ cls: 'opencodian-model-trigger-chevron' });
    setIcon(chevron, 'chevron-down');
    
    // Create dropdown (hidden by default)
    this.modelSelectorDropdown = containerEl.createDiv({ cls: 'opencodian-model-dropdown' });
    this.modelSelectorDropdown.style.display = 'none';
    
    // Build dropdown structure
    this.buildModelDropdown();
    
    // Load models
    void this.loadAvailableModels();
    
    // Update display
    this.updateModelSelectorDisplay();
    
    // Handle trigger click
    this.modelSelectorTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleModelDropdown();
    });
    
    // Setup click outside handler
    this.modelDropdownClickOutsideHandler = (e: MouseEvent) => {
      if (!this.modelSelectorContainer?.contains(e.target as Node)) {
        this.closeModelDropdown();
      }
    };
  }
  
  /** Build model dropdown structure */
  private buildModelDropdown(): void {
    if (!this.modelSelectorDropdown) return;
    
    this.modelSelectorDropdown.empty();
    
    // Search section
    const searchWrapper = this.modelSelectorDropdown.createDiv({ cls: 'opencodian-model-dropdown-search' });
    const searchContainer = searchWrapper.createDiv({ cls: 'opencodian-model-dropdown-search-container' });
    const searchIcon = searchContainer.createSpan({ cls: 'opencodian-model-dropdown-search-icon' });
    setIcon(searchIcon, 'search');
    
    this.modelSelectorSearchInput = searchContainer.createEl('input', {
      cls: 'opencodian-model-dropdown-search-input',
      attr: { 
        type: 'text', 
        placeholder: 'Search models...'
      }
    });
    
    // Handle search input
    this.modelSelectorSearchInput.addEventListener('input', (e) => {
      this.modelFilterQuery = (e.target as HTMLInputElement).value.toLowerCase();
      this.renderModelList();
    });
    
    // Handle keyboard navigation in search
    this.modelSelectorSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeModelDropdown();
        e.preventDefault();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        this.navigateModelList(e.key === 'ArrowDown' ? 1 : -1);
        e.preventDefault();
      } else if (e.key === 'Enter') {
        this.selectHighlightedModel();
        e.preventDefault();
      }
    });
    
    // Scrollable list container
    this.modelSelectorScrollContainer = this.modelSelectorDropdown.createDiv({ 
      cls: 'opencodian-model-dropdown-scroll' 
    });
    
    // Don't render list here - wait for models to load
    // Initial render will show loading state
    this.renderLoadingState();
  }
  
  /** Render loading state */
  private renderLoadingState(): void {
    if (!this.modelSelectorScrollContainer) return;
    
    this.modelSelectorScrollContainer.empty();
    
    const loading = this.modelSelectorScrollContainer.createDiv({ 
      cls: 'opencodian-model-dropdown-loading' 
    });
    loading.setText('Loading models...');
  }
  
  /** Toggle dropdown visibility */
  private toggleModelDropdown(): void {
    if (this.isModelDropdownOpen) {
      this.closeModelDropdown();
    } else {
      this.openModelDropdown();
    }
  }
  
  /** Open dropdown */
  private openModelDropdown(): void {
    if (!this.modelSelectorDropdown || !this.modelSelectorTrigger) return;
    
    this.isModelDropdownOpen = true;
    this.modelSelectorDropdown.style.display = 'block';
    this.modelSelectorTrigger.addClass('is-open');
    
    // Reset filter
    this.modelFilterQuery = '';
    if (this.modelSelectorSearchInput) {
      this.modelSelectorSearchInput.value = '';
    }
    this.renderModelList();
    
    // Focus search input
    setTimeout(() => {
      this.modelSelectorSearchInput?.focus();
      this.scrollToCurrentModel();
    }, 0);
    
    // Add click outside listener
    document.addEventListener('click', this.modelDropdownClickOutsideHandler!);
    
    // Register escape key handler
    this.scope?.register([], 'Escape', () => {
      if (this.isModelDropdownOpen) {
        this.closeModelDropdown();
        return true;
      }
      return false;
    });
  }
  
  /** Close dropdown */
  private closeModelDropdown(): void {
    if (!this.modelSelectorDropdown || !this.modelSelectorTrigger) return;
    
    this.isModelDropdownOpen = false;
    this.modelSelectorDropdown.style.display = 'none';
    this.modelSelectorTrigger.removeClass('is-open');
    
    // Remove click outside listener
    if (this.modelDropdownClickOutsideHandler) {
      document.removeEventListener('click', this.modelDropdownClickOutsideHandler);
    }
  }
  
  /** Render model list based on filter */
  private renderModelList(): void {
    if (!this.modelSelectorScrollContainer) return;
    
    this.modelSelectorScrollContainer.empty();
    
    // Check if models are still loading
    if (this.availableProviders.length === 0) {
      this.renderLoadingState();
      return;
    }
    
    // Filter models
    const filteredProviders = this.availableProviders
      .map(provider => ({
        ...provider,
        models: provider.models.filter(model => 
          model.name.toLowerCase().includes(this.modelFilterQuery) ||
          provider.name.toLowerCase().includes(this.modelFilterQuery)
        )
      }))
      .filter(provider => provider.models.length > 0);
    
    if (filteredProviders.length === 0) {
      const emptyState = this.modelSelectorScrollContainer.createDiv({ 
        cls: 'opencodian-model-dropdown-empty' 
      });
      emptyState.setText(this.modelFilterQuery ? 'No models found' : 'No models available');
      return;
    }
    
    const current = this.getCurrentSessionModel();
    
    // Create all groups in a single container for proper scrolling
    const groupsContainer = this.modelSelectorScrollContainer.createDiv({
      cls: 'opencodian-model-groups'
    });
    
    // Track headers for stuck effect
    const headers: Array<{ el: HTMLElement; scrollHandler: () => void }> = [];
    
    // Create provider groups
    for (const provider of filteredProviders) {
      // Group container
      const groupEl = groupsContainer.createDiv({
        cls: 'opencodian-model-group'
      });
      
      // Provider header (sticky)
      const header = groupEl.createDiv({ 
        cls: 'opencodian-model-provider-header' 
      });
      header.setText(provider.name);
      
      // Setup stuck detection for this header
      const scrollHandler = () => {
        if (!this.modelSelectorScrollContainer || !header) return;
        const scrollRect = this.modelSelectorScrollContainer.getBoundingClientRect();
        const headerRect = header.getBoundingClientRect();
        const isStuck = headerRect.top <= scrollRect.top + 1 && 
                        this.modelSelectorScrollContainer.scrollTop > 0;
        header.setAttribute('data-stuck', String(isStuck));
      };
      
      headers.push({ el: header, scrollHandler });
      
      // Models for this provider
      for (const model of provider.models) {
        const isSelected = current.provider === provider.id && current.model === model.id;
        const modelValue = `${provider.id}::${model.id}`;
        
        const modelOption = groupEl.createDiv({ 
          cls: 'opencodian-model-option',
          attr: { 'data-value': modelValue }
        });
        
        if (isSelected) {
          modelOption.addClass('is-selected');
        }
        
        // Model name
        const nameSpan = modelOption.createSpan({ cls: 'opencodian-model-option-name' });
        nameSpan.setText(model.name);
        
        // Checkmark for selected model
        const checkmark = modelOption.createSpan({ cls: 'opencodian-model-option-check' });
        setIcon(checkmark, 'check');
        
        // Click handler
        modelOption.addEventListener('click', (e) => {
          e.stopPropagation();
          this.switchModel(provider.id, model.id);
          this.closeModelDropdown();
        });
        
        // Hover handler for keyboard navigation
        modelOption.addEventListener('mouseenter', () => {
          this.highlightModelOption(modelValue);
        });
      }
    }
    
    // Add scroll listener to container
    if (this.modelSelectorScrollContainer) {
      // Remove old listener if exists
      if ((this.modelSelectorScrollContainer as any)._stuckHandler) {
        this.modelSelectorScrollContainer.removeEventListener(
          'scroll', 
          (this.modelSelectorScrollContainer as any)._stuckHandler
        );
      }
      
      const handler = () => {
        headers.forEach(h => h.scrollHandler());
      };
      
      (this.modelSelectorScrollContainer as any)._stuckHandler = handler;
      this.modelSelectorScrollContainer.addEventListener('scroll', handler, { passive: true });
      
      // Initial check
      handler();
    }
  }
  
  /** Navigate model list with keyboard */
  private navigateModelList(direction: 1 | -1): void {
    if (!this.modelSelectorScrollContainer) return;
    
    const options = Array.from(this.modelSelectorScrollContainer.querySelectorAll('.opencodian-model-option'));
    if (options.length === 0) return;
    
    const currentIndex = options.findIndex(opt => opt.hasClass('is-highlighted'));
    let nextIndex = currentIndex + direction;
    
    if (nextIndex < 0) nextIndex = 0;
    if (nextIndex >= options.length) nextIndex = options.length - 1;
    
    if (currentIndex >= 0) {
      options[currentIndex].removeClass('is-highlighted');
    }
    options[nextIndex].addClass('is-highlighted');
    
    // Scroll into view
    options[nextIndex].scrollIntoView({ block: 'nearest' });
  }
  
  /** Highlight a specific model option */
  private highlightModelOption(value: string): void {
    if (!this.modelSelectorScrollContainer) return;
    
    this.modelSelectorScrollContainer.querySelectorAll('.opencodian-model-option').forEach(opt => {
      opt.removeClass('is-highlighted');
    });
    
    const option = this.modelSelectorScrollContainer.querySelector(`[data-value="${value}"]`);
    if (option) {
      option.addClass('is-highlighted');
    }
  }
  
  /** Select currently highlighted model */
  private selectHighlightedModel(): void {
    if (!this.modelSelectorScrollContainer) return;
    
    const highlighted = this.modelSelectorScrollContainer.querySelector('.opencodian-model-option.is-highlighted');
    if (highlighted) {
      const value = highlighted.getAttribute('data-value');
      if (value) {
        const [provider, model] = value.split('::');
        this.switchModel(provider, model);
        this.closeModelDropdown();
      }
    }
  }
  
  /** Scroll to current model in dropdown */
  private scrollToCurrentModel(): void {
    if (!this.modelSelectorScrollContainer) return;
    
    const current = this.getCurrentSessionModel();
    const currentValue = `${current.provider}::${current.model}`;
    
    const currentEl = this.modelSelectorScrollContainer.querySelector(`[data-value="${currentValue}"]`) as HTMLElement;
    if (currentEl) {
      currentEl.scrollIntoView({ block: 'center' });
    }
  }

  /** Load available models from OpenCode service */
  private async loadAvailableModels(): Promise<void> {
    try {
      const { providers } = await this.plugin.openCodeService.getAvailableModels();
      this.availableModels = [];
      this.availableProviders = [];
      
      for (const provider of providers) {
        const providerModels = [];
        for (const model of provider.models) {
          this.availableModels.push({
            provider: provider.id,
            model: model.id,
            label: `${provider.name}/${model.name}`,
            providerName: provider.name,
            modelName: model.name,
          });
          providerModels.push({
            id: model.id,
            name: model.name,
          });
        }
        this.availableProviders.push({
          id: provider.id,
          name: provider.name,
          models: providerModels,
        });
      }
      
      // Re-render dropdown with new data
      this.renderModelList();
      this.updateModelSelectorDisplay();
    } catch (error) {
      console.error('[OpenCodianView] Failed to load models:', error);
    }
  }

  /** Update model selector to show current model */
  private updateModelSelectorDisplay(): void {
    const current = this.getCurrentSessionModel();
    
    if (!this.modelSelectorTrigger) return;
    
    // Find model info from available models
    const modelInfo = this.availableModels.find(
      m => m.provider === current.provider && m.model === current.model
    );
    
    // Update text
    const textEl = this.modelSelectorTrigger.querySelector('.opencodian-model-trigger-text');
    if (textEl) {
      textEl.textContent = modelInfo?.modelName || current.model;
    }
    
    // Update provider icon using Lobehub icons
    const iconWrapper = this.modelSelectorTrigger.querySelector('.opencodian-model-trigger-icon');
    if (iconWrapper) {
      iconWrapper.empty();
      
      // Try to get Lobehub icon
      const iconUrl = ProviderIconService.getIconUrl(current.provider);
      if (iconUrl) {
        const img = document.createElement('img');
        img.src = iconUrl;
        img.alt = modelInfo?.providerName || current.provider;
        img.title = modelInfo?.providerName || current.provider;
        iconWrapper.appendChild(img);
      } else {
        // Fallback to Obsidian icon
        setIcon(iconWrapper as HTMLElement, 'bot');
      }
    }
  }

  /** Get current model for this session */
  private getCurrentSessionModel(): { provider: string; model: string } {
    if (this.currentConversation) {
      const override = this.sessionModelOverrides.get(this.currentConversation.id);
      if (override) {
        return override;
      }
    }
    return {
      provider: this.plugin.settings.defaultProvider,
      model: this.plugin.settings.defaultModel,
    };
  }

  /** Switch model for current session */
  private switchModel(provider: string, model: string): void {
    if (!this.currentConversation) return;
    
    // Store override for this session
    this.sessionModelOverrides.set(this.currentConversation.id, { provider, model });
    
    // Update display
    this.updateModelSelectorDisplay();
    
    // Show notification with model name only
    const modelInfo = this.availableModels.find(
      m => m.provider === provider && m.model === model
    );
    const modelName = modelInfo?.modelName || model;
    new Notice(`Model switched to: ${modelName}`);
  }

  /** Get model options for sendMessage */
  private getSendMessageOptions(): { provider?: string; model?: string } {
    const current = this.getCurrentSessionModel();
    return {
      provider: current.provider,
      model: current.model,
    };
  }

  /** Convert OpenCode stream chunk to streaming module format */
  private convertToStreamingChunk(
    chunk: import('../../core/types').StreamChunk
  ): import('../../utils/streaming').StreamChunk | null {

    
    switch (chunk.type) {
      case 'text':
        return { type: 'text', content: chunk.content };
      
      case 'thinking':

        return { type: 'thinking', content: chunk.content };
      
      case 'tool_use':

        return {
          type: 'tool_use',
          id: chunk.id,
          name: chunk.name,
          input: chunk.input,
        };
      
      case 'tool_result':

        return {
          type: 'tool_result',
          id: chunk.toolUseId,
          content: chunk.content,
        };
      
      case 'error':
        return { type: 'error', content: chunk.content };
      
      case 'message_start':
      case 'message_stop':
      case 'usage':
      case 'content_block_start':
      case 'content_block_stop':
        // These chunks don't need to be converted for rendering
        return null;
      
      default:
        return null;
    }
  }
}
