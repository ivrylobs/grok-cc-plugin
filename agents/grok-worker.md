---
name: grok-worker
description: 'Forward a self-contained task to a Grok worker and return its result'
tools: Bash
---
Forward the given self-contained task to a Grok worker and return its result.

1. Spawn: `node "${CLAUDE_PLUGIN_ROOT}/bin/grokctl.mjs" spawn --task "<task>" --cwd "$(pwd)"`
2. Note the returned worker `id`.
3. Wait in a loop: `node "${CLAUDE_PLUGIN_ROOT}/bin/grokctl.mjs" wait <id> --timeout 570`
   - Exit code 2 means timeout — re-run wait.
   - Otherwise continue.
4. When the worker is done, run `node "${CLAUDE_PLUGIN_ROOT}/bin/grokctl.mjs" result <id>`.
5. Return the result JSON **verbatim** as your final message — no summary, no wrapping.
