---
id: 0007
title: "A DONE worker's prose is discarded; only the fenced JSON survives"
severity: major
area: worker
found: 2026-07-10
---

## What happened

A worker was asked for an independent design review — several sections of
argument. It completed cleanly (`STATUS: DONE`). `grokctl result` returned a
~40-word summary object. The entire reasoning — the case it built, the evidence
it cited — was gone.

The value of a second opinion is the argument, not the verdict. A captain cannot
audit reasoning it never receives.

## Evidence

```
$ grokctl result wmrey98lj-cmsf
{"summary":"Independent design review ... ranked policy fix, partial results,
and subagent advisory gap as top 3; filed unlogged advise newline shell bypass
...","files_changed":[],"verification":"Read ... ran node decideToolCall probes"}
```

The worker's three written sections never appear. Compare with the same session's
competitive research, which survived **only** because that worker was told to
write its output to a file — luck, not design.

## Root cause

`lib/contract.mjs:17-28`: on `STATUS: DONE`, `parseStatus` extracts the last
` ```json ` fence and returns it as `result`. The surrounding prose is captured
into `raw` (`:7,23,28`) — and `raw` is then dropped. Turn end stores only
`parsed.result` (`lib/worker.mjs:253-254`), and `grokctl result` returns only that
(`lib/worker.mjs:405-407`).

So a worker that follows the protocol (fenced RESULT JSON + prose) has its prose
deleted at the parse boundary. The more disciplined the worker, the more is lost.

## Cost

An entire independent review reduced to its own abstract. In a session whose
premise was "get a second opinion before committing to a design," the second
opinion arrived unreadable. This directly blocks the collaboration model: every
Grok critique reaches the captain stripped to a headline.

Distinct from [0004](0004-parked-worker-yields-no-partial-output.md): that entry
is a *parked* worker returning `null`. This is a *completed* worker discarding
content it successfully produced.

## Proposed fix

Persist `raw` alongside `result`:

- `lib/worker.mjs` turn-end: store `parsed.raw` on the `done` inbox item and meta.
- `grokctl result <id>`: return `{ result, prose }` (or `raw` when no fence
  parsed), so the captain sees the argument, not only the JSON.

Small change (contract already computes `raw`; it is thrown away). Ordering: this
should land early in 0.2.0 — until it does, every Grok review used to build the
release is itself truncated.

## Not the fix

- **Tell workers to put everything in the JSON.** Prose in a JSON string field is
  unreadable and re-encodes the problem; the fix is to stop discarding the text
  the worker already emits.
- **Have the captain read the worker's JSONL transcript.** That reloads the full
  tool-call log into the captain's context — the cost delegation exists to avoid.
