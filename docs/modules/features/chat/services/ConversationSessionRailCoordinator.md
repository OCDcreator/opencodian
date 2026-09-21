# ConversationSessionRailCoordinator

> Source: `src/features/chat/services/ConversationSessionRailCoordinator.ts`

`ConversationSessionRailCoordinator` owns only the optional R-F5 wide-pane
session rail DOM. It receives a narrow chat-shell host for the already
canonical conversation list, current conversation, streaming state and
`loadConversation()` path; it does not cache, delete, rename or export a
conversation.

When `chatSessionRailEnabled` is false, `refresh()` leaves no rail DOM or
layout class. In wide panes the rail shows each stored conversation's title
and date, marks the current item, and delegates a non-current click to the
existing load path. It refuses selection while the active tab streams using
the existing streaming-blocked notice. `destroy()` removes the DOM and layout
class so closed views retain no listener or layout residue.
