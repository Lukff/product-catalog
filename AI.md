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
