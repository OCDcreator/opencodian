# Configuration fields to backend tasks

Derived on 2026-11-07 from the per-backend field tables before UI implementation. The registry is navigation data; backend owners keep the canonical settings, mutation validation and runtime readback. These task groups describe user decisions rather than separate configuration files.

Coverage status (2026-11-08): the first-build captures in `.tmp/backend-refresh-ui/` (`first-build-open.json`, `scenarios/missing-cli-results.json`) show these task groups rendering per backend — on the PRE-copy-fix build, so they are structural confirmation only, not final acceptance evidence (see `evidence-index.md`). The copy pass (2026-11-08) renamed no task groups; this map remains current pending round-2 captures on the final build.

| Backend / task | Field families and existing capabilities | Reason |
| --- | --- | --- |
| Claude / Conversation | model, fallbackModel, thinking, effort, outputStyle, systemPrompt, autoTitle, suggestions and question presentation; auxiliary model choices | Defaults for the next conversation or query are found together. |
| Claude / Models and accounts | provider presets, endpoints, authentication and account readback | The provider and its credential are configured together with an explicit source. |
| Claude / Tools and context | settingSources, additionalDirectories, tool allow/deny/restriction, toolAliases, MCP, strictMcpConfig, context beta | Controls which instructions and tools a conversation can see. |
| Claude / Permissions and limits | permissionMode, sandbox fields, maxTurns/maxBudgetUsd/taskBudget | Changes to file/command access and cost ceilings are physically separate from model preferences. |
| Claude / Resources and sessions | skills, commands and agents, existing file editors and history | Authored resources remain in their native revision-checked stores. |
| Claude / Connection and advanced | executablePath, JS runtime, load timeout and diagnostic readbacks | Process execution and installation settings have a separate task and application boundary. |
| Codex / Conversation | live model catalog, reasoning effort, web search, auxiliary model choices | Normal defaults are choices with a recommended or inherited value. |
| Codex / Permissions and limits | sandboxMode, approvalPolicy, networkAccessEnabled, additionalDirectories | The sandbox/approval boundary is shown beside the action it permits. |
| Codex / Account | native account, credential fallback and cost attribution | Identity and billing configuration remain distinct from normal model selection. |
| Codex / Connection and advanced | executablePath, connection summary, project config.toml and global source summary | Installation changes and native source editing retain their required restart/history semantics. |
| Codex / Resources and sessions | resume/readback, resources and plugins | Exploration does not overload the normal default page. |
| Pi / Model | provider/model/thinking defaults and native model group | Plugin fallback defaults and actual Pi defaults must show their different source. |
| Pi / Providers and account | models.json provider/model schema and OAuth/API key onboarding | Credentials stay in the native source and use explicit global/project scope. |
| Pi / Execution | native execution group and advanced runtime/configuration disclosure | Potential command/tool behavior is separate from model preferences. |
| Pi / MCP | declared server merge and last extension status | Read-only discovery is labelled as such and does not pretend to edit upstream configuration. |
| Pi / Sessions | resources and session workbench | Existing capabilities remain reachable after removing redundant tabs. |
| Pi / Connection | official package discovery and executable override | Automatic installation discovery is the default; custom paths are an explicit choice. |
| ZCode / Chat | model, thinking, completion navigation | Defaults for newly materialized conversations; existing chats retain their observed selection. |
| ZCode / Personal API services | shared personal provider/model configuration | Before editing, users see that the change affects OpenCodian and ZCode desktop. |
| ZCode / Official account | OpenCodian's machine-wide official login | Signing out affects local OpenCodian vaults; the desktop login remains a separate identity. |
| ZCode / Permissions | mode, with per-mode tool and write consequences | Edit/yolo choices are physically separated from ordinary model defaults. |
| ZCode / Tools | native tools, plugins and MCP status | Runtime status stays distinct from defaults. |
| ZCode / Installation | executablePath, runtime discovery and reconnect | Automatic discovery, custom location and the required application boundary remain explicit. |
| OpenCode 2 / Connection | mode, executablePath, baseUrl, password | Local/remote connection is selected before free-form connection details appear. |
| OpenCode 2 / Model | live model catalog, provider authentication, title and auxiliary models | Choose known models or inherit the runtime configuration; preserve unknown saved models. |
| OpenCode 2 / Agents | default agent and native agent configuration | Agent identity/behavior remain a focused task. |
| OpenCode 2 / Permissions | permissionMode and ordered permission rules | Risky access choices stay separate from ordinary preferences. |
| OpenCode 2 / MCP | native MCP declarations and status | Tools can be managed without opening the whole raw configuration. |
| OpenCode 2 / Advanced | resources/instructions/context/compaction, provider overlays, execution and raw JSONC | Less frequent configuration is findable through named groups/disclosures while preserving draft conflict handling. |
| DSH / Connection | native/ACP, executablePath, workingDirectory; separate advanced args/env | Safe defaults are choices; process overrides remain clearly marked. |
| DSH / Model | existing per-backend auxiliary model controls | Persist only fields supported by the actual backend contract. |
| DSH / MCP | guided stdio/HTTP server declarations, no-tools default, explicit apply | Prefer structured choices over raw JSON; preserve draft-versus-applied semantics. |
| DSH / Configuration | native readSessionConfiguration model/effort/image readback | Readback is labelled read-only; it does not invent unsupported persistence. |

Claude and Codex keep a dedicated diagnostic task. The generic Capability Lab remains a diagnostic/navigation owner under ADR 0001. Neither the field inventory nor a supported UI control alone proves runtime application; live probes and saved/readback evidence are recorded separately.
