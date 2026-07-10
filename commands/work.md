---
description: Delegate a task to a veto-gated Grok worker
argument-hint: '[--grip read|gate|advise|leash] [--model <id>] [--effort low|medium|high] <task>'
allowed-tools: Bash(node:*)
---
Delegate a task to a Grok worker. $ARGUMENTS is: optional flags, then the task text.

1. Split $ARGUMENTS: pull out any leading `--grip read|gate|advise|leash`, `--model <id>`, `--effort low|medium|high`. Everything **remaining** is the task text — never pass flags inside `--task`.
2. Run, forwarding only the flags that were given:
   `node "${CLAUDE_PLUGIN_ROOT}/bin/grokctl.mjs" spawn --task "<task text>" --cwd "$(pwd)" [--grip <g>] [--model <m>] [--effort <e>]`
3. Show the user the returned worker `id`, `status`, and (if set) `model`/`effort`. If the result contains an `applied` field with `false`, warn that grok rejected that choice.
4. Immediately run `node "${CLAUDE_PLUGIN_ROOT}/bin/grokctl.mjs" wait <id> --timeout 570` **as a background Bash task** so its exit wakes you.
5. On wake, follow the grok:advisory-loop skill: drain the inbox before anything else.

Grips, least to most trusted write access: `read` (no mediated writes at all — reads + read-only shell only, for a second opinion or audit that must not touch the tree), `gate` (writes stage until you `approve-stage`), `advise` (in-tree writes auto-allowed, risky shell asks), `leash` (auto-allow except a deny-list — trusted mechanical work only). `read` is a subprocess boundary, not a sandbox: an allow-listed `git status`/`git diff` can still touch `.git/index.lock`; it means "no mediated file writes + no free-form shell," not "no subprocess touches disk."

Defaults when a flag is omitted: grip `advise`; model/effort from `/grok:config`, then env, then grok's default. `--model grok-composer-2.5-fast` for cheap mechanical work; `grok-4.5` for hard problems. See the grok:delegation-contract skill for brief-writing and routing.
