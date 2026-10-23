const USER_MESSAGE_STREAMING_ACTION_SELECTOR = '.opencodian-user-action-btn';

export function syncUserMessageStreamingActionState(
  container: ParentNode,
  isStreaming: boolean,
): void {
  container.querySelectorAll<HTMLButtonElement>(USER_MESSAGE_STREAMING_ACTION_SELECTOR).forEach((button) => {
    button.disabled = isStreaming;
  });
}
