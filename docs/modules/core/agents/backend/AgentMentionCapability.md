# AgentMentionCapability

Source: `src/core/agents/backend/AgentMentionCapability.ts`.

Optional backend-owned seams for effective plugin/app/MCP-resource mention catalogs and verified native session reference serialization. Missing native session support falls back to the owning backend's history reader and the unified reference snapshot path. Implementations must not report ordinary cross-session messaging as historical context or expose disabled/unusable catalog entries.
