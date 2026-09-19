---
name: ai-log
description: Use when a significant step in this repo just finished - a vertical slice or feature completed, a technical decision made or reversed, a course correction, a notable prompting technique, or an open decision resolved - and the AI-assisted workflow narrative in AI.md needs an entry. Also use when the user asks to log, record, or write up a step.
---

# Logging to AI.md

## Overview

`AI.md` is a required deliverable: a narrative of the AI-assisted workflow covering
tooling used, prompts and interaction traces, and reflections on what worked or
needed course correction (`docs/project-brief.md`, Documentation & Repository
Standards).

**The user's words are the entry. Session and project context only supply the
scaffolding around them.** An entry written entirely from what you observed is not
a record of their workflow — it is your summary of it, and it makes the deliverable
worthless.

## The Procedure

1. **Gather evidence** before asking anything, so the question is seeded rather
   than blank:
   - what just happened in this session — model and tools used, the prompt framing
     the user actually chose, files touched
   - `git log` since the last entry's date
   - the decision in `docs/technical-decisions.md` or the item in `docs/backlog.md`
     that this step serves
2. **Ask the user**, in one short message: a two-sentence summary of the step as
   you observed it, then what they want recorded — specifically anything that
   surprised them, that they pushed back on, or that they would do differently.
3. **If the user gives nothing** — declines, says skip, or answers with only "yes" /
   "looks right" — write nothing and move on. Do not infer an entry from their
   silence or their approval of your summary.
4. **Draft the entry** in the format below and show it in chat.
5. **Append on their confirmation** to the end of the `## Log` section, newest last.
   Apply their edits verbatim rather than rephrasing them.

## Entry Format

```markdown
## YYYY-MM-DD — <short step title>

**Context:** what state the project was in, and which decision or backlog item this serves.

**Tooling & prompts:** model and tools used, and the prompt framing that mattered.

**What happened:** the interaction trace — what was proposed, what was pushed back on, what changed.

**Reflection:** what worked, or what needed course correction.
```

`Context`, `Tooling & prompts` and `What happened` are required. `Reflection` may be
omitted when the step genuinely produced none — do not manufacture one.

## Which Field Comes From Where

| Field | Source |
|---|---|
| `Context` | Evidence: git history, `docs/technical-decisions.md`, `docs/backlog.md` |
| `Tooling & prompts` | Evidence: the session's actual model, tools and prompt framing |
| `What happened` | The user's input, with evidence filling in names, files and dates |
| `Reflection` | The user's input only |

Where evidence and the user's input disagree, the user's input is correct — the
evidence records what you saw, not what they intended. Where neither covers
something the format requires, ask a follow-up question; never fill the gap with a
plausible guess.

## When Not To Use

Routine edits, test reruns, formatting commits, dependency bumps, and anything the
git history already explains on its own. `AI.md` is a narrative of the workflow, not
a changelog — an entry per commit buries the steps that mattered.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Writing the entry first and asking the user to approve it | Ask first; draft from their answer |
| Treating "yes, that's right" as input | That confirms your summary, not their reflection. Ask again for what they'd record |
| Smoothing the user's wording into your own register | Paste it; the deliverable is their voice |
| Inventing a `Reflection` because the field exists | Omit it |
| Logging every commit | See When Not To Use |
| Reconstructing several steps at the end of a session | Log at the step, as agreed in `CLAUDE.md` |
