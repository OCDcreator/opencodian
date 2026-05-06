# Product

## Register

product

## Users

OpenCodian serves Obsidian users who want OpenCode inside their writing and coding vault instead of in a separate terminal-only workflow. The primary users are technical note takers, plugin developers, local-first AI users, and maintainers who work across macOS and Windows synced folders. They often have multiple conversations, providers, permissions, background tasks, and vault context active at once, so the interface must stay calm while exposing real state.

These users are not browsing a marketing site. They are in a repeated work surface: reading notes, selecting files, asking an agent to modify or explain code, checking model/provider readiness, and deciding when a tool action should run.

## Product Purpose

OpenCodian embeds OpenCode into the Obsidian sidebar as a local-first AI coding workbench. It connects Obsidian, OpenCode SDK v2, legacy HTTP/SSE fallback paths, model/provider configuration, permission modes, vault context, session tabs, background task signals, and persistent conversation storage.

Success means a user can keep their AI coding loop close to their vault without losing trust in what is running, which model is active, which directory or context is scoped, which permissions apply, and whether background work is still alive. The product should make complex runtime state legible without turning every state into a loud dashboard.

## Brand Personality

Calm, capable, transparent.

The voice should feel like a precise workbench inside Obsidian: quiet by default, explicit when risk or status matters, and dense enough for repeated expert use. It should feel native to Obsidian while carrying enough OpenCode identity to make agent, model, and tool activity understandable.

## Anti-references

OpenCodian should not look like a generic SaaS landing page, a card-heavy admin dashboard, a neon terminal skin, or a decorative glass demo that hides workflow state. Avoid oversized hero composition, marketing gradients, identical icon-card grids, and modals as the first answer to every interaction.

It should also avoid collapsing concurrent session or background-task behavior into a single global stream metaphor. The product is valuable because it can represent multiple active threads, per-tab state, project-scoped configuration, and permission boundaries without pretending the system is simpler than it is.

## Design Principles

1. Obsidian-native first: inherit Obsidian theme variables and interaction expectations before inventing a separate visual universe.
2. Dense, not crowded: prefer compact controls, sticky context, and clear grouping over large empty panels or decorative cards.
3. State earns visibility: model availability, permission mode, streaming progress, questions, background tasks, and server health should be visible at the level where they affect user decisions.
4. Local-first trust: show directory scope, provider readiness, and permission implications clearly enough that users know what will touch their vault or machine.
5. Maintainable surfaces: visual changes should reinforce existing owners and avoid adding broad view-local runtime ownership.

## Accessibility & Inclusion

Target WCAG AA contrast through Obsidian theme variables and preserve compatibility with light and dark themes. Keyboard navigation, focus-visible states, reduced-motion sensitivity, readable truncation, text selection, and bilingual UI copy are product requirements, not polish extras.

Motion should be brief and purposeful. Background images, glass, blur, and experimental visual demos must remain opt-in or restrained enough that chat content, tool output, and permission decisions stay readable.
