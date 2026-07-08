---
description: Fetch a Grok worker's result
---
For worker $ARGUMENTS:

1. Run `node "${CLAUDE_PLUGIN_ROOT}/bin/grokctl.mjs" result $ARGUMENTS`.
2. Present the returned JSON to the user.
3. Remind: verify the result against the original task (read the diff / run tests) before accepting.
