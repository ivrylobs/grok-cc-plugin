---
description: Delegate a task to a veto-gated Grok worker
---
Delegate the task in $ARGUMENTS to a Grok worker:

1. Run: `node "${CLAUDE_PLUGIN_ROOT}/bin/grokctl.mjs" spawn --task "$ARGUMENTS" --cwd "$(pwd)"`
2. Show the user the returned worker `id` and `status`.
3. Immediately run `node "${CLAUDE_PLUGIN_ROOT}/bin/grokctl.mjs" wait <id> --timeout 570` **as a background Bash task** so its exit wakes you.
4. On wake, follow the grok:advisory-loop skill: drain the inbox before anything else.

Grip control: append `--grip gate|advise|leash` to spawn if the user asked for tighter/looser control.

Model / effort: append `--model <id>` and/or `--effort low|medium|high` to override the configured default for this one worker (see `/grok:config` and the grok:delegation-contract skill). `--model grok-composer-2.5-fast` for cheap mechanical work; default `grok-4.5` for hard problems.
