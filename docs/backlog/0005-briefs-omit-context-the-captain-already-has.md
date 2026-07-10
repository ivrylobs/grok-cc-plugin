---
id: 0005
title: "Briefs omit context the captain already gathered"
severity: major
area: skills
found: 2026-07-10
---

## What happened

The captain had already read four files, mapped the git history, and extracted
the receiving server's validation rules. It then handed the worker a brief that
named the four files by path and restated the rules — but did not include what
it had already *learned*.

So the worker's first three actions were: read the four files, `find` the
profile doc, and `rg` the schema for field names. Each was a permission prompt
(see [0001](0001-advise-blocks-chained-readonly-commands.md),
[0002](0002-advise-allowlist-missing-readonly-heads.md)). It was re-deriving
context the captain was sitting on.

## Evidence

The brief said:

> Files (read them):
> - .../publisher.ts
> - .../buildVisitBundle.ts
> …
> The receiving server enforces these EXTRA validation rules …

The worker's blocked commands, in order:

```
cat publisher.ts && cat ids.ts && cat buildVisitBundle.ts && sed -n '1250,1350p' video-call.ts
ls src/libs/fhir/ && (test -f PRODUCING.md && head -200 …) && wc -l …  && rg -n "birthDate|Visit Composition|…"
find … -name 'HIE_PROFILES.md' -o -name 'visit-bundle.json'; rg -n "birth|sex|idnumber" --glob '*.prisma'
```

Three round-trips, all reconstructing what the captain knew before it spawned
anything.

## Root cause

`skills/delegation-contract/SKILL.md` tells the captain to scope the task and
state constraints. It says nothing about **transferring findings**. A brief that
lists file paths reads like a research assignment; a brief that includes the
captain's notes reads like a review request. Only the second is cheap.

There is a real tension here, and it should be named: pre-loading the captain's
conclusions can bias an independent reviewer. The purpose of a second model is
to see what the first one missed. Pouring the first one's beliefs into the brief
is how you get expensive agreement.

## Proposed fix

Amend `delegation-contract` to distinguish two brief shapes, and make the
captain choose consciously:

- **Verification brief** — you want the worker to check *your* reasoning. Include
  everything: file contents inline where small, the exact error output, what you
  already ruled out. Cheap, fast, and biased toward your framing. Say so.

- **Independent brief** — you want a perspective uncontaminated by yours. Give
  the task and the files, withhold your conclusions, and **budget for the
  exploration** you just forced it to do. Expensive by design.

The failure above was reaching for an independent brief and then resenting the
exploration it necessarily entails.

Concretely, add to the skill:

> State which you are writing. If verification: paste the evidence, do not make
> the worker re-derive it. If independent: expect exploration, and pre-authorize
> the reads it implies rather than treating each one as a surprise.

## Not the fix

- **Always inline everything.** Turns every second opinion into an echo of the
  first. The bias is subtle and the captain will not notice it agreeing with
  itself.
- **Always withhold.** Makes verification tasks — the common case — pay a full
  exploration cost for nothing.
