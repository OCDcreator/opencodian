/**
 * OpenCodian View
 * 
 * Main sidebar view for the OpenCodian chat interface.
 */

import type { EventRef, WorkspaceLeaf } from 'obsidian';
import { Component, ItemView, Menu, Notice, Scope, setIcon } from 'obsidian';

import { OpenCodeService } from '../../core/opencode';
import type { ChatMessage, ContentBlock, Conversation, ToolCallInfo } from '../../core/types';
import { VIEW_TYPE_OPENCODIAN } from '../../core/types';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { createLogger } from '../../shared';
import { ProviderIconService } from '../../utils/icons/ProviderIconService';
import { MarkdownRenderService } from '../../utils/markdown';
import { StreamController, ThinkingBlockRenderer, ToolCallRenderer } from '../../utils/streaming';

const logger = createLogger('OpenCodianView');

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

/** Clipboard icon SVG for copy button */
const COPY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;

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
  private currentTurnBodyEl: HTMLElement | null = null;

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

  private appSettings(): { open: () => void; openTabById: (id: string) => void } {
    return (this.app as typeof this.app & {
      setting: { open: () => void; openTabById: (id: string) => void };
    }).setting;
  }

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
    this.applyChatScrollMode();

    // Input area
    this.inputContainer = this.chatContainerEl.createDiv({ cls: 'opencodian-input-area' });
    this.buildInputArea(this.inputContainer);
  }

  /** Apply configured chat scroll mode to the messages container */
  public applyChatScrollMode(): void {
    if (!this.messagesContainer) return;

    this.syncChatSurfaceColor();
    this.messagesContainer.removeClass('opencodian-messages--sticky-basic');
    this.messagesContainer.removeClass('opencodian-messages--sticky-mask');
    this.messagesContainer.removeClass('opencodian-messages--natural');

    const scrollMode = this.plugin.settings.chatScrollMode;
    if (scrollMode === 'natural') {
      this.messagesContainer.addClass('opencodian-messages--natural');
    } else if (scrollMode === 'sticky-basic') {
      this.messagesContainer.addClass('opencodian-messages--sticky-basic');
    } else {
      this.messagesContainer.addClass('opencodian-messages--sticky-mask');
    }
  }

  /** Sync sticky mask color to the actual pane background */
  private syncChatSurfaceColor(): void {
    if (!this.chatContainerEl) return;

    let currentEl: HTMLElement | null = this.chatContainerEl;
    let resolvedColor = '';

    while (currentEl) {
      const backgroundColor = window.getComputedStyle(currentEl).backgroundColor;
      if (backgroundColor && backgroundColor !== 'transparent' && backgroundColor !== 'rgba(0, 0, 0, 0)') {
        resolvedColor = backgroundColor;
        break;
      }
      currentEl = currentEl.parentElement;
    }

    if (!resolvedColor) {
      resolvedColor = 'var(--background-secondary)';
    }

    this.chatContainerEl.style.setProperty('--opencodian-chat-surface', resolvedColor);
  }

  /** Reset active turn references */
  private resetTurnState(): void {
    this.currentTurnBodyEl = null;
  }

  /** Create a new turn with sticky user header */
  private createTurn(): { turnEl: HTMLElement; headerEl: HTMLElement; bodyEl: HTMLElement } | null {
    if (!this.messagesContainer) return null;

    const turnEl = this.messagesContainer.createDiv({ cls: 'opencodian-turn' });
    const headerEl = turnEl.createDiv({ cls: 'opencodian-turn-header' });
    const bodyEl = turnEl.createDiv({ cls: 'opencodian-turn-body' });

    this.currentTurnBodyEl = bodyEl;

    return { turnEl, headerEl, bodyEl };
  }

  /** Ensure there is a turn body available for assistant messages */
  private ensureTurnBody(): HTMLElement | null {
    if (this.currentTurnBodyEl?.isConnected) {
      return this.currentTurnBodyEl;
    }

    if (!this.messagesContainer) return null;

    const turnEl = this.messagesContainer.createDiv({
      cls: 'opencodian-turn opencodian-turn--assistant-only',
    });
    const bodyEl = turnEl.createDiv({ cls: 'opencodian-turn-body' });

    this.currentTurnBodyEl = bodyEl;

    return bodyEl;
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
      const settings = this.appSettings();
      settings.open();
      settings.openTabById('opencodian');
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
    // Input wrapper - textarea only (send button moved to toolbar)
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

    // Bottom toolbar: Permission mode (left) | Model selector (center) | Send button (right)
    const toolbar = container.createDiv({ cls: 'opencodian-input-toolbar' });
    
    // Left side: Permission mode selector
    const permissionContainer = toolbar.createDiv({ cls: 'opencodian-permission-selector' });
    this.initializePermissionSelector(permissionContainer);
    
    // Center: Model selector (opencode-style)
    this.modelSelectorContainer = toolbar.createDiv({ cls: 'opencodian-model-selector' });
    this.initializeModelSelector(this.modelSelectorContainer);
    
    // Right side: Send/Stop button
    this.sendBtn = toolbar.createDiv({ cls: 'opencodian-send-btn' });
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
    this.resetTurnState();

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
        logger.error('Failed to load messages:', error);
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
      logger.warn('Stream timeout, forcing state reset');
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
    const { messageEl } = this.createAssistantMessageElement();

    // Show pending indicator after a short delay
    const pendingState: { element: HTMLElement | null } = { element: null };
    let pendingStartTime = 0;
    const pendingMessage = getRandomPendingMessage();
    logger.debug('Setting up pending indicator timeout');
    const pendingTimeout = window.setTimeout(() => {
      logger.debug('Pending indicator timeout fired, isStreaming:', this.isStreaming);
      if (!this.isStreaming || !messageEl) {
        logger.debug('Not showing pending indicator - not streaming or no element');
        return;
      }
      
      logger.debug('Showing pending indicator:', pendingMessage);
      pendingState.element = messageEl.createDiv({ cls: 'opencodian-pending' });
      pendingState.element.createSpan({ 
        text: pendingMessage,
        cls: 'opencodian-pending-text' 
      });
      const hintEl = pendingState.element.createSpan({ cls: 'opencodian-pending-hint' });
      pendingStartTime = Date.now();
      
      // Update timer every second
      const updateTimer = () => {
        if (!pendingState.element || !pendingState.element.isConnected) return;
        const elapsed = Math.floor((Date.now() - pendingStartTime) / 1000);
        hintEl.setText(` (esc to interrupt · ${elapsed}s)`);
      };
      updateTimer();
      pendingState.element.dataset.timerInterval = String(window.setInterval(updateTimer, 1000));
    }, 1000); // Show after 1s delay

    // Initialize streaming controller
    if (this.streamController) {
      this.streamController.startStream(messageEl);
    }

    // Track if we've received first content
    let receivedFirstChunk = false;

    try {
      for await (const chunk of stream) {
        // Check if streaming was cancelled
        if (!this.isStreaming) {
          logger.debug('Streaming cancelled, breaking loop');
          break;
        }

        // Handle permission request
        if (chunk.type === 'permission_request') {
          // Pause the stream timeout while waiting for user response
          if (timeoutId) {
            window.clearTimeout(timeoutId);
            timeoutId = null;
          }
          
          await this.showPermissionDialog(chunk);
          
          // Resume the stream timeout after user response (reset to full timeout)
          if (this.isStreaming) {
            timeoutId = window.setTimeout(() => {
              logger.warn('Stream timeout after permission, forcing state reset');
              this.streamController?.timeoutStream();
              resetStreamingState();
              if (this.streamController?.isStreaming()) {
                void this.streamController.handleChunk({ 
                  type: 'error', 
                  content: 'Response timeout' 
                });
              }
            }, STREAM_TIMEOUT_MS);
          }
          continue;
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
            logger.debug('First content chunk received, clearing pending timeout/indicator');
            window.clearTimeout(pendingTimeout);
            if (pendingState.element?.parentNode) {
              logger.debug('Removing pending indicator');
              // Clear timer interval
              if (pendingState.element.dataset.timerInterval) {
                window.clearInterval(Number(pendingState.element.dataset.timerInterval));
              }
              pendingState.element.remove();
              pendingState.element = null;
            }
          }
        }
      }
      
      // Signal completion (only if not cancelled)
      if (this.isStreaming && this.streamController) {
        await this.streamController.handleChunk({ type: 'done' });
      }
    } catch (error) {
      logger.error('Streaming error:', error);
      if (this.streamController) {
        await this.streamController.handleChunk({ 
          type: 'error', 
          content: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    } finally {
      logger.debug('Stream loop ended');
      resetStreamingState();
      
      // Add timestamp with copy button to the streamed message (after all content)
      if (this.streamingMessageEl) {
        const streamContentBlocks = this.streamController?.getContentBlocks();
        const textContent = streamContentBlocks
          ?.filter((b): b is { type: 'text'; content: string } => b.type === 'text')
          .map(b => b.content)
          .join('') || '';
        this.addTimestampWithCopyButton(
          this.streamingMessageEl,
          Date.now(),
          textContent
        );
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
              toolStatus: b.toolCall.status,
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
    logger.debug('cancelStreaming called, isStreaming:', this.isStreaming);
    
    // Call service to abort the SSE connection
    logger.debug('Calling openCodeService.cancelStream()...');
    this.plugin.openCodeService.cancelStream();
    
    // Update local state
    this.isStreaming = false;
    logger.debug('isStreaming set to false');
    
    // Update button state
    this.updateSendButtonState();
    logger.debug('Send button state updated');
    
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
    const parentEl =
      message.role === 'user'
        ? this.createTurn()?.headerEl
        : this.ensureTurnBody();
    const messageEl = parentEl?.createDiv({
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
        // Add copy button for user message (outside bubble)
        this.addTextCopyButton(messageEl, message.content, true);
      }
      // Add timestamp for user message
      const time = new Date(message.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      messageEl.createEl('div', { cls: 'opencodian-message-time', text: time });
    } else if (message.contentBlocks && message.contentBlocks.length > 0) {
      // For assistant messages, render content blocks (thinking, tools, etc.)
      for (const block of message.contentBlocks) {
        await this.renderContentBlock(content, block);
      }
      // Collect all text content
      const textContent = message.contentBlocks
        .filter(b => b.type === 'text' && b.text)
        .map(b => b.text)
        .join('\n\n');
      // Add timestamp with copy button
      this.addTimestampWithCopyButton(messageEl, message.timestamp, textContent);
    } else if (message.content) {
      // Fallback to simple text rendering for assistant
      const textEl = content.createDiv({ cls: 'opencodian-message-text' });
      if (this.markdownService) {
        await this.markdownService.render(textEl, message.content);
      } else {
        textEl.textContent = message.content;
      }
      // Add timestamp with copy button
      this.addTimestampWithCopyButton(messageEl, message.timestamp, message.content);
    }

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
            status: this.getStoredToolStatus(block),
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

  /** Resolve persisted tool status, with fallback for older stored messages */
  private getStoredToolStatus(block: ContentBlock): ToolCallInfo['status'] {
    if (block.toolStatus) {
      return block.toolStatus;
    }

    if (block.toolResult?.startsWith('Error:')) {
      return 'error';
    }

    return 'completed';
  }

  /** Create assistant message element for streaming */
  private createAssistantMessageElement(): { messageEl: HTMLElement; contentEl: HTMLElement; textEl: HTMLElement } {
    const messageEl = this.ensureTurnBody()?.createDiv({
      cls: 'opencodian-message opencodian-message--assistant',
    });

    if (!messageEl) {
      const fallback = document.createElement('div');
      return { messageEl: fallback, contentEl: fallback, textEl: fallback };
    }

    const contentEl = messageEl.createDiv({ cls: 'opencodian-message-content' });
    const textEl = contentEl.createDiv({ cls: 'opencodian-message-text' });

    // Note: Timestamp will be added after streaming completes to ensure correct DOM order

    // Track for streaming updates
    this.streamingMessageEl = messageEl;
    this.streamingContentEl = textEl;

    return { messageEl, contentEl, textEl };
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

  /**
   * Adds a copy button to a message element (outside the bubble).
   * Button shows clipboard icon on hover, changes to "copied!" on click.
   * @param messageEl The message element container
   * @param content The original text content to copy
   * @param isUser Whether this is a user message (affects positioning)
   */
  private addTextCopyButton(messageEl: HTMLElement, content: string, isUser: boolean): void {
    const copyBtn = messageEl.createSpan({ 
      cls: `opencodian-copy-btn ${isUser ? 'opencodian-copy-btn--user' : 'opencodian-copy-btn--assistant'}` 
    });
    copyBtn.innerHTML = COPY_ICON;

    let feedbackTimeout: ReturnType<typeof setTimeout> | null = null;

    copyBtn.addEventListener('click', async (e) => {
      e.stopPropagation();

      try {
        await navigator.clipboard.writeText(content);
      } catch {
        // Clipboard API may fail in non-secure contexts
        return;
      }

      // Clear any pending timeout from rapid clicks
      if (feedbackTimeout) {
        clearTimeout(feedbackTimeout);
      }

      // Show "copied!" feedback
      copyBtn.innerHTML = '';
      copyBtn.setText('copied!');
      copyBtn.classList.add('copied');

      feedbackTimeout = setTimeout(() => {
        copyBtn.innerHTML = COPY_ICON;
        copyBtn.classList.remove('copied');
        feedbackTimeout = null;
      }, 1500);
    });
  }

  /**
   * Adds timestamp with copy button for assistant messages.
   * Creates a row with timestamp and copy button side by side.
   * @param messageEl The message element container
   * @param timestamp The message timestamp
   * @param content The text content to copy
   */
  private addTimestampWithCopyButton(
    messageEl: HTMLElement,
    timestamp: number,
    content: string
  ): void {
    // Create a container for timestamp and copy button
    const timeRow = messageEl.createDiv({ cls: 'opencodian-message-time-row' });

    // Timestamp
    const timeStr = new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    timeRow.createSpan({ cls: 'opencodian-message-time-text', text: timeStr });

    // Copy button
    const copyBtn = timeRow.createSpan({ cls: 'opencodian-copy-btn-inline' });
    copyBtn.innerHTML = COPY_ICON;

    let feedbackTimeout: ReturnType<typeof setTimeout> | null = null;

    copyBtn.addEventListener('click', async (e) => {
      e.stopPropagation();

      try {
        await navigator.clipboard.writeText(content);
      } catch {
        return;
      }

      if (feedbackTimeout) {
        clearTimeout(feedbackTimeout);
      }

      copyBtn.innerHTML = '';
      copyBtn.setText('copied!');
      copyBtn.classList.add('copied');

      feedbackTimeout = setTimeout(() => {
        copyBtn.innerHTML = COPY_ICON;
        copyBtn.classList.remove('copied');
        feedbackTimeout = null;
      }, 1500);
    });
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
      logger.error('Failed to load models:', error);
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
          isError: chunk.isError,
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

  /** Initialize permission mode selector */
  private initializePermissionSelector(containerEl: HTMLElement): void {
    // Create trigger button
    const trigger = containerEl.createDiv({ cls: 'opencodian-permission-trigger' });
    
    const iconEl = trigger.createSpan({ cls: 'opencodian-permission-trigger-icon' });
    setIcon(iconEl, 'shield');
    
    const textEl = trigger.createSpan({ cls: 'opencodian-permission-trigger-text' });
    
    // Update display based on current mode
    const updateDisplay = () => {
      const mode = this.plugin.settings.permissionMode;
      // Use uppercase mode names for consistency: YOLO / ASK / PLAN
      const modeText: Record<string, string> = {
        'yolo': 'YOLO',
        'normal': 'ASK',
        'plan': 'PLAN',
      };
      textEl.textContent = modeText[mode] || mode;
      
      // Update icon color based on mode
      trigger.removeClass('mode-yolo', 'mode-normal', 'mode-plan');
      trigger.addClass(`mode-${mode}`);
    };
    
    updateDisplay();
    
    // Handle click
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      
      const menu = new Menu();
      
      menu.addItem((item) => {
        item
          .setTitle(t('settings.security.permissionMode.yolo'))
          .setIcon('shield-check')
          .onClick(async () => {
            await this.switchPermissionMode('yolo');
            updateDisplay();
          });
        if (this.plugin.settings.permissionMode === 'yolo') {
          item.setChecked(true);
        }
      });
      
      menu.addItem((item) => {
        item
          .setTitle(t('settings.security.permissionMode.normal'))
          .setIcon('shield-question')
          .onClick(async () => {
            await this.switchPermissionMode('normal');
            updateDisplay();
          });
        if (this.plugin.settings.permissionMode === 'normal') {
          item.setChecked(true);
        }
      });
      
      menu.addItem((item) => {
        item
          .setTitle(t('settings.security.permissionMode.plan'))
          .setIcon('shield-alert')
          .onClick(async () => {
            await this.switchPermissionMode('plan');
            updateDisplay();
          });
        if (this.plugin.settings.permissionMode === 'plan') {
          item.setChecked(true);
        }
      });
      
      menu.showAtPosition({ x: e.clientX, y: e.clientY });
    });
  }

  /** Switch permission mode and restart OpenCode service */
  private async switchPermissionMode(mode: 'yolo' | 'normal' | 'plan'): Promise<void> {
    try {
      // Update setting
      this.plugin.settings.permissionMode = mode;
      await this.plugin.saveSettings();
      
      // Show restarting notice
      const notice = new Notice(t('settings.security.autoRestart.manual'), 0);
      
      // Restart OpenCode service
      const isRunning = await this.plugin.openCodeService.checkHealth();
      if (isRunning) {
        await this.plugin.openCodeService.stop();
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      await this.plugin.openCodeService.start();
      
      notice.hide();
      new Notice(t('settings.security.autoRestart.success'));
    } catch (error) {
      logger.error('Failed to switch permission mode:', error);
      new Notice(t('settings.security.autoRestart.failed'));
    }
  }

  /** Show inline permission request card in the chat stream */
  private async showPermissionDialog(
    request: Extract<import('../../core/types').StreamChunk, { type: 'permission_request' }>
  ): Promise<void> {
    const { t } = await import('../../i18n');
    const { id, permission, patterns, metadata } = request;
    
    // Get tool description based on permission type
    const getToolDescription = (perm: string): string => {
      // Extract base tool name (e.g., 'websearch_web_search' -> 'websearch')
      const baseTool = perm.split('_')[0].toLowerCase();
      const toolKey = `permissionDialog.tools.${baseTool}`;
      const description = t(toolKey as any);
      // If translation not found, return default
      return description === toolKey ? t('permissionDialog.tools.default') : description;
    };

    // Find the message element to insert the permission card
    // Note: Tool calls are rendered directly on messageEl, not in contentEl
    const messageEl = this.streamingMessageEl;
    if (!messageEl) {
      logger.error('No streaming message element found for permission card');
      return;
    }

    // Find the last tool call card to insert permission card after it
    const lastToolCall = messageEl.querySelector('.streaming-tool-call:last-of-type');
    
    // Create inline permission card
    const permissionCard = document.createElement('div');
    permissionCard.className = 'opencodian-permission-inline';
    
    if (lastToolCall && lastToolCall.parentNode) {
      // Insert after the last tool call (so it appears right after the tool)
      lastToolCall.parentNode.insertBefore(permissionCard, lastToolCall.nextSibling);
    } else {
      // Fallback: append to message content area if no tool call found
      const contentEl = messageEl.querySelector('.opencodian-message-content');
      if (contentEl) {
        contentEl.appendChild(permissionCard);
      } else {
        messageEl.appendChild(permissionCard);
      }
    }
    
    // Header with tool name
    const headerEl = permissionCard.createDiv({ cls: 'opencodian-permission-inline-header' });
    headerEl.createSpan({ cls: 'opencodian-permission-inline-icon', text: '🔐' });
    headerEl.createSpan({ 
      cls: 'opencodian-permission-inline-title', 
      text: t('permissionDialog.title') 
    });
    
    // Tool info section
    const infoEl = permissionCard.createDiv({ cls: 'opencodian-permission-inline-info' });
    infoEl.createDiv({ 
      cls: 'opencodian-permission-inline-tool',
      text: `${t('permissionDialog.description')} ${permission}`
    });
    infoEl.createDiv({ 
      cls: 'opencodian-permission-inline-desc',
      text: `${getToolDescription(permission)}`
    });

    // Show patterns (only if meaningful)
    if (patterns.length > 0 && !(patterns.length === 1 && patterns[0] === '*')) {
      const patternsEl = permissionCard.createDiv({ cls: 'opencodian-permission-inline-patterns' });
      patternsEl.createDiv({ 
        cls: 'opencodian-permission-inline-label', 
        text: t('permissionDialog.patterns') 
      });
      patterns.forEach(pattern => {
        patternsEl.createDiv({ cls: 'opencodian-permission-inline-pattern-item', text: pattern });
      });
    }

    // Show command if present
    if (metadata.command) {
      const commandEl = permissionCard.createDiv({ cls: 'opencodian-permission-inline-command' });
      commandEl.createSpan({ 
        cls: 'opencodian-permission-inline-label', 
        text: `${t('permissionDialog.command')}: ` 
      });
      commandEl.createEl('code', { text: String(metadata.command) });
    }

    // Action buttons
    const buttonsEl = permissionCard.createDiv({ cls: 'opencodian-permission-inline-buttons' });
    
    const onceBtn = buttonsEl.createEl('button', { 
      cls: 'opencodian-permission-inline-btn opencodian-permission-inline-once',
      text: t('permissionDialog.allowOnce')
    });
    
    const alwaysBtn = buttonsEl.createEl('button', { 
      cls: 'opencodian-permission-inline-btn opencodian-permission-inline-always',
      text: t('permissionDialog.allowAlways')
    });
    
    const rejectBtn = buttonsEl.createEl('button', { 
      cls: 'opencodian-permission-inline-btn opencodian-permission-inline-reject',
      text: t('permissionDialog.reject')
    });

    // Wait for user choice
    const result = await new Promise<'once' | 'always' | 'reject'>((resolve) => {
      onceBtn.addEventListener('click', () => resolve('once'));
      alwaysBtn.addEventListener('click', () => resolve('always'));
      rejectBtn.addEventListener('click', () => resolve('reject'));
    });

    // Remove the permission card entirely after selection
    // The tool execution status will be shown by the tool call renderer
    permissionCard.remove();

    // Send response to server
    try {
      await this.plugin.openCodeService.respondToPermission(id, result);
    } catch (error) {
      logger.error('Failed to respond to permission:', error);
      new Notice(t('permissionDialog.notice.error'));
    }
  }
}
