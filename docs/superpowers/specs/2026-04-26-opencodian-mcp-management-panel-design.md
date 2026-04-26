# OpenCodian MCP Management Panel Design

## Goal

Replace the current MCP settings surface with a card-based MCP management panel that feels like a dedicated manager instead of a stack of generic settings rows, while keeping the design grounded in current OpenCode and OpenCodian seams.

The panel should support:

- runtime MCP status refresh
- per-server runtime connect/disconnect
- per-server monitor/details modal
- per-server add/edit modal
- true project-level delete from `.opencode/opencode.json`

It should not overpromise data that the current OpenCode/OpenCodian public MCP seam does not actually provide.

## Why A New Spec

The earlier MCP specs in this repo focused on:

- introducing MCP into the settings/navigation structure
- stabilizing MCP tool rendering in chat
- improving the existing settings-page layout

This spec is narrower and more concrete:

- keep MCP as its own primary settings page
- upgrade it into a dedicated management panel
- add safe project-config edit/delete semantics
- define hard boundaries for runtime truth vs config truth vs unavailable data

## Design Review Outcome Incorporated

This spec is intentionally stricter than the first draft because design review identified several risks:

- current MCP runtime snapshot does not expose a stable `server -> tools` public seam
- current MCP settings owner is runtime-status-oriented, not config-authoritative
- true delete/edit flows need explicit config-write ownership and failure handling
- technical details can expose secrets unless redaction rules are explicit
- a visual toggle can be misread as config enable/disable instead of runtime connect/disconnect

## Accepted Scope

- keep `MCP` as its own primary settings page
- replace the current page structure with:
  - top toolbar
  - stats cards
  - MCP server cards list
- add a monitor/details modal per server
- add a shared add/edit modal for project-owned servers
- add true delete for project-owned servers
- keep current runtime MCP actions:
  - refresh
  - connect
  - disconnect
  - authenticate
  - clear auth
- update i18n, tests, and module docs

## Out Of Scope

- MCP resources browsing
- MCP prompts browsing or execution
- per-tool enable/disable inside a server
- global or inherited MCP config editing outside the current project
- changing OpenCode server or SDK protocols
- inventing a fake or inferred full `server -> tools` mapping where no stable public seam exists

## Source Of Truth Model

The panel must explicitly separate three categories of truth.

### 1. Runtime Truth

Owned by the existing MCP runtime seam and snapshot:

- status
- runtime connect/disconnect success
- auth-required / client-registration-required / failed states
- last runtime refresh time

Primary source:

- `OpenCodeService`
- `OpenCodeCatalogQueryCoordinator`
- `OpenCodeCatalogStateStore`
- `McpServerSnapshot`

### 2. Project Config Truth

Owned by the project `.opencode/opencode.json` file.

This is the only source used for:

- edit
- delete
- prefilled add/edit modal values
- knowing whether a server is project-owned and writable

Primary source:

- `OpencodeConfigManager`

### 3. Unavailable Or Non-Authoritative Data

The UI must not present these as guaranteed truths unless a stable seam is added:

- exact per-server authoritative tool catalog
- inherited/global-only MCP config details when they are not present in project config
- secrets in clear text

When unavailable, the UI must say so directly instead of fabricating completeness.

## Information Architecture

### Page Layout

The MCP page becomes a management panel with three vertical layers:

1. **Header / Toolbar**
   - page title
   - short explanatory copy
   - `Refresh Status`
   - `Add Server`

2. **Stats Row**
   - total
   - connected
   - needs auth
   - failed

3. **Server Cards**
   - one card per server
   - empty state remains within the same card list shell

The add-server form is removed from the page body and moved into a modal opened from the toolbar button.

### Server Card Content

Each server card shows:

- server name
- transport/type badge:
  - `HTTP` for remote
  - `STDIO` for local
- endpoint summary:
  - remote: normalized URL
  - local: first command line summary
- runtime status badge
- secondary helper line:
  - last refresh / error summary / auth hint / config ownership hint
- action area on the right:
  - runtime connection toggle
  - monitor/details
  - edit
  - delete

### Ownership Indicator

Each card must resolve whether the server is:

- **project-owned**
  - present in current project `.opencode/opencode.json`
  - editable and deletable
- **runtime-only or inherited**
  - visible from runtime status but not defined in current project config
  - read-only for edit/delete in this panel

This distinction must be visible in card metadata and respected in action enablement.

## Runtime Connection Toggle

The card uses a visual switch, but its meaning is strictly:

- `ON` means the desired runtime state is connected
- `OFF` means the desired runtime state is disconnected

It is **not** the same as config `enabled`.

Requirements:

- label it as runtime connection, not generic enable/disable
- disable it during in-flight actions
- keep status badge independent from switch position while a request is pending
- on failure, revert the visual state to reflected runtime truth and show a notice

## Monitor / Details Modal

### Purpose

Provide a richer operational view for one server without pretending to be a full configuration editor.

### Top Section

Show:

- server name
- runtime status
- success/failure/auth summary card
- transport summary
- refresh time

For remote servers, include:

- URL

For local servers, include:

- concise command summary

### Tools Section

This section must follow a strict boundary:

- if OpenCodian has a stable, attributable set of tools for the server, show tool cards
- if not, show a clear unavailable state such as:
  - `Tool details are not reliably exposed by the current OpenCode runtime seam`

The spec does **not** require a fake count or a guessed complete list.

If a future implementation adds a stable seam, each tool card may show:

- tool name
- description
- source/client label

No per-tool toggle is in scope for this design.

### Technical Details Section

Collapsible by default.

May include:

- type
- enabled
- timeout
- headers presence summary
- oauth mode
- raw error text
- full command or environment summary

But sensitive values must be redacted by rule.

## Sensitive Data Redaction Rules

The panel must never display sensitive values in clear text by default.

Redact or summarize:

- `Authorization` headers
- bearer tokens
- API keys
- OAuth client secrets
- environment values

Examples:

- show header keys, not header values
- show environment keys, not environment values
- show `OAuth configured` instead of raw `clientSecret`

Non-sensitive values like URL host, command executable name, timeout, and OAuth mode can remain visible.

## Add / Edit Modal

### Shared Modal

Use one shared modal for:

- add server
- edit server

Add mode:

- empty defaults

Edit mode:

- prefilled from project config truth

### Supported Config Surface

The modal supports only the project-level MCP fields OpenCodian can safely round-trip:

#### Local

- `type`
- `command`
- `environment`
- `enabled`
- `timeout`

#### Remote

- `type`
- `url`
- `headers`
- `enabled`
- `timeout`
- `oauth`
  - auto/default
  - disabled
  - configured
  - `clientId`
  - `clientSecret`
  - `scope`
  - `redirectUri`

### Unknown Field Preservation

When editing an existing project-owned server entry:

- preserve unknown keys under that server entry whenever possible
- do not normalize the entry into a smaller shape that silently drops unknown upstream fields

This prevents OpenCodian from erasing valid MCP config that it does not yet understand.

## Delete Flow

### Meaning

Delete means:

- remove the server entry from current project `.opencode/opencode.json`

It does not mean:

- only disconnect
- only set `enabled: false`

### Preconditions

Delete is available only for project-owned servers.

If a server is runtime-visible but not project-owned:

- hide delete
  or
- show a disabled delete action with an explanation

### Behavior

1. open confirmation dialog
2. if currently connected, disconnect best-effort first
3. remove the server entry from project config
4. write config safely
5. refresh runtime status
6. show success/failure notice

### Safety Requirements

The delete flow must not proceed if project config cannot be read confidently.

Specifically:

- if config parsing fails, do not synthesize a default config and write it back
- surface a blocking error instead
- require the user to fix or inspect config first

This rule also applies to edit.

## Config Mutation Owner

Introduce a dedicated MCP config mutation owner instead of placing config write logic directly in `SettingsMcpSection`.

Responsibilities:

- read project MCP config entries
- resolve project-owned vs non-project-owned servers
- upsert a project-owned MCP entry
- delete a project-owned MCP entry
- preserve unrelated config
- preserve unknown fields when feasible
- fail closed on parse ambiguity

This owner should use `OpencodeConfigManager`, but it should not turn `SettingsMcpSection` into a file-editing module.

## Runtime Refresh And Post-Mutation Behavior

After add/edit/delete:

- refresh MCP runtime status
- update card UI to match runtime truth

The spec does not assume silent full runtime reconfiguration beyond current seams.

If runtime state cannot fully converge after config mutation:

- show accurate notice text
- prefer “config updated; reconnect or refresh runtime if needed” over implying instant full application

Implementation may improve convergence later, but the initial spec should not promise more than current runtime behavior can guarantee.

## Proposed Owners

### Keep

- `SettingsMcpSection`
  - page shell
  - toolbar
  - stats cards
  - server card list
  - runtime action dispatch

### Add

- `McpConfigService` or equivalently named owner
  - project MCP config read/update/delete
  - writable ownership resolution
  - unknown-field-preserving mutations

- `McpServerEditorModal`
  - add/edit modal

- `McpServerStatusModal`
  - monitor/details modal

### Extend Carefully

- `OpenCodeService`
  - only if needed for a clean runtime-facing seam consumed by the new UI

- `OpenCodeCatalogStateStore`
  - only if a stable new runtime snapshot slice is added

## Testing Requirements

### Unit Tests

- card action dispatch:
  - toggle connect/disconnect
  - monitor button
  - edit button
  - delete button
- project-owned vs read-only action availability
- add/edit modal validation and prefill
- delete confirmation and failure handling
- config service unknown-field preservation
- config service parse-failure hard stop
- secret redaction in details modal

### Verification

- `npm run check:module-docs`
- `npm run verify`
- build
- Test Vault deployment and `BUILD_ID` verification if deploy-relevant runtime/style files change

## Non-Goals For The First Implementation Slice

To keep the plan implementable and honest, the first implementation slice should avoid:

- inventing a server-owned tool inventory if the seam is not proven
- showing raw secrets in any modal
- mutating inherited/global MCP config
- adding another overloaded all-in-one settings mega owner

## Success Criteria

The design is successful if:

- the MCP page feels like a proper manager, not loose settings rows
- users can clearly distinguish runtime state from project config state
- project-owned servers can be safely added, edited, and truly deleted
- runtime-only or inherited servers are not accidentally treated as project-owned
- details modals stay useful without lying about unavailable server->tools data
- the spec remains narrow enough to turn into a single implementation plan
