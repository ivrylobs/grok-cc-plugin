---
description: Show Grok worker status (all, or one by id)
argument-hint: '[worker-id]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Status of workers:

1. If `$ARGUMENTS` is empty: run `node "${CLAUDE_PLUGIN_ROOT}/bin/grokctl.mjs" list --table` and present the table **verbatim** in a code block. It is already formatted for a human — attention-needing workers (blocked/advising) on top, then live, then recent history under a `── recent ──` divider, with relative ages (`3m`, `2h`, `yday 20:31`). Do not re-sort, re-render ages, or add columns. The footer `+ N older … --all` is a hint the user can run `grokctl list --table --all` to see the collapsed history.
2. If `$ARGUMENTS` is a worker id: run `node "${CLAUDE_PLUGIN_ROOT}/bin/grokctl.mjs" status $ARGUMENTS` and present the returned JSON. Its `createdAt`/`updatedAt` are UTC ISO strings (suffix `Z`) — if you mention a time in prose, say so or convert it; never render `Z` UTC as if it were local.
