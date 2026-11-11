# DshNativeConfiguration

Source: `src/core/agents/backend/configuration/DshNativeConfiguration.ts`
Owner: `core.backend`

## Responsibility

Validates the non-secret, versioned DSH override envelope before save or launch, exposes public field/group metadata, computes a deterministic SHA-256 intent revision, and creates declarative native config rows. It has no filesystem, profile discovery, environment, credential-store, process, or UI access. Shared DTOs live in `core/types/dshConfiguration.ts` and are re-exported here for consumers.

## Public contract

- `normalizeDshNativeConfiguration(value)` and `validateDshNativeConfiguration(value)` return a detached JSON copy. Both reject invalid supplied values; neither prunes unknown fields, coerces strings to numbers, or substitutes successful-looking defaults. `undefined` alone becomes `{ version: 1, overrides: {} }`.
- `dshNativeConfigurationRevision(value)` hashes validated intent with deterministic object-key ordering. Array order remains significant. The revision does not assert runtime application or model capability.
- `buildDshNativeConfigurationEntries(value)` returns only allowlisted `{ id, config }` partial rows, sorted by canonical row ID. Empty namespace objects produce no row. The caller must merge inherited configuration before producing native whole-row patches.
- `buildDshNativeConfigurationPatch(value)` serializes those rows as a JSON array followed by a newline. JSON is declarative YAML; keys and strings are quoted and cannot become executable loader tags.
- `DSH_NATIVE_CONFIGURATION_GROUPS` and `DSH_NATIVE_CONFIGURATION_FIELDS` expose immutable descriptors for scalar, array, map, object, and union fields, including nested provider/model/compat paths. They describe enums, numeric ranges, units, required nested members, capacity fallbacks, credential references, and plugin-owned extensions. Labels, if added, must be translation keys.

## Reviewed public schema

The source version is `@deepseek-ai/dsh@0.2.2-rc.1`. Evidence comes from the installed public package's `node_modules/@deepseek-ai/*/lib/types/*.d.ts`, runtime `Config` schemas and corresponding resolver validation in `lib/index.js`, and canonical row IDs in `dsh-base/cordis.patch.yml`. The audit is `.impeccable/review/dsh-configuration-gap-20261109/{fields,sources,reviewed-findings}.md`. No private profile, environment values, or credentials are used to construct the registry.

The namespace allowlist covers `agent-default-model`, `llm-deepseek` (the base row mounts `dsh-llm-deepseek-api-key`), `llm-pi-ai`, `permission`, `sandbox-policy`, `approval`, `compaction-basic`, `skill-filesystem`, `tool-web`, `web`, `tool-fs`, `fs-observation-policy`, `subagent`, `tool-todo`, `tool-jobs`, `jobs`, `shell-env`, `timeout-policy`, `llm-retry`, and `image-offload`.

`fs-observation-policy`, `timeout-policy`, and `image-offload` have no public Config fields; `llm-retry` exposes an empty Config. Their descriptors use `configuration: 'none'`, and only empty objects are accepted. Retry policy lives under concrete provider configuration, and image budgets live under DeepSeek/pi-ai routes. No enable/disable or arbitrary patch editor is fabricated for those rows.

DeepSeek fields include model declarations, API credential reference, listing/stream timeouts, request-file and inline-image limits, offload quanta, file expiry/refresh/cleanup, and provider retry policy. Pi-ai includes named provider routes, models and model overrides, all compat fields actually offered by the public gate, reasoning efforts, template parameters, thinking budgets, cache/transport choices, request timeouts, and image budgets. Catalog-only internal compat fields are rejected. `defaultContextWindow`, `defaultMaxTokens`, and `defaultInput` are capability fallbacks, not proof that an endpoint supports larger contexts, outputs, or images.

## Security and inheritance

Only own enumerable JSON data is accepted. Cycles, sparse arrays, accessors, non-plain objects, prototype keys, symbols, functions, bigint, non-finite numbers, executable YAML tag text, raw secret-shaped values, and unknown keys fail closed. Diagnostics contain schema paths and corrective guidance, never supplied values or arbitrary provider/model map keys. Depth is bounded to avoid pathological nesting.

The boundary keeps descriptor inspection separate from recursive cloning, dispatches schema validation to type-specific helpers, and checks DeepSeek relationships independently from the remaining namespaces. These helpers remain in this module so the security and schema rules have one owner. Descriptor publication and native-row generation explicitly filter internal-only fields without changing persisted intent or exposing credential-reference metadata as upstream configuration.

`apiKeyEnv` is an upstream credential reference. Harmless non-auth headers are supported; raw authentication/cookie/secret headers are rejected. `providers.*.headerCredentialRefs` is explicitly **OpenCodian-owned**, not an upstream DSH field. Its header-name to credential-reference map remains in the validated envelope and revision but is omitted from native row output. The launcher/runtime must resolve it outside vault persistence and reject unavailable references; ignoring it does not count as application. Both header maps reject case-insensitive collisions. URLs cannot embed credentials; DeepSeek's root endpoint also forbids query/fragment per its resolver, while pi-ai permits non-secret endpoint query options.

Validation checks supplied cross-field constraints: compaction retention alternatives and ratios, paired summary provider/model, duplicate target policies, retry alternatives/backoff, provider model/override conflicts, offered compat versus explicit protocol, reasoning maps, duplicate model IDs, image-budget pairs, and preset structure/reserved names. Because the envelope is a sparse overlay, final constraints depending on an inherited native value or installed model catalog require validation after native composition. For example, an unmentioned route API or a default preset inherited from a private profile cannot be inferred here. Array replacement and native map composition remain the launcher's responsibility; the original DSH patch loader replaces whole row configs.

Loader identities, plugin names, native bridge rows, auxiliary security rows, row enablement, and executable patch content are not editable through this boundary. Native/ACP runtime support and effective readback belong to their consumers.

## Focused validation

`tests/unit/core/agents/backend/configuration/DshNativeConfiguration.test.ts` exercises all audited groups, detached roundtrips, exact metadata semantics, numeric boundaries, mutually exclusive options, nested provider/model/compat policies, stable revisions, header references, unknown fields, secret-safe diagnostics, prototype/accessor/non-JSON rejection, and declarative patch structure. `tests/unit/core/types/dshBackendSettings.test.ts` verifies load-time preservation of valid and invalid persisted intent.
