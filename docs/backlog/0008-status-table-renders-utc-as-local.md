---
id: 0008
title: "Worker timestamps render as UTC but read as local time"
severity: minor
area: docs
found: 2026-07-10
---

## What happened

The `/grok:status` worker table shows `Updated 2026-07-10 13:16` for a worker
created at `13:06:37Z`. The displayed value is the stored ISO string with the `Z`
sliced off — i.e. UTC printed as though it were local. In UTC+7 (Bangkok) every
timestamp is seven hours off, with nothing marking it as UTC.

## Evidence

Stored value (correct, UTC):

```
$ grokctl status <id>    # createdAt / updatedAt
"createdAt":"2026-07-10T13:06:37.639Z"
```

Rendered table (screenshot): `2026-07-10 13:16` — no offset, no `Z`, read by the
user as local wall-clock.

## Root cause

There is no formatter anywhere. Timestamps are written correctly as UTC at every
site (`lib/store.mjs` meta `updatedAt` via `new Date().toISOString()`;
`lib/worker.mjs:128,133,139`). The rendering is left to a model:
`commands/status.md:11` says only *"Present the returned JSON to the user."* So a
model formats the table ad hoc, slices the ISO string, and drops the zone.

This is the same class as the trigger/policy lesson elsewhere in this backlog:
behaviour left to model discretion is behaviour with no contract.

## Cost

Low — cosmetic, but actively misleading for anyone reading worker age or ordering
across a timezone. "Which worker is newest" is answerable; "when did it start" is
wrong by the local offset.

## Proposed fix

Move formatting out of model discretion into `grokctl list --table`: render each
timestamp in the host's local zone with an explicit offset (e.g.
`2026-07-10 20:16 +07`), or keep UTC but label it `Z`. Then `commands/status.md`
presents the table verbatim instead of asking a model to format JSON.

## Not the fix

- **Tell the model to convert UTC to local in the prompt.** Same defect one layer
  up — depends on the model getting arithmetic and DST right every time. The CLI
  owns the clock; the prompt should not.
