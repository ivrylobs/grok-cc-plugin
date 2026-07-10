---
id: 0004
title: "A parked worker returns `null`, discarding work already done"
severity: major
area: worker
found: 2026-07-10
---

## What happened

A worker was approved three times, and between approvals it read four source
files. It then parked on a fourth permission prompt.

Asked what it had found so far, `grokctl result <id>` returned `null`. The
worker had emitted no assistant text — only three sequential permission entries
in its inbox. Everything it had read was locked inside a turn that never
completed.

The human had spent three approvals and could not see a single finding.

## Evidence

While the worker sat in `advising`:

```
$ grokctl result wmreuxlo4-xath
null
```

with `status: "running"` after each approval, `inbox` containing only
`{type: "permission"}` items, and no partial assistant message anywhere.

## Root cause

A Grok turn is atomic from the plugin's point of view. Tool calls stream, but
the model's prose is delivered when the turn ends. A worker that is repeatedly
suspended mid-turn never ends a turn, so it never emits text — even though it
has, by then, read everything it needs and formed most of its answer.

`result` reads the last completed turn. With no completed turn, it is `null`.
Correct, and useless.

## Cost

Three human approvals bought zero information. Worse, the failure is
indistinguishable from "the worker is thinking" — there is no way to tell a
worker that has learned a lot and cannot speak from one that has done nothing.
The captain abandoned the delegation partly because it could not tell which it
was facing.

## Proposed fix

Persist assistant text as it streams, not at turn boundaries. Then:

- `grokctl result <id>` on a parked worker returns whatever prose exists so far,
  clearly marked partial (`{ partial: true, text: … }`).
- `grokctl status <id>` reports `turns_completed` alongside `status`, so a
  caller can distinguish "parked with findings" from "parked with nothing."

If the ACP transport does not stream assistant deltas, the cheaper approximation
is a `notes` sink: instruct workers (via `delegation-contract`) to write findings
incrementally to a scratch file, and have `result` fall back to that file when
the last turn is incomplete. Weaker, because it depends on the worker complying.

## Not the fix

- **Longer permission timeouts.** The worker is not timing out; it is silent by
  construction.
- **Have the captain read the worker's JSONL transcript.** The transcript is the
  full tool-call log; reading it into the captain's context is exactly the cost
  delegation was supposed to avoid, and the harness warns against it.
