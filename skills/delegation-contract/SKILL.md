---
name: delegation-contract
description: How to write briefs for Grok workers - task framing, STATUS protocol, model routing. Use whenever composing a /grok:work task or any grokctl spawn.
---
# Writing Grok worker briefs

- One task, one worker. Scope so DONE is objectively checkable.
- State constraints explicitly (files not to touch, no pushes, stdlib only). Grok respects narrow prompts and stops; it expands vague ones.
- The broker wraps your task in the STATUS protocol automatically; do not restate it, but DO define what DONE means for this task.
- Give file paths, not descriptions. Give the verification command you will run.
- Model routing: mechanical/spec-clamped work -> `--model grok-composer-2.5-fast`; ambiguous debugging, cross-repo tracing, refactors -> default grok-4.5 (`--effort low|medium|high`).
- Untrusted or production tree -> `--grip gate` (writes staged until approve-stage). Trusted mechanical -> `--grip leash`. Default `advise`.
- Known trap: Grok misreports its own API/capabilities. Never let a worker's claims about grok internals into a design without a live probe.
