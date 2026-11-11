# SettingsDshMcpServerControls

Source: `src/features/settings/backends/dsh/SettingsDshMcpServerControls.ts`

## Responsibility

Shared MCP server form controls used by `SettingsDshMcpWorkspace`. The workspace owns declarations, validation, persistence, draft selection and recovery; this module renders masked key/value rows (used by stdio environment and HTTP headers), advanced server options, and evidence-only runtime status. It does not save or start a process on its own.

## Contract

- `renderDshMcpPairRows`: edits a local row copy, emits on changes, masks values, provides localized add/remove controls.
- `renderDshMcpAdvanced`: stdio cwd, tool timeout, startup failure behavior, instruction bytes and reconnect limits are Native-only overrides. Its fourth argument reads the current transport. Under ACP the fields remain visible with their saved Native values but are disabled; callbacks also reject writes after switching to ACP, including events dispatched to stale controls. No values are reset or removed merely because transport changes. Native numeric/default reset still changes only the existing workspace draft.
- The ACP explanation states the audited `@deepseek-ai/dsh-acp@0.2.2-rc.1` boundary: `resolveMcpConfigs` uses the session cwd for stdio, fixes `failOnStartupError: true` for both stdio and HTTP, and does not read per-server timeout, instruction-budget or reconnect overrides. Inheritance labels explicitly describe Native defaults, not ACP runtime behavior. Basic stdio command/args/env and HTTP URL/headers controls are unaffected.
- Native startup-failure inheritance follows OpenCodian's actual bridge contract (`mcpClientConfig`: `server.failOnStartupError ?? true`), so the absent override displays **Inherit Native (Enabled)**. An explicit false remains Disabled and is passed through unchanged; ACP continues to force true. The focused regression invokes the real pure bridge function for stdio and HTTP instead of assuming a native schema default.
- `renderDshMcpStatus`: optional Native-only method readback; mounted does not mean connected. Uses the owner's current-render guard to discard late results. Method absence is explained and disabled.
- `DshMcpPairRow` re-export from workspace preserves existing section import compatibility.

## Verification

`tests/unit/features/settings/backends/dsh/SettingsDshMcpAdvanced.test.ts` verifies draft/persist boundaries, inheritance, invalid limits, rollback, honest unknown connection state and unsupported transport. ACP cases exercise real workspace callbacks for disabled stdio/HTTP advanced controls, stale/dispatched-event guards, basic-field edits, Native→ACP→Native value retention (saved and unsaved), raw JSON persistence, save/apply evidence and English/Chinese explanations. Existing `SettingsDshRecovery` cases protect masked values and recovery behavior.

## Boundaries

Native DOM and Obsidian Setting only, scoped existing DSH disclosures. No independent state store, secret archive, arbitrary command execution or direct backend import. This is a reused form owner, not a thin one-call wrapper.
