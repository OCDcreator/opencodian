# ConversationSessionRailCoordinator

> Source: `src/features/chat/services/ConversationSessionRailCoordinator.ts`

## Accessibility (R-F5 quality fix)

The rail used to be a bare `<div>` carrying only `aria-label`. A generic
element has no nameable role, so screen readers may drop that label entirely
and announce an unnamed container.

The rail is now a `role="navigation"` landmark named by its own visible title
through `aria-labelledby`. `navigation` is the accurate role because the rail's
purpose is navigating between conversations — each item loads a different
session — which is the ARIA definition of a navigation landmark.
`complementary` was rejected: it describes tangential supporting content and
would understate the primary session switcher in a wide pane. The title
element keeps its class and gains `role="heading"` + `aria-level="2"`, so it
is announced as the landmark's heading and doubles as the name source without
changing layout. Title ids come from a per-instance counter so two mounted
rails never share one. Each item keeps its existing `aria-current`
(`page` / `false`) and its `aria-label` (`currentItem` / `openItem`), and the
list keeps `role="list"` with `role="listitem"` children.

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
