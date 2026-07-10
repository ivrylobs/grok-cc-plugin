# Collaboration backlog

Friction observed while Claude (captain) and a Grok worker actually tried to do
work together. Each entry is written **after** the friction cost something real —
a stalled worker, a wasted approval, a duplicated investigation — not from
reading the code and imagining what might go wrong.

## The rule for entries here

An entry earns its place by carrying evidence. Not "this feels awkward" but
"here is the command, here is what it returned, here is what it cost." If a
claim can be checked by running something, the entry says what to run and what
it prints today. A reviewer should be able to reproduce the problem in one
paste, and know the fix worked when the same paste behaves differently.

Entries are numbered in the order they were found. Numbering implies nothing
about priority — read `Severity`.

## Format

```
---
id: 0001
title: <one line, states the defect not the symptom>
severity: blocker | major | minor
area: policy | worker | skills | protocol | docs
found: YYYY-MM-DD
---

## What happened
## Evidence            <- runnable; shows current behaviour
## Root cause          <- file:line, the actual mechanism
## Cost                <- what this burned
## Proposed fix        <- concrete, with the trade-off named
## Not the fix         <- tempting wrong answers, and why (optional)
```

## Index

| # | Severity | Area | Title | Status |
|---|----------|------|-------|--------|
| [0001](0001-advise-blocks-chained-readonly-commands.md) | blocker | policy | `&&`-chained read-only commands force a permission prompt | fixed 0.2.0 |
| [0002](0002-advise-allowlist-missing-readonly-heads.md) | major | policy | Allow-list omits `sed -n`, `find`, `head`, `wc`, `test` | fixed 0.2.0 |
| [0003](0003-parent-agent-cannot-answer-permissions.md) | ~~blocker~~ major | protocol | Subagent delegation path can't answer permissions and deadlocks (corrected) | fixed 0.2.0 |
| [0004](0004-parked-worker-yields-no-partial-output.md) | major | worker | A parked worker returns `null`, discarding work already done | deferred (streaming) |
| [0005](0005-briefs-omit-context-the-captain-already-has.md) | major | skills | Briefs omit context the captain already gathered | open |
| [0006](0006-advise-newline-smuggles-second-command.md) | blocker | policy | A newline smuggles a second, unreviewed command past `advise` | fixed 0.2.0 |
| [0007](0007-done-discards-worker-prose.md) | major | worker | A DONE worker's prose is discarded; only fenced JSON survives | fixed 0.2.0 |
| [0008](0008-status-table-renders-utc-as-local.md) | minor | docs | Worker timestamps render as UTC but read as local time | fixed 0.2.0 |
| [0009](0009-git-diff-textconv-runs-configured-programs.md) | major | policy | Auto-allowed `git diff`/`git log -p` run repo-configured textconv/ext-diff (arbitrary code) | fixed 0.2.0 (read); documented (advise/leash) |
