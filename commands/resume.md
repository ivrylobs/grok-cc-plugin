---
description: Resume a dead Grok worker (memory preserved)
---
Resume worker $ARGUMENTS:

1. Run `node "${CLAUDE_PLUGIN_ROOT}/bin/grokctl.mjs" resume $ARGUMENTS`.
2. Present the returned JSON to the user.
3. Memory is preserved via session load — re-arm `node "${CLAUDE_PLUGIN_ROOT}/bin/grokctl.mjs" wait $ARGUMENTS --timeout 570` as a background task if the worker is running again.
