# DSH Configuration Types

Source: `src/core/types/dshConfiguration.ts`
Owner: `core.types`

## Responsibility

Defines the non-secret, JSON-shaped DSH native configuration envelope and its typed namespace map without importing backend implementation or runtime dependencies. `settings.ts` imports the envelope type from this sibling module. `core/agents/backend/configuration/DshNativeConfiguration.ts` implements validation, metadata, revision and patch functions, and re-exports these types for launch/UI consumers.

## Data model

`DshNativeConfiguration` contains `version: 1` and `overrides: Partial<DshNativeConfigurationNamespaceMap>`. Omitting a namespace or field means inherit native configuration; an empty overrides object changes nothing. `DshJsonValue` and `DshJsonObject` constrain serialized output. No row IDs, loader plugin names, enablement flags, code, or arbitrary patch operations are part of the user configuration model.

The typed map covers all 20 audited namespaces. `DshDeepSeekConfiguration` includes the exact base API-key adapter fields, model declarations, retry policy and advanced request-image/file/listing limits. `DshPiProvider` describes dynamic route keys, model entries/overrides, public compatibility switches, reasoning effort wire maps, cache/transport/request budgets and credential references. The type surface mirrors the installed public `@deepseek-ai/dsh@0.2.2-rc.1` package, not private profiles or the broader pi-ai implementation's withheld switches.

`DshRetryPolicy` is a discriminated union for normal versus always retry. `DshCompactionPolicy` is shared by top-level defaults and exact model policies; runtime validation enforces retention alternatives and paired summary targets. Permission preset definitions require sandbox and approval choices. The four audited rows without configurable fields (`fs-observation-policy`, `timeout-policy`, `llm-retry`, `image-offload`) use `Record<string, never>` rather than invented toggle fields.

`apiKeyEnv` denotes an upstream credential-reference name. Pi-ai `headers` may contain only harmless non-secret header values. `headerCredentialRefs` is a clearly documented plugin-owned extension mapping header names to credential references; native entry generation omits it, and runtime consumers resolve it outside vault persistence. Native secret values never belong in this envelope.

## UI metadata types

`DshNativeConfigurationFieldDescriptor` identifies namespace and dotted path, with `*` for map keys and `[]` for array members. Field types include primitive, enum, structured map/array/object, and genuine public-schema unions. Optional properties describe ranges, units, required nested members, sensitive references, capacity fallback versus request-limit semantics, and upstream versus plugin provenance. Label text is represented only by an optional translation key.

`DshNativeConfigurationGroupDescriptor` supplies canonical entry identity, fields, and `configuration: 'fields' | 'none'`. A no-config group is inventory evidence and does not imply a mutable control. Neither metadata nor type declarations claim runtime application, model capacity enlargement, or transport support.

## Validation

The focused boundary suite is `tests/unit/core/agents/backend/configuration/DshNativeConfiguration.test.ts`. Persistence behavior is covered by `tests/unit/core/types/dshBackendSettings.test.ts`. Persisted invalid configuration is retained by the settings normalizer so the boundary validator/UI can explain it; type assertions at the persistence seam are not validation.
