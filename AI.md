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

## 2026-09-19 — Seed data (B-04), plus .env loading and LF line endings

**Context:** PR #3 (B-03, the API skeleton) was open with CI green. Three follow-ups
were outstanding: two the model had raised when the PR opened (loading a `.env` file,
and Windows CRLF line endings failing `pnpm lint`) and the seed data (B-04), which
depended on B-03's schema and the D-1 category decision.

**Tooling & prompts:** Claude Code on Sonnet 5. I asked for the two follow-ups with
"fix the 2 first points in this same PR" and for the seed with "add the seed here
too". For the seed the model presented a design in chat first (no spec file) and
built it test-first once I approved it with "yes, go ahead".

**What happened:** I added all three to the same PR for simplicity. The model added
a `.gitattributes` that forces LF endings, and a `.env` loader using Node's built-in
`process.loadEnvFile()` instead of a new `dotenv` dependency, which raised the Node
floor to 20.12. The seed is 36 products in the brief's payload shape, validated
against the shared schema, inserted with `ON CONFLICT DO NOTHING` so re-running
never overwrites edits. Along the way the model's first `.gitattributes` commit
had also swept in a staged file rename; it re-split the unpushed history so each
commit holds only its own change.

## 2026-09-19 — Web scaffold (B-05)

**Context:** B-01 to B-04 were done and merged (the API had its skeleton and seed data).
B-05, the web app scaffold, depends only on B-02 (the shared contract package), so
nothing was left blocking it.

**Tooling & prompts:** Claude Code on Sonnet 5. The prompt was a single line,
"do the web scaffold b-05", with no design step first. Afterwards I asked it to run
the app locally ("run it locally for me to check how it's starting") and then to stop
the servers.

**What happened:** This is a step on the web app with no more dependencies blocking
it, started independently. The model read the B-05 item in `docs/backlog.md` and the
web sections of `docs/technical-decisions.md`, worked in its own worktree on
`feat/b-05-web-scaffold`, and built the Vite + Svelte 5 + Tailwind app in `apps/web`,
the `/api` dev proxy to `:3000`, and `lib/api.ts`, a typed fetch client that unwraps
`data` and rejects with a typed `ApiError`, with 9 unit tests. ESLint and Prettier
were extended to `.svelte` files. `svelte-check` could not resolve `.svelte` imports
until `allowJs` was set in the web `tsconfig.json`, which is now documented in
`docs/technical-decisions.md`. Draft PR #4 was opened.

## 2026-09-19 — API documentation with Swagger (B-25)

**Context:** B-01 to B-04 were merged, so the API had a skeleton, schema and seed but
no routes yet (those start at B-06). A separate session was building the web scaffold
(B-05) in its own git worktree. Swagger was not on the backlog, so it was added as
B-25.

**Tooling & prompts:** Claude Code on Sonnet 5, prompted with "I got other session
working on b-05. let's add a swagger to the api here". The model classified it as
architectural and used the superpowers `brainstorming` skill, putting one
multiple-choice prompt to me on how to produce the docs (three options). It built the
feature test-first with `test-driven-development`, then checked the result in a real
browser with Playwright.

**What happened:** I chose the contract-first approach: it is good for delineating
what is already planned. The model built an OpenAPI 3.1 document for all seven
operations in `docs/technical-decisions.md` §3.2, generated from the shared Zod
schemas and served as Swagger UI at `/api/docs` and as JSON at `/api/openapi.json`.
Operations without a route are flagged "Not implemented yet" automatically, and a
test fails if the app ever registers a route the document does not describe. The
browser check found two problems the tests had not: the 409 and 500 examples showed a
validation error, and the 201 example showed a random string for the category. The
model fixed both with explicit examples, writing the failing tests first. It also
caught a typecheck failure that its own grep-based check had missed.

## 2026-09-19 — Backlog consolidation into vertical slices

**Context:** B-01 to B-05 (the scaffolding steps) were done and merged. The remaining
backlog from B-06 onward paired every feature into an API item and a Web item, 25 items in
all. This step restructures `docs/backlog.md` and serves no single backlog item.

**Tooling & prompts:** Claude Code on Sonnet 5. The prompt was "i think the next tasks on
the backlog are too fine broken, I want to merge some items", with no target given. After
the model's proposal I answered "Yes, that granularity works, renumber them".

**What happened:** I opted to merge some items to speed a bit the development. The model
read the backlog and proposed collapsing each API+Web pair into one vertical slice, seven
items in place of sixteen, and asked me two questions: whether the granularity was right,
and whether to renumber or keep the old IDs. I approved the granularity and chose
renumbering. It worked in its own worktree and rewrote `docs/backlog.md` (25 items down to
16), keeping every acceptance criterion under "API:" and "Web:" headings and adding an
old-to-new mapping table, because `AI.md` and earlier PRs use the old IDs. Its first
message said Phase 5 IDs would be unchanged, which contradicted sequential renumbering. It
corrected that in its summary. Committed as `1330db7` on
`worktree-docs-merge-backlog-slices` and pushed, no PR opened.

**Reflection:** I think it worked for the scaffolding steps but we can work in bigger
blocks now.

## 2026-09-20 — List products, API and web together (B-06)

**Context:** B-01 to B-05 and the Swagger docs were merged, so the API had a skeleton, seed
data and an OpenAPI document but no routes, and the web app had a scaffold and a typed
fetch client but no screens. B-06, the first vertical slice after the backlog
consolidation, depends only on those, so it was next.

**Tooling & prompts:** Claude Code on Sonnet 5. The prompt was "checkout main and let's work
on the next task". The model used the superpowers `brainstorming` skill (classifying it as
architectural, with two multiple-choice questions), then `writing-plans`, and I approved each
with "go ahead" and "go with approach 1". Execution used `subagent-driven-development`: a
fresh subagent per task, with a separate reviewer after each and an Opus review of the whole
branch at the end.

**What happened:** This was the first task advancing with the back and front together. The
model picked B-06 from the backlog, and the two questions I answered were how much of the
list query to build now (pagination only, leaving search, sort and category to B-08) and
where the stock-status threshold lives (a shared constant of 5, so API and web agree). I
approved skipping a separate spec file and folding the design into
`docs/technical-decisions.md`. The plan had six tasks: the shared stock helper, `GET
/api/products`, Vitest projects, the catalog store, the table and dashboard, then a check in
the running app and the docs. The reviews caught a line in the plan's own code that failed
Prettier, and the implementer had to add a lint parser rule for `*.svelte.ts` files. The
final review found an untracked `.vitest/` directory that broke `pnpm lint`, now ignored.
The auto-mode classifier denied one reviewer dispatch as "data exfiltration"; it went
through once narrowed to the docs-only diff.

## 2026-09-20 — Dropping the per-item PRs and lightening the process

**Context:** B-06 had just been merged as PR #8, after being run through a branch, a
brainstorming step, a written plan, subagents and a PR. The rest of the backlog (B-07 to
B-12) was still ahead, and this step changes how those items are delivered. It serves no
single backlog item.

**Tooling & prompts:** Claude Code on Sonnet 5. The prompt was "project decision for the next
items: stop opening PRs for each. This decision is for timing purposes". The model asked how
each item should then reach `main` (three options) and I answered "first option".

**What happened:** Each item still gets its own branch. When it is done and its checks pass,
the branch is merged into `main` locally with `--no-ff`, keeping the history grouped per
item, and `main` is pushed. No PR is opened per item. The model recorded the rule in its
memory for this repo.

**Reflection:** All the scaffolding for the workflow and the PRs were a good approach for
structuring, but it ended up costing too much time, so we are going more directly to
implementation now for practical reasons.

## 2026-09-20 — Search, sort, filter and pagination (B-08)

**Context:** B-06 was merged, so the list endpoint and dashboard existed with pagination
only. B-08 depends only on B-06 and adds the rest of the list query, `q`, `category` and
`sort` on the API and the controls on the web side. It was the first item run under the
lighter workflow from the previous entry.

**Tooling & prompts:** Claude Code on Sonnet 5. The prompt was "let's do B-08 next". There was
no brainstorming step, plan document or subagents: the model made a branch, wrote the
tests first, then the code, and checked the result in a real browser with Playwright.

**What happened:** The model did the API first: `q` over title and description with `%` and
`_` matched literally, the category filter, and whitelisted sorts with ties broken by id so
pages stay stable, with tests that compute the expected results from the seed instead of
hard-coding them. The web side added a debounced search box, sort and page-size selects, a
numbered pager and URL mirroring with Back support. In the browser check the URL params,
Back button, last-page pager and no-results state all worked. Along the way one scripted
edit misplaced a constant in the repository and mangled a backslash escape, and the
typecheck caught `toSorted` missing from the ES2022 lib, so the model fixed both before
committing. The category select is disabled until B-11, as the backlog says.

**Reflection:** It worked faster without the additional PR.

## 2026-09-20 — Product detail and create product, planned by Claude and built by Gemini (B-07)

**Context:** B-07 (the merger of the former detail and create items, `docs/backlog.md`) was the first write path: `GET /api/products/:id`, `POST /api/products`, and a dashboard modal that shows a product's full record and hosts the create form. It depended on B-06 and B-08, both done.

**Tooling & prompts:** Claude (Sonnet 5) wrote the plan with the `superpowers:writing-plans` skill, then reviewed the result and ran the browser check with Playwright. Gemini 3.8 Flash implemented the plan. The plan is `docs/superpowers/plans/2026-09-20-b-07-product-detail-and-create.md`: seven tasks, test-first, each with exact files, interfaces and code, plus a list of global constraints for the implementer to follow.

**What happened:** The work was split to save tokens: Claude did the planning and the verification, Gemini did the implementation. The plan went to Gemini on `feat/b-07-product-detail-and-create`, which produced seven commits. Claude's review found typecheck, lint and 252 tests green and the code matching the plan, plus three stray path comments copied from the plan's code blocks. The browser check passed all eight steps. The one wart was "Bad Gateway" shown when the API is down, which comes from the Vite proxy answering 502 (an earlier B-05 behaviour), not from B-07.

**Reflection:** It worked pretty well here.

## 2026-09-20 — README (B-14)

**Context:** B-14 was the last documentation item still open. Only the API skeleton, seed data, Swagger docs and web scaffold existed on the branch I started from, with the product routes and the custom feature (D-2) still open. It serves the brief's README deliverable and the backlog's B-14.

**Tooling & prompts:** Claude Code on Sonnet 5, in a background session. The prompt was just "work on the readme task", with no further detail. Claude found B-14 in `docs/backlog.md`, worked in a separate git worktree (branch `docs/b-14-readme`), and wrote from `docs/technical-decisions.md` and the repo's actual scripts and config.

**What happened:** I asked for the README early, on purpose, and then waited for the changes to land so it would be more complete. Claude's first pass (commit `40dbd64`) described what existed then, said plainly that the product routes and UI were not built, and left the custom-feature section as a placeholder waiting on D-2. Once main had B-06, B-07, B-08 and B-10, I asked Claude to look at what changed in main and update the README. It merged main in and reworked the status, architecture, assumptions, testing and next-steps sections (commit `2a1fc31`). The README now describes a working catalog, with B-11 (categories) and B-12 (custom feature) still open, so B-14 stays In progress.

## 2026-09-20 — Category management (B-11)

**Context:** B-11 (categories) was already in `docs/backlog.md`, unblocked by D-1 (a `categories` table with `products.category_id` as a foreign key). It depended on B-03 and B-08, both done, and it was the last feature slice before the custom feature (B-12).

**Tooling & prompts:** Claude Code on Sonnet 5, starting from "let's advance with b-11", then a scope change in the same message. It used the `superpowers:brainstorming` skill, which classified the change as bounded and produced a short design in chat that I approved before any code. Implementation was test-first (Vitest), then a Playwright check of the running app, and a merge to `main` with a push.

**What happened:** I added a simple category management feature so that it completes the main functionality. As it was already in the backlog, I just reviewed it and made an edit to bring the feature to the UI also. Claude proposed `DELETE /api/categories/:slug` (blocked with a `409` while any product uses the category), a "Manage categories" dialog on the toolbar, and a toolbar select filled from the API, and left the product form's category as free text. I approved that design. Later I asked how the "New product" form was tied to categories, and wanted the existing ones to be selectable. I had the backlog updated first, and then the form got a category select on both create and edit. I also pointed out that the README was not empty on origin, which Claude had wrongly treated as empty because local `main` was behind, so it merged `origin/main` and updated the real file. The slice went out as commits on `feat/b-11-categories` and was merged to `main` with `--no-ff` and pushed, in a worktree because `main` was checked out elsewhere.

## 2026-09-20 — Choosing the custom feature (D-2)

**Context:** D-2, the unprompted custom feature the brief requires, was the last open decision. It gated B-12 and decided the contents of the SPA metric strip. Products, search, edit and delete were already built, and B-11 (categories) was in progress on its own branch.

**Tooling & prompts:** Claude Code on Sonnet 5, in a background session, with the `superpowers:brainstorming` skill. The prompt was "let's plan the extra feature, I want something simple. Give me options". Claude read the D-2 candidates in `docs/technical-decisions.md` and the backlog, and offered four options (low-stock alerts with metrics, CSV export, audit log, bulk operations), each with persona, cost and catch. It recommended low-stock alerts.

**What happened:** I picked A ("Go with A"). Claude then presented a short design in chat: a `GET /api/products/stats` endpoint, a `stockStatus` filter on the list endpoint, and a metric strip whose Low and Out tiles toggle that filter. I approved it with "lgmt". Claude wrote the resolution into `docs/technical-decisions.md` §7.2 and `docs/backlog.md` (D-2 resolved, B-12 scoped) on `feat/b-12-low-stock`, commit `3f68d70`, and stopped before any code. My reason for the choice: "I wanted to go with something simple and the low stocks notification builds easily in what I already developed".

## 2026-09-20 — Building the custom feature: low-stock alerts (B-12)

**Context:** D-2 was resolved earlier the same day as low-stock alerts with inventory metrics, and B-12 was scoped in `docs/backlog.md` and `docs/technical-decisions.md` before any code. B-11 (categories) had just been merged to `main`, so B-12 was the last product item left.

**Tooling & prompts:** Claude Code on Sonnet 5, in a background session in its own git worktree (`feat/b-12-low-stock`). The prompt was "go, start B-12", with no further detail, because the design had already been approved in chat and written into the docs. The work was test-first with Vitest, then a Playwright check of the running app.

**What happened:** Claude built it in three slices, each committed on its own: the shared contract (a `stockStatus` query param and a stats schema), the API (`GET /api/products/stats`, the `stockStatus` filter and the OpenAPI entries), and the web side (a stats store and the `MetricTiles` strip, whose Low and Out tiles toggle the filter). The existing OpenAPI coverage test failed until the new route was documented, which caught the omission. In the browser the tiles filtered the list, Back restored the filter, the strip refreshed after a delete, and the layout held at phone width. Claude also made creating a product clear the stock filter, so a new row can't be hidden under it, and it marked B-12 Done and wrote the README rationale.

**Reflection:** given the workflow, and with thing planned, going from a simple idea to code was quick
