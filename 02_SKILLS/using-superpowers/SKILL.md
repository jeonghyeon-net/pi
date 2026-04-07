---
name: using-superpowers
description: Use when the user asks about available skills, how to use them, or references a specific skill by name
---

<SUBAGENT-STOP>
If you were dispatched as a subagent to execute a specific task, skip this skill.
</SUBAGENT-STOP>

## When to load a skill

- The user explicitly requests it (e.g. `/skill:<name>`, "TDD로 해줘", "brainstorming 해줘")
- The task is an obvious, direct match for a skill's description

**Do not load skills speculatively.** If unsure, don't load — the user can always request one.

## When NOT to load a skill

- Simple questions, file edits, quick fixes
- "Just in case" or "might be useful" — this is speculative loading
- The task only loosely relates to a skill's topic

## How to access skills

pi injects skill names and descriptions into the system prompt. When a skill matches, use `read` to load `02_SKILLS/<skill-name>/SKILL.md` and follow it.

Users can also invoke skills explicitly via `/skill:<name>`.

## Instruction priority

1. **User's explicit instructions** (CLAUDE.md, direct requests) — highest priority
2. **Skills** — override default system behavior where they conflict
3. **Default system prompt** — lowest priority

## Skill types

**Rigid** (TDD, debugging): Follow exactly once loaded.

**Flexible** (patterns): Adapt principles to context.
