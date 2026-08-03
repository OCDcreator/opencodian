# ADR 0002 — Turn change records survive authoritative sync

Status: accepted

OpenCode owns canonical conversation messages, but it does not own OpenCodian's per-turn file-change evidence. We will preserve immutable, locally generated Turn Change Records across OpenCode authoritative sync and canonical re-render, while keeping them distinct from backend messages. This deliberately prefers an additive local audit timeline over treating server messages as the only renderable history.

## Considered options

- Drop every client-generated notice during authoritative sync — rejected because a displayed and locally persisted file-change record would disappear after reload.
- Store the record as an OpenCode canonical message — rejected because the server API has no such message contract and the record is plugin-owned.
- Preserve only the typed Turn Change Record — accepted; it prevents broad, accidental retention of unrelated local notices.

## Consequences

- Turn Change Records need a stable `noticeMeta.kind` and a sync/render preservation path.
- The records remain immutable snapshots; later turns and background tasks add their own records instead of rewriting earlier ones.
- The Session Change Sidebar remains a separate, mutable current-session projection.
