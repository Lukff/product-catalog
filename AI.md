# AI-Assisted Workflow

A narrative log of how this project was built with AI assistance: tooling used,
prompts and interaction traces, and reflections on what worked or needed course
correction. Entries are added at each significant step via the `ai-log` skill
(`.claude/skills/ai-log/SKILL.md`), newest last.

## Log

## 2026-09-19 — Project setup & technical decisions

**Context:** Greenfield repository. The assignment arrived as a PDF and needed to
become a working brief before any technical decisions could be made against it.

**Tooling & prompts:** Gemini for the initial PDF text extraction; Claude Code for
the technical-decisions session. For that session I asked the model to question me
at each step rather than hand me a stack.

**What happened:** I extracted the assignment text from the PDF into markdown and
formatted it as a general project brief, then structured definitions and tasks
against that document. In the technical-decisions session, the model suggested
Drizzle ORM, which I hadn't used before.

**Reflection:** Taking the brief as the baseline and having the model interrogate me
one decision at a time worked well. On Drizzle, I reviewed the docs and the repo
before accepting rather than taking the suggestion at face value — and concluded it
is aligned with the purpose here.

## 2026-09-19 — Defining the ai-log skill and wiring it into the workflow

**Context:** `AI.md` is a required deliverable but existed only as three loose
bullets with no structure, and the `CLAUDE.md` agreement to "update AI.md as work
proceeds" had nothing behind it. `docs/backlog.md` is still empty, so this serves
the deliverable in `docs/project-brief.md` rather than a backlog item.

**Tooling & prompts:** Claude Code on Opus 5, via the superpowers `brainstorming`
and `writing-skills` skills. The two decisions that shaped the result were put to
me as a multiple-choice prompt: how the logging should be triggered, and how
entries should accumulate.

**What happened:** I asked for a skill that makes AI.md logging part of the repo's
workflow — prompting me at each significant step, always requiring my input, and
formatting it per the brief while complementing it from session and project
context. Offered three trigger mechanisms, I chose a `CLAUDE.md` working agreement
plus manual invocation over a Stop hook: the purpose is only to keep a general
record, not to be super strict, so the hook is not required in this situation.
Settled on chronological entries, migrating the three existing bullets into the
new format, and a draft-confirmation step before anything is written. The
`writing-skills` skill's subagent pressure-testing loop was skipped and flagged
to me as a judgement call.

**Reflection:** The choice was useful. On the testing loop — I needed a simple
skill to help me, so skipping it was the right call.

## 2026-09-19 — Defining the backlog

**Context:** `docs/technical-decisions.md` was agreed and `docs/backlog.md` was
still an empty stub, so no work item existed to start implementation against. Two
items in that document's "Open decisions" section — category modelling and the
unprompted custom feature — were still unresolved and gate real code.

**Tooling & prompts:** Claude Code on Opus 5, via the superpowers `brainstorming`
skill. The model classified the task as bounded and put the two shaping choices to
me as multiple-choice prompts: how to handle the unresolved open decisions, and how
to slice and order the items.

**What happened:** I asked to define the backlog items. For the open decisions I
chose explicit blocked placeholders over resolving them first, so the backlog would
exist without pre-empting decisions `CLAUDE.md` says must be agreed separately.
On slicing I took the walking-skeleton ordering as proposed but corrected it:
backend and frontend became separate items rather than one item per slice. I wanted
to break the tasks first because it makes it easier for working later in specific
sessions. The result is 24 items in six phases plus `D-1` and `D-2` recorded as
gating decisions rather than work items.

## 2026-09-19 — Monorepo scaffold, pnpm and dependency audit

**Context:** `docs/technical-decisions.md` and the phased backlog were agreed, but no
code existed. This serves backlog item B-01 (monorepo scaffold) and pulls in the
CI item B-22, whose dependency on B-01 was now met.

**Tooling & prompts:** Claude Code on Sonnet 5 at medium effort, with the prompt
"let's start the scaffolding, take the task from the backlog". The model read
`docs/backlog.md` and `docs/technical-decisions.md` first, then wrote the scaffold
directly rather than brainstorming, since the contracts were already fixed in the
documents.

**What happened:** I did the general scaffolding for the project and added a pnpm
audit as a check. The model began installing with npm; I rejected that call and had
pnpm put in as a decision first, so the docs were updated before the code. I chose
pnpm because I have previous experience with it and find the package resolution to
be better. The audit is for adding a layer of security on the packages: the
pre-commit hook is for convenience, and CI is the real barrier. Along the way,
TypeScript 7 broke `typescript-eslint` (lint crashed), so the model pinned
TypeScript to 6.0.x and recorded the pin in the technical-decisions document.

## 2026-09-19 — Shared contract package (B-02)

**Context:** Scaffold (B-01) was done and `packages/shared` was an empty stub. This
serves backlog item B-02: the product Zod schemas, list-query schema and response
envelope types that the API and web app will both import.

**Tooling & prompts:** Claude Code on Sonnet 5, prompted with "lets work on the next
item". The model read the backlog, classified the task as architectural, and used
the superpowers `brainstorming` skill, then `test-driven-development` for the build.
It put three shaping choices to me as multiple-choice prompts: reject or clamp
`pageSize` above 100, reject or round a price with more than 2 decimals, and how
strict the `category` slug format should be.

**What happened:** I chose to reject `pageSize` above 100 with a 400 instead of
clamping it, because it is better to have explicit errors; that changed the
"capped at 100" wording in §3.1 of `docs/technical-decisions.md`. I also chose to
reject prices with more than 2 decimals rather than round them, and a lowercase slug
regex for `category`. I skipped the separate spec file: I'll use it only for more
involved work and as a temporary place, eventually everything must go into the other
docs, so the decisions went straight into §3.1 and §4. The model wrote the tests
first (29 failing for the right reason), then the implementation (53 passing).
Partway through I introduced the rule of one branch per feature with a PR at the end,
to start testing the CI (B-22, whose workflow was written but not yet run on GitHub).

## 2026-09-19 — API skeleton and category modelling (B-03)

**Context:** B-01 and B-02 were merged and `apps/api` was an empty stub. This serves
backlog item B-03 (API skeleton) and pulled in open decision D-1 (category
modelling), because the Drizzle `products` table needs a category column whose form
D-1 decides.

**Tooling & prompts:** Claude Code on Sonnet 5, prompted with "PRs merged; start
B-03". The model classified it as architectural and used the superpowers
`brainstorming` skill, then `test-driven-development`. It put D-1 to me as
multiple-choice prompts: first whether to resolve it now or keep a plain text
column, then which of four category models.

**What happened:** I chose to resolve D-1 now instead of deferring it. Of the
models, I picked a categories table with a surrogate integer id as the foreign key,
over the model's recommendation of using the slug as the key, for easier
extensibility/more flexibility later. The model then built the skeleton test-first
(88 tests): a `createApp({ db })` factory, one error middleware, a Drizzle schema
with its migration, and ESLint rules that enforce the routes → services →
repositories layering. Two things changed the approved design mid-build.
`better-sqlite3` 13 would not install because it compiles from source and this
machine has no Visual Studio C++ toolchain; the model pinned it to 12.x, which ships
prebuilt binaries, and I kept the pin because of the limited scope over changing
machine configurations. Separately, the pre-commit `pnpm audit` blocked the first
commits over an `esbuild` advisory reached through `drizzle-kit`, and the model
fixed it with a scoped pnpm override instead of bypassing the hook.
