---
name: delegation-contract
description: How to write briefs for Grok workers - task framing, STATUS protocol, model routing. Use whenever composing a /grok:work task or any grokctl spawn.
---
# Writing Grok worker briefs

- One task, one worker. Scope so DONE is objectively checkable.
- State constraints explicitly (files not to touch, no pushes, stdlib only). Grok respects narrow prompts and stops; it expands vague ones.
- The broker wraps your task in the STATUS protocol automatically; do not restate it, but DO define what DONE means for this task.
- Give file paths, not descriptions. Give the verification command you will run.
- Model routing: mechanical/spec-clamped work -> `--model grok-composer-2.5-fast`; ambiguous debugging, cross-repo tracing, refactors -> `grok-4.5` with `--effort low|medium|high`. Per-spawn flags beat env (`GROK_CC_MODEL`/`GROK_CC_EFFORT`) which beat `/grok:config` defaults which beat grok's default. Check valid ids with `grokctl models`; never invent a model id.
- A rejected model/effort posts an inbox `error` — if you see one, the worker is NOT on the model you asked for. Kill and respawn rather than accepting silently.
- Untrusted or production tree -> `--grip gate` (writes staged until approve-stage). Trusted mechanical -> `--grip leash`. Default `advise`.
- Known trap: Grok misreports its own API/capabilities. Never let a worker's claims about grok internals into a design without a live probe.
