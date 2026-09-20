# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

A full-stack product catalog: a Svelte 5 SPA on top of a Hono + SQLite JSON API. Greenfield as of 2026-09-19 — implementation has not started.

## Documentation map

Read these before proposing or writing code. They are the source of truth; this file only points at them.

| File | Role |
|---|---|
| `docs/project-brief.md` | The requirements. What must be built and delivered. Do not edit — it is the assignment. |
| `docs/technical-decisions.md` | The agreed technical reference: stack, repo layout, API contract, data model, SPA design, testing and CI, open decisions, conventions. |
| `docs/backlog.md` | Work items and their status. |
| `README.md` | How to run the app locally, plus architecture notes, data-model notes and open questions. Required deliverable. |
| `AI.md` | Narrative log of the AI-assisted workflow: tooling, prompts, interaction traces, what worked and what needed course correction. Required deliverable. |

## Working agreements

- `docs/technical-decisions.md` is binding. If a decision there is wrong or blocks you, say so and get agreement before diverging — then update the document in the same change.
- Two items in that document's "Open decisions" section are unresolved (category modelling, the custom feature). Do not implement the code they affect until they are decided.
- Update `AI.md` as work proceeds, not reconstructed at the end. Use the `ai-log` skill
  (`.claude/skills/ai-log/SKILL.md`) for every entry. After each significant step —
  a vertical slice or feature completed, a technical decision made or reversed, a
  course correction, a notable prompting technique, an open decision resolved —
  stop and ask the user for the entry before moving on. Not for routine edits, test
  reruns, formatting commits or dependency bumps. The user may also invoke the skill
  directly at any time. Never write an `AI.md` entry without the user's own input.
- Keep `README.md` current when setup steps or architecture change.
- Anything left incomplete goes in `README.md` as a documented next step.

## Conventions

Full list in `docs/technical-decisions.md` section 8. The essentials:

- TypeScript end-to-end. Shared Zod schemas live in `packages/shared` — never duplicate the product contract in `apps/api` or `apps/web`.
- API layering: `routes -> services -> repositories`. Routes never touch Drizzle; repositories never throw HTTP errors.
- Tests are Vitest; API integration tests run against the real Hono app via `app.request()` with a throwaway SQLite file.
- Commit messages: a single line, Conventional Commits prefix (`feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`). No body, no footers, and never a `Co-Authored-By` trailer.
