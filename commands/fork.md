---
description: Fork a Grok worker session
---
Fork worker $ARGUMENTS:

1. Run `node "${CLAUDE_PLUGIN_ROOT}/bin/grokctl.mjs" fork $ARGUMENTS`.
2. Present the returned JSON to the user.
3. Note: this errors on Grok versions that do not support `_x.ai/session/fork`.
