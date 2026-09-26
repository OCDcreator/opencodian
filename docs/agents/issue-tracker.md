# Issue tracker: Local Markdown

Issues and specs for this repo live as Markdown files under `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md` when a spec exists.
- Implementation tickets are one file per ticket at
  `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` in
  dependency order.
- `.scratch/` is a project-local symlink whose target is outside the synced
  repository tree. Do not replace it with an in-repository directory.
- Ticket state is recorded in the `Status:` line near the top of each ticket.
- Comments and execution evidence append to the bottom under `## Evidence` or
  `## Comments`.

## Publishing tickets

When a skill says to publish to the issue tracker, create the feature
directory and one Markdown file per ticket. Never combine multiple tickets
into one issue file.

## Frontier and claiming

- A ticket is ready when every ticket named in `Blocked by:` has reached a
  terminal success state.
- Before work, change the selected ticket's `Status:` to `in-progress`.
- After implementation and verification, change it to `done` and append the
  commands and evidence under `## Evidence`.
