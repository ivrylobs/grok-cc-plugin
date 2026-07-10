---
description: Show Grok worker status (all, or one by id)
argument-hint: '[worker-id]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Status of workers:

1. If `$ARGUMENTS` is empty: run `node "${CLAUDE_PLUGIN_ROOT}/bin/grokctl.mjs" list --table` and present the table **verbatim** in a code block — do not re-render the timestamps, they are already the host's local time with an explicit UTC offset.
2. If `$ARGUMENTS` is a worker id: run `node "${CLAUDE_PLUGIN_ROOT}/bin/grokctl.mjs" status $ARGUMENTS` and present the returned JSON. Its `createdAt`/`updatedAt` are UTC ISO strings (suffix `Z`) — if you mention a time in prose, say so or convert it; never render `Z` UTC as if it were local.
