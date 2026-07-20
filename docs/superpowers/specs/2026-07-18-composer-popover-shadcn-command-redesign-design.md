# Composer popover shadcn Command redesign

## Goal

Replace the current visually noisy Agent, Permission, and Model popover cards with a unified Obsidian-native implementation of shadcn's `Popover + Command` anatomy.

## References and extraction

- **shadcn/ui Command:** quiet popover surface; a search input separated from results; 4px list inset; rounded compact command items; muted group headings; neutral selected surface; shortcuts as subordinate metadata.
- **cmdk:** search-first Model interaction, group hierarchy, current-item highlight, and keyboard-first density.
- **Obsidian:** host theme variables, interface typography, compact desktop density, and a local `.opencodian-container` positioning boundary.

This is a pattern-library adaptation, not a React/Tailwind/Radix migration. No new runtime dependency, web font, external asset, or copied branded asset is allowed.

## Visual contract

1. Use one shared surface: `background-primary`, one `background-modifier-border`, 10px radius, and a restrained host shadow.
2. Remove glass, gradients, imported `DM Sans`, colored left rails, outlined selected rows, and large red/green selected surfaces.
3. Default, hover, highlighted, and selected items follow the Command hierarchy: transparent at rest; one quiet hover/selected surface; visible keyboard focus; selection from a checkmark plus label weight.
4. Agent and Permission rows support descriptions without becoming cards inside a card. Model rows stay compact; its provider headings remain sticky but visually quiet.
5. Model search becomes a CommandInput strip: no inner rounded field, only a search icon, input, and one bottom separator.
6. Permission danger/safe state appears through icon/check/compact label color only. It must remain readable in light and dark themes without flooding a row.
7. Existing independent trigger styles, individual card widths, keyboard behavior, scope Escape behavior, ARIA wiring, 280px model viewport, sticky provider headings, and 8px narrow-pane inset remain intact.

## Component anatomy

```
Popover frame
├── header: title + muted Esc keycap
├── content
│   ├── Model only: CommandInput strip
│   └── CommandList
│       ├── CommandGroup heading / Agent section label
│       └── CommandItem rows
└── footer: low-priority keyboard metadata
```

## Acceptance criteria

- All three cards visibly read as one system in both themes, while their content and widths remain specific to Agent, Permission, and Model.
- No card shows a colored side rail, a selected-row outline, or a secondary input-card surface.
- Permission still distinguishes dangerous and safe modes via scoped semantic color.
- The model list remains exactly 280px tall and uses a sticky group heading.
- Existing focused tests plus a visual style contract and Test Vault screenshots demonstrate behavior and visual parity.
