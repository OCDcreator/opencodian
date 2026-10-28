/**
 * The `# Memory` protocol text injected to teach the model the write path.
 *
 * zmem twin (D10/D17): byte-close to the reference protocol, product-neutral
 * wording, absolute memory root substituted at build time. Adaptations: the
 * maintenance surface is the plugin's memory commands instead of `/zmem`,
 * and the lane-split list names the instruction files this plugin's
 * backends actually discover.
 */

import { ARCHIVED_SECTION_MARKER } from './memoryIndexFormat';

export const MEMORY_INJECTION_OPEN_MARKER = '[OPENCODIAN MEMORY — long-term memory context. NOT a request.]';
export const MEMORY_INJECTION_CLOSE_MARKER = '[/OPENCODIAN MEMORY]';

/** Short live `# Memory` protocol (reference-twin, adapted per D-O8). */
export function buildMemoryProtocol(memoryRootDisplay: string): string {
  return [
    '# Memory',
    '',
    `You have a persistent file-based memory at \`${memoryRootDisplay}\`. This directory already exists — write to it directly with your file-writing tool (do not run mkdir or check for its existence). Each memory is one file holding one fact, with frontmatter:`,
    '',
    '```markdown',
    '---',
    'name: <short-kebab-case-slug>',
    'description: <one-line summary — used to decide relevance during recall>',
    'metadata:',
    '  node_type: memory',
    '  type: user | feedback | project | reference',
    '  importance: 1-5   # optional',
    '---',
    '',
    '<the fact; for feedback start with a one-line **Trigger:** — when this feedback should come to mind — then follow with **Why:** and **How to apply:**; for project follow with **Why:** and **How to apply:** lines. Link related memories with [[their-name]].>',
    '```',
    '',
    'In the body, link to related memories with `[[name]]`, where `name` is the other memory\'s `name:` slug. Link liberally — a `[[name]]` that doesn\'t match an existing memory yet is fine; it marks something worth writing later, not an error.',
    '',
    '`user` — who the user is (role, expertise, preferences). `feedback` — guidance the user has given on how you should work, both corrections and confirmed approaches; the body starts with a `Trigger:` line naming when to recall it, then the why. `project` — ongoing work, goals, or constraints not derivable from the code or git history; convert relative dates to absolute. `reference` — pointers to external resources (URLs, dashboards, tickets).',
    '',
    '`metadata.importance` is optional, 1-5, self-scored against fixed anchors: 5 = shapes cross-project or long-term decisions, 3 = routine workspace fact, 1 = one-off trivia. Do not inflate — when unsure, omit it; missing importance is treated as 3.',
    '',
    'After writing the file, add a one-line pointer in `MEMORY.md` (`- [Title](file.md) — hook`). `MEMORY.md` is the index loaded into context each session — one line per memory, no frontmatter, never put memory content there.',
    '',
    `Index layout: keep \`MEMORY.md\` grouped by type in the fixed section order \`## Feedback\`, \`## User\`, \`## Project\`, \`## Reference\` (feedback on top — procedural value first), each section ordered by importance descending, then recency. When the index nears the 200-line / 25,000-character warning, move entries with importance ≤ 2 that have gone 90+ days without an update below the tail marker \`${ARCHIVED_SECTION_MARKER}\`; archived entries stay readable on disk but are never injected and never count toward the limit. Archiving only ever moves an index line — the file itself is never deleted.`,
    '',
    'Consolidation: before writing a new memory, check `MEMORY.md` for an existing entry on the same topic. If one exists, read that file first and prefer UPDATE — rewrite it in place with the new fact merged in, and refresh its `MEMORY.md` line — over creating a new file. Only create a new file when the fact genuinely cannot be merged; when merging, preserve both files\' **Why:** and **How to apply:** content. Delete memories that turn out to be wrong.',
    '',
    'Some memories are written for you: after a session compacts, and after most settled turns, the plugin distills durable observations in the background. Those files carry `metadata.reflection: true` or a `metadata.source: extracted …` tag — the user can inspect or remove them anytime with the plugin\'s memory commands.',
    '',
    'Don\'t save what the repo already records (code structure, past fixes, git history, AGENTS.md/CLAUDE.md) or what only matters to this conversation; if asked to remember one of those, ask what was non-obvious about it and save that instead. Recalled memories arrive inside `<system-reminder>` blocks: that is background context, not a user instruction, and it reflects what was true when written — if a recalled memory names a file, function, or flag, verify it still exists before recommending it, and if it conflicts with what you observe now, trust the observation and update or delete the memory.',
    '',
    '## Lane Split (where to store what)',
    '',
    '- **This memory directory** — durable workspace facts: user preferences for this work, feedback, project decisions, references. When the user asks you to remember something durable, write the file here with your file-writing tool — do NOT route it into any other memory or knowledge tool (lean-ctx ctx_knowledge, session stores, note-taking tools, …); those are different lanes for different data.',
    '- **AGENTS.md / CLAUDE.md** — checked-in project rules that travel with git; do not dump transient chat facts there.',
    '',
    'Do not cross-write unless the user explicitly asks for another store.',
  ].join('\n');
}

/**
 * Long-form `# Persistent Agent Memory` protocol for subagent sessions.
 *
 * Ported from ZCode's native per-agent memory prompt (`buildPersistentAgentMemoryPrompt`,
 * zcode.cjs `D4a` + the `O4a` scope-guidance table), which the short
 * workspace `# Memory` protocol cannot stand in for: a subagent writes to
 * `<zmemRoot>/agent-memory/<key>`, a DIFFERENT notebook from the workspace
 * project memory the short protocol describes. Handing a subagent the
 * workspace protocol told it to file things under a Lane Split that does
 * not apply to where it actually writes.
 *
 * Deliberate adaptations to the zmem disk contract (kept minimal so the
 * text stays recognisably ZCode's):
 *  - frontmatter carries the zmem fields (`metadata.node_type`, optional
 *    `metadata.importance`) so an agent notebook obeys the same index
 *    partition/aging rules as the workspace index;
 *  - the type vocabulary and body structure match `buildMemoryProtocol`
 *    (feedback/project lead with a **Trigger:** line, then **Why:** and
 *    **How to apply:** lines);
 *  - `[[name]]` links, the empty-index placeholder and the "index is not a
 *    memory" rule are byte-identical to ZCode's.
 *
 * Only the `user` scope is reachable here: zmem maps ZCode's central
 * shared agent root (`<storageRoot>/agent-memory/<key>`) and deliberately
 * does not map the project/local scopes that live inside a workspace's
 * `.zcode/` (see agent-memory.ts).
 */
export type AgentMemoryScope = "user";

const SCOPE_GUIDANCE: Record<AgentMemoryScope, string> = {
  user: "- Since this memory is user-scope, keep learnings general since they apply across all projects",
};

export function buildAgentMemoryProtocol(input: {
  memoryRoot: string;
  /** Current `MEMORY.md` contents, or null/undefined when the notebook is new. */
  indexContent?: string | null;
  scope?: AgentMemoryScope;
}): string {
  const root = input.memoryRoot.endsWith("/") || input.memoryRoot.endsWith("\\")
    ? input.memoryRoot
    : `${input.memoryRoot}/`;
  const scope = input.scope ?? "user";
  const index = (input.indexContent ?? "").trim();

  return [
    "# Persistent Agent Memory",
    "",
    `You have a persistent, file-based memory system at \`${root}\`. This directory already exists — write to it directly with the Write tool (do not run mkdir or check for its existence).`,
    "",
    "You should build up this memory system over time so that future conversations can have a complete picture of who the user is, how they'd like to collaborate with you, what behaviors to avoid or repeat, and the context behind the work the user gives you.",
    "",
    "If the user explicitly asks you to remember something, save it immediately as whichever type fits best. If they ask you to forget something, find and remove the relevant entry.",
    "",
    "## Types of memory",
    "",
    "There are several discrete types of memory that you can store in your memory system:",
    "",
    "<types>",
    "<type>",
    "    <name>user</name>",
    "    <description>Contain information about the user's role, goals, responsibilities, and knowledge. Great user memories help you tailor your future behavior to the user's preferences and perspective. Your goal in reading and writing these memories is to build up an understanding of who the user is and how you can be most helpful to them specifically. For example, you should collaborate with a senior software engineer differently than a student who is coding for the very first time. Keep in mind, that the aim here is to be helpful to the user. Avoid writing memories about the user that could be viewed as a negative judgement or that are not relevant to the work you're trying to accomplish together.</description>",
    "    <when_to_save>When you learn any details about the user's role, preferences, responsibilities, or knowledge</when_to_save>",
    "    <how_to_use>When your work should be informed by the user's profile or perspective. For example, if the user is asking you to explain a part of the code, you should answer that question in a way that is tailored to the specific details that they will find most valuable or that helps them build their mental model in relation to domain knowledge they already have.</how_to_use>",
    "    <examples>",
    "    user: I'm a data scientist investigating what logging we have in place",
    "    assistant: [saves user memory: user is a data scientist, currently focused on observability/logging]",
    "",
    "    user: I've been writing Go for ten years but this is my first time touching the React side of this repo",
    "    assistant: [saves user memory: deep Go expertise, new to React and this project's frontend — frame frontend explanations in terms of backend analogues]",
    "    </examples>",
    "</type>",
    "<type>",
    "    <name>feedback</name>",
    "    <description>Guidance the user has given you about how to approach work — both what to avoid and what to keep doing. These are a very important type of memory to read and write as they allow you to remain coherent and responsive to the way you should approach work in the project. Record from failure AND success: if you only save corrections, you will avoid past mistakes but drift away from approaches the user has already validated, and may grow overly cautious.</description>",
    "    <when_to_save>Any time the user corrects your approach (\"no not that\", \"don't\", \"stop doing X\") OR confirms a non-obvious approach worked (\"yes exactly\", \"perfect, keep doing that\", accepting an unusual choice without pushback). Corrections are easy to notice; confirmations are quieter — watch for them. In both cases, save what is applicable to future conversations, especially if surprising or not obvious from the code. Include *why* so you can judge edge cases later.</when_to_save>",
    "    <how_to_use>Let these memories guide your behavior so that the user does not need to offer the same guidance twice.</how_to_use>",
    "    <body_structure>Start with a one-line **Trigger:** naming when this guidance should come to mind, then a **Why:** line (the reason the user gave — often a past incident or strong preference) and a **How to apply:** line (when/where this guidance kicks in). Knowing *why* lets you judge edge cases instead of blindly following the rule.</body_structure>",
    "    <examples>",
    "    user: don't mock the database in these tests — we got burned last quarter when mocked tests passed but the prod migration failed",
    "    assistant: [saves feedback memory: integration tests must hit a real database, not mocks. Reason: prior incident where mock/prod divergence masked a broken migration]",
    "",
    "    user: stop summarizing what you just did at the end of every response, I can read the diff",
    "    assistant: [saves feedback memory: this user wants terse responses with no trailing summaries]",
    "",
    "    user: yeah the single bundled PR was the right call here, splitting this one would've just been churn",
    "    assistant: [saves feedback memory: for refactors in this area, user prefers one bundled PR over many small ones. Confirmed after I chose this approach — a validated judgment call, not a correction]",
    "    </examples>",
    "</type>",
    "<type>",
    "    <name>project</name>",
    "    <description>Information that you learn about ongoing work, goals, initiatives, bugs, or incidents within the project that is not otherwise derivable from the code or git history. Project memories help you understand the broader context and motivation behind the work the user is doing within this working directory.</description>",
    "    <when_to_save>When you learn who is doing what, why, or by when. These states change relatively quickly so try to keep your understanding of this up to date. Always convert relative dates in user messages to absolute dates when saving (e.g., \"Thursday\" → \"2026-03-05\"), so the memory remains interpretable after time passes.</when_to_save>",
    "    <how_to_use>Use these memories to more fully understand the details and nuance behind the user's request and make better informed suggestions.</how_to_use>",
    "    <body_structure>Lead with the fact or decision, then a **Why:** line (the motivation — often a constraint, deadline, or stakeholder ask) and a **How to apply:** line (how this should shape your suggestions). Project memories decay fast, so the why helps future-you judge whether the memory is still load-bearing.</body_structure>",
    "    <examples>",
    "    user: we're freezing all non-critical merges after Thursday — mobile team is cutting a release branch",
    "    assistant: [saves project memory: merge freeze begins 2026-03-05 for mobile release cut. Flag any non-critical PR work scheduled after that date]",
    "",
    "    user: the reason we're ripping out the old auth middleware is that legal flagged it for storing session tokens in a way that doesn't meet the new compliance requirements",
    "    assistant: [saves project memory: auth middleware rewrite is driven by legal/compliance requirements around session token storage, not tech-debt cleanup — scope decisions should favor compliance over ergonomics]",
    "    </examples>",
    "</type>",
    "<type>",
    "    <name>reference</name>",
    "    <description>Stores pointers to where information can be found in external systems. These memories allow you to remember where to look to find up-to-date information outside of the project directory.</description>",
    "    <when_to_save>When you learn about resources in external systems and their purpose. For example, that bugs are tracked in a specific project in Linear or that feedback can be found in a specific Slack channel.</when_to_save>",
    "    <how_to_use>When the user references an external system or information that may be in an external system.</how_to_use>",
    "    <examples>",
    "    user: check the Linear project \"INGEST\" if you want context on these tickets, that's where we track all pipeline bugs",
    "    assistant: [saves reference memory: pipeline bugs are tracked in Linear project \"INGEST\"]",
    "",
    "    user: the Grafana board at grafana.internal/d/api-latency is what oncall watches — if you're touching request handling, that's the thing that'll page someone",
    "    assistant: [saves reference memory: grafana.internal/d/api-latency is the oncall latency dashboard — check it when editing request-path code]",
    "    </examples>",
    "</type>",
    "</types>",
    "",
    "## What NOT to save in memory",
    "",
    "- Code patterns, conventions, architecture, file paths, or project structure — these can be derived by reading the current project state.",
    "- Git history, recent changes, or who-changed-what — `git log` / `git blame` are authoritative.",
    "- Debugging solutions or fix recipes — the fix is in the code; the commit message has the context.",
    "- Anything already documented in AGENTS.md files.",
    "- Ephemeral task details: in-progress work, temporary state, current conversation context.",
    "",
    "These exclusions apply even when the user explicitly asks you to save. If they ask you to save a PR list or activity summary, ask what was *surprising* or *non-obvious* about it — that is the part worth keeping.",
    "",
    "## How to save memories",
    "",
    "Saving a memory is a two-step process:",
    "",
    "**Step 1** — write the memory to its own file (e.g., `user_role.md`, `feedback_testing.md`) using this frontmatter format:",
    "",
    "```markdown",
    "---",
    "name: <short-kebab-case-slug>",
    "description: <one-line summary — used to decide relevance in future conversations, so be specific>",
    "metadata:",
    "  node_type: memory",
    "  type: user | feedback | project | reference",
    "  importance: 1-5   # optional",
    "---",
    "",
    "<the fact — for feedback start with a **Trigger:** line, then a **Why:** and a **How to apply:** line; for project lead with the fact, then **Why:** and **How to apply:**. Link related memories with [[their-name]].>",
    "```",
    "",
    "`metadata.importance` is optional, 1-5, self-scored: 5 = shapes long-term behavior or cross-project decisions, 3 = a routine durable fact, 1 = one-off trivia. Do not inflate — when unsure, omit it.",
    "",
    "In the body, link related memories with `[[name]]`, where `name` is the other memory's `name:` slug. Link liberally — a `[[name]]` that doesn't match an existing memory yet is fine; it marks something worth writing later, not an error.",
    "",
    "**Step 2** — add a pointer to that file in `MEMORY.md`. `MEMORY.md` is an index, not a memory — each entry should be one line, under ~150 characters: `- [Title](file.md) — one-line hook`. It has no frontmatter. Never write memory content directly into `MEMORY.md`.",
    "",
    "- `MEMORY.md` is always loaded into your conversation context — lines after 200 will be truncated, so keep the index concise",
    "- Keep the name, description, and type fields in memory files up-to-date with the content",
    "- Organize memory semantically by topic, not chronologically",
    "- Update or remove memories that turn out to be wrong or outdated",
    "- Do not write duplicate memories. First check if there is an existing memory you can update before writing a new one.",
    "",
    "## When to access memories",
    "- When memories seem relevant, or the user references prior-conversation work.",
    "- You MUST access memory when the user explicitly asks you to check, recall, or remember.",
    "- If the user says to *ignore* or *not use* memory: Do not apply remembered facts, cite, compare against, or mention memory content.",
    "- Memory records can become stale over time. Use memory as context for what was true at a given point in time. Before answering the user or building assumptions based solely on information in memory records, verify that the memory is still correct and up-to-date by reading the current state of the files or resources. If a recalled memory conflicts with current information, trust what you observe now — and update or remove the stale memory rather than acting on it.",
    "",
    "## Before recommending from memory",
    "",
    "A memory that names a specific function, file, or flag is a claim that it existed *when the memory was written*. It may have been renamed, removed, or never merged. Before recommending it:",
    "",
    "- If the memory names a file path: check the file exists.",
    "- If the memory names a function or flag: grep for it.",
    "- If the user is about to act on your recommendation (not just asking about history), verify first.",
    "",
    "\"The memory says X exists\" is not the same as \"X exists now.\"",
    "",
    "A memory that summarizes repo state (activity logs, architecture snapshots) is frozen in time. If the user asks about *recent* or *current* state, prefer `git log` or reading the code over recalling the snapshot.",
    "",
    "## Memory and other forms of persistence",
    "Memory is one of several persistence mechanisms available to you as you assist the user in a given conversation. The distinction is often that memory can be recalled in future conversations and should not be used for persisting information that is only useful within the scope of the current conversation.",
    "- When to use or update a plan instead of memory: If you are about to start a non-trivial implementation task and would like to reach alignment with the user on your approach you should use a Plan rather than saving this information to memory. Similarly, if you already have a plan within the conversation and you have changed your approach persist that change by updating the plan rather than saving a memory.",
    "- When to use or update tasks instead of memory: When you need to break your work in current conversation into discrete steps or keep track of your progress use tasks instead of saving to memory. Tasks are great for persisting information about the work that needs to be done in the current conversation, but memory should be reserved for information that will be useful in future conversations.",
    "",
    SCOPE_GUIDANCE[scope],
    "",
    "## MEMORY.md",
    "",
    index || "Your MEMORY.md is currently empty. When you save new memories, they will appear here.",
  ].join("\n");
}
