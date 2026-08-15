import './ConversationRenderService.testSupport';

import type { ChatMessage } from '../../../../src/core/types';
import {
  ConversationRenderService,
  createHost,
  createMessage,
} from './ConversationRenderService.testSupport';

/**
 * Yield to the event loop so macrotasks (e.g. MarkdownRenderScheduler's
 * setTimeout) can fire. Plain `await Promise.resolve()` only drains the
 * microtask queue and will hang if the code under test relies on a timer.
 */
const waitForMacroTask = (iterations = 1): Promise<void> =>
  new Promise((resolve) => {
    let remaining = iterations;
    const tick = (): void => {
      remaining -= 1;
      if (remaining <= 0) {
        resolve();
      } else {
        setTimeout(tick, 0);
      }
    };
    setTimeout(tick, 0);
  });

/**
 * Phase 3 interleave tests: authoritative sync / pseudo-stream / full refresh
 * must not cross-contaminate the live DOM when they overlap in time. These use
 * real async gates (Promise release points) so the overlap is genuine, not
 * sequential. The baseline serializes full rerenders (rerenderQueue +
 * generation) and defers visible sync during hydration.
 */
describe('ConversationRenderService render-path interleave boundaries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 1. A full refresh is in its staging phase (rendering messages into the
  //    detached staging root) when a sync append arrives. The sync must not
  //    append into the live pane while staging is in flight, and once both
  //    settle the DOM must contain exactly the synced set with no duplicates.
  it('does not interleave a sync append into the live pane while a full refresh is staging', async () => {
    const host = createHost();
    const service = new ConversationRenderService(host);
    const conversation = host.getCurrentConversation();
    const baseMessages: ChatMessage[] = [
      createMessage({ id: 'user-1', role: 'user', content: 'Q' }),
      createMessage({ id: 'assistant-1', content: 'A' }),
    ];
    conversation.messages = baseMessages;

    // Gate the full refresh inside its assistant body render. The shell element
    // is created and appended synchronously (matching the real runtime which
    // creates the turn shell before the first await); only the body work gates.
    let releaseStaging: () => void = () => undefined;
    const stagingGate = new Promise<void>((resolve) => { releaseStaging = resolve; });
    host.assistantShellRender.renderPersistedMessage.mockImplementation(async (message) => {
      // Synchronously create + append the shell (mirrors real runtime behavior).
      const el = document.createElement('div');
      el.className = 'opencodian-message';
      el.dataset.messageId = message.id;
      host.messagesEl.appendChild(el);
      if (message.role === 'assistant') {
        await stagingGate;
      }
      return el;
    });

    const full = service.rerenderConversationMessages(conversation);
    // Wait until the assistant gate has actually been entered (the render loop
    // processes user messages first, so a single microtask is not enough).
    while (host.assistantShellRender.renderPersistedMessage.mock.calls.length === 0) {
      await Promise.resolve();
    }
    // The synchronous shell creation is immediately moved into the detached
    // staging root by ConversationMessageRenderDelegate. While the async body
    // work is gated, no historical message may remain in the live pane.
    expect(host.messagesEl.querySelectorAll('[data-message-id]')).toHaveLength(0);

    // While staging is in flight (gate awaited), a sync append arrives.
    const synced: ChatMessage[] = [...baseMessages, createMessage({ id: 'user-2', role: 'user', content: 'Follow-up' })];
    conversation.messages = synced;
    const syncUpdate = service.applySyncedConversationUpdate(baseMessages, synced);

    // Wait one microtask so the sync update has had a chance to start its
    // apply path before releasing the staging gate.
    await Promise.resolve();
    expect(host.messagesEl.querySelectorAll('[data-message-id]')).toHaveLength(0);

    releaseStaging();
    await Promise.all([full, syncUpdate]);

    // After both settle: the DOM must be consistent. The full refresh's staging
    // commit wins the lease; the sync append is either deferred or superseded.
    // Either way: no duplicate ids, and the base messages must all be present
    // (no message lost to interleaving).
    const ids = (name: string) => Array.from(host.messagesEl.querySelectorAll(`[data-message-id="${name}"]`));
    const collectIds = () => Array.from(host.messagesEl.querySelectorAll('[data-message-id]'))
      .map((el) => (el as HTMLElement).dataset.messageId);
    const firstRoundIds = collectIds();
    expect(new Set(firstRoundIds).size).toBe(firstRoundIds.length);
    // The full refresh rendered base messages; assistant-1 must be present
    // (not lost to interleaving).
    expect(ids('assistant-1').length).toBe(1);
    expect(ids('user-1').length).toBe(1);

    // A subsequent full refresh with the synced set brings the DOM fully in
    // sync with no duplicates.
    await service.rerenderConversationMessages(conversation);
    const finalIds = collectIds();
    expect(new Set(finalIds).size).toBe(finalIds.length);
    expect(new Set(finalIds).has('user-2')).toBe(true);
    expect(new Set(finalIds).has('assistant-1')).toBe(true);
  });

  // 2. A pseudo-stream reveal is in its async markdown render when the messages
  //    container is replaced (cleared). The in-flight markdown completion must
  //    not commit into the now-detached text element. This locks the staging
  //    guard added to the pseudo-stream scheduler callback.
  it('does not commit staged markdown into a detached text element when the container clears mid-render', async () => {
    const host = createHost();
    const service = new ConversationRenderService(host);
    const conversation = host.getCurrentConversation();
    const previousMessages = [
      createMessage({ id: 'user-1', role: 'user', content: 'Question' }),
    ];
    const syncedAssistant = createMessage({
      id: 'assistant-2',
      role: 'assistant',
      content: '一。二。三。四。五。六。七。八。九。十。',
    });
    conversation.messages = [...previousMessages, syncedAssistant];

    // The pseudo-stream creates a .streaming-text-block inside the assistant
    // shell's contentEl. We capture it by querying the DOM after the shell
    // mock has created the message element.
    let capturedContentEl: HTMLElement | null = null;
    host.assistantShellRender.createAssistantMessageElement.mockImplementation(() => {
      const messageEl = document.createElement('div');
      messageEl.className = 'opencodian-message opencodian-message--assistant is-streaming';
      messageEl.dataset.messageId = 'assistant-2';
      const contentEl = document.createElement('div');
      contentEl.className = 'opencodian-message-content';
      messageEl.appendChild(contentEl);
      host.messagesEl.appendChild(messageEl);
      capturedContentEl = contentEl;
      return { messageEl, contentEl };
    });

    // Gate the markdown render so we can clear the container while it is
    // in flight, then signal when the render callback has fully completed.
    let releaseMarkdown: () => void = () => undefined;
    const markdownGate = new Promise<void>((resolve) => { releaseMarkdown = resolve; });
    let markdownRenderEntered = false;
    let markdownRenderCompleted = false;
    host.renderMarkdownInto.mockImplementation(async (stagingEl, markdown) => {
      markdownRenderEntered = true;
      // Hold on the first pseudo-stream render so the test can clear the
      // container while the markdown service is "awaiting".
      await markdownGate;
      stagingEl.textContent = markdown;
      markdownRenderCompleted = true;
    });

    // Start the sync update; it enters the pseudo-stream reveal which calls
    // renderMarkdownInto (now gated).
    const update = service.applySyncedConversationUpdate(previousMessages, conversation.messages);
    // Wait until the markdown render gate has actually been entered.
    // The scheduler uses setTimeout, so we must yield macrotasks, not just
    // microtasks.
    while (!markdownRenderEntered) {
      await waitForMacroTask();
    }

    // The pseudo-stream has created the text element inside capturedContentEl.
    const realTextEl = capturedContentEl?.querySelector('.streaming-text-block') as HTMLElement | null;
    expect(realTextEl).not.toBeNull();

    // Clear the container while the markdown render is in flight. This
    // detaches realTextEl (removes it from the live messages container).
    expect(host.messagesEl.contains(realTextEl)).toBe(true);
    host.clearMessagesContainer();
    expect(host.messagesEl.contains(realTextEl)).toBe(false);

    // Release the gate so the markdown render completes.
    releaseMarkdown();
    await update;
    // Ensure the render callback has run to completion after the gate release.
    while (!markdownRenderCompleted) {
      await waitForMacroTask();
    }

    // The staging guard must have prevented committing into the detached
    // realTextEl — it should still be empty.
    expect(realTextEl!.textContent).toBe('');
  });

  // 3. A true serial no-op: establish the fingerprint with a completed full
  //    refresh, then a second (awaited, not same-tick) full refresh with
  //    identical input must short-circuit without clearing.
  it('short-circuits a second serial full refresh with identical input after the first commits', async () => {
    const host = createHost();
    const service = new ConversationRenderService(host);
    const conversation = host.getCurrentConversation();
    conversation.messages = [
      createMessage({ id: 'user-1', role: 'user', content: 'Q' }),
      createMessage({ id: 'assistant-1', content: 'A' }),
    ];

    // First full refresh establishes the fingerprint cache.
    await service.rerenderConversationMessages(conversation);
    expect(host.clearMessagesContainer).toHaveBeenCalledTimes(1);

    // Second refresh, awaited separately (serial, not same-tick), identical
    // input → must no-op (no second clear).
    await service.rerenderConversationMessages(conversation);
    expect(host.clearMessagesContainer).toHaveBeenCalledTimes(1);
  });
});
