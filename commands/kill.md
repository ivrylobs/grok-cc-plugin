---
description: Kill a Grok worker
argument-hint: '<worker-id>'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Kill worker $ARGUMENTS:

1. Run `node "${CLAUDE_PLUGIN_ROOT}/bin/grokctl.mjs" kill $ARGUMENTS`.
2. Present the returned JSON to the user.
