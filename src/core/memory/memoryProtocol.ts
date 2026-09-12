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
    `Index layout: keep \`MEMORY.md\` grouped by type in the fixed section order \`## Feedback\`, \`## User\`, \`## Project\`, \`## Reference\` (feedback on top — procedural value first), each section ordered by importance descending, then recency. When the index nears the 200-line / 25KB warning, move entries with importance ≤ 2 that have gone 90+ days without an update below the tail marker \`${ARCHIVED_SECTION_MARKER}\`; archived entries stay readable on disk but are never injected and never count toward the limit. Archiving only ever moves an index line — the file itself is never deleted.`,
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
