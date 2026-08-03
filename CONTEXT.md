# CONTEXT

> Glossary for the OpenCodian configuration-completeness work. Canonical terms
> only — use these in code, docs, UI copy, and discussions. See
> `docs/adr/0001-complete-configuration-means-closed-loop-control.md` for the
> decision these terms support.

## Canonical terms

### Complete Configuration

A setting is **completely configured** only when it is proven across three
independent axes (persistence, application, runtime). Completeness is *not*
"every backend CRUD operation is exposed" (CRUD symmetry is a separate,
weaker goal). A field that is editable in a form but never reaches the
backend request — or is never confirmed by the backend — is not complete.

### Configuration Loop

The closed path a setting travels: **persist** (a source the plugin owns) →
**apply** (wired into the backend request) → **runtime readback** (the backend
confirms the effective value). A gap on any axis breaks the loop. The loop is
the unit of completeness, not the individual control.

### User Decision Surface

The set of points where a human makes a real choice (model, permission mode,
approval policy, sandbox, etc.). The plugin's job is to make these surfaces
honest: show what is actually in effect, what is merely requested, and what is
unknown. Diagnostic readbacks that are not decisions are **not** part of this
surface.

### Configuration Scope

The root layer a configuration file belongs to: **global** (`~/.claude`,
`~/.agents`, `~/.codex`, `~/.opencode`), **project** (inside the vault), or
**local** (machine-local project overlay). Global roots are writable *only*
when explicitly passed through an allowlisted-root contract; they are never
silently writable.

### Session Override

A per-conversation value that shadows the global default for a single session.
Nullable by design: `null` / `undefined` means **inherit the global setting**.
An override is applied at the next backend thread/turn boundary, not mid-turn.

### Capability Navigation

Helping a user understand, for a chosen backend, which capabilities exist,
which are configurable in-plugin, and where to configure each. This is
**navigation**, distinct from Complete Configuration: it answers "where do I
edit?" rather than "is this fully proven?". Navigation lives in the Capability
Lab, not in every settings tab.

### Configuration Evidence

The status of a setting along each axis: **verified** (proven), **pending**
(proof queued, e.g. next turn), **unavailable** (the backend version does not
expose it), **failed** (a readback attempt failed), **not-applicable** (the
axis does not apply). Only `verified` on all three axes means complete.

### Source Grouping

Organizing settings by *what they control* (model, permissions, sandbox,
context sources, tools, etc.) rather than by which file/backend they happen to
originate from. Source grouping reduces the "where do I configure this?"
scatter across tabs.

### Chat Change Tracking

**Turn Change Record**:
An immutable, locally owned history record of the files changed by one
completed agent turn. It is evidence of that turn, not a mutable description
of the current working tree.
_Avoid_: diff toast, temporary change card

**Session Change Sidebar**:
A mutable, current-session overview of files OpenCode changed, distinct from
repository-wide Git status and from Turn Change Records.
_Avoid_: Git changes sidebar, global change list

### Capability Lab

The diagnostic/navigation surface (`SettingsCapabilityLabSection`) that shows
runtime truth per backend: live catalogs, capability probes, and readbacks. It
is the home of Capability Navigation and runtime evidence display — not a
configuration editor.

## Avoid (aliases / discouraged phrasing)

| Avoid | Use instead |
|-------|-------------|
| "fully exposed" / "fully wired" | **Complete Configuration** (only when all three axes are verified) |
| "CRUD parity" / "backend symmetry" | **Configuration Loop** (completeness), or state plainly that CRUD symmetry is a separate, weaker goal |
| "global resources are read-only" | **Configuration Scope** with an explicit allowlisted-root contract (globals are writable only when allowlisted) |
| "the setting works" | **Configuration Evidence**: state which axis is verified vs unavailable |
| "settings map" / "settings overview" | **Capability Navigation** (when it answers where-to-edit) |
| per-file settings scatter | **Source Grouping** (group by what a setting controls) |
