---
description: Fork a Grok worker session
argument-hint: '<worker-id>'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---
Fork worker $ARGUMENTS:

1. Run `node "${CLAUDE_PLUGIN_ROOT}/bin/grokctl.mjs" fork $ARGUMENTS`.
2. Present the returned JSON to the user.

**v0.1.0 limitation:** fork is not yet wired — the `_x.ai/session/fork` params are unmapped, so this command returns a clear error even when the probe reports fork support. To branch manually, spawn a new worker on the same session: `grokctl spawn --session <sessionId> ...`.
