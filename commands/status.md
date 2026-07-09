---
description: Show Grok worker status (all, or one by id)
argument-hint: '[worker-id]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Status of workers:

1. If `$ARGUMENTS` is empty: run `node "${CLAUDE_PLUGIN_ROOT}/bin/grokctl.mjs" list`.
2. If `$ARGUMENTS` is a worker id: run `node "${CLAUDE_PLUGIN_ROOT}/bin/grokctl.mjs" status $ARGUMENTS`.
3. Present the returned JSON to the user.
